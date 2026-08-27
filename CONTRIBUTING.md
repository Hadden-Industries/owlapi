# Contributing to owlapi

Thank you for helping improve `owlapi`. Issues, focused proposals, tests,
documentation, and pull requests are welcome when they respect the package's
public compatibility boundary and clean implementation provenance.

## Before opening a change

- Use an issue or draft pull request to discuss a material public-API or
  compatibility change before investing in a large implementation.
- Check [`API.md`](./API.md), the
  [capability matrix](./docs/compatibility/capabilities.json), and the
  [Java compatibility registry](./docs/compatibility/java-api-surface.md) so the
  proposal does not accidentally advertise an unimplemented Java OWLAPI surface.
- Do not copy or transliterate Java OWLAPI, legacy WebVOWL, or other third-party
  implementation source. Public specifications, observable behaviour, and
  project-owned tests define production behaviour; provenance rules remain
  authoritative.
- Report suspected vulnerabilities through the private process in
  [`SECURITY.md`](./SECURITY.md), and possible conduct violations through
  [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md). Do not include either in a public
  issue or pull request.

## Contribution licence and copyright

Accepted contributions use **`AGPL-3.0-only` inbound=outbound**: the rights you
grant for an accepted contribution are the same GNU Affero General Public
License, version 3 only, terms under which the package is distributed.

Contributors retain copyright in their contributions. Submitting a contribution
does not transfer copyright and does not grant the project unexpressed authority
to relicense it under broader or more permissive terms. By intentionally
submitting copyrightable material for inclusion, you represent that you have the
authority to submit it and to grant the applicable `AGPL-3.0-only` rights. This
includes obtaining any permission required from an employer, client, co-author,
or other actual rights holder.

An issue report, abstract idea, behavioural description, review comment, or
unmerged proposal does not by itself authorize the project to incorporate the
reporter's copyrightable expression. The same contribution terms apply whether
material is offered through a pull request or another channel.

### First external contribution gate

The first external copyrightable contribution to package-owned implementation or
shipped package material may be discussed and reviewed, but it **must not be
merged** until the project records a separate decision to do one of the
following:

1. retain pure `AGPL-3.0-only` inbound=outbound and accept the resulting
   multi-holder relicensing constraint; or
2. adopt a professionally reviewed, contributor-retained-copyright CLA before
   that merge.

This gate applies to substantive source, public declarations, package
documentation or assets, generated distributable content, and copyrightable test
or fixture expression incorporated into production. If ownership or
copyrightability is genuinely unclear, treat the contribution as in scope until
the uncertainty is resolved. A later policy or CLA does not apply retroactively
without the actual rights holder's agreement.

## Source text, syntax, and formatting

Repository text is UTF-8 with LF line endings and a final newline. The root
`.gitattributes` makes that representation independent of a contributor's Git
settings, while the nested override under `docs/conformance/upstream/` preserves
pinned third-party fixtures byte for byte. Do not reformat or normalize those
upstream evidence files.

The root `.editorconfig` defines the shared editor baseline: spaces, two-space
indentation for ordinary project files, four spaces for Python, no YAML tabs,
final newlines, and trailing-whitespace removal. Native ESM and supported
JavaScript syntax are defined separately by `package.json` and
`eslint.config.js`.

The exact repository Prettier version is the canonical formatter for every
supported file not excluded by `.prettierignore`. The empty `.prettierrc.json`
deliberately selects that version's defaults; `.editorconfig` supplies the common
indentation and line-ending settings. ESLint remains the canonical JavaScript
grammar, compatibility, and static-quality check. Run both gates before opening
or updating a pull request:

```shell
npm run format:check
npm run lint
```

To apply the canonical formatter locally, run:

```shell
npm run format
```

## Optional source-development checkout

The ordinary clone is the authoritative repository checkout and includes the
complete provenance and release-evidence corpus. Contributors who need to work
only on package source and its ordinary test resources may instead start with a
blobless partial clone and a positive cone-mode sparse selection:

```shell
git clone --filter=blob:none --sparse https://github.com/Hadden-Industries/owlapi.git owlapi
```

Enter the cloned `owlapi` directory, then select the source-development tree:

```shell
git sparse-checkout set --cone .github LICENSES apibinding docs/adr docs/compatibility docs/conformance docs/migration docs/performance docs/plans docs/provenance/history-reconstruction/review docs/release formats internal io model scripts test util
```

Cone mode also retains repository-root files and the direct files of selected
ancestor directories. The resulting checkout therefore keeps the evidence
manifests, schemas, human-review records and explanatory policy, as well as the
W3C and other conformance inputs used by ordinary parser tests. It omits the raw
content-addressed npm blobs and the bulky history-reconstruction payloads. The
omitted Git blobs remain available from the promisor remote and are downloaded
only if a later Git operation requests them.

This profile is intentionally unsuitable for repository-wide governance,
evidence verification or release preparation. Use focused tests for the source
being changed; the aggregate `npm test`, `npm run evidence:verify`, and every
release gate require a complete checkout and must not silently reinterpret
missing evidence as success. Restore the complete working tree before running
those gates:

```shell
git sparse-checkout disable
```

Sparse checkout reduces working-tree contents, while `--filter=blob:none` avoids
initially transferring omitted file contents. Enabling sparse checkout after an
ordinary full clone does not reclaim Git objects that were already downloaded.

## Preparing a pull request

- Keep each change cohesive and explain its user-visible, compatibility, and
  provenance consequences.
- Add focused tests before implementation changes and run the applicable
  package tests, lint, formatting, conformance, and performance gates.
- Add a proportionate amount of comments where future maintainers need the
  reason for a boundary, compatibility adaptation, security rule, or non-obvious
  algorithm. Comments should explain context and constraints rather than restate
  syntax.
- Update consumer documentation and machine-readable registries whenever a
  public capability, binding, dependency seam, limitation, or controlled
  deviation changes.
- Change generated files through their owning generator. Include both the source
  change and regenerated output, and verify the generator's check mode.
- Keep repository-policy, release, dependency, and package-manifest changes
  separate and obtain the exact approval required by the repository instructions.
- Never commit credentials, private reports, personal data supplied through a
  restricted channel, generated release secrets, or local machine paths presented
  as portable configuration.

Maintainers may ask for a smaller change, additional evidence, or separation of
package work from downstream WebVOWL integration. Review does not guarantee
acceptance or override the rights gate above.
