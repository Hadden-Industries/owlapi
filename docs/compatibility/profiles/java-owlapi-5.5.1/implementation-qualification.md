# Implementation and release-readiness evidence

The selected Java-compatible API implementation is complete and merged into `main` through [PR #76](https://github.com/Hadden-Industries/owlapi/pull/76) on 2026-10-14; public profile admission remains **NOT READY**.
The designated Codex Security scan was interrupted by an automated content check before completing coverage.
Its partial findings are retained and remediated as described below; neither zero findings nor a completed security scan is claimed.
The repository owner must resolve that evidence gap before admitting or publishing a qualified profile.
The owner explicitly accepted the incomplete security coverage for source integration after the ordinary review findings were resolved.
That exception authorized the protected PR merge only; public profile admission and npm publication remain held.

## Scope and authority

The [accepted nine-slice plan](../../../plans/2026-10-13-java-compatible-api-behavior-implementation-plan.md) governs this change.
The [current decision ledger](../../java-api-parity-decisions.json) defines 23 behavior decisions for the selected [public API inventory](../../java-api-surface.md).
The [released oracle manifest](provenance.json), [behavior comparison](behavior-comparison.json) and their retained observations keep their original identities.
The historical phase 21/22 receipts and research hashes are not relabelled as evidence for this implementation.

Explicit `java-owlapi-5.5.1` selection matches the released Java configuration methods, defaults and observed behavior on that selected surface.
Omitted selection still means `normative-v1`.
The [profile contract](../../behavior-profiles.md) states the differences, caller extensions and structural adaptations.
This record does not claim all Java OWLAPI members, every W3C feature, browser external transport parity or a new package release.

## Review findings and dispositions

| Evidence                                                   | Actual result and disposition                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review Agent, initial frozen implementation                | Four confirmed defects: structural validation rejected genuine Java values; import lookup rejected multiple versions; occupied rename retained a stale document alias; a subclass getter could alter configuration policy. All were repaired and reproduced independently. |
| Review Agent, narrow repair review                         | Original four reproductions passed; 91 focused tests passed. A retained-ID rename exposed a mismatch between authorization traversal and the public closure. Authorization now uses the same Java closure semantics.                                                       |
| Claude, initial implementation                             | Independently identified the stale document alias. The report was substantive, but native admission lacked required literal coverage entries; it is retained as input, not a fully admitted receipt.                                                                       |
| Claude, repair delta                                       | Identified repeated document-location imports that skipped reauthorization. The report was substantive; its native full-file control check did not accept the paged read of the large manager file.                                                                        |
| Claude, document-alias repair                              | Native control trial passed. Confirmed the authorization repair but found two changed lookup priorities. Released Java 5.5.1 reproduced both: a current ontology-IRI match supersedes the retained ID; a mapper precedes a raw document alias on first acquisition.        |
| Final lookup-order repair                                  | Restores the original current-IRI and mapped-document order. Only an already-requested import reauthorizes its effective retained closure before the native skip. All authorization and precedence regressions pass together.                                              |
| Review Agent, final lookup-order repair                    | No findings on the repair through `dc2260a61628f81edc0f295bca76b0ebb3cb57f3`; independently ran two focused suites with 25 passing tests. The retained review and repair chain has no unresolved ordinary-code-review findings.                                            |
| Codex Security scan `45f253ac-f086-4af2-a467-69306dacbad0` | Interrupted before final report; partial coverage. Confirmed cache reauthorization and DNS cancellation defects were repaired. Conditional parent-directory replacement remains outside the explicitly approved file-host contract.                                        |
| Hosted CodeQL                                              | The reported costly trim expression was replaced by a linear scan. Later pushed implementation snapshots passed the CodeQL gate; final PR checks remain authoritative for their exact commit.                                                                              |

The file condition was explicitly accepted by the owner after explanation: every parent directory must be trusted and stable while the file is acquired.
The callback receives `requiresStablePathAncestors: true`.
This acceptance does not mean Node pathname checks prevent concurrent directory replacement.
See the [file boundary](file-transport-boundary.md), [transport decision](transport-decision.md) and [provider decision](provider-decision.md).

## Verification and installed consumers

The recorded full HISEW source run `02441172-9c5e-4288-a4dd-dd8e4d33999f` passed on `2d751ce2844570b0c8c5cf534a4b76999c25b33a`: lint, formatting, release/workflow governance, four package-boundary tests, and 262 Jest suites with 16,139 passed and 26 skipped tests.
The subsequent lookup-order repair has independent native red evidence and 36 passing focused tests.
That earlier full run is not relabelled as a receipt for the later commit.
A subsequent full HISEW source run `2806c4cb-b2b9-4425-8844-8b7505ba44dd` passed on the final implementation commit `dc2260a61628f81edc0f295bca76b0ebb3cb57f3`, including lint, formatting, release/workflow governance, package-boundary tests and Jest.
All 23 pre-merge checks passed on that commit, including the required CI and CodeQL checks.
The merge commit `957deb38362b0ab55ed809f9722fcbf44eaec2ae` has the same tree, `086ec7e32c57350087b4092a53533755c5d644ec`, as the reviewed implementation.
These are completed checks on their recorded candidates; HISEW handoff and public profile admission remain separate from those results.

Installed consumer qualification covers Node 22.23.3, 24.21.0 and 26.11.1, using both the scoped package name and the supported `owlapi` alias.
Each executes six package fixtures, including import purity, no-network behavior, import closure and explicitly authorized Node transport.
Chromium, Firefox and WebKit each execute the bundler, native import-map and DedicatedWorker consumers.
Those shared consumers exercise both behavior profiles, native defaults, literal construction, mutation return values, writer copy behavior, partial publication, target append/replace and the JSON-LD provider.

The representative downstream contract has 70 assertions and fixes its inputs to Universal Ontology `9a3b5bff5aeaff4540f14bdf65baeffc1c0d188d` and WebVOWL `a468e17701d495fd9e1a801aef169894b2045186`.
Git-versus-tarball qualification compares every installed package file and the normalized production dependency graph; the historical alpha-only equivalence routine is preserved.
The portable [implementation evidence](implementation-evidence.json) identifies measured candidates and supporting results.
Native workflow receipts and complete machine-specific logs remain in their owning stores.

## Migration, abort and recovery

Choose the behavior profile explicitly and pin the exact installed source or package bytes.
Use the manager's native-style immutable configuration setters.
Keep a separate manager for another profile; no manager changes its identity after construction.
The release observer is the repository maintainer; the consuming application's owner is responsible for its persisted application state and access policy.

The installed recovery rehearsal moved from prior main `e9adc821688928e7a494eb59f76b7cedab79faa1` to the new candidate, exercised both profiles, and restored that exact prior Git revision.
The prior valid-input result and rejection of an empty enumeration were restored.
A deliberate second-import failure retained the first completed import under Java and rolled it back under normative behavior.
Both made the two explicitly authorized acquisition calls; restoring a package or creating a fresh manager cannot undo those external effects.

Abort promotion on a behavioral mismatch outside the ledger, failed authorization, oracle drift, a required host failure or unresolved release evidence.
Retain the previous package and application checkpoint, restore them under the application's recovery policy, and prepare a forward fix.
A source rollback does not rewrite native observations, historical receipts or prior package identities.

## Release hold and retained resources

Public profile admission and npm publication remain held for complete designated security evidence and an accountable release decision.
The source-integration exception does not waive these release gates or make the partial scan complete.
The implementation and supported host boundaries are reviewable independently of that hold.

PR #76 records the exact external working-directory locator, owner and retention checkpoint.
The isolated oracle/review/package working group remains required for release and recovery reproduction until the release decision or review on 2026-10-21.
The native recursive resource observation exceeded its cooperative time bound and remains unknown; a separate byte measurement is not a native preservation receipt.
No cleanup or reclaimed-capacity claim is made.
Review findings, raw captures, failed attempts and historical evidence remain retained.
