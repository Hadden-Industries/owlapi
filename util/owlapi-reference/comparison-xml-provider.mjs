import { comparisonIdentity } from "./comparison-evidence.mjs";

export function xmlProviderDocument(subset, content, literalAttributes = "") {
  const doctype = subset === null ? "" : `<!DOCTYPE Ontology [${subset}]>`;
  return `${doctype}<Ontology xmlns="http://www.w3.org/2002/07/owl#"><Annotation><AnnotationProperty IRI="urn:xml:p"/><Literal ${literalAttributes}>${content}</Literal></Annotation></Ontology>`;
}

const returned = { status: "return", value: "xx" };
const refused = { status: "refused" };
const xmlProvider = {
  decisionId: "BEHAVIOR-XML-PROVIDER",
  limits: ["0", "1", "2", "-1", "bad"],
  document: xmlProviderDocument("<!ENTITY a 'x'>", "&a;&a;"),
  plainDocument: xmlProviderDocument(null, "xx"),
  javaRows: [returned, refused, returned, returned, refused],
  normative: returned,
};

export function xmlProviderComparisonCase() {
  const input = { id: "xml/finite-entity-expansion" };
  const definition = {
    schemaVersion: 1,
    scenario: "public-api-behavior",
    scenarioVersion: 1,
    observationPoint: "provider-entity-limit-and-literal-value",
    behaviorProfileId: "java-owlapi-5.5.1",
    measurements: ["behavior"],
    input,
    xmlProvider,
  };
  return {
    caseId: comparisonIdentity(definition),
    definition,
    input,
    imports: [],
  };
}

async function trace(api, manager, text, limit) {
  const profile = manager.getBehaviorProfileId();
  let configuration = manager.getOntologyLoaderConfiguration();
  if (limit !== undefined)
    configuration = configuration.setEntityExpansionLimit(limit);
  let ontology;
  try {
    ontology = await manager.loadOntologyFromOntologyDocument(
      new api.StringDocumentSource(text, {
        format: api.OWLDocumentFormats.OWL_XML,
      }),
      configuration,
    );
  } catch (error) {
    return {
      profile,
      outcome: { status: "refused" },
      category: error.code ?? error.name,
    };
  }
  const [annotation] = ontology.getAnnotations();
  return {
    profile,
    outcome: { status: "return", value: annotation.value.lexicalForm },
    category: null,
  };
}

export async function observeXmlProvider(api, request) {
  const recipe = request.xmlProvider;
  const options = { behaviorProfileId: request.behaviorProfileId };
  const actual = [];
  for (const limit of recipe.limits) {
    actual.push(
      await trace(
        api,
        api.OWLManager.createOWLOntologyManager(options),
        recipe.document,
        limit,
      ),
    );
  }
  const normative = api.OWLManager.createOWLOntologyManager();
  const plain = await trace(api, normative, recipe.plainDocument);
  return {
    schemaVersion: 1,
    caseId: request.caseId,
    operation: request.scenario,
    effectiveSettings: {
      behaviorProfileId: actual[0].profile,
      defaultBehaviorProfileId: plain.profile,
    },
    networkRequests: [],
    load: { status: "completed" },
    xmlProvider: actual.map(({ outcome }) => outcome),
    xmlProviderFailureCategories: actual.map(({ category }) => category),
    normativeXmlProvider: plain.outcome,
  };
}
