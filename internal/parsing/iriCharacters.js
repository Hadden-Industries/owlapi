/** Full-IRI lexical rules, independent of resolution and parser error construction. */
export const hasForbiddenIriCharacter = (value) => {
  for (let offset = 0; offset < value.length;) {
    const codePoint = value.codePointAt(offset);
    const character = String.fromCodePoint(codePoint);
    if (
      codePoint <= 0x20 ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      '<>"{}|^`\\'.includes(character)
    ) {
      return true;
    }
    offset += character.length;
  }
  return false;
};

export const isAbsoluteIri = (value) =>
  /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) && !hasForbiddenIriCharacter(value);
