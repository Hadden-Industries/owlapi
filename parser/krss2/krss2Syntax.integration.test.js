import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import owl2vowl from "../../../owl2vowl/js/index.js";
import { OWLManager } from "../../manager/index.js";
import { OWLObjectKind } from "../../model/index.js";

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

  it("does not expose KRSS1 before its Phase 17 parser is implemented", async () => {
    const manager = OWLManager.createOWLOntologyManager();

    await expect(
      manager.loadOntologyFromOntologyDocument(
        "(define-concept Person Human)",
        new OWLOntologyLoaderConfiguration({
          format: OWLDocumentFormats.KRSS1,
        }),
      ),
    ).rejects.toThrow(/No parser is registered for format: krss1/);
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

  it("feeds the production VOWL builder without a legacy KRSS parser", async () => {
    const result = await owl2vowl("(define-primitive-concept Person Agent)", {
      documentIRI: "https://example.com/krss2-ontology",
      fileName: "ontology.krss2",
    });

    expect(result.classAttribute.map(({ iri }) => iri).sort()).toEqual([
      "https://example.com/krss2-ontology#Agent",
      "https://example.com/krss2-ontology#Person",
    ]);
    expect(result.diagnostics).toEqual([]);
  });
});
