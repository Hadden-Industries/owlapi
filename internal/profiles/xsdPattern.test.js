import { isXsdPattern } from "./xsdPattern.js";
import { ResourceLimitError } from "../../io/errors.js";

test.each([
  "",
  "a|",
  "(a|b)*",
  "[a-z-[aeiou]]+",
  "[z-a]",
  "\\i\\c*",
  "\\p{Lu}",
  "\\p{IsMadeUp}",
  "\\P{IsLatin-1Supplement}",
  "^$",
  "a{0,123456789012345678901234567890}",
  "a{02,2}",
  "a{0,}",
  "[a-]",
  "[-a]",
  "[a-k-z]",
  "[a--[b]]",
  "[^^]",
  "[\\-a]",
  "[😀-🙏]",
  "[\\n-\\r]",
])("accepts XSD 1.1 pattern %s", (value) =>
  expect(isXsdPattern(value)).toBe(true),
);

test.each([
  "[",
  "(?=a)",
  "(?:a)",
  "a**",
  "a??",
  "[]",
  "[^]",
  "[--z]",
  "[a--b]",
  "[-[a]]",
  "[a-[b]c]",
  "[a-\\d]",
  "\\p{MadeUp}",
  "\\p{Is}",
  "\\x41",
  "\\1",
  "a{2,1}",
  "a{,2}",
  "a{1",
  "a}",
  "(",
  ")",
  "a\\",
])("rejects non-XSD pattern %s", (value) =>
  expect(isXsdPattern(value)).toBe(false),
);

test("bounds nesting without evaluating regex execution", () => {
  expect(() => isXsdPattern("(".repeat(257) + ")".repeat(257))).toThrow(
    ResourceLimitError,
  );
  expect(isXsdPattern("(a+)+")).toBe(true);
});
