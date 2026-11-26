import { expect, jest, test } from "@jest/globals";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import { canonicalJson } from "./canonical-json.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";
import { physicalName } from "../tooling/artifact-transport/identity.mjs";
import { zipArchive } from "./fixtures/zip-archive.mjs";
import { qualificationAdvisoryMarker } from "./qualification-advisory-binding.mjs";
import { formatSha256Sums } from "./release-artifacts.mjs";
import { assertImmutableQualificationAssets } from "./staged-evidence.mjs";

const originalSigstore = await import("./release-audit-evaluator-sigstore.mjs");
const keys = generateKeyPairSync("ed25519");
jest.unstable_mockModule("./release-audit-evaluator-sigstore.mjs", () => ({
  ...originalSigstore,
  verifyAuditStatement: async (signature, message) => {
    if (!verify(null, message, keys.publicKey, signature))
      throw Error("Invalid test signature");
  },
}));
const { auditPolicySha256, reopenStageQualificationAdvisory } =
  await import("./release-audit-job.mjs");
const { buildReleaseAuditSubject } =
  await import("./release-audit-evaluator.mjs");
const encode = (v) => Buffer.from(canonicalJson(v) + "\n");
const controller = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const originDate = "2026-11-26T12:30:00.000Z";
const approvedTime = Date.parse(originDate) + 1500;

test("seal reopens the exact originally approved decision after the native run and artifact listings disappear", async () => {
  const workflow = ".github/workflows/release.yml",
    repository = { id: REPOSITORY_ID, full_name: REPOSITORY };
  const run = {
    id: 141,
    run_attempt: 2,
    head_branch: "main",
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "success",
    repository,
    head_repository: repository,
    head_sha: controller,
    path: workflow,
  };
  const job = {
    id: 100,
    name: "Release advisory / Evaluate",
    run_id: 141,
    run_attempt: 1,
    head_sha: controller,
    status: "completed",
    conclusion: "success",
    runner_id: 8,
    labels: [UBUNTU.label],
    check_run_url:
      "https://api.github.com/repos/" + REPOSITORY + "/check-runs/777",
    steps: [
      {
        name: "Retain protected advisory decision",
        status: "completed",
        conclusion: "success",
        started_at: originDate,
        completed_at: new Date(approvedTime).toISOString(),
      },
    ],
  };
  const sourcePackage = { name: "@hadden-industries/owlapi", version: "0.1.0" };
  const subject = buildReleaseAuditSubject({
    role: "producer",
    scope: "production",
    platform: { os: "linux", cpu: "x64", node: "26.13.1", npm: "12.2.3" },
    tarballSha256: "a".repeat(64),
    graphSha256: "b".repeat(64),
    manifestBytes: encode(sourcePackage),
    lockBytes: encode({ lockfileVersion: 3, packages: { "": sourcePackage } }),
  });
  const source = {
    repositoryId: REPOSITORY_ID,
    commit: controller,
    runId: 37,
    attempt: 1,
    jobId: 47,
    artifactSha256: "f".repeat(64),
  };
  const decision = {
    schemaVersion: 2,
    evaluator: {
      workflow,
      controller,
      runId: 141,
      attempt: 1,
      checkRunId: 777,
    },
    subjects: [{ subject, source, observedAt: originDate }],
    policySha256: auditPolicySha256(controller),
    decidedAt: originDate,
    decision: "ACCEPTED",
  };
  const statement = encode(decision),
    signature = sign(null, statement, keys.privateKey);
  const zip = zipArchive([
    { path: "receipt.json", content: statement },
    { path: "receipt.sigstore.json", content: signature },
  ]);
  const artifact = {
    id: 500,
    name: physicalName({
      logical: "release-advisory-141-1",
      run: 141,
      attempt: 1,
      producer: "a".repeat(16),
      invocation: "b".repeat(32),
      ordinal: 0,
    }),
    expired: true,
    size_in_bytes: zip.length,
    digest: "sha256:" + sha256Buffer(zip),
    created_at: originDate,
    workflow_run: {
      id: 141,
      head_sha: controller,
      repository_id: REPOSITORY_ID,
      head_repository_id: REPOSITORY_ID,
    },
  };
  const descriptor = {
    jobId: 100,
    artifactId: 500,
    artifactDigest: artifact.digest,
    statementSha256: sha256Buffer(statement),
    signatureSha256: sha256Buffer(signature),
  };
  const manifest = {
    runId: "141",
    attempt: "2",
    commit: controller,
    consumerResolutionPolicy: 2,
    assets: { tarball: { sha256: subject.tarballSha256 } },
  };
  const stage = {
    qualificationRun: "141",
    qualificationAttempt: "2",
    commit: controller,
    qualificationAdvisory: qualificationAdvisoryMarker({
      decision,
      descriptor,
      verificationTime: approvedTime,
    }),
  };
  const checkpoint = {
    files: new Map([
      ["audit-origin-141-2.json", encode({ job, artifact, run })],
      ["artifact-500.zip", zip],
    ]),
  };
  const reads = [];
  const client = {
    read: async (path) => {
      reads.push(path);
      throw Object.assign(new Error("Expired"), { httpStatus: 404 });
    },
  };
  await expect(
    reopenStageQualificationAdvisory(client, { stage, manifest, checkpoint }),
  ).resolves.toMatchObject({ descriptor, decision });
  expect(reads).toEqual([
    "/actions/runs/141/attempts/2",
    "/actions/jobs/100",
    "/actions/artifacts/500",
  ]);
  await expect(
    reopenStageQualificationAdvisory(client, {
      stage: {
        ...stage,
        qualificationAdvisory: {
          ...stage.qualificationAdvisory,
          subjectsSha256: "b".repeat(64),
        },
      },
      manifest,
      checkpoint,
    }),
  ).rejects.toThrow(/stage subjects/);
  const changed = Buffer.from(zip);
  changed[12] = changed[12] === 0 ? 1 : 0;
  checkpoint.files.set("artifact-500.zip", changed);
  await expect(
    reopenStageQualificationAdvisory(client, { stage, manifest, checkpoint }),
  ).rejects.toThrow(/changed original advisory ZIP/);
});

test("the qualified SBOM, tarball and summed inventory must be the downloaded immutable assets", () => {
  const tgz = Buffer.from("original package"),
    sbom = Buffer.from("original sbom");
  const asset = (name, bytes) => ({
    name,
    bytes: bytes.length,
    sha256: sha256Buffer(bytes),
  });
  const tar = asset("a.tgz", tgz),
    bom = asset("a.cdx.json", sbom);
  const sums = Buffer.from(
    formatSha256Sums(
      [tar, bom].map(({ name, sha256 }) => ({ fileName: name, sha256 })),
    ),
  );
  const assets = {
    tarball: tar,
    sbom: bom,
    checksums: asset("SHA256SUMS", sums),
  };
  const originals = new Map([
    [tar.name, tgz],
    [bom.name, sbom],
    ["SHA256SUMS", sums],
  ]);
  assertImmutableQualificationAssets(assets, originals);
  expect(() =>
    assertImmutableQualificationAssets(
      { ...assets, sbom: asset(bom.name, Buffer.from("other sbom")) },
      originals,
    ),
  ).toThrow(/asset differs/);
  expect(() =>
    assertImmutableQualificationAssets(
      { ...assets, checksums: asset("SHA256SUMS", Buffer.from("other")) },
      new Map([...originals, ["SHA256SUMS", Buffer.from("other")]]),
    ),
  ).toThrow(/checksum inventory/);
});
