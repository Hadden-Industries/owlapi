# Phase 15 JSON-LD lesson record

## Migration identity

- Migration: Phase 15 - JSON-LD.
- Baseline revision: `0ad02561`, the signed Phase 14 checkpoint commit.
- Completion revision: the Phase 15 checkpoint commit containing this record;
  the repository owner requested an uncommitted review pause before assigning
  its commit ID.
- Implementation date: 22 August 2026.
- Next migration: Phase 16 - shared OWL-to-RDF translator.

## Implemented scope

Phase 15 registers JSON-LD as the final ontology-ingestion format. The adapter
lazy-loads Digital Bazaar jsonld.js's browser-safe ESM distribution, invokes
`toRDF()` without an N-Quads format, normalizes the resulting terms into the
project RDF/JS factories, and hands the complete dataset to the established
graph-policy and RDF-to-OWL seams. Immutable top-level `@context` values remain
document metadata rather than OWL semantics.

JSON-LD processor options are exposed through the immutable
`OWLDocumentFormat` parameter seam rather than through WebVOWL-specific parser
arguments. Phase 15 supports JSON-LD 1.0 and 1.1 processing modes, inline and
externally loaded expansion contexts, both standardized RDF-direction
representations, and canonical `rdf:JSON` lexical forms required by the JCS
cases. A small, isolated JSON-LD 1.0 compatibility module covers only the
version-specific context and list rules removed from jsonld.js 9; general
expansion and context processing remain delegated to jsonld.js.

Remote contexts remain default-deny. When explicitly enabled, jsonld.js can
reach only the manager's injected loader facade. The facade validates schemes,
credentials, loopback/private/link-local/metadata targets, final redirects,
byte and redirect ceilings, timeout, and cancellation. It never falls back to
global `fetch` or jsonld.js's Node/XHR loaders.

## Acceptance evidence

| Gate                    | Result                                                                                                                                    | Primary evidence                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Direct RDF/JS boundary  | `toRDF()` returns terms directly; no N-Quads serialization/reparse exists                                                                 | `jsonLdSyntaxAdapter.js`; `jsonLdSyntaxAdapter.test.js`               |
| Remote-context security | Default deny, injected enablement, SSRF/redirect/byte/time/cancellation controls                                                          | `jsonLdSyntaxAdapter.resource.test.js`; `jsonLdSyntaxAdapter.test.js` |
| Format selection        | Exact media type is authoritative; keyword sniffing is conservative; JSON cannot be stolen by TriG                                        | `jsonLd.test.js`; `trig.test.js`                                      |
| Processor profiles      | Immutable format parameters cover JSON-LD 1.0/1.1, expansion context, and RDF direction; JCS output is canonical                          | `io.test.js`; `jsonLdSyntaxAdapter.test.js`                           |
| W3C conformance         | All 521 upstream cases classified; all 462 REQUIRED to-RDF cases pass                                                                     | `w3c-jsonld.json`; `jsonLd.conformance.test.js`                       |
| RDF graph policy        | Ambiguity, default-only, selected-graph, and merge behavior operate on JSON-LD named graphs                                               | `jsonLd.test.js`                                                      |
| Imports                 | JSON-LD imports reuse the manager loader while context requests carry a distinct purpose                                                  | `jsonLd.test.js`                                                      |
| Structural differential | Equivalent JSON-LD and RDF/XML produce equal structural axiom keys                                                                        | `jsonLd.differential.test.js`                                         |
| Browser/lazy boundary   | Browser-safe ESM works without Node globals and remains outside the initial production closure                                            | `jsonLd.browser.test.js`; `verify-webvowl-lazy-parser-chunks.mjs`     |
| Performance             | Syntax/end-to-end and Functional controls pass; 1/4/16 MiB mismatch medians pass the executable relative-or-64-KiB bounded-detection gate | `performance/baseline.md`; `benchmark-owlapi-jsonld.mjs`              |
| Provenance              | Four production modules and both W3C manifests are recorded against exact public revisions                                                | `provenance/provenance.json`; `governance.test.js`                    |

## Findings and dispositions

| ID        | Applicability                      | Primary disposition      | Finding                                                                                                                                                                                                                                             |
| --------- | ---------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `M15-001` | `RDF_ADAPTER`, `SECURITY`          | `TEST_OR_FITNESS_UPDATE` | Supplying a custom loader is insufficient unless it is passed on every processor call; otherwise jsonld.js retains ambient platform loading.                                                                                                        |
| `M15-002` | `RDF_ADAPTER`, `PACKAGING`         | `PLAYBOOK_UPDATE`        | The package root selects Node platform code under direct ESM resolution. The published browser-safe ESM distribution is the stable lazy seam.                                                                                                       |
| `M15-003` | `RDF_ADAPTER`, `COMPATIBILITY`     | `TEST_OR_FITNESS_UPDATE` | JSON braces overlap TriG graph blocks. Exact media type and a JSON strong-negative prevent incorrect parser ownership.                                                                                                                              |
| `M15-004` | `RDF_ADAPTER`, `RDF_MAPPING`       | `TEST_OR_FITNESS_UPDATE` | Older processor output can contain null or ill-formed RDF terms; well-formed-statement filtering belongs at RDF/JS normalization.                                                                                                                   |
| `M15-005` | `RDF_ADAPTER`, `PROVENANCE`        | `PLAYBOOK_UPDATE`        | To-RDF and from-RDF share one public suite but have different applicability; both inventories must remain explicitly classified.                                                                                                                    |
| `M15-006` | `RDF_ADAPTER`, `COMPATIBILITY`     | `NO_CHANGE`              | Three pinned cases expose exact jsonld.js 9.0.0 gaps and remain individually excluded rather than prompting local expansion reimplementation.                                                                                                       |
| `M15-007` | `PERFORMANCE`, `TESTING`           | `NO_CHANGE`              | Promise-based JSON-LD processing is not cooperatively streaming; measured synchronous delay is recorded without weakening existing limits.                                                                                                          |
| `M15-008` | `API_COMPATIBILITY`, `RDF_ADAPTER` | `TEST_OR_FITNESS_UPDATE` | WebVOWL's currently exposed controls cannot define the reusable parser API ceiling; standardized processor options belong on immutable document formats.                                                                                            |
| `M15-009` | `RDF_ADAPTER`, `COMPATIBILITY`     | `TEST_OR_FITNESS_UPDATE` | jsonld.js 9 no longer implements several exact JSON-LD 1.0 rules or the compound-literal RDF-direction form; narrow standards modules can bridge those deltas without becoming a second general JSON-LD processor.                                  |
| `M15-010` | `RDF_ADAPTER`, `COMPATIBILITY`     | `TEST_OR_FITNESS_UPDATE` | The W3C `useJCS` cases express an output invariant, not a distinct ingestion mode; canonical `rdf:JSON` lexical values are therefore required unconditionally and protected by focused tests.                                                       |
| `M15-011` | `PERFORMANCE`, `TESTING`           | `PLAYBOOK_UPDATE`        | A percentage-only regression gate becomes unstable for a tens-of-kilobytes mismatch signal; the approved general policy retains the 20% wall limit and requires relative heap compliance or a fixed 64 KiB ceiling proven across 1/4/16 MiB inputs. |

