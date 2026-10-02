# Publish the scoped owlapi RC and qualify its production consumers

**Status:** Accepted implementation specification, recorded 2026-09-30; scoped implementation prepared on 2026-10-02; final qualification, human release reviews and publication remain pending.

**Authority:** [ADR 0009](../adr/0009-scoped-npm-publication-and-uo-rc-acceptance.md), the [main implementation plan](../implementation-plan.md), the [lifecycle plan](../ontology-lifecycle-capability-implementation-plan.md), and UO's canonical [specification](https://github.com/Hadden-Industries/universal-ontology/blob/main/docs/specs/2026-08-22-self-contained-owl-import-closure-contract.md), [policy](https://github.com/Hadden-Industries/universal-ontology/blob/main/docs/import-closure/contract.v1.json), and [implementation plan](https://github.com/Hadden-Industries/universal-ontology/blob/main/docs/plans/2026-08-22-self-contained-owl-import-closure.md).

The approved change selects a different registry identity and explicitly permits a qualified RC in UO and WebVOWL production after each application's own acceptance.
It preserves the library's semantic, Java parity, losslessness, security, provenance and consumer gates.
The implementation changes metadata, generated views and release qualification without changing runtime semantics or release authority.
A prepared source candidate is not a public or accepted RC.

## 1. Identity and consumer contract

| Concern                             | Required value                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| Project and repository              | `owlapi`; `https://github.com/Hadden-Industries/owlapi`                                             |
| Real npm package name               | `@hadden-industries/owlapi`                                                                         |
| Registry                            | `https://registry.npmjs.org/`                                                                       |
| Selected first public version       | `0.1.0-rc.1`                                                                                        |
| Publication channel                 | `next`; leave `latest` unset                                                                        |
| Recommended consumer dependency key | `owlapi`                                                                                            |
| Exact dependency value              | `npm:@hadden-industries/owlapi@0.1.0-rc.1`                                                          |
| UO dependency section               | `devDependencies`                                                                                   |
| WebVOWL dependency section          | `dependencies`, when its separately authorized registry cutover occurs                              |
| Later stable library target         | `@hadden-industries/owlapi@0.1.0` under `latest`; not a production prerequisite for either consumer |

After publication and registry verification, UO installs with:

```shell
npm install --save-dev --save-exact "owlapi@npm:@hadden-industries/owlapi@0.1.0-rc.1"
```

Its source imports remain `owlapi/apibinding`, `owlapi/model`, `owlapi/io`, `owlapi/formats` and `owlapi/util`.
WebVOWL uses the runtime `dependencies` section with the same exact alias:

```shell
npm install --save-exact "owlapi@npm:@hadden-industries/owlapi@0.1.0-rc.1"
```

WebVOWL also retains its public `owlapi` and `owlapi/*` imports through this alias.
The library additionally exposes the root aggregate and the approved profiles namespace, so package qualification covers seven entry points even though UO needs five namespaces.
Direct installation under the real scoped name is also valid and uses scoped specifiers in application imports.
In both modes the installed manifest, lock resolution, SBOM root, integrity, signature and provenance identify the scoped package.

Keep the relative `exports` keys `.`, `./apibinding`, `./model`, `./io`, `./formats`, `./profiles` and `./util`, their source paths, Java package mappings and binding identities unchanged.
Internal imports remain relative; repository self-reference tests use the actual scoped name after the manifest changes.
Test the recommended alias in an external installed consumer rather than making a source resolver impersonate it.
An npm alias applies only to the declaring consumer; it does not rewrite other packages' dependencies or peer contracts.
Do not add duplicate exports, forwarding modules, wrappers, API aliases or a second maintained package.

## 2. Preparation and implementation slices

### Slice A: Canonical metadata and public documentation

Change `package.json.name` and the corresponding root package-name entries in `package-lock.json` to `@hadden-industries/owlapi` while retaining the selected exact RC version.
Preserve the dependency graph, export targets, engines, license, source layout and repository URLs unless a separately accepted change requires otherwise.
Retain `publishConfig.access=public`, `publishConfig.registry=https://registry.npmjs.org/` and `publishConfig.tag=next`.
Do not replace the version with `0.1.0` merely to permit UO or WebVOWL production use.

