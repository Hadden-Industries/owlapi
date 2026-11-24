import { ResourceLimitError } from "../../io/errors.js";

/** Schedule only the remaining duration, including deadlines beyond one native timer. */
export function scheduleOperationDeadline(timeoutMilliseconds, callback) {
  if (!Number.isFinite(timeoutMilliseconds)) return () => {};
  const expiresAt = performance.now() + timeoutMilliseconds;
  let timer;
  const schedule = () => {
    const remaining = expiresAt - performance.now();
    if (remaining <= 0) callback();
    else timer = setTimeout(schedule, Math.min(remaining, 2147483647));
  };
  schedule();
  return () => clearTimeout(timer);
}

/** Adapt caller and reader signals to one timed acquisition. */
export function documentAcquisitionScope(config, signals) {
  const controller = new AbortController();
  const listeners = new Map();
  for (const signal of new Set(signals.filter(Boolean))) {
    const abort = () => controller.abort(signal.reason);
    if (signal.aborted) abort();
    else {
      signal.addEventListener("abort", abort, { once: true });
      listeners.set(signal, abort);
    }
  }
  const cancelDeadline = scheduleOperationDeadline(config.timeoutMs, () =>
    controller.abort(
      new ResourceLimitError("The document acquisition deadline was exceeded", {
        resource: "deadline",
        limit: config.timeoutMs,
      }),
    ),
  );
  return {
    signal: controller.signal,
    close(abort = false) {
      cancelDeadline();
      if (abort) controller.abort();
      for (const [signal, listener] of listeners)
        signal.removeEventListener?.("abort", listener);
    },
  };
}
