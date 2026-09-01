import { OWLObjectKind } from "../../model/kinds.js";
import {
  createOntologyID,
  IRI,
  isCanonicalStructuralObject,
  OWLStructuralObject,
  StructuralSet,
} from "../../model/structural.js";
import { OWLDocumentFormat } from "../../model/owlDocumentFormat.js";
import { rdfDataFactory } from "../rdfjs/environment.js";
import { StructuralAxiomSet } from "./axiomSemantics.js";

const ONTOLOGY_ANNOTATION_KINDS = Object.freeze([OWLObjectKind.ANNOTATION]);
const IMPORT_DECLARATION_KINDS = Object.freeze([
  OWLObjectKind.IMPORTS_DECLARATION,
]);
const ONTOLOGY_ID_KINDS = Object.freeze([OWLObjectKind.ONTOLOGY_ID]);
const RDF_GRAPH_TERM_TYPES = Object.freeze([
  "BlankNode",
  "DefaultGraph",
  "NamedNode",
]);
const STRUCTURED_DOCUMENT_METADATA_FIELDS = Object.freeze([
  "diagnostics",
  "jsonLdContexts",
  "prefixes",
]);
const immutableDocumentMetadataSnapshots = new WeakSet();
const DOCUMENT_FORMAT_BRAND_PROBE_KEY =
  "__owlapi_ontology_state_document_format_brand_probe__";

const isPackageOwnedStructuralObject = (value) => {
  if (!isCanonicalStructuralObject(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (
    prototype !== OWLStructuralObject.prototype &&
    prototype !== IRI.prototype
  ) {
    return false;
  }
  try {
    OWLStructuralObject.prototype.structuralKey.call(value);
    return true;
  } catch {
    return false;
  }
};

const isPackageOwnedDocumentFormat = (value) => {
  if (
    !Object.isFrozen(value) ||
    Object.getPrototypeOf(value) !== OWLDocumentFormat.prototype
  ) {
    return false;
  }
  try {
    OWLDocumentFormat.prototype.getParameter.call(
      value,
      DOCUMENT_FORMAT_BRAND_PROBE_KEY,
    );
    return true;
  } catch {
    return false;
  }
};

const isRetainableImmutableMetadataObject = (value) =>
  isPackageOwnedStructuralObject(value) || isPackageOwnedDocumentFormat(value);

const requireStructuralKind = (value, kinds, name) => {
  if (!isCanonicalStructuralObject(value) || !kinds.includes(value.kind)) {
    throw new TypeError(`${name} has an invalid OWL structural kind`);
  }
  return value;
};

const createStructuralSet = (values, kinds, name) => {
  if (!values || typeof values[Symbol.iterator] !== "function") {
    throw new TypeError(`${name} must be iterable`);
  }
  const structuralValues = new StructuralSet();
  for (const value of values) {
    structuralValues.add(requireStructuralKind(value, kinds, name));
  }
  return structuralValues;
};

const requireTransitivelyImmutableMetadataValue = (
  value,
  path,
  visited = new Set(),
) => {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function") {
      throw new TypeError(`${path} must be immutable data`);
    }
    return value;
  }
  if (visited.has(value)) {
    return value;
  }
  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null &&
    !isRetainableImmutableMetadataObject(value)
  ) {
    throw new TypeError(`${path} must be immutable data`);
  }
  if (!Object.isFrozen(value)) {
    throw new TypeError(`${path} must be transitively immutable`);
  }

  visited.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor)) {
      throw new TypeError(`${path} must not expose mutable accessors`);
    }
    requireTransitivelyImmutableMetadataValue(
      descriptor.value,
      `${path}.${String(key)}`,
      visited,
    );
  }
  return value;
};

