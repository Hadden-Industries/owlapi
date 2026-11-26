import { expect, test } from "@jest/globals";
import { stableJson } from "./canonical-json.mjs";
import { readPublicReplayPlan } from "./public-recipient-plan.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";

function replayPlan() {
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
    schemaVersion: 2,
    lane,
    input,
    origin,
    decidedAt: 200,
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
  return plan;
}

test("the isolated public test requires the exact same-job plan, workflow scope and current decision", () => {
  const plan = replayPlan();
  const { lane, input, origin } = plan;
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

test("an operation-bound public replay plan needs no finite cutoff unless a case expires", () => {
  const original = replayPlan();
  const { lane, input, origin } = original;
  const late = 48 * 60 * 60_000;
  const plan = { ...original, expiresAt: null };
  const read = (record, now) => {
    const bytes = Buffer.from(stableJson(record));
    return readPublicReplayPlan(bytes, sha256Buffer(bytes), {
      lane,
      input,
      origin,
      now,
    });
  };
  expect(read(plan, late)).toEqual(plan);
  expect(() => read(plan, plan.decidedAt - 1)).toThrow("dated in the future");
  expect(() => read({ ...plan, expiresAt: undefined }, late)).toThrow();
  expect(() => read({ ...plan, expiresAt: String(late) }, late - 1)).toThrow();
  const withCase = { ...plan, expiresAt: late };
  expect(read(withCase, late - 1)).toEqual(withCase);
  expect(() => read(withCase, late)).toThrow("decision is expired");
});
