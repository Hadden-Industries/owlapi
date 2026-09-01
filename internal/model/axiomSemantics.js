import { AXIOM_KINDS, OWLObjectKind } from "../../model/kinds.js";
import { isCanonicalStructuralObject } from "../../model/structural.js";

const LOGICALITY_BY_AXIOM_KIND = new Map([
  [OWLObjectKind.DECLARATION_AXIOM, false],
  [OWLObjectKind.SUBCLASS_OF_AXIOM, true],
  [OWLObjectKind.EQUIVALENT_CLASSES_AXIOM, true],
  [OWLObjectKind.DISJOINT_CLASSES_AXIOM, true],
  [OWLObjectKind.DISJOINT_UNION_AXIOM, true],
  [OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM, true],
  [OWLObjectKind.SUB_PROPERTY_CHAIN_AXIOM, true],
  [OWLObjectKind.EQUIVALENT_OBJECT_PROPERTIES_AXIOM, true],
  [OWLObjectKind.DISJOINT_OBJECT_PROPERTIES_AXIOM, true],
  [OWLObjectKind.OBJECT_PROPERTY_DOMAIN_AXIOM, true],
  [OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM, true],
  [OWLObjectKind.INVERSE_OBJECT_PROPERTIES_AXIOM, true],
  [OWLObjectKind.FUNCTIONAL_OBJECT_PROPERTY_AXIOM, true],
  [OWLObjectKind.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM, true],
  [OWLObjectKind.REFLEXIVE_OBJECT_PROPERTY_AXIOM, true],
  [OWLObjectKind.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM, true],
  [OWLObjectKind.SYMMETRIC_OBJECT_PROPERTY_AXIOM, true],
  [OWLObjectKind.ASYMMETRIC_OBJECT_PROPERTY_AXIOM, true],
  [OWLObjectKind.TRANSITIVE_OBJECT_PROPERTY_AXIOM, true],
  [OWLObjectKind.SUB_DATA_PROPERTY_AXIOM, true],
  [OWLObjectKind.EQUIVALENT_DATA_PROPERTIES_AXIOM, true],
  [OWLObjectKind.DISJOINT_DATA_PROPERTIES_AXIOM, true],
  [OWLObjectKind.DATA_PROPERTY_DOMAIN_AXIOM, true],
  [OWLObjectKind.DATA_PROPERTY_RANGE_AXIOM, true],
  [OWLObjectKind.FUNCTIONAL_DATA_PROPERTY_AXIOM, true],
  [OWLObjectKind.DATATYPE_DEFINITION_AXIOM, true],
  [OWLObjectKind.HAS_KEY_AXIOM, true],
  [OWLObjectKind.SAME_INDIVIDUAL_AXIOM, true],
  [OWLObjectKind.DIFFERENT_INDIVIDUALS_AXIOM, true],
  [OWLObjectKind.CLASS_ASSERTION_AXIOM, true],
  [OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM, true],
  [OWLObjectKind.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM, true],
  [OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM, true],
  [OWLObjectKind.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM, true],
  [OWLObjectKind.ANNOTATION_ASSERTION_AXIOM, false],
  [OWLObjectKind.SUB_ANNOTATION_PROPERTY_AXIOM, false],
  [OWLObjectKind.ANNOTATION_PROPERTY_DOMAIN_AXIOM, false],
  [OWLObjectKind.ANNOTATION_PROPERTY_RANGE_AXIOM, false],
]);

if (
  LOGICALITY_BY_AXIOM_KIND.size !== AXIOM_KINDS.length ||
  AXIOM_KINDS.some((kind) => !LOGICALITY_BY_AXIOM_KIND.has(kind))
) {
  throw new Error(
    "The logical-axiom classification must cover every supported axiom kind",
  );
}

const typedAxiomError = (message, { axiom, index, operation } = {}) => {
  const error = new TypeError(message);
  if (operation !== undefined) {
    error.operation = operation;
  }
  if (index !== undefined) {
    error.index = index;
  }
  if (axiom !== undefined) {
    error.axiom = axiom;
  }
  return error;
};

export const requireAxiom = (
  axiom,
  { index, name = "axiom", operation } = {},
) => {
  if (
    !isCanonicalStructuralObject(axiom) ||
    !LOGICALITY_BY_AXIOM_KIND.has(axiom.kind)
  ) {
    throw typedAxiomError(`${name} must be an OWL axiom`, {
      axiom,
      index,
      operation,
    });
  }
  return axiom;
};

export const materializeAxiomIterable = (
  axioms,
  { name = "axioms", operation } = {},
) => {
  if (!axioms || typeof axioms[Symbol.iterator] !== "function") {
    throw typedAxiomError(`${name} must be iterable`, { operation });
  }

  const materializedAxioms = [];
  let index = 0;
  for (const axiom of axioms) {
    materializedAxioms.push(
      requireAxiom(axiom, { index, name: `${name}[${index}]`, operation }),
    );
    index += 1;
  }
  return Object.freeze(materializedAxioms);
};

export class StructuralAxiomSet {
  #axiomsByStructuralKey = new Map();

  constructor(axioms = []) {
    if (!axioms || typeof axioms[Symbol.iterator] !== "function") {
      throw new TypeError("axioms must be iterable");
    }
    for (const axiom of axioms) {
      this.add(axiom);
    }
  }

  get size() {
    return this.#axiomsByStructuralKey.size;
  }

  add(axiom) {
    const normalizedAxiom = requireAxiom(axiom);
    const structuralKey = normalizedAxiom.structuralKey();
    if (this.#axiomsByStructuralKey.has(structuralKey)) {
      return false;
    }
    this.#axiomsByStructuralKey.set(structuralKey, normalizedAxiom);
    return true;
  }

  has(axiom) {
    return (
      isCanonicalStructuralObject(axiom) &&
      LOGICALITY_BY_AXIOM_KIND.has(axiom.kind) &&
      this.#axiomsByStructuralKey.has(axiom.structuralKey())
    );
  }

  clone() {
    return new StructuralAxiomSet(this);
  }

  values() {
    return this.#axiomsByStructuralKey.values();
  }

  [Symbol.iterator]() {
    return this.values();
  }

  toFrozenArray() {
    return Object.freeze([...this.#axiomsByStructuralKey.values()]);
  }

  toSet() {
    return new Set(this.#axiomsByStructuralKey.values());
  }
}

export const isLogicalAxiom = (axiom) => {
  const normalizedAxiom = requireAxiom(axiom);
  return LOGICALITY_BY_AXIOM_KIND.get(normalizedAxiom.kind);
};
