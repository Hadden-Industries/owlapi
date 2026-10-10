import {
  median,
  RUN_COUNT,
  WARMUP_COUNT,
  SAMPLE_INTERVAL_MS,
  sampleEventLoop as sample,
} from "./benchmarkSampling.mjs";
import {
  phase12Descriptors,
  phase13Descriptors,
} from "./benchmarkParserRegistries.mjs";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, release, totalmem } from "node:os";

import process from "node:process";

import { StringDocumentSource } from "../io/index.js";
import { OWLOntologyManager } from "../model/owlOntologyManager.js";
import { OWLParserRegistry } from "../internal/parsing/parserRegistry.js";

import { createNQuadsSyntaxAdapter } from "../internal/parsing/rdf/n3SyntaxAdapter.js";

import { assertQuiescentMachine } from "./benchmarkEnvironment.mjs";

await assertQuiescentMachine();

const require = createRequire(import.meta.url);
const {
  GENERATOR_VERSION,
  generateBenchmarkFixture,
} = require("./generate-owlapi-benchmark-fixtures.cjs");

const fixtures = Object.freeze({
  functionalLarge: generateBenchmarkFixture("functional", { count: 50_000 }),
  mismatchLarge: generateBenchmarkFixture("mismatch", { bytes: 16_777_216 }),
  nQuadsFirstUse: generateBenchmarkFixture("nquads", { count: 100 }),
  nQuadsLarge: generateBenchmarkFixture("nquads", { count: 50_000 }),
});
const sources = Object.freeze({
  firstUse: new StringDocumentSource(fixtures.nQuadsFirstUse, {
    documentIRI: "urn:owlapi-js:benchmark:nquads:first-use",
    fileName: "first-use.nq",
  }),
  functional: new StringDocumentSource(fixtures.functionalLarge),
  mismatch: new StringDocumentSource(fixtures.mismatchLarge),
  nquads: new StringDocumentSource(fixtures.nQuadsLarge, {
    documentIRI: "urn:owlapi-js:benchmark:nquads:large",
    fileName: "generated-nquads-large.nq",
  }),
});

const syntaxOnly = async (chunkSize) => {
  const { dataset } = await createNQuadsSyntaxAdapter({ chunkSize }).parse(
    sources.nquads,
  );
  if (dataset.size === 0) {
    throw new Error("The N-Quads syntax benchmark produced no quads");
  }
};

const parseWithDescriptors = async (source, descriptors) => {
  const ontology = await new OWLOntologyManager({
    registry: new OWLParserRegistry(descriptors),
  }).loadOntologyFromOntologyDocument(source);
  if (ontology.getAxioms().size === 0) {
    throw new Error("The N-Quads benchmark produced no OWL axioms");
  }
};

const rejectMismatch = async (descriptors) => {
  try {
    await new OWLOntologyManager({
      registry: new OWLParserRegistry(descriptors),
    }).loadOntologyFromOntologyDocument(sources.mismatch);
  } catch (error) {
    if (error?.code === "UNPARSABLE_ONTOLOGY") {
      return;
    }
    throw error;
  }
  throw new Error("The N-Quads mismatch benchmark unexpectedly parsed");
};

const firstUse = await sample(() =>
  parseWithDescriptors(sources.firstUse, phase13Descriptors),
);
const benchmarks = Object.freeze([
  ...[16_384, 65_536, 262_144].map((chunkSize) => ({
    chunkSize,
    id: `generated-nquads-large.syntax-to-rdf.chunk-${chunkSize}`,
    operation: () => syntaxOnly(chunkSize),
  })),
  {
    chunkSize: 65_536,
    id: "generated-nquads-large.end-to-end",
    operation: () => parseWithDescriptors(sources.nquads, phase13Descriptors),
  },
  {
    id: "generated-functional-large-phase12-control",
    operation: () =>
      parseWithDescriptors(sources.functional, phase12Descriptors),
  },
  {
    id: "generated-functional-large-phase13",
    operation: () =>
      parseWithDescriptors(sources.functional, phase13Descriptors),
  },
  {
    id: "generated-mismatch-large-phase12-control",
    operation: () => rejectMismatch(phase12Descriptors),
  },
  {
    id: "generated-mismatch-large-phase13",
    operation: () => rejectMismatch(phase13Descriptors),
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
    ...(benchmark.chunkSize === undefined
      ? {}
      : { chunkSize: benchmark.chunkSize }),
    id: benchmark.id,
    measurements,
    median: {
      maxEventLoopDelayMs: median(
        measurements.map(({ maxEventLoopDelayMs }) => maxEventLoopDelayMs),
      ),
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
        inputBytes: Buffer.byteLength(fixtures.nQuadsFirstUse),
        measurement: firstUse,
        path: "manager -> first conditional N3.js load -> N-Quads -> graph policy -> shared RDF-to-OWL",
      },
      measuredOn: new Date().toISOString(),
      protocol: {
        aggregation: "median",
        fixture: {
          bytes: Buffer.byteLength(fixtures.nQuadsLarge),
          count: 50_000,
          generator: GENERATOR_VERSION,
          id: "generated-nquads-large",
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
