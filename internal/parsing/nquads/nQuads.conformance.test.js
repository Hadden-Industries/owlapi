import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { createNQuadsSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../docs/conformance/generated/w3c-nquads.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const parse = (test) =>
  createNQuadsSyntaxAdapter().parse(
    new StringDocumentSource(test.source, { documentIRI: test.baseIRI }),
    new OWLOntologyLoaderConfiguration(),
  );

describe("pinned W3C N-Quads syntax conformance", () => {
  it("pins the complete independently owned RDF 1.1 and RDF 1.2 inventory", () => {
    expect(fixture).toMatchObject({
      counts: {
        negativeSyntax: 54,
        positiveSyntax: 60,
        required: 114,
      },
      manifests: {
        rdf11:
          "4c658a4e111adff512e89ff2c39acf9195109592f54711ce06823dac544c62ca",
        rdf12Syntax:
          "90d06079b66e5f2d0df598cf451eeaa7b896c11f8869bec6219a40ac6b504768",
      },
      revision: "12774b0ebb385d17651b396654b19254d0fefbfa",
      schemaVersion: 1,
    });
    expect(fixture.tests).toHaveLength(114);
    expect(
      new Set(fixture.tests.map(({ id, suite }) => `${suite}:${id}`)).size,
    ).toBe(114);
  });

  it.each(fixture.tests.filter(({ type }) => type === "POSITIVE_SYNTAX"))(
    "accepts the positive syntax case $suite/$id without losing graph terms",
    async (test) => {
      const { dataset } = await parse(test);

      expect(dataset.size).toBe(test.expectedQuadCount);
      expect([...dataset].map(({ graph }) => graph.termType).sort()).toEqual(
        test.expectedGraphTermTypes,
      );
    },
  );

  it.each(fixture.tests.filter(({ type }) => type === "NEGATIVE_SYNTAX"))(
    "rejects the negative syntax case $suite/$id",
    async (test) => {
      await expect(parse(test)).rejects.toMatchObject({
        code: "OWL_SYNTAX_ERROR",
        syntax: "N-Quads",
      });
    },
  );
});
