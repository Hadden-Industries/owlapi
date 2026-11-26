import { PACKAGE_FILE_STEM, REPOSITORY } from "./release-identity.mjs";
import {
  matchesLogicalArtifact,
  artifactProducingAttempt,
} from "../tooling/artifact-transport/identity.mjs";
/** Evidence reuse is an optimization. Unprovable equivalence always requires full CI. */
import { isDeepStrictEqual } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { sameJobExecution } from "./github-job-execution.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";
import { WINDOWS } from "./windows-runner.mjs";
import { MACOS } from "./macos-runner.mjs";
import { captureConsumerSources } from "./consumer-source-snapshot.mjs";
import { javaReferenceFromNeeds } from "./java-reference-state.mjs";
import {
  requireSuccessfulJobs,
  requireCiJobs,
} from "./require-job-success.mjs";
import {
  CI_JOB_NAMES,
  FROZEN_RUNTIME_MATRIX,
  hostedCiJobNames,
  CHECK_JOBS,
  QUALIFICATION_POLICY_SHA256,
  assertQualificationRecord,
  createQualificationChecks,
  coverageFromNeeds,
  qualifiedSourceFromOutputs,
  validQualificationHost,
  compatibleQualificationHosts,
} from "./ci-qualification.mjs";

export const CI_WORKFLOW = ".github/workflows/ci.yml";

const sha = (value) =>
  typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
const id = (value) => Number.isSafeInteger(value) && value > 0;
const digest = (value) =>
  typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
const requireFact = (condition, message) => {
  if (!condition) throw new Error(message);
};
const receiptName = (run) => `ci-verification-${run.id}-${run.run_attempt}`;
const sameRepository = (observed, context) =>
  observed?.id === context.repositoryId &&
  observed?.full_name === context.repository;

// Both artifact acknowledgements come from the actual producer job.
function originalPackageProof(outputs) {
  const { proof_id: artifactId, proof_digest: uploadDigest } = outputs;
  const artifact = { id: Number(artifactId), digest: `sha256:${uploadDigest}` };
  requireFact(
    id(artifact.id) && digest(artifact.digest),
    "Invalid package proof acknowledgement.",
  );
  return { packageProof: artifact };
}

export const hostedIdentity = (environment, nodeVersion) => ({
  os: environment.RUNNER_OS,
  architecture: environment.RUNNER_ARCH,
  image: environment.ImageOS,
  imageVersion: environment.ImageVersion,
  node: nodeVersion,
});

const validHost = validQualificationHost;

/** Only native registration lag is waitable. The repository reader also owns
 * the shared request/deadline budget for the entire proof operation.
 */
export const readJobInventory = async ({
  read,
  run,
  attempt,
  required = hostedCiJobNames(),
  conclusion = () => "success",
  label = "Source job inventory",
  mode = "FULL",
  observation: { now = Date.now, sleep = delay, maxObservations = 16 } = {},
}) => {
  requireFact(
    Number.isSafeInteger(maxObservations) &&
      maxObservations > 0 &&
      maxObservations <= 16,
    "Invalid job observation budget.",
  );
  const deadline = now() + 30_000;
  const names = hostedCiJobNames(mode);
  const pendingStatuses = [
    "queued",
    "in_progress",
    "waiting",
    "pending",
    "requested",
  ];
  const conclusions = [
    "success",
    "failure",
    "cancelled",
    "skipped",
    "neutral",
    "timed_out",
    "action_required",
    "stale",
  ];
  const path =
    attempt === undefined
      ? `/actions/runs/${run.id}/jobs?filter=latest&per_page=100`
      : `/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=100`;
  for (let count = 0; count < maxObservations; count++) {
    requireFact(now() < deadline, `${label} registration deadline elapsed.`);
    const value = await read(path, { budgetMs: deadline - now() });
    requireFact(now() < deadline, `${label} registration deadline elapsed.`);
    requireFact(
      Array.isArray(value?.jobs) &&
        value.jobs.length <= names.length &&
        value.total_count === value.jobs.length &&
        new Set(value.jobs.map((job) => job?.name)).size ===
          value.jobs.length &&
        value.jobs.every(
          (job) =>
            job &&
            names.includes(job.name) &&
            job.run_id === run.id &&
            job.head_sha === run.head_sha &&
            id(job.run_attempt) &&
            (attempt === undefined
              ? job.run_attempt <= run.run_attempt
              : job.run_attempt === attempt) &&
            (job.status === "completed"
              ? conclusions.includes(job.conclusion)
              : pendingStatuses.includes(job.status) &&
                job.conclusion === null),
        ),
      `${label} is malformed, duplicated or foreign.`,
    );
    let pending = false;
    for (const name of required) {
      const job = value.jobs.find((item) => item.name === name);
      if (!job || job.status !== "completed") pending = true;
      else
        requireFact(
          job.conclusion === conclusion(name),
          `${label} contains a failed or skipped required check.`,
        );
    }
    if (!pending) return value;
    requireFact(
      count + 1 < maxObservations && now() + 2000 < deadline,
      `${label} remains incomplete after bounded registration observation.`,
    );
    await sleep(2000);
  }
};

