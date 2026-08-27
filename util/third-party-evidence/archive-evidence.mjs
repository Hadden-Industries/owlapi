import { createHash } from "node:crypto";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { basename } from "node:path/posix";
import { TextDecoder } from "node:util";
import { list } from "tar";
import { compareCodeUnits } from "./digests.mjs";

export const ARCHIVE_LIMITS = Object.freeze({
  compressedBytes: 100 * 1024 * 1024,
  expandedBytes: 512 * 1024 * 1024,
  entries: 100_000,
  entryBytes: 128 * 1024 * 1024,
  pathBytes: 4096,
  retainedEvidenceBytes: 16 * 1024 * 1024,
});

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const REGULAR_FILE_TYPES = new Set(["File", "OldFile", "ContiguousFile"]);
const DIRECTORY_TYPES = new Set(["Directory", "GNUDumpDir"]);
const WINDOWS_RESERVED_NAME =
  /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const containsControlCharacter = (value) =>
  [...value].some((character) => character.codePointAt(0) <= 0x1f);

const assertLimit = (actual, limit, label) => {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new TypeError(`Invalid ${label}`);
  }
  if (actual > limit) {
    throw new Error(`Archive exceeds ${label}`);
  }
};

const validatePath = (path, limits) => {
  if (
    typeof path !== "string" ||
    !path ||
    path.includes("\0") ||
    path.includes("\\") ||
    path.includes("\uFFFD") ||
    path.startsWith("/") ||
    path.startsWith("//") ||
    /^[A-Za-z]:/u.test(path)
  ) {
    throw new Error(`Unsafe archive path: ${String(path)}`);
  }
  assertLimit(
    Buffer.byteLength(path, "utf8"),
    limits.pathBytes,
    "path byte limit",
  );
  const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = normalized.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === ".." ||
        (segment !== "." &&
          (containsControlCharacter(segment) ||
            /[<>:"|?*]/u.test(segment) ||
            /[. ]$/u.test(segment) ||
            WINDOWS_RESERVED_NAME.test(segment))),
    )
  ) {
    throw new Error(`Unsafe archive path: ${path}`);
  }
  // POSIX treats `.` as the current directory. Canonicalize that harmless
  // historical tar spelling before collision checks while continuing to reject
  // traversal, empty components and every Windows-ambiguous representation.
  const canonical = segments.filter((segment) => segment !== ".").join("/");
  if (!canonical) {
    throw new Error(`Unsafe archive path: ${path}`);
  }
  return canonical;
};

const namedEvidenceKind = (path) => {
  const name = basename(path);
  if (
    /^third[ _.-]?party[ _.-]?(?:notices?|licen[cs]es?)(?:[._ -].*)?$/iu.test(
      name,
    )
  ) {
    return "THIRD_PARTY_LICENCE";
  }
  if (/^(?:licen[cs]e|copying|unlicense)(?:[._ -].*)?$/iu.test(name)) {
    return "LICENCE";
  }
  if (/^notice(?:[._ -].*)?$/iu.test(name)) {
    return "NOTICE";
  }
  if (/^copyright(?:[._ -].*)?$/iu.test(name)) {
    return "COPYRIGHT";
  }
  if (/^authors?(?:[._ -].*)?$/iu.test(name)) {
    return "AUTHORS";
  }
  if (/^patents?(?:[._ -].*)?$/iu.test(name)) {
    return "PATENTS";
  }
  return null;
};

const classifyEvidence = (path, bytes) => {
  const named = namedEvidenceKind(path);
  if (named) {
    return named;
  }
  if (
    /^readme(?:[._ -].*)?$/iu.test(basename(path)) &&
    (() => {
      try {
        return /\b(?:copyright|licen[cs](?:e|ed|ing)|spdx|third[ -]?party)\b/iu.test(
          UTF8_DECODER.decode(bytes),
        );
      } catch {
        // A binary or legacy-encoded README is still inventoried and scanned;
        // it simply cannot be selected by this text-specific heuristic.
        return false;
      }
    })()
  ) {
    return "README_ATTRIBUTION";
  }
  return null;
};

