# Markdown Quality root development dependency migration

Date: 2026-11-05.
Status: implementation proposal; no migration has been executed.
Repository baseline: main at 097ee0158ef1374ea6d140c9c79b628aa2a3eb42.
The baseline working tree was clean when inspected.

## Outcome and authority

Replace the isolated Markdown 1.0.3 archive installation with the ordinary root npm development graph.
Declare exactly `"@hadden-industries/markdown-quality": ">=3.0.0"` in root `devDependencies`.
Use the root lockfile and installed public CLI/SDK; npm owns matching optional native packages.
Assume the registry core and native 3.0 packages are available.
There is no release, availability, publication-approval or adoption gate in this plan.
Do not introduce a 2.x bridge, persistent tarball fallback, Git dependency or compiler bootstrap.

The tested JSON Quality 3.0 precedent is `../json-quality/docs/markdown-quality.md` and local signed commit 9c038b10e01da9ae2ff93d5a009205c92e7eb775.
Reuse its normal root dependency, explicit roots and explicit `--write` command shape.
Native npm authored its lock with lifecycle scripts disabled, retaining core and both matching optional native 3.0 packages.
Its local Windows proof covered 43 Markdown files, check exit 0 with 12 preserved historical advisory warnings, absent configuration and effective authored-gfm@2 defaults.
A real disposable file proved missing repair mode exit 2, zero-write preview with unchanged raw hash, one write matching predicted hash/byte count, then zero-write second format and check exit 0.
External-cwd `npm --prefix` inspection selected the intended repository root.
This is command-route proof, not Linux or OwlAPI acceptance.
The earlier b54b426b60cf9db1a8248b8e57f68ffb13ae998f archive-removal precedent remains historical.
Do not copy unrelated script renames or apply JSON Quality's no-config choice over OwlAPI's real ownership exceptions.
Default to no Markdown configuration, then add only demonstrated repository ownership exceptions.
Retain finite, meaningful execution limits where the existing qualification owner needs them.

This document is the only authorized repository change in this planning task.
Do not edit implementation, configuration, locks, AGENTS, historical plans or evidence.
No installation, build, product test, branch switch, commit or push is authorized here.
Future commits require actual per-file message review approval under the user's instructions.
No applicable AGENTS file was found at the repository or document ancestors inspected.

