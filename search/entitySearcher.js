import {
  ENTITY_KINDS,
  OBJECT_PROPERTY_EXPRESSION_KINDS,
  OWLObjectKind as K,
} from "../model/kinds.js";
import { OWLDataFactory } from "../model/owlDataFactory.js";
import { readOntologySnapshot } from "../model/owlOntology.js";
import { isCanonicalStructuralObject } from "../model/structural.js";

const requireKind = (entity, kinds) => {
  if (!isCanonicalStructuralObject(entity) || !kinds.includes(entity.kind))
    throw new TypeError("entity has an unsupported structural kind");
};

const readOntologies = (input) => {
  try {
    readOntologySnapshot(input);
    return [input];
  } catch {
    if (!input || typeof input[Symbol.iterator] !== "function")
      throw new TypeError(
        "ontology must be a package ontology or ontology iterable",
      );
  }
  const result = [...input];
  for (const ontology of result) readOntologySnapshot(ontology);
  return result;
};

const classValues = (entity, input, method, field, excludeSelf = true) => {
  requireKind(entity, [K.CLASS]);
  return readOntologies(input).flatMap((ontology) =>
    [...ontology[method](entity)].flatMap((axiom) => {
      const value = axiom[field];
      return Array.isArray(value)
        ? value.filter((member) => !excludeSelf || !member.equals(entity))
        : [value];
    }),
  );
};

const annotationSubject = (entity) => {
  requireKind(entity, [...ENTITY_KINDS, K.IRI, K.ANONYMOUS_INDIVIDUAL]);
  return ENTITY_KINDS.includes(entity.kind) ? entity.iri : entity;
};

const annotationValues = (
  entity,
  input,
  property,
  includeAssertionAnnotations,
) => {
  const subject = annotationSubject(entity);
  if (property !== undefined && property !== null)
    requireKind(property, [K.ANNOTATION_PROPERTY]);
  const ontologies = readOntologies(input);
  const factory = new OWLDataFactory();
  return ontologies.flatMap((ontology) =>
    [...ontology.getAnnotationAssertionAxioms(subject)].flatMap((axiom) => {
      const annotations = [
        factory.getOWLAnnotation(axiom.property, axiom.value),
      ];
      if (includeAssertionAnnotations) annotations.push(...axiom.annotations);
      return annotations.filter(
        (annotation) =>
          property === undefined ||
          property === null ||
          annotation.property.equals(property),
      );
    }),
  );
};

const propertyFamily = (property) => {
  requireKind(property, [
    ...OBJECT_PROPERTY_EXPRESSION_KINDS,
    K.DATA_PROPERTY,
    K.ANNOTATION_PROPERTY,
  ]);
  if (property.kind === K.DATA_PROPERTY) return "DATA";
  if (property.kind === K.ANNOTATION_PROPERTY) return "ANNOTATION";
  return "OBJECT";
};

const propertyValues = (property, input, relation) => {
  const family = propertyFamily(property);
  const sub = relation === "sub";
  const hierarchy = sub || relation === "super";
  const kind = hierarchy
    ? K[`SUB_${family}_PROPERTY_AXIOM`]
    : K[`${family}_PROPERTY_${relation.toUpperCase()}_AXIOM`];
  const match = hierarchy
    ? sub
      ? "superProperty"
      : "subProperty"
    : "property";
  const output = hierarchy ? (sub ? "subProperty" : "superProperty") : relation;
  return readOntologies(input).flatMap((ontology) =>
    [...ontology.getAxiomsByType(kind)]
      .filter((axiom) => axiom[match].equals(property))
      .map((axiom) => axiom[output]),
  );
};

const characteristic = (property, input, name, allowData = false) => {
  requireKind(
    property,
    allowData
      ? [...OBJECT_PROPERTY_EXPRESSION_KINDS, K.DATA_PROPERTY]
      : OBJECT_PROPERTY_EXPRESSION_KINDS,
  );
  const family = property.kind === K.DATA_PROPERTY ? "Data" : "Object";
  return readOntologies(input).some(
    (ontology) =>
      ontology[`get${name}${family}PropertyAxioms`](property).size > 0,
  );
};

/** Selected Java static queries return eager arrays with stream multiplicity. */
export class EntitySearcher {
  static getAnnotationAssertionAxioms(entity, ontology) {
    readOntologySnapshot(ontology);
    return [
      ...ontology.getAnnotationAssertionAxioms(annotationSubject(entity)),
    ];
  }

  /** Include assertion annotations as separate annotation results, as Java does. */
  static getAnnotations(entity, ontologies, property) {
    if (property === null)
      throw new TypeError("property must be an annotation property");
    if (property === undefined) readOntologySnapshot(ontologies);
    return annotationValues(entity, ontologies, property, true);
  }

  /** Return just each assertion's property/value annotation, excluding axiom annotations. */
  static getAnnotationObjects(entity, ontologies, property) {
    if (property === undefined) readOntologySnapshot(ontologies);
    return annotationValues(entity, ontologies, property, false);
  }

  static getSuperClasses(entity, ontologies) {
    return classValues(
      entity,
      ontologies,
      "getSubClassAxiomsForSubClass",
      "superClass",
    );
  }

  static getSubClasses(entity, ontologies) {
    return classValues(
      entity,
      ontologies,
      "getSubClassAxiomsForSuperClass",
      "subClass",
    );
  }

  static getEquivalentClasses(entity, ontologies) {
    return classValues(
      entity,
      ontologies,
      "getEquivalentClassesAxioms",
      "classExpressions",
    );
  }

  static getDisjointClasses(entity, ontologies) {
    // Java's Searcher.different retains every operand, including the query.
    return classValues(
      entity,
      ontologies,
      "getDisjointClassesAxioms",
      "classExpressions",
      false,
    );
  }

  /** Direct asserted hierarchy values; repeated ontologies remain repeated. */
  static getSubProperties(property, ontologies) {
    return propertyValues(property, ontologies, "sub");
  }
  static getSuperProperties(property, ontologies) {
    return propertyValues(property, ontologies, "super");
  }
  static getDomains(property, ontologies) {
    return propertyValues(property, ontologies, "domain");
  }
  static getRanges(property, ontologies) {
    return propertyValues(property, ontologies, "range");
  }

  /** Return the other endpoint of each directly asserted inverse axiom. */
  static getInverses(property, ontologies) {
    requireKind(property, OBJECT_PROPERTY_EXPRESSION_KINDS);
    return readOntologies(ontologies).flatMap((ontology) =>
      [...ontology.getInverseObjectPropertyAxioms(property)].flatMap((axiom) =>
        axiom.properties.filter((value) => !value.equals(property)),
      ),
    );
  }

  /** Characteristics are assertions in at least one supplied ontology. */
  static isFunctional(property, ontologies) {
    return characteristic(property, ontologies, "Functional", true);
  }
  static isInverseFunctional(property, ontologies) {
    return characteristic(property, ontologies, "InverseFunctional");
  }
  static isTransitive(property, ontologies) {
    return characteristic(property, ontologies, "Transitive");
  }
  static isSymmetric(property, ontologies) {
    return characteristic(property, ontologies, "Symmetric");
  }
  static isAsymmetric(property, ontologies) {
    return characteristic(property, ontologies, "Asymmetric");
  }
  static isReflexive(property, ontologies) {
    return characteristic(property, ontologies, "Reflexive");
  }
  static isIrreflexive(property, ontologies) {
    return characteristic(property, ontologies, "Irreflexive");
  }
}
