import { expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { releaseQualificationMode } from "./release-qualification-route.mjs";
import { REUSED_RELEASE_JOB_IDS } from "./require-job-success.mjs";

const workflow = parse(
  readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  ),
);

test("omitted inputs run original CI admission in a queue separate from releases", () => {
  const defaults = Object.fromEntries(
    Object.entries(workflow.on.workflow_dispatch.inputs).map(
      ([name, { default: value }]) => [name, value],
    ),
  );
  expect(releaseQualificationMode({})).toBe("reuse");
  expect(releaseQualificationMode(defaults)).toBe("reuse");
  expect(workflow.concurrency.group).toContain("owlapi-qualification-{0}");
  expect(workflow.jobs.recovery_source.needs).toBe("release_dispatch");
  expect(workflow.jobs.release_dispatch.needs).toBeUndefined();
  expect(workflow.jobs.third_party_evidence.if).toContain(
    "needs.release_admission.result == 'success'",
  );
  expect(workflow.jobs.release_admission.permissions).toEqual({
    actions: "read",
    checks: "read",
    contents: "read",
    "pull-requests": "read",
  });
  for (const id of REUSED_RELEASE_JOB_IDS)
    expect(workflow.jobs[id]?.environment).toBeUndefined();
  // These are the only independent entry points to the product graph.
  for (const id of [
    "metadata",
    "source_portable",
    "source_canonical",
    "quality_windows",
  ]) {
    expect([workflow.jobs[id].needs].flat()).toContain("release_admission");
    expect(workflow.jobs[id].if).toContain("outputs.mode != 'reuse'");
  }
  expect(workflow.jobs.candidate.needs).toEqual(
    expect.arrayContaining([
      "metadata",
      "source_portable",
      "source_canonical",
      "quality_windows",
    ]),
  );
  for (const id of [
    "npm_release",
    "recovery_publish",
    "draft_release",
    "finalize_release",
  ])
    expect(workflow.jobs[id].if).toContain("!inputs.qualification_only");
});

test.each([
  [{ fresh_qualification: true }, "fresh"],
  [{ qualification_only: false }, "legacy"],
  [{ rc3_recovery: true, qualification_only: false }, "rc3"],
])("selects exactly one explicit completion route for %j", (inputs, mode) => {
  expect(releaseQualificationMode(inputs)).toBe(mode);
});

test.each([
  { rc3_recovery: true },
  { qualification_only: false, fresh_qualification: true },
  { qualification_only: "false" },
  { mode: "fresh" },
])(
  "refuses incompatible or incorrectly typed input before authority is granted: %j",
  (inputs) => {
    expect(() => releaseQualificationMode(inputs)).toThrow();
  },
);
