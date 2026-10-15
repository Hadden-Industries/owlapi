import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { rdfDataFactory, rdfDatasetFactory } from "../../rdfjs/environment.js";
import { datasetsAreIsomorphic } from "../../../util/rdf-dataset-isomorphism.mjs";
import { createTriGSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../docs/conformance/generated/w3c-trig.json",
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
  createTriGSyntaxAdapter().parse(
    new StringDocumentSource(test.source, { documentIRI: test.baseIRI }),
    new OWLOntologyLoaderConfiguration(),
  );

describe("pinned W3C TriG syntax conformance", () => {
  it("pins the complete independently owned RDF 1.1 and RDF 1.2 inventory", () => {
    expect(fixture).toMatchObject({
      counts: {
        evaluation: 169,
        excluded: 5,
        negativeSyntax: 126,
        positiveSyntax: 123,
        required: 413,
        source: 418,
      },
      manifests: {
        rdf11:
          "5638fd7f38fa73201df4eb3d97a12d4eccb50b8806fbbb43489ccaeaa654288f",
        rdf12Eval:
          "ac24d21a3f44b591919743e5eceb15960c0caef7cd00ac560b15be1444dfde1e",
        rdf12Syntax:
          "a980964814fecb2ee4f367afdc6b5a27910a0f112b7d446207a7d7e747a1c29c",
      },
      revision: "12774b0ebb385d17651b396654b19254d0fefbfa",
      schemaVersion: 1,
    });
    expect(fixture.tests).toHaveLength(418);
    expect(
      new Set(fixture.tests.map(({ id, suite }) => `${suite}:${id}`)).size,
    ).toBe(418);
  });

  it.each(
    fixture.tests.filter(
      ({ classification, type }) =>
        classification === "REQUIRED" && type === "EVALUATION",
    ),
  )("matches the expected RDF graph for $suite/$id", async (test) => {
    const { dataset: actual } = await parse(test);
    const expected = expectedDataset(test);

    expect(actual.size).toBe(expected.size);
    expect(datasetsAreIsomorphic(actual, expected)).toBe(true);
  });

  it.each(
    fixture.tests.filter(
      ({ classification, type }) =>
        classification === "REQUIRED" && type === "POSITIVE_SYNTAX",
    ),
  )("accepts the positive syntax case $suite/$id", async (test) => {
    await expect(parse(test)).resolves.toHaveProperty("dataset");
  });

  it.each(
    fixture.tests.filter(
      ({ classification, type }) =>
        classification === "REQUIRED" && type === "NEGATIVE_SYNTAX",
    ),
  )("rejects the negative syntax case $suite/$id", async (test) => {
    await expect(parse(test)).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      syntax: "TriG",
    });
  });
});
