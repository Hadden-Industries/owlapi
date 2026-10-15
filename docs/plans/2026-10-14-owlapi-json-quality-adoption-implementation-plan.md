# OwlAPI shared JSON quality adoption implementation plan

Status: **Accepted for implementation and delivery; execution remains in progress.**

Current owner amendments on 15 October 2026 supersede the initial proposal where stated:

- The shared JSON Quality extension is approved.
  Generic checking, census accounting and presentation belong to the package; native source/evidence owners retain byte admission and domain verification.
- Restore original W3C sources and manifests from the exact pinned Git blobs, including 976 RDF source strings, 1,273 JSON-LD source/resource/result views and 11 manifests.
  Keep native import and logical-link guards, original backups, and the six approved replacement NFC identities.
  The table below records the current approved pins.
- Exclude every `**/node_modules/**` tree, `.development-tools/python/**`, `.development-tools/uv-cache/**`, `.venv/**`, the two exact unchanged Markdown archive reports, and the separately owned `.release/universal-ontology/**` checkout only after contained Git-root and frozen July-revision admission.
  This is the complete approved exclusion set; first-party reports and the scanner inventory remain checked.
- Retain the approved 12 exact W3C logical source/resource contracts and 11 historical reconstruction presentation contracts.
  The earlier nine Java profile presentation contracts are superseded by the owner's authorization to regenerate the unreleased evidence.
- All Java profile JSON and the owned provider build manifest and two release-gate registries receive ordinary presentation and semantic checking and are eligible for shared formatter writes.
  Refresh their native generators and dependent byte identities, preserve previous evidence copies, and require the existing freshness/domain checks.
  Java presentation regeneration does not claim new JVM measurements.
- The selected shared source is `9e3f6f55ec6e6689aca49b3f6161b97f96b92a7b`, published in producer PR #2 and admitted through the native isolated lock and payload check.
  This supersedes the initial source candidate without changing the product runtime floor or other consumer pins.
  Retain the complete producer security scan and its low-severity inventory finding, the subsequent repair scan, and local/hosted qualification separately.
- Canonical JSON commands and all six final post-producer workflow checks are activated in the implementation candidate.
  The policy uses stable section and path ordering for readability while preserving contract resolution and meaningful array order.
  Final OwlAPI correctness/security review, full HISEW verification, resource reconciliation and authorized publication remain required.

The chronology below records earlier decisions; the current amendments and implementation status determine the active disposition.

Owner amendment on 14 October 2026: implementation and delivery were authorized separately in the conversation.
The owner subsequently approved temporarily excluding only the unchanged Markdown Quality 1.0.3 `cargo-notices.json` reports until a qualified package update.
This overrides the no-exclusion clauses below for that exact report in the Windows/Linux installed packages and corresponding archive member `package/cargo-notices.json`; no directory or entire archive is excluded.
Retain the original bytes and prior diagnostics, remove the exception on package update, and continue checking every other member.
The implementation status records the current disposition and retains the earlier physical-exception and native-integration checkpoints.
The owner also approved temporarily excluding only the ignored `.development-tools/python/` installed tree from JSON discovery.
This prunes its internal aliases without changing the shared producer's link contract; tracked JSON remains checked and Python version/locked-environment checks remain mandatory.
Other development tools, source files, generated release inputs and the rest of the JSON scope retain their existing obligations.
The owner subsequently approved the 13 exact DEC-004 NFC value pins: the ten W3C values listed below and three captured contributor-name values in the two named npm evidence envelopes.
Pinned upstream text was independently checked for the W3C values.
Six initially captured source values differed from the pinned originals in CRLF/LF bytes; the subsequent approved source-truth restoration replaces those copies and their six NFC identities with exact original Git bytes.
The cause of the earlier conversion has not been established.
The native manifest/blob verifier independently admits the evidence envelope identities.
These approvals preserve original values while every key and unselected value retains NFC checking; they grant no additional exclusions or supplier-wide normalization waiver.
The owner subsequently instructed excluding the entire root `node_modules/` directory from JSON quality instead of adopting the 21-file supplier preservation proposal.
The exact boundary is `node_modules/**`; tracked JSON is still independently rescued by shared discovery.
Native lock, installed-package, archive/evidence and domain checks retain their obligations.
The proposal's original package proof and diagnostics remain preserved, with no supplier bytes or metadata rewritten.
The owner clarified that the exclusion covers every `node_modules` tree, including both isolated tooling installations.
The active pattern is `**/node_modules/**`; this supersedes the narrow physical Markdown report exclusions while retaining their earlier evidence.
Tracked Markdown archives and native evidence remain outside that installation boundary; their independent checking and exact archive-report decision remain applicable.

## Original planning baseline and retained decisions

The following sections preserve the planning baseline and original acceptance conditions.
Current owner amendments above and the implementation status record subsequent approvals and implementation evidence; this baseline is not a statement that those approvals or completed increments remain pending.

Prepared on 14 October 2026 against local OwlAPI `main` at `7d7d29bfcb96374ceed818a91c2c2740cb8f9823`.

The intended outcome is complete, attributable checking of OwlAPI-owned JSON through the maintained `@hadden-industries/json-quality` implementation, while retaining the meaning of fixtures, the integrity of evidence, and the existing package/runtime contracts.
The starting rule is **no JSON coverage exclusions**.
Only genuinely external fixtures can become candidates for a narrowly identified, provenance-backed exclusion, and only after the owner approves that exact boundary.
Generated files, locks, schemas, configuration, governance records, historical records, ignored files and packaged members are not exempt because of their category.

This document is an implementation handoff, not an accepted requirement snapshot, a verification receipt, a licence clearance or a claim that the adoption is complete.
Every `REQ`, `AC`, `QA`, `DEC`, `CFG` and `SLICE` below is proposed until the owner accepts an exact revision.
Discovery and writing this plan were authorized; no implementation, installation, configuration edit, HISEW execution adoption, commit, push, PR, release or deployment was performed for this plan.

## Authority, prerequisites and risk route

The owner, Maksym Shostak, is the decision and exception authority unless a responsibility is explicitly delegated.
[Repository governance][owlapi-governance] requires approval for normative changes and exact configuration file-and-setting approval.
The supplied repository instructions also reserve commits and pushes to separate explicit authorization.
A future implementation instruction must identify the accepted configuration rows and consequential decisions; approving this document's existence is not that instruction.

Planning follows `hisew-dev/0.1.0-dev.24`'s implementation-planning method and DRY-01, REU-01, VER-01, LIC-01, VAL-01, NAM-01, NSH-01, SEC-01 and proportionate verification.
Read-only applicability inspection found HISEW active for the selected OwlAPI worktree, with selected installation `ecf1e7bf-4504-51ac-9c76-a81d3af90d0d`, generation 1.
This does not adopt another execution or establish accepted lifecycle prerequisites.
Reinspect the calling session, execution ownership and supported commands before future engine mutation; do not reconstruct identities from this document.

A subsequent read-only Stop-hook investigation on 14 October 2026 found an additional prerequisite: the selected dev.24 engine reports OwlAPI's saved change execution as unreadable, with `unsupported (project, change-execution): This record format has no supported runtime reader`.
The retained execution is `5216882f-afee-4111-9ca8-d875a576d4a7`, for Java-compatible API behavior, with schema 1 and writer `0.1.0-dev.21`; its raw record is paused at generation 8 and associated with another chat, `01a13205-613e-7f63-9c82-68e4ab4c394a`.
Registration and configuration remain readable, but that does not establish execution readiness.
Resolve compatibility through a supported HISEW recovery route with the actual execution owner's authority before managed implementation.
Preserve the record and original evidence; this JSON planning task does not authorize adopting, resuming, closing, deleting or rewriting that execution, or changing the installed engine.

**Accepted route: R2.**
This changes parsing and filesystem coverage, dependency acquisition, guarded writing, provenance validation and blocking CI controls.
A missed member can admit bad evidence; an unsafe formatter can invalidate a retained artifact.
No inspected consequence requires R3 by itself.
The implementation needs a frozen accepted baseline, independent correctness review, scoped native security assessment, owner decisions on preservation and actual licence/provenance treatment, and full relevant final verification.
A small implementation diff would not reduce those obligations.

The material prerequisites are:

| Prerequisite                                                  | Current state                                                                     | Owner and minimum resolution                                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Accepted requirements, quality scenarios, design and R2 route | Draft terms below; not baselined                                                  | Owner accepts the exact revision and any conditional scope                                                  |
| Starting Git authority                                        | Local clean `main` is one documentation commit ahead of remote `main`             | Preserve the local documentation commit; owner selects the implementation base and delivery treatment       |
| Exact configuration changes                                   | Proposed matrix; no approval recorded                                             | Approve only the exact required rows and finalized values                                                   |
| No-exclusion coverage and foreign tool-state conflict         | Concrete findings below; no exclusion accepted                                    | Decide precise ownership and any external-fixture boundary without relabelling dependency state as fixtures |
| Evidence/logical-document integration                         | Native owners identified; shared buffer analysis works; orchestration gap remains | Run the bounded integration experiment in DEC-005 before choosing a producer extension                      |
| NFC/preserved-byte/negative contracts                         | Specific candidate values and immutable records identified                        | Accept exact owner, reason, independent identity and permitted diagnostic behavior                          |
| Licence and provenance treatment                              | Exact producer metadata inspected; existing OwlAPI reviews remain pending         | Retain actual rights facts and review status; obtain any material missing clearance                         |
| Review and delivery authority                                 | No new review, external review or Git publication authorized                      | Use the subsequently accepted route and explicit delivery scope                                             |

Do not implement an affected slice while its prerequisite is unresolved.
Independent planning can continue.
The first checkpoint of a later authorized implementation is a signed commit of the accepted plan, using the maintained committing skill and current HISEW prerequisites, **before implementation changes**.
That checkpoint itself still needs explicit commit authorization.

