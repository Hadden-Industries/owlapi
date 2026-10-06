import { describe, expect, test } from "@jest/globals";

import {
  REQUIRED_JOB_IDS,
  requireSuccessfulJobs,
  requireReleaseJobs,
} from "./require-job-success.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { summarizeJavaExecution } from "./ci-check-coverage.mjs";
import { summarizeOwlContractExecution } from "./owl-contract-evidence.mjs";
import { contractReport } from "./fixtures/owl-contract-report.mjs";

const successfulNeeds = (workflow) =>
  Object.fromEntries(
    REQUIRED_JOB_IDS[workflow].map((jobId) => [
      jobId,
      { result: "success", outputs: {} },
    ]),
  );

describe("required workflow aggregation", () => {
  test("release requires complete current Java parity as well as installed OWL proof", () => {
    const identity = { runId: 100, runAttempt: 2, commit: "c".repeat(40) };
    const native = JSON.parse(
      readFileSync(
        new URL("./fixtures/ci-java-jest-live.json", import.meta.url),
        "utf8",
      ),
    );
    for (const suite of native.testResults) suite.name = resolve(suite.name);
    const java = summarizeJavaExecution(native, identity);
    const owl = summarizeOwlContractExecution(
      contractReport(identity, { workflow: "Release" }),
      identity,
      "Release",
    );
    const needs = successfulNeeds("release");
    needs.candidate.outputs = {
      artifact_id: "702",
      artifact_digest: "f".repeat(64),
    };
    needs.owl_contract.outputs.coverage = JSON.stringify(owl);
    needs.source_node_24.outputs.coverage = JSON.stringify(java);
    const execution = {
      runId: identity.runId,
      runAttempt: identity.runAttempt,
      sha: identity.commit,
    };
    expect(requireReleaseJobs(needs, execution).requiredJobs).toEqual(
      REQUIRED_JOB_IDS.release,
    );
    for (const fault of ["missing", "stale", "partial", "future"]) {
      const changed = structuredClone(java);
      if (fault === "stale") changed.commit = "a".repeat(40);
      if (fault === "partial") changed.tests.passed -= 1;
      if (fault === "future") changed.runAttempt = 3;
      needs.source_node_24.outputs.coverage =
        fault === "missing" ? undefined : JSON.stringify(changed);
      expect(() => requireReleaseJobs(needs, execution)).toThrow();
    }
  });
  test.each(["ci", "release"])(
    "requires successful Windows source quality in %s",
    (workflow) => {
      for (const result of ["failure", "cancelled", "skipped", "missing"]) {
        const needs = successfulNeeds(workflow);
        expect(needs.quality_windows).toEqual(
          expect.objectContaining({ result: "success" }),
        );
        if (result === "missing") delete needs.quality_windows;
        else needs.quality_windows.result = result;
        expect(() => requireSuccessfulJobs(workflow, needs)).toThrow(
          /quality_windows/,
        );
      }
    },
  );

  test("adds evidence closure to releases without slowing ordinary CI", () => {
    expect(REQUIRED_JOB_IDS.release).toContain("third_party_evidence");
    expect(REQUIRED_JOB_IDS.ci).not.toContain("third_party_evidence");
  });

  test.each(["ci", "release"])(
    "accepts the complete successful %s inventory",
    (workflow) => {
      expect(
        requireSuccessfulJobs(workflow, successfulNeeds(workflow)),
      ).toEqual(REQUIRED_JOB_IDS[workflow]);
    },
  );

  test("rejects missing, skipped, and unexpected jobs", () => {
    const needs = successfulNeeds("ci");
    delete needs.metadata;
    needs.browser_firefox.result = "skipped";
    needs.unregistered = { result: "success" };

    expect(() => requireSuccessfulJobs("ci", needs)).toThrow(
      /missing=metadata.*unexpected=unregistered.*browser_firefox=skipped/u,
    );
  });
});
