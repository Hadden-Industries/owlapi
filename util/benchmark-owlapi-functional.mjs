import {
  median,
  RUN_COUNT,
  WARMUP_COUNT,
  SAMPLE_INTERVAL_MS,
  sampleHeap as sample,
} from "./benchmarkSampling.mjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, release, totalmem } from "node:os";

import { OWLManager } from "../index.js";

import { assertQuiescentMachine } from "./benchmarkEnvironment.mjs";

await assertQuiescentMachine();

const require = createRequire(import.meta.url);
const {
  GENERATOR_VERSION,
  generateBenchmarkFixture,
} = require("./generate-owlapi-benchmark-fixtures.cjs");

const fixtures = Object.freeze({
  functionalLarge: generateBenchmarkFixture("functional", { count: 50000 }),
  functionalDepth: generateBenchmarkFixture("functional-depth", { depth: 512 }),
  mismatchLarge: generateBenchmarkFixture("mismatch", { bytes: 16777216 }),
});

const parse = async (source) => {
  const manager = OWLManager.createOWLOntologyManager();
  await manager.loadOntologyFromOntologyDocument(source);
};

const rejectMismatch = async () => {
  const manager = OWLManager.createOWLOntologyManager();
  try {
    await manager.loadOntologyFromOntologyDocument(fixtures.mismatchLarge);
  } catch (error) {
    if (error?.code === "UNPARSABLE_ONTOLOGY") {
      return;
    }
    throw error;
  }
  throw new Error("The Functional parser accepted the mismatched fixture");
};

const benchmarks = Object.freeze([
  {
    id: "generated-functional-large",
    operation: () => parse(fixtures.functionalLarge),
  },
  {
    id: "generated-functional-depth",
    operation: () => parse(fixtures.functionalDepth),
  },
  {
    id: "generated-mismatch-large",
    operation: rejectMismatch,
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