export const createVerificationReceipt = ({
  context,
  needs,
  now = Date.now(),
}) => {
  requireSuccessfulJobs("ci", needs);
  const { event, snapshot } = context;
  requireFact(
    context.eventName === "pull_request" &&
      event.pull_request?.base?.ref === "main" &&
      id(event.number) &&
      context.ref === `refs/pull/${event.number}/merge` &&
      snapshot.commit === context.sha &&
      sha(snapshot.tree) &&
      sha(snapshot.workflow) &&
      sameRepository(event.pull_request.base.repo, context) &&
      sameRepository(event.pull_request.head.repo, context) &&
      isDeepStrictEqual(snapshot.parents, [
        event.pull_request.base.sha,
        event.pull_request.head.sha,
      ]) &&
      snapshot.parents.every(sha) &&
      id(context.runId) &&
      id(context.runAttempt) &&
      validHost(context.host),
    "Receipt requires an exact same-repository PR merge checkout and hosted identity.",
  );
  const candidate = {
    id: Number(needs.candidate.outputs.artifact_id),
    digest: `sha256:${needs.candidate.outputs.artifact_digest}`,
  };
  requireFact(
    id(candidate.id) && digest(candidate.digest),
    "Candidate artifact identity is absent.",
  );
  const evidence = coverageFromNeeds(needs, {
    runId: context.runId,
    runAttempt: context.runAttempt,
    commit: snapshot.commit,
  });
  return assertQualificationRecord({
    schemaVersion: 6,
    role: "PR",
    mode: "FULL",
    sourceMode: "FULL",
    repository: context.repository,
    repositoryId: context.repositoryId,
    runId: context.runId,
    runAttempt: context.runAttempt,
    pullRequest: event.number,
    recordedAt: new Date(now).toISOString(),
    snapshot,
    host: context.host,
    jobs: CI_JOB_NAMES,
    candidate,
    ...originalPackageProof(needs.candidate.outputs),
    policySha256: QUALIFICATION_POLICY_SHA256,
    checks: createQualificationChecks({ context, evidence, role: "PR" }),
    source: null,
    javaReference: javaReferenceFromNeeds(needs, {
      role: "PR",
      mode: "FULL",
      runId: context.runId,
      runAttempt: context.runAttempt,
      commit: snapshot.commit,
    }),
  });
};

/** Seed exact landed-main lineage after fresh FULL execution or verified ordinary reuse. */
export const createMainQualification = ({
  context,
  needs,
  now = Date.now(),
}) => {
  const accepted = requireCiJobs(needs, {
    eventName: context.eventName,
    ref: context.ref,
    runId: context.runId,
    runAttempt: context.runAttempt,
    sha: context.sha,
  });
  requireFact(
    ((context.eventName === "push" &&
      context.event.ref === context.ref &&
      context.event.after === context.sha &&
      context.event.deleted === false &&
      context.event.forced === false) ||
      (context.eventName === "workflow_dispatch" &&
        context.event.inputs?.subject === context.sha &&
        accepted.mode === "FULL")) &&
      context.ref === "refs/heads/main" &&
      sameRepository(context.event.repository, context) &&
      context.event.repository.default_branch === "main" &&
      context.snapshot.commit === context.sha &&
      validHost(context.host),
    "Main qualification requires the exact ordinary main checkout.",
  );
  const origin =
    accepted.mode === "REUSED"
      ? qualifiedSourceFromOutputs(accepted.source)
      : null;
  if (origin)
    requireFact(
      compatibleQualificationHosts(origin.host, context.host) &&
        origin.snapshot.tree === context.snapshot.tree &&
        origin.snapshot.workflow === context.snapshot.workflow &&
        isDeepStrictEqual(origin.snapshot.parents, context.snapshot.parents),
      "Main record no longer matches verified original inputs.",
    );
  const evidence = origin
    ? Object.fromEntries(
        Object.entries(origin.checks).map(([check, value]) => [
          check,
          value.evidence,
        ]),
      )
    : coverageFromNeeds(needs, {
        runId: context.runId,
        runAttempt: context.runAttempt,
        commit: context.snapshot.commit,
      });
  const source = origin
    ? {
        role: "PR",
        runId: origin.runId,
        runAttempt: origin.runAttempt,
        commit: origin.snapshot.commit,
        host: origin.host,
        receipt: {
          id: Number(accepted.source.source_receipt_id),
          digest: accepted.source.source_receipt_digest,
        },
      }
    : null;
  const candidate = origin?.candidate ?? {
    id: Number(needs.candidate.outputs.artifact_id),
    digest: `sha256:${needs.candidate.outputs.artifact_digest}`,
  };
  return assertQualificationRecord({
    schemaVersion: 6,
    role: "MAIN",
    mode: accepted.mode,
    sourceMode: "FULL",
    repository: context.repository,
    repositoryId: context.repositoryId,
    runId: context.runId,
    runAttempt: context.runAttempt,
    pullRequest: null,
    recordedAt: new Date(now).toISOString(),
    snapshot: context.snapshot,
    host: context.host,
    jobs: CI_JOB_NAMES,
    candidate,
    ...(origin
      ? { packageProof: origin.packageProof }
      : originalPackageProof(needs.candidate.outputs)),
    policySha256: QUALIFICATION_POLICY_SHA256,
    checks: createQualificationChecks({
      context,
      evidence,
      role: "MAIN",
      original: source,
    }),
    source,
    javaReference: origin
      ? origin.javaReference === null
        ? null
        : {
            ...origin.javaReference,
            seedRequested: false,
            publication: null,
          }
      : javaReferenceFromNeeds(needs, {
          role: "MAIN",
          mode: "FULL",
          runId: context.runId,
          runAttempt: context.runAttempt,
          commit: context.snapshot.commit,
        }),
  });
};

