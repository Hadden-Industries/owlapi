# Remaining Java performance implementation results

The implementation reduces repeated immutable preparation and allocation while retaining both behavior profiles.
The pinned Java baseline and original schema-1 measurements remain unchanged.

**Qualification remains in progress: the latest RDF measurements exceed the strict 1.10x target in some selected groups.**
The owner approved committing this reviewed implementation increment on 2026-10-29, explicitly leaving parity acceptance open.
Completed general and security reviews cover the source epochs recorded below.
Earlier passing and above-target screens remain historical observations; they do not qualify a later source epoch.
Checksums alone do not prove semantic equivalence, and explained profile differences and unequal closure forcing remain unqualified.

## 0.1.0 roadmap I/O follow-up, 29 October

The [implementation observations](2026-10-29-io-implementation-observations.json) retain all raw control/candidate samples and the rejected experiments for the six remaining I/O groups on Node 24.22.2.
RDF metadata discovery now schedules only object children, preserving traversal order and every visited node's cancellation/deadline check.
RDF/XML caches encoded named/blank resource identities within one write while preserving field reads and the complete literal path.
The attempted structural-validation projection cache was reverted after it failed to provide a reliable improvement.
The initial exploratory runs omitted `--expose-gc` and are explicitly excluded from protocol comparisons.

Independent untimed Java and JavaScript sinks check the exact 100-class declarations, ontology/version identity, absence of annotations/imports and logical axioms, and source preservation after saving.
The released Java classpath's 64 ordered artifacts are hash checked; 34 structural observations pass on the declared Temurin build and both profiles, including Java reading JavaScript output and both profiles reading Java output.
Same-count wrong-IRI and wrong-ontology controls reject; count equality alone cannot satisfy the sink.
The 124 focused and 51 resource/storage checks pass, including metadata, lexical values, resource identities, cancellation, finite limits and partial-target behavior.

| Group       | Compatible process median / Java | Normative process median / Java |
| ----------- | -------------------------------- | ------------------------------- |
| load.turtle | 0.879                            | 0.770                           |
| load.nquads | 1.082                            | 1.025                           |
| load.trig   | 0.961                            | 0.914                           |
| save.owlxml | 0.841                            | 0.542                           |
| save.rdfxml | 0.465                            | 1.058                           |
| save.turtle | 0.232                            | 1.025                           |

These are medians of three independent process medians, with two warmups and five measured calls in each process against the unchanged historical Java baseline.
The individual N-Quads process range still reaches 1.145 compatible and 1.118 normative, so robust parity acceptance remains open despite the improved central estimates.
The owner directed this implementation to stop further tuning at these sub-20% millisecond outliers; this does not relabel them as satisfying the retained 1.10 release target.
First use is measured inside an initialized suite, and sampled heap deltas do not establish retained or peak memory.
The six structural fixture checks do not admit every method, metadata field or overload in the 70-group inventory, and do not replace the future frozen-candidate campaign.

## Implemented changes

- Snapshot-owned annotation views preserve deferred reads, nested annotations, order and repeated ontology multiplicity.
  Class-search iterator fusion was removed after a concrete preservation failure.
- Storage reuses sorted snapshot preparation and configuration.
  Every save still maps, allocates its own blank nodes, renders, reparses where required, reconstructs and compares before publication.
- Rename reconstruction shares work within one operation and preserves repeated proposals.
  Native removal proposals now own their frozen nominal records in the record module, with the same validation, opaque public shape and independent proposal identity.
  Annotation copies share a lazily prepared exact private tuple body while retaining separate generic annotation-free comparison components and existing serialization failures.
  Native closure/display paths retain overrides and fresh public collections.
- Exact floating-point interval selection follows the mathematical Schubfach argument with certified integer boundaries and a safe binary32 path.
  Expanded independent JDK semantic probes matched 63,906 observations, including signed subnormal and decimal-exponent boundaries.
  Binary32 coefficients stay exact Numbers until BigInt fallback is required; decimal magnitude is certified from exact interval arithmetic.
  Native IRI/literal/structural projection avoids temporary records while preserving validation and field/tuple order.
- Fixed loader copies retain complete public field order and admitted symbols.
  Prefix construction reuses immutable metadata while each format owns its mutable prefix map.
  The owner-authorized Java writer correction preserves labelsAsBanner across copies.
  Follow-up repairs preserve symbols introduced by `with()` across later copies; loader values resolve the shared native profile definition directly.
