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
import {
  CI_WORKFLOW,
  createVerificationReceipt,
  hostedIdentity,
  selectVerificationProof,
  verifyIntegrationProof,
} from "./ci-verification.mjs";

const STATE = ".release/ci-reuse/selection.json";
const DOWNLOAD = ".release/ci-reuse/download";
const RECEIPT = ".release/ci-verification/verification.json";

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

const readJson = (path) => {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024) {
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

export const createRepositoryReader = ({
  repository,
  token,
  fetchImpl = fetch,
}) => {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? "") || !token) {
    throw new Error("Read-only GitHub evidence access is unavailable.");
  }
  return async (path) => {
    if (
      !/^\/(?:commits|actions|git)\/[A-Za-z0-9_./?=&%-]+$/u.test(path) ||
      path.includes("..")
    ) {
      throw new Error("Unexpected GitHub evidence path.");
    }
    const response = await fetchImpl(
      `https://api.github.com/repos/${repository}${path}`,
      {
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2026-03-10",
        },
      },
    );
    if (!response.ok)
      throw new Error(`GitHub evidence read returned HTTP ${response.status}.`);
    return response.json();
  };
};

export const readDownloadedReceipt = (root, artifactName) => {
  // Official download-artifact can place a single artifact directly at the root
  // or inside its named directory. Accept only those two closed inventories.
  let directory = resolve(root);
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
  return readJson(join(directory, "verification.json"));
};

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const emit = (values, summary) => {
  for (const [key, value] of Object.entries(values)) {
    if (!/^[a-z_]+$/u.test(key) || /[\r\n]/u.test(String(value)))
      throw new Error("Unsafe action output.");
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
  process.stdout.write(`${JSON.stringify({ ...values, summary })}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
};

const main = async () => {
  const mode = process.argv[2];
  if (!["select", "verify", "record"].includes(mode))
    throw new Error("Expected select, verify or record.");
  if (mode === "select" && process.env.GITHUB_EVENT_NAME !== "push") {
    emit({ available: "false" }, "Full PR qualification is required.");
    return;
  }
  try {
    if (
      mode === "verify" &&
      (process.env.PROOF_DOWNLOAD_OUTCOME !== "success" || !existsSync(STATE))
    ) {
      throw new Error("No successfully downloaded PR receipt is available.");
    }
    const context = contextFromEnvironment(process.env);
    if (mode === "record") {
      const receipt = createVerificationReceipt({
        context,
        needs: JSON.parse(process.env.REQUIRED_JOB_RESULTS_JSON ?? "null"),
      });
      writeJson(RECEIPT, receipt);
      emit(
        { recorded: "true" },
        "Retained the complete PR qualification and original candidate identity.",
      );
      return;
    }
    const read = createRepositoryReader({
      repository: context.repository,
      token: process.env.GH_TOKEN,
    });
    if (mode === "select") {
      const selection = await selectVerificationProof({ context, read });
      writeJson(STATE, selection);
      emit(
        {
          available: "true",
          run_id: selection.run.id,
          artifact_id: selection.artifact.id,
        },
        "A candidate PR receipt is available; reuse is not yet verified.",
      );
      return;
    }
    const selection = readJson(STATE);
    const receipt = readDownloadedReceipt(DOWNLOAD, selection.artifact.name);
    const result = await verifyIntegrationProof({
      context,
      selection,
      receipt,
      read,
    });
    emit(
      result,
      `Reused complete PR qualification: https://github.com/${context.repository}/actions/runs/${result.source_run_id}/attempts/${result.source_run_attempt}. Original candidate artifact: ${result.candidate_artifact_id} (${result.candidate_artifact_digest}). No application tests were represented as freshly executed.`,
    );
  } catch (error) {
    // Optimization failure selects the ordinary gate, never a successful test result.
    const reason =
      error instanceof Error
        ? error.message.replaceAll(/[\r\n]/gu, " ").slice(0, 300)
        : "Evidence could not be verified.";
    if (mode === "record")
      emit({ recorded: "false" }, `No reusable receipt retained: ${reason}`);
    else
      emit(
        mode === "select" ? { available: "false" } : { reuse: "false" },
        `Full qualification required: ${reason}`,
      );
  }
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await main();
