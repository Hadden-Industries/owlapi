/** Bounded service provenance for a build product. This never reuses oracle verdicts. */
import { isDeepStrictEqual } from "node:util";
import {
  CI_JOB_NAMES,
  assertQualificationRecord,
} from "./ci-qualification.mjs";
import { CI_WORKFLOW } from "./ci-verification.mjs";
import { JAVA_REFERENCE_POLICY } from "./java-reference-state.mjs";
import { evidenceFingerprint } from "./ci-check-coverage.mjs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
export { JAVA_REFERENCE_POLICY } from "./java-reference-state.mjs";

const integer = (value) => Number.isSafeInteger(value) && value > 0;
const sha = (value) =>
  typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
const hash = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const serviceDigest = (value) =>
  typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
const reject = (code) => {
  throw Object.assign(new Error(code), { code });
};
const fact = (condition, code) => {
  if (!condition) reject(code);
};
const sameRepository = (repository) =>
  repository?.id === JAVA_REFERENCE_POLICY.repositoryId &&
  repository.full_name === JAVA_REFERENCE_POLICY.repository;

export const referenceArtifactName = (key, runId, attempt) => {
  fact(
    hash(key) && integer(runId) && integer(attempt),
    "INVALID_REFERENCE_IDENTITY",
  );
  return `java-reference-${key}-${runId}-${attempt}`;
};

function producerRun(run) {
  fact(
    integer(run?.id) &&
      integer(run.workflow_id) &&
      integer(run.run_attempt) &&
      sha(run.head_sha) &&
      run.event === "push" &&
      run.head_branch === "main" &&
      run.path === CI_WORKFLOW &&
      sameRepository(run.repository) &&
      sameRepository(run.head_repository) &&
      run.status === "completed" &&
      run.conclusion === "success",
    "UNQUALIFIED_PRODUCER",
  );
}

function completeInventory(inventory, field) {
  fact(
    Number.isSafeInteger(inventory?.total_count) &&
      inventory.total_count >= 0 &&
      inventory.total_count <= JAVA_REFERENCE_POLICY.inventoryLimit &&
      Array.isArray(inventory[field]) &&
      inventory[field].length === inventory.total_count,
    "INCOMPLETE_REFERENCE_INVENTORY",
  );
  return inventory[field];
}

function artifactIdentity(artifact, run, key, now, qualification = false) {
  fact(
    integer(artifact?.id) &&
      artifact.name ===
        (qualification
          ? `ci-main-qualification-${run.id}-${run.run_attempt}`
          : referenceArtifactName(key, run.id, run.run_attempt)) &&
      artifact.expired === false &&
      serviceDigest(artifact.digest) &&
      Number.isSafeInteger(artifact.size_in_bytes) &&
      artifact.size_in_bytes > 0 &&
      artifact.size_in_bytes <=
        (qualification ? 64 * 1024 : JAVA_REFERENCE_POLICY.payloadLimit) &&
      Number.isFinite(Date.parse(artifact.created_at)) &&
      Date.parse(artifact.created_at) <= now &&
      now < Date.parse(artifact.expires_at) &&
      Date.parse(artifact.expires_at) <=
        Date.parse(artifact.created_at) +
          JAVA_REFERENCE_POLICY.retentionDays * 86_400_000 +
          60_000 &&
      artifact.workflow_run?.id === run.id &&
      artifact.workflow_run.repository_id ===
        JAVA_REFERENCE_POLICY.repositoryId &&
      artifact.workflow_run.head_repository_id ===
        JAVA_REFERENCE_POLICY.repositoryId &&
      artifact.workflow_run.head_sha === run.head_sha &&
      artifact.workflow_run.head_branch === "main",
    "UNQUALIFIED_REFERENCE_ARTIFACT",
  );
}

