# Phase 11 KRSS-family lesson record

## Migration identity

- Migration: Phase 11 - KRSS family.
- Baseline revision: `5ec5ccf6`, the pre-Phase-11 repository head.
- Completion revision: the Phase 11 checkpoint commit containing this record;
  the repository owner requested an uncommitted review pause before assigning
  its commit ID.
- Implementation date: 21 August 2026.
- Next migration: Phase 12 - N-Triples.

## Implemented scope

Phase 11 registers strict KRSS2 as an OWL-native textual format. A shared lazy
KRSS-family lexer and a distinct dialect policy provide a future KRSS1 insertion
point, but only the KRSS2 descriptor is executable. KRSS1 remains `DEFERRED` and
explicit selection of its already-existing format identity still fails because
no parser is registered.

The independently authored recursive-descent parser constructs immutable
structural OWL objects directly. It covers the public KRSS2 class-expression,
concept-axiom, role-expression, role-axiom, primitive-role attribute, and
individual-assertion productions. It performs no RDF serialization, RDF-to-OWL
translation, or retained legacy-parser call.

## Acceptance evidence

| Gate | Result | Primary evidence |
| --- | --- | --- |
| Dialect separation | Shared and KRSS2-only vocabulary is classified independently; KRSS2-only forms are invalid KRSS1 and no KRSS1 parser is registered | `krss/dialect.test.js`; `krss2Syntax.detection.test.js` |
| Grammar | All required KRSS2 expressions, role attributes, role chains, assertions, keyword case rules, reserved names, and TBox/ABox ordering are covered | `krss2Syntax.test.js`; `krss2Syntax.conformance.test.js` |
| Resources/security | UTF-8 input/token accounting, token and axiom counts, bounded lookahead, depth, timeout, abort/yield, locations, and rollback are governed | `krss/lexer.test.js`; `krss2Syntax.resource.test.js` |
| Structural differential | One 12-axiom subset agrees exactly across KRSS2, DL, Functional, Manchester, OWL/XML, RDF/XML, and Turtle | `krss2Syntax.differential.test.js` |
| Java oracle | The pinned OWLAPI 5.5.1 KRSS2 parser agrees on all 12 reachable axiom counts and signature categories | `GenerateKRSS2SyntaxSnapshot.java`; `phase11-structural.java.json` |
| Production integration | Default-manager direct loads, import closures, and WebVOWL conversion use the new structural parser; legacy reachability remains prohibited | `krss2Syntax.integration.test.js`; `productionGraph.architecture.test.js` |
| Performance | Accepted 50,000-axiom and 256-level signals; same-revision registry regressions stay within the unchanged 20% threshold | `performance/baseline.md`; `benchmark-owlapi-krss2.mjs` |
| Provenance | Every new production module and the narrow grammar inspection are recorded against the pinned revision | `provenance/provenance.json`; `governance.test.js` |

## Findings and dispositions

| ID | Applicability | Primary disposition | Finding |
| --- | --- | --- | --- |
| `M11-001` | `OWL_NATIVE`, `ARCHITECTURE` | `PLAYBOOK_UPDATE` | Shared lexical machinery must remain dialect-neutral; parser registration, format identity, and grammar legality stay dialect-specific. |
| `M11-002` | `OWL_NATIVE`, `TESTING` | `TEST_OR_FITNESS_UPDATE` | A deferred compatibility identity needs executable negative evidence: format metadata alone does not prove that no parser alias exists. |
| `M11-003` | `TEXTUAL_PARSER`, `COMPATIBILITY` | `TEST_OR_FITNESS_UPDATE` | Per-production documentation can omit a whole-document phase rule; the pinned parser requires all TBox statements before ABox statements. |
| `M11-004` | `TEXTUAL_PARSER`, `COMPATIBILITY` | `TEST_OR_FITNESS_UPDATE` | KRSS keywords are reserved lexical tokens, so a keyword-valued entity must use an absolute IRI spelling rather than a bare name. |
| `M11-005` | `OWL_NATIVE`, `PROVENANCE` | `PLAYBOOK_UPDATE` | Absolute-IRI oracle fixtures isolate axiom semantics from a pinned parser's malformed `Optional[...]` bare-name base. Independent tests must still govern the project namespace policy. |
| `M11-006` | `OWL_NATIVE`, `MODEL` | `TEST_OR_FITNESS_UPDATE` | One primitive-role statement can yield several axioms; parser transactions need an atomic multi-axiom seam and rollback evidence. |
| `M11-007` | `TEXTUAL_PARSER`, `SECURITY` | `TEST_OR_FITNESS_UPDATE` | A small lookahead bound and code-point UTF-8 accounting keep shared lexing safe without eager token arrays. |
| `M11-008` | `TESTING`, `CROSS_CUTTING` | `PLAYBOOK_UPDATE` | Cross-format claims should include every implemented OWL-native and RDF syntax that can express the chosen subset, not only convenient existing pairs. |
| `M11-009` | `TOOLING`, `PROVENANCE` | `PLAYBOOK_UPDATE` | On Windows, `java` and `javac` can resolve from different installations; the long-classpath launcher must invoke compiler mode independently of the runtime's `java.home`. |
| `M11-010` | `PERFORMANCE`, `TESTING` | `NO_CHANGE` | Same-revision descriptor-list pairs continue to isolate bounded detector overhead without re-anchoring historical baselines or thresholds. |

