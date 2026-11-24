import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { stableJson } from "../../scripts/canonical-json.mjs";

const execFileAsync = promisify(execFile);
const REFERENCE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PINNED_VERSION_PATH = join(
  REFERENCE_DIRECTORY,
  "pinned-version.json",
);
const DEFAULT_CATALOGUE_PATH = join(
  REFERENCE_DIRECTORY,
  "reference-publication-catalogue.json",
);

export const HISTORICAL_DISTRIBUTION_PURPOSE =
  "LOCAL_VERIFIED_HISTORICAL_REFERENCE_DISTRIBUTION";

const REQUIRED_REACTOR_MODULES = Object.freeze([
  "api",
  "apibinding",
  "compatibility",
  "impl",
  "oboformat",
  "parsers",
  "rio",
  "tools",
]);
const REACTOR_ENTRY_PATTERN =
  /(?:^|\/)(api|apibinding|compatibility|impl|oboformat|parsers|rio|tools)\/target\/(owlapi-\1-[^/]+\.jar)$/u;
const MAVEN_REPOSITORY_ENTRY_PATTERN =
  /(?:^|\/)(?:maven|repository)\/(.+\.jar)$/u;
const MAXIMUM_JAR_BYTES = 128 * 1024 * 1024;
const MAXIMUM_METADATA_BYTES = 4 * 1024 * 1024;
const MAXIMUM_RUNTIME_ENTRIES = 512;

const digest = (algorithm, bytes) =>
  createHash(algorithm).update(bytes).digest("hex");
const sha256 = (bytes) => digest("sha256", bytes);
const sha1 = (bytes) => digest("sha1", bytes);

const comparablePath = (value) =>
  process.platform === "win32" ? resolve(value).toLowerCase() : resolve(value);

const readRegularFile = async (filePath, maximumBytes, label) => {
  const absolutePath = resolve(filePath);
  const info = await lstat(absolutePath);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`${label} must be a regular non-symlink file: ${filePath}`);
  }
  if (info.size === 0 || info.size > maximumBytes) {
    throw new Error(`${label} has invalid size (${info.size}): ${filePath}`);
  }
  const bytes = await readFile(absolutePath);
  if (bytes.length !== info.size) {
    throw new Error(`${label} changed while reading: ${filePath}`);
  }
  return bytes;
};

const readPinAndCatalogue = async ({
  pinnedVersionPath = DEFAULT_PINNED_VERSION_PATH,
  cataloguePath = DEFAULT_CATALOGUE_PATH,
} = {}) => {
  const pinBytes = await readRegularFile(
    pinnedVersionPath,
    MAXIMUM_METADATA_BYTES,
    "Pinned reference metadata",
  );
  const pinned = JSON.parse(pinBytes.toString("utf8"));
  if (
    !/^[0-9a-f]{40}$/u.test(pinned?.sourceRevision ?? "") ||
    typeof pinned?.owlapiVersionLine !== "string" ||
    !pinned.owlapiVersionLine
  ) {
    throw new Error(`Invalid pinned-version metadata: ${pinnedVersionPath}`);
  }
  const catalogueBytes = await readRegularFile(
    cataloguePath,
    MAXIMUM_METADATA_BYTES,
    "Reference publication catalogue",
  );
  const catalogue = JSON.parse(catalogueBytes.toString("utf8"));
  if (!Array.isArray(catalogue?.runtime) || catalogue.runtime.length === 0) {
    throw new Error(`Invalid reference catalogue runtime: ${cataloguePath}`);
  }
  const catalogueExternalByPath = new Map();
  for (const item of catalogue.runtime) {
    if (
      item?.kind === "EXTERNAL" &&
      typeof item.repositoryPath === "string" &&
      Number.isSafeInteger(item.bytes) &&
      typeof item.sha256 === "string"
    ) {
      catalogueExternalByPath.set(item.repositoryPath, {
        bytes: item.bytes,
        sha256: item.sha256,
        coordinate: item.coordinate ?? null,
      });
    }
  }
  return {
    pinned,
    catalogueExternalByPath,
    catalogueSha256: sha256(catalogueBytes),
  };
};

