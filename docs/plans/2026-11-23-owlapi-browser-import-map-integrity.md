# Scope OwlAPI browser integrity checks to downloaded modules

**Implementation draft · 23 November 2026 · Owner-confirmed integrity decisions · HISEW R2 proposed**

Verify the OwlAPI tarball once with its trusted SHA-256 digest.
Use browser tests to check the staged package’s behavior.
Pin and verify the SHA-384 digest of every JSPM module the browser fixture downloads.
Limit the import map’s `integrity` entries to these provider modules, including their mirrored URLs in the staged browser fixture.
The owner confirmed these boundaries and the same-URL approval rule in DEC-004.

## Why change OwlAPI

| Bytes                                              | From-scratch decision                                                                                                               | Reason                                                                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OwlAPI package and its same-origin fixture scripts | Verify the package at tarball admission. Bind the fixture sources to the qualification revision.                                    | Git identifies the source revision. The candidate digest covers the complete release artifact. The package, fixture and import map are staged under the same trusted control. |
| JSPM modules downloaded over HTTPS                 | Review the exact versioned URL and SHA-384 digest for every direct and transitive module. Verify each response before mirroring it. | The provider can serve bytes independently of the Git revision. A committed expected digest gives the downloader an independent comparison.                                   |

The HTML standard makes import-map integrity optional and lets a page specify a digest for any module URL in the graph.
JSPM recommends generating integrity metadata for CDN modules, including static and dynamic dependencies.
This plan applies that guidance to OwlAPI’s delivery path.
If OwlAPI’s own modules are later delivered through a separately controlled service, or the fixture adopts an integrity policy that requires metadata for them, reconsider first-party browser SRI.
[Git object model](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects.html) · [HTML import maps](https://html.spec.whatwg.org/multipage/webappapis.html#import-maps) · [W3C Subresource Integrity](https://www.w3.org/TR/sri/#introduction) · [JSPM integrity guidance](https://jspm.org/getting-started#import-map-integrity-for-security)

## Inspected baseline

The OwlAPI checkout was on `zero-one-zero` at `72d8c75484e68c84f19483a3864d843641b90b57` during initial planning.
The external review was checked against `b3629fef22c70d70510754c455959745a447c3d9` and the installed JSPM generator.
The working reference map contained 178 local and 39 JSPM digests.
Its eight changed values were all local.
Its imports, scopes and provider pins matched HEAD.
These counts describe the inspected tree and are evidence of the recurring refresh cost.
The acceptance oracle is the actual reviewed dependency graph and exact approved provider pins.

The named preparation script verifies the SHA-256 of the retained tarball before npm installation.
It installs with lifecycle scripts disabled, checks the installed name and version, and copies the installed package into the fixture.
GitHub Actions admits a same-run candidate and runs the fixture in Chromium, Firefox and WebKit.
The tarball digest establishes byte identity against its manifest.
Trusted candidate lineage supplies the provenance claim.
[Browser preparation](../../scripts/prepare-browser-consumers.mjs#L79) · [Downloaded candidate admission](../../scripts/prepare-downloaded-candidate.mjs) · [CI browser jobs](../../.github/workflows/ci.yml#L911) · [Release browser jobs](../../.github/workflows/release.yml#L926)

JSPM traces the installed candidate and the local fixture.
The script compares its full generated map with the checked-in copy before mirroring.
It verifies downloaded response bodies and rewrites the provider pins onto same-origin mirror paths before injecting the map.
The new policy removes the independent per-file baseline for the local staged package and fixture.
Artifact admission and the browser tests become the assurance for those local inputs.
[Generator and hydration](../../scripts/reference-import-map.mjs#L219) · [Reviewed map comparison](../../scripts/prepare-browser-consumers.mjs#L241) · [Reference-browser design](../implementation-plan.md#246-decision-use-jspm-only-as-the-exact-pinned-reference-import-map-tool-and-provider)

## Requirements and acceptance

| Requirement                                                                     | Acceptance and quality scenario                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **REQ-001** Admit the exact first-party artifact.                               | **AC-001 / QA-001** An admitted tarball prepares the fixture and the installed name and version match its manifest. A changed tarball fails before npm install or module staging. Test an OwlAPI package-module body edit and a staged fixture-module body edit separately. Each preserves the dependency graph and produces identical reviewed-map bytes. Browser tests then establish staged behavior.                                                                                        |
| **REQ-002** Admit and verify the complete provider graph.                       | **AC-002 / QA-002** Validate every URL position and require exact equality between the traced provider modules and the set of provider integrity keys. Exercise a missing relative-import pin and an orphan pin. Reject an unclassified URL, malformed SHA-384 pin, redirect, unexpected response status or changed body. A refused module never enters the mirror. Preserve the original reviewed provider URL and digest set at cutover.                                                      |
| **REQ-003** Exercise the native browser import path using the admitted package. | **AC-003 / QA-003** Preserve the public specifiers and scope resolutions. The generated map carries provider hashes by original URL. The served inline import map carries the corresponding hashes by mirror URL and excludes OwlAPI and fixture paths from `integrity`. Assert the injected map in browser qualification and exercise the bundler and worker consumers alongside it.                                                                                                           |
| **REQ-004** Make deliberate refreshes reviewable and recoverable.               | **AC-004 / QA-004** Routine preparation uses the reviewed map and rejects drift without changing the file. A refresh refuses every same-URL digest change that lacks an exact approved replacement. A validated refresh writes its staged evidence before replacing the tracked map and publishes the success manifest last. Prove failure and interruption behavior on both sides of replacement. Acceptance of a same-URL replacement requires fresh qualification of the approved candidate. |
| **REQ-005** Attribute and retain evidence for the producing candidate.          | **AC-005 / QA-005** The browser manifest identifies the tarball and exact generated-map digest, and states `referenceImportMap.integrityScope: "provider-only"`. Verify the manifest, generated map and provider inventory against independently expected content. Retain the originals and browser receipts with the exact producing revision, candidate and actual runner identity. Interpret historical receipts against their own producer and original map.                                |

## Design decisions

### DEC-001 · Verify first-party bytes at tarball admission

Owner confirmed.
Reuse the existing manifest and SHA-256 admission check, npm installation, installed package identity check and fixture copying.
Bind fixture sources to the qualification revision.
The tarball check precedes npm and browser work.
Browser tests cover the staged files after unpacking.
Use the same exact candidate for checks whose evidence is combined.

### DEC-002 · Admit URLs before projecting the generated map

Reuse the locked and installed `@jspm/generator` 2.18.0, its boolean `integrity` option and canonical serialization in `scripts/reference-import-map.mjs`.
JSPM can calculate local hashes internally during tracing.
Only classified provider hashes enter the reviewed and runtime artifacts.
Validate the complete input before dropping any integrity entry.
Use the following closed classification.

1. **Resolve against the actual generator base.**
   Resolve relative and absolute map URLs against the configured application map or its directory.
   Compare filesystem paths against the resolved, verified `packageRoot` and application directory.
   Allow legal rebasing to an installed OwlAPI package outside the application directory, including a relative parent path that resolves inside that exact package root.
   Use platform-aware containment after URL decoding and resolve filesystem aliases before trusting membership.
2. **Admit only the staged first-party files.**
   A package module must be strictly inside the admitted OwlAPI installation and maps to `./package/owlapi/<relative-path>`.
   A fixture module must resolve strictly inside the application directory and belong to the list of files explicitly copied or generated for the browser runtime.
   Derive that membership from the staging file list, including the entry script and generated README exercises.
   Local `node_modules` siblings and any provider mirror path fail first-party classification.
   Bind a local scope prefix to those admitted trees and keep the valid OwlAPI package-root scope.
3. **Admit only selected provider URLs.**
   The current provider origin is `https://ga.jspm.io`.
   Require HTTPS, the selected origin and the exact canonical module URL, without credentials or fragments.
   Preserve the existing query-specific module path mapping where a reviewed module URL has a query.
   A provider scope has a slash-terminated path and contains neither credentials, query nor fragment.
   Scope prefixes define resolution and carry no module pin of their own.
4. **Apply one classifier across the map and trace.**
   Validate target values in top-level and scoped imports, every scope key, every integrity key and both dependency sets returned by `link()`.
   Refuse unclassified inputs, malformed shapes and key collisions after normalization or mirror rewriting.
   Own this policy at the map generation boundary and validate the reviewed map against the same canonical projection before using it.
   Give provider scope and module path translation shared segment and containment checks.
   Reject unsafe decoded path segments and ambiguous encodings.
   Require translated paths to stay strictly under `runtime/provider/` using the existing path utilities.
   The selected provider’s hostname directory is a valid scope target.

Prove the two accepted path classes, including a rebased package root, against refused local dependency and unclassified scope cases.
If the locked JSPM trace omits a required module or yields a valid case outside this classification, inspect the exact fixture trace before approving a change in URL policy.
[Generator option](https://jspm.org/docs/generator/interfaces/GeneratorOptions.html#integrity) · [Repository lock](../../package-lock.json#L1750) · [Current URL adaptation](../../scripts/reference-import-map.mjs#L109) · [Containment utility](../../scripts/release-file-utils.mjs#L15)

### DEC-003 · Match the provider graph and fetch against the reviewed pins

1. **Own closure proof at generation.**
   In the generator adapter, compare the canonical provider module URLs in the union of `link()`'s static and dynamic dependencies with the canonical provider integrity keys in both directions.
   Require external import targets to be members of that set.
   Exclude scope prefixes from module membership.
   A relative transitive import produces a traced URL even when it has no entry in `imports` or `scopes`.
   Refuse a missing or extra pin before any hydration fetch.
   First compare the installed generator's real trace, the projected pins and the original reviewed provider set on one admitted candidate.
2. **Require the repository's exact digest format.**
   Each provider pin contains one `sha384-` token followed by 64 standard Base64 characters.
   Validate this profile as part of admission.
   Reuse the existing byte verifier at the fetch boundary and report the exact URL, expected digest and observed SHA-384 on mismatch.
3. **Pass the admitted reviewed map to hydration.**
   In routine mode, compare the full canonical generated projection with the tracked map, including imports, scopes and all provider pins.
   Pass the reviewed map itself to the existing hydrator after equality succeeds.
   Use the validated draft in explicit refresh mode after the approval checks in DEC-004.
   The trace proves coverage and the admitted map supplies the expected digests.
4. **Reject redirects before following them.**
   Fetch the exact admitted URL with `redirect: "error"`.
   Require an unredirected HTTP 200 response whose final URL equals the requested URL.
   Verify the body before writing it to the mirror.
   Preserve the approved SHA-384 value when rewriting the admitted provider URL to its relative browser path.
   JSPM discovery and the hydration request have different roles.
   The non-following requirement applies to the request whose bytes enter the mirror.
   [Current digest verifier and hydration](../../scripts/reference-import-map.mjs#L145) · [Fetch redirect mode](https://fetch.spec.whatwg.org/#concept-request-redirect-mode)

### DEC-004 · Gate each same-URL replacement and publish refreshes atomically

Owner confirmed the exception conditions.
`--write-reviewed-map` is the explicit refresh route.
Every generated digest change at a URL present in the starting reviewed map is a separate replacement, including drift unrelated to the dependency update the operator intended.
Compare provider entries by canonical URL and refuse an unapproved replacement before hydration or publication.
In an established fixture, restore the approved starting map before refreshing if its file is missing.

Use a proposed optional `--approved-provider-pin-changes <file>` input only with `--write-reviewed-map`.
Reuse the existing JSON reader and canonicalization.
The JSON input contains `startingMapSha256` over the starting reviewed file bytes and `replacements`.
Each entry names `url`, `previousIntegrity`, `replacementIntegrity`, `evidenceReference` and `decisionReference`.
Match the entries one-to-one against the observed changes.
Reject duplicate, extra, malformed or stale entries and partial coverage.
Ordinary new URLs follow the existing reviewed dependency update path.
No switch grants approval for an unspecified digest.

Independently authenticate the exact replacement bytes before the maintainer approves the URL and digest.
Evidence can be a separately authenticated JSPM attestation binding the URL to the replacement digest, or an independently reproduced build from authenticated locked inputs and the exact provider transformation that yields matching bytes.
A second CDN fetch tests consistency.
Comparing an npm tarball and the previous mirror supports review, while an attestation or exact reproduction establishes identity for generated wrappers and chunks.
If that evidence is unavailable, retain the drift refusal.
The maintainer verifies the evidence and records the decision in the existing HISEW review or evidence record.
The CLI validates the exact binding and the declared references.
Retain both records with the new candidate and qualify it afresh in all three engines before acceptance.
[Provider drift rule](../implementation-plan.md#246-decision-use-jspm-only-as-the-exact-pinned-reference-import-map-tool-and-provider)

Keep the CLI as the named npm entry point.
Extract an import-safe staging and publication seam from `scripts/prepare-browser-consumers.mjs`.
Supply the reviewed map and output paths explicitly to that seam.
Test with an injected generator result and provider fetch at their existing boundaries and real temporary files for the publication work.
Use a controllable final replacement operation for interruption and stale-map tests.

1. Capture starting reviewed-map bytes or absence before preparation.
   Check the starting identity and the exact authorization for every same-URL change.
2. Hydrate and verify the candidate mirror.
   Write `reference-import-map.generated.json`, `provider-inventory.json`, `reference-import-map.local.json` and injected `runtime/index.html` in the fresh output directory.
3. Under single-writer checkout custody, recheck the starting reviewed-map bytes, or expected absence when initializing an approved new fixture.
   Stage a unique, owned temp file in the reviewed map's directory.
   Publish its complete validated bytes with atomic replacement.
   Preserve the original map on earlier failure.
   Clean the owned temp file on handled failures and exclude these temp files from fixture copying if a hard stop prevents cleanup.
4. Publish `browser-consumer-manifest.json` last.
   Use a successful preparation receipt and a complete manifest together as the preparation success evidence.
   A failed refresh before replacement leaves the original map and no success receipt.
   After replacement, reconcile an interrupted reply by comparing the tracked file with the staged generated map.
   Use the ordinary reviewed-revision path for qualification.

Before cutover, verify that the architecture graph still records the tracked-map write edge after the atomic replacement.
If the existing file access model misses it, extend that owner narrowly for the observed rename destination and add a regression assertion.
[Current preparation and writes](../../scripts/prepare-browser-consumers.mjs#L241) · [File access tracer](../../scripts/dependency-file-access.mjs#L13)

### DEC-005 · Preserve candidate provenance and make retained evidence self-describing

Add `referenceImportMap.integrityScope: "provider-only"` to the current browser manifest schema.
Keep `generatedSha256` defined over the exact generated map bytes.
Historical v1 records without the new field remain readable against their original map and producer.
Treat absence of the field as legacy metadata and establish its actual scope from those originals.
Check for any supported external reader before cutover.

The current CI and release browser jobs download the candidate and run preparation and Playwright.
Their qualified fixture output is runner-local.
Use the existing local or HISEW evidence retention path to retain the exact manifest, generated and injected maps, provider inventory, governed mirror archive and refresh authorization evidence.
Bind these originals to the producing commit, tarball digest and applicable job and attempt identities when combining hosted browser receipts with local evidence.
An exact original must be available and admissible before claiming retention or release coverage.
If required originals exist only on an ephemeral runner, plan a separately authorized retention change before qualification cutover.
[CI preparation](../../.github/workflows/ci.yml#L911) · [Release preparation](../../.github/workflows/release.yml#L926) · [Retention rule](../implementation-plan.md#246-decision-use-jspm-only-as-the-exact-pinned-reference-import-map-tool-and-provider)

## Implementation slices

### SLICE-001 · Qualify routine preparation with the approved provider pins

Start from an admitted candidate and reviewed map from the authorized implementation baseline.
Project the original map, proving identical imports, scopes and provider pins.
Confirm the installed link trace against that provider set before depending on its equality check.
Implement the closed URL classes, coverage check, reviewed-map authority and non-following provider fetch in the routine path.

Prove both local body-edit cases and the refused inputs in QA-001 and QA-002 using fixed expected URLs and digest fixtures.
Include mapping values and scope keys, a rebased installed package, a missing relative transitive pin, an orphan pin and a URL whose fetch is refused before following a redirect.
Check the actual served inline map in the existing Playwright import-map case.
Compare its SHA-384 digests and their multiplicities with the reviewed pins.
Assert that every integrity key is a provider mirror URL.
A fixed staging test with a known URL-to-mirror example checks exact key and value rewriting.
Run the normal named preparation and Chromium path on that candidate.

Likely edits are `scripts/reference-import-map.mjs`, `scripts/prepare-browser-consumers.mjs`, the checked-in map, `scripts/reference-import-map.test.js` and the existing Playwright consumer test.
Treat this as an integration checkpoint.
Cut over the reviewed projection after the refresh guard in SLICE-002 is ready.
**Trace** REQ-001–003, QA-001–003, DEC-001–003.

### SLICE-002 · Prove exact approval and refresh recovery

Have the owner-confirmed boundary and exception recorded in a new browser integrity ADR under `docs/adr/` at the next available number.
Amend §2.46 with a clearly dated reference and carry the corresponding tests and phase contract in the same accepted change, following the repository's normative procedure.
Preserve the fail-closed rule for ordinary drift.

Drive the extracted seam through a normal provider update that also contains unapproved drift at an existing URL.
Prove that the refresh refuses the change and preserves the tracked map.
Exercise absent, wrong, extra and matching approvals with fixed provider bytes and independent expected digests.
Use a fresh output area for refusal, stale starting map and interruption before and after replacement.
Check that staged map and inventory outputs precede the commit point and that the success manifest follows it.
Verify the final file access graph and temp file isolation.
Likely tests extend `scripts/reference-import-map.test.js` or a focused preparation test alongside the extracted seam.
**Trace** REQ-002/004, QA-002/004, DEC-003/004. [Normative-change procedure](../governance.md#normative-change-procedure)

### SLICE-003 · Qualify the final candidate and retain the originals

Use the established three-engine routes against the exact final source and candidate.
Run the existing packaged public-contract, bundler and worker coverage.
Read back the new manifest scope, canonical map digest, mirror inventory and retained receipts.
Check that evidence from the previous map representation or from a different candidate cannot establish the new qualification.

Place operator fixture and refresh guidance in [docs/development/npm-scripts.md](../development/npm-scripts.md), including the approval record and recovery rules.
The ADR and §2.46 own policy.
Those three development documents are outside the npm pack scope.
Continue using the published README's existing reference-map link.
Check the native pack inventory and bind browser proof to the verified tarball.
If the [historical Windows Firefox launch limitation](../adr/0013-bounded-private-read-models.md#invariants-and-proof) recurs, retain the failed local observation and use a functioning, qualified Firefox runner against the same candidate.
Accept the matrix after all three engines produce eligible results.
**Trace** REQ-001–005, QA-001–005, DEC-001–005.
[Package files](../../package.json#L34)

The release maintainer owns integration.
Recheck HISEW custody and select a clean, authorized OwlAPI checkout before changing implementation or packing a candidate.
The inspected checkout contains unrelated Java-parity work, including local reviewed-map edits.
Preserve that work and obtain explicit approval before creating a branch or worktree.
Estimate **6–10 hours** for implementation, focused proof and documentation, with **45–90 minutes** allowed for the browser lanes once the candidate and runners are ready.

## Verification and retained evidence

1. **Focused feedback.**
   Use fixed known module bytes, independently fixed SHA-384 values and expected URL sets.
   Use the existing byte verification tests and inject provider responses and the trace result at their real boundaries.
   Check the projection with both first-party file classes.
   Observe failed refresh and retry against real isolated files.
2. **Real consumer.**
   Establish one live provider fetch and digest proof for the exact candidate, or admit mechanically equivalent existing evidence under §2.46.
   Inspect the actually injected import map and run the named browser consumer.
   Node hydration verifies the provider bytes on every supported browser route.
   Use the full three-engine result for release qualification.
3. **Final assurance.**
   Apply the repository's JSON identity, lint, formatting and architecture gates to the staged candidate.
   Inspect the graph for the reviewed-map write edge.
   Reuse admissible equivalent checks under normal HISEW receipt rules.
   Freeze the final candidate for independent R2 verification and scoped security assurance of URL admission, pin authority and the refresh commit boundary.
   Retain evidence as in DEC-005.

Build a local candidate when there is no already admitted exact artifact.
Use unique local output directories.
The graph exporter expects a new absolute directory outside the repository.
When composing final checks, reuse equivalent JSON and Markdown proof from the combined commands.

```text
npm run build:release-candidate -- --output <fresh-candidate-directory>
npm test -- --runInBand --runTestsByPath scripts/reference-import-map.test.js scripts/browser-fixture-server.test.js scripts/candidate-bundle.test.js
npm run prepare:browser-consumers -- --candidate <admitted-candidate-directory> --output <fresh-fixture-directory>
npm run test:browser -- --fixture-root <fixture-directory> --project chromium
npm run test:browser -- --fixture-root <fixture-directory>
```

```text
npm run check:json
npm run lint
npm run format:check
npm run verify:architecture
npm run graph:dependencies -- --output <new-absolute-external-directory> --focus scripts/prepare-browser-consumers.mjs
```

Use the individual browser project flags for outstanding engines if an earlier receipt covers the exact final candidate.
Keep staging and dependency caches on local storage and use process-scoped settings.
[Named scripts](../../package.json#L100) · [Browser runner](../../scripts/run-browser-tests.mjs#L22) · [Graph export](../dependency-graph-and-tests.md#generate-an-observation-bundle)

## Cutover, recovery and reconsideration

- **Cutover.**
  Integrate the projection, checked-in map and refresh guard together with the approved normative amendment.
  Produce evidence for the exact candidate.
  Preserve historical receipts and their original graph and pin identities.
- **Signals.**
  A tarball mismatch identifies artifact admission.
  A map difference identifies graph or pin drift.
  A fetch refusal identifies the URL and status where available.
  A digest mismatch records the exact URL and expected and observed SHA-384.
  A rejected refresh identifies each unapproved or stale URL.
  The final manifest and successful receipt establish completed preparation.
- **Abort and retry.**
  Stop qualification for unresolved URL, graph, byte or provenance discrepancies.
  Retain the failed observation.
  Use the approved recovery path in DEC-004 for a same-URL replacement.
  Use a fresh isolated output directory after an incomplete preparation.
  Reconcile a published tracked-map draft with its staged generated map before treating it as the new reviewed input.
- **Rollback.**
  Restore the previous preparation logic and its matching reviewed map as a pair through a normal corrective change.
  If the selected artifact differs from the restored map's source, regenerate that format from the exact admitted candidate and review its provider pins.
  Existing release recovery controls govern published candidates.
- **Reconsider.**
  Pause the affected cutover if the native trace misses a transitive module, a supported consumer requires first-party browser SRI, an off-repo reader needs the old representation, or required evidence cannot be retained.
  Inspect the exact trace, consumer or receipt first.
  Carry forward independent work that preserves the reviewed graph and the owner's integrity decisions.

## HISEW route

| Routing field              | Decision or evidence                                                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Risk class                 | **R2 proposed.** This change alters verification in a cross-system CI and release gate and defines approval and recovery for provider pin changes.                                                                                                     |
| Decision owner             | OwlAPI release maintainer. The adjoining release plan names Maksym Shostak.                                                                                                                                                                            |
| Reasoning                  | Exact package verification and complete provider pins are release inputs. A projection or refresh error could omit a required pin, admit changed bytes or block all browser lanes.                                                                     |
| Potential blast radius     | Browser preparation, reviewed map publication, retained provider evidence and CI/release browser qualification for the next candidate.                                                                                                                 |
| Reversibility              | Restore compatible preparation logic and reviewed map together, then establish evidence against the exact candidate.                                                                                                                                   |
| Principal unknowns         | Trace equivalence on the final candidate, any off-repo artifact reader, and availability of an independent oracle for a future JSPM rebuild. SLICE-001 and SLICE-003 test the first two. DEC-004 gives the refusal path for the third.                 |
| Required artifacts         | Accepted requirements snapshot and normative ADR, frozen candidate, exact map and mirror originals, covered receipts, independent review and release readiness disposition.                                                                            |
| Required specialist lenses | Browser and release contract review, independent verification of the trust boundaries, and scoped security assurance for the final diff.                                                                                                               |
| Required verification      | Start with trace and reviewed-pin equivalence. Finish with actual browser and refresh boundaries, the final candidate matrix, architecture graph and retained evidence readback.                                                                       |
| Required human approvals   | The owner confirmed the first-party boundary and the same-URL JSPM policy. Admit the exact R2 requirements before implementation. A future same-URL replacement requires its own URL and digest approval. Publication follows existing owner controls. |
| Maximum sensible autonomy  | Use the accepted execution for bounded implementation and affected verification after establishing clean checkout custody.                                                                                                                             |
| Next lifecycle step        | Recheck checkout ownership, record the normative decisions, and bind the accepted requirements in HISEW before starting SLICE-001.                                                                                                                     |

The observations above come from inspected source and installed tooling.
The verification rows state prospective evidence.
[Adjoining release plan](2026-11-18-promote-qualified-ci-artifacts.md)
