# npm commands for OwlAPI

Run these commands from the checkout root after [setting up the development tools](../../CONTRIBUTING.md#set-up-the-development-tools).
The [package manifest](../../package.json) defines each command.

## Check and format files

| To do this                       | Run this                                                              |
| -------------------------------- | --------------------------------------------------------------------- |
| Check all authored Markdown      | `npm run check:markdown`                                              |
| Check one Markdown file          | `npm run check:markdown -- -- README.md`                              |
| Preview Markdown formatting      | `npm exec -- markdown-quality format --dry-run --root . -- README.md` |
| Apply Markdown formatting        | `npm run format:markdown -- -- README.md`                             |
| Check the complete JSON corpus   | `npm run check:json`                                                  |
| Read JSON check events as NDJSON | `npm run --silent inspect:json`                                       |
| Preview JSON formatting          | `node scripts/run-json-quality.mjs format --dry-run -- package.json`  |
| Apply JSON formatting            | `npm run format:json -- -- package.json`                              |
| Apply JSON normalization         | `npm run normalize:json -- -- path/to/file.json`                      |

Replace example paths with literal paths relative to the checkout root.
JSON normalization requires an explicit, nonempty file selection.
JSON formatting and normalization preflight the complete repository before applying changes to writable files.
Use formatting to preserve string values.
Use normalization when you intend to convert strings to Unicode NFC.
The normalizer rejects key collisions.

The root lockfile selects Markdown Quality 3.0.1 and JSON Quality 1.0.0.
`npm ci --ignore-scripts` also installs the matching Markdown Quality native package.
See the [contributor checks](../../CONTRIBUTING.md#check-your-changes) for the full gates and workflow-specific checks.

## Name and order scripts

Use `verb:subject[:modifier]` names that describe the command's actual operation and target.
Use lowercase words, colons between semantic parts, and hyphens within a part.
Established language abbreviations such as `js`, `py`, and `json` remain appropriate targets.
Bare aggregate commands such as `lint`, `format`, and `test` remain convenient entry points.

Sort the complete script keys in ascending ASCII order.
This gives a predetermined grouping by action, then by subject and modifier, with each bare command before its scoped children.
For example, `format` precedes `format:check`, `format:json`, and `format:json:check`.

There is no separately maintained category list, custom sort dependency, or executable separator script.
JSON formatting preserves this deliberate member order; it does not perform the sort.
Keep the script order when adding commands, and update active callers whenever a name changes.

## Research and rationale

[npm's script documentation](https://docs.npmjs.com/cli/v11/using-npm/scripts/) permits arbitrary user-defined names alongside exact lifecycle events.
Consequently, verb-first naming and key ordering are repository conventions, rather than requirements imposed by npm.

Keep scoped setup commands such as `prepare:downloaded-candidate` distinct from the exact `prepare` lifecycle event, which npm runs during installation and packing.
Renaming a command also requires checking its corresponding `pre` and `post` hooks; this repository currently has no such hooks for the renamed scripts.

[ESLint's published package conventions](https://eslint.org/docs/latest/contribute/package-json-conventions) combine action-first names, targets and modifiers with alphabetical order to produce logical groups.
OwlAPI adopts those structural ideas while retaining verbs that distinguish its setup, evidence, qualification and publication operations.
It retains `format` rather than adopting ESLint's `fmt` abbreviation.

Existing read-only variants such as `format:source:check` remain valid: the first part is the action, `source` is its subject, and `check` is a mode modifier.
The ordering rule also works with [sort-package-json's documented alphabetical script sorting](https://github.com/keithamus/sort-package-json/blob/main/defaultRules.md#scripts), without installing another tool.

Names follow the implementation's contract, rather than merely reversing the previous tokens:

- `check:published-coordinate` queries whether the production npm coordinate resolves when publication is applicable; it does not claim installed-package health or consumer qualification.
- `qualify:installed-candidate` exercises the installed candidate contract and emits evidence for the requested environment; its name does not imply qualification of every platform.
- `require:successful-jobs` enforces the closed required-job inventory and its evidence bindings; it does more than aggregate results.
- `generate:workflow-metadata` derives validated manifest/publication values and emits JSON plus GitHub outputs when requested.
- `build:release-candidate` builds the release candidate and associated artifacts; it is broader than a bare `npm pack` operation.
- `acquire:npm-evidence` and `verify:npm-evidence` identify the actual npm evidence domain, separately from release evidence generation and validation.
- `sync:python-tools` and `check:python-tools` identify the repository's locked Python quality-tool environment, rather than implying every development tool is managed there.
- `create:github-release-draft` and `finalize:github-release` identify their remote release effects explicitly.

`run:prettier` is the internal raw-tool entry point shared by `format:source` and `format:source:check`.
It owns the generic source selection once and receives the write/check mode from its caller.
Its tool name is intentional because it exposes that exact CLI; ordinary task names describe their subject instead.

The aggregate `lint` command runs source ESLint once through `lint:json-identity`, whose configuration extends the ordinary source policy with the JSON identity rule.
It retains the Node-policy preflight before that combined pass and the existing Python, Markdown and JSON checks.
`lint:js` and `lint:source-python` keep their standalone source-only roles; the separate ordinary ESLint configuration remains loadable without the canonical runtime's native JSON developer tool.

`graph:dependencies` retains its name.
JSON checking uses `check:json` for complete coverage and `inspect:json` for the same check's typed event stream; the former `inventory:json` and `lint:json` commands are retired.
`format:json:check` also invokes complete checking, so it includes protected and native sources.

JSON Quality is a registry devDependency in the root manifest, installed by ordinary `npm ci`; the former `install:json` command and isolated bootstrap are retired.
Its `>=` minimum declaration follows the other registry devDependencies; normal npm installation, the lockfile and the repository-wide dependency checks govern its resolved package graph.
`test:json` checks JSON behavior, source preservation and repository coverage without a package-specific installation verifier.

The complete JSON corpus uses finite limits of 256 MiB managed memory, 8 GiB temporary storage and ten minutes.
The default 2 GiB temporary limit was exhausted while indexing retained package evidence; the larger limit preserves all source coverage and semantic checks.

Use a temporary volume with sufficient free space for complete checking; per-source checks alone do not establish repository closure.
`check:markdown` and `format:markdown` both declare `--root .` and accept literal paths after `--`.
Use `npm run --silent check:markdown -- --json -- README.md` for one JSON stdout document.
`inspect:markdown` reports selection; `inspect:markdown:profile` reports the effective ordinary execution limits.
Neither inspection nor selected-file checking establishes a complete repository check or a hosted trusted qualification receipt.
External-directory callers use `npm --prefix <absolute-repository-root> run check:markdown` to retain the intended root.
Script ordering does not establish execution order: composite command bodies and workflow dependencies continue to control execution.

## Renamed commands

This migration table preserves the former spellings for readers of historical plans and captures.
Active scripts, workflow calls, validators, tests and contributor instructions use the current names.
The underlying commands, arguments, gates and formatting scopes are preserved.
This is a coordinated development-command rename; downstream automation calling a previous name must migrate using this table.

| Previous name                              | Current name                             |
| ------------------------------------------ | ---------------------------------------- |
| `browser:prepare`                          | `prepare:browser-consumers`              |
| `browser:serve`                            | `serve:browser-consumers`                |
| `candidate:portable`                       | `qualify:installed-candidate`            |
| `candidate:prepare`                        | `prepare:downloaded-candidate`           |
| `evidence:acquire`                         | `acquire:npm-evidence`                   |
| `evidence:verify`                          | `verify:npm-evidence`                    |
| `extended:record-status`                   | `record:extended-test-status`            |
| `maintenance:published-health`             | `check:published-coordinate`             |
| `playwright:install`                       | `install:playwright-browsers`            |
| `prettier`                                 | `run:prettier`                           |
| `release:draft-github`                     | `create:github-release-draft`            |
| `release:evidence`                         | `generate:release-evidence`              |
| `release:evidence:validate`                | `validate:release-evidence`              |
| `release:finalize-github`                  | `finalize:github-release`                |
| `release:lint-package`                     | `lint:package`                           |
| `release:pack`                             | `build:release-candidate`                |
| `release:preflight`                        | `check:release-preflight`                |
| `release:prepare-github-cli`               | `prepare:github-cli`                     |
| `release:qualify-registry`                 | `qualify:public-registry`                |
| `release:rehearse-state`                   | `rehearse:release-state`                 |
| `release:sbom`                             | `generate:release-sbom`                  |
| `release:verify-immutable`                 | `verify:immutable-release`               |
| `release:verify-tag`                       | `verify:release-tag`                     |
| `tools:check`                              | `check:python-tools`                     |
| `tools:sync`                               | `sync:python-tools`                      |
| `workflow:aggregate`                       | `require:successful-jobs`                |
| `workflow:dependency-review-applicability` | `report:dependency-review-applicability` |
| `workflow:metadata`                        | `generate:workflow-metadata`             |
| `workflow:runner-record`                   | `record:runner`                          |

Markdown consumer checks exercise root npm commands for maintained selection, independently expected historical exclusions, literal bytes, read-only checking and native exit propagation.
CI composes non-Markdown formatting checks from `check:node`, `check:version`, `format:source-python:check` and `format:json:check`; the following `lint` command owns the single full Markdown check in each quality job.
The public `format:check` command continues to include Markdown for standalone contributor use.
