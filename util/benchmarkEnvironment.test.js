import {
  assertQuiescentMachine,
  cpuBusyFraction,
} from "./benchmarkEnvironment.mjs";

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
