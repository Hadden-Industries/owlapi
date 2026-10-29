# OwlAPI release and CI evidence reuse reconciliation

**Date:** 29 October 2026.
**Status:** Implementation reconciliation for SLICE-006 of the [0.1.0 roadmap](2026-10-29-0.1.0-release-reconciliation.md).
The local implementation below has scoped tests; hosted confirmation and candidate qualification remain separate.
No publication is authorized here.

## Evidence and transfer boundary

The owner requested reuse of the lessons from the JSON Quality modernization/release work.
The named chat's final records report rc.2 fully published and PR 14 merged with main qualification reporting REUSED.
The repository inspected for this plan was `Hadden-Industries/json-quality` at `33c95858d316ca3cdabf319a2705f9161d44e7e5`; published rc.2 remains frozen at `975817c`.
The documentation and selected implementation diffs below were inspected directly, rather than treating chat completion as evidence of a particular algorithm.

Primary source descriptions are its [CI trust contract](https://github.com/Hadden-Industries/json-quality/blob/33c95858d316ca3cdabf319a2705f9161d44e7e5/docs/ci-trust.md) and [release operations](https://github.com/Hadden-Industries/json-quality/blob/33c95858d316ca3cdabf319a2705f9161d44e7e5/docs/release-operations.md).
They retain historical and proposed states as well as delivered behavior; read the implementation and final release records before adopting a claim.

OwlAPI already implements much of the foundation in [ADR 0011](../adr/0011-full-ci-qualification-lineage.md), [ADR 0012](../adr/0012-gated-native-java-reference-reuse.md), [artifact transport](../release/artifact-transport.md), release-state modules and producer gates.
The producing-attempt repair merged as `e113c3f5f42eca4c8611b2b6251cea90a1cfc583`; later transport and read-model work is included in the observed main baseline.
Do not plan a second copy of those completed features.
Compare current tests and code with the following failure modes, record delivered/partial/missing disposition, and repair only demonstrated gaps.

## Source-grounded lessons and OwlAPI proof obligations

| JSON Quality source                                                                                          | Lesson established by the inspected change                                                                                                        | OwlAPI application and falsifiable proof                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [8efc6d5](https://github.com/Hadden-Industries/json-quality/commit/8efc6d5e759b8104add785c145700a65c6fa96c1) | Authenticate merged-PR proof with the current GitHub API and workflow permission boundary.                                                        | Recheck PR association, head/base/merge tree and same-repository trust using supported native fields. A foreign PR, rewritten merge or missing field cannot establish reuse.                                                                                                                               |
| [ea109dd](https://github.com/Hadden-Industries/json-quality/commit/ea109ddb481d658bd5b2f5bcc746dc9fda3027f1) | Native job registration can lag completed predecessor status.                                                                                     | Allow a bounded observation window only for missing expected entries or pending entries without conclusions. Failed, duplicated, foreign or malformed jobs refuse immediately. Require complete latest and attempt-specific inventories before provenance admission.                                       |
| [c657f2b](https://github.com/Hadden-Industries/json-quality/commit/c657f2b0efa45418fd4f1b68c51b21184f69c68e) | Incidental image build differences need not invalidate equal-input consumer qualification.                                                        | Compare the supported OS family, architecture and selected runtime/tool inputs, while retaining original `ImageVersion` provenance. Add OwlAPI's macOS arm64 contract explicitly. Changed OS/architecture/runtime or missing image provenance remains ineligible.                                          |
| [e1a250a](https://github.com/Hadden-Industries/json-quality/commit/e1a250a7b87ec96a62243ec4bac0dcfc8c62fe9b) | Verified reuse metadata must reach the workflow, and output failure must not be swallowed as an ordinary cache miss.                              | Assert emitted mode/source/run/attempt/artifact fields, log/summary identities and required-output failure behavior. A broken output sink cannot produce apparent acceptance or lose original proof metadata.                                                                                              |
| [6b6db5f](https://github.com/Hadden-Industries/json-quality/commit/6b6db5f6521b2fea9cbd1b636a9b05062d1e60a5) | Slow valid artifact responses must share the intended total budget, without competing short socket limits defeating it.                           | Separate metadata and binary transfer budgets, retain cumulative bytes across retries, and include redirects/readback/extraction in the owning deadline. Test slow progress, stalled reads, excessive bytes and hostile redirects.                                                                         |
| [2a8320c](https://github.com/Hadden-Industries/json-quality/commit/2a8320cd6bf125dfb27185502fc17256c367aa83) | Compact proof archives reduce asset pressure; owner-reviewed npm tags remain separate from GitHub prerelease status.                              | Verify archive writer-to-reader compatibility, outer digest and every indexed member; preserve OwlAPI's accepted channel policy. An RC under npm `latest` remains a GitHub prerelease and is not stable 0.1.0.                                                                                             |
| [2a6e088](https://github.com/Hadden-Industries/json-quality/commit/2a6e0889b42b7790de46e120c5a3fc1b7354ab14) | Release qualification must use real consumer dependency semantics; registry visibility and guarded restoration need explicit recovery boundaries. | Exercise actual consumer npm dependency graphs/SBOM/offline reinstall, including optional/development overlap. Observe exact approved registry bytes within a finite window. Preserve original label guards and journals across successive partial recoveries; never repeat an observed successful effect. |
| [027f16c](https://github.com/Hadden-Industries/json-quality/commit/027f16cbbfa06f01b552fb5cb618dd4fc534b252) | Immutable-release attestation indexing can lag successful publication; broad cryptographic retries hide authorization and integrity failures.     | Before native verification, observe the exact tag/release's typed attestation inventory and recheck release/source/assets. Only typed pending visibility with a positive same-token attestation control may wait. Native cryptographic verification then runs once; its failure is not retry authority.    |

JSON Quality's concrete read/transfer/registry time budgets are evidence about its operation, not automatic OwlAPI constants.
Choose OwlAPI bounds through the existing policy owner, the admitted artifact sizes and measured provider behavior; validate step/job deadlines contain them.
Keep behavior and security tests independent of the production decision implementation.

## 1. Qualification reuse contract

Preserve direct-original FULL proof, not a chain of reused receipts.
Admission must bind the repository, original run and producing attempt, tested commit/tree/parents, trusted workflow and policy bytes, locks/dependency selectors, fixtures, generated contracts, profile definitions and selected runtime/host inputs.
Artifact identity includes provider ID, exact size, digest, expiry and source context; repeat mutable readback after transfer when the existing trust contract requires it.
Reuse is ineligible for an incomplete inventory, failed/cancelled/skipped required lane, ambiguous origin, unsupported schema, changed relevant input, missing/expired payload or untrusted producer.

Partial reruns must retain each successful job's actual producing attempt, authenticated by its original execution identity.
GitHub can relabel retained copies with later job IDs or attempt labels; those labels alone are not execution provenance.
The latest complete native inventory must still satisfy required success, and the receipt must identify the direct original execution of each result.
The existing OwlAPI comparison of name/run/head/runner/start/completion is the reuse seam to inspect and extend.

Runner build identifiers are provenance, not universally the compatibility key.
Classify inputs by the result they can affect: consumer runtime proof may tolerate incidental image churn; native Java builds, compilation, source-bound artifacts, security scans and timing measurements have additional toolchain/environment dependencies.
Do not reuse performance measurements merely because ordinary functional consumer proof is reusable.
A newly selected JDK, provider, dependency or benchmark protocol invalidates affected proof.

Current OwlAPI behavior determines the fresh-qualification fallback until a separate trigger policy is adopted.
JSON Quality's ready-for-review-only PR trigger and manually dispatched FULL fallback are repository-specific; this plan does not transplant those triggers or disable OwlAPI checks.
The useful distinction is explicit `FULL`, verified `REUSED`, and unavailable/changed proof with its reason.
A fallback decision and a failed output/reporting operation must remain distinguishable.

Shared Java build-product reuse remains disabled under the current `JAVA_REFERENCE_POLICY`.
Enabling it requires current source/dependency/JDK compatibility, rights/catalogue admission, trustworthy native provenance and demonstrated bounded recovery/benefit.
Even admitted build-product reuse does not reuse a semantic verdict: compile the current harness and execute the required current comparisons.

## 2. Release sequencing and original identity

Retain OwlAPI's exact-artifact, protected-main, signed-tag and separated-permission model unless a reviewed control change replaces a concrete part.
Resolve the actual supported npm publisher route and connection before dispatch; JSON Quality's multi-package staged journey is not proof that OwlAPI's current DIRECT_OIDC or a future staged connection has the same capabilities.
Do not create bootstrap/dummy versions or change account/environment settings as a rehearsal.

The logical sequence is:

1. Freeze the intended source, member/profile contract, runtime/dependency identities and candidate version.
2. Qualify the exact retained package, full producer inventory and security/rights evidence; record a digest-bound owner decision external to its frozen subject where appropriate.
3. Verify the intended signed tag/source and publisher controls at the permitted late-tag boundary.
4. Before each authorized external write, retain the exact intent and expected prior state; issue that write once.
5. Reconcile actual public state, verify exact registry bytes/integrity/provenance/channels, then complete immutable GitHub archival and native asset/attestation verification.
6. Retain durable original evidence and close the producer release only after readback satisfies every required result.

Release qualification creates or independently admits the exact commit-bound release candidate.
Ordinary PR-to-main CI reuse is not permission to publish an old PR tarball as a new release.
An orchestration-only recovery may reuse already-qualified exact bytes only under the existing explicit reconciliation contract, preserving original package source, qualification and publisher attempts.
If a newer controller is needed, independently bind its reviewed control delta and keep controller provenance separate from package provenance.
Changing package bytes, version or required semantic inputs creates a new candidate.

OwlAPI's accepted policy allows `next` and `latest` to identify a public RC; npm `latest` does not assert stability.
Stable preparation must reconcile the accepted treatment of `next`, rather than inherit JSON Quality's `pilot` tag or stable-promotion restrictions.
Every tag/label operation retains its own expected-before and observed-after state.

## 3. Read recovery, write ambiguity and durable evidence

Classify ordinary transient transport/status/rate-limit failures through one existing bounded read policy.
Provider-specific visibility delays need typed pending states, exact identities and finite shared deadlines.
Do not retry malformed JSON/schema, size/digest mismatch, unauthorized access, invalid provenance or failed native cryptography as if they were availability problems.
Honor retry hints only within the remaining budget and retain bytes consumed by failed transfers.

Registry observation may wait for the exact newly approved coordinate to become visible; it does not grant another publish attempt.
Attestation observation must hold release ID, signed tag/source, immutable/draft/prerelease state and exact assets constant.
A missing/empty inventory is waitable only when the positive authentication/readability control succeeds; a generic CLI message cannot distinguish these cases safely.

An unknown write outcome leads to read-only reconciliation of the original intent and exact remote identity.
Do not rewrite the journal, substitute the newly observed value for the old guard, or automatically replay a mutation.
If an approved recovery involves another service after one effect succeeded, preserve the original prior-state checks across all subsequent recovery records.
Competing label changes, unknown effects and missing original intent remain blocking for an accountable decision.
Restoration uses a separately accepted already-qualified immutable target; it cannot undo downloads or replace a consumed version.

The evidence bundle needs original source/artifact identities, complete required native inventories, producing attempts, archived request intents and outcomes, acceptance decisions, package graph/rights/security evidence and exact public readback.
Validate both the archive container and member manifest; exercise a real writer-to-reader round trip on supported hosts.
Separate compact proof limits from payload/metadata limits rather than raising one limit to cover every class.
Retain original evidence before provider artifacts expire, with a named consumer, owner and renewal checkpoint.
A green historical run or a public version string cannot recreate missing original bytes.

JSON Quality still records held recovery cases, including unknown draft-asset uploads, abandonment of unpublished partial stages and restoration after certain provider records expire.
Those are not solved capabilities to copy.
OwlAPI must state its own supported recovery cases and stop explicitly outside them.

## 4. Implementation seams and verification handoff

Predicted owners are the current CI coverage/reuse modules, `scripts/java-reference-state.mjs`, artifact-transport tooling, release-state/evidence/approval/reconciliation modules, and their existing tests and workflows.
Confirm the owning call paths before editing; similar names do not justify a replacement subsystem.
Reuse supported native GitHub/npm/package-manager interfaces and current schemas.
No new generic resolver, evidence service, credentials channel or cross-repository controller dependency is proposed.

The gap assessment must produce a small delivered/partial/missing table for the eight source lessons above, tied to exact OwlAPI commits/tests.
For a missing behavior, first reproduce the failure with provider-shaped immutable fixtures or a bounded read-only live observation, then repair and test the smallest owning seam.
Mutations are mocked only at the genuine provider boundary; required authorization/provenance/transition logic executes normally.
Hosted confirmation must use controlled non-publication qualification or an explicitly authorized release continuation.

Required negative controls include changed runtime/JDK/lock/profile/fixture inputs, unsupported platform, missing image provenance, forged original attempt, incomplete latest inventory, duplicate jobs/assets, expired proof, digest mismatch, broken workflow output, delayed indexing with failed authentication control, conflicting prior labels and lost write acknowledgements.
Positive controls include compatible image churn, valid partial reruns, bounded registration/registry/indexing delay, and read-only recognition of an already completed effect.
Complete source/JSON/Markdown/workflow governance and the impacted native consumer tests before integrated producer qualification.
This design adds no release authority and no automatic retry of an external write.

## 5. Local implementation disposition, 29 October

This increment builds on local `a27dec8b` and the accepted intake `1ecafc6d`.
The source lesson IDs refer to the linked commits above; statuses describe implementation and local proof, not hosted release acceptance.

| Lesson    | Disposition and owning proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `8efc6d5` | Delivered at intake: `ci-verification.mjs` authenticates native PR association, exact merge tree/parents, workflow, original attempt and artifact readback. Existing negative controls in `ci-verification.test.js` are retained.                                                                                                                                                                                                                                                                                                                                                                            |
| `ea109dd` | Delivered locally: native latest and required producing-attempt jobs receive a maximum thirty-second observation window within the existing reader's shared request budget. Only missing or pending required jobs may wait; duplicate, foreign, malformed and unsuccessful required jobs fail immediately. Preceding attempts may legitimately omit a job or contain its failed predecessor. Provider-shaped delayed/latest/original and deadline tests pass.                                                                                                                                                |
| `c657f2b` | Delivered locally: receipt schema 6 and qualification policy 8 compare supported collector OS, architecture, image family and Node runtime, retaining the original image build and host in direct-source provenance. Main collection may use a newer build of the same admitted image. Forged original-host fingerprints reject. The collector remains Linux x64; existing consumer coverage still owns Windows and macOS arm64 lanes. Java build reuse and timing reuse remain disabled.                                                                                                                    |
| `e1a250a` | Delivered locally: emission occurs outside proof fallback, validates all output fields before writing and requires `GITHUB_OUTPUT` on Actions. Tests bind actual verified source/run/attempt/artifact values and reject output, summary and stdout failures. A reporting error fails the command.                                                                                                                                                                                                                                                                                                            |
| `6b6db5f` | Partial: artifact transport already shares cancellation/deadlines through SDK workers, verification and materialization; it bounds admitted copy sizes and total collected payload. Installed SDK inspection confirms its thirty-second timer resets on each chunk, permitting slow continuous progress. Its internal five download attempts do not expose consumed wire bytes through the public interface; exact cumulative bytes across those retries are not yet proved. Immutable-release assets now use one bounded transfer with exact size checks, an approved redirect and a shared total deadline. |
| `2a8320c` | Delivered at intake: `release-artifacts.test.js` exercises real deflated/stored ZIP and gzip-tar writer/readers, indexed content and unsafe/corrupt archive rejection. Candidate/proof identities remain digest-bound. Existing RC channel policy is retained: npm `latest` does not change GitHub prerelease status or assert stability.                                                                                                                                                                                                                                                                    |
| `2a6e088` | Partial: ordinary registry graphs, root development tooling, native provenance and offline installation are retained; registry availability tests cover exact bytes/channels, thirteen-minute delayed visibility and a finite thirty-minute observation window. Release reconciliation and `recover-rc2-finalization.test.js` preserve original successful qualification/publication and recover only reviewed exact intent. There is no general automatic label-restoration facility or authorization; unsupported recovery still stops for an accountable decision.                                        |
| `027f16c` | Delivered locally: typed attestation observation holds the signed tag object, source commit, release ID, state and exact asset digests constant. A positive same-token read is required before waiting on empty/404 visibility. Native cryptographic commands run once each and their failures are terminal. Tests reject changed identities, unauthorized/malformed controls, byte corruption and exhausted deadlines.                                                                                                                                                                                      |

OwlAPI has a GitHub immutable-release attestation for rc.2, independently observed through authenticated read-only API calls; it does not have a GitHub build-attestation inventory to use as this control.
The control therefore selects that existing same-repository **release** attestation by immutable tag-object SHA `79699c3816912084202551dc2e043a12e081a3ef`, with repository ID `1347610640`.
This proves only that the same credential can read the relevant attestation service; it never authenticates the new candidate.
The candidate's exact signed tag, release/assets and one-shot native cryptographic verification remain mandatory.

Immutable verification has one nine-minute total budget inside its existing ten-minute workflow step, with at most three minutes for indexing, sixty seconds per native command or asset transfer, and a 64 MiB per-asset ceiling.
Metadata reads reuse the typed bounded GitHub reader; authentication, malformed data and signature failures are not generic retries.
Release writes retain their existing once-only behavior and read-only ambiguity recovery.

The local fault-injection results do not establish hosted Windows/macOS transfer behavior, fresh candidate acceptance or live publication recovery for a successor.
No workflow was dispatched and no package, tag, release or registry label was written during this increment.
The two partial rows retain their limits explicitly for the remaining implementation and eventual candidate handoff.