- N3 admission uses conservative UTF-8 bounds only to prove acceptance; violations still receive exact byte counts.
  Unbounded deadlines avoid unnecessary clock reads/watchdogs; finite deadlines, cancellation and cooperative yields remain enforced.
  The locked N3 provider can reuse native named/blank terms while every quad and literal still crosses the normalization boundary; replacement providers retain complete copying.
  RDF/XML token admission uses the same conservative UTF-8 bound, retaining exact boundary errors for multilingual and supplementary text.
- RDF translation encodes private consumption keys once, avoids unused keys when fully indexed reification maps are empty, and reuses its private six-entry role map.
  Public source handles, metadata and role-proof checks retain their contracts.
  Native unconditional-role evidence avoids redundant antichain allocation, known roles use typed IRI sets, and private consumption keys are weakly reused per quad.
  Single-quad native subjects avoid redundant matched-dataset construction; multi-quad subjects, replacement providers and provider-specific IDs retain native matching order.
  Controlled deadline, diagnostics and metadata comparisons preserve the original checkpoints.
- Profile traversal preparation is weakly owned by immutable snapshots.
  Repeated checks replay original work/depth/edge charges and rerun domain rules and current limits.
  Fixed immutable literal/facet diagnostics remove a traced repeated status-access deoptimization.
  No verdict is cached.
  XML literal validation awaits asynchronous work even when instrumentation replaces the global Promise constructor.
- Locality preparation retains per-extraction charging.
  XML local-name suffix scanning and per-write native serialization reuse avoid repeated work while keeping Unicode/XML and output-budget checks.
  OWL/XML no longer serializes discarded text nodes after character admission; its actual document serialization, byte charges and partial-failure behavior remain.
  OWL/XML and Turtle avoid temporary UTF-8 buffers for ASCII strings, using the existing encoder for other text.
  RDF/XML uses native detached-leaf admission and native element-header copying without moving source children or changing output budgets.
  Singleton structural-comparison groups retain their original search-state charge and recursive match while avoiding unused sibling-search state.

## Earlier focused measurements

The [earlier 70-case screen](java-api-performance-process-summary.json) describes an earlier candidate.
The [focused follow-up record](java-api-performance-focused-followups.json) retains each family/process identity, JS samples, first-use time and sampled heap delta.
Its original 18 processes used identical runtime-source and harness bytes, before the later corrections above.
Those historical samples were rounded to three decimal milliseconds; the current harness retains unrounded performance.now() differences and medians, applying display rounding separately.
Later filtered observations must retain their own source and harness identities.

Three independent processes ran each selected disparity family sequentially, with two warmups and five measured calls per case.
The table uses the median of the three process medians.
Filtered family contexts differ from the earlier all-case context; some near-threshold results do not reproduce in every context.
Earlier favorable runs remain research observations, not replacements for these results.
First-use is a case call in an initialized suite, not process startup.
Sampled heap deltas are neither peak nor retained memory.

