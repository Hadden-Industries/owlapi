import {
  initializeOntologyChange,
  readOntologyChange,
} from "../internal/model/ontologyChangeRecord.js";

/** An immutable proposal to remove exactly this annotated axiom. */
export class RemoveAxiom {
  constructor(ontology, axiom) {
    initializeOntologyChange(this, "REMOVE_AXIOM", ontology, axiom);
  }
  getOntology() {
    return readOntologyChange(this).ontology;
  }
  getAxiom() {
    return readOntologyChange(this).value;
  }
}
