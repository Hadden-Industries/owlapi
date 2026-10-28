import {
  XML_NAMESPACE,
  OWL_NAMESPACE,
  RDF_NAMESPACE,
  RDFS_NAMESPACE,
  XSD_NAMESPACE,
} from "../internal/rdfjs/vocabulary.js";
import { parseIri } from "@hyperjump/uri";
import { isNcName } from "../internal/parsing/xml/xmlNames.js";
import {
  OWLDocumentFormat,
  copyDocumentFormatState,
} from "../model/owlDocumentFormat.js";

const XMLNS_NAMESPACE = "http://www.w3.org/2000/xmlns/";
const xmlCharPattern =
  /^[\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]*$/u;

const validatePrefix = (name, namespace) => {
  if (
    typeof name !== "string" ||
    !name.endsWith(":") ||
    typeof namespace !== "string" ||
    !namespace
  )
    throw new TypeError(
      "Prefixes require a colon-terminated name and nonempty namespace IRI",
    );
  parseIri(namespace);
  const prefix = name.slice(0, -1);
  if (
    prefix === "xmlns" ||
    namespace === XMLNS_NAMESPACE ||
    (prefix === "xml" && namespace !== XML_NAMESPACE) ||
    (prefix && namespace === XML_NAMESPACE && prefix !== "xml")
  )
    throw new TypeError("Reserved XML prefix binding");
  if (!xmlCharPattern.test(namespace) || (prefix && !isNcName(prefix)))
    throw new TypeError("Invalid XML prefix or namespace");
};

// Native friend captures prefix state without consulting caller-overridden methods.
export let readRdfXmlPrefixes;

/** Java RDFXMLDocumentFormat with a bounded inherited PrefixManager surface. */
export class RDFXMLDocumentFormat extends OWLDocumentFormat {
  #prefixes = new Map([
    ["owl:", OWL_NAMESPACE],
    ["rdf:", RDF_NAMESPACE],
    ["rdfs:", RDFS_NAMESPACE],
    ["xml:", XML_NAMESPACE],
    ["xsd:", XSD_NAMESPACE],
  ]);
  static {
    readRdfXmlPrefixes = (format) => new Map(format.#prefixes);
  }
  constructor() {
    if (arguments.length)
      throw new TypeError("RDFXMLDocumentFormat takes no arguments");
    super({
      key: "rdfxml",
      mediaTypes: ["application/rdf+xml"],
      extensions: ["rdf", "xml", "owl"],
      isRdf: true,
      supportsPrefixes: true,
    });
  }
  isPrefixOWLDocumentFormat() {
    return true;
  }
  asPrefixOWLDocumentFormat() {
    return this;
  }
  getDefaultPrefix() {
    return this.#prefixes.get(":") ?? null;
  }
  setDefaultPrefix(namespace) {
    if (namespace === null) this.#prefixes.delete(":");
    else this.setPrefix(":", namespace);
  }
  setPrefix(name, namespace) {
    validatePrefix(name, namespace);
    this.#prefixes.set(name, namespace);
  }
  getPrefix(name) {
    return this.#prefixes.get(name) ?? null;
  }
  containsPrefixMapping(name) {
    return this.#prefixes.has(name);
  }
  getPrefixName2PrefixMap() {
    return new Map(this.#prefixes);
  }
  getPrefixNames() {
    return new Set(this.#prefixes.keys());
  }
  copyPrefixesFrom(source) {
    const values =
      source instanceof RDFXMLDocumentFormat
        ? readRdfXmlPrefixes(source)
        : source;
    if (!(values instanceof Map))
      throw new TypeError("copyPrefixesFrom requires a native format or Map");
    const entries = [...values];
    for (const [name, namespace] of entries) validatePrefix(name, namespace);
    for (const [name, namespace] of entries)
      this.#prefixes.set(name, namespace);
  }
  clear() {
    this.#prefixes.clear();
  }
  unregisterNamespace(namespace) {
    for (const [name, value] of this.#prefixes)
      if (value === namespace) this.#prefixes.delete(name);
  }
  #copy(format) {
    const copy = copyDocumentFormatState(format, new RDFXMLDocumentFormat());
    copy.#prefixes = new Map(this.#prefixes);
    return copy;
  }
  withParameter(key, value) {
    return this.#copy(super.withParameter(key, value));
  }
  withOntologyLoaderMetaData(value) {
    return this.#copy(super.withOntologyLoaderMetaData(value));
  }
}
