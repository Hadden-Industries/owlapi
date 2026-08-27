import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { verifyReleaseGates } from "./verify-release-gates.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const readJson = (relativePath) =>
  JSON.parse(
    readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"),
  );
const cloneJson = (value) => JSON.parse(JSON.stringify(value));
const planMarkdown = readFileSync(
  new URL("../docs/implementation-plan.md", import.meta.url),
  "utf8",
);
const registry = readJson("docs/release/gates.json");
const schema = readJson("docs/release/gates.schema.json");

describe("release-gate control", () => {
  it("reconciles every authoritative Phase 19 and Phase 20 requirement", () => {
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
        catalogueRequirementCount: 44,
        checklistGateCount: 111,
        checklistRequirementCount: 44,
        checklistRowCount: 111,
        leafGateCount: 44,
        phase19ChecklistRowCount: 93,
        phase20ChecklistRowCount: 18,
        phase19RequirementCount: 20,
        phase20RequirementCount: 24,
        registryRequirementCount: 44,
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
});
