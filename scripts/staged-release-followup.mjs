import { PACKAGE_FILE_STEM, REPOSITORY as repo } from "./release-identity.mjs";
import {
  assertImmutableQualificationAssets,
  validateStagedReleaseEvidence,
} from "./staged-evidence.mjs";
import assert from "node:assert/strict";
import { qualificationBaseSchema } from "./corpus-qualification-manifest.mjs";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync, crc32 } from "node:zlib";
import {
  GitHubReleaseClient,
  assertDraftRelease,
  assertReleaseId,
  assertReleaseAssets,
  assertReleaseAssetSubset,
} from "./github-release.mjs";
import {
  readCheckpoint,
  verifyControllerDelta,
  verifyReservations,
} from "./release-history-checkpoint.mjs";
import {
  hash,
  assertPriorOperations,
  originArtifact,
  originalBytes,
  originalManifest,
  readStageJournal,
} from "./staged-release.mjs";
import {
  hasZipDirectory,
  readZipArchiveFilesWith,
} from "./release-zip-core.mjs";
import { verifyLocalReleaseTag } from "./verify-release-tag.mjs";
import { readPublicRegistry } from "./public-registry-read.mjs";
import { PACKAGE_NAME, NPM_REGISTRY } from "./package-identity.mjs";
import {
  publicRecipientInput,
  qualificationRuntimeMatrix,
  readPublicAuditSubjects,
  readPublicEvidence,
} from "./release-public-proof.mjs";
import { submittedStagePolicy } from "./release-stage-continuation.mjs";
import {
  projectLegacyProducerProof,
  readLiveLegacyProducerProof,
} from "./release-legacy-proof-disclosure.mjs";
import { matchesLogicalArtifact } from "../tooling/artifact-transport/identity.mjs";
import {
  assertPublicTestAfter,
  publicEvaluatorExecution,
  publicExecutionWindow,
} from "./public-reconciliation-proof.mjs";
import {
  archiveAdvisory,
  assertTimedUpload,
  reopenStageQualificationAdvisory,
  verifyHostedAdvisoryReceipt,
} from "./release-audit-job.mjs";
import { qualificationAdvisoryMarker } from "./qualification-advisory-binding.mjs";
import { readControllerBlob } from "./release-controller-blob.mjs";
import { verifyArchivedPublicRelease } from "./public-archive-verification.mjs";
import { withAuditNpmClients } from "./release-audit-runtimes.mjs";
import {
  assertAdvisoryCasesCurrent,
  assertAdvisoryDecisionCurrent,
} from "./release-audit-evaluator.mjs";
import {
  latestRecordedTime,
  releaseTime,
  sealAuthorizationTime,
} from "./release-native-time.mjs";
import {
  findNpmCliCandidates,
  observeNpmVersion,
  selectNpmCliForVersion,
} from "./assert-workflow-runtime.mjs";
import { CI_RUNTIME, validateRuntimePolicy } from "./runtime-policy.mjs";
import { CI_WORKFLOW } from "./ci-verification.mjs";
import { canonicalJson } from "./canonical-json.mjs";

const parse = (bytes) => JSON.parse(bytes.toString("utf8"));
const positive = (n) => Number.isSafeInteger(n) && n > 0;
const producerNpm = () =>
  selectNpmCliForVersion({
    expectedNpm: CI_RUNTIME.npm,
    candidates: findNpmCliCandidates(),
    observeVersion: observeNpmVersion,
  }).npmCli;
const rawAuditMember = (name) =>
  /(?:^|\/)(?:npm-audit-[^/]+|normal-consumer-npm-audit-production|transport-audit)\.json$/iu.test(
    name,
  );
const zipMember = (name, bytes) =>
  /\.zip$/iu.test(name) || hasZipDirectory(bytes);
const qualificationZipRoster = (manifest) => {
  const descriptors =
    qualificationBaseSchema(manifest) === 1
      ? manifest.artifacts
      : [
          manifest.ci.candidate,
          manifest.ci.main.receipt,
          manifest.ci.build.receipt,
          manifest.ci.packageProof,
        ];
  return new Map(
    descriptors.map((descriptor) => [
      `artifact-${descriptor.id}.zip`,
      descriptor,
    ]),
  );
};

function assertDisclosedQualificationZip(name, bytes, roster) {
  if (!zipMember(name, bytes)) return;
  const expected = roster?.get(name);
  assert.ok(
    expected,
    "ZIP is outside the authenticated qualification ZIP roster",
  );
  assert.equal(bytes.length, expected.bytes);
  assert.equal(`sha256:${hash(bytes)}`, expected.digest);
  assert.ok(
    readZipArchiveFilesWith(bytes, {
      crc32,
      maximumUncompressedBytes: 48 * 1024 * 1024,
    }).every(
      ({ path, content }) => !rawAuditMember(path) && !zipMember(path, content),
    ),
    "Qualification ZIP contains raw npm audit output or a nested ZIP",
  );
}

/** Apply disclosed substitutions before any entry can reach a new seal asset. */
export function appendQualificationDisclosure(
  archiveEntries,
  { manifest, publicIndex, read, projections },
) {
  const zipRoster = qualificationZipRoster(manifest);
  for (const name of publicIndex.files) {
    assert.ok(!archiveEntries.has(name), "Duplicate public archive entry");
    assert.ok(
      !rawAuditMember(name),
      "Raw npm audit output is outside the public evidence inventory",
    );
    const disclosed = projections.get(name) ?? { name, bytes: read(name) };
    assert.ok(
      !archiveEntries.has(disclosed.name),
      "Duplicate public archive entry",
    );
    assertDisclosedQualificationZip(disclosed.name, disclosed.bytes, zipRoster);
    archiveEntries.set(disclosed.name, disclosed.bytes);
  }
}
const asset = (name, bytes) => ({
  name,
  bytes: bytes.length,
  sha256: hash(bytes),
});
const single = (items, message) => {
  assert.equal(items.length, 1, message);
  return items[0];
};

