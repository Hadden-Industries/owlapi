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
  it.each([
    [["a"], true],
    [["a", "b"], true],
    [["a"], false],
  ])(
    "reports a Java header collision with imports %j and annotation axioms enabled %s",
    async (imports, loadAnnotationAxioms) => {
      const manager = OWLManager.createOWLOntologyManager({
        behaviorProfileId: "java-owlapi-5.5.1",
        documentLoader: {
          load: async (iri) =>
            new StringDocumentSource(`Ontology(<${iri.value}>)`, {
              documentIRI: iri.value,
              format: "functional",
            }),
        },
      });
      const importIRIs = imports.map((name) => `:${name}`).join(", ");
      await expect(
        manager.loadOntologyFromOntologyDocument(
          source(`:root a owl:Ontology; owl:imports ${importIRIs}; rdfs:isDefinedBy :root .
            :Member a owl:Class .`),
          { parsingMode: "compatible", loadAnnotationAxioms },
        ),
      ).rejects.toMatchObject({ code: "ONTOLOGY_STATE_INVALID" });
      const df = manager.getOWLDataFactory();
      const ontologyID = (name) =>
        df.getOWLOntologyID(IRI.create(`urn:consumer:${name}`));
      expect(manager.getOntology(ontologyID("root"))).toBeUndefined();
      for (const name of imports)
        expect(manager.getOntology(ontologyID(name))).toBeDefined();
    },
  );

  it("finishes Java header selection after loading imports without publishing the filtered ID", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
      documentLoader: {
        load: async (iri) => source(":child a owl:Ontology .", iri.value),
      },
    });
    const rootID = manager
      .getOWLDataFactory()
      .getOWLOntologyID(IRI.create("urn:consumer:root"));
    const existing = manager.createOntology(rootID);
    const ontology = await manager.loadOntologyFromOntologyDocument(
      source(
        `:root a owl:Ontology; owl:imports :child; rdfs:isDefinedBy :root .
          :child rdfs:isDefinedBy :child .
          :Member a owl:Class .`,
        "urn:consumer:second-document",
      ),
      { parsingMode: "compatible" },
    );
    expect(ontology.getOntologyID().ontologyIRI).toBeUndefined();
    expect(manager.getOntology(rootID)).toBe(existing);
    expect(
      [...ontology.getAnnotations()].map(({ value }) => value.value),
    ).toEqual(
      expect.arrayContaining(["urn:consumer:root", "urn:consumer:child"]),
    );
    expect(ontology.getAnnotations().size).toBe(2);
  });

  it("avoids claiming an occupied original ID when several fallback IDs survive", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
      documentLoader: {
        load: async (iri) =>
          source(`<${iri.value}-actual> a owl:Ontology .`, iri.value),
      },
    });
    const rootID = manager
      .getOWLDataFactory()
      .getOWLOntologyID(IRI.create("urn:consumer:root"));
    const original = manager.createOntology(rootID);
    const ontology = await manager.loadOntologyFromOntologyDocument(
      source(
        ":root a owl:Ontology; owl:imports :a, :b; rdfs:isDefinedBy :root . :Member a owl:Class .",
        "urn:consumer:second-document",
      ),
      { parsingMode: "compatible" },
    );
    expect(ontology.getOntologyID().ontologyIRI).toBeUndefined();
    expect(manager.getOntology(rootID)).toBe(original);
  });

  it.each([
    ["java-owlapi-5.5.1", true, undefined],
    ["java-owlapi-5.5.1", false, "urn:consumer:root"],
    ["normative-v1", true, "urn:consumer:root"],
  ])(
    "gets the %s ontology identity with all candidates annotated set to %s",
    async (behaviorProfileId, selfReference, expected) => {
      const manager = OWLManager.createOWLOntologyManager({
        behaviorProfileId,
        documentLoader: {
          load: async (iri) => source(":child a owl:Ontology .", iri.value),
        },
      });
      const ontology = await manager.loadOntologyFromOntologyDocument(
        source(`:root a owl:Ontology; owl:imports :child; rdfs:isDefinedBy :child .
          ${selfReference ? ":root rdfs:isDefinedBy :root ." : ""}
          :Member a owl:Class .`),
        { parsingMode: "compatible" },
      );
      expect(ontology.getOntologyID().ontologyIRI?.value).toBe(expected);
    },
  );

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

  it.each(["restriction", "declared", "imported", "inverse", "class range"])(
    "uses the Java resource assertion role supplied by %s",
    async (evidence) => {
      const manager = OWLManager.createOWLOntologyManager({
        behaviorProfileId: "java-owlapi-5.5.1",
        documentLoader: {
          load: async (iri) =>
            source(
              ":types a owl:Ontology . :p a owl:ObjectProperty .",
              iri.value,
            ),
        },
      });
      const declaration = {
        restriction: "",
        declared: ":p a owl:ObjectProperty .",
        imported: ":root owl:imports :types .",
        inverse: ":p owl:inverseOf :inverse .",
        "class range": ":p rdfs:range :D .",
      }[evidence];
      const ontology = await manager.loadOntologyFromOntologyDocument(
        source(`:root a owl:Ontology . ${declaration}
          :C a owl:Class; rdfs:subClassOf [ a owl:Restriction;
            owl:onProperty :p; owl:someValuesFrom :D ] .
          :D a owl:Class .
          :subject a owl:NamedIndividual; :p :target .
          :target a owl:NamedIndividual .`),
        { parsingMode: "compatible" },
      );
      const df = manager.getOWLDataFactory();
      const property = IRI.create("urn:consumer:p");
      const subject = IRI.create("urn:consumer:subject");
      const target = IRI.create("urn:consumer:target");
      const objectProperty = df.getOWLObjectProperty(property);
      expect(
        ontology.containsAxiom(
          df.getOWLSubClassOfAxiom(
            df.getOWLClass(IRI.create("urn:consumer:C")),
            df.getOWLObjectSomeValuesFrom(
              objectProperty,
              df.getOWLClass(IRI.create("urn:consumer:D")),
            ),
          ),
        ),
      ).toBe(true);
      expect(
        ontology.containsAxiom(
          df.getOWLAnnotationAssertionAxiom(
            df.getOWLAnnotationProperty(property),
            subject,
            target,
          ),
        ),
      ).toBe(evidence === "restriction");
      expect(
        ontology.containsAxiom(
          df.getOWLObjectPropertyAssertionAxiom(
            objectProperty,
            df.getOWLNamedIndividual(subject),
            df.getOWLNamedIndividual(target),
          ),
        ),
      ).toBe(evidence !== "restriction");
    },
  );

  it.each([false, true])(
    "requires roles on both Java equivalent properties when other end declared is %s",
    async (typedOtherEnd) => {
      const manager = OWLManager.createOWLOntologyManager({
        behaviorProfileId: "java-owlapi-5.5.1",
      });
      const ontology = await manager.loadOntologyFromOntologyDocument(
        source(`:root a owl:Ontology . :p a owl:ObjectProperty; owl:equivalentProperty :q .
          [] a owl:Axiom; owl:annotatedSource :p; owl:annotatedProperty owl:equivalentProperty;
            owl:annotatedTarget :q; rdfs:comment "Evidence" .
          ${typedOtherEnd ? ":q a owl:ObjectProperty ." : ""}`),
        { parsingMode: "compatible" },
      );
      expect(
        ontology.getAxiomsByType(K.EQUIVALENT_OBJECT_PROPERTIES_AXIOM).size,
      ).toBe(Number(typedOtherEnd));
      expect(
        manager
          .getOntologyFormat(ontology)
          .getOntologyLoaderMetaData()
          .getUnparsedTriples(),
      ).toHaveLength(typedOtherEnd ? 0 : 2);
      if (typedOtherEnd) {
        const [equivalence] = ontology.getAxiomsByType(
          K.EQUIVALENT_OBJECT_PROPERTIES_AXIOM,
        );
        expect(equivalence.annotations).toHaveLength(1);
      }
    },
  );
  it("leaves an unclaimed resource on a negative assertion node in RDF metadata", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    const ontology = await manager.loadOntologyFromOntologyDocument(
      source(`:root a owl:Ontology . :p a owl:ObjectProperty .
        [] a owl:NegativePropertyAssertion; owl:sourceIndividual :a;
          owl:assertionProperty :p; owl:targetIndividual :b; :unclaimed :value .
        :C a owl:Class . [] a :C; :metadata :value .`),
      { parsingMode: "compatible" },
    );
    const [annotation] = ontology.getAxiomsByType(K.ANNOTATION_ASSERTION_AXIOM);
    expect(annotation.property.iri.value).toBe("urn:consumer:metadata");
    expect(
      manager
        .getOntologyFormat(ontology)
        .getOntologyLoaderMetaData()
        .getUnparsedTriples(),
    ).toHaveLength(1);
  });

  it.each([
    ["unique existential", "owl:someValuesFrom :C", "owl:someValuesFrom :C", 1],
    [
      "qualified minimum",
      'owl:onClass :C; owl:minQualifiedCardinality "2"^^xsd:nonNegativeInteger',
      'owl:onClass :C; owl:minQualifiedCardinality "2"^^xsd:nonNegativeInteger',
      1,
    ],
    ["ambiguous source", "owl:someValuesFrom :C", "owl:someValuesFrom :C", 2],
    [
      "different filler",
      "owl:someValuesFrom :Other",
      "owl:someValuesFrom :C",
      1,
    ],
    ["different operator", "owl:allValuesFrom :C", "owl:someValuesFrom :C", 1],
    ["missing source", "owl:someValuesFrom :C", "owl:someValuesFrom :C", 0],
  ])(
    "attaches detached subclass annotations only to an exact asserted target for %s",
    async (label, asserted, reified, baseCount) => {
      const manager = OWLManager.createOWLOntologyManager();
      const restriction = (body) =>
        `[ a owl:Restriction; owl:onProperty :p; ${body} ]`;
      const document = source(`:root a owl:Ontology .
        :p a owl:ObjectProperty . :C a owl:Class . :Other a owl:Class . :Sub a owl:Class .
        ${Array.from({ length: baseCount }, () => `:Sub rdfs:subClassOf ${restriction(asserted)} .`).join("\n")}
        [] a owl:Axiom; owl:annotatedSource :Sub; owl:annotatedProperty rdfs:subClassOf;
          owl:annotatedTarget ${restriction(reified)}; rdfs:comment "Evidence" .`);
      const ontology = await manager.loadOntologyFromOntologyDocument(
        document,
        { parsingMode: "compatible" },
      );
      const [subclass] = ontology.getAxiomsByType(K.SUBCLASS_OF_AXIOM);
      const matched =
        label === "unique existential" || label === "qualified minimum";
      if (baseCount) expect(subclass.annotations).toHaveLength(Number(matched));
      else expect(subclass).toBeUndefined();
      const unparsed = manager
        .getOntologyFormat(ontology)
        .getOntologyLoaderMetaData()
        .getUnparsedTriples();
      expect(
        unparsed.some(
          ({ predicate }) =>
            predicate.value === "http://www.w3.org/2000/01/rdf-schema#comment",
        ),
      ).toBe(!matched);
    },
  );

  it.each(["shared target", "annotations disabled", "strict", "preserve"])(
    "keeps detached targets outside compatible recovery for %s",
    async (mode) => {
      const manager = OWLManager.createOWLOntologyManager();
      const document = source(`:root a owl:Ontology .
        :p a owl:ObjectProperty . :C a owl:Class . :Sub a owl:Class .
        :Sub rdfs:subClassOf [ a owl:Restriction; owl:onProperty :p; owl:someValuesFrom :C ] .
        _:target a owl:Restriction; owl:onProperty :p; owl:someValuesFrom :C .
        [] a owl:Axiom; owl:annotatedSource :Sub; owl:annotatedProperty rdfs:subClassOf;
          owl:annotatedTarget _:target; rdfs:comment "Evidence" .
        ${mode === "shared target" ? ":Other a owl:Class; rdfs:subClassOf _:target ." : ""}`);
      const load = manager.loadOntologyFromOntologyDocument(document, {
        parsingMode:
          mode === "strict" || mode === "preserve" ? mode : "compatible",
        loadAnnotationAxioms: mode !== "annotations disabled",
      });
      if (mode === "strict" || mode === "preserve") {
        await expect(load).rejects.toMatchObject({
          code: "UNSUPPORTED_CONSTRUCT",
        });
        return;
      }
      const ontology = await load;
      const subclassAxioms = [...ontology.getAxiomsByType(K.SUBCLASS_OF_AXIOM)];
      expect(subclassAxioms).toHaveLength(mode === "shared target" ? 2 : 1);
      expect(
        subclassAxioms.every(({ annotations }) => annotations.length === 0),
      ).toBe(true);
    },
  );
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
