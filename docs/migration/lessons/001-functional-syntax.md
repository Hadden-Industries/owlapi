# Phase 2 learning record: Functional Syntax

## Migration identity

- Migration: Phase 2 — Functional Syntax.
- Baseline revision: `3b4644f` (`feat(owlapi-js): Establish Phase 1 structural core`).
- Completion revision: the Phase 2 checkpoint commit containing this record;
  the repository owner requested an uncommitted review pause before assigning
  its commit ID.
- Implementation date: 10 August 2026.
- Next migration: Phase 3 — Manchester Syntax.

## Implemented scope

Phase 2 adds a directly registered Functional Syntax parser that constructs the
Phase 1 structural model without RDF or RDF/XML interchange. Its covered scope
includes:

- immutable format/descriptor identity and bounded `Prefix(` / `Ontology(`
  detection;
- lazy pull tokenization, one-token lookahead, comments, source locations,
  Unicode IRIs and prefixed names, strings, language tags, typed literals,
  integer cardinalities, and source node IDs;
- ontology identity/version, imports, ontology annotations, nested
  annotations, declarations, every required object/data expression, and all 38
  required-v1 axiom kinds;
- exact strict-mode errors and the deliberately narrow compatible recovery for
  redundant predefined-prefix declarations;
- explicit `UnsupportedConstructError` for deferred `DLSafeRule` / SWRL input;
- document-scoped anonymous individuals and `loadAnnotationAxioms` behavior;
- transaction-safe failure, import integration, typed diagnostics, finite
  resource limits, timeout enforcement, and cooperative cancellation;
- exhaustive W3C manifest classification and execution, pinned Java OWLAPI
  structural differential evidence, and repeated performance/heap evidence.

No package, lockfile, build, lint, test, CI, resource-budget, or performance-
threshold configuration changed.

## Assumptions entering the phase

1. The Phase 1 factory and ontology objects could represent the complete
   required Functional grammar without another public-model change.
2. One pull lexer and recursive-descent parser could preserve exact lexical
   values while staying within the existing finite resource budget.
3. The W3C OWL 2 test archive would provide a reproducible Functional subset
   suitable for parser-boundary conformance.
4. Java OWLAPI 5.5.1 could act as a black-box structural oracle without becoming
   a production implementation template.
5. The Phase 0 one-warm-up/five-run benchmark protocol was sufficient to define
   the first accepted Functional baseline without changing its 20% threshold.

All five assumptions held, with the qualifications recorded below: the
historical W3C export endpoint is no longer the stable artifact source, archived
test inputs need a narrowly scoped standard-prefix compatibility mode, and the
Java runtime harness needs its resolved dependency classpath plus explicit
fixture import suppression.

## Acceptance evidence

The final verification run passed 4 focused Functional suites / 65 tests and
61 repository suites / 541 tests. Repository Prettier, HTML validation,
Stylelint, ESLint, and the production Vite build are green.

### Standards conformance

- Governing specifications: OWL 2 Structural Specification and Functional-
  Style Syntax Second Edition, and OWL 2 Conformance Second Edition.
- Stored manifest:
  `docs/owlapi-js/conformance/upstream/w3c-owl2/all.rdf`.
- Manifest SHA-256:
  `986ce4f9df655b1f44aec86a5753530d295355a8e9a16700e0253ac30759c4e1`.
- Source provenance: OWLAPI 5.5.1
  `contract/src/test/resources/all.rdf` at
  `d7e997a53b470e32700de89cc610d9daf01ea769`.
- Complete classification: 338 of 338 unique cases; 46 `REQUIRED` cases with
  62 Functional premise/conclusion/non-conclusion documents; 292
  `NOT_APPLICABLE` cases with reason `DIFFERENT_SYNTAX`; zero exclusions.
- Runner result: all 62 required Functional documents parse. Semantic
  entailment, consistency, and profile conclusions are intentionally outside a
  syntax-parser runner.

The archive contains no Functional negative-syntax group. Project-owned tests
therefore retain the negative grammar, malformed input, unsupported construct,
transaction, and resource coverage that the upstream artifact cannot supply.

### Java differential

The fixture
`util/owlapi-reference/fixtures/functional/phase2-structural.ofn` and pinned
snapshot `phase2-structural.java.json` compare:

- ontology and version IRIs;
- import declarations;
- nested ontology annotations;
- all 38 axiom families and six declaration axioms;
- signatures for every entity category;
- axiom annotations;
- typed/plain/language literal identity and exact lexical form; and
- relationships sharing one source anonymous individual.

After canonicalizing two OWLAPI display-label spellings and generated anonymous
labels, unmatched semantic differences, ambiguous rules, and unsatisfied
required expected differences are all zero. No Phase 2 expected-difference rule
was added.

### Resource and performance evidence

Resource tests cover the exact boundary and first overflow for input bytes,
token bytes/count, axioms, blank nodes, expression depth, annotation depth,
timeout, and abort-before-completion behavior. The 16 MiB unrelated-input
benchmark also protects bounded detection against the historical eager-token
heap failure class.

