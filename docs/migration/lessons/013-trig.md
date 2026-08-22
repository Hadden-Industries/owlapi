# Phase 14 TriG lesson record

## Migration identity

- Migration: Phase 14 - TriG.
- Baseline revision: `82b4770c`, the signed Phase 13 checkpoint commit.
- Completion revision: the Phase 14 checkpoint commit containing this record;
  the repository owner requested an uncommitted review pause before assigning
  its commit ID.
- Implementation date: 22 August 2026.
- Next migration: Phase 15 - JSON-LD.

## Implemented scope

Phase 14 registers TriG as an independent strict RDF dataset format. Its private
N3.js policy selects exact `TriG` parsing while preserving prefix/base state and
complete RDF/JS graph terms. Parsed datasets pass through the existing explicit
`requireSingleGraph`, `defaultGraphOnly`, `selectGraph`, or `mergeGraphs` policy
before shared RDF-to-OWL reconstruction.

The bounded descriptor recognizes graph-block opening braces only outside
comments, strings, and IRI references. It does not duplicate the TriG grammar,
claim ordinary Turtle or N-Quads, or expose the dependency's broader Notation3
language. Exact media-type selection remains authoritative.

The complete selected W3C RDF 1.1 and RDF 1.2 inventory is retained. All 401
`REQUIRED` cases pass. Seventeen RDF 1.2 reifier/annotation evaluation cases
remain individually visible as `EXCLUDED_WITH_REASON` because pinned N3.js
2.2.0 cannot reproduce their expected datasets. This is a governed dependency
capability gap, not an assertion that those cases conform.

## Acceptance evidence

| Gate                    | Result                                                                                                                         | Primary evidence                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Exact syntax identity   | `application/trig` selects exact N3.js `TriG` mode, preserves prefixes and graph terms, and rejects broad N3 implications       | `n3SyntaxAdapter.test.js`; `trig.test.js`                           |
| W3C conformance         | Complete 418-entry inventory retained; all 401 REQUIRED entries pass and 17 RDF 1.2 dependency gaps are individually governed  | `w3c-trig.json`; `trig.conformance.test.js`                         |
| RDF/JS graph policy     | All four policies run over parsed graph blocks with explicit selection, merge, and loss behavior                               | `trig.test.js`; `rdfGraphPolicy.test.js`                            |
| Dataset identity        | Equal blank-node labels retain dataset-scoped RDF/JS identity across graph blocks                                               | `trig.test.js`                                                      |
| Resources/security      | Quad, blank-node, token, timeout, pre-abort, and in-flight-abort budgets remain governed                                        | `trig.resource.test.js`                                             |
| Structural differential | Selected TriG data agrees with equivalent RDF/XML on structural keys and signature                                              | `trig.differential.test.js`                                         |
| Production integration  | Direct, detected, imported, and VOWL loads use the new parser without weakening Turtle, N-Triples, or N-Quads                   | `trig.test.js`; `productionGraph.architecture.test.js`              |
| Browser/lazy boundary   | Exact TriG runs without Node globals and reuses the byte-identical lazy N3.js production boundary                               | `trig.browser.test.js`; `verify-webvowl-lazy-parser-chunks.mjs`     |
| Performance             | Syntax, end-to-end, and same-revision registry signals pass without changing the 20% threshold                                 | `performance/baseline.md`; `benchmark-owlapi-trig.mjs`              |
| Provenance              | Both production modules and all three W3C source manifests are recorded against exact public sources and repository revisions | `provenance/provenance.json`; `governance.test.js`                  |

## Findings and dispositions

