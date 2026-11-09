# JSON Quality

JSON Quality checks strict JSON, JSONL and NDJSON directly from the source bytes.
It catches duplicate keys such as `{"a":1,"\u0061":2}` and unsafe integers such as `9007199254740992`.
Use the Node.js CLI or typed library to check files, format a document or normalize Unicode.

## Install and first check

Use Node.js on **Windows x64** or **Linux x64 with glibc**.
[Supported Node and npm versions](docs/node-runtime-compatibility.md)

From an existing Git repository, replace `VERSION` with an exact published version matching this guide (contract cohort 6).
Keep npm optional dependencies enabled for the native companion.

```sh
npm install --save-dev --save-exact @hadden-industries/json-quality@VERSION
npm exec -- json-quality check --root .
```

Read the findings and summary on stderr.
Exit `0` means the repository satisfies its declared contracts.
Exit `1` means the check completed with a refusal.
Exit `2` means the check could not complete.

Commit the generated lockfile and use `npm ci` for subsequent installs.
To repeat the check with `npm run check:json`, add `"check:json": "json-quality check --root ."` to `scripts`.

This guide describes the [source candidate](package.json).
The planned release first uses npm’s `pilot` tag, then moves to `latest` after acceptance.
Check the [published versions](https://www.npmjs.com/package/@hadden-industries/json-quality) before installing.

## Commands and scope

Run the local binary with `npm exec -- json-quality` followed by one of these commands.

- **Whole Git repository** — `check --root .` checks the declared inventory, including provider sources and required outputs.
- **Selected files** — `check-files --root . -- authored.json` checks the named files under root policy, including outside Git.
- **Raw input** — `check-source --stdin-filepath input.json` reads UTF-8 bytes from stdin under a source contract.

Pass literal filenames after `--` and quote names containing spaces.
A selected-file check covers only those files.

### Editor and pipeline input

For editor input that needs the root policy, use `check-files --stdin --stdin-filepath authored.json`.
The virtual filename identifies the input and its framing.
The [CLI reference](docs/cli.md) covers stdin, policy selection, machine output and exit status.

### Preview and apply a repair

**Format** single-document JSON to fix presentation while preserving member order, decoded strings and exact number spellings such as `1.00`.
**Normalize** to repair eligible keys and strings to Unicode Normalization Form C (NFC).
If two keys would become equal, resolve the collision before normalizing.

Preview the replacement for one file.

```sh
npm exec -- json-quality format --dry-run --root . -- authored.json
```

To apply the change, run the write command.
Then check the whole repository.

```sh
npm exec -- json-quality format --write --root . -- authored.json
npm exec -- json-quality check --root .
```

For NFC repair, use `normalize` in place of `format` and always name the files.
Omitting filenames from a filesystem `format` selects **all eligible writable files**.
Each write rechecks its inputs.
If a batch fails partway, inspect the confirmed writes and any path reported as uncertain.
A successful repair can leave findings for the other operation.

## Why use it

- **Inspect the original bytes.**
  Detect duplicate decoded names, unsafe numbers, invalid Unicode, key hygiene and presentation problems while their source locations are still available.
- **Read large values in parts.**
  Stream a number’s original spelling or a string’s decoded bytes.
  A session can spill to owned temporary storage under caller-selected [resource limits](docs/resource-limits.md).
- **Use the same rules locally and in CI.**
  Check with package defaults, or add a [policy exception](docs/configuration.md#sparse-overrides) for a specific path.
- **Integrate with tools.**
  Use the same [versioned events](docs/cli.md#controls-and-streams) from the CLI or a Node.js session.

## When another tool fits better

Use a dialect-specific tool for JSONC, JSON5, YAML or trailing commas, and a domain validator for application schemas and business rules.
Choose a different formatter if you need sorted members or configurable presentation.
JSONL and NDJSON support checking only.
Use the owning producer for lockfile rewrites and a separate transaction mechanism if you need multi-file rollback.

## Resources and supported environments

Checking can spill to owned temporary storage.
Source admission, managed memory and finite writers have separate quotas.
For large inputs, see the [defaults and overrides for each operation](docs/resource-limits.md).

### Runtime support

Frontend projects can run JSON Quality in Node.js build or CI jobs.
The SDK and ESLint integration require Node.js and the matching native companion.
For browser execution, macOS, ARM or Linux musl, choose tooling that supports that environment.

## Defaults and exceptions

The package uses built-in rules when the chosen root has no `.json-quality.json`.
For example, if a protocol requires exact decoded Unicode sequences for every source, use this policy.

```json
{
  "defaults": { "normalization": "preserve" }
}
```

Presentation checks still apply, exact duplicate keys still fail, and an NFC collision risk produces a non-blocking event.
Use a [path exception](docs/configuration.md#sparse-overrides) to narrow preservation to selected files. npm lockfiles keep their producer-owned write protection.

## Output and completion

Human findings go to stderr.
Request `--ndjson` for machine-readable events on stdout.
Stdin transforms reserve stdout for the transformed bytes.
A complete repository check ends with `execution-terminal`, a selection ends with `selection-terminal`, and a raw source ends with `terminal`.
If the final event is missing, the result is incomplete.
See the [CLI exit statuses](docs/cli.md#exit-status).

## Library use

The typed ESM API can read a number exactly as the author wrote it, including trailing zeros.
The [consumer guide](docs/consumer-guide.md#stream-a-source-and-read-lossless-values) walks through opening a source, selecting a value and closing the session.

| Task                                                     | Entry point                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Check selected files under root policy                   | [`checkJsonFiles` example](docs/api.md#repository-operations)                                 |
| Read original bytes, numbers or decoded strings          | [Source and value sessions](docs/api.md#source-and-value-sessions)                            |
| Check a complete repository and preview or apply repairs | [Repository sessions](docs/consumer-guide.md#complete-repository-checks-and-trusted-adapters) |
| Format or normalize text in memory                       | [Source and value writers](docs/consumer-guide.md#explicit-transformations-and-replacements)  |

## ESLint integration

To catch JavaScript that compares objects by serializing them, add the recommended flat configuration to ESLint.

```js
import jsonQuality from "@hadden-industries/json-quality/eslint";

export default [jsonQuality.configs.recommended];
```

The [rule reference](docs/rules/no-json-stringify-identity.md) shows a reported comparison and how to choose a domain-appropriate replacement.

## Guides and development

Use the [documentation index](docs/README.md) to find references and operator runbooks.
See [contributing](CONTRIBUTING.md) for development setup and PR qualification, [CI runs](https://github.com/Hadden-Industries/json-quality/actions/workflows/ci.yml) for candidate results, the [changelog](CHANGELOG.md) for release changes, and the [security policy](SECURITY.md) for private vulnerability reporting.

JSON Quality is licensed under [AGPL-3.0-only](LICENSE).
Distributed components have their own [third-party notices](THIRD-PARTY-NOTICES.md).