## Observed baseline and evidence limits

### Source identities and current controls

| Item                    | Read-only observation                                                                                                     | Consequence                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| OwlAPI local state      | Clean `main`, `7d7d29bfcb96374ceed818a91c2c2740cb8f9823`                                                                  | Plan was the only newly authorized working-tree artifact                                                                                       |
| OwlAPI remote state     | `git ls-remote origin refs/heads/main` returned `957deb38362b0ab55ed809f9722fcbf44eaec2ae`                                | Local `7d7d29b` is the existing `docs: Update Java API implementation status` commit; do not reset, rebase, discard or publish it by inference |
| Shared producer         | [PR 1][jq-pr] source `98b60e6522ceed6b6fdfcd3153c8ceb76d027a81`, normal merge `6ec9f9452ff944bd876907b6ecb469e3248cc794`  | Qualified adoption reference includes the native tar `ignoredEntry` repair                                                                     |
| UO adoption             | [PR 144][uo-pr] source `3ce28be700ebac33d3a7e50a794e8043c30138d4`, merge `41f7aa0fd6825701f33853295e79203cf7dde150`       | Reuse actual public-contract and acquisition integration; do not copy its exclusions                                                           |
| WebVOWL adoption        | [PR 79][wv-pr] source `2beeda28f3a589ba6041d2b40ec4d03424df7559`, merge `e93411027549dc292d7e324f25107ecf174d4441`        | Reuse logical-document/preservation lessons; its corpus policy is not OwlAPI authority                                                         |
| OwlAPI runtime          | Node `>=22.23.3 <23 \|\| >=24.21.0 <25 \|\| >=26.11.1 <27`; npm eligibility `>=12.2.0`                                    | Retain Node 22 product support and existing exact CI runtime selection                                                                         |
| Shared tool runtime     | Node `>=24.21.0 <25 \|\| >=26.11.1 <27`; npm `>=12.2.0 <13`                                                               | Isolate JSON tools and their ESLint configuration from Node 22 source/runtime lanes                                                            |
| Actual local tool pair  | Node `24.21.0`, npm `12.2.0`                                                                                              | Read-only probes fit the producer's declared tooling contract                                                                                  |
| Root development graph  | 23 development dependencies; lockfile v3; ESLint `10.12.0`, Prettier `3.9.9`, Ajv `8.20.0`, tar `7.5.22`, pacote `22.0.0` | Do not refresh the root graph merely to add the isolated JSON graph                                                                            |
| Producer graph          | Package `0.1.0-dev.0`, AGPL-3.0-only; `@eslint/json` `2.1.1`, ESLint `10.12.0`, Prettier `3.9.10`, Ajv `8.20.0`           | A reviewed Git source selection, not a registry-publication or stable-release claim                                                            |
| Native package boundary | `npm pack --dry-run --json --ignore-scripts` reported 195 files, no bundled dependencies                                  | Current rights scope is 195, not the 157-file historical PR 75 baseline                                                                        |

The shared producer's Node floor is the integration constraint.
OwlAPI's existing ESLint 10.12.0 lock entry admits Node `^20.19.0 || ^22.13.0 || >=24`; it is not evidence that current Node 22 lint is unsupported.

The producer source and both consumers were inspected locally; the three PR states and exact merge/source identities were read back with `gh pr view`.
Both consumer native locks select `98b60e...` with integrity `sha512-iuAaHpJem310DEhagoN83PZXzPlb6FFN1jEWjoz86rlgiSsazm0drek2V9/Sh4SNON1qqPNm977r7ZIGCi/H4g==`.
This is a reference identity, not a hand-authored OwlAPI lock entry or a promise that a later producer extension has the same identity.

### Measured JSON impact

The inventory reconciled tracked paths with a physical walk, including ignored and hidden paths.
Native shared `checkJsonDocument` and `checkJsonLines` APIs were used read-only.
No code or JSON formatter or normalizer ran.
Native Markdown formatting of this requested plan is a separate document-only action.
A finding count below is not a completed repository gate: the repository has no adopted policy, no approved exceptions and no unified logical-coverage result yet.

| Surface                               | Observed count or result                                                                                                                           | Required treatment                                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tracked `.json`                       | 168                                                                                                                                                | All checked, including configuration, generated, historical and governance files                                                                                                                              |
| Tracked `.jsonld`                     | 2 upstream JSON-LD manifests                                                                                                                       | Both checked; provenance can justify byte protection, not silent omission                                                                                                                                     |
| Tracked `.jsonl` and `.ndjson`        | 2 JSONL files and 1 NDJSON file; 1 + 16 + 70 = 87 records                                                                                          | Framing and strict per-record checks; append-only/historical bytes remain protected                                                                                                                           |
| Total tracked JSON family             | 173 files                                                                                                                                          | Default analysis found 90 presentation findings in 90 files, 10 NFC value findings and two npm lock empty-key findings; no syntax, duplicate-key or unsafe-number findings                                    |
| Independent physical JSON-family walk | 1,448 files: 173 tracked and 1,275 ignored or Git-internal; zero visible untracked at inspection                                                   | A tracked-only command would miss most present files; this is an independent census with per-document analysis, not a successful adopted shared inventory run                                                 |
| Nontracked clusters                   | Root `node_modules` 1,025; `tooling/markdown/node_modules` 233; `.development-tools` 14; `.venv` 1; `.git` 1; `.release` 1                         | These are observed ownership questions, not approved exclusions                                                                                                                                               |
| Git/admin and release examples        | `.git/worktrees/owlapi/codex-thread.json`; `.release/playwright-output/.last-run.json`                                                             | Do not call administrative or generated state an external fixture                                                                                                                                             |
| Content-addressed npm evidence        | 3,349 physical store files: 3,347 manifest-referenced blobs plus README and attributes; 2,740 blobs parse as JSON, totaling 65,941,920 bytes       | Use the native manifest and blob identities as the discovery authority, not extension guessing                                                                                                                |
| Declared JSON evidence classes        | 2,736 envelopes: 684 each of `ARCHIVE_INVENTORY`, `NPM_PROVENANCE`, `REGISTRY_SIGNATURE`, `SCANCODE_FINDINGS`; four retained source-map JSON files | Native shared analysis found no presentation, syntax, duplicate, unsafe-number or empty-key findings under the evidenced producer formats; three NFC values occur in two envelopes concerning `source-map-js` |
| JSON-LD logical fixture documents     | 494 resource values plus 467 test-source values: 961 references to 481 unique byte identities                                                      | Six logical documents have eight non-presentation findings: five empty keys, one NFC value and two unsafe numbers; all 481 have valid outer JSON syntax                                                       |
| Archive census                        | 185 unique physical archive containers; 174 JSON members observed without extraction                                                               | A census is not complete strict qualification of every archive member; reconcile members with native archive/evidence owners                                                                                  |
| Tracked Markdown archives             | Three `.tgz` files with 24 JSON members, distributed 10 + 7 + 7                                                                                    | Existing pinned package payloads remain included and protected; do not alter their bytes or selectors to make the new gate pass                                                                               |

The archive census also observed JSON in installed source/development material: 148 `.json.gz` data members, one Python wheel member and one installed `MPL-SOURCE.tar.xz` member. The 24 `.release` Java archives, two root dependency archives and tracked `util/owlapi-reference/publication-assets/sources/jfact-uncombined-sources.jar` contain no JSON members. The census deliberately did not follow `.development-tools/python/cpython-3.15-windows-x86_64-none`, a junction to the versioned Python directory, after detecting duplicate traversal; the corrected total is 185 containers and 174 JSON members. Symlink or junction handling must be an explicit failure/ownership decision, not a hidden omission.

Across the independent physical census, total default diagnostics were 608 presentation findings, 3,586 duplicate keys, 30 empty keys, 161 NFC findings, two unsafe numbers and four syntax failures.
The 90 tracked presentation findings comprise 70 under `docs` (including both upstream JSON-LD manifests), 14 under `util`, three root configurations, and one each under `LICENSES`, `internal` and `scripts`.
No physical `.sarif`, `.jsonc` or `.json5` file was found.
Shared `inspectJsonInventory`/`runJsonQuality` was not successfully run against a zero-exclusion OwlAPI policy: that policy does not yet exist, and creating it was not authorized. Source inspection establishes that it walks Git/install state without implicit exemptions and rejects nonregular paths; a future operational failure must retain incomplete status instead of substituting this census as a pass.

There are concrete foreign-tool conflicts.
The installed Markdown tool's `cargo-notices.json` yielded 3,586 duplicate-key findings.
In the tracked Linux/Windows archives, exact member `package/cargo-notices.json` has respectively 3,598 and 3,586 duplicate occurrences; Linux also has two NFC values.
Archive duplicate counts used the local Python JSON parser's `object_pairs_hook`, and the installed Windows member independently produced the same 3,586 native shared `duplicateKey` diagnostics.
Root `node_modules` yielded four syntax errors, 28 empty-key findings, two unsafe-integral-number findings and 151 NFC findings; examples include JSONC-shaped `node_modules/@cyclonedx/cyclonedx-library/tsconfig*.json` and canonicalize fixtures containing `1E30`.
These results are not permission to add `node_modules/**`, `.development-tools/**` or archive exclusions.
They also do not authorize fixing third-party packages in place or labelling ordinary defective data an expected-negative fixture.

The ten tracked NFC findings are all **values**, not keys, in three generated W3C conformance files.
They include Unicode boundary strings and their expected results.
A global normalization would change the tests.
The two empty-key findings are exactly the native npm lock root entries at `/packages/` in `package-lock.json` and `tooling/markdown/package-lock.json`; the future JSON lock will need the same narrowly verified npm contract.
Separately, logical JSON-LD cases `er52`, `js10` and `js13` contain five empty keys; `js11` contains one NFC value; and `js12`/`rt01` contain unsafe numbers.
These are not unsafe-number or empty-key defects of the outer generated JSON.
The corpus's 106 negative-evaluation tests do not authorize one blanket expected-negative JSON contract.

