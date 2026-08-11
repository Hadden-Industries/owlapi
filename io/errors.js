const RESERVED_ERROR_FIELDS = new Set([
  "__proto__",
  "cause",
  "code",
  "constructor",
  "errors",
  "message",
  "name",
  "prototype",
  "stack",
]);

const copyKnownFields = (target, details) => {
  for (const [key, value] of Object.entries(details)) {
    if (value !== undefined && !RESERVED_ERROR_FIELDS.has(key)) {
      target[key] = value;
    }
  }
};

export class OWLAPIError extends Error {
  constructor(message, code, details = {}) {
    super(
      message,
      details.cause === undefined ? undefined : { cause: details.cause },
    );
    this.name = new.target.name;
    this.code = code;
    copyKnownFields(this, details);
  }
}

export class OWLParserError extends OWLAPIError {}

export class ParserMismatchError extends OWLParserError {
  constructor(message = "The parser does not recognize this syntax", details) {
    super(message, "PARSER_MISMATCH", details);
  }
}

export class OWLSyntaxError extends OWLParserError {
  constructor(message = "Invalid OWL syntax", details) {
    super(message, "OWL_SYNTAX_ERROR", details);
  }
}

export class XmlParseError extends OWLParserError {
  constructor(message = "The XML document could not be parsed", details) {
    super(message, "XML_PARSE_ERROR", details);
  }
}

export class UnsupportedConstructError extends OWLParserError {
  constructor(message = "Unsupported OWL construct", details) {
    super(message, "UNSUPPORTED_CONSTRUCT", details);
  }
}

export class ResourceLimitError extends OWLAPIError {
  constructor(message = "A resource limit was exceeded", details) {
    super(message, "RESOURCE_LIMIT_EXCEEDED", details);
  }
}

export class SecurityPolicyError extends OWLAPIError {
  constructor(
    message = "The operation violates the loading security policy",
    details,
  ) {
    super(message, "SECURITY_POLICY_VIOLATION", details);
  }
}

export class DocumentLoadError extends OWLAPIError {
  constructor(message = "The ontology document could not be loaded", details) {
    super(message, "DOCUMENT_LOAD_FAILED", details);
  }
}

export class MissingImportError extends DocumentLoadError {
  constructor(
    message = "An imported ontology document could not be resolved",
    details,
  ) {
    super(message, details);
    this.code = "MISSING_IMPORT";
  }
}

export class UnloadableImportError extends DocumentLoadError {
  constructor(
    message = "An imported ontology document could not be loaded",
    details,
  ) {
    super(message, details);
    this.code = "UNLOADABLE_IMPORT";
  }
}

export class OWLOntologyCreationError extends OWLAPIError {
  constructor(message = "The ontology could not be created", details) {
    super(message, "ONTOLOGY_CREATION_FAILED", details);
  }
}

export class AmbiguousRdfDatasetError extends OWLOntologyCreationError {
  constructor(
    message = "The RDF dataset contains more than one candidate graph",
    details,
  ) {
    super(message, details);
    this.code = "AMBIGUOUS_RDF_DATASET";
  }
}

export class GraphSelectionError extends OWLOntologyCreationError {
  constructor(
    message = "The requested RDF graph could not be selected",
    details,
  ) {
    super(message, details);
    this.code = "RDF_GRAPH_SELECTION_FAILED";
  }
}

export class OWLOntologyStateError extends OWLAPIError {
  constructor(message = "The ontology manager state is invalid", details) {
    super(message, "ONTOLOGY_STATE_INVALID", details);
  }
}

export class UnparsableOntologyException extends AggregateError {
  constructor(
    errors,
    message = "No eligible parser recognized the ontology document",
  ) {
    super(errors, message);
    this.name = "UnparsableOntologyException";
    this.code = "UNPARSABLE_ONTOLOGY";
  }
}
