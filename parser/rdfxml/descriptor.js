import { OWLDocumentFormats } from "../../io/index.js";
import { ParserDescriptor } from "../../manager/parserRegistry.js";
import { detectOwlXml } from "../owlxml/descriptor.js";

import { RDFXMLParser } from "./parser.js";

export const detectRdfXml = (source, configuration = {}) => {
  const owlXmlDetection = detectOwlXml(source, configuration);
  if (owlXmlDetection.reasonCode === "OWLXML_RDFXML_ROOT") {
    return {
      reason: "An RDF/XML RDF root element was found",
      reasonCode: "RDFXML_RDF_ROOT",
      result: "MATCH",
    };
  }
  if (owlXmlDetection.reasonCode === "OWLXML_ONTOLOGY_ROOT") {
    return {
      reason: "An OWL/XML Ontology root element was found",
      reasonCode: "RDFXML_OWLXML_ROOT",
      result: "NO_MATCH",
    };
  }
  if (owlXmlDetection.reasonCode === "OWLXML_NOT_XML") {
    return {
      reason: "The bounded source does not begin with XML markup",
      reasonCode: "RDFXML_NOT_XML",
      result: "NO_MATCH",
    };
  }
  if (owlXmlDetection.reasonCode === "OWLXML_ROOT_INDETERMINATE") {
    return {
      reason: "The bounded source ends before an XML root can be classified",
      reasonCode: "RDFXML_ROOT_INDETERMINATE",
      result: "INDETERMINATE",
    };
  }
  return {
    reason:
      "RDF/XML permits a typed RDF node element as the document root, so another complete XML root remains a possible match",
    reasonCode: "RDFXML_NODE_ROOT_POSSIBLE",
    result: "INDETERMINATE",
  };
};

export const rdfXmlParserDescriptor = new ParserDescriptor({
  createParser: () => new RDFXMLParser(),
  detect: detectRdfXml,
  format: OWLDocumentFormats.RDF_XML,
  id: "rdf-xml",
  priority: 30,
  supportsCompatibleRecovery: false,
});
