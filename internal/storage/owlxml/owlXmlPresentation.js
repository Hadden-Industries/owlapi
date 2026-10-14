import {
  XMLNS_NAMESPACE,
  XML_NAMESPACE,
  OWL_NAMESPACE,
  RDF_NAMESPACE,
  XSD_NAMESPACE,
  RDFS_NAMESPACE,
} from "../../rdfjs/vocabulary.js";

const prefixes = Object.freeze([
  ["owl", OWL_NAMESPACE],
  ["rdf", RDF_NAMESPACE],
  ["xml", XML_NAMESPACE],
  ["xsd", XSD_NAMESPACE],
  ["rdfs", RDFS_NAMESPACE],
]);

/** Establish Java's OWL/XML document header using the existing DOM serializer.
 * Prefixes and the base are representation metadata, never access authority.
 */
export function initializeJavaOwlXmlDocument(document, ontologyID) {
  const root = document.documentElement;
  root.setAttributeNS(XMLNS_NAMESPACE, "xmlns", OWL_NAMESPACE);
  root.setAttributeNS(
    XML_NAMESPACE,
    "xml:base",
    ontologyID.ontologyIRI?.value ?? OWL_NAMESPACE,
  );
  for (const name of ["rdf", "xml", "xsd", "rdfs"])
    root.setAttributeNS(
      XMLNS_NAMESPACE,
      `xmlns:${name}`,
      prefixes.find(([prefix]) => prefix === name)[1],
    );
  for (const [name, iri] of prefixes) {
    const prefix = document.createElementNS(OWL_NAMESPACE, "Prefix");
    prefix.setAttribute("name", name);
    prefix.setAttribute("IRI", iri);
    root.appendChild(prefix);
  }
}

/** Serialize a completed or failed-render prefix. Add layout only between
 * element children so indentation never alters literal/IRI character content.
 * The document is renderer-owned and is consumed exactly once by this function.
 */
export function serializeJavaOwlXmlDocument(
  document,
  serializer,
  configuration,
  { completed = true } = {},
) {
  const width = configuration.indenting
    ? Math.max(0, configuration.indentSize)
    : 0;
  const pending = [{ element: document.documentElement, depth: 0 }];
  while (pending.length) {
    const { element, depth } = pending.pop();
    const children = Array.from(element.childNodes).filter(
      (node) => node.nodeType === 1,
    );
    if (!children.length) continue;
    for (const child of children) {
      element.insertBefore(
        document.createTextNode(`\n${" ".repeat(width * (depth + 1))}`),
        child,
      );
      pending.push({ element: child, depth: depth + 1 });
    }
    element.appendChild(
      document.createTextNode(`\n${" ".repeat(width * depth)}`),
    );
  }
  let text = serializer.serializeToString(document);
  const rootEnd = text.indexOf(">");
  const opening = text
    .slice(0, rootEnd)
    .replaceAll(/ (?=[^\s=]+=")/gu, (space, offset) =>
      offset === "<Ontology".length ? space : `\n${" ".repeat(width + 1)}`,
    );
  text = opening + text.slice(rootEnd);
  if (!completed) text = text.slice(0, text.lastIndexOf("</Ontology>"));
  return `<?xml version="1.0"?>\n${text}${completed ? "\n" : ""}`;
}
