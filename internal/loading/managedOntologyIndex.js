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
  }
};

const requireManagedOntology = (state, ontology) => {
  requireOntology(ontology);
  if (!state.ontologies.has(ontology)) {
    throw new OWLOntologyStateError(
      "The ontology is not managed by this ontology index",
      { ontology },
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

  getImportsClosure(ontology) {
    requireManagedOntology(this.#state, ontology);
    const closure = new Set();
    const pending = [ontology];
    while (pending.length > 0) {
      const current = pending.pop();
      if (closure.has(current)) {
        continue;
      }
      closure.add(current);
      const directImports = [
        ...(this.#state.directImportsByOntology.get(current) || []),
      ];
      for (let index = directImports.length - 1; index >= 0; index -= 1) {
        pending.push(directImports[index]);
      }
    }
    return closure;
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
