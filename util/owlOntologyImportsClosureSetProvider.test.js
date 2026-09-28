import {
  IRI,
  OWLDataFactory,
  OWLOntologyManager,
  OWLOntologyStateError,
  StringDocumentSource,
} from "../index.js";

import { OWLOntologyImportsClosureSetProvider } from "./owlOntologyImportsClosureSetProvider.js";

describe("OWLOntologyImportsClosureSetProvider", () => {
  it("captures a cycle-safe closure containing the root ontology", async () => {
    const dataFactory = new OWLDataFactory();
    const rootIRI = IRI.create("urn:closure-provider:root");
    const importedIRI = IRI.create("urn:closure-provider:imported");
    let loaderCalls = 0;
    const manager = new OWLOntologyManager({
      dataFactory,
      documentLoader: {
        load(documentIRI) {
          loaderCalls += 1;
          expect(documentIRI.equals(importedIRI)).toBe(true);
          return new StringDocumentSource(
            `Ontology(<${importedIRI.value}> Import(<${rootIRI.value}>))`,
            {
              documentIRI: importedIRI,
              fileName: "imported.ofn",
            },
          );
        },
      },
    });
    const root = await manager.loadOntologyFromOntologyDocument(
      new StringDocumentSource(
        `Ontology(<${rootIRI.value}> Import(<${importedIRI.value}>))`,
        { documentIRI: rootIRI, fileName: "root.ofn" },
      ),
    );
    const imported = manager.getOntology(
      dataFactory.getOWLOntologyID(importedIRI),
    );

    const provider = new OWLOntologyImportsClosureSetProvider(manager, root);
    const ontologies = provider.ontologies();

    expect(loaderCalls).toBe(1);
    expect(ontologies).toBeInstanceOf(Set);
    expect(ontologies.size).toBe(2);
    const captured = [...ontologies];
    expect(captured[0]).toBe(root);
    expect(captured[1]).toBe(imported);
  });

  it("freezes membership at construction and returns a fresh defensive Set", () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const root = manager.createOntology(
      dataFactory.getOWLOntologyID(IRI.create("urn:closure-provider:snapshot")),
    );
    const later = manager.createOntology(
      dataFactory.getOWLOntologyID(
        IRI.create("urn:closure-provider:snapshot:later"),
      ),
    );
    const mutableManagerResult = new Set([root]);
    let closureReads = 0;
    const snapshotManager = {
      getImportsClosure(requestedRoot) {
        closureReads += 1;
        expect(requestedRoot).toBe(root);
        return mutableManagerResult;
      },
    };

    const provider = new OWLOntologyImportsClosureSetProvider(
      snapshotManager,
      root,
    );
    mutableManagerResult.add(later);
    const first = provider.ontologies();
    const second = provider.ontologies();

    expect(closureReads).toBe(1);
    expect(first).not.toBe(second);
    expect([...first]).toEqual([root]);
    expect([...second]).toEqual([root]);
    first.clear();
    expect([...provider.ontologies()]).toEqual([root]);
  });

  it("propagates the manager's typed foreign-ontology failure", () => {
    const dataFactory = new OWLDataFactory();
    const owner = new OWLOntologyManager({ dataFactory });
    const otherManager = new OWLOntologyManager({ dataFactory });
    const foreignRoot = owner.createOntology();

    let thrown;
    try {
      Reflect.construct(OWLOntologyImportsClosureSetProvider, [
        otherManager,
        foreignRoot,
      ]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OWLOntologyStateError);
    expect(thrown).toMatchObject({
      ontology: foreignRoot,
      operation: "getImportsClosure",
    });
  });

  it("rejects missing constructor collaborators and exposes only the approved member", () => {
    const dataFactory = new OWLDataFactory();
    const manager = new OWLOntologyManager({ dataFactory });
    const root = manager.createOntology();

    expect(
      () => new OWLOntologyImportsClosureSetProvider(undefined, root),
    ).toThrow(/manager must implement getImportsClosure/);
    expect(() => new OWLOntologyImportsClosureSetProvider({}, root)).toThrow(
      /manager must implement getImportsClosure/,
    );
    expect(
      () => new OWLOntologyImportsClosureSetProvider(manager, undefined),
    ).toThrow(/rootOntology must be an OWLOntology/);
    expect(
      Object.getOwnPropertyNames(
        OWLOntologyImportsClosureSetProvider.prototype,
      ).sort(),
    ).toEqual(["constructor", "ontologies"]);
  });
});
