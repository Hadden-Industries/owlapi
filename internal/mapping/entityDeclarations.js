/** Canonical writer declarations; reverse-only compatibility aliases stay local. */
import { OWLObjectKind } from "../../model/kinds.js";
import { OWL_VOCABULARY, RDFS_VOCABULARY } from "../rdfjs/vocabulary.js";

export const ENTITY_DECLARATION_TYPES = Object.freeze({
  [OWLObjectKind.ANNOTATION_PROPERTY]: OWL_VOCABULARY.AnnotationProperty,
  [OWLObjectKind.CLASS]: OWL_VOCABULARY.Class,
  [OWLObjectKind.DATA_PROPERTY]: OWL_VOCABULARY.DatatypeProperty,
  [OWLObjectKind.DATATYPE]: RDFS_VOCABULARY.Datatype,
  [OWLObjectKind.NAMED_INDIVIDUAL]: OWL_VOCABULARY.NamedIndividual,
  [OWLObjectKind.OBJECT_PROPERTY]: OWL_VOCABULARY.ObjectProperty,
});
