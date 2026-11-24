import { documentSourceMetadata } from "./documentSourceMetadata.js";

export class StringDocumentSource {
  #metadata;
  #text;

  constructor(text, metadata) {
    if (typeof text !== "string") {
      throw new TypeError("text must be a string");
    }
    this.#text = text;
    this.#metadata = documentSourceMetadata(metadata);
    Object.freeze(this);
  }

  getText() {
    return this.#text;
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
