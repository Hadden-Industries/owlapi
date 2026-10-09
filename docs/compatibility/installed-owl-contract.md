# Installed OWL interface qualification

CI and release run `test:owl-contract` against their own exact retained tarball.
The suite exercises public OwlAPI exports and OWL data only.
It loads no UO, VOWL or WebVOWL adapter, projection, build, renderer, filter or worker protocol.
Existing producer portability and browser jobs remain required; their native package fixtures now also exercise the public model fields and acquisition metadata used by the current consumers.

The owner accepted both 6 October 2026 implementation plans.
They were committed first at `a83bf47b55c3043d0a3fe779d6435f16d590013d`.
HISEW execution `aaba2f74-408b-4659-8e45-5b163d936ebf` uses the accepted R2 route and protected plan snapshots `a60f607d-41dc-4eaf-a6ce-593883169f98` and `007fd39d-2c57-4a62-95f6-31e18ee72d93`.
Implementation evidence, review and hosted acceptance are recorded separately; this specification is not a release or deployment approval.

## Inventory and independent oracles

The initial committed source review covers UO `e2b7cd888a5d38bb32e7c42853c0b1b6dd301a36` and WebVOWL `c10c41003de9c0fb1940964f3bb40274174538c2`.
The UO advancement from the planning snapshot changed development manifest/lock evidence, with unchanged relevant OWL call sites.
Local consumer working copies are not qualification inputs.

The 7 October 2026 inventory review advances the source bindings to UO `45fce47ce0b226cf4fd25b152f482758eeb268b8` and WebVOWL `f3cb7b19fcb6f334889d86532eb834f9f3b5f86a`.
Only UO's root package manifest and WebVOWL's root and VOWL package manifests changed within the captured seams.
UO changed development/documentation commands; WebVOWL changed development dependencies and the runtime `@hyperjump/uri` dependency from `1.3.6` to `1.3.8`.
The OwlAPI dependency declarations and all inventoried OWL interface code remain unchanged.
This refresh changes source identities and their derived inventory digest; it preserves the 68 producer assertions and the strict rejection of future unreviewed source changes.

The inventory consists of 69 native named assertions: nine boundary groups and 60 explicit public model shape cases.
The reviewed names live in `test/consumers/owl-contract/public-model-cases.js`; cases spell out supplied operands and expected public fields.
Each owning probe must fail when its promised public value changes.
Neither candidate output nor consumer output is used to generate an expected semantic result.

| Committed consumer seam                                                                             | Producer obligation and oracle                                                                                                                                                                          | Owning native assertion                                                                                 |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| UO materialization/build entry points; VOWL loading                                                 | Native public exports, identity and alias resolution from the installed candidate, supported format names and typed exports                                                                             | public package exports and native installation identity                                                 |
| VOWL `modelBuilder.js`; UO structural fingerprint and declaration reads                             | Kind, entity IRI, literal lexical form/datatype/language, annotation fields and structural identity; authored URNs and supplied handles                                                                 | public literal, annotation, entity and structural identity; 60 public model field cases                 |
| UO document loader/catalog mapper; VOWL loading and compatible loading                              | Actual graph documents and ontology identity, direct imports/axioms, frozen document/import context, format/configuration and public missing-import failure                                             | document graph, loader context, configuration and missing-import errors                                 |
| UO lossless-load checker; VOWL source evidence                                                      | Document diagnostics, source structure, RDF triple/header/unparsed/guessed-declaration metadata and declaration field shape; small authored RDF and existing preservation fixture                       | RDF parser metadata and retained source evidence; profile validity, uncertainty and parser preservation |
| VOWL profile policy                                                                                 | Real producer profile validity and uncertainty; independent declared structural expectations and retained lexical assertions in existing producer fixtures                                              | profile validity, uncertainty and parser preservation                                                   |
| UO collapse/writer/standalone verifier                                                              | Imports closure/provider/merger, identity and annotation changes, source/target getters, deterministic storage and unchanged-target failure; four authored closure documents and expected counts/axioms | imports closure, merger, ontology changes and storage failure contracts                                 |
| WebVOWL `canonicalVowlSourceAcquisition.js`, `canonicalInputSelection.js`, `webMcpToolContracts.js` | Public format key/media/extension metadata, positive bounded safe defaults and immutable caller configuration; independently authored registry and explicit custom limits                               | public format metadata and acquisition-independent loader configuration                                 |
| UO document loader; WebVOWL `importResolver.js`                                                     | Public missing/unloadable/resource/security error constructors, codes, native causes and supplied detail fields                                                                                         | public import, resource and security error identity and details; graph loading failure                  |
| UO materializer prefix preservation; public writer configuration                                    | Manager-local immutable settings, copied RDF/XML prefixes, reserved-prefix rejection, configured save and reload; authored configuration and OWL fixtures                                               | manager-local immutable writer configuration and configured RDF/XML save                                |

