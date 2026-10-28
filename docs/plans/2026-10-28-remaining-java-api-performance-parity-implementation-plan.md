# Remaining Java API performance parity implementation plan

**Date:** 2026-10-28\
**Status:** DRAFT for owner review; implementation is not authorized by this document.\
**Decision owner:** Maksym Shostak.\
**Inspected source baseline:** `0efb284089b8238b14a163c129a099e5edd831d0`, local `main`, commit subject `perf: Optimize public APIs against a pinned Java OWLAPI baseline`.\
**Profiles:** `java-owlapi-5.5.1` and `normative-v1`.\
**Comparison authority:** the retained Java OWLAPI 5.5.1 performance baseline; no Java refresh was performed for this plan.

## Purpose and authority

Make the existing public JavaScript APIs more economical for Node.js and browser callers while preserving the observable behavior of each profile.
The outcome is lower cost for equivalent useful work, with an auditable disposition of the remaining performance gaps.
A smaller ratio obtained by doing less work, excluding an expensive profile, changing the semantic oracle, hiding first-use cost, or retaining unbounded caches does not meet that outcome.

The user requested this detailed HISEW implementation plan and its saved Markdown artifact.
That authorizes planning and source inspection.
It does not approve this draft design, product implementation, new dependencies, a commit, publication, consumer adoption, or release.
The proposed requirements, acceptance criteria, quality scenarios, decisions and risk route below are local **DRAFT** identifiers until the owner accepts their exact scope.
Existing behavior contracts remain authoritative; this plan does not reopen their accepted decisions by labeling new proposals as accepted.

The plan uses the structure and engineering principles of the installed HISEW planning skill, `hisew-dev 0.1.0-dev.29`.
Per the user's explicit instruction, bugged HISEW evidence demands are excluded from this work: no execution was started, adopted, rerouted or verified, and no HISEW state was changed.
Engineering checks proposed below are distinct from workflow bookkeeping.
The unrelated retained execution `cdb66758-6d47-434d-80a6-20cd70cd80e0` is not an implementation baseline for this plan.

The user also directed that `json-quality` not be repaired or upgraded while a new version is imminent.
JSON-tooling qualification is currently held/unconfirmed and must be rechecked before future implementation qualification.
This is neither a reason to withhold the plan nor proof of an unresolved product defect.
Do not install packages, change pins, patch tooling, weaken checks, or assert a passing result to close that gap.

## Source record and evidence boundaries

The exact Antigravity conversation is retained independently of this plan:

- Conversation ID: `01b2c35e-2244-456f-a915-4cd5b98c224d`.
- Title: `owlapi: Performance Optimisation`.
- Original read-only database: `C:\Users\maksy\.gemini\antigravity\conversations\01b2c35e-2244-456f-a915-4cd5b98c224d.db`.
- Title/annotation: `C:\Users\maksy\.gemini\antigravity\annotations\01b2c35e-2244-456f-a915-4cd5b98c224d.pbtxt`.
- Decoded extraction used for this review: `C:\Users\maksy\.codex\visualizations\2026\10\28\01a181fa-14b9-7f92-9aa5-7fac87424527\antigravity-conversation-extracted.json`.
- Decoder, if reconstruction is necessary: `C:\Users\maksy\.codex\visualizations\2026\10\28\01a181fa-14b9-7f92-9aa5-7fac87424527\read-antigravity.py`.

In the extraction, human requirements are type 14, field `.19.2`: step 0 requests paired performance measurements per public API with the same inputs in both JS profiles; step 472 requires Java measurement once per Java OWLAPI release, appending measurements only for new API members; step 507 requests severity-ordered optimization.
The initial human wording contains `5.1.1`; the implemented profile and retained authority are explicitly `java-owlapi-5.5.1`.
Assistant handoffs at steps 471, 506 and 965, fields `.20.8` or `.20.1`, explain the historical work, but their timing and completeness claims are not current verification.
Scoped passes at steps 934 and 947 do not erase earlier full-suite failures or qualify this candidate.

| Source                                                                                                                                                                                                                       | Use and limitation                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Current comparison JSON](../performance/java-api-performance-comparison.json)                                                                                                                                               | Authority for the recorded 70 grouped measurements and this plan's arithmetic; not a fresh execution or exhaustive method coverage claim.                                              |
| [Comparison Markdown](../performance/java-api-performance-comparison.md)                                                                                                                                                     | Human-readable tables; historical P1-P9 prose contains stale counts/timings. The generator also contains the stale `51 / 70` narrative.                                                |
| [Pinned Java baseline](../performance/java-owlapi-5.5.1-baseline.json)                                                                                                                                                       | Independent retained Java timing record. Preserve existing records and their provenance.                                                                                               |
| [Paired JS harness](../../util/benchmark-owlapi-java-parity.mjs), [harness tests](../../util/benchmark-owlapi-java-parity.test.js), [Java harness](../../util/owlapi-reference/BenchmarkPublicApiSurface.java)               | Owning implementations of timed operations, verification sinks, CLI and baseline reuse.                                                                                                |
| [Public API inventory](../compatibility/java-api-surface.json), [API reference](../../API.md), [package exports](../../package.json), [boundary tests](../../test/package-boundary.test.mjs)                                 | Starting authorities for enumerating actual exported callables and overloads; a top-level class inventory alone is insufficient.                                                       |
| [Behavior profiles](../compatibility/behavior-profiles.md), [parity decisions](../compatibility/java-api-parity-decisions.json), [implemented behavior plan](2026-10-13-java-compatible-api-behavior-implementation-plan.md) | Current profile identity, authority hierarchy, contracts and deliberate differences. Preserve them.                                                                                    |
| [Profile/default repair](2026-10-05-profile-performance-and-default-behavior-repair-plan.md), [locality resource decision](0.1.0-rc.2-locality-work-bound.md)                                                                | Historical rationale with later decisions: profile elapsed deadline defaults to `null`; locality has no default numerical cap. Current owning source resolves stale earlier proposals. |
| [Profile expected differences](0.1.0-rc.2-profile-expected-differences.md), [storage expected differences](0.1.0-rc.2-storage-expected-differences.md)                                                                       | Bounded semantic exceptions and positive/negative controls; never blanket performance waivers.                                                                                         |

The inspected baseline already contains the nine earlier optimizations: lazy referencing indexes; immutable configuration clone paths; imports/closure read caches; cached structural validation and unchanged-subtree reuse; coalesced profile/locality yielding; copy-on-write state with sequential mutation batching; EntitySearcher position indexes; DOM-free prefix validation; and lazy structural keys, tuple reuse and frozen visitor-table reuse.
Their presence is a source fact, not proof that all regressions are absent.
This plan targets residual cost and measurement integrity, not reimplementation of P1-P9.

## Scope, route and implementation entry decisions

In scope are the 22 currently flagged grouped cases, trustworthy coverage/comparability of the benchmark surface, and affected regressions of the other 48 cases.
The callable inventory must identify any additional unmeasured public API gaps; it must not silently enlarge this implementation into the full Java OWLAPI surface.
Newly discovered coverage work is planned and prioritized explicitly.

Out of scope are new public APIs, compatibility aliases or shims, profile/default changes, removal of validation or cancellation guarantees, dependency replacements/upgrades, JSON-tooling repair, unrelated architecture cleanup, HISEW repair, consumer changes, and a release campaign.
Existing native/reused components are the starting point.
A new parser, cache service, profiler dependency or library selection would require its own current selection, rights and integration decision; no such adoption is proposed here.

**Proposed route: R2 for runtime implementation.**
Shared structural values, snapshot caches, parsers, serialization and cooperative scheduling affect many callers; a small optimization can change failure timing, partial effects, resource enforcement or exported behavior.
Full relevant regression checks and independent verification are justified.
Planning itself remains a documentation activity.
No new R3 consequence is established by the present evidence.
The implementation owner must reassess the route if a concrete privileged, irreversible or critical-system consequence appears.

Before the affected implementation slice starts, the owner must accept or revise these concrete decisions:

1. The scoped draft REQ/AC/QA/DEC baseline and the desired callable coverage boundary.
2. Comparability dispositions for all mismatched and materially unequal-work cases, especially writer configuration and closure-provider forcing.
   A disputed Java measurement stays disputed unless narrowly authorized evidence resolves it.
3. Performance materiality, measurement host/runtime, sampling protocol, and acceptable first-use/memory/cancellation trade-offs.
   The optional progress target below is not accepted merely by inclusion here.
4. Named implementation integrator, semantic/oracle reviewer and verification observer.
   The role descriptions below do not fabricate assigned people or approval.