### Existing owners that must remain authoritative

- [The root manifest][owlapi-package], `CONTRIBUTING.md`, `eslint.config.js`, `.prettierignore` and `scripts/source-policy.test.js` own current source tooling.
  Broad generic formatter ignores cover generated conformance, upstream fixtures, history reconstruction, npm evidence and generated release gates.
  Those ignores currently protect writers; they are not acceptable JSON checking boundaries.
- [Semantic JSON identity][owlapi-semantic] assigns `scripts/canonical-json.mjs` the recursive UTF-16 key-order encoding, with ordered arrays.
  `stableJson` is two-space JSON plus LF; `canonicalJson` is the established compact encoding.
  This is not RFC 8785.
  Exact-file hashes continue to bind raw bytes.
  Shared JSON quality does not export a replacement canonical-digest algorithm.
- `scripts/review-facts.mjs` owns fact projections; `util/refresh-review-facts.mjs` checks them and only writes with `--write`.
  Changed facts clear old attestations.
  Rights inventory schema 2, third-party material schema 3, dependency governance schema 2 and scoped-name review schema 2 currently retain `PENDING_HUMAN_REVIEW` and `sha256-sorted-json-v1`.
- [Rights inventory][owlapi-rights] records the 195-file native packlist and source-byte digest `0f41bca0df2d9da6f5412996a648abbe86ae04ee653010672f89fcd2e9fe9874`.
  A changed packed `package.json`, runtime source or shipped JSON can require a new scope digest even when the number of files is unchanged.
  Use the existing native packlist and review-facts workflow; do not copy its hash algorithm into a new JSON gate.
- `util/third-party-evidence/evidence-manifest.mjs`, `blob-store.mjs`, `archive-evidence.mjs` and the existing verification commands own evidence references, source bytes, archive membership and semantic kinds.
  A blob's name is its SHA-256, and changing formatting creates a different artifact.
  Four source-map files are external package material retained as evidence; their ownership and exact JSON checking obligation must be resolved from this manifest, not guessed from their bytes.
- `docs/conformance/suites.json`, `classification-manifests.json`, the W3C generators and parser/conformance tests own corpus meaning.
  W3C JSON-LD manifests are pinned to `ffdb326121ea89b7b8280e76a5caea923834bcef`; the RDF suite records its own exact source revisions.
  The `.gitattributes` override preserves upstream bytes.
  Generated outer JSON is still strict JSON even when a string contains deliberately invalid RDF or JSON text.
- `docs/provenance/history-reconstruction/README.md` describes immutable pre-operation evidence and the 16-record operational hash chain.
  That history stays checked and byte-preserved.
  It is not an external-fixture directory and receives no blanket exception.
- `scripts/generate-release-gate-registry.mjs` derives `docs/release/gates.json` and `producer-gates.json` from their existing plan authorities.
  `scripts/build-jsonld-provider.mjs` owns its provider manifest and records the root lock and build inputs.
  Preserve those generators; do not hand-edit their outputs as a formatting shortcut.
- [CI][owlapi-ci], `release.yml`, `scripts/workflow-governance.mjs` and `scripts/ci-qualification.mjs` own closed job inventories, required setup order and `FULL_ONLY` qualification.
  The Node 24 and Windows quality lanes already own isolated Markdown tools; Node 22 and Node 26 source lanes intentionally use source/Python checks.
  Dependency review, browser, retained-candidate and installed OWL contract gates remain separate obligations.

A source-confirmed semantic comparison needs focused attention: `scripts/embedded-provider-sbom.mjs` compares `existing` and `provider` objects with `JSON.stringify`.
Object member reordering can therefore appear to describe a different embedded provider.
Other serialization comparisons, such as ordered filename arrays, can be legitimate.
Classify each actual sink; do not replace every `JSON.stringify` or waive a whole file.
A whole-repository identity-rule baseline was not completed: two inline read-only invocation forms were rejected by the command guard.
Source inspection is the current evidence; a native configuration probe and behavioral regression remain required.

## Requirements and acceptance terms

| Requirement                                                           | Proposed acceptance criterion                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **REQ-001 Complete owned JSON coverage**                              | **AC-001:** Independent Git/filesystem/native-owner inventories reconcile with the mandatory gate. New tracked, untracked, ignored, hidden and generated owned JSON is checked; declared logical/evidence JSON is accounted for. Missing, duplicate, unreadable or unresolved members fail rather than reduce counts. No blanket historical, evidence, generated, external-state or vendor exemption. |
| **REQ-002 Strict syntax and interoperability**                        | **AC-002:** Reject malformed UTF-8, leading BOM, invalid outer syntax, escaped-equivalent duplicate keys, unsafe values, Unicode noncharacters and mathematically integral values outside ±9,007,199,254,740,991, including decimal/exponent spellings. Reject meaningless/edge-whitespace keys without trimming or numeric coercion. JSONC/JSON5 remain unsupported.                                 |
| **REQ-003 Separate checking from writing and presentation ownership** | **AC-003:** Every admitted document receives analysis. Native producer presentation and exact-byte protection remain independently testable; generic `format`/`normalize` cannot write protected outputs, locks, history, archives or evidence. A bad peer blocks the complete proposed write batch; valid formatting is idempotent and preserves meaning/token commitments.                          |
| **REQ-004 Collision-safe NFC with exact value preservation**          | **AC-004:** Keys and ordinary values use NFC. Normalization rejects prospective key collisions and unsafe inputs before writes. Only demonstrated, exact, protected value pins preserve decomposed test/evidence text; keys and unselected values stay checked. No broad `normalization: preserve` convenience rule.                                                                                  |
| **REQ-005 Semantic JSON identity**                                    | **AC-005:** Reordered object members remain equivalent; changed/missing/extra values and ordered arrays do not. Existing digest encodings and raw-byte hashes retain their contracts. The shared ESLint rule detects regressions in actual consumer scope, with local owner/reason byte/digest/ordered-tuple contracts only.                                                                          |
| **REQ-006 One shared engine and reproducible acquisition**            | **AC-006:** OwlAPI consumes public package exports and a native exact-source npm lock; shared producer owns acquisition, parsing, schemas, common resource handling and generic repair. Clean acquisition, transported installed-package qualification, cache/offline operation and tamper rejection bind to the selected artifact. No private import, copied engine or sibling fallback.             |
| **REQ-007 Preserve supported runtime and tool isolation**             | **AC-007:** Node 22 source lint/tests and retained-package qualification do not import the JSON graph. Canonical Node 24 and supported Node 26 JSON-tool probes use the declared producer contract. Root runtime engines, production dependencies, 23 development-dependency policy and Markdown archive graph are unchanged unless separately approved.                                              |
| **REQ-008 Preserve domain and governance authority**                  | **AC-008:** Native schemas, generators, package boundaries, release gates, rights facts, human-review status and corpus semantic oracles remain mandatory. Exact changed packed bytes refresh the existing scope/facts authorities without fabricating approval or rewriting historical evidence.                                                                                                     |
| **REQ-009 Truthful bounded results and security**                     | **AC-009:** Inventory reports scope only; incomplete/failed analysis reports unknown coverage accurately and fails. Limits are explicit and independently enforced; traversal, links, unsafe archives, missing outputs and ignored native parser entries cannot produce a green partial result. Native security and review evidence match the final candidate.                                        |
| **REQ-010 Controlled activation and recovery**                        | **AC-010:** Approved configuration and data changes occur in staged slices, with the plan committed first, all relevant writers settled before review, explicit activation evidence and a recoverable pre-migration byte set. No implied commit, push, merge, release or deployment.                                                                                                                  |

## Proposed design and DRY ownership decisions

### Shared engine, native contracts and exact acquisition

Reuse the completed [extraction/adoption design][shared-plan] and actual merged implementation, refreshed against the current source identities above.
The October 10 research brief and response are historical selection rationale: their `@eslint/json` 2.0.1 / Prettier 3.9.9 baseline and portfolio counts are superseded by the inspected producer graph and this OwlAPI census.
Existing Prettier alone cannot replace strict/interoperability checks; JSON Schema alone cannot recover duplicate object keys after parsing; a new JSONC/Biome parser, copied regex rules or independent validator would duplicate the maintained capability.
Retain Ajv and each domain's native validator for their separate semantics.

The pinned [producer consumer guide][jq-guide], [public export surface][jq-public], [configuration schema][jq-configuration] and [installation verifier][jq-installation] define the reusable contracts below.
The actual [UO adapter][uo-adapter] and [WebVOWL adapter][wv-adapter] show the thin composition boundary; their [UO npm controls][uo-controls] and [WebVOWL npm controls][wv-controls] show command integration.
Inspect the corresponding [UO policy][uo-policy] and [WebVOWL policy][wv-policy] to understand historical decisions, while retaining OwlAPI's independently accepted zero-exclusion starting point.
Neither consumer policy is an OwlAPI template.

The producer owns these supported boundaries:

| Public contract                                                                                                                | OwlAPI use and residual responsibility                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root exports `runJsonQuality`, `runJsonQualityCli`, inventory/document/JSONL analysis and result validation                    | A thin adapter fixes OwlAPI's root, supplies actual required outputs and authorized owner obligations; shared code retains argument parsing, result schema and exit behavior |
| `readJsonPolicy`, `jsonContract`, `jsonFormatOptions`, `checkJsonPresentation`, `decodeJsonBytes`, `normalizeJsonSource`       | Use shared rules for source and producer analysis; do not copy the parser, suffix list, pointer handling, normalization or numeric rules                                     |
| `@hadden-industries/json-quality/eslint`                                                                                       | Shared `no-json-stringify-identity` rule in a canonical-tool-only ESLint configuration                                                                                       |
| Public configuration/result schemas                                                                                            | Validate native closed schema 1 and actual result accounting; do not translate UO's old pre-extraction schema or maintain local schema copies                                |
| `jsonQualitySourceCoordinate`, `jsonQualityAcquisitionBootstrap`, `verifyJsonQualityInstallation`, `assertIsolatedJsonQuality` | Shared acquisition, native source/lock/cache admission, installed-byte/bootstrap verification and public export isolation                                                    |

