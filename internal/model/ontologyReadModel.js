import {
  AXIOM_KINDS_WITH_SWRL as AXIOM_KINDS,
  ENTITY_KINDS,
  OWLObjectKind,
} from "../../model/kinds.js";
import {
  isFactoryStructuralObject,
  usesNativeStructuralKeys,
  structuralKey,
  StructuralSet,
} from "../../model/structural.js";
import { StructuralHashTable } from "../collections/structuralHashTable.js";
import { buildCsrPostingIndex } from "../collections/csrPostingIndex.js";
import { indexAxiomBodies } from "../collections/axiomBodyIndex.js";
import { capturedKeysEqual } from "../collections/structuralComparator.js";
import { captureStructuralKey } from "../collections/structuralProjection.js";
import { structuralFields } from "./structuralFields.js";
import { readSnapshotAxioms } from "./ontologyState.js";
import {
  collectPostings,
  forEachPosting,
  hasPosting,
  postingToSet,
  postingValues,
} from "./structuralPostings.js";
import { isLogicalAxiom } from "./axiomSemantics.js";
import { XSD_NAMESPACE } from "../rdfjs/vocabulary.js";
import { OWLDataFactory } from "../../model/owlDataFactory.js";

const empty = Object.freeze([]);
const readers = new WeakMap();
const annotationFactory = new OWLDataFactory();
const referencingKinds = new Set([
  ...ENTITY_KINDS,
  OWLObjectKind.IRI,
  OWLObjectKind.LITERAL,
  OWLObjectKind.ANONYMOUS_INDIVIDUAL,
]);

export const visitStructuralValues = (root, visitor) => {
  const pending = [root];
  const visited = new Set();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);
    if (visitor(value) === true) return;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) pending.push(value[i]);
      continue;
    }
    const fields = isFactoryStructuralObject(value)
      ? structuralFields.get(value.kind)
      : Object.keys(value);
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      if (field !== "kind") pending.push(value[field]);
    }
  }
};

const axiomKinds = new Map(AXIOM_KINDS.map((kind, i) => [kind, i]));
const signatureKinds = new Map(
  [...ENTITY_KINDS, OWLObjectKind.ANONYMOUS_INDIVIDUAL].map((kind, i) => [
    kind,
    i,
  ]),
);

/** Derived indexes belong to one immutable revision. Stored postings are integer
 * ordinals. Public collections materialize only the values a query returns. */
