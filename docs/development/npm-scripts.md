# npm script naming and ordering

The root `package.json` is the executable authority for repository commands.
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
`graph:dependencies` and `inventory:json` already use valid action verbs and retain their names.
`install:json` and `install:markdown` also remain action-first; their names are embedded in the shared quality acquisition bootstrap's diagnostic text.
That bootstrap must retain the original producer bytes for independent installation verification, so this naming refactor does not fork it.
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
