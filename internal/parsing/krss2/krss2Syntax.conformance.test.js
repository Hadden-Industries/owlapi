import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { OWLManager } from "../../../index.js";
import { OWLObjectKind } from "../../../model/index.js";

const load = (text) =>
  OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
    new StringDocumentSource(text, {
      documentIRI: "urn:test:krss2-conformance",
      fileName: "conformance.krss2",
    }),
    new OWLOntologyLoaderConfiguration({ format: OWLDocumentFormats.KRSS2 }),
  );

describe("KRSS2 grammar conformance", () => {
  it("supports every required class-expression production", async () => {
    const ontology = await load(`
      (define-concept Complete
        (and
          (or A (not B))
          (some (inv child) Parent)
          (all parent Person)
          (at-least 1 child)
          (at-most 2 child Person)
          (exactly 1 parent Person)))
    `);
    const [axiom] = ontology.getAxiomsByType(
      OWLObjectKind.EQUIVALENT_CLASSES_AXIOM,
    );

    expect(axiom.classExpressions).toHaveLength(2);
    expect(axiom.structuralKey()).toEqual(
      expect.stringContaining("OWLObjectExactCardinality"),
    );
    expect(axiom.structuralKey()).toEqual(
      expect.stringContaining("OWLObjectInverseOf"),
    );
  });

  it("supports positional parents and the complete primitive-role attribute set", async () => {
    const ontology = await load(`
      (define-primitive-role child parent
        :right-identity sibling
        :parents (ancestor guardian)
        :domain (Person Agent)
        :range (Person Mammal)
        :transitive nil
        :symmetric t
        :reflexive nil
        :inverse (inv parent))
      (define-primitive-role parent
        :left-identity ancestor)
    `);

    expect(
      ontology.getAxiomsByType(OWLObjectKind.DECLARATION_AXIOM),
    ).toHaveProperty("size", 2);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.SUB_OBJECT_PROPERTY_AXIOM),
    ).toHaveProperty("size", 3);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.SUB_PROPERTY_CHAIN_AXIOM),
    ).toHaveProperty("size", 2);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.OBJECT_PROPERTY_DOMAIN_AXIOM),
    ).toHaveProperty("size", 2);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.OBJECT_PROPERTY_RANGE_AXIOM),
    ).toHaveProperty("size", 2);
    expect(
      ontology.getAxiomsByType(OWLObjectKind.SYMMETRIC_OBJECT_PROPERTY_AXIOM),
    ).toHaveProperty("size", 1);
  });

  it("treats grammar keywords case-insensitively and accepts integer names", async () => {
    const ontology = await load("(IMPLIES 101 TOP)(instance 7 BOTTOM)");

    expect(ontology.getAxioms()).toHaveProperty("size", 2);
    expect(
      [...ontology.getIndividualsInSignature()].map(({ iri }) => iri.value),
    ).toEqual(["urn:test:krss2-conformance#7"]);
  });

  it("rejects primitive-role attributes outside their grammar order", async () => {
    await expect(
      load("(define-primitive-role child :range Person :domain Agent)"),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR", found: ":domain" });
  });

  it("rejects the OWLAPI-documented unsupported datatype-property family", async () => {
    await expect(load("(define-data-role age)")).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      found: "define-data-role",
    });
  });

  it("requires TBox statements to precede ABox statements", async () => {
    await expect(
      load("(instance alice Person)(implies Person Agent)"),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      found: "implies",
    });
  });

  it("preserves absolute IRI names and rejects reserved words as entities", async () => {
    const ontology = await load(
      "(implies <urn:test:absolute#Person> urn:test:absolute#Agent)",
    );

    expect(
      [...ontology.getClassesInSignature()].map(({ iri }) => iri.value).sort(),
    ).toEqual(["urn:test:absolute#Agent", "urn:test:absolute#Person"]);
    await expect(load("(implies Person related)")).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      found: "related",
    });
  });

  it("supports the optional TBox and ABox document delimiters", async () => {
    const ontology = await load(
      "(implies Person Agent) end-tbox (instance alice Person) end-abox",
    );

    expect(ontology.getAxioms()).toHaveProperty("size", 2);
    await expect(
      load("(implies Person Agent) end-abox (instance alice Person)"),
    ).rejects.toMatchObject({
      code: "OWL_SYNTAX_ERROR",
      found: "instance",
    });
  });

  it("requires non-empty parent lists and binary right-nested compositions", async () => {
    await expect(
      load("(define-primitive-role child :parents ())"),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
    await expect(
      load("(role-inclusion (compose first second third) super)"),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR", found: "third" });

    await expect(
      load("(role-inclusion (compose first (compose second third)) super)"),
    ).resolves.toBeDefined();
  });
});