Update `util/generate-java-api-surface.mjs` and its validations so the generated package identity and canonical public specifiers use the scoped manifest identity.
Regenerate `docs/compatibility/java-api-surface.json`, its Markdown view and `API.md` from their authoritative inputs.
Update provisional Phase 21/22 `firstPublicRelease` values and the candidate capability release label to `0.1.0-rc.1`; retain historical alpha release identities.
The parity comparison permits only this reviewed package-name/specifier/release-metadata mapping plus the already approved Phase 21/22 semantic delta.
The pinned baseline, approved Java adaptations and absence of new `JS_EXTENSION` remain mandatory.

Refresh README, changelog, compatibility, lifecycle, migration and consumer examples against the implemented state.
Explain where an import uses the local npm alias and where evidence records the real name.
Validate that every documented exported binding exists in the packed candidate.
Do not manually relabel generated API snapshots while the implementation still has the old manifest identity.

**Exit evidence:** Manifest/lock root agreement, unchanged dependency and export graph, regenerated API consistency and installed tests for both direct scoped and native-alias consumption.

### Slice B: Candidate, release and public-registry tooling

Audit package-name/version assumptions in these implementation areas and their existing tests:

- `scripts/workflow-metadata.mjs` and workflow-governance validation;
- `scripts/build-release-candidate.mjs`, `scripts/prepare-downloaded-candidate.mjs`, `scripts/qualify-release.mjs` and retained artifact readers;
- `scripts/qualify-public-registry.mjs`, `scripts/generate-release-evidence.mjs` and `scripts/release-evidence.mjs`;
- GitHub draft/finalization/immutable-release helpers, `scripts/release-reconciliation.mjs` and `scripts/maintenance-published-health.mjs`;
- installed package, package-boundary, browser and WebVOWL consumer fixtures;
- `scripts/qualify-git-package-equivalence.mjs` and its historical evidence bindings, preserving the existing alpha proof rather than rewriting it.

Use one reviewed expected registry identity throughout each candidate.
Reject a bare `owlapi` package, a different scope, a substituted version, an unexpected export or an alias that resolves through a checkout.
Do not broaden the verifiers to arbitrary package names to make the rename pass.
Derive the retained tarball filename from the validated `npm pack --json` result; the usual scoped pack filename is `hadden-industries-owlapi-0.1.0-rc.1.tgz`.
Record each SBOM, checksum and evidence asset name explicitly and carry those records through every job.
Registry tarball URLs can have a different leaf filename; use verified `dist.tarball`, metadata and integrity instead of guessing a URL from the local filename.
Encode the scope correctly in registry requests and npm package URLs/PURLs.
The local alias is not the package identity in an SBOM or attestation.

Fresh public verification must exercise both ordinary scoped installation and the recommended exact native alias using isolated consumer directories and empty caches.
For the alias case, verify the root dependency value, `node_modules/owlapi` installed manifest name/version, registry resolution and integrity, all seven import roots, binding identity, import purity and prohibited deep imports.
Preserve the complete runtime, browser, locked/lockless dependency, material, signature, provenance and immutable-release tests.
Browser bundler and import-map fixtures may retain `owlapi` keys, but their package/provider resolution must name and verify the scoped distribution and full dependency closure.
Do not introduce a CDN runtime requirement or invent new platform support.

**Exit evidence:** Fail-closed metadata, filename, URL and identity tests; full installed candidate qualification; no active release path that still selects the unscoped package.

### Slice C: Controls, provenance and historical evidence

Keep `docs/release/publication-control.json` disabled during implementation and qualification.
Replace its provisional current-candidate identity only as part of the approved executable/configuration change; use an unresolved publication mode until current capability evidence selects one.
Update its schema, release-evidence schemas, closed validators and workflow assertions coherently for the scoped RC.
Do not use the historical alpha reconciliation control as authority for the new package or reuse its run, source commit, asset IDs, tag, digest or approval.

Retain `docs/provenance/releases/0.1.0-alpha.0/`, the original alpha tag, name-history evidence and pre-registry Git equivalence record under their original identities.
Retain the earlier package-name review as an auditable historical record and obtain a new dated scoped-identity review without copying an old approval onto a new name.
Regenerate candidate rights/material inventories and their digests after metadata or packed documentation changes, and obtain any required review for the actual candidate facts.
Preserve personal copyright, company stewardship and third-party licensing distinctions.

The authenticated scope inspection establishes that `maksymshostak` controls the npm organization; refresh effective package/team permissions, 2FA and publishing capability at release time.
It is not a successful registry write, trusted-publisher setup result or release approval.
The unrelated bare package's seven consumed versions do not consume scoped coordinates or dictate a future scoped major version.
Check both the exact scoped registry coordinate and the repository's existing immutable `v<version>` tag before building a releasable candidate.
An occupied or abandoned coordinate/tag requires the existing reviewed successor decision and coordinated consumer exact-pin amendments; never silently reuse or skip versions.

