import { OWLDocumentFormat } from "../model/owlDocumentFormat.js";

const format = (key, mediaTypes, extensions, options = {}) =>
  new OWLDocumentFormat({ key, mediaTypes, extensions, ...options });

// Format identity remains independent from parser availability. Keeping this
// registry in the Java-compatible `formats` namespace prevents private parser
// selection and third-party adapters from becoming accidental package APIs.
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
