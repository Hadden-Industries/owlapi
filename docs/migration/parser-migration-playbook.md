# Parser migration playbook

This file is the current method for the next migration. Rewrite obsolete advice;
do not append chronology here.

## Pre-flight

1. Confirm the prior ingestion learning gate is closed and only one ingestion migration is active.
2. Consult `provenance/provenance.json` before reading or changing legacy code.
3. Enumerate the public grammar and the OWLAPI parser/factory/format identity.
4. Map every required production to a structural `OWLDataFactory` constructor.
5. Write focused tests at the new abstraction boundary before correcting behavior.

## Implementation

- Parse OWL-native syntax directly into immutable structural OWL objects.
- Keep lazy pull tokenization and bounded lookahead; do not materialize a token
  array. Enforce UTF-8 token length while scanning, and check cancellation and
  the monotonic deadline after bounded units of lexical work.
- Keep detection within `maxSniffBytes`. Compatibility recovery is available
  only after a positive detector match; syntax hints do not authorize broad
  fallback.
- Yield between top-level constructs after approximately 50 ms of work. Prefer
  `scheduler.yield()` where available and use a zero-delay timer fallback so
  browsers and Node can deliver aborts without changing parse order.
- Preserve operand category, arity, optionality, and ordered-vs-unordered semantics.
- Preserve IRIs, literals, language/datatype, annotations, and anonymous individuals end to end.
- Preserve anonymous-individual labels within one document scope and
  standardize them apart across source documents.
- Treat literal suffix adjacency and prefixed-name token boundaries as grammar,
  not whitespace-tolerant conveniences. Route plain and language-tagged
  literals through the shared data factory so every syntax inherits the same
  RDF 1.1 datatype model.
- If an archived fixture redundantly declares a predefined prefix, any
  compatibility recovery must require an exact standard binding. Strict mode
  still rejects the declaration; never accept a conflicting reserved binding.
- Use only canonical `kind` dispatch. Unknown supported-category kinds fail deterministically.
- Throw typed errors for unsupported constructs. Never use silent `null`, fallback values, or broad catch-and-continue.
- Parse into isolated transaction state; commit only after accepted success.

## Verification and handoff

1. Pin the exact upstream conformance artifact by immutable digest, classify
   every source test exactly once, and keep the runner's semantic scope explicit.
2. Run focused model/parser tests, structural snapshots, Java differential
   fixtures, resource/adversarial tests, the repeated wall/heap benchmark, and
   the complete WebVOWL suite.
3. Canonicalize Java differential output only for semantically irrelevant
   representation details such as unordered iteration, blank-node labels, or
   documented display-label spelling. Any semantic difference goes through the
   machine-readable expected-difference gate.
4. Use the Java oracle with its fully resolved runtime dependency classpath.
   Declare intentionally ignored fixture imports explicitly so their import
   declarations remain in the direct-ontology snapshot without network access.
5. Record every material finding with evidence and one primary disposition.
6. Turn reusable findings into tests/contracts where deterministic.
7. Update this playbook and all impacted future phase assumptions.
8. Close the mechanically reviewable learning gate before activating the next ingestion phase.

## Next migration: Phase 3 Manchester Syntax

- Reuse the Functional parser's descriptor/transaction/resource/cancellation
  pattern, but derive Manchester detection and recovery from its own public
  grammar; Functional prefix behavior is not automatically transferable.
- Map frames and inline expressions directly to the existing Phase 1 factory.
  Do not reuse the legacy RDF/XML emission path.
- Establish lexical regressions for frame delimiters, prefix/base handling,
  quoted names, literals, comments, and ambiguous keyword/entity positions
  before implementing production behavior.
- Reuse the pinned W3C artifact where it contains applicable Manchester
  documents; otherwise record the exact project-owned cross-syntax fixture
  source and classification scope.
- Repeat the Functional acceptance shape: exhaustive grammar coverage,
  transaction/import behavior, Java structural differential, resource and
  abort protection, repeated wall/heap measurements, provenance, and a formal
  learning gate. Do not change shared budgets or contracts without the
  repository-owner approval process.
