import { REPOSITORY as repo } from "./release-identity.mjs";
import {
  assertCorpusQualificationBinding,
  qualificationBaseSchema,
  verifyCorpusQualification,
} from "./corpus-qualification-manifest.mjs";
import {
  readReleaseSecurity,
  verifyPromotedAdmission,
} from "./release-qualification-manifest.mjs";
import { assertPromotedCi } from "./promoted-release-proof.mjs";
import { CI_WORKFLOW } from "./ci-verification.mjs";
import { CI_JOB_NAMES } from "./ci-qualification.mjs";
import assert from "node:assert/strict";
import { assertAdvisoryDecisionCurrent } from "./release-audit-evaluator.mjs";
import {
  assertQualificationAdvisory,
  qualificationAdvisoryMarker,
} from "./qualification-advisory-binding.mjs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { crc32 } from "node:zlib";
import { matchesLogicalArtifact } from "../tooling/artifact-transport/identity.mjs";
import {
  readRunArtifacts,
  readWorkflowRuns,
} from "./github-evidence-reader.mjs";
import { GitHubReleaseClient } from "./github-release.mjs";
import { downloadReleaseArtifact } from "./release-approvals.mjs";
import { readZipArchiveFilesWith } from "./release-zip-core.mjs";
import {
  readCheckpoint,
  verifyControllerDelta,
  verifyReservations,
  priorDisposition,
} from "./release-history-checkpoint.mjs";
import { readPublicRegistry } from "./public-registry-read.mjs";
import { emit } from "./ci-verification-command.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import {
  runtimeDigest,
  validateFrozenMatrix,
} from "./consumer-runtime-matrix.mjs";
import {
  findNpmCliCandidates,
  observeNpmVersion,
  selectNpmCliForVersion,
} from "./assert-workflow-runtime.mjs";
import {
  assertPrivateStageInventory,
  assertStageAuthority,
  stageRightsInputs,
} from "./release-stage-authorization.mjs";
import {
  PACKAGE_FILE_STEM,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  NPM_REGISTRY,
  releaseChannel,
} from "./package-identity.mjs";

const registry = NPM_REGISTRY;
const stageWorkflow = ".github/workflows/stage-release.yml";
const id = (value) => {
  assert.match(String(value), /^[1-9]\d{0,15}$/u);
  return String(value);
};
export const hash = (bytes, algorithm = "sha256", encoding = "hex") =>
  createHash(algorithm).update(bytes).digest(encoding);
const json = (bytes) => JSON.parse(bytes.toString("utf8"));
export function checkStageBytes(bytes, manifest) {
  assert.equal(bytes.length, manifest.assets.tarball.bytes);
  assert.equal(
    hash(bytes),
    manifest.assets.tarball.sha256,
    "Candidate SHA-256 mismatch",
  );
  assert.equal(
    "sha512-" + hash(bytes, "sha512", "base64"),
    manifest.integrity,
    "Candidate npm integrity mismatch",
  );
}
function subject(manifest) {
  const schema = qualificationBaseSchema(manifest);
  assert.ok([1, 2].includes(schema), "Unknown release qualification manifest");
  assert.equal(manifest.repository, repo);
  assert.equal(manifest.workflow, ".github/workflows/release.yml");
  assert.equal(manifest.package.name, PACKAGE_NAME);
  assert.match(
    manifest.package.version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/u,
  );
  assert.equal(
    releaseChannel(manifest.package.version),
    "pilot",
    "Historical package cannot enter staged publication",
  );
  assert.deepEqual(manifest.packedConfig, {
    access: "public",
    registry,
    tag: "pilot",
  });
  assert.match(manifest.commit, /^[a-f0-9]{40}$/u);
  if (schema === 1)
    assert.ok(
      !Object.hasOwn(manifest, "ci") &&
        !Object.hasOwn(manifest, "runtimeMatrix"),
      "A fresh manifest cannot carry cross-run CI promotion fields",
    );
  if (schema === 2) {
    const ci = manifest.ci;
    if (manifest.schemaVersion === 3)
      assert.ok(
        manifest.runtimeMatrix,
        "Corpus promotion requires the frozen runtime matrix",
      );
    const recorded = Date.parse(manifest.security?.observedAt);
    assert.ok(
      Number.isFinite(recorded) && recorded <= Date.now(),
      "Invalid recorded release observation",
    );
    assertPromotedCi(ci, {
      commit: manifest.commit,
      version: manifest.package.version,
      matrixSha256: manifest.runtimeMatrix
        ? runtimeDigest(validateFrozenMatrix(manifest.runtimeMatrix))
        : ci.matrixSha256,
      now: recorded,
    });
    assert.deepEqual(
      [
        manifest.package,
        manifest.packedConfig,
        manifest.assets,
        manifest.integrity,
        manifest.candidateId,
        manifest.candidateDigest,
      ],
      [
        ci.package,
        ci.packedConfig,
        ci.assets,
        ci.integrity,
        String(ci.candidate.id),
        ci.candidate.digest.slice("sha256:".length),
      ],
      "Promoted qualification contains conflicting candidate identities",
    );
  }
  if (manifest.schemaVersion === 3) assertCorpusQualificationBinding(manifest);
}
export function verifyPrivateStage({
  manifest,
  receipt,
  view,
  bytes,
  manifestSha256,
}) {
  subject(manifest);
  assert.equal(receipt.state, "STAGED");
  assert.equal(receipt.manifestSha256, manifestSha256);
  assert.equal(receipt.commit, manifest.commit);
  assert.equal(receipt.stageId, view.id);
  assert.match(view.id, /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu);
  assert.deepEqual(
    [view.packageName, view.version, view.tag],
    [PACKAGE_NAME, manifest.package.version, receipt.channel],
  );
  assert.ok(["pilot", "latest"].includes(view.tag));
  checkStageBytes(bytes, manifest);
  assert.equal(view.shasum, hash(bytes, "sha1"));
  return {
    ...receipt,
    state: "PRIVATE_BYTES_VERIFIED",
    sha256: hash(bytes),
    integrity: manifest.integrity,
  };
}

