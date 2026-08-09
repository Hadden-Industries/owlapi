export { rdfDataFactory, rdfDatasetFactory } from "./environment.js";
export { selectOntologyGraph } from "./graphPolicy.js";

// TODO(OWLAPI parity): RdfToOwlTranslator/OWLRDFConsumer behavior is not part
// of the Phase 1 RDF/JS boundary. No quad is currently interpreted as an OWL
// axiom. Phase 8 adds one shared, resource-bounded W3C RDF-to-OWL mapping after
// the first real RDF adapters establish evidence in Phase 7. Verification:
// capability `mapping.rdf-to-owl` and its structural differential fixtures.

// TODO(OWLAPI parity): OwlToRdfTranslator is deferred to Phase 11. The current
// subpath cannot serialize or map structural OWL objects to quads, and concrete
// storers remain separately deferred. Implement exhaustive kind dispatch from
// the W3C OWL-to-RDF mapping with graph-equivalence/round-trip tests.
// Verification: capability `mapping.owl-to-rdf`.
