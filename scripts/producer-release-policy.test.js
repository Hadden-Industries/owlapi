import { readFileSync } from "node:fs";
import {
  buildProducerReleaseGates,
  PRODUCER_RELEASE_POLICY,
} from "./producer-release-policy.mjs";
const historical = JSON.parse(
  readFileSync(new URL("../docs/release/gates.json", import.meta.url), "utf8"),
);
test("current release graph removes application prerequisites and preserves producer parity/material/security", () => {
  const active = buildProducerReleaseGates(historical);
  const ids = new Set(active.requirements.map((row) => row.requirementId));
  for (const amendment of PRODUCER_RELEASE_POLICY.replacements) {
    expect(ids.has(amendment.historicalRequirementId)).toBe(false);
    if (amendment.requirementId)
      expect(ids.has(amendment.requirementId)).toBe(true);
  }
  for (const row of active.requirements)
    for (const dependency of row.prerequisiteRequirementIds)
      expect(ids.has(dependency)).toBe(true);
  expect(
    active.requirements.find(
      (row) => row.requirementId === "P21-PRODUCER-CHECKPOINT-001",
    ).prerequisiteRequirementIds,
  ).toEqual(["P21-INTEGRATION-001", "P21-PARITY-001", "P21-OWL-CONTRACT-001"]);
  for (const id of [
    "P19-RIGHTS-001",
    "P19-SECURITY-GOVERNANCE-001",
    "P22-JAVA-001",
  ]) {
    const prior = historical.requirements.find(
      (row) => row.requirementId === id,
    );
    expect(
      active.requirements.find((row) => row.requirementId === id)
        .requirementDigest,
    ).toBe(prior.requirementDigest);
  }
  expect(
    active.checklistGates.some((row) =>
      row.coveredRequirementIds.includes("P20-WEBVOWL-DEPENDENCIES-001"),
    ),
  ).toBe(false);
});
test("migration cannot turn old PASS flags into current producer qualification", () => {
  const first = buildProducerReleaseGates(historical);
  const changed = JSON.parse(JSON.stringify(PRODUCER_RELEASE_POLICY));
  changed.replacements[0].obligation += " Changed producer guarantee.";
  expect(
    buildProducerReleaseGates(historical, changed).catalogue.policySha256,
  ).not.toBe(first.catalogue.policySha256);
  changed.replacements.push(changed.replacements[0]);
  expect(() => buildProducerReleaseGates(historical, changed)).toThrow(
    /inventory/,
  );
});
