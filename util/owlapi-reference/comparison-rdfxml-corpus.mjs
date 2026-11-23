import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  assertRdfXmlCorpusObservation,
  observeRdfXmlCorpusFixture,
  rdfXmlCorpusEvidence,
} from "../verify-owlapi-rdfxml-corpus.mjs";
import {
  comparisonIdentity,
  publishComparisonJson,
} from "./comparison-evidence.mjs";
import { resolveComparisonFixture } from "./comparison-fixtures.mjs";
import { captureSourceIdentity } from "./qualify-universal-ontology.mjs";

const entries = rdfXmlCorpusEvidence.map(({ fixture, expected }) => {
  const input = {
    id: fixture.id,
    syntax: "rdfxml",
    documentIRI: `https://example.com/owlapi-js/corpus/${fixture.id}`,
    sha256: fixture.sha256,
    byteLength: fixture.bytes,
  };
  const definition = {
    schemaVersion: 1,
    scenario: "rdfxml-corpus",
    scenarioVersion: 1,
    observationPoint: "rdfxml-syntax-and-model-diagnostics",
    input,
    behaviorProfileId: "normative-v1",
    expected,
  };
  const provider = {
    ...input,
    acquisition: "local-only",
    source: { kind: "https", url: fixture.source, redirects: [] },
  };
  return {
    definition,
    fixture,
    provider,
    caseId: comparisonIdentity(definition),
  };
});

function corpusVerdict(fixture, observation) {
  try {
    assertRdfXmlCorpusObservation(fixture, observation);
    return {
      status: "diagnostic-only",
      reason: "Source RDF/XML adapter and translator observations are JS-only",
    };
  } catch (error) {
    return { status: "failed", reason: error.message };
  }
}

/** Replay the three source diagnostics using verified input bytes from any host. */
export async function runRdfXmlCorpusComparison(
  request,
  environment,
  repository,
) {
  if (
    (request.suite && request.suite !== "rdfxml-corpus") ||
    (request.scenario && request.scenario !== "rdfxml-corpus") ||
    request.input ||
    request.profile ||
    request.parsingMode ||
    request.imports ||
    request.format ||
    request.javaXml ||
    request.javaTurtle ||
    request.measurements?.some((value) => value !== "behavior") ||
    environment.candidateDirectory ||
    environment.packageDirectory
  ) {
    throw new Error(
      "This source diagnostic owns its parser, translator, inputs and modes",
    );
  }
  const definitions = entries.map(({ caseId, definition }) => ({
    caseId,
    ...definition,
  }));
  if (request.action === "list")
    return { schemaVersion: 1, cases: definitions };
  const output = environment.outputDirectory;
  if (
    !isAbsolute(output ?? "") ||
    !["run", "verify", "prepare"].includes(request.action)
  ) {
    throw new Error(
      "Select a corpus diagnostic action and an absolute output directory",
    );
  }
  if (request.action === "prepare") {
    await mkdir(output);
    const cases = [];
    for (const { provider } of entries) {
      await resolveComparisonFixture(provider, environment, true);
      cases.push({ input: provider.id, status: "prepared" });
    }
    const report = { schemaVersion: 1, action: request.action, cases };
    await publishComparisonJson(output, "preparation.json", report);
    return report;
  }
  const source = await captureSourceIdentity(repository);
  if (request.action === "verify") {
    const report = JSON.parse(
      await readFile(join(output, "rdfxml-corpus.json")),
    );
    if (
      report.schemaVersion !== 1 ||
      report.action !== "run" ||
      comparisonIdentity(report.definitions) !==
        comparisonIdentity(definitions) ||
      comparisonIdentity(report.source) !== comparisonIdentity(source) ||
      !Array.isArray(report.cases) ||
      report.cases.length !== entries.length
    ) {
      throw new Error(
        "RDF/XML diagnostic evidence has the wrong subject or case roster",
      );
    }
    for (const [index, { caseId, fixture }] of entries.entries()) {
      const row = report.cases[index];
      const verdict = corpusVerdict(fixture, row.observation);
      if (
        row.caseId !== caseId ||
        row.input !== fixture.id ||
        row.status !== verdict.status ||
        row.reason !== verdict.reason
      ) {
        throw new Error("RDF/XML case record has the wrong scope");
      }
    }
    return { ...report, action: "verify" };
  }
  await mkdir(output);
  const cases = [];
  for (const { caseId, fixture, provider } of entries) {
    const path = await resolveComparisonFixture(provider, environment);
    const observation = await observeRdfXmlCorpusFixture(
      fixture,
      await readFile(path),
    );
    cases.push({
      caseId,
      input: fixture.id,
      ...corpusVerdict(fixture, observation),
      observation,
    });
  }
  if (
    comparisonIdentity(await captureSourceIdentity(repository)) !==
    comparisonIdentity(source)
  ) {
    throw new Error("Source changed during the RDF/XML diagnostic");
  }
  const report = {
    schemaVersion: 1,
    action: "run",
    source,
    definitions,
    cases,
  };
  await publishComparisonJson(output, "rdfxml-corpus.json", report);
  return report;
}
