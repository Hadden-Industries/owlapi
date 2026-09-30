import {
  IRI,
  OWLDataFactory,
  OWLDocumentFormats,
  OWLManager,
  StringDocumentSource,
  StringDocumentTarget,
} from "../index.js";

const huge = "9007199254740993";
const larger = "123456789012345678901234567890";
const owl = "http://www.w3.org/2002/07/owl#";
const rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const rdfs = "http://www.w3.org/2000/01/rdf-schema#";
const xsd = "http://www.w3.org/2001/XMLSchema#";
const factory = new OWLDataFactory();
const property = factory.getOWLObjectProperty(IRI.create("urn:card:p"));
const dataProperty = factory.getOWLDataProperty(IRI.create("urn:card:d"));
const filler = factory.getOWLClass(IRI.create("urn:card:B"));
const datatype = factory.getOWLDatatype(IRI.create(`${xsd}string`));
const constructors = [
  ...["Min", "Max", "Exact"].map((kind) => [
    `getOWLObject${kind}Cardinality`,
    property,
    filler,
  ]),
  ...["Min", "Max", "Exact"].map((kind) => [
    `getOWLData${kind}Cardinality`,
    dataProperty,
    datatype,
  ]),
];

const values = (ontology) => {
  const result = [];
  const seen = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Object.hasOwn(value, "cardinality")) result.push(value.cardinality);
    Object.values(value).forEach(visit);
  };
  [...ontology.getAxioms()].forEach(visit);
  return result;
};

const triples = (count) => `
<urn:card:ontology> <${rdf}type> <${owl}Ontology> .
<urn:card:A> <${rdf}type> <${owl}Class> .
<urn:card:B> <${rdf}type> <${owl}Class> .
<urn:card:p> <${rdf}type> <${owl}ObjectProperty> .
<urn:card:A> <${rdfs}subClassOf> _:restriction .
_:restriction <${rdf}type> <${owl}Restriction> .
_:restriction <${owl}onProperty> <urn:card:p> .
_:restriction <${owl}minQualifiedCardinality> "${count}"^^<${xsd}nonNegativeInteger> .
_:restriction <${owl}onClass> <urn:card:B> .`;

const sources = [
  [
    "functional",
    (count) => `Ontology(<urn:card:ontology>
    Declaration(Class(<urn:card:A>)) Declaration(Class(<urn:card:B>))
    Declaration(ObjectProperty(<urn:card:p>))
    SubClassOf(<urn:card:A> ObjectMinCardinality(${count} <urn:card:p> <urn:card:B>)))`,
  ],
  [
    "manchester",
    (count) => `Prefix: : <urn:card:>
    Ontology: <urn:card:ontology>
    ObjectProperty: :p
    Class: :B
    Class: :A SubClassOf: :p min ${count} :B`,
  ],
  [
    "owlxml",
    (count) => `<Ontology xmlns="${owl}" ontologyIRI="urn:card:ontology">
    <Declaration><Class IRI="urn:card:A"/></Declaration>
    <Declaration><Class IRI="urn:card:B"/></Declaration>
    <Declaration><ObjectProperty IRI="urn:card:p"/></Declaration>
    <SubClassOf><Class IRI="urn:card:A"/><ObjectMinCardinality cardinality="${count}">
    <ObjectProperty IRI="urn:card:p"/><Class IRI="urn:card:B"/>
    </ObjectMinCardinality></SubClassOf></Ontology>`,
  ],
  ["dl", (count) => `A ⊑ ≥ ${count} p.B`],
  ...["krss1", "krss2"].map((format) => [
    format,
    (count) => `
    (define-primitive-role p ${format === "krss1" ? "q" : ""})
    (define-primitive-concept B top)
    (define-concept A (at-least ${count} p B))`,
  ]),
  [
    "rdfxml",
    (
      count,
    ) => `<rdf:RDF xmlns:rdf="${rdf}" xmlns:owl="${owl}" xmlns:rdfs="${rdfs}">
    <owl:Ontology rdf:about="urn:card:ontology"/>
    <owl:Class rdf:about="urn:card:B"/>
    <owl:ObjectProperty rdf:about="urn:card:p"/>
    <owl:Class rdf:about="urn:card:A"><rdfs:subClassOf><owl:Restriction>
    <owl:onProperty rdf:resource="urn:card:p"/>
    <owl:minQualifiedCardinality rdf:datatype="${xsd}nonNegativeInteger">${count}</owl:minQualifiedCardinality>
    <owl:onClass rdf:resource="urn:card:B"/>
    </owl:Restriction></rdfs:subClassOf></owl:Class></rdf:RDF>`,
  ],
  ...["turtle", "trig", "ntriples", "nquads"].map((format) => [
    format,
    triples,
  ]),
  [
    "jsonld",
    (count) =>
      JSON.stringify([
        { "@id": "urn:card:ontology", "@type": `${owl}Ontology` },
        {
          "@id": "urn:card:A",
          "@type": `${owl}Class`,
          [`${rdfs}subClassOf`]: { "@id": "_:restriction" },
        },
        { "@id": "urn:card:B", "@type": `${owl}Class` },
        { "@id": "urn:card:p", "@type": `${owl}ObjectProperty` },
        {
          "@id": "_:restriction",
          "@type": `${owl}Restriction`,
          [`${owl}onProperty`]: { "@id": "urn:card:p" },
          [`${owl}onClass`]: { "@id": "urn:card:B" },
          [`${owl}minQualifiedCardinality`]: {
            "@value": count,
            "@type": `${xsd}nonNegativeInteger`,
          },
        },
      ]),
  ],
];

