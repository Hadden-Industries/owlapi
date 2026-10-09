import { ENTITY_KINDS, OWLObjectKind as K } from "../model/kinds.js";
import {
  captureReplacements,
  entityResolver,
  iriReplacementsForEntities,
  transformFactory,
  transformObject,
} from "../internal/model/objectTransform.js";

let nextDuplicator = 0;

/** Reconstruct immutable values. Maps are captured structurally at construction;
 * anonymous identities are fresh per duplicator and stable across its calls.
 */
export class OWLObjectDuplicator {
  #factory;
  #entities;
  #iris;
  #literals;
  #anonymous = new Map();
  #scope = `owlapi:duplicator:${nextDuplicator++}`;

  constructor(first, second, third) {
    let manager;
    if (first instanceof Map) {
      this.#entities = captureReplacements(first, ENTITY_KINDS, [K.IRI]);
      manager = third ?? second;
      this.#literals =
        third === undefined
          ? new Map()
          : captureReplacements(second, [K.LITERAL], [K.LITERAL]);
      this.#iris = iriReplacementsForEntities(this.#entities);
    } else {
      manager = first;
      this.#entities = new Map();
      this.#literals = new Map();
      this.#iris = new Map();
      if (second !== undefined) {
        const replacements = captureReplacements(second, [K.IRI], [K.IRI]);
        for (const { key, value } of replacements.values()) {
          this.#iris.set(key.structuralKey(), value);
          for (const kind of ENTITY_KINDS)
            this.#entities.set(
              JSON.stringify([kind, key.toStructuralTuple()]),
              { value },
            );
        }
      }
    }
    this.#factory = transformFactory(manager);
    Object.freeze(this);
  }

  duplicateObject(object) {
    const entities = entityResolver(this.#factory, this.#entities, this.#iris);
    return transformObject(object, this.#factory, (value) => {
      if (value.kind === K.LITERAL && this.#literals.has(value.structuralKey()))
        return this.#literals.get(value.structuralKey()).value;
      if (value.kind === K.ANONYMOUS_INDIVIDUAL) {
        const key = value.structuralKey();
        if (!this.#anonymous.has(key))
          this.#anonymous.set(
            key,
            this.#factory.getOWLAnonymousIndividual(
              String(this.#anonymous.size),
              this.#scope,
            ),
          );
        return this.#anonymous.get(key);
      }
      return entities(value);
    });
  }
}
