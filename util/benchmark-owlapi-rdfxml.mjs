import {
  median,
  RUN_COUNT,
  WARMUP_COUNT,
  SAMPLE_INTERVAL_MS,
  sampleHeapWallLast as sample,
} from "./benchmarkSampling.mjs";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, release, totalmem } from "node:os";

import process from "node:process";

import { StringDocumentSource } from "../io/index.js";
import { OWLManager } from "../index.js";
import { RdfXmlSyntaxAdapter } from "../internal/parsing/rdfxml/rdfXmlSyntaxAdapter.js";

import { assertQuiescentMachine } from "./benchmarkEnvironment.mjs";

await assertQuiescentMachine();

const require = createRequire(import.meta.url);
const {
  GENERATOR_VERSION,
  generateBenchmarkFixture,
} = require("./generate-owlapi-benchmark-fixtures.cjs");

const firstUseText = generateBenchmarkFixture("rdfxml", { count: 100 });
const largeText = generateBenchmarkFixture("rdfxml", { count: 50_000 });
const firstUseSource = new StringDocumentSource(firstUseText, {
  documentIRI: "urn:owlapi-js:benchmark:rdfxml:first-use",
  fileName: "first-use.rdf",
});
const largeSource = new StringDocumentSource(largeText, {
  documentIRI: "urn:owlapi-js:benchmark:rdfxml:large",
  fileName: "generated-rdfxml-large.rdf",
});

const syntaxOnly = async (source) => {
  const dataset = await new RdfXmlSyntaxAdapter().parse(source);
  if (dataset.size === 0) {
    throw new Error("The RDF/XML syntax benchmark produced no quads");
  }
};

const endToEnd = async (source) => {
  const ontology =
    await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
      source,
    );
  if (ontology.getAxioms().size === 0) {
    throw new Error("The RDF/XML end-to-end benchmark produced no axioms");
  }
};

const firstUse = await sample(() => endToEnd(firstUseSource));
const benchmarks = Object.freeze([
  {
    id: "generated-rdfxml-large.syntax-to-rdf",
    operation: () => syntaxOnly(largeSource),
  },
  {
    id: "generated-rdfxml-large.end-to-end",
    operation: () => endToEnd(largeSource),
  },
]);

const results = [];
for (const benchmark of benchmarks) {
  for (let index = 0; index < WARMUP_COUNT; index += 1) {
    await sample(benchmark.operation);
  }
  const measurements = [];
  for (let index = 0; index < RUN_COUNT; index += 1) {
    measurements.push(await sample(benchmark.operation));
  }
  results.push({
    id: benchmark.id,
    measurements,
    median: {
      peakHeapBytes: median(
        measurements.map(({ peakHeapBytes }) => peakHeapBytes),
      ),
      peakHeapDeltaBytes: median(
        measurements.map(({ peakHeapDeltaBytes }) => peakHeapDeltaBytes),
      ),
      retainedHeapDeltaBytes: median(
        measurements.map(
          ({ retainedHeapDeltaBytes }) => retainedHeapDeltaBytes,
        ),
      ),
      wallMs: median(measurements.map(({ wallMs }) => wallMs)),
    },
  });
}

const packageLock = readFileSync(
  new URL("../package-lock.json", import.meta.url),
);
console.log(
  JSON.stringify(
    {
      environment: {
        architecture: process.arch,
        cpu: cpus()[0]?.model,
        logicalCpuCount: cpus().length,
        node: process.version,
        nodeArguments: process.execArgv,
        os: `${process.platform} ${release()}`,
        packageLockSha256: createHash("sha256")
          .update(packageLock)
          .digest("hex"),
        totalMemoryBytes: totalmem(),
      },
      firstUse: {
        inputBytes: Buffer.byteLength(firstUseText),
        measurement: firstUse,
        path: "manager -> first conditional RDF/XML dependency load -> shared RDF-to-OWL",
      },
      measuredOn: new Date().toISOString(),
      protocol: {
        aggregation: "median",
        fixture: {
          bytes: Buffer.byteLength(largeText),
          count: 50_000,
          generator: GENERATOR_VERSION,
          id: "generated-rdfxml-large",
        },
        garbageCollectionRequestedBeforeEachRun:
          typeof globalThis.gc === "function",
        heapSamplingIntervalMs: SAMPLE_INTERVAL_MS,
        measuredRuns: RUN_COUNT,
        warmups: WARMUP_COUNT,
      },
      results,
      schemaVersion: 1,
    },
    null,
    2,
  ),
);
