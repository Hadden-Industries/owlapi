import { readFileSync } from "node:fs";

import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { datasetsAreIsomorphic } from "../../../../util/rdf-dataset-isomorphism.mjs";
import { createNQuadsSyntaxAdapter } from "../rdf/n3SyntaxAdapter.js";

import { JsonLdSyntaxAdapter } from "./jsonLdSyntaxAdapter.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../../docs/owlapi-js/conformance/generated/w3c-jsonld.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const configurationFor = (test) => {
  let format = OWLDocumentFormats.JSON_LD;
  for (const [key, value] of Object.entries(test.parameters || {})) {
    format = format.withParameter(key, value);
  }
  return new OWLOntologyLoaderConfiguration({
    format,
    maxRedirects: 0,
    remoteJsonLdContexts: true,
    timeoutMs: 30_000,
  });
};
const documentLoader = {
  async load(iri) {
    const resource = fixture.resources[iri.value];
    if (resource === undefined) {
      throw new Error(`The pinned fixture has no context for ${iri.value}`);
    }
    return resource;
  },
};
const parse = (test) =>
  new JsonLdSyntaxAdapter({ documentLoader }).parse(
    new StringDocumentSource(test.source, { documentIRI: test.baseIRI }),
    configurationFor(test),
  );
const expectedDataset = async (test) =>
  (
    await createNQuadsSyntaxAdapter().parse(
      new StringDocumentSource(test.expected, {
        documentIRI: test.baseIRI,
      }),
      new OWLOntologyLoaderConfiguration(),
    )
  ).dataset;

describe("pinned W3C JSON-LD to-RDF conformance", () => {
  it("pins and classifies the complete to-RDF and from-RDF inventories", () => {
    expect(fixture).toMatchObject({
      counts: {
        fromRdf: {
          EXCLUDED_WITH_REASON: 0,
          NOT_APPLICABLE: 54,
          REQUIRED: 0,
        },
        toRdf: {
          EXCLUDED_WITH_REASON: 5,
          NOT_APPLICABLE: 0,
          REQUIRED: 462,
        },
      },
      manifests: {
        fromRdf:
          "7257466aa9cb9cc4d8cd7e345cd522056b5d2283b6a907783aca118c1afd05c8",
        toRdf:
          "aeb5b24dd17a3d1b5fae5f39f75f796a9e7fbe7e717dfcb10f47619fbe00e41e",
      },
      revision: "ffdb326121ea89b7b8280e76a5caea923834bcef",
      schemaVersion: 1,
    });
    expect(fixture.tests).toHaveLength(467);
    expect(new Set(fixture.tests.map(({ id }) => id)).size).toBe(467);
    expect(
      fixture.tests
        .filter(
          ({ classification }) => classification === "EXCLUDED_WITH_REASON",
        )
        .reduce((counts, { reasonCategory }) => {
          counts[reasonCategory] = (counts[reasonCategory] || 0) + 1;
          return counts;
        }, {}),
    ).toEqual({
      JSONLD_GENERALIZED_RDF_OUTSIDE_OWL_INGESTION: 2,
      JSONLDJS_9_CONFORMANCE_GAP: 3,
    });
  });

  it.each(
    fixture.tests.filter(
      ({ classification, testType }) =>
        classification === "REQUIRED" && testType === "POSITIVE_EVALUATION",
    ),
  )("matches the expected RDF dataset for $id", async (test) => {
    const { dataset: actual } = await parse(test);
    const expected = await expectedDataset(test);

    expect(actual.size).toBe(expected.size);
    expect(datasetsAreIsomorphic(actual, expected)).toBe(true);
  });

  it.each(
    fixture.tests.filter(
      ({ classification, testType }) =>
        classification === "REQUIRED" && testType === "POSITIVE_SYNTAX",
    ),
  )("accepts the positive syntax case $id", async (test) => {
    await expect(parse(test)).resolves.toHaveProperty("dataset");
  });

  it.each(
    fixture.tests.filter(
      ({ classification, testType }) =>
        classification === "REQUIRED" && testType === "NEGATIVE_EVALUATION",
    ),
  )("rejects the negative evaluation case $id", async (test) => {
    await expect(parse(test)).rejects.toBeDefined();
  });
});
