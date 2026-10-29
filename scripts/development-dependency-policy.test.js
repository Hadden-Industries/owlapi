import { readFileSync } from "node:fs";
import { describe, expect, test } from "@jest/globals";
import semver from "semver";
import { parse } from "yaml";
import {
  CANONICAL_NODE,
  CI_RUNTIME,
  consumerNodeRange,
  projectRuntimeText,
  runtimeSemver,
} from "./runtime-policy.mjs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));

describe("development dependency and runtime eligibility", () => {
  test("floating minimums retain an exact reproducible root graph", () => {
    expect(Object.keys(manifest.devDependencies)).toHaveLength(24);
    expect(lock.packages[""].devDependencies).toEqual(manifest.devDependencies);
    expect(lock.packages[""].engines).toEqual(manifest.engines);
    for (const [name, range] of Object.entries(manifest.devDependencies)) {
      // The JSON tool verifies an exact registry coordinate against cached SRI
      // bytes; the prerelease exception does not relax other development floors.
      if (name === "@hadden-industries/json-quality") {
        expect(range).toBe("1.0.0-rc.2");
        expect(lock.packages[`node_modules/${name}`].resolved).toBe(
          "https://registry.npmjs.org/@hadden-industries/json-quality/-/json-quality-1.0.0-rc.2.tgz",
        );
      } else expect(range).toMatch(/^>=\d+\.\d+\.\d+$/u);
      expect(
        semver.satisfies(lock.packages[`node_modules/${name}`].version, range),
      ).toBe(true);
    }
  });
  test("consumer admission has one floor without restricting supported families", () => {
    const minimum = semver.sort([...CI_RUNTIME.minimums])[0];
    expect(manifest.engines.node).toBe(consumerNodeRange());
    const latestFamily = Math.max(...CI_RUNTIME.minimums.map(semver.major));
    for (
      let major = semver.major(minimum);
      major <= latestFamily + 2;
      major++
    ) {
      for (const version of [`${major}.0.0`, `${major}.999.999`]) {
        const admitted = semver.gte(version, minimum);
        expect(semver.satisfies(version, manifest.engines.node)).toBe(admitted);
        expect(runtimeSemver.satisfies(version, manifest.engines.node)).toBe(
          admitted,
        );
      }
      expect(semver.satisfies(`${major}.0.0-rc.1`, manifest.engines.node)).toBe(
        false,
      );
    }
    const { major, minor, patch } = semver.parse(minimum);
    const below = patch
      ? `${major}.${minor}.${patch - 1}`
      : minor
        ? `${major}.${minor - 1}.999`
        : `${major - 1}.999.999`;
    expect(semver.satisfies(below, manifest.engines.node)).toBe(false);
    // Matrix order and higher-family floors cannot accidentally raise admission.
    expect(
      consumerNodeRange({
        ...CI_RUNTIME,
        minimums: ["26.1.0", "22.1.0", "24.2.0"],
      }),
    ).toBe(">=22.1.0");
  });
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
