/** Check the frozen migration obligations independently of the reports being evaluated. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { JAVA_LIVE_INVENTORY } from "./ci-check-coverage.mjs";
import { OWL_CONTRACT_ASSERTIONS } from "../test/consumers/owl-contract/public-model-cases.js";
import { runComparison } from "../util/owlapi-reference/compare-java-js.mjs";
import { julyComparisonManifest } from "../util/owlapi-reference/comparison-fixtures.mjs";
import {
  comparisonIdentity,
  sha256,
} from "../util/owlapi-reference/comparison-evidence.mjs";

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

async function pinned(directory, pin) {
  assert.equal(basename(pin.name), pin.name);
  const bytes = await readFile(join(directory, pin.name));
  assert.equal(bytes.length, pin.byteLength);
  assert.equal(sha256(bytes), pin.sha256);
  return JSON.parse(bytes);
}

async function verifyJuly(controlPath, directory) {
  const control = await json(controlPath);
  const attempt = await json(join(directory, "attempt.json"));
  const report = await json(join(directory, "report.json"));
  assert.equal(control.status, "PASS");
  assert.equal(control.candidateUnchanged, true);
  assert.equal(control.java.revision, map.july.oracle);
  assert.equal(control.sources.revision, map.july.revision);
  exactKeys(control.sources.documents, map.july.fixtures, "July sources");
  assert.equal(attempt.oracle.revision, control.java.revision);
  assert.equal(
    attempt.candidate.tarballSha256,
    control.candidate.tarball.sha256,
  );
  assert.deepEqual(attempt.candidate.candidate, control.candidate);
  const expected = (
    await runComparison({
      action: "list",
      suite: "july",
      profile: "normative-v1",
      parsingMode: "compatible",
    })
  ).cases;
  exactKeys(
    report.cases.map((c) => c.caseId),
    expected.map((c) => c.caseId),
    "July cases",
  );
  assert.ok(report.cases.every((c) => c.status === "passed" && c.offline));
  const families = [];
  for (const family of map.july.families) {
    const source = control.parsingResults.find(
      (r) => r.family === family.family,
    );
    const reconciliation = control.familyReconciliations.find(
      (r) => r.family === family.family,
    );
    assert.equal(reconciliation.status, "PASS");
    exactKeys(
      source.documents.map((d) => d.ontologyID),
      family.documents,
      family.family,
    );
    const definition = expected.find(
      (r) =>
        r.input.id === "july/" + family.family &&
        r.scenario === "closure-roundtrip",
    );
    const row = report.cases.find((r) => r.caseId === definition.caseId);
    const caseDirectory = join(directory, row.caseId);
    const receipt = await pinned(caseDirectory, row.receipt);
    assert.equal(receipt.executionId, report.executionId);
    const js = await pinned(caseDirectory, receipt.js.evidence);
    const native = await pinned(caseDirectory, receipt.java.evidence);
    assert.equal(native.closurePropagation.status, "match");
    const digest = async (artifact) => {
      assert.equal(basename(artifact.name), artifact.name);
      const bytes = await readFile(join(caseDirectory, artifact.name));
      assert.equal(bytes.length, artifact.byteLength);
      assert.equal(sha256(bytes), artifact.sha256);
      return artifact.sha256;
    };
    exactKeys(
      js.load.closure,
      family.documents,
      family.family + " import context",
    );
    const files = [];
    for (const sourceModel of source.documents) {
      const mapping = julyComparisonManifest.mappings.find((m) =>
        sourceModel.sourceDocumentPath
          .replaceAll("\\", "/")
          .endsWith("/" + m.path),
      );
      assert.ok(mapping, sourceModel.sourceDocumentPath);
      const original = join(
        dirname(controlPath),
        family.family,
        basename(sourceModel.path.replaceAll("\\", "/")),
      );
      assert.equal(sha256(await readFile(original)), sourceModel.sha256);
      const model = js.documentModels.find(
        (m) => m.documentIRI === mapping.ontologyIRI,
      );
      assert.equal(await digest(model.artifact), sourceModel.sha256);
      files.push(sourceModel.sha256);
    }
    assert.equal(js.documentModels.length, files.length);
    const formats = control.closureResults.filter(
      (c) => c.family === family.family,
    );
    exactKeys(
      formats.map((c) => c.format),
      family.formats,
      family.family + " serialized formats",
    );
    const outputs = {};
    for (const prior of formats) {
      const [write, reload] =
        prior.format === "FUNCTIONAL"
          ? [js.functional, js.functionalReload]
          : [js.rdfXmlWrite, js.rdfXmlReload];
      outputs[prior.format] = await digest(write.artifact);
      const original = join(
        dirname(controlPath),
        family.family,
        basename(prior.path.replaceAll("\\", "/")),
      );
      assert.equal(sha256(await readFile(original)), prior.sha256);
      assert.equal(outputs[prior.format], prior.sha256);
      assert.equal(reload.status, "completed");
      assert.equal(reload.importAttempts, 0);
      assert.deepEqual(reload.diagnostics, []);
    }
    assert.equal(native.jsFunctionalRoundTrip.status, "match");
    assert.equal(native.jsRdfXmlRoundTrip.status, "match");
    assert.equal(native.jsRdfXmlNativeReload.comparison.status, "match");
    assert.deepEqual(native.jsRdfXmlNativeReload.unparsedRdf, []);
    families.push({
      family: family.family,
      directModels: files,
      closures: outputs,
    });
  }
  return {
    tarballSha256: control.candidate.tarball.sha256,
    oracle: attempt.oracle.revision,
    jdk: attempt.oracle.jdk,
    executionId: report.executionId,
    families,
  };
}

const { values } = parseArgs({
  options: {
    jest: { type: "string" },
    "july-control": { type: "string" },
    "july-output": { type: "string" },
  },
});
assert.equal(
  Boolean(values["july-control"]),
  Boolean(values["july-output"]),
  "Supply both July evidence paths",
);
const result = { registry: await verifyRegistry() };
if (values.jest) result.jest = await verifyJest(values.jest);
if (values["july-control"])
  result.july = await verifyJuly(values["july-control"], values["july-output"]);
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
