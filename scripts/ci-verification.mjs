/** Evidence reuse is an optimization. Unprovable equivalence always requires full CI. */
import { isDeepStrictEqual } from "node:util";
import { requireSuccessfulJobs } from "./require-job-success.mjs";

export const CI_WORKFLOW = ".github/workflows/ci.yml";
export const CI_JOB_NAMES = Object.freeze({
  verification: "CI / verification strategy",
  metadata: "CI / metadata",
  source_node_22: "CI / Ubuntu / Node 22.23.3",
  source_node_24: "CI / Ubuntu / Node 24.21.0",
  dependency_review: "CI / dependency review",
  candidate: "CI / retained candidate",
  portability_windows_node_22: "CI / Windows / Node 22.23.3",
  portability_windows_node_24: "CI / Windows / Node 24.21.0",
  portability_macos_node_22: "CI / macOS / Node 22.23.3",
  portability_macos_node_24: "CI / macOS / Node 24.21.0",
  browser_chromium: "CI / browser / Chromium",
  browser_firefox: "CI / browser / Firefox",
  browser_webkit: "CI / browser / WebKit",
  webvowl: "CI / isolated WebVOWL consumer",
  required: "CI / required",
});

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
  return {
    schemaVersion: 1,
    mode: "FULL",
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
  };
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
  requireFact(
    receipt.schemaVersion === 1 &&
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
          job.run_attempt === run.run_attempt &&
          job.head_sha === run.head_sha &&
          job.status === "completed" &&
          job.conclusion === "success",
      ),
    "The latest source job inventory is incomplete, failed or contains skipped checks.",
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
        `owlapi-${context.version}-candidate-${run.id}-`,
      ) &&
      /^[1-9][0-9]*$/u.test(
        candidate.name.slice(
          `owlapi-${context.version}-candidate-${run.id}-`.length,
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
  };
};
