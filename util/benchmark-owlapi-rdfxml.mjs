import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { StringDocumentSource } from "../src/owlapi-js/io/index.js";
import { OWLManager } from "../src/owlapi-js/manager/index.js";
import { RdfXmlSyntaxAdapter } from "../src/owlapi-js/parser/rdfxml/rdfXmlSyntaxAdapter.js";

const require = createRequire(import.meta.url);
const {
  GENERATOR_VERSION,
  generateBenchmarkFixture,
} = require("./generate-owlapi-benchmark-fixtures.js");
const RUN_COUNT = 5;
const SAMPLE_INTERVAL_MS = 5;
const WARMUP_COUNT = 1;

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
    peakHeapBytes,
    peakHeapDeltaBytes: Math.max(0, peakHeapBytes - startHeapBytes),
    retainedHeapDeltaBytes: endHeapBytes - startHeapBytes,
    wallMs,
  };
};

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
