# Phase 19A provenance-preserving reconstruction

This directory is the durable, reviewable evidence snapshot for the Phase 19A
checkpoint defined by `docs/owlapi-js/implementation-plan.md` §17.26.0–17.26.1.
It records the reconstruction inputs, decisions, accepted Git objects and
verification outcomes without making the checkpoint commit part of the history
that it verifies.

The machine-readable entry point is [`checkpoint-summary.json`](checkpoint-summary.json),
validated by [`checkpoint-summary.schema.json`](checkpoint-summary.schema.json).
The independent reconstruction verifier's result is
[`reconstruction/verification-report.json`](reconstruction/verification-report.json).

## Accepted object identities

| History | Accepted tip | Tree | Commits verified with the expected SSH signer |
| --- | --- | --- | ---: |
| standalone `owlapi` extraction | `739e988b6b3196c626247713a6f3d2801a57d210` | `850f1289f254d174ef05080c2378e2e3497c00b6` | 32 |
| reconstructed WebVOWL `main` | `81b4cff89cece60ff5b8c30255658fbd770d01cc` | `772eee3afac9b71f72ca634ca4b397a1b5d17acb` | 120 |
| reconstructed WebVOWL UI/UX replay | `fde346f09e1f395646d6e3577930d23875a2a2c2` | `cf03115fc5269d95c7cee3f568b061281b82b970` | 82 |

The frozen original-history anchor remains reachable locally at
`refactor/java-to-javascript` commit
`8a40694950d4997141fcb039b4ac45bc19a224e3`. The checkpoint evidence commit is
added after the accepted reconstructed `main` tip. It therefore does not alter
the reconstructed commit identities or create a false self-reference in the
lineage map.

## Evidence layout

- `control/` contains the immutable pre-operation freeze, full commit inventory,
  partition decisions, issue-reference candidates, schemas, digests and signing
  trust source. Its `ref-operation-journal.jsonl` is the frozen initial journal;
  it is retained unchanged as pre-operation evidence.
- `review/` contains the reviewed classification overrides, split messages,
  reference resolutions, final proposal summary and pinned reconstruction-tool
  sources.
- `operations/` contains the completed append-only operational ref journal and
  the schema used to validate its 16-record hash chain. The journal records the
  guarded local source-anchor advance, local `master`→`main` rename, reconstructed
  `main` update and UI/UX repoint. It also records that all remote changes remain
  deferred pending separate push authorization.
- `reconstruction/` contains the project-owned 1:N lineage map and schema, the
  unchanged native `git-filter-repo` maps, signing maps, normalized tree
  manifests, before/after comparisons, reviewed UI conflict resolutions and the
  independent verifier report.
- `backups/pre-rewrite/` and `backups/accepted/` contain non-secret manifests,
  bundle inventories, checksums and off-platform-copy evidence. Git bundles and
  encrypted archive payloads are intentionally not committed to the ordinary
  source tree.
- `reuse-boundary-lineage.json` is the earlier controlled reuse-boundary record
  reconstructed with the WebVOWL history and remains separate from the complete
  Phase 19A 1:N lineage map.

## Mechanical reconstruction result

The schema-validated lineage accounts for all 275 original commits with 305
result commit identities:

- 241 map one-to-one;
- 32 are reviewed splits with scope-accurate messages and `Origin-Commit`
  trailers; and
- 2 became empty under the recorded `--prune-empty always` policy.

There are no silent exclusions. The sole candidate bare `#666` token was
verified as an SVG fill-colour value rather than a GitHub issue or pull-request
reference, so it remains unchanged. The independent verifier checked evidence
digests, source objects, result trees, reachability, identities and chronology,
message/trailer policy, parent topology, zero-result topology, accepted tip
trees and all 234 reconstructed signatures.

The frozen source tree has 614 files. Compared with the accepted UI/UX replay
tree, 610 files are byte-identical, one controlled provenance file is added and
four files contain reviewed reconstruction changes. The exact path and digest
comparisons are recorded under `reconstruction/webvowl-ui/`.

## Runtime qualification

The reconstructed WebVOWL `main` tip passed the complete default Jest run (134
suites, 2,935 tests), the production build, and the focused production
differential (33/33), production corpus (89/89) and VOWL differential (16/16)
gates. The accepted UI/UX replay tree passed its complete default Jest run (164
suites, 3,193 tests) and production build. The structured gate list and exact
target identities are in `checkpoint-summary.json`.

Phase 19B, rather than this reconstruction checkpoint, establishes the final
standalone package manifest, dependency closure, public exports and clean-clone
package test boundary.

## Backup and mutation boundary

Both the pre-rewrite state and the accepted reconstructed state have verified
Git-bundle inventories, checksummed age-encrypted archives and byte-identical
copies in the approved Microsoft OneDrive recovery location. They are explicitly
non-authoritative recovery copies. As approved in the plan, no restore rehearsal
was performed.

Phase 19A performed no npm write, package publication, release-tag creation,
remote-ref update or GitHub default-branch change. Those external mutations are
not implied by this checkpoint commit.

The local `.phase19-staging/` working directory is intentionally retained in
full. It contains disposable reconstruction repositories, intermediate reports,
downloaded pinned tools, encrypted backup payloads and project-authored
reconstruction utilities that may later be generalized in a separately scoped
effort. It is useful working material, but this curated evidence directory—not
the mutable staging directory—is the Git-tracked checkpoint record.