## KRSS1/KRSS2 grammar gap

The public OWLAPI identities share primitive/defined concepts, primitive roles,
Boolean and quantified class expressions, cardinalities, transitivity, range,
and basic individual assertions. KRSS2 adds general implication/equivalence and
disjointness, richer role definitions and attributes, inverse roles, role
equivalence/disjointness/inclusion and nested composition. The dialect policy
records that gap without creating a KRSS1 parser. A future KRSS1 implementation
requires an explicit capability promotion and a separate descriptor.

## Reference behavior and controlled boundaries

Narrow source inspection followed public documentation and compiled black-box
probing only for unresolved grammar boundaries. It established operand order,
ordered and mutually exclusive primitive-role attributes, `t`/`nil` booleans,
reserved tokens, and TBox-before-ABox ordering. No Java or retained legacy
control flow was copied.

The pinned Java parser constructs malformed `Optional[...]#name` bases for bare
names in the oracle setup. The shared Java fixture therefore uses absolute IRIs.
JavaScript deliberately resolves ordinary bare names against the document IRI,
or an isolated per-load namespace when no document IRI exists; focused tests,
not an expected-difference wildcard, define that controlled correction.

## Performance and dependency impact

KRSS2 adds no production dependency, package or lockfile change, configuration
change, resource-ceiling change, or regression-threshold change. The accepted
run measured 50,000 implications at 820.87 ms median and 256 nested existential
restrictions at 75.19 ms median. Same-revision Functional-depth and mismatch
wall regressions were +0.28% and +0.85%; the largest paired heap regression was
+3.05%, all below the unchanged 20% threshold.

## Impact on Phase 12

N-Triples is the next syntax and reuses the private N3.js adapter established by
Turtle rather than the OWL-native textual-parser stack. Phase 12 must preserve a
distinct N-Triples format/descriptor, strict W3C RDF 1.1 and RDF 1.2 corpus
classifications, default-graph normalization, bounded detection, direct RDF/JS
quads, shared RDF-to-OWL reconstruction, import/WebVOWL reachability, and its own
resource, differential, performance, provenance, and learning gates.

## Unresolved questions

There are no unresolved Phase 11 grammar, dialect, conformance, differential,
resource, dependency, production-integration, provenance, or performance
blockers and no unfinished `LOCAL_PHASE_FOLLOW_UP`. KRSS1 parser implementation
is an explicit future capability, not unfinished Phase 11 work.

## Mechanically reviewable completion summary

- Migration: Phase 11 KRSS family.
- Lesson record: `docs/owlapi-js/migration/lessons/010-krss-family.md`.
- Finding IDs: `M11-001` through `M11-010`; every finding has exactly one
  primary disposition.
- Playbook changed: yes; Phase 11 evidence is institutionalized and the next
  migration section advances to Phase 12.
- Executable protections added: dialect classification, KRSS1 non-registration,
  grammar positives/negatives, reserved names, document ordering, resources,
  cancellation/yield, rollback, namespace isolation, pinned Java evidence,
  seven-format structural equivalence, direct/import/WebVOWL integration, and
  same-revision performance measurement.
- Normative-change proposals: none.
- Resource-budget or regression-threshold changes: none.
- Unresolved blockers: none.
- Next migration: Phase 12, blocked until the repository owner creates the
  requested Phase 11 checkpoint commit and explicitly says to proceed.
