/** Bind an advisory receipt to the exact operator-dispatched protected job and upload.
 * Native metadata may be recovered only from the admitted history checkpoint. */
import assert from "node:assert/strict";
import { readControllerBlob } from "./release-controller-blob.mjs";
import { crc32 } from "node:zlib";
import { canonicalJson } from "./canonical-json.mjs";
import { readRunArtifacts } from "./github-evidence-reader.mjs";
import { sameJobExecution } from "./github-job-execution.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { readZipArchiveFilesWith } from "./release-zip-core.mjs";
import { downloadReleaseArtifact } from "./release-approvals.mjs";
import {
  matchesLogicalArtifact,
  artifactProducingAttempt,
} from "../tooling/artifact-transport/identity.mjs";
import { verifyReleaseAuditReceipt } from "./release-audit-evaluator.mjs";
import { UBUNTU, ubuntuRunner } from "./ubuntu-runner.mjs";
import { advisoryCasePath } from "./release-audit-cases.mjs";

const positive = (n) => Number.isSafeInteger(n) && n > 0;
const digest = (v) => typeof v === "string" && /^[a-f0-9]{64}$/u.test(v);
const callerPaths = [
  ".github/workflows/release.yml",
  ".github/workflows/release-registry.yml",
];
const jobName = "Release advisory / Evaluate";
const uploadStep = "Retain protected advisory decision";
const maxReceiptZip = 512 * 1024;
export const auditReceiptFilenames = ["receipt.json", "receipt.sigstore.json"];
const hash = sha256Buffer;

/** The controller commit is independently selected by the workflow/operation.
 * Read actual policy sources from that immutable Git object, including for historical replay. */
export function auditPolicySha256(controller) {
  assert.match(controller, /^[a-f0-9]{40}$/u);
  const paths = [
    "scripts/release-audit-policy.mjs",
    "scripts/release-audit-evaluator.mjs",
    "scripts/release-audit-evaluator-private.mjs",
    "scripts/release-audit-evaluator-sigstore.mjs",
    "scripts/release-audit-cases.mjs",
    advisoryCasePath,
    ".github/workflows/release-audit-evaluator.yml",
  ];
  const originals = paths.map((path) => {
    const bytes = readControllerBlob(controller, path);
    return [path, hash(bytes)];
  });
  return hash(Buffer.from(canonicalJson(Object.fromEntries(originals))));
}

/** Paginate the native jobs API once per origin, including large release-only shard rosters. */
export async function releaseJobs(client, runId, attempt) {
  assert.ok(
    positive(Number(runId)) &&
      (attempt === undefined || positive(Number(attempt))),
  );
  const path =
    attempt === undefined
      ? "/actions/runs/" + runId + "/jobs?filter=latest&"
      : "/actions/runs/" + runId + "/attempts/" + attempt + "/jobs?";
  const jobs = [];
  let total;
  for (let page = 1; ; page++) {
    const response = await client.read(path + "per_page=100&page=" + page);
    assert.ok(
      Number.isSafeInteger(response.total_count) &&
        response.total_count >= 0 &&
        Array.isArray(response.jobs),
    );
    total ??= response.total_count;
    assert.equal(response.total_count, total, "Native job roster changed");
    jobs.push(...response.jobs);
    if (jobs.length === total) break;
    assert.ok(
      response.jobs.length === 100 && jobs.length < total,
      "Incomplete native job roster",
    );
  }
  assert.equal(
    new Set(jobs.map((j) => j.id)).size,
    total,
    "Duplicate native jobs",
  );
  return jobs;
}

export function checkedNativeJob(jobs, name, run, status = "completed") {
  const matching = jobs.filter((j) => j.name === name);
  assert.equal(matching.length, 1, "Missing or ambiguous native job: " + name);
  const [job] = matching;
  assert.ok(
    positive(job.id) &&
      job.run_id === run.id &&
      job.head_sha === run.head_sha &&
      positive(job.run_attempt) &&
      job.run_attempt <= run.run_attempt,
    "Foreign native job",
  );
  assert.equal(job.status, status);
  if (status === "completed")
    assert.equal(job.conclusion, "success", "Original job did not succeed");
  return job;
}

export function assertProtectedReleaseRun(
  run,
  { workflow, runId, attempt, controller },
  issuing = false,
) {
  assert.ok(callerPaths.includes(workflow));
  assert.match(controller, /^[a-f0-9]{40}$/u);
  assert.deepEqual(
    [
      run.repository?.full_name,
      run.repository?.id,
      run.head_repository?.full_name,
      run.head_repository?.id,
      run.id,
      run.run_attempt,
      run.path,
      run.head_sha,
      run.head_branch,
      run.event,
    ],
    [
      REPOSITORY,
      REPOSITORY_ID,
      REPOSITORY,
      REPOSITORY_ID,
      Number(runId),
      Number(attempt),
      workflow,
      controller,
      "main",
      "workflow_dispatch",
    ],
  );
  if (issuing)
    assert.ok(
      run.status === "in_progress" && run.conclusion === null,
      "Evaluator requires its current running dispatch",
    );
  else
    assert.ok(
      run.status === "completed" && run.conclusion === "success",
      "Protected release workflow did not complete successfully",
    );
}

