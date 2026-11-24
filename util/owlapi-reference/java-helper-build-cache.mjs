import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join, posix, resolve } from "node:path";

import { canonicalJson, stableJson } from "../../scripts/canonical-json.mjs";

export const JAVA_HELPER_BUILD_CACHE_SCHEMA_VERSION = 1;

const MAXIMUM_SOURCE_BYTES = 16 * 1024 * 1024;
const MAXIMUM_JAR_BYTES = 256 * 1024 * 1024;
const MAXIMUM_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAXIMUM_CLASS_FILES = 4096;
const MAXIMUM_CLASS_BYTES = 64 * 1024 * 1024;
const COMPETING_WRITER_CODES = new Set([
  "EEXIST",
  "ENOTEMPTY",
  "EPERM",
  "EACCES",
  "EBUSY",
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const compareUtf16CodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const delay = (milliseconds) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

const readRegularFile = async (filePath, maximumBytes, label) => {
  const absolutePath = resolve(filePath);
  const info = await lstat(absolutePath);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`${label} must be a regular non-symlink file: ${filePath}`);
  }
  if (info.size > maximumBytes) {
    throw new Error(`${label} exceeds size limit: ${filePath}`);
  }
  const bytes = await readFile(absolutePath);
  if (bytes.length !== info.size) {
    throw new Error(`${label} changed while reading: ${filePath}`);
  }
  return bytes;
};

/** Resolve an explicit Java helper build cache directory or OWLAPI_JAVA_BUILD_CACHE. */
export function resolveJavaHelperBuildCacheDirectory(
  explicitDirectory,
  environment = process.env,
) {
  if (typeof explicitDirectory === "string" && explicitDirectory.trim()) {
    return resolve(explicitDirectory.trim());
  }
  const ambient = environment?.OWLAPI_JAVA_BUILD_CACHE;
  if (typeof ambient === "string" && ambient.trim()) {
    return resolve(ambient.trim());
  }
  return null;
}

