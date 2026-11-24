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
    const iri = entity.iri;
    for (let i = 0; i < this.#ontologies.length; i += 1) {
      const ontology = this.#ontologies[i];
      const model = readOntologyModel(readOntologySnapshot(ontology));
      model.forEachReferencingAxiomFor(entity, (axiom) => {
        this.#changes.push(new RemoveAxiom(ontology, axiom));
      });
      model.forEachAnnotationAssertionFor(iri, undefined, (axiom) => {
        this.#changes.push(new RemoveAxiom(ontology, axiom));
      });
    }
  }
  getChanges() {
    return [...this.#changes];
  }
  reset() {
    this.#changes = [];
  }
}
