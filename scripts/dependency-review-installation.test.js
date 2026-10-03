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

const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8"));

describe("dependency review without repository installation", () => {
  test("the CI dependency-review job retains its commands without npm ci", () => {
    const commands = workflow.jobs.dependency_review.steps
      .map((step) => step.run)
      .filter(Boolean);
    expect(commands).not.toContain("npm ci");
    expect(commands).toContain(
      "npm run workflow:runner-record -- --expected-os Linux --expected-arch X64 --label ubuntu-24.04 --shell bash",
    );
    expect(commands).toContain(
      "npm run workflow:dependency-review-applicability",
    );
  });

  test("the actual npm entry points run without node_modules and detect a new package import", () => {
    const root = mkdtempSync(join(tmpdir(), "owlapi-dependency-review-"));
    try {
      mkdirSync(join(root, "scripts"));
      const manifest = JSON.parse(readFileSync("package.json", "utf8"));
      writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
      for (const name of [
        "record-runner.mjs",
        "assert-workflow-runtime.mjs",
        "report-dependency-review-applicability.mjs",
      ])
        copyFileSync(join("scripts", name), join(root, "scripts", name));
      expect(existsSync(join(root, "node_modules"))).toBe(false);
      const npmCli = process.env.npm_execpath;
      expect(npmCli).toBeTruthy();
      const invoke = (args) =>
        spawnSync(process.execPath, [npmCli, ...args], {
          cwd: root,
          encoding: "utf8",
          timeout: 30000,
          env: {
            ...process.env,
            GITHUB_EVENT_NAME: "push",
            RUNNER_OS: "Linux",
            RUNNER_ARCH: "X64",
            ImageOS: "ubuntu24",
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
      const runner = invoke([
        "run",
        "workflow:runner-record",
        "--",
        "--expected-os",
        "Linux",
        "--expected-arch",
        "X64",
        "--label",
        "ubuntu-24.04",
        "--shell",
        "bash",
        "--output",
        output,
      ]);
      expect(runner.status).toBe(0);
      expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
        schemaVersion: 1,
        requestedLabel: "ubuntu-24.04",
        selectedShell: "bash",
        runtime: { node: process.version, npm: npmVersion.stdout.trim() },
        runner: {
          os: "Linux",
          architecture: "X64",
          imageOS: "ubuntu24",
          imageVersion: "20261001.1",
        },
      });
      const applicability = invoke([
        "run",
        "workflow:dependency-review-applicability",
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
        "workflow:dependency-review-applicability",
      ]);
      expect(negative.status).not.toBe(0);
      expect(negative.stderr).toContain("ERR_MODULE_NOT_FOUND");
      expect(existsSync(join(root, "node_modules"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
