import { readFile } from "node:fs/promises";
import { comparisonIdentity, sha256 } from "./comparison-evidence.mjs";
import { oracleLockPath, oracleVersion } from "./comparison-oracle.mjs";

const releaseSuites = [
  { suite: "prospects" },
  { suite: "wider" },
  { suite: "july" },
  { scenario: "large-literal-roundtrip" },
  { scenario: "large-literal-rendering" },
  { suite: "rdfxml-writer" },
  { suite: "canonical-vowl-dl" },
];
const platform = ["linux", "win32"];
const validDigest = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);

/** Derive required cells from the reviewed checkout. A producer cannot select its own denominator. */
export function corpusQualificationRoster(comparisonCases) {
  const cases = releaseSuites.flatMap((selection) =>
    comparisonCases(selection),
  );
  const held = new Map();
  const cells = [];
  for (const entry of cases) {
    const { input, definition, caseId } = entry;
    const unavailable = [
      input,
      ...entry.imports.map(([, document]) => document),
    ].find(
      (document) =>
        document.acquisition === "unavailable" ||
        (document.acquisition === "local-only" &&
          document.source.kind !== "git"),
    );
    if (unavailable) {
      held.set(input.id, {
        input: input.id,
        unavailable: unavailable.id,
        reason: unavailable.reason ?? "Authorized local provision required",
      });
      continue;
    }
    const measurements =
      definition.measurements ??
      (definition.literal ? ["behavior"] : ["behavior", "structure"]);
    for (const operatingSystem of platform) {
      for (const measurement of measurements) {
        cells.push({
          caseId,
          input: input.id,
          measurement,
          platform: operatingSystem,
          behaviorProfileId: definition.behaviorProfileId,
          ...(definition.oracle ? { oracle: definition.oracle } : {}),
          ...(measurement === "structure" && definition.expectedDifferences
            ? {
                expectedDifferenceRules: definition.expectedDifferences.ruleIds,
              }
            : {}),
        });
      }
    }
  }
  return { schemaVersion: 1, cells, held: [...held.values()] };
}

const cellKey = ({ platform, caseId, measurement }) =>
  [platform, caseId, measurement].join(":");

function matchesOracle(actual, expected, released) {
  if (!actual) return false;
  if (!expected)
    return comparisonIdentity(actual) === comparisonIdentity(released);
  return (
    actual.kind === expected.kind &&
    actual.revision === expected.revision &&
    actual.version === expected.version &&
    validDigest(actual.classpathSha256) &&
    Array.isArray(actual.jars) &&
    actual.jars.length > 0 &&
    actual.jars.every(
      (jar) =>
        typeof jar?.file === "string" &&
        /^[A-Za-z0-9_.-]+\.jar$/u.test(jar.file) &&
        Number.isSafeInteger(jar.byteLength) &&
        jar.byteLength > 0 &&
        validDigest(jar.sha256),
    )
  );
}

function matchesVerdict(receipt, expected) {
  if (expected.measurement === "behavior")
    return receipt.verdict === "observed";
  if (!expected.expectedDifferenceRules) return receipt.verdict === "match";
  return (
    receipt.verdict === "reconciled" &&
    Array.isArray(expected.expectedDifferenceRules) &&
    Array.isArray(receipt.reconciledRuleIds) &&
    comparisonIdentity(expected.expectedDifferenceRules) ===
      comparisonIdentity(receipt.reconciledRuleIds)
  );
}

/** Reconcile admitted stage receipts after the caller authenticates the exact producer artifacts. */
export async function reconcileCorpusReceipts(
  { subject, oracle, receipts },
  comparisonCases,
) {
  if (
    !validDigest(subject.tarballSha256) ||
    !validDigest(subject.dependencyGraphSha256) ||
    !validDigest(subject.artifactSha256) ||
    !/^[1-9]\d*$/u.test(subject.artifactId) ||
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(subject.integrity) ||
    oracle?.version !== oracleVersion ||
    oracle.lockSha256 !== sha256(await readFile(oracleLockPath))
  ) {
    throw new Error(
      "Corpus qualification requires authenticated candidate and oracle identities",
    );
  }
  const roster = corpusQualificationRoster(comparisonCases);
  const required = new Map(roster.cells.map((cell) => [cellKey(cell), cell]));
  const seen = new Set();
  const rejected = [];
  for (const receipt of receipts) {
    const key = cellKey(receipt);
    const expected = required.get(key);
    if (!expected || seen.has(key)) {
      rejected.push({
        key,
        reason: expected ? "Duplicate required cell" : "Unexpected cell",
      });
      continue;
    }
    seen.add(key);
    if (
      receipt.provenance !== "INSTALLED_CANDIDATE" ||
      !receipt.subject ||
      comparisonIdentity(receipt.subject) !== comparisonIdentity(subject) ||
      !matchesOracle(receipt.oracle, expected.oracle, oracle) ||
      receipt.input !== expected.input ||
      receipt.behaviorProfileId !== expected.behaviorProfileId ||
      !validDigest(receipt.stageSha256) ||
      !validDigest(receipt.producerArtifactSha256) ||
      !/^[1-9]\d*$/u.test(receipt.producerRun) ||
      !/^[1-9]\d*$/u.test(receipt.producerAttempt) ||
      !matchesVerdict(receipt, expected)
    ) {
      rejected.push({
        key,
        reason: "Missing, mismatched or inconclusive case evidence",
      });
    }
  }
  const missing = roster.cells.filter((cell) => !seen.has(cellKey(cell)));
  return {
    schemaVersion: 1,
    status: !missing.length && !rejected.length ? "complete" : "incomplete",
    rosterSha256: comparisonIdentity(roster),
    requiredCount: roster.cells.length,
    missing,
    rejected,
    holds: roster.held,
  };
}
