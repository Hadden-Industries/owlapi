import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";

import {
  rdfDataFactory,
  rdfDatasetFactory,
  RdfToOwlTranslator,
} from "../src/owlapi-js/rdf/index.js";

import { assertQuiescentMachine } from "./benchmarkEnvironment.mjs";

await assertQuiescentMachine();

const RUN_COUNT = 5;
const WARMUP_COUNT = 1;
const SAMPLE_INTERVAL_MS = 5;
const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";
const EX = "urn:owlapi-js:benchmark:rdf:";

const nn = (value) => rdfDataFactory.namedNode(value);
const bn = (value) => rdfDataFactory.blankNode(value);
const q = (...values) => rdfDataFactory.quad(...values);

const largeDeclarationDataset = () => {
  const type = nn(`${RDF}type`);
  const owlClass = nn(`${OWL}Class`);
  return rdfDatasetFactory.dataset(
    Array.from({ length: 50000 }, (_, index) =>
      q(nn(`${EX}class-${index}`), type, owlClass),
    ),
  );
};

const longListDataset = () => {
  const quads = [];
  const owner = bn("all-different");
  const itemCount = 25000;
  quads.push(q(owner, nn(`${RDF}type`), nn(`${OWL}AllDifferent`)));
  quads.push(q(owner, nn(`${OWL}members`), bn("list-0")));
  for (let index = 0; index < itemCount; index += 1) {
    const node = bn(`list-${index}`);
    const rest =
      index + 1 === itemCount ? nn(`${RDF}nil`) : bn(`list-${index + 1}`);
    quads.push(q(node, nn(`${RDF}first`), nn(`${EX}individual-${index}`)));
    quads.push(q(node, nn(`${RDF}rest`), rest));
  }
  return rdfDatasetFactory.dataset(quads);
};

const deepExpressionDataset = () => {
  const quads = [];
  const subject = nn(`${EX}DeepSubject`);
  const depth = 256;
  for (let index = 0; index < depth; index += 1) {
    const expression = bn(`expression-${index}`);
    const operand =
      index + 1 === depth ? nn(`${EX}Leaf`) : bn(`expression-${index + 1}`);
    quads.push(q(expression, nn(`${OWL}complementOf`), operand));
  }
  quads.push(q(subject, nn(`${RDFS}subClassOf`), bn("expression-0")));
  return rdfDatasetFactory.dataset(quads);
};

const fixtures = Object.freeze({
  declarations: largeDeclarationDataset(),
  depth: deepExpressionDataset(),
  list: longListDataset(),
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
    wallMs,
    peakHeapBytes,
    peakHeapDeltaBytes: Math.max(0, peakHeapBytes - startHeapBytes),
    retainedHeapDeltaBytes: endHeapBytes - startHeapBytes,
  };
};

const translate = async (dataset) => {
  await new RdfToOwlTranslator().translate(dataset);
};

const benchmarks = Object.freeze([
  {
    id: "generated-rdf-declarations-large",
    operation: () => translate(fixtures.declarations),
    shape: { axioms: 50000, quads: fixtures.declarations.size },
  },
  {
    id: "generated-rdf-list-long",
    operation: () => translate(fixtures.list),
    shape: { listItems: 25000, quads: fixtures.list.size },
  },
  {
    id: "generated-rdf-expression-depth",
    operation: () => translate(fixtures.depth),
    shape: { expressionDepth: 256, quads: fixtures.depth.size },
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
    shape: benchmark.shape,
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
        fixtureGenerator: "owlapi-rdf-to-owl-benchmark-v1",
        warmups: WARMUP_COUNT,
        measuredRuns: RUN_COUNT,
        aggregation: "median",
        heapSamplingIntervalMs: SAMPLE_INTERVAL_MS,
        garbageCollectionRequestedBeforeEachRun:
          typeof globalThis.gc === "function",
        datasetConstructionIncluded: false,
      },
      results,
    },
    null,
    2,
  ),
);
