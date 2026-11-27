import { readFile } from "node:fs/promises";
import { parse } from "yaml";

const readYaml = async (relativePath) =>
  parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));

test("CI and release require the same scoped ontology comparison and retain its results", async () => {
  const [ci, release] = await Promise.all([
    readYaml("../../.github/workflows/ci.yml"),
    readYaml("../../.github/workflows/release.yml"),
  ]);
  expect(ci.jobs.required.needs).toContain("source_canonical");
  expect(release.jobs.candidate.needs).toContain("source_canonical");
  for (const workflow of [ci, release]) {
    const steps = workflow.jobs.source_canonical.steps;
    const gate = steps.find(({ id }) => id === "ontology_comparison");
    expect(gate).toMatchObject({
      uses: "./.github/actions/compare-ontology-fixtures",
      with: {
        suite: "universal-ontology",
        profile: "normative-v1",
        "parsing-mode": "compatible",
      },
    });
    expect(gate.if).toBeUndefined();
    expect(gate["continue-on-error"]).toBeUndefined();
    const migration = steps[steps.indexOf(gate) + 1];
    expect(migration).toMatchObject({
      id: "comparison_migration",
      run: 'node scripts/verify-comparison-migration.mjs --jest "$GITHUB_WORKSPACE/.release/java-qualification/jest.json"',
    });
    expect(migration.if).toBeUndefined();
    expect(migration["continue-on-error"]).toBeUndefined();
    const stagingIndex = steps.findIndex(
      ({ id }) => id === "ontology_comparison_diagnostics",
    );
    expect(stagingIndex).toBeGreaterThan(steps.indexOf(migration));
    expect(steps[stagingIndex]).toMatchObject({
      if: "${{ !cancelled() }}",
      env: { OWLAPI_DIAGNOSTIC_PATH: ".release/ontology-comparison" },
    });
    expect(steps[stagingIndex + 1]).toMatchObject({
      if: "${{ !cancelled() && steps.ontology_comparison_diagnostics.outcome == 'success' }}",
      with: {
        name: "ontology-comparison-${{ github.run_attempt }}",
        path: "${{ steps.ontology_comparison_diagnostics.outputs.path }}",
      },
    });
  }
});

test("the shared fixture action prepares the selected inputs and compares them offline", async () => {
  const action = await readYaml(
    "../../.github/actions/compare-ontology-fixtures/action.yml",
  );
  expect(action.runs.using).toBe("composite");
  const [step] = action.runs.steps;
  expect(step.env).toEqual({
    OWLAPI_COMPARISON_SUITE: "${{ inputs.suite }}",
    OWLAPI_COMPARISON_PROFILE: "${{ inputs.profile }}",
    OWLAPI_COMPARISON_PARSING_MODE: "${{ inputs.parsing-mode }}",
  });
  expect(step.run).toContain('selection=(--suite "$OWLAPI_COMPARISON_SUITE"');
  expect(step.run).toContain(
    '--cache "$GITHUB_WORKSPACE/.release/comparison-cache"',
  );
  expect(step.run).toContain(
    'output="$GITHUB_WORKSPACE/.release/ontology-comparison"',
  );
  expect(step.run).not.toMatch(/--reference-(?:checkout|distribution)/u);
  expect(
    step.run.split("\n").filter((line) => line.startsWith("npm ")),
  ).toEqual([
    'npm run compare:java-js -- prepare "${selection[@]}"',
    'npm run compare:java-js -- run "${selection[@]}" --offline --output "$output"',
    'npm run compare:java-js -- verify "${selection[@]}" --offline --output "$output"',
  ]);
});

test("required canonical CI builds the pinned Java reference for the live Java suites", async () => {
  const workflow = await readYaml("../../.github/workflows/ci.yml");
  const java = JSON.parse(
    await readFile(new URL("./pinned-version.json", import.meta.url), "utf8"),
  );
  const steps = workflow.jobs.source_canonical.steps;
  const checkout = (repository) =>
    steps.find((step) => step.with?.repository === repository);
  expect(checkout("owlcs/owlapi")).toMatchObject({
    with: { ref: java.sourceRevision, "persist-credentials": false },
  });
  const materialization = steps.filter(
    ({ run }) => run === "node scripts/java-reference-command.mjs build",
  );
  expect(materialization).toHaveLength(1);
  expect(materialization[0].if).toBeUndefined();
  expect(materialization[0]["continue-on-error"]).toBeUndefined();
  const liveSuite = steps.find(({ run }) =>
    run?.includes("npm test -- --runInBand --json"),
  );
  expect(liveSuite.env.OWLAPI_REFERENCE_CHECKOUT).toBe(
    "${{ github.workspace }}/.release/java-owlapi",
  );
  expect(liveSuite.if).toBeUndefined();
  expect(liveSuite["continue-on-error"]).toBeUndefined();
});
