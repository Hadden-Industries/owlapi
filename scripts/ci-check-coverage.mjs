/** CI execution accounting. Input equivalence is a separate, unproved claim. */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { relative } from "node:path";
import { assertOwlContractCoverage } from "./owl-contract-evidence.mjs";

/** Independently reviewed live assertions in the two environment-gated suites.
 * Native Jest capture at 76350128 confirms all 23 names. Updating a live group
 * requires reviewing this inventory; a disabled reference cannot qualify.
 */
export const JAVA_LIVE_INVENTORY = Object.freeze(
  [
    {
      file: "util/owlapi-reference/run-ontology-parsing-contract.test.js",
      group: "pinned Java direct-ontology parsing reconciliation",
      names: [
        "compares direct root content while loading the original import context",
        "compares an imported document's own annotations without adding root axioms",
        "rejects merged output as evidence of direct-ontology parsing parity",
        "detects changed imported ontology metadata even though merging excludes it",
      ],
    },
    {
      file: "util/owlapi-reference/run-import-closure-contract.test.js",
      group: "pinned Java cyclic import-closure oracle",
      names: [
        "records explicit Java parser settings and source diagnostics",
        "refuses an apparent match when native Java reports unparsed RDF",
        "refuses unparsed candidate RDF even when reconstructed axioms match",
        "matches a cyclic closure under one anonymous-individual bijection",
        "matches anonymous ontology identities after an independent document load",
        "compares a large named-axiom set without exhausting the JVM call stack",
        "returns one structured mismatch result for a changed structural axiom",
        "reports all named structural differences after counts and earlier fields differ",
        "does not treat reordered inverse-property operands as an axiom difference",
        "keeps renamed anonymous graphs matched while reporting an extra named axiom",
        "retains structural differences when Java source RDF is unparsed",
        "reports an unmatched anonymous graph without parser-generated node labels",
        "rejects a many-to-one anonymous-individual mapping across source documents",
        "serializes unparsed RDF blank nodes through an RDF writer, not as fake IRIs",
        "proves propagation using a native merge of the compared direct JavaScript models",
        "loads an unexpected output import without permitting fallback network resolution",
        "blocks remote JSON-LD 1 contexts before any HTTP client reaches the network",
        "blocks remote JSON-LD 1.1 contexts before any HTTP client reaches the network",
        "fails closed when an authored import is absent from the catalog",
      ],
    },
  ].map((group) =>
    Object.freeze({ ...group, names: Object.freeze(group.names) }),
  ),
);
export const evidenceFingerprint = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const expectedJava = JAVA_LIVE_INVENTORY.flatMap(({ file, group, names }) =>
  names.map((name) => ({
    file,
    fullName: `${group} ${name}`,
    status: "passed",
  })),
).sort((a, b) =>
  a.fullName < b.fullName ? -1 : a.fullName > b.fullName ? 1 : 0,
);
const inventorySha256 = evidenceFingerprint(
  expectedJava.map(({ file, fullName }) => ({ file, fullName })),
);
const identityValid = (identity) =>
  Number.isSafeInteger(identity?.runId) &&
  identity.runId > 0 &&
  Number.isSafeInteger(identity.runAttempt) &&
  identity.runAttempt > 0 &&
  /^[a-f0-9]{40}$/u.test(identity.commit ?? "");
const javaTests = Object.freeze({
  expected: 23,
  passed: 23,
  failed: 0,
  skipped: 0,
  inventorySha256,
});
const common = (check, identity) => {
  if (!identityValid(identity))
    throw new Error("Coverage requires exact run, attempt and tested commit.");
  return {
    schemaVersion: 1,
    check,
    execution: "SUCCESS",
    runId: identity.runId,
    runAttempt: identity.runAttempt,
    commit: identity.commit,
  };
};

/** Account for actual native Jest assertions, including skipped and renamed groups. */
export const summarizeJavaExecution = (
  report,
  identity,
  { root = process.cwd() } = {},
) => {
  if (
    report?.success !== true ||
    report.numFailedTests !== 0 ||
    report.numFailedTestSuites !== 0 ||
    !Array.isArray(report.testResults)
  )
    throw new Error("Required live Java package execution did not succeed.");
  const observed = report.testResults
    .flatMap((suite) => {
      if (
        typeof suite.name !== "string" ||
        !Array.isArray(suite.assertionResults)
      )
        throw new Error("Invalid native Jest suite.");
      const file = relative(root, suite.name).replaceAll("\\", "/");
      return suite.assertionResults
        .filter((assertion) => /^pinned Java /u.test(assertion.fullName ?? ""))
        .map(({ fullName, status }) => ({ file, fullName, status }));
    })
    .sort((a, b) =>
      a.fullName < b.fullName ? -1 : a.fullName > b.fullName ? 1 : 0,
    );
  if (!isDeepStrictEqual(observed, expectedJava))
    throw new Error(
      "Required live Java inventory is missing, skipped, failed, duplicated or unregistered.",
    );
  const execution = common("java", identity);
  return {
    ...execution,
    tests: { ...javaTests },
    evidenceSha256: evidenceFingerprint({ execution, assertions: observed }),
  };
};

/** Closed check-output schema; no SUCCESS alone, stale identity or extra field is accepted. */
export const assertCheckCoverage = (record, check, identity) => {
  if (check === "owl_contract") {
    common(check, identity);
    return assertOwlContractCoverage(record, identity);
  }
  const expected =
    check === "java"
      ? {
          ...common(check, identity),
          tests: { ...javaTests },
          evidenceSha256: evidenceFingerprint({
            execution: common(check, identity),
            assertions: expectedJava,
          }),
        }
      : null;
  if (!expected || !isDeepStrictEqual(record, expected))
    throw new Error(
      "Required check coverage has invalid state, inventory or current execution identity.",
    );
  return record;
};