export async function readStageContext(client, env, checkpoint, mode, renewal) {
  assert.equal(env.GITHUB_REPOSITORY, repo);
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  const read = (name) => {
    assert.ok(
      checkpoint.files.has(name),
      "Missing signed checkpoint payload " + name,
    );
    return checkpoint.files.get(name);
  };
  const operation = parse(read("operation.json"));
  assert.equal(operation.type, mode);
  assert.match(operation.version, /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/u);
  const tag = "v" + operation.version;
  assert.match(operation.manifestSha256, /^[a-f0-9]{64}$/u);
  assert.match(operation.source, /^[a-f0-9]{40}$/u);
  assert.equal(
    renewal?.controller ?? operation.controller,
    env.GITHUB_SHA,
    "Operation requires owner approval for the executing controller",
  );
  const origin = {
    ...env,
    GITHUB_SHA: operation.source,
    QUALIFIED_VERSION: operation.version,
    QUALIFICATION_RUN: operation.qualificationRun,
    QUALIFICATION_ATTEMPT: operation.qualificationAttempt,
    MANIFEST_SHA256: operation.manifestSha256,
  };
  const { manifest, manifestBytes, candidate } = await originalManifest(
    client,
    origin,
    checkpoint,
  );
  const stageController = operation.stageController ?? manifest.commit;
  assert.match(stageController, /^[a-f0-9]{40}$/u);
  const a = await originArtifact(
    client,
    {
      runId: operation.stageRun,
      attempt: operation.stageAttempt,
      filename: ".github/workflows/stage-release.yml",
      commit: stageController,
      logical:
        "release-stage-" + operation.stageRun + "-" + operation.stageAttempt,
      stageFailure: "retention",
      requireArchivedFailure: mode === "seal",
    },
    checkpoint,
  );
  const archive = await originalBytes(client, a);
  assert.equal("sha256:" + hash(archive), a.digest);
  const files = readZipArchiveFilesWith(archive, { crc32 });
  assert.deepEqual(
    files.map((f) => f.path),
    ["journal.jsonl"],
  );
  const journal = files[0].content;
  const receipt = readStageJournal(
    journal,
    manifest,
    operation.manifestSha256,
    {
      runId: operation.stageRun,
      attempt: operation.stageAttempt,
      controller: stageController,
    },
  );
  const privateProof = parse(read("private-check.json"));
  assert.deepEqual(privateProof, {
    ...receipt,
    state: "PRIVATE_BYTES_VERIFIED",
    sha256: manifest.assets.tarball.sha256,
    integrity: manifest.integrity,
  });
  assert.equal(operation.stageId, receipt.stageId);
  if (manifest.consumerResolutionPolicy === undefined) {
    const main = await client.read("/branches/main");
    assert.ok(
      main.name === "main" &&
        main.protected === true &&
        main.commit?.sha === env.GITHUB_SHA,
      "Legacy stages require the running protected main controller",
    );
  }
  const recipientPolicy = submittedStagePolicy(manifest, receipt, {
    controller: env.GITHUB_SHA,
  });
  verifyControllerDelta(
    operation.source,
    operation.controller,
    checkpoint.files,
    { alreadySubmittedLegacyStage: recipientPolicy === 1 },
  );
  const ref = await client.read("/git/ref/tags/" + tag);
  assert.equal(ref.object.type, "tag");
  assert.equal(ref.object.sha, operation.tagObject);
  const remote = await client.read("/git/tags/" + ref.object.sha);
  assert.equal(remote.object.sha, manifest.commit);
  assert.equal(remote.tag, tag);
  assert.equal(remote.verification?.verified, true);
  assert.equal(
    execFileSync("git", ["rev-parse", "refs/tags/" + tag], {
      encoding: "utf8",
    }).trim(),
    ref.object.sha,
  );
  verifyLocalReleaseTag({
    repositoryRoot: process.cwd(),
    expectedTag: tag,
    expectedCommit: manifest.commit,
    registry: parse(readFileSync("docs/provenance/release-signers.json")),
    releaseDate: new Date().toISOString().slice(0, 10),
  });
  return {
    operation,
    manifest,
    manifestBytes,
    candidate,
    journal,
    retentionFailure: a.retentionFailure,
    receipt,
    recipientPolicy,
    privateProof,
    read,
  };
}
const followupDir = ".release/followup";
const followupWorkflow = ".github/workflows/github-release.yml";
const appendJournal = (path, row) =>
  appendFileSync(path, JSON.stringify(row) + "\n", { flush: true });
const draftBody = (ctx) =>
  JSON.stringify({
    tag_name: "v" + ctx.operation.version,
    target_commitish: ctx.manifest.commit,
    name: "owlapi " + ctx.operation.version,
    body: ctx.read("release-notes.md").toString("utf8"),
    draft: true,
    prerelease: true,
    make_latest: "false",
  });
const draftSubject = ({ operation, manifest }) => ({
  version: operation.version,
  manifestSha256: operation.manifestSha256,
  source: manifest.commit,
  stageId: operation.stageId,
  tagObject: operation.tagObject,
});

export async function draft(client, ctx, attempt) {
  const { operation, manifest, read } = ctx;
  const tag = "v" + operation.version;
  const notes = read("release-notes.md").toString("utf8");
  assert.deepEqual(Object.keys(manifest.assets).sort(), [
    "checksums",
    "sbom",
    "tarball",
  ]);
  for (const item of Object.values(manifest.assets))
    assert.deepEqual(asset(item.name, read(item.name)), item);
  let release = await client.getReleaseByTag(tag);
  if (positive(operation.expectedReleaseId)) {
    assert.equal(
      attempt?.originalDraftId,
      operation.expectedReleaseId,
      "Continuation requires the authenticated original draft",
    );
    assert.equal(
      release?.id,
      operation.expectedReleaseId,
      "Reconciliation needs the original draft ID",
    );
  } else {
    assert.equal(operation.expectedReleaseId, null);
    assert.equal(
      release,
      null,
      "Existing draft requires signed reconciliation",
    );
    const { journal, ...execution } = attempt;
    assert.equal(execution.attempt, "1");
    const body = draftBody(ctx);
    const requested = {
      ...execution,
      ...draftSubject(ctx),
      state: "DRAFT_REQUESTED",
      requestSha256: hash(body),
    };
    writeFileSync(journal, "", { flag: "wx" });
    appendJournal(journal, requested);
    const result = await client.write("/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    assert.equal(
      result.state,
      "CONFIRMED",
      "Ambiguous draft creation requires owner reconciliation",
    );
    release = result.value;
    assert.ok(positive(release?.id), "Missing native draft acknowledgement");
    appendJournal(journal, {
      ...requested,
      state: "DRAFT_ACKNOWLEDGED",
      releaseId: release.id,
    });
  }
  assertDraftRelease(release, { tag });
  assert.equal(release.prerelease, true);
  assert.equal(release.body, notes);
  const expected = await attachMissingAssets(
    client,
    release,
    Object.values(manifest.assets),
    read,
  );
  const observed = await client.read("/releases/" + release.id);
  assertReleaseId(observed, release.id);
  assertDraftRelease(observed, { tag });
  assert.equal(observed.prerelease, true);
  assert.equal(observed.body, notes);
  assertReleaseAssets({
    assets: observed.assets,
    expected,
  });
  return {
    state: "DRAFT_VERIFIED",
    releaseId: release.id,
    tagObject: operation.tagObject,
    stageId: operation.stageId,
    manifestSha256: operation.manifestSha256,
    assetIds: Object.fromEntries(expected.map((a) => [a.name, a.id])),
  };
}

export async function attachMissingAssets(client, release, items, read) {
  assertReleaseAssetSubset({ assets: release.assets, expected: items });
  const observed = new Map(release.assets.map((item) => [item.name, item.id]));
  const bound = [];
  for (const item of items) {
    const id = observed.has(item.name)
      ? observed.get(item.name)
      : await upload(client, release.id, item, read(item.name));
    assert.ok(positive(id), "Missing original release asset ID");
    bound.push({ ...item, id });
  }
  return bound;
}

