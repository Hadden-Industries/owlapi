import { OWLOntologyStateError } from "../../io/errors.js";
import { OWLDataFactory } from "../../model/owlDataFactory.js";
import {
  createManagerOwnedOWLOntology,
  OWLOntology,
} from "../../model/owlOntology.js";
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

  it("publishes a staged full identity replacement while preserving document and import aliases", () => {
    const dataFactory = new OWLDataFactory();
    const originalOntologyID = dataFactory.getOWLOntologyID(
      IRI.create("urn:index:identity:original"),
      IRI.create("urn:index:identity:original:version"),
    );
    const replacementOntologyID = dataFactory.getOWLOntologyID(
      IRI.create("urn:index:identity:replacement"),
      IRI.create("urn:index:identity:replacement:version"),
    );
    const documentIRI = IRI.create("urn:index:identity:document");
    const { ontology, ontologyState } = createManagerOwnedOWLOntology({
      ontologyID: originalOntologyID,
    });
    const imported = createOntology(
      dataFactory,
      IRI.create("urn:index:identity:imported"),
    );
    const index = new ManagedOntologyIndex();
    const loadSession = index.beginLoadSession();
    loadSession.stageOntology(ontology, { documentIRI });
    loadSession.stageOntology(imported);
    loadSession.stageDirectImport(ontology, imported);
    loadSession.commit();
    const ontologyMutation = ontologyState.createMutationDraft();
    const identityMutation = index.beginOntologyIdentityMutation();

    ontologyMutation.stageOntologyIDReplacement(replacementOntologyID);
    expect(
      identityMutation.stageOntologyIDReplacement(
        ontology,
        originalOntologyID,
        replacementOntologyID,
      ),
    ).toBe(true);

    expect(index.getOntologyByID(originalOntologyID)).toBe(ontology);
    expect(index.getOntologyByID(replacementOntologyID)).toBeUndefined();
    expect(identityMutation.preflight()).toMatchObject({
      changesState: true,
    });
    ontologyState.preflightMutation(ontologyMutation);
    expect(identityMutation.commit()).toBe(true);
    expect(ontologyState.commitMutation(ontologyMutation)).toBe(true);

    expect(index.getOntologyByID(originalOntologyID)).toBeUndefined();
    expect(index.getOntologyByID(replacementOntologyID)).toBe(ontology);
    expect(
      index.getOntologyByIRI(originalOntologyID.ontologyIRI),
    ).toBeUndefined();
    expect(
      index.getOntologyByIRI(originalOntologyID.versionIRI),
    ).toBeUndefined();
    expect(index.getOntologyByIRI(replacementOntologyID.ontologyIRI)).toBe(
      ontology,
    );
    expect(index.getOntologyByIRI(replacementOntologyID.versionIRI)).toBe(
      ontology,
    );
    expect(index.getOntologyByDocumentIRI(documentIRI)).toBe(ontology);
    expect(index.getDirectImports(ontology)).toEqual(new Set([imported]));
    expect(index.createImportsClosureSnapshot(ontology)).toEqual([
      ontology,
      imported,
    ]);
  });

  it("allows a shared ontology IRI after replacement and reports its lookup as ambiguous", () => {
    const dataFactory = new OWLDataFactory();
    const sharedOntologyIRI = IRI.create("urn:index:identity:shared");
    const originalOntologyID = dataFactory.getOWLOntologyID(
      IRI.create("urn:index:identity:unshared"),
    );
    const replacementOntologyID = dataFactory.getOWLOntologyID(
      sharedOntologyIRI,
      IRI.create("urn:index:identity:shared:version:1"),
    );
    const secondOntologyID = dataFactory.getOWLOntologyID(
      sharedOntologyIRI,
      IRI.create("urn:index:identity:shared:version:2"),
    );
    const firstManaged = createManagerOwnedOWLOntology({
      ontologyID: originalOntologyID,
    });
    const second = createOntology(
      dataFactory,
      secondOntologyID.ontologyIRI,
      secondOntologyID.versionIRI,
    );
    const index = new ManagedOntologyIndex();
    index.registerOntology(firstManaged.ontology);
    index.registerOntology(second);
    const ontologyMutation = firstManaged.ontologyState.createMutationDraft();
    const identityMutation = index.beginOntologyIdentityMutation();

    ontologyMutation.stageOntologyIDReplacement(replacementOntologyID);
    identityMutation.stageOntologyIDReplacement(
      firstManaged.ontology,
      originalOntologyID,
      replacementOntologyID,
    );
    identityMutation.preflight();
    firstManaged.ontologyState.preflightMutation(ontologyMutation);
    identityMutation.commit();
    firstManaged.ontologyState.commitMutation(ontologyMutation);

    expect(index.getOntologyByIRI(replacementOntologyID.versionIRI)).toBe(
      firstManaged.ontology,
    );
    expect(index.getOntologyByIRI(secondOntologyID.versionIRI)).toBe(second);
    expect(() => index.getOntologyByIRI(sharedOntologyIRI)).toThrow(
      "The IRI identifies more than one managed ontology",
    );
  });

  it("discards a staged identity chain when a later target ID conflicts", () => {
    const dataFactory = new OWLDataFactory();
    const firstID = dataFactory.getOWLOntologyID(
      IRI.create("urn:index:identity:conflict:first"),
    );
    const intermediateID = dataFactory.getOWLOntologyID(
      IRI.create("urn:index:identity:conflict:intermediate"),
    );
    const secondID = dataFactory.getOWLOntologyID(
      IRI.create("urn:index:identity:conflict:second"),
    );
    const first = createOntology(dataFactory, firstID.ontologyIRI);
    const second = createOntology(dataFactory, secondID.ontologyIRI);
    const index = new ManagedOntologyIndex();
    index.registerOntology(first);
    index.registerOntology(second);
    const identityMutation = index.beginOntologyIdentityMutation();

    identityMutation.stageOntologyIDReplacement(first, firstID, intermediateID);
    expect(() =>
      identityMutation.stageOntologyIDReplacement(
        first,
        intermediateID,
        secondID,
      ),
    ).toThrow("An ontology with this ID already exists");
    identityMutation.discard();

    expect(index.getOntologyByID(firstID)).toBe(first);
    expect(index.getOntologyByID(intermediateID)).toBeUndefined();
    expect(index.getOntologyByID(secondID)).toBe(second);
  });

  it("rejects a non-ontology-ID replacement before changing staged aliases", () => {
    const dataFactory = new OWLDataFactory();
    const ontologyID = dataFactory.getOWLOntologyID(
      IRI.create("urn:index:identity:validated"),
    );
    const ontology = createOntology(dataFactory, ontologyID.ontologyIRI);
    const index = new ManagedOntologyIndex();
    index.registerOntology(ontology);
    const identityMutation = index.beginOntologyIdentityMutation();

    expect(() =>
      identityMutation.stageOntologyIDReplacement(
        ontology,
        ontologyID,
        IRI.create("urn:index:identity:not-an-ontology-id"),
      ),
    ).toThrow(/newOntologyID must be an OWLOntologyID/);
    identityMutation.discard();

    expect(index.getOntologyByID(ontologyID)).toBe(ontology);
  });

  it("preserves deterministic sibling-import order after a named ontology becomes anonymous", () => {
    const dataFactory = new OWLDataFactory();
    const root = createOntology(
      dataFactory,
      IRI.create("urn:index:identity:anonymous-order:root"),
    );
    const originalImportedID = dataFactory.getOWLOntologyID(
      IRI.create("urn:index:identity:anonymous-order:first"),
    );
    const anonymousImportedID = dataFactory.getOWLOntologyID();
    const firstImported = createManagerOwnedOWLOntology({
      ontologyID: originalImportedID,
    });
    const secondImported = createOntology(
      dataFactory,
      IRI.create("urn:index:identity:anonymous-order:second"),
    );
    const index = new ManagedOntologyIndex();
    const loadSession = index.beginLoadSession();
    loadSession.stageOntology(root);
    loadSession.stageOntology(firstImported.ontology);
    loadSession.stageOntology(secondImported);
    loadSession.stageDirectImport(root, firstImported.ontology);
    loadSession.stageDirectImport(root, secondImported);
    loadSession.commit();
    const importedOntologyOrder = () =>
      index
        .createImportsClosureSnapshot(root)
        .map((ontology) =>
          ontology === root
            ? "root"
            : ontology === firstImported.ontology
              ? "first"
              : "second",
        );
    expect(importedOntologyOrder()).toEqual(["root", "first", "second"]);
    const ontologyMutation = firstImported.ontologyState.createMutationDraft();
    const identityMutation = index.beginOntologyIdentityMutation();
    ontologyMutation.stageOntologyIDReplacement(anonymousImportedID);
    identityMutation.stageOntologyIDReplacement(
      firstImported.ontology,
      originalImportedID,
      anonymousImportedID,
    );
    firstImported.ontologyState.preflightMutation(ontologyMutation);
    identityMutation.preflight();

    identityMutation.commit();
    firstImported.ontologyState.commitMutation(ontologyMutation);

    expect(importedOntologyOrder()).toEqual(["root", "first", "second"]);
  });

  it("restores a missing import-order key when an identity chain cancels", () => {
    const dataFactory = new OWLDataFactory();
    const root = createOntology(
      dataFactory,
      IRI.create("urn:index:identity:cancelled-order:root"),
    );
    const anonymousImportedID = dataFactory.getOWLOntologyID();
    const temporaryImportedID = dataFactory.getOWLOntologyID(
      IRI.create("urn:index:identity:cancelled-order:temporary"),
    );
    const siblingImportedID = dataFactory.getOWLOntologyID(
      IRI.create("urn:index:identity:cancelled-order:sibling"),
    );
    const replacementSiblingImportedID = dataFactory.getOWLOntologyID(
      IRI.create("urn:index:identity:cancelled-order:replacement-sibling"),
    );
    const firstImported = createManagerOwnedOWLOntology({
      ontologyID: anonymousImportedID,
    });
    const siblingImported = createManagerOwnedOWLOntology({
      ontologyID: siblingImportedID,
    });
    const index = new ManagedOntologyIndex();
    const loadSession = index.beginLoadSession();
    loadSession.stageOntology(root);
    loadSession.stageOntology(firstImported.ontology);
    loadSession.stageOntology(siblingImported.ontology);
    loadSession.stageDirectImport(root, firstImported.ontology);
    loadSession.stageDirectImport(root, siblingImported.ontology);
    loadSession.commit();
    expect(() => index.createImportsClosureSnapshot(root)).toThrow(
      "A managed anonymous imported ontology has no resolved document IRI",
    );
    const firstOntologyMutation =
      firstImported.ontologyState.createMutationDraft();
    const siblingOntologyMutation =
      siblingImported.ontologyState.createMutationDraft();
    const identityMutation = index.beginOntologyIdentityMutation();

    firstOntologyMutation.stageOntologyIDReplacement(temporaryImportedID);
    identityMutation.stageOntologyIDReplacement(
      firstImported.ontology,
      anonymousImportedID,
      temporaryImportedID,
    );
    firstOntologyMutation.stageOntologyIDReplacement(anonymousImportedID);
    identityMutation.stageOntologyIDReplacement(
      firstImported.ontology,
      temporaryImportedID,
      anonymousImportedID,
    );
    siblingOntologyMutation.stageOntologyIDReplacement(
      replacementSiblingImportedID,
    );
    identityMutation.stageOntologyIDReplacement(
      siblingImported.ontology,
      siblingImportedID,
      replacementSiblingImportedID,
    );
    firstImported.ontologyState.preflightMutation(firstOntologyMutation);
    siblingImported.ontologyState.preflightMutation(siblingOntologyMutation);
    identityMutation.preflight();

    identityMutation.commit();
    firstImported.ontologyState.commitMutation(firstOntologyMutation);
    siblingImported.ontologyState.commitMutation(siblingOntologyMutation);

    expect(() => index.createImportsClosureSnapshot(root)).toThrow(
      "A managed anonymous imported ontology has no resolved document IRI",
    );
  });

  it("rejects a stale identity transaction without losing a later registration", () => {
    const dataFactory = new OWLDataFactory();
    const originalID = dataFactory.getOWLOntologyID(
      IRI.create("urn:index:identity:stale:original"),
    );
    const replacementID = dataFactory.getOWLOntologyID(
      IRI.create("urn:index:identity:stale:replacement"),
    );
    const retained = createOntology(dataFactory, originalID.ontologyIRI);
    const later = createOntology(
      dataFactory,
      IRI.create("urn:index:identity:stale:later"),
    );
    const index = new ManagedOntologyIndex();
    index.registerOntology(retained);
    const identityMutation = index.beginOntologyIdentityMutation();
    identityMutation.stageOntologyIDReplacement(
      retained,
      originalID,
      replacementID,
    );

    index.registerOntology(later);

    expect(() => identityMutation.preflight()).toThrow(/revision/i);
    identityMutation.discard();
    expect(index.getOntologyByID(originalID)).toBe(retained);
    expect(index.getOntologyByID(replacementID)).toBeUndefined();
    expect(index.getOntologyByID(later.getOntologyID())).toBe(later);
  });

  it("lets an open load session observe an identity committed after the session began", () => {
    const dataFactory = new OWLDataFactory();
    const originalID = dataFactory.getOWLOntologyID(
      IRI.create("urn:index:identity:concurrent-load:original"),
    );
    const replacementID = dataFactory.getOWLOntologyID(
      IRI.create("urn:index:identity:concurrent-load:replacement"),
    );
    const managed = createManagerOwnedOWLOntology({ ontologyID: originalID });
    const index = new ManagedOntologyIndex();
    index.registerOntology(managed.ontology);
    const loadSession = index.beginLoadSession();
    const identityMutation = index.beginOntologyIdentityMutation();
    const ontologyMutation = managed.ontologyState.createMutationDraft();
    ontologyMutation.stageOntologyIDReplacement(replacementID);
    identityMutation.stageOntologyIDReplacement(
      managed.ontology,
      originalID,
      replacementID,
    );
    managed.ontologyState.preflightMutation(ontologyMutation);
    identityMutation.preflight();

    identityMutation.commit();
    managed.ontologyState.commitMutation(ontologyMutation);

    expect(loadSession.getOntologyByID(originalID)).toBeUndefined();
    expect(loadSession.getOntologyByID(replacementID)).toBe(managed.ontology);
    expect(loadSession.getOntologyByIRI(replacementID.ontologyIRI)).toBe(
      managed.ontology,
    );
    loadSession.discard();
  });
});
