import {
  OWL2DLProfile,
  OWLDocumentFormats,
  OWLManager,
  StringDocumentSource,
  StringDocumentTarget,
} from "../index.js";

const booleanKinds = [
  ["and", "OWLObjectIntersectionOf"],
  ["or", "OWLObjectUnionOf"],
];

const source = (format, expression) =>
  format === "dl" ? `A sub ${expression}` : `(define-concept A ${expression})`;

const booleanSource = (format, operator, operands) =>
  source(
    format,
    format === "dl"
      ? operands.join(` ${operator} `)
      : `(${operator} ${operands.join(" ")})`,
  );

const load = (format, text, parsingMode = "preserve") =>
  OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
    new StringDocumentSource(text, {
      format,
      documentIRI: "urn:boolean:source",
    }),
    { parsingMode },
  );

const expressions = (ontology, kind) => {
  const found = [];
  const seen = new Set();
  const pending = [...ontology.getAxioms()];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (value.kind === kind) found.push(value);
    pending.push(...Object.values(value));
  }
  return found;
};

describe.each(["dl", "krss1", "krss2"])("%s Boolean source arity", (format) => {
  test.each(booleanKinds)(
    "retains a repeated %s operand as a qualified singleton constructor",
    async (operator, kind) => {
      const result = await load(
        format,
        booleanSource(format, operator, ["B", "B"]),
      );
      const [expression] = expressions(result.ontology, kind);
      expect(expression?.operands).toHaveLength(1);
      expect(
        result.documents[0].context.sourceStructure.arityWitnesses,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind,
            field: "operands",
            minimum: 2,
            originalCount: 2,
          }),
        ]),
      );
      const report = await new OWL2DLProfile().checkOntology(result.ontology, {
        sourceAssessment: true,
      });
      expect(report.sourceAssessment.status).toBe("valid");
    },
  );

  test.each(booleanKinds)(
    "keeps the original %s count when distinct operands remain",
    async (operator, kind) => {
      const result = await load(
        format,
        booleanSource(format, operator, ["B", "C", "B"]),
      );
      const [expression] = expressions(result.ontology, kind);
      expect(expression?.operands).toHaveLength(2);
      expect(
        result.documents[0].context.sourceStructure.arityWitnesses,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind,
            field: "operands",
            minimum: 2,
            originalCount: 3,
          }),
        ]),
      );
    },
  );

  test("does not turn an atomic expression into a Boolean constructor", async () => {
    const result = await load(format, source(format, "B"));
    for (const [, kind] of booleanKinds)
      expect(expressions(result.ontology, kind)).toHaveLength(0);
  });

  test("retains nested duplicate constructors without flattening", async () => {
    const expression =
      format === "dl" ? "(B and B) or (B and B)" : "(or (and B B) (and B B))";
    const result = await load(format, source(format, expression));
    const [union] = expressions(result.ontology, "OWLObjectUnionOf");
    expect(union?.operands).toHaveLength(1);
    expect(union.operands[0].kind).toBe("OWLObjectIntersectionOf");
    expect(union.operands[0].operands).toHaveLength(1);
    const report = await new OWL2DLProfile().checkOntology(result.ontology, {
      sourceAssessment: true,
    });
    expect(report.sourceAssessment.status).toBe("valid");
  });

  describe.each(["strict", "compatible"])("%s parsing", (parsingMode) => {
    test.each(booleanKinds)(
      "keeps existing duplicate %s behavior",
      async (operator, kind) => {
        const pending = load(
          format,
          booleanSource(format, operator, ["B", "B"]),
          parsingMode,
        );
        if (format === "dl") {
          const result = await pending;
          expect(expressions(result.ontology, kind)).toHaveLength(0);
          expect([...result.ontology.getAxioms()][0].superClass.kind).toBe(
            "OWLClass",
          );
        } else {
          await expect(pending).rejects.toMatchObject({
            code: "OWL_SYNTAX_ERROR",
          });
        }
      },
    );
  });
});

