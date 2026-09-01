import { OntologyState } from "../internal/model/ontologyState.js";
import { ENTITY_KINDS, OWLObjectKind } from "./kinds.js";
import { isCanonicalStructuralObject, StructuralSet } from "./structural.js";

const managerOwnedOntologyStatesByInitializer = new WeakMap();

const requireKind = (value, kinds, name) => {
  if (!isCanonicalStructuralObject(value) || !kinds.includes(value.kind)) {
    throw new TypeError(`${name} has an invalid OWL structural kind`);
  }
  return value;
};

const createOntologyState = ({
  annotations = [],
  axioms = [],
  documentMetadata,
  imports = [],
  ontologyID,
} = {}) =>
  new OntologyState({
    authoredImportDeclarations: imports,
    directAxioms: axioms,
    directOntologyAnnotations: annotations,
    documentMetadata,
    ontologyID,
  });

const visitStructuralValues = (value, visitor, visited = new Set()) => {
  if (!value || typeof value !== "object" || visited.has(value)) {
    return;
  }
  visited.add(value);
  visitor(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      visitStructuralValues(item, visitor, visited);
    }
    return;
  }

  for (const field of Object.keys(value)) {
    if (field !== "kind") {
      visitStructuralValues(value[field], visitor, visited);
    }
  }
};

const references = (container, targetKey) => {
  let found = false;
  visitStructuralValues(container, (value) => {
    if (
      typeof value.structuralKey === "function" &&
      value.structuralKey() === targetKey
    ) {
      found = true;
    }
  });
  return found;
};

export class OWLOntology {
  // UNSUPPORTED(OWLAPI parity): Java OWLOntology exposes a much broader query,
  // imports-closure, mutation, and manager-callback surface. The initial 0.1
  // package is a read-only direct-ontology façade with only the query methods
  // below; all state replacement is owned by the ontology's manager. Expanding
  // the surface requires an approved capability change, indexes with explicit
  // direct/closure semantics, and focused parity tests. Verification:
  // capability `ontology.direct-query-surface`.
  #readStateSnapshot;

  constructor(initialState = {}) {
    const managerOwnedOntologyState =
      initialState !== null &&
      (typeof initialState === "object" || typeof initialState === "function")
        ? managerOwnedOntologyStatesByInitializer.get(initialState)
        : undefined;
    const ontologyState =
      managerOwnedOntologyState ?? createOntologyState(initialState);
    this.#readStateSnapshot = () => ontologyState.createSnapshot();
    Object.freeze(this);
  }

  getOntologyID() {
    return this.#readStateSnapshot().ontologyID;
  }

  getAxioms() {
    return new Set(this.#readStateSnapshot().directAxioms);
  }

  getAxiomsByType(type) {
    return new Set(
      this.#readStateSnapshot().directAxioms.filter(
        (axiom) => axiom.kind === type,
      ),
    );
  }

  getImportsDeclarations() {
    return new Set(this.#readStateSnapshot().authoredImportDeclarations);
  }

  getAnnotations() {
    return new Set(this.#readStateSnapshot().directOntologyAnnotations);
  }

  getClassesInSignature() {
    return this.#getSignatureByKind(OWLObjectKind.CLASS);
  }

  getObjectPropertiesInSignature() {
    return this.#getSignatureByKind(OWLObjectKind.OBJECT_PROPERTY);
  }

  getDataPropertiesInSignature() {
    return this.#getSignatureByKind(OWLObjectKind.DATA_PROPERTY);
  }

  getAnnotationPropertiesInSignature() {
    return this.#getSignatureByKind(OWLObjectKind.ANNOTATION_PROPERTY);
  }

  getIndividualsInSignature() {
    return this.#getSignatureByKind(OWLObjectKind.NAMED_INDIVIDUAL);
  }

  getDatatypesInSignature() {
    return this.#getSignatureByKind(OWLObjectKind.DATATYPE);
  }

  #getSignatureByKind(kind) {
    const snapshot = this.#readStateSnapshot();
    const entities = new StructuralSet();
    for (const values of [
      snapshot.directAxioms,
      snapshot.directOntologyAnnotations,
    ]) {
      for (const value of values) {
        visitStructuralValues(value, (nestedValue) => {
          if (nestedValue.kind === kind) {
            entities.add(nestedValue);
          }
        });
      }
    }
    return entities.toSet();
  }

  getReferencingAxioms(entity) {
    requireKind(entity, ENTITY_KINDS, "entity");
    const result = new StructuralSet();
    const key = entity.structuralKey();
    for (const axiom of this.#readStateSnapshot().directAxioms) {
      if (references(axiom, key)) {
        result.add(axiom);
      }
    }
    return result.toSet();
  }
}

export const createManagerOwnedOWLOntology = (initialState = {}) => {
  const ontologyState = createOntologyState(initialState);
  const managerOwnedOntologyInitializer = Object.freeze({});
  managerOwnedOntologyStatesByInitializer.set(
    managerOwnedOntologyInitializer,
    ontologyState,
  );
  let ontology;
  try {
    ontology = new OWLOntology(managerOwnedOntologyInitializer);
  } finally {
    managerOwnedOntologyStatesByInitializer.delete(
      managerOwnedOntologyInitializer,
    );
  }
  return Object.freeze({ ontology, ontologyState });
};
