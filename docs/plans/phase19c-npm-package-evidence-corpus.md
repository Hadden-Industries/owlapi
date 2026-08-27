# Phase 19C npm Package Evidence Corpus Implementation Plan

> **For agentic workers:** REQUIRED EXECUTION MODE: implement this plan inline,
> test-first, without subagents. Do not change repository configuration until the
> exact file and setting have received the approval required by `AGENTS.md`.

**Goal:** Replace host-dependent `node_modules` licence inspection with a
platform-independent, authenticated, content-addressed evidence corpus for every
unique npm registry tarball selected by `package-lock.json`.

**Architecture:** The lockfile is normalized into occurrence and unique-artifact
records. A networked acquisition command authenticates each public npm tarball,
securely inventories it without host-path extraction, runs pinned ScanCode, and
retains only canonical evidence blobs. Exactly 32 deterministic acquisition
shards are independently verifiable and fail-closed merged into the canonical
corpus; the initial manual Ubuntu/Windows run additionally proves cross-platform
manifest and root parity. Offline validators reproduce corpus digests and feed a
v2 human-reviewed third-party-material conclusion layer.

**Tech Stack:** Native ESM JavaScript; Node.js `crypto`, `fs`, `path`, `stream`,
`url` and `child_process`; exact `pacote@22.0.0`; exact `tar@7.5.22`; AJV Draft
2020-12; Jest; ScanCode Toolkit `32.5.0` official release archives.

**Spec:** `docs/implementation-plan.md` §2.50 and §2.50.1.

## Global constraints

- Accept only exact public-registry packages resolved beneath
  `https://registry.npmjs.org/`; reject Git, file, directory, arbitrary-remote and
  private-registry inputs.
- Never install, import or execute acquired package contents.
- Require exact lockfile SRI, independently calculated SRI/SHA-256, exact
  archive-package identity and a valid npm registry signature.
- Treat absent npm provenance as `NOT_PUBLISHED`; fail on present invalid or
  identity-mismatched provenance.
- Never extract an untrusted archive to host-selected paths.
- Commit no full package tarball, npm cache, ScanCode distribution or raw
  ScanCode report.
- Use canonical JSON, code-unit ordering, POSIX archive paths and lowercase
  content digests so Windows and Ubuntu produce identical evidence.
- Preserve the existing human conclusions where the new evidence does not
  contradict them; return any changed fact set to `PENDING_HUMAN_REVIEW`.
- Preserve every pre-existing working-tree edit and replace the interim
  optional-package metadata-only workaround only through targeted edits.

## File map

### New deterministic core

- `util/third-party-evidence/digests.mjs` — stable JSON, SHA-256, SRI and corpus
  Merkle-root primitives.
- `util/third-party-evidence/lock-graph.mjs` — strict lockfile-v3 public-registry
  occurrence/artifact normalization.
- `util/third-party-evidence/archive-evidence.mjs` — secure tar inventory and
  recursive legal-evidence selection without filesystem extraction.
- `util/third-party-evidence/blob-store.mjs` — content-addressed blob writes and
  offline byte/digest verification.
- `util/third-party-evidence/registry-signatures.mjs` — npm public-key parsing and
  offline ECDSA signature replay.
- `util/third-party-evidence/scancode.mjs` — pinned tool descriptor, normalized
  finding model and nondeterministic-field removal.
- `util/third-party-evidence/evidence-manifest.mjs` — closed manifest assembly,
  summary calculation, corpus root and offline validation.
- `util/third-party-evidence/evidence-shards.mjs` — unsigned-prefix modulo-32
  assignment, closed partial-manifest construction and exact full-graph merge.

### New commands and evidence

- `util/acquire-npm-package-evidence.mjs` — networked acquisition and ScanCode
  orchestration; `--write` is the only full mode that updates committed evidence,
  while shard mode writes one atomic partial directory.
- `util/prepare-scancode.mjs` — download, authenticate and privately configure
  the platform's official ScanCode archive against exact Python 3.14.7.
