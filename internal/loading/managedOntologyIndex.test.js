import { OWLOntologyStateError } from "../../io/errors.js";
import { OWLDataFactory } from "../../model/owlDataFactory.js";
import { OWLOntology } from "../../model/owlOntology.js";
import { IRI } from "../../model/structural.js";

import { ManagedOntologyIndex } from "./managedOntologyIndex.js";

const createOntology = (dataFactory, ontologyIRI, versionIRI) =>
  new OWLOntology({
    ontologyID: dataFactory.getOWLOntologyID(ontologyIRI, versionIRI),
  });

const countSetIterationsDuring = (operation) => {
  const originalIterator = Set.prototype[Symbol.iterator];
  let iterationCount = 0;
  Set.prototype[Symbol.iterator] = function trackedSetIterator() {
    iterationCount += 1;
    return originalIterator.call(this);
  };
  try {
    operation();
  } finally {
    Set.prototype[Symbol.iterator] = originalIterator;
  }
  return iterationCount;
};

describe("ManagedOntologyIndex", () => {
  it("registers and resolves every retained ontology identity", () => {
    const dataFactory = new OWLDataFactory();
    const ontologyIRI = IRI.create("urn:index:ontology");
    const versionIRI = IRI.create("urn:index:ontology:version:1");
    const documentIRI = IRI.create("urn:index:document");
    const ontology = createOntology(dataFactory, ontologyIRI, versionIRI);
    const index = new ManagedOntologyIndex();

    index.registerOntology(ontology, { documentIRI });

    expect(index.hasOntology(ontology)).toBe(true);
    expect(index.getOntologyByID(ontology.getOntologyID())).toBe(ontology);
    expect(index.getOntologyByIRI(ontologyIRI)).toBe(ontology);
    expect(index.getOntologyByIRI(versionIRI)).toBe(ontology);
    expect(index.getOntologyByDocumentIRI(documentIRI)).toBe(ontology);
    expect(index.getDirectImports(ontology)).toEqual(new Set());
  });

  it("retains distinct versions and reports ambiguous IRI-only lookup", () => {
    const dataFactory = new OWLDataFactory();
    const ontologyIRI = IRI.create("urn:index:versioned");
    const firstVersion = createOntology(
      dataFactory,
      ontologyIRI,
      IRI.create("urn:index:versioned:1"),
    );
    const secondVersion = createOntology(
      dataFactory,
      ontologyIRI,
      IRI.create("urn:index:versioned:2"),
    );
    const index = new ManagedOntologyIndex();

    index.registerOntology(firstVersion);
    index.registerOntology(secondVersion);

    expect(index.getOntologyByID(firstVersion.getOntologyID())).toBe(
      firstVersion,
    );
    expect(index.getOntologyByID(secondVersion.getOntologyID())).toBe(
      secondVersion,
    );
    expect(() => index.getOntologyByIRI(ontologyIRI)).toThrow(
      OWLOntologyStateError,
    );
    expect(() => index.getOntologyByIRI(ontologyIRI)).toThrow(
      "The IRI identifies more than one managed ontology",
    );
  });

  it("rejects different ontology objects with the same full ontology ID", () => {
    const dataFactory = new OWLDataFactory();
    const ontologyIRI = IRI.create("urn:index:duplicate-id");
    const first = createOntology(dataFactory, ontologyIRI);
    const second = createOntology(dataFactory, ontologyIRI);
    const index = new ManagedOntologyIndex();

    index.registerOntology(first);

    expect(() => index.registerOntology(second)).toThrow(OWLOntologyStateError);
    expect(() => index.registerOntology(second)).toThrow(
      "An ontology with this ID already exists",
    );
    expect(index.getOntologyByID(first.getOntologyID())).toBe(first);
  });

  it("reports the known document IRI when a loaded ontology ID conflicts", () => {
    const dataFactory = new OWLDataFactory();
    const ontologyIRI = IRI.create("urn:index:duplicate-loaded-id");
    const conflictingDocumentIRI = IRI.create(
      "urn:index:duplicate-loaded-id-document",
    );
    const first = createOntology(dataFactory, ontologyIRI);
    const second = createOntology(dataFactory, ontologyIRI);
    const index = new ManagedOntologyIndex();

    index.registerOntology(first);

    expect.assertions(3);
    try {
      index.registerOntology(second, {
        documentIRI: conflictingDocumentIRI,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(OWLOntologyStateError);
      expect(error.ontologyID).toBe(second.getOntologyID());
      expect(error.documentIRI).toBe(conflictingDocumentIRI);
    }
  });

  it("rejects different ontologies with the same document IRI", () => {
    const dataFactory = new OWLDataFactory();
    const documentIRI = IRI.create("urn:index:duplicate-document");
    const first = createOntology(
      dataFactory,
      IRI.create("urn:index:first-ontology"),
    );
    const second = createOntology(
      dataFactory,
      IRI.create("urn:index:second-ontology"),
    );
    const index = new ManagedOntologyIndex();

    index.registerOntology(first, { documentIRI });

    expect(() => index.registerOntology(second, { documentIRI })).toThrow(
      OWLOntologyStateError,
    );
    expect(() => index.registerOntology(second, { documentIRI })).toThrow(
      "An ontology document with this IRI is already registered",
    );
    expect(index.getOntologyByDocumentIRI(documentIRI)).toBe(first);
    expect(index.getOntologyByID(second.getOntologyID())).toBeUndefined();
  });

  it("commits staged identities, aliases, and direct-import edges together", () => {
    const dataFactory = new OWLDataFactory();
    const root = createOntology(dataFactory, IRI.create("urn:index:root"));
    const imported = createOntology(
      dataFactory,
      IRI.create("urn:index:imported"),
      IRI.create("urn:index:imported:version"),
    );
    const rootDocumentIRI = IRI.create("urn:index:root-document");
    const importedDocumentIRI = IRI.create("urn:index:imported-document");
    const index = new ManagedOntologyIndex();
    const loadSession = index.beginLoadSession();

    loadSession.stageOntology(root, { documentIRI: rootDocumentIRI });
    loadSession.stageOntology(imported, {
      documentIRI: importedDocumentIRI,
    });
    loadSession.stageDirectImport(root, imported);

    expect(
      loadSession.getOntologyByIRI(imported.getOntologyID().versionIRI),
    ).toBe(imported);
    expect(loadSession.getOntologyByDocumentIRI(importedDocumentIRI)).toBe(
      imported,
    );
    expect(index.hasOntology(root)).toBe(false);
    expect(index.getDirectImports(root)).toEqual(new Set());

    loadSession.commit();

    expect(index.hasOntology(root)).toBe(true);
    expect(index.hasOntology(imported)).toBe(true);
    expect(index.getOntologyByDocumentIRI(rootDocumentIRI)).toBe(root);
    expect(index.getDirectImports(root)).toEqual(new Set([imported]));
  });

  it("discards every staged concern when a load session fails", () => {
    const dataFactory = new OWLDataFactory();
    const root = createOntology(
      dataFactory,
      IRI.create("urn:index:discarded-root"),
    );
    const imported = createOntology(
      dataFactory,
      IRI.create("urn:index:discarded-import"),
    );
    const documentIRI = IRI.create("urn:index:discarded-document");
    const index = new ManagedOntologyIndex();
    const loadSession = index.beginLoadSession();

    loadSession.stageOntology(root, { documentIRI });
    loadSession.stageOntology(imported);
    loadSession.stageDirectImport(root, imported);
    loadSession.discard();

    expect(index.hasOntology(root)).toBe(false);
    expect(index.hasOntology(imported)).toBe(false);
    expect(index.getOntologyByDocumentIRI(documentIRI)).toBeUndefined();
    expect(index.getDirectImports(root)).toEqual(new Set());
    expect(() => loadSession.commit()).toThrow(
      "The managed ontology load session is already closed",
    );
  });

  it("publishes none of a session when commit-time validation finds a conflict", () => {
    const dataFactory = new OWLDataFactory();
    const sharedDocumentIRI = IRI.create("urn:index:concurrent-document");
    const stagedRoot = createOntology(
      dataFactory,
      IRI.create("urn:index:staged-root"),
    );
    const stagedImport = createOntology(
      dataFactory,
      IRI.create("urn:index:staged-import"),
    );
    const concurrentlyRegistered = createOntology(
      dataFactory,
      IRI.create("urn:index:concurrent-ontology"),
    );
    const index = new ManagedOntologyIndex();
    const loadSession = index.beginLoadSession();
    loadSession.stageOntology(stagedRoot);
    loadSession.stageOntology(stagedImport, {
      documentIRI: sharedDocumentIRI,
    });
    loadSession.stageDirectImport(stagedRoot, stagedImport);

    index.registerOntology(concurrentlyRegistered, {
      documentIRI: sharedDocumentIRI,
    });

    expect(() => loadSession.commit()).toThrow(
      "An ontology document with this IRI is already registered",
    );
    expect(index.hasOntology(concurrentlyRegistered)).toBe(true);
    expect(index.hasOntology(stagedRoot)).toBe(false);
    expect(index.hasOntology(stagedImport)).toBe(false);
    expect(index.getDirectImports(stagedRoot)).toEqual(new Set());
  });

  it("does not iterate retained Set indexes during registration or load publication", () => {
    const dataFactory = new OWLDataFactory();
    const retained = createOntology(
      dataFactory,
      IRI.create("urn:index:retained-without-copy"),
    );
    const registered = createOntology(
      dataFactory,
      IRI.create("urn:index:registered-without-copy"),
    );
    const loaded = createOntology(
      dataFactory,
      IRI.create("urn:index:loaded-without-copy"),
    );
    const index = new ManagedOntologyIndex();
    index.registerOntology(retained);

    const registrationIterations = countSetIterationsDuring(() => {
      index.registerOntology(registered);
    });
    let loadSession;
    const sessionStartIterations = countSetIterationsDuring(() => {
      loadSession = index.beginLoadSession();
    });
    loadSession.stageOntology(loaded);
    const publicationIterations = countSetIterationsDuring(() => {
      loadSession.commit();
    });

    expect(registrationIterations).toBe(0);
    expect(sessionStartIterations).toBe(0);
    expect(publicationIterations).toBe(0);
    expect(index.hasOntology(loaded)).toBe(true);
  });
});
