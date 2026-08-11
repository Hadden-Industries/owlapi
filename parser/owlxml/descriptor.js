import { OWLDocumentFormats } from "../../io/index.js";
import { ParserDescriptor } from "../../manager/parserRegistry.js";
import { prepareXml } from "../xml/xmlEntityPolicy.js";

import { OWLXMLParser } from "./parser.js";

const OWL_NAMESPACE = "http://www.w3.org/2002/07/owl#";
const RDF_NAMESPACE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

const skipSpace = (text, start) => {
  let offset = start;
  while (/\s/u.test(text[offset] || "")) {
    offset += 1;
  }
  return offset;
};

const skipDelimited = (text, start, open, close) => {
  if (!text.startsWith(open, start)) {
    return start;
  }
  const end = text.indexOf(close, start + open.length);
  return end < 0 ? -1 : end + close.length;
};

const skipDoctype = (text, start) => {
  let quote;
  let subsetDepth = 0;
  for (let offset = start + 9; offset < text.length; offset += 1) {
    const character = text[offset];
    if (quote) {
      if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "[") {
      subsetDepth += 1;
    } else if (character === "]") {
      subsetDepth = Math.max(0, subsetDepth - 1);
    } else if (character === ">" && subsetDepth === 0) {
      return offset + 1;
    }
  }
  return -1;
};

const findRootStart = (text) => {
  let offset = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (offset < text.length) {
    offset = skipSpace(text, offset);
    if (text.startsWith("<?", offset)) {
      offset = skipDelimited(text, offset, "<?", "?>");
    } else if (text.startsWith("<!--", offset)) {
      offset = skipDelimited(text, offset, "<!--", "-->");
    } else if (/^<!DOCTYPE\b/iu.test(text.slice(offset))) {
      offset = skipDoctype(text, offset);
    } else {
      return offset;
    }
    if (offset < 0) {
      return -1;
    }
  }
  return offset;
};

const readStartTag = (text, start) => {
  if (text[start] !== "<" || text[start + 1] === "/") {
    return undefined;
  }
  let quote;
  for (let offset = start + 1; offset < text.length; offset += 1) {
    const character = text[offset];
    if (quote) {
      if (character === quote) {
        quote = undefined;
      }
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return text.slice(start + 1, offset);
    }
  }
  return undefined;
};

const rootIdentity = (startTag) => {
  const nameMatch = startTag.match(/^\s*([^\s/>]+)/u);
  if (!nameMatch) {
    return undefined;
  }
  const qualifiedName = nameMatch[1];
  const separator = qualifiedName.indexOf(":");
  const prefix = separator < 0 ? "" : qualifiedName.slice(0, separator);
  const localName =
    separator < 0 ? qualifiedName : qualifiedName.slice(separator + 1);
  const namespaces = new Map();
  const attributePattern = /\s+xmlns(?::([^\s=/>]+))?\s*=\s*(["'])(.*?)\2/gsu;
  for (const match of startTag.matchAll(attributePattern)) {
    namespaces.set(match[1] || "", match[3]);
  }
  return { localName, namespaceURI: namespaces.get(prefix) };
};

export const detectOwlXml = (source, configuration = {}) => {
  const text = source.getText();
  const offset = findRootStart(text);
  if (offset < 0 || offset === text.length) {
    return {
      reason: "The bounded source ends before an XML root element",
      reasonCode: "OWLXML_ROOT_INDETERMINATE",
      result: "INDETERMINATE",
    };
  }
  if (text[offset] !== "<") {
    return {
      reason: "The bounded source does not begin with XML markup",
      reasonCode: "OWLXML_NOT_XML",
      result: "NO_MATCH",
    };
  }
  const startTag = readStartTag(text, offset);
  if (!startTag) {
    return {
      reason:
        "The bounded source does not contain a complete XML root start tag",
      reasonCode: "OWLXML_ROOT_INDETERMINATE",
      result: "INDETERMINATE",
    };
  }
  let identity = rootIdentity(startTag);
  if (
    identity?.localName === "Ontology" &&
    identity.namespaceURI?.includes("&")
  ) {
    const preparedText = prepareXml(text, configuration);
    const preparedOffset = findRootStart(preparedText);
    const preparedStartTag = readStartTag(preparedText, preparedOffset);
    identity = preparedStartTag ? rootIdentity(preparedStartTag) : identity;
  }
  if (
    identity?.localName === "Ontology" &&
    identity.namespaceURI === OWL_NAMESPACE
  ) {
    return {
      reason: "An OWL/XML Ontology root element was found",
      reasonCode: "OWLXML_ONTOLOGY_ROOT",
      result: "MATCH",
    };
  }
  if (
    identity?.localName === "RDF" &&
    identity.namespaceURI === RDF_NAMESPACE
  ) {
    return {
      reason: "An RDF/XML RDF root element was found",
      reasonCode: "OWLXML_RDFXML_ROOT",
      result: "NO_MATCH",
    };
  }
  return {
    reason: "The XML root element is not an OWL/XML Ontology",
    reasonCode: "OWLXML_OTHER_XML_ROOT",
    result: "NO_MATCH",
  };
};

export const owlXmlParserDescriptor = new ParserDescriptor({
  createParser: () => new OWLXMLParser(),
  detect: detectOwlXml,
  format: OWLDocumentFormats.OWL_XML,
  id: "owl-xml",
  priority: 5,
  supportsCompatibleRecovery: true,
});
