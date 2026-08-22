import { IRI, OWLDataFactory, OWLOntology } from "../model/index.js";
import { OwlToRdfTranslator, rdfDataFactory } from "./index.js";

const descriptors = new Map(
  ["Buffer", "process", "window"].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ]),
);

afterEach(() => {
  for (const [name, descriptor] of descriptors) {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      delete globalThis[name];
    }
  }
});

describe("OwlToRdfTranslator browser contract", () => {
  it("maps the structural model without Node-only globals", () => {
    for (const name of descriptors.keys()) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value: name === "window" ? {} : undefined,
      });
    }
    const factory = new OWLDataFactory();
    const ontology = new OWLOntology({
      axioms: [
        factory.getOWLSubClassOfAxiom(
          factory.getOWLClass(IRI.create("urn:test:BrowserChild")),
          factory.getOWLClass(IRI.create("urn:test:BrowserParent")),
        ),
      ],
      ontologyID: factory.getOWLOntologyID(
        IRI.create("urn:test:browser-ontology"),
      ),
    });

    const dataset = new OwlToRdfTranslator().translate(ontology);

    expect(
      dataset.match(
        rdfDataFactory.namedNode("urn:test:BrowserChild"),
        rdfDataFactory.namedNode(
          "http://www.w3.org/2000/01/rdf-schema#subClassOf",
        ),
        rdfDataFactory.namedNode("urn:test:BrowserParent"),
      ).size,
    ).toBe(1);
  });
});
