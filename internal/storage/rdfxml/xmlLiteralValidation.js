import { DOMParser } from "@xmldom/xmldom";
import {
  OWLOntologyStorageError,
  ResourceLimitError,
} from "../../../io/errors.js";
import { OWLOntologyLoaderConfiguration } from "../../../model/owlOntologyLoaderConfiguration.js";
import { canonicalizeRdfXmlLiteral } from "../../parsing/rdfxml/rdfXmlSyntaxAdapter.js";
import { XmlChunkTokens } from "../../parsing/xml/xmlChunkTokens.js";
import { prepareXml } from "../../parsing/xml/xmlEntityPolicy.js";
import { XMLNS_NAMESPACE } from "../../rdfjs/vocabulary.js";
import { xmlAttribute, xmlTextChunks } from "../xmlTokens.js";

const batchLength = 16_384;
const xmlWhitespace = /^[\t\n\r ]*$/u;
const prepareLiteral = (text) =>
  prepareXml(
    text,
    new OWLOntologyLoaderConfiguration({
      behaviorProfileId: "java-owlapi-5.5.1",
    }),
  );

function parseLiteral(text) {
  const document = new DOMParser({
    onError(_level, message) {
      throw new Error(message);
    },
  }).parseFromString(text, "application/xml");
  if (!document.documentElement)
    throw new Error("The XML literal has no document element");
  return document;
}

/** Under the same root, complete empty-element siblings with fixed namespace
 * bindings have independent XML well-formedness. The native parser must
 * actually see exactly those leaf elements and whitespace in each batch.
 * Any other lexical shape or parser observation uses the original document.
 */
function validateFlatSiblings(text) {
  const closingOffset = text.lastIndexOf("</");
  if (closingOffset < 0 || text.length - closingOffset > batchLength)
    return false;
  const closing = text.slice(closingOffset);
  let opening,
    ended = false,
    batch = "",
    count = 0;
  const flush = () => {
    const document = parseLiteral(opening + batch + closing);
    if (document.childNodes.length !== 1) return false;
    let observed = 0;
    const children = document.documentElement.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children.item(i);
      if (child.nodeType === 1 && !child.firstChild) observed++;
      else if (child.nodeType !== 3 || !xmlWhitespace.test(child.data))
        return false;
    }
    batch = "";
    const complete = count === observed;
    count = 0;
    return complete;
  };
  try {
    for (const token of new XmlChunkTokens().read(text, true)) {
      if (ended) return false;
      if (opening === undefined) {
        if (
          token.kind !== "open" ||
          token.text.endsWith("/>") ||
          token.text.length + closing.length >= batchLength
        )
          return false;
        opening = token.text;
        continue;
      }
      if (token.kind === "close") {
        if (token.text !== closing || !flush()) return false;
        ended = true;
        continue;
      }
      if (token.kind === "text") {
        if (!xmlWhitespace.test(token.text)) return false;
      } else if (
        token.kind !== "open" ||
        !token.text.endsWith("/>") ||
        token.text.includes("xmlns")
      )
        return false;
      const overhead = opening.length + closing.length + token.text.length;
      if (overhead > batchLength) return false;
      if (overhead + batch.length > batchLength && !flush()) return false;
      batch += token.text;
      if (token.kind === "open") count++;
    }
  } catch {
    // Replay the full input for the provider's own original diagnostic,
    // position, and any recovery semantics on ambiguous or malformed XML.
    return false;
  }
  return ended;
}

/** Validate the prepared document, always leaving the emitted lexical value untouched. */
export function validateEmbeddedXmlLiteral(literal) {
  const prepared = prepareLiteral(literal);
  if (prepared.length <= batchLength || !validateFlatSiblings(prepared))
    parseLiteral(prepared);
}

// Java OWLAPI 5.5.1's RDF/XML parseType literal events are distinct from
// exclusive XML canonicalization. Compare the observed lexical form without
// accumulating another canonical document or recursively visiting deep XML.
function matchesJavaEmbeddedLiteral(container, lexical) {
  const declaredNamespaces = new Set();
  let offset = 0;
  const append = (part) => {
    if (!lexical.startsWith(part, offset)) return false;
    offset += part.length;
    return true;
  };
  let node = container.firstChild;
  while (node) {
    if (node.nodeType === 1) {
      if (!append(`<${node.nodeName}`)) return false;
      if (node.prefix && !declaredNamespaces.has(node.namespaceURI)) {
        declaredNamespaces.add(node.namespaceURI);
        if (!append(` xmlns:${node.prefix}="${node.namespaceURI}"`))
          return false;
      }
      for (const attribute of node.attributes)
        if (
          attribute.namespaceURI !== XMLNS_NAMESPACE &&
          !append(` ${attribute.name}="${attribute.value}"`)
        )
          return false;
      if (!append(">")) return false;
      if (node.firstChild) {
        node = node.firstChild;
        continue;
      }
    } else if (node.nodeType === 3 || node.nodeType === 4) {
      // The JS and Java readers render preserved carriage returns differently.
      if (node.data.includes("\r")) return false;
      for (const part of xmlTextChunks(node.data, "rdf"))
        if (!append(part)) return false;
    }
    // The native literal handler does not write processing instructions
    // or comments into the literal.
    while (node !== container) {
      if (node.nodeType === 1 && !append(`</${node.nodeName}>`)) return false;
      if (node.nextSibling) break;
      node = node.parentNode;
    }
    node = node === container ? null : node.nextSibling;
  }
  return offset === lexical.length;
}

/** Refuse a scoped rule XML literal when either RDF/XML reader would change it. */
export function validateScopedSwrlXmlLiteral(literal, defaultNamespace) {
  const details = { reason: "ONTOLOGY_NOT_REPRESENTABLE" };
  try {
    validateEmbeddedXmlLiteral(literal);
  } catch (cause) {
    if (cause instanceof ResourceLimitError) throw cause;
    throw new OWLOntologyStorageError("XML literal is not self contained", {
      ...details,
      cause,
    });
  }
  const namespace = defaultNamespace
    ? " " + xmlAttribute("xmlns", defaultNamespace)
    : "";
  let container;
  try {
    // A self-contained document may still be illegal inside a property
    // element (for example, an XML declaration in the literal).
    container = parseLiteral(
      prepareLiteral(
        `<owlapi-fragment${namespace}>${literal}</owlapi-fragment>`,
      ),
    ).documentElement;
  } catch (cause) {
    if (cause instanceof ResourceLimitError) throw cause;
    throw new OWLOntologyStorageError(
      "An XML literal cannot be embedded in a SWRL rule annotation",
      { ...details, cause },
    );
  }
  if (
    !matchesJavaEmbeddedLiteral(container, literal) ||
    canonicalizeRdfXmlLiteral(container) !== literal
  )
    throw new OWLOntologyStorageError(
      "RDF/XML cannot preserve the lexical form of a SWRL XML literal",
      details,
    );
}
