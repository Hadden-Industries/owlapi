import {
  initializeOntologyChange,
  readOntologyChange,
} from "../internal/model/ontologyChangeRecord.js";

/** Remove an authored declaration and its corresponding loaded import edge. */
export class RemoveImport {
  constructor(ontology, declaration) {
    initializeOntologyChange(this, "REMOVE_IMPORT", ontology, declaration);
  }
  getOntology() {
    return readOntologyChange(this).ontology;
  }
  getImportDeclaration() {
    return readOntologyChange(this).value;
  }
}