- `util/merge-npm-package-evidence.mjs` — independently validate all partials and
  reconstruct/compare or explicitly publish the canonical corpus.
- `util/verify-npm-package-evidence-parity.mjs` — require full canonical-manifest
  and content-addressed-root equality between two aggregate directories.
- `util/verify-npm-package-evidence.mjs` — network-free corpus/schema/digest/
  signature validation.
- `docs/provenance/npm-package-evidence.schema.json` — closed Draft 2020-12
  evidence schema v1.
- `docs/provenance/npm-package-evidence-shard.schema.json` — closed Draft 2020-12
  partial schema that reuses the canonical evidence definitions and adds exact
  shard identity/membership.
- `docs/provenance/npm-package-evidence.json` — canonical graph/artifact/evidence
  manifest.
- `docs/provenance/evidence/npm/README.md` — corpus purpose, boundaries and
  regeneration/review instructions.
- `docs/provenance/evidence/npm/blobs/sha256/**` — suffixless retained evidence,
  archive inventories, normalized ScanCode results and verified attestation
  bundles keyed by byte SHA-256.

### Existing files changed

- `util/generate-third-party-material.mjs` — consume authenticated evidence
  rather than installed packages and generate third-party-material schema v2.
- `docs/provenance/third-party-material.schema.json` — advance `$id` and shape
  incompatibly from v1 to v2.
- `docs/provenance/third-party-material.json` — regenerate against the reviewed
  evidence corpus.
- `docs/provenance/rights-inventory.json` — update only its third-party facts
  binding and resulting root review digest.
- `governance.test.js` — validate evidence schema/corpus, v2 conclusions,
  lock/evidence agreement and review bindings.
- `package.json` and `package-lock.json` — exact direct development tools and
  named local commands, after exact configuration approval.
- `.gitattributes` and `.editorconfig` — byte-for-byte copies of WebVOWL's
  repository-wide LF and editor policy at the Phase 19C checkpoint, correcting a
  standalone Phase 19A extraction omission after exact configuration approval.
- `.prettierrc.json` — deliberately empty repository-local declaration of the
  exact-pinned Prettier defaults, after exact configuration approval.
- `CONTRIBUTING.md` and `scripts/source-policy.test.js` — explain the public
  contributor contract and exercise real Git/Prettier policy resolution.
- `.github/workflows/release.yml` and `.github/workflows/extended-tests.yml` —
  required fresh Ubuntu sharded release verification plus manually dispatched
  Ubuntu/Windows baseline and parity proof, after exact configuration approval;
  the transparent extended-environment observation remains schedule-only so a
  manual evidence dispatch runs only the acquisition graph; ordinary
  `.github/workflows/ci.yml` behavior remains unchanged.
- `scripts/workflow-governance.mjs`, `scripts/workflow-governance.test.js`,
  `scripts/require-job-success.mjs` and `scripts/require-job-success.test.js` —
  make the Action/input/matrix/transport contract executable and add the stable
  release evidence aggregate without adding it to ordinary CI.
- `docs/implementation-plan.md` — normative design and expanded Phase 19C
  checkpoint evidence.

## Task 1: Normalize the lockfile into platform-independent artifacts

**Files:**

- Create `util/third-party-evidence/lock-graph.mjs`.
- Create `util/third-party-evidence/lock-graph.test.js`.
- Create `util/third-party-evidence/digests.mjs`.

**Interfaces:**

```js
export function normalizeLockedRegistryGraph(lockfileBytes, options = {})
// -> { lockfileSha256, lockfileVersion, package, occurrences, artifacts }

export function stableJson(value)
export function sha256(bytes)
export function verifySri(bytes, integrity)
```

- [ ] Write literal lockfile fixtures proving nested duplicates collapse to one
      artifact while retaining every dependency path and platform selector.
- [ ] Prove rejection of HTTP, alternate hosts, missing/unsupported SRI,
      non-registry sources, absent name/version and one coordinate mapped to
      contradictory content identities.
- [ ] Run `npm test -- util/third-party-evidence/lock-graph.test.js --runInBand`
      and observe failures because the module does not exist.
