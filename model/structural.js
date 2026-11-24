import { AXIOM_KINDS, ENTITY_KINDS, OWLObjectKind } from "./kinds.js";
import {
  compareCapturedKeys,
  structuralEquals,
} from "../internal/collections/structuralComparator.js";
import { StructuralHashTable } from "../internal/collections/structuralHashTable.js";
import {
  bindStructuralModel,
  tupleFields,
} from "../internal/collections/structuralProjection.js";

let nextAnonymousOntologyID = 0;
const AXIOM_KIND_SET = new Set(AXIOM_KINDS);
const ENTITY_KIND_SET = new Set(ENTITY_KINDS);
export const EMPTY_STRUCTURAL_SET = Object.freeze([]);
const FACTORY = Symbol("normalized factory components");
const IRI_TOKEN = Symbol("IRI");
const COPY = Symbol("copy axiom annotations");

// Public constructors may give fields and tuples different meanings. Foreign
// tuple providers may also be stateful. Only these exceptional values need a
// captured representation; ordinary factory nodes project their immutable data.
const explicitTuples = new WeakMap();
let readPackageTuple;
let iriPrototype;
let structuralPrototype;
export let isPackageStructuralObject;
export let isFactoryStructuralObject;
export let isNativeGroundStructuralObject;
export let nativeStructuralMethods;
let stableComponent;

const structuralTuple = (value) => {
  if (value && typeof value === "object") {
    const tuple = readPackageTuple(value);
    if (tuple !== undefined) {
      return tuple;
    }
    if (typeof value.toStructuralTuple === "function") {
      const supplied = value.toStructuralTuple();
      if (!Array.isArray(supplied)) {
        throw new TypeError("OWL structural tuples must be arrays");
      }
      return Object.freeze(supplied.map(structuralTuple));
    }
    if (Array.isArray(value)) {
      return Object.freeze(value.map(structuralTuple));
    }
  }
  return value;
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
    throw new TypeError(name + " must be iterable");
  }
  const requireValue = (value) => {
    if (!isCanonicalStructuralObject(value)) {
      throw new TypeError(name + " must contain OWL structural objects");
    }
    return value;
  };
  if (Array.isArray(values)) {
    if (values.length === 0) {
      return EMPTY_STRUCTURAL_SET;
    }
    if (values.length === 1) {
      return Object.freeze([requireValue(values[0])]);
    }
  }
  const table = new StructuralHashTable();
  for (const value of values) {
    table.add(requireValue(value), true);
  }
  return table.size === 0
    ? EMPTY_STRUCTURAL_SET
    : Object.freeze(table.sortedValues(compareCapturedKeys));
};

export class StructuralSet {
  #items = new StructuralHashTable();
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
    this.#items.add(value);
    return this;
  }
  has(value) {
    return isCanonicalStructuralObject(value) && this.#items.idOf(value) >= 0;
  }
  values() {
    return this.#items.values();
  }
  [Symbol.iterator]() {
    return this.values();
  }
  toSet() {
    return new Set(this.values());
  }
}

function projectedTuple(object, flags, body) {
  const fields = tupleFields.get(object.kind);
  const length =
    fields.length - Number(body && AXIOM_KIND_SET.has(object.kind));
  const tuple = new Array(length + 1);
  tuple[0] = object.kind;
  for (let i = 0; i < length; i++) {
    tuple[i + 1] = projectedComponent(object[fields[i]]);
  }
  if (flags < 0) {
    tuple.push("anonymous:" + (-flags - 1));
  }
  return Object.freeze(tuple);
}
function projectedComponent(value) {
  if (Array.isArray(value)) {
    const items = new Array(value.length);
    for (let i = 0; i < items.length; i++) {
      items[i] = projectedComponent(value[i]);
    }
    return Object.freeze(items);
  }
  return value && typeof value === "object"
    ? readPackageTuple(value)
    : (value ?? null);
}

