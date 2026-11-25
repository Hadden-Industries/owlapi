import {
  isFactoryStructuralObject,
  usesNativeStructuralKeys,
} from "../model/structural.js";
import { ENTITY_KINDS, OWLObjectKind as K } from "../model/kinds.js";
import { readOntologySnapshot } from "../model/owlOntology.js";
import { readOntologyModel } from "../internal/model/ontologyReadModel.js";
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

const ENTITY_KINDS_SET = new Set(ENTITY_KINDS);

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
    let resolve;
    const iriChange = !(first instanceof Map) && first?.kind === K.IRI;
    if (iriChange) {
      requireTransformKind(first, [K.IRI]);
      requireTransformKind(second, [K.IRI]);
      if (
        usesNativeStructuralKeys() &&
        isFactoryStructuralObject(first) &&
        isFactoryStructuralObject(second)
      ) {
        const firstValue = first.value;
        const replaced = new Map();
        const factory = this.#factory;
        const fallback = () => {
          const fallbackEntities = new Map();
          const iris = new Map([[first.structuralKey(), second]]);
          for (const kind of ENTITY_KINDS) {
            fallbackEntities.set(factory[`get${kind}`](first).structuralKey(), {
              value: second,
            });
          }
          return entityResolver(factory, fallbackEntities, iris);
        };
        let fallbackResolve;
        resolve = (value) => {
          if (value.kind === K.ANONYMOUS_INDIVIDUAL) return value;
          if (
            !isFactoryStructuralObject(value) ||
            !usesNativeStructuralKeys()
          ) {
            return (fallbackResolve ??= fallback())(value);
          }
          if (ENTITY_KINDS_SET.has(value.kind)) {
            if (value.iri.value !== firstValue) return value;
            let entity = replaced.get(value.kind);
            if (entity === undefined) {
              entity = factory[`get${value.kind}`](second);
              replaced.set(value.kind, entity);
            }
            return entity;
          }
          if (value.kind === K.IRI) {
            return value.value === firstValue ? second : value;
          }
          return undefined;
        };
      } else {
        entities = new Map();
        const iris = new Map([[first.structuralKey(), second]]);
        for (const kind of ENTITY_KINDS)
          entities.set(this.#factory[`get${kind}`](first).structuralKey(), {
            value: second,
          });
        const resolveEntity = entityResolver(this.#factory, entities, iris);
        resolve = (value) =>
          value.kind === K.ANONYMOUS_INDIVIDUAL ? value : resolveEntity(value);
      }
    } else {
      entities = captureReplacements(
        first instanceof Map ? first : new Map([[first, second]]),
        ENTITY_KINDS,
        [K.IRI],
      );
      const iris = iriReplacementsForEntities(entities);
      const resolveEntity = entityResolver(this.#factory, entities, iris);
      resolve = (value) =>
        value.kind === K.ANONYMOUS_INDIVIDUAL ? value : resolveEntity(value);
    }
    const changes = [];
    // One immutable replacement environment owns this memo. Repeated candidates
    // still produce repeated proposals in Java order; only reconstruction is shared.
    const transformed = new Map();
    const visitAnnotation = (ontology, annotation) => {
      const replacement = transformObject(
        annotation,
        this.#factory,
        resolve,
        transformed,
      );
      if (replacement !== annotation && !replacement.equals(annotation))
        changes.push(
          new RemoveOntologyAnnotation(ontology, annotation),
          new AddOntologyAnnotation(ontology, replacement),
        );
    };
    for (const ontology of this.#ontologies) {
      const snapshot = readOntologySnapshot(ontology);
      const model = readOntologyModel(snapshot);
      const visitAxiom = (axiom) => {
        const replacement = transformObject(
          axiom,
          this.#factory,
          resolve,
          transformed,
        );
        if (replacement !== axiom && !replacement.equals(axiom))
          changes.push(
            new RemoveAxiom(ontology, axiom),
            new AddAxiom(ontology, replacement),
          );
      };
      if (iriChange) {
        model.forEachReferencingAxiomFor(first, visitAxiom);
        for (const annotation of snapshot.directOntologyAnnotations) {
          visitAnnotation(ontology, annotation);
        }
      } else {
        for (const { key } of entities.values()) {
          model.forEachReferencingAxiomFor(key, visitAxiom);
          model.forEachPositionFor(
            K.DECLARATION_AXIOM,
            "entity",
            key,
            visitAxiom,
          );
          model.forEachAnnotationAssertionFor(key.iri, undefined, visitAxiom);
          for (const annotation of snapshot.directOntologyAnnotations) {
            visitAnnotation(ontology, annotation);
          }
        }
      }
    }
    return changes;
  }
}
