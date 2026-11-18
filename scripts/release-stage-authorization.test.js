import { expect, test } from "@jest/globals";
import { createHash } from "node:crypto";
import {
  assertPrivateStageInventory,
  assertStageAuthority,
  stageRightsInputs,
} from "./release-stage-authorization.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const now = Date.parse("2026-11-18T10:00:00Z");
const coordinate = "@hadden-industries/owlapi@0.1.0";
test("a signed version decision needs no per-version enabling commit", () => {
  const tarballSha256 = "a".repeat(64);
  const benchmark = Buffer.from(
    JSON.stringify({ decision: "ACCEPTED", tarballSha256 }),
  );
  const rightsInputs = Object.fromEntries(
    stageRightsInputs.map((path) => [path, sha(path)]),
  );
  const args = {
    policy: {
      schemaVersion: 1,
      authorization: "SIGNED_OWNER_INTENT",
      emergencyStop: false,
    },
    intent: {
      rights: "ACCEPTED",
      benchmark: "ACCEPTED",
      rightsInputs,
      benchmarkEvidenceSha256: sha(benchmark),
    },
    manifest: {
      assets: { tarball: { sha256: tarballSha256 } },
      inputs: { ...rightsInputs },
    },
    reviewed: { ...rightsInputs },
    benchmark,
  };
  expect(() => assertStageAuthority(args)).not.toThrow();
  args.policy.emergencyStop = true;
  expect(() => assertStageAuthority(args)).toThrow(/disabled/u);
  args.policy.emergencyStop = false;
  args.reviewed[stageRightsInputs[0]] = "b".repeat(64);
  expect(() => assertStageAuthority(args)).toThrow(/rights evidence/u);
});

test("private read must establish that no stage is pending after every relevant writer", () => {
  const inventory = {
    coordinate,
    observedAt: new Date(now - 1000).toISOString(),
    pendingCount: 0,
    inventorySha256: "e".repeat(64),
  };
  expect(() =>
    assertPrivateStageInventory(inventory, {
      coordinate,
      lastWriterAt: now - 2000,
      now,
    }),
  ).not.toThrow();
  expect(() =>
    assertPrivateStageInventory(inventory, {
      coordinate,
      lastWriterAt: now - 500,
      now,
    }),
  ).toThrow(/stale/u);
  expect(() =>
    assertPrivateStageInventory(
      { ...inventory, pendingCount: 1 },
      { coordinate, lastWriterAt: now - 2000, now },
    ),
  ).toThrow(/pending/u);
  expect(() =>
    assertPrivateStageInventory(
      { ...inventory, observedAt: "2026-11-19T10:00:00Z" },
      { coordinate, lastWriterAt: now - 2000, now },
    ),
  ).toThrow(/stale/u);
});
