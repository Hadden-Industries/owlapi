import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { OWLManager } from "../../../index.js";
import { OWLObjectKind } from "../../../model/index.js";

describe("KRSS2 manager integration", () => {
  it("auto-detects KRSS2 through the default parser registry", async () => {
    const manager = OWLManager.createOWLOntologyManager();
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      new StringDocumentSource("(implies Person Human)", {
        documentIRI: "urn:test:phase11-integration",
        fileName: "ontology.krss2",
      }),
    );

    expect(result.documents[0].context.format).toBe(OWLDocumentFormats.KRSS2);
    expect(
      result.ontology.getAxiomsByType(OWLObjectKind.SUBCLASS_OF_AXIOM),
    ).toHaveProperty("size", 1);
  });

  it("keeps the KRSS1 explicit format separate from KRSS2", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    const result = await manager.loadOntologyGraphFromOntologyDocument(
      "(define-concept Person Human)",
      new OWLOntologyLoaderConfiguration({
        format: OWLDocumentFormats.KRSS1,
      }),
    );

    expect(result.documents[0].context.format).toBe(OWLDocumentFormats.KRSS1);
  });

  it("loads KRSS2 inside a Functional Syntax import closure", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        async load() {
          return "(implies Imported Concept)";
        },
      },
    });
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      "Ontology(<urn:test:root> Import(<urn:test:imported>))",
    );
    const imported = result.documents.find(
      ({ context }) => context.format === OWLDocumentFormats.KRSS2,
    );
    const [axiom] = imported.ontology.getAxioms();

    expect(result.documents).toHaveLength(2);
    expect(axiom.subClass.iri.value).toBe("urn:test:imported#Imported");
    expect(axiom.superClass.iri.value).toBe("urn:test:imported#Concept");
  });
});