async function readWriterAttempt(
  client,
  checkpoint,
  origin,
  kind,
  { requireNumber = true } = {},
) {
  assert.ok(origin && origin.attempt === "1");
  assert.match(origin.runId, /^[1-9]\d{0,15}$/u);
  const bindRunNumber = requireNumber || origin.number !== undefined;
  if (bindRunNumber) assert.match(String(origin.number), /^[1-9]\d{0,9}$/u);
  const logical = "github-release-" + origin.runId + "-1";
  const retained = checkpoint.files.get(
    "origin-" + origin.runId + "-1-" + logical + ".json",
  );
  const saved = retained && parse(retained);
  const available = async (path, fallback) => {
    try {
      return await client.read(path);
    } catch (error) {
      if (fallback && [404, 410].includes(error.httpStatus)) return fallback;
      throw error;
    }
  };
  const runPath = "/actions/runs/" + origin.runId + "/attempts/1";
  const run = await available(runPath, saved?.run);
  if (bindRunNumber)
    assert.equal(String(run.run_number), String(origin.number));
  assert.deepEqual(
    [
      String(run.id),
      run.run_attempt,
      run.path,
      run.event,
      run.head_branch,
      run.head_sha,
      run.repository?.full_name,
      run.head_repository?.full_name,
      run.status,
    ],
    [
      origin.runId,
      1,
      followupWorkflow,
      "workflow_dispatch",
      "main",
      origin.controller,
      repo,
      repo,
      "completed",
    ],
  );
  const jobs = await available(runPath + "/jobs?per_page=100", saved?.jobs);
  assert.equal(jobs.total_count, jobs.jobs.length);
  const job = single(
    jobs.jobs.filter((job) => job.name === kind),
    "Missing original GitHub writer job",
  );
  assert.deepEqual(
    [String(job.run_id), job.run_attempt, job.head_sha, job.status],
    [origin.runId, 1, origin.controller, "completed"],
  );
  const steps = job.steps.filter(
    (step) =>
      step.name === "Prepare or seal verified GitHub release (" + kind + ")",
  );
  assert.ok(steps.length <= 1);
  const skipped =
    steps[0]?.conclusion === "skipped" ||
    (steps.length === 0 && job.conclusion === "skipped");
  return { logical, skipped, step: steps[0], run, job };
}

async function readWriterRecords(client, checkpoint, origin, kind, attempt) {
  const { logical, step } =
    attempt ?? (await readWriterAttempt(client, checkpoint, origin, kind));
  assert.ok(
    step?.status === "completed" &&
      ["success", "failure"].includes(step.conclusion),
    "Missing completed original GitHub writer step",
  );
  assert.ok(Date.parse(step.started_at) <= Date.parse(step.completed_at));
  const a = await originArtifact(
    client,
    {
      runId: origin.runId,
      attempt: "1",
      commit: origin.controller,
      filename: followupWorkflow,
      logical,
      recoverSeal: true,
    },
    checkpoint,
  );
  const archive = readZipArchiveFilesWith(await originalBytes(client, a), {
    crc32,
  });
  return new Map(archive.map((entry) => [entry.path, entry.content]));
}

export async function assertEarlierWritersStopped(
  client,
  checkpoint,
  previous,
  kind,
) {
  for (const { number, objectId, origin } of previous) {
    assert.equal(String(origin.number), number);
    assert.equal(origin.reservation, objectId);
    const attempt = await readWriterAttempt(client, checkpoint, origin, kind);
    if (attempt.skipped) continue;
    const records = await readWriterRecords(
      client,
      checkpoint,
      origin,
      kind,
      attempt,
    );
    assert.ok(
      !records.has(requestJournal(kind)),
      "The original writer request can only be reconciled",
    );
    assert.deepEqual(
      parse(records.get(noRequestName(kind))),
      noRequestRecord(kind, objectId, origin),
    );
  }
}

