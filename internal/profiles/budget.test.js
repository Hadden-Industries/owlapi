import { jest } from "@jest/globals";
import { createProfileBudget } from "./budget.js";

const schedulerDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "scheduler",
);
afterEach(() => {
  jest.restoreAllMocks();
  if (schedulerDescriptor)
    Object.defineProperty(globalThis, "scheduler", schedulerDescriptor);
  else Reflect.deleteProperty(globalThis, "scheduler");
});

test("fast work does not queue a task merely because many checkpoints passed", async () => {
  jest.spyOn(performance, "now").mockReturnValue(0);
  const yieldTask = jest.fn(async () => {});
  Object.defineProperty(globalThis, "scheduler", {
    configurable: true,
    value: { yield: yieldTask },
  });
  const timer = jest.spyOn(globalThis, "setTimeout");
  const budget = createProfileBudget();
  for (let i = 0; i < 4096; i++) await budget.checkpoint();
  expect(yieldTask).not.toHaveBeenCalled();
  expect(timer).not.toHaveBeenCalled();
});

test.each([true, false])(
  "elapsed work yields with scheduler available: %s",
  async (available) => {
    let now = 0;
    jest.spyOn(performance, "now").mockImplementation(() => now);
    const yieldTask = jest.fn(async () => {
      now += 1000;
    });
    Object.defineProperty(globalThis, "scheduler", {
      configurable: true,
      value: available ? { yield: yieldTask } : undefined,
    });
    const timer = jest.spyOn(globalThis, "setTimeout");
    const budget = createProfileBudget();
    now = 50;
    await budget.checkpoint();
    expect(timer).toHaveBeenCalledTimes(1);
    expect(yieldTask).not.toHaveBeenCalled();
    await budget.checkpoint();
    expect(timer).toHaveBeenCalledTimes(1);
  },
);

test("checks cancellation after a timer turn without charging extra work", async () => {
  let now = 0;
  jest.spyOn(performance, "now").mockImplementation(() => now);
  const controller = new AbortController();
  const budget = createProfileBudget({ signal: controller.signal, maxWork: 1 });
  const cancellationTimer = setTimeout(() => controller.abort(), 0);
  now = 50;
  await expect(budget.checkpoint()).rejects.toMatchObject({
    name: "AbortError",
  });
  clearTimeout(cancellationTimer);
});

test("explicit work and deadline exhaustion remain independent of yielding", async () => {
  let now = 0;
  jest.spyOn(performance, "now").mockImplementation(() => now);
  const budget = createProfileBudget({ maxWork: 1, timeoutMs: 10 });
  await budget.checkpoint();
  await expect(budget.checkpoint()).rejects.toMatchObject({
    resource: "profileWork",
    limit: 1,
  });
  const deadline = createProfileBudget({ timeoutMs: 10 });
  now = 11;
  await expect(deadline.checkpoint()).rejects.toMatchObject({
    resource: "profileTimeoutMs",
    limit: 10,
  });
});
