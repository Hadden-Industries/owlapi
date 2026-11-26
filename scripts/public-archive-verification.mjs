/** Replay the indexed original public graphs after their Actions transport expires. */
import assert from "node:assert/strict";
import { canonicalJson, stableJson } from "./canonical-json.mjs";
import { REPOSITORY_ID } from "./release-identity.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { readPublicObservation } from "./public-recipient-observation.mjs";
import {
  assertPublicTestRecord,
  publicLaneKey,
  readMaterialLane,
  readMaterialPacket,
  verifyPublicMaterialRecord,
} from "./public-reconciliation-proof.mjs";
import { prepareRecipientMaterial } from "../util/third-party-evidence/recipient-material.mjs";
import { readCanonicalMaterialFromGit } from "./recipient-material-git-source.mjs";
import {
  publicRecipientInput,
  qualificationRuntimeMatrix,
} from "./release-public-proof.mjs";
import { verifyArchivedAdvisoryReceipt } from "./release-audit-job.mjs";
import { readStageJournal } from "./staged-release.mjs";
import {
  assertQualificationAdvisory,
  qualificationSubjectsSha256,
} from "./qualification-advisory-binding.mjs";
import { withAuditNpmClients } from "./release-audit-runtimes.mjs";
import { validateRuntimePolicy } from "./runtime-policy.mjs";
import { matchesLogicalArtifact } from "../tooling/artifact-transport/identity.mjs";

const workflow = ".github/workflows/release-registry.yml";
const keys = (object) => Object.keys(object).sort();
const parse = (value) =>
  JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value));
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const sourceOrigin = (source) => ({
  commit: source.commit,
  run: String(source.runId),
  attempt: String(source.attempt),
});

function assertOriginal({ artifact, source }, expected, prefix) {
  assert.deepEqual(keys(artifact), ["bytes", "digest", "id", "name"]);
  assert.deepEqual(keys(source), [
    "artifactSha256",
    "attempt",
    "commit",
    "jobId",
    "repositoryId",
    "runId",
  ]);
  assert.ok(
    positive(artifact.id) && positive(artifact.bytes) && positive(source.jobId),
  );
  assert.match(source.artifactSha256, /^[a-f0-9]{64}$/u);
  assert.equal(artifact.digest, "sha256:" + source.artifactSha256);
  assert.equal(source.repositoryId, REPOSITORY_ID);
  assert.equal(source.commit, expected.commit);
  assert.equal(String(source.runId), expected.run);
  assert.ok(
    positive(source.attempt) && source.attempt <= Number(expected.attempt),
  );
  assert.ok(
    matchesLogicalArtifact(artifact.name, prefix + source.attempt, {
      run: source.runId,
      attempt: source.attempt,
      legacy: false,
    }),
    "Archived public evidence has a different producing artifact",
  );
}

