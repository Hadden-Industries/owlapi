import { XML_ENTITY_DEFAULTS } from "../internal/parsing/xml/xmlEntityDefaults.js";
import { validateFormatSelection } from "../internal/parsing/formatSelection.js";
import { OntologyBehaviorContext } from "../internal/behavior/ontologyBehaviorContext.js";

const PARSING_MODES = new Set(["strict", "compatible", "preserve"]);
const IMPORT_HANDLING = new Set(["throw", "diagnostic"]);
const GRAPH_POLICIES = new Set([
  "requireSingleGraph",
  "defaultGraphOnly",
  "selectGraph",
  "merge",
]);

const DEFAULTS = Object.freeze({
  collectWarnings: true,
  format: undefined,
  loadAnnotationAxioms: true,
  maxAnnotationDepth: 64,
  maxAxioms: 1000000,
  maxBlankNodes: 1000000,
  ...XML_ENTITY_DEFAULTS,
  maxExpressionDepth: 512,
  maxImportCount: 256,
  maxImportDepth: 32,
  maxInputBytes: 33554432,
  maxQuads: 5000000,
  maxRdfListLength: 1000000,
  maxRedirects: 0,
  maxRemoteDocumentBytes: 33554432,
  maxRetries: 0,
  maxSniffBytes: 8192,
  maxTokenCount: 5000000,
  maxTokenLength: 1048576,
  maxXmlNestingDepth: 512,
  missingImportHandling: "throw",
  parsingMode: "strict",
  rdfDatasetGraphPolicy: "requireSingleGraph",
  remoteImports: false,
  remoteJsonLdContexts: false,
  selectedGraph: undefined,
  signal: undefined,
  sourceLocations: true,
  timeoutMs: 30000,
});

const NUMERIC_LIMITS = Object.freeze([
  "maxAnnotationDepth",
  "maxAxioms",
  "maxBlankNodes",
  "maxEntityDeclarations",
  "maxEntityExpansionDepth",
  "maxEntityReplacementLength",
  "maxExpandedXmlBytes",
  "maxExpressionDepth",
  "maxImportCount",
  "maxImportDepth",
  "maxInputBytes",
  "maxQuads",
  "maxRdfListLength",
  "maxRedirects",
  "maxRemoteDocumentBytes",
  "maxRetries",
  "maxSniffBytes",
  "maxTokenCount",
  "maxTokenLength",
  "maxXmlNestingDepth",
  "timeoutMs",
]);

const BOOLEAN_SETTINGS = Object.freeze([
  "collectWarnings",
  "loadAnnotationAxioms",
  "remoteImports",
  "remoteJsonLdContexts",
  "sourceLocations",
]);

const ALLOWED_SETTINGS = new Set(Object.keys(DEFAULTS));
const CLONE_TOKEN = Symbol("OWLOntologyLoaderConfiguration.clone");
const JAVA_PROVIDER_DEFAULTS = Object.freeze({
  ...DEFAULTS,
  ...Object.fromEntries(NUMERIC_LIMITS.map((name) => [name, Infinity])),
  // Observed provider boundaries are distinct from OWLAPI-wide caps.
  maxXmlNestingDepth: 100,
  parsingMode: "compatible",
  rdfDatasetGraphPolicy: "merge",
  remoteImports: true,
  remoteJsonLdContexts: true,
});

const snapshotRdfTerm = (term) => {
  if (
    !term ||
    typeof term !== "object" ||
    typeof term.termType !== "string" ||
    typeof term.value !== "string"
  ) {
    throw new TypeError(
      "selectedGraph must implement the RDF/JS Term contract",
    );
  }
  return Object.freeze({
    equals(other) {
      return this.termType === other?.termType && this.value === other?.value;
    },
    termType: term.termType,
    value: term.value,
  });
};

