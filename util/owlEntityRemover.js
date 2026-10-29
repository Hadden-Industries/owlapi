import { ENTITY_KINDS } from "../model/kinds.js";
import { readOntologySnapshot } from "../model/owlOntology.js";
import { readOntologyModel } from "../internal/model/ontologyReadModel.js";
import { RemoveAxiom } from "../model/removeAxiom.js";
import {
  captureOntologies,
  requireTransformKind,
} from "../internal/model/objectTransform.js";

/** Accumulate referencing and subject-annotation removals. Repeated visits append
 * repeated proposals until reset; no change is applied by this utility.
 */
export class OWLEntityRemover {
  #ontologies;
  #changes = [];
  constructor(ontologies) {
    this.#ontologies = captureOntologies(ontologies);
    Object.freeze(this);
  }
  visit(entity) {
    requireTransformKind(entity, ENTITY_KINDS);
    const entityKey = entity.structuralKey();
    const iriKey = entity.iri.structuralKey();
    for (const ontology of this.#ontologies) {
      const model = readOntologyModel(readOntologySnapshot(ontology));
      for (const axiom of model.referencingAxioms(entityKey))
        this.#changes.push(new RemoveAxiom(ontology, axiom));
      for (const axiom of model.annotationAssertions(iriKey))
        this.#changes.push(new RemoveAxiom(ontology, axiom));
    }
  }
  getChanges() {
    return [...this.#changes];
  }
  reset() {
    this.#changes = [];
  }
}
