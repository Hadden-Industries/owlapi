import { readFileSync } from "node:fs";
import { describe, expect, test } from "@jest/globals";
import semver from "semver";
import { parse } from "yaml";
import {
  CANONICAL_NODE,
  CI_RUNTIME,
  consumerNodeRange,
  projectRuntimeText,
} from "./runtime-policy.mjs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));

describe("development dependency and runtime eligibility", () => {
  test("floating minimums retain an exact reproducible root graph", () => {
    expect(Object.keys(manifest.devDependencies)).toHaveLength(23);
    expect(lock.packages[""].devDependencies).toEqual(manifest.devDependencies);
    expect(lock.packages[""].engines).toEqual(manifest.engines);
    for (const [name, range] of Object.entries(manifest.devDependencies)) {
      expect(range).toMatch(/^>=\d+\.\d+\.\d+$/u);
      expect(
        semver.satisfies(lock.packages[`node_modules/${name}`].version, range),
      ).toBe(true);
    }
  });
  test.each(CI_RUNTIME.minimums)(
    "consumer Node %s has closed family boundaries",
    (minimum) => {
      expect(manifest.engines.node).toBe(consumerNodeRange());
      for (const version of [minimum, semver.inc(minimum, "patch")]) {
        expect(semver.satisfies(version, manifest.engines.node)).toBe(true);
      }
      expect(semver.satisfies(`${minimum}-rc.1`, manifest.engines.node)).toBe(
        false,
      );
      expect(
        semver.satisfies(semver.inc(minimum, "major"), manifest.engines.node),
      ).toBe(false);
      const { major, minor, patch } = semver.parse(minimum);
      const below = patch
        ? `${major}.${minor}.${patch - 1}`
        : minor
          ? `${major}.${minor - 1}.999`
          : `${major - 1}.999.999`;
      expect(semver.satisfies(below, manifest.engines.node)).toBe(false);
    },
  );
  test("npm eligibility follows the local minimum independently of the reference", () => {
    const range = manifest.devEngines.packageManager.version;
    expect(range).toBe(projectRuntimeText("{{runtime:npmRange}}"));
    expect(semver.satisfies(CI_RUNTIME.npmMinimum, range)).toBe(true);
    expect(semver.satisfies(CI_RUNTIME.npm, range)).toBe(true);
    expect(semver.satisfies(`${CI_RUNTIME.npmMinimum}-rc.1`, range)).toBe(
      false,
    );
  });
  test("native npm remains the sole versionless development runtime authority", () => {
    expect(manifest.devEngines.runtime).toEqual({
      name: "node",
      onFail: "error",
    });
    expect(manifest.devEngines.packageManager.onFail).toBe("error");
    expect(manifest).not.toHaveProperty("packageManager");
    expect(readFileSync(".node-version", "utf8").trim()).toBe(CANONICAL_NODE);
  });
  test.each(["ci", "release"])(
    "%s blocks on exact Node 26 source and retained-package reference runtimes",
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
          job.steps.find(
            (step) => step.uses === "./.github/actions/setup-producer",
          ).with["node-family"],
        ).toBe("26");
        expect(
          job.steps.some(
            (step) =>
              step.uses === "./.github/actions/setup-producer" &&
              (step.with?.["verify-runtime"] ?? "true") === "true",
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