The earlier [producer-source inspection](codex://threads/01a1aad3-14cf-78f2-8a37-ced8c85759fb) remains historical context.
This refresh checks the installed 3.0.0 public package in JSON Quality's root node_modules: package exports, CLI admission, SDK and consumer/migration guides.
Use that installed contract as the implementation reference; do not execute or modify the mutable producer checkout.
The recorded baseline revision and isolated-tooling observations remain current; only this proposed plan is untracked in OwlAPI.

## Current owning relation

| Path or owner                                                        | Current behavior                                                                         | Planned treatment                                                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `package.json`                                                       | Root Markdown scripts delegate to a separate npm prefix                                  | Add root minimum; direct public commands; retain established script names                                |
| `package-lock.json`                                                  | Root tooling graph lacks Markdown Quality                                                | One deliberate lock update, preserving unrelated resolutions and overrides                               |
| `tooling/markdown/package.json`                                      | File archives, native optional dependencies, KaTeX override and shell directory changes  | Remove after every active reader is migrated                                                             |
| `tooling/markdown/package-lock.json`                                 | Separate installation authority                                                          | Remove from active setup                                                                                 |
| `tooling/markdown/release-manifest.json`                             | Producer source 5712d153079bfc840a918c7dd250afef820d9e07 and archive evidence            | Remove active dependency binding only after evidence-reader disposition                                  |
| `tooling/markdown/archives/*.tgz`                                    | Core, win32-x64 and linux-x64 1.0.3 archives with source commit in filenames             | Remove all three from active consumer tooling                                                            |
| `.markdown-quality.json`                                             | Schema 2, authored-gfm@1, many exclusions and redundant defaults                         | Reconstruct minimal schema-3 scope policy only if needed                                                 |
| `.markdown-quality-execution.json`                                   | Schema 1 resource, runtime and archive tuple declarations                                | Separate ordinary limits from trusted qualification ownership; migrate schema 2                          |
| `scripts/markdown-quality.probes.mjs`                                | Resolves isolated install; CLI, SDK, links, selection, logical bytes, resources          | Keep semantic probes and resolve the root package                                                        |
| `scripts/dependency-security-markdown.probes.mjs`                    | Resolves installed producer's KaTeX; tests inherited trust/macros in child processes     | Reassess actual installed surface; retain meaningful protections, remove obsolete transitive assumptions |
| `scripts/run-json-quality.mjs`                                       | Registers Markdown archive native provider                                               | Remove archive-only provider registration when its corpus leaves active ownership                        |
| `util/third-party-evidence/markdown-json-documents.mjs`              | Validates tuple controls, archive integrities and every retained member                  | Retire active archive supplier after exact provenance disposition                                        |
| `util/third-party-evidence/markdown-json-documents.test.js`          | Tests that supplier against real and tampered archive tuples                             | Remove archive-only cases with owner; preserve independent archive evidence tests                        |
| `scripts/json-quality-preservation.probes.mjs`                       | Preserves 13 physical values plus two native Linux author values                         | Preserve original-value oracle and its source rights; update only departed supplier coupling             |
| `scripts/json-quality.probes.mjs`                                    | Reads release manifest, tests cargo-report coverage and old nested node_modules boundary | Revise stale corpus expectations, retain exclusion refusal and source preservation                       |
| `scripts/json-quality-policy.mjs`, `.json-quality.json`              | Encode archive/native and installation boundaries                                        | Narrowly reconcile departed active inputs; no global policy weakening                                    |
| `util/generate-third-party-material.mjs`                             | Requires local archives and emits source-head-bound Markdown inventory                   | Use actual installed root dependency facts for current development tooling                               |
| `util/generate-third-party-material.test.js`                         | Asserts archive paths, retained source head and profile identities                       | Update independent current-graph expectations without rewriting historical provenance                    |
| `docs/provenance/third-party-material.json`, `NOTICE`, `LICENSES/**` | Generated/current inventory and retained rights                                          | Reconcile current inventory through its generator; retain notices whose material remains                 |
| `scripts/dependency-graph.mjs`                                       | Owns graph capture and excludes archive domain                                           | Remove dead archive-only branch only; preserve containment and graph ownership                           |
| `.dependency-cruiser.json`, graph tests                              | Guard production/tooling edges and resolution                                            | Validate real hoisted root layout without disabling unresolved edges                                     |
| `.github/workflows/ci.yml`, `release.yml`                            | Markdown install/check lanes coexist with source/runtime/product lanes                   | Drop only isolated acquisition; keep complete Markdown checks and required jobs                          |
| `.github/workflows/markdown-quality.yml`                             | Separately pinned manual trusted reusable workflow                                       | Recommend retire archive-only ceremony if no downstream receipt consumer remains                         |
| `scripts/workflow-governance.mjs`, `workflow-governance.test.js`     | Freeze installation order, trusted pin and closed inputs                                 | Update with actual workflow changes and keep rejection mutations                                         |
| `scripts/development-dependency-policy.test.js`                      | Separates development runtime/source lanes from published support                        | Retain and update only obsolete Markdown acquisition expectations                                        |
| `docs/development/npm-scripts.md` and maintained setup docs          | Still describe install:markdown isolation                                                | Explain ordinary root installation and 3.x behavior                                                      |

There is no additional copied Markdown source directory in this consumer's inspected tooling tree.
The isolated directory contains two manifests, one release manifest and three archives.
Do not infer all other archives or copied tools are Markdown-owned.
Artifact transport, JSON Quality, Python and ontology-reference evidence remain separate owners.
Search current readers before each deletion; the map is a starting inventory, not permission to erase provenance.
The installed 3.0 package declares no KaTeX dependency and exposes no KaTeX rendering contract.
The current math-safety file resolves KaTeX from the isolated producer and exercises that transitive dependency directly.
Retire that departed-surface probe and its `test:markdown` operand if the final installed graph confirms this same contract; do not add KaTeX solely to preserve the old test.
Keep all independent CLI/SDK, link, scope, logical-byte and resource assertions.

## Exact command and API contract

Root script targets:

```json
{
  "check:markdown": "markdown-quality check --root . --diagnostic-display-level warning",
  "format:markdown": "markdown-quality format --write --root . --diagnostic-display-level warning",
  "inspect:markdown": "markdown-quality inspect --root . --json",
  "inspect:markdown:profile": "markdown-quality inspect-profile --root . --json"
}
```

Remove `install:markdown`; ordinary `npm ci --ignore-scripts` installs the development graph.
Existing root format/lint/check composites retain their command authority.
Do not hardcode `node_modules/.bin`, change directory to `../..`, or use network-fallback `npx`.
Resolve SDK/bin metadata from the root installed package using supported package resolution.
Keep SDK imports in Node-only probes/build tooling: the root export rejects browser and unmatched resolver conditions; never add it to OwlAPI browser bundles.
Warning display filtering is optional presentation, not policy or strictness.
For parseable JSON and literal operands, use `npm run --silent check:markdown -- --json -- README.md`; the second `--` belongs to Markdown Quality.
Preview directly with `npm exec -- markdown-quality format --dry-run --root . -- README.md`; do not append `--dry-run` to the `--write` wrapper.
External-cwd callers use `npm --prefix <absolute-repository-root> run ...`; explicit root must remain OwlAPI.
Capture native child-process status directly; a PowerShell wrapper must use `exit $LASTEXITCODE` to preserve exit 2 rather than mapping nonzero statuses to 1.
A probe may spawn Node with the resolved public bin to obtain exact streams and status.

`qualify:markdown` currently delegates to `markdown-quality-qualify consumer`.
Do not mechanically replace that with `markdown-quality-qualify-git consumer`.
The new qualifier takes named immutable qualification flags only.
Remove the misleading legacy script, or replace it only with an actually complete supported invocation.
An ordinary installed check must not be labeled as an old trusted hosted receipt.
Retain a hosted qualifier only for a concrete downstream receipt reader, not merely because its caller exists.

| Old contract                                   | Required 3.0 handling                                        |
| ---------------------------------------------- | ------------------------------------------------------------ |
| Filesystem format/normalize                    | Exactly one of --write or --dry-run, even empty selections   |
| --diagnostic-level                             | --diagnostic-display-level; presentation only                |
| --inventory                                    | --reconcile-inventory git                                    |
| processDocument                                | processLogicalDocument                                       |
| executeQuality                                 | executeQualityRequest                                        |
| stageCandidate                                 | stageCandidateData                                           |
| compareQualityReports                          | compareCheckReports                                          |
| qualifyCandidate                               | qualifyGitMarkdown                                           |
| limits / inventory / gitExecutable SDK options | analyzerLimits / reconciliationInventory / gitExecutablePath |
| outcome                                        | operationStatus, qualityStatus and qualityBasis              |
| written                                        | writtenPaths and per-document writeStatus                    |
| selection.inventory / exclusions               | reconciliationDecisions / omissions                          |
| tools.markdown                                 | tools.eslintMarkdown                                         |
| Configuration/effective schemas                | Version 3; authored-gfm@2                                    |
| Result / execution / comparison schemas        | 5 / 2 / 3                                                    |

Keep `runQuality`, `inspectSelection`, `readExecutionProfile` and `validateQualityResult` where appropriate.
SDK physical repairs retain SDK write semantics; do not add fabricated CLI write options.
`executeQualityRequest` is a bounded child-process request and refuses physical repair.
Migrate embedded request/execution options together with their readers, not just imports.
Bind schema 5 independently in probes as well as validating through the installed schema.

Every selected result record has a nullable candidate identity with input/output hashes, byte counts and changed.
Completed nonempty repairs require real candidates; confirmed writes are a separate projection.
Require complete `check` evidence over the intended scope for cleanliness.
Successful inspect, selected check, format, normalize and preview are not complete-repository check evidence.
Historical comparison input schemas remain historical; do not rewrite old reports to schema 5.

Literal file operands follow `--` and are canonical root-relative forward-slash paths.
Preserve explicit `--files-json '[]'` and empty terminator semantics.
Exercise nested cwd with Git root discovery, package-root fallback and cwd fallback.
Explicit files bypass include, retain exclusions and refuse unsupported Markdown variants.
Human output belongs on stderr; --json is one complete stdout document.
Quiet changes presentation only; strict warnings still block and failures remain visible.
Help and version are inert discovery.

Raw stdin requires `--stdin --stdin-filepath docs/buffer.md`.
Raw transforms emit source only and reject --json, --write and --dry-run.
Raw check can emit JSON.
The existing JSON/base64 `--stdin-request` logical-document contract remains supported.
Logical operations never write the checkout, including refused and invalid-input cases.

## Minimal policy and resource decisions

Begin by inspecting selection with trusted absence of configuration.
Compare selected, omitted and reconciled paths against independently enumerated repository owners.
Do not run a default filesystem formatter against the real checkout to discover scope.

| Existing setting or boundary                                                  | Recommendation and evidence needed                                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `**/*.md`, LF, two-space layout, local link checking, root-relative rejection | Use package defaults; omit redundant fields and empty lint object                                            |
| Dependency installs, caches, coverage and runtime directories                 | Verify package operational defaults before adding duplicate exclusions                                       |
| `docs/conformance/generated/**` and `upstream/**`                             | Preserve generated and upstream ownership; no formatter writes into canonical/reference bytes                |
| `docs/provenance/history-reconstruction/**`                                   | Preserve historical evidence; do not repair its links or wording as migration cleanup                        |
| `LICENSES/development/scancode-runtime/**`                                    | Retain exact upstream notice bytes                                                                           |
| API.md, java-api-surface.md, 0.1.0-api-delta.md                               | Verify generators/canonical status; preserve proven generation boundaries rather than all compatibility docs |
| `util/owlapi-reference/fixtures/**`                                           | Keep byte-frozen fixture ownership and exact invalid-byte tests                                              |
| Two timestamped Deep Review files                                             | Retain existing recorded evidence boundary unless owner evidence establishes editable prose                  |
| documentDiagnostics 10000                                                     | Map only if capacity evidence needs it; never carry obsolete key blindly                                     |
| Advisory/strict style findings                                                | Use authored-gfm@2 defaults; fix actual defects coherently instead of disabling rules                        |
| Broad authored documentation drift                                            | Record separately; do not blanket-exclude docs or mix bulk cleanup into dependency replacement               |

If scope exceptions are necessary, retain a sparse schema-3 configuration with only justified exclusions.
Do not preserve the schema-2 preset or `links.localFiles`; the current key is `checkLocalTargets`.
No include override should silently narrow new authored Markdown outside the old list.
No default rule disabling, unlimited capacities, null ceilings or ignore-file authority is introduced.

Translate the existing finite profile deliberately: samples 6 becomes requiredConsecutiveSamples 6; checkerMs 30000 becomes executionTimeoutMs 30000; windowMs 180000 becomes sampleTimeoutMs 180000; memoryBytes 1073741824 becomes maxObservedMemoryBytes; nodeOldSpaceMb 256 becomes maxNodeOldGenerationMiB; requestBytes/reportBytes 8388608 become maxRequestBytes/maxOutputBytes; stagingBytes 201326592 becomes maxStagedDataBytes; stagingEntries 100000 becomes maxStagedEntries.
Translate documentDiagnostics, workerHeapMb and stagingMs only to the actual owning current controls.
Check that a test reaches its intended sink before any outer timeout/heap/output ceiling.
Keep output, cleanup, freshness and cache-isolation oracles.

Ordinary profiles are sparse and need no toolchain, runtimes or sample declarations.
Trusted qualification additionally needs its required finite observation/staging declarations and runtime references.
The installed public `qualifyGitMarkdown` still requires actual archive bytes plus lock integrity under trustedRoot.
A root installed tree or lock integrity cannot impersonate archive SHA-256 evidence.
The independently pinned trusted producer workflow/tuple is a separate evidence boundary.
Targeted inspection found no Markdown receipt reader in release-gate producers or ordinary CI/release call sites.
The recovery controller only permits changes to the workflow path; it does not consume its Markdown receipt.
Recommend ordinary root checking and retiring obsolete archive-specific manual ceremony.
If a concrete downstream reader is discovered, name it and prefer its existing producer-owned material route.
Do not recreate an archive installation in OwlAPI; resolve only that bounded contract.

OwlAPI development currently requires Node >=26.13.0 and npm >=12.2.1.
Markdown's >=22.13.0 tooling floor is already covered.
Do not lower development admission or raise the published OwlAPI Node >=22.0.0 contract because of this devDependency.
Keep consumer runtime qualification lanes distinct from the producer development graph.

## Vertical slices and proof

### Slice 1: freeze owner map and policy projection

Read all producers, readers, schemas and embedded argv before modifying implementation.
Capture current scripts, lock identity, selected corpus and archive/provenance reader list.
Resolve evidence dispositions for removed native archive members without editing their original values.
For original author preservation, keep independent immutable expected strings/bytes in the existing evidence owner.
If the only available oracle lives inside a departing archive, identify its retained evidence source before removal.
Do not normalize or silently drop its two native author values.
Acceptance: a per-path retain/edit/remove map, sparse policy rationale and exact consumer updates are reviewable.
No new framework, installer, registry adapter or general test harness is needed.

### Slice 2: root package, commands and one lock graph

Add the exact >=3.0.0 declaration and direct root scripts.
Preserve unrelated dependencies and root overrides; do not transplant isolated KaTeX policy without need.
Generate the root lock once with the managed npm, inspect the resolution diff and freeze it.
Author it with native npm and `--ignore-scripts`, retaining core 3.0 and both matching optional native platform entries.
Install once from that frozen lock with lifecycle scripts disabled.
Immediately preflight the installed public SDK exports, CLI admission and repair modes before expensive semantic or full-scope checks.
Keep dependency/config/consumer updates in one coherent batch with one installation and no acquisition-only ceremony.
Use the same installed graph through later edits and probe repairs.
Do not rebuild native packages, install Rust/Python toolchains or reinstall after every source edit.
Prove resolved package version, lock integrity, actual public bin and platform-native package loading.
Acceptance: normal root npm installation replaces active prefix acquisition on both supported native platforms.

### Slice 3: semantic probes, JSON corpus and provenance

Migrate root resolution and every renamed SDK/schema/report reader together.
Keep missing non-Markdown link targets, exact excluded invalid bytes and authored untracked Markdown probes.
Retain strict/advisory distinctions and explicit-file non-reconciliation semantics.
Rewrite stale schema-3 expectations to independently require schema 5, not a permissive accepted-version list.
Replace archive identity assertions with actual root package/lock/installed identity where they test installation.
Retire archive-only assertions only after their current scope/provenance owner no longer consumes those inputs.
Reconcile `run-json-quality.mjs`, preservation probes and policy as one bounded corpus change.
Do not change JSON parser guarantees, author rights, protected original values or unrelated evidence providers.
Regenerate only current third-party inventory through the existing generator after its facts are corrected.
Retain historical source attribution and rights for remaining copied material.
Acceptance: no active consumer references a removed file, and current inventory tells the truth about shipped versus development-only material.

### Slice 4: CI and trusted qualification

Replace separate Markdown install steps in CI/release Markdown lanes with existing normal root acquisition.
Keep full authored Markdown checks, probe ordering, required jobs and runtime ownership.
The source_json lane's intentional lack of isolated Markdown installation is not a failure.
Update workflow-governance producers and mutation tests in the same slice.
Trace concrete receipt readers and required-check contexts before retaining the manual route.
Ordinary Markdown checks in existing CI/release lanes remain authoritative for repository documentation.
Recommend retiring the manual caller and archive-only governance checks if no receipt consumer exists.
Preserve existing required CI contexts, scope and strictness while removing that ceremony.
The reusable workflow pin is immutable executable trust, separate from dependency distribution.
Current caller uses fa1188a867b29bddd0b972a080b7fcd0261bdec3 with trusted-sha/candidate-sha.
A compatible current workflow uses trusted-commit-id/candidate-commit-id.
Only if a concrete reader requires this route, record a compatible exact reviewed pin and update caller/profile/guards together.
Preserve candidate-as-data, read-only permissions, no inherited secrets and immutable accepted trust inputs.
Do not turn an ordinary installed check into a trusted qualification receipt.
Manual workflows added only on a feature branch are not automatically dispatchable until default-branch registration.
Use an existing registered entry if hosted proof is needed.
Acceptance: complete root checks remain authoritative; any actually required trusted receipt remains separately attributable.

### Slice 5: cleanup, documentation and review

Delete the isolated manifest, lock, three tarballs and active release-manifest coupling after reader migration.
Remove obsolete install command, archive-only wrappers/tests and any discovered registryUpgradeTarget metadata.
Do not invent that metadata where absent.
Update maintained npm-script/setup guidance to root npm ci and explicit write/dry-run examples.
Keep historical docs/plans, qualification oracles and original evidence unchanged.
Run one consolidated Review Agent across the final frozen patch, then ask only narrow repaired questions.
Use minimal HISEW bookkeeping and existing evidence; no duplicate dossier.
Acceptance: final diff contains only coherent migration and necessary current-documentation changes.

## Verification selectors for implementation

Run only after implementation is authorized; these were not executed during planning.

- `npm run test:markdown`: installed CLI/SDK, selection, logical bytes, links and resource semantics; remove the departed KaTeX-only operand after its owner audit.
- `npm test -- --runInBand --runTestsByPath scripts/development-dependency-policy.test.js scripts/workflow-governance.test.js scripts/dependency-graph.test.js`: runtime/governance/graph changes.
- `npm test -- --runInBand --runTestsByPath util/generate-third-party-material.test.js util/third-party-evidence/markdown-json-documents.test.js`: only retained paths after supplier disposition; remove departed selector explicitly.
- `npm run test:json`: changed archive provider, physical/logical scope and original-byte preservation.
- `npm run graph:dependencies` and `npm run verify:architecture`: real installed dependency graph and containment.
- `npm run verify:workflow-governance`: closed jobs, trusted caller and acquisition/check order.
- `npm run --silent inspect:markdown` and `npm run check:markdown`: complete intended root selection and actual check verdict.
- Resolve focused named tests again after edits; do not invoke a stale deleted test path as success evidence.

Installed public CLI fixtures must prove check, dry-run zero writes, explicit write and subsequent check.
Include missing/both repair modes, malformed input, missing targets, strict refusal and no unintended writes.
Capture stdout/stderr independently; test JSON completeness, human stderr, quiet failures and inert help/version.
Hash fixture trees before and after no-write operations.
Cover literal bracket/space/leading-option-like names after --, empty explicit lists and nested cwd.
Exercise Windows x64 and Linux x64 native loading from the same frozen root lock.
A source schema check or mocked native path is insufficient native acceptance.
When dependency-cruiser reports `../../ajv` or undetermined edges from a hoisted layout, distinguish bare package edges from local inputs.
Fix resolution/edge classification at its owner; never relax containment or blanket-ignore unresolved dependencies.

Do not run whole-repository/security/external campaigns merely because this is a dependency migration.
If complete Markdown checking finds unrelated content defects, report exact failures and scope separately.
No preview, selected success or repair result may be presented as full check acceptance.

## Open decisions, rollback and completion

1. Minimal exclusions: recommend a sparse schema-3 scope file only for proven generated/upstream/frozen evidence boundaries; remove every redundant default.
2. Manual qualification: recommend retiring archive-only ceremony when repository Markdown checking is its sole purpose.
   If a concrete receipt reader is found, name its producer/readers and narrow contract work; use existing producer material ownership without persisted consumer archives or an acquisition adapter.
3. Archived author evidence: recommend preserving the exact existing author-value oracle under its current provenance owner, then retiring only the active Markdown archive supplier.
   If no retained independent source exists, make that evidence disposition explicit before deleting its sole copy.
4. Local qualify:markdown: recommend retire the obsolete consumer-token script unless the complete immutable invocation has a real owner; document the actual retained checking route.
5. Product version: recommend no independent OwlAPI SemVer bump for this development-tool migration.
   Any changed published exports/runtime/files would require a separate compatibility decision.

These are bounded implementation choices, not requests for 3.0 availability or upstream publication approval.
No further question is needed to finish this planning task.

Rollback is a coherent reversal of the migration patch and its root lock, not a permanent fallback.
Preserve unrelated work and do not reset or restore user edits.
Keep historical receipts with their original graph identities; new graph evidence cannot overwrite them.
Completion requires correct active file ownership, minimal policy, root lock installation, real native/CLI proof, scoped checks and one consolidated review.
This plan records repository/installed-contract inspection and separately attributed JSON Quality proof; it makes no claim that OwlAPI implementation checks passed.
