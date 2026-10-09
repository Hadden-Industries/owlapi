import { AXIOM_KINDS, OWLObjectKind } from "./kinds.js";

let nextAnonymousOntologyID = 0;

const structuralTuple = (value) => {
  if (value && typeof value.toStructuralTuple === "function") {
    const tuple = value.toStructuralTuple();
    if (!Array.isArray(tuple)) {
      throw new TypeError("OWL structural tuples must be arrays");
    }
    return Object.freeze(tuple.map(structuralTuple));
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map(structuralTuple));
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

  const unique = new Map();
  for (const value of values) {
    if (!isCanonicalStructuralObject(value)) {
      throw new TypeError(`${name} must contain OWL structural objects`);
    }
    unique.set(value.structuralKey(), value);
  }

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
  #tuple;

  constructor(kind, fields, components, { componentsWithoutAnnotations } = {}) {
    Object.defineProperty(this, "kind", {
      configurable: false,
      enumerable: true,
      value: kind,
      writable: false,
    });
    Object.assign(this, fields);
    this.#tuple = Object.freeze([kind, ...components.map(structuralTuple)]);
    this.#key = JSON.stringify(this.#tuple);
    this.#keyWithoutAnnotations = structuralKey(
      kind,
      componentsWithoutAnnotations || components,
    );
    Object.freeze(this);
  }

  // Keep the exact data-field shape used by storage/source/profile validation.
  // Non-axiom structural values do not expose callable axiom-copy operations.
  get getAxiomWithoutAnnotations() {
    return AXIOM_KINDS.includes(this.kind)
      ? getAxiomWithoutAnnotations
      : undefined;
  }

  get getAnnotatedAxiom() {
    return AXIOM_KINDS.includes(this.kind) ? getAnnotatedAxiom : undefined;
  }

  structuralKey() {
    return this.#key;
  }

  toStructuralTuple() {
    return this.#tuple;
  }

  equals(other) {
    return (
      Boolean(other) &&
      typeof other.structuralKey === "function" &&
      this.#key === other.structuralKey()
    );
  }

  structuralKeyWithoutAnnotations() {
    return this.#keyWithoutAnnotations;
  }

  equalsIgnoreAnnotations(other) {
    return (
      Boolean(other) &&
      typeof other.structuralKeyWithoutAnnotations === "function" &&
      this.#keyWithoutAnnotations === other.structuralKeyWithoutAnnotations()
    );
  }
}

// The canonical axiom tuple ends with its own annotations. Reuse the already
// validated body verbatim, retaining nested annotation objects and lexical data.
const copyAxiomAnnotations = (axiom, annotations) => {
  if (
    !AXIOM_KINDS.includes(axiom?.kind) ||
    !(axiom instanceof OWLStructuralObject)
  ) {
    throw new TypeError("receiver must be a package OWL axiom");
  }
  const normalized = normalizeStructuralSet(annotations, "annotations");
  if (
    normalized.some(
      (annotation) => annotation.kind !== OWLObjectKind.ANNOTATION,
    )
  ) {
    throw new TypeError("annotations must contain OWL annotations");
  }
  const components = axiom.toStructuralTuple().slice(1, -1);
  const fields = Object.fromEntries(
    Object.entries(axiom).filter(
      ([key]) => key !== "kind" && key !== "annotations",
    ),
  );
  return new OWLStructuralObject(
    axiom.kind,
    { ...fields, annotations: normalized },
    [...components, normalized],
    { componentsWithoutAnnotations: components },
  );
};

/** Return the same structural body without this axiom's annotations. */
function getAxiomWithoutAnnotations() {
  OWLStructuralObject.prototype.structuralKey.call(this);
  if (!AXIOM_KINDS.includes(this.kind))
    throw new TypeError("receiver must be an OWL axiom");
  return this.annotations.length === 0 ? this : copyAxiomAnnotations(this, []);
}

/** Merge supplied annotations with the existing structural annotation set. */
function getAnnotatedAxiom(annotations) {
  OWLStructuralObject.prototype.structuralKey.call(this);
  if (!AXIOM_KINDS.includes(this.kind))
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
