# Phase 19D Pre-Registry Consumer Decoupling Implementation Plan

> **Status:** Ready for implementation after approval of this plan.<br>
> **Execution:** Implement inline and test-first, without subagents. Treat configuration approval, formal review, commit, and push as distinct gates.<br>
> **Cross-repository design:** [`Hadden-Industries/webvowl` design commit `1da5a564`](https://github.com/Hadden-Industries/webvowl/blob/1da5a5646779eb414ee58f79ffc9cad38ff32244/docs/specs/2026-08-31-pre-registry-owlapi-webvowl-decoupling-design.md).<br>
> **Consumer plan:** [`Hadden-Industries/webvowl/docs/plans/owlapi-pre-registry-consumer-cutover.md`](https://github.com/Hadden-Industries/webvowl/blob/main/docs/plans/owlapi-pre-registry-consumer-cutover.md).<br>
> **Goal:** Amend the canonical release contract so npm namespace delay no longer blocks independent WebVOWL development, prove that installing the exact package-source Git commit produces the same package tree as the retained qualified alpha tarball, and preserve public registry publication as the final Phase 19D completion gate.

## Fixed decisions

- Phase 19D has two ordered states under the existing checkpoint and requirement topology:
  - **19D1:** maintained WebVOWL consumes exact full-SHA Git-installed `owlapi`, contains no package source copy, and passes clean consumer checks;
  - **19D2:** after public-alpha verification, WebVOWL replaces that transport with exact registry `owlapi@0.1.0-alpha.0` plus registry URL/SRI and removes every Git allowance.
- The only provisional Git coordinate is `git+https://github.com/Hadden-Industries/owlapi.git#caabb1197ffdab91c1e10d596d177b5142aea5c1`.
- The retained candidate is the exact candidate artifact selected by `docs/release/publication-control.json`, not a newly packed approximation or an arbitrary local `.release` directory.
- A Git install supplies provisional source-commit evidence only. It does not supply registry SRI, registry signature, npm provenance, publication attestation, distribution-tag, or immutable public-coordinate evidence.
- Existing Phase 19 requirement IDs, checkpoint enum, ownership, applicability, failure semantics, and child-gate topology remain unchanged. Only approved normalized requirement/checklist wording and derived digests move.
- Historical gate-result records remain bound to their former registry/catalogue/checklist hashes. Do not rewrite them as if they evaluated the amended wording.
- No release workflow, publication authority, package source, exports, runtime dependency, or package version changes in this checkpoint.

## Exact configuration approval gate

Before implementing configuration changes, request one exact batch:

1. `package.json`: add only `"qualify:git-package-equivalence": "node scripts/qualify-git-package-equivalence.mjs"`. This gives the qualification command the repository-authoritative npm CLI through `npm_execpath`; it changes no runtime export, dependency, version, or executable package behavior. Because `package.json` is itself packed metadata, a hypothetical new pack from the later tooling commit would contain this script entry; the gate therefore compares only the immutable retained candidate with the immutable package-source Git commit and never represents a current-`main` repack as the retained alpha.
2. `docs/release/gates.json`: regenerate only the `requirementDigest` values for amended catalogue requirements and `rowDigest` values for amended derived checklist rows. Add/remove no requirement, checkpoint, owner, kind, applicability rule, dependency, or failure state.

The command is local/release-control configuration. The gate registry is generated release configuration. The approved review-remediation batch also extends the newly introduced equivalence evidence with measured artifact-archive and accepted npm-configuration facts, and reuses the release-artifact module for strict ZIP parsing; it does not alter an established release schema or gate topology. Stop if implementation requires any workflow, established-schema topology, lockfile, dependency, or other configuration change.

## File map

**Create**

- `scripts/git-package-equivalence.mjs` — pure manifest/tree/lock/graph normalization and comparison functions.
- `scripts/git-package-equivalence.test.js` — independent fixtures for every comparison and rejection rule.
- `scripts/qualify-git-package-equivalence.mjs` — bounded normal-install orchestration for retained tarball and exact Git consumers.
- `scripts/qualify-git-package-equivalence.test.js` — argument, source-identity, cleanup, and fail-closed orchestration tests using injected local fixtures/runners rather than GitHub.
- `docs/release/pre-registry-git-equivalence.schema.json` — closed Draft 2020-12 evidence schema.
- `docs/release/pre-registry-git-equivalence.json` — reviewed Phase 19D1 package-equivalence observation.

**Modify**

- `docs/implementation-plan.md`
- approved `package.json`
- generated `docs/release/gates.json`
- `docs/provenance/rights-inventory.json` — refresh only the packed-source manifest digest, its review facts digest, and review date after the approved command changes the packed `package.json` bytes; retain the 72-file scope, classifications, external-dependency binding, reviewer capacity, and conclusion.
- `governance.test.js` — validate the new evidence schema/document and its binding to `publication-control.json` and the package manifest.
- `scripts/release-artifacts.mjs`, `scripts/release-artifacts.test.js` — add and test strict in-memory ZIP reading so qualification consumes bytes from the original GitHub artifact archive.

No package source, export, workflow, lockfile, runtime dependency, licence classification, or third-party-material fact is modified. The existing rights inventory changes only because its exact source-byte manifest includes the packed `package.json`; carrying the old reviewed digest across the approved script addition would misstate the current packable tree.

## Required interfaces

```js
export const GIT_BUILD_TRIGGER_SCRIPTS;

export function assertGitInstallSuitability(manifest, expected);

export function createInstalledPackageTreeManifest(packageRoot);
// -> { entries: [{ path, type, mode, bytes, sha256 }], fileCount, rootSha256 }

export function compareInstalledPackageTrees(left, right);
// -> { equal, differences }

export function normalizeProductionGraph(npmLsOutput);

export function validateGitConsumerLock(lockfile, expected);

export function createPreRegistryEquivalenceEvidence(observation);

export function readZipArchiveFiles(archive);

export function verifyCandidateArtifactArchive({ archive, expectedDigest });

export function parseNpmConfigGetOutput(output);

export function validateEffectiveNpmConfiguration(effective, paths);
```

`mode` is the portable npm payload mode class (`regular` or `executable`) derived from file type and execute bits; platform-specific ownership/ACL data is not package content. Reject symlinks, junctions, special files, duplicate normalized paths, path escape, case collisions, and unreadable entries. Compare every file below `node_modules/owlapi`; exclude nothing unless a failing real observation identifies npm-owned metadata and a separate reviewed plan amendment names it.

## Task 1: Amend the canonical Phase 19 contract

**File:** `docs/implementation-plan.md`

Amend all authoritative and derived locations together:

- top-level canonical-repository, checkpointing, terminal-purpose, and WebVOWL-consumer decisions;
- §2.10.3 canonical repository and consumer boundary;
- §2.69 maintained non-production cutover;
- §17.26.0 checkpoint sequence;
- §17.26.4 post-publication verification and WebVOWL cutover;
- §17.26.5 `P19-WEBVOWL-001` and `P19-CHECKPOINT-001`;
- the text immediately following the Phase 19 catalogue that currently makes the whole phase externally blocked;
- §17.27 Phase 20 starting condition;
- §21.2.1 external-package boundary;
- derived Phase 19 checklist rows `P19-CHECK-014`, `P19-CHECK-015`, and `P19-CHECK-025`, plus any summary/diagram prose that states registry consumption is the only maintained pre-publication state.

- [ ] State that 19D1 unblocks repository development but is neither public-alpha evidence nor Phase 19 completion.
- [ ] Require the exact Git coordinate, installed-tree equivalence, no source copy, public entry points, dependency cleanup, clean clone, Jest/build/browser checks, review, and a pushed WebVOWL checkpoint.
- [ ] State that 19D2 replaces rather than supplements the Git transport and retains every existing registry/publication gate.
- [ ] Keep the catalogue/checklist counts and stable IDs unchanged.
- [ ] Search the entire plan for contradictory `no Git dependency before publication` or `whole phase EXTERNAL_BLOCKED` claims and reconcile each live statement.

Do not generate digests until the final prose is stable.

## Task 2: Build the portable installed-tree comparison core

**Files:** `scripts/git-package-equivalence.mjs`, `scripts/git-package-equivalence.test.js`

- [ ] Write RED fixtures proving deterministic POSIX path ordering, byte hashing, root hashing, portable mode classification, and equality independent of host enumeration order.
- [ ] Prove one changed path, byte, mode, file type, case spelling, duplicate, symlink, and special file each fail with a bounded diagnostic.
- [ ] Prove the exact package manifest accepts name `owlapi`, version `0.1.0-alpha.0`, the five-entry exports map, absent `workspaces`, and absent Git-build triggers, including npm's `build` Git-preparation trigger.
- [ ] Reject any added/mutated export, wrong identity, lifecycle trigger, workspace, bundled dependency, or unexpected package root.
- [ ] Normalize `npm ls --omit=dev --all --json` into package identities plus dependency edges, excluding only source-location strings that necessarily differ between tarball and Git roots.
- [ ] Validate lockfile v3 and require the Git consumer's root specifier and `node_modules/owlapi.resolved` to name the exact repository/full commit.
- [ ] Run `npm test -- scripts/git-package-equivalence.test.js --runInBand` for RED, implement the smallest functions, then rerun GREEN.

## Task 3: Implement bounded two-consumer qualification

**Files:** `scripts/qualify-git-package-equivalence.mjs`, `scripts/qualify-git-package-equivalence.test.js`

The named command accepts:

```text
--artifact-archive <original-actions-artifact.zip>
--git-spec git+https://github.com/Hadden-Industries/owlapi.git#<40-hex-commit>
--output <new-empty-output-directory>
```

- [ ] Require execution through the approved npm script and use `npm_execpath`; do not call a host-global npm shim.
- [ ] Hash the original GitHub artifact ZIP and require its SHA-256 to equal the controlled artifact digest before reading any entry. Parse the ZIP fail-closed, require the exact closed three-file bundle, and derive the verified tarball bytes directly from those archive entries.
- [ ] Read the selected commit's `package.json` through local Git object inspection before network installation and run the suitability assertion.
- [ ] Create one unique OS-temporary root with separate tarball/Git consumers and separate npm caches. Verify every cleanup target is a strict temporary descendant.
- [ ] Generate empty user/global npmrc files inside the validated temporary root, remove ambient `npm_config_*`, `npm_package_*`, npm-token, and `NODE_ENV` variables, then explicitly pin ordinary install semantics (`ignore-scripts=false`, `strict-allow-scripts=false`, lockfile enabled, hoisted strategy, and all dependency classes included).
- [ ] Query npm's accepted effective safe configuration under those same files and arguments, reject any discrepancy before either install, and record the accepted policy in canonical evidence. Lifecycle scripts remain enabled because ordinary Git-install behavior is part of the proof.
- [ ] Run the four existing installed-package scripts against both consumers: smoke, boundary, import purity, and no network.
- [ ] Compare complete installed package-tree manifests and normalized production graphs; require no differences.
- [ ] Validate the Git lock, exact package identity/exports, and absence of package-development files such as `.git`, `.github`, tests, fixtures, and release tooling.
- [ ] Write stable JSON manifests, command/runtime facts, stdout/stderr logs, and `qualification.json` under the requested output. Omit absolute temporary paths from canonical digests.
- [ ] Clean only the validated temporary root in `finally`; preserve output on success and diagnostic failure.
- [ ] Unit-test malformed arguments, occupied output, wrong artifact-archive digest, unsafe/duplicate ZIP entries, ambient npm configuration, rejected effective npm settings, source-manifest mismatch, runner failure, partial install, tree/graph mismatch, unsafe cleanup target, and successful deterministic evidence assembly without network.

## Task 4: Acquire the canonical candidate and run the real equivalence gate

- [ ] Download and retain the original ZIP for the exact candidate artifact identified by `docs/release/publication-control.json` from source run `33160042447`, attempt `1`, artifact ID `9682090118`. Do not extract or repackage it before qualification.
- [ ] Let the qualification command measure the ZIP byte count, require digest `sha256:f5967321e1c18a9c5aa14ad44a1d45fe3606605453866ce7746afe9c394f52d7`, validate the enclosed three-file bundle, and materialize only the verified enclosed tarball for the candidate consumer.
- [ ] Run:

```powershell
npm run qualify:git-package-equivalence -- --artifact-archive <original-actions-artifact.zip> --git-spec git+https://github.com/Hadden-Industries/owlapi.git#caabb1197ffdab91c1e10d596d177b5142aea5c1 --output .release/git-package-equivalence/0.1.0-alpha.0
```

- [ ] Inspect both manifests, lockfiles, package identities, production graphs, public-contract results, and the zero-difference conclusion.
- [ ] Stop on any difference. Do not weaken the comparator, repack from current `main`, or proceed to WebVOWL merely because individual smoke tests pass.

## Task 5: Persist bounded reviewed equivalence evidence

**Files:** evidence schema/document and `governance.test.js`

- [ ] Define a closed schema covering source run/artifact byte count/digest, candidate tarball SHA-256, Git URL/full commit/tag, package identity/exports, Node/npm/platform, generated npm configuration and accepted effective install policy, installed-tree root/file count/equality, production-graph digest/equality, exact installed tests, qualification result, and human review.
- [ ] Generate the evidence document from `qualification.json`; copy no absolute paths, npm cache data, installed tree, or tarball into Git.
- [ ] Bind candidate artifact fields exactly to `publication-control.json`, package name/version/exports to `package.json`, and commit to the signed tag target.
- [ ] Make governance tests recompute the document's deterministic digests from retained canonical fields and reject a PASS with differences, missing checks, or pending review.
- [ ] Present the exact evidence contents for human review before marking review accepted.

## Task 6: Regenerate wording digests without topology drift

After Task 1 prose and Task 5 evidence are final, apply the approved generated-config change:

```powershell
npm run generate:release-gates
npm run verify:release-gates
npm test -- scripts/verify-release-gates.test.js --runInBand
```

- [ ] Inspect every `docs/release/gates.json` change. Only requirement/checklist wording digests affected by the amendment may move.
- [ ] Require catalogue requirement count, checklist row count, stable IDs, coverage, checkpoint assignments, owners, kinds, dependencies, applicability, and failure semantics to remain identical.
- [ ] Do not update an old gate-result record. A future result will bind the amended `gateRegistrySha256`, `catalogueSha256`, `checklistCoverageSha256`, and per-requirement digest.

## Task 7: Verify, formally review, and checkpoint

```powershell
npm test -- scripts/git-package-equivalence.test.js scripts/qualify-git-package-equivalence.test.js scripts/release-artifacts.test.js scripts/verify-release-gates.test.js --runInBand
npm run test:boundary
npm test -- --runInBand
npm run lint
npm run format:check
npm run verify:release-gates
```

- [ ] Re-run the real equivalence command after formatting and require the same canonical root digest.
- [ ] Confirm `npm pack --dry-run --json` retains the approved file inventory, exports, runtime dependencies and package version; record the expected repository-tooling script metadata delta rather than claiming that a newly packed current-`main` manifest is byte-identical to the retained alpha.
- [ ] Confirm the diff contains only the canonical plan amendment, equivalence tooling/tests/evidence, governance binding, exact named npm command, and generated wording digests.
- [ ] State `Implementation complete; /review pending` and request built-in `/review` for the complete standalone-repository diff, focusing on candidate identity, Git-install lifecycle behavior, cross-platform tree semantics, fail-closed comparison, evidence binding, and gate-topology stability.
- [ ] Resolve or explicitly defer every confirmed P0–P2 finding.
- [ ] After explicit authorization, use `committing-to-git` for one signed Phase 19D pre-registry/equivalence checkpoint. Push only after separate authorization.
- [ ] Give the accepted evidence/commit to the WebVOWL implementation. Do not mark `P19-WEBVOWL-001`, Phase 19D, or Phase 19 complete until the later registry-backed state passes.
