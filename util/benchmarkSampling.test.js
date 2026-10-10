import { jest } from "@jest/globals";
import {
  median,
  RUN_COUNT,
  WARMUP_COUNT,
  sampleHeap,
  sampleHeapWallLast,
  sampleEventLoop,
  sampleJsonLdEventLoop,
  sampleObservedHeap,
} from "./benchmarkSampling.mjs";

afterEach(() => jest.restoreAllMocks());
it("uses the accepted run policy and upper-middle median without sorting inputs", () => {
  const values = [9, 2, 7, 1];
  expect(median(values)).toBe(7);
  expect(values).toEqual([9, 2, 7, 1]);
  expect([WARMUP_COUNT, RUN_COUNT]).toEqual([1, 5]);
});
it.each([
  sampleHeap,
  sampleHeapWallLast,
  sampleEventLoop,
  sampleJsonLdEventLoop,
])("clears the sampler when the operation fails (%p)", async (sample) => {
  const clear = jest.spyOn(globalThis, "clearInterval");
  const failure = new Error("operation failed");
  await expect(
    sample(() => {
      throw failure;
    }),
  ).rejects.toBe(failure);
  expect(clear).toHaveBeenCalledTimes(1);
});
it("heap-only mode adds no timer turn; event-loop mode retains its extra turn", async () => {
  const timeout = jest.spyOn(globalThis, "setTimeout");
  const heap = await sampleHeap(async () => {});
  expect(timeout).not.toHaveBeenCalled();
  expect(Object.keys(heap)).toEqual([
    "wallMs",
    "peakHeapBytes",
    "peakHeapDeltaBytes",
    "retainedHeapDeltaBytes",
  ]);
  const event = await sampleEventLoop(async () => {});
  expect(timeout).toHaveBeenCalledTimes(1);
  expect(Object.keys(event)).toEqual([
    "maxEventLoopDelayMs",
    "peakHeapBytes",
    "peakHeapDeltaBytes",
    "retainedHeapDeltaBytes",
    "wallMs",
  ]);
});
it("synchronous translation observes allocations without scheduling a sampler", async () => {
  const interval = jest.spyOn(globalThis, "setInterval");
  const result = await sampleObservedHeap((observe) => {
    observe();
    return 7;
  });
  expect(result.outputQuads).toBe(7);
  expect(interval).not.toHaveBeenCalled();
});
