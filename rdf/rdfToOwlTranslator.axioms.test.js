import { OWLObjectKind } from "../model/index.js";
import {
  rdfDataFactory,
  rdfDatasetFactory,
  RdfToOwlTranslator,
} from "./index.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const EX = "https://example.com/";

const nn = (value) => rdfDataFactory.namedNode(value);
const bn = (value) => rdfDataFactory.blankNode(value);
const literal = (...values) => rdfDataFactory.literal(...values);
const q = (...values) => rdfDataFactory.quad(...values);
const datasetOf = (...quads) => rdfDatasetFactory.dataset(quads.flat());
const declaration = (subject, type) => q(subject, nn(`${RDF}type`), nn(type));

const rdfList = (name, values) => {
  const quads = [];
  let head = nn(`${RDF}nil`);
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const node = bn(`${name}-${index}`);
    quads.push(q(node, nn(`${RDF}first`), values[index]));
    quads.push(q(node, nn(`${RDF}rest`), head));
    head = node;
  }
  return { head, quads };
};

const expectAxiomCount = (ontology, kind, size = 1) =>
  expect(ontology.getAxiomsByType(kind)).toHaveProperty("size", size);

describe("RdfToOwlTranslator axiom reconstruction", () => {
  it("removes the redundant OWL 1 declaration and list types from strict input", async () => {
    const owlClass = nn(`${EX}LegacyClass`);
    const property = nn(`${EX}legacyProperty`);
    const allDifferent = bn("legacy-all-different");
    const members = rdfList("legacy-members", [nn(`${EX}a`), nn(`${EX}b`)]);
    const input = datasetOf(
      declaration(owlClass, `${OWL}Class`),
      declaration(owlClass, `${RDFS}Class`),
      declaration(property, `${OWL}ObjectProperty`),
      declaration(property, `${RDF}Property`),
      declaration(allDifferent, `${OWL}AllDifferent`),
      q(allDifferent, nn(`${OWL}members`), members.head),
      declaration(members.head, `${RDF}List`),
      members.quads,
    );

    const { context, ontology } = await new RdfToOwlTranslator().translate(
      input,
    );

    expect(context.diagnostics).toEqual([]);
    expectAxiomCount(ontology, OWLObjectKind.DECLARATION_AXIOM, 2);
    expectAxiomCount(ontology, OWLObjectKind.DIFFERENT_INDIVIDUALS_AXIOM);
    expectAxiomCount(ontology, OWLObjectKind.CLASS_ASSERTION_AXIOM, 0);
  });

  it("maps an OWL 1 ontology property to an annotation-property declaration", async () => {
    const property = nn(`${EX}legacyOntologyProperty`);
    const subject = nn(`${EX}subject`);
    const input = datasetOf(
      declaration(property, `${OWL}OntologyProperty`),
      q(subject, property, literal("value")),
    );

    const { ontology } = await new RdfToOwlTranslator().translate(input);
    const [declarationAxiom] = ontology.getAxiomsByType(
      OWLObjectKind.DECLARATION_AXIOM,
    );

    expect(declarationAxiom.entity).toMatchObject({
      iri: { value: property.value },
      kind: OWLObjectKind.ANNOTATION_PROPERTY,
    });
    expectAxiomCount(ontology, OWLObjectKind.ANNOTATION_ASSERTION_AXIOM);
  });

  it("maps deprecated class and property markers to boolean annotation assertions", async () => {
    const owlClass = nn(`${EX}DeprecatedClass`);
    const property = nn(`${EX}deprecatedProperty`);
    const input = datasetOf(
      declaration(owlClass, `${OWL}DeprecatedClass`),
      declaration(property, `${OWL}DeprecatedProperty`),
    );

    const { ontology } = await new RdfToOwlTranslator().translate(input);
    const assertions = [
      ...ontology.getAxiomsByType(OWLObjectKind.ANNOTATION_ASSERTION_AXIOM),
    ];

    expect(assertions).toHaveLength(2);
    expect(
      assertions.map(({ subject, value }) => ({
        lexicalForm: value.lexicalForm,
        subject: subject.value,
      })),
    ).toEqual([
      { lexicalForm: "true", subject: owlClass.value },
      { lexicalForm: "true", subject: property.value },
    ]);
  });

  it("infers the OWL 1 object-property declaration required by characteristic types", async () => {
    const property = nn(`${EX}symmetricProperty`);
    const domain = nn(`${EX}Domain`);
    const input = datasetOf(
      declaration(property, `${OWL}SymmetricProperty`),
      declaration(domain, `${OWL}Class`),
      q(property, nn(`${RDFS}domain`), domain),
      q(property, nn(`${RDFS}range`), domain),
    );

    const { ontology } = await new RdfToOwlTranslator().translate(input);

    expectAxiomCount(ontology, OWLObjectKind.SYMMETRIC_OBJECT_PROPERTY_AXIOM);
    expectAxiomCount(ontology, OWLObjectKind.OBJECT_PROPERTY_DOMAIN_AXIOM);
    expectAxiomCount(ontology, OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM);
    expect(
      [...ontology.getAxiomsByType(OWLObjectKind.DECLARATION_AXIOM)].some(
        ({ entity }) =>
          entity.kind === OWLObjectKind.OBJECT_PROPERTY &&
          entity.iri.value === property.value,
      ),
    ).toBe(true);
  });

  it("reconstructs binary and n-ary class axioms", async () => {
    const first = nn(`${EX}First`);
    const second = nn(`${EX}Second`);
    const third = nn(`${EX}Third`);
    const allDisjoint = bn("all-disjoint-classes");
    const disjointMembers = rdfList("disjoint-classes", [first, second, third]);
    const unionMembers = rdfList("disjoint-union", [second, third]);
    const input = datasetOf(
      declaration(first, `${OWL}Class`),
      declaration(second, `${OWL}Class`),
      declaration(third, `${OWL}Class`),
      q(first, nn(`${RDFS}subClassOf`), second),
      q(first, nn(`${OWL}equivalentClass`), third),
      q(second, nn(`${OWL}disjointWith`), third),
      declaration(allDisjoint, `${OWL}AllDisjointClasses`),
      q(allDisjoint, nn(`${OWL}members`), disjointMembers.head),
      disjointMembers.quads,
      q(first, nn(`${OWL}disjointUnionOf`), unionMembers.head),
      unionMembers.quads,
    );

    const { ontology } = await new RdfToOwlTranslator().translate(input);

    expectAxiomCount(ontology, OWLObjectKind.SUBCLASS_OF_AXIOM);
    expectAxiomCount(ontology, OWLObjectKind.EQUIVALENT_CLASSES_AXIOM);
    expectAxiomCount(ontology, OWLObjectKind.DISJOINT_CLASSES_AXIOM, 2);
    expectAxiomCount(ontology, OWLObjectKind.DISJOINT_UNION_AXIOM);
    const nary = [
      ...ontology.getAxiomsByType(OWLObjectKind.DISJOINT_CLASSES_AXIOM),
    ].find(({ classExpressions }) => classExpressions.length === 3);
    expect(nary.classExpressions.map(({ iri }) => iri.value)).toEqual([
      first.value,
      second.value,
      third.value,
    ]);
  });

  it("reconstructs the complete object-property axiom family", async () => {
    const first = nn(`${EX}firstObjectProperty`);
    const second = nn(`${EX}secondObjectProperty`);
    const third = nn(`${EX}thirdObjectProperty`);
    const domain = nn(`${EX}Domain`);
    const range = nn(`${EX}Range`);
    const chain = rdfList("object-chain", [first, third]);
    const allDisjoint = bn("all-disjoint-object-properties");
    const disjointMembers = rdfList("disjoint-object-properties", [
      first,
      second,
      third,
    ]);
    const input = datasetOf(
      declaration(first, `${OWL}ObjectProperty`),
      declaration(second, `${OWL}ObjectProperty`),
      declaration(third, `${OWL}ObjectProperty`),
      declaration(domain, `${OWL}Class`),
      declaration(range, `${OWL}Class`),
      q(first, nn(`${RDFS}subPropertyOf`), second),
      q(second, nn(`${OWL}propertyChainAxiom`), chain.head),
      chain.quads,
      q(first, nn(`${OWL}equivalentProperty`), second),
      q(first, nn(`${OWL}propertyDisjointWith`), third),
      declaration(allDisjoint, `${OWL}AllDisjointProperties`),
      q(allDisjoint, nn(`${OWL}members`), disjointMembers.head),
      disjointMembers.quads,
      q(first, nn(`${RDFS}domain`), domain),
      q(first, nn(`${RDFS}range`), range),
      q(first, nn(`${OWL}inverseOf`), second),
      declaration(first, `${OWL}FunctionalProperty`),
      declaration(first, `${OWL}InverseFunctionalProperty`),
      declaration(first, `${OWL}ReflexiveProperty`),
      declaration(first, `${OWL}IrreflexiveProperty`),
      declaration(first, `${OWL}SymmetricProperty`),
      declaration(first, `${OWL}AsymmetricProperty`),
      declaration(first, `${OWL}TransitiveProperty`),
    );

    const { ontology } = await new RdfToOwlTranslator().translate(input);
    const kinds = [
      OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM,
      OWLObjectKind.SUB_PROPERTY_CHAIN_AXIOM,
      OWLObjectKind.EQUIVALENT_OBJECT_PROPERTIES_AXIOM,
      OWLObjectKind.DISJOINT_OBJECT_PROPERTIES_AXIOM,
      OWLObjectKind.OBJECT_PROPERTY_DOMAIN_AXIOM,
      OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM,
      OWLObjectKind.INVERSE_OBJECT_PROPERTIES_AXIOM,
      OWLObjectKind.FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
      OWLObjectKind.INVERSE_FUNCTIONAL_OBJECT_PROPERTY_AXIOM,
      OWLObjectKind.REFLEXIVE_OBJECT_PROPERTY_AXIOM,
      OWLObjectKind.IRREFLEXIVE_OBJECT_PROPERTY_AXIOM,
      OWLObjectKind.SYMMETRIC_OBJECT_PROPERTY_AXIOM,
      OWLObjectKind.ASYMMETRIC_OBJECT_PROPERTY_AXIOM,
      OWLObjectKind.TRANSITIVE_OBJECT_PROPERTY_AXIOM,
    ];
    for (const kind of kinds) {
      expectAxiomCount(
        ontology,
        kind,
        kind === OWLObjectKind.DISJOINT_OBJECT_PROPERTIES_AXIOM ? 2 : 1,
      );
    }
    const disjoint = [
      ...ontology.getAxiomsByType(
        OWLObjectKind.DISJOINT_OBJECT_PROPERTIES_AXIOM,
      ),
    ].find(({ properties }) => properties.length === 3);
    expect(disjoint.properties).toHaveLength(3);
    const [chainAxiom] = ontology.getAxiomsByType(
      OWLObjectKind.SUB_PROPERTY_CHAIN_AXIOM,
    );
    expect(chainAxiom.chain.map(({ iri }) => iri.value)).toEqual([
      first.value,
      third.value,
    ]);
  });

  it("reconstructs data-property, annotation-property, and datatype axioms", async () => {
    const first = nn(`${EX}firstDataProperty`);
    const second = nn(`${EX}secondDataProperty`);
    const third = nn(`${EX}thirdDataProperty`);
    const annotation = nn(`${EX}annotation`);
    const parentAnnotation = nn(`${EX}parentAnnotation`);
    const domain = nn(`${EX}Domain`);
    const datatype = nn(`${XSD}string`);
    const allDisjoint = bn("all-disjoint-data-properties");
    const members = rdfList("disjoint-data-properties", [first, second, third]);
    const input = datasetOf(
      declaration(first, `${OWL}DatatypeProperty`),
      declaration(second, `${OWL}DatatypeProperty`),
      declaration(third, `${OWL}DatatypeProperty`),
      declaration(annotation, `${OWL}AnnotationProperty`),
      declaration(parentAnnotation, `${OWL}AnnotationProperty`),
      declaration(domain, `${OWL}Class`),
      q(first, nn(`${RDFS}subPropertyOf`), second),
      q(first, nn(`${OWL}equivalentProperty`), second),
      q(first, nn(`${OWL}propertyDisjointWith`), third),
      declaration(allDisjoint, `${OWL}AllDisjointProperties`),
      q(allDisjoint, nn(`${OWL}members`), members.head),
      members.quads,
      q(first, nn(`${RDFS}domain`), domain),
      q(first, nn(`${RDFS}range`), datatype),
      declaration(first, `${OWL}FunctionalProperty`),
      q(annotation, nn(`${RDFS}subPropertyOf`), parentAnnotation),
      q(annotation, nn(`${RDFS}domain`), nn(`${EX}AnnotationDomain`)),
      q(annotation, nn(`${RDFS}range`), nn(`${EX}AnnotationRange`)),
    );

    const { ontology } = await new RdfToOwlTranslator().translate(input);
    const kinds = [
      OWLObjectKind.SUB_DATA_PROPERTY_AXIOM,
      OWLObjectKind.EQUIVALENT_DATA_PROPERTIES_AXIOM,
      OWLObjectKind.DISJOINT_DATA_PROPERTIES_AXIOM,
      OWLObjectKind.DATA_PROPERTY_DOMAIN_AXIOM,
      OWLObjectKind.DATA_PROPERTY_RANGE_AXIOM,
      OWLObjectKind.FUNCTIONAL_DATA_PROPERTY_AXIOM,
      OWLObjectKind.SUB_ANNOTATION_PROPERTY_AXIOM,
      OWLObjectKind.ANNOTATION_PROPERTY_DOMAIN_AXIOM,
      OWLObjectKind.ANNOTATION_PROPERTY_RANGE_AXIOM,
    ];
    for (const kind of kinds) {
      expectAxiomCount(
        ontology,
        kind,
        kind === OWLObjectKind.DISJOINT_DATA_PROPERTIES_AXIOM ? 2 : 1,
      );
    }
    const disjoint = [
      ...ontology.getAxiomsByType(OWLObjectKind.DISJOINT_DATA_PROPERTIES_AXIOM),
    ].find(({ properties }) => properties.length === 3);
    expect(disjoint.properties).toHaveLength(3);
  });

  it("recovers an OWL Full data-property range encoded as a class only in compatible mode", async () => {
    const property = nn(`${EX}legacyDataProperty`);
    const range = bn("legacy-class-range");
    const rangeMember = nn(`${EX}LegacyBoolean`);
    const members = rdfList("legacy-class-range-members", [rangeMember]);
    const input = datasetOf(
      declaration(property, `${OWL}DatatypeProperty`),
      declaration(range, `${OWL}Class`),
      declaration(rangeMember, `${OWL}Class`),
      q(range, nn(`${OWL}unionOf`), members.head),
      members.quads,
      q(property, nn(`${RDFS}range`), range),
    );

    await expect(
      new RdfToOwlTranslator().translate(input),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });

    const { context, ontology } = await new RdfToOwlTranslator().translate(
      input,
      {
        configuration: { parsingMode: "compatible" },
      },
    );
    const [rangeAxiom] = ontology.getAxiomsByType(
      OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM,
    );

    expectAxiomCount(ontology, OWLObjectKind.DATA_PROPERTY_RANGE_AXIOM, 0);
    expect(rangeAxiom).toMatchObject({
      property: { iri: { value: property.value } },
      range: { iri: { value: rangeMember.value } },
    });
    expect(context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RDF_OWL_FULL_DATA_PROPERTY_RANGE_AS_CLASS",
        property: property.value,
        severity: "warning",
      }),
    );
  });

  it("keeps lax super-property inference local to each compatible axiom", async () => {
    const objectProperty = nn(`${EX}objectChild`);
    const dataProperty = nn(`${EX}dataChild`);
    const sharedSuperProperty = nn(`${EX}sharedSuperProperty`);
    const secondObjectProperty = nn(`${EX}secondObjectChild`);
    const secondDataProperty = nn(`${EX}secondDataChild`);
    const secondSharedSuperProperty = nn(`${EX}secondSharedSuperProperty`);
    const input = datasetOf(
      declaration(objectProperty, `${OWL}ObjectProperty`),
      declaration(dataProperty, `${OWL}DatatypeProperty`),
      declaration(secondObjectProperty, `${OWL}ObjectProperty`),
      declaration(secondDataProperty, `${OWL}DatatypeProperty`),
      q(objectProperty, nn(`${RDFS}subPropertyOf`), sharedSuperProperty),
      q(dataProperty, nn(`${RDFS}subPropertyOf`), sharedSuperProperty),
      q(
        secondDataProperty,
        nn(`${RDFS}subPropertyOf`),
        secondSharedSuperProperty,
      ),
      q(
        secondObjectProperty,
        nn(`${RDFS}subPropertyOf`),
        secondSharedSuperProperty,
      ),
    );

    await expect(
      new RdfToOwlTranslator().translate(input),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });

    const { context, ontology } = await new RdfToOwlTranslator().translate(
      input,
      {
        configuration: { parsingMode: "compatible" },
      },
    );

    expectAxiomCount(ontology, OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM, 2);
    expectAxiomCount(ontology, OWLObjectKind.SUB_DATA_PROPERTY_AXIOM, 2);
    expect(context.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "RDF_PROPERTY_CATEGORY_REUSE",
          iri: sharedSuperProperty.value,
          requestedCategory: "data",
          severity: "warning",
        }),
        expect.objectContaining({
          code: "RDF_PROPERTY_CATEGORY_REUSE",
          iri: secondSharedSuperProperty.value,
          requestedCategory: "data",
          severity: "warning",
        }),
      ]),
    );
  });

  it("preserves annotation precedence when OWL Full reuses an annotation property", async () => {
    const objectProperty = nn(`${EX}objectChild`);
    const subject = nn(`${EX}Subject`);
    const label = nn(`${RDFS}label`);
    const input = datasetOf(
      declaration(objectProperty, `${OWL}ObjectProperty`),
      declaration(subject, `${OWL}Class`),
      q(objectProperty, nn(`${RDFS}subPropertyOf`), label),
      q(subject, label, literal("subject label", "en")),
    );

    await expect(
      new RdfToOwlTranslator().translate(input),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });

    const { context, ontology } = await new RdfToOwlTranslator().translate(
      input,
      {
        configuration: { parsingMode: "compatible" },
      },
    );

    // Precedence is preserved for the sub-property axiom too, not only for the
    // assertion. Building it would have defined OPE(rdfs:label) for an IRI that
    // already has AP(rdfs:label), which is the pairing the typing constraints
    // quoted in ADR 0005 forbid, and it drew `rdfs:label` as a property node of
    // its own in `schemaorg.owl`. The axiom-local reuse recovery still applies
    // to the evidenced `data` against `object` pair; it no longer manufactures
    // an object property out of an annotation property.
    expectAxiomCount(ontology, OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM, 0);
    expectAxiomCount(ontology, OWLObjectKind.ANNOTATION_ASSERTION_AXIOM);
    expectAxiomCount(
      ontology,
      OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM,
      0,
    );
    expect(context.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "RDF_CROSS_CATEGORY_SUBPROPERTY",
        subProperty: objectProperty.value,
        superProperty: label.value,
        severity: "warning",
      }),
    );
  });

  it("reconstructs keys, positive assertions, negative assertions, and n-ary individual axioms", async () => {
    const owlClass = nn(`${EX}Person`);
    const objectProperty = nn(`${EX}knows`);
    const dataProperty = nn(`${EX}age`);
    const annotationProperty = nn(`${EX}note`);
    const first = nn(`${EX}first`);
    const second = nn(`${EX}second`);
    const third = bn("third-individual");
    const age = literal("42", nn(`${XSD}integer`));
    const keyProperties = rdfList("key-properties", [
      objectProperty,
      dataProperty,
    ]);
    const allDifferent = bn("all-different");
    const differentMembers = rdfList("different-individuals", [
      first,
      second,
      third,
    ]);
    const negativeObject = bn("negative-object");
    const negativeData = bn("negative-data");
    const input = datasetOf(
      declaration(owlClass, `${OWL}Class`),
      declaration(objectProperty, `${OWL}ObjectProperty`),
      declaration(dataProperty, `${OWL}DatatypeProperty`),
      declaration(annotationProperty, `${OWL}AnnotationProperty`),
      declaration(first, `${OWL}NamedIndividual`),
      declaration(second, `${OWL}NamedIndividual`),
      q(owlClass, nn(`${OWL}hasKey`), keyProperties.head),
      keyProperties.quads,
      q(first, nn(`${RDF}type`), owlClass),
      q(first, objectProperty, second),
      q(first, dataProperty, age),
      q(first, annotationProperty, literal("assertion annotation", "en")),
      q(first, nn(`${OWL}sameAs`), second),
      q(first, nn(`${OWL}differentFrom`), second),
      declaration(allDifferent, `${OWL}AllDifferent`),
      q(allDifferent, nn(`${OWL}distinctMembers`), differentMembers.head),
      differentMembers.quads,
      declaration(negativeObject, `${OWL}NegativePropertyAssertion`),
      q(negativeObject, nn(`${OWL}sourceIndividual`), first),
      q(negativeObject, nn(`${OWL}assertionProperty`), objectProperty),
      q(negativeObject, nn(`${OWL}targetIndividual`), second),
      declaration(negativeData, `${OWL}NegativePropertyAssertion`),
      q(negativeData, nn(`${OWL}sourceIndividual`), first),
      q(negativeData, nn(`${OWL}assertionProperty`), dataProperty),
      q(negativeData, nn(`${OWL}targetValue`), age),
    );

    const { ontology } = await new RdfToOwlTranslator().translate(input);
    const kinds = [
      OWLObjectKind.HAS_KEY_AXIOM,
      OWLObjectKind.CLASS_ASSERTION_AXIOM,
      OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM,
      OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM,
      OWLObjectKind.ANNOTATION_ASSERTION_AXIOM,
      OWLObjectKind.SAME_INDIVIDUAL_AXIOM,
      OWLObjectKind.NEGATIVE_OBJECT_PROPERTY_ASSERTION_AXIOM,
      OWLObjectKind.NEGATIVE_DATA_PROPERTY_ASSERTION_AXIOM,
    ];
    for (const kind of kinds) {
      expectAxiomCount(ontology, kind);
    }
    expectAxiomCount(ontology, OWLObjectKind.DIFFERENT_INDIVIDUALS_AXIOM, 2);
    const [key] = ontology.getAxiomsByType(OWLObjectKind.HAS_KEY_AXIOM);
    expect(key.objectProperties).toHaveLength(1);
    expect(key.dataProperties).toHaveLength(1);
    const naryDifferent = [
      ...ontology.getAxiomsByType(OWLObjectKind.DIFFERENT_INDIVIDUALS_AXIOM),
    ].find(({ individuals }) => individuals.length === 3);
    expect(naryDifferent.individuals).toHaveLength(3);
  });

  it("attaches reified annotations to the base axiom instead of publishing an unannotated duplicate", async () => {
    const first = nn(`${EX}First`);
    const second = nn(`${EX}Second`);
    const axiomNode = bn("annotated-axiom");
    const input = datasetOf(
      declaration(first, `${OWL}Class`),
      declaration(second, `${OWL}Class`),
      q(first, nn(`${RDFS}subClassOf`), second),
      declaration(axiomNode, `${OWL}Axiom`),
      q(axiomNode, nn(`${OWL}annotatedSource`), first),
      q(axiomNode, nn(`${OWL}annotatedProperty`), nn(`${RDFS}subClassOf`)),
      q(axiomNode, nn(`${OWL}annotatedTarget`), second),
      q(axiomNode, nn(`${RDFS}comment`), literal("reviewed", "en")),
    );

    const { ontology } = await new RdfToOwlTranslator().translate(input);
    const axioms = [
      ...ontology.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM),
    ];

    expect(axioms).toHaveLength(1);
    expect(axioms[0].annotations).toEqual([
      expect.objectContaining({
        property: expect.objectContaining({
          iri: expect.objectContaining({ value: `${RDFS}comment` }),
        }),
        value: expect.objectContaining({
          language: "en",
          lexicalForm: "reviewed",
        }),
      }),
    ]);
  });
});
