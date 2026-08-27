import { describe, expect, test } from "@jest/globals";

import {
  REQUIRED_JOB_IDS,
  requireSuccessfulJobs,
} from "./require-job-success.mjs";

const successfulNeeds = (workflow) =>
  Object.fromEntries(
    REQUIRED_JOB_IDS[workflow].map((jobId) => [
      jobId,
      { result: "success", outputs: {} },
    ]),
  );

describe("required workflow aggregation", () => {
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
