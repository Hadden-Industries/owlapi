# Staged OwlAPI release operations

## Qualify the committed version

Dispatch `release.yml` on the current protected `main` with its default inputs to qualify already tested CI bytes.
The admission step stops on missing or stale evidence before any product jobs or release-only evidence shards start.
To run a fresh read-only qualification, explicitly set `fresh_qualification=true` and leave `qualification_only=true`.
The fresh route builds its own candidate, and the reuse route carries the original candidate and package-proof IDs through the compact manifest.
Both routes require current ScanCode and managed CodeQL evidence, and neither waits for a protected publishing environment.
Record the release run, attempt, manifest file SHA-256, original candidate artifact ID and server digest.
Inspect the earliest expiry of all referenced artifacts.
Download the qualification manifest and the original three candidate assets.
Inspect the signed rights inventory and candidate-specific benchmark disposition before staging.

The read-only CI admission command, `node scripts/release-ci-qualification.mjs`, checks the protected-main dispatch, original CI execution and two original uploads.
It requires the native dispatch environment, its frozen runtime matrix and a GitHub token with Actions, checks, contents and pull request read permissions.
The main receipt binds source, dependency policy, Java and OWL coverage, and the browser, source, portability and consumer job verdicts.
The original candidate and package-proof ZIPs bind the packed documentation, tarball, SBOM, sums, original audits and recipient graph and lock.
Retain the originating artifact IDs and earliest expiry.
If any required original has expired or conflicts with the native job inventory, select fresh qualification explicitly.
Release-time dependency advisory observations, managed CodeQL, ScanCode with committed reconciliation, and current rights and benchmark dispositions still need their owning release gates.
CI reuse alone cannot stage or publish the package.

## Provider cutover

Before cutover, replay the immutable RC1, RC2 and RC3 evidence.
Download each original `hadden-industries-owlapi-VERSION.release-evidence.json` from its GitHub release, then run `gh release verify-asset vVERSION FILE --repo Hadden-Industries/owlapi` and `npm run validate:release-evidence -- --archived VERSION FILE`.
The archive reader checks the exact attested bytes for that release.
The portable source suite replays the same three records offline on PR and release qualification.
The shared candidate producer also checks that npm preserved the original manifest and lockfile during the production install and compares the generated CycloneDX npm components, including nested dependencies, with the installed production graph.

The 13 November readback found the strict GitHub Actions check `CI / required` (app 15368), CodeQL categories `/language:actions` and `/language:javascript-typescript`, protected release environments, and immutable version tags.
The four-asset rc.3 archive is release 428624178.
Its tag object is `ce92b4820910b079b98c402aa03032ff18a4b923`.
Both `next` and `latest` selected rc.3.
No staged release claim follows from these historical observations.

Before enabling a successor, reconcile prior operations and read back package settings.
Bind stage-only npm OIDC to `stage-release.yml` / `npm-release`, and tag administration to `release-labels.yml` / `npm-tags`.
Require owner approval on protected main.
Disable direct publishing and retire the alpha/rc.3 credentials and provider bindings after reconciliation. Apply separate creation and immutable update/deletion rules to `refs/tags/owlapi-release-history/*`.
Qualify one deliberate PR, the main observer and manual full dispatch, an installed-only diagnostic, and a qualification-only release on GitHub.
Keep automatic main fallback until these pass.
The first real stage and interactive approval require a separately authorized candidate.

## Preserve a signed checkpoint

Each protected history ref is an owner-signed annotated tag named `owlapi-release-history/OPERATION` over a commit containing `evidence/checkpoint.json` and the original payload files.
Pass its 40-character **tag object** to a dispatch.
The index has `schemaVersion: 1`, `repository: "Hadden-Industries/owlapi"` and a `files` array of unique flat names, lengths in `bytes`, and hexadecimal SHA-256 values.
Include only regular Git blobs.
In `checkpoint.json`, retain the owner’s native `id`, `updated_at` and `bypass_actors` readback for the history rulesets in `rulesets`.
The hosted reader checks the same live rule revision when GitHub omits bypass actors from its read-only response.
The reader checks signer, protected live ref, exact tree inventory and every byte.
Retain the Git objects and immutable assets in the existing off-platform backup.
Credentials, private scanner details and OTPs do not belong in evidence.

