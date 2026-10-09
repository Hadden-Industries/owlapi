# Unified installed OWL contract qualification for CI and release

**Status:** Accepted and delivered through [PR 47](https://github.com/Hadden-Industries/owlapi/pull/47), merged on 6 October 2026 at `c6745a4a72dc08e906d416028a104e5057a237cb`; delivery reconciliation recorded 9 October.

The original proposal and inspected baseline below remain historical planning context.
The [installed OWL contract](../compatibility/installed-owl-contract.md) records the accepted plan snapshots, delivered runner, reviewed source inventory and active producer-policy migration.
CI and release now use `test:owl-contract` against their own retained package; downstream application execution and acceptance are not required producer proof.
Later Node 26 delivery advances the current CI qualification policy/schema to 5; exact inventories and source bindings are owned by their current records, not the original proposal's versions.
This implements the gate-separation portion of [rc.2 SLICE-001](0.1.0-rc.2-java-parity.md#12-remaining-slice-and-release-work), not the wider feature programme or exact-release qualification.

**Decision owner:** Maksym Shostak.
**Authority:** The owner's request in Codex chat `01a10acc-165f-7c00-88f7-9e7b7a16157c` to plan replacement of the WebVOWL CI part, following the agreed producer/consumer responsibility boundary, and the subsequent instruction to apply the same proportionality to release-side WebVOWL checks.
The original request authorized planning; the subsequent accepted snapshots and delivered migration are recorded above and in the installed-contract record.
Historical proposed steps below do not replace actual verification evidence or authorize publication.
**Scope amendment, 6 October 2026:** The owner explicitly added release-side WebVOWL qualification.
This revision supersedes the original CI-only scope and DEC-004's preservation of the executable release application gate.
Requirement IDs remain local and stable; REQ/AC-009–010 and QA-008–009 add release migration and historical-policy obligations.
**Unified consumer amendment, 6 October 2026:** The owner requires identical CI/release interface tests grounded in the latest committed UO and WebVOWL source. The [UO plan reconciliation](2026-10-06-universal-ontology-consumer-ci.md) supplies UO-specific provenance within this single execution, superseding its separate advisory workflow and consumer-adapter execution proposal. REQ/AC-011 and QA-010 add current-source admission; no consumer application execution is introduced.

## Purpose and governing basis

Make `CI / required` and producer release qualification establish that the retained OwlAPI package provides its documented OWL data and public API correctly, including the contracts used by UO and VOWL, without making either producer acceptance or publication depend on VOWL projection or WebVOWL application behavior.
The intended outcome is stronger responsibility alignment and useful producer feedback; reduced installation and runner work is a hypothesis to measure, not a promised saving.

The selected direction is one producer-owned installed-package contract runner and assertion inventory, used by CI and release against each workflow's own exact retained candidate, with independently specified expectations and no executable dependency on a WebVOWL checkout, VOWL package or Universal Ontology build.
Release executes that focused proof under its existing freshness policy; a green PR receipt is not automatically current release evidence.
There is no second release-only semantic suite or full application pass.
Current committed UO and VOWL/WebVOWL call sites inform one deduplicated contract inventory; they do not define correct OWL semantics or become an oracle that the producer must imitate.
OwlAPI continues to qualify its entire supported public surface through its existing source, Java, installed-package, portability and browser checks; this focused inventory is not a new limit on library responsibility.

Reuse these governing records within their actual scope:

- [Input-aware CI qualification](2026-10-03-ci-input-aware-qualification.md), [ADR 0010](../adr/0010-ci-applicability-observation.md), [ADR 0011](../adr/0011-full-ci-qualification-lineage.md) and [ADR 0012](../adr/0012-gated-native-java-reference-reuse.md): complete native coverage, authenticated direct lineage, bounded evidence admission, unchanged omission deferral and the accepted Java materialization policy.
- [rc.2 Java-parity programme](0.1.0-rc.2-java-parity.md), especially its release-independence amendment and executable-control inventory: consumer adoption must not define producer acceptance, and mixed historical requirements must retain their producer-owned obligations.
- [Java parity requirements for WebVOWL](../requirements/java-parity-for-webvowl.md) and [RDF parser metadata contract](../compatibility/rdf-parser-metadata.md): existing public semantics and the distinction between historical parser evidence and VOWL admission.

This is a bounded CI and release-qualification implementation proposal consistent with those decisions, not activation of selective execution, approval of the rc.2 feature programme or a change to the pinned Java oracle.
The existing broad checks remain executable until their coordinated replacements are accepted and implemented; their current presence is not an endorsement of downstream application responsibility.

## Source baseline and prerequisite disposition

| Input                                   | Inspected identity or behavior                                                                                                                                                                     | Planning consequence                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| OwlAPI checkout                         | `073beefb7805130bc0452472d1a9c801471fbaf1`, on `main`                                                                                                                                              | Recheck source and dirty state at implementation admission.                                                                     |
| Current application consumers           | WebVOWL `4f1970e5b6c95655af823c495bd58f9e9993f8b8`; UO `c2220675b0f3345628fc9cc8112a41440afcb2f0`                                                                                                  | Historical CI/release consumer/corpus identities, not dependencies of either new producer check.                                |
| Consumer source inspected for this plan | Latest GitHub default-branch `main`: WebVOWL `c10c41003de9c0fb1940964f3bb40274174538c2`; UO `07ecd840a152eac3e18c8ed4ce19a878d7be3cb8`. Committed source inspected at those SHAs.                  | Planning observations only; refresh both snapshots at each qualification. Local dirty consumer manifests are not source inputs. |
| Current qualification                   | CI receipt schema 3, policy version 3, `FULL_ONLY`; typed checks `java` and `webvowl`                                                                                                              | Coordinate writers, readers, accounting and job inventory; never reuse an old verdict as the new check.                         |
| Broad execution                         | Baseline and candidate full WebVOWL Jest, application builds, corpus conversion tests and a Vite/Chromium conversion fixture                                                                       | Replace application-owned assertions in CI and release; preserve producer package/runtime obligations.                          |
| Existing narrow components              | `scripts/installed-consumer-fixtures.mjs`, installed-package probes, `test/import-closure/public-contract.js`, parser metadata tests and producer browser fixtures                                 | Reuse actual native installed-package exercises instead of creating a second ontology API or test framework.                    |
| HISEW                                   | Active personal applicability; no active execution; profiles `focused`, `affected`, `full`                                                                                                         | Plan preparation is available. No unrelated execution or earlier approval is adopted.                                           |
| Release acceptance coupling             | `release.yml` requires `webvowl`; `qualify-release.mjs` requires exact WebVOWL and UO prepublication reports; Phase 22 gates depend on the Phase 21 checkpoint, which includes consumer acceptance | Replace current application prerequisites with current producer proof and explicitly migrate active mixed predecessor policy.   |

The HISEW planning prerequisites are recorded here as one draft dossier: requirements and acceptance criteria, domain invariants, quality scenarios, selected design, source seams and a proposed route.
The remaining pre-implementation prerequisite is owner acceptance of the exact dossier and protected requirement capture, plus confirmation of the impact/oracle inventory in SLICE-001.
No missing acceptance, independently reviewed inventory or migration proof is represented as already available.

The checkout already contains unrelated edits to `docs/implementation-plan.md` and `docs/plans/2026-09-29-security-and-dependency-consolidation.md`, and the untracked profile/default repair and Universal Ontology consumer CI drafts.
Preserve unrelated bytes and ownership.
The owner's current reconciliation request authorizes updates to this plan and the UO draft so they describe one unified approach.
This plan incorporates UO public-interface provenance, not UO adapter/application execution. It does not authorize deferred profile/default repairs or a separate UO consumer workflow.
New HISEW execution evidence belongs under the configured external root `C:\Users\maksy\.hi\w\e`, resolved again before writing it.
Product-owned fixtures, protocol specifications and authored documentation remain in the repository.

## Risk route

### Risk class:

Proposed R2, consistent with the existing CI/release assurance route; confirm the expanded scope at implementation admission.

### Decision owner:

Maksym Shostak accepts the required-check meaning, exact contract inventory and migration.

### Reasoning:

Inference from the inspected code: changing mandatory CI/release jobs, publication prerequisites, typed proof and cross-run admission can falsely admit or publish an inadequately qualified candidate if only YAML or display names are changed.
The risk is governed by the meaning of producer acceptance, not the small size of a workflow edit.
No safety-critical, regulated or similarly consequential R3 use is identified in this bounded change.

### Potential blast radius:

OwlAPI PR/main qualification, release preflight/finalization and evidence consumers, native Java reference eligibility that reads CI qualification, maintainers and all consumers relying on producer verdicts or published artifacts.
Mixed historical checkpoint requirements can reintroduce application acceptance transitively unless their active policy is reconciled.

### Reversibility:

One reviewed integrated change can restore the previous CI/release jobs, active gate policy and matching readers/writers.
Receipt incompatibility may require fresh qualification; rollback does not rewrite historical evidence or guarantee reuse availability.
No ontology data migration is proposed.

### Principal unknowns:

Exact source-level contract inventory, unique coverage beyond existing candidate/browser jobs, all CI/release readers, mixed historical gate dependencies, and externally required status names.
SLICE-001 resolves these before activating the new job.

### Required artifacts:

This dossier and protected accepted snapshot; source-grounded contract/oracle and mixed-release-obligation matrices; updated active CI/release policies and schemas; native execution evidence; bounded review dispositions; publication-free hosted qualification/readback and recovery record.
Reuse existing evidence stores and generators; no separate governance service or parallel ledger.

### Required specialist lenses:

OWL public-contract and oracle correctness, installed-package/browser composition, and CI artifact/proof trust boundaries, with independent verification of the frozen integrated candidate.
Select the configured ordinary reviewer through HISEW at implementation time; this draft does not appoint a provider or authorize delegation or a security scan.
The lifecycle owner must resolve the applicable native security assessment under the accepted R2 route before handoff.

### Required verification:

Focused native contract and protocol-negative checks during development; impacted workflow/reuse/browser checks at integration; the registered `full` profile plus missing product-specific and hosted evidence at final assurance.
Profile names alone do not establish coverage.

### Required human approvals:

Exact implementation baseline and route; any changed public API, external fixture rights, dependency/runtime selection, HISEW profile configuration or GitHub settings beyond this draft; delivery effects retain their own authority.
Planning authority is not a commit, push, merge or release instruction.

### Maximum sensible autonomy:

Prepare this draft and inspect native evidence now.
After acceptance, implement and verify the bounded CI/release replacement within the captured scope; stop dependent work for changed semantics, missing oracle or authority, or failed admission.
Release testing does not authorize tagging, registry publication, immutable-release finalization or deployment.

### Next lifecycle step:

Accept and capture the exact dossier, recheck applicability and source identity, then start one R2 implementation execution.
Complete SLICE-001 before changing the required verdict.

## Domain invariants and scope

OwlAPI owns parsing, OWL structure, import-closure behavior, queries, documented metadata, serialization, profile assessment and its public errors.
UO owns materialization orchestration, catalog/retry algorithms, annotation-selection and losslessness policies, distribution generation and atomic publication.
VOWL owns projection, canonicalization, document admission and VOWL model invariants.
WebVOWL owns rendering, layouts, filtering, selection, editing interactions, application workers and application deadlines.
Producer browser/worker package loading is an OwlAPI concern; an application's worker transport or graph rendering is not.
No success claim here means that arbitrary ontologies are lossless, OWL 2 DL-valid, admitted by VOWL or accepted by the application.

In scope are replacement CI and release jobs using the shared installed-package fixture, native assertion accounting, coordinated CI receipts/readers, release preflight/evidence readers, active gate policy and dependency reconciliation, workflow governance, documentation and precise names.
Retain source/Java conformance, installed-package identity, no-network behavior, storage failures, portability and the existing Chromium/Firefox/WebKit producer checks.
Retain `CI / required` and `Release / qualified`, their fail-closed producer coverage, artifact identity and security/provenance checks, and the existing approved whole-run main reuse arrangement under the revised CI policy.

Out of scope are library API/default/performance fixes, VOWL/WebVOWL source or dependency changes, graph and filtering tests, UO materialization, new caches, selective omission, Java recipe/rights/activation changes, repository settings and publication.
Do not add a replacement optional full-app monitor, scheduled task or advisory job as part of this change.
The release WebVOWL job and application-report prerequisite are now explicitly replaced, including transitive consumers in checkpoints, preflight, qualification evidence and finalization paths.
The existing paired WebVOWL/UO prepublication validator must be decomposed: replace mandatory application acceptance with the required producer contract proof, while retaining independently reproducible UO-origin producer corpus checks and the existing release-independence decision.
This is the minimum coupled control migration.
The reconciled UO plan adds source-grounded producer interface coverage to this same suite; no UO advisory workflow or application acceptance test is created.
Historical rc.1 qualification and consumer reports remain historical.
Their accepted results are neither rewritten nor used as substitutes for the current producer proof.

## Requirements and acceptance criteria

The following IDs are local to this dossier; do not insert them into historical Phase 19–22 generated gate catalogues.

| Requirement                                  | Acceptance criterion                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 Producer ownership                   | AC-001: Required CI and release qualification invoke no UO/WebVOWL/VOWL script, adapter, test, build, converter, renderer or application worker and install no consumer dependency graph. Read-only committed source acquisition establishes current interface usage; semantic execution imports only the candidate's public package and producer test code. All mandatory producer checks remain. |
| REQ-002 Native candidate composition         | AC-002: The check consumes the same-run retained candidate by exact artifact ID and verified digest, installs its exact tarball through the native `owlapi` dependency name, and proves installed identity, exports and resolution without repository-private imports, parent `node_modules`, symlinks to source or a second hidden package.                                                       |
| REQ-003 Complete selected handoff contract   | AC-003: Every inventoried current UO/VOWL public read or callback has a producer requirement, independently justified expectation and executed owning probe. Deduplicate shared interfaces. Include positive, failure and retained-evidence cases; consumer policies and undocumented demands cannot silently add producer guarantees.                                                             |
| REQ-004 Genuine assertion coverage           | AC-004: The native report records actual required assertion names, results and fixture/inventory identity. Missing, failed, pending, skipped, duplicated or unregistered required assertions and a changed inventory reject coverage; writing a map of `PASS` flags is insufficient.                                                                                                               |
| REQ-005 Supported runtime proof              | AC-005: Existing required Node/platform/browser checks still qualify the candidate's public package in their supported modes. Any contract probe absent from browser/worker coverage is integrated into the producer fixtures without loading application code. No new browser job duplicates existing coverage.                                                                                   |
| REQ-006 Closed current evidence              | AC-006: Aggregate, writer, main record, reuse reader, exact-base proof reader and dependent Java eligibility reader agree on job/check identities and policy. An old WebVOWL report, old receipt, wrong candidate, wrong run/attempt/commit or incomplete native job inventory cannot authorize the new producer verdict or reuse.                                                                 |
| REQ-007 Precise names and isolated migration | AC-007: Job/check/script/report names describe installed OWL contract qualification; `CI / required` and `Release / qualified` stay stable. Both workflows use precise replacement identities; no historical result is reinterpreted, omission enabled or settings authority broadened.                                                                                                            |
| REQ-008 Bounded operation and recovery       | AC-008: Source acquisition and temporary installs are bounded and isolated; local application checkout/report absence cannot prevent qualification. Source lookup or producer proof failure fails closed. Demonstrate coordinated workflow/policy rollback without rewriting historical evidence.                                                                                                  |
| REQ-009 Producer release acceptance          | AC-009: Release's exact retained candidate passes the same focused contract inventory under existing release freshness rules; prepublication qualification, release aggregate, evidence assembly and finalization require no WebVOWL application report or downstream success, including indirect checkpoint dependencies. Missing or failed mandatory producer proof still blocks.                |
| REQ-010 Mixed-gate preservation              | AC-010: Each affected Phase 19–22 requirement is split by ownership in a versioned active release policy, retaining installed composition, OWL semantics, target/error behavior, pinned producer corpus, security, provenance and immutable-artifact guarantees. Historical IDs/results keep their original meaning; no mixed requirement is broadly waived.                                       |
| REQ-011 Current consumer source              | AC-011: Both workflows resolve each consumer repository's latest default-branch committed SHA once at qualification start, record relevant source/manifest digests and validate reviewed interface coverage. Changed relevant usage rejects pending inventory review; unavailable source never falls back to an older snapshot. Current snapshot bindings are also checked before evidence reuse.  |

## Quality scenarios and decisions

| Scenario                               | Stimulus and falsifiable response                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QA-001 Correctness discrimination      | Change a promised ontology value or error in a disposable candidate/negative fixture: the named independent assertion fails. A candidate-generated expectation or JS-only round trip cannot conceal it.                                                                                                                        |
| QA-002 Ownership independence          | Make local consumer checkouts unavailable or break application-only behavior: current source snapshots can still be read remotely and producer probes remain independent. Inspection/execution proves no consumer code invocation. Missing current source fails explicit source admission rather than silently using old code. |
| QA-003 Package authenticity            | Substitute a different tarball, expose an ancestor installation, remove an export or supply stale evidence: installation/admission rejects before a successful contract record is emitted.                                                                                                                                     |
| QA-004 Protocol integrity              | Replay a schema-3 WebVOWL receipt or remove/skip one new assertion/job: aggregate and reuse admission reject it; unavailable historical reuse selects existing fresh work, while a failed current contract test remains a failure.                                                                                             |
| QA-005 Portability                     | Run the retained candidate through the existing Node 22/24 platform matrix and Chromium/Firefox/WebKit package modes: required probes use public imports and preserve their documented result/error behavior.                                                                                                                  |
| QA-006 Isolation and interruption      | Interrupt an installed-contract run: no maintained checkout changes, no incomplete report is reusable, and resumption starts from an explicitly identified clean temporary installation after preserving evidence.                                                                                                             |
| QA-007 Useful feedback                 | Compare equivalent frozen candidates and hosted conditions: record check elapsed time, installation/build work and workflow critical path. No latency target or financial saving is inferred from the historical 8m 52s job.                                                                                                   |
| QA-008 Release ownership independence  | Remove/fail/stale a WebVOWL application report or make the checkout unavailable: producer release qualification can pass its own current mandatory evidence. Remove/fail/substitute producer evidence: release admission fails.                                                                                                |
| QA-009 Mixed prerequisite completeness | Traverse each affected active checkpoint requirement; omitted mandatory producer sub-obligations still block, while historical/application acceptance cannot reappear through a predecessor. Historical rc.1 evidence retains its original schema and meaning.                                                                 |
| QA-010 Current interface admission     | Change a consumer's relevant public member usage: the shared runner rejects unreviewed coverage in both workflows. Capture branch movement after source resolution: the run remains bound to its recorded SHA. Missing source and mismatched current snapshot reuse fail closed or take the existing fresh path, respectively. |

| Decision                                   | Selected proposal and rationale                                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-001 Producer-owned contract            | Use a repository-owned contract inventory and fixtures. Consumer source is evidence of usage; public specifications, accepted semantics and the pinned Java authority own correctness.                                                                                                                     |
| DEC-002 Standalone installed job           | Replace both workflows' broad `webvowl` jobs with `owl_contract`, displayed as `CI / installed OWL contract` and `Release / installed OWL contract`. Use one shared runner/inventory and each workflow's exact candidate; retain producer browser/platform jobs.                                           |
| DEC-003 Semantic protocol transition       | Move CI qualification to schema 4 and a revised policy fingerprint, with the typed check key `owl_contract`. Change the producer-contract coverage schema accordingly; do not alias `webvowl` to the new check or translate historical reports.                                                            |
| DEC-004 Proportional release qualification | Replace release application gates and mandatory reports with current producer contract proof, preserving security/artifact obligations and historical evidence. Reconcile mixed checkpoint dependencies and the paired WebVOWL/UO prepublication validator; create no advisory application job.            |
| DEC-005 No new dependency or adapter       | Use Node's native test/resolution facilities, existing retained-candidate validation and installed-package probes, and the existing locked browser toolchain. No public API, forwarding shim, polyfill or custom archive parser is proposed; no no-shim exception is requested.                            |
| DEC-006 Conservative migration             | Retain full execution and existing Java materialization policy. Unsupported old proof misses reuse and requires fresh qualification; malformed current execution never becomes a successful fallback.                                                                                                      |
| DEC-007 Current source snapshots           | Resolve default-branch HEAD for UO and WebVOWL at each qualification start and pin read-only source retrieval to those SHAs. Validate one reviewed interface inventory; record current source bindings and reject unreviewed relevant usage. No consumer install/execution or fallback to historical code. |

Native package exports define supported entry points; tests must exercise that boundary rather than import package internals ([Node package entry points](https://nodejs.org/api/packages.html#package-entry-points)).
GitHub job dependencies propagate unsuccessful dependent execution, so removing application invocation without reconciling the aggregate dependency graph is insufficient ([GitHub job dependencies](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds)).
These native facilities and the existing source-owned probes cover the proposed integration mechanism; no unresearched new library selection is required for this design.
Refresh locked tool/runtime identities and actual rights only if implementation changes those inputs; do not install or upgrade tools merely to prepare this plan.

## Contract inventory and oracle ownership

SLICE-001 shall produce one source-grounded matrix with public member/shape or callback, owning requirement, exact UO/VOWL call-site references, fixture identity, independent expected behavior, runtime coverage and disposition.
Resolve current committed consumer snapshots through native GitHub/Git metadata and retrieve only relevant source at their exact SHAs.
Local dirty bytes are not qualification inputs.
Keep this matrix outside release-specific historical controls, with explicit OWL contract naming.

The initial VOWL inventory candidates observed in `packages/vowl/src/owl` are:

- Native public imports, `OWLManager`, `IRI`, `OWLOntologyLoaderConfiguration`, `StringDocumentSource`, `UnloadableImportError`, owning document formats and their keys/media types.
- `loadOntologyGraphFromOntologyDocument` return shape, ontology/document association, manager format access, root/import separation, import-loader context and diagnostics.
- Direct ontology axioms, annotations, signatures and structural values actually read by the model builder; preserve terms, literal lexical/datatype/language values, ontology identity and blank-node distinctions where the accepted API promises them.
- `getOntologyLoaderMetaData()` documented reconstructed/unparsed/header/declaration evidence, including uncertainty; format matching uses the documented key, not registry-object identity across installations.
- Profile report/source-assessment access actually used by compatible loading, including `valid`, `invalid` and `unverified` outcomes and documented resource/error behavior.
  VOWL's admission policy and deadline are not asserted as library guarantees.
- Existing producer storage round trips, import closure and unchanged-target-on-failure probes recovered from the old harness; retain their producer obligations in existing owning jobs or the new contract job with explicit coverage attribution.

UO adds public usage observed in `scripts/materializeImportClosure.js` and `scripts/ontology`: manager graph loading, loader configuration, document-source/target and mapper callback contracts, documented error types, imports-closure provider/merger, ontology identity/axiom/annotation reads and changes, diagnostics/RDF metadata and save/reload formats.
The reconciled UO plan maps exact call sites and excluded downstream policies.
Reuse shared probes and independently justified producer expectations; do not invoke UO adapters or assert its collapse, losslessness, fingerprint or atomic-publication algorithms.

These are inventory inputs, not permission to invent exact assertions or expand supported semantics.
Review actual method reads transitively enough to avoid a shallow imports-only inventory, and map each to current library requirements.
If a consumer relies on undocumented behavior, classify it as a consumer assumption or an explicit proposed API decision; stop its dependent slice rather than copying it into the oracle.
Do not add loader/profile fixes from the separate deferred repair plan to make an unsupported consumer demand pass.

Reuse hand-authored expected structures and independently qualified fixtures from existing package/Java tests, where their provenance and rights support the selected claim.
Do not generate expected values from the candidate parser, VOWL projection or a golden application screenshot.
Round trips supplement independent structural expectations and pinned Java comparisons; they are not the sole proof of semantics.
Prefer the smallest rights-cleared product-owned ontology fixtures that expose each obligation; live UO acquisition/build is unnecessary.
Any new external fixture needs exact identity, terms and provenance before adoption.
Mock only genuine external acquisition boundaries with deterministic documents; exercise real manager, parser, model and storage operations against the installed package.

## Current-source acquisition and identical test scope

At each CI/release qualification start, resolve the default branch and committed HEAD of `Hadden-Industries/universal-ontology` and `Hadden-Industries/webvowl` once. Record repository, default branch, SHA, acquisition identity, relevant source/manifest digests and accepted inventory identity.
“Latest” is the latest committed source at this capture; subsequent branch movement does not change that run's input.
The baseline table records observations, not permanent consumer pins.

Use bounded native metadata/file retrieval at the captured SHA; no consumer dependency installation, checkout execution or build is required. Source acquisition cannot grant network access to semantic ontology/context probes.
Missing source fails explicit admission rather than using a historical fallback.
Confirm relevant file selection and existing native acquisition limits in SLICE-001; do not build a second archive/transport service.

Validate current public imports, transitive member/data-shape reads and callbacks against the reviewed inventory.
Materially changed usage fails as `CONTRACT_INVENTORY_CHANGED` until the inventory and independent expectations are reviewed.
Unrelated edits do not demand new semantics; record the current SHA and show reviewed coverage remains applicable.
Never infer an expected result automatically from consumer code or turn a consumer policy into a producer guarantee.

Both workflows run the same runner, inventory, required assertion set and fixtures against their own exact retained candidates, with context-specific evidence and existing release freshness.
No release-only consumer test set, application smoke test or independent UO workflow is added.
Existing broader producer browser/platform checks retain their owning coverage.

Current source snapshots are qualification inputs, including before whole-run main reuse admission.
Resolve them before admitting reused evidence; mismatched snapshot bindings use the existing fresh path.
Keep original evidence identities and `FULL_ONLY` behavior.
A supported receipt with an older consumer snapshot is not current-source proof; no rewrite, translated receipt or selective omission is introduced.

## Vertical implementation slices

| Slice                                              | Traceability                                                                                                                                       | Observable path and falsifiable proof                                                                                                                                                                                                                                                                                                                                                | Integration and recovery consequence                                                                                                                                                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SLICE-001 Contract and impact inventory            | REQ-001, REQ-003, REQ-005, REQ-006, REQ-009–011; AC-001, AC-003, AC-005, AC-006, AC-009–011; QA-001, QA-004, QA-008–010; DEC-001, DEC-004, DEC-007 | Complete the current-source resolver/admission policy and deduplicated UO/VOWL call-site/oracle matrix, all CI/release job/report/policy readers and the mixed historical requirement/predecessor inventory. Attribute every producer-owned assertion from the old harness to retained or proposed probes; confirm unique coverage, exact names and independent oracle/proof review. | No required gate is disabled. Stop dependent implementation for undocumented reads, missing oracles or unresolved mixed requirements; neither workflow activates on a partial inventory.                                                                                |
| SLICE-002 Installed contract execution             | REQ-001–004, REQ-008, REQ-011; AC-001–004, AC-008, AC-011; QA-001–003, QA-006, QA-010; DEC-001, DEC-002, DEC-005, DEC-007                          | Install the retained tarball into an isolated native consumer, execute actual matrix assertions and emit a bound native report. Demonstrate a valid candidate pass, deliberately wrong semantic result/error failure, wrong package/export rejection and execution with no local application checkout, and changed-usage/current-snapshot negative controls.                         | Additive executable path while the old job remains authoritative. Retain evidence before bounded cleanup of task-owned temporary directories.                                                                                                                           |
| SLICE-003 Required CI/release and proof transition | REQ-004–011; AC-004–011; QA-003–006, QA-008–010; DEC-002–007                                                                                       | In one coherent candidate, replace both application jobs, update CI proof/accounting/reuse and release preflight/evidence/gate policy/dependency readers. Show native new coverage passes, stale/wrong/partial proof fails, application absence/failure cannot block producer acceptance, and failed mandatory producer checks still block.                                          | Coordinated activation unit for each complete workflow/policy graph; no live partial reader/writer rollout. Keep aggregate names stable and existing Java bounds/recipe. Historical policies remain immutable; do not claim publication from qualification.             |
| SLICE-004 Frozen qualification and retirement      | REQ-001–011; AC-001–011; QA-001–010; DEC-001–007                                                                                                   | Run full relevant checks and bounded independent assurance on the frozen candidate; demonstrate hosted CI lineage, publication-free release contract/preflight qualification, mixed-gate negative controls and coordinated recovery. Read back actual candidate/report/job identities and measured work/latency.                                                                     | Retire obsolete application execution wrappers and CI/release consumer dependencies only after proving all active readers migrated. Preserve historical fixtures/reports. Commit, merge, tagging, publication and finalization require their separate actual authority. |

Execute SLICE-001, SLICE-002, SLICE-003 and SLICE-004 in order.
CI protocol and release policy/evidence mutations are coupled and must have one integration owner; do not split matching reader, writer, aggregate and requirement-graph changes across independently delivered branches.
After the matrix is settled, contract-fixture work and static protocol-impact analysis can be semantically independent, but this plan grants no agent delegation or parallel writes.

## Architectural seams and likely changes

Paths below are predictions to be confirmed by SLICE-001, not a prescriptive line-by-line script.

| Seam                                   | Likely change                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native contract runner                 | Add `scripts/qualify-owl-contract.mjs`, a named `test:owl-contract` npm entry and `test/consumers/owl-contract` fixtures/inventory using the existing native candidate/install components. Avoid refactoring shared release code just to reduce incidental duplication.                                                                                                                                           |
| Producer public exercises              | Reuse `test/import-closure/public-contract.js`, installed-package probes and metadata/profile owning fixtures with independent expectations. Extend owning probes only for demonstrated missing contract coverage.                                                                                                                                                                                                |
| CI and release contract jobs           | Replace `webvowl` with `owl_contract` in `.github/workflows/ci.yml` and `release.yml`; use the same exact-candidate runner/inventory and latest-source acquisition policy. Remove both jobs' executable application/corpus acquisition, full Jest, application builds and conversion-browser probes.                                                                                                              |
| Browser composition                    | Keep `scripts/prepare-browser-consumers.mjs`, `test/consumers/browser` and existing required browser jobs. Run missing producer contract probes through their real bundled/import-map/worker public imports; no app bootstrap.                                                                                                                                                                                    |
| Coverage                               | Update `scripts/ci-check-coverage.mjs`, its command and tests to validate the new native assertion inventory/report. Use explicit OWL contract names and preserve run/attempt/commit and actual candidate tarball binding.                                                                                                                                                                                        |
| Protocol                               | Update `scripts/ci-qualification.mjs`, `ci-verification.mjs`, command/receipt/main-record helpers and all readers/tests found by inventory. Use schema 4 and a new policy identity; do not weaken GitHub-native proof or artifact limits.                                                                                                                                                                         |
| Required graph and observation         | Reconcile CI and release entries in `scripts/require-job-success.mjs`, applicability observation, workflow governance and their tests. Validate each workflow's exact producer job/contract identity; do not retain an indirect application prerequisite.                                                                                                                                                         |
| Evidence documentation                 | Update active CI/release contract/protocol decisions and the affected governing clauses/generators coherently; version policy applicability and prerequisite relationships. Keep historical decisions and rc.1 evidence intact, and coordinate with the broader rc.2 release-independence programme without importing its feature scope.                                                                          |
| Release preflight, policy and evidence | Update `scripts/qualify-release.mjs`, release gate catalogue/generator/verifier, schemas and exact-version qualification readers; audit reconciliation, registry and immutable finalization inputs. Feed current producer contract evidence instead of requiring `phase22-webvowl.json` or a paired application acceptance report. Retire obsolete wrappers/entries only after all active references are removed. |

Do not repurpose `WEBVOWL_GATES`, `summarizeWebvowlExecution`, `assertPrepublicationConsumers`, `PRE_INTEGRATION`, `RECONCILED` or historical release consumer JSON as names for producer-only proof.
Use a new contract-specific inventory and validator; remove old CI-only APIs only after complete reference migration.
Retain application-control code only while a real remaining active consumer is identified.
Once CI and release have both migrated, remove obsolete execution wrappers, npm entries and configuration after reference/ownership proof; preserve historical evidence and any owning non-application semantic probes.
The existing native dependency name `owlapi` is package installation composition, not a new forwarding shim.
No new public package alias or compatibility layer is introduced.

## Release contract migration and mixed requirements

Use the same semantic inventory and installed-package runner as CI.
Release adds candidate/version/artifact lineage and the existing fresh release execution requirement, not additional WebVOWL behavior.
The release contract report must be bound to the exact retained package name/version, tarball SHA-256, inventory/fixture identity and actual native assertions, with a release execution context distinguished from CI.
Use existing exact-ID, digest-verified artifact transport for the report and candidate; preflight must consume the current report, not a committed historical application JSON or a name-matched stale artifact.
Make report size/inventory validation and `Release / qualified` admission explicit; CI success alone and arbitrary `PASS` metadata cannot authorize publication.

Inventory and migrate every active read of WebVOWL acceptance, including `.github/workflows/release.yml`, `scripts/qualify-release.mjs` (`assertPrepublicationConsumers` and its CLI reader), `scripts/require-job-success.mjs`, release-specific workflow governance, `scripts/release-gate-catalogue.mjs`, generator/verifier, release evidence schemas and version-specific results.
Audit release reconciliation, public-registry qualification, evidence assembly and immutable-release finalization for inherited qualification/predecessor assumptions, changing only actually affected consumers.
Preserve native dry-run/packlist equivalence, Java/semantic/security qualification, rights/SBOM/provenance, fresh scoped/native-alias registry installation, retained-versus-public byte comparison and immutable-release verification.
A downstream policy change cannot waive any of those producer obligations.

The initial mixed-gate inventory includes `P19-WEBVOWL-001`, `P20-WEBVOWL-001`, `P20-WEBVOWL-DEPENDENCIES-001`, `P21-CONSUMER-001`, `P22-WEBVOWL-001` and their checkpoint/dependent paths.
The paired prepublication reader also references `P22-UO-001` evidence.
Apply the already accepted producer-independence boundary to that coupling; retain producer-owned UO-origin corpus guarantees and the reconciled UO public-interface inventory.
The superseded advisory workflow is not created.
For each affected requirement, record historical meaning, producer-owned guarantees, application-owned acceptance, new active producer evidence, policy applicability, predecessor disposition and independent negative proof.
Do not mark a mixed requirement `PASS`, `not-applicable` or optional wholesale.
Producer sub-obligations remain mandatory even when application adoption is independent.
Change the authoritative active policy and generator together; never hand-edit generated gate JSON or historical rc.1 evidence to simulate delivery.

Version only report/schema structures whose active meaning actually changes; historical readers remain truthful about old evidence and cannot promote it to new producer qualification.
The release preflight function/field names must describe producer contract evidence after migration, not continue to claim application acceptance.
Keep no forwarding alias or duplicate always-run application harness.
Optional pre-existing consumer observations, if retained, remain clearly separate from required producer evidence, with truthful version/status identities; absent, pending, failed, stale or different-package application reports cannot block producer qualification or be transformed into a success claim.
No new advisory workflow, report-monitor service or schedule is introduced.

## Evidence migration and trust boundaries

The selected schema-4 transition changes the typed check/job meaning and policy together; it is not a new version number applied to an unchanged application report.
The contract report shall bind the actual candidate tarball digest, runner/fixture/inventory identity, native assertion results, current consumer repository/default-branch/SHA/source digests and execution identity.
Coverage admission verifies reviewed current usage rather than trusting self-declared source fields.
The aggregate shall compare contract candidate identity against the retained candidate represented by the run, rather than accepting an arbitrary digest-shaped value.
Prefer existing closed candidate manifests and native resolution; do not hand-write another archive or integrity parser.

Unsupported schema-3 receipts/main records and old WebVOWL reports remain historical and cannot supply schema-4 contract coverage.
Do not backfill, rewrite, translate or alias them.
The existing whole-run main reuse reader can admit only a supported exact original FULL PR execution with the new inventory, direct original identity and matching current consumer snapshot bindings.
Resolve those snapshots before reuse admission; mismatch uses the existing fresh path.
An exact-base lookup encountering old or unavailable proof cannot authorize omission; selective execution remains disabled.
Preserve complete job inventories, attempt bounds, immutable artifact IDs/digests, repository/commit/tree/workflow/host binding and bounded native transport.
Changing CI qualification can invalidate Java reference eligibility that reads it; preserve the accepted materialization recipe, rights, payload/retention bounds and fresh-build fallback while reconciling that reader explicitly.

Package lifecycle and contract execution run with no publication credentials and only the existing minimum workflow permissions.
Use no `pull_request_target` execution of candidate code, extra write token, arbitrary artifact URL or broad `continue-on-error`.
Block uncontrolled network during semantic probes using the existing owning no-network checks; do not confuse permitted package acquisition with ontology/context fetch authority.
Keep external task evidence free of credentials and unrelated private checkout contents.

Inspect required statuses/rulesets before delivery: if the old inner status is independently required, report the settings decision and do not silently remove or bypass it.
The plan changes no GitHub setting; maintaining the aggregate name does not prove an external rule has no other required names.
Updating candidate YAML and its tests does not establish independent enforcement of selective execution, and this change makes no such claim.

## Verification and independent assurance

Use native meaningful negative controls before asserting a new coverage claim; do not add tests that simply reproduce a constructed `PASS` report.
Development feedback should run the smallest changed contract/protocol suites through the repository's named npm/Jest environment.
The likely impacted set includes the new contract suite, installed-package/import-closure probes, `scripts/ci-check-coverage.test.js`, `ci-check-applicability.test.js`, `ci-verification.test.js`, `workflow-governance.test.js`, aggregate tests and any dependent Java state/proof tests identified by inventory.
Run release-specific governance, preflight, gate-graph, reconciliation and evidence tests to prove the expanded producer contract and preservation of security/artifact controls; do not run a live application to establish release correctness.

The registered `focused` profile currently checks package boundary, `governance.test.js` and `io/io.test.js`; it does not declare coverage of the new protocol.
The `affected` profile includes lint, boundary and selected model/storage/import tests plus the old cutover test.
The `full` profile currently runs `lint`, `format:check`, `verify:release-gates`, `verify:workflow-governance`, `test:boundary` and serial Jest.
Profile coverage/order declarations are unverified; targeted contract/protocol execution, real candidate installation and hosted Node/browser evidence remain additional obligations.
Do not change personal profile configuration without authority; retain supported supplemental native evidence separately with exact commands, inputs and provenance.

Before expensive final verification, settle authorized formatting/lint changes, inspect the complete intended diff, preserve unrelated edits and freeze source plus relevant untracked inputs.
Required independent assurance shall address semantic expectations, missing producer coverage, genuine assertion execution, candidate substitution/replay, skipped-job behavior, cross-run admission, complete release predecessor migration, publication admission and recovery.
Use one bounded consolidated review and targeted finding follow-ups; record the selected provider, actual target/output, dispositions and limitations.
This draft has not undergone that independent review and does not authorize a scan or reviewer dispatch.

Hosted acceptance, with no publication implied, must demonstrate:

1. PR `FULL` runs the installed contract job against the exact retained candidate with native assertion coverage, and `CI / required` receives that proof alongside unchanged producer jobs.
2. A deliberately absent/skipped/failed contract or wrong package cannot yield a successful aggregate in native negative/control execution.
3. Schema-3 or mismatched proof takes the existing fresh path; a supported normal-main reuse preserves the original schema-4 execution and producing attempts rather than claiming new execution.
4. Existing platform/browser qualification still executes against the candidate, and executable app/UO acquisitions are absent from this check; read-only current-source acquisition is recorded separately.
5. Publication-free native release qualification exercises the shared contract against its own current candidate and supplies valid proof to preflight/aggregate/evidence admission, with no WebVOWL or UO application checkout/report required. A failed/missing producer contract, Java mismatch, stale mandatory proof, package/integrity mismatch or failed security/artifact gate still blocks.
6. Absent, failed, pending, stale and different-version application reports cannot block producer release qualification through job dependencies, preflight, mixed gates, checkpoints or finalization admission.
   Retain the native negative/control evidence for those paths.
7. Both workflow execution manifests show identical runner/inventory/fixtures/assertions and current consumer snapshot bindings.
   Changed relevant usage rejects unreviewed inventory; source acquisition failure and stale-snapshot reuse cannot claim current compatibility.
8. Native GitHub readback confirms actual statuses/artifacts and the accepted dependency graph; local tests or a passing HISEW profile alone cannot establish hosted delivery. Exercise publication-free paths before any separately authorized tag/publish/finalize operation; do not create a public release merely to test the graph.

Measure equivalent workloads and distinguish job duration, total runner work and workflow critical path.
Record installed dependency count, artifact/storage changes and maintenance surface when available; label unknowns rather than inventing savings or operational targets.
The owner remains the observer for post-integration producer failures and responsible for an accountable disable/repair decision.

## Rollout, abort and recovery

After exact baseline acceptance, first qualify the additive local contract runner while the existing CI gate remains active.
Integrate the CI job/protocol/accounting transition and complete release job/preflight/policy/evidence transition in one reviewed candidate. Each active workflow must have a complete matching reader/writer/requirement graph; no live writer-only, reader-only or half-migrated release rollout.
Delivery then follows only the commit/push/merge authority actually supplied, with direct hosted readback and final committed-state evidence.
No public API version bump, npm publication or application deployment is implied.

Abort activation for a missing oracle/coverage attribution, stale dependency inventory, failing required producer probe, unsupported schema admission, candidate substitution, a surviving transitive application prerequisite, waived producer/security/artifact guarantee or changed authority.
A slower consumer adoption or unrelated WebVOWL failure is not a producer abort condition.
If an application report reveals a genuine producer defect, retain it and reproduce that defect through the supported installed OwlAPI contract; it then remains a normal producer blocker.

For recovery, retain the exact old workflow/protocol commit, new candidate and actual receipt identities.
Restore the matching old CI/release jobs, accounting, active release policy, inventories and compatible readers/writers as one ordinary reviewed coordinated change, or forward-fix the defective component with invalidated evidence rerun.
Demonstrate compatibility with retained old/new fixture records locally and verify the resulting hosted fresh path when delivery is authorized.
Do not manufacture missing application evidence, rewrite historical receipts or bypass aggregate admission to accelerate recovery.
An interrupted run retains incomplete evidence and cleans only validated task-owned temporary installations after they are released; maintained checkouts and unrelated artifacts are preserved.

## Unknowns, experiments and replanning

The cheapest discriminating experiments are the SLICE-001 obligation matrix, execution of existing installed probes against one retained candidate without consumer checkouts, a semantic negative control, and native old/new receipt rejection tests.
They establish whether the proposed job supplies unique evidence or merely duplicates existing candidate/browser coverage.
If existing jobs already execute every selected obligation with admissible native proof, return to the owner with the evidence and propose consolidation there instead of inventing another job to preserve the old topology.
Do not silently drop the replacement obligation or change DEC-002.

Replan for undocumented consumer assumptions that require new library semantics, inability to produce an independent expected result, material runtime/dependency/rights changes, new proof readers, a conflicting required status, a concurrent schema change, or a shared release dependency that cannot be isolated within this scope.
Also reassess if the standalone job creates disproportionate installation/storage overhead or broad fixture duplication.
OwlAPI source changes, browser support removal, selective omission, unrelated release features, UO/VOWL/app execution and acceptance require their own explicit scoped decisions.
The WebVOWL release-independence migration and minimum paired-report decomposition are now within this plan's explicitly expanded scope.
Keep one integration owner and preserve this plan's requirement IDs and amendment history as those decisions are made.

## Completion evidence

Implementation completes only when AC-001–011 and the route-selected assurance are evidenced, active CI/release names and proof match their meaning, no active UO/WebVOWL downstream prerequisite survives, and producer security/artifact guarantees, historical evidence and unrelated checkout state are preserved.
Hosted producer qualification must be verified within actual delivery authority; publication remains separately authorized.
Cleanup completes only for paths proved obsolete after both workflows and their active evidence readers migrate.
The final handoff must distinguish local native tests, HISEW receipt scope, independent review, hosted proof and actual delivery state.
Creating this document fulfills the planning request; it does not satisfy those future implementation criteria.