| Group                                       | Java ms | Compatible ms / ratio       | Normative ms / ratio        |
| ------------------------------------------- | ------: | --------------------------- | --------------------------- |
| `config.OWLOntologyLoaderConfiguration`     |   1.130 | 1.149 / 1.02x               | 0.824 / 0.73x               |
| `config.OWLOntologyWriterConfiguration`     |   0.155 | 0.242 / 1.56x               | 0.146 / 0.94x (unqualified) |
| `formats.RDFXMLDocumentFormat.prefixes`     |   0.690 | 0.881 / 1.28x               | 0.778 / 1.13x               |
| `model.IRI.create`                          |   0.709 | 0.283 / 0.40x               | 0.205 / 0.29x               |
| `factory.literals`                          |   1.426 | 1.498 / 1.05x               | 0.767 / 0.54x (unqualified) |
| `factory.classExpressions`                  |   1.287 | 1.344 / 1.04x               | 1.228 / 0.95x               |
| `factory.dataRanges`                        |   0.565 | 0.602 / 1.07x               | 0.490 / 0.87x               |
| `model.axiomAnnotationsTransform`           |   1.310 | 1.702 / 1.30x               | 1.588 / 1.21x               |
| `load.turtle`                               |   4.039 | 4.808 / 1.19x               | 4.185 / 1.04x               |
| `load.ntriples`                             |   3.915 | 4.525 / 1.16x               | 4.154 / 1.06x               |
| `load.nquads`                               |   3.114 | 4.599 / 1.48x               | 4.509 / 1.45x               |
| `load.trig`                                 |   3.391 | 4.900 / 1.45x               | 4.307 / 1.27x               |
| `save.owlxml`                               |   1.428 | 2.331 / 1.63x               | 1.222 / 0.86x               |
| `save.rdfxml`                               |   5.507 | 4.396 / 0.80x               | 9.932 / 1.80x               |
| `save.turtle`                               |   2.725 | 0.757 / 0.28x               | 4.675 / 1.72x               |
| `profiles.OWL2DLProfile.checkOntology`      |   4.017 | 1.322 / 0.33x               | 1.854 / 0.46x               |
| `profiles.OWL2ELProfile.checkOntology`      |   2.226 | 1.568 / 0.70x               | 1.889 / 0.85x               |
| `profiles.OWL2QLProfile.checkOntology`      |   2.147 | 1.872 / 0.87x               | 1.988 / 0.93x               |
| `profiles.OWL2RLProfile.checkOntology`      |   1.607 | 1.462 / 0.91x               | 1.871 / 1.16x               |
| `search.annotations`                        |   3.313 | 2.586 / 0.78x               | 2.692 / 0.81x               |
| `util.SimpleShortFormProvider`              |   0.434 | 0.475 / 1.09x               | 0.348 / 0.80x               |
| `util.OWLOntologyImportsClosureSetProvider` |   0.099 | 0.768 / 7.76x (unqualified) | 0.425 / 4.29x (unqualified) |
| `util.OWLEntityRenamer`                     |   3.383 | 3.864 / 1.14x               | 3.378 / 1.00x               |
| `util.OWLEntityRemover`                     |   0.413 | 0.469 / 1.14x               | 0.443 / 1.07x               |
| `locality.extract.BOTTOM`                   |   2.319 | 1.524 / 0.66x               | 1.358 / 0.59x               |
| `locality.extract.TOP`                      |   2.238 | 1.543 / 0.69x               | 1.358 / 0.61x               |
| `locality.extract.STAR`                     |   3.287 | 1.881 / 0.57x               | 1.808 / 0.55x               |

## Consolidated disparity follow-up

The follow-up record's `consolidatedDisparityFollowup` retains 12 new process recordings of the 15 outstanding or directly affected groups, using the same four filtered families as the correction screen.
All share runtime-source hash `736a209e1c359f00b8ba9cb0c8653a79553d00e0e6aee48ac6939132e21f9ab8` and harness hash `a07dcc2066eeb3a9efc3eac1e49054743a9c121b7f7c027a7f1fc9295f7c8f06`.
The Java baseline remains unchanged; no Java timings, full test suite or broad browser matrix were run.
The table uses medians of three process medians; complete samples, first-use costs and heap observations remain in the JSON.
In this earlier consolidated epoch, five groups remained above the strict target: compatible writer configuration, axiom annotation copies, entity removal, and normative RDF/XML and Turtle saves.
N-Quads combined medians meet the target, but one process in each profile exceeds it; the observation remains sensitive to process variation.
No performance gap has an accepted irreducibility disposition.

| Group                                   | Java ms | Compatible ms / ratio | Normative ms / ratio        |
| --------------------------------------- | ------: | --------------------- | --------------------------- |
| `config.OWLOntologyLoaderConfiguration` |   1.130 | 0.897 / 0.79x         | 0.798 / 0.71x               |
| `config.OWLOntologyWriterConfiguration` |   0.155 | 0.212 / 1.37x         | 0.135 / 0.87x (unqualified) |
| `formats.RDFXMLDocumentFormat.prefixes` |   0.690 | 0.571 / 0.83x         | 0.562 / 0.82x               |
| `factory.literals`                      |   1.426 | 1.356 / 0.95x         | 0.740 / 0.52x (unqualified) |
| `model.axiomAnnotationsTransform`       |   1.310 | 1.571 / 1.20x         | 1.495 / 1.14x               |
| `util.OWLEntityRenamer`                 |   3.383 | 3.389 / 1.00x         | 3.224 / 0.95x               |
| `util.OWLEntityRemover`                 |   0.413 | 0.486 / 1.18x         | 0.424 / 1.03x               |
| `load.turtle`                           |   4.039 | 3.675 / 0.91x         | 3.051 / 0.76x               |
| `load.ntriples`                         |   3.915 | 3.321 / 0.85x         | 3.104 / 0.79x               |
| `load.nquads`                           |   3.114 | 3.390 / 1.09x         | 3.370 / 1.08x               |
| `load.trig`                             |   3.391 | 3.344 / 0.99x         | 3.105 / 0.92x               |
| `save.owlxml`                           |   1.428 | 1.190 / 0.83x         | 0.779 / 0.55x               |
| `save.rdfxml`                           |   5.507 | 3.177 / 0.58x         | 7.249 / 1.32x               |
| `save.turtle`                           |   2.725 | 0.666 / 0.24x         | 3.502 / 1.28x               |
| `profiles.OWL2RLProfile.checkOntology`  |   1.607 | 1.526 / 0.95x         | 1.516 / 0.94x               |

