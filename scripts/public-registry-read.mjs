import { setTimeout as delay } from "node:timers/promises";

export const retryAfterMilliseconds = (value) => {
  if (!value) return 0;
  const seconds = Number(value);
  const milliseconds = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - Date.now();
  return Math.min(
    60000,
    Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0),
  );
};

export class RegistryReadError extends Error {
  constructor(message, { status, retryAfterMs = 0, cause } = {}) {
    super(message, { cause });
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.transient =
      status === undefined || status === 408 || status === 429 || status >= 500;
  }
}

/** Complete GET bytes, retrying only transport/408/429/5xx. Application validation remains outside this boundary. */
export const readPublicRegistry = async (
  url,
  { attempts = 3, timeoutMs = 120000 } = {},
) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs))),
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = new RegistryReadError(error.message, { cause: error });
    }
    if (
      response &&
      !response.ok &&
      response.status !== 408 &&
      response.status !== 429 &&
      response.status < 500
    ) {
      await response.body?.cancel().catch(() => {});
      throw new RegistryReadError(
        `Public registry read returned HTTP ${response.status}.`,
        { status: response.status },
      );
    }
    if (response && !response.ok)
      lastError = new RegistryReadError(
        `Public registry read returned HTTP ${response.status}.`,
        {
          status: response.status,
          retryAfterMs: retryAfterMilliseconds(
            response.headers.get("retry-after"),
          ),
        },
      );
    // Release failed HTTP response bodies before another GET. A consumed or failed
    // successful body is already settled by arrayBuffer above.
    if (response && !response.ok) await response.body?.cancel().catch(() => {});
    if (attempt < attempts) {
      await delay(
        Math.max(
          attempt * 1000,
          retryAfterMilliseconds(response?.headers.get("retry-after")),
        ),
      );
    }
  }
  throw lastError;
};