The sole editable package selector is `tooling/json/package.json`'s `devDependencies["@hadden-industries/json-quality"]`.
Use the reviewed full Git commit `git+https://github.com/Hadden-Industries/json-quality.git#98b60e6522ceed6b6fdfcd3153c8ceb76d027a81` as the current candidate; a necessary producer change requires a new explicitly qualified exact source before activation.
Native npm generates `tooling/json/package-lock.json`.
Neither a GitHub `/archive/` download nor a handwritten integrity/resolution record is an alternative source authority. Exact npm versions and equivalent same-package aliases are supported future transport forms only after selection approval. Moving branches/tags, partial SHAs and sibling links are rejected.

Generate the cold installer verbatim from `jsonQualityAcquisitionBootstrap()`, then verify its content against the independently installed producer, allowing only the producer's declared checkout-newline difference.
This materialized bootstrap is generated representation of one rule, with drift detection; it is not a separately maintained OwlAPI installer.
Use script-free frozen native npm acquisition and resolve the same native cache for install and later verification.
Missing cache proof is a failure, not permission to fall back to installed files or silently download during a check.

Clean producer packing and transported public CLI/library/plugin qualification remain evidence obligations.
Consumer repositories need no new retained JSON-engine tarball or duplicate provenance pin.
Keep OwlAPI's existing Markdown archives separate and unchanged.
The engine is first-party organisational software under the inspected AGPL-3.0-only terms; do not invent Universal Ontology as an external rights holder or add UO-origin third-party notices.
Still inspect the exact dependency graph and preserve applicable existing notices and unapproved rights decisions.

### Coverage is broader than mutation

The proposed `.json-quality.json` starts with mandatory defaults and **no `exclude: true` entries**.
Sparse owner/reason records may change presentation or prohibit writes without removing analysis.
No directory-level historical-evidence, external-state, generated-output or installed-tool exclusion is imported from UO or WebVOWL.

| Mechanism                             | What it means                                                                                                            | Required boundary                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Coverage exclusion                    | Omits a filesystem region or document from analysis                                                                      | Requires an explicit coverage decision; eligible only for an approved, exact, genuinely external fixture boundary                         |
| `allowFormatWrites: false`            | Shared generic writers cannot change the matched inputs                                                                  | Syntax, keys, values, NFC and native domain checks remain mandatory                                                                       |
| Producer presentation contract        | Check bytes against the actual serializer's format; non-default producer formats intrinsically prohibit generic writes   | Quality diagnostics and native generator semantics remain mandatory                                                                       |
| `preserved-bytes` with exact identity | Recheck independently pinned original bytes and declared exact diagnostics                                               | One exact protected path and independently established identity; a failed check cannot authorize resetting its pin                        |
| `preserveNfcValues`                   | Preserve selected decoded string values at exact pointers/record selectors with SHA-256 and length                       | Keys and every unselected value retain NFC enforcement                                                                                    |
| Expected-negative contract            | Verify the exact intentional negative document, bytes and diagnostics, including linked logical members where applicable | Accidental historical defects remain failures until an accountable disposition; they do not become negative tests by classification alone |
| `allowEmptyKeys: ["/packages/"]`      | Admit the actual npm lock root key at exactly that decoded pointer                                                       | Other empty keys and whitespace-only keys still fail; the entire lock remains checked                                                     |

The producer rescues tracked files from an `exclude: true` region: the tracked document remains checked and becomes write-protected.
That is a useful safeguard, but it does not make such exclusions compatible with this plan.
Untracked/ignored children are still pruned. There is no existing `zeroExclusions` option that enforces the user's rule. Enforce the approved policy with a narrow consumer policy assertion and mutation proof using the producer's parsed policy; extend a shared enforcement option only if reuse/contract analysis establishes a real common need.
Do not copy schema validation.

To remove competing writers, route JSON formatting to the shared writer and explicitly keep generic Prettier source/editor operations away from JSON-family files.
Proposed `.prettierignore` additions are five literal patterns, `**/*.json`, `**/*.jsonld`, `**/*.sarif`, `**/*.jsonl` and `**/*.ndjson`.
This is a **writer/presentation ownership transfer**, not a quality exclusion: the shared inventory ignores neither `.prettierignore` nor Git ignore for checking.
Existing non-JSON ignores and Markdown protections retain their meaning.
A mutation test must show that a JSON file skipped by generic Prettier still fails the mandatory shared check.

Do not use a single consumer baseline list to decide which JSON exists.
Native discovery must still catch a newly added peer.
Declared required generated outputs are additional obligations, never substitutes for discovery.
The actual producer/gate owner must select exact expected outputs for the operation being qualified; do not copy UO's `dist` or WebVOWL's `deploy` requirements.

### Evidence, archives and logical JSON

Use an explicit native-owner inventory for the 2,736 evidence envelopes, the four retained source maps, retained package JSON members, and any actual generated artifact JSON.
Their storage references, hash/length and semantic kind are the authority.
Do not recursively guess that every arbitrary string or opaque file is an additional JSON document.
In particular, an outer fixture containing `"input": "{invalid}"` is valid strict JSON and remains checked; interpreting that string as a second document requires a real owner-declared obligation.

The shared `logicalInventory` contract currently represents UTF-8/base64 strings at pointers in inventoried physical JSON containers. It requires exact path/hash/length/container/pointer/encoding and reconciles supplied bytes to the physical field.
Raw hash-addressed blobs and tar members do not satisfy that shape.
Do not invent a fake JSON container, copy WebVOWL's corpus storage, or claim the existing API covers them automatically.

**DEC-005's cheapest experiment comes first:** extend an isolated probe of the existing OwlAPI evidence verifier to analyze one member of each declared JSON evidence class through public `checkJsonDocument`, after native provenance verification, and retain the native owner's independent result/coverage accounting.
Test one retained archive's actual JSON members the same way through the native archive reader.
Establish whether those owner gates can discharge all accepted obligations as explicit mandatory phases without duplicating generic orchestration.
The read-only discovery already established that public buffer analysis is technically possible; it did not qualify a new command or result contract.

Only if the accepted mandatory coverage cannot be expressed cleanly through those maintained owner gates should a separately authorized producer slice extend shared source/accounting contracts. That extension must distinguish physical JSON, JSON-container fields, content-addressed evidence and archive members; bind bytes to independent native-owner identities; preserve no-write behavior and complete/error counts; and qualify existing producer/UO/WebVOWL consumers.
The exact public API/schema change and source pin are decisions before coding, not predicted implementation in this plan.
Do not make a general-purpose archive platform or arbitrary extensionless-file classifier a prerequisite without a demonstrated gap.

OwlAPI's archive reader currently counts and validates `onReadEntry` members.
Source inspection did not find an `ignoredEntry` handler there.
The producer's repaired native-tar failure class is therefore a relevant regression question for any archive adapter: qualify complete member accounting, including native ignored metadata, before relying on the reader as a new JSON coverage oracle.
This is an unproved transfer risk, not a claimed exploitable OwlAPI vulnerability.
Repair the actual owner if the focused probe reproduces the gap; do not silently substitute a copied tar parser.

### Exact Unicode and historical preservation decisions

The generated fixture findings justify considering value preservation rather than changing their test meaning.
Each proposed pin below must be checked against the generator's pinned source/expected-result authority and accepted under DEC-004; this table does not approve it.
Paths are under `docs/conformance/generated/`.
Hashes identify decoded UTF-8 string values, not JSON source spelling.

| File and JSON pointer                             | Decoded bytes | SHA-256                                                            |
| ------------------------------------------------- | ------------: | ------------------------------------------------------------------ |
| `w3c-jsonld.json` `/tests/318/expected`           |           126 | `21b1321e21b2e3ecbf7111e7e52b80cd2e5d20f3f196a5129ee47fcde2396c08` |
| `w3c-trig.json` `/tests/21/source`                |           356 | `b715cc6b51d7e9d4910aae0fc9470695e3b83a02dd517e4f0a8045d7228947e2` |
| `w3c-trig.json` `/tests/31/source`                |           292 | `af2e6a0fcb910d5ee86f9b959246b0dd1eb4cb38e9b4fc0759dfb13e7cea0bfa` |
| `w3c-trig.json` `/tests/31/expectedQuads/0/2/1`   |            86 | `30c4619a65d7a3425508a9f38c239543b3a1cfa7a6953c8b7c904e7d0dbc0a6f` |
| `w3c-trig.json` `/tests/31/expectedQuads/1/2/1`   |            86 | `30c4619a65d7a3425508a9f38c239543b3a1cfa7a6953c8b7c904e7d0dbc0a6f` |
| `w3c-trig.json` `/tests/40/source`                |           259 | `9b4629c7eca38d7a2d258183afcc8a217c33c5337396ad603c99ea6ab8d1b3ad` |
| `w3c-turtle.json` `/tests/10/source`              |           217 | `4a8d00163cabad0cb711c8b165331355ed69d1f5eb1dbb76479a9c774e35b1ea` |
| `w3c-turtle.json` `/tests/20/source`              |           149 | `eebddbc2f871db039d42692f1100b48e978d18a52e13fd40859971b37f748ee8` |
| `w3c-turtle.json` `/tests/20/expectedQuads/0/2/1` |            86 | `30c4619a65d7a3425508a9f38c239543b3a1cfa7a6953c8b7c904e7d0dbc0a6f` |
| `w3c-turtle.json` `/tests/29/source`              |           116 | `64a9f2ff0fe3a610633a69e2890c206cfe52325d83e389d4c60226de694e9c5c` |

