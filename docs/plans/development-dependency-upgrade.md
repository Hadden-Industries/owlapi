# Development dependency upgrade and Node 26 implementation plan

**Status:** Accepted and delivered on 9 October 2026, integrated at `4859f2ef8ff32f92c9c81e3632641d481a5e5e8f`.
The original planning baseline and proposed sequence below are retained; the delivery record supersedes proposal-stage status statements without granting release authority.
The decision and integration owner is Maksym Shostak.

**Purpose:** Let maintainers deliberately refresh development tools to newer stable releases, reproduce each selected graph from its lockfile, and use a qualified Node 26 runtime without losing OwlAPI's existing compatibility, provenance, or release controls.

## Delivered state and qualification

All 21 root registry development dependencies now use stable `>=` floors, with their qualified graph recorded in the root lockfile.
Local npm eligibility is `>=12.2.0`; CI, release and governed qualification bootstrap exact npm `12.2.0`.
The runtime declaration in `devEngines` remains versionless and the manifest has no `packageManager` field.
Production dependency pins and the separate retained Markdown archives/lock remain unchanged by this upgrade.

Node `26.11.1` is admitted alongside the existing Node `22.23.3` and `24.21.0` floors.
The complete 20-job [CI run 37875950984](https://github.com/Hadden-Industries/owlapi/actions/runs/37875950984) passed on `c64c3a297a5df13e6db12d2d65d43a62f63599c3`, including Node 26 source and retained-package Ubuntu x64, Windows x64 and macOS arm64 checks, all three browsers and the installed OWL contract.
It qualified tarball SHA-256 `46c893beca80fc7421fff0296b60dd5fcf506a031bbe20c649636a2b32ac0e54`; later source and rc.2 candidates require their own evidence.
The main plan's accepted §2.19 amendment promotes those Node 26 representatives to `SUPPORTED`; Node 24.21.0 remains the canonical release/Markdown/Java runtime.
CI qualification policy/schema 5 and the active producer policy require the expanded job inventory and reject incomplete or pre-expansion proof.
The [rc.2 plan](0.1.0-rc.2-java-parity.md#11-delivered-changes-from-rc1-through-9-october) consumes this baseline without marking rc.2 published or its remaining features complete.

## Basis and inspected baseline

The originating request is this chat, `01a11dfd-ca58-7932-a645-07713098eb6b`, including the follow-up instruction to allow Node 26 engines.
The design draws on these inspected chats:

| Reference                                                                                                    | Applicable implementation lesson                                                                                                                                                    | Boundary retained here                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [UO: Make npm dependency ranges floating](codex://threads/01a11a9c-1875-7981-8df1-d30176c1b69b)              | Use stable `>=` minimums, deliberate lockfile refresh, native npm policy, and consistent npm selection before project commands or cache probes.                                     | Its later runtime-dependency expansion and configuration approvals do not apply to OwlAPI. Preserve transported Markdown archives.            |
| [google: (chrome) Make npm dependency ranges floating](codex://threads/01a11c30-e213-7fb3-b983-cb9b24fd8d23) | Qualify actual packed consumers and exact browser revisions; consolidate before broad review; preserve failed runtime evidence.                                                     | A browser cache failure is not permission to qualify an older browser. Its direct-main publication authority does not transfer here.          |
| [BBCODE: Update devDependency version ranges](codex://threads/01a11c48-c8bd-7fd1-9786-3598157e972f)          | Inspect every manifest, select current registry versions independently of Dependabot, preserve justified compatibility boundaries, and regenerate outputs through their generators. | Node runtime and declaration-package versions are different. Its later runtime-package, Python, and Actions updates are outside this request. |

Repository inspection found local `main` at `e15320d6438b27c5aaa7aa9302b6919749873ec9`, with a clean working tree before this plan was added.
Read-only remote inspection returned `e6f50bcfa1519b048bc66d37f7961c29b03a0971` for `origin/main`; local main contains one additional existing commit.
Preserve that commit and recheck branch ownership and delivery scope before implementation or publication.
This plan does not authorize publishing that existing work.

The installed development runtime is Node `24.21.0` with npm `12.2.0`.
HISEW `0.1.0.dev17` reports active personal applicability, ready registration, and no active implementation execution; the prior execution has a committed handoff.
Its configured profiles are `focused`, `affected`, and `full`, with distinct command lists and undeclared input-order semantics.
Do not adopt the completed execution or unrelated feedback continuations as this task.
The configured external configuration and evidence roots are `C:\Users\maksy\.hi\w\c` and `C:\Users\maksy\.hi\w\e`; rediscover applicable evidence and temporary destinations before creating implementation artifacts.
No HISEW execution or accepted requirement snapshot was created during planning.

The complete tracked npm manifest surface is:

- Root `package.json` and `package-lock.json`: 21 registry development dependencies and eight exactly pinned production dependencies.
- `tooling/markdown/package.json` and its separate lockfile: one development dependency supplied as a retained core archive, plus two platform-specific optional archives.

The current manifest admits Node `>=22.23.3 <23 || >=24.21.0 <25`.
It requires exact npm `12.2.0` through `devEngines`, leaves `devEngines.runtime.version` absent, and has no top-level `packageManager` field.
[The governing implementation plan](../implementation-plan.md), sections 2.19 and 2.45, explains the versionless development runtime and npm-owned bootstrap policy.
Section 2.19 currently defers Node 26 promotion until LTS; the user's new Node 26 instruction is the basis for proposing an explicit amendment rather than silently contradicting that rule.

## Scope and design

The proposed configuration bundle is:

| Surface                     | Proposed outcome                                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root `devDependencies`      | All 21 registry entries become `>=` the stable versions selected below, with no upper major bound.                                                                                                 |
| Root lockfile               | Native npm resolution records the exact qualified versions, integrity values, and dependency graph; deliberate refresh and frozen installation remain different operations.                        |
| `engines.node`              | `>=22.23.3 <23 \|\| >=24.21.0 <25 \|\| >=26.11.1 <27`; retain both existing floors and exclude Node 23, 25, 27, and prereleases.                                                                   |
| `devEngines.runtime`        | Preserve `name: node`, `onFail: error`, and the deliberate absence of a version constraint; the existing source-probe policy remains usable.                                                       |
| `devEngines.packageManager` | Propose `version: >=12.2.0`, retaining `name: npm` and `onFail: error`, to carry over the reference projects' local npm policy.                                                                    |
| Exact npm selection         | Retain npm `12.2.0` in CI, release construction, runtime assertions, and governed verification; retain OwlAPI's explicit decision not to introduce top-level `packageManager` or require Corepack. |
| Canonical runtime           | Retain `.node-version` at `24.21.0`, release construction on Ubuntu/Node 24, and the existing Node 24 Markdown qualification environment.                                                          |
| Node 26 qualification       | Add the exact `26.11.1` source lane and retained-package portability checks described below; make support claims conditional on their passing evidence.                                            |
| Markdown archive graph      | Preserve the core/platform `file:` specifiers, archives, and lockfile bytes; use their existing public commands and qualification contracts.                                                       |

The npm range is a proposed design choice derived from the reference implementations, not an assertion that the current exact npm policy is defective.
Accepting implementation of this bundle would also accept that local npm compatibility change and its corresponding current-policy amendment.
Future stable npm majors become eligible locally; they do not automatically become the CI or release reference version.

Production dependency declarations, runtime functionality, public exports, the package release version, Python/uv tooling, Actions pins, branch protection, verification budgets, and the shared Markdown producer are outside scope.
Do not add update automation or execute a manual remote workflow dispatch.
Do not modify sibling repositories.
Incidental transitive production-graph changes require a separate impact decision even when all eight direct runtime pins remain unchanged.

Native npm handles range parsing, resolution, lockfiles, and `devEngines`; the existing `semver` package supplies supported range validation where tests need it.
Use existing workflow, candidate, browser, evidence, and provenance tools.
No resolver, version parser, npm launcher shim, alternate receipt format, or compatibility fallback is needed.
There is no prior no-shim exception for this change.

## Proposed HISEW risk route

**Risk class:** R2 for the proposed implementation; this classification is an inference from the public Node support contract and governed CI/release changes.

**Decision owner:** Maksym Shostak, as requester and repository maintainer.

**Reasoning:** A development-only declaration can change the tools producing browser artifacts, package evidence, SBOMs, and qualification results.
Adding a public Node comparator changes the consumer compatibility promise and requires coordinated evidence producers and validators.
These public-contract and cross-system workflow effects justify R2; there is no identified R3 consequence.

**Potential blast radius:** Contributor installs, lint/test execution, import maps and browser bundles, package/evidence generation, clean npm consumers, and CI/release qualification acceptance.
The production JavaScript algorithms are not intentionally changed.

**Reversibility:** Before publication, restore the manifest, lock, related policies, and generated inventories together and reinstall the restored graph.
After Node 26 is publicly promoted, the existing 0.1.x support commitment prevents casually removing it; use a compatible forward fix or an explicitly approved breaking-line decision.
Source rollback cannot undo existing consumer installations or immutable published artifacts.

**Principal unknowns:** Refreshed transitive graph and exact terms, changed install-script identities, browser/import-map output drift, Node 26 behavior across the named platforms, required reviewer availability, and implementation-time baseline drift.

**Required artifacts:** One accepted exact revision of this draft, its HISEW requirement snapshot, current package-selection and rights evidence, exact candidate/graph identities, native verification receipts, independent review/verification results, and justified generated provenance/policy updates.
Keep operational progress and raw results in the current external evidence store.

**Required specialist lenses:** Supply-chain and install-script assessment; public Node/package compatibility; CI receipt and release-control correctness.
HISEW REU-01, VER-01, LIC-01, NAM-01, and NSH-01 apply.
SEC-01 makes the eventual dependency/privileged-workflow diff a scoped native security-assessment trigger; capability discovery is not scan or delegation authorization.

**Required verification:** Focused feedback while editing, affected checks at integration, the registered full profile on the frozen final candidate, and the missing browser, retained-package, Node 26, and hosted obligations identified below.
Use independent verification required by R2 and the selected ordinary reviewer; preserve their actual scope and limitations.

**Required human approvals:** Accept the draft baseline and consequential configuration/policy decisions before implementation.
Commits, publication, required external capabilities, and any new exception use their actual session authorization and governing procedures; approvals from the reference chats do not transfer.
The present request authorizes creation and checking of this plan only.

**Maximum sensible autonomy:** Complete read-only discovery and this durable draft now.
Once accepted, carry out its authorized implementation and checks without repeated phase-boundary questions; escalate only a material scope, risk, rights, or authority change.

**Next lifecycle step:** Accept an exact plan revision, recheck applicability and execution ownership, capture that accepted revision using HISEW's personal requirement-snapshot route, then start the R2 implementation with its snapshot ID.
Do not label this draft accepted or use a snapshot ID as a requirements-file `--baseline` argument.

## Current stable selection

Registry metadata was checked on 9 October 2026 through each package's authoritative `registry.npmjs.org` metadata.
The highest published stable version and `latest` tag agreed for all 21 entries; none of those selected versions carried a deprecation notice.
This is selection evidence, not exact-tarball rights clearance or successful integration.
Refresh it at implementation start and record any changed selection before resolving the graph.

| Development dependency     | Current declaration | Proposed minimum | Selection source                                                        |
| -------------------------- | ------------------- | ---------------- | ----------------------------------------------------------------------- |
| `@cyclonedx/cyclonedx-npm` | `6.0.1`             | `>=6.0.1`        | [Registry](https://registry.npmjs.org/@cyclonedx%2Fcyclonedx-npm/6.0.1) |
| `@eslint/js`               | `10.0.1`            | `>=10.0.1`       | [Registry](https://registry.npmjs.org/@eslint%2Fjs/10.0.1)              |
| `@jspm/generator`          | `2.16.3`            | `>=2.17.0`       | [Registry](https://registry.npmjs.org/@jspm%2Fgenerator/2.17.0)         |
| `@playwright/test`         | `1.63.0`            | `>=1.64.0`       | [Registry](https://registry.npmjs.org/@playwright%2Ftest/1.64.0)        |
| `ajv`                      | `8.20.0`            | `>=8.20.0`       | [Registry](https://registry.npmjs.org/ajv/8.20.0)                       |
| `ajv-formats`              | `3.0.1`             | `>=3.0.1`        | [Registry](https://registry.npmjs.org/ajv-formats/3.0.1)                |
| `cross-env`                | `10.1.0`            | `>=10.1.0`       | [Registry](https://registry.npmjs.org/cross-env/10.1.0)                 |
| `eslint`                   | `10.11.0`           | `>=10.12.0`      | [Registry](https://registry.npmjs.org/eslint/10.12.0)                   |
| `eslint-config-prettier`   | `10.1.8`            | `>=10.1.8`       | [Registry](https://registry.npmjs.org/eslint-config-prettier/10.1.8)    |
| `eslint-plugin-compat`     | `7.0.2`             | `>=7.0.2`        | [Registry](https://registry.npmjs.org/eslint-plugin-compat/7.0.2)       |
| `globals`                  | `17.13.0`           | `>=17.13.0`      | [Registry](https://registry.npmjs.org/globals/17.13.0)                  |
| `jest`                     | `30.5.2`            | `>=30.5.2`       | [Registry](https://registry.npmjs.org/jest/30.5.2)                      |
| `jsonpath-rfc9535`         | `1.3.0`             | `>=1.3.0`        | [Registry](https://registry.npmjs.org/jsonpath-rfc9535/1.3.0)           |
| `pacote`                   | `22.0.0`            | `>=22.0.0`       | [Registry](https://registry.npmjs.org/pacote/22.0.0)                    |
| `prettier`                 | `3.9.9`             | `>=3.9.9`        | [Registry](https://registry.npmjs.org/prettier/3.9.9)                   |
| `publint`                  | `0.3.25`            | `>=0.3.25`       | [Registry](https://registry.npmjs.org/publint/0.3.25)                   |
| `semver`                   | `7.8.5`             | `>=7.8.5`        | [Registry](https://registry.npmjs.org/semver/7.8.5)                     |
| `spdx-expression-parse`    | `5.0.0`             | `>=5.0.0`        | [Registry](https://registry.npmjs.org/spdx-expression-parse/5.0.0)      |
| `tar`                      | `7.5.22`            | `>=7.5.22`       | [Registry](https://registry.npmjs.org/tar/7.5.22)                       |
| `vite`                     | `8.3.2`             | `>=8.3.4`        | [Registry](https://registry.npmjs.org/vite/8.3.4)                       |
| `yaml`                     | `2.9.1`             | `>=2.9.1`        | [Registry](https://registry.npmjs.org/yaml/2.9.1)                       |

Four direct versions advance; the other 17 change declaration policy without raising their floor.
The resulting transitive graph is not yet known.
The observed peer constraints permit ESLint 10 with the selected ESLint packages and Ajv 8 with `ajv-formats`; npm resolution remains the integration oracle.
No upper-bound exception is currently demonstrated for these 21 entries.
A future incompatibility needs evidence and an owner decision, not an unannounced pin or `--legacy-peer-deps` workaround.

[Node's release index](https://nodejs.org/dist/index.json) identifies `26.11.1`, released 7 October 2026, as the current Node 26 patch; the [release schedule](https://nodejs.org/en/about/previous-releases) still classifies Node 26 as Current.
Its bundled npm is `11.20.0`, so the exact npm `12.2.0` bootstrap must precede project npm operations in new Node 26 jobs too.
The [npm 12.2.0 metadata](https://registry.npmjs.org/npm/12.2.0) admits the existing Node floors and Node 26.
Do not confuse this runtime version with an `@types/node` version; OwlAPI has no direct Node declaration dependency to add.

[Playwright 1.64.0](https://github.com/microsoft/playwright/releases/tag/v1.64.0) changes device screen propagation and introduces optional default-project selection.
The existing configuration spreads desktop device descriptors, so inspect resulting browser expectations and explicitly retain Chromium, Firefox, and WebKit coverage.
[Vite 8.3.4](https://github.com/vitejs/vite/releases/tag/v8.3.4) includes build/import-map and dependency changes, making generated browser artifacts a relevant acceptance boundary.
[ESLint 10.12.0](https://github.com/eslint/eslint/releases/tag/v10.12.0) changes diagnostics and fixes; review any resulting source edits for semantics.
JSPM's registry identity is verified, but version-specific upstream change review remains an implementation-start task; no release-note claim is inferred from unavailable GitHub tag pages.

## Draft requirements, invariants, and decisions

| ID               | Requirement and falsifiable acceptance criterion                                                                                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 / AC-001 | Every registry development entry uses its selected stable `>=` floor. Native npm resolves a peer-consistent graph; retained archive specifiers and all eight production declarations remain unchanged.                                                               |
| REQ-002 / AC-002 | Frozen installation reproduces the reviewed graph. Clean `npm ci` leaves manifests/locks unchanged; a deliberately inconsistent disposable manifest/lock pair is rejected with npm's native mismatch error.                                                          |
| REQ-003 / AC-003 | Node 26 is deliberately admitted at `26.11.1`, alongside unchanged Node 22/24 floors. Installed-package and source checks pass at those named floors; Node 26.11.0, unsupported majors, and prereleases remain outside the published range.                          |
| REQ-004 / AC-004 | Local npm accepts the proposed `>=12.2.0` policy while every governed job uses exact npm 12.2.0. Native enforcement rejects an available older npm; bootstrap/cache-order and exact runtime assertions cover every added or affected job.                            |
| REQ-005 / AC-005 | Updated tools preserve OWL/package/browser behavior. Existing independent OWL, package, Java-reference, import-map, browser, and resource/size gates pass for the new graph and candidate without weakened expectations.                                             |
| REQ-006 / AC-006 | Graph changes have truthful provenance and explicit script decisions. Offline evidence verification, generated third-party inventory checks, strict installation, and scoped security assessment pass; unresolved rights or advisory dispositions stay visible.      |
| REQ-007 / AC-007 | Qualification cannot accept missing Node 26 work or old coverage. CI/release validators reject missing, failed, skipped, wrong-runtime, wrong-candidate, and incompatible historical receipts; legitimate existing main-push reuse retains its exact proof contract. |
| REQ-008 / AC-008 | Delivery preserves ownership and support promises. The accepted plan precedes implementation; unrelated work and historical evidence remain intact; source delivery and public release are reported separately.                                                      |

Domain invariants are the existing public export boundary, Java-backed OWL behavior, production dependency separation, exact retained-candidate identity, strict install-script decisions, independently owned test oracles, and immutable historical evidence.
Changing a tool is not authority to redefine the behavior those tools check.

- **DEC-001:** Stable unbounded `>=` ranges express eligibility for a deliberate refresh, not a claim that all future major versions have passed qualification.
  [npm's lockfile installation](https://docs.npmjs.com/cli/v12/commands/npm-ci/) continues to choose the committed exact graph.
- **DEC-002:** Preserve OwlAPI's native npm authority and exact release runtime; use [native devEngines](https://docs.npmjs.com/cli/v12/configuring-npm/package-json/#devengines) for the proposed local npm range without importing another repository's Corepack policy.
- **DEC-003:** Amend the Current-versus-LTS restriction explicitly to implement the user's Node 26 request now.
  Admit only the qualified Node 26 floor below 27; retain Node 24 production tooling and Node 22/24 compatibility.
- **DEC-004:** Preserve the transported Markdown core/native archive set and separate graph.
  [The centralization record](markdown-quality-centralization.md) explains why the nominal registry version is not an equivalent replacement for these public contracts.
- **DEC-005:** Use current generators and validators for import maps, provenance, dependency facts, and release gates.
  Never edit digests or generated outputs merely to make a failing assertion pass, or rewrite historical receipts as current evidence.
- **DEC-006:** Keep all existing security overrides until their owning finding has an evidence-backed disposition.
  A new locked install-script identity receives an explicit reviewed decision, normally preserving denial where functionality does not require the script.
- **DEC-007:** Consolidate the implementation before broad ordinary/security review and independent final verification.
  Follow-up reviews cover changed questions; final evidence is tied to the final input identity.

| Scenario                         | Stimulus and environment                                                                                     | Required observation                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-001: Reproducible setup       | Clean retained work area, exact selected Node/npm, reviewed lock; then a separate mismatched fixture.        | Real npm installs the locked graph without rewriting it and rejects the mismatch. Production and archive boundaries remain intact.                         |
| QA-002: Runtime compatibility    | Source and installed-tarball consumers at Node 22.23.3, 24.21.0, and 26.11.1 on the declared platform lanes. | Public ESM imports, parsing/storage, import closure, and installed consumer fixtures pass with recorded runtime identities.                                |
| QA-003: Fail-closed installation | Refresh introduces a new or changed lifecycle-script package.                                                | Strict npm policy rejects an undecided identity; approval data and governance tests describe exactly the selected graph.                                   |
| QA-004: Browser preservation     | Rebuild browser inputs with new JSPM/Vite and run all three locked Playwright engines.                       | Bundled document, import-map document, and worker consumers preserve existing oracle results, integrity boundaries, and budgets.                           |
| QA-005: Honest qualification     | Delete or skip a new Node 26 job, change its runtime, or offer an old qualification envelope in fixtures.    | Workflow and receipt validators reject incomplete or incompatible proof; exact valid full and permitted main-push reuse records still work.                |
| QA-006: Recovery                 | Interrupt dependency/evidence preparation or observe a final failure.                                        | Resume from a known candidate/graph or restore the complete prior input set; preserve failed evidence and prevent publication of an unqualified candidate. |

## Implementation slices

### SLICE-000: Establish the accepted input and safe starting point

Refresh the checkout, remote relationship, HISEW applicability/ownership, declared profiles, tool availability, and exact package selection.
Accept this draft's Node and npm policy decisions as one reviewable baseline, then capture its exact bytes through the personal snapshot route.
Select the maintained HISEW implementation procedure before beginning code/configuration changes.
Do not assume the existing local commit belongs to this task or reset it to obtain a clean branch.

Inspect exact selected and materially changed transitive package terms and retained rights evidence before adopting/executing them.
Reuse the existing evidence-acquisition and inventory tools; record support, deprecation, engines, peers, source, integrity, and actual licence/notice conclusions.
Resolve any material adoption conflict before dependent work.
Establish availability and authority for the eventual selected reviewer, R2 independent verifier, and native scoped security workflow without running them prematurely.

The first authorized source commit must include the accepted plan before the first qualification operation that requires a committed source identity.
Whether this is a plan-only commit or the first coherent source slice follows the accepted commit procedure and its prerequisites; this draft itself is not commit authorization.

Proof: exact baseline/snapshot/checkout identities, selection record, and an explicit disposition of any missing required tool or adoption evidence.
Only this planning document is produced before implementation acceptance.

### SLICE-001: Demonstrate a refreshed, reproducible developer installation

Change the 21 registry development declarations and proposed native npm policy, then refresh the root lockfile using exact npm 12.2.0.
Preserve the runtime pins, existing overrides, Markdown archive graph, and versionless `devEngines.runtime`.
Inspect direct and transitive changes, including platform optionals, engine constraints, peers, and install scripts before installation.
Do not use force, legacy peer resolution, blanket script permission, or a broad security override to hide a conflict.

Update only necessary current dependency facts and exact script identities through their owning policies.
Preserve `.npmrc`'s `strict-allow-scripts=true`; demonstrate ordinary strict `npm ci`, not only `--ignore-scripts` installation.
Refresh the root graph's authenticated evidence and generated third-party inventory through existing tools, reusing historical evidence only through their supported exact-identity route.
The isolated Markdown lock is a preservation check, not a second graph to refresh indiscriminately.

Likely files, as predictions: `package.json`, `package-lock.json`, `docs/dependency-governance.json`, `docs/provenance/npm-package-evidence.json`, `docs/provenance/third-party-material.json`, necessary evidence blobs, `governance.test.js`, and focused dependency-policy tests.
The existing `spdx-expression-parse` exact-manifest assertion in `governance.test.js` must distinguish an allowed range from the exact qualified locked artifact while retaining the parser's independent positive and negative behavior checks.

Proof: native clean install; frozen-lock mismatch rejection in a disposable fixture; npm-policy boundary checks; `npm ls`; offline evidence and generated inventory verification; targeted dependency-security and governance tests.
Show the production graph delta explicitly, including an empty delta when unchanged.
This slice is locally reversible as a complete manifest/lock/provenance set, but is not a release-ready candidate by itself.

### SLICE-002: Qualify the upgraded tools at their real consumers

Regenerate browser/import-map inputs with the existing producer and qualify the resulting artifacts.
Inspect JSPM resolution and integrity differences, Vite output and bundle budgets, ESLint diagnostics, and Playwright's device behavior.
Install the browser revisions belonging to the selected lock using the named repository command and run Chromium, Firefox, and WebKit explicitly.
Use a task-owned official browser cache if needed; retain its identity and removal condition and do not substitute an older browser after a launch failure.

Preserve original OWL/Java fixtures and expected behavior.
Review changed generated bytes by meaning and their generator's contract; do not manually restore obsolete serialization just to reduce a diff.
Keep Markdown native/public-contract checks on their existing Node 24 graph and qualification profile.

Likely files: `scripts/reference-import-map.mjs`, its tests, `scripts/prepare-browser-consumers.mjs`, `test/consumers/browser/import-map/reference-import-map.json`, browser tests/configuration only where demonstrated necessary, and current dependency/provenance records.
Most of these may need no source edit; identify them as consumers, not a mandatory refactoring list.

Proof: existing source-policy, dependency-security, import-map, candidate-bundle and browser tests; package lint/SBOM and installed OWL qualification on the retained candidate; unchanged production import boundaries and resource/size budgets.
Package construction and browser qualification use the actual retained candidate and supported command arguments, not a substitute source checkout.

### SLICE-003: Admit Node 26 with complete qualification coverage

Add the public `>=26.11.1 <27` comparator and update the current environment/toolchain policy and consumer guidance together.
Explicitly amend the old LTS-only admission rule and any current assertions derived from it.
Preserve the two existing floors, canonical Node 24 producer, versionless development runtime, and the distinction between compatibility and Node.js upstream support status.
Promote Node 26 from provisional to `SUPPORTED` only when the corresponding blocking qualification has passed.

Add `source_node_26` to CI and release qualification using exact Node 26.11.1 and npm 12.2.0.
Use the existing source/Python check path appropriate to a noncanonical runtime; keep shared Markdown qualification on its existing Node 24 lane.
Add retained-tarball Node 26 consumers for Ubuntu x64, Windows x64, and macOS arm64, using the same candidate artifact and both existing scoped/alias installation modes.
The Ubuntu retained-package lane follows candidate creation, avoiding a dependency cycle with source qualification.

Extend job `needs`, exact runtime assertions, setup/cache ordering, required-job inventories, workflow governance, and qualification-envelope tests coherently.
The existing `CI_JOB_NAMES`, `FULL_CI_JOB_IDS`, and `REQUIRED_JOB_IDS` are closed inventories, not advisory labels.
Update the policy/schema identity where required so pre-change receipts cannot prove the expanded matrix; preserve historical bytes and reject them for this new contract.
Retain Node 24 for receipt production/observation and Java authority rather than globally replacing every Node 24 literal.
Preserve FULL PR qualification and the existing independently verified main-push reuse conditions.

Likely files: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `scripts/workflow-governance.mjs`, `scripts/ci-qualification.mjs`, `scripts/ci-verification.mjs`, `scripts/require-job-success.mjs`, their tests, `scripts/assert-workflow-runtime.test.js`, `README.md`, `CONTRIBUTING.md`, and the owning sections of `docs/implementation-plan.md` or its applicable current producer-policy amendment.
Regenerate affected release-gate inventories through the native generator after reviewing the changed source obligations.
Do not rewrite unrelated historical decisions or receipt records.

Proof: independent range-boundary cases; native Node 26 startup/source/package execution; workflow syntax and governance checks; negative job/receipt fixtures; exact-floor hosted results when publication is authorized.
Current host results establish only the host actually exercised.
Adding jobs without successful execution does not establish platform acceptance.

### SLICE-004: Freeze, review, qualify, and hand off the final candidate

Consolidate changes and settle generators, formatters, lockfiles, provenance, and authorized staging/commit transitions before expensive final assurance.
Review the complete diff against this baseline, including NAM-01 semantic precision, support statements, script decisions, range-versus-lock meaning, and receipt rejection behavior.
Run the selected ordinary review, scoped native security assessment, and required independent verification on the frozen object; retain provider identity and actual reports.
Repair meaningful findings and review only changed questions unless the repair invalidates broader coverage.

Choose the HISEW final capture/handoff route from current receipt eligibility.
Use existing admissible native receipts where the exact policy permits; otherwise run the missing checks through the governed engine.
Do not run a manual duplicate of the full suite merely to repeat it for a receipt.
A commit or input change requires a fresh identity assessment and whatever exact-snapshot checks the gate actually mandates.

If source delivery is later authorized, use the approved branch/PR path, observe naturally triggered hosted checks, and preserve the existing source commit's ownership.
Do not manually dispatch remote CI.
Record source delivery, HISEW handoff, cross-platform qualification, and any later public package release as separate outcomes.
Retain required evidence before recoverable cleanup of task-owned working resources.

## Traceability and execution order

| Slice     | REQ / AC                                                            | QA / DEC                                                    | Falsifiable proof                                                                 | Release and cleanup implication                                                    |
| --------- | ------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| SLICE-000 | REQ-006, REQ-008 / AC-006, AC-008                                   | QA-006 / DEC-004, DEC-007                                   | Accepted bytes, current identities, selection/rights and capability dispositions. | Establishes authority; preserve existing local work.                               |
| SLICE-001 | REQ-001, REQ-002, REQ-004, REQ-006 / AC-001, AC-002, AC-004, AC-006 | QA-001, QA-003, QA-006 / DEC-001, DEC-002, DEC-004, DEC-006 | Strict frozen install, mismatch rejection, graph/provenance verification.         | One recoverable input set; retain pre-refresh graph and failed evidence.           |
| SLICE-002 | REQ-005, REQ-006 / AC-005, AC-006                                   | QA-004 / DEC-004, DEC-005                                   | Generator checks, three real browser engines, exact installed candidate.          | Browser/tool assets remain identified until final evidence is retained.            |
| SLICE-003 | REQ-003, REQ-004, REQ-007 / AC-003, AC-004, AC-007                  | QA-002, QA-005 / DEC-002, DEC-003, DEC-005                  | Node-floor consumers, complete jobs, rejection of incomplete/stale proof.         | New support promise requires all named lanes; keep historical receipts historical. |
| SLICE-004 | REQ-001 through REQ-008 / AC-001 through AC-008                     | QA-001 through QA-006 / DEC-007                             | Frozen full-profile receipts, supplemental consumer proof, independent assurance. | No release implication without separate delivery/release authority.                |

SLICE-000 precedes implementation; SLICE-001 establishes the graph consumed by SLICE-002 and SLICE-003; both converge at SLICE-004.
An early Node 26 smoke experiment may diagnose compatibility after baseline acceptance, but cannot replace final graph/candidate qualification.
One integrator owns the shared manifest, governance, generated evidence, and CI inventory edits.
Registry reads and later independent read-only checks may run concurrently after their inputs settle; no parallel agent delegation or coupled write work is authorized by this plan.

## Verification, oracles, and evidence limits

The configured profiles observed during planning are:

| Profile    | Actual configured commands                                                                                                                                                                     | Use in this change                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `focused`  | `npm run test:boundary`; `npm test -- --runInBand --runTestsByPath governance.test.js io/io.test.js`                                                                                           | Fast governed feedback; supplement with the specific changed contract tests.        |
| `affected` | `npm run lint`; `npm run test:boundary`; `npm test -- --runInBand governance.test.js io/ model/ internal/model/ internal/storage/ test/import-closure/ test/consumers/webvowl/cutover.test.js` | Integration feedback after graph and policy inputs settle.                          |
| `full`     | `npm run lint`; `npm run format:check`; `npm run verify:release-gates`; `npm run verify:workflow-governance`; `npm run test:boundary`; `npm test -- --runInBand --silent`                      | Mandatory R2 final local profile, using the actual selected runtime and tool paths. |

These rows do not by themselves run the complete Node/platform/browser matrix.
Supplemental obligations use existing commands: `npm run evidence:verify`, `node util/generate-third-party-material.mjs` in check mode, `npm run verify:workflow-syntax`, `npm run test:markdown`, `npm run release:lint-package`, candidate preparation/packing, `npm run candidate:portable`, `npm run test:owl-contract`, and `npm run test:browser` with the required retained-candidate/fixture/output arguments.
Inspect those supported arguments and prerequisite composition at execution time; bare command names here are not runnable substitutes for candidate-bound invocations.
Where full Jest already invokes an identical deterministic verifier, retain that coverage instead of repeating it without cause; separately configured mandatory rows still require their own valid receipt.
Inspect the existing release-gate registry to account for any additional impacted budget, evidence, or packaging obligation.

Oracles remain owned by npm for install/devEngines behavior, existing semver for eligibility, independent literal expectations for boundary tests, existing OWL/Java fixtures for semantics, actual browsers for browser behavior, and existing closed-schema/native validators for receipts and evidence.
Do not generate expected values by the implementation being tested.
Mock only genuine external failure boundaries, such as unavailable registry/artifact responses in negative tests; positive installation, runtime, browser, and package qualification require the real selected tools and artifacts.

Tests must demonstrate npm eligibility boundaries without pretending an unpublished future npm version was executed.
If no newer stable npm exists, distinguish native range semantics from actual execution on the available 12.2.0 reference.
Likewise, semver acceptance of Node 26 is not Node 26 runtime proof.
Hosted pending/skipped jobs and unavailable platform tooling remain explicit gaps.

The plan itself needs only the repository's targeted Markdown check, link validation, scope/diff inspection, and confirmation that no implementation files changed.
It does not require an application test campaign or a security scan merely to author the draft.

## Recovery, observation, and replanning

No application data migration, schema backfill, or end-user telemetry is proposed.
The migration is the developer graph plus current compatibility/evidence policies.
For interrupted work, retain the before/after manifest and lock identities, generated-evidence generation state, selected Node/npm/browser identities, and exact candidate hash; never combine half-refreshed inventories with an older candidate.
Resume or restore at a complete slice boundary and let native validators determine whether remaining evidence is usable.

The implementer observes clean-install behavior, graph changes, denied/undecided scripts, source/oracle failures, browser output and budget deltas, runtime identity, missing required jobs, and receipt rejection diagnostics.
The maintainer owns acceptance of hosted results and any eventual release.
No new monitoring service is required.
Production acceptance, if separately requested later, requires the release process's exact published-artifact/registry evidence and consumer qualification; a local pass or merged PR is not that result.

Abort publication on a failed blocking lane, changed source/candidate identity, unresolved rights/security issue, or incomplete required review.
Before public Node 26 promotion, restore the prior manifest/lock/current-policy/generated-input set together through a reviewed change, reinstall that graph, and rerun the affected gates.
After promotion, keep the Node 26 compatibility promise and use a forward fix unless the owner approves a different compatibility-line decision.
Do not unpublish, overwrite evidence, force-reset unrelated work, or delete an existing browser cache as recovery.

Replan or amend the baseline when:

- A newly selected stable dependency drops Node 22/24 support, has incompatible peers, or needs a range exception.
- Exact terms, provenance, signatures, advisories, or changed install scripts prevent adoption.
- Resolution changes production dependencies or requires a runtime behavior change beyond this request.
- Node 26 fails the declared floor/platform gates or needs a shim, different floor, or changed public support commitment.
- A browser/generator change requires different accepted semantics or a larger resource budget.
- CI policy/schema changes cannot preserve exact coverage and receipt rejection without a broader redesign.
- The checkout, accepted scope, toolchain, or candidate changes enough to invalidate the planned proof.

For each case, retain the smallest discriminating experiment and its actual failure, identify the owner decision, and continue independent authorized work.
Do not lower a floor, weaken a gate, import another chat's exception, or call a missing result a pass.

After final evidence retention, dispose only of task-owned temporary installs, browser caches, and candidate work areas that have no remaining consumer.
Record the owner and removal trigger for anything retained; preserve failed receipts, historical blobs still referenced, and recoverable branch/worktree state.
