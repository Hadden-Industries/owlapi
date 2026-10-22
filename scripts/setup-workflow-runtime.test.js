import {
  selectWorkflowReference,
  validateSetupInputs,
  bootstrapTimeout,
} from "./setup-workflow-runtime.mjs";

// Independent synthetic selections; these are not editable current runtime declarations.
const policy = {
  node: { 22: "22.23.3", 24: "24.22.0" },
  canonicalNodeMajor: "24",
  npm: "12.2.0",
};

describe("cold workflow setup", () => {
  it("selects canonical and family references without the installed project graph", () => {
    expect(selectWorkflowReference(policy)).toEqual({
      node: "24.22.0",
      npm: "12.2.0",
      canonical: true,
    });
    expect(selectWorkflowReference(policy, "22")).toEqual({
      node: "22.23.3",
      npm: "12.2.0",
      canonical: false,
    });
    expect(() => selectWorkflowReference(policy, "25")).toThrow();
    expect(() =>
      selectWorkflowReference({ ...policy, npm: "latest" }),
    ).toThrow();
  });
  it("keeps runtime-only and conditional seed phases explicit", () => {
    expect(validateSetupInputs({ phase: "runtime" }).install).toBe("none");
    expect(
      validateSetupInputs({ phase: "npm", install: "locked-no-scripts" })
        .install,
    ).toBe("locked-no-scripts");
    for (const input of [
      { phase: "unknown" },
      { install: "ci" },
      { phase: "runtime", install: "locked-no-scripts" },
      { "verify-runtime": "maybe" },
      { "registry-url": "https://example.invalid" },
    ]) {
      expect(() => validateSetupInputs(input)).toThrow();
    }
  });
  it("retains finite operation deadlines", () => {
    expect(bootstrapTimeout("10")).toBe(600000);
    for (const value of ["0", "61", "1; exit 0", "Infinity"])
      expect(() => bootstrapTimeout(value)).toThrow();
  });
});