- [ ] Implement the smallest strict normalizer and digest primitives.
- [ ] Re-run the focused test and keep literal expected artifacts independent of
      production helpers.

## Task 2: Inventory archives without unsafe extraction

**Files:**

- Create `util/third-party-evidence/archive-evidence.mjs`.
- Create `util/third-party-evidence/archive-evidence.test.js`.

**Interfaces:**

```js
export const ARCHIVE_LIMITS = Object.freeze({
  compressedBytes: 100 * 1024 * 1024,
  expandedBytes: 512 * 1024 * 1024,
  entries: 100_000,
  entryBytes: 128 * 1024 * 1024,
  pathBytes: 4096,
  retainedEvidenceBytes: 16 * 1024 * 1024,
});

export async function inspectPackageTarball(tarballPath, expected, options = {})
// -> { archiveRoot, packageIdentity, entries, evidenceFiles, expandedBytes }
```

- [ ] Construct minimal test archives for nested `LICENSE`, `NOTICE`,
      `COPYING`, `AUTHORS`, `PATENTS`, mixed-case and suffixed names.
- [ ] Add one independently expected rejection fixture for absolute, traversal,
      drive/UNC/NUL, multiple-root, missing-root-manifest, link-mediated evidence,
      special entry, duplicate/case-colliding evidence, truncation and each
      configured limit.
- [ ] Observe focused RED failures before importing `tar` in production code.
- [ ] Read entries as streams, normalize exact POSIX paths, hash each regular
      file, retain only selected evidence bytes, require exactly one safe archive
      root and compare `<archive-root>/package.json` name/version with the expected
      coordinate. Modern npm-produced archives normally use `package/`; accept a
      different historical root only under the same one-root, exact-identity and
      path/link/collision controls, and retain that root in authenticated evidence.
- [ ] Canonicalize harmless POSIX `.` components before root/collision checks,
      including during the authenticated materialization pass; continue to reject
      empty components and `..`, and detect duplicates after canonicalization.
- [ ] Re-run focused tests and prove the test process creates no extracted
      package path outside its temporary fixture directory.

## Task 3: Store and verify bounded content-addressed evidence

**Files:**

- Create `util/third-party-evidence/blob-store.mjs`.
- Create `util/third-party-evidence/blob-store.test.js`.

**Interfaces:**

```js
export async function retainBlob(root, bytes)
// -> { sha256, bytes, path: "blobs/sha256/ab/<digest>" }

export function verifyBlob(root, reference)
export function computeCorpusRoot(blobReferences)
```

- [ ] Prove identical bytes deduplicate, different bytes do not, suffixes are
      absent, prefix directories are lowercase and an existing wrong blob fails
      rather than being overwritten.
- [ ] Prove corpus root is order-independent but changes for digest, byte-length
      or semantic-kind mutations.
- [ ] Observe RED, implement atomic same-directory temporary write plus rename,
      and re-run focused tests.

## Task 4: Replay npm registry signatures offline

**Files:**

- Create `util/third-party-evidence/registry-signatures.mjs`.
- Create `util/third-party-evidence/registry-signatures.test.js`.

**Interfaces:**

```js
export function registrySignaturePayload(name, version, integrity)
export function verifyRegistrySignature({ name, version, integrity, signature, key })
```

- [ ] Generate an ephemeral ECDSA keypair in the test and sign the literal npm
      payload `<name>@<version>:<integrity>`.
- [ ] Prove valid verification and rejection after mutating name, version,
      integrity, signature, key identifier, key bytes or signing scheme.
- [ ] Observe RED, implement verification with Node `crypto`, and re-run focused
      tests without a network mock.

## Task 5: Normalize ScanCode results deterministically

**Files:**

- Create `util/third-party-evidence/scancode.mjs`.
- Create `util/third-party-evidence/scancode.test.js`.
- Create `util/third-party-evidence/fixtures/scancode-report.windows.json`.
- Create `util/third-party-evidence/fixtures/scancode-report.ubuntu.json`.

**Interfaces:**