The entire Git tree behind each history tag is public.
Before creating or pushing it, review every blob and set `disclosure: "APPROVED_FOR_PUBLIC_GIT"` on the index and `disclosure: "PUBLIC"` on each entry.
Keep restricted findings, identities, credentials and unredacted reports in owner-controlled private storage.
Commit only release-safe evidence or a public signed disposition referencing a private digest.
A release requiring restricted evidence bytes stays blocked until an approved public proof or confidential verification route exists.
Filtering the eventual release archive cannot remove material already pushed to Git.

Use `owlapi-release-history/stage-N`, `labels-N` or `classification-N` under the same namespace for a writer, where N is the next native workflow run number.
The job rechecks its own number and attempt.
For every previous protected reservation include `reservation-KIND-N.json` with its tag object SHA in `object` and a resolved `state` (`SETTLED`, `REJECTED` or `RECONCILED_NO_PENDING_EFFECT`).
Never settle an unresolved external effect.
For a long-lived history, store prior dispositions together in the signed index’s `dispositions` object keyed by their original record filenames.
Every matching protected ref still requires its own exact object and disposition.
These refs survive removal of Actions history.
A skipped run consumes its reservation.
Owner-reviewed managed CodeQL analyses must be at most seven days old, and the stage writer rechecks them before submission.

## Stage and inspect

1. Prepare the successor with packed `publishConfig.tag=pilot` and project its version.
   The owner signs the exact qualified bytes using the [staged publication policy](staged-publication-policy.json).
   Include `stage-intent.json` in the checkpoint with `commit`, `version`, original qualification `run` and `attempt` as strings, `manifestSha256`, `tarballSha256`, selected `channel`, `githubLatestBefore` for the GitHub latest release ID or null, `before` values for pilot/latest/next (null means absent), and `rights` and `benchmark` set to `ACCEPTED`.
   Put the four reviewed rights file digests from the manifest in `rightsInputs`.
   Include disclosure-reviewed `benchmark-disposition.json` with `decision=ACCEPTED` and the exact tarball SHA-256, and bind its bytes with `benchmarkEvidenceSha256`.
   After reading npm's private staging inventory for this coordinate, sign `privateInventory` with the exact `coordinate`, UTC `observedAt`, `pendingCount=0` and `inventorySha256` of the retained private read.
   Keep raw private inventory outside the published checkpoint.
   The read must be less than one hour old and newer than every prior relevant writer.
   Preserve the relevant native writer end time as `lastWriteAt` in its signed reservation disposition.
   Use `lastWriteAt: null` with `requestState: "NO_REQUEST"` only when the original execution establishes that it sent no request.
   Record a `writerCutover` object confirming `directPublishDisabled`, `legacyWritersDisabled`, `stageBindingVerified` and `protectedEnvironmentVerified` from the owner’s settings readback.
   Supply the original dispositions of any preceding stages.
   Start `stage-release.yml` at the qualified protected SHA or use the reviewed controller repair below.
   The read-only admission reports ineligibility before requesting environment approval.
   For a local preview, run `node scripts/staged-release.mjs preflight` with the reviewed dispatch fields and prospective run identity, the actual main SHA, and an authenticated read token.
   After approval in `npm-release`, the writer rechecks original candidate availability, history, private inventory freshness and tag preimages before submitting once.
   It records a request before invoking npm and retains the stage ID and outcome.
2. In the owner's authenticated npm session, run `npm stage view STAGE_ID --json` and `npm stage download STAGE_ID`.
   Save the native view JSON and the original stage journal.
   Run `node scripts/staged-release.mjs verify-private MANIFEST MANIFEST_SHA256 JOURNAL VIEW_JSON DOWNLOADED_TGZ`.
   Save the output as `private-check.json` only on success.
   Compare scoped identity, tag, SHA-256 and npm integrity.
   Run the required installed-package checks against the private copy.
   Reject or investigate any mismatch before signing.
