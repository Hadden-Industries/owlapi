import { OWLOntologyStateError } from "../../io/errors.js";
import { OWLObjectKind } from "../../model/kinds.js";
import {
  isCanonicalStructuralObject,
  OWLStructuralObject,
} from "../../model/structural.js";

const ontologyIDKey = (ontologyID, name = "ontologyID") => {
  if (
    !isCanonicalStructuralObject(ontologyID) ||
    ontologyID.kind !== OWLObjectKind.ONTOLOGY_ID ||
    Object.getPrototypeOf(ontologyID) !== OWLStructuralObject.prototype
  ) {
    throw new TypeError(`${name} must be an OWLOntologyID`);
  }
  try {
    return OWLStructuralObject.prototype.structuralKey.call(ontologyID);
  } catch {
    throw new TypeError(`${name} must be an OWLOntologyID`);
  }
};

const requireOntology = (ontology) => {
  if (!ontology || typeof ontology.getOntologyID !== "function") {
    throw new TypeError("ontology must be an OWLOntology");
  }
  ontologyIDKey(ontology.getOntologyID());
  return ontology;
};

const iriKey = (iri, name) => {
  if (!iri || typeof iri.value !== "string") {
    throw new TypeError(`${name} must be an IRI`);
  }
  return iri.value;
};

const createEmptyState = () => ({
  deterministicImportOrderKeyByOntology: new Map(),
  directImportsByOntology: new Map(),
  documentIRIByOntology: new Map(),
  ontologies: new Set(),
  ontologiesByOntologyIRI: new Map(),
  ontologiesByVersionIRI: new Map(),
  ontologyByDocumentIRI: new Map(),
  ontologyByID: new Map(),
  revision: 0,
});

const cloneSetIndex = (index) =>
  new Map([...index].map(([key, ontologies]) => [key, new Set(ontologies)]));

const cloneManagedOntologyState = (state) => ({
  deterministicImportOrderKeyByOntology: new Map(
    state.deterministicImportOrderKeyByOntology,
  ),
  directImportsByOntology: cloneSetIndex(state.directImportsByOntology),
  documentIRIByOntology: new Map(state.documentIRIByOntology),
  ontologies: new Set(state.ontologies),
  ontologiesByOntologyIRI: cloneSetIndex(state.ontologiesByOntologyIRI),
  ontologiesByVersionIRI: cloneSetIndex(state.ontologiesByVersionIRI),
  ontologyByDocumentIRI: new Map(state.ontologyByDocumentIRI),
  ontologyByID: new Map(state.ontologyByID),
  revision: state.revision,
});

const addToSetIndex = (index, key, ontology) => {
  if (key === undefined) {
    return;
  }
  let matches = index.get(key);
  if (!matches) {
    matches = new Set();
    index.set(key, matches);
  }
  matches.add(ontology);
};

const removeFromSetIndex = (index, key, ontology) => {
  if (key === undefined) {
    return;
  }
  const matches = index.get(key);
  if (!matches) {
    return;
  }
  matches.delete(ontology);
  if (matches.size === 0) {
    index.delete(key);
  }
};

const normalizeOntologyIdentity = (
  ontology,
  ontologyID,
  name = "ontologyID",
) => ({
  ontology,
  ontologyID,
  ontologyIDKey: ontologyIDKey(ontologyID, name),
  ontologyIRIKey:
    ontologyID.ontologyIRI === undefined
      ? undefined
      : iriKey(ontologyID.ontologyIRI, "ontology IRI"),
  versionIRIKey:
    ontologyID.versionIRI === undefined
      ? undefined
      : iriKey(ontologyID.versionIRI, "version IRI"),
});

const createDeterministicImportOrderKey = (ontologyID, documentIRI) => {
  if (ontologyID.ontologyIRI !== undefined) {
    return Object.freeze([
      0,
      ontologyID.ontologyIRI.value,
      ontologyID.versionIRI?.value ?? "",
      documentIRI?.value ?? "",
    ]);
  }
  return documentIRI === undefined
    ? undefined
    : Object.freeze([1, documentIRI.value]);
};