const normalizePackageIdentity = (packageMetadata) => ({
  name: packageMetadata.name,
  version: packageMetadata.version,
  license: packageMetadata.license ?? null,
  author: packageMetadata.author ?? null,
  repository: packageMetadata.repository ?? null,
  homepage: packageMetadata.homepage ?? null,
});

export const inspectPackageTarball = async (
  tarballPath,
  expected,
  { limits = ARCHIVE_LIMITS } = {},
) => {
  const compressed = await stat(tarballPath);
  assertLimit(compressed.size, limits.compressedBytes, "compressed byte limit");

  const entries = [];
  const physicalEntries = [];
  const evidenceFiles = [];
  const pendingEntries = [];
  const exactPaths = new Set();
  const foldedPaths = new Map();
  const abortController = new AbortController();
  let controlError;
  let physicalEntryCount = 0;
  let expandedBytes = 0;
  let retainedEvidenceBytes = 0;
  let archiveRoot;

  try {
    await list({
      file: tarballPath,
      strict: true,
      noResume: true,
      win32: false,
      signal: abortController.signal,
      onReadEntry: (entry) => {
        try {
          // node-tar normalizes backslashes on every platform before exposing
          // ReadEntry.path. Validate the decoded header/PAX path as well so a
          // Windows-shaped archive cannot become indistinguishable from a POSIX one.
          const rawPath = validatePath(entry.header?.path, limits);
          const path = validatePath(entry.path, limits);
          if (rawPath !== path) {
            throw new Error(`Unsafe archive path representation: ${rawPath}`);
          }
          // Current npm tooling writes `package/`, but npm still installs older
          // registry artifacts after stripping whichever first component they
          // contain. Treat one root plus exact root-level package identity as
          // authoritative; the historical directory name is not an identity.
          const entryRoot = path.split("/", 1)[0];
          if (archiveRoot && entryRoot !== archiveRoot) {
            throw new Error(
              `Archive entries do not share a single package root: ${archiveRoot} and ${entryRoot}`,
            );
          }
          archiveRoot ??= entryRoot;
          const folded = path.toLocaleLowerCase("en-US");
          const collision = foldedPaths.get(folded);
          if (collision && collision !== path) {
            throw new Error(
              `Archive path case-folding collision: ${collision} and ${path}`,
            );
          }
          exactPaths.add(path);
          foldedPaths.set(folded, path);

          // Count physical tar members, including exact-path duplicates, so a
          // valid canonical inventory cannot hide an archive-bombing primitive.
          physicalEntryCount += 1;
          assertLimit(physicalEntryCount, limits.entries, "entry count limit");
          const size = Number(entry.size || 0);
          if (!Number.isSafeInteger(size) || size < 0) {
            throw new Error(`Invalid archive entry size for ${path}`);
          }
          assertLimit(size, limits.entryBytes, "entry byte limit");
          expandedBytes += size;
          assertLimit(
            expandedBytes,
            limits.expandedBytes,
            "expanded byte limit",
          );

          if (
            !REGULAR_FILE_TYPES.has(entry.type) &&
            !DIRECTORY_TYPES.has(entry.type)
          ) {
            throw new Error(
              `Unsupported archive entry type ${entry.type} at ${path}`,
            );
          }

          const pending = new Promise((resolve, reject) => {
            const hash = createHash("sha256");
            const chunks = [];
            let received = 0;
            entry.on("data", (chunk) => {
              received += chunk.length;
              hash.update(chunk);
              if (REGULAR_FILE_TYPES.has(entry.type)) {
                chunks.push(Buffer.from(chunk));
              }
            });
            entry.once("error", reject);
            entry.once("end", () => {
              try {
                if (received !== size) {
                  throw new Error(
                    `Archive entry size mismatch for ${path}: expected ${size}, received ${received}`,
                  );
                }
                const bytes = Buffer.concat(chunks, received);
                const digest = hash.digest("hex");
                physicalEntries.push({
                  path,
                  type: DIRECTORY_TYPES.has(entry.type) ? "DIRECTORY" : "FILE",
                  size,
                  sha256: digest,
                });
                if (REGULAR_FILE_TYPES.has(entry.type)) {
                  const kind = classifyEvidence(path, bytes);
                  if (kind) {
                    retainedEvidenceBytes += bytes.length;
                    assertLimit(
                      retainedEvidenceBytes,
                      limits.retainedEvidenceBytes,
                      "retained evidence byte limit",
                    );
                    evidenceFiles.push({
                      path,
                      kind,
                      size,
                      sha256: digest,
                      bytes,
                    });
                  }
                }
                resolve();
              } catch (error) {
                reject(error);
              }
            });
            entry.resume();
          });
          pendingEntries.push(pending);
        } catch (error) {
          controlError = error;
          entry.resume();
          abortController.abort(error);
        }
      },
    });
  } catch (error) {
    throw controlError || error;
  }
  if (controlError) {
    throw controlError;
  }
  await Promise.all(pendingEntries);

  if (!archiveRoot) {
    throw new Error("Archive contains no package entries");
  }

  physicalEntries.sort((left, right) =>
    compareCodeUnits(left.path, right.path),
  );
  const occurrencesByPath = new Map();
  for (const entry of physicalEntries) {
    const occurrence = occurrencesByPath.get(entry.path);
    if (!occurrence) {
      occurrencesByPath.set(entry.path, { entry, occurrenceCount: 1 });
      entries.push(entry);
      continue;
    }
    if (
      occurrence.entry.type !== entry.type ||
      occurrence.entry.size !== entry.size ||
      occurrence.entry.sha256 !== entry.sha256
    ) {
      throw new Error(`Conflicting duplicate archive path: ${entry.path}`);
    }
    occurrence.occurrenceCount += 1;
  }
  const duplicateEntries = [...occurrencesByPath.values()]
    .filter(({ occurrenceCount }) => occurrenceCount > 1)
    .map(({ entry, occurrenceCount }) => ({
      ...entry,
      occurrenceCount,
    }));

  // Evidence retention is canonical by path even when an immutable historical
  // npm tarball repeats the same bytes. Physical duplicates still count toward
  // every archive safety ceiling above and remain explicit in the inventory.
  const uniqueEvidenceFiles = new Map();
  for (const evidence of evidenceFiles) {
    uniqueEvidenceFiles.set(evidence.path, evidence);
  }
  evidenceFiles.splice(
    0,
    evidenceFiles.length,
    ...uniqueEvidenceFiles.values(),
  );

  evidenceFiles.sort((left, right) => compareCodeUnits(left.path, right.path));
  const packageMetadataPath = `${archiveRoot}/package.json`;
  const packageEntry = entries.find(
    ({ path, type }) => path === packageMetadataPath && type === "FILE",
  );
  if (!packageEntry) {
    throw new Error(`Archive is missing ${packageMetadataPath}`);
  }
  // package.json is always needed for identity even though it is not classified
  // as legal evidence. Read it in one bounded second pass to avoid retaining all
  // ordinary source files in memory during the inventory pass.
  let packageBytes;
  await list({
    file: tarballPath,
    strict: true,
    win32: false,
    filter: (path) => validatePath(path, limits) === packageMetadataPath,
    onReadEntry: (entry) => {
      const chunks = [];
      entry.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      entry.once("end", () => {
        packageBytes = Buffer.concat(chunks);
      });
    },
  });
  if (
    !packageBytes ||
    packageBytes.length !== packageEntry.size ||
    createHash("sha256").update(packageBytes).digest("hex") !==
      packageEntry.sha256
  ) {
    throw new Error(`Unable to read ${packageMetadataPath} from archive`);
  }
  let packageMetadata;
  try {
    packageMetadata = JSON.parse(UTF8_DECODER.decode(packageBytes));
  } catch (error) {
    throw new Error(`${packageMetadataPath} is not valid UTF-8 JSON`, {
      cause: error,
    });
  }
  if (
    packageMetadata.name !== expected.name ||
    packageMetadata.version !== expected.version
  ) {
    throw new Error(
      `Package identity mismatch: expected ${expected.name}@${expected.version}, received ${String(packageMetadata.name)}@${String(packageMetadata.version)}`,
    );
  }

  return {
    archiveRoot,
    compressedBytes: compressed.size,
    expandedBytes,
    physicalEntryCount,
    duplicateEntries,
    packageIdentity: normalizePackageIdentity(packageMetadata),
    packageMetadata,
    entries,
    evidenceFiles,
  };
};