function fullProducerJobs(inventory, run) {
  const jobs = completeInventory(inventory, "jobs");
  for (const name of [CI_JOB_NAMES.source_node_24, CI_JOB_NAMES.required]) {
    const matches = jobs.filter((job) => job.name === name);
    fact(
      matches.length === 1 &&
        integer(matches[0].id) &&
        matches[0].run_id === run.id &&
        matches[0].run_attempt === run.run_attempt &&
        matches[0].status === "completed" &&
        matches[0].conclusion === "success",
      "PRODUCER_DID_NOT_EXECUTE_FULL_JAVA",
    );
  }
}

/** The exact captured base's main record is a bounded discovery index, never
 * authority for bytes or behavior. Its direct producer is authenticated again. */
export async function selectReferenceIndex({
  read,
  baseCommit,
  now = Date.now(),
}) {
  fact(sha(baseCommit), "INVALID_REFERENCE_BASE");
  const runs = completeInventory(
    await read(
      `/actions/workflows/ci.yml/runs?event=push&head_sha=${baseCommit}&per_page=100`,
    ),
    "workflow_runs",
  );
  const run = [...runs].sort((a, b) => b.id - a.id)[0];
  producerRun(run);
  fact(run.head_sha === baseCommit, "UNQUALIFIED_REFERENCE_INDEX");
  const artifacts = completeInventory(
    await read(`/actions/runs/${run.id}/artifacts?per_page=100`),
    "artifacts",
  );
  const matches = artifacts.filter(
    (artifact) =>
      artifact.name === `ci-main-qualification-${run.id}-${run.run_attempt}`,
  );
  fact(matches.length === 1, "UNQUALIFIED_REFERENCE_INDEX");
  artifactIdentity(matches[0], run, null, now, true);
  return { available: true, baseCommit, run, qualification: matches[0] };
}

export function referenceProducerHint({ index, record, keySha256 }) {
  fact(
    record?.role === "MAIN" &&
      record.runId === index.run.id &&
      record.runAttempt === index.run.run_attempt &&
      record.repository === JAVA_REFERENCE_POLICY.repository &&
      record.repositoryId === JAVA_REFERENCE_POLICY.repositoryId &&
      record.snapshot?.commit === index.baseCommit &&
      record.javaReference?.inputs?.keySha256 === keySha256,
    "UNQUALIFIED_REFERENCE_INDEX",
  );
  const reference = record.javaReference;
  const pointer = reference.publication
    ? {
        role: "MAIN",
        runId: index.run.id,
        runAttempt: index.run.run_attempt,
        commit: index.baseCommit,
        artifactId: reference.publication.artifactId,
        artifactDigest: reference.publication.artifactDigest,
        qualificationId: index.qualification.id,
        qualificationDigest: index.qualification.digest,
      }
    : reference.producer;
  fact(
    pointer?.role === "MAIN" &&
      integer(pointer.runId) &&
      integer(pointer.runAttempt) &&
      sha(pointer.commit) &&
      integer(pointer.artifactId) &&
      serviceDigest(pointer.artifactDigest) &&
      integer(pointer.qualificationId) &&
      serviceDigest(pointer.qualificationDigest) &&
      pointer.artifactId !== pointer.qualificationId,
    "UNQUALIFIED_REFERENCE_INDEX",
  );
  return pointer;
}

