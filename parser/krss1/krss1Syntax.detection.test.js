import { StringDocumentSource } from "../../io/index.js";
import { OWLParserRegistry } from "../../manager/parserRegistry.js";
import { krss2ParserDescriptor } from "../krss2/descriptor.js";

import { detectKRSS1, krss1ParserDescriptor } from "./descriptor.js";

const source = (text, fileName, contentType) =>
  new StringDocumentSource(text, { contentType, fileName });

describe("KRSS-family deterministic dialect selection", () => {
  it("keeps shared productions dialect-ambiguous", () => {
    expect(detectKRSS1(source("(define-concept A B)")).result).toBe(
      "INDETERMINATE",
    );
    expect(
      krss2ParserDescriptor.detect(source("(define-concept A B)")).result,
    ).toBe("INDETERMINATE");
  });

  it("classifies definite KRSS2 vocabulary across both descriptors", () => {
    const input = source("(implies A B)");

    expect(detectKRSS1(input).result).toBe("NO_MATCH");
    expect(krss2ParserDescriptor.detect(input).result).toBe("MATCH");
  });

  it("uses semantic KRSS hint policy instead of registration order", () => {
    const registry = new OWLParserRegistry([
      krss2ParserDescriptor,
      krss1ParserDescriptor,
    ]);
    const ids = (fileName) =>
      registry
        .resolveCandidates(source("(define-concept A B)", fileName))
        .filter(({ eligible }) => eligible)
        .map(({ descriptor }) => descriptor.id);

    expect(ids("ontology.krss").slice(0, 2)).toEqual([
      "owl-krss1",
      "owl-krss2",
    ]);
    expect(ids("ontology.krss2").slice(0, 2)).toEqual([
      "owl-krss2",
      "owl-krss1",
    ]);
  });

  it("does not guess a dialect for shared syntax without a format hint", () => {
    const registry = new OWLParserRegistry([
      krss2ParserDescriptor,
      krss1ParserDescriptor,
    ]);

    expect(
      registry
        .resolveCandidates(source("(define-concept A B)"))
        .filter(({ eligible }) => eligible),
    ).toEqual([]);
  });

  it.each([
    ["text/owl-krss", "owl-krss1"],
    ["text/owl-krss2", "owl-krss2"],
  ])("treats exact media type %s as authoritative", (contentType, expected) => {
    const registry = new OWLParserRegistry([
      krss2ParserDescriptor,
      krss1ParserDescriptor,
    ]);

    expect(
      registry
        .resolveCandidates(
          source("(define-concept A B)", undefined, contentType),
        )
        .filter(({ eligible }) => eligible)
        .map(({ descriptor }) => descriptor.id),
    ).toEqual([expected]);
  });

  it("keeps strong foreign syntax negative", () => {
    expect(
      detectKRSS1(source("Prefix: : <https://example.com/>")),
    ).toMatchObject({
      reasonCode: "KRSS1_STRONG_NEGATIVE",
      result: "NO_MATCH",
    });
  });
});
