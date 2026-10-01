# DL Syntax and KRSS1 source-preservation implementation plan

**Status:** Proposed implementation plan, dated 2026-10-01.
Only this plan is being authored; implementation, commits, publication and independent review have not started under it.
The owner has selected explicit rejection of KRSS1 `:right-identity` instead of an inferred property-chain extension.

**Goal:** Repair the two known source-loss paths and qualify DL Syntax and the supported KRSS1 grammar through the public `owlapi` package, with exact structural expectations and explicit unsupported-input failures.

**Architecture:** Keep the existing manager, parser descriptors, DL parser, KRSS dialect policy, structural factory and profile checker.
Preserve DL numeric token strings when constructing literals; reject the unsupported KRSS1 clause inside its existing parser path.
Exercise these changes through ordinary loading, managed import closures, supported storage and installed-package consumers.

**Technology:** Native JavaScript ESM, the existing Jest runner and Playwright consumers, existing formatting/linting tools, and the pinned Java OWLAPI comparison harness.
No dependency, public export, runtime configuration, test-runner or build-system change is expected.

**Repository boundary:** Every source, test, fixture, compatibility record and qualification document in this plan belongs to `owlapi`.
No task edits another repository or implements consumer admission policy.
Consumers receive the resulting structural OWL and ordinary public errors through the existing package API.

## 1. Baseline, authority and purpose

The inspected baseline is `main` at `3d1933c44f939525dd9a73afd6e7731627333ca6` (`Merge Canonical VOWL owlapi prerequisites`).
The working tree was clean and remote `main` identified the same commit when this plan was prepared.
Recheck these facts before implementation; do not restore or overwrite later user changes.
Before production edits, capture the existing DL, KRSS1 and KRSS2 benchmark baselines on the intended qualification host, preserving their outputs separately from candidate results.
This preparation belongs to SLICE-001 and does not create an extra implementation slice or commit.

The purpose is trustworthy parsing: a successful load must not silently change a literal's structural identity or discard a recognized semantic clause.
The downstream benefit follows from repairing the owning library, without consumer reconstruction of lost information.
This is an R2 semantic-compatibility repair using the existing upstream quality and release controls.
This document is the draft change dossier and slice plan; it does not baseline itself or resume another execution.

Read these authorities before implementation:

