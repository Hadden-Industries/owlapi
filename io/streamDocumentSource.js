import { documentSourceMetadata } from "./documentSourceMetadata.js";

/** UTF-8 ontology document. Each open supplies independent bytes for one read. */
export class StreamDocumentSource {
  #open;
  #metadata;

  constructor(open, metadata) {
    if (typeof open !== "function")
      throw new TypeError("open must be a factory for byte iterables");
    this.#open = open;
    this.#metadata = documentSourceMetadata(metadata);
    Object.freeze(this);
  }

  openBytes(signal) {
    return this.#open(signal);
  }

  getDocumentIRI() {
    return this.#metadata.documentIRI;
  }

  getContentType() {
    return this.#metadata.contentType;
  }

  getFileName() {
    return this.#metadata.fileName;
  }

  getFormat() {
    return this.#metadata.format;
  }
}