const createImmutableStructuredDataSnapshot = (
  value,
  path,
  ancestors = new Set(),
) => {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function") {
      throw new TypeError(`${path} must contain only data values`);
    }
    return value;
  }
  if (ancestors.has(value)) {
    throw new TypeError(`${path} must not contain a reference cycle`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    return requireTransitivelyImmutableMetadataValue(value, path);
  }

  ancestors.add(value);
  let snapshot;
  if (Array.isArray(value)) {
    snapshot = Object.freeze(
      value.map((entry, index) =>
        createImmutableStructuredDataSnapshot(
          entry,
          `${path}[${index}]`,
          ancestors,
        ),
      ),
    );
  } else {
    snapshot = Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([field, entry]) => [
          field,
          createImmutableStructuredDataSnapshot(
            entry,
            `${path}.${field}`,
            ancestors,
          ),
        ]),
      ),
    );
  }
  ancestors.delete(value);
  return snapshot;
};

const createImmutableRdfGraphTermSnapshot = (selectedGraph) => {
  if (
    !selectedGraph ||
    typeof selectedGraph !== "object" ||
    !RDF_GRAPH_TERM_TYPES.includes(selectedGraph.termType) ||
    typeof selectedGraph.value !== "string" ||
    typeof selectedGraph.equals !== "function"
  ) {
    throw new TypeError(
      "documentMetadata.selectedGraph must be an RDF/JS graph term",
    );
  }

  // RDF/JS permits factories to choose their storage representation, so use
  // fromTerm() to normalize an interoperable copy before isolating and freezing
  // this package's retained snapshot.
  const normalizedGraphTerm = rdfDataFactory.fromTerm(selectedGraph);
  return Object.freeze(
    Object.create(
      Object.getPrototypeOf(normalizedGraphTerm),
      Object.getOwnPropertyDescriptors(normalizedGraphTerm),
    ),
  );
};

export const createImmutableDocumentMetadataSnapshot = (documentMetadata) => {
  if (documentMetadata === undefined) {
    return undefined;
  }
  if (
    !documentMetadata ||
    typeof documentMetadata !== "object" ||
    Array.isArray(documentMetadata)
  ) {
    throw new TypeError("documentMetadata must be an object");
  }
  if (immutableDocumentMetadataSnapshots.has(documentMetadata)) {
    return documentMetadata;
  }

  for (const name of ["diagnostics", "jsonLdContexts"]) {
    if (
      documentMetadata[name] !== undefined &&
      !Array.isArray(documentMetadata[name])
    ) {
      throw new TypeError(`documentMetadata.${name} must be an array`);
    }
  }
  if (
    documentMetadata.prefixes !== undefined &&
    (!documentMetadata.prefixes ||
      typeof documentMetadata.prefixes !== "object" ||
      Array.isArray(documentMetadata.prefixes))
  ) {
    throw new TypeError("documentMetadata.prefixes must be an object");
  }

  const snapshotEntries = Object.entries(documentMetadata).map(
    ([name, value]) => {
      if (STRUCTURED_DOCUMENT_METADATA_FIELDS.includes(name)) {
        return [
          name,
          createImmutableStructuredDataSnapshot(
            value,
            `documentMetadata.${name}`,
          ),
        ];
      }
      if (name === "selectedGraph") {
        return [name, createImmutableRdfGraphTermSnapshot(value)];
      }
      return [
        name,
        requireTransitivelyImmutableMetadataValue(
          value,
          `documentMetadata.${name}`,
        ),
      ];
    },
  );
  const snapshot = Object.freeze(Object.fromEntries(snapshotEntries));
  immutableDocumentMetadataSnapshots.add(snapshot);
  return snapshot;
};

const mutationDraftRecords = new WeakMap();

const refreshMutationDraftChangeStatus = (record) => {
  record.changesState =
    record.directAxioms.size !== record.baseDirectAxiomCount ||
    record.directOntologyAnnotations.size !==
      record.baseDirectOntologyAnnotationCount ||
    record.documentMetadata !== record.baseDocumentMetadata ||
    record.ontologyID.structuralKey() !== record.baseOntologyID.structuralKey();
};

class OntologyStateMutationDraft {
  constructor(record) {
    mutationDraftRecords.set(this, record);
    Object.freeze(this);
  }

