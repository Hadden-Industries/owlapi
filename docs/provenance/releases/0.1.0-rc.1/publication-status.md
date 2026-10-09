# Scoped RC publication record

Recorded 2026-10-03, Europe/Bucharest.
Registry timestamps below are UTC.

**Current disposition, read back 9 October 2026:** the original rc.1 GitHub prerelease is published and immutable, with four assets.
The original registry-verification and pre-finalization observations below remain historical evidence; the [dated finalization readback](#github-finalization-readback-9-october-2026) records the later state without converting the original failed workflow into a pass.

## Published identity

- Package: [`@hadden-industries/owlapi@0.1.0-rc.1`](https://www.npmjs.com/package/@hadden-industries/owlapi/v/0.1.0-rc.1), public access.
- Publication: [Release run 37072579336, attempt 1](https://github.com/Hadden-Industries/owlapi/actions/runs/37072579336/attempts/1), successful npm write at 2026-10-02 23:21 UTC.
- Canonical source: `59131be0c1dc3a634e8433b06d2949051c051c0a`.
- Signed tag: `v0.1.0-rc.1`; tag object `8b944e532430ebd3a10b834309b54fb0428f7eed`.
- Candidate artifact: `11256686508`, retained by that release run.
- Public tarball: `https://registry.npmjs.org/@hadden-industries/owlapi/-/owlapi-0.1.0-rc.1.tgz`, 262167 bytes.
- Tarball SHA-256: `4e18d8a1d2f41af0f31f0426a24d57ddfa25316fba6be550adf2edd6202cabf8`.
- Registry integrity: `sha512-uDv9Omh2l2zxAjpVeQi4UxXEad/cRiKQUJT5RhxR3WtaAjPL3gAoOha9dPRhH6o2zlBdeg50g8EIVQgtt8RGqA==`.
- Cryptographically verified npm provenance references the original source and workflow; [transparency entry](https://search.sigstore.dev/?logIndex=3064015428).

The public tarball was downloaded independently and matched the retained, prepublication-qualified candidate exactly.
Its code and package bytes have not changed.
Both UO and WebVOWL prepublication qualification remain bound to that same SHA-256; this record does not grant either consumer's remaining production acceptance.

## Distribution-tag decision

The publication command explicitly selected `--tag next`.
The public registry nevertheless returned both `next` and `latest` pointing to `0.1.0-rc.1`.
This observation does not establish that every npm first publication behaves that way; npm's [dist-tag documentation](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag/) describes `--tag` as selecting an alternative to the default.

The owner accepted keeping both tags on 2026-10-03 and limited the resulting changes to documentation, with no extra tests of the unchanged code.
The accepted state is `next = 0.1.0-rc.1`, with `latest` absent or equal to `0.1.0-rc.1`.
No tag correction, replacement package, republish, signed-tag change or replacement release workflow is required for this state.
The original source-bound approval records remain retained at the signed release tag; the executable validators remain unchanged.
The working source's rights-inventory hash is refreshed for the approved README amendment and does not replace the published RC's original approval record.

`latest` makes this RC the default scoped installation target.
It does not turn the RC into a stable version or replace exact consumer pins and acceptance.
The recommended alias remains `"owlapi": "npm:@hadden-industries/owlapi@0.1.0-rc.1"`.

## Original completed checks and pre-finalization state

The source/candidate qualification and protected publication completed in the original release run.
They do not need repetition because of the extra tag.
The run then stopped at `Release / fresh public registry` because the frozen verifier prohibited any `latest` tag.
That failed job and the overall failed run remain part of the history; the policy amendment does not make them passing results.

Registry coordinate and tarball reads succeeded, and independent byte/integrity comparison passed.
An initial package-metadata 404 subsequently resolved; a fresh read returned the package and its single published version.

Fresh public-registry checks completed locally at 2026-10-02T23:52:14Z using the existing installation and cryptographic provenance verifiers, with Node.js 24.21.0 and npm 12.1.0:

- Separate ordinary scoped and exact native-alias installations used empty caches/configuration and disabled install scripts.
- Both installed manifests, native lockfile resolutions and SHA-512 integrity values matched the public coordinate; all seven public entry points resolved inside the installed package.
- Both complete dependency graphs resolved, and both `npm audit signatures --json` results contained empty `invalid` and `missing` arrays.
- The existing cryptographic provenance verifier accepted the npm registry signature and Sigstore identity, binding the published tarball to source `59131be0c1dc3a634e8433b06d2949051c051c0a`, `.github/workflows/release.yml`, run `37072579336`, attempt 1.

These were the outstanding registry checks that the hosted tag-policy failure prevented from running.
No runtime test suite was rerun.
Existing code, browser and consumer qualification is reused for the identical bytes, not represented as new execution.
The compact [registry verification record](registry-verification.json) records actual results and both tags; it is documentation of local readback, not the frozen workflow's schema-validated final release-evidence asset.

The GitHub prerelease is still a draft with its original three candidate assets.
Its final release-evidence asset, immutable publication and immutable-release verification remain outstanding.
The unchanged release validator/schema still reject `latest`; documentation alone cannot make those executable checks pass.
Do not conceal that failure, substitute a false `latestPresent: false` record, or call the GitHub release finalized under this documentation-only amendment.

## Credential cleanup

The owner revoked both temporary bootstrap tokens and removed `NPM_BOOTSTRAP_TOKEN` from the `npm-release` environment after the single publication attempt.
Readback confirmed an empty npm token list and an empty GitHub environment-secret list.
A subsequent isolated CLI login used while investigating tag removal was also revoked; registry readback returned 401 for that session and its temporary local credential file was removed.
No distribution tags were changed during that investigation, and no credential values were recorded here.

## GitHub finalization readback, 9 October 2026

Fresh GitHub API readback of [release `v0.1.0-rc.1`](https://github.com/Hadden-Industries/owlapi/releases/tag/v0.1.0-rc.1), release ID `402217399`, reports `draft: false`, `prerelease: true` and `immutable: true`.
Its publication timestamp is `2026-10-03T05:03:25Z` (08:03:25 in Europe/Bucharest).
Its tag still resolves to source `59131be0c1dc3a634e8433b06d2949051c051c0a`; no replacement package or signed tag is recorded by this amendment.

| Asset                                                       | GitHub asset ID | Bytes  | GitHub-reported SHA-256                                            |
| ----------------------------------------------------------- | --------------- | ------ | ------------------------------------------------------------------ |
| `hadden-industries-owlapi-0.1.0-rc.1.tgz`                   | `606696257`     | 262167 | `4e18d8a1d2f41af0f31f0426a24d57ddfa25316fba6be550adf2edd6202cabf8` |
| `hadden-industries-owlapi-0.1.0-rc.1.cdx.json`              | `606696242`     | 79139  | `84637ec522451cd44c55bbd0aaa6674070161d14b28b1b92cf85a964e9603e14` |
| `SHA256SUMS`                                                | `606696233`     | 217    | `50949efc74b3e088d88010fc00a508979e33d993081ebc6db0385bd70257bfdb` |
| `hadden-industries-owlapi-0.1.0-rc.1.release-evidence.json` | `607178377`     | 34582  | `158e07b68c31365679149f7e54ba76ce704d4a5821fceac1789d8d33649909ed` |

This readback establishes the later published/immutable state and presence of the final evidence asset, superseding the earlier pending-finalization description.
The listed digests are GitHub's returned asset metadata; this documentation reconciliation did not download the assets or repeat cryptographic release/asset verification.
The original failed registry job, local registry verification, historical evidence schema and public tarball identity retain their own meaning.
No current-source qualification, rc.2 publication or consumer production acceptance is inferred from this rc.1 state.