## Native removal and annotation-copy follow-up

The follow-up record's `nativeRecordBodyFollowup` retains three later independent processes of the exact transform family on the adopted implementation.
They share runtime-source hash `fdb751bbf4d8665ae816af4aef01b2aa0461a51ad60999767ea59f62ce597f42` and the unchanged harness hash above.
Java was not rerun; the two-warmup/five-call protocol is unchanged.

| Group                             | Java ms | Compatible ms / ratio | Normative ms / ratio |
| --------------------------------- | ------: | --------------------- | -------------------- |
| `model.axiomAnnotationsTransform` |   1.310 | 1.312 / 1.00x         | 1.259 / 0.96x        |
| `util.OWLEntityRenamer`           |   3.383 | 3.459 / 1.02x         | 3.467 / 1.02x        |
| `util.OWLEntityRemover`           |   0.413 | 0.369 / 0.89x         | 0.331 / 0.80x        |

Every annotation-copy and removal process is below 1.10x in both profiles.
One normative renamer process measured 3.821 ms, above its 3.7213 ms target; the raw recording remains included.
At that historical epoch, writer configuration and normative RDF/XML/Turtle saving remained unresolved; no contract-cost waiver was assumed.
Unadopted external prototypes and noisier host observations are retained as experiments and do not replace product measurements.

## Historical targeted candidate before final correctness repairs

The final follow-up covers 31 selected groups in seven affected families, each in three independent sequential processes with two warmups and five measured calls.
Every checksum-comparable median of process medians is at or below the strict 1.10x target.
This is a measured result for these workloads, not exhaustive public-API parity or proof from checksums alone.
Explained writer/literal profile differences and unequal closure forcing remain unqualified.
No Java timing invocation, tolerance floor or irreducibility waiver was used.

The last profile replay extraction affects only profile checking, so its four-profile family was rerun after the other six families.
The JSON retains both source epochs, harness and fixture identities, every first-use cost, raw wall sample and sampled heap delta.
First-use measures a call inside an initialized suite.
Heap deltas do not measure peak or retained memory.
Individual slower processes remain visible; loader configuration, writer configuration, N-Quads, TriG, simple short forms and compatible RL each have an above-target process despite passing combined medians.
These near-threshold results do not establish uniform host-independent speed.

