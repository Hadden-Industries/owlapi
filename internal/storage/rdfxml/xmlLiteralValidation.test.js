import { expect, jest, test } from "@jest/globals";
import { DOMParser } from "@xmldom/xmldom";
import { validateEmbeddedXmlLiteral } from "./xmlLiteralValidation.js";

test("validates many independent XML-literal siblings in bounded native documents", () => {
  const root = '<r xmlns:p="urn:p">';
  const lexical = root + '<p:e title="&gt;"/>\n'.repeat(5_000) + "</r>";
  const parse = jest.spyOn(DOMParser.prototype, "parseFromString");
  try {
    validateEmbeddedXmlLiteral(lexical);
    expect(parse.mock.calls.length).toBeGreaterThan(2);
    for (const [batch] of parse.mock.calls) {
      expect(batch.length).toBeLessThanOrEqual(16_384);
      expect(batch.startsWith(root)).toBe(true);
      expect(batch.endsWith("</r>")).toBe(true);
    }
  } finally {
    parse.mockRestore();
  }
});

test.each([
  ["nested element", "<nested><child/></nested>", true],
  ["local namespace", '<p:item xmlns:p="urn:new"/>', true],
  ["unbalanced element", "<bad></other>", false],
  ["repeated lexical attribute", '<a x="one" x="two"/>', false],
])(
  "retains whole-input native handling for %s",
  (_name, fragment, accepted) => {
    const text = "<r>" + "<e/>".repeat(5_000) + fragment + "</r>";
    const parse = jest.spyOn(DOMParser.prototype, "parseFromString");
    try {
      if (accepted)
        expect(() => validateEmbeddedXmlLiteral(text)).not.toThrow();
      else expect(() => validateEmbeddedXmlLiteral(text)).toThrow();
      expect(parse.mock.calls.at(-1)[0]).toBe(text);
    } finally {
      parse.mockRestore();
    }
  },
);
