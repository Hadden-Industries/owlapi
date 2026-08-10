import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { OWLOntologyLoaderConfiguration } from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";

const UPSTREAM_MANIFEST_URL = new URL(
  "../../../../docs/owlapi-js/conformance/upstream/w3c-owl2/all.rdf",
  import.meta.url,
);
const CLASSIFICATIONS_URL = new URL(
  "../../../../docs/owlapi-js/conformance/classification-manifests.json",
  import.meta.url,
);
const EXPECTED_MANIFEST_SHA256 =
  "986ce4f9df655b1f44aec86a5753530d295355a8e9a16700e0253ac30759c4e1";
const FUNCTIONAL_PROPERTIES = Object.freeze([
  "fsPremiseOntology",
  "fsConclusionOntology",
  "fsNonConclusionOntology",
  "fsInputOntology",
]);
const STANDARD_PREFIXES = Object.freeze({
  owl: "http://www.w3.org/2002/07/owl#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
});

const decodeXmlText = (value) =>
  value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replace(/&#x([0-9a-f]+);/giu, (_, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 16)),
    )
    .replace(/&#([0-9]+);/gu, (_, digits) =>
      String.fromCodePoint(Number.parseInt(digits, 10)),
    )
    .replaceAll("&amp;", "&");

const readProperty = (block, property) => {
  const match = block.match(
    new RegExp(
      `<test:${property}\\b[^>]*>([\\s\\S]*?)<\\/test:${property}>`,
      "u",
    ),
  );
  return match ? decodeXmlText(match[1]) : undefined;
};

const readCases = (xml) =>
  [...xml.matchAll(/<test:TestCase\b[\s\S]*?<\/test:TestCase>/gu)].map(
    ([block]) => ({
      documents: Object.fromEntries(
        FUNCTIONAL_PROPERTIES.map((property) => [
          property,
          readProperty(block, property),
        ]).filter(([, document]) => document !== undefined),
      ),
      id: readProperty(block, "identifier"),
    }),
  );

const upstreamBytes = readFileSync(UPSTREAM_MANIFEST_URL);
const cases = readCases(upstreamBytes.toString("utf8"));
const classificationsDocument = JSON.parse(
  readFileSync(CLASSIFICATIONS_URL, "utf8"),
);
const classifications = classificationsDocument.manifests.find(
  ({ suite }) => suite === "w3c-owl2",
);
const classificationById = new Map(
  classifications.entries.map((entry) => [entry.id, entry]),
);
const requiredCases = cases.filter(
  ({ id }) => classificationById.get(id)?.classification === "REQUIRED",
);

describe("pinned W3C OWL 2 Functional documents", () => {
  it("pins and classifies every archived approved test exactly once", () => {
    expect(createHash("sha256").update(upstreamBytes).digest("hex")).toBe(
      EXPECTED_MANIFEST_SHA256,
    );
    expect(cases).toHaveLength(338);
    expect(new Set(cases.map(({ id }) => id))).toHaveProperty("size", 338);
    expect(classifications.sourceTestCount).toBe(338);
    expect(classifications.entries).toHaveLength(338);
    expect(classificationById).toHaveProperty("size", 338);
    expect([...classificationById.keys()].sort()).toEqual(
      cases.map(({ id }) => id).sort(),
    );

    for (const testCase of cases) {
      const entry = classificationById.get(testCase.id);
      expect(classificationsDocument.classifications).toContain(
        entry.classification,
      );
      const functionalDocuments = Object.keys(testCase.documents);
      if (entry.classification === "REQUIRED") {
        expect(functionalDocuments.length).toBeGreaterThan(0);
        expect(entry.functionalDocuments).toEqual(functionalDocuments);
      } else {
        expect(entry).toMatchObject({
          classification: "NOT_APPLICABLE",
          reasonCategory: "DIFFERENT_SYNTAX",
        });
        expect(functionalDocuments).toHaveLength(0);
      }
    }

    expect(requiredCases).toHaveLength(46);
    expect(
      requiredCases.reduce(
        (count, testCase) => count + Object.keys(testCase.documents).length,
        0,
      ),
    ).toBe(62);

    let compatibleRecoveryDocuments = 0;
    for (const testCase of requiredCases) {
      for (const document of Object.values(testCase.documents)) {
        const declarations = [
          ...document.matchAll(
            /Prefix\s*\(\s*(owl|rdf|rdfs|xsd):\s*=\s*<([^>]*)>\s*\)/gu,
          ),
        ];
        if (declarations.length > 0) {
          compatibleRecoveryDocuments += 1;
        }
        for (const [, prefix, namespace] of declarations) {
          expect(namespace).toBe(STANDARD_PREFIXES[prefix]);
        }
      }
    }
    expect(compatibleRecoveryDocuments).toBe(
      classifications.compatibleRecoveryDocumentCount,
    );
  });

  it.each(requiredCases)(
    "parses every Functional document for $id",
    async (testCase) => {
      const configuration = new OWLOntologyLoaderConfiguration({
        parsingMode: "compatible",
      });

      for (const [property, document] of Object.entries(testCase.documents)) {
        const manager = OWLManager.createOWLOntologyManager();
        await expect(
          manager.loadOntologyFromOntologyDocument(document, configuration),
        ).resolves.toBeDefined();
        expect(property).toMatch(
          /^fs(?:Premise|Conclusion|NonConclusion|Input)Ontology$/u,
        );
      }
    },
  );
});
