/** Text-parser elapsed-work scheduling; profile and RDF execution policies stay separate. */
export const monotonicNow = () => globalThis.performance?.now?.() ?? Date.now();
const COOPERATIVE_YIELD_INTERVAL_MS = 50;

export class CooperativeCheckpoint {
  #lastYieldAt;

  constructor(startedAt) {
    this.#lastYieldAt = startedAt;
  }

  /** Preserve the synchronous fast path and recheck the supplied lexer after yielding. */
  cooperate(lexer) {
    lexer.checkExecutionBudget();
    if (monotonicNow() - this.#lastYieldAt < COOPERATIVE_YIELD_INTERVAL_MS) {
      return undefined;
    }
    const scheduler = Reflect.get(globalThis, "scheduler");
    const request =
      typeof scheduler?.yield === "function"
        ? scheduler.yield()
        : new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    return Promise.resolve(request).then(() => {
      this.#lastYieldAt = monotonicNow();
      lexer.checkExecutionBudget();
    });
  }
}
