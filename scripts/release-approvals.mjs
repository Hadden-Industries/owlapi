import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { GitHubReleaseClient } from "./github-release.mjs";
import { readZipArchiveFiles, sha256Buffer } from "./release-artifacts.mjs";

const repository = "Hadden-Industries/owlapi";
const gateJobs = {
  "release-manual": "Release / tag accepted",
  "npm-release": "Release / npm trusted publisher",
};
const requireFact = (value, message) => {
  if (!value) throw new Error(message);
};

export const approvalFromHistory = (history, environment, observedAt) => {
  requireFact(
    Array.isArray(history) && Object.hasOwn(gateJobs, environment),
    "Malformed approval history or environment.",
  );
  const reviews = history.filter((review) =>
    review.environments?.some(({ name }) => name === environment),
  );
  requireFact(
    reviews.length === 1 &&
      reviews[0].state === "approved" &&
      /^[A-Za-z0-9-]+$/u.test(reviews[0].user?.login ?? ""),
    `Approval history does not establish one unambiguous approved reviewer for ${environment}.`,
  );
  return {
    environment,
    reviewer: reviews[0].user.login,
    state: "approved",
    observedAt,
  };
};

export const validateApprovalObservation = (
  observation,
  { environment, commit, runId, runAttempt, jobs },
) => {
  requireFact(
    observation.schemaVersion === 1 &&
      observation.repository === repository &&
      observation.commit === commit &&
      observation.runId === runId &&
      Number.isSafeInteger(observation.runAttempt) &&
      observation.runAttempt >= 1 &&
      observation.runAttempt <= runAttempt &&
      observation.environment === environment &&
      Number.isFinite(Date.parse(observation.observedAt)),
    "Retained approval observation identity differs.",
  );
  const matching = jobs.filter(
    (job) =>
      job.name === gateJobs[environment] &&
      job.run_attempt === observation.runAttempt,
  );
  const latestAttempt = Math.max(
    ...jobs
      .filter(
        (job) =>
          job.name === gateJobs[environment] && job.run_attempt <= runAttempt,
      )
      .map((job) => job.run_attempt),
  );
  const latest = jobs.filter(
    (job) =>
      job.name === gateJobs[environment] && job.run_attempt === latestAttempt,
  );
  requireFact(
    matching.length === 1 &&
      matching[0].id === observation.jobId &&
      String(matching[0].run_id) === runId &&
      matching[0].head_sha === commit &&
      latest.length === 1 &&
      latest[0].conclusion === "success" &&
      latest[0].head_sha === commit &&
      String(latest[0].run_id) === runId,
    "Retained approval gate job lacks exact identity or successful latest execution.",
  );
  return approvalFromHistory(
    observation.history,
    environment,
    observation.observedAt,
  );
};

export const decodeApprovalArchive = (archive, artifact, identity) => {
  requireFact(
    archive.length <= 1024 * 1024 &&
      `sha256:${sha256Buffer(archive)}` === artifact.digest,
    "Approval artifact archive digest differs.",
  );
  const entries = readZipArchiveFiles(archive);
  const name = `approval-${identity.environment}.json`;
  requireFact(
    entries.length === 1 &&
      entries[0].path === name &&
      entries[0].bytes <= 128 * 1024,
    "Approval artifact inventory differs.",
  );
  const observation = JSON.parse(entries[0].content.toString("utf8"));
  return {
    observation,
    approval: validateApprovalObservation(observation, identity),
  };
};

