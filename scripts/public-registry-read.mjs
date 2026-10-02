import { setTimeout as delay } from "node:timers/promises";

/** Return complete response bytes within three GET attempts for transport/408/429/5xx only. Parsing and identity validation remain outside this retry boundary. */
export const readPublicRegistry = async (url) => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(120000),
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
    }
    if (
      response &&
      !response.ok &&
      response.status !== 408 &&
      response.status !== 429 &&
      response.status < 500
    )
      throw new Error(`Public registry read returned HTTP ${response.status}.`);
    if (response && !response.ok)
      lastError = new Error(
        `Public registry read returned HTTP ${response.status}.`,
      );
    // Release failed HTTP response bodies before another GET. A consumed or failed
    // successful body is already settled by arrayBuffer above.
    if (response && !response.ok) await response.body?.cancel().catch(() => {});
    if (attempt < 3) {
      const retryAfter = response?.headers.get("retry-after");
      const seconds = Number(retryAfter);
      const requested =
        retryAfter === null || retryAfter === undefined
          ? 0
          : Number.isFinite(seconds)
            ? seconds * 1000
            : Date.parse(retryAfter) - Date.now();
      await delay(
        Math.min(
          60000,
          Math.max(attempt * 1000, Number.isFinite(requested) ? requested : 0),
        ),
      );
    }
  }
  throw lastError;
};
