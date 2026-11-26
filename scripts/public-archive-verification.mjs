/** Replay the indexed original public graphs after their Actions transport expires. */
import assert from "node:assert/strict";
import { canonicalJson, stableJson } from "./canonical-json.mjs";
import { REPOSITORY_ID } from "./release-identity.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { readPublicObservation } from "./public-recipient-observation.mjs";
import {
  readArchivedInstalledTestScripts,
  readArchivedPublicExportSubpaths,
} from "./release-public-archive-rosters.mjs";
import {
  assertPublicMaterialTime,
  assertPublicTestAfter,
  assertPublicTestRecord,
  publicEvaluatorExecution,
  publicExecutionWindow,
  publicLaneKey,
  readMaterialLane,
  readMaterialPacket,
  verifyPublicMaterialRecord,
} from "./public-reconciliation-proof.mjs";
import { assertConsistentArchives } from "./release-resolution-proof.mjs";
import { assertAdvisoryCasesCurrent } from "./release-audit-evaluator.mjs";
import {
  latestRecordedTime,
  releaseTime,
  sealAuthorizationTime,
} from "./release-native-time.mjs";
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
  assert.equal(
    report.integrity,
    manifest.integrity,
    "Archived registry SRI differs from the qualified manifest",
  );
  const archivedExportSubpaths = readArchivedPublicExportSubpaths(
    tarball,
    input,
  );
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
  assert.equal(retained.schemaVersion, 3);
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
  const installedTestScripts = readArchivedInstalledTestScripts(origin.commit);
  assert.deepEqual(keys(retained.registry), ["artifact", "source"]);
  assert.deepEqual(keys(retained.material), [
    "artifact",
    "execution",
    "source",
  ]);
  assertOriginal(retained.registry, origin, `release-registry-${origin.run}-`);
  assertOriginal(retained.material, origin, `public-material-${origin.run}-`);
  const materialTime = publicExecutionWindow(retained.material.execution);
  const evaluator = parse(files.get("public-advisory-job.json"));
  assert.deepEqual(
    [
      evaluator.id,
      String(evaluator.run_id),
      evaluator.head_sha,
      evaluator.status,
      evaluator.conclusion,
    ],
    [
      record.publicAdvisory.descriptor.jobId,
      origin.run,
      origin.commit,
      "completed",
      "success",
    ],
  );
  assert.ok(
    positive(evaluator.run_attempt) &&
      evaluator.run_attempt >= retained.material.source.attempt &&
      evaluator.run_attempt <= Number(origin.attempt),
    "The archived advisory has a different producing attempt",
  );
  const evaluation = publicEvaluatorExecution(evaluator);
  const evaluatorTime = publicExecutionWindow(evaluation);
  assert.ok(
    evaluatorTime.start >= materialTime.end,
    "Public advisory preceded the original material job",
  );
  const materialBytes = files.get("public-material.json");
  const material = readMaterialPacket(materialBytes, input, origin);
  assert.deepEqual(material.origin, sourceOrigin(retained.material.source));
  const expectedLanes = matrix.include.map(publicLaneKey).sort();
  assert.deepEqual(keys(retained.lanes), expectedLanes);
  assert.deepEqual(keys(material.lanes), expectedLanes);
  const originals = new Set(),
    decisionsUsed = new Set();
  const entries = new Map();
  const observations = [];
  let lastTestCompletion = evaluatorTime.end;
  for (const lane of matrix.include) {
    const key = publicLaneKey(lane);
    const laneProof = retained.lanes[key];
    assert.deepEqual(keys(laneProof), [
      "artifact",
      "packet",
      "source",
      "tests",
    ]);
    const { packet, artifact, source, tests } = laneProof;
    assert.deepEqual(keys(tests), ["artifact", "execution", "source"]);
    assertOriginal({ artifact, source }, origin, `public-observation-${key}-`);
    assertOriginal(tests, origin, `public-recipient-${key}-`);
    assert.ok(
      tests.source.attempt >= evaluator.run_attempt,
      "Public replay is from an earlier attempt than its advisory",
    );
    assertPublicTestAfter(
      tests.execution,
      retained.material.execution,
      "material",
    );
    assertPublicTestAfter(tests.execution, evaluation, "advisory");
    lastTestCompletion = Math.max(
      lastTestCompletion,
      publicExecutionWindow(tests.execution).end,
    );
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
        archivedExportSubpaths,
      },
    );
    observations.push({
      lane,
      key,
      tests,
      observation: { consumers, artifact, source },
    });
  }
  assert.deepEqual([...originals].sort(), keys(retained.originals));
  assertConsistentArchives(
    observations.flatMap(({ observation }) =>
      Object.values(observation.consumers).map(
        ({ evidence }) => evidence.resolution,
      ),
    ),
  );
  // The public controller's reviewed delta leaves the qualified corpus intact.
  // Even after the working tree changes, its original evidence is in Git.
  const materialReader = await prepareRecipientMaterial({
    npmCli,
    readCanonicalBytes: readCanonicalMaterialFromGit(operation.source),
  });
  for (const { lane, key, tests, observation } of observations) {
    const { consumers, source } = observation;
    const { decisions, records } = readMaterialLane(
      material,
      lane,
      observation,
      decisionsUsed,
    );
    for (const [mode, selected] of Object.entries(records)) {
      assertPublicMaterialTime(
        selected.decision.observedAt,
        retained.material.execution,
      );
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
      installedTestScripts,
    });
    for (const { subject } of Object.values(consumers)) {
      const entry = { subject, source };
      entries.set(canonicalJson(entry), entry);
    }
  }
  assert.deepEqual([...decisionsUsed].sort(), keys(material.originals));
  return {
    operation,
    entries: [...entries.values()],
    evaluator,
    lastTestCompletion,
  };
}

