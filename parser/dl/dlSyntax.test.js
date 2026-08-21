import {
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import { OWLManager } from "../../manager/index.js";
import { OWLParserRegistry } from "../../manager/parserRegistry.js";
import { IRI, OWLObjectKind } from "../../model/index.js";

import { dlSyntaxParserDescriptor } from "./descriptor.js";

describe("OWL DL Syntax", () => {
  const documentIRI = "urn:test:dl-document";
  const createManager = () =>
    OWLManager.createOWLOntologyManager({
      registry: new OWLParserRegistry([dlSyntaxParserDescriptor]),
    });
  const load = (manager, text, configuration = {}) =>
    manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(text, { documentIRI }),
      new OWLOntologyLoaderConfiguration({
        format: "dl",
        ...configuration,
      }),
    );
  const expectAxioms = (ontology, expected) => {
    const keys = (values) =>
      [...values].map((value) => value.structuralKey()).sort();
    expect(keys(ontology.getAxioms())).toEqual(keys(expected));
  };

  it("positively detects a bounded DL axiom and rejects unrelated syntaxes", () => {
    const registry = new OWLParserRegistry([dlSyntaxParserDescriptor]);
    const [matching] = registry.resolveCandidates(
      new StringDocumentSource("Person \\sqsubseteq Agent"),
    );
    const [unrelated] = registry.resolveCandidates(
      new StringDocumentSource("Ontology(Declaration(Class(<urn:test:A>)))"),
    );

    expect(matching.detection).toEqual({
      reason: "A DL Syntax axiom operator was found",
      reasonCode: "DL_AXIOM_OPERATOR",
      result: "MATCH",
    });
    expect(matching.eligible).toBe(true);
    expect(unrelated.detection.result).toBe("NO_MATCH");
    expect(unrelated.eligible).toBe(false);
  });

  it("constructs a subclass axiom with document-scoped entity IRIs", async () => {
    const manager = createManager();
    const ontology = await load(manager, "Person \\sqsubseteq Agent\n");

    const [axiom] = ontology.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM);
    expect(axiom.subClass.iri.value).toBe("urn:test:dl-document#Person");
    expect(axiom.superClass.iri.value).toBe("urn:test:dl-document#Agent");
  });

  it("isolates anonymous documents in deterministic per-load namespaces", async () => {
    const manager = createManager();
    const first = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource("A ⊑ B", { fileName: "first.dl" }),
      new OWLOntologyLoaderConfiguration({ format: "dl" }),
    );
    const second = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource("A ⊑ B", { fileName: "second.dl" }),
      new OWLOntologyLoaderConfiguration({ format: "dl" }),
    );
    const [firstAxiom] = first.getAxioms();
    const [secondAxiom] = second.getAxioms();

    expect(firstAxiom.subClass.iri.value).toMatch(
      /^urn:owlapi-js:dl-document:\d+#A$/u,
    );
    expect(secondAxiom.subClass.iri.value).toMatch(
      /^urn:owlapi-js:dl-document:\d+#A$/u,
    );
    expect(firstAxiom.subClass.iri.value).not.toBe(
      secondAxiom.subClass.iri.value,
    );
  });

  it.each(["strict", "compatible"])(
    "keeps the grammar boundary identical in %s mode",
    async (parsingMode) => {
      const manager = createManager();
      await expect(
        load(manager, "A ⊑ B\n", { parsingMode }),
      ).resolves.toBeDefined();
      await expect(load(manager, "A ⊑", { parsingMode })).rejects.toMatchObject(
        {
          code: "OWL_SYNTAX_ERROR",
        },
      );
    },
  );

  it("accepts the OWLAPI ASCII, TeX, and Unicode axiom aliases", async () => {
    const manager = createManager();
    const ontology = await load(
      manager,
      [
        "A -> B",
        "C sub D",
        "E ⊑ F",
        "G \\sqsubseteq H",
        "I ≡ J",
        "K == L",
        "M \\equiv N",
        "a ≠ b ≠ c",
        "d != e",
        "f \\not= g",
        "h = i",
        "j equal k",
      ].join("\n"),
    );
    const factory = manager.getOWLDataFactory();
    const iri = (name) => IRI.create(`${documentIRI}#${name}`);
    const cls = (name) => factory.getOWLClass(iri(name));
    const individual = (name) => factory.getOWLNamedIndividual(iri(name));

    expectAxioms(ontology, [
      factory.getOWLSubClassOfAxiom(cls("A"), cls("B")),
      factory.getOWLSubClassOfAxiom(cls("C"), cls("D")),
      factory.getOWLSubClassOfAxiom(cls("E"), cls("F")),
      factory.getOWLSubClassOfAxiom(cls("G"), cls("H")),
      factory.getOWLEquivalentClassesAxiom([cls("I"), cls("J")]),
      factory.getOWLEquivalentClassesAxiom([cls("K"), cls("L")]),
      factory.getOWLEquivalentClassesAxiom([cls("M"), cls("N")]),
      factory.getOWLDifferentIndividualsAxiom([
        individual("a"),
        individual("b"),
        individual("c"),
      ]),
      factory.getOWLDifferentIndividualsAxiom([
        individual("d"),
        individual("e"),
      ]),
      factory.getOWLDifferentIndividualsAxiom([
        individual("f"),
        individual("g"),
      ]),
      factory.getOWLSameIndividualAxiom([individual("h"), individual("i")]),
      factory.getOWLSameIndividualAxiom([individual("j"), individual("k")]),
    ]);
  });

  it.each(["\\sqsubseteqClass", "⊑Class", "R⁺Class"])(
    "keeps the operator-like identifier %s intact under longest-token matching",
    async (name) => {
      const manager = createManager();
      const ontology = await load(manager, `${name} ⊑ B`);
      const [axiom] = ontology.getAxioms();

      expect(axiom.subClass.iri.value).toBe(`${documentIRI}#${name}`);
    },
  );

  it("parses Boolean, quantified, inverse, cardinality, nominal, and data-value expressions", async () => {
    const manager = createManager();
    const ontology = await load(
      manager,
      [
        "(A and (B or not C)) ⊑ forall hasPart.D",
        "exists hasChild.(Person and Parent) ⊑ ≥ 2 hasFriend.Person",
        "{alice bob} ≡ (= 1 knows^- top)",
        "exists age.{1 2.5} ⊑ Adult",
      ].join("\n"),
    );
    const factory = manager.getOWLDataFactory();
    const iri = (name) => IRI.create(`${documentIRI}#${name}`);
    const cls = (name) => factory.getOWLClass(iri(name));
    const property = (name) => factory.getOWLObjectProperty(iri(name));
    const individual = (name) => factory.getOWLNamedIndividual(iri(name));
    const integer = IRI.create("http://www.w3.org/2001/XMLSchema#integer");
    const double = IRI.create("http://www.w3.org/2001/XMLSchema#double");

    expectAxioms(ontology, [
      factory.getOWLSubClassOfAxiom(
        factory.getOWLObjectIntersectionOf([
          cls("A"),
          factory.getOWLObjectUnionOf([
            cls("B"),
            factory.getOWLObjectComplementOf(cls("C")),
          ]),
        ]),
        factory.getOWLObjectAllValuesFrom(property("hasPart"), cls("D")),
      ),
      factory.getOWLSubClassOfAxiom(
        factory.getOWLObjectSomeValuesFrom(
          property("hasChild"),
          factory.getOWLObjectIntersectionOf([cls("Person"), cls("Parent")]),
        ),
        factory.getOWLObjectMinCardinality(
          2,
          property("hasFriend"),
          cls("Person"),
        ),
      ),
      factory.getOWLEquivalentClassesAxiom([
        factory.getOWLObjectOneOf([individual("alice"), individual("bob")]),
        factory.getOWLObjectExactCardinality(
          1,
          factory.getOWLObjectInverseOf(property("knows")),
          factory.getOWLClass(
            IRI.create("http://www.w3.org/2002/07/owl#Thing"),
          ),
        ),
      ]),
      factory.getOWLSubClassOfAxiom(
        factory.getOWLDataSomeValuesFrom(
          [factory.getOWLDataProperty(iri("age"))],
          factory.getOWLDataOneOf([
            factory.getOWLLiteral("1", integer),
            factory.getOWLLiteral("2.5", double),
          ]),
        ),
        cls("Adult"),
      ),
    ]);
  });

  it("parses assertion and object-property axiom forms", async () => {
    const manager = createManager();
    const ontology = await load(
      manager,
      [
        "Person(alice)",
        "knows(alice, bob)",
        "age(alice, 42)",
        ":p ⊑ q",
        ":p ≡ q",
        ":p ≡ q^-",
        ":p in transitive",
        ":p o q o r ⊑ s",
      ].join("\n"),
    );
    const factory = manager.getOWLDataFactory();
    const iri = (name) => IRI.create(`${documentIRI}#${name}`);
    const cls = (name) => factory.getOWLClass(iri(name));
    const property = (name) => factory.getOWLObjectProperty(iri(name));
    const individual = (name) => factory.getOWLNamedIndividual(iri(name));

    expectAxioms(ontology, [
      factory.getOWLClassAssertionAxiom(cls("Person"), individual("alice")),
      factory.getOWLObjectPropertyAssertionAxiom(
        property("knows"),
        individual("alice"),
        individual("bob"),
      ),
      factory.getOWLDataPropertyAssertionAxiom(
        factory.getOWLDataProperty(iri("age")),
        individual("alice"),
        factory.getOWLLiteral(
          "42",
          IRI.create("http://www.w3.org/2001/XMLSchema#integer"),
        ),
      ),
      factory.getOWLSubObjectPropertyOfAxiom(property("p"), property("q")),
      factory.getOWLEquivalentObjectPropertiesAxiom([
        property("p"),
        property("q"),
      ]),
      factory.getOWLInverseObjectPropertiesAxiom(property("p"), property("q")),
      factory.getOWLTransitiveObjectPropertyAxiom(property("p")),
      factory.getOWLSubPropertyChainOfAxiom(
        [property("p"), property("q"), property("r")],
        property("s"),
      ),
    ]);
  });

  it("maps renderer-style domain, range, and functionality descriptions without dropping unmatched subclass axioms", async () => {
    const manager = createManager();
    const ontology = await load(
      manager,
      [
        "top ⊑ forall related.Person",
        "top ⊑ ≤ 1 identifier.top",
        "exists owns.top ⊑ Owner",
        "top ⊑ ≤ 2 related.Person",
      ].join("\n"),
    );
    const factory = manager.getOWLDataFactory();
    const iri = (name) => IRI.create(`${documentIRI}#${name}`);
    const cls = (name) => factory.getOWLClass(iri(name));
    const property = (name) => factory.getOWLObjectProperty(iri(name));

    expectAxioms(ontology, [
      factory.getOWLObjectPropertyRangeAxiom(
        property("related"),
        cls("Person"),
      ),
      factory.getOWLFunctionalObjectPropertyAxiom(property("identifier")),
      factory.getOWLObjectPropertyDomainAxiom(property("owns"), cls("Owner")),
      factory.getOWLSubClassOfAxiom(
        factory.getOWLClass(IRI.create("http://www.w3.org/2002/07/owl#Thing")),
        factory.getOWLObjectMaxCardinality(
          2,
          property("related"),
          cls("Person"),
        ),
      ),
    ]);
  });
});
