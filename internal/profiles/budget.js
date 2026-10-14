import { ResourceLimitError } from "../../io/errors.js";
import { defaultBehaviorProfileDefinition } from "../behavior/ontologyBehaviorContext.js";

const COOPERATIVE_YIELD_INTERVAL_MS = 50;

const defaults = Object.freeze({
  ...defaultBehaviorProfileDefinition.computationResourcePolicy
    .owlProfileLimits,
  timeoutMs: null,
  sourceAssessment: false,
  signal: undefined,
});
const aborted = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
).get;

export const createProfileBudget = (
  options = {},
  behaviorProfileDefinition = defaultBehaviorProfileDefinition,
) => {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("Profile options must be an object");
  const policy = behaviorProfileDefinition.computationResourcePolicy;
  const configuration = { ...defaults, ...policy.owlProfileLimits };
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
    if (key === "timeoutMs" && configuration[key] === null) continue;
    if (policy.usesJavaProviderDefaults && configuration[key] === Infinity)
      continue;
    if (!Number.isSafeInteger(configuration[key]) || configuration[key] < 0)
      throw new TypeError(`${key} must be a nonnegative safe integer`);
  }
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
  let lastYieldAt = started;
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
    if (
      configuration.timeoutMs !== null &&
      performance.now() - started > configuration.timeoutMs
    )
      throw new ResourceLimitError("OWL profile deadline exceeded", {
        resource: "profileTimeoutMs",
        limit: configuration.timeoutMs,
      });
  };
  const checkpoint = async () => {
    check();
    // Yield for elapsed work, not every small batch: timer clamping otherwise
    // dominates large assessments. Keep all work/depth and deadline checks.
    if (performance.now() - lastYieldAt >= COOPERATIVE_YIELD_INTERVAL_MS) {
      // scheduler.yield continuations can outrun an already queued timer in
      // Chromium. A timer turn also admits caller-scheduled cancellation.
      await new Promise((resolve) => setTimeout(resolve, 0));
      lastYieldAt = performance.now();
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
