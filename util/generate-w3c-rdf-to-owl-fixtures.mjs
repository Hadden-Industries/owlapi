import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { finished } from "node:stream/promises";

import { format as formatWithPrettier } from "prettier";
import { RdfXmlParser } from "rdfxml-streaming-parser";

const SOURCE_URL = new URL(
  "../docs/conformance/upstream/w3c-owl2/all.rdf",
  import.meta.url,
);
const CLASSIFICATIONS_URL = new URL(
  "../docs/conformance/classification-manifests.json",
  import.meta.url,
);
const FIXTURE_URL = new URL(
  "../docs/conformance/generated/w3c-owl2-rdf-to-owl.json",
  import.meta.url,
);
const EXPECTED_SOURCE_SHA256 =
  "986ce4f9df655b1f44aec86a5753530d295355a8e9a16700e0253ac30759c4e1";
const RDF_PROPERTIES = Object.freeze([
  "rdfXmlPremiseOntology",
  "rdfXmlConclusionOntology",
  "rdfXmlNonConclusionOntology",
]);
const EXPECTED_STRICT_COMPLETENESS_REJECTIONS = Object.freeze([
  Object.freeze({
    errorCode: "UNSUPPORTED_CONSTRUCT",
    governingRules: Object.freeze([
      "Table 9",
      "Table 16",
      "final graph emptiness",
    ]),
    governingSpecification:
      "https://www.w3.org/TR/2012/REC-owl2-mapping-to-rdf-20121211/",
    predicate: "http://example.org/hasAunt",
    rdfDocument: "rdfXmlConclusionOntology",
    reasonCategory: "UNDECLARED_ASSERTION_PREDICATE",
    testId: "New-Feature-ObjectPropertyChain-001",
  }),
  Object.freeze({
    errorCode: "UNSUPPORTED_CONSTRUCT",
    governingRules: Object.freeze([
      "Table 9",
      "Table 16",
      "final graph emptiness",
    ]),
    governingSpecification:
      "https://www.w3.org/TR/2012/REC-owl2-mapping-to-rdf-20121211/",
    predicate: "http://example.org/p",
    rdfDocument: "rdfXmlConclusionOntology",
    reasonCategory: "UNDECLARED_ASSERTION_PREDICATE",
    testId: "New-Feature-ObjectPropertyChain-BJP-003",
  }),
]);
const KNOWN_SOURCE_DEFECTS = Object.freeze([
  Object.freeze({
    compatibleDiagnostic: "RDF_LIST_NON_NIL_TERMINATOR",
    defect:
      "The embedded RDF/XML ends the owl:oneOf collection at the RDF namespace IRI rather than rdf:nil.",
    javaOwlapi551Behavior:
      "Accepts the unstructured IRI as a terminal and reconstructs both list literals.",
    rdfDocument: "rdfXmlPremiseOntology",
    strictOutcome: "OWL_SYNTAX_ERROR",
    testIds: Object.freeze([
      "New-Feature-Rational-002",
      "New-Feature-Rational-003",
    ]),
  }),
]);

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
      caseIRI: block.match(/<test:TestCase\s+rdf:about="([^"]+)"/u)?.[1],
      documents: Object.fromEntries(
        RDF_PROPERTIES.map((property) => [
          property,
          readProperty(block, property),
        ]).filter(([, document]) => document !== undefined),
      ),
      id: readProperty(block, "identifier"),
      owl2Dl: block.includes(`<test:species rdf:resource="&test;DL" />`),
    }),
  );

const encodeTerm = (term) => {
  switch (term.termType) {
    case "NamedNode":
      return ["N", term.value];
    case "BlankNode":
      return ["B", term.value];
    case "Literal":
      return ["L", term.value, term.language, term.datatype.value];
    default:
      throw new TypeError(`Unsupported fixture RDF term: ${term.termType}`);
  }
};

const encodeQuad = (quad) => [
  encodeTerm(quad.subject),
  encodeTerm(quad.predicate),
  encodeTerm(quad.object),
];

const formatJson = (value) =>
  formatWithPrettier(JSON.stringify(value), { parser: "json" });

const parseRdfXml = async (source, baseIRI) => {
  const parser = new RdfXmlParser({ baseIRI });
  const quads = [];
  parser.on("data", (quad) => quads.push(encodeQuad(quad)));
  parser.end(source);
  await finished(parser);
  return quads.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right), "en"),
  );
};

const sourceBytes = await readFile(SOURCE_URL);
const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
if (sourceSha256 !== EXPECTED_SOURCE_SHA256) {
  throw new Error(`Unexpected W3C OWL 2 source SHA-256: ${sourceSha256}`);
}

const cases = readCases(sourceBytes.toString("utf8"));
if (cases.length !== 338 || new Set(cases.map(({ id }) => id)).size !== 338) {
  throw new Error("The pinned W3C OWL 2 source must contain 338 unique cases");
}

