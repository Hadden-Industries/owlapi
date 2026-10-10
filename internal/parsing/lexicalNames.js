/** Shared PN and blank-node lexical contracts; syntax tokenization remains local. */
const LOCAL_ESCAPES = new Set([
  "_",
  "~",
  ".",
  "-",
  "!",
  "$",
  "&",
  "'",
  "(",
  ")",
  "*",
  "+",
  ",",
  ";",
  "=",
  "/",
  "?",
  "#",
  "@",
  "%",
]);

export const isAsciiDigit = (character) => character >= "0" && character <= "9";

export const isHex = (character) =>
  isAsciiDigit(character) ||
  (character >= "A" && character <= "F") ||
  (character >= "a" && character <= "f");

export const inRange = (codePoint, start, end) =>
  codePoint >= start && codePoint <= end;

export const isPnCharsBase = (character) => {
  const codePoint = character.codePointAt(0);
  return (
    inRange(codePoint, 0x41, 0x5a) ||
    inRange(codePoint, 0x61, 0x7a) ||
    inRange(codePoint, 0xc0, 0xd6) ||
    inRange(codePoint, 0xd8, 0xf6) ||
    inRange(codePoint, 0xf8, 0x2ff) ||
    inRange(codePoint, 0x370, 0x37d) ||
    inRange(codePoint, 0x37f, 0x1fff) ||
    inRange(codePoint, 0x200c, 0x200d) ||
    inRange(codePoint, 0x2070, 0x218f) ||
    inRange(codePoint, 0x2c00, 0x2fef) ||
    inRange(codePoint, 0x3001, 0xd7ff) ||
    inRange(codePoint, 0xf900, 0xfdcf) ||
    inRange(codePoint, 0xfdf0, 0xfffd) ||
    inRange(codePoint, 0x10000, 0xeffff)
  );
};

export const isPnCharsU = (character) =>
  character === "_" || isPnCharsBase(character);

export const isPnChars = (character) => {
  const codePoint = character.codePointAt(0);
  return (
    isPnCharsU(character) ||
    character === "-" ||
    isAsciiDigit(character) ||
    codePoint === 0xb7 ||
    inRange(codePoint, 0x300, 0x36f) ||
    inRange(codePoint, 0x203f, 0x2040)
  );
};

export const prefixNameIsValid = (value) => {
  const local = value.slice(0, -1);
  if (local.length === 0) {
    return true;
  }
  const characters = [...local];
  return (
    isPnCharsBase(characters[0]) &&
    characters.slice(1, -1).every((item) => isPnChars(item) || item === ".") &&
    (characters.length === 1 || isPnChars(characters.at(-1)))
  );
};

export const localUnits = (value) => {
  const units = [];
  for (let offset = 0; offset < value.length;) {
    const character = value[offset];
    if (character === "\\") {
      const escaped = value[offset + 1];
      if (!LOCAL_ESCAPES.has(escaped)) {
        return undefined;
      }
      units.push({ escaped: true, value: escaped });
      offset += 2;
      continue;
    }
    if (
      character === "%" &&
      isHex(value[offset + 1]) &&
      isHex(value[offset + 2])
    ) {
      units.push({ escaped: true, value: value.slice(offset, offset + 3) });
      offset += 3;
      continue;
    }
    const codePoint = value.codePointAt(offset);
    const item = String.fromCodePoint(codePoint);
    units.push({ escaped: false, value: item });
    offset += item.length;
  }
  return units;
};

export const localNameIsValid = (value) => {
  const units = localUnits(value);
  if (!units || units.length === 0) {
    return false;
  }
  const first = units[0];
  if (
    !first.escaped &&
    !isPnCharsU(first.value) &&
    first.value !== ":" &&
    !isAsciiDigit(first.value)
  ) {
    return false;
  }
  return units.slice(1).every(({ escaped, value }, index) => {
    if (escaped) {
      return true;
    }
    if (index === units.length - 2 && value === ".") {
      return false;
    }
    return isPnChars(value) || value === "." || value === ":";
  });
};

export const nodeIdIsValid = (value) => {
  if (!value.startsWith("_:") || value.length === 2) {
    return false;
  }
  const label = [...value.slice(2)];
  const first = label[0];
  if (!isPnCharsU(first) && !isAsciiDigit(first)) {
    return false;
  }
  return label.slice(1).every((item, index) => {
    if (index === label.length - 2 && item === ".") {
      return false;
    }
    return isPnChars(item) || item === ".";
  });
};

export const utf8CodePointBytes = (codePoint) => {
  if (codePoint <= 0x7f) {
    return 1;
  }
  if (codePoint <= 0x7ff) {
    return 2;
  }
  return codePoint <= 0xffff ? 3 : 4;
};

export const decodePrefixedLocalName = (value) =>
  value.replace(/\\([_~.\-!$&'()*+,;=/?#@%])/gu, "$1");
