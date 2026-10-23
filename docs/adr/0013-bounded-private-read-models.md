# Reuse bounded private reads of immutable ontology state

- Date: 23 October 2026.
- Status: implemented; exact provenance, rights and browser-integrity updates approved on 23 October 2026; local qualification complete with the Firefox launch limitation below.
- Owner: Maksym Shostak.
- Authority: WebVOWL PERF-DEC-014 Option A and the subsequent instruction, “Let's implement the audit’s recommendations, and that smaller, separate improvement.”
- Session: Codex `01a15c31-343a-72d2-ab3e-33461706b9e6`.
- Source baseline: `e113c3f5f42eca4c8611b2b6251cea90a1cfc583`, implemented on `perf/bounded-rdf-read-index` in a separate worktree.
  The existing main-checkout execution is not adopted.

## Decision and scope

Use existing ownership lifetimes to reuse derived read data privately.
The RDF translator gets a read view owned by one prepared input.
Its direct and matched quad sequences preserve their respective native orders; lazy subject/predicate buckets avoid repeated matched-dataset materialization across reconstruction passes.
The public RDF/JS DatasetCore interface remains unchanged.

The ontology façade and annotation short-form provider share a read model keyed by the committed immutable snapshot in a WeakMap.
It lazily derives axiom-kind buckets, structural-position buckets, annotation-aware/insensitive equivalence buckets, subject/property annotation candidates, and ordered signature/IRI buckets.
The model retains stored values, not query targets or arbitrary misses.
Public getters still return defensive collections.
Each imported query captures the current loaded closure and reads current member snapshots; no closure or aggregate result is cached under a root revision alone.

Structural comparison uses the existing trusted snapshot reader for its private axiom, annotation and import sequences.
This removes six public Set creations and six array copies per two-ontology comparison.
Anonymous-individual bijection search, mismatch paths, search-state accounting and storage losslessness checks remain authoritative.
Further comparison metadata caching and a primitive-to-axiom reference index require favorable measurements before selection.
Preserve-mode role-key reuse remains a diagnostic candidate.

## Why this scope

The real 25,996-quad W6 source originally caused 27,384 matched datasets and 528,029 materialized rows during an OWL load.
The initial private RDF read-view candidate reduces these to 3,511 and 77,987, with exact model/checkpoint/ranking hashes retained in the WebVOWL diagnostic.
Three untraced Node runs per variant corroborated lower model-open time; these are not browser latency acceptance.

A separate 300-class query fixture demonstrates 179,700 direct-array filter rows and 90,000 equality calls for declaration queries; six signature-kind getters perform 14,370 structural-object visits.
Three hundred labels over 600 axioms filter 180,000 rows.
The shared read model removes those repeated full-array filters and reduces the six signature queries to one 2,395-visit discovery.
Its exact ordered-output digest matches the original implementation.
Cold and repeated uninstrumented timings are retained separately from counters.

The common rule is derivation from immutable owned data, not a generic process-wide memoization service.
RDF input lifetime and committed ontology revision lifetime remain separate owners because their mutability and ordering contracts differ.

## Invariants and proof

| Scenario                   | Required evidence                                                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RDF iteration and recovery | Exact native direct/matched orders, shuffled triples, blank/named subject identity, parser corpus, strict/compatible/preserve behavior and cancellation.                                 |
| Read queries               | Stored result order, annotated variants, n-ary positions, structural equivalence across constructed objects, punning, ontology annotations and public-result mutation isolation.         |
| Revision and imports       | New snapshot after a committed edit; old returned values stay snapshots; current closure membership and changed imported revisions are observed without network acquisition.             |
| Labels                     | Property/language priorities, IRI/literal behavior, sorting across each whole root closure before root concatenation, repeated roots and current provider membership.                    |
| Comparison                 | Same equality/mismatch and search-limit outcomes, symmetric anonymous fixtures, no public collection getter calls from the private adapter, unchanged storage round trips.               |
| Cost and lifetime          | Reduced work counts with equal output hashes; cold/warm diagnostics; lazy index storage bounded by snapshot contents and fixed internal query shapes; retired-snapshot collection probe. |

Focused tests exercise the public façade and the private immutable read interface.
The owner waived the final AGY review on 23 October 2026 and instructed that sufficient existing evidence be reused without additional HISEW bookkeeping runs.
This waiver does not convert failed or unavailable checks into passes.
No package release, dependency adoption, merge, deployment or final browser acceptance is implied by this ADR.

The corrected candidate passed 16,382 tests in 278 suites, with 26 existing skips.
Architecture checks and native packaging/installed-consumer checks pass.
The private position index uses field names directly after final lint identified unnecessary JSON key encoding; no policy exception was added.
The owner approved the six browser integrity entries, and native fixture preparation now matches the reviewed map.
All six Chromium and WebKit consumer checks pass, covering the bundler, native import map and bundled DedicatedWorker.
All three Firefox checks fail before test execution because the installed Firefox 157 cannot launch (`spawn UNKNOWN`), the same host limitation previously recorded in WebVOWL UI qualification.
The failed receipt is retained; Firefox qualification remains open for a functioning runner.
The final native package candidate has SHA-256 `d0f81d8c764bed44ecdc34dabe07f330929a2e21c07264414fd94f7f60573083`, 198 files, equivalent locked/lockless dependency graphs, six passing installed-consumer scripts and no high/critical production audit findings.
These results authorize source delivery within the existing task; they do not establish final application latency or platform acceptance.

## Exact metadata proposal

The implementation adds two private production modules: `internal/mapping/rdfReadView.js` and `internal/model/ontologyReadModel.js`.
Their original implementation needs current provenance records; they must not inherit an older phase's approval date.

The owner explicitly approved these exact changes on 23 October 2026:

1. `docs/provenance/provenance.json`: add decision reference `BOUNDED-READS-2026-10-23`; add project-original implementation records for those two modules, classified under the existing RDF-mapping and model layers; append this ADR and focused proof references to the four modified existing module records.
   Preserve their original decisions, Java reference pins, legacy dispositions and historical phase changes.
   The new records identify earlier Java pins only as historical contract context, not fresh native Java qualification.
2. `docs/provenance/rights-inventory.json`: refresh only `package.scopeAuthority.fileCount`, `package.scopeAuthority.sourceManifestSha256` and the dependent `review.factsSha256` from the final native npm pack scope and source bytes, using the existing digest routine.
   Keep the review pending and all rights, licence, contributor and dependency dispositions unchanged.
3. `test/consumers/browser/import-map/reference-import-map.json`: refresh the SHA-384 integrity entries for the two new private modules and four changed production modules.
   Native generation confirms that imports, scopes and dependency URLs are unchanged.

`governance.test.js` must include `rdfReadView.js` in its exact phase-5 module list; this is coverage of the new module, with no assertion removed or policy weakened.
No dependency, lockfile, package exports, build, lint, CI or resource-limit setting is changed by this implementation.
WebVOWL adoption of an exact immutable OWLAPI commit remains a separate package-selector approval.
