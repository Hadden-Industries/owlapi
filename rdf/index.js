export { rdfDataFactory, rdfDatasetFactory } from "./environment.js";
export { selectOntologyGraph } from "./graphPolicy.js";
export { RdfToOwlTranslator } from "./rdfToOwlTranslator.js";

// TODO(OWLAPI parity): OwlToRdfTranslator is deferred to Phase 16. The current
// subpath cannot serialize or map structural OWL objects to quads, and concrete
// storers remain separately deferred. Implement exhaustive kind dispatch from
// the W3C OWL-to-RDF mapping with graph-equivalence/round-trip tests.
// Verification: capability `mapping.owl-to-rdf`.
