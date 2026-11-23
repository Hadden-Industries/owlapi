import { comparisonIdentity } from "./comparison-evidence.mjs";

const javaProfile = "java-owlapi-5.5.1";
const recipes = [
  {
    kind: "batch-publication",
    decisionId: "BEHAVIOR-MUTATION-PUBLICATION",
    ontologyIRI: "urn:mutation:batch",
    otherIRI: "urn:mutation:collision",
    entityIRI: "urn:mutation:C",
    normative: {
      rejected: true,
      axiomCount: 0,
      retainsOriginal: true,
      retainsOccupied: true,
    },
  },
  {
    kind: "foreign-manager",
    decisionId: "BEHAVIOR-FOREIGN-MANAGER-MUTATION",
    ontologyIRI: "urn:mutation:original",
    otherIRI: "urn:mutation:renamed",
    entityIRI: "urn:mutation:C",
    normative: {
      rejected: true,
      axiomCount: 0,
      retainsOriginal: true,
      foreignContainsOriginal: false,
    },
  },
];

/** Keep stateful mutation sequences separate from configuration and load cases. */
export function mutationComparisonCases() {
  return recipes.map((mutation) => {
    const input = { id: `mutation/${mutation.kind}` };
    const definition = {
      schemaVersion: 1,
      scenario: "public-api-behavior",
      scenarioVersion: 1,
      observationPoint: "mutation-return-and-publication-state",
      behaviorProfileId: javaProfile,
      measurements: ["behavior"],
      input,
      mutation,
    };
    return {
      input,
      definition,
      caseId: comparisonIdentity(definition),
      imports: [],
    };
  });
}

function mutationFixture(api, recipe, options) {
  const manager = api.OWLManager.createOWLOntologyManager(options);
  const factory = manager.getOWLDataFactory();
  const originalId = factory.getOWLOntologyID(
    api.IRI.create(recipe.ontologyIRI),
  );
  const otherId = factory.getOWLOntologyID(api.IRI.create(recipe.otherIRI));
  const ontology = manager.createOntology(originalId);
  const axiom = factory.getOWLDeclarationAxiom(
    factory.getOWLClass(api.IRI.create(recipe.entityIRI)),
  );
  return { manager, originalId, otherId, ontology, axiom };
}

function collision(api, { manager, originalId, otherId, ontology, axiom }) {
  const occupied = manager.createOntology(otherId);
  const changes = [
    new api.AddAxiom(ontology, axiom),
    new api.SetOntologyID(ontology, otherId),
  ];
  let rejected = false;
  try {
    manager.applyChanges(changes);
  } catch {
    rejected = true;
  }
  return {
    rejected,
    axiomCount: ontology.getAxiomCount(),
    retainsOriginal:
      ontology.getOntologyID() === originalId &&
      manager.getOntology(originalId) === ontology,
    retainsOccupied: manager.getOntology(otherId) === occupied,
  };
}

function observeBatch(api, java, normative) {
  const { manager, ontology, axiom } = java;
  const empty = manager.applyChanges([]);
  const add = [
    manager.addAxiom(ontology, axiom),
    manager.addAxiom(ontology, axiom),
  ];
  const remove = [
    manager.removeAxiom(ontology, axiom),
    manager.removeAxiom(ontology, axiom),
  ];
  const netZero = manager.applyChanges([
    new api.AddAxiom(ontology, axiom),
    new api.RemoveAxiom(ontology, axiom),
  ]);
  const netZeroAxiomCount = ontology.getAxiomCount();
  return {
    mutation: {
      empty,
      add,
      remove,
      netZero,
      netZeroAxiomCount,
      collision: collision(api, java),
    },
    normativeMutation: collision(api, normative),
  };
}

function observeForeign(api, java, normative, options) {
  const { manager, ontology, axiom, originalId, otherId } = java;
  const foreign = api.OWLManager.createOWLOntologyManager(options);
  const add = foreign.addAxiom(ontology, axiom);
  const rename = foreign.applyChange(new api.SetOntologyID(ontology, otherId));
  const normativeForeign = api.OWLManager.createOWLOntologyManager();
  let rejected = false;
  try {
    normativeForeign.addAxiom(normative.ontology, normative.axiom);
  } catch {
    rejected = true;
  }
  return {
    mutation: {
      add,
      rename,
      axiomCount: ontology.getAxiomCount(),
      renamed: ontology.getOntologyID() === otherId,
      ownerFindsOriginal: manager.getOntology(originalId) === ontology,
      ownerFindsRenamed: manager.getOntology(otherId) === ontology,
      foreignFindsOriginal: foreign.getOntology(originalId) === ontology,
      foreignFindsRenamed: foreign.getOntology(otherId) === ontology,
    },
    normativeMutation: {
      rejected,
      axiomCount: normative.ontology.getAxiomCount(),
      retainsOriginal:
        normative.ontology.getOntologyID() === normative.originalId &&
        normative.manager.getOntology(normative.originalId) ===
          normative.ontology,
      foreignContainsOriginal:
        normativeForeign.getOntology(normative.originalId) ===
        normative.ontology,
    },
  };
}

/** Observe completion and manager indexes independently under both profiles. */
export function observeMutation(api, request) {
  const options = { behaviorProfileId: request.behaviorProfileId };
  const recipe = request.mutation;
  const java = mutationFixture(api, recipe, options);
  const normative = mutationFixture(api, recipe);
  const observation =
    recipe.kind === "batch-publication"
      ? observeBatch(api, java, normative)
      : observeForeign(api, java, normative, options);
  return {
    caseId: request.caseId,
    schemaVersion: 1,
    operation: request.scenario,
    effectiveSettings: {
      behaviorProfileId: java.manager.getBehaviorProfileId(),
      defaultBehaviorProfileId: normative.manager.getBehaviorProfileId(),
    },
    networkRequests: [],
    load: { status: "completed" },
    ...observation,
  };
}