| Group                                       | Java ms | Compatible ms / ratio        | Normative ms / ratio         |
| ------------------------------------------- | ------: | ---------------------------- | ---------------------------- |
| `config.OWLOntologyLoaderConfiguration`     |   1.130 | 0.8791 / 0.78x               | 1.0839 / 0.96x               |
| `config.OWLOntologyWriterConfiguration`     |   0.155 | 0.1694 / 1.09x               | 0.1287 / 0.83x (unqualified) |
| `formats.RDFXMLDocumentFormat.prefixes`     |   0.690 | 0.6022 / 0.87x               | 0.5896 / 0.85x               |
| `model.IRI.create`                          |   0.709 | 0.2590 / 0.37x               | 0.2564 / 0.36x               |
| `factory.entities`                          |   2.912 | 1.8480 / 0.63x               | 1.6005 / 0.55x               |
| `factory.literals`                          |   1.426 | 1.2342 / 0.87x               | 0.7147 / 0.50x (unqualified) |
| `factory.classExpressions`                  |   1.287 | 1.2485 / 0.97x               | 1.2268 / 0.95x               |
| `factory.dataRanges`                        |   0.565 | 0.5574 / 0.99x               | 0.4570 / 0.81x               |
| `load.turtle`                               |   4.039 | 3.5792 / 0.89x               | 3.0255 / 0.75x               |
| `load.ntriples`                             |   3.915 | 3.2645 / 0.83x               | 3.0503 / 0.78x               |
| `load.nquads`                               |   3.114 | 3.4138 / 1.10x               | 3.3288 / 1.07x               |
| `load.trig`                                 |   3.391 | 3.4050 / 1.00x               | 3.1528 / 0.93x               |
| `save.owlxml`                               |   1.428 | 1.2266 / 0.86x               | 0.8123 / 0.57x               |
| `save.rdfxml`                               |   5.507 | 2.6517 / 0.48x               | 5.9614 / 1.08x               |
| `save.turtle`                               |   2.725 | 0.6311 / 0.23x               | 2.8237 / 1.04x               |
| `model.axiomAnnotationsTransform`           |   1.310 | 1.3693 / 1.05x               | 1.2191 / 0.93x               |
| `util.OWLEntityRenamer`                     |   3.383 | 3.5040 / 1.04x               | 3.4980 / 1.03x               |
| `util.OWLEntityRemover`                     |   0.413 | 0.3503 / 0.85x               | 0.3227 / 0.78x               |
| `search.classHierarchyAndRelations`         |   2.743 | 2.4316 / 0.89x               | 2.4617 / 0.90x               |
| `search.propertyHierarchyAndDomainsRanges`  |   6.470 | 3.4816 / 0.54x               | 3.4234 / 0.53x               |
| `search.annotations`                        |   3.313 | 2.4957 / 0.75x               | 2.4036 / 0.73x               |
| `util.SimpleShortFormProvider`              |   0.434 | 0.4210 / 0.97x               | 0.4115 / 0.95x               |
| `util.AnnotationValueShortFormProvider`     |   1.264 | 0.7256 / 0.57x               | 0.6620 / 0.52x               |
| `util.OWLOntologyImportsClosureSetProvider` |   0.099 | 0.6858 / 6.93x (unqualified) | 0.3780 / 3.82x (unqualified) |
| `locality.extract.BOTTOM`                   |   2.319 | 1.6068 / 0.69x               | 1.3308 / 0.57x               |
| `locality.extract.TOP`                      |   2.238 | 1.5089 / 0.67x               | 1.3298 / 0.59x               |
| `locality.extract.STAR`                     |   3.287 | 1.9465 / 0.59x               | 1.7787 / 0.54x               |
| `profiles.OWL2DLProfile.checkOntology`      |   4.017 | 1.4825 / 0.37x               | 1.3999 / 0.35x               |
| `profiles.OWL2ELProfile.checkOntology`      |   2.226 | 1.5030 / 0.68x               | 1.4559 / 0.65x               |
| `profiles.OWL2QLProfile.checkOntology`      |   2.147 | 1.5222 / 0.71x               | 0.9742 / 0.45x               |
| `profiles.OWL2RLProfile.checkOntology`      |   1.607 | 1.5606 / 0.97x               | 1.5868 / 0.99x               |

The final append companion preserves immutable old snapshots, every incremental publication/revision, stale-draft detection, removal independence and observable key-call counts.
It copies only a small addition map between materialized bases; no published map or snapshot is mutated.
The normal set representation remains unchanged outside incremental addition drafts.

The read-view fast route proves native match order for uniform default-graph data with unique named subjects, no subject references and original provider methods.
It rejects ID aliases, multiple subject quads, foreign accessors, provider overrides and other shapes.
Stable singleton queries can share a private frozen view while retaining every original execution check; foreign getters retain the old collection path.

Cached profile replay uses a synchronous replay helper and awaits the existing yield directly in the original caller.
Depth, literal, edge, abort and deadline checks retain their original sequence, including after resumption.
No report, verdict or current-limit outcome is cached.

Independent baseline comparisons matched 5,000 branching collection observations and 1,432 controlled profile observations.
The RDF read-view comparison covered 229 datasets, 5,954 queries and 180 forced-stop cases; maintained final-source tests additionally pin accessor reads.
Final scoped runs passed 54 collection/state tests, 368 RDF tests, 9 explicit read-view cases and 1,224 profile tests.
These are separate targeted runs, not an additive full-suite result.

## Post-review corrections and current measurements

The final Claude follow-up stopped at its session limit after partial source reading and is incomplete.
The owner authorized GPT-6 Astra at Extra High to complete general review, with no further external review.
That review found four concrete preservation defects: missing native dataset helper guards, extra foreign term-type reads, an unrelated Array.values accessor read, and an extra asynchronous profile-replay continuation.
All four were corrected and closed in narrow Astra follow-up review.
The native subject proof also rejects blank-node prototypes that impersonate NamedNode.
Maintained read-view regressions passed 19 tests; the profile/read-view preservation run passed 54 tests across four selected suites.
Sixty additional controlled microtask/abort cases matched the original synchronous profile behavior; the rejected asynchronous helper reproduced ten divergences in that probe.
The earlier 1,432-case profile comparison remains attributed to its earlier source, not a fresh execution of the final repair.

