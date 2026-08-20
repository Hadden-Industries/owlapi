# Phase 9 strict Turtle lesson record

## Migration identity

- Migration: Phase 9 - private N3.js adapter foundation and strict Turtle.
- Baseline revision: `29909bb`, the pre-Phase-9 repository head.
- Completion revision: the Phase 9 checkpoint commit containing this record;
  the repository owner requested an uncommitted review pause before assigning
  its commit ID.
- Implementation date: 20 August 2026.
- Next migration: Phase 10 - DL Syntax.

## Implemented scope

Phase 9 registers Turtle as the second production RDF syntax and the first
format using the governed N3.js dependency. One private adapter always passes
exact `text/turtle`, conditionally loads the dependency only after selection,
streams Unicode-safe bounded chunks with backpressure, and reconstructs every
emitted term and quad with the project RDF/JS factory. The public Turtle parser
then composes that canonical dataset with the existing graph policy and the
single syntax-independent `RdfToOwlTranslator`.

The phase adds:

- `src/owlapi-js/parser/rdf/n3SyntaxAdapter.js`, a private format-locked N3.js
  boundary;
- `src/owlapi-js/parser/turtle/descriptor.js` and `parser.js`;
- adapter replacement, resource, abort, timeout, scheduler, browser, manager,
  strict-N3-negative, RDF 1.2 boundary, and transaction tests;
- independently classified, archived, generated, and executable W3C RDF 1.1
  and RDF 1.2 Turtle fixtures;
- a Turtle form of the project-owned Java structural fixture and paired
  RDF/XML/Turtle differential;
- direct, import-closure, complete WebVOWL, production-corpus, and production
  differential coverage; and
- Turtle browser-cost and syntax/end-to-end responsiveness benchmarks.

Only Turtle is registered. N-Triples, N-Quads, TriG, and the broader Notation3
language remain explicitly unsupported. The retained legacy Turtle parser is
neither moved nor imported by production.

## Acceptance evidence

| Gate                    | Result                                                                                                                                                              | Primary evidence                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| W3C inventory           | 387/387 definitions classified `REQUIRED`: 145 evaluations, 115 positive-syntax cases, and 127 negative-syntax cases                                                | `docs/owlapi-js/conformance/classification-manifests.json`; `generated/w3c-turtle.json`                     |
| W3C execution           | Every required RDF 1.1 and RDF 1.2 Turtle entry passes at the syntax/RDF boundary; one additional language-tag canonicalization regression also passes              | `src/owlapi-js/parser/turtle/turtle.conformance.test.js`                                                    |
| Exact format identity   | Turtle always uses exact `text/turtle`; N3 default mode and the later RDF format identities are never advertised                                                    | `n3SyntaxAdapter.test.js`; `turtle.test.js`                                                                 |
| Adapter contract        | N3 terms, streams, errors, configuration, and Node globals do not cross the private boundary                                                                        | `n3SyntaxAdapter.test.js`; `turtle.browser.test.js`                                                         |
| Resources/security      | Input, lexer-token, term, quad, blank-node, RDF-list, timeout, abort, stalled-stream, host-timer, Unicode, backpressure, and cooperative-yield behavior are bounded | `n3SyntaxAdapter.resource.test.js`; `turtle.test.js`                                                        |
| Structural differential | Turtle and RDF/XML produce the same complete structural snapshot and agree with the pinned Java ontology identity/axiom count                                       | `turtle.differential.test.js`                                                                               |
| Production integration  | Direct and imported Turtle build through the production structural entry; all target Turtle corpus documents and RDF/XML roots reaching Turtle imports load         | `src/owl2vowl/js/index.test.js`; `productionCorpus.test.js`                                                 |
| Production differential | All 33 comparable production fixtures pass with exact per-dimension governed differences; import-closure-incomparable fixtures remain explicitly excluded           | `productionDifferential.test.js`; `production-corpus-differences.json`                                      |
| Browser/bundle          | N3.js needs no `process` or `Buffer`; both the isolated graph and the actual application build keep it behind the lazy Turtle boundary                              | `turtle.browser.test.js`; `measure-owlapi-turtle-browser-cost.mjs`; `verify-webvowl-lazy-parser-chunks.mjs` |
| Dependency/security     | Exact N3.js 2.2.0 and its two runtime dependencies are recorded; the 73-package production audit reports zero vulnerabilities                                       | `dependency-governance.json`; `npm audit --omit=dev --json`                                                 |
| Performance             | 64 KiB is the measured responsiveness/throughput default; every paired pre-existing signal stays within the unchanged 20% threshold                                 | `performance/baseline.md`; `benchmark-owlapi-turtle.mjs`                                                    |
| Repository verification | 11/608 focused Phase 9 suites and 123/1,893 complete repository suites/tests pass                                                                                   | focused Jest run; complete Jest run                                                                         |

