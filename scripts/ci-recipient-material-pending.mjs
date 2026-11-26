/** Retain only the public-safe native originals needed by an exceptional Mac replay. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stableJson } from "./canonical-json.mjs";
import { PACKAGE_NAME } from "./package-identity.mjs";
import {
  standalonePortabilityRuntimes,
  validateFrozenMatrix,
} from "./consumer-runtime-matrix.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { REPOSITORY } from "./release-identity.mjs";

export const pendingRecipientMaterialFilename =
  "pending-recipient-material.json";
export const pendingRecipientUploadStep =
  "Retain the exceptional recipient material observation";
const hash = (value) => sha256Buffer(Buffer.from(stableJson(value)));

/** A pending discovery is an original graph, never a passing material decision. */
export async function retainPendingMacMaterial({
  root,
  evidence,
  role,
  missing,
  environment = process.env,
}) {
  const e = environment;
  if (e.GITHUB_ACTIONS !== "true" || e.GITHUB_REPOSITORY !== REPOSITORY)
    return false;
  const standalone = standalonePortabilityRuntimes[e.GITHUB_JOB];
  if (
    e.GITHUB_JOB !== "consumer_runtime" &&
    standalone?.platform.os !== "darwin"
  )
    return false;
  assert.ok(["CI", "Release"].includes(e.GITHUB_WORKFLOW));
  const resolution = evidence.resolution;
  assert.equal(resolution.platform.os, "darwin");
  assert.ok(["portability-alias", "portability-scoped"].includes(role));
  for (const key of ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"])
    assert.match(e[key], /^[1-9]\d*$/u);
  assert.match(e.GITHUB_SHA, /^[a-f0-9]{40}$/u);
  const candidateId = e.OWLAPI_CANDIDATE_ID ?? e.CANDIDATE_ARTIFACT_ID;
  const candidateDigest =
    e.OWLAPI_CANDIDATE_DIGEST ?? `sha256:${e.CANDIDATE_ARTIFACT_DIGEST}`;
  assert.match(candidateId, /^[1-9]\d*$/u);
  assert.match(candidateDigest, /^sha256:[a-f0-9]{64}$/u);
  const matrix = e.OWLAPI_RUNTIME_MATRIX
    ? validateFrozenMatrix(JSON.parse(e.OWLAPI_RUNTIME_MATRIX))
    : null;
  if (!standalone)
    assert.ok(matrix, "The original consumer matrix is required");
  const lane = standalone
    ? {
        runner: standalone.runner,
        shell: "bash",
        node: standalone.platform.node,
        os: standalone.platform.os,
        arch: standalone.platform.cpu,
      }
    : matrix.include.find(
        (item) =>
          item.os === "darwin" &&
          item.node === resolution.platform.node &&
          item.arch === resolution.platform.cpu,
      );
  assert.ok(lane, "Discovery is outside the original consumer matrix");
  const packet = {
    schemaVersion: standalone ? 2 : 1,
    status: "NEEDS_ARCHIVE_MEASUREMENTS",
    evidence,
    role,
    missing,
    lane,
    matrix,
    source: {
      workflow: e.GITHUB_WORKFLOW,
      runId: Number(e.GITHUB_RUN_ID),
      attempt: Number(e.GITHUB_RUN_ATTEMPT),
      commit: e.GITHUB_SHA,
      ...(standalone ? { job: e.GITHUB_JOB } : {}),
    },
    candidate: {
      id: Number(candidateId),
      digest: candidateDigest,
      tarballSha256: resolution.tarballSha256,
    },
    resolutionSha256: hash(resolution),
  };
  assert.equal(
    resolution.dependencyName,
    role === "portability-alias" ? "owlapi" : PACKAGE_NAME,
  );
  if (standalone) {
    assert.equal(resolution.npm, standalone.npm);
    assert.equal(
      stableJson(resolution.platform),
      stableJson(standalone.platform),
    );
  }
  await writeFile(
    join(dirname(root), pendingRecipientMaterialFilename),
    stableJson(packet),
    { flag: "wx" },
  );
  return true;
}
