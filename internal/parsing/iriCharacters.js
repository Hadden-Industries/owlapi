/** Full-IRI lexical rules, independent of resolution and parser error construction. */
export const hasForbiddenIriCharacter = (value) => {
  for (let offset = 0; offset < value.length; offset += 1) {
    const code = value.charCodeAt(offset);
    if (
      code <= 0x20 ||
      code === 60 ||
      code === 62 ||
      code === 34 ||
      code === 123 ||
      code === 125 ||
      code === 124 ||
      code === 94 ||
      code === 96 ||
      code === 92
    ) {
      return true;
    }
    if (code >= 0xd800 && code <= 0xdfff) {
      if (code <= 0xdbff && offset + 1 < value.length) {
        const next = value.charCodeAt(offset + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          offset += 1;
          continue;
        }
      }
      return true;
    }
  }
  return false;
};

export const isAbsoluteIri = (value) =>
  /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) && !hasForbiddenIriCharacter(value);

export const SIMPLE_ASCII_IRI =
  /^(?:https?:\/\/[A-Za-z0-9._-]+(?::\d+)?(?:\/[A-Za-z0-9._~!$&'()*+,;=:@/-]*)?|urn:[A-Za-z0-9][A-Za-z0-9-]*:[A-Za-z0-9._~!$&'()*+,;=:@/-]+)(?:#[A-Za-z0-9._~!$&'()*+,;=:@/-]*)?$/u;
