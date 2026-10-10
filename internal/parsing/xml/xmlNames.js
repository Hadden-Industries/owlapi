/** XML Name, NCName and NMTOKEN operations retain their distinct colon rules. */
export const isNcNameStartCodePoint = (codePoint) =>
  codePoint === 0x5f ||
  (codePoint >= 0x41 && codePoint <= 0x5a) ||
  (codePoint >= 0x61 && codePoint <= 0x7a) ||
  (codePoint >= 0xc0 && codePoint <= 0xd6) ||
  (codePoint >= 0xd8 && codePoint <= 0xf6) ||
  (codePoint >= 0xf8 && codePoint <= 0x2ff) ||
  (codePoint >= 0x370 && codePoint <= 0x37d) ||
  (codePoint >= 0x37f && codePoint <= 0x1fff) ||
  (codePoint >= 0x200c && codePoint <= 0x200d) ||
  (codePoint >= 0x2070 && codePoint <= 0x218f) ||
  (codePoint >= 0x2c00 && codePoint <= 0x2fef) ||
  (codePoint >= 0x3001 && codePoint <= 0xd7ff) ||
  (codePoint >= 0xf900 && codePoint <= 0xfdcf) ||
  (codePoint >= 0xfdf0 && codePoint <= 0xfffd) ||
  (codePoint >= 0x10000 && codePoint <= 0xeffff);

export const isNcNameCodePoint = (codePoint) =>
  isNcNameStartCodePoint(codePoint) ||
  codePoint === 0x2d ||
  codePoint === 0x2e ||
  codePoint === 0xb7 ||
  (codePoint >= 0x30 && codePoint <= 0x39) ||
  (codePoint >= 0x300 && codePoint <= 0x36f) ||
  (codePoint >= 0x203f && codePoint <= 0x2040);

export const isNcName = (value) => {
  const points = [...value].map((character) => character.codePointAt(0));
  return (
    points.length > 0 &&
    isNcNameStartCodePoint(points[0]) &&
    points.slice(1).every(isNcNameCodePoint)
  );
};

/** Longest trailing NCName, skipping leading digits after the last separator. */
export const ncNameSuffix = (value) => {
  let start = 0;
  let offset = 0;
  for (const character of value) {
    offset += character.length;
    if (!isNcNameCodePoint(character.codePointAt(0))) start = offset;
  }
  while (
    start < value.length &&
    !isNcNameStartCodePoint(value.codePointAt(start))
  )
    start += value.codePointAt(start) > 0xffff ? 2 : 1;
  return start < value.length ? value.slice(start) : undefined;
};

/** XML Name includes colon, unlike namespace-local NCName. */
export const isXmlNameStartCodePoint = (codePoint) =>
  codePoint === 0x3a || isNcNameStartCodePoint(codePoint);
export const isXmlNameCodePoint = (codePoint) =>
  codePoint === 0x3a || isNcNameCodePoint(codePoint);
export const isXmlName = (value) => {
  const points = [...value].map((character) => character.codePointAt(0));
  return (
    points.length > 0 &&
    isXmlNameStartCodePoint(points[0]) &&
    points.slice(1).every(isXmlNameCodePoint)
  );
};
export const isXmlNmToken = (value) =>
  value.length > 0 &&
  [...value].every((character) => isXmlNameCodePoint(character.codePointAt(0)));