const limitedBytes = async (response, limit) => {
  requireFact(
    response.ok,
    `Approval artifact download returned HTTP ${response.status}.`,
  );
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      requireFact(size <= limit, "Approval artifact exceeds the bounded read.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
};

const downloadApprovalArchive = async (client, artifact) => {
  const signal = AbortSignal.timeout(60000);
  const redirect = await fetch(
    `${client.apiRoot}/actions/artifacts/${artifact.id}/zip`,
    { redirect: "manual", headers: client.headers(), signal },
  );
  requireFact(
    redirect.status === 302,
    "Approval artifact API did not return the expected redirect.",
  );
  const url = new URL(redirect.headers.get("location"));
  requireFact(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (url.hostname.endsWith(".blob.core.windows.net") ||
        url.hostname.endsWith(".actions.githubusercontent.com")),
    "Unapproved approval artifact storage origin.",
  );
  // The authenticated API digest binds the archive; credentials never go to storage.
  return limitedBytes(
    await fetch(url, { redirect: "error", signal }),
    1024 * 1024,
  );
};

export const resolveRetainedApprovals = async ({
  client,
  commit,
  runId,
  runAttempt,
  jobs,
  liveHistory,
  download = downloadApprovalArchive,
}) => {
  const artifacts = [];
  for (let page = 1; page <= 5; page++) {
    const result = await client.read(
      `/actions/runs/${runId}/artifacts?per_page=100&page=${page}`,
    );
    requireFact(
      Array.isArray(result.artifacts),
      "Malformed approval artifact inventory.",
    );
    artifacts.push(...result.artifacts);
    if (result.artifacts.length < 100) break;
    requireFact(
      page < 5,
      "Approval artifact inventory exceeds the bounded read.",
    );
  }
  const approvals = [],
    inputs = [];
  for (const environment of Object.keys(gateJobs)) {
    const prefix = `release-approval-${environment}-${runId}-`;
    const matches = artifacts
      .filter(({ name }) => name?.startsWith(prefix))
      .map((artifact) => ({
        artifact,
        attempt: Number(artifact.name.slice(prefix.length)),
      }))
      .filter(
        ({ artifact, attempt }) =>
          /^[1-9][0-9]*$/u.test(artifact.name.slice(prefix.length)) &&
          Number.isSafeInteger(attempt) &&
          attempt <= runAttempt,
      );
    const latest = Math.max(...matches.map(({ attempt }) => attempt));
    const selected = matches.filter(({ attempt }) => attempt === latest);
    requireFact(
      selected.length === 1,
      `Missing or ambiguous retained approval artifact for ${environment}.`,
    );
    const artifact = await client.read(
      `/actions/artifacts/${selected[0].artifact.id}`,
    );
    requireFact(
      artifact.id === selected[0].artifact.id &&
        artifact.name === selected[0].artifact.name &&
        artifact.digest === selected[0].artifact.digest &&
        /^sha256:[0-9a-f]{64}$/u.test(artifact.digest ?? "") &&
        !artifact.expired &&
        String(artifact.workflow_run?.id) === runId &&
        artifact.workflow_run?.head_sha === commit,
      "Retained approval artifact server identity differs.",
    );
    const { observation, approval } = decodeApprovalArchive(
      await download(client, artifact),
      artifact,
      { environment, commit, runId, runAttempt, jobs },
    );
    requireFact(
      observation.runAttempt === latest,
      "Approval artifact name and observation attempt differ.",
    );
    requireFact(Array.isArray(liveHistory), "Malformed live approval history.");
    const relevant = liveHistory.filter((review) =>
      review.environments?.some(({ name }) => name === environment),
    );
    if (relevant.length) {
      requireFact(
        relevant.every(
          (review) =>
            review.state === "approved" &&
            review.user?.login === approval.reviewer,
        ),
        "Live approval history contradicts the retained reviewer or state.",
      );
    }
    approvals.push(approval);
    inputs.push({ name: artifact.name, sha256: artifact.digest.slice(7) });
  }
  return { approvals, inputs };
};

export const captureApprovalObservation = async ({
  environment,
  env = process.env,
  client,
}) => {
  const commit = env.GITHUB_SHA,
    runId = env.GITHUB_RUN_ID,
    runAttempt = Number(env.GITHUB_RUN_ATTEMPT);
  requireFact(
    Object.hasOwn(gateJobs, environment) &&
      env.GITHUB_REPOSITORY === repository &&
      env.GITHUB_REF === "refs/heads/main" &&
      /^[0-9a-f]{40}$/u.test(commit ?? "") &&
      /^[1-9][0-9]*$/u.test(runId ?? "") &&
      Number.isSafeInteger(runAttempt) &&
      runAttempt >= 1,
    "Approval capture requires the canonical protected workflow identity.",
  );
  const [run, history, jobResult] = await Promise.all([
    client.read(`/actions/runs/${runId}`),
    client.read(`/actions/runs/${runId}/approvals`),
    client.read(
      `/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100`,
    ),
  ]);
  requireFact(
    run.head_sha === commit &&
      run.run_attempt === runAttempt &&
      run.path === ".github/workflows/release.yml" &&
      jobResult.jobs.length < 100,
    "Approval capture workflow identity differs or jobs are incomplete.",
  );
  const matches = jobResult.jobs.filter(
    (job) =>
      job.name === gateJobs[environment] &&
      String(job.run_id) === runId &&
      job.run_attempt === runAttempt &&
      job.head_sha === commit &&
      job.status === "in_progress",
  );
  requireFact(
    matches.length === 1 &&
      env.GITHUB_JOB ===
        (environment === "release-manual" ? "tag_accepted" : "npm_release"),
    "Approval capture is outside its exact running protected gate.",
  );
  const observedAt = new Date().toISOString();
  approvalFromHistory(history, environment, observedAt);
  return {
    schemaVersion: 1,
    repository,
    commit,
    runId,
    runAttempt,
    environment,
    jobId: matches[0].id,
    observedAt,
    history: history.filter((review) =>
      review.environments?.some(({ name }) => name === environment),
    ),
  };
};

const main = async () => {
  const value = (name) => {
    const index = process.argv.indexOf(name);
    return index < 0 ? undefined : process.argv[index + 1];
  };
  const output = value("--output");
  requireFact(output, "Approval capture requires an output path.");
  const observation = await captureApprovalObservation({
    environment: value("--environment"),
    client: new GitHubReleaseClient({
      repository,
      token: process.env.GITHUB_TOKEN,
    }),
  });
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(observation, null, 2)}\n`, {
    flag: "wx",
  });
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await main();