5. For any affected security boundary, the scope and accountable disposition of native security assessment.
   Unavailable assessment is an explicit gap, not a passing scan.

Missing formal dossiers and engine receipts do not prevent this reviewable draft.
A missing material semantic decision prevents only the dependent implementation, while independent source review and test design can continue.
Do not change a contract to resolve an uncertain benchmark result.

## Recorded residual inventory

The JSON records 70 grouped cases across 12 categories: **48 are at or below 1.10x Java in both profiles; 22 exceed 1.10x in at least one profile**.
The profile-specific slower counts are 12 compatible and 20 normative.
These are benchmark-case classifications, not counts of individually qualified public methods.

All times below are recorded median milliseconds for the complete case workload.
`C` means `java-owlapi-5.5.1`, `N` means `normative-v1`, and `excess` is JS median minus Java median; negative values mean JS was faster in that recording.
Ratios are the JSON's rounded ratios.
Neither the ratios nor the three-decimal medians supply statistical confidence.
Preserve the exact values instead of deriving a new classification from rounded display values.

| Case ID                                     | Java ms | C ms / ratio / excess ms | N ms / ratio / excess ms | Planned path / admission caveat                                                    |
| ------------------------------------------- | ------: | ------------------------ | ------------------------ | ---------------------------------------------------------------------------------- |
| `util.OWLOntologyImportsClosureSetProvider` |   0.099 | 0.742 / 7.49x / +0.643   | 0.907 / 9.16x / +0.808   | SLICE-009; tiny denominator, Java `Stream.count()` versus fresh JS Set.            |
| `search.annotations`                        |   3.313 | 6.427 / 1.94x / +3.114   | 14.073 / 4.25x / +10.760 | SLICE-002; deferred forcing, assertion annotations and per-ontology deduplication. |
| `config.OWLOntologyWriterConfiguration`     |   0.155 | 0.457 / 2.95x / +0.302   | 0.305 / 1.97x / +0.150   | SLICE-007; verification counts 3500 / 3000 / 2750 require disposition.             |
| `save.rdfxml`                               |   5.507 | 3.038 / 0.55x / -2.469   | 15.637 / 2.84x / +10.130 | SLICE-003; normative losslessness/reparse/publication obligations.                 |
| `util.OWLEntityRenamer`                     |   3.383 | 3.792 / 1.12x / +0.409   | 9.490 / 2.81x / +6.107   | SLICE-004; proposal ordering, multiplicity and application cost boundary.          |
| `save.turtle`                               |   2.725 | 0.560 / 0.21x / -2.165   | 7.600 / 2.79x / +4.875   | SLICE-003; native writer plus losslessness validation.                             |
| `factory.literals`                          |   1.426 | 3.279 / 2.30x / +1.853   | 0.933 / 0.65x / -0.493   | SLICE-005; counts 16310 / 16310 / 17310 and profile lexical rules.                 |
| `util.SimpleShortFormProvider`              |   0.434 | 0.541 / 1.25x / +0.107   | 0.979 / 2.26x / +0.545   | SLICE-009; NCName suffix and native validation cost.                               |
| `search.classHierarchyAndRelations`         |   2.743 | 2.288 / 0.83x / -0.455   | 5.786 / 2.11x / +3.043   | SLICE-002; repeated ontology multiplicity and live reads.                          |
| `config.OWLOntologyLoaderConfiguration`     |   1.130 | 2.350 / 2.08x / +1.220   | 2.346 / 2.08x / +1.216   | SLICE-007; immutable captures and per-profile defaults.                            |
| `util.OWLEntityRemover`                     |   0.413 | 0.392 / 0.95x / -0.021   | 0.715 / 1.73x / +0.302   | SLICE-004; repeated visits intentionally append proposals.                         |
| `formats.RDFXMLDocumentFormat.prefixes`     |   0.690 | 0.945 / 1.37x / +0.255   | 1.098 / 1.59x / +0.408   | SLICE-007; IRI/XML validation and atomic prefix-copy admission.                    |
| `factory.classExpressions`                  |   1.287 | 1.976 / 1.54x / +0.689   | 1.668 / 1.30x / +0.381   | SLICE-005; canonical sets, ordered constructs and hostile iterables.               |
| `factory.dataRanges`                        |   0.565 | 0.858 / 1.52x / +0.293   | 0.682 / 1.21x / +0.117   | SLICE-005; datatype/facet rules and structural identity.                           |
| `locality.extract.BOTTOM`                   |   2.319 | 2.528 / 1.09x / +0.209   | 3.445 / 1.49x / +1.126   | SLICE-008; preparation versus extraction and full work accounting.                 |
| `profiles.OWL2RLProfile.checkOntology`      |   1.607 | 1.661 / 1.03x / +0.054   | 2.394 / 1.49x / +0.787   | SLICE-008; normative DL/rule work and full violation report.                       |
| `load.trig`                                 |   3.391 | 5.029 / 1.48x / +1.638   | 3.623 / 1.07x / +0.232   | SLICE-006; graph policy, exact syntax, metadata and reconstruction.                |
| `search.propertyHierarchyAndDomainsRanges`  |   6.470 | 3.288 / 0.51x / -3.182   | 9.276 / 1.43x / +2.806   | SLICE-002; property families/inverses and eager Boolean predicates.                |
| `load.nquads`                               |   3.114 | 3.810 / 1.22x / +0.696   | 4.031 / 1.29x / +0.917   | SLICE-006; graph context, duplicate statements and selected-graph behavior.        |
| `profiles.OWL2ELProfile.checkOntology`      |   2.226 | 1.392 / 0.63x / -0.834   | 2.756 / 1.24x / +0.530   | SLICE-008; inherited ranges, closure and retained qualifications.                  |
| `util.AnnotationValueShortFormProvider`     |   1.264 | 0.480 / 0.38x / -0.784   | 1.554 / 1.23x / +0.290   | SLICE-009; live provider/member revisions and grouped ordering.                    |
| `model.axiomAnnotationsTransform`           |   1.310 | 1.438 / 1.10x / +0.128   | 1.550 / 1.18x / +0.240   | SLICE-004; existing clone fast path and immutable annotation sets.                 |

After measurement admission, prefer annotation search, RDF/XML saving and renaming because their recorded worst-profile excesses are 10.760, 10.130 and 6.107 ms per fixture.
Turtle saving, class search and property search follow at 4.875, 3.043 and 2.806 ms.
This revises ratio-only ordering while honoring severity: the closure-provider ratio is 9.16x but its recorded excess is 0.808 ms over 1,000 provider calls.
Group related cases only where one owning seam and proof can improve them coherently.
Do not add case times into a claimed application speedup; these workloads have different operation counts and do not represent a measured user journey.

## Measurement admission and pinned-Java policy

SLICE-001 must resolve the following before new ratios are presented as qualified deficits or wins:

1. **Coverage:** map each supported exported constructor, callable method and materially distinct overload to paired timed work in both JS profiles, an explicit non-Java comparison category, or an open coverage gap.
   Enumerate from actual exports and prototypes as well as the documented surface.
   A grouped `OWLDataFactory` label does not prove every factory member was executed.
   Separate inherited methods, overloads, constants and namespace aliases without double-counting.
   Missing coverage remains visible, including APIs in the 48 currently favorable cases.
2. **Equivalent work and independent semantic sinks:** record fixture digest, input sizes, operation repetitions, setup/timed/verification boundaries, eager versus deferred execution, result consumption, mutations/reset and profile-specific expected results.
   Equal scalar counts are weak checks; independently verify relevant structure, lexical values, graph metadata, errors and ordering outside the timing loop.
   The JS `countIterable` helper can read `.size` or `.length` without enumerating; the closure provider itself still materializes a fresh Set.
   If a lazy Java stream's count can avoid enumeration, use a genuinely observable equivalent sink in a separately identified experiment; do not silently change the historical Java workload or claim that every existing JS sink forces every element.
3. **Known count mismatches:** writer configuration is 3500 / 3000 / 2750; literals 16310 / 16310 / 17310; `load.rdfParserMetaData` 51000 / 76000 / 76000; `ontology.entitySignatureLookups` 1580 / 1550 / 1550; Manchester renderer 7747 / 7807 / 7807.
   Determine whether each difference is an accepted profile result, harness mismatch, Java provenance discrepancy or product defect.
   Correctness disposition comes before optimization.
   The three non-slow mismatches cannot be ignored because their timing looks favorable.
