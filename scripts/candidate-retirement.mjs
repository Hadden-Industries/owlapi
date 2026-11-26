// SPDX-License-Identifier: AGPL-3.0-only
/** Apply JSON Quality’s per-ID retirement procedure to OwlAPI’s signed custody and release controls. */
import assert from "node:assert/strict";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { CI_WORKFLOW, retirementTrigger } from "./ci-verification.mjs";
import { parseArtifactName } from "../tooling/artifact-transport/identity.mjs";

import { assertTimedUpload } from "./release-audit-job.mjs";
import { readQualifiedZip } from "./release-ci-package.mjs";
import { downloadReleaseArtifact } from "./release-approvals.mjs";

const positive = (value) => Number.isSafeInteger(value) && value > 0;
const oid = /^[a-f0-9]{40}$/u;
const digest = /^sha256:[a-f0-9]{64}$/u;
const sameRepo = (record) =>
  record?.id === REPOSITORY_ID && record.full_name === REPOSITORY;
export const retirementTag = (head) =>
  "owlapi-release-history/retention-" + head;

/** A workflow-run notification nominates a successful same-repository main push. The CI verifier reopens that exact run. */
export function assertRetirementWriter(env, event) {
  assert.equal(env.GITHUB_ACTIONS, "true");
  assert.equal(env.RUNNER_ENVIRONMENT, "github-hosted");
  assert.equal(env.GITHUB_REPOSITORY, REPOSITORY);
  assert.equal(env.GITHUB_REPOSITORY_ID, String(REPOSITORY_ID));
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  assert.equal(env.GITHUB_REF_PROTECTED, "true");
  assert.equal(env.GITHUB_JOB, "retire");
  assert.equal(
    env.GITHUB_WORKFLOW_REF,
    REPOSITORY + "/.github/workflows/candidate-retention.yml@refs/heads/main",
  );
  assert.match(env.GITHUB_SHA, oid);
  assert.equal(env.GITHUB_WORKFLOW_SHA, env.GITHUB_SHA);
  assert.ok(
    sameRepo(event?.repository) && event.repository.default_branch === "main",
    "Unexpected retirement repository",
  );
  if (env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    for (const actor of [env.GITHUB_ACTOR, env.GITHUB_TRIGGERING_ACTOR])
      assert.equal(
        actor?.toLowerCase(),
        "maksymshostak",
        "Manual retirement requires the owner",
      );
    assert.equal(
      env.RETENTION_HISTORY_OBJECT ?? "",
      event.inputs?.retention_history_object ?? "",
      "Retirement checkpoint differs from dispatch",
    );
  } else {
    assert.ok(
      !env.RETENTION_HISTORY_OBJECT,
      "Automatic retirement selects the successor's protected checkpoint",
    );
  }
  return retirementTrigger({
    eventName: env.GITHUB_EVENT_NAME,
    event,
    sha: env.GITHUB_SHA,
    repository: REPOSITORY,
    repositoryId: REPOSITORY_ID,
  });
}