```js
export const SCANCODE_TOOL = Object.freeze({ version: "32.5.0", ... });
export const SCANCODE_SEMANTIC_OPTIONS = Object.freeze([...]);
export const SCANCODE_PRE_SCAN_EXCLUDED_FILE_SUFFIXES = Object.freeze([".node"]);
export const SCANCODE_EXECUTION_OPTIONS = Object.freeze(["--processes", "1"]);
export function buildScancodeArguments({ outputPath, inputRoot })
export function normalizeScancodeReport(report, { artifactId, inputRoot })
// -> canonical artifact findings or throws on any scan error
```

- [ ] Hand-author paired reports whose only differences are absolute temporary
      roots, timestamps, durations, host metadata and collection ordering.
- [ ] Assert equal canonical JSON/digest while preserving licence matches/text,
      copyright, package data, unknown-licence findings and substantive errors.
- [ ] Pin the official Python 3.14 release assets and require one ScanCode worker
      to bound the upstream-reported Python 3.14 memory regression; retain that
      execution limit in normalized provenance without treating it as a semantic
      scan option.
- [ ] Keep ordinary package discovery and every licence/copyright/information
      scan fail-closed, but exclude `--package-in-compiled` and omit only regular
      files whose case-insensitive suffix is `.node` from the temporary ScanCode
      input after their archive bytes have been authenticated. Do not express
      this as a ScanCode `--ignore` glob: ScanCode applies name globs to
      directories too, so a directory such as `_optPlug.node` would hide
      otherwise scannable descendants. Continue to authenticate every native
      binary in the archive ledger, record each exact scanner exclusion, and
      reserve compiled introspection for a separate deterministic channel.
- [ ] Assert any scan error, unexpected ScanCode version, extra or changed file,
      omitted non-empty legal-evidence file, or otherwise unaccounted omission
      fails. Permit only authenticated zero-byte omissions, non-evidence hidden
      paths and exact non-evidence `.node` exclusions. Distinguish a zero-byte file
      that ScanCode reports without a digest from both a digest-verified file and
      an entirely omitted file; retain each limitation's exact path, size, archive
      SHA-256 and fixed reason in the normalized findings envelope.
- [ ] Observe RED, implement an allowlist of removable fields and canonical
      ordering, then re-run focused tests. Normalize execution-rooted paths only
      at ScanCode's codebase-location fields (`files[].path`,
      `packages[].datafile_paths` and `dependencies[].datafile_path`); preserve
      package-model fields such as `file_references[].path`, whose values may be
      dependency identities including scoped npm names rather than filesystem
      locations.

## Task 6: Define and validate the evidence manifest

**Files:**

- Create `util/third-party-evidence/evidence-manifest.mjs`.
- Create `util/third-party-evidence/evidence-manifest.test.js`.
- Create `util/third-party-evidence/evidence-shards.mjs`.
- Create `util/third-party-evidence/evidence-shards.test.js`.
- Create `docs/provenance/npm-package-evidence.schema.json`.
- Create `docs/provenance/npm-package-evidence-shard.schema.json`.
- Create `util/verify-npm-package-evidence.mjs`.
- Create `util/merge-npm-package-evidence.mjs`.
- Create `util/verify-npm-package-evidence-parity.mjs`.

**Interfaces:**

```js
export function createEvidenceManifest({ graph, policy, registryKeys, artifacts, blobs })
export function verifyEvidenceManifest({ manifest, lockfileBytes, blobRoot })
export function artifactShardIndex(artifactId, shardCount)
export function createEvidenceShard({ manifest, shardCount, shardIndex })
export function mergeEvidenceShardDocuments({ graph, shards })
```

- [ ] Write a complete two-artifact fixture manifest and prove schema validity,
      occurrence/artifact closure, blob closure, signature replay, archive and
      scan completion, summary counts and corpus root.
- [ ] Mutate each binding independently and prove an exact classified
      `PRODUCT_FAILURE` or `CONTROL_FAILURE`.
- [ ] Prove `NOT_PUBLISHED` provenance succeeds and present-invalid provenance
      fails.
