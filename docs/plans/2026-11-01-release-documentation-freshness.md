# Release documentation freshness implementation plan

**Status: implemented locally; final Codex Security review remains a commit gate. No publication is authorized.**
Prepared 1 November 2026 using the HISEW thin implementation plan method, by the requested GPT-6 Astra subagent at Extra High reasoning.

## Purpose and admission

Package users must receive installation instructions, API examples, release status, and change/migration notes that describe the exact package they install.
Catch contradictions before an immutable package version is published, while preserving truthful historical statements and independently owned consumer acceptance.
The success measure is that the observed stale-document defects fail the real release path before its first registry write; a new checker that release never calls is insufficient.

The planning baseline was `e4bc48de00f1e50f38fd3bbbc02c044197df6fc0`.
The owner subsequently authorized implementation and first committed the existing documentation scope in signed commit `dcad5ff2`, the implementation baseline.
The owner accepted the R2 functional scope, local signed commits and necessary configuration changes, selected GPT-6 Astra at Extra High for Review Agent and final Codex Security review, and prohibited pushes and external reviews.
The owner's later instructions replace duplicate HISEW administrative prerequisites, helper-witnessed evidence and additional campaigns; native tests and reviews remain authoritative.
`package.json` still selects `0.1.0-rc.3`; a successor coordinate and publication need a separate decision.

The parent task's read-only HISEW applicability result is `personal`, `active: true`.
The loaded release `78d10f49862633eff7fb157c6709af0b11470209c5dfad9858b837ae402dfa06` differs from selected release `a69680c5fa7d47f2ffb7a56d75747d7696e102ac61d3998a1481f66e5fb176fb`, generation 14, with primary failure `HOOK_SELECTION_MISMATCH`; diagnostic retention reports `RETENTION_UNAVAILABLE`, and current hook activation is not established.
Despite repository selection, native execution admission returned “A repository baseline requires selected repository authority”.
Per the owner's explicit process instruction, implementation continues using the HISEW method and native product proof; no admitted execution or substitute engine receipt is claimed.

### Concise implementation record

- One dependency-free packed-document evaluator owns governed claims, exact-version change/migration/limitations selection and artifact admission.
  Existing version projections, runtime ownership, candidate bundle hashes and preflight artifacts remain the authorities.
- Real README fences execute through the existing alias/scoped consumers and browser modes.
  Current notes render from the accepted artifact; channel wording uses observed evidence.
  Finalized releases are never silently overwritten.
- Ordinary and recovery publishers require the matching source/run preflight and inspect retained bytes without installing or executing the package.
  Current producer gates and CI proof policy change; historical gate definitions and evidence are unchanged.
  This does not create a general documentation-only CI skip or new evidence-reuse authority.
- Exact public tarball verification is separate from bounded moving README metadata observations.
  Archive/member/document bounds and negative fixtures cover malformed, stale, missing and mismatched inputs.
- Original failing test and browser output remains in native tool records.
  Local qualification is not hosted CI, release acceptance or publication.
  Reviews and final verification are recorded by their native tools and the final implementation commit.

Local retained-package qualification and all Chromium/WebKit modes pass.
Firefox fails at host process launch with `spawn UNKNOWN`, before assertions; its lane and hosted release qualification remain unverified.
Review Agent resolved one shell-whitespace defect through a narrow repair review; the final security result belongs to the native Codex Security record.

## Verified gap and existing architecture