  stageAxiomAddition(axiom) {
    const record = mutationDraftRecords.get(this);
    if (!record.open) {
      throw new Error("The ontology state mutation draft is closed");
    }
    const changed = record.directAxioms.add(axiom);
    if (changed) {
      refreshMutationDraftChangeStatus(record);
      record.preparedSnapshot = undefined;
    }
    return changed;
  }

  getStagedOntologyID() {
    const record = mutationDraftRecords.get(this);
    if (!record.open) {
      throw new Error("The ontology state mutation draft is closed");
    }
    return record.ontologyID;
  }

  stageOntologyIDReplacement(ontologyID) {
    const record = mutationDraftRecords.get(this);
    if (!record.open) {
      throw new Error("The ontology state mutation draft is closed");
    }
    const normalizedOntologyID = requireStructuralKind(
      ontologyID,
      ONTOLOGY_ID_KINDS,
      "ontologyID",
    );
    if (
      record.ontologyID.structuralKey() === normalizedOntologyID.structuralKey()
    ) {
      return false;
    }
    record.ontologyID = normalizedOntologyID;
    refreshMutationDraftChangeStatus(record);
    record.preparedSnapshot = undefined;
    return true;
  }

  stageOntologyAnnotationAddition(annotation) {
    const record = mutationDraftRecords.get(this);
    if (!record.open) {
      throw new Error("The ontology state mutation draft is closed");
    }
    const normalizedAnnotation = requireStructuralKind(
      annotation,
      ONTOLOGY_ANNOTATION_KINDS,
      "annotation",
    );
    if (record.directOntologyAnnotations.has(normalizedAnnotation)) {
      return false;
    }
    record.directOntologyAnnotations.add(normalizedAnnotation);
    refreshMutationDraftChangeStatus(record);
    record.preparedSnapshot = undefined;
    return true;
  }

  stageDocumentMetadataReplacement(documentMetadata) {
    const record = mutationDraftRecords.get(this);
    if (!record.open) {
      throw new Error("The ontology state mutation draft is closed");
    }
    const normalizedMetadata =
      createImmutableDocumentMetadataSnapshot(documentMetadata);
    if (record.documentMetadata === normalizedMetadata) {
      return false;
    }
    record.documentMetadata = normalizedMetadata;
    refreshMutationDraftChangeStatus(record);
    record.preparedSnapshot = undefined;
    return true;
  }
}

export class OntologyState {
  #authoredImportDeclarations;
  #directAxioms;
  #directOntologyAnnotations;
  #documentMetadata;
  #mutationAuthorityIdentity = Object.freeze({});
  #ontologyID;
  #revision = 0;
  #snapshot;

