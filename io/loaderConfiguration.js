const PARSING_MODES = new Set(["strict", "compatible"]);
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
  maxEntityDeclarations: 256,
  maxEntityExpansionDepth: 16,
  maxEntityReplacementLength: 65536,
  maxExpandedXmlBytes: 33554432,
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

const validate = (values) => {
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
    if (!Number.isSafeInteger(values[name]) || values[name] < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }
  for (const name of BOOLEAN_SETTINGS) {
    if (typeof values[name] !== "boolean") {
      throw new TypeError(`${name} must be a boolean`);
    }
  }
  if (
    values.format !== undefined &&
    ((typeof values.format === "string" && values.format.length === 0) ||
      (typeof values.format !== "string" &&
        (typeof values.format !== "object" ||
          typeof values.format.key !== "string" ||
          values.format.key.length === 0 ||
          !Object.isFrozen(values.format))))
  ) {
    throw new TypeError("format must be a format key or OWLDocumentFormat");
  }
  if (
    values.signal !== undefined &&
    (typeof values.signal !== "object" ||
      typeof values.signal.aborted !== "boolean" ||
      typeof values.signal.addEventListener !== "function")
  ) {
    throw new TypeError("signal must implement the AbortSignal contract");
  }
};

export class OWLOntologyLoaderConfiguration {
  constructor(values = {}) {
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      throw new TypeError("loader configuration values must be an object");
    }
    for (const name of Object.keys(values)) {
      if (!ALLOWED_SETTINGS.has(name)) {
        throw new TypeError(`Unknown loader configuration setting: ${name}`);
      }
    }
    const normalizedValues = { ...values };
    if (normalizedValues.selectedGraph !== undefined) {
      normalizedValues.selectedGraph = snapshotRdfTerm(
        normalizedValues.selectedGraph,
      );
    }
    const merged = { ...DEFAULTS, ...normalizedValues };
    validate(merged);
    Object.assign(this, merged);
    Object.freeze(this);
  }

  static defaults() {
    return new OWLOntologyLoaderConfiguration();
  }

  with(changes) {
    return new OWLOntologyLoaderConfiguration({ ...this, ...changes });
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