const assertPush = (context) => {
  const { event, snapshot } = context;
  requireFact(
    context.eventName === "push" &&
      context.ref === "refs/heads/main" &&
      event.ref === context.ref &&
      event.deleted === false &&
      event.forced === false &&
      event.created === false &&
      event.after === context.sha &&
      snapshot.commit === context.sha &&
      sameRepository(event.repository, context) &&
      event.repository.default_branch === "main" &&
      snapshot.parents[0] === event.before &&
      sha(snapshot.commit),
    "Not an eligible single normal main merge.",
  );
};

const assertOrdinaryMerge = ({ sha: landed, snapshot, host }) =>
  requireFact(
    sha(landed) &&
      snapshot.commit === landed &&
      sha(snapshot.tree) &&
      sha(snapshot.workflow) &&
      snapshot.parents.length === 2 &&
      snapshot.parents.every(sha) &&
      validHost(host),
    "Not an eligible single normal main merge.",
  );

const assertRun = (run, context, pr, now) => {
  requireFact(
    id(run.id) &&
      id(run.run_attempt) &&
      run.event === "pull_request" &&
      run.path === CI_WORKFLOW &&
      run.status === "completed" &&
      run.conclusion === "success" &&
      run.head_sha === pr.head.sha &&
      sameRepository(run.repository, context) &&
      sameRepository(run.head_repository, context) &&
      Date.parse(run.created_at) <= now,
    "Source workflow has invalid timing, is incomplete, unsuccessful or from a different source.",
  );
};

const assertArtifact = (artifact, run, context, now) => {
  requireFact(
    id(artifact?.id) &&
      artifact.expired === false &&
      Date.parse(artifact.expires_at) > now &&
      digest(artifact.digest) &&
      artifact.workflow_run?.id === run.id &&
      artifact.workflow_run.repository_id === context.repositoryId &&
      artifact.workflow_run.head_repository_id === context.repositoryId &&
      artifact.workflow_run.head_sha === run.head_sha,
    "Artifact is absent, expired or belongs to another source.",
  );
};

/** The service is injected; no untrusted URL from a response is ever followed. */
export const selectVerificationProof = async ({
  context,
  read,
  now = Date.now(),
}) => {
  assertPush(context);
  return selectMergedProof({ context, read, now });
};

async function selectMergedProof({ context, read, now }) {
  assertOrdinaryMerge(context);
  const prs = await read(`/commits/${context.sha}/pulls?per_page=100`);
  requireFact(
    Array.isArray(prs) && prs.length < 100,
    "PR lookup is incomplete.",
  );
  // API 2026-03-10 omits merge_commit_sha. The endpoint associates PRs with
  // this exact landed commit; bind the selected merged PR to both Git parents.
  const matching = prs.filter(
    (pr) =>
      pr.merged_at &&
      pr.state === "closed" &&
      pr.base?.ref === "main" &&
      pr.base.sha === context.snapshot.parents[0] &&
      sameRepository(pr.base.repo, context) &&
      sameRepository(pr.head?.repo, context) &&
      pr.head.sha === context.snapshot.parents[1],
  );
  requireFact(
    matching.length === 1 && id(matching[0].number),
    "No unique merged PR matches this integration.",
  );
  const pr = matching[0];
  const runs = await read(
    `/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pr.head.sha}&per_page=100`,
  );
  requireFact(
    Array.isArray(runs.workflow_runs) &&
      runs.total_count === runs.workflow_runs.length &&
      runs.total_count <= 100,
    "Workflow lookup is incomplete.",
  );
  const candidates = [...runs.workflow_runs].sort(
    (left, right) => right.id - left.id,
  );
  requireFact(candidates.length > 0, "No PR workflow was found.");
  // Never look past a newer failed or pending run to reuse an older success.
  const run = candidates[0];
  assertRun(run, context, pr, now);
  const artifacts = await read(
    `/actions/runs/${run.id}/artifacts?per_page=100`,
  );
  requireFact(
    Array.isArray(artifacts.artifacts) &&
      artifacts.total_count === artifacts.artifacts.length &&
      artifacts.total_count <= 100,
    "Artifact lookup is incomplete.",
  );
  const proofs = artifacts.artifacts.filter((artifact) =>
    matchesLogicalArtifact(artifact.name, receiptName(run), {
      run: run.id,
      attempt: run.run_attempt,
      legacy: true,
    }),
  );
  requireFact(
    proofs.length === 1,
    "The latest successful PR run has no unique receipt.",
  );
  const artifact = proofs[0];
  assertArtifact(artifact, run, context, now);
  requireFact(
    artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 64 * 1024,
    "Receipt archive is outside its size bound.",
  );
  return { pr, run, artifact };
}

