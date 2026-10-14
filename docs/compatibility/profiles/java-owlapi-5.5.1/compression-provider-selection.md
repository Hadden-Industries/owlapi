# Node document compression provider selection

This SLICE-006 decision implements REQ-004, REQ-008 and REQ-009 within the approved [Node adapter boundary](transport-decision.md).
Selection was checked against npm's current releases on 2026-10-14 and actual Windows Node 24.21.0 consumers in the retained qualification workspace.

Node's built-in zlib supplies gzip, raw DEFLATE and CRC32.
It has no XZ codec.
The selected XZ binding is unmodified `lzma-native` 8.0.6, the current stable release of that binding.
Its packaged Windows backend reports liblzma 5.2.3; this is an older embedded backend, not a claim to use the newest XZ Utils.
The selected operation is `createStream("streamDecoder", { flags: CONCATENATED })`, with no application-supplied memory ceiling.
It accepts the released Java fixtures for all four integrity-check modes and concatenated streams, and rejects corrupt, truncated and trailing-invalid data.
No native build or install script was needed for the tested Windows x64 prebuild.

The tarball contains the binding's complete MIT licence, its copyright notice, and the upstream XZ source archive and licence material.
These remain in the separately installed dependency; OwlAPI does not copy or alter the binary.
The package lock binds the actual distribution.
Native host availability, the older embedded backend, and dependency security remain explicit final review and installed-package checks.
The upstream [threaded-decoder advisory](https://github.com/tukaani-project/xz/security/advisories/GHSA-6cc8-p5mm-29w2) affects 5.3.3alpha through 5.8.0, not this backend.
That version comparison is not a general security clearance.

Alternatives inspected:

- `@napi-rs/lzma` 1.5.1 passed the same XZ byte/failure vectors.
  Its distribution omits licence texts and its documented pending-read cancellation limitation introduces another lifecycle concern.
  It is not adopted.
- `xz-decompress` 0.2.3 ends its wrapper at the first XZ stream, conflicting with Java's concatenation behavior; it also omits complete licence files.
- `xz-compat` 1.2.11's pure JS decoder reads check sizes without validating the data checksums at that boundary.
  It is not adopted.
- `yauzl` 3.4.0 and `@zip.js/zip.js` 2.23.0 require a central directory.
  The latter's `ZipReaderStream` also buffers that directory before emitting entries.
  Java's first-entry reader accepts an archive without it.
- `unzipper` 0.12.5 exposes local entries, but discards data-descriptor CRC values and does not enforce the required first-entry checksum contract.

The residual ZIP work is a local-header/data-descriptor envelope reader around Node's native DEFLATE and CRC32.
It does not extract files, interpret later entries, implement a compression algorithm, or use the central directory as an authority.
Its selection and failure rules are checked against `ObserveCompressionContracts.java`, including a first non-ontology entry, a first directory entry, a missing central directory and corrupt data.

Native fixture bytes and outcomes are retained in [the Central observation set](central-observations.json), independently replayed against the released source build.
Gzip/XZ filename handling, content disposition, double decoding and BOM placement also come from those observations.
The tests read those immutable capture values; they do not generate expectations using the JS decoder.
Final acceptance still requires the consolidated reviews, packed consumer checks and provenance gates.

## JSON Unicode decoding

The separate Hasmac context client detects UTF-8, UTF-16 and UTF-32 from bytes, ignoring the HTTP charset parameter.
Node's native TextDecoder does not cover UTF-32.
The adapter therefore reuses unmodified `iconv-lite` 0.7.3, confirmed as the current npm release on 2026-10-14 and already present in the development dependency graph.
It is now an explicit production dependency of the Node entry point.
Its complete MIT licence and Alexander Shtuchkin copyright notice are present in the distribution.
No install script or native binding is required.

The residual code selects the JSON encoding and frames the first object/array; iconv-lite owns Unicode decoding and native `JSON.parse` owns JSON grammar validation.
It does not introduce a second JSON grammar or Unicode codec.
`ObserveJsonLdTransport` supplies independent UTF-8/16/32, BOM, malformed byte, misleading charset, trailing-content and invalid-JSON byte vectors.
Final rights, SBOM and installed-consumer gates include this dependency as well as XZ.
