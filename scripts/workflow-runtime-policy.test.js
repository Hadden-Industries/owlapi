import { readFileSync } from "node:fs";
import { parse } from "yaml";
import {
  projectWorkflowRuntime,
  checkWorkflowRuntimeProjections,
} from "./workflow-runtime-policy.mjs";

describe("closed runtime projections", () => {
  it("keeps the checked-in workflow runtime projection unchanged", () => {
    expect(checkWorkflowRuntimeProjections()).toEqual([]);
  });

  it("reports drift without rewriting and writes only the declared scalar", () => {
    const source =
      "permissions: {}\njobs:\n  test:\n    name: Test\n    steps:\n      - run: |\n          npm install --global npm@0.0.0\n          echo unchanged\n        shell: bash\n";
    const projections = [
      {
        path: ["jobs", "test", "steps", 0, "run"],
        template: "npm install --global npm@{{runtime:npm}}\necho unchanged\n",
      },
    ];
    const checked = projectWorkflowRuntime(source, projections);
    expect(checked.source).toBe(source);
    expect(checked.drift).toHaveLength(1);
    const written = projectWorkflowRuntime(source, projections, {
      write: true,
    });
    const expected = parse(source);
    expected.jobs.test.steps[0].run =
      "npm install --global npm@12.2.0\necho unchanged\n";
    expect(parse(written.source)).toEqual(expected);
    expect(projectWorkflowRuntime(written.source, projections).drift).toEqual(
      [],
    );
  });

  it("rejects missing jobs and unapproved permission projections", () => {
    expect(() =>
      projectWorkflowRuntime("jobs: {}\n", [
        {
          path: ["jobs", "missing", "name"],
          template: "Node {{runtime:node.24}}",
        },
      ]),
    ).toThrow("Missing runtime projection");
    expect(() =>
      projectWorkflowRuntime("permissions: {}\n", [
        { path: ["permissions"], template: "{}" },
      ]),
    ).toThrow("Unapproved runtime projection");
  });

  it("rejects a substituted runtime in real workflow YAML", () => {
    const source = readFileSync(
      new URL("../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    );
    const drift = checkWorkflowRuntimeProjections({
      "ci.yml": source.replace(
        'node-version: "24.21.0"',
        'node-version: "24.21.1"',
      ),
    });
    expect(
      drift.some((message) => message.includes("runtime projection drift")),
    ).toBe(true);
  });
});
