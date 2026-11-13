import assert from "node:assert/strict";
import { PACKAGE_NAME } from "./package-identity.mjs";
export function validateStagedReleaseEvidence(record) {
  assert.equal(record.schemaVersion, 7);
  assert.deepEqual(Object.keys(record).sort(), [
    "archive",
    "assets",
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
  assert.equal(stage.state, "STAGED");
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
  assert.equal(proof.provenance.sourceCommit, record.source);
  assert.equal(proof.provenance.runId, stage.runId);
  assert.equal(proof.provenance.runAttempt, Number(stage.attempt));
  return record;
}
