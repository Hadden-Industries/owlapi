import {
  OntologyState,
  readSnapshotAxioms,
} from "../internal/model/ontologyState.js";
import { captureStructuralKey } from "../internal/collections/structuralProjection.js";
import {
  AXIOM_KINDS,
  CLASS_EXPRESSION_KINDS,
  ENTITY_KINDS,
  INDIVIDUAL_KINDS,
  OBJECT_PROPERTY_EXPRESSION_KINDS,
  OWLObjectKind,
} from "./kinds.js";
import { isCanonicalStructuralObject, StructuralSet } from "./structural.js";
import { requireAxiom } from "../internal/model/axiomSemantics.js";
import { AxiomAnnotations, Imports } from "./parameters/index.js";
import { readOntologyModel } from "../internal/model/ontologyReadModel.js";

const managerOwnedOntologyStatesByInitializer = new WeakMap();
const ontologySnapshotReaders = new WeakMap();
const managers = new WeakMap();
const closureReaders = new WeakMap();

const createClosureReader = (snapshots) => {
  const models = snapshots.map(readOntologyModel);
  let all, logical;
  const byKind = new Map();
  const sigByKind = new Map();
  return Object.freeze({
    allAxioms() {
      if (!all) {
        const set = new StructuralSet();
        for (const s of snapshots)
          for (const ax of readSnapshotAxioms(s)) set.add(ax);
        all = Object.freeze([...set]);
      }
      return all;
    },
    allAxiomsSet() {
      return new Set(this.allAxioms());
    },
    logicalAxioms() {
      if (!logical) {
        const set = new StructuralSet();
        for (const m of models) for (const ax of m.logicalAxioms()) set.add(ax);
        logical = Object.freeze([...set]);
      }
      return logical;
    },
    logicalAxiomsSet() {
      return new Set(this.logicalAxioms());
    },
    axioms(type) {
      let bucket = byKind.get(type);
      if (!bucket) {
        const set = new StructuralSet();
        for (const m of models) for (const ax of m.axioms(type)) set.add(ax);
        bucket = Object.freeze([...set]);
        byKind.set(type, bucket);
      }
      return bucket;
    },
    axiomsSet(type) {
      return new Set(this.axioms(type));
    },
    signature(kind) {
      let bucket = sigByKind.get(kind);
      if (!bucket) {
        const set = new StructuralSet();
        for (const m of models) for (const e of m.signature(kind)) set.add(e);
        bucket = Object.freeze([...set]);
        sigByKind.set(kind, bucket);
      }
      return bucket;
    },
    signatureSet(kind) {
      return new Set(this.signature(kind));
    },
  });
};

export const isPackageOntology = (ontology) =>
  ontologySnapshotReaders.has(ontology);

export const readOntologySnapshot = (ontology) => {
  const read = ontologySnapshotReaders.get(ontology);
  if (!read) throw new TypeError("ontology must be a package OWLOntology");
  return read();
};

// Loaded membership and package identity share one authority. Source evidence
// consumes snapshots without making the ontology depend on source evidence.
export const bindManagedOntology = (
  ontology,
  readClosure,
  hasResolvedImport,
  owner,
  behaviorProfileDefinition,
) =>
  managers.set(
    ontology,
    Object.freeze({
      readClosure,
      hasResolvedImport,
      owner,
      behaviorProfileDefinition,
    }),
  );

/** Internal ownership read; copying structural values never changes this binding. */
export const readOntologyOwner = (ontology) => managers.get(ontology)?.owner;
export const readOntologyBehaviorDefinition = (ontology) =>
  managers.get(ontology)?.behaviorProfileDefinition;

/** Read loaded membership only; completeness remains the caller's policy. */
export const readLoadedImportsClosure = (ontology) => {
  readOntologySnapshot(ontology);
  return managers.get(ontology)?.readClosure() ?? [ontology];
};

export const readProfileClosure = (ontology) => {
  const snapshot = readOntologySnapshot(ontology);
  const manager = managers.get(ontology);
  if (!manager)
    return {
      ontologies: [ontology],
      complete: snapshot.authoredImportDeclarations.length === 0,
    };
  const ontologies = readLoadedImportsClosure(ontology);
  const complete = ontologies.every((member) =>
    readOntologySnapshot(member).authoredImportDeclarations.every(
      (declaration) => manager.hasResolvedImport(member, declaration.iri),
    ),
  );
  return { ontologies, complete };
};

const requireSingleKind = (value, expectedKind, name) => {
  if (!isCanonicalStructuralObject(value) || value.kind !== expectedKind) {
    throw new TypeError(`${name} has an invalid OWL structural kind`);
  }
  return value;
};

