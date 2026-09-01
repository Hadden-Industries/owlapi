import { OWLOntologyStateError } from "../../io/errors.js";

const ontologyIDKey = (ontologyID) => {
  if (!ontologyID || typeof ontologyID.structuralKey !== "function") {
    throw new TypeError("ontologyID must be an OWLOntologyID");
  }
  return ontologyID.structuralKey();
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
  directImportsByOntology: new Map(),
  documentIRIByOntology: new Map(),
  ontologies: new Set(),
  ontologiesByOntologyIRI: new Map(),
  ontologiesByVersionIRI: new Map(),
  ontologyByDocumentIRI: new Map(),
  ontologyByID: new Map(),
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

const normalizeOntologyRegistration = (ontology, { documentIRI } = {}) => {
  requireOntology(ontology);
  const ontologyID = ontology.getOntologyID();
  return {
    documentIRI,
    documentIRIKey:
      documentIRI === undefined
        ? undefined
        : iriKey(documentIRI, "documentIRI"),
    ontology,
    ontologyID,
    ontologyIDKey: ontologyIDKey(ontologyID),
    ontologyIRIKey:
      ontologyID.ontologyIRI === undefined
        ? undefined
        : iriKey(ontologyID.ontologyIRI, "ontology IRI"),
    versionIRIKey:
      ontologyID.versionIRI === undefined
        ? undefined
        : iriKey(ontologyID.versionIRI, "version IRI"),
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
    ontologyIDKey: structuralOntologyIDKey,
    ontologyIRIKey,
    versionIRIKey,
  } = registration;
  state.ontologies.add(ontology);
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

const requireManagedOntology = (state, ontology, operation) => {
  requireOntology(ontology);
  if (!state.ontologies.has(ontology)) {
    throw new OWLOntologyStateError(
      "The ontology is not managed by this ontology manager",
      { ontology, operation },
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
  const ontologyID = ontology.getOntologyID();
  const documentIRI = state.documentIRIByOntology.get(ontology);
  if (ontologyID.ontologyIRI !== undefined) {
    return Object.freeze([
      0,
      ontologyID.ontologyIRI.value,
      ontologyID.versionIRI?.value ?? "",
      documentIRI?.value ?? "",
    ]);
  }
  if (documentIRI === undefined) {
    throw new OWLOntologyStateError(
      "A managed anonymous imported ontology has no resolved document IRI",
      { ontology, operation },
    );
  }
  return Object.freeze([1, documentIRI.value]);
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
  #committedState;
  #commitStagedChanges;
  #stagedOntologyRegistrations = [];
  #stagedState = createEmptyState();

  constructor(committedState, commitStagedChanges) {
    this.#committedState = committedState;
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
      this.#committedState.ontologies.has(ontology)
    );
  }

  getOntologyByID(ontologyID) {
    this.#requireOpen();
    const key = ontologyIDKey(ontologyID);
    return (
      this.#stagedState.ontologyByID.get(key) ||
      this.#committedState.ontologyByID.get(key)
    );
  }

  getOntologyByIRI(iri) {
    this.#requireOpen();
    return getOntologyByIRIFromStates(
      [this.#stagedState, this.#committedState],
      iri,
    );
  }

  getOntologyByDocumentIRI(documentIRI) {
    this.#requireOpen();
    return getOntologyByDocumentIRIFromStates(
      [this.#stagedState, this.#committedState],
      documentIRI,
    );
  }

  stageOntology(ontology, options = {}) {
    this.#requireOpen();
    const registration = normalizeOntologyRegistration(ontology, options);
    validateOntologyRegistrationAgainstState(
      this.#committedState,
      registration,
    );
    validateOntologyRegistrationAgainstState(this.#stagedState, registration);
    applyOntologyRegistrationToState(this.#stagedState, registration);
    this.#stagedOntologyRegistrations.push(registration);
  }

  stageDirectImport(importingOntology, importedOntology) {
    this.#requireOpen();
    const visibleStates = [this.#stagedState, this.#committedState];
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
  }

  beginLoadSession() {
    return new ManagedOntologyLoadSession(this.#state, (stagedChanges) => {
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
    });
  }
}
