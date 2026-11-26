import {
  AXIOM_KINDS_WITH_SWRL as AXIOM_KINDS,
  ENTITY_KINDS,
  OWLObjectKind,
} from "./kinds.js";
import {
  capturedKeysEqual,
  compareCapturedKeys,
  compareJsonStrings,
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
const FACTORY_UNARY = Symbol("factory unary");
const FACTORY_PAIR = Symbol("factory pair");
const FACTORY_CARDINALITY = Symbol("factory cardinality");
const FACTORY_LITERAL = Symbol("factory literal");
const FACTORY_DECLARATION = Symbol("factory declaration");
const FACTORY_ANNOTATED_UNARY = Symbol("factory annotated unary");
const FACTORY_ANNOTATED_PAIR = Symbol("factory annotated pair");
const IRI_TOKEN = Symbol("IRI");
const COPY = Symbol("copy axiom annotations");

const pairSpecs = new Map();
const getPairSpec = (firstField, secondField) => {
  let byFirst = pairSpecs.get(firstField);
  if (!byFirst) pairSpecs.set(firstField, (byFirst = new Map()));
  let spec = byFirst.get(secondField);
  if (!spec) byFirst.set(secondField, (spec = { firstField, secondField }));
  return spec;
};
const isDirectFactoryToken = (token) =>
  token === FACTORY ||
  token === COPY ||
  token === FACTORY_UNARY ||
  token === FACTORY_PAIR ||
  token === FACTORY_CARDINALITY ||
  token === FACTORY_LITERAL ||
  token === FACTORY_DECLARATION ||
  token === FACTORY_ANNOTATED_UNARY ||
  token === FACTORY_ANNOTATED_PAIR;

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
const nativeTupleSerialization = () => !("toJSON" in Array.prototype);
/** Can a read index reuse keys captured by the native tuple protocol? */
export const usesNativeStructuralKeys = () =>
  nativeTupleSerialization() &&
  Object.getOwnPropertyDescriptor(structuralPrototype, "structuralKey")
    ?.value === nativeStructuralMethods.structuralKey &&
  !Object.hasOwn(iriPrototype, "structuralKey");

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
  (isFactoryStructuralObject(value) || Object.isFrozen(value));

const trustedFrozenArrays = new WeakSet();
const trustFrozenArray = (frozen) => {
  trustedFrozenArrays.add(frozen);
  return frozen;
};
export const freezeOrderedComponents = (items) =>
  trustFrozenArray(Object.freeze(items));

const requireStructuralValue = (value, name) => {
  if (!isCanonicalStructuralObject(value)) {
    throw new TypeError(name + " must contain OWL structural objects");
  }
  return value;
};

export const normalizeStructuralSet = (values, name) => {
  if (!values || typeof values[Symbol.iterator] !== "function") {
    throw new TypeError(name + " must be iterable");
  }
  if (
    Array.isArray(values) &&
    values[Symbol.iterator] === Array.prototype[Symbol.iterator]
  ) {
    if (values.length === 0) {
      return EMPTY_STRUCTURAL_SET;
    }
    if (values.length === 1) {
      return trustFrozenArray(
        Object.freeze([requireStructuralValue(values[0], name)]),
      );
    }
    if (values.length === 2) {
      const first = requireStructuralValue(values[0], name);
      const second = requireStructuralValue(values[1], name);
      if (first === second) {
        return trustFrozenArray(Object.freeze([second]));
      }
      if (
        isFactoryStructuralObject(first) &&
        isFactoryStructuralObject(second) &&
        first.kind === second.kind &&
        first.iri !== undefined &&
        usesNativeStructuralKeys()
      ) {
        const firstIri = first.iri.value;
        const secondIri = second.iri.value;
        if (firstIri === secondIri) {
          return trustFrozenArray(Object.freeze([second]));
        }
        return trustFrozenArray(
          Object.freeze(
            compareJsonStrings(firstIri, secondIri) < 0
              ? [first, second]
              : [second, first],
          ),
        );
      }
      const firstKey = captureStructuralKey(first);
      const secondKey = captureStructuralKey(second);
      const cmp = compareCapturedKeys(firstKey, secondKey);
      if (cmp === 0) {
        return trustFrozenArray(Object.freeze([second]));
      }
      return trustFrozenArray(
        Object.freeze(cmp < 0 ? [first, second] : [second, first]),
      );
    }
  }
  // Most class expressions have two operands. Capture the iterable and each
  // effective key in its original order; a third item justifies a hash table.
  let first, second, firstKey, secondKey, table;
  for (const value of values) {
    const key = captureStructuralKey(requireStructuralValue(value, name));
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
  if (table)
    return trustFrozenArray(
      Object.freeze(table.sortedValues(compareCapturedKeys)),
    );
  if (second === undefined)
    return first === undefined
      ? EMPTY_STRUCTURAL_SET
      : trustFrozenArray(Object.freeze([first]));
  if (capturedKeysEqual(firstKey, secondKey))
    return trustFrozenArray(Object.freeze([second]));
  return trustFrozenArray(
    Object.freeze(
      compareCapturedKeys(firstKey, secondKey) < 0
        ? [first, second]
        : [second, first],
    ),
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

function hasCleanPrototype(kind, prototype) {
  if (
    Object.getPrototypeOf(structuralPrototype) !== Object.prototype ||
    (prototype === iriPrototype &&
      Object.getPrototypeOf(prototype) !== structuralPrototype) ||
    "kind" in prototype
  ) {
    return false;
  }
  const fields = tupleFields.get(kind);
  for (let i = 0; i < fields.length; i++) {
    if (fields[i] in prototype) {
      return false;
    }
  }
  return true;
}

const hasCleanStructuralProto1 = (f1) =>
  Object.getPrototypeOf(structuralPrototype) === Object.prototype &&
  !("kind" in structuralPrototype) &&
  !(f1 in structuralPrototype);

const hasCleanStructuralProto2 = (f1, f2) =>
  Object.getPrototypeOf(structuralPrototype) === Object.prototype &&
  !("kind" in structuralPrototype) &&
  !(f1 in structuralPrototype) &&
  !(f2 in structuralPrototype);

const hasCleanStructuralProto3 = (f1, f2, f3) =>
  Object.getPrototypeOf(structuralPrototype) === Object.prototype &&
  !("kind" in structuralPrototype) &&
  !(f1 in structuralPrototype) &&
  !(f2 in structuralPrototype) &&
  !(f3 in structuralPrototype);

function proofFor(object, kind, components, knownProto = false) {
  const expected =
    kind === OWLObjectKind.IRI ? iriPrototype : structuralPrototype;
  const prototype = knownProto ? expected : Object.getPrototypeOf(object);
  if (prototype !== expected || !hasCleanPrototype(kind, prototype)) {
    return 0;
  }
  let proof = kind === OWLObjectKind.ANONYMOUS_INDIVIDUAL ? 1 : 2;
  for (let i = 0; i < components.length; i++) {
    proof = Math.min(proof, stableComponent(components[i]));
    if (proof === 0) {
      break;
    }
  }
  return proof;
}

const allocationConstructors = [];
const allocators = new Set();

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
      structuralKeyWithoutAnnotations:
        this.prototype.structuralKeyWithoutAnnotations,
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
      const isTrustedComponentArray = trustedFrozenArrays.has(value);
      if (
        !Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Array.prototype ||
        "toStructuralTuple" in value ||
        (!isTrustedComponentArray && !Object.isFrozen(value))
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
      if (
        !isTrustedComponentArray &&
        Reflect.ownKeys(value).length !== value.length + 1
      ) {
        return 0;
      }
      let proof = 2;
      for (let i = 0; i < value.length; i++) {
        let child;
        if (isTrustedComponentArray) {
          child = value[i];
        } else {
          const entry = Object.getOwnPropertyDescriptor(value, i);
          if (!entry || !Object.hasOwn(entry, "value")) {
            return 0;
          }
          child = entry.value;
        }
        proof = Math.min(proof, stableComponent(child));
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
        branded(value) && value.#flags > 0 && nativeTupleSerialization(),
      keyMethod: this.prototype.structuralKey,
      bodyMethod: this.prototype.structuralKeyWithoutAnnotations,
    });
  }

  constructor(kind, fields, components, options = {}, token, extra) {
    const direct = isDirectFactoryToken(token);
    if (
      direct &&
      new.target !== OWLStructuralObject &&
      !allocators.has(new.target)
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
          proofFor(this, axiom.kind, [annotations], true),
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
    } else if (token === FACTORY_UNARY) {
      const clean = hasCleanStructuralProto1(fields);
      this.kind = kind;
      this[fields] = components;
      const proof = clean ? stableComponent(components) : 0;
      this.#flags = proof
        ? ENTITY_KIND_SET.has(kind) && proof === 2
          ? 3
          : proof
        : 0;
      if (!this.#flags) {
        explicitTuples.set(this, {
          tuple: Object.freeze([kind, ...projectComponents([components])]),
        });
      }
    } else if (token === FACTORY_PAIR) {
      const first = components;
      const second = options;
      const clean = hasCleanStructuralProto2(
        fields.firstField,
        fields.secondField,
      );
      this.kind = kind;
      this[fields.firstField] = first;
      this[fields.secondField] = second;
      const proof = clean
        ? Math.min(stableComponent(first), stableComponent(second))
        : 0;
      this.#flags = proof;
      if (!proof) {
        explicitTuples.set(this, {
          tuple: Object.freeze([kind, ...projectComponents([first, second])]),
        });
      }
    } else if (token === FACTORY_ANNOTATED_UNARY) {
      const value = components;
      const annotations = options;
      const clean = hasCleanStructuralProto2(fields, "annotations");
      this.kind = kind;
      this[fields] = value;
      this.annotations = annotations;
      const proof = clean
        ? Math.min(stableComponent(value), stableComponent(annotations))
        : 0;
      this.#flags = proof;
      if (!proof) {
        const tuples = new Map();
        const body = Object.freeze(projectComponents([value], tuples));
        explicitTuples.set(this, {
          tuple: Object.freeze([
            kind,
            ...body,
            ...projectComponents([annotations], tuples),
          ]),
          body,
        });
      }
    } else if (token === FACTORY_ANNOTATED_PAIR) {
      const first = components;
      const second = options;
      const annotations = extra;
      const clean = hasCleanStructuralProto3(
        fields.firstField,
        fields.secondField,
        "annotations",
      );
      this.kind = kind;
      this.annotations = annotations;
      this[fields.firstField] = first;
      this[fields.secondField] = second;
      const proof = clean
        ? Math.min(
            stableComponent(first),
            stableComponent(second),
            stableComponent(annotations),
          )
        : 0;
      this.#flags = proof;
      if (!proof) {
        const tuples = new Map();
        const body = Object.freeze(projectComponents([first, second], tuples));
        explicitTuples.set(this, {
          tuple: Object.freeze([
            kind,
            ...body,
            ...projectComponents([annotations], tuples),
          ]),
          body,
        });
      }
    } else if (token === FACTORY_CARDINALITY) {
      const cardinality = fields;
      const property = components;
      const filler = options;
      const clean =
        extra && hasCleanStructuralProto3("cardinality", "filler", "property");
      this.kind = kind;
      this.cardinality = cardinality;
      this.filler = filler;
      this.property = property;
      const proof = clean
        ? Math.min(
            stableComponent(property),
            filler ? stableComponent(filler) : 2,
          )
        : 0;
      this.#flags = proof;
      if (!proof) {
        explicitTuples.set(this, {
          tuple: Object.freeze([
            kind,
            ...projectComponents([cardinality, property, filler || null]),
          ]),
        });
      }
    } else if (token === FACTORY_LITERAL) {
      const datatype = fields;
      const lexicalForm = components;
      const language = options;
      const clean =
        extra &&
        hasCleanStructuralProto3("datatype", "language", "lexicalForm");
      this.kind = kind;
      this.datatype = datatype;
      this.language = language;
      this.lexicalForm = lexicalForm;
      const proof = clean ? stableComponent(datatype) : 0;
      this.#flags = proof;
      if (!proof) {
        explicitTuples.set(this, {
          tuple: Object.freeze([
            kind,
            ...projectComponents([lexicalForm, language, datatype]),
          ]),
        });
      }
    } else if (token === FACTORY_DECLARATION) {
      const entity = fields;
      const annotations = components;
      const clean = hasCleanStructuralProto2("annotations", "entity");
      this.kind = kind;
      this.annotations = annotations;
      this.entity = entity;
      const proof = clean
        ? Math.min(stableComponent(entity), stableComponent(annotations))
        : 0;
      this.#flags =
        proof === 2 && annotations === EMPTY_STRUCTURAL_SET ? 3 : proof;
      if (!this.#flags) {
        const tuples = new Map();
        explicitTuples.set(this, {
          tuple: Object.freeze([
            kind,
            ...projectComponents([entity, annotations], tuples),
          ]),
          body: Object.freeze(projectComponents([entity], tuples)),
        });
      }
    } else {
      if (token === FACTORY) {
        this.#flags = proofFor(this, kind, components, true);
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
    if (
      axiom.kind === OWLObjectKind.SWRL_RULE &&
      (item.annotations.length || item.value.kind !== OWLObjectKind.LITERAL)
    )
      throw new TypeError("Expected a direct literal rule annotation");
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
function getAllocationConstructor(count) {
  let Alloc = allocationConstructors[count];
  if (!Alloc) {
    Alloc = function OWLStructuralAllocation() {};
    Alloc.prototype = structuralPrototype;
    allocationConstructors[count] = Alloc;
    allocators.add(Alloc);
  }
  return Alloc;
}
const ALLOC_1 = getAllocationConstructor(1);
const ALLOC_2 = getAllocationConstructor(2);
const ALLOC_3 = getAllocationConstructor(3);
function allocateFactoryObject(kind, fields, components, options, token) {
  if (!token) {
    return new OWLStructuralObject(kind, fields, components, options);
  }
  const count = tupleFields.get(token === COPY ? kind.kind : kind).length;
  return Reflect.construct(
    OWLStructuralObject,
    [kind, fields, components, options, token],
    getAllocationConstructor(count),
  );
}

export const createFactoryStructuralObject = (
  kind,
  fields,
  components,
  options,
) => allocateFactoryObject(kind, fields, components, options, FACTORY);
export const createStructuralUnary = (kind, field, value) =>
  Reflect.construct(
    OWLStructuralObject,
    [kind, field, value, undefined, FACTORY_UNARY],
    ALLOC_1,
  );
export const createStructuralRestriction = (
  kind,
  property,
  filler,
  fillerName,
) =>
  Reflect.construct(
    OWLStructuralObject,
    [kind, getPairSpec("property", fillerName), property, filler, FACTORY_PAIR],
    ALLOC_2,
  );
export const createStructuralCardinality = (
  kind,
  cardinality,
  property,
  filler,
  validFiller,
) =>
  Reflect.construct(
    OWLStructuralObject,
    [kind, cardinality, property, filler, FACTORY_CARDINALITY, validFiller],
    ALLOC_3,
  );
export const createStructuralLiteral = (
  lexicalForm,
  language,
  datatype,
  validDatatype,
) =>
  Reflect.construct(
    OWLStructuralObject,
    [
      OWLObjectKind.LITERAL,
      datatype,
      lexicalForm,
      language,
      FACTORY_LITERAL,
      validDatatype,
    ],
    ALLOC_3,
  );
export const createStructuralPair = (
  kind,
  firstField,
  first,
  secondField,
  second,
) =>
  Reflect.construct(
    OWLStructuralObject,
    [kind, getPairSpec(firstField, secondField), first, second, FACTORY_PAIR],
    ALLOC_2,
  );
export const createStructuralDeclaration = (entity, annotations) =>
  Reflect.construct(
    OWLStructuralObject,
    [
      OWLObjectKind.DECLARATION_AXIOM,
      entity,
      annotations,
      undefined,
      FACTORY_DECLARATION,
    ],
    ALLOC_2,
  );
export const createStructuralAnnotatedUnary = (
  kind,
  field,
  value,
  annotations,
) =>
  Reflect.construct(
    OWLStructuralObject,
    [kind, field, value, annotations, FACTORY_ANNOTATED_UNARY],
    ALLOC_2,
  );
export const createStructuralAnnotatedPair = (
  kind,
  firstField,
  first,
  secondField,
  second,
  annotations,
) =>
  Reflect.construct(
    OWLStructuralObject,
    [
      kind,
      getPairSpec(firstField, secondField),
      first,
      second,
      FACTORY_ANNOTATED_PAIR,
      annotations,
    ],
    ALLOC_3,
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