The adopted RDF follow-ups reuse the existing private frozen unconditional support proof and remove an unused temporary Set from OWL 1 type recovery.
The latter retains the outgoing/filter/map term-read sequence, all execution checks and Boolean membership results.
Its private array membership uses at most four or eleven linear probes; the existing scan is already linear, although highly multi-typed subjects can have a larger constant cost.
RDF/XML reuses four per-write regular expressions and skips discarded Text-node serialization only for known native policies with admitted ASCII comment content, or the native non-strict policy.
Sanitation, actual native Comment validation, construction/output byte charges and the full normative reverse proof remain.
Foreign policies retain their original flag reads and validation path.
No public DOM injection contract or private dependency allocation-call-count guarantee is introduced.

The final native comment path matched 405 independent baseline output/error/budget controls and passed 77 targeted writer/storer tests.
The type-recovery change matched 24 controlled deadline/diagnostic/metadata observations, passed 13 resource tests, and passed 380 conformance/RDFS tests.
The first type-recovery command named two nonexistent test paths; the corrected command passed those intended suites.
These are separate targeted runs, with no full-suite total inferred.
Native AddAxiom records, transaction generator replacement, a certified metadata queue, ground transaction insertion and final comment-text reuse were rejected after controlled comparisons did not establish a consistent improvement.
Their experimental sources and all paired results remain outside the product tree.

The [post-review process record](java-api-performance-focused-followups.json) retains seven new source-family epochs, including every slow process and raw sample.
The newest root RDF epoch is `c26c373213e5a2bd4b1cabb2232086540ccbb69f1aa0c52b20c1b3e9a9fba975`.
It uses the unchanged two-warmup/five-measured-call protocol and the median of three independent sequential process medians:

| Case            | Java ms |   C ms / ratio |   N ms / ratio |
| --------------- | ------: | -------------: | -------------: |
| `load.turtle`   |   4.039 | 4.5416 / 1.12x | 3.4582 / 0.86x |
| `load.ntriples` |   3.915 | 3.6338 / 0.93x | 3.5799 / 0.91x |
| `load.nquads`   |   3.114 | 3.7773 / 1.21x | 3.6475 / 1.17x |
| `load.trig`     |   3.391 | 3.8947 / 1.15x | 3.5267 / 1.04x |
| `save.owlxml`   |   1.428 | 1.7139 / 1.20x | 0.9778 / 0.68x |
| `save.rdfxml`   |   5.507 | 2.9633 / 0.54x | 7.1635 / 1.30x |
| `save.turtle`   |   2.725 | 0.6819 / 0.25x | 3.5736 / 1.31x |

Six groups exceed the strict target in at least one profile in this epoch.
Earlier passing candidates and favorable paired clone runs do not override that result.
Final corrected profile medians remain below target: DL 1.2863/1.2451 ms, EL 1.3843/1.0959 ms, QL 1.2385/1.5793 ms and RL 1.5637/1.0014 ms, respectively C/N.
Those profile observations retain their own source identity; this is not a claim that every family was rerun on one final global snapshot.

## Verification and research

The owner subsequently restricted further verification to targeted tests per performance disparity.
No further full suite or broad browser matrix was run.
The earlier full Jest run passed 16,423 tests with 26 existing skips on tree 9190ec6b10ac7ebed845a0e3e20d71bfd266e67a; it predates later edits and does not qualify them.
Earlier targeted checks covered construction/configuration (722 tests), profile/datatype/facet preservation (435), affected RDF reconstruction/storage paths (405), and N3 parser/resource paths (18).
These counts describe separate scoped runs and are not an additive full-suite total.
The later consolidated RDF disparity check passed 266 tests across 11 explicitly selected suites covering read views, role/resources, RDFS preservation, structural comparison, RDF/XML writing/storage and N3/RDF/XML syntax admission.
The native removal change passed 145 targeted tests across three suites and five public-shape/application controls.
The subsequent exact annotation-body change passed 141 tests across axiom semantics and transforms, including deliberately different generic tuple/comparison bodies and BigInt/cyclic serialization failures.
The first command named a nonexistent transform test path; its corrected command discovered and passed the intended suites.