## Findings and dispositions

| ID       | Applicability                                  | Primary disposition      | Finding                                                                                                                                                                                              |
| -------- | ---------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `M9-001` | `RDF_ADAPTER`, `TESTING`, `CROSS_CUTTING`      | `TEST_OR_FITNESS_UPDATE` | A multi-format parser dependency must be private and format-locked; byte overlap never advertises another public format identity.                                                                    |
| `M9-002` | `RDF_ADAPTER`, `PROVENANCE`, `TESTING`         | `TEST_OR_FITNESS_UPDATE` | The RDF 1.1 and RDF 1.2 Turtle scopes can be made completely self-contained while preserving every upstream positive, negative, and evaluation classification.                                       |
| `M9-003` | `RDF_ADAPTER`, `TESTING`, `CROSS_CUTTING`      | `TEST_OR_FITNESS_UPDATE` | Nominal RDF/JS compatibility is insufficient at a replaceable boundary: language tags from the dependency required explicit lowercase canonicalization.                                              |
| `M9-004` | `RDF_ADAPTER`, `PERFORMANCE`, `SECURITY`       | `PLAYBOOK_UPDATE`        | Source-level and isolated-build laziness are insufficient: the real application configuration must keep the dependency outside its complete initial static closure.                                  |
| `M9-005` | `RDF_ADAPTER`, `PERFORMANCE`, `TESTING`        | `PLAYBOOK_UPDATE`        | Chunk size is a responsiveness decision: 64 KiB stays below the 50 ms syntax budget, while 256 KiB crosses it for only a small throughput gain.                                                      |
| `M9-006` | `RDF_ADAPTER`, `SECURITY`, `TESTING`           | `TEST_OR_FITNESS_UPDATE` | Cooperative scheduling is contractual only when the preferred `scheduler.yield()` branch and the timer fallback are both executable, and timeout still needs an independent stalled-stream watchdog. |
| `M9-007` | `RDF_ADAPTER`, `SYNTAX_LOCAL`, `CROSS_CUTTING` | `TEST_OR_FITNESS_UPDATE` | Turtle prefixes are document-format metadata, not OWL semantics; they publish immutably only with a committed parse transaction.                                                                     |
| `M9-008` | `RDF_ADAPTER`, `RDF_MAPPING`, `TESTING`        | `TEST_OR_FITNESS_UPDATE` | RDF 1.2 triple terms can be valid Turtle while having no OWL 2 mapping; syntax success and typed reconstruction rejection must remain distinct outcomes.                                             |
| `M9-009` | `RDF_ADAPTER`, `TESTING`, `CROSS_CUTTING`      | `TEST_OR_FITNESS_UPDATE` | A generic IRI-triple detector can read adjacent leading XML comments as Turtle; XML comments are a required strong negative before triple heuristics.                                                |
| `M9-010` | `TESTING`, `CROSS_CUTTING`                     | `TEST_OR_FITNESS_UPDATE` | Reusing the domain/range `owl:Thing` fallback for a generalized subclass axiom fabricates a VOWL edge; a subclass expression with no VOWL node has no drawable source.                               |
| `M9-011` | `TESTING`, `PROVENANCE`, `CROSS_CUTTING`       | `PLAYBOOK_UPDATE`        | A Java/WebVOWL differential is uninterpretable when its two sides resolved different import closures; exclusions must state that evidence instead of registering conversion differences.             |
| `M9-012` | `PERFORMANCE`, `TESTING`, `CROSS_CUTTING`      | `NO_CHANGE`              | Node 24.19 changes the absolute VOWL heap profile even for unchanged pre-Phase-9 code; same-runtime paired controls show Phase 9 itself within 3.17% on every relevant signal.                       |
| `M9-013` | `SECURITY`, `PROVENANCE`                       | `NO_CHANGE`              | The exact production dependency tree passes the current npm audit with no vulnerability or package-version exception.                                                                                |

