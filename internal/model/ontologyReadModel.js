import { ENTITY_KINDS, OWLObjectKind } from "../../model/kinds.js";
import { structuralKey, StructuralSet } from "../../model/structural.js";
import { isLogicalAxiom } from "./axiomSemantics.js";
import { XSD_NAMESPACE } from "../rdfjs/vocabulary.js";

const empty = Object.freeze([]);
const readers = new WeakMap();
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

const append = (index, key, value) => {
  let values = index.get(key);
  if (!values) index.set(key, (values = []));
  values.push(value);
};
const freezeBuckets = (index) => {
  for (const values of index.values()) Object.freeze(values);
  return index;
};

/** Derived reads belong to one committed immutable snapshot. No caller/query
 * objects or import closures are retained. Misses never add cache entries; all
 * buckets are bounded by stored axioms, their positions and discovered entities.
 * Public façades still create defensive collections from these private arrays.
 */
export function readOntologyModel(snapshot) {
  let reader = readers.get(snapshot);
  if (reader) return reader;
  let kinds, logical, annotations, signature, referencing;
  const positions = new Map();
  const equivalences = new Map();

  function allAxioms() {
    return snapshot.directAxioms;
  }

  function axioms(kind) {
    if (!kinds) {
      const index = new Map();
      for (const axiom of snapshot.directAxioms)
        append(index, axiom.kind, axiom);
      kinds = freezeBuckets(index);
    }
    return kinds.get(kind) ?? empty;
  }

  function logicalAxioms() {
    if (!logical) {
      logical = Object.freeze(snapshot.directAxioms.filter(isLogicalAxiom));
    }
    return logical;
  }

  function referencingAxioms(targetKey) {
    if (!referencing) {
      const index = new Map();
      for (const axiom of snapshot.directAxioms) {
        const keys = new Set();
        visitStructuralValues(axiom, (value) => {
          if (referencingKinds.has(value.kind)) {
            keys.add(value.structuralKey());
          }
        });
        if (
          (axiom.kind === OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM ||
            axiom.kind === OWLObjectKind.ANNOTATION_ASSERTION_AXIOM) &&
          axiom.value?.kind === OWLObjectKind.LITERAL &&
          axiom.value.datatype.iri.value === `${XSD_NAMESPACE}anyURI`
        ) {
          keys.add(structuralKey(OWLObjectKind.IRI, [axiom.value.lexicalForm]));
        }
        for (const key of keys) {
          append(index, key, axiom);
        }
      }
      referencing = freezeBuckets(index);
    }
    return referencing.get(targetKey) ?? empty;
  }

  function discoverSignature() {
    if (signature) return signature;
    const unique = new StructuralSet();
    for (const roots of [
      snapshot.directAxioms,
      snapshot.directOntologyAnnotations,
    ]) {
      for (const root of roots)
        visitStructuralValues(root, (value) => {
          if (
            ENTITY_KINDS.includes(value.kind) ||
            value.kind === OWLObjectKind.ANONYMOUS_INDIVIDUAL
          )
            unique.add(value);
        });
    }
    const byKind = new Map(),
      byIRI = new Map(),
      named = [];
    for (const entity of unique) {
      append(byKind, entity.kind, entity);
      if (ENTITY_KINDS.includes(entity.kind)) {
        named.push(entity);
        append(byIRI, entity.iri.structuralKey(), entity);
      }
    }
    signature = {
      named: Object.freeze(named),
      byKind: freezeBuckets(byKind),
      byIRI: freezeBuckets(byIRI),
    };
    return signature;
  }

  reader = Object.freeze({
    allAxioms,
    axioms,
    logicalAxioms,
    referencingAxioms,
    position(kind, field, key) {
      let queries = positions.get(kind);
      if (!queries) positions.set(kind, (queries = new Map()));
      let index = queries.get(field);
      if (!index) {
        index = new Map();
        for (const axiom of axioms(kind)) {
          const keys = new Set();
          const value = axiom[field];
          for (const item of Array.isArray(value) ? value : [value]) {
            if (item) keys.add(item.structuralKey());
          }
          for (const key of keys) append(index, key, axiom);
        }
        queries.set(field, freezeBuckets(index));
      }
      return index.get(key) ?? empty;
    },
    equivalentAxioms(key, ignoreAnnotations = false) {
      let index = equivalences.get(ignoreAnnotations);
      if (!index) {
        const method = ignoreAnnotations
          ? "structuralKeyWithoutAnnotations"
          : "structuralKey";
        index = new Map();
        for (const axiom of snapshot.directAxioms)
          append(index, axiom[method](), axiom);
        equivalences.set(ignoreAnnotations, freezeBuckets(index));
      }
      return index.get(key) ?? empty;
    },
    annotationAssertions(subjectKey, propertyKey) {
      if (!annotations) {
        const index = new Map();
        for (const axiom of axioms(OWLObjectKind.ANNOTATION_ASSERTION_AXIOM)) {
          const key = axiom.subject.structuralKey();
          let entry = index.get(key);
          if (!entry)
            index.set(key, (entry = { all: [], properties: new Map() }));
          entry.all.push(axiom);
          append(entry.properties, axiom.property.structuralKey(), axiom);
        }
        for (const entry of index.values()) {
          Object.freeze(entry.all);
          freezeBuckets(entry.properties);
        }
        annotations = index;
      }
      const entry = annotations.get(subjectKey);
      return (
        (propertyKey === undefined
          ? entry?.all
          : entry?.properties.get(propertyKey)) ?? empty
      );
    },
    signature(kind) {
      const found = discoverSignature();
      return kind === undefined
        ? found.named
        : (found.byKind.get(kind) ?? empty);
    },
    entities(iriKey) {
      return discoverSignature().byIRI.get(iriKey) ?? empty;
    },
  });
  readers.set(snapshot, reader);
  return reader;
}
