# Phase 10 DL Syntax lesson record

## Migration identity

- Migration: Phase 10 - DL Syntax.
- Baseline revision: `0a0a57bb6d76cc3e48a89b716c91511164f7c674`, the
  pre-Phase-10 repository head.
- Completion revision: the Phase 10 checkpoint commit containing this record;
  the repository owner requested an uncommitted review pause before assigning
  its commit ID.
- Implementation date: 21 August 2026.
- Next migration: Phase 11 - KRSS family.

## Implemented scope

Phase 10 registers DL Syntax as an OWL-native textual format. Its pull lexer and
recursive-descent parser create immutable structural OWL objects directly; they
do not construct RDF, call the shared RDF-to-OWL translator, or import retained
legacy parser/converter code. The parser supports the published and pinned
OWLAPI dialect's ASCII, TeX, and Unicode operators, including class and property
axioms, assertions, Boolean and quantified expressions, cardinalities,
nominals, data one-of, inverse properties, property chains, and transitivity.

The phase adds bounded tri-state detection, longest-token lexing, source-aware
diagnostics, cancellation and timeout checks, cooperative yields,
transactional rollback, per-document headerless namespaces, direct and import
manager integration, complete WebVOWL conversion, a cross-format structural
fixture, a pinned Java snapshot harness, controlled Java-dialect corrections,
and dedicated depth, throughput, and mismatch benchmarks.

## Acceptance evidence

| Gate | Result | Primary evidence |
| --- | --- | --- |
| Grammar inventory | Published DL notation and the pinned OWLAPI grammar are mapped to focused positive, alias, malformed, and reachability cases | `dlSyntax.test.js`; `provenance/provenance.json` |
| Detection | Bounded selection recognizes representative, same-individual-only, and transitive-only documents while preserving strong negatives | `dlSyntax.detection.test.js`; `descriptor.js` |
| Resources/security | Input, token, axiom, expression-depth, timeout, abort, scheduling, and rollback behavior are governed | `dlSyntax.resource.test.js`; `lexer.test.js` |
| Structural differential | The shared DL, Functional, RDF/XML, and Turtle fixture agrees on every non-declaration axiom and complete signature; the exact RDF-only declaration remainder is asserted | `dlSyntax.differential.test.js` |
| Java oracle | The pinned OWLAPI 5.5.1 parser produces the committed 15-axiom structural snapshot for the reachable shared subset | `GenerateDLSyntaxSnapshot.java`; `fixtures/dl/phase10-structural.java.json` |
| Controlled corrections | Terminal line endings, attached leading colons, assertion dispatch, inverse equivalence, numeric data nominals, and unmatched renderer-shaped subclass rules are tested without copying reference defects | `dlSyntax.conformance.test.js`; `parser-surface.md`; `provenance.json` |
| Production integration | Default-manager direct loads, import closures, and complete WebVOWL conversion use the structural DL parser | `dlSyntax.integration.test.js` |
| Performance | The new parser has accepted 50,000-axiom and governed-depth signals; the same-revision registry pair isolates DL detector overhead within the unchanged 20% threshold | `performance/baseline.md`; `benchmark-owlapi-dl.mjs` |
| Repository verification | 7/52 focused Phase 10 suites/tests pass; complete repository totals are recorded in `migration-status.md` at checkpoint closure | focused and complete Jest runs |

## Findings and dispositions