const validate = (values, allowsUnboundedResources) => {
  if (!PARSING_MODES.has(values.parsingMode)) {
    throw new RangeError(`Unknown parsingMode: ${values.parsingMode}`);
  }
  if (!IMPORT_HANDLING.has(values.missingImportHandling)) {
    throw new RangeError(
      `Unknown missingImportHandling: ${values.missingImportHandling}`,
    );
  }
  if (!GRAPH_POLICIES.has(values.rdfDatasetGraphPolicy)) {
    throw new RangeError(
      `Unknown rdfDatasetGraphPolicy: ${values.rdfDatasetGraphPolicy}`,
    );
  }
  if (
    values.rdfDatasetGraphPolicy === "selectGraph" &&
    values.selectedGraph === undefined
  ) {
    throw new TypeError("selectGraph requires selectedGraph");
  }
  for (const name of NUMERIC_LIMITS) {
    if (allowsUnboundedResources && values[name] === Infinity) continue;
    if (!Number.isSafeInteger(values[name]) || values[name] < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }
  for (const name of BOOLEAN_SETTINGS) {
    if (typeof values[name] !== "boolean") {
      throw new TypeError(`${name} must be a boolean`);
    }
  }
  validateFormatSelection(values.format);
  if (
    values.signal !== undefined &&
    (typeof values.signal !== "object" ||
      typeof values.signal.aborted !== "boolean" ||
      typeof values.signal.addEventListener !== "function")
  ) {
    throw new TypeError("signal must implement the AbortSignal contract");
  }
};

const requireJavaInt = (value, name) => {
  if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647)
    throw new RangeError(`${name} must be a Java int`);
};
const requireBoolean = (value, name) => {
  if (typeof value !== "boolean")
    throw new TypeError(`${name} must be a boolean`);
};

export class OWLOntologyLoaderConfiguration {
  #behaviorContext;
  #connectionTimeoutMilliseconds = 20000;
  #configuredConnectionAttempts = 5;
  #shouldFollowRedirects = true;
  #entityExpansionLimit = "100000000";
  #authorizationHeaderValue = "";
  #acceptsHttpCompression = true;

