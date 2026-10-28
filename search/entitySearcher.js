import {
  ENTITY_KINDS,
  OBJECT_PROPERTY_EXPRESSION_KINDS,
  OWLObjectKind as K,
} from "../model/kinds.js";
import { OWLDataFactory } from "../model/owlDataFactory.js";
import {
  isPackageOntology,
  readOntologySnapshot,
  readOntologyBehaviorDefinition,
} from "../model/owlOntology.js";
import { readOntologyModel } from "../internal/model/ontologyReadModel.js";
import { deferredQuery } from "../internal/model/deferredQuery.js";
import {
  isCanonicalStructuralObject,
  StructuralSet,
} from "../model/structural.js";

const sharedFactory = new OWLDataFactory();
const entityKindsSet = new Set(ENTITY_KINDS);

const requireKind = (entity, kinds) => {
  if (!isCanonicalStructuralObject(entity) || !kinds.includes(entity.kind))
    throw new TypeError("entity has an unsupported structural kind");
};

const readOntologies = (input) => {
  if (isPackageOntology(input)) {
    return [input];
  }
  if (!input || typeof input[Symbol.iterator] !== "function")
    throw new TypeError(
      "ontology must be a package ontology or ontology iterable",
    );
  const result = Array.isArray(input) ? input : [...input];
  let firstBehavior;
  for (let i = 0; i < result.length; i += 1) {
    const ontology = result[i];
    if (!isPackageOntology(ontology)) readOntologySnapshot(ontology);
    const behavior = readOntologyBehaviorDefinition(ontology);
    if (behavior) {
      if (firstBehavior === undefined) firstBehavior = behavior;
      else if (firstBehavior !== behavior)
        throw new TypeError(
          "Search ontologies must use the same behavior profile",
        );
    }
  }
  return result;
};

const classValues = (
  entity,
  input,
  kind,
  matchField,
  outputField,
  excludeSelf = true,
) => {
  requireKind(entity, [K.CLASS]);
  const entityKey = entity.structuralKey();
  return deferredQuery(() =>
    readOntologies(input).flatMap((ontology) =>
      readOntologyModel(readOntologySnapshot(ontology))
        .position(kind, matchField, entityKey)
        .flatMap((axiom) => {
          const value = axiom[outputField];
          return Array.isArray(value)
            ? value.filter(
                (member) =>
                  !excludeSelf || member.structuralKey() !== entityKey,
              )
            : [value];
        }),
    ),
  );
};

const annotationSubject = (entity) => {
  requireKind(entity, [...ENTITY_KINDS, K.IRI, K.ANONYMOUS_INDIVIDUAL]);
  return entityKindsSet.has(entity.kind) ? entity.iri : entity;
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
  const subjectKey = subject.structuralKey();
  const propertyKey =
    property !== undefined && property !== null
      ? property.structuralKey()
      : undefined;
  return deferredQuery(() =>
    readOntologies(input).flatMap((ontology) => [
      ...new StructuralSet(
        readOntologyModel(readOntologySnapshot(ontology))
          .annotationAssertions(subjectKey)
          .flatMap((axiom) => {
            const annotations = [
              sharedFactory.getOWLAnnotation(axiom.property, axiom.value),
            ];
            if (includeAssertionAnnotations)
              annotations.push(...axiom.annotations);
            return propertyKey === undefined
              ? annotations
              : annotations.filter(
                  (annotation) =>
                    annotation.property.structuralKey() === propertyKey,
                );
          }),
      ),
    ]),
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
  const propertyKey = property.structuralKey();
  return deferredQuery(() =>
    readOntologies(input).flatMap((ontology) =>
      readOntologyModel(readOntologySnapshot(ontology))
        .position(kind, match, propertyKey)
        .map((axiom) => axiom[output]),
    ),
  );
};

const CHARACTERISTIC_AXIOM_KINDS = Object.freeze({
  FunctionalObject: K.FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
  FunctionalData: K.FUNCTIONAL_DATA_PROPERTY_AXIOM,
  InverseFunctionalObject: K.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
  TransitiveObject: K.TRANSITIVE_OBJECT_PROPERTY_AXIOM,
  SymmetricObject: K.SYMMETRIC_OBJECT_PROPERTY_AXIOM,
  AsymmetricObject: K.ASYMMETRIC_OBJECT_PROPERTY_AXIOM,
  ReflexiveObject: K.REFLEXIVE_OBJECT_PROPERTY_AXIOM,
  IrreflexiveObject: K.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM,
});

const characteristic = (property, input, name, allowData = false) => {
  requireKind(
    property,
    allowData
      ? [...OBJECT_PROPERTY_EXPRESSION_KINDS, K.DATA_PROPERTY]
      : OBJECT_PROPERTY_EXPRESSION_KINDS,
  );
  const family = property.kind === K.DATA_PROPERTY ? "Data" : "Object";
  const kind = CHARACTERISTIC_AXIOM_KINDS[`${name}${family}`];
  const propertyKey = property.structuralKey();
  return readOntologies(input).some(
    (ontology) =>
      readOntologyModel(readOntologySnapshot(ontology)).position(
        kind,
        "property",
        propertyKey,
      ).length > 0,
  );
};

/** Selected Java stream queries are lazy, live, single-consumption ES iterables.
 * Boolean predicates execute immediately. Repeated ontologies retain multiplicity.
 */
export class EntitySearcher {
  static getAnnotationAssertionAxioms(entity, ontology) {
    readOntologySnapshot(ontology);
    const subjectKey = annotationSubject(entity).structuralKey();
    return deferredQuery(() => [
      ...readOntologyModel(readOntologySnapshot(ontology)).annotationAssertions(
        subjectKey,
      ),
    ]);
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
      K.SUBCLASS_OF_AXIOM,
      "subClass",
      "superClass",
    );
  }

  static getSubClasses(entity, ontologies) {
    return classValues(
      entity,
      ontologies,
      K.SUBCLASS_OF_AXIOM,
      "superClass",
      "subClass",
    );
  }

  static getEquivalentClasses(entity, ontologies) {
    return classValues(
      entity,
      ontologies,
      K.EQUIVALENT_CLASSES_AXIOM,
      "classExpressions",
      "classExpressions",
    );
  }

  static getDisjointClasses(entity, ontologies) {
    // Java's Searcher.different retains every operand, including the query.
    return classValues(
      entity,
      ontologies,
      K.DISJOINT_CLASSES_AXIOM,
      "classExpressions",
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
    const propertyKey = property.structuralKey();
    return deferredQuery(() =>
      readOntologies(ontologies).flatMap((ontology) =>
        readOntologyModel(readOntologySnapshot(ontology))
          .position(
            K.INVERSE_OBJECT_PROPERTIES_AXIOM,
            "properties",
            propertyKey,
          )
          .map(
            (axiom) =>
              axiom.properties[
                axiom.properties[0].structuralKey() === propertyKey ? 1 : 0
              ],
          ),
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
