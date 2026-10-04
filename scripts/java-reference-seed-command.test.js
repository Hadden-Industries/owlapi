import { expect, jest, test } from "@jest/globals";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { selectSeedAwareStrategy } from "./java-reference-seed-command.mjs";

const verified = {
  reuse: "true",
  qualification: "original verified PR receipt",
};
test("a cold, expired, interrupted or failed seed requires FULL main qualification", () => {
  for (const availableNow of [false, undefined, null])
    expect(
      selectSeedAwareStrategy({
        verified,
        referenceEnabled: true,
        seedRequested: true,
        availableNow,
      }),
    ).toEqual({ reuse: "false" });
});

test.each(["failure", "cancelled", "skipped"])(
  "the actual seed command retains FULL recovery after optional verifier outcome %s",
  async (outcome) => {
    const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8"));
    const steps = workflow.jobs.verification.steps;
    const tools = steps.find((step) => step.id === "seed_tools");
    // GitHub reports a timed-out optional step as failure. Continuing the job
    // must leave that outcome visible to admission, not turn it into success.
    expect(tools["continue-on-error"]).toBe(true);
    expect(tools["timeout-minutes"]).toBe(2);
    expect(
      steps.find((step) => step.id === "seed_admit").env
        .REFERENCE_SEED_TOOLS_OUTCOME,
    ).toBe("${{ steps.seed_tools.outcome }}");
    const qualification = await import("./ci-qualification.mjs");
    const state = await import("./java-reference-state.mjs");
    const originalDirectory = process.cwd();
    const directory = mkdtempSync(join(tmpdir(), "seed-recovery-"));
    const keys = [
      "VERIFICATION_OUTPUTS_JSON",
      "REFERENCE_SEED_DOWNLOAD_OUTCOME",
      "REFERENCE_SEED_TOOLS_OUTCOME",
      "GITHUB_RUN_ID",
      "GITHUB_RUN_ATTEMPT",
      "GITHUB_OUTPUT",
      "GITHUB_STEP_SUMMARY",
    ];
    const originalEnvironment = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );
    const output = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    // The strategy receives an already independently verified PR origin.
    // Schema/policy admission has separate tests; this fixture isolates the
    // command's failure recovery without activating the repository policy.
    const origin = {
      role: "PR",
      mode: "FULL",
      javaReference: {
        seedRequested: true,
        inputs: { keySha256: "1".repeat(64) },
      },
    };
    try {
      process.chdir(directory);
      for (const key of keys) delete process.env[key];
      Object.assign(process.env, {
        VERIFICATION_OUTPUTS_JSON: JSON.stringify({
          reuse: "true",
          qualification: JSON.stringify(origin),
        }),
        REFERENCE_SEED_DOWNLOAD_OUTCOME: "success",
        REFERENCE_SEED_TOOLS_OUTCOME: outcome,
        GITHUB_RUN_ID: "101",
        GITHUB_RUN_ATTEMPT: "1",
      });
      jest.resetModules();
      jest.unstable_mockModule("./java-reference-state.mjs", () => ({
        ...state,
        JAVA_REFERENCE_POLICY: {
          ...state.JAVA_REFERENCE_POLICY,
          enabled: true,
        },
      }));
      jest.unstable_mockModule("./ci-qualification.mjs", () => ({
        ...qualification,
        assertQualificationRecord: jest.fn((record) => record),
      }));
      const { runSeedCommand } =
        await import("./java-reference-seed-command.mjs");
      await runSeedCommand("admit");
      expect(
        JSON.parse(
          readFileSync(
            join(directory, ".release/java-reference-seed/admission.json"),
            "utf8",
          ),
        ),
      ).toMatchObject({
        available: false,
        reason: "CONCURRENT_SEED_UNAVAILABLE",
        consumerRunId: 101,
        consumerRunAttempt: 1,
      });
      await runSeedCommand("strategy");
      const result = JSON.parse(output.mock.calls.at(-1)[0]);
      expect(result.reuse).toBe("false");
      expect(result.summary).toContain("Execute FULL qualification");
    } finally {
      process.chdir(originalDirectory);
      for (const [key, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      output.mockRestore();
      jest.unstable_unmockModule("./java-reference-state.mjs");
      jest.unstable_unmockModule("./ci-qualification.mjs");
      jest.resetModules();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
test("a newly verified concurrent seed clears the hint without relabeling original tests", () => {
  expect(
    selectSeedAwareStrategy({
      verified,
      referenceEnabled: true,
      seedRequested: true,
      availableNow: true,
    }),
  ).toBe(verified);
});
test("ordinary warm and disabled merges preserve whole-proof reuse; a failed PR proof never reuses", () => {
  expect(
    selectSeedAwareStrategy({
      verified,
      referenceEnabled: true,
      seedRequested: false,
      availableNow: false,
    }),
  ).toBe(verified);
  expect(
    selectSeedAwareStrategy({
      verified,
      referenceEnabled: false,
      seedRequested: true,
      availableNow: false,
    }),
  ).toBe(verified);
  expect(
    selectSeedAwareStrategy({
      verified: { reuse: "false" },
      referenceEnabled: true,
      seedRequested: false,
      availableNow: true,
    }),
  ).toEqual({ reuse: "false" });
});