async function readOriginalDraftId(client, checkpoint, ctx) {
  const origin = parse(ctx.read("draft-origin.json"));
  const original = await readCheckpoint(client, origin.checkpoint);
  assert.equal(
    original.tag,
    "owlapi-release-history/draft-" +
      ctx.operation.version +
      "-create-" +
      origin.number,
  );
  const intent = parse(original.files.get("operation.json"));
  assert.equal(intent.type, "draft");
  assert.equal(intent.expectedReleaseId, null);
  assert.equal(intent.controller, origin.controller);
  for (const [name, value] of Object.entries(draftSubject(ctx)))
    assert.equal(intent[name], value);
  const records = await readWriterRecords(client, checkpoint, origin, "draft");
  const journal = records.get("draft-journal.jsonl");
  assert.ok(journal, "Missing original draft acknowledgement");
  assert.equal(hash(journal), origin.journalSha256);
  const rows = journal.toString("utf8").trimEnd().split("\n").map(JSON.parse);
  const request = {
    ...draftSubject(ctx),
    state: "DRAFT_REQUESTED",
    requestSha256: hash(draftBody(ctx)),
    checkpoint: origin.checkpoint,
    controller: origin.controller,
    runId: origin.runId,
    attempt: "1",
  };
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], request);
  assert.deepEqual(rows[1], {
    ...request,
    state: "DRAFT_ACKNOWLEDGED",
    releaseId: ctx.operation.expectedReleaseId,
  });
  return rows[1].releaseId;
}
async function upload(client, id, item, bytes) {
  assert.ok(positive(id));
  assert.deepEqual(asset(item.name, bytes), item);
  const result = await client.write(
    "/releases/" + id + "/assets?name=" + encodeURIComponent(item.name),
    {
      method: "POST",
      upload: true,
      headers: { "Content-Type": "application/octet-stream" },
      body: bytes,
    },
  );
  assert.equal(
    result.state,
    "CONFIRMED",
    "Asset acknowledgement missing; inspect original draft",
  );
  assert.ok(positive(result.value?.id), "Missing native uploaded asset ID");
  return result.value.id;
}
export async function approvedDraft(client, ctx, extraAssets = []) {
  const { operation, read, manifest } = ctx;
  const tag = "v" + operation.version;
  const proof = parse(read("draft.json"));
  const { assetIds, ...identity } = proof;
  assert.deepEqual(identity, {
    state: "DRAFT_VERIFIED",
    releaseId: operation.releaseId,
    tagObject: operation.tagObject,
    stageId: operation.stageId,
    manifestSha256: operation.manifestSha256,
  });
  assert.ok(positive(proof.releaseId));
  // Registry observers are read-only and may not receive GitHub draft objects.
  if (operation.type === "registry")
    return recordedApproval(ctx, proof.releaseId);
  const live = await client.read("/releases/" + proof.releaseId);
  assertReleaseId(live, proof.releaseId);
  assertDraftRelease(live, { tag });
  assert.equal(live.prerelease, true);
  assertReleaseAssets({
    assets: live.assets.filter(
      (a) => !extraAssets.some((extra) => extra.name === a.name),
    ),
    expected: Object.values(manifest.assets).map((item) => ({
      ...item,
      id: assetIds?.[item.name],
    })),
  });
  assert.equal(live.body, read("release-notes.md").toString("utf8"));
  assert.equal(live.name, "owlapi " + operation.version);
  if (operation.type === "before-approval") {
    const observed = await readPublicLabels();
    assert.deepEqual(
      observed,
      ctx.receipt.before,
      "Public label changed while awaiting approval",
    );
    const latest =
      (await client.read("/releases/latest", { accept404: true }))?.id ?? null;
    assert.equal(latest, ctx.receipt.githubLatestBefore);
    return {
      state: "READY_FOR_OWNER_APPROVAL",
      releaseId: live.id,
      stageId: operation.stageId,
      manifestSha256: operation.manifestSha256,
      labels: observed,
      githubLatest: latest,
      checkedAt: new Date().toISOString(),
    };
  }
  return recordedApproval(ctx, proof.releaseId, live.created_at);
}
function recordedApproval(
  { operation, read, receipt },
  releaseId,
  liveCreatedAt,
) {
  const preapproval = read("before-approval.json");
  const verified = parse(preapproval);
  const approval = parse(read("approval.json"));
  assert.equal(approval.preapprovalSha256, hash(preapproval));
  assert.equal(verified.state, "READY_FOR_OWNER_APPROVAL");
  assert.deepEqual(
    [
      verified.releaseId,
      verified.stageId,
      verified.manifestSha256,
      verified.labels,
      verified.githubLatest,
    ],
    [
      releaseId,
      operation.stageId,
      operation.manifestSha256,
      receipt.before,
      receipt.githubLatestBefore,
    ],
  );
  assert.ok(
    Date.parse(verified.checkedAt) <= Date.parse(approval.approvedAt) &&
      Date.parse(approval.approvedAt) - Date.parse(verified.checkedAt) <=
        5 * 60 * 1000,
  );
  assert.equal(approval.stageId, operation.stageId);
  assert.equal(approval.releaseId, releaseId);
  assert.equal(approval.state, "APPROVED");
  if (liveCreatedAt !== undefined)
    assert.ok(
      Date.parse(liveCreatedAt) <= Date.parse(verified.checkedAt),
      "The original draft must predate owner approval",
    );
  assert.ok(Date.parse(approval.approvedAt) <= Date.now());
  return approval;
}
async function registryProof(client, ctx) {
  const approval = await approvedDraft(client, ctx);
  const { PACKAGE_VERSION } = await import("./package-identity.mjs");
  assert.equal(
    ctx.operation.version,
    PACKAGE_VERSION,
    "Use the reviewed recipient controller for the qualified package version",
  );
  const { qualifyPublicRegistry } =
    await import("./qualify-public-registry.mjs");
  const { manifest, receipt } = ctx;
  const matrix = qualificationRuntimeMatrix(manifest);
  const input = publicRecipientInput(ctx, matrix, {
    reconciled: ctx.recipientPolicy === 2,
  });
  const sbom = qualifiedSbom(ctx);
  const proof = await qualifyPublicRegistry({
    candidate: {
      package: manifest.package,
      tarball: manifest.assets.tarball,
      integrity: manifest.integrity,
    },
    stagedSbom: sbom,
    recipientPolicy: ctx.recipientPolicy,
    outputPath: ".release/followup/public.json",
    stageOrigin: { ...receipt, approvedAt: approval.approvedAt },
    publication: () => ({ ...receipt, acceptedAt: approval.approvedAt }),
  });
  writeFileSync(
    join(followupDir, "recipient-input.json"),
    JSON.stringify(input) + "\n",
    { flag: "wx" },
  );
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    "matrix=" +
      JSON.stringify(matrix) +
      "\nrecipient_policy=" +
      ctx.recipientPolicy +
      "\nrecipient_input=" +
      JSON.stringify(input) +
      "\n",
  );
  return proof;
}
function qualifiedSbom(ctx) {
  const item = ctx.manifest.assets.sbom;
  const bytes = ctx.read(item.name);
  assert.deepEqual(asset(item.name, bytes), item);
  return parse(bytes);
}
export function checkSealSettings(operationBytes, renewal, now = Date.now()) {
  const operation = parse(operationBytes);
  assert.equal(operation.type, "seal");
  if (renewal)
    assert.equal(
      renewal.operationSha256,
      hash(operationBytes),
      "Settings renewal must bind the original seal operation bytes",
    );
  const settings = (renewal ?? operation).immutableReleases;
  assert.ok(settings, "Seal settings require top-level immutableReleases");
  assert.equal(
    settings.evidence.url,
    "https://api.github.com/repos/" + repo + "/immutable-releases",
  );
  assert.equal(typeof settings.responseJson, "string");
  assert.equal(
    hash(settings.responseJson),
    settings.evidence.sha256,
    "Immutable settings response digest mismatch",
  );
  assert.equal(
    JSON.parse(settings.responseJson).enabled,
    true,
    "Immutable releases must be enabled",
  );
  const checked = Date.parse(settings.checkedAt);
  assert.ok(
    checked <= now && now - checked <= 3_600_000,
    "Immutable settings read must be at most one hour old",
  );
}
async function readSealRenewal(
  client,
  objectId,
  original,
  executingController,
) {
  const checkpoint = await readCheckpoint(client, objectId);
  const renewal = parse(checkpoint.files.get("seal-settings.json"));
  const operationBytes = original.files.get("operation.json");
  const operation = parse(operationBytes);
  assert.equal(operation.type, "seal");
  assert.equal(renewal.operationSha256, hash(operationBytes));
  assert.equal(renewal.controller ?? operation.controller, executingController);
  verifyControllerDelta(
    operation.controller,
    executingController,
    checkpoint.files,
  );
  return { ...renewal, checkpoint: checkpoint.objectId, authority: checkpoint };
}
async function verifyQualificationDisclosure(
  client,
  ctx,
  checkpoint,
  publicIndex,
) {
  const { manifest, read, candidate } = ctx;
  const projections = new Map();
  const legacy = ctx.recipientPolicy === 1;
  const legacyProjection = async (artifact, locator) => {
    const bytes = await readLiveLegacyProducerProof(client, {
      original: artifact,
      locator,
      publicIndex,
      checkpoint,
    });
    const runtime = validateRuntimePolicy(
      parse(
        readControllerBlob(manifest.commit, "docs/release/runtime-policy.json"),
      ),
    );
    const projection = await projectLegacyProducerProof({
      original: artifact,
      bytes,
      manifest,
      manifestSha256: ctx.operation.manifestSha256,
      tarball: read(manifest.assets.tarball.name),
      sbom: read(manifest.assets.sbom.name),
      checksum: read(manifest.assets.checksums.name),
      platform: {
        os: "linux",
        cpu: "x64",
        libc: "glibc",
        node: runtime.node[runtime.canonicalNodeMajor],
      },
      npm: runtime.npm,
    });
    projections.set(projection.name, projection);
  };
  const verify = (artifact) => {
    const name = "artifact-" + artifact.id + ".zip";
    assert.ok(
      publicIndex.files.includes(name),
      "Qualification archive requires disclosure review",
    );
    const original = read(name);
    assert.equal("sha256:" + hash(original), artifact.digest);
    assert.equal(original.length, artifact.bytes);
    if (
      ctx.recipientPolicy === 2 &&
      artifact.id === manifest.ci?.packageProof?.id
    ) {
      const allowed = ["candidate-manifest.json", "consumer-resolutions.json"];
      const members = readZipArchiveFilesWith(original, {
        crc32,
        expectedNames: new Set(allowed),
        maximumUncompressedBytes: 16 * 1024 * 1024,
      });
      assert.deepEqual(members.map(({ path }) => path).sort(), allowed);
    }
  };
  if (qualificationBaseSchema(manifest) === 1) {
    const logical = `package-proof-${manifest.runId}-${manifest.attempt}`;
    for (const artifact of manifest.artifacts) {
      if (
        !legacy ||
        !matchesLogicalArtifact(artifact.name, logical, {
          run: manifest.runId,
          attempt: manifest.attempt,
        })
      ) {
        verify(artifact);
        continue;
      }
      await legacyProjection(artifact, {
        runId: manifest.runId,
        attempt: manifest.attempt,
        filename: manifest.workflow,
        commit: manifest.commit,
        logical,
      });
    }
    return projections;
  }
  const ci = manifest.ci;
  verify(ci.candidate);
  assert.equal(candidate.id, ci.candidate.id);
  const build = ci.build;
  const distinct = new Set([candidate.id]);
  for (const [run, descriptor, attempt, logical, producer] of [
    ...[ci.main, build].map((record) => [
      record,
      record.receipt,
      record.attempt,
      (record.event === "pull_request"
        ? "ci-verification-"
        : "ci-main-qualification-") +
        record.runId +
        "-" +
        record.attempt,
    ]),
    [
      build,
      ci.packageProof,
      build.producingAttempt,
      "package-proof-" + build.runId + "-" + build.producingAttempt,
      build,
    ],
  ]) {
    if (distinct.has(descriptor.id)) {
      assert.deepEqual(
        ci.main.receipt,
        build.receipt,
        "Unexpected shared qualification artifact",
      );
      assert.equal(descriptor.id, build.receipt.id);
      continue;
    }
    distinct.add(descriptor.id);
    const locator = {
      runId: run.runId,
      attempt,
      filename: CI_WORKFLOW,
      commit: run.providerHead,
      logical,
      artifactId: descriptor.id,
      ciRun: run,
      ciProducer: producer,
    };
    if (legacy && descriptor.id === ci.packageProof.id) {
      await legacyProjection(descriptor, locator);
      continue;
    }
    verify(descriptor);
    const original = await originArtifact(client, locator, checkpoint);
    assert.deepEqual(
      [
        original.id,
        original.name,
        original.digest,
        original.size_in_bytes,
        original.workflow_run?.repository_id,
        original.workflow_run?.head_repository_id,
      ],
      [
        descriptor.id,
        descriptor.name,
        descriptor.digest,
        descriptor.bytes,
        ci.repositoryId,
        ci.repositoryId,
      ],
      "Qualification ZIP differs from its original native inventory",
    );
  }
  return projections;
}