Earlier targeted packaged Chromium probes passed: 448 retained independent Java numeric-oracle cases, immutable IRI layout, writer copies, isolated prefix maps, the exact cached profile-work boundary, and an explicit Java-profile deadline.
That package predates the later Promise, loader, floating-point and OWL/XML corrections and does not qualify those edits.
A later targeted Chromium 156 package probe (tarball SHA-256 `90de8cc30e47978dc3f36a33546f531cf2f9f3831e038ac533637ad1fe61ea60`) passed 568 retained numeric observations, introduced loader-symbol copying, escaped text round-trips in both profiles for OWL/XML, RDF/XML and Turtle, and valid/invalid XML under an instrumented global Promise.
It also checked writer/prefix/IRI preservation, the exact cached profile-work boundary and the explicit Java deadline.
These are scoped package probes, not a broad browser qualification.
The draft browser probe initially passed an IRI where the public manager requires an ontology ID; its fixture was corrected before the passing run.
A worker probe delivered scheduled cancellation during cached profile assessment using a controlled 60 ms clock step; it establishes that branch's scheduling behavior, not wall-clock latency or performance.
The native import-map generator changed package-source hashes only; external provider hashes and the import graph remained unchanged.

The final scoped Chromium 156.0.8078.4 package probe used tarball SHA-256 `5ff7d2f2a3768308bd2db6aa9bbfd72a2fdbbe010cfc3abeb59fdc894a6cdf6d`.
It passed all 568 retained numeric observations, both profiles' escaped OWL/XML/RDF/XML/Turtle round trips, loader-symbol copying, writer/prefix/IRI contracts, valid/invalid XML with an instrumented Promise, and the exact 131/132 profile-work boundary.
A freshly bundled worker also delivered timer-scheduled cancellation during cached assessment of 20,000 declarations with a controlled 60 ms clock step.
That worker establishes the affected scheduling branch, not a latency guarantee.
The reviewed import map changed 15 package-source hashes; its import graph and external provider hashes stayed unchanged.
This package predates the final accessor, profile-continuation and RDF follow-up corrections; its coverage does not automatically extend to them.

The post-review scoped Chromium 156.0.8078.4 package probe used tarball SHA-256 `62eb0e355126f0b0030cc04187ed5179c2fe898cdb9a3eb4432fb880db917903`.
It passed the same 568 retained numeric observations, all six both-profile storage round trips, instrumented-Promise XML cases, loader/writer/prefix/IRI checks, exact profile-work threshold, explicit deadline and freshly bundled 20,000-declaration worker abort probe.
The import-map refresh changed only the four corrected package-source hashes; the import graph and external providers remained unchanged.
The package scope remains 198 files; rights inventory status remains PENDING_HUMAN_REVIEW.

A controlled forced-GC lifetime probe collected all 48 old cached snapshots while two current ontologies remained live, all 4,800 arbitrary miss subjects, and both disposed ontology/manager groups.
The two retained ontologies still exposed 64 axioms at revision 25.
This observation supports bounded weak ownership for those controlled objects; it is not a peak-memory estimate or a proof about all application retention.

