import { ENTITY_KINDS, OWLObjectKind as K } from "../model/kinds.js";
import { OWLOntology, readOntologySnapshot } from "../model/owlOntology.js";
import { AddAxiom } from "../model/addAxiom.js";
import { RemoveAxiom } from "../model/removeAxiom.js";
import { AddOntologyAnnotation } from "../model/addOntologyAnnotation.js";
import { RemoveOntologyAnnotation } from "../model/removeOntologyAnnotation.js";
import {
  captureOntologies,
  captureReplacements,
  entityResolver,
  iriReplacementsForEntities,
  requireTransformKind,
  transformFactory,
  transformObject,
} from "../internal/model/objectTransform.js";

/** Produce change arrays over current revisions of captured ontology members.
 * Typed changes preserve other punned entities; raw IRI changes cover every kind.
 * Anonymous individuals retain their identity in all proposed changes.
 */
export class OWLEntityRenamer {
  #ontologies;
  #factory;
  constructor(manager, ontologies) {
    this.#factory = transformFactory(manager);
    this.#ontologies = captureOntologies(ontologies);
    Object.freeze(this);
  }

  changeIRI(first, second) {
    let entities;
    let iris;
    const iriChange = !(first instanceof Map) && first?.kind === K.IRI;
    if (iriChange) {
      requireTransformKind(first, [K.IRI]);
      requireTransformKind(second, [K.IRI]);
      entities = new Map();
      iris = new Map([[first.structuralKey(), second]]);
      for (const kind of ENTITY_KINDS)
        entities.set(this.#factory[`get${kind}`](first).structuralKey(), {
          value: second,
        });
    } else {
      entities = captureReplacements(
        first instanceof Map ? first : new Map([[first, second]]),
        ENTITY_KINDS,
        [K.IRI],
      );
      iris = iriReplacementsForEntities(entities);
    }
    const resolveEntity = entityResolver(this.#factory, entities, iris);
    const resolve = (value) =>
      value.kind === K.ANONYMOUS_INDIVIDUAL ? value : resolveEntity(value);
    const changes = [];
    for (const ontology of this.#ontologies) {
      const snapshot = readOntologySnapshot(ontology);
      const batches = iriChange
        ? [
            [
              ...OWLOntology.prototype.getReferencingAxioms.call(
                ontology,
                first,
              ),
            ],
          ]
        : [...entities.values()].map(({ key }) => [
            ...OWLOntology.prototype.getReferencingAxioms.call(ontology, key),
            ...OWLOntology.prototype.getDeclarationAxioms.call(ontology, key),
            ...OWLOntology.prototype.getAnnotationAssertionAxioms.call(
              ontology,
              key.iri,
            ),
          ]);
      for (const candidates of batches) {
        for (const axiom of candidates) {
          const replacement = transformObject(axiom, this.#factory, resolve);
          if (!replacement.equals(axiom))
            changes.push(
              new RemoveAxiom(ontology, axiom),
              new AddAxiom(ontology, replacement),
            );
        }
        for (const annotation of snapshot.directOntologyAnnotations) {
          const replacement = transformObject(
            annotation,
            this.#factory,
            resolve,
          );
          if (!replacement.equals(annotation))
            changes.push(
              new RemoveOntologyAnnotation(ontology, annotation),
              new AddOntologyAnnotation(ontology, replacement),
            );
        }
      }
    }
    return changes;
  }
}
