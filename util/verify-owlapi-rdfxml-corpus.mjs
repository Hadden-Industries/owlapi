import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../io/index.js";
import { RdfXmlSyntaxAdapter } from "../internal/parsing/rdfxml/rdfXmlSyntaxAdapter.js";
import { RdfToOwlTranslator } from "../internal/mapping/rdfToOwlTranslator.js";

const benchmarkCorpus = JSON.parse(
  readFileSync(
    new URL("../docs/performance/benchmark-corpus.json", import.meta.url),
    "utf8",
  ),
);

const expectations = new Map([
  [
    "real-medium-wine",
    {
      axioms: 747,
      classes: 77,
      dataProperties: 1,
      diagnosticCounts: {},
      mode: "strict",
      objectProperties: 13,
      quads: 1_839,
    },
  ],
  [
    "real-large-geonames",
    {
      axioms: 5_536,
      classes: 15,
      dataProperties: 17,
      diagnosticCounts: { RDF_UNCONSUMED_OWL_TRIPLE: 1_234 },
      mode: "compatible",
      objectProperties: 17,
      quads: 6_844,
      strictErrorCode: "UNSUPPORTED_CONSTRUCT",
    },
  ],
  [
    "real-largest-schemaorg",
    {
      axioms: 14_273,
      classes: 946,
      dataProperties: 191,
      diagnosticCounts: {
        RDF_OWL_FULL_DATA_PROPERTY_RANGE_AS_CLASS: 185,
        RDF_PROPERTY_CATEGORY_REUSE: 6,
      },
      mode: "compatible",
      objectProperties: 1_555,
      quads: 36_054,
      strictErrorCode: "OWL_SYNTAX_ERROR",
    },
  ],
]);

const rdfXmlFixtures = benchmarkCorpus.realWorldFixtures.filter(({ id }) =>
  expectations.has(id),
);

if (rdfXmlFixtures.length !== expectations.size) {
  throw new Error("The RDF/XML benchmark corpus inventory is incomplete");
}

const assertEqual = (actual, expected, message) => {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, observed ${actual}`);
  }
};

const assertJsonEqual = (actual, expected, message) => {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      `${message}: expected ${expectedJson}, observed ${actualJson}`,
    );
  }
};

const diagnosticCounts = (diagnostics) => {
  const counts = {};
  for (const { code } of diagnostics) {
    counts[code] = (counts[code] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
};

const parse = async (text, fileName, mode) => {
  const configuration = new OWLOntologyLoaderConfiguration({
    parsingMode: mode,
  });
  const documentIRI = `https://example.com/owlapi-js/corpus/${fileName}`;
  const source = new StringDocumentSource(text, {
    documentIRI,
    fileName,
  });
  const dataset = await new RdfXmlSyntaxAdapter().parse(source, configuration);
  const translated = await new RdfToOwlTranslator().translate(dataset, {
    configuration,
    documentIRI,
  });
  return { dataset, ...translated };
};

const results = [];
for (const fixture of rdfXmlFixtures) {
  const expected = expectations.get(fixture.id);
  if (!existsSync(fixture.localEvidencePath)) {
    throw new Error(
      `Missing pinned corpus input ${fixture.localEvidencePath}; acquire the exact fixture before running this verifier`,
    );
  }
  const bytes = readFileSync(fixture.localEvidencePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assertEqual(bytes.byteLength, fixture.bytes, `${fixture.id} byte length`);
  assertEqual(sha256, fixture.sha256, `${fixture.id} SHA-256`);

  if (expected.strictErrorCode) {
    let strictError;
    try {
      await parse(bytes.toString("utf8"), fixture.id, "strict");
    } catch (error) {
      strictError = error;
    }
    assertEqual(
      strictError?.code,
      expected.strictErrorCode,
      `${fixture.id} strict-mode error code`,
    );
  }

  const { context, dataset, ontology } = await parse(
    bytes.toString("utf8"),
    fixture.id,
    expected.mode,
  );
  const observed = {
    axioms: ontology.getAxioms().size,
    classes: ontology.getClassesInSignature().size,
    dataProperties: ontology.getDataPropertiesInSignature().size,
    diagnosticCounts: diagnosticCounts(context.diagnostics),
    objectProperties: ontology.getObjectPropertiesInSignature().size,
    quads: dataset.size,
  };
  for (const key of [
    "axioms",
    "classes",
    "dataProperties",
    "objectProperties",
    "quads",
  ]) {
    assertEqual(observed[key], expected[key], `${fixture.id} ${key}`);
  }
  assertJsonEqual(
    observed.diagnosticCounts,
    expected.diagnosticCounts,
    `${fixture.id} diagnostic counts`,
  );
  results.push({
    bytes: bytes.byteLength,
    id: fixture.id,
    mode: expected.mode,
    sha256,
    strictErrorCode: expected.strictErrorCode || null,
    ...observed,
  });
}

console.log(
  JSON.stringify(
    {
      corpus: "docs/performance/benchmark-corpus.json",
      measuredOn: new Date().toISOString(),
      results,
      schemaVersion: 1,
    },
    null,
    2,
  ),
);
