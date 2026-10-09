import { readFileSync } from "node:fs";
import { describe, expect, test } from "@jest/globals";
import semver from "semver";
import { parse } from "yaml";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));

describe("development dependency and runtime eligibility", () => {
  test("floating minimums retain an exact reproducible root graph", () => {
    expect(Object.keys(manifest.devDependencies)).toHaveLength(21);
    expect(lock.packages[""].devDependencies).toEqual(manifest.devDependencies);
    for (const [name, range] of Object.entries(manifest.devDependencies)) {
      expect(range).toMatch(/^>=\d+\.\d+\.\d+$/u);
      expect(
        semver.satisfies(lock.packages[`node_modules/${name}`].version, range),
      ).toBe(true);
    }
  });
  test.each([
    ["22.23.2", false],
    ["22.23.3", true],
    ["23.0.0", false],
    ["24.20.0", false],
    ["24.21.0", true],
    ["25.0.0", false],
    ["26.11.0", false],
    ["26.11.1", true],
    ["26.12.0", true],
    ["26.11.1-rc.1", false],
    ["27.0.0", false],
  ])("Node %s eligibility is %s", (version, eligible) => {
    expect(semver.satisfies(version, manifest.engines.node)).toBe(eligible);
  });
  test.each([
    ["12.1.0", false],
    ["12.2.0", true],
    ["12.3.0", true],
    ["13.0.0", true],
    ["13.0.0-rc.1", false],
  ])("npm %s range eligibility is %s", (version, eligible) => {
    expect(
      semver.satisfies(version, manifest.devEngines.packageManager.version),
    ).toBe(eligible);
  });
  test("native npm remains the sole versionless development runtime authority", () => {
    expect(manifest.devEngines.runtime).toEqual({
      name: "node",
      onFail: "error",
    });
    expect(manifest.devEngines.packageManager.onFail).toBe("error");
    expect(manifest).not.toHaveProperty("packageManager");
    expect(readFileSync(".node-version", "utf8").trim()).toBe("24.21.0");
  });
  test.each(["ci", "release"])(
    "%s blocks on exact Node 26 source and retained-package platform floors",
    (workflowName) => {
      const workflow = parse(
        readFileSync(`.github/workflows/${workflowName}.yml`, "utf8"),
      );
      const source = workflow.jobs.source_node_26;
      expect(source).toBeDefined();
      for (const jobId of [
        "source_node_26",
        "portability_ubuntu_node_26",
        "portability_windows_node_26",
        "portability_macos_node_26",
      ]) {
        const job = workflow.jobs[jobId];
        expect(
          job.steps.find((step) => step.uses?.startsWith("actions/setup-node@"))
            .with["node-version"],
        ).toBe("26.11.1");
        expect(
          job.steps.some(
            (step) =>
              step.run ===
              "node scripts/assert-workflow-runtime.mjs --node 26.11.1 --npm 12.2.0",
          ),
        ).toBe(true);
        expect(workflow.jobs.required.needs).toContain(jobId);
      }
      expect(workflow.jobs.candidate.needs).toContain("source_node_26");
      expect(
        source.steps.some((step) => step.run === "npm run lint:source-python"),
      ).toBe(true);
      expect(
        source.steps.some((step) => step.run === "npm run install:markdown"),
      ).toBe(false);
    },
  );
});