/** Source of the workload identity is the authentic GitHub job, independent of receipt data. */
export function auditTrust(
  { workflow, controller, runId },
  job,
  policySha256 = auditPolicySha256(controller),
  runner = UBUNTU.label,
) {
  assert.equal(job.name, jobName);
  assert.deepEqual(job.labels, [runner]);
  assert.ok(
    positive(job.runner_id) &&
      job.head_sha === controller &&
      job.run_id === Number(runId) &&
      positive(job.run_attempt),
  );
  const prefix = "https://api.github.com/repos/" + REPOSITORY + "/check-runs/";
  assert.ok(
    typeof job.check_run_url === "string" &&
      job.check_run_url.startsWith(prefix),
  );
  const id = Number(job.check_run_url.slice(prefix.length));
  assert.ok(positive(id) && job.check_run_url === prefix + id);
  assert.ok(digest(policySha256));
  return {
    policySha256,
    evaluator: {
      workflow,
      controller,
      runId: Number(runId),
      attempt: job.run_attempt,
      checkRunId: id,
    },
  };
}

export function assertTimedUpload(artifact, run, job, logical, stepName) {
  assert.ok(
    positive(artifact?.id) &&
      /^sha256:[a-f0-9]{64}$/u.test(artifact.digest) &&
      positive(artifact.size_in_bytes),
  );
  assert.ok(
    matchesLogicalArtifact(artifact.name, logical, {
      run: run.id,
      attempt: job.run_attempt,
      legacy: false,
    }),
    "Wrong original artifact name",
  );
  assert.deepEqual(
    [
      artifact.workflow_run?.id,
      artifact.workflow_run?.head_sha,
      artifact.workflow_run?.repository_id,
      artifact.workflow_run?.head_repository_id,
    ],
    [run.id, run.head_sha, REPOSITORY_ID, REPOSITORY_ID],
    "Wrong original artifact source",
  );
  const steps = (job.steps ?? []).filter((s) => s.name === stepName);
  assert.equal(steps.length, 1);
  const [step] = steps;
  assert.ok(
    step.status === "completed" &&
      step.conclusion === "success" &&
      Date.parse(step.started_at) <= Date.parse(artifact.created_at) &&
      Date.parse(artifact.created_at) <= Date.parse(step.completed_at),
    "Artifact is outside its original upload",
  );
}

function evidence(entries, name) {
  const matches = entries.filter((e) => e.path === name);
  assert.equal(matches.length, 1);
  return matches[0].content;
}

/** Preserve only the public fields used to verify the original workload and its two signed members. */
export function archiveAdvisory(files, prefix, verified) {
  assert.ok(["public", "qualification"].includes(prefix));
  const fields = [
    "id",
    "name",
    "labels",
    "runner_id",
    "head_sha",
    "run_id",
    "run_attempt",
    "check_run_url",
    "status",
    "conclusion",
  ];
  const job = Object.fromEntries(fields.map((key) => [key, verified.job[key]]));
  for (const [suffix, bytes] of [
    [".json", verified.statement],
    [".sigstore.json", verified.signature],
    ["-job.json", Buffer.from(canonicalJson(job) + "\n")],
  ]) {
    const name = prefix + "-advisory" + suffix;
    assert.ok(!files.has(name), "Duplicate advisory archive member");
    files.set(name, bytes);
  }
}

async function originalOrSaved(read, saved) {
  try {
    return await read();
  } catch (error) {
    if (saved && [404, 410].includes(error.httpStatus)) return saved;
    throw error;
  }
}

/** Offline readback gets its expected run, original job and subject list from the
 * verified seal/qualification evidence; a signed packet cannot elect its own authority. */
export async function verifyArchivedAdvisoryReceipt({
  statement,
  signature,
  descriptor,
  workflow,
  runId,
  attempt,
  controller,
  job,
  entries,
  now,
  npmCli,
}) {
  assert.ok(
    positive(descriptor?.artifactId) &&
      /^sha256:[a-f0-9]{64}$/u.test(descriptor.artifactDigest),
    "Invalid original advisory artifact pointer",
  );
  assert.ok(
    callerPaths.includes(workflow) &&
      positive(Number(runId)) &&
      positive(Number(attempt)),
    "Invalid expected advisory origin",
  );
  assert.equal(sha256Buffer(statement), descriptor.statementSha256);
  assert.equal(sha256Buffer(signature), descriptor.signatureSha256);
  assert.equal(descriptor.jobId, job.id);
  assert.ok(
    job.status === "completed" &&
      job.conclusion === "success" &&
      job.run_attempt <= Number(attempt),
  );
  const runner = ubuntuRunner(
    JSON.parse(
      readControllerBlob(controller, "docs/release/runtime-policy.json"),
    ),
  ).label;
  const trust = auditTrust(
    { workflow, controller, runId },
    job,
    auditPolicySha256(controller),
    runner,
  );
  return verifyReleaseAuditReceipt(
    { statement, signature },
    { trust, entries, npmCli, now },
  );
}

