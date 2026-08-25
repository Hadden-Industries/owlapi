# owlapi-js migration

This directory contains the executable governance and delivery records for the
`owlapi-js` migration described by `docs/owlapi-js/implementation-plan.md`.
`owlapi-js` remains the historical WebVOWL staging/path name; the final public
npm package is `owlapi`, maintained only in
`https://github.com/Hadden-Industries/owlapi` after extraction. The
implementation plan remains the highest-authority normative document.

Authoritative machine-readable records:

- `compatibility/capabilities.json`: `REQUIRED_V1` migration-capability and
  release-status matrix; the historical label is not an npm major-version promise.
- `performance/resource-budgets.json`: finite resource limits and benchmark policy.
- `performance/benchmark-corpus.json`: pinned real-world and generated benchmark inputs.
- `provenance/provenance.json`: legacy-source dispositions, new-module
  provenance records, and recorded compatibility research.
- `conformance/suites.json`: pinned external standards and behavioural references.
- `conformance/classification-manifests.json`: exhaustive upstream-test classification gate.
- `conformance/rdf-to-owl-mapping.json`: finite, evidenced W3C reverse-mapping
  inventory for Tables 4 through 18.
- `conformance/owl-to-rdf-mapping.json`: exhaustive canonical structural-model
  to RDF/JS mapping inventory completed in Phase 16.
- `conformance/krss-corpus-register.json`: strict separation of KRSS fixture
  classes and the verified zero qualifying historical-corpus result.
- `compatibility/krss1-behavioral-oracle.json`: finite pinned Java observations
  and controlled KRSS1 compatibility decisions.
- `compatibility/expected-differences.json`: exact Java/JavaScript differential exceptions.
- `dependency-governance.json`: selected dependency authority, risk, licence, and replacement records.
- `ontology-lifecycle-capability-implementation-plan.md`: the separate
  imports-closure, mutation, merger, and storage feature programme that begins
  only after the verified public production cutover—normally `owlapi@0.1.0`—and
  normally targets the next zero-minor feature line, `owlapi@0.2.0`.
- `w3c-test-conformance-reporting-implementation-plan.md`: the independent
  post-release programme for complete versioned W3C result ledgers, EARL
  generation, and appropriately disclosed upstream implementation-report
  submissions; it is not a gate for `owlapi@0.1.0`, its recorded cutover patch,
  or WebVOWL's package cutover.
- `compatibility/standalone-import-closure-prerequisites.md`: the bounded
  Java-compatible library surface required by the external consumer contract.

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
`ontologyConverter.js` and `jsonExporter.js` remained unmoved through Phase 17
for finite characterization work and were proven unreachable from production
by `src/productionGraph.architecture.test.js` and bundle inspection. All 44
advertised corpus documents load through the production entry, and the corpus
differential required by sections 17.15 and 18.8 now runs that entry rather
than the pre-cutover pipeline, with every remaining difference justified
per dimension in `compatibility/production-corpus-differences.json`.

Phase 9 adds strict Turtle through one private, exact-format N3.js adapter. The
dependency is loaded only after exact RDF syntax selection and emits only
project-owned canonical RDF/JS values and errors across the seam. All 387
independently classified W3C RDF 1.1 and RDF 1.2 Turtle entries pass, N3-only
constructs stay rejected, RDF 1.2 triple terms reach the explicit OWL
reconstruction boundary, prefixes remain immutable document metadata, and
direct/imported Turtle flows through the production WebVOWL entry.

Phases 10 and 11 add independently authored structural DL Syntax and KRSS2
parsers. Phases 12 and 13 extend the same private N3.js boundary with distinct
strict N-Triples and N-Quads identities. All 99 independently classified
N-Triples entries and all 114 independently classified N-Quads entries from the
W3C RDF 1.1 and RDF 1.2 suites are independently classified and all REQUIRED
entries pass. N-Triples normalizes every statement to the default graph;
N-Quads and TriG preserve complete dataset graph terms and apply the configured
graph policy only before shared RDF-to-OWL reconstruction. TriG additionally
preserves Turtle-style prefixes and base resolution. Selected graphs and
explicit graph loss remain document context rather than OWL axiom state.
Turtle, N-Triples, N-Quads, and TriG share only private syntax machinery and
the project-owned RDF/JS-to-OWL publication seam. The broader N3 language
remains unregistered. Phase 18 physically deletes the already
production-unreachable legacy files without changing this ingestion graph.
Entry-aware production chunking and a post-build static-import-closure verifier
prove that N3.js remains outside the application's initial graph.

Phase 14 completes strict TriG, Phase 15 completes JSON-LD ingestion through
Digital Bazaar `jsonld.js`, Phase 16 completes the exhaustive shared OWL-to-RDF
translator, and Phase 17 completes the distinct original KRSS/KRSS1 parser.
KRSS1 and KRSS2 now use separate adapters over bounded shared machinery;
generic `.krss` ambiguity is KRSS1-first while exact `.krss2` and KRSS2-only
vocabulary remain KRSS2. The strict provenance review found zero qualifying
public first-party historical KRSS1/KRSS2 ontology artifacts, so project
grammar fixtures, adjacent dialects, extended-KRSS negatives, converted real
ontologies, and any future qualifying historical corpus remain separate
evidence classes.

Phase 18 removes the pre-cutover parser/converter/exporter stack and its
legacy-only executable differentials. The production corpus gate, pinned Java
OWL2VOWL fixtures, and all current `owlapi-js` parser evidence remain. Provenance
schema v4 retains deleted-artifact history and approved revision-bounded reuse
decisions while distinguishing them from the live source inventory.

Phase 19 extracts the accepted Phase 18 source into the sole canonical
`Hadden-Industries/owlapi` repository and publishes the useful
`0.1.0-alpha.0` artefact under `next`; Phase 20 qualifies the same capability
family as production-recommended initial-development `0.1.0` and proves
WebVOWL consumes that exact public npm package (or only the recorded
same-surface cutover patch if a defined contingency is activated).
The Public API Surface Registry created during extraction is the package/type
gap map against pinned Java OWLAPI. Except for the curated bare `owlapi`
aggregate, every public npm subpath must map exactly to a separately approved
`org.semanticweb.owlapi` package. Each public binding has one canonical
definition in that Java-shaped source namespace, while private engines use
cohesive, non-mirrored `internal/` directories. The staging RDF barrel is not a
published `owlapi/rdf` API.

ADR 0002 prioritizes the shared RDF-to-OWL foundation, RDF/XML, early
development-app integration, production cutover, and strict Turtle before the
remaining parser programme. The current phase table is recorded in
`migration/migration-status.md`. No next phase begins until the preceding phase
passes its gate, receives its requested Git checkpoint, and the repository
owner explicitly instructs the implementation to proceed.
