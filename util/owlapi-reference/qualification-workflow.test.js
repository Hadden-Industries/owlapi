import { readFile } from "node:fs/promises";
import { parse } from "yaml";

const readYaml = async (relativePath) =>
  parse(await readFile(new URL(relativePath, import.meta.url), "utf8"));

test("CI and release prepare pinned publisher inputs through the shared comparison runner", async () => {
  const workflows = await Promise.all([
    readYaml("../../.github/workflows/ci.yml"),
    readYaml("../../.github/workflows/release.yml"),
  ]);
  for (const workflow of workflows) {
    const steps = workflow.jobs.source_canonical.steps;
    const gate = steps.find(
      ({ id }) => id === "universal_ontology_qualification",
    );
    expect(
      gate.run.split("\n").find((line) => line.includes("-- prepare ")),
    ).toBe('npm run compare:java-js -- prepare "${suite[@]}"');
    expect(gate.run).toContain("/.release/comparison-cache");
    expect(gate.run).not.toContain("--ontology-repository");
    expect(
      steps.some(({ uses }) => uses?.includes("checkout-universal-ontology")),
    ).toBe(false);
  }
});

test("required canonical CI builds the pinned Java reference and compares the Universal Ontology", async () => {
  const workflow = await readYaml("../../.github/workflows/ci.yml");
  const java = JSON.parse(
    await readFile(new URL("./pinned-version.json", import.meta.url), "utf8"),
  );
  expect(workflow.jobs.required.needs).toContain("source_canonical");
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
  const gate = steps.find(
    ({ id }) => id === "universal_ontology_qualification",
  );
  expect(gate).toMatchObject({
    env: {
      OWLAPI_REFERENCE_CHECKOUT: "${{ github.workspace }}/.release/java-owlapi",
    },
  });
  expect(gate.if).toBeUndefined();
  expect(gate["continue-on-error"]).toBeUndefined();
  expect(gate.run).toContain("--suite universal-ontology");
  expect(gate.run.match(/npm run compare:java-js -- (\w+)/gu)).toEqual(
    ["prepare", "run", "verify"].map(
      (action) => "npm run compare:java-js -- " + action,
    ),
  );
  const stagingIndex = steps.findIndex(
    ({ id }) => id === "universal_ontology_diagnostics",
  );
  expect(stagingIndex).toBeGreaterThan(steps.indexOf(gate));
  expect(steps[stagingIndex]).toMatchObject({
    if: "${{ !cancelled() }}",
    env: {
      OWLAPI_DIAGNOSTIC_PATH: ".release/universal-ontology-qualification",
    },
  });
  expect(steps[stagingIndex + 1]).toMatchObject({
    if: "${{ !cancelled() && steps.universal_ontology_diagnostics.outcome == 'success' }}",
    with: { path: "${{ steps.universal_ontology_diagnostics.outputs.path }}" },
  });
});
