import { OWLObjectKind as K } from "../../model/kinds.js";
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
export const reachable = async (graph, start, budget, reflexive = true) => {
  const seen = new Set(reflexive ? [start] : []),
    pending = [start];
  while (pending.length) {
    const current = pending.pop();
    for (const next of graph.get(current) ?? []) {
      await budget.checkpoint();
      if (!seen.has(next)) {
        seen.add(next);
        pending.push(next);
      }
    }
  }
  return seen;
};

export const inspectPropertyHierarchy = async (axioms, budget, violation) => {
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
  for (const entry of axioms) {
    await budget.checkpoint();
    const axiom = entry.value;
    switch (axiom.kind) {
      case K.SUB_OBJECT_PROPERTY_AXIOM:
        inclusion(
          propertyKey(axiom.subProperty),
          propertyKey(axiom.superProperty),
        );
        break;
      case K.EQUIVALENT_OBJECT_PROPERTIES_AXIOM:
        for (const property of axiom.properties) {
          budget.check();
          equivalent(propertyKey(axiom.properties[0]), propertyKey(property));
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
        chains.push(entry);
        break;
    }
  }
  const nonsimple = new Set();
  for (const start of composite)
    for (const key of await reachable(hierarchy, start, budget))
      nonsimple.add(key);
  for (const entry of chains) {
    const head = propertyKey(entry.value.superProperty),
      chain = entry.value.chain.map(propertyKey);
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
  // H and < have different meanings. Ordinary subproperty cycles are legal;
  // check the actual forbidden <(a,b) / H*(b,a) pairs, not cycles in their union.
  // The Recommendation quantifies OP1 and OP2 (named properties), not all
  // OPEs. Apply its left-inversion equivalence to named targets, including
  // pairs newly implied by transitivity. Applying it to inverse targets would
  // incorrectly reject the admitted chain (p,p) -> inverse(p).
  let changed = true;
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
  const hierarchyCache = new Map();
  for (const from of order.keys()) {
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
