import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../io/index.js";
import owl2vowl from "../../../owl2vowl/js/index.js";
import { OWLManager } from "../../manager/index.js";

describe("KRSS1 manager integration", () => {
  it("loads KRSS1 explicitly and through a generic .krss hint", async () => {
    for (const configuration of [
      new OWLOntologyLoaderConfiguration({ format: OWLDocumentFormats.KRSS1 }),
      undefined,
    ]) {
      const result =
        await OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
          new StringDocumentSource("(define-concept Person Human)", {
            documentIRI: "urn:test:phase17-integration",
            fileName: "ontology.krss",
          }),
          configuration,
        );

      expect(result.documents[0].context.format).toBe(OWLDocumentFormats.KRSS1);
    }
  });

  it("does not cross-fallback after KRSS1 claims malformed shared syntax", async () => {
    await expect(
      OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(
        new StringDocumentSource("(define-primitive-concept Person)", {
          fileName: "ontology.krss",
        }),
      ),
    ).rejects.toMatchObject({ code: "OWL_SYNTAX_ERROR" });
  });

  it("honors an exact .krss2 hint for shared syntax", async () => {
    const result =
      await OWLManager.createOWLOntologyManager().loadOntologyGraphFromOntologyDocument(
        new StringDocumentSource("(define-concept Person Human)", {
          fileName: "ontology.krss2",
        }),
      );

    expect(result.documents[0].context.format).toBe(OWLDocumentFormats.KRSS2);
  });

  it("loads KRSS1 in an import closure", async () => {
    const manager = OWLManager.createOWLOntologyManager({
      documentLoader: {
        async load() {
          return new StringDocumentSource("(define-concept Imported Concept)", {
            documentIRI: "urn:test:phase17-import",
            fileName: "imported.krss",
          });
        },
      },
    });
    const result = await manager.loadOntologyGraphFromOntologyDocument(
      "Ontology(<urn:test:root> Import(<urn:test:phase17-import>))",
    );

    expect(result.documents).toHaveLength(2);
    expect(
      result.documents.find(
        ({ context }) => context.format === OWLDocumentFormats.KRSS1,
      ),
    ).toBeDefined();
  });

  it("feeds the production VOWL builder without the legacy KRSS2 path", async () => {
    const result = await owl2vowl("(define-primitive-concept Person Mammal)", {
      documentIRI: "https://example.com/krss1-ontology",
      fileName: "ontology.krss",
    });

    expect(result.classAttribute.map(({ iri }) => iri).sort()).toEqual([
      "https://example.com/krss1-ontology#Mammal",
      "https://example.com/krss1-ontology#Person",
    ]);
    expect(result.diagnostics).toEqual([]);
  });
});
