import { RDFXMLDocumentFormat } from "../formats/rdfXMLDocumentFormat.js";
import { assertDocumentLoaderAuthorization } from "../internal/loading/documentLoaderAuthorization.js";
import { copyDocumentFormatState } from "./owlDocumentFormat.js";
import {
  MissingImportError,
  ParserMismatchError,
  ResourceLimitError,
  SecurityPolicyError,
  UnloadableImportError,
  UnparsableOntologyException,
  OWLOntologyStateError,
  OWLParserError,
  UnsupportedConstructError,
} from "../io/errors.js";
import { StringDocumentSource } from "../io/stringDocumentSource.js";
import { ManagedOntologyIndex } from "../internal/loading/managedOntologyIndex.js";
import { materializeAxiomIterable } from "../internal/model/axiomSemantics.js";
import { readOntologyChange } from "../internal/model/ontologyChangeRecord.js";
import { RemoveAxiom } from "./removeAxiom.js";
import { AddAxiom } from "./addAxiom.js";
import { ChangeApplied } from "./parameters/index.js";
import { createImmutableDocumentMetadataSnapshot } from "../internal/model/ontologyState.js";
import {
  createSourceStructure,
  publishSourceEvidence,
  readSourceEvidence,
} from "../internal/model/sourceEvidence.js";
import { dlSyntaxParserDescriptor } from "../internal/parsing/dl/descriptor.js";
import { functionalSyntaxParserDescriptor } from "../internal/parsing/functional/descriptor.js";
import { jsonLdParserDescriptor } from "../internal/parsing/jsonld/descriptor.js";
import { krss1ParserDescriptor } from "../internal/parsing/krss1/descriptor.js";
import { krss2ParserDescriptor } from "../internal/parsing/krss2/descriptor.js";
import { manchesterSyntaxParserDescriptor } from "../internal/parsing/manchester/descriptor.js";
import { nQuadsParserDescriptor } from "../internal/parsing/nquads/descriptor.js";
import { nTriplesParserDescriptor } from "../internal/parsing/ntriples/descriptor.js";
import { owlXmlParserDescriptor } from "../internal/parsing/owlxml/descriptor.js";
import { OWLParserRegistry } from "../internal/parsing/parserRegistry.js";
import { prepareRdfDocument } from "../internal/parsing/rdf/rdfDocumentPreparation.js";
import { rdfXmlParserDescriptor } from "../internal/parsing/rdfxml/descriptor.js";
import { triGParserDescriptor } from "../internal/parsing/trig/descriptor.js";
import { turtleParserDescriptor } from "../internal/parsing/turtle/descriptor.js";
import { createDefaultStorerRegistry } from "../internal/storage/storerRegistry.js";
import {
  OWLDataFactory,
  readDataFactoryBehaviorDefinition,
  createSourcePreservingDataFactory,
} from "./owlDataFactory.js";
import { OWLObjectKind } from "./kinds.js";
import { readAddOntologyAnnotationChange } from "./addOntologyAnnotation.js";
import {
  bindManagedOntology,
  createManagerOwnedOWLOntology,
  readOntologySnapshot,
  readOntologyOwner,
} from "./owlOntology.js";
import { OWLOntologyLoaderConfiguration } from "./owlOntologyLoaderConfiguration.js";
import {
  OWLOntologyWriterConfiguration,
  readOntologyWriterConfiguration,
} from "./owlOntologyWriterConfiguration.js";
import { readSetOntologyIDChange } from "./setOntologyID.js";
import { IRI, StructuralSet } from "./structural.js";
import { OntologyBehaviorContext } from "../internal/behavior/ontologyBehaviorContext.js";

const DIAGNOSTIC_SEVERITIES = new Set(["info", "warning"]);
const SOURCE_LOCATION_FIELDS = ["line", "column", "offset"];
const ANNOTATION_AXIOM_KINDS = new Set([
  OWLObjectKind.ANNOTATION_ASSERTION_AXIOM,
  OWLObjectKind.SUB_ANNOTATION_PROPERTY_AXIOM,
  OWLObjectKind.ANNOTATION_PROPERTY_DOMAIN_AXIOM,
  OWLObjectKind.ANNOTATION_PROPERTY_RANGE_AXIOM,
]);
const REVERSE_CHANGE_KINDS = Object.freeze({
  ADD_AXIOM: "REMOVE_AXIOM",
  REMOVE_AXIOM: "ADD_AXIOM",
  ADD_IMPORT: "REMOVE_IMPORT",
  REMOVE_IMPORT: "ADD_IMPORT",
  ADD_ONTOLOGY_ANNOTATION: "REMOVE_ONTOLOGY_ANNOTATION",
  REMOVE_ONTOLOGY_ANNOTATION: "ADD_ONTOLOGY_ANNOTATION",
});

const reverseChangeDescriptor = (descriptor) =>
  descriptor.kind === "SET_ONTOLOGY_ID"
    ? {
        ...descriptor,
        originalOntologyID: descriptor.newOntologyID,
        newOntologyID: descriptor.originalOntologyID,
      }
    : {
        ...descriptor,
        kind: REVERSE_CHANGE_KINDS[descriptor.kind],
        value: descriptor.value ?? descriptor.annotation,
        annotation: descriptor.annotation ?? descriptor.value,
      };
const builtinDescriptors = new Set([
  owlXmlParserDescriptor,
  jsonLdParserDescriptor,
  rdfXmlParserDescriptor,
  nQuadsParserDescriptor,
  nTriplesParserDescriptor,
  triGParserDescriptor,
  turtleParserDescriptor,
  dlSyntaxParserDescriptor,
  krss1ParserDescriptor,
  krss2ParserDescriptor,
  functionalSyntaxParserDescriptor,
  manchesterSyntaxParserDescriptor,
]);

const createUnsupportedOntologyChangeError = (change, index, operation) => {
  const error = new TypeError(
    `changes[${index}] must be a supported ontology change`,
  );
  error.change = change;
  error.index = index;
  error.operation = operation;
  return error;
};

const materializeOntologyChanges = (changes, operation) => {
  if (!changes || typeof changes[Symbol.iterator] !== "function") {
    const error = new TypeError("changes must be iterable");
    error.operation = operation;
    throw error;
  }

  const materializedChanges = [];
  let index = 0;
  for (const change of changes) {
    const structuralChange = readOntologyChange(change);
    if (structuralChange) {
      materializedChanges.push(
        Object.freeze({ change, index, ...structuralChange }),
      );
      index += 1;
      continue;
    }
    const setOntologyID = readSetOntologyIDChange(change);
    if (setOntologyID) {
      materializedChanges.push(
        Object.freeze({
          change,
          index,
          kind: "SET_ONTOLOGY_ID",
          ...setOntologyID,
        }),
      );
      index += 1;
      continue;
    }
    const addOntologyAnnotation = readAddOntologyAnnotationChange(change);
    if (addOntologyAnnotation) {
      materializedChanges.push(
        Object.freeze({
          change,
          index,
          kind: "ADD_ONTOLOGY_ANNOTATION",
          ...addOntologyAnnotation,
        }),
      );
      index += 1;
      continue;
    }
    throw createUnsupportedOntologyChangeError(change, index, operation);
  }
  return Object.freeze(materializedChanges);
};

const freezeDiagnostic = (diagnostic) => {
  if (
    !diagnostic ||
    typeof diagnostic !== "object" ||
    Array.isArray(diagnostic)
  ) {
    throw new TypeError("diagnostic must be a structured object");
  }
  if (!DIAGNOSTIC_SEVERITIES.has(diagnostic.severity)) {
    throw new TypeError("diagnostic severity must be info or warning");
  }
  for (const name of ["code", "message"]) {
    if (typeof diagnostic[name] !== "string" || diagnostic[name].length === 0) {
      throw new TypeError(`diagnostic ${name} must be a non-empty string`);
    }
  }
  for (const name of SOURCE_LOCATION_FIELDS) {
    const minimum = name === "offset" ? 0 : 1;
    if (
      diagnostic[name] !== undefined &&
      (!Number.isSafeInteger(diagnostic[name]) || diagnostic[name] < minimum)
    ) {
      const range = minimum === 0 ? "non-negative" : "positive";
      throw new TypeError(`diagnostic ${name} must be a ${range} integer`);
    }
  }
  return Object.freeze({ ...diagnostic });
};