  constructor(
    values = {},
    cloneSource = undefined,
    publicOverrides = undefined,
  ) {
    if (values === CLONE_TOKEN) {
      this.#behaviorContext = cloneSource.#behaviorContext;
      this.#connectionTimeoutMilliseconds =
        cloneSource.#connectionTimeoutMilliseconds;
      this.#configuredConnectionAttempts =
        cloneSource.#configuredConnectionAttempts;
      this.#shouldFollowRedirects = cloneSource.#shouldFollowRedirects;
      this.#entityExpansionLimit = cloneSource.#entityExpansionLimit;
      this.#authorizationHeaderValue = cloneSource.#authorizationHeaderValue;
      this.#acceptsHttpCompression = cloneSource.#acceptsHttpCompression;
      if (publicOverrides) {
        Object.assign(this, cloneSource, publicOverrides);
      } else {
        Object.assign(this, cloneSource);
      }
      Object.freeze(this);
      return;
    }
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      throw new TypeError("loader configuration values must be an object");
    }
    const { behaviorProfileId, ...settings } = values;
    this.#behaviorContext = new OntologyBehaviorContext(behaviorProfileId);
    for (const name of Object.keys(settings)) {
      if (!ALLOWED_SETTINGS.has(name)) {
        throw new TypeError(`Unknown loader configuration setting: ${name}`);
      }
    }
    const normalizedValues = { ...settings };
    if (normalizedValues.selectedGraph !== undefined) {
      normalizedValues.selectedGraph = snapshotRdfTerm(
        normalizedValues.selectedGraph,
      );
    }
    const usesJavaProviderDefaults =
      this.#behaviorContext.behaviorProfileDefinition.computationResourcePolicy
        .usesJavaProviderDefaults;
    const profileDefaults = usesJavaProviderDefaults
      ? JAVA_PROVIDER_DEFAULTS
      : DEFAULTS;
    const merged = { ...profileDefaults, ...normalizedValues };
    validate(merged, usesJavaProviderDefaults);
    Object.assign(this, merged);
    Object.freeze(this);
  }

  static defaults() {
    return new OWLOntologyLoaderConfiguration();
  }

  with(changes) {
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new TypeError("loader configuration values must be an object");
    }
    if (Object.hasOwn(changes, "behaviorProfileId"))
      throw new TypeError(
        "A loader configuration cannot change its behavior profile",
      );
    const keys = Object.keys(changes);
    if (keys.length === 0) {
      return new OWLOntologyLoaderConfiguration(CLONE_TOKEN, this);
    }
    for (const name of keys) {
      if (!ALLOWED_SETTINGS.has(name)) {
        throw new TypeError(`Unknown loader configuration setting: ${name}`);
      }
    }
    const normalizedValues = { ...changes };
    if (normalizedValues.selectedGraph !== undefined) {
      normalizedValues.selectedGraph = snapshotRdfTerm(
        normalizedValues.selectedGraph,
      );
    }
    const merged = { ...this, ...normalizedValues };
    validate(
      merged,
      this.#behaviorContext.behaviorProfileDefinition.computationResourcePolicy
        .usesJavaProviderDefaults,
    );
    return new OWLOntologyLoaderConfiguration(CLONE_TOKEN, this, merged);
  }

  getBehaviorProfileId() {
    return this.#behaviorContext.behaviorProfileDefinition.behaviorProfileId;
  }
  getConnectionTimeout() {
    return this.#connectionTimeoutMilliseconds;
  }
  getRetriesToAttempt() {
    return this.#configuredConnectionAttempts;
  }
  isFollowRedirects() {
    return this.#shouldFollowRedirects;
  }
  getEntityExpansionLimit() {
    return this.#entityExpansionLimit;
  }
  /** Java treats a null override as the default empty authorization value. */
  getAuthorizationValue() {
    return this.#authorizationHeaderValue ?? "";
  }
  isAcceptingHTTPCompression() {
    return this.#acceptsHttpCompression;
  }
  setAuthorizationValue(value) {
    if (value !== null && typeof value !== "string")
      throw new TypeError(
        "authorization header value must be a string or null",
      );
    if (this.getAuthorizationValue() === value) return this;
    const copy = new OWLOntologyLoaderConfiguration(CLONE_TOKEN, this);
    copy.#authorizationHeaderValue = value;
    return copy;
  }
  setAcceptingHTTPCompression(value) {
    requireBoolean(value, "accept HTTP compression");
    if (this.#acceptsHttpCompression === value) return this;
    const copy = new OWLOntologyLoaderConfiguration(CLONE_TOKEN, this);
    copy.#acceptsHttpCompression = value;
    return copy;
  }
  isStrict() {
    return this.parsingMode === "strict";
  }
  isLoadAnnotationAxioms() {
    return this.loadAnnotationAxioms;
  }

  setConnectionTimeout(value) {
    requireJavaInt(value, "connection timeout");
    if (value === this.#connectionTimeoutMilliseconds) return this;
    const copy = new OWLOntologyLoaderConfiguration(CLONE_TOKEN, this);
    copy.#connectionTimeoutMilliseconds = value;
    return copy;
  }

  setRetriesToAttempt(value) {
    requireJavaInt(value, "connection attempts");
    if (value === this.#configuredConnectionAttempts) return this;
    const copy = new OWLOntologyLoaderConfiguration(CLONE_TOKEN, this);
    copy.#configuredConnectionAttempts = value;
    return copy;
  }

  setFollowRedirects(value) {
    requireBoolean(value, "follow redirects");
    if (value === this.#shouldFollowRedirects) return this;
    const copy = new OWLOntologyLoaderConfiguration(CLONE_TOKEN, this);
    copy.#shouldFollowRedirects = value;
    return copy;
  }

  setEntityExpansionLimit(value) {
    if (typeof value !== "string")
      throw new TypeError("entity expansion limit must be a string");
    if (value === this.#entityExpansionLimit) return this;
    const copy = new OWLOntologyLoaderConfiguration(CLONE_TOKEN, this);
    copy.#entityExpansionLimit = value;
    return copy;
  }

  setStrict(value) {
    requireBoolean(value, "strict");
    return this.isStrict() === value
      ? this
      : new OWLOntologyLoaderConfiguration(CLONE_TOKEN, this, {
          parsingMode: value ? "strict" : "compatible",
        });
  }

  setLoadAnnotationAxioms(value) {
    requireBoolean(value, "load annotation axioms");
    return this.loadAnnotationAxioms === value
      ? this
      : new OWLOntologyLoaderConfiguration(CLONE_TOKEN, this, {
          loadAnnotationAxioms: value,
        });
  }

  withParsingMode(parsingMode) {
    return this.with({ parsingMode });
  }

  withMissingImportHandling(missingImportHandling) {
    return this.with({ missingImportHandling });
  }

  withRemoteImports(remoteImports) {
    return this.with({ remoteImports });
  }

  withRemoteJsonLdContexts(remoteJsonLdContexts) {
    return this.with({ remoteJsonLdContexts });
  }

  withRdfDatasetGraphPolicy(rdfDatasetGraphPolicy, selectedGraph) {
    return this.with({ rdfDatasetGraphPolicy, selectedGraph });
  }

  withFormat(format) {
    return this.with({ format });
  }
}