const normalizeOntologyRegistration = (ontology, { documentIRI } = {}) => {
  requireOntology(ontology);
  const ontologyID = ontology.getOntologyID();
  return {
    documentIRI,
    documentIRIKey:
      documentIRI === undefined
        ? undefined
        : iriKey(documentIRI, "documentIRI"),
    ...normalizeOntologyIdentity(ontology, ontologyID),
  };
};

const validateOntologyRegistrationAgainstState = (state, registration) => {
  const {
    documentIRI,
    documentIRIKey,
    ontology,
    ontologyID,
    ontologyIDKey: structuralOntologyIDKey,
  } = registration;
  const ontologyWithID = state.ontologyByID.get(structuralOntologyIDKey);
  if (ontologyWithID && ontologyWithID !== ontology) {
    throw new OWLOntologyStateError("An ontology with this ID already exists", {
      documentIRI,
      ontologyID,
    });
  }

  if (documentIRIKey !== undefined) {
    const ontologyAtDocumentIRI =
      state.ontologyByDocumentIRI.get(documentIRIKey);
    if (ontologyAtDocumentIRI && ontologyAtDocumentIRI !== ontology) {
      throw new OWLOntologyStateError(
        "An ontology document with this IRI is already registered",
        { documentIRI },
      );
    }
  }
};

const applyOntologyRegistrationToState = (state, registration) => {
  const {
    documentIRI,
    documentIRIKey,
    ontology,
    ontologyID,
    ontologyIDKey: structuralOntologyIDKey,
    ontologyIRIKey,
    versionIRIKey,
  } = registration;
  state.ontologies.add(ontology);
  const deterministicImportOrderKey = createDeterministicImportOrderKey(
    ontologyID,
    documentIRI,
  );
  if (deterministicImportOrderKey !== undefined) {
    state.deterministicImportOrderKeyByOntology.set(
      ontology,
      deterministicImportOrderKey,
    );
  }
  state.ontologyByID.set(structuralOntologyIDKey, ontology);
  addToSetIndex(state.ontologiesByOntologyIRI, ontologyIRIKey, ontology);
  addToSetIndex(state.ontologiesByVersionIRI, versionIRIKey, ontology);
  if (documentIRIKey !== undefined) {
    state.ontologyByDocumentIRI.set(documentIRIKey, ontology);
    if (!state.documentIRIByOntology.has(ontology)) {
      state.documentIRIByOntology.set(ontology, documentIRI);
    }
  }
};

const requireManagedOntology = (state, ontology, operation, details = {}) => {
  requireOntology(ontology);
  if (!state.ontologies.has(ontology)) {
    throw new OWLOntologyStateError(
      "The ontology is not managed by this ontology manager",
      { ...details, ontology, operation },
    );
  }
};

const requireManagedOntologyInStates = (states, ontology) => {
  requireOntology(ontology);
  if (!states.some((state) => state.ontologies.has(ontology))) {
    throw new OWLOntologyStateError(
      "The ontology is not managed by this ontology index",
      { ontology },
    );
  }
};

const applyDirectImportToState = (
  state,
  importingOntology,
  importedOntology,
) => {
  let directImports = state.directImportsByOntology.get(importingOntology);
  if (!directImports) {
    directImports = new Set();
    state.directImportsByOntology.set(importingOntology, directImports);
  }
  directImports.add(importedOntology);
};

const getOntologyByIRIFromStates = (states, iri) => {
  const key = iriKey(iri, "iri");
  const matches = new Set();
  for (const state of states) {
    state.ontologiesByOntologyIRI
      .get(key)
      ?.forEach((ontology) => matches.add(ontology));
    state.ontologiesByVersionIRI
      .get(key)
      ?.forEach((ontology) => matches.add(ontology));
  }
  if (matches.size > 1) {
    throw new OWLOntologyStateError(
      "The IRI identifies more than one managed ontology",
      {
        iri,
        ontologyIDs: Object.freeze(
          [...matches].map((ontology) => ontology.getOntologyID()),
        ),
      },
    );
  }
  return matches.values().next().value;
};

const getOntologyByDocumentIRIFromStates = (states, documentIRI) => {
  const key = iriKey(documentIRI, "documentIRI");
  for (const state of states) {
    const ontology = state.ontologyByDocumentIRI.get(key);
    if (ontology) {
      return ontology;
    }
  }
  return undefined;
};

