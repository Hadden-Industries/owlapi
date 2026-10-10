import { OntologyState } from "../internal/model/ontologyState.js";
import { XSD_NAMESPACE } from "../internal/rdfjs/vocabulary.js";
import {
  AXIOM_KINDS,
  CLASS_EXPRESSION_KINDS,
  ENTITY_KINDS,
  INDIVIDUAL_KINDS,
  OBJECT_PROPERTY_EXPRESSION_KINDS,
  OWLObjectKind,
} from "./kinds.js";
import { isCanonicalStructuralObject, StructuralSet } from "./structural.js";
import {
  isLogicalAxiom,
  requireAxiom,
} from "../internal/model/axiomSemantics.js";
import { AxiomAnnotations, Imports } from "./parameters/index.js";
import { readLoadedImportsClosure } from "../internal/model/sourceEvidence.js";

const managerOwnedOntologyStatesByInitializer = new WeakMap();
const ontologySnapshotReaders = new WeakMap();

export const readOntologySnapshot = (ontology) => {
  const read = ontologySnapshotReaders.get(ontology);
  if (!read) throw new TypeError("ontology must be a package OWLOntology");
  return read();
};

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

const visitStructuralValues = (root, visitor) => {
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

const references = (container, targetKey) => {
  let found = false;
  visitStructuralValues(container, (value) => {
    if (
      typeof value.structuralKey === "function" &&
      value.structuralKey() === targetKey
    ) {
      found = true;
      return true;
    }
  });
  return found;
};

export class OWLOntology {
  // Query results are fresh structural sets over a committed revision. Named
  // position getters are direct-only; explicit Imports arguments select the
  // manager's current loaded closure without acquiring missing documents.
  // State replacement belongs to the manager, so earlier returned collections
  // remain snapshots after edits. Generic Java reflection/visitor queries are
  // outside the selected surface.
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
    ontologySnapshotReaders.set(this, this.#readStateSnapshot);
    Object.freeze(this);
  }

  getOntologyID() {
    return this.#readStateSnapshot().ontologyID;
  }

  /** Defensive structural set in direct or explicitly selected loaded scope. */
  getAxioms(imports = Imports.EXCLUDED) {
    // Committed direct storage is already structurally unique. Cross-ontology
    // aggregation still needs structural deduplication across object identities.
    if (imports === Imports.EXCLUDED)
      return new Set(this.#readStateSnapshot().directAxioms);
    const axioms = new StructuralSet();
    for (const ontology of this.#scope(imports)) {
      for (const axiom of readOntologySnapshot(ontology).directAxioms)
        axioms.add(axiom);
    }
    return axioms.toSet();
  }

  getAxiomsByType(type, imports = Imports.EXCLUDED) {
    if (imports === Imports.EXCLUDED)
      return new Set(
        this.#readStateSnapshot().directAxioms.filter(
          (axiom) => axiom.kind === type,
        ),
      );
    const axioms = new StructuralSet();
    for (const ontology of this.#scope(imports))
      for (const axiom of readOntologySnapshot(ontology).directAxioms)
        if (axiom.kind === type) axioms.add(axiom);
    return axioms.toSet();
  }

  #scope(imports) {
    if (imports === Imports.EXCLUDED) return [this];
    if (imports !== Imports.INCLUDED)
      throw new TypeError("imports must be an Imports value");
    return readLoadedImportsClosure(this);
  }

  /** Count actual stored annotated variants; Java AxiomType adapts to kind. */
  getAxiomCount(typeOrImports = Imports.EXCLUDED, imports = Imports.EXCLUDED) {
    if (
      !Object.values(Imports).includes(typeOrImports) &&
      !AXIOM_KINDS.includes(typeOrImports)
    )
      throw new TypeError("type must be an axiom kind or Imports value");
    if (typeOrImports === Imports.EXCLUDED)
      return this.#readStateSnapshot().directAxioms.length;
    const scope = typeOrImports === Imports.INCLUDED ? typeOrImports : imports;
    return this.#scope(scope).reduce(
      (count, ontology) =>
        count +
        readOntologySnapshot(ontology).directAxioms.filter(
          (axiom) =>
            typeOrImports === Imports.INCLUDED || axiom.kind === typeOrImports,
        ).length,
      0,
    );
  }

  getLogicalAxioms(imports = Imports.EXCLUDED) {
    return new Set([...this.getAxioms(imports)].filter(isLogicalAxiom));
  }

  getLogicalAxiomCount(imports = Imports.EXCLUDED) {
    return this.#scope(imports).reduce(
      (count, ontology) =>
        count +
        readOntologySnapshot(ontology).directAxioms.filter(isLogicalAxiom)
          .length,
      0,
    );
  }

  containsAxiom(
    axiom,
    imports = Imports.EXCLUDED,
    mode = AxiomAnnotations.CONSIDER_AXIOM_ANNOTATIONS,
  ) {
    requireAxiom(axiom);
    if (!Object.values(AxiomAnnotations).includes(mode))
      throw new TypeError("annotation mode must be an AxiomAnnotations value");
    const key =
      mode === AxiomAnnotations.IGNORE_AXIOM_ANNOTATIONS
        ? "structuralKeyWithoutAnnotations"
        : "structuralKey";
    return [...this.getAxioms(imports)].some(
      (stored) => stored[key]() === axiom[key](),
    );
  }

  containsAxiomIgnoreAnnotations(axiom, imports = Imports.EXCLUDED) {
    return this.containsAxiom(
      axiom,
      imports,
      AxiomAnnotations.IGNORE_AXIOM_ANNOTATIONS,
    );
  }

  getAxiomsIgnoreAnnotations(axiom, imports = Imports.EXCLUDED) {
    requireAxiom(axiom);
    return new Set(
      [...this.getAxioms(imports)].filter((stored) =>
        stored.equalsIgnoreAnnotations(axiom),
      ),
    );
  }

  #position(kind, fields, target, kinds) {
    requireKind(target, kinds, "query target");
    return new Set(
      [...this.getAxiomsByType(kind)].filter((axiom) =>
        fields.some((field) => {
          const values = Array.isArray(axiom[field])
            ? axiom[field]
            : [axiom[field]];
          return values.some((value) => value?.equals(target));
        }),
      ),
    );
  }

  /** Java OWLAxiomIndex direct declaration lookup, preserving entity kind. */
  getDeclarationAxioms(entity) {
    return this.#position(
      OWLObjectKind.DECLARATION_AXIOM,
      ["entity"],
      entity,
      ENTITY_KINDS,
    );
  }

  /** Match the complete indexed expression, never a nested occurrence. */
  getSubClassAxiomsForSubClass(owlClass) {
    return this.#position(
      OWLObjectKind.SUBCLASS_OF_AXIOM,
      ["subClass"],
      owlClass,
      [OWLObjectKind.CLASS],
    );
  }

  getSubClassAxiomsForSuperClass(owlClass) {
    return this.#position(
      OWLObjectKind.SUBCLASS_OF_AXIOM,
      ["superClass"],
      owlClass,
      [OWLObjectKind.CLASS],
    );
  }

  getEquivalentClassesAxioms(owlClass) {
    return this.#position(
      OWLObjectKind.EQUIVALENT_CLASSES_AXIOM,
      ["classExpressions"],
      owlClass,
      [OWLObjectKind.CLASS],
    );
  }

  getDisjointClassesAxioms(owlClass) {
    return this.#position(
      OWLObjectKind.DISJOINT_CLASSES_AXIOM,
      ["classExpressions"],
      owlClass,
      [OWLObjectKind.CLASS],
    );
  }

  getObjectSubPropertyAxiomsForSubProperty(property) {
    return this.#position(
      OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM,
      ["subProperty"],
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getObjectSubPropertyAxiomsForSuperProperty(property) {
    return this.#position(
      OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM,
      ["superProperty"],
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getObjectPropertyDomainAxioms(property) {
    return this.#position(
      OWLObjectKind.OBJECT_PROPERTY_DOMAIN_AXIOM,
      ["property"],
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getObjectPropertyRangeAxioms(property) {
    return this.#position(
      OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM,
      ["property"],
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getInverseObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.INVERSE_OBJECT_PROPERTIES_AXIOM,
      ["properties"],
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getDataSubPropertyAxiomsForSubProperty(property) {
    return this.#position(
      OWLObjectKind.SUB_DATA_PROPERTY_AXIOM,
      ["subProperty"],
      property,
      [OWLObjectKind.DATA_PROPERTY],
    );
  }

  getDataSubPropertyAxiomsForSuperProperty(property) {
    return this.#position(
      OWLObjectKind.SUB_DATA_PROPERTY_AXIOM,
      ["superProperty"],
      property,
      [OWLObjectKind.DATA_PROPERTY],
    );
  }

  getDataPropertyDomainAxioms(property) {
    return this.#position(
      OWLObjectKind.DATA_PROPERTY_DOMAIN_AXIOM,
      ["property"],
      property,
      [OWLObjectKind.DATA_PROPERTY],
    );
  }

  getDataPropertyRangeAxioms(property) {
    return this.#position(
      OWLObjectKind.DATA_PROPERTY_RANGE_AXIOM,
      ["property"],
      property,
      [OWLObjectKind.DATA_PROPERTY],
    );
  }

  getSubAnnotationPropertyOfAxioms(property) {
    return this.#position(
      OWLObjectKind.SUB_ANNOTATION_PROPERTY_AXIOM,
      ["subProperty"],
      property,
      [OWLObjectKind.ANNOTATION_PROPERTY],
    );
  }

  getAnnotationPropertyDomainAxioms(property) {
    return this.#position(
      OWLObjectKind.ANNOTATION_PROPERTY_DOMAIN_AXIOM,
      ["property"],
      property,
      [OWLObjectKind.ANNOTATION_PROPERTY],
    );
  }

  getAnnotationPropertyRangeAxioms(property) {
    return this.#position(
      OWLObjectKind.ANNOTATION_PROPERTY_RANGE_AXIOM,
      ["property"],
      property,
      [OWLObjectKind.ANNOTATION_PROPERTY],
    );
  }

  getFunctionalObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
      ["property"],
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getInverseFunctionalObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
      ["property"],
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getSymmetricObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.SYMMETRIC_OBJECT_PROPERTY_AXIOM,
      ["property"],
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getAsymmetricObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.ASYMMETRIC_OBJECT_PROPERTY_AXIOM,
      ["property"],
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getReflexiveObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.REFLEXIVE_OBJECT_PROPERTY_AXIOM,
      ["property"],
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getIrreflexiveObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM,
      ["property"],
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getTransitiveObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.TRANSITIVE_OBJECT_PROPERTY_AXIOM,
      ["property"],
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getFunctionalDataPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.FUNCTIONAL_DATA_PROPERTY_AXIOM,
      ["property"],
      property,
      [OWLObjectKind.DATA_PROPERTY],
    );
  }

  getClassAssertionAxioms(value) {
    const field = INDIVIDUAL_KINDS.includes(value?.kind)
      ? "individual"
      : "classExpression";
    return this.#position(OWLObjectKind.CLASS_ASSERTION_AXIOM, [field], value, [
      ...INDIVIDUAL_KINDS,
      ...CLASS_EXPRESSION_KINDS,
    ]);
  }

  getObjectPropertyAssertionAxioms(individual) {
    return this.#position(
      OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM,
      ["subject"],
      individual,
      INDIVIDUAL_KINDS,
    );
  }

  getDataPropertyAssertionAxioms(individual) {
    return this.#position(
      OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM,
      ["subject"],
      individual,
      INDIVIDUAL_KINDS,
    );
  }

  getNegativeObjectPropertyAssertionAxioms(individual) {
    return this.#position(
      OWLObjectKind.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM,
      ["subject"],
      individual,
      INDIVIDUAL_KINDS,
    );
  }

  getNegativeDataPropertyAssertionAxioms(individual) {
    return this.#position(
      OWLObjectKind.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM,
      ["subject"],
      individual,
      INDIVIDUAL_KINDS,
    );
  }

  getSameIndividualAxioms(individual) {
    return this.#position(
      OWLObjectKind.SAME_INDIVIDUAL_AXIOM,
      ["individuals"],
      individual,
      INDIVIDUAL_KINDS,
    );
  }

  getDifferentIndividualAxioms(individual) {
    return this.#position(
      OWLObjectKind.DIFFERENT_INDIVIDUALS_AXIOM,
      ["individuals"],
      individual,
      INDIVIDUAL_KINDS,
    );
  }

  getAnnotationAssertionAxioms(subject, imports = Imports.EXCLUDED) {
    requireKind(
      subject,
      [OWLObjectKind.IRI, OWLObjectKind.ANONYMOUS_INDIVIDUAL],
      "subject",
    );
    return new Set(
      [
        ...this.getAxiomsByType(
          OWLObjectKind.ANNOTATION_ASSERTION_AXIOM,
          imports,
        ),
      ].filter((axiom) => axiom.subject.equals(subject)),
    );
  }

  getImportsDeclarations() {
    return new Set(this.#readStateSnapshot().authoredImportDeclarations);
  }

  getAnnotations() {
    return new Set(this.#readStateSnapshot().directOntologyAnnotations);
  }

  getClassesInSignature(imports = Imports.EXCLUDED) {
    return this.#getSignatureByKind(OWLObjectKind.CLASS, imports);
  }

  getObjectPropertiesInSignature(imports = Imports.EXCLUDED) {
    return this.#getSignatureByKind(OWLObjectKind.OBJECT_PROPERTY, imports);
  }

  getDataPropertiesInSignature(imports = Imports.EXCLUDED) {
    return this.#getSignatureByKind(OWLObjectKind.DATA_PROPERTY, imports);
  }

  getAnnotationPropertiesInSignature(imports = Imports.EXCLUDED) {
    return this.#getSignatureByKind(OWLObjectKind.ANNOTATION_PROPERTY, imports);
  }

  getIndividualsInSignature(imports = Imports.EXCLUDED) {
    return this.#getSignatureByKind(OWLObjectKind.NAMED_INDIVIDUAL, imports);
  }

  getDatatypesInSignature(imports = Imports.EXCLUDED) {
    return this.#getSignatureByKind(OWLObjectKind.DATATYPE, imports);
  }

  #getSignatureByKind(kind, imports = Imports.EXCLUDED) {
    return this.#signatureMatching((value) => value.kind === kind, imports);
  }

  #signatureMatching(matches, imports) {
    const entities = new StructuralSet();
    for (const ontology of this.#scope(imports)) {
      const snapshot = readOntologySnapshot(ontology);
      for (const values of [
        snapshot.directAxioms,
        snapshot.directOntologyAnnotations,
      ]) {
        for (const value of values) {
          visitStructuralValues(value, (nestedValue) => {
            if (matches(nestedValue)) {
              entities.add(nestedValue);
            }
          });
        }
      }
    }
    return entities.toSet();
  }

  /** All named kinds in the selected current loaded scope, without declarations inferred. */
  getSignature(imports = Imports.EXCLUDED) {
    return this.#signatureMatching(
      (value) => ENTITY_KINDS.includes(value.kind),
      imports,
    );
  }

  getEntitiesInSignature(iri, imports = Imports.EXCLUDED) {
    requireKind(iri, [OWLObjectKind.IRI], "iri");
    return new Set(
      [...this.getSignature(imports)].filter((entity) =>
        entity.iri.equals(iri),
      ),
    );
  }

  containsEntityInSignature(entityOrIRI, imports = Imports.EXCLUDED) {
    requireKind(
      entityOrIRI,
      [...ENTITY_KINDS, OWLObjectKind.IRI],
      "entityOrIRI",
    );
    return entityOrIRI.kind === OWLObjectKind.IRI
      ? this.getEntitiesInSignature(entityOrIRI, imports).size > 0
      : [...this.getSignature(imports)].some((entity) =>
          entity.equals(entityOrIRI),
        );
  }

  getPunnedIRIs(imports = Imports.EXCLUDED) {
    const kindsByIRI = new Map();
    const result = new StructuralSet();
    for (const entity of this.getSignature(imports)) {
      const previous = kindsByIRI.get(entity.iri.value);
      if (previous !== undefined && previous !== entity.kind)
        result.add(entity.iri);
      kindsByIRI.set(entity.iri.value, entity.kind);
    }
    return result.toSet();
  }

  getReferencedAnonymousIndividuals(imports = Imports.EXCLUDED) {
    return this.#getSignatureByKind(
      OWLObjectKind.ANONYMOUS_INDIVIDUAL,
      imports,
    );
  }

  getReferencingAxioms(entity, imports = Imports.EXCLUDED) {
    requireKind(
      entity,
      [
        ...ENTITY_KINDS,
        OWLObjectKind.IRI,
        OWLObjectKind.LITERAL,
        OWLObjectKind.ANONYMOUS_INDIVIDUAL,
      ],
      "entity",
    );
    const result = new StructuralSet();
    const key = entity.structuralKey();
    for (const ontology of this.#scope(imports))
      for (const axiom of readOntologySnapshot(ontology).directAxioms)
        if (
          references(axiom, key) ||
          (entity.kind === OWLObjectKind.IRI &&
            [
              OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM,
              OWLObjectKind.ANNOTATION_ASSERTION_AXIOM,
            ].includes(axiom.kind) &&
            axiom.value?.kind === OWLObjectKind.LITERAL &&
            axiom.value.datatype.iri.value === `${XSD_NAMESPACE}anyURI` &&
            axiom.value.lexicalForm === entity.value)
        )
          result.add(axiom);
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
