/** Closed producer contract proof shared by CI, release and prepublication admission. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { PACKAGE_NAME, PACKAGE_VERSION } from "./package-identity.mjs";
import { OWL_CONTRACT_ASSERTIONS } from "../test/consumers/owl-contract/public-model-cases.js";
import {
  REVIEWED_CONSUMER_SOURCES,
  assertReviewedConsumerSources,
  sourceFingerprint,
} from "./consumer-source-snapshot.mjs";

export { REVIEWED_CONSUMER_SOURCES };
export const OWL_CONTRACT_FIXTURES = Object.freeze([
  "test/consumers/owl-contract/contract.test.mjs",
  "test/consumers/owl-contract/public-model-cases.js",
  "test/consumers/owl-contract/native-reporter.mjs",
  "test/consumers/owl-contract/public-model-probes.js",
  "test/consumers/owl-contract/acquisition-contracts.js",
  "test/consumers/owl-contract/writer-configuration.js",
  "test/import-closure/public-contract.js",
  "test/import-closure/rc2-public-contract.js",
  "test/installed-package-no-network.mjs",
  ...["root", "left", "right", "leaf"].map(
    (name) => `test/import-closure/fixtures/closure/${name}.ofn`,
  ),
]);
export const OWL_CONTRACT_INVENTORY_SHA256 = sourceFingerprint({
  assertions: OWL_CONTRACT_ASSERTIONS,
  sourceScopes: REVIEWED_CONSUMER_SOURCES.snapshots.map(
    ({ repository, sources }) => ({ repository, sources }),
  ),
});
export const owlContractFixtureSha256 = () =>
  sourceFingerprint(
    OWL_CONTRACT_FIXTURES.map((path) => ({
      path,
      sha256: sourceFingerprint(
        readFileSync(new URL(`../${path}`, import.meta.url)).toString("base64"),
      ),
    })),
  );
const digest = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const closed = (value, keys) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
const artifactValid = (value) =>
  closed(value, ["id", "digest"]) &&
  Number.isSafeInteger(value.id) &&
  value.id > 0 &&
  /^sha256:[a-f0-9]{64}$/u.test(value.digest);
const identityValid = (value) =>
  closed(value, ["workflow", "runId", "runAttempt", "commit"]) &&
  /^[a-f0-9]{40}$/u.test(value.commit) &&
  (value.workflow === "LOCAL"
    ? value.runId === null && value.runAttempt === null
    : ["CI", "Release"].includes(value.workflow) &&
      Number.isSafeInteger(value.runId) &&
      value.runId > 0 &&
      Number.isSafeInteger(value.runAttempt) &&
      value.runAttempt > 0);

/** Read retained evidence against its recorded definitions, never today's oracle.
 * This checks archive consistency only; publication uses assertOwlContractReport. */
export const assertArchivedOwlContractReport = (
  report,
  { candidateSha256, artifact, package: packageIdentity },
) => {
  const sources = report?.consumerSources;
  const snapshotsValid =
    closed(sources, ["schemaVersion", "snapshots"]) &&
    sources.schemaVersion === 1 &&
    Array.isArray(sources.snapshots) &&
    sources.snapshots.length > 0 &&
    sources.snapshots.length <= 10 &&
    new Set(sources.snapshots.map((row) => row.repository)).size ===
      sources.snapshots.length &&
    sources.snapshots.every(
      (row) =>
        closed(row, [
          "repository",
          "defaultBranch",
          "commit",
          "tree",
          "sources",
          "sourceSha256",
        ]) &&
        /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(row.repository) &&
        typeof row.defaultBranch === "string" &&
        /^[A-Za-z0-9_./-]+$/u.test(row.defaultBranch) &&
        !row.defaultBranch.includes("..") &&
        /^[a-f0-9]{40}$/u.test(row.commit) &&
        /^[a-f0-9]{40}$/u.test(row.tree) &&
        Array.isArray(row.sources) &&
        row.sources.length > 0 &&
        row.sources.length <= 400 &&
        new Set(row.sources.map((source) => source.path)).size ===
          row.sources.length &&
        row.sources.every(
          (source) =>
            closed(source, ["path", "blob"]) &&
            typeof source.path === "string" &&
            /^[A-Za-z0-9_.@/-]+$/u.test(source.path) &&
            !source.path.startsWith("/") &&
            !source.path.includes("..") &&
            /^[a-f0-9]{40}$/u.test(source.blob),
        ) &&
        row.sourceSha256 === sourceFingerprint(row.sources),
    );
  const assertionsValid =
    Array.isArray(report?.assertions) &&
    report.assertions.length > 0 &&
    report.assertions.length <= 1000 &&
    new Set(report.assertions.map((row) => row.name)).size ===
      report.assertions.length &&
    report.assertions.every(
      (row) =>
        closed(row, ["name", "status", "skipped", "todo"]) &&
        typeof row.name === "string" &&
        row.name.length > 0 &&
        row.name.length <= 512 &&
        row.status === "passed" &&
        row.skipped === false &&
        row.todo === false,
    );
  if (
    !closed(report, [
      "schemaVersion",
      "check",
      "result",
      "identity",
      "candidate",
      "consumerSources",
      "inventorySha256",
      "fixtureSha256",
      "nativeReportSha256",
      "assertions",
    ]) ||
    report.schemaVersion !== 1 ||
    report.check !== "owl_contract" ||
    report.result !== "PASS" ||
    !identityValid(report.identity) ||
    report.identity.workflow !== "Release" ||
    !closed(report.candidate, ["package", "tarballSha256", "artifact"]) ||
    !isDeepStrictEqual(report.candidate.package, packageIdentity) ||
    !artifactValid(report.candidate.artifact) ||
    !isDeepStrictEqual(report.candidate.artifact, artifact) ||
    !digest(candidateSha256) ||
    report.candidate.tarballSha256 !== candidateSha256 ||
    !digest(report.fixtureSha256) ||
    !digest(report.nativeReportSha256) ||
    !snapshotsValid ||
    !assertionsValid ||
    report.inventorySha256 !==
      sourceFingerprint({
        assertions: report.assertions.map((row) => row.name),
        sourceScopes: sources.snapshots.map(
          ({ repository, sources: rows }) => ({ repository, sources: rows }),
        ),
      })
  )
    throw new Error(
      "Retained OWL contract proof is inconsistent with its recorded definitions or candidate.",
    );
  return report;
};

