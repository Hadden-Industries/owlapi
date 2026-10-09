import { OWLObjectKind as K } from "../../model/kinds.js";
import { ResourceLimitError } from "../../io/errors.js";
import { IRI, OWLStructuralObject } from "../../model/structural.js";
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
const key = (object) =>
  OWLStructuralObject.prototype.structuralKey.call(object);

export const validateStructuralShape = (value) => {
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
  try {
    key(value);
  } catch {
    return fail();
  }
};

/** Recheck factory invariants and stored-key/field agreement after every child
 * has passed the data-only shape check. Public OWLStructuralObject constructors
 * cannot manufacture a false-valid report by supplying different key tuples.
 */
export const createStructuralValidator = () => {
  const factory = createSourcePreservingDataFactory(new OWLDataFactory());
  return (value) => {
    let rebuilt;
    try {
      if (value.kind === K.IRI) rebuilt = IRI.create(value.value);
      else if (value.kind === K.LITERAL)
        rebuilt = factory.getOWLLiteral(
          value.lexicalForm,
          value.language || value.datatype,
        );
      else if (value.kind === K.INVERSE_OBJECT_PROPERTIES_AXIOM) {
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
};

/** Validate one immutable object graph and return its children-first order.
 * Cached subtree heights enforce limits on every DAG path. Arrays stay active
 * until their children complete, so manufactured cycles cannot evade admission.
 * Callers select a finite supported-kind inventory before invoking callbacks.
 */
export const validateStructuralGraph = (
  root,
  supportedKinds,
  maxDepth = 512,
  maxAnnotationDepth = 64,
) => {
  if (!root || Array.isArray(root) || typeof root !== "object")
    throw new TypeError("Expected an OWL object");
  const validate = createStructuralValidator();
  const active = new Set(),
    heights = new Map(),
    order = [];
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
      if (!Array.isArray(value)) validate(value);
      const height = { depth: 0, annotations: 0 };
      for (const child of children()) {
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
    validateStructuralShape(value);
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
  return order;
};
