import { readFile } from "node:fs/promises";
import { parse } from "yaml";

test("required canonical CI builds the pinned Java reference and reconciles all July sources", async () => {
  const workflow = parse(
    await readFile(
      new URL("../../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    ),
  );
  const corpus = JSON.parse(
    await readFile(
      new URL("./universal-ontology-july-2026.json", import.meta.url),
      "utf8",
    ),
  );
  const java = JSON.parse(
    await readFile(new URL("./pinned-version.json", import.meta.url), "utf8"),
  );
  expect(workflow.jobs.required.needs).toContain("source_canonical");
  const steps = workflow.jobs.source_canonical.steps;
  const checkout = (repository) =>
    steps.find((step) => step.with?.repository === repository);
  expect(checkout("Hadden-Industries/universal-ontology")).toMatchObject({
    with: { ref: corpus.revision, "persist-credentials": false },
  });
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
  const gate = steps.find(({ id }) => id === "july_qualification");
  expect(gate).toMatchObject({
    env: {
      OWLAPI_REFERENCE_CHECKOUT: "${{ github.workspace }}/.release/java-owlapi",
    },
  });
  expect(gate.if).toBeUndefined();
  expect(gate["continue-on-error"]).toBeUndefined();
  expect(gate.run).toContain(
    '--ontology-repository "$GITHUB_WORKSPACE/.release/universal-ontology"',
  );
  expect(gate.run.match(/npm run compare:java-js -- (\w+)/gu)).toEqual(
    ["prepare", "run", "verify"].map(
      (action) => "npm run compare:java-js -- " + action,
    ),
  );
  const stagingIndex = steps.findIndex(({ id }) => id === "july_diagnostics");
  expect(stagingIndex).toBeGreaterThan(steps.indexOf(gate));
  expect(steps[stagingIndex]).toMatchObject({
    if: "${{ !cancelled() }}",
    env: { OWLAPI_DIAGNOSTIC_PATH: ".release/july-qualification" },
  });
  expect(steps[stagingIndex + 1]).toMatchObject({
    if: "${{ !cancelled() && steps.july_diagnostics.outcome == 'success' }}",
    with: { path: "${{ steps.july_diagnostics.outputs.path }}" },
  });
});