- [ ] Observe RED, implement the closed v1 schema/manifest verifier and expose a
      network-free CLI that writes nothing.
- [ ] Prove the first eight artifact-ID hex characters are interpreted as an
      unsigned 32-bit integer modulo the exact shard count, with stable assignment
      independent of host and iteration order.
- [ ] Prove aggregate rejection of a missing, duplicate, misassigned, policy/
      lock-mismatched or corrupt shard/blob and allow only byte-identical CAS blob
      deduplication before canonical full-manifest reconstruction.

## Task 7: Acquire exact registry evidence

**Files:**

- Create `util/acquire-npm-package-evidence.mjs`.
- Create `util/prepare-scancode.mjs`.
- Create `util/third-party-evidence/acquisition.test.js`.
- Create `util/third-party-evidence/scancode-bootstrap.test.js`.
- Modify `package.json` and `package-lock.json` only after exact approval.

**Interfaces:**

```js
export async function acquireEvidence(options)
// options inject fetch, pacote, scanner and paths at the external boundary.
```

- [ ] Exercise acquisition against a local HTTP fixture that reproduces complete
      npm packument, tarball, keys and attestations response shapes; assert final
      origin and content identities rather than calls to a mock.
- [ ] Prove bounded retries classify persistent 5xx/network failure as
      `EXTERNAL_BLOCKED`, while 4xx, identity, SRI and signature failures do not
      retry into success.
- [ ] Observe RED before implementing network orchestration.
- [ ] Use `pacote.tarball.file()` with registry-only fetch permissions, explicit
      public registry/cache paths and expected resolved/integrity; independently
      hash and inspect the resulting temporary file.
- [ ] Fetch and validate exact packument/key/attestation URLs, retain replayable
      public evidence, invoke ScanCode only after archive validation and always
      clean the unique `.release/` staging directory.
- [ ] Implement default verify-only behavior; require explicit `--write` for
      corpus replacement and reject unknown CLI arguments.
- [ ] Add non-mutating shard mode requiring count, index and output together;
      select only the assigned artifacts and atomically emit one shard manifest
      plus its exact CAS blobs without permitting `--write`.
- [ ] Keep workflow command text shell-independent: resolve only the matrix shard,
      platform, ScanCode executable and setup-python output from explicitly named
      environment variables, reject absent/invalid variable names and never place
      GitHub expressions in `run:` text.
- [ ] Discover bounded `npm-cli.js` candidates beside PATH-visible global npm
      prefixes and in the selected Node distribution, invoke each with
      `process.execPath` and `shell: false`, and accept only the candidate reporting
      the exact required npm version; never spawn a Windows `.cmd` shim directly.

## Task 8: Generate third-party-material v2 from the corpus

**Files:**

- Modify `util/generate-third-party-material.mjs`.
- Modify `docs/provenance/third-party-material.schema.json`.
- Regenerate `docs/provenance/third-party-material.json`.
- Modify `governance.test.js`.

- [ ] Write failing governance expectations for schema ID
      `third-party-material.v2.schema.json`, `LOCKED_REGISTRY_TARBALL`, artifact
      references, separate lock/tarball/observed/concluded licences, signature/
      provenance/scan states and explicit licence-file presence.
- [ ] Remove installed-directory inspection and consume only the verified
      evidence manifest plus retained repository material facts.
- [ ] Preserve human conclusions when their exact component facts remain
      equivalent; expose every contradiction or newly unresolved conclusion.
- [ ] Bind the v2 facts digest to lockfile, evidence manifest, corpus root,
      component conclusions and repository materials, excluding volatile network
      metadata.
- [ ] Regenerate and validate; leave the new facts pending human review.

## Task 9: Acquire the full graph in closed shards and establish cross-platform parity

**Files:**

- Generate `docs/provenance/npm-package-evidence.json` and retained blobs.
- Create `docs/provenance/evidence/npm/README.md`.

