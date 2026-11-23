import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, delimiter, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  javaProcessEnvironment,
  javaToolchainSelection,
  observeSelectedJavaJdk,
} from "../../scripts/java-toolchain.mjs";
import { readNativeComparisonResult, sha256 } from "./comparison-evidence.mjs";
import {
  fetchPinnedBytes,
  publishPinnedBytes,
  verifyPinnedFile,
} from "./comparison-fixtures.mjs";
import {
  compileOntologyReferenceOracles,
  resolvePinnedReferenceEnvironment,
} from "./run-import-closure-contract.mjs";
import { validateReleasedOracle } from "./validate-released-oracle.mjs";

const profiles = new URL(
  "../../docs/compatibility/profiles/java-owlapi-5.5.1/",
  import.meta.url,
);
export const oracleVersion = "5.5.1.2024-09-07T21:41:32Z";
export const oracleLockPath = new URL("java-dependencies.lock.json", profiles);
const mavenCentral = "https://repo.maven.apache.org/maven2/";
const sourceFile = (name) => fileURLToPath(new URL(name, import.meta.url));
const oracleSources = [
  "OntologyReferenceContract.java",
  "OntologyStructuralComparison.java",
  "RunOntologyComparisonCase.java",
].map(sourceFile);
const referencePin = new URL("./pinned-version.json", import.meta.url);

export function pinnedSourceOracle() {
  const { sourceRevision, owlapiVersionLine } = JSON.parse(
    readFileSync(referencePin, "utf8"),
  );
  return {
    kind: "pinned-source",
    revision: sourceRevision,
    version: owlapiVersionLine,
  };
}

/** Record the exact ordered JAR bytes admitted under the historical source pin. */
export async function admitPinnedSourceClasspath(sourceCheckoutPath) {
  const reference = await resolvePinnedReferenceEnvironment({
    sourceCheckoutPath,
  });
  const bytes = await readFile(reference.classpathFile);
  const entries = bytes.toString("utf8").trim().split(delimiter);
  const digests = [];
  for (const path of entries) {
    if (!isAbsolute(path) || /[\r\n]/u.test(path) || !path.endsWith(".jar")) {
      throw new Error("Pinned source oracle has an invalid classpath entry");
    }
    const jar = await readFile(path);
    digests.push({
      file: basename(path),
      byteLength: jar.length,
      sha256: sha256(jar),
    });
  }
  return {
    jars: entries,
    identity: {
      kind: "pinned-source",
      revision: reference.pinnedRevision,
      version: reference.owlapiVersion,
      classpathSha256: sha256(bytes),
      jars: digests,
    },
  };
}

/** Admit only the exact ordered runtime closure of released Java OWLAPI. */
export async function admitReleasedClasspath(environment, prepare = false) {
  validateReleasedOracle();
  const lockBytes = await readFile(oracleLockPath);
  const { artifacts, orderedExecutionClasspath } = JSON.parse(lockBytes);
  const pins = new Map(
    artifacts.map((artifact) => [artifact.repositoryPath, artifact]),
  );
  const explicit =
    environment.classpathFile === undefined
      ? null
      : (await readFile(environment.classpathFile, "utf8"))
          .trim()
          .split(delimiter);
  if (explicit && explicit.length !== orderedExecutionClasspath.length) {
    throw new Error(
      "Released Java classpath differs in length from the ordered lock",
    );
  }
  const mavenDirectory =
    environment.mavenDirectory ??
    (environment.cacheDirectory && join(environment.cacheDirectory, "maven"));
  if (!explicit && !isAbsolute(mavenDirectory ?? "")) {
    throw new Error("An absolute Maven artifact directory is required");
  }
  const jars = [];
  const identity = [];
  for (const [index, repositoryPath] of orderedExecutionClasspath.entries()) {
    const artifact = pins.get(repositoryPath);
    if (
      !artifact ||
      artifact.artifactType !== "jar" ||
      repositoryPath
        .split("/")
        .some(
          (part) =>
            !/^[A-Za-z0-9_.-]+$/u.test(part) || part === ".." || part === ".",
        )
    ) {
      throw new Error("Invalid runtime JAR in the released Java lock");
    }
    const path = explicit
      ? explicit[index]
      : join(mavenDirectory, repositoryPath);
    if (!isAbsolute(path) || path.includes(delimiter) || /[\r\n]/u.test(path)) {
      throw new Error("Invalid absolute Java classpath entry");
    }
    const pin = {
      id: repositoryPath,
      byteLength: artifact.byteLength,
      sha256: artifact.sha256,
    };
    if (prepare && !explicit) {
      await publishPinnedBytes(path, pin, () =>
        fetchPinnedBytes(
          { url: mavenCentral + repositoryPath, redirects: [] },
          { fetchImpl: environment.fetchImpl },
        ),
      );
    } else if (!(await verifyPinnedFile(path, pin))) {
      throw new Error(`Missing verified Java runtime JAR: ${repositoryPath}`);
    }
    jars.push(path);
    identity.push({
      repositoryPath,
      byteLength: pin.byteLength,
      sha256: pin.sha256,
    });
  }
  return {
    jars,
    identity: {
      version: oracleVersion,
      lockSha256: sha256(lockBytes),
      jars: identity,
    },
  };
}