const requireDocumentFormat = (documentFormat) => {
  if (
    !documentFormat ||
    typeof documentFormat.key !== "string" ||
    documentFormat.key.length === 0 ||
    !Object.isFrozen(documentFormat) ||
    !Array.isArray(documentFormat.mediaTypes) ||
    !Object.isFrozen(documentFormat.mediaTypes) ||
    !Array.isArray(documentFormat.extensions) ||
    !Object.isFrozen(documentFormat.extensions)
  ) {
    throw new TypeError("documentFormat metadata must be immutable");
  }
  return documentFormat;
};

class ParseTransaction {
  #annotations = new StructuralSet();
  #axioms = new StructuralSet();
  #configuration;
  #dataFactory;
  #diagnostics = [];
  #documentFormat;
  #imports = new StructuralSet();
  #jsonLdContexts;
  #rdfDatasetContext;
  #sourceStructure;
  #ontologyID;
  #prefixes;
  #publication;

  constructor(dataFactory, configuration, publication) {
    this.#dataFactory =
      configuration.parsingMode === "preserve"
        ? createSourcePreservingDataFactory(dataFactory)
        : dataFactory;
    this.#configuration = configuration;
    this.#publication = publication;
  }

  getOWLDataFactory() {
    return this.#dataFactory;
  }

  addAxiom(axiom) {
    if (this.#axioms.has(axiom)) {
      return;
    }
    if (this.#axioms.size >= this.#configuration.maxAxioms) {
      throw new ResourceLimitError("The ontology axiom limit was exceeded", {
        limit: this.#configuration.maxAxioms,
        resource: "maxAxioms",
      });
    }
    this.#axioms.add(axiom);
    this.#publication?.addAxiom(axiom);
  }

  addAxioms(axioms) {
    for (const axiom of axioms) {
      this.addAxiom(axiom);
    }
  }

  addAnnotation(annotation) {
    this.#annotations.add(annotation);
    this.#publication?.addAnnotation(annotation);
  }

  addAnnotations(annotations) {
    for (const annotation of annotations) {
      this.addAnnotation(annotation);
    }
  }

