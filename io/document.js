import { IRI } from "../model/index.js";

const optionalString = (value, name) => {
  if (value !== undefined && typeof value !== "string") {
    throw new TypeError(`${name} must be a string when provided`);
  }
  return value;
};

const stringList = (values, name) => {
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== "string" || value.length === 0)
  ) {
    throw new TypeError(`${name} must be an array of non-empty strings`);
  }
  return Object.freeze([...values]);
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

export class OWLDocumentFormat {
  constructor({
    extensions = [],
    isDataset = false,
    isRdf = false,
    key,
    mediaTypes = [],
    supportsPrefixes = false,
  }) {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("format key must be a non-empty string");
    }
    if (
      typeof isDataset !== "boolean" ||
      typeof isRdf !== "boolean" ||
      typeof supportsPrefixes !== "boolean"
    ) {
      throw new TypeError("format capability flags must be booleans");
    }
    this.key = key;
    this.mediaTypes = stringList(mediaTypes, "mediaTypes");
    this.extensions = stringList(extensions, "extensions");
    this.supportsPrefixes = supportsPrefixes;
    this.isRdf = isRdf;
    this.isDataset = isDataset;
    Object.freeze(this);
  }
}

const format = (key, mediaTypes, extensions, options = {}) =>
  new OWLDocumentFormat({ key, mediaTypes, extensions, ...options });

// Format identity is intentionally independent from parser availability.
// Phases 2-13 register each completed REQUIRED_V1/DELEGATED parser through a
// separate descriptor; KRSS1 retains this public identity while its parser
// remains DEFERRED and unregistered. OBO is UNSUPPORTED_BY_DESIGN; RDFa,
// RDF/JSON, TriX, and the broader N3 language remain DEFERRED and therefore have
// no advertised format object or descriptor. Verification: the `parser.*` and
// `format.krss1.identity` capability rows plus parserRegistry.test.js.
export const OWLDocumentFormats = Object.freeze({
  FUNCTIONAL: format("functional", ["text/owl-functional"], ["ofn", "owl"], {
    supportsPrefixes: true,
  }),
  MANCHESTER: format("manchester", ["text/owl-manchester"], ["omn", "owl"], {
    supportsPrefixes: true,
  }),
  OWL_XML: format("owlxml", ["application/owl+xml"], ["owx", "owl"]),
  DL: format("dl", ["text/owl-dl"], ["dl"]),
  KRSS1: format("krss1", ["text/owl-krss"], ["krss"]),
  KRSS2: format("krss2", ["text/owl-krss2"], ["krss2", "krss"]),
  RDF_XML: format("rdfxml", ["application/rdf+xml"], ["rdf", "xml", "owl"], {
    isRdf: true,
    supportsPrefixes: true,
  }),
  TURTLE: format("turtle", ["text/turtle"], ["ttl"], {
    isRdf: true,
    supportsPrefixes: true,
  }),
  TRIG: format("trig", ["application/trig"], ["trig"], {
    isDataset: true,
    isRdf: true,
    supportsPrefixes: true,
  }),
  N_TRIPLES: format("ntriples", ["application/n-triples"], ["nt"], {
    isRdf: true,
  }),
  N_QUADS: format("nquads", ["application/n-quads"], ["nq"], {
    isDataset: true,
    isRdf: true,
  }),
  JSON_LD: format("jsonld", ["application/ld+json"], ["jsonld", "json"], {
    isDataset: true,
    isRdf: true,
  }),
});
