import * as owlapi from "../index.js";

const prefixes = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix : <urn:metadata:> .`;
const source = (text, options = {}) =>
  new owlapi.StringDocumentSource(prefixes + text, {
    format: "turtle",
    documentIRI: "urn:metadata:root",
    ...options,
  });
const load = async (manager, document, config) =>
  (await manager.loadOntologyGraphFromOntologyDocument(document, config))
    .documents[0];

describe("Java-compatible RDF loader metadata", () => {
  it("excludes built-in datatypes while retaining undeclared custom datatype roles", async () => {
    const manager = owlapi.OWLManager.createOWLOntologyManager();
    const parsed = await load(
      manager,
      source(`
      :root a owl:Ontology;
        rdfs:label "hello", "0001"^^xsd:integer, "1.0"^^owl:real,
          "1/2"^^owl:rational, "custom"^^:Custom, "unknown"^^xsd:notABuiltin .
    `),
      { parsingMode: "compatible" },
    );
    expect(
      parsed.context.format
        .getOntologyLoaderMetaData()
        .getGuessedDeclarations(),
    ).toEqual(
      expect.arrayContaining([
        {
          iri: owlapi.IRI.create("urn:metadata:Custom"),
          entityType: owlapi.OWLObjectKind.DATATYPE,
        },
        {
          iri: owlapi.IRI.create(
            "http://www.w3.org/2001/XMLSchema#notABuiltin",
          ),
          entityType: owlapi.OWLObjectKind.DATATYPE,
        },
      ]),
    );
    expect(
      parsed.context.format
        .getOntologyLoaderMetaData()
        .getGuessedDeclarations(),
    ).toHaveLength(2);
  });
  it("copies caller records and replaces caller metadata during a real parse", async () => {
    const object = {
      termType: "Literal",
      value: "bonjour",
      language: "fr",
      datatype: {
        termType: "NamedNode",
        value: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
      },
    };
    const triples = [
      {
        subject: { termType: "BlankNode", value: "local" },
        predicate: { termType: "NamedNode", value: "urn:note" },
        object,
      },
    ];
    const guesses = [
      { iri: "urn:p", entityType: owlapi.OWLObjectKind.DATA_PROPERTY },
    ];
    const metadata = new owlapi.RDFParserMetaData({
      tripleCount: 99,
      headerState: owlapi.RDFOntologyHeaderStatus.PARSED_ZERO_HEADERS,
      unparsedTriples: triples,
      guessedDeclarations: guesses,
    });
    object.value = "changed";
    object.datatype.value = "urn:changed";
    triples.pop();
    guesses[0].entityType = owlapi.OWLObjectKind.CLASS;
    expect(metadata.getUnparsedTriples()[0].object).toMatchObject({
      value: "bonjour",
      language: "fr",
      datatype: {
        value: "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
      },
    });
    expect(metadata.getGuessedDeclarations()[0].entityType).toBe(
      owlapi.OWLObjectKind.DATA_PROPERTY,
    );
    const format = owlapi.OWLDocumentFormats.TURTLE.withOntologyLoaderMetaData(
      metadata,
    ).withParameter("example", { a: 1 });
    const manager = owlapi.OWLManager.createOWLOntologyManager();
    const { context } = await load(
      manager,
      source(`:root a owl:Ontology .`, { format }),
    );
    expect(context.format.getOntologyLoaderMetaData().getTripleCount()).toBe(1);
    expect(
      context.format.getOntologyLoaderMetaData().getUnparsedTriples(),
    ).toEqual([]);
    expect(context.format.getParameter("example")).toEqual({ a: 1 });
    expect(format.getOntologyLoaderMetaData()).toBe(metadata);
  });

  it("reports the selected graph and keeps repeated blank labels document local", async () => {
    const manager = owlapi.OWLManager.createOWLOntologyManager({
      documentLoader: {
        load: async (iri) =>
          source(`:child a owl:Ontology . _:same :unknown "child"@en .`, {
            documentIRI: iri,
          }),
      },
    });
    const input = new owlapi.StringDocumentSource(
      prefixes +
        `:root a owl:Ontology; owl:imports :child . _:same :unknown "root"@en . <urn:ignored> { :Unused a owl:Class . }`,
      { documentIRI: "urn:metadata:root", format: "trig" },
    );
    const result = await manager.loadOntologyGraphFromOntologyDocument(input, {
      parsingMode: "compatible",
      rdfDatasetGraphPolicy: "defaultGraphOnly",
    });
    expect(result.documents).toHaveLength(2);
    const [root, child] = result.documents.map(({ context }) =>
      context.format.getOntologyLoaderMetaData(),
    );
    expect(root.getTripleCount()).toBe(3);
    expect(child.getTripleCount()).toBe(2);
    expect(root.getUnparsedTriples()[0].object.value).toBe("root");
    expect(child.getUnparsedTriples()[0].object.value).toBe("child");
    expect(root.getUnparsedTriples()[0].subject).not.toBe(
      child.getUnparsedTriples()[0].subject,
    );
  });

  it("makes RDF/XML metadata available through the same Java format accessor", async () => {
    const manager = owlapi.OWLManager.createOWLOntologyManager();
    const ontology = await manager.loadOntologyFromOntologyDocument(
      new owlapi.StringDocumentSource(
        `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:owl="http://www.w3.org/2002/07/owl#"><owl:Ontology rdf:about="urn:xml:root"/></rdf:RDF>`,
        { format: "rdfxml" },
      ),
    );
    const metadata = manager
      .getOntologyFormat(ontology)
      .getOntologyLoaderMetaData();
    expect(metadata.getHeaderState()).toBe("PARSED_ONE_HEADER");
    expect(metadata.getTripleCount()).toBe(1);
    expect(metadata.getUnparsedTriples()).toEqual([]);
  });

  it("retains exact unparsed terms even when diagnostics are disabled", async () => {
    const manager = owlapi.OWLManager.createOWLOntologyManager();
    const { ontology, context } = await load(
      manager,
      source(`:root a owl:Ontology . _:left :unknown "0001"^^xsd:integer .`),
      { parsingMode: "compatible", collectWarnings: false },
    );
    expect(context.diagnostics).toEqual([]);
    const metadata = context.format.getOntologyLoaderMetaData();
    expect(metadata.getTripleCount()).toBe(2);
    expect(metadata.getHeaderState()).toBe("PARSED_ONE_HEADER");
    expect(metadata.getUnparsedTriples()).toEqual([
      {
        subject: { termType: "BlankNode", value: expect.any(String) },
        predicate: { termType: "NamedNode", value: "urn:metadata:unknown" },
        object: {
          termType: "Literal",
          value: "0001",
          language: "",
          datatype: {
            termType: "NamedNode",
            value: "http://www.w3.org/2001/XMLSchema#integer",
          },
        },
      },
    ]);
    expect(manager.getOntologyFormat(ontology)).toBe(context.format);
    expect(() => {
      metadata.getUnparsedTriples()[0].object.value = "1";
    }).toThrow(TypeError);
    expect(() => metadata.getUnparsedTriples().pop()).toThrow(TypeError);
  });

  it("isolates per-load metadata and records inferred entity roles separately from declarations", async () => {
    const manager = owlapi.OWLManager.createOWLOntologyManager();
    const first = await load(
      manager,
      source(`
      :root a owl:Ontology . :C a owl:Class; :note "hello" .`),
      { parsingMode: "compatible" },
    );
    const second = await load(
      manager,
      source(`:D a owl:Class .`, { documentIRI: "urn:metadata:second" }),
    );
    const metadata = first.context.format.getOntologyLoaderMetaData();
    expect(metadata.getGuessedDeclarations()).toContainEqual({
      iri: owlapi.IRI.create("urn:metadata:note"),
      entityType: owlapi.OWLObjectKind.ANNOTATION_PROPERTY,
    });
    expect(
      metadata
        .getGuessedDeclarations()
        .some(({ iri }) => iri.value === "urn:metadata:C"),
    ).toBe(false);
    expect(
      second.context.format.getOntologyLoaderMetaData().getHeaderState(),
    ).toBe("PARSED_ZERO_HEADERS");
    expect(metadata.getHeaderState()).toBe("PARSED_ONE_HEADER");
    expect(
      owlapi.OWLDocumentFormats.TURTLE.getOntologyLoaderMetaData(),
    ).toBeUndefined();
    const snapshot = metadata.getUnparsedTriples();
    manager.addAxiom(
      first.ontology,
      manager
        .getOWLDataFactory()
        .getOWLDeclarationAxiom(
          manager
            .getOWLDataFactory()
            .getOWLClass(owlapi.IRI.create("urn:metadata:edited")),
        ),
    );
    expect(metadata.getUnparsedTriples()).toBe(snapshot);
    expect(
      manager.getOntologyFormat(first.ontology).getOntologyLoaderMetaData(),
    ).toBe(metadata);
    expect(manager.getOntologyFormat(manager.createOntology())).toBeUndefined();
    expect(() => manager.getOntologyFormat(new owlapi.OWLOntology())).toThrow();
  });
});