describe.each(["krss1", "krss2"])(
  "%s original invalid Boolean arity",
  (format) => {
    test.each(["(and)", "(and B)", "(or)", "(or B)"])(
      "rejects %s without inventing a second operand",
      async (expression) => {
        await expect(
          load(format, source(format, expression)),
        ).rejects.toMatchObject({
          code: "OWL_SYNTAX_ERROR",
        });
      },
    );
  },
);

describe("RDF Boolean constructor arity", () => {
  const rdf = `
    @prefix owl: <http://www.w3.org/2002/07/owl#> .
    @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
    @prefix : <urn:owlapi:singleton:> .
    :ontology a owl:Ontology .
    :UnionSubject a owl:Class ; rdfs:subClassOf [a owl:Class ; owl:unionOf (:B)] .
    :IntersectionSubject a owl:Class ; rdfs:subClassOf [a owl:Class ; owl:intersectionOf (:C)] .
    :PairSubject a owl:Class ; rdfs:subClassOf [a owl:Class ; owl:unionOf (:B :C)] .
    :LegacySubject a owl:Class ; owl:unionOf (:B) .
    :B a owl:Class .
    :C a owl:Class .
  `;
  const read = (manager, text, format, parsingMode) =>
    manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(text, { format }),
      { parsingMode },
    );
  const operandCounts = (ontology, kind) =>
    expressions(ontology, kind)
      .map(({ operands }) => operands.length)
      .sort((left, right) => left - right);

  test.each([
    ["java-owlapi-5.5.1", "compatible", [1, 1, 2], [1]],
    ["java-owlapi-5.5.1", "strict", [2], []],
    ["normative-v1", "compatible", [2], []],
  ])(
    "%s in %s mode reconstructs the expected unions and intersections",
    async (behaviorProfileId, parsingMode, union, intersection) => {
      const manager = OWLManager.createOWLOntologyManager({
        behaviorProfileId,
      });
      const ontology = await read(
        manager,
        rdf,
        OWLDocumentFormats.TURTLE,
        parsingMode,
      );
      expect(operandCounts(ontology, "OWLObjectUnionOf")).toEqual(union);
      expect(operandCounts(ontology, "OWLObjectIntersectionOf")).toEqual(
        intersection,
      );
    },
  );

  test.each([
    ["turtle", rdf.replace("owl:unionOf (:B)", "owl:unionOf (:B :B)")],
    [
      "functional",
      "Ontology(<urn:singleton:strict> SubClassOf(<urn:A> ObjectUnionOf(<urn:B> <urn:B>)))",
    ],
    [
      "owlxml",
      `<Ontology xmlns="http://www.w3.org/2002/07/owl#" ontologyIRI="urn:singleton:strict">
        <SubClassOf><Class IRI="urn:A"/><ObjectUnionOf>
          <Class IRI="urn:B"/><Class IRI="urn:B"/>
        </ObjectUnionOf></SubClassOf>
      </Ontology>`,
    ],
    [
      "manchester",
      "Ontology: <urn:singleton:strict>\nClass: <urn:A>\n SubClassOf: <urn:B> or <urn:B>",
    ],
  ])("strict Java %s rejects duplicate-only operands", async (format, text) => {
    const manager = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    await expect(read(manager, text, format, "strict")).rejects.toThrow(
      RangeError,
    );
  });

  test.each([OWLDocumentFormats.FUNCTIONAL, OWLDocumentFormats.RDF_XML])(
    "Java-compatible singleton constructors survive storage in %s",
    async (format) => {
      const options = { behaviorProfileId: "java-owlapi-5.5.1" };
      const manager = OWLManager.createOWLOntologyManager(options);
      const original = await read(
        manager,
        rdf,
        OWLDocumentFormats.TURTLE,
        "compatible",
      );
      expect(operandCounts(original, "OWLObjectUnionOf")).toEqual([1, 1, 2]);
      const destination = new StringDocumentTarget();
      await manager.saveOntology(original, format, destination);
      const restored = await read(
        OWLManager.createOWLOntologyManager(options),
        destination.toString(),
        format,
        "compatible",
      );
      const keys = (ontology) =>
        [...ontology.getAxioms()].map((axiom) => axiom.structuralKey()).sort();
      expect(keys(restored)).toEqual(keys(original));
    },
  );
});
