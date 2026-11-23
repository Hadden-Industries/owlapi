import { comparisonIdentity } from "./comparison-evidence.mjs";

const rootIRI = "urn:loading:root";
const childIRI = "urn:loading:child";
const loadPublication = {
  decisionId: "BEHAVIOR-LOAD-PUBLICATION",
  rootIRI,
  childIRI,
  failedDocumentIRI: "urn:loading:document:failed",
  retryDocumentIRI: "urn:loading:document:retry",
  childDocumentIRI: "urn:loading:document:child",
  childText: `Ontology(<${childIRI}> Declaration(Class(<urn:loading:C>)))`,
  failedText: `Ontology(<${rootIRI}> Import(<${childIRI}>) NOT_SYNTAX)`,
  retryText: `Ontology(<${rootIRI}> Import(<${childIRI}>) Declaration(Class(<urn:loading:R>)))`,
  javaFailure: "UnparsableOntologyException",
  jsFailures: ["UNPARSABLE_ONTOLOGY", "OWL_SYNTAX_ERROR"],
  normative: {
    failed: { imports: [], retainedRoot: false, retainedChild: false },
    retry: { imports: [null], axioms: 1, closureSize: 2 },
  },
};

export function loadPublicationComparisonCase() {
  const input = { id: "loading/syntax-failure-and-retry" };
  const definition = {
    schemaVersion: 1,
    scenario: "public-api-behavior",
    scenarioVersion: 1,
    observationPoint: "import-visibility-and-load-publication",
    behaviorProfileId: "java-owlapi-5.5.1",
    measurements: ["behavior"],
    input,
    loadPublication,
  };
  return {
    caseId: comparisonIdentity(definition),
    definition,
    input,
    imports: [],
  };
}

async function trace(api, recipe, behaviorProfileId) {
  const source = (text, documentIRI) =>
    new api.StringDocumentSource(text, {
      format: api.OWLDocumentFormats.FUNCTIONAL,
      documentIRI: api.IRI.create(documentIRI),
    });
  const imports = [];
  const rootIRI = api.IRI.create(recipe.rootIRI);
  const manager = api.OWLManager.createOWLOntologyManager({
    ...(behaviorProfileId ? { behaviorProfileId } : {}),
    documentLoader: {
      load(iri) {
        if (iri.value !== recipe.childIRI)
          throw new Error(`Unexpected import ${iri.value}`);
        const rootId = manager.getOWLDataFactory().getOWLOntologyID(rootIRI);
        imports.push(manager.getOntology(rootId)?.getAxiomCount() ?? null);
        return source(recipe.childText, recipe.childDocumentIRI);
      },
    },
  });
  const factory = manager.getOWLDataFactory();
  const rootId = factory.getOWLOntologyID(rootIRI);
  const childId = factory.getOWLOntologyID(api.IRI.create(recipe.childIRI));
  let failure = null;
  try {
    await manager.loadOntologyFromOntologyDocument(
      source(recipe.failedText, recipe.failedDocumentIRI),
    );
  } catch (error) {
    failure = error.code ?? error.name;
  }
  const failed = {
    imports: imports.splice(0),
    retainedRoot: Boolean(manager.getOntology(rootId)),
    retainedChild: Boolean(manager.getOntology(childId)),
  };
  const retry = await manager.loadOntologyFromOntologyDocument(
    source(recipe.retryText, recipe.retryDocumentIRI),
  );
  return {
    behaviorProfileId: manager.getBehaviorProfileId(),
    failure,
    outcome: {
      failed,
      retry: {
        imports,
        axioms: retry.getAxiomCount(),
        closureSize: manager.getImportsClosure(retry).size,
      },
    },
  };
}

/** Keep the failed load's import observations distinct from the successful retry. */
export async function observeLoadPublication(api, request) {
  const recipe = request.loadPublication;
  const java = await trace(api, recipe, request.behaviorProfileId);
  const normative = await trace(api, recipe);
  return {
    schemaVersion: 1,
    caseId: request.caseId,
    operation: request.scenario,
    effectiveSettings: {
      behaviorProfileId: java.behaviorProfileId,
      defaultBehaviorProfileId: normative.behaviorProfileId,
    },
    networkRequests: [],
    load: { status: "completed" },
    loadPublication: java.outcome,
    normativeLoadPublication: normative.outcome,
    loadPublicationFailures: [java.failure, normative.failure],
  };
}