export function executeComparisonProcess(file, args, options) {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        windowsHide: true,
        encoding: "utf8",
        maxBuffer: 1024 * 1024,
        ...options,
      },
      (error, stdout, stderr) => {
        if (error && !Number.isInteger(error.code)) {
          reject(
            new Error(`Worker process failed: ${error.message}`, {
              cause: error,
            }),
          );
          return;
        }
        resolve({ exitCode: error?.code ?? 0, stdout, stderr });
      },
    );
  });
}

/** Resolve the selected tools and sanitized child environment for both oracle paths. */
export function comparisonJavaTools(environment, directory) {
  const heapMiB = environment.javaHeapMiB;
  if (
    heapMiB !== undefined &&
    (!Number.isSafeInteger(heapMiB) ||
      heapMiB < 64 ||
      (environment.memoryBudgetMiB && heapMiB >= environment.memoryBudgetMiB))
  ) {
    throw new Error("Java heap must fit within the selected comparison job");
  }
  const selection =
    environment.javaSelection === undefined
      ? undefined
      : javaToolchainSelection(environment.javaSelection);
  const jdk = observeSelectedJavaJdk(environment.javaHome, selection);
  const timeout = environment.timeoutMs ?? 120_000;
  // The maintained launcher invokes javac by name on Windows. Give that child the
  // same exact JDK resolved above instead of the caller's ambient JRE.
  const env = javaProcessEnvironment();
  const originalPathKey =
    Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  env[originalPathKey] =
    `${join(environment.javaHome, "bin")}${delimiter}${env[originalPathKey] ?? ""}`;
  const executeProcess = (program, args) => {
    const executable = program === "javac" ? jdk.javacPath : jdk.javaPath;
    const prefix = program === "javac" ? "-J" : "";
    return executeComparisonProcess(
      executable,
      [
        `${prefix}-Djava.io.tmpdir=${directory}`,
        `${prefix}-XX:ErrorFile=${join(directory, "hs_err_pid%p.log")}`,
        ...args,
      ],
      {
        cwd: directory,
        env,
        timeout,
      },
    );
  };
  return { jdk, selection, env, timeout, heapMiB, executeProcess };
}

export async function compileComparisonOracle(
  environment,
  directory,
  classpath,
) {
  const { jdk, env, timeout, heapMiB, executeProcess } = comparisonJavaTools(
    environment,
    directory,
  );
  const classpathFile = join(directory, "locked-java-classpath");
  await writeFile(classpathFile, classpath.jars.join(delimiter), {
    flag: "wx",
  });
  const { compiledOracleDirectory } = await compileOntologyReferenceOracles(
    {
      launcherSource: sourceFile("RunWithClasspath.java"),
      classpathFile,
      oracleSources,
    },
    join(directory, "java-classes"),
    { executeProcess },
  );
  const harnessDigests = await Promise.all(
    [...oracleSources, sourceFile("RunWithClasspath.java")].map(async (item) =>
      sha256(await readFile(item)),
    ),
  );
  const invocation = async (request, caseDirectory, name) => {
    const requestPath = join(caseDirectory, `${name}-request.json`);
    const resultPath = join(caseDirectory, `${name}-result.pending`);
    const argumentFile = join(caseDirectory, `${name}-java.args`);
    await writeFile(requestPath, JSON.stringify(request), { flag: "wx" });
    const arguments_ = [
      `-Djava.io.tmpdir=${directory}`,
      `-XX:ErrorFile=${join(caseDirectory, "hs_err_pid%p.log")}`,
      ...(heapMiB === undefined ? [] : [`-Xmx${heapMiB}m`]),
      "-Djavax.xml.accessExternalDTD=",
      "-Djavax.xml.accessExternalSchema=",
      ...(request.javaXml === "historical-idmp"
        ? [
            "-Djdk.xml.entityExpansionLimit=64000",
            "-Djdk.xml.totalEntitySizeLimit=50000000",
            "-Djdk.xml.maxGeneralEntitySizeLimit=0",
            "-Djdk.xml.maxParameterEntitySizeLimit=1000000",
          ]
        : []),
      "-cp",
      [compiledOracleDirectory, ...classpath.jars].join(delimiter),
      "RunOntologyComparisonCase",
      requestPath,
      resultPath,
    ];
    // Use the Java launcher's argument-file syntax to avoid the Windows
    // command-line limit and keep the observed PID tied to the actual JVM.
    const quote = (value) =>
      '"' + value.replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"';
    await writeFile(argumentFile, arguments_.map(quote).join("\n"), {
      flag: "wx",
    });
    return {
      file: jdk.javaPath,
      args: ["@" + argumentFile],
      options: { cwd: directory, env, timeout },
      resultPath,
    };
  };
  return {
    identity: { ...classpath.identity, jdk: jdk.identity, harnessDigests },
    performanceWorker: invocation,
    async run(request, caseDirectory) {
      const worker = await invocation(request, caseDirectory, "native");
      const process = await executeComparisonProcess(
        worker.file,
        worker.args,
        worker.options,
      );
      try {
        const admitted = await readNativeComparisonResult({
          caseId: request.caseId,
          resultPath: worker.resultPath,
          stdout: process.stdout,
          exitCode: process.exitCode,
          maxResultBytes: environment.maxResultBytes ?? 128 * 1024 * 1024,
        });
        return { ...admitted, stderr: process.stderr };
      } catch (error) {
        if (process.stderr) {
          await writeFile(
            join(caseDirectory, "native-failed-stderr.log"),
            process.stderr,
            { flag: "wx" },
          );
        }
        throw error;
      }
    },
  };
}
