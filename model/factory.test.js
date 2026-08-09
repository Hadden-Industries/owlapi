import {
  IRI,
  OWLDataFactory,
  OWLObjectKind,
  OWLStructuralObject,
} from "./index.js";

describe("OWLDataFactory", () => {
  it("constructs the required v1 class expressions and data ranges", () => {
    const factory = new OWLDataFactory();
    const cls = factory.getOWLClass(IRI.create("https://example.com/C"));
    const otherClass = factory.getOWLClass(IRI.create("https://example.com/D"));
    const objectProperty = factory.getOWLObjectProperty(
      IRI.create("https://example.com/op"),
    );
    const dataProperty = factory.getOWLDataProperty(
      IRI.create("https://example.com/dp"),
    );
    const individual = factory.getOWLNamedIndividual(
      IRI.create("https://example.com/i"),
    );
    const literal = factory.getOWLLiteral(
      "1",
      IRI.create("http://www.w3.org/2001/XMLSchema#integer"),
    );
    const datatype = factory.getOWLDatatype(
      IRI.create("http://www.w3.org/2001/XMLSchema#integer"),
    );
    const facet = factory.getOWLFacetRestriction(
      IRI.create("http://www.w3.org/2001/XMLSchema#minInclusive"),
      literal,
    );

    const values = [
      factory.getOWLObjectInverseOf(objectProperty),
      factory.getOWLObjectIntersectionOf([cls, otherClass]),
      factory.getOWLObjectUnionOf([cls, otherClass]),
      factory.getOWLObjectComplementOf(cls),
      factory.getOWLObjectOneOf([individual]),
      factory.getOWLObjectSomeValuesFrom(objectProperty, cls),
      factory.getOWLObjectAllValuesFrom(objectProperty, cls),
      factory.getOWLObjectHasValue(objectProperty, individual),
      factory.getOWLObjectHasSelf(objectProperty),
      factory.getOWLObjectMinCardinality(1, objectProperty, cls),
      factory.getOWLObjectMaxCardinality(1, objectProperty, cls),
      factory.getOWLObjectExactCardinality(1, objectProperty, cls),
      factory.getOWLDataSomeValuesFrom([dataProperty], datatype),
      factory.getOWLDataAllValuesFrom([dataProperty], datatype),
      factory.getOWLDataHasValue(dataProperty, literal),
      factory.getOWLDataMinCardinality(1, dataProperty, datatype),
      factory.getOWLDataMaxCardinality(1, dataProperty, datatype),
      factory.getOWLDataExactCardinality(1, dataProperty, datatype),
      factory.getOWLDataIntersectionOf([
        datatype,
        factory.getOWLDatatype(IRI.create("https://example.com/Numeric")),
      ]),
      factory.getOWLDataUnionOf([
        datatype,
        factory.getOWLDatatype(IRI.create("https://example.com/Numeric")),
      ]),
      factory.getOWLDataComplementOf(datatype),
      factory.getOWLDataOneOf([literal]),
      factory.getOWLDatatypeRestriction(datatype, [facet]),
      facet,
    ];

    expect(values.map(({ kind }) => kind)).toEqual([
      "OWLObjectInverseOf",
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
      "OWLDataIntersectionOf",
      "OWLDataUnionOf",
      "OWLDataComplementOf",
      "OWLDataOneOf",
      "OWLDatatypeRestriction",
      "OWLFacetRestriction",
    ]);
  });

  it("preserves property order in n-ary data restrictions", () => {
    const factory = new OWLDataFactory();
    const first = factory.getOWLDataProperty(
      IRI.create("https://example.com/first"),
    );
    const second = factory.getOWLDataProperty(
      IRI.create("https://example.com/second"),
    );
    const dataRange = factory.getOWLDatatype(
      IRI.create("https://example.com/Pair"),
    );

    const forward = factory.getOWLDataSomeValuesFrom(
      [first, second],
      dataRange,
    );
    const reversed = factory.getOWLDataSomeValuesFrom(
      [second, first],
      dataRange,
    );

    expect(forward.equals(reversed)).toBe(false);
  });

  it("rejects a data property in an object restriction", () => {
    const factory = new OWLDataFactory();
    const dataProperty = factory.getOWLDataProperty(
      IRI.create("https://example.com/data"),
    );
    const filler = factory.getOWLClass(
      IRI.create("https://example.com/Filler"),
    );

    expect(() =>
      factory.getOWLObjectSomeValuesFrom(dataProperty, filler),
    ).toThrow(TypeError);
  });

  it("rejects a class value in a data restriction", () => {
    const factory = new OWLDataFactory();
    const dataProperty = factory.getOWLDataProperty(
      IRI.create("https://example.com/data"),
    );
    const classValue = factory.getOWLClass(
      IRI.create("https://example.com/ClassValue"),
    );

    expect(() => factory.getOWLDataHasValue(dataProperty, classValue)).toThrow(
      TypeError,
    );
  });

  it("enforces operand categories across object expressions", () => {
    const factory = new OWLDataFactory();
    const cls = factory.getOWLClass(IRI.create("https://example.com/Class"));
    const dataProperty = factory.getOWLDataProperty(
      IRI.create("https://example.com/data"),
    );
    const literal = factory.getOWLLiteral("value");

    expect(() => factory.getOWLObjectInverseOf(dataProperty)).toThrow(
      TypeError,
    );
    expect(() => factory.getOWLObjectIntersectionOf([cls, literal])).toThrow(
      TypeError,
    );
    expect(() => factory.getOWLObjectComplementOf(literal)).toThrow(TypeError);
    expect(() => factory.getOWLObjectOneOf([cls])).toThrow(TypeError);
    expect(() => factory.getOWLObjectHasValue(dataProperty, cls)).toThrow(
      TypeError,
    );
    expect(() => factory.getOWLObjectHasSelf(dataProperty)).toThrow(TypeError);
    expect(() =>
      factory.getOWLObjectMinCardinality(1, dataProperty, cls),
    ).toThrow(TypeError);
  });

  it("enforces operand categories across data expressions and ranges", () => {
    const factory = new OWLDataFactory();
    const cls = factory.getOWLClass(IRI.create("https://example.com/Class"));
    const objectProperty = factory.getOWLObjectProperty(
      IRI.create("https://example.com/object"),
    );
    const dataProperty = factory.getOWLDataProperty(
      IRI.create("https://example.com/data"),
    );
    const datatype = factory.getOWLDatatype(
      IRI.create("https://example.com/Datatype"),
    );
    const literal = factory.getOWLLiteral("value");

    expect(() =>
      factory.getOWLDataSomeValuesFrom([objectProperty], datatype),
    ).toThrow(TypeError);
    expect(() => factory.getOWLDataAllValuesFrom([dataProperty], cls)).toThrow(
      TypeError,
    );
    expect(() =>
      factory.getOWLDataMinCardinality(1, objectProperty, datatype),
    ).toThrow(TypeError);
    expect(() => factory.getOWLDataIntersectionOf([datatype, cls])).toThrow(
      TypeError,
    );
    expect(() => factory.getOWLDataComplementOf(cls)).toThrow(TypeError);
    expect(() => factory.getOWLDataOneOf([literal, cls])).toThrow(TypeError);
    expect(() =>
      factory.getOWLFacetRestriction(
        IRI.create("https://example.com/facet"),
        cls,
      ),
    ).toThrow(TypeError);
    expect(() => factory.getOWLDatatypeRestriction(cls, [])).toThrow(TypeError);
  });

  it("enforces literal and annotation value categories", () => {
    const factory = new OWLDataFactory();
    const cls = factory.getOWLClass(IRI.create("https://example.com/Class"));
    const label = factory.getRDFSLabel();
    const literal = factory.getOWLLiteral("value");

    expect(() => factory.getOWLLiteral("value", {})).toThrow(TypeError);
    expect(() => factory.getOWLAnnotation(cls, literal)).toThrow(TypeError);
    expect(() => factory.getOWLAnnotation(label, cls)).toThrow(TypeError);
    expect(() => factory.getOWLAnnotation(label, literal, [literal])).toThrow(
      TypeError,
    );
  });

  it("represents a literal datatype as an OWLDatatype entity", () => {
    const factory = new OWLDataFactory();
    const datatypeIri = IRI.create("http://www.w3.org/2001/XMLSchema#integer");
    const datatype = factory.getOWLDatatype(datatypeIri);

    const fromDatatype = factory.getOWLLiteral("1", datatype);
    const fromIri = factory.getOWLLiteral("1", datatypeIri);

    expect(fromDatatype.datatype).toBe(datatype);
    expect(fromIri.equals(fromDatatype)).toBe(true);
  });

  it("enforces operand categories across axiom families", () => {
    const factory = new OWLDataFactory();
    const classA = factory.getOWLClass(IRI.create("https://example.com/A"));
    const classB = factory.getOWLClass(IRI.create("https://example.com/B"));
    const classExpression = factory.getOWLObjectIntersectionOf([
      classA,
      classB,
    ]);
    const objectProperty = factory.getOWLObjectProperty(
      IRI.create("https://example.com/object"),
    );
    const dataProperty = factory.getOWLDataProperty(
      IRI.create("https://example.com/data"),
    );
    const individual = factory.getOWLNamedIndividual(
      IRI.create("https://example.com/individual"),
    );
    const literal = factory.getOWLLiteral("value");

    expect(() => factory.getOWLDeclarationAxiom(classExpression)).toThrow(
      TypeError,
    );
    expect(() => factory.getOWLSubClassOfAxiom(literal, classA)).toThrow(
      TypeError,
    );
    expect(() =>
      factory.getOWLSubObjectPropertyOfAxiom(dataProperty, objectProperty),
    ).toThrow(TypeError);
    expect(() =>
      factory.getOWLDataPropertyDomainAxiom(objectProperty, classA),
    ).toThrow(TypeError);
    expect(() =>
      factory.getOWLSameIndividualAxiom([individual, classA]),
    ).toThrow(TypeError);
    expect(() =>
      factory.getOWLDataPropertyAssertionAxiom(
        dataProperty,
        individual,
        classA,
      ),
    ).toThrow(TypeError);
    expect(() =>
      factory.getOWLAnnotationAssertionAxiom(classA, individual.iri, literal),
    ).toThrow(TypeError);
  });

  it("normalizes unqualified cardinalities to their OWL default fillers", () => {
    const factory = new OWLDataFactory();
    const objectProperty = factory.getOWLObjectProperty(
      IRI.create("https://example.com/object"),
    );
    const dataProperty = factory.getOWLDataProperty(
      IRI.create("https://example.com/data"),
    );
    const owlThing = factory.getOWLClass(
      IRI.create("http://www.w3.org/2002/07/owl#Thing"),
    );
    const rdfsLiteral = factory.getOWLDatatype(
      IRI.create("http://www.w3.org/2000/01/rdf-schema#Literal"),
    );

    expect(
      factory
        .getOWLObjectMinCardinality(1, objectProperty)
        .equals(
          factory.getOWLObjectMinCardinality(1, objectProperty, owlThing),
        ),
    ).toBe(true);
    expect(
      factory
        .getOWLDataMinCardinality(1, dataProperty)
        .equals(factory.getOWLDataMinCardinality(1, dataProperty, rdfsLiteral)),
    ).toBe(true);
  });

  it("recognizes IRI values through the canonical kind identity", () => {
    const factory = new OWLDataFactory();
    const iri = new OWLStructuralObject(
      OWLObjectKind.IRI,
      { value: "https://example.com/Class" },
      ["https://example.com/Class"],
    );

    expect(factory.getOWLClass(iri).iri).toBe(iri);
  });

  it("rejects mutable structural lookalikes at factory boundaries", () => {
    const factory = new OWLDataFactory();
    const mutableIri = {
      kind: OWLObjectKind.IRI,
      structuralKey: () => '["IRI","urn:mutable"]',
      toStructuralTuple: () => ["IRI", "urn:mutable"],
      value: "urn:mutable",
    };

    expect(() => factory.getOWLClass(mutableIri)).toThrow(TypeError);
  });

  it("constructs the required v1 axiom families without losing ordered chains", () => {
    const factory = new OWLDataFactory();
    const classA = factory.getOWLClass(IRI.create("https://example.com/A"));
    const classB = factory.getOWLClass(IRI.create("https://example.com/B"));
    const objectP = factory.getOWLObjectProperty(
      IRI.create("https://example.com/p"),
    );
    const objectQ = factory.getOWLObjectProperty(
      IRI.create("https://example.com/q"),
    );
    const dataP = factory.getOWLDataProperty(
      IRI.create("https://example.com/dp"),
    );
    const dataQ = factory.getOWLDataProperty(
      IRI.create("https://example.com/dq"),
    );
    const annotationP = factory.getOWLAnnotationProperty(
      IRI.create("https://example.com/ap"),
    );
    const annotationQ = factory.getOWLAnnotationProperty(
      IRI.create("https://example.com/aq"),
    );
    const alice = factory.getOWLNamedIndividual(
      IRI.create("https://example.com/Alice"),
    );
    const bob = factory.getOWLNamedIndividual(
      IRI.create("https://example.com/Bob"),
    );
    const datatype = factory.getOWLDatatype(
      IRI.create("http://www.w3.org/2001/XMLSchema#string"),
    );
    const literal = factory.getOWLLiteral("value");
    const annotations = [
      factory.getOWLAnnotation(
        factory.getRDFSLabel(),
        factory.getOWLLiteral("test"),
      ),
    ];

    const axioms = [
      factory.getOWLDeclarationAxiom(classA, annotations),
      factory.getOWLSubClassOfAxiom(classA, classB, annotations),
      factory.getOWLEquivalentClassesAxiom([classA, classB], annotations),
      factory.getOWLDisjointClassesAxiom([classA, classB], annotations),
      factory.getOWLDisjointUnionAxiom(classA, [classA, classB], annotations),
      factory.getOWLSubObjectPropertyOfAxiom(objectP, objectQ, annotations),
      factory.getOWLSubPropertyChainOfAxiom(
        [objectP, objectQ],
        objectP,
        annotations,
      ),
      factory.getOWLEquivalentObjectPropertiesAxiom(
        [objectP, objectQ],
        annotations,
      ),
      factory.getOWLDisjointObjectPropertiesAxiom(
        [objectP, objectQ],
        annotations,
      ),
      factory.getOWLObjectPropertyDomainAxiom(objectP, classA, annotations),
      factory.getOWLObjectPropertyRangeAxiom(objectP, classB, annotations),
      factory.getOWLInverseObjectPropertiesAxiom(objectP, objectQ, annotations),
      factory.getOWLFunctionalObjectPropertyAxiom(objectP, annotations),
      factory.getOWLInverseFunctionalObjectPropertyAxiom(objectP, annotations),
      factory.getOWLReflexiveObjectPropertyAxiom(objectP, annotations),
      factory.getOWLIrreflexiveObjectPropertyAxiom(objectP, annotations),
      factory.getOWLSymmetricObjectPropertyAxiom(objectP, annotations),
      factory.getOWLAsymmetricObjectPropertyAxiom(objectP, annotations),
      factory.getOWLTransitiveObjectPropertyAxiom(objectP, annotations),
      factory.getOWLSubDataPropertyOfAxiom(dataP, dataQ, annotations),
      factory.getOWLEquivalentDataPropertiesAxiom([dataP, dataQ], annotations),
      factory.getOWLDisjointDataPropertiesAxiom([dataP, dataQ], annotations),
      factory.getOWLDataPropertyDomainAxiom(dataP, classA, annotations),
      factory.getOWLDataPropertyRangeAxiom(dataP, datatype, annotations),
      factory.getOWLFunctionalDataPropertyAxiom(dataP, annotations),
      factory.getOWLDatatypeDefinitionAxiom(datatype, datatype, annotations),
      factory.getOWLHasKeyAxiom(classA, [objectP], [dataP], annotations),
      factory.getOWLSameIndividualAxiom([alice, bob], annotations),
      factory.getOWLDifferentIndividualsAxiom([alice, bob], annotations),
      factory.getOWLClassAssertionAxiom(classA, alice, annotations),
      factory.getOWLObjectPropertyAssertionAxiom(
        objectP,
        alice,
        bob,
        annotations,
      ),
      factory.getOWLNegativeObjectPropertyAssertionAxiom(
        objectP,
        alice,
        bob,
        annotations,
      ),
      factory.getOWLDataPropertyAssertionAxiom(
        dataP,
        alice,
        literal,
        annotations,
      ),
      factory.getOWLNegativeDataPropertyAssertionAxiom(
        dataP,
        alice,
        literal,
        annotations,
      ),
      factory.getOWLAnnotationAssertionAxiom(
        annotationP,
        alice.iri,
        literal,
        annotations,
      ),
      factory.getOWLSubAnnotationPropertyOfAxiom(
        annotationP,
        annotationQ,
        annotations,
      ),
      factory.getOWLAnnotationPropertyDomainAxiom(
        annotationP,
        IRI.create("https://example.com/domain"),
        annotations,
      ),
      factory.getOWLAnnotationPropertyRangeAxiom(
        annotationP,
        IRI.create("https://example.com/range"),
        annotations,
      ),
    ];

    expect(axioms.map(({ kind }) => kind)).toEqual([
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

    const forward = factory.getOWLSubPropertyChainOfAxiom(
      [objectP, objectQ],
      objectP,
    );
    const reversed = factory.getOWLSubPropertyChainOfAxiom(
      [objectQ, objectP],
      objectP,
    );
    expect(forward.equals(reversed)).toBe(false);
  });

  it("treats inverse-property axiom operands as an unordered pair with repetitions", () => {
    const factory = new OWLDataFactory();
    const first = factory.getOWLObjectProperty(
      IRI.create("urn:property:first"),
    );
    const second = factory.getOWLObjectProperty(
      IRI.create("urn:property:second"),
    );

    const forward = factory.getOWLInverseObjectPropertiesAxiom(first, second);
    const reversed = factory.getOWLInverseObjectPropertiesAxiom(second, first);
    const selfInverse = factory.getOWLInverseObjectPropertiesAxiom(
      first,
      first,
    );

    expect(forward.equals(reversed)).toBe(true);
    expect(selfInverse.properties).toEqual([first, first]);
  });
});