| Inspected authority/seam                                                                                                                                                           | Existing behavior                                                                                                                                                                                 | Gap this change addresses                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Package manifest](../../package.json), [package identity](../../scripts/package-identity.mjs), [version projection](../../scripts/project-package-version.mjs)                    | Manifest selects name/version/exports; current version projections update ten declared files and reset changed-coordinate publication authority.                                                  | README and changelog are outside those projections; synchronized metadata does not make their claims accurate.                                                                             |
| [Candidate builder](../../scripts/build-release-candidate.mjs), [artifact reader](../../scripts/release-artifacts.mjs), [bundle verifier](../../scripts/candidate-bundle.mjs)      | Pack once; compare dry-run/actual inventory; require README/CHANGELOG/API; run retained-tarball publint and installed consumers; bind tarball/SBOM/checksums.                                     | File presence, valid exports, and correct digests do not validate release documentation meaning.                                                                                           |
| [Producer policy](../release/producer-release-policy.json), [policy projector](../../scripts/producer-release-policy.mjs)                                                          | `P19-PRODUCER-DOCUMENTATION-001` already requires accurate README/API/changelog/compatibility claims and scoped installation guidance.                                                            | Its HYBRID requirement is not a deterministic packed-document freshness check.                                                                                                             |
| [Qualification](../../scripts/qualify-release.mjs), [preflight](../../scripts/release-preflight.mjs), [release state](../../scripts/release-state.mjs)                             | Require exact source, qualified retained candidate, absent candidate coordinate/tag for fresh publication; classify existing/mismatching artifacts and closed reconciliation.                     | No packed README/changelog semantic assertion is carried through this admission.                                                                                                           |
| [Release workflow](../../.github/workflows/release.yml), [job aggregate](../../scripts/require-job-success.mjs), [workflow governance](../../scripts/workflow-governance.mjs)      | `candidate` builds bytes; required jobs precede `publication_preflight`, tag acceptance, draft, and protected OIDC publisher. Publisher checks retained checksums and an approved tarball digest. | Tests must join this graph, including the distinct recovery route, without installing/executing package code in the credentialed publisher.                                                |
| [Draft creation](../../scripts/create-github-release-draft.mjs), [finalization](../../scripts/finalize-github-release.mjs), [release evidence](../../scripts/release-evidence.mjs) | Draft/final bodies are templates; final body contains qualification/extended observations. Evidence validates source/run/attempt/asset/publication bindings.                                      | Bodies omit substantive changes and migration notes. Final body chooses channel wording from equality to the current package version instead of rendering explicit observed channel facts. |
| [Registry qualification](../../scripts/qualify-public-registry.mjs), [availability policy](../release/availability-policy.json)                                                    | Fresh exact-coordinate tarball, integrity, native alias/scoped consumers, signatures/provenance, bounded read-only availability recovery.                                                         | Documentation needs explicit readback treatment; moving package metadata is a separate observation from immutable version bytes.                                                           |

The parent investigation found that public rc.3's retained README still called rc.2 latest, pinned installation to rc.1, and called behavior profiles unpublished; its changelog called rc.3 unpublished.
The parent's fresh registry read on 1 November found both `next` and `latest` selecting rc.3, exact-version publication time `2026-10-30T05:29:43.033Z`, and a 26,850-character full-metadata README still advertising rc.2 as checked on 29 October.
The current working-tree corrections and edited GitHub release notes do not change those npm tarball bytes.
Use independently captured excerpts from those exact bytes as regression inputs; do not infer the incident from today's corrected working tree.