  addImportsDeclaration(declaration) {
    if (this.#imports.has(declaration)) return;
    this.#imports.add(declaration);
    return this.#publication?.addImport(declaration);
  }

  async addImportsDeclarations(declarations) {
    for (const declaration of declarations) {
      await this.addImportsDeclaration(declaration);
    }
  }

  addDiagnostic(diagnostic) {
    this.#diagnostics.push(freezeDiagnostic(diagnostic));
  }

  setOntologyID(ontologyID) {
    this.#ontologyID = ontologyID;
    this.#publication?.setOntologyID(ontologyID);
  }

  setDocumentFormat(documentFormat) {
    this.#documentFormat = requireDocumentFormat(documentFormat);
  }

  getDocumentFormat() {
    return this.#documentFormat;
  }

  setPrefixes(prefixes) {
    if (
      !prefixes ||
      typeof prefixes !== "object" ||
      Array.isArray(prefixes) ||
      Object.entries(prefixes).some(
        ([prefix, iri]) =>
          typeof prefix !== "string" || typeof iri !== "string",
      )
    ) {
      throw new TypeError("prefixes must be a string-to-string object");
    }
    this.#prefixes = Object.freeze({ ...prefixes });
  }

  setJsonLdContexts(contexts) {
    if (!Array.isArray(contexts)) {
      throw new TypeError("jsonLdContexts must be an array");
    }
    this.#jsonLdContexts = Object.freeze([...contexts]);
  }

  setRdfDatasetContext({ merged, selectedGraph }) {
    if (typeof merged !== "boolean") {
      throw new TypeError("RDF dataset context merged must be a boolean");
    }
    if (
      !selectedGraph ||
      !["BlankNode", "DefaultGraph", "NamedNode"].includes(
        selectedGraph.termType,
      )
    ) {
      throw new TypeError(
        "RDF dataset context selectedGraph must be an RDF/JS graph term",
      );
    }
    // Graph selection is document-loading metadata, not OWL semantics. Keep it
    // on the parse transaction so it survives manager publication without
    // contaminating axioms or ontology identity.
    this.#rdfDatasetContext = Object.freeze({ merged, selectedGraph });
  }

  setSourceStructure(structure) {
    this.#sourceStructure = structure;
  }

  commit(defaultFormat, documentIRI) {
    const ontologyID = this.#ontologyID || this.#dataFactory.getOWLOntologyID();
    const managedOntology =
      this.#publication?.managedOntology ??
      createManagerOwnedOWLOntology({
        annotations: this.#annotations,
        axioms: this.#axioms,
        imports: this.#imports,
        ontologyID,
      });
    return {
      context: {
        diagnostics: [...this.#diagnostics],
        documentIRI,
        format: this.#documentFormat || defaultFormat,
        ...(this.#sourceStructure === undefined
          ? {}
          : { sourceStructure: this.#sourceStructure }),
        ...(this.#prefixes === undefined ? {} : { prefixes: this.#prefixes }),
        ...(this.#jsonLdContexts === undefined
          ? {}
          : { jsonLdContexts: this.#jsonLdContexts }),
        ...(this.#rdfDatasetContext === undefined
          ? {}
          : this.#rdfDatasetContext),
      },
      ...managedOntology,
    };
  }
}

const normalizeConfiguration = (configuration, behaviorProfileId) => {
  if (configuration instanceof OWLOntologyLoaderConfiguration) {
    if (
      OWLOntologyLoaderConfiguration.prototype.getBehaviorProfileId.call(
        configuration,
      ) !== behaviorProfileId
    )
      throw new TypeError(
        "Loader configuration and manager behavior profiles must match",
      );
    // All consumers receive the admitted private identity and native settings,
    // even when a caller subclasses the configuration's public query methods.
    return OWLOntologyLoaderConfiguration.prototype.with.call(
      configuration,
      {},
    );
  }
  const normalized = new OWLOntologyLoaderConfiguration({
    behaviorProfileId,
    ...configuration,
  });
  return normalizeConfiguration(normalized, behaviorProfileId);
};

const normalizeSource = (source, documentIRI) => {
  if (typeof source === "string") {
    return new StringDocumentSource(source, { documentIRI });
  }
  for (const method of [
    "getContentType",
    "getDocumentIRI",
    "getFileName",
    "getText",
  ]) {
    if (typeof source?.[method] !== "function") {
      throw new TypeError(
        "source must implement the ontology document source contract",
      );
    }
  }
  return new StringDocumentSource(source.getText(), {
    contentType: source.getContentType(),
    documentIRI: source.getDocumentIRI() ?? documentIRI,
    fileName: source.getFileName(),
    format: source.getFormat?.(),
  });
};

const sourceWithDocumentIRI = (source, documentIRI) =>
  normalizeSource(source, documentIRI);

const isHttpIRI = (iri) => {
  try {
    const protocol = new URL(iri.value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

export class OWLOntologyManager {
  #behaviorContext;
  #dataFactory;
  #documentLoader;
  #iriMappers;
  #managedOntologyIndex = new ManagedOntologyIndex();
  #managedOntologyStates = new WeakMap();
  #registry;
  #storerRegistry = createDefaultStorerRegistry();
  #writerConfiguration;
  #loaderConfiguration;
  #loaderConfigurationsByOntologyID = new Map();
  #requestedImportIRIs = new Set();
  #importedOntologyIDsByImportIRI = new Map();
  #javaClosureCache = new WeakMap();
  #externalDocumentIRIsByOntology = new WeakMap();
  #rdfXmlFormats = new WeakMap();

  constructor({
    behaviorProfileId,
    dataFactory,
    documentLoader,
    iriMappers = [],
    registry,
  } = {}) {
    this.#behaviorContext = new OntologyBehaviorContext(behaviorProfileId);
    this.#writerConfiguration = new OWLOntologyWriterConfiguration({
      behaviorProfileId,
    });
    this.#loaderConfiguration = new OWLOntologyLoaderConfiguration({
      behaviorProfileId,
    });
    if (!iriMappers || typeof iriMappers[Symbol.iterator] !== "function") {
      throw new TypeError("iriMappers must be iterable");
    }
    const normalizedDataFactory =
      dataFactory || new OWLDataFactory({ behaviorProfileId });
    if (typeof normalizedDataFactory.getOWLOntologyID !== "function") {
      throw new TypeError("dataFactory must implement getOWLOntologyID()");
    }
    const factoryDefinition = readDataFactoryBehaviorDefinition(
      normalizedDataFactory,
    );
    if (
      factoryDefinition
        ? factoryDefinition !== this.#behaviorContext.behaviorProfileDefinition
        : this.#behaviorContext.behaviorProfileDefinition.behaviorProfileId !==
          "normative-v1"
    ) {
      throw new TypeError(
        "Manager and data factory behavior profiles must match",
      );
    }
    if (
      documentLoader !== undefined &&
      typeof documentLoader?.load !== "function"
    ) {
      throw new TypeError("documentLoader must implement load()");
    }
    const normalizedIriMappers = [...iriMappers];
    for (const mapper of normalizedIriMappers) {
      if (!mapper || typeof mapper.getDocumentIRI !== "function") {
        throw new TypeError("Each IRI mapper must implement getDocumentIRI()");
      }
    }
    const normalizedRegistry =
      registry ||
      new OWLParserRegistry([
        owlXmlParserDescriptor,
        jsonLdParserDescriptor,
        rdfXmlParserDescriptor,
        nQuadsParserDescriptor,
        nTriplesParserDescriptor,
        triGParserDescriptor,
        turtleParserDescriptor,
        dlSyntaxParserDescriptor,
        // The narrower original-KRSS dialect precedes KRSS2 for a generic
        // `.krss` ambiguity; content evidence and exact hints still outrank it.
        krss1ParserDescriptor,
        krss2ParserDescriptor,
        functionalSyntaxParserDescriptor,
        manchesterSyntaxParserDescriptor,
      ]);
    if (typeof normalizedRegistry.resolveCandidates !== "function") {
      throw new TypeError("registry must implement resolveCandidates()");
    }
    this.#dataFactory = normalizedDataFactory;
    this.#documentLoader = documentLoader;
    this.#iriMappers = Object.freeze(normalizedIriMappers);
    this.#registry = normalizedRegistry;
  }

  getOWLDataFactory() {
    return this.#dataFactory;
  }

  getBehaviorProfileId() {
    return this.#behaviorContext.behaviorProfileDefinition.behaviorProfileId;
  }

  getOntologyWriterConfiguration() {
    return this.#writerConfiguration;
  }

  getOntologyLoaderConfiguration() {
    return this.#loaderConfiguration;
  }

  setOntologyLoaderConfiguration(configuration) {
    OWLOntologyLoaderConfiguration.prototype.getConnectionTimeout.call(
      configuration,
    );
    if (
      OWLOntologyLoaderConfiguration.prototype.getBehaviorProfileId.call(
        configuration,
      ) !== this.#behaviorContext.behaviorProfileDefinition.behaviorProfileId
    )
      throw new TypeError(
        "Loader configuration and manager behavior profiles must match",
      );
    this.#loaderConfiguration = configuration;
  }

  setOntologyWriterConfiguration(configuration) {
    readOntologyWriterConfiguration(configuration);
    if (
      OWLOntologyWriterConfiguration.prototype.getBehaviorProfileId.call(
        configuration,
      ) !== this.#behaviorContext.behaviorProfileDefinition.behaviorProfileId
    )
      throw new TypeError(
        "Writer configuration and manager behavior profiles must match",
      );
    this.#writerConfiguration = configuration;
  }

  createOntology(ontologyID = this.#dataFactory.getOWLOntologyID()) {
    const { ontology, ontologyState } = createManagerOwnedOWLOntology({
      ontologyID,
    });
    const registration = this.#managedOntologyIndex.beginLoadSession();
    try {
      const defaultDocumentIRI =
        ontologyID.versionIRI ?? ontologyID.ontologyIRI;
      registration.stageOntology(ontology, {
        documentIRI:
          this.#behaviorContext.behaviorProfileDefinition.ontologyIdentityPolicy
            .registerDefaultDocumentIRI && defaultDocumentIRI
            ? this.#mapDocumentIRI(defaultDocumentIRI)
            : undefined,
      });
      const participants = this.#managedOntologyIndex
        .ontologies()
        .map((member) => [member, readOntologySnapshot(member)]);
      for (const [member, snapshot] of participants)
        for (const declaration of snapshot.authoredImportDeclarations) {
          if (
            this.#managedOntologyIndex.hasResolvedImport(
              member,
              declaration.iri,
            )
          )
            continue;
          const imported =
            registration.getOntologyByIRI(
              declaration.iri,
              this.#behaviorContext.behaviorProfileDefinition
                .ontologyIdentityPolicy,
            ) ??
            registration.getOntologyByDocumentIRI(
              this.#mapDocumentIRI(declaration.iri),
            );
          if (imported)
            registration.stageDirectImport(member, imported, declaration.iri);
        }
      registration.assertCurrentRevision();
      if (
        participants.some(
          ([member, snapshot]) =>
            readOntologySnapshot(member).revision !== snapshot.revision,
        )
      )
        throw new OWLOntologyStateError(
          "Ontology registration encountered a stale import participant",
        );
      registration.commit();
    } catch (error) {
      registration.discard();
      throw error;
    }
    this.#managedOntologyStates.set(ontology, ontologyState);
    bindManagedOntology(
      ontology,
      () => this.#readImportsClosure(ontology, "readLoadedImportsClosure"),
      (member, iri) =>
        this.#managedOntologyIndex.hasResolvedImport(member, iri),
      this,
      this.#behaviorContext.behaviorProfileDefinition,
    );
    return ontology;
  }

  getOntology(ontologyID) {
    const exact = this.#managedOntologyIndex.getOntologyByID(ontologyID);
    if (
      exact ||
      !this.#behaviorContext.behaviorProfileDefinition.ontologyIdentityPolicy
        .allowNamedIDFallback
    )
      return exact;
    if (ontologyID.ontologyIRI) {
      const version = this.#managedOntologyIndex.getFirstOntologyByOntologyIRI(
        ontologyID.ontologyIRI,
      );
      if (version) return version;
      const documentIRI = this.#mapDocumentIRI(
        ontologyID.versionIRI ?? ontologyID.ontologyIRI,
      );
      if (this.#managedOntologyIndex.getOntologyByDocumentIRI(documentIRI))
        throw new OWLOntologyStateError(
          "An ontology document with this IRI is already registered",
          { documentIRI, ontologyID, operation: "getOntology" },
        );
    }
    return undefined;
  }

  /** Java-compatible access to this manager's loaded format; authored ontologies have none. */
  getOntologyFormat(ontology) {
    if (
      this.#behaviorContext.behaviorProfileDefinition.ontologyChangePolicy
        .permitsSameProfileForeignTargets &&
      readOntologyOwner(ontology) !== this
    ) {
      this.#requireManagedOntologyState(ontology, "getOntologyFormat");
      const registered = this.#managedOntologyIndex.getOntologyByID(
        ontology.getOntologyID(),
      );
      return registered ? this.getOntologyFormat(registered) : undefined;
    }
    const metadata = this.#requireManagedOntologyState(
      ontology,
      "getOntologyFormat",
    ).createSnapshot().documentMetadata;
    const format = metadata?.format;
    if (format?.key !== "rdfxml") return format;
    if (!this.#rdfXmlFormats.has(format)) {
      const outputFormat = copyDocumentFormatState(
        format,
        new RDFXMLDocumentFormat(),
      );
      outputFormat.copyPrefixesFrom(
        new Map(
          Object.entries(metadata.prefixes ?? {}).filter(
            ([name, namespace]) => name !== ":" || namespace !== "",
          ),
        ),
      );
      this.#rdfXmlFormats.set(format, outputFormat);
    }
    return this.#rdfXmlFormats.get(format);
  }

  addAxiom(ontology, axiom) {
    return this.#addAxiomIterable(ontology, [axiom], "addAxiom");
  }

  addAxioms(ontology, axioms) {
    return this.#addAxiomIterable(ontology, axioms, "addAxioms");
  }

  /** Remove an exact annotated axiom using the selected profile's change result. */
  removeAxiom(ontology, axiom) {
    return this.#applyChangeIterable(
      [new RemoveAxiom(ontology, axiom)],
      "removeAxiom",
    );
  }

  /** Materialize and validate all removals before publishing any participant. */
  removeAxioms(ontology, axioms) {
    const materialized = materializeAxiomIterable(axioms, {
      operation: "removeAxioms",
    });
    this.#requireManagedOntologyState(ontology, "removeAxioms");
    return this.#applyChangeIterable(
      materialized.map((axiom) => new RemoveAxiom(ontology, axiom)),
      "removeAxioms",
    );
  }

  /** Apply one nominal change through the selected profile's batch boundary. */
  applyChange(change) {
    return this.#applyChangeIterable([change], "applyChange");
  }

  /** Materialize the iterable, then apply its nominal changes.
   * Normative changes publish atomically and return whether final state differs.
   * Java changes publish sequentially and return ChangeApplied; an exception
   * retains earlier changes. Import edits resolve loaded documents without I/O.
   */
  applyChanges(changes) {
    return this.#applyChangeIterable(changes, "applyChanges");
  }

  /**
   * Save this manager's ontology through the explicit format/target overload.
   * Capture one committed revision before asynchronous work; rendering cannot
   * observe a mixture of revisions or modify the target before completion.
   * @returns {Promise<void>}
   */
  async saveOntology(ontology, format, target) {
    const state = this.#requireManagedOntologyState(ontology, "saveOntology");
    // Java renderers obtain preferences from the ontology's owning manager,
    // including when a second manager invokes the save operation.
    const owner = readOntologyOwner(ontology);
    const writerContext = readOntologyWriterConfiguration(
      owner.#writerConfiguration,
    );
    await this.#storerRegistry.store(
      state.createSnapshot(),
      format,
      target,
      writerContext,
      this.#behaviorContext.behaviorProfileDefinition,
    );
  }

