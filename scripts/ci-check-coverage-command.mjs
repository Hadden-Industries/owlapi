import { appendFileSync, lstatSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { jsonEquals } from "./canonical-json.mjs";
import { summarizeJavaExecution } from "./ci-check-coverage.mjs";
import {
  summarizeOwlContractExecution,
  assertNativeOwlContractReport,
} from "./owl-contract-evidence.mjs";

/** Successful outputs are emitted only after native report and selected-test validation. */
export const recordCheckCoverage = (
  check,
  reportPath,
  environment = process.env,
) => {
  const stat = lstatSync(reportPath);
  const maximum = check === "java" ? 32 * 1024 * 1024 : 256 * 1024;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum)
    throw new Error("Check report has invalid type or size.");
  let report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (check === "owl_contract") {
    const nativePath = join(dirname(reportPath), "native.ndjson");
    const nativeStat = lstatSync(nativePath);
    if (
      !nativeStat.isFile() ||
      nativeStat.isSymbolicLink() ||
      nativeStat.size > 256 * 1024
    )
      throw new Error("Invalid native contract evidence file.");
    const native = readFileSync(nativePath, "utf8");
    if (environment.GITHUB_WORKFLOW === "Release") {
      // Both files describe one execution. The older release evidence archive
      // continues to consume qualification.json while live coverage uses v2.
      const attributedPath = join(
        dirname(reportPath),
        "attributed-qualification.json",
      );
      const attributedStat = lstatSync(attributedPath);
      if (!attributedStat.isFile() || attributedStat.size > maximum)
        throw new Error("Invalid attributed OWL contract report file.");
      const attributed = JSON.parse(readFileSync(attributedPath, "utf8"));
      const { attribution, ...sameExecution } = attributed;
      if (
        !attribution ||
        !jsonEquals(report, { ...sameExecution, schemaVersion: 1 })
      )
        throw new Error(
          "Archived and attributed OWL contract reports describe different executions.",
        );
      report = attributed;
    }
    assertNativeOwlContractReport(report, native, {
      schemaVersion: 2,
      decisionDirectory: join(dirname(reportPath), "eligibility"),
    });
  }
  const identity = {
    runId: Number(environment.GITHUB_RUN_ID),
    runAttempt: Number(environment.GITHUB_RUN_ATTEMPT),
    commit: environment.GITHUB_SHA,
  };
  if (check === "java" && !environment.OWLAPI_REFERENCE_CHECKOUT)
    throw new Error("Required live Java reference is not configured.");
  const record =
    check === "java"
      ? summarizeJavaExecution(report, identity)
      : check === "owl_contract"
        ? summarizeOwlContractExecution(
            report,
            identity,
            environment.GITHUB_WORKFLOW,
          )
        : null;
  if (!record) throw new Error("Unknown CI check.");
  const serialized = JSON.stringify(record);
  if (environment.GITHUB_OUTPUT)
    appendFileSync(environment.GITHUB_OUTPUT, `coverage=${serialized}\n`);
  process.stdout.write(`${serialized}\n`);
  return record;
};
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  recordCheckCoverage(process.argv[2], process.argv[3]);
