import { ResourceLimitError } from "../../io/errors.js";

const defaults = Object.freeze({
  maxWork: null,
  maxAxioms: null,
  maxDepth: null,
  maxAnnotationDepth: null,
  timeoutMs: null,
  signal: undefined,
});
const aborted = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
).get;

/** Capture data-only caller limits before iterators/callbacks. Java locality has
 * no numerical cap; all limits default to null under the owner resource decision.
 * One work/deadline counter covers preparation and every fixed-point/STAR pass.
 */
export const createLocalityBudget = (options = {}) => {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("Locality options must be an object");
  const configuration = { ...defaults };
  for (const key of Reflect.ownKeys(options)) {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!Object.hasOwn(defaults, key) || !Object.hasOwn(descriptor, "value"))
      throw new TypeError("Unknown or accessor locality option");
    configuration[key] = descriptor.value;
  }
  for (const key of Object.keys(defaults).filter((key) => key !== "signal")) {
    const value = configuration[key];
    if (value !== null && (!Number.isSafeInteger(value) || value < 0))
      throw new TypeError(`${key} must be null or a nonnegative safe integer`);
  }
  if (configuration.signal !== undefined) {
    try {
      aborted.call(configuration.signal);
    } catch {
      throw new TypeError("signal must be an AbortSignal");
    }
  }
  Object.freeze(configuration);
  const started = performance.now();
  let work = 0,
    yielded = started;
  const limit = (option, observed) => {
    if (configuration[option] !== null && observed > configuration[option])
      throw new ResourceLimitError(`Locality ${option} exceeded`, {
        resource: option,
        limit: configuration[option],
      });
  };
  const check = (amount = 1) => {
    if (
      configuration.signal !== undefined &&
      aborted.call(configuration.signal)
    )
      throw new DOMException("Locality extraction aborted", "AbortError");
    // There is no counter arithmetic or implicit safe-integer cap when unlimited.
    if (configuration.maxWork !== null) {
      work += amount;
      limit("maxWork", work);
    }
    if (configuration.timeoutMs !== null)
      limit("timeoutMs", performance.now() - started);
  };
  const checkpoint = async (amount = 1) => {
    check(amount);
    if (performance.now() - yielded >= 50) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      yielded = performance.now();
      check(0);
    }
  };
  return { configuration, checkpoint, check, limit };
};