export const verifyIntegrationProof = async (options) => {
  assertPush(options.context);
  return (await verifyMergedProof(options)).outputs;
};

async function verifyMergedProof({
  context,
  selection,
  receipt,
  read,
  now = Date.now(),
  captureSources = captureConsumerSources,
  jobObservation,
  releaseAdmission = false,
}) {
  assertOrdinaryMerge(context);
  const { pr, artifact } = selection;
  // Re-read mutable run state after download, including its latest attempt.
  const run = await read(`/actions/runs/${selection.run.id}`);
  assertRun(run, context, pr, now);
  requireFact(
    run.run_attempt === selection.run.run_attempt,
    "Source workflow was rerun during verification.",
  );
  const currentArtifact = await read(`/actions/artifacts/${artifact.id}`);
  assertArtifact(currentArtifact, run, context, now);
  requireFact(
    currentArtifact.digest === artifact.digest &&
      currentArtifact.name === artifact.name &&
      matchesLogicalArtifact(currentArtifact.name, receiptName(run), {
        run: run.id,
        attempt: run.run_attempt,
        legacy: true,
      }),
    "Receipt artifact identity changed.",
  );
  const recordedAt = Date.parse(receipt.recordedAt);
  assertQualificationRecord(receipt);
  requireFact(
    isDeepStrictEqual(
      receipt.checks.owl_contract.evidence.consumerSources,
      await captureSources(),
    ),
    "Consumer source pins differ; fresh qualification is required.",
  );
  requireFact(
    receipt.schemaVersion === 6 &&
      receipt.role === "PR" &&
      receipt.mode === "FULL" &&
      receipt.repository === context.repository &&
      receipt.repositoryId === context.repositoryId &&
      receipt.runId === run.id &&
      receipt.runAttempt === run.run_attempt &&
      receipt.pullRequest === pr.number &&
      recordedAt <= now &&
      recordedAt >= Date.parse(run.run_started_at) &&
      compatibleQualificationHosts(receipt.host, context.host) &&
      isDeepStrictEqual(receipt.jobs, CI_JOB_NAMES) &&
      receipt.snapshot?.tree === context.snapshot.tree &&
      receipt.snapshot.workflow === context.snapshot.workflow &&
      isDeepStrictEqual(receipt.snapshot.parents, context.snapshot.parents) &&
      sha(receipt.snapshot.commit),
    "Receipt does not prove the current inputs and complete qualification.",
  );
  const tested = await read(`/git/commits/${receipt.snapshot.commit}`);
  requireFact(
    tested.sha === receipt.snapshot.commit &&
      tested.tree?.sha === context.snapshot.tree &&
      isDeepStrictEqual(
        tested.parents?.map((parent) => parent.sha),
        context.snapshot.parents,
      ),
    "GitHub's tested commit does not match the landed tree and parents.",
  );
  const observed = await readJobInventory({
    read,
    run,
    observation: jobObservation,
  });
  if (releaseAdmission)
    await verifyNativeRequiredCheck(read, context, run, observed);
  await verifyCheckProducingAttempts({
    run,
    checks: receipt.checks,
    observed,
    read,
    jobObservation,
  });
  requireFact(
    id(receipt.candidate?.id) && digest(receipt.candidate.digest),
    "Receipt candidate identity is invalid.",
  );
  const candidate = await read(`/actions/artifacts/${receipt.candidate.id}`);
  assertArtifact(candidate, run, context, now);
  requireFact(
    candidate.digest === receipt.candidate.digest &&
      artifactProducingAttempt(
        candidate.name,
        `${PACKAGE_FILE_STEM}-${context.version}-candidate-${run.id}-`,
        { run: run.id, attempt: run.run_attempt, legacy: true },
      ) !== null,
    "Qualified candidate identity no longer matches.",
  );
  const finalRun = await read(`/actions/runs/${run.id}`);
  assertRun(finalRun, context, pr, now);
  requireFact(
    finalRun.run_attempt === run.run_attempt,
    "Source workflow was rerun while checking jobs and artifacts.",
  );
  const outputs = {
    reuse: "true",
    source_run_id: String(run.id),
    source_run_attempt: String(run.run_attempt),
    source_commit: receipt.snapshot.commit,
    candidate_artifact_id: String(candidate.id),
    candidate_artifact_digest: candidate.digest,
    source_receipt_id: String(artifact.id),
    source_receipt_digest: artifact.digest,
    qualification: JSON.stringify(receipt),
  };
  return {
    outputs,
    run,
    artifact: currentArtifact,
    receipt,
    candidate,
    observed,
  };
}

