import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  parseCatalogueRequirements,
  parseChecklistRows,
} from "./release-gate-catalogue.mjs";

const REPOSITORY_ROOT = new URL("../", import.meta.url);
const REGISTRY_URL = new URL("docs/release/gates.json", REPOSITORY_ROOT);
const ALL_FAILURE_CLASSES = Object.freeze([
  "PRODUCT_FAILURE",
  "CONTROL_FAILURE",
  "EXTERNAL_BLOCKED",
]);

const explicitOwnerByRequirement = Object.freeze({
  "P19-HISTORY-001": "HISTORY_CUSTODIAN",
  "P19-REPOSITORY-001": "REPOSITORY_ADMINISTRATOR",
  "P19-RIGHTS-001": "RIGHTS_REVIEWER",
  "P19-DEPENDENCIES-001": "DEPENDENCY_MAINTAINER",
  "P19-SECURITY-GOVERNANCE-001": "SECURITY_MAINTAINER",
  "P19-TOOLCHAIN-001": "RELEASE_ENGINEER",
  "P19-CI-CONTROLS-001": "RELEASE_ENGINEER",
  "P19-EVIDENCE-001": "RELEASE_CUSTODIAN",
  "P19-GATES-001": "RELEASE_CUSTODIAN",
  "P19-NAMESPACE-001": "RELEASE_CUSTODIAN",
  "P19-PUBLICATION-001": "RELEASE_CUSTODIAN",
  "P19-PUBLIC-VERIFICATION-001": "RELEASE_CUSTODIAN",
  "P19-WEBVOWL-001": "CONSUMER_MAINTAINER",
  "P19-CUSTODY-001": "RELEASE_CUSTODIAN",
  "P19-CHECKPOINT-001": "RELEASE_CUSTODIAN",
  "P20-RELEASE-001": "RELEASE_CUSTODIAN",
  "P20-PATH-001": "RELEASE_CUSTODIAN",
  "P20-CHANNEL-001": "RELEASE_CUSTODIAN",
  "P20-EVIDENCE-001": "RELEASE_CUSTODIAN",
  "P20-PROVENANCE-001": "RELEASE_CUSTODIAN",
  "P20-CI-001": "RELEASE_ENGINEER",
  "P20-LATE-TAG-001": "RELEASE_CUSTODIAN",
  "P20-MANUAL-001": "RELEASE_CUSTODIAN",
  "P20-UNTRUSTED-001": "RELEASE_ENGINEER",
  "P20-TOOLCHAIN-001": "RELEASE_ENGINEER",
  "P20-DEPENDENCIES-001": "DEPENDENCY_MAINTAINER",
  "P20-WEBVOWL-001": "CONSUMER_MAINTAINER",
  "P20-WEBVOWL-DEPENDENCIES-001": "CONSUMER_MAINTAINER",
  "P20-BACKUP-001": "RELEASE_CUSTODIAN",
  "P20-GOVERNANCE-001": "SECURITY_MAINTAINER",
  "P20-FUTURE-001": "PACKAGE_MAINTAINER",
});

const verificationKindByRequirement = Object.freeze({
  "P19-HISTORY-001": "HUMAN_REVIEW",
  "P19-REPOSITORY-001": "EXTERNAL_OBSERVATION",
  "P19-RIGHTS-001": "HUMAN_REVIEW",
  "P19-DOCUMENTATION-001": "HYBRID",
  "P19-SECURITY-GOVERNANCE-001": "HYBRID",
  "P19-EVIDENCE-001": "HYBRID",
  "P19-NAMESPACE-001": "EXTERNAL_OBSERVATION",
  "P19-PUBLICATION-001": "EXTERNAL_OBSERVATION",
  "P19-PUBLIC-VERIFICATION-001": "HYBRID",
  "P19-WEBVOWL-001": "HYBRID",
  "P19-CUSTODY-001": "HUMAN_REVIEW",
  "P19-CHECKPOINT-001": "HUMAN_REVIEW",
  "P20-RELEASE-001": "HYBRID",
  "P20-PATH-001": "HUMAN_REVIEW",
  "P20-CHANNEL-001": "HYBRID",
  "P20-EVIDENCE-001": "HYBRID",
  "P20-PROVENANCE-001": "HYBRID",
  "P20-DOCUMENTATION-001": "HYBRID",
  "P20-LATE-TAG-001": "HYBRID",
  "P20-MANUAL-001": "HYBRID",
  "P20-WEBVOWL-001": "HYBRID",
  "P20-WEBVOWL-DEPENDENCIES-001": "HYBRID",
  "P20-BACKUP-001": "HUMAN_REVIEW",
  "P20-GOVERNANCE-001": "HYBRID",
});

