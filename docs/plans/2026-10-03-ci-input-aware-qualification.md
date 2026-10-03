# Draft implementation plan for input aware CI qualification

Status: implementation accepted by Maksym Shostak on 3 October 2026; activation remains subject to the gates below.
Decision owner: Maksym Shostak, repository owner.
Originating task: the request to propose a detailed HISEW implementation plan for selective integration checks, reuse of the compiled Java reference, and removal of unnecessary dependency installations.
Inspected source baseline: `044b057487a8fa0b686c9c8e4b7df9b02790eb97`.

The intended outcome is faster useful PR feedback and less repeated runner work without weakening the evidence behind `CI / required`.
The near-term deliverables are removal of the unnecessary dependency installation and observation-only applicability with a complete trust/evidence model.
Selective qualification and Java build reuse are separately gated experiments, not assumed improvements.
WebVOWL omission remains deferred unless its native equivalence preparation is demonstrably cheaper than the work it would avoid.

This document is the draft change dossier, proposed design and implementation handoff.
It does not amend existing requirements by its presence.
The current full-PR requirement remains authoritative until its replacement is explicitly accepted and implemented with its executable controls.
The owner subsequently authorized implementation using HISEW in the existing checkout, an implementation branch, commits and pushes, and configuration changes required by this plan.
The original accepted bytes are retained in protected HISEW snapshot `b4d42546-f315-4a1e-bc7b-421337d6045c` (SHA-256 `3722119827ac4b10d17b10316d651c1423d9e0d947e0094294d399a2ac1a880d`).
This authorization does not clear the dependent activation gates, Java redistribution terms, repository settings changes, merge or release.
Claude Code is the selected independent reviewer and verifier for this implementation; unavailable required Claude review pauses delivery for the owner's decision.
Consolidate each deliverable before broad review, use scoped follow-up reviews for findings, and stop an unchanged unsuccessful retry after one supported correction.
Include this document at the first commit point, before delivering the lean dependency-review slice.

## Review synthesis

This revision incorporates the supplied _Deep Review of the Input-Aware CI Qualification Implementation Plan.md_, read in full on 3 October 2026.
The supplied file's SHA-256 is `4685e1f2f596c494f92de50b9481dd5cca34b7ce9a6689b95b6f68f710197212`.
Its approval language is a review recommendation, not owner acceptance or implementation authority.
Source-specific citation tokens in that review are not reusable evidence; the consequential native contracts and repository controls below were checked directly.

| Review recommendation                                                | Synthesized disposition                                                                                                                                                                                   |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anchor omitted checks to the exact PR base                           | Adopted: bounded lookup of that base's accepted qualification, with direct original-execution pointers; no historical fingerprint search.                                                                 |
| Prevent candidate-controlled self-exemption                          | Adopted with an explicit activation blocker: trusted-base bootstrap plus independently controlled review/authority, not a claim that a candidate-controlled workflow can secure itself.                   |
| Separate applicability, execution and proof                          | Adopted: typed coverage states and a coordinated schema-v2 transition.                                                                                                                                    |
| Separate Java provenance from compatibility                          | Adopted conservatively: record complete image provenance, but remove image identity from invalidation only after a reviewed environmental equivalence policy supports it. Unknown changes still miss.     |
| Prefer Maven-native classpath portability                            | Adopted as a required experiment using `mdep.localRepoProperty`, with reactor paths, substitution and classpath order still verified.                                                                     |
| Measure benefit and identify owners                                  | Adopted: representative workload/latency/storage evidence, named responsibility assignments before activation, and explicit deactivation conditions. No invented performance SLO, estimate or risk score. |
| Retain v1 support during migration                                   | Not selected as a permanent second protocol: preserve historical v1 meaning, but make unsupported v1 evidence fall back to full execution rather than add a compatibility shim.                           |
| Add decision/risk records and avoid premature attestations/dashboard | Adopted within this dossier and one future superseding ADR; no new attestation authority, telemetry system or broad process framework.                                                                    |

## Planning basis and boundaries

HISEW inspection returned personal applicability with active controls and an admitted worktree.
The retained execution belongs to the separately completed scoped RC publication work; it is not an accepted execution for this optimization.
Reuse the existing CI assurance decisions where unchanged, but do not inherit publication authority or pretend that the new selective-check policy has already been approved.
The new `REQ`, `AC`, `QA`, `DEC`, `SLICE` and risk identifiers below are local to this draft.

In scope:

- Conditionally omit live Java reconciliation and isolated WebVOWL integration work when their complete relevant inputs are demonstrably unchanged.
- Reuse an authenticated retained build of the pinned upstream Java reference, while running comparisons against changed OwlAPI code whenever required.
- Remove `npm ci` from the dependency-review job after proving its remaining commands require no installed repository dependencies.
- Update CI summaries, receipts, governance tests and the directly affected specifications together.

Out of scope:

- Skipping security observations because a dependency lockfile is unchanged.
- Changes to release, release-reconciliation, maintenance, extended-test or CodeQL behavior, including the 32-shard evidence acquisition and release freshness requirements.
- Reusing JavaScript test verdicts merely because dependencies are unchanged.
- General npm, browser or Maven-directory caching; a new build system; a new third-party Action; changing external consumer repositories.
- Package APIs, dependency upgrades unrelated to the selected build recipe, branch protection changes or release authorization.

### Measured opportunity

