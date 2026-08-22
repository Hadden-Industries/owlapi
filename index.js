export * from "./io/index.js";
export * from "./manager/index.js";
export * from "./model/index.js";

// UNSUPPORTED(OWLAPI parity): Java OWLAPI exposes reasoner interfaces, but
// owlapi-js v1 provides no reasoner types, factories, or inferred-query facade.
// Reasoning is outside the initial WebVOWL extraction and cannot be added as a
// nominal API without selecting semantics/providers and conformance tests.
// Verification: capability `reasoner` (UNSUPPORTED_BY_DESIGN).

// TODO(OWLAPI parity): Java OWLAPI exposes OWLOntologyStorer and concrete
// serializer families. owlapi-js v1 deliberately has no `storeOntology` API;
// the Phase 16 OwlToRdfTranslator provides semantic RDF/JS mapping through the
// `owlapi-js/rdf` boundary without claiming a concrete serialization format.
// Future storers require explicit format contracts, dependency/provenance
// review, and syntax-specific round-trip tests.
// Verification: capability `storer.concrete-serializers` (DEFERRED).