// The branch rules require CI / required from GitHub Actions (integration 15368).
async function verifyNativeRequiredCheck(read, context, run, { jobs }) {
  const consumer = CI_JOB_NAMES.consumer_runtimes + " / Consumer / ";
  for (const job of jobs.filter(({ conclusion }) => conclusion === "success")) {
    const lane = FROZEN_RUNTIME_MATRIX?.include.find(
      ({ runner, node }) => job.name === consumer + runner + " / Node " + node,
    );
    const label =
      lane?.runner ??
      (job.name.startsWith("CI / Windows /")
        ? WINDOWS.label
        : job.name.startsWith("CI / macOS /")
          ? MACOS.label
          : UBUNTU.label);
    requireFact(
      isDeepStrictEqual(job.labels, [label]),
      "Native CI runner labels contradict the frozen job.",
    );
  }
  const job = jobs.find(({ name }) => name === CI_JOB_NAMES.required);
  const path = `/check-runs/${job?.id}`;
  requireFact(
    id(job?.id) &&
      id(run.check_suite_id) &&
      job.check_run_url ===
        `https://api.github.com/repos/${context.repository}${path}`,
    "The native required check identity is absent.",
  );
  const check = await read(path);
  requireFact(
    check.id === job.id &&
      check.app?.id === 15368 &&
      check.check_suite?.id === run.check_suite_id &&
      check.head_sha === run.head_sha &&
      check.name === job.name &&
      check.status === "completed" &&
      check.conclusion === "success" &&
      check.details_url ===
        `https://github.com/${context.repository}/actions/runs/${run.id}/job/${job.id}`,
    "The native required check does not belong to this GitHub Actions execution.",
  );
}

const assertMainRun = (run, context, commit, now) =>
  requireFact(
    id(run?.id) &&
      id(run.run_attempt) &&
      ["push", "workflow_dispatch"].includes(run.event) &&
      run.head_branch === "main" &&
      run.head_sha === commit &&
      run.path === CI_WORKFLOW &&
      run.status === "completed" &&
      run.conclusion === "success" &&
      sameRepository(run.repository, context) &&
      sameRepository(run.head_repository, context) &&
      Date.parse(run.created_at) <= now,
    "Latest exact-base main run is incomplete, unsuccessful or from another source.",
  );

/** GitHub can copy a retained job into a later attempt with a new job/check ID.
 * Runner and execution timestamps identify the retained execution, while native
 * attempt inventories authenticate where it first ran. Never equate the latest
 * inventory's attempt label with the producing attempt in typed coverage.
 */
async function verifyCheckProducingAttempts({
  run,
  checks,
  observed,
  read,
  jobObservation,
}) {
  const inventories = new Map([[run.run_attempt, observed]]);
  const inventory = async (attempt) => {
    requireFact(
      id(attempt) && attempt <= run.run_attempt,
      "Coverage producing attempt is outside its authenticated run.",
    );
    if (!inventories.has(attempt)) {
      const value = await readJobInventory({
        read,
        run,
        attempt,
        observation: jobObservation,
        label: "Coverage producing attempt",
        required: Object.entries(CHECK_JOBS)
          .filter(([check]) => checks[check].original.runAttempt === attempt)
          .map(([, jobId]) => CI_JOB_NAMES[jobId]),
      });
      inventories.set(attempt, value);
    }
    return inventories.get(attempt).jobs;
  };
  for (const [check, jobId] of Object.entries(CHECK_JOBS)) {
    const attempt = checks[check].original.runAttempt;
    const name = CI_JOB_NAMES[jobId];
    const latest = observed.jobs.find((job) => job.name === name);
    const original = (await inventory(attempt)).find(
      (job) => job.name === name,
    );
    requireFact(
      original?.run_attempt === attempt &&
        original.status === "completed" &&
        original.conclusion === "success" &&
        sameJobExecution(original, latest),
      "Coverage producing attempt differs from its authenticated source execution.",
    );
    if (attempt > 1) {
      const previous = (await inventory(attempt - 1)).find(
        (job) => job.name === name,
      );
      requireFact(
        previous === undefined ||
          (previous.status === "completed" &&
            previous.conclusion === "skipped") ||
          !sameJobExecution(original, previous),
        "Coverage producing attempt names a retained earlier execution.",
      );
    }
  }
}
const verifyWorkflowBlob = async (snapshot, read) => {
  let tree = snapshot.tree;
  for (const [path, type] of [
    [".github", "tree"],
    ["workflows", "tree"],
    ["ci.yml", "blob"],
  ]) {
    const result = await read(`/git/trees/${tree}`);
    requireFact(
      result.sha === tree &&
        result.truncated === false &&
        Array.isArray(result.tree),
      "Workflow tree lookup is incomplete.",
    );
    const entries = result.tree.filter(
      (entry) => entry.path === path && entry.type === type,
    );
    requireFact(
      entries.length === 1 && sha(entries[0].sha),
      "Base workflow control is absent or ambiguous.",
    );
    tree = entries[0].sha;
  }
  requireFact(
    tree === snapshot.workflow,
    "Main record's workflow blob does not match its authenticated Git tree.",
  );
};

