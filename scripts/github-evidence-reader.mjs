import { setTimeout as delay } from "node:timers/promises";

const transientReadCodes = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const transientReadError = (error) =>
  error?.name === "TimeoutError" ||
  transientReadCodes.has(error?.code) ||
  transientReadCodes.has(error?.cause?.code);

const rateLimitedRead = (response) =>
  response?.status === 429 ||
  (response?.status === 403 &&
    (response.headers.has("retry-after") ||
      response.headers.get("x-ratelimit-remaining") === "0"));

/** Server wait hints are lower bounds: never shorten them to fit our budget. */
const evidenceRetryDelay = (response, attempt, now, random) => {
  const headers = response?.headers;
  const retryAfter = headers?.get("retry-after");
  const seconds = retryAfter?.trim() ? Number(retryAfter) : NaN;
  const retryAfterMs = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(retryAfter) - now;
  const reset = headers?.get("x-ratelimit-reset");
  const resetMs = reset?.trim() ? Number(reset) * 1000 - now : NaN;
  const exhausted = headers?.get("x-ratelimit-remaining") === "0";
  const rateLimited = rateLimitedRead(response);
  const serverWait = Math.max(
    0,
    Number.isFinite(retryAfterMs) ? retryAfterMs : 0,
    exhausted && Number.isFinite(resetMs) ? resetMs : 0,
    rateLimited &&
      !Number.isFinite(retryAfterMs) &&
      !(exhausted && Number.isFinite(resetMs))
      ? 60000
      : 0,
  );
  return Math.max(serverWait, 1000 * 2 ** attempt * (1 + random() * 0.25));
};

/** Shared read-only evidence boundary for CI and Java-reference consumers.
 * At most three GET attempts share the reader's 32-request/60-second budget.
 * Only transient transport/HTTP failures are retried; JSON and proof validation
 * stay outside recovery, so unavailable or invalid evidence still selects FULL.
 */
export const createRepositoryReader = ({
  repository,
  token,
  fetchImpl = fetch,
  now = Date.now,
  wallNow = Date.now,
  sleep = delay,
  random = Math.random,
  budgetMs = 60_000,
  requestLimit = 32,
  deadline = now() + budgetMs,
}) => {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? "") || !token) {
    throw new Error("Read-only GitHub evidence access is unavailable.");
  }
  if (
    !Number.isSafeInteger(budgetMs) ||
    budgetMs <= 0 ||
    budgetMs > 600_000 ||
    !Number.isSafeInteger(requestLimit) ||
    requestLimit <= 0 ||
    requestLimit > 256 ||
    !Number.isFinite(deadline)
  )
    throw new Error("Invalid GitHub evidence budget.");
  const requestDeadline = Math.min(deadline, now() + budgetMs);
  let requests = 0;
  const limit = () =>
    Object.assign(new Error("GitHub evidence lookup budget exhausted."), {
      code: "LOOKUP_LIMIT_EXCEEDED",
    });
  return async (path, { budgetMs: operationBudget } = {}) => {
    if (
      operationBudget !== undefined &&
      (!Number.isFinite(operationBudget) ||
        operationBudget <= 0 ||
        operationBudget > 600_000)
    )
      throw limit();
    const operationDeadline = Math.min(
      requestDeadline,
      now() + (operationBudget ?? Infinity),
    );
    if (
      !/^(?:\/immutable-releases|\/(?:commits|actions|git|attestations|releases|deployments)(?:\/|\?)[A-Za-z0-9_./?=&%-]+)$/u.test(
        path,
      ) ||
      path.includes("..")
    ) {
      throw new Error("Unexpected GitHub evidence path.");
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = operationDeadline - now();
      if (requests >= requestLimit || remaining <= 0) throw limit();
      requests++;
      let response;
      let bytes;
      try {
        response = await fetchImpl(
          `https://api.github.com/repos/${repository}${path}`,
          {
            redirect: "error",
            cache: "no-store",
            signal: AbortSignal.timeout(
              Math.max(1, Math.ceil(Math.min(10_000, remaining))),
            ),
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${token}`,
              "X-GitHub-Api-Version": "2026-03-10",
            },
          },
        );
        if (!response.ok) {
          const retryable =
            [408, 500, 502, 503, 504].includes(response.status) ||
            rateLimitedRead(response);
          throw Object.assign(
            new Error(`GitHub evidence read returned HTTP ${response.status}.`),
            { retryable, httpStatus: response.status },
          );
        }
        const chunks = [];
        let size = 0;
        if (!response.body)
          throw new Error("GitHub evidence response has no JSON body.");
        for await (const chunk of response.body) {
          size += chunk.byteLength;
          if (size > 2 * 1024 * 1024 || now() >= operationDeadline)
            throw Object.assign(
              new Error("GitHub evidence response exceeded its budget."),
              { code: "LOOKUP_LIMIT_EXCEEDED" },
            );
          chunks.push(chunk);
        }
        bytes = Buffer.concat(chunks);
      } catch (error) {
        if (attempt === 2 || !(error?.retryable || transientReadError(error))) {
          throw error;
        }
      } finally {
        // Discard incomplete/error responses before retrying another GET.
        if (response?.body && !response.bodyUsed)
          await response.body.cancel().catch(() => {});
      }
      if (bytes !== undefined) {
        if (now() >= operationDeadline) throw limit();
        return JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
      }
      const milliseconds = evidenceRetryDelay(
        response,
        attempt,
        wallNow(),
        random,
      );
      if (requests >= requestLimit || milliseconds >= operationDeadline - now())
        throw limit();
      await sleep(milliseconds);
    }
  };
};
