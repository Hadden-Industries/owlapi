/** Check the frozen migration obligations independently of the reports being evaluated. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { JAVA_LIVE_INVENTORY } from "./ci-check-coverage.mjs";
import { OWL_CONTRACT_ASSERTIONS } from "../test/consumers/owl-contract/public-model-cases.js";
import { runComparison } from "../util/owlapi-reference/compare-java-js.mjs";
import { comparisonIdentity } from "../util/owlapi-reference/comparison-evidence.mjs";

const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const map = await json(
  new URL(
    "../docs/compatibility/comparison-runner-migration.json",
    import.meta.url,
  ),
);

function exactKeys(actual, expected, label) {
  const order = (items) =>
    items.map((value) => comparisonIdentity(value)).sort();
  assert.equal(
    new Set(order(actual)).size,
    actual.length,
    label + " contains duplicate keys",
  );
  assert.deepEqual(order(actual), order(expected), label + " changed");
}

const registryKeys = {
  "reference-behavior": (r) => [[r.probeId, r.args, r.sourceSha256]],
  "reference-selected-api": (r) => [[r.probeId, r.args, r.sourceSha256]],
  "canonical-vowl-dl": (r) => [r.input.id],
  "rdfxml-writer": (r) => [r.writerMode],
  "api-benchmarks": (r) => [[r.input, r.behaviorProfileId]],
  "api-semantics": (r) => [[r.input, r.behaviorProfileId]],
  "io-admission": (r) => [r.input],
  "format-performance": (r) => r.resultIds.map((id) => [r.input, id]),
};

async function verifyRegistry() {
  const totals = {};
  for (const [suite, coverage] of Object.entries(map.suites)) {
    const { cases } = await runComparison({ action: "list", suite });
    const keys = cases.flatMap(registryKeys[suite]);
    exactKeys(
      keys,
      coverage.keys ?? map.suites[coverage.sameKeysAs].keys,
      suite,
    );
    totals[suite] = keys.length;
  }
  const ledger = await json(
    new URL(
      "../docs/compatibility/java-api-parity-decisions.json",
      import.meta.url,
    ),
  );
  assert.deepEqual(
    Object.fromEntries(
      ledger.currentBehaviorContracts.decisions.map((d) => [
        d.decisionId,
        d.testCaseReferences,
      ]),
    ),
    map.decisions,
  );
  for (const witnesses of Object.values(map.decisions))
    for (const file of witnesses) assert.ok(map.jest[file], file);
  const roster = await runComparison({
    action: "list",
    suite: "release-semantics",
  });
  assert.deepEqual(roster.unregisteredBehaviorDecisions, []);
  assert.deepEqual(JAVA_LIVE_INVENTORY, map.liveJava);
  exactKeys(
    OWL_CONTRACT_ASSERTIONS,
    map.installedContract.assertions,
    "Installed contract",
  );
  return totals;
}

async function verifyJest(path) {
  const report = await json(path);
  assert.equal(report.success, true, "Jest failed");
  let assertions = 0;
  for (const [file, names] of Object.entries(map.jest)) {
    const files = report.testResults.filter((r) =>
      r.name.replaceAll("\\", "/").endsWith("/" + file),
    );
    assert.equal(files.length, 1, file);
    const rows = files[0].assertionResults;
    assert.ok(
      rows.every((r) => r.status === "passed"),
      "Unexecuted assertion in " + file,
    );
    exactKeys(
      rows.map((r) => r.fullName),
      names,
      file,
    );
    assertions += rows.length;
  }
  return { files: Object.keys(map.jest).length, assertions };
}

const { values } = parseArgs({
  options: {
    jest: { type: "string" },
  },
});
const result = { registry: await verifyRegistry() };
if (values.jest) result.jest = await verifyJest(values.jest);
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