### `M9-001` and `M9-002` - own each public format separately

N3.js implements several RDF syntaxes and a larger Notation3 language, but
owlapi-js exposes none of those identities by implication. The private adapter
constructor rejects every media type except `text/turtle`, the public manager
registers only the Turtle descriptor, and explicit N-Triples selection fails
before any dependency parse. Formulae, implication, quantifiers, and N3 path
syntax are project-owned negatives.

The generator reads the two pinned W3C manifests at revision
`12774b0ebb385d17651b396654b19254d0fefbfa`, verifies their SHA-256 digests,
embeds every action and expected graph, and proves the classification equation
over 387 unique entries. Evaluation cases compare RDF graphs by blank-node
isomorphism; positive and negative syntax stop at the adapter seam.

### `M9-003`, `M9-004`, and `M9-005` - normalize and measure the dependency boundary

The first W3C execution exposed one graph mismatch: N3.js emitted language
`en-UK`, while RDF/JS requires the stored language tag in lowercase. Passing a
foreign quad through `fromQuad` preserved the noncanonical value. The adapter
now recursively reconstructs every named node, blank node, literal, default
graph, and RDF 1.2 quad term with the project factory; no dependency term is
trusted merely because it implements the same interface.

The package's Node entry brings `readable-stream`, which consulted `process`
in the browser contract. The published `n3/browser/n3.min.js` distribution is
self-contained, conditionally imported, uses the injected project factory, and
passes all 387 upstream cases in both Node and simulated-browser contracts.
This chooses one production implementation path rather than bundling parallel
Node and browser parser copies.

The production application build revealed a separate chunking defect: its
blanket `manualChunks` rule put all `node_modules` code in the statically
imported `vendor.js`. N3's implementation was therefore eager in the shipped
graph even though the source import and isolated browser build were lazy. The
entry-aware `codeSplitting` replacement now gives the application a 639,028-byte
initial static closure with no N3 marker and a 187,063-byte lazy Turtle closure
that contains it. The post-build verifier follows actual imports, so retained
stale files cannot produce either a false pass or a false failure.

Measured syntax-only medians for 50,000 triples were 963.49 ms / 17.20 ms
maximum event-loop delay at 16 KiB, 398.49 ms / 33.02 ms at 64 KiB, and 350.59
ms / 73.08 ms at 256 KiB. The 64 KiB default therefore captures most of the
throughput gain without crossing the 50 ms scheduling budget. The adapter
prefers `scheduler.yield()` when available and retains a zero-delay timer
fallback.

### `M9-007` and `M9-008` - keep syntax context and OWL meaning separate

N3.js prefix events become a frozen string-to-string map in the manager's
per-document context. They are not axioms, annotations, ontology identifiers,
or shared manager state. Transactional publication prevents a failed Turtle
attempt from leaking partial prefix bindings.

RDF 1.2 Turtle triple terms demonstrate the other direction of the same seam:
the syntax adapter emits a valid canonical RDF/JS quad term, then the shared
translator throws `UnsupportedConstructError` because OWL 2 assigns it no
structural meaning. Reporting that as a Turtle syntax error would conflate two
independently testable specifications.

