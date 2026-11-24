import { expect, jest, test } from "@jest/globals";
import {
  OWLDocumentFormats,
  IRI,
  OWLManager,
  OWLOntology,
  StringDocumentSource,
} from "../index.js";
import { OntologyState } from "../internal/model/ontologyState.js";

test("Java-profile RDF reconstruction publishes accepted axioms in one state batch", async () => {
  const count = 64;
  const declarations = Array.from(
    { length: count },
    (_, index) => `<owl:Class rdf:about="urn:publication:class-${index}"/>`,
  ).join("");
  const source = new StringDocumentSource(
    `<rdf:RDF
    xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
    xmlns:owl="http://www.w3.org/2002/07/owl#">
    <owl:Ontology rdf:about="urn:publication:ontology"/>
    ${declarations}
  </rdf:RDF>`,
    { format: OWLDocumentFormats.RDF_XML },
  );
  const drafts = jest.spyOn(OntologyState.prototype, "createMutationDraft");
  try {
    const manager = OWLManager.createOWLOntologyManager({
      behaviorProfileId: "java-owlapi-5.5.1",
    });
    const ontology = await manager.loadOntologyFromOntologyDocument(source);
    expect(ontology.getAxiomCount()).toBe(count);
    // Ontology ID and metadata also use drafts. The axiom count does not
    // determine the number of drafts in this synchronous publication step.
    expect(drafts.mock.calls.length).toBeLessThan(8);
  } finally {
    drafts.mockRestore();
  }
});

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "%s transfers built-in RDF axioms without materializing public defensive sets",
  async (behaviorProfileId) => {
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    const source = new StringDocumentSource(
      "<urn:buffer:C> a <http://www.w3.org/2002/07/owl#Class> .\n" +
        "<urn:buffer:C> a <http://www.w3.org/2002/07/owl#Class> .",
      { format: OWLDocumentFormats.TURTLE },
    );
    const reads = jest.spyOn(OWLOntology.prototype, "getAxioms");
    try {
      const ontology = await manager.loadOntologyFromOntologyDocument(source);
      expect(ontology.getAxiomCount()).toBe(1);
      expect(reads).not.toHaveBeenCalled();
    } finally {
      reads.mockRestore();
    }
  },
);

test.each(["java-owlapi-5.5.1", "normative-v1"])(
  "%s withdraws the document if reconstruction exceeds the discovered declaration count",
  async (behaviorProfileId) => {
    const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
    const source = new StringDocumentSource(
      "<urn:failure:ontology> a <http://www.w3.org/2002/07/owl#Ontology> .\n" +
        "<urn:failure:C> a <http://www.w3.org/2002/07/owl#Class> ;\n" +
        "<http://www.w3.org/2000/01/rdf-schema#subClassOf> <urn:failure:D> .",
      { format: OWLDocumentFormats.TURTLE },
    );
    const ontologyID = manager
      .getOWLDataFactory()
      .getOWLOntologyID(IRI.create("urn:failure:ontology"));
    await expect(
      manager.loadOntologyFromOntologyDocument(source, { maxAxioms: 1 }),
    ).rejects.toMatchObject({ resource: "maxAxioms" });
    expect(manager.getOntology(ontologyID)).toBeUndefined();
    const retried = await manager.loadOntologyFromOntologyDocument(source);
    expect(retried.getAxiomCount()).toBe(2);
    expect(manager.getOntology(ontologyID)).toBe(retried);
  },
);
