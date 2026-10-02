import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { verifyReleaseGates } from "./verify-release-gates.mjs";
import { readReleasePlans } from "./release-gate-catalogue.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (relativePath) =>
  JSON.parse(
    readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"),
  );
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const planMarkdown = readReleasePlans();
const registry = readJson("docs/release/gates.json");
const schema = readJson("docs/release/gates.schema.json");

describe("release-gate control", () => {
  it("reconciles the first-release and parity/lifecycle requirements", () => {
    // Exercise the same executable boundary used by local development and CI so
    // this test cannot pass merely because an internal parser helper is mocked.
    const result = spawnSync(
      process.execPath,
      ["scripts/verify-release-gates.mjs", "--json"],
      {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      expect.objectContaining({
        catalogueRequirementCount: 59,
        checklistGateCount: 126,
        checklistRequirementCount: 59,
        checklistRowCount: 126,
        leafGateCount: 59,
        phase19ChecklistRowCount: 93,
        phase20ChecklistRowCount: 18,
        phase19RequirementCount: 20,
        phase20RequirementCount: 24,
        phase21RequirementCount: 4,
        phase22RequirementCount: 11,
        registryRequirementCount: 59,
      }),
    );
  });

  it("rejects a stale requirement digest", () => {
    const staleRegistry = cloneJson(registry);
    staleRegistry.requirements[0].requirementDigest = `sha256:${"0".repeat(64)}`;

    expect(() =>
      verifyReleaseGates({ planMarkdown, registry: staleRegistry, schema }),
    ).toThrow(/P19-SCOPE-001 requirement digest is stale/u);
  });

  it("requires every catalogue requirement to have an accountable owner", () => {
    const unownedRegistry = cloneJson(registry);
    delete unownedRegistry.requirements[0].owner;

    expect(() =>
      verifyReleaseGates({ planMarkdown, registry: unownedRegistry, schema }),
    ).toThrow(/Gate registry schema validation failed/u);
  });

  it.each(["P21-PARITY-001", "P22-STRICT-RDF-001"])(
    "rejects changed acceptance wording for %s until regenerated",
    (requirementId) => {
      const changedPlan = planMarkdown.replace(
        `**\`${requirementId}\` —`,
        `**\`${requirementId}\` — Changed acceptance:`,
      );
      expect(changedPlan).not.toBe(planMarkdown);
      expect(() =>
        verifyReleaseGates({
          planMarkdown: changedPlan,
          registry,
          schema,
        }),
      ).toThrow(
        new RegExp(`${requirementId} requirement digest is stale`, "u"),
      );
    },
  );

  it("cannot detach lifecycle acceptance from the completed parity checkpoint", () => {
    const invalid = cloneJson(registry);
    invalid.requirements.find(
      ({ phase }) => phase === 22,
    ).prerequisiteRequirementIds = [];
    expect(() =>
      verifyReleaseGates({ planMarkdown, registry: invalid, schema }),
    ).toThrow(/Phase 21 predecessor differs/u);
  });

  it("cannot accept the parity checkpoint without its three prerequisite results", () => {
    const invalid = cloneJson(registry);
    invalid.requirements.find(
      ({ requirementId }) => requirementId === "P21-CHECKPOINT-001",
    ).prerequisiteRequirementIds = [];
    expect(() =>
      verifyReleaseGates({ planMarkdown, registry: invalid, schema }),
    ).toThrow(/Phase 21 predecessor differs/u);
  });
});
