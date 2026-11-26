# Qualify OwlAPI against the dependencies its npm consumers actually install

**Implementation plan for `zero-one-zero` · 26 November 2026 · Owner design review complete · Proposed HISEW R3**

Promote the exact OwlAPI tarball that passed CI.
Keep the release SBOM tied to the repository-locked production install.
A fresh consumer may legitimately receive other transitive versions.
Accept that install when npm's declared relationships explain the difference, the packages and their sources pass the applicable supply-chain policy, and the supported consumer checks pass on the observed graph.
Carry the evidence for that decision through release admission, public verification and GitHub sealing.

For example, a candidate qualified with `@types/node@26.6.10` can pass public verification with `26.6.11`.
The release SBOM continues to identify `26.6.10`.
The public observation identifies `26.6.11`, the requesting parents, the actual archive and the tests and checks that covered it.
A substituted OwlAPI tarball, a changed direct pin, contradictory bytes for one immutable coordinate, or a failed consumer check blocks acceptance.
npm excludes the library's `package-lock.json` from the tarball.
The application owner can reproduce its chosen installation with its own lock and `npm ci`.
Explain these two inventory scopes in the release qualification record and operator guidance.
[npm package contents](https://docs.npmjs.com/cli/v12/configuring-npm/package-json/#files) · [npm ci](https://docs.npmjs.com/cli/v12/commands/npm-ci/) · [CISA SBOM types](https://www.cisa.gov/sites/default/files/2023-04/sbom-types-document-508c.pdf)

The owner accepted both design decisions on 26 November 2026.
DEC-004 applies the standing licence rule to eligible, separately installed external archives.
DEC-005 selects option B for the first rollout.
An operator may start the protected evaluator on demand, and the seal requires its signed, current decision for the exact observed graph.
Formal HISEW baselining and release qualification are subsequent steps.
[Key Design Decision](2026-11-26-npm-audit-evidence-key-design-decision.md)

## Baseline and authority

- **Incident.**
  At `1be038f41161a4a960d62d60ee19523edce29b48`, the retained Windows candidate had SHA-256 `1a8f3ebaf83dae97ba6b9f1756d09f9e0178aa0327d6b83f6cf446912d11c002`.
  Its locked install and CycloneDX npm inventory agreed.
  A fresh install of the same bytes changed one of 47 distinct package identities.
  Both `rdfxml-streaming-parser → @types/readable-stream → @types/node` and `rdfxml-streaming-parser → rdf-data-factory → @rdfjs/types → @types/node` permit `*` at the last edge.
  Replaying the saved consumer graph through the public SBOM assertion reproduced the rejection.
  The rc.3 reconciliation records the same pattern for `26.6.5 → 26.6.6`.
  These are dependency-resolution observations.
  [Candidate producer](../../scripts/build-release-candidate.mjs) · [Inventory assertion](../../scripts/npm-production-graph.mjs) · [rc.3 evidence](2026-10-29-0.1.0-release-reconciliation.md)
- **Working state.**
  The branch and its remote tip agreed at inspection.
  The owner's separate lockfile refresh to `26.6.11` is present in the working tree.
  The committed source inventory covers `26.6.10` and binds the prior lock digest.
  Source-lock evidence, dependency governance, third-party material and rights must be reconciled by their existing owners for the eventual candidate.
  The 0.1.0 review records currently say `PENDING_HUMAN_REVIEW`.
  The refresh addressed the single-version incident and provides a regression example.
  [npm evidence](../provenance/npm-package-evidence.json) · [Material inventory](../provenance/third-party-material.json) · [Rights inventory](../provenance/rights-inventory.json) · [Dependency governance](../dependency-governance.json)
- **Controlling contracts.**
  Sections 2.47–2.51 establish the locked SBOM, clean consumer resolution, tarball inspection, material and signature obligations.
  Section 2.48 permits explained transitive differences.
  The active producer-policy replacement for `P19-OWL-CONTRACT-001` also calls for “complete package-tree/production-graph equivalence”, and the staged runbook directs comparison of public installs with the qualified SBOM.
  Section 2.48's initial manifest prohibition on overrides also predates the current reviewed producer/tooling overrides in the packed manifest.
  Clarify their producer-root scope and remove their injection into ordinary consumers.
  Amend the current instructions and regenerate their owning projections.
  Specify which two subjects each equality covers.
  Preserve exact first-party installed files, exact locked SBOM, exact replay of an individual observed lock, and the separate historical Git-versus-tarball equivalence test.
  [Implementation policy](../implementation-plan.md#248-decision-publish-an-ordinary-library-dependency-graph-not-a-locked-deployment-tree) · [Current producer policy](../release/producer-release-policy.json) · [Producer gate projection](../../scripts/producer-release-policy.mjs) · [Staged operations](../release/staged-operations.md) · [Pre-registry qualification](../../scripts/qualify-git-package-equivalence.mjs)
- **Scope.**
  Change release and CI evidence on `zero-one-zero`.
  Current remote `main` at `c9b831074dcbdcac75f45e22d449b74d7af0773a` rebuilds the candidate in its own release run.
  The staged reuse and sealing design below belongs to the proposed branch.
  Product APIs, supported runtimes, published dependency declarations, the reviewed JSPM map, channel policy, signing authority, downstream application locks and immutable historical releases retain their respective owners.
  [CI promotion decisions D1–D6](2026-11-18-promote-qualified-ci-artifacts.md#decisions-for-implementation) · [Runtime policy](../release/runtime-policy.json)
- **Method and risk.**
  The requested HISEW planning source was inspected at `software-engineering-workflow@c39f07b33c329ecacc0d0b567fc709f9cbb5cabe`.
  Its planning skill matched the installed dev.34 skill byte for byte.
  The native worktree status was personal with an existing paused execution.
  A separate setup integrity inspection returned `repair-required` for an unexpected Python cache directory.
  Recheck engine readiness and ownership when an execution is requested.
  R3 is proposed because a false acceptance can pass through independent readers into an immutable public release.
  The release owner accepts the exact requirements baseline, the rights owner interprets licence policy, CI and release maintainers integrate it, and independent verification and security review cover the changed trust boundaries before handoff.
  Existing stage, owner approval, disclosure and seal authorities govern their original effects.
  [HISEW planning skill](https://github.com/Hadden-Industries/software-engineering-workflow/blob/1ec59fb96957c6d66f669353dbc2ea9f314dadcd/skills/hadden-industries-plan-software-change/SKILL.md) · [Risk routes](https://github.com/Hadden-Industries/software-engineering-workflow/blob/1ec59fb96957c6d66f669353dbc2ea9f314dadcd/method/risk-routes.md)

## What each verifier can establish today

| Boundary               | Evidence and current gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Candidate construction | The producer checks a separate `npm ci --omit=dev` subject against the repository install and generates CycloneDX 1.6. The comparison reduces npm output to unique `name@version` values. Three clean installs exercise the tarball. Only the normal alias lock is retained and audited. Its identity set must equal the producer set. The comparison throws before writing that lock, its graph and audit. The scoped graph is written locally but omitted from the uploaded proof. [Producer](../../scripts/build-release-candidate.mjs) · [Proof upload](../../.github/workflows/qualify-package.yml)                                                                                                                                                          |
| Full CI recipients     | Portability runs scoped and alias installs and retains logical graphs. The matrix aggregate authenticates candidate, runtime, job and test roster. Browser preparation disables lockfile creation for its installed fixtures. The installed OWL contract retains semantic assertions. These receipts have different abilities to identify the dependencies actually exercised. [Portability](../../scripts/qualify-installed-candidate.mjs) · [Matrix aggregate](../../scripts/aggregate-consumer-runtimes.mjs) · [Browser preparation](../../scripts/browser-consumer-preparation.mjs) · [Installed OWL contract](../../scripts/qualify-owl-contract.mjs)                                                                                                        |
| PR → main → Release    | Admission authenticates the original full run, candidate ZIP, separate proof ZIP and per-job attempts. It repeats the alias-versus-producer equality and requires `lockedAndLocklessGraphsEquivalent: true`. Advisory refresh runs a native lock-only read on the retained alias lock and compares it to producer identities. The fresh qualification route and the promoted route carry different proof descriptors. Corpus replay binds the original normal alias lock to its tarball and shard identities. [CI proof](../../scripts/release-ci-package.mjs) · [Audit refresh](../../scripts/release-assurance.mjs) · [Qualification manifest](../../scripts/release-qualification-manifest.mjs) · [Corpus handoff](../../scripts/release-corpus-artifacts.mjs) |
| After npm approval     | The registry controller checks first-party bytes and origin, then exercises scoped and alias public installs. Both the controller and OS matrix currently copy the packed package's overrides into the consumer root. The controller demands exact SBOM inventory equality. Matrix receipts contain manifest and lock hashes, with no original lock bytes for independent later replay. The controller's signature audit and a vulnerability audit answer different questions. [Registry installs](../../scripts/public-registry-consumer.mjs) · [Registry controller](../../scripts/qualify-public-registry.mjs) · [Recipient lane](../../scripts/public-recipient-lane.mjs)                                                                                     |
| Seal and completion    | The seal reader authenticates original artifacts across partial retries, checks the lanes and demands exact SBOM inventory equality again. The writer archives selected evidence before sealing the draft. Completion checks assets, attestations and archive identity. Historical and channel readers have their own version and authority contracts. [Public proof](../../scripts/release-public-proof.mjs) · [Sealing and completion](../../scripts/staged-release-followup.mjs) · [Channel operations](../../scripts/release-channel-operation.mjs)                                                                                                                                                                                                           |

## Acceptance contract

**OUT-001.**
An operator can carry one qualified package from FULL CI to a sealed release when an upstream registry update changes only permitted transitive dependencies.
An authorised auditor can reapply the recorded policy to retained evidence.
A public reader can recompute the disclosed graph checks and verify the issuer, subject and scope of a cleared advisory attestation under the selected Q2 policy.
A consumer can identify the tested environment and reproduce its own deployment from its application lock.
Measure success at the first authorised staged release using candidate and seal records, then use the existing release-health observations.
A newer registry version, runner variation or changed advisory can alter the live result independently of the OwlAPI bytes.

| Requirement                                        | Acceptance and quality scenario                                                                                                                                                                                                                               | Oracle and observable outcome                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **REQ-001 · Frozen subject**                       | **AC-001 / QA-001.** A producer or replay reader sees altered tarball bytes, the wrong root, an omitted locked component, or a changed dependency relationship in the locked inventory.                                                                       | The trusted digest, packed manifest, native locked production tree and qualified SBOM identify the contradiction. The owner receives a failed subject check before acceptance or a writer effect.                                                                                                                          |
| **REQ-002 · Real consumer resolution**             | **AC-002 / QA-002.** The same tarball resolves `26.6.10` at qualification and `26.6.11` at a later consumer install. Include a control in which an upstream range excludes the new version and a control with the same versions attached to the wrong parent. | Independently authored parent manifests, expected edges and native npm output distinguish all three. The permitted case passes with the actual version, requesting paths and integrity. The two controls fail even if a flattened inventory looks plausible.                                                               |
| **REQ-003 · Trust and rights**                     | **AC-003 / QA-003.** A new reachable archive is correctly signed and admissible, or one input has contradictory SRI, a forbidden source, unresolved legal evidence, an unapproved lifecycle script, or a blocking advisory.                                   | Exact registry bytes, signature/provenance checks, applicable licence disposition, native script decision and audit result determine the outcome. An incomplete observation has a reason and never contributes a passing proof. The rights owner receives only cases outside accepted policy.                              |
| **REQ-004 · Behavior attributable to the install** | **AC-004 / QA-004.** A clean scoped install and a clean alias install, or two OS lanes, choose different permitted graphs. A fixture tests one graph while a receipt claims the other.                                                                        | Each eligible lane can pass independently. Swapped evidence fails. The job receipt binds its install, package, runtime, candidate, attempt, tests and result. Browser map verification also retains its provider-specific oracle.                                                                                          |
| **REQ-005 · Reuse without resolving again**        | **AC-005 / QA-005.** While a candidate waits for release, npm publishes another version or publishes a high/critical advisory for a version actually retained.                                                                                                | Admission reopens original proofs, replays the recorded locks and refreshes advisories against those graphs. A new version alone leaves the earlier evidence valid. A failed applicable audit blocks admission. The corpus uses exactly the graph on which its workers were qualified.                                     |
| **REQ-006 · Immutable, recoverable public proof**  | **AC-006 / QA-006.** A patch appears between the registry controller and matrix. One lane retries. An archive is incomplete, an older attempt is substituted, or acknowledgement of a seal is lost.                                                           | Public results bind to the exact approved stage, tarball, matrix, original successful job and attempt. Verification accepts distinct compliant observations. Substitution or missing evidence prevents sealing. Completion recovers the original request and bytes through the established read-only path.                 |
| **REQ-007 · Historical and operational integrity** | **AC-007 / QA-007.** A historical RC is replayed, an incomplete legacy receipt is offered for a new release, a restricted audit original is offered for a public upload, or a public coordinate becomes available while its proof is blocked.                 | The historical reader accepts its immutable original. A weaker format cannot stand in for the new undertaking. Restricted evidence stays within the authorised custody boundary. Operators can distinguish registry availability, a policy rejection and an incomplete check and can see the permitted recovery operation. |

All seven are hard conditions for their named subjects.
The release maintainer owns the technical verdict, the rights owner owns legal dispositions, and the release owner owns the decision to proceed.
A green historical test can demonstrate its original claim.
The release decision for a new observation requires evidence from that observation.

## Design decisions and owning contracts

### DEC-001 · Keep the two comparison subjects explicit

The candidate archive stays closed over the tarball, qualified SBOM and `SHA256SUMS`.
Authenticate package name, version, root SRI, tarball SHA-256, original source, artifact ID and digest as currently required.
Run the full locked producer tests and compare the actual locked production installation with its lock and CycloneDX subject.
Resolve CycloneDX component references and compare their relationships to the eligible installed production occurrences and edges for the recorded platform.
Distinguish physical hoisting in a full tooling install from logical production relationships.
Keep omitted cross-platform optional archives in the legal corpus with their own scope.
Include duplicate occurrences and the separately inventoried embedded JSON-LD provider.
Keep that file component and its digest under its existing generator rule.
A missing relationship cannot disappear through projection onto a set.

A fresh observation then compares its installed production tree with **its own** lock.
Compare that verified observation with the locked baseline to explain differences.
A native controlled replay of an individual observation must reproduce that observation within the recorded platform, install options and authority.
Equality of first-party bytes applies throughout.
[SBOM generator](../../scripts/generate-release-sbom.mjs) · [Candidate bundle](../../scripts/candidate-bundle.mjs) · [CycloneDX 1.6 dependency references](https://cyclonedx.org/docs/1.6/json/)

### DEC-002 · Use npm to resolve dependencies and retain enough evidence to explain them

Use the packed first-party manifest for direct pins.
Validate the direct child against the exact declared version and the authenticated package identity at the actual installed location.
Begin at the named installed root.
For alias installs, distinguish the binding `owlapi` from the package name `@hadden-industries/owlapi`.
Validate the specific approved local tarball or the exact public scoped/alias specifier and SRI before interpreting the root.
A second file dependency, a link outside the consumer root or an unexpected registry remains an error.

For the reachable installed production closure retain the occurrences, their logical parent edges, dependency kind, requested specifier, target location and underlying registry identity.
Join an occurrence to its v3 lock entry and an archive to its authenticated bytes.
Resolve constraints from the actual parent's verified manifest.
Record optional/peer eligibility, platform selectors, alias names, ancestor hoisting, deduplication and multiple installed versions with npm's semantics.
Treat a documented platform omission separately from an absent required child.
A new parent version may bring in or remove an entire declared subtree.
A transitive major selected by `*` is eligible for the same checks.
A version number or a matching SPDX string by itself establishes neither compatibility nor identity.
Classify a delta by its actual parent and specifier.
A blanket exemption for `@types/*`, a patch-only rule or a forced copy of the release lock would each give the wrong answer on a supported case.

Use native npm for resolution.
Check the exit status and the JSON problem/invalid/missing/extraneous diagnostics of `ls --all --omit=dev --json` and its lock-only view.
Both admitted versions can exit zero on extraneous-only results.
A read-only producer `query` returned parent and target locations for `@types/readable-stream` plus the package's separate `*` declaration.
Archive integrity and the requested typed edge require other evidence.
Join verified archive manifests, the lock and native resolution.
SLICE-001 establishes the deployed edge reader on **both** npm 12.2.3 and 10.9.11.
Reuse the repository's selected-npm SemVer implementation.
The residual OwlAPI code owns subject binding, deterministic comparison, policy and evidence readback.
[Producer npm ls](https://github.com/npm/cli/blob/v12.2.3/lib/commands/ls.js) · [Consumer npm ls](https://github.com/npm/cli/blob/v10.9.11/lib/commands/ls.js)

Reuse the existing validated registry origin, alias handling, exact SHA-512 SRI and conflicting-identity checks.
The locked registry normalizer expects a named/versioned root and registry entries.
A consumer can have a private root with different metadata and one admitted local tarball.
Validate that exception on its own terms, then feed eligible registry entries to the authoritative validators.
Reconcile immutable registry identity across observations as well as within each lock.
Distinct verified graph structures are valid.
Two individually well-formed receipts claiming different archive bytes for the same immutable coordinate must fail aggregate and seal.
Check the installed first-party files against the admitted tarball, excluding npm-owned child dependency directories, and bind the installed package manifests used as edge evidence to their authenticated archive contents before running fixtures.
Preserve upstream-bundled occurrences through their authenticated parent archive.
In a refusal test, submit a file-sourced transitive or two byte identities for the same coordinate via the new caller and require the original refusal.
The historical Git comparator has different alias and replay assumptions and remains scoped to its original transport.
[Registry lock validator](../../util/third-party-evidence/lock-graph.mjs) · [SemVer owner](../../scripts/npm-semver.mjs) · [Historical graph comparer](../../scripts/git-package-equivalence.mjs) · [npm query](https://docs.npmjs.com/cli/v12/commands/npm-query/) · [npm 10 query](https://docs.npmjs.com/cli/v10/commands/npm-query/) · [npm ls](https://docs.npmjs.com/cli/v12/commands/npm-ls/)

**Tool selection.**
Compose the approved producer/consumer npm CLIs, the existing registry and release evidence code, the locked CycloneDX npm generator (currently 7.0.1, Apache-2.0) and the existing ScanCode 32.5.0 profile.
Both npm pins were published on 18 November 2026 UTC.
Consumer npm is the admitted version for the lower supported Node floors.
The npm CLI uses Artistic-2.0 with bundled notices, Arborist uses ISC, and ScanCode has additional terms for reference data.
Use the versions and actual rights evidence selected for the candidate.
Historical example versions in §2.47 are not tool-upgrade instructions.
Direct import of a bundled implementation is a distinct interface to qualify.
Prefer native CLI facts when sufficient.
A new dependency or service requires separate fit, rights and deployment evidence.
[npm 12 licence](https://github.com/npm/cli/blob/v12.2.3/LICENSE) · [CycloneDX release](https://github.com/CycloneDX/cyclonedx-node-npm/releases/tag/v7.0.1) · [ScanCode 32.5.0 terms](https://github.com/aboutcode-org/scancode-toolkit/blob/v32.5.0/README.rst)

### DEC-003 · Prove an ordinary consumer installation

Use an isolated root and cache for each independently fresh observation.
Record the actual Node/npm, OS/architecture, flags, install spelling and lifecycle policy.
The consumer manifest carries the candidate dependency.
Package-owned repository overrides have root-only semantics in npm.
Remove their injection from the ordinary public consumer.
Any separately justified override-assisted diagnostic must identify its own assumptions and evidence.
A release-scoped pin may still be enforced in the producer's own tool or source installation.
[npm override scope](https://docs.npmjs.com/cli/v12/configuring-npm/package-json/#overrides) · [Public installer](../../scripts/public-registry-consumer.mjs)

Keep the scripts-disabled inspection and the supported normal-install check distinct.
The producer currently denies the production script on `lzma-native@8.0.6`.
Propagate the reviewed exact decisions and enforce strict handling of unreviewed scripts in the normal producer consumer root.
The repository's own `.npmrc` does not configure a new external consumer directory.
Use scripts-disabled materialisation for the admitted npm 10 public lanes.
Verify identity and required supply-chain evidence before loading newly resolved package code in semantic fixtures.
A separately qualified inspection install supplies no script permission for a different normal install.
If future policy admits a positive lifecycle decision, authenticate that exact archive before its execution and name any two-phase materialisation honestly.
Verify this ordering with a benign disposable script sentinel.
[Reviewed script decisions](../dependency-governance.json) · [Install fixtures](../../scripts/installed-consumer-fixtures.mjs) · [npm configuration](https://docs.npmjs.com/cli/v12/using-npm/config/#strict-allow-scripts)

Retain proof for the graph each release-decisive check actually exercised.
Node portability, the installed OWL contract and browser installs may run at different times.
Bind their public-entry-point tests to their own observations or to a verified replay of an explicitly named eligible lock.
Retain lock bytes at browser npm installs used to qualify the Vite document/worker closure.
The native import-map path separately exercises reviewed JSPM URLs, digests and browser behavior.
A graph assertion about npm does not establish the provider bytes served to that browser.
Keep the supported runtime matrix and existing semantic/browser gates.
OwlAPI 0.1.0 has a JavaScript-only public contract.
The Node types change is a production dependency observation.
Section 2.26 keeps declaration publication and a TypeScript compiler gate outside this release.
DefinitelyTyped can ship declaration corrections in a patch revision.
[JavaScript API policy](../implementation-plan.md#226-decision-do-not-ship-typescript-declarations-permit-only-separately-authorized-future-exploration) · [Browser preparation](../../scripts/browser-consumer-preparation.mjs) · [npm ranges](https://docs.npmjs.com/about-semantic-versioning/) · [DefinitelyTyped versioning](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/README.md#how-do-breaking-type-changes-work-if-type-declaration-packages-closely-track-the-library-packages-version)

### DEC-004 · Apply security and licence policy to the observed external archives

Verify permitted public npm origins, immutable coordinates and exact archive SRI.
Require registry signatures and verify published provenance under the existing policy.
Record an absent dependency provenance attestation according to the established `NOT_PUBLISHED` disposition.
Keep the separate mandatory OwlAPI public signature, provenance and approved-stage identity.
Run the release production vulnerability audit on the observed lock.
Enforce the existing native exit and high/critical policy, including its handling of missing counts.
Bind the reports to the lock, audit policy, trusted registry/key observations and time.
Check the full/dev visibility and the existing release-reachable tooling and exception rules where applicable.
Keep the normal zero-high/critical gate strict.
A signature audit establishes a different fact from advisory status.
Native signature verification operates on eligible registry packages and their fetched metadata.
Check archive SRI independently, including the separately authenticated first-party file subject.
Registry-only dependencies encountered before OwlAPI publication still need their applicable evidence.
OwlAPI's local tarball is authenticated through the retained candidate.
[Audit policy](../../scripts/release-audit-policy.mjs) · [Registry signature verification](../../util/third-party-evidence/registry-signatures.mjs) · [First-party provenance](../../scripts/registry-provenance.mjs) · [npm signature verifier](https://github.com/npm/cli/blob/v12.2.3/lib/utils/verify-signatures.js) · [npm audit](https://docs.npmjs.com/cli/v12/commands/npm-audit/)

Reuse existing per-archive evidence when coordinate, URL, SRI, bytes and evidence-tool policy match.
A new consumer-only archive needs authenticated acquisition, manifest and licence-file inspection, relevant ScanCode findings and a distribution-scope disposition.
Extend the existing acquisition/verification operations to a separately identified recipient subject.
Keep the canonical source-lock corpus and its signed facts intact.
A special-case licence file approved for one exact digest, such as the existing saxes case, has that scope.
Truly embedded/copied/generated material in OwlAPI, and material a downstream application bundles, retain their respective rights and notice obligations.
[Acquisition and evidence reuse](../../util/acquire-npm-package-evidence.mjs) · [Material classifier](../../util/generate-third-party-material.mjs) · [Packed NOTICE](../../NOTICE) · [OpenSSF dependency update guidance](https://best.openssf.org/Simplifying-Software-Component-Updates.html)

**Standing rule accepted by the owner on 26 November 2026 (Q1).**
For a previously unseen, separately installed external archive, apply the existing external-runtime allowlist (Apache-2.0, BSD-3-Clause, ISC, MIT) to its exact authenticated bytes, inspected licence and notice files, independent scan evidence and actual distribution scope.
Accept mechanically when all criteria and notice obligations are satisfied.
Route novel, conflicting, ambiguous or exceptional conclusions through the existing human rights disposition.
Record the policy revision, evidence and any specific disposition in the observation.
This decision also covers a new consumer-only SRI first encountered after npm approval.
The existing review of the producer's exact material and rights facts remains due.

For an archive outside the standing rule, keep the original unresolved observation and collect a rights-owner disposition through the existing authenticated decision/checkpoint mechanism.
Bind the signer and authority, archive coordinate and SRI, licence/notice and scan evidence digest, policy revision, distribution scope and applicable subject.
For a post-approval exception also bind the stage and public observation.
Pre-publication evidence binds the original candidate and producer job instead.
Compare each field on consumption.
Reserve “passed” for a new eligible read-only verification after the disposition.
Reopen the authentic original inputs, replay that exact lock on its platform and run the outstanding checks.
Reacquire a fresh public observation if the original lacks the required custody or freshness.
No second stage submission or rewrite of the original approval follows.
If authority for the particular disposition is missing, hold the dependent decision with the existing rights owner.

### DEC-005 · Make the evidence readable by the next verifier

Version the candidate **proof** contract at its writer and at each reader that confers new authority.
Use the existing closed candidate ZIP and separate authenticated proof uploads.
The following are required meanings for the new proof format.
Field names and the internal module layout are implementation choices.

| Evidence                | Required binding and independent readback                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subject and policy      | Exact package name/version, tarball SHA-256 and SRI, locked SBOM digest, applicable policy/schema version and qualified baseline identity. Bind the original source, run, producing job and attempt at the layer that knows them. A local diagnostic must retain its local scope.                                                                                                                                                                  |
| Each observation        | Distinguish fresh resolution, replay, inspection, normal install, scoped name and alias. Identify platform, Node/npm, resolver settings, script policy, time and role. For a registry installation bind the exact package coordinate, approved stage, verified public tarball and matrix input. Give each observation its own retrievable native manifest, lock, installed production graph and evidence descriptors with byte counts and digests. |
| Differences and reasons | Identify changed, added or removed occurrences and edges and their reachable parent evidence, including old/new versions, source and integrity as applicable. Record why npm could select the target, which platform condition applied, and which archive, rights, audit and behavioral results covered it. Reserve a separate outcome for incomplete evidence. Identical package sets with different edges can still require a disposition.       |
| Verdict and custody     | Derive the verdict from validated originals. Include the policy revision and provenance of each result. Validate schema, exact expected members, lineage, completeness, original bytes and recomputed relations on read. A summary digest locates and authenticates a record. The underlying bytes must be available for as long as its promised consumer needs them.                                                                              |

Keep local tarball references relative where they are produced.
Use original native data privately where needed, and design the published evidence projection at capture time.
Publish only release-cleared registry names, specifiers, digests, portable locations, dispositions and approved originals.
Exclude credentials, local account paths, raw environment values and private source from public observations.
Bind the projected record to its source without rewriting the original behind its digest.
Public release readback must have the data it needs after Actions expiry.
Use the existing disclosure inventory, signed checkpoints and exact artifact-member allowlists.
[Disclosure and recovery](../release/staged-operations.md#verify-public-recipients-and-seal) · [CI package proof](../../scripts/release-ci-package.mjs) · [Artifact transport](../release/artifact-transport.md)

**Audit disclosure and retention (Q2).**
Section 2.34 requires full and production audits.
Routine passes retain a compact project decision and bindings to the original inputs.
Detailed originals are retained privately for a documented exception, investigation or explicit obligation.
Reuse the existing protected OwlAPI release workflow and its frozen-lock audit mechanism, as in JSON Quality and Markdown Quality.
Routine progress belongs in job logs or a step summary.
The release proof binds the exact graph, policy, observation time and native job/attempt. Retain only the compact signed decision and original graph bytes needed by the next verifier. A later audit observes current advisories. [JSON Quality assurance](https://github.com/Hadden-Industries/json-quality/blob/78e901148f829cd1dd44953de22791fea6aa7f2d/scripts/release-assurance.js) · [Markdown Quality assurance](https://github.com/Hadden-Industries/markdown-quality/blob/9baee828cd36d31666e612e861da545ad7852e46/scripts/qualify-release-security.js) npm's Open-Source Terms, Conditions item 4, restrict access and redistribution of npm package-security data, expressly including audit-status reports.
At the start of this work, the public `zero-one-zero` workflow listed four unredacted audit-report members in `package-proof`.
Three were parsed report wrappers and one contained native transport audit output.
Repository readers can download Actions artifacts.
The CI reader required and hashed those ZIP members, and Release admission obtained a fresh decision by auditing the retained lock.
At seal, `verifyQualificationDisclosure` required the original ZIP in the public inventory and included it in the public archive.
Filtering the archive at seal cannot protect an earlier public upload.
The design must protect both successful captures and failure logging at the first public boundary.
See the [Q2 decision brief](2026-11-26-npm-audit-evidence-key-design-decision.md) for options and the limit of each assurance claim.
[npm terms](https://docs.npmjs.com/policies/open-source-terms/#conditions) · [GitHub artifact access](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts) · [Audit policy §2.34](../implementation-plan.md#234-decision-separate-audit-visibility-from-a-strict-reviewable-release-gate) · [Signed checkpoint disclosure](../release/staged-operations.md#preserve-a-signed-checkpoint)

**Q2 accepted by the owner on 26 November 2026.**
Use option B for the first rollout.
An operator may start the protected policy evaluator with an immutable release reference.
Only the evaluator may issue the advisory decision.
It authenticates the inputs, applies the approved policy and signs its own disclosure-cleared result.
Routine raw audit output is transient.
The seal checks the disclosure-cleared statement against the approved tarball and the graph evidenced by that particular install.
The release owner's signature retains its publication-approval role.
[Accepted decision and alternatives](2026-11-26-npm-audit-evidence-key-design-decision.md#options-and-trade-offs)

Qualify protected issuance, public verification and any case-specific private retention before enabling the corresponding path.
Keep untrusted PR jobs credential-free.
Bind the authoritative audit to the source of its actual private execution and the exact original bytes, native exit status, scope, policy and time.
Each protected release qualification and public registry verification obtains its own decision for its exact original inputs.
A version 3 receipt may satisfy that same operation through an approval delay or an evaluator outage when the exact tarball, manifest, lock, graph, policy, scope, evaluator job, run and attempt still match.
The observation, decision and verification timestamps must be ordered, and each applied case has its own expiry at the boundary that uses it.
A different operation, a changed input, an expired case or an absent qualifying result holds the gate pending eligible protected evidence.
Version 2 receipts use their original 24-hour observation rule at the applicable checks.
For a documented exceptional case, require authorised retention and readback before treating its evidence obligation as satisfied.
A later audit is recorded as a new observation.
Public fields require a disclosure disposition under the applicable terms.
The existing signed checkpoint and private-storage guidance provide precedents.
An audit-specific protected signer and confidential deployment still require qualification.

The cold admission reader runs before a repository dependency install.
The seal writer has protected authority and must read already authenticated evidence without installing the application or executing packages from a recipient.
The public reader directly checks admitted public facts and applies the selected Q2 trust rule to advisory evidence.
Authorised reviewers can reapply the audit policy when an exception or explicit obligation retained the original.
Factor a shared, versioned policy evaluator with these deployment constraints.
Platform adapters may collect native facts differently.
Each reader must state which decisions it recomputes and which judgments it accepts from an authorised issuer.
Keep byte checks at independent boundaries even where the pure policy is shared.
Reuse the schema validator and version-specific historical readers at their supported boundaries.
Audit any new shared file against the controller-delta rules that bind qualified source to the approved writer.
[Promotion proof](../../scripts/promoted-release-proof.mjs) · [Controller-delta admission](../../scripts/release-history-checkpoint.mjs)

### DEC-006 · Compatibility, time and ownership of effects

The new claim cannot be represented by setting the existing `lockedAndLocklessGraphsEquivalent` flag to true for different inventories.
Introduce an explicitly versioned producer/receipt policy for reconciliation.
Select its required form from the authenticated qualification revision, workflow policy, operation and subject.
A claimant cannot select historical semantics by deleting a field, lowering a version or omitting an evidence member.

Retain the exact original readers or explicit version branches for historical alpha and RC records and for already bound operations.
There is no general shim override.
Fresh, promoted and corpus-qualified manifests have distinct shapes.
The minimal candidate manifests reconstructed from a three-file download or by a corpus worker have different consumers from the producer's proof manifest.
Evolve only records whose meaning changes.
Replay RC1–RC3 against their original digests, as well as fresh/promoted and corpus-wrapped qualification formats.
A legacy proof can establish its original equality claim under its original authority.
For a new-policy candidate with insufficient original evidence, select an explicit fresh read-only qualification.
Never generate stronger historical evidence from today's registry.
[Downloaded candidate](../../scripts/prepare-downloaded-candidate.mjs) · [Corpus producer](../../scripts/release-corpus-producer.mjs) · [Qualification manifest](../../scripts/release-qualification-manifest.mjs) · [Historical evidence](../../scripts/historical-release-evidence.mjs)

Each fresh install has an observation time.
An intervening registry release can produce two different valid observations in the same run.
Use native run ID, original job/attempt, artifact ID/digest, subject and matrix to select the observations that actually passed.
Complete evidence and a passed policy decision precede promotion or sealing.
Capture failure diagnostics before temporary roots disappear.
Keep the eligible package proof distinct from the existing failure/diagnostic path.
Existing idempotency, signed stage intent, approval, retry budgets and lost-acknowledgement reconciliation govern all external writes.
[Staged release](../../scripts/staged-release.mjs) · [Public proof reader](../../scripts/release-public-proof.mjs) · [Staged follow-up](../../scripts/staged-release-followup.mjs)

## Delivery slices

The release maintainer owns integration across these slices.
The proposed file seams below follow current callers.
Choose the actual owner when implementing and update the prospective plan if inspection changes an interface assumption.
An early slice can be demonstrated read-only while the existing production writer still selects its current policy.

### SLICE-001 · Reproduce the two decisions through a real reader

**REQ/AC/QA 001–004 · DEC-001–005.**
Build a deterministic, isolated case for an exact first-party archive with an exact direct dependency and two admissible transitive resolutions.
Freeze independent package manifests, archive hashes, declared edges and expected verdicts.
Include the actual `26.6.10 → 26.6.11` incident as a separately labelled historical replay.
Use the actual npm CLI to create/read trees through scoped and alias roots.
Exercise an existing promotion or seal reader with the minimal authenticated fixture so the test reaches the original false rejection.
A helper returning a sorted list is insufficient proof of release admission.

Probe the native view on both admitted npm majors.
Include hoisting, an alias, two versions of a package, a missing required edge and a deliberately omitted optional platform dependency.
Native `query` location arrays omit unresolved edges and their requested specs/kinds.
npm 10's workspace path reads the actual tree even in lock-only mode.
Exercise standalone roots and refuse an unexpected workspace.
Join with verified manifests, lock entries and the native validity result.
The consumer fixture is a standalone root.
Require determinate evidence for peer and alias cases as well.
If the public CLI outputs cannot identify the selected edge unambiguously, use the documented actual/virtual tree API and typed `edgesOut` from Arborist under the same fixture, including requested name/spec/kind, resolved target and validity/error.
The pinned CLIs bundle Arborist 10.0.5 and 8.0.6 respectively.
Qualify reachability, supported loading, tool rights and cold-reader availability before selecting that API.
An unresolved edge blocks this slice.
A new solver or an added external dependency requires a new selection decision.
[npm 10 query implementation](https://github.com/npm/cli/blob/v10.9.11/lib/commands/query.js) · [npm 12 query implementation](https://github.com/npm/cli/blob/v12.2.3/lib/commands/query.js) · [Arborist public API](https://github.com/npm/cli/tree/v12.2.3/workspaces/arborist)

**Exit proof.**
The original locked case passes its existing assertion.
The drift case fails the old cross-install comparison.
The evidence suffices to accept it in a read-only trial and to reject wrong edges, unmeasured root substitution and contradictory SRI.
Inspect one real proof ZIP round-trip, including disclosure and uncompressed size.
This settles the collector and storage design before other slices depend on it.
Historical evidence, negative corpus cases and the policy wording can be prepared independently.
Plant a benign restricted-report marker in a failure fixture.
For an exceptional retention case, verify authorised private retrieval.
Confirm the marker is absent from public logs, artifacts, history and release assets on both success and failure.
An unchecked digest cannot stand in for its original.

### SLICE-002 · Produce a qualified tarball with a separately evidenced fresh graph

**REQ/AC/QA 001–004, 007 · DEC-001–006.**
Record the accepted decisions in the governing ADR when adopting the new policy.
Amend the active producer obligation, regenerate its gate registry through the maintained generator, and update the tests and runbook that currently require inter-graph equivalence.
Build a new candidate into an empty output directory.
Bind the locked subject, packed manifest, qualified SBOM and checksums as in DEC-001.
Capture the normal alias, inspection alias and direct scoped observations, their native locks, evidence and tests.
The normal alias lock is also the replay input for existing corpus consumers.
Keep script mode and support claims distinguishable.
Require all direct exact pins from the packed package without a hard-coded package count.

Connect the archive evidence owner to genuinely new consumer identities.
Existing tools enumerate the root lock and share authenticated evidence across matching artifacts.
Add a bounded separate observation input to the reusable acquisition/classification operations.
Pass the validated new archive through the same origin, SRI, signature, available provenance, safe inventory and material-evidence checks.
Keep the canonical release corpus generator rooted at its reviewed lock.
If rights are unresolved, emit that disposition under DEC-004 and withhold eligibility.
Retain failure evidence without overwriting prior attempts.
Version the closed member roster.
Store public-safe original graphs and cleared decisions once for downstream readers, and omit routine raw audit output.
Change initial upload and diagnostic paths as well as the later fresh/CI reuse readers.
Prove retrieval of each required original.
Exercise restricted retrieval for a case with an applicable private retention obligation.
[Source evidence rules](../implementation-plan.md#2501-decision-derive-platform-independent-legal-evidence-from-authenticated-locked-tarballs) · [Proof transport](../../.github/workflows/qualify-package.yml)

**Exit proof.**
A fresh-only patch yields the correct immutable SBOM, a real positive consumer verdict, and retrievable different lock and graph bytes.
A changed direct pin, failed required install, absent licence/signature evidence, unapproved lifecycle request, missing qualifying advisory evidence or a blocking audit result, or malformed provenance refuses eligibility.
Audits are evaluated under the existing time policy at the boundary that consumes them.
Both assertions must survive saving and reopening the proof.
The original candidate ZIP member set and original failed-output directory stay independently verifiable.
The read-only artifact can be exercised before enabling new-policy Release admission.

### SLICE-003 · Reuse the evidence across CI, release admission and corpus replay

**REQ/AC/QA 001–005, 007 · DEC-002, 003, 005, 006.**
Bind the FULL producer's new proof and relevant recipient evidence to the original full PR/main job, candidate digest, policy identity and landed source relation.
Collect one observation for each release-decisive npm install or record which exact eligible observation a controlled replay exercised.
Carry this attribution through portability, installed OWL and browser receipts, the runtime aggregate, and the proof selected for reuse.
Browser provider integrity, the native Java comparison, OWL assertions, CodeQL and benchmark evidence retain their independent acceptance rules.
Keep diagnostic-only installs identified as diagnostics.

Replace the producer-identity input to recipient re-auditing with the identities and native lock authenticated for that recipient.
Check the immutable source and transport locks against their own subjects.
For every distinct accepted recipient lock in scope, load/replay the correct original with the applicable npm/platform semantics and use the protected evaluator to refresh the advisory decision.
Keep one compact decision per distinct subject and policy observation.
Retain detailed reports only when a case requires them.
Verify the evaluator’s signed result for the exact lock/manifest hash, policy and original audit observation time at admission.
At Release admission, evaluate the exact retained subjects for this operation.
At stage entry, verify the receipt for that qualification and apply its ordered timestamps and case expiry.
The legacy promoted proof uses its original age check at the recorded verification time.
The live stage preflight and managed CodeQL checks keep their own timing and identity rules.
Archive readers evaluate historical observations at their recorded decision point.
Another version appearing in the registry causes no resolution during reuse.
A current blocking advisory still refuses admission.
[Release assurance](../../scripts/release-assurance.mjs) · [Admission](../../scripts/release-ci-qualification.mjs) · [Stage preflight](../../scripts/staged-release.mjs)

Exercise both paths.
Explicit fresh qualification carries its original package proof, and reuse carries its existing original IDs without repacking.
On both routes, the read-only stage admission and the protected stage writer must require the new evidence before any npm stage request.
Reopen the original candidate/proof pair or verify a native authenticated admission bound to that exact immutable pair, then recheck subject, preimages, freshness and policy at writer entry.
An unbound job-success flag is insufficient.
The live npm re-audit occurs at Release admission, and the stage reopens that protected decision for the exact qualification operation.
Keep package execution out of the stage writer.
For corpus runs keep the existing normalization of the local first-party tarball locator and hash of the actual retained consumer lock.
Keep worker `npm ci`, shard dependency digests and candidate linkage exact.
Check the retention reader too, since it uses release admission when considering retirement of superseded artifacts.
[Corpus identity](../../util/owlapi-reference/comparison-release-evidence.mjs) · [Worker replay](../../util/owlapi-reference/qualify-universal-ontology.mjs) · [Retention](../../scripts/release-retention.mjs)

**Exit proof.**
A clean FULL run with two permitted graphs survives original artifact readback, main equivalence and both release routes, including a corpus replay of the captured lock.
Reject a substituted producer graph in a recipient audit, a swapped corpus lock, a skipped required lane, malformed audit counts, a current high/critical result, and an expired or differently bound proof.
Inject missing, changed and stale proofs at both stage boundaries on both qualification routes and assert zero stage requests.
The raw native lock SHA-256, the corpus digest of the canonicalised lock with its first-party locator bound to the tarball, and a worker's installed replay have distinct meanings.
A provisional artifact cannot authorise retirement or stage.
Existing immutable proof can still be read under its applicable version.

### SLICE-004 · Verify the real public scoped and alias installs after approval

**REQ/AC/QA 002–006 · DEC-002–006.**
The read-only registry controller independently verifies public tarball SHA-256/SRI, exact coordinate, approved stage and publisher provenance.
Run fresh scoped and alias installs with matching expected specifiers and ordinary consumer settings.
For each actual public graph collect its native graph evidence, registry signatures, material disposition, installed-package results and the protected evaluator’s signed, disclosure-cleared advisory decision.
Implement the same obligations on the frozen Linux, Windows and macOS recipient matrix.
A controller's audit cannot cover a different matrix graph.
Public proof selection must bind the qualified baseline and policy digest to the original stage/matrix input.

Use the approved producer runtime for checks that require it and keep installed product tests at the consumer floor (including Node 22.0.0 with npm 10.9.11).
The approved producer is Node 26.13.1 with npm 12.2.3.
Use isolated npm configuration and cache for the anonymous public install.
Keep the vulnerability evaluation and signing authority in the protected job.
Restrict any exceptional retained originals to authorised private reviewers.
Run the advisory evaluation in the protected boundary against the captured, byte-identical recipient lock.
Use the admitted audit tool on a compatible runtime and verify that the result covers the platform-specific active occurrences.
The public job consumes the cleared signed result.
Older npm can fall back to sending its full tree and environment metadata to an audit endpoint.
Restrict observations to public-safe inputs and the expected registry.
Correlate the result before exercising newly selected code.
[Runtime setup](../../scripts/consumer-runtime-tools.mjs) · [Registry jobs](../../.github/workflows/release-registry.yml) · [Pinned npm 10 advisory client](https://github.com/npm/cli/blob/v10.9.11/workspaces/arborist/lib/audit-report.js)

For an archive first observed on macOS or Windows, use the existing admitted scanner environment for that exact SRI.
Current public matrix jobs do not install ScanCode.
Capture the fresh lock and inspectable manifest/graph with scripts disabled, supply their authenticated identities to a read-only scanner job, and bind its result to the actual observed bytes.
Resume the original test lane in the same preserved environment or reproduce its exact eligible graph there with `npm ci` and verify it before any package import.
Record the discovery and replay as distinct steps.
Do not transfer scan authority to an arbitrary recipient machine or make a second fresh resolution stand in for the first.
A fixture in which the scanner returns another SRI must leave consumer tests unstarted.

**Exit proof.**
Scoped, alias and two platform lanes can produce different valid observations for identical OwlAPI bytes.
Verify each against its own manifest, lock, actual tree, tests and policy.
Reject a tarball or provenance origin change, a registry lookup for a different version, an override-assisted install presented as ordinary, wrong alias syntax, a missing native graph record or cleared attestation, failed custody of the restricted originals, a security failure or a supplied audit from another lane.
A failure after npm approval records the still-public coordinate and pending GitHub seal.
Use the approved read-only registry and recovery path.
The existing stage has already been submitted.

### SLICE-005 · Seal, complete and recover the original release

**REQ/AC/QA 001, 003–007 · DEC-001, 004–006.**
Extend the versioned public proof reader for the controller and every expected matrix lane.
Verify original attempt/runner/upload lineage, schema, member roster, byte limits, hashes, installation role, stage, candidate and matrix.
Recompute the disclosed package and graph decisions from authenticated originals.
For advisory results, verify the protected evaluator’s signature and approved identity.
Match the tarball to the admitted release, the recipient graph to its authenticated install receipt, and the policy, scope, original run, attempt, job and timestamps to the sealing rule.
Check the public advisory decision at the original successful test and at seal, and check any qualification case's expiry at seal.
Verify the qualification side for both fresh and promoted routes.
Permit correctly attributed successful lanes from earlier attempts under the current rerun rules.

At seal, verify the live draft and operation preimages, rights/benchmark dispositions and approved public inventory under their existing owners.
The public reader currently extracts selected members into the archive.
Explicitly include newly returned controller/lane members in the disclosure-cleared roster before insertion.
Preserve sufficient public originals/attestations, the frozen runtime matrix and policy inputs for offline re-evaluation after Actions expiry, including when current runtime defaults have advanced.
Bind the accepted policy and proof index into the versioned release evidence and recoverable indexed archive before the ordinary writer effect.
Extend completion to reopen the stand-alone release record and archive and replay their consumer-proof binding offline, including a lost seal acknowledgement.
Require the resulting identity in the version-specific immutable completion evidence used by later labels/classification.
A receipt with only the legacy success state must fail for a new-policy release.
Historical release schema versions and their asset digests remain independently readable.
The currently staged standalone evidence is v7 and its archive is v2.
Fresh/promoted qualification manifests and the v3 corpus wrapper have separate version namespaces.
[Staged evidence](../../scripts/staged-evidence.mjs) · [Evidence schema](../release/release-evidence.schema.json) · [Historical and current validators](../../scripts/validate-release-evidence.mjs) · [Channel reader](../../scripts/release-channel-operation.mjs)

**Exit proof.**
A seal fixture with a different valid public transitive passes the real reader, produces the original draft's evidence, and survives a new completion reader with a pinned archive and an unavailable Actions artifact.
Repeat readback with newer active runtime defaults using the original policy and matrix.
Exercise public sealing while the evaluator is offline.
An eligible existing receipt satisfies the advisory gate.
A receipt for another graph, a stale audit with a new signing time, or a personal approval without the evaluator’s result leaves the seal pending.
Reject suppressed deltas, altered raw files with internally consistent summaries, stale policy, mixed stages, two individually plausible observations that disagree on bytes for the same registry coordinate, mutated installed files under an unchanged lock, a substituted ZIP or ledger entry, duplicate/missing roles, a legacy-format downgrade, and a substituted standalone/archive pair.
An ambiguous external write takes the signed reconciliation route.
Read-only qualification is the first permitted demonstration, and an actual protected write requires its existing independent authority.

## Verification, integration and operations

**Independent oracles.**
Use hand-authored packages with known manifest edges and known archive digests, the exact npm-published package metadata and signed bytes for authorized live observations, native npm's install/lock behavior, and the existing CycloneDX contract.
For the negative cases, change one independent input at a time and assert the refusal and absence of a writer effect.
A fixture generated by the new reconciliation writer cannot be its sole expected value.
Mock registry responses, clock, Actions inventory or writer effects at their external boundary.
Exercise the real lock/graph parser, policy evaluator, schema and archive readers in those tests.
Generate separate synthetic benign script/peer/optional cases and keep release evidence immutable.
[Verification methodology](https://github.com/Hadden-Industries/software-engineering-workflow/blob/1ec59fb96957c6d66f669353dbc2ea9f314dadcd/method/verification-procedures.md)

The following are maintained entry points for **future execution**.
Add the new cases at those seams.
Select affected tests at each increment, then run the complete required candidate gates on the integrated revision.
The entry points were checked against the repository's scripts.
Execution evidence will attach to the implemented revision.

| Claim                                                       | Verification route                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inventory, SRI, signatures, material and script policy      | `npm test -- --runInBand --runTestsByPath scripts/npm-production-graph.test.js scripts/installed-consumer-fixtures.test.js util/third-party-evidence/lock-graph.test.js util/third-party-evidence/registry-signatures.test.js`. Add targeted material-classifier/governance cases and the authenticated archive delta. Run `npm run verify:npm-evidence` against the source-lock inventory when its inputs change.                                                                                                                                                                     |
| Candidate publication boundary and two qualification routes | Build under the admitted producer with `npm run build:release-candidate -- --output <new-empty-directory>`. Exercise `scripts/release-ci-package.test.js`, `scripts/release-assurance.test.js`, `scripts/ci-verification.test.js` and `scripts/release-corpus-artifacts.test.js` using the same Jest entry point. Include a cold admission before repository dev dependencies are installed.                                                                                                                                                                                           |
| Installed npm consumers and browsers                        | Use `npm run qualify:installed-candidate` via its existing candidate/output arguments, the frozen runtime jobs, installed OWL contract and actual Chromium, Firefox and WebKit workflows. Extend `scripts/aggregate-consumer-runtimes.test.js` and `scripts/browser-consumer-preparation.test.js` for different valid graph identities and substituted attribution.                                                                                                                                                                                                                    |
| Approved public run through irreversible release boundary   | Exercise `scripts/public-registry-consumer.test.js`, `scripts/qualify-public-registry.test.js`, `scripts/staged-release.test.js` and `scripts/historical-release-evidence.test.js` using offline controlled fixtures. Run `npm run verify:release-gates` and `npm run verify:workflow-governance`. Use the ordinary authorised release for public registry/OS evidence, never a duplicate publication purely for a test.                                                                                                                                                               |
| Independent handoff                                         | A reviewer independent of the change author traces one positive and one materially wrong initial graph through promotion, public verification, seal, completion and recovery. Release assurance checks digest custody, compatibility and replay after expiry. Security assurance covers untrusted archive input, new evidence before package execution, permissions, public disclosure, downgrade resistance and writer boundaries. The rights owner verifies actual material disposition. Bind reviews, affected checks and the final required suite to the same integrated revision. |

**Ordering and cost.**
SLICE-001 resolves native edge evidence, disclosure and record-size feasibility.
It precedes acceptance of changed graph semantics.
SLICE-002 establishes the producer/consumer contract.
CI/reuse work in SLICE-003 and the public observation work in SLICE-004 can proceed independently once their shared subject, policy and receipt contract are agreed.
The release maintainer integrates both before SLICE-005 enables the final verdict.
Historical fixtures, the accepted external-archive rule and read-only graph verification can proceed while the protected signing and exceptional-evidence paths are qualified.
Do not parallelise changes to the same schema or cutoff policy without a designated integrator.

Inspect each graph once per actual observation and retain its full output within the owning bounds.
Use maps of installed locations, edges and exact archive identities.
A chain with one changed child and a heavily shared node should require work proportional to the observed occurrences and edges plus emitted differences, allowing for deterministic ordering.
Avoid enumerating every possible path through a shared or cyclic graph.
Deduplicate fetching and scanning the same archive only under matching digest, scanner/options and verification policy.
Distinct active graph or lock hashes, changed key policy and audit freshness have different reuse implications.
Keep the 32-shard source scan scoped to the source inventory and reuse independently verified archive work across recipients.
Measure peak payload and work across a full frozen matrix before rollout.
The CI proof reader currently allows 16 MiB and the public proof reader 4 MiB uncompressed per selected ZIP.
Measure the whole release artifact too, including its 64 MiB asset and 96 MiB expanded-archive limits.
Use digest-indexed, retrievable shared originals and bounded decompression.
If complete approved evidence cannot fit, test the existing artifact transport layout and surface the limiting owner and measured size before changing the cap.
[Transport budgets](../release/artifact-transport-policy.json) · [CI proof reader](../../scripts/release-ci-package.mjs) · [Public proof reader](../../scripts/release-public-proof.mjs)

**Rollout and recovery.**
Deploy readers with explicit old/new policy discrimination before enabling writers on the future protected-main revision.
Exercise the old exact case, permitted drift and hard failures through a read-only FULL CI → exact-main → reused Release route and one independently selected fresh qualification.
Confirm collector coverage, IDs, unchanged first-party digests, current advisory results and readback of every original.
Operational acceptance requires the normal independent reviews and existing release approvals.
A controlled, actually authorised public run supplies the final live observation.
Before any external effect the owner can revert the prospective workflow/policy change and independently qualify that reverted revision under its applicable original strict rule.
A format switch on a new-policy candidate is ineligible.
Keep the legacy direct publication and bounded rc.3 recovery route fenced to their authenticated historical scope.
After npm approval an ineligible graph holds the GitHub draft for an evidenced retry or reconciliation.
After immutable seal, use existing signed channel/withdrawal or a corrected future release as appropriate.
Preserve the original publication, seal and failed observations.
[Staged recovery runbook](../release/staged-operations.md) · [Immutable release behavior](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)

**Operator evidence.**
Report which exact candidate and recipient graph passed, what changed and why, which checks covered it, which role/attempt is missing and which read-only recovery is available.
Show a compact diff in native job summaries with links to authenticated originals.
Separate acquisition/availability failure, policy rejection and failed behavioral qualification.
Release operators can then answer whether the npm coordinate is public and whether sealing is still pending without retrying a writer.
Give public recipient evidence and exceptional material recovery 30 days in Actions.
Give release-capable proof, the qualification advisory decision and the public registry controller receipt 90 days.
Later registry changes are new observations about a supported release.
[Release evidence retention](../release/artifact-transport.md#release-evidence-retention)

The weekly maintenance workflow already calls the candidate builder.
Its supported-public-coordinate step on this branch checks designation, tags and release metadata.
The distinct weekly clean public install/smoke/audit/signature monitor specified in §2.48 remains a release-health follow-up.
Its future reader should reuse the same decision, target the supported stable or designated RC, and use the existing issue-only reporter.
This plan covers trustworthy promotion, sealing and completion evidence.
Section 2.48 separately requires a working weekly public monitor **before production completion**.
Track and verify that prerequisite under the existing maintenance owner before declaring production complete.
Fixing the candidate builder alone cannot discharge the live-monitor obligation.
[Maintenance workflow](../../.github/workflows/maintenance.yml) · [Designation reader](../../scripts/maintenance-published-health.mjs)

**Replanning triggers.**
Revisit only the affected decision when a native CLI cannot establish a required relationship, a public proof cannot satisfy disclosure or size limits, an authenticated archive needs a new legal interpretation, a root-vs-transitive obligation is contradicted by the owning policy, or an in-flight signed operation cannot be recovered under its original semantics.
Carry the smallest discriminating native fixture/receipt to the appropriate owner.
An ordinary failed implementation test against an agreed oracle calls for correction and rerun.
A new dependency, verifier service, weaker proof, broader support promise or additional publishing authority would require its own selection and acceptance.

## Decision tree for owner review

- **Settled direction.**
  Exact first-party and locked-SBOM proof → independently resolved consumer graph → admissibility by the actual edges, bytes, policy and supported behavior → native evidence checked at promotion and again through public sealing.
- **Settled by the owners' existing contracts.**
  Scoped/alias identity, supported npm/Node matrix, root-only overrides, native install-script controls, signed-registry checks, high/critical audit thresholds, optional-platform evidence, historical replay, independent authority for irreversible writes, and issuer-specific stage/retention/recovery policy.
  The plan incorporates these directly.
- **Q1 accepted on 26 November 2026.**
  Apply DEC-004's standing rule to each eligible, separately installed external archive, including one first observed after npm approval.
  Retain exact archive evidence and escalate exceptions to the rights owner.
- **Q2 accepted on 26 November 2026.**
  For the first rollout an operator may initiate the protected evaluator.
  Sealing requires its current, signed, disclosure-cleared decision covering the exact tarball and observed recipient graph.
  [Key Design Decision](2026-11-26-npm-audit-evidence-key-design-decision.md)
- **Owner review complete.**
  Both planning decisions are settled.
  Implementation and rollout evidence must demonstrate the protected evaluation and signing path, authorised readback for a documented exceptional case, and the seal's handling of valid, stale, missing and mismatched receipts.
