# Scoped RC qualification checkpoint

This directory records preparation for `@hadden-industries/owlapi@0.1.0-rc.1` under `next`.
Phase 22 prepublication qualification is complete for the retained candidate below.
It is not registry publication, a completed public release, or consumer production acceptance.

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
That historical UO run does not qualify either newer tarball; the fresh final-candidate run is recorded below.

## Phase 22 prepublication qualification

The approved signed Phase 21 checkpoint is `c45f07719e0d846be354c818d281a38281913c38`.
The final retained candidate is `hadden-industries-owlapi-0.1.0-rc.1.tgz`, SHA-256 `4e18d8a1d2f41af0f31f0426a24d57ddfa25316fba6be550adf2edd6202cabf8`, 262167 bytes and 110 files.
Its API registry and production SBOM have the unchanged Phase 21 digests above.
Only `README.md`, `CHANGELOG.md`, `docs/compatibility/capabilities.json` and the obsolete storage-boundary comment in `index.js` differ from the Phase 21 candidate.
All 110 packed entries match the qualification source; the later non-packed evidence and governance changes do not replace these bytes.

Fresh producer qualification passed strict package lint, all five installed-consumer scripts, direct/alias installation on Windows, locked/lockless production graph equivalence and the production audit with zero high/critical findings.
Three retained-package tests passed in each of Chromium, Firefox and WebKit.
The original pinned July inputs passed four parsing comparisons and eight Functional Syntax/RDF/XML closure comparisons against Java OWLAPI 5.5.1 revision `d7e997a53b470e32700de89cc610d9daf01ea769`.
Both migration-guide examples executed against the installed candidate.

[`phase22-webvowl.json`](phase22-webvowl.json) retains the successful raw WebVOWL report, SHA-256 `d3a395d5535b894d4115a7fef108fbffd6a0c274a16bc90bcdce4d3220a55bb2`.
It uses the same immutable consumer/corpus pins and `NO_OBSOLETE_USAGE` audit, and passes every installed semantic, corpus, application, build and browser gate: 1857 baseline tests and 1838 installed-candidate tests across 122 suites.
An earlier candidate run timed out in the existing production-build cleanup test; its log remains retained, and the fresh successful retry changed neither code nor test thresholds.

[`phase22-uo.json`](phase22-uo.json) contains a formatted projection of UO's final report plus explicit raw-report provenance.
The raw report SHA-256 is `0a41d5daef4b6ba5d163278ccc0d66a7d66a7411244d436f5be97a408fff9c64`; the original bytes and all twelve referenced artifacts were hash-verified and retained under the producer's `uo-phase22` evidence directory.
UO verified all 110 installed files, passed 174 tests in eleven suites including remote-fetch policy, passed eight real generation cases and obtained eight fresh Java matches with zero unparsed triples and zero Java network attempts.
Its accepted JSON-LD direction/Java-parity boundary remains explicit, tracked in owlapi issue #28 and UO issue #117.
After the full run, UO repaired only acquisition-evidence validation: four focused tests and six negative controls passed; generation results are explicitly reused for unchanged code, inputs and exact output bytes.
The report identifies UO checkpoint `ef1d278d9c63b1b9fdb9047a8700d887c118051b` plus its two uncommitted identity/plan changes.
It identifies the producer's uncommitted qualification snapshot `dc0f1784407f5f89df0aedd1adf68c9d32127a5b`; the signed delivery commit and hosted verification will identify the later source tree independently.

The parity ledger now records Phase 22 `COMPLETE` for these prepublication gates.
The release qualification command requires both accepted consumer reports to name the actual retained tarball digest before dry-run and registry preflight; a differently rebuilt hosted tarball is rejected.
The raw paths in the reports are execution context, not registry or publication evidence.

## Remaining publication gates

1. Retain final source verification, then obtain authorization for the exact signed Phase 22 commit and normal integration into remote main.
   Preserve the Phase 21 checkpoint and integration baseline as ancestors; keep the accepted tarball bytes unchanged.
2. Complete the scoped-name, rights and third-party-material human fact reviews against their actual digests.
   Resolve the supported publication mode and exact-artifact approval, and provide the bootstrap credential through the protected `npm-release` environment.
   No human attestation is inferred from automated checks.
3. Use the protected-main release workflow, late signed tag and single authorized npm write.
   Fresh public-registry integrity/provenance verification precedes each consumer's production acceptance.
   The RC is eligible for production; stable `0.1.0` is not required.

The executable release preflight rejects incomplete Phase 21/22 records, changed API registry bytes, missing predecessor ancestry, an unsigned or untrusted predecessor and pending human fact reviews.
The predecessor signature is checked against the reviewed release-signer registry, including its active status and validity dates.
The qualification command requires all three parity prerequisites before accepting the checkpoint and its dependent lifecycle results.
Publication remains disabled.
No placeholder, npm write, release tag or consumer production dependency change is part of this checkpoint.

The retained consumer JSON files preserve the qualifier's original bytes, including its local checkout path.
That path is execution context; the baseline commit, corpus digest and candidate digest identify the actual inputs.
