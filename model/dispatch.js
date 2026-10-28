import {
  ANNOTATION_VALUE_KINDS,
  AXIOM_KINDS,
  CLASS_EXPRESSION_KINDS,
  DATA_PROPERTY_EXPRESSION_KINDS,
  DATA_RANGE_KINDS,
  INDIVIDUAL_KINDS,
  OBJECT_PROPERTY_EXPRESSION_KINDS,
  OWL_OBJECT_KINDS,
} from "./kinds.js";
import { isCanonicalStructuralObject } from "./structural.js";

const kindSets = new WeakMap();
const validatedFrozenHandlers = new WeakMap();

const kindSetFor = (kinds) => {
  let set = kindSets.get(kinds);
  if (!set) kindSets.set(kinds, (set = new Set(kinds)));
  return set;
};

const frozenHandlerSetFor = (kinds) => {
  let set = validatedFrozenHandlers.get(kinds);
  if (!set) validatedFrozenHandlers.set(kinds, (set = new WeakSet()));
  return set;
};

const dispatch = (value, handlers, kinds, category) => {
  if (
    !isCanonicalStructuralObject(value) ||
    !kindSetFor(kinds).has(value.kind)
  ) {
    throw new TypeError(
      `Unknown ${category} kind: ${value?.kind || "missing"}`,
    );
  }
  const frozenSet =
    handlers && typeof handlers === "object" && Object.isFrozen(handlers)
      ? frozenHandlerSetFor(kinds)
      : undefined;
  if (!frozenSet?.has(handlers)) {
    for (let i = 0; i < kinds.length; i += 1) {
      const kind = kinds[i];
      if (typeof handlers?.[kind] !== "function") {
        throw new TypeError(`Missing handler for ${kind}`);
      }
    }
    frozenSet?.add(handlers);
  }
  return handlers[value.kind](value);
};

export const dispatchOwlObject = (value, handlers) =>
  dispatch(value, handlers, OWL_OBJECT_KINDS, "OWL object");

export const dispatchAxiom = (value, handlers) =>
  dispatch(value, handlers, AXIOM_KINDS, "axiom");

export const dispatchClassExpression = (value, handlers) =>
  dispatch(value, handlers, CLASS_EXPRESSION_KINDS, "class expression");

export const dispatchDataRange = (value, handlers) =>
  dispatch(value, handlers, DATA_RANGE_KINDS, "data range");

export const dispatchObjectPropertyExpression = (value, handlers) =>
  dispatch(
    value,
    handlers,
    OBJECT_PROPERTY_EXPRESSION_KINDS,
    "object property expression",
  );

export const dispatchDataPropertyExpression = (value, handlers) =>
  dispatch(
    value,
    handlers,
    DATA_PROPERTY_EXPRESSION_KINDS,
    "data property expression",
  );

export const dispatchAnnotationValue = (value, handlers) =>
  dispatch(value, handlers, ANNOTATION_VALUE_KINDS, "annotation value");

export const dispatchIndividual = (value, handlers) =>
  dispatch(value, handlers, INDIVIDUAL_KINDS, "individual");
