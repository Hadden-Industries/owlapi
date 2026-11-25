import { OWLObjectKind as K } from "../../model/kinds.js";
import { readSnapshotAxioms } from "../model/ontologyState.js";
import { OWL_NAMESPACE as OWL } from "../rdfjs/vocabulary.js";

export const propertyKey = (property) =>
  property.kind === K.OBJECT_INVERSE_OF
    ? `1${property.inverse.iri.value}`
    : `0${property.iri.value}`;
const inverse = (key) => (key[0] === "0" ? "1" : "0") + key.slice(1);
const edge = (graph, from, to) => {
  if (!graph.has(from)) graph.set(from, new Set());
  graph.get(from).add(to);
};
const finishReachable = async (
  graph,
  budget,
  seen,
  pending,
  firstNext,
  iter,
) => {
  await budget.yieldTurn();
  if (!seen.has(firstNext)) {
    seen.add(firstNext);
    pending.push(firstNext);
  }
  for (let step = iter.next(); !step.done; step = iter.next()) {
    const next = step.value;
    budget.check();
    if (budget.shouldYield()) await budget.yieldTurn();
    if (!seen.has(next)) {
      seen.add(next);
      pending.push(next);
    }
  }
  while (pending.length) {
    const current = pending.pop();
    for (const next of graph.get(current) ?? []) {
      budget.check();
      if (budget.shouldYield()) await budget.yieldTurn();
      if (!seen.has(next)) {
        seen.add(next);
        pending.push(next);
      }
    }
  }
  return seen;
};

export const reachable = (graph, start, budget, reflexive = true) => {
  const seen = new Set(reflexive ? [start] : []),
    pending = [start];
  while (pending.length) {
    const current = pending.pop();
    const neighbors = graph.get(current);
    if (!neighbors) continue;
    const iter = neighbors[Symbol.iterator]();
    for (let step = iter.next(); !step.done; step = iter.next()) {
      const next = step.value;
      budget.check();
      if (budget.shouldYield()) {
        return finishReachable(graph, budget, seen, pending, next, iter);
      }
      if (!seen.has(next)) {
        seen.add(next);
        pending.push(next);
      }
    }
  }
  return seen;
};

const analyzePropertyRelationsAsync = async (
  hierarchy,
  order,
  composite,
  chains,
  budget,
  violation,
  resume,
) => {
  const nonsimple = resume.nonsimple;
  if (resume.phase === 1) {
    for (const key of await resume.reachedPromise) nonsimple.add(key);
    for (
      let step = resume.compIter.next();
      !step.done;
      step = resume.compIter.next()
    ) {
      for (const key of await reachable(hierarchy, step.value, budget))
        nonsimple.add(key);
    }
    for (const chainAxiom of chains) {
      const head = propertyKey(chainAxiom.superProperty),
        chain = chainAxiom.chain.map(propertyKey);
      if (
        head === `0${OWL}topObjectProperty` ||
        (chain.length === 2 && chain.every((key) => key === head))
      )
        continue;
      let operands = chain;
      if (chain[0] === head) operands = chain.slice(1);
      else if (chain.at(-1) === head) operands = chain.slice(0, -1);
      for (const operand of operands) {
        budget.check();
        edge(order, operand, head);
        if (head[0] === "0") edge(order, inverse(operand), head);
      }
    }
  }
  let changed =
    resume.phase <= 2 ? (resume.phase === 1 ? true : resume.changed) : false;
  if (resume.phase === 2) {
    const { keys } = resume;
    let k = resume.k;
    const firstAbove = await resume.abovePromise;
    for (const to of firstAbove) {
      if (to[0] === "0" && !order.get(inverse(keys[k]))?.has(to)) {
        edge(order, inverse(keys[k]), to);
        changed = true;
      }
    }
    for (k = k + 1; k < keys.length; k++) {
      const from = keys[k];
      for (const to of await reachable(order, from, budget, false)) {
        if (to[0] === "0" && !order.get(inverse(from))?.has(to)) {
          edge(order, inverse(from), to);
          changed = true;
        }
      }
    }
  }
  while (changed) {
    changed = false;
    for (const from of [...order.keys()]) {
      for (const to of await reachable(order, from, budget, false)) {
        if (to[0] === "0" && !order.get(inverse(from))?.has(to)) {
          edge(order, inverse(from), to);
          changed = true;
        }
      }
    }
  }
  const hierarchyCache = resume.hierarchyCache ?? new Map();
  const fromIter = resume.fromIter ?? order.keys();
  if (resume.phase === 3) {
    let above;
    let toIter;
    if (resume.hPromise) {
      const h = await resume.hPromise;
      hierarchyCache.set(resume.to, h);
      if (resume.from === resume.to || h.has(resume.from)) {
        violation("IRREGULAR_PROPERTY_HIERARCHY", {
          from: resume.from,
          to: resume.to,
        });
        return nonsimple;
      }
      toIter = resume.toIter;
    } else {
      above = await resume.abovePromise;
      toIter = above[Symbol.iterator]();
    }
    for (let tStep = toIter.next(); !tStep.done; tStep = toIter.next()) {
      const to = tStep.value;
      if (!hierarchyCache.has(to))
        hierarchyCache.set(to, await reachable(hierarchy, to, budget));
      if (resume.from === to || hierarchyCache.get(to).has(resume.from)) {
        violation("IRREGULAR_PROPERTY_HIERARCHY", { from: resume.from, to });
        return nonsimple;
      }
    }
  }
  for (let fStep = fromIter.next(); !fStep.done; fStep = fromIter.next()) {
    const from = fStep.value;
    const above = await reachable(order, from, budget, false);
    for (const to of above) {
      if (!hierarchyCache.has(to))
        hierarchyCache.set(to, await reachable(hierarchy, to, budget));
      if (from === to || hierarchyCache.get(to).has(from)) {
        violation("IRREGULAR_PROPERTY_HIERARCHY", { from, to });
        return nonsimple;
      }
    }
  }
  return nonsimple;
};

