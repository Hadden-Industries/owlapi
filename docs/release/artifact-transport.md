# Actions artifact transport

All 39 qualification and diagnostic upload sites use the shared `retain-artifact` action.
Six logical-name collectors use `collect-artifacts`.
Both execute one self-contained JavaScript bundle.
Workflow callers select their logical name, literal payload paths and retention period.
Recovery limits, waits, compression defaults and inventory limits belong to `artifact-transport-policy.json`.

Release qualification of this transport revision is pending.
Local checks, independent review, exact-head hosted CI and release acceptance are separate claims.
The release workflow has not been dispatched to qualify this change.
Human review of rights and licensing for the new isolated development material remains pending.

## Failure and recovery

Run 39591230606 passed its installed OWL assertions, then lost the connection while finalizing the two-file proof upload.
The pinned upstream action uses `@actions/artifact` 6.3.1.
Its control-plane client handles selected HTTP retries but immediately reports several network failures, including `ECONNRESET`.
Neither chunk timeouts nor a fixed delay before every upload resolves an uncertain finalization response.

The repository action uses the supported public SDK.
It supplies the remaining recovery protocol without patching the SDK's private RPC implementation:

1. Resolve literal files and directories once, exclude hidden descendants, reject symlinks and unsafe paths, and freeze the selected bytes in owned temporary storage.
   A path/size/SHA256 manifest stays outside the payload.
2. Upload once without an artificial wait.
   A finalized success returns its real ID, digest, URL and physical name.
3. After a recognized network failure, perform bounded current-run visibility probes.
   An unsuccessful lookup is unknown and stops recovery.
4. Download any matching finalized archive without extracting it.
   Verify the server digest, bounded ZIP structure, exact file inventory and every hash against the frozen subject before adopting its identity.
5. If no finalized copy is visible after the probes, wait with jitter and upload the same frozen subject under a fresh physical identity.
   Never overwrite, delete or reuse a possibly reserved backend name.

The initial policy permits at most three uploads with failure-only backoff windows of 5–10 and 15–30 seconds.
All snapshot, upload, lookup and recovery work shares a four-minute deadline.
Collection has a separate fifteen-minute budget for up to 32 evidence shards or the frozen consumer matrix, including sequential verification of equivalent transport copies.
This is a finite availability allowance; exact hosted timing and release collector qualification remain pending.
SDK calls run in child processes so cancellation or deadline expiry can terminate an otherwise uncancellable operation.
Handle closure precedes temporary-file retirement.
Callers with formerly shorter receipt steps now allow five minutes.
Safe diagnostics retain physical names, ordinal, elapsed and remaining budget, and terminal upload disposition, including cancellation and deadline expiry.

Only structured SDK network errors and the narrowly specified network wrapper from the pinned SDK qualify for recovery.
Exhausted HTTP retry cycles, quota, authentication, invalid input, unknown errors and integrity contradictions fail closed.
Recovery does not rerun tests, package publication, tags, release assets or channel writes.
Existing required uploads remain required.
The three existing optional optimization receipts retain their fallback behavior.

## Identity and collection

The codec in `tooling/artifact-transport/identity.mjs` separates a logical coordinate from its physical artifact name.
A physical name binds the workflow run, producing workflow attempt, job/logical coordinate, invocation and transport ordinal.
The ordinal never replaces the workflow attempt.

Collectors admit current-run physical names through that codec, group them by logical coordinate and select the latest producing workflow attempt for a temporary coordinate.
Within that attempt, different producers or invocations are contradictions.
Equivalent transport copies must have identical verified file manifests; the earliest ordinal is selected deterministically.
A pattern collector materializes one directory per logical coordinate, preserving the existing matrix/shard report layout.
The complete selected collection also shares the payload byte and file-count bounds.
Each verified download is retired before inspecting the next copy, and the selected archive is checked again against the worker's verified manifest before materialization.
Collection rejects symlinks and junctions in destination ancestors, using the same workspace path guard as uploads.
An exact-name collector materializes the payload directly in its new destination directory.

This replaces the five former `overwrite: true` temporary-artifact sites with immutable attempt-scoped selection.
Closed candidate and OWL proof payloads receive no transport metadata files.
Explicit artifact-ID downloads retain their existing server-digest checks.
Historical evidence IDs remain unchanged.
Historical proof readers explicitly admit legacy names, preserve the selected physical identity on readback and reject ambiguity; optional reuse falls back to full qualification when it cannot prove a unique source.
Retained release approvals additionally verify every equivalent transport copy.