The corresponding fixture names are `prefix_with_PN_CHARS_BASE_character_boundaries`, `localName_with_assigned_nfc_PN_CHARS_BASE_character_boundaries`, `labeled_blank_node_with_PN_CHARS_BASE_character_boundaries`, and JSON-LD case `js11`.
The policy should not derive acceptance identities from the post-normalization candidate.
Mutation proofs must fail if a pin moves, disappears, becomes a non-string, changes bytes, or leaves an extra decomposed value unselected.
JSONL preservation, if actually needed, uses a unique stable record selector and decoded value pointer, not a line number or a broad record waiver.

The generated W3C serializers currently use Prettier `parser: "json"` (`util/generate-w3c-jsonld-fixtures.mjs`, `generate-w3c-trig-fixtures.mjs`, `generate-w3c-turtle-fixtures.mjs`), whereas the shared standard uses `json-stringify`.
The 90 presentation findings are therefore not an instruction to rewrite all outputs.
Choose an actual supported presentation contract, change a mutable producer with semantic proof, or propose exact historical-byte preservation.
Do not mislabel an unsupported style as an existing native producer contract.

Three further candidate NFC value pins concern two content-addressed evidence envelopes, not the four raw source maps.
Their exact physical identities are:

| Blob under `docs/provenance/evidence/npm/blobs/sha256/`                               | JSON pointers                                                                              | Decoded value bytes and SHA-256                                                   |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `43/43676e3bfbd1e8044dbcd066c284aebeeaec817cd4c67d9c3c3025bd8e95e937` (116,738 bytes) | `/evidence/files/1/package_data/0/parties/30/name`; `/evidence/packages/0/parties/30/name` | Each 17 bytes; `71399d5093873f6414aa555768fd658da8b721eff8902ffaa661f78815a2d2a3` |
| `83/83d624b3d46dc3a8c39e5c7ffb1c24349dfab4e6d9295ee7958bb12a48b76781` (7,591 bytes)   | `/evidence/packageMetadata/contributors/36`                                                | 46 bytes; `684eb0b0ae2d00f9d2830f20c393e4b9e3e5d9ed4e675070d3d310abe36cd7c1`      |

All 6,083 manifest references checked during discovery matched their physical SHA-256 and byte length; duplicate references do not increase the distinct document count.
Modifying a contributor's captured spelling in one of these envelopes would create new evidence bytes.
Preserve the original and require the exact owner-approved contract in the accepted native evidence integration.
The current policy's physical suffix matcher cannot express these blobs by itself.

For immutable history, establish exact byte hashes and the owning chain/schema validator first.
Prefer a supported producer presentation contract where it describes actual bytes.
Where original presentation cannot be represented without rewriting history, propose one exact `preserved-bytes` record and explicit diagnostics, with owner approval.
A genuine newly discovered strict-quality defect stays visible as a defect; accepting preservation must not claim that invalid JSON became valid.
No existing historical-approval field is renewed by automated formatting or by updating a digest.

### Runtime, ESLint and command boundaries

Keep the root `eslint.config.js` independent of the JSON graph.
An eager import of `tooling/json/public-api.mjs` or the plugin there would load an unsupported tool graph during Node 22 `lint:source-python` and source-policy tests, even if no JSON CLI command ran.
Do not use a runtime-version conditional that silently skips a required rule.

Propose a separate `eslint.json-identity.config.mjs`, invoked only by a named canonical JSON-quality command.
It imports the shared plugin through the isolated public bridge, reuses the existing root source configuration where appropriate, and deliberately selects the first-party source/test/script scope that owns semantic JSON identities.
The shared guard is error-level with unused-disable reporting.
Its scope is independently compared with the tracked relevant code inventory; vendor-generated code gets a documented ownership decision, not a blanket first-party-file waiver.
Node 22 never loads this configuration.
The canonical gate always runs it; missing tooling/configuration is a failure.
Independently qualify the tool command on supported Node 24 and 26.

Public operations retain precise names and effects: `inventory` reports scope without analysis; `lint` checks syntax/interoperability; `check-format` checks presentation; `check` combines the declared analysis; `producers` checks protected producer outputs; `format` writes only admitted ordinary sources; `normalize` requires explicit source paths and collision-safe admission.
There is no legacy `inspect` alias or overlapping full-check command masquerading as an inventory.

Proposed npm entry points are `install:json`, `inventory:json`, `lint:json`, `format:json:check`, `check:json`, `check:json:producers`, `format:json`, `normalize:json`, `lint:json-identity` and `test:json`.
Their adapter and installer remain thin public-contract consumers.
The final `check:json` scope must clearly include, or explicitly compose with named mandatory native-owner phases for, the accepted evidence/archive obligations; its output must not imply that the engine's suffix-only physical count is the entire repository JSON population.

Integrate `lint:json` and the identity guard into canonical lint, and `format:json:check` into canonical format checking.
Integrate source repair into `format` through the guarded JSON writer.
Preserve Node 22/26 `lint:source-python` and `format:source-python:check` as source/Python lanes; canonical Node 24 and Windows JSON gates establish the missing cross-repository coverage.
Add a supported Node 26 tool probe under an explicitly approved lane or controlled runtime step without changing the closed job inventory casually.
Fresh generated/evidence/package outputs receive a final read-only check after their owning producers finish.

### DRY-01 decision record

| Rule/domain                                                           | Current authority and latest consumers                                           | Strategy and drift control                                                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Strict JSON, Unicode/numbers, normalization, common discovery/results | Selected json-quality public package; producer, UO and WebVOWL                   | Shared code; OwlAPI public consumers and mutation probes; improve the producer for actual common gaps                         |
| Cold acquisition and exact installed payload                          | Producer bootstrap/installation exports and native npm                           | Generated bootstrap plus native lock; installed-source drift check; no copied resolver or second source pin                   |
| Semantic object identity versus exact digest encoding                 | Shared lint guard; OwlAPI `canonical-json.mjs` and native semantic validators    | Shared guard plus retained local encoding authority; permutation and byte-digest oracles prove their distinct meanings        |
| Evidence/source membership and corpus meaning                         | OwlAPI manifests, blob/archive readers, W3C sources and native domain validators | Thin owner adapters; no independent parser, inventory or hash authority; physical/logical accounting proves completeness      |
| Producer presentation and byte preservation                           | Actual OwlAPI generator or retained artifact owner                               | Shared check with narrow owner/reason contract; regenerate through owner; pin exact history only when accepted                |
| CI completion, runtime projection and human attestations              | OwlAPI workflow/release/governance code and owner                                | Extend current controls; negative gate-removal and attestation-preservation tests; no copied UO workflow or approval metadata |

No new runtime service, compatibility alias, dual old/new JSON engine, silent fallback or package-manager shim is proposed.
Any bridge that preserves a superseded contract needs an explicit NSH-01 decision; calling it an adapter does not waive that requirement.

## Rework lessons and preventive proof

These are causes and repairs found in actual commits, not a claim that prior green runs qualify OwlAPI.
Older extraction plans contain superseded archive and policy choices; current code and the native-acquisition amendment own the reusable design.