/** Select only the latest successful CI run for the event's exact captured main
 * base. One complete page is the bound; an older convenient match is not proof.
 * This read-only foundation never enables selective execution.
 */
export const selectBaseQualification = async ({
  context,
  read,
  now = Date.now(),
}) => {
  const pr = context.event?.pull_request;
  const base = pr?.base?.sha;
  requireFact(
    context.eventName === "pull_request" &&
      pr.base.ref === "main" &&
      context.ref === `refs/pull/${context.event.number}/merge` &&
      id(context.event.number) &&
      sameRepository(pr.base.repo, context) &&
      sameRepository(pr.head?.repo, context) &&
      isDeepStrictEqual(context.snapshot.parents, [base, pr.head.sha]) &&
      context.snapshot.commit === context.sha &&
      sha(base),
    "Exact-base qualification needs the captured same-repository PR merge.",
  );
  return selectExactMainQualification({ context, base, read, now });
};

export async function selectExactMainRun({
  context,
  base,
  read,
  now = Date.now(),
}) {
  requireFact(sha(base), "Exact-base run selection needs a full commit ID.");
  const runs = await read(
    `/actions/workflows/ci.yml/runs?branch=main&head_sha=${base}&per_page=100`,
  );
  requireFact(
    Array.isArray(runs.workflow_runs) &&
      runs.total_count === runs.workflow_runs.length &&
      runs.total_count <= 100,
    "Base workflow lookup is incomplete.",
  );
  const run = [...runs.workflow_runs].sort((a, b) => b.id - a.id)[0];
  assertMainRun(run, context, base, now);
  return run;
}

async function selectExactMainQualification({ context, base, read, now }) {
  const run = await selectExactMainRun({ context, base, read, now });
  const inventory = await read(
    `/actions/runs/${run.id}/artifacts?per_page=100`,
  );
  requireFact(
    Array.isArray(inventory.artifacts) &&
      inventory.total_count === inventory.artifacts.length &&
      inventory.total_count <= 100,
    "Base artifact lookup is incomplete.",
  );
  const artifacts = inventory.artifacts.filter((artifact) =>
    matchesLogicalArtifact(
      artifact.name,
      `ci-main-qualification-${run.id}-${run.run_attempt}`,
      { run: run.id, attempt: run.run_attempt, legacy: true },
    ),
  );
  requireFact(
    artifacts.length === 1,
    "Exact-base main qualification is unavailable or ambiguous.",
  );
  assertArtifact(artifacts[0], run, context, now);
  requireFact(
    artifacts[0].size_in_bytes > 0 && artifacts[0].size_in_bytes <= 64 * 1024,
    "Main receipt archive exceeded its bound.",
  );
  return { base, run, artifact: artifacts[0] };
}

/** Validate the main record and one direct FULL origin. downloadOriginal is the
 * official exact-ID transport boundary; no recursive records or arbitrary URLs.
 * Admission is historical qualification only: non-file equivalence and selector
 * authority remain unproved, so this function cannot authorize omission.
 */
export const verifyBaseQualification = async (options) => {
  requireFact(
    options.selection.base === options.context.event.pull_request.base.sha,
    "Base qualification drifted from the event.",
  );
  const result = await verifyExactMainQualification(options);
  return {
    qualifiedBase: result.landed.commit,
    mode: result.main.receipt.mode,
    originals: result.main.receipt.checks,
    selectiveExecution: false,
    reason: "SELECTION_AUTHORITY_AND_EXTERNAL_INPUTS_UNPROVEN",
  };
};