const compareCodeUnitStrings = (left, right) => {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
};

const ontologyImportOrderKey = (state, ontology, operation) => {
  const deterministicImportOrderKey =
    state.deterministicImportOrderKeyByOntology.get(ontology);
  if (deterministicImportOrderKey === undefined) {
    throw new OWLOntologyStateError(
      "A managed anonymous imported ontology has no resolved document IRI",
      { ontology, operation },
    );
  }
  return deterministicImportOrderKey;
};

const compareOntologyImportOrder = (state, left, right, operation) => {
  const leftKey = ontologyImportOrderKey(state, left, operation);
  const rightKey = ontologyImportOrderKey(state, right, operation);
  const componentCount = Math.max(leftKey.length, rightKey.length);
  for (let index = 0; index < componentCount; index += 1) {
    const leftComponent = leftKey[index] ?? "";
    const rightComponent = rightKey[index] ?? "";
    const comparison =
      typeof leftComponent === "number"
        ? leftComponent - rightComponent
        : compareCodeUnitStrings(leftComponent, rightComponent);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
};

class ManagedOntologyLoadSession {
  #closed = false;
  #commitStagedChanges;
  #getCommittedState;
  #stagedOntologyRegistrations = [];
  #stagedState = createEmptyState();

  constructor(getCommittedState, commitStagedChanges) {
    this.#getCommittedState = getCommittedState;
    this.#commitStagedChanges = commitStagedChanges;
  }

  #requireOpen() {
    if (this.#closed) {
      throw new OWLOntologyStateError(
        "The managed ontology load session is already closed",
      );
    }
  }

  hasOntology(ontology) {
    this.#requireOpen();
    return (
      this.#stagedState.ontologies.has(ontology) ||
      this.#getCommittedState().ontologies.has(ontology)
    );
  }

  getOntologyByID(ontologyID) {
    this.#requireOpen();
    const key = ontologyIDKey(ontologyID);
    return (
      this.#stagedState.ontologyByID.get(key) ||
      this.#getCommittedState().ontologyByID.get(key)
    );
  }

  getOntologyByIRI(iri) {
    this.#requireOpen();
    return getOntologyByIRIFromStates(
      [this.#stagedState, this.#getCommittedState()],
      iri,
    );
  }

  getOntologyByDocumentIRI(documentIRI) {
    this.#requireOpen();
    return getOntologyByDocumentIRIFromStates(
      [this.#stagedState, this.#getCommittedState()],
      documentIRI,
    );
  }

  stageOntology(ontology, options = {}) {
    this.#requireOpen();
    const registration = normalizeOntologyRegistration(ontology, options);
    validateOntologyRegistrationAgainstState(
      this.#getCommittedState(),
      registration,
    );
    validateOntologyRegistrationAgainstState(this.#stagedState, registration);
    applyOntologyRegistrationToState(this.#stagedState, registration);
    this.#stagedOntologyRegistrations.push(registration);
  }

  stageDirectImport(importingOntology, importedOntology) {
    this.#requireOpen();
    const visibleStates = [this.#stagedState, this.#getCommittedState()];
    requireManagedOntologyInStates(visibleStates, importingOntology);
    requireManagedOntologyInStates(visibleStates, importedOntology);
    applyDirectImportToState(
      this.#stagedState,
      importingOntology,
      importedOntology,
    );
  }

  commit() {
    this.#requireOpen();
    this.#closed = true;
    this.#commitStagedChanges({
      directImportsByOntology: this.#stagedState.directImportsByOntology,
      ontologyRegistrations: this.#stagedOntologyRegistrations,
      stagedState: this.#stagedState,
    });
  }

  discard() {
    this.#requireOpen();
    this.#closed = true;
  }
}

class ManagedOntologyIdentityMutation {
  #baseRevision;
  #changesState = false;
  #closed = false;
  #currentRevision;
  #originalIdentityStateByOntology = new Map();
  #publishPreparedState;
  #stagedState;

  constructor(committedState, currentRevision, publishPreparedState) {
    this.#baseRevision = committedState.revision;
    this.#currentRevision = currentRevision;
    this.#publishPreparedState = publishPreparedState;
    this.#stagedState = cloneManagedOntologyState(committedState);
  }

  #requireOpen() {
    if (this.#closed) {
      throw new OWLOntologyStateError(
        "The managed ontology identity mutation is already closed",
      );
    }
  }

  #requireCurrentRevision() {
    const currentRevision = this.#currentRevision();
    if (currentRevision !== this.#baseRevision) {
      throw new OWLOntologyStateError(
        `The managed ontology identity mutation revision ${this.#baseRevision} does not match current revision ${currentRevision}`,
        {
          baseRevision: this.#baseRevision,
          currentRevision,
        },
      );
    }
  }

  stageOntologyIDReplacement(
    ontology,
    currentOntologyID,
    newOntologyID,
    { change, index, operation } = {},
  ) {
    this.#requireOpen();
    requireManagedOntology(this.#stagedState, ontology, operation, {
      change,
      index,
    });
    const currentIdentity = normalizeOntologyIdentity(
      ontology,
      currentOntologyID,
      "currentOntologyID",
    );
    const newIdentity = normalizeOntologyIdentity(
      ontology,
      newOntologyID,
      "newOntologyID",
    );
    if (
      this.#stagedState.ontologyByID.get(currentIdentity.ontologyIDKey) !==
      ontology
    ) {
      throw new OWLOntologyStateError(
        "The ontology identity mutation does not match the staged current ID",
        {
          change,
          index,
          ontology,
          ontologyID: currentOntologyID,
          operation,
        },
      );
    }
    if (currentIdentity.ontologyIDKey === newIdentity.ontologyIDKey) {
      return false;
    }

    const conflictingOntology = this.#stagedState.ontologyByID.get(
      newIdentity.ontologyIDKey,
    );
    if (conflictingOntology && conflictingOntology !== ontology) {
      throw new OWLOntologyStateError(
        "An ontology with this ID already exists",
        {
          change,
          conflictingOntology,
          index,
          ontology,
          ontologyID: newOntologyID,
          operation,
        },
      );
    }

    if (!this.#originalIdentityStateByOntology.has(ontology)) {
      this.#originalIdentityStateByOntology.set(
        ontology,
        Object.freeze({
          deterministicImportOrderKey:
            this.#stagedState.deterministicImportOrderKeyByOntology.get(
              ontology,
            ),
          deterministicImportOrderKeyWasPresent:
            this.#stagedState.deterministicImportOrderKeyByOntology.has(
              ontology,
            ),
          ontologyIDKey: currentIdentity.ontologyIDKey,
        }),
      );
    }

    this.#stagedState.ontologyByID.delete(currentIdentity.ontologyIDKey);
    removeFromSetIndex(
      this.#stagedState.ontologiesByOntologyIRI,
      currentIdentity.ontologyIRIKey,
      ontology,
    );
    removeFromSetIndex(
      this.#stagedState.ontologiesByVersionIRI,
      currentIdentity.versionIRIKey,
      ontology,
    );
    this.#stagedState.ontologyByID.set(newIdentity.ontologyIDKey, ontology);
    const replacementImportOrderKey = createDeterministicImportOrderKey(
      newIdentity.ontologyID,
      this.#stagedState.documentIRIByOntology.get(ontology),
    );
    if (replacementImportOrderKey !== undefined) {
      this.#stagedState.deterministicImportOrderKeyByOntology.set(
        ontology,
        replacementImportOrderKey,
      );
    }
    addToSetIndex(
      this.#stagedState.ontologiesByOntologyIRI,
      newIdentity.ontologyIRIKey,
      ontology,
    );
    addToSetIndex(
      this.#stagedState.ontologiesByVersionIRI,
      newIdentity.versionIRIKey,
      ontology,
    );
    const originalIdentityState =
      this.#originalIdentityStateByOntology.get(ontology);
    if (originalIdentityState.ontologyIDKey === newIdentity.ontologyIDKey) {
      if (originalIdentityState.deterministicImportOrderKeyWasPresent) {
        this.#stagedState.deterministicImportOrderKeyByOntology.set(
          ontology,
          originalIdentityState.deterministicImportOrderKey,
        );
      } else {
        this.#stagedState.deterministicImportOrderKeyByOntology.delete(
          ontology,
        );
      }
      this.#originalIdentityStateByOntology.delete(ontology);
    }
    this.#changesState = this.#originalIdentityStateByOntology.size > 0;
    return true;
  }

  preflight() {
    this.assertPreparedMutationIsCurrent();
    return Object.freeze({
      baseRevision: this.#baseRevision,
      changesState: this.#changesState,
    });
  }

  assertPreparedMutationIsCurrent() {
    this.#requireOpen();
    this.#requireCurrentRevision();
  }

  commit() {
    this.assertPreparedMutationIsCurrent();
    this.#closed = true;
    if (!this.#changesState) {
      return false;
    }
    this.#stagedState.revision = this.#baseRevision + 1;
    this.#publishPreparedState(this.#stagedState);
    return true;
  }

  discard() {
    this.#requireOpen();
    this.#closed = true;
  }
}

