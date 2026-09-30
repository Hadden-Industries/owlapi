import { ResourceLimitError } from "../../io/errors.js";

const defaults = Object.freeze({
  maxWork: 1000000,
  maxDepth: 256,
  maxNumericDigits: 4096,
  maxLiteralLength: 1048576,
  timeoutMs: 30000,
  sourceAssessment: false,
  signal: undefined,
});
const aborted = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
).get;

export const createProfileBudget = (options = {}) => {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("Profile options must be an object");
  const configuration = { ...defaults };
  for (const key of Reflect.ownKeys(options)) {
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!Object.hasOwn(defaults, key) || !Object.hasOwn(descriptor, "value"))
      throw new TypeError("Unknown or accessor profile option");
    configuration[key] = descriptor.value;
  }
  for (const key of [
    "maxWork",
    "maxDepth",
    "maxNumericDigits",
    "maxLiteralLength",
    "timeoutMs",
  ]) {
    if (!Number.isSafeInteger(configuration[key]) || configuration[key] < 0)
      throw new TypeError(`${key} must be a nonnegative safe integer`);
  }
  // The parser uses bounded recursion only for XSD pattern grammar.
  if (configuration.maxDepth > 512)
    throw new RangeError("maxDepth must not exceed 512");
  if (configuration.maxNumericDigits > 65536)
    throw new RangeError("maxNumericDigits must not exceed 65536");
  if (typeof configuration.sourceAssessment !== "boolean")
    throw new TypeError("sourceAssessment must be boolean");
  if (configuration.signal !== undefined) {
    try {
      aborted.call(configuration.signal);
    } catch {
      throw new TypeError("signal must be an AbortSignal");
    }
  }
  Object.freeze(configuration);
  const started = performance.now();
  let work = 0;
  const check = (amount = 1) => {
    work += amount;
    if (
      configuration.signal !== undefined &&
      aborted.call(configuration.signal)
    )
      throw new DOMException("Profile check aborted", "AbortError");
    if (work > configuration.maxWork)
      throw new ResourceLimitError("OWL profile work limit exceeded", {
        resource: "profileWork",
        limit: configuration.maxWork,
      });
    if (performance.now() - started > configuration.timeoutMs)
      throw new ResourceLimitError("OWL profile deadline exceeded", {
        resource: "profileTimeoutMs",
        limit: configuration.timeoutMs,
      });
  };
  const checkpoint = async () => {
    check();
    if (work % 256 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      check(0);
    }
  };
  const depth = (observed) => {
    check(0);
    if (observed > configuration.maxDepth)
      throw new ResourceLimitError("OWL profile depth limit exceeded", {
        resource: "profileDepth",
        limit: configuration.maxDepth,
      });
  };
  return { configuration, check, checkpoint, depth };
};