async function readPublicLabels() {
  const tags = parse(
    await readPublicRegistry(
      new URL(
        "-/package/" + encodeURIComponent(PACKAGE_NAME) + "/dist-tags",
        NPM_REGISTRY,
      ),
      { maxBytes: 64 * 1024 },
    ),
  );
  return Object.fromEntries(
    ["pilot", "latest", "next"].map((tag) => [tag, tags[tag] ?? null]),
  );
}

async function assertSealPreimages(client, ctx, report, expected) {
  const { operation, receipt, read } = ctx;
  const release = await client.read("/releases/" + operation.releaseId);
  assertReleaseId(release, operation.releaseId);
  assertDraftRelease(release, { tag: "v" + operation.version });
  assert.equal(release.prerelease, true);
  assert.equal(release.name, "owlapi " + operation.version);
  assert.equal(release.body, read("release-notes.md").toString("utf8"));
  assertReleaseAssetSubset({ assets: release.assets, expected });
  assert.equal(
    (await client.read("/releases/latest", { accept404: true }))?.id ?? null,
    receipt.githubLatestBefore,
    "GitHub latest changed during public verification",
  );
  const tags = { ...receipt.before, [receipt.channel]: operation.version };
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(tags).map((key) => [key, report.distTags[key] ?? null]),
    ),
    tags,
  );
  assert.deepEqual(
    await readPublicLabels(),
    tags,
    "npm labels changed during public verification",
  );
  return release;
}