| ID | Applicability | Primary disposition | Finding |
| --- | --- | --- | --- |
| `M10-001` | `OWL_NATIVE`, `PROVENANCE`, `TESTING` | `PLAYBOOK_UPDATE` | For a non-standardized syntax, narrowly governed source inspection can answer grammar questions that public documents and black-box probing cannot, without authorizing source translation. |
| `M10-002` | `OWL_NATIVE`, `TEXTUAL_PARSER`, `TESTING` | `TEST_OR_FITNESS_UPDATE` | Grammar inventory and whole-document reachability are different surfaces; reference dispatcher defects must not erase otherwise valid productions from the project parser. |
| `M10-003` | `TEXTUAL_PARSER`, `SYNTAX_LOCAL`, `TESTING` | `TEST_OR_FITNESS_UPDATE` | Longest-token matching must precede operator aliases because TeX and Unicode spellings can also prefix valid identifiers. |
| `M10-004` | `OWL_NATIVE`, `CROSS_CUTTING`, `TESTING` | `PLAYBOOK_UPDATE` | Headerless syntaxes need an isolated deterministic namespace derived from the document IRI or allocated per anonymous load. |
| `M10-005` | `TEXTUAL_PARSER`, `PROVENANCE`, `TESTING` | `TEST_OR_FITNESS_UPDATE` | Ordinary terminal transport whitespace and attached leading-colon names are valid project inputs even where the pinned Java parser rejects them accidentally. |
| `M10-006` | `RDF_MAPPING`, `OWL_NATIVE`, `TESTING` | `PLAYBOOK_UPDATE` | Cross-format RDF fixtures may need explicit declarations for deterministic RDF-to-OWL reconstruction; compare semantics and signatures, then assert the exact declaration-only remainder. |
| `M10-007` | `OWL_NATIVE`, `TESTING`, `CROSS_CUTTING` | `TEST_OR_FITNESS_UPDATE` | Renderer-shaped property rules may replace a subclass axiom only on a complete match; an unmatched general axiom must never disappear. |
| `M10-008` | `TEXTUAL_PARSER`, `SECURITY`, `TESTING` | `TEST_OR_FITNESS_UPDATE` | A detector inventory must include documents whose only decisive operator is equality or transitivity membership, not only subclass and equivalence forms. |
| `M10-009` | `OWL_NATIVE`, `CROSS_CUTTING`, `TESTING` | `TEST_OR_FITNESS_UPDATE` | Direct, imported, and WebVOWL routes are separate reachability claims and all must prove that retained legacy modules remain outside production. |
| `M10-010` | `PERFORMANCE`, `TESTING`, `CROSS_CUTTING` | `NO_CHANGE` | A same-process Phase 9/Phase 10 registry pair isolates the incremental detector cost when runtime or lockfile identity makes historical absolute mismatch medians non-comparable. |

## Reference-dialect corrections

The shared Java snapshot intentionally uses only productions reachable through
the pinned parser's document dispatcher. Focused project tests separately retain
the full inventoried grammar. This exposed several observable Java defects:
terminal CR/LF is rejected, a leading colon attached to an identifier can be
tokenized as part of that identifier, assertion-shaped documents can be routed
to the wrong production, inverse equivalence is unreachable, numeric data
one-of can be treated as an object nominal, and one unmatched renderer-shaped
subclass rule can return no axiom.

These are controlled corrections, not unexplained differential exceptions. The
Java harness strips only terminal CR/LF so its committed snapshot is stable;
all other corrections live in independent JS tests and provenance records. No
expected-difference rule is required because every construct deliberately
shared with the Java fixture compares exactly.

## Performance and dependency impact

DL Syntax adds no production dependency, package change, configuration change,
resource-ceiling change, or regression-threshold change. The parser benchmark
uses one warm-up and five measured runs for 50,000 subclass axioms, governed
nested restrictions, and paired 16 MiB mismatch rejection. The mismatch pair
constructs the Phase 9 and Phase 10 registries on the same source revision,
runtime, dependency tree, process, and fixture, isolating only registration of
the DL descriptor.

## Impact on Phase 11

KRSS2 is the next required OWL-native headerless syntax. It inherits the DL
controls for per-document namespaces, longest-token matching, direct structural
construction, bounded detection and lexing, rollback, diagnostics, resources,
Java reachable-subset snapshots, cross-format comparison, import/WebVOWL
integration, and same-revision performance controls. KRSS1 remains a distinct
deferred identity and must not become an accidental alias of KRSS2.

## Unresolved questions

There are no unresolved Phase 10 grammar, conformance, differential, resource,
dependency, production-integration, provenance, or performance blockers and no
unfinished `LOCAL_PHASE_FOLLOW_UP`.

## Mechanically reviewable completion summary

- Migration: Phase 10 DL Syntax.
- Lesson record: `docs/owlapi-js/migration/lessons/009-dl-syntax.md`.
- Finding IDs: `M10-001` through `M10-010`; every finding has exactly one
  primary disposition.
- Playbook changed: yes; Phase 10 evidence is institutionalized and the next
  migration section advances to Phase 11.
- Executable protections added: aliases and longest-token lexing, malformed
  input, detection positives/negatives, resources, abort/timeout/yield,
  rollback, namespace isolation, complete grammar inventory, pinned Java
  snapshot, controlled corrections, cross-format structure, direct/import/VOWL
  integration, and paired-registry performance measurement.
- Normative-change proposals: none.
- Resource-budget or regression-threshold changes: none.
- Unresolved blockers: none.
- Next migration: Phase 11, blocked until the repository owner creates the
  requested Phase 10 checkpoint commit and explicitly says to proceed.
