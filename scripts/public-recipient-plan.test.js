import { expect, test } from "@jest/globals";
import { stableJson } from "./canonical-json.mjs";
import { readPublicReplayPlan } from "./public-recipient-plan.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";

test("the isolated public test requires the exact same-job plan, workflow scope and current decision", () => {
  const lane = { os: "win32", node: "22.0.0", arch: "x64" };
  const input = { tarballSha256: "a".repeat(64) };
  const origin = { commit: "b".repeat(40), run: "45", attempt: "2" };
  const consumer = {
    manifest: "{}",
    lock: "{}",
    resolutionSha256: "c".repeat(64),
    decisionSha256: "d".repeat(64),
  };
  const plan = {
    schemaVersion: 1,
    lane,
    input,
    origin,
    expiresAt: 500,
    registryTarball:
      "https://registry.npmjs.org/@hadden-industries/owlapi/-/owlapi-0.1.0.tgz",
    materialSha256: "e".repeat(64),
    observation: { id: 30 },
    advisory: {
      artifactId: 45,
      jobId: 46,
      artifactDigest: "sha256:" + "1".repeat(64),
      signatureSha256: "2".repeat(64),
      statementSha256: "3".repeat(64),
    },
    consumers: { alias: consumer, scoped: consumer },
  };
  const bytes = Buffer.from(stableJson(plan));
  const digest = sha256Buffer(bytes);
  const expected = { lane, input, origin, now: 499 };
  expect(readPublicReplayPlan(bytes, digest, expected)).toEqual(plan);
  expect(() => readPublicReplayPlan(bytes, undefined, expected)).toThrow(
    "did not supply its replay plan digest",
  );
  expect(() => readPublicReplayPlan(bytes, "0".repeat(64), expected)).toThrow(
    "plan bytes changed",
  );
  expect(() =>
    readPublicReplayPlan(bytes, digest, {
      ...expected,
      origin: { ...origin, attempt: "1" },
    }),
  ).toThrow();
  expect(() =>
    readPublicReplayPlan(bytes, digest, { ...expected, now: 500 }),
  ).toThrow("decision is expired");
});