async function discoverIndexedProduct({ read, pointer, keySha256, now }) {
  const run = await read(`/actions/runs/${pointer.runId}`);
  producerRun(run);
  fact(
    run.run_attempt === pointer.runAttempt && run.head_sha === pointer.commit,
    "PRODUCER_ATTEMPT_CHANGED",
  );
  const artifacts = completeInventory(
    await read(`/actions/runs/${run.id}/artifacts?per_page=100`),
    "artifacts",
  );
  const exact = (id, digest, qualification) => {
    const matches = artifacts.filter((artifact) => artifact.id === id);
    fact(
      matches.length === 1 && matches[0].digest === digest,
      "UNQUALIFIED_REFERENCE_ARTIFACT",
    );
    artifactIdentity(matches[0], run, keySha256, now, qualification);
    return matches[0];
  };
  const artifact = exact(pointer.artifactId, pointer.artifactDigest, false);
  const qualification = exact(
    pointer.qualificationId,
    pointer.qualificationDigest,
    true,
  );
  fullProducerJobs(
    await read(
      `/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
    ),
    run,
  );
  return { available: true, keySha256, run, artifact, qualification };
}

/** A read callback must use the existing bounded token-scoped GitHub reader.
 * Only the fixed newest window in a fixed retention interval is inspected.
 * A name is a lookup hint; independent run/jobs/artifact/service checks establish
 * eligibility. The separately downloaded main qualification binds manifest bytes.
 */
export async function discoverReferenceArtifact({
  read,
  keySha256,
  producerHint = null,
  now = Date.now(),
}) {
  fact(hash(keySha256) && Number.isFinite(now), "INVALID_REFERENCE_KEY");
  if (producerHint !== null) {
    try {
      return await discoverIndexedProduct({
        read,
        pointer: producerHint,
        keySha256,
        now,
      });
    } catch {
      // An expired/stale discovery hint is not inherited authority. The fixed
      // recent window may contain a concurrent replacement; otherwise build.
    }
  }
  const since = encodeURIComponent(
    new Date(
      now - JAVA_REFERENCE_POLICY.retentionDays * 86_400_000,
    ).toISOString(),
  );
  const response = await read(
    `/actions/workflows/ci.yml/runs?branch=main&event=push&created=%3E%3D${since}&per_page=100`,
  );
  const runs = completeInventory(response, "workflow_runs");
  fact(
    runs.every(
      (run) => integer(run.id) && Number.isFinite(Date.parse(run.created_at)),
    ) && new Set(runs.map((run) => run.id)).size === runs.length,
    "AMBIGUOUS_PRODUCER_WINDOW",
  );
  const window = [...runs]
    .sort(
      (a, b) =>
        Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id,
    )
    .slice(0, JAVA_REFERENCE_POLICY.runWindow);
  for (const listed of window) {
    // Unfinished/failed attempts are never producers. An older attempt of that run
    // is never queried; other independently successful runs may remain usable.
    if (listed.status !== "completed" || listed.conclusion !== "success")
      continue;
    producerRun(listed);
    const current = await read(`/actions/runs/${listed.id}`);
    producerRun(current);
    fact(
      current.run_attempt === listed.run_attempt &&
        current.head_sha === listed.head_sha &&
        current.workflow_id === listed.workflow_id,
      "PRODUCER_ATTEMPT_CHANGED",
    );
    const artifacts = completeInventory(
      await read(`/actions/runs/${current.id}/artifacts?per_page=100`),
      "artifacts",
    );
    const matches = artifacts.filter(
      (artifact) =>
        artifact.name ===
        referenceArtifactName(keySha256, current.id, current.run_attempt),
    );
    if (!matches.length) continue;
    fact(matches.length === 1, "AMBIGUOUS_REFERENCE_ARTIFACT");
    artifactIdentity(matches[0], current, keySha256, now);
    fullProducerJobs(
      await read(
        `/actions/runs/${current.id}/attempts/${current.run_attempt}/jobs?per_page=100`,
      ),
      current,
    );
    const qualifications = artifacts.filter(
      (artifact) =>
        artifact.name ===
        `ci-main-qualification-${current.id}-${current.run_attempt}`,
    );
    fact(
      qualifications.length === 1 &&
        integer(qualifications[0].id) &&
        qualifications[0].expired === false &&
        serviceDigest(qualifications[0].digest) &&
        qualifications[0].size_in_bytes > 0 &&
        qualifications[0].size_in_bytes <= 64 * 1024,
      "MAIN_REFERENCE_QUALIFICATION_UNAVAILABLE",
    );
    artifactIdentity(qualifications[0], current, keySha256, now, true);
    return {
      available: true,
      keySha256,
      run: current,
      artifact: matches[0],
      qualification: qualifications[0],
    };
  }
  return {
    available: false,
    reason: "NO_TRUSTED_REFERENCE_IN_WINDOW",
    keySha256,
  };
}

/** Service failure is optional only at this discovery boundary. Native fresh
 * compilation/smoke/oracle errors are outside this catch and must fail qualification.
 */
export async function selectReferenceArtifact(options) {
  try {
    return await discoverReferenceArtifact(options);
  } catch (error) {
    return {
      available: false,
      keySha256: options.keySha256,
      reason:
        typeof error.code === "string" &&
        /^(INVALID_REFERENCE_[A-Z_]+|INCOMPLETE_REFERENCE_INVENTORY|AMBIGUOUS_[A-Z_]+|UNQUALIFIED_[A-Z_]+|PRODUCER_[A-Z_]+|MAIN_REFERENCE_QUALIFICATION_UNAVAILABLE|LOOKUP_LIMIT_EXCEEDED)$/u.test(
          error.code,
        )
          ? error.code
          : "REFERENCE_LOOKUP_UNAVAILABLE",
    };
  }
}

/** Call after both official downloads, immediately before manifest/file admission. */
export async function rereadReferenceArtifact({
  read,
  selection,
  now = Date.now(),
}) {
  fact(selection?.available === true, "NO_SELECTED_REFERENCE");
  const run = await read(`/actions/runs/${selection.run.id}`);
  producerRun(run);
  fact(
    run.id === selection.run.id &&
      run.run_attempt === selection.run.run_attempt &&
      run.head_sha === selection.run.head_sha &&
      run.workflow_id === selection.run.workflow_id,
    "PRODUCER_ATTEMPT_CHANGED",
  );
  const artifacts = completeInventory(
    await read(`/actions/runs/${run.id}/artifacts?per_page=100`),
    "artifacts",
  );
  for (const selected of [selection.artifact, selection.qualification]) {
    const current = artifacts.filter((artifact) => artifact.id === selected.id);
    fact(
      current.length === 1 && isDeepStrictEqual(current[0], selected),
      "REFERENCE_ARTIFACT_CHANGED",
    );
  }
  artifactIdentity(selection.artifact, run, selection.keySha256, now);
  artifactIdentity(
    selection.qualification,
    run,
    selection.keySha256,
    now,
    true,
  );
  fullProducerJobs(
    await read(
      `/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
    ),
    run,
  );
  return selection;
}

