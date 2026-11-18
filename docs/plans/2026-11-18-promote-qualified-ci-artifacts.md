# Promote qualified OwlAPI packages from CI to release

**Draft for owner review · 18 November 2026 · R2 release controls.**
Build and test one OwlAPI tarball on a deliberate PR.
After a normal merge, release that tarball if protected main independently establishes its origin, equivalent inputs and all outstanding release obligations.
Keep the expensive product lanes idle on this path.
If the proof is insufficient, tell the operator exactly what expired, changed or failed before starting another matrix.

This is the next increment of the [13 November migration](2026-11-13-github-actions-migration.md), on top of its implementation on `zero-one-zero`.
That plan's channel decisions and the [stable release roadmap](2026-10-29-0.1.0-release-reconciliation.md) control product and support acceptance.
The owner is Maksym Shostak.
The owner confirmed three implementation decisions for this plan.

1. After qualification, the owner's signature binds the exact package version, channel, manifest digest and tarball digest.
   A release-specific enabling commit is unnecessary.
   The repository owns the default-deny policy and emergency stop.
2. Read-only eligibility checks run before environment approval.
   The protected npm writer rechecks the authorized candidate after approval.
   The owner later approves the verified private stage through interactive npm authentication.
3. Before enabling artifact cleanup, demonstrate that the original release verifier can recover the required evidence from the signed checkpoint with the Actions copies unavailable.
   Retain any copy the verifier still needs.
   Continue the existing checks on the encrypted off-platform backup.

Other proposed changes retain their stated review and cutover conditions.
This document grants no publication, settings, deletion or implementation authority.

## Starting point