Environment: Windows `10.0.26200` x64, Node.js `v24.17.0`, Intel i9-12900K,
one warm-up plus five measured runs, median aggregation, garbage collection
requested before each run.

| Fixture                      | Median wall ms | Median peak heap bytes | Median peak heap delta bytes |
| ---------------------------- | -------------: | ---------------------: | ---------------------------: |
| 50,000 Functional axioms     |         460.29 |            125,611,360 |                  118,988,376 |
| 512 nested expression levels |         309.24 |             56,008,448 |                   49,566,376 |
| 16 MiB mismatched input      |          24.42 |             23,255,720 |                       29,248 |

The reproducible runner is `util/benchmark-owlapi-functional.mjs`; the complete
protocol and accepted baseline are in `performance/baseline.md`.

## Failed approaches and best-supported causes

1. Running the Java harness with only the OWLAPI OSGi JAR failed as external
   runtime classes were resolved (`slf4j`, `javax.inject`, Caffeine,
   Commons RDF, RDF4J, and HPPCRT). The OSGi artifact is not a self-contained
   command-line oracle. The durable method uses the pinned artifact plus Maven's
   resolved runtime dependency classpath.
2. Java's `SILENT` missing-import configuration did not suppress an
   `OWLOntologyFactoryNotFoundException`, because that exception is an
   `OWLRuntimeException` rather than the creation-exception branch handled by
   the silent strategy. The harness now accepts explicit ignored import IRIs;
   their declarations remain in the direct snapshot without dereference.
3. Strict parsing of 24 archived Functional documents failed on redundant
   `xsd:` or `owl:` declarations. Accepting arbitrary reserved-prefix
   declarations would weaken the W3C contract. Compatible mode now accepts only
   the exact predefined binding and only after positive Functional detection;
   all 62 documents then pass, while strict rejection remains tested.
4. Treating the historical W3C batch-export host as the reproducible source was
   not viable. The final status page reports a larger final catalogue, but the
   stable local pinned artifact available to this project contains 338 approved
   cases. The repository stores that exact byte sequence and classifies all of
   it instead of silently claiming the unavailable larger export.
5. A full-IRI token containing an unpaired UTF-16 surrogate initially passed.
   The failing regression demonstrated that JavaScript string/code-point APIs
   require an explicit surrogate check even when other IRI-forbidden characters
   are already rejected.

## Material findings and dispositions

| ID       | Applicability                                  | Primary disposition      | Summary                                                                                   |
| -------- | ---------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| `F2-001` | `CROSS_CUTTING`, `TEXTUAL_PARSER`, `SECURITY`  | `TEST_OR_FITNESS_UPDATE` | Detection and tokenization must stay bounded and lazy.                                    |
| `F2-002` | `TEXTUAL_PARSER`, `PERFORMANCE`, `SECURITY`    | `PLAYBOOK_UPDATE`        | CPU-heavy parsing must yield at bounded top-level intervals.                              |
| `F2-003` | `OWL_NATIVE`, `TEXTUAL_PARSER`, `SYNTAX_LOCAL` | `TEST_OR_FITNESS_UPDATE` | Reserved-prefix recovery is exact, detected, and compatible-only.                         |
| `F2-004` | `OWL_NATIVE`, `CROSS_CUTTING`, `RDF_MAPPING`   | `PLAYBOOK_UPDATE`        | Plain and language literals use the shared RDF 1.1 datatype model.                        |
| `F2-005` | `OWL_NATIVE`, `CROSS_CUTTING`, `TESTING`       | `PLAYBOOK_UPDATE`        | Source anonymous IDs are document-scoped and standardized apart.                          |
| `F2-006` | `OWL_NATIVE`, `TEXTUAL_PARSER`, `TESTING`      | `TEST_OR_FITNESS_UPDATE` | Every required grammar production needs an explicit structural mapping.                   |
| `F2-007` | `TESTING`, `PROVENANCE`, `CROSS_CUTTING`       | `TEST_OR_FITNESS_UPDATE` | Differential normalization may remove representation noise only.                          |
| `F2-008` | `TESTING`, `PROVENANCE`                        | `TEST_OR_FITNESS_UPDATE` | Conformance uses a stored immutable artifact and exhaustive classification.               |
| `F2-009` | `PROVENANCE`, `TESTING`                        | `TEST_OR_FITNESS_UPDATE` | The Java oracle needs a reproducible full runtime classpath and explicit ignored imports. |
| `F2-010` | `TESTING`, `PROVENANCE`, `SYNTAX_LOCAL`        | `NO_CHANGE`              | Two OWLAPI axiom-type display labels are misspelled but semantics are unchanged.          |
| `F2-011` | `TEXTUAL_PARSER`, `SECURITY`, `SYNTAX_LOCAL`   | `TEST_OR_FITNESS_UPDATE` | Full IRIs must reject unpaired UTF-16 surrogates explicitly.                              |

### `F2-001` — bounded lazy lexical work

