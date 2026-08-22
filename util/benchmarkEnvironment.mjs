import { cpus } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

// Repeated measurement with median aggregation defends against random,
// short-lived noise. It does not defend against sustained contention, which
// inflates every run by a similar factor and therefore produces a tight spread
// that reads as a high-quality signal. This guard is the pre-flight check that
// the machine is actually quiet before any measurement is trusted.
const DEFAULT_MAX_BUSY_FRACTION = 0.1;
const DEFAULT_SAMPLE_MS = 500;
const DEFAULT_MAX_REGRESSION_FRACTION = 0.2;
const DEFAULT_MAX_BOUNDED_DETECTION_HEAP_BYTES = 64 * 1024;

const relativeChange = (baseline, candidate) =>
  baseline === 0
    ? candidate === 0
      ? 0
      : Number.POSITIVE_INFINITY
    : candidate / baseline - 1;

const requireNonNegativeFiniteNumber = (value, name) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative finite number`);
  }
  return value;
};

const totals = (snapshot) =>
  snapshot.reduce(
    (accumulator, { times }) => {
      const busy = times.user + times.nice + times.sys + times.irq;
      return {
        busy: accumulator.busy + busy,
        total: accumulator.total + busy + times.idle,
      };
    },
    { busy: 0, total: 0 },
  );

export const cpuBusyFraction = (before, after) => {
  const start = totals(before);
  const end = totals(after);
  const elapsed = end.total - start.total;
  return elapsed <= 0 ? 0 : (end.busy - start.busy) / elapsed;
};

export const evaluateBoundedDetectionGate = ({
  baseline,
  candidate,
  maxAbsolutePeakHeapDeltaBytes = DEFAULT_MAX_BOUNDED_DETECTION_HEAP_BYTES,
  maxRelativeRegression = DEFAULT_MAX_REGRESSION_FRACTION,
  scaleSamples,
}) => {
  const baselineWallMs = requireNonNegativeFiniteNumber(
    baseline.wallMs,
    "baseline.wallMs",
  );
  const candidateWallMs = requireNonNegativeFiniteNumber(
    candidate.wallMs,
    "candidate.wallMs",
  );
  const baselinePeakHeapDeltaBytes = requireNonNegativeFiniteNumber(
    baseline.peakHeapDeltaBytes,
    "baseline.peakHeapDeltaBytes",
  );
  const candidatePeakHeapDeltaBytes = requireNonNegativeFiniteNumber(
    candidate.peakHeapDeltaBytes,
    "candidate.peakHeapDeltaBytes",
  );
  requireNonNegativeFiniteNumber(
    maxAbsolutePeakHeapDeltaBytes,
    "maxAbsolutePeakHeapDeltaBytes",
  );
  requireNonNegativeFiniteNumber(
    maxRelativeRegression,
    "maxRelativeRegression",
  );

  const wallChange = relativeChange(baselineWallMs, candidateWallMs);
  const peakHeapDeltaChange = relativeChange(
    baselinePeakHeapDeltaBytes,
    candidatePeakHeapDeltaBytes,
  );
  const withinWallLimit = wallChange <= maxRelativeRegression;
  const withinRelativeHeapLimit = peakHeapDeltaChange <= maxRelativeRegression;
  const withinAbsoluteHeapCeiling =
    candidatePeakHeapDeltaBytes <= maxAbsolutePeakHeapDeltaBytes;
  const usesAbsoluteHeapAlternative =
    !withinRelativeHeapLimit && withinAbsoluteHeapCeiling;
  const scale =
    scaleSamples === undefined
      ? undefined
      : evaluateBoundedDetectionScale({
          maxAbsolutePeakHeapDeltaBytes,
          samples: scaleSamples,
        });
  const scalePass =
    scale === undefined ? !usesAbsoluteHeapAlternative : scale.pass;

  // Large parser workloads retain the relative heap gate. The absolute branch
  // is only for designated mismatch signals, where allocator-sized changes can
  // dominate a tiny denominator. That branch is unavailable without scaling
  // evidence proving rejection did not copy or parse progressively larger input.
  return Object.freeze({
    maxAbsolutePeakHeapDeltaBytes,
    maxRelativeRegression,
    pass:
      withinWallLimit &&
      (withinRelativeHeapLimit || usesAbsoluteHeapAlternative) &&
      scalePass,
    peakHeapDeltaChange,
    ...(scale === undefined ? {} : { scale }),
    usesAbsoluteHeapAlternative,
    wallChange,
    withinAbsoluteHeapCeiling,
    withinRelativeHeapLimit,
    withinWallLimit,
  });
};

export function evaluateBoundedDetectionScale({
  maxAbsolutePeakHeapDeltaBytes = DEFAULT_MAX_BOUNDED_DETECTION_HEAP_BYTES,
  samples,
}) {
  if (!Array.isArray(samples) || samples.length < 3) {
    throw new TypeError(
      "bounded detection scaling requires at least three samples",
    );
  }
  let previousInputBytes = 0;
  const peakHeapDeltas = samples.map(
    ({ inputBytes, peakHeapDeltaBytes }, index) => {
      const normalizedInputBytes = requireNonNegativeFiniteNumber(
        inputBytes,
        `samples[${index}].inputBytes`,
      );
      if (
        normalizedInputBytes === 0 ||
        normalizedInputBytes <= previousInputBytes
      ) {
        throw new TypeError(
          "bounded detection sample sizes must be positive and strictly increasing",
        );
      }
      previousInputBytes = normalizedInputBytes;
      return requireNonNegativeFiniteNumber(
        peakHeapDeltaBytes,
        `samples[${index}].peakHeapDeltaBytes`,
      );
    },
  );
  requireNonNegativeFiniteNumber(
    maxAbsolutePeakHeapDeltaBytes,
    "maxAbsolutePeakHeapDeltaBytes",
  );

  return Object.freeze({
    maxAbsolutePeakHeapDeltaBytes,
    maxObservedPeakHeapDeltaBytes: Math.max(...peakHeapDeltas),
    pass: peakHeapDeltas.every(
      (peakHeapDeltaBytes) =>
        peakHeapDeltaBytes <= maxAbsolutePeakHeapDeltaBytes,
    ),
  });
}

export const assertQuiescentMachine = async ({
  maxBusyFraction = DEFAULT_MAX_BUSY_FRACTION,
  readCpus = cpus,
  sampleMs = DEFAULT_SAMPLE_MS,
} = {}) => {
  const before = readCpus();
  await delay(sampleMs);
  const busyFraction = cpuBusyFraction(before, readCpus());

  if (busyFraction > maxBusyFraction) {
    throw new Error(
      [
        `The machine is not idle: ${(busyFraction * 100).toFixed(1)}% of processor time was busy`,
        `over ${sampleMs} ms, above the ${(maxBusyFraction * 100).toFixed(1)}% limit.`,
        "Stop other benchmarks, test runs, builds and bulk file scans, then measure again.",
        "A contaminated run inflates wall time by a factor that looks exactly like a regression.",
      ].join(" "),
    );
  }
};
