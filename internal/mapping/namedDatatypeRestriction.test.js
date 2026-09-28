import {
  OWLDocumentFormats,
  OWLManager,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
  StringDocumentTarget,
} from "../../index.js";

const prefixes = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
<urn:ontology> a owl:Ontology .`;
const restriction = `<urn:code> a rdfs:Datatype; rdfs:label "Code";
  owl:onDatatype xsd:string; owl:withRestrictions ([xsd:pattern "[A-Z]+"] [xsd:minLength 2]).
<urn:property> a owl:DatatypeProperty; rdfs:range <urn:code>.`;
const load = (body = restriction, parsingMode = "compatible") =>
  OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(`${prefixes}\n${body}`, {
      contentType: "text/turtle",
    }),
    new OWLOntologyLoaderConfiguration({ parsingMode, collectWarnings: true }),
  );

test("compatible parsing retains a named restriction as a datatype definition, without changing references", async () => {
  const { ontology, documents } = await load();
  const definitions = [
    ...ontology.getAxiomsByType("OWLDatatypeDefinitionAxiom"),
  ];
  expect(definitions).toHaveLength(1);
  expect(definitions[0]).toMatchObject({
    datatype: { iri: { value: "urn:code" } },
    dataRange: {
      kind: "OWLDatatypeRestriction",
      datatype: { iri: { value: "http://www.w3.org/2001/XMLSchema#string" } },
    },
  });
  expect(definitions[0].dataRange.facetRestrictions).toHaveLength(2);
  expect(
    [...ontology.getAxiomsByType("OWLDataPropertyRangeAxiom")][0].range,
  ).toMatchObject({
    kind: "OWLDatatype",
    iri: { value: "urn:code" },
  });
  expect([
    ...ontology.getAxiomsByType("OWLAnnotationAssertionAxiom"),
  ]).toHaveLength(1);
  expect(documents[0].context.diagnostics).toEqual([
    expect.objectContaining({
      code: "RDF_NAMED_DATATYPE_RESTRICTION",
      iri: "urn:code",
    }),
  ]);
});

test("strict parsing still rejects a restriction outside the normative blank-node mapping", async () => {
  await expect(load(restriction, "strict")).rejects.toThrow(/unconsumed/i);
});

test.each([OWLDocumentFormats.FUNCTIONAL, OWLDocumentFormats.RDF_XML])(
  "compatible recovery preserves annotations on both restriction links through strict %s reload",
  async (format) => {
    const manager = OWLManager.createOWLOntologyManager();
    const { ontology, documents } =
      await manager.loadOntologyGraphFromOntologyDocument(
        new StringDocumentSource(
          `${prefixes}
<urn:code> a rdfs:Datatype; owl:onDatatype xsd:string; owl:withRestrictions _:facets.
_:facets a <http://www.w3.org/1999/02/22-rdf-syntax-ns#List>;
  <http://www.w3.org/1999/02/22-rdf-syntax-ns#first> [xsd:pattern "[A-Z]+"];
  <http://www.w3.org/1999/02/22-rdf-syntax-ns#rest> <http://www.w3.org/1999/02/22-rdf-syntax-ns#nil>.
_:baseAnnotation a owl:Axiom; owl:annotatedSource <urn:code>;
  owl:annotatedProperty owl:onDatatype; owl:annotatedTarget xsd:string;
  rdfs:comment "Base datatype".
_:facetAnnotation a owl:Axiom; owl:annotatedSource <urn:code>;
  owl:annotatedProperty owl:withRestrictions; owl:annotatedTarget _:facets;
  rdfs:comment "Facet constraints".
_:nested a owl:Annotation; owl:annotatedSource _:facetAnnotation;
  owl:annotatedProperty rdfs:comment; owl:annotatedTarget "Facet constraints";
  rdfs:label "Annotation provenance".`,
          { contentType: "text/turtle" },
        ),
        { parsingMode: "compatible", collectWarnings: true },
      );
    const [definition] = ontology.getAxiomsByType("OWLDatatypeDefinitionAxiom");
    expect(definition.annotations).toHaveLength(2);
    expect(definition.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: expect.objectContaining({ lexicalForm: "Base datatype" }),
        }),
        expect.objectContaining({
          value: expect.objectContaining({ lexicalForm: "Facet constraints" }),
          annotations: [
            expect.objectContaining({
              value: expect.objectContaining({
                lexicalForm: "Annotation provenance",
              }),
            }),
          ],
        }),
      ]),
    );
    expect(documents[0].context.diagnostics.map(({ code }) => code)).toEqual([
      "RDF_NAMED_DATATYPE_RESTRICTION",
    ]);
    const target = new StringDocumentTarget();
    await manager.saveOntology(ontology, format, target);
    const reloaded =
      await OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
        new StringDocumentSource(target.toString()),
        {
          parsingMode: "strict",
          collectWarnings: true,
        },
      );
    expect(
      [
        ...reloaded.ontology.getAxiomsByType("OWLDatatypeDefinitionAxiom"),
      ][0].structuralKey(),
    ).toBe(definition.structuralKey());
    expect(reloaded.documents[0].context.diagnostics).toEqual([]);
  },
);

test.each([
  'owl:onDatatype xsd:string; owl:onDatatype xsd:integer; owl:withRestrictions ([xsd:pattern "x"])',
  "owl:onDatatype xsd:string; owl:withRestrictions ()",
  'owl:onDatatype xsd:string; owl:withRestrictions ([xsd:pattern "x"; xsd:minLength 2])',
  "owl:onDatatype xsd:string; owl:withRestrictions ([xsd:pattern <urn:not-a-literal>])",
])(
  "compatible parsing does not accept a malformed named restriction: %s",
  async (body) => {
    await expect(
      load(`<urn:code> a rdfs:Datatype; ${body}.`),
    ).rejects.toThrow();
  },
);

test("recovery does not manufacture a datatype definition on an unrelated named individual", async () => {
  const { ontology, documents } = await load(
    '<urn:individual> a owl:NamedIndividual; owl:onDatatype xsd:string; owl:withRestrictions ([xsd:pattern "x"]).',
  );
  expect(ontology.getAxiomsByType("OWLDatatypeDefinitionAxiom").size).toBe(0);
  expect(
    documents[0].context.diagnostics.some(({ code }) =>
      code.startsWith("RDF_UNCONSUMED"),
    ),
  ).toBe(true);
});
