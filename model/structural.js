import { AXIOM_KINDS, ENTITY_KINDS, OWLObjectKind } from "./kinds.js";

let nextAnonymousOntologyID = 0;
const AXIOM_KIND_SET = new Set(AXIOM_KINDS);
const ENTITY_KIND_SET = new Set(ENTITY_KINDS);
const EMPTY_STRUCTURAL_SET = Object.freeze([]);
let readPackageTuple;
let copyWithAxiomAnnotations;
let nativeIriPrototype;
// Package-private construction after the factory has normalized its overload.
export let createStructuralLiteral;
export let createStructuralUnary;
export let createStructuralRestriction;
export let createStructuralCardinality;
export let createStructuralPair;
export let createStructuralDeclaration;
export let isNativeGroundStructuralObject;
export let nativeStructuralMethods;

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
  // Preserve full iterable admission (including custom array iterators) before
  // using the common binary case to avoid sort and map intermediate arrays.
  if (unique.size === 2) {
    const entries = unique.entries();
    const [leftKey, left] = entries.next().value;
    const [rightKey, right] = entries.next().value;
    return Object.freeze(leftKey < rightKey ? [left, right] : [right, left]);
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

const AXIOM_CLONE_TOKEN = Symbol("OWLStructuralObject.axiomClone");
const LITERAL_TOKEN = Symbol("OWLStructuralObject.literal");
const IRI_TOKEN = Symbol("OWLStructuralObject.iri");
const NATIVE_CONSTRUCTION_TOKEN = Symbol(
  "OWLStructuralObject.nativeConstruction",
);

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
  #annotationBodyTuple;
  #nativeGround;
  #tuple;

  static {
    // Capture in the owning class before another module can patch the public
    // prototype; later-loading consumers must never bless an override as native.
    nativeStructuralMethods = Object.freeze({
      structuralKey: this.prototype.structuralKey,
      toStructuralTuple: this.prototype.toStructuralTuple,
    });
    isNativeGroundStructuralObject = (value) =>
      Boolean(
        value &&
        typeof value === "object" &&
        #nativeGround in value &&
        value.#nativeGround,
      );
    const allocateStructuralObject = () =>
      new OWLStructuralObject(
        NATIVE_CONSTRUCTION_TOKEN,
        undefined,
        undefined,
        null,
      );
    readPackageTuple = (value) => (#tuple in value ? value.#tuple : undefined);
    copyWithAxiomAnnotations = (axiom, normalizedAnnotations) =>
      new OWLStructuralObject(axiom, normalizedAnnotations, AXIOM_CLONE_TOKEN);
    // Native projectors preserve the generic public shape and tuple-conversion
    // order while avoiding temporary field records and component arrays.
    createStructuralLiteral = (lexicalForm, language, datatype) =>
      new OWLStructuralObject(LITERAL_TOKEN, datatype, lexicalForm, language);
    createStructuralUnary = (kind, field, value) => {
      const object = allocateStructuralObject();
      const nativeEntityFields =
        field === "iri" &&
        Object.getPrototypeOf(OWLStructuralObject.prototype) ===
          Object.prototype &&
        !("kind" in OWLStructuralObject.prototype) &&
        !("iri" in OWLStructuralObject.prototype);
      object.kind = kind;
      object[field] = value;
      if (
        nativeEntityFields &&
        ENTITY_KIND_SET.has(kind) &&
        isNativeGroundStructuralObject(value) &&
        value.kind === OWLObjectKind.IRI
      )
        object.#nativeGround = true;
      object.#tuple = Object.freeze([kind, structuralTuple(value)]);
      return Object.freeze(object);
    };
    createStructuralRestriction = (kind, property, filler, fillerName) => {
      const object = allocateStructuralObject();
      object.kind = kind;
      object[fillerName] = filler;
      object.property = property;
      object.#tuple = Object.freeze([
        kind,
        structuralTuple(property),
        structuralTuple(filler),
      ]);
      return Object.freeze(object);
    };
    createStructuralCardinality = (kind, cardinality, property, filler) => {
      const object = allocateStructuralObject();
      object.kind = kind;
      object.cardinality = cardinality;
      object.filler = filler;
      object.property = property;
      object.#tuple = Object.freeze([
        kind,
        cardinality,
        structuralTuple(property),
        structuralTuple(filler || null),
      ]);
      return Object.freeze(object);
    };
    createStructuralDeclaration = (entity, annotations) => {
      const object = allocateStructuralObject();
      const nativeDeclarationFields =
        Object.getPrototypeOf(OWLStructuralObject.prototype) ===
          Object.prototype &&
        !("kind" in OWLStructuralObject.prototype) &&
        !("annotations" in OWLStructuralObject.prototype) &&
        !("entity" in OWLStructuralObject.prototype);
      object.kind = OWLObjectKind.DECLARATION_AXIOM;
      object.annotations = annotations;
      object.entity = entity;
      // Preserve generic construction's observable conversion order, including
      // foreign stateful entities and array-level tuple-method overrides.
      const entityTuple = structuralTuple(entity);
      const annotationTuple = structuralTuple(annotations);
      object.#tuple = Object.freeze([
        OWLObjectKind.DECLARATION_AXIOM,
        entityTuple,
        annotationTuple,
      ]);
      object.#componentsWithoutAnnotations = Object.freeze([
        structuralTuple(entity),
      ]);
      if (
        nativeDeclarationFields &&
        isNativeGroundStructuralObject(entity) &&
        ENTITY_KIND_SET.has(entity.kind) &&
        Array.isArray(annotations) &&
        Object.getPrototypeOf(annotations) === Array.prototype &&
        annotations.length === 0 &&
        Reflect.ownKeys(annotations).length === 1 &&
        Object.isFrozen(annotations) &&
        annotationTuple.length === 0
      )
        object.#nativeGround = true;
      return Object.freeze(object);
    };
    createStructuralPair = (kind, firstField, first, secondField, second) => {
      const object = allocateStructuralObject();
      object.kind = kind;
      object[firstField] = first;
      object[secondField] = second;
      object.#tuple = Object.freeze([
        kind,
        structuralTuple(first),
        structuralTuple(second),
      ]);
      return Object.freeze(object);
    };
  }

  constructor(kind, fields, components, options = {}) {
    if (kind === IRI_TOKEN) {
      const nativeIriFields =
        Object.getPrototypeOf(this) === nativeIriPrototype &&
        Object.getPrototypeOf(nativeIriPrototype) ===
          OWLStructuralObject.prototype &&
        Object.getPrototypeOf(OWLStructuralObject.prototype) ===
          Object.prototype &&
        !("kind" in nativeIriPrototype) &&
        !("value" in nativeIriPrototype);
      this.kind = OWLObjectKind.IRI;
      this.value = fields;
      this.#tuple = Object.freeze([OWLObjectKind.IRI, fields]);
      this.#nativeGround = nativeIriFields;
      Object.freeze(this);
      return;
    }
    if (kind === LITERAL_TOKEN) {
      // Keep the hot literal layout in the constructor so the engine can
      // reserve its own-property slots during allocation.
      this.kind = OWLObjectKind.LITERAL;
      this.datatype = fields;
      this.language = options;
      this.lexicalForm = components;
      this.#tuple = Object.freeze([
        OWLObjectKind.LITERAL,
        components,
        options,
        structuralTuple(fields),
      ]);
      Object.freeze(this);
      return;
    }
    if (kind === NATIVE_CONSTRUCTION_TOKEN) return;
    const { componentsWithoutAnnotations } = options;
    if (components === AXIOM_CLONE_TOKEN) {
      const axiom = kind;
      const normalizedAnnotations = fields;
      // Share only the exact private tuple body. The generic constructor can
      // supply a different componentsWithoutAnnotations representation.
      const bodyTuple = (axiom.#annotationBodyTuple ??= Object.freeze(
        axiom.#tuple.slice(1, -1),
      ));
      this.#annotationBodyTuple = bodyTuple;
      Object.assign(this, axiom);
      this.annotations = normalizedAnnotations;
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
  static {
    nativeIriPrototype = this.prototype;
  }
  constructor(value) {
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError("IRI value must be a non-empty string");
    }
    super(IRI_TOKEN, value);
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