4. **Historical authority:** retain existing Java rows/IDs and original artifact bytes.
   Ordinary JS runs load the baseline without invoking Java; missing IDs fail unless the explicit missing-API mode is selected.
   Add measurements only for genuinely new public API coverage permitted by the owner instruction.
   Splitting an old group, changing its fixture, or changing its sink is not automatically a new public API and must not be disguised as append-only permission.
5. **Invalidation:** a changed public API set, fixture generator/digest, operation count, timed boundary, consumed result, Java build identity or comparison platform can invalidate comparability.
   Mark affected comparisons incomparable/pending while retaining the old observations.
   A new Java release permits a separate release baseline; a correction/supplement for an existing release or API requires a narrow explicit owner decision, with old bytes preserved and a recorded relationship between versions.
   Never refresh all Java measurements to obtain more favorable ratios.
6. **Provenance:** record exact candidate/parent commits, fixture and harness identities, Node/V8, Java/JVM and OWLAPI artifact/source identity, OS/architecture, CPU, available memory, GC mode, process/profile ordering and run configuration.
   The retained baseline includes `syntaxCount: 100` and `importClosureCount: 8`; the comparison's top-level parameters omit these.
   Enforce/report those values prospectively.
   A version string alone does not establish the Java artifact's identity against the behavioral oracle.
7. **Timing:** current data use two warmups and five measured iterations after one verification run.
   The recorded `firstUseWallMs` is first invocation of that case inside an already initialized suite, not necessarily process-cold/module-cold cost.
   Measure cold-process, first-query-on-new-snapshot, repeated-query and mutation/query workloads separately when relevant.
   Preserve raw samples and execution order for future reports.
   Do not infer a joint JS/Java confidence interval from a pinned Java median without retained Java samples.
   Current `safeRatio` applies a 0.001 ms denominator floor and rounds ratios to two decimals before the slower classification.
   Classify prospective results from admitted precision before presentation rounding; retain old precision/classifications as historical and mark measurements near resolution limits inconclusive rather than manufacture a denominator.
8. **Repeatability:** proposed initial protocol is at least three independent, sequential JS processes per candidate and control, each with the retained two warmups/five measured iterations, alternating control/candidate order on the same quiet host.
   Capture spread and outliers without silently discarding them.
   Establish materiality and repeat more only when uncertainty warrants it.
   Separate profiling/instrumentation runs from clean timing runs; do not run benchmark processes concurrently.
   Profile-order randomization or extra CLI controls are proposed harness changes, not current capabilities.
9. **Memory:** the current `medianRetainedHeapDeltaBytes` is an after-operation heap sample minus a before-operation sample, clamped nonnegative; there is no mandatory post-operation GC.
   It proves neither retained nor peak memory.
   Preserve historical field meanings/bytes and label them honestly.
   A prospective versioned report can record sampled heap delta, controlled post-GC retention and peak sampling separately, with GC/profiler limitations.
   Avoid strong memory claims from nondeterministic GC or a single sample.
10. **Contract cost:** measure the shared semantic core and required additional profile work separately where feasible, alongside the public end-to-end result.
    Normative reparse/losslessness checks, validation, deterministic ordering, fresh defensive collections and cooperative scheduling remain included in public cost.
    A documented necessary extra cost may justify an owner-accepted residual, never a false claim of parity.

The current CLI accepts `--warmup`, `--runs`, `--filter` (comma-separated exact IDs), `--java-baseline`, `--update-missing-java-baseline`, `--refresh-java-baseline`, `--output` and `--markdown-output`.
It has no profile selector, size flags, confidence controls or process-isolation flag; both profiles are always run.
Unknown arguments are currently ignored, and comparison currently skips a definition if any Java/compatible/normative row is absent.
SLICE-001 must enforce exact requested-ID coverage in all three inputs, explicitly fail unknown/missing/duplicate IDs and malformed flags/counts, and prevent an incomplete or empty comparison from looking successful.
Avoid adding unnecessary knobs.

`--refresh-java-baseline` exists but is not authorized for ordinary optimization runs.
`--update-missing-java-baseline` is a mutation and is used only after the permitted new-API scope is confirmed.
The harness's injected `runJava` boundary is a suitable test seam for proving invocation policy without executing Java.

## Draft requirements and acceptance

These identifiers are scoped to this document; they do not replace identifiers in earlier accepted plans.

| Draft requirement                                                                          | Draft acceptance criterion                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001: Explain coverage of the supported public callable surface in both profiles.       | AC-001: Every in-scope callable/overload has a traceable paired case, explicit non-comparable disposition, or named open gap; no group/class count is described as exhaustive method coverage.                                                                                                                                                            |
| REQ-002: Preserve once-per-release Java measurement and admit only meaningful comparisons. | AC-002: All known mismatches and workload identities have dispositions; ordinary JS runs provably invoke Java zero times and preserve the baseline digest; missing-only tests prove existing rows are unchanged.                                                                                                                                          |
| REQ-003: Close avoidable residual public-operation cost in severity order.                 | AC-003: Each of the 22 cases has comparable before/after results in both profiles and a closure disposition. Qualified parity requires at most 1.10x Java for each comparable profile under the accepted protocol; otherwise the gap stays open unless the owner accepts a precisely measured irreducible-contract or measurement-resolution disposition. |
| REQ-004: Preserve behavioral contracts, failure timing and profile differences.            | AC-004: Independent positive/negative semantic controls, affected differential fixtures and observable order/state/error assertions pass; no exception ledger broadening or public API addition hides a regression.                                                                                                                                       |
| REQ-005: Keep derived state bounded and coherent across mutations and caller behavior.     | AC-005: Cache ownership/invalidation proof and miss/churn/adversarial tests show no stale results, mutable shared outputs, cross-profile contamination or growth proportional to arbitrary lookup history.                                                                                                                                                |
| REQ-006: Retain explicit resource, cancellation and deadline guarantees.                   | AC-006: Existing typed exhaustion/abort/incomplete outcomes and their configured boundaries hold before and after every changed path; responsive yielding is demonstrated in affected Node/browser/worker contexts.                                                                                                                                       |
| REQ-007: Report first-use, warm and memory trade-offs honestly.                            | AC-007: Future records retain raw JS samples/provenance, identify measurement limits, distinguish cold/first-case/warm cost and use truthful memory names; no credible material regression is hidden by the warm median.                                                                                                                                  |
| REQ-008: Preserve native ownership and the installed package contract.                     | AC-008: No new public aliases/shims, global caches, policy switches or dependencies are introduced without a separately accepted decision; affected namespace/package/browser checks pass on the identified candidate.                                                                                                                                    |
| REQ-009: Complete reviewable, recoverable integration with honest limits.                  | AC-009: Every slice links proof and retained artifacts, remaining qualification gaps and a reversible source-change boundary; final status distinguishes local verification, integration, package qualification and publication.                                                                                                                          |

**Proposed optional progress target:** for a materially slow comparable path, reduce positive excess over the pinned Java median by at least 25% before accepting an optimization increment, unless the slice reaches parity sooner.
This is a draft prioritization aid, not owner-approved acceptance and not a substitute for AC-003.
The owner must decide materiality floors and allowed trade-offs after SLICE-001; a 25% change below clock/noise resolution is not proof.
Performance thresholds belong in controlled benchmark analysis, not time-sensitive Jest assertions.

## Draft quality scenarios and decisions

| Scenario                                         | Stimulus, response and proof                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-001: Comparable execution                     | Same identified inputs are consumed through the public operation in both profiles; retained independent outputs explain any difference and matched timing boundaries cannot skip work.                                                                                                                                                    |
| QA-002: Mutation and closure coherence           | Read, mutate axioms/annotations/import declarations/ontology IDs or manager membership, then read again; new results reflect the correct revision while earlier collections remain isolated. Cover no-op changes, import cycles and repeated/shared members.                                                                              |
| QA-003: Deferred and ordered queries             | Create a query, mutate before consumption, consume once and attempt reuse; preserve the documented live/single-consumption behavior, duplicate ontologies, per-member ordering, deduplication and eager Boolean behavior.                                                                                                                 |
| QA-004: Change proposals and partial application | Rename punned entities or raw IRIs, revisit removals, apply a sequence containing a throwing iterator/change; preserve proposal order/multiplicity, anonymous identity, successful-prefix effects in Java mode and normative atomic behavior.                                                                                             |
| QA-005: Lossless bounded output                  | Save representable and unrepresentable ontologies, nested annotations, blank nodes and retained source information; enforce exact output/namespace/format rules, losslessness and profile-specific append/replace/partial-failure behavior.                                                                                               |
| QA-006: Immutable construction                   | Supply valid native values, forged/proxy values, mutable or throwing iterables, huge literals, Unicode digits and edge-case floats; retain canonical identity, validation order, lexical semantics and immutable capture.                                                                                                                 |
| QA-007: Dataset admission                        | Parse TriG/N-Quads with duplicates, named/default/multiple graphs, malformed tokens, explicit limits and aborts; preserve exact grammar, graph-selection policy, metadata and manager publication state.                                                                                                                                  |
| QA-008: Cooperative assessment                   | Assess/extract ordinary and deep/dense ontologies with explicit zero/small limits or timer-triggered abort; preserve full verdicts/work charging, typed incomplete/exhaustion outcomes and no partial module. Proposed foreground cancellation objective remains at most 100 ms, subject to the existing contract and host qualification. |
| QA-009: Memory lifetime                          | Repeat misses and ontology creation/mutation/removal under a controlled harness; derive/cache memory is bounded by owned live state, old snapshots can become unreachable, and a faster warm path does not create unbounded retention.                                                                                                    |
| QA-010: Consumer parity                          | Exercise the exact packed candidate in supported Node, browser bundler/import-map and worker consumers; exports and profile results remain stable and browser-reachable code does not acquire Node-only dependencies.                                                                                                                     |

