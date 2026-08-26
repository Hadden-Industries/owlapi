import { OWLDocumentFormats, StringDocumentSource } from "../../../index.js";
import { OWLManager } from "../../../index.js";
import { OWLObjectKind } from "../../../model/index.js";

describe("OWL DL Syntax integration", () => {
  it("is detected and loaded by the default public ontology manager", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      new StringDocumentSource("Person ⊑ Agent\n", {
        documentIRI: "urn:test:dl-integration",
        fileName: "ontology.dl",
      }),
    );

    expect(result.documents[0].context.format).toBe(OWLDocumentFormats.DL);
    expect(
      result.ontology.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM).size,
    ).toBe(1);
  });

  it("loads a DL document in a Functional Syntax import closure", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        async load() {
          return "Imported ⊑ Concept\n";
        },
      },
    });
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      "Ontology(<urn:test:root> Import(<urn:test:imported>))",
    );
    const imported = result.documents.find(
      ({ context }) => context.format === OWLDocumentFormats.DL,
    );
    const [axiom] = imported.ontology.getAxioms();

    expect(result.documents).toHaveLength(2);
    expect(axiom.subClass.iri.value).toBe("urn:test:imported#Imported");
    expect(axiom.superClass.iri.value).toBe("urn:test:imported#Concept");
  });
});
