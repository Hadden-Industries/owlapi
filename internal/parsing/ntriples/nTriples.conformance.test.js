import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { createNTriplesSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../docs/conformance/generated/w3c-ntriples.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const parse = (test) =>
  createNTriplesSyntaxAdapter().parse(
    new StringDocumentSource(test.source, { documentIRI: test.baseIRI }),
    new OWLOntologyLoaderConfiguration(),
  );

describe("pinned W3C N-Triples syntax conformance", () => {
  it("pins the complete independently owned RDF 1.1 and RDF 1.2 inventory", () => {
    expect(fixture).toMatchObject({
      counts: {
        negativeSyntax: 51,
        positiveSyntax: 48,
        required: 99,
      },
      manifests: {
        rdf11:
          "561ad17572c14d9290a0a1481f58d701bc8996da996b88e1beb1308c5dff55d6",
        rdf12Syntax:
          "bc3250200d58058f4ab7d89681b63fd3d06c8b3393eec165ab3481ee46d7708e",
      },
      revision: "12774b0ebb385d17651b396654b19254d0fefbfa",
      schemaVersion: 1,
    });
    expect(fixture.tests).toHaveLength(99);
    expect(
      new Set(fixture.tests.map(({ id, suite }) => `${suite}:${id}`)).size,
    ).toBe(99);
  });

  it.each(fixture.tests.filter(({ type }) => type === "POSITIVE_SYNTAX"))(
    "accepts the positive syntax case $suite/$id in the default graph",
    async (test) => {
      const { dataset } = await parse(test);

      expect(
        [...dataset].every(({ graph }) => graph.termType === "DefaultGraph"),
      ).toBe(true);
    },
  );

  it.each(fixture.tests.filter(({ type }) => type === "NEGATIVE_SYNTAX"))(
    "rejects the negative syntax case $suite/$id",
    async (test) => {
      await expect(parse(test)).rejects.toMatchObject({
        code: "OWL_SYNTAX_ERROR",
        syntax: "N-Triples",
      });
    },
  );
});
