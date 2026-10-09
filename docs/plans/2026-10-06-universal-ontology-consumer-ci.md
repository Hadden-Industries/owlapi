# Universal Ontology boundaries in unified CI and release qualification

**Status:** Accepted and delivered with the unified qualification plan through [PR 47](https://github.com/Hadden-Industries/owlapi/pull/47), merged on 6 October 2026; delivery reconciliation recorded 9 October.

The [installed OWL contract](../compatibility/installed-owl-contract.md) owns current source bindings, assertion inventory and executable behavior.
The historical proposal below does not introduce a second active workflow or qualification suite.
The shared producer runner and active gate replacements are implemented; UO materialization, WebVOWL application acceptance and future rc.2 publication remain separate outcomes.
**Decision owner:** Maksym Shostak.
**Authority:** The original planning request in Codex chat `01a10ad1-73ce-7512-926e-09463f441ee9`, amended by the owner's instruction in chat `01a10acc-165f-7c00-88f7-9e7b7a16157c` to use the same interface-boundary tests in CI and release against the latest consumer repositories' code.
This amendment supersedes the separate advisory UO workflow, execution of UO adapters and fixed consumer revision proposed in the earlier draft.
The original planning authority was followed by acceptance and implementation through the unified execution recorded above.
The original discovery baseline below remains historical; current inventory bindings and evidence are owned by the installed-contract record, and publication retains separate authority.

**Pinned-input amendment, 9 October 2026:** The owner selected the commits already recorded in `docs/release/owl-contract-sources.json`: UO `9a3b5bff5aeaff4540f14bdf65baeffc1c0d188d` and WebVOWL `a468e17701d495fd9e1a801aef169894b2045186`.
The [unified plan amendment](2026-10-06-installed-owl-contract-qualification.md) supersedes this plan's latest-source REQ/AC-008 and DEC-002 and the corresponding unified REQ/AC-011 and DEC-007.
Qualification, CI reuse and release preflight validate those exact commits, trees and reviewed interface blobs; missing or substituted inputs fail closed.
Consumer branch movement does not change the selected input.
Advance a pin through explicit source review and qualification.
The current OwlAPI candidate, 69 native assertions and same-run artifact/release evidence remain mandatory; compatibility claims cover the selected consumer baseline.

## Outcome and relationship to the unified plan

Qualify the installed OwlAPI candidate's supported public interfaces used by current Universal Ontology (UO) and VOWL/WebVOWL source.
Use one producer-owned runner and reviewed assertion inventory in both CI and release.
This document supplies UO-specific contract discovery and traceability to the [installed OWL contract qualification plan](2026-10-06-installed-owl-contract-qualification.md), which owns the integrated job, protocol, release-policy migration and implementation execution.
It creates no separate workflow, consumer test suite, report schema, required status or lifecycle execution.
Shared requirements and probes are deduplicated; UO call sites add provenance or demonstrated missing public-contract coverage to the same inventory.

CI and release run the same assertions, fixtures, inventory and runner against their own exact retained package candidates.
Release retains its current evidence freshness and publication controls; a passing PR is not automatically release evidence.
Tests assert OwlAPI's documented semantics and data shapes, with independently justified expectations.
Consumer source identifies usage, not correct OWL semantics.
The result establishes the producer contracts consumed at those interfaces; it does not establish successful execution of UO materialization or the WebVOWL application.

Reuse the [rc.2 Java-parity programme](0.1.0-rc.2-java-parity.md), including the accepted producer-release-independence amendment, and [ADR 0010](../adr/0010-ci-applicability-observation.md), [ADR 0011](../adr/0011-full-ci-qualification-lineage.md) and [ADR 0012](../adr/0012-gated-native-java-reference-reuse.md) within their existing scope.
Requiring producer contract evidence is consistent with independent consumer adoption.
No downstream consumer success becomes a producer CI or release prerequisite.
Selective execution remains inactive, and this reconciliation changes neither the pinned Java authority nor the producer's broader conformance responsibilities.

## Historical latest-source policy, superseded 9 October 2026

This section preserves the original design rationale.
The pinned-input amendment above and the [installed contract](../compatibility/installed-owl-contract.md#pinned-consumer-source-admission) define current behavior.

At the start of each CI or release qualification, resolve the GitHub default branch and current committed HEAD of both `Hadden-Industries/universal-ontology` and `Hadden-Industries/webvowl`.
Capture that source snapshot once and retrieve relevant committed files at the exact SHA through bounded native GitHub/Git facilities.
Record repository, default branch, resolved SHA, acquisition identity, relevant source/manifest digests and reviewed inventory identity in qualification evidence.
Use the same source-resolution policy in both workflows.
“Latest” means latest committed default-branch code at that recorded capture, not a permanent pin, package release tag, local dirty checkout or branch that moves during testing.

Read source to inventory public imports and the member/data-shape reads and callbacks that use them.
Do not install consumer dependencies, execute scripts, tests or adapters, build distributions or run application code.
The fixture runtime imports only the candidate's public installed package and producer-owned test code.
Source acquisition is separate from semantic execution and grants no network access for ontology/context loading.

A reviewed inventory must cover the public usage in each captured snapshot.
New or materially changed relevant usage fails closed as `CONTRACT_INVENTORY_CHANGED` until the inventory and independently justified expectations are reviewed.
Do not silently fall back to an earlier consumer revision, automatically derive expected results from consumer code, or omit an unreviewed boundary.
Unrelated consumer edits need no new semantic assertions; record their latest SHA and show why reviewed interface coverage still applies.
Source lookup failure produces an explicit qualification failure, not a claim that a historical snapshot is current.
Retain existing bounded native transport and attempt limits; establish the exact small acquisition allowlist and limits in SLICE-001 instead of introducing another archive parser or service.

Current source snapshots are inputs to evidence admission, including whole-run main reuse.
Resolve them before admitting reused qualification; mismatched snapshot bindings use the existing fresh qualification path.
Preserve the original evidence identity and existing `FULL_ONLY` policy; do not rewrite old receipts, add selective execution or reuse a historical consumer snapshot as current evidence.
Both workflows consume the same accepted inventory version; a consumer source change requiring inventory revision must be integrated coherently before either claims current coverage.

## Inspected baseline and prerequisite disposition

| Input                            | Observation on 6 October 2026                                                                                                                                           | Planning consequence                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| OwlAPI                           | Local `main` at `073beefb7805130bc0452472d1a9c801471fbaf1`.                                                                                                             | Recheck checkout, dirty state and active policies at implementation admission.                                    |
| UO current source                | GitHub default branch `main`, HEAD `07ecd840a152eac3e18c8ed4ce19a878d7be3cb8`; committed source inspected at that SHA. Local package manifests contain unrelated edits. | Planning snapshot only; refresh each qualification and exclude local dirty bytes from source evidence.            |
| WebVOWL current source           | GitHub default branch `main`, HEAD `c10c41003de9c0fb1940964f3bb40274174538c2`; VOWL public API usage under `packages/vowl/src/owl`.                                     | Planning snapshot only; the same latest-source policy applies to both repositories.                               |
| Producer fixtures                | Installed-package probes, `test/import-closure/public-contract.js`, parser metadata and producer storage/browser fixtures.                                              | Reuse genuine public-package exercises and independently specified oracles.                                       |
| Existing UO corpus qualification | `test:universal-ontology` uses the immutable original corpus and producer Java-comparison harness.                                                                      | Retain independent producer semantics evidence; a historical corpus is not a current consumer code snapshot.      |
| CI and release                   | Retained exact candidates, schema-3 producer receipts and active mixed WebVOWL/UO application prerequisites.                                                            | Apply the primary plan's coordinated schema-4 `owl_contract` migration and producer release-policy decomposition. |
| HISEW                            | Personal workflow active; no active implementation execution; registered `focused`, `affected`, `full` profiles.                                                        | Reuse one accepted R2 execution for the unified change; this draft is not execution evidence.                     |

The earlier UO snapshot `8efcba8957b91d0eb4a35f8b766ab3c9d5d3f6b6` and separate advisory-workflow proposal are superseded planning history.
Neither is an executable baseline for the reconciled approach.
Preserve unrelated OwlAPI and consumer checkout changes.
No consumer checkout mutation or HISEW configuration change is needed to prepare this document.
Recheck configured external evidence destinations before implementation artifacts; retain product-owned fixtures and authored specifications in the repository.

## Binding test boundary and source-grounded inventory

An assertion is admitted only if its expected result is a supported public OwlAPI guarantee used at a current consumer interface.
Record the exact consumer call site, public symbols/member reads, owning producer requirement, fixture/oracle, runtime coverage and a concrete incompatible-package change that would make the assertion fail.
A consumer algorithm that happens to call OwlAPI is insufficient.
Consumer expectations that require an undocumented guarantee are assumptions or proposed API decisions; stop their dependent implementation rather than making them the producer oracle.

| Current UO source seam                                                                           | Admitted producer contract candidates                                                                                                                                        | Excluded downstream behavior                                                                                               |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `scripts/materializeImportClosure.js` and `scripts/build/fullOntologyAssets.js`                  | Public `OWLManager`/loader configuration/format exports, document-loader callback inputs, graph-load result and manager access actually consumed.                            | Materialization orchestration, full-version discovery, builds, workers and release generation.                             |
| `scripts/ontology/ontologyDocumentLoader.js` and `oasisXmlCatalogIRIMapper.js`                   | `IRI`, `StringDocumentSource`, loader configuration, document/context identity, mapper callback contract and documented missing-import/resource/security error propagation.  | HTTP retries, decoding algorithms, filesystem acquisition and catalog matching rules.                                      |
| `scripts/ontology/collapseImportsClosure.js`                                                     | Imports-closure set provider, merger, `SetOntologyID`/`AddOntologyAnnotation`, real ontology/axiom/annotation/identity reads and documented change effects.                  | UO's composed collapse algorithm, annotation-selection policy and application-specific output acceptance.                  |
| `scripts/ontology/assertLosslessOntologyLoad.js`                                                 | Graph result `ontology`/`documents`, document context and format, diagnostics, RDF loader metadata, unparsed triples, guessed declarations and declaration/IRI field shapes. | UO's reject-any-diagnostic policy and inference that every document is lossless.                                           |
| `scripts/ontology/atomicOntologyWriter.js` and `verifyStandaloneOntology.js`                     | Public `StringDocumentTarget`, `saveOntology`, deterministic format output/failure, fresh-manager reload, ontology identity and import/configuration semantics.              | UO's atomic publication, durability, recovery, structural fingerprint and standalone-output validation algorithm.          |
| VOWL's `compatibleLoading.js`, `loading.js`, `modelBuilder.js`, `policy.js`, `sourceEvidence.js` | Public loader/model/profile/metadata interfaces already inventoried by the primary plan, with shared probes deduplicated against UO usage.                                   | VOWL projection, canonicalization, admission policies and deadlines; WebVOWL rendering, layouts, filters and interactions. |

Inspect transitive reads sufficiently to find the boundary; this table is a candidate inventory, not accepted new API semantics or permission to execute those files.
Direct annotation/change tests follow the documented producer guarantee.
UO's choice to drop imported annotations or retain only root annotations remains UO policy.
Direct metadata tests preserve documented values and uncertainty; UO's stricter losslessness decision is not a producer assertion.

Use the smallest hand-authored, rights-cleared producer fixtures that distinguish each supported obligation, with independent expected structures and existing pinned Java evidence where applicable.
Round trips supplement independent expectations; candidate-generated round-trip equality alone is insufficient.
Cycles/shared imports, anonymous-individual separation and failure paths enter the inventory only when they expose a supported producer contract.
Mock genuine external document acquisition with deterministic inputs while exercising the real installed manager, parser, model and storage APIs.
A current UO real-source closure is not a mandatory test or an oracle.
Reuse an existing pinned producer corpus only for its established semantic claim; add an external fixture only for a demonstrated coverage gap with exact provenance and rights.
No full corpus acquisition/build or three-run cold UO application campaign is introduced.

## Local requirements and acceptance criteria

These IDs remain local to this UO refinement and map into the primary plan; they do not create duplicate release gates.

| Requirement                                 | Acceptance criterion                                                                                                                                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 Real installed boundary             | AC-001: Every UO-derived assertion imports the exact retained candidate through public `owlapi` entry points; native identity/resolution checks reject another package, source symlink or ancestor installation. Maps to unified REQ-002.                       |
| REQ-002 Producer ownership                  | AC-002: Each assertion has a current consumer call site and supported producer guarantee with an independent oracle. No consumer script, adapter, test, build or application is invoked by the semantic suite. Maps to unified REQ-001/003.                     |
| REQ-003 Proportionate fixtures              | AC-003: UO and VOWL usage share one deduplicated inventory and small producer-owned fixtures; existing meaningful probes are reused and no mandatory real-source materialization or full consumer suite remains. Maps to unified REQ-003/005.                   |
| REQ-004 Bound native evidence               | AC-004: Actual assertion execution/results bind exact candidate, runner/fixture/inventory, source snapshots and workflow/run/attempt identity; missing/skipped/duplicated/unregistered assertions fail coverage. Maps to unified REQ-004/006.                   |
| REQ-005 Unified producer acceptance         | AC-005: CI and release invoke the same runner, assertions and inventory with their own retained candidates. No UO or WebVOWL downstream success/report is required, directly or through active predecessor policy. Maps to unified REQ-009/010.                 |
| REQ-006 Supported runtimes and bounded work | AC-006: Existing producer platform/browser modes retain mandatory coverage; source reads and isolated installs are bounded, and no consumer dependency installation or build is required. Maps to unified REQ-005/008.                                          |
| REQ-007 Fail-closed recovery                | AC-007: Candidate substitution, replay, missing proof and interrupted installation cannot produce admissible success; coordinated rollback preserves producer obligations, historical evidence and unrelated files. Maps to unified REQ-006/008/010.            |
| REQ-008 Current consumer source             | AC-008: Each qualification resolves both repositories' latest default-branch SHAs once, records source digests and proves reviewed coverage of relevant usage; changed usage fails for inventory review with no stale-source fallback. Maps to unified REQ-011. |

## Quality scenarios and decisions

| Scenario                              | Stimulus and falsifiable response                                                                                                                                                                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-001 Package authenticity           | Replace the candidate, remove a public export or expose an ancestor installation: native installed-package validation rejects it before contract success.                                                                                                            |
| QA-002 Semantic discrimination        | Change a promised public value, documented error, imports-closure primitive or metadata result: its independent producer assertion fails without invoking a UO/VOWL adapter.                                                                                         |
| QA-003 Complete current coverage      | Add an unreviewed consumer member read, skip a required probe or submit an inventory-shaped map of `PASS` values: current-source or native coverage admission rejects it.                                                                                            |
| QA-004 Ownership independence         | Leave local consumer checkouts unavailable and break an application-only UO/WebVOWL behavior: source snapshots can still be read remotely and the producer suite is independent of that behavior. Fail a real producer promise: both workflows reject the candidate. |
| QA-005 Same tests and fresh evidence  | Inspect CI/release execution manifests: runner, inventory, fixtures and required assertions match. Stale PR proof or mismatched current source bindings cannot replace required release evidence.                                                                    |
| QA-006 Bounded operation and recovery | Interrupt a source lookup or install: no successful incomplete report or checkout mutation occurs. Source lookup failure is explicit, semantic tests cannot fetch remote ontologies, and rollback restores matching policies/readers.                                |

| Decision                         | Selected proposal                                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-001 Unified qualification    | Replace the former advisory UO proposal with UO provenance in the primary plan's single required producer `owl_contract` suite, used by CI and release. Preserve consumer adoption independence.                                                  |
| DEC-002 Latest committed sources | Resolve each default branch at qualification start, freeze exact SHAs and source digests for that execution, and refresh reviewed coverage for materially changed usage.                                                                          |
| DEC-003 No consumer execution    | Discover interfaces from committed source; execute real installed producer APIs with independent fixtures. Neither UO adapters nor selected UO test files form the runner or oracle.                                                              |
| DEC-004 Reuse native seams       | Reuse retained artifacts, native package installation/exports, producer fixtures, existing browser/platform jobs and bounded evidence admission. No forwarding shim, new test framework or consumer dependency graph.                             |
| DEC-005 One coupled migration    | Use the primary plan's CI/release protocol and active mixed-gate migration, including paired prepublication controls. Preserve producer corpus/security/artifact guarantees and historical results; add no separate workflow or report migration. |

## Risk route and prerequisites

Proposed R2 within the primary plan's single change, because required producer proof and release admission can be falsely weakened by partial job, report or prerequisite migration.
The owner accepts the exact unified baseline and source-grounded inventory before implementation.
Required evidence is the consolidated requirement/oracle matrix, actual installed candidate execution, native negative controls, integrated CI/release admission tests and publication-free hosted readback.
Independent assurance must review semantics, complete coverage, source freshness, artifact trust and active release predecessor migration.
Use the primary plan's bounded review and configured lifecycle; this refinement authorizes no reviewer dispatch or scan.

Principal unknowns are undocumented consumer assumptions, the exact source acquisition allowlist and bounded native transport, all public member reads, missing unique producer coverage and compatibility of snapshot admission with current reuse readers.
Resolve them before activating required proof.
Temporary artifacts use rechecked configured external storage; fixtures/specifications stay product-owned.
Missing oracle, authority, source proof or active-reader inventory stops dependent work rather than waiving a requirement.

## Vertical slices in the unified execution

| Slice                                    | Local traceability                               | Observable proof and dependency                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SLICE-001 Inventory and source admission | REQ-001–008; QA-002–005; DEC-001–005             | Inspect current committed UO/VOWL usage and all snapshot/proof readers; produce the deduplicated producer oracle matrix and source-resolution policy. Resolve undocumented assumptions and mixed-gate obligations before changing required jobs. This is unified SLICE-001, not a new execution. |
| SLICE-002 Installed producer probes      | REQ-001–004/006–008; QA-001–004/006; DEC-002–004 | Extend only demonstrated gaps in the primary installed contract runner. Show valid candidate pass, real semantic/error failure, source-inventory change rejection and no consumer execution. Existing application gates remain until integrated migration.                                       |
| SLICE-003 CI/release admission           | REQ-004–008; QA-001/003–006; DEC-001/002/005     | Wire the same suite and current-source bindings into both workflows and all active evidence/preflight readers. Old, incomplete or wrong-candidate/source proof fails; downstream application absence cannot block producer proof.                                                                |
| SLICE-004 Frozen assurance and recovery  | REQ-001–008; QA-001–006; DEC-001–005             | Complete the primary plan's relevant native checks, independent assurance and publication-free hosted evidence. Read back actual source/candidate/job identities and prove coordinated rollback; retire obsolete wrappers only after reference migration.                                        |

Slices execute in order under the unified integration owner.
No `.github/workflows/universal-ontology-consumer.yml`, `qualify-universal-ontology-consumer.mjs`, separate advisory status, consumer lockfile installation or cross-workflow candidate rendezvous is part of this reconciliation.
Use the primary seams: `scripts/qualify-owl-contract.mjs`, `test:owl-contract`, `test/consumers/owl-contract`, `ci.yml`, `release.yml`, current coverage/qualification readers and release-policy/evidence consumers.
Keep source-resolution and inventory validation in that native path rather than inventing a second coordinator.

## Verification, rollout and recovery

Document changes are checked with the repository's native Markdown formatter/checker; they do not constitute future runtime acceptance.
For implementation, verify genuine installed-package assertion execution, deterministic source snapshot admission, changed-usage rejection, candidate substitution/replay and matching CI/release manifests.
Run the focused impacted producer/protocol suites, then the registered full profile plus missing platform/browser/hosted evidence required by the primary plan.
Do not run downstream consumer functionality to prove producer qualification.
Source acquisition and test permissions stay minimal, without publication credentials or `pull_request_target` candidate execution.

Activate only the complete reviewed CI/release runner, inventory, protocol and active prerequisite graph.
Schema-3 WebVOWL and historical UO application reports remain historical; they cannot supply new producer contract or current consumer-source proof.
Retain producer-owned Java/corpus semantics, security/provenance, registry-install/byte-identity and immutable-release guarantees.
Preserve `CI / required` and `Release / qualified`; inspect any external required inner status before delivery without changing repository settings under this draft.

Abort for missing current source, unresolved relevant usage, independent-oracle failure, candidate mismatch, surviving downstream prerequisite or weakened mandatory producer control.
Recover through the primary plan's coordinated ordinary rollback or forward repair, with matching readers/writers and freshly qualified evidence.
Do not rewrite historical evidence or manufacture application acceptance.
Measure runner work and elapsed time from actual equivalent qualifications; no additional recurring consumer monitoring or repeated cold-run campaign is required.

## Completion and replanning

This reconciliation is complete as planning when both drafts express the same current-source policy, producer-owned inventory and CI/release boundary.
Future implementation completes only when local AC-001–008 and unified AC-001–011 are evidenced under the accepted route, with actual hosted qualification distinguished from publication.
A green result must say “installed OWL contract qualified against recorded consumer source snapshots,” not “UO materialization/WebVOWL application accepted.”

Replan for a genuinely new public guarantee, unbounded source transport, missing independent oracle, material dependency/runtime/rights change, new proof reader or a conflicting required status.
Consumer algorithm changes alone do not expand producer assertions.
Preserve one accepted inventory, one integration owner and the primary plan's delivery boundaries.
