# Scoped RC qualification checkpoint

This directory records preparation for `@hadden-industries/owlapi@0.1.0-rc.1` under `next`.
It is not registry publication, a completed Phase 22 release, or consumer production acceptance.

## Phase 21 input and package identity

The reconciled source baseline is canonical main commit `19cf43d4288d20a737ecac0a39ccd1c53f9a3e77`, whose API registry SHA-256 is `1807e113c5db152417e62a56ba7feb95f4bb7e8f2775fa37e76d100303f4bb41`.
It contains the normally merged lifecycle implementation and subsequently approved Canonical VOWL and RDF metadata work.
Those already integrated contracts remain intact; the governance tests also retain the separate comparison against the historical development baseline.

The prepared Phase 21 checkpoint completes the three parity capability rows.
Its generated API registry SHA-256 is `cf367d97cea09eb9fe99b6f0e68f8ddb8ded8555259a4cc956b16bb19218ba6a`.

| Artifact                              | SHA-256                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| Original CI tarball, qualified by UO  | `59744b8d3a65ee8b6c0e41b963ada4132a128f083f7612442bd4abb46da96b7a` |
| Prepared Phase 21 checkpoint tarball  | `381da24580afbceb4073d6ef17a483972a39db6ab98169498bcd10278857cb1b` |
| Production dependency SBOM, unchanged | `84637ec522451cd44c55bbd0aaa6674070161d14b28b1b92cf85a964e9603e14` |

Both tarballs contain the same 110 paths.
A file-by-file byte comparison permits changes only in `API.md`, `docs/compatibility/capabilities.json`, and the JSON/Markdown Java API registry.
Every runtime module, `package.json`, licence file and remaining packed document is byte-identical.
This comparison supports reuse of unchanged-runtime evidence; it does not assign the earlier tarball's exact-byte acceptance to the new candidate.

## Consumer evidence

WebVOWL uses immutable baseline `4f1970e5b6c95655af823c495bd58f9e9993f8b8` and ontology corpus `c2220675b0f3345628fc9cc8112a41440afcb2f0`.
The audit records `NO_OBSOLETE_USAGE`, inventory digest `c4db1cfb068d6882ab7acca4277a4e45d80b584002724b649998e9620d16f359`, and two reviewed `StringDocumentSource.getText()` occurrences.
No maintained WebVOWL change is required for the target/error contract.

`phase21-webvowl-preparation.json` retains the original candidate's fresh preparation run with its original `PRE_INTEGRATION` label.
`phase21-webvowl.json` records the separate `RECONCILED` run on the checkpoint tarball.
The parity ledger binds the latter's candidate and evidence digests.
Its gates include installed target/error behavior, lossless-or-fail storage, the representative corpus, application tests/builds and Chromium integration.

UO's separately retained prepublication evidence passed 174 tests in 11 suites and eight real distribution/format cases against the **original CI tarball**.
All eight outputs matched the independently retained Java 5.5.1 comparisons.
The UO implementation checkpoint is `ef1d278d9c63b1b9fdb9047a8700d887c118051b`; the earlier run's source identities remain historical facts.
The current UO qualification adapter pins the original tarball, API registry and Actions artifact identities and must be explicitly reconciled when the final candidate is supplied.
No UO acceptance for the new checkpoint tarball is claimed here.

## Remaining publication gates

1. Verify and review the complete Phase 21 checkpoint, then retain its approved signed commit.
   The commit's own OID belongs in the subsequent Phase 22 record, avoiding a self-reference.
2. Complete Phase 22 only with that checkpoint and the integration baseline as ancestors, the eight required lifecycle capabilities, the exact approved API surface and the final registry digest.
   Rebuild after any packed metadata change.
3. Qualify the final retained bytes through installed/browser/WebVOWL boundaries and UO's actual prepublication adapter, complete matrix and Java-linked real cases.
   Earlier source, archive and tarball identities remain distinct.
4. Complete the scoped-name, rights and third-party-material human fact reviews against their actual digests.
   Resolve the supported publication mode and exact-artifact approval, and provide the bootstrap credential through the protected `npm-release` environment.
   No human attestation is inferred from automated checks.
5. Use the protected-main release workflow, late signed tag and single authorized npm write.
   Fresh public-registry integrity/provenance verification precedes each consumer's production acceptance.
   The RC is eligible for production; stable `0.1.0` is not required.

The executable release preflight rejects incomplete Phase 21/22 records, changed API registry bytes, missing predecessor ancestry, an unsigned or untrusted predecessor and pending human fact reviews.
The predecessor signature is checked against the reviewed release-signer registry, including its active status and validity dates.
The qualification command requires all three parity prerequisites before accepting the checkpoint and its dependent lifecycle results.
Publication remains disabled.
No placeholder, npm write, release tag or consumer production dependency change is part of this checkpoint.

The retained consumer JSON files preserve the qualifier's original bytes, including its local checkout path.
That path is execution context; the baseline commit, corpus digest and candidate digest identify the actual inputs.
