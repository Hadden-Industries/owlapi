import { readFileSync } from "node:fs";
import { comparisonIdentity, sha256 } from "./comparison-evidence.mjs";

const evidencePath = new URL(
  "../../docs/compatibility/profiles/java-owlapi-5.5.1/central-observations.json",
  import.meta.url,
);
const decode = (text) => Buffer.from(text, "base64").toString("utf8");

/** Read the exact original factory rows, including the numeric and language edges. */
export function readLiteralFactoryRows() {
  const bytes = readFileSync(evidencePath);
  const probe = JSON.parse(bytes).observations.find(
    ({ probeId }) => probeId === "ObserveLanguageProfileSemantics",
  );
  const fields = (prefix) =>
    probe.stdout
      .split("\n")
      .filter((line) => line.startsWith(prefix + "\t"))
      .map((line) => line.split("\t").slice(1));
  return {
    evidenceSha256: sha256(bytes),
    literalRows: fields("factory-literal"),
    languageRows: fields("factory-language"),
  };
}

export function literalConstructionComparisonCase() {
  const { evidenceSha256, literalRows, languageRows } =
    readLiteralFactoryRows();
  if (literalRows.length !== 672 || languageRows.length !== 6) {
    throw new Error(
      "The original literal-construction observation roster changed",
    );
  }
  const typed = literalRows.map(([datatypeIRI, input]) => ({
    lexicalForm: decode(input),
    datatypeIRI,
  }));
  const tagged = languageRows.map(([language]) => ({
    lexicalForm: "hello",
    inputLanguage: decode(language),
  }));
  const expected = (lexicalForm, datatypeIRI, language) => ({
    lexicalForm: decode(lexicalForm),
    datatypeIRI,
    language: decode(language),
  });
  const javaRowsSha256 = comparisonIdentity([
    ...literalRows.map(([, , ...values]) => expected(...values)),
    ...languageRows.map(([, ...values]) => expected(...values)),
  ]);
  const input = { id: "factory/literal-construction" };
  const definition = {
    schemaVersion: 1,
    scenario: "public-api-behavior",
    scenarioVersion: 1,
    observationPoint: "public-literal-value-construction",
    behaviorProfileId: "java-owlapi-5.5.1",
    measurements: ["behavior"],
    input,
    literalConstruction: {
      decisionId: "BEHAVIOR-LITERAL-CONSTRUCTION",
      evidenceSha256,
      javaRowsSha256,
      typedCount: typed.length,
      languageCount: tagged.length,
      rows: [...typed, ...tagged],
      normative: typed.map(({ lexicalForm }) => lexicalForm),
    },
  };
  return {
    caseId: comparisonIdentity(definition),
    definition,
    input,
    imports: [],
  };
}

export function observeLiteralConstruction(api, request) {
  const selected = api.OWLManager.createOWLOntologyManager({
    behaviorProfileId: request.behaviorProfileId,
  }).getOWLDataFactory();
  const normative =
    api.OWLManager.createOWLOntologyManager().getOWLDataFactory();
  const { rows } = request.literalConstruction;
  const construct = (factory, { lexicalForm, datatypeIRI, inputLanguage }) =>
    factory.getOWLLiteral(
      lexicalForm,
      datatypeIRI
        ? factory.getOWLDatatype(api.IRI.create(datatypeIRI))
        : inputLanguage,
    );
  return {
    schemaVersion: 1,
    caseId: request.caseId,
    operation: request.scenario,
    effectiveSettings: {
      behaviorProfileId: selected.getBehaviorProfileId(),
      defaultBehaviorProfileId: normative.getBehaviorProfileId(),
    },
    networkRequests: [],
    load: { status: "completed" },
    literalConstruction: rows.map((row) => {
      const literal = construct(selected, row);
      return {
        lexicalForm: literal.lexicalForm,
        datatypeIRI: literal.datatype.iri.value,
        language: literal.language,
      };
    }),
    normativeLiteralConstruction: rows
      .filter(({ datatypeIRI }) => datatypeIRI)
      .map((row) => construct(normative, row).lexicalForm),
  };
}
