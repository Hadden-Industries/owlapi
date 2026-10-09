import {
  initializeOntologyChange,
  readOntologyChange,
} from "../internal/model/ontologyChangeRecord.js";

/** An immutable proposal to add an axiom; construction does not mutate state. */
export class AddAxiom {
  constructor(ontology, axiom) {
    initializeOntologyChange(this, "ADD_AXIOM", ontology, axiom);
  }
  getOntology() {
    return readOntologyChange(this).ontology;
  }
  getAxiom() {
    return readOntologyChange(this).value;
  }
}
