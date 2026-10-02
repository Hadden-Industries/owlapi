import {
  OWLManager,
  StringDocumentSource,
  IRI,
  OWLObjectKind as K,
  OWL2DLProfile,
} from "../index.js";

const prefixes = `@prefix : <urn:consumer:> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .`;
const source = (text, documentIRI = "urn:consumer:root") =>
  new StringDocumentSource(prefixes + text, { format: "turtle", documentIRI });
const root = `:root a owl:Ontology; rdfs:label "selected"; owl:imports :a .
:secondary a owl:Ontology; rdfs:label "secondary"; owl:imports :b .`;

describe("bounded RDF consumer compatibility", () => {
  it("retains non-IRI imports outside the selected header as unparsed triples", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      source(
        ':root a owl:Ontology . :secondary a owl:Ontology; owl:imports "not an IRI" . :other owl:imports _:invalid .',
      ),
      { parsingMode: "compatible" },
    );
    expect([...ontology.getImportsDeclarations()]).toEqual([]);
    expect(
      manager
        .getOntologyFormat(ontology)
        .getOntologyLoaderMetaData()
        .getUnparsedTriples(),
    ).toHaveLength(2);
    await expect(
      manager.loadOntologyFromOntologyDocument(
        source(
          ':bad a owl:Ontology; owl:imports "not an IRI" .',
          "urn:consumer:bad",
        ),
        { parsingMode: "compatible" },
      ),
    ).rejects.toThrow("owl:imports requires an IRI object");
  });
  it("preserves compatible annotation recovery for range-only predicates", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      source(':p rdfs:range rdfs:Literal . :C a owl:Class; :p "x" .'),
      { parsingMode: "compatible" },
    );
    expect([
      ...ontology.getAxiomsByType(K.ANNOTATION_ASSERTION_AXIOM),
    ]).toHaveLength(1);
    expect([
      ...ontology.getAxiomsByType(K.DATA_PROPERTY_ASSERTION_AXIOM),
    ]).toEqual([]);
    expect([...ontology.getIndividualsInSignature()]).toEqual([]);
  });
  it("leaves range-only untyped properties unparsed when a datatype is imported", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        load: async (iri) => {
          expect(iri.value).toBe("urn:consumer:types");
          return source(
            ":types a owl:Ontology . :D a rdfs:Datatype .",
            iri.value,
          );
        },
      },
    });
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      source(":root a owl:Ontology; owl:imports :types . :p rdfs:range :D ."),
      { parsingMode: "compatible" },
    );
    expect(result.importsClosure).toHaveLength(2);
    expect([
      ...result.ontology.getAxiomsByType(K.DATA_PROPERTY_RANGE_AXIOM),
    ]).toEqual([]);
    expect(
      manager
        .getOntologyFormat(result.ontology)
        .getOntologyLoaderMetaData()
        .getUnparsedTriples(),
    ).toEqual([
      {
        subject: { termType: "NamedNode", value: "urn:consumer:p" },
        predicate: {
          termType: "NamedNode",
          value: "http://www.w3.org/2000/01/rdf-schema#range",
        },
        object: { termType: "NamedNode", value: "urn:consumer:D" },
      },
    ]);
  });
  it("loads secondary-header imports through the ordinary diamond/cycle closure", async () => {
    const calls = [];
    const documents = {
      "urn:consumer:a": `:a a owl:Ontology; owl:imports :shared .`,
      "urn:consumer:b": `:b a owl:Ontology; owl:imports :shared . :ImportedOnly a owl:Class .`,
      "urn:consumer:shared": `:shared a owl:Ontology; owl:imports :root .`,
    };
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        load: async (iri) => {
          calls.push(iri.value);
          if (!Object.hasOwn(documents, iri.value))
            throw new Error("unexpected import");
          return source(documents[iri.value], iri.value);
        },
      },
    });
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      source(root),
      { parsingMode: "compatible" },
    );
    expect(new Set(calls)).toEqual(new Set(Object.keys(documents)));
    expect(calls).toHaveLength(3);
    expect(result.importsClosure).toHaveLength(4);
    expect(
      result.importsClosure.some((ontology) =>
        [...ontology.getClassesInSignature()].some(
          (c) => c.iri.value === "urn:consumer:ImportedOnly",
        ),
      ),
    ).toBe(true);
    expect(result.ontology.getOntologyID().ontologyIRI.value).toBe(
      "urn:consumer:root",
    );
    expect(
      [...result.ontology.getAnnotations()].map((a) => a.value.lexicalForm),
    ).toEqual(["selected"]);
    expect(
      [...result.ontology.getAxiomsByType(K.ANNOTATION_ASSERTION_AXIOM)].some(
        (a) =>
          a.subject.value === "urn:consumer:secondary" &&
          a.value.lexicalForm === "secondary",
      ),
    ).toBe(true);
    expect(
      result.documents[0].context.format
        .getOntologyLoaderMetaData()
        .getHeaderState(),
    ).toBe("PARSED_MULTIPLE_HEADERS");
  });

  it("does not publish a partial graph when a secondary-header import fails", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        load: async (iri) => {
          if (iri.value === "urn:consumer:b")
            throw new Error("unavailable secondary import");
          return source(`:a a owl:Ontology .`, iri.value);
        },
      },
    });
    await expect(
      manager.loadOntologyGraphFromOntologyDocument(source(root), {
        parsingMode: "compatible",
      }),
    ).rejects.toMatchObject({ code: "UNLOADABLE_IMPORT" });
    expect(
      manager.getOntology(
        manager
          .getOWLDataFactory()
          .getOWLOntologyID(IRI.create("urn:consumer:root")),
      ),
    ).toBeUndefined();
    expect(
      manager.getOntology(
        manager
          .getOWLDataFactory()
          .getOWLOntologyID(IRI.create("urn:consumer:a")),
      ),
    ).toBeUndefined();
  });

  it("reconstructs inverse and domain/range axioms for an indirectly typed functional object property", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      source(`
      :root a owl:Ontology . :C a owl:Class . :q a owl:ObjectProperty .
      :p a owl:FunctionalProperty; owl:inverseOf :q; rdfs:domain :C; rdfs:range :C .`),
      { parsingMode: "compatible" },
    );
    const df = manager.getOWLDataFactory();
    const p = df.getOWLObjectProperty(IRI.create("urn:consumer:p"));
    const q = df.getOWLObjectProperty(IRI.create("urn:consumer:q"));
    const c = df.getOWLClass(IRI.create("urn:consumer:C"));
    for (const expected of [
      df.getOWLInverseObjectPropertiesAxiom(p, q),
      df.getOWLFunctionalObjectPropertyAxiom(p),
      df.getOWLObjectPropertyDomainAxiom(p, c),
      df.getOWLObjectPropertyRangeAxiom(p, c),
    ])
      expect(
        [...ontology.getAxioms()].some((axiom) => axiom.equals(expected)),
      ).toBe(true);
    expect(
      manager
        .getOntologyFormat(ontology)
        .getOntologyLoaderMetaData()
        .getUnparsedTriples(),
    ).toEqual([]);
  });

  it.each(["strict", "preserve"])(
    "keeps %s multi-header rejection",
    async (parsingMode) => {
      const manager = OWLManager.createOWLOntologyManager();
      await expect(
        manager.loadOntologyGraphFromOntologyDocument(source(root), {
          parsingMode,
        }),
      ).rejects.toThrow();
    },
  );

  it.each(["limit", "abort"])(
    "applies the existing %s boundary to secondary-header imports",
    async (failure) => {
      const controller = new AbortController();
      const cancellation = new Error("cancelled secondary import");
      const manager = OWLManager.createOWLOntologyManager({
        documentLoader: {
          load: async (iri) => {
            if (failure === "abort" && iri.value === "urn:consumer:b")
              controller.abort(cancellation);
            return source(`<${iri.value}> a owl:Ontology .`, iri.value);
          },
        },
      });
      const result = manager.loadOntologyGraphFromOntologyDocument(
        source(root),
        {
          parsingMode: "compatible",
          signal: controller.signal,
          ...(failure === "limit" ? { maxImportCount: 1 } : {}),
        },
      );
      if (failure === "abort") await expect(result).rejects.toBe(cancellation);
      else
        await expect(result).rejects.toMatchObject({
          code: "RESOURCE_LIMIT_EXCEEDED",
        });
      expect(
        manager.getOntology(
          manager
            .getOWLDataFactory()
            .getOWLOntologyID(IRI.create("urn:consumer:root")),
        ),
      ).toBeUndefined();
    },
  );

  it("keeps view admission separate from datatype/profile assessment", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      source(`
      :p a owl:DatatypeProperty; rdfs:range xsd:time . xsd:time a rdfs:Datatype .
      :i :p "12:00:00"^^xsd:time, "verbatim"^^:Custom, "bad"^^xsd:integer .`),
      { parsingMode: "preserve" },
    );
    expect(
      [...ontology.getAxiomsByType(K.DATA_PROPERTY_ASSERTION_AXIOM)].map(
        (a) => [a.value.lexicalForm, a.value.datatype.iri.value],
      ),
    ).toEqual(
      expect.arrayContaining([
        ["12:00:00", "http://www.w3.org/2001/XMLSchema#time"],
        ["verbatim", "urn:consumer:Custom"],
        ["bad", "http://www.w3.org/2001/XMLSchema#integer"],
      ]),
    );
    const report = await new OWL2DLProfile().checkOntology(ontology, {
      sourceAssessment: true,
    });
    expect(report.sourceAssessment.violations).toContainEqual(
      expect.objectContaining({
        code: "LITERAL_LEXICAL_SPACE",
        datatype: "http://www.w3.org/2001/XMLSchema#integer",
      }),
    );
    for (const datatype of [
      "http://www.w3.org/2001/XMLSchema#time",
      "urn:consumer:Custom",
    ])
      expect(report.sourceAssessment.unverifiedChecks).toContainEqual(
        expect.objectContaining({
          code: "DATATYPE_NOT_IN_SUPPORTED_MAP",
          datatype,
        }),
      );
  });

  it("discovers a headerless compatible import without inventing an explicit header", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        load: async (iri) => source(`:ImportedOnly a owl:Class .`, iri.value),
      },
    });
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      source(`:document owl:imports :child .`),
      { parsingMode: "compatible" },
    );
    expect(result.importsClosure).toHaveLength(2);
    expect(
      result.documents[0].context.format
        .getOntologyLoaderMetaData()
        .getHeaderState(),
    ).toBe("PARSED_ZERO_HEADERS");
    expect(result.ontology.getOntologyID().ontologyIRI).toBeUndefined();
  });
});
