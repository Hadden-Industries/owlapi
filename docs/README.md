# owlapi-js migration

This directory contains the executable governance and delivery records for the
`owlapi-js` extraction described by `docs/owlapi-js/implementation-plan.md`.
The implementation plan remains the highest-authority normative document.

Authoritative machine-readable records:

- `compatibility/capabilities.json`: v1 capability and release-status matrix.
- `performance/resource-budgets.json`: finite resource limits and benchmark policy.
- `performance/benchmark-corpus.json`: pinned real-world and generated benchmark inputs.
- `provenance/provenance.json`: legacy-source dispositions, new-module
  provenance records, and recorded compatibility research.
- `conformance/suites.json`: pinned external standards and behavioural references.
- `conformance/classification-manifests.json`: exhaustive upstream-test classification gate.
- `conformance/rdf-to-owl-mapping.json`: finite, evidenced W3C reverse-mapping
  inventory for Tables 4 through 18.
- `compatibility/expected-differences.json`: exact Java/JavaScript differential exceptions.
- `dependency-governance.json`: selected dependency authority, risk, licence, and replacement records.

Repository implementation conventions are frozen in `engineering-conventions.md`.
The isolated Java structural reference harness lives under
`util/owlapi-reference/`; it is development evidence, never a production
runtime dependency.

Delivery records live under `migration/`. Historical lesson records preserve
evidence; `migration/parser-migration-playbook.md` is the concise current method.

Phases 1 through 5 provide the independently authored structural model,
factory, ontology, manager/loading foundation, source/configuration/error
contracts, parser-selection infrastructure, RDF/JS dataset boundary, and the
complete Functional Syntax, Manchester Syntax, OWL/XML, dataset graph-policy,
and shared RDF-to-OWL migrations with their conformance, differential,
resource/performance, provenance, and learning-gate evidence.

Phase 6 adds the RDF/XML adapter and the first-real-adapter hardening. Phase 7
adds `VOWLBuilder`, the WebVOWL import resolver, and an explicitly
development-only invocation seam, with exact Java and legacy differential
evidence.

Phase 8 performed the production cutover and closed at `136a62a`. WebVOWL
ingests ontologies only through `owlapi-js`, the development seam is removed,
and there is no runtime legacy fallback. The legacy parsers,
`ontologyConverter.js` and `jsonExporter.js` remain unmoved for
characterization and are proven unreachable from production by
`src/productionGraph.architecture.test.js` and by bundle inspection. All 44
advertised corpus documents load through the production entry, and the corpus
differential required by sections 17.15 and 18.8 now runs that entry rather
than the retained legacy pipeline, with every remaining difference justified
per dimension in `compatibility/production-corpus-differences.json`.

Phase 9 adds strict Turtle through one private, exact-format N3.js adapter. The
dependency is loaded only after Turtle selection and emits only project-owned
canonical RDF/JS values and errors across the seam. All 387 independently
classified W3C RDF 1.1 and RDF 1.2 Turtle entries pass, N3-only constructs stay
rejected, RDF 1.2 triple terms reach the explicit OWL reconstruction boundary,
prefixes remain immutable document metadata, and direct/imported Turtle now
flows through the production WebVOWL entry. N-Triples, N-Quads, TriG, and the
broader N3 language remain unregistered. The legacy Turtle files remain
unmoved and production-unreachable until the Phase 17 deletion. Entry-aware
production chunking and a post-build static-import-closure verifier prove that
N3.js remains outside the application's initial graph.

ADR 0002 prioritizes the shared RDF-to-OWL foundation, RDF/XML, early
development-app integration, production cutover, and strict Turtle before the
remaining parser programme. The current phase table is recorded in
`migration/migration-status.md`. No next phase begins until the preceding phase
passes its gate, receives its requested Git checkpoint, and the repository
owner explicitly instructs the implementation to proceed.