async function verifyExactMainQualification({
  context,
  selection,
  record,
  read,
  downloadOriginal,
  now = Date.now(),
  captureSources = captureConsumerSources,
  jobObservation,
  releaseAdmission = false,
}) {
  const { base, artifact } = selection;
  assertQualificationRecord(record);
  const pinnedConsumerSources = await captureSources();
  requireFact(
    isDeepStrictEqual(
      record.checks.owl_contract.evidence.consumerSources,
      pinnedConsumerSources,
    ),
    "Consumer source pins differ; fresh qualification is required.",
  );
  const run = await read(`/actions/runs/${selection.run.id}`);
  assertMainRun(run, context, base, now);
  requireFact(
    run.run_attempt === selection.run.run_attempt,
    "Base workflow was rerun during transfer.",
  );
  requireFact(
    record.role === "MAIN" &&
      record.repository === context.repository &&
      record.repositoryId === context.repositoryId &&
      record.runId === run.id &&
      record.runAttempt === run.run_attempt &&
      record.snapshot.commit === base &&
      Date.parse(record.recordedAt) >= Date.parse(run.run_started_at) &&
      Date.parse(record.recordedAt) <= now,
    "Main qualification does not bind its authenticated exact-base run.",
  );
  const currentArtifact = await read(`/actions/artifacts/${artifact.id}`);
  assertArtifact(currentArtifact, run, context, now);
  requireFact(
    currentArtifact.digest === artifact.digest &&
      currentArtifact.name === artifact.name &&
      matchesLogicalArtifact(
        currentArtifact.name,
        `ci-main-qualification-${run.id}-${run.run_attempt}`,
        { run: run.id, attempt: run.run_attempt, legacy: true },
      ),
    "Main qualification artifact changed.",
  );
  const commit = await read(`/git/commits/${base}`);
  requireFact(
    commit.sha === base &&
      commit.tree?.sha === record.snapshot.tree &&
      isDeepStrictEqual(
        commit.parents?.map((parent) => parent.sha),
        record.snapshot.parents,
      ),
    "Main qualification's Git identity is unproved.",
  );
  await verifyWorkflowBlob(record.snapshot, read);
  const jobs = await readJobInventory({
    read,
    run,
    observation: jobObservation,
    label: "Main qualification job inventory",
    required: hostedCiJobNames(record.mode),
    mode: record.mode,
    conclusion: (name) =>
      record.mode === "REUSED" &&
      ![
        CI_JOB_NAMES.runtime_matrix,
        CI_JOB_NAMES.verification,
        CI_JOB_NAMES.required,
      ].includes(name)
        ? "skipped"
        : "success",
  });
  if (releaseAdmission)
    await verifyNativeRequiredCheck(read, context, run, jobs);
  if (record.mode === "FULL")
    await verifyCheckProducingAttempts({
      run,
      checks: record.checks,
      observed: jobs,
      read,
      jobObservation,
    });
  let source;
  if (record.mode === "REUSED") {
    // Historical identity comes from the authenticated main run and Git tree.
    const originalContext = {
      ...context,
      sha: base,
      snapshot: record.snapshot,
      host: record.host,
    };
    const originalSelection = await selectMergedProof({
      context: originalContext,
      read,
      now,
    });
    requireFact(
      originalSelection.run.id === record.source.runId &&
        originalSelection.run.run_attempt === record.source.runAttempt &&
        originalSelection.artifact.id === record.source.receipt.id &&
        originalSelection.artifact.digest === record.source.receipt.digest,
      "Main qualification does not point directly to its current original FULL proof.",
    );
    const originalReceipt = await downloadOriginal(originalSelection);
    source = await verifyMergedProof({
      context: originalContext,
      selection: originalSelection,
      receipt: originalReceipt,
      captureSources: async () => pinnedConsumerSources,
      jobObservation,
      read,
      now,
      releaseAdmission,
    });
    requireFact(
      source.outputs.source_commit === record.source.commit &&
        isDeepStrictEqual(originalReceipt.host, record.source.host) &&
        isDeepStrictEqual(originalReceipt.candidate, record.candidate) &&
        isDeepStrictEqual(originalReceipt.packageProof, record.packageProof) &&
        Object.keys(record.checks).every((check) =>
          ["evidence", "inputs"].every((field) =>
            isDeepStrictEqual(
              originalReceipt.checks[check][field],
              record.checks[check][field],
            ),
          ),
        ),
      "Main qualification inherited different original execution or candidate evidence.",
    );
  } else {
    const candidate = await read(`/actions/artifacts/${record.candidate.id}`);
    assertArtifact(candidate, run, context, now);
    requireFact(
      candidate.digest === record.candidate.digest &&
        artifactProducingAttempt(
          candidate.name,
          `${PACKAGE_FILE_STEM}-${context.version}-candidate-${run.id}-`,
          { run: run.id, attempt: run.run_attempt, legacy: true },
        ) !== null,
      "Main FULL candidate identity changed.",
    );
    source = {
      run,
      artifact: currentArtifact,
      receipt: record,
      candidate,
      observed: jobs,
    };
  }
  const finalRun = await read(`/actions/runs/${run.id}`);
  assertMainRun(finalRun, context, base, now);
  requireFact(
    finalRun.run_attempt === run.run_attempt,
    "Main proof was rerun during origin validation.",
  );
  const finalArtifact = await read(`/actions/artifacts/${artifact.id}`);
  assertArtifact(finalArtifact, finalRun, context, now);
  requireFact(
    finalArtifact.digest === artifact.digest &&
      finalArtifact.name === currentArtifact.name,
    "Main record changed during origin validation.",
  );
  return {
    landed: record.snapshot,
    main: { run: finalRun, artifact: finalArtifact, receipt: record },
    source,
  };
}

