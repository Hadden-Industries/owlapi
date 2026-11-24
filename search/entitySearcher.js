import {
  ENTITY_KINDS,
  OBJECT_PROPERTY_EXPRESSION_KINDS,
  OWLObjectKind as K,
} from "../model/kinds.js";
import {
  isPackageOntology,
  readOntologySnapshot,
  readOntologyBehaviorDefinition,
} from "../model/owlOntology.js";
import { readOntologyModel } from "../internal/model/ontologyReadModel.js";
import { deferredQuery } from "../internal/model/deferredQuery.js";
import {
  isCanonicalStructuralObject,
  isFactoryStructuralObject,
} from "../model/structural.js";
import { captureStructuralKey } from "../internal/collections/structuralProjection.js";
import { capturedKeysEqual } from "../internal/collections/structuralComparator.js";

const entityKindsSet = new Set(ENTITY_KINDS);
const objectPropertyKindsSet = new Set(OBJECT_PROPERTY_EXPRESSION_KINDS);
const annotationSubjectKindSet = new Set([
  ...ENTITY_KINDS,
  K.IRI,
  K.ANONYMOUS_INDIVIDUAL,
]);
const allowDataKindSet = new Set([
  ...OBJECT_PROPERTY_EXPRESSION_KINDS,
  K.DATA_PROPERTY,
]);
const objectPropertyOrOtherSet = new Set([
  ...OBJECT_PROPERTY_EXPRESSION_KINDS,
  K.DATA_PROPERTY,
  K.ANNOTATION_PROPERTY,
]);

const requireSingleKind = (entity, expectedKind) => {
  if (!isCanonicalStructuralObject(entity) || entity.kind !== expectedKind)
    throw new TypeError("entity has an unsupported structural kind");
};