async function seal(client, ctx, checkpoint, renewal, execution) {
  const { operation, manifest, receipt, read } = ctx;
  assert.ok([1, 2].includes(ctx.recipientPolicy));
  const reconciled = ctx.recipientPolicy === 2;
  const operationBytes = read("operation.json");
  checkSealSettings(operationBytes, renewal);
  const tag = "v" + operation.version;
  const report = parse(read("public.json"));
  assert.equal(report.schemaVersion, ctx.recipientPolicy);
  assert.equal(report.result, "PASS");
  assert.equal(report.coordinate, PACKAGE_NAME + "@" + operation.version);
  assert.equal(report.tarballSha256, manifest.assets.tarball.sha256);
  assert.equal(report.integrity, manifest.integrity);
  assert.equal(
    report.provenance.workflow,
    ".github/workflows/stage-release.yml",
  );
  assert.equal(report.provenance.runId, ctx.receipt.runId);
  assert.equal(report.provenance.runAttempt, Number(ctx.receipt.attempt));
  assert.equal(
    report.provenance.sourceCommit,
    ctx.receipt.controller ?? manifest.commit,
  );
  assert.equal(report.publication.stageId, operation.stageId);
  const archiveEntries = new Map();
  for (const name of [
    "private-check.json",
    "draft.json",
    "approval.json",
    "before-approval.json",
    "operation.json",
    "public.json",
    "release-notes.md",
  ])
    archiveEntries.set(name, read(name));
  // Only the owner's explicit public inventory can cross from the private checkpoint to release assets.
  const publicIndex = parse(read("public-inventory.json"));
  assert.equal(publicIndex.manifestSha256, operation.manifestSha256);
  const projections = await verifyQualificationDisclosure(
    client,
    ctx,
    checkpoint,
    publicIndex,
  );
  appendQualificationDisclosure(archiveEntries, {
    manifest,
    publicIndex,
    read,
    projections,
  });
  archiveEntries.set("public-inventory.json", read("public-inventory.json"));
  let publicAdvisory, checkCurrentAdvisory;
  if (reconciled) {
    // Reopen the exact qualification that the protected stage actually admitted. A public
    // registry decision is a later observation and cannot substitute for that admission.
    const npmCli = producerNpm();
    const qualification = await reopenStageQualificationAdvisory(client, {
      checkpoint,
      manifest,
      stage: receipt,
      npmCli,
    });
    assert.deepEqual(
      qualificationAdvisoryMarker(qualification),
      receipt.qualificationAdvisory,
      "Qualification changed after staging",
    );
    assertAdvisoryCasesCurrent(qualification.decision);
    archiveAdvisory(archiveEntries, "qualification", qualification);
    const runtimeBytes = readControllerBlob(
      manifest.commit,
      "docs/release/runtime-policy.json",
    );
    const originalPolicy = parse(runtimeBytes);
    const matrix = qualificationRuntimeMatrix(manifest, originalPolicy);
    assert.ok(
      !archiveEntries.has("qualified-runtime-policy.json"),
      "Duplicate qualified runtime policy",
    );
    archiveEntries.set("qualified-runtime-policy.json", runtimeBytes);
    const tarball = read(manifest.assets.tarball.name);
    const measured = await withAuditNpmClients(npmCli, (npmCliForVersion) =>
      readPublicAuditSubjects(
        client,
        checkpoint,
        operation,
        matrix,
        publicRecipientInput(ctx, matrix, { reconciled: true }),
        {
          tarball,
          npmCli: npmCliForVersion(CI_RUNTIME.consumerNpm),
          pinnedReport: read("public.json"),
          complete: true,
        },
      ),
    );
    const verified = await verifyHostedAdvisoryReceipt({
      client,
      checkpoint,
      entries: measured.entries,
      npmCli,
      runId: operation.publicRun,
      attempt: operation.publicAttempt,
      controller: operation.publicController,
      workflow: ".github/workflows/release-registry.yml",
    });
    publicAdvisory = {
      runId: operation.publicRun,
      attempt: operation.publicAttempt,
      controller: operation.publicController,
      policySha256: verified.decision.policySha256,
      descriptor: verified.descriptor,
    };
    assert.equal(measured.testAdvisories.length, matrix.include.length);
    const evaluatorTiming = publicEvaluatorExecution(verified.job);
    const { start: evaluationStart, end: evaluationEnd } =
      publicExecutionWindow(evaluatorTiming);
    const { attempt: materialAttempt, timing: materialTiming } =
      measured.materialExecution;
    assert.ok(
      verified.job.run_attempt >= materialAttempt &&
        evaluationStart >= publicExecutionWindow(materialTiming).end,
      "Public advisory preceded the original material job",
    );
    assert.ok(
      releaseTime(verified.decision.decidedAt) >= evaluationStart &&
        releaseTime(verified.decision.decidedAt) <=
          latestRecordedTime(evaluatorTiming.completedAt),
      "The public advisory was issued outside its original evaluator job",
    );
    let lastPublicCompletion = evaluationEnd;
    for (const tested of measured.testAdvisories) {
      assert.deepEqual(
        tested.descriptor,
        verified.descriptor,
        "A public test used a different protected advisory decision",
      );
      assert.ok(
        tested.attempt >= verified.job.run_attempt,
        "Public replay is from an earlier attempt than its advisory",
      );
      assertPublicTestAfter(tested.execution, evaluatorTiming, "advisory");
      lastPublicCompletion = Math.max(
        lastPublicCompletion,
        publicExecutionWindow(tested.execution).end,
      );
    }
    archiveAdvisory(measured.files, "public", verified);
    for (const [name, bytes] of measured.files) {
      assert.ok(!archiveEntries.has(name));
      archiveEntries.set(name, bytes);
    }
    checkCurrentAdvisory = (sealTime) => {
      assert.ok(
        lastPublicCompletion <= sealTime,
        "The native seal cannot run before public testing finishes",
      );
      assertAdvisoryDecisionCurrent(verified.decision, sealTime);
      assertAdvisoryCasesCurrent(qualification.decision, sealTime);
    };
  } else {
    const matrix = qualificationRuntimeMatrix(manifest);
    for (const [name, bytes] of await readPublicEvidence(
      client,
      checkpoint,
      operation,
      matrix,
      publicRecipientInput(ctx, matrix),
      read("public.json"),
      qualifiedSbom(ctx),
    )) {
      assert.ok(!archiveEntries.has(name));
      archiveEntries.set(name, bytes);
    }
  }
  archiveEntries.set("manifest.json", ctx.manifestBytes);
  archiveEntries.set("stage-journal.jsonl", ctx.journal);
  if (ctx.retentionFailure) {
    assert.ok(!archiveEntries.has("stage-retention-failure.json"));
    archiveEntries.set(
      "stage-retention-failure.json",
      Buffer.from(JSON.stringify(ctx.retentionFailure) + "\n"),
    );
  }
  const archive = gzipSync(
    Buffer.from(
      canonicalJson({
        schemaVersion: reconciled ? 3 : 2,
        checkpoint: checkpoint.objectId,
        files: [...archiveEntries].map(([name, bytes]) => ({
          ...asset(name, bytes),
          base64: bytes.toString("base64"),
        })),
      }),
    ),
  );
  readStagedArchive(archive);
  const archiveInfo = asset(
    `${PACKAGE_FILE_STEM}-${operation.version}.evidence.json.gz`,
    archive,
  );
  const evidence = Buffer.from(
    JSON.stringify(
      {
        schemaVersion: reconciled ? 8 : 7,
        releaseId: operation.releaseId,
        source: manifest.commit,
        tagObject: operation.tagObject,
        stage: ctx.receipt,
        publicVerification: report,
        ...(reconciled ? { publicAdvisory } : {}),
        archive: archiveInfo,
        assets: manifest.assets,
      },
      null,
      2,
    ) + "\n",
  );
  validateStagedReleaseEvidence(parse(evidence));
  const evidenceInfo = asset(
    `${PACKAGE_FILE_STEM}-${operation.version}.release-evidence.json`,
    evidence,
  );
  const assetIds = parse(read("draft.json")).assetIds;
  const originalItems = Object.values(manifest.assets);
  const items = [...originalItems, archiveInfo, evidenceInfo];
  assert.ok(
    items.every((a) => a.bytes <= 64 * 1024 * 1024),
    "Asset exceeds immutable verification limit",
  );
  await approvedDraft(client, ctx, [archiveInfo, evidenceInfo]);
  const existing = await assertSealPreimages(
    client,
    ctx,
    report,
    items.map((item) => ({ ...item, id: assetIds?.[item.name] })),
  );
  checkSealSettings(operationBytes, renewal);
  assertReleaseAssets({
    assets: existing.assets.filter((a) =>
      originalItems.some((item) => item.name === a.name),
    ),
    expected: originalItems.map((item) => ({
      ...item,
      id: assetIds?.[item.name],
    })),
  });
  const missing = new Map([
    [archiveInfo.name, archive],
    [evidenceInfo.name, evidence],
  ]);
  const expected = await attachMissingAssets(client, existing, items, (name) =>
    missing.get(name),
  );
  const draft = await assertSealPreimages(client, ctx, report, expected);
  assertReleaseAssets({ assets: draft.assets, expected });
  checkSealSettings(operationBytes, renewal);
  const sealTime = Date.now();
  checkCurrentAdvisory?.(sealTime);
  const record = {
    state: "SEAL_REQUESTED",
    ...(reconciled
      ? {
          authorizedAt: new Date(sealTime).toISOString(),
          releaseEvidenceSchema: 8,
          publicAdvisory,
        }
      : {}),
    ...(renewal ? { settingsCheckpoint: renewal.checkpoint } : {}),
    checkpoint: checkpoint.objectId,
    controller: renewal?.controller ?? operation.controller,
    notesSha256: hash(read("release-notes.md")),
    version: operation.version,
    prerelease: true,
    releaseId: operation.releaseId,
    tagObject: operation.tagObject,
    source: manifest.commit,
    runId: execution.runId,
    attempt: execution.attempt,
    assets: expected.map((item) => {
      const id = draft.assets.find((asset) => asset.name === item.name).id;
      assert.ok(positive(id), "Missing native seal asset ID");
      return { ...item, id };
    }),
  };
  writeFileSync(
    ".release/followup/seal-request.json",
    JSON.stringify(record) + "\n",
    { flag: "wx", flush: true },
  );
  const result = await client.write("/releases/" + operation.releaseId, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      draft: false,
      name: "owlapi " + operation.version,
      body: read("release-notes.md").toString("utf8"),
      prerelease: true,
      make_latest: "false",
    }),
  });
  assert.equal(
    result.state,
    "CONFIRMED",
    "Ambiguous seal requires immutable readback",
  );
  assertReleaseId(result.value, operation.releaseId);
  assert.equal(result.value.tag_name, tag);
  assert.equal(result.value.draft, false);
  if (reconciled)
    sealAuthorizationTime(record.authorizedAt, result.value.published_at);
  return { ...record, state: "SEALED" };
}
export async function reconcilePublishedSeal(client, request) {
  assert.equal(request.state, "SEAL_REQUESTED");
  assert.ok(positive(request.releaseId));
  const release = await client.read("/releases/" + request.releaseId);
  assert.deepEqual(
    [
      release.id,
      release.tag_name,
      release.immutable,
      release.draft,
      release.prerelease,
      release.name,
      hash(release.body),
    ],
    [
      request.releaseId,
      "v" + request.version,
      true,
      false,
      true,
      "owlapi " + request.version,
      request.notesSha256,
    ],
  );
  assertReleaseAssets({ assets: release.assets, expected: request.assets });
  if (request.releaseEvidenceSchema === 8)
    sealAuthorizationTime(request.authorizedAt, release.published_at);
  return { ...request, state: "SEALED" };
}