  importsClosure(ontology) {
    return this.#readImportsClosure(ontology, "importsClosure");
  }

  #readImportsClosure(ontology, operation) {
    if (
      this.#behaviorContext.behaviorProfileDefinition.ontologyLoadingPolicy
        .importResolution === "retained-id"
    ) {
      const indexRevision = this.#managedOntologyIndex.revision;
      const importedCount = this.#importedOntologyIDsByImportIRI.size;
      const cached = this.#javaClosureCache.get(ontology);
      if (
        cached &&
        cached.indexRevision === indexRevision &&
        cached.importedCount === importedCount &&
        cached.closure.every(
          (member, i) => readOntologySnapshot(member) === cached.snapshots[i],
        )
      ) {
        return cached.closure;
      }
      const result = new Set();
      const pending = [ontology];
      while (pending.length) {
        const member = pending.pop();
        if (result.has(member)) continue;
        if (!this.#managedOntologyIndex.getOntologyByID(member.getOntologyID()))
          throw new OWLOntologyStateError(
            "The ontology is not registered in this manager",
            { ontology: member, operation },
          );
        result.add(member);
        for (const declaration of readOntologySnapshot(member)
          .authoredImportDeclarations) {
          const imported = this.#resolveJavaImport(declaration.iri);
          if (imported) pending.push(imported);
        }
      }
      const closure = Object.freeze([...result]);
      this.#javaClosureCache.set(ontology, {
        closure,
        importedCount,
        indexRevision,
        snapshots: closure.map(readOntologySnapshot),
      });
      return closure;
    }
    return this.#managedOntologyIndex.createImportsClosureSnapshot(ontology, {
      operation,
    });
  }

  getImportsClosure(ontology) {
    return new Set(this.#readImportsClosure(ontology, "getImportsClosure"));
  }

  #resolveJavaImport(importIRI) {
    const retainedID = this.#importedOntologyIDsByImportIRI.get(
      importIRI.value,
    );
    return retainedID
      ? this.getOntology(retainedID)
      : (this.#managedOntologyIndex.getOntologyByIRI(
          importIRI,
          this.#behaviorContext.behaviorProfileDefinition
            .ontologyIdentityPolicy,
        ) ?? this.#managedOntologyIndex.getOntologyByDocumentIRI(importIRI));
  }

  async loadOntologyFromOntologyDocument(source, configuration) {
    const result = await this.loadOntologyGraphFromOntologyDocument(
      source,
      configuration,
    );
    return result.ontology;
  }

  async loadOntologyGraphFromOntologyDocument(source, configuration) {
    const normalizedConfiguration = normalizeConfiguration(
      configuration ?? this.#loaderConfiguration,
      this.#behaviorContext.behaviorProfileDefinition.behaviorProfileId,
    );
    this.#throwIfAborted(normalizedConfiguration);
    const normalizedSource = normalizeSource(source);

    if (
      this.#behaviorContext.behaviorProfileDefinition.ontologyLoadingPolicy
        .publication === "document"
    ) {
      const session = { entries: [], importCount: 0 };
      const ontology = await this.#loadDocument(
        normalizedSource,
        normalizedConfiguration,
        session,
        0,
      );
      return Object.freeze({
        ontology,
        importsClosure: this.importsClosure(ontology),
        documents: Object.freeze(
          session.entries.map(({ context, ontology: member }) =>
            Object.freeze({ context, ontology: member }),
          ),
        ),
      });
    }

    const managedOntologyLoadSession =
      this.#managedOntologyIndex.beginLoadSession();
    const session = {
      entries: [],
      entriesByOntology: new Map(),
      importCount: 0,
      managedOntologyIndexSession: managedOntologyLoadSession,
    };
    let documentPublications;
    let root;
    try {
      root = await this.#loadDocument(
        normalizedSource,
        normalizedConfiguration,
        session,
        0,
      );
      // OWL 2 canonical parsing CP 3 runs only after CP 2 has discovered the
      // complete import graph. Keep all provisional objects session-private.
      const reconstructionInputs = new Map();
      const sourceRolesByOntology = new Map();
      const roleDependents = new Map();
      for (const entry of session.entries) {
        if (!entry.prepared) {
          if (normalizedConfiguration.parsingMode === "preserve")
            sourceRolesByOntology.set(
              entry.ontology,
              createSourceStructure(
                entry.ontology,
                entry.context.sourceStructure,
              ).roles,
            );
          continue;
        }
        const declarations = new StructuralSet();
        const importedMembers = [];
        // Start from authored declarations, not provisional use roles that
        // were discovered before imported OWL declarations were available.
        sourceRolesByOntology.set(
          entry.ontology,
          (entry.prepared.sourceRoles ?? []).filter(
            ({ origin }) => origin === "declaration",
          ),
        );
        for (const member of managedOntologyLoadSession.getImportsClosure(
          entry.ontology,
        )) {
          // The translator reads this document's own declarations itself.
          // Seeding those first would suppress local legacy normalization.
          if (member === entry.ontology) continue;
          importedMembers.push(member);
          if (!roleDependents.has(member))
            roleDependents.set(member, new Set());
          roleDependents.get(member).add(entry);
          const prepared = session.entriesByOntology.get(member)?.prepared;
          const entities = prepared
            ? prepared.declarations
            : [...member.getAxioms()]
                .filter(
                  (axiom) => axiom.kind === OWLObjectKind.DECLARATION_AXIOM,
                )
                .map((axiom) => axiom.entity);
          for (const entity of entities) declarations.add(entity);
        }
        reconstructionInputs.set(entry, { declarations, importedMembers });
      }
      const importedRoles = (entry) =>
        reconstructionInputs
          .get(entry)
          .importedMembers.flatMap(
            (member) =>
              sourceRolesByOntology.get(member) ??
              readSourceEvidence(member).structure?.roles ??
              [],
          );
      if (normalizedConfiguration.parsingMode === "preserve") {
        // Defaults can unlock further specific roles. Recompute derived OWL
        // and generic facts from authored seeds when this happens; a former
        // generic use must never become independent evidence for itself.
        // Every pass spends the document's original timeout/cancellation budget.
        const authoredSeeds = new Map(sourceRolesByOntology);
        const defaults = new Map();
        const namedKeys = (values = []) =>
          new Set(
            values
              .filter(({ iri }) => iri !== undefined)
              .map(({ iri, type, supports }) => {
                const proofs = (supports ?? [[]])
                  .map((proof) => JSON.stringify([...proof].sort()))
                  .sort();
                return `${type}\u0000${iri}\u0000${JSON.stringify(proofs)}`;
              }),
          );
        const equalRoles = (left, right) => {
          const a = namedKeys(left),
            b = namedKeys(right);
          return a.size === b.size && [...a].every((key) => b.has(key));
        };
        let previousPass;
        for (;;) {
          sourceRolesByOntology.clear();
          for (const [ontology, roles] of authoredSeeds)
            sourceRolesByOntology.set(ontology, [
              ...roles,
              ...(defaults.get(ontology) ?? []),
            ]);
          let fixedSeeds = new Map(sourceRolesByOntology);
          for (const stage of ["explicit", "owl", "rdfs", "complete"]) {
            const pending = new Set(reconstructionInputs.keys());
            while (pending.size) {
              this.#throwIfAborted(normalizedConfiguration);
              const entry = pending.values().next().value;
              pending.delete(entry);
              if (!entry.prepared.discoverSourceRoles) continue;
              const discovered = await entry.prepared.discoverSourceRoles(
                reconstructionInputs.get(entry).declarations,
                [
                  ...(fixedSeeds.get(entry.ontology) ?? []),
                  ...importedRoles(entry),
                ],
                stage,
              );
              const roles = [
                ...(defaults.get(entry.ontology) ?? []),
                ...discovered.roles,
              ];
              if (stage === "complete")
                defaults.set(entry.ontology, discovered.defaultRoles);
              const changed = !equalRoles(
                sourceRolesByOntology.get(entry.ontology),
                roles,
              );
              sourceRolesByOntology.set(entry.ontology, roles);
              if (changed)
                for (const dependent of roleDependents.get(entry.ontology) ??
                  [])
                  pending.add(dependent);
            }
            // Only unconditional positions may supply local seeds to later
            // stages. Imported facts remain inputs, never owned declarations.
            if (stage === "explicit")
              fixedSeeds = new Map(sourceRolesByOntology);
          }
          if (
            previousPass &&
            [...sourceRolesByOntology].every(([ontology, roles]) =>
              equalRoles(previousPass.get(ontology), roles),
            )
          )
            break;
          previousPass = new Map(sourceRolesByOntology);
        }
      }
      for (const [entry, { declarations }] of reconstructionInputs) {
        const transaction = new ParseTransaction(
          this.#dataFactory,
          normalizedConfiguration,
        );
        await entry.prepared.reconstruct(
          declarations,
          transaction,
          normalizedConfiguration.parsingMode === "preserve"
            ? [
                ...(sourceRolesByOntology.get(entry.ontology) ?? []),
                ...importedRoles(entry),
              ]
            : importedRoles(entry),
        );
        const completed = transaction.commit(
          entry.context.format,
          entry.context.documentIRI,
        );
        const imports = new StructuralSet(
          entry.ontology.getImportsDeclarations(),
        );
        const completedImports = completed.ontology.getImportsDeclarations();
        if (
          !completed.ontology
            .getOntologyID()
            .equals(entry.ontology.getOntologyID()) ||
          completedImports.size !== imports.size ||
          [...completedImports].some((declaration) => !imports.has(declaration))
        ) {
          throw new OWLOntologyStateError(
            "RDF reconstruction changed its discovered ontology identity or imports",
            {
              ontology: entry.ontology,
              operation: "loadOntologyGraph",
            },
          );
        }
        entry.completedOntology = completed.ontology;
        entry.context = {
          ...completed.context,
          diagnostics: [
            ...completed.context.diagnostics,
            ...entry.context.diagnostics,
          ],
        };
      }
      this.#throwIfAborted(normalizedConfiguration);
      documentPublications = session.entries.map((entry) => {
        if (normalizedConfiguration.parsingMode === "preserve") {
          entry.context.sourceStructure = createSourceStructure(
            entry.completedOntology ?? entry.ontology,
            entry.context.sourceStructure,
          );
        }
        const context = createImmutableDocumentMetadataSnapshot(entry.context);
        const ontologyState = this.#managedOntologyStates.get(entry.ontology);
        if (!ontologyState) {
          throw new OWLOntologyStateError(
            "Loaded ontology state was not retained by its manager",
            { ontology: entry.ontology, operation: "loadOntologyGraph" },
          );
        }
        const mutationDraft = ontologyState.createMutationDraft();
        if (entry.completedOntology) {
          for (const axiom of entry.completedOntology.getAxioms())
            mutationDraft.stageAxiomAddition(axiom);
          for (const annotation of entry.completedOntology.getAnnotations())
            mutationDraft.stageOntologyAnnotationAddition(annotation);
        }
        mutationDraft.stageDocumentMetadataReplacement(context);
        ontologyState.preflightMutation(mutationDraft);
        return { context, entry, mutationDraft, ontologyState };
      });
    } catch (error) {
      managedOntologyLoadSession.discard();
      throw error;
    }

    managedOntologyLoadSession.commit();
    for (const publication of documentPublications) {
      publication.ontologyState.commitMutation(publication.mutationDraft);
      const { ontology } = publication.entry;
      this.#loaderConfigurationsByOntologyID.set(
        ontology.getOntologyID().structuralKey(),
        normalizedConfiguration,
      );
      bindManagedOntology(
        ontology,
        () => this.#readImportsClosure(ontology, "readLoadedImportsClosure"),
        (member, iri) =>
          this.#managedOntologyIndex.hasResolvedImport(member, iri),
        this,
        this.#behaviorContext.behaviorProfileDefinition,
      );
      publishSourceEvidence(
        ontology,
        publication.context.sourceStructure,
        publication.entry.sourceTrusted,
      );
    }
    const documents = Object.freeze(
      documentPublications.map(({ context, entry }) =>
        Object.freeze({ context, ontology: entry.ontology }),
      ),
    );
    const importsClosure = this.importsClosure(root);
    return Object.freeze({
      documents,
      importsClosure,
      ontology: root,
    });
  }

  async #loadDocument(source, configuration, session, depth) {
    this.#throwIfAborted(configuration);
    this.#checkInputSize(source, configuration);

    if (!session.managedOntologyIndexSession)
      return this.#loadPublishedDocument(source, configuration, session, depth);

    const sourceDocumentIRI = source.getDocumentIRI?.();
    const existingOntology =
      depth > 0 && sourceDocumentIRI
        ? session.managedOntologyIndexSession.getOntologyByDocumentIRI(
            sourceDocumentIRI,
          )
        : undefined;
    if (existingOntology) {
      return existingOntology;
    }

    const committed = await this.#parseDocument(source, configuration);
    this.#managedOntologyStates.set(
      committed.ontology,
      committed.ontologyState,
    );
    session.managedOntologyIndexSession.stageOntology(committed.ontology, {
      documentIRI: sourceDocumentIRI,
    });

    const entry = {
      context: committed.context,
      ontology: committed.ontology,
      prepared: committed.prepared,
      sourceTrusted: committed.sourceTrusted,
    };
    session.entries.push(entry);
    session.entriesByOntology.set(entry.ontology, entry);

    for (const declaration of committed.ontology.getImportsDeclarations()) {
      await this.#loadImport(
        declaration.iri,
        entry,
        configuration,
        session,
        depth,
      );
    }
    return committed.ontology;
  }

  async #loadImport(importIRI, importingEntry, configuration, session, depth) {
    const index =
      session.managedOntologyIndexSession ?? this.#managedOntologyIndex;
    let importedOntology = index.getOntologyByIRI(
      importIRI,
      this.#behaviorContext.behaviorProfileDefinition.ontologyIdentityPolicy,
    );
    if (importedOntology) {
      await this.#authorizeImportedOntology(
        importedOntology,
        importIRI,
        importingEntry,
        configuration,
        index,
      );
      this.#recordLoadedImport(
        session,
        importingEntry.ontology,
        importedOntology,
        importIRI,
      );
      return importedOntology;
    }

    if (!session.managedOntologyIndexSession) {
      if (this.#requestedImportIRIs.has(importIRI.value)) {
        // Java skips another acquisition, but its retained-ID closure can still
        // expose earlier content. Recheck authority without changing lookup order.
        const retainedOntology = this.#resolveJavaImport(importIRI);
        if (retainedOntology)
          await this.#authorizeImportedOntology(
            retainedOntology,
            importIRI,
            importingEntry,
            configuration,
            index,
          );
        return undefined;
      }
      this.#requestedImportIRIs.add(importIRI.value);
    }

    const documentIRI = this.#mapDocumentIRI(importIRI);
    importedOntology = index.getOntologyByDocumentIRI(documentIRI);
    if (importedOntology) {
      await this.#authorizeImportedOntology(
        importedOntology,
        importIRI,
        importingEntry,
        configuration,
        index,
      );
      this.#recordLoadedImport(
        session,
        importingEntry.ontology,
        importedOntology,
        importIRI,
      );
      return importedOntology;
    }
    session.importCount += 1;
    if (session.importCount > configuration.maxImportCount) {
      throw new ResourceLimitError("The ontology import limit was exceeded", {
        limit: configuration.maxImportCount,
        observed: session.importCount,
        resource: "maxImportCount",
      });
    }
    if (depth + 1 > configuration.maxImportDepth) {
      throw new ResourceLimitError(
        "The ontology import depth limit was exceeded",
        {
          limit: configuration.maxImportDepth,
          observed: depth + 1,
          resource: "maxImportDepth",
        },
      );
    }
    if (!configuration.remoteImports && isHttpIRI(documentIRI)) {
      return this.#handleMissingImport(
        new MissingImportError(
          "Remote ontology imports are disabled by configuration",
          { documentIRI, importIRI },
        ),
        importingEntry,
        configuration,
      );
    }
    if (!this.#documentLoader?.load) {
      return this.#handleMissingImport(
        new MissingImportError(
          "No ontology document loader can resolve the import",
          { documentIRI, importIRI },
        ),
        importingEntry,
        configuration,
      );
    }

    let loaded;
    try {
      const requestContext = Object.freeze({
        config: configuration,
        purpose: "ontology-import",
        importIRI,
        importingDocumentIRI: importingEntry.context.documentIRI,
        signal: configuration.signal,
      });
      await assertDocumentLoaderAuthorization(
        this.#documentLoader,
        documentIRI,
        requestContext,
      );
      loaded = await this.#documentLoader.load(documentIRI, requestContext);
      const finalDocumentIRI = loaded?.getDocumentIRI?.();
      if (finalDocumentIRI && finalDocumentIRI.value !== documentIRI.value) {
        await assertDocumentLoaderAuthorization(
          this.#documentLoader,
          finalDocumentIRI,
          Object.freeze({
            ...requestContext,
            requestedDocumentIRI: documentIRI,
          }),
        );
      }
    } catch (error) {
      if (configuration.signal?.aborted) {
        this.#throwIfAborted(configuration);
      }
      if (error?.name === "AbortError") {
        throw error;
      }
      if (
        error instanceof ResourceLimitError ||
        error instanceof SecurityPolicyError ||
        error instanceof UnloadableImportError
      ) {
        throw error;
      }
      if (error instanceof MissingImportError) {
        return this.#handleMissingImport(error, importingEntry, configuration);
      }
      throw new UnloadableImportError(
        "The ontology document loader failed while resolving an import",
        { cause: error, documentIRI, importIRI },
      );
    }
    this.#throwIfAborted(configuration);
    if (loaded === undefined || loaded === null) {
      return this.#handleMissingImport(
        new MissingImportError(
          "The ontology document loader did not resolve the import",
          { documentIRI, importIRI },
        ),
        importingEntry,
        configuration,
      );
    }

    let importedSource;
    try {
      importedSource = sourceWithDocumentIRI(loaded, documentIRI);
    } catch (error) {
      throw new UnloadableImportError(
        "The ontology document loader returned an unreadable source",
        { cause: error, documentIRI, importIRI },
      );
    }
    if (!importedSource || typeof importedSource.getText !== "function") {
      throw new UnloadableImportError(
        "The ontology document loader returned an invalid source",
        { documentIRI, importIRI },
      );
    }
    importedOntology = await this.#loadDocument(
      importedSource,
      configuration,
      session,
      depth + 1,
    );
    this.#externalDocumentIRIsByOntology.set(
      importedOntology,
      Object.freeze([
        documentIRI,
        ...(importedSource.getDocumentIRI?.()?.value !== documentIRI.value &&
        importedSource.getDocumentIRI?.()
          ? [importedSource.getDocumentIRI()]
          : []),
      ]),
    );
    this.#recordLoadedImport(
      session,
      importingEntry.ontology,
      importedOntology,
      importIRI,
    );
    return importedOntology;
  }

  async #authorizeImportedOntology(
    ontology,
    importIRI,
    importingEntry,
    configuration,
    index,
  ) {
    const context = Object.freeze({
      config: configuration,
      purpose: "ontology-import",
      importIRI,
      importingDocumentIRI: importingEntry.context.documentIRI,
      signal: configuration.signal,
    });
    const importsClosure =
      this.#behaviorContext.behaviorProfileDefinition.ontologyLoadingPolicy
        .importResolution === "retained-id"
        ? this.#readImportsClosure(ontology, "authorizeImportedOntology")
        : index.getImportsClosure(ontology);
    for (const member of importsClosure) {
      for (const documentIRI of this.#externalDocumentIRIsByOntology.get(
        member,
      ) ?? []) {
        await assertDocumentLoaderAuthorization(
          this.#documentLoader,
          documentIRI,
          context,
        );
        this.#throwIfAborted(configuration);
      }
    }
  }

  #recordLoadedImport(session, ontology, importedOntology, importIRI) {
    const indexSession =
      session.managedOntologyIndexSession ??
      this.#managedOntologyIndex.beginLoadSession();
    indexSession.stageDirectImport(ontology, importedOntology, importIRI);
    if (!session.managedOntologyIndexSession) {
      indexSession.commit();
      this.#importedOntologyIDsByImportIRI.set(
        importIRI.value,
        importedOntology.getOntologyID(),
      );
    }
  }

  /** Java exposes the document while its parser resolves imports. A failed
   * document is withdrawn, without withdrawing imports that completed earlier.
   */
  async #loadPublishedDocument(source, configuration, session, depth) {
    const documentIRI = source.getDocumentIRI?.();
    const existing =
      documentIRI &&
      this.#managedOntologyIndex.getOntologyByDocumentIRI(documentIRI);
    if (existing && depth > 0) return existing;
    let publication;
    const committed = await this.#parseDocument(source, configuration, () => {
      const managedOntology = createManagerOwnedOWLOntology({
        ontologyID: this.#dataFactory.getOWLOntologyID(),
      });
      const { ontology, ontologyState } = managedOntology;
      this.#managedOntologyIndex.registerOntology(ontology, { documentIRI });
      this.#managedOntologyStates.set(ontology, ontologyState);
      bindManagedOntology(
        ontology,
        () => this.#readImportsClosure(ontology, "readLoadedImportsClosure"),
        (_member, iri) => Boolean(this.#resolveJavaImport(iri)),
        this,
        this.#behaviorContext.behaviorProfileDefinition,
      );
      const entry = { ontology, context: { documentIRI, diagnostics: [] } };
      const mutate = (edit, value) => {
        const draft = ontologyState.createMutationDraft();
        draft[edit](value);
        ontologyState.preflightMutation(draft);
        ontologyState.commitMutation(draft);
      };
      publication = {
        managedOntology,
        addAxiom: (axiom) => mutate("stageAxiomAddition", axiom),
        addAnnotation: (annotation) =>
          mutate("stageOntologyAnnotationAddition", annotation),
        addImport: async (declaration) => {
          mutate("stageImportAddition", declaration);
          await this.#loadImport(
            declaration.iri,
            entry,
            configuration,
            session,
            depth,
          );
        },
        setOntologyID: (ontologyID) => {
          this.#commitAtomicChanges(
            [
              {
                kind: "SET_ONTOLOGY_ID",
                ontology,
                originalOntologyID: ontology.getOntologyID(),
                newOntologyID: ontologyID,
              },
            ],
            "loadOntologyDocument",
          );
        },
        discard: () => this.#managedOntologyIndex.unregisterOntology(ontology),
        entry,
      };
      return publication;
    });
    try {
      if (committed.prepared) {
        const declarations = new StructuralSet();
        for (const member of this.importsClosure(committed.ontology)) {
          if (member === committed.ontology) continue;
          for (const axiom of member.getAxioms())
            if (axiom.kind === OWLObjectKind.DECLARATION_AXIOM)
              declarations.add(axiom.entity);
        }
        const reconstructed = new ParseTransaction(
          this.#dataFactory,
          configuration,
          publication,
        );
        await committed.prepared.reconstruct(declarations, reconstructed);
        committed.context = reconstructed.commit(
          committed.context.format,
          documentIRI,
        ).context;
      }
      const context = createImmutableDocumentMetadataSnapshot({
        ...committed.context,
        diagnostics: [
          ...committed.context.diagnostics,
          ...publication.entry.context.diagnostics,
        ],
      });
      const draft = committed.ontologyState.createMutationDraft();
      draft.stageDocumentMetadataReplacement(context);
      committed.ontologyState.preflightMutation(draft);
      committed.ontologyState.commitMutation(draft);
      this.#loaderConfigurationsByOntologyID.set(
        committed.ontology.getOntologyID().structuralKey(),
        configuration,
      );
      publishSourceEvidence(
        committed.ontology,
        context.sourceStructure,
        committed.sourceTrusted,
      );
      session.entries.push({ ontology: committed.ontology, context });
      return committed.ontology;
    } catch (error) {
      publication.discard();
      throw error;
    }
  }

  #handleMissingImport(error, importingEntry, configuration) {
    if (configuration.missingImportHandling === "diagnostic") {
      importingEntry.context.diagnostics.push(
        freezeDiagnostic({
          code: error.code,
          documentIRI: error.documentIRI,
          importIRI: error.importIRI,
          message: error.message,
          severity: "warning",
        }),
      );
      return undefined;
    }
    throw error;
  }

  #mapDocumentIRI(importIRI) {
    for (const mapper of this.#iriMappers) {
      const mapped = mapper.getDocumentIRI(importIRI);
      if (mapped !== undefined && mapped !== null) {
        return IRI.create(mapped);
      }
    }
    return importIRI;
  }

  #addAxiomIterable(ontology, axioms, operation) {
    if (
      this.#behaviorContext.behaviorProfileDefinition.ontologyChangePolicy
        .publication === "sequential"
    ) {
      const values = materializeAxiomIterable(axioms, { operation });
      return this.#applyChangeIterable(
        values.map((axiom) => new AddAxiom(ontology, axiom)),
        operation,
      );
    }
    const ontologyState = this.#requireManagedOntologyState(
      ontology,
      operation,
    );
    const materializedAxioms = materializeAxiomIterable(axioms, {
      operation,
    });
    const mutationDraft = ontologyState.createMutationDraft();
    for (const axiom of materializedAxioms) {
      mutationDraft.stageAxiomAddition(axiom);
    }
    ontologyState.preflightMutation(mutationDraft);
    return ontologyState.commitMutation(mutationDraft);
  }

  #applyChangeIterable(changes, operation) {
    const materializedChanges = materializeOntologyChanges(changes, operation);
    // Profile compatibility is an admission condition, before Java's sequential
    // failure semantics can publish any member of a mixed-profile batch.
    for (const { ontology } of materializedChanges) {
      const owner = readOntologyOwner(ontology);
      if (
        owner &&
        owner.#behaviorContext.behaviorProfileDefinition !==
          this.#behaviorContext.behaviorProfileDefinition
      )
        throw new TypeError("Ontology mutation behavior profiles must match");
    }
    if (
      this.#behaviorContext.behaviorProfileDefinition.ontologyChangePolicy
        .publication === "sequential"
    )
      return this.#applySequentialChanges(materializedChanges, operation);
    return this.#commitAtomicChanges(materializedChanges, operation);
  }

  #isAnnotationAdditionFiltered(descriptor) {
    return (
      descriptor.kind === "ADD_AXIOM" &&
      ANNOTATION_AXIOM_KINDS.has(descriptor.value.kind) &&
      this.#loaderConfigurationsByOntologyID
        .get(descriptor.ontology.getOntologyID().structuralKey())
        ?.isLoadAnnotationAxioms() === false
    );
  }

  /** Java sequential publication. Consecutive axiom/annotation edits share one
   * draft per ontology so a batch is not O(N^2) in snapshot copies; every
   * staged edit is published before any identity/import change, rollback, or
   * rethrown exception, so observable partial-application semantics match
   * one-commit-per-change publication.
   */
  #applySequentialChanges(descriptors, operation) {
    const enacted = [];
    const stagedDrafts = new Map();
    const flushStagedDrafts = () => {
      if (stagedDrafts.size === 0) return;
      const drafts = [...stagedDrafts.values()];
      stagedDrafts.clear();
      for (const { mutationDraft, ontologyState } of drafts)
        ontologyState.preflightMutation(mutationDraft);
      for (const { mutationDraft, ontologyState } of drafts)
        ontologyState.assertPreparedMutationIsCurrent(mutationDraft);
      for (const { mutationDraft, ontologyState } of drafts)
        ontologyState.commitMutation(mutationDraft);
    };
    const stageSimpleDescriptor = (descriptor, ontologyState) => {
      let entry = stagedDrafts.get(descriptor.ontology);
      if (!entry) {
        entry = {
          mutationDraft: ontologyState.createMutationDraft(),
          ontologyState,
        };
        stagedDrafts.set(descriptor.ontology, entry);
      }
      const { mutationDraft } = entry;
      switch (descriptor.kind) {
        case "ADD_AXIOM":
          return mutationDraft.stageAxiomAddition(descriptor.value);
        case "REMOVE_AXIOM":
          return mutationDraft.stageAxiomRemoval(descriptor.value);
        case "ADD_ONTOLOGY_ANNOTATION":
          return mutationDraft.stageOntologyAnnotationAddition(
            descriptor.annotation,
          );
        case "REMOVE_ONTOLOGY_ANNOTATION":
          return mutationDraft.stageOntologyAnnotationRemoval(descriptor.value);
        default:
          return undefined;
      }
    };
    const isSimple = ({ kind }) =>
      kind === "ADD_AXIOM" ||
      kind === "REMOVE_AXIOM" ||
      kind === "ADD_ONTOLOGY_ANNOTATION" ||
      kind === "REMOVE_ONTOLOGY_ANNOTATION";

    try {
      for (const descriptor of descriptors) {
        const ontologyState = this.#requireManagedOntologyState(
          descriptor.ontology,
          operation,
          { change: descriptor.change, index: descriptor.index },
        );
        if (this.#isAnnotationAdditionFiltered(descriptor)) {
          flushStagedDrafts();
          // Recorded Java outcome: inverses are enacted in encounter order.
          // Exceptions, unlike an unsuccessful result, retain prior publication.
          for (const previous of enacted) {
            const inverse = reverseChangeDescriptor(previous);
            if (this.#isAnnotationAdditionFiltered(inverse))
              throw new OWLOntologyStateError(
                "An inverse ontology change was rejected",
                { ontology: inverse.ontology, operation },
              );
            if (isSimple(inverse)) {
              stageSimpleDescriptor(
                inverse,
                this.#requireManagedOntologyState(inverse.ontology, operation, {
                  change: inverse.change,
                  index: inverse.index,
                }),
              );
            } else {
              flushStagedDrafts();
              this.#commitAtomicChanges([inverse], operation, true);
            }
          }
          flushStagedDrafts();
          return ChangeApplied.UNSUCCESSFULLY;
        }
        if (isSimple(descriptor)) {
          if (stageSimpleDescriptor(descriptor, ontologyState))
            enacted.push(descriptor);
          continue;
        }
        flushStagedDrafts();
        if (this.#commitAtomicChanges([descriptor], operation, true))
          enacted.push(descriptor);
      }
      flushStagedDrafts();
    } catch (error) {
      // Java retains every change enacted before the exception.
      flushStagedDrafts();
      throw error;
    }
    return enacted.length
      ? ChangeApplied.SUCCESSFULLY
      : ChangeApplied.NO_OPERATION;
  }

  #commitAtomicChanges(
    materializedChanges,
    operation,
    usesJavaIndexSemantics = false,
  ) {
    const ontologyStates = new Map();
    for (const descriptor of materializedChanges) {
      if (!ontologyStates.has(descriptor.ontology)) {
        ontologyStates.set(
          descriptor.ontology,
          this.#requireManagedOntologyState(descriptor.ontology, operation, {
            change: descriptor.change,
            index: descriptor.index,
          }),
        );
      }
    }

    const identityMutation = materializedChanges.some(({ kind }) =>
      ["SET_ONTOLOGY_ID", "ADD_IMPORT", "REMOVE_IMPORT"].includes(kind),
    )
      ? this.#managedOntologyIndex.beginOntologyMutation()
      : undefined;
    const ontologyMutations = new Map(
      [...ontologyStates].map(([ontology, ontologyState]) => [
        ontology,
        Object.freeze({
          mutationDraft: ontologyState.createMutationDraft(),
          ontologyState,
        }),
      ]),
    );

    let changesState = false;
    const importParticipants = new Set();
    try {
      for (const descriptor of materializedChanges) {
        const { mutationDraft } = ontologyMutations.get(descriptor.ontology);
        if (descriptor.kind === "ADD_ONTOLOGY_ANNOTATION") {
          mutationDraft.stageOntologyAnnotationAddition(descriptor.annotation);
          continue;
        }

        const structuralEdits = {
          ADD_AXIOM: "stageAxiomAddition",
          REMOVE_AXIOM: "stageAxiomRemoval",
          ADD_IMPORT: "stageImportAddition",
          REMOVE_IMPORT: "stageImportRemoval",
          REMOVE_ONTOLOGY_ANNOTATION: "stageOntologyAnnotationRemoval",
        };
        const edit = structuralEdits[descriptor.kind];
        if (edit) {
          mutationDraft[edit](descriptor.value);
          if (
            descriptor.kind === "ADD_IMPORT" ||
            descriptor.kind === "REMOVE_IMPORT"
          )
            importParticipants.add(descriptor.ontology);
          continue;
        }

        const currentOntologyID = mutationDraft.getStagedOntologyID();
        mutationDraft.stageOntologyIDReplacement(descriptor.newOntologyID);
        if (usesJavaIndexSemantics) {
          const occupied = this.#managedOntologyIndex.getOntologyByID(
            descriptor.newOntologyID,
          );
          const sourceAxioms = descriptor.ontology.getAxioms();
          if (
            occupied &&
            occupied !== descriptor.ontology &&
            (occupied.getAxiomCount() !== sourceAxioms.size ||
              [...sourceAxioms].some((axiom) => !occupied.containsAxiom(axiom)))
          )
            throw new OWLOntologyStateError(
              "An ontology with this ID already exists",
              {
                ontology: descriptor.ontology,
                ontologyID: descriptor.newOntologyID,
                operation,
              },
            );
          identityMutation.stageOntologyAliasReplacement(
            descriptor.originalOntologyID,
            descriptor.newOntologyID,
            { change: descriptor.change, index: descriptor.index, operation },
          );
        } else
          identityMutation.stageOntologyIDReplacement(
            descriptor.ontology,
            currentOntologyID,
            descriptor.newOntologyID,
            {
              change: descriptor.change,
              index: descriptor.index,
              operation,
            },
          );
      }

      // Resolve declarations only against final staged aliases and loaded documents.
      // Mapping may invoke caller code, so it precedes every final revision check.
      for (const ontology of importParticipants) {
        if (
          usesJavaIndexSemantics &&
          !this.#managedOntologyIndex.hasOntology(ontology)
        )
          continue;
        const declarations = ontologyMutations
          .get(ontology)
          .mutationDraft.getStagedImportsDeclarations();
        const original = new StructuralSet(
          readOntologySnapshot(ontology).authoredImportDeclarations,
        );
        if (
          original.size === declarations.length &&
          declarations.every((declaration) => original.has(declaration))
        )
          continue;
        identityMutation.stageImportsReplacement(
          ontology,
          declarations.map((declaration) => ({
            iri: declaration.iri,
            documentIRI: usesJavaIndexSemantics
              ? declaration.iri
              : this.#mapDocumentIRI(declaration.iri),
          })),
          this.#behaviorContext.behaviorProfileDefinition
            .ontologyIdentityPolicy,
        );
      }

      for (const {
        mutationDraft,
        ontologyState,
      } of ontologyMutations.values()) {
        const preflight = ontologyState.preflightMutation(mutationDraft);
        changesState = preflight.changesState || changesState;
      }
      if (identityMutation) {
        const preflight = identityMutation.preflight();
        changesState = preflight.changesState || changesState;
      }

      // Snapshot preparation can invoke public structural iterators. Recheck
      // every participant together after all such observable work, then publish
      // without another caller-controlled operation between these checks and
      // the private state swaps below.
      for (const {
        mutationDraft,
        ontologyState,
      } of ontologyMutations.values()) {
        ontologyState.assertPreparedMutationIsCurrent(mutationDraft);
      }
      identityMutation?.assertPreparedMutationIsCurrent();
    } catch (error) {
      for (const {
        mutationDraft,
        ontologyState,
      } of ontologyMutations.values()) {
        ontologyState.discardMutation(mutationDraft);
      }
      identityMutation?.discard();
      throw error;
    }

    // All potentially observable validation and snapshot construction has
    // completed. These commits only swap prepared private state, so no caller
    // can observe one ontology or alias set without the others.
    identityMutation?.commit();
    for (const { mutationDraft, ontologyState } of ontologyMutations.values()) {
      ontologyState.commitMutation(mutationDraft);
    }
    if (usesJavaIndexSemantics)
      for (const descriptor of materializedChanges) {
        if (descriptor.kind === "REMOVE_IMPORT")
          this.#importedOntologyIDsByImportIRI.delete(
            descriptor.value.iri.value,
          );
        if (descriptor.kind === "ADD_IMPORT") {
          const iri = descriptor.value.iri;
          const imported =
            this.#managedOntologyIndex.getOntologyByIRI(
              iri,
              this.#behaviorContext.behaviorProfileDefinition
                .ontologyIdentityPolicy,
            ) ?? this.#managedOntologyIndex.getOntologyByDocumentIRI(iri);
          if (imported)
            this.#importedOntologyIDsByImportIRI.set(
              iri.value,
              imported.getOntologyID(),
            );
        }
      }
    return changesState;
  }

  #requireManagedOntologyState(ontology, operation, details = {}) {
    const policy =
      this.#behaviorContext.behaviorProfileDefinition.ontologyChangePolicy;
    const owner = readOntologyOwner(ontology);
    if (
      policy.permitsSameProfileForeignTargets &&
      owner?.#behaviorContext.behaviorProfileDefinition ===
        this.#behaviorContext.behaviorProfileDefinition
    ) {
      const state = owner.#managedOntologyStates.get(ontology);
      if (state) return state;
    }
    const ontologyState = this.#managedOntologyStates.get(ontology);
    if (!this.#managedOntologyIndex.hasOntology(ontology) || !ontologyState) {
      throw new OWLOntologyStateError(
        "The ontology is not managed by this manager",
        { ...details, ontology, operation },
      );
    }
    return ontologyState;
  }

  async #parseDocument(source, configuration, createPublication) {
    const sourceFormat = source.getFormat?.();
    if (sourceFormat !== undefined) {
      configuration = configuration.withFormat(sourceFormat);
    }
    const candidates = this.#registry.resolveCandidates(source, configuration);
    const explicitFormat = configuration.format !== undefined;
    const mismatches = [];

    for (const candidate of candidates) {
      if (!candidate.eligible) {
        continue;
      }

      const parser = candidate.descriptor.createParser({
        documentLoader: this.#documentLoader,
      });
      if (!parser || typeof parser.parse !== "function") {
        throw new TypeError(
          `Parser ${candidate.descriptor.id} does not implement parse()`,
        );
      }
      const publication = createPublication?.();
      const transaction = new ParseTransaction(
        this.#dataFactory,
        configuration,
        publication,
      );

      try {
        const prepared = await prepareRdfDocument(
          parser,
          source,
          transaction,
          configuration,
        );
        const returnedFormat = prepared
          ? undefined
          : await parser.parse(source, transaction, configuration);
        this.#throwIfAborted(configuration);
        if (returnedFormat && !transaction.getDocumentFormat()) {
          transaction.setDocumentFormat(returnedFormat);
        }
        return {
          ...transaction.commit(
            candidate.descriptor.format,
            source.getDocumentIRI?.(),
          ),
          prepared,
          sourceTrusted:
            builtinDescriptors.has(candidate.descriptor) &&
            configuration.loadAnnotationAxioms &&
            prepared?.sourceComplete !== false,
        };
      } catch (error) {
        publication?.discard();
        if (
          this.#behaviorContext.behaviorProfileDefinition.parserSelectionPolicy
            .aggregatesParserFailures &&
          error instanceof OWLParserError &&
          !(error instanceof UnsupportedConstructError)
        ) {
          mismatches.push(error);
          continue;
        }
        if (error instanceof ParserMismatchError) {
          if (explicitFormat) {
            throw error;
          }
          mismatches.push(error);
          continue;
        }
        throw error;
      }
    }

    throw new UnparsableOntologyException(mismatches);
  }

  #checkInputSize(source, configuration) {
    const inputBytes = new TextEncoder().encode(source.getText()).byteLength;
    if (inputBytes > configuration.maxInputBytes) {
      throw new ResourceLimitError(
        "The ontology input byte limit was exceeded",
        {
          limit: configuration.maxInputBytes,
          observed: inputBytes,
          resource: "maxInputBytes",
        },
      );
    }
  }

  #throwIfAborted(configuration) {
    const { signal } = configuration;
    if (!signal?.aborted) {
      return;
    }
    if (typeof signal.throwIfAborted === "function") {
      signal.throwIfAborted();
    }
    const error = new Error("The ontology load was aborted");
    error.name = "AbortError";
    throw error;
  }
}