### `M9-009`, `M9-010`, and `M9-011` - production evidence must identify its layer

The complete corpus found a descriptor defect before parsing: RDF/XML files
with adjacent leading comments resembled an IRI subject and predicate to the
bounded Turtle heuristic. A strong XML-comment negative fixed selection; no
parser or translator compatibility rule was added.

The Turtle differential then found a downstream VOWL defect. When an OWL
restriction appeared in subclass position, `classExpressionRecord` used its
domain/range fallback and emitted `owl:Thing subClassOf NamedClass`. The fix is
at the VOWL node seam: no node means no source endpoint. Turtle parsing and OWL
reconstruction were already correct.

Several remaining production differences proved to be different historical
import closures, not different conversion of one ontology. Those fixtures are
excluded with exact evidence until the pinned Java outputs are regenerated
against the same local catalog. Comparable Turtle differences remain governed
per dimension, including the deliberate preservation of qualified cardinality
edges under ADR 0006 and refusal to reverse generalized class axioms.

## Dependency and security impact

`n3` 2.2.0 is already exactly pinned in the unchanged package and lock files.
Its runtime dependency set is `buffer` 6.0.3 and `readable-stream` 4.7.0; all
three packages use the MIT licence and gain no document-loading authority.
`npm audit --omit=dev --json` completed on 20 August 2026 over 73 production
dependencies and reported zero vulnerabilities at every severity.

Executable controls are independent of the advisory result: malformed input,
N3-only syntax, input/token/term/quad/blank-node/list limits, abort, timeout,
stalled streams, oversized timer delays, Unicode chunk boundaries,
backpressure, scheduler preference, browser globals, and transaction rollback
all have focused tests.

## Impact on Phase 10

DL Syntax is an OWL-native textual syntax and must parse directly to structural
objects. It does not use the N3 adapter or RDF reconstruction, but it inherits
the now-proven parser contracts: bounded tri-state detection, lazy and finite
lexing, typed diagnostics, cancellation/deadlines, cooperative scheduling,
transactional publication, exact format identity, cross-format structural
fixtures, production import/WebVOWL acceptance, and same-runtime regression
controls.

The richer live production surface is useful evidence: a DL fixture can now be
compared structurally with Functional, Manchester, OWL/XML, RDF/XML, and Turtle
representations without introducing a syntax-specific semantic oracle.

## Unresolved questions

There are no unresolved Phase 9 conformance, differential, resource,
dependency, browser, provenance, production-integration, or performance
blockers and no unfinished `LOCAL_PHASE_FOLLOW_UP`. N-Triples, N-Quads, TriG,
and the broader N3 language are planned/deferred identities, not incomplete
Turtle work.

## Mechanically reviewable completion summary

- Migration: Phase 9 private N3.js adapter foundation and strict Turtle.
- Lesson record: `docs/owlapi-js/migration/lessons/008-turtle.md`.
- Finding IDs: `M9-001` through `M9-013`; every finding has exactly one primary
  disposition.
- Playbook changed: yes; the strict multi-format dependency method is
  institutionalized and the next-migration section advances to Phase 10.
- Executable protections added: exhaustive W3C classification/generation,
  adapter replacement/canonicalization, strict format and N3 negatives,
  browser globals, bounded streaming, scheduler preference, resources,
  abort/watchdog timeout, RDF-list limit, prefix context, RDF 1.2 boundary,
  paired RDF/XML/Turtle/Java differential, production direct/import/corpus and
  differential gates, lazy-bundle measurement, and syntax/end-to-end
  performance measurement.
- Normative-change proposals: none.
- Resource-budget or regression-threshold changes: none.
- Unresolved blockers: none.
- Next migration: Phase 10, blocked until the repository owner creates the
  requested Phase 9 checkpoint commit and explicitly says to proceed.
