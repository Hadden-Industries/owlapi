# Markdown quality

Check GitHub Flavored Markdown for layout drift, decomposed Unicode in prose, missing image descriptions and broken local links or heading fragments.
The Node.js CLI and SDK use the same rules.
A repository can start with the defaults and no configuration file.

## Install and run

From the repository root, install the exact version you intend to use.
This example targets the 3.0.1 contract.

```sh
npm install --save-dev --save-exact @hadden-industries/markdown-quality@3.0.1
npm exec -- markdown-quality check --root .
```

The check reads the selected documents and prints findings on stderr.
Exit `0` means the check completed without blockers.
See [exit and status](#exit-and-status) for refusals and operational failures.

This documentation describes the 3.0.1 source candidate.
Use the installation example with a published, qualified version matching the documented contract.
Releases are first published under npm's `pilot` tag and move to `latest` only after pilot acceptance and stable promotion.

Pin the exact qualified version; an unversioned install follows the mutable `latest` tag.
The [migration guide](docs/migration-guide.md) maps 2.0 usage to 3.0 and retains the earlier 1.x migration.

A local dependency does not put a bare `markdown-quality` executable on every shell's PATH.
Run it through [npm exec](https://docs.npmjs.com/cli/v11/commands/npm-exec/), an npm script, or another runner that resolves local package binaries.
Without `--root`, the root is the nearest Git checkout verified with host Git, else the nearest package root, else the current directory.
The optional `.markdown-quality.json` is looked up only at that root.

## Why use it

- One package covers layout, sentence lines, GFM linting, NFC prose, accessibility and local links, with one configuration, one result schema and one exit-code contract.
- It repairs decomposed Unicode in prose to NFC without touching code, raw HTML or link destinations, and its tests run against the official Unicode normalization test data.
- Accessibility checks flag missing and placeholder image alternatives, generic link text and unlabeled image links.
- Local links and fragments are checked with GitHub's heading anchors, and path case must match exactly, so a link that works on a case-insensitive disk does not break on GitHub.
- `normalize --update-links` rewrites local links to headings whose anchors change, and refuses rather than guesses when it cannot.
- Repairs check the whole batch before the first write and recheck each file just before replacing it; symbolic links, hard links and paths outside the root are refused.
- Nothing is fetched over the network, every resource ceiling has a finite configurable default, and results are machine-readable JSON with published schemas.

## When not to use it

- Your documents are MDX or another dialect; the package checks GitHub Flavored Markdown only.
- You want to choose your own layout style; canonical layout and whitespace policy are fixed.
- You need external URLs, site routes or extensionless targets verified; only repository-local targets are checked.
- You need spelling, grammar or prose-style review.

## Runtime support

The CLI and SDK run in Node.js for local development, builds and CI.
They require filesystem access and platform-native executables; see the [supported runtimes and platforms](docs/support-and-release.md).
Frontend projects can install the package as a development dependency and run it in their Node.js tooling.

Browser execution is not supported: conditional exports reject the SDK root in browser builds and environments without the `node` condition.
The published JSON schemas remain available independently of the SDK.
Browser support is a separate future feature and is not included in the current runtime contract.

## Commands

### Check the whole repository or selected files

```sh
npm exec -- markdown-quality check --root .
npm exec -- markdown-quality check --root . --strict
npm exec -- markdown-quality check --root . -- "docs/literal [1].md"
```

Use `--strict` to make warnings blocking.
Put literal paths after `--`.
The explicit empty selection `--files-json '[]'` succeeds without launching tools.

### Preview a repair before writing

Use `format` for layout and sentence lines.
Use `normalize` to repair eligible prose to Unicode Normalization Form C (NFC).
A layout repair preserves decoded prose, and Unicode repair can leave layout drift.

```sh
npm exec -- markdown-quality format --dry-run --root . -- README.md
npm exec -- markdown-quality normalize --root . --dry-run
```

Review the candidates, then use `--write` in the chosen command to apply the repair.
Run `check` afterwards for the policy verdict.
Both repair orders work.

Each filesystem repair requires exactly one of `--dry-run` and `--write`.
A preview reports input and output hashes, byte counts and proposed changes.
A write validates the whole selected batch first, then rechecks each file immediately before replacing it.

If normalization changes a generated heading anchor, preview with `normalize --dry-run --update-links`.
It can update supported local fragments inside the selected set.
Raw HTML, ambiguous targets and dependent edits outside the set can prevent a repair.
External backlinks remain unverified.

### Work with an editor buffer

The virtual path gives a buffer the same root policy as a file.
In a POSIX shell, use a separate input path for redirection.

```sh
npm exec -- markdown-quality format --stdin --stdin-filepath docs/buffer.md --root . < editor-buffer.md
```

Raw transforms read UTF-8 and write the admitted source bytes to stdout.
Redirect to a different file if you need to save the result.
Redirecting onto the input can truncate it before the shell starts the command.

For complete results or excluded arbitrary bytes, use `format --stdin-request --root . --json` or the corresponding `normalize` command with a bounded JSON envelope containing `path`, `requestId` and `contentBase64`.

### Inspect the selected policy

```sh
npm exec -- markdown-quality inspect --root . --json
npm exec -- markdown-quality inspect-profile --root . --json
npm exec -- markdown-quality --version
npm exec -- markdown-quality format --help
```

`inspect` reports configuration, policy and selection.
`inspect-profile` resolves execution controls.
Use `check` to establish the content verdict.

## Exit and status

| Exit | Meaning                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------ |
| `0`  | The operation completed without blockers; a repair or preview can still report remaining findings                  |
| `1`  | A completed check found blocking findings or drift, or a repair or preview was refused with zero source writes     |
| `2`  | Operational failure, such as invalid configuration or arguments, unsafe input, resource exhaustion or stale inputs |

Results report `operationStatus` (`completed`, `previewed`, `refused`, `failed`) separately from `qualityStatus` (`clean`, `findings`, `incomplete`, `not-checked`) and `qualityBasis` (`input`, `candidate`, `applied` or null).
Only `check` establishes the policy verdict; a successful repair or preview is never check evidence.
Errors block; warnings block only under `--strict`; information never blocks.

`--diagnostic-display-level info|warning|error` filters human-readable output only.
Human operation output uses stderr; help, version and complete JSON reports use stdout.
`--quiet` suppresses routine success summaries, while diagnostics, refusals and failures remain visible.
Delivery failure is exit 2: discard partial stdout, and inspect confirmed filesystem effects before retrying a writer.

## Resource controls

Every package resource ceiling has a finite default that consumers can raise, lower or disable with `null`.
`--resource-limit-mode unlimited`, or `{"resourceLimitMode": "unlimited"}` in `.markdown-quality-execution.json`, removes all package ceilings, including bootstrap reads.

`--no-analyzer-limits` removes only analyzer ceilings, and `--max-profile-bytes N` sets the profile bootstrap ceiling.
Precedence is package defaults, configuration `analyzerLimits`, execution profile, then invocation.
Unlimited mode cannot remove Node, V8, operating-system or hosting-provider limits and is not a speed claim.

## Guides

- The [consumer guide](docs/consumer-guide.md) covers installation, configuration, defaults, links, normalization, resources and the library API.
- The [migration guide](docs/migration-guide.md) maps 2.0 CLI/result usage to 3.0 and retains earlier configuration/API migrations.
- The [support and release guide](docs/support-and-release.md) describes compatibility and release gates.
- The [centralized contracts guide](docs/centralized-contracts.md) and [CI trust guide](docs/ci-trust.md) describe logical documents, execution profiles and trusted qualification.
- The package is licensed under [AGPL-3.0-only](LICENSE).
  The [third-party notices](THIRD-PARTY-NOTICES.md) cover distributed upstream assets.
- For development and proposals, read [Contributing](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).
- Report vulnerabilities through the private channel in the [security policy](SECURITY.md).

## Development

Reference builds use the Node reference declared in [node-support.json](https://github.com/Hadden-Industries/markdown-quality/blob/main/assets/node-support.json) and an existing stable Python interpreter at least as new as [.python-version](https://github.com/Hadden-Industries/markdown-quality/blob/main/.python-version) for asset preparation.
Ordinary checks and logical-document operations need no Python interpreter.
Trusted candidate qualification additionally needs the Python version declared in its accepted execution profile.

```sh
npm ci --ignore-scripts
python scripts/prepare-native.py --archives /path/to/verified/archives
npm test
npm run format
npm run check:markdown
npm run check:full
node scripts/pack.js /path/to/output
```

The builder accepts the frozen `snapper-windows.zip` and `snapper-linux.tar.xz` archives and verifies archive and executable hashes before copying fixed regular members.
Product operations never acquire executables.
This repository dogfoods its current source: `format:markdown` performs guarded formatting and `check:markdown` checks the authored scope with Git inventory reconciliation.
Published 1.x archives are immutable and keep their previous behavior.