## Conformance disposition

The pinned W3C JSON-LD API revision is
`ffdb326121ea89b7b8280e76a5caea923834bcef`. Its 467 to-RDF entries contain 462
`REQUIRED` cases, all passing. This includes the JSON-LD 1.0 processing-mode,
external expansion-context, both RDF-direction, and JCS cases formerly excluded
as alternate processor profiles. Two cases remain `EXCLUDED_WITH_REASON`
because generalized RDF predicates cannot be represented by the OWL ingestion
model. Three additional entries (`c037`, `c038`, and `er56`) record exact
jsonld.js 9.0.0 behavior gaps. The 54 from-RDF entries are all
`NOT_APPLICABLE`: Phase 15 is ingestion, not JSON-LD serialization.

## Performance and dependency impact

The initial accepted run converted the 4,888,891-byte, 50,000-declaration
fixture to RDF/JS in 195.15 ms median and completed end-to-end in 2,780.03 ms.
After the processor-profile correction and executable gate update, those
medians were 189.33 ms and 1,389.59 ms respectively, with no resource-limit
breach; the same-revision Functional control remained within the ordinary
relative limits.

Two earlier correction runs measured 51,616 and 53,016 bytes for the 16 MiB
mismatch heap delta. They remain recorded as the evidence for the approved
general low-denominator policy rather than being discarded. The final gated
1 MiB, 4 MiB, and 16 MiB scaling medians were 41,760, 37,016, and 38,728 bytes,
all below the fixed 65,536-byte ceiling. The 16 MiB result also passes the
accepted Phase 14 relative wall and heap limits, so the automated pair-and-scale
decision is green; the preceding implementation-validation run passed as well.

The production verifier measures a 204,727-byte minified / 50,201-byte gzip
lazy JSON-LD closure and proves it is absent from the initial static closure.

Phase 15 adds no package, lockfile, build-configuration, production resource
ceiling, or legacy-production-reachability change. It adds the approved general
bounded-detection materiality rule to the performance policy and executable
benchmark helper; valid parsing and reconstruction retain their ordinary
relative budgets. The already governed `jsonld` dependency is now exercised
through its restricted adapter.

## Impact on Phase 16

The ingestion programme is complete. Phase 16 should implement structural OWL
to RDF/JS independently with exhaustive model dispatch and graph-equivalence
tests. It must not turn the Phase 15 from-RDF non-applicability classification
into an implicit JSON-LD serializer promise.

## Unresolved questions

There are no unresolved Phase 15 blockers. The three jsonld.js 9.0.0 exclusions
should be reevaluated on dependency upgrade. The two generalized-RDF exclusions
are a deliberate OWL-ingestion boundary, not missing processor controls. Neither
category weakens the 462 passing required cases.

## Mechanically reviewable completion summary

- Migration: Phase 15 JSON-LD.
- Lesson record: `docs/owlapi-js/migration/lessons/014-jsonld.md`.
- Finding IDs: `M15-001` through `M15-011`; every finding has exactly one
  primary disposition.
- Playbook changed: yes; Phase 15 evidence is institutionalized and the next
  migration section advances to Phase 16.
- Executable protections added: direct RDF/JS conversion, injected restricted
  contexts, redirect/resource/cancellation enforcement, authoritative media
  type, immutable JSON-LD processor parameters, JSON-LD 1.0 and 1.1 behavior,
  expansion contexts, RDF direction, canonical `rdf:JSON`, JSON/TriG ambiguity
  protection, graph policies, import integration, complete W3C classification,
  browser-safe lazy loading, structural differential, bundle verification, and
  same-revision performance evidence.
- Normative change applied: finding `M15-011` adds the repository-owner-approved
  bounded parser-selection materiality rule to implementation-plan §20.6.
- Resource-budget or regression-threshold changes: valid workloads retain the
  20% relative threshold; designated bounded mismatch signals add a 64 KiB
  absolute heap alternative with mandatory 1/4/16 MiB scaling evidence.
- Unresolved blockers: none.
- Next migration: Phase 16, blocked until the repository owner creates the
  requested Phase 15 checkpoint commit and explicitly says to proceed.