/** A v1 reporting checkpoint has no deletion authority. The owner separately signs the per-candidate replay and backup facts. */
export async function verifyRetirementRehearsal(client, checkpoint, decisions) {
  assert.ok(
    decisions.schemaVersion === 2 &&
      decisions.purpose === "RETIRE_SUPERSEDED_CI_CANDIDATES",
    "A signed retirement authorization with a hosted replay is required",
  );
  const replay = decisions.hostedReplay;
  assert.ok(
    replay &&
      [replay.runId, replay.attempt, replay.jobId, replay.artifactId].every(
        positive,
      ) &&
      oid.test(replay.controller) &&
      positive(replay.releaseId) &&
      oid.test(replay.sealCheckpoint) &&
      digest.test(replay.artifactDigest),
    "A native hosted replay reference is required",
  );
  const logical = `release-completion-${replay.runId}-${replay.attempt}`;
  const archived = checkpoint.files.get(
    `origin-${replay.runId}-${replay.attempt}-${logical}.json`,
  );
  const saved = archived && JSON.parse(archived);
  const original = async (path, retained) => {
    const live = await client.read(path, { accept404: true }).catch((error) => {
      if (error.httpStatus === 410) return null;
      throw error;
    });
    assert.ok(live || retained, "Missing original hosted replay evidence");
    return live ?? retained;
  };
  const [run, job, artifact] = await Promise.all([
    original(
      `/actions/runs/${replay.runId}/attempts/${replay.attempt}`,
      saved?.run,
    ),
    original("/actions/jobs/" + replay.jobId, saved?.producer),
    original("/actions/artifacts/" + replay.artifactId, saved?.artifact),
  ]);
  assert.ok(
    sameRepo(run.repository) && sameRepo(run.head_repository),
    "Foreign hosted custody replay",
  );
  assert.deepEqual(
    [
      run.id,
      run.run_attempt,
      run.head_sha,
      run.head_branch,
      run.path,
      run.event,
      run.status,
      run.conclusion,
    ],
    [
      replay.runId,
      replay.attempt,
      replay.controller,
      "main",
      ".github/workflows/release-completion.yml",
      "workflow_dispatch",
      "completed",
      "success",
    ],
    "Hosted custody replay did not complete successfully",
  );
  const steps = job.steps?.filter(
    (step) => step.name === "Verify immutable release completion (complete)",
  );
  assert.deepEqual(
    [
      job.id,
      job.name,
      job.run_id,
      job.run_attempt,
      job.head_sha,
      job.status,
      job.conclusion,
    ],
    [
      replay.jobId,
      "complete",
      run.id,
      replay.attempt,
      replay.controller,
      "completed",
      "success",
    ],
    "Wrong original custody replay job",
  );
  assert.ok(
    positive(job.runner_id) &&
      job.runner_group_name === "GitHub Actions" &&
      steps?.length === 1 &&
      steps[0].status === "completed" &&
      steps[0].conclusion === "success",
    "Missing successful GitHub-hosted archive replay step",
  );
  assert.equal(artifact.id, replay.artifactId);
  assert.equal(artifact.digest, replay.artifactDigest);
  assertTimedUpload(
    artifact,
    run,
    job,
    logical,
    "Retain original operation evidence",
  );
  const retained = checkpoint.files.get("artifact-" + artifact.id + ".zip");
  if (artifact.expired)
    assert.ok(retained, "Restore the signed original hosted replay receipt");
  const files = await readQualifiedZip(
    (item, max) => retained ?? downloadReleaseArtifact(client, item, max),
    artifact,
    1024 * 1024,
    ["complete.json"],
  );
  const completion = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      files.get("complete.json"),
    ),
  );
  assert.ok(
    completion.state === "IMMUTABLE_VERIFIED" &&
      [7, 8].includes(completion.releaseEvidenceSchema) &&
      completion.releaseId === replay.releaseId &&
      completion.checkpoint === replay.sealCheckpoint &&
      oid.test(completion.source) &&
      oid.test(completion.tagObject),
    "Hosted replay did not verify an immutable staged release",
  );
}

/** Protect open PRs by number and by both commit identities, including heads that have advanced since the CI artifact was produced. */
export async function readOpenPullClaims(read) {
  const numbers = new Set(),
    commits = new Set();
  for (let page = 1; page <= 10; page++) {
    const pulls = await read("/pulls?state=open&per_page=100&page=" + page);
    assert.ok(
      Array.isArray(pulls) && pulls.length <= 100,
      "Incomplete open PR inventory",
    );
    for (const pr of pulls) {
      assert.ok(
        positive(pr.number) &&
          !numbers.has(pr.number) &&
          pr.state === "open" &&
          pr.base?.repo?.id === REPOSITORY_ID &&
          oid.test(pr.base?.sha) &&
          oid.test(pr.head?.sha),
        "Open PR inventory changed or lacks an identity",
      );
      numbers.add(pr.number);
      commits.add(pr.head.sha);
      commits.add(pr.base.sha);
      if (
        Object.hasOwn(pr, "merge_commit_sha") &&
        pr.merge_commit_sha !== null
      ) {
        assert.match(pr.merge_commit_sha, oid);
        commits.add(pr.merge_commit_sha);
      }
    }
    if (pulls.length < 100) return { numbers, commits };
  }
  throw new Error("Open PR inventory exceeds the complete lookup bound");
}

