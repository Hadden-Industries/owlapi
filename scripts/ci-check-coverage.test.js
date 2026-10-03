import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { resolve } from "node:path";
import {
  summarizeJavaExecution,
  summarizeWebvowlExecution,
  assertCheckCoverage,
} from "./ci-check-coverage.mjs";

// Native Jest output from the two unchanged live suites at 76350128, 2026-10-03:
// 50 tests passed; these 23 assertions are the selected live Java groups.
const fixture = () => {
  const report = JSON.parse(
    readFileSync(
      new URL("./fixtures/ci-java-jest-live.json", import.meta.url),
      "utf8",
    ),
  );
  for (const suite of report.testResults) suite.name = resolve(suite.name);
  return report;
};
const identity = { runId: 100, runAttempt: 2, commit: "c".repeat(40) };

const consumerReport = () => ({
  schemaVersion: 1,
  result: "PASS",
  qualification: "PRE_INTEGRATION",
  candidate: { tarballSha256: "e".repeat(64) },
  maintainedWebVowlCheckoutModified: false,
  cleanInstall: { npmLs: "PASS", installedPackageIdentity: "PASS" },
  gates: {
    baselineNpmCi: "PASS",
    baselineJest: "PASS",
    baselineDevelopmentBuild: "PASS",
    baselineProductionBuild: "PASS",
    consumerBoundary: "PASS",
    candidateJest: "PASS",
    installedImportClosure: "PASS",
    phase21TargetErrorSemantics: "PASS",
    representativeCorpus: "PASS",
    candidateDevelopmentBuild: "PASS",
    candidateProductionBuild: "PASS",
    candidateWebVowlViteConsumerBuild: "PASS",
    candidateChromiumIntegration: "PASS",
  },
});
test("records the native consumer report and binds the actual tarball digest", () => {
  const record = summarizeWebvowlExecution(consumerReport(), identity);
  expect(record).toMatchObject({
    check: "webvowl",
    execution: "SUCCESS",
    candidateTarballSha256: "e".repeat(64),
    ...identity,
  });
  expect(assertCheckCoverage(record, "webvowl", identity)).toEqual(record);
});
test.each([
  "missing gate",
  "failed gate",
  "unknown gate",
  "invalid candidate",
  "modified checkout",
  "failed installation",
  "release report",
])("rejects invalid consumer qualification: %s", (fault) => {
  const report = consumerReport();
  if (fault === "missing gate") delete report.gates.candidateJest;
  if (fault === "failed gate") report.gates.candidateJest = "FAIL";
  if (fault === "unknown gate") report.gates.unknown = "PASS";
  if (fault === "invalid candidate") report.candidate.tarballSha256 = "invalid";
  if (fault === "modified checkout")
    report.maintainedWebVowlCheckoutModified = true;
  if (fault === "failed installation") report.cleanInstall.npmLs = "FAIL";
  if (fault === "release report") report.qualification = "RECONCILED";
  expect(() => summarizeWebvowlExecution(report, identity)).toThrow();
});
test("native recorder requires the live environment and emits no success for skipped tests", () => {
  const root = mkdtempSync(join(tmpdir(), "owlapi-ci-accounting-"));
  try {
    const reportPath = join(root, "jest.json");
    const output = join(root, "outputs");
    const report = fixture();
    writeFileSync(reportPath, JSON.stringify(report));
    const env = {
      ...process.env,
      GITHUB_RUN_ID: "100",
      GITHUB_RUN_ATTEMPT: "2",
      GITHUB_SHA: identity.commit,
      GITHUB_OUTPUT: output,
    };
    const invoke = (reference) =>
      spawnSync(
        process.execPath,
        [resolve("scripts/ci-check-coverage-command.mjs"), "java", reportPath],
        {
          encoding: "utf8",
          windowsHide: true,
          env: { ...env, OWLAPI_REFERENCE_CHECKOUT: reference },
        },
      );
    expect(invoke("").status).not.toBe(0);
    expect(existsSync(output)).toBe(false);
    report.testResults[0].assertionResults[0].status = "pending";
    writeFileSync(reportPath, JSON.stringify(report));
    expect(invoke("configured-reference").status).not.toBe(0);
    expect(existsSync(output)).toBe(false);
    writeFileSync(reportPath, JSON.stringify(fixture()));
    const result = invoke("configured-reference");
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      execution: "SUCCESS",
      tests: { passed: 23, skipped: 0 },
    });
    expect(readFileSync(output, "utf8")).toBe(
      `coverage=${result.stdout.trim()}\n`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accounts for every selected live Java assertion from native Jest evidence", () => {
  expect(summarizeJavaExecution(fixture(), identity)).toMatchObject({
    schemaVersion: 1,
    check: "java",
    execution: "SUCCESS",
    ...identity,
    tests: { expected: 23, passed: 23, failed: 0, skipped: 0 },
  });
});
test.each(["pending", "skipped", "failed", "todo"])(
  "rejects a selected live test recorded as %s",
  (status) => {
    const report = fixture();
    report.testResults[0].assertionResults[0].status = status;
    expect(() => summarizeJavaExecution(report, identity)).toThrow(
      /live Java/u,
    );
  },
);
test.each(["missing", "duplicate", "unknown", "wrong file", "failed suite"])(
  "rejects incomplete native live accounting: %s",
  (fault) => {
    const report = fixture();
    const assertions = report.testResults[0].assertionResults;
    if (fault === "missing") assertions.pop();
    if (fault === "duplicate") assertions.push(assertions[0]);
    if (fault === "unknown")
      assertions.push({
        ...assertions[0],
        fullName: "pinned Java unknown behavior",
      });
    if (fault === "wrong file")
      report.testResults[0].name = resolve("unregistered.test.js");
    if (fault === "failed suite") report.success = false;
    expect(() => summarizeJavaExecution(report, identity)).toThrow();
  },
);
test("does not turn a forged successful output or stale identity into current coverage", () => {
  const record = summarizeJavaExecution(fixture(), identity);
  expect(assertCheckCoverage(record, "java", identity)).toEqual(record);
  expect(() =>
    assertCheckCoverage({ ...record, extra: true }, "java", identity),
  ).toThrow();
  expect(() =>
    assertCheckCoverage(record, "java", { ...identity, runAttempt: 3 }),
  ).toThrow();
  expect(() =>
    assertCheckCoverage({ ...record, execution: "NOT_RUN" }, "java", identity),
  ).toThrow();
});