export function readStagedArchive(archive) {
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(
    gunzipSync(archive, { maxOutputLength: 96 * 1024 * 1024 }),
  );
  const record = JSON.parse(raw);
  if (record.schemaVersion >= 2)
    assert.equal(raw, canonicalJson(record), "Noncanonical archive index");
  assert.deepEqual(Object.keys(record).sort(), [
    "checkpoint",
    "files",
    "schemaVersion",
  ]);
  assert.ok([1, 2, 3].includes(record.schemaVersion));
  assert.match(record.checkpoint, /^[a-f0-9]{40}$/u);
  assert.ok(
    Array.isArray(record.files) &&
      record.files.length > 0 &&
      record.files.length <= 300,
  );
  const files = new Map();
  const names = new Set();
  for (const item of record.files) {
    assert.deepEqual(Object.keys(item).sort(), [
      "base64",
      "bytes",
      "name",
      "sha256",
    ]);
    assert.match(item.name, /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,160}$/u);
    const key = item.name.toLowerCase();
    assert.ok(!names.has(key), "Duplicate or colliding archive member");
    names.add(key);
    assert.ok(Number.isSafeInteger(item.bytes) && item.bytes >= 0);
    const bytes = Buffer.from(item.base64, "base64");
    assert.equal(
      bytes.toString("base64"),
      item.base64,
      "Invalid archive member encoding",
    );
    assert.equal(bytes.length, item.bytes);
    assert.equal(hash(bytes), item.sha256);
    files.set(item.name, bytes);
  }
  if (record.schemaVersion === 3) {
    const required = [
      "qualified-runtime-policy.json",
      "qualification-advisory.json",
      "qualification-advisory.sigstore.json",
      "qualification-advisory-job.json",
      "public-native.json",
      "public-material.json",
      "public-advisory.json",
      "public-advisory.sigstore.json",
      "public-advisory-job.json",
      "recipient-input.json",
    ];
    assert.ok(
      required.every((name) => files.has(name)),
      "Missing reconciled public archive evidence",
    );
    assert.ok(
      [...files.keys()].every((name) => !rawAuditMember(name)),
      "Raw npm audit output is outside the public evidence inventory",
    );
    const zipRoster =
      files.has("manifest.json") &&
      [...files].some(([name, bytes]) => zipMember(name, bytes))
        ? qualificationZipRoster(parse(files.get("manifest.json")))
        : undefined;
    for (const [name, bytes] of files)
      assertDisclosedQualificationZip(name, bytes, zipRoster);
  }
  return {
    schemaVersion: record.schemaVersion,
    checkpoint: record.checkpoint,
    files,
  };
}
async function originalSealRequest(client, checkpoint, origin, recoverSeal) {
  const a = await originArtifact(
    client,
    {
      runId: origin.runId,
      attempt: origin.attempt,
      commit: origin.controller,
      filename: ".github/workflows/github-release.yml",
      logical: "github-release-" + origin.runId + "-" + origin.attempt,
      recoverSeal,
    },
    checkpoint,
  );
  const archive = readZipArchiveFilesWith(await originalBytes(client, a), {
    crc32,
  });
  const file = single(
    archive.filter((f) => f.path === "seal-request.json"),
    "Missing attributable seal request",
  );
  const request = parse(file.content);
  assert.equal(request.state, "SEAL_REQUESTED");
  if (request.releaseEvidenceSchema === 8) {
    assert.deepEqual(
      [request.runId, request.attempt, request.controller, request.checkpoint],
      [origin.runId, origin.attempt, origin.controller, origin.checkpoint],
    );
    const { run, job, step } = await readWriterAttempt(
      client,
      checkpoint,
      origin,
      "seal",
      { requireNumber: false },
    );
    assert.ok(positive(job.id), "Missing original native seal job identity");
    assert.ok(
      step?.status === "completed" &&
        (step.conclusion === "success" ||
          (recoverSeal && step.conclusion === "failure")),
      "Missing original native seal writer step",
    );
    const authorized = releaseTime(request.authorizedAt);
    assert.equal(
      request.authorizedAt,
      new Date(authorized).toISOString(),
      "Missing precise native seal authorization time",
    );
    assert.ok(
      authorized >= releaseTime(step.started_at) &&
        authorized <= latestRecordedTime(step.completed_at),
      "Seal authorization is outside its original native writer step",
    );
    assertTimedUpload(
      a,
      run,
      job,
      "github-release-" + origin.runId + "-" + origin.attempt,
      "Retain original operation evidence",
    );
  }
  return { request, bytes: file.content };
}

/** The signed standalone successful receipt must agree with the protected writer's original request. */
export async function verifyOriginalSealRecord(client, checkpoint, record) {
  const { request } = await originalSealRequest(
    client,
    checkpoint,
    record,
    false,
  );
  assert.deepEqual(
    record,
    { ...request, state: "SEALED" },
    "Standalone seal differs from the original authorized request",
  );
  return record;
}

