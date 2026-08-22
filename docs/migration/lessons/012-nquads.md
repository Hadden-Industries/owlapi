# Phase 13 N-Quads lesson record

## Migration identity

- Migration: Phase 13 - N-Quads.
- Baseline revision: `f83a02f7`, the signed Phase 12 checkpoint commit.
- Completion revision: the Phase 13 checkpoint commit containing this record;
  the repository owner requested an uncommitted review pause before assigning
  its commit ID.
- Implementation date: 22 August 2026.
- Next migration: Phase 14 - TriG.

## Implemented scope

Phase 13 registers N-Quads as an independent strict RDF dataset format. It
reuses N3.js only behind an exact private `N-Quads` policy and publishes
project-owned RDF/JS terms, quads, diagnostics, and immutable ontology state.
Unlike N-Triples, the adapter preserves each quad's graph term. The existing
graph-policy seam then applies `requireSingleGraph`, `defaultGraphOnly`,
`selectGraph`, or `mergeGraphs` before RDF-to-OWL reconstruction.

The selected graph and merge decision are recorded in immutable document
context, not on OWL axioms. Blank-node identity remains scoped to the complete
dataset until graph policy has selected or merged the graph, ensuring that
equal labels in different graph statements continue to denote the same blank
node.

The bounded descriptor recognizes only decisive fourth-position graph terms.
It gives N-Quads priority over N-Triples and Turtle without duplicating the
grammar or weakening either existing syntax. Full validation remains the exact
N3.js adapter's responsibility.

## Acceptance evidence

| Gate                    | Result                                                                                                                   | Primary evidence                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Exact syntax identity   | `application/n-quads` selects N3.js `N-Quads` with line-mode lexing and preserves graph terms                            | `n3SyntaxAdapter.test.js`; `nQuads.test.js`                       |
| W3C conformance         | All 114 independently classified RDF 1.1/RDF 1.2 entries pass: 60 positive and 54 negative                               | `w3c-nquads.json`; `nQuads.conformance.test.js`                   |
| RDF/JS graph policy     | All four policies run over parsed datasets; selection, merge, loss, deduplication, and missing-graph behavior are tested | `nQuads.test.js`; `rdfGraphPolicy.test.js`                        |
| Dataset identity        | Equal source blank-node labels in distinct graphs retain one shared dataset-scoped RDF/JS identity                       | `nQuads.test.js`                                                  |
| Resources/security      | Quad, blank-node, token, timeout, pre-abort, and in-flight-abort budgets are governed                                    | `nQuads.resource.test.js`                                         |
| Structural differential | A selected N-Quads named graph agrees with equivalent RDF/XML on structural keys and signature                           | `nQuads.differential.test.js`                                     |
| Production integration  | Direct, auto-detected, imported, and WebVOWL loads use the new parser; TriG remains unregistered                         | `nQuads.test.js`; `productionGraph.architecture.test.js`          |
| Browser/lazy boundary   | The adapter runs without Node globals and retains the governed lazy N3.js production boundary                            | `nQuads.browser.test.js`; `verify-webvowl-lazy-parser-chunks.mjs` |
| Performance             | Syntax, end-to-end, and same-revision registry signals pass without changing the 20% threshold                           | `performance/baseline.md`; `benchmark-owlapi-nquads.mjs`          |
| Provenance              | Every production module and both W3C corpora are recorded against exact public sources and repository revisions          | `provenance/provenance.json`; `governance.test.js`                |

## Findings and dispositions

