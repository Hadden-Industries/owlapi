import {
  AXIOM_KINDS_WITH_SWRL,
  OWL_OBJECT_KINDS_WITH_SWRL,
  OWLObjectKind as K,
} from "../../model/kinds.js";
import { readOntologySnapshot } from "../../model/owlOntology.js";
import {
  isCanonicalStructuralObject,
  isFactoryStructuralObject,
  OWLStructuralObject,
} from "../../model/structural.js";
import {
  checkStructuralKeyReceiver,
  validateStructuralGraph,
} from "./structuralValidation.js";

const records = new WeakMap();
const supportedKinds = new Set(OWL_OBJECT_KINDS_WITH_SWRL);
const axiomKindsSet = new Set(AXIOM_KINDS_WITH_SWRL);
const kinds = Object.freeze({
  ADD_AXIOM: axiomKindsSet,
  REMOVE_AXIOM: axiomKindsSet,
  ADD_IMPORT: new Set([K.IMPORTS_DECLARATION]),
  REMOVE_IMPORT: new Set([K.IMPORTS_DECLARATION]),
  REMOVE_ONTOLOGY_ANNOTATION: new Set([K.ANNOTATION]),
});

/** Validate an ontology + structural value pair without allocating a change record. */
export const validateStructuralChangeTarget = (kind, ontology, value) => {
  readOntologySnapshot(ontology);
  if (
    !isCanonicalStructuralObject(value) ||
    !kinds[kind]?.has(value.kind) ||
    Object.getPrototypeOf(value) !== OWLStructuralObject.prototype
  ) {
    throw new TypeError("change value has an invalid OWL structural kind");
  }
  checkStructuralKeyReceiver(value);
  if (!isFactoryStructuralObject(value)) {
    validateStructuralGraph(value, supportedKinds);
  }
};

/** Retain nominal immutable records; descriptors never come from caller methods. */
const createOntologyChangeRecord = (kind, ontology, value) => {
  validateStructuralChangeTarget(kind, ontology, value);
  return Object.freeze({ kind, ontology, value });
};

export const initializeOntologyChange = (change, kind, ontology, value) => {
  records.set(change, createOntologyChangeRecord(kind, ontology, value));
  Object.freeze(change);
};
let readNativeRemove;
/** An immutable, nominal proposal to remove exactly this annotated axiom.
 * The private record follows proposal lifetime without a second WeakMap entry.
 */
export class RemoveAxiom {
  #record;
  static {
    readNativeRemove = (value) =>
      #record in value ? value.#record : undefined;
  }
  constructor(ontology, axiom) {
    this.#record = createOntologyChangeRecord("REMOVE_AXIOM", ontology, axiom);
    Object.freeze(this);
  }
  getOntology() {
    return (readNativeRemove(this) ?? records.get(this)).ontology;
  }
  getAxiom() {
    return (readNativeRemove(this) ?? records.get(this)).value;
  }
}
export const readOntologyChange = (change) =>
  (change && typeof change === "object"
    ? readNativeRemove(change)
    : undefined) ?? records.get(change);
