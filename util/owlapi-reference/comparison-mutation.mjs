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
  {
    kind: "ontology-copy",
    decisionId: "BEHAVIOR-ONTOLOGY-COPY",
    ontologyIRI: "urn:copy:source",
    otherIRI: "urn:copy:target",
    failedIRI: "urn:copy:failed",
    entityIRI: "urn:copy:C",
    normative: {
      publishedDuringProvider: false,
      distinctCopy: true,
      copyContainsDeclaration: true,
      copyAxioms: 1,
      sourceAxioms: 1,
      ownsCopy: true,
      ownsSource: true,
      collision: { refused: true, providerCalls: 1, retainsCopy: true },
      failure: {
        preserved: true,
        retainsPartial: false,
        partialAxioms: 0,
        partialContainsDeclaration: false,
      },
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

function copyTrace(
  api,
  recipe,
  { manager, ontology, axiom, originalId },
  options,
) {
  manager.addAxiom(ontology, axiom);
  const destination = api.OWLManager.createOWLOntologyManager(options);
  const factory = destination.getOWLDataFactory();
  const targetIRI = api.IRI.create(recipe.otherIRI);
  const targetId = factory.getOWLOntologyID(targetIRI);
  let publishedDuringProvider;
  const copied = new api.OWLOntologyMerger({
    ontologies() {
      publishedDuringProvider = Boolean(destination.getOntology(targetId));
      return [ontology];
    },
  }).createMergedOntology(destination, targetIRI);
  let providerCalls = 0;
  let refused = false;
  const collision = new api.OWLOntologyMerger({
    ontologies() {
      providerCalls++;
      return [ontology];
    },
  });
  try {
    collision.createMergedOntology(destination, targetIRI);
  } catch {
    refused = true;
  }
  const failedIRI = api.IRI.create(recipe.failedIRI);
  const failure = new Error("owned provider failure");
  const failing = new api.OWLOntologyMerger({
    *ontologies() {
      yield ontology;
      throw failure;
    },
  });
  let preserved = false;
  try {
    failing.createMergedOntology(destination, failedIRI);
  } catch (error) {
    preserved = error === failure;
  }
  const partial = destination.getOntology(factory.getOWLOntologyID(failedIRI));
  return {
    publishedDuringProvider,
    distinctCopy: copied !== ontology,
    copyContainsDeclaration: copied.containsAxiom(axiom),
    copyAxioms: copied.getAxiomCount(),
    sourceAxioms: ontology.getAxiomCount(),
    ownsCopy: destination.getOntology(targetId) === copied,
    ownsSource: manager.getOntology(originalId) === ontology,
    collision: {
      refused,
      providerCalls,
      retainsCopy: destination.getOntology(targetId) === copied,
    },
    failure: {
      preserved,
      retainsPartial: Boolean(partial),
      partialAxioms: partial?.getAxiomCount() ?? 0,
      partialContainsDeclaration: partial?.containsAxiom(axiom) ?? false,
    },
  };
}

/** Observe completion and manager indexes independently under both profiles. */
export function observeMutation(api, request) {
  const options = { behaviorProfileId: request.behaviorProfileId };
  const recipe = request.mutation;
  const java = mutationFixture(api, recipe, options);
  const normative = mutationFixture(api, recipe);
  let observation;
  switch (recipe.kind) {
    case "batch-publication":
      observation = observeBatch(api, java, normative);
      break;
    case "foreign-manager":
      observation = observeForeign(api, java, normative, options);
      break;
    case "ontology-copy":
      observation = {
        mutation: copyTrace(api, recipe, java, options),
        normativeMutation: copyTrace(api, recipe, normative),
      };
      break;
    default:
      throw new Error(`Unknown mutation kind ${recipe.kind}`);
  }
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
