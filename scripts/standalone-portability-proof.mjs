/** One deduplicated native proof for each separately required portability job. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jsonEquals, stableJson } from "./canonical-json.mjs";
import {
  assertCiConsumerAttribution,
  readCiConsumerDecision,
} from "./ci-recipient-attribution.mjs";
import { INSTALLED_TEST_SCRIPTS } from "./installed-consumer-fixtures.mjs";
import { PACKAGE_NAME } from "./package-identity.mjs";
import { recipientMaterialMember } from "./recipient-material-case.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { standalonePortabilityRuntimes } from "./consumer-runtime-matrix.mjs";
import {
  createMaterialRecordInterner,
  createMaterialRecordReconstructor,
} from "./material-record-interning.mjs";

export const STANDALONE_PORTABILITY_PROOF = "standalone-portability.json";
export const STANDALONE_PORTABILITY_UPLOAD =
  "Retain exact standalone portability proof";
const digest = /^[a-f0-9]{64}$/u;
const hashText = (text) => sha256Buffer(Buffer.from(text));
const assertFields = (value, keys) =>
  assert.ok(jsonEquals(Object.keys(value).sort(), [...keys].sort()));
const roles = [
  ["alias", "owlapi"],
  ["scoped", PACKAGE_NAME],
];

/** Commit successful tests to the exact before/after graph and material bytes. */
export function writeStandalonePortabilityProof(
  report,
  directory,
  environment = process.env,
) {
  const job = environment.GITHUB_JOB;
  if (
    environment.GITHUB_ACTIONS !== "true" ||
    !Object.hasOwn(standalonePortabilityRuntimes, job)
  )
    return;
  const identity = {
    workflow: environment.GITHUB_WORKFLOW,
    job,
    commit: environment.GITHUB_SHA,
    runId: Number(environment.GITHUB_RUN_ID),
    runAttempt: Number(environment.GITHUB_RUN_ATTEMPT),
  };
  assert.ok(["CI", "Release"].includes(identity.workflow));
  assert.match(identity.commit, /^[a-f0-9]{40}$/u);
  assert.ok(
    [identity.runId, identity.runAttempt].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    ),
  );
  const candidateId = Number(
    environment.OWLAPI_CANDIDATE_ID ?? environment.CANDIDATE_ARTIFACT_ID,
  );
  const candidateDigest =
    environment.OWLAPI_CANDIDATE_DIGEST ??
    `sha256:${environment.CANDIDATE_ARTIFACT_DIGEST}`;
  assert.ok(Number.isSafeInteger(candidateId) && candidateId > 0);
  assert.match(candidateDigest, /^sha256:[a-f0-9]{64}$/u);
  const candidateArtifact = { id: candidateId, digest: candidateDigest };
  const originals = {};
  const material = createMaterialRecordInterner();
  const preserve = (text) => {
    const key = hashText(text);
    originalText(originals, key, text);
    return key;
  };
  const subjects = {};
  const store = join(directory, "eligibility");
  for (const [mode] of roles) {
    const { attribution, afterExecutionSha256, installedTests } =
      report.consumers[mode];
    const { evidence, decision } = attribution;
    const retained = readCiConsumerDecision(store, attribution);
    const decisionText = readFileSync(
      join(store, "decisions", `${decision.decisionSha256}.json`),
      "utf8",
    );
    const materialText = readFileSync(
      join(store, recipientMaterialMember(decision.resolutionSha256, retained)),
      "utf8",
    );
    assert.equal(preserve(decisionText), decision.decisionSha256);
    material.add(retained.materialSha256, materialText);
    subjects[mode] = {
      installedTests,
      afterExecutionSha256,
      decision,
      manifest: preserve(evidence.manifest),
      lock: preserve(evidence.lock),
      resolution: preserve(stableJson(evidence.resolution)),
    };
  }
  const packet = {
    schemaVersion: 2,
    result: report.result,
    identity,
    candidateArtifact,
    tarballSha256: report.tarball.sha256,
    runtime: report.runtime,
    subjects,
    originals,
    material: material.tables,
  };
  readStandalonePortabilityProof(packet, {
    identity,
    candidateArtifact,
    tarballSha256: report.tarball.sha256,
  });
  writeFileSync(
    join(directory, STANDALONE_PORTABILITY_PROOF),
    stableJson(packet),
    { flag: "wx" },
  );
}

