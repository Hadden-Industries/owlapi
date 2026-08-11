# Phase 3 learning record: Manchester Syntax

## Migration identity

- Migration: Phase 3 - Manchester Syntax.
- Baseline revision: `8a85801` (`feat(owlapi-js): Add Functional Syntax parser`).
- Completion revision: the Phase 3 checkpoint commit containing this record;
  the repository owner requested an uncommitted review pause before assigning
  its commit ID.
- Implementation date: 11 August 2026.
- Next migration: Phase 4 - OWL/XML.

## Implemented scope

Phase 3 adds a directly registered Manchester Syntax parser that constructs the
Phase 1 structural model without RDF or RDF/XML interchange. Its covered scope
includes:

- immutable format/descriptor identity, Manchester media type/extensions, and
  bounded `Prefix:` / `Ontology:` detection;
- lazy two-pass tokenization: a bounded entity-frame pre-index followed by
  direct structural construction, with no token array or syntax-tree buffer;
- Unicode/SPARQL-style prefixed names and node IDs, comments, exact quoted
  strings, literal-suffix adjacency, numeric literals, language tags, typed
  literals, source locations, and UTF-8 token-byte accounting;
- ontology identity/version, imports, ontology annotations, nested annotations,
  automatic frame declarations, all frame sections and miscellaneous axioms,
  every required object/data expression, and all 38 required-v1 axiom kinds;
- forward object/data property typing from frames appearing later in the
  document and rejection of forbidden Manchester entity overloading;
- exact strict-mode failures plus the deliberately narrow compatible recovery
  for redundant predefined-prefix declarations;
- explicit `UnsupportedConstructError` for deferred `Rule:` / SWRL input;
- document-scoped anonymous individuals, `loadAnnotationAxioms` behavior,
  transaction-safe failure, finite resource limits, timeout enforcement, and
  cooperative cancellation;
- a project-owned Manchester/Functional structural-conformance pair, a pinned
  Java OWLAPI Manchester snapshot, exact machine-readable expected-difference
  rules, and repeated wall/heap evidence.

No package, lockfile, build, lint, test-runner, CI, dependency, resource-budget,
benchmark-corpus, or performance-threshold configuration changed.

## Assumptions entering the phase

1. The Functional parser's manager, transaction, resource, diagnostic, and
   structural-construction seams could be reused without a new public API.
2. Manchester's frame grammar could be parsed lazily without materializing all
   tokens or an intermediate syntax tree.
3. Property categories could be determined from the complete document while
   still supporting forward references and enforcing the existing token budget.
4. A project-owned Manchester/Functional pair could supply structural
   conformance evidence because the pinned W3C OWL 2 test artifact contains no
   dedicated Manchester documents.
5. Java OWLAPI 5.5.1 could remain a black-box compatibility oracle while the
   W3C Manchester mapping stayed authoritative for syntax semantics.
6. Adding the Manchester descriptor after Functional would remain inside the
   accepted Phase 2 performance threshold.

Assumptions 1, 2, 4, 5, and 6 held. Assumption 3 required a bounded first pass:
single-pass construction cannot reliably distinguish an object property from a
data property when its defining frame appears later. The two passes share one
deadline and cancellation state, enforce token-length limits in both passes,
and count the document token budget only during the construction pass.

## Acceptance evidence

The final verification run passed 4 focused Manchester suites / 22 tests and 65
repository suites / 564 tests. The focused model regression and governance
suite are also green. Repository Prettier, HTML validation, Stylelint, ESLint,
and the production Vite build pass.

### Standards conformance

- Governing specification: W3C OWL 2 Manchester Syntax Second Edition.
- Manchester fixture:
  `util/owlapi-reference/fixtures/manchester/phase3-structural.omn`.
- Manchester SHA-256:
  `1228427c7788fb6c71977eafdd74afb344e28de8c72b14a48efcc2261750cbf7`.
- Functional counterpart:
  `util/owlapi-reference/fixtures/manchester/phase3-structural.ofn`.
- Functional SHA-256:
  `a5e59f739bd7adcb7320b59dd3e2018e9342e1969e1c3cdc40897eb06d3d58ee`.
