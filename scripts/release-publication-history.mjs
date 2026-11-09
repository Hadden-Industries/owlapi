import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { GitHubReleaseClient } from "./github-release.mjs";
import { sameJobExecution } from "./github-job-execution.mjs";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./package-identity.mjs";

export const PUBLICATION_WRITE_STEP =
  "Perform the authorized publication and exact-version channel writes";
export const PUBLICATION_GUARD_COMMAND =
  "node approval-tools/scripts/release-publication-history.mjs";
export const PUBLICATION_WRITE_IF =
  "${{ steps.publication_history.outputs.publish == 'true' }}";
const repository = "Hadden-Industries/owlapi";
const publishers = {
  npm_release: "Release / npm trusted publisher",
  recovery_publish: "Release recovery / npm trusted publisher",
};
const positive = (n) => Number.isSafeInteger(n) && n > 0;

export function assertPublicationRun(run, env, attempt) {
  assert.ok(/^[1-9][0-9]*$/u.test(env.GITHUB_RUN_ID ?? ""));
  assert.ok(/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA ?? ""));
  assert.equal(env.GITHUB_REPOSITORY, repository);
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  assert.equal(String(run.id), env.GITHUB_RUN_ID);
  assert.equal(run.head_sha, env.GITHUB_SHA);
  assert.equal(run.head_branch, "main");
  assert.equal(run.head_repository?.full_name, repository);
  assert.equal(run.path, ".github/workflows/release.yml");
  assert.equal(run.event, "workflow_dispatch");
  assert.equal(run.run_attempt, attempt);
}

/** Authenticate every attempt, not the latest API's relabelled retained jobs.
 * A missing or ambiguous write observation never establishes permission to retry.
 * The workflow serializes controllers; npm still arbitrates coordinate uniqueness.
 */
export async function readPublicationHistory({
  client,
  env = process.env,
  admitting = false,
  beforePublisher = false,
}) {
  const attempt = Number(env.GITHUB_RUN_ATTEMPT);
  assert.ok(
    positive(attempt) && attempt <= 50,
    "Publication history exceeds its bounded attempt inventory",
  );
  const path = `/actions/runs/${env.GITHUB_RUN_ID}`;
  const run = await client.read(path);
  assertPublicationRun(run, env, attempt);
  if (admitting)
    assert.ok(
      Object.hasOwn(publishers, env.GITHUB_JOB),
      "Publication admission requires a publisher job",
    );
  const writes = [];
  const jobs = [];
  let currentPublisher;
  for (let n = 1; n <= attempt; n++) {
    if (n < attempt) {
      const previous = await client.read(`${path}/attempts/${n}`);
      assertPublicationRun(previous, env, n);
      assert.equal(
        previous.status,
        "completed",
        "Previous publication attempt is not closed",
      );
    }
    const inventory = await client.read(
      `${path}/attempts/${n}/jobs?per_page=100`,
    );
    assert.ok(
      Array.isArray(inventory.jobs) &&
        inventory.jobs.length < 100 &&
        inventory.total_count === inventory.jobs.length,
      "Publication job inventory is incomplete or exceeds its bound",
    );
    assert.equal(
      new Set(inventory.jobs.map((job) => job.id)).size,
      inventory.jobs.length,
      "Duplicate publication inventory jobs",
    );
    const relevant = inventory.jobs.filter((job) =>
      Object.values(publishers).includes(job.name),
    );
    assert.equal(
      new Set(relevant.map((job) => job.name)).size,
      relevant.length,
      "Ambiguous publisher inventory",
    );
    for (const job of inventory.jobs) {
      assert.ok(positive(job.id));
      assert.equal(String(job.run_id), env.GITHUB_RUN_ID);
      assert.equal(job.head_sha, env.GITHUB_SHA);
      assert.equal(job.run_attempt, n);
      jobs.push(job);
    }
    for (const job of relevant) {
      if (
        beforePublisher &&
        n === attempt &&
        ["queued", "waiting", "pending"].includes(job.status)
      )
        continue;
      if (
        admitting &&
        n === attempt &&
        job.name === publishers[env.GITHUB_JOB]
      ) {
        assert.equal(
          job.status,
          "in_progress",
          "Admission is outside the running publisher",
        );
        currentPublisher = job;
        continue;
      }
      assert.equal(
        job.status,
        "completed",
        "Publication execution is still unresolved",
      );
      const steps =
        job.steps?.filter((step) => step.name === PUBLICATION_WRITE_STEP) ?? [];
      if (job.conclusion === "skipped") {
        assert.ok(
          steps.every(
            (step) =>
              step.status === "completed" && step.conclusion === "skipped",
          ),
          "Skipped publisher contains a possible write",
        );
        continue;
      }
      assert.equal(
        steps.length,
        1,
        "Publication write history is unavailable or ambiguous",
      );
      const step = steps[0];
      assert.equal(step.status, "completed", "Publication write is unresolved");
      if (step.conclusion === "skipped") continue;
      assert.ok(
        ["success", "failure"].includes(step.conclusion) &&
          ["success", "failure"].includes(job.conclusion) &&
          Number.isFinite(Date.parse(step.completed_at)),
        "Publication write outcome is unresolved; do not replay possible writes",
      );
      sameJobExecution(job, job);
      // Attempt-specific inventories may still carry copies of earlier jobs.
      const retained = writes.find((prior) => sameJobExecution(prior.job, job));
      if (retained)
        assert.deepEqual(
          step,
          retained.step,
          "Retained publication write changed",
        );
      else writes.push({ job, step });
    }
  }
  assert.ok(
    writes.length <= 1,
    "Multiple publication executions require reconciliation",
  );
  if (admitting)
    assert.ok(
      currentPublisher,
      "Running publisher is absent from the complete inventory",
    );
  assertPublicationRun(await client.read(path), env, attempt);
  return { writes, jobs, run };
}

export function publicationObservation({ job, step }) {
  return {
    state:
      step.conclusion === "success"
        ? "PUBLICATION_ACCEPTED"
        : "PUBLICATION_ATTEMPTED",
    runId: String(job.run_id),
    runAttempt: job.run_attempt,
    jobId: job.id,
    conclusion: step.conclusion,
    completedAt: step.completed_at,
    acceptedAt: step.conclusion === "success" ? step.completed_at : null,
  };
}

export async function admitPublication({
  client,
  env = process.env,
  fetchImpl = fetch,
}) {
  const history = await readPublicationHistory({
    client,
    env,
    admitting: true,
  });
  if (history.writes.length)
    return {
      publish: false,
      publication: publicationObservation(history.writes[0]),
    };
  // Absence alone never permits a retry; authenticated native history above must
  // also prove that no write was attempted. Recheck even on a later first write.
  const response = await fetchImpl(
    `https://registry.npmjs.org/${encodeURIComponent(PACKAGE_NAME)}/${PACKAGE_VERSION}`,
    {
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    },
  );
  await response.body?.cancel();
  assert.equal(
    response.status,
    404,
    "A first publication requires an unused registry coordinate",
  );
  return { publish: true, publication: null };
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  assert.ok(process.env.GITHUB_OUTPUT);
  const result = await admitPublication({
    client: new GitHubReleaseClient({
      repository,
      token: process.env.GITHUB_TOKEN,
    }),
  });
  appendFileSync(process.env.GITHUB_OUTPUT, `publish=${result.publish}\n`);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