/** Independently read the native Git tree entry for the producer's workflow.
 * The known three-level path needs no recursive repository search or trust in
 * a downloaded snapshot claim. Unsupported/incomplete native trees reject reuse. */
async function producerWorkflow(read, commit, expectedTree) {
  const nativeCommit = await read(`/git/commits/${commit}`);
  fact(
    nativeCommit.sha === commit && nativeCommit.tree?.sha === expectedTree,
    "PRODUCER_SOURCE_IDENTITY_MISMATCH",
  );
  let tree = expectedTree;
  for (const [index, path] of [".github", "workflows", "ci.yml"].entries()) {
    const observed = await read(`/git/trees/${tree}`);
    fact(
      observed.sha === tree &&
        observed.truncated === false &&
        Array.isArray(observed.tree) &&
        observed.tree.length <= 100 &&
        new Set(observed.tree.map((entry) => entry.path)).size ===
          observed.tree.length,
      "INCOMPLETE_PRODUCER_SOURCE_TREE",
    );
    const matches = observed.tree.filter((entry) => entry.path === path);
    fact(
      matches.length === 1 &&
        sha(matches[0].sha) &&
        matches[0].type === (index === 2 ? "blob" : "tree") &&
        matches[0].mode === (index === 2 ? "100644" : "040000"),
      "PRODUCER_WORKFLOW_MISMATCH",
    );
    tree = matches[0].sha;
  }
  return tree;
}

