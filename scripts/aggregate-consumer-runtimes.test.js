import { describe, expect, test } from "@jest/globals";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readRuntimeReportOriginals,
  validateRuntimeReports,
} from "./aggregate-consumer-runtimes.mjs";
import { runtimeDigest } from "./consumer-runtime-matrix.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import { INSTALLED_TEST_SCRIPTS } from "./installed-consumer-fixtures.mjs";
import { consumerRuntimeFixture } from "./consumer-runtime-fixture.mjs";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./package-identity.mjs";
import { stableJson } from "./canonical-json.mjs";
import { isStrictDescendantPath, sha256Buffer } from "./release-file-utils.mjs";

const sha = (text) => sha256Buffer(Buffer.from(text));

const fixture = () => {
  const { matrix } = consumerRuntimeFixture({ newerPatches: false });
  const identity = {
    candidateArtifact: { id: 123, digest: `sha256:${"a".repeat(64)}` },
    commit: "b".repeat(40),
    runId: 456,
    runAttempt: 1,
  };
  const reports = matrix.include.map((lane) => ({
    schemaVersion: 1,
    result: "PASS",
    ...structuredClone(identity),
    lane: { ...lane },
    matrixSha256: runtimeDigest(matrix),
    npm: CI_RUNTIME.consumerNpm,
    productSuite: lane.os === "linux" ? "PASS" : "PRODUCER_LINUX_COVERAGE",
    portability: {
      result: "PASS",
      tarball: { sha256: "c".repeat(64), bytes: 100, fileName: "fixture.tgz" },
      runtime: {
        node: `v${lane.node}`,
        npm: CI_RUNTIME.consumerNpm,
        platform: lane.os,
        architecture: lane.arch,
      },
      consumers: Object.fromEntries(
        ["alias", "scoped"].map((mode) => [
          mode,
          { installedTests: [...INSTALLED_TEST_SCRIPTS] },
        ]),
      ),
    },
  }));
  return { matrix, identity, reports };
};

// This independent protocol fixture exercises archive custody rather than npm's
// resolver. Native graph capture and replay use real installs in the CI attribution test.
function retainRuntimeFixture(root, reports) {
  for (const report of reports) {
    const { lane, runAttempt } = report;
    const directory = join(
      root,
      `consumer-runtime-${lane.runner}-${lane.node}-attempt-${runAttempt}`,
    );
    const evidenceRoot = join(directory, "eligibility");
    mkdirSync(join(evidenceRoot, "decisions"), { recursive: true });
    report.schemaVersion = report.portability.schemaVersion = 2;
    report.origin = { workflow: "CI", job: "consumer_runtime" };
    for (const [mode, consumer] of Object.entries(
      report.portability.consumers,
    )) {
      const role = `portability-${mode}`;
      const dependencyName = mode === "alias" ? "owlapi" : PACKAGE_NAME;
      const dependencies = { [dependencyName]: "file:candidate.tgz" };
      const manifest = stableJson({
        name: "fixture",
        version: "0.0.0",
        dependencies,
      });
      const lock = stableJson({
        lockfileVersion: 3,
        packages: { "": { dependencies } },
      });
      const tarballSha256 = report.portability.tarball.sha256;
      const platform = { os: lane.os, cpu: lane.arch, node: lane.node };
      const graph = {
        nodes: [
          { location: ".", name: PACKAGE_NAME, version: PACKAGE_VERSION },
        ],
        edges: [],
      };
      const resolution = {
        schemaVersion: 1,
        dependencyName,
        tarballSha256,
        npm: CI_RUNTIME.consumerNpm,
        platform,
        manifestSha256: sha(manifest),
        lockSha256: sha(lock),
        graph,
        manifests: { ".": "d".repeat(64) },
      };
      const resolutionSha256 = sha(stableJson(resolution));
      const material = stableJson({
        status: "PASSED",
        subject: { resolutionSha256, lockSha256: sha(lock), tarballSha256 },
      });
      const materialDirectory = join(
        evidenceRoot,
        "material",
        resolutionSha256,
      );
      mkdirSync(materialDirectory, { recursive: true });
      writeFileSync(
        join(materialDirectory, "recipient-material.json"),
        material,
      );
      const decision = stableJson({
        schemaVersion: 1,
        role,
        result: "PASS",
        resolutionSha256,
        materialSha256: sha(material),
        observedAt: "2026-11-26T12:00:00.000Z",
        subject: {
          role: "candidate",
          scope: "production",
          platform: { ...platform, npm: CI_RUNTIME.consumerNpm },
          manifestSha256: sha(manifest),
          lockSha256: sha(lock),
          graphSha256: sha(stableJson(graph)),
          tarballSha256,
        },
      });
      writeFileSync(
        join(evidenceRoot, "decisions", `${sha(decision)}.json`),
        decision,
      );
      consumer.attribution = {
        schemaVersion: 1,
        evidence: { schemaVersion: 1, manifest, lock, resolution },
        decision: {
          schemaVersion: 1,
          result: "PASS",
          role,
          resolutionSha256,
          tarballSha256,
          decisionSha256: sha(decision),
        },
      };
    }
    writeFileSync(join(directory, "lane.json"), `${JSON.stringify(report)}\n`);
  }
}

