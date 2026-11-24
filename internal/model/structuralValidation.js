import { OWLObjectKind as K } from "../../model/kinds.js";
import { ResourceLimitError } from "../../io/errors.js";
import {
  IRI,
  OWLStructuralObject,
  isFactoryStructuralObject,
  isPackageStructuralObject,
  nativeStructuralMethods,
  structuralKey,
} from "../../model/structural.js";
import { RDF_NAMESPACE } from "../rdfjs/vocabulary.js";
import {
  OWLDataFactory,
  createSourcePreservingDataFactory,
} from "../../model/owlDataFactory.js";
import { minimumTwoSetFields, repeatSingleton } from "./setConstructs.js";

import { structuralFields as fields } from "./structuralFields.js";

export class StructuralValidationError extends Error {}
const fail = () => {
  throw new StructuralValidationError(
    "Not an immutable package structural model",
  );
};
const key = (object) => nativeStructuralMethods.structuralKey.call(object);

/** Keep observable overrides and explicit tuple validation at public input
 * boundaries. A factory proof already authenticates its immutable native data. */
export function checkStructuralKeyReceiver(value) {
  const method = OWLStructuralObject.prototype.structuralKey;
  if (
    !isFactoryStructuralObject(value) ||
    method !== nativeStructuralMethods.structuralKey ||
    "toJSON" in Array.prototype
  ) {
    method.call(value);
  }
}

const validatedShapes = new WeakSet();
/** Read an existing data-only shape proof without attempting new admission. */
export const hasValidatedStructuralShape = (value) =>
  isFactoryStructuralObject(value) || validatedShapes.has(value);
const validatedStructureNodes = new WeakSet();
const validatedGraphs = new WeakMap();
const validatedSnapshots = new WeakSet();

/** OntologyState supplies its sealed set and immutable snapshot together.
 * A generic constructor or foreign operand keeps the snapshot on full admission. */
export const registerStructuralSnapshot = (snapshot, axioms) => {
  if (
    axioms.isFactoryValidated &&
    isFactoryStructuralObject(snapshot.ontologyID) &&
    snapshot.directOntologyAnnotations.every(isFactoryStructuralObject) &&
    snapshot.authoredImportDeclarations.every(isFactoryStructuralObject)
  ) {
    validatedSnapshots.add(snapshot);
  }
  return snapshot;
};
export const hasValidatedStructuralSnapshot = (snapshot) =>
  validatedSnapshots.has(snapshot);

export const validateStructuralShape = (value) => {
  if (hasValidatedStructuralShape(value)) return;
  if (!Object.isFrozen(value)) return fail();
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) return fail();
    if (Reflect.ownKeys(value).length !== value.length + 1) return fail();
    for (let index = 0; index < value.length; index += 1)
      if (
        !Object.hasOwn(
          Object.getOwnPropertyDescriptor(value, index) ?? {},
          "value",
        )
      )
        return fail();
    validatedShapes.add(value);
    return;
  }
  const prototype = Object.getPrototypeOf(value);
  if (
    prototype !== IRI.prototype &&
    prototype !== OWLStructuralObject.prototype
  )
    return fail();
  const kind = Object.getOwnPropertyDescriptor(value, "kind");
  if (!kind || !Object.hasOwn(kind, "value")) return fail();
  const names = fields.get(kind.value);
  if (!names || Reflect.ownKeys(value).length !== names.length + 1)
    return fail();
  for (const name of ["kind", ...names])
    if (
      !Object.hasOwn(
        Object.getOwnPropertyDescriptor(value, name) ?? {},
        "value",
      )
    )
      return fail();
  if (!isPackageStructuralObject(value)) return fail();
  validatedShapes.add(value);
};

// Structural authenticity accepts values from either supported factory.
// OWL-language semantics, including empty enumerations, are checked separately.
const newValidationFactory = () =>
  createSourcePreservingDataFactory(
    new OWLDataFactory({ behaviorProfileId: "java-owlapi-5.5.1" }),
  );

const validateExplicitStructure = (value, factory) => {
  let rebuilt;
  try {
    if (value.kind === K.IRI) rebuilt = IRI.create(value.value);
    else if (value.kind === K.LITERAL) {
      // Construction overloads can normalize lexical or language forms.
      // Validate the stored representation without invoking an overload again.
      if (
        typeof value.lexicalForm !== "string" ||
        typeof value.language !== "string" ||
        value.datatype?.kind !== K.DATATYPE ||
        (value.language !== "" &&
          value.datatype.iri.value !== RDF_NAMESPACE + "langString")
      )
        return fail();
      if (
        structuralKey(K.LITERAL, [
          value.lexicalForm,
          value.language,
          value.datatype,
        ]) !== key(value)
      )
        return fail();
      if (validatedShapes.has(value)) validatedStructureNodes.add(value);
      return;
    } else if (value.kind === K.INVERSE_OBJECT_PROPERTIES_AXIOM) {
      if (value.properties.length !== 2) return fail();
      rebuilt = factory.getOWLInverseObjectPropertiesAxiom(
        value.properties[0],
        value.properties[1],
        value.annotations,
      );
    } else if (
      value.kind === K.ONTOLOGY_ID &&
      value.ontologyIRI === undefined
    ) {
      if (value.versionIRI !== undefined) return fail();
      if (validatedShapes.has(value)) validatedStructureNodes.add(value);
      return;
    } else {
      const setField = minimumTwoSetFields.get(value.kind);
      const args = fields
        .get(value.kind)
        .map((field) =>
          field === setField ? repeatSingleton(value[field]) : value[field],
        );
      rebuilt = factory[`get${value.kind}`](...args);
    }
    if (key(rebuilt) !== key(value)) return fail();
    if (validatedShapes.has(value)) validatedStructureNodes.add(value);
  } catch (error) {
    if (
      error instanceof TypeError ||
      error instanceof RangeError ||
      error instanceof StructuralValidationError
    )
      return fail();
    throw error;
  }
};

