# Phase 19A history-partition proposal G3

Status: **NON-AUTHORITATIVE — repository-owner approval required**

## Frozen source

- Common WebVOWL base: `28e7dd9540622e8cb723dc000824b5eef5ae775f`
- Frozen source tip: `8a40694950d4997141fcb039b4ac45bc19a224e3`
- Original commits accounted for: 275
- Original merge commits: 0
- Proposal SHA-256: `0749a544f152b4f2baf1302234521e279b4c12e6e620f84bf9fbf45104fd3053`
- Complete machine-readable proposal: `partition-proposal-g3.json`

## Classification totals

| Classification | Commits |
| --- | ---: |
| `OWLAPI_PACKAGE` | 10 |
| `MIXED_REQUIRES_SPLIT` | 22 |
| `WEBVOWL_INTEGRATION` | 93 |
| `WEBVOWL_UI_UX` | 84 |
| `SHARED_BUILD_OR_DEPENDENCY` | 35 |
| `UNRELATED` | 31 |

The proposal selects package-owned changes from the 10 package-only and 22
mixed commits. Every other commit remains accounted for but contributes no
change to the reconstructed `owlapi` history. This classification is separate
from the later project-owned 1:N lineage outcome: filtering may still make an
approved package contribution empty or degenerate, and that result must be
recorded after reconstructed commit IDs exist.

## Mixed commits requiring an honest split

1. `66d0cc96371109733698f9bcd79af9dff018c6bf` — Phase 0 foundation; package source/docs/tools selected, WebVOWL root package manifests excluded.
2. `1fed56aaed9882ace670a575e245299748f85d8f` — OWL/XML; package implementation/evidence selected, WebVOWL root package manifests excluded.
3. `0778b9f474506b912e2644879192c14ca541aab9` — RDF delivery/governance; package material selected, WebVOWL ADR excluded.
4. `715b6b0d0f4d068919139a2cc467499129e52da3` — development-app integration; manager additions and reusable package evidence selected, application/VOWL implementation and its dedicated lesson excluded.
5. `d6371c586761597b5a37144e6320e56dbd85cbd1` — false-regression correction; reusable migration/benchmark rules selected, Phase 7 VOWL lesson and baseline excluded.
6. `dff9e8ab98d246d5e46b8103e5e389363d416f94` — benchmark-environment guard; reusable package benchmarks/guard selected, WebVOWL ADR, VOWL benchmark, Phase 7 lesson and Phase 7 baseline edit excluded.
7. `81094378bba1122e3fbaceedba9970cbfc80bc73` — VOWL authority correction; core-isolation test selected, WebVOWL ADR excluded.
8. `afd4298684e5b909707940d2acff4ac35100b114` — production cutover; parser/RDF-to-OWL corrections and package evidence selected, WebVOWL code/tests/ADR/benchmark and dedicated cutover lesson excluded.
9. `20bcae3dea7bdd93ff7cad90907f8c75047cfdfc` — property-category evidence; parser/translator changes selected, VOWL implementation/tests and WebVOWL ADR excluded.
10. `413ebef652bf999bbe8d2bd5e473d648329f9b06` — production-corpus differential; translator corrections selected, VOWL output registry, cutover lesson, VOWL implementation/tests and WebVOWL ADRs excluded.
11. `5966c5ae454a89b724f6b368e48137c1034b0ad0` — Turtle; parser/conformance/reference tooling selected, VOWL corpus registry/application code/build configuration excluded.
12. `01ae5a8bf8b3b4c03f133e0cf98505924692a3a1` — DL Syntax; package implementation/evidence selected, repository-wide test-runner gate excluded.
13. `f94bd0572930378898dff1ecbf2fbbf8bef64495` — KRSS2; package implementation/evidence selected, repository-wide test-runner gate excluded.
14. `f83a02f78c0ece6c9e150dc8a98b4079c18542a0` — N-Triples; package implementation/evidence selected, WebVOWL lazy-chunk and repository-wide gates excluded.
15. `82b4770c2dec6c11daa694d472d3f3837893baca` — N-Quads; package implementation/evidence selected, repository-wide test-runner gate excluded.
16. `0ad02561b53fca7a07d78aa790a20a0760527298` — TriG; package implementation/evidence selected, repository-wide test-runner gate excluded.
17. `0896f082f85039964b9a1368142f1ff658ebe2e8` — JSON-LD; package implementation/evidence selected, WebVOWL lazy-chunk and repository-wide gates excluded.
18. `39d54ff16f962c05b3c3a2fc81b4b6417a956246` — OWL-to-RDF; package implementation/evidence selected, repository-wide test-runner gate excluded.
19. `f91ca99deeba3ebad422259ef5514f031477771d` — KRSS1; package implementation/evidence selected, repository-wide test-runner gate excluded.
20. `b5902e98da94a1ed99da174acea906aa42f9a46b` — legacy deletion; package closure documentation/test correction selected, WebVOWL legacy/application deletions and root manifest edit excluded.
21. `cd2a1c2a8a36da451a60264404a5aa165d37090b` — RDF dependency update; package qualification evidence selected, WebVOWL root package manifests excluded.
22. `f063486310b5e5c4539369f7dc992ee4aabc7462` — zero-major roadmap; package plans selected, WebVOWL materialization-cache plan excluded.

