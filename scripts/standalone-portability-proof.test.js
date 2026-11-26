import { readStandalonePortabilityProof } from "./standalone-portability-proof.mjs";
import { stableJson } from "./canonical-json.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";
import { PACKAGE_NAME } from "./package-identity.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import { INSTALLED_TEST_SCRIPTS } from "./installed-consumer-fixtures.mjs";
import { readCiConsumerDecisionMembers } from "./ci-recipient-attribution.mjs";

function fixture() {
  const identity = {
    workflow: "Release",
    job: "portability_windows_node_22",
    commit: "a".repeat(40),
    runId: 1,
    runAttempt: 1,
  };
  const candidateArtifact = { id: 2, digest: `sha256:${"b".repeat(64)}` };
  const tarballSha256 = "c".repeat(64);
  const runtime = {
    node: `v${CI_RUNTIME.node[22]}`,
    npm: CI_RUNTIME.consumerNpm,
    platform: "win32",
    architecture: "x64",
    osRelease: "runner",
  };
  const originals = {};
  const keep = (input) => {
    const bytes = stableJson(input),
      key = sha256Buffer(Buffer.from(bytes));
    originals[key] = bytes;
    return key;
  };
  const subjects = {};
  for (const [mode, dependencyName] of [
    ["alias", "owlapi"],
    ["scoped", PACKAGE_NAME],
  ]) {
    const role = `portability-${mode}`;
    const manifest = keep({
      dependencies: { [dependencyName]: "file:candidate.tgz" },
    });
    const lock = keep({
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { [dependencyName]: "file:candidate.tgz" } },
      },
    });
    const resolution = keep({
      schemaVersion: 1,
      dependencyName,
      tarballSha256,
      manifestSha256: manifest,
      lockSha256: lock,
      npm: CI_RUNTIME.consumerNpm,
      platform: { os: "win32", cpu: "x64", node: CI_RUNTIME.node[22] },
      graph: { nodes: [], edges: [] },
      manifests: {},
    });
    const materialSha256 = keep({
      status: "PASSED",
      subject: {
        resolutionSha256: resolution,
        tarballSha256,
        lockSha256: lock,
      },
    });
    const decisionSha256 = keep({
      schemaVersion: 1,
      result: "PASS",
      role,
      resolutionSha256: resolution,
      materialSha256,
      observedAt: "2026-11-26T10:00:00.000Z",
      subject: {
        manifestSha256: manifest,
        lockSha256: lock,
        tarballSha256,
        graphSha256: sha256Buffer(
          Buffer.from(stableJson({ nodes: [], edges: [] })),
        ),
        role: "candidate",
        scope: "production",
        platform: {
          os: "win32",
          cpu: "x64",
          node: CI_RUNTIME.node[22],
          npm: CI_RUNTIME.consumerNpm,
        },
      },
    });
    subjects[mode] = {
      installedTests: INSTALLED_TEST_SCRIPTS,
      afterExecutionSha256: resolution,
      manifest,
      lock,
      resolution,
      decision: {
        schemaVersion: 1,
        result: "PASS",
        role,
        tarballSha256,
        decisionSha256,
        resolutionSha256: resolution,
      },
    };
  }
  const scope = { identity, candidateArtifact, tarballSha256 };
  return {
    scope,
    packet: {
      schemaVersion: 1,
      result: "PASS",
      ...scope,
      runtime,
      subjects,
      originals,
    },
  };
}

test("keeps alias and scoped inputs and the original native runtime independently scoped", () => {
  const { scope, packet } = fixture();
  const { installed, decisions } = readStandalonePortabilityProof(
    packet,
    scope,
  );
  expect(
    installed.map(([role, a]) => [role, a.evidence.resolution.dependencyName]),
  ).toEqual([
    ["portability-alias", "owlapi"],
    ["portability-scoped", PACKAGE_NAME],
  ]);
  expect(installed[0][1].evidence.lock).not.toBe(installed[1][1].evidence.lock);
  for (const [role, attribution] of installed)
    expect(
      readCiConsumerDecisionMembers(decisions, attribution).decision.role,
    ).toBe(role);
});

test.each(["post-test graph", "job", "original lock"])(
  "refuses substituted %s",
  (fault) => {
    const { scope, packet } = fixture();
    if (fault === "post-test graph")
      packet.subjects.alias.afterExecutionSha256 =
        packet.subjects.scoped.resolution;
    if (fault === "job")
      packet.identity = {
        ...packet.identity,
        job: "portability_windows_node_24",
      };
    if (fault === "original lock")
      packet.originals[packet.subjects.alias.lock] =
        packet.originals[packet.subjects.scoped.lock];
    expect(() => readStandalonePortabilityProof(packet, scope)).toThrow();
  },
);
