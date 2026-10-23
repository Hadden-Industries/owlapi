const empty = Object.freeze([]);

/**
 * One prepared document's read-only queries, shared by its reconstruction passes.
 * DatasetCore iteration and matched-dataset iteration can differ. Preserve both
 * native orders: recovery and local handles must not change as a side effect of
 * removing repeat materialization. The selected dataset is privately owned and
 * no longer mutated. Every retained quad reference is bounded by its maxQuads.
 */
export function createRdfReadView(dataset, execution) {
  function collect(values) {
    execution.check();
    const result = [];
    for (const quad of values) {
      execution.check();
      result.push(quad);
    }
    execution.check();
    return Object.freeze(result);
  }
  const quads = collect(dataset);
  const subjects = new Map();
  let matched;
  return Object.freeze({
    quads,
    matchedQuads() {
      execution.check();
      matched ??= collect(dataset.match(null, null, null, null));
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
        const all = collect(dataset.match(subject, null, null, null));
        const predicates = new Map();
        for (const quad of all) {
          execution.check();
          let values = predicates.get(quad.predicate.value);
          if (!values) predicates.set(quad.predicate.value, (values = []));
          values.push(quad);
        }
        for (const values of predicates.values()) Object.freeze(values);
        execution.check();
        entry = { all, predicates };
        terms.set(subject.value, entry);
      }
      return predicate === undefined
        ? entry.all
        : (entry.predicates.get(predicate) ?? empty);
    },
  });
}