/** Recheck the exact qualification accepted before the stage request using its native journal and the archived signature. */
export async function verifyArchivedQualification(
  files,
  record,
  operation,
  npmCli,
  sealTime,
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
  const now = releaseTime(marker.verifiedAt);
  assert.ok(
    Number.isSafeInteger(sealTime) && now <= sealTime,
    "Qualification verification is dated after native seal authorization",
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
  assertAdvisoryCasesCurrent(decision, sealTime);
}

export async function verifyArchivedPublicRelease(
  files,
  record,
  { tarball, npmCli, publishedAt, sealAuthorizedAt, client },
) {
  const sealTime = sealAuthorizationTime(sealAuthorizedAt, publishedAt);
  // Check the frozen policy digest against the qualifying manifest before it may select a tool.
  const policy = validateRuntimePolicy(
    parse(files.get("qualified-runtime-policy.json")),
  );
  const manifestBytes = files.get("manifest.json");
  assert.equal(sha256Buffer(manifestBytes), record.stage.manifestSha256);
  qualificationRuntimeMatrix(parse(manifestBytes), policy);
  const { operation, entries, evaluator, lastTestCompletion } =
    await withAuditNpmClients(
      npmCli,
      (npmCliForVersion) =>
        readArchivedPublicInputs(files, record, {
          tarball,
          npmCli: npmCliForVersion(policy.consumerNpm),
          client,
        }),
      policy.consumerNpm,
    );
  await verifyArchivedQualification(files, record, operation, npmCli, sealTime);
  const { descriptor, policySha256, runId, attempt, controller } =
    record.publicAdvisory;
  assert.deepEqual(
    [runId, attempt, controller],
    [operation.publicRun, operation.publicAttempt, operation.publicController],
  );
  assert.ok(
    lastTestCompletion <= sealTime,
    "The native seal was authorized before public testing finished",
  );
  const decision = await verifyArchivedAdvisoryReceipt({
    statement: files.get("public-advisory.json"),
    signature: files.get("public-advisory.sigstore.json"),
    descriptor,
    runId,
    attempt,
    controller,
    workflow,
    job: evaluator,
    entries,
    now: sealTime,
    npmCli,
  });
  assert.equal(decision.policySha256, policySha256);
  const decided = releaseTime(decision.decidedAt);
  assert.ok(
    decided >= releaseTime(evaluator.started_at) &&
      decided <= latestRecordedTime(evaluator.completed_at),
    "The archived advisory was issued outside its original evaluator job",
  );
  return record.publicAdvisory;
}
