# Security and dependency consolidation implementation plan

Status: **ACCEPTED FOR IMPLEMENTATION — in progress on local `main`.**

The owner said “Proceed with implementation” on 2026-09-29.
HISEW captured the accepted plan as snapshot `f2799e5a-11ae-4e23-adef-4b461613ce7f` before source edits; execution `22c7fa84-1386-4d83-b3ac-cb33d4a145e6` is active with risk R2 and the `full` profile.
The owner's final-commit review cadence remains in force.

Observed on 2026-09-29.
Repository: `Hadden-Industries/owlapi`.
Working directory: `C:\Users\maksy\GitHub\owlapi`, branch `main`.
Local HEAD and remote `main` both resolved to `054ad8154dcbdc11a3c1c60d081db666dd3c2c9c`; the checkout was clean before this plan was added.

The accepted unit of work removes every currently open Dependabot and CodeQL finding, incorporates the intent of every open dependency PR, and updates the maintained dependency graph and its qualification evidence together.
Development stays on local `main`.
A separate branch and one integration PR are created only at the later publication handoff, in this same checkout.

## 1. HISEW status and proposed route

The installed HISEW engine is ready at `0.1.0.dev14`.
The owner explicitly authorized project registration/activation on 2026-09-29.
The existing owlapi project registration was extended to this primary checkout, retaining its profiles, workflow policy, feedback preference and older checkout registration.
Readback for `C:\Users\maksy\GitHub\owlapi` now reports `applicability: personal`, `active: true`, and workflow `status: ready`.
The current Codex chat selects this checkout on local `main`; no separate checkout was created.

The project is `f6ded748-f3c0-41f4-8e89-def537c290f4`; the primary checkout's HISEW identity is `6f8858af-3ef0-44bd-a5c8-a57b2f25d410`.
Configuration is retained at `C:\Users\maksy\.hi\w\c\projects\f6ded748-f3c0-41f4-8e89-def537c290f4\9.json`.
The inspected activation proposal is retained under `C:\Users\maksy\.hi\w\e\task-artifacts\owlapi-hisew-activation-20260929\proposal.json`, with proposal digest `51b600fd131c2eb632cf7668c934fa521309e8c3918e9907e1bee300f1c3dcbf`.

Registration and implementation acceptance are complete.
The execution is bound to this chat and primary checkout.
Registration alone does not establish passing checks, host-hook dispatch or release readiness.
Review is deferred to the final commit stage.

**Risk class:** Accepted **R2**, inferred from changes to untrusted ontology detection, public storage behavior, the runtime dependency graph, and supply-chain verification.
No evidence currently justifies R3.

**Decision owner:** Maksym Shostak, as the requesting repository owner; the 2026-09-29 implementation instruction accepts this plan.

**Reasoning:** Four CodeQL findings affect parser detection, one affects registry URL construction, and production as well as development dependencies change.
An incorrect upgrade could reject valid ontologies, weaken rejection behavior, execute an unreviewed install script, or misrepresent release evidence.

**Potential blast radius:** Node and browser consumers, ontology storage, development and CI installation, provenance/rights inventories, and the isolated WebVOWL consumer qualification.
No consumer repository is modified by this plan.

**Reversibility:** Before publication, restore a coherent reviewed dependency, source, policy, and evidence snapshot using scoped changes.
After integration, prefer a forward fix; any revert must account for reintroduced vulnerabilities.
There is no database migration.
An npm publication would be immutable and is a separate, unapproved operation.

**Principal unknowns:** Qualification of the latest IRI library's native parsing API; exact refreshed transitive graph and lifecycle scripts; browser/N3 behavior; availability and size of new evidence; changes to alerts or versions before handoff; reviewer availability at the final commit stage.

**Required artifacts:** This accepted dossier/plan, dated source inventory and dependency decisions, meaningful regressions, regenerated current provenance and governance records, evidence bound to the final candidate, review dispositions, and a later PR-to-alert completion ledger.
Reuse the existing artifact formats.

**Required specialist lenses:** Independent code/security review of the changed trust boundaries and script decisions; standards/compatibility review of IRI and RDF behavior; owner review of changed license and rights facts where promotion requires it.
These are proposed R2 obligations, not claims that reviewers have already been selected or dispatched.

**Owner-directed review cadence:** Defer all external and independent reviews to the final commit stage, after implementation is complete and the candidate is frozen.
Use one consolidated code/security review covering the integrated change; do not add review passes per slice or repeatedly review the plan.
During implementation, use proportionate self-checks and focused tests.
Follow up on the final review only for unresolved findings or material subsequent changes, scoped to the affected surface.
This task-specific timing does not change global reviewer settings or waive final findings.

**Required verification:** Focused regressions during each slice, followed by the full affected repository checks, native CodeQL, all dependency occurrences, cross-platform package/browser/consumer qualification, and applicable configured HISEW final profiles against the frozen candidate.
Section 6 defines the proof.