- Structural result: ontology ID, imports, ontology annotations, and every
  axiom structural key are equal; all 38 axiom kinds occur.

The W3C Manchester publication defines the grammar and formal mapping but does
not publish a dedicated executable syntax suite in the pinned OWL 2 artifact.
Project-owned tests therefore cover positive and negative grammar, all frame
and expression productions, malformed input, unsupported rules, forward
typing, transaction behavior, and finite resource boundaries.

### Java differential

The pinned snapshot
`util/owlapi-reference/fixtures/manchester/phase3-structural.java.json` was
generated through OWLAPI 5.5.1 at revision
`d7e997a53b470e32700de89cc610d9daf01ea769`. It contains 58 axioms, 14
declarations, all 38 axiom families, nested ontology and axiom annotations,
typed/plain/language literals, one shared anonymous individual, and every
signature category.

Ontology identity, imports, annotations, axiom counts, total axiom count,
signatures, anonymous-individual relationships, and annotated values match.
The only semantic differences are two comparison facets in one data-property
range:

| Source  | W3C Manchester mapping / JavaScript | OWLAPI 5.5.1       |
| ------- | ----------------------------------- | ------------------ |
| `>= 0`  | `xsd:maxInclusive`                  | `xsd:minInclusive` |
| `<= 10` | `xsd:minInclusive`                  | `xsd:maxInclusive` |

The W3C formal mapping table is authoritative. The differential test decomposes
the rendered Java range axiom into structural fields and matches each changed
facet against exactly one fixture-, property-, value-, selector-, side-, and
cardinality-scoped `VALUE_CHANGED` rule. Unmatched actual differences,
ambiguous matches, and unsatisfied required rules are all zero.

### Resource and performance evidence

Resource tests cover token count and UTF-8 token length, input bytes, axioms,
blank nodes, expression depth, annotation depth, timeout, and
abort-before-completion behavior. The entity pre-index and construction pass
share cancellation and deadline state; the pre-index does not double-charge
the document's token-count limit.

Environment: Windows `10.0.26200` x64, Node.js `v24.17.0`, Intel i9-12900K,
one warm-up plus five measured runs, median aggregation, garbage collection
requested before each run.

| Fixture                  | Median wall ms | Median peak heap bytes | Median peak heap delta bytes |
| ------------------------ | -------------: | ---------------------: | ---------------------------: |
| 50,000 Manchester frames |         530.81 |            144,777,480 |                  137,913,208 |
| 16 MiB mismatched input  |          27.52 |             22,686,456 |                       33,112 |

The reproducible runner is `util/benchmark-owlapi-manchester.mjs`. Repeating
the Phase 2 benchmark produced maximum changes of +8.67% wall time and +1.72%
peak-heap delta; every signal remains below the unchanged 20% threshold. The
complete accepted measurements are in `performance/baseline.md`.

## Failed approaches and best-supported causes

1. A construction-only single pass could not type forward property references.
   Manchester chooses object-vs-data restrictions and facts from global frame
   typing, so guessing from the following value would be ambiguous and could
   silently change semantics. A bounded lazy frame pre-index provides the
   necessary document-wide fact without retaining a token array or AST.
2. Treating the Java rendered range axiom as one atomic string would turn two
   facet-value changes into a whole-axiom missing/extra pair. That loses the
   exact semantic location and encourages broad exceptions. The final
   differential representation decomposes the range into property, datatype,
   literal-keyed facets, facet IRI, and value datatype before diffing.
3. The first Java fixture shape placed data-property use before its frame,
   which the Java Manchester parser rejected even though the JavaScript parser
   intentionally supports document-wide forward typing. The shared oracle
   fixture was reordered for Java; a separate focused JavaScript test protects
   the W3C/global forward-reference behavior.
4. Java OWLAPI rejected a W3C special datatype shorthand in one data-range
   context. The oracle fixture uses explicit `xsd:` datatype IRIs, while focused
   JavaScript tests retain all four Manchester shorthand forms.
