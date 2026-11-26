/** A rights exception preserves an observation and carries no execution authority. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { jsonEquals, stableJson } from "./canonical-json.mjs";
import { REPOSITORY } from "./release-identity.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { RECIPIENT_MATERIAL_POLICY } from "../util/third-party-evidence/runtime-material-policy.mjs";

export const recipientMaterialCaseDirectory = "recipient-material-cases";
export const recipientMaterialCaseUpload =
  "Retain the unresolved recipient material case";
export const recipientMaterialCaseLimit = 16 * 1024 * 1024;
const unresolved = "REQUIRES_HUMAN_REVIEW";
const digest = /^[a-f0-9]{64}$/u;
const oid = /^[a-f0-9]{40}$/u;
const jobKey = /^[a-zA-Z0-9_-]{1,80}$/u;
const workflowPath = /^\.github\/workflows\/[a-zA-Z0-9_-]{1,80}\.yml$/u;
const roleName = /^[a-z][a-z0-9-]{0,63}$/u;
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const hash = (value) => sha256Buffer(Buffer.from(value));

/** The native run and attempt identify the claimed source. A hosted reader must
 * independently bind these fields to the actual job and retained upload. */
export function recipientCaseOrigin(env = process.env) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== REPOSITORY)
    return { scope: "LOCAL_DIAGNOSTIC" };
  const workflow = env.GITHUB_WORKFLOW_REF?.split("@")[0].slice(
    REPOSITORY.length + 1,
  );
  const origin = {
    scope: "GITHUB_ACTIONS",
    workflow,
    job: env.GITHUB_JOB,
    runId: Number(env.GITHUB_RUN_ID),
    attempt: Number(env.GITHUB_RUN_ATTEMPT),
    commit: env.GITHUB_SHA,
  };
  assertOrigin(origin);
  assert.ok(env.GITHUB_WORKFLOW_REF.startsWith(`${REPOSITORY}/`));
  return origin;
}

function assertOrigin(origin) {
  if (origin.scope === "LOCAL_DIAGNOSTIC") {
    assert.ok(jsonEquals(origin, { scope: "LOCAL_DIAGNOSTIC" }));
    return;
  }
  assert.equal(origin.scope, "GITHUB_ACTIONS");
  assert.deepEqual(Object.keys(origin).sort(), [
    "attempt",
    "commit",
    "job",
    "runId",
    "scope",
    "workflow",
  ]);
  assert.match(origin.workflow, workflowPath);
  assert.match(origin.job, jobKey);
  assert.match(origin.commit, oid);
  assert.ok(positive(origin.runId) && positive(origin.attempt));
}

function materialInputs(packet) {
  const { evidence, material } = packet;
  const { manifest, lock, resolution } = evidence;
  assert.equal(evidence.schemaVersion, 1);
  assert.deepEqual(Object.keys(evidence).sort(), [
    "lock",
    "manifest",
    "resolution",
    "schemaVersion",
  ]);
  assert.equal(typeof manifest, "string");
  assert.equal(typeof lock, "string");
  assert.equal(resolution.schemaVersion, 1);
  assert.equal(
    hash(manifest),
    resolution.manifestSha256,
    "Original recipient manifest changed",
  );
  assert.equal(
    hash(lock),
    resolution.lockSha256,
    "Original recipient lock changed",
  );
  assert.match(resolution.tarballSha256, digest);
  assert.deepEqual(Object.keys(material).sort(), ["original", "sha256"]);
  assert.equal(typeof material.original, "string");
  assert.equal(
    hash(material.original),
    material.sha256,
    "Original recipient material changed",
  );
  const record = JSON.parse(material.original);
  assert.equal(stableJson(record), material.original);
  assert.deepEqual(Object.keys(record).sort(), [
    "archivePolicySha256",
    "artifacts",
    "canonicalEvidence",
    "decisions",
    "policy",
    "registryKeysSha256",
    "schemaVersion",
    "status",
    "subject",
  ]);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.status, unresolved);
  assert.equal(record.policy, RECIPIENT_MATERIAL_POLICY);
  assert.match(record.archivePolicySha256, digest);
  assert.ok(
    jsonEquals(record.subject, {
      resolutionSha256: hash(stableJson(resolution)),
      lockSha256: resolution.lockSha256,
      tarballSha256: resolution.tarballSha256,
    }),
    "Material is for a different original observation",
  );
  return record;
}

