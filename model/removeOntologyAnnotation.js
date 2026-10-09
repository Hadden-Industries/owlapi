import {
  initializeOntologyChange,
  readOntologyChange,
} from "../internal/model/ontologyChangeRecord.js";

/** Remove exactly this ontology header annotation, including nested annotations. */
export class RemoveOntologyAnnotation {
  constructor(ontology, annotation) {
    initializeOntologyChange(
      this,
      "REMOVE_ONTOLOGY_ANNOTATION",
      ontology,
      annotation,
    );
  }
  getOntology() {
    return readOntologyChange(this).ontology;
  }
  getAnnotation() {
    return readOntologyChange(this).value;
  }
}