/** Account for each native assertion once; skipped, renamed and fabricated inventories fail closed. */
export const assertOwlContractReport = (
  report,
  { candidateSha256, identity, artifact } = {},
) => {
  const expectedAssertions = OWL_CONTRACT_ASSERTIONS.map((name) => ({
    name,
    status: "passed",
    skipped: false,
    todo: false,
  }));
  if (
    !closed(report, [
      "schemaVersion",
      "check",
      "result",
      "identity",
      "candidate",
      "consumerSources",
      "inventorySha256",
      "fixtureSha256",
      "nativeReportSha256",
      "assertions",
    ]) ||
    !identityValid(report.identity) ||
    !closed(report.candidate, ["package", "tarballSha256", "artifact"]) ||
    !isDeepStrictEqual(report.candidate.package, {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION,
    }) ||
    (report.identity.workflow === "LOCAL"
      ? report.candidate.artifact !== null
      : !artifactValid(report.candidate.artifact)) ||
    (artifact && !isDeepStrictEqual(report.candidate.artifact, artifact)) ||
    report.schemaVersion !== 1 ||
    report.check !== "owl_contract" ||
    report.result !== "PASS" ||
    !digest(report.candidate?.tarballSha256) ||
    report.inventorySha256 !== OWL_CONTRACT_INVENTORY_SHA256 ||
    report.fixtureSha256 !== owlContractFixtureSha256() ||
    !isDeepStrictEqual(report.assertions, expectedAssertions) ||
    !digest(report.nativeReportSha256) ||
    (candidateSha256 && report.candidate.tarballSha256 !== candidateSha256) ||
    (identity && !isDeepStrictEqual(report.identity, identity))
  )
    throw new Error(
      "Installed OWL contract proof has invalid candidate, inventory, assertions or execution identity.",
    );
  assertReviewedConsumerSources(
    report.consumerSources,
    REVIEWED_CONSUMER_SOURCES,
  );
  return report;
};

/** Raw native results are required at every report-to-admission transition. */
export const assertNativeOwlContractReport = (report, nativeText, options) => {
  assertOwlContractReport(report, options);
  const hash = createHash("sha256").update(nativeText).digest("hex");
  const rows = nativeText
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  if (
    hash !== report.nativeReportSha256 ||
    !isDeepStrictEqual(rows, report.assertions)
  )
    throw new Error(
      "Native OWL assertion evidence differs from its bound report.",
    );
  return report;
};

/** Report-to-coverage transition retains the exact native proof and bindings. */
export const summarizeOwlContractExecution = (
  report,
  identity,
  workflow = "CI",
) => {
  assertOwlContractReport(report, { identity: { workflow, ...identity } });
  return {
    schemaVersion: 2,
    check: "owl_contract",
    execution: "SUCCESS",
    ...identity,
    candidateArtifact: report.candidate.artifact,
    candidateTarballSha256: report.candidate.tarballSha256,
    inventorySha256: report.inventorySha256,
    fixtureSha256: report.fixtureSha256,
    consumerSources: report.consumerSources,
    assertions: report.assertions,
    nativeReportSha256: report.nativeReportSha256,
    evidenceSha256: sourceFingerprint(report),
  };
};

/** Independently reconstruct required successful coverage, not merely a SUCCESS flag. */
export const assertOwlContractCoverage = (record, identity) => {
  const expected = {
    schemaVersion: 2,
    check: "owl_contract",
    execution: "SUCCESS",
    runId: identity.runId,
    runAttempt: identity.runAttempt,
    commit: identity.commit,
    candidateArtifact: record?.candidateArtifact,
    candidateTarballSha256: record?.candidateTarballSha256,
    inventorySha256: OWL_CONTRACT_INVENTORY_SHA256,
    fixtureSha256: owlContractFixtureSha256(),
    consumerSources: record?.consumerSources,
    assertions: OWL_CONTRACT_ASSERTIONS.map((name) => ({
      name,
      status: "passed",
      skipped: false,
      todo: false,
    })),
    nativeReportSha256: record?.nativeReportSha256,
    evidenceSha256: record?.evidenceSha256,
  };
  if (
    !artifactValid(record?.candidateArtifact) ||
    ![
      record?.candidateTarballSha256,
      record?.nativeReportSha256,
      record?.evidenceSha256,
    ].every(digest) ||
    !isDeepStrictEqual(record, expected)
  )
    throw new Error("Invalid installed OWL contract coverage.");
  assertReviewedConsumerSources(
    record.consumerSources,
    REVIEWED_CONSUMER_SOURCES,
  );
  return record;
};
