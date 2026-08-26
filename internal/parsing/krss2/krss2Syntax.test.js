import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { OWLOntologyManager } from "../../../index.js";
import { ParserDescriptor, OWLParserRegistry } from "../parserRegistry.js";
import { OWLObjectKind } from "../../../model/index.js";

import { OWLKRSS2SyntaxOWLParser } from "./parser.js";

const registry = new OWLParserRegistry([
  new ParserDescriptor({
    createParser: () => new OWLKRSS2SyntaxOWLParser(),
    detect: () => ({ result: "MATCH" }),
    format: OWLDocumentFormats.KRSS2,
    id: "test-krss2",
    priority: 16,
  }),
]);

const load = (text, values = {}) =>
  new OWLOntologyManager({ registry }).loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, {
      documentIRI: "urn:test:phase11",
      fileName: "phase11.krss2",
    }),
    new OWLOntologyLoaderConfiguration({
      format: OWLDocumentFormats.KRSS2,
      ...values,
    }),
  );

describe("KRSS2 structural parser", () => {
  it("maps class definitions and axioms directly to structural OWL", async () => {
    const ontology = await load(`
      (define-primitive-concept Person
        (and Mammal (some hasParent Person)))
      (define-concept Parent
        (and Person (at-least 1 hasChild Person)))
      (implies Parent Person)
      (disjoint Person Robot)
    `);

    expect(
      ontology.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM),
    ).toHaveProperty("size", 2);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.EQUIVALENT_CLASSES_AXIOM),
    ).toHaveProperty("size", 1);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.DISJOINT_CLASSES_AXIOM),
    ).toHaveProperty("size", 1);
    expect(
      [...ontology.getClassesInSignature()].map(({ iri }) => iri.value).sort(),
    ).toEqual([
      "urn:test:phase11#Mammal",
      "urn:test:phase11#Parent",
      "urn:test:phase11#Person",
      "urn:test:phase11#Robot",
    ]);
    expect(
      [...ontology.getObjectPropertiesInSignature()].map(
        ({ iri }) => iri.value,
      ),
    ).toEqual(
      expect.arrayContaining([
        "urn:test:phase11#hasChild",
        "urn:test:phase11#hasParent",
      ]),
    );
  });

  it("maps KRSS2 role and individual productions without an RDF round-trip", async () => {
    const ontology = await load(`
      (define-role parentAlias parent)
      (define-primitive-role parent
        :parent ancestor
        :domain Person
        :range Person
        :transitive t
        :symmetric nil
        :reflexive t
        :inverse child)
      (disjoint-roles parent enemy)
      (implies-role child guardian)
      (inverse guardian guardedBy)
      (roles-equivalent sibling relative)
      (role-inclusion (compose parent parent) ancestor)
      (transitive ancestor)
      (range ancestor Person)
      (instance alice Person)
      (related alice parent bob)
      (equal alice aliceAlias)
      (distinct alice bob)
    `);

    const expectedCounts = new Map([
      [OWLObjectKind.DECLARATION_AXIOM, 1],
      [OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM, 2],
      [OWLObjectKind.SUB_PROPERTY_CHAIN_AXIOM, 1],
      [OWLObjectKind.EQUIVALENT_OBJECT_PROPERTIES_AXIOM, 2],
      [OWLObjectKind.DISJOINT_OBJECT_PROPERTIES_AXIOM, 1],
      [OWLObjectKind.OBJECT_PROPERTY_DOMAIN_AXIOM, 1],
      [OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM, 2],
      [OWLObjectKind.INVERSE_OBJECT_PROPERTIES_AXIOM, 2],
      [OWLObjectKind.REFLEXIVE_OBJECT_PROPERTY_AXIOM, 1],
      [OWLObjectKind.TRANSITIVE_OBJECT_PROPERTY_AXIOM, 2],
      [OWLObjectKind.CLASS_ASSERTION_AXIOM, 1],
      [OWLObjectKind.OBJECT_PROPERTY_ASSERTION_AXIOM, 1],
      [OWLObjectKind.SAME_INDIVIDUAL_AXIOM, 1],
      [OWLObjectKind.DIFFERENT_INDIVIDUALS_AXIOM, 1],
    ]);
    for (const [kind, count] of expectedCounts) {
      expect(ontology.getAxiomsByType(kind)).toHaveProperty("size", count);
    }
  });

  it("rejects extensions beyond the binary KRSS2 class-axiom grammar", async () => {
    await expect(load("(equivalent Person Human Agent)")).rejects.toMatchObject(
      {
        code: "OWL_SYNTAX_ERROR",
        found: "Agent",
      },
    );
  });
});
