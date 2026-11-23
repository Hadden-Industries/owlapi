import { rdfDataFactory, rdfDatasetFactory } from "../rdfjs/environment.js";

const empty = Object.freeze([]);
const nativeDatasetPrototype = Object.getPrototypeOf(
  rdfDatasetFactory.dataset(),
);
const NativeDataset = nativeDatasetPrototype.constructor;
const nativeMatch = nativeDatasetPrototype.match;
const nativeReadMethods = [
  "match",
  "_match",
  "_getGraphs",
  "_findInIndex",
  "_getQuad",
  "_toId",
  "_createDataset",
  "_addToIndex",
  "_setQuad",
  "constructor",
  Symbol.iterator,
].map((name) => [
  name,
  Object.getOwnPropertyDescriptor(nativeDatasetPrototype, name)?.value,
]);
const nativeAdd = Object.getOwnPropertyDescriptor(
  nativeDatasetPrototype,
  "add",
)?.value;
const quadFields = Object.freeze(["subject", "predicate", "object", "graph"]);
const nativeArrayIterator = Array.prototype[Symbol.iterator];
const nativeDefaultGraph = rdfDataFactory.defaultGraph();
const nativeDefaultGraphPrototype = Object.getPrototypeOf(nativeDefaultGraph);
const providerIdentifierPrefix = /^(?:_:|\?|"|<<|$)/u;
const nativeNamedNodePrototype = Object.getPrototypeOf(
  rdfDataFactory.namedNode("urn:owlapi:subject-layout"),
);
const nativeSubjectPrototypes = new Set([
  nativeNamedNodePrototype,
  Object.getPrototypeOf(rdfDataFactory.blankNode("owlapi-subject-layout")),
]);
const nativeSubjectValue = (term, prototype = Object.getPrototypeOf(term)) => {
  if (
    !nativeSubjectPrototypes.has(prototype) ||
    "id" in term ||
    Object.hasOwn(term, "termType")
  )
    return undefined;
  const value = Object.getOwnPropertyDescriptor(term, "value");
  return value && Object.hasOwn(value, "value") ? value.value : undefined;
};
const nativeNamedValue = (term) => {
  if (
    Object.getPrototypeOf(term) !== nativeNamedNodePrototype ||
    "id" in term ||
    Object.hasOwn(term, "termType")
  )
    return undefined;
  const value = Object.getOwnPropertyDescriptor(term, "value");
  return value && Object.hasOwn(value, "value") ? value.value : undefined;
};

// A whole-graph match replays the provider's insertion order into a new
// dataset. Keep its native term ranks and SPO order without rebuilding the
// three query indexes for a result that will only be iterated.
const replayDefaultGraphOrder = (quads) => {
  const ranker = new NativeDataset();
  const ranks = new Uint32Array(quads.length * 3);
  const order = new Uint32Array(quads.length);
  let offset = 0;
  ranker._addToIndex = () => {};
  ranker._setQuad = (subject, predicate, object) => {
    ranks[offset++] = subject;
    ranks[offset++] = predicate;
    ranks[offset++] = object;
  };
  for (let index = 0; index < quads.length; index += 1) {
    nativeAdd.call(ranker, quads[index]);
    order[index] = index;
  }
  const compareRanks = (left, right) => {
    const a = left * 3;
    const b = right * 3;
    return (
      ranks[a] - ranks[b] ||
      ranks[a + 1] - ranks[b + 1] ||
      ranks[a + 2] - ranks[b + 2]
    );
  };
  order.sort((left, right) => compareRanks(left, right) || left - right);
  const ordered = [];
  for (let index = 0; index < order.length; index += 1) {
    const current = order[index];
    if (index + 1 === order.length || compareRanks(current, order[index + 1])) {
      ordered.push(quads[current]);
    }
  }
  return ordered;
};

/**
 * One prepared document's read-only queries, shared by its reconstruction passes.
 * DatasetCore iteration and matched-dataset iteration can differ. Preserve both
 * native orders: recovery and local handles must not change as a side effect of
 * removing repeat materialization. The selected dataset is privately owned and
 * no longer mutated. Every retained quad reference is bounded by its maxQuads.
 */
export function createRdfReadView(
  dataset,
  execution,
  nativeProjection = false,
) {
  function collect(values, observe) {
    execution.check();
    const result = [];
    for (const quad of values) {
      execution.check();
      observe?.(quad);
      result.push(quad);
    }
    execution.check();
    return Object.freeze(result);
  }
  const singletons = new Map();
  let indexSingletons =
    nativeProjection &&
    Object.getPrototypeOf(dataset) === nativeDatasetPrototype;
  let uniformNamedSingletons = indexSingletons,
    uniformPredicate,
    uniformObject;
  const observe = !indexSingletons
    ? undefined
    : (quad) => {
        if (!indexSingletons) return;
        // A one-quad subject has only one possible match order. The interpreter
        // passes its private projected dataset, whose RDF/JS terms are immutable.
        // Multi-quad subjects retain the provider's native rematerialized order.
        const subject = quad.subject;
        const subjectPrototype = Object.getPrototypeOf(subject);
        const value = nativeSubjectValue(subject, subjectPrototype);
        // Foreign terms may carry a provider-specific `id` that participates in
        // matching. Keep their exact native query path, including mixed inputs.
        if (value === undefined) {
          uniformNamedSingletons = false;
          singletons.clear();
          indexSingletons = false;
          return;
        }
        const subjectType = subject.termType;
        let terms = singletons.get(subjectType);
        if (!terms) singletons.set(subject.termType, (terms = new Map()));
        const duplicate = terms.has(value);
        terms.set(value, duplicate ? null : quad);
        if (uniformNamedSingletons) {
          for (const field of quadFields) {
            const descriptor = Object.getOwnPropertyDescriptor(quad, field);
            if (!descriptor || !Object.hasOwn(descriptor, "value")) {
              uniformNamedSingletons = false;
              break;
            }
          }
          if (
            !uniformNamedSingletons ||
            duplicate ||
            subjectType !== "NamedNode" ||
            subjectPrototype !== nativeNamedNodePrototype ||
            typeof value !== "string" ||
            providerIdentifierPrefix.test(value) ||
            quad.graph !== nativeDefaultGraph
          )
            uniformNamedSingletons = false;
          else {
            const predicate = nativeNamedValue(quad.predicate),
              object = nativeNamedValue(quad.object);
            if (
              typeof predicate !== "string" ||
              typeof object !== "string" ||
              providerIdentifierPrefix.test(predicate) ||
              providerIdentifierPrefix.test(object)
            )
              uniformNamedSingletons = false;
            else if (uniformPredicate === undefined) {
              uniformPredicate = predicate;
              uniformObject = object;
            } else if (
              uniformPredicate !== predicate ||
              uniformObject !== object
            )
              uniformNamedSingletons = false;
          }
        }
      };
  // Classify under the existing per-quad deadline/cancellation checkpoints,
  // rather than adding an unchecked pass over the complete dataset.
  const quads = collect(dataset, observe);
  const subjects = new Map();
  let matched;
  return Object.freeze({
    quads,
    matchedQuads() {
      execution.check();
      if (matched !== undefined) return matched;
      const canReplayNativeMatch =
        nativeProjection &&
        Object.getPrototypeOf(dataset) === nativeDatasetPrototype &&
        !("id" in nativeDefaultGraph) &&
        !Object.hasOwn(nativeDefaultGraph, "termType") &&
        Object.getPrototypeOf(nativeDefaultGraph) ===
          nativeDefaultGraphPrototype &&
        Object.getOwnPropertyDescriptor(nativeDefaultGraphPrototype, "termType")
          ?.value === "DefaultGraph" &&
        Object.getOwnPropertyDescriptor(nativeNamedNodePrototype, "termType")
          ?.value === "NamedNode" &&
        typeof nativeAdd === "function" &&
        Object.getOwnPropertyDescriptor(nativeDatasetPrototype, "add")
          ?.value === nativeAdd &&
        Object.getOwnPropertyDescriptor(Array.prototype, "values")?.value ===
          nativeArrayIterator &&
        Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator)
          ?.value === nativeArrayIterator &&
        nativeReadMethods.every(
          ([name, method]) =>
            typeof method === "function" &&
            !Object.hasOwn(dataset, name) &&
            Object.getOwnPropertyDescriptor(nativeDatasetPrototype, name)
              ?.value === method,
        );
      // Reindexing retains subject order only when each subject has one quad
      // and the two constant terms never occur as subjects. There is no inner
      // subject order to change, and constants cannot gain an earlier rank.
      const alreadyInReplayOrder =
        uniformNamedSingletons &&
        uniformPredicate !== undefined &&
        !singletons.get("NamedNode")?.has(uniformPredicate) &&
        !singletons.get("NamedNode")?.has(uniformObject);
      let ordered;
      if (canReplayNativeMatch && alreadyInReplayOrder) {
        ordered = quads;
      } else if (
        canReplayNativeMatch &&
        quads.every(
          (quad) =>
            Object.getOwnPropertyDescriptor(quad, "graph")?.value ===
            nativeDefaultGraph,
        )
      ) {
        ordered = replayDefaultGraphOrder(quads);
      } else {
        ordered = dataset.match(null, null, null, null);
      }
      matched = collect(ordered);
      return matched;
    },
    outgoing(subject, predicate) {
      execution.check();
      // Validated RDF subjects are named/blank nodes; their type and value, not
      // object identity or a delimiter-concatenated key, define equality.
      let terms = subjects.get(subject.termType);
      if (!terms) subjects.set(subject.termType, (terms = new Map()));
      let entry = terms.get(subject.value);
      if (!entry) {
        const singleton = singletons
          .get(subject.termType)
          ?.get(nativeSubjectValue(subject));
        const nativeSingleton = singleton && dataset.match === nativeMatch;
        let stablePredicateValue;
        if (nativeSingleton) {
          const predicate = Object.getOwnPropertyDescriptor(
            singleton,
            "predicate",
          );
          if (
            predicate &&
            Object.hasOwn(predicate, "value") &&
            predicate.value &&
            typeof predicate.value === "object"
          ) {
            const value = Object.getOwnPropertyDescriptor(
              predicate.value,
              "value",
            );
            if (
              value &&
              Object.hasOwn(value, "value") &&
              typeof value.value === "string"
            )
              stablePredicateValue = value.value;
          }
        }
        if (nativeSingleton && stablePredicateValue !== undefined) {
          // Both private results are the same frozen singleton. Preserve every
          // original collection/index checkpoint without duplicate arrays/Maps.
          execution.check();
          const all = [];
          execution.check();
          all.push(singleton);
          execution.check();
          Object.freeze(all);
          execution.check();
          const singletonPredicate = stablePredicateValue;
          execution.check();
          entry = { all, predicates: undefined, singletonPredicate };
          terms.set(subject.value, entry);
        } else {
          const all = collect(
            nativeSingleton
              ? [singleton]
              : dataset.match(subject, null, null, null),
          );
          const predicates = new Map();
          for (const quad of all) {
            execution.check();
            let values = predicates.get(quad.predicate.value);
            if (!values) predicates.set(quad.predicate.value, (values = []));
            values.push(quad);
          }
          for (const values of predicates.values()) Object.freeze(values);
          execution.check();
          entry = { all, predicates, singletonPredicate: undefined };
          terms.set(subject.value, entry);
        }
      }
      return predicate === undefined
        ? entry.all
        : entry.predicates === undefined
          ? entry.singletonPredicate === predicate
            ? entry.all
            : empty
          : (entry.predicates.get(predicate) ?? empty);
    },
  });
}
