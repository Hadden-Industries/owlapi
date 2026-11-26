import assert from "node:assert/strict";
import { PACKAGE_NAME } from "./package-identity.mjs";
import { assertQualificationAdvisory } from "./qualification-advisory-binding.mjs";
export function validateStagedReleaseEvidence(record) {
  assert.ok([7, 8].includes(record.schemaVersion));
  const current = record.schemaVersion === 8;
  assert.deepEqual(Object.keys(record).sort(), [
    "archive",
    "assets",
    ...(current ? ["publicAdvisory"] : []),
    "publicVerification",
    "releaseId",
    "schemaVersion",
    "source",
    "stage",
    "tagObject",
  ]);
  assert.ok(Number.isSafeInteger(record.releaseId) && record.releaseId > 0);
  assert.match(record.source, /^[a-f0-9]{40}$/u);
  assert.match(record.tagObject, /^[a-f0-9]{40}$/u);
  const { stage, publicVerification: proof, assets, archive } = record;
  if (!current)
    assert.ok(
      proof.schemaVersion === undefined || proof.schemaVersion === 1,
      "Reconciled public verification requires staged evidence v8",
    );
  assert.equal(stage.state, "STAGED");
  if (current) assertQualificationAdvisory(stage.qualificationAdvisory);
  assert.equal(stage.package, PACKAGE_NAME);
  assert.equal(stage.commit, record.source);
  assert.match(stage.version, /^\d+\.\d+\.\d+(?:-rc\.\d+)?$/u);
  const stem = "hadden-industries-owlapi-" + stage.version;
  assert.deepEqual(Object.keys(assets).sort(), [
    "checksums",
    "sbom",
    "tarball",
  ]);
  for (const [item, name] of [
    [assets.tarball, stem + ".tgz"],
    [assets.sbom, stem + ".cdx.json"],
    [assets.checksums, "SHA256SUMS"],
    [archive, stem + ".evidence.json.gz"],
  ]) {
    assert.equal(item.name, name);
    assert.match(item.sha256, /^[a-f0-9]{64}$/u);
    assert.ok(
      Number.isSafeInteger(item.bytes) &&
        item.bytes > 0 &&
        item.bytes <= 64 * 1024 * 1024,
    );
  }
  assert.equal(proof.result, "PASS");
  assert.equal(proof.coordinate, PACKAGE_NAME + "@" + stage.version);
  assert.equal(proof.tarballSha256, assets.tarball.sha256);
  assert.equal(proof.publication.stageId, stage.stageId);
  assert.equal(
    proof.provenance.workflow,
    ".github/workflows/stage-release.yml",
  );
  const stageController = stage.controller ?? record.source;
  assert.match(stageController, /^[a-f0-9]{40}$/u);
  assert.equal(proof.provenance.sourceCommit, stageController);
  assert.equal(proof.provenance.runId, stage.runId);
  assert.equal(proof.provenance.runAttempt, Number(stage.attempt));
  if (current) {
    assert.equal(proof.schemaVersion, 2);
    const { publicAdvisory } = record;
    assert.deepEqual(Object.keys(publicAdvisory).sort(), [
      "attempt",
      "controller",
      "descriptor",
      "policySha256",
      "runId",
    ]);
    assert.match(publicAdvisory.runId, /^[1-9]\d{0,15}$/u);
    assert.match(publicAdvisory.attempt, /^[1-9]\d{0,2}$/u);
    assert.match(publicAdvisory.controller, /^[a-f0-9]{40}$/u);
    assert.match(publicAdvisory.policySha256, /^[a-f0-9]{64}$/u);
    const { descriptor } = publicAdvisory;
    assert.deepEqual(Object.keys(descriptor).sort(), [
      "artifactDigest",
      "artifactId",
      "jobId",
      "signatureSha256",
      "statementSha256",
    ]);
    assert.match(descriptor.artifactDigest, /^sha256:[a-f0-9]{64}$/u);
    assert.match(descriptor.signatureSha256, /^[a-f0-9]{64}$/u);
    assert.match(descriptor.statementSha256, /^[a-f0-9]{64}$/u);
    assert.ok(
      Number.isSafeInteger(descriptor.artifactId) && descriptor.artifactId > 0,
    );
    assert.ok(Number.isSafeInteger(descriptor.jobId) && descriptor.jobId > 0);
  }
  return record;
}
