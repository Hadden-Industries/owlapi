# Phase 12 N-Triples lesson record

## Migration identity

- Migration: Phase 12 - N-Triples.
- Baseline revision: `f94bd057`, the signed Phase 11 checkpoint commit.
- Completion revision: the Phase 12 checkpoint commit containing this record;
  the repository owner requested an uncommitted review pause before assigning
  its commit ID.
- Implementation date: 22 August 2026.
- Next migration: Phase 13 - N-Quads.

## Implemented scope

Phase 12 registers N-Triples as a distinct strict RDF document format. It reuses
N3.js only behind the private adapter introduced in Phase 9 and publishes
project-owned RDF/JS terms, quads, diagnostics, and immutable ontology state.
Turtle and N-Triples now share a small syntax-independent RDF dataset
publication seam; their descriptors, exact dependency selectors, lexer modes,
prefix policy, graph policy, and diagnostic identities remain separate.

The descriptor gives N-Triples priority over Turtle only when the bounded input
has its narrower absolute-IRI statement signature. Turtle directives and
N-Quads graph labels are decisive negatives. Explicit format, content-type, and
import-closure selection continue to use the manager's existing exact-format
rules.

## Acceptance evidence

| Gate                    | Result                                                                                                          | Primary evidence                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Exact syntax identity   | `application/n-triples` selects N3.js `N-Triples` with line-mode lexing; Turtle directives stay invalid         | `n3SyntaxAdapter.test.js`; `nTriples.test.js`                       |
| W3C conformance         | All 99 independently classified RDF 1.1/RDF 1.2 entries pass: 48 positive and 51 negative                       | `w3c-ntriples.json`; `nTriples.conformance.test.js`                 |
| RDF/JS graph policy     | Every published quad has `DefaultGraph`; named-graph output from a replacement implementation is normalized     | `n3SyntaxAdapter.test.js`; `nTriples.conformance.test.js`           |
| Resources/security      | Quad, blank-node, token, timeout, pre-abort, in-flight abort, and syntax-specific adapter budgets are governed  | `nTriples.resource.test.js`; `n3SyntaxAdapter.resource.test.js`     |
| Structural differential | An N-Triples ontology agrees with equivalent RDF/XML on structural keys and signature                           | `nTriples.differential.test.js`                                     |
| Production integration  | Direct, auto-detected, imported, and WebVOWL loads use the new parser; N-Quads and TriG remain unregistered     | `nTriples.test.js`; `productionGraph.architecture.test.js`          |
| Browser/lazy boundary   | The adapter runs without Node globals and retains the already-governed lazy N3.js production boundary           | `nTriples.browser.test.js`; `verify-webvowl-lazy-parser-chunks.mjs` |
| Performance             | Syntax, end-to-end, and same-revision registry signals pass without changing the 20% threshold                  | `performance/baseline.md`; `benchmark-owlapi-ntriples.mjs`          |
| Provenance              | Every production module and both W3C corpora are recorded against exact public sources and repository revisions | `provenance/provenance.json`; `governance.test.js`                  |

## Findings and dispositions

