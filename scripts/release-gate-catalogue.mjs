import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** Canonical plans jointly define the first public release; none is optional. */
export const RELEASE_PLAN_PATHS = Object.freeze([
  "docs/implementation-plan.md",
  "docs/plans/java-api-parity-precondition.md",
  "docs/ontology-lifecycle-capability-implementation-plan.md",
]);

export const readReleasePlans = () =>
  RELEASE_PLAN_PATHS.map((path) =>
    readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
  ).join("\n\n");

/** The signed parity checkpoint accepts all three prerequisite results. */
export const prerequisiteRequirements = (requirementId) => {
  if (requirementId === "P21-CHECKPOINT-001") {
    return ["P21-INTEGRATION-001", "P21-PARITY-001", "P21-CONSUMER-001"];
  }
  return requirementId.startsWith("P22-") ? ["P21-CHECKPOINT-001"] : [];
};

const CATALOGUE_SECTIONS = Object.freeze([
  {
    phase: 19,
    start: "#### 17.26.5 Authoritative Phase 19 acceptance catalogue",
    end: "If npm namespace control is pending",
  },
  {
    phase: 20,
    start: "#### 17.27.6 Authoritative Phase 20 acceptance catalogue",
    end: "Pause for the requested Git checkpoint",
  },
  {
    phase: 21,
    start: "## 9. Authoritative Phase 21 acceptance catalogue",
    end: "### Phase 21 acceptance checklist",
  },
  {
    phase: 22,
    start: "## 9. Authoritative Phase 22 acceptance catalogue",
    end: "### Phase 22 acceptance checklist",
  },
]);

const REQUIREMENT_START_PATTERN =
  /^- <a id="(p(?:19|20|21|22)-[a-z0-9]+(?:-[a-z0-9]+)*-[0-9]{3})"><\/a> \*\*`(P(?:19|20|21|22)-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3})` —/u;
const CHECKLIST_MARKER_PATTERN =
  /^- \[([ x])\] <!-- Gate: (P(?:19|20|21|22)-CHECK-[0-9]{3}); Covers: ((?:P(?:19|20|21|22)-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3})(?:, P(?:19|20|21|22)-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3})*) --> /u;

const sha256 = (value) =>
  `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;

/**
 * Canonicalize a catalogue bullet without reflowing its prose. Preserving every
 * non-trailing character makes editorial changes observable while normalizing
 * only cross-platform line endings and insignificant trailing whitespace.
 */
export const normalizeCatalogueBullet = (lines) =>
  lines
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

export const parseCatalogueRequirements = (planMarkdown) =>
  CATALOGUE_SECTIONS.flatMap(({ phase, start, end }) => {
    const startIndex = planMarkdown.indexOf(start);
    const endIndex = planMarkdown.indexOf(end, startIndex + start.length);
    if (startIndex === -1 || endIndex === -1) {
      throw new Error(`Cannot locate the Phase ${phase} acceptance catalogue.`);
    }

    const lines = planMarkdown.slice(startIndex, endIndex).split(/\r?\n/u);
    const requirements = [];
    let current = null;

    const closeCurrent = () => {
      if (!current) {
        return;
      }
      const normalizedRequirement = normalizeCatalogueBullet(current.lines);
      requirements.push({
        phase,
        requirementId: current.requirementId,
        sourceAnchor: current.sourceAnchor,
        normalizedRequirement,
        requirementDigest: sha256(normalizedRequirement),
      });
    };

    for (const line of lines) {
      const match = REQUIREMENT_START_PATTERN.exec(line);
      if (match) {
        closeCurrent();
        current = {
          sourceAnchor: match[1],
          requirementId: match[2],
          lines: [line],
        };
      } else if (current) {
        if (line === "") {
          closeCurrent();
          current = null;
        } else {
          current.lines.push(line);
        }
      }
    }
    closeCurrent();
    return requirements;
  });

/**
 * Checklist status is operational state, not gate-definition text. Replacing
 * `[x]` with `[ ]` keeps the definition digest stable as work is completed while
 * retaining the row identity, Covers mapping, and all normative wording.
 */
export const normalizeChecklistRow = (lines) =>
  lines
    .map((line, index) =>
      (index === 0 ? line.replace(/^- \[[ x]\]/u, "- [ ]") : line).trimEnd(),
    )
    .join("\n")
    .trim();

export const parseChecklistRows = (planMarkdown) => {
  const sectionSpecifications = [
    {
      phase: 19,
      start: "### Phase 19 alpha completion",
      end: "### Production `0.1.0` completion",
    },
    {
      phase: 20,
      start: "### Production `0.1.0` completion",
      end: "### Event-triggered contributor-governance checkpoint",
    },
    {
      phase: 21,
      start: "### Phase 21 acceptance checklist",
      end: "<!-- End Phase 21 acceptance checklist -->",
    },
    {
      phase: 22,
      start: "### Phase 22 acceptance checklist",
      end: "<!-- End Phase 22 acceptance checklist -->",
    },
  ];

  return sectionSpecifications.flatMap(({ phase, start, end }) => {
    const startIndex = planMarkdown.indexOf(start);
    const endIndex = planMarkdown.indexOf(end, startIndex + start.length);
    if (startIndex === -1 || endIndex === -1) {
      throw new Error(
        `Cannot locate the Phase ${phase} implementation checklist.`,
      );
    }

    const rows = [];
    let currentLines = null;
    const closeCurrent = () => {
      if (!currentLines) {
        return;
      }
      while (currentLines.at(-1) === "") {
        currentLines.pop();
      }
      const marker = CHECKLIST_MARKER_PATTERN.exec(currentLines[0]);
      if (!marker) {
        throw new Error(
          `Every Phase ${phase} checklist row must begin with an explicit Gate/Covers marker: ${currentLines[0]}`,
        );
      }
      const [, status, gateId, coversList] = marker;
      if (!gateId.startsWith(`P${phase}-`)) {
        throw new Error(`${gateId} is attached to the wrong phase checklist.`);
      }
      const coveredRequirementIds = coversList.split(", ");
      if (
        coveredRequirementIds.some(
          (requirementId) => !requirementId.startsWith(`P${phase}-`),
        )
      ) {
        throw new Error(`${gateId} covers a requirement from the wrong phase.`);
      }
      const normalizedRow = normalizeChecklistRow(currentLines);
      rows.push({
        phase,
        gateId,
        checked: status === "x",
        coveredRequirementIds,
        normalizedRow,
        rowDigest: sha256(normalizedRow),
      });
    };

    for (const line of planMarkdown
      .slice(startIndex, endIndex)
      .split(/\r?\n/u)) {
      if (line.startsWith("- [")) {
        closeCurrent();
        currentLines = [line];
      } else if (currentLines) {
        currentLines.push(line);
      }
    }
    closeCurrent();
    return rows;
  });
};