The reused `test/import-closure/public-contract.js` specifies independent OWL structures and failure expectations and already runs in producer browser modes.
Its closure fixture includes shared/cyclic relationships, annotation changes, identity changes, deterministic serialization and non-representable storage.
Projection, annotation selection, UO losslessness policy, remote retries, atomic publication and application deadlines are excluded from the oracles.
Factory shape assertions supplement parser/Java conformance; they do not claim that every syntax can produce every shape.

## Pinned consumer-source admission

The owner's 9 October 2026 amendment makes `docs/release/owl-contract-sources.json` the input selection for qualification, CI evidence reuse and release preflight.
Edit the commit and reviewed tree/blob bindings only in [the source configuration](../release/owl-contract-sources.json); every executable reader and test uses that one definition.
Commit values in dated decision records below are historical observations and are not additional settings.
Each acquisition reads those exact commits and their complete native Git trees, then verifies the configured root tree, reviewed interface file/blob identities and source digest.
The report preserves every configured identity; `defaultBranch` records review provenance and does not select a moving branch.
Missing or substituted pinned source fails admission without falling back to a branch head or another revision.

The bounded scopes cover UO's `scripts/ontology` and its three relevant entry points, VOWL's `packages/vowl/src/owl`, the four direct WebVOWL metadata/error call sites, and consumer package manifests.
Production imports were checked at the immutable SHAs with native Git search; consumer tests, historical migration generators and notice tooling are not runtime interface oracles.

A proposed pin update requires review of edited interface files, removed/new adapter files and new interface subdirectories.
A changed consumer algorithm does not justify a new producer assertion.
Review may refresh only source bindings when all supported interface obligations remain covered.
No automatic baseline updater or success-map generator exists.
Consumer branch movement, including manifest-only changes, leaves qualification inputs unchanged until an explicit reviewed configuration update advances the pins.
After an update, obtain candidate qualification against the selected commits; a receipt from a different commit is inadmissible even when its interface blobs match.
Compatibility evidence covers this selected baseline, not later consumer changes.
Relevant future entry points outside these seams require explicit inventory expansion.

Transport permits only the fixed public GitHub API repositories and native metadata/commit/tree paths, no branch-ref lookups, redirects or archives.
Its shared bounds are 32 requests, 60 seconds, 4 MiB per response and 16 MiB total.
Truncated trees, non-ordinary interface files, invalid UTF-8 and unavailable reads fail closed.
The optional workflow read token stays at the fixed API origin and is cleared from installed semantic test and installation child environments.

## Candidate and execution evidence

Native candidate bundle verification precedes a unique isolated npm installation with lifecycle scripts disabled.
The candidate is installed under the actual `owlapi` dependency name; the suite imports its public root/subpaths and checks real resolution and package identity.
Producer network guards run before any candidate import.
Cleanup removes only the tool-created installation.

The Node test runner's custom reporter records actual native pass/fail events, names, skip/todo state and failure details.
A successful qualification requires the exact registered assertion sequence once, with no missing, failed, skipped, pending, duplicated or unregistered assertion.
Raw `native.ndjson` is retained even for semantic failures.
Successful `qualification.json` requires a fresh empty output directory and binds package/tarball, same-run artifact ID/digest, workflow/run/producing attempt/commit, source snapshots, fixture/inventory and native report digest.
The coverage command reads and validates both files.

CI qualification schema/policy version 4 replaces the historical `webvowl` check with `owl_contract` and `CI / installed OWL contract`.
Old schema-3 verdicts cannot satisfy it.
The aggregate also compares the proof's candidate artifact with the retained candidate output.
Main reuse revalidates the configured consumer pins before admission; different pins require fresh qualification, while moving consumer branches do not invalidate evidence.
The exact-base reader has the same guard but currently has no production caller; it does not authorize selective omission.
Partial reruns retain only bounded earlier successful producing attempts in the same authenticated run.
Selective omission remains unapproved.

Release uses identical assertions and native coverage.
Both source Node 24 jobs also run the complete live pinned Java parity inventory and the pinned UO-origin July producer corpus (parsing and both closure formats).
The retained candidate depends on that same-commit source qualification; the installed interface suite separately binds the exact retained tarball.
These producer semantic checks execute no UO materialization code or WebVOWL application code.
Publication preflight downloads the exact same-run proof by artifact ID with native digest enforcement, compares its tarball and execution identity, validates raw assertions, and revalidates the configured consumer pins.
Release evidence schema 4 retains that producer proof and requires the installed-contract job; old schema-2/3 assets remain readable as historical evidence and cannot satisfy current producer finalization.
Historical schema-4 reading validates its recorded inventory and bindings, so later fixture or reviewed-source changes do not invalidate an immutable archive.
New evidence construction and current finalization still require the current oracle.

## Active release policy and recovery

