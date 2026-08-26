import { StringDocumentSource } from "../../../index.js";
import { OWLParserRegistry } from "../parserRegistry.js";

import { detectKRSS2, krss2ParserDescriptor } from "./descriptor.js";

const source = (text) => new StringDocumentSource(text);

describe("KRSS2 bounded detection", () => {
  it.each(["(define-concept Person Human)"])(
    "keeps a shared top-level signature dialect-ambiguous",
    (text) => {
      expect(detectKRSS2(source(text))).toMatchObject({
        reasonCode: "KRSS2_SHARED_TOP_LEVEL",
        result: "INDETERMINATE",
      });
    },
  );

  it.each([
    "; comment\n(define-role parent ancestor)",
    "(role-inclusion (compose parent parent) ancestor)",
  ])("matches a KRSS2-exclusive top-level signature", (text) => {
    expect(detectKRSS2(source(text))).toMatchObject({
      reasonCode: "KRSS2_EXCLUSIVE_TOP_LEVEL",
      result: "MATCH",
    });
  });

  it.each([
    '<?xml version="1.0"?><Ontology />',
    "Prefix(:=<urn:test#>) Ontology(<urn:test>)",
    "@prefix : <urn:test#> .",
    "Person ⊑ Human",
    "(define-data-role age)",
  ])("does not claim a foreign or unsupported syntax", (text) => {
    expect(detectKRSS2(source(text)).result).toBe("NO_MATCH");
  });

  it("retains a separately constructible KRSS2-only registry", () => {
    const registry = new OWLParserRegistry([krss2ParserDescriptor]);

    expect(registry.getDescriptors().map(({ format }) => format.key)).toEqual([
      "krss2",
    ]);
  });
});
