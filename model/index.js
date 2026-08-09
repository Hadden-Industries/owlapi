export {
  ANNOTATION_VALUE_KINDS,
  AXIOM_KINDS,
  CLASS_EXPRESSION_KINDS,
  DATA_PROPERTY_EXPRESSION_KINDS,
  DATA_RANGE_KINDS,
  ENTITY_KINDS,
  INDIVIDUAL_KINDS,
  OBJECT_PROPERTY_EXPRESSION_KINDS,
  OWL_OBJECT_KINDS,
  OWLObjectKind,
} from "./kinds.js";
export {
  dispatchAnnotationValue,
  dispatchAxiom,
  dispatchClassExpression,
  dispatchDataPropertyExpression,
  dispatchDataRange,
  dispatchIndividual,
  dispatchObjectPropertyExpression,
  dispatchOwlObject,
} from "./dispatch.js";
export { IRI, OWLStructuralObject, StructuralSet } from "./structural.js";
export { OWLDataFactory } from "./owlDataFactory.js";
export { OWLOntology } from "./owlOntology.js";
