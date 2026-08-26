import { IRI, OWLDataFactory, OWLOntology } from "../../model/index.js";
import { OwlToRdfTranslator } from "./owlToRdfTranslator.js";

const EX = "urn:owlapi-js:resource:owl-to-rdf:";

describe("OwlToRdfTranslator resource shape", () => {
  it("keeps wide declaration translation linear in the axiom count", () => {
    const factory = new OWLDataFactory();
    const axiomCount = 10000;
    const ontology = new OWLOntology({
      axioms: Array.from({ length: axiomCount }, (_, index) =>
        factory.getOWLDeclarationAxiom(
          factory.getOWLClass(IRI.create(`${EX}class-${index}`)),
        ),
      ),
      ontologyID: factory.getOWLOntologyID(IRI.create(`${EX}wide`)),
    });

    const dataset = new OwlToRdfTranslator().translate(ontology);

    expect(dataset.size).toBe(axiomCount + 1);
  });

  it("emits exactly two list-link triples per n-ary member", () => {
    const factory = new OWLDataFactory();
    const memberCount = 5000;
    const individuals = Array.from({ length: memberCount }, (_, index) =>
      factory.getOWLNamedIndividual(IRI.create(`${EX}individual-${index}`)),
    );
    const ontology = new OWLOntology({
      axioms: [factory.getOWLDifferentIndividualsAxiom(individuals)],
      ontologyID: factory.getOWLOntologyID(IRI.create(`${EX}list`)),
    });

    const dataset = new OwlToRdfTranslator().translate(ontology);

    // Header + AllDifferent type + members edge + first/rest per list cell.
    expect(dataset.size).toBe(3 + memberCount * 2);
  });

  it("maps the governed expression-depth workload without graph expansion", () => {
    const factory = new OWLDataFactory();
    const depth = 256;
    let expression = factory.getOWLClass(IRI.create(`${EX}leaf`));
    for (let index = 0; index < depth; index += 1) {
      expression = factory.getOWLObjectComplementOf(expression);
    }
    const ontology = new OWLOntology({
      axioms: [
        factory.getOWLSubClassOfAxiom(
          factory.getOWLClass(IRI.create(`${EX}subject`)),
          expression,
        ),
      ],
      ontologyID: factory.getOWLOntologyID(IRI.create(`${EX}depth`)),
    });

    const dataset = new OwlToRdfTranslator().translate(ontology);

    // Header + subclass edge + one type and complement edge per level.
    expect(dataset.size).toBe(2 + depth * 2);
  });
});