describe("lossless non-negative cardinalities", () => {
  test.each([
    [0, 0],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    ["0007", 7],
    [huge, huge],
    [`000${huge}`, huge],
    [larger, larger],
  ])(
    "factory preserves %s without rounding or BigInt fields",
    (input, expected) => {
      for (const [method, selectedProperty, selectedFiller] of constructors) {
        const expression = factory[method](
          input,
          selectedProperty,
          selectedFiller,
        );
        expect(expression.cardinality).toBe(expected);
        expect(() =>
          JSON.stringify(expression.toStructuralTuple()),
        ).not.toThrow();
        expect(
          expression.equals(
            factory[method](String(expected), selectedProperty, selectedFiller),
          ),
        ).toBe(true);
      }
    },
  );

  test.each([
    Number.MAX_SAFE_INTEGER + 1,
    NaN,
    Infinity,
    -1,
    1.5,
    "",
    "-1",
    "+1",
    "1e3",
    "1.0",
    1n,
  ])("rejects unsafe or non-decimal factory input %s", (input) => {
    expect(() =>
      factory.getOWLObjectMinCardinality(input, property, filler),
    ).toThrow();
  });

  describe.each(sources)("%s parser", (format, source) => {
    test.each(["1", huge, larger])(
      "retains cardinality %s through the public manager",
      async (count) => {
        const manager = OWLManager.createOWLOntologyManager();
        const ontology = await manager.loadOntologyFromOntologyDocument(
          new StringDocumentSource(source(count), {
            documentIRI: "urn:card:document",
          }),
          { format, parsingMode: "strict" },
        );
        expect(values(ontology)).toEqual([count === "1" ? 1 : count]);
      },
    );
  });

  test.each([OWLDocumentFormats.FUNCTIONAL, OWLDocumentFormats.RDF_XML])(
    "round-trips all six huge-cardinality constructors through %s storage",
    async (format) => {
      const manager = OWLManager.createOWLOntologyManager();
      const ontology = manager.createOntology();
      const subject = factory.getOWLClass(IRI.create("urn:card:A"));
      for (const entity of [
        subject,
        filler,
        property,
        dataProperty,
        datatype,
      ]) {
        manager.addAxiom(ontology, factory.getOWLDeclarationAxiom(entity));
      }
      for (const [method, selectedProperty, selectedFiller] of constructors) {
        manager.addAxiom(
          ontology,
          factory.getOWLSubClassOfAxiom(
            subject,
            factory[method](huge, selectedProperty, selectedFiller),
          ),
        );
      }
      const target = new StringDocumentTarget();
      await manager.saveOntology(ontology, format, target);
      const restored =
        await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
          new StringDocumentSource(target.toString()),
          { format },
        );
      expect(
        [...restored.getAxioms()].map((axiom) => axiom.structuralKey()).sort(),
      ).toEqual(
        [...ontology.getAxioms()].map((axiom) => axiom.structuralKey()).sort(),
      );
      expect(values(restored)).toHaveLength(6);
      expect(values(restored).every((value) => value === huge)).toBe(true);
    },
  );
});
