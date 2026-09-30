import {
  OWLManager,
  StringDocumentSource,
  StringDocumentTarget,
  OWLDocumentFormats,
} from "../index.js";

const prefix = "Prefix(:=<urn:preserve:>) ";
const declarations = `Declaration(Class(:A)) Declaration(Class(:B))
  Declaration(ObjectProperty(:p)) Declaration(DataProperty(:d))
  Declaration(NamedIndividual(:i)) Declaration(AnnotationProperty(:note))`;
const annotation = 'Annotation(:note "once")';
const fixtures = [
  [
    "OWLObjectIntersectionOf",
    "operands",
    "SubClassOf(:A ObjectIntersectionOf(:B :B))",
  ],
  ["OWLObjectUnionOf", "operands", "SubClassOf(:A ObjectUnionOf(:B :B))"],
  [
    "OWLDataIntersectionOf",
    "operands",
    "DataPropertyRange(:d DataIntersectionOf(xsd:string xsd:string))",
  ],
  [
    "OWLDataUnionOf",
    "operands",
    "DataPropertyRange(:d DataUnionOf(xsd:string xsd:string))",
  ],
  [
    "OWLEquivalentClassesAxiom",
    "classExpressions",
    `EquivalentClasses(${annotation} :A :A)`,
  ],
  [
    "OWLDisjointClassesAxiom",
    "classExpressions",
    `DisjointClasses(${annotation} :A :A)`,
  ],
  [
    "OWLDisjointUnionAxiom",
    "classExpressions",
    `DisjointUnion(${annotation} :A :B :B)`,
  ],
  [
    "OWLEquivalentObjectPropertiesAxiom",
    "properties",
    `EquivalentObjectProperties(${annotation} :p :p)`,
  ],
  [
    "OWLDisjointObjectPropertiesAxiom",
    "properties",
    `DisjointObjectProperties(${annotation} :p :p)`,
  ],
  [
    "OWLEquivalentDataPropertiesAxiom",
    "properties",
    `EquivalentDataProperties(${annotation} :d :d)`,
  ],
  [
    "OWLDisjointDataPropertiesAxiom",
    "properties",
    `DisjointDataProperties(${annotation} :d :d)`,
  ],
  [
    "OWLSameIndividualAxiom",
    "individuals",
    `SameIndividual(${annotation} :i :i)`,
  ],
  [
    "OWLDifferentIndividualsAxiom",
    "individuals",
    `DifferentIndividuals(${annotation} :i :i)`,
  ],
];

const find = (ontology, kind) => {
  const matches = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.kind === kind) matches.push(value);
    Object.values(value).forEach(visit);
  };
  [...ontology.getAxioms()].forEach(visit);
  return matches;
};
const keys = (ontology) =>
  [...ontology.getAxioms()].map((axiom) => axiom.structuralKey()).sort();

describe.each(fixtures)("source-preserving %s", (kind, field, body) => {
  test.each([OWLDocumentFormats.FUNCTIONAL, OWLDocumentFormats.RDF_XML])(
    "retains its singleton constructor and annotations through %s",
    async (format) => {
      const manager = OWLManager.createOWLOntologyManager();
      const ontology = await manager.loadOntologyFromOntologyDocument(
        new StringDocumentSource(
          `${prefix}Ontology(<urn:preserve:ontology> ${declarations} ${body})`,
          { format: "functional" },
        ),
        { parsingMode: "preserve" },
      );
      const [construct] = find(ontology, kind);
      expect(construct?.[field]).toHaveLength(1);
      if (body.includes(annotation))
        expect(construct.annotations).toHaveLength(1);
      const target = new StringDocumentTarget();
      await manager.saveOntology(ontology, format, target);
      const restored =
        await OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
          new StringDocumentSource(target.toString(), { format }),
          { parsingMode: "preserve" },
        );
      expect(keys(restored)).toEqual(keys(ontology));
      expect(find(restored, kind)[0]?.[field]).toHaveLength(1);
    },
  );
});

describe("source-preserving arity admission", () => {
  it("publishes immutable original-arity and typed-use evidence without inventing declarations", async () => {
    const result =
      await OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
        `${prefix}Ontology(SubClassOf(:B ObjectIntersectionOf(:A :A)))`,
        { format: "functional", parsingMode: "preserve" },
      );
    const structure = result.documents[0].context.sourceStructure;
    expect(structure).toMatchObject({
      version: 1,
      policy: "preserve",
      statements: [],
      arityWitnesses: [
        {
          kind: "OWLObjectIntersectionOf",
          field: "operands",
          minimum: 2,
          originalCount: 2,
        },
      ],
    });
    expect(structure.roles).toEqual(
      expect.arrayContaining([
        {
          iri: "urn:preserve:A",
          type: "http://www.w3.org/2002/07/owl#Class",
          origin: "use",
        },
        {
          iri: "urn:preserve:B",
          type: "http://www.w3.org/2002/07/owl#Class",
          origin: "use",
        },
      ]),
    );
    expect(Object.isFrozen(structure)).toBe(true);
    expect(Object.isFrozen(structure.arityWitnesses)).toBe(true);
    expect(Object.isFrozen(structure.arityWitnesses[0])).toBe(true);
    expect(
      [...result.ontology.getAxioms()].some(
        (axiom) => axiom.kind === "OWLDeclarationAxiom",
      ),
    ).toBe(false);
  });
  test.each(["ObjectIntersectionOf(:A)", "ObjectUnionOf()"])(
    "rejects original invalid arity %s",
    async (expression) => {
      await expect(
        OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
          `${prefix}Ontology(SubClassOf(:B ${expression}))`,
          { format: "functional", parsingMode: "preserve" },
        ),
      ).rejects.toThrow();
    },
  );
  test.each(["strict", "compatible"])(
    "keeps existing %s factory normalization",
    async (parsingMode) => {
      await expect(
        OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
          `${prefix}Ontology(SubClassOf(:B ObjectIntersectionOf(:A :A)))`,
          { format: "functional", parsingMode },
        ),
      ).rejects.toThrow();
    },
  );
});
