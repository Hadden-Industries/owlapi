import { ENTITY_KINDS } from "../model/kinds.js";
import { OWLOntology } from "../model/owlOntology.js";
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
    const changes = [];
    for (const ontology of this.#ontologies) {
      const axioms = [
        ...OWLOntology.prototype.getReferencingAxioms.call(ontology, entity),
        ...OWLOntology.prototype.getAnnotationAssertionAxioms.call(
          ontology,
          entity.iri,
        ),
      ];
      for (const axiom of axioms)
        changes.push(new RemoveAxiom(ontology, axiom));
    }
    this.#changes.push(...changes);
  }
  getChanges() {
    return [...this.#changes];
  }
  reset() {
    this.#changes = [];
  }
}
