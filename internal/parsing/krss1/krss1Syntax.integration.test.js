import {
  OWLDocumentFormats,
  OWLOntologyLoaderConfiguration,
  StringDocumentSource,
} from "../../../index.js";
import { OWLManager } from "../../../index.js";
import { jest } from "@jest/globals";
import { OWLParserRegistry } from "../parserRegistry.js";
import { krss1ParserDescriptor } from "./descriptor.js";
import { krss2ParserDescriptor } from "../krss2/descriptor.js";

describe("KRSS1 manager integration", () => {
  it.each([{ format: "krss1" }, { fileName: "ontology.krss" }])(
    "never falls back to KRSS2 after a fatal KRSS1 failure selected by %j",
    async (selection) => {
      const createParser = jest.fn(krss2ParserDescriptor.createParser);
      const registry = new OWLParserRegistry([
        krss1ParserDescriptor,
        { ...krss2ParserDescriptor, createParser },
      ]);
      await expect(
        OWLManager.createOWLOntologyManager({
          registry,
        }).loadOntologyFromOntologyDocument(
          new StringDocumentSource(
            "(define-primitive-role p q :right-identity r)",
            selection,
          ),
        ),
      ).rejects.toMatchObject({ code: "UNSUPPORTED_CONSTRUCT" });
      expect(createParser).not.toHaveBeenCalled();
    },
  );

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
});
