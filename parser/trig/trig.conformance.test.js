import { readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { rdfDataFactory, rdfDatasetFactory } from "../../rdf/index.js";
import { datasetsAreIsomorphic } from "../../../../util/rdf-dataset-isomorphism.mjs";
import { createTriGSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../../docs/owlapi-js/conformance/generated/w3c-trig.json",
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
          "151cee87899fe6efc049c4ea606c5ea44a7074469e147df8e56df67b69e87ae2",
        rdf12Eval:
          "e341c4f3a810602ca7c26a677735740d5409298d7dba22782b03e878ff41a9d5",
        rdf12Syntax:
          "dd7edf4f760dc6c30fff3ed874ac1796130a253ebe4abaf37f8ac6b3721f0086",
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