- [ ] Run all indices `0..31` of the deterministic unsigned-first-eight-hex
      modulo-32 assignment over every unique final locked artifact on Windows (the
      pre-tool graph contains 618 occurrences and 585 artifacts;
      the committed count is regenerated after adding the exact acquisition
      tools) with official ScanCode `32.5.0` Python 3.14 Windows archive whose
      SHA-256 is
      `74dfca9f0f2a607dbc90cfbfd03df1ed5b3e7e4b3a12dbb028e0d158c1311ec5`.
- [ ] Run the same 32 shards on Ubuntu with official ScanCode `32.5.0` Python
      3.14 archive whose SHA-256 is
      `02be93341e2f9775f88b4abd03cdd74f2e4de91941a12a1d8cd150eeb72a0945`.
- [ ] Invoke both hosts with `--processes 1`; ScanCode remains isolated in its
      disposable release-tool environment and MUST NOT modify a user-level
      Python installation or publish any Python runtime in the npm package.
- [ ] Select exact Python `3.14.7` x64 through full-SHA
      `actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97`
      (`v7.0.0`) with `check-latest: false`, `update-environment: false` and empty
      cache; authenticate the matching official ScanCode archive before private
      configuration.
- [ ] Independently validate and merge each host's 32 partials into candidate
      corpora without `--verify-committed`, because the initial bootstrap has no
      prior corpus to compare; then require byte-identical canonical manifests
      and corpus roots, stopping and classifying a difference rather than
      selecting a preferred host.
- [ ] Promote the parity-proven candidate bytes only after offline schema/digest
      verification and human review. Retain `--verify-committed` without an
      initial-corpus exception in every release aggregate.
- [ ] Measure the graph against every archive/corpus ceiling and record actual
      maxima in the corpus README without weakening a failed safety ceiling.
- [ ] Verify every final lockfile occurrence resolves to one complete artifact,
      every unique artifact passes identity/SRI/signature/archive/scan controls,
      and provenance counts distinguish verified from not published; do not
      preserve the pre-tool counts as constants after the lockfile changes.

### First diagnostic baseline: run 33066704132

