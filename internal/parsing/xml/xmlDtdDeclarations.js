import { XmlParseError } from "../../../io/errors.js";
import { isXmlName } from "./xmlNames.js";

const malformed = (kind) => {
  throw new XmlParseError(`An XML ${kind} declaration is malformed`);
};

/** Check XML 1.0 element-declaration syntax without validating document content.
 * The DOM consumer does not parse DTD content models. An explicit group stack
 * implements the grammar without introducing a JavaScript call-stack limit.
 * Grammar: https://www.w3.org/TR/xml/#sec-element-content
 */
export function validateElementDeclaration(declaration) {
  const head =
    /^<!ELEMENT[\t\r\n ]+([^\t\r\n ]+)[\t\r\n ]+([\s\S]*?)\s*>$/u.exec(
      declaration,
    );
  if (!head || !isXmlName(head[1])) malformed("element");
  const model = head[2];
  if (model === "ANY" || model === "EMPTY") return;
  if (/^\([\t\r\n ]*#PCDATA/u.test(model)) {
    const mixed = /^\([\t\r\n ]*#PCDATA([\s\S]*?)\)(\*)?$/u.exec(model);
    if (!mixed) malformed("element");
    const names = mixed[1].trim();
    if (
      names &&
      (!mixed[2] ||
        !names.startsWith("|") ||
        names
          .slice(1)
          .split("|")
          .some((name) => !isXmlName(name.trim())))
    )
      malformed("element");
    return;
  }
  if (!model.startsWith("(")) malformed("element");
  const groups = [];
  let offset = 0;
  while (offset < model.length) {
    const whitespace = /^[\t\r\n ]*/u.exec(model.slice(offset))[0];
    offset += whitespace.length;
    const group = groups.at(-1);
    const character = model[offset];
    if (character === "(" && (!group || group.expectsParticle)) {
      groups.push({ separator: undefined, expectsParticle: true });
      offset += 1;
    } else if (group?.expectsParticle) {
      const name = /^[^\t\r\n ()|,?*+]+/u.exec(model.slice(offset))?.[0];
      if (!name || !isXmlName(name)) malformed("element");
      offset += name.length;
      if (/[?*+]/u.test(model[offset] ?? "")) offset += 1;
      group.expectsParticle = false;
    } else if (group && (character === "," || character === "|")) {
      if (group.separator && group.separator !== character)
        malformed("element");
      group.separator = character;
      group.expectsParticle = true;
      offset += 1;
    } else if (group && character === ")") {
      groups.pop();
      offset += 1;
      if (/[?*+]/u.test(model[offset] ?? "")) offset += 1;
      if (groups.length) groups.at(-1).expectsParticle = false;
      else {
        if (model.slice(offset).trim()) malformed("element");
        return;
      }
    } else malformed("element");
  }
  malformed("element");
}

/** Notations declare identifiers; they never authorize external retrieval. */
export function validateNotationDeclaration(declaration) {
  const match =
    /^<!NOTATION[\t\r\n ]+([^\t\r\n ]+)[\t\r\n ]+(?:SYSTEM[\t\r\n ]+(?:"[^"]*"|'[^']*')|PUBLIC[\t\r\n ]+(?:"[^"]*"|'[^']*')(?:[\t\r\n ]+(?:"[^"]*"|'[^']*'))?)[\t\r\n ]*>$/u.exec(
      declaration,
    );
  if (!match || !isXmlName(match[1])) malformed("notation");
}
