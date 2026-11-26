/** Content-address the actual graph inputs once per producer; only named readers
 * retain these bytes. Public packets never contain npm advisory report bodies. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, jsonEquals, stableJson } from "./canonical-json.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { compareConsumerResolutions } from "./release-consumer-resolution.mjs";
import { verifyResolutionEvidence } from "./release-consumer-evidence.mjs";
import { assertNpmSbomInventory } from "./npm-production-graph.mjs";
import { PACKAGE_NAME } from "./release-identity.mjs";
import { productionInstallScriptPolicy } from "./installed-consumer-fixtures.mjs";
import { prepareRecipientMaterial } from "../util/third-party-evidence/recipient-material.mjs";

export const CANDIDATE_RESOLUTION_MODES = Object.freeze({
  producer: null,
  inspection: "owlapi",
  normal: "owlapi",
  scoped: PACKAGE_NAME,
});
export const producerResolutionFilename = "consumer-resolutions.json";
export const producerResolutionUploadStep =
  "Retain exact producer and consumer resolution proof";
const hex = /^[a-f0-9]{64}$/u;
const hashText = (s) => sha256Buffer(Buffer.from(s));
const resolutionHash = (r) => hashText(stableJson(r));
const equal = (actual, expected, message) =>
  assert.ok(jsonEquals(actual, expected), message);

/** Serialize only the closed, release-safe evidence selected by this producer. */
export function packProducerResolutions(observations, decisionDirectory) {
  const subjects = {},
    originals = {};
  equal(
    Object.keys(observations).sort(),
    Object.keys(CANDIDATE_RESOLUTION_MODES).sort(),
    "Incomplete producer observation roster",
  );
  function keep(value) {
    const key = hashText(value);
    originals[key] = value;
    return key;
  }
  for (const [mode, dependencyName] of Object.entries(
    CANDIDATE_RESOLUTION_MODES,
  )) {
    const item = observations[mode];
    assert.equal(item.evidence.resolution.dependencyName, dependencyName);
    const { evidence, eligibility } = item;
    const r = evidence.resolution;
    assert.equal(eligibility.resolutionSha256, resolutionHash(r));
    assert.match(eligibility.decisionSha256, hex);
    const decision = readFileSync(
      join(
        decisionDirectory,
        "decisions",
        eligibility.decisionSha256 + ".json",
      ),
      "utf8",
    );
    assert.equal(keep(decision), eligibility.decisionSha256);
    const { materialSha256 } = JSON.parse(decision);
    const material = readFileSync(
      join(
        decisionDirectory,
        "material",
        eligibility.resolutionSha256,
        "recipient-material.json",
      ),
      "utf8",
    );
    assert.equal(keep(material), materialSha256);
    subjects[mode] = {
      manifest: keep(evidence.manifest),
      lock: keep(evidence.lock),
      resolution: keep(stableJson(r)),
      eligibility,
    };
  }
  return { schemaVersion: 1, subjects, originals };
}

/** Bind native originals and the pre-execution policy verdict to the same measured graph.
 * Admission authenticates the entire enclosing ZIP and the original successful producer.
 * The current advisory decision is always obtained independently at the release boundary. */
