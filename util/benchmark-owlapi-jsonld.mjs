import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, release, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { StringDocumentSource } from "../src/owlapi-js/io/index.js";
import { OWLOntologyManager } from "../src/owlapi-js/manager/owlOntologyManager.js";
import { OWLParserRegistry } from "../src/owlapi-js/manager/parserRegistry.js";
import { dlSyntaxParserDescriptor } from "../src/owlapi-js/parser/dl/descriptor.js";
import { functionalSyntaxParserDescriptor } from "../src/owlapi-js/parser/functional/descriptor.js";
import { jsonLdParserDescriptor } from "../src/owlapi-js/parser/jsonld/descriptor.js";
import { JsonLdSyntaxAdapter } from "../src/owlapi-js/parser/jsonld/jsonLdSyntaxAdapter.js";
import { krss2ParserDescriptor } from "../src/owlapi-js/parser/krss2/descriptor.js";
import { manchesterSyntaxParserDescriptor } from "../src/owlapi-js/parser/manchester/descriptor.js";
import { nQuadsParserDescriptor } from "../src/owlapi-js/parser/nquads/descriptor.js";
import { nTriplesParserDescriptor } from "../src/owlapi-js/parser/ntriples/descriptor.js";
import { owlXmlParserDescriptor } from "../src/owlapi-js/parser/owlxml/descriptor.js";
import { rdfXmlParserDescriptor } from "../src/owlapi-js/parser/rdfxml/descriptor.js";
import { triGParserDescriptor } from "../src/owlapi-js/parser/trig/descriptor.js";
import { turtleParserDescriptor } from "../src/owlapi-js/parser/turtle/descriptor.js";

import {
  assertQuiescentMachine,
  evaluateBoundedDetectionGate,
} from "./benchmarkEnvironment.mjs";

await assertQuiescentMachine();

const RUN_COUNT = 5;
const SAMPLE_INTERVAL_MS = 5;
const WARMUP_COUNT = 1;
const MISMATCH_INPUT_BYTES = Object.freeze([1_048_576, 4_194_304, 16_777_216]);
// Pin the last accepted value rather than judging release fitness only against
// a favorable or unfavorable same-process control. The paired Phase 14 result
// remains in the report as diagnostic evidence; this is the governed baseline.
const ACCEPTED_PHASE14_MISMATCH = Object.freeze({
  peakHeapDeltaBytes: 42_816,
  wallMs: 13.34,
});
const classDocument = (count) =>
  JSON.stringify(
    Array.from({ length: count }, (_, index) => ({
      "@id": `urn:owlapi-js:benchmark:jsonld#Class${index}`,
      "@type": "http://www.w3.org/2002/07/owl#Class",
    })),
  );
