import { OWLObjectKind } from "./kinds.js";
import { OWLOntology } from "./owlOntology.js";
import {
  isCanonicalStructuralObject,
  OWLStructuralObject,
} from "./structural.js";

const changeRecords = new WeakMap();

const requireOntology = (ontology) => {
  try {
    OWLOntology.prototype.getOntologyID.call(ontology);
    return ontology;
  } catch {
    throw new TypeError("ontology must be an OWLOntology");
  }
};

const requireOntologyID = (ontologyID) => {
  if (
    !isCanonicalStructuralObject(ontologyID) ||
    ontologyID.kind !== OWLObjectKind.ONTOLOGY_ID ||
    Object.getPrototypeOf(ontologyID) !== OWLStructuralObject.prototype
  ) {
    throw new TypeError("ontologyID must be an OWLOntologyID");
  }
  try {
    OWLStructuralObject.prototype.structuralKey.call(ontologyID);
  } catch {
    throw new TypeError("ontologyID must be an OWLOntologyID");
  }
  return ontologyID;
};

export class SetOntologyID {
  constructor(ontology, ontologyID) {
    const normalizedOntology = requireOntology(ontology);
    const newOntologyID = requireOntologyID(ontologyID);
    const originalOntologyID = requireOntologyID(
      OWLOntology.prototype.getOntologyID.call(normalizedOntology),
    );
    changeRecords.set(
      this,
      Object.freeze({
        newOntologyID,
        ontology: normalizedOntology,
        originalOntologyID,
      }),
    );
    Object.freeze(this);
  }

  getOntology() {
    return changeRecords.get(this).ontology;
  }

  getOriginalOntologyID() {
    return changeRecords.get(this).originalOntologyID;
  }

  getNewOntologyID() {
    return changeRecords.get(this).newOntologyID;
  }
}

export const readSetOntologyIDChange = (change) => changeRecords.get(change);