3. Sign the annotated `vVERSION` tag over that exact source and push it under the existing owner release procedure.
   Prepare a signed checkpoint containing the private proof, the three original candidate assets, and reviewed `release-notes.md`.
   Its `operation.json` binds `type: "draft"`, the original qualification `source` SHA, the reviewed protected `controller` SHA (if it changed, include `controller-delta.json` with the original `source`, `controller`, exact `git diff --no-renames --name-only` paths in order, and `decision: "OWNER_REVIEWED_CONTROL_ONLY"`), `version`, `qualificationRun`, `qualificationAttempt`, `manifestSha256`, `stageRun`, `stageAttempt`, `stageId`, `tagObject` and `expectedReleaseId: null`.
   Verify the exact three draft assets and record `draft.json`.
   Reserve the first creation as `owlapi-release-history/draft-VERSION-create-RUN_NUMBER`.
   The writer flushes `draft-journal.jsonl` before creating the draft and records the native release ID before uploading assets.
   Continue missing uploads with `owlapi-release-history/draft-VERSION-continue-RUN_NUMBER`, the original `expectedReleaseId` and `draft-origin.json`.
   The origin binds the original `checkpoint`, `runId`, `number`, `attempt`, `controller` and `journalSha256`.
   An absent draft or missing acknowledgement leaves creation unresolved.
   When resuming sealing, use the same signed checkpoint so the evidence archive reproduces its original digest.
4. From the reviewed controller checkout, set `GITHUB_SHA` to its commit, `GITHUB_REF=refs/heads/main`, `GITHUB_REPOSITORY=Hadden-Industries/owlapi`, a read-only `GH_TOKEN`, and `HISTORY_OBJECT` for a signed `before-approval` operation.
   Run `node scripts/staged-release-followup.mjs before-approval` within five minutes before approval.
   Repeat the check if its window expires.
   It reopens the draft and compares the npm labels and GitHub latest release to the stage intent.
   Preserve `.release/followup/before-approval.json` with its digest in `approval.preapprovalSha256`.
   Approve that same stage interactively with npm 2FA only after the draft readback.
   Preserve `approval.json` with `state: "APPROVED"`, `stageId`, `releaseId` and actual `approvedAt` UTC timestamp.
   An unresolved or rejected stage never authorizes a replacement submission.

### Recover an interrupted stage

If protected main has moved since qualification, keep `stage-intent.json.commit` at the qualified source and add `controller` with the executing main SHA.
Include the same owner-reviewed `controller-delta.json` described in step 3.
Both stage jobs verify the ancestry and exact changed paths.
The writer checks current CodeQL results for the controller and stages the original downloadable tarball.
A change to package inputs requires fresh qualification.
Carry the actual publisher SHA as `stageController` in every subsequent `operation.json` when it differs from `source`.
The signed version tag still points to the qualified source.

Inspect the original native attempt and its journal before choosing a recovery path.

- If admission or download failed and the npm step was skipped, reconcile the original reservation before authorizing another.
  If the writer itself failed before invoking npm, it records a single `NO_REQUEST` row.
  A new reservation may cite `stage-RUN-ATTEMPT.json` with that state, the original `runId`, `attempt` and `manifestSha256`.
  The writer reopens the failed job and the successfully retained original journal.
  A missing journal, `REQUESTED`, or `OUTCOME_UNKNOWN` requires owner reconciliation.
- If npm succeeded and only “Retain original stage journal” failed, continue with **the same stage ID**.
  Preserve the original attempt's jobs API response, including `total_count` and `jobs`, as the `jobs` member of the signed origin receipt alongside `run` and `artifact`.
  Recover the original ZIP, check its REST digest, and verify the paired request and acknowledgement against npm’s private copy in step 2.
  A job conclusion or a stage ID alone cannot authorize a draft.
  The reader retries a 404 for a known artifact ID up to three GET attempts.
  An unavailable original ZIP keeps the release blocked.

## Verify public recipients and seal

