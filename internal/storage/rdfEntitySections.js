import { OWL_NAMESPACE, RDFS_NAMESPACE } from "../rdfjs/vocabulary.js";

const names = new Map([
  [`${OWL_NAMESPACE}AnnotationProperty`, "Annotation properties"],
  [`${RDFS_NAMESPACE}Datatype`, "Datatypes"],
  [`${OWL_NAMESPACE}ObjectProperty`, "Object Properties"],
  [`${OWL_NAMESPACE}DatatypeProperty`, "Data properties"],
  [`${OWL_NAMESPACE}Class`, "Classes"],
  [`${OWL_NAMESPACE}NamedIndividual`, "Individuals"],
]);

/** Shared Java RDF renderer section names; general-axiom layout is format-owned. */
export const rdfEntitySectionName = (typeIRI) => names.get(typeIRI);
