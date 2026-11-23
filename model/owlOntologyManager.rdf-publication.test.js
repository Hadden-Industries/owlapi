import { expect, jest, test } from "@jest/globals";
import {
  OWLDocumentFormats,
  OWLManager,
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