| ID        | Applicability                  | Primary disposition      | Finding                                                                                                                                                                               |
| --------- | ------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `M12-001` | `RDF_ADAPTER`, `COMPATIBILITY` | `PLAYBOOK_UPDATE`        | A standards media type and a dependency's parser selector are different identities: `application/n-triples` must map privately to N3.js `N-Triples`.                                  |
| `M12-002` | `RDF_ADAPTER`, `SECURITY`      | `TEST_OR_FITNESS_UPDATE` | Supplying a custom budgeted lexer bypasses parser-created lexer defaults; strict N-Triples therefore requires `lineMode: true` on that lexer as well as the stream parser.            |
| `M12-003` | `RDF_ADAPTER`, `RDF_MAPPING`   | `TEST_OR_FITNESS_UPDATE` | N-Triples has no graph label, so the private boundary must publish only default-graph quads even if a replacement implementation emits a named graph.                                 |
| `M12-004` | `RDF_ADAPTER`, `COMPATIBILITY` | `TEST_OR_FITNESS_UPDATE` | N-Triples is a Turtle subset; a lower descriptor priority preserves the narrower identity, while decisive Turtle-directive negatives prevent generic N3-language detection.           |
| `M12-005` | `RDF_ADAPTER`, `TESTING`       | `TEST_OR_FITNESS_UPDATE` | N-Quads rejection must cover a graph label after recursive RDF 1.2 triple-term objects without pretending the bounded detector is a second full parser.                               |
| `M12-006` | `RDF_ADAPTER`, `PROVENANCE`    | `PLAYBOOK_UPDATE`        | RDF 1.1 and RDF 1.2 N-Triples require independent pinned manifests and exact positive/negative classifications rather than inheriting Turtle evidence.                                |
| `M12-007` | `RDF_ADAPTER`, `CROSS_CUTTING` | `PLAYBOOK_UPDATE`        | The reusable seam begins after canonical RDF/JS dataset creation; moving syntax identity, prefix handling, or graph policy into it would make the module falsely generic.             |
| `M12-008` | `PERFORMANCE`, `TESTING`       | `NO_CHANGE`              | The syntax adapter remains cooperatively bounded; the long end-to-end interval matches the already-recorded shared RDF-to-OWL reconstruction cost and is not an N-Triples regression. |

## Normative and test-corpus grounding

The conformance register embeds the complete N-Triples syntax entries selected
from W3C `rdf-tests` revision
`12774b0ebb385d17651b396654b19254d0fefbfa`. The RDF 1.1 and RDF 1.2 source
manifests are archived separately, and their SHA-256 identities are recorded in
the classification manifest. Positive documents must parse to default-graph
RDF/JS quads; negative documents must fail with the canonical `N-Triples`
syntax identity.

The RDF 1.2 corpus includes triple terms. These reach the existing explicit
RDF-to-OWL unsupported-boundary logic rather than being rewritten or silently
treated as ordinary RDF terms. The detector recognizes graph-labelled variants
as N-Quads and leaves that capability unavailable until Phase 13.

## Performance and dependency impact

The accepted 50,000-triple fixture contains 6,588,889 bytes. At the retained
65,536-byte default, syntax-to-RDF completes in 1,134.20 ms with a 20.15 ms
maximum sampled event-loop delay. The end-to-end path completes in 2,296.51 ms;
its 1,127.70 ms interval is the shared synchronous RDF-to-OWL publication cost,
consistent with Turtle's accepted 1,133.96 ms result for the same 50,000-axiom
shape. Same-revision Functional and mismatch registry regressions stay below
the unchanged 20% threshold.

Phase 12 adds no dependency, package or lockfile change, configuration change,
resource-ceiling change, regression-threshold change, or legacy production
reachability. N3.js remains a lazy private implementation shared by two exact
format policies.

## Impact on Phase 13

N-Quads may reuse the private implementation and the syntax-independent RDF
dataset publication seam, but it cannot reuse N-Triples graph normalization.
Phase 13 must define named-graph selection/loss explicitly, add an independent
descriptor and W3C RDF 1.1/RDF 1.2 classification, and prove that N-Triples and
Turtle strictness remain unchanged.

## Unresolved questions

There are no unresolved Phase 12 syntax, conformance, graph-policy,
differential, resource, dependency, production-integration, provenance, or
performance blockers and no unfinished `LOCAL_PHASE_FOLLOW_UP`.

## Mechanically reviewable completion summary

- Migration: Phase 12 N-Triples.
- Lesson record: `docs/owlapi-js/migration/lessons/011-ntriples.md`.
- Finding IDs: `M12-001` through `M12-008`; every finding has exactly one
  primary disposition.
- Playbook changed: yes; Phase 12 evidence is institutionalized and the next
  migration section advances to Phase 13.
- Executable protections added: exact-format/lexer policy, bounded detection,
  Turtle and N-Quads negatives, default-graph normalization, W3C positives and
  negatives, resources, cancellation/yield, structural differential,
  direct/import/WebVOWL integration, browser globals, and same-revision
  performance measurement.
- Normative-change proposals: none.
- Resource-budget or regression-threshold changes: none.
- Unresolved blockers: none.
- Next migration: Phase 13, blocked until the repository owner creates the
  requested Phase 12 checkpoint commit and explicitly says to proceed.