[PR run 37082922204](https://github.com/Hadden-Industries/owlapi/actions/runs/37082922204), read back on 3 October, took 13 minutes 4 seconds from workflow start to completion.
Its Node 24 job took 374 seconds, including 74 seconds building the Java reference and 107 seconds reconciling the July corpus.
Its WebVOWL job took 331 seconds, including 259 seconds executing qualification.
Dependency review took 23 seconds, of which `npm ci` took 9 seconds and the review Action itself took 1 second.

These are observations from one run, not promised savings.
Parallel job times must not be added to predict critical-path savings.
This PR changed shipped `README.md` and governing/release records, so it is not an example of a PR that the proposed conservative selector would skip.
Assess PR latency and total PR-plus-merge runner work separately; an optimization that simply moves full qualification onto every merge is not the intended outcome.
The repository is public according to the repository API readback on 3 October.
GitHub currently makes standard hosted runner use free for public repositories, while artifact storage shares allowance with Packages; therefore do not equate saved runner-seconds with a verified bill reduction.
Developer feedback latency, engineering maintenance and retained storage are the primary trade-offs here.
[GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Proposed HISEW risk route

### Risk class:

R2, proposed.
This is an inference from changes to the qualification trust boundary, cross-run executable artifact reuse and the meaning of a required CI pass, not from the size of the YAML diff.
The install removal is simpler, but delivery slices do not reset the overall route or erase its assurance obligations.

### Decision owner:

Maksym Shostak accepts the changed CI contract and implementation scope.
The implementing task owns integration and evidence preparation, not approval.

### Reasoning:

A false-negative selector can admit an inadequately tested change.
A misidentified Java artifact can change the reference oracle.
Incomplete or misleading receipts can incorrectly bypass subsequent main validation.
These failures are plausible and may be invisible in an ordinary green run; targeted negative tests and independent assurance are necessary.
There is no identified safety-critical or regulated R3 consequence in this bounded CI proposal.

### Potential blast radius:

PR contributors, maintainers and consumers relying on main CI assurance.
The boundary remains read-only CI; npm publication authority, production credentials and external consumer checkouts are not extended.

### Reversibility:

Restore unconditional integration execution and fresh Java builds through a reviewed forward change or exact change revert.
Old receipts and reference artifacts then become ineligible, without deletion or source-data migration.
This restores coverage but does not undo a merge already admitted by defective selection; any such merge needs fresh full qualification and owner disposition.

### Principal unknowns:

The safe exclusion inventory, enforceable selector-review boundary, evidence-lineage bootstrap, environmental equivalence, Java closure/rights/relocation, realistic hit rate and net benefit remain to be established by the bounded experiments below.

### Required artifacts:

This accepted dossier and its exact protected HISEW requirement snapshot before implementation; the current software-selection assessment; input-policy and artifact schemas; focused and full verification evidence; independent verification and scoped security review; hosted rollout evidence.
Keep native receipts in their native stores rather than copying them into a tracked execution diary.

### Required specialist lenses:

CI applicability and receipt correctness; executable artifact provenance and filesystem boundaries; preservation of the Java behavioral oracle.
HISEW R2 requires independent verification, and SEC-01 is triggered by the changed artifact trust boundary.
No review or subagent is launched during this planning task.
Choose approved available providers before implementation qualification; unavailable required coverage remains an evidence gap.

### Required verification:

Focused selector, receipt, aggregate, artifact and workflow-governance tests during development; native actionlint and affected integration checks at stable seams; the registered HISEW `full` profile on the final frozen implementation, supplemented by hosted behavior and independent assurance.
The current registered profile composition is recorded below; its name alone is not proof of hosted coverage.

### Required human approvals:

Acceptance of this R2 scope and the changed full-PR/receipt contract; approval of the narrowly bounded cross-run Java artifact exception; clearance of any unresolved Java redistribution terms before artifact publication; separate authority for later Git delivery effects.
No no-shim exception is proposed or required.

### Maximum sensible autonomy:

For this request, inspect and revise this draft only.
After explicit implementation acceptance, implement within the accepted baseline and perform authorized checks.
Do not change repository settings, security rules, release workflows, external repositories or publication state by inference.

### Next lifecycle step:

Owner review of the proposed decisions and prerequisite gaps, followed by capture of the exact accepted requirement bytes and start of the appropriate R2 execution.
Do not capture this draft as accepted evidence or adopt the unrelated completed execution.

## Assurance invariants and current trust assumptions

Every proposed optimization must preserve these invariants:

1. Each required assurance claim has a current successful execution or a directly authenticated original successful execution anchored by the exact captured PR base, under equivalent relevant inputs and environment.
2. Added relevant/unknown inputs and lost evidence can only increase required execution; uncertainty never creates permission to omit a check.
3. Java artifact reuse changes materialization cost, not whether current behavioral comparisons must run.
4. A candidate cannot authorize changes to the rules that omit its own evidence; candidate code, workflow conclusions and self-reported provenance are not independent approval.
5. The ordinary fresh execution path remains complete.
   A check failure is not an optimization miss.
6. Additional assurance machinery must justify its continuing complexity through observed useful feedback or work reduction without sacrificing those invariants.

The design separates four responsibilities: trusted change determination, per-check applicability, base-anchored evidence resolution, and execution/aggregation.
Artifact materialization sits beneath execution, not inside the decision about whether a behavioral check is required.
Reason from these invariants and the intended outcome first, then maintained design practice, authoritative consumer specifications and finally preferences; binding requirements and permission boundaries remain constraints throughout.

### Observed repository controls

Read-only GitHub API inspection on 3 October returned the following effective `main` rules from [ruleset 21687258, Protect main](https://api.github.com/repos/Hadden-Industries/owlapi/rulesets/21687258):

| Control      | Observed state and planning consequence                                                                                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required CI  | Strict/up-to-date `CI / required`, bound to GitHub Actions application `15368`; preserve its identity.                                                                                                                                                    |
| PR review    | Zero ordinary required approving reviews; no required code-owner or last-push approval; stale reviews are not dismissed automatically. Review-thread resolution is required. Do not claim that independent approval is already enforced.                  |
| Bypass       | `MaksymShostak`, user ID `6131830`, has the ruleset's `pull_request` bypass mode. An authorized bypass is not automatically acceptable optimization evidence.                                                                                             |
| Other rules  | Deletion and non-fast-forward prevention, plus a CodeQL high-or-higher security threshold. These remain unchanged.                                                                                                                                        |
| Merge policy | Merge and squash are permitted. No `merge_queue` rule was returned; `ci.yml` currently handles PR and main-push events, not `merge_group`. Squash remains a full-validation fallback; enabling a queue requires a separate reviewed event/receipt design. |

The classic branch-protection endpoint returned 404; the active ruleset above is the applicable control and must not be mistaken for an unprotected branch.
Refresh these observations before activation and after any control change.
They describe configured controls, not proof that every past merge received an independent review.

The initial threat model trusts an explicitly accepted protected-base control revision and the approved GitHub/toolchain services, but treats candidate policy, candidate-generated records and artifact payloads as untrusted until verified.
A read-only bootstrap must determine changed control paths using the accepted base's closed control/import inventory before candidate applicability code or policy can affect an omission.
Use an isolated base-control checkout with fixed arguments and no candidate imports, hooks or installed packages.
Any change to the workflow, bootstrap, selector, aggregate, schema, policy, relevant tool configuration or its execution environment requires full qualification and independent review of that exact control change.

This bootstrap prevents self-exemption only while its invocation is itself trustworthy.
A PR can edit its workflow invocation; running a base-sourced script from candidate-controlled YAML is not an independently enforced trust boundary.
Before selective activation, Maksym must approve a concrete review/enforcement arrangement that prevents omission or replacement of the bootstrap and aggregate, including treatment of bypasses.
If that arrangement requires ruleset/settings or a separately governed required workflow, obtain separate authority and replan that boundary; this plan does not silently authorize it.
Without it, observation may continue but selective activation remains blocked.

### Responsibilities before activation

| Responsibility                                | Accountable or responsible party                              | Required disposition                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Scope, trust model and activation             | Maksym Shostak                                                | Accept the exact baseline and control arrangement; assign any delegated operational role.                            |
| Implementation and evidence integration       | Implementing task, once authorized                            | Preserve scope, prepare traceable native evidence and resolve findings; cannot self-approve the policy.              |
| Independent verification and security review  | Owner-selected approved providers; not yet assigned           | Record actual provider/person, target and retained report before the affected policy/trust-boundary slice activates. |
| Java redistribution clearance                 | Maksym Shostak, with a qualified rights reviewer where needed | Record actual clearance and notices for the full closure before public upload. No clearance is claimed now.          |
| Rollout observation, rollback and maintenance | Maksym Shostak unless he names another CI maintainer          | Accept the observation window, storage/maintenance budget and handoff; name the actual operator before activation.   |

These are planned responsibilities, not fabricated assignments, delegated work or completed reviews.

## Requirements and acceptance criteria

| Requirement                                               | Acceptance criterion                                                                                                                                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 Select checks from all relevant inputs            | AC-001: Java and WebVOWL decisions are separate; unchanged dependencies never suppress a source-, fixture-, oracle-, toolchain- or policy-affected check.                                                                                                           |
| REQ-002 Uncertainty preserves qualification               | AC-002: missing or ambiguous history, unsupported events, unfamiliar paths, invalid proof or unavailable services select fresh qualification; a failed required check never becomes an optimization miss or pass.                                                   |
| REQ-003 Preserve truthful required checks and merge reuse | AC-003: `CI / required` validates explicit coverage, distinguishes `FULL`, `SELECTIVE` and `REUSED`, rejects unproved omissions, and does not turn every successful selective PR into a full main rerun.                                                            |
| REQ-004 Reuse only a verified Java build                  | AC-004: a valid exact-input trusted reference avoids Maven compilation; changed or unverifiable build inputs cause a fresh build; relevant Java comparisons still execute against current OwlAPI code.                                                              |
| REQ-005 Remove only demonstrated redundant installation   | AC-005: dependency review still runs on every PR with the current vulnerability policy, runtime checks and runner record, with no repository `node_modules` needed in that job.                                                                                     |
| REQ-006 Preserve authority and release boundaries         | AC-006: no new privileged trigger, secret, publication path, general cache, unselected Action or release-evidence exception is introduced.                                                                                                                          |
| REQ-007 Establish an observable improvement               | AC-007: reports identify omitted work, original proof, restore/build decisions and fallback reasons; representative hosted comparisons show the intended work was removed and disclose latency, runner-work and cold-start trade-offs.                              |
| REQ-008 Establish bounded independent selection authority | AC-008: selection uses the captured base's accepted controls and qualification, resolves only direct original executions under fixed resource limits, and cannot accept candidate self-exemption; the review/enforcement arrangement is recorded before activation. |

AC-007 requires an owner-recorded comparative activation decision for the complex optimizations, not an invented numerical savings target or an extra performance campaign for SLICE-001.
AC-004's environment equality means the reviewed compatibility determinants in DEC-003, not automatic equality of every recorded provenance fact.

### Quality scenarios

| Scenario                                | Stimulus and required response                                                                                                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QA-001 Unrelated documentation          | Modify a reviewed, non-shipped, non-oracle informational file; its source, quality and governance checks still run, while eligible integration bodies are explicitly omitted only with valid unchanged-input proof.                                                                                    |
| QA-002 False-negative prevention        | Change each relevant input class individually, including shipped Markdown, source, lockfiles, Java harness, fixtures, consumer audit, workflow, policy or environmental determinants; the affected expensive check executes.                                                                           |
| QA-003 Complete change detection        | Exercise additions, deletion, rename across categories, executable/type changes, Unicode/whitespace/newline names, more than 300 changed paths, stale base, missing history and unsupported event; never derive an omission from incomplete evidence.                                                  |
| QA-004 Gate integrity                   | Missing decision, invalid schema, empty inventory, unexplained skipped test, failed/cancelled job, forged successful output or stale run attempt prevents acceptance or requires full execution before acceptance.                                                                                     |
| QA-005 Java artifact integrity          | Wrong repository, PR-produced artifact, wrong workflow/attempt/commit, expired artifact, wrong digest, incomplete closure, path escape, symlink or changed JAR is rejected before running classes; the normal fresh-build path remains available.                                                      |
| QA-006 Java relocation and invalidation | Restore into a different absolute checkout and empty Maven home; run the real oracle; change source, a dependency/plugin digest, JDK patch, Maven, recipe or a relevant environmental determinant and demonstrate a miss.                                                                              |
| QA-007 Recovery                         | Bound lookup/download failures and recover by executing required work; a failing fresh Maven build or behavioral comparison still fails CI; cancellation produces no reusable success.                                                                                                                 |
| QA-008 Outcome and trust                | Demonstrate eligible documentation PR, source-changing PR with warm Java reuse, cold miss, and their merge paths; forks do not publish shared trusted artifacts or gain additional authority.                                                                                                          |
| QA-009 External dependency resolution   | With identical committed files and candidate bytes, make the native consumer installation resolve a different dependency graph; WebVOWL qualification executes. An unavailable graph or an unmodeled live input also prevents omission.                                                                |
| QA-010 Monotonic selection              | Add relevant changes or unknown paths to generated change sets; selected checks never decrease. Remove valid evidence or alter policy/control inputs; decisions widen to required execution, never to omission.                                                                                        |
| QA-011 Base lineage and bounds          | Exercise exact-base FULL and REUSED qualifications, missing base metadata, more than the allowed lookup page, cycles, indirect/nonexecuted origins, superseded attempts and expired original proof. No arbitrary historical match or recursive search can authorize omission.                          |
| QA-012 Selector bootstrap               | Attempt to alter both the selector and its tests, replace/remove the bootstrap invocation, relax schemas or forge aggregate outputs. Detect control changes before trusting candidate policy and demonstrate the independent authority that prevents an unreviewed control change from being accepted. |
| QA-013 Environment classification       | Hold semantic build inputs fixed across at least two hosted image revisions and run the actual oracle. Record image provenance; only an approved equivalence policy permits a hit across the difference. Unknown relevant differences and changed policy force fresh work.                             |
| QA-014 Evidence lifecycle               | Record successful main qualification for both fresh and reused paths, advance through multiple selective PRs with direct original pointers, then delete/expire one proof or rerun its producer during transfer. Recover by executing before omission or reject at aggregation if recovery is too late. |

## Native capability and software selection

Research refreshed on 3 October 2026 for complete change detection, conditional required checks, immutable artifact transport and Maven runtime materialization.
The strongest native alternatives and a maintained external selector were checked against the repository-specific proof requirements.

| Capability or candidate                       | Assessment and proposed selection                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing Node orchestration and Git           | Reuse the existing receipt/API boundary and Node built-ins. Git compares exact committed trees and supplies NUL-delimited path records; custom work is limited to OwlAPI input ownership, applicability and proof policy. Do not implement a diff engine or shell-quoted filename protocol.                                          |
| GitHub workflow `paths` filters               | Not selected for required workflow scheduling: they cannot express the full evidence policy, and a filtered required workflow can remain pending. Preserve the unconditional workflow trigger and required aggregate.                                                                                                                |
| `dorny/paths-filter` v4.0.3                   | Maintained path classification with Git/PR API modes, confirmed from the latest release service. It does not establish transitive input completeness, tested-package equality or evidence provenance, and would add an Action outside the approved inventory. Do not adopt it for this narrower repository-specific residual policy. |
| Official artifact Actions                     | Reuse already selected `upload-artifact` v7.0.1 and `download-artifact` v8.0.1 at their existing full SHAs. Latest release lookup matched those versions. Use the native exact-ID and digest-error interfaces; no ZIP parser or general artifact service.                                                                            |
| `actions/cache` v6.1.0                        | Exact-key restore is available, but a cache hit does not by itself establish the approved producer, successful qualification or payload identity. Not selected; do not add general cache semantics or prefix-key restore to the existing no-cache policy.                                                                            |
| Maven native dependency and classpath tooling | Reuse Maven to resolve and materialize the real graph and classpath. Record generated identities; do not invent a dependency resolver or hand-author a transitive lock. Exact effective plugin/toolchain selection and closure qualification are prerequisites for enabling reuse.                                                   |
| Existing dependency-review Action v5.0.0      | Its pinned `action.yml` runs the bundled `dist/index.js` on `node24`; it does not consume this repository's `node_modules`. Its latest release remains v5.0.0. Keep the Action and remove the unrelated project installation.                                                                                                        |

The retained seven-Action inventory and native tooling are existing approved integrations, not new package selections.
The artifact Actions' selected source and existing adoption records remain the rights basis; the exact upload Action license was rechecked as MIT with its notice condition.
No code from the rejected alternatives is incorporated.
Public retention of the Java build and its third-party JARs is a new distribution question: the upstream POM declares Apache-2.0/LGPL-3.0 alternatives, but that alone does not clear the complete transitive bundle.
Establish and retain the actual license texts, notices and applicable obligations before enabling the producer.
Do not treat a checksum, SPDX label or this document as legal clearance.

Technical selection is proposed; existing Action versions were verified current; hosted integration is unverified; Java bundle rights/closure remain activation prerequisites; owner acceptance is pending.
Before material incorporation, refresh exact versions and terms, select the current applicable stable/LTS tooling under VER-01, then freeze it for verification.
The pinned Java OWLAPI revision is the accepted semantic oracle, not a candidate to upgrade merely because a newer library version exists.

Primary sources supporting the capability assessment:

- [Git diff formats and exact endpoint comparisons](https://git-scm.com/docs/git-diff).
- [GitHub required checks and skipped workflows](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).
- [Paths-filter supported modes](https://github.com/dorny/paths-filter) and [v4.0.3 release](https://github.com/dorny/paths-filter/releases/tag/v4.0.3).
- [GitHub cache contract](https://github.com/actions/cache) and [v6.1.0 release](https://github.com/actions/cache/releases/tag/v6.1.0).
- [GitHub artifact identity API](https://docs.github.com/en/rest/actions/artifacts), [pinned downloader inputs](https://github.com/actions/download-artifact/blob/3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/action.yml) and [pinned uploader license](https://github.com/actions/upload-artifact/blob/043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/LICENSE).
- [Pinned dependency-review implementation contract](https://github.com/actions/dependency-review-action/blob/a1d282b36b6f3519aa1f3fc636f609c47dddb294/action.yml).
- [Maven classpath generation](https://maven.apache.org/plugins/maven-dependency-plugin/build-classpath-mojo.html), [dependency copying](https://maven.apache.org/components/plugins/maven-dependency-plugin/examples/copying-project-dependencies.html) and [reproducible-build guidance](https://maven.apache.org/guides/mini/guide-reproducible-builds.html).
- [Pinned upstream Java POM](https://github.com/owlcs/owlapi/blob/d7e997a53b470e32700de89cc610d9daf01ea769/pom.xml) and [distribution build configuration](https://github.com/owlcs/owlapi/blob/d7e997a53b470e32700de89cc610d9daf01ea769/distribution/pom.xml).
- [Maven native local-repository prefix substitution](https://maven.apache.org/plugins/maven-dependency-plugin/build-classpath-mojo.html#localRepoProperty).
- [SLSA v1.2 build provenance fields](https://slsa.dev/spec/v1.2/build-provenance), used to distinguish recorded provenance and policy-relevant inputs, not to claim SLSA certification or attestations.
- [GitHub ruleset controls](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) and [artifact-attestation use cases](https://docs.github.com/en/actions/concepts/security/artifact-attestations).

## Proposed design decisions

### DEC-001 Conservative per-check applicability

Extend the existing verification strategy instead of adding workflow-level path filters.
Keep the current source, quality, governance, dependency review, candidate, portability and browser checks.
Only the live Java qualification bodies and isolated WebVOWL integration bodies become selectively applicable.

Use the captured PR base and the actual tested merge tree, verifying that its parents match the event's captured base and head.
Do not compare only the most recent push or trust a possibly truncated PR file list.
Use Git's native complete tree comparison with NUL-delimited output, explicit argument arrays, bounded execution and no external diff/textconv execution.
Treat rename endpoints as changed inputs, or deliberately disable rename detection and handle deletion plus addition.
Unknown paths, unsupported events, missing objects, an invalid checkout or a policy change select full qualification.
The initial release keeps fork PRs on full qualification.

Maintain one versioned applicability policy with separate Java and WebVOWL input models: tracked-path projection, candidate identity where relevant, native external-input identities, execution/oracle identity and environmental determinants.
Keep change determination separate from the interpretation of those inputs and from evidence retrieval.
Initially, each projection includes all tracked files except individually reviewed informational exclusions.
This deliberately favors false positives over false negatives and avoids attempting automatic transitive dependency inference.
Do not authorize `docs/**`, `docs/plans/**` or `*.md` as blanket exclusions.
Accepted requirements, security/governance instructions, expected results and executable documentation remain inputs regardless of extension.

The first exclusion inventory is an implementation prerequisite, not invented evidence in this proposal.
Review candidate historical narrative records against actual readers and native package contents; exclude a file only when its informational role and lack of effect on the particular integration check are established.
Changes to the inventory itself force all affected checks.
If no useful safe exclusion exists, retain full integration checks and reconsider the benefit of this recommendation instead of weakening the rule.

| Input class                                                                            | Conservative treatment                                                                        |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Published JavaScript, exports, manifest, lockfile and package construction             | Run both integrations; dependencies are only part of this set.                                |
| Shipped `README.md`, `API.md`, `CHANGELOG.md`, notices and compatibility records       | Run integrations because candidate bytes or consumer expectations can change.                 |
| Java pin, harness, fixtures, July corpus metadata and comparison policy                | Run Java; run WebVOWL too unless its separate projection positively proves independence.      |
| WebVOWL/ontology pins, consumer scripts, reviewed development audit and browser tools  | Run WebVOWL; retain conservative Java execution where independence is unproved.               |
| Workflow, selector, receipts, schemas, governance, tool configuration and instructions | Run both; a PR cannot relax its own applicability policy to skip validation.                  |
| Reviewed informational exclusion with no other changes                                 | Eligible for that check only after baseline, environment and artifact equivalence validation. |

Compare the before/after input model and record its canonical fingerprint, policy identity, tested tree and original verification source.
The fingerprint is an identity/audit value, not a key for searching historical runs until a success happens to match.
The captured PR base's accepted qualification is the sole lineage root for an omitted check.
Use this bounded algorithm:

1. Validate the captured base/head/tested merge identity and accepted base-control revision before evaluating candidate applicability.
2. Query only the fixed repository's `ci.yml` main-push runs for the exact base SHA; select the newest run and latest attempt, never an older successful run behind a failure or pending run.
3. Require that run's successful `CI / required` and unique schema-v2 main qualification artifact, bound to that exact main commit/tree and native run/job/artifact identities.
4. Read the base record's per-check pointer directly to the original executed proof.
   Each pointer binds repository, run/attempt, tested source/tree, check identity, policy/input/environment identities and immutable proof artifact identity/digest.
5. Revalidate that original execution's successful current attempt and required test inventory.
   It must contain fresh successful execution of that check, not another selective pointer.
   Reject indirect pointers and cycles.
6. Prove equivalence from that origin to the base and from the base to the candidate, including the final native preparation inputs.
   Copy the same original pointer into the candidate's record; do not add another recursive link.
7. Re-read mutable run/attempt and artifact identity after transfers.
   Missing, expired, invalid, ambiguous or changed proof selects execution; late loss that cannot be repaired by execution prevents aggregate success.

Bound each exact run/artifact inventory to one complete page of at most 100 entries; a larger or truncated inventory falls back rather than searches further.
For the two selectively applicable checks, resolve at most two original-execution proof records, deduplicating a shared origin, with no recursive evidence traversal or global index.
Keep receipt/proof payloads within the existing 64 KiB class unless a reviewed schema-size experiment requires a different explicit bound.
Reuse bounded native API reads, including the existing 10-second request timeout; define a finite total selection/transfer budget within the current job timeout before activation and test that exhaustion selects fresh work.

Emit a schema-v2 main qualification record after every successful full or verified-reuse main aggregate, using the existing run/attempt-qualified artifact mechanism.
It records the exact landed commit/tree, accepted source qualification and direct original-execution pointers even when no application tests ran on main.
The existing PR-only receipt writer does not supply this record today: its introduction, main-reuse reader and retention tests are explicit SLICE-003 work.
Absent v2 base metadata during bootstrap simply keeps the PR full; a successful ensuing main run seeds the new lineage without a backfill.
The bounded lookup consumes authenticated service identity plus validated record contents; a self-reported main record alone is not acceptance.

No available valid base-to-original proof means execute the check.
Do not add an arbitrary freshness exemption: preserve mandatory live security observations and invalidate on relevant environment/toolchain change.

Selection has a preliminary and a final phase.
The strategy can identify potential omissions early, but each integration validates remaining real inputs before omitting its body.
For WebVOWL this includes the newly built candidate tarball digest, not only a prediction from source paths or an artifact name.
It also includes the actual consumer dependency closure: the current harness injects the tarball using `npm install` and subsequently qualifies a fresh `npm ci` installation.
An unchanged source lockfile therefore does not by itself prove that the candidate consumer graph is unchanged.
Use native npm preparation to establish the resulting graph/integrities before deciding, or first prove a supported fully lock-preserving installation contract.
Keep the minimum necessary installation/preparation even on an otherwise eligible PR; skip the expensive comparisons/builds/browser tests only after graph equivalence is known.
If this preparation cannot be separated without changing the consumer contract, leave WebVOWL unconditional and replan that portion.
For Java it includes actual selected JDK/Maven and runner identity; cheap setup may still run to obtain that evidence.
Any disagreement widens execution.
Inventory non-file inputs as well: external resolution, environment, network observations and time-dependent behavior.
Required live observations remain fresh; an unmodeled nondeterministic input prevents reuse.

### DEC-002 Preserve the graph and make coverage explicit

Keep the stable required job names and current candidate prerequisites.
For the initial implementation, retain Java work inside `source_node_24` and let `webvowl` run a lightweight applicability preamble when its expensive body is unnecessary.
Avoid a job-graph split and its additional installation cost unless measurement justifies a separate later decision.

The Node 24 ordinary package suite still runs.
Its existing environment-gated live Java groups must be inventoried explicitly: when selected, the reference environment is mandatory and the expected live tests must execute; an unset variable or a skipped suite cannot count as qualification.
When omitted, report those exact live groups as `NOT_RUN` with `UNCHANGED_INPUTS` applicability and verified original proof, rather than as passed tests.
For WebVOWL, retain the checkout and native dependency preparation needed to prove the real consumer inputs, and omit only the remaining unnecessary materialization, test, build and browser work after that proof.
Do not repeat preparation when the decision widens to full execution, and do not skip the candidate's own validation.
The July evidence upload runs only when that reconciliation actually executed, preserving failed comparison evidence when execution occurred.

The aggregate consumes schema-validated per-check coverage records as well as native job conclusions.
Keep applicability, execution outcome and proof validation as separate typed fields, not booleans or a free-text reason standing in for a verdict.
An unchanged check still has a required assurance claim; avoid calling the assurance itself not applicable.

| Applicability      | Execution outcome                            | Proof state                           | Acceptance                                                                                     |
| ------------------ | -------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `REQUIRED`         | `SUCCESS`                                    | Current executed evidence valid       | Accept fresh coverage.                                                                         |
| `REQUIRED`         | `FAILED`, `CANCELLED` or missing             | Any                                   | Reject; do not relabel as a reuse miss.                                                        |
| `UNCHANGED_INPUTS` | `NOT_RUN`                                    | Base-anchored original proof verified | Accept reused coverage with original identity.                                                 |
| `UNCHANGED_INPUTS` | `NOT_RUN`                                    | Invalid, unavailable or missing       | Before execution, convert to `REQUIRED` and run; if discovered too late, reject the aggregate. |
| `UNKNOWN`          | `NOT_RUN`                                    | Any                                   | Never acceptable; resolve uncertainty by requiring execution.                                  |
| Any                | Unexpected skipped job or selected live test | Any                                   | Reject rather than infer success from the platform conclusion.                                 |

Every accepted record carries its check/input/policy identities and stable reason code; reused coverage also carries the base qualification and direct original execution.
Validate allowed state combinations and reconstruct complete required coverage; an isolated `SUCCESS` field or forged output is insufficient.

Introduce receipt schema version 2 for the changed meaning, with explicit PR qualification and landed-main qualification roles.
A fresh run is `FULL` only when every registered application check actually executed successfully; otherwise an accepted fresh run is `SELECTIVE`.
Restoring a Java build does not prevent `FULL` when the current behavioral checks all executed: materialization and coverage are different dimensions.
A qualifying ordinary main merge reports `REUSED` with the original source mode and per-check coverage, rather than claiming fresh or full execution.
Preserve the existing head/base/tree/workflow, latest-attempt, candidate, runner and same-repository checks, and add applicability-policy, input-projection and original-execution bindings.
Revalidate original proof dependencies at merge time; if unavailable, run full CI.

Observation-only changes may define and test the v2 schema while continuing the existing v1 full protocol; no v2 omission is enabled during that phase.
The activation change introduces the v2 writer, main qualification record, reader, aggregate and governance together.
Older or unsupported receipts then fall back to full qualification; historical v1 records retain only their original FULL/reused meaning and are not relabeled, backfilled or silently accepted as selective coverage.
Coordinate writer, reader, aggregate, workflow outputs, source-test reporting, governance and documentation in one compatibility change.
Reassess names such as `FULL_CI_JOB_IDS`: retain them only if they still mean full execution, otherwise update all consumers to an accurate shared term.
Do not add a legacy alias or schema-coercion shim.

### DEC-003 Retain a verified Java runtime bundle

Reuse only the compiled upstream reference and its complete runtime JAR closure.
Continue checking out the exact pinned upstream source so the existing Git revision check remains meaningful.
Compile the repository's current Java oracle sources and execute the required comparisons for the current candidate; neither oracle verdicts nor current harness classes are reused under this recommendation.

Generate the dependency and plugin inventory using native Maven observations from the exact build recipe.
Bind the approved runtime closure and build inputs in a generated, reviewed input record.
Do not derive the expected graph exclusively from the artifact being accepted.
Unresolved external snapshots, version ranges, floating plugin selection or unknown environment inputs block reuse until made deterministic or explicitly modeled with fresh native resolution.
No custom Maven resolver or hand-written transitive dependency lock is introduced.

Separate immutable artifact identity, semantic compatibility and production provenance in the manifest:

| Part              | Required contents and meaning                                                                                                                                                                                                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity          | Upstream commit/tree, recipe identity, manifest schema, closed output inventory and artifact/payload digests; identifies the particular qualified build rather than any allegedly reproducible rebuild.                                                                                                                                                                    |
| Compatibility key | All effective POM/parent/module and reactor inputs; resolved external dependency/plugin bytes and repository/settings identity; exact JDK vendor/distribution/version/build and Maven; relevant JVM/Maven options, OS/architecture and other observed semantic environment determinants; recipe, verifier and accepted compatibility-policy revision. Exclude credentials. |
| Provenance        | Fixed GitHub repository/workflow, producer commit, run/attempt, event/ref, full runner image/version, timestamps, artifact ID/service digest and observed tool versions; retain facts even where equivalence policy proves they are not invalidating inputs.                                                                                                               |

Do not use the whole provenance object as the compatibility key.
Conversely, moving a field into provenance is not evidence that it cannot affect the oracle.
The initial safe implementation retains exact-image invalidation until an accepted environment-equivalence policy identifies the actual relevant components and qualifies the excluded difference.
Compare at least two hosted image revisions while holding explicit semantic inputs fixed, checking the actual oracle and any native-library, locale, filesystem or process assumptions.
Those observations support only the tested scope, not a claim that every future image revision is harmless.
After qualified equivalence, a known provenance-only image change need not force compilation; a changed or unclassified relevant component still does.
Keep existing whole-CI/receipt host-equivalence rules unchanged unless their own separately traced policy amendment is accepted; a Java build-key decision does not silently relax test-proof reuse.

The bundle contains a closed inventory of reference JARs, runtime dependencies, necessary notices and a versioned manifest with relative paths, sizes and SHA-256 digests.
Do not retain `.git`, credentials, arbitrary `.m2` contents, unrelated build output, the JDK, npm dependencies or a producer's absolute classpath.
Before designing relocation logic, experiment with Maven's native `mdep.localRepoProperty` option, which substitutes the local-repository prefix; the native contract notes that `prefix` takes precedence.
Verify the option against the exact selected plugin and current reactor: it does not establish relocation of reactor `target` paths, resolve placeholders for the Java launcher, or prove order/collision safety by itself.
Materialize under a dedicated task-owned directory, validate a relative JAR inventory and produce the existing consumer's classpath format with order preserved.
Only a documented residual gap may need a small boundary materializer; do not introduce a general classpath grammar, unsafe text substitution or a legacy absolute-path fallback.
Reject missing/extra files, duplicate or escaping paths, symlinks and digest mismatches before executing any restored class.
Use the official artifact transport and native Maven/JDK consumers; do not add a second archive parser.

The pinned upstream distribution embeds `maven.build.timestamp` in `Implementation-Version`.
Consequently, a repeated build is not assumed to produce identical JAR bytes.
This proposal is reuse of a specifically identified qualified build, not a claim of bit-for-bit reproducibility.
The qualification experiment must determine whether time/path-dependent metadata affects the behavioral oracle.
If it does, stop and obtain a reviewed deterministic recipe; do not silently normalize or patch upstream JARs.

### DEC-004 Trust the producer and keep a complete miss path

Use the existing `ci.yml` Node 24 path as producer on successful full runs from protected `main`.
PRs, including same-repository PRs, never supply the shared trusted reference artifact.
Consumers independently check the fixed repository/workflow, event/ref, producer commit and recipe, successful latest run attempt, retention, artifact ID and digest before trusting its manifest.
An artifact name or self-reported checksum is not producer authentication.

A consumer first validates the actual build/environment key, then restores the exact selected artifact.
A missing, expired, mismatched, corrupt or unavailable artifact causes a fresh build in a clean task-owned location followed by the ordinary required qualification.
Bound discovery to a fixed, complete inventory window for the declared reference key and permitted main producer; no unbounded historical search or nearest/prefix-key match.
Cap inspected runs/artifacts, payload size and total lookup/transfer time before activation, using the existing one-page/100-entry and request-timeout pattern where applicable.
Exceeding any bound is a diagnosed miss, not permission to accept incomplete observations.
Re-read mutable producer run/attempt, completion and artifact identity after download, immediately before admission; reject a rerun race or changed digest just as the current receipt verifier does.
Bound discovery and transport so repeated service failures cannot consume the whole job timeout; do not add unlimited retries.
Only these precisely identified optional transport operations may tolerate failure, and their actual outcomes must be consumed by the fallback logic.
A failed fresh build, failed smoke test or failed comparison still fails CI.

Cold seeding must be explicit because ordinary successful PR merges currently reuse PR qualification without running the main source jobs.
When a fully qualifying PR had to build a new reference because no trusted matching bundle existed, mark its receipt as requiring one full main seed run instead of silently assuming that a producer will run later.
That main run can build, qualify and retain the trusted bundle.
Subsequent eligible PR and merge runs resume ordinary reuse.
The seed requirement is a hint re-evaluated from actual compatible, verified artifact availability at the main decision point, not an indefinitely retained flag; test interruption, rerun, concurrent seeding and expiration.
No new privileged trigger, workflow file or publication job is needed.

Keep artifact retention bounded, initially aligned with the existing 90-day evidence policy.
Expiration reduces hit rate, not correctness.
Add only scoped `actions: read` where cross-run verification actually needs it, preserve `contents: read`, and expose the token only to the bounded API/transport steps.
Do not pass API tokens into Maven, test processes or archived files.
Release workflows do not consume this reference bundle.
Do not add artifact attestations, signing infrastructure or `id-token: write` to this test-only optimization.
GitHub's attestation guidance excludes frequent automated-test-only builds from its recommended uses; main-only production and independently checked run/artifact identity are the selected bounded mechanism here.
Reassess if the bundle later crosses a distribution or authority boundary beyond this CI use.
[GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations).

### DEC-005 Remove the dependency-review installation only

Remove `npm ci` from `dependency_review`.
Keep the existing exact Node/npm setup, runtime assertion, non-browser runner record, PR review Action, push applicability report, job name and vulnerability thresholds.
`record-runner.mjs` uses only Node built-ins in this mode; its optional browser branch is not invoked.
Exercise the remaining entry points in an isolated fixture without `node_modules`, including invocation through npm so the runner record retains the npm identity.
Compare the runner record with the existing contract and add a negative fixture introducing a real non-built-in dependency so the isolated test proves it detects a future installation requirement.

Inspect other orchestration-only jobs but make no automatic batch removal.
For example, `workflow-metadata.mjs` imports `semver`, so metadata installation is not established as redundant.
Any additional removal requires its own proven import/command closure within the accepted scope.
Do not expand this slice into skipping dependency review itself.

### DEC-006 Amend policy and executable controls together

The implementation must reconcile, rather than silently contradict:

- [The accepted full-PR and main-reuse contract](2026-09-29-ci-verification-reuse.md), especially its full-PR requirement and full-only receipts.
- [Contributor CI expectations](../../CONTRIBUTING.md).
- [Implementation-plan sections 2.34, 2.56 and 2.58](../implementation-plan.md), including required dependency review, action roles, cache/artifact trust and applicability/aggregate rules.
- [The Python/Markdown quality plan](2026-09-29-python-markdown-quality-tooling.md), whose protected PR floor must remain coherent with this scoped amendment.
- Workflow-governance and Java qualification-workflow tests, which currently require unconditional reconciliation and the exact receipt/job contracts.

Preserve historical acceptance records and identify the newly superseding decision rather than rewriting history as though the old policy had always allowed omissions.
On acceptance, record one repository-native ADR identifying the exact superseded full-PR clauses, owner/approver, control assumptions, chosen alternatives, evidence and rollback; link to this dossier rather than duplicating a large template.
The Java bundle is a narrow cross-run development-reference exception, not permission to reuse a release candidate or enable broad caches.
Unrelated stale policy text or tool upgrades are separate findings, not an invitation to rewrite the entire specification.

### Decision status and risk register

All statuses below are proposal-stage dispositions after synthesis, not approval or completed mitigation.

| Decision | Current disposition                               | Activation dependency                                                                        |
| -------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| DEC-001  | Experimental; observation recommended             | Useful safe exclusions, base-anchored proof, monotonicity and independent control authority. |
| DEC-002  | Required contract if selective checking activates | Complete v2 state machine, main qualification writer and negative migration/retention tests. |
| DEC-003  | Experimental build-product reuse                  | Native closure/toolchain, portability, environmental policy and rights evidence.             |
| DEC-004  | Conditional on DEC-003                            | Trusted hosted transport, bounded admission/race checks, available seed and fresh fallback.  |
| DEC-005  | Recommended first bounded change                  | Owner implementation acceptance and isolated no-installation proof.                          |
| DEC-006  | Required governance consequence                   | Exact policy acceptance and atomic corresponding controls; no implied settings authority.    |

Use a compact risk register rather than unsupported probability scores or claimed residual reductions.
Each risk remains open until its linked evidence is retained and the accountable owner accepts its disposition.

| Risk      | Event and linked control                                                                                                       | Responsible role and response                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| R-SEL-01  | Relevant check omitted; conservative input model, QA-002/009/010.                                                              | Implementer and independent verifier; disable affected selection and freshly qualify admitted candidates. |
| R-SEL-02  | Candidate disables its own gate; accepted bootstrap/review boundary, QA-012.                                                   | Owner and security reviewer; block activation until enforcement is demonstrated.                          |
| R-EVD-01  | Wrong/stale/indirect original proof accepted; exact-base lineage, QA-004/011/014.                                              | Implementer and independent verifier; execute on early loss, reject late invalid coverage.                |
| R-JAVA-01 | Wrong or tampered executable reference; main-only authenticated producer, QA-005/007.                                          | Security reviewer and operator; reject before class loading, retain counterevidence, build fresh.         |
| R-JAVA-02 | Key omits an outcome-changing input; native closure and environment policy, QA-006/013.                                        | Java-oracle verifier; keep conservative invalidation or rebuild.                                          |
| R-JAVA-03 | Irrelevant image changes defeat reuse; separated provenance and measured qualified equivalence, QA-013.                        | Implementer and maintainer; refine only proven equivalence or retire reuse.                               |
| R-OPS-01  | Service outage/rerun race or endless seeding; bounded lookup/readback, QA-007/014.                                             | Operator; fresh fallback, inspect stable miss/seed reason codes.                                          |
| R-COMP-01 | Retained JAR closure lacks redistribution clearance; full rights gate.                                                         | Owner and rights reviewer; prohibit public producer upload.                                               |
| R-WEB-01  | Consumer graph drifts despite unchanged files; native preparation, QA-009.                                                     | Consumer verifier; keep WebVOWL unconditional if equivalence cannot be established cheaply.               |
| R-PERF-01 | Overhead/storage/maintenance exceeds benefit; representative outcome and retention measurements.                               | Owner and maintainer; do not activate or decommission the losing optimization.                            |
| R-PROC-01 | Missing reviewer/operator or unmaintainable assurance controls; explicit responsibilities and one coherent schema/input model. | Owner; fill the evidence/ownership gap, not a synthetic approval.                                         |

## Implementation slices and proof

File names below are architectural predictions, not promised line numbers or an instruction to implement every suggested module.
Prefer cohesive extension of existing modules over a parallel CI framework.
The implementing task is the integration owner.
Shared policy/receipt changes are sequential; independent read-only research or tests may be parallelized when authorized, but coupled workflow writers must not work independently.

| Slice                                                  | Traceability                                                                                                     | Demonstrable result and proof                                                                                                                                                                                                                                                                                       | Delivery and recovery                                                                                                                                                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SLICE-001 Lean dependency review                       | REQ-005/006; AC-005/006; QA-004; DEC-005                                                                         | Remove only its installation; prove npm-invoked entry points and the unchanged runner record without repository dependencies. A non-built-in import must fail the isolated negative fixture. Preserve the pinned review Action and thresholds.                                                                      | Small independently deliverable slice; restore installation if an actual dependency is discovered.                                                                                                               |
| SLICE-002 Applicability in observation mode            | REQ-001/002/007/008; AC-001/002/007/008; QA-001/002/003/009/010/011/012; DEC-001/002                             | Inventory complete inputs, approved exclusions and base-control imports; report preliminary/final decisions while executing all checks. Exercise typed states, exact-base lookup, direct proof, bounded failures and candidate-control attacks. Collect representative workload and preparation overhead evidence.  | No omissions or new acceptance meaning. Observation can be disabled without changing coverage; unresolved enforcement blocks SLICE-003 activation, not observation.                                              |
| SLICE-003 Selective qualification with honest receipts | REQ-001/002/003/006/008; AC-001/002/003/006/008; QA-001/002/003/004/007/008/009/010/011/012/014; DEC-001/002/006 | Introduce coordinated v2 writers/readers, landed-main qualification, aggregate coverage and policy controls. Prove the independently enforceable bootstrap. Activate only justified per-check omissions, explicit Java test accounting and, if viable, native WebVOWL input preparation.                            | A FULL-only v2 milestone may land before omissions. First control-changing PR runs full; unsupported evidence runs full. WebVOWL can remain unconditional.                                                       |
| SLICE-004 Portable verified Java bundle                | REQ-004/006; AC-004/006; QA-005/006/013; DEC-003                                                                 | Establish native graph/recipe and rights; prototype Maven-native classpath substitution before residual relocation logic. Validate a closed bundle in a second location with empty Maven home and real oracle probes. Classify environment inputs; cross-image reuse requires its own qualified equivalence policy. | Local experiment before public upload or cross-run consumption; exact-image invalidation remains valid if cross-image equivalence is unproved. Existing fresh builds remain intact.                              |
| SLICE-005 Trusted Java reuse and cold seeding          | REQ-002/003/004/006/007; AC-002/003/004/006/007; QA-004/005/006/007/008/013/014; DEC-003/004                     | Add trusted-main producer, exact-ID consumer, bounded race-safe admission and re-evaluated seed condition. Prove a warm source-changing PR avoids upstream compilation but performs comparisons; exercise interrupted and concurrent seeds, expiration and misses.                                                  | Depends on SLICE-004 and the necessary shared receipt/seed contract, not selective-check activation. Deliver with full behavioral qualification if omission is deferred; disable reference reuse independently.  |
| SLICE-006 Hosted acceptance and operational handoff    | All applicable requirements, acceptance criteria and QA scenarios                                                | Before each affected activation, qualify eligible/ineligible PRs, normal merges, cold/warm artifacts, unavailable proof and the actual control boundary. Retain comparable multi-run measurements, storage/maintenance assessment and owner disposition.                                                            | This is a recurring acceptance gate for independently delivered slices, followed by a final handoff, not evidence postponed until every optimization is active. Deferred experiments remain explicitly deferred. |

### Likely implementation seams

- `.github/workflows/ci.yml`: trusted-base bootstrap invocation, preambles, conditional expensive steps, exact artifact transport, producer conditions and machine-readable outputs.
  Independent enforcement of that invocation is an accepted control prerequisite, not something this candidate-controlled file can establish by itself.
- `scripts/ci-verification.mjs` and `scripts/ci-verification-command.mjs`: typed v2 receipts, bounded exact-base qualification lookup, landed-main record, direct original executed evidence and main reuse.
- `scripts/require-job-success.mjs`: strict coverage-aware aggregation while retaining the release inventory's existing meaning.
- A small applicability module, likely `scripts/ci-check-applicability.mjs`, with colocated Jest tests; a single explicit input-policy record if configuration is clearer than code.
- `scripts/workflow-governance.mjs` and its tests: narrowly allowed conditions/permissions/artifact paths, precise transport exceptions, unchanged security/release rules and negative workflow mutations.
- `util/owlapi-reference/qualification-workflow.test.js`, existing live-oracle tests and reference launcher boundary: explicit live-test execution and relocated verified classpath.
- A cohesive reference-artifact module, likely under `util/owlapi-reference/`, plus a schema, native-generated build-input inventory and explicit compatibility policy; reuse existing Ajv/native validation where appropriate.
- Existing candidate preparation/output boundary: expose and verify the current tarball digest for WebVOWL applicability without duplicating npm packing rules.
- `scripts/qualify-webvowl-consumer.mjs`: separate reusable native input preparation from expensive qualification only where the observed dependency graph and existing consumer contract can be preserved; keep release invocations unconditional.
- This plan's named governing documents and `util/owlapi-reference/README.md`; no package public API or external consumer source changes.

Deliver `SLICE-001` first.
Once implementation is authorized, `SLICE-002` observation and `SLICE-004` reference experiments may progress independently.
`SLICE-003` omission activation depends on observation evidence, accepted policy, the coordinated receipt transition and independently enforced control authority.
`SLICE-005` depends on the qualified bundle and the shared receipt/seed integration contract, which can be delivered in FULL-only mode; it does not wait for selective checking or WebVOWL omission to become worthwhile.
Apply the relevant `SLICE-006` hosted acceptance before each activation, then complete the operational handoff for the features actually delivered.
Do not postpone main-record or seed consequences until after the corresponding optimization is enabled.
If an experiment cannot justify safe reuse, retain its full path and record that part as deferred or rejected rather than weakening its gates or claiming all six slices complete.

## Verification strategy and ownership

Repository-owned requirements and deliberately authored adversarial fixtures define expected applicability; expected results must not be calculated using the selector under test.
Use temporary real Git repositories for tree, filename, rename, missing-history and merge-parent cases.
Use the actual native package builder to establish tarball inputs/equality, not a hand-maintained reimplementation of npm's file-selection rules.
Mock only genuine external boundaries such as GitHub API responses/transport failures in unit tests; qualify successful transport and event behavior on hosted Actions.
The pinned Java implementation and fixed real ontology fixtures remain the independent behavioral oracle.

Focused development checks include the existing CI-verification, aggregate and workflow-governance Jest suites plus newly added applicability/reference-artifact suites.
Run the affected Java launcher/workflow tests, native workflow syntax check, targeted ESLint and the repository's authored-Markdown formatter/linter.
Test workflow mutations that remove required outputs, broaden artifact lookup, change permissions, suppress selected Java tests or allow ignored failures.
Test rejected schema versions, rerun races, failure followed by older successful evidence, fork origins and deleted evidence.

Add deterministic generated change-set tests in the existing Jest tooling; no property-testing dependency is assumed.
Use independently authored expected outcomes to prove monotonic selection as relevant or unknown inputs are added, proof is removed, or controls change.
Reordering or repeating identical change records must not change the decision; incomplete/truncated history must never reduce execution.
Exercise the entire typed-state table, bounded enumeration and total deadlines, exact-base rejection, direct-pointer flattening, cycles and invalid original attempts.
Test proof loss both early enough to execute and too late for repair, when the aggregate must fail.
The production selector's own fingerprint is not an independent oracle for these tests.

Hosted acceptance must demonstrate the actual enforced response to a candidate removing/replacing the bootstrap or aggregate, not merely a mutable governance test that expects them to exist.
Read back the applicable rules and obtain the required review of the exact control revision, including bypass treatment.
If only observation or Java materialization is being delivered, state which selective-enforcement claims remain unqualified and keep omission disabled.
Name actual independent verifier, scoped security reviewer and operator in retained evidence before their dependent activation; this plan does not launch reviews or assign an unselected provider.

The HISEW profiles inspected for this worktree are:

| Profile    | Actual registered commands                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `focused`  | `test:boundary`; Jest for `governance.test.js` and `io/io.test.js`.                                                                                       |
| `affected` | `lint`; `test:boundary`; Jest over governance, IO/model/storage, import-closure and WebVOWL cutover paths.                                                |
| `full`     | `lint`; `format:check`; `verify:release-gates`; `verify:workflow-governance`; `test:boundary`; complete default Jest command with `--runInBand --silent`. |

The focused/affected profiles are not CI-selector-specific, and none declares verified path coverage.
Use targeted tests for rapid feedback without pretending they replace the final R2 profile.
The full profile does not provision the live Java reference, run actionlint or prove hosted workflow behavior; those are explicit supplemental obligations.
Do not reconfigure profiles merely to make this task easier or call local optional-Java skips live qualification.

Before final assurance, complete formatting, cheap static checks, schema work, review corrections and the exact candidate preparation/staging route.
Use HISEW's canonical governed full run once for the frozen implementation, rather than first duplicating it manually solely to obtain a later receipt.
Independent verification and the required scoped native security assessment remain separate justified obligations.
An edit after verification needs an input-impact decision and fresh affected evidence; never relabel a receipt against changed bytes.
The planning document itself needs only its scoped prose/format/diff checks; it is not an implemented or verified optimization.

## Rollout and observability

Deliver the isolated installation removal first; activate observation-only classification with the full path preserved.
Retain finite local Git fixtures for the edge cases and use authorized hosted runs to validate the actual event, condition and artifact boundaries.
Enable selective execution only after accepting the input inventory, exact-base proof, independent control arrangement, typed schema/aggregate transition and comparative outcome evidence.
Enable Java reuse independently, only after closure, relocation, rights, environmental policy, trust, cold-seeding and comparative qualification.
WebVOWL remains unconditional unless its native input-preparation cost leaves a useful measured benefit and its resolved graph is demonstrably covered.

Record compact existing job summaries, not a new telemetry service:

- Check name, policy/input fingerprint, captured base/head/tested tree, preliminary/final applicability, execution outcome, proof state and stable reason code.
- Current candidate tarball digest, base qualification and direct original executed proof run/attempt/artifact when a check is omitted.
- Java `BUILT` or `RESTORED` result, exact build key, producer run/artifact identity and miss reason.
- Aggregate execution mode and, for main reuse, original qualification mode.
- Observed time to required-green, merge elapsed time, runner work, lookup/preparation/restore/validation overhead and cold-seeding cost where available.

Specify stable reason codes for aggregation, such as `INPUT_CHANGED`, `UNKNOWN_INPUT`, `CONTROL_CHANGED`, `BASE_PROOF_MISSING`, `ORIGINAL_PROOF_INVALID`, `ENVIRONMENT_UNPROVEN`, `REFERENCE_MISS`, `TRANSPORT_UNAVAILABLE` and `LOOKUP_LIMIT_EXCEEDED`.
Reasons explain typed decisions; they cannot replace proof or override a failed check.

Before enabling the complex optimizations, retain a bounded comparative outcome report from existing run/job records:

- Describe the observation period, sample size, PR/change distribution and opportunities: informational-only, shipped documentation, source, dependencies, policy/control, Java and consumer inputs.
  Do not extrapolate a documentation-only hit rate to all PRs.
- Compare time from the relevant PR event to `CI / required` green, including p50/p95 where the sample supports them; separate queue delay and execution, and identify the actual workflow critical path.
  Label small-sample percentiles as descriptive, not reliable tail estimates.
- Separate passed, failed, cancelled and rerun attempts, cold/warm states and changed environments.
  Compare similar workloads, and disclose differences that prevent a causal speedup claim.
- Measure total PR-plus-main runner work, applicability lookup and native graph preparation, bundle transfer/validation and cold-seed work. Report eligible/hit/miss ratios with denominators and stable fallback/seed reasons; account for concurrent or interrupted seeding.
- Measure artifact sizes, retained generations and retention duration, including receipt/original-proof dependencies and Java bundles.
  Estimate storage byte-days or GB-hours under the proposed policy and record the owner's approved storage budget; do not claim a verified monetary saving without account-specific billing evidence.
- Record the maintainer, review/maintenance burden and observed failure-handling complexity.
  Reuse summaries and native records for the report; add no dashboard or new analytics service without a demonstrated need and separate scope decision.

The owner or designated CI maintainer observes initial delivered runs and reviews any unexpected omissions, identity failures or disproportionate overhead.
Before each complex optimization activates, the owner records why its measured feedback/work reduction justifies all overhead, retained storage and continuing assurance burden, or defers it.
Do not manufacture a numerical savings requirement or use a universal percentage threshold; a pre-existing performance SLO, if identified, remains binding.
This comparative decision does not turn the small, independently proven installation removal into an unrelated performance campaign.
If useful safe exclusions are negligible, native consumer preparation consumes the benefit, or transfer/validation and cold seeding erase Java build savings, keep that feature disabled and reconsider its design.

## Abort and recovery

Abort activation on any false-negative selection, unproved omission, changed security/release authority, ambiguous Java closure, unresolved bundle rights, failed relocation or inability to prove the original producer.
Treat an integrity anomaly as reportable counterevidence even when a fresh fallback succeeds.
After activation, any false-negative omission requires disabling the affected selector, identifying candidates admitted under the defective policy and obtaining fresh full qualification and owner disposition for them.
Rollback restores future coverage; it is not evidence that an earlier untested merge was safe.

The normal operational recovery is to require all integrations and rebuild Java from the pinned source.
Implement one explicit policy control for each optimization; changes disabling either must themselves force full qualification and invalidate affected receipts.
Do not offer a PR-controlled bypass that suppresses required work.
If the invoked trusted selector or policy is broken, the top-level strategy defaults to full execution; the independent control arrangement must handle removal of that invocation itself.
If the aggregate cannot validate evidence, it must not report success.
Reassess or decommission an optimization when repeated misses, preparation/transport overhead, maintenance burden or retained storage exceed its owner-approved rationale/budget.
Disable only the affected mechanism through the reviewed policy control; retain the useful installation removal and any independently qualified optimization.

Preserve receipts, manifests and failure logs through their retention period.
Remove only task-owned temporary fixture/build/restoration directories after their required evidence is retained.
Do not delete existing provenance, shared caches, user worktrees, HISEW records or artifacts to make acceptance appear complete.
There is no receipt backfill or artifact migration; older formats and missing artifacts take the full path.

## Prerequisites and replanning conditions

Before implementation, the owner must accept this bounded R2 scope and the applicable changes to CI meaning.
The following work then settles outstanding design hypotheses before the dependent feature activates; none blocks unrelated approved observation or bounded experiments:

1. Refresh actual repository controls, choose the enforceable selector/aggregate authority and assign verifier, security reviewer, rights reviewer where needed, and operator.
   If new settings or workflow authority are required, obtain separate approval; otherwise selective activation stays blocked.
2. Trace the complete readers of proposed exclusions and compare native package contents.
   Establish useful exact exclusion inventories, independent monotonicity tests and a representative opportunity baseline, or keep integration execution full.
3. Demonstrate the typed v2 transition, exact-base main qualification bootstrap, direct original proofs over successive selective PRs, bounded lookups and retention/rerun races.
   Prove an equivalent ordinary merge reuses valid coverage and cannot manufacture an original execution.
4. Generate the Java effective build/runtime inventory, inspect mutable coordinates and record complete toolchain/environment identities.
   Close floating resolution without changing the semantic oracle; retain exact-image invalidation unless a separately qualified equivalence policy justifies its removal.
5. Prototype native Maven classpath substitution, then qualify the closed bundle in a second directory with an empty Maven home, actual oracle and timestamp/native-library/platform assumptions.
   Verify residual relocation and classpath order rather than assume the native option solves them.
6. Inspect all redistributed JAR/license/notice obligations and resolve owner/qualified-reviewer decisions before uploading.
   Accept measured artifact size, generation count, retention and operational responsibility before hosted activation.
7. Demonstrate cold, warm, interrupted, concurrent and expired Java seed sequences as well as normal merges.
   Measure complete PR-plus-main work and required-green latency so build reuse does not merely move or multiply the cost; it may proceed with full behavioral coverage.
8. Inspect native WebVOWL baseline and candidate installation graphs, including registry-resolved transitive dependencies.
   Prove a cheap preparation boundary that preserves full qualification when selected, or explicitly defer omission and keep this integration unconditional.

Replan if complete input independence or enforceable control authority cannot be established, the latest relevant toolchain is incompatible, the Java artifact requires a wider license/deployment decision, native artifact APIs cannot prove identity within bounds, a new workflow/privilege is needed, or observed benefit cannot justify system-level cost and maintenance.
These are bounded activation gates with named consequences, not claims of completed research, runtime proof or owner approval.
