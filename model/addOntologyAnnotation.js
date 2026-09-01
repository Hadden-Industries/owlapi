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

const requireOntologyAnnotation = (annotation) => {
  if (
    !isCanonicalStructuralObject(annotation) ||
    annotation.kind !== OWLObjectKind.ANNOTATION ||
    Object.getPrototypeOf(annotation) !== OWLStructuralObject.prototype
  ) {
    throw new TypeError("annotation must be an OWLAnnotation");
  }
  try {
    OWLStructuralObject.prototype.structuralKey.call(annotation);
  } catch {
    throw new TypeError("annotation must be an OWLAnnotation");
  }
  return annotation;
};

export class AddOntologyAnnotation {
  constructor(ontology, annotation) {
    const normalizedOntology = requireOntology(ontology);
    const normalizedAnnotation = requireOntologyAnnotation(annotation);
    changeRecords.set(
      this,
      Object.freeze({
        annotation: normalizedAnnotation,
        ontology: normalizedOntology,
      }),
    );
    Object.freeze(this);
  }

  getOntology() {
    return changeRecords.get(this).ontology;
  }

  getAnnotation() {
    return changeRecords.get(this).annotation;
  }
}

export const readAddOntologyAnnotationChange = (change) =>
  changeRecords.get(change);
