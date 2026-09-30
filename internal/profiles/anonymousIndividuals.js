import { OWLObjectKind as K } from "../../model/kinds.js";

export const inspectAnonymousGraph = async (
  axioms,
  anonymousNodes,
  budget,
  violation,
) => {
  const parents = new Map(),
    namedEdges = new Map(),
    pairs = new Set();
  const key = (value, scope) => `${scope}:${value.structuralKey()}`;
  for (const { value, scope } of anonymousNodes)
    parents.set(key(value, scope), key(value, scope));
  const root = (item) => {
    let current = item;
    while (parents.get(current) !== current) {
      budget.check();
      current = parents.get(current);
    }
    while (item !== current) {
      const next = parents.get(item);
      parents.set(item, current);
      item = next;
    }
    return current;
  };
  for (const { value, scope } of axioms) {
    await budget.checkpoint();
    if (value.kind !== K.OBJECT_PROPERTY_ASSERTION_AXIOM) continue;
    const leftAnonymous = value.subject.kind === K.ANONYMOUS_INDIVIDUAL;
    const rightAnonymous = value.value.kind === K.ANONYMOUS_INDIVIDUAL;
    if (leftAnonymous && rightAnonymous) {
      const a = key(value.subject, scope),
        b = key(value.value, scope);
      const pair = JSON.stringify([a, b].sort());
      if (pairs.has(pair))
        violation("MULTIPLE_ANONYMOUS_EDGE_ASSERTIONS", { scope });
      else if (root(a) === root(b))
        violation("ANONYMOUS_GRAPH_NOT_FOREST", { scope });
      else parents.set(root(a), root(b));
      pairs.add(pair);
    } else if (leftAnonymous || rightAnonymous) {
      const item = key(leftAnonymous ? value.subject : value.value, scope);
      namedEdges.set(item, (namedEdges.get(item) ?? 0) + 1);
    }
  }
  const trees = new Set(),
    withRoot = new Set();
  for (const item of parents.keys()) {
    await budget.checkpoint();
    const tree = root(item);
    trees.add(tree);
    if ((namedEdges.get(item) ?? 0) <= 1) withRoot.add(tree);
  }
  for (const tree of trees)
    if (!withRoot.has(tree)) violation("ANONYMOUS_TREE_WITHOUT_ROOT", { tree });
};
