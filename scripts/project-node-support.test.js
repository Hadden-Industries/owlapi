import { readFileSync } from "node:fs";
import {
  projectNodeSupport,
  checkNodeSupportProjections,
} from "./project-node-support.mjs";
import {
  CI_RUNTIME,
  validateRuntimePolicy,
  projectRuntimeText,
} from "./runtime-policy.mjs";

describe("one runtime version authority", () => {
  it("keeps current declarations, production dependency engines and lock metadata aligned", () => {
    expect(checkNodeSupportProjections()).toEqual([]);
  });

  it("projects a policy edit into consumers, references and prose without rewriting unrelated data", () => {
    const files = Object.fromEntries(
      [
        "package.json",
        ".node-version",
        "README.md",
        "CONTRIBUTING.md",
        "docs/release/producer-release-policy.json",
        ".github/workflows/ci.yml",
      ].map((path) => [
        path,
        readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
      ]),
    );
    const policy = {
      ...CI_RUNTIME,
      minimums: ["22.1.0", "24.1.0", "26.0.0"],
      node: { 22: "22.24.0", 24: "24.23.0", 26: "26.13.0" },
      npm: "12.3.0",
    };
    const projected = projectNodeSupport(files, policy);
    const before = JSON.parse(files["package.json"]),
      after = JSON.parse(projected["package.json"]);
    expect(after.engines.node).toBe(">=22.1.0");
    expect(after.dependencies).toEqual(before.dependencies);
    expect(after.devDependencies).toEqual(before.devDependencies);
    expect(after.devEngines.packageManager).toEqual(
      before.devEngines.packageManager,
    );
    expect(projected[".node-version"]).toBe("24.23.0\n");
    expect(projected["README.md"]).toContain(
      "Node 24.23.0 is the selected canonical package producer.",
    );
    // A frozen historical observation must not be rewritten as a current declaration.
    expect(projected["README.md"]).toContain(
      "Node 26.11.1 passed blocking source",
    );
    expect(projected["CONTRIBUTING.md"]).toContain("select exact npm 12.3.0");
    expect(projected[".github/workflows/ci.yml"]).toContain(
      "name: CI / Ubuntu / Node 24.23.0",
    );
    expect(projected["docs/release/producer-release-policy.json"]).toContain(
      "canonical Node 24.23.0",
    );
    expect(projectNodeSupport(projected, policy)).toEqual(projected);
  });

  it("rejects malformed policy and missing declarations instead of guessing", () => {
    for (const policy of [
      { ...CI_RUNTIME, minimums: ["22.0.0", "22.1.0"] },
      { ...CI_RUNTIME, minimums: ["22.0.0-rc.1", "24.0.0", "26.0.0"] },
      { ...CI_RUNTIME, canonicalNodeMajor: "25" },
      { ...CI_RUNTIME, npm: null },
    ])
      expect(() => validateRuntimePolicy(policy)).toThrow();
    expect(() =>
      projectNodeSupport({ "README.md": "No generated block\n" }),
    ).toThrow();
    expect(() =>
      projectNodeSupport({ "unapproved.txt": "unchanged\n" }),
    ).toThrow();
    expect(() => projectRuntimeText("{{runtime:unknown}}")).toThrow();
  });
});
