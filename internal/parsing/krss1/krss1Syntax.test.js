import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { OWLOntologyManager } from "../../../index.js";
import { OWLParserRegistry, ParserDescriptor } from "../parserRegistry.js";
import { OWLObjectKind } from "../../../model/index.js";

import { OWLKRSS1SyntaxOWLParser } from "./parser.js";

const registry = new OWLParserRegistry([
  new ParserDescriptor({
    createParser: () => new OWLKRSS1SyntaxOWLParser(),
    detect: () => ({ result: "MATCH" }),
    format: OWLDocumentFormats.KRSS1,
    id: "test-krss1",
    priority: 15,
  }),
]);

const load = (text, values = {}) =>
  new OWLOntologyManager({ registry }).loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, {
      documentIRI: "urn:test:phase17",
      fileName: "phase17.krss",
    }),
    new OWLOntologyLoaderConfiguration({
      format: OWLDocumentFormats.KRSS1,
      ...values,
    }),
  );

describe("KRSS1 structural parser", () => {
  it("maps the finite KRSS1 TBox and ABox production set", async () => {
    const ontology = await load(`
      (define-primitive-concept Person Mammal)
      (define-concept Parent (and Person (some hasChild Person)))
      (define-primitive-role hasChild hasRelative)
      (transitive hasRelative)
      (range hasChild Person)
      end-tbox
      (instance alice Parent)
      (related alice hasChild bob)
      (equal alice aliceAlias)
      (distinct alice bob)
      end-abox
    `);

    const expectedCounts = new Map([
      [OWLObjectKind.SUBCLASS_OF_AXIOM, 1],
      [OWLObjectKind.EQUIVALENT_CLASSES_AXIOM, 1],
      [OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM, 1],
      [OWLObjectKind.TRANSITIVE_OBJECT_PROPERTY_AXIOM, 1],
      [OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM, 1],
      [OWLObjectKind.CLASS_ASSERTION_AXIOM, 1],
      [OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM, 1],
      [OWLObjectKind.SAME_INDIVIDUAL_AXIOM, 1],
      [OWLObjectKind.DIFFERENT_INDIVIDUALS_AXIOM, 1],
    ]);
    for (const [kind, count] of expectedCounts) {
      expect(ontology.getAxiomsByType(kind)).toHaveProperty("size", count);
    }
  });

  describe.each(["strict", "compatible", "preserve"])(
    "unsupported clauses in %s",
    (parsingMode) => {
      it.each([":right-identity", ":RiGhT-IdEnTiTy"])(
        "rejects %s explicitly",
        async (attribute) => {
          await expect(
            load(`(define-primitive-role p q ${attribute} r)`, { parsingMode }),
          ).rejects.toMatchObject({
            code: "UNSUPPORTED_CONSTRUCT",
            format: "krss1",
            construct: ":right-identity",
            reason: "UNSUPPORTED_KRSS1_RIGHT_IDENTITY",
          });
        },
      );
      it.each([
        "(define-primitive-role p :right-identity r)",
        "(define-primitive-role p q :right-identity)",
        "(define-primitive-role p q :right-identity r",
        "(define-primitive-role p q :right-identity r :right-identity s)",
      ])(
        "keeps malformed local production %s as a syntax error",
        async (text) => {
          await expect(load(text, { parsingMode })).rejects.toMatchObject({
            code: "OWL_SYNTAX_ERROR",
          });
        },
      );
    },
  );

  it.each([true, false])(
    "honours sourceLocations=%s for unsupported clauses",
    async (sourceLocations) => {
      const text = "(define-primitive-role p q :right-identity r)";
      const error = await load(text, { sourceLocations }).catch(
        (cause) => cause,
      );
      expect(error.code).toBe("UNSUPPORTED_CONSTRUCT");
      if (sourceLocations)
        expect(error).toMatchObject({ line: 1, column: 28, offset: 27 });
      else expect(error).not.toHaveProperty("offset");
    },
  );

  it("rejects KRSS2-only top-level productions", async () => {
    await expect(load("(implies Person Mammal)")).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      found: "implies",
    });
  });
});
