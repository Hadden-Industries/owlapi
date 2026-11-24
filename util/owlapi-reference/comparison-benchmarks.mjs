import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import {
  BEHAVIOR_PROFILES,
  BENCHMARK_DEFINITIONS,
  DEFAULT_JAVA_BASELINE_PATH,
  loadJavaBaseline,
  prepareSharedFixtureDirectory,
  runJavaBenchmarks,
  runJsProfileBenchmarks,
} from "../benchmark-owlapi-java-parity.mjs";
import {
  javaToolchainSelection,
  observeSelectedJavaJdk,
} from "../../scripts/java-toolchain.mjs";
import {
  comparisonIdentity,
  publishComparisonJson,
  sha256,
} from "./comparison-evidence.mjs";
import { admitReleasedClasspath, oracleVersion } from "./comparison-oracle.mjs";
import { verifyBenchmarkApiSemantics } from "../verify-benchmark-api-semantics.mjs";
import { verifyBenchmarkIoSemantics } from "../verify-benchmark-io-semantics.mjs";

const apiSemanticsHarness = new URL(
  "./VerifyBenchmarkApiSemantics.java",
  import.meta.url,
);
const apiSemanticsSink = new URL(
  "../verify-benchmark-api-semantics.mjs",
  import.meta.url,
);
const fixtureGenerator = new URL(
  "../generate-owlapi-benchmark-fixtures.cjs",
  import.meta.url,
);
const priorIoObservation = new URL(
  "../../docs/performance/qualification-rc3/io-semantics.json",
  import.meta.url,
);

export async function runBenchmarkIoComparison(request, environment) {
  const original = JSON.parse(await readFile(priorIoObservation, "utf8"));
  const ids = Object.keys(original.observations).sort();
  const cases = ids.map((input) => ({
    input,
    caseId: comparisonIdentity({ scenario: "io-admission", version: 1, input }),
  }));
  if (request.action === "list") return { schemaVersion: 1, cases };
  if (
    request.action !== "run" ||
    !isAbsolute(environment.outputDirectory ?? "") ||
    request.input ||
    request.profile
  ) {
    throw new Error(
      "The I/O semantic suite requires the complete observation set and an absolute output directory",
    );
  }
  await mkdir(environment.outputDirectory);
  const classpath = await admitReleasedClasspath(environment);
  const classpathFile = join(
    environment.outputDirectory,
    "locked-java-classpath",
  );
  await writeFile(classpathFile, classpath.jars.join(delimiter), {
    flag: "wx",
  });
  const result = await verifyBenchmarkIoSemantics({
    classpathFile,
    javaHome: environment.javaHome,
    javaSelection: environment.javaSelection,
    javaBuildCacheDirectory:
      environment.javaBuildCacheDirectory ??
      (environment.cacheDirectory
        ? join(environment.cacheDirectory, "java-helper-builds")
        : undefined),
  });
  if (
    comparisonIdentity(Object.keys(result.observations).sort()) !==
    comparisonIdentity(ids)
  ) {
    throw new Error("The Java/JS I/O observation roster changed");
  }
  const report = {
    schemaVersion: 1,
    action: "run",
    scenario: "io-admission",
    evidence: result,
    cases: cases.map((entry) => ({
      ...entry,
      status:
        result.observations[entry.input].structuralSha256 ===
        original.observations[entry.input].structuralSha256
          ? "passed"
          : "failed",
    })),
  };
  await publishComparisonJson(
    environment.outputDirectory,
    "io-semantics.json",
    report,
  );
  return report;
}

export function apiSemanticsComparisonCases(
  request,
  { syntaxCount = 100, importClosureCount = 8 } = {},
) {
  const inputs = request.input ? [request.input].flat() : null;
  const definitions = inputs
    ? inputs.map((id) => {
        const definition = BENCHMARK_DEFINITIONS.find((item) => item.id === id);
        if (!definition) {
          throw new Error(`Unknown benchmark workload: ${id}`);
        }
        return definition;
      })
    : BENCHMARK_DEFINITIONS;
  if (definitions.length === 0) {
    throw new Error("At least one benchmark workload is required");
  }
  if (new Set(definitions).size !== definitions.length) {
    throw new Error("Duplicate benchmark workload");
  }
  if (request.profile && !BEHAVIOR_PROFILES.includes(request.profile)) {
    throw new Error("Unknown benchmark behavior profile");
  }
  const profiles = request.profile ? [request.profile] : BEHAVIOR_PROFILES;
  return definitions.flatMap((workload) =>
    profiles.map((behaviorProfileId) => {
      const definition = {
        schemaVersion: 1,
        scenario: "api-semantics",
        scenarioVersion: 1,
        input: workload.id,
        behaviorProfileId,
        syntaxCount,
        importClosureCount,
      };
      return { caseId: comparisonIdentity(definition), definition, workload };
    }),
  );
}

