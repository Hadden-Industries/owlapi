import { appendFileSync, lstatSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
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
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (check === "owl_contract") {
    const nativePath = join(dirname(reportPath), "native.ndjson");
    const nativeStat = lstatSync(nativePath);
    if (
      !nativeStat.isFile() ||
      nativeStat.isSymbolicLink() ||
      nativeStat.size > 256 * 1024
    )
      throw new Error("Invalid native contract evidence file.");
    assertNativeOwlContractReport(report, readFileSync(nativePath, "utf8"));
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
