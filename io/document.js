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

const snapshotParameterValue = (value, ancestors = new Set()) => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError(
      "format parameter values must be finite JSON-compatible data",
    );
  }
  if (ancestors.has(value)) {
    throw new TypeError("format parameter values must not contain cycles");
  }

  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    throw new TypeError(
      "format parameter objects must be plain JSON-compatible objects",
    );
  }

  ancestors.add(value);
  const snapshot = Array.isArray(value)
    ? value.map((entry) => snapshotParameterValue(entry, ancestors))
    : Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          snapshotParameterValue(entry, ancestors),
        ]),
      );
  ancestors.delete(value);
  return Object.freeze(snapshot);
};

const snapshotParameters = (parameters) => {
  if (
    parameters === null ||
    typeof parameters !== "object" ||
    Array.isArray(parameters)
  ) {
    throw new TypeError("format parameters must be an object");
  }
  // A null-prototype record keeps JSON keys such as "__proto__" as ordinary
  // data and prevents format metadata from invoking Object.prototype setters.
  const snapshot = Object.create(null);
  for (const [key, value] of Object.entries(parameters)) {
    if (key.length === 0) {
      throw new TypeError("format parameter keys must be non-empty strings");
    }
    snapshot[key] = snapshotParameterValue(value);
  }
  return Object.freeze(snapshot);
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
  #parameters;

  constructor({
    extensions = [],
    isDataset = false,
    isRdf = false,
    key,
    mediaTypes = [],
    parameters = {},
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
    this.#parameters = snapshotParameters(parameters);
    Object.freeze(this);
  }

  getParameter(key, defaultValue) {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("format parameter keys must be non-empty strings");
    }
    return Object.hasOwn(this.#parameters, key)
      ? this.#parameters[key]
      : defaultValue;
  }

  withParameter(key, value) {
    if (typeof key !== "string" || key.length === 0) {
      throw new TypeError("format parameter keys must be non-empty strings");
    }
    // Java OWLAPI carries parser-specific settings on OWLDocumentFormat. The
    // copying form keeps that compatibility seam without allowing an active
    // asynchronous load to observe later caller mutation.
    return new OWLDocumentFormat({
      extensions: this.extensions,
      isDataset: this.isDataset,
      isRdf: this.isRdf,
      key: this.key,
      mediaTypes: this.mediaTypes,
      parameters: { ...this.#parameters, [key]: value },
      supportsPrefixes: this.supportsPrefixes,
    });
  }
}

const format = (key, mediaTypes, extensions, options = {}) =>
  new OWLDocumentFormat({ key, mediaTypes, extensions, ...options });

// Format identity is intentionally independent from parser availability.
// Phases 2-15 register each completed REQUIRED_V1/DELEGATED parser through a
// separate descriptor. KRSS1 retains this public identity while its REQUIRED_V1
// Phase 17 parser is not yet implemented or registered. OBO is
// UNSUPPORTED_BY_DESIGN; RDFa,
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
