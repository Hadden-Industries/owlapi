import { comparisonIdentity } from "./comparison-evidence.mjs";

const search = { a: "urn:timing:A", b: "urn:timing:B", c: "urn:timing:C" };
const closure = { root: "urn:timing:root", child: "urn:timing:child" };
const recipes = [
  {
    kind: "deferred-search",
    decisionId: "BEHAVIOR-SEARCH-CONSUMPTION",
    ...search,
    normative: {
      beforeConsumption: 0,
      emptyThenAdd: [search.b],
      deferred: [search.b],
      afterConsumption: 1,
      presentThenAdd: [search.b, search.c],
      presentThenRemove: [search.c],
      repeatRefused: true,
    },
  },
  {
    kind: "closure-provider",
    decisionId: "BEHAVIOR-CLOSURE-PROVIDER",
    ...closure,
    normative: {
      beforeImport: [closure.root],
      afterImport: [closure.child, closure.root],
      beforeRemoval: [closure.child, closure.root],
      afterRemoval: [closure.root],
      foreignRefusedAtQuery: true,
    },
  },
];

export function queryComparisonCases() {
  return recipes.map((queryBehavior) => {
    const input = { id: `query/${queryBehavior.kind}` };
    const definition = {
      schemaVersion: 1,
      scenario: "public-api-behavior",
      scenarioVersion: 1,
      observationPoint: "query-construction-and-consumption",
      behaviorProfileId: "java-owlapi-5.5.1",
      measurements: ["behavior"],
      input,
      queryBehavior,
    };
    return {
      caseId: comparisonIdentity(definition),
      definition,
      input,
      imports: [],
    };
  });
}

function deferredSearch(api, manager, recipe) {
  const ontology = manager.createOntology();
  const factory = manager.getOWLDataFactory();
  const [a, b, c] = [recipe.a, recipe.b, recipe.c].map((iri) =>
    factory.getOWLClass(api.IRI.create(iri)),
  );
  const superClasses = (entity, source) =>
    api.EntitySearcher.getSuperClasses(entity, source);
  const values = (stream) => [...stream].map(({ iri }) => iri.value).sort();
  const first = superClasses(a, ontology);
  let callbacks = 0;
  const stream = superClasses(a, {
    *[Symbol.iterator]() {
      callbacks++;
      yield ontology;
    },
  });
  const axiom = factory.getOWLSubClassOfAxiom(a, b);
  manager.addAxiom(ontology, axiom);
  const beforeConsumption = callbacks;
  const emptyThenAdd = values(first);
  const deferred = values(stream);
  const afterConsumption = callbacks;
  const present = superClasses(a, ontology);
  manager.addAxiom(ontology, factory.getOWLSubClassOfAxiom(a, c));
  const presentThenAdd = values(present);
  const removed = superClasses(a, ontology);
  manager.removeAxiom(ontology, axiom);
  const presentThenRemove = values(removed);
  let repeatRefused = false;
  try {
    values(removed);
  } catch (error) {
    repeatRefused = /consum/iu.test(error.message);
  }
  return {
    beforeConsumption,
    emptyThenAdd,
    deferred,
    afterConsumption,
    presentThenAdd,
    presentThenRemove,
    repeatRefused,
  };
}

function closureProvider(api, manager, recipe, options) {
  const factory = manager.getOWLDataFactory();
  const root = manager.createOntology(
    factory.getOWLOntologyID(api.IRI.create(recipe.root)),
  );
  manager.createOntology(
    factory.getOWLOntologyID(api.IRI.create(recipe.child)),
  );
  const provider = new api.OWLOntologyImportsClosureSetProvider(manager, root);
  const members = (set) =>
    [...set].map((item) => item.getOntologyID().ontologyIRI.value).sort();
  const beforeImport = provider.ontologies();
  const declaration = factory.getOWLImportsDeclaration(
    api.IRI.create(recipe.child),
  );
  manager.applyChange(new api.AddImport(root, declaration));
  const prior = members(beforeImport);
  const afterImport = members(provider.ontologies());
  const beforeRemoval = provider.ontologies();
  manager.applyChange(new api.RemoveImport(root, declaration));
  const priorRemoval = members(beforeRemoval);
  const afterRemoval = members(provider.ontologies());
  const foreign = new api.OWLOntologyImportsClosureSetProvider(
    api.OWLManager.createOWLOntologyManager(options),
    root,
  );
  let foreignRefusedAtQuery = false;
  try {
    foreign.ontologies();
  } catch (error) {
    foreignRefusedAtQuery = error.operation === "getImportsClosure";
  }
  return {
    beforeImport: prior,
    afterImport,
    beforeRemoval: priorRemoval,
    afterRemoval,
    foreignRefusedAtQuery,
  };
}

/** Observe both profiles at the actual iterator and closure snapshot boundaries. */
export function observeQueryBehavior(api, request) {
  const recipe = request.queryBehavior;
  const options = { behaviorProfileId: request.behaviorProfileId };
  const selected = api.OWLManager.createOWLOntologyManager(options);
  const normative = api.OWLManager.createOWLOntologyManager();
  const observe =
    recipe.kind === "deferred-search" ? deferredSearch : closureProvider;
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
    queryBehavior: observe(api, selected, recipe, options),
    normativeQueryBehavior: observe(api, normative, recipe),
  };
}
