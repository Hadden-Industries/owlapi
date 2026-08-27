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
        segment === "." ||
        segment === ".." ||
        containsControlCharacter(segment) ||
        /[<>:"|?*]/u.test(segment) ||
        /[. ]$/u.test(segment) ||
        WINDOWS_RESERVED_NAME.test(segment),
    )
  ) {
    throw new Error(`Unsafe archive path: ${path}`);
  }
  if (segments[0] !== "package") {
    throw new Error(
      `Archive entry is outside the expected package root: ${path}`,
    );
  }
  return normalized;
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
  const evidenceFiles = [];
  const pendingEntries = [];
  const exactPaths = new Set();
  const foldedPaths = new Map();
  const abortController = new AbortController();
  let controlError;
  let expandedBytes = 0;
  let retainedEvidenceBytes = 0;

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
          if (exactPaths.has(path)) {
            throw new Error(`Duplicate archive path: ${path}`);
          }
          const folded = path.toLocaleLowerCase("en-US");
          const collision = foldedPaths.get(folded);
          if (collision && collision !== path) {
            throw new Error(
              `Archive path case-folding collision: ${collision} and ${path}`,
            );
          }
          exactPaths.add(path);
          foldedPaths.set(folded, path);

          assertLimit(exactPaths.size, limits.entries, "entry count limit");
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
                entries.push({
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

  entries.sort((left, right) => compareCodeUnits(left.path, right.path));
  evidenceFiles.sort((left, right) => compareCodeUnits(left.path, right.path));
  const packageEntry = entries.find(
    ({ path, type }) => path === "package/package.json" && type === "FILE",
  );
  if (!packageEntry) {
    throw new Error("Archive is missing package/package.json");
  }
  // package.json is always needed for identity even though it is not classified
  // as legal evidence. Read it in one bounded second pass to avoid retaining all
  // ordinary source files in memory during the inventory pass.
  let packageBytes;
  await list({
    file: tarballPath,
    strict: true,
    win32: false,
    filter: (path) => path.replace(/\/$/u, "") === "package/package.json",
    onReadEntry: (entry) => {
      const chunks = [];
      entry.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      entry.once("end", () => {
        packageBytes = Buffer.concat(chunks);
      });
    },
  });
  if (!packageBytes || packageBytes.length !== packageEntry.size) {
    throw new Error("Unable to read package/package.json from archive");
  }
  let packageMetadata;
  try {
    packageMetadata = JSON.parse(UTF8_DECODER.decode(packageBytes));
  } catch (error) {
    throw new Error("package/package.json is not valid UTF-8 JSON", {
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
    compressedBytes: compressed.size,
    expandedBytes,
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

export const materializePackageForScan = async (
  tarballPath,
  inventory,
  destinationRoot,
  { limits = ARCHIVE_LIMITS } = {},
) => {
  if (!Array.isArray(inventory?.entries)) {
    throw new TypeError("A validated archive inventory is required");
  }
  const expectedByPath = new Map();
  for (const entry of inventory.entries) {
    if (expectedByPath.has(entry.path)) {
      throw new TypeError(`Duplicate validated inventory path: ${entry.path}`);
    }
    expectedByPath.set(entry.path, entry);
  }

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

  const seen = new Set();
  const pendingEntries = [];
  const abortController = new AbortController();
  let controlError;

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
            if (rawPath !== path || seen.has(path)) {
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
            seen.add(path);

            const pending = new Promise((resolveEntry, rejectEntry) => {
              const hash = createHash("sha256");
              const chunks = [];
              let received = 0;
              entry.on("data", (chunk) => {
                received += chunk.length;
                hash.update(chunk);
                if (type === "FILE") {
                  chunks.push(Buffer.from(chunk));
                }
              });
              entry.once("error", rejectEntry);
              entry.once("end", () => {
                void (async () => {
                  const digest = hash.digest("hex");
                  if (
                    received !== expected.size ||
                    digest !== expected.sha256
                  ) {
                    throw new Error(
                      `Tarball content no longer matches the validated inventory: ${path}`,
                    );
                  }
                  const target = materializedPath(destinationRoot, path);
                  if (type === "DIRECTORY") {
                    await mkdir(target, { recursive: true });
                  } else {
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
      seen.size !== expectedByPath.size ||
      [...expectedByPath.keys()].some((path) => !seen.has(path))
    ) {
      throw (
        controlError ||
        new Error("Tarball no longer matches the validated inventory")
      );
    }
    return join(destinationRoot, "package");
  } catch (error) {
    await Promise.allSettled(pendingEntries);
    await rm(destinationRoot, { recursive: true, force: true });
    throw error;
  }
};