Regenerate the derived `docs/release/gates.json` wording digests after normative plan changes without changing stable IDs or gate topology in this documentation amendment.
New lifecycle/registry acceptance gates are executable implementation work under lifecycle Task 15.
Old gate results remain bound to their old registry digests; generating new definitions does not create passing results.

**Exit evidence:** Current controls and closed schemas agree, publication remains disabled until authorized, historical records are unchanged, and every candidate approval binds current scoped bytes.

### Slice D: UO qualification against the real installed package

The existing `test:universal-ontology` harness supports source and retained-local-candidate qualification.
Add an explicit public-registry installation mode to `util/owlapi-reference/qualify-universal-ontology.mjs` and its tests; do not document an invented already-working CLI flag.
Use a disposable consumer with the exact native alias, an empty npm cache, controlled registry configuration and no ancestor checkout/workspace resolution.
Verify scoped installed name/version, registry URL, integrity and public namespace resolution before invoking any consumer operation.
Source and retained-tarball modes remain clearly labelled prepublication evidence and cannot satisfy public-registry acceptance.

Before publication, run Phase 21/22 parity, both storage formats, strict reconstruction, offline reload, installed boundary, browser, WebVOWL and all four pinned July ontology checks against the retained scoped candidate.
Run the real UO contract suite in isolation when its runner is available; a missing runner or input is an evidence gap, not a passing mock or consumer acceptance.
Upstream installed-composition and pinned-July proofs remain publication prerequisites, while completion of UO's own application and public-registry acceptance follows publication and gates UO production.
An unavailable downstream acceptance runner does not by itself prevent publication of an otherwise fully qualified RC intended to enable that validation.
After publication and artifact verification, run UO's remote-fetch/import-closure tests against the public installed artifact, then its full consumer acceptance suite.
Do not make these post-publication results prerequisites for the first publication of that same RC.

UO's generation path owns catalog-first resolution followed by authorized remote retrieval, finite retries/redirects, cache policy and import-closure materialization.
The completed standalone output must verify offline with zero loader/network calls, no imports, root identity, root-only annotations, the exact axiom union and preserved anonymous-individual relationships.
Preserve lossless-or-fail serialization and atomic output publication.
Keep live remote-fetch evidence distinct from deterministic, offline fixture/oracle evidence.
Downloading an npm package and resolving ontology imports are separate network operations.

**Exit evidence:** Exact artifact identity plus real UO results, including connected generation and offline verification, with no source/tarball fallback, fabricated acceptance or changes to the maintained UO manifest during upstream qualification.

### Slice E: WebVOWL production acceptance

Phase 19D2 replaces WebVOWL's transitional Git transport with the verified public scoped RC through the exact native alias in `dependencies` and a registry-backed lockfile.
Retain separate authorization for that maintained configuration change and for its commit, push and deployment.
The owner-approved RC policy requires no additional exception or waiver because the accepted version is a prerelease.
The transitional Git installation remains non-production; neither it nor retained-candidate qualification is proof of public-registry acceptance.

Before publication, retain the existing installed-candidate WebVOWL gates as package qualification.
After fresh public-registry verification, qualify the maintained application against those exact registry bytes under the main plan's §2.69.
Require a clean install, installed identity/integrity/provenance checks, public-boundary and dependency-ownership checks, the full Jest suite, lint, development and production builds, the ontology corpus, representative RDF/XML and imports-aware workloads, and the required browser checks.
Reject source, Git, workspace, local-file and deep-import fallbacks.
Retain the exact WebVOWL source revision, dependency lock, emitted application artifact, deployment material inventory and notices, health checks and complete known-good rollback target.
Record production acceptance and the RC's support status under `SECURITY.md` before the normal deployment authorization.

Once these gates pass, WebVOWL may use the exact RC in production without waiting for stable `0.1.0` or Phase 20.
UO acceptance cannot qualify WebVOWL, and neither application's incomplete acceptance blocks production acceptance of the other.
Do not make post-publication WebVOWL acceptance a prerequisite for publishing the same RC.
The later stable-version adoption is a separately qualified upgrade; it does not delay accepted RC production use or extend the RC's security-support window.
The target/error migration audit may legitimately report `NO_OBSOLETE_USAGE`; that eliminates a no-op source migration, not the registry dependency cutover or application acceptance.