| Prior cause or rejected shortcut                                                                                   | Repair evidence                                                                                                                                    | OwlAPI preventive proof                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicated policy/formatter allowlists drifted; new or ignored files could miss checking                           | UO [`23aa197`][uo-dry] consolidated native contracts; [`1003529`][uo-defaults] made checking default with sparse exceptions                        | One shared resolved policy; new tracked/untracked/hidden/ignored peer fails; generic formatter skip does not skip JSON quality                                                          |
| NFC rewriting could collide keys or alter meaningful strings                                                       | UO [`bcf0894`][uo-nfc] added AST-based collision-safe normalization                                                                                | Nested, escaped, root and array values; collision and bad-peer atomic abort; preserved numeric lexemes; no automatic key trimming                                                       |
| Ordinary rules missed meaningful keys, noncharacters and mathematically integral unsafe decimal/exponent values    | UO [`baca599`][uo-numbers] added exact interoperability controls                                                                                   | Safe boundary ±9,007,199,254,740,991, unsafe decimal/exponent cases, fractions, whitespace keys and exact npm `/packages/` exception                                                    |
| Raw serialization equality made object order meaningful                                                            | UO [`12de332`][uo-identity] changed semantic comparisons; [`bebe34f`][uo-guard] guarded identity sinks                                             | Reordered objects pass at actual OwlAPI sinks; arrays/values still matter; local byte/digest/ordered-tuple declarations; no blanket file ignore                                         |
| Repeated discovery/package-path logic and BOM acceptance weakened native contracts                                 | UO [`7ffb939`][uo-contracts] reused real source/package paths; [`aaadfc7`][uo-bom] rejected BOM and removed inert policy                           | Real installed public contract, JSONC/JSON5 rejection, malformed UTF-8/leading BOM failure, interior U+FEFF preserved, native byte-view offsets respected                               |
| npm 12 returned a keyed pack report rather than the expected old shape                                             | Producer [`5c44155`][jq-pack] fixed native pack reporting                                                                                          | Actual npm 12 clean-pack/transported probe; reject malformed reports; use native output rather than an ad hoc archive URL                                                               |
| Adapter flags and result counts drifted; logical omissions could hide behind expected failures                     | Producer [`91dd8b3`][jq-accounting]; UO [`e26988a`][uo-cli] delegated CLI limits                                                                   | Shared CLI flags/error envelope; inventory is not analysis; unknown JSONL coverage is null; missing/changed/duplicate logical member fails                                              |
| Broad NFC preservation hid unrelated changes                                                                       | Producer [`4d6a083`][jq-nfc] added exact value and JSONL-record pins                                                                               | Independently pinned decoded hash/length, missing/stale/non-string/duplicate-selector failures; keys and all unselected values remain checked                                           |
| A producer presentation exception accidentally inherited generic write permission                                  | Producer [`fcc3984`][jq-protection]; corresponding UO `0c2ab3aa2139979889b946d166021701e568943e` and WV `25076fdf97b599a82dd6505beddc1cc2015a03f5` | A sparse producer-format record alone prevents format/normalize writes while bad presentation still fails                                                                               |
| Consumer archives, extra provenance selectors and independently maintained installers duplicated acquisition rules | Producer [`899be5c`][jq-native]; UO `a25d4dc7920b217dbb1ecf7d949579476481c1da`; WV `25c518cc08c0df33d817fbae0625c99ade449ec8`                      | Native exact selector/lock; generated bootstrap; public isolation; no local/sibling fallback; extra/linked/traversal/tampered installed member fails                                    |
| Sanitized child and parent cache selection disagreed                                                               | Producer [`734f5e8`][jq-cache] resolved one native cache                                                                                           | Clean and custom-cache install/verification agree; offline/cache absence and tampering give truthful failures                                                                           |
| Native tar `ignoredEntry` events bypassed entry-only member/path/expanded-byte admission                           | Producer [`98b60e6`][jq-ignored] aborts and rejects ignored metadata; three complete payload regressions                                           | Select the repaired source; exercise Solaris ACL, SparseFile and oversized ExtendedHeader with otherwise valid installed payload; reject before acceptance and preserve installed bytes |
| Retired archive exceptions and independent workflow oracles became stale after the acquisition change              | UO `430cbe87a34ed9f1961d7910ae662b766c373e16`; WV `b3468a2a5f047ea28681960dc6ad3769a5f5cbb8`, `b002879a9b2e6cc9f329ee8cf150f80eb5567d86`           | No spent policy paths; new files receive defaults; gate deletion/skipping/failure breaks existing independent workflow assertions                                                       |
| Native Markdown validation caught later documentation repair needs                                                 | UO `486701dc22c597ac87533246bc6e419161c46bca`; WV `813ada156fb5ada08871a2710d2207193574f9ae`                                                       | Check the final actual plan/docs with the installed public Markdown contract; do not claim code tests validate prose/link structure                                                     |
| A packed-source change left rights facts stale and broke hosted governance                                         | OwlAPI [`238d1f3`][owlapi-rights-repair], later normally merged in PR 75                                                                           | Recompute actual current packlist/source bytes after the final packed changes; refresh native fact digests while preserving pending human review                                        |

The previous extraction's final review found the tar admission issue above and repaired it before delivery.
Prior reports, test totals and hosted green results belong to their exact earlier candidates.
They do not prove this plan or a future OwlAPI candidate.
External Claude review capacity was exhausted in that earlier work; do not invent an external review here or silently substitute another provider.
A later external final-candidate review requires actual separate approval and available capacity.

## Exact configuration proposal matrix

All rows are **pending owner approval**.
Values that depend on inventory decisions or a new qualified producer are explicitly conditional.
Files not listed for change are not implicitly authorized.
Reformatting an existing configuration file still changes that file and requires its exact approval.

| ID          | Exact file/setting                                                                                                                     | Smallest proposed change and source of authority                                                                          | Behavioral/pipeline impact and approval boundary                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CFG-001** | New `tooling/json/package.json`: private tooling identity, runtime/tool scripts, `devDependencies["@hadden-industries/json-quality"]`  | Isolated native graph with exact selected full Git SHA; current candidate `98b60e...`; shared public acquisition contract | Adds only developer tooling; final selector changes if a separately approved producer repair is required; do not add root runtime/development dependencies         |
| **CFG-002** | New `tooling/json/package-lock.json`                                                                                                   | Generate lock v3 with native npm for CFG-001; review exact source, graph and integrity                                    | Frozen reproducible install and installed-byte proof; no manual `resolved`/`integrity` editing; exact resulting graph needs review                                 |
| **CFG-003** | New `.json-quality.json`: schema/defaults/exceptions/limits                                                                            | Shared schema 1; no exclusions; narrow producer/write/preservation/npm-pointer entries from accepted inventory            | Complete checking and guarded writes; every exception must name real owner/reason; exact pins and budget values accepted before use                                |
| **CFG-004** | `package.json`: proposed JSON npm commands and canonical `lint`, `format`, `format:check`, `test:quality` composition                  | Delegate to thin shared adapters and isolated native tools; keep source/Python lanes separate                             | Adds mandatory canonical JSON/identity checks and safe formatting; preserve runtime engines, root 23-dependency policy, lifecycle permissions and production graph |
| **CFG-005** | `.prettierignore`: five JSON-family patterns stated above                                                                              | Transfer generic writer/presentation ownership to the shared JSON commands                                                | Editor/direct generic formatter no longer owns JSON; independent JSON discovery/checking proves no coverage loss; preserve all existing non-JSON exclusions        |
| **CFG-006** | New `eslint.json-identity.config.mjs`: shared plugin, scoped files, error rule, unused-disable reporting                               | Canonical-only configuration; actual source ownership inventory; native ESLint composition                                | Mandatory identity checking on supported JSON-tool runtimes; root `eslint.config.js` does not eagerly import the isolated graph                                    |
| **CFG-007** | `.github/workflows/ci.yml`: exact canonical Node 24/Windows setup and JSON-check steps; supported Node 26 tool probe if selected       | Shared script-free acquisition before consumers, existing job/aggregate authorities, checks after actual producers        | Blocking setup and checks; no `continue-on-error`, conditional bypass or new required-job inventory by inference; finalize exact step/lane choice first            |
| **CFG-008** | `.github/workflows/release.yml`: corresponding source/candidate checks                                                                 | Same accepted source/runtime boundary and existing release governance                                                     | Release qualification exercises adopted controls; no publication permission or disabled-gate change is implied                                                     |
| **CFG-009** | `docs/release/runtime-projections.json` and any governed workflow projection inputs                                                    | Only projections whose step paths/text actually change under CFG-007/008                                                  | Keep generated exact-runtime projections coherent; do not hand-edit runtime floors or introduce a second runtime authority                                         |
| **CFG-010** | `docs/provenance/rights-inventory.json`: current pack scope/fact digests; other mutable review inventories only if actual facts change | Existing native npm packlist and `scripts/review-facts.mjs` / `util/refresh-review-facts.mjs` authority                   | Preserves/reset pending attestations correctly; no invented human review or changed licence conclusion                                                             |
| **CFG-011** | Actual existing JSON config files among the 90 presentation findings, including root/tooling manifests and policies                    | Enumerate exact files and semantic-preserving before/after bytes after accepted contract classification                   | Do not approve a blanket formatter sweep. Package bytes can affect rights and native producer manifests even for presentation-only changes                         |
| **CFG-012** | HISEW project verification settings, if the accepted route requires them                                                               | Current native supported profile interface and exact commands only                                                        | Separate proposed change after native discovery; no environment-variable shim, guessed profile file or adoption of another execution                               |
| **CFG-013** | Producer public schema/API or selected source, only if DEC-005 proves the gap                                                          | Separately approved minimal producer change with existing-consumer conformance                                            | Requires producer-owned implementation/review/qualification and a newly approved consumer source; no parser/engine copy into OwlAPI                                |

Ordinary source changes predicted by these decisions include generated `scripts/install-json-quality.mjs`, `tooling/json/public-api.mjs`, thin `scripts/run-json-quality.mjs`, focused integration probes, identity-sink repairs, native evidence/producer adapter changes, and existing source/workflow/governance tests.
These are predictions, not an exhaustive authorization.
Confirm precise names against NAM-01 before implementation.
A consumer-facing name must describe its role; `inventory` must not silently perform a full analysis or mutation.

No root dependency/lock refresh, `.gitignore`, runtime-floor change, Markdown archive/lock refresh, conformance-source upgrade, release-consumer pin change, new release job, publication control, deployment setting or new third-party attribution is proposed by default.
If concrete evidence makes any such change necessary, add an exact row and obtain approval before editing.

## Quality scenarios and proof ownership

