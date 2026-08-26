import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";

import { OWLManager } from "../index.js";
import { OWLOntologyManager } from "../model/owlOntologyManager.js";
import { OWLParserRegistry } from "../internal/parsing/parserRegistry.js";
import { dlSyntaxParserDescriptor } from "../internal/parsing/dl/descriptor.js";
import { functionalSyntaxParserDescriptor } from "../internal/parsing/functional/descriptor.js";
import { krss2ParserDescriptor } from "../internal/parsing/krss2/descriptor.js";
import { manchesterSyntaxParserDescriptor } from "../internal/parsing/manchester/descriptor.js";
import { owlXmlParserDescriptor } from "../internal/parsing/owlxml/descriptor.js";
import { rdfXmlParserDescriptor } from "../internal/parsing/rdfxml/descriptor.js";
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
  functionalDepth: generateBenchmarkFixture("functional-depth", { depth: 512 }),
  functionalLarge: generateBenchmarkFixture("functional", { count: 50_000 }),
  krss2Depth: generateBenchmarkFixture("krss2-depth", { depth: 256 }),
  krss2Large: generateBenchmarkFixture("krss2", { count: 50_000 }),
  mismatchLarge: generateBenchmarkFixture("mismatch", { bytes: 16_777_216 }),
});

const phase10Descriptors = Object.freeze([
  owlXmlParserDescriptor,
  rdfXmlParserDescriptor,
  turtleParserDescriptor,
  dlSyntaxParserDescriptor,
  functionalSyntaxParserDescriptor,
  manchesterSyntaxParserDescriptor,
]);
const phase11Descriptors = Object.freeze([
  owlXmlParserDescriptor,
  rdfXmlParserDescriptor,
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
  const manager = OWLManager.createOWLOntologyManager();
  await manager.loadOntologyFromOntologyDocument(source);
};

const parseWithDescriptors = async (source, descriptors) => {
  const manager = new OWLOntologyManager({
    registry: new OWLParserRegistry(descriptors),
  });
  await manager.loadOntologyFromOntologyDocument(source);
};

const rejectMismatch = async (descriptors) => {
  const manager = new OWLOntologyManager({
    registry: new OWLParserRegistry(descriptors),
  });
  try {
    await manager.loadOntologyFromOntologyDocument(fixtures.mismatchLarge);
  } catch (error) {
    if (error?.code === "UNPARSABLE_ONTOLOGY") {
      return;
    }
    throw error;
  }
  throw new Error("The parser registry accepted the mismatched fixture");
};

const benchmarks = Object.freeze([
  { id: "generated-krss2-large", operation: () => parse(fixtures.krss2Large) },
  { id: "generated-krss2-depth", operation: () => parse(fixtures.krss2Depth) },
  {
    id: "generated-functional-large-phase10-control",
    operation: () =>
      parseWithDescriptors(fixtures.functionalLarge, phase10Descriptors),
  },
  {
    id: "generated-functional-large-phase11",
    operation: () =>
      parseWithDescriptors(fixtures.functionalLarge, phase11Descriptors),
  },
  {
    id: "generated-functional-depth-phase10-control",
    operation: () =>
      parseWithDescriptors(fixtures.functionalDepth, phase10Descriptors),
  },
  {
    id: "generated-functional-depth-phase11",
    operation: () =>
      parseWithDescriptors(fixtures.functionalDepth, phase11Descriptors),
  },
  {
    id: "generated-mismatch-large-phase10-control",
    operation: () => rejectMismatch(phase10Descriptors),
  },
  {
    id: "generated-mismatch-large-phase11",
    operation: () => rejectMismatch(phase11Descriptors),
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