const functionalLarge = `Ontology(<urn:owlapi-js:benchmark:functional>
${Array.from(
  { length: 50_000 },
  (_, index) =>
    `Declaration(Class(<urn:owlapi-js:benchmark:functional#Class${index}>))`,
).join("\n")}
)`;
const fixtures = Object.freeze({
  firstUse: classDocument(100),
  jsonLdLarge: classDocument(50_000),
});
// Construct mismatch sources outside every sample. The scaling measurement is
// about parser selection, not the deliberate cost of allocating the fixture.
const mismatchSources = Object.freeze(
  MISMATCH_INPUT_BYTES.map(
    (inputBytes) =>
      new StringDocumentSource("x".repeat(inputBytes), {
        documentIRI: `urn:owlapi-js:benchmark:mismatch:${inputBytes}`,
      }),
  ),
);
const sources = Object.freeze({
  firstUse: new StringDocumentSource(fixtures.firstUse, {
    contentType: "application/ld+json",
    documentIRI: "urn:owlapi-js:benchmark:jsonld:first-use",
  }),
  functional: new StringDocumentSource(functionalLarge),
  jsonLd: new StringDocumentSource(fixtures.jsonLdLarge, {
    contentType: "application/ld+json",
    documentIRI: "urn:owlapi-js:benchmark:jsonld:large",
  }),
});
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
const phase15Descriptors = Object.freeze([
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
  const endHeapBytes = process.memoryUsage().heapUsed;
  peakHeapBytes = Math.max(peakHeapBytes, endHeapBytes);
  return {
    maxEventLoopDelayMs,
    peakHeapBytes,
    peakHeapDeltaBytes: Math.max(0, peakHeapBytes - startHeapBytes),
    retainedHeapDeltaBytes: endHeapBytes - startHeapBytes,
    wallMs: performance.now() - startedAt,
  };
};
const syntaxOnly = async () => {
  const { dataset } = await new JsonLdSyntaxAdapter().parse(sources.jsonLd);
  if (dataset.size !== 50_000) {
    throw new Error("The JSON-LD syntax benchmark produced the wrong size");
  }
};
const parseWithDescriptors = async (source, descriptors) => {
  const ontology = await new OWLOntologyManager({
    registry: new OWLParserRegistry(descriptors),
  }).loadOntologyFromOntologyDocument(source);
  if (ontology.getAxioms().size === 0) {
    throw new Error("The JSON-LD benchmark produced no OWL axioms");
  }
};
const rejectMismatch = async (source, descriptors) => {
  try {
    await new OWLOntologyManager({
      registry: new OWLParserRegistry(descriptors),
    }).loadOntologyFromOntologyDocument(source);
  } catch (error) {
    if (error?.code === "UNPARSABLE_ONTOLOGY") {
      return;
    }
    throw error;
  }
  throw new Error("The JSON-LD mismatch benchmark unexpectedly parsed");
};

const firstUse = await sample(() =>
  parseWithDescriptors(sources.firstUse, phase15Descriptors),
);
const benchmarks = [
  {
    id: "generated-jsonld-large.syntax-to-rdf",
    operation: syntaxOnly,
  },
  {
    id: "generated-jsonld-large.end-to-end",
    operation: () => parseWithDescriptors(sources.jsonLd, phase15Descriptors),
  },
  {
    id: "generated-functional-large-phase14-control",
    operation: () =>
      parseWithDescriptors(sources.functional, phase14Descriptors),
  },
  {
    id: "generated-functional-large-phase15",
    operation: () =>
      parseWithDescriptors(sources.functional, phase15Descriptors),
  },
  {
    id: "generated-mismatch-large-phase14-control",
    inputBytes: MISMATCH_INPUT_BYTES[2],
    operation: () => rejectMismatch(mismatchSources[2], phase14Descriptors),
  },
  {
    id: "generated-mismatch-1m-phase15-scale",
    inputBytes: MISMATCH_INPUT_BYTES[0],
    operation: () => rejectMismatch(mismatchSources[0], phase15Descriptors),
  },
  {
    id: "generated-mismatch-4m-phase15-scale",
    inputBytes: MISMATCH_INPUT_BYTES[1],
    operation: () => rejectMismatch(mismatchSources[1], phase15Descriptors),
  },
  {
    id: "generated-mismatch-large-phase15",
    inputBytes: MISMATCH_INPUT_BYTES[2],
    operation: () => rejectMismatch(mismatchSources[2], phase15Descriptors),
  },
];
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
    ...(benchmark.inputBytes === undefined
      ? {}
      : { inputBytes: benchmark.inputBytes }),
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

const resultById = new Map(results.map((result) => [result.id, result]));
const phase15MismatchResults = [
  resultById.get("generated-mismatch-1m-phase15-scale"),
  resultById.get("generated-mismatch-4m-phase15-scale"),
  resultById.get("generated-mismatch-large-phase15"),
];
const boundedDetectionSamples = phase15MismatchResults.map(
  ({ inputBytes, median }) => ({
    inputBytes,
    peakHeapDeltaBytes: median.peakHeapDeltaBytes,
    wallMs: median.wallMs,
  }),
);
const { scale: boundedDetectionScale, ...boundedDetectionPair } =
  evaluateBoundedDetectionGate({
    baseline: ACCEPTED_PHASE14_MISMATCH,
    candidate: resultById.get("generated-mismatch-large-phase15").median,
    scaleSamples: boundedDetectionSamples,
  });
const boundedDetectionAcceptance = Object.freeze({
  baseline: Object.freeze({
    ...ACCEPTED_PHASE14_MISMATCH,
    id: "phase14.accepted.generated-mismatch-large",
  }),
  pair: Object.freeze(boundedDetectionPair),
  pass: boundedDetectionPair.pass,
  scale: Object.freeze({
    ...boundedDetectionScale,
    samples: Object.freeze(boundedDetectionSamples),
  }),
});

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
        inputBytes: Buffer.byteLength(fixtures.firstUse),
        measurement: firstUse,
        path: "manager -> first conditional jsonld.js load -> direct RDF/JS -> graph policy -> shared RDF-to-OWL",
      },
      gates: {
        boundedDetection: boundedDetectionAcceptance,
      },
      measuredOn: new Date().toISOString(),
      protocol: {
        aggregation: "median",
        fixture: {
          bytes: Buffer.byteLength(fixtures.jsonLdLarge),
          count: 50_000,
          id: "generated-jsonld-large",
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

if (!boundedDetectionAcceptance.pass) {
  process.exitCode = 1;
}
