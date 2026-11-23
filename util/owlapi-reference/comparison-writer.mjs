import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { comparisonIdentity, sha256 } from "./comparison-evidence.mjs";
import { pinnedSourceOracle } from "./comparison-oracle.mjs";
import {
  writerFixturePath,
  writerModes,
} from "./comparison-writer-fixtures.mjs";

/** Bind each existing writer configuration to the same fixture and source oracle. */
export function writerComparisonCases(request) {
  if (
    request.input ||
    (request.suite && request.suite !== "rdfxml-writer") ||
    (request.scenario && request.scenario !== "rdfxml-writer") ||
    (request.profile && request.profile !== "normative-v1") ||
    request.parsingMode ||
    request.imports ||
    request.javaXml ||
    request.javaTurtle ||
    request.format
  ) {
    throw new Error("The writer suite owns its complete fixture and settings");
  }
  const fixture = readFileSync(writerFixturePath);
  const fixtureSha256 = sha256(fixture);
  const oracle = pinnedSourceOracle();
  return writerModes.map((writerMode) => {
    const input = {
      id: `rdfxml-refinements/${writerMode}`,
      syntax: "functional",
      sha256: fixtureSha256,
      byteLength: fixture.length,
    };
    const definition = {
      schemaVersion: 1,
      scenario: "rdfxml-writer",
      scenarioVersion: 1,
      observationPoint: "rdfxml-document-presentation-and-reload",
      input,
      writerMode,
      oracle,
      behaviorProfileId: "normative-v1",
    };
    return {
      caseId: comparisonIdentity(definition),
      definition,
      input,
      imports: [],
    };
  });
}

/** Re-evaluate both boundaries against the original native and JS writer outputs. */
export async function verifyWriterStages(directory, entries, measurements) {
  const { compareRdfXmlPresentation } =
    await import("./run-writer-configuration-contract.mjs");
  const bytes = await readFile(join(directory, "report.json"));
  const report = JSON.parse(bytes);
  if (
    report.schemaVersion !== 1 ||
    !Array.isArray(report.observations) ||
    report.observations.length !== entries.length ||
    report.pinnedRevision !== entries[0].definition.oracle.revision ||
    report.owlapiVersion !== entries[0].definition.oracle.version ||
    report.inputSha256 !== entries[0].input.sha256
  ) {
    throw new Error(
      "Writer evidence has the wrong fixture, oracle or case roster",
    );
  }
  const cases = [];
  for (const [index, { caseId, input, definition }] of entries.entries()) {
    const { writerMode } = definition;
    const row = report.observations[index];
    const [native, javascript, structureBytes] = await Promise.all([
      readFile(join(directory, "java", `${writerMode}.rdf`)),
      readFile(join(directory, "javascript", `${writerMode}.rdf`)),
      readFile(join(directory, `${writerMode}-structural.json`)),
    ]);
    const structure = JSON.parse(structureBytes);
    const presentation = compareRdfXmlPresentation(
      native.toString("utf8"),
      javascript.toString("utf8"),
      writerMode,
    );
    if (
      row.mode !== writerMode ||
      row.javaSha256 !== sha256(native) ||
      row.javascriptSha256 !== sha256(javascript) ||
      comparisonIdentity(row.structural) !== comparisonIdentity(structure) ||
      comparisonIdentity(row.presentation) !== comparisonIdentity(presentation)
    ) {
      throw new Error(`Writer receipt changed for ${writerMode}`);
    }
    const verdicts = {
      behavior: presentation.matches ? "observed" : "mismatch",
      structure:
        structure.exitCode === 0 &&
        structure.result?.comparisonOutcome === "MATCH"
          ? "match"
          : "mismatch",
    };
    const measures = Object.fromEntries(
      measurements.map((measurement) => [measurement, verdicts[measurement]]),
    );
    cases.push({
      caseId,
      input: input.id,
      measures,
      status: Object.values(measures).includes("mismatch")
        ? "failed"
        : "passed",
      presentation,
      artifacts: {
        javaSha256: row.javaSha256,
        javascriptSha256: row.javascriptSha256,
        structuralSha256: sha256(structureBytes),
      },
    });
  }
  return { workerReportSha256: sha256(bytes), cases };
}
