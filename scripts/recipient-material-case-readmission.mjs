/** Reopen signed exception evidence in ordinary qualification and at admission. */
import assert from "node:assert/strict";
import { jsonEquals, stableJson } from "./canonical-json.mjs";
import { GitHubReleaseClient } from "./github-release.mjs";
import { REPOSITORY } from "./release-identity.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { readCheckpoint } from "./release-history-checkpoint.mjs";
import { verifyResolutionEvidence } from "./release-consumer-evidence.mjs";
import { assertRecipientMaterialDisposition } from "./recipient-material-case-authority.mjs";
import { openRecipientMaterialCase } from "./recipient-material-case.mjs";

const indexName = "recipient-material-cases.json";
const hex = /^[a-f0-9]{64}$/u;
const oid = /^[a-f0-9]{40}$/u;
const hash = (value) => sha256Buffer(Buffer.from(stableJson(value)));
const clients = new Map();
const checkpoints = new WeakMap();

function caseCheckpoint(client, object) {
  assert.match(object, oid);
  if (!checkpoints.has(client)) checkpoints.set(client, new Map());
  const byObject = checkpoints.get(client);
  if (!byObject.has(object))
    byObject.set(object, readCheckpoint(client, object));
  return byObject.get(object);
}

function caseSelection(checkpoint, role, resolution) {
  const input = checkpoint.files.get(indexName);
  if (!input) return undefined;
  assert.ok(
    input.length <= 64 * 1024,
    "Recipient rights selection exceeds its bound",
  );
  const index = JSON.parse(input);
  assert.deepEqual(Object.keys(index).sort(), ["cases", "schemaVersion"]);
  assert.equal(index.schemaVersion, 1);
  assert.ok(Array.isArray(index.cases) && index.cases.length <= 100);
  const unique = new Set();
  let selected;
  for (const entry of index.cases) {
    assert.deepEqual(Object.keys(entry).sort(), [
      "artifactId",
      "artifactSha256",
      "caseSha256",
      "resolutionSha256",
      "role",
    ]);
    assert.match(entry.role, /^[a-z][a-z0-9-]{0,63}$/u);
    for (const key of ["artifactSha256", "caseSha256", "resolutionSha256"])
      assert.match(entry[key], hex);
    assert.ok(
      Number.isSafeInteger(entry.artifactId) &&
        entry.artifactId > 0 &&
        entry.artifactId < 1e15,
    );
    const key = `${entry.role}:${entry.resolutionSha256}`;
    assert.ok(!unique.has(key), "Ambiguous signed recipient rights selection");
    unique.add(key);
    if (entry.role === role && entry.resolutionSha256 === resolution)
      selected = entry;
  }
  return selected;
}

/** Apply an original disposition only to the same native graph and distribution owner. */
function assertRecipientCaseApplies(
  packet,
  { evidence, role, sourceCommit, caseContext },
) {
  assert.ok(
    jsonEquals(packet.evidence, evidence),
    "Rights disposition covers different native originals",
  );
  assert.equal(packet.role, role);
  assert.equal(packet.origin.commit, sourceCommit);
  const originalContext = packet.context;
  if (originalContext.kind === "PUBLIC_OBSERVATION") {
    assert.equal(
      caseContext?.kind,
      "PUBLIC_OBSERVATION",
      "Public rights cannot qualify a pre-publication candidate",
    );
    assert.ok(
      jsonEquals(originalContext.stage, caseContext.stage),
      "Rights disposition covers a different approved public stage",
    );
    assert.equal(originalContext.lane, caseContext.lane);
  } else {
    assert.notEqual(
      caseContext?.kind,
      "PUBLIC_OBSERVATION",
      "Candidate rights cannot qualify an approved public stage",
    );
    if (originalContext.kind === "PRODUCER_CANDIDATE") {
      assert.equal(caseContext?.kind, "PRODUCER_CANDIDATE");
      assert.equal(
        originalContext.sbomSha256,
        caseContext?.sbomSha256,
        "Rights disposition covers a different producer SBOM",
      );
    }
  }
}

async function authenticateCase(client, checkpoint, entry, scope, npmCli) {
  assert.match(scope.sourceCommit ?? "", oid);
  const env = {
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: scope.sourceCommit,
    RECIPIENT_OBSERVATION: `${entry.artifactId}:${entry.artifactSha256}`,
    RECIPIENT_CASE_SHA256: entry.caseSha256,
  };
  const {
    reopenOriginalRecipientMaterialCase,
    reopenOriginalRecipientMaterialSubject,
  } = await import("./recipient-material-case-replay.mjs");
  const originalCase = await reopenOriginalRecipientMaterialCase(client, env);
  const { original } = originalCase;
  assertRecipientCaseApplies(original.packet, scope);
  const authorization = assertRecipientMaterialDisposition(
    original,
    checkpoint,
  );
  const subject = await reopenOriginalRecipientMaterialSubject(
    client,
    originalCase,
    env,
    npmCli,
  );
  const resolution = scope.evidence.resolution;
  assert.equal(sha256Buffer(subject.tarball), resolution.tarballSha256);
  await verifyResolutionEvidence(original.packet.evidence, {
    tarball: subject.tarball,
    dependencyName: resolution.dependencyName,
    registryTarball: subject.registryTarball,
    platform: resolution.platform,
    observedNpm: resolution.npm,
    npmCli,
  });
  return { original, authorization };
}

