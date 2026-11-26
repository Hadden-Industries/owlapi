/** Retain only the public-safe native originals needed by an exceptional Mac replay. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stableJson } from "./canonical-json.mjs";
import { PACKAGE_NAME } from "./package-identity.mjs";
import { validateFrozenMatrix } from "./consumer-runtime-matrix.mjs";
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
  if (
    e.GITHUB_ACTIONS !== "true" ||
    e.GITHUB_REPOSITORY !== REPOSITORY ||
    e.GITHUB_JOB !== "consumer_runtime"
  )
    return false;
  assert.ok(["CI", "Release"].includes(e.GITHUB_WORKFLOW));
  const resolution = evidence.resolution;
  assert.equal(resolution.platform.os, "darwin");
  assert.ok(["portability-alias", "portability-scoped"].includes(role));
  for (const key of [
    "GITHUB_RUN_ID",
    "GITHUB_RUN_ATTEMPT",
    "OWLAPI_CANDIDATE_ID",
  ])
    assert.match(e[key], /^[1-9]\d*$/u);
  assert.match(e.GITHUB_SHA, /^[a-f0-9]{40}$/u);
  assert.match(e.OWLAPI_CANDIDATE_DIGEST, /^sha256:[a-f0-9]{64}$/u);
  const matrix = validateFrozenMatrix(JSON.parse(e.OWLAPI_RUNTIME_MATRIX));
  const lane = matrix.include.find(
    (item) =>
      item.os === "darwin" &&
      item.node === resolution.platform.node &&
      item.arch === resolution.platform.cpu,
  );
  assert.ok(lane, "Discovery is outside the original consumer matrix");
  const packet = {
    schemaVersion: 1,
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
    },
    candidate: {
      id: Number(e.OWLAPI_CANDIDATE_ID),
      digest: e.OWLAPI_CANDIDATE_DIGEST,
      tarballSha256: resolution.tarballSha256,
    },
    resolutionSha256: hash(resolution),
  };
  assert.equal(
    resolution.dependencyName,
    role === "portability-alias" ? "owlapi" : PACKAGE_NAME,
  );
  await writeFile(
    join(dirname(root), pendingRecipientMaterialFilename),
    stableJson(packet),
    { flag: "wx" },
  );
  return true;
}
