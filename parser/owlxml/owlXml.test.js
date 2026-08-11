import { StringDocumentSource } from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { OWLParserRegistry } from "../../manager/parserRegistry.js";
import { AXIOM_KINDS, OWLObjectKind } from "../../model/index.js";

import { owlXmlParserDescriptor } from "./descriptor.js";

const OWL_NAMESPACE = "http://www.w3.org/2002/07/owl#";

describe("OWL/XML", () => {
  it("positively detects a bounded OWL/XML document", () => {
    const registry = new OWLParserRegistry([owlXmlParserDescriptor]);
    const source = new StringDocumentSource(
      `<?xml version="1.0"?><Ontology xmlns="${OWL_NAMESPACE}"/>`,
      { fileName: "empty.owl" },
    );

    const [candidate] = registry.resolveCandidates(source);

    expect(candidate.detection).toEqual({
      reason: "An OWL/XML Ontology root element was found",
      reasonCode: "OWLXML_ONTOLOGY_ROOT",
      result: "MATCH",
    });
    expect(candidate.eligible).toBe(true);
  });

  it("detects an OWL namespace supplied by a bounded internal entity", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    const ontology = await manager.loadOntologyFromOntologyDocument(`
      <!DOCTYPE Ontology [<!ENTITY owl "${OWL_NAMESPACE}">]>
      <Ontology xmlns="&owl;"/>
    `);

    expect(ontology.getAxioms()).toHaveProperty("size", 0);
  });

  it("does not claim an RDF/XML document", () => {
    const registry = new OWLParserRegistry([owlXmlParserDescriptor]);
    const source = new StringDocumentSource(`
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
        <owl:Ontology xmlns:owl="${OWL_NAMESPACE}" rdf:about="urn:test"/>
      </rdf:RDF>
    `);

    const [candidate] = registry.resolveCandidates(source);

    expect(candidate.detection).toMatchObject({
      reasonCode: "OWLXML_RDFXML_ROOT",
      result: "NO_MATCH",
    });
    expect(candidate.eligible).toBe(false);
  });

  it("loads an empty anonymous ontology through the public manager", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    const ontology = await manager.loadOntologyFromOntologyDocument(
      `<Ontology xmlns="${OWL_NAMESPACE}"/>`,
    );

    expect(ontology.getOntologyID().ontologyIRI).toBeUndefined();
    expect(ontology.getOntologyID().versionIRI).toBeUndefined();
    expect(ontology.getAxioms()).toHaveProperty("size", 0);
    expect(ontology.getAnnotations()).toHaveProperty("size", 0);
    expect(ontology.getImportsDeclarations()).toHaveProperty("size", 0);
  });

  it("preserves scoped IRIs, prefixes, imports, annotations, and declarations", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        load: async () =>
          `<Ontology xmlns="${OWL_NAMESPACE}" ontologyIRI="https://example.com/imports/other"/>`,
      },
    });
    const ontology = await manager.loadOntologyFromOntologyDocument(
      `
        <Ontology xmlns="${OWL_NAMESPACE}"
          xml:base="https://example.com/base/"
          xml:lang="EN"
          ontologyIRI="ontology"
          versionIRI="versions/1">
          <Prefix name="ex" IRI="vocab#"/>
          <Import xml:base="../imports/">other</Import>
          <Annotation>
            <Annotation>
              <AnnotationProperty abbreviatedIRI="ex:source"/>
              <IRI xml:base="../annotations/">origin</IRI>
            </Annotation>
            <AnnotationProperty abbreviatedIRI="ex:label"/>
            <Literal>Ontology label</Literal>
          </Annotation>
          <Declaration>
            <Annotation>
              <AnnotationProperty abbreviatedIRI="ex:note"/>
              <Literal xml:lang="" datatypeIRI="http://www.w3.org/2001/XMLSchema#anyURI">relative/value</Literal>
            </Annotation>
            <Class abbreviatedIRI="ex:Person"/>
          </Declaration>
          <Declaration><Datatype abbreviatedIRI="ex:Code"/></Declaration>
          <Declaration><ObjectProperty abbreviatedIRI="ex:knows"/></Declaration>
          <Declaration><DataProperty abbreviatedIRI="ex:age"/></Declaration>
          <Declaration><AnnotationProperty abbreviatedIRI="ex:note"/></Declaration>
          <Declaration><NamedIndividual abbreviatedIRI="ex:Ada"/></Declaration>
        </Ontology>
      `,
      { remoteImports: true },
    );

    expect(ontology.getOntologyID().ontologyIRI.value).toBe(
      "https://example.com/base/ontology",
    );
    expect(ontology.getOntologyID().versionIRI.value).toBe(
      "https://example.com/base/versions/1",
    );
    expect([...ontology.getImportsDeclarations()][0].iri.value).toBe(
      "https://example.com/imports/other",
    );

    const [annotation] = ontology.getAnnotations();
    expect(annotation.property.iri.value).toBe(
      "https://example.com/base/vocab#label",
    );
    expect(annotation.value.lexicalForm).toBe("Ontology label");
    expect(annotation.value.language).toBe("en");
    expect([...annotation.annotations][0].value.value).toBe(
      "https://example.com/annotations/origin",
    );

    const declarations = ontology.getAxiomsByType(
      OWLObjectKind.DECLARATION_AXIOM,
    );
    expect(declarations).toHaveProperty("size", 6);
    const classDeclaration = [...declarations].find(
      ({ entity }) => entity.kind === OWLObjectKind.CLASS,
    );
    expect(classDeclaration.entity.iri.value).toBe(
      "https://example.com/base/vocab#Person",
    );
    expect([...classDeclaration.annotations][0].value.lexicalForm).toBe(
      "relative/value",
    );
  });

  it("preserves non-ASCII characters while resolving XML Base IRIs", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      <Ontology xmlns="${OWL_NAMESPACE}" xml:base="https://example.com/rosé/">
        <Declaration><Class IRI="élément"/></Declaration>
      </Ontology>
    `);

    const [declaration] = ontology.getAxiomsByType(
      OWLObjectKind.DECLARATION_AXIOM,
    );
    expect(declaration.entity.iri.value).toBe(
      "https://example.com/rosé/élément",
    );
  });

  it("accepts the complete Unicode-capable XML NCName shape for node IDs", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      <Ontology xmlns="${OWL_NAMESPACE}">
        <SameIndividual>
          <AnonymousIndividual nodeID="élève"/>
          <AnonymousIndividual nodeID="δεύτερο"/>
        </SameIndividual>
      </Ontology>
    `);

    const [axiom] = ontology.getAxiomsByType(
      OWLObjectKind.SAME_INDIVIDUAL_AXIOM,
    );
    expect(axiom.individuals.map(({ nodeID }) => nodeID).sort()).toEqual([
      "_:élève",
      "_:δεύτερο",
    ]);
  });

  it("constructs every OWL/XML object class expression", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      <Ontology xmlns="${OWL_NAMESPACE}">
        <Prefix name="" IRI="urn:test:"/>
        <SubClassOf><Class abbreviatedIRI=":A"/><ObjectIntersectionOf><Class abbreviatedIRI=":B"/><Class abbreviatedIRI=":C"/></ObjectIntersectionOf></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><ObjectUnionOf><Class abbreviatedIRI=":B"/><Class abbreviatedIRI=":C"/></ObjectUnionOf></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><ObjectComplementOf><Class abbreviatedIRI=":B"/></ObjectComplementOf></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><ObjectOneOf><NamedIndividual abbreviatedIRI=":i"/><AnonymousIndividual nodeID="anon"/></ObjectOneOf></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><ObjectSomeValuesFrom><ObjectInverseOf><ObjectProperty abbreviatedIRI=":p"/></ObjectInverseOf><Class abbreviatedIRI=":B"/></ObjectSomeValuesFrom></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><ObjectAllValuesFrom><ObjectProperty abbreviatedIRI=":p"/><Class abbreviatedIRI=":B"/></ObjectAllValuesFrom></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><ObjectHasValue><ObjectProperty abbreviatedIRI=":p"/><NamedIndividual abbreviatedIRI=":i"/></ObjectHasValue></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><ObjectHasSelf><ObjectProperty abbreviatedIRI=":p"/></ObjectHasSelf></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><ObjectMinCardinality cardinality="1"><ObjectProperty abbreviatedIRI=":p"/><Class abbreviatedIRI=":B"/></ObjectMinCardinality></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><ObjectMaxCardinality cardinality="2"><ObjectProperty abbreviatedIRI=":p"/></ObjectMaxCardinality></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><ObjectExactCardinality cardinality="3"><ObjectProperty abbreviatedIRI=":p"/><Class abbreviatedIRI=":B"/></ObjectExactCardinality></SubClassOf>
      </Ontology>
    `);

    const superClasses = [
      ...ontology.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM),
    ].map(({ superClass }) => superClass);
    expect(superClasses.map(({ kind }) => kind).sort()).toEqual(
      [
        OWLObjectKind.OBJECT_ALL_VALUES_FROM,
        OWLObjectKind.OBJECT_COMPLEMENT_OF,
        OWLObjectKind.OBJECT_EXACT_CARDINALITY,
        OWLObjectKind.OBJECT_HAS_SELF,
        OWLObjectKind.OBJECT_HAS_VALUE,
        OWLObjectKind.OBJECT_INTERSECTION_OF,
        OWLObjectKind.OBJECT_MAX_CARDINALITY,
        OWLObjectKind.OBJECT_MIN_CARDINALITY,
        OWLObjectKind.OBJECT_ONE_OF,
        OWLObjectKind.OBJECT_SOME_VALUES_FROM,
        OWLObjectKind.OBJECT_UNION_OF,
      ].sort(),
    );
    const inverseRestriction = superClasses.find(
      ({ kind }) => kind === OWLObjectKind.OBJECT_SOME_VALUES_FROM,
    );
    expect(inverseRestriction.property.kind).toBe(
      OWLObjectKind.OBJECT_INVERSE_OF,
    );
    const hasValue = superClasses.find(
      ({ kind }) => kind === OWLObjectKind.OBJECT_HAS_VALUE,
    );
    expect(hasValue.individual.kind).toBe(OWLObjectKind.NAMED_INDIVIDUAL);
    const unqualified = superClasses.find(
      ({ kind }) => kind === OWLObjectKind.OBJECT_MAX_CARDINALITY,
    );
    expect(unqualified.filler.iri.value).toBe(
      "http://www.w3.org/2002/07/owl#Thing",
    );
  });

  it("constructs data restrictions and every OWL/XML data range", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      <Ontology xmlns="${OWL_NAMESPACE}">
        <Prefix name="" IRI="urn:test:"/>
        <Prefix name="xsd" IRI="http://www.w3.org/2001/XMLSchema#"/>
        <SubClassOf><Class abbreviatedIRI=":A"/><DataSomeValuesFrom><DataProperty abbreviatedIRI=":p"/><DataProperty abbreviatedIRI=":q"/><DataIntersectionOf><Datatype abbreviatedIRI="xsd:string"/><Datatype abbreviatedIRI="xsd:integer"/></DataIntersectionOf></DataSomeValuesFrom></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><DataAllValuesFrom><DataProperty abbreviatedIRI=":p"/><DataUnionOf><Datatype abbreviatedIRI="xsd:string"/><Datatype abbreviatedIRI="xsd:integer"/></DataUnionOf></DataAllValuesFrom></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><DataHasValue><DataProperty abbreviatedIRI=":p"/><Literal xml:lang="en">hello</Literal></DataHasValue></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><DataMinCardinality cardinality="1"><DataProperty abbreviatedIRI=":p"/><DataComplementOf><Datatype abbreviatedIRI="xsd:integer"/></DataComplementOf></DataMinCardinality></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><DataMaxCardinality cardinality="2"><DataProperty abbreviatedIRI=":p"/></DataMaxCardinality></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><DataExactCardinality cardinality="3"><DataProperty abbreviatedIRI=":p"/><DataOneOf><Literal>a</Literal><Literal datatypeIRI="http://www.w3.org/2001/XMLSchema#string">b</Literal></DataOneOf></DataExactCardinality></SubClassOf>
        <SubClassOf><Class abbreviatedIRI=":A"/><DataSomeValuesFrom><DataProperty abbreviatedIRI=":p"/><DatatypeRestriction><Datatype abbreviatedIRI="xsd:integer"/><FacetRestriction facet="http://www.w3.org/2001/XMLSchema#minInclusive"><Literal datatypeIRI="http://www.w3.org/2001/XMLSchema#integer">0</Literal></FacetRestriction><FacetRestriction facet="http://www.w3.org/2001/XMLSchema#maxInclusive"><Literal datatypeIRI="http://www.w3.org/2001/XMLSchema#integer">10</Literal></FacetRestriction></DatatypeRestriction></DataSomeValuesFrom></SubClassOf>
      </Ontology>
    `);

    const superClasses = [
      ...ontology.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM),
    ].map(({ superClass }) => superClass);
    expect(superClasses.map(({ kind }) => kind).sort()).toEqual(
      [
        OWLObjectKind.DATA_ALL_VALUES_FROM,
        OWLObjectKind.DATA_EXACT_CARDINALITY,
        OWLObjectKind.DATA_HAS_VALUE,
        OWLObjectKind.DATA_MAX_CARDINALITY,
        OWLObjectKind.DATA_MIN_CARDINALITY,
        OWLObjectKind.DATA_SOME_VALUES_FROM,
        OWLObjectKind.DATA_SOME_VALUES_FROM,
      ].sort(),
    );
    const multiProperty = superClasses.find(
      ({ filler, kind }) =>
        kind === OWLObjectKind.DATA_SOME_VALUES_FROM &&
        filler.kind === OWLObjectKind.DATA_INTERSECTION_OF,
    );
    expect(multiProperty.properties.map(({ iri }) => iri.value)).toEqual([
      "urn:test:p",
      "urn:test:q",
    ]);
    const unqualified = superClasses.find(
      ({ kind }) => kind === OWLObjectKind.DATA_MAX_CARDINALITY,
    );
    expect(unqualified.filler.iri.value).toBe(
      "http://www.w3.org/2000/01/rdf-schema#Literal",
    );
    const restricted = superClasses.find(
      ({ filler }) => filler?.kind === OWLObjectKind.DATATYPE_RESTRICTION,
    );
    expect(restricted.filler.facetRestrictions).toHaveLength(2);
  });

  it("constructs every required OWL/XML axiom family", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      <Ontology xmlns="${OWL_NAMESPACE}">
        <Prefix name="" IRI="urn:test:"/>
        <Prefix name="xsd" IRI="http://www.w3.org/2001/XMLSchema#"/>
        <Declaration><Class abbreviatedIRI=":A"/></Declaration>
        <SubClassOf><Annotation><AnnotationProperty abbreviatedIRI=":note"/><Literal>annotated</Literal></Annotation><Class abbreviatedIRI=":A"/><Class abbreviatedIRI=":B"/></SubClassOf>
        <EquivalentClasses><Class abbreviatedIRI=":A"/><Class abbreviatedIRI=":B"/></EquivalentClasses>
        <DisjointClasses><Class abbreviatedIRI=":A"/><Class abbreviatedIRI=":B"/></DisjointClasses>
        <DisjointUnion><Class abbreviatedIRI=":A"/><Class abbreviatedIRI=":B"/><Class abbreviatedIRI=":C"/></DisjointUnion>

        <SubObjectPropertyOf><ObjectProperty abbreviatedIRI=":p"/><ObjectProperty abbreviatedIRI=":q"/></SubObjectPropertyOf>
        <SubObjectPropertyOf><ObjectPropertyChain><ObjectProperty abbreviatedIRI=":p"/><ObjectProperty abbreviatedIRI=":q"/></ObjectPropertyChain><ObjectProperty abbreviatedIRI=":r"/></SubObjectPropertyOf>
        <EquivalentObjectProperties><ObjectProperty abbreviatedIRI=":p"/><ObjectProperty abbreviatedIRI=":q"/></EquivalentObjectProperties>
        <DisjointObjectProperties><ObjectProperty abbreviatedIRI=":p"/><ObjectProperty abbreviatedIRI=":q"/></DisjointObjectProperties>
        <InverseObjectProperties><ObjectProperty abbreviatedIRI=":p"/><ObjectProperty abbreviatedIRI=":q"/></InverseObjectProperties>
        <ObjectPropertyDomain><ObjectProperty abbreviatedIRI=":p"/><Class abbreviatedIRI=":A"/></ObjectPropertyDomain>
        <ObjectPropertyRange><ObjectProperty abbreviatedIRI=":p"/><Class abbreviatedIRI=":B"/></ObjectPropertyRange>
        <FunctionalObjectProperty><ObjectProperty abbreviatedIRI=":p"/></FunctionalObjectProperty>
        <InverseFunctionalObjectProperty><ObjectProperty abbreviatedIRI=":p"/></InverseFunctionalObjectProperty>
        <ReflexiveObjectProperty><ObjectProperty abbreviatedIRI=":p"/></ReflexiveObjectProperty>
        <IrreflexiveObjectProperty><ObjectProperty abbreviatedIRI=":p"/></IrreflexiveObjectProperty>
        <SymmetricObjectProperty><ObjectProperty abbreviatedIRI=":p"/></SymmetricObjectProperty>
        <AsymmetricObjectProperty><ObjectProperty abbreviatedIRI=":p"/></AsymmetricObjectProperty>
        <TransitiveObjectProperty><ObjectProperty abbreviatedIRI=":p"/></TransitiveObjectProperty>

        <SubDataPropertyOf><DataProperty abbreviatedIRI=":d"/><DataProperty abbreviatedIRI=":e"/></SubDataPropertyOf>
        <EquivalentDataProperties><DataProperty abbreviatedIRI=":d"/><DataProperty abbreviatedIRI=":e"/></EquivalentDataProperties>
        <DisjointDataProperties><DataProperty abbreviatedIRI=":d"/><DataProperty abbreviatedIRI=":e"/></DisjointDataProperties>
        <DataPropertyDomain><DataProperty abbreviatedIRI=":d"/><Class abbreviatedIRI=":A"/></DataPropertyDomain>
        <DataPropertyRange><DataProperty abbreviatedIRI=":d"/><Datatype abbreviatedIRI="xsd:integer"/></DataPropertyRange>
        <FunctionalDataProperty><DataProperty abbreviatedIRI=":d"/></FunctionalDataProperty>
        <DatatypeDefinition><Datatype abbreviatedIRI=":Code"/><DataOneOf><Literal>x</Literal><Literal>y</Literal></DataOneOf></DatatypeDefinition>
        <HasKey><Class abbreviatedIRI=":A"/><ObjectProperty abbreviatedIRI=":p"/><ObjectProperty abbreviatedIRI=":q"/><DataProperty abbreviatedIRI=":d"/><DataProperty abbreviatedIRI=":e"/></HasKey>

        <SameIndividual><NamedIndividual abbreviatedIRI=":i"/><NamedIndividual abbreviatedIRI=":j"/></SameIndividual>
        <DifferentIndividuals><NamedIndividual abbreviatedIRI=":i"/><NamedIndividual abbreviatedIRI=":j"/></DifferentIndividuals>
        <ClassAssertion><Class abbreviatedIRI=":A"/><NamedIndividual abbreviatedIRI=":i"/></ClassAssertion>
        <ObjectPropertyAssertion><ObjectProperty abbreviatedIRI=":p"/><NamedIndividual abbreviatedIRI=":i"/><NamedIndividual abbreviatedIRI=":j"/></ObjectPropertyAssertion>
        <NegativeObjectPropertyAssertion><ObjectProperty abbreviatedIRI=":p"/><NamedIndividual abbreviatedIRI=":i"/><NamedIndividual abbreviatedIRI=":j"/></NegativeObjectPropertyAssertion>
        <DataPropertyAssertion><DataProperty abbreviatedIRI=":d"/><NamedIndividual abbreviatedIRI=":i"/><Literal datatypeIRI="http://www.w3.org/2001/XMLSchema#integer">1</Literal></DataPropertyAssertion>
        <NegativeDataPropertyAssertion><DataProperty abbreviatedIRI=":d"/><NamedIndividual abbreviatedIRI=":i"/><Literal datatypeIRI="http://www.w3.org/2001/XMLSchema#integer">2</Literal></NegativeDataPropertyAssertion>

        <AnnotationAssertion><Annotation><AnnotationProperty abbreviatedIRI=":note"/><Literal>meta</Literal></Annotation><AnnotationProperty abbreviatedIRI=":note"/><AbbreviatedIRI>:A</AbbreviatedIRI><Literal>value</Literal></AnnotationAssertion>
        <SubAnnotationPropertyOf><AnnotationProperty abbreviatedIRI=":note"/><AnnotationProperty abbreviatedIRI=":superNote"/></SubAnnotationPropertyOf>
        <AnnotationPropertyDomain><AnnotationProperty abbreviatedIRI=":note"/><IRI>urn:test:domain</IRI></AnnotationPropertyDomain>
        <AnnotationPropertyRange><AnnotationProperty abbreviatedIRI=":note"/><IRI>urn:test:range</IRI></AnnotationPropertyRange>
      </Ontology>
    `);

    expect([...ontology.getAxioms()].map(({ kind }) => kind).sort()).toEqual(
      [...AXIOM_KINDS].sort(),
    );
    const [chain] = ontology.getAxiomsByType(
      OWLObjectKind.SUB_PROPERTY_CHAIN_AXIOM,
    );
    expect(chain.chain.map(({ iri }) => iri.value)).toEqual([
      "urn:test:p",
      "urn:test:q",
    ]);
  });

  it("allows complex class expressions on both sides of SubClassOf", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      <Ontology xmlns="${OWL_NAMESPACE}">
        <Prefix name="" IRI="urn:test:"/>
        <SubClassOf>
          <ObjectIntersectionOf>
            <Class abbreviatedIRI=":A"/>
            <Class abbreviatedIRI=":B"/>
          </ObjectIntersectionOf>
          <ObjectSomeValuesFrom>
            <ObjectInverseOf><ObjectProperty abbreviatedIRI=":p"/></ObjectInverseOf>
            <ObjectUnionOf>
              <Class abbreviatedIRI=":C"/>
              <Class abbreviatedIRI=":D"/>
            </ObjectUnionOf>
          </ObjectSomeValuesFrom>
        </SubClassOf>
      </Ontology>
    `);

    const [axiom] = ontology.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM);
    expect(axiom.subClass.kind).toBe(OWLObjectKind.OBJECT_INTERSECTION_OF);
    expect(axiom.superClass.kind).toBe(OWLObjectKind.OBJECT_SOME_VALUES_FROM);
    expect(axiom.superClass.filler.kind).toBe(OWLObjectKind.OBJECT_UNION_OF);
  });

  it("keeps OWL prefixes separate from XML namespace declarations", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    await expect(
      manager.loadOntologyFromOntologyDocument(`
        <Ontology xmlns="${OWL_NAMESPACE}" xmlns:ex="urn:test:">
          <Declaration><Class abbreviatedIRI="ex:A"/></Declaration>
        </Ontology>
      `),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      prefixName: "ex",
    });
  });

  it("implements the Unicode-capable OWL/XML prefix-name grammar", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      <Ontology xmlns="${OWL_NAMESPACE}">
        <Prefix name="éx" IRI="urn:test:"/>
        <Declaration><Class abbreviatedIRI="éx:Δ"/></Declaration>
      </Ontology>
    `);

    const [declaration] = ontology.getAxiomsByType(
      OWLObjectKind.DECLARATION_AXIOM,
    );
    expect(declaration.entity.iri.value).toBe("urn:test:Δ");
  });

  it.each([
    {
      document: `<Ontology xmlns="${OWL_NAMESPACE}"><Prefix name="ex" IRI="urn:test:"/><Prefix name="ex" IRI="urn:other:"/></Ontology>`,
      expected: { prefixName: "ex" },
    },
    {
      document: `<Ontology xmlns="${OWL_NAMESPACE}"><Prefix name="ex" IRI="urn:test:"/><Declaration><Class IRI="urn:test:A" abbreviatedIRI="ex:A"/></Declaration></Ontology>`,
      expected: { construct: "Class" },
    },
    {
      document: `<Ontology xmlns="${OWL_NAMESPACE}"><SubClassOf><Class IRI="urn:test:A"/><ObjectMinCardinality><ObjectProperty IRI="urn:test:p"/></ObjectMinCardinality></SubClassOf></Ontology>`,
      expected: { attribute: "cardinality" },
    },
    {
      document: `<Ontology xmlns="${OWL_NAMESPACE}"><Declaration><Class IRI="urn:test:A"/></Declaration><Import>urn:test:late</Import></Ontology>`,
      expected: { construct: "Import" },
    },
    {
      document: `<Ontology xmlns="${OWL_NAMESPACE}"><UnknownAxiom/></Ontology>`,
      expected: { construct: "UnknownAxiom" },
    },
    {
      document: `<Ontology xmlns="${OWL_NAMESPACE}"><Prefix name="1bad" IRI="urn:test:"/></Ontology>`,
      expected: { prefixName: "1bad" },
    },
    {
      document: `<Ontology xmlns="${OWL_NAMESPACE}"><Prefix name="_bad" IRI="urn:test:"/></Ontology>`,
      expected: { prefixName: "_bad" },
    },
    {
      document: `<Ontology xmlns="${OWL_NAMESPACE}"><Prefix name="bad." IRI="urn:test:"/></Ontology>`,
      expected: { prefixName: "bad." },
    },
    {
      document: `<Ontology xmlns="${OWL_NAMESPACE}"><Prefix name="ex" IRI="urn:test:"/><Declaration><Class abbreviatedIRI="ex:."/></Declaration></Ontology>`,
      expected: { abbreviatedIRI: "ex:." },
    },
    {
      document: `<Ontology xmlns="${OWL_NAMESPACE}"><Prefix name="ex" IRI="urn:test:"/><Declaration><Class abbreviatedIRI="ex:-bad"/></Declaration></Ontology>`,
      expected: { abbreviatedIRI: "ex:-bad" },
    },
  ])(
    "rejects malformed OWL/XML shapes without recovery",
    async ({ document, expected }) => {
      const manager = OWLManager.createOWLOntologyManager();

      await expect(
        manager.loadOntologyFromOntologyDocument(document),
      ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR", ...expected });
    },
  );

  it("can omit annotation axioms without omitting ontology annotations", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      `
        <Ontology xmlns="${OWL_NAMESPACE}">
          <Annotation><AnnotationProperty IRI="urn:test:label"/><Literal>ontology annotation</Literal></Annotation>
          <Declaration><Class IRI="urn:test:A"/></Declaration>
          <AnnotationAssertion><AnnotationProperty IRI="urn:test:label"/><IRI>urn:test:A</IRI><Literal>axiom annotation</Literal></AnnotationAssertion>
          <SubAnnotationPropertyOf><AnnotationProperty IRI="urn:test:label"/><AnnotationProperty IRI="urn:test:comment"/></SubAnnotationPropertyOf>
          <AnnotationPropertyDomain><AnnotationProperty IRI="urn:test:label"/><IRI>urn:test:domain</IRI></AnnotationPropertyDomain>
          <AnnotationPropertyRange><AnnotationProperty IRI="urn:test:label"/><IRI>urn:test:range</IRI></AnnotationPropertyRange>
        </Ontology>
      `,
      { loadAnnotationAxioms: false },
    );

    expect(ontology.getAnnotations()).toHaveProperty("size", 1);
    expect(ontology.getAxioms()).toHaveProperty("size", 1);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.DECLARATION_AXIOM),
    ).toHaveProperty("size", 1);
  });
});
