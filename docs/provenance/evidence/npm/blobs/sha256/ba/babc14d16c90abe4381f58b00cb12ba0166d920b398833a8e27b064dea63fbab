# JSON Quality

[![npm](https://img.shields.io/npm/v/%40hadden-industries%2Fjson-quality)](https://www.npmjs.com/package/@hadden-industries/json-quality) [![CI](https://github.com/Hadden-Industries/json-quality/actions/workflows/ci.yml/badge.svg)](https://github.com/Hadden-Industries/json-quality/actions/workflows/ci.yml) [![Node](https://img.shields.io/badge/node-%3E%3D22.13.0-green)](docs/node-runtime-compatibility.md) [![AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-blue)](LICENSE)

Check strict JSON, JSONL and NDJSON; preserve exact numeric lexemes and member order; catch duplicate decoded keys, invalid Unicode and inconsistent presentation.
One native reader handles small documents and oversized values with bounded memory and owned spill storage.

Install a published version with npm:

```sh
npm install --save-dev --save-exact @hadden-industries/json-quality
```

These examples describe contract cohort **3**, prepared as unpublished development candidate **1.0.0-rc.2**.
Publication and installed qualification remain separate release gates; the source checkout does not establish registry availability.

Create `.json-quality.json`:

```json
{
  "schemaVersion": 2,
  "defaults": {
    "formatContract": "prettier-json",
    "allowFormatWrites": true,
    "normalization": "NFC"
  },
  "exceptions": [
    {
      "paths": [".git/**", "**/node_modules/**"],
      "exclude": true,
      "owner": "Git and npm",
      "reason": "External metadata and installed dependencies."
    }
  ]
}
```

Check complete repository obligations, then select explicit physical files for a guarded write:

```sh
npm exec -- json-quality check --root .
npm exec -- json-quality format --root . -- authored.json
npm exec -- json-quality normalize --root . -- authored.json
```

Checking writes no source files; a spill may create owned temporary storage.
Formatting preserves decoded meaning and exact numeric lexemes.
Normalization explicitly repairs NFC string/key spans and refuses collisions.
Write batches report confirmed writes and any uncertain path; they are not atomic.
Producer-owned, logical and JSONL sources retain their owning write boundary.

Use the typed ESM API:

```js
import { openJsonSourceSession } from "@hadden-industries/json-quality";

const session = await openJsonSourceSession();
try {
  for await (const event of session.check({
    async *open() {
      yield Buffer.from('{\n  "value": 1.00\n}\n');
    },
  })) {
    console.log(event.type);
  }
} finally {
  await session.close();
}
```

[Run the maintained example](examples/source-session.mjs).
A missing terminal means incomplete delivery.
References belong to their open session; materialization is an explicit charged lease with caller-owned domain validation.
See the [API](docs/api.md), [CLI](docs/cli.md), [configuration](docs/configuration.md) and [consumer guide](docs/consumer-guide.md).

Use the public ESLint flat configuration with your installed ESLint:

```js
import jsonQuality from "@hadden-industries/json-quality/eslint";

export default [jsonQuality.configs.recommended];
```

The [identity rule](docs/rules/no-json-stringify-identity.md) rejects JSON serialization used as semantic identity.

Node.js `>=22.13.0` is the compatibility floor.
Qualification covers maintained LTS majors and the owner's explicit advance qualification of Node 26 before its imminent LTS launch.
Other engine-compatible releases receive best-effort support.
Use current security patches; the historical floor is not a security recommendation.
The first platform set is Windows x64 and Linux x64/glibc; keep optional dependencies enabled so npm installs the matching verified native companion.
There is no compiler, downloader or alternate parser fallback at runtime.

Contributors iterate on feature branches and draft PRs.
Marking a PR **Ready for review** requests full qualification of that exact candidate; the owner merges after **CI / acceptance** succeeds.
A later commit invalidates acceptance and requires another deliberate ready checkpoint.
An ordinary merge runs lightweight reuse admission: **REUSED** includes eligible JSON results; **FULL_REQUIRED** waits for an explicit main-qualification dispatch.
Release qualification always binds a fresh source commit and candidate bytes.

Start with the [documentation index](docs/README.md), [contributor workflow](CONTRIBUTING.md), [release operations](docs/release-operations.md), [changelog](CHANGELOG.md) and [security policy](SECURITY.md).
