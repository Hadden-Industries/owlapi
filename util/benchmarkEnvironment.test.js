import {
  assertQuiescentMachine,
  cpuBusyFraction,
} from "./benchmarkEnvironment.mjs";
import * as benchmarkEnvironment from "./benchmarkEnvironment.mjs";

const snapshot = (idle, busy) => [
  { times: { idle, irq: 0, nice: 0, sys: busy, user: 0 } },
];

const readsInOrder = (...snapshots) => {
  const queued = [...snapshots];
  return () => queued.shift();
};

describe("cpuBusyFraction", () => {
  it("reports the busy share of elapsed processor time between two samples", () => {
    const before = snapshot(1000, 0);
    const after = snapshot(1750, 250);

    expect(cpuBusyFraction(before, after)).toBeCloseTo(0.25, 5);
  });

  it("reports a fully idle machine as zero", () => {
    expect(cpuBusyFraction(snapshot(1000, 500), snapshot(2000, 500))).toBe(0);
  });
});

describe("assertQuiescentMachine", () => {
  it("rejects when the machine is busier than the permitted fraction", async () => {
    const readCpus = readsInOrder(snapshot(1000, 0), snapshot(1100, 900));

    await expect(
      assertQuiescentMachine({
        maxBusyFraction: 0.1,
        readCpus,
        sampleMs: 0,
      }),
    ).rejects.toThrow(/not idle/iu);
  });

  it("resolves when the machine is quiet enough to measure", async () => {
    const readCpus = readsInOrder(snapshot(1000, 0), snapshot(1990, 10));

    await expect(
      assertQuiescentMachine({
        maxBusyFraction: 0.1,
        readCpus,
        sampleMs: 0,
      }),
    ).resolves.toBeUndefined();
  });
});

describe("evaluateBoundedDetectionGate", () => {
  it("accepts the relative heap limit or absolute ceiling while always enforcing wall time", () => {
    const evaluate = benchmarkEnvironment.evaluateBoundedDetectionGate;
    const cases = [
      {
        baseline: { peakHeapDeltaBytes: 1_000_000, wallMs: 10 },
        candidate: { peakHeapDeltaBytes: 1_150_000, wallMs: 11 },
      },
      {
        baseline: { peakHeapDeltaBytes: 42_816, wallMs: 14.08 },
        candidate: { peakHeapDeltaBytes: 51_616, wallMs: 9.15 },
        scaleSamples: [
          { inputBytes: 1_048_576, peakHeapDeltaBytes: 42_560 },
          { inputBytes: 4_194_304, peakHeapDeltaBytes: 37_016 },
          { inputBytes: 16_777_216, peakHeapDeltaBytes: 51_616 },
        ],
      },
      {
        baseline: { peakHeapDeltaBytes: 42_816, wallMs: 10 },
        candidate: { peakHeapDeltaBytes: 42_816, wallMs: 12.01 },
      },
      {
        baseline: { peakHeapDeltaBytes: 42_816, wallMs: 10 },
        candidate: { peakHeapDeltaBytes: 65_537, wallMs: 10 },
      },
      {
        baseline: { peakHeapDeltaBytes: 42_816, wallMs: 14.08 },
        candidate: { peakHeapDeltaBytes: 51_616, wallMs: 9.15 },
      },
    ];

    expect(cases.map((entry) => evaluate?.(entry)?.pass)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("rejects non-finite metrics and negative gate limits", () => {
    const evaluate = benchmarkEnvironment.evaluateBoundedDetectionGate;
    const valid = {
      baseline: { peakHeapDeltaBytes: 42_816, wallMs: 10 },
      candidate: { peakHeapDeltaBytes: 51_616, wallMs: 9 },
    };

    expect(() =>
      evaluate({
        ...valid,
        candidate: { peakHeapDeltaBytes: Number.POSITIVE_INFINITY, wallMs: 9 },
      }),
    ).toThrow(TypeError);
    expect(() => evaluate({ ...valid, maxRelativeRegression: -0.01 })).toThrow(
      TypeError,
    );
    expect(() =>
      evaluate({ ...valid, maxAbsolutePeakHeapDeltaBytes: -1 }),
    ).toThrow(TypeError);
  });

  it("reports the policy limits used for a reproducible decision", () => {
    const result = benchmarkEnvironment.evaluateBoundedDetectionGate({
      baseline: { peakHeapDeltaBytes: 42_816, wallMs: 14.08 },
      candidate: { peakHeapDeltaBytes: 51_616, wallMs: 9.15 },
    });

    expect(result).toMatchObject({
      maxAbsolutePeakHeapDeltaBytes: 65_536,
      maxRelativeRegression: 0.2,
    });
  });
});

describe("evaluateBoundedDetectionScale", () => {
  it("requires every measured input size to remain below the fixed heap ceiling", () => {
    const evaluate = benchmarkEnvironment.evaluateBoundedDetectionScale;
    const inputs = [
      {
        samples: [
          { inputBytes: 1_048_576, peakHeapDeltaBytes: 48_000 },
          { inputBytes: 4_194_304, peakHeapDeltaBytes: 52_000 },
          { inputBytes: 16_777_216, peakHeapDeltaBytes: 60_000 },
        ],
      },
      {
        samples: [
          { inputBytes: 1_048_576, peakHeapDeltaBytes: 48_000 },
          { inputBytes: 4_194_304, peakHeapDeltaBytes: 52_000 },
          { inputBytes: 16_777_216, peakHeapDeltaBytes: 65_537 },
        ],
      },
    ];

    expect(inputs.map((entry) => evaluate?.(entry)?.pass)).toEqual([
      true,
      false,
    ]);
  });

  it("rejects a scale without three strictly increasing positive input sizes", () => {
    const evaluate = benchmarkEnvironment.evaluateBoundedDetectionScale;

    expect(() =>
      evaluate({
        samples: [
          { inputBytes: 1, peakHeapDeltaBytes: 1 },
          { inputBytes: 2, peakHeapDeltaBytes: 1 },
        ],
      }),
    ).toThrow(TypeError);
    expect(() =>
      evaluate({
        samples: [
          { inputBytes: 1, peakHeapDeltaBytes: 1 },
          { inputBytes: 1, peakHeapDeltaBytes: 1 },
          { inputBytes: 2, peakHeapDeltaBytes: 1 },
        ],
      }),
    ).toThrow(TypeError);
    expect(() =>
      evaluate({
        samples: [
          { inputBytes: 0, peakHeapDeltaBytes: 1 },
          { inputBytes: 1, peakHeapDeltaBytes: 1 },
          { inputBytes: 2, peakHeapDeltaBytes: 1 },
        ],
      }),
    ).toThrow(TypeError);
  });
});