/** Accept only the named failure in the original two-job writer attempt. */
function stageFailureSummary(run, inventory, failure) {
  assert.deepEqual(
    [run.path, run.status, run.conclusion],
    [stageWorkflow, "completed", "failure"],
  );
  assert.equal(inventory.total_count, 2);
  assert.equal(inventory.jobs.length, 2);
  const jobs = inventory.jobs;
  assert.deepEqual(jobs.map((j) => j.name).sort(), ["admit", "stage"]);
  for (const job of jobs) {
    assert.deepEqual(
      [job.run_id, job.run_attempt, job.head_sha, job.status],
      [run.id, run.run_attempt, run.head_sha, "completed"],
    );
    assert.ok(Number.isSafeInteger(job.id) && job.id > 0);
  }
  assert.equal(new Set(jobs.map((j) => j.id)).size, 2);
  assert.equal(jobs.find((j) => j.name === "admit").conclusion, "success");
  const stage = jobs.find((j) => j.name === "stage");
  assert.equal(stage.conclusion, "failure");
  const matches = (name) => stage.steps.filter((s) => s.name === name);
  const effects = matches("Stage the admitted tarball");
  const uploads = matches("Retain original stage journal");
  assert.equal(effects.length, 1);
  assert.equal(uploads.length, 1);
  const failedStep = failure === "retention" ? uploads[0] : effects[0];
  assert.equal(
    effects[0].conclusion,
    failure === "retention" ? "success" : "failure",
  );
  assert.equal(
    uploads[0].conclusion,
    failure === "retention" ? "failure" : "success",
  );
  assert.ok(stage.steps.indexOf(effects[0]) < stage.steps.indexOf(uploads[0]));
  assert.ok(
    stage.steps.every(
      (s) =>
        s.status === "completed" &&
        (s === failedStep || ["success", "skipped"].includes(s.conclusion)),
    ),
  );
  return {
    runId: String(run.id),
    attempt: String(run.run_attempt),
    controller: run.head_sha,
    admitJob: jobs.find((j) => j.name === "admit").id,
    stageJob: stage.id,
    stage: effects[0].conclusion,
    retention: uploads[0].conclusion,
  };
}

