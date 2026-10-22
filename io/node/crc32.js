import lzma from "lzma-native";

// The binding copies each input into native memory. Bound each copy rather
// than duplicating a complete, potentially unbounded decompressed ZIP entry.
const CRC32_CHUNK_BYTES = 64 * 1024;

/** Return the unsigned IEEE CRC32 of raw Buffer bytes, with an initial seed of 0. */
export function crc32(bytes) {
  if (!Buffer.isBuffer(bytes)) {
    throw new TypeError("CRC32 input must be a Buffer.");
  }
  let checksum = 0;
  for (let offset = 0; offset < bytes.length; offset += CRC32_CHUNK_BYTES) {
    checksum = lzma.crc32(
      bytes.subarray(offset, offset + CRC32_CHUNK_BYTES),
      checksum,
    );
  }
  return checksum;
}
