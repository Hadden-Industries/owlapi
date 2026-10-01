# DL and KRSS1 source-preservation qualification

The owner accepted the [implementation plan](../plans/2026-10-01-dl-krss1-source-preservation.md) on 2026-10-01, including signed checkpoints and delivery through a normal merge PR.
This record concerns the existing finite DL and original-KRSS grammars, not arbitrary dialects or npm release qualification.

## Candidate and checkpoints

- Baseline: `3d1933c44f939525dd9a73afd6e7731627333ca6`.
- DL repair and the plan itself: `9f91e33a3aee6b1be851a3d1775266e9879ed1c5`.
- KRSS1 correction, supported companion and compatibility evidence: `fdfdb165178e1666907671738457f7a2b31a9188`.
- Public consumer exercises: `1e27077221aecfb282a6229fa189ed22cf73170d`.
- Candidate: `.release/dl-krss1-source-preservation-01/candidate/owlapi-0.1.0-rc.1.tgz`.
- SHA-256: `6304fc64c05db824cb83d26afae5466de8c14c6f2ebb62ce6d4e95633f593c29`; 253,016 bytes, 108 files.
- Qualification host: Windows x64, Node `24.21.0`, npm `12.1.0`.

The two production repairs were committed before candidate construction.
The package bytes were built from that KRSS1 revision; the source packlist digest is `8f72dbe97c64842acacdbcc98b8b2000f93d9f6103b585f12eb1a8b01592c5a4`.
The candidate manifest records `UNCOMMITTED_QUALIFICATION_SNAPSHOT` because the public consumer harness was uncommitted at construction time.
That exact harness was subsequently committed as `1e27077221aecfb282a6229fa189ed22cf73170d` and supplied both construction and initial portable/browser qualification.
Subsequent test exercises and this record are outside the package packlist.
The corrected harness was qualified against the same tarball after review; its `test/import-closure/public-contract.js` SHA-256 is `41a3a8c732684ef2d2f9db96d313c6d1a72b087713fa3a2aed494a73b412bb07`.
The final qualification commit contains that harness and this record; the content digest identifies it without a circular reference to its own commit SHA.
Fresh outputs are `.release/dl-krss1-source-preservation-02/portable.json`, `chromium.log` and `webkit.log` (portable PASS and six browser tests passed).
The package-content manifest and rights facts were refreshed without changing the pending human rights-review status or asserting release approval.

## Behavior and independent expectations

DL integer and double tokens retain their original lexical string and existing datatype in strict, compatible and preserve modes.
Eight assertion cases per mode cover zero, leading/trailing zeros, fractional precision, a terminal decimal point, an unsafe-range integer, a 400-digit integer and a long fraction.
Two data-nominal cases per mode distinguish equal values with different strings from exact duplicate set entries.
Expected axioms come from explicit factory calls, never parser-generated snapshots.
Negative-number, exponent and quoted spellings remain identifier tokens; malformed decimal input remains separate tokens.
No new numeric grammar or cardinality behavior is introduced.

Well-formed KRSS1 `:right-identity` throws `UNSUPPORTED_CONSTRUCT`, with `format: "krss1"`, `construct: ":right-identity"` and `reason: "UNSUPPORTED_KRSS1_RIGHT_IDENTITY"`.
Two attribute spellings and four malformed productions are checked in all three modes.
The required role and closing delimiter are validated first; malformed local clauses retain syntax errors.
The existing attribute location is one-based column 28, offset 27, in the compact regression input, and is omitted when locations are disabled.
The whole document is not validated after this fatal error.
Earlier resource exhaustion and cancellation retain their existing behavior.

The historical `phase17-structural.krss` and `phase17-structural.java.json` remain byte-for-byte unchanged.
The former now tests explicit rejection.
The project-authored `source-preservation-supported.krss` omits only the unsupported identity clause and has eleven independently constructed expected axioms plus its complete typed signature, imports and annotations.
The existing Java 5.5.1 observation at `d7e997a53b470e32700de89cc610d9daf01ea769` is reused as historical evidence, not reported as a new Java run.
Its no-effect behavior is an explicit controlled compatibility correction in the existing ledger.
No qualifying historical strict-KRSS corpus is claimed.

