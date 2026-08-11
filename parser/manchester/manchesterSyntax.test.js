import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { OWLParserRegistry } from "../../manager/parserRegistry.js";
import { AXIOM_KINDS, IRI, OWLObjectKind } from "../../model/index.js";

import { manchesterSyntaxParserDescriptor } from "./descriptor.js";

describe("OWL Manchester Syntax", () => {
  it("positively detects a bounded Manchester ontology header", () => {
    const registry = new OWLParserRegistry([manchesterSyntaxParserDescriptor]);
    const source = new StringDocumentSource(
      "# ontology metadata\nPrefix: : <urn:test:>\nOntology:",
      { fileName: "example.omn" },
    );

    const [candidate] = registry.resolveCandidates(source);

    expect(candidate.detection).toEqual({
      reason: "A Manchester Syntax prefix declaration was found",
      reasonCode: "MANCHESTER_PREFIX",
      result: "MATCH",
    });
    expect(candidate.eligible).toBe(true);
  });

  it("loads an empty anonymous ontology through the public manager", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    const ontology = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource("Ontology:", { fileName: "empty.omn" }),
    );

    expect(ontology.getOntologyID().ontologyIRI).toBeUndefined();
    expect(ontology.getOntologyID().versionIRI).toBeUndefined();
    expect(ontology.getAxioms()).toHaveProperty("size", 0);
    expect(ontology.getAnnotations()).toHaveProperty("size", 0);
    expect(ontology.getImportsDeclarations()).toHaveProperty("size", 0);
  });

  it("preserves prefix-expanded ontology and version IRIs", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    const ontology = await manager.loadOntologyFromOntologyDocument(`
      Prefix: : <urn:test:entity:>
      Ontology: <urn:test:ontology> <urn:test:version>
    `);

    expect(ontology.getOntologyID().ontologyIRI.value).toBe(
      "urn:test:ontology",
    );
    expect(ontology.getOntologyID().versionIRI.value).toBe("urn:test:version");
  });

  it("preserves imports, ontology annotations, and frame declarations", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        load: async () => "Ontology: <urn:test:import>",
      },
    });

    const ontology = await manager.loadOntologyFromOntologyDocument(`
      Prefix: : <urn:test:entity:>
      Ontology: <urn:test:ontology>
        Import: <urn:test:import>
        Annotations: rdfs:label "Ontology label"@EN
        Class: :Person
        Datatype: :Code
        ObjectProperty: :knows
        DataProperty: :age
        AnnotationProperty: :note
        Individual: :Ada
    `);

    expect([...ontology.getImportsDeclarations()][0].iri.value).toBe(
      "urn:test:import",
    );
    const [annotation] = ontology.getAnnotations();
    expect(annotation.property.iri.value).toBe(
      "http://www.w3.org/2000/01/rdf-schema#label",
    );
    expect(annotation.value).toMatchObject({
      language: "en",
      lexicalForm: "Ontology label",
    });
    expect(
      ontology.getAxiomsByType(OWLObjectKind.DECLARATION_AXIOM),
    ).toHaveProperty("size", 6);
  });

  it("constructs every Manchester object class expression", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      Prefix: : <urn:test:>
      Ontology:
        ObjectProperty: :p
        ObjectProperty: :q
        Individual: :i
        Class: :A
          SubClassOf: :B and :C
          SubClassOf: :B or :C
          SubClassOf: not :B
          SubClassOf: { :i, _:anon }
          SubClassOf: inverse :p some :B
          SubClassOf: :p only :B
          SubClassOf: :p value :i
          SubClassOf: :p Self
          SubClassOf: :p min 1 :B
          SubClassOf: :p max 2
          SubClassOf: :p exactly 3 :B
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

  it("constructs data restrictions and every Manchester data range", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      Prefix: : <urn:test:>
      Ontology:
        DataProperty: :p
        Class: :A
          SubClassOf: :p some (integer and decimal)
          SubClassOf: :p only (integer or string)
          SubClassOf: :p value "hello"@en
          SubClassOf: :p min 1 not integer
          SubClassOf: :p max 2
          SubClassOf: :p exactly 3 { "a", "b"^^string }
          SubClassOf: :p some integer[<= 0, >= 10]
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

    const dataRanges = superClasses.map(({ filler, value }) => filler || value);
    expect(dataRanges.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        OWLObjectKind.DATA_COMPLEMENT_OF,
        OWLObjectKind.DATA_INTERSECTION_OF,
        OWLObjectKind.DATA_ONE_OF,
        OWLObjectKind.DATA_UNION_OF,
        OWLObjectKind.DATATYPE_RESTRICTION,
      ]),
    );
    const unqualified = superClasses.find(
      ({ kind }) => kind === OWLObjectKind.DATA_MAX_CARDINALITY,
    );
    expect(unqualified.filler.iri.value).toBe(
      "http://www.w3.org/2000/01/rdf-schema#Literal",
    );
  });

  it("constructs every axiom family exposed by Manchester frames", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      Prefix: : <urn:test:>
      Ontology:
        Class: :A
        Class: :B
        Class: :C
        ObjectProperty: :p
        ObjectProperty: :q
        ObjectProperty: :r
        DataProperty: :d
        DataProperty: :e
        AnnotationProperty: :note
        AnnotationProperty: :superNote
        Datatype: :Code
        Individual: :i
        Individual: :j
        Individual: :k

        Class: :A
          Annotations: :note "class metadata"
          SubClassOf: Annotations: :note "subclass metadata" :B
          EquivalentTo: :B
          DisjointWith: :C
          DisjointUnionOf: :B, :C
          HasKey: :p :d

        ObjectProperty: :p
          Annotations: :note "object property metadata"
          Domain: :A
          Range: :B
          Characteristics: Functional, InverseFunctional, Reflexive,
            Irreflexive, Symmetric, Asymmetric, Transitive
          SubPropertyOf: :q
          EquivalentTo: :q
          DisjointWith: :r
          InverseOf: :q
          SubPropertyChain: :q o :r

        DataProperty: :d
          Annotations: :note "data property metadata"
          Domain: :A
          Range: integer
          Characteristics: Functional
          SubPropertyOf: :e
          EquivalentTo: :e
          DisjointWith: :e

        Datatype: :Code
          Annotations: :note "datatype metadata"
          EquivalentTo: { "x", "y" }

        AnnotationProperty: :note
          Annotations: :note "annotation property metadata"
          Domain: <urn:test:domain>
          Range: <urn:test:range>
          SubPropertyOf: :superNote

        Individual: :i
          Annotations: :note "individual metadata"
          Types: :A
          Facts: :p :j, not :q :k, :d 1, not :e 2
          SameAs: :j
          DifferentFrom: :k

        EquivalentClasses: :A, :B
        DisjointClasses: :A, :C
        EquivalentProperties: :p, :q
        DisjointProperties: :p, :r
        EquivalentProperties: :d, :e
        DisjointProperties: :d, :e
        SameIndividual: :i, :j
        DifferentIndividuals: :i, :k
    `);

    expect([...ontology.getAxioms()].map(({ kind }) => kind).sort()).toEqual(
      expect.arrayContaining([...AXIOM_KINDS].sort()),
    );
    expect(
      ontology.getAxiomsByType(OWLObjectKind.ANNOTATION_ASSERTION_AXIOM),
    ).toHaveProperty("size", 6);
    const [chain] = ontology.getAxiomsByType(
      OWLObjectKind.SUB_PROPERTY_CHAIN_AXIOM,
    );
    expect(chain.chain.map(({ iri }) => iri.value)).toEqual([
      "urn:test:q",
      "urn:test:r",
    ]);
  });

  it("resolves property kinds from frames that appear later in the document", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      Prefix: : <urn:test:>
      Ontology:
        Class: :Person
          SubClassOf: :hasParent some :Person, :age some integer
        Individual: :Ada
          Facts: :hasParent :Grace, :age 37
        ObjectProperty: :hasParent
        DataProperty: :age
    `);

    expect(
      [...ontology.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM)].map(
        ({ superClass }) => superClass.kind,
      ),
    ).toEqual([
      OWLObjectKind.OBJECT_SOME_VALUES_FROM,
      OWLObjectKind.DATA_SOME_VALUES_FROM,
    ]);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM),
    ).toHaveProperty("size", 1);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM),
    ).toHaveProperty("size", 1);
  });

  it("limits reserved-prefix recovery to positively detected compatible loads", async () => {
    const source = `
      Prefix: rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      Ontology:
        Class: <urn:test:A>
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
      manchesterSyntaxParserDescriptor,
    ]).resolveCandidates(new StringDocumentSource("unrelated content"), {
      parsingMode: "compatible",
    });
    expect(candidate.detection.result).toBe("NO_MATCH");
    expect(candidate.eligible).toBe(false);
  });

  it("preserves Manchester lexical forms and enforces literal suffix boundaries", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      [
        "Prefix: ex: <https://example.com/ns#>",
        "Ontology:",
        '  Annotations: ex:note "line one\r\nline two \\"quoted\\" and \\\\ slash"',
        '  Annotations: Annotations: ex:note "nested" ex:note _:target',
        "  Class: ex:Δ",
        "  Class: ex:escaped\\~name",
        "  Individual: _:target",
        '    Facts: ex:value "language"@en-US',
        "  DataProperty: ex:value",
      ].join("\n"),
    );

    expect(
      [...ontology.getClassesInSignature()].map(({ iri }) => iri.value).sort(),
    ).toEqual([
      "https://example.com/ns#escaped~name",
      "https://example.com/ns#Δ",
    ]);
    const annotations = [...ontology.getAnnotations()];
    expect(annotations[0].value.lexicalForm).toBe(
      'line one\r\nline two "quoted" and \\ slash',
    );
    expect(annotations[1].value.kind).toBe(OWLObjectKind.ANONYMOUS_INDIVIDUAL);
    expect(annotations[1].annotations).toHaveLength(1);
    const [assertion] = ontology.getAxiomsByType(
      OWLObjectKind.DATA_PROPERTY_ASSERTION_AXIOM,
    );
    expect(assertion.value.language).toBe("en-us");

    await expect(
      manager.loadOntologyFromOntologyDocument(
        'Ontology: Annotations: rdfs:label "language" @en',
      ),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
    await expect(
      manager.loadOntologyFromOntologyDocument(
        'Ontology: Annotations: rdfs:label "typed" ^^xsd:string',
      ),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });

  it("parses numeric annotation targets as literals rather than IRIs", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(`
      Prefix: : <urn:test:>
      Ontology:
        Annotations: :score -1.5
    `);

    const [annotation] = ontology.getAnnotations();
    expect(annotation.value).toMatchObject({
      kind: OWLObjectKind.LITERAL,
      language: "",
      lexicalForm: "-1.5",
    });
    expect(annotation.value.datatype.iri.value).toBe(
      "http://www.w3.org/2001/XMLSchema#decimal",
    );
    await expect(
      manager.loadOntologyFromOntologyDocument(`
        Prefix: : <urn:test:>
        Ontology:
          DataProperty: :score
          Individual: :subject
            Facts: :score 1.f
      `),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });

  it("reports located failures without committing partial state", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const dataFactory = manager.getOWLDataFactory();
    const ontologyIri = IRI.create("urn:test:manchester-transactional");
    const ontologyId = dataFactory.getOWLOntologyID(ontologyIri);

    await expect(
      manager.loadOntologyFromOntologyDocument(`
        Ontology: <urn:test:manchester-transactional>
          Class: missing:Class
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
      "Ontology: <urn:test:manchester-transactional>",
    );
    expect(manager.getOntology(ontologyId)).toBe(ontology);

    await expect(
      manager.loadOntologyFromOntologyDocument("Ontology: Rule: body"),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_CONSTRUCT",
      construct: "Rule",
    });
  });

  it("rejects invalid prefixes, non-absolute IRIs, and forbidden entity overloading", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    await expect(
      manager.loadOntologyFromOntologyDocument(`
        Prefix: ex: <urn:test:>
        Prefix: ex: <urn:other:>
        Ontology:
      `),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      prefixName: "ex:",
    });
    await expect(
      manager.loadOntologyFromOntologyDocument("Ontology: <relative/path>"),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
    await expect(
      manager.loadOntologyFromOntologyDocument(`
        Prefix: Class: <urn:test:>
        Ontology:
      `),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      prefixName: "Class:",
    });
    await expect(
      manager.loadOntologyFromOntologyDocument(`
        Ontology:
          ObjectProperty: <urn:test:p>
          DataProperty: <urn:test:p>
      `),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      iri: "urn:test:p",
    });
    await expect(
      manager.loadOntologyFromOntologyDocument(
        "Ontology: Class: <urn:test:\uD800>",
      ),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });

  it("rejects extensions outside the W3C description and fact grammar", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    await expect(
      manager.loadOntologyFromOntologyDocument(`
        Prefix: : <urn:test:>
        Ontology:
          ObjectProperty: :p
          ObjectProperty: :q
          Class: :A
            SubClassOf: :B that :p some :C and not :q only :A
      `),
    ).resolves.toBeDefined();
    await expect(
      manager.loadOntologyFromOntologyDocument(`
        Prefix: : <urn:test:>
        Ontology:
          Class: :A
            SubClassOf: :B that :C
      `),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
    await expect(
      manager.loadOntologyFromOntologyDocument(`
        Prefix: : <urn:test:>
        Ontology:
          ObjectProperty: :p
          Individual: :i
            Facts: inverse :p :j
          Individual: :j
      `),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });

  it("can omit annotation axioms without omitting ontology annotations", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      `
        Ontology:
          Annotations: rdfs:label "ontology annotation"
          Class: <urn:test:A>
            Annotations: rdfs:label "entity annotation"
          AnnotationProperty: rdfs:label
            Domain: <urn:test:domain>
            Range: <urn:test:range>
            SubPropertyOf: rdfs:comment
      `,
      new OWLOntologyLoaderConfiguration({ loadAnnotationAxioms: false }),
    );

    expect(ontology.getAnnotations()).toHaveProperty("size", 1);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.ANNOTATION_ASSERTION_AXIOM),
    ).toHaveProperty("size", 0);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.ANNOTATION_PROPERTY_DOMAIN_AXIOM),
    ).toHaveProperty("size", 0);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.DECLARATION_AXIOM),
    ).toHaveProperty("size", 2);
  });
});
