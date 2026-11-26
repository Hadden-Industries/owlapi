import { expect, jest, test } from "@jest/globals";
import { zipArchive } from "./fixtures/zip-archive.mjs";
import { documentationArchive } from "./fixtures/documentation-candidate.mjs";
import {
  PACKAGE_FILE_STEM,
  PACKAGE_NAME,
  PACKAGE_SBOM_PURL,
  PACKAGE_VERSION,
} from "./package-identity.mjs";
import { physicalName } from "../tooling/artifact-transport/identity.mjs";
import { REPOSITORY, REPOSITORY_ID } from "./release-identity.mjs";
import { CANONICAL_NODE, CI_RUNTIME } from "./runtime-policy.mjs";
import { stableJson } from "./canonical-json.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { UBUNTU } from "./ubuntu-runner.mjs";

const downloadReleaseArtifact = jest.fn();
const approvals = await import("./release-approvals.mjs");
jest.unstable_mockModule("./release-approvals.mjs", () => ({
  ...approvals,
  downloadReleaseArtifact,
}));
const { readPendingMacRecipientCase } =
  await import("./replay-ci-recipient-material.mjs");

function fixture(originalConclusion) {
  const repository = { id: REPOSITORY_ID, full_name: REPOSITORY };
  const commit = "a".repeat(40);
  const later = {
    id: 25,
    run_attempt: 3,
    status: "completed",
    conclusion: "success",
    head_branch: "main",
    head_sha: commit,
    path: ".github/workflows/release.yml",
    event: "workflow_dispatch",
    repository,
    head_repository: repository,
  };
  const original = { ...later, run_attempt: 1, conclusion: originalConclusion };
  const job = "portability_macos_node_26";
  const started_at = "2026-11-26T10:00:00.000Z",
    completed_at = "2026-11-26T10:00:04.000Z";
  const step = (name) => ({
    name,
    status: "completed",
    conclusion: "success",
    started_at,
    completed_at,
  });
  const mac = {
    id: 44,
    run_id: 25,
    head_sha: commit,
    run_attempt: 1,
    name: `Release / macOS / Node ${CANONICAL_NODE}`,
    status: "completed",
    conclusion: "failure",
    labels: ["macos-15"],
    steps: [step("Retain the exceptional recipient material observation")],
  };
  const producer = {
    ...mac,
    id: 45,
    name: "Release / retained candidate / Produce",
    conclusion: "success",
    labels: [UBUNTU.label],
    steps: [step("Upload the exact same-run candidate")],
  };
  const stem = `${PACKAGE_FILE_STEM}-${PACKAGE_VERSION}`;
  const tarball = documentationArchive({}, [], {
    name: PACKAGE_NAME,
    version: PACKAGE_VERSION,
  });
  const sbom = stableJson({
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    metadata: {
      component: {
        name: PACKAGE_NAME,
        version: PACKAGE_VERSION,
        type: "library",
        purl: PACKAGE_SBOM_PURL,
      },
    },
  });
  const tarballSha256 = sha256Buffer(tarball);
  const candidateZip = zipArchive([
    { path: `${stem}.tgz`, content: tarball },
    { path: `${stem}.cdx.json`, content: sbom },
    {
      path: "SHA256SUMS",
      content: `${sha256Buffer(Buffer.from(sbom))}  ${stem}.cdx.json\n${tarballSha256}  ${stem}.tgz\n`,
    },
  ]);
  const artifact = (id, logical, bytes) => ({
    id,
    name: physicalName({
      logical,
      run: 25,
      attempt: 1,
      producer: "b".repeat(16),
      invocation: "c".repeat(32),
      ordinal: 0,
    }),
    digest: `sha256:${sha256Buffer(bytes)}`,
    size_in_bytes: bytes.length,
    expired: false,
    expires_at: "2099-01-01T00:00:00.000Z",
    created_at: completed_at,
    workflow_run: {
      id: 25,
      head_sha: commit,
      repository_id: REPOSITORY_ID,
      head_repository_id: REPOSITORY_ID,
    },
  });
  const candidate = artifact(50, `${stem}-candidate-25-1`, candidateZip);
  const resolution = {
    dependencyName: "owlapi",
    npm: CI_RUNTIME.npm,
    platform: { os: "darwin", cpu: "arm64", node: CANONICAL_NODE },
    tarballSha256,
  };
  const pending = {
    schemaVersion: 2,
    status: "NEEDS_ARCHIVE_MEASUREMENTS",
    candidate: { id: 50, digest: candidate.digest, tarballSha256 },
    evidence: { resolution },
    lane: {
      runner: "macos-15",
      shell: "bash",
      node: CANONICAL_NODE,
      os: "darwin",
      arch: "arm64",
    },
    matrix: null,
    missing: [{ artifactId: "d".repeat(64) }],
    resolutionSha256: sha256Buffer(Buffer.from(stableJson(resolution))),
    role: "portability-alias",
    source: { workflow: "Release", commit, runId: 25, attempt: 1, job },
  };
  const pendingZip = zipArchive([
    { path: "pending-recipient-material.json", content: stableJson(pending) },
  ]);
  const pendingArtifact = artifact(
    51,
    `pending-recipient-material-${job}-25-1`,
    pendingZip,
  );
  const replies = new Map([
    ["/actions/artifacts/51", pendingArtifact],
    ["/actions/artifacts/50", candidate],
    ["/actions/runs/25", later],
    ["/actions/runs/25/attempts/1", original],
    [
      "/actions/runs/25/attempts/1/jobs?per_page=100&page=1",
      { total_count: 2, jobs: [mac, producer] },
    ],
  ]);
  const client = {
    read: jest.fn(async (path) => {
      if (!replies.has(path))
        throw new Error(`Unexpected fixture read: ${path}`);
      return replies.get(path);
    }),
  };
  downloadReleaseArtifact.mockImplementation(async (_client, meta) =>
    meta.id === 51 ? pendingZip : candidateZip,
  );
  return {
    client,
    pending,
    env: {
      GITHUB_SHA: commit,
      RECIPIENT_OBSERVATION: `51:${pendingArtifact.digest.slice(7)}`,
    },
  };
}

test("reopens the exact failed Mac attempt after the latest partial rerun succeeds", async () => {
  const { client, env, pending } = fixture("failure");
  await expect(readPendingMacRecipientCase(client, env)).resolves.toMatchObject(
    { pending },
  );
  expect(client.read).toHaveBeenCalledWith("/actions/runs/25/attempts/1");
});

test("requires the claimed original attempt itself to have failed", async () => {
  const { client, env } = fixture("success");
  await expect(readPendingMacRecipientCase(client, env)).rejects.toThrow(
    /original.*attempt.*failed/iu,
  );
});
