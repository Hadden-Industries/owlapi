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
