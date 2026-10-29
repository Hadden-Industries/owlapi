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
const createOntologyChangeRecord = (kind, ontology, value) => {
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