export function readStageJournal(
  bytes,
  manifest,
  manifestSha256,
  expectedOrigin,
) {
  const rows = bytes
    .toString("utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(rows.length, 2);
  const [{ state: requestState, ...request }, { state, stageId, ...ack }] =
    rows;
  if (manifest.consumerResolutionPolicy === 2)
    assertQualificationAdvisory(request.qualificationAdvisory);
  assert.equal(requestState, "REQUESTED");
  assert.equal(state, "STAGED");
  assert.deepEqual(
    ack,
    request,
    "Staging acknowledgement differs from its original request",
  );
  assert.deepEqual(
    [
      request.schemaVersion,
      request.package,
      request.version,
      request.workflow,
      request.commit,
      request.qualificationRun,
      request.qualificationAttempt,
      request.manifestSha256,
    ],
    [
      1,
      PACKAGE_NAME,
      manifest.package.version,
      stageWorkflow,
      manifest.commit,
      manifest.runId,
      manifest.attempt,
      manifestSha256,
    ],
  );
  assert.equal(request.runId, id(request.runId));
  assert.equal(request.attempt, "1");
  const controller = request.controller ?? request.commit;
  assert.match(controller, /^[0-9a-f]{40}$/u);
  if (expectedOrigin)
    assert.deepEqual(
      [request.runId, request.attempt, controller],
      [expectedOrigin.runId, expectedOrigin.attempt, expectedOrigin.controller],
    );
  assert.match(stageId, /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu);
  assert.ok(["pilot", "latest"].includes(request.channel));
  return rows[1];
}

export async function originArtifact(
  client,
  {
    runId,
    attempt,
    filename,
    commit,
    logical,
    artifactId,
    recoverSeal = false,
    refusedLabel = false,
    stageFailure,
    requireArchivedFailure = false,
    ciProducer,
    ciRun = ciProducer,
    nativeProducer,
    runArtifacts,
    requireLiveOriginal = false,
  },
  checkpoint,
) {
  assert.ok(
    !requireLiveOriginal || checkpoint === undefined,
    "Live-only artifact reads cannot consult public checkpoint custody",
  );
  id(runId);
  id(attempt);
  const receiptName =
    "origin-" + runId + "-" + attempt + "-" + logical + ".json";
  const retained = checkpoint?.files.get(receiptName);
  const saved = retained && json(retained);
  const readAvailable = async (path, options) => {
    try {
      return await client.read(path, options);
    } catch (error) {
      if (saved && [404, 410].includes(error.httpStatus)) return null;
      throw error;
    }
  };
  const liveRun = await readAvailable(
    "/actions/runs/" + runId + "/attempts/" + attempt,
  );
  const run = liveRun ?? saved?.run;
  assert.ok(run, "Missing original run record");
  if (ciRun) {
    assert.equal(filename, CI_WORKFLOW);
    assert.equal(ciRun.providerHead, commit);
    assert.equal(String(ciRun.runId), String(runId));
  }
  if (ciProducer) {
    assert.equal(filename, CI_WORKFLOW);
    assert.equal(commit, ciProducer.providerHead);
    assert.equal(String(runId), String(ciProducer.runId));
    assert.equal(String(attempt), String(ciProducer.producingAttempt));
    const jobPath = `/actions/jobs/${id(ciProducer.producerJob)}`;
    const producer = (await readAvailable(jobPath)) ?? saved?.producer;
    assert.ok(
      producer &&
        producer.id === ciProducer.producerJob &&
        producer.name === CI_JOB_NAMES.candidate + " / Produce" &&
        String(producer.run_id) === String(runId) &&
        String(producer.run_attempt) === String(attempt) &&
        producer.head_sha === commit &&
        producer.status === "completed" &&
        producer.conclusion === "success",
      "Original CI candidate producer could not be verified",
    );
  }
  if (nativeProducer) {
    assert.equal(filename, ".github/workflows/release-registry.yml");
    assert.equal(nativeProducer.run_id, run.id);
    assert.equal(nativeProducer.run_attempt, run.run_attempt);
    assert.equal(nativeProducer.head_sha, run.head_sha);
    assert.equal(nativeProducer.status, "completed");
    assert.equal(nativeProducer.conclusion, "success");
  }
  if (liveRun && saved) {
    for (const field of [
      "id",
      "run_attempt",
      "path",
      "event",
      "head_branch",
      "head_sha",
      "status",
      "conclusion",
    ])
      assert.equal(
        saved.run[field],
        liveRun[field],
        "Conflicting signed original run " + field,
      );
    assert.equal(saved.run.repository?.full_name, repo);
    assert.equal(saved.run.head_repository?.full_name, repo);
  }
  if (stageFailure !== undefined) {
    assert.ok(["retention", "before-request"].includes(stageFailure));
    assert.equal(recoverSeal, false);
    assert.equal(filename, stageWorkflow);
    assert.equal(logical, "release-stage-" + runId + "-" + attempt);
    assert.equal(String(attempt), "1");
  }
  if (stageFailure === "before-request")
    assert.equal(run.conclusion, "failure");
  const failedStage = stageFailure && run.conclusion === "failure";
  if (recoverSeal) {
    assert.equal(filename, ".github/workflows/github-release.yml");
    assert.ok(["success", "failure", "cancelled"].includes(run.conclusion));
  }
  if (refusedLabel)
    assert.deepEqual(
      [filename, run.conclusion],
      [".github/workflows/release-labels.yml", "failure"],
    );
  assert.equal(run.repository.full_name, repo);
  assert.equal(run.head_repository.full_name, repo);
  assert.deepEqual(
    [
      String(run.id),
      String(run.run_attempt),
      run.path,
      run.event,
      run.head_branch,
      run.head_sha,
      run.status,
      run.conclusion,
    ],
    [
      String(runId),
      String(attempt),
      filename,
      ciRun?.event ?? "workflow_dispatch",
      ciRun?.event === "pull_request" ? run.head_branch : "main",
      commit,
      "completed",
      recoverSeal ||
      refusedLabel ||
      failedStage ||
      (nativeProducer && ["failure", "cancelled"].includes(run.conclusion)) ||
      (ciProducer?.producingAttempt < ciProducer?.attempt &&
        ["failure", "cancelled"].includes(run.conclusion))
        ? run.conclusion
        : "success",
    ],
    "Unqualified original run or attempt",
  );
  let retentionFailure;
  if (failedStage) {
    const jobs =
      (liveRun &&
        (await readAvailable(
          "/actions/runs/" +
            runId +
            "/attempts/" +
            attempt +
            "/jobs?per_page=100",
        ))) ??
      saved?.jobs;
    assert.ok(jobs, "Missing original failed stage job inventory");
    const summary = stageFailureSummary(run, jobs, stageFailure);
    if (requireArchivedFailure)
      assert.ok(
        saved?.jobs,
        "Seal requires the original failed stage inventory in signed history",
      );
    if (saved?.jobs)
      assert.deepEqual(
        stageFailureSummary(run, saved.jobs, stageFailure),
        summary,
        "Conflicting signed stage job inventory",
      );
    if (stageFailure === "retention") retentionFailure = summary;
  }
  const inventory =
    runArtifacts ??
    (liveRun
      ? await (async () => {
          try {
            return await readRunArtifacts((path) => client.read(path), runId);
          } catch (e) {
            if (saved && [404, 410].includes(e.httpStatus)) return [];
            throw e;
          }
        })()
      : []);
  const matches = inventory.filter((a) =>
    matchesLogicalArtifact(a.name, logical, {
      run: runId,
      attempt,
      legacy: false,
    }),
  );
  assert.ok(matches.length <= 1, "Ambiguous original artifact");
  const pointer = matches[0] ?? saved?.artifact;
  assert.ok(pointer || artifactId, "Missing original artifact");
  if (pointer && artifactId) assert.equal(id(pointer.id), id(artifactId));
  const current = await readAvailable(
    "/actions/artifacts/" + id(pointer?.id ?? artifactId),
    {
      retryArtifact404: true,
    },
  );
  const a = current ?? saved?.artifact;
  assert.ok(a, "Missing original artifact");
  for (const pointer of [matches[0], saved?.artifact].filter(Boolean)) {
    assert.equal(a.id, pointer.id);
    assert.equal(a.name, pointer.name);
    assert.equal(
      a.digest,
      pointer.digest,
      "Contradictory native artifact digest",
    );
    assert.equal(
      a.size_in_bytes,
      pointer.size_in_bytes,
      "Contradictory native artifact size",
    );
  }
  assert.ok(
    matchesLogicalArtifact(a.name, logical, {
      run: runId,
      attempt,
      legacy: false,
    }),
  );
  if (current && !matches.length && !artifactId)
    assert.equal(current.expired, true, "Live original contradicts inventory");
  if (inventory.some((listed) => listed.id === a.id && listed.name !== a.name))
    throw new Error("Contradictory listed artifact identity");
  assert.equal(a.workflow_run?.id, run.id);
  assert.equal(a.workflow_run.head_sha, commit);
  if (requireLiveOriginal)
    assert.ok(
      current?.expired === false,
      "The original Actions artifact is unavailable or expired",
    );
  if (!current || a.expired) {
    const bytes = checkpoint?.files.get("artifact-" + a.id + ".zip");
    assert.ok(
      bytes && "sha256:" + hash(bytes) === a.digest,
      "Missing or altered retained original ZIP",
    );
    return validate({ ...a, archivedBytes: bytes });
  }
  return validate(a);
  function validate(a) {
    if (artifactId) assert.equal(String(a.id), id(artifactId));
    assert.match(a.digest, /^sha256:[0-9a-f]{64}$/u);
    return retentionFailure ? { ...a, retentionFailure } : a;
  }
}
export async function originalBytes(
  client,
  artifact,
  maximum = 16 * 1024 * 1024,
) {
  const bytes =
    artifact.archivedBytes ??
    (await downloadReleaseArtifact(client, artifact, maximum));
  assert.ok(bytes.length <= maximum);
  assert.equal("sha256:" + hash(bytes), artifact.digest);
  return bytes;
}
export async function originalManifest(client, env, checkpoint) {
  const a = await originArtifact(
    client,
    {
      runId: env.QUALIFICATION_RUN,
      attempt: env.QUALIFICATION_ATTEMPT,
      filename: ".github/workflows/release.yml",
      commit: env.GITHUB_SHA,
      logical:
        "release-qualification-" +
        env.QUALIFICATION_RUN +
        "-" +
        env.QUALIFICATION_ATTEMPT,
    },
    checkpoint,
  );
  const archive = await originalBytes(client, a);
  assert.equal("sha256:" + hash(archive), a.digest);
  const files = readZipArchiveFilesWith(archive, {
    crc32,
    expectedNames: new Set(["manifest.json"]),
    maximumUncompressedBytes: 256 * 1024,
  });
  assert.deepEqual(
    files.map((f) => f.path),
    ["manifest.json"],
  );
  const bytes = files[0].content;
  assert.equal(hash(bytes), env.MANIFEST_SHA256);
  let manifest = json(bytes);
  // Early schema-2 manifests included the digest without embedding the matrix bytes.
  if (manifest.schemaVersion === 2 && manifest.runtimeMatrix === undefined) {
    const matrix = checkpoint?.files.get("runtime-matrix.json");
    assert.ok(
      matrix,
      "Retain the original frozen matrix for this promoted manifest",
    );
    manifest = { ...manifest, runtimeMatrix: json(matrix) };
  }
  subject(manifest);
  assert.deepEqual(
    [manifest.runId, manifest.attempt, manifest.commit],
    [env.QUALIFICATION_RUN, env.QUALIFICATION_ATTEMPT, env.GITHUB_SHA],
  );
  assert.equal(
    manifest.package.version,
    env.QUALIFIED_VERSION ?? PACKAGE_VERSION,
  );
  const ciProducer =
    qualificationBaseSchema(manifest) === 2 ? manifest.ci.build : undefined;
  const runId = ciProducer ? String(ciProducer.runId) : manifest.runId;
  const attempt = ciProducer
    ? String(ciProducer.producingAttempt)
    : manifest.attempt;
  const candidate = await originArtifact(
    client,
    {
      runId,
      attempt,
      filename: ciProducer ? CI_WORKFLOW : manifest.workflow,
      commit: ciProducer?.providerHead ?? manifest.commit,
      ciProducer,
      logical: `${PACKAGE_FILE_STEM}-${manifest.package.version}-candidate-${runId}-${attempt}`,
      artifactId: manifest.candidateId,
    },
    checkpoint,
  );
  assert.equal(candidate.digest, "sha256:" + manifest.candidateDigest);
  if (ciProducer) {
    assert.equal(
      candidate.name,
      manifest.ci.candidate.name,
      "Promoted physical candidate name changed",
    );
    assert.equal(
      candidate.size_in_bytes,
      manifest.ci.candidate.bytes,
      "Promoted candidate size changed",
    );
  }
  return { manifest, candidate, manifestBytes: bytes };
}
export async function stageOnce({
  qualificationAdvisory,
  manifest,
  bytes,
  path,
  channel,
  before,
  env,
  journal,
  command,
}) {
  subject(manifest);
  assert.ok(["pilot", "latest"].includes(channel), "Unapproved stage channel");
  checkStageBytes(bytes, manifest);
  if (manifest.consumerResolutionPolicy === 2)
    assertQualificationAdvisory(qualificationAdvisory);
  const common = {
    ...(qualificationAdvisory ? { qualificationAdvisory } : {}),
    schemaVersion: 1,
    package: PACKAGE_NAME,
    version: manifest.package.version,
    channel,
    before,
    githubLatestBefore:
      env.GITHUB_LATEST_BEFORE === "null"
        ? null
        : Number(env.GITHUB_LATEST_BEFORE),
    commit: manifest.commit,
    ...(env.GITHUB_SHA && env.GITHUB_SHA !== manifest.commit
      ? { controller: env.GITHUB_SHA }
      : {}),
    manifestSha256: env.MANIFEST_SHA256,
    qualificationRun: manifest.runId,
    qualificationAttempt: manifest.attempt,
    workflow: stageWorkflow,
    runId: id(env.GITHUB_RUN_ID),
    attempt: id(env.GITHUB_RUN_ATTEMPT),
  };
  const record = (item) =>
    appendFileSync(journal, JSON.stringify({ ...common, ...item }) + "\n", {
      flush: true,
    });
  writeFileSync(journal, "", { flag: "wx" });
  record({ state: "REQUESTED" });
  try {
    const response = json(
      command([
        "stage",
        "publish",
        path,
        "--ignore-scripts",
        "--access=public",
        "--tag=" + channel,
        "--provenance",
        "--json",
        "--registry=" + registry,
      ]),
    );
    assert.deepEqual(Object.keys(response), [PACKAGE_NAME]);
    const item = response[PACKAGE_NAME];
    assert.deepEqual(
      [item.name, item.version, item.integrity],
      [PACKAGE_NAME, manifest.package.version, manifest.integrity],
    );
    assert.match(item.stageId, /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/iu);
    const receipt = { state: "STAGED", stageId: item.stageId };
    record(receipt);
    return { ...common, ...receipt };
  } catch (error) {
    record({ state: "OUTCOME_UNKNOWN" });
    throw error;
  }
}
export async function assertPriorOperations(
  client,
  env,
  checkpoint,
  kind,
  { requireTiming = false, excludeRun } = {},
) {
  const workflows = {
    stage: ["stage-release.yml", "Stage the admitted tarball"],
    labels: ["release-labels.yml", "Apply approved npm labels (npm)"],
    classification: [
      "release-classification.yml",
      "Settle release classification (github)",
    ],
    draft: [
      "github-release.yml",
      "Prepare or seal verified GitHub release (draft)",
    ],
    seal: [
      "github-release.yml",
      "Prepare or seal verified GitHub release (seal)",
    ],
  };
  const [workflow, step] = workflows[kind];
  const prior = await readWorkflowRuns((path) => client.read(path), workflow);
  let lastWriterAt = -Infinity;
  for (const run of prior.filter(
    (r) => ![env.GITHUB_RUN_ID, excludeRun].includes(String(r.id)),
  )) {
    if (queuedFirstAttempt(run, env)) continue;
    assert.ok(
      run.status === "completed",
      "Concurrent or unresolved stage request",
    );
    for (let attempt = 1; attempt <= run.run_attempt; attempt++) {
      const jobs = await client.read(
        "/actions/runs/" +
          id(run.id) +
          "/attempts/" +
          attempt +
          "/jobs?per_page=100",
      );
      assert.equal(jobs.jobs.length, jobs.total_count);
      const writes = jobs.jobs
        .flatMap((j) => j.steps ?? [])
        .filter((s) => s.name === step && !["skipped"].includes(s.conclusion));
      if (writes.length) {
        if (requireTiming) {
          const times = writes.map((s) => Date.parse(s.completed_at));
          assert.ok(
            times.every((time) => Number.isFinite(time) && time <= Date.now()),
            "A previous writer's exact end time is unknown",
          );
          lastWriterAt = Math.max(lastWriterAt, ...times);
        }
        const disposition = priorDisposition(
          checkpoint,
          kind + "-" + run.id + "-" + attempt + ".json",
        );
        assert.equal(disposition.runId, String(run.id));
        assert.equal(disposition.attempt, String(attempt));
        if (kind === "stage" && disposition.state === "NO_REQUEST") {
          const artifact = await originArtifact(
            client,
            {
              filename: stageWorkflow,
              commit: run.head_sha,
              runId: run.id,
              attempt,
              logical: "release-stage-" + run.id + "-" + attempt,
              stageFailure: "before-request",
            },
            checkpoint,
          );
          const files = readZipArchiveFilesWith(
            await originalBytes(client, artifact),
            { crc32 },
          );
          assert.deepEqual(
            files.map((f) => f.path),
            ["journal.jsonl"],
          );
          assert.match(disposition.manifestSha256, /^[a-f0-9]{64}$/u);
          assert.deepEqual(json(files[0].content), {
            state: "NO_REQUEST",
            runId: String(run.id),
            attempt: String(attempt),
            controller: run.head_sha,
            manifestSha256: disposition.manifestSha256,
          });
          continue;
        }
        assert.ok(
          (kind === "stage"
            ? ["REJECTED", "IMMUTABLE_VERIFIED", "WITHDRAWN"]
            : [
                "RECONCILED",
                "SETTLED",
                ...(kind === "labels" ? ["REQUEST_REFUSED"] : []),
              ]
          ).includes(disposition.state),
        );
        if (kind === "classification" && env.OPERATION_SHA256)
          assert.notEqual(
            disposition.operationSha256,
            env.OPERATION_SHA256,
            "Reconcile original classification",
          );
        if (kind === "stage" && env.MANIFEST_SHA256) {
          assert.match(disposition.manifestSha256, /^[a-f0-9]{64}$/u);
          assert.notEqual(
            disposition.manifestSha256,
            env.MANIFEST_SHA256,
            "Existing request requires original reconciliation",
          );
        }
      }
    }
  }
  return lastWriterAt;
}

export function queuedFirstAttempt(run, env) {
  return (
    env.GITHUB_ACTIONS === "true" &&
    env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
    env.GITHUB_REF === "refs/heads/main" &&
    run.run_attempt === 1 &&
    ["requested", "queued", "pending", "waiting"].includes(run.status)
  );
}
async function preflight(client, env, checkpoint, intent, manifest) {
  assert.equal(env.GITHUB_REPOSITORY, repo);
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  assert.equal(
    env.GITHUB_RUN_ATTEMPT,
    "1",
    "Reruns must reconcile original history",
  );
  const main = await client.read("/branches/main");
  assert.ok(
    main.name === "main" &&
      main.protected === true &&
      main.commit?.sha === env.GITHUB_SHA,
    "The stage controller is no longer current protected main",
  );
  assert.equal(
    await client.read("/git/ref/tags/v" + PACKAGE_VERSION, { accept404: true }),
    null,
    "Canonical tag already exists",
  );
  const resp = await fetch(
    registry + encodeURIComponent(PACKAGE_NAME) + "/" + PACKAGE_VERSION,
    { redirect: "error", signal: AbortSignal.timeout(15000) },
  );
  await resp.body?.cancel();
  assert.equal(resp.status, 404, "Coordinate must be unused");
  const history = await verifyReservations(client, checkpoint, env, "stage", {
    trackWriterTime: true,
  });
  assert.deepEqual(
    [
      intent.controller ?? intent.commit,
      intent.version,
      intent.run,
      intent.attempt,
      intent.manifestSha256,
      intent.channel,
    ],
    [
      env.GITHUB_SHA,
      PACKAGE_VERSION,
      env.QUALIFICATION_RUN,
      env.QUALIFICATION_ATTEMPT,
      env.MANIFEST_SHA256,
      env.RELEASE_CHANNEL,
    ],
  );
  assert.deepEqual(
    intent.writerCutover,
    {
      directPublishDisabled: true,
      legacyWritersDisabled: true,
      stageBindingVerified: true,
      protectedEnvironmentVerified: true,
    },
    "Owner provider readback is required",
  );
  assert.ok(
    intent.githubLatestBefore === null ||
      Number.isSafeInteger(intent.githubLatestBefore),
  );
  assert.equal(
    (await client.read("/releases/latest", { accept404: true }))?.id ?? null,
    intent.githubLatestBefore,
  );
  assert.equal(intent.tarballSha256, env.QUALIFIED_TARBALL_SHA256);
  const lastWriterAt = Math.max(
    history.lastWriterAt,
    await assertPriorOperations(client, env, checkpoint, "stage", {
      requireTiming: true,
    }),
    await assertPriorOperations(client, env, checkpoint, "labels", {
      requireTiming: true,
    }),
    await assertPriorOperations(client, env, checkpoint, "classification", {
      requireTiming: true,
    }),
  );
  assertPrivateStageInventory(intent.privateInventory, {
    coordinate: PACKAGE_NAME + "@" + PACKAGE_VERSION,
    lastWriterAt,
  });
  const reviewed = {};
  for (const path of stageRightsInputs) {
    const bytes = readFileSync(new URL("../" + path, import.meta.url));
    const { review, reviewStatus } = json(bytes);
    assert.equal(
      review?.status ?? reviewStatus,
      "REVIEWED",
      path + " requires human review",
    );
    reviewed[path] = hash(bytes);
  }
  assertStageAuthority({
    policy: json(
      readFileSync(
        new URL(
          "../docs/release/staged-publication-policy.json",
          import.meta.url,
        ),
      ),
    ),
    intent,
    manifest,
    reviewed,
    benchmark: checkpoint.files.get("benchmark-disposition.json"),
  });
  if (qualificationBaseSchema(manifest) === 2)
    await verifyPromotedAdmission({
      read: (path) => client.read(path),
      ci: manifest.ci,
      commit: manifest.commit,
      matrixSha256: manifest.ci.matrixSha256,
    });
  await assertStageLabelPreimage(intent);
  return lastWriterAt;
}
async function assertStageLabelPreimage(intent) {
  const tags = json(
    await readPublicRegistry(
      new URL(
        "-/package/" + encodeURIComponent(PACKAGE_NAME) + "/dist-tags",
        registry,
      ),
      { maxBytes: 64 * 1024 },
    ),
  );
  const observed = Object.fromEntries(
    ["pilot", "latest", "next"].map((tag) => [tag, tags[tag] ?? null]),
  );
  assert.deepEqual(observed, intent.before, "Public tag preimages changed");
  return observed;
}
export async function runStagedRelease() {
  const [mode, ...args] = process.argv.slice(2);
  if (mode === "verify-private") {
    assert.equal(
      args.length,
      5,
      "Expected manifest, manifest SHA-256, stage journal, native view JSON, downloaded tarball",
    );
    const [manifestPath, digest, journal, viewPath, tarball] = args;
    const bytes = readFileSync(manifestPath);
    assert.equal(hash(bytes), digest);
    const manifest = json(bytes);
    const journalBytes = readFileSync(journal);
    const receipt = readStageJournal(journalBytes, manifest, digest);
    const report = verifyPrivateStage({
      manifest,
      receipt,
      view: json(readFileSync(viewPath)),
      bytes: readFileSync(tarball),
      manifestSha256: digest,
    });
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }
  assert.ok(["admit", "stage", "preflight"].includes(mode));
  const env = process.env;
  let requestStarted = false;
  try {
    await executeStage(mode, env, () => {
      requestStarted = true;
    });
  } catch (error) {
    if (mode === "stage" && !requestStarted) {
      const dir = resolve(env.GITHUB_WORKSPACE, ".release/stage");
      mkdirSync(dir, { recursive: true });
      // Never replace an existing or partial request journal with a no-effect receipt.
      writeFileSync(
        join(dir, "journal.jsonl"),
        JSON.stringify({
          state: "NO_REQUEST",
          runId: env.GITHUB_RUN_ID,
          attempt: env.GITHUB_RUN_ATTEMPT,
          controller: env.GITHUB_SHA,
          manifestSha256: env.MANIFEST_SHA256,
        }) + "\n",
        { flag: "wx", flush: true },
      );
    }
    throw error;
  }
}
/** Complete advisory readback before admitting or submitting one new npm stage request. */
export async function verifyNewStageAdvisories(
  client,
  { env, checkpoint, manifest, manifestBytes, candidate, now = Date.now() },
) {
  assert.equal(
    manifest.consumerResolutionPolicy,
    2,
    "New stage requires the current consumer reconciliation policy",
  );
  assert.ok(
    ["fresh", "reuse"].includes(manifest.qualificationMode),
    "Historical qualification cannot authorise a new stage",
  );
  if (manifest.qualificationMode === "reuse")
    assert.equal(
      manifest.ci?.schemaVersion,
      2,
      "A legacy CI projection cannot authorise a new stage",
    );
  assert.equal(
    hash(manifestBytes),
    env.MANIFEST_SHA256,
    "Different stage admission manifest",
  );
  const { loadQualificationAuditBatch } =
    await import("./qualification-audit-batch.mjs");
  const { verifyHostedAdvisoryReceipt } =
    await import("./release-audit-job.mjs");
  const { withAuditNpmClients } = await import("./release-audit-runtimes.mjs");
  const { npmCli } = selectNpmCliForVersion({
    expectedNpm: CI_RUNTIME.npm,
    candidates: findNpmCliCandidates(),
    observeVersion: observeNpmVersion,
  });
  return withAuditNpmClients(npmCli, async (npmCliForVersion) => {
    const batch = await loadQualificationAuditBatch(
      client,
      { ...env, QUALIFIED_COMMIT: manifest.commit },
      npmCli,
      {
        checkpoint,
        expectedManifestSha256: env.MANIFEST_SHA256,
        manifest,
        candidateArtifact: candidate,
        now,
        npmCliForVersion,
      },
    );
    return verifyHostedAdvisoryReceipt({
      client,
      checkpoint,
      entries: batch.entries,
      npmCli,
      now,
      runId: batch.run.id,
      attempt: batch.run.run_attempt,
      controller: manifest.commit,
      workflow: ".github/workflows/release.yml",
    });
  });
}

async function executeStage(mode, env, beginRequest) {
  const client = new GitHubReleaseClient({
    repository: repo,
    token: env.GH_TOKEN,
  });
  const checkpoint = await readCheckpoint(client, env.HISTORY_OBJECT);
  const intent = json(checkpoint.files.get("stage-intent.json"));
  assert.equal(intent.controller ?? intent.commit, env.GITHUB_SHA);
  verifyControllerDelta(intent.commit, env.GITHUB_SHA, checkpoint.files);
  const { manifest, candidate, manifestBytes } = await originalManifest(
    client,
    { ...env, GITHUB_SHA: intent.commit },
    checkpoint,
  );
  assert.ok(
    !candidate.archivedBytes && !candidate.expired,
    "Staging needs the downloadable original candidate",
  );
  const lastWriterAt = await preflight(
    client,
    {
      ...env,
      QUALIFIED_TARBALL_SHA256: manifest.assets.tarball.sha256,
    },
    checkpoint,
    intent,
    manifest,
  );
  if (manifest.schemaVersion === 3)
    await verifyCorpusQualification(manifest, { env });
  // Both admission and the protected writer reopen the same native inputs.
  // A personal stage intent cannot substitute for the protected advisory receipt.
  const advisory = await verifyNewStageAdvisories(client, {
    env,
    checkpoint,
    manifest,
    manifestBytes,
    candidate,
  });
  if (mode !== "stage") {
    emit(
      {
        artifact_id: id(candidate.id),
        artifact_run_id: id(candidate.workflow_run.id),
      },
      "Stage intent and original candidate verified read-only.",
      { env },
    );
    return;
  }
  assert.equal(env.RUNNER_ENVIRONMENT, "github-hosted");
  assert.ok(
    env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
  );
  const path = resolve("candidate", manifest.assets.tarball.name);
  assert.equal(
    manifest.assets.tarball.name,
    `${PACKAGE_FILE_STEM}-${PACKAGE_VERSION}.tgz`,
  );
  assert.ok(lstatSync(path).isFile());
  const scratch = resolve(env.RUNNER_TEMP, "owlapi-stage");
  mkdirSync(scratch, { recursive: false });
  const clean = {
    PATH: env.PATH,
    HOME: scratch,
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: env.GITHUB_EVENT_NAME,
    RUNNER_ENVIRONMENT: env.RUNNER_ENVIRONMENT,
  };
  for (const [k, v] of Object.entries(env))
    if (
      (k.startsWith("GITHUB_") && !k.includes("TOKEN")) ||
      k.startsWith("ACTIONS_ID_TOKEN_REQUEST_")
    )
      clean[k] = v;
  clean.NPM_CONFIG_USERCONFIG = join(scratch, "empty.npmrc");
  writeFileSync(clean.NPM_CONFIG_USERCONFIG, "", { flag: "wx" });
  clean.NPM_CONFIG_FETCH_RETRIES = "0";
  const { npmCli } = selectNpmCliForVersion({
    expectedNpm: CI_RUNTIME.npm,
    candidates: findNpmCliCandidates(),
    observeVersion: observeNpmVersion,
  });
  const journalDirectory = resolve(env.GITHUB_WORKSPACE, ".release/stage");
  mkdirSync(journalDirectory, { recursive: true });
  await readReleaseSecurity({
    read: (path) => client.read(path),
    commit: env.GITHUB_SHA,
  });
  const before = await assertStageLabelPreimage(intent);
  assert.equal(
    (await client.read("/releases/latest", { accept404: true }))?.id ?? null,
    intent.githubLatestBefore,
    "GitHub latest preimage changed",
  );
  assertPrivateStageInventory(intent.privateInventory, {
    coordinate: PACKAGE_NAME + "@" + PACKAGE_VERSION,
    lastWriterAt,
  });
  assertAdvisoryDecisionCurrent(advisory.decision);
  await stageOnce({
    qualificationAdvisory: qualificationAdvisoryMarker(advisory),
    manifest,
    before,
    bytes: readFileSync(path),
    path,
    channel: env.RELEASE_CHANNEL,
    env: {
      ...env,
      GITHUB_LATEST_BEFORE: JSON.stringify(intent.githubLatestBefore),
    },
    journal: join(journalDirectory, "journal.jsonl"),
    command: (args) => {
      beginRequest();
      return execFileSync(process.execPath, [npmCli, ...args], {
        cwd: scratch,
        env: clean,
        timeout: 120000,
        stdio: ["ignore", "pipe", "pipe"],
      });
    },
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runStagedRelease();
