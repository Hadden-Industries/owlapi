import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
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
  { suite: "public-api-behavior" },
];
const platform = ["linux", "win32"];
const validDigest = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const behaviorLedger = new URL(
  "../../docs/compatibility/java-api-parity-decisions.json",
  import.meta.url,
);

function withCandidateAlias(lock, location) {
  const root = lock.packages[""];
  return {
    ...lock,
    packages: {
      ...lock.packages,
      "": { ...root, dependencies: { ...root.dependencies, owlapi: location } },
      "node_modules/owlapi": {
        ...lock.packages["node_modules/owlapi"],
        resolved: location,
      },
    },
  };
}

function assertRetainedConsumerLock(lock, integrity) {
  const dependencies = lock.packages?.[""]?.dependencies;
  const installed = lock.packages?.["node_modules/owlapi"];
  if (
    lock.lockfileVersion !== 3 ||
    lock.packages?.[""]?.name !== "owlapi-release-consumer" ||
    lock.packages[""].version !== "0.0.0" ||
    Object.keys(dependencies ?? {}).length !== 1 ||
    !dependencies.owlapi?.startsWith("file:") ||
    !installed?.resolved?.startsWith("file:") ||
    installed.integrity !== integrity
  ) {
    throw new Error(
      "The retained consumer lock does not bind the candidate tarball",
    );
  }
}

export function bindRetainedConsumerLock(lock, { tarballPath, integrity }) {
  assertRetainedConsumerLock(lock, integrity);
  return withCandidateAlias(lock, pathToFileURL(tarballPath).href);
}

/** Derive the expected graph directly from the authenticated producer lock. */
export function retainedDependencyGraphIdentity(
  lock,
  { tarballSha256, integrity },
) {
  assertRetainedConsumerLock(lock, integrity);
  return comparisonIdentity(
    withCandidateAlias(lock, `sha256:${tarballSha256}`),
  );
}

/** Bind npm's candidate alias to admitted bytes instead of an installation path. */
export function installedDependencyGraphIdentity(
  lock,
  { consumerDirectory, tarballPath, tarballSha256, integrity },
) {
  const root = lock.packages?.[""];
  const installed = lock.packages?.["node_modules/owlapi"];
  const location = pathToFileURL(tarballPath).href;
  if (
    lock.lockfileVersion !== 3 ||
    root?.dependencies?.owlapi !== location ||
    installed?.integrity !== integrity ||
    typeof installed.resolved !== "string" ||
    !installed.resolved.startsWith("file:") ||
    new URL(installed.resolved, pathToFileURL(`${consumerDirectory}/`)).href !==
      location
  ) {
    throw new Error(
      "Installed consumer lock does not resolve the admitted candidate tarball",
    );
  }
  return comparisonIdentity(
    withCandidateAlias(lock, `sha256:${tarballSha256}`),
  );
}

/** Derive required cells from the reviewed checkout. A producer cannot select its own denominator. */
export function corpusQualificationRoster(comparisonCases) {
  const ledgerBytes = readFileSync(behaviorLedger);
  const { currentBehaviorContracts } = JSON.parse(ledgerBytes);
  const requiredDecisions = currentBehaviorContracts.decisions
    .filter(({ decisionStatus }) => decisionStatus === "accepted")
    .map(({ decisionId }) => decisionId)
    .sort();
  const decisions = new Set(requiredDecisions);
  if (
    !decisions.size ||
    decisions.size !== requiredDecisions.length ||
    requiredDecisions.some((id) => typeof id !== "string" || !id)
  ) {
    throw new Error(
      "The accepted public behavior ledger has invalid decision IDs",
    );
  }
  const cases = releaseSuites.flatMap((selection) =>
    comparisonCases(selection),
  );
  const held = new Map();
  const cells = [];
  const inapplicable = [];
  const registeredDecisions = new Set();
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
    if (definition.expectedLoadRefusals) {
      inapplicable.push({
        caseId,
        input: input.id,
        measurement: "structure",
        prerequisite: "load",
        reason: definition.expectedLoadRefusals.dependentStageReason,
      });
    }
    let behaviorDecisionId = entry.behaviorDecisionId;
    if (definition.scenario === "public-api-behavior") {
      const witnesses = Object.values(definition).filter(
        (recipe) => typeof recipe?.decisionId === "string",
      );
      if (
        witnesses.length !== 1 ||
        (behaviorDecisionId && behaviorDecisionId !== witnesses[0].decisionId)
      ) {
        throw new Error(
          `Invalid public behavior decision binding for ${input.id}`,
        );
      }
      behaviorDecisionId = witnesses[0].decisionId;
    }
    if (behaviorDecisionId) {
      if (
        !decisions.has(behaviorDecisionId) ||
        !measurements.includes("behavior")
      ) {
        throw new Error(
          `Invalid public behavior decision binding for ${input.id}`,
        );
      }
      registeredDecisions.add(behaviorDecisionId);
    }
    for (const operatingSystem of platform) {
      for (const measurement of measurements) {
        cells.push({
          caseId,
          input: input.id,
          measurement,
          platform: operatingSystem,
          behaviorProfileId: definition.behaviorProfileId,
          ...(behaviorDecisionId && measurement === "behavior"
            ? { behaviorDecisionId }
            : {}),
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
  return {
    schemaVersion: 1,
    cells,
    inapplicable,
    held: [...held.values()],
    behaviorLedgerSha256: sha256(ledgerBytes),
    unregisteredBehaviorDecisions: requiredDecisions.filter(
      (id) => !registeredDecisions.has(id),
    ),
  };
}

/** Partition the required cases by suite and runner without changing the roster. */
export function corpusQualificationShards(comparisonCases, roster) {
  const shards = [];
  const admitted = new Set(roster.cells.map(({ caseId }) => caseId));
  for (const selection of releaseSuites) {
    const caseIds = comparisonCases(selection)
      .map(({ caseId }) => caseId)
      .filter((caseId) => admitted.has(caseId));
    const workerOwnsCompleteSuite = [
      "rdfxml-writer",
      "canonical-vowl-dl",
    ].includes(selection.suite);
    const size = workerOwnsCompleteSuite ? caseIds.length : 12;
    for (let first = 0; first < caseIds.length; first += size) {
      const members = caseIds.slice(first, first + size);
      for (const runner of platform) {
        const plan = { platform: runner, selection, caseIds: members };
        shards.push({ shardId: comparisonIdentity(plan), ...plan });
      }
    }
  }
  return shards;
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
      receipt.behaviorDecisionId !== expected.behaviorDecisionId ||
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
    status:
      !missing.length &&
      !rejected.length &&
      !roster.unregisteredBehaviorDecisions.length
        ? "complete"
        : "incomplete",
    rosterSha256: comparisonIdentity(roster),
    requiredCount: roster.cells.length,
    missing,
    rejected,
    holds: roster.held,
    inapplicable: roster.inapplicable,
    unregisteredBehaviorDecisions: roster.unregisteredBehaviorDecisions,
  };
}
