import { AXIOM_KINDS, OWLObjectKind } from "./kinds.js";

let nextAnonymousOntologyID = 0;
const AXIOM_KIND_SET = new Set(AXIOM_KINDS);
const EMPTY_STRUCTURAL_SET = Object.freeze([]);
let readPackageTuple;
let copyWithAxiomAnnotations;

const structuralTuple = (value) => {
  if (value && typeof value === "object") {
    const pkgTuple = readPackageTuple(value);
    if (pkgTuple !== undefined) return pkgTuple;
    if (typeof value.toStructuralTuple === "function") {
      const tuple = value.toStructuralTuple();
      if (!Array.isArray(tuple)) {
        throw new TypeError("OWL structural tuples must be arrays");
      }
      return Object.freeze(tuple.map(structuralTuple));
    }
    if (Array.isArray(value)) {
      return Object.freeze(value.map(structuralTuple));
    }
  }
  return value;
};

const compareCodeUnits = (left, right) => {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
};

export const structuralKey = (kind, components) =>
  JSON.stringify([kind, ...components.map(structuralTuple)]);

export const isCanonicalStructuralObject = (value) =>
  Boolean(value) &&
  typeof value.structuralKey === "function" &&
  typeof value.toStructuralTuple === "function" &&
  Object.isFrozen(value);

export const normalizeStructuralSet = (values, name) => {
  if (!values || typeof values[Symbol.iterator] !== "function") {
    throw new TypeError(`${name} must be iterable`);
  }
  if (Array.isArray(values)) {
    if (values.length === 0) return EMPTY_STRUCTURAL_SET;
    if (values.length === 1) {
      const single = values[0];
      if (!isCanonicalStructuralObject(single)) {
        throw new TypeError(`${name} must contain OWL structural objects`);
      }
      return Object.freeze([single]);
    }
  }

  const unique = new Map();
  for (const value of values) {
    if (!isCanonicalStructuralObject(value)) {
      throw new TypeError(`${name} must contain OWL structural objects`);
    }
    unique.set(value.structuralKey(), value);
  }
  if (unique.size === 0) return EMPTY_STRUCTURAL_SET;
  if (unique.size === 1) return Object.freeze([unique.values().next().value]);

  return Object.freeze(
    [...unique.entries()]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([, value]) => value),
  );
};

export class StructuralSet {
  #items = new Map();

  constructor(values = []) {
    for (const value of values) {
      this.add(value);
    }
  }

  get size() {
    return this.#items.size;
  }

  add(value) {
    if (!isCanonicalStructuralObject(value)) {
      throw new TypeError(
        "StructuralSet values must be OWL structural objects",
      );
    }
    const key = value.structuralKey();
    if (!this.#items.has(key)) {
      this.#items.set(key, value);
    }
    return this;
  }

  has(value) {
    return (
      isCanonicalStructuralObject(value) &&
      this.#items.has(value.structuralKey())
    );
  }

  values() {
    return this.#items.values();
  }

  [Symbol.iterator]() {
    return this.values();
  }

  toSet() {
    return new Set(this.#items.values());
  }
}

const AXIOM_CLONE_TOKEN = Symbol("OWLStructuralObject.axiomClone");

export class OWLStructuralObject {
  // UNSUPPORTED(OWLAPI parity): Java OWLAPI exposes a concrete interface/class
  // hierarchy for each structural type. The initial 0.1 package deliberately exposes
  // immutable objects identified by canonical `kind` values plus the exhaustive
  // dispatch helpers instead, so type-specific Java `instanceof` checks and
  // visitor interfaces are not available. This JavaScript-native representation
  // avoids a shallow runtime hierarchy while preserving OWL 2 structural
  // equivalence. Adding concrete wrapper classes would require an approved public
  // API decision and updates to `model.*` capability rows and dispatch tests.
  #key;
  #keyWithoutAnnotations;
  #componentsWithoutAnnotations;
  #tuple;