- [Repository implementation plan](../implementation-plan.md), especially the DL and original-KRSS scope and compatibility decisions.
- [Engineering conventions](../engineering-conventions.md) and [contributor commands](../../CONTRIBUTING.md#source-text-syntax-and-formatting).
- [Parser surface](../compatibility/parser-surface.md), [KRSS1 behavioral oracle](../compatibility/krss1-behavioral-oracle.json), and [original-KRSS ADR](../adr/0008-promote-original-krss1-into-v1.md).
- [Public source-preservation and profile contracts](../compatibility/canonical-vowl-prerequisites.md).
- [OWL 2 Structural Specification, section 5.7](https://www.w3.org/TR/2012/REC-owl2-syntax-20121211/#Literals): a literal has a lexical string and a datatype; equal datatype values do not make different lexical strings structurally identical.
- The pinned [Java KRSS1 grammar](https://raw.githubusercontent.com/owlcs/owlapi/d7e997a53b470e32700de89cc610d9daf01ea769/parsers/src/main/java/org/semanticweb/owlapi/krss1/parser/KRSSParser.jj), as bounded behavioral evidence, not authority to preserve silent information loss.

The existing no-effect KRSS1 decision conflicts with the agreed correction.
SLICE-002 must record an explicit superseding decision in the live upstream documentation and behavioral ledger.
Historical Java observations and migration lessons remain historical evidence.

### Observed defects

Fresh public-manager probes at the baseline produced these results in each of `strict`, `compatible` and `preserve` mode.
These observations characterize defects; they are not completed qualification evidence.

| Parser | Input                                           | Current result                                          | Required result                                               |
| ------ | ----------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| DL     | `age(alice, 0001)`                              | `"1"^^xsd:integer`                                      | `"0001"^^xsd:integer`                                         |
| DL     | `age(alice, 1.00)`                              | `"1.0"^^xsd:double`                                     | `"1.00"^^xsd:double`                                          |
| DL     | `age(alice, 9007199254740993)`                  | `OWL_SYNTAX_ERROR` for exceeding the safe integer range | Exact integer lexical string, within existing resource limits |
| KRSS1  | `(define-primitive-role p q :right-identity r)` | Only `p` as a subproperty of `q`, without a diagnostic  | Fatal `UNSUPPORTED_CONSTRUCT`                                 |
| KRSS1  | `(define-primitive-role p q)`                   | `p` as a subproperty of `q`                             | Same exact axiom and signature                                |

DL's `#parseLiteral()` converts token text through JavaScript numbers and then constructs replacement lexical strings.
The lexer already retains the necessary original text.
KRSS1's `#parseKRSS1PrimitiveRole()` deliberately consumes the identity role without emitting a structural representation.
Its current test and compatibility record explicitly require that old behavior, so changing only production code would leave a contradictory contract.

## 2. Scope and decisions

### Included

- Exact lexical preservation for the integer and double tokens already accepted by DL's finite grammar, in all three parsing modes.
- Explicit KRSS1 rejection of a syntactically well-formed `:right-identity` clause in all three modes.
- Retention of the supported DL/KRSS1 grammar, distinct KRSS1/KRSS2 behavior, document-relative IRIs, annotations where expressible, constructor structure and existing cardinality behavior.
- Public loading, full import-closure assessment, error atomicity, resource controls, supported storage and installed Node/browser qualification for the repaired surfaces.
- Narrow compatibility, provenance and release-note updates that describe the behavior actually proved.

### Excluded

- New DL numeric syntax, quoted literals, exponent syntax or signs that the current lexer does not already accept.
- KRSS1 property-chain extensions, a KRSS1/KRSS2 union grammar, new parsers or new storers.
- Reasoner completeness, arbitrary OWL dialect support or exhaustive historical KRSS corpus claims.
- New public format registries, qualification flags, consumer format lists, adapters or reconstruction shims.
- Dependency upgrades, package renaming, version changes, workflow changes, test-budget changes and npm publication.

Format identity, parser availability, supported grammar, storer availability and evidence of qualification remain separate facts.
An `OWLDocumentFormats` entry is not proof that every document in that syntax can be parsed or stored.
Successful parsing also does not automatically prove OWL 2 DL validity; the existing checker supplies that separate assessment.

| Decision | Selected behavior and rationale                                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-001  | Preserve DL literal token text with its existing datatype in every parsing mode; source normalization through `Number` changes structural identity.                     |
| DEC-002  | Reject well-formed KRSS1 `:right-identity` explicitly; the owner selected this on 2026-10-01, and no original-KRSS mapping is established here.                         |
| DEC-003  | Use existing `UnsupportedConstructError` and `UNSUPPORTED_CONSTRUCT`; preserve syntax errors for malformed clauses and existing resource/cancellation failures.         |
| DEC-004  | Keep Java OWLAPI 5.5.1 at `d7e997a53b470e32700de89cc610d9daf01ea769` as a behavioral comparator; document these controlled corrections rather than copying its defects. |
| DEC-005  | Reuse existing parser, profile, storage and packaged-consumer tests; add compact cases and only fixtures that need a stable independent source artifact.                |
| DEC-006  | One implementation owner consolidates changes before one bounded Claude Code review; this plan authorizes neither delegation nor additional review iterations.          |

For DEC-003, propose fixed diagnostic details `format: "krss1"`, `construct: ":right-identity"`, and `reason: "UNSUPPORTED_KRSS1_RIGHT_IDENTITY"`.
Capture the attribute location using the existing source-location convention when enabled.
Validate the local clause's required role and closing delimiter before issuing the unsupported-construct error.
This preserves the distinction between a malformed clause and a well-formed clause with no supported structural mapping.
An earlier exhausted resource budget or abort retains its existing failure behavior.
Do not promise whole-document syntax validation after an already fatal unsupported construct.

### Configuration and approval boundary

No change to `package.json`, lockfiles, test/lint/format configuration, browser import-map configuration, resource defaults or CI workflows is planned.
If implementation exposes a need for one, identify the exact file, setting and pipeline effect and obtain the owner's exact approval before editing it.
Existing scripts may produce ordinary qualification artifacts in a fresh repository-local output directory; they must not rewrite reviewed configuration to make a check pass.
Compatibility decisions are explicit deliverables below, not permission for unrelated policy edits.
This planning request is not authorization to implement, commit, push, release or dispatch reviewers.

## 3. Requirements and acceptance evidence

IDs below are local to this upstream plan.

| Requirement                                        | Acceptance criterion                                                                                                                                                        | Proof and quality scenario                                                                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001: retain DL literals                        | AC-001: accepted token text and datatype survive parsing exactly in all modes, including distinct strings with equal values                                                 | QA-001: direct assertions, data nominals, leading zeros, fractional precision and large integers compare to independently constructed structural objects |
| REQ-002: make unsupported KRSS1 content observable | AC-002: well-formed identity clauses fail with the agreed typed error; malformed clauses remain syntax errors                                                               | QA-002: mode, case, delimiter and missing-role cases; supported parent-only control                                                                      |
| REQ-003: preserve unaffected dialect contracts     | AC-003: supported DL/KRSS1 productions and KRSS2 chains retain exact structure, role ordering and signature                                                                 | QA-003: existing conformance/differential suites and a finite production-to-test coverage table                                                          |
| REQ-004: preserve load boundaries                  | AC-004: exact format selection, import-parent context and transaction rollback remain correct; fatal parse errors never become parser mismatch or a successful partial load | QA-004: mixed-format imported documents, registry fallback spy and manager reuse after failure                                                           |
| REQ-005: retain bounded execution                  | AC-005: parser and checker ceilings, cancellation, deadlines and error-location policy remain effective without raising limits                                              | QA-005: boundary/over-boundary inputs, long numeric tokens, nested input and abort/timeout regression suites                                             |
| REQ-006: qualify the public artifact               | AC-006: source-tree, packed Node and configured browser/worker consumers agree on exact results; available storers retain literal structure on reload                       | QA-006: public package imports, source assessments, Functional Syntax/RDF/XML round trips and package-boundary checks                                    |
| REQ-007: retain independent expectations           | AC-007: expected values are not generated by either parser under repair; historical oracle bytes are preserved and deviations are explicit                                  | QA-007: factory/manual expectations, source citations, pinned Java evidence and compact case inventory                                                   |
| REQ-008: make the claim reproducible               | AC-008: a qualification record identifies revision, artifact digest, modes, supported grammar, commands, results, deviations and unexecuted gates                           | QA-008: consolidated evidence review, final gate results and exact-scope commit checkpoints                                                              |

## 4. Architecture, file responsibilities and oracle ownership

The existing path is `StringDocumentSource` to manager/registry selection, then the selected parser and transaction-owned factory, followed by package-owned source evidence and profile assessment.
Repair the source-loss point before the structural object is published.
Do not infer the lost lexical text or clause from normalized objects later.

The following paths predict the implementation surface; a listed test need only change when it owns new coverage.
Expand production scope only when a failing acceptance case demonstrates the need.

| Responsibility                             | Likely files                                                                                                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DL literal construction                    | `internal/parsing/dl/parser.js`                                                                                                                                                                                                                        |
| DL token and grammar evidence              | `internal/parsing/dl/lexer.test.js`, `dlSyntax.test.js`, `dlSyntax.conformance.test.js`, `dlSyntax.differential.test.js`, `dlSyntax.integration.test.js`, `dlSyntax.resource.test.js` in that directory                                                |
| KRSS1 unsupported-clause boundary          | `internal/parsing/krss/parserCore.js` with the existing `internal/parsing/krss1/parser.js` dialect policy                                                                                                                                              |
| KRSS1 evidence                             | `internal/parsing/krss1/krss1Syntax.test.js`, `krss1Syntax.conformance.test.js`, `krss1Syntax.differential.test.js`, `krss1Syntax.integration.test.js`, `krss1Syntax.resource.test.js`, `krss1Syntax.detection.test.js`                                |
| Shared/dialect regressions                 | `internal/parsing/krss/`, `internal/parsing/krss2/`, `internal/parsing/parserRegistry.test.js`                                                                                                                                                         |
| Closure and profile evidence               | `profiles/owl2DLProfile.test.js`, `profiles/sourceGraphSelection.test.js`, `model/owlOntologyManager.test.js`, `test/import-closure/public-contract.test.js` and its existing helper                                                                   |
| Public package evidence                    | `test/installed-package-smoke.mjs`, `test/consumers/browser/_shared/exercise-package.js`, `test/consumers/browser/browser-consumers.playwright.js`, existing package-boundary tests                                                                    |
| Supported KRSS1 comparison input           | New `util/owlapi-reference/fixtures/krss1/source-preservation-supported.krss`; a separate Java snapshot only if actually generated by the pinned harness                                                                                               |
| Live compatibility and normative amendment | `docs/compatibility/parser-surface.md`, `docs/compatibility/krss1-behavioral-oracle.json`, `docs/implementation-plan.md`, `CHANGELOG.md`                                                                                                               |
| Affected provenance/evidence               | `docs/provenance/provenance.json`, generated `docs/provenance/third-party-material.json`, `docs/compatibility/expected-differences.json` only where a new exact differential requires an entry, `governance.test.js` where live assertions must change |
| Qualification handoff                      | New `docs/compatibility/dl-krss1-source-preservation.md`                                                                                                                                                                                               |

Use literal strings, explicit IRIs and factory-built expected axioms as the primary regression oracle.
For declarations that a compared syntax cannot express, retain only the already documented differential normalization; compare declarations/signature separately.
Never normalize numeric literal spellings, remove unexpected source constructs or treat matching axiom counts as sufficient equality.
Check complete supported axiom keys, typed signature, imports, ontology identity and annotations where the input syntax can express them.

The implementation owner writes the cases and cites their source; the independent reviewer checks their expectations against the stated contracts rather than approving snapshots merely because tests pass.
Use Java for the common supported domain and explicitly named behavioral differences.
Do not regenerate a golden from the JavaScript parser being tested.
Existing vendored RDF/OWL conformance material supplies applicable structural/datatype expectations, but it does not exercise DL or KRSS concrete grammar.
Keep those additional cases in the existing syntax-specific suites.
The original-KRSS corpus register currently has no qualifying strict historical corpus; synthetic cases and adjacent dialect examples must not be relabeled as one.

Mock only real external boundaries, such as the document loader or network transport, with in-memory sources.
Do not mock the parser, structural factory, manager transaction, source-evidence ownership or profile checker in acceptance tests.

## 5. SLICE-001: exact DL literals

**Traceability:** REQ-001/003/005/007; AC-001/003/005/007; QA-001/003/005/007; DEC-001/004/005.

**Consumes:** Existing `OWLDLSyntaxOWLParser.parse(source, transaction, configuration)`, lexer token `{type, value}`, `transaction.getOWLDataFactory()` and `getOWLLiteral(lexicalForm, datatype)`.
**Produces:** The same public ontology API with source-exact integer/double literals; no new export or option.

- [ ] Add table-driven failing cases to the existing DL suites before changing `#parseLiteral()`.
- [ ] Replace numeric coercion in literal construction with the original token value and the current integer/double datatype assignment.
- [ ] Keep cardinality parsing on `normalizeCardinality`; literal preservation does not change cardinality's canonical integer representation.
- [ ] Verify every DL path that consumes a literal, including assertions and data nominals, and confirm exact duplicate versus equal-value/different-string behavior.
- [ ] Run focused DL tests plus existing factory/datatype regressions affected by large literals; update the live parser-surface note and changelog.
- [ ] Format/lint the changed files, record results, and commit this completed repair when commit authorization is in force.

### Regression matrix

Run the positive lexical cases in `strict`, `compatible` and `preserve` mode.

| Case                              | Expected lexical form and datatype                                 | Purpose                                         |
| --------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| `age(alice, 0001)`                | `0001`, `xsd:integer`                                              | Leading zeros survive                           |
| `age(alice, 0)`                   | `0`, `xsd:integer`                                                 | Ordinary zero control                           |
| `age(alice, 9007199254740993)`    | `9007199254740993`, `xsd:integer`                                  | No safe-integer admission ceiling               |
| `age(alice, 1.00)`                | `1.00`, `xsd:double`                                               | Trailing zeros survive                          |
| `age(alice, 0.10000000000000001)` | `0.10000000000000001`, `xsd:double`                                | No floating-point rounding                      |
| `age(alice, 1.)`                  | `1.`, `xsd:double`                                                 | Existing decimal-token grammar remains accepted |
| `exists age.{1 01 1.0} ⊑ Adult`   | Three structurally distinct literals with their original datatypes | No value-based collapse                         |
| `exists age.{1 1} ⊑ Adult`        | Existing exact-duplicate set behavior                              | No unrelated change to structural sets          |

Characterize negative-number, exponent, quoted-string and malformed-decimal boundaries with the existing lexer before writing expectations; preserve their current grammar classification.
Include a large digit string and a long fractional string within configured token limits, plus a limit-exceeding token.
Parsing must retain the text rather than using JavaScript numeric representability as validity.
The separate profile check remains responsible for datatype validity and its own numeric-work ceiling.

This representative assertion uses the existing helpers in `dlSyntax.test.js` and an expectation independent of the parser:

```js
it.each(["strict", "compatible", "preserve"])(
  "retains integer lexical form in %s mode",
  async (parsingMode) => {
    const manager = createManager();
    const ontology = await load(manager, "age(alice, 0001)", { parsingMode });
    const factory = manager.getOWLDataFactory();
    const iri = (name) => IRI.create(`${documentIRI}#${name}`);
    expectAxioms(ontology, [
      factory.getOWLDataPropertyAssertionAxiom(
        factory.getOWLDataProperty(iri("age")),
        factory.getOWLNamedIndividual(iri("alice")),
        factory.getOWLLiteral(
          "0001",
          IRI.create("http://www.w3.org/2001/XMLSchema#integer"),
        ),
      ),
    ]);
  },
);
```

Run `npm test -- --runInBand internal/parsing/dl` through the repository wrapper.
The added regression must fail on the baseline for the documented reason and pass after the repair.
Existing detection, syntax, differential, resource and integration cases must still pass.
The checkpoint is complete only when no numeric round trip remains on a DL literal-construction path.
Proposed commit subject: `fix(dl): Preserve numeric literal lexical forms`.

## 6. SLICE-002: reject the unsupported KRSS1 clause

**Traceability:** REQ-002/003/004/005/007; AC-002/003/004/005/007; QA-002/003/004/005/007; DEC-002/003/004/005.

**Consumes:** Existing KRSS1 dialect selection in `KRSSParserCore`, token locations, `UnsupportedConstructError` from `io/errors.js` and transaction rollback.
**Produces:** Fatal rejection for well-formed KRSS1 identity clauses with stable details; all supported KRSS1 and KRSS2 behavior remains on its existing path.

- [ ] Replace the test requiring no-effect acceptance with the agreed rejection matrix and a parent-only success control.
- [ ] Validate the clause's local syntax, then throw the existing unsupported error before any successful transaction publication.
- [ ] Keep KRSS2's right/left identity mappings unchanged, including ordered chain operands.
- [ ] Preserve `phase17-structural.krss` and `phase17-structural.java.json` byte-for-byte as historical artifacts; test the former as a now-explicit unsupported input.
- [ ] Add `source-preservation-supported.krss` as a separately named, project-authored supported companion with an explicit record of its difference from the historical input.
- [ ] Move successful full grammar/ABox assertions to that companion and compare exact expected structure; do not strip the clause dynamically in a helper or present old Java output as a new run.
- [ ] Supersede the live no-effect compatibility decision, add the normative amendment and changelog explanation, and regenerate only affected provenance pins after formatting the authoritative documents.
- [ ] Run shared KRSS/KRSS1/KRSS2 and registry regressions, format/lint the changed files, and commit the completed slice when authorized.

| Input or condition                                                                     | Required outcome                                                                |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `(define-primitive-role p q)`                                                          | Exactly the expected subproperty axiom and complete signature                   |
| `(define-primitive-role p q :right-identity r)`                                        | `UNSUPPORTED_CONSTRUCT` with DEC-003 details                                    |
| Mixed-case spelling of the recognized attribute                                        | Same unsupported result under existing case handling                            |
| Missing parent, missing identity role, malformed closing delimiter or duplicate clause | Existing syntax error classification for the malformed local production         |
| Unsupported clause after an otherwise valid axiom                                      | No partially published ontology or residual manager/import state                |
| Explicit KRSS1 choice with a KRSS2-capable registry                                    | Fatal KRSS1 failure; no fallback to KRSS2                                       |
| KRSS2 `:right-identity` and `:left-identity`                                           | Existing respective ordered chain mappings; exact factory-built expected axioms |

Use this assertion shape in `krss1Syntax.test.js`, whose existing `load` helper supplies the KRSS1 registry:

```js
it.each(["strict", "compatible", "preserve"])(
  "rejects right-identity explicitly in %s mode",
  async (parsingMode) => {
    await expect(
      load("(define-primitive-role p q :right-identity r)", { parsingMode }),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_CONSTRUCT",
      format: "krss1",
      construct: ":right-identity",
      reason: "UNSUPPORTED_KRSS1_RIGHT_IDENTITY",
    });
  },
);
```

The behavioral ledger must retain `javaObservation: "ACCEPTED_NO_STRUCTURAL_EFFECT"` and identify the new JavaScript rejection as an intentional compatibility correction.
Use the existing ledger schema; do not add a second contradictory active rule or relax governance checks to accept either result.
Historical lessons and the original Java snapshot retain their original claims and dates.
If a new Java comparison is useful, generate a separately named snapshot from the supported companion with the pinned harness and record its source digest.
No Java run is needed to establish the already observed no-effect behavior again.

Run `npm test -- --runInBand internal/parsing/krss internal/parsing/krss1 internal/parsing/krss2 internal/parsing/parserRegistry.test.js governance.test.js`.
Check affected generated evidence with `node util/generate-third-party-material.mjs`; use its existing `--write` mode only for the intentional affected artifact refresh.
The checkpoint requires rejection, rollback, supported positive coverage and consistent live documentation together.
Proposed commit subject: `fix(krss1): Reject unsupported right-identity clauses`.

## 7. SLICE-003: qualify the public loading and package paths

**Traceability:** REQ-003/004/005/006/007; AC-003/004/005/006/007; QA-003/004/005/006/007; DEC-003/005.

**Consumes:** Both repaired parsers and existing public `OWLManager`, `StringDocumentSource`, loader configuration, `OWL2DLProfile`, managed closure and storage APIs.
**Produces:** Executable public-contract evidence for source-tree and installed artifacts, without new public APIs or consumer-specific code.

- [ ] Add a compact mixed-format closure whose Functional Syntax root imports separately selected DL and KRSS1 documents through the in-memory document loader.
- [ ] Assert actual per-document formats, literal text, full signature, import identity and the frozen import-parent context; a root format must not overwrite imported formats.
- [ ] Assess the entire closure with `checkOntology(ontology, { sourceAssessment: true })` in preserve mode before any caller filtering, recording formal and source statuses separately.
- [ ] Include a valid declared control, a closure-wide property-category conflict, a forged source-metadata control and mutation-stale evidence; reuse existing profile helpers and assertions.
- [ ] Replace the imported KRSS1 control with the unsupported clause and prove that the fatal failure survives import handling and rolls back the load, including under policies that tolerate missing imports.
- [ ] Verify the supported storers with DL lexical cases using `StringDocumentTarget.toString()` and reloading through Functional Syntax and RDF/XML; compare exact literals and supported ontology structure.
- [ ] Add minimal public-import cases to installed-package smoke and the shared browser exercise, asserting their results in the existing Playwright suite across its configured window/worker surfaces.
- [ ] Run the combined regression and candidate commands below, record only actual executed environments, and commit this qualification coverage when authorized.

The profile scenarios distinguish syntax acceptance, formal structural validity and trustworthy source assessment.
A source assessment that is unverified because a configured checker budget is exhausted must remain unverified, never pass by omission.
Large literals within the parser token budget but outside the checker's numeric-digit budget exercise that distinction.
No change to the checker's current defaults or metadata trust model is planned.
If a supported parser path lacks required package-owned evidence, capture a minimal failing public case before proposing any narrowly scoped upstream repair.

### Boundary and resource checks

Retain the limits in `docs/performance/resource-budgets.json` and the checker limits documented in the public prerequisite contract.
Use parameterized small ceilings for deterministic boundary tests; do not multiply megabyte fixtures across modes and environments.

- DL integer and decimal tokens at and beyond `maxTokenLength`, plus input-byte and token-count boundaries.
- Existing expression-depth, axiom-count, timeout and cooperative-cancellation coverage for both parsers.
- The attribute's line/column/offset when `sourceLocations` is enabled and the existing no-location behavior when disabled.
- Supported statements before a failure, followed by successful reuse of the manager and the same document identity.
- Exact-format selection and fatal claimed-syntax failure, distinct from genuine parser mismatch and unresolved-import behavior.
- No network fetches in the acceptance fixtures; injected loading supplies every intentional imported document.

The existing benchmarks remain the performance harness.
Capture comparable baseline and candidate results on the same supported runtime and host, using the existing quiescence checks and accepted thresholds.
Run `node util/benchmark-owlapi-dl.mjs`, `node util/benchmark-owlapi-krss1.mjs` and `node util/benchmark-owlapi-krss2.mjs` sequentially for both the recorded baseline and candidate.
Do not treat different-machine historical timings or absence of an executable baseline as proof of no regression.
Retain a limitation explicitly if a measurement cannot be obtained.

### Focused and packaged verification commands

Run all commands from the `owlapi` root using its installed supported toolchain.
The inspected package requires Node `>=22.23.3 <23 || >=24.21.0 <25` and npm `12.1.0`; do not update these constraints as part of parser repair.

```powershell
npm test -- --runInBand internal/parsing/dl internal/parsing/krss internal/parsing/krss1 internal/parsing/krss2 internal/parsing/parserRegistry.test.js profiles model/owlOntologyManager.test.js test/import-closure/public-contract.test.js
npm run test:boundary
```

Use a fresh task-specific output root for each candidate attempt, for example `.release/dl-krss1-source-preservation-01`.
Increment the attempt suffix if it already contains evidence; do not delete or overwrite a previous attempt.
After implementation tests and package-included documentation are settled, run:

```powershell
npm run release:pack -- --output .release/dl-krss1-source-preservation-01/candidate
npm run candidate:portable -- --candidate .release/dl-krss1-source-preservation-01/candidate --output .release/dl-krss1-source-preservation-01/portable.json
npm run browser:prepare -- --candidate .release/dl-krss1-source-preservation-01/candidate --output .release/dl-krss1-source-preservation-01/browser
npm run test:browser -- --fixture-root .release/dl-krss1-source-preservation-01/browser
```

The current browser projects are Chromium, Firefox and WebKit, with retries disabled.
Use the existing package fixture and transport setup; do not use `--write-reviewed-map` or edit browser configuration to accommodate a failure.
Run portable Node qualification on each supported major runtime through the existing qualification environment before claiming both.
If only one runtime is available locally, report that exact coverage and use existing authorized CI for the missing runtime.
Source-tree Jest success alone does not qualify the tarball.

Store the candidate manifest, tarball digest and concise results in the existing evidence location; retain full logs as artifacts rather than committing many repeated output files.
Proposed commit subject: `test(parsers): Qualify DL and KRSS1 preservation through public APIs`.

## 8. SLICE-004: consolidate evidence and complete bounded review

**Traceability:** REQ-007/008; AC-007/008; QA-007/008; DEC-004/005/006.

**Consumes:** Completed repairs, compact regression inventory, candidate results and affected compatibility/provenance records.
**Produces:** One upstream qualification record and a reviewable final implementation range with explicit remaining limitations.

- [ ] Write `docs/compatibility/dl-krss1-source-preservation.md` with exact qualified commit/tree identity, candidate digest, parser/mode matrix, supported grammar, unsupported clause, oracle provenance and executed checks.
- [ ] Add a finite mapping from DL/KRSS1 parser productions to existing or added test names, including every literal-consuming and recognized-but-unsupported path.
- [ ] Reconcile current compatibility claims and exact expected differences; do not relabel historical phase completion or source-assessment readiness as a new whole-package release qualification.
- [ ] Format/lint all changed documents and code before computing hashes or handing the consolidated range to review.
- [ ] Run the final repository gates below, refresh only evidence invalidated by actual changed inputs, and identify reused results explicitly.
- [ ] Subject to reviewer authorization, submit one consolidated, read-only Claude Code review of the implementation range, agreed decisions and evidence.
- [ ] Resolve accepted findings with focused changes and impacted verification; obtain a separate decision before any additional independent review pass.
- [ ] Commit the completed qualification record when authorized and leave a resumable checkpoint identifying any undelivered remote work.

### Review scope and bounds

Use one availability/authentication check for Claude Code, then one review invocation capped at ten minutes, with no automatic retry or fallback to another provider.
If Claude cannot run, or the review cannot cover the specified scope within that bound, pause and ask the owner to choose the next step.
The review must cover exact DL literals, KRSS1 failure semantics, shared KRSS2 regressions, transaction/resource boundaries, public artifact proof and the correctness of oracle expectations.
It is one consolidated review, not separate broad agents for each lens.
Record findings and unreviewed gaps once; a later authorized pass must target those exact gaps or changes.
Do not run a UI accessibility review for this parser-only change.

For deterministic test failures, diagnose before rerunning; stop after two unsuccessful correction-and-verification rounds for the same unresolved cause and present the evidence and decision needed.
A clearly identified transient tooling failure permits at most one repeat of that command, retaining the original result.
Never retry a commit, push or publication whose outcome is unknown before inspecting its state.
These bounds are per failure and do not require repeating already valid tests after unrelated documentation changes.

### Final gates

```powershell
npm run format:check
npm run lint
npm test -- --runInBand
npm run test:boundary
npm run verify:release-gates
npm run verify:workflow-governance
node util/generate-third-party-material.mjs
```

These commands supplement the artifact and runtime matrix; their success does not itself mean an npm release has been qualified or published.
Reuse an earlier result only when its relevant inputs, environment and artifact identities are demonstrably unchanged and the repository gate permits reuse.
Any code, dependency or package-content change after candidate construction invalidates the affected packaged evidence and requires a new candidate attempt.
After a documentation-only final commit, explicitly compare the relevant tree/artifact inputs rather than assuming an earlier receipt covers the new revision.
Do not repeatedly rebuild identical candidates solely to change a report timestamp.

Proposed commit subject: `docs(parsers): Record DL and KRSS1 source-preservation qualification`.
Use the required commit workflow and verify each authorized signed commit at its logical checkpoint.
Push or remote integration requires the corresponding authorization; verify the delivered remote revision and required checks if delivery is requested.
Package versioning and registry publication remain a separate release decision.

## 9. Evidence size, traceability and completion

Reuse the existing test files and table-driven data rather than creating a file for every input, mode, runtime or expected field.
The expected new durable files are this plan, the supported KRSS1 companion and one qualification document, with a separately named Java snapshot only if needed and actually produced.
Record case counts and provenance in the qualification document; use a separate compact machine-readable manifest only if an existing verifier needs it.
Do not introduce a new evidence framework, global frozen manifest or duplicated corpus.

| Slice     | Requirement / acceptance / quality / decision links | Decisive proof                                                                                       | Checkpoint implication                                                    |
| --------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| SLICE-001 | 001, 003, 005, 007; DEC-001/004/005                 | Original DL token strings and exact structural expectations across modes                             | Commit a complete DL repair with tests and behavior note                  |
| SLICE-002 | 002, 003, 004, 005, 007; DEC-002/003/004/005        | Unsupported KRSS1 error, local syntax distinction, rollback and unchanged supported/KRSS2 structures | Commit the correction and its superseding compatibility evidence together |
| SLICE-003 | 003, 004, 005, 006, 007; DEC-003/005                | Public closure/profile/storage checks and the same packed artifact in supported consumers            | Commit executable upstream qualification coverage                         |
| SLICE-004 | 007, 008; DEC-004/005/006                           | Consolidated review and reproducible final evidence                                                  | Commit the bounded claim; retain explicit delivery/release status         |

In this table each numeric link refers to the matching REQ, AC and QA identifiers above.
The implementation owner integrates all slices and maintains the evidence record.
SLICE-001 and SLICE-002 are semantically independent but share live documentation; implement them sequentially to avoid competing edits.
SLICE-003 requires both, and SLICE-004 reviews the consolidated result.
No extra agent delegation is assumed.

Completion means all acceptance criteria have evidence, no accepted correctness finding remains unresolved, required review is complete, and limitations are stated precisely.
There must be no unchecked silent-discard path discovered during the finite production audit.
The claim is source-preserving support for the documented DL and KRSS1 grammar under the recorded modes and limits, with explicit rejection of the unsupported clause.
It is not a claim that every historical dialect, every datatype value, every input size or every ontology is valid or supported.

## 10. Compatibility, interruption and recovery

DL results may now retain lexically distinct literals that previously collapsed, and large integer literals previously rejected may load successfully.
Consumers that relied on normalized literal strings or prior axiom counts will observe this intentional structural correction.
KRSS1 inputs containing `:right-identity` will now fail instead of appearing to succeed after losing information.
Document both changes in the changelog and supported grammar record before qualification.

There is no stored-data schema migration or backfill in this plan.
Previously parsed output cannot reveal discarded token spelling or a discarded clause; reloading the original source is the only reliable reconstruction route.
Do not synthesize lost content from existing normalized objects.

At interruption, preserve current files and record completed slice commits, remaining edits, commands/results, candidate digests, review status and the next unexecuted step in the upstream qualification record or ordinary upstream checkpoint.
Do not discard work or overwrite evidence to obtain a clean status.
No cleanup of unrelated branches, worktrees, fixtures or historical reports is authorized.

If a regression appears before delivery, keep the last completed checkpoint and prepare a targeted forward fix.
If delivered changes must be withdrawn, the owner decides on an explicit revert commit or a corrected release; do not reset shared history.
Pinning an earlier package can contain a new regression but reintroduces its known source-loss behavior, so it is not a semantic repair.
The implementation owner observes parser error/result changes and qualification results; the repository owner decides release/rollback scope.

## 11. Unknowns and replanning triggers

| Question or trigger                                                                                         | Cheapest discriminating evidence                                                                | Required action                                                                                              |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Another DL numeric coercion or KRSS silent discard exists                                                   | Trace each existing production and literal call site to its current test and structural output  | Add a concrete failing case; replan if the repair extends beyond these parser contracts                      |
| A long but grammatical literal encounters a checker limit                                                   | One bounded public load and profile assessment around the existing limit                        | Preserve the distinction between parse success and unverified assessment; do not raise limits                |
| Unsupported imported KRSS1 becomes a missing-import warning                                                 | One root/import public API regression with the relevant loading policy                          | Repair the narrow upstream error propagation with manager regression evidence; do not accept partial success |
| A package-owned source assessment cannot certify an otherwise supported case                                | One minimal closure with explicit declarations and a direct comparison of formal/source reports | Diagnose the upstream ownership boundary before widening production changes                                  |
| A new Java snapshot would only repeat an already recorded defect                                            | Compare the intended expectation with the pinned existing observation                           | Reuse the observation and add a named controlled deviation rather than rerunning the oracle                  |
| Benchmark, browser, supported runtime or Claude execution is unavailable                                    | One bounded environment check and retained error                                                | Record the missing qualification and defer the next action to the owner                                      |
| Implementation needs config/dependency/public-API changes, a dialect extension or broad profile refactoring | Failing acceptance case and smallest exact proposed change                                      | Pause for a scope/approval decision; do not introduce a shim                                                 |
| A frozen authoritative document needs formatting                                                            | Targeted format diff and inventory of its checksum dependents                                   | Format first, refresh only affected pins, and retain substantive reviews whose meaning is unchanged          |

Reassess the plan if exact token preservation substantially increases resource use within existing limits, if the selected error cannot remain fatal through loading, or if a semantic mapping for the rejected clause is proposed later.
Any future KRSS1 extension needs its own sourced semantics and explicit decision; this rejection repair does not pre-authorize it.