| Decision                          | Draft selection and rationale                                                                                                                                                                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-001: Priority                 | Admit measurements first, then rank by useful absolute cost, frequency evidence, uncertainty and risk; retain ratio rank as diagnostic information. No fabricated application frequency weighting.                                                                           |
| DEC-002: Baseline authority       | Existing Java records are immutable historical evidence. Supplementary/corrected measurements of existing API work require a narrow owner decision; ordinary JS comparisons never trigger Java.                                                                              |
| DEC-003: Report evolution         | Introduce truthful prospective provenance/coverage/memory fields through an explicit versioned report contract, migrate current consumers together, and preserve historical artifacts as history. Do not relabel old data or introduce an undocumented dual-schema fallback. |
| DEC-004: Derived state            | Prefer snapshot-keyed WeakMaps and bounded native-object/private-state derivations; no unbounded global interning, query-result cache, cache entries for arbitrary misses or retained caller objects. Caches remain optional internal accelerators, not semantic authority.  |
| DEC-005: Observable contracts     | Optimize the existing native path; keep profile-specific error/order/identity/partial effects. No new public API, alias, shim, global mode or weakened validation is a shortcut. No NSH-01 exception is proposed.                                                            |
| DEC-006: Serialization            | Retain normative output validation and losslessness gates. Prefer reducing repeated immutable preparation or stream allocation; replacing/reducing a proof gate requires a separate semantic decision and is outside this optimization baseline.                             |
| DEC-007: Resource accounting      | Retain explicit limits and work accounting despite cheaper computation; no default caps are added to locality and no limit/default is removed to improve a ratio. Preserve elapsed-work yielding, including timer-observable cancellation.                                   |
| DEC-008: Oracles and dependencies | Use existing independent Java/specification/project-contract fixtures and native parsers/validators. No dependency change is selected. Mock only genuine external seams in harness/fault tests.                                                                              |
| DEC-009: Integration and recovery | Integrate independently demonstrable slices with one owner per shared seam, retain before/after evidence, and revert only the affected change or forward-fix if later contracts depend on it. Release and consumer adoption remain separate decisions.                       |

## Architectural seams and DRY authority

All file predictions below are hypotheses to confirm during the relevant slice; they are not instructions to modify every listed file.
Keep abstractions limited to a coherent rule with compatible consumers.
Internal reuse does not require a new dependency survey; adoption of a new component would.

| Shared knowledge                   | Current authority and latest consumers                                                                                                                                                                                        | Proposed strategy and boundary                                                                                                                                                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile policies                   | [OntologyBehaviorContext](../../internal/behavior/ontologyBehaviorContext.js), consumed by managers, factories, configuration, storage and assessments.                                                                       | Retain one immutable context; do not copy flags into utilities or merge distinct semantics for speed. Behavioral fixtures independently assert the policy.                                                                                                                                  |
| Revision-derived indexes           | [ontologyReadModel](../../internal/model/ontologyReadModel.js), [ontology state](../../internal/model/ontologyState.js), consumed by ontology queries, search and utilities.                                                  | Extend existing snapshot-derived indexes only when they represent the same rule. Cache is bounded by stored axioms/positions/entities; new snapshots invalidate by identity. Public facades still enforce ownership and create appropriate results.                                         |
| Structural identity and validation | [structural model](../../model/structural.js), [factory](../../model/owlDataFactory.js), [structural validation](../../internal/model/structuralValidation.js), [object transforms](../../internal/model/objectTransform.js). | Reuse branded immutable tuples/validation already present. Do not treat `Object.freeze` alone as proof of native validity or merge profile literal construction with datatype validation.                                                                                                   |
| Closure membership                 | [manager](../../model/owlOntologyManager.js), its managed index and [closure provider](../../util/owlOntologyImportsClosureSetProvider.js).                                                                                   | Keep manager authority over current membership. A trusted internal path may avoid redundant native copying only with preserved override/foreign-manager semantics and fresh public result ownership.                                                                                        |
| RDF save proof                     | [rdfStorage](../../internal/storage/rdfStorage.js), consumed by [RDF/XML](../../internal/storage/rdfxml/rdfXmlStorer.js) and [Turtle](../../internal/storage/turtle/turtleStorer.js).                                         | Reuse direct-snapshot preparation and proof rules within this package; leave syntax-specific escaping/formatting at the native writer. No generic serialization service.                                                                                                                    |
| Parser and language acceptance     | [N3 adapter](../../internal/parsing/rdf/n3SyntaxAdapter.js), native `n3`, IRI consumer and XML-name utilities.                                                                                                                | Use supported native grammar/validators; retain limits before costly work. Do not create an alternate fast parser or shadow IRI grammar.                                                                                                                                                    |
| Budget semantics                   | [profile budget](../../internal/profiles/budget.js), [locality budget](../../internal/modularity/localityBudget.js).                                                                                                          | Preserve deliberate separation: defaults, units and outcomes differ. Similar yield loops alone do not justify a shared policy object. Scenario tests guard drift in common responsiveness guarantees.                                                                                       |
| Benchmark definition and reporting | Paired JS/Java harnesses, fixture generator, historical Java baseline and generated report.                                                                                                                                   | Shared fixture identity and declared operation contracts; separate language implementations preserve independence. Generate current summary prose from current rows; retain historical narrative with its original identity. The benchmark owner reviews parity/drift on every case change. |

The package is one deployment unit; there is no accepted reason for a service boundary, runtime synchronization channel or new public compatibility layer.
Java and JS are separate language/runtime boundaries and must retain independently inspectable operations and expected outputs.
Test expectations must not be computed by the optimized algorithm.
Assess names when responsibilities change: a sampled heap delta must not be advertised as retention, a first case call as process-cold, or a grouped benchmark as an exhaustive API count.
Update misleading affected comments and consumers together.

## Vertical implementation slices

Each slice starts with a failing semantic/regression observation or a falsifiable cost hypothesis, then the cheapest discriminating experiment.
A disproved hypothesis is recorded and abandoned without an optimization patch.
A diagnostic probe is not shipped instrumentation.
Each runtime slice owns a complete public call path, targeted tests, both-profile measurements and its recovery boundary.

### SLICE-001 — Admit the measurement and coverage contract

**Observable result:** a reviewer can determine which public operations were measured, what equivalent work means, why counts differ and why ordinary runs never remeasure Java.

**Predicted files:** paired harness/test files, `util/generate-owlapi-benchmark-fixtures.cjs`, performance reports and a small durable coverage/comparability manifest under `docs/performance/` if needed.
Use the existing API inventory as a reference; do not rewrite its semantic classifications merely for benchmark convenience.

**Cheapest experiment:** trace the writer chain, literal normalization and provider forcing in both harnesses against retained independent semantic fixtures.
Hash the baseline before/after an ordinary filtered JS run.
Use the existing injected `runJava` seam to prove zero invocation, missing-ID failure and append-only behavior; synthetic Java timings are harness-unit-test data, never performance evidence.
Inventory exports/prototypes statically and with bounded reflection without executing every method.

**Work:** classify all five count mismatches and any unequal-work cases; bind fixture dimensions and harness/source identities; fail closed on invalid CLI options, duplicate/missing case IDs and incompatible records; retain raw future JS samples; derive summary narrative from current report data.
Decide DEC-003 before a schema change and update all current consumers/tests coherently.
A mismatch can be classified and blocked without changing the frozen Java row.
Include tests that reject same-count/wrong-structure results and demonstrate that changed fixtures cannot silently reuse a qualified classification.

