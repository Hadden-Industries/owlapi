import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { crc32, gunzipSync, inflateRawSync } from "node:zlib";

const TAR_BLOCK_SIZE = 512;
const ZIP_CENTRAL_FILE_HEADER_SIZE = 46;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIZE = 22;
const ZIP_LOCAL_FILE_HEADER_SIZE = 30;
const ZIP_MAX_COMMENT_BYTES = 65_535;
const ZIP_MAX_ENTRIES = 10_000;
const ZIP_MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
const ZIP_CENTRAL_FILE_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_FLAG_ENCRYPTED = 0x0001;
const ZIP_FLAG_UTF8 = 0x0800;

const zipFlagIsSet = (flags, flag) => Math.floor(flags / flag) % 2 === 1;

const readNullTerminatedText = (buffer, start, length) => {
  const field = buffer.subarray(start, start + length);
  const terminator = field.indexOf(0);
  return field
    .subarray(0, terminator === -1 ? field.length : terminator)
    .toString();
};

const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const REQUIRED_PACKED_PATHS = Object.freeze([
  "API.md",
  "CHANGELOG.md",
  "LICENSE",
  "LICENSES/Apache-2.0.txt",
  "NOTICE",
  "README.md",
  "apibinding/index.js",
  "docs/compatibility/capabilities.json",
  "docs/compatibility/java-api-surface.json",
  "docs/compatibility/java-api-surface.md",
  "formats/index.js",
  "index.js",
  "io/index.js",
  "model/index.js",
  "package.json",
]);
const ALLOWED_PACKED_PREFIXES = Object.freeze([
  "apibinding/",
  "formats/",
  "internal/",
  "io/",
  "model/",
]);
const ALLOWED_PACKED_EXACT_PATHS = new Set(REQUIRED_PACKED_PATHS);

export const sha256Buffer = (buffer) =>
  createHash("sha256").update(buffer).digest("hex");

export const sha256File = (path) => sha256Buffer(readFileSync(path));

const findZipEndOfCentralDirectory = (archive) => {
  const minimumOffset = Math.max(
    0,
    archive.length - ZIP_END_OF_CENTRAL_DIRECTORY_SIZE - ZIP_MAX_COMMENT_BYTES,
  );
  for (
    let offset = archive.length - ZIP_END_OF_CENTRAL_DIRECTORY_SIZE;
    offset >= minimumOffset;
    offset -= 1
  ) {
    if (
      archive.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE &&
      offset +
        ZIP_END_OF_CENTRAL_DIRECTORY_SIZE +
        archive.readUInt16LE(offset + 20) ===
        archive.length
    ) {
      return offset;
    }
  }
  throw new Error("ZIP archive has no valid end-of-central-directory record.");
};

const assertSafeZipPath = (path) => {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.includes("\\") ||
    path.includes(":") ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(
      `ZIP archive contains unsafe file path ${JSON.stringify(path)}.`,
    );
  }
  return path;
};

/**
 * Read the central directory and file payloads directly so artifact
 * qualification remains independent of host ZIP tools and undeclared
 * packages. Only ordinary stored or deflated files are accepted; encrypted,
 * multi-disk, ZIP64, duplicate, unsafe, or corrupt records fail closed.
 */
