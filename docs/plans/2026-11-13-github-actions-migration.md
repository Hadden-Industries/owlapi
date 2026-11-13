# OwlAPI GitHub Actions migration plan

**13 November 2026 · HISEW implementation plan for review · Decision and integration owner: Maksym Shostak**

Move OwlAPI to the deliberate PR, exact-package qualification and recoverable release approach implemented in JSON Quality and Markdown Quality.
A contributor should be able to request one meaningful PR verdict.
A release operator should be able to identify the exact package that passed, the public channel it reached, and the next safe action after an interruption.

**Owner decision on 13 November:** stage under npm `pilot` by default.
The owner may explicitly select `latest` for any version, including an RC.
This changes the prospective channel rule in ADR 0009.
**Owner decision on `next`:** until the first stable release is promoted, keep `next` on the security-supported RC.
Advance it only after the successor RC passes public qualification and its immutable archive is verified.
A pending or failed pilot therefore leaves current consumers with a known supported target. npm treats `latest` as the default install target and assigns the other tags their project-defined meanings.
[Current OwlAPI decision](../adr/0009-scoped-npm-publication-and-uo-rc-acceptance.md) · [OwlAPI support policy](../../SECURITY.md) · [npm dist-tag semantics](https://docs.npmjs.com/cli/v12/commands/npm-dist-tag/)

**Planning boundary.**
Carry forward the existing R2 assurance level for OwlAPI release controls.
This migration spans merge protection, OIDC, public npm labels, immutable bytes and cross-service recovery.
The requested deliverable is this plan.
Its implementation, provider configuration and first real release have separate effects and evidence.
The [0.1.0 release roadmap](2026-10-29-0.1.0-release-reconciliation.md) still owns product, Java, performance, rights and stable acceptance.
Its rc.3-specific exceptions have that historical scope.

**First implementation milestone.**
Take a draft PR through source admission, one shared package producer and its existing consumers to the protected `CI / required` verdict.
Move the release qualification caller onto that contract before touching npm permissions.
The next ordinary RC or stable release waits for the staged publishing path, even if the product clears its release gates first.
Before that release, demonstrate qualification, private stage review, public verification, immutable archival and recovery for the selected channel.
The rc.3 direct publisher is bound to its historical tarball and approval.
Unrelated CI and maintenance cleanup can follow the first release through the new path.

## Evidence baseline

| Source inspected                                                                                                                                                                                                                                                                                                               | Observed contract and transfer decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OwlAPI source](https://github.com/Hadden-Industries/owlapi/tree/65f415dc9840603ddfcc04e8f94b55d4ac077432)                                                                                                                                                                                                                     | `zero-one-zero` at `65f415dc`; remote `main` at `c9b83107`. Preserve the branch's local/qualification toolchain split, Ubuntu 26.04 and narrow acquisition of the pinned July files. Reconcile against the landing revision before changing workflows.                                                                                                                                                                                                                                                                                                                                                                 |
| [JSON Quality implemented workflows](https://github.com/Hadden-Industries/json-quality/tree/4040c437e3c5b0b4f805941327d39bf6286e5d1a/.github/workflows) · [operator contract](https://github.com/Hadden-Industries/json-quality/blob/47752f6257168c46ef65513c09350f60782df7b5/docs/release-operations.md)                      | Inspected `dev/ci` at `31583b60`. Changes `a905df9`, `4040c43` and `47752f6` implement and document separate qualification, staging, registry admission, archive, promotion and completion. Transfer original-attempt checks, signed recovery evidence, separate writers and independently runnable completion.                                                                                                                                                                                                                                                                                                        |
| [Markdown Quality implemented workflows](https://github.com/Hadden-Industries/markdown-quality/tree/acfedfbecba1d27c99a28f2f28bb813b0765c9f8/.github/workflows) · [coordinated design](https://github.com/Hadden-Industries/markdown-quality/blob/473b29b/docs/plans/2026-11-13-release-ci-convergence-implementation-plan.md) | Inspected `fix/ci` at `927b0212`, including `9eefe7f` and `acfedfb`. Transfer early source admission, installed-only diagnostics, public recipient proof, compact archival and interrupted-operation settlement. Both reference implementations were visible on their remote topic branches. Their delivery to OwlAPI and hosted acceptance must be demonstrated here.                                                                                                                                                                                                                                                 |
| [Existing reuse implementation](2026-10-29-release-and-ci-evidence-reuse.md) · [CI lineage](../adr/0011-full-ci-qualification-lineage.md) · [Java reference reuse](../adr/0012-gated-native-java-reference-reuse.md)                                                                                                           | OwlAPI already authenticates PR receipts, distinguishes original producing attempts, transports retained bytes and can fall back to full main execution. Receipt schema 6 and qualification policy 10 are visible in the inspected source. Selective execution and shared Java reference reuse are disabled. Preserve those decisions.                                                                                                                                                                                                                                                                                 |
| [Current ruleset](https://github.com/Hadden-Industries/owlapi/rules/21687258) · [successful PR](https://github.com/Hadden-Industries/owlapi/actions/runs/42678801389) · [landed main](https://github.com/Hadden-Industries/owlapi/actions/runs/42682667831)                                                                    | Live ruleset requires strict `CI / required` from Actions app 15368, resolved threads and CodeQL high-or-higher security findings policy. Merge and squash are allowed; the owner has a PR bypass. The sampled PR had 40 successful expanded jobs; its main run had three successes and 20 skips. Use this pair as a comparator. CodeQL default setup is configured; Actions and JS/TS analyses were visible for the main SHA.                                                                                                                                                                                         |
| [Protected tags](https://github.com/Hadden-Industries/owlapi/rules/21687233) · [published rc.3](https://github.com/Hadden-Industries/owlapi/releases/tag/v0.1.0-rc.3)                                                                                                                                                          | Creation of `v*` is restricted separately from update/deletion. Existing provenance landmark rules have a different scope. Actions requires SHA pins, a selected allowlist, read-only default token and approval for all external contributors. Both `release-manual` and `npm-release` have the owner as reviewer and protected-branch restrictions. npm returned `next = latest = 0.1.0-rc.3`, with no `pilot` entry. GitHub returned an immutable prerelease with four assets and no latest stable release. These are readbacks on 13 November. npm owner-side trusted publisher settings still require inspection. |

### Disposition of every existing workflow

| Current entry point                                                                                     | Destination and obligations                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ci.yml](../../.github/workflows/ci.yml), 23 job definitions                                            | Keep the top-level required job and PR identity. Move shared product work behind a local reusable workflow. Give landed main its own observer and manual full/installed-only entries.                                                                                                                                                                                                  |
| [release.yml](../../.github/workflows/release.yml), 42 job definitions                                  | Separate read-only release qualification from explicit staging, public verification, immutable archival and promotion. Keep this filename for the protected npm staging entry if the provider binding can be converted in place. Remove ordinary direct publication at cutover. The current dispatch defaults `qualification_only` to false and includes a fixed rc.3 recovery branch. |
| [release-reconciliation.yml](../../.github/workflows/release-reconciliation.yml), eight job definitions | This is the historical unscoped alpha bootstrap with a distinct credential path. Preserve its records, validators and draft disposition. Retire the callable writer after checking for unresolved operations. A general recovery operation for the scoped package must never inherit alpha bootstrap authority.                                                                        |
| [maintenance.yml](../../.github/workflows/maintenance.yml), five job definitions                        | Preserve scheduled/manual package health, frozen runtime checks and disposable candidate qualification. Keep `issues: write` confined to its reporter. Update the health reader for independently tracked support and availability channels.                                                                                                                                           |
| [extended-tests.yml](../../.github/workflows/extended-tests.yml), five job definitions                  | Preserve scheduled transparent extension status and manual two-OS, 32-shard-per-OS evidence acquisition, signing-key snapshot, aggregation and parity. Release currently has its own Ubuntu shard path. Share the applicable acquisition operations and preserve each caller's distinct evidence requirement.                                                                          |

## Requirements and decision owners

1. **REQ-01 — Merge qualification.**
   Deliberate full PR execution, one protected exact-source verdict, with an inspectable reason and a recovery action on main.
   Installed-only is a bounded diagnostic.
   An updated PR head, expired evidence or missing lane cannot inherit acceptance.
2. **REQ-02 — Package identity and behavior.**
   Produce one closed scoped tarball per qualification and test those bytes everywhere.
   Preserve direct and native npm alias installs, export boundaries, Node-only entry isolation, browser bundler/import-map/worker modes in all three engines, OWL contract, Java OWLAPI 5.5.1 reference, both behavior profiles and pinned July corpus/closure checks.
   The existing roadmap owns the measured performance envelope.
   Actual Universal Ontology or WebVOWL deployment and sign-off remain consumer-owned.
   [Installed OWL contract](../compatibility/installed-owl-contract.md) · [Java and corpus gates](../release/producer-release-policy.json)
3. **REQ-03 — Security and rights.**
   Preserve introduced high runtime dependency review, complete-lock observations, blocking high production audits, scanner evidence and release rights obligations.
   Bind successful CodeQL results and applicable alert disposition to the exact candidate.
   The reference repos' moderate PR threshold, native companions, sanitizers, Snapper, private CodeQL model and additional product languages have no automatic OwlAPI authority.
   [Dependency policy](../dependency-governance.json) · [Release gate inventory](../release/producer-gates.json)
4. **REQ-04 — Release intent.**
   One authenticated owner binds scoped package, source, tag, frozen manifest digest, selected channel, expected prior labels and GitHub latest ID or absence.
   A single public JS package and its alias have one npm coordinate.
   Native-first staging in the references becomes exact-tarball qualification before the one stage.
   Java reference products, platform tests and transitive native dependencies retain their respective qualification and rights obligations.
5. **REQ-05 — Evidence and recovery.**
   Preserve source, controller, provider run/job/original attempt, artifact ID/archive digest and the package's own SHA-256 and npm integrity as distinct fields.
   Every external write has a guarded preimage, durable intent, observed result and independently repeatable readback.
   Historical evidence remains readable under its producing contract.
6. **REQ-06 — Operations and cost.**
   Record fan-out, repeated installs, runner minutes, candidate count, artifact bytes, reasons for reuse/refusal, pending publication age and ambiguous writes.
   Use actual collection and release evidence to choose retention and identify redundant work.
   Keep failed diagnostics available and credentials, OTPs, OIDC tokens and embargoed findings out of public evidence.

### Channel and support contract for implementation

| Candidate and owner selection    | npm effect after interactive stage approval                                                                  | GitHub and support after verification                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RC, `pilot` (default)            | `pilot` points to the RC. Preserve the approved preimage of `latest`.                                        | Archive as immutable prerelease; preserve GitHub latest or its absence. Before stable, advance `next` after public qualification and archive verification.                                       |
| RC, explicit `latest`            | Unversioned installs can receive the RC as soon as npm makes it available. Preserve `pilot` at its preimage. | Same prerelease and pre-stable `next` rules. A previously promoted stable, if one exists, remains the security-supported production line.                                                        |
| Stable SemVer, `pilot` (default) | `pilot` points to the qualified candidate; `latest` retains its preimage.                                    | Archive as immutable prerelease. On separately authorized promotion, change npm `latest`, verify it, then mark that same GitHub release stable/latest. Prior support continues until completion. |
| Stable SemVer, explicit `latest` | The default moves at npm approval. Retain that fact if a later verification fails.                           | Qualify publicly, verify the immutable archive, then complete stable/latest classification on its existing release ID.                                                                           |

An omitted channel resolves once to `pilot` at admission.
Empty, unknown, contradictory or changed selections fail before a writer runs.
Preserve exact-version installs and the scoped alias.
The first stable completion transfers maintenance to that stable version.
After stable promotion, separately authorize and verify removal of stale `next`.
The owner explicitly opens each future preview line once, as part of its release decision.
For example, publishing `0.2.0-rc.1` to `pilot` leaves `next` absent unless the owner opens the `0.2.0` preview.
Once open, advance `next` only to a successor RC for that line after public qualification and verification of its immutable archive.
After stable, record the maintained version with the verified stable release identity so an explicit RC on npm `latest` cannot silently change support.
Implement these amendments in ADR 0009, `SECURITY.md`, contributor instructions, packed release docs and executable controls together.
The historical rc.3 approval remains bound to its original bytes.

## Delivery slices

Each slice gives the maintainer a result that can be demonstrated through its real caller.
New workflow names below describe proposed responsibilities.
Existing public check, publisher and evidence identities have compatibility requirements independent of those names.

### SLICE-001 — Capture the effective contracts and prove a safe cutover path

**REQ-01, 03, 04, 05.**
Reconcile the landing commit against both branches.
Inventory each job, event, permission, secret/environment, reader, generated projection, artifact name/retention and expected failure action.
Trace call sites in [workflow governance](../../scripts/workflow-governance.mjs), [required jobs](../../scripts/require-job-success.mjs), [CI proof](../../scripts/ci-verification.mjs) and [registry provenance](../../scripts/registry-provenance.mjs).
The governance checker enumerates exact filenames, job IDs, commands and upload sites.
The provenance reader pins `release.yml` and its certificate identity.
Treat these as consumers of the migration.

Capture effective rulesets including bypass, Actions allowlist, environment reviewers, CodeQL analysis categories and npm package settings using read-only interfaces.
Record identities, permitted operations and settings evidence digests only.
Confirm GitHub's stage/label writer design against the actual npm repository, filename, protected environment, CLI and enabled permissions. npm independently controls stage, direct publish and dist-tag operations.
A saved binding alone cannot establish a successful OIDC exchange.
Prefer top-level npm writers to keep caller identity explicit.
[npm trusted publishers](https://docs.npmjs.com/trusted-publishers/) · [GitHub reusable workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/reusing-workflow-configurations)

**Proof and exit.**
Resolve the rc.3 tag, immutable ID, four asset names/digests, scoped npm version and prior channels; classify every historical writer and the alpha draft.
Establish a one-to-one mapping from old checks to new acceptance obligations.
Isolate the smallest hosted non-writing qualification on the intended runner in the later rollout.
If nested job names or provider identity differ, retain a top-level adapter for the existing *check obligation* or keep that job in its caller until native readback succeeds.
An unknown npm binding blocks writer activation only.
No library, shared service or vendor code import is needed for this inventory.

### SLICE-002 — Admit source once and qualify the same package in PR and release

**REQ-01, 02, 03, 06.**
Starting with a PR and one installed lane, pass one frozen matrix and candidate from producer to consumer to aggregate.
Then migrate the remaining lanes and call the same read-only workflow from release qualification.
Use local `workflow_call` for multi-job orchestration and the existing producer, freeze, consumer, aggregate and artifact actions at their current boundaries.
Pass typed inputs and explicit outputs; limits, env, permissions and checkout identity must reach the real callee.
Keep release-specific third-party acquisition, preflight and producer gates with the release caller.
Keep the outer `CI / required` job in the caller so nested names cannot break the live ruleset.

Use one early source gate for identical, deterministic checks.
Trace the portable, JSON and canonical source paths first.
Canonical uses a live Java/Jest report, scanner, actionlint, package transport, final JSON check after native outputs and July corpus.
Windows exercises native quality tooling.
Moving a command upstream is valid only when inputs, platform, side effects and proof are equivalent.
Keep the downstream JSON check on newly generated outputs and independent fresh release qualification.
Use the pinned package CLIs already invoked by OwlAPI.
The peers' externally callable JSON/Markdown workflows verify candidate data against a trusted base under their own policy; invoking them here would require a separate demonstrated gap and compatible allowlist.
[Runtime policy](../release/runtime-policy.json) · [Artifact transport](../release/artifact-transport.md)

Freeze minimum, latest released patch and distinct reference for Node 22, 24 and 26 across Ubuntu x64, Windows x64 and macOS arm64.
Preserve producer Node 26.13.0 / npm 12.2.2, consumer npm 10.9.10 and the qualified Node floors.
Keep local tool eligibility separate.
Bind frozen matrix, candidate ID/digest and every required lane to the aggregate, as well as true runner and attempt.
Build once within that qualification, fan out by ID, and reuse the actual installed/browser and OWL runners.
Reconcile nested job inventories, `runtime-projections.json`, generated gate fingerprints and permission/transport validators in the same slice.
A missing, duplicate, skipped or copied foreign report must fail even if the caller itself concludes successfully.

**Proof and exit.**
Exercise existing `consumer-runtime-matrix`, `aggregate-consumer-runtimes`, `ci-check-coverage`, `require-job-success`, `candidate-bundle` and `workflow-governance` suites.
Run the affected native package, browser/worker, OWL and Java entry points on candidate bytes.
Compare hosted job/step evidence with the old obligation map.
A deliberate source failure should stop expensive fan-out; a changed generated report after source admission must still fail.
Measure installations, packs, minutes and storage before claiming savings.

### SLICE-003 — Switch PR triggering and landed-main evidence reuse

**REQ-01, 02, 05, 06.**
Target the peers' deliberate `pull_request: ready_for_review` on PRs into `main`.
Draft updates, ordinary pushes and opening an already-ready PR do not start full qualification.
Document how a contributor marks a draft ready and how to request a new check after a head/base change, including for bot PRs.
Preserve fork approval controls and read-only candidate execution.
Keep the app-bound strict check `CI / required` with a complete `always()` inventory, and prove it attaches to the intended merge candidate.
Never satisfy a changed head with a placeholder success.
[Reference CI trust model](https://github.com/Hadden-Industries/json-quality/blob/4040c437e3c5b0b4f805941327d39bf6286e5d1a/docs/ci-trust.md) · [GitHub PR events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)

Split main push into a read-only observer and deliberate full/installed-only dispatches on protected main.
Authenticate original PR execution, ordinary merge parents/tree, exact workflow/policy inputs including called workflows and local actions, matrix digest, supported collector context and original provider jobs/artifacts.
Require a fresh direct full proof on a changed matrix or lost/ambiguous lineage.
A current successful observer reports either `REUSED` with its origin or `FULL_REQUIRED` with the reason, exact SHA and dispatch instructions.
Only a matching full result may satisfy a main qualification consumer.
Recheck the requested subject at dispatch and completion so a later push cannot qualify an earlier SHA.
Carry forward the existing cold-seed requirement if applicable; keep Java reuse disabled.
Reuse chains and diagnostic-to-full promotion remain invalid.

**Proof and exit.**
Test ordinary equal-input merge, squash/rebase, direct/bypass push, fork, stale PR, expired evidence, changed called workflow, changed Node patch, partial rerun and an already-ready PR.
Demonstrate strict protection blocks until the new head earns its own verdict.
Demonstrate the manual full route and that installed-only success leaves `FULL_REQUIRED` outstanding.
Version incompatible receipt/policy changes.
Old evidence can be read for history, and fresh proof is required for a new contract.
Until both manual follow-up and every main-proof consumer are verified, retain OwlAPI's automatic full fallback.
Revert the event split independently of the product workflow if ordinary PR acceptance becomes unavailable.

### SLICE-004 — Bind release security and rights evidence to exact source and bytes

**REQ-02, 03, 05.**
Create a protected-main, read-only qualification entry for the exact version already committed there.
Reuse the product workflow, candidate evidence, release-only ScanCode acquisition/aggregation, locked and lockless consumer graphs, strict publint, signed-registry material, documentation examples and CycloneDX production SBOM.
Bind scans to source and the actual distributed inventory.
Retain separate results for root development tools, `tooling/artifact-transport`, production dependencies and installed recipients.
A check merely reporting dependency-review applicability on a dispatch cannot discharge the release security requirement.
Preserve human rights review and candidate-specific benchmark residuals as named dispositions.
[Candidate builder](../../scripts/build-release-candidate.mjs) · [Producer qualification](../../scripts/qualify-release.mjs) · [Transport rights record](../../tooling/artifact-transport/rights-review.json)

First query GitHub's current managed CodeQL analyses with read-only access.
Match repository, ref, exact SHA, tool, expected categories, completed analysis, timestamps and relevant alerts against the accepted thresholds.
Bind the resulting evidence to the release manifest.
A clean head analysis alone cannot prove a different PR merge SHA.
Where managed setup supplies complete candidate coverage, reuse it.
If it cannot cover the required subject or schedule, prepare explicit reusable CodeQL for the necessary languages with minimal `security-events: write` on scanning jobs only.
Verify required action pins/allowlist, CodeQL terms and effective categories.
Coordinate the GitHub-supported default-to-advanced switch with the owner while merges/releases are held against missing results.
Preserve scheduled scanning and the ruleset throughout.
Restore default setup and verify fresh analyses if the replacement cannot supply them.
[GitHub code-scanning API](https://docs.github.com/en/rest/code-scanning/code-scanning#list-code-scanning-analyses-for-a-repository) · [Advanced setup transition](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configuring-advanced-setup-for-code-scanning)

**Proof and exit.**
The qualification manifest must reject wrong SHA/ref, missing language/category, errored or stale scans, unauthorized threshold changes, changed locks, a mismatched SBOM and documentary approval for different bytes.
Include successful and blocking cases in the release aggregate and governance tests.
Use real GitHub analysis metadata as the hosted oracle and registry/lock inventories as independent package oracles.
A green PR, an old rc.3 exception or a signed tag alone cannot release this candidate.

### SLICE-005 — Stage one qualified tarball for the owner's npm approval

**REQ-02, 04, 05.**
Replace the prospective direct publisher with admission of an exact successful release-qualification run and original attempt.
Verify the closed artifact inventory, archive and tarball digests, source/version and documentation preflight at the captured protected-main commit.
Require the canonical tag to be absent at candidate preparation and recheck its absence before private staging.
Reuse the authenticated `release-manual` and `npm-release` decisions where they cover the same effects.
A changed controller must establish an independently reviewed control-only delta back to the original source.
If package inputs change, freeze a new candidate.

Separate SemVer identity, initial npm tag, support designation and GitHub release classification.
Today [releaseChannel](../../scripts/package-identity.mjs) derives `next` or `latest` from the version.
The [projector](../../scripts/project-package-version.mjs), [workflow metadata](../../scripts/workflow-metadata.mjs), [evidence constraints](../../scripts/release-version-schema.mjs) and preflight enforce that relationship.
Replace it prospectively with reviewed release intent, retaining native SemVer validation and strict historical schemas.
Use a safe packed default of `pilot` for new releases and confirm with npm's actual stage reader that the approved explicit tag prevails.
Carry an invalid coordinate and an unapproved tag through the normal caller to prove no normalization admits them.
If provider/config precedence contradicts the selected channel, stop before staging and correct the source/intent contract.
Never edit or repack an admitted tarball to change channels.

The stage job runs on an admitted GitHub-hosted runner with `id-token: write` for its single bound environment, no repository write and no permanent npm credential.
Execute pinned, minimal writer tooling from trusted source in a sibling directory.
No application install, lifecycle scripts or candidate-controlled code in a writer.
Authenticate inputs by provider ID/digest, then stage the retained tarball through native `npm stage publish` with public access, explicit tag, provenance and scripts disabled.
Retain the native stage identifier and authority for exactly that item.
Apply OwlAPI's [qualified late-tag gate](../implementation-plan.md#p20-late-tag-001) in this order:

1. In an authenticated npm session, the owner inspects the original stage ID and checks the scoped name, version and selected channel.
   Download that stage's tarball with `npm stage download <stage-id>`, compare its SHA-256 and npm integrity to the frozen candidate, and run the required staged-package checks.
   If the identity or bytes differ, stop before signing and reconcile or reject the original stage.
2. After the private copy passes, the owner signs and pushes the annotated `vVERSION` tag on the exact qualified commit.
   A read-only job verifies the tag object, commit and signer against the existing signer registry.
   A separate GitHub-only writer prepares the draft with the available pre-publication assets and verifies their identities. Record the draft ID.
3. After the draft passes verification, the owner approves that same npm stage ID with interactive 2FA.
   Record the stage ID, expected and observed digests, tag object, draft ID and approval outcome without retaining credentials.
   If a deterministic defect requires different bytes after signing, preserve the signed tag and follow the [version-abandonment policy in §2.60](../implementation-plan.md#260-decision-qualify-and-where-possible-stage-before-creating-the-immutable-canonical-release-tag).

Pending approval, rejection, ambiguity and public availability are distinct states.
[npm staging and interactive approval](https://docs.npmjs.com/staged-publishing/) · [Existing tag verifier](../../scripts/verify-release-tag.mjs)

Use separate top-level npm connections for staging and later tag administration where available.
Verify that direct publishing is disabled and limit dist-tag access to the tag writer. npm grants staging capability to a trusted publisher, including one also permitted to manage tags; record this residual authority and restrict its workflow/environment and code accordingly.
Switch off the old direct and historical bootstrap paths before activating the new writer.
Qualifying-only execution reaches no publication environment or write job.
Never probe real stage access using a dummy release.

**Proof and exit.**
Use fixtures for each stable/RC and pilot/latest combination, wrong signer, missing scope, mismatched run attempt/digest, unexpected `publishConfig`, denied environment, prior unresolved stage and retry after lost acknowledgement.
In the inspected npm 12.2.2 CLI, stage publishing delegates to the publish implementation, which gives explicit CLI flags precedence over matching packed settings.
Exercise that exact CLI on a retained tarball with a controlled registry to check the requested tag and integrity at the receiving boundary.
A recording provider must see exactly one stage request for a valid intent, zero direct publishes, and no credential fallback.
Exercise a changed byte in the private download and a wrong stage ID or channel: each must stop before tag creation.
Prove that a wrong signer or failed draft verification blocks npm approval, and that post-publication evidence can attach only to the verified draft ID.
A second run encountering an existing request enters read-only reconciliation.
The first separately authorized real stage verifies the actual npm binding, tag, stage ID, bytes and approval.
[npm 12.2.2 stage entry](https://github.com/npm/cli/blob/v12.2.2/lib/commands/stage/publish.js) · [npm publish implementation](https://github.com/npm/cli/blob/v12.2.2/lib/commands/publish.js)

### SLICE-006 — Verify public recipients and seal the immutable release

**REQ-02–05.**
Admit the original stage and owner disposition in a separately runnable read-only registry workflow.
Start the existing availability budget at the relevant public approval/observation boundary, distinguishing submission, approval and measured availability times.
Reuse the immediate read, approximately minute-spaced probes and one monotonic 30-minute budget in [availability policy](../release/availability-policy.md).
Retry only bounded transport or approved pending states.
A temporarily absent coordinate/selected tag or an explicitly recorded predecessor may converge.
A third value, mismatched bytes, registry identity, signature or provenance fails immediately.
A public 404 cannot justify another publication.

Rework [public qualification](../../scripts/qualify-public-registry.mjs) to authenticate the original publisher run/attempt and controller explicitly.
Its current consumer path uses the verifying run's environment.
Bind the verified npm provenance subject SHA-512 and workflow/certificate identity to the actual staging publisher.
Compare anonymous registry bytes to retained SHA-256 and registry SRI.
Exercise fresh scoped and alias installations with clean caches/no ancestor hoisting, graph and documentation equivalence, signatures and public behavior.
Reuse the frozen runtime/OS recipients with registry acquisition for the new public proof; distinguish browser/Java proof over the identical retained bytes from fresh public installs.
Never unpack a candidate in a privileged verifier.
Preserve failed native evidence and the operator's exact pending action.

After public qualification, the GitHub-only contents writer reopens the draft ID recorded before npm approval and adds the public verification evidence.
Fail if the draft is missing or substituted. Verify the tag object, commit, release ID and each asset before sealing that same release.
Keep the four familiar public subjects (tarball, SBOM, `SHA256SUMS`, release evidence) addressable under their existing roles.
Add a versioned evidence archive with a closed, digest-indexed inventory when original proof bytes would otherwise expire.
Preserve signed approvals, source/controller linkage, original provider IDs/attempts, qualifications, rights and security dispositions, provenance and writer journals.
Keep required corresponding source or independently verifiable preserved source as required for the shipped materials.
Put post-seal effects in signed history that references the immutable release.
An archive cannot attest its own later publication.
Verify the immutable ID, tag, exact assets and native release attestation using the existing final verifier.
GitHub permits subsequent classification changes on the same release.
[Finalization](../../scripts/finalize-github-release.mjs) · [Immutable verification](../../scripts/verify-immutable-release.mjs) · [GitHub immutable release semantics](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)

The current immutable verifier enumerates exactly four assets and its published-release assertion defaults to prerelease.
The finalizer sets `make_latest` false.
Introduce a versioned inventory and an explicit expected classification at draft, seal and promotion.
Thread both through the initial GET, polling loop and final readback; require the closed historical four-asset inventory for rc.3.
Store an archive's digest in the release evidence and compute the evidence file's digest externally to avoid a self-referential manifest.
Reconcile every asset with authenticated provider metadata and independently verify its downloaded bytes.

**Proof and exit.**
Use independently computed package hashes and npm/GitHub readback.
Exercise a forged publisher run, correct version with different bytes, incomplete asset inventory, unexpected prior tag, stale receipt, accepted-but-pending registry response, timeout and a successfully verified rc.3 historical archive.
The old reader accepts authentic historical evidence.
A current release with insufficient evidence fails.
Repeat read-only verification in a fresh run after suppressing access to the producing run's transient artifacts.
Demonstrate that failed verification cannot create a second stage or overwrite a published asset.

### SLICE-007 — Promote, restore and reconcile individual effects

**REQ-04–06.**
Implement one scoped-package operation for stable promotion, completion of explicit stable `latest`, preview designation, withdrawal, restoration and interrupted-operation reconciliation.
Apply the pre-stable and post-stable `next` rules from the channel contract, including the explicitly opened preview line and the verified successor RC.
The owner binds operation type, exact source and target identities (or explicit tag removal), relevant release IDs and digests, expected current npm tags and expected GitHub latest ID or absence.
Freeze the exact operation bytes and digest.
For a defective production release, restore `latest` to the previous known-good qualified stable. If the first stable has no such predecessor, temporarily remove `latest` while qualifying the correction.
Before the first stable, withdrawing a completed RC that the owner explicitly put on `latest` is a new incident operation.
With separate owner authorization, restore npm `latest` to its safe, security-supported RC predecessor after verifying its original qualification and immutable archive under the contract that produced it.
If there is no eligible predecessor, temporarily remove `latest`. In either case guard the GitHub prerelease classification and GitHub latest ID or absence.
If `next` also names the withdrawn RC, separately authorize restoring it to the most recent supported, verified RC or removing it if none qualifies.
Check the expected current tag immediately before each change and verify the registry result. Record the incident, actor, approval and before/after values for each effect.
Deprecate the exact defective version under separate authorization when disclosure is safe. Qualify the correction before assigning the affected tags, following the [bad-release policy in §2.33](../implementation-plan.md#233-decision-correct-bad-public-releases-without-erasing-ordinary-history).
For an interrupted operation, a guarded repair may address only effects attributed to its original journal and provider readback.

Keep all writers, including legacy entry points during migration, in one serialized repository release concurrency group with cancellation disabled.
A pending external npm approval can outlive the Actions run.
Before any new write, inspect prior operations across versions for shared-label conflicts.
Reserve intent against the accepted operation; re-read preimages immediately before each effect.
Record request identity, native acknowledgement when available and independent after-state separately.
GitHub Actions concurrency cannot serialize an out-of-band maintainer command.
A third value or ambiguous attribution stops further writes.
A successful exit or the requested value already being present cannot settle a missing acknowledgement on its own.

The npm tag writer has OIDC and its protected environment only.
It records an authenticated handoff after re-reading affected and guarded tags.
The GitHub writer accepts that exact handoff, rechecks npm and the target release, and applies only the approved classification to the same immutable ID.
A separate read-only completion dispatch checks all guarded tags, stable/prerelease flags, GitHub latest ID or absence, signed tag and asset digests.
Aligned, fully settled inputs yield zero writes.
After npm succeeds and GitHub fails, resume the GitHub part once the npm effect is settled; after a lost npm acknowledgement, investigate the original effect before issuing another.
Completion of a withdrawal verifies the authorized restoration or absence of each affected tag.
Published coordinates and signed tags are immutable.

Before Actions retention expires, retain the complete original writer history, inputs and receipts in a checkpoint signed by the approved owner outside Actions.
Publish the signed checkpoint under a dedicated protected history ref, with its recoverable payload included in the referenced Git objects or a verified immutable asset set.
The observed `v*` and Phase 19A rules cover different namespaces.
Extend protection to the exact history namespace, separating creation from update/delete, and read back rules and signer before admitting a checkpoint.
Keep the signed history and associated assets in the existing off-platform backup.
A moving ref or a digest without its recoverable payload is insufficient.
When source artifacts expire, admit only verified original proof in the signed checkpoint.
Missing or contradictory history yields a blocked write and a named owner investigation.

**Proof and exit.**
Run the state rehearsal against explicit no-op, first stable, stable pilot promotion, RC on `latest`, superseded/rejected stage, foreign handoff, concurrent external tag change, lost acknowledgement at each writer, expired Actions records and missing checkpoint bytes.
Withdraw a completed pre-stable RC with and without an eligible predecessor, with `next` both affected and unaffected. Verify each authorized npm change and zero GitHub classification writes.
After first stable, exercise stale-`next` removal, a pilot RC on an unopened line, and an explicitly opened preview with a verified successor. A failed RC or one from a different line must leave `next` and the stable support designation intact.
Use the recorded rc.3 state as a **legacy read-only** case with zero writes; it cannot satisfy new staging-era proof requirements.
Keep GitHub latest absent for the RC.
Verify that incomplete evidence remains visible and that only the original operation's outstanding effect can resume.
[Publication history](../../scripts/release-publication-history.mjs) · [Approval evidence](../../scripts/release-approvals.mjs) · [Reference recovery operations](https://github.com/Hadden-Industries/json-quality/blob/47752f6257168c46ef65513c09350f60782df7b5/docs/release-operations.md)

### SLICE-008 — Cut over maintenance, retire historical writers and observe operation

**REQ-01–06.**
Carry the reusable runtime checks into maintenance and share evidence-acquisition steps with extended tests at matching trust/OS boundaries.
The [maintenance health reader](../../scripts/maintenance-published-health.mjs) currently treats a channel other than `latest` as absence of production.
Read the most recent completed support designation, the expected public labels and their provider values independently.
Keep the reporter limited to `issues: write`, consume its same-run immutable input and preserve its deduplication/closure behavior.
Extended observations must still report incomplete or unavailable platforms truthfully.
Preserve dependency update coverage for Actions, the root and transport npm graphs and uv.

Update contributor and release operations guidance with the actual check name, deliberate trigger, observer outcomes, qualification versus release steps, protected writer identities, support line, exact public queries, settlement and restoration.
Verify all consumers of changed workflow names, step IDs and evidence schemas across code, tests, governance, docs and generated runtime/gate projections.
Preserve original alpha/rc.1/rc.2/rc.3 records and provenance readers.
Remove hard-coded direct/rc.3 write paths, stale secrets or trusted connections only after operation reconciliation, replacement readback and owner-authorized provider cutover.
Do not repurpose the unscoped alpha draft.

**Proof and exit.**
Compare an old and new maintenance report, a missing consumer lane, an introduced health fault and a successful recovery.
Verify reporter permissions and that repeated reports converge on the same finding.
Exercise successful and failing shard aggregation with a missing shard/wrong OS.
On hosted cutover observe one deliberate PR, one main decision and its appropriate follow-up, one qualifying-only release run and a rerunnable completion read.
The next owner-approved release supplies evidence for real stage/approval, public availability, archive and completion.
Until then mark those boundaries as awaiting live verification.
Product release readiness remains on the 0.1.0 roadmap.

## Execution, evidence and rollback

| Order                       | Integration decision                                                                                                                                                                                             | Abort or recovery                                                                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 → 002                   | Keep a top-level `CI / required`. Obtain a native hosted PR proof with the same obligations before retiring duplicated jobs.                                                                                     | Restore the previously reviewed workflow and matching verifier/policy together. Invalidate incompatible receipts and rerun full qualification.                                               |
| 002 → 003 and 004           | PR/main orchestration and release-security admission can progress separately once the candidate/receipt interface is fixed. Coordinate changes to shared policy, aggregate and allowlist through the maintainer. | Keep automatic main full fallback or existing managed scans until each replacement returns usable evidence. Hold affected merges/releases if protection cannot verify coverage.              |
| 001 + 004 → 005 → 006 → 007 | Implement and rehearse the whole writer chain with provider fakes before activating the first write. Exercise the read-only paths independently.                                                                 | Disable prospective writers or revoke their provider permission, preserve the exact stage/draft/history and continue read-only reconciliation. Reverting YAML cannot undo a provider effect. |
| 002 + 003 + 006 + 007 → 008 | Verify that no live operation still depends on a retired filename or credential; update the owner runbook and snapshot effective settings.                                                                       | Restore the last working **read-only** verification path if necessary. Resume an existing write only against its original authenticated evidence and scope.                                  |

**Verification selection.**
In implementation, use the maintained Jest entry point, for example `npm test -- --runInBand --runTestsByPath scripts/ci-verification.test.js scripts/require-job-success.test.js scripts/workflow-governance.test.js`.
Use the release-state, approvals, publication-history, public-registry, provenance, immutable-release, maintenance and artifact-transport suites for the respective slices.
Add narrow cases where the new behavior lacks an oracle.
Run `npm run verify:workflow-syntax` with the repository-pinned actionlint, `npm run verify:workflow-governance`, `npm run check:node`, `npm run check:version` and `npm run verify:release-gates` after changing the corresponding controls.
Exercise `npm run rehearse:release-state` without live writers.
Repository HISEW profiles are `focused`, `affected` and `full`.
Use focused diagnostics during development, affected integration and the routed R2 full relevant verification plus independent review of workflow authority, provenance and recovery on the frozen implementation.
Local fixtures control only GitHub/npm response sequences, clocks and faults.
Real protected checks, provider permissions, OIDC provenance, native OS/browser executions and immutable release reads require evidence from their owning systems.

**What the operator measures.**
For comparable PR and main revisions capture job count, critical path, billable runner minutes by OS, full/installed-only dispatch count, cause of full fallback, packs/installations and bytes retained by named consumer.
For each release surface the source, controller, candidate digest, original attempts, stage ID, last settled effect, current and expected channels, and the next permitted action.
Compare one-day transfer evidence, current 14/90-day artifacts and durable proof by consumer before adjusting any retention.
Obtain expiry-survival proof before shortening operational retention.
Reassess if acquisition cost, archive bounds or the supported runner matrix invalidate the design.
No elapsed-time or cost reduction is assumed.

**Decisions at intake.**
The owner approved the staged path for the next ordinary release, private byte verification before signing, the `pilot` default, explicit `latest`, the `next` lifecycle and pre-stable RC withdrawal described above.
The deliberate PR/main cutover, protected writer settings and checkpoint location are implementation-baseline decisions.
Prefer existing supported controls.
Choose the smallest hosted observation at the first uncertainty: strict-check behavior for an updated PR, complete CodeQL categories at the exact SHA, the npm package's permitted OIDC operations, or recovery from archived bytes without Actions.
A refusal at one boundary holds only its dependent effects.
Record version, source, licence/terms and applicable permission assessment for any new action, CLI or provider feature before adoption.
Keep disclosure of private security evidence within the existing owner process.
A changed package family, support obligation, signer, public contract or inability to attribute a provider write reopens the affected decision.
