# Release availability and durable approvals

The owner requested implementation of the five recommendations from the rc.2 incident on 10 October 2026.
The accepted source baseline is `3bbadb9de121d1d3a43b9b604ab74a4a35a28d86`.
This follow-up changes future workflow behavior; the immutable rc.2 release and its original failed attempts remain historical evidence.

## Accepted requirements and decisions

- REQ-001 / AC-001: Distinguish publication accepted, availability pending, registry available and verification passed.
  Availability alone never proves integrity or successful qualification.
- REQ-002 / AC-002 / QA-001: Probe immediately, then approximately once per minute, completing early when ready.
  Use one monotonic 30-minute deadline covering requests, body reads and waits.
  This initial operating budget is not an npm service guarantee.
  Retain observations and measured delay for later policy review.
- REQ-003 / AC-003 / QA-002: Only the exact submitted coordinate may tolerate a temporary 404.
  Transient network/408/429/5xx reads may retry within the same deadline, honoring bounded Retry-After.
  Invalid metadata, unexpected channel versions, wrong bytes, integrity, signatures or provenance fail closed.
  Existing generic registry reads keep their ordinary 404 behavior.
  Channels may temporarily be absent or point to the explicitly accepted prior release; an unrelated version is a conflict.
- REQ-004 / AC-004 / QA-003: On deadline, retain an availability-incomplete report and observations, identify the pending stage and direct the owner to read-only recovery or npm support.
  Never repeat publication or channel writes.
  Failed-job reruns remain verification-only.
- REQ-005 / AC-005 / QA-004: Capture authenticated environment approvals while each protected gate runs, bind them to repository/source/run/attempt/environment, retain immutable workflow artifacts and validate their server identity/digest before later use.
  Evidence generation may use those retained observations when live history is empty; contradictory live history fails.
  A successful job alone never proves reviewer approval.
  Earlier attempt observations remain explicitly historical.

DEC-001: Reuse Node fetch, AbortSignal and timers, existing GitHub authenticated reads and pinned artifact actions.
No new dependency, publication mechanism, npm authority or library API is needed.

DEC-002: Preserve the owner's override of another local full library run.
Run full relevant release-tool/governance coverage, lint and format checks; hosted CI remains independently required. Consolidate before broad review; external ordinary/security review targets the final implementation commit, with narrow follow-ups only.

## Evidence and research

npm documents pre-install publication scanning, typical delays of five minutes and peak delays of 15 minutes or more, without a service guarantee: <https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/> (rechecked 10 October 2026).
GitHub's authenticated workflow approval-history endpoint is documented at <https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run>.
Our rc.2 incident showed an accepted publication followed by temporary 404s and later empty approval history.
These are distinct availability and retention problems.
Existing built-in APIs and repository artifact validators cover the platform gap; custom code is limited to this release's exact admission policy and durable observation binding.

## Risk route

Risk class: R2.
Decision owner: repository owner, through the current implementation request and existing delivery authorization.
Reasoning: release availability, cross-system workflow and approval evidence affect an irreversible publication boundary.
Potential blast radius: future release qualification and evidence; published package code is unaffected.
Reversibility: revert source before a future release; never undo or replay an external publication.
Principal unknowns: npm has no guaranteed upper availability bound; GitHub live approval history is not durable evidence storage.
Required artifacts: this accepted brief/plan, native requirement snapshot and route, durable availability and approval observations.
Required specialist lenses: independent release-control/security review of exact-coordinate retry scope, single-write behavior and approval provenance.
Required verification: deterministic HTTP/timing/identity regressions, affected release/evidence/governance suites, lint/format and hosted CI.
Required human approvals: existing implementation/commit/push/config authorization applies; no new registry or protected-environment effects are requested.
Maximum sensible autonomy: implement and deliver the reviewed source; perform no release writes or workflow dispatches.
Next lifecycle step: capture baseline, commit plan first, implement the slices below and freeze before external review.

## Vertical slices and proof

| Slice     | Traceability                          | Proof                                                                                                                 | Release and cleanup implication                                                                                                                    |
| --------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| SLICE-001 | REQ/AC-001..004; QA-001..003; DEC-001 | Fake-clock HTTP sequences for delay, bounded request/body waits, channels, timeout and immediate integrity conflict   | Add read-only availability observations; retain failures with always-upload; allow enough workflow time for availability plus strict qualification |
| SLICE-002 | REQ/AC-005; QA-004; DEC-001           | Gate capture, earlier-attempt reuse, wrong identity/digest/reviewer, empty and contradictory history regressions      | Gate artifacts precede npm writes; final evidence downloads and authenticates the exact retained observations                                      |
| SLICE-003 | All; DEC-002                          | Consolidated release-tool/governance tests, lint/format; final-commit independent ordinary/security review; hosted CI | Update normative policy/runbook; preserve old receipts and reconcile only task-created resources                                                   |

Expected seams are public-registry reads and qualification, protected gate artifact capture, release-evidence generation, workflow governance and policy records.
The lifecycle owner integrates all slices.
HTTP and GitHub API responses are external mocking boundaries; production validators remain real in tests.
No package rebuild, tag mutation, registry write, remote dispatch or changed npm permissions belongs here.

Observe accepted-to-available elapsed time, stage/reason, attempts, deadline and final verification separately. Review the initial 30-minute budget after a timeout or materially different npm guidance. Stop/replan on a new external write, weakened cryptographic checks, unbound approval provenance, unsupported archive identity, or a need for new publishing authority.
Retain original receipts and fail closed on conflict; recovery starts with authenticated reads of the exact original publication.
