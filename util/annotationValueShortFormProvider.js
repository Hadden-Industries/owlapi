import { ENTITY_KINDS, OWLObjectKind as K } from "../model/kinds.js";
import { readOntologySnapshot } from "../model/owlOntology.js";
import { readLoadedImportsClosure } from "../internal/model/sourceEvidence.js";
import {
  iriShortForm,
  SimpleShortFormProvider,
} from "./simpleShortFormProvider.js";
import { requireTransformKind } from "../internal/model/objectTransform.js";
import { compareDisplayObjects } from "../internal/model/structuralDisplayOrder.js";

const stringShortForm = (provider, entity) => {
  const result = provider.getShortForm(entity);
  if (typeof result !== "string")
    throw new TypeError(
      "short-form providers must return a string synchronously",
    );
  return result;
};

/** Captured property/language priorities over a live explicit ontology-set
 * provider. Queries reflect current member revisions; getters return copies.
 */
export class AnnotationValueShortFormProvider {
  #properties;
  #languages = new Map();
  #ontologies;
  #alternate;
  constructor(
    annotationProperties,
    preferredLanguageMap,
    ontologySetProvider,
    alternateShortFormProvider = new SimpleShortFormProvider(),
  ) {
    if (
      !annotationProperties ||
      typeof annotationProperties[Symbol.iterator] !== "function"
    )
      throw new TypeError("annotationProperties must be iterable");
    this.#properties = Object.freeze([...annotationProperties]);
    this.#properties.forEach((property) =>
      requireTransformKind(property, [K.ANNOTATION_PROPERTY]),
    );
    if (!(preferredLanguageMap instanceof Map))
      throw new TypeError("preferredLanguageMap must be a Map");
    for (const [property, languages] of preferredLanguageMap) {
      requireTransformKind(property, [K.ANNOTATION_PROPERTY]);
      if (
        !languages ||
        typeof languages === "string" ||
        typeof languages[Symbol.iterator] !== "function"
      )
        throw new TypeError("preferred languages must be a string iterable");
      const captured = [...languages];
      if (captured.some((language) => typeof language !== "string"))
        throw new TypeError("preferred languages must contain strings");
      this.#languages.set(property.structuralKey(), {
        property,
        languages: Object.freeze(captured),
      });
    }
    if (typeof ontologySetProvider?.ontologies !== "function")
      throw new TypeError("ontologySetProvider must implement ontologies()");
    if (typeof alternateShortFormProvider?.getShortForm !== "function")
      throw new TypeError(
        "alternateShortFormProvider must implement getShortForm()",
      );
    this.#ontologies = ontologySetProvider;
    this.#alternate = alternateShortFormProvider;
    Object.freeze(this);
  }

  getShortForm(entity) {
    requireTransformKind(entity, ENTITY_KINDS);
    const provided = this.#ontologies.ontologies();
    if (!provided || typeof provided[Symbol.iterator] !== "function")
      throw new TypeError("ontologies() must return an iterable");
    const snapshots = [...provided].map((ontology) =>
      readLoadedImportsClosure(ontology).flatMap(
        (member) => readOntologySnapshot(member).directAxioms,
      ),
    );
    for (const property of this.#properties) {
      const preferences =
        this.#languages.get(property.structuralKey())?.languages ?? [];
      const candidates = snapshots.flatMap((axioms) =>
        axioms
          .filter(
            (axiom) =>
              axiom.kind === K.ANNOTATION_ASSERTION_AXIOM &&
              axiom.subject.equals(entity.iri) &&
              axiom.property.equals(property),
          )
          .map((axiom) => axiom.value)
          .sort(compareDisplayObjects),
      );
      let selected;
      let bestLanguage = Number.MAX_SAFE_INTEGER;
      // Native encounter order matters: an IRI can replace a non-first language
      // match, while the first preferred language terminates this property's search.
      // Retain that observed behavior rather than globally sorting all members.
      for (const value of candidates) {
        if (value.kind === K.IRI) selected = value;
        else if (value.kind === K.LITERAL) {
          const rank = preferences.length
            ? preferences.indexOf(value.language)
            : 0;
          if (rank >= 0 && rank < bestLanguage) {
            selected = value;
            bestLanguage = rank;
            if (rank === 0) break;
          }
        }
      }
      if (selected)
        return selected.kind === K.IRI
          ? iriShortForm(selected)
          : selected.lexicalForm;
    }
    return stringShortForm(this.#alternate, entity);
  }
  getAnnotationProperties() {
    return [...this.#properties];
  }
  getPreferredLanguageMap() {
    return new Map(
      [...this.#languages.values()].map(({ property, languages }) => [
        property,
        [...languages],
      ]),
    );
  }
  /** No retained subscriptions or external resources are owned. */
  dispose() {}
}