const validateRepositoryPath = (repositoryPath) => {
  if (typeof repositoryPath !== "string" || !repositoryPath.endsWith(".jar")) {
    throw new Error(`Invalid Maven repository path: ${repositoryPath}`);
  }
  const parts = repositoryPath.split("/");
  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        part.includes(":") ||
        !/^[A-Za-z0-9_.-]+$/u.test(part),
    )
  ) {
    throw new Error(`Unsafe Maven repository path: ${repositoryPath}`);
  }
  return repositoryPath;
};

const extractExternalRepositoryPath = (normalizedEntry, mavenRoot) => {
  const patternMatch = MAVEN_REPOSITORY_ENTRY_PATTERN.exec(normalizedEntry);
  if (patternMatch) {
    return validateRepositoryPath(patternMatch[1]);
  }
  if (mavenRoot) {
    const relativePath = relative(mavenRoot, resolve(normalizedEntry));
    if (
      relativePath &&
      !relativePath.startsWith("..") &&
      !isAbsolute(relativePath)
    ) {
      return validateRepositoryPath(relativePath.replaceAll("\\", "/"));
    }
  }
  throw new Error(
    `Cannot map classpath entry into Maven repository: ${normalizedEntry}`,
  );
};

const verifyOptionalSha1Sidecar = async (sourcePath, bytes, repositoryPath) => {
  const sidecarPath = `${sourcePath}.sha1`;
  try {
    await lstat(sidecarPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  const sidecarBytes = await readRegularFile(
    sidecarPath,
    4096,
    `External JAR SHA-1 sidecar ${sidecarPath}`,
  );
  const match = /^([0-9a-f]{40})(?:\s|$)/iu.exec(
    sidecarBytes.toString("utf8").trim(),
  );
  if (!match) {
    throw new Error(`Malformed SHA-1 sidecar file: ${sidecarPath}`);
  }
  const expectedSha1 = match[1].toLowerCase();
  const actualSha1 = sha1(bytes);
  if (actualSha1 !== expectedSha1) {
    throw new Error(
      `External JAR SHA-1 sidecar mismatch for ${repositoryPath}: expected ${expectedSha1}, got ${actualSha1}`,
    );
  }
  return expectedSha1;
};

const verifyPinnedCommitInCheckout = async (sourceCheckoutPath, revision) => {
  const checkout = await realpath(resolve(sourceCheckoutPath));
  const gitBase = [
    "-c",
    `safe.directory=${checkout.replaceAll("\\", "/")}`,
    "-C",
    checkout,
  ];
  const commitCheck = await execFileAsync(
    "git",
    [...gitBase, "rev-parse", "--verify", `${revision}^{commit}`],
    { encoding: "utf8", windowsHide: true },
  );
  if (commitCheck.stdout.trim() !== revision) {
    throw new Error(
      `Checkout ${checkout} does not contain pinned commit ${revision}`,
    );
  }
};

const verifyRuntimeDirectoryInventory = async (runtimeDir, expectedPaths) => {
  const info = await lstat(runtimeDir);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(
      "Distribution runtime directory must be a non-symlink directory",
    );
  }
  const dirEntries = await readdir(runtimeDir, { withFileTypes: true });
  if (dirEntries.length > MAXIMUM_RUNTIME_ENTRIES) {
    throw new Error("Distribution runtime entry budget exceeded");
  }
  const actualPaths = [];
  for (const entry of dirEntries) {
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(
        `Distribution runtime entry must be a regular non-symlink file: ${entry.name}`,
      );
    }
    actualPaths.push(`runtime/${entry.name}`);
  }
  if (actualPaths.sort().join("\n") !== [...expectedPaths].sort().join("\n")) {
    throw new Error("Distribution runtime inventory does not match manifest");
  }
};

