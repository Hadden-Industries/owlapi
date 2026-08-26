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

  it("accepts :right-identity without inventing an OWL axiom", async () => {
    const ontology = await load(
      "(define-primitive-role hasChild hasRelative :right-identity identityRole)",
    );

    // OWLAPI's KRSS1 parser consumes this legacy KRSS clause but exposes only
    // the sub-property axiom; preserving that observable contract is safer than
    // guessing a property-chain meaning absent from the public KRSS1 surface.
    expect(ontology.getAxioms()).toHaveProperty("size", 1);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM),
    ).toHaveProperty("size", 1);
  });

  it("rejects KRSS2-only top-level productions", async () => {
    await expect(load("(implies Person Mammal)")).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      found: "implies",
    });
  });
});