**Dependencies/owner:** first slice; benchmark integrator with semantic/oracle reviewer.
Independent source review of later paths can proceed, but their performance acceptance depends on this slice.
**Proof:** command V1; a filtered JS comparison using B1; baseline preservation and coverage/comparability review.
**Recovery:** revert harness/report changes together while retaining the historical baseline and experiment outputs.
No runtime release is required to review this slice.

### SLICE-002 — Reduce annotation and hierarchy query cost

**Cases:** `search.annotations`, `search.classHierarchyAndRelations`, `search.propertyHierarchyAndDomainsRanges`.

**Predicted seam/files:** [EntitySearcher](../../search/entitySearcher.js), existing snapshot read model and [deferred query](../../internal/model/deferredQuery.js).
Confirm the deferred-query path before editing it.
Position indexes already exist; avoid rebuilding P7.

**Hypothesis/experiment:** annotation lookup repeatedly creates annotations, intermediate arrays and StructuralSets; other query paths repeatedly materialize arrays despite indexed candidates.
First separate cold-index creation, warm query, result materialization and consumption using the same public sink.
Compare allocation counts and CPU samples for many subjects/properties, annotation-heavy axioms and repeated ontologies.
A property index may narrow ordinary assertions, but blindly filtering source assertions by property would drop matching nested assertion annotations: preserve that distinction.

**Implementation direction:** remove redundant temporary collections or derive reusable immutable annotation views at the native snapshot authority if measured benefit justifies memory.
Fuse iteration only when validation/error and ordering behavior remains the same.
Do not memoize a live query's result or retain arbitrary subject/property miss keys.

**Proof:** V2 plus QA-002/003/009; create query, mutate, consume and reuse tests; native single ontology and throwing/reentrant iterable providers; duplicate ontologies, annotations with same property/value but different axiom annotations, inverse/property-family cases.
Run both cold and warm B1 filters.
**Dependencies/owner:** SLICE-001; one read-model/search owner, coordinating SLICE-004/009.
**Recovery:** revert query and supporting cache changes as one unit; existing API/ontology data require no migration.

### SLICE-003 — Make RDF/XML and Turtle saving cheaper without losing proof

**Cases:** `save.rdfxml`, `save.turtle`.

**Predicted seam/files:** shared RDF storage preparation/proof, syntax storers, [RDF/XML graph writer](../../internal/storage/rdfxml/rdfXmlGraphWriter.js), [storer registry](../../internal/storage/storerRegistry.js) and mapping/isomorphism code only if profiling identifies them.

**Hypothesis/experiment:** normative end-to-end cost includes structural admission, stable sorting, direct-ontology construction, RDF mapping, serialization, reparse/reconstruction and structural comparison.
Measure these stages independently outside the acceptance run, then compare first save, repeated save, save after mutation and changed writer/prefix settings.
Test annotated/blank-node-heavy and unrepresentable inputs, not only the 100-axiom fixture.
The much faster compatible saving path is evidence of different required work, not permission to bypass normative verification.

**Implementation direction:** reduce repeated immutable preparation and allocation; consider snapshot-owned sorted views only if the retained-memory trade-off passes.
Every save retains its independent blank-node allocation semantics and observes current format parameters/prefixes/writer configuration.
Avoid whole-output caching unless a complete cache identity and bounded lifetime can be demonstrated; it is not the default hypothesis.
Native XML escaping and N3 writing remain authoritative; validation/lossless rejection and output bounds stay effective before publication and excessive allocation.

**Proof:** V3, QA-005/006/009, both formats/profiles; direct ontology equivalence including annotations, imports and anonymous bijection; exact observable formatting where contracted; repeated target use, unsupported terms, prefix mutations and injected writer/reparse failures.
Verify compatible append/partial-failure behavior and normative replacement/atomic failure.
**Dependencies/owner:** SLICE-001; storage owner, coordinating structural changes from SLICE-005.
**Recovery:** revert shared preparation with its consumers; no persisted ontology schema migration.
Retain before/after failing outputs as test evidence.

### SLICE-004 — Reduce transformation and change-proposal allocation

**Cases:** `util.OWLEntityRenamer`, `util.OWLEntityRemover`, `model.axiomAnnotationsTransform`.

**Predicted seam/files:** [renamer](../../util/owlEntityRenamer.js), [remover](../../util/owlEntityRemover.js), native object transform/structural code, snapshot indexes and change records if costs justify it.
Existing unchanged-subtree reuse and clone tokens remain the starting implementation.

**Hypothesis/experiment:** renaming may revisit overlapping candidate batches/annotations and repeatedly construct equivalent transformations; remover work may be dominated by change allocation rather than lookup.
Compare sparse/dense renames, raw IRI versus typed entity, one/many replacements, punned entities, repeated removals and annotation-only changes.
Attribute candidate discovery, transformation and proposal construction separately; applying changes is a separate timed path with its own contract.

**Implementation direction:** reuse immutable work within one operation or native snapshot where safe.
Do not deduplicate proposals simply because they appear redundant: repeated remover visits and Java-shaped rename ordering/multiplicity can be observable.
Preserve raw-IRI versus typed replacement boundaries, literal lexical text, anonymous identity and no application by the utility itself.
Preserve normative atomic and Java sequential successful-prefix application if any shared manager/change seam is touched.

**Proof:** V4 and QA-002/004/006/009; changes inspected before and after application, map collisions, throwing iterables, unchanged subtree identity where promised, nested annotations and failed mid-sequence changes.
**Dependencies/owner:** SLICE-001; shared read-model changes serialize with SLICE-002; structural changes coordinate with SLICE-005.
**Recovery:** revert transform/change implementation together, preserving manager state semantics and retained fixtures; no migration of user ontologies.

### SLICE-005 — Reduce literal and structural construction cost

**Cases:** `factory.literals`, `factory.classExpressions`, `factory.dataRanges`; regression sentinel: annotation transforms and all factory/dispatch consumers.

**Predicted seam/files:** OWLDataFactory/structural model, `internal/model/javaLiteralConstruction.js`, `internal/model/javaFloatingPointLexicalForm.js`, native set/cardinality helpers.
Do not add process-wide string/entity interning.

**Hypothesis/experiment:** Java-mode literal conversion, repeated datatype construction, normalization/sorting and tuple allocation dominate residual work.
Use independent edge fixtures for each literal overload and datatype, then allocation/CPU probes on fresh and repeated native values.
The 16310/17310 difference may reflect profile language handling; resolve it under SLICE-001 rather than changing normative lexical semantics to match a scalar checksum.

**Implementation direction:** reuse immutable built-in values only where identity/lifetime contracts permit, simplify redundant native checks and reduce temporary arrays.
Preserve Java integer bounds, Unicode decimal digits, padded zero strings, trim rules, malformed lexical handling, signed zero/NaN/infinities and float/double rendering.
Factory lexical construction is distinct from later datatype validity.
Preserve ordered versus unordered constructs, repetitions, cardinality normalization, canonical fields and rejection of forged/proxy/cyclic inputs.
No fast path may trust arbitrary frozen external values.

**Proof:** V5 and QA-006/009; both profiles, scalar values and hostile iterables, deep/nested expressions and shared DAGs, annotations, equality/structural keys and public exports.
Measure cost of eventually forcing lazy keys so deferred work is not mistaken for eliminated work.
**Dependencies/owner:** SLICE-001; structural-model owner; serial integration with SLICE-004.
**Recovery:** revert construction changes with their internal consumers; reevaluate all callers if canonical identity changed, which would itself require replanning.

### SLICE-006 — Reduce TriG and N-Quads load cost

**Cases:** `load.trig`, `load.nquads`.

**Predicted seam/files:** N3 syntax adapter, [TriG parser](../../internal/parsing/trig/parser.js), [N-Quads parser](../../internal/parsing/nquads/parser.js) and their registry-owned descriptors.
Manager/RDF translation and RDFJS dataset ownership are likely cost boundaries.
File predictions do not authorize creating replacement adapters.

**Hypothesis/experiment:** stream chunking/token admission, dataset insertion or graph reconstruction dominates these formats.
Compare small/large inputs, repeated statements, named/default graph mixtures, short/long tokens and fresh parser startup.
Attribute parse, RDF mapping, graph selection and publication separately.
Both profiles must receive identical bytes and declared settings; native Java merge behavior and normative graph policy remain explicit differences.

**Implementation direction:** reduce repeated copies, validation of already captured native values or avoidable scheduling only after profiling.
Keep native N3 grammar and public package entry-point loading, bounded work before expensive parsing, backpressure, exact-format selection, source statement counts and metadata truthfulness.
Never take an unrestricted direct parser path to improve timing.

