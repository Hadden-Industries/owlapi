/** Apply approved Ubuntu measurements to their exact native recipient originals. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { canonicalJson, jsonEquals } from "./canonical-json.mjs";
import { GitHubReleaseClient } from "./github-release.mjs";
import { readCheckpoint } from "./release-history-checkpoint.mjs";
import { REPOSITORY } from "./release-identity.mjs";
import { CANONICAL_NODE, CI_RUNTIME } from "./runtime-policy.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { withAuditNpmClients } from "./release-audit-runtimes.mjs";
import {
  readPendingMacRecipientCase,
  readRetainedMacMeasurements,
} from "./replay-ci-recipient-material.mjs";

export const recipientMaterialMeasurementsMember =
  "recipient-material-measurements.json";
const oid = /^[a-f0-9]{40}$/u;
const digest = /^[a-f0-9]{64}$/u;
const clients = new Map();
const custody = new WeakMap();
const validId = (value) => Number.isSafeInteger(value) && value > 0;
const fields = (value, keys) =>
  assert.ok(jsonEquals(Object.keys(value).sort(), [...keys].sort()));

/** Source and archive measurements may be reused across installs. The exact
 * original lock is selected only for its own native role and runtime. */
export function selectMacMeasurements(
  bytes,
  { commit, tarballSha256, role, platform },
) {
  if (!bytes) return { entries: [], replay: null };
  assert.ok(
    Buffer.isBuffer(bytes) && bytes.length <= 64 * 1024,
    "Signed scanner selection exceeds its bounds",
  );
  const index = JSON.parse(bytes);
  fields(index, ["schemaVersion", "measurements"]);
  assert.equal(index.schemaVersion, 1);
  assert.ok(
    Array.isArray(index.measurements) && index.measurements.length <= 32,
  );
  const unique = new Set();
  for (const row of index.measurements) {
    fields(row, [
      "role",
      "commit",
      "tarballSha256",
      "resolutionSha256",
      "platform",
      "observationArtifactId",
      "observationArtifactSha256",
      "scannerArtifactId",
      "scannerArtifactSha256",
    ]);
    assert.ok(["portability-alias", "portability-scoped"].includes(row.role));
    assert.match(row.commit, oid);
    for (const key of [
      "tarballSha256",
      "resolutionSha256",
      "observationArtifactSha256",
      "scannerArtifactSha256",
    ])
      assert.match(row[key], digest);
    assert.ok(
      [row.observationArtifactId, row.scannerArtifactId].every(validId),
    );
    fields(row.platform, ["os", "cpu", "node", "npm"]);
    assert.equal(row.platform.os, "darwin");
    assert.equal(row.platform.cpu, "arm64");
    assert.ok(
      row.platform.npm === CI_RUNTIME.consumerNpm ||
        (row.platform.npm === CI_RUNTIME.npm &&
          row.platform.node === CANONICAL_NODE),
    );
    assert.match(row.platform.node, /^[1-9]\d*\.\d+\.\d+$/u);
    const key = canonicalJson([
      row.role,
      row.commit,
      row.tarballSha256,
      row.platform,
    ]);
    assert.ok(
      !unique.has(key),
      "Ambiguous signed native measurement selection",
    );
    unique.add(key);
  }
  const entries = index.measurements
    .filter(
      (row) =>
        row.commit === commit &&
        row.tarballSha256 === tarballSha256 &&
        // Consumer-floor runtimes cannot load the producer npm's native graph API.
        (platform.npm === CI_RUNTIME.npm ||
          row.platform.npm === CI_RUNTIME.consumerNpm),
    )
    .sort((left, right) =>
      left.resolutionSha256 < right.resolutionSha256
        ? -1
        : left.resolutionSha256 > right.resolutionSha256
          ? 1
          : 0,
    );
  const replay =
    entries.find(
      (row) => row.role === role && jsonEquals(row.platform, platform),
    ) ?? null;
  return { entries, replay };
}

function clientCache(client) {
  if (!custody.has(client))
    custody.set(client, { checkpoints: new Map(), originals: new Map() });
  return custody.get(client);
}

async function authenticateOriginal(client, row, tarball, npmCli) {
  const cache = clientCache(client).originals;
  const key = canonicalJson(row);
  if (!cache.has(key))
    cache.set(
      key,
      (async () => {
        const original = await readPendingMacRecipientCase(client, {
          GITHUB_SHA: row.commit,
          RECIPIENT_OBSERVATION: `${row.observationArtifactId}:${row.observationArtifactSha256}`,
        });
        const { pending } = original;
        assert.equal(
          pending.role,
          row.role,
          "Signed measurement covers another original role",
        );
        assert.equal(
          pending.resolutionSha256,
          row.resolutionSha256,
          "Signed measurement covers another original lock",
        );
        assert.ok(
          jsonEquals(
            {
              ...pending.evidence.resolution.platform,
              npm: pending.evidence.resolution.npm,
            },
            row.platform,
          ),
        );
        assert.ok(
          original.tarball.equals(tarball),
          "Signed measurement covers another candidate archive",
        );
        const locator = {
          id: row.scannerArtifactId,
          sha256: row.scannerArtifactSha256,
        };
        const actualNpm = createRequire(npmCli)("../package.json").version;
        const measurement =
          actualNpm === row.platform.npm
            ? await readRetainedMacMeasurements(
                client,
                original,
                locator,
                npmCli,
              )
            : await withAuditNpmClients(npmCli, (forVersion) =>
                readRetainedMacMeasurements(
                  client,
                  original,
                  locator,
                  forVersion(row.platform.npm),
                ),
              );
        return {
          evidence: pending.evidence,
          measurements: measurement.trustedArchiveMeasurements,
        };
      })(),
    );
  return cache.get(key);
}

