import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { rdfDataFactory, rdfDatasetFactory } from "../../rdfjs/environment.js";
import { datasetsAreIsomorphic } from "../../../util/rdf-dataset-isomorphism.mjs";
import { createTurtleSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../docs/conformance/generated/w3c-turtle.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const decodeTerm = (encoded) => {
  switch (encoded[0]) {
    case "N":
      return rdfDataFactory.namedNode(encoded[1]);
    case "B":
      return rdfDataFactory.blankNode(encoded[1]);
    case "L": {
      const [, value, language, direction, datatype] = encoded;
      return rdfDataFactory.literal(
        value,
        language
          ? { direction: direction || undefined, language }
          : rdfDataFactory.namedNode(datatype),
      );
    }
    case "D":
      return rdfDataFactory.defaultGraph();
    case "Q":
      return rdfDataFactory.quad(
        decodeTerm(encoded[1]),
        decodeTerm(encoded[2]),
        decodeTerm(encoded[3]),
        decodeTerm(encoded[4]),
      );
    default:
      throw new TypeError(`Unsupported encoded RDF term: ${encoded[0]}`);
  }
};

const expectedDataset = (test) =>
  rdfDatasetFactory.dataset(
    test.expectedQuads.map((encoded) =>
      rdfDataFactory.quad(
        decodeTerm(encoded[0]),
        decodeTerm(encoded[1]),
        decodeTerm(encoded[2]),
        decodeTerm(encoded[3]),
      ),
    ),
  );

const parse = (test) =>
  createTurtleSyntaxAdapter().parse(
    new StringDocumentSource(test.source, { documentIRI: test.baseIRI }),
    new OWLOntologyLoaderConfiguration(),
  );

describe("pinned W3C Turtle syntax conformance", () => {
  it("pins the complete independently owned RDF 1.1 and RDF 1.2 inventory", () => {
    expect(fixture).toMatchObject({
      counts: {
        evaluation: 145,
        negativeSyntax: 127,
        positiveSyntax: 115,
        required: 387,
      },
      manifests: {
        rdf11:
          "52b5667f7c85743b06ab0bbee3f5d74cf4fd9c117b98cde94ad66bb5c9489b17",
        rdf12Syntax:
          "438abd39f13454555b3144ef249ac5898a81d0676028102fd479a6fc4b3ee553",
      },
      revision: "12774b0ebb385d17651b396654b19254d0fefbfa",
      schemaVersion: 1,
    });
    expect(fixture.tests).toHaveLength(387);
    expect(
      new Set(fixture.tests.map(({ id, suite }) => `${suite}:${id}`)).size,
    ).toBe(387);
  });

  it.each(fixture.tests.filter(({ type }) => type === "EVALUATION"))(
    "matches the expected RDF graph for $suite/$id",
    async (test) => {
      const { dataset: actual } = await parse(test);
      const expected = expectedDataset(test);

      expect(actual.size).toBe(expected.size);
      expect(datasetsAreIsomorphic(actual, expected)).toBe(true);
    },
  );

  it.each(fixture.tests.filter(({ type }) => type === "POSITIVE_SYNTAX"))(
    "accepts the positive syntax case $suite/$id",
    async (test) => {
      await expect(parse(test)).resolves.toHaveProperty("dataset");
    },
  );

  it.each(fixture.tests.filter(({ type }) => type === "NEGATIVE_SYNTAX"))(
    "rejects the negative syntax case $suite/$id",
    async (test) => {
      await expect(parse(test)).rejects.toMatchObject({
        code: "OWL_SYNTAX_ERROR",
        syntax: "Turtle",
      });
    },
  );
});
