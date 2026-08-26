import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { StringDocumentSource } from "../io/index.js";
import { OWLManager } from "../index.js";
import { createTurtleSyntaxAdapter } from "../internal/parsing/rdf/n3SyntaxAdapter.js";

import { assertQuiescentMachine } from "./benchmarkEnvironment.mjs";

await assertQuiescentMachine();

const require = createRequire(import.meta.url);
const {
  GENERATOR_VERSION,
  generateBenchmarkFixture,
} = require("./generate-owlapi-benchmark-fixtures.cjs");
const RUN_COUNT = 5;
const SAMPLE_INTERVAL_MS = 5;
const WARMUP_COUNT = 1;

const firstUseText = generateBenchmarkFixture("turtle", { count: 100 });
const largeText = generateBenchmarkFixture("turtle", { count: 50_000 });
const firstUseSource = new StringDocumentSource(firstUseText, {
  documentIRI: "urn:owlapi-js:benchmark:turtle:first-use",
  fileName: "first-use.ttl",
});
const largeSource = new StringDocumentSource(largeText, {
  documentIRI: "urn:owlapi-js:benchmark:turtle:large",
  fileName: "generated-turtle-large.ttl",
});

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

const syntaxOnly = async (source, chunkSize) => {
  const { dataset } = await createTurtleSyntaxAdapter({ chunkSize }).parse(
    source,
  );
  if (dataset.size === 0) {
    throw new Error("The Turtle syntax benchmark produced no quads");
  }
};

const endToEnd = async (source) => {
  const ontology =
    await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
      source,
    );
  if (ontology.getAxioms().size === 0) {
    throw new Error("The Turtle end-to-end benchmark produced no axioms");
  }
};

const firstUse = await sample(() => endToEnd(firstUseSource));
const benchmarks = Object.freeze([
  ...[16_384, 65_536, 262_144].map((chunkSize) => ({
    chunkSize,
    id: `generated-turtle-large.syntax-to-rdf.chunk-${chunkSize}`,
    operation: () => syntaxOnly(largeSource, chunkSize),
  })),
  {
    chunkSize: 65_536,
    id: "generated-turtle-large.end-to-end",
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
    chunkSize: benchmark.chunkSize,
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
        inputBytes: Buffer.byteLength(firstUseText),
        measurement: firstUse,
        path: "manager -> first conditional Turtle dependency load -> shared RDF-to-OWL",
      },
      measuredOn: new Date().toISOString(),
      protocol: {
        aggregation: "median",
        fixture: {
          bytes: Buffer.byteLength(largeText),
          count: 50_000,
          generator: GENERATOR_VERSION,
          id: "generated-turtle-large",
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
