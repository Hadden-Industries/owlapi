# ADR 0008: Promote original KRSS/KRSS1 into v1

| Metadata    | Value                                                                 |
| ----------- | --------------------------------------------------------------------- |
| **Status**  | Accepted                                                              |
| **Date**    | 2026-08-22                                                            |
| **Decider** | Repository owner                                                      |
| **Amends**  | `docs/adr/0002-prioritize-rdf-ingestion-and-early-webvowl-cutover.md` |

## Context

Phase 11 implemented strict KRSS2, preserved original KRSS/KRSS1 as a distinct
OWLAPI format identity, and deliberately left the KRSS1 parser deferred. That
was a sound checkpoint boundary, but it left one OWLAPI parser family without
an executable JavaScript counterpart.

The repository owner now wants to close the KRSS parser surface before physical
legacy deletion. Phase 16 has completed and been committed, so the smallest
sequential change is to add KRSS1 as the next parser phase, then shift deletion
and packaging by one phase.

A strict provenance review found no public historical ontology artifact for
either OWLAPI-style KRSS1 or KRSS2 that simultaneously has community value,
preserved source bytes, first-party maintenance or authorship in the claimed
dialect, exact dialect identification, credible release history, and lawful
public redistribution. Historical conversions, projections, reconstructed
snippets, and adjacent KRSS-family languages cannot honestly fill that gap.

## Decision

1. `parser.krss1` is promoted from `DEFERRED` to `REQUIRED_V1`, with
   `NOT_STARTED` progress and Phase 17 ownership until its acceptance gate
   passes.
2. Phase 17 implements original KRSS/KRSS1 as a distinct parser, descriptor,
   format, detection, diagnostic, fixture, and Java behavioural-oracle surface.
3. KRSS1 and KRSS2 use dialect-specific adapters over a shared KRSS core. Only
   productions with demonstrably common syntax and observable semantics belong
   in that core; a permissive union parser is forbidden.
4. Explicit KRSS1 or KRSS2 format selection is exact. Definite KRSS2-only
   content is not KRSS1. Shared-only syntax remains dialect-ambiguous; a generic
   unresolved `.krss` hint tries the narrower KRSS1 descriptor before KRSS2.
   A claimed but malformed syntax does not fall through.
5. Phase 17 records the zero qualifying historical-corpus result in a
   machine-readable register and keeps five fixture classes separate:
   project-owned grammar fixtures, historical adjacent dialects, extended-KRSS
   negatives, converted real ontologies, and any future qualifying first-party
   strict corpus. Only the last may be called a historical KRSS corpus.
6. The absence of a qualifying corpus does not relax the finite grammar,
   black-box Java differential, cross-format structural-equivalence,
   diagnostics, resource, browser/Node, import, WebVOWL, performance, governance
   or learning gates.
7. Physical legacy deletion moves from Phase 17 to Phase 18. Standalone
   package/release work moves from Phase 18 to Phase 19. The retained legacy
   files remain unmoved and production-unreachable until Phase 18.
8. Historical ADRs, lesson records, and Phase 11 provenance continue to state
   the earlier deferred checkpoint. Current normative documents and
   machine-readable capability records carry this amended decision.

## Rationale

Implementing the missing parser now closes a finite OWLAPI compatibility gap
before destructive cleanup removes useful reference material. Separate
dialect adapters preserve conceptual integrity: shared tokens and expressions
can be reused without erasing the distinct contracts that OWLAPI itself
exposes.

Trying the narrower grammar first for unresolved `.krss` input is deterministic
and conservative. Extension-only evidence still selects KRSS2, while syntax
accepted by the original dialect is not silently labeled as the extension
because of registration order.

The explicit zero-corpus record is more rigorous than manufacturing realism.
It lets future contributors add a genuinely qualifying artifact without
confusing it with a projection or related historical language, while current
correctness is established through exhaustive project-owned and behavioural
evidence.

## Consequences

### Positive

- v1 covers both OWLAPI KRSS parser identities.
- Phase 11's lexer and dialect work is reused through a deeper module boundary
  without copying the KRSS2 parser.
- Corpus claims become auditable and cannot drift from fixture provenance.
- Legacy deletion remains a clean, separately reviewable checkpoint.

### Negative and mitigations

- Release and deletion move back by one phase. The phase remains WIP-locked and
  must pause at its own Git checkpoint.
- Shared KRSS syntax cannot always identify a dialect from bytes alone. Exact
  caller selection and the documented narrower-first generic `.krss` policy
  make the ambiguity deterministic.
- Real-world confidence cannot come from a qualifying historical corpus today.
  The finite grammar inventory, Java oracle, structural-equivalence suite,
  integration tests, and explicit empty corpus register make that limitation
  visible instead of hiding it.

## Rejected alternatives

| Alternative                                      | Reason not selected                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Keep KRSS1 deferred                              | Leaves a known OWLAPI parser-surface gap immediately before release cleanup              |
| Alias KRSS1 to the KRSS2 parser                  | Erases dialect identity and permits KRSS2-only vocabulary under the KRSS1 contract       |
| Copy the KRSS2 parser into a KRSS1 directory     | Duplicates grammar and diagnostics while obscuring which behavior is genuinely shared    |
| Use one permissive union parser with mode flags  | Scatters dialect policy and makes detection, diagnostics, and future maintenance brittle |
| Add projected/reconstructed files as real corpus | Misstates provenance and does not test historically authored KRSS1 artifacts             |
| Delete legacy files before KRSS1                 | Mixes destructive cleanup with the final parser migration and removes reference seams    |

## Verification obligations

- Capability, parser-surface, migration-status, playbook, implementation-plan,
  governance-test, and local source-comment claims agree on Phase 17
  `REQUIRED_V1` / `NOT_STARTED` status.
- No KRSS1 descriptor is registered or advertised before its complete Phase 17
  gate passes.
- Phase 17 creates the machine-readable zero-corpus/evidence-class register and
  never labels an adjacent or converted fixture as historical strict KRSS1.
- KRSS2 behavior remains green across extraction into a shared core.
- Phase 18 and Phase 19 references replace current deletion and packaging phase
  assignments without rewriting historical checkpoint records.

## Implementation map

| Path                                                           | Role                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| `docs/owlapi-js/implementation-plan.md`                        | Current normative Phase 17 contract                  |
| `docs/owlapi-js/compatibility/capabilities.json`               | Required capability and phase assignment             |
| `docs/owlapi-js/compatibility/parser-surface.md`               | OWLAPI parser/format identity inventory              |
| `docs/owlapi-js/migration/migration-status.md`                 | Current phase and advertised-format state            |
| `docs/owlapi-js/migration/parser-migration-playbook.md`        | Canonical Phase 17 execution method                  |
| `src/owlapi-js/governance.test.js`                             | Machine-enforced planning classification             |
| `src/owlapi-js/parser/krss/` and `src/owlapi-js/parser/krss1/` | Shared-core and dialect-adapter implementation seams |
