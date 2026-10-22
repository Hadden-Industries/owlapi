import { inflateRawSync } from "node:zlib";

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
export const readZipArchiveFilesWith = (archiveInput, { crc32 }) => {
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
        : inflateRawSync(compressed, {
            maxOutputLength: Math.max(uncompressedBytes, 1),
          });
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
