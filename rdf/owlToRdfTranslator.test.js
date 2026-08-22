import * as rdfApi from "./index.js";
import { IRI, OWLDataFactory, OWLOntology } from "../model/index.js";

const quadSignature = ({ subject, predicate, object, graph }) =>
  JSON.stringify([
    [subject.termType, subject.value],
    [predicate.termType, predicate.value],
    object.termType === "Literal"
      ? [object.termType, object.value, object.language, object.datatype.value]
      : [object.termType, object.value],
    [graph.termType, graph.value],
  ]);

const sortedSignatures = (dataset) =>
  [...dataset]
    .map(quadSignature)
    .sort((left, right) => left.localeCompare(right));

describe("OwlToRdfTranslator public contract", () => {
  it("exposes the completed structural OWL-to-RDF mapping from the RDF subpath", () => {
    // Removing the export would leave downstream RDF storers with no supported
    // semantic bridge from the canonical ontology model.
    expect(typeof rdfApi.OwlToRdfTranslator).toBe("function");
  });

  it("maps a named ontology header, version, import, and annotation", () => {
    // Omitting any header component would make a structural ontology lose
    // identity or document-level metadata before an RDF serializer sees it.
    const factory = new OWLDataFactory();
    const ontologyIri = IRI.create("https://example.com/ontology");
    const versionIri = IRI.create("https://example.com/ontology/1");
    const importedIri = IRI.create("https://example.com/imported");
    const ontology = new OWLOntology({
      annotations: [
        factory.getOWLAnnotation(
          factory.getRDFSLabel(),
          factory.getOWLLiteral("Example ontology", "en"),
        ),
      ],
      imports: [factory.getOWLImportsDeclaration(importedIri)],
      ontologyID: factory.getOWLOntologyID(ontologyIri, versionIri),
    });

    const dataset = new rdfApi.OwlToRdfTranslator().translate(ontology);

    expect(sortedSignatures(dataset)).toEqual(
      [
        JSON.stringify([
          ["NamedNode", ontologyIri.value],
          ["NamedNode", "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"],
          ["NamedNode", "http://www.w3.org/2002/07/owl#Ontology"],
          ["DefaultGraph", ""],
        ]),
        JSON.stringify([
          ["NamedNode", ontologyIri.value],
          ["NamedNode", "http://www.w3.org/2000/01/rdf-schema#label"],
          [
            "Literal",
            "Example ontology",
            "en",
            "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
          ],
          ["DefaultGraph", ""],
        ]),
        JSON.stringify([
          ["NamedNode", ontologyIri.value],
          ["NamedNode", "http://www.w3.org/2002/07/owl#imports"],
          ["NamedNode", importedIri.value],
          ["DefaultGraph", ""],
        ]),
        JSON.stringify([
          ["NamedNode", ontologyIri.value],
          ["NamedNode", "http://www.w3.org/2002/07/owl#versionIRI"],
          ["NamedNode", versionIri.value],
          ["DefaultGraph", ""],
        ]),
      ].sort((left, right) => left.localeCompare(right)),
    );
  });

  it("places every generated quad in the caller-selected RDF dataset graph", () => {
    const factory = new OWLDataFactory();
    const ontology = new OWLOntology({
      axioms: [
        factory.getOWLSubClassOfAxiom(
          factory.getOWLClass(IRI.create("urn:test:Child")),
          factory.getOWLClass(IRI.create("urn:test:Parent")),
        ),
      ],
      ontologyID: factory.getOWLOntologyID(IRI.create("urn:test:ontology")),
    });
    const graph = rdfApi.rdfDataFactory.namedNode("urn:test:graph");

    const dataset = new rdfApi.OwlToRdfTranslator().translate(ontology, {
      graph,
    });

    expect(dataset.size).toBeGreaterThan(0);
    expect([...dataset].every((quad) => quad.graph.equals(graph))).toBe(true);
  });

  it("keeps one source anonymous individual stable and distinct from generated nodes", () => {
    const factory = new OWLDataFactory();
    const anonymous = factory.getOWLAnonymousIndividual("source", "scope");
    const named = factory.getOWLNamedIndividual(IRI.create("urn:test:named"));
    const property = factory.getOWLObjectProperty(IRI.create("urn:test:p"));
    const ontology = new OWLOntology({
      axioms: [
        factory.getOWLSameIndividualAxiom([anonymous, named]),
        factory.getOWLObjectPropertyAssertionAxiom(property, anonymous, named),
      ],
      ontologyID: factory.getOWLOntologyID(),
    });

    const dataset = new rdfApi.OwlToRdfTranslator().translate(ontology);
    const sameAs = [
      ...dataset.match(
        null,
        rdfApi.rdfDataFactory.namedNode("http://www.w3.org/2002/07/owl#sameAs"),
        null,
      ),
    ][0];
    const assertion = [
      ...dataset.match(
        null,
        rdfApi.rdfDataFactory.namedNode("urn:test:p"),
        null,
      ),
    ][0];
    const ontologyHeader = [
      ...dataset.match(
        null,
        rdfApi.rdfDataFactory.namedNode(
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
        ),
        rdfApi.rdfDataFactory.namedNode(
          "http://www.w3.org/2002/07/owl#Ontology",
        ),
      ),
    ][0].subject;
    const sameAsAnonymous =
      sameAs.subject.termType === "BlankNode" ? sameAs.subject : sameAs.object;

    expect(assertion.subject.equals(sameAsAnonymous)).toBe(true);
    expect(ontologyHeader.equals(sameAsAnonymous)).toBe(false);
  });
});
