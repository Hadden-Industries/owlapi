import { AXIOM_KINDS, ENTITY_KINDS, OWLObjectKind } from "./kinds.js";
import {
  capturedKeysEqual,
  compareCapturedKeys,
  structuralEquals,
} from "../internal/collections/structuralComparator.js";
import { StructuralHashTable } from "../internal/collections/structuralHashTable.js";
import {
  bindStructuralModel,
  captureStructuralKey,
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

const projectComponents = (values, tuples = new Map()) =>
  values.map((value) => structuralTuple(value, tuples));
function structuralTuple(value, tuples) {
  if (value && typeof value === "object") {
    const tuple = readPackageTuple(value, tuples);
    if (tuple !== undefined) {
      return tuple;
    }
    if (typeof value.toStructuralTuple === "function") {
      const supplied = value.toStructuralTuple();
      if (!Array.isArray(supplied)) {
        throw new TypeError("OWL structural tuples must be arrays");
      }
      return Object.freeze(projectComponents(supplied, tuples));
    }
    if (Array.isArray(value)) {
      return Object.freeze(projectComponents(value, tuples));
    }
  }
  return value;
}
export const structuralKey = (kind, components) =>
  JSON.stringify([kind, ...projectComponents(components)]);

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
  // Most class expressions have two operands. Capture the iterable and each
  // effective key in its original order; a third item justifies a hash table.
  let first, second, firstKey, secondKey, table;
  for (const value of values) {
    const key = captureStructuralKey(requireValue(value));
    if (first === undefined) {
      first = value;
      firstKey = key;
    } else if (second === undefined) {
      second = value;
      secondKey = key;
    } else {
      if (!table) {
        table = new StructuralHashTable();
        table.addPrepared(first, firstKey, true);
        table.addPrepared(second, secondKey, true);
      }
      table.addPrepared(value, key, true);
    }
  }
  if (table) return Object.freeze(table.sortedValues(compareCapturedKeys));
  if (second === undefined)
    return first === undefined ? EMPTY_STRUCTURAL_SET : Object.freeze([first]);
  if (capturedKeysEqual(firstKey, secondKey)) return Object.freeze([second]);
  return Object.freeze(
    compareCapturedKeys(firstKey, secondKey) < 0
      ? [first, second]
      : [second, first],
  );
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

function projectionFrame(value, body) {
  const fields = Array.isArray(value) ? undefined : tupleFields.get(value.kind);
  const length = fields
    ? fields.length - Number(body && AXIOM_KIND_SET.has(value.kind))
    : value.length;
  const offset = fields ? 1 : 0;
  const tuple = new Array(length + offset);
  if (fields) {
    tuple[0] = value.kind;
  }
  return { value, fields, length, offset, tuple, index: 0 };
}

function projectedTuple(object, flags, body, shared) {
  const previous = shared?.get(object);
  if (previous) {
    return previous;
  }
  if (object.kind === OWLObjectKind.IRI) {
    const tuple = Object.freeze([object.kind, object.value]);
    shared?.set(object, tuple);
    return tuple;
  }
  const root = projectionFrame(object, body),
    stack = [root],
    tuples = shared ?? new Map();
  tuples.set(object, root.tuple);
  if (flags < 0) {
    root.tuple.push("anonymous:" + (-flags - 1));
  }
  // Scope sharing to this projection. Neither deep chains nor shared subgraphs
  // consume the JavaScript call stack or leave tuples on a model node.
  while (stack.length) {
    const frame = stack[stack.length - 1];
    if (frame.index === frame.length) {
      Object.freeze(frame.tuple);
      stack.pop();
      continue;
    }
    const index = frame.index++;
    const child = frame.value[frame.fields ? frame.fields[index] : index];
    let result = child ?? null;
    if (child !== null && typeof child === "object") {
      result = tuples.get(child);
      if (!result) {
        const next = projectionFrame(child, false);
        result = next.tuple;
        tuples.set(child, result);
        stack.push(next);
      }
    }
    frame.tuple[index + frame.offset] = result;
  }
  return root.tuple;
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
    readPackageTuple = (value, tuples) =>
      branded(value)
        ? value.#flags === 0
          ? explicitTuples.get(value).tuple
          : projectedTuple(value, value.#flags, false, tuples)
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
            Object.freeze(projectComponents(annotations)),
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
        const tuples = new Map();
        const tuple = Object.freeze([
          kind,
          ...projectComponents(components, tuples),
        ]);
        const body = options.componentsWithoutAnnotations
          ? Object.freeze(
              projectComponents(options.componentsWithoutAnnotations, tuples),
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
    if (!other || typeof other.structuralKey !== "function") {
      return false;
    }
    if (isFactoryStructuralObject(this) && isFactoryStructuralObject(other)) {
      return structuralEquals(this, other);
    }
    return this.structuralKey() === other.structuralKey();
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
    if (!other || typeof other.structuralKeyWithoutAnnotations !== "function") {
      return false;
    }
    if (isFactoryStructuralObject(this) && isFactoryStructuralObject(other)) {
      return structuralEquals(this, other, true);
    }
    return (
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