/**
 * Materialize an immutable, verified local OWLAPI runtime distribution using the
 * native Maven ordered classpath (reactor module JARs + verified external JARs).
 * Never mutates the active Java checkout.
 */
export async function materializeLocalHistoricalReferenceDistribution({
  reactorTargetsDirectory,
  mavenRepositoryDirectory,
  classpathFile,
  outputDirectory,
  sourceCheckoutPath,
  pinnedVersionPath = DEFAULT_PINNED_VERSION_PATH,
  cataloguePath = DEFAULT_CATALOGUE_PATH,
}) {
  const { pinned, catalogueExternalByPath, catalogueSha256 } =
    await readPinAndCatalogue({
      pinnedVersionPath,
      cataloguePath,
    });
  if (sourceCheckoutPath) {
    await verifyPinnedCommitInCheckout(
      sourceCheckoutPath,
      pinned.sourceRevision,
    );
  }

  const reactorRoot = resolve(reactorTargetsDirectory);
  const mavenRoot = mavenRepositoryDirectory
    ? resolve(mavenRepositoryDirectory)
    : null;
  const resolvedClasspathFile = resolve(
    classpathFile ??
      join(
        reactorRoot,
        "distribution",
        "target",
        "owlapi-runtime-classpath.txt",
      ),
  );
  const sourceClasspathBytes = await readRegularFile(
    resolvedClasspathFile,
    MAXIMUM_METADATA_BYTES,
    "Historical Maven runtime classpath file",
  );
  const sourceClasspathSha256 = sha256(sourceClasspathBytes);
  const rawEntries = sourceClasspathBytes
    .toString("utf8")
    .trim()
    .split(delimiter);
  if (
    rawEntries.length === 0 ||
    rawEntries.length > MAXIMUM_RUNTIME_ENTRIES ||
    rawEntries.some((entry) => !entry || !entry.endsWith(".jar"))
  ) {
    throw new Error(
      `Invalid native Maven runtime classpath in ${resolvedClasspathFile}`,
    );
  }

  const requestedOutput = resolve(outputDirectory);
  const parentDirectory = dirname(requestedOutput);
  await mkdir(parentDirectory, { recursive: true });
  const canonicalParent = await realpath(parentDirectory);
  const finalOutputDirectory = join(canonicalParent, basename(requestedOutput));

  let destinationExists = true;
  try {
    await lstat(finalOutputDirectory);
  } catch (error) {
    if (error?.code === "ENOENT") {
      destinationExists = false;
    } else {
      throw error;
    }
  }
  if (destinationExists) {
    throw new Error(
      `Destination distribution directory already exists: ${finalOutputDirectory}`,
    );
  }

  const resolvedInputs = [];
  const seenReactorModules = new Set();
  for (const [index, rawEntry] of rawEntries.entries()) {
    const targetPath = `runtime/${String(index).padStart(3, "0")}.jar`;
    const normalized = rawEntry.replaceAll("\\", "/");
    const reactorMatch = REACTOR_ENTRY_PATTERN.exec(normalized);

    if (reactorMatch) {
      const [, moduleName, filename] = reactorMatch;
      const sourcePath = join(reactorRoot, moduleName, "target", filename);
      const bytes = await readRegularFile(
        sourcePath,
        MAXIMUM_JAR_BYTES,
        `Reactor JAR ${moduleName}/${filename}`,
      );
      seenReactorModules.add(moduleName);
      resolvedInputs.push({
        sourcePath,
        entry: {
          path: targetPath,
          kind: "REACTOR",
          module: moduleName,
          filename,
          byteLength: bytes.length,
          sha256: sha256(bytes),
        },
      });
      continue;
    }

    const repositoryPath = extractExternalRepositoryPath(normalized, mavenRoot);
    const sourcePath = mavenRoot
      ? join(mavenRoot, ...repositoryPath.split("/"))
      : resolve(rawEntry);
    const bytes = await readRegularFile(
      sourcePath,
      MAXIMUM_JAR_BYTES,
      `External JAR ${repositoryPath}`,
    );
    const actualSha256 = sha256(bytes);
    const cataloguePin = catalogueExternalByPath.get(repositoryPath);
    if (cataloguePin) {
      if (
        bytes.length !== cataloguePin.bytes ||
        actualSha256 !== cataloguePin.sha256
      ) {
        throw new Error(
          `External JAR mismatch against catalogue for ${repositoryPath}: sha256/size mismatch`,
        );
      }
    } else {
      await verifyOptionalSha1Sidecar(sourcePath, bytes, repositoryPath);
    }

    resolvedInputs.push({
      sourcePath,
      entry: {
        path: targetPath,
        kind: "EXTERNAL",
        repositoryPath,
        filename: basename(sourcePath),
        byteLength: bytes.length,
        sha256: actualSha256,
      },
    });
  }

  const missingReactorModules = REQUIRED_REACTOR_MODULES.filter(
    (moduleName) => !seenReactorModules.has(moduleName),
  );
  if (missingReactorModules.length > 0) {
    throw new Error(
      `Historical classpath is missing required OWLAPI reactor modules: ${missingReactorModules.join(", ")}`,
    );
  }

  const stagingDirectory = join(
    canonicalParent,
    `.hist-dist-staging-${process.pid}-${randomUUID()}`,
  );
  await mkdir(join(stagingDirectory, "runtime"), {
    recursive: true,
    mode: 0o700,
  });

  try {
    const classpathEntries = [];
    const manifestEntries = [];
    for (const item of resolvedInputs) {
      const stagedJarPath = join(
        stagingDirectory,
        ...item.entry.path.split("/"),
      );
      await copyFile(item.sourcePath, stagedJarPath);
      classpathEntries.push(
        join(finalOutputDirectory, ...item.entry.path.split("/")),
      );
      manifestEntries.push(item.entry);
    }

    const manifest = {
      schemaVersion: 1,
      purpose: HISTORICAL_DISTRIBUTION_PURPOSE,
      owlapiVersion: pinned.owlapiVersionLine,
      pinnedRevision: pinned.sourceRevision,
      sourceClasspathSha256,
      catalogueSha256,
      classpath: manifestEntries.map(({ path }) => path),
      entries: manifestEntries,
    };
    await writeFile(
      join(stagingDirectory, "owlapi-runtime-classpath.txt"),
      classpathEntries.join(delimiter),
      { flag: "wx", encoding: "utf8" },
    );
    await writeFile(
      join(stagingDirectory, "manifest.json"),
      stableJson(manifest),
      { flag: "wx", encoding: "utf8" },
    );

    await rename(stagingDirectory, finalOutputDirectory);
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }

  return verifyLocalHistoricalReferenceDistribution(finalOutputDirectory, {
    pinnedVersionPath,
    cataloguePath,
  });
}

