/** The floor process consumes only the exact inputs authorized earlier in this job. */
import assert from "node:assert/strict";
import { sha256Buffer } from "./release-file-utils.mjs";

export const publicReplayPlanPath = ".release/public-replay/input.json";
const hex = /^[a-f0-9]{64}$/u;
const id = (value) => Number.isSafeInteger(value) && value > 0;

export function assertPublicAdvisoryDescriptor(record) {
  assert.deepEqual(Object.keys(record).sort(), [
    "artifactDigest",
    "artifactId",
    "jobId",
    "signatureSha256",
    "statementSha256",
  ]);
  assert.ok(id(record.artifactId) && id(record.jobId));
  assert.match(record.artifactDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.match(record.signatureSha256, hex);
  assert.match(record.statementSha256, hex);
}

/** A plan bound to this job has a deadline only when its verified advisory requires one. */
export function assertPublicReplayAdvisoryCurrent(
  { decidedAt, expiresAt },
  now = Date.now(),
) {
  assert.ok(
    Number.isSafeInteger(now) &&
      Number.isSafeInteger(decidedAt) &&
      decidedAt <= now,
    "The admitted public advisory decision time is invalid or dated in the future",
  );
  assert.ok(
    expiresAt === null || (Number.isSafeInteger(expiresAt) && now < expiresAt),
    "The admitted public advisory decision is expired or has an invalid deadline",
  );
}

export function readPublicReplayPlan(
  bytes,
  digest,
  { lane, input, origin, now = Date.now() },
) {
  assert.match(
    digest ?? "",
    hex,
    "The canonical advisory verification step did not supply its replay plan digest",
  );
  assert.ok(
    Buffer.isBuffer(bytes) && bytes.length <= 8 * 1024 * 1024,
    "Invalid public replay plan size",
  );
  assert.equal(
    sha256Buffer(bytes),
    digest,
    "The admitted public replay plan bytes changed",
  );
  const plan = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  assert.deepEqual(Object.keys(plan).sort(), [
    "advisory",
    "consumers",
    "decidedAt",
    "expiresAt",
    "input",
    "lane",
    "materialSha256",
    "observation",
    "origin",
    "registryTarball",
    "schemaVersion",
  ]);
  assert.equal(plan.schemaVersion, 2);
  assert.deepEqual(plan.lane, lane);
  assert.deepEqual(plan.input, input);
  assert.deepEqual(plan.origin, origin);
  assertPublicAdvisoryDescriptor(plan.advisory);
  assertPublicReplayAdvisoryCurrent(plan, now);
  assert.match(plan.materialSha256, hex);
  assert.deepEqual(Object.keys(plan.consumers).sort(), ["alias", "scoped"]);
  for (const consumer of Object.values(plan.consumers)) {
    assert.deepEqual(Object.keys(consumer).sort(), [
      "decisionSha256",
      "lock",
      "manifest",
      "resolutionSha256",
    ]);
    assert.equal(typeof consumer.manifest, "string");
    assert.equal(typeof consumer.lock, "string");
    assert.match(consumer.resolutionSha256, hex);
    assert.match(consumer.decisionSha256, hex);
  }
  return plan;
}
