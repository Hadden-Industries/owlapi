export let isFunctionalSyntaxStreamDocumentTarget;

/** A Functional Syntax target whose sink consumes the complete iterable of text chunks. */
export class FunctionalSyntaxStreamDocumentTarget {
  #sink;

  static {
    isFunctionalSyntaxStreamDocumentTarget = (value) =>
      typeof value === "object" && value !== null && #sink in value;
  }

  constructor(sink) {
    if (typeof sink !== "function")
      throw new TypeError("The target requires a chunk sink");
    this.#sink = sink;
    Object.freeze(this);
  }

  /** @internal Called by the selected ontology storer. */
  async writeChunks(chunks) {
    let complete = false;
    const document = (function* () {
      yield* chunks;
      complete = true;
    })();
    try {
      await this.#sink(document);
      if (!complete)
        throw new TypeError(
          "The sink must consume the complete ontology document",
        );
    } finally {
      document.return();
    }
  }
}
