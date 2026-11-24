import { DOMParser } from "@xmldom/xmldom";
import { OWLOntologyLoaderConfiguration } from "../../../model/owlOntologyLoaderConfiguration.js";
import { XmlChunkTokens } from "../../parsing/xml/xmlChunkTokens.js";
import { prepareXml } from "../../parsing/xml/xmlEntityPolicy.js";

const batchLength = 16_384;
const xmlWhitespace = /^[\t\n\r ]*$/u;

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
  const prepared = prepareXml(
    literal,
    new OWLOntologyLoaderConfiguration({
      behaviorProfileId: "java-owlapi-5.5.1",
    }),
  );
  if (prepared.length <= batchLength || !validateFlatSiblings(prepared))
    parseLiteral(prepared);
}