const KIND_SETS = new WeakMap();
const requireKind = (value, kinds, name) => {
  if (!isCanonicalStructuralObject(value)) {
    throw new TypeError(`${name} has an invalid OWL structural kind`);
  }
  let set = KIND_SETS.get(kinds);
  if (!set) {
    set = new Set(kinds);
    KIND_SETS.set(kinds, set);
  }
  if (!set.has(value.kind)) {
    throw new TypeError(`${name} has an invalid OWL structural kind`);
  }
  return value;
};

const INDIVIDUAL_KIND_SET = new Set(INDIVIDUAL_KINDS);
const CLASS_AND_INDIVIDUAL_KINDS = Object.freeze([
  ...INDIVIDUAL_KINDS,
  ...CLASS_EXPRESSION_KINDS,
]);
const ANNOTATION_SUBJECT_KINDS = Object.freeze([
  OWLObjectKind.IRI,
  OWLObjectKind.ANONYMOUS_INDIVIDUAL,
]);
const ENTITY_OR_IRI_KINDS = Object.freeze([...ENTITY_KINDS, OWLObjectKind.IRI]);
const REFERENCING_ENTITY_KINDS = Object.freeze([
  ...ENTITY_KINDS,
  OWLObjectKind.IRI,
  OWLObjectKind.LITERAL,
  OWLObjectKind.ANONYMOUS_INDIVIDUAL,
]);

