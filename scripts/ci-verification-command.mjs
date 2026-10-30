import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  CI_WORKFLOW,
  createVerificationReceipt,
  createMainQualification,
  hostedIdentity,
  selectVerificationProof,
  verifyIntegrationProof,
} from "./ci-verification.mjs";

const STATE = ".release/ci-reuse/selection.json";
const DOWNLOAD = ".release/ci-reuse/download";
const RECEIPT = ".release/ci-verification/verification.json";
const MAIN_RECEIPT = ".release/ci-main-qualification/verification.json";

/** Read exact commit identity with a bounded native Git call budget. */
export const readGitSnapshot = (
  directory = process.cwd(),
  { deadline = Date.now() + 30000 } = {},
) => {
  const git = (...args) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw Object.assign(new Error("Git snapshot deadline elapsed."), {
        code: "LOOKUP_LIMIT_EXCEEDED",
      });
    const result = spawnSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      timeout: Math.min(10000, remaining),
    });
    if (["ETIMEDOUT", "ENOBUFS"].includes(result.error?.code))
      throw Object.assign(
        new Error("Git snapshot lookup exceeded its budget."),
        {
          code: "LOOKUP_LIMIT_EXCEEDED",
        },
      );
    if (result.status !== 0)
      throw new Error("Could not establish the exact Git checkout.");
    return result.stdout.trim();
  };
  // Read the raw commit: shallow checkouts hide parents in pretty-printed logs.
  const headers = git("cat-file", "-p", "HEAD").split("\n\n", 1)[0];
  return {
    commit: git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
    parents: headers
      .split("\n")
      .filter((line) => /^parent [a-f0-9]{40}$/u.test(line))
      .map((line) => line.slice(7)),
    workflow: git("rev-parse", `HEAD:${CI_WORKFLOW}`),
  };
};

const readJson = (path, maximumBytes = 256 * 1024) => {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumBytes) {
    throw new Error("Evidence file is outside its permitted size or type.");
  }
  return JSON.parse(readFileSync(path, "utf8"));
};

const contextFromEnvironment = (env) => ({
  eventName: env.GITHUB_EVENT_NAME,
  ref: env.GITHUB_REF,
  sha: env.GITHUB_SHA,
  repository: env.GITHUB_REPOSITORY,
  repositoryId: Number(env.GITHUB_REPOSITORY_ID),
  runId: Number(env.GITHUB_RUN_ID),
  runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
  event: readJson(env.GITHUB_EVENT_PATH),
  snapshot: readGitSnapshot(),
  host: hostedIdentity(env, process.version),
  version: readJson("package.json").version,
});

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

export const readDownloadedReceipt = (root, artifactName) => {
  // Official download-artifact can place a single artifact directly at the root
  // or inside its named directory. Accept only those two closed inventories.
  let directory = resolve(root);
  const rootStat = lstatSync(directory);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new Error("Invalid receipt root directory.");
  let names = readdirSync(directory);
  if (names.length === 1 && names[0] === artifactName) {
    directory = join(directory, artifactName);
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Invalid receipt directory.");
    names = readdirSync(directory);
  }
  if (names.length !== 1 || names[0] !== "verification.json") {
    throw new Error("Receipt archive has an unexpected inventory.");
  }
  return readJson(join(directory, "verification.json"), 64 * 1024);
};

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

export const emit = (
  values,
  summary,
  { env = process.env, append = appendFileSync, stdout = process.stdout } = {},
) => {
  const entries = Object.entries(values);
  for (const [key, value] of entries) {
    if (!/^[a-z_]+$/u.test(key) || /[\r\n]/u.test(String(value)))
      throw new Error("Unsafe action output.");
  }
  if (env.GITHUB_ACTIONS === "true" && !env.GITHUB_OUTPUT)
    throw new Error("Hosted command requires GITHUB_OUTPUT.");
  if (env.GITHUB_OUTPUT)
    append(
      env.GITHUB_OUTPUT,
      entries.map(([key, value]) => `${key}=${value}\n`).join(""),
    );
  if (env.GITHUB_STEP_SUMMARY) append(env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  stdout.write(`${JSON.stringify({ ...values, summary })}\n`);
};

const main = async () => {
  const mode = process.argv[2];
  if (!["select", "verify", "record", "record-main"].includes(mode))
    throw new Error("Expected select, verify, record or record-main.");
  if (mode === "select" && process.env.GITHUB_EVENT_NAME !== "push") {
    emit({ available: "false" }, "Full PR qualification is required.");
    return;
  }
  const execute = async () => {
    if (
      mode === "verify" &&
      (process.env.PROOF_DOWNLOAD_OUTCOME !== "success" || !existsSync(STATE))
    ) {
      throw new Error("No successfully downloaded PR receipt is available.");
    }
    const context = contextFromEnvironment(process.env);
    if (mode === "record" || mode === "record-main") {
      const receipt = (
        mode === "record" ? createVerificationReceipt : createMainQualification
      )({
        context,
        needs: JSON.parse(process.env.REQUIRED_JOB_RESULTS_JSON ?? "null"),
      });
      writeJson(mode === "record" ? RECEIPT : MAIN_RECEIPT, receipt);
      return [
        { recorded: "true" },
        mode === "record"
          ? "Retained typed FULL PR qualification and original executed coverage."
          : `Retained landed-main ${receipt.mode} qualification with direct original executed coverage.`,
      ];
    }
    const read = createRepositoryReader({
      repository: context.repository,
      token: process.env.GH_TOKEN,
    });
    if (mode === "select") {
      const selection = await selectVerificationProof({ context, read });
      writeJson(STATE, selection);
      return [
        {
          available: "true",
          run_id: selection.run.id,
          artifact_id: selection.artifact.id,
        },
        "A candidate PR receipt is available; reuse is not yet verified.",
      ];
    }
    const selection = readJson(STATE);
    const receipt = readDownloadedReceipt(DOWNLOAD, selection.artifact.name);
    const result = await verifyIntegrationProof({
      context,
      selection,
      receipt,
      read,
    });
    return [
      result,
      `Reused complete PR qualification: https://github.com/${context.repository}/actions/runs/${result.source_run_id}/attempts/${result.source_run_attempt}. Original candidate artifact: ${result.candidate_artifact_id} (${result.candidate_artifact_digest}). No application tests were represented as freshly executed.`,
    ];
  };
  let result;
  try {
    result = await execute();
  } catch (error) {
    // Optimization failure selects the ordinary gate, never a successful test result.
    const reason =
      error instanceof Error
        ? error.message.replaceAll(/[\r\n]/gu, " ").slice(0, 300)
        : "Evidence could not be verified.";
    if (mode === "record" || mode === "record-main")
      result = [
        { recorded: "false" },
        `No reusable receipt retained: ${reason}`,
      ];
    else
      result = [
        mode === "select" ? { available: "false" } : { reuse: "false" },
        `Full qualification required: ${reason}`,
      ];
  }
  // Reporting is outside the evidence fallback: a broken output sink fails the
  // command and can never rewrite verified reuse as an ordinary cache miss.
  emit(...result);
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await main();