The manually dispatched two-host baseline on 27 August 2026 deliberately drained
all 64 shard lanes under `fail-fast: false`. It is diagnostic evidence, not a
completed Phase 19C baseline: 18 jobs succeeded, 49 failed and the schedule-only
observation job was correctly skipped. All 32 Windows shards reached the same
pre-acquisition defect because Node cannot execute `npm.cmd` directly with
`shell: false`. Ubuntu completed 18 shards and exposed three authenticated
historical-layout classes across the remaining 14: harmless `package/./...` tar
paths, zero-byte or hidden resources absent from ScanCode's file report, and
foreign-platform native `.node` artifacts that make `--package-in-compiled`
abort. Both host aggregates and parity therefore failed closed; no candidate
corpus was promoted. The retained run is
[GitHub Actions run 33066704132](https://github.com/Hadden-Industries/owlapi/actions/runs/33066704132).

The bounded correction keeps the archive inventory authoritative, canonicalizes
only POSIX `.` components, records only the two proved ScanCode-report omission
classes, rejects every unaccounted or legally significant omission, removes
host-dependent compiled-package introspection from the canonical scan, and
executes npm's JavaScript CLI through the selected Node binary. A new complete
64-shard run and cross-platform parity result remain mandatory before this task
can be checked off.

### Second diagnostic baseline: run 33071551094

The corrected matrix was manually dispatched on 27 August 2026 at exact source
commit `42cb4b532804e77e78c0a33cb0d78e72fefa927d` and again drained all lanes. Its
68 jobs ended with 19 successes, 48 failures and the expected one skipped
schedule-only observation. No candidate corpus was promoted.

All 32 Windows shards failed the runtime preflight before acquisition: installing
npm `12.0.2` globally left Node's bundled npm `11.17.0` present, and the preflight
selected only that bundled JavaScript CLI. Ubuntu completed 19 shards and exposed
three bounded artifact-representation classes in the other 13:

- shards 8, 12, 17 and 27 encountered a repeated
  `package/dist/index.js` member in `socks-proxy-agent@8.0.5`,
  `https-proxy-agent@7.0.6`, `agent-base@7.1.4` and
  `http-proxy-agent@7.0.2` respectively;
- shards 11, 13 and 23 reached foreign-ABI `.node` binaries in
  `@rolldown/binding-win32-x64-msvc@1.2.6`,
  `@rolldown/binding-linux-arm-gnueabihf@1.2.6` and
  `@rolldown/binding-darwin-x64@1.2.6`, for which ScanCode's ordinary information
  scan returned a non-zero failure; and
- shards 9, 20, 21, 22, 28 and 29 reported authenticated zero-byte files without
  a SHA-256 in `node-gyp@13.0.2`, `tar-fs@2.1.5`, `node-gyp@11.5.0`,
  `smart-buffer@4.2.0`, `napi-build-utils@2.0.0` and `undici@6.28.0`.

Both per-host aggregates and cross-platform parity failed closed because their
shard sets were incomplete. The retained diagnostic is
[GitHub Actions run 33071551094](https://github.com/Hadden-Industries/owlapi/actions/runs/33071551094).

The second bounded correction does not waive any evidence. Runtime discovery
tests every bounded PATH-prefix and Node-bundled JavaScript CLI and selects only
the exact npm version. Archive inspection counts every physical member and byte
toward safety ceilings, permits a repeated canonical path only after independently
proving identical type, size and digest for every occurrence, records the
occurrence count, and re-hashes all occurrences while materializing one file.
The correction used one recorded `*.node` ScanCode exclusion on both hosts while
the archive ledger retained each binary's path, size and digest. A reported
zero-byte file without a ScanCode digest was recorded as an incomplete scanner
identity, never as digest-verified. The third diagnostic below subsequently
proved that the scanner glob itself was too broad and superseded only that
delivery mechanism; the authenticated-native-binary policy remains unchanged.

### Third diagnostic baseline: run 33076167863

The third manually dispatched matrix was run on 27 August 2026 at exact source
commit `b4b25f0a9e7b407e80b6b3eedc2d797e06d33d56`. All 64 acquisition lanes
completed: 60 succeeded, while the same two bounded defects failed one Ubuntu and
one Windows shard each. The two host aggregates and cross-platform parity then
failed closed, and the schedule-only observation job was correctly skipped. The
68-job result therefore comprised 60 successes, seven failures and one skip. No
candidate corpus was promoted. The retained diagnostic is
[GitHub Actions run 33076167863](https://github.com/Hadden-Industries/owlapi/actions/runs/33076167863).

- Shard 11 failed for `minipass-sized@1.0.3` (artifact
  `19d7cd8bf0c9e466ba54079b60608ba63aac711c776c5784711b4a804c7482d1`).
  ScanCode uses package-model `file_references[].path` values such as the scoped
  dependency identity `@babel/code-frame`; the generic normalizer incorrectly
  treated every property named `path` as an execution-rooted codebase path.
- Shard 29 failed for `@cyclonedx/cyclonedx-library@10.2.0` (artifact
  `80338c1d62e6e784ce3a7d2588471c8b333f14ba6a6e715af1d03756ad2d46e3`).
  Its ordinary declarations and source live beneath directories such as
  `_optPlug.node`, so ScanCode's name-based `--ignore "*.node"` glob suppressed
  scannable descendants including `package/dist.d/_optPlug.node/_wrapper.d.ts`.

The third bounded correction is schema-aware rather than heuristic. It normalizes
only ScanCode's three execution-rooted codebase-location surfaces and preserves
package-model paths verbatim. It also removes `--ignore`, authenticates every
archive member as before, and omits only regular files with the case-insensitive
`.node` suffix from the temporary scan tree; directories with that suffix and
their descendants remain present. The evidence policy and schema record the
exact pre-scan file-suffix exclusion, and archive coverage continues to fail if a
native file selected as legal evidence is absent from ScanCode. A fourth complete
64-shard run, two successful aggregates and byte-identical parity remain mandatory
before Task 9 can be checked off.

## Task 10: Reconcile rights and human review

**Files:**

- Modify `docs/provenance/rights-inventory.json`.
- Regenerate `docs/provenance/third-party-material.json` review metadata after
  human approval.

- [ ] Prove every production component has retained licence evidence or one
      explicit immutable external-evidence rationale and no unresolved production
      conclusion.
- [ ] Review development-only anomalies and record an explicit disposition for
      each without pretending development material is distributed.
- [ ] Update the rights inventory only to bind the new third-party-material facts
      digest, recompute its facts digest and return it to human review.
- [ ] Obtain exact human approval of the generated evidence and conclusion facts
      before changing either review to `REVIEWED`.

## Task 11: Wire deterministic and release controls

**Files:**

- Create `.gitattributes` and `.editorconfig` as byte-for-byte policy copies of
  the corresponding WebVOWL root files after exact approval.
- Create empty `.prettierrc.json`, modify `CONTRIBUTING.md`, and create
  `scripts/source-policy.test.js` after exact approval.
- Modify `.github/workflows/release.yml` and
  `.github/workflows/extended-tests.yml` only after exact approval; preserve
  ordinary `.github/workflows/ci.yml` behavior.
- Modify `scripts/workflow-governance.mjs`,
  `scripts/workflow-governance.test.js`, `scripts/require-job-success.mjs` and
  `scripts/require-job-success.test.js` after exact approval.
- Modify `scripts/release-gate-catalogue.mjs` and generated gate evidence if its
  existing `P19-EVIDENCE-001` command inventory requires it.

- [x] Pin repository text handling to WebVOWL's approved LF and editor defaults
      so Git clients cannot substitute host-specific line-ending policy; record
      this as correction of a Phase 19A standalone-policy omission rather than an
      npm-evidence requirement.
- [x] Make the exact Prettier defaults repository-discoverable, document the
      contributor commands and prove the Git normalization/upstream-byte and
      Prettier-resolution behavior through real tools.
- [ ] Keep ordinary CI's existing offline schema/blob/corpus/signature and cross-
      platform normalizer-fixture coverage without downloading all tarballs.
- [ ] Add a 32-lane credential-free Ubuntu release acquisition matrix with
      `fail-fast: false`, `max-parallel: 8`, exact 120-minute shard ceilings and
      one-day same-run partial artifacts.
- [ ] Make stable `Release / third-party evidence` run under `always()`, reject an
      incomplete matrix during merge, require exact committed-corpus equality and
      gate candidate construction plus the closed release aggregate on its success.
- [ ] Add a manual-only 32×2 Ubuntu/Windows shard matrix, per-OS candidate-
      aggregate matrix and cross-platform parity job to `extended-tests.yml`; do
      not compare the bootstrap aggregate with an absent committed corpus, run
      this heavy baseline on its weekly schedule, or make it a required ordinary
      CI check. Keep the transparent extended-environment observation job
      schedule-only so `workflow_dispatch` cannot couple the pre-corpus full test
      state to a manual acquisition baseline.
- [ ] Govern the sixth Action, exact setup-python inputs, fixed runner/shell matrix,
      environment-only expression crossings, closed artifact patterns, one-day
      retention, exact shard coordinates and all fail-closed aggregates; grant only
      `contents: read`, with no npm/GitHub write, OIDC, environment or release
      mutation authority.

## Task 12: Verify and stop at the Phase 19C evidence checkpoint

- [ ] Run every focused evidence test using `npm test -- <file>`.
- [ ] Run `npm test -- governance.test.js --runInBand`.
- [ ] Run the full package, boundary, lint, formatting, gate-registry and workflow-
      governance suites.
- [ ] Run the offline verifier from a clean process with networking unavailable.
- [ ] Run the full fresh network/ScanCode verifier once against the committed
      corpus.
- [ ] Inspect `git diff --check`, the complete file list, corpus size, generated
      summaries and pending/reviewed states.
- [ ] Pause for user review and a detailed file-by-file Phase 19C checkpoint
      commit; do not commit or push without separate explicit authorization.
