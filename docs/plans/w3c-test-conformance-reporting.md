# Post-1.0 W3C Test-Suite Conformance Reporting Implementation Plan

> **For implementing agents:** Execute this plan task by task in the primary
> task. Do not use subagents unless the repository owner later authorizes them
> explicitly.<br>
> **Status:** Deferred, independently actionable post-release programme.<br>
> **Activation gate:** Begin only after
> `docs/owlapi-js/implementation-plan.md` has completed with public
> `owlapi@1.0.1` under `latest`, the canonical
> `Hadden-Industries/owlapi` repository established, and WebVOWL consuming the
> exact public-registry package.<br>
> **Goal:** Produce reproducible, version-specific W3C test-suite results for
> the RDF-reading components of `owlapi`, publish accurate EARL reports, and
> seek inclusion in the applicable W3C implementation reports without claiming
> certification or independent-parser status.<br>
> **Architecture:** A repository-only conformance harness installs and verifies
> one exact public `owlapi` artefact, exercises its private syntax-to-RDF/JS
> adapter boundary against pinned upstream manifests, records a complete neutral
> result ledger, and generates deterministic EARL Turtle from that ledger. The
> harness does not create a new public package entry point.<br>
> **Tech stack:** Native ESM JavaScript, the package's existing Jest and RDF/JS
> test infrastructure, pinned W3C manifests and fixtures, EARL 1.0/DOAP/FOAF
> vocabularies, and the upstream repositories' own report-generation toolchains
> for final validation.<br>
> **Specifications:** [EARL 1.0 Schema](https://www.w3.org/TR/EARL10-Schema/),
> [W3C RDF test reports](https://github.com/w3c/rdf-tests/tree/main/rdf/rdf12/reports),
> and the
> [JSON-LD processor implementation report](https://w3c.github.io/json-ld-api/reports/).

---

## 1. Responsibility and non-blocking boundary

This document owns the work required to turn the package's existing local W3C
test evidence into complete, machine-readable, externally reviewable
implementation reports. It is intentionally separate from the extraction and
publication plan.

The following boundary is normative:

- Phase 20 and `docs/owlapi-js/implementation-plan.md` complete when their own
  `owlapi@1.0.1` and WebVOWL-consumer gates pass. They do not wait for this plan
  to start, for a W3C maintainer to reply, for an upstream pull request, or for
  an implementation-report merge.
- A later test failure is evidence about the exact tested release. It may create
  a normal issue and patch-release obligation, but it does not retroactively
  make the predecessor plan incomplete.
- This programme may run before, after, or alongside the separate post-1.0
  semantic-capability programme once both have passed their common `1.0.1`
  activation gate. Neither programme is a prerequisite for the other.
- External W3C eligibility, review, merge, and publication remain controlled by
  W3C maintainers. Local completion requires an accurate report and a recorded
  upstream disposition; it does not require a favourable or timely external
  decision.
- The package's existing conformance tests remain ordinary release-quality
  evidence. Generating or submitting an implementation report is not made an
  automatic gate for unrelated `owlapi` releases.

During Phase 19, the maintained copy of this document moves into the canonical
package repository as:

```text
Hadden-Industries/owlapi/docs/plans/w3c-test-conformance-reporting.md
```

This WebVOWL staging copy then becomes historical. WebVOWL must not retain a
second normative copy after the repository handoff.

## 2. Exact claim and test-subject boundary

### 2.1 Versioned test subject

The default first subject is the exact public `owlapi@1.0.1` artefact. The
report identifies all of the following:

- the exact npm version URL;
- npm registry integrity and tarball digest;
- signed source tag and commit;
- the conformance-harness commit;
- the pinned upstream test-suite commit;
- Node, operating-system, and runner versions;
- the exact installed versions of relevant parser dependencies; and
- the UTC execution time.

`1.0.1` may be named only if the tested production bytes are those published as
`owlapi@1.0.1`. Test-harness-only changes may report on that unchanged artefact.
If satisfying a test requires any production-source or runtime-dependency
change, publish and verify the appropriate later `owlapi` patch release first,
then report that exact version. Never attribute a later fix to `1.0.1`.

### 2.2 RDF report scope

The RDF test subject is described as the **RDF document-reading components of
`owlapi` at the exact-format syntax-to-RDF/JS boundary**. The outcome measures
the RDF dataset produced before RDF-to-OWL reconstruction.

| W3C area | Reported scope |
| --- | --- |
| RDF/XML | document acceptance/rejection and RDF graph production |
| Turtle | document acceptance/rejection and RDF graph production |
| TriG | document acceptance/rejection and RDF dataset production, including graph terms |
| N-Triples | document acceptance/rejection and RDF graph production |
| N-Quads | document acceptance/rejection and RDF dataset production |
| N-Triples/N-Quads canonical output | inapplicable to the reader-only subject unless a separately released public storer implements it |
| RDF Semantics entailment | inapplicable because the reported subject exposes no RDF simple/RDFS entailment implementation |

The report does not measure parser selection, RDF-to-OWL reconstruction,
ontology-manager semantics, VOWL generation, reasoning, or serialization unless
a later report explicitly defines and versions a different test subject.
Public manager loads remain useful integration smoke tests, but their results
must not replace the syntax-to-RDF/JS outcomes required by the W3C manifests.

### 2.3 JSON-LD report scope

JSON-LD uses its own W3C test repository and implementation report and therefore
receives a separate result ledger, EARL file, upstream consultation, and pull
request. Its initial subject is the JSON-LD-to-RDF reader component used by
`owlapi`.

The report exercises the implemented `toRdf` modes, including processing-mode,
external expansion-context, RDF-direction, and `useJCS` behaviour. `fromRdf`,
compaction, expansion as a standalone API, flattening, framing, HTML extraction,
and other unimplemented JSON-LD processor surfaces are reported as inapplicable
or omitted only as directed by the current upstream reporting policy. They are
not implemented merely to make the report visually complete.

### 2.4 Layered implementation disclosure

The package must be presented as a composite reader implementation:

- Turtle, TriG, N-Triples, and N-Quads parsing is composed over N3.js;
- RDF/XML parsing is composed over `rdfxml-streaming-parser`;
- JSON-LD processing is composed over `jsonld.js`; and
- `owlapi` contributes exact-format selection, strict format policies, resource
  controls, error normalization, RDF/JS normalization, graph policy, and OWL
  integration around those dependencies.

Historical W3C reports already cover some of those underlying parsers. The
`owlapi` result is still useful as integration evidence, but it must never be
represented as a second independent implementation for W3C Recommendation-exit
purposes. Whether W3C wishes to list a layered subject at all is an upstream
policy decision obtained in Phase 2.

### 2.5 No public API expansion

The conformance harness may load private modules from an unpacked, integrity-
verified test artefact by absolute file URL. That is a repository-owned test
technique, not a consumer contract. This plan must not:

- add `owlapi/rdf`, `owlapi/parser`, or another JavaScript-invented public
  package subpath;
- weaken the package `exports` encapsulation;
- document internal paths as supported consumer imports; or
- move private RDF/JS engines into a Java-shaped public namespace merely for
  test convenience.

The negative package-boundary test proving that `owlapi/rdf` and unexported deep
imports fail remains green throughout this programme.

## 3. Starting evidence, not final report results

The WebVOWL staging repository already contains substantial conformance
evidence. These counts are a migration baseline only. Every result must be
re-enumerated and rerun against the exact report subject and the newly pinned
upstream revision.

| Surface | Existing pinned evidence | Work required for a current report |
| --- | --- | --- |
| RDF/XML | 166 active RDF 1.1 cases: 126 evaluation and 40 negative-syntax cases, pinned from `w3c/rdf-tests@ad541a5f0479f0798608c4801369d97b8e08b36f`, all passing | Add and run the 31 RDF 1.2 evaluation cases in the current RDF/XML root manifest |
| Turtle | 387 independently classified RDF 1.1 plus RDF 1.2 syntax cases from `w3c/rdf-tests@12774b0ebb385d17651b396654b19254d0fefbfa`, all passing | Add and run the 32 RDF 1.2 evaluation cases in the current Turtle root manifest |
| N-Triples | 99 independently classified RDF 1.1 plus RDF 1.2 syntax cases, all required cases passing | Inventory the 41 active canonical-output cases and report them according to the reader-only applicability decision |
| N-Quads | 114 independently classified RDF 1.1 plus RDF 1.2 syntax cases, all required cases passing | Inventory the 41 active canonical-output cases and report them according to the reader-only applicability decision |
| TriG | 418 classified cases: 413 required cases passing and five RDF 1.2 evaluation cases excluded for the recorded N3.js 2.3.0 gap; 12 former N3.js 2.2.0 exclusions were promoted after the coordinated dependency qualification | Rerun all 418; convert each remaining exclusion to an actual EARL outcome |
| RDF Semantics | no claimed RDF simple/RDFS entailment surface | Inventory every root-manifest case and apply the upstream-approved inapplicable treatment |
| JSON-LD to RDF | 462 required cases passing and five exclusions at `w3c/json-ld-api@ffdb326121ea89b7b8280e76a5caea923834bcef` | Rerun all cases; the two generalized-RDF cases may be inapplicable to this boundary, while a known wrong result remains failed |
| JSON-LD from RDF | 54 cases classified not applicable | Reconcile against the current report manifest and upstream partial-implementation policy |

The five RDF reader surfaces currently account for 1,167 passing staging
assertions. That aggregate is not a W3C conformance score, does not include the
JSON-LD results, and must not be copied into public material without a fresh
versioned run.

On 24 August 2026, the local `w3c/rdf-tests` research checkout was at
`8af71fed933539d09d5f4658fb1ea7ba4c8e30b9`. At that revision, the consolidated
RDF 1.2 report recursively used the RDF/XML, Turtle, TriG, N-Triples, N-Quads,
and RDF Semantics roots, accepted one Turtle EARL file per implementation under
`rdf/rdf12/reports/`, and generated HTML plus JSON-LD with `earl-report`. This is
research context, not the execution pin: Phase 1 must select the then-current
exact revision and re-read its instructions.

## 4. Canonical repository file map

Create the following repository-only structure in `Hadden-Industries/owlapi`.
Keep ordinary parser conformance tests colocated with their private adapters;
this tree owns cross-suite inventory, exact-package execution, result recording,
and publication.

```text
docs/
├── conformance/
│   └── w3c/
│       ├── README.md
│       ├── baseline.json
│       ├── result.schema.json
│       ├── upstream-consultation.md
│       ├── results/
│       │   ├── rdf-1.2.json
│       │   └── json-ld.json
│       └── reports/
│           ├── owlapi-rdf-1.2.ttl
│           └── owlapi-json-ld.ttl
│
scripts/
└── conformance/
    ├── inventory-w3c-manifests.mjs
    ├── materialize-owlapi-subject.mjs
    ├── run-w3c-rdf.mjs
    ├── run-w3c-jsonld.mjs
    ├── generate-earl.mjs
    └── verify-earl.mjs

test/
├── conformance/
│   └── w3c/
│       ├── manifestInventory.test.js
│       ├── subjectIdentity.test.js
│       ├── rdfResultLedger.test.js
│       ├── jsonLdResultLedger.test.js
│       ├── earlGenerator.test.js
│       ├── subject/
│       │   ├── package.json
│       │   └── package-lock.json
│       └── fixtures/
│           ├── duplicate-test-iri.json
│           ├── invalid-outcome.json
│           └── minimal-result.json
└── fixtures/
    └── w3c/
        ├── rdf-tests/
        ├── json-ld-api/
        └── SHA256SUMS
```

`baseline.json` is the single machine-readable authority for the subject,
upstream revisions, manifest roots, expected inventory, dependency disclosure,
and report identities. The two result ledgers are generated evidence, not
hand-edited assertions. The EARL files are deterministic projections of those
ledgers.

The vendored fixtures, harness, raw results, and generated EARL reports remain
outside the npm tarball. The installed README may link to the repository report,
but this plan does not broaden the bounded package file set. Preserve every
upstream licence/README required by the selected fixture material and record
source-to-vendored paths plus hashes.

## 5. Neutral result contract

### 5.1 Baseline fields

`docs/conformance/w3c/baseline.json` records at least:

```text
schemaVersion
subject.name
subject.version
subject.npmUrl
subject.registryIntegrity
subject.tarballSha256
subject.sourceRepository
subject.sourceCommit
subject.signedTag
subject.runtimeDependencyVersions
subject.componentModules
suites[].repository
suites[].revision
suites[].manifestRoots
suites[].fixtureTreeSha256
reports[].subjectIri
reports[].assertorIri
reports[].scope
```

An executable schema test rejects unknown or missing identity fields. The
runner refuses to execute if the installed tarball, registry integrity, source
tag, or configured version does not match the baseline.

Each generated result ledger additionally records the clean harness commit that
performed the run, the exact subject lockfile hash, Node version, operating
system, and UTC execution time. The harness commit is intentionally captured at
execution rather than embedded in a commit that would have to refer to itself.

### 5.2 Per-test fields

Each neutral result entry records:

```text
testIri
manifestIri
testTypeIri
component
applicability
executionState
outcome
reasonCode
reason
evidence
durationMs
```

`reasonCode` and `reason` are required for any non-passing outcome and absent
for a pass. Evidence contains bounded diagnostics or hashes, never an absolute
developer-machine path, secret, or unbounded parser dump.

`executionState` is exactly one of `EXECUTED`, `NOT_EXECUTED`, or
`NOT_APPLICABLE`. The only valid combinations are:

- `EXECUTED` with `PASSED`, `FAILED`, or `CANNOT_TELL`;
- `NOT_EXECUTED` with `UNTESTED`; and
- `NOT_APPLICABLE` with `INAPPLICABLE`.

`durationMs` is a non-negative number for `EXECUTED` and `null` otherwise.

### 5.3 Outcome vocabulary and EARL mapping

The neutral result vocabulary is finite:

| Neutral outcome | EARL outcome | Meaning |
| --- | --- | --- |
| `PASSED` | `earl:passed` | The exact test oracle was satisfied |
| `FAILED` | `earl:failed` | The subject ran but rejected valid input, accepted invalid input, or produced the wrong result |
| `INAPPLICABLE` | `earl:inapplicable` | The test exercises a capability outside the precisely disclosed subject |
| `UNTESTED` | `earl:untested` | The test was deliberately not executed and the report explains why |
| `CANNOT_TELL` | `earl:cantTell` | Execution completed but the available oracle could not determine a result |

`EXCLUDED_WITH_REASON`, `SKIPPED`, and `INFRASTRUCTURE_ERROR` are not report
outcomes. A former exclusion is rerun and becomes one of the five values above.
A dependency bug that produces known wrong output is `FAILED`, not
`INAPPLICABLE`. An infrastructure failure prevents report generation; fix the
environment and rerun rather than publishing a permanent infrastructure state.

### 5.4 Completeness and determinism

For every recursively included upstream manifest root selected for a report:

- discover active test IRIs from the manifest graph rather than maintaining a
  handwritten count;
- emit exactly one neutral result and one EARL assertion per reportable test;
- reject duplicate test IRIs, unrecognized test types, missing outcomes, stale
  fixture hashes, and results for tests absent from the pin;
- sort output by full test IRI and serialize prefixes and metadata in a stable
  order;
- preserve the actual test time in the neutral ledger, then generate byte-for-
  byte identical EARL from unchanged inputs; and
- parse the generated Turtle back into RDF and revalidate its assertion set.

## 6. Implementation phases

### Phase 0 — activate only after the predecessor completes

**Files:**

- Read the canonical `docs/plans/w3c-test-conformance-reporting.md`.
- Read the accepted release evidence for the target package version.
- Create `docs/conformance/w3c/baseline.json` only after identity is known.

**Steps:**

- [ ] Prove public `owlapi@1.0.1` and `latest` resolve to the accepted artefact.
- [ ] Prove WebVOWL consumes that exact registry version and the predecessor
  implementation plan is recorded complete.
- [ ] Work only in `Hadden-Industries/owlapi`; do not resume package development
  under WebVOWL's historical `src/owlapi-js/` tree.
- [ ] Select the exact released subject. Keep `1.0.1` if its production bytes
  remain the intended subject; otherwise select the exact later public version
  whose behaviour will be reported.
- [ ] Record tag, commit, registry integrity, tarball digest, and relevant
  runtime dependency versions before writing result code.
- [ ] Present the exact future `package.json`, lockfile, and GitHub-workflow
  changes for repository-owner approval before editing those configuration
  files. Documentation and test-source approval does not imply configuration
  approval.
- [ ] Pause for a Git checkpoint containing only the activation/baseline record.

### Phase 1 — pin the current upstream suites and prove inventory completeness

**Files:**

- Create `test/fixtures/w3c/rdf-tests/`.
- Create `test/fixtures/w3c/json-ld-api/`.
- Create `test/fixtures/w3c/SHA256SUMS`.
- Create `scripts/conformance/inventory-w3c-manifests.mjs`.
- Create `test/conformance/w3c/manifestInventory.test.js`.
- Update `docs/conformance/w3c/baseline.json`.

**Steps:**

- [ ] Re-read the current RDF and JSON-LD repository report instructions,
  manifest roots, contribution terms, and fixture licences.
- [ ] Pin one exact commit from each upstream repository; never use a branch
  name, moving URL content, or the 24 August research checkout as an implicit
  pin.
- [ ] Recursively traverse `mf:include` and RDF lists from every selected root.
- [ ] Write a failing inventory test that demonstrates omission of a nested
  manifest, active entry, or recognized test type.
- [ ] Vendor only the selected manifests, actions, expected results, and licence
  material required for offline reproduction.
- [ ] Record every upstream-to-vendored path and SHA-256 digest, then make the
  completeness test pass.
- [ ] Compare the newly discovered inventory with the migration counts in §3
  and explain every addition, removal, renamed IRI, or changed oracle.
- [ ] Run `npm test -- test/conformance/w3c/manifestInventory.test.js`.
- [ ] Pause for the pinned-suite/inventory Git checkpoint.

### Phase 2 — obtain an explicit upstream policy disposition

**Files:**

- Create `docs/conformance/w3c/upstream-consultation.md`.

**Steps:**

- [ ] Draft the RDF Tests Community Group question with the exact subject and
  dependency disclosure:

  > Would the RDF Tests Community Group accept an EARL report for the RDF
  > document-reading components of `owlapi`, where Turtle, TriG, N-Triples, and
  > N-Quads parsing is composed over N3.js and RDF/XML parsing is composed over
  > `rdfxml-streaming-parser`? The report would disclose those dependencies,
  > test the project-owned exact-format/RDF/JS boundary, and expressly not claim
  > independent-implementation status for Recommendation-exit purposes.

- [ ] Draft the equivalent, separate JSON-LD question disclosing composition
  over `jsonld.js` and the to-RDF-only subject boundary.
- [ ] Obtain explicit repository-owner authorization before opening an issue,
  sending public email, or creating any upstream pull request.
- [ ] Submit through the current upstream-recommended public channel and record
  the exact URL, date, text, and answer without paraphrasing away conditions.
- [ ] Classify each disposition as `ELIGIBLE_AS_LAYERED`,
  `LOCAL_REPORT_ONLY`, or `DECISION_PENDING`. Do not infer eligibility from
  silence.
- [ ] Continue building the locally useful reports while a decision is pending;
  external response time is not a local engineering blocker.
- [ ] Pause for a Git checkpoint containing the consultation record but no
  unapproved external submission.

### Phase 3 — implement the neutral result ledger test-first

**Files:**

- Create `docs/conformance/w3c/result.schema.json`.
- Create `test/conformance/w3c/rdfResultLedger.test.js`.
- Create `test/conformance/w3c/jsonLdResultLedger.test.js`.
- Create the three small invalid/minimal fixtures listed in §4.

**Steps:**

- [ ] Write failing tests for every required baseline and per-test field.
- [ ] Write failing tests for duplicate IRIs, unknown test types, impossible
  outcome/execution-state combinations, pass results with reasons, and
  non-passes without reasons.
- [ ] Write a failing test proving `EXCLUDED_WITH_REASON`, `SKIPPED`, and
  `INFRASTRUCTURE_ERROR` cannot enter a published ledger.
- [ ] Implement the smallest schema and validation functions that pass those
  tests.
- [ ] Add concise comments only where EARL mapping, manifest identity, or
  applicability logic would otherwise be non-obvious to a future maintainer.
- [ ] Run `npm test -- test/conformance/w3c/rdfResultLedger.test.js`.
- [ ] Run `npm test -- test/conformance/w3c/jsonLdResultLedger.test.js`.
- [ ] Pause for the result-contract Git checkpoint.

### Phase 4 — materialize and verify the exact npm subject

**Files:**

- Create `scripts/conformance/materialize-owlapi-subject.mjs`.
- Create `test/conformance/w3c/subjectIdentity.test.js`.

**Steps:**

- [ ] Write a failing test for a version, tarball digest, registry-integrity,
  source-commit, or installed-dependency mismatch.
- [ ] Install the exact public package into a disposable isolated consumer with
  lifecycle scripts disabled and an exact lockfile retained as evidence.
- [ ] Verify the downloaded bytes before loading any subject code.
- [ ] Resolve the public package root, then load the private report target by an
  absolute file URL owned by the harness. Do not add a package export or
  production alias.
- [ ] Record the complete relevant dependency stack, including N3.js,
  `rdfxml-streaming-parser`, and `jsonld.js`, as actually installed for the run.
- [ ] Prove all five public package entry points still load normally.
- [ ] Prove `owlapi/rdf` and unexported parser paths still fail as consumer
  package specifiers.
- [ ] Run `npm test -- test/conformance/w3c/subjectIdentity.test.js`.
- [ ] Pause for the exact-subject Git checkpoint.

### Phase 5 — complete and run the RDF result surface

**Files:**

- Create `scripts/conformance/run-w3c-rdf.mjs`.
- Generate `docs/conformance/w3c/results/rdf-1.2.json`.
- Update RDF adapter conformance tests only where the manifest pin introduces
  a test-oracle class not already executable.

**Steps:**

- [ ] Write focused failing tests for the 31 RDF 1.2 RDF/XML evaluation cases
  and 32 Turtle evaluation cases present at the research baseline, plus every
  addition or changed oracle discovered by Phase 1, before extending their
  runners.
- [ ] For positive-syntax tests, pass only when the exact format adapter accepts
  the document under the manifest's base IRI and options.
- [ ] For negative-syntax tests, pass only when the adapter rejects through the
  normalized syntax-error contract.
- [ ] For evaluation tests, compare RDF/JS datasets semantically: preserve named
  graphs and RDF 1.2 terms, and use blank-node-insensitive graph/dataset
  equivalence rather than serialized text equality.
- [ ] Inventory the 41 active N-Triples and 41 active N-Quads canonical-output
  tests present at the research baseline, plus every Phase 1 change. Mark them
  inapplicable only because the exact reported subject is a reader and after
  reconciling that treatment with upstream guidance; do not implement a writer
  solely for this report.
- [ ] Inventory every RDF Semantics assertion and apply the upstream-approved
  treatment for the absent entailment surface.
- [ ] Rerun the complete Phase 1 TriG inventory, whose research baseline is 418
  cases. Convert the former 17 exclusions to actual outcomes; a known N3.js
  wrong result is `FAILED` and remains visibly attributed to the installed
  dependency stack.
- [ ] Reject a completed ledger unless every active test from every recursive
  RDF report root appears exactly once.
- [ ] Run `npm run conformance:w3c:rdf` after the exact script addition has been
  approved.
- [ ] Run the complete ordinary `npm test` suite to prove report plumbing did
  not change package behaviour.
- [ ] If a runtime defect is discovered, preserve the failing test, follow the
  package's ordinary patch-release process, and restart subject identity against
  the corrected public version before generating a passing result.
- [ ] Pause for the RDF-result Git checkpoint.

### Phase 6 — complete and run the separate JSON-LD result surface

**Files:**

- Create `scripts/conformance/run-w3c-jsonld.mjs`.
- Generate `docs/conformance/w3c/results/json-ld.json`.

**Steps:**

- [ ] Reconcile the current JSON-LD report's full manifest inventory, not only
  the two manifests previously vendored for Phase 15.
- [ ] Exercise every applicable to-RDF case with its manifest-specified
  processing mode, expansion context, base IRI, RDF-direction representation,
  generalized-RDF option, and `useJCS` option.
- [ ] Rerun all 462 formerly required cases and all five former exclusions.
- [ ] Treat the two generalized-RDF cases according to the exact reported
  ordinary-RDF/OWL-ingestion boundary and upstream guidance; do not call them
  passing if the subject cannot produce generalized RDF.
- [ ] Report each known `jsonld.js` wrong-result or missing-error case as
  `FAILED` unless the exact installed dependency now satisfies its oracle.
- [ ] Reconcile the 54 from-RDF cases and every other report-manifest surface as
  inapplicable or omitted only according to the recorded upstream policy.
- [ ] Reject a completed ledger if an applicable test is absent, duplicated,
  silently skipped, or represented by a legacy exclusion classification.
- [ ] Run `npm run conformance:w3c:jsonld` after the exact script addition has
  been approved.
- [ ] Run the complete ordinary `npm test` suite.
- [ ] Pause for the JSON-LD-result Git checkpoint.

### Phase 7 — generate deterministic EARL reports

**Files:**

- Create `scripts/conformance/generate-earl.mjs`.
- Create `scripts/conformance/verify-earl.mjs`.
- Create `test/conformance/w3c/earlGenerator.test.js`.
- Generate both files under `docs/conformance/w3c/reports/`.

**Steps:**

- [ ] Write a failing snapshot/semantic test for a minimal ledger before writing
  the generator.
- [ ] Emit one `earl:Assertion` per ledger result with exact `earl:assertedBy`,
  `earl:subject`, `earl:test`, `earl:result`, `earl:outcome`, test date, and
  `earl:automatic` mode.
- [ ] Describe the subject as `earl:Software`, `earl:TestSubject`, and
  `doap:Project`, tied to the exact npm version and source tag.
- [ ] Identify Maksym Shostak through
  `https://github.com/MaksymShostak` and HADDEN INDUSTRIES LTD separately as
  developer/copyright contributor and project steward according to the
  package's accepted metadata; do not imply a copyright assignment.
- [ ] Link `AGPL-3.0-only` to the authoritative GNU licence text at
  `https://www.gnu.org/licenses/agpl-3.0.html` and state that the W3C report
  contribution terms apply only to material contributed to the W3C repository,
  not to relicensing `owlapi` source.
- [ ] Include a prominent machine-readable or literal dependency disclosure and
  the statement that the subject is layered and is not offered as an independent
  implementation for standards-progression counting.
- [ ] State that the results are project-generated test evidence, not W3C
  certification, Java OWLAPI affiliation, or endorsement.
- [ ] Sort assertions by full test IRI and make generation byte-stable from an
  unchanged baseline and ledger.
- [ ] Parse each generated Turtle report back into RDF, validate every required
  metadata term and outcome IRI, and reconcile assertion counts and test IRIs
  exactly with its ledger.
- [ ] Run `npm test -- test/conformance/w3c/earlGenerator.test.js`.
- [ ] Run `npm run conformance:w3c:generate` twice and prove the second run
  produces no diff.
- [ ] Run `npm run conformance:w3c:verify`.
- [ ] Pause for the EARL-generation Git checkpoint.

### Phase 8 — validate with the upstream report toolchains

**Files:**

- Update `docs/conformance/w3c/README.md` with commands and retained evidence.
- Update `docs/conformance/w3c/upstream-consultation.md` with validation status.

**Steps:**

- [ ] Copy only the generated RDF EARL file into a clean checkout of the exact
  pinned `w3c/rdf-tests` revision.
- [ ] Use that repository's declared Ruby version and lockfile/tooling; do not
  add Ruby or `earl-report` to `owlapi` production dependencies.
- [ ] Run the upstream-prescribed report build, currently `bundle install`
  followed by `bundle exec rake reports`, and retain tool versions and logs.
- [ ] Inspect the generated HTML and JSON-LD to prove the subject appears once,
  all outcome counts agree, report links resolve, and no unknown tests vanish.
- [ ] Repeat the equivalent validation in a clean checkout of the exact pinned
  `w3c/json-ld-api` revision using its current report instructions.
- [ ] Add a non-release-gating GitHub Actions workflow dedicated to
  conformance-report reproduction after obtaining exact configuration approval.
  It may gate changes to the harness, ledgers, or reports, but must not become a
  retroactive condition of the already completed `1.0.1` publication plan.
- [ ] Prove the dedicated workflow succeeds from a clean checkout and that
  regenerating reports leaves the tree unchanged.
- [ ] Pause for the upstream-validation Git checkpoint.

### Phase 9 — publish the local evidence and document its limits

**Files:**

- Complete `docs/conformance/w3c/README.md`.
- Update the canonical package `README.md` and release documentation with links
  to the versioned reports.

**Steps:**

- [ ] Publish the neutral ledgers, EARL files, baseline, fixture provenance, and
  reproduction commands in the canonical public package repository.
- [ ] State the exact tested version, date, suite pins, applicable surfaces,
  inapplicable surfaces, failures, and dependency versions next to the report
  links.
- [ ] Use “self-reported W3C test-suite results,” never “W3C certified,” “fully
  conformant,” or another claim broader than the evidence.
- [ ] Explain that a layered implementation can be valuable integration
  evidence without being independent implementation evidence.
- [ ] Update documentation for later extended results without republishing
  unchanged npm bytes. Publish a new package version only when production bytes
  or declared runtime dependencies change.
- [ ] Pause for the local-publication Git checkpoint.

### Phase 10 — seek upstream inclusion without making it the completion gate

**Files:**

- Update `docs/conformance/w3c/upstream-consultation.md`.
- Add the upstream pull-request URLs to `docs/conformance/w3c/README.md` if
  submissions occur.

**Steps:**

- [ ] Obtain separate explicit repository-owner authorization immediately
  before each external issue, email, fork, branch, or pull request.
- [ ] If the RDF disposition is `ELIGIBLE_AS_LAYERED`, submit exactly one
  generated Turtle report at the upstream-prescribed path and no package source,
  vendored fixture, generated rollup, or unrelated change.
- [ ] In the pull-request description, identify the exact subject version,
  scope, dependency layering, failed/inapplicable outcomes, reproduction
  instructions, and non-independent status.
- [ ] Pass upstream CI and address review through generator/ledger changes in the
  canonical repository first; do not hand-edit the submitted EARL copy into an
  irreproducible fork.
- [ ] Submit JSON-LD separately only if its own disposition is
  `ELIGIBLE_AS_LAYERED`; do not combine W3C repositories or result vocabularies.
- [ ] If maintainers select `LOCAL_REPORT_ONLY`, decline listing, or leave the
  policy decision pending, keep the versioned local report public and record the
  exact disposition without presenting it as rejection of the test results.
- [ ] Treat upstream merge as useful external publication, not as W3C
  certification and not as a requirement to republish unchanged package bytes.
- [ ] Pause for a final Git checkpoint recording submitted, merged, declined, or
  pending external state.

## 7. Configuration changes to approve at execution time

No configuration file is changed by creating this plan. Its implementation is
expected to require a later exact proposal for:

| File | Smallest intended change | Behavioural impact |
| --- | --- | --- |
| `package.json` | Add `conformance:w3c:rdf`, `conformance:w3c:jsonld`, `conformance:w3c:generate`, and `conformance:w3c:verify` scripts | Gives maintainers stable names for the repository-only harness; does not add a public export or lifecycle hook |
| `package-lock.json` | Regenerate only if an approved tooling dependency actually changes | Pins the harness dependency graph; must not alter runtime dependencies silently |
| `test/conformance/w3c/subject/package.json` and its `package-lock.json` | Declare exactly one public `owlapi` subject version and retain its isolated resolved dependency graph | Makes the versioned report reproducible without turning private paths into package exports |
| `.github/workflows/w3c-conformance.yml` | Add a dedicated reproducibility workflow scoped to relevant paths plus manual dispatch | Reproduces reports in CI without making upstream W3C acceptance or this follow-on programme a `1.0.1` release gate |

Prefer existing dependencies and small project-owned validators. Any proposed
new package must pass the package's dependency-governance review before the
configuration approval request.

## 8. Failure and release policy

A fresh conformance failure follows one of four paths:

1. **Harness or oracle defect:** fix the test infrastructure, preserve the
   regression test, rerun the same exact package subject, and regenerate.
2. **Upstream test change or ambiguity:** record the exact manifest evidence,
   discuss it upstream, and report `CANNOT_TELL` or `UNTESTED` only when the
   oracle genuinely cannot be resolved; never guess a pass.
3. **Unsupported out-of-scope capability:** report `INAPPLICABLE` only when the
   precise subject definition excludes that capability and upstream accepts
   that interpretation.
4. **Package or dependency defect:** report `FAILED` for the tested version,
   open a normal package issue, fix test-first, publish a later patch if
   appropriate, and create a new version-specific report after release.

Do not silently patch the unpacked subject, monkey-patch a dependency, relax
strict parsing, flatten named graphs, normalize away RDF 1.2 terms, or route
tests through a different parser merely to improve the implementation-report
table.

## 9. Maintenance triggers

Regenerate and reconsider upstream submission when any of the following occurs:

- a relevant `owlapi` parser adapter, RDF/JS normalization rule, graph policy,
  or resource policy changes;
- N3.js, `rdfxml-streaming-parser`, or `jsonld.js` changes in the reported
  subject's runtime closure;
- the W3C manifest pin changes;
- a reported failure is fixed;
- the subject adds a formerly inapplicable public writer, entailment, or JSON-LD
  processor capability; or
- W3C maintainers change report eligibility or format requirements.

Each report remains immutable evidence about its named package version and
dependency stack. Do not overwrite old results so that they appear to have been
produced by newer bytes. A newer report may supersede an old report in current
documentation while preserving the old file or its Git history.

## 10. Definition of done

This follow-on plan is complete when all of the following are true:

- [ ] the predecessor implementation plan was already complete before this
  programme began;
- [ ] one exact public `owlapi` version, tarball, source tag, dependency stack,
  harness commit, and pair of upstream suite revisions are durably identified;
- [ ] every active test reachable from each selected RDF report root is
  inventoried and represented exactly once with a valid outcome;
- [ ] the separate JSON-LD inventory is fully reconciled with the precise
  to-RDF subject boundary and current upstream partial-implementation policy;
- [ ] no published result contains `EXCLUDED_WITH_REASON`, `SKIPPED`, or
  `INFRASTRUCTURE_ERROR`;
- [ ] both neutral ledgers validate and both EARL reports regenerate
  deterministically;
- [ ] each EARL report passes the applicable upstream report toolchain in a
  clean pinned checkout;
- [ ] local public documentation discloses scope, failures, inapplicable areas,
  suite pins, dependency layering, self-report status, and the absence of W3C
  certification or independent-implementation claims;
- [ ] `owlapi/rdf` and every unapproved deep import remain unexported;
- [ ] upstream eligibility questions and their exact dispositions are recorded;
- [ ] an authorized upstream report is submitted when maintainers accept the
  layered subject, or the local-only/pending disposition is documented when
  they do not; and
- [ ] final package-repository evidence is committed and the repository owner is
  offered the normal push checkpoint.

Upstream merge or inclusion may occur after this local definition of done. Its
timing and outcome do not reopen `docs/owlapi-js/implementation-plan.md`, do not
invalidate the published package, and do not hold up WebVOWL's use of it.
