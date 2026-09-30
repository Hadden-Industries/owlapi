import { OWLObjectKind as K } from "../../model/kinds.js";

export const minimumTwoSetFields = new Map([
  [K.OBJECT_INTERSECTION_OF, "operands"],
  [K.OBJECT_UNION_OF, "operands"],
  [K.DATA_INTERSECTION_OF, "operands"],
  [K.DATA_UNION_OF, "operands"],
  [K.EQUIVALENT_CLASSES_AXIOM, "classExpressions"],
  [K.DISJOINT_CLASSES_AXIOM, "classExpressions"],
  [K.DISJOINT_UNION_AXIOM, "classExpressions"],
  [K.EQUIVALENT_OBJECT_PROPERTIES_AXIOM, "properties"],
  [K.DISJOINT_OBJECT_PROPERTIES_AXIOM, "properties"],
  [K.EQUIVALENT_DATA_PROPERTIES_AXIOM, "properties"],
  [K.DISJOINT_DATA_PROPERTIES_AXIOM, "properties"],
  [K.SAME_INDIVIDUAL_AXIOM, "individuals"],
  [K.DIFFERENT_INDIVIDUALS_AXIOM, "individuals"],
]);

// Repeat the retained member to satisfy concrete grammar arity without adding
// meaning or duplicating annotations.
export const repeatSingleton = (values) =>
  values.length === 1 ? [values[0], values[0]] : values;

export const hasNormalizedSingleton = (value) => {
  const pending = [value];
  const seen = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const field = minimumTwoSetFields.get(current.kind);
    if (field && current[field]?.length === 1) return true;
    for (const child of Object.values(current)) pending.push(child);
  }
  return false;
};