| Inspected on 18 November                                                                                                                                                                                                        | What an implementer can rely on                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OwlAPI topic revision](https://github.com/Hadden-Industries/owlapi/tree/3191b95a884fdc4567719d411a8387a9d2b87efd) and [remote main](https://github.com/Hadden-Industries/owlapi/tree/c9b831074dcbdcac75f45e22d449b74d7af0773a) | Build on the topic implementation, including shared candidate production, the staged writer and its recovery repairs. Recheck the landing tree. In-progress ScanCode, rights and development-tool edits in the checkout have separate ownership and are outside this baseline.                                                                                                                                                                                                  |
| [Existing CI lineage](../adr/0011-full-ci-qualification-lineage.md) and [main run 42682667831](https://github.com/Hadden-Industries/owlapi/actions/runs/42682667831)                                                            | Main already has a successful example with three green jobs and twenty skipped. The topic workflow records schema-6 PR and main receipts, verifies original producing attempts, and tolerates incidental collector image updates while retaining original host evidence. This historical run does not qualify the topic tree.                                                                                                                                                   |
| [Current release workflow](../../.github/workflows/release.yml) and [manifest recorder](../../scripts/release-qualification-manifest.mjs)                                                                                       | The ordinary graph builds another candidate, runs portability, browser, Java, OWL and installed lanes, and adds release-specific third-party evidence. The aggregate creates a schema-1 manifest from its own run and downloads a same-run candidate. The dispatch currently defaults both `qualification_only` and `rc3_recovery` to false.                                                                                                                                    |
| [Staging](../../scripts/staged-release.mjs) and [sealing](../../scripts/staged-release-followup.mjs)                                                                                                                            | `originalManifest` authenticates the release run, then locates the candidate under that same workflow, run and attempt. The staging YAML downloads from the qualification run. Seal iterates the public matrix using the operation attempt for each lane and requires original qualification ZIPs in the reviewed public inventory. Changing the producer alone would break these consumers.                                                                                    |
| [Hosted rules](https://github.com/Hadden-Industries/owlapi/rules) and [release inventory](https://github.com/Hadden-Industries/owlapi/releases)                                                                                 | Readback showed strict `CI / required` from app 15368, managed CodeQL, read-only default workflow token, immutable releases enabled and 90-day artifact/log retention. The two listed environments were `npm-release` and `release-manual`, both with reviewer and protected-branch rules. Neither the proposed `npm-tags` environment nor coverage of the history namespace appeared in the inspected inventories. Verify npm publisher permissions with the owner at cutover. |
| [Current support record](../release/support-designation.json) and [publication control](../release/publication-control.json)                                                                                                    | Public npm `latest` and `next` resolved to `0.1.0-rc.3`. GitHub listed RC1–RC3 as published prereleases and the unscoped alpha as a draft. The recorded direct OIDC approval identifies exact rc.3 bytes. A signed historical exception or a draft's age cannot settle a successor or justify deleting the draft.                                                                                                                                                               |

The design uses the sibling HISEW [planning skill](https://github.com/Hadden-Industries/software-engineering-workflow/blob/9f9a409ac498246b02d45fda26751823c6c932e2/skills/hadden-industries-plan-software-change/SKILL.md), its implementation guidance and its engineering, architecture and resource principles at that revision.
The verification and cutover below fit the existing R2 route.
Use the same maintainer, runbook, native records and repository test runners.

## What transfers from the two releases

The [four-week donor hardening audit](#four-week-donor-hardening-audit) maps the underlying fixes and their failure cases to the delivery slices.

| Observed donor result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Consequence for OwlAPI                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown Quality [unexpected fresh matrix](https://github.com/Hadden-Industries/markdown-quality/actions/runs/43900658316) and [successful reuse](https://github.com/Hadden-Industries/markdown-quality/actions/runs/43917797156). Its [reuse implementation](https://github.com/Hadden-Industries/markdown-quality/blob/cc3d8f70eb8a1f8218cc2393dc23d44f82b55d2b/scripts/release-reuse.js) admits original bytes.                                                                                                                      | Give the release dispatch an explicit choice. A collector image rebuild can be harmless for an already qualified functional result. A changed browser, JDK, Maven input, corpus, Node lane or benchmark protocol requires evaluation by that gate's owner.                    |
| Markdown Quality [archive run 43971573004](https://github.com/Hadden-Industries/markdown-quality/actions/runs/43971573004) finished green with both archive and completion skipped. [Bootstrap repair](https://github.com/Hadden-Industries/markdown-quality/commit/b002b7a) addressed a read-only registry failure before the matrix.                                                                                                                                                                                                  | Model expected jobs by selected operation, assert their actual results, and check pinned tools before their first consumer. Preserve OwlAPI's bundled artifact action, which has its own distribution.                                                                        |
| JSON Quality's [CI promotion policy and 90-day custody decision](https://github.com/Hadden-Industries/json-quality/blob/5b9504011f7248902e517197f5b866154867f681/docs/plans/2026-11-17-markdown-quality-release-parity-implementation-plan.md) and [candidate retention implementation](https://github.com/Hadden-Industries/json-quality/blob/5b9504011f7248902e517197f5b866154867f681/scripts/candidate-retention.js)                                                                                                                 | Authenticate the newest complete candidate before retiring a predecessor. Protect every live release and diagnostic reader. OwlAPI has one package, three recipient platforms, scoped and alias installs, and separate legal custody.                                         |
| JSON Quality fixed [promoted identities in attestation](https://github.com/Hadden-Industries/json-quality/commit/bbc0cdd), [incomplete frozen inputs](https://github.com/Hadden-Industries/json-quality/commit/3bdcb9e), [named upload receipts](https://github.com/Hadden-Industries/json-quality/commit/1ee3734) and [archive asset IDs](https://github.com/Hadden-Industries/json-quality/commit/1ed6479) during 1.0.2. Its [final promotion](https://github.com/Hadden-Industries/json-quality/actions/runs/44105042092) succeeded. | Exercise the executable chain through native readback, archive and signed recovery. Keep original failure, request acknowledgement, content digest and provider ID as separate facts. A digest agrees on content. An ID also identifies an asset when both records claim one. |
| JSON Quality [post-release hardening](https://github.com/Hadden-Industries/json-quality/commit/5b9504011f7248902e517197f5b866154867f681) and Markdown Quality [cold continuation rehearsal](https://github.com/Hadden-Industries/markdown-quality/commit/2e6dc07)                                                                                                                                                                                                                                                                       | Locally simulate cold startup and interruptions before another live publication. A successful writer followed by skipped verification is unresolved. Port the test cases into OwlAPI's own controllers and workflow validator.                                                |

## Decisions and acceptance boundaries

### Which repository should OwlAPI follow?

The comparison below explains the amendments to the 13 November migration, including the three owner decisions above.
Existing release controls apply until their replacements pass the relevant cutover checks.
The comparison uses the three revisions above.
A donor's successful release establishes one working path.
It cannot establish which checks detect an OwlAPI regression.

| Decision                                  | What differs and why it matters                                                                                                                                                                                                                                                                                                                                                             | Proposed disposition                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release qualification on a reuse miss     | Both donors offer read-only qualification, but Markdown Quality documents automatic fresh fallback while JSON Quality requires a separate explicit request. OwlAPI's general release workflow can reach legacy writers and normally builds again.                                                                                                                                           | Adopt JSON Quality's refusal on a miss. Make the ordinary entry structurally read-only, with an explicit fresh option. A rerun with omitted inputs must have no route to a credentialed job. See slices 001–002 and 007.                                                                                                                                                               |
| Product and security coverage             | The donors qualify two native x64 packages alongside their core package. OwlAPI ships one package and claims macOS arm64, browser behavior, npm alias compatibility and parity with Java OWLAPI. JSON Quality builds native code in its explicit CodeQL workflow. Markdown Quality exercises a custom CodeQL model. OwlAPI already consumes managed CodeQL for its two required categories. | Keep the three-platform consumer contract, Java comparisons and installed OWL tests. Reuse completed product results over the exact bytes. Keep managed scanning while it satisfies the effective policy. A stale or newly required query calls for current security evidence. Run a second product matrix only if a product input changed or qualification is otherwise insufficient. |
| ScanCode and weekly checks                | The 32 release shards partition one rights-evidence acquisition. Their count does not define legal completeness. OwlAPI's weekly health job exercises installed recipients, while its separate scheduled extended job runs Jest before printing four fixed unavailable-provider observations.                                                                                               | Tune shard count only against identical input inventory, normalized findings, completeness, provider limits and measured runtime. Keep manual two-OS parity. Move the fixed observations into the existing weekly health summary and remove their separate scheduled product run. See slice 003.                                                                                       |
| Review before npm submission              | JSON Quality performs read-only admission before the protected writer. OwlAPI places both its read-only stage admission and its writer behind environments, in addition to signed intent and interactive npm approval. The checkout also requires a committed version-specific publication switch.                                                                                          | Move pure admission before the environment wait. Keep signed review of exact bytes, the protected npm writer and interactive approval of the exact stage. Separate lasting release policy from an owner's decision on a particular manifest. See slice 004.                                                                                                                            |
| Timing of the signed tag and GitHub draft | The donors can sign the landed tag before staging. OwlAPI can detect a defective private tarball before it consumes the permanent version tag. A wrong tarball discovered after signing can require abandoning that version.                                                                                                                                                                | Keep OwlAPI's late-tag rule. Qualify and privately stage first, check the downloaded bytes, sign the landed commit, verify the draft, then approve the same stage ID. Keep one package approval and the existing RC, stable and preview-line rules.                                                                                                                                    |
| One-shot writers and read-only retries    | The donors reserve writer executions and support different continuations by phase. GitHub can rerun a job under the original SHA and increment the attempt. That alone says nothing about whether npm received an earlier request. OwlAPI's single package has no native-to-core continuation.                                                                                              | Keep attempt-one reservations for new stage and channel writes. Permit independent read-only recovery from any authenticated original attempt. Extend first-write accounting to GitHub draft creation where the release ID is initially unknown. See slices 004–005.                                                                                                                   |
| Release queue                             | JSON Quality shares a mutation group even with its qualification dispatch. Markdown Quality's separate qualification entry has no such workflow group. OwlAPI serializes public recipient tests and legacy-capable qualification in the same queue as mutations, although its independent completion reader already operates outside it.                                                    | Keep one non-cancelling queue for operations that change npm or GitHub. Move proven read-only qualification and public recipient verification out after proving input custody and preimage checks. An owner waiting on npm can outlive any Actions queue. See slices 002 and 005.                                                                                                      |
| Artifact transport and custody            | Markdown Quality uses the upstream upload action for several ordinary handoffs. JSON Quality uses its named-evidence wrapper for recoverable transfers. OwlAPI introduced a bundled SDK action after losing a real upload-finalization response. Applying its entire recovery protocol to weekly human diagnostics adds dependencies and storage without helping release recovery.          | Remove uploads with no byte reader first. Prefer native job output or logs for routine observations. Keep the bounded wrapper for ambiguous finalization, exact-original selection or verified multi-attempt collection when a real reader needs it. Require a replay demonstration before replacing existing custody. See slice 006.                                                  |

The relevant source comparisons are the donor qualification and operator contracts, OwlAPI's staged runbook, and the incident that explains its custom transport.
[JSON Quality release qualification](https://github.com/Hadden-Industries/json-quality/blob/5b9504011f7248902e517197f5b866154867f681/docs/release-operations.md) · [Markdown Quality release qualification](https://github.com/Hadden-Industries/markdown-quality/blob/cc3d8f70eb8a1f8218cc2393dc23d44f82b55d2b/docs/release-operations.md) · [OwlAPI staged operations](../release/staged-operations.md) · [OwlAPI transport incident and recovery](../release/artifact-transport.md)

### Decisions for implementation

1. **D1 · Keep four identities explicit.**
   The original FULL producer owns the built bytes, tested SHA/tree, workflow, run and producing attempt.
   The main record owns equivalence to the landed source and the signed version tag targets that source.
   A protected release dispatch owns current qualification and its manifest.
   Each writer owns its actual controller SHA, job, attempt and effect.
   Prove equality where required and record the relation where the values differ.
   Preserve original fields through CLI, subprocess, attestation, ZIP, signed history and public provenance.
   A same-content merge does not authorize changing an attested build SHA.
2. **D2 · Require reuse on the ordinary release route.**
   Resolve an exact protected-main subject before expensive jobs.
   Missing, stale or inconsistent evidence stops with a reason.
   A separate explicit fresh **read-only** request can run the complete qualification.
   Both routes stop on a failed current release obligation.
   Keep the main push's current automatic full fallback during migration.
   Move to observer plus explicit manual full CI only after the hosted cutover demonstrations in SLICE-007 and the owner's acceptance under the November migration.
   The maintained PR trigger remains `ready_for_review` and the required check remains `CI / required`.
3. **D3 · Preserve OwlAPI's qualification floor.**
   The runtime policy freezes minimum, latest released patch and distinct reference per supported Node family (currently 22, 24 and 26), across Linux x64, Windows x64 / VS 2026 and macOS arm64.
   Producer and consumer npm have different pins.
   Require browser Chromium, Firefox and WebKit, installed OWL contracts, public exports, scoped install and native npm alias, locked/lockless production graphs, SBOM, README examples, Java differential evidence and the pinned July ontology files.
   Preserve the exact JDK/reference/harness, independent tests and reviewed benchmark disposition.
   [Java build reuse](../adr/0012-gated-native-java-reference-reuse.md) and selective test omission have their own disabled policies.
   Accepting a completed equivalent FULL verdict does not enable either optimization.
   Downstream Universal Ontology and WebVOWL adoption remain their owners' decisions.
4. **D4 · Refresh mutable claims.**
   Retain original audits, scans and legal evidence.
   At release, evaluate current applicable advisories against the exact reviewed locks/recipient graphs, current protected-main managed CodeQL policy and both analysis categories, and the existing rights, ScanCode and benchmark obligations.
   The product CI receipt alone cannot satisfy those gates.
   Public registry identity, signatures, provenance, recipient installs and classification require new observations after the owner approves the stage.
5. **D5 · Preserve one-package staged publishing and channel policy.**
   Default to `pilot`, allow an expressly reviewed `latest` even for an RC, and keep RC GitHub releases prereleases.
   Stable-on-pilot promotion changes npm then GitHub classification on the original ID.
   Direct stable `latest` can change the npm default at approval even if later public verification fails.
   Keep the supported RC on `next` before first stable, then apply the existing preview-line, withdrawal and separate stale-tag retirement rules.
   Add explicit pilot retirement to slice 5 as a separate owner-authorized operation after stable verification.
   `package.json`, `scripts/package-identity.mjs`, the version projector and signed owner decision govern different facts.
   Keep publish-ready README/notes at pack time and compare the draft body to reviewed notes before sealing.
   The version and its channel are outside this plan's selection.
   [Channel decisions](2026-11-13-github-actions-migration.md#channel-and-support-contract-for-implementation)
6. **D6 · Minimize retained bytes subject to recoverability.**
   For each workflow output, name the reader, the smallest payload it needs and the last point at which it needs it.
   Keep ordinary console output in native job logs, pass small same-run values as job outputs, and upload bytes only to serve an identified reader.
   Recommend the latest fully qualified main candidate for up to 90 days, plus inputs of active or unresolved consumers within native expiry.
   Let that candidate expire naturally if it has no successor.
   Do not renew its lifetime by copying or re-uploading it.
   Keep immutable release assets and signed recovery evidence under their existing custody rules.
   Logs can explain decisions.
   Any exact bytes required by a later verifier need retrievable, digest-bound custody.
   OwlAPI's [transport policy](../release/artifact-transport-policy.json) owns size and time budgets.

Use GitHub's native job/attempt, artifact and release APIs, npm staged publishing/OIDC and existing pinned repository tools.
GitHub documents skip propagation through job dependencies and immutable tag/asset behavior. npm separates stage submission from interactive approval and binds publisher permissions to workflow identity.
Keep reviewed full-SHA action pins and the existing isolated transport SDK/rights inventory.
The remaining local problem is determining whether *this* OwlAPI candidate satisfies the independent contracts above.
No new service, cross-repo runtime dependency or copied donor package is needed.
Any future dependency proposal requires a current supported version, license/rights review and validation by its actual consumer.
[Actions syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) · [Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases) · [npm staged publishing](https://docs.npmjs.com/staged-publishing/) · [Trusted publishers](https://docs.npmjs.com/trusted-publishers/)

## Delivery slices

### SLICE-001 · Prove what the existing receipts can release (D1, D3, D4)

Follow one normal merge from `CI / required` through `createVerificationReceipt`, `createMainQualification`, `verifyIntegrationProof` and `verifyBaseQualification` in [CI verification](../../scripts/ci-verification.mjs).
The last operation takes a PR base context and explicitly establishes historical qualification only.
Extract or reuse its exact-main/direct-FULL verification under a genuine release-dispatch context.
Fabricating a push or PR event at the release entry would cross the trust boundary.
Use the commit-associated PR lookup even when GitHub omits `merge_commit_sha`.
Require a unique merged PR with the expected base and head repository IDs and names, default branch, ordered Git parents, head and tree.
Bind the required check to its native App, suite, execution and reviewed workflow revision.
A green fork or a check with the expected display name from another App cannot supply release proof.
Keep [check coverage](../../scripts/ci-check-coverage.mjs) and [required jobs](../../scripts/require-job-success.mjs) as the owners of their verdicts.

Compare the CI and release job commands and inputs, including canonical Java preparation, Windows quality, browsers, OWL and dependency review.
For every release gate identify the exact original output, its producer and consumer, validity key and earliest expiry, or why it must run now.
In particular, CI records candidate ID/digest while the reusable producer separately uploads `package-proof`.
Prove that the original producer returned the correct proof artifact, locked and lockless graphs, SBOM and all three candidate members, including `SHA256SUMS`.
A named ZIP or successful run alone is insufficient.
Preserve the release-only ScanCode acquisition and merge against committed material (32 release shards) wherever no equivalent admissible evidence exists.

**Proof and exit.**
With saved provider inventories and controlled external reads, exercise one full PR with distinct synthetic merge and landed SHAs, one FULL main without a PR origin, and one partial rerun.
In [CI verification tests](../../scripts/ci-verification.test.js), omit the merge field and delay registration of a previously successful native dependency by one jobs-API response.
Require the same original execution after bounded polling across all pages of the original and latest attempt inventories.
A second matching PR, duplicate job, failed dependency or inconsistent page must prevent reuse.
Compare the original runner identity, OS labels, architecture, shell and tool versions with the policy for its lane.
An incidental collector image patch may pass, but a contradictory original host must fail even if the job label matches.
Independently compute the tree/parents and file hashes using Git and native digest tools.
For a squash or changed parent, changed frozen matrix, substituted proof, missing original job, unrelated fork or current main that moved during verification, refuse the promoted result.
Identify which current checks require source beyond tree identity, including packed documentation and source/benchmark identifiers.
If one cannot be bound, run that gate against the original bytes if its owner permits, otherwise require explicit fresh qualification.
Deliver a read-only shadow verdict with the first missing obligation.
Other workflow-contract and recovery work can proceed during this spike.

### SLICE-002 · Admit the original candidate through a read-only release dispatch (D1–D4)

Extend [release qualification](../../.github/workflows/release.yml) and its [manifest owner](../../scripts/release-qualification-manifest.mjs).
Introduce a read-only selector before all expensive fan-out.
Make the safe qualification entry unambiguous even with omitted inputs, reject incompatible fresh/legacy selections before starting jobs, and keep the known alpha/rc.3 routes explicitly scoped while outstanding dispositions are reconciled.
The release resolver looks up the exact main receipt and a **direct FULL** CI producer.
Recheck main, repository ID, event, workflow path/revision, policy, tree and both parents, dependency selectors/locks, matrix, pinned external sources, original host/execution and per-check proof.
Cache only completed original-attempt observations during this admission.
Immediately before writing the selector's outputs, reread the mutable main head and producer run to catch a new attempt or changed head during collection.
Validate all scalar values together before opening `GITHUB_OUTPUT`.
Route a failure to write the output to a failed selector job with no matrix or writer scheduled.
Reject reuse chains, rerun races, expired ZIPs and conflicting artifact metadata.
Read artifacts by exact repository/run/ID, verify the REST digest over received ZIP bytes and verify member names, sizes, SHA-256 and tarball SRI.

Keep the [metadata reader](../../scripts/github-evidence-reader.mjs) redirect-free.
If the binary transport follows a signed download redirect, restrict it to the documented HTTPS storage destination and path and strip the authorization header.
Charge retries, redirects, body reads and extraction to one deadline with separate request, metadata-byte and archive-byte bounds.
Consume the native artifact ID or the reconciled ID established by slice 3.
Test a slow body, a redirect to an unapproved host and a temporary 404 for an acknowledged ID through the release reader.

Introduce a versioned promoted manifest carrying the three candidate member identities, original CI build and per-job attempts, landed subject and main record, release qualification producer, security observation and all referenced proof descriptors.
Schema 1 keeps its exact single-run meaning.
Readers explicitly select a supported schema, reject unknown or incomplete projections, and preserve the original serialized bytes.
A release run may retain its new compact endorsement and fresh evidence.
It must not claim to have produced or re-upload the original CI candidate for convenience.
Prove the reader side before enabling promoted output.
A fresh release still emits evidence that existing same-run readers can validate.

On a reuse hit retain preflight, exact-main and package-scope checks, fresh policy/advisory evaluation, native evidence collection and the terminal verdict.
Check for coordinate or tag conflicts at admission.
The ordinary qualification and first private stage must succeed without a pre-existing successor version tag.
Verify the owner-signed version tag at draft creation after the private check and again where later operations rely on it.
Preserve the accepted severity rules and reviewer responsibilities, including ScanCode and managed CodeQL on landed main (Actions and JavaScript/TypeScript, the newest matching analysis in each category within seven days, the active threshold and open-alert checks).
Reject incomplete or failed latest analyses and recheck the actual controller at staging.
Check frozen locks and manifests before/after disposable npm operations.
Evaluate the complete frozen bundle and recipient graphs, including the original ref, category, scanner, query or model and configuration for each security result.
Keep a missing report, skipped producer or incomplete benchmark protocol distinct from a completed empty result.
Use OwlAPI's own corpus, tolerances, rights inputs and recorded protocol to decide which obligation is still open.
An unavailable advisory service or changed rights disposition blocks admission.
A denied current finding cannot trigger a fresh run to bypass the denial.
Report monetary/time savings only after measurements.

**Proof and exit.**
Execute actual selector and aggregate programs with both schedules.
Successful reuse means zero new packs and zero repeated product, browser, installed-runtime or Java product matrices, one current release verdict and the exact original artifact IDs.
Fresh means every required FULL job succeeds.
A skipped required job, missing source proof or a skipped release-only gate fails.
A deliberately unselected fresh matrix is legal only with admitted FULL evidence.
Test mandatory output-write failure separately from proof unavailability.
Enable the selector in shadow mode until downstream readers in SLICE-004 accept its output.
Use a dedicated read-only workflow, or convert the existing entry once its historical writers are disabled and their workflow-identity readers can still replay original runs.
Keep the main required-check identity stable.
Exercise an omitted-input dispatch and a deliberately fresh qualification while an unrelated release writer is waiting on its environment.
Both reads must finish without acquiring the writer queue, entering a deployment environment or obtaining OIDC or contents-write permissions.
For the managed CodeQL check, exercise an exact subject whose newest analysis failed, a query-policy change, and an expired analysis on otherwise identical bytes.
Keep the existing seven-day freshness ceiling until the security policy owner changes it.
Report the specific missing analysis and accept a qualifying managed refresh for that SHA without repacking.
Switch scanner configuration only for a demonstrated coverage gap and migrate its required results and policy together.
[GitHub code scanning setup types](https://docs.github.com/en/code-security/concepts/code-scanning/setup-types) The current reader also pins ruleset 21687258 and the exact `high_or_higher` configuration.
Keep drift visible and fail closed on an unreviewed replacement.
When an owner approves a stricter policy, update policy selection and open-alert evaluation together.
Test that a newly blocking severity actually denies release under the stronger rule.

### SLICE-003 · Make Actions scheduling and cold tool setup testable (D2–D4)

Remove the duplicate scheduled extended-suite run.
The [status recorder](../../scripts/record-extended-test-status.mjs) uses Node's standard library to print four fixed `NOT_RUN` values and their reasons.
Invoke it once from the weekly maintenance workflow, with its reasons visible even when the health job fails.
Keep the manual evidence acquisition and two-OS comparison in `extended-tests.yml`.
Update `workflow-governance.mjs` and its schedule fixtures so they assert those outcomes and enforce the existing read/write separation.
The [maintenance reporter](../../scripts/report-maintenance-failure.mjs) currently receives only `needs.health.result` and can close the maintenance issue while a consumer lane subsequently fails.
Make the weekly finding cover overall package health by feeding the reporter the completed health, matrix-selection and installed-consumer results.
Use the existing issue and preserve per-attempt deduplication and its isolated token.
Test a successful health job followed by a failed macOS lane and a skipped matrix after cancellation.
Neither may close an outstanding overall-health finding.
Compare a representative rights-evidence acquisition at two shard counts before changing the existing 32.
Require the same subject coverage and findings, complete failed-shard detection and acceptable peak duration and transfer size.
Keep 32 if a smaller partition loses coverage or misses the accepted deadline.
The next maintainer need not perform a new acquisition solely to demonstrate a numerical saving.

Start the ordinary PR path with a cheap check that rejects invalid workflow metadata, version drift and broken source contracts before package or matrix jobs can start.
Trace duplicated steps in `source_portable`, `source_json` and `source_canonical` in both CI and release.
For example, portable and canonical both invoke Jest, while canonical captures the live Java results.
Consolidate formatting or governance checks only where the input, runtime and obligation agree.
Preserve the separate portable run where absence of the Java reference is part of the contract, the inventory of 23 live Java assertions, both behavior profiles against Java OWLAPI 5.5.1, all installed OWL assertions, and the final JSON check after native producers.
Verify the pinned seven-file July acquisition and installed consumer source identities.
Extend the existing local reusable workflows where their inputs agree.
A deliberate bad workflow should fail cheaply, and a Java-only regression must still fail the canonical gate.
Check action SHAs, literal upstream checkout pins and the separate producer and consumer tool selections in that first gate.
Keep dependency update coverage for Actions, root npm, the bundled transport lock and Python tooling.
Keep caller-selected paths inside the reviewed root and reject escaping links or aliases.
PR or external caller code runs read-only.
If a future privileged workflow accepts an external graph, require a non-bypassable protected environment and show the exact repositories, revisions and profiles to the owner before checkout, install or execution.
Measure any new serial dependency against the PR critical path before keeping it.

Extend [workflow governance](../../scripts/workflow-governance.mjs) and its mutation tests.
Retain Actionlint for provider syntax and the repository validator for semantic constraints.
Traverse workflow-to-workflow and local composite calls, including declared checkout roots used by legacy approval jobs.
Validate caller permission ceilings, references, literal input types, conditional roles, deadline containment and absence of cycles.
Follow transitive script invocations and check inherited permissions even for skipped branches.
Apply timeouts where GitHub supports them and pass the remaining operation budget into workers and children.
Keep legitimately conditional `setup-producer` phases (`runtime`, `npm`, `producer`) and separately selected consumer npm.
Verify blocking setup actually dominates **each** npm read, cache probe, installed verifier and write.
A Node-only stdlib check is valid before npm bootstrap.
OwlAPI's reviewed bundled `retain-artifact/dist` runs without installing the whole project graph.
Prove its entry and retained licenses on a clean runner.

Use the bundled native action for upload and reconcile a lost SDK acknowledgement in the [transport tests](../../scripts/artifact-transport.test.js).
Freeze the payload, resolve its literal physical name through the [name codec](../../tooling/artifact-transport/identity.mjs), and match its members and canonical upload digest to a unique native upload or reconciliation step in the original job interval.
An acknowledged ID followed by a 404 gets a bounded read of that ID.
Only confirmed absence permits a new bounded recovery ordinal for the same payload.
An unavailable inventory, lookalike suffix, digest conflict or two matching steps stops recovery.
Include a dotted artifact name and check scratch cleanup after interruption.

For each supported dispatch derive expected jobs from its mode and guarded decision.
Check `needs`, cancellation, step results and original evidence before consuming downloads or declaring completion.
Require actual selected writer success for an ordinary success verdict.
A separate read-only reconciliation may establish observed state after a failed writer.
Keep deliberate skips for the other draft/seal or classification/verify branch.
Gate side effects before the writer and retain any already-created journal on failure when the runner permits.
Cancellation after transmission is an unknown outcome until reconciled.
Preserve the exact historical job/step shapes accepted by `stageFailureSummary` when evolving scheduler checks.

**Proof and exit.**
Mutate real YAML for `if: false`, hidden transfer, missing checkout/setup, hosted npm shadowing, softened failure upload, wrong `needs`, wrong reusable input type and an incorrectly skipped required writer.
Run actual terminal commands for success, skipped, cancelled, failure and the legal unused branch.
Rehearse the normal CLI startup from a clean writer checkout outside the repository dependency tree on the supported host.
Invoke the actual child entry point with hosted Actions variables present but provider I/O isolated.
Test Windows paths containing spaces, percent signs and short aliases as literal arguments, with required caches ready before child startup.
Require the pinned npm at its first registry read and validate the actual JSON shape for each command, rejecting ambiguous results.
Feed real npm scalar JSON, scoped URLs, upload digest forms and recorded native step names into the reader.
A missing module before the handler starts must produce zero new writes and an explicitly unresolved result unless original provider evidence proves no request.
An extra npm install in an OIDC job is not the repair.

### SLICE-004 · Carry one promoted package through stage, draft and owner approval (D1, D4, D5)

Move the read-only `admit` job in `stage-release.yml` outside `release-manual` so an ineligible candidate produces a reason before the owner receives an approval request.
Verify the job can complete without environment secrets, OIDC or write permissions.
After approval in `npm-release`, the writer rechecks the signed intent, manifest and tarball digests, live tag values and freshness before submitting the package.
Preserve the human checkpoints after tag signing and npm approval, including interactive 2FA for the exact privately verified stage ID.
Test a changed tag preimage during that wait.
The admitted job can succeed, but the writer must send zero requests.
Record the initiating and approving identities under OwlAPI's accepted single-custodian policy.
[GitHub environment reviewers](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)

Keep the default-deny policy and emergency stop in the repository, with each package version derived from the existing projector.
The inspected `tooling/artifact-transport/rights-review.json` still has `reviewStatus: PENDING_HUMAN_REVIEW`.
Staging explicitly requires `REVIEWED` for that transport.
Keep that concrete release blocker visible in read-only preflight and leave its disposition with the rights owner.
A donor's successful release or a shorter retention period cannot resolve it.
At present [the projector](../../scripts/project-package-version.mjs) resets the per-version control to `UNRESOLVED`, and staging checks that committed control for `OIDC_STAGED` as well as the signed per-release intent.
For successors, accept the owner's signed decision over the exact coordinate, channel, manifest SHA-256 and tarball SHA-256 after qualification.
Bind rights and benchmark acceptance to their reviewed evidence identities in that decision.
Migrate the schema, staging reader, runbook and projector together so that issuing this signature requires no change to the qualified source.
Keep immutable legacy direct approvals in their historical readers.
Prove a successor can be qualified and then authorized without modifying its source, a revoked or disabled policy still blocks, and an earlier signature cannot authorize a new digest, version or channel.

Change `originalManifest`, stage admission outputs and the stage download's `run-id` together.
Resolve the release manifest under its release run and the package under its actual CI or fresh-release origin.
Verify both at admission and immediately before the one npm request.
Apply the same distinction to the private checker, draft/seal, public recipient, provenance and historical replay readers.
Use the existing owner-reviewed controller delta only for allowed release-control changes.
A different package input or changed allowlist requires requalification or policy review.
Rights and benchmark approval, repository/ref, exact coordinate absence, guarded tags, protected environment and stage-channel intent remain mandatory.

Give the owner one **read-only preflight** from the existing runbook/controller that validates the real dispatch schema, signed reservation, original artifact availability, expiry and expected writer route before spending a run.
Validate names, types and the entire serialized UTF-8 input envelope including escaped characters before reserving a writer.
Pass compact references to signed history.
Reject an oversized or unknown input with zero reservations and zero native writes.
Include fresh authenticated private pending-stage observation for this package when determining whether a first stage is possible.
A public 404 cannot see private stages.
Bind observation time, coordinate, expected pending IDs, scope and digest to the owner decision.
Refresh it after intervening writer activity or stale/invalid timestamps, without reauthorizing different bytes.
Repeat the check after environment approval under the shared mutation queue.
Scope terminal history to its authenticated package, version and manifest.
Account for every active or unexplained writer that can affect the same resource, including a later-dispatched run that finished first.
Require valid non-future inventory observation times newer than all relevant prior writes.
One newer entry cannot compensate for another entry's missing timestamp.
Treat unknown, duplicate or conflicting stages as a reconciliation case.
Keep sensitive inventory and owner credentials out of inputs, logs and public tags.
Supply only disclosure-cleared decision facts/digests through the existing checkpoint mechanism.
Use native staged inventory from the owner session.
Bind the stage workflow to stage permission with direct publishing and tag management disabled.
For the tag workflow npm permits both staging and tag management even with direct publishing disabled.
Limit the controller to approved tag commands and verify its protected main/environment binding.
Test a disallowed stage invocation in the tag-workflow fixture and inspect the actual settings before cutover.
[npm trusted-publisher permissions](https://docs.npmjs.com/trusted-publishers/) Retain OwlAPI's attempt-1-only reservations for stage/labels/classification, including consumed skipped numbers.
Do not generalize a donor rerun permission.

**Proof and exit.**
Start cold with distinct build, landed and repaired controller SHAs.
Stage one scoped tarball, compare downloaded private bytes and native package identity, verify draft ID/three assets and freshly observe guarded labels immediately before owner 2FA per the runbook.
Exercise an import failure before the first journal exists, a lost response, an upload failure after acknowledgement, an already-pending stage and a verified case where no request was sent.
Zero additional submissions after acknowledgement or unknown effect.
In the [staging tests](../../scripts/staged-release.test.js), preserve the original job failure and distinguish no request, unknown effect, acknowledgement and independent verification.
Permit a new attempt-1 reservation only when original native evidence proves no request could have been sent, the writer history is complete and fresh private inventory agrees.
An absent stage after a timeout leaves the effect unknown.
If the request succeeded but retention failed, authenticate the unique original step and interval, recover the original bytes, and verify the exact private stage read-only.
Reject any attempt to spend the original reservation on a rerun.
Reject a changed SHA/SRI, other-package stage, expired candidate, forged owner record and mixed old/new manifest.
Use a controlled registry for the local rehearsal.
Only the owner can demonstrate private npm access, OIDC stage permission and interactive approval in the live system.

### SLICE-005 · Finish public verification and partial operations without replay (D1, D3–D5)

Close the first-draft ambiguity in `draft()`.
With `expectedReleaseId: null`, the current code checks the tag then POSTs.
It records `DRAFT_VERIFIED` only after asset upload and final verification.
Bind creation to one authorized execution and persist the exact request intent before POST and the returned native release ID immediately on acknowledgement.
Include draft creation and seal in the existing signed writer inventory where replay is possible.
Reuse the original seal journal and known-ID continuation for outstanding asset work.
Simulate a successful creation with a lost response, interruption after the response but before upload, a subsequently deleted draft and an unrelated draft with identical notes.
An absent tag lookup or matching notes alone cannot authorize a second POST or adopt a new ID.
Recovery must establish the original ID independently or keep the operation unresolved.
The first-case reservation applies to a side effect.
Read-only reconciliation needs no new writer reservation.
[GitHub run and attempt identities](https://docs.github.com/en/actions/reference/workflows-and-actions/variables)

Release the shared mutation queue while anonymous public recipient tests run.
Bind their input to exact version, SRI, original operation and frozen matrix, and protect it from candidate cleanup for the duration.
Before seal or a channel write, reacquire the shared queue and reread the live draft ID, label preimages, settings freshness and any unresolved operation.
Check the writer history from slice 4 for intervening effects on shared labels or classification even when the package versions differ.
Race a slow read-only matrix with a label change and with candidate cleanup.
The reader may finish its exact-version observation, a stale writer must stop, and the cleanup job must retain its inputs.
Retain OwlAPI's `queue: max` and cancellation-disabled behavior for authorized writers.
Read back native execution IDs after cancellation or queue saturation.
[GitHub concurrency behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

Extend `release-registry.yml`, `scripts/public-recipient-lane.mjs`, `scripts/staged-release-followup.mjs` and `scripts/release-channel-operation.mjs`.
Resolve the original public proof and each expected matrix receipt by its actual producing attempt, runner, job execution interval and exact artifact ID/digest.
Seal currently constructs all lane names from `operation.publicAttempt`.
On a failed-jobs rerun, retained Linux/Windows lanes can have their earlier attempts while macOS has a new attempt.
Authenticate both inventories against the final complete run, accept exactly one original receipt per expected lane and carry those exact bytes into the archive.
Apply the same rule to dependencies of each sealed product proof.
Reject conflicting, duplicate, missing, substituted or late receipts.

Use the real registry provenance, scope and npm alias readers with the entire frozen bundle.
Continue after approval with fresh anonymous public acquisition and installed tests on the frozen Linux/Windows/macOS grid.
The build identity, signed tag and npm provenance publisher controller answer different questions.
Verify native registry signatures, locked/lockless graph, SRI, README/examples and equality to private and qualified bytes.
Use the [installed fixtures](../../scripts/installed-consumer-fixtures.mjs) and [anonymous registry reader](../../scripts/public-registry-consumer.mjs) from a clean recipient root for scoped and alias installs on each supported OS.
Apply applicable overrides in that root and cover both hoisted and nested production dependencies, including one also used by a development tool.
Retain the recipient manifest, lock digest and observed graph so the SBOM can be checked against the actual install.
Seed offline fixtures only with verified bytes.
Accept a missing historical lock only if reconstructed from its original source and matched to its recorded digest.
Reuse bounded readback for propagation, rate limits and attestation indexing, with one total budget per observation.
After expiry report the observed state and earliest useful retry.
A third label value, malformed signature or contradicted asset is a terminal conflict.
Keep GitHub's draft access with the appropriate authority.
A read-only token returning 404 cannot establish safe creation.

Verify the same draft ID, reviewed final notes and exact five staged-release assets through seal and independent completion.
Compare names, sizes and digests across content records.
Require stable native IDs when both observations carry them.
Preserve all original IDs.
Reuse OwlAPI's existing typed attestation wait and native `gh release verify` / `verify-asset` without interpreting a signature failure as indexing lag.
Keep the original four-asset historical reader.
Index each required archive member by name, length and digest, including an empty required log.
Exclude verifier scratch and reject missing, extra, duplicate, linked, escaping or normalization-colliding entries and ambiguous encodings.
Exercise [immutable release verification](../../scripts/verify-immutable-release.mjs) with ordinary read permissions when the admin settings endpoint is denied.
Use the same credential's positive attestation check to distinguish indexing delay from terminal authorization or signature failure.
Changing download counts or timestamps may pass with stable identities and matching bytes.
A changed native ID or digest must fail.
New sealing still needs fresh owner settings evidence.
Bound any parallel verification, isolate each worker's cache and scratch, and fail the aggregate if a member is unverified.
For label/classification operations preserve intent, flushed request, acknowledgement and independent observations per service.
After npm succeeds and GitHub fails, report those two outcomes separately.
Resume only authorized outstanding work against its preimage.
A successful read-only completion never rewrites the original job result.
Update the support designation only after the required public and immutable checks close.

Add a separately owner-authorized `retire-pilot` operation to the [channel controller](../../scripts/release-channel-operation.mjs).
Bind the verified immutable stable release, exact candidate being retired, reviewed pilot preimage and intended absence.
Authenticate an older candidate from signed history without executing it.
Under the shared queue, recheck the stable identity, npm tags and GitHub classification, then issue at most one npm DELETE at the fully encoded scoped endpoint with HTTP write retries disabled.
Use bounded independent readback and preserve `latest`, `next`, support designation and GitHub classification.
Give the operation no GitHub writer or GitHub write token.
Document that explicit `@pilot` installs may fail between candidates while exact-version installs remain available.
Promotion and candidate expiry do not authorize retirement.

**Proof and exit.**
Inject a public 404 that settles, wrong tarball on one OS, one retained lane from attempt 1 on attempt 2, named recovery upload, lost seal acknowledgement after immutable publication, stale settings renewal, failed classification and a conflicting latest ID.
Exercise the existing RC1–RC3 readers and the staged five-asset reader through the final CLI.
A successful observer issues zero POST/PATCH/DELETE or npm mutations.
Failed public qualification after direct `latest` reports the actual npm default and holds GitHub stable classification.
A guarded withdrawal can restore labels to a separately qualified predecessor, never replace published bytes.
For pilot retirement, assert zero deletes for an already absent label or a conflicting third value and one for an approved matching preimage.
For signed read-only settlement of a refusal, require the original authorized attempt's complete native npm `E401` and HTTP `401 DELETE` for the exact endpoint within the original step, without acknowledgement or contradiction.
A clipped log, unrelated 401, timeout or later 404 leaves the effect unknown.
Any later mutation requires fresh owner intent and current preimages.

### SLICE-006 · Bound candidate storage and recovery cost (D1, D6)

**Start with the largest consumers.**
At 02:23 UTC on 18 November 2026, the paginated OwlAPI Actions inventory returned 1,087 unexpired artifacts totalling 1,036,375,547 bytes.
Nine Java reference artifacts accounted for 546,924,098 bytes and 151 July ontology reconciliation artifacts accounted for 393,091,398 bytes.
Together those two families occupied 90.7% of the total.
By comparison, 526 consumer runtime lane artifacts occupied 32,356,936 bytes.
The separate cache inventory showed a single 219,820,465-byte managed CodeQL overlay on main.
These are point-in-time sizes, including historical workflows, and confer no deletion authority.
[Artifact inventory](https://api.github.com/repos/Hadden-Industries/owlapi/actions/artifacts) · [Cache usage](https://api.github.com/repos/Hadden-Industries/owlapi/actions/cache/usage)

**Apply retention at the producer.**
Keep the repository's 90-day recovery window.
Give each upload an explicit purpose, member allowlist and lifetime at its call site.
Use a small set of validated purpose values in reusable workflows and the existing transport/governance code so maintenance, ordinary PRs and releases can select different lifetimes without duplicating the policy.
Implement the maintenance path first.
It exercises packing, cross-job transfer and an installed matrix without spending a publication or risking a release candidate.
Markdown Quality already uses one-day lane transport.
JSON Quality distinguishes disposable handoffs from release-capable bytes and preserves native logs without uploading copies.
[Markdown Quality installed qualification](https://github.com/Hadden-Industries/markdown-quality/blob/cc3d8f70eb8a1f8218cc2393dc23d44f82b55d2b/.github/workflows/installed-qualification.yml) · [JSON Quality retention contract](https://github.com/Hadden-Industries/json-quality/blob/5b9504011f7248902e517197f5b866154867f681/docs/release-operations.md#artifact-retention)

| Output and owner                                                 | Proposed minimum custody and condition for shortening                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary test, lint and npm output                               | Stream bounded, disclosure-safe diagnostics to the job log and put the verdict in the job summary. Upload zero log copies, success screenshots, workspace archives or dependency trees. Keep a failure-only file only when the log cannot explain the failure or a machine consumes it. Use an explicit member list and the shortest demonstrated diagnostic window, initially capped at the existing 14 days for ordinary CI diagnostics.                                                                                                                                                                                                                                                                      |
| Weekly package, installed lanes and aggregate                    | In `maintenance.yml`, retain the candidate for one day for the same-run installed matrix. Pass the maintenance purpose through `installed-qualification.yml` and `aggregate-consumer-runtimes`. Give per-lane inputs one day for validated aggregation. Return the small verdict as a job output or summary when no later consumer reads the aggregate bytes. Keep the existing one-day reporter handoff. On a delayed maintenance retry after expiry, tell the operator to start a fresh health run.                                                                                                                                                                                                           |
| PR and main qualification                                        | A FULL PR intended for promotion needs its original candidate, package proof, compact qualification receipt and every referenced exact-byte input for up to 90 days. A main run admitting these bytes should store one small record pointing to their original IDs. Apply the same rule to release admission. A partial PR, failed admission or diagnostic cannot establish a new retained main candidate. Keep indispensable inputs of pending PRs until they are superseded or expire.                                                                                                                                                                                                                        |
| July ontology and optional Java reference                        | Inspect actual members of representative success, failure and release archives. Trace the July reconciliation reports, Jest originals and Java runtime tree to every reader before replacing the current directory upload with an explicit file list. Keep one copy of required originals and use a compact success receipt for other runs once equivalent replay is proven. Retain actionable differences on failure. Java reference reuse has its own enablement, 90-day window, original-producer lookup and matching sources/notices. Keep that control independent, preserve the rights bundle as a unit and let older products expire unless the Java policy owner proves all readers have released them. |
| ScanCode, extended tests and public recipient lanes              | Keep one-day shard/intermediate transport where the native aggregate closes in the same run and retain the seven-day extended aggregate for its current use. Keep originals consumed by legal review, the release archive or an attempt-aware public verifier until authenticated successor custody is proven. A lane's compact receipt can replace bulky output only after the aggregate and seal work with the original producing attempts.                                                                                                                                                                                                                                                                   |
| Staging, approval, provider effects and immutable release assets | Keep exact admission inputs, write journals and referenced observations through the owner approval, retry and signed recovery windows. Reuse the original qualified tarball by ID. Allow early retirement of redundant Actions copies only after signed-checkpoint replay succeeds with those copies unavailable and all active readers are accounted for. Keep release assets, rights materials and required public recipient evidence in their designated custody.                                                                                                                                                                                                                                            |

Keep bulky files on runner-local scratch whenever the next operation runs in the same job.
Where a cross-job transfer is unavoidable, list the members before upload and measure compressed ZIP size on the provider.
The transport policy defaults to compression level 0 and July already selects level 6.
Benchmark text-heavy JSON/NDJSON separately from precompressed TGZ/JAR members using the existing compression override.
Adopt a change only when it reduces stored bytes at acceptable runner cost and preserves digests at the correct layer.
The final ZIP's own identity must still be recorded.
Keep npm and Maven Actions caches disabled on the inspected product paths.
Leave the managed CodeQL cache to its owner and track it separately.
Do not shift bulky Actions payloads to caches, Git history or release assets solely to lower the reported Actions number.
[GitHub dependency caching](https://docs.github.com/en/actions/concepts/workflows-and-actions/dependency-caching)

**Retire a candidate only when the new one is usable.**

Track the verified successor and direct origins of active PR/main consumers, manual diagnostics, queued/running/failed or unresolved releases, signed reservations and checkpoint capture.
Use a protected read-only inventory/dry-run first.
Only a separate narrowly scoped cleanup job may delete exact verified redundant IDs under an approved retention policy, after a second check for head movement, active readers and successor validity.
Unknown ownership, pagination limits, expiry or ambiguous recovery means hold and explain.
Avoid the check/delete race by serializing retirement with candidate selection/use or proving the old candidate can no longer be selected and has no outstanding claim.
Protected native expiry is still finite.
Surface earliest required expiry before dispatch and approval.
Use protected main or existing maintenance as the trigger.
Skip deletion when there is no successor or eligible artifact.
Scope `actions: write` to the trusted cleanup job, exclude forks and PR writers, and delete only allowlisted artifact IDs.
Preserve workflow runs and their native job history.
Already accrued usage remains after deletion.
[GitHub artifact removal](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/remove-workflow-artifacts) · [GitHub Actions storage billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

**Keep signed recovery economical.**

`readCheckpoint` currently enumerates the whole signed tree and materializes every payload with `git show`.
Seal also iterates `manifest.artifacts`, downloads lane evidence and builds a gzip archive in memory.
Measure calls, peak bytes and duplicate transfers as historical targets and lanes grow.
First deduplicate immutable reads by original ID/digest within one operation, batch bounded provider inventories and charge redirects, retries, download and extraction to shared budgets.
Keep native transport limits and per-member validation.
Where history over multiple releases actually grows beyond the demonstrated bounds, add a versioned signed index pointing to target-specific material by exact object, length and digest.
Validate the entire declared tree inventory and signer once, load only the authorized selected blobs, and retain disclosure review for every public Git blob.
Never skip unknown shared-label dispositions on the grounds that package versions differ.
A new archive representation must round-trip original bytes required by existing readers.
Retain existing representation until replay succeeds.

In the [checkpoint reader](../../scripts/release-history-checkpoint.mjs), obtain the required signed tag graph explicitly within the reader's budget on a shallow checkout.
Verify the tag object, live ref binding, signer key, rotation policy and any exact historical exception.
A narrower re-export retains the original signed payload and fullest authenticated subject, including the manifest digest.
Check canonical encoding, per-part and assembled lengths and digests, and decoded byte limits before extraction.
Reuse identical blobs and exclude earlier checkpoints from new payloads.
Retain evidence of a partial operation while reserving a ready verdict for successful completion of every selected operation.

**Proof and exit.**
Exercise maintenance through its real installed aggregate after the policy change.
Read the hosted artifact IDs, compressed sizes and effective expiry times.
Expect a one-day weekly tarball, no 90-day maintenance lane or summary uploads, and zero uploaded copies of routine logs.
For unchanged bytes, reducing the weekly tarball's lifetime from 90 days to one cuts its prospective byte-days by 89/90.
Calculate the actual reduction from observed sizes and retention.
Compare a representative FULL PR, reused main, release rehearsal, maintenance run and a failed/retried lane against comparable pre-change runs.
Count live archive bytes, byte-days by purpose, protected exceptions and cache bytes separately.
Compute byte-days as compressed bytes multiplied by observed or projected days held and label projections.
Report through the existing job summary or maintenance report.
Use the billing account's usage report for any monetary claim.
Add a workflow-governance regression for unclassified uploads, broad workspace paths, duplicated native logs, unexpected cache enablement and ordinary same-run transfers with a long retention.
Replay stage, seal and signed recovery using the minimal retained set, including approval delayed beyond one day and a retry with an earlier successful lane.
Release-required handoffs must still be available for the accepted wait or stop and request new read-only admission before any write.
Test retention with an in-flight successor, an active older diagnostic, an unresolved release and incomplete provider enumeration.
Use JSON Quality's 90-day candidate ceiling while OwlAPI's staged readers still follow cross-run IDs and approvals may be delayed.
Markdown Quality's 30-day original CI qualification window relies on its retained release bundle after promotion.
Revisit that window when signed-custody replay is proven and observed release lead times support a shorter interval.
A nominal retention limit by itself never establishes that every member remains available.
The dry-run lists exactly the deletable IDs and why.
Test expired Actions records with a signed checkpoint, corrupted member, duplicate normalized path, symlink and unexplained file.
Another case retains a large unrelated target and proves zero payload downloads for it.
Record actual byte-days, I/O count and peak retained bytes.
Before enabling cleanup, make the Actions copies unavailable in a rehearsal and run the original release verifier against the signed checkpoint and the immutable assets it references.
Require it to recover the original evidence and validate its identities and digests through the stage, seal and recovery paths that consume it.
If any path still needs an Actions copy, exclude its exact ID from early retirement and report the reader that needs it.
Continue the existing encrypted off-platform backup, checksum and inventory checks.
The cleanup acceptance exercise is limited to replay from signed custody.
A missing indispensable candidate still stops new staging.
Rehearse a narrower re-export from a shallow checkout, a rebound tag, wrong signer, modified payload and an oversized part.
A valid re-export must replay the same original subject with Actions copies unavailable.
Any failed replay must leave the affected artifact IDs ineligible for early deletion.

### SLICE-007 · Rehearse on protected main, cut over and retire legacy writers (D1–D6)

The repository maintainer owns integration.
SLICE-001 gates the new reuse authority in 002.
Workflow validation in 003 and storage inventory in 006 can begin in parallel.
Land backwards-compatible readers in 004–005 before switching the producer default.
Enable early retirement after the signed-checkpoint rehearsal and apply the active-consumer checks in SLICE-006 to each proposed deletion.
Keep one integration owner for the shared workflow job inventory, manifest schema and generated control projections.

1. Run one deliberate topic PR and its normal merge.
   Capture `CI / required` from the expected App, native job inventory, direct FULL origin, runtime matrix digest, candidate ID and byte identities.
   Rehearse changed inputs, unavailable evidence and explicit manual full using a disposable fixture or read-only dispatch.
   Preserve the old main fallback until these routes are observed.
   A non-ready PR or an installed-only diagnostic cannot supply a release verdict.
2. Dispatch a qualification-only successor rehearsal on the current protected subject.
   Read the actual jobs from GitHub.
   On a reuse hit expect zero redundant product packs/matrices, all selected release-only gates successful and an independently readable promoted manifest.
   On a miss expect an actionable stop with zero expensive fallback jobs and zero effects.
   Verify the explicit fresh path once when needed for cutover.
   A green workflow with its selected aggregate skipped fails acceptance.
   Compare native job results to the selected route, including retained jobs from earlier attempts.
   Use the local cold fixtures for interrupted or refused writes and assert the native request count.
   Use this read-only dispatch to verify actual scheduling without spending a real publication.
3. Owner verifies current repo rulesets, creation/update/deletion protection of `refs/tags/owlapi-release-history/*`, signer and bypass actors, exact protected-main environment restrictions and reviewers, and immutable releases.
   Inspect both npm publisher bindings.
   Preserve the managed CodeQL check and app-bound `CI / required`.
   If a check needs rebinding, authenticate the App, native suite, run and reviewed workflow before changing settings and continue to require a successful check to merge.
   Check each npm connection's actual status, granted operations and expiry close to its first authorized operation.
   An expired binding requires owner renewal.
   A successful read does not prove first-publish activation.
   Only the tag-management workflow may manage dist-tags, both identities can stage, and direct publishing must be disabled on both.
   Confirm retirement of legacy credentials.
   Establish missing `npm-tags` / history protections under separate configuration authority.
   Reconcile rc.3 direct operations and the original unscoped alpha draft/credentials using signed/native evidence before disabling their callable writers.
   Keep historical fixtures, readers, original draft disposition and tags.
   Keep the reviewed exact-version RC exception and the original RC readers.
   npm provenance can authenticate publication identity but cannot prove that a different request was never sent.
   Keep an unexplained writer unresolved and hold any affected cutover.
   Never delete an unexplained draft as housekeeping.
   An unconfirmed provider setting blocks that effect, not local delivery of earlier slices.
4. At the next separately authorized release, perform one stage, one owner approval, public recipient qualification, seal, independent completion and only the selected channel operation.
   Record compact job links, original identities, verified asset IDs and actual tag maps.
   Verify support-line transition and signed recovery from frozen inputs.
   Inspect npm's version-pinned README and the public GitHub release notes.
   No need for a dummy version or an unrelated matrix to qualify controller-only recovery.
5. Compare job counts, platform minutes, packs, bytes retained/downloaded and time waiting for registry/attestation visibility against the representative FULL run.
   Report the selected mode, blocker, earliest expiry and next safe read-only action in workflow summaries.
   Keep metrics free of private identities.
   Maintain `installed-diagnostic.yml` for isolated recipient failures, `maintenance.yml` for weekly health, extended-provider status and isolated reporting, and `extended-tests.yml` for manual two-OS evidence acquisition.
   Diagnose the first failing phase before spending another matrix.
   For example, [CI run 43812187250](https://github.com/Hadden-Industries/owlapi/actions/runs/43812187250) records a Maven provisioning failure and package-suite failures.
   Investigate their respective steps before retrying.

**Abort and recovery.**
Before any public write, disable the promoted producer, retain readers and select the existing full read-only path deliberately.
Suspend cleanup on any inventory mismatch.
After a write, halt remaining effects, preserve the receipt and reconcile using the original operation.
Prefer a bounded read-only retry after confirmed acknowledgement.
Restore only explicitly approved mutable labels/classification against their preimages.
Defective immutable bytes require a new version, current qualification and fresh owner consent.
Reopen the affected design if a required proof cannot survive expiry, provenance cannot represent the two source identities truthfully, a provider binding changes, a new release gate appears, or candidate pressure exceeds policy.
A missing hosted observation remains an open acceptance item.

## Four-week donor hardening audit

The review covered commits dated 21 October through 18 November 2026 reachable from the two checkouts' branches, remote branches and tags.
The local refs were checked against the published branch and tag inventories.
JSON Quality contributed 170 commits and Markdown Quality 134, including 47 merges with no additional conflict-resolution changes and seven tag-only recovery checkpoints.
The review included the writers, readers, tests, action implementations, package fixtures and operational documentation behind the workflow YAML.
It included JSON Quality's changes after 1.0.2 and Markdown Quality's changes after 3.0.3.
[JSON Quality main](https://github.com/Hadden-Industries/json-quality/tree/78e901148f829cd1dd44953de22791fea6aa7f2d) · [JSON Quality post-release branch snapshot](https://github.com/Hadden-Industries/json-quality/tree/5b9504011f7248902e517197f5b866154867f681) · [Markdown Quality snapshot](https://github.com/Hadden-Industries/markdown-quality/tree/cc3d8f70eb8a1f8218cc2393dc23d44f82b55d2b)

The seven recovery checkpoints illustrate which original provider records may be needed after Actions retention expires.
The delivery slices above own the implementation and acceptance criteria.
Use the following donor commits to reproduce a failure or understand an OwlAPI-specific decision.

### Admit the right CI execution (slices 1–3)

- Slice 1 authenticates the merged PR, native check and job registration.
  Slice 2 owns the final output write.
  [Missing merge field](https://github.com/Hadden-Industries/json-quality/commit/8efc6d5) · [Late registration](https://github.com/Hadden-Industries/json-quality/commit/ea109dd) · [Output failure](https://github.com/Hadden-Industries/json-quality/commit/e1a250a)
- Slice 3 checks the runner, pins, permissions and inherited deadlines.
  Slice 7 keeps protection bound to the authentic native check at cutover.
  [Original hosts](https://github.com/Hadden-Industries/markdown-quality/commit/99754bb) · [Literal checkout pins](https://github.com/Hadden-Industries/markdown-quality/commit/4851c6a) · [Disabled setup](https://github.com/Hadden-Industries/markdown-quality/commit/ccbffa4) · [Check rebinding](https://github.com/Hadden-Industries/json-quality/commit/5982395) · [Inherited permissions](https://github.com/Hadden-Industries/json-quality/commit/558089f) · [Inherited deadlines](https://github.com/Hadden-Industries/json-quality/commit/9b94806)
- Slice 3 isolates caller-controlled input.
  OwlAPI qualifies its own package and installed consumers.
  Apply the upstream identity and attribution checks to the Java, ScanCode, benchmark and rights lanes.
  The donor-specific CodeQL model, C++ sanitizer matrix and Snapper build remain specific to their products.
  [Caller approval](https://github.com/Hadden-Industries/markdown-quality/commit/135df4d) · [Owner summary](https://github.com/Hadden-Industries/markdown-quality/commit/44cc70c) · [Trusted qualification](https://github.com/Hadden-Industries/json-quality/commit/6d0b6b5) · [Upstream license identity](https://github.com/Hadden-Industries/markdown-quality/commit/0b81f23)

### Transport and qualify the original bytes (slices 1–5)

- Slice 3 recovers the native upload identity.
  Slice 2 consumes it through bounded, authenticated downloads.
  [Native handler](https://github.com/Hadden-Industries/json-quality/commit/b4bb9c7) · [Literal names](https://github.com/Hadden-Industries/json-quality/commit/8879fcc) · [Named reconciliation](https://github.com/Hadden-Industries/json-quality/commit/1ee3734) · [Slow bodies](https://github.com/Hadden-Industries/json-quality/commit/6b6db5f)
- Slice 3 qualifies cold npm startup.
  Slice 5 verifies the recipient's actual dependency graph and lock.
  [Recipient SBOM](https://github.com/Hadden-Industries/json-quality/commit/406551b) · [Hoisted installs](https://github.com/Hadden-Industries/json-quality/commit/fd235e4) · [Native npm response](https://github.com/Hadden-Industries/json-quality/commit/71a3f81) · [Original lock policy](https://github.com/Hadden-Industries/markdown-quality/commit/8e04d32) · [Cold registry read](https://github.com/Hadden-Industries/markdown-quality/commit/b002b7a)
- Slice 2 determines whether a security, rights or benchmark result still satisfies its release obligation.
  [Complete promotion bundle](https://github.com/Hadden-Industries/json-quality/commit/3bdcb9e) · [Benchmark evidence](https://github.com/Hadden-Industries/json-quality/commit/1b75a32) · [Exact-source audits](https://github.com/Hadden-Industries/markdown-quality/commit/ed55271)

### Registry and GitHub writes

- Slice 4 reconciles private staging against the original attempt.
  Slice 5 applies the same shared-writer history to archive and label changes.
  [Version scope](https://github.com/Hadden-Industries/json-quality/commit/d760b74) · [Original writer](https://github.com/Hadden-Industries/json-quality/commit/3d4db71) · [Startup refusal](https://github.com/Hadden-Industries/markdown-quality/commit/772b0b7) · [Acknowledged stage](https://github.com/Hadden-Industries/json-quality/commit/3593a33)
- Slice 5 owns explicit pilot retirement, independent readback and signed settlement of an authenticated refusal.
  [JSON retirement and authorization](https://github.com/Hadden-Industries/json-quality/commit/9d5d96b) · [Rejected request settlement](https://github.com/Hadden-Industries/json-quality/commit/f3c0a7a) · [Scoped endpoint](https://github.com/Hadden-Industries/markdown-quality/commit/218b864) · [Propagation](https://github.com/Hadden-Industries/json-quality/commit/4222741)
- Slices 3 and 4 cover the cold process, dispatch inputs and reservations.
  Slice 7 checks actual scheduling and npm first-use readiness.
  [Cold fixture](https://github.com/Hadden-Industries/json-quality/commit/e740596) · [Selected job outcomes](https://github.com/Hadden-Industries/json-quality/commit/5b95040) · [Skipped writer](https://github.com/Hadden-Industries/markdown-quality/commit/b4e23aa) · [npm connection timing](https://docs.npmjs.com/trusted-publishers/#trusted-publisher-configuration-expiry)

### Recover signed history without retaining every build (slices 5–7)

- Slice 5 verifies both immutable archive layouts with normal read credentials.
  [Empty logs](https://github.com/Hadden-Industries/markdown-quality/commit/cf09398) · [Existing archive read](https://github.com/Hadden-Industries/markdown-quality/commit/e07f5ab) · [Attestation delay](https://github.com/Hadden-Industries/json-quality/commit/027f16c) · [Retained IDs](https://github.com/Hadden-Industries/json-quality/commit/1ed6479)
- Slice 6 verifies signed history re-export and replay before early retirement of any required Actions copy.
  [Signed tag fetch](https://github.com/Hadden-Industries/markdown-quality/commit/9093122) · [Preserved subjects](https://github.com/Hadden-Industries/markdown-quality/commit/749a07c) · [Compact signed history](https://github.com/Hadden-Industries/markdown-quality/commit/7158e52) · [Checkpoint readiness](https://github.com/Hadden-Industries/json-quality/commit/5b95040)
- Slice 7 retains the exact historical exceptions.
  OwlAPI publishes one package to three recipient platforms.
  The donor package-family synchronization, native-first staging order and provenance fallback for expired legacy runs do not transfer.
  [Family operations](https://github.com/Hadden-Industries/json-quality/commit/a905df9) · [Legacy provenance recovery](https://github.com/Hadden-Industries/markdown-quality/commit/c1ba982)

## Focused verification handoff

Extend `scripts/project-package-version.test.js` to exercise the successor policy and archived controls, and `scripts/report-maintenance-failure.test.js` to exercise late lane failure and closure only after complete success.
Run these through the same focused Jest entry below.
Include the late-tag, draft acknowledgement and queue races in the staged-release and workflow-governance suites.

**Trust and disclosure.**
Perform release admission under reviewed protected workflow and validator bytes.
Independently derive the workflow, job, repository, native check App, PR association and archive origin from provider/Git evidence.
Compare the tested workflow and qualification policy with the reviewed landed versions.
Treat PR uploads and downloaded archives as data.
Execute an original tarball only inside the unprivileged qualification boundary.
Keep writer workspaces and credentials isolated from candidate scripts, lifecycle hooks and caches.
Validate path traversal, duplicate entries, symlinks, decompressed sizes and per-operation bounds before materializing files.
Treat an origin from an untrusted producer as ineligible even if its checksums and self-reported metadata agree.

Use real workflow entrypoints, repository executables, pinned npm and the packed artifact in the fixture journey.
Replace external GitHub/registry I/O, an interactive owner and timing at their boundaries.
Build independent expectations from Git objects, recorded provider envelopes, native tarball/lock digests, signed tags, published historical assets and the approved channel table.
A fixture that manufactures its expected receipts by calling the writer under test cannot establish provenance.

| Claim                                                        | Maintained entry or proposed extension                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| YAML shape, pins, permissions, bootstrap and job disposition | `npm run verify:workflow-syntax`, `npm run verify:workflow-governance`, then `npm test -- --runInBand --runTestsByPath scripts/workflow-governance.test.js scripts/require-job-success.test.js`. Extend with the mode and cancellation mutations in 002–003.                                    |
| Main points to a direct FULL origin and every member matches | Extend `scripts/ci-verification.test.js`, `scripts/ci-check-coverage.test.js` and `scripts/artifact-transport.test.js` using the same Jest runner. Add the proposed release-dispatch-to-stage subprocess test with distinct original/landed/controller identities.                              |
| Single submission, sealed custody and truthful completion    | Extend `scripts/staged-release.test.js`, `scripts/release-preflight.test.js`, `scripts/verify-immutable-release.test.js` and `scripts/historical-release-evidence.test.js`. Replay interruption at the request, acknowledgement, retention, propagation and independent readback boundaries.    |
| Documentation and operator inputs match shipped behavior     | Exercise the existing `scripts/release-documentation.test.js`, `npm run check:markdown` and the staged runbook against the real dispatch YAML, including exact types, required arguments and payload size. Use the verified version projector and owned gate definitions for successor updates. |

The exit criterion is one protected main release decision that identifies exactly which CI bytes qualified, which release-specific checks ran, and which public effects actually completed.
Local fixtures establish controller behavior.
Hosted job records, signed custody, private owner verification and public recipient observations establish the respective operational claims.