const requireKindSet = (entity, kindSet) => {
  if (!isCanonicalStructuralObject(entity) || !kindSet.has(entity.kind))
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

const nativeArrayFilter = Array.prototype.filter;

const classValues = (
  entity,
  input,
  kind,
  matchField,
  outputField,
  excludeSelf = true,
) => {
  requireSingleKind(entity, K.CLASS);
  let entityKey;
  return deferredQuery(() => {
    const ontologies = readOntologies(input);
    const result = [];
    for (let o = 0; o < ontologies.length; o += 1) {
      readOntologyModel(readOntologySnapshot(ontologies[o])).forEachPositionFor(
        kind,
        matchField,
        entity,
        (axiom) => {
          const field = axiom[outputField];
          if (Array.isArray(field)) {
            if (
              isFactoryStructuralObject(axiom) &&
              Array.prototype.filter === nativeArrayFilter
            ) {
              for (let i = 0; i < field.length; i += 1) {
                const member = field[i];
                if (
                  !excludeSelf ||
                  (member !== entity &&
                    !capturedKeysEqual(
                      captureStructuralKey(member),
                      (entityKey ??= captureStructuralKey(entity)),
                    ))
                ) {
                  result.push(member);
                }
              }
            } else {
              // The public search filters array properties by index even when an
              // admitted external array supplies a different iteration protocol.
              const matching = field.filter(
                (member) =>
                  !excludeSelf ||
                  !capturedKeysEqual(
                    captureStructuralKey(member),
                    (entityKey ??= captureStructuralKey(entity)),
                  ),
              );
              if (Array.isArray(matching)) {
                for (let i = 0; i < matching.length; i++)
                  if (i in matching) result.push(matching[i]);
              } else result.push(matching);
            }
          } else result.push(field);
        },
      );
    }
    return result;
  });
};

const annotationSubject = (entity) => {
  requireKindSet(entity, annotationSubjectKindSet);
  return entityKindsSet.has(entity.kind) ? entity.iri : entity;
};

const annotationValues = (
  entity,
  input,
  property,
  includeAssertionAnnotations,
) => {
  const subject = annotationSubject(entity);
  const hasPropertyFilter = property !== undefined && property !== null;
  if (hasPropertyFilter) requireSingleKind(property, K.ANNOTATION_PROPERTY);
  let propertyKey;
  return deferredQuery(() => {
    const ontologies = readOntologies(input);
    if (ontologies.length === 1) {
      const values = readOntologyModel(
        readOntologySnapshot(ontologies[0]),
      ).annotationValuesFor(subject, includeAssertionAnnotations);
      if (!hasPropertyFilter) return values;
      const result = [];
      for (let i = 0; i < values.length; i += 1) {
        const annotation = values[i];
        if (
          annotation.property === property ||
          capturedKeysEqual(
            captureStructuralKey(annotation.property),
            (propertyKey ??= captureStructuralKey(property)),
          )
        ) {
          result.push(annotation);
        }
      }
      return result;
    }
    const result = [];
    for (let o = 0; o < ontologies.length; o += 1) {
      const values = readOntologyModel(
        readOntologySnapshot(ontologies[o]),
      ).annotationValuesFor(subject, includeAssertionAnnotations);
      for (let i = 0; i < values.length; i += 1) {
        const annotation = values[i];
        if (
          !hasPropertyFilter ||
          annotation.property === property ||
          capturedKeysEqual(
            captureStructuralKey(annotation.property),
            (propertyKey ??= captureStructuralKey(property)),
          )
        ) {
          result.push(annotation);
        }
      }
    }
    return result;
  });
};

const propertyFamily = (property) => {
  requireKindSet(property, objectPropertyOrOtherSet);
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
  return deferredQuery(() => {
    const ontologies = readOntologies(input);
    const result = [];
    for (let o = 0; o < ontologies.length; o += 1) {
      readOntologyModel(readOntologySnapshot(ontologies[o])).forEachPositionFor(
        kind,
        match,
        property,
        (axiom) => result.push(axiom[output]),
      );
    }
    return result;
  });
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
  requireKindSet(
    property,
    allowData ? allowDataKindSet : objectPropertyKindsSet,
  );
  const family = property.kind === K.DATA_PROPERTY ? "Data" : "Object";
  const kind = CHARACTERISTIC_AXIOM_KINDS[`${name}${family}`];
  const ontologies = readOntologies(input);
  for (let o = 0; o < ontologies.length; o += 1) {
    if (
      readOntologyModel(readOntologySnapshot(ontologies[o])).hasPositionFor(
        kind,
        "property",
        property,
      )
    ) {
      return true;
    }
  }
  return false;
};

/** Selected Java stream queries are lazy, live, single-consumption ES iterables.
 * Boolean predicates execute immediately. Repeated ontologies retain multiplicity.
 */
export class EntitySearcher {
  static getAnnotationAssertionAxioms(entity, ontology) {
    readOntologySnapshot(ontology);
    const subject = annotationSubject(entity);
    return deferredQuery(() => {
      const result = [];
      readOntologyModel(
        readOntologySnapshot(ontology),
      ).forEachAnnotationAssertionFor(subject, undefined, (axiom) =>
        result.push(axiom),
      );
      return result;
    });
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
    requireKindSet(property, objectPropertyKindsSet);
    let propertyKey;
    return deferredQuery(() => {
      const members = readOntologies(ontologies);
      const result = [];
      for (let o = 0; o < members.length; o += 1) {
        readOntologyModel(readOntologySnapshot(members[o])).forEachPositionFor(
          K.INVERSE_OBJECT_PROPERTIES_AXIOM,
          "properties",
          property,
          (axiom) =>
            result.push(
              axiom.properties[
                axiom.properties[0] === property ||
                capturedKeysEqual(
                  captureStructuralKey(axiom.properties[0]),
                  (propertyKey ??= captureStructuralKey(property)),
                )
                  ? 1
                  : 0
              ],
            ),
        );
      }
      return result;
    });
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
