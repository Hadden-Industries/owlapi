const XML_ONTOLOGY_START =
  /^<(?:\?xml\b|(?:[A-Za-z_][\w.-]*:RDF|Ontology)\b)/iu;

/** Recognize XML ontology signatures after leading whitespace and comments.
 * The registry owns the sniff bound. Each prefix character is consumed once;
 * an unfinished comment has no following signature in the available prefix.
 */
export const hasXmlOntologySignature = (text) => {
  let offset = 0;
  while (offset < text.length) {
    while (offset < text.length && /\s/u.test(text[offset])) offset += 1;
    if (!text.startsWith("<!--", offset)) break;
    const end = text.indexOf("-->", offset + 4);
    if (end === -1) return false;
    offset = end + 3;
  }
  return XML_ONTOLOGY_START.test(text.slice(offset));
};
