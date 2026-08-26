import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";

import { IRI, OWLDataFactory, OWLOntology } from "../model/index.js";
import { OwlToRdfTranslator } from "../internal/mapping/owlToRdfTranslator.js";
import { rdfDatasetFactory } from "../internal/rdfjs/environment.js";
import { assertQuiescentMachine } from "./benchmarkEnvironment.mjs";

await assertQuiescentMachine();

const RUN_COUNT = 5;
const WARMUP_COUNT = 1;
const HEAP_SAMPLE_INTERVAL_QUADS = 256;
const EX = "urn:owlapi-js:benchmark:owl-to-rdf:";

const declarationOntology = () => {
  const factory = new OWLDataFactory();
  return new OWLOntology({
    axioms: Array.from({ length: 50000 }, (_, index) =>
      factory.getOWLDeclarationAxiom(
        factory.getOWLClass(IRI.create(`${EX}class-${index}`)),
      ),
    ),
    ontologyID: factory.getOWLOntologyID(IRI.create(`${EX}declarations`)),
  });
};

const longListOntology = () => {
  const factory = new OWLDataFactory();
  const individuals = Array.from({ length: 25000 }, (_, index) =>
    factory.getOWLNamedIndividual(IRI.create(`${EX}individual-${index}`)),
  );
  return new OWLOntology({
    axioms: [factory.getOWLDifferentIndividualsAxiom(individuals)],
    ontologyID: factory.getOWLOntologyID(IRI.create(`${EX}list`)),
  });
};

const deepExpressionOntology = () => {
  const factory = new OWLDataFactory();
  let expression = factory.getOWLClass(IRI.create(`${EX}leaf`));
  for (let depth = 0; depth < 256; depth += 1) {
    expression = factory.getOWLObjectComplementOf(expression);
  }
  return new OWLOntology({
    axioms: [
      factory.getOWLSubClassOfAxiom(
        factory.getOWLClass(IRI.create(`${EX}subject`)),
        expression,
      ),
    ],
    ontologyID: factory.getOWLOntologyID(IRI.create(`${EX}depth`)),
  });
};

const fixtures = Object.freeze({
  declarations: declarationOntology(),
  depth: deepExpressionOntology(),
  list: longListOntology(),
});

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const sample = async (operation) => {
  globalThis.gc?.();
  const startHeapBytes = process.memoryUsage().heapUsed;
  let peakHeapBytes = startHeapBytes;
  const observeHeap = () => {
    peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed);
  };
  const startedAt = performance.now();
  const outputQuads = await operation(observeHeap);
  const wallMs = performance.now() - startedAt;
  const endHeapBytes = process.memoryUsage().heapUsed;
  peakHeapBytes = Math.max(peakHeapBytes, endHeapBytes);
  return {
    outputQuads,
    wallMs,
    peakHeapBytes,
    peakHeapDeltaBytes: Math.max(0, peakHeapBytes - startHeapBytes),
    retainedHeapDeltaBytes: endHeapBytes - startHeapBytes,
  };
};

const translate = (ontology, observeHeap) => {
  const datasetFactory = {
    dataset() {
      const dataset = rdfDatasetFactory.dataset();
      const add = dataset.add.bind(dataset);
      let additions = 0;
      dataset.add = (quad) => {
        // A timer cannot run while this synchronous translator owns the event
        // loop. Sampling at the allocation seam measures live heap without
        // introducing cooperative yields into the production implementation.
        if (additions % HEAP_SAMPLE_INTERVAL_QUADS === 0) {
          observeHeap();
        }
        additions += 1;
        add(quad);
        return dataset;
      };
      return dataset;
    },
  };
  return new OwlToRdfTranslator({ datasetFactory }).translate(ontology).size;
};

const benchmarks = Object.freeze([
  {
    id: "generated-owl-declarations-large",
    operation: (observeHeap) => translate(fixtures.declarations, observeHeap),
    shape: { axioms: 50000 },
  },
  {
    id: "generated-owl-list-long",
    operation: (observeHeap) => translate(fixtures.list, observeHeap),
    shape: { listItems: 25000 },
  },
  {
    id: "generated-owl-expression-depth",
    operation: (observeHeap) => translate(fixtures.depth, observeHeap),
    shape: { expressionDepth: 256 },
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
  const outputQuads = new Set(
    measurements.map((measurement) => measurement.outputQuads),
  );
  if (outputQuads.size !== 1) {
    throw new Error(`${benchmark.id} produced inconsistent dataset sizes`);
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
    outputQuads: [...outputQuads][0],
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
        fixtureGenerator: "owlapi-owl-to-rdf-benchmark-v1",
        warmups: WARMUP_COUNT,
        measuredRuns: RUN_COUNT,
        aggregation: "median",
        heapSamplingIntervalQuads: HEAP_SAMPLE_INTERVAL_QUADS,
        garbageCollectionRequestedBeforeEachRun:
          typeof globalThis.gc === "function",
        ontologyConstructionIncluded: false,
      },
      results,
    },
    null,
    2,
  ),
);
