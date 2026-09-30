import { IRI } from "../model/structural.js";
import { validateFormatSelection } from "../internal/parsing/formatSelection.js";

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
  #format;
  #text;

  constructor(text, { contentType, documentIRI, fileName, format } = {}) {
    if (typeof text !== "string") {
      throw new TypeError("text must be a string");
    }
    this.#text = text;
    this.#documentIRI =
      documentIRI === undefined ? undefined : IRI.create(documentIRI);
    this.#contentType = optionalString(contentType, "contentType");
    this.#fileName = optionalString(fileName, "fileName");
    validateFormatSelection(format);
    this.#format = format;
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

  getFormat() {
    return this.#format;
  }
}
