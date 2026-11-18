/** Checks shared by the read-only stage admission and the protected writer. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const hex = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
export const stageRightsInputs = Object.freeze([
  "docs/provenance/rights-inventory.json",
  "docs/provenance/third-party-material.json",
  "docs/provenance/scoped-package-name-review.json",
  "tooling/artifact-transport/rights-review.json",
]);

/** Facts come from the original manifest and the actual executing Git tree. */
export function assertStageAuthority({
  policy,
  intent,
  manifest,
  reviewed,
  benchmark,
}) {
  assert.deepEqual(
    policy,
    {
      schemaVersion: 1,
      authorization: "SIGNED_OWNER_INTENT",
      emergencyStop: false,
    },
    "The staged publication policy is disabled or unknown",
  );
  assert.equal(intent.rights, "ACCEPTED");
  assert.equal(intent.benchmark, "ACCEPTED");
  assert.ok(
    Buffer.isBuffer(benchmark),
    "Missing signed benchmark disposition bytes",
  );
  const { decision, tarballSha256 } = JSON.parse(benchmark);
  assert.equal(decision, "ACCEPTED");
  assert.equal(tarballSha256, manifest.assets.tarball.sha256);
  assert.equal(
    createHash("sha256").update(benchmark).digest("hex"),
    intent.benchmarkEvidenceSha256,
    "Benchmark decision is not bound to the authorized evidence",
  );
  assert.deepEqual(
    Object.keys(intent.rightsInputs).sort(),
    [...stageRightsInputs].sort(),
  );
  for (const path of stageRightsInputs) {
    assert.ok(
      hex(intent.rightsInputs[path]) &&
        manifest.inputs?.[path] === intent.rightsInputs[path] &&
        reviewed[path] === intent.rightsInputs[path],
      "Signed rights evidence is different or no longer reviewed for " + path,
    );
  }
}

/** An absent public version is insufficient. Bind a fresh private owner read. */
export function assertPrivateStageInventory(
  inventory,
  { coordinate, lastWriterAt, now = Date.now() },
) {
  const observedAt = Date.parse(inventory?.observedAt);
  assert.ok(
    inventory?.coordinate === coordinate &&
      inventory.pendingCount === 0 &&
      hex(inventory.inventorySha256) &&
      Number.isFinite(observedAt) &&
      observedAt <= now &&
      observedAt > lastWriterAt &&
      now - observedAt <= 60 * 60_000,
    "Fresh owner-observed private stage inventory is missing, stale or contains a pending stage",
  );
}
