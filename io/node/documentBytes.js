import { PassThrough } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createInflateRaw, crc32 } from "node:zlib";
import lzma from "lzma-native";
import { DocumentLoadError, ResourceLimitError } from "../errors.js";

/** Count bytes at the specific resource boundary, including decoded output. */
export async function readDocumentBytes(stream, resource, maximumBytes) {
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of stream) {
    byteLength += chunk.length;
    if (byteLength > maximumBytes)
      throw new ResourceLimitError("The document byte limit was exceeded", {
        resource,
        limit: maximumBytes,
        observed: byteLength,
      });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, byteLength);
}

const invalidArchive = () =>
  new DocumentLoadError("The first ZIP entry is invalid or truncated", {
    phase: "content-decoding",
  });

/** A cursor retains only the unread part of a native stream chunk. ZIP must be
 * able to finish at its first entry, even while an HTTP response remains open.
 */
class DocumentByteCursor {
  #iterator;
  #pending = Buffer.alloc(0);
  constructor(stream) {
    this.#iterator = stream[Symbol.asyncIterator]();
  }
  prepend(bytes) {
    this.#pending = this.#pending.length
      ? Buffer.concat([bytes, this.#pending])
      : bytes;
  }
  async next() {
    if (this.#pending.length) {
      const chunk = this.#pending;
      this.#pending = Buffer.alloc(0);
      return chunk;
    }
    const { done, value } = await this.#iterator.next();
    return done ? Buffer.alloc(0) : value;
  }
  async read(length, allowIncomplete = false) {
    const chunks = [];
    let total = 0;
    while (total < length) {
      const chunk = await this.next();
      if (!chunk.length) {
        if (!allowIncomplete) throw invalidArchive();
        break;
      }
      const needed = length - total;
      chunks.push(chunk.subarray(0, needed));
      total += Math.min(needed, chunk.length);
      if (chunk.length > needed) this.prepend(chunk.subarray(needed));
    }
    return Buffer.concat(chunks, total);
  }
}

const readDeflatedEntry = async (
  cursor,
  compressedSize,
  dataDescriptor,
  config,
) => {
  const decoder = createInflateRaw();
  const reading = readDocumentBytes(
    decoder,
    "inputBytes",
    config.maxInputBytes,
  );
  // The read can fail while a write is pending. Retain that failure for the
  // caller without creating an unhandled rejection in the intervening turn.
  reading.catch(() => {});
  let offered = 0n;
  try {
    for (;;) {
      if (!dataDescriptor && offered === compressedSize) break;
      let chunk = await cursor.next();
      if (!chunk.length) break;
      if (!dataDescriptor && BigInt(chunk.length) > compressedSize - offered) {
        const needed = Number(compressedSize - offered);
        cursor.prepend(chunk.subarray(needed));
        chunk = chunk.subarray(0, needed);
      }
      const before = decoder.bytesWritten;
      offered += BigInt(chunk.length);
      await new Promise((resolve, reject) =>
        decoder.write(chunk, (error) => (error ? reject(error) : resolve())),
      );
      const consumed = decoder.bytesWritten - before;
      if (consumed < chunk.length) {
        cursor.prepend(chunk.subarray(consumed));
        break;
      }
    }
    decoder.end();
    return { output: await reading, consumed: decoder.bytesWritten };
  } catch (error) {
    decoder.destroy(error);
    await reading.catch(() => {});
    throw error;
  }
};

/** Java ZipInputStream reads one local entry; requiring a central directory or
 * choosing an ontology-looking filename would reject/change valid Java input.
 * Only envelope fields are handled here: Node owns DEFLATE and CRC validation.
 * See compression-provider-selection.md for the evaluated reuse alternatives.
 */
async function readFirstZipEntry(stream, config) {
  const cursor = new DocumentByteCursor(stream);
  let bytes = await cursor.read(30, true);
  if (bytes.length < 30 || bytes.readUInt32LE(0) !== 0x04034b50)
    return Buffer.alloc(0);
  const flags = bytes.readUInt16LE(6);
  const method = bytes.readUInt16LE(8);
  // eslint-disable-next-line no-bitwise -- ZIP's native general-purpose flag bits.
  const dataDescriptor = (flags & 8) !== 0;
  // eslint-disable-next-line no-bitwise -- Bit 0 declares encrypted entry data.
  const encrypted = (flags & 1) !== 0;
  if (encrypted || ![0, 8].includes(method) || (dataDescriptor && method !== 8))
    throw invalidArchive();
  let expectedCrc = bytes.readUInt32LE(14);
  let compressedSize = BigInt(bytes.readUInt32LE(18));
  let uncompressedSize = BigInt(bytes.readUInt32LE(22));
  const nameLength = bytes.readUInt16LE(26);
  const extraLength = bytes.readUInt16LE(28);
  const dataOffset = 30 + nameLength + extraLength;
  bytes = Buffer.concat([bytes, await cursor.read(nameLength + extraLength)]);
  // The JDK's default ZipInputStream charset is UTF-8, even without EFS.
  new TextDecoder("utf-8", { fatal: true }).decode(
    bytes.subarray(30, 30 + nameLength),
  );
  if (
    !dataDescriptor &&
    (compressedSize === 0xffffffffn || uncompressedSize === 0xffffffffn)
  ) {
    for (let offset = 30 + nameLength; offset + 4 <= dataOffset;) {
      const kind = bytes.readUInt16LE(offset);
      const size = bytes.readUInt16LE(offset + 2);
      const end = offset + 4 + size;
      if (end > dataOffset) break;
      offset += 4;
      if (kind === 1) {
        if (uncompressedSize === 0xffffffffn) {
          if (offset + 8 > end) throw invalidArchive();
          uncompressedSize = bytes.readBigUInt64LE(offset);
          offset += 8;
        }
        if (compressedSize === 0xffffffffn) {
          if (offset + 8 > end) throw invalidArchive();
          compressedSize = bytes.readBigUInt64LE(offset);
        }
        break;
      }
      offset = end;
    }
  }
  let output;
  let consumed;
  if (method === 0) {
    if (compressedSize > config.maxInputBytes)
      throw new ResourceLimitError("The document byte limit was exceeded", {
        resource: "inputBytes",
        limit: config.maxInputBytes,
      });
    consumed = Number(compressedSize);
    output = await cursor.read(consumed);
  } else {
    ({ output, consumed } = await readDeflatedEntry(
      cursor,
      compressedSize,
      dataDescriptor,
      config,
    ));
  }
  if (dataDescriptor) {
    let descriptor = await cursor.read(4);
    if (descriptor.readUInt32LE(0) === 0x08074b50)
      descriptor = await cursor.read(4);
    const zip64 = consumed > 0xffffffff || output.length > 0xffffffff;
    descriptor = Buffer.concat([descriptor, await cursor.read(zip64 ? 16 : 8)]);
    expectedCrc = descriptor.readUInt32LE(0);
    compressedSize = zip64
      ? descriptor.readBigUInt64LE(4)
      : BigInt(descriptor.readUInt32LE(4));
    uncompressedSize = zip64
      ? descriptor.readBigUInt64LE(12)
      : BigInt(descriptor.readUInt32LE(8));
  }
  if (
    compressedSize !== BigInt(consumed) ||
    uncompressedSize !== BigInt(output.length) ||
    expectedCrc !== crc32(output)
  )
    throw invalidArchive();
  return output;
}

const decoderFor = (encoding) => {
  if (encoding === "gzip") return createGunzip();
  if (encoding === "deflate") return createInflateRaw();
  // No memory ceiling is added. The released Java XZInputStream has none.
  if (encoding === "xz")
    return lzma.createStream("streamDecoder", { flags: lzma.CONCATENATED });
  return undefined;
};

/** Java's content encoding and original-source filename are separate layers.
 * The no-known-content-encoding branch alone applies DocumentSources.wrap's BOM
 * removal. Keep this observed order; normalizing it would change Java bytes.
 */
export async function readDecodedDocumentBytes(
  source,
  {
    encoding,
    disposition,
    documentIRI,
    config,
    signal,
    rawByteResource = "inputBytes",
    maximumRawBytes = config.maxInputBytes,
  },
) {
  const countRawBytes = async function* (chunks) {
    let observed = 0;
    for await (const chunk of chunks) {
      observed += chunk.length;
      if (observed > maximumRawBytes)
        throw new ResourceLimitError("The document byte limit was exceeded", {
          resource: rawByteResource,
          limit: maximumRawBytes,
          observed,
        });
      yield chunk;
    }
  };
  const contentDecoder = decoderFor(encoding);
  const fileName =
    /.*filename="([^\s;]*)".*/u.exec(disposition ?? "")?.[1] ??
    documentIRI.value;
  const suffix = fileName.toLowerCase().match(/\.(gz|xz|zip)$/u)?.[1];
  const decoders = contentDecoder ? [contentDecoder] : [];
  if (suffix && suffix !== "zip")
    decoders.push(decoderFor(suffix === "gz" ? "gzip" : "xz"));
  const stream = new PassThrough();
  const producerCancellation = new AbortController();
  const producing = pipeline(source, countRawBytes, ...decoders, stream, {
    signal: AbortSignal.any([signal, producerCancellation.signal]),
  });
  producing.catch(() => {});
  let bytes;
  try {
    bytes =
      suffix === "zip"
        ? await readFirstZipEntry(stream, config)
        : await readDocumentBytes(stream, "inputBytes", config.maxInputBytes);
    // A first ZIP entry has its own EOF. Stop the unused HTTP/archive tail,
    // while ordinary decoding must await native finalization and its checks.
    if (suffix === "zip") {
      producerCancellation.abort();
      await producing.catch(() => {});
    } else await producing;
  } finally {
    producerCancellation.abort();
    await producing.catch(() => {});
  }
  if (!contentDecoder) {
    for (const bom of [
      [0, 0, 254, 255],
      [255, 254, 0, 0],
      [239, 187, 191],
      [254, 255],
      [255, 254],
    ]) {
      if (
        bytes.length >= bom.length &&
        bom.every((byte, index) => bytes[index] === byte)
      ) {
        bytes = bytes.subarray(bom.length);
        break;
      }
    }
  }
  if (bytes.length > config.maxInputBytes)
    throw new ResourceLimitError("The document byte limit was exceeded", {
      resource: "inputBytes",
      limit: config.maxInputBytes,
      observed: bytes.length,
    });
  return bytes;
}
