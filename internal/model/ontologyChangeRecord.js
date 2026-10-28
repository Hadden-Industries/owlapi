import { AXIOM_KINDS, OWLObjectKind as K } from "../../model/kinds.js";
import { readOntologySnapshot } from "../../model/owlOntology.js";
import {
  isCanonicalStructuralObject,
  OWLStructuralObject,
} from "../../model/structural.js";
import { validateStructuralGraph } from "./structuralValidation.js";
import { OWL_OBJECT_KINDS } from "../../model/kinds.js";

const records = new WeakMap();
const supportedKinds = new Set(OWL_OBJECT_KINDS);
const axiomKindsSet = new Set(AXIOM_KINDS);
const kinds = Object.freeze({
  ADD_AXIOM: axiomKindsSet,
  REMOVE_AXIOM: axiomKindsSet,
  ADD_IMPORT: new Set([K.IMPORTS_DECLARATION]),
  REMOVE_IMPORT: new Set([K.IMPORTS_DECLARATION]),
  REMOVE_ONTOLOGY_ANNOTATION: new Set([K.ANNOTATION]),
});

/** Retain nominal immutable records; descriptors never come from caller methods. */
export const initializeOntologyChange = (change, kind, ontology, value) => {
  readOntologySnapshot(ontology);
  if (
    !isCanonicalStructuralObject(value) ||
    !kinds[kind]?.has(value.kind) ||
    Object.getPrototypeOf(value) !== OWLStructuralObject.prototype
  ) {
    throw new TypeError("change value has an invalid OWL structural kind");
  }
  OWLStructuralObject.prototype.structuralKey.call(value);
  validateStructuralGraph(value, supportedKinds);
  records.set(change, Object.freeze({ kind, ontology, value }));
  Object.freeze(change);
};

export const readOntologyChange = (change) => records.get(change);
