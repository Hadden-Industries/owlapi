import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { StringDocumentSource } from "../src/owlapi-js/io/index.js";
import { OWLOntologyManager } from "../src/owlapi-js/manager/owlOntologyManager.js";
import { OWLParserRegistry } from "../src/owlapi-js/manager/parserRegistry.js";
import { dlSyntaxParserDescriptor } from "../src/owlapi-js/parser/dl/descriptor.js";
import { functionalSyntaxParserDescriptor } from "../src/owlapi-js/parser/functional/descriptor.js";
import { krss2ParserDescriptor } from "../src/owlapi-js/parser/krss2/descriptor.js";
import { manchesterSyntaxParserDescriptor } from "../src/owlapi-js/parser/manchester/descriptor.js";
import { nQuadsParserDescriptor } from "../src/owlapi-js/parser/nquads/descriptor.js";
import { nTriplesParserDescriptor } from "../src/owlapi-js/parser/ntriples/descriptor.js";
import { triGParserDescriptor } from "../src/owlapi-js/parser/trig/descriptor.js";
import { owlXmlParserDescriptor } from "../src/owlapi-js/parser/owlxml/descriptor.js";
import { createTriGSyntaxAdapter } from "../src/owlapi-js/parser/rdf/n3SyntaxAdapter.js";
import { rdfXmlParserDescriptor } from "../src/owlapi-js/parser/rdfxml/descriptor.js";
import { turtleParserDescriptor } from "../src/owlapi-js/parser/turtle/descriptor.js";

import { assertQuiescentMachine } from "./benchmarkEnvironment.mjs";

await assertQuiescentMachine();

const require = createRequire(import.meta.url);
const {
  GENERATOR_VERSION,
  generateBenchmarkFixture,
} = require("./generate-owlapi-benchmark-fixtures.js");
const RUN_COUNT = 5;
const SAMPLE_INTERVAL_MS = 5;
const WARMUP_COUNT = 1;

const fixtures = Object.freeze({
  functionalLarge: generateBenchmarkFixture("functional", { count: 50_000 }),
  mismatchLarge: generateBenchmarkFixture("mismatch", { bytes: 16_777_216 }),
  triGFirstUse: generateBenchmarkFixture("trig", { count: 100 }),
  triGLarge: generateBenchmarkFixture("trig", { count: 50_000 }),
});
const sources = Object.freeze({
  firstUse: new StringDocumentSource(fixtures.triGFirstUse, {
    documentIRI: "urn:owlapi-js:benchmark:trig:first-use",
    fileName: "first-use.trig",
  }),
  functional: new StringDocumentSource(fixtures.functionalLarge),
  mismatch: new StringDocumentSource(fixtures.mismatchLarge),
  trig: new StringDocumentSource(fixtures.triGLarge, {
    documentIRI: "urn:owlapi-js:benchmark:trig:large",
    fileName: "generated-trig-large.trig",
  }),
});
const phase13Descriptors = Object.freeze([
  owlXmlParserDescriptor,
  rdfXmlParserDescriptor,
  nQuadsParserDescriptor,
  nTriplesParserDescriptor,
  turtleParserDescriptor,
  dlSyntaxParserDescriptor,
  krss2ParserDescriptor,
  functionalSyntaxParserDescriptor,
  manchesterSyntaxParserDescriptor,
]);
const phase14Descriptors = Object.freeze([
  owlXmlParserDescriptor,
  rdfXmlParserDescriptor,
  nQuadsParserDescriptor,
  nTriplesParserDescriptor,
  triGParserDescriptor,
  turtleParserDescriptor,
  dlSyntaxParserDescriptor,
  krss2ParserDescriptor,
  functionalSyntaxParserDescriptor,
  manchesterSyntaxParserDescriptor,
]);

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const sample = async (operation) => {
  globalThis.gc?.();
  const startHeapBytes = process.memoryUsage().heapUsed;
  let peakHeapBytes = startHeapBytes;
  let maxEventLoopDelayMs = 0;
  let expectedSampleAt = performance.now() + SAMPLE_INTERVAL_MS;
  const sampler = setInterval(() => {
    const now = performance.now();
    maxEventLoopDelayMs = Math.max(maxEventLoopDelayMs, now - expectedSampleAt);
    expectedSampleAt = now + SAMPLE_INTERVAL_MS;
    peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed);
  }, SAMPLE_INTERVAL_MS);
  const startedAt = performance.now();
  try {
    await operation();
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    clearInterval(sampler);
  }
  const wallMs = performance.now() - startedAt;
  const endHeapBytes = process.memoryUsage().heapUsed;
  peakHeapBytes = Math.max(peakHeapBytes, endHeapBytes);
  return {
    maxEventLoopDelayMs,
    peakHeapBytes,
    peakHeapDeltaBytes: Math.max(0, peakHeapBytes - startHeapBytes),
    retainedHeapDeltaBytes: endHeapBytes - startHeapBytes,
    wallMs,
  };
};

const syntaxOnly = async (chunkSize) => {
  const { dataset } = await createTriGSyntaxAdapter({ chunkSize }).parse(
    sources.trig,
  );
  if (dataset.size === 0) {
    throw new Error("The TriG syntax benchmark produced no quads");
  }
};

const parseWithDescriptors = async (source, descriptors) => {
  const ontology = await new OWLOntologyManager({
    registry: new OWLParserRegistry(descriptors),
  }).loadOntologyFromOntologyDocument(source);
  if (ontology.getAxioms().size === 0) {
    throw new Error("The TriG benchmark produced no OWL axioms");
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
  throw new Error("The TriG mismatch benchmark unexpectedly parsed");
};

const firstUse = await sample(() =>
  parseWithDescriptors(sources.firstUse, phase14Descriptors),
);
const benchmarks = Object.freeze([
  ...[16_384, 65_536, 262_144].map((chunkSize) => ({
    chunkSize,
    id: `generated-trig-large.syntax-to-rdf.chunk-${chunkSize}`,
    operation: () => syntaxOnly(chunkSize),
  })),
  {
    chunkSize: 65_536,
    id: "generated-trig-large.end-to-end",
    operation: () => parseWithDescriptors(sources.trig, phase14Descriptors),
  },
  {
    id: "generated-functional-large-phase13-control",
    operation: () =>
      parseWithDescriptors(sources.functional, phase13Descriptors),
  },
  {
    id: "generated-functional-large-phase14",
    operation: () =>
      parseWithDescriptors(sources.functional, phase14Descriptors),
  },
  {
    id: "generated-mismatch-large-phase13-control",
    operation: () => rejectMismatch(phase13Descriptors),
  },
  {
    id: "generated-mismatch-large-phase14",
    operation: () => rejectMismatch(phase14Descriptors),
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
        inputBytes: Buffer.byteLength(fixtures.triGFirstUse),
        measurement: firstUse,
        path: "manager -> first conditional N3.js load -> TriG -> graph policy -> shared RDF-to-OWL",
      },
      measuredOn: new Date().toISOString(),
      protocol: {
        aggregation: "median",
        fixture: {
          bytes: Buffer.byteLength(fixtures.triGLarge),
          count: 50_000,
          generator: GENERATOR_VERSION,
          id: "generated-trig-large",
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
