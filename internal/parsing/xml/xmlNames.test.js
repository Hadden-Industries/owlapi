import { isNcName, isXmlName, isXmlNmToken, ncNameSuffix } from "./xmlNames.js";

describe("distinct XML name domains", () => {
  test.each([
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
  ])("preserves Name/NCName/NMTOKEN for %p", (value, name, ncname, token) => {
    expect(isXmlName(value)).toBe(name);
    expect(isNcName(value)).toBe(ncname);
    expect(isXmlNmToken(value)).toBe(token);
  });

  it("keeps the longest namespace-local suffix separate from XML Name", () => {
    expect(ncNameSuffix("urn:example:12name")).toBe("name");
    expect(ncNameSuffix("urn:example:12")).toBeUndefined();
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
