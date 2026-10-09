# rc.2 finalization recovery

The owner authorized this narrowly reviewed recovery on 10 October 2026 after both publication attempts were retained.
Release run `37995865867` published the approved package in attempt 1.
Attempt 2 passed public registry, signature, provenance and consumer verification, then failed evidence generation because GitHub's current approvals-history response was empty.
Both original approvals were previously observed through authenticated API and directly confirmed by the owner.
The signed tag and npm publication remain authoritative; neither is recreated.

## Accepted scope and proof

Recover the existing GitHub draft for `v0.1.0-rc.2` at source `d3f9fdba5ac1409346bf0c59512e3cf23a3c1517`, with package SHA256 `4f04d1456519fb75f23da51fce5174af0d4909ec7ea647cae2f4c9f4dc77b441`.
Preserve publication attempt 1, verification attempt 2 and their actual failed job history.
Finish the fourth release-evidence asset, publish the draft and verify GitHub immutability and all four asset attestations.

Use an exact-release operator recovery tool, outside the published package surface.
It must:

- Admit only this source/run/attempt/tag/candidate and the retained, digest-bound approval observations.
  Label these as earlier operator observations of authenticated API responses, not newly fetched approval history.
  Record the current empty history and the owner's explicit finalization-recovery instruction.
- Independently re-read successful hosted qualification jobs, original protected tag/publisher jobs, publisher deployment status, registered signed tag, retained artifact identities, registry proof and draft asset digests.
  A successful protected job or deployment alone does not identify an approving reviewer; the retained observations and direct owner confirmations establish that separate fact.
- Download and hash the exact server artifact archives and contained reports.
  Require the original registry verification PASS, original publication provenance and current public package/channel/byte agreement.
  Reuse the full fresh consumer/signature/provenance verification already completed in attempt 2.
- Generate schema-5 release evidence using unchanged validators and original workflow identity.
  The workflow fields describe the source evidence, not a claim that the failed evidence job succeeded.
  Add a hashed recovery input record identifying the operator execution, recovery control revision, observation provenance and both failed jobs.
  Retain that input in the signed repository record and operator evidence store.
- Separate read-only preparation from explicit publication.
  Revalidate live source tag, package bytes/channels and exact draft/evidence asset inventory immediately before the first GitHub write.
  Upload the fourth asset once, reconcile ambiguous responses only by reads, then publish once.
  Never replay a possible write.
  Stop on any conflict.
- Verify all downloaded immutable assets and GitHub release/asset attestations with the existing pinned GitHub CLI and validators.
  If publication succeeds but verification is delayed or fails, retain that distinction and recover through reads only.

No npm writes, workflow reruns/dispatches, tag creation/movement, rebuilt package, new dependencies or broad library review belong in this recovery.
General availability polling and durable approval capture for future releases remain separate follow-up work.

## Delivery and review

Commit this plan first.
Consolidate the operator tool, control record and meaningful negative tests before the narrow review.
Freeze the implementation commit before external review.
Review authorization provenance, exact identity binding, artifact tampering, conflicting drafts, partial/ambiguous writes and final attestation verification.
Follow-up reviews cover changed questions only.

Run focused recovery/evidence/GitHub-client tests, applicable lint/format checks and read-only preparation against the real retained release.
Preserve prior full library and hosted evidence with its original identity.
The owner's no-further-local-full-run instruction remains in force; do not launch another full library run for this release.
Commit, push and integrate the recovery records under the existing authority, then finalize the approved release and retain verification receipts.
Keep the observer paused at the already reported terminal run result.
