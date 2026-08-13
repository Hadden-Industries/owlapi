import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { OWLOntologyLoaderConfiguration } from "../io/index.js";
import { IRI } from "../model/index.js";
import {
  rdfDataFactory,
  rdfDatasetFactory,
  RdfToOwlTranslator,
} from "./index.js";

const UPSTREAM_URL = new URL(
  "../../../docs/owlapi-js/conformance/upstream/w3c-owl2/all.rdf",
  import.meta.url,
);
const FIXTURE_URL = new URL(
  "../../../docs/owlapi-js/conformance/generated/w3c-owl2-rdf-to-owl.json",
  import.meta.url,
);
const CLASSIFICATIONS_URL = new URL(
  "../../../docs/owlapi-js/conformance/classification-manifests.json",
  import.meta.url,
);
const EXPECTED_SOURCE_SHA256 =
  "986ce4f9df655b1f44aec86a5753530d295355a8e9a16700e0253ac30759c4e1";
const COMPATIBLE_SOURCE_DEFECTS = new Set([
  "New-Feature-Rational-002\u0000rdfXmlPremiseOntology",
  "New-Feature-Rational-003\u0000rdfXmlPremiseOntology",
]);
const COMPATIBLE_CONFIGURATION = new OWLOntologyLoaderConfiguration({
  parsingMode: "compatible",
});

const decodeTerm = ([type, value, language, datatype]) => {
  switch (type) {
    case "N":
      return rdfDataFactory.namedNode(value);
    case "B":
      return rdfDataFactory.blankNode(value);
    case "L":
      return language
        ? rdfDataFactory.literal(value, language)
        : rdfDataFactory.literal(value, rdfDataFactory.namedNode(datatype));
    default:
      throw new TypeError(`Unknown fixture RDF term encoding: ${type}`);
  }
};

const constructDataset = ({ quads }) =>
  rdfDatasetFactory.dataset(
    quads.map(([subject, predicate, object]) =>
      rdfDataFactory.quad(
        decodeTerm(subject),
        decodeTerm(predicate),
        decodeTerm(object),
      ),
    ),
  );

const upstreamBytes = readFileSync(UPSTREAM_URL);
const fixture = JSON.parse(readFileSync(FIXTURE_URL, "utf8"));
const classifications = JSON.parse(
  readFileSync(CLASSIFICATIONS_URL, "utf8"),
).manifests.find(({ id }) => id === "w3c-owl2.rdf-to-owl");

describe("pinned W3C OWL 2 RDF-to-OWL mapping documents", () => {
  it("pins, exhaustively classifies, and preconstructs the applicable mapping scope", () => {
    expect(createHash("sha256").update(upstreamBytes).digest("hex")).toBe(
      EXPECTED_SOURCE_SHA256,
    );
    expect(fixture).toMatchObject({
      generatedBy: "util/generate-w3c-rdf-to-owl-fixtures.mjs",
      schemaVersion: 1,
      sourceSha256: EXPECTED_SOURCE_SHA256,
    });
    expect(classifications).toMatchObject({
      requiredDocumentCount: 312,
      requiredTestCount: 233,
      sourceTestCount: 338,
    });
    expect(classifications.entries).toHaveLength(338);
    expect(
      classifications.entries.filter(
        ({ classification }) => classification === "REQUIRED",
      ),
    ).toHaveLength(233);
    expect(fixture.documents).toHaveLength(312);

    const requiredDocuments = classifications.entries
      .filter(({ classification }) => classification === "REQUIRED")
      .flatMap(({ id, rdfDocuments }) =>
        rdfDocuments.map((property) => `${id}\u0000${property}`),
      )
      .sort();
    expect(
      fixture.documents
        .map(({ caseId, property }) => `${caseId}\u0000${property}`)
        .sort(),
    ).toEqual(requiredDocuments);
  });

  it.each(fixture.documents)(
    "reconstructs $caseId / $property from a constructed DatasetCore",
    async (document) => {
      const sourceDefect = COMPATIBLE_SOURCE_DEFECTS.has(
        `${document.caseId}\u0000${document.property}`,
      );
      const result = await new RdfToOwlTranslator().translate(
        constructDataset(document),
        {
          configuration: sourceDefect ? COMPATIBLE_CONFIGURATION : undefined,
          documentIRI: IRI.create(document.baseIRI),
        },
      );

      expect(result.ontology).toBeDefined();
      expect(Object.isFrozen(result)).toBe(true);
      expect(result.context.diagnostics).toEqual(
        sourceDefect
          ? [
              expect.objectContaining({
                code: "RDF_LIST_NON_NIL_TERMINATOR",
                severity: "warning",
                terminator: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
              }),
            ]
          : [],
      );
    },
  );
});
