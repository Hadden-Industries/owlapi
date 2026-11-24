import {
  OWL_NAMESPACE,
  RDF_NAMESPACE,
  RDFS_NAMESPACE,
  XSD_NAMESPACE,
  XML_NAMESPACE,
} from "../../rdfjs/vocabulary.js";
import { xmlAttribute } from "../xmlTokens.js";

export const owlXmlPrefixes = [
  ["owl", OWL_NAMESPACE],
  ["rdf", RDF_NAMESPACE],
  ["xml", XML_NAMESPACE],
  ["xsd", XSD_NAMESPACE],
  ["rdfs", RDFS_NAMESPACE],
];

/** Java puts its namespace declarations before identity attributes and wraps the header. */
export function owlXmlHeader(ontologyID, java, width, iri) {
  const attributes = [];
  if (java) {
    attributes.push(
      xmlAttribute("xmlns", OWL_NAMESPACE),
      xmlAttribute("xml:base", ontologyID.ontologyIRI?.value ?? OWL_NAMESPACE),
    );
    for (const [prefix, value] of owlXmlPrefixes.slice(1))
      attributes.push(xmlAttribute("xmlns:" + prefix, value));
  }
  if (ontologyID.ontologyIRI)
    attributes.push(xmlAttribute("ontologyIRI", iri(ontologyID.ontologyIRI)));
  if (ontologyID.versionIRI)
    attributes.push(xmlAttribute("versionIRI", iri(ontologyID.versionIRI)));
  if (!java) attributes.push(xmlAttribute("xmlns", OWL_NAMESPACE));
  return (
    "<Ontology " + attributes.join(java ? "\n" + " ".repeat(width + 1) : " ")
  );
}
