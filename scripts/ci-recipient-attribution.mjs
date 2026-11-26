import assert from "node:assert/strict";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { jsonEquals, stableJson } from "./canonical-json.mjs";
import { PACKAGE_NAME } from "./package-identity.mjs";
import {
  captureResolutionEvidence,
  verifyResolutionEvidence,
} from "./release-consumer-evidence.mjs";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";
import { recipientMaterialMember } from "./recipient-material-case.mjs";

const roles = Object.freeze({
  "portability-alias": "owlapi",
  "portability-scoped": PACKAGE_NAME,
  "browser-bundler": "owlapi",
  "browser-worker": "owlapi",
  "browser-import-map-input": "owlapi",
  "owl-contract": "owlapi",
});
const digestPattern = /^[a-f0-9]{64}$/u;

function readEvidenceMember(root, path, digest, maximum) {
  assert.match(digest, digestPattern);
  const file = lstatSync(path);
  assert.ok(
    file.isFile() && file.size <= maximum,
    "Missing or oversized retained consumer evidence file",
  );
  assert.ok(
    isStrictDescendantPath(root, realpathSync(path)),
    "Consumer decision escapes its artifact directory",
  );
  return readFileSync(path);
}

/** Require the literal cleared decision and its material index from the owning job. */
export function readCiConsumerDecision(decisionDirectory, attribution) {
  const root = realpathSync(decisionDirectory);
  return reopenCiConsumerDecision(attribution, (path, digest, maximum) =>
    readEvidenceMember(root, join(root, path), digest, maximum),
  ).decision;
}

/** Reopen the same fixed, digest-indexed proof from an authenticated ZIP map. */
export function readCiConsumerDecisionMembers(members, attribution) {
  const paths = [];
  const proof = reopenCiConsumerDecision(attribution, (path) => {
    const member = `eligibility/${path}`;
    paths.push(member);
    return members.get(member);
  });
  return { ...proof, paths };
}

function reopenCiConsumerDecision(attribution, read) {
  const {
    decision,
    evidence: { resolution },
  } = attribution;
  const original = (path, digest, maximum) => {
    assert.match(digest, digestPattern);
    const bytes = read(path, digest, maximum);
    assert.ok(
      Buffer.isBuffer(bytes) && bytes.length <= maximum,
      "Missing or oversized retained consumer evidence file",
    );
    assert.equal(
      sha256Buffer(bytes),
      digest,
      "Cleared consumer decision bytes differ",
    );
    return bytes;
  };
  const retained = JSON.parse(
    original(
      `decisions/${decision.decisionSha256}.json`,
      decision.decisionSha256,
      256 * 1024,
    ),
  );
  const expectedSubject = {
    manifestSha256: resolution.manifestSha256,
    lockSha256: resolution.lockSha256,
    tarballSha256: resolution.tarballSha256,
    graphSha256: sha256Buffer(Buffer.from(stableJson(resolution.graph))),
    platform: { ...resolution.platform, npm: resolution.npm },
    role: "candidate",
    scope: "production",
  };
  assert.ok(
    !(retained.rights && retained.archiveMeasurements),
    "Conflicting material authorizations",
  );
  assert.ok(
    jsonEquals(retained, {
      schemaVersion: retained.rights ? 2 : retained.archiveMeasurements ? 3 : 1,
      role: decision.role,
      result: "PASS",
      subject: expectedSubject,
      resolutionSha256: decision.resolutionSha256,
      materialSha256: retained.materialSha256,
      ...(retained.rights ? { rights: retained.rights } : {}),
      ...(retained.archiveMeasurements
        ? { archiveMeasurements: retained.archiveMeasurements }
        : {}),
      observedAt: retained.observedAt,
    }) &&
      typeof retained.observedAt === "string" &&
      Number.isFinite(Date.parse(retained.observedAt)),
    "Retained consumer decision covers a different subject",
  );
  assert.match(decision.resolutionSha256, digestPattern);
  const materialBytes = original(
    recipientMaterialMember(decision.resolutionSha256, retained),
    retained.materialSha256,
    16 * 1024 * 1024,
  );
  const material = JSON.parse(materialBytes);
  assert.equal(
    material.status,
    retained.rights ? "REQUIRES_HUMAN_REVIEW" : "PASSED",
  );
  assert.ok(
    jsonEquals(material.subject, {
      resolutionSha256: decision.resolutionSha256,
      tarballSha256: resolution.tarballSha256,
      lockSha256: resolution.lockSha256,
    }),
    "Retained material belongs to a different recipient observation",
  );
  return { decision: retained, materialBytes };
}