/**
 * Verify a materialized historical reference distribution (local materialized or
 * materialized CI reference bundle) against pinned revision and runtime JAR hashes.
 */
export async function verifyLocalHistoricalReferenceDistribution(
  distributionDirectory,
  {
    pinnedVersionPath = DEFAULT_PINNED_VERSION_PATH,
    cataloguePath = DEFAULT_CATALOGUE_PATH,
  } = {},
) {
  const resolvedInput = resolve(distributionDirectory);
  const dirInfo = await lstat(resolvedInput);
  if (dirInfo.isSymbolicLink() || !dirInfo.isDirectory()) {
    throw new Error(
      `Historical reference distribution must be a non-symlink directory: ${distributionDirectory}`,
    );
  }
  const canonicalRoot = await realpath(resolvedInput);
  const { pinned, catalogueExternalByPath, catalogueSha256 } =
    await readPinAndCatalogue({
      pinnedVersionPath,
      cataloguePath,
    });

  const manifestPath = join(canonicalRoot, "manifest.json");
  const manifestBytes = await readRegularFile(
    manifestPath,
    MAXIMUM_METADATA_BYTES,
    "Distribution manifest",
  );
  const manifest = JSON.parse(manifestBytes.toString("utf8"));

  let expectedClasspathPaths;
  let verifiedEntries;

  if (manifest?.purpose === HISTORICAL_DISTRIBUTION_PURPOSE) {
    if (
      manifest.schemaVersion !== 1 ||
      manifest.pinnedRevision !== pinned.sourceRevision ||
      manifest.owlapiVersion !== pinned.owlapiVersionLine ||
      manifest.catalogueSha256 !== catalogueSha256 ||
      !/^[a-f0-9]{64}$/u.test(manifest.sourceClasspathSha256 ?? "") ||
      !Array.isArray(manifest.classpath) ||
      !Array.isArray(manifest.entries) ||
      manifest.entries.length === 0 ||
      manifest.classpath.length !== manifest.entries.length
    ) {
      throw new Error("Distribution manifest identity or catalogue mismatch");
    }
    const seenReactorModules = new Set();
    for (const [index, entry] of manifest.entries.entries()) {
      const expectedJarPath = `runtime/${String(index).padStart(3, "0")}.jar`;
      if (
        manifest.classpath[index] !== expectedJarPath ||
        entry?.path !== expectedJarPath ||
        !["REACTOR", "EXTERNAL"].includes(entry?.kind) ||
        typeof entry?.filename !== "string" ||
        !entry.filename ||
        !Number.isSafeInteger(entry.byteLength) ||
        entry.byteLength <= 0 ||
        !/^[a-f0-9]{64}$/u.test(entry.sha256 ?? "")
      ) {
        throw new Error(`Invalid distribution entry at index ${index}`);
      }
      if (entry.kind === "REACTOR") {
        if (!REQUIRED_REACTOR_MODULES.includes(entry.module)) {
          throw new Error(
            `Unknown reactor module in manifest: ${entry.module}`,
          );
        }
        seenReactorModules.add(entry.module);
      } else {
        validateRepositoryPath(entry.repositoryPath);
        const cataloguePin = catalogueExternalByPath.get(entry.repositoryPath);
        if (
          cataloguePin &&
          (entry.byteLength !== cataloguePin.bytes ||
            entry.sha256 !== cataloguePin.sha256)
        ) {
          throw new Error(
            `External distribution entry digest mismatch for ${entry.repositoryPath}`,
          );
        }
      }
    }
    if (
      REQUIRED_REACTOR_MODULES.some(
        (moduleName) => !seenReactorModules.has(moduleName),
      )
    ) {
      throw new Error(
        "Distribution manifest is missing required OWLAPI reactor modules",
      );
    }
    expectedClasspathPaths = manifest.classpath;
    verifiedEntries = manifest.entries;
  } else if (
    manifest?.schemaVersion === 1 &&
    manifest?.source?.commit === pinned.sourceRevision &&
    Array.isArray(manifest.classpath) &&
    Array.isArray(manifest.inventory)
  ) {
    // Support materialized CI reference bundles generated by reference-bundle.mjs
    const runtimeInventory = new Map(
      manifest.inventory
        .filter((item) => item.path.startsWith("runtime/"))
        .map((item) => [item.path, item]),
    );
    if (runtimeInventory.size !== manifest.classpath.length) {
      throw new Error("Reference bundle runtime classpath inventory mismatch");
    }
    expectedClasspathPaths = manifest.classpath;
    verifiedEntries = manifest.classpath.map((jarPath, index) => {
      if (jarPath !== `runtime/${String(index).padStart(3, "0")}.jar`) {
        throw new Error("Reference bundle classpath order invalid");
      }
      const item = runtimeInventory.get(jarPath);
      if (
        !item ||
        !Number.isSafeInteger(item.bytes) ||
        item.bytes <= 0 ||
        !/^[a-f0-9]{64}$/u.test(item.sha256 ?? "")
      ) {
        throw new Error(`Invalid reference bundle runtime item: ${jarPath}`);
      }
      return {
        path: jarPath,
        byteLength: item.bytes,
        sha256: item.sha256,
      };
    });
  } else {
    throw new Error(
      "Unrecognized or mismatched historical distribution manifest",
    );
  }

  await verifyRuntimeDirectoryInventory(
    join(canonicalRoot, "runtime"),
    expectedClasspathPaths,
  );

  for (const entry of verifiedEntries) {
    const jarBytes = await readRegularFile(
      join(canonicalRoot, ...entry.path.split("/")),
      MAXIMUM_JAR_BYTES,
      `Distribution JAR ${entry.path}`,
    );
    if (
      jarBytes.length !== entry.byteLength ||
      sha256(jarBytes) !== entry.sha256
    ) {
      throw new Error(
        `Distribution JAR digest or size mismatch for ${entry.path}`,
      );
    }
  }

  const classpathFile = join(canonicalRoot, "owlapi-runtime-classpath.txt");
  const classpathBytes = await readRegularFile(
    classpathFile,
    MAXIMUM_METADATA_BYTES,
    "Distribution classpath file",
  );
  const actualClasspathEntries = classpathBytes
    .toString("utf8")
    .trim()
    .split(delimiter);
  const expectedResolvedPaths = expectedClasspathPaths.map((relativeJar) =>
    join(canonicalRoot, ...relativeJar.split("/")),
  );
  if (
    actualClasspathEntries.length !== expectedResolvedPaths.length ||
    actualClasspathEntries.some(
      (actual, index) =>
        comparablePath(actual) !== comparablePath(expectedResolvedPaths[index]),
    )
  ) {
    throw new Error("Distribution classpath file does not match runtime JARs");
  }

  return {
    distributionDirectory: canonicalRoot,
    classpathFile,
    manifestPath,
    manifestSha256: sha256(manifestBytes),
    pinnedRevision: pinned.sourceRevision,
    owlapiVersion: pinned.owlapiVersionLine,
    jarCount: verifiedEntries.length,
    entries: verifiedEntries,
  };
}