/** Derive the expected subjects independently of the signature payload. */
export async function readArchivedPublicInputs(
  files,
  record,
  { tarball, npmCli, client },
) {
  const operationBytes = files.get("operation.json");
  const operation = parse(operationBytes);
  const manifestBytes = files.get("manifest.json");
  const manifest = parse(manifestBytes);
  assert.equal(operation.type, "seal");
  assert.equal(operation.manifestSha256, sha256Buffer(manifestBytes));
  assert.equal(operation.source, manifest.commit);
  assert.equal(operation.source, record.source);
  assert.equal(operation.tagObject, record.tagObject);
  assert.equal(operation.releaseId, record.releaseId);
  assert.deepEqual(manifest.assets, record.assets);
  const policy = validateRuntimePolicy(
    parse(files.get("qualified-runtime-policy.json")),
  );
  const matrix = qualificationRuntimeMatrix(manifest, policy);
  const input = publicRecipientInput(
    { operation, manifest, receipt: record.stage },
    matrix,
    { reconciled: true },
  );
  assert.deepEqual(parse(files.get("recipient-input.json")), input);
  const report = parse(files.get("public.json"));
  assert.deepEqual(report, record.publicVerification);
  assert.equal(report.schemaVersion, 2);
  const retainedBytes = files.get("public-native.json");
  const retained = parse(retainedBytes);
  assert.equal(stableJson(retained), retainedBytes.toString("utf8"));
  assert.deepEqual(keys(retained), [
    "lanes",
    "material",
    "originals",
    "registry",
    "schemaVersion",
  ]);
  assert.equal(retained.schemaVersion, 2);
  const origin = {
    commit: operation.publicController,
    run: operation.publicRun,
    attempt: operation.publicAttempt,
  };
  assert.deepEqual(
    [origin.run, origin.attempt, origin.commit],
    [
      record.publicAdvisory.runId,
      record.publicAdvisory.attempt,
      record.publicAdvisory.controller,
    ],
  );
  assertOriginal(retained.registry, origin, `release-registry-${origin.run}-`);
  assertOriginal(retained.material, origin, `public-material-${origin.run}-`);
  const materialBytes = files.get("public-material.json");
  const material = readMaterialPacket(materialBytes, input, origin);
  assert.deepEqual(material.origin, sourceOrigin(retained.material.source));
  const expectedLanes = matrix.include.map(publicLaneKey).sort();
  assert.deepEqual(keys(retained.lanes), expectedLanes);
  assert.deepEqual(keys(material.lanes), expectedLanes);
  const originals = new Set(),
    decisionsUsed = new Set();
  const entries = new Map();
  // The public controller's reviewed delta leaves the qualified corpus intact.
  // Even after the working tree changes, its original evidence is in Git.
  const materialReader = await prepareRecipientMaterial({
    npmCli,
    readCanonicalBytes: readCanonicalMaterialFromGit(operation.source),
  });
  for (const lane of matrix.include) {
    const key = publicLaneKey(lane);
    const { packet, artifact, source, tests } = retained.lanes[key];
    assertOriginal({ artifact, source }, origin, `public-observation-${key}-`);
    assertOriginal(tests, origin, `public-recipient-${key}-`);
    const selected = {};
    for (const item of Object.values(packet)) {
      for (const member of [item.manifest, item.lock, item.resolution]) {
        assert.match(member, /^[a-f0-9]{64}$/u);
        assert.ok(Object.hasOwn(retained.originals, member));
        selected[member] = retained.originals[member];
        originals.add(member);
      }
    }
    const consumers = await readPublicObservation(
      {
        schemaVersion: 2,
        lane,
        input,
        origin: sourceOrigin(source),
        index: packet,
        originals: selected,
      },
      {
        lane,
        input,
        origin: sourceOrigin(source),
        tarball,
        npmCli,
        registryTarball: report.tarballUrl,
        consumerNpm: policy.consumerNpm,
      },
    );
    const observation = { consumers, artifact, source };
    const { decisions, records } = readMaterialLane(
      material,
      lane,
      observation,
      decisionsUsed,
    );
    for (const [mode, selected] of Object.entries(records)) {
      await verifyPublicMaterialRecord(
        materialReader,
        selected,
        consumers[mode],
        {
          client,
          npmCli,
          input,
          lane,
          mode,
          sourceCommit: origin.commit,
          archived: true,
        },
      );
    }
    assertPublicTestRecord(parse(files.get(`public-recipient-${key}.json`)), {
      lane,
      input,
      observation,
      decisions,
      testSource: tests.source,
      materialSha256: sha256Buffer(materialBytes),
      advisory: record.publicAdvisory.descriptor,
    });
    for (const { subject } of Object.values(consumers)) {
      const entry = { subject, source };
      entries.set(canonicalJson(entry), entry);
    }
  }
  assert.deepEqual([...originals].sort(), keys(retained.originals));
  assert.deepEqual([...decisionsUsed].sort(), keys(material.originals));
  return { operation, entries: [...entries.values()] };
}

