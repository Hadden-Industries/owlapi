import { execFileSync } from "node:child_process";
import { expect, test } from "@jest/globals";
import { PACKAGE_NAME } from "./release-identity.mjs";
import { readStageJournal } from "./staged-release.mjs";
import { submittedStagePolicy } from "./release-stage-continuation.mjs";

const legacyCommit = "42062f3b2d0dfca622437e5f0d7317389c75477e";
const digest = "a".repeat(64);
const receiptFor = (
  manifest,
  { controller = manifest.commit, qualificationAdvisory } = {},
) => {
  const subject = {
    schemaVersion: 1,
    package: PACKAGE_NAME,
    version: manifest.package.version,
    workflow: ".github/workflows/stage-release.yml",
    commit: manifest.commit,
    controller,
    qualificationRun: manifest.runId,
    qualificationAttempt: manifest.attempt,
    manifestSha256: digest,
    runId: "70",
    attempt: "1",
    channel: "pilot",
    ...(qualificationAdvisory ? { qualificationAdvisory } : {}),
  };
  const journal = [
    { ...subject, state: "REQUESTED" },
    {
      ...subject,
      state: "STAGED",
      stageId: "00000000-0000-4000-8000-000000000070",
    },
  ]
    .map((row) => JSON.stringify(row))
    .join("\n");
  return readStageJournal(Buffer.from(journal), manifest, digest, {
    runId: "70",
    attempt: "1",
    controller,
  });
};

test("only the attributed native stage and qualification predating v2 can continue under the v1 contract", () => {
  const modernCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: new URL("../", import.meta.url),
    windowsHide: true,
    encoding: "utf8",
  }).trim();
  expect(modernCommit).not.toBe(legacyCommit);
  const manifest = {
    commit: legacyCommit,
    package: { version: "0.1.0" },
    runId: "69",
    attempt: "1",
  };
  const legacy = receiptFor(manifest);
  expect(submittedStagePolicy(manifest, legacy)).toBe(1);
  expect(() =>
    submittedStagePolicy(manifest, { ...legacy, state: "REQUESTED" }),
  ).toThrow();
  expect(() =>
    submittedStagePolicy(
      manifest,
      receiptFor(manifest, { controller: modernCommit }),
    ),
  ).toThrow(/original pre-reconciliation stage/u);
  const downgraded = { ...manifest, commit: modernCommit };
  expect(() =>
    submittedStagePolicy(downgraded, receiptFor(downgraded)),
  ).toThrow(/original pre-reconciliation stage/u);
  const current = { ...downgraded, consumerResolutionPolicy: 2 };
  const qualificationAdvisory = {
    verifiedAt: "2026-11-26T12:00:00.000Z",
    policySha256: digest,
    subjectsSha256: digest,
    descriptor: {
      artifactId: 33,
      artifactDigest: `sha256:${digest}`,
      jobId: 57,
      signatureSha256: digest,
      statementSha256: digest,
    },
  };
  expect(
    submittedStagePolicy(
      current,
      receiptFor(current, { qualificationAdvisory }),
    ),
  ).toBe(2);
  expect(() => submittedStagePolicy(current, receiptFor(downgraded))).toThrow(
    /qualification advisory marker/u,
  );
});