5. Combining some class sections and using a mixed object/data `HasKey` in the
   Java fixture produced parser-specific results. The oracle fixture uses
   repeated frames and an object-only key; project-owned grammar tests retain
   combined frame sections and mixed keys.
6. Using the OWL2VOWL shaded JAR as the structural oracle introduced its older
   OWLAPI/RDF4J dependency graph and class conflicts. The final run uses the
   pinned OWLAPI 5.5.1 build and resolved runtime classpath; the shaded JAR
   remains isolated to the later end-to-end VOWL oracle.
7. The first Java comparison revealed that direct ontology signatures searched
   JavaScript axioms but not ontology annotations. A focused model regression
   now requires outer and nested ontology annotation properties in the direct
   signature, matching the pinned oracle.
8. Numeric annotation targets initially fell through to abbreviated-IRI
   expansion. The grammar permits both IRIs and literals in that position, so
   the parser now recognizes valid numeric literal forms before the IRI
   fallback and retains context-specific rejection of malformed data values.

## Material findings and dispositions

| ID       | Applicability                                  | Primary disposition      | Summary                                                                                   |
| -------- | ---------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| `M3-001` | `OWL_NATIVE`, `TEXTUAL_PARSER`, `PERFORMANCE`  | `PLAYBOOK_UPDATE`        | Forward frame typing requires a bounded lazy pre-index, not guessing or buffering.        |
| `M3-002` | `TEXTUAL_PARSER`, `SECURITY`, `PERFORMANCE`    | `PLAYBOOK_UPDATE`        | Multi-pass parsers share one deadline/cancellation budget and count document tokens once. |
| `M3-003` | `TEXTUAL_PARSER`, `SYNTAX_LOCAL`, `TESTING`    | `TEST_OR_FITNESS_UPDATE` | Grammar context must disambiguate numeric literals from abbreviated IRIs.                 |
| `M3-004` | `OWL_NATIVE`, `CROSS_CUTTING`, `TESTING`       | `TEST_OR_FITNESS_UPDATE` | Ontology and nested annotations participate in direct signatures.                         |
| `M3-005` | `TESTING`, `PROVENANCE`, `CROSS_CUTTING`       | `PLAYBOOK_UPDATE`        | Rendered oracle strings are decomposed before atomic semantic diffing.                    |
| `M3-006` | `TESTING`, `PROVENANCE`, `SYNTAX_LOCAL`        | `TEST_OR_FITNESS_UPDATE` | Two W3C-correct facet mappings require exact Java-only rules.                             |
| `M3-007` | `OWL_NATIVE`, `TEXTUAL_PARSER`, `SYNTAX_LOCAL` | `TEST_OR_FITNESS_UPDATE` | `that` accepts restrictions only, and facts accept named properties only.                 |
| `M3-008` | `TESTING`, `PROVENANCE`, `SYNTAX_LOCAL`        | `TEST_OR_FITNESS_UPDATE` | A project-owned cross-syntax pair fills the absent Manchester suite role.                 |
| `M3-009` | `PROVENANCE`, `TESTING`                        | `NO_CHANGE`              | The pinned OWLAPI runtime classpath remains the structural-oracle method.                 |
| `M3-010` | `PERFORMANCE`, `CROSS_CUTTING`                 | `NO_CHANGE`              | Manchester establishes a baseline without regressing Phase 2 signals.                     |
| `M3-011` | `OWL_NATIVE`, `TEXTUAL_PARSER`, `TESTING`      | `TEST_OR_FITNESS_UPDATE` | All supported frame mappings construct the canonical 38-axiom taxonomy.                   |

### `M3-001` and `M3-002` - bounded two-pass parsing

Evidence: the forward-property regression, token-count boundary, timeout test,
abort test, and 50,000-frame benchmark. Institutionalization: parser pre-index,
shared execution budget, single governed token count, and the rewritten
playbook. No public API or resource value changed.

### `M3-003` - grammar context resolves lexical ambiguity

Evidence: a RED regression produced an IRI for `-1.5` in an annotation target.
Institutionalization: the lexer exposes its numeric-form predicate and the
annotation parser checks it before IRI expansion. Malformed floating forms
remain rejected in literal-only fact positions.

