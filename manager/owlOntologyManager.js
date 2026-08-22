import {
  MissingImportError,
  OWLOntologyLoaderConfiguration,
  OWLOntologyStateError,
  ParserMismatchError,
  ResourceLimitError,
  SecurityPolicyError,
  StringDocumentSource,
  UnloadableImportError,
  UnparsableOntologyException,
} from "../io/index.js";
import {
  IRI,
  OWLDataFactory,
  OWLOntology,
  StructuralSet,
} from "../model/index.js";
import { dlSyntaxParserDescriptor } from "../parser/dl/descriptor.js";
import { functionalSyntaxParserDescriptor } from "../parser/functional/descriptor.js";
import { krss2ParserDescriptor } from "../parser/krss2/descriptor.js";
import { jsonLdParserDescriptor } from "../parser/jsonld/descriptor.js";
import { manchesterSyntaxParserDescriptor } from "../parser/manchester/descriptor.js";
import { nQuadsParserDescriptor } from "../parser/nquads/descriptor.js";
import { nTriplesParserDescriptor } from "../parser/ntriples/descriptor.js";
import { owlXmlParserDescriptor } from "../parser/owlxml/descriptor.js";
import { rdfXmlParserDescriptor } from "../parser/rdfxml/descriptor.js";
import { triGParserDescriptor } from "../parser/trig/descriptor.js";
import { turtleParserDescriptor } from "../parser/turtle/descriptor.js";
import { OWLParserRegistry } from "./parserRegistry.js";

