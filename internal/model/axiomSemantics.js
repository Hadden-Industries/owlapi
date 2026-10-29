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

const CLONE_AXIOM_SET_TOKEN = Symbol("StructuralAxiomSet.clone");

const OWN_AXIOM_MAP_TOKEN = Symbol("StructuralAxiomSet.ownedMap");
const APPEND_CHUNK_SIZE = 16;
const copyAxiomMaps = (base, additions) => {
  const copy = new Map(base);
  for (const [key, value] of additions) copy.set(key, value);
  return copy;
};

export class StructuralAxiomSet {
  #axiomsByStructuralKey;

  constructor(axioms = [], cloneToken = undefined) {
    if (cloneToken === CLONE_AXIOM_SET_TOKEN) {
      this.#axiomsByStructuralKey = new Map(axioms);
      return;
    }
    if (cloneToken === OWN_AXIOM_MAP_TOKEN) {
      this.#axiomsByStructuralKey = axioms;
      return;
    }
    this.#axiomsByStructuralKey = new Map();
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

  delete(axiom) {
    return this.#axiomsByStructuralKey.delete(
      requireAxiom(axiom).structuralKey(),
    );
  }

  clone() {
    return new StructuralAxiomSet(
      this.#axiomsByStructuralKey,
      CLONE_AXIOM_SET_TOKEN,
    );
  }

  cloneForAddition() {
    return cloneForAppend(this.#axiomsByStructuralKey);
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

// Only incremental addition clones use this representation. The ordinary set's
// lookup, mutation, iteration and bulk-construction paths remain unchanged.
class AppendStructuralAxiomSet {
  #base;
  #additions;
  constructor(base, additions = []) {
    this.#base = base;
    this.#additions = new Map(additions);
  }
  get size() {
    return this.#base.size + this.#additions.size;
  }
  add(axiom) {
    const normalized = requireAxiom(axiom),
      key = normalized.structuralKey();
    if (this.#base.has(key) || this.#additions.has(key)) return false;
    this.#additions.set(key, normalized);
    return true;
  }
  has(axiom) {
    if (
      !isCanonicalStructuralObject(axiom) ||
      !LOGICALITY_BY_AXIOM_KIND.has(axiom.kind)
    )
      return false;
    const key = axiom.structuralKey();
    return this.#base.has(key) || this.#additions.has(key);
  }
  delete(axiom) {
    const key = requireAxiom(axiom).structuralKey();
    if (!this.#base.has(key) && !this.#additions.has(key)) return false;
    this.#base = copyAxiomMaps(this.#base, this.#additions);
    this.#additions = new Map();
    return this.#base.delete(key);
  }
  clone() {
    return new StructuralAxiomSet(
      copyAxiomMaps(this.#base, this.#additions),
      OWN_AXIOM_MAP_TOKEN,
    );
  }
  cloneForAddition() {
    return this.#additions.size < APPEND_CHUNK_SIZE
      ? new AppendStructuralAxiomSet(this.#base, this.#additions)
      : new AppendStructuralAxiomSet(
          copyAxiomMaps(this.#base, this.#additions),
        );
  }
  *values() {
    yield* this.#base.values();
    yield* this.#additions.values();
  }
  [Symbol.iterator]() {
    return this.values();
  }
  toFrozenArray() {
    return Object.freeze([...this.#base.values(), ...this.#additions.values()]);
  }
  toSet() {
    return new Set([...this.#base.values(), ...this.#additions.values()]);
  }
}
function cloneForAppend(entries) {
  return entries.size < APPEND_CHUNK_SIZE
    ? new StructuralAxiomSet(entries, CLONE_AXIOM_SET_TOKEN)
    : new AppendStructuralAxiomSet(new Map(entries));
}

export const isLogicalAxiom = (axiom) => {
  const normalizedAxiom = requireAxiom(axiom);
  return LOGICALITY_BY_AXIOM_KIND.get(normalizedAxiom.kind);
};