Primary research used the [Schubfach paper](https://fmt.dev/papers/Schubfach4.pdf), [JDK Float rules](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Float.html), [V8 object layout](https://v8.dev/blog/fast-properties), [V8 tiering](https://github.com/v8/v8/blob/main/docs/runtime/tiering.md), the [RDF/JS data model](https://rdf.js.org/data-model-spec/) and [N3 parser documentation](https://rdf.js.org/N3.js/docs/N3Parser.html).
Installed source and measured behavior decide applicability.
N3 already supplies the custom lexer seam used here; no second lexer, provider replacement, dependency upgrade or copied external implementation was introduced.
Further inspection of the [RDF/JS dataset contract](https://rdf.js.org/dataset-spec/) and [installed provider implementation](https://github.com/rdfjs-base/dataset/blob/v2.0.3/DatasetCore.js) confirms that match materialization and ordering must be assessed together.
The [installed XML serializer's text-node path](https://raw.githubusercontent.com/xmldom/xmldom/0.9.12/lib/dom.js) only escapes text in its non-strict mode; existing explicit Unicode/XML admission remains authoritative before the actual document is serialized.
Further research used [V8 async continuation semantics](https://v8.dev/blog/fast-async), [V8 profiling](https://v8.dev/docs/profile), [Windows quality of service](https://learn.microsoft.com/en-us/windows/win32/procthread/quality-of-service), and [GetProcessInformation](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocessinformation).
Read-only host inspection found no explicit power-throttling opt-in for the measured Node process; inferred scheduling, CPU frequency and baseline host conditions remain unknown.
Concurrent host processes were observed, but that does not establish the cause of any timing difference.
Profiling's explicit GC samples include work outside measured calls and are not evidence of timed GC latency.

The owner authorized one diagnostic execution of only Java N-Quads load, RDF/XML save and Turtle save, without replacing the retained baseline or using the new timings for qualification.
The default executable resolved to Java 17.0.20; the baseline used 25.0.4.1.
The diagnostic medians were 3.750, 3.472 and 1.996 ms, versus historical 3.114, 5.507 and 2.725 ms.
Its mixed direction and different JVM do not isolate host drift or change the timing authority.
The local OWLAPI artifact reports the same 2026 build version, but the historical record lacks its byte hash, so artifact identity is not inferred from that string.
Current classpath artifact hashes and the unchanged baseline hash are retained with the diagnostic.

## Open decisions and recovery

The strict 1.10x requirement applies to every comparable workload, including sub-millisecond differences.
Six selected RDF groups remain above target in the newest epoch; process variation remains material, and no tolerance floor or profile exclusion was added.
Performance acceptance and plan completion remain open.
Closure Stream.count versus fresh JS Set materialization is unequal work even when counts match.
Metadata/signature/renderer differences are explained without changing their contracts.
The released 2024 Java semantic-probe jar is not claimed identical to the historical 2026 timing build.

JSON Quality repair and upgrades remain held by the owner.
The consolidated Claude Opus 5.5 Max review completed in approximately 18 minutes, within the authorized 60-minute allowance, on tree `8447bfbc1977e8c8e8cda6a863b071006507e893`.
Its two low-severity findings concerned loader symbols and tiny-double decimal spelling; both were independently reproduced and corrected with targeted regression checks.
The quota-interrupted earlier attempt remains incomplete evidence.
Two later narrow Opus 5.5 Max reviews completed in approximately 27 minutes each on trees `32b3fb4c2459903922d3388aace542a5058478b6` and `47e1ccb613bc6fb2638e999d2c6a983fb6428cf5`.
The first identified three prototype preservation issues involving tuple conversion order, original method capture and RDF term-position guards; each was corrected with focused checks before adoption.
The second reported no introduced correctness defect in the adopted delta.
Both frozen source trees and request hashes were verified unchanged after review; the restricted reader denied the outside-clone sentinel in each run.
A final narrow external follow-up of the append companion, native read views and profile replay helper stopped at quota on tree `cb1b7b37899ec4074973377f7eeafccb0aebdb28`; it is incomplete.
The owner-authorized final Astra review and completed narrow corrections are recorded above.
The completed AGY Flash 3.8 High follow-up on tree `f3c5e36b60196f9fc02df7a6ed8fa0abae6a783c` found only a symbol-only loader-update behavior that an independent baseline probe confirmed was pre-existing.
It produced no actionable change.
The owner then revoked AGY use here under that condition; the subsequent running review was stopped and remains incomplete.
Two earlier quota-only Claude attempts were rejected before source review; they are not completed reviews.

Codex Security completed the consolidated diff scan and a narrow follow-up through tree `8b8410921bf75629e16337bf3d4d1ad1aaaa3be7`, with no findings.
The follow-up used GPT-6 Astra at Extra High for fresh five-file discovery and carried forward 56 unchanged patch surfaces only after exact Git-blob checks.
That static security assessment does not replace general review or runtime verification.

The last consolidated security scan completed on tree `da7d0c4ac9817559e7ccfdbd6bf3f1d81e50cc02`, with no findings across 69 patch surfaces.
The final Codex Security follow-up, scan `666c5523-3b57-4a17-a7ef-9e6bb5293f6c`, completed on frozen tree `0f9ed858ec3a0590d113c682669feca696473cec`, with no findings across 70 surfaces.
It reused 56 surfaces only after exact Git mode/type/blob checks, freshly reviewed six documentation/data surfaces and reviewed eight source/test deltas with GPT-6 Astra at Extra High.
An isolated owned clone excluded concurrent release and JSON-tooling edits from another session.
The later commit-disposition and security-completion record updates are documentation/data only; runtime bytes remain identical to that frozen candidate.
No full-suite rerun or additional external review was performed for closure.

The owner chose **commit improvements; leave parity acceptance open** after reviewing the six remaining above-target groups.
This authorizes the local optimization increment and does not close AC-003, change the strict target, waive a timing failure, or authorize a release.

Revert each runtime seam with its supporting preservation tests if a regression appears.
No ontology migration or dependency changes are involved.
See the [accepted plan](../plans/2026-10-28-remaining-java-api-performance-parity-implementation-plan.md) and [coverage manifest](java-api-benchmark-coverage.json).
