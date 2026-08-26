import { IRI } from "../model/index.js";
import { StringDocumentSource } from "../io/index.js";

import { OWLOntologyManager } from "./owlOntologyManager.js";

describe("OWLOntologyManager integration load result", () => {
  it("returns an immutable root, import closure, and document contexts", async () => {
    const importedIri = IRI.create("urn:phase7:imported");
    const manager = new OWLOntologyManager({
      documentLoader: {
        load: async (documentIri) => {
          expect(documentIri.value).toBe(importedIri.value);
          return new StringDocumentSource(
            "Ontology(<urn:phase7:imported> Declaration(Class(<urn:phase7:Imported>)))",
            {
              documentIRI: importedIri,
              fileName: "imported.ofn",
            },
          );
        },
      },
    });
    const source = new StringDocumentSource(
      "Ontology(<urn:phase7:root> Import(<urn:phase7:imported>) Declaration(Class(<urn:phase7:Root>)))",
      {
        documentIRI: IRI.create("urn:phase7:root-document"),
        fileName: "root.ofn",
      },
    );

    const result = await manager.loadOntologyGraphFromOntologyDocument(source);

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.importsClosure)).toBe(true);
    expect(Object.isFrozen(result.documents)).toBe(true);
    expect(result.importsClosure).toHaveLength(2);
    expect(result.importsClosure[0]).toBe(result.ontology);
    expect(
      result.importsClosure.map(
        (ontology) => ontology.getOntologyID().ontologyIRI.value,
      ),
    ).toEqual(["urn:phase7:root", "urn:phase7:imported"]);
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0]).toMatchObject({
      context: {
        diagnostics: [],
        documentIRI: IRI.create("urn:phase7:root-document"),
        format: { key: "functional" },
      },
      ontology: result.ontology,
    });
    expect(Object.isFrozen(result.documents[0])).toBe(true);
    expect(Object.isFrozen(result.documents[0].context)).toBe(true);
    expect(Object.isFrozen(result.documents[0].context.diagnostics)).toBe(true);
    expect(manager.getOntology(result.ontology.getOntologyID())).toBe(
      result.ontology,
    );
    expect(
      manager.getOntology(
        manager.getOWLDataFactory().getOWLOntologyID(importedIri),
      ),
    ).toBe(result.importsClosure[1]);
  });
});
