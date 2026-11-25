import { OWLObjectKind as K } from "../../model/kinds.js";
import { readSnapshotAxioms } from "../model/ontologyState.js";

const finishTrees = async (
  parents,
  namedEdges,
  budget,
  violation,
  root,
  trees,
  withRoot,
  firstItem,
  iter,
) => {
  await budget.yieldTurn();
  const visitTreeKey = (item) => {
    const tree = root(item);
    trees.add(tree);
    if ((namedEdges.get(item) ?? 0) <= 1) withRoot.add(tree);
  };
  visitTreeKey(firstItem);
  for (let step = iter.next(); !step.done; step = iter.next()) {
    budget.check();
    if (budget.shouldYield()) await budget.yieldTurn();
    visitTreeKey(step.value);
  }
  for (const tree of trees)
    if (!withRoot.has(tree)) violation("ANONYMOUS_TREE_WITHOUT_ROOT", { tree });
};

const scanTrees = (parents, namedEdges, budget, violation, root) => {
  const trees = new Set(),
    withRoot = new Set();
  const iter = parents.keys();
  for (let step = iter.next(); !step.done; step = iter.next()) {
    const item = step.value;
    budget.check();
    if (budget.shouldYield()) {
      return finishTrees(
        parents,
        namedEdges,
        budget,
        violation,
        root,
        trees,
        withRoot,
        item,
        iter,
      );
    }
    const tree = root(item);
    trees.add(tree);
    if ((namedEdges.get(item) ?? 0) <= 1) withRoot.add(tree);
  }
  for (const tree of trees)
    if (!withRoot.has(tree)) violation("ANONYMOUS_TREE_WITHOUT_ROOT", { tree });
  return undefined;
};

export const inspectAnonymousGraph = (
  axioms,
  anonymousNodes,
  budget,
  violation,
  members,
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
  const visitAssertion = (value, scope) => {
    if (value.kind !== K.OBJECT_PROPERTY_ASSERTION_AXIOM) return;
    const leftAnonymous = value.subject.kind === K.ANONYMOUS_INDIVIDUAL;
    const rightAnonymous = value.value.kind === K.ANONYMOUS_INDIVIDUAL;
    if (leftAnonymous && rightAnonymous) {
      const a = key(value.subject, scope),
        b = key(value.value, scope);
      // json-identity-contract: ordered-tuple; owner: anonymous-individual profile; reason: Sorted scoped individual keys give an unambiguous two-string edge identity.
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
  };
  if (members) {
    for (let m = 0; m < members.length; m++) {
      const { scope, snapshot } = members[m];
      const stored = readSnapshotAxioms(snapshot);
      for (let i = 0; i < stored.length; i++) {
        budget.check();
        if (budget.shouldYield()) {
          return (async () => {
            await budget.yieldTurn();
            visitAssertion(stored.valueAt(i), scope);
            for (let j = i + 1; j < stored.length; j++) {
              budget.check();
              if (budget.shouldYield()) await budget.yieldTurn();
              visitAssertion(stored.valueAt(j), scope);
            }
            for (let n = m + 1; n < members.length; n++) {
              const nextScope = members[n].scope;
              const nextStored = readSnapshotAxioms(members[n].snapshot);
              for (let j = 0; j < nextStored.length; j++) {
                budget.check();
                if (budget.shouldYield()) await budget.yieldTurn();
                visitAssertion(nextStored.valueAt(j), nextScope);
              }
            }
            const t = scanTrees(parents, namedEdges, budget, violation, root);
            if (t) await t;
          })();
        }
        visitAssertion(stored.valueAt(i), scope);
      }
    }
  } else {
    const iter = axioms[Symbol.iterator]();
    for (let step = iter.next(); !step.done; step = iter.next()) {
      budget.check();
      if (budget.shouldYield()) {
        return (async () => {
          await budget.yieldTurn();
          visitAssertion(step.value.value, step.value.scope);
          for (let rest = iter.next(); !rest.done; rest = iter.next()) {
            budget.check();
            if (budget.shouldYield()) await budget.yieldTurn();
            visitAssertion(rest.value.value, rest.value.scope);
          }
          const t = scanTrees(parents, namedEdges, budget, violation, root);
          if (t) await t;
        })();
      }
      visitAssertion(step.value.value, step.value.scope);
    }
  }
  return scanTrees(parents, namedEdges, budget, violation, root);
};