async function recoverSeal(client, checkpoint) {
  const origin = parse(checkpoint.files.get("seal-origin.json"));
  const { request, bytes } = await originalSealRequest(
    client,
    checkpoint,
    origin,
    true,
  );
  assert.equal(hash(bytes), origin.requestSha256);
  assert.deepEqual(
    [request.checkpoint, request.controller],
    [origin.checkpoint, origin.controller],
  );
  const original = await readCheckpoint(client, origin.checkpoint);
  const operation = parse(original.files.get("operation.json"));
  if (request.runId !== undefined)
    assert.deepEqual(
      [request.runId, request.attempt],
      [origin.runId, origin.attempt],
    );
  if (request.settingsCheckpoint)
    await readSealRenewal(
      client,
      request.settingsCheckpoint,
      original,
      request.controller,
    );
  else assert.equal(operation.controller, request.controller);
  assert.deepEqual(
    [
      operation.type,
      operation.version,
      operation.releaseId,
      operation.tagObject,
      operation.source,
    ],
    [
      "seal",
      request.version,
      request.releaseId,
      request.tagObject,
      request.source,
    ],
  );
  assert.equal(
    request.notesSha256,
    hash(original.files.get("release-notes.md")),
  );
  if (request.releaseEvidenceSchema === 8)
    assert.deepEqual(
      [
        request.publicAdvisory.runId,
        request.publicAdvisory.attempt,
        request.publicAdvisory.controller,
      ],
      [
        operation.publicRun,
        operation.publicAttempt,
        operation.publicController,
      ],
    );
  return reconcilePublishedSeal(client, request);
}
export async function completeRelease(client, env, checkpoint) {
  const { runGh, waitForReleaseAttestation, downloadAsset } =
    await import("./verify-immutable-release.mjs");
  const record = checkpoint.files.has("seal.json")
    ? parse(checkpoint.files.get("seal.json"))
    : await recoverSeal(client, checkpoint);
  assert.equal(record.state, "SEALED");
  if (record.releaseEvidenceSchema === 8 && checkpoint.files.has("seal.json"))
    await verifyOriginalSealRecord(client, checkpoint, record);
  assert.match(record.version, /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/u);
  const tag = "v" + record.version;
  assert.ok(positive(record.releaseId));
  const expectedNames = [
    "SHA256SUMS",
    ...[".cdx.json", ".tgz", ".release-evidence.json", ".evidence.json.gz"].map(
      (suffix) => `${PACKAGE_FILE_STEM}-${record.version}${suffix}`,
    ),
  ];
  assert.deepEqual(
    record.assets.map((a) => a.name).sort(),
    expectedNames.sort(),
  );
  const { release } = await waitForReleaseAttestation({
    read: (path) => client.read(path),
    tag,
    tagSha: record.tagObject,
    sourceCommit: record.source,
    releaseId: record.releaseId,
    expectedAssets: record.assets,
    prerelease: record.prerelease,
  });
  await runGh(
    "gh",
    ["release", "verify", tag, "--repo", repo, "--format", "json"],
    env.GH_TOKEN,
  );
  const scratch = mkdtempSync(join(tmpdir(), "owlapi-completion-"));
  const originals = new Map();
  let evidenceSchema;
  try {
    for (const a of release.assets) {
      const file = await downloadAsset({
        repository: repo,
        token: env.GH_TOKEN,
        asset: a,
        directory: scratch,
      });
      const bytes = readFileSync(file);
      assert.equal(
        hash(bytes),
        record.assets.find((item) => item.name === basename(file)).sha256,
      );
      originals.set(a.name, bytes);
      await runGh(
        "gh",
        [
          "release",
          "verify-asset",
          tag,
          file,
          "--repo",
          repo,
          "--format",
          "json",
        ],
        env.GH_TOKEN,
      );
    }
    const stem = `${PACKAGE_FILE_STEM}-${record.version}`;
    const evidence = validateStagedReleaseEvidence(
      parse(originals.get(stem + ".release-evidence.json")),
    );
    evidenceSchema = evidence.schemaVersion;
    if (evidenceSchema === 8)
      assertImmutableQualificationAssets(evidence.assets, originals);
    assert.equal(
      evidenceSchema,
      record.releaseEvidenceSchema ?? 7,
      "Immutable release evidence differs from the admitted seal protocol",
    );
    assert.deepEqual(
      [evidence.releaseId, evidence.source, evidence.tagObject],
      [record.releaseId, record.source, record.tagObject],
    );
    const archivedBytes = originals.get(stem + ".evidence.json.gz");
    assert.deepEqual(
      asset(evidence.archive.name, archivedBytes),
      evidence.archive,
    );
    const archive = readStagedArchive(archivedBytes);
    assert.equal(archive.checkpoint, record.checkpoint);
    const manifest = parse(archive.files.get("manifest.json"));
    assert.equal(manifest.commit, record.source);
    assert.equal(manifest.package.version, record.version);
    assert.equal(
      hash(archive.files.get("release-notes.md")),
      record.notesSha256,
    );
    if (evidenceSchema === 8) {
      assert.equal(archive.schemaVersion, 3);
      assert.deepEqual(evidence.publicAdvisory, record.publicAdvisory);
      await verifyArchivedPublicRelease(archive.files, evidence, {
        client,
        tarball: originals.get(stem + ".tgz"),
        npmCli: producerNpm(),
        publishedAt: release.published_at,
        sealAuthorizedAt: record.authorizedAt,
      });
    } else assert.ok([1, 2].includes(archive.schemaVersion));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return {
    ...record,
    state: "IMMUTABLE_VERIFIED",
    releaseEvidenceSchema: evidenceSchema,
  };
}
function requestJournal(kind) {
  return kind === "draft" ? "draft-journal.jsonl" : "seal-request.json";
}
function noRequestName(kind) {
  return kind + "-no-request.json";
}
function noRequestRecord(kind, reservation, { runId, attempt, controller }) {
  return {
    state: kind === "draft" ? "CREATE_NOT_REQUESTED" : "SEAL_NOT_REQUESTED",
    reservation,
    runId,
    attempt,
    controller,
  };
}

async function executeFollowup(mode, env) {
  if (mode === "check-seal-settings") {
    assert.ok(
      [4, 5].includes(process.argv.length),
      "Expected seal operation.json and optional seal-settings.json",
    );
    const operationBytes = readFileSync(process.argv[3]);
    const renewal = process.argv[4] && parse(readFileSync(process.argv[4]));
    checkSealSettings(operationBytes, renewal);
    return;
  }
  assert.equal(env.GITHUB_REPOSITORY, repo);
  assert.equal(env.GITHUB_REF, "refs/heads/main");
  const client = new GitHubReleaseClient({
    repository: repo,
    token: env.GH_TOKEN,
  });
  const checkpoint = await readCheckpoint(client, env.HISTORY_OBJECT);
  mkdirSync(".release/followup", { recursive: true });
  let result;
  if (mode === "complete")
    result = await completeRelease(client, env, checkpoint);
  else {
    const renewal =
      mode === "seal" && env.SETTINGS_OBJECT
        ? await readSealRenewal(
            client,
            env.SETTINGS_OBJECT,
            checkpoint,
            env.GITHUB_SHA,
          )
        : undefined;
    const ctx = await readStageContext(client, env, checkpoint, mode, renewal);
    if (mode === "draft" || mode === "seal") {
      const authority = renewal?.authority ?? checkpoint;
      const create =
        mode === "draft" && ctx.operation.expectedReleaseId === null;
      const { preceding } = await verifyReservations(
        client,
        authority,
        env,
        mode,
        {
          version: ctx.operation.version,
          create,
        },
      );
      for (const kind of ["stage", "labels", "classification", "draft", "seal"])
        await assertPriorOperations(client, env, authority, kind, {
          excludeRun: kind === "stage" ? ctx.receipt.runId : undefined,
        });
      await assertEarlierWritersStopped(client, authority, preceding, mode);
      const main = await client.read("/branches/main");
      assert.ok(
        main.protected && main.commit?.sha === env.GITHUB_SHA,
        "The writer controller is no longer current protected main",
      );
      const execution = {
        checkpoint: checkpoint.objectId,
        controller: env.GITHUB_SHA,
        runId: env.GITHUB_RUN_ID,
        attempt: env.GITHUB_RUN_ATTEMPT,
      };
      if (mode === "draft") {
        result = await draft(client, ctx, {
          ...execution,
          journal: join(followupDir, "draft-journal.jsonl"),
          ...(!create
            ? {
                originalDraftId: await readOriginalDraftId(
                  client,
                  authority,
                  ctx,
                ),
              }
            : {}),
        });
      } else {
        result = await seal(client, ctx, checkpoint, renewal, execution);
      }
    } else if (mode === "before-approval")
      result = await approvedDraft(client, ctx);
    else if (mode === "registry") {
      await registryProof(client, ctx);
      return;
    } else throw Error("Unknown release follow-up operation");
  }
  writeFileSync(
    join(".release/followup", mode + ".json"),
    JSON.stringify(result, null, 2) + "\n",
    { flag: "wx" },
  );
}
async function main() {
  const mode = process.argv[2],
    env = process.env;
  try {
    await executeFollowup(mode, env);
  } catch (error) {
    if (
      ["draft", "seal"].includes(mode) &&
      env.GITHUB_REPOSITORY === repo &&
      env.GITHUB_REF === "refs/heads/main" &&
      !existsSync(join(followupDir, requestJournal(mode)))
    ) {
      mkdirSync(followupDir, { recursive: true });
      const record = noRequestRecord(
        mode,
        env.SETTINGS_OBJECT || env.HISTORY_OBJECT,
        {
          runId: env.GITHUB_RUN_ID,
          attempt: env.GITHUB_RUN_ATTEMPT,
          controller: env.GITHUB_SHA,
        },
      );
      writeFileSync(
        join(followupDir, noRequestName(mode)),
        JSON.stringify(record) + "\n",
        { flag: "wx", flush: true },
      );
    }
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
