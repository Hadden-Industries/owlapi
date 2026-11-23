import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { comparisonIdentity, sha256 } from "./comparison-evidence.mjs";
import { readCanonicalVowlProfileInputs } from "./run-profile-contract.mjs";

/** Bind the twenty authored model sequences to the independent verdicts for both engines. */
export function profileComparisonCases(request, oracle) {
  if (
    request.input ||
    (request.suite && request.suite !== "canonical-vowl-dl") ||
    (request.scenario && request.scenario !== "canonical-vowl-dl") ||
    (request.profile && request.profile !== "normative-v1") ||
    (request.parsingMode && request.parsingMode !== "preserve") ||
    request.imports ||
    request.javaXml ||
    request.javaTurtle ||
    request.format
  ) {
    throw new Error(
      "The VOWL suite owns its complete preserve-mode input roster",
    );
  }
  const { inputs, inputSha256, expected } = readCanonicalVowlProfileInputs();
  if (
    expected.inputSha256 !== inputSha256 ||
    inputs.length !== 20 ||
    new Set(inputs.map(({ id }) => id)).size !== inputs.length ||
    [expected.java, expected.javascript].some(
      (rows) =>
        rows.length !== inputs.length ||
        rows.some(({ id }, index) => id !== inputs[index].id),
    )
  ) {
    throw new Error("The canonical VOWL inputs and expected verdicts disagree");
  }
  return inputs.map(({ id, documents }, index) => {
    const input = {
      id,
      syntax: "functional",
      sha256: comparisonIdentity(documents),
    };
    const definition = {
      schemaVersion: 1,
      scenario: "canonical-vowl-dl",
      scenarioVersion: 1,
      observationPoint: "owl2-dl-profile-assessment",
      input,
      oracle,
      behaviorProfileId: "normative-v1",
      parsingMode: "preserve",
      sourceAssessment: true,
      measurements: ["behavior"],
      expectationsSha256: comparisonIdentity({
        java: expected.java[index],
        javascript: expected.javascript[index],
      }),
    };
    return {
      caseId: comparisonIdentity(definition),
      definition,
      input,
      imports: [],
    };
  });
}

/** Re-read witnessed profile verdicts against the original independent expectations. */
export async function verifyProfileStages(directory, entries) {
  const bytes = await readFile(join(directory, "report.json"));
  const report = JSON.parse(bytes);
  const { expected } = readCanonicalVowlProfileInputs();
  const { oracle } = entries[0].definition;
  if (
    report.schemaVersion !== 3 ||
    report.endStateRechecked !== true ||
    report.reference?.revision !== oracle.revision ||
    report.java?.version !== oracle.version ||
    !Array.isArray(report.reference.loadedArtifacts) ||
    report.reference.loadedArtifacts.length < 1 ||
    comparisonIdentity(report.java.observations) !==
      comparisonIdentity(expected.java) ||
    comparisonIdentity(report.javascript) !==
      comparisonIdentity(expected.javascript)
  ) {
    throw new Error(
      "VOWL evidence disagrees with the pinned native and source verdicts",
    );
  }
  return {
    workerReportSha256: sha256(bytes),
    cases: entries.map(({ caseId, input }) => ({
      caseId,
      input: input.id,
      status: "passed",
      measures: { behavior: "observed" },
    })),
  };
}