export function sameArtifact(original, live, now) {
  return (
    positive(original?.id) &&
    positive(original.size_in_bytes) &&
    digest.test(original.digest) &&
    live?.id === original.id &&
    live.name === original.name &&
    live.size_in_bytes === original.size_in_bytes &&
    live.digest === original.digest &&
    live.created_at === original.created_at &&
    live.expires_at === original.expires_at &&
    live.expired === false &&
    Date.parse(live.expires_at) > now &&
    ["id", "repository_id", "head_repository_id", "head_sha"].every(
      (key) => live.workflow_run?.[key] === original.workflow_run?.[key],
    )
  );
}

/** Release, future, and ambiguously owned originals cannot retire as ordinary predecessor CI output. */
export function supersededCiOrigin(artifact, run, successor, pulls) {
  if (
    !run ||
    run.path !== CI_WORKFLOW ||
    run.status !== "completed" ||
    !sameRepo(run.repository) ||
    !sameRepo(run.head_repository) ||
    !positive(run.id) ||
    !positive(run.run_attempt) ||
    run.id >= successor.run.id ||
    !oid.test(run.head_sha) ||
    run.head_sha !== artifact.workflow_run?.head_sha ||
    pulls.commits.has(run.head_sha) ||
    !(
      Date.parse(artifact.created_at) <
      Date.parse(successor.candidate.created_at)
    )
  )
    return false;
  const name = parseArtifactName(artifact.name, { legacy: false });
  if (
    !name ||
    name.run !== String(run.id) ||
    name.attempt > run.run_attempt ||
    !name.logical.endsWith("-" + name.run + "-" + name.attempt)
  )
    return false;
  if (run.event === "pull_request")
    return (
      Array.isArray(run.pull_requests) &&
      run.pull_requests.length === 1 &&
      positive(run.pull_requests[0].number) &&
      run.pull_requests[0].base?.repo?.id === REPOSITORY_ID &&
      run.pull_requests[0].head?.repo?.id === REPOSITORY_ID &&
      oid.test(run.pull_requests[0].head?.sha) &&
      !pulls.numbers.has(run.pull_requests[0].number) &&
      !pulls.commits.has(run.pull_requests[0].head.sha)
    );
  return (
    ["push", "workflow_dispatch"].includes(run.event) &&
    run.head_branch === "main"
  );
}

/** Inspect again before each exact-ID mutation. Never retry an ambiguous or failed write within this operation. */
export async function retireSelectedCandidates({
  inspect,
  client,
  head,
  now,
  log,
}) {
  const plan = await inspect();
  log(
    "Retirement selection: " +
      plan.reason +
      " Eligible artifact IDs: " +
      (plan.eligibleIds.join(", ") || "none") +
      ".",
  );
  const selected = new Map(plan.inventory.map((file) => [file.id, file]));
  const retired = [];
  for (const id of plan.eligibleIds) {
    const expected = selected.get(id);
    const current = await inspect(expected);
    if (!current.eligibleIds.includes(id)) {
      log("Retirement held before artifact " + id + ". " + current.reason);
      break;
    }
    const observed = await client.read("/actions/artifacts/" + id);
    assert.ok(
      sameArtifact(expected, observed, now()),
      "Original CI artifact changed before retirement",
    );
    const main = await client.read("/branches/main");
    assert.ok(
      main.name === "main" &&
        main.protected === true &&
        main.commit.sha === head,
      "Protected main moved before retirement",
    );
    log(
      "Attempting retirement of artifact " +
        id +
        " (" +
        expected.size_in_bytes +
        " bytes).",
    );
    const result = await client.write("/actions/artifacts/" + id, {
      method: "DELETE",
      expectedStatus: 204,
    });
    if (result.state === "AMBIGUOUS") {
      log(
        "Ambiguous retirement of artifact " +
          id +
          ". Reconcile the exact ID before another application.",
      );
      throw new Error("Ambiguous candidate retirement for " + id);
    }
    assert.ok(
      result.state === "CONFIRMED" && result.value === null,
      "Retirement response was not confirmed",
    );
    retired.push(id);
    log("GitHub acknowledged retirement of artifact " + id + ".");
  }
  return retired;
}
