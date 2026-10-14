import { XmlParseError } from "../../../io/errors.js";
import { isXmlName, isXmlNmToken } from "./xmlNames.js";

/** Retain nonvalidating DTD defaults and attribute types. Entity expansion stays
 * with the existing entity policy, including declarations supplied by a PE.
 */
export function readAttributeListDeclaration(
  declaration,
  attributeDeclarations,
) {
  const head = /^<!ATTLIST\s+([^\s]+)\s*/u.exec(declaration);
  if (!head || !isXmlName(head[1]))
    throw new XmlParseError("An XML attribute list declaration is malformed");
  let attributes = attributeDeclarations.get(head[1]);
  if (!attributes) {
    attributes = new Map();
    attributeDeclarations.set(head[1], attributes);
  }
  let offset = head[0].length;
  while (offset < declaration.length - 1) {
    const match =
      /^([^\s]+)\s+(CDATA|IDREFS?|ID|ENTITIES|ENTITY|NMTOKENS?|(?:NOTATION\s+)?\([^)]*\))\s+(#REQUIRED|#IMPLIED|(?:#FIXED\s+)?(?:"[^"]*"|'[^']*'))\s*/u.exec(
        declaration.slice(offset),
      );
    if (!match || !isXmlName(match[1]))
      throw new XmlParseError("An XML attribute definition is malformed");
    const [, name, type, definition] = match;
    const enumeration = /\(([^)]*)\)/u.exec(type);
    if (
      enumeration &&
      enumeration[1]
        .split("|")
        .some(
          (value) =>
            !(type.startsWith("NOTATION")
              ? isXmlName(value.trim())
              : isXmlNmToken(value.trim())),
        )
    )
      throw new XmlParseError("An XML attribute enumeration is malformed");
    const value = /["']([\s\S]*)["']$/u.exec(definition)?.[1];
    if (value?.includes("<"))
      throw new XmlParseError("An XML attribute default contains markup");
    if (!attributes.has(name))
      attributes.set(
        name,
        Object.freeze({ value, isTokenized: type !== "CDATA" }),
      );
    offset += match[0].length;
  }
}

/** Apply defaults before XML namespace parsing; normalize tokenized attributes
 * after expanding general entities. Fixed/required declarations do not make
 * this nonvalidating provider perform validity checking.
 */
export function applyDtdAttributes(text, declarations, expandAttribute) {
  if (!declarations.size) return text;
  return text.replace(
    /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<([^\s/!?<>]+)((?:"[^"]*"|'[^']*'|[^'"<>])*)>/gu,
    (tag, elementName, body) => {
      const definitions = declarations.get(elementName);
      if (!definitions) return tag;
      const names = new Set();
      const normalize = (name, value, quote) => {
        const expanded = expandAttribute(value, quote).replace(
          /[\t\n\r]/gu,
          " ",
        );
        return definitions.get(name)?.isTokenized
          ? expanded
              .replace(/&#(?:32|x0*20);/giu, " ")
              .replace(/ +/gu, " ")
              .replace(/^ | $/gu, "")
          : expanded;
      };
      const normalized = body.replace(
        /([^\s=]+)\s*=\s*(["'])([\s\S]*?)\2/gu,
        (attribute, name, quote, value) => {
          names.add(name);
          return definitions.has(name)
            ? `${name}=${quote}${normalize(name, value, quote)}${quote}`
            : attribute;
        },
      );
      const defaults = [...definitions]
        .filter(([name, { value }]) => !names.has(name) && value !== undefined)
        .map(
          ([name, { value }]) =>
            ` ${name}="${normalize(name, value, '"').replaceAll('"', "&quot;")}"`,
        )
        .join("");
      return `<${elementName}${normalized.replace(/\/?$/u, (close) => defaults + close)}>`;
    },
  );
}
