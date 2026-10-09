import {
  initializeOntologyChange,
  readOntologyChange,
} from "../internal/model/ontologyChangeRecord.js";

/** Add an authored import declaration without acquiring a document. */
export class AddImport {
  constructor(ontology, declaration) {
    initializeOntologyChange(this, "ADD_IMPORT", ontology, declaration);
  }
  getOntology() {
    return readOntologyChange(this).ontology;
  }
  getImportDeclaration() {
    return readOntologyChange(this).value;
  }
}