const materializedPath = (destinationRoot, archivePath) => {
  const root = resolve(destinationRoot);
  const target = resolve(root, ...archivePath.split("/"));
  if (!target.startsWith(`${root}${sep}`)) {
    throw new Error(
      `Archive path escapes the scan destination: ${archivePath}`,
    );
  }
  return target;
};

const normalizeExcludedFileSuffixes = (suffixes) => {
  if (
    !Array.isArray(suffixes) ||
    suffixes.some(
      (suffix) =>
        typeof suffix !== "string" ||
        !/^\.[a-z0-9]+$/u.test(suffix) ||
        suffix !== suffix.toLowerCase(),
    ) ||
    new Set(suffixes).size !== suffixes.length
  ) {
    throw new TypeError(
      "Excluded scan file suffixes must be unique lowercase extensions",
    );
  }
  return [...suffixes];
};

const analyzeArchiveInventory = (inventory, limits) => {
  if (
    !Array.isArray(inventory?.entries) ||
    inventory.entries.length === 0 ||
    !Array.isArray(inventory?.duplicateEntries) ||
    !Array.isArray(inventory?.evidenceFiles) ||
    !Number.isSafeInteger(inventory?.physicalEntryCount) ||
    inventory.physicalEntryCount < 1 ||
    !Number.isSafeInteger(inventory?.compressedBytes) ||
    inventory.compressedBytes < 1 ||
    !Number.isSafeInteger(inventory?.expandedBytes) ||
    inventory.expandedBytes < 0 ||
    typeof inventory.archiveRoot !== "string" ||
    inventory.archiveRoot.length === 0
  ) {
    throw new TypeError("A validated archive inventory is required");
  }
  assertLimit(
    inventory.compressedBytes,
    limits.compressedBytes,
    "compressed byte limit",
  );
  assertLimit(
    inventory.physicalEntryCount,
    limits.entries,
    "entry count limit",
  );

  const expectedByPath = new Map();
  const foldedPaths = new Map();
  let maximumEntryBytes = 0;
  let maximumPathBytes = 0;
  for (const entry of inventory.entries) {
    const path = validatePath(entry.path, limits);
    if (path !== entry.path) {
      throw new TypeError(
        `Non-canonical validated inventory path: ${entry.path}`,
      );
    }
    if (path.split("/", 1)[0] !== inventory.archiveRoot) {
      throw new TypeError(
        `Validated inventory path is outside archive root ${inventory.archiveRoot}: ${path}`,
      );
    }
    if (
      !["DIRECTORY", "FILE"].includes(entry.type) ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      !/^[0-9a-f]{64}$/u.test(entry.sha256)
    ) {
      throw new TypeError(`Invalid validated inventory entry: ${path}`);
    }
    assertLimit(entry.size, limits.entryBytes, "entry byte limit");
    if (expectedByPath.has(path)) {
      throw new TypeError(`Duplicate validated inventory path: ${path}`);
    }
    const folded = path.toLocaleLowerCase("en-US");
    const collision = foldedPaths.get(folded);
    if (collision && collision !== path) {
      throw new TypeError(
        `Validated inventory path case-folding collision: ${collision} and ${path}`,
      );
    }
    expectedByPath.set(path, entry);
    foldedPaths.set(folded, path);
    maximumEntryBytes = Math.max(maximumEntryBytes, entry.size);
    maximumPathBytes = Math.max(
      maximumPathBytes,
      Buffer.byteLength(path, "utf8"),
    );
  }

  const expectedOccurrences = new Map(
    [...expectedByPath.keys()].map((path) => [path, 1]),
  );
  for (const duplicate of inventory.duplicateEntries) {
    const expected = expectedByPath.get(duplicate.path);
    if (
      !expected ||
      duplicate.type !== expected.type ||
      duplicate.size !== expected.size ||
      duplicate.sha256 !== expected.sha256 ||
      !Number.isSafeInteger(duplicate.occurrenceCount) ||
      duplicate.occurrenceCount < 2 ||
      expectedOccurrences.get(duplicate.path) !== 1
    ) {
      throw new TypeError(
        `Invalid duplicate-entry inventory for ${String(duplicate.path)}`,
      );
    }
    expectedOccurrences.set(duplicate.path, duplicate.occurrenceCount);
  }
  const expectedPhysicalEntryCount = [...expectedOccurrences.values()].reduce(
    (sum, count) => sum + count,
    0,
  );
  if (inventory.physicalEntryCount !== expectedPhysicalEntryCount) {
    throw new TypeError("Validated physical entry count is inconsistent");
  }
  const expandedBytes = [...expectedByPath].reduce(
    (total, [path, entry]) =>
      total + entry.size * expectedOccurrences.get(path),
    0,
  );
  if (
    !Number.isSafeInteger(expandedBytes) ||
    inventory.expandedBytes !== expandedBytes
  ) {
    throw new TypeError("Validated expanded byte count is inconsistent");
  }
  assertLimit(expandedBytes, limits.expandedBytes, "expanded byte limit");

  const evidencePaths = new Set();
  let retainedEvidenceBytes = 0;
  for (const evidence of inventory.evidenceFiles) {
    const entry = expectedByPath.get(evidence?.path);
    if (
      !entry ||
      entry.type !== "FILE" ||
      evidencePaths.has(evidence.path) ||
      evidence.size !== entry.size ||
      evidence.sha256 !== entry.sha256
    ) {
      throw new TypeError(
        `Invalid retained legal-evidence inventory for ${String(evidence?.path)}`,
      );
    }
    evidencePaths.add(evidence.path);
    retainedEvidenceBytes += evidence.size;
  }
  assertLimit(
    retainedEvidenceBytes,
    limits.retainedEvidenceBytes,
    "retained evidence byte limit",
  );

  return {
    expectedByPath,
    expectedOccurrences,
    measurements: {
      compressedBytes: inventory.compressedBytes,
      expandedBytes,
      maximumEntryBytes,
      maximumPathBytes,
      physicalEntryCount: inventory.physicalEntryCount,
      retainedEvidenceBytes,
    },
  };
};