| Scenario                                | Stimulus and required observable response                                                                                                                                                                     | Oracle owner                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **QA-001 Coverage completeness**        | Add bad JSON as tracked, unstaged, hidden and Git-ignored owned peers, including one under a formerly ignored generated/history directory; every mandatory gate fails with exact path and complete accounting | Independent Git/filesystem/native-owner inventory plus consumer mutation expectations     |
| **QA-002 Strict outer JSON**            | Invalid syntax inside a string remains ordinary outer data; malformed outer JSON, escaped duplicate key, BOM and invalid UTF-8 fail. A fixture with strange text is never excluded wholesale                  | Shared native language/parser contract; independent input/expected diagnostics            |
| **QA-003 Atomic safe repair**           | A late bad peer, NFC key collision, symlink/replacement or protected producer target blocks the write batch; original bytes remain. Safe ordinary source formatting is idempotent                             | Shared writer plus byte snapshots and consumer-owned expected behavior                    |
| **QA-004 Exact preservation**           | Change/delete a pinned value or record selector, add an unselected non-NFC value/key, or mutate one protected byte; fail. Rechecked accepted original remains analyzed and unchanged                          | Independently pinned upstream/history/evidence authority                                  |
| **QA-005 Key/numeric interoperability** | Exercise empty/space/edge-space keys, exact npm pointer, noncharacters and safe/unsafe decimal/exponent integers; only the documented npm key is admitted                                                     | Native npm lock semantics and independently authored boundary vectors                     |
| **QA-006 Semantic identity**            | Recursively reorder an actual SBOM/governance/receipt object: same semantics accepted. Change a value or array order: rejected. Raw digest change: rejected where exact bytes are contracted                  | Existing domain tests and canonical encoding authority, not the implementation under test |
| **QA-007 Acquisition identity**         | Clean native install and transported package pass; floating/wrong source, custom-cache mismatch, stale bootstrap, extra/linked/tampered file, missing cache and unsafe tar metadata fail                      | Native npm source/lock/cache plus repaired public installation verifier                   |
| **QA-008 Native logical coverage**      | Omit/duplicate/change an expected evidence/archive/member or its owner reference; fail before a complete claim. Strict JSON failures in declared logical documents cannot hide behind a valid outer manifest  | Existing evidence/archive/container authority plus shared document analysis               |
| **QA-009 Capacity/error accounting**    | Exceed each relevant measured limit; fail before unbounded parsing and report incomplete/null counts. Explicit accepted capacity override changes resources only                                              | Shared schema/result validator and independently measured workload                        |
| **QA-010 Runtime separation**           | Node 22 source lint and source tests load their normal configuration without installed JSON tools; canonical 24/26 gates require them and enforce identity violations                                         | Actual npm commands/native ESLint and retained runtime qualification                      |
| **QA-011 CI and package governance**    | Delete/skip/fail/cancel JSON setup/check or omit required fresh output; independent workflow/release assertions fail. Packed-byte change invalidates exact rights scope until native refresh                  | Existing workflow/governance tests, packlist and release generators                       |
| **QA-012 Evidence and attestations**    | Formatting/reordered semantic facts preserve the intended semantic identity; changed facts clear the prior review; raw history/blob/chain mutation fails                                                      | `canonical-json`, `review-facts`, native evidence/chain verifiers                         |

Mocks stop at genuine external acquisition/network/process boundaries.
Do not mock the shared parser, npm lock semantics, native schema validator, archive reader or actual ESLint configuration in the test that claims those contracts work.
A real script-free clean install and transported package test must complement deterministic fault fixtures.
A test expected value must not be computed by the same repair/digest implementation it is testing.

Initial shared limits are 50,000 JSON-family files, 32 MiB per document, 256 MiB cumulative physical/logical bytes, 100,000 logical documents, 100,000 JSONL records per file, 10,000 diagnostics, 1 MiB policy, 16 MiB Git output, 64 MiB tool output and 60 seconds native-tool time. The file limit counts admitted JSON-family paths; it is not a bound on all non-JSON filesystem traversal. Measure traversal/time/memory and logical-byte duplication on the accepted inventory. Identity analysis separately defaults to 64 frames and 100,000 steps. Do not copy UO's 512 MiB override or disable limits to obtain a green run. Positive safe-integer overrides or explicit capacity bypass are producer-supported, but an exact approval and measured reason are needed here; they never weaken quality/identity rules.

## Vertical implementation slices and commit points

The assigned integration agent owns the combined candidate and all coupling decisions.
Domain owners retain fixture/evidence/generator meaning.
Read-only source/contract discovery and independently scoped probe preparation can run in parallel if authorized.
Policy writes, producer API changes, lock generation, migrations and workflow integration are sequential where they share an acceptance boundary.

| Slice                                                                 | Complete observable increment and likely files                                                                                                        | Traceability and falsifiable proof                                                                                                                           | Commit/release/cleanup implication                                                                                                                                                                 |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SLICE-000 Accept and preserve the baseline**                        | Recheck Git/HISEW/ownership, exact plan revision, configuration matrix and DEC dispositions; resolve local documentation commit treatment             | REQ-010 / AC-010 / DEC-001,002,010; accepted snapshot and retained pre-migration byte identities                                                             | **First authorized implementation checkpoint commits the accepted plan.** No implementation before it; no push implied                                                                             |
| **SLICE-001 Demonstrate isolated public acquisition**                 | New isolated manifest/native lock, generated installer and public bridge; one real public CLI/document/plugin path                                    | REQ-006,007 / AC-006,007 / QA-007,010 / DEC-003,006; clean/transported/cache/tamper and Node isolation evidence                                              | Commit coherent tooling addition only after exact config approval; production engines/graph and Markdown graph remain outside this change; remove owned install scratch after evidence is retained |
| **SLICE-002 Account for one complete owned evidence path**            | Native evidence/physical/logical reconciliation and one member per actual storage class; conditional producer extension only after DEC-005 experiment | REQ-001,002,008,009 / AC-001,002,008,009 / QA-001,002,008,009; missing/changed logical member fails, successful member included in truthful counts           | Separate producer delivery if required; do not activate an incomplete full-coverage claim or manufacture containers; preserve failure artifacts                                                    |
| **SLICE-003 Check and protect one real generator/history path**       | Sparse policy, actual generator format, W3C value pins and npm pointer cases; then expand through all classified owned paths                          | REQ-001,003,004,008 / AC-001,003,004,008 / QA-003,004,005,012 / DEC-004,007; bad peer blocks repair, exact history and fixture semantics preserved           | Commit approved policy and owning producer repairs together. No bulk evidence rewrite. Outstanding foreign/immutable conflicts remain blockers, not skipped files                                  |
| **SLICE-004 Migrate ordinary sources and enforce semantic identity**  | Approved presentation-only paths, shared format ownership, canonical-only ESLint config, focused actual identity-sink repairs                         | REQ-002,003,005,007 / AC-002,003,005,007 / QA-003,005,006,010; actual reordered-provider case plus changed-value/ordered-array negatives, format idempotence | Consolidate migration and narrow source repairs; refresh native rights facts only for actual changed packed bytes; retain pending review states                                                    |
| **SLICE-005 Make the complete gate mandatory**                        | Exact npm/CI/release setup, after-producer checks, independent workflow/source-policy oracles, runtime projections and contributor documentation      | REQ-001,006,007,008,009 / AC-001,006,007,008,009 / QA-001,007,008,010,011; failed/missing/skipped gate blocks aggregation and producer output absence fails  | One coherent integration checkpoint; preserve closed job/publication contracts. Verify both canonical platforms and supported tool/runtime boundaries                                              |
| **SLICE-006 Freeze, review, qualify and prepare authorized delivery** | Final candidate and owned evidence/recovery package; no additional feature scope                                                                      | All accepted ACs; final native profiles, package/domain/CI evidence, substantive independent correctness and scoped native security reports                  | Consolidate before broad review; review repair deltas narrowly; external review only for approved final candidate. Commit/push/PR/merge/release remain separately authorized actions               |

Each checkpoint should explain the outcome and proof, not accumulate two-minute implementation steps.
Before broad review, settle planned generators, configuration, migrations and native rights refreshes so the reviewer sees a coherent candidate.
An unsuccessful preserved-byte decision or unresolved foreign-tool conflict prevents SLICE-005 activation; it is not a reason to weaken the check.

## Verification, rollout, recovery and remaining decisions

### Verification cadence

During implementation, use focused shared/consumer probes at changed seams and existing affected tests. Appropriate existing obligations include `scripts/source-policy.test.js`, `scripts/development-dependency-policy.test.js`, `scripts/canonical-json.test.js`, native evidence/archive tests, SBOM tests, workflow governance tests, `governance.test.js`, package-boundary tests and the conformance tests for any touched producer.
Choose the exact set from actual changes; do not run an entire suite after every policy edit.

After all planned input writers and approved checkpoints settle, run the accepted native HISEW route's final relevant verification once.
Reuse valid evidence whose measured inputs are unchanged; rerun when a repair changes the assurance inputs.
Existing hosted full qualification, browser/package/OWL contract/Java obligations remain mandatory wherever current repository policy requires them. Do not substitute a focused Jest pass for installed-consumer, hosted or native workflow evidence. Inspect lifecycle effects before invoking candidate/build/producer commands: several create or install artifacts, and the planning authorization did not permit those actions.

The final candidate receives substantive broad internal correctness/principles review and a scoped native Codex Security workflow because acquisition, parsing, links/archive members and writes are affected.
Let the native security workflow own its bounded internal work.
Triage real findings and preserve its native evidence.
Follow-up review is limited to repair deltas and their consequences unless a material discovery invalidates the candidate.
Use an external reviewer only after separate approval for the final candidate; do not repeatedly consume external review during development or invent a report when capacity is unavailable.

Operational evidence should answer: how many physical documents, logical/evidence members and JSONL records were required and checked; how many diagnostics were expected versus unexpected; which exact value/byte contracts applied; what output was missing; whether capacity or IO prevented completeness; and which paths were written or protected.
Logs need paths, source coordinates and diagnostic identities, not arbitrary source-map/source text, secrets or whole captured environment documents.
Evidence is stored in a newly allocated owner-bound location under the current native storage contract; do not write into another task's preserved group.

### Activation and recovery

Activation requires zero unexplained missing coverage, no unapproved exclusion, no unresolved mandatory diagnostic, qualified exact installed bytes, successful native owner checks, coherent workflow gates and all accepted final evidence.
A report that merely counts 173 tracked files is insufficient.
A report that checks every file but silently accepts arbitrary legacy failures is also insufficient.

Before any approved data repair, retain exact original bytes/hashes and a manifest of the precise owned changes. Ordinary source formatting can be reversed by an explicit inverse edit or a later approved revert; never use destructive Git restoration on user changes. An exact historical blob, package archive or journal is preserved, not reformatted and then "rolled back" by changing its recorded digest. If a producer needs repair, regenerate through that producer into an isolated candidate and validate semantics before publication/replacement.
Interrupted work resumes from the recorded candidate and completed evidence, after rechecking ownership and input identities.

Before activation, abort by withholding the candidate and removing only task-created scratch once its consumers finish.
After activation, restrict an unsafe writer and make an accountable forward fix.
Do not restore an obsolete engine or rewrite a released artifact without a new qualified recovery decision.
Hosted merge, registry publication, release-tag creation, deployment and downstream adoption are separate states and are not outcomes promised by this plan.

