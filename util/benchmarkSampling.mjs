import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import process from "node:process";
const { benchmarkPolicy } = JSON.parse(
  readFileSync(
    new URL("../docs/performance/resource-budgets.json", import.meta.url),
    "utf8",
  ),
);
export const RUN_COUNT = benchmarkPolicy.measuredRuns;
export const WARMUP_COUNT = benchmarkPolicy.warmupRuns;
export const SAMPLE_INTERVAL_MS = 5;
/** Upper middle for even sample counts, without mutating the observations. */
export const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Preserved sampling mode used by benchmark-owlapi-dl.mjs, benchmark-owlapi-functional.mjs, benchmark-owlapi-krss1.mjs, benchmark-owlapi-krss2.mjs, benchmark-owlapi-manchester.mjs, benchmark-owlapi-owlxml.mjs, benchmark-owlapi-rdf-to-owl.mjs. */
export const sampleHeap = async (operation) => {
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

/** Preserved sampling mode used by benchmark-owlapi-jsonld.mjs. */
export const sampleJsonLdEventLoop = async (operation) => {
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

/** Preserved sampling mode used by benchmark-owlapi-nquads.mjs, benchmark-owlapi-ntriples.mjs, benchmark-owlapi-trig.mjs, benchmark-owlapi-turtle.mjs. */
export const sampleEventLoop = async (operation) => {
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

/** Preserved sampling mode used by benchmark-owlapi-owl-to-rdf.mjs. */
export const sampleObservedHeap = async (operation) => {
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

/** Preserved sampling mode used by benchmark-owlapi-rdfxml.mjs. */
export const sampleHeapWallLast = async (operation) => {
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
