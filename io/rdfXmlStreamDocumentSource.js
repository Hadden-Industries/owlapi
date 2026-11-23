import { OWLDocumentFormats } from "../formats/owlDocumentFormats.js";
import { IRI } from "../model/structural.js";

/** A UTF-8 RDF/XML source. Each open must return a fresh iterable of bytes. */
export class RDFXMLStreamDocumentSource {
  #open;
  #documentIRI;

  constructor(open, { documentIRI } = {}) {
    if (typeof open !== "function") {
      throw new TypeError("open must be a factory for byte iterables");
    }
    this.#open = open;
    this.#documentIRI =
      documentIRI === undefined ? undefined : IRI.create(documentIRI);
    Object.freeze(this);
  }

  openBytes(signal) {
    return this.#open(signal);
  }

  getDocumentIRI() {
    return this.#documentIRI;
  }

  getFormat() {
    return OWLDocumentFormats.RDF_XML;
  }
}
