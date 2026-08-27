# npm package evidence corpus

This directory is the content-addressed evidence store for every unique public-
registry artifact selected by the repository's exact `package-lock.json`. It
supports reproducible supply-chain and licensing review; it is not package
source, an npm cache, or part of the published `owlapi` tarball.

The authoritative index is
[`../../npm-package-evidence.json`](../../npm-package-evidence.json). Every
`blobs/sha256/<prefix>/<sha256>` path is derived from the SHA-256 of its exact
bytes. The nested `.gitattributes` disables Git text conversion for those blobs,
so a checkout on another operating system cannot silently change their identity.

The loose, individually addressed representation is deliberate. A later
dependency or evidence-tool update reuses every unchanged path and Git object,
while the commit diff exposes only newly added or removed evidence bytes beside
the manifest changes that explain them. The blobs therefore remain ordinary,
review-visible repository files: they are not combined into an archive and are
not marked `linguist-generated` or otherwise hidden from GitHub diffs. The nested
`.gitattributes` exists only to protect byte identity.

The canonical checkout and every evidence or release gate include this complete
directory. [`CONTRIBUTING.md`](../../../../CONTRIBUTING.md) also documents an
optional blobless partial-clone plus cone-mode sparse-checkout profile for
source-development work. That profile omits bulk provenance payloads while
retaining their canonical indexes and the conformance resources needed for
ordinary parser development; it is never valid evidence-verification or release
input.

## Reviewed bootstrap identity

The committed candidate has these exact identities:

- manifest SHA-256:
  `4f980ce7a5ba7cfd4baeb317b201f954c6bf26b80d2ecc6f2486a2adbd246136`;
- corpus root:
  `5929e30f796814d6079fa1e4e931b0cbeab8cf32d6a47b29ac16ac8b1ce1dea9`;
- 714 lockfile occurrences, 639 unique authenticated artifacts and 3,112
  retained blobs;
- 64,555,601 retained bytes;
- 639 verified registry-signature, archive and ScanCode records;
- 192 verified npm-provenance records and 447 explicit `NOT_PUBLISHED`
  provenance observations.

An absent npm provenance publication is reported, not converted into a false
failure. Integrity, package identity, registry signature, archive safety,
ScanCode, schema, closure, or digest failures remain blocking.

## Chain of custody

The source acquisition was the two-platform 32-shard baseline in
[GitHub Actions run 33087504175](https://github.com/Hadden-Industries/owlapi/actions/runs/33087504175)
at signed source commit
`5f76f787d38cb4cba11d7f0e23b062b606cb4220`. All 64 acquisition shards and
both host aggregates succeeded. Their pre-normalization identities were:

| Host    | Manifest SHA-256                                                   | Corpus root                                                        |
| ------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Ubuntu  | `ada31436727cceff9df1ffd88ee0f919005db2658f6cd12227d882dd12acef81` | `a6af3aaa60aca38f67bff4d8ca2af12abdcad38ccdfc082b52b7272f7b85a29d` |
| Windows | `81b494a94577cf002443766e89d8967a13e6ea8028c584076128316d9202e30b` | `bee204e7de68968ce2b5f63a9c0d8fe64cc8491cf2f96f2af939e478d428f7bb` |

The platform difference was confined to ScanCode's execution-local UUIDs,
materialization date, and three host-classification fields. The offline
recanonicalizer first verified each source manifest and all referenced blobs,
then replaced package/dependency UUID references with validated npm Package URLs
and omitted only the enumerated non-semantic fields. Both independent inputs
produced manifest SHA-256
`2e515fa06c0407a15a1a2cd95b967342c626add80a8ab6422b2fe5532f75aed1`
and corpus root
`e94d28c8e27f0130185640e0198f756cb8ed648b5d10e61ecaf588468213945f`.

A final bounded archive-only pass corrected a retention omission discovered
during local measurement: the original acquisition had enforced but not stored
`physicalEntryCount` and `duplicateEntries`. It re-downloaded all 639 tarballs
through their locked registry URL and SRI, independently checked each tarball's
SHA-256, reran only the safe archive inspector, and required every previously
retained package, entry, legal-file, byte-length, and digest fact to remain
identical. It did not execute dependency contents or rerun ScanCode. That pass
added only the omitted physical-occurrence facts and produced the current
identities above. The four duplicated paths account for exactly four extra
physical entries; every duplicate had independently identical type, size, and
SHA-256.

The ScanCode baseline used version `32.5.0`, Python `3.14.7` x64, one scanner
process per artifact, and the checksum-pinned official archives recorded in the
manifest and implementation plan. Raw tarballs, caches, materialized scan trees,
and unnormalized scanner reports were temporary and are deliberately absent from
this repository.

## Measured safety margins

`node util/verify-npm-package-evidence.mjs` verifies the complete corpus before
deriving these measurements. Limits are fixed code controls, not values fitted
to this corpus.

| Per-artifact control      | Observed maximum | Fixed limit | Maximizing artifact/path                                                                                         |
| ------------------------- | ---------------: | ----------: | ---------------------------------------------------------------------------------------------------------------- |
| Compressed bytes          |        8,824,036 | 104,857,600 | `@rolldown/binding-linux-ppc64-gnu@1.2.6`                                                                        |
| Expanded bytes            |       22,045,532 | 536,870,912 | `@rolldown/binding-linux-ppc64-gnu@1.2.6`                                                                        |
| Physical entries          |            1,074 |     100,000 | `@sinclair/typebox@0.34.52`                                                                                      |
| Single entry bytes        |       22,044,600 | 134,217,728 | `@rolldown/binding-linux-ppc64-gnu@1.2.6`: `package/rolldown-binding.linux-ppc64-gnu.node`                       |
| UTF-8 path bytes          |               91 |       4,096 | `pure-rand@7.0.1`: `package/lib/esm/types/distribution/internals/UnsafeUniformArrayIntDistributionInternal.d.ts` |
| Retained legal-file bytes |          363,662 |  16,777,216 | `prettier@3.9.6`                                                                                                 |

Across all artifacts, the authenticated archives contain 207,805,495 compressed
bytes, 595,366,160 expanded bytes, 12,586 physical entries, and 3,821,377 bytes
of retained legal-evidence files. These totals are descriptive; the security
limits are intentionally enforced per artifact.

## Verification and regeneration

Run the ordinary offline check from the repository root:

```text
node util/verify-npm-package-evidence.mjs
```

The command validates the Draft 2020-12 manifest schema, exact lockfile binding,
blob paths/lengths/digests, corpus root, artifact and occurrence closure, package
identity, signatures, provenance states, archive roots and physical occurrence
inventories, all archive safety ceilings, legal-file bindings, ScanCode policy,
and the recorded summary. It performs no registry or other network operation.

Normal updates do not edit blobs or the manifest manually. The release workflow
acquires all 32 deterministic Ubuntu shards from one same-run npm signing-key
snapshot, independently verifies and merges them, and requires the resulting
canonical manifest and corpus root to equal the reviewed committed corpus before
candidate construction. A dependency or evidence-tool update intentionally
changes the corpus and must regenerate it through the acquisition/merge tools,
inspect the generated differences, regenerate prospective third-party-material
facts, and return both facts sets to human review before promotion.

The 32×2 Ubuntu/Windows workflow is a manual diagnostic for normalizer or host-
semantic changes, not a routine weekly or release cost. Its aggregates must be
byte-identical; the process may never select a preferred platform result.
