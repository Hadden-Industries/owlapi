import { OWLObjectKind as K } from "../../model/kinds.js";
import { structuralFields } from "./structuralFields.js";

// Public typeIndex() observations from the pinned Java API. Display ordering
// differs from the package's structural-key normalization and never changes it.
const typeIndices = Object.freeze({
  IRI: 0,
  OWLAnnotation: 5001,
  OWLAnnotationAssertionAxiom: 2034,
  OWLAnnotationProperty: 1006,
  OWLAnnotationPropertyDomainAxiom: 2037,
  OWLAnnotationPropertyRangeAxiom: 2036,
  OWLAnonymousIndividual: 1007,
  OWLAsymmetricObjectPropertyAxiom: 2018,
  OWLClass: 1001,
  OWLClassAssertionAxiom: 2005,
  OWLDataAllValuesFrom: 3013,
  OWLDataComplementOf: 4002,
  OWLDataExactCardinality: 3016,
  OWLDataHasValue: 3014,
  OWLDataIntersectionOf: 4004,
  OWLDataMaxCardinality: 3017,
  OWLDataMinCardinality: 3015,
  OWLDataOneOf: 4003,
  OWLDataProperty: 1004,
  OWLDataPropertyAssertionAxiom: 2010,
  OWLDataPropertyDomainAxiom: 2029,
  OWLDataPropertyRangeAxiom: 2030,
  OWLDataSomeValuesFrom: 3012,
  OWLDataUnionOf: 4005,
  OWLDatatype: 4001,
  OWLDatatypeDefinitionAxiom: 2038,
  OWLDatatypeRestriction: 4006,
  OWLDeclarationAxiom: 2000,
  OWLDifferentIndividualsAxiom: 2007,
  OWLDisjointClassesAxiom: 2003,
  OWLDisjointDataPropertiesAxiom: 2031,
  OWLDisjointObjectPropertiesAxiom: 2024,
  OWLDisjointUnionAxiom: 2004,
  OWLEquivalentClassesAxiom: 2001,
  OWLEquivalentDataPropertiesAxiom: 2026,
  OWLEquivalentObjectPropertiesAxiom: 2012,
  OWLFacetRestriction: 4007,
  OWLFunctionalDataPropertyAxiom: 2028,
  OWLFunctionalObjectPropertyAxiom: 2015,
  OWLHasKeyAxiom: 2032,
  OWLInverseFunctionalObjectPropertyAxiom: 2016,
  OWLInverseObjectPropertiesAxiom: 2014,
  OWLIrreflexiveObjectPropertyAxiom: 2021,
  OWLLiteral: 4008,
  OWLNamedIndividual: 1005,
  OWLNegativeDataPropertyAssertionAxiom: 2011,
  OWLNegativeObjectPropertyAssertionAxiom: 2009,
  OWLObjectAllValuesFrom: 3006,
  OWLObjectComplementOf: 3003,
  OWLObjectExactCardinality: 3009,
  OWLObjectHasSelf: 3011,
  OWLObjectHasValue: 3007,
  OWLObjectIntersectionOf: 3001,
  OWLObjectInverseOf: 1003,
  OWLObjectMaxCardinality: 3010,
  OWLObjectMinCardinality: 3008,
  OWLObjectOneOf: 3004,
  OWLObjectProperty: 1002,
  OWLObjectPropertyAssertionAxiom: 2008,
  OWLObjectPropertyDomainAxiom: 2022,
  OWLObjectPropertyRangeAxiom: 2023,
  OWLObjectSomeValuesFrom: 3005,
  OWLObjectUnionOf: 3002,
  OWLReflexiveObjectPropertyAxiom: 2020,
  OWLSameIndividualAxiom: 2006,
  OWLSubAnnotationPropertyOfAxiom: 2035,
  OWLSubClassOfAxiom: 2002,
  OWLSubDataPropertyOfAxiom: 2027,
  OWLSubObjectPropertyOfAxiom: 2013,
  OWLSymmetricObjectPropertyAxiom: 2017,
  OWLTransitiveObjectPropertyAxiom: 2019,
  OWLSubPropertyChainOfAxiom: 2025,
});
const compareScalars = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

/** Native collection display order, including datatype-before-lexical literals. */
export const compareDisplayObjects = (left, right) => {
  if (left === right) return 0;
  if (left === undefined || left === null) return -1;
  if (right === undefined || right === null) return 1;
  if (Array.isArray(left) && Array.isArray(right)) {
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      const compared = compareDisplayObjects(left[index], right[index]);
      if (compared) return compared;
    }
    return left.length - right.length;
  }
  if (typeof left !== "object" || typeof right !== "object")
    return compareScalars(left, right);
  const type = typeIndices[left.kind] - typeIndices[right.kind];
  if (type) return type;
  if (
    !Object.hasOwn(typeIndices, left.kind) ||
    !Object.hasOwn(typeIndices, right.kind)
  )
    throw new TypeError("Unsupported display ordering kind");
  const fields =
    left.kind === K.LITERAL
      ? ["datatype", "lexicalForm", "language"]
      : structuralFields.get(left.kind);
  for (const field of fields) {
    const a =
      Array.isArray(left[field]) && field !== "chain"
        ? [...left[field]].sort(compareDisplayObjects)
        : left[field];
    const b =
      Array.isArray(right[field]) && field !== "chain"
        ? [...right[field]].sort(compareDisplayObjects)
        : right[field];
    const compared = compareDisplayObjects(a, b);
    if (compared) return compared;
  }
  return 0;
};

export const sortedDisplayObjects = (values) =>
  [...values].sort(compareDisplayObjects);