/** Recheck representation invariants and stored-key/field agreement after every child
 * has passed the data-only shape check. Public OWLStructuralObject constructors
 * cannot manufacture a false-valid report by supplying different key tuples.
 */
export const createStructuralValidator = () => {
  let factory;
  return (value) => {
    if (
      isFactoryStructuralObject(value) ||
      validatedStructureNodes.has(value)
    ) {
      return;
    }
    validateExplicitStructure(value, (factory ??= newValidationFactory()));
  };
};

/** Validate one immutable object graph and return its children-first order.
 * Cached subtree heights enforce limits on every DAG path. Arrays stay active
 * until their children complete, so manufactured cycles cannot evade admission.
 * Callers select a finite supported-kind inventory before invoking callbacks.
 */
export const inspectStructuralGraph = (
  root,
  supportedKinds,
  maxDepth = Infinity,
  maxAnnotationDepth = Infinity,
) => {
  if (!root || Array.isArray(root) || typeof root !== "object")
    throw new TypeError("Expected an OWL object");
  const factoryGraph = isFactoryStructuralObject(root);
  const cached = factoryGraph ? undefined : validatedGraphs.get(root);
  if (
    cached &&
    cached.depth <= maxDepth &&
    cached.annotations <= maxAnnotationDepth
  ) {
    for (const kind of cached.kinds) {
      if (!supportedKinds.has(kind))
        throw new TypeError("Unsupported structural input kind");
    }
    return cached;
  }
  const validate = createStructuralValidator();
  let work = 0;
  const active = new Set(),
    heights = new Map(),
    order = [],
    kindsInGraph = new Set();
  const pending = [
    {
      value: root,
      depth: 0,
      annotationDepth: root.kind === K.ANNOTATION ? 1 : 0,
    },
  ];
  while (pending.length) {
    const { value, depth, annotationDepth, exiting } = pending.pop();
    if (!value || typeof value !== "object") continue;
    const children = () =>
      Array.isArray(value)
        ? value
        : fields.get(value.kind).map((field) => value[field]);
    if (exiting) {
      if (!Array.isArray(value)) {
        validate(value);
        kindsInGraph.add(value.kind);
      }
      const height = { depth: 0, annotations: 0 };
      const childValues = children();
      work += 1 + childValues.length;
      for (const child of childValues) {
        const childHeight = heights.get(child);
        if (!childHeight) continue;
        height.depth = Math.max(height.depth, childHeight.depth + 1);
        height.annotations = Math.max(
          height.annotations,
          childHeight.annotations + (child.kind === K.ANNOTATION ? 1 : 0),
        );
      }
      heights.set(value, height);
      active.delete(value);
      order.push(value);
      continue;
    }
    const height = heights.get(value);
    if (
      depth + (height?.depth ?? 0) > maxDepth ||
      annotationDepth + (height?.annotations ?? 0) > maxAnnotationDepth
    )
      throw new ResourceLimitError("Structural depth limit exceeded", {
        resource: "expressionDepth",
        limit: maxDepth,
      });
    if (height) continue;
    if (active.has(value)) throw new TypeError("Cyclic structural input");
    if (!factoryGraph) validateStructuralShape(value);
    if (!Array.isArray(value) && !supportedKinds.has(value.kind))
      throw new TypeError("Unsupported structural input kind");
    active.add(value);
    pending.push({ value, exiting: true });
    const values = children();
    for (let index = values.length - 1; index >= 0; index--) {
      const child = values[index];
      pending.push({
        value: child,
        depth: depth + 1,
        annotationDepth:
          annotationDepth + (child?.kind === K.ANNOTATION ? 1 : 0),
      });
    }
  }
  const rootHeight = heights.get(root);
  const frozenOrder = Object.freeze(order);
  const facts = {
    depth: rootHeight?.depth ?? 0,
    annotations:
      (rootHeight?.annotations ?? 0) + (root.kind === K.ANNOTATION ? 1 : 0),
    kinds: kindsInGraph,
    order: frozenOrder,
    work,
  };
  if (!factoryGraph) {
    validatedGraphs.set(root, facts);
  }
  return facts;
};

export const validateStructuralGraph = (
  root,
  supportedKinds,
  maxDepth,
  maxAnnotationDepth,
) =>
  inspectStructuralGraph(root, supportedKinds, maxDepth, maxAnnotationDepth)
    .order;
