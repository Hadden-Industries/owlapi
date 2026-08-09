import {
  ANNOTATION_VALUE_KINDS,
  AXIOM_KINDS,
  CLASS_EXPRESSION_KINDS,
  DATA_PROPERTY_EXPRESSION_KINDS,
  DATA_RANGE_KINDS,
  ENTITY_KINDS,
  INDIVIDUAL_KINDS,
  IRI,
  OBJECT_PROPERTY_EXPRESSION_KINDS,
  OWLDataFactory,
  OWLObjectKind,
  OWL_OBJECT_KINDS,
  dispatchClassExpression,
} from "./index.js";

describe("canonical kind dispatch", () => {
  it("requires exhaustive handlers and dispatches only by immutable kind", () => {
    const factory = new OWLDataFactory();
    const expression = factory.getOWLClass(IRI.create("https://example.com/C"));
    const handlers = Object.fromEntries(
      CLASS_EXPRESSION_KINDS.map((kind) => [kind, (value) => value.kind]),
    );

    expect(dispatchClassExpression(expression, handlers)).toBe("OWLClass");
    delete handlers.OWLObjectHasSelf;
    expect(() => dispatchClassExpression(expression, handlers)).toThrow(
      /Missing handler for OWLObjectHasSelf/,
    );
    expect(Object.isFrozen(expression)).toBe(true);
  });

  it("keeps every required v1 kind in its exhaustive category", () => {
    expect(CLASS_EXPRESSION_KINDS).toEqual([
      "OWLClass",
      "OWLObjectIntersectionOf",
      "OWLObjectUnionOf",
      "OWLObjectComplementOf",
      "OWLObjectOneOf",
      "OWLObjectSomeValuesFrom",
      "OWLObjectAllValuesFrom",
      "OWLObjectHasValue",
      "OWLObjectHasSelf",
      "OWLObjectMinCardinality",
      "OWLObjectMaxCardinality",
      "OWLObjectExactCardinality",
      "OWLDataSomeValuesFrom",
      "OWLDataAllValuesFrom",
      "OWLDataHasValue",
      "OWLDataMinCardinality",
      "OWLDataMaxCardinality",
      "OWLDataExactCardinality",
    ]);
    expect(DATA_RANGE_KINDS).toEqual([
      "OWLDatatype",
      "OWLDataIntersectionOf",
      "OWLDataUnionOf",
      "OWLDataComplementOf",
      "OWLDataOneOf",
      "OWLDatatypeRestriction",
    ]);
    expect(OBJECT_PROPERTY_EXPRESSION_KINDS).toEqual([
      "OWLObjectProperty",
      "OWLObjectInverseOf",
    ]);
    expect(DATA_PROPERTY_EXPRESSION_KINDS).toEqual(["OWLDataProperty"]);
    expect(INDIVIDUAL_KINDS).toEqual([
      "OWLNamedIndividual",
      "OWLAnonymousIndividual",
    ]);
    expect(ANNOTATION_VALUE_KINDS).toEqual([
      "IRI",
      "OWLAnonymousIndividual",
      "OWLLiteral",
    ]);
    expect(ENTITY_KINDS).toEqual([
      "OWLClass",
      "OWLDatatype",
      "OWLObjectProperty",
      "OWLDataProperty",
      "OWLAnnotationProperty",
      "OWLNamedIndividual",
    ]);
    expect(AXIOM_KINDS).toEqual([
      "OWLDeclarationAxiom",
      "OWLSubClassOfAxiom",
      "OWLEquivalentClassesAxiom",
      "OWLDisjointClassesAxiom",
      "OWLDisjointUnionAxiom",
      "OWLSubObjectPropertyOfAxiom",
      "OWLSubPropertyChainOfAxiom",
      "OWLEquivalentObjectPropertiesAxiom",
      "OWLDisjointObjectPropertiesAxiom",
      "OWLObjectPropertyDomainAxiom",
      "OWLObjectPropertyRangeAxiom",
      "OWLInverseObjectPropertiesAxiom",
      "OWLFunctionalObjectPropertyAxiom",
      "OWLInverseFunctionalObjectPropertyAxiom",
      "OWLReflexiveObjectPropertyAxiom",
      "OWLIrreflexiveObjectPropertyAxiom",
      "OWLSymmetricObjectPropertyAxiom",
      "OWLAsymmetricObjectPropertyAxiom",
      "OWLTransitiveObjectPropertyAxiom",
      "OWLSubDataPropertyOfAxiom",
      "OWLEquivalentDataPropertiesAxiom",
      "OWLDisjointDataPropertiesAxiom",
      "OWLDataPropertyDomainAxiom",
      "OWLDataPropertyRangeAxiom",
      "OWLFunctionalDataPropertyAxiom",
      "OWLDatatypeDefinitionAxiom",
      "OWLHasKeyAxiom",
      "OWLSameIndividualAxiom",
      "OWLDifferentIndividualsAxiom",
      "OWLClassAssertionAxiom",
      "OWLObjectPropertyAssertionAxiom",
      "OWLNegativeObjectPropertyAssertionAxiom",
      "OWLDataPropertyAssertionAxiom",
      "OWLNegativeDataPropertyAssertionAxiom",
      "OWLAnnotationAssertionAxiom",
      "OWLSubAnnotationPropertyOfAxiom",
      "OWLAnnotationPropertyDomainAxiom",
      "OWLAnnotationPropertyRangeAxiom",
    ]);
    expect(new Set(OWL_OBJECT_KINDS)).toEqual(
      new Set(Object.values(OWLObjectKind)),
    );
  });
});