export const validateArchiveInventory = (
  inventory,
  { limits = ARCHIVE_LIMITS } = {},
) => analyzeArchiveInventory(inventory, limits).measurements;

export const materializePackageForScan = async (
  tarballPath,
  inventory,
  destinationRoot,
  { limits = ARCHIVE_LIMITS, excludedFileSuffixes = [] } = {},
) => {
  const excludedSuffixes = normalizeExcludedFileSuffixes(excludedFileSuffixes);
  const { expectedByPath, expectedOccurrences } = analyzeArchiveInventory(
    inventory,
    limits,
  );

  try {
    await mkdir(destinationRoot, { recursive: false });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(
        `Scan materialization requires a fresh scan destination`,
        {
          cause: error,
        },
      );
    }
    throw error;
  }

  const seenCounts = new Map();
  const pendingEntries = [];
  const abortController = new AbortController();
  let controlError;
  let physicalEntryCount = 0;
  let expandedBytes = 0;

  try {
    try {
      await list({
        file: tarballPath,
        strict: true,
        noResume: true,
        win32: false,
        signal: abortController.signal,
        onReadEntry: (entry) => {
          try {
            const rawPath = validatePath(entry.header?.path, limits);
            const path = validatePath(entry.path, limits);
            if (rawPath !== path) {
              throw new Error(
                `Tarball no longer matches the validated inventory: ${path}`,
              );
            }
            const expected = expectedByPath.get(path);
            const type = DIRECTORY_TYPES.has(entry.type) ? "DIRECTORY" : "FILE";
            if (
              !expected ||
              expected.type !== type ||
              (!REGULAR_FILE_TYPES.has(entry.type) &&
                !DIRECTORY_TYPES.has(entry.type))
            ) {
              throw new Error(
                `Tarball no longer matches the validated inventory: ${path}`,
              );
            }
            const size = Number(entry.size || 0);
            if (
              !Number.isSafeInteger(size) ||
              size < 0 ||
              size !== expected.size
            ) {
              throw new Error(
                `Tarball no longer matches the validated inventory: ${path}`,
              );
            }
            assertLimit(size, limits.entryBytes, "entry byte limit");
            physicalEntryCount += 1;
            assertLimit(
              physicalEntryCount,
              limits.entries,
              "entry count limit",
            );
            expandedBytes += size;
            assertLimit(
              expandedBytes,
              limits.expandedBytes,
              "expanded byte limit",
            );
            const occurrenceCount = (seenCounts.get(path) || 0) + 1;
            if (occurrenceCount > expectedOccurrences.get(path)) {
              throw new Error(
                `Tarball no longer matches the validated inventory: ${path}`,
              );
            }
            seenCounts.set(path, occurrenceCount);

            // Exclusions apply only to authenticated regular files. Checking
            // the entry type prevents a package directory such as
            // `_optPlug.node` from hiding otherwise scannable descendants.
            const excludedFromScan =
              type === "FILE" &&
              excludedSuffixes.some((suffix) =>
                path.toLowerCase().endsWith(suffix),
              );

            const pending = new Promise((resolveEntry, rejectEntry) => {
              const hash = createHash("sha256");
              const chunks = [];
              let received = 0;
              entry.on("data", (chunk) => {
                received += chunk.length;
                hash.update(chunk);
                if (type === "FILE" && !excludedFromScan) {
                  chunks.push(Buffer.from(chunk));
                }
              });
              entry.once("error", rejectEntry);
              entry.once("end", () => {
                void (async () => {
                  const digest = hash.digest("hex");
                  if (received !== size || digest !== expected.sha256) {
                    throw new Error(
                      `Tarball content no longer matches the validated inventory: ${path}`,
                    );
                  }
                  const target = materializedPath(destinationRoot, path);
                  if (occurrenceCount > 1) {
                    return;
                  }
                  if (type === "DIRECTORY") {
                    await mkdir(target, { recursive: true });
                  } else if (!excludedFromScan) {
                    await mkdir(dirname(target), { recursive: true });
                    await writeFile(target, Buffer.concat(chunks, received), {
                      flag: "wx",
                      mode: 0o600,
                    });
                  }
                })().then(resolveEntry, rejectEntry);
              });
              entry.resume();
            });
            pendingEntries.push(pending);
          } catch (error) {
            controlError = error;
            entry.resume();
            abortController.abort(error);
          }
        },
      });
    } catch (error) {
      throw controlError || error;
    }
    await Promise.all(pendingEntries);
    if (
      controlError ||
      physicalEntryCount !== inventory.physicalEntryCount ||
      [...expectedOccurrences].some(
        ([path, count]) => seenCounts.get(path) !== count,
      )
    ) {
      throw (
        controlError ||
        new Error("Tarball no longer matches the validated inventory")
      );
    }
    return join(destinationRoot, inventory.archiveRoot);
  } catch (error) {
    await Promise.allSettled(pendingEntries);
    await rm(destinationRoot, { recursive: true, force: true });
    throw error;
  }
};
