# OwlAPI dependency-cruiser implementation plan

Date: 12 October 2026.
Status: **DRAFT for review; implementation has not started.**

Target: `C:/Users/maksy/GitHub/owlapi`.
Requested planning artifact: `G:/My Drive/Hadden Industries/owlapi/2026-10-12-dependency-cruiser-implementation-plan.md`.

The user selected **`dependency-cruiser >=18.6.0`** as the proposed dependency floor.
The root lockfile must retain the exact reviewed resolution.
This decision does not authorize installation, configuration edits, implementation, publication, or replacement of an existing HISEW execution.

## 1. Recommended outcome and admission boundary

Adopt dependency-cruiser first for reproducible JavaScript dependency graphs and well-founded architecture checks.
OwlAPI already uses Jest.
Evaluate its native related-test selection before adding an execution coordinator or historical graph machinery.
Retain the graph and architecture work even if selective testing fails its correctness or cost gates.

The first useful delivery is a graph bundle covering the authored JavaScript inventory, with a separate view of the actual shipped package, and an architecture check that preserves the existing isolation and lexical invariants.
The later, conditional delivery is an opt-in local test aid whose result explicitly identifies its assurance scope.
Neither delivery silently reduces required CI, release qualification, browser qualification, installed consumer qualification, or the current HISEW verification profiles.

This document proposes a **DRAFT R2 route** because a selector can create false confidence by omitting a failing test, and replacing an architecture check can weaken a repository boundary.
The graph-only portion has a smaller operational surface, but the combined proposal should be reviewed against the larger risk.
The route, REQ/AC dossier, QA scenarios, architecture rules, numerical activation thresholds, and implementation owner still require acceptance before managed implementation.
They are not accepted engine records.

The HISEW planning skill requires an accepted design and identified acceptance evidence.
This plan supplies a reviewable draft dossier and identifies its admission decisions; it does not fabricate acceptance or mutate workflow state.
The relevant method is [the installed planning skill](C:/Users/maksy/.codex/plugins/cache/hadden-industries/hisew-dev/0.1.0-dev.21/skills/hadden-industries-plan-software-change/SKILL.md), with [engine invocation](C:/Users/maksy/.codex/plugins/cache/hadden-industries/hisew-dev/0.1.0-dev.21/method/engine-invocation.md) and [engineering principles](C:/Users/maksy/.codex/plugins/cache/hadden-industries/hisew-dev/0.1.0-dev.21/method/engineering-principles.md).

No implementation work is authorized by the existence of this document.
The explicit configuration-safety instruction requires approval of the exact file and setting, including its behavioral and pipeline impact.
Section 10 makes the proposed changes concrete for that later decision.

## 2. Source-of-truth baseline

The baseline was inspected read-only on 12 October 2026.
The final pre-draft status check at `2026-10-12T15:47:56Z` was clean.
Re-resolve these identities before implementation; a changed checkout, package contract, workflow, tool version, or owner invalidates assumptions rather than permitting a silent rebase of the plan.

| Item                               | Observed baseline                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Repository and branch              | `C:/Users/maksy/GitHub/owlapi`, `main`                                                                       |
| HEAD                               | `64f9713c23611a430cd428df8f4ad29681542b84`                                                                   |
| Tree                               | `f6897517f5bced9dea8f127d0d4bede6137891d2`                                                                   |
| Ordered parents                    | `e8359ede94a3ce78ee76c26edc357f1ed267e621`, `1e25f1a75d82283be65c072dac1733a478016021`                       |
| Local and remote main              | Local `origin/main` and read-only remote lookup both matched HEAD; no fetch or branch mutation was performed |
| Dirty scope                        | No tracked, staged, or untracked changes reported at inspection                                              |
| Package                            | `@hadden-industries/owlapi` `0.1.0-rc.2`; native ESM; `sideEffects: false`; AGPL-3.0-only                    |
| Existing dependency-cruiser        | Absent from root manifest, root lockfile, and installed root dependencies                                    |
| Existing Jest                      | Declared `>=30.5.2`; installed and root-lock resolution `30.5.2`                                             |
| Root package SHA-256               | `91734547B4958780FA8D4B13D20E562C3E6017661950581F14AED9AD374B39BA`                                           |
| Root lock SHA-256                  | `65B4F25E0ED9C76791FEB20BF61F5B36F3A5ABBE1E4A624F5E6F4B9672AA2418`                                           |
| Existing architecture test SHA-256 | `6879874F00D1015CD390C2B3EA0607719EB0C5C388718CFAEF8F35216C921420`                                           |