/** Call only after both official digest-error downloads and a native service
 * reread. A separate main qualification binds manifest/inventory bytes; neither
 * the bundle's checksums nor the lookup name can authenticate its producer. */
export async function verifyReferenceQualification({
  read,
  selection,
  record,
  inputRecord,
}) {
  fact(JAVA_REFERENCE_POLICY.enabled, "REFERENCE_ACTIVATION_NOT_ACCEPTED");
  assertQualificationRecord(record);
  const run = selection.run;
  const reference = record.javaReference;
  const publication = reference?.publication;
  fact(
    record.role === "MAIN" &&
      record.mode === "FULL" &&
      record.source === null &&
      record.repository === JAVA_REFERENCE_POLICY.repository &&
      record.repositoryId === JAVA_REFERENCE_POLICY.repositoryId &&
      record.runId === run.id &&
      record.runAttempt === run.run_attempt &&
      record.snapshot.commit === run.head_sha &&
      reference?.materialization === "FRESH" &&
      reference.execution.runAttempt === run.run_attempt &&
      reference.inputs.keySha256 === inputRecord.keySha256 &&
      selection.keySha256 === inputRecord.keySha256 &&
      reference.inputs.runtimeGraphSha256 ===
        inputRecord.semantic.runtimeGraphSha256 &&
      reference.inputs.hostSha256 ===
        evidenceFingerprint(inputRecord.semantic.host) &&
      publication?.artifactId === selection.artifact.id &&
      publication.artifactDigest === selection.artifact.digest &&
      publication.rightsSha256 === JAVA_REFERENCE_POLICY.rightsSha256,
    "MAIN_REFERENCE_BINDING_MISMATCH",
  );
  const bytes = readFileSync(
    new URL("../.github/workflows/ci.yml", import.meta.url),
  );
  const expectedWorkflow = createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
  fact(
    record.snapshot.workflow === expectedWorkflow &&
      (await producerWorkflow(read, run.head_sha, record.snapshot.tree)) ===
        expectedWorkflow,
    "PRODUCER_WORKFLOW_MISMATCH",
  );
  const provenance = {
    repository: record.repository,
    repositoryId: record.repositoryId,
    workflow: CI_WORKFLOW,
    commit: record.snapshot.commit,
    tree: record.snapshot.tree,
    runId: run.id,
    runAttempt: run.run_attempt,
    event: "push",
    ref: "refs/heads/main",
    createdAt: publication.createdAt,
  };
  fact(
    evidenceFingerprint(provenance) === publication.provenanceSha256 &&
      Date.parse(publication.createdAt) >= Date.parse(run.created_at) &&
      Date.parse(publication.createdAt) <=
        Date.parse(selection.artifact.created_at) &&
      Date.parse(record.recordedAt) >=
        Date.parse(selection.artifact.created_at),
    "PRODUCER_PROVENANCE_MISMATCH",
  );
  // Expected producer input-record bytes may differ in formatting from the local
  // native record, but its independently observed key and raw producer digest are
  // both mandatory. The bundle verifier reconstructs its complete semantic record.
  return {
    sourceCommit: inputRecord.semantic.sourceCommit,
    sourceTree: inputRecord.semantic.sourceTree,
    inputKeySha256: inputRecord.keySha256,
    inputRecordSha256: reference.inputs.inputRecordSha256,
    runtimeGraphSha256: inputRecord.semantic.runtimeGraphSha256,
    rightsSha256: publication.rightsSha256,
    manifestSha256: publication.manifestSha256,
    inventorySha256: publication.inventorySha256,
    provenanceSha256: publication.provenanceSha256,
  };
}

/** Seed hints are reevaluated against current verified availability, never sticky.
 * Availability may change after the PR, including a concurrent successful seed.
 */
export const needsFullMainSeed = ({
  referenceEnabled,
  prBuiltFresh,
  availableNow,
}) =>
  referenceEnabled === true && prBuiltFresh === true && availableNow !== true;