`producer-release-policy.json` splits all active mixed requirements.
Its deterministic `producer-gates.json` projection gives revised obligations new IDs and digests, replaces the Phase 21 checkpoint's application dependency with installed producer proof, and preserves rights, package/dependency/material, security, registry/byte identity, signed API ancestry and pinned UO-origin producer corpus/Java obligations.
Entirely application-owned dependency and bundle acceptance is retired from producer requirements.
The original plan catalogue, `gates.json` projection and historical reports are preserved.
No old application PASS is relabeled as new producer evidence.
Requirement-ledger inspection selects definitions by the recorded registry byte digest and verifies each requirement digest.
If an older definition snapshot is unavailable locally, supply the retained `--definitions` file; current IDs never alias retired IDs.

The separate reconciliation workflow is retained solely for its previously authorized unscoped alpha recovery.
Current scoped publication control has `reconciliation: null` and grants it no authority.
Scoped recovery uses the existing authenticated same-run failed-job rerun path, retaining original successful producing/publication attempts; it does not regenerate or relabel alpha evidence.

An owner dispatch of `release.yml` with `qualification_only=true` runs the producer qualifications on the exact captured branch.
Publication preflight, release environments, tag acceptance, npm publication, registry publication readback and GitHub release mutation jobs are excluded.
Ordinary release mode continues to require current protected main and the existing publication controls.
This mode exists for publication-free hosted validation of the coordinated migration, not consumer monitoring.
GitHub's documented branch dispatch and Boolean input semantics are the underlying native controls.

Rollback is one coordinated ordinary revert of runner/inventory, workflows, readers/writers and active producer policy.
Restore matching protocol versions and obtain fresh candidate qualification; do not rewrite historical evidence.
Configured consumer-pin mismatch, unexplained public contracts, candidate mismatch, missing native proof or surviving downstream prerequisite requires repair and requalification, never a fabricated success or ordinary waiver.

## Decision basis

The 9 October 2026 inventory review binds UO `9a3b5bff5aeaff4540f14bdf65baeffc1c0d188d` and WebVOWL `1d669a6261bbc2e124dfc1fcbc7fb735faf872ca`.
Within the captured UO seams, the root manifest adopts the exact OwlAPI Git pin, the materializer copies loaded RDF/XML root prefixes, and the qualifier and its identity collector are explicitly renamed as historical RC lineage.
The inventory follows `scripts/qualifyHistoricalRcImportClosure.js`; that file is not current Git-source acceptance.
Current UO acceptance remains with its maintained qualification and full-build checks.
WebVOWL's only captured change is its root manifest's documentation tooling commands, markdown probe entry and bounded Jest worker setting; its OwlAPI dependency and all inventoried OWL interface modules are unchanged.
The existing shared writer-configuration probe now also loads an authored RDF/XML prefix, copies it through `RDFXMLDocumentFormat.copyPrefixesFrom`, rejects a reserved XML prefix, saves through the public manager, and reloads the authored class axiom.
The same probe runs against installed Node, browser document and dedicated worker consumers, retaining the existing named assertion inventory.
Source bindings, candidate/fixture digests and browser import maps remain independently verified; unreviewed changes to selected source still fail admission.

The subsequent 9 October 2026 source review advances WebVOWL from `b7ee72199d75674578c6657d90964c039959b390` to `a468e17701d495fd9e1a801aef169894b2045186`; UO remains at `9a3b5bff5aeaff4540f14bdf65baeffc1c0d188d`.
The only changed captured blobs are WebVOWL's root and VOWL package manifests, which replace the published rc.1 dependency with the exact OwlAPI Git commit `ccace6afe201c6e2cc6a49e53b2d50bd6617916f`.
Every inventoried OWL interface module is byte-identical to the previously reviewed snapshot, so the existing producer obligations and native assertions cover this source refresh.
The reviewed source bindings and their derived inventory digest were refreshed under the admission policy then in force.

The subsequent pinned-input decision preserves those exact configured identities and all 69 native assertions.
It replaces repeated latest-branch capture with deliberate consumer-baseline updates across the shared runner, CI reuse and release preflight.
The semantic inventory digest continues to bind assertion names and source blobs; the report's separately validated consumer commit/tree identities enforce the selected pins.
Historical archive validation retains its recorded definitions, while current admission requires the selected baseline.

First principles place assertions with the party that owns the public guarantee: OwlAPI owns parsing/model/loading/storage/profile data; consumers own their composition and UI.
Modern practice favors small independent contract fixtures at that seam, native package resolution and explicit artifact provenance.
Authoritative guidance supplies the native transport and identity controls: [GitHub repository metadata](https://docs.github.com/en/rest/repos/repos#get-a-repository), [complete native Git trees](https://docs.github.com/en/rest/git/trees#get-a-tree), [secure Actions use](https://docs.github.com/en/actions/reference/security/secure-use), [Node native test reporters](https://nodejs.org/api/test.html#test-reporters), and [branch dispatch](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
The adopted repository practice already provides retained candidate verification, producer browser modes, typed receipts and fail-closed aggregate controls.
The implementation extends those seams without a consumer shim, test framework, additional runtime dependency or alternate governance ledger.
