import { describe, expect, test } from "@jest/globals";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { UBUNTU } from "./ubuntu-runner.mjs";
import { OTHER_UBUNTU } from "./fixtures/ubuntu-runner.mjs";

const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8"));

describe("dependency review without repository installation", () => {
  test("the CI dependency-review job retains its commands without npm ci", () => {
    const commands = workflow.jobs.dependency_review.steps
      .map((step) => step.run)
      .filter(Boolean);
    expect(commands).not.toContain("npm ci");
    expect(commands).toContain(
      `npm run record:runner -- --expected-os Linux --expected-arch X64 --label ${UBUNTU.label} --shell bash`,
    );
    expect(commands).toContain(
      "npm run report:dependency-review-applicability",
    );
  });

  test("the actual npm entry points run without node_modules and detect a new package import", () => {
    const root = mkdtempSync(join(tmpdir(), "owlapi-dependency-review-"));
    try {
      mkdirSync(join(root, "scripts"));
      mkdirSync(join(root, "docs", "release"), { recursive: true });
      copyFileSync(
        "docs/release/runtime-policy.json",
        join(root, "docs", "release", "runtime-policy.json"),
      );
      const manifest = JSON.parse(readFileSync("package.json", "utf8"));
      writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
      for (const name of [
        "record-runner.mjs",
        "ubuntu-runner.mjs",
        "assert-workflow-runtime.mjs",
        "report-dependency-review-applicability.mjs",
      ])
        copyFileSync(join("scripts", name), join(root, "scripts", name));
      expect(existsSync(join(root, "node_modules"))).toBe(false);
      const npmCli = process.env.npm_execpath;
      expect(npmCli).toBeTruthy();
      const invoke = (args, image = UBUNTU.image) =>
        spawnSync(process.execPath, [npmCli, ...args], {
          cwd: root,
          encoding: "utf8",
          timeout: 30000,
          env: {
            ...process.env,
            GITHUB_EVENT_NAME: "push",
            RUNNER_OS: "Linux",
            RUNNER_ARCH: "X64",
            ImageOS: image,
            ImageVersion: "20261001.1",
          },
        });
      const npmVersion = invoke(["--version"]);
      expect(npmVersion.status).toBe(0);
      const runtime = spawnSync(
        process.execPath,
        [
          "scripts/assert-workflow-runtime.mjs",
          "--node",
          process.version.slice(1),
          "--npm",
          npmVersion.stdout.trim(),
        ],
        { cwd: root, encoding: "utf8", timeout: 30000 },
      );
      expect(runtime.status).toBe(0);
      expect(JSON.parse(runtime.stdout)).toEqual({
        node: process.version,
        npm: npmVersion.stdout.trim(),
      });
      const output = join(root, "runner.json");
      const runnerArgs = [
        "run",
        "record:runner",
        "--",
        "--expected-os",
        "Linux",
        "--expected-arch",
        "X64",
        "--label",
        UBUNTU.label,
        "--shell",
        "bash",
        "--output",
        output,
      ];
      const runner = invoke(runnerArgs);
      expect(runner.status).toBe(0);
      expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
        schemaVersion: 1,
        requestedLabel: UBUNTU.label,
        selectedShell: "bash",
        runtime: { node: process.version, npm: npmVersion.stdout.trim() },
        runner: {
          os: "Linux",
          architecture: "X64",
          imageOS: UBUNTU.image,
          imageVersion: "20261001.1",
        },
      });
      const differentImage = invoke(runnerArgs, OTHER_UBUNTU.image);
      expect(differentImage.status).toBe(1);
      expect(differentImage.stderr).toContain("does not match");
      const applicability = invoke([
        "run",
        "report:dependency-review-applicability",
      ]);
      expect(applicability.status).toBe(0);
      expect(applicability.stdout).toContain('"NOT_APPLICABLE_ON_PUSH"');
      // Introduce a real package resolution requirement only in the isolated copy.
      writeFileSync(
        join(root, "scripts", "report-dependency-review-applicability.mjs"),
        'import "owlapi-uninstalled-negative-fixture";\n',
      );
      const negative = invoke([
        "run",
        "report:dependency-review-applicability",
      ]);
      expect(negative.status).not.toBe(0);
      expect(negative.stderr).toContain("ERR_MODULE_NOT_FOUND");
      expect(existsSync(join(root, "node_modules"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