/** Resolve a protected-main dispatch to the exact landed receipt and its direct
 * FULL producer. The callback verifies package evidence before the final live
 * head and producer check. CI equivalence alone establishes no release gates.
 */
export async function verifyReleaseCi(options) {
  requireFact(
    options.context.eventName === "workflow_dispatch",
    "Release dispatch must name the trusted main checkout.",
  );
  return verifyProtectedMainCi(options);
}

/** A cleanup trigger nominates a run. The normal protected-main verifier independently selects its own successful original. */
export function retirementTrigger(context) {
  if (context.eventName === "workflow_dispatch") return null;
  const trigger = context.event?.workflow_run;
  requireFact(
    context.eventName === "workflow_run" &&
      context.event.action === "completed" &&
      trigger?.path === CI_WORKFLOW &&
      trigger.event === "push" &&
      trigger.head_branch === "main" &&
      trigger.head_sha === context.sha &&
      trigger.status === "completed" &&
      trigger.conclusion === "success" &&
      id(trigger.id) &&
      id(trigger.run_attempt) &&
      sameRepository(trigger.repository, context) &&
      sameRepository(trigger.head_repository, context),
    "Retirement requires a successful upstream CI push on the current protected main.",
  );
  return trigger;
}

export async function verifyRetentionCi(options) {
  const trigger = retirementTrigger(options.context);
  const result = await verifyProtectedMainCi(options);
  if (trigger)
    requireFact(
      result.main.run.id === trigger.id &&
        result.main.run.run_attempt === trigger.run_attempt &&
        result.main.run.event === "push",
      "Upstream trigger differs from the independently verified main CI run or attempt.",
    );
  return result;
}

async function verifyProtectedMainCi({
  context,
  read,
  downloadReceipt,
  verifyPackage,
  captureSources,
  jobObservation,
  now = Date.now(),
}) {
  const started = performance.now();
  requireFact(
    context.ref === "refs/heads/main" &&
      context.repository === REPOSITORY &&
      sameRepository(context.event?.repository, context) &&
      context.event.repository.default_branch === "main" &&
      sha(context.sha) &&
      context.snapshot.commit === context.sha &&
      validHost(context.host),
    "Release dispatch must name the trusted main checkout.",
  );
  const checkHead = async () => {
    const branch = await read("/branches/main");
    requireFact(
      branch.name === "main" &&
        branch.protected === true &&
        branch.commit?.sha === context.sha,
      "The release subject is no longer protected main.",
    );
  };
  await checkHead();
  const selection = await selectExactMainQualification({
    context,
    base: context.sha,
    read,
    now,
  });
  const record = await downloadReceipt(selection);
  const result = await verifyExactMainQualification({
    context,
    selection,
    record,
    read,
    now,
    captureSources,
    jobObservation,
    downloadOriginal: downloadReceipt,
    releaseAdmission: true,
  });
  requireFact(
    isDeepStrictEqual(result.landed, context.snapshot),
    "Main qualification does not match the dispatch Git identity.",
  );
  const qualifiedPackage = await verifyPackage?.(result.source);
  for (const run of new Map(
    [result.main, result.source].map(({ run }) => [run.id, run]),
  ).values()) {
    const current = await read(`/actions/runs/${run.id}`);
    requireFact(
      [
        "id",
        "run_attempt",
        "status",
        "conclusion",
        "check_suite_id",
        "head_sha",
        "path",
        "event",
      ].every((key) => current[key] === run[key]),
      "Original CI changed before the release verdict.",
    );
  }
  const requiredArtifacts = [
    [result.main.artifact, result.main.run],
    [result.source.artifact, result.source.run],
    [result.source.candidate, result.source.run],
    ...(qualifiedPackage ? [[qualifiedPackage.proof, result.source.run]] : []),
  ];
  for (const [original, run] of new Map(
    requiredArtifacts.map((pair) => [pair[0].id, pair]),
  ).values()) {
    const current = await read(`/actions/artifacts/${original.id}`);
    assertArtifact(current, run, context, now + performance.now() - started);
    requireFact(
      ["id", "name", "digest", "size_in_bytes", "expires_at"].every(
        (key) => current[key] === original[key],
      ),
      "Required CI artifact changed before the release verdict.",
    );
  }
  await checkHead();
  return { ...result, qualifiedPackage };
}
