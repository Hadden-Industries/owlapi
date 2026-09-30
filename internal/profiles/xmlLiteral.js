import { parseUri } from "@hyperjump/uri";

const XMLNS = "http://www.w3.org/2000/xmlns/";
const validNamespaceName = (value) => {
  if (!value) return true;
  // Namespaces 1.0 section 3 requires a URI reference. C14N also forbids
  // relative namespace names. A DOM parser need not check either condition.
  if (/[^\x21-\x7e]/u.test(value)) return false;
  try {
    parseUri(value);
    return true;
  } catch {
    return false;
  }
};
const escapeText = (text) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\r", "&#xD;");
const escapeAttribute = (text) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll("\t", "&#x9;")
    .replaceAll("\n", "&#xA;")
    .replaceAll("\r", "&#xD;");
const compareUnicode = (left, right) => {
  const a = left[Symbol.iterator]();
  const b = right[Symbol.iterator]();
  for (;;) {
    const x = a.next(),
      y = b.next();
    if (x.done || y.done) return x.done === y.done ? 0 : x.done ? -1 : 1;
    const difference = x.value.codePointAt(0) - y.value.codePointAt(0);
    if (difference) return difference;
  }
};

/** RDF Concepts 2004 section 5.1: exclusive C14N, comments, empty prefix list.
 * Compare chunks to the original lexical form; never normalize the literal.
 * The supplied element is a synthetic, namespace-free fragment container.
 */
export const isCanonicalXmlContent = async (container, lexical, budget) => {
  let offset = 0;
  const append = (chunk) => {
    if (!lexical.startsWith(chunk, offset)) return false;
    offset += chunk.length;
    return true;
  };
  const pending = [];
  const enqueue = async (parent, namespaces, depth) => {
    for (let node = parent.lastChild; node; node = node.previousSibling) {
      if (budget) await budget.checkpoint();
      budget?.depth(depth);
      pending.push({ node, namespaces, depth });
    }
  };
  await enqueue(container, new Map([["", ""]]), 1);
  while (pending.length) {
    const { node, namespaces, end, depth } = pending.pop();
    if (budget) await budget.checkpoint();
    if (end) {
      if (!append(`</${node.nodeName}>`)) return false;
    } else if (node.nodeType === 1) {
      const rendered = new Map(namespaces);
      const visible = new Map([[node.prefix ?? "", node.namespaceURI ?? ""]]);
      const attributes = [];
      for (const attribute of node.attributes) {
        if (budget) await budget.checkpoint();
        if (attribute.namespaceURI === XMLNS) {
          if (!validNamespaceName(attribute.value)) return false;
        } else attributes.push(attribute);
      }
      for (const attribute of attributes) {
        if (attribute.prefix && attribute.prefix !== "xml")
          visible.set(attribute.prefix, attribute.namespaceURI ?? "");
      }
      visible.delete("xml");
      if (!append(`<${node.nodeName}`)) return false;
      for (const [prefix, iri] of [...visible].sort(([a], [b]) =>
        compareUnicode(a, b),
      )) {
        // Relative namespace names cannot be canonicalized (C14N 1.0, 2.3).
        if (!validNamespaceName(iri)) return false;
        if (rendered.get(prefix) !== iri) {
          if (
            !append(
              ` xmlns${prefix ? `:${prefix}` : ""}="${escapeAttribute(iri)}"`,
            )
          )
            return false;
          rendered.set(prefix, iri);
        }
      }
      attributes.sort(
        (a, b) =>
          compareUnicode(a.namespaceURI ?? "", b.namespaceURI ?? "") ||
          compareUnicode(a.localName, b.localName),
      );
      for (const attribute of attributes)
        if (!append(` ${attribute.name}="${escapeAttribute(attribute.value)}"`))
          return false;
      if (!append(">")) return false;
      pending.push({ node, end: true });
      await enqueue(node, rendered, depth + 1);
    } else if (node.nodeType === 3 || node.nodeType === 4) {
      if (!append(escapeText(node.data))) return false;
    } else if (node.nodeType === 8) {
      if (!append(`<!--${node.data.replaceAll("\r", "&#xD;")}-->`))
        return false;
    } else if (node.nodeType === 7) {
      if (
        !append(
          `<?${node.target}${node.data ? ` ${node.data.replaceAll("\r", "&#xD;")}` : ""}?>`,
        )
      )
        return false;
    } else return false;
  }
  return offset === lexical.length;
};