const collectMultiOntologySet = (scope, visitMember) => {
  let plain = null;
  let structural = null;
  let sourceCount = 0;
  for (let i = 0; i < scope.length; i += 1) {
    let seenInThis = false;
    visitMember(readOntologyModel(readOntologySnapshot(scope[i])), (value) => {
      if (structural) {
        structural.add(value);
        return;
      }
      if (!seenInThis) {
        seenInThis = true;
        sourceCount += 1;
        if (sourceCount === 1) {
          plain = new Set();
        } else {
          // Each snapshot index is already structurally unique; only allocate
          // a StructuralSet when a second ontology also contributes items.
          structural = new StructuralSet();
          for (const prev of plain) structural.add(prev);
          plain = null;
          structural.add(value);
          return;
        }
      }
      plain.add(value);
    });
  }
  if (structural) return structural.toSet();
  return plain ?? new Set();
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

  #reader(imports = Imports.EXCLUDED) {
    if (imports === Imports.EXCLUDED)
      return readOntologyModel(this.#readStateSnapshot());
    const scope = this.#scope(imports);
    if (scope.length === 1)
      return readOntologyModel(readOntologySnapshot(scope[0]));
    const snapshots = scope.map(readOntologySnapshot);
    const cached = closureReaders.get(this);
    if (
      cached &&
      cached.snapshots.length === snapshots.length &&
      cached.snapshots.every((s, i) => s === snapshots[i])
    ) {
      return cached.reader;
    }
    const reader = createClosureReader(snapshots);
    closureReaders.set(this, { snapshots, reader });
    return reader;
  }

  /** Defensive structural set in direct or explicitly selected loaded scope. */
  getAxioms(imports = Imports.EXCLUDED) {
    // Committed direct storage is already structurally unique. Cross-ontology
    // aggregation still needs structural deduplication across object identities.
    return this.#reader(imports).allAxiomsSet();
  }

  getAxiomsByType(type, imports = Imports.EXCLUDED) {
    return this.#reader(imports).axiomsSet(type);
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
      return readSnapshotAxioms(this.#readStateSnapshot()).length;
    if (typeOrImports === Imports.INCLUDED)
      return this.#scope(Imports.INCLUDED).reduce(
        (count, ontology) =>
          count + readSnapshotAxioms(readOntologySnapshot(ontology)).length,
        0,
      );
    return this.#scope(imports).reduce(
      (count, ontology) =>
        count +
        readOntologyModel(readOntologySnapshot(ontology)).axioms(typeOrImports)
          .length,
      0,
    );
  }

  getLogicalAxioms(imports = Imports.EXCLUDED) {
    return this.#reader(imports).logicalAxiomsSet();
  }

  getLogicalAxiomCount(imports = Imports.EXCLUDED) {
    return this.#scope(imports).reduce(
      (count, ontology) =>
        count +
        readOntologyModel(readOntologySnapshot(ontology)).logicalAxioms()
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
    const target = captureStructuralKey(
      axiom,
      mode === AxiomAnnotations.IGNORE_AXIOM_ANNOTATIONS,
    );
    return this.#scope(imports).some(
      (ontology) =>
        readOntologyModel(readOntologySnapshot(ontology)).equivalentAxioms(
          target,
          mode === AxiomAnnotations.IGNORE_AXIOM_ANNOTATIONS,
        ).length > 0,
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
    const result = new StructuralSet();
    const key = captureStructuralKey(axiom, true);
    for (const ontology of this.#scope(imports))
      for (const stored of readOntologyModel(
        readOntologySnapshot(ontology),
      ).equivalentAxioms(key, true))
        result.add(stored);
    return result.toSet();
  }

  #position(kind, field, target, kinds) {
    requireKind(target, kinds, "query target");
    return readOntologyModel(this.#readStateSnapshot()).positionSetFor(
      kind,
      field,
      target,
    );
  }

  #positionSingleKind(kind, field, target, expectedKind) {
    requireSingleKind(target, expectedKind, "query target");
    return readOntologyModel(this.#readStateSnapshot()).positionSetFor(
      kind,
      field,
      target,
    );
  }

  /** Java OWLAxiomIndex direct declaration lookup, preserving entity kind. */
  getDeclarationAxioms(entity) {
    return this.#position(
      OWLObjectKind.DECLARATION_AXIOM,
      "entity",
      entity,
      ENTITY_KINDS,
    );
  }

  /** Match the complete indexed expression, never a nested occurrence. */
  getSubClassAxiomsForSubClass(owlClass) {
    return this.#positionSingleKind(
      OWLObjectKind.SUBCLASS_OF_AXIOM,
      "subClass",
      owlClass,
      OWLObjectKind.CLASS,
    );
  }

  getSubClassAxiomsForSuperClass(owlClass) {
    return this.#positionSingleKind(
      OWLObjectKind.SUBCLASS_OF_AXIOM,
      "superClass",
      owlClass,
      OWLObjectKind.CLASS,
    );
  }

  getEquivalentClassesAxioms(owlClass) {
    return this.#positionSingleKind(
      OWLObjectKind.EQUIVALENT_CLASSES_AXIOM,
      "classExpressions",
      owlClass,
      OWLObjectKind.CLASS,
    );
  }

  getDisjointClassesAxioms(owlClass) {
    return this.#positionSingleKind(
      OWLObjectKind.DISJOINT_CLASSES_AXIOM,
      "classExpressions",
      owlClass,
      OWLObjectKind.CLASS,
    );
  }

  getObjectSubPropertyAxiomsForSubProperty(property) {
    return this.#position(
      OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM,
      "subProperty",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getObjectSubPropertyAxiomsForSuperProperty(property) {
    return this.#position(
      OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM,
      "superProperty",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getObjectPropertyDomainAxioms(property) {
    return this.#position(
      OWLObjectKind.OBJECT_PROPERTY_DOMAIN_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getObjectPropertyRangeAxioms(property) {
    return this.#position(
      OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getInverseObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.INVERSE_OBJECT_PROPERTIES_AXIOM,
      "properties",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getDataSubPropertyAxiomsForSubProperty(property) {
    return this.#positionSingleKind(
      OWLObjectKind.SUB_DATA_PROPERTY_AXIOM,
      "subProperty",
      property,
      OWLObjectKind.DATA_PROPERTY,
    );
  }

  getDataSubPropertyAxiomsForSuperProperty(property) {
    return this.#positionSingleKind(
      OWLObjectKind.SUB_DATA_PROPERTY_AXIOM,
      "superProperty",
      property,
      OWLObjectKind.DATA_PROPERTY,
    );
  }

  getDataPropertyDomainAxioms(property) {
    return this.#positionSingleKind(
      OWLObjectKind.DATA_PROPERTY_DOMAIN_AXIOM,
      "property",
      property,
      OWLObjectKind.DATA_PROPERTY,
    );
  }

  getDataPropertyRangeAxioms(property) {
    return this.#positionSingleKind(
      OWLObjectKind.DATA_PROPERTY_RANGE_AXIOM,
      "property",
      property,
      OWLObjectKind.DATA_PROPERTY,
    );
  }

  getSubAnnotationPropertyOfAxioms(property) {
    return this.#positionSingleKind(
      OWLObjectKind.SUB_ANNOTATION_PROPERTY_AXIOM,
      "subProperty",
      property,
      OWLObjectKind.ANNOTATION_PROPERTY,
    );
  }

  getAnnotationPropertyDomainAxioms(property) {
    return this.#positionSingleKind(
      OWLObjectKind.ANNOTATION_PROPERTY_DOMAIN_AXIOM,
      "property",
      property,
      OWLObjectKind.ANNOTATION_PROPERTY,
    );
  }

  getAnnotationPropertyRangeAxioms(property) {
    return this.#positionSingleKind(
      OWLObjectKind.ANNOTATION_PROPERTY_RANGE_AXIOM,
      "property",
      property,
      OWLObjectKind.ANNOTATION_PROPERTY,
    );
  }

  getFunctionalObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getInverseFunctionalObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getSymmetricObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.SYMMETRIC_OBJECT_PROPERTY_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getAsymmetricObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.ASYMMETRIC_OBJECT_PROPERTY_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getReflexiveObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.REFLEXIVE_OBJECT_PROPERTY_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getIrreflexiveObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getTransitiveObjectPropertyAxioms(property) {
    return this.#position(
      OWLObjectKind.TRANSITIVE_OBJECT_PROPERTY_AXIOM,
      "property",
      property,
      OBJECT_PROPERTY_EXPRESSION_KINDS,
    );
  }

  getFunctionalDataPropertyAxioms(property) {
    return this.#positionSingleKind(
      OWLObjectKind.FUNCTIONAL_DATA_PROPERTY_AXIOM,
      "property",
      property,
      OWLObjectKind.DATA_PROPERTY,
    );
  }

  getClassAssertionAxioms(value) {
    const field = INDIVIDUAL_KIND_SET.has(value?.kind)
      ? "individual"
      : "classExpression";
    return this.#position(
      OWLObjectKind.CLASS_ASSERTION_AXIOM,
      field,
      value,
      CLASS_AND_INDIVIDUAL_KINDS,
    );
  }

  getObjectPropertyAssertionAxioms(individual) {
    return this.#position(
      OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM,
      "subject",
      individual,
      INDIVIDUAL_KINDS,
    );
  }

  getDataPropertyAssertionAxioms(individual) {
    return this.#position(
      OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM,
      "subject",
      individual,
      INDIVIDUAL_KINDS,
    );
  }

  getNegativeObjectPropertyAssertionAxioms(individual) {
    return this.#position(
      OWLObjectKind.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM,
      "subject",
      individual,
      INDIVIDUAL_KINDS,
    );
  }

  getNegativeDataPropertyAssertionAxioms(individual) {
    return this.#position(
      OWLObjectKind.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM,
      "subject",
      individual,
      INDIVIDUAL_KINDS,
    );
  }

  getSameIndividualAxioms(individual) {
    return this.#position(
      OWLObjectKind.SAME_INDIVIDUAL_AXIOM,
      "individuals",
      individual,
      INDIVIDUAL_KINDS,
    );
  }

  getDifferentIndividualAxioms(individual) {
    return this.#position(
      OWLObjectKind.DIFFERENT_INDIVIDUALS_AXIOM,
      "individuals",
      individual,
      INDIVIDUAL_KINDS,
    );
  }

  getAnnotationAssertionAxioms(subject, imports = Imports.EXCLUDED) {
    requireKind(subject, ANNOTATION_SUBJECT_KINDS, "subject");
    const scope = this.#scope(imports);
    if (scope.length === 1)
      return readOntologyModel(
        readOntologySnapshot(scope[0]),
      ).annotationAssertionsSetFor(subject);
    return collectMultiOntologySet(scope, (model, emit) =>
      model.forEachAnnotationAssertionFor(subject, undefined, emit),
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
    return this.#signatureMatching(kind, imports);
  }

  #signatureMatching(kind, imports) {
    return this.#reader(imports).signatureSet(kind);
  }

  /** All named kinds in the selected current loaded scope, without declarations inferred. */
  getSignature(imports = Imports.EXCLUDED) {
    return this.#signatureMatching(undefined, imports);
  }

  getEntitiesInSignature(iri, imports = Imports.EXCLUDED) {
    requireSingleKind(iri, OWLObjectKind.IRI, "iri");
    const scope = this.#scope(imports);
    if (scope.length === 1)
      return readOntologyModel(readOntologySnapshot(scope[0])).entitiesSetFor(
        iri,
      );
    return collectMultiOntologySet(scope, (model, emit) =>
      model.forEachEntityFor(iri, emit),
    );
  }

  containsEntityInSignature(entityOrIRI, imports = Imports.EXCLUDED) {
    requireKind(entityOrIRI, ENTITY_OR_IRI_KINDS, "entityOrIRI");
    return entityOrIRI.kind === OWLObjectKind.IRI
      ? this.getEntitiesInSignature(entityOrIRI, imports).size > 0
      : [...this.getEntitiesInSignature(entityOrIRI.iri, imports)].some(
          (entity) => entity.equals(entityOrIRI),
        );
  }

  getPunnedIRIs(imports = Imports.EXCLUDED) {
    const kindsByIRI = new Map();
    const result = new StructuralSet();
    for (const entity of this.#reader(imports).signature(undefined)) {
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
    requireKind(entity, REFERENCING_ENTITY_KINDS, "entity");
    const scope = this.#scope(imports);
    if (scope.length === 1)
      return readOntologyModel(
        readOntologySnapshot(scope[0]),
      ).referencingAxiomsSetFor(entity);
    return collectMultiOntologySet(scope, (model, emit) =>
      model.forEachReferencingAxiomFor(entity, emit),
    );
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
