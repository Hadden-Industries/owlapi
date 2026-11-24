import { AXIOM_KINDS, OWLObjectKind } from "../../model/kinds.js";
import {
  IRI,
  OWLStructuralObject,
  isCanonicalStructuralObject,
  isFactoryStructuralObject,
  nativeStructuralMethods,
} from "../../model/structural.js";
import { StructuralHashTable } from "../collections/structuralHashTable.js";
import { captureStructuralKey } from "../collections/structuralProjection.js";
import { DenseBitSet } from "../collections/denseBitSet.js";

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

// An unshared builder writes straight into the base. Publishing a clone makes
// that table immutable for both revisions. Subsequent edits touch only their
// additions and sparse copy-on-write tombstone pages until 1/8 compaction.
export class StructuralAxiomSet {
  #base = new StructuralHashTable();
  #shared = false;
  #removed;
  #added;
  #untrusted = 0;
  constructor(axioms = []) {
    if (!axioms || typeof axioms[Symbol.iterator] !== "function") {
      throw new TypeError("axioms must be iterable");
    }
    for (const axiom of axioms) {
      this.add(axiom);
    }
  }
  get size() {
    return (
      this.#base.size - (this.#removed?.size ?? 0) + (this.#added?.size ?? 0)
    );
  }
  get isFactoryValidated() {
    return this.#untrusted === 0;
  }

  add(axiom) {
    requireAxiom(axiom);
    const key = captureStructuralKey(axiom);
    if (!this.#shared) {
      const oldSize = this.#base.size;
      if (this.#base.addPrepared(axiom, key) < oldSize) {
        return false;
      }
    } else {
      const baseId = this.#base.idOfCapturedKey(key);
      if (baseId >= 0 && !this.#removed?.has(baseId)) {
        return false;
      }
      this.#added ??= new StructuralHashTable();
      const oldSize = this.#added.size;
      if (this.#added.addPrepared(axiom, key) < oldSize) {
        return false;
      }
      this.#compactIfNeeded();
    }
    if (!isFactoryStructuralObject(axiom)) {
      this.#untrusted++;
    }
    return true;
  }
  has(axiom) {
    return this.idOf(axiom) >= 0;
  }
  sameMembers(other) {
    if (this.size !== other.size) {
      return false;
    }
    if (
      this.#base !== other.#base ||
      this.#untrusted ||
      other.#untrusted ||
      OWLStructuralObject.prototype.structuralKey !==
        nativeStructuralMethods.structuralKey ||
      IRI.prototype.structuralKey !== nativeStructuralMethods.structuralKey
    ) {
      for (const value of this) {
        if (!other.has(value)) {
          return false;
        }
      }
      return true;
    }
    if (other.#removed) {
      for (const id of other.#removed.values()) {
        if (
          !this.#removed?.has(id) &&
          (other.#added?.idOfCapturedKey(this.#base.keyAt(id)) ?? -1) < 0
        ) {
          return false;
        }
      }
    }
    if (this.#added) {
      for (const [key] of this.#added.capturedEntries()) {
        const baseId = other.#base.idOfCapturedKey(key);
        if (
          (baseId < 0 || other.#removed?.has(baseId)) &&
          (other.#added?.idOfCapturedKey(key) ?? -1) < 0
        ) {
          return false;
        }
      }
    }
    return true;
  }
  idOf(axiom) {
    if (
      !isCanonicalStructuralObject(axiom) ||
      !LOGICALITY_BY_AXIOM_KIND.has(axiom.kind)
    ) {
      return -1;
    }
    return this.idOfCapturedKey(captureStructuralKey(axiom));
  }
  idOfCapturedKey(key) {
    const id = this.#base.idOfCapturedKey(key);
    if (id >= 0 && !this.#removed?.has(id)) {
      return id - (this.#removed?.countBefore(id) ?? 0);
    }
    const added = this.#added?.idOfCapturedKey(key) ?? -1;
    return added < 0
      ? -1
      : this.#base.size - (this.#removed?.size ?? 0) + added;
  }
  valueAt(id) {
    if (!Number.isInteger(id) || id < 0 || id >= this.size) {
      return undefined;
    }
    const baseSize = this.#base.size - (this.#removed?.size ?? 0);
    return id < baseSize
      ? this.#base.valueAt(this.#removed?.selectClear(id) ?? id)
      : this.#added.valueAt(id - baseSize);
  }
  delete(axiom) {
    const key = captureStructuralKey(requireAxiom(axiom));
    const id = this.#base.idOfCapturedKey(key);
    let original;
    if (id >= 0 && !this.#removed?.has(id)) {
      original = this.#base.valueAt(id);
      this.#shared = true;
      (this.#removed ??= new DenseBitSet(this.#base.size)).add(id);
    } else {
      original = this.#added?.valueForCapturedKey(key);
      if (original === undefined) {
        return false;
      }
      this.#added.deleteKey(key);
    }
    if (!isFactoryStructuralObject(original)) {
      this.#untrusted--;
    }
    this.#compactIfNeeded();
    return true;
  }
  #compactIfNeeded() {
    if (
      (this.#removed?.size ?? 0) + (this.#added?.size ?? 0) <=
      this.#base.size / 8
    ) {
      return;
    }
    const flat = new StructuralHashTable();
    for (let id = 0; id < this.#base.size; id++) {
      if (!this.#removed?.has(id)) {
        flat.addPrepared(this.#base.valueAt(id), this.#base.keyAt(id));
      }
    }
    if (this.#added) {
      for (const [key, value] of this.#added.capturedEntries()) {
        flat.addPrepared(value, key);
      }
    }
    this.#base = flat;
    this.#removed = undefined;
    this.#added = undefined;
    this.#shared = false;
  }
  clone() {
    const other = new StructuralAxiomSet();
    this.#shared = true;
    other.#shared = true;
    other.#base = this.#base;
    other.#removed = this.#removed?.clone();
    other.#added = this.#added?.clone();
    other.#untrusted = this.#untrusted;
    return other;
  }
  cloneForAddition() {
    return this.clone();
  }
  *values() {
    if (!this.#removed) {
      yield* this.#base.values();
    } else {
      for (let id = 0; id < this.#base.size; id++) {
        if (!this.#removed.has(id)) {
          yield this.#base.valueAt(id);
        }
      }
    }
    if (this.#added) {
      yield* this.#added.values();
    }
  }
  *reverseValues() {
    if (this.#added) {
      yield* this.#added.reverseValues();
    }
    for (let id = this.#base.size - 1; id >= 0; id--) {
      if (!this.#removed?.has(id)) {
        yield this.#base.valueAt(id);
      }
    }
  }
  [Symbol.iterator]() {
    return this.values();
  }
  toFrozenArray() {
    return Object.freeze([...this]);
  }
  toSet() {
    return new Set(this);
  }
}

export const isLogicalAxiom = (axiom) => {
  const normalizedAxiom = requireAxiom(axiom);
  return LOGICALITY_BY_AXIOM_KIND.get(normalizedAxiom.kind);
};