/** Reopen every signed original used in this candidate's native measurements. */
export async function openMacRecipientMeasurements({
  client,
  checkpointObject,
  scope,
  tarball,
  npmCli,
}) {
  assert.match(checkpointObject, oid);
  assert.equal(scope.platform.os, "darwin");
  assert.equal(sha256Buffer(tarball), scope.tarballSha256);
  const cache = clientCache(client).checkpoints;
  if (!cache.has(checkpointObject))
    cache.set(checkpointObject, readCheckpoint(client, checkpointObject));
  const checkpoint = await cache.get(checkpointObject);
  const { entries, replay } = selectMacMeasurements(
    checkpoint.files.get(recipientMaterialMeasurementsMember),
    scope,
  );
  if (!entries.length) return undefined;
  const originals = new Map();
  const selected = new Map();
  for (const row of entries) {
    const opened = await authenticateOriginal(client, row, tarball, npmCli);
    originals.set(row, opened.evidence);
    for (const item of opened.measurements) {
      const id = item.record.artifactId;
      if (selected.has(id))
        assert.ok(
          jsonEquals(selected.get(id).record, item.record),
          "Conflicting authorized measurements for an immutable archive",
        );
      else selected.set(id, item);
    }
  }
  return {
    trustedArchiveMeasurements: [...selected.values()],
    evidence: originals.get(replay),
    archiveMeasurements: {
      checkpoint: checkpoint.objectId,
      scannerArtifacts: entries.map((row) => row.scannerArtifactSha256),
      replayedResolutionSha256: replay?.resolutionSha256 ?? null,
    },
  };
}

/** The ordinary Mac installer selects the captured lock before any resolution. */
export async function loadMacRecipientMeasurements({
  tarball,
  npmCli,
  role,
  platform,
  environment = process.env,
}) {
  const checkpointObject = environment.RECIPIENT_MATERIAL_CHECKPOINT;
  if (!checkpointObject || platform.os !== "darwin") return undefined;
  assert.equal(environment.GITHUB_ACTIONS, "true");
  assert.equal(environment.GITHUB_REPOSITORY, REPOSITORY);
  assert.equal(environment.GITHUB_REF, "refs/heads/main");
  assert.equal(environment.GITHUB_WORKFLOW, "Release");
  assert.equal(environment.GITHUB_EVENT_NAME, "workflow_dispatch");
  const token = environment.GH_TOKEN;
  assert.ok(
    token,
    "Protected Mac recovery requires authenticated original artifact reads",
  );
  if (!clients.has(token))
    clients.set(
      token,
      new GitHubReleaseClient({ repository: REPOSITORY, token }),
    );
  const npm = createRequire(npmCli)("../package.json").version;
  return openMacRecipientMeasurements({
    client: clients.get(token),
    checkpointObject,
    tarball,
    npmCli,
    scope: {
      commit: environment.GITHUB_SHA,
      tarballSha256: sha256Buffer(tarball),
      role,
      platform: { ...platform, npm },
    },
  });
}

/** Admission independently reopens the signed source of each reused archive. */
export async function verifyRecoveredMacMeasurement({
  client,
  checkpoint,
  scope,
  tarball,
  npmCli,
  proof,
  evidence,
  record,
}) {
  assert.ok(checkpoint && client);
  const original = await openMacRecipientMeasurements({
    client,
    checkpointObject: checkpoint,
    scope,
    tarball,
    npmCli,
  });
  assertRecoveredMacMeasurement(original, { proof, evidence, record });
}

/** Compare a receipt to the independently reopened scanner originals. */
export function assertRecoveredMacMeasurement(
  original,
  { proof, evidence, record },
) {
  assert.ok(
    original && jsonEquals(original.archiveMeasurements, proof),
    "Recipient used an unsigned scanner selection",
  );
  if (original.evidence)
    assert.ok(
      jsonEquals(original.evidence, evidence),
      "Recipient tests did not use the signed original lock",
    );
  const authorized = new Map(
    original.trustedArchiveMeasurements.map((item) => [
      item.record.artifactId,
      item,
    ]),
  );
  for (const { measurementOrigin, ...archive } of record.artifacts) {
    if (!measurementOrigin) continue;
    const source = authorized.get(archive.artifactId);
    assert.ok(
      source &&
        jsonEquals(source.origin, measurementOrigin) &&
        jsonEquals(source.record, archive),
      "Recipient used different scanner measurements than the signed original",
    );
  }
}
