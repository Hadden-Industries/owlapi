import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLParserRegistry } from "../../manager/parserRegistry.js";
import { OWLManager } from "../../manager/index.js";
import { AXIOM_KINDS, IRI, OWLObjectKind } from "../../model/index.js";

import { functionalSyntaxParserDescriptor } from "./descriptor.js";

describe("OWL Functional-Style Syntax", () => {
  it("positively detects a bounded Functional document", () => {
    const registry = new OWLParserRegistry([functionalSyntaxParserDescriptor]);
    const source = new StringDocumentSource(
      "# ontology metadata\nPrefix(:=<urn:test:>)\nOntology()",
      { fileName: "example.ofn" },
    );

    const [candidate] = registry.resolveCandidates(source);

    expect(candidate.detection).toEqual({
      reason: "A Functional-Style Syntax prefix declaration was found",
      reasonCode: "FUNCTIONAL_PREFIX",
      result: "MATCH",
    });
    expect(candidate.eligible).toBe(true);
  });

  it("loads an empty anonymous ontology through the public manager", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource("Ontology()", { fileName: "empty.ofn" }),
    );

    expect(ontology.getOntologyID().ontologyIRI).toBeUndefined();
    expect(ontology.getOntologyID().versionIRI).toBeUndefined();
    expect(ontology.getAxioms()).toHaveProperty("size", 0);
    expect(ontology.getAnnotations()).toHaveProperty("size", 0);
    expect(ontology.getImportsDeclarations()).toHaveProperty("size", 0);
  });

  it("preserves ontology metadata, imports, annotations, and declarations", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        load: async () => "Ontology(<urn:test:import>)",
      },
    });
    const source = new StringDocumentSource(`
      Prefix(:=<urn:test:entity:>)
      Ontology(<urn:test:ontology> <urn:test:version>
        Import(<urn:test:import>)
        Annotation(rdfs:label "Ontology label"@EN)
        Declaration(Annotation(rdfs:comment "documented") Class(:Person))
        Declaration(Datatype(:Code))
        Declaration(ObjectProperty(:knows))
        Declaration(DataProperty(:age))
        Declaration(AnnotationProperty(:note))
        Declaration(NamedIndividual(:Ada))
      )
    `);

    const ontology = await manager.loadOntologyFromOntologyDocument(source);

    expect(ontology.getOntologyID().ontologyIRI.value).toBe(
      "urn:test:ontology",
    );
    expect(ontology.getOntologyID().versionIRI.value).toBe("urn:test:version");
    expect([...ontology.getImportsDeclarations()][0].iri.value).toBe(
      "urn:test:import",
    );
    const [annotation] = ontology.getAnnotations();
    expect(annotation.property.iri.value).toBe(
      "http://www.w3.org/2000/01/rdf-schema#label",
    );
    expect(annotation.value.lexicalForm).toBe("Ontology label");
    expect(annotation.value.language).toBe("en");

    const declarations = ontology.getAxiomsByType(
      OWLObjectKind.DECLARATION_AXIOM,
    );
    expect(declarations).toHaveProperty("size", 6);
    const classDeclaration = [...declarations].find(
      ({ entity }) => entity.kind === OWLObjectKind.CLASS,
    );
    expect(classDeclaration.entity.iri.value).toBe("urn:test:entity:Person");
    expect([...classDeclaration.annotations][0].value.lexicalForm).toBe(
      "documented",
    );
  });

  it("preserves Unicode IRIs and the exact Functional literal lexical form", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const source = new StringDocumentSource(
      [
        "Prefix(ex:=<https://example.com/ns#>)",
        "Ontology(",
        'Annotation(ex:note "line one\r\nline two \\"quoted\\" and \\\\ slash")',
        'Annotation(ex:note "42"^^xsd:integer)',
        "Declaration(Class(ex:Δ))",
        "Declaration(Class(ex:escaped\\~name))",
        ")",
      ].join("\n"),
    );

    const ontology = await manager.loadOntologyFromOntologyDocument(source);
    const annotations = [...ontology.getAnnotations()];
    const multiline = annotations.find(({ value }) =>
      value.lexicalForm.startsWith("line one"),
    );
    const integer = annotations.find(({ value }) => value.lexicalForm === "42");

    expect(multiline.value.lexicalForm).toBe(
      'line one\r\nline two "quoted" and \\ slash',
    );
    expect(integer.value.datatype.iri.value).toBe(
      "http://www.w3.org/2001/XMLSchema#integer",
    );
    expect(
      [...ontology.getClassesInSignature()].map(({ iri }) => iri.value).sort(),
    ).toEqual([
      "https://example.com/ns#escaped~name",
      "https://example.com/ns#Δ",
    ]);
  });

  it("constructs every Functional object class expression", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      Prefix(:=<urn:test:>)
      Ontology(
        SubClassOf(:A ObjectIntersectionOf(:B :C))
        SubClassOf(:A ObjectUnionOf(:B :C))
        SubClassOf(:A ObjectComplementOf(:B))
        SubClassOf(:A ObjectOneOf(:i _:anon))
        SubClassOf(:A ObjectSomeValuesFrom(ObjectInverseOf(:p) :B))
        SubClassOf(:A ObjectAllValuesFrom(:p :B))
        SubClassOf(:A ObjectHasValue(:p :i))
        SubClassOf(:A ObjectHasSelf(:p))
        SubClassOf(:A ObjectMinCardinality(1 :p :B))
        SubClassOf(:A ObjectMaxCardinality(2 :p))
        SubClassOf(:A ObjectExactCardinality(3 :p :B))
      )
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
    const unqualified = superClasses.find(
      ({ kind }) => kind === OWLObjectKind.OBJECT_MAX_CARDINALITY,
    );
    expect(unqualified.filler.iri.value).toBe(
      "http://www.w3.org/2002/07/owl#Thing",
    );
  });

  it("constructs data restrictions and every Functional data range", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      Prefix(:=<urn:test:>)
      Ontology(
        SubClassOf(:A DataSomeValuesFrom(:p :q DataIntersectionOf(xsd:string xsd:integer)))
        SubClassOf(:A DataAllValuesFrom(:p DataUnionOf(xsd:string xsd:integer)))
        SubClassOf(:A DataHasValue(:p "hello"@en))
        SubClassOf(:A DataMinCardinality(1 :p DataComplementOf(xsd:integer)))
        SubClassOf(:A DataMaxCardinality(2 :p))
        SubClassOf(:A DataExactCardinality(3 :p DataOneOf("a" "b"^^xsd:string)))
        SubClassOf(:A DataSomeValuesFrom(:p DatatypeRestriction(
          xsd:integer
          xsd:minInclusive "0"^^xsd:integer
          xsd:maxInclusive "10"^^xsd:integer
        )))
      )
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

  it("constructs every required Functional axiom family", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      Prefix(:=<urn:test:>)
      Ontology(
        Declaration(Class(:A))
        SubClassOf(Annotation(:note "annotated") :A :B)
        EquivalentClasses(:A :B)
        DisjointClasses(:A :B)
        DisjointUnion(:A :B :C)

        SubObjectPropertyOf(:p :q)
        SubObjectPropertyOf(ObjectPropertyChain(:p :q) :r)
        EquivalentObjectProperties(:p :q)
        DisjointObjectProperties(:p :q)
        InverseObjectProperties(:p :q)
        ObjectPropertyDomain(:p :A)
        ObjectPropertyRange(:p :B)
        FunctionalObjectProperty(:p)
        InverseFunctionalObjectProperty(:p)
        ReflexiveObjectProperty(:p)
        IrreflexiveObjectProperty(:p)
        SymmetricObjectProperty(:p)
        AsymmetricObjectProperty(:p)
        TransitiveObjectProperty(:p)

        SubDataPropertyOf(:d :e)
        EquivalentDataProperties(:d :e)
        DisjointDataProperties(:d :e)
        DataPropertyDomain(:d :A)
        DataPropertyRange(:d xsd:integer)
        FunctionalDataProperty(:d)
        DatatypeDefinition(:Code DataOneOf("x" "y"))
        HasKey(:A (:p :q) (:d :e))

        SameIndividual(:i :j)
        DifferentIndividuals(:i :j)
        ClassAssertion(:A :i)
        ObjectPropertyAssertion(:p :i :j)
        NegativeObjectPropertyAssertion(:p :i :j)
        DataPropertyAssertion(:d :i "1"^^xsd:integer)
        NegativeDataPropertyAssertion(:d :i "2"^^xsd:integer)

        AnnotationAssertion(Annotation(:note "meta") :note :A "value")
        SubAnnotationPropertyOf(:note :superNote)
        AnnotationPropertyDomain(:note <urn:test:domain>)
        AnnotationPropertyRange(:note <urn:test:range>)
      )
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

  it("limits reserved-prefix recovery to positively recognized compatible loads", async () => {
    const source = `
      Prefix(rdfs:=<http://www.w3.org/2000/01/rdf-schema#>)
      Ontology(Declaration(Class(<urn:test:A>)))
    `;
    const strictManager = OWLManager.createOWLOntologyManager();
    await expect(
      strictManager.loadOntologyFromOntologyDocument(source),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      prefixName: "rdfs:",
    });

    const compatibleManager = OWLManager.createOWLOntologyManager();
    const ontology = await compatibleManager.loadOntologyFromOntologyDocument(
      source,
      new OWLOntologyLoaderConfiguration({ parsingMode: "compatible" }),
    );
    expect(ontology.getClassesInSignature()).toHaveProperty("size", 1);

    const [candidate] = new OWLParserRegistry([
      functionalSyntaxParserDescriptor,
    ]).resolveCandidates(new StringDocumentSource("unrelated content"), {
      parsingMode: "compatible",
    });
    expect(candidate.detection.result).toBe("NO_MATCH");
    expect(candidate.eligible).toBe(false);
  });

  it("honours Functional token boundaries and literal suffix adjacency", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      Prefix(SubClassOf:=<urn:test:keyword-prefix:>)
      Ontology(
        Annotation(rdfs:label "compact"^^xsd:string)
        Annotation(rdfs:label "spaced" ^^ xsd:string)
        Annotation(rdfs:label "language"@en-US)
        Declaration(Class(SubClassOf:ABC))
      )
    `);

    expect([...ontology.getClassesInSignature()][0].iri.value).toBe(
      "urn:test:keyword-prefix:ABC",
    );
    expect(
      [...ontology.getAnnotations()].map(({ value }) => value.lexicalForm),
    ).toEqual(["compact", "spaced", "language"]);

    await expect(
      manager.loadOntologyFromOntologyDocument(`
        Prefix(pref:=<urn:test:>)
        Ontology(Declaration(Class(pref: ABC)))
      `),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
    await expect(
      manager.loadOntologyFromOntologyDocument(
        'Ontology(Annotation(rdfs:label "language"@ en))',
      ),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
    await expect(
      manager.loadOntologyFromOntologyDocument(
        "Ontology(ObjectMinCardinality(10abc <urn:test:p>))",
      ),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });

  it("reports located typed failures without committing partial state", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const dataFactory = manager.getOWLDataFactory();
    const ontologyIri = IRI.create("urn:test:transactional");
    const ontologyId = dataFactory.getOWLOntologyID(ontologyIri);

    await expect(
      manager.loadOntologyFromOntologyDocument(`
        Ontology(<urn:test:transactional>
          Declaration(Class(missing:Class))
        )
      `),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      column: expect.any(Number),
      line: expect.any(Number),
      offset: expect.any(Number),
      prefixName: "missing:",
    });
    expect(manager.getOntology(ontologyId)).toBeUndefined();

    const ontology = await manager.loadOntologyFromOntologyDocument(
      "Ontology(<urn:test:transactional>)",
    );
    expect(manager.getOntology(ontologyId)).toBe(ontology);
    expect(ontology.getOntologyID()).toEqual(ontologyId);

    await expect(
      manager.loadOntologyFromOntologyDocument("Ontology(DLSafeRule())"),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_CONSTRUCT",
      construct: "DLSafeRule",
    });
  });

  it("rejects duplicate prefixes and non-absolute full IRIs", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    await expect(
      manager.loadOntologyFromOntologyDocument(`
        Prefix(ex:=<urn:test:>)
        Prefix(ex:=<urn:other:>)
        Ontology()
      `),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      prefixName: "ex:",
    });
    await expect(
      manager.loadOntologyFromOntologyDocument("Ontology(<relative/path>)"),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });

  it("rejects unpaired Unicode surrogates in full IRIs", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    await expect(
      manager.loadOntologyFromOntologyDocument("Ontology(<urn:test:\uD800>)"),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });

  it("can omit annotation axioms without omitting ontology annotations", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      `
        Ontology(
          Annotation(rdfs:label "ontology annotation")
          Declaration(Class(<urn:test:A>))
          AnnotationAssertion(rdfs:label <urn:test:A> "axiom annotation")
          SubAnnotationPropertyOf(rdfs:label rdfs:comment)
          AnnotationPropertyDomain(rdfs:label <urn:test:domain>)
          AnnotationPropertyRange(rdfs:label <urn:test:range>)
        )
      `,
      new OWLOntologyLoaderConfiguration({ loadAnnotationAxioms: false }),
    );

    expect(ontology.getAnnotations()).toHaveProperty("size", 1);
    expect(ontology.getAxioms()).toHaveProperty("size", 1);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.DECLARATION_AXIOM),
    ).toHaveProperty("size", 1);
  });
});
