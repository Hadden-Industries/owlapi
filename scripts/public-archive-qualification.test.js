import { expect, jest, test } from "@jest/globals";
import { canonicalJson, stableJson } from "./canonical-json.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./package-identity.mjs";
import { qualificationSubjectsSha256 } from "./qualification-advisory-binding.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { zipArchive } from "./fixtures/zip-archive.mjs";
import { physicalName } from "../tooling/artifact-transport/identity.mjs";

const native = await import("./release-audit-job.mjs");
const verify = jest.fn();
jest.unstable_mockModule("./release-audit-job.mjs", () => ({
  ...native,
  verifyArchivedAdvisoryReceipt: verify,
}));
const { verifyArchivedQualification } =
  await import("./public-archive-verification.mjs");
const { verifyOriginalSealRecord } =
  await import("./staged-release-followup.mjs");

test("archived qualification retains its staging audit clock and rechecks cases at the original authorized seal clock", async () => {
  const source = "a".repeat(40),
    tarballSha256 = "b".repeat(64),
    policySha256 = "c".repeat(64);
  const enteredAt = "2026-11-26T12:00:00.000Z";
  const expiresAt = "2026-11-26T12:10:00.000Z";
  const entries = [{ source: {}, subject: { tarballSha256 } }];
  const statement = Buffer.from(
    canonicalJson({
      policySha256,
      decidedAt: enteredAt,
      subjects: entries.map((entry) => ({
        ...entry,
        observedAt: enteredAt,
        caseEvidence: {
          id: "00000000-0000-4000-8000-000000000042",
          caseIds: ["fixture"],
          expiresAt,
        },
      })),
    }),
  );
  verify.mockResolvedValue(JSON.parse(statement));
  const qualificationAdvisory = {
    descriptor: {
      artifactDigest: "sha256:" + "d".repeat(64),
      artifactId: 1,
      jobId: 2,
      signatureSha256: "e".repeat(64),
      statementSha256: sha256Buffer(statement),
    },
    policySha256,
    verifiedAt: enteredAt,
    subjectsSha256: qualificationSubjectsSha256(entries),
  };
  const manifest = Buffer.from(
    stableJson({
      consumerResolutionPolicy: 2,
      package: { version: PACKAGE_VERSION },
      commit: source,
      runId: "4",
      attempt: "1",
      assets: { tarball: { sha256: tarballSha256 } },
    }),
  );
  const pending = {
    schemaVersion: 1,
    package: PACKAGE_NAME,
    version: PACKAGE_VERSION,
    workflow: ".github/workflows/stage-release.yml",
    commit: source,
    channel: "pilot",
    runId: "5",
    attempt: "1",
    qualificationRun: "4",
    qualificationAttempt: "1",
    manifestSha256: sha256Buffer(manifest),
    qualificationAdvisory,
  };
  const stage = {
    ...pending,
    state: "STAGED",
    stageId: "00000000-0000-4000-8000-000000000042",
  };
  const operation = {
    manifestSha256: sha256Buffer(manifest),
    stageRun: "5",
    stageAttempt: "1",
    stageController: source,
  };
  const files = new Map([
    ["manifest.json", manifest],
    [
      "stage-journal.jsonl",
      Buffer.from(
        canonicalJson({ ...pending, state: "REQUESTED" }) +
          "\n" +
          canonicalJson(stage) +
          "\n",
      ),
    ],
    ["qualification-advisory.json", statement],
    ["qualification-advisory.sigstore.json", Buffer.from("test boundary")],
    ["qualification-advisory-job.json", Buffer.from("{}")],
  ]);
  await expect(
    verifyArchivedQualification(
      files,
      { stage },
      operation,
      null,
      Date.parse(expiresAt) - 1,
    ),
  ).resolves.toBeUndefined();
  expect(verify).toHaveBeenLastCalledWith(
    expect.objectContaining({ now: Date.parse(enteredAt) }),
  );
  await expect(
    verifyArchivedQualification(
      files,
      { stage },
      operation,
      null,
      Date.parse(expiresAt),
    ),
  ).rejects.toThrow("case evidence is invalid or expired");
  await expect(
    verifyArchivedQualification(
      files,
      { stage },
      operation,
      null,
      Date.parse(enteredAt) - 1,
    ),
  ).rejects.toThrow("dated after native seal authorization");
});

test("cold normal completion authenticates the native seal request before accepting its standalone clock", async () => {
  const clock = "2026-11-26T12:35:00.500Z";
  const request = {
    state: "SEAL_REQUESTED",
    releaseEvidenceSchema: 8,
    authorizedAt: clock,
    runId: "650",
    attempt: "1",
    controller: "a".repeat(40),
    checkpoint: "b".repeat(40),
  };
  const logical = `github-release-${request.runId}-${request.attempt}`;
  const run = {
    id: Number(request.runId),
    run_attempt: 1,
    head_sha: request.controller,
    path: ".github/workflows/github-release.yml",
    head_branch: "main",
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "success",
    repository: { full_name: REPOSITORY },
    head_repository: { full_name: REPOSITORY },
  };
  const jobs = {
    total_count: 1,
    jobs: [
      {
        id: 694,
        name: "seal",
        run_id: run.id,
        run_attempt: 1,
        head_sha: run.head_sha,
        status: "completed",
        conclusion: "success",
        steps: [
          {
            name: "Prepare or seal verified GitHub release (seal)",
            status: "completed",
            conclusion: "success",
            started_at: "2026-11-26T12:30:00Z",
            completed_at: "2026-11-26T12:35:00Z",
          },
          {
            name: "Retain original operation evidence",
            status: "completed",
            conclusion: "success",
            started_at: "2026-11-26T12:35:03Z",
            completed_at: "2026-11-26T12:35:05Z",
          },
        ],
      },
    ],
  };
  const name = physicalName({
    logical,
    run: request.runId,
    attempt: request.attempt,
    producer: "a".repeat(16),
    invocation: "b".repeat(32),
    ordinal: 0,
  });
  const checkpointFor = (request) => {
    const zip = zipArchive([
      { path: "seal-request.json", content: stableJson(request) },
    ]);
    const artifact = {
      id: 12,
      name,
      created_at: "2026-11-26T12:35:04Z",
      expired: true,
      size_in_bytes: zip.length,
      digest: "sha256:" + sha256Buffer(zip),
      workflow_run: {
        id: run.id,
        head_sha: run.head_sha,
        repository_id: REPOSITORY_ID,
        head_repository_id: REPOSITORY_ID,
      },
    };
    return {
      files: new Map([
        [
          `origin-${request.runId}-${request.attempt}-${logical}.json`,
          Buffer.from(stableJson({ run, artifact, jobs })),
        ],
        [`artifact-${artifact.id}.zip`, zip],
      ]),
    };
  };
  const client = {
    read: async () => {
      throw Object.assign(new Error("Actions expired"), { httpStatus: 404 });
    },
  };
  const standalone = { ...request, state: "SEALED" };
  await expect(
    verifyOriginalSealRecord(client, checkpointFor(request), standalone),
  ).resolves.toEqual(standalone);
  await expect(
    verifyOriginalSealRecord(client, checkpointFor(request), {
      ...standalone,
      authorizedAt: "2026-11-26T12:31:00.000Z",
    }),
  ).rejects.toThrow("Standalone seal differs");
  const earlier = { ...request, authorizedAt: "2026-11-26T12:29:59.999Z" };
  await expect(
    verifyOriginalSealRecord(client, checkpointFor(earlier), {
      ...earlier,
      state: "SEALED",
    }),
  ).rejects.toThrow("outside its original native writer step");
});
