/** Pre-execution checks for a measured CI installation. Release admission separately
 * authenticates the original job and performs the current advisory check on these bytes. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { canonicalJson, stableJson } from "./canonical-json.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { preflightReleaseAudit } from "./release-audit-evaluator.mjs";
import { createCiRecipientScanner } from "./ci-recipient-scanner.mjs";
import { retainPendingMacMaterial } from "./ci-recipient-material-pending.mjs";
import {
  recipientMaterialCaseDirectory,
  retainRecipientMaterialCase,
} from "./recipient-material-case.mjs";
import {
  prepareRecipientMaterial,
  RECIPIENT_MATERIAL_NAME,
} from "../util/third-party-evidence/recipient-material.mjs";

const digest = (value) => sha256Buffer(Buffer.from(stableJson(value)));
const roots = new Map();

// Registry validation can share authenticated archive work across all the observations
// written by one producer process. The output directory is unique to that job/attempt.
function materialContext(root, npmCli, trustedArchiveMeasurements) {
  if (!roots.has(root))
    roots.set(
      root,
      (async () => {
        await mkdir(join(root, "material"), { recursive: true });
        return {
          input: await prepareRecipientMaterial({
            evidenceDirectory: join(root, "archives"),
            npmCli,
            scanArtifact: createCiRecipientScanner({ root }),
            trustedArchiveMeasurements,
            canonicalLockfileBytes: process.env.OWLAPI_CANONICAL_EVIDENCE_LOCK
              ? await readFile(process.env.OWLAPI_CANONICAL_EVIDENCE_LOCK)
              : undefined,
          }),
          collected: new Map(),
        };
      })(),
    );
  return roots.get(root);
}

/** Compare original manifest and lock immediately before testing. Return a compact
 * job-scoped decision and retain its public-safe inputs at fixed, digest-bound names. */
export async function verifyCiConsumerEvidence({
  directory,
  evidence,
  role,
  decisionDirectory,
  npmCli = process.env.OWLAPI_CONSUMER_NPM ?? process.env.npm_execpath,
  trustedArchiveMeasurements,
  caseDirectory,
  caseContext,
}) {
  assert.ok(
    typeof decisionDirectory === "string" && decisionDirectory,
    "Missing retained eligibility directory",
  );
  assert.match(role, /^[a-z][a-z0-9-]{0,63}$/u);
  const root = resolve(decisionDirectory);
  const { resolution } = evidence;
  const manifestBytes = await readFile(join(directory, "package.json")),
    lockBytes = await readFile(join(directory, "package-lock.json"));
  assert.equal(sha256Buffer(manifestBytes), resolution.manifestSha256);
  assert.equal(sha256Buffer(lockBytes), resolution.lockSha256);
  assert.ok(
    manifestBytes.equals(Buffer.from(evidence.manifest)) &&
      lockBytes.equals(Buffer.from(evidence.lock)),
    "Observation and installed consumer inputs differ",
  );
  const resolutionSha256 = digest(resolution);
  const materialDirectory = join(root, "material", resolutionSha256);
  const context = await materialContext(
    root,
    npmCli,
    trustedArchiveMeasurements,
  );
  if (process.platform === "darwin") {
    const missing = context.input.missingArchiveMeasurements({
      resolution,
      lockfileBytes: lockBytes,
    });
    if (missing.length) {
      const retained = await retainPendingMacMaterial({
        root,
        evidence,
        role,
        missing,
      });
      const action = retained
        ? "Original measured graph retained for scoped material replay"
        : "Authenticate a native scanner measurement for each listed exact archive before replay";
      throw new Error(
        `Recipient requires ${missing.length} new archive measurements. ${action}.`,
      );
    }
  }
  if (!context.collected.has(resolutionSha256))
    context.collected.set(
      resolutionSha256,
      context.input.collect({
        directory: materialDirectory,
        resolution,
        lockfileBytes: lockBytes,
      }),
    );
  const material = await context.collected.get(resolutionSha256);
  const materialBytes = await readFile(
    join(materialDirectory, RECIPIENT_MATERIAL_NAME),
  );
  if (material.status === "REQUIRES_HUMAN_REVIEW") {
    const candidateId = Number(
      process.env.OWLAPI_CANDIDATE_ID ?? process.env.CANDIDATE_ARTIFACT_ID,
    );
    const candidateDigest =
      process.env.OWLAPI_CANDIDATE_DIGEST ??
      (process.env.CANDIDATE_ARTIFACT_DIGEST &&
        `sha256:${process.env.CANDIDATE_ARTIFACT_DIGEST}`);
    const candidate =
      Number.isSafeInteger(candidateId) &&
      candidateId > 0 &&
      /^sha256:[a-f0-9]{64}$/u.test(candidateDigest)
        ? {
            kind: "QUALIFIED_CANDIDATE",
            candidate: { id: candidateId, digest: candidateDigest },
          }
        : null;
    const { caseSha256 } = await retainRecipientMaterialCase({
      directory:
        caseDirectory ?? join(dirname(root), recipientMaterialCaseDirectory),
      evidence,
      role,
      materialBytes,
      context: caseContext ?? candidate,
    });
    throw new Error(
      `Recipient archive evidence requires a rights disposition. Case ${caseSha256}.`,
    );
  }
  assert.equal(
    material.status,
    "PASSED",
    "Recipient archive evidence did not complete",
  );
  const materialSha256 = sha256Buffer(materialBytes);
  const { tarballSha256 } = resolution;
  const audit = await preflightReleaseAudit(
    {
      manifestBytes,
      lockBytes,
      tarballSha256,
      graphSha256: digest(resolution.graph),
      platform: { ...resolution.platform, npm: resolution.npm },
      role:
        resolution.dependencyName === null
          ? "producer"
          : JSON.parse(evidence.manifest).dependencies[
                resolution.dependencyName
              ] === "file:candidate.tgz"
            ? "candidate"
            : "recipient",
      scope: "production",
    },
    { npmCli, npm: resolution.npm },
  );
  assert.equal(
    audit.eligible,
    true,
    "Release advisory policy requires disposition",
  );
  const decision = {
    schemaVersion: 1,
    role,
    subject: audit.subject,
    observedAt: audit.observedAt,
    result: "PASS",
    resolutionSha256,
    materialSha256,
  };
  const bytes = Buffer.from(canonicalJson(decision) + "\n"),
    decisionSha256 = sha256Buffer(bytes);
  await mkdir(join(root, "decisions"), { recursive: true });
  const path = join(root, "decisions", decisionSha256 + ".json");
  try {
    await writeFile(path, bytes, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    assert.ok(
      (await readFile(path)).equals(bytes),
      "Conflicting retained eligibility decision",
    );
  }
  return {
    schemaVersion: 1,
    result: "PASS",
    role,
    resolutionSha256,
    tarballSha256,
    decisionSha256,
  };
}