/** Read the original protected evaluator ZIP. The signed checkpoint is the only
 * fallback when Actions expires; digest agreement alone does not identify its producer. */
export async function verifyHostedAdvisoryReceipt({
  client,
  checkpoint,
  runId,
  attempt,
  controller,
  workflow,
  entries,
  now = Date.now(),
  npmCli,
}) {
  const proofKey = "audit-origin-" + runId + "-" + attempt + ".json";
  const stored = checkpoint?.files.get(proofKey);
  const saved = stored && JSON.parse(stored);
  const expected = { workflow, controller, runId, attempt };
  const run = await originalOrSaved(
    () => client.read("/actions/runs/" + runId),
    saved?.run,
  );
  assertProtectedReleaseRun(run, expected);
  const latest = await originalOrSaved(
    () => releaseJobs(client, runId),
    saved && [saved.job],
  );
  const current = checkedNativeJob(latest, jobName, run);
  const prefix = "release-advisory-" + runId + "-";
  const inventory = await originalOrSaved(
    () => readRunArtifacts((path) => client.read(path), Number(runId)),
    saved && [saved.artifact],
  );
  const candidates = new Map(inventory.map((a) => [a.id, a]));
  if (saved?.artifact && !candidates.has(saved.artifact.id))
    candidates.set(saved.artifact.id, saved.artifact);
  const steps = (current.steps ?? []).filter((s) => s.name === uploadStep);
  assert.equal(steps.length, 1);
  const [upload] = steps;
  const matches = [...candidates.values()].filter((a) => {
    const id = artifactProducingAttempt(a.name, prefix, {
      run: Number(runId),
      attempt: Number(attempt),
      legacy: false,
    });
    return (
      id !== null &&
      Date.parse(upload.started_at) <= Date.parse(a.created_at) &&
      Date.parse(a.created_at) <= Date.parse(upload.completed_at)
    );
  });
  assert.equal(
    matches.length,
    1,
    "Missing or ambiguous original advisory receipt",
  );
  const [pointer] = matches;
  const originalAttempt = artifactProducingAttempt(pointer.name, prefix, {
    run: Number(runId),
    attempt: Number(attempt),
    legacy: false,
  });
  const native = await originalOrSaved(
    () => releaseJobs(client, runId, originalAttempt),
    saved && [saved.job],
  );
  const job = checkedNativeJob(native, jobName, run);
  assert.equal(job.run_attempt, originalAttempt);
  assert.ok(
    sameJobExecution(job, current),
    "Advisory job changed between attempts",
  );
  const logical = prefix + originalAttempt;
  const artifact = await originalOrSaved(
    () => client.read("/actions/artifacts/" + pointer.id),
    saved?.artifact,
  );
  for (const other of [pointer, saved?.artifact].filter(Boolean)) {
    assert.deepEqual(
      [artifact.id, artifact.name, artifact.size_in_bytes, artifact.digest],
      [other.id, other.name, other.size_in_bytes, other.digest],
    );
  }
  assertTimedUpload(artifact, run, job, logical, uploadStep);
  assert.ok(artifact.size_in_bytes <= maxReceiptZip);
  const retained = checkpoint?.files.get("artifact-" + artifact.id + ".zip");
  const zip = artifact.expired
    ? retained
    : await originalOrSaved(
        () => downloadReleaseArtifact(client, artifact, maxReceiptZip),
        retained,
      );
  assert.ok(
    Buffer.isBuffer(zip) &&
      zip.length === artifact.size_in_bytes &&
      "sha256:" + hash(zip) === artifact.digest,
    "Missing or changed original advisory ZIP",
  );
  const members = readZipArchiveFilesWith(zip, {
    crc32,
    expectedNames: new Set(auditReceiptFilenames),
    maximumUncompressedBytes: maxReceiptZip,
  });
  assert.equal(members.length, 2);
  const statement = evidence(members, "receipt.json"),
    signature = evidence(members, "receipt.sigstore.json");
  const descriptor = {
    jobId: job.id,
    artifactId: artifact.id,
    artifactDigest: artifact.digest,
    statementSha256: hash(statement),
    signatureSha256: hash(signature),
  };
  const decision = await verifyArchivedAdvisoryReceipt({
    statement,
    signature,
    descriptor,
    job,
    ...expected,
    entries,
    now,
    npmCli,
  });
  return {
    statement,
    signature,
    descriptor,
    decision,
    job,
    verificationTime: now,
    origin: { run, job, artifact },
  };
}
