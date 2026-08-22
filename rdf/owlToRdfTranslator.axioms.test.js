import { IRI, OWLDataFactory, OWLOntology } from "../model/index.js";
import { OwlToRdfTranslator, rdfDataFactory } from "./index.js";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const OWL = "http://www.w3.org/2002/07/owl#";
const EX = "https://example.com/owl-to-rdf-axioms#";

const nn = (value) => rdfDataFactory.namedNode(value);

const ontologyFor = (factory, axioms) =>
  new OWLOntology({
    axioms,
    ontologyID: factory.getOWLOntologyID(IRI.create(`${EX}ontology`)),
  });

const readList = (dataset, head) => {
  const values = [];
  let current = head;
  while (!current.equals(nn(`${RDF}nil`))) {
    const first = [...dataset.match(current, nn(`${RDF}first`), null)];
    const rest = [...dataset.match(current, nn(`${RDF}rest`), null)];
    expect(first).toHaveLength(1);
    expect(rest).toHaveLength(1);
    values.push(first[0].object);
    current = rest[0].object;
  }
  return values;
};

describe("OwlToRdfTranslator axiom rules", () => {
  it("uses normative owl:members for a three-way DifferentIndividuals axiom", () => {
    const factory = new OWLDataFactory();
    const individuals = ["first", "second", "third"].map((name) =>
      factory.getOWLNamedIndividual(IRI.create(`${EX}${name}`)),
    );
    const dataset = new OwlToRdfTranslator().translate(
      ontologyFor(factory, [
        factory.getOWLDifferentIndividualsAxiom(individuals),
      ]),
    );

    const axiomNode = [
      ...dataset.match(null, nn(`${RDF}type`), nn(`${OWL}AllDifferent`)),
    ][0].subject;
    const members = [...dataset.match(axiomNode, nn(`${OWL}members`), null)];
    expect(members).toHaveLength(1);
    expect(
      dataset.match(axiomNode, nn(`${OWL}distinctMembers`), null).size,
    ).toBe(0);
    expect(readList(dataset, members[0].object)).toEqual(
      individuals.map(({ iri }) => nn(iri.value)),
    );
  });

  it("normalizes a positive inverse-property assertion by swapping its ends", () => {
    const factory = new OWLDataFactory();
    const property = factory.getOWLObjectProperty(IRI.create(`${EX}parentOf`));
    const subject = factory.getOWLNamedIndividual(IRI.create(`${EX}child`));
    const object = factory.getOWLNamedIndividual(IRI.create(`${EX}parent`));
    const dataset = new OwlToRdfTranslator().translate(
      ontologyFor(factory, [
        factory.getOWLObjectPropertyAssertionAxiom(
          factory.getOWLObjectInverseOf(property),
          subject,
          object,
        ),
      ]),
    );

    expect(
      dataset.match(nn(`${EX}parent`), nn(`${EX}parentOf`), nn(`${EX}child`))
        .size,
    ).toBe(1);
    expect(dataset.match(null, nn(`${OWL}inverseOf`), null).size).toBe(0);
  });

  it("preserves property-chain order and key property category order", () => {
    const factory = new OWLDataFactory();
    const first = factory.getOWLObjectProperty(IRI.create(`${EX}first`));
    const second = factory.getOWLObjectProperty(IRI.create(`${EX}second`));
    const superProperty = factory.getOWLObjectProperty(
      IRI.create(`${EX}superProperty`),
    );
    const firstData = factory.getOWLDataProperty(IRI.create(`${EX}firstData`));
    const secondData = factory.getOWLDataProperty(
      IRI.create(`${EX}secondData`),
    );
    const owlClass = factory.getOWLClass(IRI.create(`${EX}Class`));
    const dataset = new OwlToRdfTranslator().translate(
      ontologyFor(factory, [
        factory.getOWLSubPropertyChainOfAxiom([second, first], superProperty),
        factory.getOWLHasKeyAxiom(
          owlClass,
          [first, second],
          [firstData, secondData],
        ),
      ]),
    );

    const chainHead = [
      ...dataset.match(
        nn(`${EX}superProperty`),
        nn(`${OWL}propertyChainAxiom`),
        null,
      ),
    ][0].object;
    expect(readList(dataset, chainHead)).toEqual([
      nn(`${EX}second`),
      nn(`${EX}first`),
    ]);

    const keyHead = [
      ...dataset.match(nn(`${EX}Class`), nn(`${OWL}hasKey`), null),
    ][0].object;
    expect(readList(dataset, keyHead)).toEqual([
      nn(`${EX}first`),
      nn(`${EX}second`),
      nn(`${EX}firstData`),
      nn(`${EX}secondData`),
    ]);
  });

  it("converts rdf:PlainLiteral lexical forms to RDF 1.1 literals", () => {
    const factory = new OWLDataFactory();
    const property = factory.getOWLDataProperty(IRI.create(`${EX}value`));
    const subject = factory.getOWLNamedIndividual(IRI.create(`${EX}subject`));
    const plainLiteral = IRI.create(`${RDF}PlainLiteral`);
    const dataset = new OwlToRdfTranslator().translate(
      ontologyFor(factory, [
        factory.getOWLDataPropertyAssertionAxiom(
          property,
          subject,
          factory.getOWLLiteral("bonjour@fr", plainLiteral),
        ),
      ]),
    );

    expect(
      dataset.match(
        nn(`${EX}subject`),
        nn(`${EX}value`),
        rdfDataFactory.literal("bonjour", "fr"),
      ).size,
    ).toBe(1);
  });
});
