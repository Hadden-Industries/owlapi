import { expect, jest, test } from "@jest/globals";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stableJson } from "./canonical-json.mjs";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";

// These are separately dated, independently authenticated native observations.
// Their same candidate and requesting range legitimately permit two patch versions.
const tarball = Buffer.from("same admitted candidate");
const tarballSha256 = sha256Buffer(tarball);
const commit = "a".repeat(40);
const scope = {
  role: "portability-alias",
  commit,
  tarballSha256,
  platform: {
    os: "darwin",
    cpu: "arm64",
    node: CI_RUNTIME.node[22],
    npm: CI_RUNTIME.consumerNpm,
  },
};
const native = new Map();
function observation({ id, roleJob, observedAt, version }) {
  const manifest = stableJson({
    name: "fixture",
    version: "0.0.0",
    dependencies: { owlapi: "file:candidate.tgz" },
  });
  const lock = stableJson({
    lockfileVersion: 3,
    packages: {
      "": {
        name: "fixture",
        version: "0.0.0",
        dependencies: { owlapi: "file:candidate.tgz" },
      },
      "node_modules/owlapi": {
        name: "@hadden-industries/owlapi",
        version: "0.1.0",
        resolved: "file:candidate.tgz",
        dependencies: { "node-types": "^1.0.0" },
      },
      "node_modules/node-types": {
        version,
        resolved: `https://registry.npmjs.org/node-types/-/node-types-${version}.tgz`,
      },
    },
  });
  const { npm, ...platform } = scope.platform;
  const resolution = {
    schemaVersion: 1,
    dependencyName: "owlapi",
    platform,
    npm,
    tarballSha256,
    manifestSha256: sha256Buffer(Buffer.from(manifest)),
    lockSha256: sha256Buffer(Buffer.from(lock)),
  };
  const evidence = { schemaVersion: 1, manifest, lock, resolution };
  const resolutionSha256 = sha256Buffer(Buffer.from(stableJson(resolution)));
  const original = {
    tarball,
    pending: {
      role: scope.role,
      resolutionSha256,
      evidence,
      source: {
        commit,
        ...(roleJob === "consumer_runtime" ? {} : { job: roleJob }),
      },
    },
  };
  const selection = {
    ...scope,
    job: roleJob,
    resolutionSha256,
    observationArtifactId: id,
    observationArtifactSha256: sha256Buffer(Buffer.from(observedAt)),
    scannerArtifactId: id + 100,
    scannerArtifactSha256: sha256Buffer(
      Buffer.from(observedAt + "-linux-scan"),
    ),
  };
  native.set(`${id}:${selection.observationArtifactSha256}`, original);
  return { selection, evidence };
}

const checkpointObject = "b".repeat(40);
const matrix = observation({
  id: 101,
  roleJob: "consumer_runtime",
  observedAt: "2026-11-26T12:00:00.000Z",
  version: "1.0.1",
});
const standalone = observation({
  id: 202,
  roleJob: "portability_macos_node_22",
  observedAt: "2026-11-26T12:02:00.000Z",
  version: "1.0.2",
});
const readCheckpoint = jest.fn();
const history = await import("./release-history-checkpoint.mjs");
jest.unstable_mockModule("./release-history-checkpoint.mjs", () => ({
  ...history,
  readCheckpoint,
}));
jest.unstable_mockModule("./replay-ci-recipient-material.mjs", () => ({
  readPendingMacRecipientCase: async (_client, environment) =>
    native.get(environment.RECIPIENT_OBSERVATION),
  readRetainedMacMeasurements: async () => ({ trustedArchiveMeasurements: [] }),
}));
const { openMacRecipientMeasurements } =
  await import("./macos-material-readmission.mjs");

test("preserves both exact locks when a matrix and a standalone job share the same runtime and role", async () => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-mac-recovery-selection-"));
  expect(isStrictDescendantPath(tmpdir(), root)).toBe(true);
  try {
    mkdirSync(join(root, "bin"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "npm", version: CI_RUNTIME.consumerNpm }),
    );
    const npmCli = join(root, "bin", "npm-cli.js");
    readCheckpoint.mockResolvedValue({
      objectId: checkpointObject,
      files: new Map([
        [
          "recipient-material-measurements.json",
          Buffer.from(
            stableJson({
              schemaVersion: 1,
              measurements: [matrix.selection, standalone.selection],
            }),
          ),
        ],
      ]),
    });
    const client = {};
    expect(matrix.evidence.lock).not.toBe(standalone.evidence.lock);
    const wanted = { client, checkpointObject, tarball, npmCli };
    await expect(
      openMacRecipientMeasurements({
        ...wanted,
        scope: { ...scope, job: "consumer_runtime" },
      }),
    ).resolves.toMatchObject({
      evidence: matrix.evidence,
      archiveMeasurements: {
        job: "consumer_runtime",
        replayedResolutionSha256: matrix.selection.resolutionSha256,
      },
    });
    await expect(
      openMacRecipientMeasurements({
        ...wanted,
        scope: { ...scope, job: "portability_macos_node_22" },
      }),
    ).resolves.toMatchObject({
      evidence: standalone.evidence,
      archiveMeasurements: {
        job: "portability_macos_node_22",
        replayedResolutionSha256: standalone.selection.resolutionSha256,
      },
    });
    readCheckpoint.mockResolvedValue({
      objectId: checkpointObject,
      files: new Map([
        [
          "recipient-material-measurements.json",
          Buffer.from(
            stableJson({
              schemaVersion: 1,
              measurements: [
                { ...matrix.selection, job: "portability_macos_node_22" },
              ],
            }),
          ),
        ],
      ]),
    });
    await expect(
      openMacRecipientMeasurements({
        ...wanted,
        client: {},
        scope: { ...scope, job: "portability_macos_node_22" },
      }),
    ).rejects.toThrow(/another original native job/iu);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
