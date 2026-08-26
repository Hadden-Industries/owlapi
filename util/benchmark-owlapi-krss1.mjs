import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";

import { OWLManager } from "../index.js";
import { StringDocumentSource } from "../io/index.js";
import { OWLOntologyManager } from "../model/owlOntologyManager.js";
import { OWLParserRegistry } from "../internal/parsing/parserRegistry.js";
import { dlSyntaxParserDescriptor } from "../internal/parsing/dl/descriptor.js";
import { functionalSyntaxParserDescriptor } from "../internal/parsing/functional/descriptor.js";
import { jsonLdParserDescriptor } from "../internal/parsing/jsonld/descriptor.js";
import { krss1ParserDescriptor } from "../internal/parsing/krss1/descriptor.js";
import { krss2ParserDescriptor } from "../internal/parsing/krss2/descriptor.js";
import { manchesterSyntaxParserDescriptor } from "../internal/parsing/manchester/descriptor.js";
import { nQuadsParserDescriptor } from "../internal/parsing/nquads/descriptor.js";
import { nTriplesParserDescriptor } from "../internal/parsing/ntriples/descriptor.js";
import { owlXmlParserDescriptor } from "../internal/parsing/owlxml/descriptor.js";
import { rdfXmlParserDescriptor } from "../internal/parsing/rdfxml/descriptor.js";
import { triGParserDescriptor } from "../internal/parsing/trig/descriptor.js";
import { turtleParserDescriptor } from "../internal/parsing/turtle/descriptor.js";

import { assertQuiescentMachine } from "./benchmarkEnvironment.mjs";

await assertQuiescentMachine();

const require = createRequire(import.meta.url);
const {
  GENERATOR_VERSION,
  generateBenchmarkFixture,
} = require("./generate-owlapi-benchmark-fixtures.cjs");
const RUN_COUNT = 5;
const WARMUP_COUNT = 1;
const SAMPLE_INTERVAL_MS = 5;
const fixtures = Object.freeze({
  functionalLarge: generateBenchmarkFixture("functional", { count: 50_000 }),
  krss1Depth: generateBenchmarkFixture("krss1-depth", { depth: 256 }),
  krss1Large: generateBenchmarkFixture("krss1", { count: 50_000 }),
  mismatchLarge: generateBenchmarkFixture("mismatch", { bytes: 16_777_216 }),
});

// The control differs by exactly one descriptor, keeping registry cost
// attributable to Phase 17 rather than to parser migrations completed earlier.
const phase16Descriptors = Object.freeze([
  owlXmlParserDescriptor,
  jsonLdParserDescriptor,
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
const phase17Descriptors = Object.freeze([
  ...phase16Descriptors.slice(0, 8),
  krss1ParserDescriptor,
  ...phase16Descriptors.slice(8),
]);

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};
const sample = async (operation) => {
  globalThis.gc?.();
  const startHeapBytes = process.memoryUsage().heapUsed;
  let peakHeapBytes = startHeapBytes;
  const sampler = setInterval(() => {
    peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed);
  }, SAMPLE_INTERVAL_MS);
  const startedAt = performance.now();
  try {
    await operation();
  } finally {
    clearInterval(sampler);
  }
  const wallMs = performance.now() - startedAt;
  const endHeapBytes = process.memoryUsage().heapUsed;
  peakHeapBytes = Math.max(peakHeapBytes, endHeapBytes);
  return {
    wallMs,
    peakHeapBytes,
    peakHeapDeltaBytes: Math.max(0, peakHeapBytes - startHeapBytes),
    retainedHeapDeltaBytes: endHeapBytes - startHeapBytes,
  };
};
const parse = async (source) => {
  await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
    source,
  );
};
const parseKrss1 = async (source) => {
  // Shared KRSS1/KRSS2 syntax is intentionally ambiguous without source
  // metadata. Exercise the same generic .krss ingestion path used by clients.
  await parse(new StringDocumentSource(source, { fileName: "benchmark.krss" }));
};
const parseWithDescriptors = async (source, descriptors) => {
  await new OWLOntologyManager({
    registry: new OWLParserRegistry(descriptors),
  }).loadOntologyFromOntologyDocument(source);
};
const rejectMismatch = async (descriptors) => {
  try {
    await parseWithDescriptors(fixtures.mismatchLarge, descriptors);
  } catch (error) {
    if (error?.code === "UNPARSABLE_ONTOLOGY") {
      return;
    }
    throw error;
  }
  throw new Error("The parser registry accepted the mismatched fixture");
};
const benchmarks = Object.freeze([
  {
    id: "generated-krss1-large",
    operation: () => parseKrss1(fixtures.krss1Large),
  },
  {
    id: "generated-krss1-depth",
    operation: () => parseKrss1(fixtures.krss1Depth),
  },
  {
    id: "generated-functional-large-phase16-control",
    operation: () =>
      parseWithDescriptors(fixtures.functionalLarge, phase16Descriptors),
  },
  {
    id: "generated-functional-large-phase17",
    operation: () =>
      parseWithDescriptors(fixtures.functionalLarge, phase17Descriptors),
  },
  {
    id: "generated-mismatch-large-phase16-control",
    operation: () => rejectMismatch(phase16Descriptors),
  },
  {
    id: "generated-mismatch-large-phase17",
    operation: () => rejectMismatch(phase17Descriptors),
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
    median: {
      wallMs: median(measurements.map(({ wallMs }) => wallMs)),
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
    },
    measurements,
  });
}

const packageLock = readFileSync(
  new URL("../package-lock.json", import.meta.url),
);
console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      measuredOn: new Date().toISOString(),
      environment: {
        os: `${process.platform} ${release()}`,
        architecture: process.arch,
        cpu: cpus()[0]?.model,
        logicalCpuCount: cpus().length,
        totalMemoryBytes: totalmem(),
        node: process.version,
        nodeArguments: process.execArgv,
        packageLockSha256: createHash("sha256")
          .update(packageLock)
          .digest("hex"),
      },
      protocol: {
        generator: GENERATOR_VERSION,
        warmups: WARMUP_COUNT,
        measuredRuns: RUN_COUNT,
        aggregation: "median",
        heapSamplingIntervalMs: SAMPLE_INTERVAL_MS,
        garbageCollectionRequestedBeforeEachRun:
          typeof globalThis.gc === "function",
      },
      results,
    },
    null,
    2,
  ),
);
