import { comparisonIdentity } from "./comparison-evidence.mjs";

const edges = [
  ["urn:module:A", "urn:module:B"],
  ["urn:module:B", "urn:module:C"],
  ["urn:module:C", "urn:module:D"],
];
const localityBehavior = {
  decisionId: "BEHAVIOR-LOCALITY",
  seed: "urn:module:A",
  edges,
  excluded: edges[1],
  normative: { all: edges, filtered: [edges[0]] },
};

export function localityBehaviorComparisonCase() {
  const input = { id: "locality/filtered-forward-chain" };
  const definition = {
    schemaVersion: 1,
    scenario: "public-api-behavior",
    scenarioVersion: 1,
    observationPoint: "locality-fixed-point-and-filter",
    behaviorProfileId: "java-owlapi-5.5.1",
    measurements: ["behavior"],
    input,
    localityBehavior,
  };
  return {
    input,
    definition,
    caseId: comparisonIdentity(definition),
    imports: [],
  };
}

async function trace(api, recipe, options) {
  const manager = api.OWLManager.createOWLOntologyManager(options);
  const factory = manager.getOWLDataFactory();
  const namedClass = (iri) => factory.getOWLClass(api.IRI.create(iri));
  const original = recipe.edges.map(([subClass, superClass]) =>
    factory.getOWLSubClassOfAxiom(namedClass(subClass), namedClass(superClass)),
  );
  const extractor = new api.SyntacticLocalityModuleExtractor(
    api.LocalityClass.BOTTOM,
    original,
  );
  const seed = [namedClass(recipe.seed)];
  const [excludedSub, excludedSuper] = recipe.excluded;
  const edgesFor = (axioms) =>
    [...axioms]
      .map(({ subClass, superClass }) => [
        subClass.iri.value,
        superClass.iri.value,
      ])
      .sort();
  const all = edgesFor(await extractor.extract(seed));
  const filtered = edgesFor(
    await extractor.extract(
      seed,
      ({ subClass, superClass }) =>
        subClass.iri.value !== excludedSub ||
        superClass.iri.value !== excludedSuper,
    ),
  );
  return {
    profile: manager.getBehaviorProfileId(),
    observed: { all, filtered },
  };
}

export async function observeLocalityBehavior(api, request) {
  const selected = await trace(api, request.localityBehavior, {
    behaviorProfileId: request.behaviorProfileId,
  });
  const normative = await trace(api, request.localityBehavior);
  return {
    schemaVersion: 1,
    caseId: request.caseId,
    operation: request.scenario,
    effectiveSettings: {
      behaviorProfileId: selected.profile,
      defaultBehaviorProfileId: normative.profile,
    },
    networkRequests: [],
    load: { status: "completed" },
    localityBehavior: selected.observed,
    normativeLocalityBehavior: normative.observed,
  };
}