Dispatch `release-registry.yml` with a signed `registry` operation and the original private proof, draft and approval.
Include the exact qualified SBOM for the registry job to check against both installed graphs.
The approved stage's publisher identity is the origin of provenance.
Anonymous registry reads qualify bytes, both install spellings and documentation.
Each frozen Linux, Windows and macOS lane exercises the exact version and integrity using its consumer Node/npm pair.
Both install spellings record their production graph and lock digest for comparison with the qualified SBOM.
Public recipient jobs occupy a run-specific concurrency group and release writers recheck the live preimages under their shared queue.
Preserve original run IDs, attempts, native files and failed observations.
A pending public coordinate allows read-only investigation.

Use a signed `seal` operation with the original draft ID, verified `public.json`, `publicRun`, `publicAttempt`, its `publicController` SHA and recoverable source and qualification material.
Preserve native run and artifact metadata in `origin-RUN-ATTEMPT-LOGICAL.json` with `run` and `artifact` as the original REST responses.
Store the verified ZIP in `artifact-ID.zip`.
For the promoted CI candidate and its package proof, also retain the original producer job response as `producer`.
Preserve `public-run-origin.json` with the final native `run`, `latestJobs`, original `attempts` job inventories keyed by attempt, and original `artifacts` inventory.
Successful lanes from earlier attempts keep their original timed job execution and artifact identity when other lanes rerun.
After expiry the reader checks those original identities and bytes in the owner-signed checkpoint.
Include a disclosure-reviewed `public-inventory.json` with `manifestSha256` and a `files` list containing the original qualification ZIPs, rights dispositions and corresponding source material cleared for public distribution.
The GitHub-only writer verifies the public artifact and all lane receipts, adds release evidence and the indexed evidence archive, then seals that same draft.
Reserve it as `owlapi-release-history/seal-VERSION-RUN_NUMBER`.
An earlier seal of the same version can only resume asset work once its signed reservation cites the original `SEAL_NOT_REQUESTED` record.
An earlier `seal-request.json` requires read-only reconciliation.
Submit the resulting `seal.json` in a checkpoint to `release-completion.yml`.
It independently checks the immutable release, tag, all five asset digests and native GitHub release and asset attestations.
Preserve that post-seal receipt in signed history.
If the seal PATCH succeeded but its acknowledgement was lost, use the original retained `seal-request.json` and submit a signed `seal-origin.json` to the same read-only completion workflow.
It binds `runId`, `attempt`, `controller`, original seal `checkpoint` and `requestSha256`.
Completion reopens the original writer artifact and signed intent, verifies the exact published metadata, immutable ID, tag and five assets, and performs no provider writes.

### Check immutable-release settings before sealing

Read `gh api repos/Hadden-Industries/owlapi/immutable-releases` with owner access.
Keep the exact UTF-8 response text, including any final newline, as `responseJson`.
In the signed seal `operation.json`, put `immutableReleases` at the top level alongside `type` and `releaseId`.
It contains `responseJson`, its UTC observation time `checkedAt`, and an `evidence` object with `url` set to `https://api.github.com/repos/Hadden-Industries/owlapi/immutable-releases` and `sha256` computed over that exact response text.
Run `node scripts/staged-release-followup.mjs check-seal-settings operation.json` before dispatch.
The writer checks for `enabled: true` and an observation at most one hour old before uploading the seal assets and immediately before publishing the draft.

If that window expires, keep the original seal checkpoint and partially uploaded assets.
Sign a separate checkpoint containing `seal-settings.json` with `operationSha256` over the exact original `operation.json` bytes and a fresh top-level `immutableReleases` in the same form.
Run `node scripts/staged-release-followup.mjs check-seal-settings operation.json seal-settings.json`.
Dispatch the original `history_object` with the renewal's signed tag object as `settings_object`.
Reserve the renewal for its new native seal run number and include the previous seal reservation and writer dispositions.
If protected main moved after the partial seal, add its current SHA as `controller` in the renewal and include a signed `controller-delta.json` from the original seal controller to the new one.
The writer permits only the same reviewed release-control paths and completion checks the executing controller against the original run.
The evidence archive retains its original bytes and the seal request records which settings checkpoint authorized publication.

## Change labels and complete support

When restoring a pre-staging RC, include its original attested release evidence file under its published name in the signed checkpoint.
The channel workflow checks the original four assets, immutable release ID and annotated tag object against GitHub.
Staged successors require their own `immutable-VERSION.json` completion records.
Historical evidence supplies no fresh staging or publication approval.