### `M3-004` - ontology annotations belong in signatures

Evidence: the pinned Java signature contained `rdfs:label` and `rdfs:comment`
while the initial JavaScript result did not. Institutionalization: focused model
regression, corrected direct-signature traversal, differential protection, and
an explicit Phase 3 provenance amendment to the Phase 1 ontology module.

### `M3-005` and `M3-006` - semantic differences stay atomic

Evidence: the facet snapshot has exactly two `VALUE_CHANGED` nodes after
structural decomposition. Institutionalization: two required exact-cardinality
manifest rules, stronger governance validation, zero-tolerance differential
matching, and current playbook guidance. No conformance failure is waived.

### `M3-007` - reject convenient but non-W3C extensions in strict mode

Evidence: RED regressions initially accepted `:B that :C` and an inverse object
property in `Facts:`. Institutionalization: restriction-only `that` parsing and
named-property fact validation; a positive `that` restriction case protects the
valid production.

### `M3-008` - project-owned structural pairs need immutable identity

Evidence: both fixture hashes are asserted before the cross-syntax comparison.
Institutionalization: stored Manchester and Functional sources, exact digests,
all-axiom structural equality, and documented Java snapshot provenance.

### `M3-009` - keep the Java oracle isolated

The Phase 2 classpath lesson remained correct. Primary disposition is
`NO_CHANGE`: no new runtime dependency or production use was introduced, and
the harness README already prohibits substituting the OWL2VOWL shaded JAR.

### `M3-010` - no accepted performance signal regressed

Primary disposition is `NO_CHANGE`: Manchester has its first accepted baseline
and every repeated Phase 2 signal is below the existing threshold. No budget,
threshold, or implementation follow-up is justified by the measurements.

### `M3-011` - frame syntax still terminates at the structural model

Evidence: focused tests and the Manchester/Functional pair contain every
`AXIOM_KINDS` member. Institutionalization: exhaustive kind assertion, Java
count/signature comparison, and typed `Rule:` failure for deferred SWRL.

## Compatibility findings

- The W3C Manchester grammar and formal mapping remain authoritative; OWLAPI is
  a compatibility oracle and does not override the comparison-facet table.
- Reserved predefined-prefix recovery is compatible-only, positively detected,
  and limited to an identical namespace binding.
- Java fixture ordering and syntax choices are oracle accommodations, not
  restrictions on the JavaScript parser's documented W3C behavior.
- OWLAPI-generated anonymous labels are compared by source-local identity and
  relationships, never by generated text.
- `Rule:` remains the explicitly deferred SWRL capability and fails before any
  transaction is committed.

## Unresolved questions and dependency impact

There are no unresolved questions that can alter Phase 4 behavior, no unfinished
`LOCAL_PHASE_FOLLOW_UP`, no blocking normative proposal, and no unapplied
playbook or executable-protection disposition. A future W3C erratum or revised
Manchester publication could govern a separately approved facet-mapping change;
the currently published formal table remains authoritative and the exact Java
difference rules make any change mechanically visible.

## Mechanically reviewable completion summary

- Migration: Phase 3 Manchester Syntax.
- Lesson record: `docs/owlapi-js/migration/lessons/002-manchester-syntax.md`.
- Finding IDs: `M3-001` through `M3-011`; every finding has exactly one primary
  disposition.
- Playbook changed: yes; bounded frame pre-indexing, shared multi-pass budgets,
  lexical-context disambiguation, annotation signatures, structural atomic
  differential comparison, and the Phase 4 handoff are current guidance.
- Executable protections added: parser/lexer regressions, resource/abort tests,
  immutable cross-syntax fixtures, Java structural differential with exact
  rules, governance checks, model signature regression, and repeated wall/heap
  benchmark.
- Normative-change proposals: none.
- Unresolved blockers: none.
- Next migration: Phase 4 OWL/XML, blocked until the repository owner creates
  the requested Phase 3 checkpoint commit and explicitly says to proceed.
