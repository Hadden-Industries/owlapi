# JSON-LD provider source change

This directory contains a reproducible browser-compatible build of `jsonld` 9.0.0.
The source change adds the public processor option `maxContextUrls` and passes it to each operation's context resolver.
It retains the upstream effective default of 11 URLs and its cycle detection.
The Java behavior policy supplies the independently observed provider boundary of 257 URLs.

The normal document-loader interface remains responsible for access, native allowlist rules and cached documents.
No context is flattened or rewritten to evade a limit.
The installed dependency is never edited, and no private field or prototype is changed at runtime.
Both behavior profiles use this provider.

Rebuild with `node scripts/build-jsonld-provider.mjs` after installing the repository lockfile.
`build-manifest.json` retains every build input digest, the complete two-file source change, builder identity and tool versions, the lockfile digest, bundled package identities and the output digest.
Verify exact reproduction with `node scripts/build-jsonld-provider.mjs --check`.
An upstream update must requalify that change and the JSON-LD consumer tests before rebuilding.
Remove this source change when upstream exposes an equivalent supported option.

The JSON-LD implementation is reused under its BSD-3-Clause license, retained in `LICENSE.txt`.
Original license and notice files for every bundled package and the bundler runtime are retained under `licenses/` and hashed in the build manifest.
Generated output retains upstream legal comments.
This is a maintained provider build, with an explicit source change at the limit owner.
It is not a second JSON-LD algorithm or a new OWLAPI configuration default.
