import {
  IRI,
  OWLDataFactory,
  OWLObjectKind,
  StructuralSet,
} from "../../model/index.js";
import { createManagerOwnedOWLOntology } from "../../model/owlOntology.js";
import { rdfDataFactory } from "../rdfjs/environment.js";
import { OntologyState } from "./ontologyState.js";

describe("OntologyState", () => {
  const dataFactory = new OWLDataFactory();
  const ontologyID = dataFactory.getOWLOntologyID(
    IRI.create("urn:ontology-state:ontology"),
    IRI.create("urn:ontology-state:version"),
  );
  const classA = dataFactory.getOWLClass(IRI.create("urn:ontology-state:A"));
  const classB = dataFactory.getOWLClass(IRI.create("urn:ontology-state:B"));
  const initialAxiom = dataFactory.getOWLDeclarationAxiom(classA);
  const addedAxiom = dataFactory.getOWLSubClassOfAxiom(classA, classB);
  const annotation = dataFactory.getOWLAnnotation(
    dataFactory.getRDFSLabel(),
    dataFactory.getOWLLiteral("ontology", "en"),
  );
  const importDeclaration = dataFactory.getOWLImportsDeclaration(
    IRI.create("urn:ontology-state:import"),
  );
  const documentMetadata = Object.freeze({
    diagnostics: Object.freeze([]),
    documentIRI: IRI.create("urn:ontology-state:document"),
    format: Object.freeze({ key: "test" }),
  });

  const createState = () =>
    new OntologyState({
      authoredImportDeclarations: [importDeclaration],
      directAxioms: [initialAxiom],
      directOntologyAnnotations: [annotation],
      documentMetadata,
      ontologyID,
    });

  it("creates a frozen snapshot of every direct state component", () => {
    const snapshot = createState().createSnapshot();

    expect(snapshot).toMatchObject({
      documentMetadata,
      ontologyID,
      revision: 0,
    });
    expect(snapshot.directAxioms).toEqual([initialAxiom]);
    expect(snapshot.directOntologyAnnotations).toEqual([annotation]);
    expect(snapshot.authoredImportDeclarations).toEqual([importDeclaration]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.directAxioms)).toBe(true);
    expect(Object.isFrozen(snapshot.directOntologyAnnotations)).toBe(true);
    expect(Object.isFrozen(snapshot.authoredImportDeclarations)).toBe(true);
  });

  it("snapshots nested RDF graph metadata without changing the committed revision", () => {
    const selectedGraph = rdfDataFactory.namedNode(
      "urn:ontology-state:source-graph",
    );
    const suppliedMetadata = Object.freeze({
      ...documentMetadata,
      merged: false,
      selectedGraph,
    });
    const state = new OntologyState({ documentMetadata: suppliedMetadata });
    const snapshot = state.createSnapshot();

    expect(snapshot.documentMetadata).not.toBe(suppliedMetadata);
    expect(snapshot.documentMetadata.selectedGraph).not.toBe(selectedGraph);
    expect(snapshot.documentMetadata.selectedGraph.equals(selectedGraph)).toBe(
      true,
    );
    expect(Object.isFrozen(snapshot.documentMetadata.selectedGraph)).toBe(true);

    selectedGraph.value = "urn:ontology-state:mutated-graph";

    expect(state.createSnapshot()).toBe(snapshot);
    expect(snapshot).toMatchObject({ revision: 0 });
    expect(snapshot.documentMetadata.selectedGraph.value).toBe(
      "urn:ontology-state:source-graph",
    );
  });

  it("deeply snapshots plain document metadata and rejects mutable opaque values", () => {
    const diagnosticDetails = { token: "before" };
    const jsonLdContextDefinition = { ex: "https://example.com/" };
    const prefixes = { "ex:": "https://example.com/" };
    const state = new OntologyState({
      documentMetadata: {
        diagnostics: [{ details: diagnosticDetails }],
        documentIRI: documentMetadata.documentIRI,
        format: documentMetadata.format,
        jsonLdContexts: [{ "@context": jsonLdContextDefinition }],
        prefixes,
      },
    });
    const snapshot = state.createSnapshot();

    diagnosticDetails.token = "after";
    jsonLdContextDefinition.ex = "https://mutated.example/";
    prefixes["ex:"] = "https://mutated.example/";

    expect(snapshot.documentMetadata).toMatchObject({
      diagnostics: [{ details: { token: "before" } }],
      jsonLdContexts: [{ "@context": { ex: "https://example.com/" } }],
      prefixes: { "ex:": "https://example.com/" },
    });
    expect(
      Object.isFrozen(snapshot.documentMetadata.diagnostics[0].details),
    ).toBe(true);
    expect(
      Object.isFrozen(snapshot.documentMetadata.jsonLdContexts[0]["@context"]),
    ).toBe(true);

    expect(
      () =>
        new OntologyState({
          documentMetadata: {
            documentIRI: { value: "urn:ontology-state:mutable" },
          },
        }),
    ).toThrow(/documentMetadata\.documentIRI must be transitively immutable/);
  });

  it("rejects frozen collection objects with mutable internal slots", () => {
    const mutableInternalSlotValues = [
      Object.freeze(new Map([["before", 1]])),
      Object.freeze(new Set(["before"])),
    ];

    for (const mutableInternalSlotValue of mutableInternalSlotValues) {
      expect(Object.isFrozen(mutableInternalSlotValue)).toBe(true);
      expect(
        () =>
          new OntologyState({
            documentMetadata: {
              diagnostics: [
                {
                  details: mutableInternalSlotValue,
                },
              ],
            },
          }),
      ).toThrow(
        /documentMetadata\.diagnostics\[0\]\.details must be immutable data/,
      );
    }
  });

  it("clones state into a draft and commits one atomic revision", () => {
    const state = createState();
    const draft = state.createMutationDraft();

    expect(draft.stageAxiomAddition(addedAxiom)).toBe(true);
    const preflight = state.preflightMutation(draft);

    expect(preflight).toEqual({ baseRevision: 0, changesState: true });
    expect(Object.isFrozen(preflight)).toBe(true);
    expect(state.createSnapshot()).toMatchObject({
      directAxioms: [initialAxiom],
      revision: 0,
    });

    expect(state.commitMutation(draft)).toBe(true);
    expect(state.createSnapshot()).toMatchObject({
      directAxioms: [initialAxiom, addedAxiom],
      revision: 1,
    });
  });

  it("does not advance the revision for a structurally duplicate-only draft", () => {
    const state = createState();
    const draft = state.createMutationDraft();
    const duplicate = dataFactory.getOWLDeclarationAxiom(classA);

    expect(draft.stageAxiomAddition(duplicate)).toBe(false);
    expect(state.preflightMutation(draft)).toEqual({
      baseRevision: 0,
      changesState: false,
    });
    expect(state.commitMutation(draft)).toBe(false);
    expect(state.createSnapshot()).toMatchObject({
      directAxioms: [initialAxiom],
      revision: 0,
    });
  });

  it("stages ontology identity and direct annotations as one prepared revision", () => {
    const state = createState();
    const replacementOntologyID = dataFactory.getOWLOntologyID(
      IRI.create("urn:ontology-state:replacement"),
      IRI.create("urn:ontology-state:replacement:version"),
    );
    const addedAnnotation = dataFactory.getOWLAnnotation(
      dataFactory.getRDFSLabel(),
      dataFactory.getOWLLiteral("added ontology annotation", "en"),
    );
    const structuralDuplicate = dataFactory.getOWLAnnotation(
      dataFactory.getRDFSLabel(),
      dataFactory.getOWLLiteral("added ontology annotation", "en"),
    );
    const draft = state.createMutationDraft();

    expect(draft.getStagedOntologyID()).toBe(ontologyID);
    expect(draft.stageOntologyIDReplacement(replacementOntologyID)).toBe(true);
    expect(draft.getStagedOntologyID()).toBe(replacementOntologyID);
    expect(draft.stageOntologyAnnotationAddition(addedAnnotation)).toBe(true);
    expect(draft.stageOntologyAnnotationAddition(structuralDuplicate)).toBe(
      false,
    );

    const before = state.createSnapshot();
    expect(state.preflightMutation(draft)).toEqual({
      baseRevision: 0,
      changesState: true,
    });
    expect(state.createSnapshot()).toBe(before);
    expect(state.commitMutation(draft)).toBe(true);
    expect(state.createSnapshot()).toMatchObject({
      directAxioms: [initialAxiom],
      directOntologyAnnotations: [annotation, addedAnnotation],
      ontologyID: replacementOntologyID,
      revision: 1,
    });
  });

  it("keeps identity, annotations, and revision unchanged when a draft is discarded", () => {
    const state = createState();
    const before = state.createSnapshot();
    const draft = state.createMutationDraft();
    draft.stageOntologyIDReplacement(
      dataFactory.getOWLOntologyID(
        IRI.create("urn:ontology-state:discarded-replacement"),
      ),
    );
    draft.stageOntologyAnnotationAddition(
      dataFactory.getOWLAnnotation(
        dataFactory.getRDFSLabel(),
        dataFactory.getOWLLiteral("discarded annotation"),
      ),
    );

    state.preflightMutation(draft);
    state.discardMutation(draft);

    expect(state.createSnapshot()).toBe(before);
    expect(state.createSnapshot()).toMatchObject({ revision: 0 });
  });

  it("discards a staged mutation without changing any queryable state", () => {
    const state = createState();
    const before = state.createSnapshot();
    const draft = state.createMutationDraft();
    draft.stageAxiomAddition(addedAxiom);

    state.discardMutation(draft);

    expect(state.createSnapshot()).toBe(before);
    expect(() => state.commitMutation(draft)).toThrow(/closed/i);
  });

  it("rejects a stale draft without partially replacing committed state", () => {
    const state = createState();
    const staleDraft = state.createMutationDraft();
    const committedDraft = state.createMutationDraft();
    committedDraft.stageAxiomAddition(addedAxiom);
    state.commitMutation(committedDraft);
    const beforeRejectedCommit = state.createSnapshot();

    staleDraft.stageAxiomAddition(dataFactory.getOWLDeclarationAxiom(classB));

    expect(() => state.preflightMutation(staleDraft)).toThrow(/revision/i);
    expect(() => state.commitMutation(staleDraft)).toThrow(/revision/i);
    expect(state.createSnapshot()).toBe(beforeRejectedCommit);
  });

  it("rechecks the revision after preparing a snapshot that permits reentrant code", () => {
    const state = createState();
    const outerDraft = state.createMutationDraft();
    outerDraft.stageOntologyAnnotationAddition(
      dataFactory.getOWLAnnotation(
        dataFactory.getRDFSLabel(),
        dataFactory.getOWLLiteral("outer annotation"),
      ),
    );
    const nestedAxiom = dataFactory.getOWLDeclarationAxiom(classB);
    const originalIterator = StructuralSet.prototype[Symbol.iterator];
    let nestedMutationCommitted = false;
    StructuralSet.prototype[Symbol.iterator] = function reentrantIterator() {
      if (!nestedMutationCommitted) {
        nestedMutationCommitted = true;
        const nestedDraft = state.createMutationDraft();
        nestedDraft.stageAxiomAddition(nestedAxiom);
        state.preflightMutation(nestedDraft);
        state.commitMutation(nestedDraft);
      }
      return originalIterator.call(this);
    };

    try {
      expect(() => state.preflightMutation(outerDraft)).toThrow(/revision/i);
    } finally {
      StructuralSet.prototype[Symbol.iterator] = originalIterator;
    }

    expect(state.createSnapshot()).toMatchObject({
      directAxioms: [initialAxiom, nestedAxiom],
      directOntologyAnnotations: [annotation],
      revision: 1,
    });
    state.discardMutation(outerDraft);
  });

  it("validates a staged axiom before any state replacement", () => {
    const state = createState();
    const before = state.createSnapshot();
    const draft = state.createMutationDraft();
    const notAnAxiom = dataFactory.getOWLClass(
      IRI.create("urn:ontology-state:not-an-axiom"),
    );

    expect(() => draft.stageAxiomAddition(notAnAxiom)).toThrow(TypeError);
    expect(state.createSnapshot()).toBe(before);
    state.discardMutation(draft);
  });

  it("replaces document metadata only through a committed draft", () => {
    const state = createState();
    const replacement = Object.freeze({
      diagnostics: Object.freeze([
        Object.freeze({
          code: "TEST",
          message: "diagnostic",
          severity: "info",
        }),
      ]),
      documentIRI: documentMetadata.documentIRI,
      format: documentMetadata.format,
    });
    const draft = state.createMutationDraft();

    expect(draft.stageDocumentMetadataReplacement(replacement)).toBe(true);
    expect(state.createSnapshot().documentMetadata).not.toBe(documentMetadata);
    expect(state.createSnapshot().documentMetadata).toEqual(documentMetadata);
    expect(state.commitMutation(draft)).toBe(true);
    expect(state.createSnapshot()).toMatchObject({
      documentMetadata: replacement,
      revision: 1,
    });
    expect(state.createSnapshot().documentMetadata).not.toBe(replacement);
  });

  it("backs a frozen ontology façade without exposing its mutation authority", () => {
    const { ontology, ontologyState } = createManagerOwnedOWLOntology({
      axioms: [initialAxiom],
      ontologyID,
    });
    const draft = ontologyState.createMutationDraft();
    draft.stageAxiomAddition(addedAxiom);
    ontologyState.commitMutation(draft);

    expect(ontology.getAxioms()).toEqual(new Set([initialAxiom, addedAxiom]));
    expect(Object.isFrozen(ontology)).toBe(true);
    expect(Reflect.ownKeys(ontology)).toEqual([]);
    expect(Object.values(OWLObjectKind).includes(ontologyState?.kind)).toBe(
      false,
    );
  });
});