export const readZipArchiveFiles = (archiveInput) => {
  const archive = Buffer.from(archiveInput);
  if (archive.length < ZIP_END_OF_CENTRAL_DIRECTORY_SIZE) {
    throw new Error("ZIP archive is too short.");
  }

  const endOffset = findZipEndOfCentralDirectory(archive);
  const diskNumber = archive.readUInt16LE(endOffset + 4);
  const centralDirectoryDisk = archive.readUInt16LE(endOffset + 6);
  const entriesOnDisk = archive.readUInt16LE(endOffset + 8);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  const centralDirectoryBytes = archive.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = archive.readUInt32LE(endOffset + 16);
  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== entryCount
  ) {
    throw new Error("Multi-disk ZIP archives are not supported.");
  }
  if (
    entryCount === 0xffff ||
    centralDirectoryBytes === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new Error("ZIP64 archives are not supported.");
  }
  if (entryCount > ZIP_MAX_ENTRIES) {
    throw new Error("ZIP archive exceeds the entry-count safety limit.");
  }
  if (centralDirectoryOffset + centralDirectoryBytes !== endOffset) {
    throw new Error("ZIP central-directory bounds are invalid.");
  }

  const entries = [];
  const exactPaths = new Set();
  const foldedPaths = new Map();
  let totalUncompressedBytes = 0;
  let centralOffset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      centralOffset + ZIP_CENTRAL_FILE_HEADER_SIZE > endOffset ||
      archive.readUInt32LE(centralOffset) !== ZIP_CENTRAL_FILE_SIGNATURE
    ) {
      throw new Error(
        "ZIP central directory contains a malformed file record.",
      );
    }

    const flags = archive.readUInt16LE(centralOffset + 8);
    const method = archive.readUInt16LE(centralOffset + 10);
    const expectedCrc32 = archive.readUInt32LE(centralOffset + 16);
    const compressedBytes = archive.readUInt32LE(centralOffset + 20);
    const uncompressedBytes = archive.readUInt32LE(centralOffset + 24);
    const nameBytes = archive.readUInt16LE(centralOffset + 28);
    const extraBytes = archive.readUInt16LE(centralOffset + 30);
    const commentBytes = archive.readUInt16LE(centralOffset + 32);
    const startDisk = archive.readUInt16LE(centralOffset + 34);
    const localOffset = archive.readUInt32LE(centralOffset + 42);
    const centralRecordBytes =
      ZIP_CENTRAL_FILE_HEADER_SIZE + nameBytes + extraBytes + commentBytes;
    if (centralOffset + centralRecordBytes > endOffset || startDisk !== 0) {
      throw new Error("ZIP central directory contains invalid file bounds.");
    }
    if (zipFlagIsSet(flags, ZIP_FLAG_ENCRYPTED)) {
      throw new Error("Encrypted ZIP entries are not supported.");
    }
    if (method !== 0 && method !== 8) {
      throw new Error(
        `ZIP entry uses unsupported compression method ${method}.`,
      );
    }

    const encodedPath = archive.subarray(
      centralOffset + ZIP_CENTRAL_FILE_HEADER_SIZE,
      centralOffset + ZIP_CENTRAL_FILE_HEADER_SIZE + nameBytes,
    );
    if (
      !zipFlagIsSet(flags, ZIP_FLAG_UTF8) &&
      encodedPath.some((byte) => byte >= 0x80)
    ) {
      throw new Error("ZIP entry names must be UTF-8 or portable ASCII.");
    }
    const path = assertSafeZipPath(encodedPath.toString("utf8"));
    if (!Buffer.from(path, "utf8").equals(encodedPath)) {
      throw new Error(
        `ZIP archive contains an invalid UTF-8 path ${JSON.stringify(path)}.`,
      );
    }
    if (exactPaths.has(path)) {
      throw new Error(`ZIP archive contains duplicate path ${path}.`);
    }
    const foldedPath = path.toLocaleLowerCase("en-US");
    const existingFoldedPath = foldedPaths.get(foldedPath);
    if (existingFoldedPath && existingFoldedPath !== path) {
      throw new Error(
        `ZIP archive contains case collision ${existingFoldedPath} / ${path}.`,
      );
    }
    exactPaths.add(path);
    foldedPaths.set(foldedPath, path);

    if (
      localOffset + ZIP_LOCAL_FILE_HEADER_SIZE > centralDirectoryOffset ||
      archive.readUInt32LE(localOffset) !== ZIP_LOCAL_FILE_SIGNATURE
    ) {
      throw new Error(`ZIP entry ${path} has an invalid local header.`);
    }
    const localFlags = archive.readUInt16LE(localOffset + 6);
    const localMethod = archive.readUInt16LE(localOffset + 8);
    const localNameBytes = archive.readUInt16LE(localOffset + 26);
    const localExtraBytes = archive.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + ZIP_LOCAL_FILE_HEADER_SIZE;
    const dataStart = localNameStart + localNameBytes + localExtraBytes;
    const dataEnd = dataStart + compressedBytes;
    if (
      localFlags !== flags ||
      localMethod !== method ||
      dataEnd > centralDirectoryOffset ||
      !archive
        .subarray(localNameStart, localNameStart + localNameBytes)
        .equals(encodedPath)
    ) {
      throw new Error(`ZIP entry ${path} disagrees with its local header.`);
    }

    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > ZIP_MAX_UNCOMPRESSED_BYTES) {
      throw new Error(
        "ZIP archive exceeds the uncompressed-size safety limit.",
      );
    }
    const compressed = archive.subarray(dataStart, dataEnd);
    const content =
      method === 0
        ? Buffer.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: uncompressedBytes });
    if (
      content.length !== uncompressedBytes ||
      (method === 0 && compressedBytes !== uncompressedBytes) ||
      crc32(content) !== expectedCrc32
    ) {
      throw new Error(`ZIP entry ${path} failed size or CRC validation.`);
    }
    entries.push({ path, bytes: content.length, content });
    centralOffset += centralRecordBytes;
  }
  if (centralOffset !== endOffset) {
    throw new Error("ZIP central directory contains trailing records.");
  }
  return entries;
};