export async function readProducerResolutions(
  packet,
  {
    tarball,
    sbom,
    npmCli,
    platform,
    npm,
    materialOptions,
    prepareMaterial = prepareRecipientMaterial,
  },
) {
  equal(Object.keys(packet).sort(), ["originals", "schemaVersion", "subjects"]);
  assert.equal(packet.schemaVersion, 1);
  equal(
    Object.keys(packet.subjects).sort(),
    Object.keys(CANDIDATE_RESOLUTION_MODES).sort(),
  );
  const seen = new Set(),
    subjects = {},
    bytes = [];
  let materialReader;
  function open(key) {
    assert.match(key, hex);
    const value = packet.originals[key];
    assert.equal(typeof value, "string");
    assert.equal(hashText(value), key, "Original graph proof changed");
    seen.add(key);
    return value;
  }
  for (const [mode, dependencyName] of Object.entries(
    CANDIDATE_RESOLUTION_MODES,
  )) {
    const record = packet.subjects[mode];
    equal(Object.keys(record).sort(), [
      "eligibility",
      "lock",
      "manifest",
      "resolution",
    ]);
    const evidence = {
      schemaVersion: 1,
      manifest: open(record.manifest),
      lock: open(record.lock),
      resolution: JSON.parse(open(record.resolution)),
    };
    const observed = await verifyResolutionEvidence(evidence, {
      tarball,
      npmCli,
      dependencyName,
      observedNpm: npm,
      platform,
    });
    if (dependencyName !== null) {
      const declared = JSON.parse(evidence.manifest).allowScripts;
      if (mode === "normal") {
        equal(
          declared,
          productionInstallScriptPolicy(),
          "Normal consumer install script policy differs",
        );
        assert.ok(
          !Object.values(declared).some(Boolean),
          "Normal consumer requires approved pre-execution lifecycle archive evidence",
        );
      } else
        assert.equal(
          declared,
          undefined,
          "Unexpected consumer install script policy",
        );
    }
    const role = "candidate-" + mode;
    const eligibility = record.eligibility;
    equal(
      eligibility,
      {
        schemaVersion: 1,
        result: "PASS",
        role,
        resolutionSha256: resolutionHash(observed),
        tarballSha256: sha256Buffer(tarball),
        decisionSha256: eligibility.decisionSha256,
      },
      "CI eligibility covers a different producer observation",
    );
    const decision = JSON.parse(open(eligibility.decisionSha256));
    equal(Object.keys(decision).sort(), [
      "materialSha256",
      "observedAt",
      "resolutionSha256",
      "result",
      "role",
      "schemaVersion",
      "subject",
    ]);
    assert.ok(
      decision.schemaVersion === 1 &&
        Number.isFinite(Date.parse(decision.observedAt)),
    );
    assert.equal(decision.resolutionSha256, eligibility.resolutionSha256);
    assert.equal(decision.role, role);
    assert.equal(decision.result, "PASS");
    equal(
      decision.subject,
      {
        tarballSha256: observed.tarballSha256,
        lockSha256: record.lock,
        manifestSha256: record.manifest,
        graphSha256: hashText(stableJson(observed.graph)),
        role: dependencyName ? "candidate" : "producer",
        scope: "production",
        platform: { ...platform, npm },
      },
      "Retained eligibility decision subject differs",
    );
    const recordBytes = Buffer.from(open(decision.materialSha256));
    materialReader ??= await prepareMaterial({ ...materialOptions, npmCli });
    const materialVerification = await materialReader.verifyRetained({
      recordBytes,
      recordSha256: decision.materialSha256,
      resolution: observed,
      lockfileBytes: Buffer.from(evidence.lock),
      requireDirectNovel: materialOptions?.requireDirectNovel,
    });
    const material = materialVerification.record;
    assert.equal(material.status, "PASSED");
    assert.equal(material.decisions.length, observed.graph.nodes.length - 1);
    equal(
      material.decisions.map((d) => d.location).sort(),
      observed.graph.nodes
        .filter((n) => n.location !== ".")
        .map((n) => n.location)
        .sort(),
    );
    for (const d of material.decisions)
      equal(d.reasons, [], "Unresolved material disposition");
    subjects[mode] = {
      evidence,
      eligibility,
      decision,
      material,
      materialVerification: {
        verification: materialVerification.verification,
        novelArtifactIds: materialVerification.novelArtifactIds,
      },
    };
    bytes.push(observed);
  }
  equal(
    [...seen].sort(),
    Object.keys(packet.originals).sort(),
    "Unexpected original in resolution proof",
  );
  const baseline = subjects.producer.evidence.resolution;
  const ids = [
    ...new Set(baseline.graph.nodes.map((n) => n.name + "@" + n.version)),
  ].sort();
  assertNpmSbomInventory(sbom, ids, { graph: baseline.graph, tarball });
  const differences = {};
  for (const [mode, item] of Object.entries(subjects))
    if (mode !== "producer")
      differences[mode] = compareConsumerResolutions(
        baseline,
        item.evidence.resolution,
      );
  // Catch a conflicting new immutable coordinate even when absent from the baseline.
  assertConsistentArchives(bytes);
  return { subjects, differences };
}

/** Enforce immutable registry bytes across independently observed graphs, including later public lanes. */
export function assertConsistentArchives(resolutions) {
  const coordinates = new Map();
  for (const observation of resolutions) {
    for (const entry of observation.graph.nodes) {
      if (entry.bundledIn || entry.location === ".") continue;
      const coordinate = entry.name + "@" + entry.version,
        id = canonicalJson([entry.resolved, entry.integrity]);
      assert.ok(
        !coordinates.has(coordinate) || coordinates.get(coordinate) === id,
        "Inconsistent observed archive for " + coordinate,
      );
      coordinates.set(coordinate, id);
    }
  }
}