function proofFor(object, kind, components) {
  const prototype = Object.getPrototypeOf(object);
  const expected =
    kind === OWLObjectKind.IRI ? iriPrototype : structuralPrototype;
  if (
    prototype !== expected ||
    Object.getPrototypeOf(structuralPrototype) !== Object.prototype ||
    (prototype === iriPrototype &&
      Object.getPrototypeOf(prototype) !== structuralPrototype) ||
    "kind" in prototype
  ) {
    return 0;
  }
  for (const field of tupleFields.get(kind)) {
    if (field in prototype) {
      return 0;
    }
  }
  let proof = kind === OWLObjectKind.ANONYMOUS_INDIVIDUAL ? 1 : 2;
  for (const component of components) {
    proof = Math.min(proof, stableComponent(component));
    if (proof === 0) {
      break;
    }
  }
  return proof;
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
  // 0 = explicit tuple, 1 = factory data containing an anonymous individual,
  // 2 = ground factory data, 3 = original IRI/entity/declaration isomorphism
  // shortcut. Negative values encode anonymous ontology ordinals.
  #flags = 0;
  static {
    structuralPrototype = this.prototype;
    nativeStructuralMethods = Object.freeze({
      structuralKey: this.prototype.structuralKey,
      toStructuralTuple: this.prototype.toStructuralTuple,
    });
    const branded = (value) =>
      value !== null && typeof value === "object" && #flags in value;
    isPackageStructuralObject = (value) =>
      branded(value) &&
      Object.isFrozen(value) &&
      (Object.getPrototypeOf(value) === structuralPrototype ||
        Object.getPrototypeOf(value) === iriPrototype);
    isFactoryStructuralObject = (value) => branded(value) && value.#flags !== 0;
    isNativeGroundStructuralObject = (value) =>
      branded(value) && value.#flags === 3;
    stableComponent = (value) => {
      if (value === EMPTY_STRUCTURAL_SET) {
        return "toStructuralTuple" in Array.prototype ? 0 : 2;
      }
      if (
        value === null ||
        value === undefined ||
        typeof value === "string" ||
        typeof value === "number"
      ) {
        return 2;
      }
      if (branded(value)) {
        return Math.min(2, Math.max(0, value.#flags));
      }
      if (
        !Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Array.prototype ||
        "toStructuralTuple" in value ||
        !Object.isFrozen(value)
      ) {
        return 0;
      }
      if (
        value.length > 1 &&
        (Object.getOwnPropertyDescriptor(structuralPrototype, "structuralKey")
          ?.value !== nativeStructuralMethods.structuralKey ||
          Object.hasOwn(iriPrototype, "structuralKey"))
      ) {
        // An override may have supplied a different set order at construction.
        return 0;
      }
      if (Reflect.ownKeys(value).length !== value.length + 1) {
        return 0;
      }
      let proof = 2;
      for (let i = 0; i < value.length; i++) {
        const entry = Object.getOwnPropertyDescriptor(value, i);
        if (!entry || !Object.hasOwn(entry, "value")) {
          return 0;
        }
        proof = Math.min(proof, stableComponent(entry.value));
        if (!proof) {
          return 0;
        }
      }
      return proof;
    };
    readPackageTuple = (value) =>
      branded(value)
        ? value.#flags === 0
          ? explicitTuples.get(value).tuple
          : projectedTuple(value, value.#flags, false)
        : undefined;
    bindStructuralModel({
      projectable: (value) =>
        branded(value) && value.#flags > 0 && !("toJSON" in Array.prototype),
      keyMethod: this.prototype.structuralKey,
      bodyMethod: this.prototype.structuralKeyWithoutAnnotations,
    });
  }

  constructor(kind, fields, components, options = {}, token) {
    if (
      (token === FACTORY || token === COPY) &&
      new.target !== OWLStructuralObject
    ) {
      Object.setPrototypeOf(this, structuralPrototype);
    }
    if (kind === IRI_TOKEN) {
      this.#flags = proofFor(this, OWLObjectKind.IRI, [fields]) ? 3 : 0;
      this.kind = OWLObjectKind.IRI;
      this.value = fields;
      if (!this.#flags) {
        explicitTuples.set(this, {
          tuple: Object.freeze([OWLObjectKind.IRI, fields]),
        });
      }
    } else if (token === COPY) {
      const axiom = kind,
        annotations = fields;
      const flags = axiom.#flags;
      if (flags > 0) {
        this.#flags = Math.min(
          flags,
          proofFor(this, axiom.kind, [annotations]),
        );
      }
      Object.assign(this, axiom);
      this.annotations = annotations;
      if (!this.#flags) {
        const exactBody = readPackageTuple(axiom).slice(1, -1);
        explicitTuples.set(this, {
          tuple: Object.freeze([
            axiom.kind,
            ...exactBody,
            Object.freeze(annotations.map(structuralTuple)),
          ]),
          body: explicitTuples.get(axiom)?.body ?? Object.freeze(exactBody),
          bodyKey: explicitTuples.get(axiom)?.bodyKey,
        });
      }
    } else {
      if (token === FACTORY) {
        this.#flags = proofFor(this, kind, components);
        if (
          this.#flags === 2 &&
          (ENTITY_KIND_SET.has(kind) ||
            (kind === OWLObjectKind.DECLARATION_AXIOM &&
              fields.annotations === EMPTY_STRUCTURAL_SET))
        ) {
          this.#flags = 3;
        }
        if (this.#flags && options.anonymousOrdinal !== undefined) {
          this.#flags = -options.anonymousOrdinal - 1;
        }
      }
      this.kind = kind;
      if (token === FACTORY && kind === OWLObjectKind.LITERAL) {
        this.datatype = fields.datatype;
        this.language = fields.language;
        this.lexicalForm = fields.lexicalForm;
      } else if (token === FACTORY && Object.hasOwn(fields, "subject")) {
        this.property = fields.property;
        this.subject = fields.subject;
        this.value = fields.value;
        this.annotations = fields.annotations;
      } else {
        Object.assign(this, fields);
      }
      if (!this.#flags) {
        const tuple = Object.freeze([kind, ...components.map(structuralTuple)]);
        const body = options.componentsWithoutAnnotations
          ? Object.freeze(
              options.componentsWithoutAnnotations.map(structuralTuple),
            )
          : undefined;
        explicitTuples.set(this, { tuple, body });
      }
    }
    Object.freeze(this);
  }
  get getAxiomWithoutAnnotations() {
    return AXIOM_KIND_SET.has(this.kind)
      ? getAxiomWithoutAnnotations
      : undefined;
  }
  get getAnnotatedAxiom() {
    return AXIOM_KIND_SET.has(this.kind) ? getAnnotatedAxiom : undefined;
  }

  structuralKey() {
    if (this.#flags !== 0) {
      return JSON.stringify(projectedTuple(this, this.#flags, false));
    }
    const record = explicitTuples.get(this);
    return (record.key ??= JSON.stringify(record.tuple));
  }
  toStructuralTuple() {
    return this.#flags === 0
      ? explicitTuples.get(this).tuple
      : projectedTuple(this, this.#flags, false);
  }
  equals(other) {
    if (this === other) {
      return true;
    }
    if (isFactoryStructuralObject(this) && isFactoryStructuralObject(other)) {
      return structuralEquals(this, other);
    }
    return (
      Boolean(other) &&
      typeof other.structuralKey === "function" &&
      this.structuralKey() === other.structuralKey()
    );
  }
  structuralKeyWithoutAnnotations() {
    if (this.#flags !== 0) {
      return AXIOM_KIND_SET.has(this.kind)
        ? JSON.stringify(projectedTuple(this, this.#flags, true))
        : this.structuralKey();
    }
    const record = explicitTuples.get(this);
    return (record.bodyKey ??=
      record.body === undefined
        ? this.structuralKey()
        : JSON.stringify([this.kind, ...record.body]));
  }
  equalsIgnoreAnnotations(other) {
    if (this === other) {
      return true;
    }
    if (isFactoryStructuralObject(this) && isFactoryStructuralObject(other)) {
      return structuralEquals(this, other, true);
    }
    return (
      Boolean(other) &&
      typeof other.structuralKeyWithoutAnnotations === "function" &&
      this.structuralKeyWithoutAnnotations() ===
        other.structuralKeyWithoutAnnotations()
    );
  }
}

const copyAxiomAnnotations = (axiom, annotations) => {
  const normalized = normalizeStructuralSet(annotations, "annotations");
  for (const item of normalized) {
    if (item.kind !== OWLObjectKind.ANNOTATION) {
      throw new TypeError("annotations must contain OWL annotations");
    }
  }
  return allocateFactoryObject(axiom, normalized, undefined, undefined, COPY);
};
function requireCopyReceiver(value) {
  if (!isFactoryStructuralObject(value)) {
    nativeStructuralMethods.structuralKey.call(value);
  }
  if (!AXIOM_KIND_SET.has(value.kind)) {
    throw new TypeError("receiver must be an OWL axiom");
  }
}
function getAxiomWithoutAnnotations() {
  requireCopyReceiver(this);
  return this.annotations.length === 0 ? this : copyAxiomAnnotations(this, []);
}
function getAnnotatedAxiom(annotations) {
  requireCopyReceiver(this);
  if (!annotations || typeof annotations[Symbol.iterator] !== "function") {
    throw new TypeError("annotations must be iterable");
  }
  return copyAxiomAnnotations(this, [...this.annotations, ...annotations]);
}

// Separate constructor feedback by public field count, so a run of two-field
// entities cannot size all later four-field axioms. The allocator's prototype
// is replaced before any operand is observed. Every resulting value has the same
// public prototype, one private field, and precisely its OWL data properties.
const allocationClasses = [];
function allocateFactoryObject(kind, fields, components, options, token) {
  if (!token) {
    return new OWLStructuralObject(kind, fields, components, options);
  }
  const count = tupleFields.get(token === COPY ? kind.kind : kind).length;
  const Allocation = (allocationClasses[count] ??= class extends (
    OWLStructuralObject
  ) {});
  return new Allocation(kind, fields, components, options, token);
}

export const createFactoryStructuralObject = (
  kind,
  fields,
  components,
  options,
) => allocateFactoryObject(kind, fields, components, options, FACTORY);
export const createStructuralUnary = (kind, field, value) =>
  createFactoryStructuralObject(kind, { [field]: value }, [value]);
export const createStructuralRestriction = (
  kind,
  property,
  filler,
  fillerName,
) =>
  createFactoryStructuralObject(kind, { [fillerName]: filler, property }, [
    property,
    filler,
  ]);
export const createStructuralCardinality = (
  kind,
  cardinality,
  property,
  filler,
  validFiller,
) =>
  allocateFactoryObject(
    kind,
    { cardinality, filler, property },
    [cardinality, property, filler || null],
    undefined,
    validFiller ? FACTORY : undefined,
  );
export const createStructuralLiteral = (
  lexicalForm,
  language,
  datatype,
  validDatatype,
) =>
  allocateFactoryObject(
    OWLObjectKind.LITERAL,
    { datatype, language, lexicalForm },
    [lexicalForm, language, datatype],
    undefined,
    validDatatype ? FACTORY : undefined,
  );
export const createStructuralPair = (
  kind,
  firstField,
  first,
  secondField,
  second,
) =>
  createFactoryStructuralObject(
    kind,
    { [firstField]: first, [secondField]: second },
    [first, second],
  );
export const createStructuralDeclaration = (entity, annotations) =>
  createFactoryStructuralObject(
    OWLObjectKind.DECLARATION_AXIOM,
    { annotations, entity },
    [entity, annotations],
    { componentsWithoutAnnotations: [entity] },
  );
export function createOntologyID(ontologyIRI, versionIRI) {
  const components = [ontologyIRI || null, versionIRI || null];
  const anonymousOrdinal =
    ontologyIRI === undefined ? nextAnonymousOntologyID++ : undefined;
  if (anonymousOrdinal !== undefined) {
    components.push("anonymous:" + anonymousOrdinal);
  }
  return createFactoryStructuralObject(
    OWLObjectKind.ONTOLOGY_ID,
    { ontologyIRI, versionIRI },
    components,
    { anonymousOrdinal },
  );
}

export class IRI extends OWLStructuralObject {
  static {
    iriPrototype = this.prototype;
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
      !isCanonicalStructuralObject(value) ||
      ((Object.getPrototypeOf(value) === iriPrototype ||
        Object.getPrototypeOf(value) === structuralPrototype) &&
        !isPackageStructuralObject(value))
    ) {
      throw new TypeError("IRI objects must implement the canonical IRI shape");
    }
    return value;
  }
  toString() {
    return this.value;
  }
}