### Decisions before the affected slice

| Decision                                        | Proposed disposition and unresolved boundary                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **DEC-001 Starting revision**                   | Preserve local `7d7d29b` and remote `957deb3` accurately; owner selects base/delivery treatment before implementation. No inferred reset/rebase/push                                                                                                                                                                                                                           |
| **DEC-002 Risk, acceptance and authority**      | Accept R2, exact draft terms and first plan-commit checkpoint; approve configuration and implementation separately from later publication                                                                                                                                                                                                                                      |
| **DEC-003 Exact shared package**                | Use repaired `98b60e...` as the current reviewed source candidate; recheck freshness and exact terms before adoption. A required producer extension gets a new qualified identity, not a fake stable-version claim                                                                                                                                                             |
| **DEC-004 Exact value/byte/negative contracts** | Review the ten W3C values, three values in `source-map-js` evidence envelopes, six logical JSON-LD cases, npm pointers, native producer formats and any truly immutable presentation. No broad NFC preservation or historical expected-failure ledger                                                                                                                          |
| **DEC-005 Native evidence/logical integration** | Complete the bounded native-owner/public-buffer experiment. Approve a producer contract extension only if mandatory coverage cannot otherwise be expressed without duplicated authority                                                                                                                                                                                        |
| **DEC-006 Tool/runtime boundary**               | Canonical-only identity configuration and isolated JSON graph; retain Node 22 product/source lanes; choose exact supported Node 26 tool proof and CI step placement                                                                                                                                                                                                            |
| **DEC-007 No-exclusion conflict resolution**    | No exclusion currently approved. Root dependency syntax/number/NFC findings, Markdown notice duplicate keys, retained archives, Git state and a development junction remain explicit conflicts. Establish provenance and exact responsibility; external fixtures alone are eligible for an exclusion proposal. Renaming other state "external" does not satisfy this condition |
| **DEC-008 Resource budgets**                    | Measure accepted physical/logical/archive workload and finalize necessary positive limits; no copied unlimited/512 MiB setting or quality-rule bypass                                                                                                                                                                                                                          |
| **DEC-009 Rights and governance**               | Retain existing current and historical identities, native packlist/fact authorities and pending human reviews. Determine actual development-graph obligations without invented UO attribution or legal clearance                                                                                                                                                               |
| **DEC-010 Final review and delivery scope**     | Confirm substantive internal/native-security route, any approved external final review and exact commit/push/PR/merge authority when requested; existing prior reports do not substitute                                                                                                                                                                                       |

Replan if the owner changes the all-JSON mandate; a proposed external-fixture boundary cannot be proved; the accepted logical inventory cannot be represented by supported contracts; protected history has a newly discovered semantic failure; a producer change affects current consumers; the exact package/tool version changes; a native schema/digest/runtime/publication contract must change; required capacity is materially larger than measured; or another actor changes the working tree or its authority.
Preserve the evidence and identify the smallest decision needed instead of widening an exception or repeatedly rerunning an unchanged failure.

## Planning evidence record

Read-only work comprised instruction/method/memory lookup; `git status`, logs, source diffs and exact identities; remote `ls-remote`/`gh pr view`; manifests, schemas, governance, workflows, generators and native ownership readers; filesystem/Git counts; shared public document/record analysis; bounded extensionless evidence and non-extracting archive inventories; in-memory public-contract probes; and `npm pack --dry-run --json --ignore-scripts`. The latter returned native npm 12's keyed report and 195 files without producing a retained tarball. No repository test suite, install, code/JSON formatter or normalizer, build, security scan or implementation review was run as planning work.
Selected native Markdown checking and any formatting repair apply only to this requested plan.

In-memory public probes confirmed that malformed JSON text inside a string is not malformed outer JSON; outer trailing comma and escaped duplicate names fail; a decomposed key fails NFC; exact `/packages/` permits the npm root while an additional empty root key still fails; and tracked files are retained when an external exclusion would otherwise match.
These are planning experiments against the current public implementation, not qualification of a nonexistent OwlAPI integration.

The sole intended write in this task is this plan.
Before final handoff, inspect the working-tree diff and check this document with the already installed native Markdown tool where available.
A missing or rejected optional probe remains a stated proof gap; it never becomes successful evidence.

[owlapi-governance]: https://github.com/Hadden-Industries/owlapi/blob/957deb38362b0ab55ed809f9722fcbf44eaec2ae/docs/governance.md
[owlapi-package]: https://github.com/Hadden-Industries/owlapi/blob/957deb38362b0ab55ed809f9722fcbf44eaec2ae/package.json
[owlapi-semantic]: https://github.com/Hadden-Industries/owlapi/blob/957deb38362b0ab55ed809f9722fcbf44eaec2ae/docs/provenance/semantic-json-identity.md
[owlapi-rights]: https://github.com/Hadden-Industries/owlapi/blob/957deb38362b0ab55ed809f9722fcbf44eaec2ae/docs/provenance/rights-inventory.json
[owlapi-ci]: https://github.com/Hadden-Industries/owlapi/blob/957deb38362b0ab55ed809f9722fcbf44eaec2ae/.github/workflows/ci.yml
[owlapi-rights-repair]: https://github.com/Hadden-Industries/owlapi/commit/238d1f358210d103d2c92a1b9fd8e3d57a3d6ac2
[jq-pr]: https://github.com/Hadden-Industries/json-quality/pull/1
[jq-guide]: https://github.com/Hadden-Industries/json-quality/blob/98b60e6522ceed6b6fdfcd3153c8ceb76d027a81/docs/consumer-guide.md
[jq-public]: https://github.com/Hadden-Industries/json-quality/blob/98b60e6522ceed6b6fdfcd3153c8ceb76d027a81/src/index.js
[jq-configuration]: https://github.com/Hadden-Industries/json-quality/blob/98b60e6522ceed6b6fdfcd3153c8ceb76d027a81/schemas/configuration.schema.json
[jq-installation]: https://github.com/Hadden-Industries/json-quality/blob/98b60e6522ceed6b6fdfcd3153c8ceb76d027a81/src/installation.js
[uo-pr]: https://github.com/Hadden-Industries/universal-ontology/pull/144
[uo-adapter]: https://github.com/Hadden-Industries/universal-ontology/blob/41f7aa0fd6825701f33853295e79203cf7dde150/scripts/runRepositoryJsonQuality.js
[uo-policy]: https://github.com/Hadden-Industries/universal-ontology/blob/41f7aa0fd6825701f33853295e79203cf7dde150/.json-quality.json
[uo-controls]: https://github.com/Hadden-Industries/universal-ontology/blob/41f7aa0fd6825701f33853295e79203cf7dde150/package.json
[wv-pr]: https://github.com/Hadden-Industries/webvowl/pull/79
[wv-adapter]: https://github.com/Hadden-Industries/webvowl/blob/e93411027549dc292d7e324f25107ecf174d4441/util/runRepositoryJsonQuality.mjs
[wv-policy]: https://github.com/Hadden-Industries/webvowl/blob/e93411027549dc292d7e324f25107ecf174d4441/.json-quality.json
[wv-controls]: https://github.com/Hadden-Industries/webvowl/blob/e93411027549dc292d7e324f25107ecf174d4441/package.json
[shared-plan]: https://github.com/Hadden-Industries/universal-ontology/blob/41f7aa0fd6825701f33853295e79203cf7dde150/docs/plans/2026-10-13-shared-json-quality-engine-extraction-and-adoption.md
[uo-dry]: https://github.com/Hadden-Industries/universal-ontology/commit/23aa1979e85c970018cc28aa2ffe24619b72f468
[uo-defaults]: https://github.com/Hadden-Industries/universal-ontology/commit/10035299329c2ca547284878f59f5ba8456ef8f9
[uo-nfc]: https://github.com/Hadden-Industries/universal-ontology/commit/bcf08947a2894823cc2e08e293a4f7188ecb41cb
[uo-numbers]: https://github.com/Hadden-Industries/universal-ontology/commit/baca599e8cbab6537a6e99915d2762973a3ab985
[uo-identity]: https://github.com/Hadden-Industries/universal-ontology/commit/12de332bce19033cf07b61747ee3e0df47f8db75
[uo-guard]: https://github.com/Hadden-Industries/universal-ontology/commit/bebe34f30c860826bfa99b677540d1649b4d8932
[uo-contracts]: https://github.com/Hadden-Industries/universal-ontology/commit/7ffb939c32c37c23cf4575649be76270229f4678
[uo-bom]: https://github.com/Hadden-Industries/universal-ontology/commit/aaadfc7c278902aae670667eba321da0c5a3eb55
[uo-cli]: https://github.com/Hadden-Industries/universal-ontology/commit/e26988a8e40fd66fd2428b575ca88e0004119e68
[jq-pack]: https://github.com/Hadden-Industries/json-quality/commit/5c44155457c7a9cd61b1fba2a92fe8f3143bbcaf
[jq-accounting]: https://github.com/Hadden-Industries/json-quality/commit/91dd8b351b5b8110e2285316185be6746a9a9fb9
[jq-nfc]: https://github.com/Hadden-Industries/json-quality/commit/4d6a083f47c6dfed0df43b2e1b1f2a16f167c8cb
[jq-protection]: https://github.com/Hadden-Industries/json-quality/commit/fcc3984e5eb3eef6834fc63515a8b5eeff975f80
[jq-native]: https://github.com/Hadden-Industries/json-quality/commit/899be5c7ca51fb96d0c793ed1874700847b557ec
[jq-cache]: https://github.com/Hadden-Industries/json-quality/commit/734f5e8eca15fb2a7e3b2f7d5b625a318444c048
[jq-ignored]: https://github.com/Hadden-Industries/json-quality/commit/98b60e6522ceed6b6fdfcd3153c8ceb76d027a81