/** Run or verify the untimed 70-group canonical structural AST equivalence witness suite. */
export async function runBenchmarkApiSemanticsComparison(request, environment) {
  const entries = apiSemanticsComparisonCases(
    request,
    environment.benchmarkParameters,
  );
  const definitions = entries.map(({ caseId, definition }) => ({
    caseId,
    ...definition,
  }));
  if (request.action === "list") {
    return { schemaVersion: 1, cases: definitions };
  }
  const output = environment.outputDirectory;
  if (!isAbsolute(output ?? "")) {
    throw new Error("An absolute api-semantics output directory is required");
  }
  if (request.action === "verify") {
    const report = JSON.parse(
      await readFile(join(output, "api-semantics.json"), "utf8"),
    );
    const [
      expectedHarnessSha256,
      expectedSinkSha256,
      expectedFixtureGeneratorSha256,
    ] = await Promise.all([
      readFile(apiSemanticsHarness).then(sha256),
      readFile(apiSemanticsSink).then(sha256),
      readFile(fixtureGenerator).then(sha256),
    ]);
    if (
      report.schemaVersion !== 1 ||
      comparisonIdentity(report.definitions) !==
        comparisonIdentity(definitions) ||
      report.evidence?.harnessSha256 !== expectedHarnessSha256 ||
      report.evidence?.sinkSha256 !== expectedSinkSha256 ||
      report.evidence?.fixtureGeneratorSha256 !==
        expectedFixtureGeneratorSha256 ||
      report.evidence?.summary?.failed !== 0 ||
      report.evidence?.summary?.totalRows !== definitions.length ||
      !Array.isArray(report.cases) ||
      report.cases.length !== definitions.length ||
      report.cases.some(
        (row, index) =>
          row.caseId !== definitions[index].caseId ||
          !["passed", "observed"].includes(row.status),
      )
    ) {
      throw new Error(
        "API semantic evidence does not pass for all requested workloads and profiles",
      );
    }
    return report;
  }
  if (request.action !== "run") {
    throw new Error("The api-semantics suite supports list, run and verify");
  }
  await mkdir(output, { recursive: true });
  const classpath = await admitReleasedClasspath(environment);
  const classpathFile = join(output, "locked-java-classpath");
  await writeFile(classpathFile, classpath.jars.join(delimiter), {
    flag: "wx",
  });
  const filterIds = [...new Set(entries.map(({ workload }) => workload.id))];
  const { syntaxCount, importClosureCount } = definitions[0];
  const result = await verifyBenchmarkApiSemantics({
    classpathFile,
    javaHome: environment.javaHome,
    javaSelection: environment.javaSelection,
    javaBuildCacheDirectory:
      environment.javaBuildCacheDirectory ??
      (environment.cacheDirectory
        ? join(environment.cacheDirectory, "java-helper-builds")
        : undefined),
    syntaxCount,
    importClosureCount,
    filterIds,
  });
  const byKey = new Map(
    result.rows.map((row) => [`${row.groupId}::${row.behaviorProfileId}`, row]),
  );
  const cases = entries.map(({ caseId, definition }) => {
    const row = byKey.get(
      `${definition.input}::${definition.behaviorProfileId}`,
    );
    if (!row) {
      throw new Error(
        `Missing API semantic witness row for ${definition.input} (${definition.behaviorProfileId})`,
      );
    }
    return {
      caseId,
      ...row,
    };
  });
  const report = {
    schemaVersion: 1,
    action: "run",
    scenario: "api-semantics",
    definitions,
    evidence: result,
    cases,
  };
  await publishComparisonJson(output, "api-semantics.json", report);
  return report;
}

export function benchmarkComparisonCases(
  request,
  {
    syntaxCount = 100,
    importClosureCount = 8,
    warmupCount = 2,
    runCount = 5,
  } = {},
) {
  const inputs = request.input ? [request.input].flat() : null;
  const definitions = inputs
    ? inputs.map((id) => {
        const definition = BENCHMARK_DEFINITIONS.find((item) => item.id === id);
        if (!definition) throw new Error(`Unknown benchmark workload: ${id}`);
        return definition;
      })
    : BENCHMARK_DEFINITIONS;
  if (new Set(definitions).size !== definitions.length)
    throw new Error("Duplicate benchmark workload");
  if (request.profile && !BEHAVIOR_PROFILES.includes(request.profile)) {
    throw new Error("Unknown benchmark behavior profile");
  }
  const profiles = request.profile ? [request.profile] : BEHAVIOR_PROFILES;
  return definitions.flatMap((workload) =>
    profiles.map((behaviorProfileId) => {
      const definition = {
        schemaVersion: 1,
        scenario: "api-benchmarks",
        scenarioVersion: 1,
        input: workload.id,
        behaviorProfileId,
        syntaxCount,
        importClosureCount,
        warmupCount,
        runCount,
      };
      return { caseId: comparisonIdentity(definition), definition, workload };
    }),
  );
}

