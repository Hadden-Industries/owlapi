/** Missing, duplicated, skipped, stale or differently bound lane evidence fails closed. */
import assert from "node:assert/strict";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CI_RUNTIME } from "./runtime-policy.mjs";
import {
  runtimeDigest,
  validateFrozenMatrix,
} from "./consumer-runtime-matrix.mjs";
import { INSTALLED_TEST_SCRIPTS } from "./installed-consumer-fixtures.mjs";
import { jsonEquals } from "./canonical-json.mjs";

export function validateRuntimeReports(matrix, reports, identity) {
  validateFrozenMatrix(matrix);
  assert.equal(
    reports.length,
    matrix.include.length,
    "Missing or unexpected runtime reports",
  );
  const keys = new Set();
  let tarball;
  for (const report of reports) {
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.result, "PASS");
    assert.equal(report.matrixSha256, runtimeDigest(matrix));
    assert.ok(
      jsonEquals(report.candidateArtifact, identity.candidateArtifact),
      "Runtime report qualified a different candidate artifact",
    );
    assert.equal(report.commit, identity.commit);
    assert.equal(report.runId, identity.runId);
    assert.equal(report.runAttempt, identity.runAttempt);
    assert.ok(
      matrix.include.some(
        (lane) => runtimeDigest(lane) === runtimeDigest(report.lane),
      ),
      "Unknown consumer lane",
    );
    const key = `${report.lane.runner}/${report.lane.node}`;
    assert.ok(!keys.has(key), "Duplicate runtime lane");
    keys.add(key);
    assert.equal(report.npm, CI_RUNTIME.consumerNpm);
    assert.equal(
      report.productSuite,
      report.lane.os === "linux" ? "PASS" : "PRODUCER_LINUX_COVERAGE",
    );
    const proof = report.portability;
    assert.equal(proof.result, "PASS");
    assert.equal(proof.runtime.node, `v${report.lane.node}`);
    assert.equal(proof.runtime.npm, CI_RUNTIME.consumerNpm);
    assert.equal(proof.runtime.platform, report.lane.os);
    assert.equal(proof.runtime.architecture, report.lane.arch);
    for (const mode of ["alias", "scoped"])
      assert.ok(
        jsonEquals(
          proof.consumers[mode].installedTests,
          INSTALLED_TEST_SCRIPTS,
        ),
        "Installed consumer test inventory differs",
      );
    assert.match(proof.tarball.sha256, /^[a-f0-9]{64}$/u);
    if (tarball)
      assert.ok(
        jsonEquals(proof.tarball, tarball),
        "Lanes qualified different package bytes",
      );
    tarball = proof.tarball;
  }
  return {
    schemaVersion: 1,
    result: "PASS",
    ...identity,
    matrix,
    matrixSha256: runtimeDigest(matrix),
    tarball,
    lanes: [...keys].sort(),
    reportsSha256: runtimeDigest(
      [...reports].sort((a, b) =>
        `${a.lane.runner}/${a.lane.node}`.localeCompare(
          `${b.lane.runner}/${b.lane.node}`,
          "en",
        ),
      ),
    ),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  assert.equal(
    process.env.OWLAPI_RUNTIME_LANES_RESULT,
    "success",
    "Every consumer job must succeed",
  );
  const matrix = validateFrozenMatrix(
    JSON.parse(process.env.OWLAPI_RUNTIME_MATRIX),
  );
  const root = ".release/runtime-reports";
  const reports = readdirSync(root).map((name) =>
    JSON.parse(readFileSync(join(root, name, "lane.json"), "utf8")),
  );
  const summary = validateRuntimeReports(matrix, reports, {
    candidateArtifact: {
      id: Number(process.env.OWLAPI_CANDIDATE_ID),
      digest: process.env.OWLAPI_CANDIDATE_DIGEST,
    },
    commit: process.env.GITHUB_SHA,
    runId: Number(process.env.GITHUB_RUN_ID),
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  });
  mkdirSync(".release/runtime-qualification", { recursive: true });
  writeFileSync(
    ".release/runtime-qualification/summary.json",
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  writeFileSync(
    ".release/runtime-qualification/matrix.json",
    `${JSON.stringify(matrix, null, 2)}\n`,
  );
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `coverage=${JSON.stringify({ matrixSha256: summary.matrixSha256, candidateArtifact: summary.candidateArtifact, reportsSha256: summary.reportsSha256, lanes: summary.lanes.length })}\n`,
  );
}