**Required human approvals:** Baseline/risk/design acceptance is recorded.
Concrete digest-bound rights/license promotion when applicable; later commit/publication/merge authority.
A plan acceptance cannot stand in for review of not-yet-generated rights facts.

**Maximum sensible autonomy:** Inspection, the plan, project registration and implementation are authorized.
Implement and verify within the accepted scope; escalate contract changes, dependency exceptions, unresolved security findings, or external effects outside that authorization.

**Next lifecycle step:** Execute SLICE-001 through SLICE-005 on local `main` under the active HISEW execution, then prepare the later publication handoff.

## 2. Verified input inventory

Authenticated GitHub REST reads succeeded for both security endpoints.
The unauthenticated web-page fetch could not display the security pages; it is not the source for the counts below.
All CodeQL instances listed below identify the same `main` commit as the local baseline.
Inspection was static; no exploit, test, installation, or application was run to produce this proposal.

### 2.1 Every open Dependabot alert

| Alert                                                                  | Severity | Locked occurrence and introducing parent                                            | Proposed remediation                                                           | Completion evidence                                                              |
| ---------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [1](https://github.com/Hadden-Industries/owlapi/security/dependabot/1) | High     | `xmlbuilder2/node_modules/js-yaml@4.3.1`; parent `xmlbuilder2` requests `^4.1.1`    | Resolve `js-yaml@4.3.2`; GHSA-2883-xcg3-v3hh is fixed from 4.3.2 in this major | No affected v4 occurrence; full audit; GitHub reports fixed after integration    |
| [2](https://github.com/Hadden-Industries/owlapi/security/dependabot/2) | High     | Root `js-yaml@3.15.1`; `@istanbuljs/load-nyc-config` requests `^3.13.1`             | Resolve `js-yaml@3.15.2`; the same advisory is fixed from 3.15.2 in this major | No affected v3 occurrence; full audit; GitHub reports fixed after integration    |
| [3](https://github.com/Hadden-Industries/owlapi/security/dependabot/3) | High     | `fast-uri@3.1.6`; `ajv` requests `^3.0.1`                                           | Resolve `fast-uri@3.1.8`, above the 3.1.7 fix for GHSA-58mr-gqgx-xq4g          | No affected occurrence; schema/governance tests; GitHub reports fixed            |
| [5](https://github.com/Hadden-Industries/owlapi/security/dependabot/5) | Moderate | Runtime `undici@6.28.0`; `jsonld` → `@digitalbazaar/http-client` requests `^6.28.0` | Resolve `undici@6.29.0`, above the 6.28.1 fix for GHSA-3wwx-pv8p-q78v          | Production and full audit; JSON-LD/no-network checks; GitHub reports fixed       |
| [6](https://github.com/Hadden-Industries/owlapi/security/dependabot/6) | Moderate | Development `ip-address@10.5.0`; `socks` requests `^10.1.1`                         | Resolve `ip-address@10.7.2`, above the 10.5.1 fix for GHSA-2vr4-cq9g-pvrc      | No affected occurrence; full audit and installation checks; GitHub reports fixed |

The lockfile also contains development `@npmcli/run-script/node_modules/undici@8.10.0`, introduced through `node-gyp`'s `^8.4.1` requirement.
The [same Undici advisory](https://github.com/nodejs/undici/security/advisories/GHSA-3wwx-pv8p-q78v) affects that version even though it is not a separate alert in the returned five.
Refresh it to **8.11.2** and check every nested occurrence.
Dependency presence is established; exploitation through owlapi's HTTP paths has not been demonstrated.
Removing the affected versions does not depend on proving exploit reachability.

### 2.2 Every open code-scanning alert

| Alert                                                                     | Rule and current location                                                 | Proposed correction and regression                                                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [1](https://github.com/Hadden-Industries/owlapi/security/code-scanning/1) | `js/redos`, `internal/parsing/dl/descriptor.js:7`                         | Replace repeated XML-comment regex prefix handling; preserve XML declaration rejection                                  |
| [2](https://github.com/Hadden-Industries/owlapi/security/code-scanning/2) | `js/redos`, `internal/parsing/dl/descriptor.js:8`                         | Same bounded scanner; preserve RDF/XML and OWL/XML root rejection                                                       |
| [3](https://github.com/Hadden-Industries/owlapi/security/code-scanning/3) | `js/redos`, `internal/parsing/krss/detection.js:32`                       | Use the same internal scanner; preserve XML declaration rejection in both KRSS dialects                                 |
| [4](https://github.com/Hadden-Industries/owlapi/security/code-scanning/4) | `js/redos`, `internal/parsing/krss/detection.js:33`                       | Preserve foreign root rejection and dialect ambiguity/hint behavior                                                     |
| [5](https://github.com/Hadden-Industries/owlapi/security/code-scanning/5) | `js/incomplete-sanitization`, `util/acquire-npm-package-evidence.mjs:325` | Replace first-slash replacement with complete native path-component encoding and validate the final public-registry URL |

The parser registry supplies an 8,192-byte UTF-8 prefix by default.
This limits input length but does not establish acceptable execution time for a backtracking regex.
The proposed scanner advances monotonically over whitespace and complete leading XML comments, then checks simple signatures at the resulting offset.
Truncated comments and sniff-boundary cuts need explicit deterministic outcomes.
This is syntax detection, not a replacement XML parser or a new public API.

For alert 5, ordinary scoped package names contain only one slash, so the scanner message alone does not prove an exploit.
However, aliases may supply `lockEntry.name`, currently checked only for nonempty/non-whitespace text.
Qualification must cover that input path, complete component encoding, empty query/fragment, unchanged registry origin, and exact package identity checks.
Do not suppress or dismiss the alert simply to make the count zero.

### 2.3 Every open PR

All five are Dependabot PRs touching only `package.json` and/or `package-lock.json`.

| PR                                                        | Intent to incorporate                             | Observed head                              | Observed blocker                                                  |
| --------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| [1](https://github.com/Hadden-Industries/owlapi/pull/1)   | `spdx-expression-parse` 4.0.0 → 5.0.0             | `cb91ed3c26114af3162e98f390c6191ce8ffb9bb` | Evidence binding; old exact SPDX expectation                      |
| [13](https://github.com/Hadden-Industries/owlapi/pull/13) | `n3` 2.3.0 → 2.7.12                               | `91756f38aa7bfb122856e293d4cfc743f7f5cbed` | Evidence binding and version expectations on its older base       |
| [15](https://github.com/Hadden-Industries/owlapi/pull/15) | Playwright, ESLint, globals, Jest, Prettier, Vite | `78f3a401c718d54134deb4f8560150dda95cd1fe` | `ESTRICTALLOWSCRIPTS`: `@parcel/watcher@2.6.0` lacks a decision   |
| [18](https://github.com/Hadden-Industries/owlapi/pull/18) | `fast-uri` 3.1.6 → 3.1.8                          | `e3a8cd7aac7f626e0abc0bd92c39f21702b4197f` | Evidence binding and prospective third-party inventory generation |
| [19](https://github.com/Hadden-Industries/owlapi/pull/19) | `ip-address` 10.5.0 → 10.7.2                      | `dc6552bfe8c1d3af4565160e23e1d60ad5e5f0af` | Same evidence/inventory failures                                  |

The authoritative logs include runs [33414042940](https://github.com/Hadden-Industries/owlapi/actions/runs/33414042940), [36454726978](https://github.com/Hadden-Industries/owlapi/actions/runs/36454726978), [36454841832](https://github.com/Hadden-Industries/owlapi/actions/runs/36454841832), [36508551389](https://github.com/Hadden-Industries/owlapi/actions/runs/36508551389), and [36545901826](https://github.com/Hadden-Industries/owlapi/actions/runs/36545901826).
The common error is `Lockfile does not match its authoritative source`.

Incorporate their intended changes into one fresh graph on current local `main`.
The later integration PR should link all five.
Close them as superseded only after its merged result contains their intended upgrades and passes verification; preserve any newly discovered substantive contribution.
No PR is closed now.

### 2.4 Latest-version inventory

These are npm registry `latest` observations on 2026-09-29, not promises about a future execution date.
There are 8 runtime and 21 development direct dependencies; **9 have newer stable versions**.
Refresh this inventory before resolving the candidate and again at final handoff.

| Scope       | Package                    | Current | Latest / proposed target                   |
| ----------- | -------------------------- | ------- | ------------------------------------------ |
| Runtime     | `@hyperjump/uri`           | 1.3.5   | **1.3.6**, with native API migration below |
| Runtime     | `@rdfjs/data-model`        | 2.1.2   | 2.1.2                                      |
| Runtime     | `@rdfjs/dataset`           | 2.0.3   | 2.0.3                                      |
| Runtime     | `@xmldom/xmldom`           | 0.9.12  | 0.9.12                                     |
| Runtime     | `bcp-47`                   | 2.1.1   | 2.1.1                                      |
| Runtime     | `jsonld`                   | 9.0.0   | 9.0.0                                      |
| Runtime     | `n3`                       | 2.3.0   | **2.7.12**                                 |
| Runtime     | `rdfxml-streaming-parser`  | 3.3.0   | 3.3.0                                      |
| Development | `@cyclonedx/cyclonedx-npm` | 6.0.1   | 6.0.1                                      |
| Development | `@eslint/js`               | 10.0.1  | 10.0.1                                     |
| Development | `@jspm/generator`          | 2.16.3  | 2.16.3                                     |
| Development | `@playwright/test`         | 1.62.1  | **1.63.0**                                 |
| Development | `ajv`                      | 8.20.0  | 8.20.0                                     |
| Development | `ajv-formats`              | 3.0.1   | 3.0.1                                      |
| Development | `cross-env`                | 10.1.0  | 10.1.0                                     |
| Development | `eslint`                   | 10.9.0  | **10.11.0**                                |
| Development | `eslint-config-prettier`   | 10.1.8  | 10.1.8                                     |
| Development | `eslint-plugin-compat`     | 7.0.2   | 7.0.2                                      |
| Development | `globals`                  | 17.11.0 | **17.12.0**                                |
| Development | `jest`                     | 30.4.2  | **30.5.2**                                 |
| Development | `jsonpath-rfc9535`         | 1.3.0   | 1.3.0                                      |
| Development | `pacote`                   | 22.0.0  | 22.0.0                                     |
| Development | `prettier`                 | 3.9.6   | **3.9.9**                                  |
| Development | `publint`                  | 0.3.24  | 0.3.24                                     |
| Development | `semver`                   | 7.8.5   | 7.8.5                                      |
| Development | `spdx-expression-parse`    | 4.0.0   | **5.0.0**                                  |
| Development | `tar`                      | 7.5.22  | 7.5.22                                     |
| Development | `vite`                     | 8.2.2   | **8.3.1**                                  |
| Development | `yaml`                     | 2.9.1   | 2.9.1                                      |

Registry authorities are each package's version metadata, for example [`@hyperjump/uri@1.3.6`](https://registry.npmjs.org/@hyperjump%2Furi/1.3.6), [`n3@2.7.12`](https://registry.npmjs.org/n3/2.7.12), [`spdx-expression-parse@5.0.0`](https://registry.npmjs.org/spdx-expression-parse/5.0.0), and the corresponding endpoints for every row.
Upstream engines for all direct targets admit the existing Node 22/24 families.

Proposed meaning of latest: exact latest stable direct pins, including major upgrades; refresh **all** transitive entries to the newest versions their updated parents support, with an explicit list of remaining major-version constraints.
For example, current parents require Undici 6, fast-uri 3, and js-yaml 3/4 even though their overall latest majors are 8, 4, and 5.
Do not force incompatible global overrides or claim every transitive is on its absolute latest major.
Replacing those parents to eliminate every older major would require a broader accepted design.
No vulnerable-version exception is proposed.

Also update repository-controlled toolchain pins as one coordinated change:

- Node 22.23.2 → [22.23.3](https://nodejs.org/en/blog/release/v22.23.3), and 24.19.0 → [24.21.0](https://nodejs.org/en/blog/release/v24.21.0), the latest LTS patches in the supported families.
  Their tagged source bundles Undici 6.28.1 and 7.29.1 respectively, which meet this advisory's fixes.
  Propose raising the corresponding engine minimums with the same compatibility decision; do not silently add Node 26 to the supported contract.
- npm 12.0.2 → [12.1.0](https://registry.npmjs.org/npm/12.1.0), including `devEngines`, workflow bootstrap, runtime assertions, policy records, and tests.
- Pinned release GitHub CLI 2.98.0 → [2.101.0](https://github.com/cli/cli/releases/tag/v2.101.0), with freshly verified asset/checksum identities and existing release-tool tests.
  This does not authorize running a release.
- All seven pinned GitHub Actions, actionlint 1.7.12, and ScanCode 32.5.0 already match upstream latest-release observations.
  Keep full-SHA/checksum pinning and verify identity again at execution.
  Python 3.14.7 is the current ScanCode runtime; qualify tooling within that supported line.

The pinned Java OWLAPI 5.5.1 revision, W3C fixtures, historical release evidence, and downstream source fixtures are compatibility/evidence authorities, not a floating dependency-upgrade list.
Their deliberate immutability remains intact.

## 3. Draft requirements, acceptance, and design decisions

| Requirement                                    | Acceptance criterion                                                                                                                                                                                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001: clear dependency findings             | AC-001: no lockfile occurrence matches the advisory ranges behind the five alerts, including the additional vulnerable Undici occurrence; production and complete audits return zero known vulnerabilities; the five GitHub alerts become fixed on merged `main` |
| REQ-002: clear code-scanning findings          | AC-002: meaningful regressions pass, CodeQL completes successfully on the final candidate and merged commit, and alerts 1–5 are fixed without suppressions or deletion of affected functionality                                                                 |
| REQ-003: current dependency/toolchain baseline | AC-003: every direct dependency equals the rechecked stable target; all transitives and script-bearing packages have a disposition; supported runtime and tooling pins agree throughout the repo                                                                 |
| REQ-004: preserve ontology contracts           | AC-004: syntax selection, resource limits, Unicode/IPvFuture lexical identity, rejection errors, atomic storage, public imports, and supported Node/browser behavior remain qualified                                                                            |
| REQ-005: truthful supply-chain evidence        | AC-005: exact lockfile-bound corpus, complete optional/platform coverage, authentic artifact identities, current inventories and SBOM pass their native validators; changed approvals remain pending until the owner reviews them                                |
| REQ-006: one coherent integration              | AC-006: one later PR incorporates all five bot-PR intents, passes current rules, merges normally to remote `main`, and local `main` is reconciled without losing unrelated work                                                                                  |

Selected design, proposed for acceptance:

- **DEC-001 — single coordinated graph.**
  Re-resolve from the current accepted baseline and generate evidence once for the settled graph.
  Sequentially merging five bot branches would repeat coupled evidence work and still omit other upgrades.
  Blanket forced overrides would ignore parent contracts.
  The unified graph is recommended.
- **DEC-002 — native IRI API migration.**
  The existing dependency policy deliberately holds `@hyperjump/uri` at 1.3.5 because 1.3.6's `isIri` throws for IPvFuture.
  The [upstream change](https://github.com/hyperjump-io/uri/compare/v1.3.5...v1.3.6) leaves exported `parseIri` using the full IRI grammar without that rejection.
  Qualify direct switches in Functional `fullIri`, RDF/XML named-node validation, and RDF/XML predicate-namespace selection to this native parsing API; preserve original string bytes, and translate native parse failure at the existing OWL storage error boundary.
  Do not catch exception-message text, retry using old code, normalize/compose an IRI, or add a compatibility shim.
  This is a source-backed hypothesis, not a completed compatibility result.
  If it fails, stop this upgrade for an owner-reviewed replacement decision; do not quietly keep 1.3.5 while claiming AC-003.
- **DEC-003 — bounded syntax detection.**
  Share a small internal, monotonic leading-XML-trivia scanner between DL and KRSS detection.
  Preserve the existing detection result/reason vocabulary, priority, UTF-8 sniff bound, and dialect rules.
  Use native string operations; do not add a parser dependency for this.
- **DEC-004 — registry URL construction.**
  Use native complete component encoding and WHATWG URL inspection at the packument request boundary, covering alias identities as well as ordinary package paths.
  Keep integrity, exact-name, version, signature, provenance, redirect, and archive checks.
- **DEC-005 — explicit install-script policy.**
  Inspect authenticated script contents for every new or changed script-bearing package.
  Prefer denying `@parcel/watcher`'s optional build script if supported prebuilt artifacts satisfy the actual Linux/Windows/macOS jobs; prove that before recording the decision.
  Any required allowance must be exact-version, justified, and reviewed.
  Preserve `.npmrc` strict enforcement; do not use allow-all or disable policy globally.
- **DEC-006 — coherent evidence and normal merge.**
  Use existing verified corpus reuse for unchanged artifact identities, then native acquisition for missing identities and whole-corpus validation.
  Preserve immutable historical evidence.
  Later use a normal PR merge so local implementation commits remain ancestors and local `main` can fast-forward to the merged result.

## 4. Quality scenarios and oracles

| Scenario                        | Stimulus and falsifiable response                                                                                                                                                                                                                                                                                                                                              | Oracle / boundary                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-001: bounded detection       | Repeated, incomplete, whitespace-separated and truncated XML-comment prefixes, with and without foreign signatures, produce deterministic results. Each 8 KiB case finishes within a proposed 1-second detector budget in an isolated worker; a separate 5-second harness deadline prevents hanging the suite. Record scaling at 1/2/4/8 KiB and larger explicit sniff bounds. | Existing DL/KRSS outcomes plus independently written cases; review proves monotonically advancing scanning. Timing alone is not the complexity proof. |
| QA-002: IRI fidelity            | Valid IPvFuture/IPv6/Unicode/percent-encoded/query/fragment IRIs round-trip through Functional and RDF/XML storage with identical lexical values and zero loader calls. Malformed/relative/non-well-formed values return the existing error and leave a prior target untouched.                                                                                                | `model/owlOntologyManager.storage.test.js`, renderer/storer tests, RFC 3987 and pinned Java behavior; no new permissive oracle.                       |
| QA-003: safe registry request   | Scoped/unscoped names, alias names, repeated delimiters and reserved characters cannot change origin, query, fragment, or requested package identity. Bad inputs fail deterministically.                                                                                                                                                                                       | Real acquisition flow with the existing local registry fixture; mock only external registry responses and failures.                                   |
| QA-004: repeatable installation | A clean installation on each supported CI OS/Node lane succeeds with strict script decisions, valid peer resolution, and no undocumented lifecycle execution.                                                                                                                                                                                                                  | Exact lockfile, package manifests, `npm ci`, and existing workflow runtime assertions; installed local modules are not the lockfile authority.        |
| QA-005: evidence integrity      | A changed lockfile/artifact/policy or corrupted blob fails verification; the regenerated settled graph passes including optional foreign-platform artifacts.                                                                                                                                                                                                                   | Existing independent evidence/schema/closure checks; no hand-edited hashes or inferred approval.                                                      |
| QA-006: consumer compatibility  | Updated N3 parsing preserves strict Turtle/N-Triples/N-Quads/TriG behavior, cancellation, limits and diagnostics; the packed candidate passes installed Node, all three browsers, and isolated WebVOWL checks.                                                                                                                                                                 | Standards fixtures, adapter/resource tests, pinned Java differential checks and actual installed package consumers.                                   |

The owner accepts these proposed budgets and invariants with the baseline.
Real libraries are used for contract tests.
Do not mock the new parser, IRI validator, SPDX parser, or internal evidence checks to make their migrations pass.

## 5. Ordered implementation slices

One integration owner executes these slices sequentially in the existing checkout.
Dependency, policy and evidence writes are semantically coupled.
Independent read-only release-note research may overlap, but this plan does not dispatch agents or concurrent writers.
Independently demonstrable slices are not separate publication promises; the owner requested one integration unit.

| Slice                                                     | Requirements / decisions / scenarios                             | Deliverable and predicted file seams                                                                                                                                                                                                                                                                                                                                      | Proof and release/cleanup implication                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SLICE-001 — accept and qualify the upgrade boundary**   | REQ-003/004/006; AC-003/004; DEC-001/002; QA-002                 | Accept draft and start the execution using the active HISEW registration. Refresh alerts/PRs/versions and retain baseline identity. Qualify `parseIri` from 1.3.6 at `internal/storage/functional/functionalSyntaxRenderer.js` with its renderer/storer and manager-storage tests. Read upstream N3 and SPDX changes. Record native API/license/engine decisions.         | Existing valid and invalid storage cases must survive the native migration; add focused cases only where current tests leave a gap. An incompatible native API is an early replan gate, before expensive corpus generation.                                                                                                               |
| **SLICE-002 — remove the code-scanning causes**           | REQ-002/004; AC-002/004; DEC-003/004; QA-001/003                 | Change `internal/parsing/dl/descriptor.js`, `internal/parsing/krss/detection.js`, and `util/acquire-npm-package-evidence.mjs`. Predicted new shared module: `internal/parsing/xmlOntologySignature.js`, named/documented for its actual contract. Extend DL/KRSS detection, registry and `util/third-party-evidence/acquisition.test.js` / `lock-graph.test.js` coverage. | Demonstrate the relevant failure before each fix and success afterward. Preserve all four alert IDs despite shared fixes. Stage the fixed acquisition code before regenerating evidence.                                                                                                                                                  |
| **SLICE-003 — qualify the complete new dependency graph** | REQ-001/003/004; AC-001/003/004; DEC-001/002/005; QA-002/004/006 | Update `package.json`, `package-lock.json`, current runtime/tooling policy, `.github/workflows/*.yml`, runtime/governance assertions, `scripts/github-cli.mjs`, browser provider inputs and affected adapters if native API changes require them. Incorporate all five PR intents. Audit every direct/transitive/optional occurrence and script.                          | Clean strict install; focused N3, SPDX, IRI, schema, browser-provider and release-tool tests; production and full audit. SPDX 5 must accept its supported LicenseRef-with-exception grammar while preserving invalid-expression rejection. A graph change is incomplete until SLICE-004; expected stale-evidence failures remain visible. |
| **SLICE-004 — regenerate evidence for the settled graph** | REQ-005; AC-005; DEC-006; QA-005                                 | Refresh `docs/provenance/npm-package-evidence.json`, content-addressed corpus, `docs/provenance/third-party-material.json`, `docs/provenance/rights-inventory.json`, `docs/dependency-governance.json`, current browser/package facts, and affected documentation using existing tools and schemas.                                                                       | Verify baseline before reuse, authenticate/scan new artifacts, validate full output, regenerate third-party facts and rights scope, and retain a readable old/new fact diff. Changed fact approvals are pending. No stale evidence, scanner suppression, or substituted hashes.                                                           |
| **SLICE-005 — freeze and qualify one candidate**          | REQ-001–005; AC-001–005; QA-001–006                              | Finish targeted formatting and source changes, freeze source/lock/policy/tool identities, retain a candidate tarball and its manifest, then run section 6 checks. At the final commit stage, conduct one consolidated code/security review under the owner's cadence.                                                                                                     | Every required result names its exact input. Material edits invalidate affected evidence. Request any required owner review only after the actual generated fact set is ready to inspect. Preserve failed results and their remediation.                                                                                                  |
| **SLICE-006 — later single-PR integration and readback**  | REQ-006; AC-001/002/006; DEC-006                                 | At authorized publication time, create the source branch from completed local `main` in the same checkout, create one PR, and attach all five PR/ten alert dispositions. Meet current rules, merge normally, and reconcile local `main`.                                                                                                                                  | Confirm merged SHA, passing hosted CI/CodeQL, fixed alert states and no newly open findings; then close superseded bot PRs with the integration reference when authorized. Preserve evidence before scoped temporary cleanup.                                                                                                             |

### Evidence reuse without a worktree

Before changing the lockfile, retain the baseline lockfile, evidence manifest and referenced corpus beneath an owned ignored staging directory such as `.release/security-dependency-refresh/baseline/`.
This is an immutable **data snapshot**, with no `.git`, branch or alternate development checkout.
Record its source commit and digests.
Do all source work on local `main`.

The existing `--reuse-evidence=<baseline-directory>` path verifies the prior lockfile binding, complete corpus, signatures and matching scanner policy before reuse.
Produce candidate evidence separately under the same owned staging root, then use the existing explicit write/promotion path after validation.
Do not combine reuse with shard acquisition.
If scanner policy changes, reuse is invalid and acquisition must follow the fresh path.

Interrupted work resumes only after rechecking baseline/candidate identities and completed artifact records.
Retained temporary downloads are not approvals or committed evidence.
Clean up only this task's owned staging data after durable evidence retention; never prune unrelated evidence or another checkout.

## 6. Verification and final acceptance

The retained HISEW profiles are:

| Profile    | Registered commands                                                                                                                  | Limits                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `focused`  | `test:boundary`; Jest `--runInBand --runTestsByPath governance.test.js io/io.test.js`                                                | 120 and 180 seconds                     |
| `affected` | `test:boundary`; Jest `--runInBand` across governance, IO, model, internal model/storage, import closure and WebVOWL cutover; `lint` | 120, 300 and 180 seconds                |
| `full`     | Jest `--runInBand --silent`; `test:boundary`; `lint`; `format:check`; `verify:release-gates`; `verify:workflow-governance`           | 600, 120, 180, 180, 120 and 120 seconds |

These are portable `npm-script` declarations; the R2 policy requires `full` and a prior accepted baseline.
The product-specific checks below supplement those profiles, especially detector/acquisition regressions, evidence, CodeQL and hosted qualification.
Capture the current baseline where needed, then use focused feedback.
Run the full expensive checks once the graph and evidence settle; repeat only checks invalidated by later changes or unresolved failures.
External reviews wait for the final commit stage under the cadence in section 1.

1. **Focused behavior:** DL/KRSS detection and registry tests; IRI renderer, storer and manager-storage tests; N3 adapter/resource and relevant conformance suites; acquisition/lock-graph/signature/archive/evidence tests; SPDX/governance, workflow/runtime and GitHub CLI tests.
   Demonstrate regressions through the real changed boundaries.
2. **Dependency state:** `npm ci` using the selected exact Node/npm tooling; `npm ls --all`; both `npm audit --omit=dev --json` and `npm audit --json`; lockfile-based inspection of every advisory range and optional/platform entry.
   Recheck all 29 direct registry targets and the constrained transitive inventory.
   A missing audit service is unavailable evidence, not zero vulnerabilities.
3. **Repository gates:** `npm run format:check`, `npm run lint`, `npm test -- --runInBand`, `npm run test:boundary`, `npm run verify:workflow-syntax`, `npm run verify:workflow-governance`, and `npm run verify:release-gates`, with existing required reference prerequisites.
4. **Evidence and package:** `npm run evidence:verify`, `node util/generate-third-party-material.mjs`, `npm run release:lint-package`, candidate packlist/static-import-closure/import-purity/no-network tests, and the validated production CycloneDX SBOM.
   Refresh current measured bundle and parser-performance records where the graph affects them; preserve historical measurements as history.
5. **Hosted integration:** existing Ubuntu source lanes; Windows/macOS installed candidate lanes on the supported Node versions; Chromium, Firefox and WebKit; isolated WebVOWL consumer; pinned Java differential and all four July ontology reconciliations.
   Run the existing candidate workflows against the exact retained candidate.
   Local Windows evidence alone cannot satisfy these lanes.
6. **Final commit review and CodeQL:** at the final commit stage, one consolidated code/security review and native scanning of the final changed surface, with data-flow/resource and dependency-policy review.
   A successful job alone does not establish alert closure.
   Check each alert ID on the final commit and repeat the inventory on merged `main`; resolve newly introduced findings too.

The current branch rules require a PR, resolved review threads, an up-to-date `CI / required`, and the configured CodeQL rule (high-or-higher security alerts).
This work's AC-001/002 are deliberately broader: all listed alerts must be fixed, including moderate dependency findings.
Preserve the required checks and existing release freshness controls.
The manual 32×2 evidence diagnostic is for changes to normalization or platform semantics; ordinary dependency refresh does not automatically require it.
A future release still requires its fresh 32-shard acquisition and committed-evidence comparison.

Completion means: refreshed latest-version inventory satisfies AC-003; every current alert has verified remediation; the full graph installs safely; behavior and provenance are qualified; one merged PR contains the complete work; all five old PRs have a final disposition; and local/remote `main` are reconciled.
A passing local test run, a branch push, or an empty alert response without successful API access is insufficient.

## 7. Delivery, recovery, and decisions that trigger replanning

Keep package identity and release phase truthful.
This change does not publish to npm, finish the pre-existing 0.1.0 release, advance Phase 21 acceptance, rewrite historical provenance, update external consumer repositories, or introduce new OWL capabilities.
Use the existing release process only after separate approval.
Pending human review of mutable release facts already exists on this baseline; do not present it as an approval obtained during this maintenance work.

Apply the repository's security disclosure policy before publishing findings or reproduction details in the later public PR.
Keep restricted report content in the appropriate private review channel; the public change description can explain the corrected behavior without copying private alert payloads.

At the later publication handoff, preserve the completed local commits on the new source branch and use the accepted signed-commit/publication procedure. A normal PR merge keeps those commits in remote ancestry, enabling a clean local fast-forward afterward. Do not force-push remote `main`, reset away local work, or delete other branches/worktrees.
Recheck remote movement before integration; any necessary reconciliation must preserve both histories and refresh affected evidence.

The integration owner observes hosted results and alert processing until every acceptance condition is known.
Record source/merge SHA, tool versions, audit timestamp and counts, CodeQL analysis identity, candidate/corpus digests, review dispositions, and PR outcomes.
Do not schedule continuing monitoring unless the owner requests it.

Abort dependent work and replan when:

- `parseIri` fails the existing accepted IRI contract, or another upgrade requires a public-contract break, shim, new major runtime family, or dependency exception;
- a new transitive parent constraint prevents removal of an affected version, or a new install script cannot be denied or justified with evidence;
- source/lockfile/scanner-policy changes invalidate the accepted candidate or prior corpus reuse, or new license/rights facts need an accountable decision;
- alerts, PR intent, versions or remote `main` materially change after capture;
- required native review, CodeQL, registry evidence, platform checks or HISEW controls are unavailable.
  Retain the concrete failure and owner action instead of claiming the check passed or lowering the gate.

Before merge, recovery restores a coherent source + manifest + lockfile + policy + evidence set through scoped reviewed changes.
After merge, prefer a corrective PR.
Reverting the combined change would reintroduce the original advisories and must be an explicit owner recovery decision with mitigations, followed by fresh CI/audit/CodeQL readback.
No rollback claim extends to an immutable npm release.

## 8. Implementation decisions and retained qualification

The implementation uses `internal/parsing/xmlOntologySignature.js` for both DL and KRSS XML exclusions.
Its monotonic comment scan replaces the four backtracking expressions.
Regression tests first reproduced the original deadline failure, then passed through all three real detectors.
Registry packument construction encodes the complete package name as one URL component and rejects identities changed by URL parsing, including dot segments.

Both Functional Syntax and RDF/XML storage now use the maintained native `parseIri` API. The RDF/XML namespace-selection path is included: an IPvFuture annotation predicate is explicitly declared and round-tripped through both formats.
Malformed IRIs still fail without replacing prior target contents.

The settled lockfile resolves both `js-yaml` occurrences to 3.15.2 and 4.3.2, `fast-uri` to 3.1.8, `ip-address` to 10.7.2, and `undici` to 6.29.0 and 8.11.2.
All 29 direct dependencies match the latest registry versions.
The new `@parcel/watcher@2.6.0` install-script decision is explicitly `false`: the script only requests a source build when configured to do so, and its native Windows prebuild loads after a clean strict-policy installation.

The five accepted TriG exclusions were probed again against N3 2.7.12 and still fail their pinned expected results.
Historical fixtures and their classifications remain unchanged.
Current dependency governance corrects an older browser-cost statement: `@xmldom/xmldom` supplies RDF/XML serialization in all hosts, while the parser fallback alone is excluded from document-browser parsing.

The retained Windows candidate is `.release/security-dependency-refresh/candidate/owlapi-0.1.0-rc.1.tgz`, SHA-256 `8f3bbcc1241a3862ac095fa7446f963eedf586beec069f4cc72f4b318256cd4f`, containing 89 files.
Native packing, strict publint, CycloneDX validation, production-graph reconciliation, installed-package checks, browser consumers, and all four pinned July ontology families have passed against these package bytes.
The latter are local qualification results; hosted platform lanes and final independent review retain their separate obligations.

Native CodeQL 2.27.1 reports zero results for the repository's configured default JavaScript and Actions suites.
The supplemental extended-suite observations and their explicit dispositions are retained in `.release/security-dependency-refresh/codeql-triage.md`; no suppression was added.
The same task directory retains candidate manifests, raw audit and registry inventories, failed attempts, browser measurements, and supplemental reports.
Final HISEW verification follows completion of the authenticated evidence refresh and current-fact bindings.
Human review fields stay pending, and external review, commit, hosted CI, PR closure, and remote integration remain later steps.
