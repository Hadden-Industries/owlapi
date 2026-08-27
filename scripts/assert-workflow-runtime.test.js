import { describe, expect, test } from "@jest/globals";

import { assertWorkflowRuntime } from "./assert-workflow-runtime.mjs";

describe("workflow runtime bootstrap", () => {
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