const analyzePropertyRelations = (
  hierarchy,
  order,
  composite,
  chains,
  budget,
  violation,
) => {
  const nonsimple = new Set();
  const compIter = composite[Symbol.iterator]();
  for (let step = compIter.next(); !step.done; step = compIter.next()) {
    const reached = reachable(hierarchy, step.value, budget);
    if (reached instanceof Promise) {
      return analyzePropertyRelationsAsync(
        hierarchy,
        order,
        composite,
        chains,
        budget,
        violation,
        { phase: 1, nonsimple, compIter, reachedPromise: reached },
      );
    }
    for (const key of reached) nonsimple.add(key);
  }
  for (const chainAxiom of chains) {
    const head = propertyKey(chainAxiom.superProperty),
      chain = chainAxiom.chain.map(propertyKey);
    if (
      head === `0${OWL}topObjectProperty` ||
      (chain.length === 2 && chain.every((key) => key === head))
    )
      continue;
    let operands = chain;
    if (chain[0] === head) operands = chain.slice(1);
    else if (chain.at(-1) === head) operands = chain.slice(0, -1);
    for (const operand of operands) {
      budget.check();
      edge(order, operand, head);
      if (head[0] === "0") edge(order, inverse(operand), head);
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    const keys = [...order.keys()];
    for (let k = 0; k < keys.length; k++) {
      const from = keys[k];
      const above = reachable(order, from, budget, false);
      if (above instanceof Promise) {
        return analyzePropertyRelationsAsync(
          hierarchy,
          order,
          composite,
          chains,
          budget,
          violation,
          {
            phase: 2,
            nonsimple,
            keys,
            k,
            changed,
            abovePromise: above,
          },
        );
      }
      for (const to of above) {
        if (to[0] === "0" && !order.get(inverse(from))?.has(to)) {
          edge(order, inverse(from), to);
          changed = true;
        }
      }
    }
  }
  const hierarchyCache = new Map();
  const fromIter = order.keys();
  for (let fStep = fromIter.next(); !fStep.done; fStep = fromIter.next()) {
    const from = fStep.value;
    const above = reachable(order, from, budget, false);
    if (above instanceof Promise) {
      return analyzePropertyRelationsAsync(
        hierarchy,
        order,
        composite,
        chains,
        budget,
        violation,
        {
          phase: 3,
          nonsimple,
          hierarchyCache,
          fromIter,
          from,
          abovePromise: above,
        },
      );
    }
    const toIter = above[Symbol.iterator]();
    for (let tStep = toIter.next(); !tStep.done; tStep = toIter.next()) {
      const to = tStep.value;
      if (!hierarchyCache.has(to)) {
        const h = reachable(hierarchy, to, budget);
        if (h instanceof Promise) {
          return analyzePropertyRelationsAsync(
            hierarchy,
            order,
            composite,
            chains,
            budget,
            violation,
            {
              phase: 3,
              nonsimple,
              hierarchyCache,
              fromIter,
              from,
              toIter,
              to,
              hPromise: h,
            },
          );
        }
        hierarchyCache.set(to, h);
      }
      if (from === to || hierarchyCache.get(to).has(from)) {
        violation("IRREGULAR_PROPERTY_HIERARCHY", { from, to });
        return nonsimple;
      }
    }
  }
  return nonsimple;
};

export const inspectPropertyHierarchy = (
  axioms,
  budget,
  violation,
  members,
) => {
  const hierarchy = new Map(),
    order = new Map();
  const composite = new Set([
    `0${OWL}topObjectProperty`,
    `0${OWL}bottomObjectProperty`,
  ]);
  const inclusion = (sub, sup) => {
    edge(hierarchy, sub, sup);
    edge(hierarchy, inverse(sub), inverse(sup));
  };
  const equivalent = (a, b) => {
    inclusion(a, b);
    inclusion(b, a);
  };
  const markComposite = (value) => {
    const key = propertyKey(value);
    composite.add(key);
    composite.add(inverse(key));
  };
  const chains = [];
  const handleAxiom = (axiom) => {
    switch (axiom.kind) {
      case K.SUB_OBJECT_PROPERTY_AXIOM:
        inclusion(
          propertyKey(axiom.subProperty),
          propertyKey(axiom.superProperty),
        );
        break;
      case K.EQUIVALENT_OBJECT_PROPERTIES_AXIOM:
        for (let i = 0; i < axiom.properties.length; i++) {
          budget.check();
          equivalent(
            propertyKey(axiom.properties[0]),
            propertyKey(axiom.properties[i]),
          );
        }
        break;
      case K.INVERSE_OBJECT_PROPERTIES_AXIOM:
        equivalent(
          propertyKey(axiom.properties[0]),
          inverse(propertyKey(axiom.properties[1])),
        );
        break;
      case K.SYMMETRIC_OBJECT_PROPERTY_AXIOM:
        equivalent(
          propertyKey(axiom.property),
          inverse(propertyKey(axiom.property)),
        );
        break;
      case K.TRANSITIVE_OBJECT_PROPERTY_AXIOM:
        markComposite(axiom.property);
        break;
      case K.SUB_PROPERTY_CHAIN_AXIOM:
        markComposite(axiom.superProperty);
        chains.push(axiom);
        break;
    }
  };
  if (members) {
    for (let m = 0; m < members.length; m++) {
      const stored = readSnapshotAxioms(members[m].snapshot);
      for (let i = 0; i < stored.length; i++) {
        budget.check();
        if (budget.shouldYield()) {
          return (async () => {
            await budget.yieldTurn();
            handleAxiom(stored.valueAt(i));
            for (let j = i + 1; j < stored.length; j++) {
              budget.check();
              if (budget.shouldYield()) await budget.yieldTurn();
              handleAxiom(stored.valueAt(j));
            }
            for (let n = m + 1; n < members.length; n++) {
              const nextStored = readSnapshotAxioms(members[n].snapshot);
              for (let j = 0; j < nextStored.length; j++) {
                budget.check();
                if (budget.shouldYield()) await budget.yieldTurn();
                handleAxiom(nextStored.valueAt(j));
              }
            }
            return analyzePropertyRelations(
              hierarchy,
              order,
              composite,
              chains,
              budget,
              violation,
            );
          })();
        }
        handleAxiom(stored.valueAt(i));
      }
    }
  } else {
    const iter = axioms[Symbol.iterator]();
    for (let step = iter.next(); !step.done; step = iter.next()) {
      budget.check();
      if (budget.shouldYield()) {
        return (async () => {
          await budget.yieldTurn();
          handleAxiom(step.value.value);
          for (let rest = iter.next(); !rest.done; rest = iter.next()) {
            budget.check();
            if (budget.shouldYield()) await budget.yieldTurn();
            handleAxiom(rest.value.value);
          }
          return analyzePropertyRelations(
            hierarchy,
            order,
            composite,
            chains,
            budget,
            violation,
          );
        })();
      }
      handleAxiom(step.value.value);
    }
  }
  return analyzePropertyRelations(
    hierarchy,
    order,
    composite,
    chains,
    budget,
    violation,
  );
};