## Deliberate ownership corrections

Directory placement is only a first signal. The review therefore makes these
semantic corrections explicitly:

- `docs/owlapi-js/migration/lessons/006-development-integration.md` stays with WebVOWL.
- `docs/owlapi-js/migration/lessons/007-production-cutover.md` stays with WebVOWL.
- `docs/owlapi-js/compatibility/production-corpus-differences.json` stays with WebVOWL because it governs VOWL-JSON application output, not OWL parsing/model behavior.
- Commit `136a62a1851eaa77b71bba6ac5dcd2de27cf4776` is wholly `WEBVOWL_INTEGRATION`: it closes the WebVOWL cutover checkpoint and supplies no standalone package implementation.
- Commit `d6371c586761597b5a37144e6320e56dbd85cbd1` is mixed rather than package-only: its reusable benchmark method is selected while its VOWL-only evidence is excluded.

Shared historical records such as `provenance.json`, the migration playbook and
the combined performance/conformance registries remain selected where they also
carry package evidence. Phase 19B must normalize their current canonical form
to the standalone package boundary; their selection here preserves relevant
development and clean-room provenance and does not make WebVOWL modules public
package content.

## Reference review

The corrected boundary-aware scanner found one candidate in all 275 exact
original commit messages: `#666` in commit
`28aae57bf432282e02a4792a6f0363b8e89a0f29`. Patch/message inspection proves it
is the SVG colour literal `fill="#666"`, not an issue or pull-request reference.
Its proposed resolution is `NOT_A_REFERENCE`, so no original message is changed
for issue qualification.

## Mechanical state

- The frozen control set validates against its JSON Schemas and SHA-256 manifest.
- The proposal remains `PENDING`; the finalizer cannot mark it `FINAL/APPROVED`
  without an explicit approver and UTC approval time.
- All 13 focused evidence-tool tests pass.
- Portable `age` is pinned to official release `v1.3.1` at commit
  `b8564adb6d58329b8a3e267360ca2b0abc4efe1d`; the Windows archive SHA-256
  `c56e8ce22f7e80cb85ad946cc82d198767b056366201d3e1a2b93d865be38154`
  matches GitHub's published asset digest, `gh 2.98.0` verified its GitHub
  attestation, and the extracted `age.exe` SHA-256 is
  `90f5cc37249c06e0b302e476a8a63bcefeecd9437c192b8af33e6ff2d69558dd`.
- Portable `git-filter-repo` is pinned to official release `v2.47.0`, tag
  object `cbad6503f5de690c9d5a376d900136691c330793`, commit
  `6f79afc8c90c592a3052e6cc53c2ca8907515bca`; the upstream tag is unsigned
  and is recorded as such. The release archive SHA-256 is
  `4662cbe5918196a9f1b5b3e1211a32e61cff1812419c21df4f47c5439f09e902`,
  while the extracted executable script has Git blob
  `a40bce548d2c0bd0b8d5e233e8930d462e35e495`, exactly matching the file at
  that tag, and SHA-256
  `67447413e273fc76809289111748870b6f6072f08b17efe94863a92d810b7d94`.
- No branch, tag, remote ref, commit or tracked working-tree file has been changed.