The source links below are pinned to this commit unless explicitly identified as evolving external sources.
Start with [package.json](https://github.com/Hadden-Industries/owlapi/blob/64f9713c23611a430cd428df8f4ad29681542b84/package.json), [CONTRIBUTING.md](https://github.com/Hadden-Industries/owlapi/blob/64f9713c23611a430cd428df8f4ad29681542b84/CONTRIBUTING.md), [coreIsolation.architecture.test.js](https://github.com/Hadden-Industries/owlapi/blob/64f9713c23611a430cd428df8f4ad29681542b84/coreIsolation.architecture.test.js), and [the root lockfile](https://github.com/Hadden-Industries/owlapi/blob/64f9713c23611a430cd428df8f4ad29681542b84/package-lock.json).

No applicable ancestor/root `AGENTS.md` or tracked nested `AGENTS.md`/`CLAUDE.md` was located in the inspected OwlAPI checkout.
The explicit instructions supplied by the user still apply.
OwlAPI has no `docs/development.md`; its own contribution and tooling documentation are the repository-specific source.
Preserve unrelated changes if this clean baseline changes.
The current shell's Universal Ontology directory is not the implementation target.

### Runtime, dependencies, and package boundary

The repository's canonical toolchain is Node `24.21.0`, npm `12.2.0`, and project Python `3.15.0`.
Its advertised Node floors are `22.23.3`, `24.21.0`, and `26.11.1`.
Development dependencies use stable `>=x.y.z` floors plus an exact lock.
Preserve the versionless `devEngines.runtime`, npm minimum, and absence of a `packageManager` field.
Do not refresh the separately archived Markdown toolchain while changing the root lock.

The package has eight production dependencies and 21 development dependencies at this baseline.
[The dependency policy test](https://github.com/Hadden-Industries/owlapi/blob/64f9713c23611a430cd428df8f4ad29681542b84/scripts/development-dependency-policy.test.js) asserts the development count as well as minimum-range and lock consistency.
Adding dependency-cruiser will require a deliberate update of the expected inventory/count to 22 while retaining those guarantees.
Removing the assertion or weakening the floor policy is not the proposed fix.

Public exports are the root plus `apibinding`, `model`, `io`, `formats`, `profiles`, `util`, `model/parameters`, `search`, `manchestersyntax/renderer`, and `modularity/locality`.
The admitted package also includes implementation files under `internal`.
Public API does not mean that every shipped module is a public export.
Package self-references and blocked private subpaths are exercised by [the native Node boundary tests](https://github.com/Hadden-Industries/owlapi/blob/64f9713c23611a430cd428df8f4ad29681542b84/test/package-boundary.test.mjs).

The `util` directory mixes shipped runtime code and substantial developer tooling.
Only these runtime paths are admitted there by the current manifest: `index.js`, `owlOntologyImportsClosureSetProvider.js`, `owlOntologyMerger.js`, `owlObjectDuplicator.js`, `owlEntityRenamer.js`, `owlEntityRemover.js`, `simpleShortFormProvider.js`, and `annotationValueShortFormProvider.js`.
Do not label all of `util/**` as production.
Do not manually duplicate this list in implementation: native package inventory and existing package-identity owners must supply it.

An exploratory tracked-file inventory found 4,310 paths and 544 JavaScript-family source/control candidates after excluding archived provenance/upstream/runtime domains.
There were 239 test-named paths in that inventory.
**These are filename counts, not Jest discovery, executed test counts, or proof of graph completeness.**
No native discovery, graph extraction, test suite, or timing experiment was run for this plan.

### Current orchestration and assurance inventory

| Control                          | Current authority and scope                                                                                                                                | Consequence for this change                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Jest                             | `npm test` supplies `NODE_OPTIONS="--experimental-vm-modules --disable-warning=ExperimentalWarning"` through `cross-env`; Jest environment is Node         | Reuse this launch and effective configuration. Preserve qualified `--runInBand` behavior; do not import WebVOWL's worker settings |
| Jest discovery                   | Root package configuration ignores `.release`, `.venv`, `.development-tools`, installed OWL contract consumers, and the native boundary file as applicable | Ask Jest for the actual test inventory. Do not discover tests through a copied glob or file suffix rule                           |
| Package boundary                 | `npm run test:boundary` uses `node --test test/package-boundary.test.mjs`                                                                                  | A related Jest run cannot replace this obligation                                                                                 |
| Markdown probes                  | `npm run test:markdown` runs two Node test probe files                                                                                                     | A JavaScript import graph does not cover document/configuration behavior by itself                                                |
| Browser qualification            | Prepared candidate, explicit fixture root, Playwright Chromium/Firefox/WebKit, one worker and no retries                                                   | Retain its dedicated fixture and installed-browser prerequisites and result scope                                                 |
| OWL contract qualification       | `npm run test:owl-contract` builds/installs and verifies the candidate consumer contract                                                                   | Installation/network/output side effects require the existing qualification procedure                                             |
| Universal Ontology qualification | `npm run test:universal-ontology` uses the installed consumer flow                                                                                         | Do not replace it with a source-import approximation or modify the consumer repository                                            |
| Java/conformance oracles         | Native wrappers and fixed fixtures, with environment-dependent live-oracle prerequisites                                                                   | A skipped live oracle is not a completed qualification                                                                            |
| Repository quality               | Tool-version, formatting, lint/Markdown, governance, release-gate, and workflow controls                                                                   | Keep each owner and command; do not create a second interpretation in the selector                                                |
| Hosted qualification             | Existing source, portability, browser, consumer, metadata, dependency-review, and required-job aggregation                                                 | Local focused evidence cannot satisfy or remove these jobs                                                                        |

The current Jest configuration has neither WebVOWL's `maxWorkers: 2` policy nor its `transform: {}` entry.
It includes `modulePathIgnorePatterns`.
Copying WebVOWL's configuration allowlist could reject valid OwlAPI configuration; copying its values could change OwlAPI behavior.

### HISEW inspection and ownership

Read-only inspection found an active personal workflow and admitted OwlAPI worktree, with installed method `0.1.0-dev.21` and engine `0.1.0.dev21`.
Project ID is `f6ded748-f3c0-41f4-8e89-def537c290f4`; worktree ID is `6f8858af-3ef0-44bd-a5c8-a57b2f25d410`.
No risk route was selected for this proposal.
A separate handed-off execution remains associated with the worktree; this plan did not adopt, resume, edit, or replace it.

Resolved storage is configuration `C:/Users/maksy/.hi/w/c`, evidence `C:/Users/maksy/.hi/w/e`, and operator namespace `C:/Users/maksy/.hi/w/e/operator`.
No default temporary root was supplied.
Future supplemental evidence must use a newly allocated, owner-bound location under the current resolved storage contract.
Do not fall back to `.sdlc/runtime` or `.sdlc/tmp`.
This user-selected G: document is a planning artifact, not a native verification receipt.

| Profile    | Observed invocations, in order                                                                                                                                                         | Limits of the claim                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `focused`  | Boundary tests (120 s); Jest `--runInBand --runTestsByPath governance.test.js io/io.test.js` (180 s)                                                                                   | Fixed focused scope                                                            |
| `affected` | Lint (180 s); boundary (120 s); Jest `--runInBand governance.test.js io/ model/ internal/model/ internal/storage/ test/import-closure/ test/consumers/webvowl/cutover.test.js` (300 s) | Historical fixed selection; no declared-change input contract                  |
| `full`     | Lint (180 s), format check (180 s), release gates (120 s), workflow governance (120 s), boundary (120 s), Jest `--runInBand --silent` (600 s)                                          | Full configured source profile; no browser or installed-consumer qualification |

The profile paths/order are owner declarations, not proof that any invocation ran in this planning task. The installed npm executor uses literal configured script/argument arrays.
No supported typed base/change-set/evidence interface was established by this inspection.
[HISEW issue #150](https://github.com/Hadden-Industries/software-engineering-workflow/issues/150), open and last updated `2026-10-11T00:25:36Z` at inspection, proposes that capability.
It is an external dependency for a later native profile integration, not a reason to block graph adoption or to pass an environment-variable shim as an accepted interface.

### CI and immutable evidence boundaries

The current [qualification policy](https://github.com/Hadden-Industries/owlapi/blob/64f9713c23611a430cd428df8f4ad29681542b84/scripts/ci-qualification.mjs) is version 5, `FULL_ONLY`, with selective execution disabled and external-input equivalence unproven.
[Check applicability](https://github.com/Hadden-Industries/owlapi/blob/64f9713c23611a430cd428df8f4ad29681542b84/scripts/ci-check-applicability.mjs) remains observational; final checks are required.
Its narrow historical narrative exclusions do not authorize skipping changed Markdown or configuration here.

Preserve the closed required-job inventory: verification, metadata, Ubuntu source Node 22/24/26, Windows quality, dependency review, candidate production, Windows and macOS portability Node 22/24/26, Ubuntu portability Node 26, browser Chromium/Firefox/WebKit, OWL contract, and required aggregation.
Preserve independent CodeQL policy.
Root dependency/lock changes continue through the existing diff-based dependency-review path.
Do not make its operation depend on an application install or on selector success.

Preserve [the release consumer pin manifest](https://github.com/Hadden-Industries/owlapi/blob/64f9713c23611a430cd428df8f4ad29681542b84/docs/release/owl-contract-sources.json), its hashed source inventory, provenance/history artifacts, source compatibility records, and upstream fixtures.
Do not update WebVOWL or Universal Ontology pins as a side effect of adding developer tooling.
Source, local verification, hosted job evidence, merge evidence, installed consumer evidence, and release evidence remain distinct claims.

## 3. Architecture findings that constrain the design

The current architecture test scans non-test `.js` files in `apibinding`, `formats`, `internal`, `io`, `model`, and root `index.js`.
Its dependency check regex extracts relative import/require forms and rejects paths escaping the repository.
A separate text check rejects VOWL terminology, including occurrences in comments or strings.
These are two different invariants.

Its comment claims alignment with the manifest, but its manually enumerated roots omit shipped `profiles`, `search`, `manchestersyntax`, `modularity/locality`, and runtime `util` files.
Replacement must close that inventory gap rather than preserve it accidentally.
The lexical/domain check remains an independent check over the admitted runtime inventory; a dependency graph cannot replace it.
Negative fixtures must prove both checks still fail for their respective violations.

Repository containment is the existing invariant.
**Package shipping closure is a distinct proposed invariant:** a shipped runtime module must not acquire a first-party import on an unshipped test/tooling file, even when that file is inside the repository.
A related proposed guard rejects runtime imports of packages available only through `devDependencies`.
These checks address real packaging failure classes without banning intentional public-to-internal runtime imports.
Their error-level activation is DEC-011: baseline native resolution and package inventory first, then accept exact predicates and negative fixtures.
No existing violation or successful baseline is claimed here.

| Actual seam                      | Observed relationship                                                                                                     | Proposed treatment                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Public facade and internal model | Public model implementations legitimately use `internal/model` and storage/loading helpers                                | Show the relationship; do not ban public-to-internal imports categorically                                            |
| Ontology manager and parsing     | `model/owlOntologyManager.js` coordinates parser descriptors, registry, RDF preparation, formats, IO, and loading helpers | Expect substantial fan-out; measure selection benefit before promising savings                                        |
| Serialization                    | Storer registries and implementations use model, formats, and output targets                                              | Preserve the existing coordination seam; no layering refactor is included                                             |
| Profiles                         | Profile checking uses model snapshots, source evidence, and datatype/XML-related helpers                                  | Do not impose an invented model/parser/profile hierarchy                                                              |
| XML browser adapter              | `internal/parsing/xml/xmlParserAdapter.js` prefers global DOMParser and otherwise dynamically imports `@xmldom/xmldom`    | A literal import edge is useful; browser behavior still needs browser qualification                                   |
| Worker/generated code            | XML signature tests pass module URLs into an evaluated worker program; direct top-level imports also exist today          | Verify the indirect relation as an adversarial fixture without falsely claiming the current source has no direct edge |
| Runtime resources and consumers  | Fixture/manifests/source readers, Java subprocesses, candidate installs, and self-reference imports                       | Classify these explicitly; native import reachability is insufficient assurance                                       |

Use [the manager source](https://github.com/Hadden-Industries/owlapi/blob/64f9713c23611a430cd428df8f4ad29681542b84/model/owlOntologyManager.js), [the XML adapter](https://github.com/Hadden-Industries/owlapi/blob/64f9713c23611a430cd428df8f4ad29681542b84/internal/parsing/xml/xmlParserAdapter.js), and [the worker-bearing test](https://github.com/Hadden-Industries/owlapi/blob/64f9713c23611a430cd428df8f4ad29681542b84/internal/parsing/xmlOntologySignature.test.js) as concrete review cases.
The empty `seams` array in `docs/compatibility/dependency-seams.json` is not authority to populate that compatibility registry with selector policy.

No graph was generated during planning, so there is no justified cycle count, orphan count, graph coverage percentage, or proposed list of cycle exemptions.
Report cycles initially.
Only introduce an error-level cycle or layering rule after reviewing the actual baseline, identifying the architectural reason, and accepting scoped exceptions with owners and removal conditions.

## 4. Reuse research and reference learnings

### dependency-cruiser and native alternatives

On 12 October 2026, the npm registry's `latest` endpoint and the upstream release page identified `18.6.0`, released on 11 October 2026.
Its declared engine range is `^22 || ^24 || >=26`, which includes OwlAPI's three advertised Node floors.
Its license is MIT.
This verifies the direct package metadata, not every transitive package, platform, or repository license-policy result.
The install/lock review must establish those remaining facts. Sources: [exact registry metadata](https://registry.npmjs.org/dependency-cruiser/18.6.0), [18.6.0 release](https://github.com/sverweij/dependency-cruiser/releases/tag/v18.6.0), and [tagged license](https://github.com/sverweij/dependency-cruiser/blob/v18.6.0/LICENSE).

Registry tarball integrity at inspection was `sha512-It7NW5AmCDBCLMq7I91Nfu8VRKzrIE6S+M/FMQzALDceJ0B1PWRHo77q9YJg/HwyBBEWHVtOuTptIQki+xecOw==`.
Record the actual approved lock resolution and integrity again during implementation.
A `>=18.6.0` floor permits later versions; it is not advance approval of an unreviewed future lock or major-version API change.

The reference repositories used 18.5.0.
The 18.6.0 release includes Svelte parsing and dependency/security-documentation changes; OwlAPI is not a Svelte adoption case. For wrapper design, the inspected 18.6.0 contract matters more than the historical reference pin: `cruise` is asynchronous, accepts explicit input files and options, supports separate resolver options, and public `format` validates a native cruise result before reporting. Use those documented exports, native rule validation, and native reporters. Do not import private implementation functions or copy its parser/schema.
Sources: [tagged API](https://github.com/sverweij/dependency-cruiser/blob/v18.6.0/doc/api.md), [tagged public format implementation](https://github.com/sverweij/dependency-cruiser/blob/v18.6.0/src/main/format.mjs), and [tagged CLI](https://github.com/sverweij/dependency-cruiser/blob/v18.6.0/doc/cli.md).

| Reuse choice                                                                                 | Useful capability                                                                         | OwlAPI limitation or cost                                                                                                                                         | Decision                                                                                   |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Existing Jest `--findRelatedTests`                                                           | Native related-test discovery for explicit changed files using the actual runner resolver | Static dependencies do not establish resource/process/generated-code relations; current-tree discovery alone does not prove deleted historical edges              | First selector experiment; no runner migration                                             |
| Existing Jest `--onlyChanged` / `--changedSince`                                             | Native SCM-aware conveniences                                                             | Their native comparison semantics must match the requested assurance claim; absence of selected tests can produce a successful command without relevant execution | Compare behavior, preserve as explicitly scoped convenience, do not infer an accepted base |
| dependency-cruiser graph/rules/reporters                                                     | Explain import relationships, validate architecture, produce JSON and native visual views | Another static resolver; Node conditions differ from browser packaging; graph cost may exceed saved test time                                                     | Adopt for architecture and transparency                                                    |
| dependency-cruiser native `--affected` / `reaches`                                           | Native change/impact features and reverse reachability                                    | A CLI change mode is not a complete policy for arbitrary assets, dirty inputs, historical package metadata, or full-product obligations                           | Test before composing extra graph logic; use native reachability if extension is justified |
| Native old/current graph composition                                                         | Can retain a removed edge in an explicitly identified baseline                            | Requires historical input identity, snapshot resolution, resource policy, and more bounded machinery                                                              | Separately accepted conditional extension, never a first-delivery prerequisite             |
| Nx or another project/task orchestrator                                                      | Mature project/task dependency scheduling                                                 | OwlAPI is one library with established qualification owners; adopting an orchestration platform is a larger change than the demonstrated need                     | Do not adopt without a separate benefit case                                               |
| New regex parser, custom import resolver, copied Jest discovery, custom dependency traversal | Superficially small initial implementation                                                | Duplicates evolving semantics and raises false-negative/maintenance risk                                                                                          | Reject                                                                                     |

Jest documents `--findRelatedTests`, `--listTests`, `--runTestsByPath`, and SCM modes.
Its `--onlyChanged` documentation explicitly relies on a static dependency graph.
Use native JSON discovery and exact-file execution, and retain the existing ESM launch.
`--collectTests` evaluates test modules and is not a harmless replacement for listing.
Sources: [Jest CLI](https://jestjs.io/docs/cli) and [Jest ESM guidance](https://jestjs.io/docs/ecmascript-modules).
[Nx affected](https://nx.dev/docs/features/ci-features/affected) was considered as a project/task alternative, not selected.

### Reference provenance

Both supplied plans and both implementation chats were read in full, including later corrections.
Their instructions are historical evidence, not current authorization.
The current delivered tooling was compared with the pinned delivered revisions below; success statements in a chat were not treated as fresh OwlAPI test results.

| Reference                       | Exact inspected source and identity                                                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown Quality plan           | [Local source](C:/Users/maksy/GitHub/markdown-quality/docs/plans/2026-10-10-markdown-quality-dependency-cruiser-implementation-plan.md); SHA-256 `EEE5757C1BFE6ED3FBA64AE104EB7A64D90991605F8FA6A58D39F8F0E9AAEAB1` |
| Markdown Quality implementation | [Chat](codex://threads/01a126ab-50e7-7d63-bcdd-ceca1facb35f); delivered revision `0fac1db72856c7579625562c4a145f0801b2fb80`; inspected current HEAD `482126f52802e1479c00caf1c9fdf9ad7d856aa9`                      |
| WebVOWL plan                    | [Local source](C:/Users/maksy/GitHub/webvowl/docs/plans/2026-10-11-dependency-cruiser-integration-implementation-plan.md); SHA-256 `9F815C27FF9E29AE770C7562DB0CF13180C696AF88ADDE54FF46ED66CF956F40`               |
| WebVOWL implementation          | [Chat](codex://threads/01a127ca-1b01-7442-b9f7-929d68c611f0); delivered revision `6926af96efebd5c82e58e645730eb801b56fc14b`; inspected current HEAD `81083b510344141f35d2f8551132a0266ad70103`                      |

Selected Markdown Quality graph/selection/outcome source files matched its delivered revision; its usage document had a later small documentation change.
Selected WebVOWL graph/selection/process/policy/documentation files matched its delivered revision.
Seven unrelated dirty WebVOWL UI files were observed and left untouched.
These checks establish which implementation was inspected, not that its tests were rerun here.

| Learning                                   | Historical proposal versus delivered evidence                                                                                                                                | OwlAPI application                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Native graph authority                     | Both delivered graph owners use dependency-cruiser and separately identify authored roots, external edges, and views                                                         | Reuse APIs and bundle concepts; include disconnected authored roots and the full shipped surface                                           |
| Selection needs more than imports          | Worker, VM/source-reader, generated-program, and resource relations required explicit treatment; WebVOWL review found a missed source-reader relation and added a regression | Use conservative obligations first; require seeded failures for each admitted exceptional relation                                         |
| Runner ownership matters                   | Markdown Quality is a Node test runner implementation; WebVOWL uses Jest discovery and native outcomes                                                                       | Adopt Jest's contract for OwlAPI; do not copy the Node reporter or private discovery rules                                                 |
| Configuration is repository-specific       | WebVOWL preserved its worker/ESM policies and corrected its own build-only HISEW full profile to `check`                                                                     | Preserve OwlAPI's existing source-full profile; no copied profile correction or worker setting                                             |
| Snapshots can resolve the wrong package    | WebVOWL resolved each historical `vowl` package from its own metadata and avoided current installed workspace leakage                                                        | A conditional OwlAPI historical extension must do the same for self-reference exports, without executing old configuration                 |
| Scope capture can dominate cost            | WebVOWL refined broad baseline capture into bounded Git blob reads                                                                                                           | Do not copy or hash OwlAPI's large archived provenance domain on every focused analysis; declare and bind the actual input domain          |
| Outcomes require multiplicity              | Delivered Jest handling distinguishes suite/test failures, skips/todos, and duplicate assertion names                                                                        | Compare native outcomes as multisets with stable file identity; never reduce them to a set of display names                                |
| Process cleanup is an activation condition | Markdown Quality's Windows taskkill approach does not itself prove birth identity/quiescence; WebVOWL delivered a Windows Job Object and Linux subreaper/pidfd path          | Do not copy a weak cleanup claim or automatically import a new supervisor; require a supported, proved execution owner or remain list-only |
| Windows path identity is observable        | WebVOWL's final correction canonicalized short-path temporary aliases after a real No-tests-found failure                                                                    | Cover long/short aliases, case, spaces, symlinks/junctions and canonical containment on the actual host                                    |
| Shadow must be truthful                    | Delivered WebVOWL avoids claiming independent comparison when conservative full mode uses one execution                                                                      | Report one full run with no comparison; do not run a duplicate full suite to manufacture shadow evidence                                   |
| Report version is not producer identity    | Both references use `schemaVersion: 1` with different structures; issue #150 records separate adapters                                                                       | Give OwlAPI reports an explicit producer and report kind; no generic schema-version trust                                                  |
| Security fixes can change the final design | Markdown Quality removed a generated-command pattern after CodeQL feedback; the later delivered revision differs from earlier discussion                                     | Structured argv and data files, no shell-built command strings; verify the delivered reference, not an early justification                 |

Concrete delivered sources: [Markdown Quality graph owner](https://github.com/Hadden-Industries/markdown-quality/blob/0fac1db72856c7579625562c4a145f0801b2fb80/scripts/dependency-graph.js), [selection owner](https://github.com/Hadden-Industries/markdown-quality/blob/0fac1db72856c7579625562c4a145f0801b2fb80/scripts/affected-tests.js), [WebVOWL graph owner](https://github.com/Hadden-Industries/webvowl/blob/6926af96efebd5c82e58e645730eb801b56fc14b/util/dependency-graph.mjs), [Jest execution owner](https://github.com/Hadden-Industries/webvowl/blob/6926af96efebd5c82e58e645730eb801b56fc14b/util/jest-execution.mjs), and [native process helper](https://github.com/Hadden-Industries/webvowl/blob/6926af96efebd5c82e58e645730eb801b56fc14b/util/jest-process.py).

Historical measurements in the reference chats showed useful savings for some isolated changes and substantial selection overhead.
Those are motivation for an OwlAPI experiment, not a transferable benchmark or an OwlAPI performance promise.

## 5. Draft requirements, acceptance criteria, and decisions

The integration owner is the future **OwlAPI change owner**, responsible for package contracts, graph policy, the test-aid boundary, and evidence handoff.
Name that person/session and obtain execution ownership at admission. A reviewer must independently challenge omitted-test and architecture-negative cases. HISEW maintainers own issue #150; browser/consumer/release owners retain their existing obligations.
This plan assigns responsibilities without appointing another chat or adopting its execution.

| Requirement                                    | Draft acceptance criterion and oracle                                                                                                                                                                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 Reproducible architecture artifact     | AC-001: every admitted authored input, including a disconnected module, is present or explicitly excluded with reason; native JSON validates; identical input/tool/policy identities give semantically identical sorted graph content                             |
| REQ-002 Preserve and improve runtime isolation | AC-002: all shipped JS is covered; repository-escape and unresolved-runtime negatives fail; VOWL text negatives fail independently; DEC-011 settles and proves the new shipping-closure/dev-only guards; legal shipped internals and production dependencies pass |
| REQ-003 Prefer mature native capabilities      | AC-003: compare Jest native modes and dependency-cruiser native impact against an independent oracle before adding an adapter; no duplicated parser/resolver/Jest discovery                                                                                       |
| REQ-004 Avoid omitted relevant failures        | AC-004: zero omitted failing tests in the accepted adversarial corpus and shadow corpus; unknown relation/input/base/configuration yields full obligation or explicit inability, never selective success                                                          |
| REQ-005 Preserve assurance scope               | AC-005: boundary, Node probes, browser, consumers, source/full/hosted/release obligations remain identifiable and unchanged unless separately accepted; required CI inventory remains intact                                                                      |
| REQ-006 Bound execution and preserve state     | AC-006: no changes to tracked inputs, no overwritten outputs, no surviving owned descendants after supported cancellation; partial results cannot become completed evidence                                                                                       |
| REQ-007 Demonstrate economic value             | AC-007: end-to-end timings pass the owner-accepted thresholds in section 13; graph-only/list-only is a successful outcome if execution selection fails this criterion                                                                                             |
| REQ-008 Trace evidence and recover safely      | AC-008: reports bind candidate/base, dirty input scope, policy/tool versions, exact invocation, output identities, and scope; recovery leaves existing work and evidence intact                                                                                   |
| REQ-009 Preserve package/tooling policy        | AC-009: reviewed `>=18.6.0` floor and exact lock pass dependency policy/security/license controls on supported runtimes; runtime exports/dependencies/pins remain unchanged                                                                                       |

| Decision                                       | Status and proposed disposition                                                                                                                                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-001 Version floor                          | **User-selected:** propose root devDependency `dependency-cruiser: >=18.6.0`; implementation/install still unapproved                                                                                                                  |
| DEC-002 Delivery order                         | DRAFT: architecture first; native-Jest experiment next; graph-only completion permitted                                                                                                                                                |
| DEC-003 Architecture policy                    | DRAFT: preserve escape and lexical invariants, expand shipped inventory, unresolved runtime dependencies error, cycles warning until justified                                                                                         |
| DEC-004 Input contract                         | DRAFT: separate hypothetical explicit-list analysis from authoritative verification; explicit base and complete admitted working-state union for verification                                                                          |
| DEC-005 Execution scope                        | DRAFT: local opt-in only; no change to npm test, required CI, release qualification, or HISEW profiles in first delivery                                                                                                               |
| DEC-006 Conservative behavior                  | DRAFT: unknown/structural/runtime-resource/control changes require full scope; input failures remain visible; no empty-set success                                                                                                     |
| DEC-007 Conditional historical graph extension | DRAFT, deferred: accept only after native experiments demonstrate a consequential gap and sufficient benefit; separate ownership/cost/security review                                                                                  |
| DEC-008 Process and output contract            | DRAFT: reuse an adequate existing/native execution facility; unsupported descendant cleanup means advisory mode only; exclusive external output allocation                                                                             |
| DEC-009 Activation thresholds                  | DRAFT: adopt or revise section 13 thresholds before measurements; do not move thresholds after seeing results                                                                                                                          |
| DEC-010 HISEW migration                        | Deferred: evaluate issue #150 or another accepted native contract separately; do not repurpose current fixed affected profile implicitly                                                                                               |
| DEC-011 Package dependency closure             | DRAFT, baseline-first: propose error-level runtime-to-unshipped-first-party and runtime-to-dev-only dependency guards using native package inventory and dependency classifications; accept exact derived predicates only after QA-013 |

Acceptance must settle the route, owner, architecture rule scope, assurance obligations, empirical oracle, and configuration rows for the admitted slices.
Approval of graph slices does not imply approval of conditional selection or historical extension slices.

## 6. Graph and architecture design

### One inventory owner and native graph semantics

Create one graph owner in `scripts/dependency-graph.mjs`, outside the shipped runtime package.
It gathers explicit authored JavaScript-family roots, invokes the public dependency-cruiser API, validates native output, and derives views through native formatting/filter facilities.
Do not cruise only root `index.js`: that loses disconnected tools, tests, and public subpaths.
Do not scan installed dependency implementations, virtual environments, generated releases, archived upstream trees, or tool runtimes as authored roots.

Classify inventory roles separately: shipped runtime, Jest tests, native Node tests, browser consumers, tooling, and external/builtin dependencies. Use Jest's native discovery for the Jest role. Use package metadata and the existing package-identity owner for public surface. Use npm's native pack inventory to verify shipped-file membership, with lifecycle effects reviewed and disabled for an inventory-only dry run. Do not implement npm's `files`/ignore algorithm in new code.
Sources: [npm pack](https://docs.npmjs.com/cli/v12/commands/npm-pack/), [existing package identity owner](https://github.com/Hadden-Industries/owlapi/blob/64f9713c23611a430cd428df8f4ad29681542b84/scripts/package-identity.mjs), and [candidate builder](https://github.com/Hadden-Industries/owlapi/blob/64f9713c23611a430cd428df8f4ad29681542b84/scripts/build-release-candidate.mjs).

The initial extraction is a Node-oriented source graph under the actual ESM/package-export conditions.
Record resolver conditions and native package resolution.
Do not claim that this is the browser bundle graph or the installed candidate graph.
The DOMParser fallback and installed self-reference tests remain concrete cross-environment oracles.
A later browser-specific view needs its own demonstrated resolver contract and still does not replace browser execution.

Preserve literal dynamic imports and CommonJS edges where the tool recognizes them.
Label computed imports, generated programs, runtime reads, subprocess dependencies, and worker relations as outside proven static completeness.
Distinguish an edge absent from the graph from an assertion that no relation exists.

### Outputs and rule behavior

A caller requests a new external output directory.
The graph command reserves it exclusively, writes an incomplete bundle, validates all members, then publishes a completion manifest.
It refuses existing output targets and targets inside the checkout or through unsafe aliases.
No tracked graph snapshot, broad `.gitignore` exception, or mandatory Graphviz installation is proposed.

The bundle contains native `dependencies.json`, a native module-level Mermaid view, a native folder/architecture view, `inventory.json`, and `manifest.json`. The JSON graph is the evidence authority; rendered views may collapse detail only after full extraction. Metadata records omitted/external domains, cycle/unresolved counts, graph environment, inventory inputs, package/source identities, tool and policy hashes, producer identity, and completion status.
Emit actionable native violations without treating a view as a test result.

Keep extraction and architecture enforcement distinct.
The authored graph may contain deliberate negative-test imports; they must be visible rather than incorrectly treated as production defects.
`verify:architecture` evaluates the admitted runtime inventory and its reachable dependencies.
It rejects unresolved runtime edges and relative paths escaping the repository, while the separate lexical test rejects forbidden VOWL terminology.
External declared packages and builtins remain visible endpoints; they are not repository escapes merely because they are external dependencies.

For DEC-011, the same graph owner supplies native rules with literal, anchored path patterns derived from npm's current pack inventory.
The proposed shipping rule starts at admitted runtime JS, matches native `local`/`localmodule` edges, and forbids destinations absent from the complete native pack inventory. The proposed dev-only rule matches native `npm-dev` edges without a production/optional/peer/bundled classification.
No manually curated `test/**`/`scripts/**` denylist, second package classifier, or custom resolver is needed. The emitted effective rules and source inventory digest are part of the bundle. The native predicate contract is documented in [18.6.0 restrictions](https://github.com/sverweij/dependency-cruiser/blob/v18.6.0/types/restrictions.d.mts) and [dependency types](https://github.com/sverweij/dependency-cruiser/blob/v18.6.0/types/shared-types.d.mts).

Before accepting those predicates, demonstrate an import into an excluded test, an import into unshipped tooling, an ordinary shipped internal import, a package self-reference, a dev-only package import, and a legal production dependency.
Check path aliases and any differing native self-reference classification.
If the proposed native classification cannot express complete shipping closure, present the exact revised native-path policy or a documented deferred guard for owner decision; do not invent a resolver or quietly claim that repository containment proves packaging closure.
Runtime resource reads remain outside a static import-closure claim.

Initial native rule settings are specified in section 10.
Match paths after native normalization and prove the escape predicate with actual outside-root fixtures.
Do not let an `includeOnly`, early exclusion, truncated traversal, or view filter erase the offending edge.
If the native normalized representation differs across supported hosts, revise the proposed predicate and obtain approval before weakening a guard.
Cycle warnings do not create an exception baseline automatically.

## 7. Conditional native test selection

### First experiment: runner-owned selection

SLICE-003 compares native Jest discovery/related modes against controlled OwlAPI changes.
The output is a recommendation and measured evidence, not a new mandatory runner.
Use the same installed Jest, repository configuration, ESM flags, Node version, and effective execution settings as full execution.
Read effective Jest configuration through its supported interface.
Unsupported custom resolvers, transforms, configuration changes, or injected launch flags invalidate selective admission until explicitly supported.

Exercise `--findRelatedTests` with explicit source paths and native `--listTests --json`.
Compare `--onlyChanged` and `--changedSince` behavior for clean, dirty, staged, deleted, renamed, and diverged cases.
Their Git interpretation must be described as observed.
Do not reinterpret an arbitrary branch name as the approved base or accept an incidental intermediate implementation commit as a reset point.

For execution, intersect the admitted selected set with the current native Jest inventory and invoke exact files through `--runTestsByPath`, preserving serial/ESM controls.
Do not feed paths as regular expressions.
An empty or malformed inventory, unexpected selected path, process failure, or no-tests result is an explicit failed analysis or full fallback condition.
Do not use `--passWithNoTests` to turn missing evidence into a pass.

The selector is not permitted to conclude that non-Jest controls are unnecessary merely because the Jest set is small.
Its report lists the other obligations required by the declared changes and the intended assurance scope.

### Two explicit input meanings

| Mode                   | Input semantics                                                                                                                                                                               | Permitted claim                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Declared-list analysis | User-supplied literal repository paths; duplicates normalized; invalid/outside-root paths rejected; hypothetical files identified                                                             | Advisory explanation of declared files only; no claim to cover the worktree or qualify a patch |
| Verification/shadow    | Explicit accepted base identity plus committed changes since the selected comparison point, index changes, unstaged changes, and relevant untracked files; rename old/new identities retained | Evidence about that exact candidate and input union, only within the stated controls           |

The default changed-input policy for a proposed local coordinator is the conservative union.
Partial staging does not mean “test only the index” while executing a different working tree.
An index-only or commit-only mode would need isolated native execution of exactly that snapshot and separate acceptance.
An explicit file list may widen a verification union; it must not silently narrow it.

Bind both the requested base ref and resolved commit/tree.
Record any merge-base decision explicitly.
Missing objects, shallow history, ambiguity, a moved reference, incomplete untracked enumeration, or a changed input during discovery prevents selective execution.
Do not fetch or deepen history silently.
A safe full run can still establish current-tree scope if its own inputs are known; it cannot fabricate the missing historical comparison.

### Conservative obligation policy

| Change or condition                                                                                                    | Initial behavior                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Existing ordinary JS module with proved native relation and stable controls                                            | Eligible for the native experiment; selection still subject to gates                                               |
| Changed test file                                                                                                      | Include it through native discovery even if no production reverse edge exists                                      |
| Deleted/renamed/new module or removed import                                                                           | Full current Jest scope initially; preserve old/new change identities; consider extension only under DEC-007       |
| Package, root lock, Jest/ESM/resolver/tool-version configuration, graph/selector/policy code                           | Full source controls, boundary, and applicable dependency/governance obligations; selection does not verify itself |
| Fixture, snapshot, XML/RDF/ontology data, manifest, source-reader input, generated program, worker/process relation    | Full relevant domain plus full Jest when completeness is unproved; no blanket docs/assets exclusion                |
| Browser preparation/configuration/runtime adapter or installed consumer/release pins                                   | Retain browser/installed/release obligations in addition to source scope                                           |
| Markdown/tooling archives/workflow/provenance changes                                                                  | Invoke the existing owning controls; unknown effects widen scope rather than declaring no tests                    |
| Unsupported syntax/configuration, parser/resolver error, unresolved graph edge, stale/corrupt cache, absent dependency | Report the reason; use known full controls where feasible, otherwise fail with missing prerequisite                |
| Unknown path class or unsupported process platform                                                                     | Full/advisory mode; no selective pass                                                                              |
| No changes or no related tests                                                                                         | Report the actual condition and current scope; zero execution does not qualify a candidate                         |

The initial exceptional-relation policy should be small: documented broad fallbacks are preferable to an unproved fine-grained table.
Only admit a narrower resource/worker/source-reader relation after a fixture proves that a failing consumer would be selected and a reviewed owner accepts ongoing maintenance.

### Optional historical graph extension

DEC-007 is deliberately separate.
If native Jest misses a useful, measurable class that full fallback makes too costly, propose composing native current and baseline reachability rather than writing a graph walker.
Historical materialization must read bounded Git blobs without executing old code/configuration or installing old dependencies.
Resolve package self-references from each snapshot's own exports and metadata, not the current installed package.
Include removed edges and both sides of renames; use the union of proven candidate sets plus explicit current tests.

Validate native graph data with the tool's own supported validator/report path. Any ambiguity in resolver conditions, external package identity, snapshot capture, deleted test mapping, or input size falls back to full. Native `--affected` may cover some cases more simply; establish its exact 18.6 behavior before adding composition. The extension needs its own cost, resource, licensing/reuse, and attack-surface review.
It is neither necessary for graph delivery nor justified solely because both reference repositories built it.

## 8. Evidence, process ownership, and DRY boundaries

Reports need a producer such as `@hadden-industries/owlapi/dependency-analysis`, an explicit report kind, and a versioned OwlAPI contract.
A `schemaVersion: 1` field by itself cannot select an adapter.
Do not label these reports as accepted HISEW receipts.
Native Jest outputs and native dependency-cruiser outputs stay separate, with immutable references from the enclosing report.

Record at least: repository canonical root; HEAD/tree/ordered parents; requested and resolved base/comparison identity; status and changed-file union including rename identities; hashes of execution-affecting dirty/untracked inputs; graph inventory and exclusions; package/lock/policy/tool identities; resolver/configuration identity; selected/current full test inventories; fallback reasons; exact argv and permitted launch environment; start/end/result/cancellation state; native outcomes and output digests; timing phases; and explicit assurance obligations not executed.

Do not hash the entire provenance archive by default to create an expensive illusion of completeness.
Define the actual input domain and use immutable Git identities for committed content.
Bind dirty/untracked content that can affect admitted execution. Unknown readers widen the obligation; an unmeasured or excluded domain must be disclosed. Cache keys include tool/configuration/input identities; an unvalidated cache entry is not evidence.
Initial implementation should prefer no persistent cache until measured need exists.

Analysis must not import test modules or execute historical code.
Execution must launch native runners with structured argv, not shell strings or generated command programs.
Capture stdout/stderr separately with bounds and retain failures.
Preserve the actual ESM flags through any child boundary.
Reject unexpected execution-affecting ambient options or record and invalidate selective admission; do not silently invent an environment different from full execution.

Use an already adequate execution owner where one exists.
A successful top-level process exit, PID reuse check, or `taskkill /T` call is not sufficient proof that owned descendants have stopped.
If a new native helper is necessary, propose its exact files, runtime/prerequisites, supported OS behavior, cancellation proof, and limits separately. Python must use the repository `.venv`. Do not import private HISEW process internals or add a cross-platform supervisor as an incidental dependency. Until cleanup is demonstrated, ship graph/list functionality and let existing qualified commands own execution.

| Knowledge or decision                                              | Authoritative owner                                                      | New code's responsibility                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| JS parsing, resolution, cycles, reverse reachability, graph schema | dependency-cruiser public API and native validators                      | Supply trusted policy/inputs; validate and report; do not duplicate algorithms            |
| Jest tests, resolver/configuration, native outcomes                | Installed Jest public CLI/configuration                                  | Consume discovery and results; retain multiplicity, skips/todos and exact file identities |
| Public package identity and exports                                | Root manifest and `scripts/package-identity.mjs`                         | Read the authority; do not create a second export registry                                |
| Shipped package membership                                         | npm native pack inventory and current release artifact validation owners | Reuse the inventory contract; do not reimplement pack filtering                           |
| Lexical/domain isolation                                           | Existing architecture test                                               | Retain its distinct text oracle over the shared shipped inventory                         |
| Non-import impact exceptions                                       | Conditional `.test-impact.json`, with owner/rationale/fixture per rule   | Describe only relations/fallbacks absent from native graphs; avoid copying import edges   |
| Source/hosted/release qualification                                | Existing scripts, workflow policy, consumer pin manifest                 | List obligations and preserve enforcement; do not reinterpret their proof                 |
| Workflow admission and receipts                                    | HISEW installed public contract                                          | Integrate only after accepted typed support; never invent receipt compatibility           |

Sharing inventory and native results is intentional reuse.
Keeping browser/installed qualification and lexical invariants separate is also intentional: they cross different environment, trust, and failure boundaries.
A single “all passed” field would erase those distinctions.

## 9. Quality scenarios and adversarial proof

| Scenario                            | Stimulus and measurable expected response                                                                                              | Independent oracle                                                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-001 Complete graph inventory     | Add a disconnected authored module and a module in each previously omitted shipped directory                                           | Native inventory inclusion plus validated graph input/output accounting                                                                                                               |
| QA-002 Isolation preservation       | Add a relative escape, an unresolved runtime import, and forbidden VOWL text independently                                             | Existing lexical failure plus native architecture violation for each dependency case; accepted legal external imports remain valid                                                    |
| QA-003 Runner parity                | Compare actual Jest inventory/configuration, package self-reference, static/dynamic literal imports, and exact-file execution          | Installed native Jest discovery/full run; native boundary tests for exports                                                                                                           |
| QA-004 Structural Git changes       | Delete, rename, add, remove an import, diverge branches, use a shallow/missing base                                                    | Full fallback with exact reasons; optional extension must retain the old failing consumer                                                                                             |
| QA-005 Dirty candidate identity     | Stage one hunk, change another, add an untracked input, mutate a file during analysis                                                  | Complete union or explicit failure; reported identity equals executed candidate                                                                                                       |
| QA-006 Non-import relations         | Change a fixture, source-read file, worker URL/generated program, subprocess input, browser asset                                      | Seeded failing consumer selected or mandatory full-domain fallback; no false no-impact result                                                                                         |
| QA-007 Input/error handling         | Malformed native JSON, unresolved imports, unsupported syntax/config, stale cache, empty selection                                     | No selective success; useful diagnostic and safe full/advisory/failure state                                                                                                          |
| QA-008 Path safety                  | Spaces, Unicode, regex metacharacters, leading dash, case aliases, Windows short paths, junction/symlink, traversal                    | Literal argv and canonical containment; outside/ambiguous input rejected; no wrong-file test execution                                                                                |
| QA-009 Outcome comparison           | Duplicate test titles, skipped/todo tests, failing hooks, test/suite failure, no-tests exit                                            | Native result multiset comparison retains counts/status and detects every seeded omission                                                                                             |
| QA-010 Execution recovery           | Timeout/cancel/crash during child/grandchild test execution and during report publication                                              | Supported native ownership proof shows descendants quiescent; partial evidence remains incomplete                                                                                     |
| QA-011 Package/environment fidelity | Resolve conditional XML fallback and self-reference under source, packed, browser and supported Node settings                          | Dedicated native/source/browser/installed checks retain their own results                                                                                                             |
| QA-012 Cost and truthful shadow     | Isolated/shared/control/full cases across cold/warm runs                                                                               | End-to-end paired measurements, independent full execution when selective, one full run when already full                                                                             |
| QA-013 Package shipping closure     | Shipped runtime imports an excluded test/tool file or dev-only package; legal shipped internal/self-reference/production package cases | Native pack inventory and native classifications identify the new violation; independent installed-package boundary behavior corroborates the distinction from repository containment |

Use minimal synthetic repositories/fixtures to exercise the real installed tools, plus representative OwlAPI cases.
Synthetic fixtures must be outside the user's checkout and owned by the task.
Do not modify live source merely to inject a failure.
Do not use a mock selector as its own oracle.

Shadow compares native selected outcomes with the same tests in an independently discovered and executed full Jest run.
Independently seed a failing test that the selection deliberately omits; the comparison must fail or widen appropriately.
Also prove that malformed discovery, a missing suite, and duplicate names cannot be normalized into success.
Zero mismatches in a finite corpus is evidence for that corpus, not a mathematical proof that all future dynamic relations are known.

## 10. Exact proposed changes for later configuration approval

These are proposals, not edits performed by this plan.
Approve only the rows needed for the selected slices.
Where a baseline result is needed before fixing an error-level policy, that is an explicit admission gate, not permission for an implementer to weaken the setting unilaterally.

| File                                                                                 | Proposed exact setting or change                                                                                                                                                                                                                                                                                                                                                                                | Behavioral and pipeline impact                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root `package.json`                                                                  | Add only `devDependencies.dependency-cruiser = ">=18.6.0"`                                                                                                                                                                                                                                                                                                                                                      | Adds development tooling; preserves production dependencies and public exports                                                                                                                                                        |
| Root `package-lock.json`                                                             | Record the exact reviewed resolution for that addition and necessary transitive entries                                                                                                                                                                                                                                                                                                                         | Reproducible root install and dependency-review/security impact; no isolated Markdown lock/archive refresh                                                                                                                            |
| Root `package.json`, architecture scripts                                            | Add `graph:dependencies = "node scripts/dependency-graph.mjs"`; add `verify:architecture = "node scripts/dependency-graph.mjs --check-runtime"`                                                                                                                                                                                                                                                                 | Explicit graph generation and runtime-policy command; no modification of `test`, existing quality commands, or lifecycle hooks                                                                                                        |
| `.dependency-cruiser.json`                                                           | Add native options `moduleSystems: ["es6", "cjs"]`, `doNotFollow.path: "(^\|/)node_modules/\|^\\.\\./"`; no pre-extraction `includeOnly`, no depth limit, no cache                                                                                                                                                                                                                                              | Keeps external/escape endpoints visible while avoiding traversal; full authored root inventory supplied explicitly by the owner                                                                                                       |
| `.dependency-cruiser.json`, runtime rules                                            | `no-unresolvable-runtime`: error, `from: {}`, `to.couldNotResolve: true`; `no-relative-runtime-escape`: error, `from: {}`, `to.path: "^\\.\\./"`; apply to the runtime cruise for enforcement                                                                                                                                                                                                                   | Replaces the import-regex isolation mechanism only after parity/escape fixtures; all-source observation may report intentional test violations without calling them runtime failures                                                  |
| `scripts/dependency-graph.mjs`, derived native policy under DEC-011                  | `no-runtime-to-unshipped-source`: proposed error; `from.path` is the literal anchored native shipped-JS set; `to.dependencyTypes: ["local", "localmodule"]`; `to.pathNot` is the literal anchored complete native pack-file set. `no-runtime-to-dev-only`: proposed error from that runtime set; `to.dependencyTypes: ["npm-dev"]`; `to.dependencyTypesNot: ["npm", "npm-optional", "npm-peer", "npm-bundled"]` | Adds package shipping/dependency closure beyond repository containment; single graph owner generates and records the effective native policy. Exact activation requires baseline/QA-013 acceptance; no duplicated persisted path list |
| `.dependency-cruiser.json`, cycle reporting                                          | `circular-dependencies`: warn, `from: {}`, `to.circular: true`; no blanket no-orphans/no-public-to-internal rule                                                                                                                                                                                                                                                                                                | Reveals cycles without inventing a clean layering claim or blocking intentional existing design                                                                                                                                       |
| Root `package.json`, conditional local aid                                           | If SLICE-004 is admitted, add `test:affected = "node scripts/affected-tests.mjs"`; its default is list-only, execution requires explicit mode                                                                                                                                                                                                                                                                   | New optional command only; preserves `npm test` and its ESM launch; no CI/profile narrowing                                                                                                                                           |
| `.test-impact.json`, conditional policy                                              | Only if selection is admitted: versioned OwlAPI producer/contract identity, explicit path classes and full-fallback rules, exceptional relations with owner/rationale/fixture                                                                                                                                                                                                                                   | Single local exceptional-impact authority; no generic compatibility with reference schemaVersion 1                                                                                                                                    |
| Jest, ESLint, formatting, Node/npm/Python declarations, CI workflows, HISEW profiles | **No change proposed in the initial delivery**                                                                                                                                                                                                                                                                                                                                                                  | Existing discovery, worker behavior, required jobs, tool floors, and assurance scope remain the baseline                                                                                                                              |
| Public exports/files, compatibility seams, release pins, archived fixtures/history   | **No change proposed**                                                                                                                                                                                                                                                                                                                                                                                          | No runtime API, release consumer, or historical evidence migration                                                                                                                                                                    |

The stated native options/rules must pass the installed 18.6 schema and host-specific escape tests. The API owner supplies cwd/base directory and Node resolver conditions explicitly and records them.
No executable historical configuration is loaded.
A future browser resolver or cycle error rule needs a new exact proposal.
Native option semantics are documented in [the tagged options reference](https://github.com/sverweij/dependency-cruiser/blob/v18.6.0/doc/options-reference.md) and [tagged rule types](https://github.com/sverweij/dependency-cruiser/blob/v18.6.0/types/rule-set.d.mts).

Proposed ordinary source/document changes are `scripts/dependency-graph.mjs`, focused graph contract tests, the existing `coreIsolation.architecture.test.js`, `scripts/development-dependency-policy.test.js`, and `docs/dependency-graph-and-tests.md`.
Conditional files are `scripts/affected-tests.mjs` and focused selector tests.
Keep filenames and responsibilities aligned with existing conventions.
Do not create generic helper layers unless two real consumers need the same contract.
Any native process helper or extra package is a new proposal, not silently included here.

The architecture test should consume the shared runtime inventory and public graph adapter while retaining its lexical assertion.
Its existing inclusion in full Jest means the strengthened guard can run in existing full source jobs without adding a job.
Avoid running the same expensive extraction twice within one invocation; any reuse must bind the exact inputs and remain local to that invocation.
Before integration, demonstrate that the test's timing fits existing timeout budgets.

## 11. Independently demonstrable implementation slices

Each slice ends with a concrete artifact and falsifiable proof.
The owner may stop after SLICE-002 with a useful architecture delivery.
Later slices are conditional, not a commitment to build a selector irrespective of results.

| Slice                                        | Result and scope                                                                                                                                                                | Traceability                                                                            | Demonstration, admission and recovery                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SLICE-001 Native graph bundle                | Approved tool floor/lock, graph owner, explicit authored/runtime inventory, validated JSON and native views, provenance                                                         | REQ-001/003/008/009; AC-001/003/008/009; QA-001/007/008; DEC-001/002/008                | Actual disconnected-root and package-inventory fixtures; native schema validation; supported Node/tool policy checks. Recovery removes only task-created outputs and reverses this slice's exact edits                                                                                                |
| SLICE-002 Runtime architecture guard         | Shared admitted runtime inventory; native dependency checks; retained lexical check; broadened shipped coverage; cycle observation; explicit shipping-closure/dev-only decision | REQ-002/005/009; AC-002/005/009; QA-002/011/013; DEC-003/005/011                        | Independent negative fixtures fail for the intended reasons; legal runtime and package boundary checks pass; new closure predicates have accepted native baseline proof or an explicit deferral. Full existing source controls remain; do not remove old dependency guard until parity is established |
| SLICE-003 Native selection experiment        | Evidence comparing native Jest related/SCM modes and dependency-cruiser impact with representative changes; no new mandatory runner                                             | REQ-003/004/007; AC-003/004/007; QA-003/004/005/006/012; DEC-004/006/009                | Measured discovery/full inventories, seeded negative controls, overhead phases; explicit recommendation to stop, stay advisory, or admit SLICE-004                                                                                                                                                    |
| SLICE-004 Conditional local aid and shadow   | Small list-first coordinator, authoritative input union, native exact-file execution if supported, full fallbacks, transparent obligations/report                               | REQ-004/005/006/008; AC-004/005/006/008; QA-004 through QA-010/012; DEC-004/005/006/008 | Adversarial integration corpus plus independent full shadow; cancellation/output proof. Unsupported process ownership keeps execution disabled; optional historical extension requires DEC-007 first                                                                                                  |
| SLICE-005 Conditional activation and handoff | Opt-in local selective mode only for admitted cases, operating guide, measured gates, ownership and recovery instructions                                                       | REQ-005/007/008; AC-005/007/008; QA-011/012; DEC-005/009/010                            | Accepted corpus/timing results and configuration review; preserve full CI/profiles; first omitted failure disables selection and triggers replanning                                                                                                                                                  |

Dependencies are SLICE-001 before SLICE-002; native experiments may use the graph after SLICE-001, but architecture assurance must be complete before calling adoption delivered.
SLICE-004 depends on accepted SLICE-003 results.
SLICE-005 depends on actual shadow and process/output evidence.
A historical graph extension belongs inside a separately amended SLICE-004 scope with its own acceptance record.

The integration owner owns the complete acceptance story across slices.
Delegating a fixture or review does not delegate authority to alter scope, configuration, consumer pins, or workflow ownership.
Resolve missing accepted oracles before executing dependent work; continue independent graph work only within the accepted slice scope.

## 12. Verification strategy and evidence classes

Use focused real-tool contract tests for new behavior, then the repository's existing relevant quality and source gates.
Preserve native boundary and Markdown probes as separately reported controls.
Dependency/security/license checks must assess the reviewed root lock.
When source/profile/workflow policy changes, run their owning validators rather than duplicating rules in new tests.
New tests should prove failure modes and integration semantics, not merely mirror the implementation.

The future implementation evidence should identify exact commands, candidate identity, native exit/results, environment, and omissions. Reuse valid evidence only under the repository's accepted identity and scope rules. Do not rerun a duplicate full execution solely to decorate a shadow report when fallback already selected full. Do not infer hosted green from a local command, a previous commit's receipt, or a skipped/pending required job.

| Evidence class               | What it establishes                                                           | What it cannot establish                                        |
| ---------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Planning/source inspection   | Current contracts, proposed changes, provenance and open decisions            | Correctness, speedup, passing tests, installed compatibility    |
| Graph and focused tool tests | Native graph/rule/input/output behavior on declared fixtures                  | Full source regression or browser/runtime equivalence           |
| Full local source/profile    | Actual configured source controls for the bound candidate                     | Every browser/installed-consumer/hosted/release obligation      |
| Local shadow                 | Agreement for its tested corpus and bound environment                         | Universal absence of false negatives or permission to narrow CI |
| Hosted CI                    | Exact required jobs, attempts, candidate and environment under current policy | Release publication or external runtime acceptance by itself    |
| Installed consumer/release   | Existing candidate, source pins and release qualification contract            | Authority to alter source pins, publish, or deploy              |

Publication, commit creation, pushing, remote workflow dispatch, merge, installation into other repositories, and release are outside this planning authorization.
Their later authorization and lifecycle requirements remain separate.

## 13. Measurement, rollout, and go/no-go

Before timing, accept a small representative corpus: isolated model utility, isolated parser/serializer, shared manager/barrel, direct test change, resource fixture, package/lock/control change, and structural deletion/rename.
Include cases expected to choose full.
Use the supported Windows environment and a supported Linux CI-like environment where execution is proposed; do not claim macOS selective execution until its process and behavior contract is demonstrated.

Measure at least five paired repetitions per admitted case/environment after separating cold and warm states. Record native discovery, Git/input capture, graph generation, selection, runner startup, selected execution, full execution, report work, and cleanup.
Compare the total cost to the same qualified full command.
Randomize/interleave order where practical, report medians and dispersion, and record machine/load/cache conditions.
Startup or graph cost is part of the product, not omitted overhead.

The following numerical thresholds are **DRAFT acceptance values**, to accept or revise before collecting results:

1. Correctness: zero omitted failing tests and zero unexplained inventory/outcome differences across the accepted adversarial and shadow corpus. Every seeded omission and malformed/no-tests control must be detected.
2. Preservation: no removed mandatory control, no altered required CI inventory, and no weakened architecture or lexical invariant.
   All new supported-runtime and root dependency policy checks pass.
3. Value: at least two representative ordinary source-change cases save both 20% and five seconds in median end-to-end time against full execution; savings must exceed observed run-to-run noise.
   Admit cases individually; broad/shared changes may always remain full.
4. Conservative cost: already-full cases bypass unnecessary graph/shadow work where policy can decide early.
   Additional median overhead should not exceed the larger of two seconds or 10% of full time.
   If this is infeasible, keep the command advisory or use the existing full command directly.
5. Operations: supported cancellation leaves no owned descendants, existing output cannot be overwritten, interrupted bundles cannot be accepted, and source state remains unchanged.
   A platform without this proof cannot activate managed selective execution.

Roll out first as graph/architecture tooling, then optional list-only analysis, then bounded shadow, then local opt-in execution for admitted cases.
When selection is already full, execute once and label the result `full` with `comparisonPerformed: false`; do not claim an independent shadow match.
Keep the ordinary full command documented and readily available.

There is no proposed automatic CI narrowing.
A future CI change requires a new proposal covering job inventory, native input/evidence contracts, trust model, source/installed/browser/release scope, and proof reuse.
A future HISEW affected-profile migration similarly requires current native capability and owner approval; preserving its present fixed subset is an explicit first-delivery choice, not an assertion that it is ideal.

## 14. Abort, recovery, and replanning

Disable selective execution immediately on the first unexplained omitted failure, unsupported configuration, corrupted identity, package-resolution mismatch, unsafe path alias, input race, or failed descendant cleanup.
Preserve the failure report and candidate identity.
Run existing full controls where their prerequisites are known; if those prerequisites are missing, report the limitation instead of converting fallback intent into a pass.

Graph-only recovery preserves the lexical guard and existing full commands.
Do not remove the old isolation implementation before parity proof; if the replacement fails admission, retain the original and document the coverage gap rather than silently weakening it.
Revert only task-owned exact edits if authorized to abandon implementation.
Never reset or restore unrelated working-tree changes.

Remove task-owned transient fixture/snapshot directories only after their evidence consumers finish and only after verifying canonical containment and process quiescence.
Preserve required failure evidence in the resolved operator namespace.
Do not delete another execution's artifacts, reservations, or resources.
No legacy storage paths, broad cleanup command, or workspace-wide disposal is part of this plan.

Replan if the baseline moves materially; package exports/files or runner configuration changes; new dynamic/resource relations appear; the dependency floor resolves to a new contract; measured overhead defeats the benefit; a supported platform cannot meet cleanup requirements; a useful native capability supersedes custom work; or HISEW issue #150 delivers a different accepted interface.
A developer-tool update must not become an unreviewed runtime refactor to improve graph aesthetics or selection percentages.

## 15. Remaining decisions and planning validation

The owner still needs to accept the draft R2 route and dossier, name the implementation/review owners, approve exact configuration rows for the desired slices, accept the architecture predicates after native baseline inspection, and settle the QA/measurement corpus and thresholds.
Native Jest's actual inventory, dependency-cruiser graph completeness/cycles, native impact behavior for structural changes, true total timing, transitive dependency policy, and supported process ownership remain empirical gates.
None was represented as completed in this plan.

The version floor is already selected by the user.
No additional user decision was needed to create this draft.
Native selection experiments and any optional graph union have deliberately different admission points.
The absence of an accepted dynamic HISEW interface does not prevent architecture adoption.

Planning validation consisted of read-only baseline/status/remote-ref checks; repository package, architecture, orchestration, workflow, consumer and dependency-policy inspection; read-only HISEW applicability/storage/profile/progress inspection; full reading of both supplied plans and implementation chats; comparison against pinned delivered tooling; and primary-source verification of the 18.6.0 package, runtime/license/API contract and native alternatives.
No dependency was installed, repository file edited, suite executed, configuration changed, execution adopted, CI dispatched, commit created, or remote publication performed.
Only this requested external planning document is created.

The installed Markdown Quality 1.0.3 CLI was inspected and a read-only check was attempted against this external document.
Using OwlAPI's existing configuration with the G: consumer root returned `UNSAFE_PATH` because the configuration lies outside that root; a separate attempt with the external root and no explicit configuration returned `OPERATION_FAILED`.
Neither was a passing Markdown Quality check.
No configuration was copied/created and no formatter was run as part of those attempts.
Structural checks confirmed LF with a final newline, no trailing whitespace, and valid existing absolute local links; pinned repository blob links were checked against the exact local Git objects.
The parent reviewer independently verified the five absolute local link targets and 19 pinned repository blob links at their exact Git identities, then formatted this external artifact with installed Prettier 3.9.9 using the Markdown parser and no configuration or EditorConfig.
The final Prettier check passed.
These document checks do not substitute for repository test execution.

The plan's acceptance result may be **architecture delivered, selective execution declined**.
That is a complete and useful outcome when the measured native capabilities, correctness evidence, or total cost do not justify more machinery.

## Accepted implementation continuation: semantic JSON identity

On 12 October 2026, the owner additionally directed: fix the cause of JSON object-order dependence, find other instances, and fix them before publication.
The first architecture candidate passed the full source profile at commit `38b4524c01a614a1584e3bb7247bd03477fbc9e8`; this continuation adds a coherent R2 checkpoint to the same delivery.

Audit JSON serialization used for semantic hashing/equality across maintained source and tooling.
Reuse the existing recursive key-sorting implementation as shared authority; object member insertion order must not change semantic identities, while array order and actual value changes remain significant.
Exact-byte integrity hashes, retained raw artifacts, archived historical attestations and ordered structural tuples keep their existing meaning.
Do not rerun scanner acquisition or shard verification for workflow bookkeeping.

Consolidate fixes to the four mutable review-facts digests, other confirmed semantic fingerprints and comparisons, and their producer/verifier pairs.
Version changed review-digest contracts explicitly and recompute current records; do not silently carry human attestation to a new digest.
Preserve prior approvals in immutable Git history.
Add meaningful permutation tests at affected boundaries and negative tests proving mutations still fail.
Review this continuation locally with narrow follow-ups, then obtain external review only for the final combined candidate.
Keep existing full source and hosted obligations, normal protected PR merge and local-main synchronization.