**Proof:** V6 and QA-007/008/010; relevant conformance/differential fixtures, multi-graph rejection/selection/merge, duplicates, malformed syntax, explicit limits and cancellation, and manager/import state after failure.
**Dependencies/owner:** SLICE-001; parser owner; storage tests rerun if N3/shared RDF internals change.
**Recovery:** revert adapter/translation changes as a unit; retain minimized inputs and do not change parser dependencies.

### SLICE-007 — Reduce immutable configuration and prefix overhead

**Cases:** loader configuration, writer configuration and RDF/XML prefixes.

**Predicted seam/files:** [loader configuration](../../model/owlOntologyLoaderConfiguration.js), [writer configuration](../../model/owlOntologyWriterConfiguration.js), [RDF/XML format](../../formats/rdfXMLDocumentFormat.js), native behavior policy, IRI/XML validators.
Existing clone and DOM-free validation paths already exist.

**Hypothesis/experiment:** repeated broad record copying, context construction or revalidation of captured native state dominates small setter chains.
Trace writer getters after each chained setter against the independent Java fixture before measuring; its compatible count mismatch is unresolved correctness/comparability evidence.
Compare no-op/changed setters, short/long chains and native-format versus external-Map prefix copies.

**Implementation direction:** optimize validated native-state copies without changing no-op identity or Java reset-field behavior.
Capture caller collections/terms so later mutations cannot change configuration.
Native format copying may reuse validated private prefix state only if caller override and atomic-failure semantics remain correct; arbitrary Map input still validates before publication.
Preserve IRI consumer validation, XML reserved bindings and Unicode NCName behavior.
No ad hoc grammar or bounded string cache over attacker-controlled namespaces.

**Proof:** V7 and QA-005/006/009; identity, defaults, profile mismatch, invalid/accessor options, mutable selected graphs, bad final prefix entries, setter exceptions and writer consumer output.
**Dependencies/owner:** SLICE-001 count disposition; configuration/format owner.
**Recovery:** revert implementation with affected storage consumers; default/identity changes are not permissible recovery shortcuts.

### SLICE-008 — Reduce profile and locality assessment work

**Cases:** BOTTOM extraction, OWL2RL and OWL2EL checks.

**Predicted seam/files:** profile rules/property hierarchy and budget, locality extractor/evaluator/budget, immutable structural preparation.
P5 already separates synchronous checks from conditional yielding.

**Hypothesis/experiment:** repeated structural classification, hierarchy reachability or seed/signature processing remains significant; elapsed checks and normative extra validation may also contribute.
Attribute CPU/work counts, visited nodes, pauses and clock checks on small and dense/cyclic/deep fixtures.
Separate locality constructor/preparation from extraction and report total public-use cost; do not move work outside the timer unnoticed.
Compare BOTTOM with TOP/STAR sentinels and EL/RL with DL/QL sentinels.

**Implementation direction:** reuse immutable per-invocation derivations or existing snapshot authorities.
Do not cache verdicts across options, source-assessment mode, closure/member revision, cancellation or limits.
Preserve work charging even when a cached result makes computation cheaper; explicit limits remain a contract.
Keep profile `timeoutMs: null` default and locality's no-default-cap decision; retain zero-limit meaning, timer-observable abort, captured options before user callbacks and complete violation/source-qualification reporting.

**Proof:** V8 and QA-002/006/008/009; incomplete source/closure, explicit work/depth/deadline exhaustion, pre-abort and timer abort, deep input, finite limits, filter/seed reentrancy and no partial locality result.
Validate bounded cancellation in Node and affected Chromium window/worker contexts; tight elapsed thresholds are controlled experiments, not flaky unit tests.
**Dependencies/owner:** SLICE-001, structural integration from SLICE-005 if shared code changes; assessment owner.
**Recovery:** revert affected evaluation/preparation with accounting tests; do not restore superseded default numerical caps.

### SLICE-009 — Reduce closure-provider and short-form overhead

**Cases:** imports-closure Set provider, SimpleShortFormProvider and AnnotationValueShortFormProvider.

**Predicted seam/files:** closure provider/manager, `util/simpleShortFormProvider.js`, `util/annotationValueShortFormProvider.js`, XML suffix helper and existing snapshot read model.

**Hypothesis/experiment:** the closure provider copies and validates the fresh manager Set again; simple short forms force structural keys before suffix extraction; annotation short forms repeatedly capture closure/read models, flatten and sort candidates.
Measure construction versus query, native versus arbitrary provider, closure size/mutation, repeated/fresh entities, property/language preference count and Unicode IRI length.
The Java benchmark uses `provider.ontologies().count()` while JS returns a fresh Set; classify equivalent forcing and mandatory materialization cost before interpreting its ratio.

**Implementation direction:** consider one trusted internal native capture path, or eliminate redundant per-call intermediate arrays.
Do not bypass public overrides/subclass behavior merely because a manager has native private fields.
Every returned public Set remains fresh and independent; the next call reflects current closure.
Arbitrary manager/provider return values retain their validation, iteration, exception and call-count semantics.
Avoid persistent IRI-to-label or arbitrary-provider-result caches.

Annotation short forms intentionally preserve property priorities, language priorities and provider-member grouping; sorting is within groups, and an IRI can replace a non-first language match.
Global sorting/deduplication or premature early return can change the result.
Keep live provider membership/member revisions, imported annotations, fallback provider calls and defensive getter copies.

**Proof:** V9 and QA-002/003/006/009; fresh Set mutation isolation, root removal/rebinding/import changes/cycles, foreign manager/proxy/throwing iterable, subclass/overridden methods, malformed provider output, IRI fallback and annotation/language tie cases.
**Dependencies/owner:** SLICE-001; serialize read-model/closure changes with SLICE-002/004.
**Recovery:** revert native fast path and its caller; no provider state or public name migration.

### SLICE-010 — Integrate, qualify and record remaining limits

**Observable result:** one identified candidate has truthful case coverage, unchanged profile contracts, reviewed performance trade-offs and proportionate package/consumer verification.
This is not permission to publish it.

Reconcile all 22 case dispositions and newly discovered coverage gaps.
Rerun affected favorable cases and the complete admitted comparison once integration is stable.
Preserve generated reports with their raw samples/provenance and remove stale current-summary prose; historical P1-P9 observations remain explicitly historical.
Repeat only for changed code, failures or unresolved uncertainty.
Compare the final candidate against the parent baseline on the same host, and identify which Java comparisons remain historical/non-comparable.

Run the final verification sequence below.
A full-suite failure is triaged against the parent and cannot be replaced by a favorable scoped pass.
JSON tooling remains held/unconfirmed until the owner-directed update is ready and its supported check can be rerun; do not repair it under this plan.
Any required unresolved check or assessment prevents a claim of complete qualification, without undoing independently demonstrated engineering results.

**Dependencies/owner:** all selected slices; one integration owner and independent verifier, both to be named.
**Recovery:** retain per-slice revert boundaries and the final candidate identity.
No ontology backfill or runtime data migration is proposed; caches are derived process-local state.
Browser/package qualification may require rebuilding the candidate after a revert.
Release selection and consumer updates remain outside this plan.

## Focused verification and benchmark commands

These are supported command forms inspected in the current repository.
They are **future implementation checks**, not results from this planning task.
Run from the repository root with its admitted toolchain.
Existing tests should be extended with the relevant independently specified controls; do not add tests that merely duplicate implementation details.