describe("complete retained-package runtime proof", () => {
  test("accepts complete reports tied to one candidate and every actual runtime/platform", () => {
    const { matrix, reports, identity } = fixture();
    expect(validateRuntimeReports(matrix, reports, identity)).toMatchObject({
      result: "PASS",
      matrixSha256: runtimeDigest(matrix),
    });
  });
  test("rejects a legacy lane report when native recipient attribution is required", () => {
    const { matrix, reports, identity } = fixture();
    expect(() =>
      validateRuntimeReports(matrix, reports, identity, {
        schemaVersion: 2,
      }),
    ).toThrow(/required runtime report schema/iu);
  });
  test.each([
    "member substituted",
    "original expired",
    "member oversized",
    "job substituted",
  ])("keeps compact pointers and rejects %s", (fault) => {
    const { matrix, reports, identity } = fixture();
    const root = mkdtempSync(join(tmpdir(), "owlapi-runtime-pointers-"));
    expect(isStrictDescendantPath(tmpdir(), root)).toBe(true);
    try {
      retainRuntimeFixture(root, reports);
      const summary = readRuntimeReportOriginals(matrix, root, identity, {
        workflow: "CI",
      });
      expect(summary.originalReports).toHaveLength(matrix.include.length);
      expect(JSON.stringify(summary)).not.toContain("file:candidate.tgz");
      const named = summary.originalReports[0];
      const path = join(root, named.artifactName, "lane.json");
      const original = reports.find(
        ({ lane }) =>
          named.artifactName ===
          `consumer-runtime-${lane.runner}-${lane.node}-attempt-${identity.runAttempt}`,
      );
      expect(named.sha256).toBe(sha(`${JSON.stringify(original)}\n`));
      if (fault === "member substituted")
        writeFileSync(path, `${JSON.stringify(original)} \n`);
      if (fault === "original expired") rmSync(path);
      if (fault === "member oversized")
        truncateSync(path, 16 * 1024 * 1024 + 1);
      if (fault === "job substituted")
        writeFileSync(
          path,
          JSON.stringify({
            ...original,
            origin: { workflow: "CI", job: "substitute" },
          }),
        );
      expect(() =>
        readRuntimeReportOriginals(matrix, root, identity, {
          workflow: "CI",
          expectedReports: summary.originalReports,
        }),
      ).toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  test.each([
    "missing",
    "duplicate",
    "candidate",
    "candidate-digest",
    "candidate-shape",
    "matrix",
    "attempt",
    "platform",
    "native-runtime",
    "tarball",
    "tarball-bytes",
    "product",
    "installed-tests",
    "installed-test-order",
  ])("rejects %s coverage", (mutation) => {
    const { matrix, reports, identity } = fixture();
    if (mutation === "missing") reports.pop();
    if (mutation === "duplicate") reports[1] = reports[0];
    if (mutation === "candidate") reports[0].candidateArtifact.id++;
    if (mutation === "candidate-digest")
      reports[0].candidateArtifact.digest = `sha256:${"d".repeat(64)}`;
    if (mutation === "candidate-shape")
      reports[0].candidateArtifact.extra = true;
    if (mutation === "matrix") reports[0].matrixSha256 = "d".repeat(64);
    if (mutation === "attempt") reports[0].runAttempt++;
    if (mutation === "platform")
      reports[0].portability.runtime.architecture = "other";
    if (mutation === "native-runtime")
      reports[0].portability.runtime.node = "v0.0.0";
    if (mutation === "tarball")
      reports[0].portability.tarball.sha256 = "d".repeat(64);
    if (mutation === "tarball-bytes") reports[0].portability.tarball.bytes++;
    if (mutation === "product") reports[0].productSuite = "SKIPPED";
    if (mutation === "installed-tests")
      reports[0].portability.consumers.alias.installedTests.pop();
    if (mutation === "installed-test-order")
      reports[0].portability.consumers.alias.installedTests.reverse();
    expect(() => validateRuntimeReports(matrix, reports, identity)).toThrow();
  });
});
