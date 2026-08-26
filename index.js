export { OWLManager } from "./apibinding/index.js";
export { OWLDocumentFormats } from "./formats/index.js";
export {
  AmbiguousRdfDatasetError,
  DocumentLoadError,
  GraphSelectionError,
  MissingImportError,
  OWLAPIError,
  OWLOntologyCreationError,
  OWLOntologyStateError,
  OWLParserError,
  OWLSyntaxError,
  ParserMismatchError,
  ResourceLimitError,
  SecurityPolicyError,
  StringDocumentSource,
  UnloadableImportError,
  UnparsableOntologyException,
  UnsupportedConstructError,
  XmlParseError,
} from "./io/index.js";
export {
  ANNOTATION_VALUE_KINDS,
  AXIOM_KINDS,
  CLASS_EXPRESSION_KINDS,
  DATA_PROPERTY_EXPRESSION_KINDS,
  DATA_RANGE_KINDS,
  ENTITY_KINDS,
  INDIVIDUAL_KINDS,
  IRI,
  OBJECT_PROPERTY_EXPRESSION_KINDS,
  OWL_OBJECT_KINDS,
  OWLDataFactory,
  OWLDocumentFormat,
  OWLObjectKind,
  OWLOntology,
  OWLOntologyLoaderConfiguration,
  OWLOntologyManager,
  OWLStructuralObject,
  StructuralSet,
  dispatchAnnotationValue,
  dispatchAxiom,
  dispatchClassExpression,
  dispatchDataPropertyExpression,
  dispatchDataRange,
  dispatchIndividual,
  dispatchObjectPropertyExpression,
  dispatchOwlObject,
} from "./model/index.js";

// UNSUPPORTED(OWLAPI parity): Java OWLAPI exposes reasoner interfaces, but
// The initial 0.1 package provides no reasoner types, factories, or inferred-query
// facade. Reasoning is outside the accepted capability surface and cannot be added as a
// nominal API without selecting semantics/providers and conformance tests.
// Verification: capability `reasoner` (UNSUPPORTED_BY_DESIGN).

// TODO(OWLAPI parity): Java OWLAPI exposes OWLOntologyStorer and concrete
// serializer families. The initial 0.1 package deliberately has no
// `storeOntology` API; the private Phase 16 OwlToRdfTranslator provides semantic
// RDF/JS mapping without claiming a public RDF namespace or serialization format.
// Future storers require explicit format contracts, dependency/provenance
// review, and syntax-specific round-trip tests.
// Verification: capability `storer.concrete-serializers` (DEFERRED).
