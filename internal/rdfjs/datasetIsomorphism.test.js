import { rdfDataFactory, rdfDatasetFactory } from "./environment.js";
import { datasetsAreIsomorphic } from "../../util/rdf-dataset-isomorphism.mjs";

const blankNode = (...arguments_) => rdfDataFactory.blankNode(...arguments_);
const literal = (...arguments_) => rdfDataFactory.literal(...arguments_);
const namedNode = (...arguments_) => rdfDataFactory.namedNode(...arguments_);
const quad = (...arguments_) => rdfDataFactory.quad(...arguments_);
const dataset = (quads) => rdfDatasetFactory.dataset(quads);

describe("RDF dataset isomorphism test support", () => {
  it("accepts structurally identical blank-node graphs with different labels", () => {
    const predicate = namedNode("urn:test:next");
    const value = namedNode("urn:test:value");
    const actual = dataset([
      quad(blankNode("actual-a"), predicate, blankNode("actual-b")),
      quad(blankNode("actual-b"), value, literal("leaf")),
    ]);
    const expected = dataset([
      quad(blankNode("expected-2"), value, literal("leaf")),
      quad(blankNode("expected-1"), predicate, blankNode("expected-2")),
    ]);

    expect(datasetsAreIsomorphic(actual, expected)).toBe(true);
  });

  it("rejects different graph structure despite equal sizes and term kinds", () => {
    const predicate = namedNode("urn:test:next");
    const actual = dataset([
      quad(blankNode("a"), predicate, blankNode("b")),
      quad(blankNode("b"), predicate, blankNode("c")),
    ]);
    const expected = dataset([
      quad(blankNode("x"), predicate, blankNode("y")),
      quad(blankNode("x"), predicate, blankNode("z")),
    ]);

    expect(datasetsAreIsomorphic(actual, expected)).toBe(false);
  });

  it("handles symmetric cycles without depending on blank-node labels", () => {
    const predicate = namedNode("urn:test:related");
    const actual = dataset([
      quad(blankNode("a"), predicate, blankNode("b")),
      quad(blankNode("b"), predicate, blankNode("a")),
    ]);
    const expected = dataset([
      quad(blankNode("y"), predicate, blankNode("x")),
      quad(blankNode("x"), predicate, blankNode("y")),
    ]);

    expect(datasetsAreIsomorphic(actual, expected)).toBe(true);
  });

  it("preserves literal datatype, language, and direction distinctions", () => {
    const subject = namedNode("urn:test:subject");
    const predicate = namedNode("urn:test:label");
    const actual = dataset([
      quad(
        subject,
        predicate,
        literal("label", { language: "en", direction: "ltr" }),
      ),
    ]);
    const expected = dataset([
      quad(subject, predicate, literal("label", "en")),
    ]);

    expect(datasetsAreIsomorphic(actual, expected)).toBe(false);
  });
});
