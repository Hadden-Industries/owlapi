import { isNcName, isXmlName, isXmlNmToken, ncNameSuffix } from "./xmlNames.js";

describe("distinct XML name domains", () => {
  test.each(
    [
      ["", false, false, false],
      [":", true, false, true],
      ["a:b", true, false, true],
      ["1a", false, false, true],
      ["a\u0300", true, true, true],
      ["\u0300a", false, false, true],
      ["a\u036f", true, true, true],
      ["\u0370", true, true, true],
      ["\u037e", false, false, false],
      ["\u{10000}", true, true, true],
      ["\u{effff}", true, true, true],
      ["\u{f0000}", false, false, false],
      ["\ud800", false, false, false],
      ["a\u0000", false, false, false],
      ["a\n", false, false, false],
    ].map(([value, ...expected]) => [
      Array.from(
        value,
        (character) =>
          `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
      ).join(" ") || "empty string",
      value,
      ...expected,
    ]),
  )(
    "preserves Name/NCName/NMTOKEN for %s",
    (_label, value, name, ncname, token) => {
      expect(isXmlName(value)).toBe(name);
      expect(isNcName(value)).toBe(ncname);
      expect(isXmlNmToken(value)).toBe(token);
    },
  );

  it("keeps the longest namespace-local suffix separate from XML Name", () => {
    expect(ncNameSuffix("urn:example:12name")).toBe("name");
    expect(ncNameSuffix("urn:example:12")).toBeUndefined();
  });
  test.each([
    ["leading digits", "https://example.org/123Class_42", "Class_42"],
    ["leading combining mark", "urn:example:12\u0301name", "name"],
    ["astral start", "urn:example:\u{10000}name", "\u{10000}name"],
    ["unpaired high surrogate", "urn:example:ab\ud800cd", "cd"],
    ["unpaired low surrogate", "urn:example:ab\udc00cd", "cd"],
    ["invalid trailing astral value", "urn:example:valid\u{f0000}", undefined],
    ["trailing combining mark", "urn:example:a\u0301", "a\u0301"],
    [
      "long namespace",
      "https://" + "namespace".repeat(10000) + "/Local",
      "Local",
    ],
  ])("retains the XML suffix boundary for %s", (_label, value, expected) => {
    expect(ncNameSuffix(value)).toBe(expected);
  });
  it("validates admitted large lexical values without changing name domains", () => {
    const name = "a".repeat(1_048_576);
    expect(isXmlName(name)).toBe(true);
    expect(isNcName(name)).toBe(true);
    expect(isXmlNmToken(name)).toBe(true);
    expect(isNcName(":" + name)).toBe(false);
    expect(isXmlName(":" + name)).toBe(true);
  });
});