  constructor({
    authoredImportDeclarations = [],
    directAxioms = [],
    directOntologyAnnotations = [],
    documentMetadata,
    ontologyID,
  } = {}) {
    this.#authoredImportDeclarations = createStructuralSet(
      authoredImportDeclarations,
      IMPORT_DECLARATION_KINDS,
      "authoredImportDeclarations",
    );
    this.#directAxioms = new StructuralAxiomSet(directAxioms);
    this.#directOntologyAnnotations = createStructuralSet(
      directOntologyAnnotations,
      ONTOLOGY_ANNOTATION_KINDS,
      "directOntologyAnnotations",
    );
    this.#documentMetadata =
      createImmutableDocumentMetadataSnapshot(documentMetadata);
    this.#ontologyID =
      ontologyID === undefined
        ? createOntologyID(undefined, undefined)
        : requireStructuralKind(ontologyID, ONTOLOGY_ID_KINDS, "ontologyID");
    this.#snapshot = this.#createCurrentSnapshot();
  }

  createSnapshot() {
    return this.#snapshot;
  }

  createMutationDraft() {
    return new OntologyStateMutationDraft({
      authoredImportDeclarations: new StructuralSet(
        this.#authoredImportDeclarations,
      ),
      authorityIdentity: this.#mutationAuthorityIdentity,
      baseDirectAxiomCount: this.#directAxioms.size,
      baseDirectOntologyAnnotationCount: this.#directOntologyAnnotations.size,
      baseDocumentMetadata: this.#documentMetadata,
      baseOntologyID: this.#ontologyID,
      baseRevision: this.#revision,
      changesState: false,
      directAxioms: this.#directAxioms.clone(),
      directOntologyAnnotations: new StructuralSet(
        this.#directOntologyAnnotations,
      ),
      documentMetadata: this.#documentMetadata,
      ontologyID: this.#ontologyID,
      open: true,
      preparedSnapshot: undefined,
    });
  }

  preflightMutation(mutationDraft) {
    const record = this.#requireCurrentDraft(mutationDraft);
    const preparedSnapshot = record.changesState
      ? this.#createMutationSnapshot(record)
      : this.#snapshot;
    this.#requireCurrentDraft(mutationDraft);
    record.preparedSnapshot = preparedSnapshot;
    return Object.freeze({
      baseRevision: record.baseRevision,
      changesState: record.changesState,
    });
  }

  assertPreparedMutationIsCurrent(mutationDraft) {
    const record = this.#requireCurrentDraft(mutationDraft);
    if (record.preparedSnapshot === undefined) {
      throw new Error(
        "The ontology state mutation draft must be preflighted before publication",
      );
    }
  }

  commitMutation(mutationDraft) {
    const record = this.#requireCurrentDraft(mutationDraft);
    record.open = false;
    if (!record.changesState) {
      return false;
    }

    const preparedSnapshot =
      record.preparedSnapshot ?? this.#createMutationSnapshot(record);

    this.#authoredImportDeclarations = record.authoredImportDeclarations;
    this.#directAxioms = record.directAxioms;
    this.#directOntologyAnnotations = record.directOntologyAnnotations;
    this.#documentMetadata = record.documentMetadata;
    this.#ontologyID = record.ontologyID;
    this.#revision += 1;
    this.#snapshot = preparedSnapshot;
    return true;
  }

  discardMutation(mutationDraft) {
    const record = this.#requireOwnedDraft(mutationDraft);
    if (!record.open) {
      throw new Error("The ontology state mutation draft is closed");
    }
    record.open = false;
  }

  #requireOwnedDraft(mutationDraft) {
    const record = mutationDraftRecords.get(mutationDraft);
    if (
      !record ||
      record.authorityIdentity !== this.#mutationAuthorityIdentity
    ) {
      throw new TypeError(
        "The mutation draft does not belong to this ontology state",
      );
    }
    return record;
  }

  #requireCurrentDraft(mutationDraft) {
    const record = this.#requireOwnedDraft(mutationDraft);
    if (!record.open) {
      throw new Error("The ontology state mutation draft is closed");
    }
    if (record.baseRevision !== this.#revision) {
      throw new Error(
        `The ontology state mutation draft revision ${record.baseRevision} does not match current revision ${this.#revision}`,
      );
    }
    return record;
  }

  #createCurrentSnapshot() {
    return Object.freeze({
      authoredImportDeclarations: Object.freeze([
        ...this.#authoredImportDeclarations,
      ]),
      directAxioms: this.#directAxioms.toFrozenArray(),
      directOntologyAnnotations: Object.freeze([
        ...this.#directOntologyAnnotations,
      ]),
      documentMetadata: this.#documentMetadata,
      ontologyID: this.#ontologyID,
      revision: this.#revision,
    });
  }

  #createMutationSnapshot(record) {
    return Object.freeze({
      authoredImportDeclarations: Object.freeze([
        ...record.authoredImportDeclarations,
      ]),
      directAxioms: record.directAxioms.toFrozenArray(),
      directOntologyAnnotations: Object.freeze([
        ...record.directOntologyAnnotations,
      ]),
      documentMetadata: record.documentMetadata,
      ontologyID: record.ontologyID,
      revision: record.baseRevision + 1,
    });
  }
}