Use a separate signed `retire-pilot` label operation to remove `pilot`.
Set `version` to the immutable designated stable release and `retiredVersion` to the exact immutable candidate on `pilot`.
Verify both release IDs and sign the npm and GitHub preimages.
The `npm-tags` publisher needs npm's independent dist-tag permission.
An already absent label requires zero writes.
An explicit `@pilot` install may fail between candidates, while exact-version installs remain available.

For a native retirement refusal, submit a signed `label-refusal-origin.json` to the read-only classification verification route.
It binds the original `checkpoint`, `runId`, `attempt`, `controller`, `operationSha256` and `journalSha256`.
The verifier requires the original failed step and a complete matching npm `E401` for HTTP `401 DELETE` on the pilot endpoint.
Include its original proof in the signed disposition before authorizing a new operation with fresh preimages.

## Evidence storage and recovery

Weekly maintenance retains its exact tarball bundle and per-lane receipts for one day.
The weekly aggregate validates every lane and leaves its outcome in the run.
Ordinary CI diagnostics for July reconciliation expire after 14 days.
Release-capable candidates and their required proof retain the 90-day ceiling.
Only exact completion receipts are uploaded after immutable release verification.

The protected maintenance storage job reports compressed bytes and projected byte-days by purpose.
Cache bytes are measured separately.
An optional signed `retention.json` records `schemaVersion: 1`, the protected-main `successor` SHA, `protectedIds`, `settledRuns`, and the `replayed` inventory.
Each replay item records the original artifact `id`, `runId`, `digest` and `manifestSha256`, a result of `STAGE_SEAL_AND_RECOVERY_VERIFIED`, and affirmative `actionsCopiesUnavailable` and `verifiedBackup` observations.
The operator's separate evidence includes the signed replay and verified encrypted backup.
The report holds candidates if the successor or a required original cannot be proved, or if a writer or consumer still has a claim.
The observer has read permissions and reports eligibility in the job summary.

Signed checkpoint readers validate the complete Git tree and materialize only selected members.
For schema 2 an indexed logical member can list two to sixteen `parts`, each with exact `name`, `bytes` and `sha256`.
The logical member retains its own size and digest after assembly.
Shallow hosted checkouts fetch the verified history tag and load selected blobs by Git object ID.
Keep the public disclosure review and the independent off-platform backup.

After npm acknowledges a label write, the writer allows up to five minutes for the public tag map to converge.
It polls only while the previous approved map is visible or a registry read is transiently unavailable.
A conflicting value stops the operation immediately.
If the deadline expires, retain the acknowledged journal and reconcile by reading the registry before scheduling any further write.

A signed `channel-operation.json` records a unique `operationId`, operation `type` (promote, preview, close-preview or withdraw), version, prior stable and preview line in `support`, complete guarded `before` and `after` tag maps, and `githubBefore` / `githubAfter` with prerelease flag and latest ID or null.
Include the evidence described above for each selected release or restore target.
A preview may explicitly `openLine`.
Withdrawal supplies separate `{tag,target}` entries in `restore`.

Run `release-labels.yml` first.
Check every affected tag and retain the request, acknowledgement and readback.
Freeze the original operation bytes and retain the returned `runId` and controller `commit` in `label-origin.json`.
Dispatch `release-classification.yml` with the same operation and select `github`, followed by `verify`.
When GitHub classification changes, include the original `github` writer’s `runId`, `attempt` and controller `commit` in `classification-origin.json` so completion can check its acknowledged journal.
Record the verified support and label values in `support-designation.json` when the operation completes.
The pre-stable RC and promoted stable support designations have independent lifetimes.
A lost acknowledgement, third registry value or conflicting prior request requires reconciliation in signed history.
Never recreate a version or move a signed release tag to repair publication.

If the original 30-minute availability window has expired, a later read-only registry dispatch makes one bounded observation and records the missed window.
Confirming current availability does not establish when the package first became available.
For a defective stable with a qualified predecessor, the signed withdrawal restores both npm’s default and GitHub’s latest ID.
A first stable with no predecessor can remove the npm default while its GitHub designation remains explicitly guarded.
