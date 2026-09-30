import { ResourceLimitError } from "../../io/errors.js";

const categories = new Set(
  "L Lu Ll Lt Lm Lo M Mn Mc Me N Nd Nl No P Pc Pd Ps Pe Pi Pf Po Z Zs Zl Zp S Sm Sc Sk So C Cc Cf Co Cn".split(
    " ",
  ),
);
const singleEscapes = new Map(
  [..."\\|.?*+(){}-[]^"].map((character) => [character, character]),
);
singleEscapes.set("n", "\n").set("r", "\r").set("t", "\t");
const unsignedCompare = (left, right) => {
  const a = left.replace(/^0+/u, ""),
    b = right.replace(/^0+/u, "");
  return a.length === b.length
    ? a < b
      ? -1
      : a > b
        ? 1
        : 0
    : a.length - b.length;
};

// XSD 1.1 Annex G syntax recognition only. Never execute a supplied pattern.
export const isXsdPattern = (text, maxDepth = 256) => {
  let offset = 0;
  const invalid = Symbol("invalid pattern");
  const fail = () => {
    throw invalid;
  };
  const enter = (depth) => {
    if (depth > maxDepth)
      throw new ResourceLimitError("XSD pattern nesting limit exceeded", {
        resource: "profilePatternDepth",
        limit: maxDepth,
      });
  };
  const next = () => {
    if (offset === text.length) return undefined;
    const character = String.fromCodePoint(text.codePointAt(offset));
    offset += character.length;
    return character;
  };
  const escaped = () => {
    const character = next();
    if (singleEscapes.has(character)) return singleEscapes.get(character);
    if (character && "sSiIcCdDwW".includes(character)) return null;
    if (character !== "p" && character !== "P") return fail();
    if (next() !== "{") return fail();
    const end = text.indexOf("}", offset);
    if (end < 0) return fail();
    const name = text.slice(offset, end);
    if (!categories.has(name) && !/^Is[A-Za-z0-9-]+$/u.test(name))
      return fail();
    offset = end + 1;
    return null;
  };
  const groupCharacter = () => {
    const character = next();
    if (character === undefined || character === "[" || character === "]")
      return fail();
    if (character === "\\") return { character: escaped(), raw: false };
    return { character, raw: true };
  };
  const characterGroup = (depth) => {
    enter(depth);
    if (text[offset] === "^") offset += 1;
    let count = 0;
    while (offset < text.length && text[offset] !== "]") {
      if (text.startsWith("-[", offset)) {
        if (!count) return fail();
        offset += 2;
        characterGroup(depth + 1);
        if (next() !== "]") return fail();
        return;
      }
      const first = groupCharacter();
      count += 1;
      if (
        first.character !== null &&
        text[offset] === "-" &&
        !text.startsWith("-[", offset) &&
        !text.startsWith("-]", offset) &&
        !text.startsWith("--[", offset)
      ) {
        offset += 1;
        const last = groupCharacter();
        if (
          last.character === null ||
          (first.raw && first.character === "-") ||
          (last.raw && last.character === "-")
        )
          return fail();
      }
    }
    if (!count || next() !== "]") return fail();
  };
  const quantity = () => {
    const start = offset;
    while (/[0-9]/u.test(text[offset] ?? "")) offset += 1;
    if (offset === start) return fail();
    const lower = text.slice(start, offset);
    if (text[offset] === ",") {
      offset += 1;
      const upperStart = offset;
      while (/[0-9]/u.test(text[offset] ?? "")) offset += 1;
      if (
        offset > upperStart &&
        unsignedCompare(lower, text.slice(upperStart, offset)) > 0
      )
        return fail();
    }
    if (next() !== "}") return fail();
  };
  const expression = (depth, nested = false) => {
    enter(depth);
    while (offset < text.length) {
      const character = next();
      if (character === ")") return nested ? undefined : fail();
      if (character === "|") continue;
      if (character === "(") expression(depth + 1, true);
      else if (character === "[") characterGroup(depth + 1);
      else if (character === "\\") escaped();
      else if ("?*+{}]".includes(character)) return fail();
      if ("?*+".includes(text[offset] ?? "\u0000")) offset += 1;
      else if (text[offset] === "{") {
        offset += 1;
        quantity();
      }
    }
    if (nested) return fail();
  };
  try {
    expression(0);
    return true;
  } catch (error) {
    if (error === invalid) return false;
    throw error;
  }
};
