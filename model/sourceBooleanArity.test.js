import { OWL2DLProfile, OWLManager, StringDocumentSource } from "../index.js";

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
