import assert from "node:assert/strict";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const control = JSON.parse(
  readFileSync(
    new URL("../docs/release/rc3-publication-recovery.json", import.meta.url),
    "utf8",
  ),
);

export const RC3_RECOVERY = Object.freeze(control);
export const RECOVERY_JOBS = Object.freeze({
  recovery_source: "Release recovery / source verified",
  recovery_accepted: "Release recovery / accepted",
  recovery_publish: "Release recovery / npm trusted publisher",
  recovery_registry: "Release recovery / fresh public registry",
  recovery_evidence: "Release recovery / evidence",
  recovery_finalize: "Release recovery / finalize immutable GitHub release",
  recovery_immutable: "Release recovery / immutable verification",
});
export const RECOVERY_WRITE_STEP =
  "Perform the authorized publication and exact-version channel writes";
export const RECOVERY_SOURCE_JOBS = Object.freeze([
  "Release / installed OWL contract",
  "Release / protected-main preflight",
  "Release / qualified",
  "Release / publication preflight",
  "Release / tag accepted",
  "Release / GitHub draft",
]);
export const RECOVERY_REQUIRED_JOBS = Object.freeze(
  [...RECOVERY_SOURCE_JOBS, ...Object.values(RECOVERY_JOBS).slice(0, 4)].sort(),
);

export function assertRecoverySource(run, jobs) {
  const c = RC3_RECOVERY;
  assert.equal(String(run.id), c.runId);
  assert.equal(run.run_attempt, c.runAttempt);
  assert.equal(run.head_sha, c.sourceCommit);
  assert.equal(run.head_branch, "main");
  assert.equal(run.head_repository?.full_name, c.repository);
  assert.equal(run.path, ".github/workflows/release.yml");
  assert.equal(run.event, "workflow_dispatch");
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "failure");
  assert.equal(jobs.length, 82, "Original native inventory is incomplete");
  assert.equal(new Set(jobs.map((j) => j.id)).size, jobs.length);
  assert.equal(new Set(jobs.map((j) => j.name)).size, jobs.length);
  const skipped = new Set([
    "Release / fresh public registry",
    "Release / evidence",
    "Release / finalize immutable GitHub release",
    "Release / immutable verification",
  ]);
  for (const job of jobs) {
    assert.equal(String(job.run_id), c.runId);
    assert.equal(job.run_attempt, c.runAttempt);
    assert.equal(job.head_sha, c.sourceCommit);
    assert.equal(job.status, "completed");
    assert.equal(
      job.conclusion,
      job.name === "Release / npm trusted publisher"
        ? "failure"
        : skipped.has(job.name)
          ? "skipped"
          : "success",
    );
  }
  for (const name of RECOVERY_SOURCE_JOBS)
    assert.equal(
      jobs.filter((j) => j.name === name && j.conclusion === "success").length,
      1,
    );
  const publisher = jobs.find(
    (j) => j.name === "Release / npm trusted publisher",
  );
  assert.ok(publisher);
  const writes = publisher.steps.filter((s) => s.name === RECOVERY_WRITE_STEP);
  assert.equal(writes.length, 1);
  assert.equal(
    writes[0].conclusion,
    "skipped",
    "A possible registry write cannot be replayed",
  );
  assert.equal(
    publisher.steps.find(
      (s) => s.name === "Capture the authenticated publisher-gate approval",
    )?.conclusion,
    "failure",
  );
  return publisher;
}

export function assertRc3RecoveryEvidence(facts) {
  const c = RC3_RECOVERY,
    r = facts.reconciliation;
  assert.equal(facts.source.commit, c.sourceCommit);
  assert.equal(facts.source.tag, c.tag);
  assert.equal(
    facts.package?.version ??
      facts.producerContract?.candidate?.package?.version,
    "0.1.0-rc.3",
  );
  assert.equal(facts.qualificationWorkflow.runId, c.runId);
  assert.equal(facts.qualificationWorkflow.runAttempt, 1);
  assert.equal(facts.candidate.artifactId, String(c.artifacts.candidate));
  assert.notEqual(facts.workflow.commit, c.sourceCommit);
  assert.notEqual(facts.workflow.runId, c.runId);
  assert.equal(facts.workflow.runAttempt, 1);
  assert.equal(
    r?.failureClass,
    "PRE_PUBLICATION_APPROVAL_CAPTURE_IMPORT_FAILURE",
  );
  assert.equal(r.sourceFailureJob.name, "Release / npm trusted publisher");
  assert.equal(r.sourceFailureJob.conclusion, "failure");
  assert.equal(
    r.sourceFailureJob.url,
    `https://github.com/${c.repository}/actions/runs/${c.runId}/job/123874274391`,
  );
  assert.equal(r.publicationWrite, "NOT_ATTEMPTED");
  assert.equal(r.tagObject, c.tagObject);
  assert.equal(r.packageReproduction, "ORIGINAL_QUALIFIED_ARTIFACT");
  assert.equal(facts.githubRelease.id, c.releaseId);
  assert.deepEqual(
    facts.requiredJobs.map((j) => j.name).sort(),
    RECOVERY_REQUIRED_JOBS,
  );
  for (const job of facts.requiredJobs) {
    assert.equal(job.conclusion, "success");
    const runId = RECOVERY_SOURCE_JOBS.includes(job.name)
      ? c.runId
      : facts.workflow.runId;
    assert.ok(
      job.url.startsWith(
        `https://github.com/${c.repository}/actions/runs/${runId}/job/`,
      ),
    );
  }
}

export async function assertRecoveryRegistryUnused(fetchImpl = fetch) {
  const options = {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  };
  const response = await fetchImpl(
    "https://registry.npmjs.org/@hadden-industries%2fowlapi/0.1.0-rc.3",
    options,
  );
  assert.equal(
    response.status,
    404,
    "Recovery requires the version to remain unpublished",
  );
  await response.body?.cancel();
  const tags = await fetchImpl(
    "https://registry.npmjs.org/-/package/@hadden-industries%2fowlapi/dist-tags",
    options,
  );
  assert.equal(tags.status, 200, "Cannot establish previous registry channels");
  const chunks = [];
  let bytes = 0;
  assert.ok(tags.body, "Missing registry channel response");
  for await (const chunk of tags.body) {
    bytes += chunk.byteLength;
    assert.ok(bytes <= 65536, "Registry channel response exceeds its budget");
    chunks.push(chunk);
  }
  const channels = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
  );
  for (const [name, value] of Object.entries(control.priorChannels))
    assert.equal(
      channels[name],
      value,
      `Registry ${name} changed before publication`,
    );
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  if (process.argv[2] === "guard-publication") {
    assert.equal(process.env.GITHUB_REPOSITORY, control.repository);
    assert.equal(process.env.GITHUB_REF, "refs/heads/main");
    assert.equal(process.env.GITHUB_RUN_ATTEMPT, "1");
    assert.equal(process.env.GITHUB_JOB, "recovery_publish");
    await assertRecoveryRegistryUnused();
  } else {
    assert.equal(process.argv[2], "outputs");
    assert.ok(process.env.GITHUB_OUTPUT);
    const values = {
      source_commit: control.sourceCommit,
      source_run_id: control.runId,
      candidate_artifact_id: control.artifacts.candidate,
      tag: control.tag,
      version: control.tag.slice(1),
    };
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(""),
    );
  }
}
