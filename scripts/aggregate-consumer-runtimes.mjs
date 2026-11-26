/** Missing, duplicated, skipped, stale or differently bound lane evidence fails closed. */
import assert from "node:assert/strict";
import {
  appendFileSync,
  lstatSync,
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
import { assertCiConsumerAttribution } from "./ci-recipient-attribution.mjs";
import { sha256Buffer } from "./release-file-utils.mjs";

/** Apply the report schema selected by the trusted run or historical reader. */
export function validateRuntimeReports(
  matrix,
  reports,
  identity,
  { schemaVersion = 1, originalAttempts } = {},
) {
  validateFrozenMatrix(matrix);
  assert.ok([1, 2].includes(schemaVersion));
  assert.equal(
    reports.length,
    matrix.include.length,
    "Missing or unexpected runtime reports",
  );
  const keys = new Set();
  let tarball;
  for (const report of reports) {
    assert.equal(
      report.schemaVersion,
      schemaVersion,
      "Required runtime report schema differs",
    );
    assert.equal(report.result, "PASS");
    assert.equal(report.matrixSha256, runtimeDigest(matrix));
    assert.ok(
      jsonEquals(report.candidateArtifact, identity.candidateArtifact),
      "Runtime report qualified a different candidate artifact",
    );
    assert.equal(report.commit, identity.commit);
    assert.equal(report.runId, identity.runId);
    const key = `${report.lane.runner}/${report.lane.node}`;
    assert.equal(
      report.runAttempt,
      originalAttempts?.get(key) ?? identity.runAttempt,
    );
    assert.ok(
      matrix.include.some(
        (lane) => runtimeDigest(lane) === runtimeDigest(report.lane),
      ),
      "Unknown consumer lane",
    );
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
    if (schemaVersion === 2) {
      assert.equal(proof.schemaVersion, 2);
      assert.deepEqual(Object.keys(proof.consumers).sort(), [
        "alias",
        "scoped",
      ]);
    }
    for (const mode of ["alias", "scoped"]) {
      assert.ok(
        jsonEquals(
          proof.consumers[mode].installedTests,
          INSTALLED_TEST_SCRIPTS,
        ),
        "Installed consumer test inventory differs",
      );
      if (schemaVersion === 2) {
        assertCiConsumerAttribution(proof.consumers[mode].attribution, {
          role: `portability-${mode}`,
          tarballSha256: proof.tarball.sha256,
          npm: CI_RUNTIME.consumerNpm,
          platform: {
            os: report.lane.os,
            cpu: report.lane.arch,
            node: report.lane.node,
          },
        });
      }
    }
    assert.match(proof.tarball.sha256, /^[a-f0-9]{64}$/u);
    if (tarball)
      assert.ok(
        jsonEquals(proof.tarball, tarball),
        "Lanes qualified different package bytes",
      );
    tarball = proof.tarball;
  }
  return {
    schemaVersion,
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

/** Reopen the named original lane members and their scoped decisions. The
 * aggregate keeps only compact pointers to each original authentic artifact. */
export function readRuntimeReportOriginals(
  matrix,
  root,
  identity,
  { workflow, expectedReports } = {},
) {
  validateFrozenMatrix(matrix);
  const artifactName = (lane) =>
    `consumer-runtime-${lane.runner}-${lane.node}-attempt-${identity.runAttempt}`;
  const names = matrix.include.map(artifactName).sort();
  assert.ok(
    jsonEquals(readdirSync(root).sort(), names),
    "Required native lane evidence is missing or has unexpected attempts",
  );
  const reports = [];
  const originalReports = [];
  for (const name of names) {
    const directory = join(root, name);
    const path = join(directory, "lane.json");
    assert.ok(lstatSync(directory).isDirectory());
    const stat = lstatSync(path);
    assert.ok(
      stat.isFile() && stat.size <= 16 * 1024 * 1024,
      "Invalid or oversized",
    );
    const bytes = readFileSync(path);
    const report = JSON.parse(bytes);
    assert.equal(
      report.schemaVersion,
      2,
      "Required runtime report schema differs",
    );
    assert.equal(
      artifactName(report.lane),
      name,
      "Retained lane does not match the artifact name",
    );
    assert.ok(
      jsonEquals(report.origin, { workflow, job: "consumer_runtime" }),
      "Retained runtime report has a different native job identity",
    );
    const observations = ["alias", "scoped"].map((mode) => {
      const attribution = report.portability.consumers[mode].attribution;
      assertCiConsumerAttribution(attribution, {
        role: `portability-${mode}`,
        tarballSha256: report.portability.tarball.sha256,
        decisionDirectory: join(directory, "eligibility"),
      });
      const { resolution } = attribution.evidence;
      return {
        role: attribution.decision.role,
        lockSha256: resolution.lockSha256,
        manifestSha256: resolution.manifestSha256,
        resolutionSha256: attribution.decision.resolutionSha256,
        decisionSha256: attribution.decision.decisionSha256,
      };
    });
    originalReports.push({
      artifactName: name,
      member: "lane.json",
      bytes: bytes.length,
      sha256: sha256Buffer(bytes),
      observations,
    });
    reports.push(report);
  }
  if (expectedReports !== undefined)
    assert.ok(
      jsonEquals(originalReports, expectedReports),
      "Retained runtime originals differ from the authenticated aggregate pointers",
    );
  return {
    ...validateRuntimeReports(matrix, reports, identity, { schemaVersion: 2 }),
    originalReports,
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
  const summary = readRuntimeReportOriginals(
    matrix,
    root,
    {
      candidateArtifact: {
        id: Number(process.env.OWLAPI_CANDIDATE_ID),
        digest: process.env.OWLAPI_CANDIDATE_DIGEST,
      },
      commit: process.env.GITHUB_SHA,
      runId: Number(process.env.GITHUB_RUN_ID),
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    },
    { workflow: process.env.GITHUB_WORKFLOW },
  );
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
