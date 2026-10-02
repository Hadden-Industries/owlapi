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
  OWLOntologyStorageError,
  OWLParserError,
  OWLSyntaxError,
  OWLStorerNotFoundError,
  ParserMismatchError,
  ResourceLimitError,
  RDFParserMetaData,
  RDFOntologyHeaderStatus,
  SecurityPolicyError,
  StringDocumentSource,
  StringDocumentTarget,
  UnloadableImportError,
  UnparsableOntologyException,
  UnsupportedConstructError,
  XmlParseError,
} from "./io/index.js";
export {
  AddOntologyAnnotation,
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
  SetOntologyID,
  dispatchAnnotationValue,
  dispatchAxiom,
  dispatchClassExpression,
  dispatchDataPropertyExpression,
  dispatchDataRange,
  dispatchIndividual,
  dispatchObjectPropertyExpression,
  dispatchOwlObject,
} from "./model/index.js";
export {
  OWLOntologyImportsClosureSetProvider,
  OWLOntologyMerger,
} from "./util/index.js";
export { OWL2DLProfile, OWLProfileReport } from "./profiles/index.js";

// UNSUPPORTED(OWLAPI parity): Java OWLAPI exposes reasoner interfaces, but
// The initial 0.1 package provides no reasoner types, factories, or inferred-query
// facade. Reasoning is outside the accepted capability surface and cannot be added as a
// nominal API without selecting semantics/providers and conformance tests.
// Verification: capability `reasoner` (UNSUPPORTED_BY_DESIGN).

// Java-compatible storage is selected through manager.saveOntology with an
// explicit Functional Syntax or RDF/XML format and StringDocumentTarget.
// Concrete storers and the shared RDF mapping engine remain package-private.
// Other serializer families and public storer registration remain deferred.
// Verification: capabilities `storer.functional`, `storer.rdfxml`, and
// `manager.save-ontology`; installed import-closure round-trip tests.
