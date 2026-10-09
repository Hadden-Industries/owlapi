/** Evidence reuse is an optimization. Unprovable equivalence always requires full CI. */
import { isDeepStrictEqual } from "node:util";
import { captureConsumerSources } from "./consumer-source-snapshot.mjs";
import { javaReferenceFromNeeds } from "./java-reference-state.mjs";
import {
  requireSuccessfulJobs,
  requireCiJobs,
} from "./require-job-success.mjs";
import {
  CI_JOB_NAMES,
  CHECK_JOBS,
  QUALIFICATION_POLICY_SHA256,
  assertQualificationRecord,
  createQualificationChecks,
  coverageFromNeeds,
  qualifiedSourceFromOutputs,
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

export const hostedIdentity = (environment, nodeVersion) => ({
  os: environment.RUNNER_OS,
  architecture: environment.RUNNER_ARCH,
  image: environment.ImageOS,
  imageVersion: environment.ImageVersion,
  node: nodeVersion,
});

const validHost = (host) =>
  host?.os === "Linux" &&
  host.architecture === "X64" &&
  host.image === "ubuntu24" &&
  /^\d{8}\.\d+(?:\.\d+)?$/u.test(host.imageVersion ?? "") &&
  host.node === "v24.21.0";

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
    schemaVersion: 5,
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
    context.eventName === "push" &&
      context.ref === "refs/heads/main" &&
      context.event.ref === context.ref &&
      context.event.after === context.sha &&
      context.event.deleted === false &&
      context.event.forced === false &&
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
      isDeepStrictEqual(origin.host, context.host) &&
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
    schemaVersion: 5,
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
      snapshot.parents.length === 2 &&
      snapshot.parents.every(sha) &&
      snapshot.parents[0] === event.before &&
      sha(snapshot.commit) &&
      sha(snapshot.tree) &&
      sha(snapshot.workflow) &&
      validHost(context.host),
    "Not an eligible single normal main merge.",
  );
};

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
  const proofs = artifacts.artifacts.filter(
    (artifact) => artifact.name === receiptName(run),
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
};