function originalText(originals, key, text) {
  if (Object.hasOwn(originals, key))
    assert.equal(originals[key], text, "Contradictory indexed originality");
  originals[key] = text;
}

/** Independently select one native job and reopen only its named originals. */
export function readStandalonePortabilityProof(
  packet,
  { identity, candidateArtifact, tarballSha256 },
) {
  assertFields(packet, [
    "schemaVersion",
    "result",
    "identity",
    "candidateArtifact",
    "tarballSha256",
    "runtime",
    "subjects",
    "originals",
    "material",
  ]);
  assert.equal(packet.schemaVersion, 2);
  assert.equal(packet.result, "PASS");
  assert.ok(
    jsonEquals(packet.identity, identity),
    "Standalone portability proof has another native job identity",
  );
  assert.ok(
    jsonEquals(packet.candidateArtifact, candidateArtifact),
    "Standalone portability used a different candidate artifact",
  );
  assert.equal(packet.tarballSha256, tarballSha256);
  const selected = standalonePortabilityRuntimes[identity.job];
  assert.ok(selected, "Unknown standalone portability job");
  const { platform, npm } = selected;
  const { runtime } = packet;
  assertFields(runtime, [
    "node",
    "npm",
    "platform",
    "architecture",
    "osRelease",
  ]);
  assert.ok(
    typeof runtime.osRelease === "string" && runtime.osRelease.length > 0,
  );
  assert.ok(
    jsonEquals(
      [runtime.node, runtime.npm, runtime.platform, runtime.architecture],
      [`v${platform.node}`, npm, platform.os, platform.cpu],
    ),
    "Standalone portability ran on another runtime",
  );
  assertFields(packet.subjects, ["alias", "scoped"]);
  assertFields(packet.material, ["materials", "artifacts", "dispositions"]);
  const material = createMaterialRecordReconstructor(packet.material, {
    expansionLimit: 4 * 1024 * 1024,
    label: "Standalone material",
  });
  const referenced = new Set();
  function original(key) {
    assert.match(key, digest);
    assert.ok(Object.hasOwn(packet.originals, key));
    const text = packet.originals[key];
    assert.equal(typeof text, "string");
    assert.equal(hashText(text), key, "Retained standalone original changed");
    if (!referenced.has(key)) material.accountOriginal(text);
    referenced.add(key);
    return text;
  }
  const decisions = new Map();
  const installed = [];
  for (const [mode, dependencyName] of roles) {
    const item = packet.subjects[mode];
    assertFields(item, [
      "installedTests",
      "afterExecutionSha256",
      "decision",
      "manifest",
      "lock",
      "resolution",
    ]);
    assert.ok(
      jsonEquals(item.installedTests, INSTALLED_TEST_SCRIPTS),
      "Standalone installed test inventory differs",
    );
    assert.equal(
      item.afterExecutionSha256,
      item.resolution,
      "Standalone tests exercised a different graph",
    );
    const resolution = JSON.parse(original(item.resolution));
    assert.equal(resolution.dependencyName, dependencyName);
    const evidence = {
      schemaVersion: 1,
      manifest: original(item.manifest),
      lock: original(item.lock),
      resolution,
    };
    const role = `portability-${mode}`;
    const attribution = assertCiConsumerAttribution(
      { schemaVersion: 1, evidence, decision: item.decision },
      { role, tarballSha256, platform, npm },
    );
    assert.equal(
      item.afterExecutionSha256,
      item.decision.resolutionSha256,
      "Post-test graph differs from cleared graph",
    );
    const decisionText = original(item.decision.decisionSha256);
    const retained = JSON.parse(decisionText);
    const materialText = material.open(retained.materialSha256);
    decisions.set(
      `eligibility/decisions/${item.decision.decisionSha256}.json`,
      Buffer.from(decisionText),
    );
    const materialPath = `eligibility/${recipientMaterialMember(item.decision.resolutionSha256, retained)}`;
    const bytes = Buffer.from(materialText);
    if (decisions.has(materialPath))
      assert.ok(
        decisions.get(materialPath).equals(bytes),
        "Conflicting material originals for one observation",
      );
    decisions.set(materialPath, bytes);
    installed.push([role, attribution]);
  }
  assert.ok(
    jsonEquals([...referenced].sort(), Object.keys(packet.originals).sort()),
    "Unexpected standalone original",
  );
  material.assertClosed();
  return { installed, decisions };
}