/** Observe compiler and runtime properties without relying on implicit ambient state. */
export async function probeJavaCompilerIdentity({ executeProcess }) {
  if (typeof executeProcess !== "function") {
    throw new TypeError("probeJavaCompilerIdentity requires executeProcess");
  }
  const compiler = await executeProcess("javac", ["-version"]);
  const compilerText =
    `${compiler?.stdout ?? ""}${compiler?.stderr ?? ""}`.trim();
  if (!compiler || compiler.exitCode !== 0 || !compilerText) {
    throw new Error(
      `Could not probe javac compiler identity: ${compiler?.stderr ?? "no output"}`,
    );
  }
  const runtime = await executeProcess("java", [
    "-XshowSettings:properties",
    "-version",
  ]);
  const runtimeText = `${runtime?.stdout ?? ""}\n${runtime?.stderr ?? ""}`;
  if (!runtime || runtime.exitCode !== 0 || !runtimeText.trim()) {
    throw new Error(
      `Could not probe java runtime identity: ${runtime?.stderr ?? "no output"}`,
    );
  }
  const properties = Object.fromEntries(
    [...runtimeText.matchAll(/^\s+(java\.[\w.]+)\s*=\s*(.+)\r?$/gmu)].map(
      ([, key, value]) => [key, value.trim()],
    ),
  );
  const extraHashes = {};
  const javaHome = properties["java.home"];
  if (typeof javaHome === "string" && javaHome) {
    try {
      const canonicalHome = await realpath(javaHome);
      const homeInfo = await lstat(canonicalHome);
      if (homeInfo.isDirectory()) {
        const suffix = process.platform === "win32" ? ".exe" : "";
        for (const [field, relativePath] of [
          ["releaseSha256", ["release"]],
          ["executableSha256", ["bin", `java${suffix}`]],
          ["compilerSha256", ["bin", `javac${suffix}`]],
        ]) {
          try {
            const bytes = await readRegularFile(
              join(canonicalHome, ...relativePath),
              MAXIMUM_JAR_BYTES,
              field,
            );
            extraHashes[field] = sha256(bytes);
          } catch (error) {
            if (error?.code !== "ENOENT") {
              throw error;
            }
          }
        }
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }
  return {
    javacVersion: compilerText,
    vendor: properties["java.vendor"] ?? null,
    version: properties["java.version"] ?? null,
    runtime: properties["java.runtime.version"] ?? null,
    vmVersion: properties["java.vm.version"] ?? null,
    ...extraHashes,
  };
}

/** Read ordered classpath entries from a classpath file without glob or implicit defaults. */
export async function readOrderedClasspathEntries(classpathFile, delimiter) {
  const bytes = await readRegularFile(
    classpathFile,
    MAXIMUM_MANIFEST_BYTES,
    "Classpath file",
  );
  const raw = bytes.toString("utf8").trim();
  if (!raw) {
    throw new Error(`Classpath file is empty: ${classpathFile}`);
  }
  return raw.split(delimiter);
}

/** Hash ordered JAR inputs so build keys invalidate on content or classpath order changes. */
export async function hashOrderedClasspathEntries(classpathEntries) {
  if (!Array.isArray(classpathEntries)) {
    throw new TypeError("Ordered classpath entries must be an array");
  }
  const hashed = [];
  for (const [index, entry] of classpathEntries.entries()) {
    if (
      typeof entry !== "string" ||
      !entry ||
      /[\r\n]/u.test(entry) ||
      !entry.endsWith(".jar")
    ) {
      throw new Error(`Invalid classpath JAR entry at index ${index}`);
    }
    const bytes = await readRegularFile(
      entry,
      MAXIMUM_JAR_BYTES,
      `Classpath JAR ${entry}`,
    );
    hashed.push({
      index,
      name: basename(entry),
      byteLength: bytes.length,
      sha256: sha256(bytes),
    });
  }
  return hashed;
}

/** Hash launcher and oracle Java sources in exact build order. */
export async function hashJavaSources({ launcherSource, oracleSources }) {
  if (!Array.isArray(oracleSources) || oracleSources.length === 0) {
    throw new TypeError("At least one Java oracle source file is required");
  }
  const sources = [];
  if (launcherSource !== undefined && launcherSource !== null) {
    const bytes = await readRegularFile(
      launcherSource,
      MAXIMUM_SOURCE_BYTES,
      "Launcher Java source",
    );
    sources.push({
      role: "launcher",
      index: 0,
      name: basename(launcherSource),
      byteLength: bytes.length,
      sha256: sha256(bytes),
    });
  }
  for (const [index, sourcePath] of oracleSources.entries()) {
    const bytes = await readRegularFile(
      sourcePath,
      MAXIMUM_SOURCE_BYTES,
      `Oracle Java source ${sourcePath}`,
    );
    sources.push({
      role: "oracle",
      index,
      name: basename(sourcePath),
      byteLength: bytes.length,
      sha256: sha256(bytes),
    });
  }
  return sources;
}

/** Compute the content-addressed build key from canonical build inputs. */
export function computeJavaHelperBuildKey(descriptor) {
  return sha256(canonicalJson(descriptor));
}

const walkCompiledClasses = async (classesDirectory) => {
  const rootInfo = await lstat(classesDirectory);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) {
    throw new Error("Compiled classes directory is missing or linked");
  }
  const collected = [];
  let totalBytes = 0;

  const visit = async (directory, relativePrefix) => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Compiled class output contains symlink: ${entry.name}`,
        );
      }
      const fullPath = join(directory, entry.name);
      const relativePath = relativePrefix
        ? posix.join(relativePrefix, entry.name)
        : entry.name;
      if (entry.isDirectory()) {
        await visit(fullPath, relativePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".class")) {
        throw new Error(
          `Unexpected non-class output in compiled cache: ${relativePath}`,
        );
      }
      collected.push({ fullPath, relativePath });
      if (collected.length > MAXIMUM_CLASS_FILES) {
        throw new Error("Compiled class file count exceeds cache budget");
      }
    }
  };

  await visit(classesDirectory, "");
  collected.sort((left, right) =>
    compareUtf16CodeUnits(left.relativePath, right.relativePath),
  );

  const outputs = [];
  for (const { fullPath, relativePath } of collected) {
    const bytes = await readRegularFile(
      fullPath,
      MAXIMUM_CLASS_BYTES,
      `Compiled class ${relativePath}`,
    );
    if (bytes.length === 0) {
      throw new Error(`Empty class output: ${relativePath}`);
    }
    totalBytes += bytes.length;
    if (totalBytes > MAXIMUM_JAR_BYTES) {
      throw new Error("Total compiled class size exceeds cache budget");
    }
    outputs.push({
      path: relativePath,
      byteLength: bytes.length,
      sha256: sha256(bytes),
    });
  }
  if (outputs.length === 0) {
    throw new Error("Compiled classes directory contains no class files");
  }
  return outputs;
};

const isSafeClassRelativePath = (relativePath) => {
  if (
    typeof relativePath !== "string" ||
    !relativePath ||
    relativePath.startsWith("/") ||
    relativePath.includes("\\") ||
    !relativePath.endsWith(".class")
  ) {
    return false;
  }
  const parts = relativePath.split("/");
  return parts.every(
    (part) =>
      part !== "" && part !== "." && part !== ".." && !part.includes(":"),
  );
};

/** Fail-closed verification of a materialized helper cache entry before reuse. */
export async function verifyCachedJavaHelperBuild(
  entryDirectory,
  expectedDescriptor,
  expectedBuildKey,
  { requiredOutputs = [] } = {},
) {
  try {
    const resolvedEntry = resolve(entryDirectory);
    const entryInfo = await lstat(resolvedEntry);
    if (entryInfo.isSymbolicLink() || !entryInfo.isDirectory()) {
      return { valid: false, reason: "Cache entry is not a directory" };
    }
    const rootEntries = await readdir(resolvedEntry, { withFileTypes: true });
    const rootNames = rootEntries.map((entry) => entry.name).sort();
    if (
      rootNames.length !== 2 ||
      rootNames[0] !== "classes" ||
      rootNames[1] !== "manifest.json"
    ) {
      return { valid: false, reason: "Cache entry inventory mismatch" };
    }
    for (const rootEntry of rootEntries) {
      if (rootEntry.isSymbolicLink()) {
        return { valid: false, reason: "Cache entry contains symlink" };
      }
      if (rootEntry.name === "classes" && !rootEntry.isDirectory()) {
        return {
          valid: false,
          reason: "Cache classes entry is not a directory",
        };
      }
      if (rootEntry.name === "manifest.json" && !rootEntry.isFile()) {
        return { valid: false, reason: "Cache manifest is not a file" };
      }
    }

    const manifestBytes = await readRegularFile(
      join(resolvedEntry, "manifest.json"),
      MAXIMUM_MANIFEST_BYTES,
      "Cache manifest",
    );
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      return { valid: false, reason: "Cache manifest is not an object" };
    }
    if (
      manifest.schemaVersion !== JAVA_HELPER_BUILD_CACHE_SCHEMA_VERSION ||
      manifest.buildKey !== expectedBuildKey
    ) {
      return { valid: false, reason: "Cache manifest version or key mismatch" };
    }
    const manifestDescriptor = {
      schemaVersion: manifest.schemaVersion,
      compilerIdentity: manifest.compilerIdentity,
      compilerOptions: manifest.compilerOptions,
      sources: manifest.sources,
      classpath: manifest.classpath,
    };
    if (
      canonicalJson(manifestDescriptor) !== canonicalJson(expectedDescriptor)
    ) {
      return {
        valid: false,
        reason: "Cache manifest input descriptor mismatch",
      };
    }
    if (!Array.isArray(manifest.outputs) || manifest.outputs.length === 0) {
      return { valid: false, reason: "Cache manifest outputs missing" };
    }
    const recordedPaths = new Set();
    for (const output of manifest.outputs) {
      if (
        !output ||
        typeof output !== "object" ||
        !isSafeClassRelativePath(output.path) ||
        recordedPaths.has(output.path) ||
        !Number.isSafeInteger(output.byteLength) ||
        output.byteLength <= 0 ||
        typeof output.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/u.test(output.sha256)
      ) {
        return {
          valid: false,
          reason: "Cache manifest contains invalid output",
        };
      }
      recordedPaths.add(output.path);
    }
    for (const required of requiredOutputs) {
      if (!recordedPaths.has(required)) {
        return {
          valid: false,
          reason: `Cache entry missing required class output: ${required}`,
        };
      }
    }

    const classesDirectory = join(resolvedEntry, "classes");
    const actualOutputs = await walkCompiledClasses(classesDirectory);
    if (canonicalJson(actualOutputs) !== canonicalJson(manifest.outputs)) {
      return {
        valid: false,
        reason: "Compiled class inventory or digest mismatch",
      };
    }

    return {
      valid: true,
      classesDirectory: await realpath(classesDirectory),
      manifest,
      manifestSha256: sha256(manifestBytes),
    };
  } catch (error) {
    return {
      valid: false,
      reason: error?.message ?? "Cache verification failed",
    };
  }
}

const quarantineEntryDirectory = async (entryDirectory, discardDirectory) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(entryDirectory, discardDirectory);
      try {
        await rm(discardDirectory, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup after atomic quarantine away from the active key.
      }
      return true;
    } catch (error) {
      if (error?.code === "ENOENT") {
        return false;
      }
      if (COMPETING_WRITER_CODES.has(error?.code) && attempt < 4) {
        await delay(25);
        continue;
      }
      await rm(entryDirectory, { recursive: true, force: true });
      return true;
    }
  }
  return false;
};

/**
 * Compile into staging once per verified input key and atomically publish into cache.
 * Corrupt/incomplete entries fail verification and are quarantined before rebuilding.
 */
export async function ensureCachedJavaHelperBuild({
  cacheDirectory,
  compilerIdentity,
  compilerOptions = [],
  launcherSource,
  oracleSources,
  classpathEntries,
  classpathFile,
  classpathDelimiter,
  requiredOutputs = [],
  compileIntoDirectory,
}) {
  if (!cacheDirectory) {
    throw new Error("A Java helper build cache directory is required");
  }
  if (!compilerIdentity || typeof compilerIdentity !== "object") {
    throw new Error("A probed Java compiler identity is required");
  }
  if (typeof compileIntoDirectory !== "function") {
    throw new TypeError("compileIntoDirectory callback is required");
  }

  const resolvedClasspathEntries =
    classpathEntries ??
    (await readOrderedClasspathEntries(
      classpathFile,
      classpathDelimiter ?? (process.platform === "win32" ? ";" : ":"),
    ));
  const [sources, classpath] = await Promise.all([
    hashJavaSources({ launcherSource, oracleSources }),
    hashOrderedClasspathEntries(resolvedClasspathEntries),
  ]);
  const expectedDescriptor = {
    schemaVersion: JAVA_HELPER_BUILD_CACHE_SCHEMA_VERSION,
    compilerIdentity,
    compilerOptions,
    sources,
    classpath,
  };
  const buildKey = computeJavaHelperBuildKey(expectedDescriptor);

  const root = resolve(cacheDirectory);
  const buildsRoot = join(root, "builds");
  const stagingRoot = join(root, "staging");
  await mkdir(buildsRoot, { recursive: true });
  await mkdir(stagingRoot, { recursive: true });

  const entryDirectory = join(buildsRoot, buildKey);
  let recoveredCorrupt = false;

  let existingExists = true;
  try {
    await lstat(entryDirectory);
  } catch (error) {
    if (error?.code === "ENOENT") {
      existingExists = false;
    } else {
      throw error;
    }
  }

  if (existingExists) {
    const verified = await verifyCachedJavaHelperBuild(
      entryDirectory,
      expectedDescriptor,
      buildKey,
      { requiredOutputs },
    );
    if (verified.valid) {
      return {
        compiledOracleDirectory: verified.classesDirectory,
        cacheStatus: "hit",
        buildKey,
        manifestSha256: verified.manifestSha256,
        stderr: "",
      };
    }
    const discardDirectory = join(
      stagingRoot,
      `discard-${buildKey}-${process.pid}-${randomUUID()}`,
    );
    await quarantineEntryDirectory(entryDirectory, discardDirectory);
    recoveredCorrupt = true;
  }

  const stagingDirectory = join(
    stagingRoot,
    `${buildKey}-${process.pid}-${randomUUID()}`,
  );
  const stagingClasses = join(stagingDirectory, "classes");
  await mkdir(stagingClasses, { recursive: true });

  try {
    const compileResult = await compileIntoDirectory(stagingClasses);
    const outputs = await walkCompiledClasses(stagingClasses);
    for (const required of requiredOutputs) {
      if (!outputs.some((output) => output.path === required)) {
        throw new Error(
          `Java helper compilation omitted required output ${required}`,
        );
      }
    }
    const manifest = {
      ...expectedDescriptor,
      buildKey,
      requiredOutputs: [...requiredOutputs],
      outputs,
    };
    await writeFile(
      join(stagingDirectory, "manifest.json"),
      stableJson(manifest),
      {
        flag: "wx",
      },
    );
    const stagedVerification = await verifyCachedJavaHelperBuild(
      stagingDirectory,
      expectedDescriptor,
      buildKey,
      { requiredOutputs },
    );
    if (!stagedVerification.valid) {
      throw new Error(
        `Staged Java helper build failed self-verification: ${stagedVerification.reason}`,
      );
    }

    for (let publishAttempt = 0; publishAttempt < 2; publishAttempt += 1) {
      try {
        await rename(stagingDirectory, entryDirectory);
        const published = await verifyCachedJavaHelperBuild(
          entryDirectory,
          expectedDescriptor,
          buildKey,
          { requiredOutputs },
        );
        if (!published.valid) {
          throw new Error(
            `Published Java helper build failed verification: ${published.reason}`,
          );
        }
        return {
          compiledOracleDirectory: published.classesDirectory,
          cacheStatus: recoveredCorrupt ? "rebuilt-corrupt" : "miss",
          buildKey,
          manifestSha256: published.manifestSha256,
          stderr: compileResult?.stderr ?? "",
        };
      } catch (error) {
        if (!COMPETING_WRITER_CODES.has(error?.code)) {
          throw error;
        }
        for (let waitAttempt = 0; waitAttempt < 12; waitAttempt += 1) {
          const raced = await verifyCachedJavaHelperBuild(
            entryDirectory,
            expectedDescriptor,
            buildKey,
            { requiredOutputs },
          );
          if (raced.valid) {
            return {
              compiledOracleDirectory: raced.classesDirectory,
              cacheStatus: "hit-after-race",
              buildKey,
              manifestSha256: raced.manifestSha256,
              stderr: compileResult?.stderr ?? "",
            };
          }
          await delay(50);
        }
        if (publishAttempt === 0) {
          await quarantineEntryDirectory(
            entryDirectory,
            join(
              stagingRoot,
              `discard-${buildKey}-${process.pid}-${randomUUID()}`,
            ),
          );
          recoveredCorrupt = true;
          continue;
        }
        throw new Error(
          `Could not publish verified Java helper build for key ${buildKey}`,
          { cause: error },
        );
      }
    }
    throw new Error(`Unreachable publish state for key ${buildKey}`);
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}
