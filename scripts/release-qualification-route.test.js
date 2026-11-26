import { expect, jest, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { releaseQualificationMode } from "./release-qualification-route.mjs";
import { REUSED_RELEASE_JOB_IDS } from "./require-job-success.mjs";
import { recordQualification } from "./release-qualification-manifest.mjs";

const workflow = parse(
  readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  ),
);

test("only a fresh read-only qualification may reopen an exact recipient material checkpoint", () => {
  const reference = "a".repeat(40);
  const selected = {
    recipient_material_checkpoint: reference,
    qualification_only: true,
    fresh_qualification: true,
  };
  expect(releaseQualificationMode(selected)).toBe("fresh");
  for (const input of [
    { ...selected, fresh_qualification: false },
    { ...selected, rc3_recovery: true },
    { ...selected, qualification_only: false },
    { ...selected, recipient_material_checkpoint: "refs/heads/main" },
  ]) {
    expect(() => releaseQualificationMode(input)).toThrow();
  }
});

test("fresh material recovery passes the signed locator to the jobs that own each installation", () => {
  const expression = "${{ inputs.recipient_material_checkpoint }}";
  const token =
    "${{ inputs.recipient_material_checkpoint != '' && github.token || '' }}";
  for (const id of ["candidate", "consumer_runtimes"]) {
    expect(workflow.jobs[id].with.recipient_material_checkpoint).toBe(
      expression,
    );
    expect(workflow.jobs[id].permissions).toEqual({
      contents: "read",
      actions: "read",
    });
  }
  const measured = Object.entries(workflow.jobs).filter(([id]) =>
    /^portability_|^browser_(chromium|firefox|webkit)$|^owl_contract$/u.test(
      id,
    ),
  );
  expect(measured).toHaveLength(11);
  for (const [, job] of measured) {
    const fixture = job.steps.find(
      (step) =>
        step.uses === "./.github/actions/qualify-consumer" ||
        step.env?.RECIPIENT_MATERIAL_CHECKPOINT,
    );
    expect(
      fixture.with?.recipient_material_checkpoint ??
        fixture.env?.RECIPIENT_MATERIAL_CHECKPOINT,
    ).toBe(expression);
    if (fixture.env?.RECIPIENT_MATERIAL_CHECKPOINT)
      expect(fixture.env.GH_TOKEN).toBe(token);
    expect(Object.values(job.permissions)).not.toContain("write");
  }
});

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

test("the aggregate accepts a digest-bound corpus descriptor only during qualification", () => {
  const locator = "14:" + "a".repeat(64);
  expect(
    releaseQualificationMode({ corpus_qualification_artifact: locator }),
  ).toBe("reuse");
  expect(() =>
    releaseQualificationMode({
      fresh_qualification: true,
      corpus_qualification_artifact: locator,
    }),
  ).toThrow("same release run");
  expect(() =>
    releaseQualificationMode({
      qualification_only: false,
      corpus_qualification_artifact: locator,
    }),
  ).toThrow("qualification-only dispatch");
  expect(() =>
    releaseQualificationMode({ corpus_qualification_artifact: "14" }),
  ).toThrow("artifact ID or SHA-256");
  const writer = workflow.jobs.required.steps.find(
    (step) => step.run === "node scripts/release-qualification-manifest.mjs",
  );
  expect(writer.env.CORPUS_QUALIFICATION_ARTIFACT).toBe(
    "${{ inputs.corpus_qualification_artifact }}",
  );
});

test("hosted production is available on both read-only routes and exclusive of retained evidence", () => {
  expect(releaseQualificationMode({ corpus_shadow: true })).toBe("reuse");
  expect(
    releaseQualificationMode({
      corpus_shadow: true,
      fresh_qualification: true,
    }),
  ).toBe("fresh");
  expect(() =>
    releaseQualificationMode({
      corpus_shadow: true,
      qualification_only: false,
    }),
  ).toThrow("qualification-only");
  expect(() =>
    releaseQualificationMode({
      corpus_shadow: true,
      corpus_qualification_artifact: "14:" + "a".repeat(64),
    }),
  ).toThrow("without a retained descriptor");
  expect(workflow.jobs.required.needs).toContain("corpus_aggregate");
  expect(workflow.jobs.corpus_shard.strategy["fail-fast"]).toBe(false);
});

test.each([
  ["legacy", "CORPUS_QUALIFICATION_ARTIFACT", "promoted qualification"],
  ["reuse", "CORPUS_QUALIFICATION_INPUT", "fresh qualification"],
])(
  "rejects a corpus descriptor on the wrong producer route %s",
  async (mode, input, reason) => {
    const fetch = jest
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected GitHub request"));
    try {
      await expect(
        recordQualification({
          GITHUB_REPOSITORY: "Hadden-Industries/owlapi",
          GITHUB_REF: "refs/heads/main",
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_RUN_ID: "14",
          GITHUB_RUN_ATTEMPT: "1",
          GH_TOKEN: "fixture-token",
          REQUIRED_JOB_RESULTS_JSON: JSON.stringify({
            release_admission: { outputs: { mode } },
          }),
          [input]: "request-from-wrong-route",
        }),
      ).rejects.toThrow(reason);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  },
);

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
