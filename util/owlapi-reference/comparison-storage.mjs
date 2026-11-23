import { comparisonIdentity, sha256 } from "./comparison-evidence.mjs";
import { comparisonSyntaxes } from "./comparison-fixtures.mjs";

const formats = ["functional", "turtle", "rdfxml", "owlxml"];
const named = "java-owlapi-5.5.1";
const fixture = {
  ontologyIRI: "https://storage.example.test/ontology",
  entityIRI: "https://storage.example.test/C",
  subjectIRI: "https://storage.example.test/s",
  label: "label",
  forceStringParameter: "force xsd:string on literals",
  ignoredParameter: "ignored parameter",
  invalidValue: "not a boolean",
};
const cases = [
  {
    kind: "target-reuse",
    decisionId: "BEHAVIOR-STORAGE-TARGET",
    expected: { publication: "append" },
    normative: { publication: "replace" },
  },
  {
    kind: "parameters",
    decisionId: "BEHAVIOR-STORAGE-PARAMETERS",
    expected: { ignoredSame: true, forceChanged: true, refusedInvalid: true },
    normative: { refusedUnknown: true, bytesAfterRefusal: 0 },
  },
];

/** Bind the original per-format target and datatype parameter operations. */
export function storageComparisonCases() {
  return formats.flatMap((format) =>
    cases.map((operation) => {
      const storage = { format, ...operation, ...fixture };
      const input = { id: `storage/${operation.kind}/${format}` };
      const definition = {
        schemaVersion: 1,
        scenario: "public-api-behavior",
        scenarioVersion: 1,
        observationPoint: "document-target-publication",
        behaviorProfileId: named,
        measurements: ["behavior"],
        input,
        storage,
      };
      return {
        caseId: comparisonIdentity(definition),
        definition,
        input,
        imports: [],
      };
    }),
  );
}

async function storageRun(api, recipe, behaviorProfileId) {
  const manager = api.OWLManager.createOWLOntologyManager(
    behaviorProfileId ? { behaviorProfileId } : undefined,
  );
  const factory = manager.getOWLDataFactory();
  const ontology = manager.createOntology(
    factory.getOWLOntologyID(api.IRI.create(recipe.ontologyIRI)),
  );
  manager.addAxiom(
    ontology,
    factory.getOWLAnnotationAssertionAxiom(
      factory.getRDFSLabel(),
      api.IRI.create(recipe.subjectIRI),
      factory.getOWLLiteral(recipe.label),
    ),
  );
  manager.addAxiom(
    ontology,
    factory.getOWLDeclarationAxiom(
      factory.getOWLClass(api.IRI.create(recipe.entityIRI)),
    ),
  );
  const format =
    api.OWLDocumentFormats[comparisonSyntaxes[recipe.format].format];
  const save = async (
    selectedFormat,
    target = new api.StringDocumentTarget(),
  ) => {
    await manager.saveOntology(ontology, selectedFormat, target);
    return target.toString();
  };
  const profile = manager.getBehaviorProfileId();
  if (recipe.kind === "target-reuse") {
    const target = new api.StringDocumentTarget();
    const first = await save(format, target);
    const second = await save(format, target);
    return {
      profile,
      outcome: {
        publication:
          first && second === first + first
            ? "append"
            : first && second === first
              ? "replace"
              : "unexpected",
      },
      documentSha256: [sha256(first), sha256(second)],
    };
  }
  const ignoredFormat = format.withParameter(
    recipe.ignoredParameter,
    recipe.invalidValue,
  );
  if (!behaviorProfileId) {
    const target = new api.StringDocumentTarget();
    let refusedUnknown = false;
    try {
      await save(ignoredFormat, target);
    } catch {
      refusedUnknown = true;
    }
    return {
      profile,
      outcome: {
        refusedUnknown,
        bytesAfterRefusal: Buffer.byteLength(target.toString()),
      },
    };
  }
  const original = await save(format);
  const ignored = await save(ignoredFormat);
  const force = await save(
    format.withParameter(recipe.forceStringParameter, true),
  );
  const failed = new api.StringDocumentTarget();
  let refusedInvalid = false;
  try {
    await save(
      format.withParameter(recipe.forceStringParameter, recipe.invalidValue),
      failed,
    );
  } catch {
    refusedInvalid = true;
  }
  const failurePrefix = failed.toString();
  return {
    profile,
    outcome: {
      ignoredSame: original.length > 0 && original === ignored,
      forceChanged: force !== original,
      refusedInvalid,
      failurePrefix,
    },
    documentSha256: [
      sha256(original),
      sha256(ignored),
      sha256(force),
      sha256(failurePrefix),
    ],
  };
}

export async function observeStorage(api, request) {
  const selected = await storageRun(
    api,
    request.storage,
    request.behaviorProfileId,
  );
  const normative = await storageRun(api, request.storage);
  return {
    caseId: request.caseId,
    schemaVersion: 1,
    operation: request.scenario,
    effectiveSettings: {
      behaviorProfileId: selected.profile,
      defaultBehaviorProfileId: normative.profile,
    },
    networkRequests: [],
    load: { status: "completed" },
    storage: selected.outcome,
    normativeStorage: normative.outcome,
    storageDocumentSha256: selected.documentSha256,
  };
}
