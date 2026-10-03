# Reuse verified PR integration on main

Accepted implementation scope: the owner said “Fix as per your recommendations” after the CI duplication assessment on 29 September 2026.
The baseline is `110df16714d236b0366778fc967a30797d72167d`.
Work stays in the primary checkout on local `main`.
This continues the accepted R2 workflow assurance route; commit, publication and merge remain distinct effects.
Reviews remain at the final candidate stage, without repeated intermediate review passes.
The [3 October FULL-only lineage milestone](../adr/0011-full-ci-qualification-lineage.md) subsequently replaces the receipt format through a coordinated schema-v2 transition.
This historical plan's exact-input, complete-qualification and ordinary-main reuse invariants remain binding; version-one records are not coerced or backfilled.

The outcome is to avoid repeating a successful full application qualification when a normal PR merge lands exactly the tested integration.
The stable `CI / required` check must continue to explain what actually established success.
CodeQL default setup, strict branch rules, release qualification, publication authority, package dependencies and external consumer repositories are unchanged.
Merge queues and broad dependency caching are outside this change.

## Accepted requirements and decisions

| Requirement                                 | Acceptance and quality scenario                                                                                                                     | Decision                                                                                                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 Preserve full PR validation         | AC-001 / QA-001: every PR runs all registered application checks; any missing, failed or skipped required job prevents success                      | DEC-001: retain the existing full job graph and aggregate name                                                                                                                   |
| REQ-002 Reuse only demonstrated equivalence | AC-002 / QA-002: a normal main merge reuses only a complete successful run from the same repository, PR head, base, tested tree and workflow        | DEC-002: explicit versioned receipt plus independent GitHub run/job/commit/artifact readback; no inference from the PR head SHA alone                                            |
| REQ-003 Fail closed to full validation      | AC-003 / QA-003: unavailable APIs, absent/expired evidence, mismatches, unsupported merge forms and ambiguous inventories select the full job graph | DEC-003: optimization failures never grant success; only the exact receipt upload/download actions tolerate transport failure, and the download's actual outcome must be checked |
| REQ-004 Preserve qualified package identity | AC-004 / QA-004: accepted reuse records the original immutable candidate artifact ID and digest; a missing or changed candidate prevents reuse      | DEC-004: retain the existing candidate instead of rebuilding it; this grants no release or publication authority                                                                 |
| REQ-005 Make the result auditable           | AC-005 / QA-005: logs and job summary distinguish fresh qualification from reused qualification and link the source run                             | DEC-005: retain a compact JSON receipt on full successful PR runs; never relabel skipped jobs as fresh passes                                                                    |

Evidence has no blanket age limit.
Its timestamps must remain valid and no later than verification; the receipt must not predate its workflow attempt.
Both proof and candidate artifacts must remain retained and unexpired.
The owner approved removing the initial age cutoff on 29 September 2026.

Only a single ordinary two-parent merge whose first parent equals the push's previous main tip is eligible.
The receipt must bind both parents, the complete tree, workflow blob, source run and attempt, full job inventory, Node version and Ubuntu runner-image identity.
The verifier compares current hosted image identity, validates all expected source jobs through GitHub's latest job inventory, and checks the candidate artifact's ownership, expiration and digest.
Squash/rebase/direct/multiple-merge pushes use full CI.

## Native capability selection

Reuse Node 24.21.0 built-in Git/process/JSON/HTTP functionality, the existing `require-job-success.mjs` registry, and the already pinned official GitHub artifact actions. Add no third-party runtime or development dependencies and no local ZIP parser. The selected action versions and their approved licensing/provenance inventory are unchanged.
GitHub's current REST API exposes run identity, latest jobs and immutable artifact IDs/digests; those are the external observation seam.
The custom gap is the repository-specific equivalence and complete-check policy.

Sources checked on 29 September 2026:

- [PR merge checkout semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)
- [Workflow runs](https://docs.github.com/en/rest/actions/workflow-runs)
- [Workflow jobs and latest attempts](https://docs.github.com/en/rest/actions/workflow-jobs)
- [Artifacts and digests](https://docs.github.com/en/rest/actions/artifacts)
- [CodeQL default-branch and PR analysis](https://docs.github.com/en/code-security/concepts/code-scanning/setup-types)

## Implementation and proof

| Slice                                        | Requirements              | Likely seams                                                                   | Falsifiable proof                                                                                                                                                                                                                             |
| -------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SLICE-001 Retain full successful PR evidence | REQ-001, REQ-004, REQ-005 | aggregate registry, receipt writer, CI artifact upload                         | refuse partial/skipped jobs and wrong checkout/event identity; retain exact candidate pointer                                                                                                                                                 |
| SLICE-002 Select reuse or full qualification | REQ-002, REQ-003, REQ-004 | read-only GitHub client, receipt validator, initial CI job                     | realistic API fixtures cover equivalent retained evidence beyond 24 hours, wrong base/tree/workflow, invalid timestamps, failed/restarted run, expired/foreign/deleted artifact, incomplete jobs, API/download failure and unsupported events |
| SLICE-003 Integrate and govern both paths    | all                       | CI job dependencies, aggregate, workflow governance, contributor documentation | real workflow mutations must fail governance when they weaken the PR gate, broaden artifact selectors/permissions, skip fallback checks, or tolerate unrelated failures; actionlint validates expressions                                     |

The implementation owner is this task.
Work is sequential because the receipt, selection outputs, graph and aggregate share one contract.
Tests mock only the GitHub service boundary, using native-shaped responses.
Temporary Git fixtures exercise actual tree/parent/workflow extraction.
Tests validate decisions and failure modes rather than duplicating private implementation steps.

Focused feedback uses the affected Jest suites, targeted ESLint/Prettier, `verify:workflow-syntax` and `verify:workflow-governance`.
Final verification uses the registered HISEW full profile once the candidate is frozen, plus final scoped independent review of the new evidence trust boundary.
Existing parser performance and external consumer benchmarks are unaffected and are not rerun locally solely for this CI control change.
Hosted qualification remains the first release proof of the workflow itself; fixture success is not represented as a hosted run.

## Rollout and recovery

The first PR introducing this feature still runs full CI and emits its receipt.
Its ordinary merge can then demonstrate reuse.
Historical runs without receipts use the full fallback.
Receipt format mismatch and expired/deleted artifacts also fall back, so no backfill is needed.
The receipt is evidence, never executable input.
API access is read-only, same-repository and bounded; artifact content is read only after the official downloader's digest validation.

The owner can restore unconditional full CI as a forward change without losing application coverage.
Abort reuse on evidence uncertainty; do not modify tests, timeouts or security rules to make it available.
Reassess the design if native GitHub evidence cannot prove the accepted boundary, if branch-dependent tests need distinct execution, or if trusted release publication begins depending on PR-produced artifacts.
Source run IDs, fallback reasons and original artifact identities are the observations needed to diagnose correctness and saved work.