/** Use the existing independently maintained workload implementations in the case registry. */
export async function runBenchmarkComparison(request, environment) {
  const entries = benchmarkComparisonCases(
    request,
    environment.benchmarkParameters,
  );
  const definitions = entries.map(({ caseId, definition }) => ({
    caseId,
    ...definition,
  }));
  if (request.action === "list")
    return { schemaVersion: 1, cases: definitions };
  const output = environment.outputDirectory;
  if (!isAbsolute(output ?? ""))
    throw new Error("An absolute benchmark output directory is required");
  if (request.action === "verify") {
    const report = JSON.parse(
      await readFile(join(output, "benchmarks.json"), "utf8"),
    );
    if (
      report.schemaVersion !== 1 ||
      comparisonIdentity(report.definitions) !==
        comparisonIdentity(definitions) ||
      report.cases.length !== definitions.length ||
      report.cases.some(
        (row, index) =>
          row.caseId !== definitions[index].caseId ||
          row.status !== "diagnostic-only" ||
          !row.java ||
          !row.js ||
          !row.reason,
      )
    ) {
      throw new Error(
        "Benchmark evidence does not cover the requested workloads and profiles",
      );
    }
    return report;
  }
  if (
    request.action !== "run" ||
    request.measurements?.some((measurement) => measurement !== "performance")
  ) {
    throw new Error("The API workload suite records performance observations");
  }
  const { warmupCount, runCount, syntaxCount, importClosureCount } =
    definitions[0];
  if (
    ![warmupCount, runCount, syntaxCount, importClosureCount].every(
      Number.isSafeInteger,
    ) ||
    warmupCount < 0 ||
    runCount < 1 ||
    syntaxCount < 1 ||
    importClosureCount < 1
  ) {
    throw new Error("Invalid benchmark measurement or fixture parameters");
  }
  const mode = environment.benchmarkMode ?? "frozen";
  if (!["frozen", "live"].includes(mode))
    throw new Error("Unknown Java benchmark basis");
  await mkdir(output);
  const filterIds = [...new Set(entries.map(({ workload }) => workload.id))];
  const sharedFixtures = prepareSharedFixtureDirectory({
    syntaxCount,
    importClosureCount,
  });
  try {
    let javaSuite;
    let javaBasis;
    if (mode === "frozen") {
      javaSuite = loadJavaBaseline();
      javaBasis = {
        kind: "historical-baseline",
        digest: sha256(await readFile(DEFAULT_JAVA_BASELINE_PATH)),
        runtime: javaSuite.javaVersion,
        owlapiVersion: javaSuite.owlapiVersion,
      };
    } else {
      const classpath = await admitReleasedClasspath(environment);
      const selection =
        environment.javaSelection === undefined
          ? undefined
          : javaToolchainSelection(environment.javaSelection);
      const jdk = observeSelectedJavaJdk(environment.javaHome, selection);
      javaSuite = runJavaBenchmarks({
        filterIds,
        warmupCount,
        runCount,
        sharedFixtures,
        classpath: classpath.jars.join(delimiter),
        java: jdk.javaPath,
      });
      if (javaSuite.owlapiVersion !== oracleVersion)
        throw new Error("Wrong live Java benchmark oracle");
      javaBasis = {
        kind: "fresh-observation",
        oracle: classpath.identity,
        jdk: jdk.identity,
      };
    }
    const jsSuites = new Map();
    for (const profile of new Set(
      entries.map(({ definition }) => definition.behaviorProfileId),
    )) {
      jsSuites.set(
        profile,
        await runJsProfileBenchmarks(profile, {
          warmupCount,
          runCount,
          filterIds,
          sharedFixtures,
        }),
      );
    }
    const cases = entries.map(({ caseId, definition, workload }) => {
      const java = javaSuite.results.find((row) => row.id === definition.input);
      const js = jsSuites
        .get(definition.behaviorProfileId)
        .results.find((row) => row.id === definition.input);
      if (!java || !js)
        throw new Error(`Missing worker observation for ${definition.input}`);
      return {
        caseId,
        input: definition.input,
        behaviorProfileId: definition.behaviorProfileId,
        status: "diagnostic-only",
        reason:
          workload.comparisonLimitation ??
          (java.verificationCount !== js.verificationCount
            ? "Worker checksums differ"
            : "The worker checksum has no independent semantic witness"),
        java,
        js,
      };
    });
    const report = {
      schemaVersion: 1,
      action: "run",
      scenario: "api-benchmarks",
      definitions,
      cases,
      javaBasis,
      fixtureGeneratorSha256: sha256(await readFile(fixtureGenerator)),
      javascript: {
        node: process.version,
        explicitGc: typeof globalThis.gc === "function",
      },
    };
    await publishComparisonJson(output, "benchmarks.json", report);
    return report;
  } finally {
    sharedFixtures.cleanup();
  }
}