**Exit evidence:** Verified public artifact identity, the exact maintained application revision and lockfile, complete application results, distribution-scoped materials, rollback evidence and production acceptance, without claiming deployment merely because the package is public.

## 3. Publication and acceptance order

1. Complete the scoped implementation, Phase 21 ancestry/parity reconciliation and Phase 22 candidate qualification at one accepted source revision.
2. Build and retain one complete scoped RC artifact through the approved release workflow; record its digest, manifest, seven exports, SBOM and fresh qualification evidence.
3. Resolve the actual publication mode outside a credential-bearing run.
   npm's documented staged-publishing prerequisite is an existing package, so a new scoped package may require the existing bounded direct bootstrap for this real RC.
   A dry run or organization membership does not prove write authority.
   Configure and verify the exact repository/workflow/environment trusted publisher when supported; use no placeholder publication or silent mode fallback.
4. Obtain the existing exact artifact/publication authorization, follow late signed-tag and protected-environment ordering, and publish the retained artifact with public access under `next`.
   Keep `latest` unset and retain the existing ambiguous-write reconciliation and bootstrap credential removal controls.
   In the direct-bootstrap workflow, only attempt 1 may execute the credential-bearing npm write.
   If that write has an ambiguous response, or later verification fails, rerun failed jobs to perform read-only registry verification of the retained bytes; do not rerun the entire workflow.
   Verification binds the original signed publication run/attempt and authenticated publisher-job result, separately from the current verification attempt.
   Absent, conflicting or unprovable registry state remains a failure and cannot authorize another write.
   Project-owned reads retain §2.58's three-attempt transport/408/429/5xx retry policy; an ordinary 404 requires a later verification attempt and is not automatically retried.
5. Re-download from npm with fresh caches; verify the scoped coordinate, bytes, integrity, signature, provenance, source/tag/workflow and installed runtime/browser behavior.
   Complete release evidence and immutable GitHub release verification.
6. Hand the verified coordinate and evidence to UO and WebVOWL for their own registry-backed consumer qualification.
   UO's own plan owns its manifest/lockfile change, Python removal, normal ontology publication and production acceptance.
   Run UO's remote-fetch and complete import-closure contract suite, and WebVOWL's application acceptance under Slice E and the main plan's §2.69.
7. Once an application's own gates pass, the exactly pinned RC is eligible for that application's production use, subject to normal deployment authorization.
   Stable `0.1.0` is not an additional gate.
   An application remains in qualification if its evidence is incomplete, even when the package is public or the other consumer has passed.

Keep release approval, source completion, registry publication, artifact acceptance, consumer acceptance and deployment as separate recorded states.
An RC is immutable once published; fix it in a later explicitly selected version.
Changing `next` or `latest` never updates either application's exact pin or reuses its acceptance for different bytes.
The later stable library release remains independently gated, and each consumer must requalify before adopting it.
WebVOWL's accepted public RC requires no special prerelease deployment waiver; its normal deployment controls still apply.

## 4. Consumer handoff records

Provide the exact package/dependency names and specifier, registry URL, version, `dist.integrity`, verified tarball digest, canonical source commit, signed tag, release/provenance links, generated API-registry digest and passed capability/qualification results.
UO records its consumer revision, input hashes, resolver policy, remote-fetch results, offline verification and complete contract-suite outcome with that artifact identity.
Keep this as workflow/release evidence, not a newly invented sidecar to the ontology output.
WebVOWL records its exact source revision, manifest/lockfile, installed artifact verification, application and browser results, emitted bundle identity, materials/notices, support status, known-good rollback target, health checks and production acceptance.
Keep deployment authorization and the actual deployment result distinct from qualification.
Do not claim package availability, full Java parity, consumer runner completion or production acceptance merely because this plan names a target.

## 5. Out of scope

Migration to the desired bare `owlapi` name, a forwarding package, dual publication, source aliases, API shims, automatic release tracking and unrelated dependency/toolchain changes are excluded.
No public alpha, stable-version ceremony or W3C reporting programme is added as a prerequisite to either application's accepted RC use.

## References

- [npm native aliases](https://docs.npmjs.com/cli/v12/using-npm/package-spec/#aliases)
- [Publishing an organization-scoped package](https://docs.npmjs.com/creating-and-publishing-an-organization-scoped-package/)
- [npm staged publishing](https://docs.npmjs.com/staged-publishing/)
- [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/)
- [npm immutable publication coordinates](https://docs.npmjs.com/cli/v12/commands/npm-publish/#description)
