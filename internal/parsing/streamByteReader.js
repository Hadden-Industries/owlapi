import { ResourceLimitError } from "../../io/errors.js";
import { readDocumentSourceMetadata } from "../../io/documentSourceMetadata.js";
import { StringDocumentSource } from "../../io/stringDocumentSource.js";
import { awaitAbortableOperation } from "../loading/awaitAbortableOperation.js";
import { scheduleOperationDeadline } from "../loading/operationDeadline.js";
import { DEFAULT_CHUNK_SIZE } from "./rdf/streamPrimitives.js";
import { skipTrivia } from "./asciiLeadingTrivia.js";

const typedArray = Object.getOwnPropertyDescriptors(
  Object.getPrototypeOf(Uint8Array.prototype),
);
const opened = new WeakSet();

function requireFreshReader(reader) {
  if (opened.has(reader))
    throw new TypeError(
      "The source must open a fresh byte stream for each read",
    );
}

function byteIterator(bytes) {
  if (typeof bytes?.getReader === "function") {
    requireFreshReader(bytes);
    const reader = bytes.getReader();
    opened.add(bytes);
    return {
      async next() {
        const result = await reader.read();
        if (result.done) reader.releaseLock();
        return result;
      },
      async return() {
        try {
          await reader.cancel();
        } finally {
          reader.releaseLock();
        }
      },
    };
  }
  const iterator =
    bytes?.[Symbol.asyncIterator]?.() ?? bytes?.[Symbol.iterator]?.();
  if (!iterator)
    throw new TypeError(
      "The source must open a byte iterable or ReadableStream",
    );
  requireFreshReader(iterator);
  opened.add(iterator);
  return iterator;
}

/** Count each producer chunk before exposing any portion to a decoder or parser. */
export async function* readStreamBytes(
  source,
  configuration,
  upstream = configuration.signal,
  byteLimit = "maxInputBytes",
) {
  const controller = new AbortController();
  const { signal } = controller;
  const producer = new AbortController();
  const stopProducer = () => producer.abort(signal.reason);
  signal.addEventListener("abort", stopProducer, { once: true });
  const onAbort = () => controller.abort(upstream.reason);
  if (upstream?.aborted) onAbort();
  else upstream?.addEventListener("abort", onAbort, { once: true });
  const cancelDeadline = scheduleOperationDeadline(
    configuration.timeoutMs,
    () =>
      controller.abort(
        new ResourceLimitError("The ontology byte stream timed out", {
          resource: "timeoutMs",
          limit: configuration.timeoutMs,
        }),
      ),
  );
  let iterator;
  let finished = false;
  let closing = false;
  let failed = false;
  const close = () =>
    Promise.resolve()
      .then(() => iterator?.return?.())
      .catch(() => {});
  let observed = 0;
  try {
    signal.throwIfAborted();
    await awaitAbortableOperation(
      Promise.resolve(source.openBytes(producer.signal)).then((bytes) => {
        iterator = byteIterator(bytes);
        if (closing) void close();
      }),
      signal,
    );
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await awaitAbortableOperation(
        iterator.next(),
        signal,
      );
      if (done) {
        finished = true;
        break;
      }
      if (typedArray[Symbol.toStringTag].get.call(value) !== "Uint8Array")
        throw new TypeError("The source must yield Uint8Array chunks");
      const length = typedArray.byteLength.get.call(value);
      observed += length;
      if (observed > configuration[byteLimit])
        throw new ResourceLimitError(
          "The ontology input byte limit was exceeded",
          {
            resource: byteLimit,
            limit: configuration[byteLimit],
            observed,
          },
        );
      const buffer = typedArray.buffer.get.call(value);
      const offset = typedArray.byteOffset.get.call(value);
      for (let start = 0; start < length; start += DEFAULT_CHUNK_SIZE) {
        signal.throwIfAborted();
        yield new Uint8Array(
          buffer,
          offset + start,
          Math.min(DEFAULT_CHUNK_SIZE, length - start),
        );
      }
    }
  } catch (cause) {
    failed = true;
    throw cause;
  } finally {
    try {
      if (!finished) {
        closing = true;
        producer.abort(signal.reason);
        if (iterator) {
          const stopped = close();
          if (!failed && !signal.aborted)
            await awaitAbortableOperation(stopped, signal);
        }
      }
    } finally {
      cancelDeadline();
      upstream?.removeEventListener?.("abort", onAbort);
      signal.removeEventListener("abort", stopProducer);
    }
  }
}

/** Preserve UTF-8 boundaries across arbitrary producer chunks. */
export function decodeStreamText(
  source,
  configuration,
  signal,
  invalidEncoding,
) {
  return decodeUtf8Chunks(
    readStreamBytes(source, configuration, signal),
    invalidEncoding,
  );
}

export async function* decodeUtf8Chunks(chunks, invalidEncoding) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const decode = (bytes, stream) => {
    try {
      return decoder.decode(bytes, { stream });
    } catch (cause) {
      throw invalidEncoding ? invalidEncoding(cause) : cause;
    }
  };
  for await (const bytes of chunks) {
    const text = decode(bytes, true);
    if (text) yield text;
  }
  const tail = decode(undefined, false);
  if (tail) yield tail;
}

/** Text-only parsers receive the original string contract on every attempt. A
 * detector needs only its bounded prefix after leading whitespace/comments. */
export async function streamTextSource(source, configuration, sniff = false) {
  const parts = [];
  let remaining = sniff ? configuration.maxSniffBytes : Infinity;
  let leadingTrivia = sniff;
  const state = { inComment: false };
  if (remaining > 0) {
    for await (let text of decodeStreamText(source, configuration)) {
      if (leadingTrivia) {
        text = text.slice(skipTrivia(text, 0, state));
        if (!text) continue;
        leadingTrivia = false;
      }
      parts.push(text.slice(0, remaining));
      remaining -= text.length;
      if (remaining <= 0) break;
    }
  }
  return new StringDocumentSource(
    parts.join(""),
    readDocumentSourceMetadata(source),
  );
}