const parseCliArguments = (argv) => {
  const [subcommand, ...rest] = argv;
  if (!subcommand || !["materialize", "verify"].includes(subcommand)) {
    throw new Error(
      "Usage: historical-reference-distribution.mjs <materialize|verify> ...",
    );
  }
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Invalid option near ${flag ?? "<end>"}`);
    }
    if (values.has(flag)) {
      throw new Error(`Duplicate option: ${flag}`);
    }
    values.set(flag, value);
  }
  return { subcommand, values };
};

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const { subcommand, values } = parseCliArguments(process.argv.slice(2));
    if (subcommand === "materialize") {
      const reactorTargetsDirectory = values.get("--reactor-targets");
      const mavenRepositoryDirectory = values.get("--maven-repository");
      const outputDirectory = values.get("--output");
      if (
        !reactorTargetsDirectory ||
        !mavenRepositoryDirectory ||
        !outputDirectory
      ) {
        throw new Error(
          "materialize requires --reactor-targets, --maven-repository, and --output",
        );
      }
      const result = await materializeLocalHistoricalReferenceDistribution({
        reactorTargetsDirectory,
        mavenRepositoryDirectory,
        classpathFile: values.get("--classpath-file"),
        outputDirectory,
        sourceCheckoutPath: values.get("--source-checkout"),
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      const distributionDirectory = values.get("--distribution");
      if (!distributionDirectory) {
        throw new Error("verify requires --distribution");
      }
      const result = await verifyLocalHistoricalReferenceDistribution(
        distributionDirectory,
      );
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    process.exitCode = 1;
  }
}