| ID        | Applicability                           | Primary disposition      | Finding                                                                                                                                                                                                 |
| --------- | --------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `M14-001` | `RDF_ADAPTER`, `COMPATIBILITY`          | `PLAYBOOK_UPDATE`        | TriG needs an exact implementation policy even though it shares Turtle productions and the N3.js dependency; permissive Turtle or N-Quads modes do not preserve its public syntax identity.              |
| `M14-002` | `RDF_ADAPTER`, `COMPATIBILITY`          | `TEST_OR_FITNESS_UPDATE` | Graph-block detection must ignore braces inside comments, strings, and IRI references, and defer full validation to the strict parser rather than embedding a second grammar in descriptor code.         |
| `M14-003` | `RDF_ADAPTER`, `RDF_MAPPING`            | `TEST_OR_FITNESS_UPDATE` | Prefix/base events and named graph terms are both syntax output. They must survive the private boundary until graph policy chooses the RDF graph reconstructed as OWL.                                   |
| `M14-004` | `RDF_ADAPTER`, `PROVENANCE`             | `PLAYBOOK_UPDATE`        | A complete corpus register may contain a dependency capability gap. Every excluded entry needs a stable identity, category, reason, upstream artifact, and governance assertion; aggregate omission is insufficient. |
| `M14-005` | `RDF_ADAPTER`, `COMPATIBILITY`          | `TEST_OR_FITNESS_UPDATE` | A dependency capable of broad Notation3 does not authorize that public format. An implication-form test keeps the intended unsupported boundary executable.                                              |
| `M14-006` | `RDF_ADAPTER`, `TESTING`                | `TEST_OR_FITNESS_UPDATE` | RDF 1.1 syntax, RDF 1.2 syntax, and RDF 1.2 evaluation manifests require separately archived hashes; duplicated upstream test names need deterministic suite-qualified identities.                        |
| `M14-007` | `PERFORMANCE`, `TESTING`                | `NO_CHANGE`              | TriG reuses the existing lazy dependency closure, remains cooperatively bounded, and leaves the 65,536-byte chunk, resource ceilings, and regression threshold unchanged.                                |

## Normative and test-corpus grounding

The conformance register embeds the complete selected TriG entries from W3C
`rdf-tests` revision `12774b0ebb385d17651b396654b19254d0fefbfa`. It archives
the RDF 1.1 manifest, RDF 1.2 syntax manifest, and RDF 1.2 evaluation manifest
with independent SHA-256 identities. The resulting 418-entry register contains
169 evaluation, 123 positive-syntax, and 126 negative-syntax cases.

All 401 `REQUIRED` entries pass. The 17 `EXCLUDED_WITH_REASON` entries are the
enumerated RDF 1.2 evaluation cases whose reifier or annotation result cannot
be reproduced by N3.js 2.2.0. Governance fixes their count, category, source
suite, reason code, artifact references, and classification so a dependency
upgrade cannot silently expand or shrink the gap.

## Performance and dependency impact

The 50,000-declaration TriG fixture contains 1,089,023 bytes in one named graph.
At the retained 65,536-byte default, syntax-to-RDF completes in 839.42 ms with
a 70.77 ms maximum sampled event-loop delay. The end-to-end path, including
single-graph selection and RDF-to-OWL publication, completes in 3,659.37 ms.
Same-revision Functional and mismatch registry controls stay below the
unchanged 20% threshold.

Phase 14 adds no dependency, package, lockfile, build configuration,
resource-ceiling, regression-threshold, or legacy-production-reachability
change. The initial closure measures 673,648 minified and 169,955 gzip bytes;
the lazy RDF-syntax closure remains exactly 187,021 minified and 52,560 gzip
bytes, with N3.js absent from the initial static closure.

## Impact on Phase 15

JSON-LD should publish into the same canonical RDF/JS dataset and explicit
graph-policy boundary, but it must retain a format-specific restricted-loader
contract. Phase 15 must independently govern remote-context behavior,
conformance classification, lazy browser loading, resource limits, and import
integration rather than inheriting TriG evidence.

## Unresolved questions

There are no unresolved Phase 14 implementation blockers and no unfinished
`LOCAL_PHASE_FOLLOW_UP`. The 17 RDF 1.2 evaluation exclusions remain a governed
N3.js 2.2.0 capability limitation. They should be re-evaluated on a future
dependency upgrade, but do not weaken the supported RDF 1.1 TriG capability or
the 401 passing required cases.

## Mechanically reviewable completion summary

- Migration: Phase 14 TriG.
- Lesson record: `docs/owlapi-js/migration/lessons/013-trig.md`.
- Finding IDs: `M14-001` through `M14-007`; every finding has exactly one
  primary disposition.
- Playbook changed: yes; Phase 14 evidence is institutionalized and the next
  migration section advances to Phase 15.
- Executable protections added: exact-format policy, bounded graph-block
  detection, ambiguity boundaries, broad-N3 rejection, graph-term and prefix
  preservation, all four graph policies, dataset-scoped blank-node identity,
  complete W3C inventory governance, resources, cancellation/yield,
  structural differential, direct/import/VOWL integration, browser globals,
  lazy-boundary verification, and same-revision performance measurement.
- Normative-change proposals: none.
- Resource-budget or regression-threshold changes: none.
- Unresolved blockers: none.
- Next migration: Phase 15, blocked until the repository owner creates the
  requested Phase 14 checkpoint commit and explicitly says to proceed.
