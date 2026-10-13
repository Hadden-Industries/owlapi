# Dependency-cruiser architecture hardening plan

Date: 12 October 2026.
Status: **Accepted for implementation by the owner on 13 October 2026.**
Target: `C:/Users/maksy/GitHub/owlapi`.
Baseline: `20426357165a22248985ec43d7ac1266d49d6bec`.

## Purpose, scope, and authority

Help maintainers catch accidental architectural coupling before it reaches package consumers and give reviewers useful dependency evidence.
Extend [PR #73](https://github.com/Hadden-Industries/owlapi/pull/73) through six bounded opportunities: undeclared runtime packages, internal boundaries, shared tooling boundaries, cycle growth, focused reports, and a separately qualified browser graph.
Prefer native rules and reports over additional analysis machinery.

Reuse the [earlier implementation plan](2026-10-12-dependency-cruiser-implementation-plan.md) and [delivered adoption record](../dependency-graph-and-tests.md).
The delivered outcome is **architecture delivered, selective execution declined**.
Reuse its design/research/assurance constraints without transferring approval to this expanded scope.
All requirement, acceptance, quality, decision, and slice IDs below are local to this draft, not accepted engine records.

The owner requested implementation through HISEW on 13 October 2026, including this plan at the first commit point and pre-authorized commit messages and required configuration changes.
The original drafting authority was limited to this plan file; that historical boundary is superseded by the implementation request.
The HISEW planning skill/method were read and applicability rechecked.
Proposed **R2** covers ineffective enforcement and cycle-repair behavior risk; no new route, execution, design, or exception was approved.
Accept an exact revision/selected scope before implementation; unresolved decisions gate their affected slices.

The purpose anchor is meaningful detection with legitimate consumers preserved and explainable failures, not fewer graph edges.
Exclude selective tests, CI/profile reduction, historical graph unions, automatic deletion, broad rewrites, new packages/upgrades, custom analysis/resolution engines, and publication/deployment.
Retain existing Mermaid features, qualification lanes, and the independent lexical domain guard.

## Inspected baseline

Read-only inspection on 12 October 2026 found clean `main`, with HEAD and local `origin/main` both at the baseline above.
Tree: `18a3895c9b65f585de4f713e783b35c6ba3bff6f`.
No fetch or fresh remote lookup was performed.
No applicable agent instruction file was found in ancestor directories or the unignored checkout.
Repository conventions are in [the contribution guide](../../CONTRIBUTING.md).

The native ESM package is `@hadden-industries/owlapi` `0.1.0-rc.2`, AGPL-3.0-only, with 11 public exports.
Dependency-cruiser is installed/locked at `18.6.0` (floor `>=18.6.0`).
The [adapter](../../scripts/dependency-graph.mjs) uses public `cruise`/`format`, native npm/Jest inventories, and native validation.
The existing [architecture suite](../../coreIsolation.architecture.test.js) calls `checkRuntime`, rejecting unresolved imports, repository escapes, unshipped first-party files, and development-only packages.

[.dependency-cruiser.json](../../.dependency-cruiser.json) makes cycles warnings.
Reciprocal imports between `internal/model/sourceEvidence.js` and `model/owlOntology.js` are confirmed in source.
The adapter uses Node conditions (`node`, `import`, `require`, `default`) and stops traversal at npm/repository-escape endpoints.
This is not browser or installed-package proof.
The delivered record's counts remain historical observations, not fresh measurements here.
Its unresolved authored consumer templates become valid after preparation; they must not become runtime-policy failures.

HISEW `0.1.0.dev21` is ready and personal/active, with no work in progress; no retained state was changed.
Configuration/evidence roots are `C:/Users/maksy/.hi/w/c` and `C:/Users/maksy/.hi/w/e`; re-resolve storage and allocate new owned evidence for experiments.
No installation, graph experiment, full test, scan, or external review was run for drafting.

## Draft dossier and admission decisions

| Requirement                            | Acceptance criterion                                                                                                             |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001: Declare runtime packages.     | AC-001: Resolvable undeclared/hoisted imports fail; admitted declarations/self-references pass.                                  |
| REQ-002: Enforce internal contracts.   | AC-002: Direct/indirect breaches fail; intentional manager/shared-policy use passes.                                             |
| REQ-003: Prevent cycle growth.         | AC-003: New independent/overlapping cycles fail; existing-cycle and folder dispositions are qualified.                           |
| REQ-004: Protect tooling primitives.   | AC-004: Helper-to-command/acquisition/publication paths fail; callers/builtins pass.                                             |
| REQ-005: Qualify browser observations. | AC-005: Agreed environment rejects prohibited paths and preserves legitimate replacements; unsupported modes remain unqualified. |
| REQ-006: Supply native review reports. | AC-006: Focus/dependents, all-export reachability, and metrics remain useful advisory evidence.                                  |
| REQ-007: Preserve assurance.           | AC-007: Existing guards/contracts/qualification remain; reports retain identity, completion, and operational bounds.             |

Maksym Shostak, as repository owner, accepts scope and consequential decisions; the implementing maintainer supplies evidence.
The implementation request accepts the proposed scope and bounded native experiments below.
Material exceptions or expanded consumer claims still require their own supported decision.
An agent cannot approve its own exception or release.
These are substantive decisions, not mandatory permission rounds: one plan acceptance may settle them together and authorize bounded experiments.
Routine investigation and implementation choices then proceed within that authority; escalate only material scope, contract, or exception changes.

| Decision                      | Proposed direction and minimum evidence                                                                           | Gate                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| DEC-001: Scope/risk/ownership | Accept revision, slices, R2 route, and owned execution/worktree.                                                  | All implementation.                           |
| DEC-002: Internal contracts   | Source/native closure establishes exact members and direct/transitive meaning.                                    | SLICE-002; cycle design.                      |
| DEC-003: Cycles               | Prefer repair; exact acknowledgement needs proof/owner/retirement. Select folder units separately.                | SLICE-004.                                    |
| DEC-004: Tooling              | Accept three helper contracts, consumers, and check integration.                                                  | SLICE-003.                                    |
| DEC-005: Reports              | Accept native interfaces, roots, labels, evidence, and cost.                                                      | SLICE-005.                                    |
| DEC-006: Browser              | Accept environment, adapters, oracles; distinguish consumer modes.                                                | SLICE-006; deferral valid.                    |
| DEC-007: Reuse/assurance      | Recheck current release/material changes and exact license/clearance; select profiles/supplemental checks/review. | Reuse 18.6.0 research; no upgrade authorized. |

## Native-first design and shared authority

Installed public types and versioned [rules](https://github.com/sverweij/dependency-cruiser/blob/v18.6.0/doc/rules-reference.md), [options](https://github.com/sverweij/dependency-cruiser/blob/v18.6.0/doc/options-reference.md), and [CLI](https://github.com/sverweij/dependency-cruiser/blob/v18.6.0/doc/cli.md) establish candidate interfaces, not repository correctness.
Native validation checks syntax; mutation oracles establish meaning.
Inspected limitations:

- `npm-no-pkg` depends on importer-manifest ownership, including nested manifests, aliases, bundles, and native `@types` behavior.
- Native known-cycle matching compares rule identity and cycle-member membership/length, not a complete ordered edge set. Module `via`/`viaOnly` constraints and native baselines require behavioral qualification; output-order snapshots are unsuitable exceptions.
- Folder scope supports circularity, instability, and path restrictions; installed known-violation softening has a folder limitation.
  Do not transfer module exceptions to folders.
- `focus` includes neighbors; `reaches` selects transitive dependents.
  Neither proves execution impact; browser options do not prove import-map/branch equivalence.

Private sources were read to identify limits; implementation uses public interfaces, not copied algorithms.
Under HISEW DRY-01, npm owns membership, package exports own public roots, and dependency-cruiser owns analysis.
Share the existing adapter/rules between CLI and Jest while keeping expected outcomes independent and policy/environment scopes explicit.
The slice descriptions identify shared-helper, runtime, and browser authorities, their current consumers, and separate failure boundaries.
Preserve distinct pretty/compact JSON and raw-byte digest contracts; matching names elsewhere do not establish shared semantics.
No new shim, alias, polyfill, or compatibility bridge is proposed.
Preserve reviewed browser polyfills and reassess new/changed names for precise meaning.

## Ordered vertical slices

Each slice includes its rule/report, real check path, diagnostic, independent proof, and documentation.
Files below are predictions, not permission to edit all listed paths.
Prioritize short enforcement slices; advisory/browser work must not delay independently accepted improvements.

| Slice                           | Traceability                                             | Demonstration and release implication                                                                                    |
| ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| SLICE-001: Runtime declarations | REQ/AC-001, REQ/AC-007; QA-001, QA-007; DEC-001, DEC-007 | Hoisted undeclared import fails; admitted controls pass. Tooling-policy delivery, no dependency acquisition.             |
| SLICE-002: Internal contracts   | REQ/AC-002, REQ/AC-007; QA-002, QA-007; DEC-002          | Direct and two-hop breaches fail; intentional composition passes. No broad source rewrite.                               |
| SLICE-003: Tooling contracts    | REQ/AC-004, REQ/AC-007; QA-003, QA-007; DEC-004          | Helpers reject reverse dependencies into effectful tooling. Existing qualification integrates the check.                 |
| SLICE-004: Cycle growth         | REQ/AC-003, REQ/AC-007; QA-004, QA-007; DEC-002, DEC-003 | Mutations fail; repair preserves behavior or exact acknowledgement is qualified. Folder enforcement may remain deferred. |
| SLICE-005: Review reports       | REQ/AC-006, REQ/AC-007; QA-005, QA-007; DEC-005          | Correctly labeled native views and export-union candidates. Advisory only; preserve durable evidence.                    |
| SLICE-006: Browser observation  | REQ/AC-005, REQ/AC-007; QA-006, QA-007; DEC-006, DEC-007 | Agreed environment rejects prohibited paths and preserves consumer controls. Promote only qualified claims.              |

### SLICE-001: Reject undeclared runtime packages

Add a native `npm-no-pkg` error scoped to the complete npm-admitted first-party JavaScript inventory, complementing the development-only rule.
Keep npm implementations as endpoints in this runtime graph; do not enforce this package's declarations against every transitive dependency or development template.
Preserve unresolved, escape, unshipped-source, and lexical checks.

**QA-001:** Extend the existing offline package fixture with a resolvable undeclared/hoisted package.
The real runtime check must report the intended rule and fail despite successful resolution.
Positive controls cover production, scoped/subpath, self-reference, and admitted optional/peer/bundled declarations.
Probe importer-manifest and `@types` behavior; unexpected native classification gates the rule, not a replacement resolver.

Predicted files: existing adapter/configuration, `scripts/dependency-graph.test.js`, and developer docs.
CLI/Jest share the rule; no manifest/lock change is expected.

### SLICE-002: Enforce small internal contracts

Begin with these **candidate contracts**, not newly declared violations:

- `model/kinds.js` and `model/structural.js` represent structural primitives; the latter imports kinds.
  Propose no reachability into concrete parsing, loading, storage, or manager orchestration.
- `internal/loading/managedOntologyIndex.js` imports errors, kinds, and structural values.
  Propose no reverse dependency into manager orchestration, concrete parsers, or storers.
- `model/owlOntologyManager.js` intentionally composes parsers/registry, RDF preparation, loading, and storage.
  Loader configuration reuses parsing defaults/format selection.
  These are positive controls, not blanket model-layer exceptions.

Accept exact members, consumers, and direct/transitive intent under DEC-002; retain intermediates in the full analyzed closure.
Cross-directory helpers may own shared knowledge; moving/duplicating them merely to impose layering is outside scope.

**QA-002:** For each accepted boundary, seed a direct forbidden import and a two-hop path through a legitimate intermediary; both must fail.
Keep manager/configuration controls and legitimate parser-to-model imports passing.
A current mismatch first triggers review of the proposed contract, not an automatic source rewrite or broad suppression.

Predicted files: native configuration, adapter if needed, architecture tests, and docs.
Source repairs require their own accepted scope and consumer tests.

### SLICE-003: Protect shared tooling modules

Confirm the latest consumers and intended responsibilities before freezing these small observed contracts:

- `scripts/canonical-json.mjs` is import-free and owns semantic JSON encodings.
- `scripts/review-facts.mjs` depends on `node:crypto` and canonical JSON; it owns reviewed-field selection/digest identity.
- `util/third-party-evidence/digests.mjs` depends on `node:crypto` and re-exports canonical JSON; acquisition, blob-store, and publication modules are consumers.

Use direct/transitive native constraints, retaining needed builtins.
Root the strict graph in these helpers and follow first-party dependencies; unrelated tests/templates are not strict roots.
A helper's new import of one must remain visible and fail, not disappear through an exclusion.
Inbound command-to-helper use is expected.

**QA-003:** Seed helper-to-command and helper-to-intermediary-to-command paths; reject both while legitimate callers and crypto/encoding reuse pass.
Exercise the actual shared check, with independent fixture expectations.

Predicted files: adapter/configuration, focused architecture tests, and docs.
Integrate through existing qualification; DEC-004 chooses the CLI aggregate interface.
Preserve `checkRuntime`, avoid duplicate extraction, and run helper consumer regressions if implementations change.

### SLICE-004: Prevent cycle growth and settle the existing cycle

Trace the ownership seam first: `owlOntology.js` calls `readLoadedImportsClosure`; `sourceEvidence.js` calls `readOntologySnapshot` to validate identity/revisions and also owns manager membership and trusted source qualifications.
DEC-003 compares:

1. **Preferred repair:** reuse/extract the smallest shared snapshot/membership authority.
   Preserve private identity, manager isolation, stale-evidence rejection, immutable snapshots, standalone membership, and loaded-closure queries without acquisition.
   No duck typing, duplicated mutable registries, or forgeable registration hooks.
2. **Conditional acknowledgement:** qualify a native constraint/known violation for the existing two-module cycle.
   Record owner/retirement; never exempt files/folders from all cycles, depend on output order, or auto-grow the baseline.

**QA-004:** Seed independent cycles, a third node enlarging the existing cycle, a second path sharing a member/edge, a self-cycle, a newly cyclic disconnected shipped root, and reordered roots.
Representative native cycle reporting or member-based acknowledgement must not mask those additions.
If it does, reject acknowledgement and require repair or defer that enforcement; do not write a replacement cycle detector.
Finite fixtures establish their specified coverage, not an unrestricted proof over every graph.

Assess folder cycles separately with meaningful accepted folder units and a fixture whose folders cycle while individual files do not.
`model/` contains orchestration, and native folder restrictions/softening have limits; a module repair does not justify a global folder-cycle error rule.
Promote only an expressible qualified folder contract; otherwise retain labeled advisory evidence or defer it.

Runtime repair needs independent source-trust/revision, query/change, profile, storage, and closure oracles, including foreign/lookalike ontologies.
Start with existing `model/rc2Queries.test.js`, `model/sourcePreservation.test.js`, `profiles/profileSnapshot.test.js`, and import-closure contracts; retain installed-package/browser/worker qualification.

Predicted files: the two cycle members, the smallest justified internal authority/consumers, policy/tests/docs.
Reassess acknowledgement on edge/member or detector/resolver changes; remove it with the qualified repair.

### SLICE-005: Native reports for review and refactoring

Prefer documentation of public native operations first; add wrapper options only to preserve safe output and inventory/resolver identity.
Use `format`, `focus`, `reaches`, native reachability, and native metrics rather than a selector or custom traversal engine.
Demonstrate three questions:

- What is a module's neighborhood, and what transitively depends on it?
  Distinguish focus/reaches; empty matching scope is not successful verification.
- Which shipped JavaScript modules are unreachable from **any public export**?
  Derive all 11 current export specifiers, resolve targets natively, verify root coverage, and retain entrypoints themselves.
  Do not use only `index.js` or hand-flatten future conditional/pattern exports.
- Where do native incoming/outgoing coupling or instability metrics concentrate? Show graph domain/traversal policy; use observations to choose review targets, not arbitrary failure thresholds.

**QA-005:** Prove export-union semantics with a module reachable only from a non-root subpath export, a disconnected shipped module, standalone test/CLI roots, and a runtime resource reader.
Orphans are not automatically unused, and import reachability can miss resource use.
Keep the initial potentially-unneeded report within its qualified JavaScript domain.
Additional resolvable resources/literal dynamic imports need native evidence; computed imports, generated programs, workers, and subprocess inputs retain honest limits.
No automatic deletion, API/package pruning, or selective execution follows.

Predicted files: adapter/options if needed, report tests, and docs.
Reuse full Mermaid output; native metrics come from qualified extraction, not filtered-report reconstruction.

### SLICE-006: Qualify a separate browser graph, conditionally

Start with a native capability experiment; explicit deferral is acceptable.
The existing hard-coded Node conditions must not be relabeled as browser evidence.
The authorities are [reference-import-map.mjs](../../scripts/reference-import-map.mjs), [prepare-browser-consumers.mjs](../../scripts/prepare-browser-consumers.mjs), reviewed maps/provider inventory, Vite builds, and Playwright consumers.
They distinguish bundler, import-map, and worker modes, derive public specifiers from exports, use browser/production/module conditions, and include a browser-specific JSON-LD target and reviewed polyfills.
`XmlParserAdapter` uses native DOMParser or a dynamic fallback; document parsing, XML storage, and worker needs differ.

**QA-006 / cheapest experiments:** First use a tiny native fixture with different Node/browser conditional-export targets, browser alias fields, a literal dynamic import, and a prohibited Node dependency reached through a third-party package.
Then compare one agreed real consumer-mode observation with the existing native preparation/build and actual browser execution.
Follow relevant production third-party closure; keeping every npm module opaque cannot test indirect Node leakage.
Record all traversal stops and bind the manifests, installed inputs, resolver configuration, and dependency bytes actually consumed.

Select the native conditions/main/alias fields appropriate to the particular consumer and prove actual targets, not only schema acceptance.
Determine whether supported tooling exposes directly consumable import-map and worker contracts.
Do not implement an import-map resolver/bundler, invent an equivalence adapter, or traverse an arbitrary CDN.
Explicit worker roots, if required, come from the consumer contract; a worker URL is not ordinary import discovery.

A browser-condition source graph can remain a narrowly labeled observation when import-map equivalence is unavailable.
Bundler qualification does not qualify workers or import maps.
Define the Node-only adapter boundary before enforcement; preserve legitimate conditional exports, reviewed polyfills, and XML fallbacks.
Reject prohibited indirect paths without blanket builtin bans or entire-subtree exemptions.
If the native distinction cannot be established, defer that claim and preserve existing browser qualification.

Predicted files if admitted: native browser configuration, adapter/evidence contract/tests, and docs.
Consumer preparation/maps are inputs; changing behavior or reviewed evidence needs additional scope.

## Integration, verification, and test authority

One maintainer integrates the coupled adapter/configuration/evidence/test changes.
Proceed through the ordered slices; unresolved conditional work need not block independent accepted slices.
Read-only investigations may be independent; parallel writes need settled interfaces.
No further agents are requested.
Package scripts change only for an accepted interface; no dependency, lock, workflow, or profile changes are expected.
Include the accepted plan in the first authorized implementation checkpoint.

Tests own expected decisions independently of the production rules.
Use offline filesystem/package fixtures and real public dependency-cruiser/npm APIs; do not mock the resolver/graph to prove their integration.
Mock only genuine external boundaries when needed, and retain real consumer execution for browser behavior.
Reuse unchanged output/inventory tests, adding tests only for new failure modes.

**QA-007 (cross-cutting):** Input drift, invalid native output, incomplete attempts, unsafe/existing output paths, and stale environment identity must not produce accepted complete bundles.
Record elapsed time and graph size for expanded analysis; diagnose timeouts before changing budgets or concurrency.
Keep full analysis for enforcement separate from report filtering.
Mandatory checks fail on errors or incomplete analysis, not pass on empty output; advisory findings do not become errors merely because metrics are high.

Native status and configuration generation 73 confirm `focused`, `affected`, and `full` profiles, matching the predecessor's command table.
Recheck generation/ownership before execution.
`focused` covers boundary plus selected governance/I/O tests; `affected` is fixed scope and omits relevant tooling/parser/profile coverage.
`full` runs lint, formatting, release gates, workflow governance, boundary tests, and `test --runInBand --silent` (600 s).
Browser/installed-consumer and release lanes retain separate authority.

Use the existing Jest launch with `--runTestsByPath scripts/dependency-graph.test.js coreIsolation.architecture.test.js`, new architecture suites, and actual impacted consumers during implementation.
Plan one final coherent `full` qualification plus genuinely supplemental slice/contribution gates, including applicable `test:markdown` and consumer qualification.
Graph reports cannot substitute for those oracles.

Preserve `FULL_ONLY` CI qualification, provenance, scanners, rights and human-review gates.
Do not reduce concurrency or rerun unchanged native scanner shards solely to satisfy a known HISEW defect.
Reuse valid evidence only within its actual input/policy/environment identity; for an identical-tree merge, compare provenance/parents/profile and document a receipt limitation rather than automatically rerunning full tests solely for HEAD identity.
Do not manually dispatch remote CI.

Consolidate before broad review, use narrow follow-ups, and reserve external review for the final candidate.
The session-reported [issue #157](https://github.com/Hadden-Industries/software-engineering-workflow/issues/157) prevents treating denied headless Git commands followed by empty success as completed review; record the gap without bypassing denial.
Native Codex Security owns route-required scoped assessment of trust/filesystem/browser/dependency changes on one frozen target; this draft starts no scan/review.

## Migration, observability, recovery, and cleanup

Tooling slices need no application-data/backfill/API migration.
Promote errors only after accepted meaning and mutation proof.
Version changed report contracts; preserve history and bind actual consumed inputs, policy, inventory, tools, Git state, and environment.
Endpoint-only identity is insufficient for newly traversed third-party inputs; old Node evidence cannot become browser evidence.

Retain exclusive new external output reservation and completion/digest checks.
After interruption, start a new owned attempt rather than completing an old manifest with changed inputs.
Diagnostics should identify rule, source, target/native path or cycle, and scope.
Observe elapsed time, graph size, unresolved edges, acknowledged cycle debt, and completion; do not add a telemetry service or unapproved coupling threshold.

The implementation owner observes qualification and, if authorized, naturally triggered PR/merge checks.
A tooling merge is not package publication; runtime repair needs candidate-bound consumer proof.
Stop/replan a slice that rejects legitimate behavior, misses a mutation, cannot bind identity, or exceeds accepted bounds.

Revise only owned unmerged changes; retain evidence.
An authorized, verified source revert can restore tooling policy.
Runtime rollback additionally needs candidate/package and consumer qualification; no registry unpublication or forceful cleanup is implied.
Retire owned scratch/fixtures after preserving tests, decisions, failures, and recovery evidence; record surviving resources with owner/removal trigger.

Rebaseline affected assumptions when checkout, tool version, exports/inventory, resolver, browser maps, profiles, ownership, or adoption policy changes.
The cheapest decision evidence is already in each slice: native declaration fixture, small boundary closure, cycle mutation matrix, all-export report fixture, or one browser-mode comparison.
If the solution requires broad exceptions, a custom resolver, public semantic changes, or weakens an independent oracle, return to the owner with that specific decision.
Reassess the purpose anchor at acceptance, after experiments, before review, and at delivery; simplify or defer work that adds machinery without useful detection.
