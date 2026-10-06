/** Versioned current producer policy; historical catalogues/results retain their meaning. */
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { sourceFingerprint } from "./consumer-source-snapshot.mjs";
export const PRODUCER_RELEASE_POLICY = JSON.parse(
  readFileSync(
    new URL("../docs/release/producer-release-policy.json", import.meta.url),
    "utf8",
  ),
);

export const buildProducerReleaseGates = (
  historical,
  policy = PRODUCER_RELEASE_POLICY,
) => {
  if (
    historical.schemaVersion !== 1 ||
    policy.schemaVersion !== 2 ||
    !Array.isArray(policy.replacements)
  )
    throw new Error("Unsupported release policy version.");
  const byId = new Map(
    policy.replacements.map((row) => [row.historicalRequirementId, row]),
  );
  if (
    byId.size !== policy.replacements.length ||
    [...byId.keys()].some(
      (id) => !historical.requirements.some((row) => row.requirementId === id),
    )
  )
    throw new Error("Invalid historical release migration inventory.");
  const mapId = (id) => (byId.has(id) ? byId.get(id).requirementId : id);
  const mappedIds = historical.requirements
    .map((row) => mapId(row.requirementId))
    .filter(Boolean);
  if (new Set(mappedIds).size !== mappedIds.length)
    throw new Error("Duplicate current producer requirements.");
  const requirements = historical.requirements.flatMap((row) => {
    const amendment = byId.get(row.requirementId);
    if (amendment?.requirementId === null) return [];
    const requirementId = mapId(row.requirementId);
    const current = {
      ...row,
      requirementId,
      prerequisiteRequirementIds: row.prerequisiteRequirementIds
        .map(mapId)
        .filter(Boolean),
      childGateIds: [`${requirementId}-VERIFY`],
    };
    if (amendment) {
      if (
        !/^P(?:19|20|21|22)-[A-Z0-9-]+-001$/u.test(requirementId) ||
        !amendment.obligation ||
        !amendment.downstreamOwner
      )
        throw new Error("Incomplete producer/downstream obligation split.");
      current.sourceAnchor = requirementId.toLowerCase();
      current.requirementDigest = `sha256:${sourceFingerprint(amendment)}`;
      current.owner = "PACKAGE_MAINTAINER";
      current.verification = {
        kind: "HYBRID",
        command: `npm run qualify:release -- --requirement ${requirementId}`,
      };
      current.evidence = {
        recordPath: "docs/provenance/releases/<version>/gates.json",
        jsonPointer: `/requirements/${requirementId}`,
      };
    }
    return [current];
  });
  const checklistGates = historical.checklistGates.flatMap((row) => {
    const coveredRequirementIds = row.coveredRequirementIds
      .map(mapId)
      .filter(Boolean);
    if (!coveredRequirementIds.length) return [];
    const changed = !isDeepStrictEqual(
      row.coveredRequirementIds,
      coveredRequirementIds,
    );
    return [
      {
        ...row,
        coveredRequirementIds,
        rowDigest: changed
          ? `sha256:${sourceFingerprint({ historicalRowDigest: row.rowDigest, coveredRequirementIds, policySha256: sourceFingerprint(policy) })}`
          : row.rowDigest,
      },
    ];
  });
  const leafGates = requirements.map((row) => ({
    gateId: row.childGateIds[0],
    ownerRequirementId: row.requirementId,
    checklistGateIds: checklistGates
      .filter((gate) => gate.coveredRequirementIds.includes(row.requirementId))
      .map((gate) => gate.gateId),
    ...Object.fromEntries(
      [
        "owner",
        "applicability",
        "blocking",
        "verification",
        "evidence",
        "permittedFinalResults",
        "failureClasses",
        "waiverPolicy",
      ].map((key) => [key, row[key]]),
    ),
  }));
  return {
    $schema: "./producer-gates.schema.json",
    schemaVersion: 2,
    catalogue: {
      historicalCatalogueSha256: sourceFingerprint(historical),
      policySha256: sourceFingerprint(policy),
      sourcePaths: [
        ...historical.catalogue.sourcePaths,
        "docs/release/producer-release-policy.json",
      ],
    },
    policy: historical.policy,
    requirements,
    checklistGates,
    leafGates,
  };
};
