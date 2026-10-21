import { describe, expect, test } from "@jest/globals";
import { validateRuntimeReports } from "./aggregate-consumer-runtimes.mjs";
import {
  qualificationMatrix,
  runtimeDigest,
} from "./consumer-runtime-matrix.mjs";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import { INSTALLED_TEST_SCRIPTS } from "./installed-consumer-fixtures.mjs";

const fixture = () => {
  const matrix = qualificationMatrix(
    [
      ...new Set([...CI_RUNTIME.minimums, ...Object.values(CI_RUNTIME.node)]),
    ].map((version) => ({ version: `v${version}` })),
  );
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

describe("complete retained-package runtime proof", () => {
  test("accepts complete reports tied to one candidate and every actual runtime/platform", () => {
    const { matrix, reports, identity } = fixture();
    expect(validateRuntimeReports(matrix, reports, identity)).toMatchObject({
      result: "PASS",
      matrixSha256: runtimeDigest(matrix),
    });
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
