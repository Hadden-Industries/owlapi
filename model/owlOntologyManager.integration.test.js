import { IRI } from "../model/index.js";
import {
  MissingImportError,
  OWLOntologyStateError,
  StringDocumentSource,
} from "../io/index.js";

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

  it("retains a diamond import graph with one shared leaf", async () => {
    const documentByOntologyIRI = new Map([
      ["urn:graph:left", "urn:document:left"],
      ["urn:graph:right", "urn:document:right"],
      ["urn:graph:shared", "urn:document:shared"],
    ]);
    const ontologyDocumentByIRI = new Map([
      [
        "urn:document:left",
        "Ontology(<urn:graph:left> Import(<urn:graph:shared>))",
      ],
      [
        "urn:document:right",
        "Ontology(<urn:graph:right> Import(<urn:graph:shared>))",
      ],
      ["urn:document:shared", "Ontology(<urn:graph:shared>)"],
    ]);
    const loadedDocumentIRIs = [];
    const manager = new OWLOntologyManager({
      documentLoader: {
        load(documentIRI) {
          loadedDocumentIRIs.push(documentIRI.value);
          return new StringDocumentSource(
            ontologyDocumentByIRI.get(documentIRI.value),
            { documentIRI },
          );
        },
      },
      iriMappers: [
        {
          getDocumentIRI(ontologyIRI) {
            return documentByOntologyIRI.get(ontologyIRI.value);
          },
        },
      ],
    });

    const result = await manager.loadOntologyGraphFromOntologyDocument(
      new StringDocumentSource(
        "Ontology(<urn:graph:root> Import(<urn:graph:left>) Import(<urn:graph:right>))",
        { documentIRI: IRI.create("urn:document:root") },
      ),
    );

    expect(loadedDocumentIRIs).toEqual([
      "urn:document:left",
      "urn:document:shared",
      "urn:document:right",
    ]);
    expect(
      result.importsClosure.map(
        (ontology) => ontology.getOntologyID().ontologyIRI.value,
      ),
    ).toEqual([
      "urn:graph:root",
      "urn:graph:left",
      "urn:graph:shared",
      "urn:graph:right",
    ]);
  });

  it("resolves an in-flight cycle back edge through the root version IRI", async () => {
    const rootVersionIRI = IRI.create("urn:graph:root:version:1");
    const importedDocumentIRI = IRI.create("urn:document:imported");
    const loadedDocumentIRIs = [];
    const manager = new OWLOntologyManager({
      documentLoader: {
        load(documentIRI) {
          loadedDocumentIRIs.push(documentIRI.value);
          if (!documentIRI.equals(importedDocumentIRI)) {
            throw new MissingImportError("Unexpected document request", {
              documentIRI,
            });
          }
          return new StringDocumentSource(
            `Ontology(<urn:graph:imported> Import(<${rootVersionIRI.value}>))`,
            { documentIRI },
          );
        },
      },
      iriMappers: [
        {
          getDocumentIRI(ontologyIRI) {
            if (ontologyIRI.value === "urn:graph:imported") {
              return importedDocumentIRI;
            }
            return undefined;
          },
        },
      ],
    });

    const result = await manager.loadOntologyGraphFromOntologyDocument(
      new StringDocumentSource(
        `Ontology(<urn:graph:root> <${rootVersionIRI.value}> Import(<urn:graph:imported>))`,
        { documentIRI: IRI.create("urn:document:root") },
      ),
      { maxImportDepth: 1 },
    );

    expect(loadedDocumentIRIs).toEqual(["urn:document:imported"]);
    expect(
      result.importsClosure.map(
        (ontology) => ontology.getOntologyID().ontologyIRI.value,
      ),
    ).toEqual(["urn:graph:root", "urn:graph:imported"]);
  });

  it("binds two authored import IRIs to one mapped document and ontology", async () => {
    const sharedDocumentIRI = IRI.create("urn:document:shared-alias");
    let loadCount = 0;
    const manager = new OWLOntologyManager({
      documentLoader: {
        load(documentIRI) {
          loadCount += 1;
          return new StringDocumentSource(
            "Ontology(<urn:graph:shared-identity>)",
            { documentIRI },
          );
        },
      },
      iriMappers: [
        {
          getDocumentIRI() {
            return sharedDocumentIRI;
          },
        },
      ],
    });

    const result = await manager.loadOntologyGraphFromOntologyDocument(
      "Ontology(<urn:graph:two-aliases> Import(<urn:graph:first-alias>) Import(<urn:graph:second-alias>))",
    );

    expect(loadCount).toBe(1);
    expect(
      result.importsClosure.map(
        (ontology) => ontology.getOntologyID().ontologyIRI.value,
      ),
    ).toEqual(["urn:graph:two-aliases", "urn:graph:shared-identity"]);
  });

  it("retains the resolved ontology when its declared IRI differs from the import IRI", async () => {
    const authoredImportIRI = IRI.create("urn:graph:authored-import");
    const declaredOntologyIRI = IRI.create("urn:graph:declared-import");
    const manager = new OWLOntologyManager({
      documentLoader: {
        load(documentIRI) {
          return new StringDocumentSource(
            `Ontology(<${declaredOntologyIRI.value}>)`,
            { documentIRI },
          );
        },
      },
      iriMappers: [
        {
          getDocumentIRI() {
            return IRI.create("urn:document:declared-import");
          },
        },
      ],
    });

    const result = await manager.loadOntologyGraphFromOntologyDocument(
      `Ontology(<urn:graph:declared-root> Import(<${authoredImportIRI.value}>))`,
    );

    const dataFactory = manager.getOWLDataFactory();
    expect(result.importsClosure[1]).toBe(
      manager.getOntology(dataFactory.getOWLOntologyID(declaredOntologyIRI)),
    );
    expect(
      manager.getOntology(dataFactory.getOWLOntologyID(authoredImportIRI)),
    ).toBeUndefined();
  });

  it("discards a complete staged graph when a later import is missing", async () => {
    const retainedOntologyIRI = IRI.create("urn:graph:retained");
    const rootOntologyIRI = IRI.create("urn:graph:failed-root");
    const intermediateOntologyIRI = IRI.create("urn:graph:intermediate");
    const manager = new OWLOntologyManager({
      documentLoader: {
        load(documentIRI) {
          if (documentIRI.equals(intermediateOntologyIRI)) {
            return `Ontology(<${intermediateOntologyIRI.value}> Import(<urn:graph:late-missing>))`;
          }
          throw new MissingImportError("The late import is unavailable", {
            documentIRI,
          });
        },
      },
    });
    const retained = manager.createOntology(
      manager.getOWLDataFactory().getOWLOntologyID(retainedOntologyIRI),
    );

    await expect(
      manager.loadOntologyGraphFromOntologyDocument(
        `Ontology(<${rootOntologyIRI.value}> Import(<${intermediateOntologyIRI.value}>))`,
      ),
    ).rejects.toBeInstanceOf(MissingImportError);

    const dataFactory = manager.getOWLDataFactory();
    expect(manager.getOntology(retained.getOntologyID())).toBe(retained);
    expect(
      manager.getOntology(dataFactory.getOWLOntologyID(rootOntologyIRI)),
    ).toBeUndefined();
    expect(
      manager.getOntology(
        dataFactory.getOWLOntologyID(intermediateOntologyIRI),
      ),
    ).toBeUndefined();
  });

  it("derives the load result closure from retained edges to existing ontologies", async () => {
    const importedOntologyIRI = IRI.create("urn:graph:already-managed");
    const manager = new OWLOntologyManager();
    const imported = manager.createOntology(
      manager.getOWLDataFactory().getOWLOntologyID(importedOntologyIRI),
    );

    const result = await manager.loadOntologyGraphFromOntologyDocument(
      `Ontology(<urn:graph:new-root> Import(<${importedOntologyIRI.value}>))`,
    );

    expect(result.importsClosure).toEqual([result.ontology, imported]);
    expect(result.documents).toHaveLength(1);
  });

  it("rejects a later explicit source instead of returning a stale document alias", async () => {
    const documentIRI = IRI.create("urn:document:explicit-source-conflict");
    const firstOntologyIRI = IRI.create("urn:graph:explicit-source-first");
    const secondOntologyIRI = IRI.create("urn:graph:explicit-source-second");
    const manager = new OWLOntologyManager();
    const first = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(`Ontology(<${firstOntologyIRI.value}>)`, {
        documentIRI,
      }),
    );

    const conflictingLoad = manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(`Ontology(<${secondOntologyIRI.value}>)`, {
        documentIRI,
      }),
    );
    await expect(conflictingLoad).rejects.toBeInstanceOf(OWLOntologyStateError);
    await expect(conflictingLoad).rejects.toMatchObject({
      code: "ONTOLOGY_STATE_INVALID",
      documentIRI,
    });

    expect(manager.getOntology(first.getOntologyID())).toBe(first);
    expect(
      manager.getOntology(
        manager.getOWLDataFactory().getOWLOntologyID(secondOntologyIRI),
      ),
    ).toBeUndefined();
    await expect(
      manager.loadOntologyFromOntologyDocument(
        new StringDocumentSource("not valid functional syntax", {
          documentIRI,
        }),
      ),
    ).rejects.toMatchObject({ code: "UNPARSABLE_ONTOLOGY" });
  });
});
