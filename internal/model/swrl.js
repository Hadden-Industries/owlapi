import { OWLObjectKind as K } from "../../model/kinds.js";
import {
  OWLStructuralObject,
  StructuralSet,
  createFactoryStructuralObject,
  createStructuralPair,
  createStructuralUnary,
  isCanonicalStructuralObject,
  normalizeStructuralSet,
} from "../../model/structural.js";

function requireKind(value, kind) {
  if (value?.kind !== kind || !isCanonicalStructuralObject(value))
    throw new TypeError("Expected " + kind);
  return value;
}

/** Internal construction shared by the two readers and structural validation. */
export const swrlVariable = (iri) =>
  createStructuralUnary(K.SWRL_VARIABLE, "iri", requireKind(iri, K.IRI));
export const swrlClassAtom = (predicate, argument) =>
  createStructuralPair(
    K.SWRL_CLASS_ATOM,
    "predicate",
    requireKind(predicate, K.CLASS),
    "argument",
    requireKind(argument, K.SWRL_VARIABLE),
  );
export function swrlObjectPropertyAtom(
  predicate,
  firstArgument,
  secondArgument,
) {
  const fields = {
    predicate: requireKind(predicate, K.OBJECT_PROPERTY),
    firstArgument: requireKind(firstArgument, K.SWRL_VARIABLE),
    secondArgument: requireKind(secondArgument, K.SWRL_VARIABLE),
  };
  return createFactoryStructuralObject(
    K.SWRL_OBJECT_PROPERTY_ATOM,
    fields,
    Object.values(fields),
  );
}

function ruleSide(atoms) {
  const result = new StructuralSet();
  for (const atom of atoms) {
    if (
      atom?.kind !== K.SWRL_CLASS_ATOM &&
      atom?.kind !== K.SWRL_OBJECT_PROPERTY_ATOM
    )
      throw new TypeError("Expected a supported SWRL atom");
    result.add(atom);
  }
  return Object.freeze([...result]);
}

/** Iterate each side in encounter order. The explicit tuple compares each side as a set. */
export function swrlRule(body, head, annotations = []) {
  const fields = {
    body: ruleSide(body),
    head: ruleSide(head),
    annotations: normalizeStructuralSet(annotations, "annotations"),
  };
  for (const annotation of fields.annotations) {
    requireKind(annotation, K.ANNOTATION);
    if (annotation.annotations.length || annotation.value.kind !== K.LITERAL)
      throw new TypeError("Expected a direct literal rule annotation");
  }
  const sides = [
    normalizeStructuralSet(fields.body, "body"),
    normalizeStructuralSet(fields.head, "head"),
  ];
  return new OWLStructuralObject(
    K.SWRL_RULE,
    fields,
    [...sides, fields.annotations],
    { componentsWithoutAnnotations: sides },
  );
}

export const swrlConstructors = new Map([
  [K.SWRL_VARIABLE, swrlVariable],
  [K.SWRL_CLASS_ATOM, swrlClassAtom],
  [K.SWRL_OBJECT_PROPERTY_ATOM, swrlObjectPropertyAtom],
  [K.SWRL_RULE, swrlRule],
]);