The literal identity authority is [OWL 2 Structural Specification section 5.7](https://www.w3.org/TR/2012/REC-owl2-syntax-20121211/#Literals).
The [original-KRSS decision](../adr/0008-promote-original-krss1-into-v1.md), amended implementation contract and existing Java oracle establish the finite dialect boundary.

## Finite production audit

The production audit followed all DL axiom/expression branches and every top-level keyword admitted by the KRSS1 adapter through the shared core.
Each semantic production constructs an axiom/expression or fails; delimiters, comments and whitespace are grammar control.
The only two DL literal consumers are atomic data assertions and data nominals, both routed through the repaired literal method.
No additional silent semantic-discard path was found within this finite audit.
KRSS2-only branches remain gated by its adapter and covered by its existing suite.

| Production group                                                                                                   | Existing or added decisive test                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DL subclass, equivalent classes, aliases and document-relative names                                               | `constructs a subclass axiom with document-scoped entity IRIs`; `accepts the OWLAPI ASCII, TeX, and Unicode axiom aliases`                                                                 |
| DL atomic/complex class assertion, object/data assertion, same/different individuals                               | `parses assertion and object-property axiom forms`; `source literals in %s mode`                                                                                                           |
| DL subproperty, equivalent/inverse properties, ordered composition and transitivity                                | `parses assertion and object-property axiom forms`                                                                                                                                         |
| DL domain/range/functionality patterns and unmatched subclass fallback                                             | `maps renderer-style domain, range, and functionality descriptions without dropping unmatched subclass axioms`                                                                             |
| DL and/or/not, nested/named expressions, some/all, inverse roles, cardinalities, object nominals and data nominals | `parses Boolean, quantified, inverse, cardinality, nominal, and data-value expressions`; `preserves structural set identity for %s`                                                        |
| DL literal strings and lexer boundaries                                                                            | `preserves %s as xsd:%s`; lexer identifier/malformed-decimal tests; `bounds preserved numeric token %s`                                                                                    |
| KRSS1 primitive/defined concepts, primitive role, transitive/range, instance/related/equal/distinct                | `preserves historical rejection evidence and verifies the supported companion exactly`                                                                                                     |
| KRSS1 and/or/not, some/all, at-least/at-most/exactly with required fillers                                         | `accepts every class-expression production with nesting`; `requires qualifiers on original-KRSS cardinalities`                                                                             |
| KRSS1 role parents, unsupported identity, malformed role clauses                                                   | `unsupported clauses in %s`; `requires primitive concept and primitive role parents`                                                                                                       |
| KRSS1 names, reserved words, full-IRI and inverse-role rejection                                                   | `resolves original-KRSS names against the document IRI`; `rejects full IRIs and punctuation outside the original Name token`; `rejects reserved words and named inverse roles as entities` |
| KRSS1 TBox/ABox ordering, terminal delimiters, comments, empty/duplicate/trailing input                            | `enforces TBox-before-ABox ordering and terminal delimiters`; `handles comments, empty documents, duplicates, and trailing garbage`                                                        |
| Both parsers: token/input/depth/axiom/time/cancellation controls                                                   | Existing syntax-specific resource suites plus numeric token boundaries and unsupported-clause rollback                                                                                     |
| KRSS2 identity direction and other shared-core behavior                                                            | Existing syntax and conformance suites, including `supports positional parents and the complete primitive-role attribute set`                                                              |
| Exact format selection and no fallback                                                                             | `never falls back to KRSS2 after a fatal KRSS1 failure selected by %j`, for exact selection and a generic `.krss` hint; existing detection and registry suites                             |

## Public consumer evidence

`exerciseParserPreservation` uses only public package subpaths and runs in the source-tree suite, installed Node smoke test and shared browser/worker exercise.
For every mode it loads a Functional Syntax root importing explicitly selected DL and KRSS1 documents, with declarations supplied by the root.
It checks exact axioms, typed signatures, format identities, root/import identity, frozen import-parent context and fatal imported rejection under a tolerant missing-import policy.
An immediate public lookup confirms the failed root was never published; a successful retry with the same manager and document identities, two fresh import-loader calls and exactly three documents proves rollback.
Preserve mode separately checks formal and source validity, forged metadata rejection, a closure-wide property collision and stale evidence after mutation.

Functional Syntax and RDF/XML round trips compare complete declared structures and exact literals.
DL cannot express declarations, so the storage fixture adds independently constructed data-property and individual declarations before saving.
This avoids presenting an undeclared RDF graph as a supported round trip.

The plan's numeric-budget example needed a narrower interpretation: `maxNumericDigits` bounds rational/facet arithmetic, not plain integer lexical validation.
A 65-digit DL integer remains source-valid with `maxNumericDigits: 64`; `maxLiteralLength: 64` correctly leaves its source assessment unverified.
No checker defaults or policies were changed.

## Executed checks and remaining gates

- The new DL regression failed on the baseline: 24 failures demonstrated changed strings or rejected large integers.
- DL focused suite: 86 passed.
- KRSS, registry and governance checkpoint: 230 passed, one existing skip.
- Combined parser/profile/manager/public-contract suite: 495 passed in 29 suites.
- Candidate construction and its installed consumer checks: passed.
- Portable Node qualification: passed on Node 24.21.0 using the recorded tarball.
- Browser preparation detected four changed integrity hashes in the reviewed import map; the owner approved exactly those updates, with imports, dependency versions and URLs unchanged.
  The second preparation completed against the same tarball at `browser-approved`.
  The approved four-path scope also covers the final regenerated `public-contract.js` hash after the rollback assertion and explanatory comment were corrected; no additional map entry changed.
- Chromium and WebKit: all six bundler, import-map and DedicatedWorker checks passed.
  Firefox's three tests failed before execution because Windows could not spawn its installed executable (`spawn UNKNOWN`); required CI coverage is pending.
- One consolidated Claude review and one narrowly scoped follow-up completed.
  No production correctness defect was found.
  All five initial findings were resolved; the follow-up's remaining low-severity evidence finding is addressed here by the corrected-harness digest, output locations and explicit four-path approval scope.
- Final governed verification is recorded by HISEW execution `b99035fa-93f4-4fc4-8927-938d9676e825`; protected-main delivery and the supported-platform checks are recorded by the resulting merge PR.
  This record does not predeclare their results.
- The existing CI matrix supplies supported Node 22 and Linux coverage; no local Node 22 result is claimed.

Raw logs and manifests are retained under `.release/dl-krss1-source-preservation-01/` and `-02/` for this task, with a durable copy at `C:/Users/maksy/.hi/w/e/task-evidence/2026-10-01-owlapi-dl-krss1`.
The reviews were static, read-only inspections, not independent executions of the reported tests.
The required final profile contains Jest, boundary, lint, format, release-gate and workflow-governance checks; it is scheduled through HISEW rather than repeated solely for a receipt.

## Performance and recovery

DL baseline completed; KRSS1 baseline completed on its one bounded retry.
KRSS2 baseline and all three candidate benchmarks were blocked by the unchanged idle-machine guard; each failed command was attempted at most twice.
The owner separately approved proceeding with the KRSS2 baseline limitation and with all three blocked candidate measurements.
There is no measured no-regression claim for blocked comparisons.
Resource ceilings remain unchanged and deterministic resource tests pass.

Recovery uses the completed signed checkpoints and retained original sources.
Previously normalized strings or discarded clauses cannot be reconstructed from old parsed objects; reload the original document.
No registry publication, version change, unrelated checkout cleanup or shared-history rewrite is part of this work.
