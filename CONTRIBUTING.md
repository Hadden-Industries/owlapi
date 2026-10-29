# Contributing to owlapi

Thank you for helping improve `owlapi`.
Issues, focused proposals, tests, documentation, and pull requests are welcome when they respect the package's public compatibility boundary and clean implementation provenance.

## Before opening a change

- Use an issue or draft pull request to discuss a material public-API or compatibility change before investing in a large implementation.
- Check [`API.md`](./API.md), the [capability matrix](./docs/compatibility/capabilities.json), and the [Java compatibility registry](./docs/compatibility/java-api-surface.md) so the proposal does not accidentally advertise an unimplemented Java OWLAPI surface.
- Do not copy or transliterate Java OWLAPI, legacy WebVOWL, or other third-party implementation source.
  Public specifications, observable behaviour, and project-owned tests define production behaviour; provenance rules remain authoritative.
- Report suspected vulnerabilities through the private process in [`SECURITY.md`](./SECURITY.md), and possible conduct violations through [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
  Do not include either in a public issue or pull request.

## Contribution licence and copyright

Accepted contributions use **`AGPL-3.0-only` inbound=outbound**: the rights you grant for an accepted contribution are the same GNU Affero General Public License, version 3 only, terms under which the package is distributed.

Contributors retain copyright in their contributions.
Submitting a contribution does not transfer copyright and does not grant the project unexpressed authority to relicense it under broader or more permissive terms.
By intentionally submitting copyrightable material for inclusion, you represent that you have the authority to submit it and to grant the applicable `AGPL-3.0-only` rights.
This includes obtaining any permission required from an employer, client, co-author, or other actual rights holder.

An issue report, abstract idea, behavioural description, review comment, or unmerged proposal does not by itself authorize the project to incorporate the reporter's copyrightable expression.
The same contribution terms apply whether material is offered through a pull request or another channel.

### First external contribution gate

The first external copyrightable contribution to package-owned implementation or shipped package material may be discussed and reviewed, but it **must not be merged** until the project records a separate decision to do one of the following:

1. retain pure `AGPL-3.0-only` inbound=outbound and accept the resulting multi-holder relicensing constraint; or
2. adopt a professionally reviewed, contributor-retained-copyright CLA before that merge.

This gate applies to substantive source, public declarations, package documentation or assets, generated distributable content, and copyrightable test or fixture expression incorporated into production.
If ownership or copyrightability is genuinely unclear, treat the contribution as in scope until the uncertainty is resolved.
A later policy or CLA does not apply retroactively without the actual rights holder's agreement.

## Source text, syntax, and formatting

Development dependencies use stable `>=` minimums; `package-lock.json` records the exact dependency graph.
Use `npm ci` to reproduce it and deliberately refresh the root lock only when upgrading tools.
<!-- runtime-policy:start -->

**Consumer support policy:**

> Requires Node.js 22 or newer.
> Official support covers the maintained Node.js release lines listed in our [support matrix](docs/release/runtime-policy.json).
> Other releases receive best-effort support.

The package declares the engine admission range `>=22.0.0`.
The maintained-family minimums of Node 22.0.0, 24.0.0 and 26.0.0 passed hosted installed-package and native-platform qualification; see the [qualification record](docs/release/node-consumer-qualification.md).
Every release candidate still requires qualification of its own bytes and human release acceptance.

Local npm eligibility is `>=12.2.1`; producer CI, release construction, and governed qualification select exact npm 12.2.1 before project commands or cache probes.
Consumer runtime qualification separately selects exact npm 10.9.9, whose declared engines admit every consumer minimum; it does not lower the producer toolchain requirement.
The development runtime remains versionless in `devEngines`; consumer admission is derived from the lowest maintained-family minimum, independently of producer toolchain requirements.
The exact CI reference runtimes remain Node 22.23.4, 24.22.2 and 26.13.0; Node 24.22.2 is canonical.

<!-- runtime-policy:end -->

The sole editable Node/npm version policy is [runtime-policy.json](docs/release/runtime-policy.json).
Run `npm run sync:node` to project the manifest, `.node-version`, marked documentation, producer assertions and workflow scalars, then `npm run check:node` to reject drift without writing.
The root lockfile remains npm-owned; a changed consumer engine range additionally requires a deliberate native `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`, with its graph diff reviewed.
Run `npm run generate:release-gates` after changing projected producer assertions; their fingerprints remain generated by the release owner.
Lint, format checks and workflow governance include the runtime drift check.
This adapts Markdown Quality's `e55e1b7` and JSON Quality's `fd247f2` policy/projection design while retaining OwlAPI's exact CI reference lanes.
Checkout-backed jobs use [the shared setup action](.github/actions/setup-producer/action.yml), following JSON Quality's `setup-producer` approach.
The action reads policy before the project graph is installed, selects the canonical `.node-version` or the requested reference family, and provisions npm through its native JavaScript CLI.
Runtime-only and deferred npm phases preserve conditional setup and intervening work; ordinary `npm ci` steps retain their job-specific modes and deadlines.
The conditional seed verifier keeps its no-script install, original condition, failure handling and aggregate timeout.
Native child-process deadlines preserve npm provisioning limits and the five-minute runtime assertion limit because composite metadata does not provide per-command workflow timeouts.
The checkout-free maintenance reporter and reconciliation publisher retain generated remote bootstrap steps under their existing access boundaries.
The protected publisher uses the action from its separate `approval-tools` checkout, without installing the project graph or adding registry authentication.
Workflow governance checks the shared action's inputs, pinned dependency, cache restrictions, phase guards and caller boundaries, and rejects copied setup blocks in checkout-backed jobs.
Historical evidence and deliberately synthetic test inputs retain their recorded versions.
Consumer runtime qualification uses the shared `freeze-runtime-matrix`, `setup-consumer`, `qualify-consumer` and `aggregate-consumer-runtimes` actions in PR/main CI, release qualification and weekly maintenance.
The policy's minimums, exact producer references, consumer npm and platform definitions are the only editable runtime declarations.
The resolver reads Node's official release index once and freezes the minimum, latest released patch and distinct reference in each family across the declared platforms.
Every consumer lane installs the same retained archive in isolated scoped and alias projects with strict engine checking and install scripts disabled, then exercises the installed public contracts, filesystem/HTTP loading, native XZ and ZIP/CRC behavior.
Linux lanes also execute product source tests selected from the package's published source inventory; repository governance, Java qualification and the independent producer CRC oracle remain on reference runtimes.
The producer installs the locked development graph before selecting the consumer Node; the consumer-native npm is provisioned separately and its own engines and directly used package-manager modules are checked against the selected runtime.
No producer dependency is reinstalled under an unsupported consumer runtime.
Qualification retains each actual Node/npm and platform identity, source commit, candidate artifact/digest, tarball digest, frozen matrix and complete lane summary for 90 days.
Release admission requires the complete report inventory; failed, missing, duplicated, skipped or differently bound reports block publication.
CI proof identity includes the frozen matrix digest, so a new latest patch or changed runtime policy requires fresh qualification.
Reused main qualification preserves the original successful runtime evidence; it cannot add coverage for a new endpoint.
A failed-lane-only rerun cannot combine old-attempt reports into a new aggregate: rerun the complete qualification workflow when a fresh aggregate is required.
Minimum/latest endpoint checks are practical coverage of a supported line, rather than exhaustive execution of every intervening patch.
The declared minimums remain unqualified until those hosted gates actually pass; broadening the published engine range remains a separate decision after qualification.
Installing development dependencies and running repository qualification additionally requires a Node version supported by the selected npm and tool graph; consumer eligibility alone does not establish development-tool eligibility.
Canonical production includes the separate Markdown archive graph; its `file:` archives and lock have an independent update scope from the root registry graph.
The refreshed dependency graph and reference runtime selections await qualification.

Repository text is UTF-8 with LF line endings and a final newline.
The root `.gitattributes` makes that representation independent of a contributor's Git settings, while the nested override under `docs/conformance/upstream/` preserves pinned third-party fixtures byte for byte.
Do not reformat or normalize those upstream evidence files.

The root `.editorconfig` defines the shared editor baseline: spaces, two-space indentation for ordinary project files, four spaces for Python, no YAML tabs, final newlines, and trailing-whitespace removal.
Native ESM and supported JavaScript syntax are defined separately by `package.json` and `eslint.config.js`.

Prettier retains its defaults for ordinary source files.
Authored Markdown uses the exactly pinned shared Markdown-quality package, with independent prose diagnostics, native GFM content rules, literal-preserving formatting, and local-link checking.
Its isolated Node 24 tool graph leaves application Node 22 support unchanged.
Fenced examples are preserved rather than executed or formatted as programs.
Ruff checks and formats Python development files with stable rules and a 79-column target.
Generated API views, upstream fixtures, and historical evidence retain their owning generators and byte checks.

Install the Node/npm versions declared in `package.json`, then run `npm ci`.
For Markdown work, select the canonical Node reference above and explicitly run `npm run install:markdown`; canonical checks never install dependencies.
Install the CPython version selected in `.python-version` and provide its absolute executable path during the explicit development-tool setup; for example, in PowerShell:

```powershell
npm run sync:python-tools -- --python "C:\Path With Spaces\Python\python.exe"
```

On Linux, use the same command with the installed interpreter's absolute path.
Setup verifies the pinned interpreter, downloads the checksum-pinned uv release into `.development-tools/`, and synchronizes `.venv/` from `uv.lock` with `--locked` and no source builds or Python downloads.
Later setup can use `npm run sync:python-tools` with the existing checkout interpreter.
Checks use only these checkout tools and never synchronize dependencies.
After changing `.python-version`, run `node scripts/sync-python-target.mjs --write` before updating locks; tool checks reject stale generated package and Ruff metadata.
Foreign uv or virtual-environment settings cannot redirect the tool environment.
Missing tools or a stale lock require explicit setup or a reviewed lock update.

Alternatively, `node scripts/repository-python-tools.mjs python` explicitly installs the pinned CPython into `.development-tools/python/` using the pinned uv release's authenticated download catalogue, without PATH or Windows registry registration.
CI uses this operation and passes its absolute interpreter path into later setup; checks still never download Python.

ScanCode has its own `util/scancode-runtime/pyproject.toml` and `uv.lock`.
Its source build uses the same Python pin, installs locked build dependencies first, and disables further build dependency resolution.
Stable Beartype `0.23.1` replaces the former scoped prerelease selection for Python 3.15.
Native Windows scanner qualification matches the retained independent baseline; Linux qualification remains pending.
The isolated scanner constrains Pluggy to `<1.7`: Plugincode 32.0.0's hook classes fail discovery with Pluggy 1.7.0.
Remove that compatibility constraint after an upstream update passes native ScanCode qualification; it does not constrain the npm runtime or quality-tool environments.
CI qualifies Windows and Linux findings against independently captured ScanCode 32.5.0 reports; a smoke qualification does not replace the full release corpus acquisition gates.

The locked source builds include cyseq, intbitset, pyahocorasick and PyYAML as well as ScanCode.
Installation receipts record observed compiler configuration and PyYAML's optional accelerator state; Python's build compiler does not identify the compiler of rebuilt extensions.
Keep compilation and scanner failure logs with the compatibility reports.

Run the gates before opening or updating a pull request:

```shell
npm run check:python-tools
npm run format:check
npm run lint
npm run test:quality
```

Use `format:source`, `format:markdown`, `format:py`, and `format:json` for language-specific writes.
The `run:prettier` package script declares the generic source formatting scope once: the repository root with `.gitignore` and `.prettierignore` boundaries, including every supported file under `.github`.
`format:source` and `format:source:check` reuse that script with `--write` and `--check`; local composites and CI reuse these commands without separate file lists.
Generic Prettier excludes Markdown and JSON-family files so their dedicated tools retain presentation and guarded-write ownership; Python remains owned by Ruff.
Repository npm scripts use action-first names and alphabetical action groups; see the [naming rationale, ordering rule and command migration table](docs/development/npm-scripts.md).
Use `check:markdown` for full read-only Markdown checking, including formatting drift, linting and local links; both `lint` and `format:check` retain that check.
Use `lint:js` and `lint:py` for separate static checks, and the source/Python `:check` formatting scripts for read-only presentation checks.
For selected Markdown files, use `npm run check:markdown -- -- "docs/guide.md"` or `npm run check:markdown -- --files-json "[\"docs/guide.md\"]"`; the canonical CLI requires a literal `--` boundary or JSON selection.
`lint:files` remains available for existing JavaScript callers.

JSON Quality is a normal root registry devDependency, installed by `npm ci` and imported from its public package exports.
Its exact prerelease selector and native optional cohort live in the root manifest and lock; `npm run test:json` independently verifies cached registry bytes and rejects installed-file tampering.
The old isolated JSON manifest, import bridge and `install:json` bootstrap are retired; Markdown and artifact transport retain their separate graphs.
`npm run check:json` performs complete read-only checking of owned files, required generated outputs, pinned native evidence and linked JSON-LD sources.
`npm run format:json:check` invokes that same complete check; `npm run inspect:json` emits its typed event stream as newline-delimited JSON.
Checking has no file-selection or protected-only mode: source findings remain provisional until the execution terminal confirms complete inventory and linkage.
The adapter exports `openRepositoryJsonSession()`; consume `session.events()` and always await `session.close()`.
Independent source analysis uses `openJsonSourceSession()` and an asynchronous byte opener; it does not establish repository completeness.
Formatting and normalization select physical paths after a literal `--`, for example `npm run format:json -- -- package.json`; normalization requires a nonempty selection.
Both operations preflight the complete repository before guarded writes, and protected evidence remains under its native producer's ownership.
Finite producer operations use `formatJsonSource`, `formatJsonValue` and `normalizeJsonSource`; their declared writer capabilities are separate from read-only checking.
`capacityLimits: false` / `--no-capacity-limits` removes admission ceilings while retaining finite runtime memory, scratch, depth, concurrency and time controls.
It does not expand writer capabilities.
The repository allows ten minutes for a complete JSON check, including native Maven and Jest outputs produced by CI; the fifteen-minute CI step leaves time for startup and cleanup.
Native corpus tests allow two minutes per case, and aggregate Windows quality steps allow thirty minutes within a two-hour job.
The policy uses schema version 2; the package's contract cohort binds source contracts, event schemas and native protocol together.
The former aggregate checking APIs and Base64 document request envelopes are retired; Markdown's own CLI grammar is unchanged.

Markdown tooling uses a source-specific, clean-source core/Linux/Windows archive tuple, its unmodified producer manifest and a native npm lock.
The Markdown archive owner verifies complete member identities before JSON checking, including bundled dependencies and both repaired cargo reports.
Only two exact original Linux author-name values retain pinned NFC preservation; neither report is excluded from semantic checking.

On Node 22, use `format:source-python:check`, `lint:source-python`, and `test:quality:source` for the complete source/Python floor; Markdown checks require Node 24.
The shared Markdown selector includes `.github/` and eligible untracked files, honours repository ignore rules, and rejects symlink and outside paths.

Trailing whitespace is trimmed in every authored file, including Markdown.
Write a hard line break with a backslash at the end of the source line.
Represent significant trailing spaces in examples as escaped strings or annotated notation.
Do not add a Markdown trimming exception.

For tool updates, review pins in `package.json`, `pyproject.toml`, `.python-version`, and `scripts/repository-python-tools.mjs`, including uv archive digests; regenerate `uv.lock` with the selected uv version, then synchronize and run the full gates on Windows and Linux.
The package owns the bounded Snapper 0.11.9 list workaround; requalify it with each package/native upgrade and remove it when upstream diagnostics are corrected.
Trusted hosted Markdown runs inspect separately checked-out candidate data using the accepted workflow source, graph, policy, and ignores.
Before merge, the owner accepts the exact candidate and attributable passing trusted run, alongside every existing required status.
Full six-check pilot windows must meet the accepted 30-second timing and separate Windows committed-memory/Linux process-tree RSS budgets; the observer retains individual receipts and fails closed on any unexpected error or input drift.
Refresh current dependency/provenance records through their owning tools while preserving historical evidence and pending human-review decisions.

For workflow changes, also run:

```shell
npm run verify:workflow-syntax
npm run verify:workflow-governance
```

Install the native [actionlint 1.7.12 release](https://github.com/rhysd/actionlint/releases/tag/v1.7.12) for your platform on `PATH`; follow its [installation and attestation verification](https://github.com/rhysd/actionlint/blob/v1.7.12/docs/install.md) instructions.
CI installs the checksum-pinned Linux release in the required Node 24 source job.
The binary is a development tool under its MIT licence, not an npm dependency or part of the distributed package.
Reassess the release, checksum and known diagnostic filter together when updating it.

`actionlint` owns GitHub workflow syntax and expression checks.
This command disables its optional ShellCheck/Pyflakes integrations so its coverage does not depend on locally installed shell/Python tools; it is not shell or Python program verification.
The existing `yaml` parser supplies values and source comments to repository governance, which owns release authority, exact pins and other local policy.
Prettier owns presentation.
The two release files retain GitHub's documented `queue: max` setting: `.github/actionlint.yaml` suppresses only the known unsupported-key diagnostic ([upstream issue 680](https://github.com/rhysd/actionlint/issues/680)), while governance tests enforce the exact root queue policy and reject job queues.

To apply the canonical formatter locally, run:

```shell
npm run format
```

## CI verification after merging

Every pull request runs the full required application checks.
A successful run retains a versioned verification receipt and its original candidate artifact identity.
After a normal merge into `main`, `CI / verification strategy` checks the receipt against GitHub's workflow, job, commit and artifact records.
Reuse requires identical merge parents, file tree and workflow, the same Ubuntu image and Node version, and retained unexpired evidence artifacts.
Evidence has no blanket age limit; timestamps must be valid and no later than verification, and the receipt must not predate its workflow attempt.
`CI / required` reports whether qualification ran in this workflow or was reused, with the original run and candidate identity available in the strategy job summary.

Missing or expired receipts, API/download errors, incomplete checks, mismatched inputs, squash/rebase merges and exceptional pushes select the complete original job graph.
Only the receipt transport actions tolerate errors; test failures do not.
An unavailable receipt upload therefore affects efficiency, not acceptance of a fully tested PR.
Unrecognized receipt formats also use full qualification.

CodeQL's default-branch and PR scans and the separate release workflows retain their existing behavior.
A reused CI candidate is not a release approval, and its artifact must not be substituted for the release workflow's required qualification or provenance.
No branch permissions or protected checks are relaxed by CI reuse.
The detailed contract and proof are in the [CI reuse plan](docs/plans/2026-09-29-ci-verification-reuse.md).
The [applicability observation decision](docs/adr/0010-ci-applicability-observation.md) adds input diagnostics while retaining full integration execution.
The [qualification lineage decision](docs/adr/0011-full-ci-qualification-lineage.md) introduced explicit live Java/native WebVOWL accounting and exact landed-main records.
The [gated native Java reference decision](docs/adr/0012-gated-native-java-reference-reuse.md) coordinates schema-v3 receipts and the main-only producer, independent consumer and reevaluated cold-seed protocol.
Every selected live Java assertion must execute successfully; changing its group or test name requires reviewing `JAVA_LIVE_INVENTORY` alongside the actual tests.
Unsupported receipts retain their historical meaning and select full execution.
Full integration checks remain required by the owner's decision; shared Java reuse remains disabled pending hosted comparative and operating acceptance.
Dependency review does not install repository packages: its remaining runtime and npm entry points require no repository `node_modules`.

## Optional source-development checkout

The ordinary clone is the authoritative repository checkout and includes the complete provenance and release-evidence corpus.
Contributors who need to work only on package source and its ordinary test resources may instead start with a blobless partial clone and a positive cone-mode sparse selection:

```shell
git clone --filter=blob:none --sparse https://github.com/Hadden-Industries/owlapi.git owlapi
```

Enter the cloned `owlapi` directory, then select the source-development tree:

```shell
git sparse-checkout set --cone .github LICENSES apibinding docs/adr docs/compatibility docs/conformance docs/migration docs/performance docs/plans docs/provenance/history-reconstruction/review docs/release formats internal io model scripts test util
```

Cone mode also retains repository-root files and the direct files of selected ancestor directories.
The resulting checkout therefore keeps the evidence manifests, schemas, human-review records and explanatory policy, as well as the W3C and other conformance inputs used by ordinary parser tests.
It omits the raw content-addressed npm blobs and the bulky history-reconstruction payloads.
The omitted Git blobs remain available from the promisor remote and are downloaded only if a later Git operation requests them.

This profile is intentionally unsuitable for repository-wide governance, evidence verification or release preparation.
Use focused tests for the source being changed; the aggregate `npm test`, `npm run verify:npm-evidence`, and every release gate require a complete checkout and must not silently reinterpret missing evidence as success.
Restore the complete working tree before running those gates:

```shell
git sparse-checkout disable
```

Sparse checkout reduces working-tree contents, while `--filter=blob:none` avoids initially transferring omitted file contents.
Enabling sparse checkout after an ordinary full clone does not reclaim Git objects that were already downloaded.

## Preparing a pull request

- Keep each change cohesive and explain its user-visible, compatibility, and provenance consequences.
- Add focused tests before implementation changes and run the applicable package tests, lint, formatting, conformance, and performance gates.
- Add a proportionate amount of comments where future maintainers need the reason for a boundary, compatibility adaptation, security rule, or non-obvious algorithm.
  Comments should explain context and constraints rather than restate syntax.
- Update consumer documentation and machine-readable registries whenever a public capability, binding, dependency seam, limitation, or controlled deviation changes.
- Change generated files through their owning generator.
  Include both the source change and regenerated output, and verify the generator's check mode.
- Keep repository-policy, release, dependency, and package-manifest changes separate and obtain the exact approval required by the repository instructions.
- Never commit credentials, private reports, personal data supplied through a restricted channel, generated release secrets, or local machine paths presented as portable configuration.

Maintainers may ask for a smaller change, additional evidence, or separation of package work from downstream WebVOWL integration.
Review does not guarantee acceptance or override the rights gate above.
