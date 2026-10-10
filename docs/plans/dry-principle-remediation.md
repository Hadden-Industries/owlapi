# DRY analysis and implementation plan

**Status:** Draft for owner review; analysis and planning completed on 11 October 2026.
Implementation is not started or approved by this document.
**Decision owner:** Maksym Shostak.
**Task:** Apply the declaration-duplication analysis from the WebVOWL chat to OwlAPI and plan remediation using HISEW.
**Inspected baseline:** `main` at `e095451b7791e5f91dd5f2be81772ab7e7d981a9`; the checkout was clean before this planning edit.
**Proposed implementation route:** R2, with separately demonstrable slices and stronger assurance for parser/resource and CI/evidence boundaries.

This document contains the draft change dossier, source findings, risk route, design decisions, implementation slices and acceptance evidence.
It supplements the [governing implementation plan](../implementation-plan.md) and [engineering conventions](../engineering-conventions.md); it does not supersede their contracts or choose a release version.

The requested outcome is fewer independently maintained representations of the same knowledge.
The proposed compatibility constraint is to preserve existing observable behavior while changing ownership and reuse.
If a suspected duplicate actually represents a separate policy, retain that distinction rather than force it into one value.

## 1. Reference method and evidence boundaries

The reference is the chat titled “WebVOWL: Update repo for Python >=3.15”, identifier `01a124ec-7a94-7233-a0cc-d5fe6b5d347b`.
Its declaration audit identified 11 groups and distinguished real shared policy from generated lock entries, independent test expectations and intentionally different contracts.
The inspected implementation is [WebVOWL commit ddd0d52823a9de77e26cada4729b599bd6f55189](https://github.com/Hadden-Industries/webvowl/commit/ddd0d52823a9de77e26cada4729b599bd6f55189), associated with [PR 74](https://github.com/Hadden-Industries/webvowl/pull/74).
The commit itself was read from the local WebVOWL Git object database.

The transferable method is:

1. Find repeated declarations with syntax-tree inspection, then inspect consumers and meaning.
2. Identify the owning domain and the reason the copies must change together.
3. Reuse an existing authority before adding another module.
4. Share immutable definitions; construct independent mutable state for each caller.
5. Preserve intentional subsets, representation differences, defaults and historical identities.
6. Test behavior using independent expectations, including malformed inputs and state isolation.

OwlAPI also contains substantial repeated algorithms.
Those are included below, but their extraction has a different risk and proof burden from moving a namespace constant.
WebVOWL's successful tests establish no OwlAPI acceptance evidence, and its application configuration choices are not imported into this library.

### Inspection performed

- Enumerated tracked JavaScript with `git ls-files '*.js' '*.mjs' '*.cjs'`: 513 files.
- Parsed 262 files after excluding `.test.`, `.probes.`, and `test`, `tests`, `fixtures`, `upstream` and `LICENSES` path segments.
  Acorn 8.18.0, already installed in the checkout, parsed all selected files without errors.
- Visited 7,521 initialized declarations with an identifier binding.
  Destructuring declarations are not included in that count.
- Collected 47 cross-file initializer candidate groups, 15 repeated constant-name groups with differing initializer text, and 27 cross-file function-body candidate groups.
  These are overlapping search results, not violation counts; trivial state initializers such as `false` and `null` were rejected.
- Compared literals, normalized initializer text and repeated function bodies, then traced the significant callers manually.
  This is not a complete semantic clone detector.
- Inspected all six workflow files, both package manifests, Python/uv project declarations, resource policy, conformance suite metadata, existing tests and release/evidence tooling.
  There are no tracked Python source files in this baseline; Python-related logic is in JavaScript tooling and TOML configuration.
- Statically compared the four XML entity defaults, the KRSS detector/parser keyword sets and all 13 XSD integer subtype bounds.
  The corresponding values agree today.
  This proves duplication of those facts, not an existing behavioral defect.

The result is **18 confirmed duplication groups**, plus the explicitly retained or unresolved cases in section 3.
“Confirmed” means the same policy or mechanism is maintained in multiple places; it does not mean a user-visible bug was reproduced.
Source line numbers below are observations at the inspected commit, not predictions for future code.

### HISEW applicability

The installed HISEW `hadden-industries-route-software-change` and `hadden-industries-plan-software-change` procedures were applied.
`inspect-project-applicability` reported active personal applicability.
`inspect-workflow-progress` reported the prior handoff committed, with a new execution requiring its own accepted scope.
`inspect-verification-profiles` supplied the profiles recorded in section 7.

The inspected configuration and evidence roots are `C:\Users\maksy\.hi\w\c` and `C:\Users\maksy\.hi\w\e`.
The current session is `01a127b5-770f-7be1-b9ee-26d5031d7cf5`, installation `03bbbbe4-51bc-5b6c-9374-958d1e5dd9f0`, host `codex`.
No prior execution was adopted, no requirement snapshot was accepted, and no implementation execution was started.
Provider capability inspection is not a review or scan.
No review, scan, commit, push, merge or release is claimed for this plan.

The plan and its documentation index entry are the durable planning artifacts.
Inspection outputs remain in this chat; no supplemental scratch directory or repository-local `.sdlc` evidence is required for this planning result.

## 2. Confirmed findings

Priority means suggested implementation order, not security severity.
P1 covers duplicated executable policy or trust-sensitive inventories; P2 covers shared mechanisms whose removal should follow characterization.

| ID      | Group                                                         | Priority | Proposed owner or reuse boundary                                 |
| ------- | ------------------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| DRY-001 | Namespace IRIs, built-in terms and standard parser prefixes   | P1       | Existing data-only RDF vocabulary and a parser-prefix definition |
| DRY-002 | XML entity limit defaults                                     | P1       | One browser-safe XML entity default record                       |
| DRY-003 | KRSS dialect keyword inventories                              | P1       | Existing KRSS dialect module                                     |
| DRY-004 | RDF graph-term and entity-declaration inventories             | P1       | RDF term policy and canonical declaration mapping                |
| DRY-005 | XSD integer subtype bounds                                    | P1       | Dependency-free datatype value-space facts                       |
| DRY-006 | XML Name/NCName character ranges                              | P1       | Existing XML name module, with explicitly distinct predicates    |
| DRY-007 | Prefixed-name, blank-node-label and full-IRI lexical rules    | P2       | Narrow shared lexical primitives                                 |
| DRY-008 | Text-lexer source-position tracking                           | P2       | Per-lexer cursor mechanics, separate from syntax policy          |
| DRY-009 | Leading-trivia scanning in format descriptors                 | P2       | Explicitly separate ASCII and Unicode-whitespace scanners        |
| DRY-010 | Cooperative parser yielding and clock selection               | P2       | Per-parser cooperative checkpoint mechanism                      |
| DRY-011 | RDF stream chunking, drain handling and blank-node collection | P2       | Shared stream adapter mechanics                                  |
| DRY-012 | Exact CI Node/npm selections and their projections            | P1       | Reviewed runtime policy with generated/validated projections     |
| DRY-013 | Exact uv selection across bootstrap and projects              | P1       | Reviewed development-tool selection and native constraints       |
| DRY-014 | Historical Git/package equivalence contract                   | P1       | Version-specific trusted qualification policy                    |
| DRY-015 | npm evidence filenames and public-registry identity           | P1       | Evidence format metadata and narrowly scoped registry identity   |
| DRY-016 | W3C fixture generator metadata and RDF term encoding          | P2       | Existing suite inventory plus generator-only utilities           |
| DRY-017 | Benchmark measurement policy, sampling and phase registries   | P2       | Existing benchmark policy plus measurement utilities             |
| DRY-018 | Browser bundle-cost graph analysis                            | P2       | Shared measurement implementation with explicit probe policy     |

### DRY-001: Namespace IRIs, built-in terms and prefixes

[The RDF vocabulary](../../internal/rdfjs/vocabulary.js), lines 1–4, already owns RDF, RDFS, OWL and XSD namespace strings.
Copies remain in [OWL/XML detection](../../internal/parsing/owlxml/descriptor.js), [OWL/XML parsing](../../internal/parsing/owlxml/parser.js), [RDF/XML adaptation](../../internal/parsing/rdfxml/rdfXmlSyntaxAdapter.js), [source evidence](../../internal/model/sourceEvidence.js), [OWL/XML storage](../../internal/storage/owlxml/owlXmlStorer.js), [RDF/XML writing](../../internal/storage/rdfxml/rdfXmlGraphWriter.js), [RDF/XML format configuration](../../formats/rdfXMLDocumentFormat.js) and [Manchester rendering](../../manchestersyntax/renderer/manchesterOWLSyntaxOWLObjectRendererImpl.js).

[Functional](../../internal/parsing/functional/parser.js), line 13, and [Manchester](../../internal/parsing/manchester/parser.js), line 19, duplicate the same frozen four-prefix record.
`owl:Thing`, `owl:Nothing`, `rdfs:Literal` and selected datatype IRIs also recur in [the data factory](../../model/owlDataFactory.js), [DL parsing](../../internal/parsing/dl/parser.js) and [KRSS parsing](../../internal/parsing/krss/parserCore.js).

These identifiers denote the same terms.
Reuse the existing data-only vocabulary, add XML/XMLNS ownership at an appropriate data-only seam, and derive the common parser prefix record.
Keep RDF/XML writer prefix preference/order and its additional SKOS/DC namespaces as a separate policy.
Each parser must still create its own prefix map; no shared mutable map or new public package subpath is needed.

### DRY-002: XML entity defaults

[Loader defaults](../../model/owlOntologyLoaderConfiguration.js), lines 19–22, and [XML entity policy](../../internal/parsing/xml/xmlEntityPolicy.js), lines 8–13, independently define `maxEntityDeclarations=256`, `maxEntityExpansionDepth=16`, `maxEntityReplacementLength=65536` and `maxExpandedXmlBytes=33554432`.
The entity-policy entry point merges its own defaults with caller configuration at line 470, so this is executable fallback policy, not just a documentation copy.

Place those four implementation defaults in one immutable dependency-free record, consumed by both paths.
Preserve validation, override precedence and zero values.
The [governed resource budget](../performance/resource-budgets.json) remains an independently reviewed policy oracle: [governance tests](../../governance.test.js), beginning at line 1380, deliberately compare runtime defaults with that record.
Do not make that comparison tautological by deriving both sides from the runtime default object.

### DRY-003: KRSS grammar inventory

[Detection](../../internal/parsing/krss/detection.js), lines 4–25, [dialect classification](../../internal/parsing/krss/dialect.js), lines 6–28, [KRSS1 parsing](../../internal/parsing/krss1/parser.js), lines 4–14, and [KRSS2 parsing](../../internal/parsing/krss2/parser.js), lines 4–23, independently enumerate the shared and KRSS2-only productions.
Static set comparison confirms the detector and parser memberships match the dialect inventory; some orderings differ.

Make the existing dialect module own immutable ordered keyword facts and derive membership sets and detector alternatives.
Retain KRSS1/KRSS2 parser policies, grammar restrictions, case handling, extension preference, bounded sniffing and reason codes.
A shared union must never admit KRSS2-only syntax through KRSS1.

### DRY-004: RDF term and declaration classifications

The graph term set `BlankNode`, `DefaultGraph`, `NamedNode` occurs in [graph policy](../../internal/rdfjs/graphPolicy.js), line 7, [OWL-to-RDF mapping](../../internal/mapping/owlToRdfTranslator.js), line 33, and [RDF-to-OWL mapping](../../internal/mapping/rdfToOwlTranslator.js), line 95.
The six canonical entity-to-RDF declaration pairs in the forward mapper at line 35 are repeated in reverse form by `ENTITY_KIND_BY_ROLE` and `RDF_ROLE_BY_ENTITY_KIND` in the reverse mapper at lines 45–55.

Own the common facts once and derive directional views.
Keep each boundary's validation and error context.
The reverse mapper's additional accepted aliases, including `owl:DataRange` and `owl:OntologyProperty`, are separate compatibility rules; deriving every accepted input from the writer's canonical output would narrow behavior.
Do not merge the general RDF term-key encoder with the graph-only validator merely because both use the name `termKey`.

### DRY-005: XSD integer value spaces

[RDF-to-OWL cardinality conversion](../../internal/mapping/rdfToOwlTranslator.js), lines 101–124, and [profile datatype validation](../../internal/profiles/datatypes.js), lines 16–30, duplicate bounds for 13 integer datatypes.
One stores full IRIs and BigInt limits; the other stores local names and decimal strings.
Static normalization confirms every lower and upper bound matches.

Create one immutable table of datatype facts below both consumers, with explicit absent bounds.
Derive representation-specific indexes without importing the profile engine, XML parser or other heavyweight dependencies into the mapper.
Preserve the consumers' different lexical rules, whitespace treatment, digit budgets and exact-integer handling.
Sharing the facts does not justify replacing bounded lexical validation with unbounded BigInt parsing.

### DRY-006: XML names

[XML entity policy](../../internal/parsing/xml/xmlEntityPolicy.js), lines 18–51, [XML names](../../internal/parsing/xml/xmlNames.js), lines 1–33, and [profile datatypes](../../internal/profiles/datatypes.js), lines 63–70, maintain the XML name-character ranges separately as predicates and regular expressions.

The first predicate explicitly permits colon; the NCName predicate excludes it.
Reuse the common range facts through clearly named XML Name, NCName and NMTOKEN operations.
Preserve every boundary, astral character, combining mark, empty-string and colon rule.
Audit names under HISEW NAM-01: the existing `isXmlNameStartCodePoint` in the NCName implementation must not become a misleading general XML Name API through this change.

### DRY-007: Shared lexical rules

[Functional lexing](../../internal/parsing/functional/lexer.js), lines 5–155, and [Manchester lexing](../../internal/parsing/manchester/lexer.js), lines 5–25 and 98–216, duplicate local-name escapes, PN character predicates, prefix recognition, escaped local units and blank-node-label checks.
[Functional parsing](../../internal/parsing/functional/parser.js), lines 31–48, and [OWL/XML parsing](../../internal/parsing/owlxml/parser.js), lines 50–67, also duplicate forbidden-IRI character inspection and absolute-IRI recognition.

Extract only identical lexical contracts into focused primitives; prefixes, blank-node labels, XML names and IRIs remain distinct concepts.
Keep syntax-specific keywords, token delimiters, quoted-string rules, recovery modes and error construction with their parsers.
Do not replace these rules with a broad URL parser or JavaScript whitespace expression without equivalent acceptance evidence.

### DRY-008: Lexer cursor mechanics

The `#advance` bodies in [DL](../../internal/parsing/dl/lexer.js), line 202, [Functional](../../internal/parsing/functional/lexer.js), line 252, [KRSS](../../internal/parsing/krss/lexer.js), line 103, and [Manchester](../../internal/parsing/manchester/lexer.js), line 326, are identical after whitespace normalization.
They update offset/line/column, preserve CRLF state and request a budget check after 1,024 scanned units.
Location-record construction also repeats.

Use a small per-lexer cursor mechanism if the characterization and performance experiment supports it.
Keep mutable offsets, token counters and budget state per invocation.
Preserve UTF-16 offset/column semantics, CRLF behavior and check cadence.
Token finalization is only partially shared; do not unify complete token pipelines or add a parser inheritance hierarchy to remove this repeated body.

### DRY-009: Descriptor trivia scanning

[Functional](../../internal/parsing/functional/descriptor.js) and [Manchester](../../internal/parsing/manchester/descriptor.js), both beginning at line 6, duplicate the same ASCII whitespace and `#` comment loop.
[N-Quads](../../internal/parsing/nquads/descriptor.js), [N-Triples](../../internal/parsing/ntriples/descriptor.js) and [TriG](../../internal/parsing/trig/descriptor.js), also at line 6, duplicate a second loop using JavaScript `\s`.

Centralize within each equivalent family.
Retain the two whitespace policies explicitly, as well as start-offset behavior and each descriptor's bounded-source contract.
Combining both groups through a silently broader whitespace predicate would change format detection.

### DRY-010: Parser checkpoint mechanics

[DL](../../internal/parsing/dl/parser.js), line 551, and [KRSS](../../internal/parsing/krss/parserCore.js), line 886, contain identical cooperative-yield bodies.
[Functional](../../internal/parsing/functional/parser.js), line 1137, and [Manchester](../../internal/parsing/manchester/parser.js), line 1144, implement the same elapsed-work checkpoint with small calling differences.
Their 50 ms interval and clock fallback are repeated.

Share the elapsed-work mechanism while retaining the supplied budget check, receiver binding, per-parse clock state and Manchester's selectable lexer.
Treat [OWL/XML](../../internal/parsing/owlxml/parser.js), [RDF-to-OWL mapping](../../internal/mapping/rdfToOwlTranslator.js) and streaming adapters as separately characterized follow-on consumers, not automatic replacements.
In particular, [profile budgeting](../../internal/profiles/budget.js), lines 79–88, intentionally uses a timer turn because `scheduler.yield()` can outrun caller cancellation in Chromium.
Its `timeoutMs: null` default is also intentional.
Neither is replaced by parser behavior.

### DRY-011: RDF stream mechanics

[N3 adaptation](../../internal/parsing/rdf/n3SyntaxAdapter.js), lines 262–310, and [RDF/XML adaptation](../../internal/parsing/rdfxml/rdfXmlSyntaxAdapter.js), lines 694–724 and 841–857, repeat surrogate-safe text chunking, recursive blank-node collection and drain/error listener cleanup.
They also repeat the 65,536-unit default chunk size and maximum timer delay.

Extract the identical stream mechanisms below both adapters.
Keep external parser construction, XML/entity handling, RDF syntax options and diagnostics at their owning boundaries.
Do not collapse their execution controllers: N3 tests elapsed timeout with `>=` and yields by elapsed work; RDF/XML uses `>` in its check and yields every 16 chunks.
Those differences are existing observable behavior requiring a separate decision if changed.

### DRY-012: CI runtime selection

Exact npm `12.2.0` installs appear 63 times across five workflows: 19 in [CI](../../.github/workflows/ci.yml), 5 in [extended tests](../../.github/workflows/extended-tests.yml), 1 in [maintenance](../../.github/workflows/maintenance.yml), 7 in [release reconciliation](../../.github/workflows/release-reconciliation.yml), and 31 in [release](../../.github/workflows/release.yml).
These are textual occurrences, not 63 independent jobs.
Runtime assertions are repeated as well.
Node floor selections also appear in workflow setup, [job names](../../scripts/ci-qualification.mjs), [reuse qualification](../../scripts/ci-verification.mjs) and [workflow governance](../../scripts/workflow-governance.mjs).

Unlike WebVOWL, this repository has no exact `packageManager` selector: [the manifest](../../package.json) declares the npm eligibility floor through `devEngines`.
Do not copy WebVOWL's manifest reader or interpret `>=12.2.0` as the exact CI selection.
Introduce a reviewed, closed runtime-selection record for the existing Node floors `22.23.3`, `24.21.0`, `26.11.1`, canonical Node 24 lane and exact npm `12.2.0`.
Derive programmatic consumers and narrowly generate/check the corresponding static workflow fields.
Retain static job identities, actions, permissions, dependency ordering and qualification requirements.
The [producer policy](../release/producer-release-policy.json) remains the reviewed obligation against which projections are checked.

### DRY-013: uv bootstrap identity

[The bootstrap](../../scripts/repository-python-tools.mjs), line 20, selects uv `0.13.0`; [the root project](../../pyproject.toml), line 12, and [the ScanCode project](../../util/scancode-runtime/pyproject.toml), line 21, independently require `==0.13.0`.
[The material generator](../../util/generate-third-party-material.mjs), around line 485, separately emits that selected version.
The scanner uses the bootstrap's `ensureRepositoryUv`, so these are coupled to the same installed tool.

Give the exact selected version and platform asset digests one data owner, with checked projections into native uv constraints and generated material metadata.
Preserve both project environments, locks, licenses, denied installation behavior and exact archive digests.
Python interpreter selection, each project's compatibility floor and historical license filenames retain their own roles; they are not interchangeable uv selectors.

### DRY-014: Historical Git/package qualification

[The verifier](../../scripts/git-package-equivalence.mjs), lines 35–57, and [the qualification runner](../../scripts/qualify-git-package-equivalence.mjs), lines 32–51, separately define the four installed tests, five historical exports and canonical Git repository coordinate.
The runner already imports other policy from the verifier, making the remaining independent declarations avoidable.

Use one version-specific trusted policy consumed by both, preserving the historical five-export contract.
Do not derive verifier expectations from candidate metadata, current `package.json`, or a report being verified.
Independent tests must still reject a missing/replaced installed check, a changed export, a moved Git reference and an unexpected repository.
Historical alpha/RC evidence and current release policy remain separate contracts.

### DRY-015: Evidence filenames and registry identity

`npm-package-evidence.json` is redeclared by [completion](../../util/complete-npm-archive-evidence.mjs), [merging](../../util/merge-npm-package-evidence.mjs), [promotion](../../util/promote-npm-package-evidence.mjs), [recanonicalization](../../util/recanonicalize-npm-package-evidence.mjs), [parity verification](../../util/verify-npm-package-evidence-parity.mjs) and literal paths in [acquisition](../../util/acquire-npm-package-evidence.mjs).
The shard filename is independently selected by acquisition and merging.
The same public registry origin is also selected in acquisition and [lock-graph validation](../../util/third-party-evidence/lock-graph.mjs).
Release qualification repeats the registry already exported by [package identity](../../scripts/package-identity.mjs).

Own evidence-format names once, with no changes to persisted filenames, schemas or bytes.
Reuse registry identity within each domain and derive origin versus trailing-slash URL deliberately.
Keep dependency-tarball validation separate from the stricter scoped OwlAPI tarball validator; they accept different path domains.
Do not introduce a repository-wide generic validator that removes those trust boundaries.

### DRY-016: Fixture generation

[N-Quads](../../util/generate-w3c-nquads-fixtures.mjs), [N-Triples](../../util/generate-w3c-ntriples-fixtures.mjs), [TriG](../../util/generate-w3c-trig-fixtures.mjs) and [Turtle](../../util/generate-w3c-turtle-fixtures.mjs) independently repeat W3C revision `12774b0ebb385d17651b396654b19254d0fefbfa` and manifest/RDF-test vocabulary.
That revision already exists by format scope in [the suite inventory](../conformance/suites.json).
RDF term tuple encoding is duplicated in the RDF/XML, TriG and Turtle generators, including nested RDF quad handling.

Read the selected suite revision by explicit format, and share generator-only vocabulary/encoding mechanics.
Preserve distinct RDF/XML and JSON-LD pins, per-suite manifest digests, counts, classifications and deliberate exclusions.
Keep expected fixture data independent of the product implementation.
Regenerate from verified original inputs and compare output bytes; do not hand-edit generated fixtures to match the refactor.

### DRY-017: Benchmarks

All 14 `util/benchmark-owlapi-*.mjs` programs repeat median calculation and run/warmup declarations.
Seven sampling bodies are identical; four event-loop-aware sampling bodies are identical.
See [Functional measurement](../../util/benchmark-owlapi-functional.mjs), lines 18–54, and [Turtle measurement](../../util/benchmark-owlapi-turtle.mjs), lines 22–70.
Adjacent parser benchmarks also repeat historical phase descriptor arrays, for example [DL](../../util/benchmark-owlapi-dl.mjs) and [KRSS2](../../util/benchmark-owlapi-krss2.mjs).

Read the approved one-warmup/five-measured-run policy from [resource budgets](../performance/resource-budgets.json), share sampling/statistical mechanics, and give each historical descriptor set one explicit owner.
Preserve phase ordering, fixture identities, first-use measurement, the upper-middle result for even sample counts, GC behavior and the distinction between heap-only and event-loop-aware modes.
A shared harness must not silently add a timer turn to historical heap-only measurements or replace phase registries with the current default parser registry.

### DRY-018: Browser cost probes

[RDF/XML browser-cost measurement](../../util/measure-owlapi-rdfxml-browser-cost.mjs) and [Turtle browser-cost measurement](../../util/measure-owlapi-turtle-browser-cost.mjs), lines 8–66, duplicate Vite setup, module-ID normalization, static-import traversal, deterministic concatenation and gzip/byte accounting.

Use one bundle-analysis implementation with explicit format-specific roots and forbidden modules.
Keep output keys, diagnostics, build settings and lazy-import checks stable.
Also inspect the [aggregate RDF browser-cost tool](../../util/measure-owlapi-rdf-browser-cost.mjs) before adding an owner so existing reusable logic is not bypassed.
Dynamic imports must remain excluded from the initial static closure.

## 3. Repetition to retain or investigate separately

| Case                                                                                           | Disposition and reason                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generated lockfiles, archived fixtures, licenses, release receipts and dated commit identities | Retain. These record resolved or historical facts; they are not additional editable selectors.                                                                                                                                  |
| Independent conformance and hostile-input expectations                                         | Retain. Importing the implementation's answer into its oracle would hide drift.                                                                                                                                                 |
| Resource-budget document versus loader defaults                                                | Retain the policy/runtime separation and governance comparison. Consolidate the two runtime XML default copies, not the independent policy oracle.                                                                              |
| `new Set(CLASS_EXPRESSION_KINDS)` in several consumers                                         | Already derived from one canonical taxonomy. Private lookup instances are not duplicated knowledge.                                                                                                                             |
| Parser/manager maps, sets, counters, `false`, `null`, document scopes and caches               | Retain per-instance state; sharing can introduce cross-document contamination.                                                                                                                                                  |
| `MAX_OUTPUT_BYTES=33554432` in four writers/renderers                                          | Candidate, not a confirmed shared policy. Establish whether these ceilings must evolve together. Retain per-format declarations if their policies can differ; do not equate them with the loader input-byte limit.              |
| Output depth 128 versus 512; loader/profile/locality budgets                                   | Distinct policies. Existing profile null deadline and locality optional limits are preserved.                                                                                                                                   |
| Duplicate `addAxiom` bodies in the loading transaction and reverse mapper                      | Deferred candidate. Establish common transaction/rollback and structural-set ownership before extracting a collection abstraction.                                                                                              |
| SHA regexes, hash helpers, `stableJson` and similarly named `termKey` functions                | Do not merge by spelling. Raw/prefixed hashes, canonical JSON byte protocols, RDF term encodings and graph-only validation can differ.                                                                                          |
| GitHub Action SHA literals and governance allowlists                                           | Keep pinned workflow references and an independent trusted allowlist. No generic YAML interpolation or weakened allowlist is proposed.                                                                                          |
| `package.json` candidate identity versus trusted release expectations                          | Independent trust roles. Candidate metadata cannot define its own expected identity.                                                                                                                                            |
| Python exact selection versus project minimums; npm floor versus CI exact version              | Different contracts. Only the repeated exact uv selection and exact CI selection are in scope.                                                                                                                                  |
| UO/WebVOWL consumer source pins                                                                | Already centralized through [owl-contract-sources.json](../release/owl-contract-sources.json) and [source capture](../../scripts/consumer-source-snapshot.mjs). Reuse this authority; do not reintroduce executable SHA copies. |

A fresh audit after each implemented group may expose additional consumers.
Add them only when they express the same accepted contract.
A newly discovered semantic bug or different policy is a separate finding and may require re-planning; it is not silently repaired under behavior preservation.

## 4. HISEW risk route

### Risk class:

**Proposed R2 for the implementation programme.**
Observed scope includes public parser acceptance and diagnostic behavior, hostile-input resource controls, cancellation, and CI/release evidence validation.
The document-only planning edit does not itself exercise these effects.

### Decision owner:

Maksym Shostak, the requesting repository owner.
The implementing agent coordinates integration after acceptance; producer qualification remains OwlAPI-owned.

### Reasoning:

Changing one shared rule can affect several syntaxes or consumers at once.
An incorrect extraction could widen a dialect, change XML name acceptance, lose source positions, weaken input limits, block cancellation or cause a verifier to trust its producer.
These are inferred failure modes supported by the concrete seams above.
Their semantic and trust-boundary consequences justify R2 despite the intended lack of behavior changes.

### Potential blast radius:

Installed Node/browser consumers, all affected OWL/RDF loading paths, writers using shared vocabulary, profile checks, development tooling, producer CI and release qualification.
WebVOWL and Universal Ontology are consumers, not additional implementation repositories or mandatory adoption gates.

### Reversibility:

Source slices can be reverted as complete owner-and-consumer changes before release.
No ontology/data migration is planned.
A published immutable package cannot be replaced: recover with an authorized successor version or a consumer's retained known-good version.
Reverting CI policy also requires its matching validators and fresh applicable qualification, rather than accepting stale evidence.

### Principal unknowns:

Performance cost of cursor indirection; import-graph impact of shared modules; which historical benchmark phase sets are intentionally distinct; native workflow projection details; original input availability for fixture regeneration; exact source/provenance coverage after moving functions.
The cheapest experiments are specified in the slices.
None prevents delivering this draft, but an unresolved result blocks the dependent extraction.

### Required artifacts:

This integrated plan and its accepted revision; the current HISEW requirement snapshot and route record when implementation is authorized; focused characterization and integration evidence; the final frozen candidate, applicable reviews and resource handoff.
Reuse existing compatibility/provenance records.
No new Issue or duplicate plan is required merely for process.

### Required specialist lenses:

For the proposed R2 implementation, independent semantic verification of parser/mapper/datatype changes, security review of XML/resource/cancellation and release/evidence trust changes, and workflow-contract review of generated runtime projections.
These are proposed route controls to accept with the plan, not claims that a previous user decision authorized scans or delegation.
Resolve the current native provider and effective restrictions when a frozen target exists; do not start providers during planning.

### Required verification:

First, characterize the selected slice and run its focused regressions.
At integration, run the affected checks and additional parser/profile suites that the configured `affected` profile omits.
For the frozen R2 candidate, use the configured `full` profile plus the applicable Java differential, real browser/worker, installed-artifact, performance and security evidence described in section 7.
A profile name is not proof of that additional coverage.

### Required human approvals:

Acceptance of an exact plan/requirements revision before R2 implementation.
Exact CI/configuration changes need their applicable approval when concrete; acceptance must explicitly cover them or the implementation presents their final reviewed proposal.
Behavior changes, weakened limits, oracle changes, waivers, scans/delegation outside standing authority, commits/publication and release retain their own authority.
This planning request authorizes none of those later effects by itself.

### Maximum sensible autonomy:

Current task: inspect sources and reference history, draft the plan, update its index and validate those documents.
After authorized implementation: finish accepted slices, preserve unrelated work and repair regressions within the accepted scope.
Do not self-approve baseline changes, adopt another execution, or use a provider's availability as permission.

### Next lifecycle step:

Owner reviews this draft.
Once an exact revision and implementation scope are accepted, recheck applicability and checkout identity, capture the requirement baseline through HISEW, record the R2 rationale/sensitive scopes, and start the new owned execution.
Follow the supported engine schema and current session identity; do not manufacture receipts or reuse another task's handoff as this implementation's proof.

## 5. Draft requirements, quality scenarios and decisions

These IDs are stable for review.
They express the proposed behavior-preserving design; none is marked owner-accepted by this document.

| Requirement                                 | Falsifiable acceptance criterion                                                                                                                                                                                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001: Single ownership                   | AC-001: Every accepted DRY-001–018 group has one identified authority/mechanism and all listed consumers derive from it. A residual scan and reviewed consumer map identify any retained duplicate and its distinct meaning. No global zero-duplication percentage is used as an oracle.                              |
| REQ-002: Semantic compatibility             | AC-002: For the pinned positive/negative corpora and new discriminating cases, parsed structure, serialization, metadata, detection/reason codes, exception class/details and source positions match the baseline or already accepted independent oracle. No new expected exception is added to make a refactor pass. |
| REQ-003: State and package isolation        | AC-003: Concurrent/repeated parses and configuration instances cannot alter each other's defaults or state; public exports stay unchanged; new private dependencies are packed; Node imports stay pure; real browser/worker loading and lazy dependency boundaries still pass.                                        |
| REQ-004: Resource and security preservation | AC-004: Existing zero/default/explicit limits, timeout boundaries, abort identity, XML entity policy, no-network behavior and failed-operation atomicity remain intact. Timer/listener cleanup is demonstrated for success, error and cancellation.                                                                   |
| REQ-005: Tooling contract preservation      | AC-005: CI projects exactly the current runtime values, jobs, permissions and required-check inventory; uv/bootstrap values and digests remain identical; qualification rejects missing/mismatched evidence and untrusted identities. Generated projections are checked read-only for drift.                          |
| REQ-006: Independent proof                  | AC-006: Expected grammar, boundary values, historical exports and hostile-input outcomes remain independently authored. Shared production definitions may feed consumers, but cannot supply both actual and expected answers for acceptance.                                                                          |
| REQ-007: Provenance and artifact continuity | AC-007: Existing pins, historical records, corpus hashes, licenses and consumer-source selections are unchanged. Regenerated deterministic fixtures and format records are byte-identical; source provenance records identify the new owners. Any legitimate identity change is explicitly requalified.               |
| REQ-008: Performance and delivery evidence  | AC-008: The current resource-budget benchmark policy is met, affected output schemas remain compatible, and each slice has a reversible source boundary. Final local, installed, hosted and released states are recorded separately.                                                                                  |

| Scenario                            | Stimulus and observable response                                                                                                                                                                                                        | Linked criteria |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| QA-001: Dialect agreement           | A shared/KRSS2-only keyword, extension hint, comment or truncated sniff prefix reaches detection and parsing. Existing MATCH/NO_MATCH/INDETERMINATE results, precedence and accepted grammar are preserved.                             | AC-001, AC-002  |
| QA-002: Names and numbers           | Boundary Unicode, colon, combining mark, escaped local name, integer subtype boundary or malformed lexical form reaches both relevant consumers. Their independently specified acceptance and failure results remain unchanged.         | AC-002, AC-006  |
| QA-003: Hostile or interrupted load | Deep/entity-heavy input, split surrogate, exhausted limit or caller cancellation reaches a real parser in Node and a browser worker. Existing bounded failure and cleanup occur without publishing partial ontology state.              | AC-003, AC-004  |
| QA-004: Independent instances       | Two operations use different prefixes, limits and source locations, including an aborted/reused parser instance. Mutating one caller's data changes neither the other operation nor shared facts.                                       | AC-003          |
| QA-005: Policy drift                | An isolated test candidate changes one projected runtime, removes a job/assertion or changes a digest. Projection/governance/evidence validation rejects it rather than silently accepting the producer's changed answer.               | AC-005, AC-006  |
| QA-006: Historical qualification    | A historical candidate has a missing export/test or substituted repository/hash. The historical verifier rejects it while retaining the accepted old contract and limitations.                                                          | AC-005, AC-007  |
| QA-007: Reproducible tooling        | Verified fixed inputs reach fixture generation or an unchanged bundle graph. Deterministic output bytes, metric keys and classification counts are unchanged.                                                                           | AC-007, AC-008  |
| QA-008: Bounded performance         | The same environment, fixtures and lockfile run one warmup and five measured samples. Median wall time and peak heap satisfy the existing maximum 20% regression limits; first-use and event-loop probes retain their separate meaning. | AC-008          |

Design decisions proposed for acceptance:

- **DEC-001 — Domain ownership:** Prefer an existing cohesive data/mechanism owner.
  Use small private modules where no such owner exists; do not create a catch-all `constants.js`, a public utility barrel or a dependency cycle.
- **DEC-002 — Immutable facts, local state:** Use frozen primitive records/arrays and private derived indexes.
  `Object.freeze(new Set())` does not make Set contents immutable; do not export mutable shared membership state.
  Copy caller-owned maps/records at their existing boundaries.
- **DEC-003 — Preserve contract distinctions:** Separate XML Name/NCName, parser grammars, semantic maps, budget modes, benchmark modes and historical/current qualification.
  No public names, aliases or shims are introduced.
  NAM-01 applies to new and materially changed responsibilities; no NSH-01 override is requested.
- **DEC-004 — Independent oracles:** Preserve governed policy documents, pinned W3C/Java input, historical expected values and negative fixtures as trusted expectations.
  A checked generated projection is allowed; self-validation against candidate-controlled facts is not.
- **DEC-005 — Runtime mechanics:** Extract only the shared mechanism with explicit injected policy/callbacks.
  Preserve receiver binding, check ordering, synchronous fast paths, microtask/task behavior, timeout comparisons and error construction.
  Do not add a configurable framework to replace a small duplicate.
- **DEC-006 — Static workflow projections:** A closed runtime record is the proposed editable selector.
  Reuse the existing YAML parser and governance path for narrow generated/checked fields; preserve protected job IDs/names at the initial values and literal action pins.
  No reusable-workflow migration, dynamic job restructuring or change to publication permissions is included.
- **DEC-007 — Native reuse and rights:** No new production/development dependency, version upgrade, copied WebVOWL implementation, parser replacement or new build system is proposed.
  Reuse native ESM, current Node APIs, existing YAML/Ajv validation and uv's native project validation.
  If a new dependency becomes necessary, complete HISEW REU-01/VER-01/LIC-01 research and approval before adoption.
  Preserve attribution when relocating existing derived code.
- **DEC-008 — Evidence and progression:** Run focused feedback while changing a slice, consolidate before expensive final checks, then freeze the candidate and review that target.
  Reuse only evidence whose inputs/identity remain valid; report FRESH versus REUSED with the applicable binding.
  Do not run the whole matrix after every moved constant.

## 6. Implementation slices

All proposed new paths are predictions and shown as code, not existing files.
The implementing agent is the integration owner for each slice; Maksym accepts consequential decisions.
Each slice includes the owner and its consumers, regression proof and necessary provenance/documentation in the same change.
No slice consists solely of adding unused shared helpers.

### SLICE-001: Load, map and write with one vocabulary

**Outcome:** DRY-001 and DRY-004 share vocabulary, graph-term membership and canonical entity declarations through the complete load/translate/store path.

**Likely seams:** Existing `internal/rdfjs/vocabulary.js`; predicted `internal/rdfjs/termPolicy.js` and `internal/mapping/entityDeclarations.js`; parser prefix records; the listed parsers, model factory and writers.
Prefer extending the existing dependency-free vocabulary before moving it.
Keep writer prefix preference policy local.

**Proof:** Existing graph-policy, forward/reverse mapping, round-trip, parser prefix and writer suites.
Add an independently specified six-entity round trip, reverse-only aliases, invalid graph term rejection and separate-prefix-instance case.
Inspect the import graph and packed artifacts so a data dependency does not eagerly load RDF/XML/N3 or Node-only modules.

**Dependency/recovery:** First production slice.
Revert owner and all consumers together; preserve public exports and emitted bytes.
No downstream repository edits.

### SLICE-002: Give XML entity defaults one executable owner

**Outcome:** DRY-002 gives manager-mediated parsing and direct XML preprocessing the same unchanged default record.

**Likely seams:** Predicted `internal/parsing/xml/xmlEntityDefaults.js`, loader configuration and XML entity policy.
Do not import the loader class into the entity module, which would risk a cycle.

**Proof:** Loader configuration and XML parser/entity tests plus the existing resource-policy governance assertion.
Exercise omission, explicit values, zero, exact boundary and boundary-plus-one for all four limits, including nested entities and multi-byte replacements.
Characterize explicit `undefined` and override spread behavior before changing construction; preserve actual existing semantics unless separately approved.

**Dependency/recovery:** Independent of SLICE-001.
Revert the three-file ownership change together.
Any changed limit or validation behavior requires a new policy decision.

### SLICE-003: Derive KRSS detection and parsing from the dialect inventory

**Outcome:** DRY-003 has one grammar membership source without widening either dialect.

**Likely seams:** Existing `krss/dialect.js`, detection and both parser adapters.
Preserve regex alternative ordering when it can affect a result; do not assume unordered sets imply interchangeable generated text.

**Proof:** `internal/parsing/krss/dialect.test.js` and both dialect detection/conformance/differential suites.
Use an independent positive/negative corpus covering all shared and exclusive keywords, capitalization, `.krss` versus `.krss2`, prefixes cut at the sniff limit and KRSS1-specific restrictions.
A test deriving both input inventory and expected membership from the new table is insufficient.

**Dependency/recovery:** Can follow either first slice.
The complete detector/classifier/parser migration is one reversible unit.

### SLICE-004: Share integer datatype facts between reconstruction and profiles

**Outcome:** DRY-005 has one bound table while both consumers retain their own algorithms.

**Likely seams:** Predicted `internal/model/integerDatatypeBounds.js`, reverse mapper, profile datatype/facet consumers.
Store canonical decimal strings and explicit unbounded sides; derive BigInt only for the existing bounded facts, not arbitrary caller strings.

**Proof:** Datatype/facet tests and reverse-mapping cardinality/conformance/resource tests.
Independently cover each of 13 subtypes at min/max and adjacent values, unrestricted integer, signed zero, leading/trailing whitespace, decimal/float cases that must remain separate, and very long lexical input.
Verify no new eager profile/XML dependency in mapper imports.

**Dependency/recovery:** SLICE-001 vocabulary is useful but not required.
Revert table and both projections together; do not rewrite expected Java differences.

### SLICE-005: Reuse XML name rules without collapsing name classes

**Outcome:** DRY-006 removes independently maintained Unicode ranges while entity names, writer NCNames and profile Name/NCName/NMTOKEN validation retain their distinct domains.

**Likely seams:** Existing `internal/parsing/xml/xmlNames.js`, entity policy and profile datatype predicates.
Prefer direct range predicates; use an existing native validator only if it expresses the complete current contract.
Avoid introducing a second XML parser.

**Proof:** XML parser/DOCTYPE, RDF/XML format/writer and profile datatype suites.
Boundary cases cover colon at first/interior positions, empty strings, digits, U+0300/U+036F, surrogate handling, supplementary ranges and invalid controls.
Compare minimized cases to the pinned independent reference where supported.
Measure long-name behavior under the existing resource policy.

**Dependency/recovery:** Independent of SLICE-004.
If XML Name and NCName semantics cannot be preserved with a precise interface, keep the distinct predicates and share only range facts.
Revert all consumers as one source unit.

### SLICE-006: Consolidate equivalent text-lexing and detection mechanics

**Outcome:** DRY-007, DRY-008 and DRY-009 are removed in small complete consumer migrations.

**Likely seams:** Predicted `internal/parsing/lexicalNames.js`, `iriCharacters.js`, `textCursor.js` and `leadingTrivia.js`.
Start with Functional/Manchester lexical predicates and Functional/OWL/XML IRI validation; then move the two equivalent descriptor families; finally try the shared cursor in one parser before migrating the other three.
Each subincrement must pass its complete parse/detection path before continuation.

**Proof:** Existing Functional/Manchester/DL/KRSS lexer, parser, conformance, differential and resource suites.
Add meaningful cases for CR, LF, CRLF, UTF-16 offsets, supplementary characters, escaped names, trailing dots, EOF, comments, ASCII versus Unicode whitespace and the 1,024-unit budget-check cadence.
Preserve error location and type, including interrupted scans.
Benchmark the cursor experiment using the current 20% wall/heap policy; reject extra abstraction if it fails without a new design.

**Dependency/recovery:** Prefer after SLICE-001 and SLICE-005 to avoid competing name owners.
Do not make XML Name predicates implement PN grammar by accident.
The cursor subincrement is independently reversible; no parser inheritance rewrite or public lexer API is planned.

### SLICE-007: Share the equivalent elapsed-work parser checkpoint

**Outcome:** DRY-010 centralizes the four equivalent text-parser checkpoint paths while preserving scheduling and budget semantics.

**Likely seams:** Predicted `internal/parsing/cooperativeCheckpoint.js`; DL, KRSS, Functional and Manchester parsers.
A per-operation instance owns last-yield state and accepts the correct budget checker.
Keep profile budgeting and differing RDF/XML scheduling separate.

**Proof:** Real long/deep parse, explicit deadline and timer-triggered cancellation tests in Node, Chromium, Firefox and WebKit where supported, including workers.
Exercise scheduler-present and fallback paths, no-yield fast path and recheck after yield.
Small injected clock/scheduler tests may isolate ordering, but do not replace real event-loop tests.
Preserve the current profile timer behavior with its existing budget regression as a guard.

**Dependency/recovery:** After SLICE-006 if both change the same parser state; otherwise keep disjoint changes.
Revert shared checkpoint and all migrated calls together.
A required scheduling policy change is outside this refactor.

### SLICE-008: Reuse shared RDF stream primitives

**Outcome:** DRY-011 removes duplicate chunk/drain/blank-node mechanics without unifying the two execution controllers.

**Likely seams:** Predicted `internal/parsing/rdf/streamPrimitives.js`; N3 and RDF/XML adapters.
Keep syntax implementation imports lazy and pass necessary parser/event interfaces without adapting them into a new generic parser facade.

**Proof:** Both real adapters' existing resource/conformance/browser suites.
Add split-surrogate chunks, nested quad blank nodes, backpressure then drain, error before drain, abort during drain and exactly-once cleanup.
Check the existing different timeout boundary comparisons with controlled clocks, and real cancellation with the native loop.
Verify no leaked listeners/timers or partial ontology publication.

**Dependency/recovery:** May proceed independently of SLICE-007; do not make it depend on a universal budget class.
Revert the adapter pair and helper together.
Defer any observed timeout inconsistency to an explicitly scoped behavior change.

### SLICE-009: Centralize exact CI runtime selections

**Outcome:** DRY-012 has one reviewed selector and reliable projections with the initial CI behavior unchanged.

**Likely seams:** Predicted `docs/release/runtime-policy.json` and `scripts/workflow-runtime-policy.mjs`; existing workflow governance, runtime assertion, CI qualification/reuse and affected workflows.
Record exact npm and Node values, canonical release lane and semantic roles.
Use the existing `yaml` dependency for a bounded field projection/check command, not search-and-replace across arbitrary YAML or a new template system.

**Design constraint:** Static workflow scalars remain generated representations.
The generator may change only the enumerated selection/setup/assertion/job-display fields; its check mode must report drift without rewriting.
Exact versions remain constrained by the separately reviewed producer policy.
`devEngines.packageManager.version` stays an eligibility floor; adding `packageManager` or changing that floor is not part of this slice.
Job IDs, initial display names, all required checks, action pins, permissions, cache policy, checkout identity, trusted/untrusted execution boundaries and release approvals stay unchanged.

**Proof:** Native actionlint, workflow governance and runtime/CI qualification tests; semantic before/after comparison of every workflow; negative projection and missing-job fixtures.
Rebind any workflow/policy digest used for evidence only through its approved producer.
Verify exact npm invocation on Windows and Linux using the existing native CLI resolution, without a broad shell command.
Hosted qualification follows normal authorized publication; do not manually dispatch it during planning.

**Dependency/recovery:** Obtain approval for the concrete CI/configuration proposal before edits.
This slice can be delivered independently from runtime refactors.
Revert policy, projections and validators together and use fresh qualification when prior evidence no longer matches.

### SLICE-010: Centralize exact uv selection

**Outcome:** DRY-013 makes bootstrap selection, root/scanner constraints and generated material metadata agree through one owner.

**Likely seams:** A dependency-free development-tool selection record; `scripts/repository-python-tools.mjs`, both `pyproject.toml` constraints and `util/generate-third-party-material.mjs`.
Reuse native uv validation for project/lock compatibility; do not invent a permissive TOML parser in the bootstrap.
Enumerated static constraints may be generated and checked like other native configuration projections.

**Proof:** Existing repository Python-tool tests, source-policy tests and `util/third-party-evidence/scancode-bootstrap.test.js`.
Wrong-version rejection, corrupted archive digest, absent tool, Windows/Linux path and environment isolation must retain their behavior.
Run native `tools:check`; run scanner build qualification only when its actual inputs change.
Existing locks, archive hashes and license records must remain byte-identical for this ownership-only migration.

**Dependency/recovery:** Independent of SLICE-009; share a projection technique only if it reduces real complexity.
Exact configuration changes need applicable approval.
Revert selection and its generated consumers as one unit; no tool installation/update is authorized by this plan.

### SLICE-011: Share the historical qualification contract

**Outcome:** DRY-014 makes the historical runner and verifier consume one trusted contract without changing the old candidate's expectations.

**Likely seams:** Existing `scripts/git-package-equivalence.mjs` or a narrowly named `scripts/pre-registry-qualification-policy.mjs`; qualification runner and its tests.
Prefer the existing owner unless separation materially improves independence and imports.

**Proof:** `scripts/git-package-equivalence.test.js` and `scripts/qualify-git-package-equivalence.test.js`, with independent five-export/four-test fixtures, missing and duplicate evidence, tampered identity and wrong-commit cases.
Exercise the retained historical verification path without rewriting retained evidence.
Expectations must never come from the package being examined.

**Dependency/recovery:** Independent of current runtime-policy work.
Revert both consumers together.
This grants no rerun of registry publication or historical release finalization.

### SLICE-012: Give evidence format metadata one owner

**Outcome:** DRY-015 centralizes manifest/shard filenames and appropriate registry identity without changing persisted evidence or validators' domains.

**Likely seams:** Predicted `util/third-party-evidence/format.js`; acquisition, merge, completion, promotion, parity and recanonicalization tools; existing `scripts/package-identity.mjs` for current OwlAPI release consumers.
Keep generic dependency evidence independent of the closed OwlAPI package coordinate.

**Proof:** Existing acquisition, evidence-manifest, evidence-shard, lock-graph, registry-signature and parity tests.
End-to-end local fixture acquisition/merge/verify exercises unchanged names and byte digests.
Negative URLs cover credentials, ports, query/hash, wrong origin, wrong scoped package and traversal according to each boundary's existing rules.
No live network operation or evidence promotion is needed merely to test a filename constant.

**Dependency/recovery:** Independent of SLICE-011.
No persisted format migration is expected; any proposed filename/schema/digest algorithm change forces re-planning.
Revert all affected tools together and retain original evidence.

### SLICE-013: Derive fixture generation from the suite inventory

**Outcome:** DRY-016 uses the existing format-scoped revision authority and one generator-only RDF tuple codec.

**Likely seams:** `docs/conformance/suites.json`, the existing W3C generator entry points and predicted `util/conformance/fixtureTerms.mjs`.
Source revision is selected by suite and format, not the first matching repository name.
Keep JSON-LD and RDF/XML source scopes distinct.

**Proof:** First verify the exact source manifests and their hashes are available; current archived manifests alone may not contain every original generator input.
In owned scratch, regenerate one syntax-only suite and one evaluation suite, then all affected outputs; compare deterministic bytes and complete classification/count inventories.
Cover nested quad encoding and literal direction.
Run the corresponding conformance suites with unchanged independent expected fixtures.

**Dependency/recovery:** Independent of production extraction.
Missing original inputs block regeneration rather than permit invented data.
Retain the original generated files and restore them through the existing generator/recovery route if any mismatch cannot be explained within scope.

### SLICE-014: Reuse benchmark machinery while preserving measurements

**Outcome:** DRY-017 gives governed run policy, equivalent sampling modes and each historical parser inventory one owner.

**Likely seams:** Existing `util/benchmarkEnvironment.mjs`; predicted `util/benchmarkSampling.mjs` and `util/benchmarkParserRegistries.mjs`; 14 benchmark entry points.
Use the current resource-budget document for warmup/measured-run policy.
Do not merge unrelated first-use, syntax-only, translation or profile observations.

**Proof:** Migrate one heap-only and one event-loop-aware benchmark first, compare report shape and sampling order with fixed observation inputs, then exercise real benchmarks against the same corpus/runtime.
Prove timer cleanup on failure and retain the current median convention.
Compare each historical descriptor sequence element-for-element to an independent recorded inventory; aliases between differently named phases require an explicit semantic rationale.
Observe the existing 20% regression policy without changing baselines to make the extraction pass.

**Dependency/recovery:** Keep separate from SLICE-007/008 when measuring their performance so a harness change cannot hide a product regression.
Freeze the harness before using its results for another slice.
Revert the harness and all entry-point migrations together; preserve earlier measured records.

### SLICE-015: Share browser bundle measurement

**Outcome:** DRY-018 gives the browser-cost tools one build/graph/size implementation with format-specific assertions.

**Likely seams:** The three existing `measure-owlapi-*-browser-cost.mjs` tools and predicted `util/browserBundleCost.mjs`.
Reuse any adequate owner found in the aggregate tool before adding a file.

**Proof:** Existing Vite build settings and real browser-cost probes; an independently constructed graph with static cycles, shared imports and lazy-only chunks validates closure and byte accounting.
Compare report keys and results from the old/new analysis over the same retained build output, then run a fresh build.
Demonstrate rejection when N3/RDF/XML enters the initial graph or the Node XML fallback appears in the browser artifact.

**Dependency/recovery:** Independent of production slices, but must be frozen before supplying their final bundle evidence.
Revert measurement consumers and owner together; a changed output schema requires a separate migration decision.

### Traceability and ordering

In this table, each number abbreviates the full prefixed ID from section 5; for example `REQ 1` means `REQ-001`.

| Slice     | Findings | REQ / AC   | QA      | DEC           | Demonstration and release/cleanup implication                                                   |
| --------- | -------- | ---------- | ------- | ------------- | ----------------------------------------------------------------------------------------------- |
| SLICE-001 | 001, 004 | 1, 2, 3, 6 | 1, 4    | 1–4           | Parse/map/store equivalence and package isolation; revert the whole vocabulary consumer set.    |
| SLICE-002 | 002      | 1, 2, 4, 6 | 3, 4    | 1–4           | Same XML defaults and boundary failures through public/direct paths; no policy-value migration. |
| SLICE-003 | 003      | 1, 2, 6    | 1       | 1–4           | Detector/parser agreement with independent dialect cases; no KRSS1 widening.                    |
| SLICE-004 | 005      | 1–4, 6     | 2, 3    | 1–4           | All integer subtype boundaries through mapper/profile consumers; preserve bounded validation.   |
| SLICE-005 | 006      | 1, 2, 4, 6 | 2, 3    | 1–4           | XML Name/NCName/NMTOKEN behavior at consumer boundaries; preserve entity/writer separation.     |
| SLICE-006 | 007–009  | 1–4, 6, 8  | 1–4, 8  | 1–5           | Syntax/location/resource parity and cursor cost; independently revert cursor subincrement.      |
| SLICE-007 | 010      | 1–4, 6, 8  | 3, 4, 8 | 1–5           | Real event-loop cancellation and scheduling parity; preserve profile timer policy.              |
| SLICE-008 | 011      | 1–4, 6, 8  | 3, 4, 8 | 1–5           | Stream/backpressure/abort behavior and cleanup; no universal controller.                        |
| SLICE-009 | 012      | 1, 5–8     | 5, 6    | 4, 6–8        | Static workflow projection plus hosted qualification when authorized; stale proof fails closed. |
| SLICE-010 | 013      | 1, 5–8     | 5, 7    | 4, 7, 8       | Native uv constraints and bootstrap isolation; no lock/license/tool version changes.            |
| SLICE-011 | 014      | 1, 5–7     | 6       | 1, 3, 4, 8    | Historical negative qualification; never mutate original release evidence.                      |
| SLICE-012 | 015      | 1, 4–7     | 5–7     | 1, 3, 4, 8    | Fixture evidence lifecycle and hostile URL rejection; no persisted format migration.            |
| SLICE-013 | 016      | 1, 2, 6–8  | 7       | 1, 3, 4, 7, 8 | Exact-source regeneration and byte comparison; retain originals until proof completes.          |
| SLICE-014 | 017      | 1, 6–8     | 7, 8    | 1, 3, 4, 8    | Stable measurement/report semantics; freeze harness separately from measured product changes.   |
| SLICE-015 | 018      | 1, 3, 6–8  | 7, 8    | 1, 3, 4, 8    | Same-output bundle analysis and lazy-boundary checks; no schema drift.                          |

Recommended order: SLICE-001–005 first; SLICE-006, then 007; SLICE-008 after the relevant vocabulary boundaries are stable.
Tooling slices 009–013 can proceed as separate source changes with their own complete evidence.
Freeze or retain the old measurement tools while qualifying production slices; migrate 014/015 separately.

Semantically independent work includes XML defaults versus KRSS vocabulary, and runtime parser work versus the historical qualification policy.
Overlapping parser, vocabulary, workflow and provenance edits need one integrator and sequential integration.
This dependency map does not authorize parallel agents or concurrent writes.

## 7. Verification and oracle ownership

### Focused and affected checks

Use existing colocated Jest suites through `npm test -- --runInBand --runTestsByPath <verified paths>`.
The names below are current entry points; choose the complete impacted set at implementation admission rather than treat these examples as full coverage:

- Vocabulary/RDF mapping: `internal/rdfjs/graphPolicy.test.js`, the `internal/mapping/*` conformance/round-trip/resource suites, writer suites and `coreIsolation.architecture.test.js`.
- XML defaults/names/datatypes: `io/io.test.js`, `internal/parsing/xml/xmlParserAdapter.test.js`, `formats/rdfXMLDocumentFormat.test.js`, `internal/storage/rdfxml/rdfXmlGraphWriter.test.js`, `internal/profiles/datatypes.test.js`, `internal/profiles/budget.test.js` and relevant model/profile tests.
- Lexers/detectors/checkpoints: affected `internal/parsing/{functional,manchester,dl,krss,krss1,krss2,owlxml}` suites, including conformance, differential and resource cases; changed RDF descriptors need their format suites too.
- Streams: `internal/parsing/rdfxml/rdfXmlSyntaxAdapter.test.js`, its resource suite, all affected N3 format suites and their browser cases.
- Tooling: `scripts/assert-workflow-runtime.test.js`, `scripts/workflow-governance.test.js`, CI qualification/verification tests, the two Git/package equivalence suites, `scripts/repository-python-tools.test.js` and affected `util/third-party-evidence` tests.

Actual typed failures, metadata, canonical structures and byte protocols are the assertions.
Do not add tests that only check that a consumer imported the new constant.
A bounded structural audit may verify the single-owner objective, but it does not replace behavioral proof.

### Installed HISEW profiles observed for this worktree

| Profile    | Current commands                                                                                                                                                                    | Limits of its coverage                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `focused`  | `npm run test:boundary`; Jest `governance.test.js` and `io/io.test.js`                                                                                                              | Does not cover the parser/profile/stream refactors by itself.                                                                         |
| `affected` | `npm run lint`; `npm run test:boundary`; Jest governance, `io/`, `model/`, `internal/model/`, `internal/storage/`, `test/import-closure/`, `test/consumers/webvowl/cutover.test.js` | Additional parsing, profile, mapper and tooling suites must be selected for this plan.                                                |
| `full`     | `npm run lint`; `npm run format:check`; `npm run verify:release-gates`; `npm run verify:workflow-governance`; `npm run test:boundary`; `npm test -- --runInBand --silent`           | Does not itself establish hosted CI, real installed-browser execution, current Java execution, performance acceptance or publication. |

The engine reported undeclared command-input semantics, so input ordering/coverage is not independently verified just because a command resolves.
Reinspect these profiles at admission.
Do not change their configuration silently.
An inadequate timeout, prerequisite or profile requires a concrete approved adjustment or separately retained supplemental check; a timed-out or skipped run is not a pass.

### Independent and final proof

1. **Semantic oracle:** Retain pinned W3C fixtures, normative classifications and the pinned Java reference for its supported common domain.
   Existing approved exceptions remain bounded; no latest upstream ref is substituted.
   Test rejected inputs as well as successful results.
2. **State/resource oracle:** Independently specify boundary values and observable cleanup.
   Mock only genuine external retrieval or deliberately controlled scheduler/clock/event boundaries.
   Real parser, mapper, profile and browser work remains in the integrated tests.
3. **Installed artifact:** Pack/install the actual frozen candidate through existing producer commands, then exercise all current public subpaths, import purity, no-network behavior and included private module closure.
   Existing architecture scans do not cover every shipped namespace, so package-boundary and installed-consumer evidence is necessary.
4. **Real browser proof:** Prepare the candidate fixtures through `npm run browser:prepare -- --candidate <candidate-directory> --output <owned-fixture-root>`, then run `npm run test:browser -- --fixture-root <owned-fixture-root> --project <configured-project>` for affected configured browser projects.
   Record bundle, import-map and worker modes; a Jest file containing “browser” is not proof of a real browser run.
5. **Performance:** Use [the current policy](../performance/resource-budgets.json): one warmup, five measured runs, median, at most 20% wall-time and peak-heap regression for applicable paired cases.
   Record exact fixture/runtime/lock identities.
   Existing first-use, memory and event-loop limits remain additional constraints.
   Unavailable or noisy comparable evidence is an explicit open result, not invented zero regression.
6. **Workflow/evidence trust:** Run native workflow syntax checks, governance and adversarial identity/coverage cases.
   Preserve the current reuse policy, exact commit/tree/parent/run-attempt bindings and fresh fallback.
   A shared selector must not let a produced receipt redefine the expected runtime or policy.
7. **Final assurance:** Finish cheap checks and formatting, freeze the complete candidate including relevant untracked paths, run missing route-required verification, then resolve and invoke authorized ordinary/independent/security reviewers against that exact target.
   Retain their actual coverage and findings.
   Reassess evidence after any repair; do not repeatedly review unchanged code.

Native capability discovery/resolution belongs at the required review/commit operation, with current exposed tools, effective restrictions, explicit authority and frozen target.
Planning-time installed-provider observations do not establish availability or authorization for a later execution.

## 8. Compatibility, provenance, rollout and recovery

**Data/schema compatibility:** No ontology transformation, backfill, stored-file migration, public option change or package-export change is intended.
Evidence filename/schema versions, canonicalization, report keys and historical benchmark labels remain stable.
If consolidation requires any of these to change, return to the owner with the concrete migration and revised criteria before implementation.

**Provenance and rights:** Reuse local implementations and existing libraries.
For moved source, update live provenance/consumer inventories where required while preserving historical records and source attributions.
Do not edit third-party archives, locks or past receipts to make an ownership change appear qualified.
A generator/source digest that truly changes needs new evidence; a historical digest remains history.

**Observability:** No production telemetry service is added.
Retain diagnostic classes/details, source positions, effective limits, policy/runtime identities, resource exhaustion, cancellation/cleanup observations, benchmark measurements and generated-artifact hashes in existing test/report channels.
User ontology contents need not be uploaded for this work.
The observer must be able to distinguish semantic drift, tool selection drift and unavailable evidence.

**Rollout:** Integrate and qualify complete slices.
An accepted first commit point should retain the reviewed plan before broad source refactoring; actual commit/message/publication authority is obtained through the normal route.
No feature flag or parallel legacy implementation is necessary for an equivalent private extraction.
Producer-owned source/package/browser/security/performance qualification precedes any separately authorized release.
Consumer adoption or production deployment in WebVOWL/UO is a separate task and is not an OwlAPI release prerequisite.

**Abort conditions:** Stop the affected slice on grammar/output/diagnostic drift, a widened validation domain, shared mutable state, a new dependency cycle/eager parser import, missing original generator inputs, weaker evidence validation, or failure of the existing performance/resource policy.
Retain the failing input and exact candidate; do not weaken the oracle or limits.
Continue unrelated authorized slices only when their evidence and source ownership remain independent.

**Recovery:** Before publication, restore/revert the complete slice with its consumers, generated projections and live provenance updates.
Rerun affected proof against the restored candidate.
After publication, do not overwrite an immutable version or tag; the owner chooses an authorized forward fix or consumer rollback to retained known-good artifacts.
The implementing agent observes tests and hosted checks when authorized; Maksym owns release/rollback acceptance and affected downstream owners own deployment recovery.

**Interruption/resumption:** The implementation handoff records accepted plan revision, base/head/tree identities, completed slices, outstanding findings, changed/untracked files, test/report identities and resource owners.
Recheck them before resuming.
Reuse evidence only where applicability and identity remain valid.
A previous passing run does not cover new projections or changed semantic helpers.

**Resources and cleanup:** Resolve the active HISEW storage before the first supplemental implementation artifact.
Allocate/register owned groups only after execution admission, with bounded budgets and named consumers; use supported inventory/disposition operations at review and handoff.
Benchmark reports, verified regeneration inputs and comparison manifests remain until their consumers release them.
Clean only declared scratch after retained evidence is verified.
Do not clean old feedback work, unrelated `.release` contents, other worktrees or sibling checkouts as part of this plan.

## 9. Re-planning triggers and completion criteria

Re-plan when:

- a proposed common owner must accept two materially different contracts without an explicit distinction;
- current defaults, public semantics, error behavior, resource/cancellation policy, CI checks, publication controls or oracle expectations would change;
- new dependencies, public exports, aliases/shims, alternate runtimes or platform requirements become necessary;
- a shared module creates a cycle, eager parser load, package omission or measurable regression beyond the current policy;
- original source artifacts cannot reproduce deterministic fixture output;
- generated configuration cannot preserve job identities or trusted execution boundaries;
- a changed workflow/policy/input invalidates proof reuse and the required fresh evidence is unavailable;
- the baseline advances in an affected module, or an accepted defect repair overlaps this work.

The minimum resolving evidence is a concrete consumer trace or minimized case, the changed contract and responsible owner, an alternative with compatibility/recovery consequences, and updated REQ/AC/QA/DEC/slice links.
Do not expand this DRY programme into a general semantic repair or repository renaming exercise.

Implementation is complete only when all accepted groups have one justified owner or an owner-accepted distinct-policy disposition, every implemented slice meets its acceptance criteria, the final candidate has current required evidence and review, and resources have a truthful handoff.
Fewer lines alone are not success.

For this planning task, completion is the source-backed inventory, reviewable draft and document validation.
Runtime refactoring, tests of a changed implementation, CI, merge, deployment and release remain unperformed.

## 10. Owner-approved implementation adjustments (2026-10-11)

The owner authorized implementation after this planning baseline and approved these bounded repairs when fresh bundle evidence exposed pre-existing probe defects:

- Retain entry exports with `preserveEntrySignatures: "strict"`; the application-style entry previously emitted an empty bundle.
  Compare original and extracted analysis against the same retained build with this setting.
- Recognize the installed N3 parser module paths as well as the historical browser bundle path.
  Change Turtle storage's eager Writer import to a dynamic import immediately before Writer construction in the existing asynchronous render method; verify storage and real browser behavior.
- Report bundled XML support separately in the RDF/XML cost probe. The existing XML writers require `@xmldom/xmldom`, so its presence cannot identify an unwanted parser fallback. Continue to reject an eager RDF/XML parser and demonstrate that rejection with a retained-build negative control.
  This replaces the blanket XML-package rejection in SLICE-015; it does not certify that the browser artifact excludes the Node fallback implementation.

The RDF/XML report's `checks.bundledNodeXmlFallback` key becomes `checks.bundledXmlSupport` under this explicit policy correction.
Old and new analysis are compared under the same approved policy.
Other report keys, graph accounting, parser lazy-loading checks and production storage output remain covered by the original acceptance criteria.