| ID  | Focused command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | `npm test -- --runInBand --runTestsByPath util/benchmark-owlapi-java-parity.test.js`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| V2  | `npm test -- --runInBand --runTestsByPath search/entitySearcher.test.js search/nativeSearch.test.js search/behaviorTiming.test.js internal/model/ontologyReadModel.test.js model/rc2Queries.test.js model/rc2NativeQueries.test.js model/behaviorMutation.test.js`                                                                                                                                                                                                                                                               |
| V3  | `npm test -- --runInBand --runTestsByPath model/owlOntologyManager.storage.test.js model/behaviorStorage.test.js internal/storage/rdfxml/rdfXmlStorer.test.js internal/storage/rdfxml/rdfXmlGraphWriter.test.js internal/storage/storerRegistry.test.js internal/storage/rc2Storers.test.js internal/mapping/owlToRdfTranslator.annotations.test.js`                                                                                                                                                                             |
| V4  | `npm test -- --runInBand --runTestsByPath util/rc2Transforms.test.js util/rc2ParityEdges.test.js model/rc2Changes.test.js model/behaviorMutation.test.js model/factory.test.js`                                                                                                                                                                                                                                                                                                                                                  |
| V5  | `npm test -- --runInBand --runTestsByPath model/behaviorLiterals.test.js model/factory.test.js model/model.test.js model/losslessCardinality.test.js model/dispatch.test.js model/behaviorResources.test.js`                                                                                                                                                                                                                                                                                                                     |
| V6  | `npm test -- --runInBand --runTestsByPath internal/parsing/rdf/n3SyntaxAdapter.test.js internal/parsing/rdf/n3SyntaxAdapter.resource.test.js internal/parsing/trig/trig.test.js internal/parsing/trig/trig.resource.test.js internal/parsing/trig/trig.conformance.test.js internal/parsing/nquads/nQuads.test.js internal/parsing/nquads/nQuads.resource.test.js internal/parsing/nquads/nQuads.conformance.test.js model/behaviorLoading.test.js model/behaviorParserSelection.test.js model/rdfConsumerCompatibility.test.js` |
| V7  | `npm test -- --runInBand --runTestsByPath model/owlOntologyWriterConfiguration.test.js model/owlOntologyManager.test.js model/behaviorProfile.test.js model/owlDocumentFormat.test.js model/documentFormatContext.test.js internal/parsing/xml/xmlNames.test.js model/behaviorStorage.test.js`                                                                                                                                                                                                                                   |
| V8  | `npm test -- --runInBand --runTestsByPath modularity/locality/locality.test.js internal/profiles/budget.test.js profiles/profileDeadline.test.js profiles/rc2Profiles.test.js profiles/behaviorProfiles.test.js profiles/profileExpectedDifferences.test.js profiles/profileSnapshot.test.js profiles/sourceGraphSelection.test.js model/behaviorResources.test.js`                                                                                                                                                              |
| V9  | `npm test -- --runInBand --runTestsByPath util/owlOntologyImportsClosureSetProvider.test.js util/shortFormProviders.test.js model/ontologyMembership.test.js model/behaviorMutation.test.js search/entitySearcher.test.js`                                                                                                                                                                                                                                                                                                       |

Use task-owned output paths outside the tracked historical artifacts for experiments.
For example, B1 is a supported filtered ordinary comparison that runs both JS profiles against the existing pinned Java rows:

```powershell
node --expose-gc util/benchmark-owlapi-java-parity.mjs --warmup 2 --runs 5 --filter search.annotations,search.classHierarchyAndRelations,search.propertyHierarchyAndDomainsRanges --java-baseline docs/performance/java-owlapi-5.5.1-baseline.json --output "$env:TEMP/owlapi-performance-<run-id>/search.json" --markdown-output "$env:TEMP/owlapi-performance-<run-id>/search.md"
```

Replace `<run-id>` with a distinct experiment identity and use the exact case IDs from the inventory for other slices.
No Java-update flag belongs in B1.
Until SLICE-001 repairs report generation, generated Markdown still includes stale historical summary prose; it is not an authoritative new result narrative.
Existing output does not include all raw/provenance fields proposed above.

B2 is the current full comparison form for the final integrated candidate, once the protocol is admitted:

```powershell
node --expose-gc util/benchmark-owlapi-java-parity.mjs --warmup 2 --runs 5 --java-baseline docs/performance/java-owlapi-5.5.1-baseline.json --output "$env:TEMP/owlapi-performance-<run-id>/all.json" --markdown-output "$env:TEMP/owlapi-performance-<run-id>/all.md"
```

For owner-authorized genuinely new API IDs only, the current append form is `node --expose-gc util/benchmark-owlapi-java-parity.mjs --filter <approved-new-api-id> --update-missing-java-baseline --java-baseline <approved-baseline-path> --output <task-owned-output>`.
This is a template, not approval to execute or to rename old workloads as new IDs.
Preserve/verify existing rows and artifact identity around the admitted operation.
No command here grants permission for `--refresh-java-baseline`.

Final relevant verification after runtime changes:

1. Run the affected V commands and exact changed-file lint/format checks first.
   Run `npm run lint:js`, `npm run format:source:check` and `npm run check:markdown -- -- docs/plans/2026-10-28-remaining-java-api-performance-parity-implementation-plan.md` as applicable to the final diff.
   The second `--` forwards the selected literal path through the nested npm script.
2. Run `npm test -- --runInBand` on the integrated candidate; retain and triage all failures against the parent.
   Run `npm run test:boundary`, `npm run lint:package` and `npm run verify:architecture` when runtime/internal import/export changes warrant them.
   Do not call a source-tree package check an installed-package qualification.
3. For browser-reachable runtime changes, use the existing local candidate preparation and installed-consumer flow.
   With an already admitted candidate directory and a new output directory, supported forms are `npm run prepare:browser-consumers -- --candidate <candidate-directory> --output <browser-fixture-directory>` and `npm run test:browser -- --fixture-root <browser-fixture-directory>`.
   Candidate preparation must identify the actual tarball/manifest and supported runtime matrix; do not invent a release artifact or execute publishing steps.
   Exercise bundler, import-map and worker behavior as relevant, with particular attention to timers, aborts and native parser imports.
4. Run affected existing Java/specification contract comparisons against the pinned semantic authority where available.
   Semantic differential execution is distinct from performance reprofiling and does not authorize changing Java timing records.
   Use the repository's retained expected-difference identities and never infer correctness from equal benchmark counts.
5. Recheck JSON-tooling availability and run its supported validation only when the current user hold is resolved.
   Until then mark that prerequisite held/unconfirmed.
   Do not bypass it or report the aggregate lint/qualification pipeline as passed.
6. Perform an independent final review of semantics, measurement admission, cache/resource reasoning and actual changed trust boundaries.
   If parser/input-limit/serialization safety boundaries changed, the designated native security workflow owns a scoped assessment at the frozen candidate; unavailable or incomplete assessment remains explicitly unresolved.
   No broad scan or security completion is claimed by this plan.

## Oracle ownership and test seams

The semantic reviewer owns expected results and difference dispositions.
For the compatible profile, use the exact retained Java 5.5.1 behavior authority and fixture observations; the performance baseline alone is not a correctness oracle.
For the normative profile, use the established specification/project-contract hierarchy and explicit accepted exceptions.
Compare observable output, error class/timing, validation order, callback/iteration behavior and partial state, not just final counts.

Share neutral fixture construction or parsers where they do not compute the expected decision.
Preserve hand-checked expected structural/lexical/order results and mutation-sensitive negative controls.
Do not mock `readOntologyModel`, StructuralSet, native validation or the transform algorithm to prove their own optimization correct.

Genuine seams include the harness's injected Java runner, the supported native parser implementation-loader seam, filesystem/process transport for harness fault tests, document loader transport and explicitly supplied external manager/provider/iterable callbacks.
Mocking is suitable for invocation policy, deterministic failure and cancellation injection there.
Public-path acceptance still uses real native modules and real Node/browser scheduling.
Arbitrary user-supplied providers are live observable inputs, not objects that can be replaced by a cached native assumption.

## Cross-cutting lifetime, security and compatibility guardrails

- Snapshot indexes are owned by immutable committed snapshots; manager closure state also depends on membership/index identity and relevant member revisions.
  Axioms, ontology annotations, imports, ontology ID changes, removals/rebindings and failed/partial changes must invalidate the appropriate state.
  A broad revision key is acceptable initially; a narrower key needs proof that it covers every dependency.
- Weak keys do not automatically prove bounded memory.
  Values must not retain unrelated old snapshots, arbitrary queries/providers or global strings.
  Cover repeated misses, discarded ontologies, changed closures and caller-held old results; document the bound in terms of live axioms/positions/objects.
  Prefer no cache when material gains do not repay complexity/retention.
- Fresh public Sets, Maps and arrays remain independently mutable where contracted; private frozen arrays are never exposed as shared mutable results.
  A retained query obeys its documented live or snapshot boundary, including failure timing and single use.
- Native/private branding and immutable capture are trust boundaries.
  External frozen values, getters, proxies, iterable side effects, subclass overrides and reentrant callbacks cannot select an unchecked internal path.
  Validate before effects where the existing contract requires it.
- Do not reset budgets across phases, memoize success across limit settings, hide work by moving it out of the timer, omit scheduled cancellation, truncate output silently or expose partial normative results.
  Preserve Java-compatible partial behavior where required.
  No implicit network access or telemetry is introduced.
- Performance fixtures and retained diagnostics should contain public/synthetic ontology data.
  Do not upload private repository or ontology content to profiling/review services.
  Keep exact provenance and access constraints with any separately admitted real-world corpus.