Evidence: `functionalSyntax.resource.test.js` and the 16 MiB mismatch
benchmark. Institutionalization: pull lexer, byte-count checks during token
scans, periodic timeout/abort checks, detector allocation benchmark, and current
playbook rules. No local follow-up remains.

### `F2-002` — cooperative scheduling is part of cancellation

Evidence: the abort test observes fewer than 50,000 factory constructions after
an in-flight abort. Institutionalization: parser yield checkpoints using
`scheduler.yield()` with a timer fallback and the rewritten playbook. No public
contract or budget changed.

### `F2-003` — compatibility recovery must be narrower than grammar acceptance

Evidence: strict/compatible prefix regression and the 62-document W3C runner.
Institutionalization: exact namespace equality, positive detection requirement,
structured warning, and a syntax-local runner-mode rationale in the conformance
manifest.

### `F2-004` — literals converge through one data factory

Evidence: Java literal probe and structural differential. Java OWLAPI 5.5.1
represents a plain literal as `xsd:string` and a language-tagged literal as
`rdf:langString`, while preserving lexical form and normalized language.
Institutionalization: the playbook directs all later syntaxes through the
shared factory. No model change was required.

### `F2-005` — anonymous labels are source-local

Evidence: differential fixture references one anonymous label from seven
axioms, and parser tests use source-scoped structural identity.
Institutionalization: playbook rule for document scoping and future
cross-document standardization. No next-phase question remains.

### `F2-006` — exhaustive grammar mapping prevents silent semantic loss

Evidence: focused tests construct every required object expression, data range,
and all 38 axiom kinds; `DLSafeRule` produces a typed unsupported error.
Institutionalization: exhaustive grammar tests and factory-kind assertions.

### `F2-007` — differential canonicalization is deliberately small

Evidence: Java/JS comparison covers counts, signatures, annotations, literals,
and anonymous relationships. Only unordered output, generated blank labels, and
the display strings in `F2-010` are normalized. Institutionalization:
zero-tolerance differential test; no expected-difference rule.

### `F2-008` — suite identity is data, not a moving URL

Evidence: exact manifest digest, 338 unique IDs, 338 classifications, and 62
executed Functional documents. Institutionalization: stored upstream artifact,
suite metadata, generated explicit entries, governance count checks, and the
conformance runner.

### `F2-009` — Java tooling must be reproducible but isolated

Evidence: failed partial classpaths and unresolved-import behavior described
above. Institutionalization: updated development-only harness README, optional
ignored import arguments, pinned snapshot metadata, and no production Java
runtime dependency.

### `F2-010` — OWLAPI display-label spelling is not a semantic difference

Java OWLAPI 5.5.1 reports `IrrefexiveObjectProperty` and
`AnnotationPropertyRangeOf` in `AxiomType#getName`, while its rendered axioms
and structural objects represent the expected kinds. Primary disposition is
`NO_CHANGE`: the differential test narrowly aliases those two display labels;
changing project kinds or adding a semantic exception would be less accurate.

### `F2-011` — JavaScript Unicode validity needs explicit checks

Evidence: a RED regression accepted `<urn:test:\uD800>` before the lexer fix and
passes after explicit surrogate rejection. Institutionalization: focused
negative syntax test and lexer validation. No budget or API change was needed.

## Compatibility findings

- Strict W3C grammar remains authoritative; compatibility mode is never a
  general permissive parser.
- Untyped and language-tagged literals match the pinned Java OWLAPI 5.5.1
  structural model through the existing Phase 1 factory.
- OWLAPI-generated anonymous labels are not compared textually; relationships
  and source-local identity are compared.
- Two Java display-label typos are normalized as presentation artifacts only.
- `DLSafeRule` remains the explicitly deferred SWRL capability and fails with
  `UnsupportedConstructError` rather than partial ontology content.

## Unresolved questions and dependency impact

There are no unresolved questions that can alter Phase 3 behavior, no unfinished
`LOCAL_PHASE_FOLLOW_UP`, no blocking normative proposal, and no unapplied
playbook or executable-protection disposition. The historical W3C catalogue
outside the stored 338-case artifact may be reacquired as future preparatory
fixture work, but it cannot change the completed classification or parser
behavior unless a separately approved immutable suite revision is introduced.

## Mechanically reviewable completion summary

- Migration: Phase 2 Functional Syntax.
- Lesson record: `docs/owlapi-js/migration/lessons/001-functional-syntax.md`.
- Finding IDs: `F2-001` through `F2-011`; every finding has exactly one primary
  disposition.
- Playbook changed: yes; lazy lexing, cooperative yield, scoped recovery,
  literal/anonymous handling, conformance, Java tooling, differential policy,
  and the Phase 3 handoff are current guidance.
- Executable protections added: parser/lexer regressions, resource/abort tests,
  338-case classification audit, 62-document W3C runner, Java structural
  differential, and repeated wall/heap benchmark.
- Normative-change proposals: none.
- Unresolved blockers: none.
- Next migration: Phase 3 Manchester Syntax, still blocked until the repository
  owner creates the requested Phase 2 checkpoint commit and explicitly says to
  proceed.