export class ManagedOntologyIndex {
  #state = createEmptyState();

  hasOntology(ontology) {
    return this.#state.ontologies.has(ontology);
  }

  getOntologyByID(ontologyID) {
    return this.#state.ontologyByID.get(ontologyIDKey(ontologyID));
  }

  getOntologyByIRI(iri) {
    return getOntologyByIRIFromStates([this.#state], iri);
  }

  getOntologyByDocumentIRI(documentIRI) {
    return getOntologyByDocumentIRIFromStates([this.#state], documentIRI);
  }

  getDirectImports(ontology) {
    return new Set(this.#state.directImportsByOntology.get(ontology) || []);
  }

  createImportsClosureSnapshot(ontology, { operation } = {}) {
    requireManagedOntology(this.#state, ontology, operation);
    const closure = [];
    const visited = new Set([ontology]);
    const pending = [ontology];
    while (pending.length > 0) {
      const current = pending.pop();
      closure.push(current);
      const directImports = [
        ...(this.#state.directImportsByOntology.get(current) || []),
      ].sort((left, right) =>
        compareOntologyImportOrder(this.#state, left, right, operation),
      );
      for (let index = directImports.length - 1; index >= 0; index -= 1) {
        const importedOntology = directImports[index];
        if (!visited.has(importedOntology)) {
          visited.add(importedOntology);
          pending.push(importedOntology);
        }
      }
    }
    return Object.freeze(closure);
  }

  registerOntology(ontology, options = {}) {
    const registration = normalizeOntologyRegistration(ontology, options);
    validateOntologyRegistrationAgainstState(this.#state, registration);
    applyOntologyRegistrationToState(this.#state, registration);
    this.#state.revision += 1;
  }

  beginOntologyIdentityMutation() {
    return new ManagedOntologyIdentityMutation(
      this.#state,
      () => this.#state.revision,
      (preparedState) => {
        this.#state = preparedState;
      },
    );
  }

  beginLoadSession() {
    return new ManagedOntologyLoadSession(
      () => this.#state,
      (stagedChanges) => {
        for (const registration of stagedChanges.ontologyRegistrations) {
          validateOntologyRegistrationAgainstState(this.#state, registration);
        }
        for (const [
          importingOntology,
          importedOntologies,
        ] of stagedChanges.directImportsByOntology) {
          const statesAfterCommit = [this.#state, stagedChanges.stagedState];
          requireManagedOntologyInStates(statesAfterCommit, importingOntology);
          importedOntologies.forEach((importedOntology) =>
            requireManagedOntologyInStates(statesAfterCommit, importedOntology),
          );
        }

        // All operations below are synchronous, non-observable index mutations.
        // Complete validation above therefore makes the publication atomic
        // without copying retained ontology or edge buckets.
        for (const registration of stagedChanges.ontologyRegistrations) {
          applyOntologyRegistrationToState(this.#state, registration);
        }
        for (const [
          importingOntology,
          importedOntologies,
        ] of stagedChanges.directImportsByOntology) {
          importedOntologies.forEach((importedOntology) => {
            applyDirectImportToState(
              this.#state,
              importingOntology,
              importedOntology,
            );
          });
        }
        this.#state.revision += 1;
      },
    );
  }
}
