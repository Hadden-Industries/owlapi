import { IRI } from "../model/structural.js";

const optionalString = (value, name) => {
  if (value !== undefined && typeof value !== "string") {
    throw new TypeError(`${name} must be a string when provided`);
  }
  return value;
};

export class StringDocumentSource {
  #contentType;
  #documentIRI;
  #fileName;
  #text;

  constructor(text, { contentType, documentIRI, fileName } = {}) {
    if (typeof text !== "string") {
      throw new TypeError("text must be a string");
    }
    this.#text = text;
    this.#documentIRI =
      documentIRI === undefined ? undefined : IRI.create(documentIRI);
    this.#contentType = optionalString(contentType, "contentType");
    this.#fileName = optionalString(fileName, "fileName");
    Object.freeze(this);
  }

  getText() {
    return this.#text;
  }

  getDocumentIRI() {
    return this.#documentIRI;
  }

  getContentType() {
    return this.#contentType;
  }

  getFileName() {
    return this.#fileName;
  }
}
