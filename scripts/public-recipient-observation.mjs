/** The public install proof contains the ordinary native resolution and its exact inputs. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalJson, stableJson } from "./canonical-json.mjs";
import { buildReleaseAuditSubject } from "./release-audit-evaluator.mjs";
import { verifyResolutionEvidence } from "./release-consumer-evidence.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import {
  PACKAGE_NAME,
  assertPackageIdentity,
  PUBLIC_SUBPATHS,
  assertRegistryTarballUrl,
} from "./package-identity.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";

export const PUBLIC_CONSUMERS = Object.freeze({
  alias: "owlapi",
  scoped: PACKAGE_NAME,
});
export const PUBLIC_OBSERVATION = "observation.json";
export const PUBLIC_MATERIAL = "material.json";
export const PUBLIC_TEST = "lane.json";
export const publicResolutionDigest = (value) =>
  sha256Buffer(Buffer.from(stableJson(value)));
const digestPattern = /^[a-f0-9]{64}$/u;
const same = (left, right) => canonicalJson(left) === canonicalJson(right);
const modeNames = Object.keys(PUBLIC_CONSUMERS).sort();

export function publicPlatform(lane) {
  return {
    os: lane.os,
    cpu: lane.arch,
    node: lane.node,
    ...(lane.os === "linux" ? { libc: "glibc" } : {}),
  };
}

/** Describe an ordinary live identity, or one using the admitted archive subpaths. */
export function publicIdentity(
  mode,
  input,
  registryTarball,
  subpaths = PUBLIC_SUBPATHS,
) {
  const dependencyName = PUBLIC_CONSUMERS[mode];
  assert.ok(dependencyName);
  assertPackageIdentity(input.package, input.package.version);
  return {
    mode: "PUBLIC_REGISTRY",
    package: input.package,
    dependencyName,
    specifier:
      mode === "alias"
        ? `npm:${PACKAGE_NAME}@${input.package.version}`
        : input.package.version,
    resolved: assertRegistryTarballUrl(registryTarball),
    integrity: input.integrity,
    importSpecifiers: subpaths.map((suffix) => dependencyName + suffix),
  };
}

/** Keep equal original bytes once; the index binds each alias independently. */
export function packPublicObservation({ lane, input, origin, consumers }) {
  const originals = {},
    index = {};
  assert.deepEqual(Object.keys(consumers).sort(), modeNames);
  const keep = (value) => {
    const key = sha256Buffer(Buffer.from(value));
    originals[key] = value;
    return key;
  };
  for (const [mode, { identity, evidence }] of Object.entries(consumers)) {
    index[mode] = {
      identity,
      manifest: keep(evidence.manifest),
      lock: keep(evidence.lock),
      resolution: keep(stableJson(evidence.resolution)),
    };
  }
  return { schemaVersion: 2, lane, input, origin, index, originals };
}

/** Replay separate native graphs. A historical caller supplies the sorted subpaths from its admitted tarball. */
export async function readPublicObservation(
  packet,
  {
    lane,
    input,
    origin,
    tarball,
    npmCli,
    registryTarball,
    consumerNpm = CI_RUNTIME.consumerNpm,
    archivedExportSubpaths,
  },
) {
  assert.deepEqual(Object.keys(packet).sort(), [
    "index",
    "input",
    "lane",
    "origin",
    "originals",
    "schemaVersion",
  ]);
  assert.equal(packet.schemaVersion, 2);
  assert.deepEqual(packet.lane, lane);
  assert.deepEqual(packet.input, input);
  assert.deepEqual(packet.origin, origin);
  assert.deepEqual(Object.keys(packet.index).sort(), modeNames);
  assert.equal(sha256Buffer(tarball), input.tarballSha256);
  assert.equal(
    "sha512-" + createHash("sha512").update(tarball).digest("base64"),
    input.integrity,
  );
  const used = new Set(),
    consumers = {};
  const open = (digest) => {
    assert.match(digest, digestPattern);
    const value = packet.originals[digest];
    assert.equal(typeof value, "string");
    assert.equal(
      sha256Buffer(Buffer.from(value)),
      digest,
      "Public native input bytes changed",
    );
    used.add(digest);
    return value;
  };
  for (const [mode, item] of Object.entries(packet.index)) {
    assert.deepEqual(Object.keys(item).sort(), [
      "identity",
      "lock",
      "manifest",
      "resolution",
    ]);
    let identity = item.identity;
    if (archivedExportSubpaths) {
      // The manifest defines the exported set. The producer's presentation order
      // is independent of the order of JSON members in the tarball.
      assert.ok(Array.isArray(identity?.importSpecifiers));
      identity = {
        ...identity,
        importSpecifiers: identity.importSpecifiers.toSorted(),
      };
    }
    assert.deepEqual(
      identity,
      publicIdentity(mode, input, registryTarball, archivedExportSubpaths),
      archivedExportSubpaths
        ? "Archived public identity differs from the published package"
        : undefined,
    );
    const resolutionBytes = open(item.resolution);
    const evidence = {
      schemaVersion: 1,
      manifest: open(item.manifest),
      lock: open(item.lock),
      resolution: JSON.parse(resolutionBytes),
    };
    assert.equal(stableJson(evidence.resolution), resolutionBytes);
    const resolution = await verifyResolutionEvidence(evidence, {
      tarball,
      npmCli,
      registryTarball,
      dependencyName: PUBLIC_CONSUMERS[mode],
      platform: publicPlatform(lane),
      observedNpm: consumerNpm,
    });
    const original = {
      manifestBytes: Buffer.from(evidence.manifest),
      lockBytes: Buffer.from(evidence.lock),
      tarballSha256: input.tarballSha256,
      graphSha256: publicResolutionDigest(resolution.graph),
      role: "recipient",
      scope: "production",
      platform: { ...publicPlatform(lane), npm: consumerNpm },
    };
    consumers[mode] = {
      evidence,
      original,
      subject: buildReleaseAuditSubject(original),
      resolutionSha256: item.resolution,
    };
  }
  assert.deepEqual(
    [...used].sort(),
    Object.keys(packet.originals).sort(),
    "Unrequested public native original",
  );
  return consumers;
}

export function assertPublicMaterialDecision(
  decision,
  material,
  observation,
  mode,
) {
  assert.deepEqual(Object.keys(decision).sort(), [
    "materialSha256",
    "observedAt",
    "resolutionSha256",
    "result",
    ...(decision.rights ? ["rights"] : []),
    "role",
    "schemaVersion",
    "subject",
  ]);
  assert.equal(decision.schemaVersion, decision.rights ? 2 : 1);
  assert.equal(decision.role, `public-${mode}`);
  assert.equal(decision.result, "PASS");
  assert.equal(decision.resolutionSha256, observation.resolutionSha256);
  assert.ok(same(decision.subject, observation.subject));
  assert.ok(Number.isFinite(Date.parse(decision.observedAt)));
  assert.equal(sha256Buffer(Buffer.from(material)), decision.materialSha256);
  const record = JSON.parse(material);
  assert.equal(
    record.status,
    decision.rights ? "REQUIRES_HUMAN_REVIEW" : "PASSED",
  );
  assert.deepEqual(record.subject, {
    resolutionSha256: observation.resolutionSha256,
    lockSha256: observation.subject.lockSha256,
    tarballSha256: observation.subject.tarballSha256,
  });
  return record;
}
