# Third-party notices

## Community policy text

`CODE_OF_CONDUCT.md` adapts Contributor Covenant 3.0 under CC BY-SA 4.0.
Its separate policy-text license does not change the JSON Quality code's AGPL-3.0-only license.

## JavaScript runtime dependencies

JavaScript runtime dependencies are Ajv (MIT) and Prettier (MIT).

## Development tooling

Repository Markdown development tooling uses the published `@hadden-industries/markdown-quality` package (AGPL-3.0-only) as a root development dependency.
Installed packages retain their upstream licenses and notices; the root `package-lock.json` records versions and integrity.
This development tooling is not included in the JSON Quality npm runtime package.

ESLint (MIT) and its official JSON plugin (Apache-2.0) are development dependencies; the latter supports the immutable finite-v1 test oracle and is not a runtime JSON reader.
The independent test oracle Momoa is Apache-2.0 and is a direct development dependency.
Dependency-cruiser (MIT) is a development dependency used for affected-test selection and architecture enforcement; it is not a runtime dependency.

Native npm installation retains dependency licence files; dependency versions and integrity are frozen in `package-lock.json`.
The final transported dependency graph and applicable source/notice delivery must be reviewed before consumer activation or distribution.

## Native platform packages

The shared native component incorporates Boost 1.92.0 (Boost Software License 1.0), ICU 79.1 and its Unicode 18 data (the upstream ICU/Unicode license and included third-party notices), SQLite 3.54.1 (public-domain dedication), and double-conversion 3.4.0 (BSD-style license).

Node-API headers/import-library inputs retain the pinned Node.js license and upstream notices; the host Node runtime remains separately acquired.
The build statically links the selected core libraries into the Node-API module and framed executable; it does not select global ICU or SQLite at runtime.

`native/dependencies.json` records exact source URLs, SHA-256 pins, roles and acquisition bounds.
Each staged platform payload retains its dependency notices, component manifest and build evidence.
Those records bind compiled source/control identities and actual output hashes; the producer retains original source archives and build logs separately.

The source integration, build and staging tools are shipped under `native/` so a recipient can inspect and reproduce the selected integration from the declared upstream inputs.
Producer-only ICU Windows data-generation tools are not a consumer runtime dependency.

These notices describe source and payload ownership.
Final rights review, complete transported notices/source delivery, platform qualification and release authorization remain separate acceptance obligations.

## Unicode normalization conformance data

`tests/fixtures/unicode/NormalizationTest-18.0.0.txt` retains the exact Unicode 18.0.0 normalization test data supplied in the pinned official ICU 79.1 source archive.

The data is copyright © 2026 Unicode, Inc. and is distributed under Unicode License V3 (`Unicode-3.0`).
The associated copyright and permission notice is retained in `tests/fixtures/unicode/LICENSE.txt`; acquisition and byte identities are documented in that fixture directory.
This test data is development evidence and is not included in the npm runtime package.
