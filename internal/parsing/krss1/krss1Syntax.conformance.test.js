import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { OWLOntologyManager } from "../../../index.js";
import { OWLParserRegistry } from "../parserRegistry.js";
import { krss1ParserDescriptor } from "./descriptor.js";

const load = (text, values = {}) =>
  new OWLOntologyManager({
    registry: new OWLParserRegistry([krss1ParserDescriptor]),
  }).loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, {
      documentIRI: "https://example.com/phase17",
      fileName: "conformance.krss",
    }),
    new OWLOntologyLoaderConfiguration({
      format: OWLDocumentFormats.KRSS1,
      ...values,
    }),
  );

describe("KRSS1 finite grammar inventory", () => {
  it("accepts every class-expression production with nesting", async () => {
    const ontology = await load(`
      (define-concept I (and A B))
      (define-concept U (or A B))
      (define-concept N (not A))
      (define-concept S (some p A))
      (define-concept L (all p A))
      (define-concept Min (at-least 0 p A))
      (define-concept Max (at-most 2 p (and A B)))
      (define-concept Exact (exactly 1 p A))
    `);

    expect(ontology.getAxioms()).toHaveProperty("size", 8);
  });

  it("rejects Boolean expressions outside the structural OWL boundary", async () => {
    await expect(load("(define-concept A (and B))")).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
    });
    await expect(load("(define-concept A (or))")).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
    });
  });

  it("requires qualifiers on original-KRSS cardinalities", async () => {
    await expect(
      load("(define-concept A (at-least 1 p))"),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });

  it("enforces TBox-before-ABox ordering and terminal delimiters", async () => {
    await expect(
      load("(instance a A) (define-concept A B)"),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
    await expect(
      load("(instance a A) end-abox (instance b B)"),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });

  it("requires primitive concept and primitive role parents", async () => {
    await expect(load("(define-primitive-concept A)")).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
    });
    await expect(load("(define-primitive-role p)")).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
    });
  });

  it("resolves original-KRSS names against the document IRI", async () => {
    const ontology = await load("(define-concept Local External)");

    expect(
      [...ontology.getClassesInSignature()].map(({ iri }) => iri.value).sort(),
    ).toEqual([
      "https://example.com/phase17#External",
      "https://example.com/phase17#Local",
    ]);
  });

  it("rejects full IRIs and punctuation outside the original Name token", async () => {
    await expect(
      load("(define-concept A <https://example.net/B>)"),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
    await expect(load("(define-concept A-B C)")).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
    });
  });

  it("handles comments, empty documents, duplicates, and trailing garbage", async () => {
    await expect(load(" ; comment\r\n\t ")).resolves.toHaveProperty(
      "getAxioms",
    );
    const ontology = await load(
      "; first\n(define-concept A B)\n(define-concept A B)",
    );
    expect(ontology.getAxioms()).toHaveProperty("size", 1);
    await expect(load("(define-concept A B) unexpected")).rejects.toMatchObject(
      { code: "OWL_SYNTAX_ERROR" },
    );
  });

  it("rejects reserved words and named inverse roles as entities", async () => {
    await expect(load("(define-concept and B)")).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
    });
    await expect(
      load("(define-concept A (some (inv p) B))"),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });
});