npm documents that changing the package-page README requires publishing a new version; the same package name/version cannot be republished.
Its full-metadata README describes the most recently published version, which need not be the version selected by `latest`, and is documented as limited to the first 64K.
GitHub allows editing release notes after immutable publication while protecting the assets and tag.
These are separate contracts, checked against primary sources on 1 November 2026: [npm README updates](https://docs.npmjs.com/about-package-readme-files/), [npm v12 publish](https://docs.npmjs.com/cli/v12/commands/npm-publish/), [registry full metadata](https://github.com/npm/registry/blob/main/docs/responses/package-metadata.md), [GitHub immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases).

## Scope and boundaries

Include source-to-package documentation projection/validation; actual retained README, changelog, manifest and relevant packed API/compatibility documents; governed installation/import-map examples; current profile/runtime claims; candidate-specific GitHub change/migration notes; required release gates; interrupted/recovery paths; fresh public verification.
Preserve existing API/behavior, package naming/native aliases, production dependencies, runtime support authority, release security/rights gates, consumer ownership, and immutable historical evidence.
Exclude publishing a documentation repair release now, altering old npm artifacts, mass rewriting historical prose, adding a general natural-language truth engine, package-page HTML scraping, new release automation services, or rebuilding the complete archive subsystem.

## Requirements and acceptance

| ID               | Requirement                                                        | Acceptance criterion                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 / AC-001 | Documentation identifies its subject and lifecycle fact precisely. | A candidate absent from npm passes valid prepublication checks; stale candidate install pins, duplicate/wrong candidate changelog section, contradictory current status, and fabricated publication dates fail. Clearly labeled previous-release/history statements remain valid.                                                                                                     |
| REQ-002 / AC-002 | Current usage claims are demonstrated against the exact package.   | Scoped and native-alias installation forms, selected README examples, advertised export paths, behavior-profile selection/defaults, and browser import-map identity agree with the candidate and the existing consumer contracts.                                                                                                                                                     |
| REQ-003 / AC-003 | Immutable bytes carry the reviewed documents.                      | Source-valid but tarball-stale input fails before candidate acceptance; qualification and publication guard reject another tarball or a stale/missing documentation result. Repacked bytes require fresh artifact-bound documentation/admission proof and aggregate acceptance; unchanged evidence may be reused only through the repository's accepted equivalence/provenance rules. |
| REQ-004 / AC-004 | Release notes describe changes for this version.                   | Draft and final GitHub bodies contain the exact selected changelog changes, migration disposition, and limitations, followed by separate qualification evidence. Missing, unrelated, empty, placeholder, or qualification-only notes fail before a release write.                                                                                                                     |
| REQ-005 / AC-005 | Enforcement covers every current publication path.                 | CI candidate construction, release qualification, protected publisher admission, and reachable current recovery routes fail closed on absent/mismatched evidence, skipped checks, or changed policy; negative integration cases observe zero registry writes.                                                                                                                         |
| REQ-006 / AC-006 | Publication and recovery preserve immutable identity.              | Exact-version public bytes match the retained tarball and documents; ambiguous publication resumes read-only verification. Already-public history is readable under its retained policy without becoming newly qualified under this one.                                                                                                                                              |
| REQ-006 / AC-007 | Moving metadata is not the immutable-artifact oracle.              | Registry metadata absence, bounded availability delay, truncated README, legitimate newer publication, and changed tags have distinct results; none authorizes a repeated publish or a claim about npm HTML cache freshness.                                                                                                                                                          |
| REQ-007 / AC-008 | Tests and review establish a bounded claim.                        | Independent mutation fixtures prove each governed contract; limits reject malformed/oversized inputs; a human reviews factual prose and migration completeness for the exact candidate. No regex or schema pass is called complete editorial truth.                                                                                                                                   |

## Design decisions and DRY ownership

**DEC-001 — Candidate identity and publication observation have different authorities.**
Derive candidate name/version/exports from its manifest and source expectations from the existing package identity/version projection.
Use `publication-control.json` and workflow metadata for intended permission/channel, `release-state.mjs` for admission/recovery, and authenticated registry/release evidence for observed availability/date/tags.
`availability-policy.json.previousVersion` remains an explicit accepted predecessor, never a version arithmetic result.
`reviewedOn`, a source version, `firstPublicReleaseTarget`, successful CI, and a planned date do not prove publication.
Do not add another release-status ledger or independently maintained version list.

**DEC-002 — Release-neutral package prose, bounded generated claims, human editorial review.**
The packed README should identify “This package: `<name>@<version>`” and the APIs/examples of that version, without asserting that an unpublished candidate is already public or permanently calling it unpublished.
Current exact-install examples target that version; explicitly labeled moving-tag convenience instructions may coexist and explain their update/acceptance meaning.
A moving-tag example may legitimately resolve the predecessor before publication; its prepublication test checks the documented tag semantics, while the API exercise installs the retained candidate and never demands that npm already serve it.
A separately labeled previous-publication statement may cite a dated observation and predecessor; it must not identify the candidate as the observed previous release.
The candidate changelog has one exact version heading and substantive sections; `Unreleased` is allowed for other future work but cannot be the candidate's only change record.
Do not invent a publication timestamp before publication: omit it or label a distinct preparation date, then retain actual publication time in observed evidence and editable release notes.

Extend the repository's existing marker/projection approach for the small identity/install/status/profile-summary surfaces; do not regenerate the entire authored README.
Choose closed, typed/template variants for candidate facts and recorded publication facts, and reject duplicate/missing governed blocks or unsupported variants.
Keep the version-specific changelog section the authored change-note authority; require an explicit migration action or reviewed “no migration required” rationale and limitations disposition.
A structural contract can reject empty/placeholder/generic-only sections, but the owner reviews whether the changes are meaningful and complete against the actual diff.
Inventory and migrate existing current-status claims in the in-scope packed documents into those governed surfaces; remaining arbitrary prose stays in the editorial checklist.
Do not ban older version strings globally or pretend arbitrary paraphrases can be proven by regular expressions.

**DEC-003 — Reuse runtime, API and behavior authorities; execute the documented consumer boundary.**
[Runtime policy/projections](../release/runtime-projections.json) continue to own runtime statements; `check:node` remains their drift check.
[Generated API registry](../compatibility/java-api-surface.json) and existing package-boundary tests own advertised public surface validation.
[Behavior contract](../compatibility/behavior-profiles.md), [behavior definitions](../../internal/behavior/ontologyBehaviorContext.js), and independent paired tests own profile identifiers/defaults; profile availability in this package is checked by native public construction, not inferred from a planned release target.
Feed selected code blocks into the existing isolated installed-consumer/browser fixtures after validating a closed example inventory; do not execute every README fence or package-provided shell command.
Use the exact same checked example text with explicit fixture setup, so a separately copied working sample cannot hide a broken README.
Keep independent expected results, positive historical examples, and allowed placeholder conventions; never compute expected truth from the production renderer.

**DEC-004 — One shared documentation evaluator, enforced at actual boundaries.**
Read required documents from the retained tarball through `release-artifacts.mjs`/`candidate-bundle.mjs`, not the checkout after packing.
Run early source projection checks for feedback, then definitive packed-document checks immediately after actual pack/inventory validation and before expensive consumer qualification or accepting a candidate.
Re-evaluate the same snapshot in publication preflight; carry its result through existing candidate/preflight/release evidence with existing source, candidate digest, artifact ID/digest, policy identity, and run/attempt bindings.
At the protected publish and recovery boundary, require the accepted preflight/documentation result and revalidate those bindings against the actual downloaded tarball before any registry write.
Prefer a minimal read-only verifier using the existing approval-tools environment; retain the publisher's no project installation/no package execution constraint.
Reuse `SHA256SUMS`, candidate identities, existing authenticated artifact transport, and evidence snapshots: no second document-hash manifest or new approval ledger.
A package-byte change invalidates artifact-bound documentation/admission proof and aggregate acceptance even if only documentation changed.
Independently applicable unchanged runtime/security or other native evidence may be reused through the repository's accepted equivalence/provenance rules; changed bytes do not automatically require repeating an unchanged product campaign.
The rebuilt aggregate must establish the reuse applicability and bind fresh documentation proof to the new exact candidate, never relabel the previous documentation result.

**DEC-005 — Generate user-facing notes from the candidate and observed facts.**
Both draft creation and finalization select the candidate's exact changelog section, independent of the mutable checkout.
The draft identifies its prepared state; the finalizer combines the same changes/migration/limitations with verified publication/channel facts and qualification results.
Do not reconstruct “both tags” from `PACKAGE_VERSION`; use the validated evidence fields and preserve historical channel policy.
Bind the notes source to the existing candidate digest and compare response/readback content at GitHub writes, including ambiguous responses.
Retrying an already-finalized release must not overwrite a later authorized human edit with a regenerated generic body; report the difference and use the separately authorized editorial-update route.
This does not make GitHub note text immutable or fix an older npm README.

**DEC-006 — Strengthen current policy; preserve historical meaning.**
Amend `P19-PRODUCER-DOCUMENTATION-001` in the current producer policy and regenerate `producer-gates.json` with the existing generator.
Do not rewrite the historical Phase 19–22 catalogue or archived requirement digests/results; `release-gate-catalogue.mjs` remains their parser.
Current admission must require the new documentation contract/evidence; historical evidence readers retain explicit closed identities and their original definition snapshots.
Missing new fields in old evidence means “historical, not assessed under this contract,” never implicit PASS for a new publication.
Both current prerelease and stable publication routes must enforce this common documentation contract before any registry write; closed historical read-only compatibility remains separate.
Any deliberate reduction of that coverage requires an explicit owner scope decision and corresponding revision of AC-005 before implementation; a follow-up note cannot satisfy the all-current-path guarantee.
No shim/alias override is requested; npm's existing native dependency alias remains a documented platform capability, not a compatibility shim.

| Shared rule                   | Current consumers and failure boundary                                     | Strategy and drift control                                                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Package version/exports       | Source projections, packed docs, installed examples, workflow metadata     | Reuse manifest/package identity; exact comparisons and mutation fixtures; preserve historical coordinates as history.                         |
| Runtime support               | README block, manifest engines, contributor and release policy projections | Keep existing `project-node-support.mjs`/runtime projection ownership; do not duplicate runtime ranges in a documentation registry.           |
| Publication status/tags/date  | Preflight, OIDC admission, registry verification, final notes              | Explicit intended versus observed facts; pure state policy plus fresh external observation; unavailable facts remain unavailable.             |
| Changes/migration/limitations | Changelog, draft/final release notes, editorial review                     | One authored version section; shared selection/rendering; candidate digest binds source; human review owns meaning.                           |
| Document admission            | Builder, qualification, publisher/recovery guard, evidence consumer        | Shared pure evaluator/binding checks with enforcement at each effect boundary; independently accepted tests prevent common-mode oracle drift. |

## Native reuse, versions, rights and precise custom gap

Research checked 1 November 2026 includes the repository source/tests above, native npm v12 pack/publish contracts, [publint's documented scope](https://publint.dev/docs/), and [node-tar's supported list/strict APIs](https://github.com/isaacs/node-tar).
Registry `/latest` readbacks and `package-lock.json` agreed on publint `0.3.25`, tar `7.5.22`, Ajv `8.20.0`, semver `7.8.5`, and Prettier `3.9.10`; these are observations, not authorization to float dependencies.
The selected producer remains the repository's exact Node `26.13.0`/npm `12.2.1` policy; this work does not independently change that runtime selection.
Official npm v12 documentation identified `12.2.1` as latest on the same date, matching the selected npm runtime; Node channel selection remains the separate runtime-policy authority.

| Capability                         | Reuse decision and limitation                                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native packing and publish dry-run | Retain existing npm commands over the exact tarball. They validate packaging/publish inputs, not the truth of prose or publication authority.                                                                                                           |
| Export/package metadata validation | Retain strict publint plus Node/native consumer tests. Publint does not know this project's current release, change significance, or profile availability.                                                                                              |
| Markdown formatting                | Retain the already pinned Markdown Quality integration and scoped check/format commands. Formatting/link validity does not prove release truth.                                                                                                         |
| Structured data/version comparison | Use existing Ajv and native npm SemVer seams where those consumers already need them; no new schema/version grammar.                                                                                                                                    |
| Archive access                     | Reuse the current tarball reader first; inspect retained bytes in memory, with no disk extraction. Assess bounded zlib and existing tar `list`/`strict` if the current reader cannot meet the targeted limits without reimplementing archive semantics. |
| Change-note selection              | A generic generated GitHub commit/PR list does not supply this package's migration/limitations narrative; reuse the versioned changelog and existing GitHub client, adding only its bounded selection/validation/rendering.                             |

The exact local publint MIT and tar BlueOak-1.0.0 license texts were inspected; the existing [material inventory](../provenance/third-party-material.json) records both exact versions as authenticated development-only material excluded from the package.
MIT requires retaining its copyright/permission notice; BlueOak requires supplying its license text or link with copies.
The existing rights reviews are scoped to the recorded rc.3 facts and are not blanket clearance for new distribution, bundled tools, or a replacement parser.
No new dependency is selected by this draft; before material adoption/extension, the dependency/rights owner must refresh current version, exact license/terms, transitive scope and notices through the native evidence workflow.
If a new parser or changed deployment boundary is needed, finish its targeted selection and rights decision before implementing it; this draft does not invent that clearance.

The residual custom need is narrow: this repository's release-context/section contract, joins to its existing package/policy facts, phase-aware admission, and wiring those assertions into its existing candidate/evidence graph.
No native tool inspected owns that domain truth; packaging, Markdown parsing/formatting, archive interpretation, SemVer, and public registry observation should remain with their existing owners.

## Vertical slices and integration ownership

The package maintainer/release engineer owns integration; the owner appoints an independent verifier and the native security reviewer before implementation.
The editor/API maintainer owns the factual prose/example oracle; the release custodian owns phase, publication and recovery decisions; the dependency/rights owner owns any material adoption.
Acceptance, review and future publication remain distinct decisions.

| Slice     | Observable increment and predicted modules                                                                                                                                                                                                                                                                                        | Traceability                                                                         | Falsifiable proof and release/cleanup implication                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SLICE-001 | Candidate identity/status/changelog contract from source projection through packed validation, called by `build-release-candidate.mjs`. Predict a small `release-documentation.mjs` with tests, existing version projection/tests, README/CHANGELOG governed sections, artifact/bundle tests.                                     | REQ-001/003/007; AC-001/003/008; QA-001/002/006; DEC-001/002/004                     | Positive candidate absent from npm; original stale excerpts and source-good/tarball-bad mutations fail before candidate acceptance. Valid prior-version history passes. Read-only diagnostics identify file/section/expected subject. Candidate path itself enforces the check; no release is performed.                                                                                                                                                                                                         |
| SLICE-002 | Same actual documented examples run in isolated retained-package consumers; current profile/runtime claims and browser import-map identity become checked. Predict `installed-consumer-fixtures.mjs`, existing boundary/smoke/browser fixtures, behavior documentation block and projection tests.                                | REQ-002/007; AC-002/008; QA-002/003; DEC-002/003                                     | Scoped and alias consumers execute documented API/default/profile examples; stale current imports/pins/profile claims fail, labeled history and allowed local-tarball placeholders pass. No credentials/network in deterministic examples; temporary consumers follow existing ownership/cleanup.                                                                                                                                                                                                                |
| SLICE-003 | Candidate changelog changes/migration/limits appear in draft and final note previews, with actual GitHub adapter-boundary tests. Predict shared note renderer/selector, create/finalize scripts and their existing tests.                                                                                                         | REQ-001/004/006; AC-004/006; QA-004/005; DEC-001/005                                 | Empty/wrong/generic-only notes and missing migration disposition stop before mock GitHub mutation; exact candidate section survives finalization; observed tags differ correctly from planned tags; readback/ambiguous-write cases preserve identity and human edits. Preview files remain task-owned evidence, not published notes.                                                                                                                                                                             |
| SLICE-004 | Documentation result becomes an enforced current policy/evidence obligation through qualification, protected publication/recovery guard and public verification. Predict producer policy/generated gates, qualification/evidence schemas/builders, workflow/governance/proof tests, current recovery adapters and registry tests. | REQ-003/005/006/007; AC-003/005/006/007/008; QA-001/005/006/007/008/009; DEC-004/006 | End-to-end offline orchestration rejects stale/missing/mismatched proof with zero registry writes on both current prerelease and stable routes; read-only recovery never republishes; current policy cannot reuse stale CI proof; valid unchanged evidence reuse preserves its native applicability while new documentation bytes receive fresh proof. Old alpha/RC evidence stays readable without new PASS. A separately authorized qualification-only hosted run closes workflow evidence without publishing. |

Slice file names are predictions, not instructions to modify every listed module or to create parallel implementations.
Order: accepted prerequisites → SLICE-001 → SLICE-002 and SLICE-003 → SLICE-004 → consolidated review/verification.
After the shared contract is accepted, example inventory and editorial note review can proceed independently; version/phase schemas and workflow/evidence edits have one integration owner and must not be parallel write tasks with unresolved coupling.
Each slice includes its own negative proof and consumer-visible path; final wiring does not postpone testing to a separate horizontal phase.

## Quality scenarios, test oracles and commands

| Scenario                                              | Stimulus and expected response                                                                                                                                                                                                                                                                                                     | Independent oracle / external boundary                                                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-001 — irreversible stale release                   | Freeze stale README/changelog while metadata/version and checksums are otherwise valid. Builder/preflight/current publication guard refuse; registry mutation count is zero.                                                                                                                                                       | Captured rc.3 defect excerpts and reviewer-authored expected failure categories; real evaluator and archive bytes, mock only registry/GitHub effects.               |
| QA-002 — legitimate temporal context                  | Candidate version is not public; a dated predecessor/history paragraph uses rc.1/rc.2/rc.3 and a moving-tag instruction still resolves the predecessor. Accept these labeled contexts; reject a stale current exact pin, predecessor presented as the candidate, or unobserved candidate publication.                              | Explicit phase/fact table, fixed test clock, independent fixtures; no network dependency.                                                                           |
| QA-003 — misleading usage                             | Change one current install pin/import-map coordinate/export/profile/default or selected snippet. Existing native consumer/browser runner exposes the contradiction; unsupported examples fail.                                                                                                                                     | Actual installed package/public API with independently stated results; no module/source alias mocking.                                                              |
| QA-004 — missing change explanation                   | Remove candidate section, rename to another version, insert placeholders/qualification-only text, or omit migration disposition. Reject before draft/final write; good section renders once.                                                                                                                                       | Hand-authored expected note fields/text and editorial diff review; GitHub HTTP client is the mocked boundary.                                                       |
| QA-005 — interruption and identity drift              | Failure after pack, tag, draft, npm acceptance or finalization; rerun with same/different bytes or attempt. Preserve original artifact; verify already-public bytes; refuse mismatch/unauthorized replay.                                                                                                                          | Existing release-state/recovery tests plus controlled server/job observations and mutation spies; a failed write can still have taken effect.                       |
| QA-006 — hostile document/archive                     | Missing/duplicate files/blocks, malformed JSON/UTF-8, unsupported entries, traversal, truncated member, oversized compressed/expanded input or document. Fail before expensive parsing or effects.                                                                                                                                 | Independently constructed archive vectors and exact accepted limits; no disk extraction, no package code in publisher.                                              |
| QA-007 — external metadata lag/change                 | Exact-version tarball is correct while full-metadata README is absent, delayed, truncated or belongs to a newer publication. Preserve exact-version success separately; report bounded metadata observation accurately.                                                                                                            | Mock HTTP fixtures at real registry boundary; later authorized public readback; no npm HTML or moving-tag oracle.                                                   |
| QA-008 — bypass/stale evidence                        | Delete workflow step/dependency, skip it, add `continue-on-error`, change validator/policy after CI, or remove evidence fields. Required aggregate/governance/admission rejects.                                                                                                                                                   | Parsed workflow mutation tests and existing CI proof identity mechanism, with reviewed expected obligations.                                                        |
| QA-009 — documentation-only candidate and valid reuse | Repack with only documentation changed. Accept fresh exact-document/admission proof plus unchanged unrelated evidence whose reuse is valid under the accepted equivalence/provenance rules; rebuild aggregate acceptance. Reject reuse of the old candidate's documentation proof or unsupported relabeling of unrelated evidence. | Independently specified old/new artifact identities, expected applicability and retained native provenance; real admission/aggregate logic with no registry writes. |

Use existing Jest for `scripts/*.test.js`, Node's native boundary test and native npm/Node/browser consumers; do not introduce a second test harness.
Share neutral archive/input construction where useful, but not validator predicates, rendered expected output or production truth calculations with assertions.
Deterministic contract tests use fixed inputs/clocks and deny network; integration mocks replace genuine npm-registry/GitHub/command effects, not internal helpers that would bypass admission.
The actual pack/installed-consumer path remains an independent integration proof; mocked publisher tests do not establish OIDC, registry propagation, provenance, or hosted protection.

Predicted new focused tests: `scripts/release-documentation.test.js` and, only if ownership warrants a distinct module, `scripts/release-notes.test.js`.
Existing focused commands to extend/reuse after implementation (not run by this planning task):

```shell
npm test -- --runInBand --runTestsByPath scripts/project-package-version.test.js scripts/release-artifacts.test.js scripts/candidate-bundle.test.js scripts/qualify-release.test.js scripts/release-preflight.test.js
npm test -- --runInBand --runTestsByPath scripts/producer-release-policy.test.js scripts/verify-release-gates.test.js scripts/release-evidence.test.js scripts/finalize-github-release.test.js scripts/github-release.test.js scripts/release-state.test.js scripts/recover-rc3-publication.test.js scripts/release-reconciliation.test.js scripts/workflow-governance.test.js
npm run check:version
npm run check:node
npm run verify:release-gates
npm run verify:workflow-governance
npm run verify:workflow-syntax
npm run test:boundary
```

Add the new focused files to the appropriate Jest command once created; include current affected registry, browser and installed-fixture tests, rather than inventing nonexistent `build-release-candidate.test.js`.
Run `npm run generate:release-gates` only as part of an approved implementation and inspect the generated diff; historical gates/results must remain byte-identical unless a separately accepted correction requires otherwise.
Use `npm run build:release-candidate -- --output <new-owned-output>` and `npm run lint:package -- <retained-tarball>` for actual package integration, then the repository's installed/browser/public qualification entry points with their required inputs.
Do not run a live publish command as a negative test; do not overwrite an existing candidate directory.
Before each implementation commit, format and lint every file in its exact scope, including this plan; use `npm run format:markdown -- <paths>` and `npm run check:markdown -- <paths>` for Markdown and the repository's scoped source/JSON checks.
Final profile names must come from admitted HISEW inspection; proposed coverage is focused contracts plus affected package, browser, workflow, recovery, rights/security and required CI/release regressions.
Full relevant verification, independent review and selected profiles are required for R2; local passes, hosted qualification, release readiness and actual publication are separate evidence classes.

## Trust boundaries, retention and observability

The archive reader currently rejects non-package paths, traversal components, unsupported entry types and duplicate requested files, but uses unbounded `gunzipSync` and does not explicitly reject every truncated member.
Set reviewed limits from real candidate sizes with documented headroom: compressed bytes, total expanded bytes, member count, and selected document bytes; validate bounds before allocating/parsing and retain existing accepted package shapes.
Use Node's supported bounded decompression or assessed existing native tar capability through the owning reader seam; do not create a second extractor or widen the publisher's dependency/credential surface to solve documentation parsing.
Confirm these targeted changes with the appointed native security reviewer; broader archive defects discovered outside the necessary seam become separately scoped work.

Documentation failures should report a stable category, candidate coordinate/digest, file/section/example ID, phase, expected fact and observed mismatch.
Reuse current preflight and release reports for pass/fail/unknown, policy identity, observed timestamp and existing artifact bindings; avoid dumping tokens, raw environment variables or unbounded document content.
The release observer asks: which exact bytes were checked; which semantic contract failed; whether registry writes occurred; whether publication is accepted but availability pending; and whether only package-page metadata remains unverified.
Preserve failed and incomplete evidence in the configured native evidence destination for the admitted execution; the diagnostic `RETENTION_UNAVAILABLE` does not establish that all retention services are unavailable, and local pseudo-engine receipts cannot replace native evidence.
Candidate/report/consumer temporary output remains ownership-scoped; keep immutable accepted evidence and remove eligible task-owned scratch through existing retention controls after its last consumer.

## Migration, rollout and recovery

Migrate current claim surfaces and evidence schemas together before enabling the new current policy; update generated producer gates and existing CI-proof identity when the required verification semantics change.
The inspected `ci-check-applicability.mjs` is observation-only with `javaReuse: false` and excludes only two named narrative reviews; no general documentation-only skip exists.
Keep packed README/changelog and validator/policy changes within proof identity, and add a focused negative applicability fixture if that classification is changed.
Source-only documentation fixes require repacking, fresh artifact-bound documentation/admission proof, and renewed aggregate acceptance; reuse independently applicable unchanged evidence only through the accepted equivalence/provenance rules.
These fixes never repair already frozen npm documentation.
Preserve historical alpha, rc.1, rc.2 and rc.3 documents, tags, tarballs, signatures, approvals, definition snapshots and original evidence results.
Historical readers may report the old documentation defect without rejecting archival readability or retrospectively assigning the new gate a PASS.
Closed historical recovery cannot become a generic escape hatch to publish newly edited bytes; require current contract admission for any newly authorized publication path.

Roll out first through deterministic fixtures and actual disposable packed candidates, then ordinary CI and a separately authorized qualification-only hosted workflow.
Keep publication disabled for a new coordinate until the owner accepts the consolidated evidence and separately authorizes that exact release.
The release engineer observes the first authorized use through preflight, tag, publisher, exact registry readback and final note readback; the editorial owner reviews the actual packed documents before freeze.
Abort before publication on contradiction, missing proof, unknown policy, failed resource limit, mismatched identity or unavailable required review.
After tag/freeze, follow the existing closed reconciliation decision or abandon that version; do not repack under its accepted identity.
After possible registry acceptance, use bounded read-only recovery, never a blind retry of publication or tag writes.
After confirmed publication, correct package documentation in a separately authorized new version; editable GitHub notes can receive a separately authorized correction without pretending to change npm bytes.
No unpublish, same-version rewrite, asset replacement, tag movement, or automatic channel/deprecation action is part of this plan.
Before activation, revert an unaccepted source change if needed; after activation restrict a failing publication route or deliver a reviewed forward fix rather than silently disabling the gate.

## Principal unknowns and re-planning triggers

| Unknown / owner                                                    | Cheapest discriminating evidence before dependent implementation                                                                                                                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact governed prose/example inventory / editor and API maintainer | Inventory current packed README/API/changelog/compatibility status/install/profile claims and fences; review which are current, historical, partial or executable. Accept bounded coverage and explicit exclusions.                     |
| Minimum contract representation / release engineer                 | Compare extending existing marker projections with a small structured block in the authoritative versioned changelog; demonstrate one version change and one predecessor-positive fixture without creating a duplicate status registry. |
| Publisher proof transport / release engineer and security reviewer | Trace existing preflight artifact ID/digest and current recovery inputs into the dependency-minimal publisher; prove a missing/mismatched result stops before the mock write with no package execution.                                 |
| Archive limits/native reuse fit / security and dependency owners   | Measure retained candidate/member sizes; exercise a bounded decompression/truncated-input probe and compare existing tar's strict/list behavior. A parser replacement requires its own assessed selection/integration decision.         |
| Full-metadata README normalization / registry verifier owner       | Read npm 12's publisher/registry contract and harmless fixtures covering Unicode and the documented 64K bound. Do not invent whether that bound is bytes/code points or require full-text equality without evidence.                    |
| Historical/schema compatibility / release custodian                | Replay the existing alpha/rc.2/rc.3 evidence readers against retained definitions and new-current negative fixtures; identify any truly live recovery route before changing admission.                                                  |
| Required hosted checks / repository administrator                  | Read current ruleset/check configuration and compare existing workflow aggregate/proof policy. Do not infer live protection from YAML alone.                                                                                            |
| HISEW admission/profile/retention / owner                          | Resolve selected-versus-loaded identity, inspect actual execution ownership and supported verification/evidence destinations; this draft creates none.                                                                                  |

Re-plan if marker coverage cannot bound current claims, native archive reuse changes the publisher trust boundary, required evidence cannot be bound without a new approval protocol, historical recovery needs new writes, or current branch/runtime/release policy materially changes.
Re-baseline accepted requirements and affected proof when lifecycle semantics, channel policy, intended stable-release coverage, parser/dependency choice, or example execution scope changes.
Reassess the purpose after each slice and final review: consumers need truthful usable documentation for exact artifacts; extra bookkeeping, blanket historical bans, slow unrelated suites, or automatic prose rewriting do not satisfy that outcome.
