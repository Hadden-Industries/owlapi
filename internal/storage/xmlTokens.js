const escapes = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
  "\t": "&#9;",
  "\n": "&#10;",
  "\r": "&#13;",
});

/** DOM-compatible XML attribute encoding, including whitespace normalization. */
export const xmlAttribute = (name, value) =>
  name + '="' + value.replace(/[&<>"\t\n\r]/gu, (ch) => escapes[ch]) + '"';

export const xmlText = (value, layout) =>
  value.replace(
    layout === "rdf"
      ? /[&<>"'\r]/gu
      : layout === "compact"
        ? /[&<>\t\n\r]/gu
        : layout === "native"
          ? /[&<>]/gu
          : /[&<>\r]/gu,
    (ch) => (layout === "rdf" && ch === "\r" ? "&#xD;" : escapes[ch]),
  );

/** Byte accounting avoids allocating a UTF-8 copy of a large literal. */
export function utf8Length(value) {
  if (!/[^\p{ASCII}]/u.test(value)) return value.length;
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0);
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Escape large lexical forms in bounded pieces, keeping surrogate pairs together. */
export function* xmlTextChunks(value, layout) {
  for (let begin = 0; begin < value.length;) {
    let end = Math.min(value.length, begin + 16_384);
    const last = value.charCodeAt(end - 1);
    if (end < value.length && last >= 0xd800 && last <= 0xdbff) end--;
    yield xmlText(value.slice(begin, end), layout);
    begin = end;
  }
}

/** XML 1.0 admits tab, LF and CR among the C0 controls. */
export const isXmlText = (value) =>
  value.isWellFormed() &&
  // eslint-disable-next-line no-control-regex
  !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(value);