| ID        | Applicability                           | Primary disposition      | Finding                                                                                                                                                                                                |
| --------- | --------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `M13-001` | `RDF_ADAPTER`, `COMPATIBILITY`          | `PLAYBOOK_UPDATE`        | N-Quads needs its own exact media-type-to-dependency selector; sharing N3.js does not make it a mode of N-Triples or Turtle.                                                                           |
| `M13-002` | `RDF_ADAPTER`, `RDF_MAPPING`            | `TEST_OR_FITNESS_UPDATE` | Graph terms must survive syntax parsing unchanged; graph selection or loss belongs to the explicit dataset-policy seam after canonical RDF/JS publication.                                             |
| `M13-003` | `RDF_ADAPTER`, `RDF_MAPPING`, `TESTING` | `TEST_OR_FITNESS_UPDATE` | Blank-node identity is dataset-scoped, so graph policy must run after the parser has assigned identities across the whole dataset.                                                                     |
| `M13-004` | `RDF_ADAPTER`, `COMPATIBILITY`          | `TEST_OR_FITNESS_UPDATE` | A bounded detector should inspect the decisive fourth term, including after an RDF 1.2 triple-term object, while leaving complete syntax validation to the strict adapter.                             |
| `M13-005` | `RDF_ADAPTER`, `CROSS_CUTTING`          | `PLAYBOOK_UPDATE`        | Selected-graph and merged-dataset facts are document ingestion context, not OWL semantics; publishing them on the document avoids contaminating structural axioms.                                     |
| `M13-006` | `RDF_ADAPTER`, `PROVENANCE`             | `PLAYBOOK_UPDATE`        | RDF 1.1 and RDF 1.2 N-Quads require independent pinned manifests and exact positive/negative classifications; Turtle and N-Triples evidence cannot stand in for a dataset grammar.                     |
| `M13-007` | `RDF_ADAPTER`, `TESTING`                | `TEST_OR_FITNESS_UPDATE` | Positive conformance expectations must be generated before the implementation under test runs, including expected quad counts and graph-term kinds, or graph-normalization defects can pass unnoticed. |
| `M13-008` | `PERFORMANCE`, `TESTING`                | `NO_CHANGE`              | The strict adapter remains cooperatively bounded and registration stays within the existing threshold; the retained 65,536-byte chunk and all resource ceilings remain appropriate.                    |

## Normative and test-corpus grounding

The conformance register embeds the complete selected N-Quads syntax entries
from W3C `rdf-tests` revision
`12774b0ebb385d17651b396654b19254d0fefbfa`. The RDF 1.1 and RDF 1.2 source
manifests are archived separately with their SHA-256 identities. The register
contains 114 required cases: 60 accepted documents and 54 required syntax
failures. Positive expectations record quad counts and graph-term kinds before
the adapter executes, so replacing named graphs with the default graph fails
the gate.

RDF 1.2 triple terms reach the existing explicit RDF-to-OWL unsupported
boundary when they cannot be represented as OWL structures. They are neither
rewritten nor silently accepted as ordinary RDF terms.

## Performance and dependency impact

The accepted 50,000-quad fixture contains 8,438,889 bytes in one named graph.
At the retained 65,536-byte default, syntax-to-RDF completes in 1,532.72 ms
with an 18.42 ms maximum sampled event-loop delay. The end-to-end path,
including single-graph selection and RDF-to-OWL publication, completes in
2,595.56 ms.
Same-revision Functional and mismatch registry controls stay below the
unchanged 20% threshold.

Phase 13 adds no dependency, package, lockfile, build configuration,
resource-ceiling, regression-threshold, or legacy-production-reachability
change. The conformance and provenance registers are extended for the new
format. N3.js remains a lazy private implementation shared by three exact
format policies.

## Impact on Phase 14

TriG may reuse the private N3.js implementation and the graph-policy seam, but
it cannot be implemented as permissive N-Quads. It combines Turtle's directives
and prefix/base state with named graphs and therefore needs a distinct exact
policy, descriptor, conformance classification, and ambiguity tests. Phase 14
must retain the N-Triples and N-Quads line-syntax guarantees while adding the
graph-block grammar.

## Unresolved questions

There are no unresolved Phase 13 syntax, conformance, graph-policy,
differential, resource, dependency, production-integration, provenance, or
performance blockers and no unfinished `LOCAL_PHASE_FOLLOW_UP`.

## Mechanically reviewable completion summary

- Migration: Phase 13 N-Quads.
- Lesson record: `docs/owlapi-js/migration/lessons/012-nquads.md`.
- Finding IDs: `M13-001` through `M13-008`; every finding has exactly one
  primary disposition.
- Playbook changed: yes; Phase 13 evidence is institutionalized and the next
  migration section advances to Phase 14.
- Executable protections added: exact-format/lexer policy, bounded decisive
  detection, Turtle and N-Triples strictness, graph-term preservation, all four
  graph policies over parsed input, dataset-scoped blank-node identity, W3C
  positives and negatives, resources, cancellation/yield, structural
  differential, direct/import/WebVOWL integration, browser globals, and
  same-revision performance measurement.
- Normative-change proposals: none.
- Resource-budget or regression-threshold changes: none.
- Unresolved blockers: none.
- Next migration: Phase 14, blocked until the repository owner creates the
  requested Phase 13 checkpoint commit and explicitly says to proceed.
