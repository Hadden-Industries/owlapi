import { AXIOM_KINDS, ENTITY_KINDS, OWLObjectKind } from "../../model/kinds.js";
import { structuralKey, StructuralSet } from "../../model/structural.js";
import { StructuralHashTable } from "../collections/structuralHashTable.js";
import { buildCsrPostingIndex } from "../collections/csrPostingIndex.js";
import { indexAxiomBodies } from "../collections/axiomBodyIndex.js";
import { capturedKeysEqual } from "../collections/structuralComparator.js";
import { captureStructuralKey } from "../collections/structuralProjection.js";
import { readSnapshotAxioms } from "./ontologyState.js";
import { collectPostings, postingValues } from "./structuralPostings.js";
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
      for (const child of value) pending.push(child);
      continue;
    }
    for (const field of Object.keys(value)) {
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
export function readOntologyModel(snapshot) {
  let reader = readers.get(snapshot);
  if (reader) return reader;
  const stored = readSnapshotAxioms(snapshot);
  const terms = new StructuralHashTable();
  let kinds, logical, annotations, signature, referencing, axiomBodies;
  const positions = new Map();
  const annotationViews = new Map();

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
  function logicalAxioms() {
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
    return postingValues(stored, logical, 0);
  }
  function referencingAxioms(key) {
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
    return postingValues(stored, referencing, terms.idOfCapturedKey(key));
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
  function position(kind, field, key) {
    let fields = positions.get(kind);
    if (!fields) positions.set(kind, (fields = new Map()));
    let postings = fields.get(field);
    if (!postings) {
      postings = collectPostings(terms, (emit) =>
        visitKind(kind, (axiom, id) => {
          const operand = axiom[field];
          if (Array.isArray(operand)) {
            for (const item of operand) if (item) emit(item, id);
          } else if (operand) emit(operand, id);
        }),
      );
      fields.set(field, postings);
    }
    return postingValues(stored, postings, terms.idOfCapturedKey(key));
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
      id = stored.idOfCapturedKey(key);
    }
    return id < 0 ? empty : Object.freeze([stored.valueAt(id)]);
  }
  function annotationAssertions(subjectKey, propertyKey) {
    annotations ??= collectPostings(terms, (emit) =>
      visitKind(OWLObjectKind.ANNOTATION_ASSERTION_AXIOM, (axiom, id) =>
        emit(axiom.subject, id),
      ),
    );
    const values = postingValues(
      stored,
      annotations,
      terms.idOfCapturedKey(subjectKey),
    );
    if (propertyKey === undefined) return values;
    return Array.from(values).filter((axiom) =>
      capturedKeysEqual(captureStructuralKey(axiom.property), propertyKey),
    );
  }
  function discoverSignature() {
    if (signature) return signature;
    const entities = new StructuralHashTable();
    for (const roots of [stored, snapshot.directOntologyAnnotations]) {
      for (const root of roots)
        visitStructuralValues(root, (value) => {
          if (signatureKinds.has(value.kind)) entities.add(value);
        });
    }
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
    signature = { entities, byEntityKind, allNamed, byIRI };
    return signature;
  }
  reader = Object.freeze({
    allAxioms: () => stored,
    axioms,
    logicalAxioms,
    referencingAxioms,
    position,
    equivalentAxioms,
    annotationAssertions,
    annotationValues(subjectKey, includeAssertionAnnotations) {
      const assertions = annotationAssertions(subjectKey);
      if (!assertions.length) return empty;
      const id = terms.idOfCapturedKey(subjectKey);
      let views = annotationViews.get(includeAssertionAnnotations);
      if (!views)
        annotationViews.set(includeAssertionAnnotations, (views = new Map()));
      let values = views.get(id);
      if (!values) {
        const unique = new StructuralSet();
        for (const axiom of assertions) {
          unique.add(
            annotationFactory.getOWLAnnotation(axiom.property, axiom.value),
          );
          if (includeAssertionAnnotations)
            for (const annotation of axiom.annotations) unique.add(annotation);
        }
        values = Object.freeze([...unique]);
        views.set(id, values);
      }
      return values;
    },
    signature(kind) {
      const found = discoverSignature();
      return postingValues(
        found.entities,
        found.byEntityKind,
        kind === undefined ? found.allNamed : (signatureKinds.get(kind) ?? -1),
      );
    },
    entities(iriKey) {
      const found = discoverSignature();
      return postingValues(
        found.entities,
        found.byIRI,
        terms.idOfCapturedKey(iriKey),
      );
    },
  });
  readers.set(snapshot, reader);
  return reader;
}
