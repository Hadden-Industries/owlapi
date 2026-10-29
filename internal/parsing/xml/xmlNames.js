/** XML Name, NCName and NMTOKEN operations retain their distinct colon rules. */
const startRanges = [
  [0x41, 0x5a],
  [0x5f, 0x5f],
  [0x61, 0x7a],
  [0xc0, 0xd6],
  [0xd8, 0xf6],
  [0xf8, 0x2ff],
  [0x370, 0x37d],
  [0x37f, 0x1fff],
  [0x200c, 0x200d],
  [0x2070, 0x218f],
  [0x2c00, 0x2fef],
  [0x3001, 0xd7ff],
  [0xf900, 0xfdcf],
  [0xfdf0, 0xfffd],
  [0x10000, 0xeffff],
];
const additionalRanges = [
  [0x2d, 0x2e],
  [0x30, 0x39],
  [0xb7, 0xb7],
  [0x300, 0x36f],
  [0x203f, 0x2040],
];
const inRanges = (codePoint, ranges) => {
  for (const [minimum, maximum] of ranges) {
    if (codePoint < minimum) return false;
    if (codePoint <= maximum) return true;
  }
  return false;
};
export const isNcNameStartCodePoint = (codePoint) =>
  codePoint < 0x80
    ? (codePoint >= 0x61 && codePoint <= 0x7a) ||
      (codePoint >= 0x41 && codePoint <= 0x5a) ||
      codePoint === 0x5f
    : inRanges(codePoint, startRanges);

export const isNcNameCodePoint = (codePoint) =>
  codePoint < 0x80
    ? (codePoint >= 0x61 && codePoint <= 0x7a) ||
      (codePoint >= 0x41 && codePoint <= 0x5a) ||
      (codePoint >= 0x30 && codePoint <= 0x39) ||
      codePoint === 0x5f ||
      codePoint === 0x2d ||
      codePoint === 0x2e
    : isNcNameStartCodePoint(codePoint) ||
      inRanges(codePoint, additionalRanges);

// Derive native string scans from the same ranges; profile literals can be 1 MiB.
const characterClass = (ranges) =>
  ranges
    .map(
      ([minimum, maximum]) =>
        `\\u{${minimum.toString(16)}}-\\u{${maximum.toString(16)}}`,
    )
    .join("");
const startClass = characterClass(startRanges);
const continuationClass = startClass + characterClass(additionalRanges);
const ncNamePattern = new RegExp(
  `^[${startClass}][${continuationClass}]*$`,
  "u",
);
const xmlNamePattern = new RegExp(
  `^[:${startClass}][:${continuationClass}]*$`,
  "u",
);
const nmTokenPattern = new RegExp(`^[:${continuationClass}]+$`, "u");

export const isNcName = (value) => ncNamePattern.test(value);

/** Longest trailing NCName, skipping leading digits after the last separator. */
export const ncNameSuffix = (value) => {
  // Only the trailing name can contribute. Scan backwards so a long namespace
  // is not revisited for every display lookup. Rejoin surrogate pairs before
  // applying the same XML code-point rules used by forward validation.
  let start = value.length;
  while (start > 0) {
    let offset = start - 1;
    let codePoint = value.codePointAt(offset);
    if (codePoint >= 0xdc00 && codePoint <= 0xdfff && offset > 0) {
      const previous = value.codePointAt(offset - 1);
      if (previous > 0xffff) {
        offset -= 1;
        codePoint = previous;
      }
    }
    if (!isNcNameCodePoint(codePoint)) break;
    start = offset;
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
export const isXmlName = (value) => xmlNamePattern.test(value);
export const isXmlNmToken = (value) => nmTokenPattern.test(value);