/** Recheck the exact qualification accepted before the stage request using its native journal and the archived signature. */
export async function verifyArchivedQualification(
  files,
  record,
  operation,
  npmCli,
  publishedAt,
) {
  const manifestBytes = files.get("manifest.json"),
    manifest = parse(manifestBytes);
  assert.equal(
    manifest.consumerResolutionPolicy,
    2,
    "Historical qualification cannot verify reconciled release",
  );
  assert.equal(sha256Buffer(manifestBytes), operation.manifestSha256);
  const staged = readStageJournal(
    files.get("stage-journal.jsonl"),
    manifest,
    operation.manifestSha256,
    {
      runId: operation.stageRun,
      attempt: operation.stageAttempt,
      controller: operation.stageController ?? manifest.commit,
    },
  );
  assert.deepEqual(
    record.stage,
    staged,
    "Standalone stage and archived journal differ",
  );
  const marker = assertQualificationAdvisory(staged.qualificationAdvisory);
  const statement = files.get("qualification-advisory.json");
  assert.equal(sha256Buffer(statement), marker.descriptor.statementSha256);
  const entries = parse(statement).subjects.map(({ subject, source }) => ({
    subject,
    source,
  }));
  assert.equal(
    qualificationSubjectsSha256(entries),
    marker.subjectsSha256,
    "Stage approved different qualification subjects",
  );
  assert.ok(
    entries.every(
      ({ subject }) => subject.tarballSha256 === manifest.assets.tarball.sha256,
    ),
  );
  const now = Date.parse(marker.verifiedAt);
  assert.ok(
    now <= Date.parse(publishedAt),
    "Qualification verification is dated after publication",
  );
  const decision = await verifyArchivedAdvisoryReceipt({
    statement,
    signature: files.get("qualification-advisory.sigstore.json"),
    descriptor: marker.descriptor,
    runId: manifest.runId,
    attempt: manifest.attempt,
    controller: manifest.commit,
    workflow: ".github/workflows/release.yml",
    job: parse(files.get("qualification-advisory-job.json")),
    entries,
    now,
    npmCli,
  });
  assert.equal(decision.policySha256, marker.policySha256);
}

export async function verifyArchivedPublicRelease(
  files,
  record,
  { tarball, npmCli, publishedAt, client },
) {
  // Check the frozen policy digest against the qualifying manifest before it may select a tool.
  const policy = validateRuntimePolicy(
    parse(files.get("qualified-runtime-policy.json")),
  );
  const manifestBytes = files.get("manifest.json");
  assert.equal(sha256Buffer(manifestBytes), record.stage.manifestSha256);
  qualificationRuntimeMatrix(parse(manifestBytes), policy);
  const { operation, entries } = await withAuditNpmClients(
    npmCli,
    (npmCliForVersion) =>
      readArchivedPublicInputs(files, record, {
        tarball,
        npmCli: npmCliForVersion(policy.consumerNpm),
        client,
      }),
    policy.consumerNpm,
  );
  await verifyArchivedQualification(
    files,
    record,
    operation,
    npmCli,
    publishedAt,
  );
  const { descriptor, policySha256, runId, attempt, controller } =
    record.publicAdvisory;
  assert.deepEqual(
    [runId, attempt, controller],
    [operation.publicRun, operation.publicAttempt, operation.publicController],
  );
  const job = parse(files.get("public-advisory-job.json"));
  const now = Date.parse(publishedAt);
  assert.ok(Number.isFinite(now), "Missing immutable publication time");
  const decision = await verifyArchivedAdvisoryReceipt({
    statement: files.get("public-advisory.json"),
    signature: files.get("public-advisory.sigstore.json"),
    descriptor,
    runId,
    attempt,
    controller,
    workflow,
    job,
    entries,
    now,
    npmCli,
  });
  assert.equal(decision.policySha256, policySha256);
  return record.publicAdvisory;
}
