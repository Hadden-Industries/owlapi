import { readFile } from "node:fs/promises";
import { parse } from "yaml";

test("required Node 24 CI builds the pinned Java reference and reconciles all July sources", async () => {
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
  expect(workflow.jobs.required.needs).toContain("source_node_24");
  const steps = workflow.jobs.source_node_24.steps;
  const checkout = (repository) =>
    steps.find((step) => step.with?.repository === repository);
  expect(checkout("Hadden-Industries/universal-ontology")).toMatchObject({
    with: { ref: corpus.revision, "persist-credentials": false },
  });
  expect(checkout("owlcs/owlapi")).toMatchObject({
    with: { ref: java.sourceRevision, "persist-credentials": false },
  });
  expect(
    steps.some(({ run }) =>
      run?.includes("package dependency:build-classpath"),
    ),
  ).toBe(true);
  const gate = steps.find(({ run }) =>
    run?.startsWith("npm run test:universal-ontology --"),
  );
  expect(gate).toMatchObject({
    env: {
      OWLAPI_REFERENCE_CHECKOUT: "${{ github.workspace }}/.release/java-owlapi",
    },
  });
  expect(gate.if).toBeUndefined();
  expect(gate["continue-on-error"]).toBeUndefined();
  expect(gate.run).toContain(
    "--ontology-repository .release/universal-ontology",
  );
  expect(
    steps.some(
      (step) =>
        step.with?.path === ".release/july-qualification" &&
        step.if === "${{ !cancelled() }}",
    ),
  ).toBe(true);
});
