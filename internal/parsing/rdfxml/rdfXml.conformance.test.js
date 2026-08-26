import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { rdfDataFactory, rdfDatasetFactory } from "../../rdfjs/environment.js";
import { datasetsAreIsomorphic } from "../../../util/rdf-dataset-isomorphism.mjs";

import { RdfXmlSyntaxAdapter } from "./rdfXmlSyntaxAdapter.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../docs/conformance/generated/w3c-rdfxml.json",
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

describe("pinned W3C RDF/XML syntax conformance", () => {
  it("pins the complete active manifest inventory", () => {
    expect(fixture).toMatchObject({
      counts: { evaluation: 126, negativeSyntax: 40, required: 166 },
      manifestSha256:
        "027679cf7d460cdc401ccf2aab3546dfbdfad64badcdd15f225948f5643f6370",
      revision: "ad541a5f0479f0798608c4801369d97b8e08b36f",
      schemaVersion: 1,
    });
    expect(fixture.tests).toHaveLength(166);
    expect(new Set(fixture.tests.map(({ id }) => id)).size).toBe(166);
  });

  it.each(fixture.tests.filter(({ type }) => type === "EVALUATION"))(
    "matches the expected RDF graph for $id",
    async (test) => {
      const adapter = new RdfXmlSyntaxAdapter();
      const actual = await adapter.parse(
        new StringDocumentSource(test.source, { documentIRI: test.baseIRI }),
        new OWLOntologyLoaderConfiguration(),
      );
      const expected = expectedDataset(test);

      expect(actual.size).toBe(expected.size);
      expect(datasetsAreIsomorphic(actual, expected)).toBe(true);
    },
  );

  it.each(fixture.tests.filter(({ type }) => type === "NEGATIVE_SYNTAX"))(
    "rejects the negative syntax case $id",
    async (test) => {
      const adapter = new RdfXmlSyntaxAdapter();
      let error;
      try {
        await adapter.parse(
          new StringDocumentSource(test.source, { documentIRI: test.baseIRI }),
          new OWLOntologyLoaderConfiguration(),
        );
      } catch (cause) {
        error = cause;
      }

      expect(error).toBeDefined();
      expect(["OWL_SYNTAX_ERROR", "XML_PARSE_ERROR"]).toContain(error.code);
    },
  );
});
