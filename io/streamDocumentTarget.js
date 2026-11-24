const targetSinks = new WeakMap();

/** A sink receives a single pass over the selected storer's UTF-8 document. */
export class StreamDocumentTarget {
  constructor(sink) {
    if (typeof sink !== "function")
      throw new TypeError("The target requires a chunk sink");
    targetSinks.set(this, sink);
    Object.freeze(this);
  }
}

export const isStreamDocumentTarget = (target) => targetSinks.has(target);

export async function writeStreamDocumentTarget(target, byteChunks) {
  const sink = targetSinks.get(target);
  if (!sink) throw new TypeError("target must be a StreamDocumentTarget");
  let complete = false;
  const document =
    typeof byteChunks?.[Symbol.asyncIterator] === "function"
      ? (async function* () {
          yield* byteChunks;
          complete = true;
        })()
      : (function* () {
          yield* byteChunks;
          complete = true;
        })();
  try {
    await sink(document);
    if (!complete)
      throw new TypeError(
        "The sink must consume the complete ontology document",
      );
  } finally {
    await document.return();
  }
}