const entries = [];
const documents = [];
for (const testCase of cases) {
  const documentProperties = Object.keys(testCase.documents);
  if (documentProperties.length === 0) {
    entries.push({
      classification: "NOT_APPLICABLE",
      id: testCase.id,
      reasonCategory: "DIFFERENT_SYNTAX",
    });
    continue;
  }
  if (!testCase.owl2Dl) {
    entries.push({
      classification: "NOT_APPLICABLE",
      id: testCase.id,
      reasonCategory: "OUTSIDE_OWL2_DL_REVERSE_MAPPING",
    });
    continue;
  }

  entries.push({
    classification: "REQUIRED",
    id: testCase.id,
    rdfDocuments: documentProperties,
  });
  for (const property of documentProperties) {
    const baseIRI = `${testCase.caseIRI}#${property}`;
    documents.push({
      baseIRI,
      caseId: testCase.id,
      property,
      quads: await parseRdfXml(testCase.documents[property], baseIRI),
    });
  }
}

const requiredEntries = entries.filter(
  ({ classification }) => classification === "REQUIRED",
);
if (requiredEntries.length !== 233 || documents.length !== 312) {
  throw new Error(
    `Unexpected required W3C scope: ${requiredEntries.length} cases and ${documents.length} documents`,
  );
}
const documentByKey = new Map(
  documents.map((document) => [
    `${document.caseId}\u0000${document.property}`,
    document,
  ]),
);
const expectedStrictRejectionKeys = new Set();
for (const expectation of EXPECTED_STRICT_COMPLETENESS_REJECTIONS) {
  const key = `${expectation.testId}\u0000${expectation.rdfDocument}`;
  if (expectedStrictRejectionKeys.has(key)) {
    throw new Error(`Duplicate strict-completeness expectation: ${key}`);
  }
  expectedStrictRejectionKeys.add(key);
  const document = documentByKey.get(key);
  if (!document) {
    throw new Error(`Unknown strict-completeness expectation document: ${key}`);
  }
  const predicateOccurs = document.quads.some(
    ([, predicate]) =>
      predicate[0] === "N" && predicate[1] === expectation.predicate,
  );
  if (!predicateOccurs) {
    throw new Error(
      `Strict-completeness expectation predicate is absent from ${key}`,
    );
  }
}

const classifications = JSON.parse(await readFile(CLASSIFICATIONS_URL, "utf8"));
const manifest = classifications.manifests.find(
  ({ id }) => id === "w3c-owl2.rdf-to-owl",
);
if (!manifest) {
  throw new Error("Missing w3c-owl2.rdf-to-owl classification manifest");
}
const compatibleReconstructionSuccessDocumentCount =
  KNOWN_SOURCE_DEFECTS.reduce(
    (count, defect) => count + defect.testIds.length,
    0,
  );
const expectedStrictCompletenessRejectionDocumentCount =
  EXPECTED_STRICT_COMPLETENESS_REJECTIONS.length;
const successfulReconstructionDocumentCount =
  documents.length - expectedStrictCompletenessRejectionDocumentCount;
Object.assign(manifest, {
  compatibleReconstructionSuccessDocumentCount,
  entries,
  expectedStrictCompletenessRejectionDocumentCount,
  expectedStrictCompletenessRejections: EXPECTED_STRICT_COMPLETENESS_REJECTIONS,
  knownSourceDefects: KNOWN_SOURCE_DEFECTS,
  notApplicableReasonCategories: {
    DIFFERENT_SYNTAX:
      "The pinned W3C case contains no RDF premise, conclusion, or non-conclusion document property.",
    OUTSIDE_OWL2_DL_REVERSE_MAPPING:
      "The RDF document belongs to an OWL Full/RDF-based case outside the normative OWL 2 DL RDF-graph-to-structural-specification mapping domain.",
  },
  requiredDocumentCount: documents.length,
  requiredTestCount: requiredEntries.length,
  runner: "internal/mapping/rdfToOwlTranslator.conformance.test.js",
  runnerScope:
    "Classify and execute every applicable RDF premise, conclusion, and non-conclusion document at the RDF-to-OWL mapping seam, requiring its governed successful-reconstruction or strict-completeness-rejection disposition; semantic entailment/profile outcomes remain outside this phase.",
  runnerParsingPolicy:
    "Strict reconstruction succeeds for 308 documents; two declared malformed-list source documents reconstruct with the narrow Java-compatible non-rdf:nil terminal recovery and assert its warning; two isolated entailment-conclusion documents require the exact governed strict-completeness rejection because their undeclared assertion predicates cannot satisfy OWL 2 reverse-mapping Tables 9 and 16 or the final graph-emptiness condition.",
  sourceTestCount: cases.length,
  strictReconstructionSuccessDocumentCount:
    successfulReconstructionDocumentCount -
    compatibleReconstructionSuccessDocumentCount,
  successfulReconstructionDocumentCount,
});

await writeFile(CLASSIFICATIONS_URL, await formatJson(classifications), "utf8");
await writeFile(
  FIXTURE_URL,
  await formatJson({
    documents,
    generatedBy: "util/generate-w3c-rdf-to-owl-fixtures.mjs",
    schemaVersion: 1,
    sourceSha256,
  }),
  "utf8",
);

process.stdout.write(
  `Generated ${documents.length} RDF/JS fixtures for ${requiredEntries.length} W3C cases.\n`,
);
