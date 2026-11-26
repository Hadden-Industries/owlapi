import { expect, test } from "@jest/globals";
import { createHash } from "node:crypto";
import {
  assertProtectedReleaseRun,
  assertTimedUpload,
  auditTrust,
  checkedNativeJob,
  releaseJobs,
  verifyArchivedAdvisoryReceipt,
  verifyHostedAdvisoryReceipt,
} from "./release-audit-job.mjs";
import { verifyNewStageAdvisories } from "./staged-release.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";
import { physicalName } from "../tooling/artifact-transport/identity.mjs";

const controller = "a".repeat(40),
  workflow = ".github/workflows/release.yml";
const expected = { controller, workflow, runId: 140, attempt: 2 };
const repository = { full_name: REPOSITORY, id: REPOSITORY_ID };
const run = {
  repository,
  head_repository: repository,
  id: 140,
  run_attempt: 2,
  path: workflow,
  head_sha: controller,
  head_branch: "main",
  event: "workflow_dispatch",
  status: "completed",
  conclusion: "success",
};
const uploadStep = "Retain protected advisory decision";
const original = {
  id: 770,
  name: "Release advisory / Evaluate",
  run_id: 140,
  head_sha: controller,
  run_attempt: 1,
  status: "completed",
  conclusion: "success",
  labels: [UBUNTU.label],
  runner_id: 5,
  check_run_url:
    "https://api.github.com/repos/" + REPOSITORY + "/check-runs/444",
  steps: [
    {
      name: uploadStep,
      status: "completed",
      conclusion: "success",
      started_at: "2026-11-26T12:30:00Z",
      completed_at: "2026-11-26T12:31:00Z",
    },
  ],
};
const logical = "release-advisory-140-1";
const physical = physicalName({
  logical,
  run: 140,
  attempt: 1,
  producer: "a".repeat(16),
  invocation: "b".repeat(32),
  ordinal: 0,
});
const artifact = {
  id: 42,
  size_in_bytes: 200,
  digest: "sha256:" + "f".repeat(64),
  name: physical,
  created_at: "2026-11-26T12:30:30Z",
  workflow_run: {
    id: 140,
    head_sha: controller,
    repository_id: REPOSITORY_ID,
    head_repository_id: REPOSITORY_ID,
  },
};
const digest = (b) => createHash("sha256").update(b).digest("hex");

test("protected qualification and original upload require the same repository, ref, job and time window", () => {
  assertProtectedReleaseRun(run, expected);
  expect(() =>
    assertProtectedReleaseRun({ ...run, event: "pull_request" }, expected),
  ).toThrow();
  expect(() =>
    assertProtectedReleaseRun(
      { ...run, head_repository: { ...repository, id: 55 } },
      expected,
    ),
  ).toThrow();
  expect(() => assertProtectedReleaseRun(run, expected, true)).toThrow();
  expect(checkedNativeJob([original], original.name, run)).toBe(original);
  expect(() =>
    checkedNativeJob([original, original], original.name, run),
  ).toThrow();
  const policy = "f".repeat(64);
  expect(auditTrust(expected, original, policy).evaluator).toEqual({
    controller,
    workflow,
    runId: 140,
    attempt: 1,
    checkRunId: 444,
  });
  expect(() =>
    auditTrust(expected, { ...original, labels: ["self-hosted"] }, policy),
  ).toThrow();
  expect(() =>
    auditTrust(
      expected,
      { ...original, check_run_url: original.check_run_url + "/x" },
      policy,
    ),
  ).toThrow();
  assertTimedUpload(artifact, run, original, logical, uploadStep);
  expect(() =>
    assertTimedUpload(
      { ...artifact, created_at: "2026-11-26T12:32:00Z" },
      run,
      original,
      logical,
      uploadStep,
    ),
  ).toThrow();
});

test("archive readback refuses an invalid original artifact pointer before relying on the decision", async () => {
  const statement = Buffer.from("statement"),
    signature = Buffer.from("signature");
  const descriptor = {
    jobId: 770,
    artifactId: 0,
    artifactDigest: artifact.digest,
    statementSha256: digest(statement),
    signatureSha256: digest(signature),
  };
  await expect(
    verifyArchivedAdvisoryReceipt({
      ...expected,
      statement,
      signature,
      job: original,
      descriptor,
    }),
  ).rejects.toThrow(/advisory artifact pointer/i);
});

test("only public pretest readback may use an in-progress enclosing run, and still needs a successful original advisory job", async () => {
  const publicWorkflow = ".github/workflows/release-registry.yml";
  const active = {
    ...run,
    path: publicWorkflow,
    status: "in_progress",
    conclusion: null,
  };
  const client = {
    read: async (path) =>
      path === "/actions/runs/140"
        ? active
        : {
            total_count: 1,
            jobs: [{ ...original, status: "completed", conclusion: "failure" }],
          },
  };
  await expect(
    verifyHostedAdvisoryReceipt({
      ...expected,
      client,
      workflow: publicWorkflow,
    }),
  ).rejects.toThrow("did not complete successfully");
  await expect(
    verifyHostedAdvisoryReceipt({
      ...expected,
      client,
      workflow: publicWorkflow,
      publicRecipientTest: true,
    }),
  ).rejects.toThrow("Original job did not succeed");
  await expect(
    verifyHostedAdvisoryReceipt({
      ...expected,
      client,
      publicRecipientTest: true,
    }),
  ).rejects.toThrow("Only a public test");
});

test("paginated native jobs must form one complete roster with distinct IDs", async () => {
  const rows = Array.from({ length: 101 }, (_, i) => ({ id: i + 1 }));
  const paths = [];
  await expect(
    releaseJobs(
      {
        read: async (path) => {
          paths.push(path);
          return {
            total_count: 101,
            jobs: path.endsWith("=1") ? rows.slice(0, 100) : rows.slice(100),
          };
        },
      },
      140,
      1,
    ),
  ).resolves.toEqual(rows);
  expect(paths).toHaveLength(2);
  await expect(
    releaseJobs(
      { read: async () => ({ total_count: 101, jobs: rows.slice(0, 1) }) },
      140,
    ),
  ).rejects.toThrow(/incomplete/i);
});

test("legacy or substituted qualification cannot reach an npm stage request", async () => {
  const manifestBytes = Buffer.from("{}");
  const args = {
    manifestBytes,
    env: { MANIFEST_SHA256: digest(manifestBytes) },
  };
  for (const manifest of [
    {},
    {
      consumerResolutionPolicy: 2,
      qualificationMode: "reuse",
      ci: { schemaVersion: 1 },
    },
  ]) {
    await expect(
      verifyNewStageAdvisories(null, { ...args, manifest }),
    ).rejects.toThrow(/new stage/i);
  }
  await expect(
    verifyNewStageAdvisories(null, {
      ...args,
      manifest: { consumerResolutionPolicy: 2, qualificationMode: "fresh" },
      env: { MANIFEST_SHA256: "f".repeat(64) },
    }),
  ).rejects.toThrow(/different stage/i);
});