/**
 * Recursive cleanup is permitted only for a unique child directory of the
 * expected temporary root. `path.relative` keeps the containment check correct
 * across Windows drive-letter paths and POSIX paths without string-prefix traps.
 */
export const isStrictDescendantPath = (parentPath, candidatePath) => {
  const relativePath = relative(resolve(parentPath), resolve(candidatePath));
  return (
    relativePath !== "" &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
};

export const assertReleasePacklist = (paths) => {
  const uniquePaths = new Set(paths);
  if (uniquePaths.size !== paths.length) {
    throw new Error("Release packlist contains duplicate paths.");
  }
  for (const path of paths) {
    const allowed =
      ALLOWED_PACKED_EXACT_PATHS.has(path) ||
      ALLOWED_PACKED_PREFIXES.some((prefix) => path.startsWith(prefix));
    const forbiddenProductionShape =
      /(?:^|\/)(?:dist|build|fixtures?|__tests__)(?:\/|$)|(?:^|\/)test(?:\/|$)|\.test\.(?:js|mjs)$|\.d\.ts$|\.map$|\.min\.js$/u.test(
        path,
      );
    if (!allowed || forbiddenProductionShape) {
      throw new Error(`Release packlist contains forbidden path ${path}.`);
    }
  }
  for (const requiredPath of REQUIRED_PACKED_PATHS) {
    if (!uniquePaths.has(requiredPath)) {
      throw new Error(`Release packlist is missing ${requiredPath}.`);
    }
  }
};

/**
 * Inspect archive headers directly so release qualification does not depend on
 * a host-provided tar executable or an undeclared transitive package. npm pack
 * emits the portable ustar subset handled here; unsupported entry types fail
 * closed in the caller rather than being silently accepted.
 */
const readGzipTarEntries = (archive) => {
  const tar = gunzipSync(archive);
  const entries = [];

  for (let offset = 0; offset + TAR_BLOCK_SIZE <= tar.length;) {
    const header = tar.subarray(offset, offset + TAR_BLOCK_SIZE);
    if (header.every((byte) => byte === 0)) {
      break;
    }

    const name = readNullTerminatedText(header, 0, 100);
    const prefix = readNullTerminatedText(header, 345, 155);
    const archivePath = prefix ? `${prefix}/${name}` : name;
    const sizeText = readNullTerminatedText(header, 124, 12).trim();
    const size = Number.parseInt(sizeText || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Invalid tar entry size for ${archivePath}.`);
    }

    const type = readNullTerminatedText(header, 156, 1) || "0";
    if (type === "0") {
      if (!archivePath.startsWith("package/")) {
        throw new Error(
          `Packed file is outside the npm package root: ${archivePath}`,
        );
      }
      const path = archivePath.slice("package/".length);
      if (!path || path.split("/").includes("..")) {
        throw new Error(`Packed file has an unsafe path: ${archivePath}`);
      }
      const contentOffset = offset + TAR_BLOCK_SIZE;
      entries.push({
        path,
        size,
        content: Buffer.from(tar.subarray(contentOffset, contentOffset + size)),
      });
    } else if (type !== "5") {
      throw new Error(`Unsupported tar entry type ${type} for ${archivePath}.`);
    }

    offset +=
      TAR_BLOCK_SIZE + Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
  }

  return entries;
};

export const inspectGzipTar = (archive) =>
  readGzipTarEntries(archive).map(({ path, size }) => ({ path, size }));

export const readGzipTarFile = (archive, requestedPath) => {
  const matches = readGzipTarEntries(archive).filter(
    ({ path }) => path === requestedPath,
  );
  if (matches.length === 0) {
    throw new Error(`Packed file ${requestedPath} is absent.`);
  }
  if (matches.length !== 1) {
    throw new Error(`Packed file ${requestedPath} occurs more than once.`);
  }
  return matches[0].content;
};

export const formatSha256Sums = (entries) =>
  `${[...entries]
    .sort((left, right) => compareCodeUnits(left.fileName, right.fileName))
    .map(({ fileName, sha256 }) => `${sha256}  ${fileName}`)
    .join("\n")}\n`;