- No public data/schema migration, ontology backfill or consumer configuration change is expected.
  A report-schema change is a tooling contract change with coordinated current-consumer updates; immutable historical records remain readable as history, not supported dual runtime modes.

## Ordering, integration and traceability

SLICE-001 is the first acceptance dependency.
The preferred runtime order by current evidence is annotation search, storage, transforms, construction, parsing, configuration, assessment and small provider/display paths, revisited after admitted measurements.
Read-only experiments can be independent, but parallel writes into read-model/structural/manager seams require explicit ownership and resolved semantic coupling.
This document authorizes no agents or parallel implementation by itself.

The integration owner serializes changes to `ontologyReadModel`, structural/factory code, manager state and shared RDF preparation.
A slice based on another in-flight change must identify its exact prerequisite revision before timing.
After shared structural changes, rerun the impacted search/storage/transform cases rather than comparing measurements from different source states.
All owner roles remain unassigned pending implementation admission; Maksym Shostak owns consequential scope/contract exceptions.

| Slice     | REQ / AC                                | QA                 | DEC                 | Proof                                                                 | Release / cleanup implication                                                             |
| --------- | --------------------------------------- | ------------------ | ------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| SLICE-001 | REQ-001/002/007; AC-001/002/007         | QA-001             | DEC-001/002/003/008 | V1, B1 policy proof, independent mismatch/coverage review             | Harness/report increment; preserve frozen Java/history and owned experiment artifacts.    |
| SLICE-002 | REQ-003/004/005; AC-003/004/005         | QA-002/003/009     | DEC-001/004/005     | V2, both-profile cold/warm search probes                              | Native query implementation can revert with its derived cache; no ontology migration.     |
| SLICE-003 | REQ-003/004/005/006; AC-003/004/005/006 | QA-005/006/009     | DEC-004/005/006/008 | V3, stage attribution and public lossless-save probes                 | Revert storage preparation and consumers together; preserve failing output fixtures.      |
| SLICE-004 | REQ-003/004/005; AC-003/004/005         | QA-002/004/006/009 | DEC-004/005         | V4, proposal/application and partial-failure controls                 | Revert native transform/change unit; retain semantic fixtures.                            |
| SLICE-005 | REQ-003/004/005; AC-003/004/005         | QA-006/009         | DEC-004/005/008     | V5, independent lexical oracle and forced-key measurements            | Shared construction requires downstream checks; no global interning cleanup obligation.   |
| SLICE-006 | REQ-003/004/006/008; AC-003/004/006/008 | QA-007/008/010     | DEC-005/007/008     | V6, graph-policy/limit/abort and installed-consumer proof             | Parser boundary review; no dependency update or consumer migration.                       |
| SLICE-007 | REQ-003/004/005; AC-003/004/005         | QA-005/006/009     | DEC-004/005/008     | V7, getter-chain/identity/prefix and writer-consumer proof            | Config/default contracts unchanged; revert internal copy path coherently.                 |
| SLICE-008 | REQ-003/004/005/006; AC-003/004/005/006 | QA-002/006/008/009 | DEC-004/005/007     | V8, full reports, work/deadline/cancel and browser probes             | Scheduling/resource observer required; retain accepted no-cap/default decisions.          |
| SLICE-009 | REQ-003/004/005; AC-003/004/005         | QA-002/003/006/009 | DEC-004/005/008     | V9, foreign-provider/fresh-result/order controls                      | Revert native fast path; no public bridge or persistent provider cache.                   |
| SLICE-010 | REQ-001–009; AC-001–009                 | QA-001–010         | DEC-001–009         | Final relevant checks, B2, independent review and explicit gap ledger | Local candidate readiness only; publish/adopt separately, retain evidence before cleanup. |

## Rollout, observation and recovery

Implementation should produce small independently reviewable increments with explicit source dependencies.
No feature flag, alternate public API or long-lived old/new implementation is proposed.
A slice may be technically ready independently if its relevant checks pass and it does not depend on unfinished shared semantics; actual integration/publication authority is separate.

For every accepted increment, the implementation owner records its source identity, affected cases, semantic checks, before/after distributions, first-use/memory effects, and open gaps.
The independent verifier observes the same identified candidate; the benchmark owner checks baseline immutability and report truthfulness.
The designated runtime observer reviews browser responsiveness for scheduling changes.
These are proposed responsibilities, not claims that someone has already performed them.

Abort the affected optimization on semantic divergence, stale reads, wrong mutation/partial state, weakened limit/abort behavior, output corruption/losslessness failure, unbounded cache growth, credible material regression, incomparable data used as a pass, or an altered historical baseline.
Retain the failing fixture and narrow the cause.
A faster benchmark cannot override these conditions.

Source-only optimization changes normally permit reverting the complete slice before publication, including tests/consumers that depend on its internal representation.
Verify the reverted candidate rather than claiming recovery solely from a Git operation.
If later accepted changes rely on the new contract, use an accountable forward fix or suspend the affected change; do not assert that arbitrary published consumers can be rolled back.
No rollback of user ontology data is needed because no migration is proposed, but in-memory caller-visible state and failed-operation effects must remain correct throughout tests.

On authorized future package delivery, existing producer-owned candidate, Node/browser and installed-package checks determine readiness.
Do not hold product release on unrelated consumer adoption, nor claim release/install/live activation from local tests or workflow closure.
This plan selects no version, registry action or consumer rollout.

Keep original Java/JS records, fixture/source identities, raw prospective samples and decisive failure evidence.
Temporary profilers, generated fixtures and candidate directories need a named owner and scoped retention/cleanup disposition before removal.
Remove only task-owned reproducible temporaries after evidence is retained; do not delete another task's worktrees, archives or HISEW-owned resources.
Cleanup is a distinct outcome, not proof of runtime qualification.

## Unknowns and replanning triggers

| Unknown                                                                  | Cheapest discriminating evidence                                                                                | Decision / trigger                                                                                                       |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Whether 70 groups cover the requested public callable surface            | Export/prototype/API mapping with exact invocation coverage                                                     | Owner approves missing-coverage scope; new findings do not silently count as completed performance work.                 |
| Whether writer mismatch is expected, stale authority or a defect         | Stepwise independent getter observations plus source/build identity                                             | Block its performance acceptance until classified; correctness repair may need a separate scope decision.                |
| Whether closure ratio measures equivalent forcing                        | Trace Java stream count and JS Set creation, inspect required output ownership, use an approved observable sink | Changed historical Java workload requires narrow owner permission; do not rename the same API to evade the policy.       |
| Whether normative save/profile excess is avoidable                       | Stage CPU/allocation/work attribution while retaining all public proof                                          | Accept only justified optimizations; irreducible cost needs explicit owner disposition and remains separate from parity. |
| Whether a warm improvement harms first-use or retention                  | Cold-process/new-snapshot/churn probes with controlled lifetime and raw samples                                 | Reconsider cache design if memory or cold cost dominates realistic use.                                                  |
| Whether a tiny difference is distinguishable from noise                  | Independent JS process spread and known timing resolution                                                       | Use an inconclusive classification; no precision or Java confidence claim unsupported by retained samples.               |
| Whether real callers benefit from current fixture priorities             | Separately admitted public/portable representative workloads and call frequencies                               | Reorder work if end-to-end cost contradicts microbenchmark priority; do not fabricate application gains.                 |
| Whether shared transformations invalidate earlier checks                 | Exact revision dependencies and affected-case reruns                                                            | Rebaseline the JS control when source changes materially; preserve prior results as history.                             |
| Whether browser cancellation remains timely                              | Real timer-abort checks in affected window and worker contexts                                                  | Replan scheduling if timer starvation or long synchronous stretches appear.                                              |
| Whether JSON tooling and other qualification prerequisites are available | Read-only status and supported check after the user hold resolves                                               | No repair/upgrade under this plan; report held checks separately from demonstrated product behavior.                     |

Replan before implementation if a proposed optimization needs a public contract/default change, new alias/shim, dependency adoption, changed Java authority, relaxed validation/limits, persistent state, external service or incompatible report consumer.
Reassess at each slice handoff and final review whether the change advances useful caller cost or merely improves a local measurement.
There is no accepted assurance that every residual can reach Java timing while retaining all required JS/profile behavior.

## Planning completion record

This document was produced from read-only inspection of the stated source baseline, retained Antigravity requirements, current benchmark JSON/harnesses, relevant runtime owners and existing contract plans.
No product implementation, benchmark run, dependency change, commit, push, release, security scan or HISEW lifecycle action was performed to create it.
The draft is ready for owner review of implementation scope and consequential decisions; proposed checks are not passing results.