/** Validate the job-scoped decision and the exact original bytes it covers. */
export function assertCiConsumerAttribution(
  attribution,
  { role, tarballSha256, npm, platform, decisionDirectory } = {},
) {
  assert.ok(Object.hasOwn(roles, role), "Unexpected CI consumer role");
  assert.ok(
    jsonEquals(Object.keys(attribution).sort(), [
      "decision",
      "evidence",
      "schemaVersion",
    ]),
  );
  const { evidence, decision } = attribution;
  assert.equal(attribution.schemaVersion, 1);
  assert.ok(
    jsonEquals(Object.keys(evidence).sort(), [
      "lock",
      "manifest",
      "resolution",
      "schemaVersion",
    ]),
  );
  assert.equal(evidence.schemaVersion, 1);
  const { resolution } = evidence;
  assert.equal(resolution.schemaVersion, 1);
  assert.equal(
    resolution.dependencyName,
    roles[role],
    "Retained consumer has the wrong dependency specifier",
  );
  assert.match(tarballSha256, digestPattern);
  assert.equal(
    resolution.tarballSha256,
    tarballSha256,
    "Recipient was installed from a different candidate",
  );
  if (npm !== undefined) assert.equal(resolution.npm, npm);
  if (platform !== undefined) {
    for (const [key, value] of Object.entries(platform))
      assert.equal(resolution.platform[key], value);
  }
  // Raw native bytes are preserved as UTF-8 text. Their digest differs from
  // the semantic digest of the typed graph and must survive JSON transport.
  for (const member of ["manifest", "lock"]) {
    assert.equal(typeof evidence[member], "string");
    assert.equal(
      sha256Buffer(Buffer.from(evidence[member])),
      resolution[`${member}Sha256`],
      `Recipient ${member} differs from its discovered bytes`,
    );
  }
  assert.match(
    decision?.decisionSha256 ?? "",
    digestPattern,
    "Missing cleared consumer decision digest",
  );
  assert.ok(
    jsonEquals(decision, {
      schemaVersion: 1,
      result: "PASS",
      role,
      resolutionSha256: sha256Buffer(Buffer.from(stableJson(resolution))),
      tarballSha256,
      decisionSha256: decision.decisionSha256,
    }),
    "Cleared consumer decision covers a different installed graph or role",
  );
  if (decisionDirectory !== undefined)
    readCiConsumerDecision(decisionDirectory, attribution);
  return attribution;
}

/** A qualified release reader can independently replay the captured manifest and lock. */
export async function replayCiConsumerAttribution(
  attribution,
  { role, tarball, npmCli, observedNpm, platform, decisionDirectory },
) {
  assertCiConsumerAttribution(attribution, {
    role,
    tarballSha256: sha256Buffer(tarball),
    npm: observedNpm,
    platform,
    decisionDirectory,
  });
  return verifyResolutionEvidence(attribution.evidence, {
    tarball,
    npmCli,
    dependencyName: roles[role],
    platform,
    observedNpm,
  });
}

/** Discover the recipient graph before its on-disk package can execute. */
export async function qualifyCiConsumerInstall({
  directory,
  tarball,
  npmCli,
  dependencyName,
  role,
  verifyConsumerEvidence,
  candidate,
  origin,
  decisionDirectory,
  expectedEvidence,
  trustedArchiveMeasurements,
  archiveMeasurementAuthorization,
}) {
  assert.equal(
    typeof verifyConsumerEvidence,
    "function",
    "CI consumer verification is required before execution",
  );
  assert.equal(
    dependencyName,
    roles[role],
    "Unexpected CI consumer dependency role",
  );
  const evidence = await captureResolutionEvidence(directory, {
    tarball,
    npmCli,
    dependencyName,
  });
  if (expectedEvidence)
    assert.ok(
      jsonEquals(evidence, expectedEvidence),
      "The native replay produced a different original lock or graph",
    );
  const decision = await verifyConsumerEvidence({
    directory,
    evidence: structuredClone(evidence),
    role,
    tarball: Buffer.from(tarball),
    candidate,
    origin,
    npmCli,
    decisionDirectory,
    trustedArchiveMeasurements,
    archiveMeasurementAuthorization,
  });
  return assertCiConsumerAttribution(
    { schemaVersion: 1, evidence, decision },
    { role, tarballSha256: sha256Buffer(tarball), decisionDirectory },
  );
}