/** Existing qualification can run its usual checks on a fresh observation that
 * reopens and matches an approved original in every field. */
export async function admitRetainedRecipientMaterial({
  checkpointObject,
  scope,
  npmCli,
  reader,
  environment = process.env,
}) {
  if (!checkpointObject) return undefined;
  assert.equal(environment.GITHUB_ACTIONS, "true");
  assert.equal(environment.GITHUB_REPOSITORY, REPOSITORY);
  assert.equal(environment.GITHUB_REF, "refs/heads/main");
  assert.equal(environment.GITHUB_EVENT_NAME, "workflow_dispatch");
  const token = environment.GH_TOKEN;
  if (!clients.has(token))
    clients.set(
      token,
      new GitHubReleaseClient({ repository: REPOSITORY, token }),
    );
  const client = clients.get(token);
  const checkpoint = await caseCheckpoint(client, checkpointObject);
  const entry = caseSelection(
    checkpoint,
    scope.role,
    hash(scope.evidence.resolution),
  );
  if (!entry) return undefined;
  let original;
  try {
    ({ original } = await authenticateCase(
      client,
      checkpoint,
      entry,
      scope,
      npmCli,
    ));
  } catch (error) {
    if (
      scope.caseContext?.kind === "PUBLIC_OBSERVATION" &&
      (error.code === "RECIPIENT_ORIGINAL_EXPIRED" ||
        [404, 410].includes(error.httpStatus))
    )
      return undefined;
    throw error;
  }
  const { material } = original.packet;
  await reader.verifyRetained({
    recordBytes: Buffer.from(material.original),
    recordSha256: material.sha256,
    resolution: scope.evidence.resolution,
    lockfileBytes: Buffer.from(scope.evidence.lock),
  });
  return {
    materialBytes: Buffer.from(material.original),
    rights: {
      checkpoint: checkpointObject,
      ...entry,
      origin: original.packet.origin,
      context: original.packet.context,
    },
  };
}

/** Authenticated admission reopens the
 * owner checkpoint, actual original job and retained material independently. */
export async function verifyQualifiedRecipientMaterial(
  reader,
  input,
  { client, scope, npmCli, rights, archived = false },
) {
  const { recordBytes, recordSha256 } = input;
  if (!rights) {
    const material = await reader.verifyRetained(input);
    assert.equal(
      material.record.status,
      "PASSED",
      "Recipient rights decision is incomplete",
    );
    return material;
  }
  assert.ok(
    client && scope,
    "Independent authenticated recipient rights readback is required",
  );
  assert.equal(
    sha256Buffer(recordBytes),
    recordSha256,
    "Qualified material changed",
  );
  const checkpoint = await caseCheckpoint(client, rights.checkpoint);
  const entry = caseSelection(
    checkpoint,
    scope.role,
    hash(scope.evidence.resolution),
  );
  assert.ok(
    entry &&
      jsonEquals(rights, {
        checkpoint: checkpoint.objectId,
        ...entry,
        origin: rights.origin,
        context: rights.context,
      }),
    "Qualified material refers to an unsigned case selection",
  );
  // A sealed release already authenticates the native job and material upload.
  // Reconstruct its case from the archived originals and the signed case digest.
  const reopened = archived
    ? openRecipientMaterialCase(
        Buffer.from(
          stableJson({
            schemaVersion: 1,
            status: "REQUIRES_HUMAN_REVIEW",
            role: scope.role,
            origin: rights.origin,
            context: rights.context,
            evidence: scope.evidence,
            material: {
              original: recordBytes.toString("utf8"),
              sha256: recordSha256,
            },
          }),
        ),
        entry.caseSha256,
      )
    : null;
  if (reopened) assertRecipientCaseApplies(reopened.packet, scope);
  const { original, authorization } = reopened
    ? {
        original: reopened,
        authorization: assertRecipientMaterialDisposition(reopened, checkpoint),
      }
    : await authenticateCase(client, checkpoint, entry, scope, npmCli);
  assert.ok(
    jsonEquals(rights.origin, original.packet.origin) &&
      jsonEquals(rights.context, original.packet.context),
  );
  assert.equal(recordSha256, original.packet.material.sha256);
  assert.ok(recordBytes.equals(Buffer.from(original.packet.material.original)));
  const material = await reader.verifyRetained(input);
  return { ...material, rights: authorization };
}