const DIAGNOSTIC_SEVERITIES = new Set(["info", "warning"]);
const SOURCE_LOCATION_FIELDS = ["line", "column", "offset"];

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
  #ontologyID;
  #prefixes;

  constructor(dataFactory, configuration) {
    this.#dataFactory = dataFactory;
    this.#configuration = configuration;
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
  }

  addAxioms(axioms) {
    for (const axiom of axioms) {
      this.addAxiom(axiom);
    }
  }

  addAnnotation(annotation) {
    this.#annotations.add(annotation);
  }

  addAnnotations(annotations) {
    for (const annotation of annotations) {
      this.addAnnotation(annotation);
    }
  }

  addImportsDeclaration(declaration) {
    this.#imports.add(declaration);
  }

  addImportsDeclarations(declarations) {
    for (const declaration of declarations) {
      this.addImportsDeclaration(declaration);
    }
  }

  addDiagnostic(diagnostic) {
    this.#diagnostics.push(freezeDiagnostic(diagnostic));
  }

  setOntologyID(ontologyID) {
    this.#ontologyID = ontologyID;
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

  commit(defaultFormat, documentIRI) {
    const ontologyID = this.#ontologyID || this.#dataFactory.getOWLOntologyID();
    return {
      context: {
        diagnostics: [...this.#diagnostics],
        documentIRI,
        format: this.#documentFormat || defaultFormat,
        ...(this.#prefixes === undefined ? {} : { prefixes: this.#prefixes }),
        ...(this.#jsonLdContexts === undefined
          ? {}
          : { jsonLdContexts: this.#jsonLdContexts }),
        ...(this.#rdfDatasetContext === undefined
          ? {}
          : this.#rdfDatasetContext),
      },
      ontology: new OWLOntology({
        annotations: this.#annotations,
        axioms: this.#axioms,
        imports: this.#imports,
        ontologyID,
      }),
    };
  }
}

const ontologyKey = (ontologyID) => {
  if (!ontologyID || typeof ontologyID.structuralKey !== "function") {
    throw new TypeError("ontologyID must be an OWLOntologyID");
  }
  return ontologyID.structuralKey();
};

const documentKey = (documentIRI) => documentIRI?.value;

const normalizeConfiguration = (configuration) => {
  if (configuration instanceof OWLOntologyLoaderConfiguration) {
    return configuration;
  }
  return new OWLOntologyLoaderConfiguration(configuration);
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

const freezeContext = (context) =>
  Object.freeze({
    ...context,
    diagnostics: Object.freeze([...context.diagnostics]),
  });

export class OWLOntologyManager {
  #contexts = new WeakMap();
  #dataFactory;
  #documentLoader;
  #iriMappers;
  #ontologies = new Map();
  #registry;

  constructor({ dataFactory, documentLoader, iriMappers = [], registry } = {}) {
    if (!iriMappers || typeof iriMappers[Symbol.iterator] !== "function") {
      throw new TypeError("iriMappers must be iterable");
    }
    const normalizedDataFactory = dataFactory || new OWLDataFactory();
    if (typeof normalizedDataFactory.getOWLOntologyID !== "function") {
      throw new TypeError("dataFactory must implement getOWLOntologyID()");
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
        // KRSS1 intentionally has no descriptor until its REQUIRED_V1 Phase 17
        // implementation passes its gate; a format identity alone is not executable.
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

  createOntology(ontologyID = this.#dataFactory.getOWLOntologyID()) {
    const key = ontologyKey(ontologyID);
    if (this.#ontologies.has(key)) {
      throw new OWLOntologyStateError(
        "An ontology with this ID already exists",
        {
          ontologyID,
        },
      );
    }
    const ontology = new OWLOntology({ ontologyID });
    this.#ontologies.set(key, ontology);
    return ontology;
  }

  getOntology(ontologyID) {
    return this.#ontologies.get(ontologyKey(ontologyID));
  }

  async loadOntologyFromOntologyDocument(source, configuration) {
    const result = await this.loadOntologyGraphFromOntologyDocument(
      source,
      configuration,
    );
    return result.ontology;
  }

  async loadOntologyGraphFromOntologyDocument(source, configuration) {
    const normalizedConfiguration = normalizeConfiguration(configuration);
    this.#throwIfAborted(normalizedConfiguration);
    const normalizedSource = normalizeSource(source);

    const session = {
      byDocument: new Map(),
      byOntology: new Map(),
      entries: [],
      importCount: 0,
    };
    const root = await this.#loadDocument(
      normalizedSource,
      normalizedConfiguration,
      session,
      0,
    );
    this.#throwIfAborted(normalizedConfiguration);

    for (const entry of session.entries) {
      const key = ontologyKey(entry.ontology.getOntologyID());
      if (this.#ontologies.has(key)) {
        throw new OWLOntologyStateError(
          "An ontology with this ID already exists",
          { ontologyID: entry.ontology.getOntologyID() },
        );
      }
    }
    for (const entry of session.entries) {
      const key = ontologyKey(entry.ontology.getOntologyID());
      this.#ontologies.set(key, entry.ontology);
      this.#contexts.set(entry.ontology, freezeContext(entry.context));
    }
    const documents = Object.freeze(
      session.entries.map((entry) =>
        Object.freeze({
          context: this.#contexts.get(entry.ontology),
          ontology: entry.ontology,
        }),
      ),
    );
    return Object.freeze({
      documents,
      importsClosure: Object.freeze(documents.map(({ ontology }) => ontology)),
      ontology: root,
    });
  }

  async #loadDocument(source, configuration, session, depth) {
    this.#throwIfAborted(configuration);
    this.#checkInputSize(source, configuration);

    const sourceDocumentIRI = source.getDocumentIRI?.();
    const sourceDocumentKey = documentKey(sourceDocumentIRI);
    const existingDocument = sourceDocumentKey
      ? session.byDocument.get(sourceDocumentKey)
      : undefined;
    if (existingDocument) {
      return existingDocument.ontology;
    }

    const committed = await this.#parseDocument(source, configuration);
    committed.context.documentIRI = sourceDocumentIRI;
    const key = ontologyKey(committed.ontology.getOntologyID());
    const duplicate = session.byOntology.get(key);
    if (duplicate) {
      throw new OWLOntologyStateError(
        "Two ontology documents produced the same ontology ID",
        {
          documentIRI: sourceDocumentIRI,
          ontologyID: committed.ontology.getOntologyID(),
        },
      );
    }

    const entry = {
      context: committed.context,
      documentKey: sourceDocumentKey,
      ontology: committed.ontology,
      state: "LOADING",
    };
    session.entries.push(entry);
    session.byOntology.set(key, entry);
    if (sourceDocumentKey) {
      session.byDocument.set(sourceDocumentKey, entry);
    }

    for (const declaration of committed.ontology.getImportsDeclarations()) {
      await this.#loadImport(
        declaration.iri,
        entry,
        configuration,
        session,
        depth,
      );
    }
    entry.state = "LOADED";
    return committed.ontology;
  }

  async #loadImport(importIRI, importingEntry, configuration, session, depth) {
    const importedOntologyID = this.#dataFactory.getOWLOntologyID(importIRI);
    const importedKey = ontologyKey(importedOntologyID);
    const sessionOntology = session.byOntology.get(importedKey);
    if (sessionOntology) {
      return sessionOntology.ontology;
    }
    const registeredOntology = this.#ontologies.get(importedKey);
    if (registeredOntology) {
      return registeredOntology;
    }

    const documentIRI = this.#mapDocumentIRI(importIRI);
    const existingDocument = session.byDocument.get(documentKey(documentIRI));
    if (existingDocument) {
      return existingDocument.ontology;
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
      loaded = await this.#documentLoader.load(documentIRI, {
        config: configuration,
        signal: configuration.signal,
      });
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
    return this.#loadDocument(
      importedSource,
      configuration,
      session,
      depth + 1,
    );
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

  async #parseDocument(source, configuration) {
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
      const transaction = new ParseTransaction(
        this.#dataFactory,
        configuration,
      );

      try {
        const returnedFormat = await parser.parse(
          source,
          transaction,
          configuration,
        );
        this.#throwIfAborted(configuration);
        if (returnedFormat && !transaction.getDocumentFormat()) {
          transaction.setDocumentFormat(returnedFormat);
        }
        return transaction.commit(
          candidate.descriptor.format,
          source.getDocumentIRI?.(),
        );
      } catch (error) {
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