const phaseCheckpoint = (requirementId) => {
  if (requirementId.startsWith("P20-")) {
    return "20";
  }
  if (requirementId === "P19-HISTORY-001") {
    return "19A";
  }
  if (["P19-REPOSITORY-001", "P19-RIGHTS-001"].includes(requirementId)) {
    return "19B";
  }
  if (
    [
      "P19-NAMESPACE-001",
      "P19-PUBLICATION-001",
      "P19-PUBLIC-VERIFICATION-001",
      "P19-WEBVOWL-001",
      "P19-CUSTODY-001",
      "P19-CHECKPOINT-001",
    ].includes(requirementId)
  ) {
    return "19D";
  }
  return "19C";
};

const buildRegistry = (planMarkdown) => {
  const catalogue = parseCatalogueRequirements(planMarkdown);
  const checklistGates = parseChecklistRows(planMarkdown).map(
    ({ phase, gateId, coveredRequirementIds, rowDigest }) => ({
      gateId,
      phase,
      rowDigest,
      coveredRequirementIds,
    }),
  );

  const requirements = catalogue.map((requirement) => {
    const { requirementId } = requirement;
    const leafGateId = `${requirementId}-VERIFY`;
    return {
      requirementId,
      phase: requirement.phase,
      sourceAnchor: requirement.sourceAnchor,
      requirementDigest: requirement.requirementDigest,
      checkpoint: phaseCheckpoint(requirementId),
      owner: explicitOwnerByRequirement[requirementId] ?? "PACKAGE_MAINTAINER",
      applicability: { mode: "ALWAYS" },
      blocking: "REQUIRED",
      verification: {
        kind: verificationKindByRequirement[requirementId] ?? "AUTOMATED",
        command: `npm run qualify:release -- --requirement ${requirementId}`,
      },
      evidence: {
        recordPath: "docs/provenance/releases/<version>/gates.json",
        jsonPointer: `/requirements/${requirementId}`,
      },
      permittedFinalResults: ["PASS"],
      failureClasses: [...ALL_FAILURE_CLASSES],
      waiverPolicy: "NO_ORDINARY_WAIVER",
      childGateIds: [leafGateId],
    };
  });

  const leafGates = requirements.map((requirement) => ({
    gateId: requirement.childGateIds[0],
    ownerRequirementId: requirement.requirementId,
    checklistGateIds: checklistGates
      .filter(({ coveredRequirementIds }) =>
        coveredRequirementIds.includes(requirement.requirementId),
      )
      .map(({ gateId }) => gateId),
    owner: requirement.owner,
    applicability: requirement.applicability,
    blocking: requirement.blocking,
    verification: requirement.verification,
    evidence: requirement.evidence,
    permittedFinalResults: requirement.permittedFinalResults,
    failureClasses: requirement.failureClasses,
    waiverPolicy: requirement.waiverPolicy,
  }));

  return {
    $schema: "./gates.schema.json",
    schemaVersion: 1,
    catalogue: {
      normalizationAlgorithm: "markdown-catalogue-bullet-v1",
      checklistNormalizationAlgorithm: "markdown-checklist-row-v1",
      phase19Section: "17.26.5",
      phase20Section: "17.27.6",
      checklistSection: "30",
    },
    policy: {
      successfulFinalResults: ["PASS", "NOT_APPLICABLE"],
      failureClasses: [...ALL_FAILURE_CLASSES],
      transientDiagnosticResult: "INFRASTRUCTURE_ERROR",
      waiverPolicy: "NO_ORDINARY_WAIVER",
    },
    requirements,
    checklistGates,
    leafGates,
  };
};

const planMarkdown = readFileSync(
  new URL("docs/implementation-plan.md", REPOSITORY_ROOT),
  "utf8",
);
const generated = `${JSON.stringify(buildRegistry(planMarkdown), null, 2)}\n`;

if (process.argv.includes("--write")) {
  writeFileSync(REGISTRY_URL, generated, "utf8");
  process.stdout.write(
    `Updated ${fileURLToPath(REGISTRY_URL)} from the implementation plan.\n`,
  );
} else {
  const current = readFileSync(REGISTRY_URL, "utf8");
  if (current !== generated) {
    process.stderr.write(
      "docs/release/gates.json is not the deterministic projection of the implementation plan.\n",
    );
    process.exitCode = 1;
  }
}
