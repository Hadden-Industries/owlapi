import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  parseCatalogueRequirements,
  parseChecklistRows,
} from "./release-gate-catalogue.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));

const readJson = (relativePath) =>
  JSON.parse(
    readFileSync(
      new URL(relativePath, new URL("../", import.meta.url)),
      "utf8",
    ),
  );

const sortedUnique = (values) => [...new Set(values)].sort();

const assertSameIds = (label, expected, actual) => {
  const expectedIds = sortedUnique(expected);
  const actualIds = sortedUnique(actual);
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    const missing = expectedIds.filter((id) => !actualIds.includes(id));
    const unexpected = actualIds.filter((id) => !expectedIds.includes(id));
    throw new Error(
      `${label} differs from the authoritative catalogue; missing=${JSON.stringify(missing)} unexpected=${JSON.stringify(unexpected)}`,
    );
  }
};

const assertUnique = (label, values) => {
  if (values.length !== new Set(values).size) {
    throw new Error(`${label} contains duplicate identities.`);
  }
};

const assertEqualJson = (label, expected, actual) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} differs; expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
    );
  }
};

export const verifyReleaseGates = ({ planMarkdown, registry, schema }) => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validateRegistry = ajv.compile(schema);
  if (!validateRegistry(registry)) {
    throw new Error(
      `Gate registry schema validation failed: ${ajv.errorsText(validateRegistry.errors, { separator: "; " })}`,
    );
  }

  const catalogue = parseCatalogueRequirements(planMarkdown);
  const catalogueIds = catalogue.map(({ requirementId }) => requirementId);
  const checklistRows = parseChecklistRows(planMarkdown);
  const checklistIds = checklistRows.flatMap(
    ({ coveredRequirementIds }) => coveredRequirementIds,
  );
  const registryIds = registry.requirements.map(
    ({ requirementId }) => requirementId,
  );

  if (catalogueIds.length !== new Set(catalogueIds).size) {
    throw new Error(
      "The authoritative catalogue contains duplicate requirement IDs.",
    );
  }

  const catalogueAnchors = catalogue.map(({ sourceAnchor }) => sourceAnchor);
  if (catalogueAnchors.length !== new Set(catalogueAnchors).size) {
    throw new Error(
      "The authoritative catalogue contains duplicate source anchors.",
    );
  }

  const registryById = new Map(
    registry.requirements.map((requirement) => [
      requirement.requirementId,
      requirement,
    ]),
  );
  for (const requirement of catalogue) {
    const registered = registryById.get(requirement.requirementId);
    if (registered?.sourceAnchor !== requirement.sourceAnchor) {
      throw new Error(
        `${requirement.requirementId} source anchor is stale or incorrect.`,
      );
    }
    if (registered.requirementDigest !== requirement.requirementDigest) {
      throw new Error(
        `${requirement.requirementId} requirement digest is stale.`,
      );
    }
  }
  assertSameIds(
    "Implementation-checklist coverage",
    catalogueIds,
    checklistIds,
  );
  assertSameIds("Gate registry", catalogueIds, registryIds);

  for (const requirement of registry.requirements) {
    if (!requirement.requirementId.startsWith(`P${requirement.phase}-`)) {
      throw new Error(
        `${requirement.requirementId} has an inconsistent phase value.`,
      );
    }
  }

  const checklistGateIds = registry.checklistGates.map(({ gateId }) => gateId);
  const parsedChecklistGateIds = checklistRows.map(({ gateId }) => gateId);
  assertUnique("Implementation-checklist gate IDs", parsedChecklistGateIds);
  assertUnique("Registry checklist-gate IDs", checklistGateIds);
  assertSameIds(
    "Registry checklist gates",
    parsedChecklistGateIds,
    checklistGateIds,
  );
  const registeredChecklistById = new Map(
    registry.checklistGates.map((gate) => [gate.gateId, gate]),
  );
  for (const checklistRow of checklistRows) {
    const registered = registeredChecklistById.get(checklistRow.gateId);
    assertEqualJson(
      `${checklistRow.gateId} covered requirements`,
      checklistRow.coveredRequirementIds,
      registered.coveredRequirementIds,
    );
    if (registered.phase !== checklistRow.phase) {
      throw new Error(
        `${checklistRow.gateId} has an inconsistent phase value.`,
      );
    }
    if (registered.rowDigest !== checklistRow.rowDigest) {
      throw new Error(`${checklistRow.gateId} checklist-row digest is stale.`);
    }
  }

  const leafGateIds = registry.leafGates.map(({ gateId }) => gateId);
  assertUnique("Leaf-gate IDs", leafGateIds);
  const referencedLeafGateIds = registry.requirements.flatMap(
    ({ childGateIds }) => childGateIds,
  );
  assertUnique("Top-level child-gate ownership", referencedLeafGateIds);
  assertSameIds(
    "Top-level child-gate ownership",
    leafGateIds,
    referencedLeafGateIds,
  );
  const leafById = new Map(
    registry.leafGates.map((gate) => [gate.gateId, gate]),
  );
  for (const requirement of registry.requirements) {
    const expectedChecklistGateIds = registry.checklistGates
      .filter(({ coveredRequirementIds }) =>
        coveredRequirementIds.includes(requirement.requirementId),
      )
      .map(({ gateId }) => gateId);
    if (expectedChecklistGateIds.length === 0) {
      throw new Error(
        `${requirement.requirementId} has no checklist coverage.`,
      );
    }
    for (const childGateId of requirement.childGateIds) {
      const child = leafById.get(childGateId);
      if (child.ownerRequirementId !== requirement.requirementId) {
        throw new Error(
          `${childGateId} has more than one or an incorrect owner.`,
        );
      }
      if (child.owner !== requirement.owner) {
        throw new Error(
          `${childGateId} has drifted from its accountable owner.`,
        );
      }
      assertEqualJson(
        `${childGateId} checklist coverage`,
        expectedChecklistGateIds,
        child.checklistGateIds,
      );
    }
  }

  const referencedChecklistGateIds = registry.leafGates.flatMap(
    ({ checklistGateIds: ids }) => ids,
  );
  assertSameIds(
    "Leaf-gate checklist ownership",
    checklistGateIds,
    referencedChecklistGateIds,
  );

  const phase19RequirementCount = registryIds.filter((id) =>
    id.startsWith("P19-"),
  ).length;
  const phase20RequirementCount = registryIds.filter((id) =>
    id.startsWith("P20-"),
  ).length;

  return {
    catalogueRequirementCount: catalogueIds.length,
    checklistGateCount: checklistGateIds.length,
    checklistRequirementCount: sortedUnique(checklistIds).length,
    checklistRowCount: checklistRows.length,
    leafGateCount: leafGateIds.length,
    phase19ChecklistRowCount: checklistRows.filter(({ phase }) => phase === 19)
      .length,
    phase20ChecklistRowCount: checklistRows.filter(({ phase }) => phase === 20)
      .length,
    phase19RequirementCount,
    phase20RequirementCount,
    registryRequirementCount: registryIds.length,
  };
};

const run = () => {
  const planMarkdown = readFileSync(
    new URL("../docs/implementation-plan.md", import.meta.url),
    "utf8",
  );
  const registry = readJson("docs/release/gates.json");
  const schema = readJson("docs/release/gates.schema.json");
  const result = verifyReleaseGates({ planMarkdown, registry, schema });
  process.stdout.write(`${JSON.stringify(result)}\n`);
};

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;

if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    run();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

export { REPOSITORY_ROOT };
