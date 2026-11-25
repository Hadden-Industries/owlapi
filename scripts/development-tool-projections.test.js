import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ACTIONLINT_SELECTION,
  BEARTYPE_VERSION,
  pinnedRequirement,
  SCANCODE_VERSION,
} from "./development-tool-policy.mjs";
import { MACOS, macosRunner } from "./macos-runner.mjs";
import { CI_RUNTIME, projectRuntimeText } from "./runtime-policy.mjs";
import { projectWorkflowRuntime } from "./workflow-runtime-policy.mjs";
import { SCANCODE_TOOL } from "../util/third-party-evidence/scancode.mjs";

describe("development tool version authorities", () => {
  test("reads each exact pin from its native Python project", () => {
    expect(SCANCODE_TOOL.version).toBe(SCANCODE_VERSION);
    for (const version of [SCANCODE_VERSION, BEARTYPE_VERSION])
      expect(version).toMatch(/^\d+\.\d+(?:\.\d+)?$/u);
    const root = mkdtempSync(join(tmpdir(), "owlapi-tool-pins-"));
    try {
      writeFileSync(
        join(root, "single.toml"),
        'dependencies = ["Example_Tool==1.2.3", "other>=2"]\n',
      );
      expect(pinnedRequirement("single.toml", "example-tool", root)).toBe(
        "1.2.3",
      );
      expect(() => pinnedRequirement("single.toml", "other", root)).toThrow(
        "expected exactly one other== requirement",
      );
      writeFileSync(
        join(root, "duplicate.toml"),
        'a = ["tool==1.0.0"]\nb = ["tool==2.0.0"]\n',
      );
      expect(() => pinnedRequirement("duplicate.toml", "tool", root)).toThrow(
        "expected exactly one tool== requirement",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("derives the actionlint archive name from its version", () => {
    expect(ACTIONLINT_SELECTION.assets.linux.file).toBe(
      `actionlint_${ACTIONLINT_SELECTION.version}_linux_amd64.tar.gz`,
    );
  });

  test("resolves tool and macOS selectors only when requested", () => {
    expect(
      projectRuntimeText(
        "{{runtime:scancodeVersion}} {{runtime:actionlintVersion}} {{runtime:actionlintLinuxSha256}} {{runtime:macosRunner}}",
      ),
    ).toBe(
      `${SCANCODE_VERSION} ${ACTIONLINT_SELECTION.version} ${ACTIONLINT_SELECTION.assets.linux.sha256} ${MACOS.label}`,
    );
    const withoutMacos = {
      ...CI_RUNTIME,
      consumerPlatforms: CI_RUNTIME.consumerPlatforms.filter(
        ({ os }) => os !== "darwin",
      ),
    };
    expect(projectRuntimeText("{{runtime:npm}}", withoutMacos)).toBe(
      CI_RUNTIME.npm,
    );
    expect(() => macosRunner(withoutMacos)).toThrow(
      "Expected one macOS runner",
    );
    expect(() => projectRuntimeText("{{runtime:unknownTool}}")).toThrow(
      "Unknown runtime selector",
    );
  });

  test("rewrites stale tool scalars, including step environment values", () => {
    const source = [
      "jobs:",
      "  evidence:",
      "    runs-on: macos-1",
      "    steps:",
      "      - env:",
      "          SCANCODE_COMMAND: tools/scancode-0.0.1",
      "        run: |",
      "          install actionlint 0.0.1",
      "",
    ].join("\n");
    const projections = [
      {
        path: ["jobs", "evidence", "runs-on"],
        template: "{{runtime:macosRunner}}",
      },
      {
        path: ["jobs", "evidence", "steps", 0, "env", "SCANCODE_COMMAND"],
        template: "tools/scancode-{{runtime:scancodeVersion}}",
      },
      {
        path: ["jobs", "evidence", "steps", 0, "run"],
        template: "install actionlint {{runtime:actionlintVersion}}\n",
      },
    ];
    const { source: projected, drift } = projectWorkflowRuntime(
      source,
      projections,
      { write: true },
    );
    expect(drift).toHaveLength(3);
    expect(projected).toContain(`runs-on: ${MACOS.label}`);
    expect(projected).toContain(
      `SCANCODE_COMMAND: tools/scancode-${SCANCODE_VERSION}`,
    );
    expect(projected).toContain(
      `install actionlint ${ACTIONLINT_SELECTION.version}`,
    );
    expect(projectWorkflowRuntime(projected, projections).drift).toEqual([]);
  });

  test("rejects an unmanaged macOS runner label", () => {
    expect(() =>
      projectWorkflowRuntime("jobs:\n  x:\n    runs-on: macos-15\n", []),
    ).toThrow("Unmanaged macOS selector");
  });
});
