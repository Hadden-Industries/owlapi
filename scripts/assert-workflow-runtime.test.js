import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "@jest/globals";

import {
  assertWorkflowRuntime,
  findNpmCliCandidates,
  selectNpmCliForVersion,
} from "./assert-workflow-runtime.mjs";

describe("workflow runtime bootstrap", () => {
  test("the command observes npm through Node without requiring a command shell", () => {
    const command = spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("./assert-workflow-runtime.mjs", import.meta.url),
        ),
        "--node",
        process.version.slice(1),
        "--npm",
        "12.2.0",
      ],
      { encoding: "utf8", shell: false },
    );

    expect(command.error).toBeUndefined();
    expect(command.status).toBe(0);
    expect(command.stderr).toBe("");
    expect(JSON.parse(command.stdout)).toEqual({
      node: process.version,
      npm: "12.2.0",
    });
  });

  test.each(["24.21.0", "26.11.1"])(
    "accepts only the exact requested Node %s and npm pair",
    (nodeVersion) => {
      expect(
        assertWorkflowRuntime({
          expectedNode: nodeVersion,
          expectedNpm: "12.2.0",
          observedNode: `v${nodeVersion}`,
          observedNpm: "12.2.0",
        }),
      ).toEqual({ node: `v${nodeVersion}`, npm: "12.2.0" });
    },
  );

  test("finds a Windows global npm CLI beside its PATH shim before the bundled CLI", () => {
    const globalCli = "C:\\npm\\prefix\\node_modules\\npm\\bin\\npm-cli.js";
    const bundledCli = "C:\\node\\node_modules\\npm\\bin\\npm-cli.js";
    const existing = new Set([globalCli, bundledCli]);

    expect(
      findNpmCliCandidates({
        executablePath: "C:\\node\\node.exe",
        pathValue: "C:\\npm\\prefix;C:\\node",
        platform: "win32",
        exists: (candidate) => existing.has(candidate),
      }),
    ).toEqual([globalCli, bundledCli]);
  });

  test("finds the POSIX sibling-lib npm layout without relying on the host OS", () => {
    const npmCli = "/opt/node/lib/node_modules/npm/bin/npm-cli.js";

    expect(
      findNpmCliCandidates({
        executablePath: "/opt/node/bin/node",
        pathValue: "/opt/node/bin:/usr/bin",
        platform: "linux",
        exists: (candidate) => candidate === npmCli,
      }),
    ).toEqual([npmCli]);
  });

  test("selects the exact requested npm version instead of the first existing CLI", () => {
    const bundledCli = "C:\\node\\node_modules\\npm\\bin\\npm-cli.js";
    const globalCli = "C:\\npm\\prefix\\node_modules\\npm\\bin\\npm-cli.js";

    expect(
      selectNpmCliForVersion({
        expectedNpm: "12.2.0",
        candidates: [bundledCli, globalCli],
        observeVersion: (candidate) =>
          candidate === bundledCli ? "11.17.0" : "12.2.0",
      }),
    ).toEqual({ npmCli: globalCli, version: "12.2.0" });
  });

  test("rejects every candidate when none reports the exact npm version", () => {
    expect(() =>
      selectNpmCliForVersion({
        expectedNpm: "12.2.0",
        candidates: ["bundled-npm", "global-npm"],
        observeVersion: (candidate) =>
          candidate === "bundled-npm" ? "11.17.0" : "12.0.1",
      }),
    ).toThrow(/11\.17\.0.*12\.0\.1/iu);
  });

  test("rejects patch-level drift", () => {
    expect(() =>
      assertWorkflowRuntime({
        expectedNode: "24.21.0",
        expectedNpm: "12.2.0",
        observedNode: "v24.19.1",
        observedNpm: "12.2.0",
      }),
    ).toThrow(/Node v24\.19\.1/u);
  });
});