## Bounds, dependencies and ownership

The qualified predecessor's largest retained artifact was approximately 3.3 MB; the root authenticated npm corpus was approximately 69 MB.
The initial policy caps frozen/expanded payloads at 1 GiB, file count at 10,000, filesystem census at 20,000 entries and the raw ZIP at 1 GiB plus 2 MiB.
Collection additionally caps cumulative admitted archive bytes at 4 GiB, including equivalent copies, with metadata checked before each download.
This is not an exact network-transfer counter: the public SDK can retry partial downloads internally without exposing their consumed wire bytes.
The parent deadline bounds the complete operation, including those retries; raw disk growth and final archive size are checked independently.
Do not claim a 4 GiB cumulative wire limit from this admitted-payload bound.
Temporary collection storage holds at most the bounded selected payload and one bounded raw archive at a time; ZIP parsing holds one archive and its expanded contents in memory.
Larger subjects require a reviewed policy change.
The SDK download worker checks metadata and monitors raw disk growth; no archive is admitted or materialized before size, digest and content validation.
Recovery temporarily retains frozen and downloaded bytes, so temporary storage must allow both.

The action runs on GitHub's Node 24 action runtime and uses its current-run runtime authorization.
It does not request repository write permission or enable cross-run SDK selection.
The protected publisher executes the same bundle from its `approval-tools` checkout without installing the application's dependency graph.
Consumer dependencies, exports and the Node 22.0.0 floor are unchanged.

ZIP parsing has one owner, `scripts/release-zip-core.mjs`.
The existing compatible wrapper still supplies the bounded `lzma-native` checksum provider.
The isolated Node 24 action supplies Node's built-in CRC32 instead, so its bundle needs no native add-on.
These provider choices belong to their different runtime boundaries; they share the same archive-validation algorithm.

The SDK and Actions core dependencies have an exact isolated lock under `tooling/artifact-transport`.
The build reuses the repository's Vite toolchain; an offline comparison proved that Vite and ncc could load the SDK, so no second bundler dependency was adopted.
Vite retains bundled third-party legal text.
The isolated graph uses the existing authenticated npm evidence acquisition, scanner, offline verifier and JSON admission under a separate namespace, sharing the product graph's schema and implementation.
The JSON checking byte budget is 512 MiB to include both graphs' independently admitted source snapshots and document views; every document remains checked and per-file bounds remain unchanged.
Retained licence declarations and automated evidence do not complete review by the rights owner.

Build and check the generated bundle with:

```sh
npm ci --prefix tooling/artifact-transport --ignore-scripts --no-audit --no-fund
node scripts/build-artifact-action.mjs
node scripts/build-artifact-action.mjs --check
```

The build record binds source, policy, both dependency locks and generated outputs.
Workflow governance rejects direct upload bypasses, changed action contracts and caller policy overrides, and closes the producer/collector census.
The current CI qualification policy binds the transport policy and build record; older green receipts cannot automatically qualify this protocol.

Recovery fault injection covers lost acknowledgements, delayed visibility, conflicting copies, failed lookups/downloads, bounded retries, deadlines, cancellation, unsafe ZIPs and a standalone SDK bundle.
Hosted Linux, Windows and macOS execution remains required for the exact published candidate.
Rolling back the source changes future runs; already-created artifacts remain immutable.

## Research sources

- [Pinned upstream action and executable](https://github.com/actions/upload-artifact/tree/cf430e030ddbb5b0abf93d22962f4752f3646cd9)
- [Public artifact SDK](https://github.com/actions/toolkit/tree/main/packages/artifact)
- [SDK control-plane retry implementation](https://github.com/actions/toolkit/blob/main/packages/artifact/src/internal/shared/artifact-twirp-client.ts)
- [SDK download interface](https://github.com/actions/toolkit/blob/main/packages/artifact/src/internal/shared/interfaces.ts)
- [GitHub JavaScript action packaging](https://docs.github.com/en/actions/tutorials/create-actions/create-a-javascript-action)
- [Timeouts, retries and backoff with jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