export const verifyIntegrationProof = async ({
  context,
  selection,
  receipt,
  read,
  now = Date.now(),
  captureSources = captureConsumerSources,
}) => {
  assertPush(context);
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
      currentArtifact.name === receiptName(run),
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
    receipt.schemaVersion === 5 &&
      receipt.role === "PR" &&
      receipt.mode === "FULL" &&
      receipt.repository === context.repository &&
      receipt.repositoryId === context.repositoryId &&
      receipt.runId === run.id &&
      receipt.runAttempt === run.run_attempt &&
      receipt.pullRequest === pr.number &&
      recordedAt <= now &&
      recordedAt >= Date.parse(run.run_started_at) &&
      isDeepStrictEqual(receipt.host, context.host) &&
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
  const observed = await read(
    `/actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
  );
  const names = Object.values(CI_JOB_NAMES);
  requireFact(
    observed.total_count === names.length &&
      observed.jobs?.length === names.length &&
      new Set(observed.jobs.map((job) => job.name)).size === names.length &&
      observed.jobs.every(
        (job) =>
          names.includes(job.name) &&
          job.run_id === run.id &&
          id(job.run_attempt) &&
          job.run_attempt <= run.run_attempt &&
          job.head_sha === run.head_sha &&
          job.status === "completed" &&
          job.conclusion === "success",
      ),
    "The latest source job inventory is incomplete, failed or contains skipped checks.",
  );
  for (const [check, jobId] of Object.entries(CHECK_JOBS))
    requireFact(
      observed.jobs.find((job) => job.name === CI_JOB_NAMES[jobId])
        .run_attempt === receipt.checks[check].original.runAttempt,
      "Coverage producing attempt differs from its authenticated source job.",
    );
  requireFact(
    id(receipt.candidate?.id) && digest(receipt.candidate.digest),
    "Receipt candidate identity is invalid.",
  );
  const candidate = await read(`/actions/artifacts/${receipt.candidate.id}`);
  assertArtifact(candidate, run, context, now);
  requireFact(
    candidate.digest === receipt.candidate.digest &&
      candidate.name.startsWith(
        `hadden-industries-owlapi-${context.version}-candidate-${run.id}-`,
      ) &&
      /^[1-9][0-9]*$/u.test(
        candidate.name.slice(
          `hadden-industries-owlapi-${context.version}-candidate-${run.id}-`
            .length,
        ),
      ) &&
      Number(candidate.name.split("-").at(-1)) <= run.run_attempt,
    "Qualified candidate identity no longer matches.",
  );
  const finalRun = await read(`/actions/runs/${run.id}`);
  assertRun(finalRun, context, pr, now);
  requireFact(
    finalRun.run_attempt === run.run_attempt,
    "Source workflow was rerun while checking jobs and artifacts.",
  );
  return {
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
};

const assertMainRun = (run, context, commit, now) =>
  requireFact(
    id(run?.id) &&
      id(run.run_attempt) &&
      run.event === "push" &&
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
const assertClosedJobs = (observed, run, reused) => {
  const names = Object.values(CI_JOB_NAMES);
  requireFact(
    observed.total_count === names.length &&
      observed.jobs?.length === names.length &&
      new Set(observed.jobs.map((job) => job.name)).size === names.length &&
      observed.jobs.every(
        (job) =>
          names.includes(job.name) &&
          job.run_id === run.id &&
          id(job.run_attempt) &&
          job.run_attempt <= run.run_attempt &&
          job.head_sha === run.head_sha &&
          job.status === "completed" &&
          job.conclusion ===
            (reused &&
            ![CI_JOB_NAMES.verification, CI_JOB_NAMES.required].includes(
              job.name,
            )
              ? "skipped"
              : "success"),
      ),
    "Main qualification does not match its complete native job inventory.",
  );
};
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
  const runs = await read(
    `/actions/workflows/ci.yml/runs?event=push&head_sha=${base}&per_page=100`,
  );
  requireFact(
    Array.isArray(runs.workflow_runs) &&
      runs.total_count === runs.workflow_runs.length &&
      runs.total_count <= 100,
    "Base workflow lookup is incomplete.",
  );
  const run = [...runs.workflow_runs].sort((a, b) => b.id - a.id)[0];
  assertMainRun(run, context, base, now);
  const inventory = await read(
    `/actions/runs/${run.id}/artifacts?per_page=100`,
  );
  requireFact(
    Array.isArray(inventory.artifacts) &&
      inventory.total_count === inventory.artifacts.length &&
      inventory.total_count <= 100,
    "Base artifact lookup is incomplete.",
  );
  const artifacts = inventory.artifacts.filter(
    (artifact) =>
      artifact.name === `ci-main-qualification-${run.id}-${run.run_attempt}`,
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
};

/** Validate the main record and one direct FULL origin. downloadOriginal is the
 * official exact-ID transport boundary; no recursive records or arbitrary URLs.
 * Admission is historical qualification only: non-file equivalence and selector
 * authority remain unproved, so this function cannot authorize omission.
 */
export const verifyBaseQualification = async ({
  context,
  selection,
  record,
  read,
  downloadOriginal,
  now = Date.now(),
  captureSources = captureConsumerSources,
}) => {
  const { base, artifact } = selection;
  requireFact(
    base === context.event.pull_request.base.sha,
    "Base qualification drifted from the event.",
  );
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
      currentArtifact.name ===
        `ci-main-qualification-${run.id}-${run.run_attempt}`,
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
  const jobs = await read(
    `/actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
  );
  assertClosedJobs(jobs, run, record.mode === "REUSED");
  if (record.mode === "FULL")
    for (const [check, jobId] of Object.entries(CHECK_JOBS))
      requireFact(
        jobs.jobs.find((job) => job.name === CI_JOB_NAMES[jobId])
          .run_attempt === record.checks[check].original.runAttempt,
        "Main coverage producing attempt differs from its authenticated job.",
      );
  if (record.mode === "REUSED") {
    const originalContext = {
      ...context,
      eventName: "push",
      ref: "refs/heads/main",
      sha: base,
      snapshot: record.snapshot,
      host: record.host,
      event: {
        ref: "refs/heads/main",
        after: base,
        before: record.snapshot.parents[0],
        deleted: false,
        forced: false,
        created: false,
        repository: {
          id: context.repositoryId,
          full_name: context.repository,
          default_branch: "main",
        },
      },
    };
    const originalSelection = await selectVerificationProof({
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
    const validated = await verifyIntegrationProof({
      context: originalContext,
      selection: originalSelection,
      receipt: originalReceipt,
      captureSources: async () => pinnedConsumerSources,
      read,
      now,
    });
    requireFact(
      validated.source_commit === record.source.commit &&
        isDeepStrictEqual(originalReceipt.candidate, record.candidate) &&
        Object.keys(record.checks).every((check) =>
          isDeepStrictEqual(
            originalReceipt.checks[check].evidence,
            record.checks[check].evidence,
          ),
        ),
      "Main qualification inherited different original execution or candidate evidence.",
    );
  } else {
    const candidate = await read(`/actions/artifacts/${record.candidate.id}`);
    assertArtifact(candidate, run, context, now);
    requireFact(
      candidate.digest === record.candidate.digest &&
        candidate.name.startsWith(
          `hadden-industries-owlapi-${context.version}-candidate-${run.id}-`,
        ) &&
        /^[1-9][0-9]*$/u.test(candidate.name.split("-").at(-1)) &&
        Number(candidate.name.split("-").at(-1)) <= run.run_attempt,
      "Main FULL candidate identity changed.",
    );
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
    qualifiedBase: base,
    mode: record.mode,
    originals: record.checks,
    selectiveExecution: false,
    reason: "SELECTION_AUTHORITY_AND_EXTERNAL_INPUTS_UNPROVEN",
  };
};
