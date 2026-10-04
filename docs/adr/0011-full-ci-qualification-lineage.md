# Record explicit FULL coverage and landed-main qualification

- Status: Accepted implementation scope under the input-aware CI plan; selective execution and Java artifact reuse remain inactive.
- Authority: Maksym Shostak's 3 October 2026 instruction to continue the accepted plan, with consolidated, bounded Claude reviews.

Subsequent amendment: [ADR 0012](0012-gated-native-java-reference-reuse.md) coordinates schema-v3 Java materialization and cold-seeding, increases the bounded strategy job to twelve minutes, and records the owner's decision to retain full integration checks.
The historical schema-v2 milestone and its verification retain their original meaning.

## Decision

Deliver the plan's coordinated FULL-only schema-v2 milestone before enabling any omission.
The PR writer, ordinary-main reuse reader, required aggregate, native check reporting, main writer and workflow governance change together.
There is no legacy alias, format coercion, receipt backfill or changed public package API.
Older and unsupported evidence takes the complete fresh qualification path.

The Node 24 package suite retains its live reference environment and produces native Jest JSON.
The accounting boundary checks every expected name and file in the two environment-gated Java groups: four direct-parsing assertions and nineteen cyclic-closure assertions.
Missing, renamed, duplicated, failed, pending, skipped or unregistered live assertions reject coverage.
The independently reviewed inventory was confirmed against a native run of the unchanged suites at `76350128`: all fifty assertions passed, including all twenty-three live assertions.
The maintained consumer harness supplies the WebVOWL report and actual candidate tarball SHA-256; all thirteen registered gates and its clean-installation and checkout-preservation outcomes must pass.
Both accounting steps are unconditional and fail normally, and their outputs bind the workflow run, attempt and tested commit.

`CI / required` requires complete native job success and valid current per-check coverage before reporting `FULL`.
The schema-v2 PR receipt records the exact merge tree/parents/workflow, repository/run/attempt, host, job and candidate identities, policy fingerprint and two typed coverage records.
Each current check has `REQUIRED`, `SUCCESS`, `CURRENT_EXECUTION` and a direct original execution identity.
Partial reruns retain successful check outputs from earlier attempts of the same run and tested commit, preserving each producing attempt in its direct original identity.
The aggregate admits only positive producing attempts no later than its current attempt; proof readers additionally match those attempts to GitHub's latest complete native job inventory.
The receipt and artifact remain bound to the current aggregate attempt, and missing native jobs or mismatched producing attempts require fresh qualification.
An isolated successful output cannot replace the complete inventory or its current execution binding.

Ordinary-main reuse still independently checks GitHub's PR association, latest successful attempt, tested Git commit, complete job inventory and immutable receipt/candidate identities, including mutable readback after transfer.
Only an exact supported FULL PR receipt can authorize the existing whole-run reuse path.
The aggregate reports `REUSED`, preserving original FULL coverage and candidate identity, and rejects failed or unexpectedly skipped jobs.
It does not represent those application checks as freshly executed on main.

After every supported successful full or verified-reuse main aggregate, the main writer retains a run/attempt-qualified `ci-main-qualification` artifact using the existing pinned uploader and ninety-day retention.
It records the exact landed commit/tree, accepted source and direct original coverage.
For fresh main qualification, the originals identify the current main run.
For reused qualification, the originals identify the executed PR run; no pointer to another reused record is introduced.
An unavailable upload leaves the next exact-base lookup without evidence and therefore unable to authorize omission.
The existing release, maintenance, CodeQL and stable required-check contracts remain binding.

## Bounded exact-base proof foundation

The read-only exact-base selector uses the event's captured same-repository base and validated merge checkout.
It admits only the latest successful CI push run for that exact main commit and its uniquely named current-attempt main record.
Each run/artifact/job inventory must fit one complete page of at most one hundred entries.
The reader checks the main run/attempt, artifact expiry/digest, authenticated commit/tree/workflow blob and complete native job inventory.
A reused main record resolves its one shared direct original FULL PR receipt through the existing exact-ID transport boundary and normal integration verifier.
It rechecks mutable main and original identities after transfer; missing, expired, rerun, indirect, mismatched or unsupported proof is rejected.
There is no recursive traversal or historical search for a convenient older success.

Each repository reader allows at most thirty-two requests in a total sixty-second budget, ten seconds per request and two MiB per streamed JSON body.
Proof archives and decoded qualification records retain the sixty-four-KiB bound.
The existing one-minute exact-ID download and two-minute selection/verification step limits fit the eight-minute strategy job.
The downloader's digest-error interface and closed regular-file inventory remain authoritative; no custom archive parser or response-provided URL is used.
[GitHub workflow-run identity](https://docs.github.com/en/rest/actions/workflow-runs), [job attempts and pagination](https://docs.github.com/en/rest/actions/workflow-jobs).

## Activation limits and recovery

The current policy is `FULL_ONLY`; no PR integration is omitted and no Java build artifact is restored.
The two check records conservatively bind all tracked bytes and exact hosted identity, and explicitly record non-file input equivalence as `UNPROVEN`.
The exact-base reader is an inactive proof foundation, not an acceptance output or a selection authority.
Its successful historical validation explicitly returns selective execution disabled.
No candidate-controlled YAML/test pair is claimed to enforce itself independently.
Independent bootstrap authority, complete non-file/environment and consumer-graph models, useful opportunities and comparative outcome approval still gate selective activation.
Complete Java closure, rights, build/environment policy, hostile inputs, seeding and hosted comparisons still gate reference reuse.

Normal optimization misses retain full work; a failed selected test, malformed accounting or failed aggregate cannot become a successful fallback.
Disable whole-run reuse to restore fresh main qualification, or revert the coordinated protocol change through ordinary reviewed delivery.
Retain raw review, verification and hosted readback evidence externally; a sealed scan is not modified for cleanup.
The owner remains the operator and activation decision-maker.