function createOntologyReadModel(snapshot) {
  const stored = readSnapshotAxioms(snapshot);
  const terms = new StructuralHashTable();
  const termIds = new WeakMap();
  let kinds, logical, annotations, signature, referencing, axiomBodies;
  const positions = new Map();
  let exactMembership;
  const annotationViews = new Map();

  function termIdOf(target) {
    if (isFactoryStructuralObject(target) && usesNativeStructuralKeys()) {
      const cached = termIds.get(target);
      if (cached !== undefined) return cached;
      const id = terms.idOfCapturedKey(captureStructuralKey(target));
      if (id >= 0) termIds.set(target, id);
      return id;
    }
    return terms.idOfCapturedKey(captureStructuralKey(target));
  }

  function byKind() {
    if (!kinds) {
      const ordinals = new Uint8Array(stored.length);
      let i = 0;
      for (const axiom of stored) ordinals[i++] = axiomKinds.get(axiom.kind);
      kinds = buildCsrPostingIndex(axiomKinds.size, (emit) => {
        for (let id = 0; id < ordinals.length; id++) emit(ordinals[id], id);
      });
    }
    return kinds;
  }
  function axioms(kind) {
    return postingValues(stored, byKind(), axiomKinds.get(kind) ?? -1);
  }
  function axiomsSet(kind) {
    return postingToSet(stored, byKind(), axiomKinds.get(kind) ?? -1);
  }
  function ensureLogical() {
    if (!logical) {
      const ids = new Uint32Array(stored.length);
      let id = 0,
        count = 0;
      for (const axiom of stored) {
        if (isLogicalAxiom(axiom)) ids[count++] = id;
        id++;
      }
      logical = {
        offsets: Uint32Array.of(0, count),
        entries: count === ids.length ? ids : ids.slice(0, count),
      };
    }
    return logical;
  }
  function logicalAxioms() {
    return postingValues(stored, ensureLogical(), 0);
  }
  function logicalAxiomsSet() {
    return postingToSet(stored, ensureLogical(), 0);
  }
  function ensureReferencing() {
    referencing ??= collectPostings(terms, (emit) => {
      let id = 0;
      for (const axiom of stored) {
        visitStructuralValues(axiom, (value) => {
          if (referencingKinds.has(value.kind)) emit(value, id);
        });
        if (
          (axiom.kind === OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM ||
            axiom.kind === OWLObjectKind.ANNOTATION_ASSERTION_AXIOM) &&
          axiom.value?.kind === OWLObjectKind.LITERAL &&
          axiom.value.datatype.iri.value === `${XSD_NAMESPACE}anyURI`
        ) {
          emit(
            axiom.value,
            id,
            structuralKey(OWLObjectKind.IRI, [axiom.value.lexicalForm]),
          );
        }
        id++;
      }
    });
    return referencing;
  }
  function referencingAxioms(key) {
    return postingValues(
      stored,
      ensureReferencing(),
      terms.idOfCapturedKey(key),
    );
  }
  function referencingAxiomsSet(key) {
    return postingToSet(
      stored,
      ensureReferencing(),
      terms.idOfCapturedKey(key),
    );
  }
  function referencingAxiomsSetFor(target) {
    const postings = ensureReferencing();
    return postingToSet(stored, postings, termIdOf(target));
  }
  function forEachReferencingAxiomFor(target, visitor) {
    const postings = ensureReferencing();
    forEachPosting(stored, postings, termIdOf(target), visitor);
  }
  function visitKind(kind, visit) {
    // A narrow first-use index does not need postings for every other axiom
    // kind. Reuse the generic index only if a caller already requested it.
    if (!kinds) {
      let id = 0;
      for (const axiom of stored) {
        if (axiom.kind === kind) visit(axiom, id);
        id++;
      }
      return;
    }
    const ordinal = axiomKinds.get(kind);
    const { offsets, entries } = kinds;
    for (let i = offsets[ordinal]; i < offsets[ordinal + 1]; i++) {
      const id = entries[i];
      visit(stored.valueAt(id), id);
    }
  }
  function positionIndex(kind, field) {
    const slot = positions.get(kind);
    if (slot) {
      if (slot.field === field) return slot.postings;
      if (slot.altField === field) return slot.altPostings;
      const hit = slot.extra?.get(field);
      if (hit) return hit;
    }
    const postings = collectPostings(terms, (emit) =>
      visitKind(kind, (axiom, id) => {
        const operand = axiom[field];
        if (Array.isArray(operand)) {
          for (let i = 0; i < operand.length; i++) {
            const item = operand[i];
            if (item) emit(item, id);
          }
        } else if (operand) emit(operand, id);
      }),
    );
    if (!slot) {
      positions.set(kind, {
        field,
        postings,
        altField: undefined,
        altPostings: undefined,
        extra: undefined,
      });
    } else if (slot.altField === undefined) {
      slot.altField = field;
      slot.altPostings = postings;
    } else {
      (slot.extra ??= new Map()).set(field, postings);
    }
    return postings;
  }
  function position(kind, field, key) {
    return postingValues(
      stored,
      positionIndex(kind, field),
      terms.idOfCapturedKey(key),
    );
  }
  function positionSet(kind, field, key) {
    return postingToSet(
      stored,
      positionIndex(kind, field),
      terms.idOfCapturedKey(key),
    );
  }
  function positionSetFor(kind, field, target) {
    const postings = positionIndex(kind, field);
    return postingToSet(stored, postings, termIdOf(target));
  }
  function hasPosition(kind, field, key) {
    return hasPosting(positionIndex(kind, field), terms.idOfCapturedKey(key));
  }
  function hasPositionFor(kind, field, target) {
    const postings = positionIndex(kind, field);
    return hasPosting(postings, termIdOf(target));
  }
  function forEachPosition(kind, field, key, visitor) {
    forEachPosting(
      stored,
      positionIndex(kind, field),
      terms.idOfCapturedKey(key),
      visitor,
    );
  }
  function forEachPositionFor(kind, field, target, visitor) {
    const postings = positionIndex(kind, field);
    forEachPosting(stored, postings, termIdOf(target), visitor);
  }
  function equivalentAxioms(key, ignoreAnnotations = false) {
    let id;
    if (ignoreAnnotations) {
      axiomBodies ??= indexAxiomBodies(stored);
      const marker = axiomBodies.marker(key);
      if (marker < 0)
        return postingValues(stored, axiomBodies.overlaps, -marker - 1);
      id = marker - 1;
    } else {
      if (!exactMembership) {
        if (stored.hasNativeKeys && usesNativeStructuralKeys()) {
          exactMembership = (target) => {
            const ordinal = stored.idOfCapturedKey(target);
            return ordinal < 0
              ? empty
              : Object.freeze([stored.valueAt(ordinal)]);
          };
        } else {
          // Public membership historically captures the effective protocol
          // keys at its first query, independently of insertion-time identity.
          const keys = new StructuralHashTable();
          const postings = collectPostings(keys, (emit) => {
            let ordinal = 0;
            for (const axiom of stored) emit(axiom, ordinal++);
          });
          exactMembership = (target) =>
            postingValues(stored, postings, keys.idOfCapturedKey(target));
        }
      }
      return exactMembership(key);
    }
    return id < 0 ? empty : Object.freeze([stored.valueAt(id)]);
  }
  function ensureAnnotations() {
    annotations ??= collectPostings(terms, (emit) =>
      visitKind(OWLObjectKind.ANNOTATION_ASSERTION_AXIOM, (axiom, id) =>
        emit(axiom.subject, id),
      ),
    );
    return annotations;
  }
  function forEachAnnotationAssertionById(postings, id, propertyKey, visitor) {
    if (propertyKey === undefined) {
      forEachPosting(stored, postings, id, visitor);
      return;
    }
    forEachPosting(stored, postings, id, (axiom) => {
      if (
        capturedKeysEqual(captureStructuralKey(axiom.property), propertyKey)
      ) {
        visitor(axiom);
      }
    });
  }
  function forEachAnnotationAssertion(subjectKey, propertyKey, visitor) {
    const postings = ensureAnnotations();
    forEachAnnotationAssertionById(
      postings,
      terms.idOfCapturedKey(subjectKey),
      propertyKey,
      visitor,
    );
  }
  function forEachAnnotationAssertionFor(subject, propertyKey, visitor) {
    const postings = ensureAnnotations();
    forEachAnnotationAssertionById(
      postings,
      termIdOf(subject),
      propertyKey,
      visitor,
    );
  }
  function annotationAssertions(subjectKey, propertyKey) {
    const postings = ensureAnnotations();
    const id = terms.idOfCapturedKey(subjectKey);
    if (propertyKey === undefined) return postingValues(stored, postings, id);
    const result = [];
    forEachAnnotationAssertionById(postings, id, propertyKey, (axiom) =>
      result.push(axiom),
    );
    return result;
  }
  function annotationAssertionsSet(subjectKey, propertyKey) {
    const postings = ensureAnnotations();
    const id = terms.idOfCapturedKey(subjectKey);
    if (propertyKey === undefined) return postingToSet(stored, postings, id);
    const result = new Set();
    forEachAnnotationAssertionById(postings, id, propertyKey, (axiom) =>
      result.add(axiom),
    );
    return result;
  }
  function annotationAssertionsSetFor(subject, propertyKey) {
    const postings = ensureAnnotations();
    const id = termIdOf(subject);
    if (propertyKey === undefined) return postingToSet(stored, postings, id);
    const result = new Set();
    forEachAnnotationAssertionById(postings, id, propertyKey, (axiom) =>
      result.add(axiom),
    );
    return result;
  }
  function readAnnotationValuesById(postings, id, includeAssertionAnnotations) {
    if (!hasPosting(postings, id)) return empty;
    let views = annotationViews.get(includeAssertionAnnotations);
    let values = views?.get(id);
    if (!values) {
      if (!views) {
        annotationViews.set(includeAssertionAnnotations, (views = new Map()));
      }
      const unique = new StructuralSet();
      forEachPosting(stored, postings, id, (axiom) => {
        unique.add(
          annotationFactory.getOWLAnnotation(axiom.property, axiom.value),
        );
        if (includeAssertionAnnotations) {
          for (let i = 0; i < axiom.annotations.length; i++) {
            unique.add(axiom.annotations[i]);
          }
        }
      });
      values = Object.freeze([...unique]);
      views.set(id, values);
    }
    return values;
  }
  function discoverSignature() {
    if (signature) return signature;
    const entities = new StructuralHashTable();
    const collectEntity = (value) => {
      if (signatureKinds.has(value.kind)) entities.add(value);
    };
    for (const axiom of stored) visitStructuralValues(axiom, collectEntity);
    const axiomEntityCount = entities.size;
    for (const annotation of snapshot.directOntologyAnnotations)
      visitStructuralValues(annotation, collectEntity);
    const allNamed = signatureKinds.size;
    const byEntityKind = buildCsrPostingIndex(allNamed + 1, (emit) => {
      let id = 0;
      for (const entity of entities) {
        emit(signatureKinds.get(entity.kind), id);
        if (entity.kind !== OWLObjectKind.ANONYMOUS_INDIVIDUAL)
          emit(allNamed, id);
        id++;
      }
    });
    const byIRI = collectPostings(terms, (emit) => {
      let id = 0;
      for (const entity of entities) {
        if (entity.kind !== OWLObjectKind.ANONYMOUS_INDIVIDUAL)
          emit(entity.iri, id);
        id++;
      }
    });
    signature = { entities, byEntityKind, allNamed, byIRI, axiomEntityCount };
    return signature;
  }
  function annotationValues(subjectKey, includeAssertionAnnotations) {
    const postings = ensureAnnotations();
    return readAnnotationValuesById(
      postings,
      terms.idOfCapturedKey(subjectKey),
      includeAssertionAnnotations,
    );
  }
  function annotationValuesFor(subject, includeAssertionAnnotations) {
    const postings = ensureAnnotations();
    return readAnnotationValuesById(
      postings,
      termIdOf(subject),
      includeAssertionAnnotations,
    );
  }
  function entitiesSetFor(iri) {
    const found = discoverSignature();
    return postingToSet(found.entities, found.byIRI, termIdOf(iri));
  }
  function forEachEntityFor(iri, visitor) {
    const found = discoverSignature();
    forEachPosting(found.entities, found.byIRI, termIdOf(iri), visitor);
  }
  return Object.freeze({
    allAxioms: () => stored,
    allAxiomsSet: () => stored.toSet(),
    axioms,
    axiomsSet,
    logicalAxioms,
    logicalAxiomsSet,
    referencingAxioms,
    referencingAxiomsSet,
    referencingAxiomsSetFor,
    forEachReferencingAxiomFor,
    position,
    positionSet,
    positionSetFor,
    hasPosition,
    hasPositionFor,
    forEachPosition,
    forEachPositionFor,
    equivalentAxioms,
    annotationAssertions,
    annotationAssertionsSet,
    annotationAssertionsSetFor,
    forEachAnnotationAssertion,
    forEachAnnotationAssertionFor,
    annotationValues,
    annotationValuesFor,
    signature(kind) {
      const found = discoverSignature();
      return postingValues(
        found.entities,
        found.byEntityKind,
        kind === undefined ? found.allNamed : (signatureKinds.get(kind) ?? -1),
      );
    },
    signatureSet(kind) {
      const found = discoverSignature();
      return postingToSet(
        found.entities,
        found.byEntityKind,
        kind === undefined ? found.allNamed : (signatureKinds.get(kind) ?? -1),
      );
    },
    forEachAxiomEntity(visit) {
      const { entities, axiomEntityCount } = discoverSignature();
      for (let id = 0; id < axiomEntityCount; id++) {
        const entity = entities.valueAt(id);
        if (entity.kind !== OWLObjectKind.ANONYMOUS_INDIVIDUAL) visit(entity);
      }
    },
    entities(iriKey) {
      const found = discoverSignature();
      return postingValues(
        found.entities,
        found.byIRI,
        terms.idOfCapturedKey(iriKey),
      );
    },
    entitiesSet(iriKey) {
      const found = discoverSignature();
      return postingToSet(
        found.entities,
        found.byIRI,
        terms.idOfCapturedKey(iriKey),
      );
    },
    entitiesSetFor,
    forEachEntityFor,
  });
}

/** Return the cached derived read model for one immutable snapshot. */
export function readOntologyModel(snapshot) {
  let reader = readers.get(snapshot);
  if (reader) return reader;
  reader = createOntologyReadModel(snapshot);
  readers.set(snapshot, reader);
  return reader;
}
