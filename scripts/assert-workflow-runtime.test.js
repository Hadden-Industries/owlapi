import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "@jest/globals";

import { assertWorkflowRuntime } from "./assert-workflow-runtime.mjs";

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
        "12.0.2",
      ],
      { encoding: "utf8", shell: false },
    );

    expect(command.error).toBeUndefined();
    expect(command.status).toBe(0);
    expect(command.stderr).toBe("");
    expect(JSON.parse(command.stdout)).toEqual({
      node: process.version,
      npm: "12.0.2",
    });
  });

  test("accepts only the exact requested Node and npm pair", () => {
    expect(
      assertWorkflowRuntime({
        expectedNode: "24.19.0",
        expectedNpm: "12.0.2",
        observedNode: "v24.19.0",
        observedNpm: "12.0.2",
      }),
    ).toEqual({ node: "v24.19.0", npm: "12.0.2" });
  });

  test("rejects patch-level drift", () => {
    expect(() =>
      assertWorkflowRuntime({
        expectedNode: "24.19.0",
        expectedNpm: "12.0.2",
        observedNode: "v24.19.1",
        observedNpm: "12.0.2",
      }),
    ).toThrow(/Node v24\.19\.1/u);
  });
});
