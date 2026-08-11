import { AXIOM_KINDS, ENTITY_KINDS, OWLObjectKind } from "./kinds.js";
import {
  createOntologyID,
  isCanonicalStructuralObject,
  StructuralSet,
} from "./structural.js";

const requireKind = (value, kinds, name) => {
  if (!isCanonicalStructuralObject(value) || !kinds.includes(value.kind)) {
    throw new TypeError(`${name} has an invalid OWL structural kind`);
  }
  return value;
};

const structuralSetOfKinds = (values, kinds, name) => {
  if (!values || typeof values[Symbol.iterator] !== "function") {
    throw new TypeError(`${name} must be iterable`);
  }
  const result = new StructuralSet();
  for (const value of values) {
    result.add(requireKind(value, kinds, name));
  }
  return result;
};

const anonymousOntologyID = () => createOntologyID(undefined, undefined);

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
  // imports-closure, mutation, and manager-callback surface. owlapi-js v1 is an
  // immutable direct-ontology view with only the query methods implemented below;
  // callers cannot mutate axioms through this object or accidentally receive
  // imports-closure results. Expanding the surface requires an approved capability
  // change, indexes with explicit direct/closure semantics, and focused parity
  // tests. Verification: capability `ontology.direct-query-surface`.
  #annotations;
  #axioms;
  #axiomsByType = new Map();
  #importsDeclarations;
  #ontologyID;

  constructor({
    annotations = [],
    axioms = [],
    imports = [],
    ontologyID,
  } = {}) {
    this.#annotations = structuralSetOfKinds(
      annotations,
      [OWLObjectKind.ANNOTATION],
      "annotations",
    );
    this.#axioms = new StructuralSet();
    this.#importsDeclarations = structuralSetOfKinds(
      imports,
      [OWLObjectKind.IMPORTS_DECLARATION],
      "imports",
    );
    this.#ontologyID =
      ontologyID === undefined
        ? anonymousOntologyID()
        : requireKind(ontologyID, [OWLObjectKind.ONTOLOGY_ID], "ontologyID");

    for (const axiom of axioms) {
      requireKind(axiom, AXIOM_KINDS, "axioms");
      if (!this.#axioms.has(axiom)) {
        this.#axioms.add(axiom);
        if (!this.#axiomsByType.has(axiom.kind)) {
          this.#axiomsByType.set(axiom.kind, new StructuralSet());
        }
        this.#axiomsByType.get(axiom.kind).add(axiom);
      }
    }
    Object.freeze(this);
  }

  getOntologyID() {
    return this.#ontologyID;
  }

  getAxioms() {
    return this.#axioms.toSet();
  }

  getAxiomsByType(type) {
    return this.#axiomsByType.get(type)?.toSet() || new Set();
  }

  getImportsDeclarations() {
    return this.#importsDeclarations.toSet();
  }

  getAnnotations() {
    return this.#annotations.toSet();
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
    const entities = new StructuralSet();
    for (const values of [this.#axioms, this.#annotations]) {
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
    for (const axiom of this.#axioms) {
      if (references(axiom, key)) {
        result.add(axiom);
      }
    }
    return result.toSet();
  }
}