  static {
    readPackageTuple = (value) => (#tuple in value ? value.#tuple : undefined);
    copyWithAxiomAnnotations = (axiom, normalizedAnnotations) =>
      new OWLStructuralObject(axiom, normalizedAnnotations, AXIOM_CLONE_TOKEN);
  }

  constructor(kind, fields, components, { componentsWithoutAnnotations } = {}) {
    if (components === AXIOM_CLONE_TOKEN) {
      const axiom = kind;
      const normalizedAnnotations = fields;
      const bodyTuple = axiom.#tuple.slice(1, -1);
      Object.assign(this, axiom, { annotations: normalizedAnnotations });
      this.#tuple = Object.freeze([
        axiom.kind,
        ...bodyTuple,
        Object.freeze(normalizedAnnotations.map(structuralTuple)),
      ]);
      this.#componentsWithoutAnnotations =
        axiom.#componentsWithoutAnnotations ?? Object.freeze(bodyTuple);
      this.#keyWithoutAnnotations = axiom.#keyWithoutAnnotations;
      Object.freeze(this);
      return;
    }
    this.kind = kind;
    Object.assign(this, fields);
    this.#tuple = Object.freeze([kind, ...components.map(structuralTuple)]);
    if (componentsWithoutAnnotations) {
      this.#componentsWithoutAnnotations = Object.freeze(
        componentsWithoutAnnotations.map(structuralTuple),
      );
    }
    Object.freeze(this);
  }

  // Keep the exact data-field shape used by storage/source/profile validation.
  // Non-axiom structural values do not expose callable axiom-copy operations.
  get getAxiomWithoutAnnotations() {
    return AXIOM_KIND_SET.has(this.kind)
      ? getAxiomWithoutAnnotations
      : undefined;
  }

  get getAnnotatedAxiom() {
    return AXIOM_KIND_SET.has(this.kind) ? getAnnotatedAxiom : undefined;
  }

  structuralKey() {
    if (this.#key === undefined) {
      this.#key = JSON.stringify(this.#tuple);
    }
    return this.#key;
  }

  toStructuralTuple() {
    return this.#tuple;
  }

  equals(other) {
    if (this === other) return true;
    return (
      Boolean(other) &&
      typeof other.structuralKey === "function" &&
      this.structuralKey() === other.structuralKey()
    );
  }

  structuralKeyWithoutAnnotations() {
    if (this.#keyWithoutAnnotations === undefined) {
      this.#keyWithoutAnnotations =
        this.#componentsWithoutAnnotations === undefined
          ? this.structuralKey()
          : JSON.stringify([this.kind, ...this.#componentsWithoutAnnotations]);
    }
    return this.#keyWithoutAnnotations;
  }

  equalsIgnoreAnnotations(other) {
    if (this === other) return true;
    return (
      Boolean(other) &&
      typeof other.structuralKeyWithoutAnnotations === "function" &&
      this.structuralKeyWithoutAnnotations() ===
        other.structuralKeyWithoutAnnotations()
    );
  }
}

// The canonical axiom tuple ends with its own annotations. Reuse the already
// validated body verbatim, retaining nested annotation objects and lexical data.
const copyAxiomAnnotations = (axiom, annotations) => {
  if (
    !AXIOM_KIND_SET.has(axiom?.kind) ||
    !(axiom instanceof OWLStructuralObject)
  ) {
    throw new TypeError("receiver must be a package OWL axiom");
  }
  const normalized = normalizeStructuralSet(annotations, "annotations");
  for (let i = 0; i < normalized.length; i += 1) {
    if (normalized[i].kind !== OWLObjectKind.ANNOTATION) {
      throw new TypeError("annotations must contain OWL annotations");
    }
  }
  return copyWithAxiomAnnotations(axiom, normalized);
};

/** Return the same structural body without this axiom's annotations. */
function getAxiomWithoutAnnotations() {
  OWLStructuralObject.prototype.structuralKey.call(this);
  if (!AXIOM_KIND_SET.has(this.kind))
    throw new TypeError("receiver must be an OWL axiom");
  return this.annotations.length === 0 ? this : copyAxiomAnnotations(this, []);
}

/** Merge supplied annotations with the existing structural annotation set. */
function getAnnotatedAxiom(annotations) {
  OWLStructuralObject.prototype.structuralKey.call(this);
  if (!AXIOM_KIND_SET.has(this.kind))
    throw new TypeError("receiver must be an OWL axiom");
  if (!annotations || typeof annotations[Symbol.iterator] !== "function") {
    throw new TypeError("annotations must be iterable");
  }
  return copyAxiomAnnotations(this, [...this.annotations, ...annotations]);
}

export const createOntologyID = (ontologyIRI, versionIRI) => {
  const components = [ontologyIRI || null, versionIRI || null];
  if (ontologyIRI === undefined) {
    components.push(`anonymous:${nextAnonymousOntologyID}`);
    nextAnonymousOntologyID += 1;
  }
  return new OWLStructuralObject(
    OWLObjectKind.ONTOLOGY_ID,
    { ontologyIRI, versionIRI },
    components,
  );
};

export class IRI extends OWLStructuralObject {
  constructor(value) {
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError("IRI value must be a non-empty string");
    }
    super(OWLObjectKind.IRI, { value }, [value]);
  }

  static create(value) {
    if (value?.kind !== OWLObjectKind.IRI) {
      return new IRI(value);
    }
    if (
      typeof value.value !== "string" ||
      value.value.length === 0 ||
      !isCanonicalStructuralObject(value)
    ) {
      throw new TypeError("IRI objects must implement the canonical IRI shape");
    }
    return value;
  }

  toString() {
    return this.value;
  }
}
