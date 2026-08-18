import { cpus } from "node:os";
import { setTimeout as delay } from "node:timers/promises";

// Repeated measurement with median aggregation defends against random,
// short-lived noise. It does not defend against sustained contention, which
// inflates every run by a similar factor and therefore produces a tight spread
// that reads as a high-quality signal. This guard is the pre-flight check that
// the machine is actually quiet before any measurement is trusted.
const DEFAULT_MAX_BUSY_FRACTION = 0.1;
const DEFAULT_SAMPLE_MS = 500;

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