/** The exact originals and compact measurements already have a release-proof
 * representation. No raw advisory, raw scan or private work path belongs here. */
export async function retainRecipientMaterialCase({
  directory,
  evidence,
  materialBytes,
  role,
  context = null,
  origin = recipientCaseOrigin(),
}) {
  const packet = {
    schemaVersion: 1,
    status: unresolved,
    role,
    origin,
    context,
    evidence,
    material: {
      original: utf8.decode(materialBytes),
      sha256: sha256Buffer(materialBytes),
    },
  };
  const bytes = Buffer.from(stableJson(packet));
  const caseSha256 = sha256Buffer(bytes);
  openRecipientMaterialCase(bytes, caseSha256);
  await mkdir(directory, { recursive: true });
  const name = `case-${caseSha256}.json`;
  const path = join(directory, name);
  try {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.ok(
      (await readFile(path)).equals(bytes),
      "Conflicting retained recipient material case",
    );
  }
  return { name, caseSha256 };
}

/** Validate transport and byte bindings before opening native graph or legal evidence. */
export function openRecipientMaterialCase(bytes, caseSha256) {
  assert.ok(
    Buffer.isBuffer(bytes) && bytes.length <= recipientMaterialCaseLimit,
    "Missing or oversized recipient material case",
  );
  assert.equal(
    sha256Buffer(bytes),
    caseSha256,
    "Original recipient case changed",
  );
  const text = utf8.decode(bytes);
  const packet = JSON.parse(text);
  assert.equal(stableJson(packet), text);
  assert.deepEqual(Object.keys(packet).sort(), [
    "context",
    "evidence",
    "material",
    "origin",
    "role",
    "schemaVersion",
    "status",
  ]);
  assert.equal(packet.schemaVersion, 1);
  assert.equal(packet.status, unresolved);
  assert.match(packet.role, roleName);
  assertOrigin(packet.origin);
  const record = materialInputs(packet);
  return { packet, record, caseSha256 };
}

/** An acceptance binds all observations of unresolved material in this one lock.
 * Human scope decisions are distinct from the original standing rule result. */
export function recipientMaterialDisposition(
  { packet, record, caseSha256 },
  authority,
) {
  assert.equal(
    packet.origin.scope,
    "GITHUB_ACTIONS",
    "A local observation cannot establish hosted release eligibility",
  );
  const archives = new Map(
    record.artifacts.map((archive) => [archive.artifactId, archive]),
  );
  const exceptions = record.decisions
    .filter(({ disposition }) => disposition === unresolved)
    .map((decision) => {
      const { name, version, resolved, integrity, archive, scan, tarball } =
        archives.get(decision.artifactId);
      return {
        name,
        version,
        resolved,
        integrity,
        tarballSha256: tarball.sha256,
        inventorySha256: archive.evidence.sha256,
        scanSha256: scan.evidence.sha256,
        occurrence: decision,
      };
    });
  assert.ok(
    exceptions.length > 0,
    "Recipient material has no scope for a human disposition",
  );
  return {
    schemaVersion: 1,
    decision: "ACCEPT_RECIPIENT_MATERIAL_FOR_OBSERVATION",
    authority,
    caseSha256,
    materialSha256: packet.material.sha256,
    policy: record.policy,
    archivePolicySha256: record.archivePolicySha256,
    origin: packet.origin,
    subject: { role: packet.role, ...record.subject, context: packet.context },
    exceptions,
  };
}
