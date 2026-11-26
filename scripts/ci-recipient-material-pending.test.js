import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isStrictDescendantPath } from "./release-file-utils.mjs";
import {
  pendingRecipientMaterialFilename,
  retainPendingMacMaterial,
} from "./ci-recipient-material-pending.mjs";
import { REPOSITORY } from "./release-identity.mjs";
import { CANONICAL_NODE, CI_RUNTIME } from "./runtime-policy.mjs";

test("canonical Mac npm retains the original standalone case without a matrix dependency", async () => {
  const directory = mkdtempSync(join(tmpdir(), "owlapi-standalone-mac-case-"));
  expect(isStrictDescendantPath(tmpdir(), directory)).toBe(true);
  try {
    const evidence = {
      schemaVersion: 1,
      manifest: "exact original native manifest",
      lock: "exact original standalone lock",
      resolution: {
        platform: { os: "darwin", cpu: "arm64", node: CANONICAL_NODE },
        npm: CI_RUNTIME.npm,
        dependencyName: "owlapi",
        tarballSha256: "a".repeat(64),
      },
    };
    const environment = {
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: REPOSITORY,
      GITHUB_WORKFLOW: "Release",
      GITHUB_JOB: "portability_macos_node_26",
      GITHUB_RUN_ID: "26",
      GITHUB_RUN_ATTEMPT: "2",
      GITHUB_SHA: "b".repeat(40),
      CANDIDATE_ARTIFACT_ID: "100",
      CANDIDATE_ARTIFACT_DIGEST: "c".repeat(64),
    };
    const expected = {
      root: join(directory, "eligibility"),
      evidence,
      role: "portability-alias",
      missing: [{ artifactId: "d".repeat(64) }],
      environment,
    };
    await expect(
      retainPendingMacMaterial({
        ...expected,
        evidence: {
          ...evidence,
          resolution: { ...evidence.resolution, npm: CI_RUNTIME.consumerNpm },
        },
      }),
    ).rejects.toThrow();
    await expect(retainPendingMacMaterial(expected)).resolves.toBe(true);
    const packet = JSON.parse(
      readFileSync(join(directory, pendingRecipientMaterialFilename)),
    );
    expect(packet).toMatchObject({
      schemaVersion: 2,
      status: "NEEDS_ARCHIVE_MEASUREMENTS",
      source: { job: "portability_macos_node_26", runId: 26, attempt: 2 },
      lane: { runner: "macos-15", node: CANONICAL_NODE, arch: "arm64" },
      matrix: null,
      candidate: { id: 100, digest: `sha256:${"c".repeat(64)}` },
      evidence,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
