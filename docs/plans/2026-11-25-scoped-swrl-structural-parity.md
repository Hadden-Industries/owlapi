# Preserve SWRL rules from CLO, FOVT and VBO in OwlAPI 0.1.0

**Prepared 25 November 2026 · Maintainer decision recorded 26 November 2026 · HISEW R2 proposed.**
Add a structural SWRL subset to the explicit `java-owlapi-5.5.1` behavior profile.
Applications must be able to load, inspect, compare and save the rules covered here.
Accept the change when the installed JavaScript candidate exposes all 77 rule occurrences and the complete ontologies match Java on the three original files.
If a document contains an unsupported SWRL rule, the named Java-compatible loader must reject the entire document and identify the unsupported construct.
[Accepted owner decision](#owner-decision) The implementation estimate is 3–6 engineering days, plus hosted qualification time.

## Why this belongs in the release discussion

OwlAPI is an independent JavaScript library for Node and browsers.
Java OWLAPI 5.5.1 is a development reference.
SWRL, the Semantic Web Rule Language, expresses implications.
A rule has a body of conditions and a head of conclusions.
An atom is one such condition or conclusion.
A structural API can preserve a rule, answer questions about it and write it back without inferring a single new fact.

The published rc.3 contract and the 0.1.0 reconciliation defer the entire SWRL family.
The model explicitly ties promotion of SWRL kinds to equality, dispatch, construction, parsing and differential proof.
This proposal amends that decision for the subset below.
Today a compatible load can succeed and save an ontology that has lost a constraint a downstream SWRL-aware tool could use.
Merely documenting the gap would leave that outcome in place.
General SWRL authoring, rule execution and a new default language profile have separate release value and cost.
[Existing release scope](2026-10-29-0.1.0-release-reconciliation.md) · [Public model decision](../../model/kinds.js) · [Behavior profiles](../compatibility/behavior-profiles.md)

The evidence was collected on 25 November from the installed `@hadden-industries/owlapi@0.1.0` candidate with tarball SHA-256 `a5ed444d3ae8262df985053ec65a824b811b56f2f0a86907f0c28604df6b5c55`, Windows x64, Node `26.13.1`, Temurin `25.0.5.1+2-LTS` and released OWLAPI `5.5.1.2024-09-07T21:41:32Z` (Git `f760b3a4c107c6d5f90f856e5680c39b18af646f`).
The planning checkout is `zero-one-zero` at `7f197e88b2d21d69b15b42a0f25b776d574c944b` with existing uncommitted workbench changes.
The tarball identifies what was tested.
A branch name or a later rebuild cannot substitute for it.
[Retained measurement and comparison evidence](../performance/2026-11-25-six-ontology-memory.json)

### What the three comparisons found

Each input is a pinned, directly loaded OBO RDF/XML document.
In OWLAPI Functional Syntax `DLSafeRule` is the spelling used to carry a SWRL rule.
Rule execution and OWL language-profile membership each require their own evidence.
Java and JS received identical bytes and the same logical document IRI, with zero mapped imports and zero network attempts.
The Java profile's compatible load completed on each side.
Java reparsed the JS Functional Syntax output.
Ontology IDs, direct imports and ontology-level annotations agreed.
Every Java-only axiom was a `DLSafeRule`.
Every JS-only ground axiom was a class assertion about a SWRL variable.
Every extra anonymous graph contained SWRL structure.

| Input | Publisher version |      Bytes | Direct axioms Java / JS | Rules Java / JS | JS-only variable assertions / anonymous groups | Annotated rules / rules with multiple conclusions |
| ----- | ----------------- | ---------: | ----------------------- | --------------- | ---------------------------------------------- | ------------------------------------------------- |
| CLO   | 2026-06-19        | 37,965,858 | 306,182 / 306,248       | 4 / 0           | 2 / 20                                         | 0 / 0                                             |
| FOVT  | 2026-03-19        | 43,834,846 | 181,310 / 182,289       | 48 / 0          | 43 / 284                                       | 28 / 4                                            |
| VBO   | 2026-11-17        | 65,043,359 | 267,744 / 268,257       | 25 / 0          | 24 / 149                                       | 13 / 2                                            |

These are occurrences across the three documents.
The same logical pattern can appear in more than one document.
An anonymous group can contain several statements, so its count cannot be added to a ground-axiom count.
Total axiom counts alone conceal the failure.

- **CLO.**
  If X has characteristic Y and Y is a role, X has role Y.
  The source uses `RO_0000053`, `BFO_0000023` and `RO_0000087`.
  Three companion rules specialize the same relation for disposition, quality and function.
  In a 2,594-byte reduction with one rule, both engines loaded the file.
  JS emitted 22 axioms, including ordinary assertions about variables, atoms and list nodes.
  The compatible loader reported `RDF_UNCONSUMED_OWL_TRIPLE` for all three `rdf:first` and three `rdf:rest` links.
  Its Functional model contained zero list links and zero rules.
  The 458-byte declarations-only control matched exactly.
- **FOVT and VBO.**
  Both contain a rule linking an enabling relation through a part-of relation to involvement in a biological process.
  They also encode constraints on overlap and causal ordering using two `owl:Nothing` conclusions.
  Several rules carry labels, comments and a typed boolean `swrla:isRuleEnabled`.
  FOVT has 21 labeled rules, 14 with comments and three with the flag.
  VBO has 11 labeled rules, six with comments and two with the flag.
  These groups overlap.
  Preserve the annotation value independently of rule execution.
- **Extent.**
  A separate RDF graph traversal found 4 class and 8 property atoms in CLO, 28 and 138 in FOVT, and 15 and 72 in VBO.
  The 12, 166 and 87 list cells, respectively, were explicitly typed `swrl:AtomList`.
  Each list terminated in `rdf:nil`.
  Each cell occurred in only one list position in these rules.
  All 77 rule subjects are anonymous.
  Across the 253 atoms every predicate is named, every argument is a declared variable with its own full IRI, and every head variable occurs in its rule's body.
  No rule requires a built-in, a data atom, an anonymous class expression, an inverse predicate, an individual constant or a literal argument.
  Annotation literals are a different role from rule arguments.
- **Load modes.**
  All three inputs exceed the normative default 32 MiB input budget.
  In an explicit Java-profile strict run CLO first refused `swrl:body`; FOVT and VBO first refused an unrelated `RO_0002582` statement.
  Compatible retries used fresh managers.
  Changing the strict results on all three or raising a default limit would answer a different question.

The complete source identities below permit reproduction with a clean checkout and the fixture catalogue.
Local diagnostic directories are optional.
The case IDs correspond to the direct Java-compatible, compatible-parsing, recorded-import selection.
Subsequent executions bind their own candidate and harness.

| Input and logical IRI                            | Publisher RDF/XML SHA-256                                          | Case ID                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| CLO · `http://purl.obolibrary.org/obo/clo.owl`   | `64b8167d3bdf789d902906053fcec29c0644d34e22378032fa0d2e03915d8920` | `96a701a20c8a29d0f2e9a4bb9c832777669cb983fc0e23af3e4e1eb5cc370d99` |
| FOVT · `http://purl.obolibrary.org/obo/fovt.owl` | `b533c22ddc907b2ee050dd543f474b3c13d2f38c66c1b375b878f7897808f038` | `88bdd784f3c38da019d12562ee441abc4fa7bd95e73b6464a05c60fe57529dea` |
| VBO · `http://purl.obolibrary.org/obo/vbo.owl`   | `1375af3c0aac025f38c0a8767d0896a4ed189f290041eb58443d22f990b8b157` | `a45816d42c86d787780aa5370afba26ece346a94f7dec19c990fc9c5bc732d37` |

### What Java reads and why

The two implementations run independently.
The workbench obtains its expected ontology by loading the original in Java.
JS loads the original and serializes its in-memory model to OWL Functional Syntax.
A fresh Java reader loads that OWL document, giving Java's structural comparator two ontology objects.
It compares axioms, annotations, identities, imports and blank-node sharing.
It never executes JavaScript.
A separate JS assertion must inspect `getAxioms()` before any save, because an output-only test could pass if a writer copied source bytes around an incomplete public model.

This precedent shipped in `v0.1.0-rc.3`.
The July tests passed JS-written per-document Functional Syntax and merged closure outputs to Java.
The shared runner already uses Functional Syntax for ordinary direct-load comparisons.
Use that path on the three originals.
Exercise RDF/XML output and a fresh JS reload on small fixtures, with an independent Java read of a representative saved RDF/XML fixture.
Keep July's separately qualified closure checks intact.
[Tagged rc.3 JS producer](https://github.com/Hadden-Industries/owlapi/blob/v0.1.0-rc.3/util/owlapi-reference/qualify-universal-ontology.mjs#L707) · [Tagged native comparison](https://github.com/Hadden-Industries/owlapi/blob/v0.1.0-rc.3/util/owlapi-reference/OntologyReferenceContract.java#L171) · [Current JS worker](../../util/owlapi-reference/run-comparison-js.mjs) · [Current Java worker](../../util/owlapi-reference/RunOntologyComparisonCase.java)

## Proposed release contract

**OUT-001.**
A Node or browser consumer using the named Java profile can inspect the original implication, retain it across an unrelated ontology edit, save it and hand the result to another OWL consumer.
The release maintainer measures this for the installed candidate before handoff.
The baseline is zero preserved rules in the three JS outputs.
The target is 4, 48 and 25 preserved rules with zero unexplained structural differences.
A JVM, network service or rule engine in the library would defeat the portable use case.

| Requirement and decision                                                   | Acceptance and quality scenario                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **REQ-001 · Canonical rule values** (DEC-001, DEC-002)                     | **AC-001 / QA-001.** A supported rule is one logical axiom in the direct JS model. Its body, head, predicates, positional arguments, full variable IRIs and axiom annotations are inspectable. Ordinary class/property assertions about its RDF encoding disappear. A declarations-only control retains its original three axioms.                                                                                 |
| **REQ-002 · Identity and normal ontology operations** (DEC-002, DEC-004)   | **AC-002 / QA-002.** Reordering or repeating atoms on one side preserves equality and deduplication. Moving an atom to the other side, swapping unequal property arguments, changing a variable IRI or dropping a rule annotation changes full structural identity. Test annotation-insensitive comparison separately, and removal, re-addition, visitor dispatch and signature queries through public boundaries. |
| **REQ-003 · Read and write the same ontology** (DEC-001, DEC-003)          | **AC-003 / QA-003.** Fresh managers read the supported subset from RDF/XML and Functional Syntax. JS-to-JS round trips in both formats and the fixture Java reparse preserve the annotated rule after an unrelated edit. Include multiple body and head atoms, `owl:Nothing`, distinct IRIs sharing the same fragment, and first-encounter iteration order.                                                        |
| **REQ-004 · Explicit boundaries and recovery** (DEC-001, DEC-004, DEC-005) | **AC-004 / QA-004.** An unsupported rule rejects its entire document. The diagnostic identifies the unsupported construct, and the manager exposes no partial ontology. Malformed RDF lists and Functional Syntax exercise existing typed failures. Cancellation and writer failures obey the owning profile's publication contract. A subsequent valid load in a fresh manager succeeds.                          |
| **REQ-005 · Candidate and corpus proof** (DEC-006)                         | **AC-005 / QA-005.** All three pinned originals pass the named structural comparison on the same installed tarball. The controls still disagree after a deliberate relevant change. Prior limitations, alternative profiles, ordinary non-SWRL documents, the package boundary and Node/browser behavior remain distinguishable in evidence.                                                                       |

### DEC-001 · Limit the extension by behavior and syntax

The target is the named Java profile.
The guarantee covers RDF/XML **compatible parsing** and Functional Syntax `DLSafeRule` with explicit `Body(...)` and `Head(...)`.
A named class atom has one variable.
A named object-property atom has two positional variables.
Recognized, direct **literal-valued** rule annotations use the existing OWL annotation and literal representations, including datatype and language identity.
The subset works on any matching input.
The source filenames, OBO terms, observed counts, annotation vocabulary and variable names are examples, never admission conditions.

The SWRL text is a W3C Member Submission.
The OWL 2 Recommendation's axiom grammar does not contain SWRL.
The project freezes `normative-v1`, including its existing source-mode behavior.
Java 5.5.1 registers its RDF SWRL handlers in non-strict mode.
Keep explicit strict and preserve probes independent of compatible results.
The Java Functional grammar accepts empty explicit groups.
On compatible RDF the reference uses empty sets for absent sides.
Verify these on declared, tiny fixtures.
A missing Functional `Body` or `Head` is a syntax error.
The native structural factory permits variables confined to the head.
Preserve structural behavior without introducing a rule-safety validator.
[SWRL submission](https://www.w3.org/submissions/SWRL/) · [OWL 2 axiom grammar](https://www.w3.org/TR/owl2-syntax/#Axioms) · [Native RDF mode selection](https://github.com/owlcs/owlapi/blob/f760b3a4c107c6d5f90f856e5680c39b18af646f/parsers/src/main/java/org/semanticweb/owlapi/rdf/rdfxml/parser/TripleHandlers.java#L273) · [Native rule translation](https://github.com/owlcs/owlapi/blob/f760b3a4c107c6d5f90f856e5680c39b18af646f/parsers/src/main/java/org/semanticweb/owlapi/rdf/rdfxml/parser/Translators.java#L1670) · [Native Functional grammar](https://github.com/owlcs/owlapi/blob/f760b3a4c107c6d5f90f856e5680c39b18af646f/parsers/src/main/java/org/semanticweb/owlapi/functional/parser/OWLFunctionalSyntaxParser.jj#L1013)

Built-ins, data-property/data-range atoms, same/different-individual atoms, constants, arbitrary class expressions, inverse predicates, nested and IRI-valued rule annotations, general public factories/Java visitor families, rule execution and new syntax families remain deferred.
A separate language-profile question is whether an ontology passes an OWL profile check.
The tagged Java profile visitor flags SWRL for EL/QL/RL and has no rule-specific DL violation.
Use a declared native witness to establish the named Java DL result and a separate normative grammar witness.
A successful syntax load cannot imply normative OWL 2 DL conformance.
[Java profile visitor](https://github.com/owlcs/owlapi/blob/f760b3a4c107c6d5f90f856e5680c39b18af646f/api/src/main/java/org/semanticweb/owlapi/profiles/ProfileVisitor.java#L426) · [Local profile contract](../compatibility/0.1.0-contract-scope.md)

### DEC-002 · Separate set identity from encounter order

Treat each side as a set of atoms with first-encounter iteration order.
The sides have distinct roles.
Hashing, equality and ontology membership must agree on their unordered contents and rule annotations.
Property argument positions and variable IRIs retain their meaning.
Represent a variable as a SWRL structural value.
Its IRI must stay out of the individual and OWL entity signature solely by virtue of its use as a variable.
Named predicates and annotation vocabulary contribute according to existing signature rules.
The rule node's RDF identifier and list-cell blank-node labels are serialization details.
Use immutable structural values that existing model consumers can inspect and mutate through normal axiom operations.
Keep general public rule construction for the later capability.
[Tagged rule implementation](https://github.com/owlcs/owlapi/blob/f760b3a4c107c6d5f90f856e5680c39b18af646f/impl/src/main/java/uk/ac/manchester/cs/owl/owlapi/SWRLRuleImpl.java#L99) · [Upstream ordering tests](https://github.com/owlcs/owlapi/blob/f760b3a4c107c6d5f90f856e5680c39b18af646f/contract/src/test/java/org/semanticweb/owlapi/api/test/swrl/SWRLAtomOrderingRoundTripTestCase.java)

### DEC-003 · Reuse the parser, model and storage owners

Use the existing Node and browser RDF/XML reader for bytes, XML, base IRIs, limits and RDF terms.
Its quads already reach the shared RDF-to-OWL translator.
Recognize a rule and reserve its structural statements **before** generic assertion recovery.
Stage the complete rule and the set of claimed source rows together.
Use the existing indexed read view, list traversal, term-role evidence, annotation conversion and transaction.
A valid shared variable can serve several rules.
Claim its declaration without swallowing independently meaningful ordinary triples.
A failed or cancelled rule must not consume a valid sibling's rows or leave a half rule or stale indexes.
Emitting a collection of ordinary assertions, or storing an opaque RDF side record, cannot satisfy the public model contract.

The existing list reader checks cardinality, cycles, shared tails, configured limits and cooperative progress.
It marks cells while traversing and has a compatible non-nil terminator recovery.
Carry a cyclic list and a crossed/shared tail through the *new caller*; establish the applicable behavior with the native witness before changing any ownership rule.
Honor existing independent annotation-loading settings.

**Shared-list decision, 26 November 2026.** Apply the repository's normative authority hierarchy to this edge of the named extension. RDF graphs can express branching collections. OWL 2 reverse mapping §3, Table 3 requires disjoint cells for distinct maximal list matches and distinct cells within a match. SWRL is a Member Submission outside the OWL 2 axiom grammar. It assigns separate meanings to the body and head, and an empty body makes a rule unconditional. The project adopts the OWL structural list constraint for this extension. Reject cycles and overlapping tails with the existing list syntax error. If both sides reference the same complete validated list, retain every atom in both roles. The generic OWL list reader and the normative profile retain their existing scope. The native crossed-tail fixture lost its body, whereas the identical-head fixture retained both roles. A source graph with distinct lists remains the writer's portable output.
[Authority hierarchy](2026-10-13-java-compatible-api-behavior-implementation-plan.md#authority-and-profile-contracts) · [OWL 2 reverse mapping §3](https://www.w3.org/TR/owl2-mapping-to-rdf/#Mapping_from_RDF_Graphs_to_the_Structural_Specification) · [RDF 1.1 collections](https://www.w3.org/TR/rdf11-mt/#rdf-collections) · [SWRL submission §§2–3, 6](https://www.w3.org/submissions/SWRL/)

Reuse existing writer allocation for RDF lists and the Functional lexer, parser and renderer for terms and annotations.
Render from the captured model so edits are reflected.
Require the reference workbench to observe the same public reconstruction as package consumers.

RDF/XML and Turtle share the reverse mapping.
Turtle, TriG, N-Triples, N-Quads and JSON-LD can also reach the shared forward reconstruction.
Exercise a small Turtle witness and an ordinary sibling-syntax control wherever a shared path changes.
A format unsupported for a rule, especially OWL/XML or Manchester input, must return its existing typed unsupported outcome where applicable.
Respect ordinary profile-specific target handling on save, including previously written data and stream/append failure behavior.
In a normative manager handed a canonical rule by explicit mutation or merger, preserve existing value-sharing and destination ownership rules, and fail an unrepresentable export at its storage boundary.
Only the two promised formats carry new release claims.
[RDF reader and transaction](../../internal/mapping/rdfToOwlTranslator.js) · [RDF writer](../../internal/mapping/owlToRdfTranslator.js) · [Storage self-check](../../internal/storage/rdfStorage.js) · [Storer publication](../../internal/storage/storerRegistry.js)

### DEC-004 · Preserve exhaustive visitors for rc.3 callers

A handler table exhaustive for the rc.3 domain must still dispatch pre-existing objects, under either behavior profile.
Today `dispatchAxiom` and `dispatchOwlObject` validate the entire respective list before invoking any handler.
Simply extending the required list would break existing callers even on an ordinary class or axiom.
The existing release contract already settles this choice in favor of compatibility.

Give SWRL-aware consumers an explicit extended kind domain using the same canonical values and dispatcher validation.
Require complete handlers within each chosen domain.
An old table presented with an actual SWRL value must get a clear error.
Test a literal rc.3 table on an old value, a table derived from the extended domain on a rule and an old table missing an old handler.
The last must still fail its original exhaustiveness check.
Keep the legacy domain and supported extended domain explicit in the API inventory and migration note.
Private names and decomposition remain open.
If a public-boundary probe shows this requires a substantially wider API than the subset, bring that evidence to the owner before changing the rc.3 contract.
[Dispatch owner](../../model/dispatch.js) · [Public kind domains](../../model/index.js) · [Existing exhaustiveness tests](../../model/dispatch.test.js)

## Owner decision

**DEC-005 · Reject the whole document when a rule is unsupported. Accepted by the maintainer on 26 November 2026 for v0.1.0.**

On the enabled `java-owlapi-5.5.1` read path, a well-formed SWRL rule outside the supported subset rejects the affected document as a unit.
For example, if a file contains ten supported rules and one rule with an unsupported built-in, the load fails.
The parser reports `UNSUPPORTED_CONSTRUCT` and identifies the offending rule or atom where available.
The caller receives no partial ontology, including when optional warnings are disabled.
Malformed syntax follows its existing typed error path.
The unit of rejection is the affected document.
The manager's existing import policy governs other documents in the same operation.

The maintainer accepted the loss of read access to ordinary axioms in a mixed-rule file so a subsequent save cannot silently omit the unsupported rule.
Keeping the file partially readable would require carrying an incomplete-result marker through edits and merges and guarding export.
Existing per-document parse metadata describes the completed parse and cannot certify a changed model.
All 77 rules in the three target files fit the supported subset.
[Parser error contract](../../io/errors.js) · [Metadata contract](../compatibility/rdf-parser-metadata.md)

## DEC-006 · Software selection, rights and proof ownership

Research on 25 November followed the input from the Node/browser package reader to the structural API, and the serializer back to an independent reader.
OwlAPI owns recognition and construction of the supported rules, their structural semantics and faithful serialization.

| Candidate or existing authority                  | What it supplies and disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rdfxml-streaming-parser@3.3.0` and `n3@2.13.12` | The pinned MIT-licensed packages match the current stable registry versions checked for this plan. The first already reads RDF/XML and the second supplies Turtle/RDF terms through existing adapters. The package, lock and browser provider boundaries already cover those deployments. Reuse their public parsers and current RDF/JS data model. Neither parser supplies OwlAPI rule objects, ownership or equality. No provider upgrade or import-map refresh follows from this selection. [RDF/XML package](https://github.com/rdfjs/rdfxml-streaming-parser.js/blob/v3.3.0/package.json) · [N3.js package](https://github.com/rdfjs/N3.js/blob/v2.13.12/package.json) · [Local manifest](../../package.json) |
| Java OWLAPI 5.5.1                                | The released Java profile fixes the version, even if another upstream release appears. Its public structural model, fixture observations and annotated round-trip tests establish the reference behavior. Its JVM distribution remains a test dependency. Upstream has previously fixed loss of SWRL annotations. [Reference identity](../compatibility/profiles/java-owlapi-5.5.1/provenance.json) · [Round-trip tests](https://github.com/owlcs/owlapi/blob/owlapi-parent-5.5.1/contract/src/test/java/org/semanticweb/owlapi/api/test/ontology/SWRLRoundTripTestCase.java) · [Annotation issue 292](https://github.com/owlcs/owlapi/issues/292)                                                                 |
| Protégé SWRLAPI                                  | Its Java bundle depends on the Java OWLAPI and supplies rule/query-engine facilities. Adopting it would introduce a JVM or service into the Node/browser application and still require a JS structural adapter. Use the maintained Java reference already in the workbench. [SWRLAPI project and deployment](https://github.com/protegeproject/swrlapi)                                                                                                                                                                                                                                                                                                                                                            |
| Project-owned generators and fixtures            | Author tiny fixtures with fresh IRIs and original labels. Use independently calculated expected rules, an ordinary no-rule control and native observations. The pinned CLO and VBO files declare CC BY 4.0 and FOVT declares CC0 1.0. Use external verified originals in the corpus cache. Before distributing an actual excerpt, clear its exact bytes, attribution and embedded notices through the rights inventory. This plan needs no verbatim ontology excerpt or upstream test/implementation copied into the package. [Fixture catalogue](../../util/owlapi-reference/comparison-fixtures.json) · [Contribution terms](../../CONTRIBUTING.md) · [Rights inventory](../provenance/rights-inventory.json)    |

The existing project disposition covers upstream API names and selected declaration facts.
Consult upstream behavior and write original JS and fixtures under the contribution terms.
Copying or translating upstream implementation would require a separate rights disposition.
Maintain the existing package's AGPL-3.0-only implementation provenance.
Refresh the selection only if the selected dependency, platform, licence, deployment or published surface changes.

**DRY-01 ownership.**
Structural fields, axiom semantics and set projection own identity.
Both parsers and every writer must consume those same canonical objects.
Indexed RDF reads, list ownership and blank-node allocation belong in the RDF translators.
The Functional lexer/parser and renderer own their respective grammar directions.
The manager and storer registry own visibility and target effects.
The shared workbench owns candidate selection and verdicts.
Keeping an independent expected model, Java's native comparison and a hand-authored negative fixture is deliberate: sharing the implementation's rule-normalization code with its oracle could mask an error.
[Structural fields](../../internal/model/structuralFields.js) · [Axiom semantics](../../internal/model/axiomSemantics.js) · [Canonical projection](../../internal/collections/structuralProjection.js) · [Ontology read model](../../internal/model/ontologyReadModel.js)

## Implementation slices

Each slice goes through a consumer-visible boundary.
Source paths below identify likely owning modules.
Confirm them against the accepted implementation base.
The release maintainer owns integration.
Parser and writer work share the same structural contract.
Independent fixture authoring, native characterization and release metadata preparation can proceed in parallel after that contract is settled.

### SLICE-001 · Reproduce the loss and settle the native boundary

**REQ-001/003/004 → AC-001/003/004 → QA-001/003/004 → DEC-001/003/005.**
Add one independently authored CLO-shaped rule, a declarations-only control and an annotated FOVT/VBO-shaped rule with two head atoms.
Give each fixture a stable logical IRI.
Include one same-fragment/different-IRI variable, as seen between `urn:swrl#x` and `urn:swrl:var#x`.
Inspect the JS public model before saving.
Capture the native result directly from each input.
Use a mixed document containing an ordinary axiom, a fully supported rule and a rule that combines a supported atom with an unsupported built-in.
For the positive control, remove only the rule containing the built-in.

Record the existing failures on those inputs.
Characterize the named Java reader's strict and non-strict RDF behavior, Functional empty groups, duplicate and reordered atoms, free head variables, direct literal annotations and the effect of the annotation-loading switch.
Include one out-of-scope IRI-valued annotation and one malformed or shared list.
Check a representative rule with the public DL profile checker.
These observations determine parsing/equality details without widening the selected feature.
Use the native outcome for behavior governed by the Java profile.
If it would require dropping a supported annotation, reclassifying a predicate or relaxing an existing ownership/limit invariant, reopen only that part of DEC-001/003.
Fixture, rights and ordinary-control work can continue.

The characterization is independently useful and can be retained if the feature is deferred.
A test which merely checks total axioms, two parsers that agree on zero rules, or a snapshot produced by the current JS writer cannot demonstrate the loss or its repair.

### SLICE-002 · Make one complete rule visible through the JS API

**REQ-001/002/004 → AC-001/002/004 → QA-001/002/004 → DEC-001/002/004/005.**
Carry the one-rule input from RDF/XML-compatible parsing to a real logical axiom and Functional Syntax output that the existing Java reader recovers.
Add the intrinsic rule/atom/variable construction needed by both parsers.
Follow canonical structural fields, keys, annotation transforms, kind domains, read-model indexes and normal add/remove operations.
Apply the existing caller-compatibility rule in DEC-004.
Preserve encounter order separately from equality.
Extend the named Functional path to parse the same shape back.
Keep the release inventory scoped until the full slice set qualifies.

Acceptance requires one native-equal rule, the exact two declared object properties and class in the control fixture, a queried signature without variable-as-individual pollution, and zero residual scaffolding from the supported rule.
Replay duplicate add, remove, re-add and annotation-insensitive lookup.
Verify old exhaustive tables on an old value under DEC-004.
Change the predicate of the head without changing counts and verify the comparison detects it.
Exercise DEC-005 with the unsupported rule before and after the supported rule, including with optional warnings disabled.
Assert through the public manager that the load fails, the parser diagnostic identifies the built-in, and the rejected document is absent from the manager's ontology set.
Verify that the positive control loads and exposes both its ordinary axiom and its supported rule.
A blanket removal of every triple in the SWRL namespace would fail the ordinary-data and mixed-rule witnesses.
[JS functional parser](../../internal/parsing/functional/parser.js) · [Functional renderer](../../internal/storage/functional/functionalSyntaxRenderer.js) · [Public ontology queries](../../model/owlOntology.js)

### SLICE-003 · Preserve annotated, multi-head rules through edits and storage

**REQ-001/002/003/004 → AC-001–004 → QA-001–004 → DEC-001–005.**
Demonstrate the second fixture through read, public inspection, an unrelated edit, Functional and RDF/XML save and fresh reload.
Project-owned example: if `p(x,y)` and `q(x,y)` both hold, then `owl:Nothing(x)` and `owl:Nothing(y)`.
Give the rule an original label, comment and a typed boolean annotation.
Check direct annotation identity, both head members, the two distinct property argument positions, each variable IRI and the edited axiom.
Exercise a false boolean as a preservation control.
Sharing a name fragment or reusing a variable in another rule cannot merge different IRIs or create an individual declaration.

The source recognizer must distinguish a declared variable from a named individual used in an atom.
Emit RDF `swrl:IndividualPropertyAtom` for the model's object-property atom and preserve the positional `swrl:argument1` and `swrl:argument2`.
Build each `swrl:body` and `swrl:head` list with its own membership.
Out-of-scope annotations and mixed atom families follow DEC-005.
Test from a string source and a byte stream split inside relevant tokens.
Interrupt list traversal and an export to exercise the existing transaction and target publication rules, with another independent document still loadable.
Observe await/cancellation and the actual manager state at the documented boundary.
Test a shared RDF syntax, an unsupported-format write, a legacy visitor, and a merger between managers.
A writer that replays cached bytes must fail the edited-model test.
A writer that drops one label or swaps a head argument must fail a native or hand-authored check.
[RDF/XML storer](../../internal/storage/rdfxml/rdfXmlStorer.js) · [Functional storer](../../internal/storage/functional/functionalSyntaxStorer.js) · [Ontology manager](../../model/owlOntologyManager.js)

### SLICE-004 · Qualify the installed candidate and update the release claim

**REQ-001–005 → AC-001–005 → QA-001–005 → DEC-001–006.**
Run all three pinned cases on one exact installed tarball.
The existing direct-load JS worker already collects public-model witnesses for other cases.
Extend that observation and its verifier for these fixture definitions.
Enumerate `getAxioms()` once outside timed work, record the rule counts and annotated/multi-head counts, and reject a missing or stale witness.
Bind expected values to the fixture digest in tooling.
Keep the native full-structure comparison independent.
Retain the new observations, comparison receipts, independent verification and zero-network evidence.
Update the capability/behavior ledgers, release scope, generated API inventory, `README.md`, changelog and migration note to distinguish the qualified subset from the general deferred family.
Document the actual visitor impact and whole-document rejection when a recognized rule is unsupported.
Remove misleading blanket statements such as “all SWRL is deferred” only when supported by the final candidate.
Keep broader unimplemented members deferred.
[Capability inventory](../compatibility/capabilities.json) · [Public API registry](../compatibility/java-api-surface.json) · [Compatibility contract](../compatibility/0.1.0-contract-scope.md)

The independent verifier must inspect both the direct JS rule and the native structural verdict, including one deliberately wrong model.
Review the untrusted-input parser/list boundary, stored annotations, release-surface change and corpus rights under the existing R2 review.
The release owner decides promotion.
Historical local success, a documentation update or a green unit suite does not activate the hosted release gate.

## Verification and handoff

**Focused JS proof.**
Through the public manager compare rule contents and annotations before any writer runs.
Use project-owned RDF/XML and Functional documents with equivalent, independently specified meanings.
Reuse the existing native and JS comparison tests.
A proposed new focused test file may be located beside the relevant public manager or mapping tests.
Existing entry points include `model/dispatch.test.js`, `internal/mapping/rdfToOwlTranslator.axioms.test.js`, `internal/parsing/functional/functionalSyntax.test.js`, `internal/storage/functional/functionalSyntaxRenderer.test.js` and `util/owlapi-reference/compare-java-js.test.js`.
Run affected tests with `npm test -- --runInBand --runTestsByPath <test paths>`.
Finish with the full Jest and package-boundary suites using `npm test -- --runInBand` and `npm run test:boundary`.
Reuse a single candidate for `npm run test:owl-contract -- --candidate <candidate> --output <new report directory>` and `npm run prepare:browser-consumers -- --candidate <candidate> --output <new browser fixture>`, followed by `npm run test:browser -- --fixture-root <browser fixture>` across Chromium, Firefox and WebKit.
Earlier Windows evidence was 325 Jest suites, 17,455 passes, two existing skips, 70 installed assertions and nine browser tests.
Those figures describe the earlier candidate.
They do not establish proof for this change.

**The three real inputs.**
Use the ordinary `prepare`, `run` and `verify` commands below.
PowerShell variables denote operator-selected paths.
`$cache` is an external content-addressed cache, `$prep` and `$run` are new output directories with existing parents, and `$candidate` contains the exact retained release-candidate manifest and tarball.
Produce one fresh candidate when needed with `npm run build:release-candidate -- --output <new candidate directory>`.
`$jdk` is the qualified complete JDK home.
Read the selection from the checkout's `.java-version`, which was `25.0.5+1.2` when inspected.

```powershell
$selection = @('--input', 'obo-clo', '--input', 'obo-fovt', '--input', 'obo-vbo',
  '--scenario', 'direct-load', '--profile', 'java-owlapi-5.5.1',
  '--parsing-mode', 'compatible', '--imports', 'recorded', '--measure', 'structure,behavior')
$jdkSelection = (Get-Content -Raw -LiteralPath '.java-version').Trim()
npm run compare:java-js -- prepare @selection --cache $cache --output $prep
npm run compare:java-js -- run @selection --cache $cache --output $run --candidate $candidate --java-home $jdk --java-selection $jdkSelection
npm run compare:java-js -- verify @selection --cache $cache --output $run --candidate $candidate --java-home $jdk --java-selection $jdkSelection
```

Preparation verifies publisher bytes and the locked Java runtime artifacts.
A preverified original can be supplied with `--seed ID=absolutePath`.
Use the same populated cache throughout.
Cache-only npm installation also needs its package lock and a warmed npm cache.
Stop at a failed step.
Keep the original attempt and retry to a fresh run directory using the same identified inputs.
Capture `preparation.json`, `attempt.json`, `report.json` and each case's JS model, JS load, native result and independently verified verdict.
Require `status=passed`, `measures.structure=match`, `measures.behavior=observed` and `offline=true`, plus exact structural equality, zero expected-difference suppression and 4/48/25 actual rules.
A successful process exit alone can also represent a diagnostic-only run.
Verify fresh receipts against the candidate digest.
The source-transport switches currently belong to load-only measurements.
Prove stream/string structure using focused public manager tests, and use an ordinary structural selection here.
[Runner and evidence verification](../../util/owlapi-reference/compare-java-js.mjs) · [Fixture and cache instructions](../../util/owlapi-reference/README.md)

**How the wider workbench fits.**
Use the shared roster and maintain each admitted case's existing expected outcome for wider regression.
The historical 70 successful real-world RDF/XML inputs and the subsequent large-file retries are different sets.
CLO, FOVT and VBO belong to the retry group.
The 70 generated API workloads, 140 workload/profile pairs and 70 installed contract assertions are different measures again.
A historical 70-document run by itself would miss these three.
The current full shadow roster covers 315 inputs, 931 case IDs and 3,594 measurement/platform cells in 166 shards.
It retains different profile/mode decisions.
Its authenticated fresh and promoted-CI paths on the protected release branch were pending at inspection.
This plan requires the three positive named-profile matches and retains the broader existing release obligations.
The release owner retained promotion, including the protected branch transition.
[Corpus sets and qualification history](2026-11-20-real-world-ontology-corpus-and-java-parity.md) · [Recorded release controls](../compatibility/2026-11-25-corpus-qualification.json)

**Resource and trust boundaries.**
Let T denote total input triples and L the list cells/atom uses reached from recognized rules.
Use the existing graph pass and indexed subject/predicate lookups.
Traverse each owned list once per required decode and retain only the state and canonical members needed for that rule.
Account for shared variables, the required order-preserving set work and any sorting for structural keys.
A full scan of T for each rule or atom would multiply work on 38–65 MB files.
Use a generated many-rule/many-ordinary-triple witness and work observations at the public loader to expose that error.
Inherit byte, parser, deadline, blank-node and worker limits, cancellation checkpoints, blank-node scope and no-network import behavior.
Apply the existing Windows job allowance and available headroom during qualification.
No new input ceiling, per-rule telemetry, persistent environment change or performance threshold is part of this fix.
Native measurements for CLO, FOVT and VBO stayed unqualified while the engines did different work.
New speed or memory claims require fresh equivalent-work measurements.

**Rollout and recovery.**
Before release, an incomplete slice can be withheld and its independently valid tests retained.
Preserve the original RDF/XML and exact candidate bytes.
Previously exported JS Functional files can lack the atom/list connections needed to reconstruct the rule.
Recover those ontologies by reloading the original source with the corrected reader and reconciling any subsequent edits.
There is no general backfill from the lossy export.
A published npm version is immutable.
If the new path corrupts rules or regresses existing callers, the release owner halts further promotion, identifies affected versions/formats, advises use of original files or a known qualified reader and prepares a forward fix.
Pointing to an earlier version cannot restore lost rule data.
Source parse metadata and incomplete attempts cannot establish a lossless result.

**Estimate and conditions for replanning.**
For one engineer with the current inputs available, allow ½–1 day for fixtures and diagnostics, 2–4 days for canonical model and the two I/O paths, and ½–1 day for focused assurance and regressions.
The 3–6 day total covers the accepted whole-document rejection policy and assumes DEC-004 fits the existing public boundary.
Hosted qualification adds elapsed time.
A general structural SWRL API was estimated at 2–4 engineering weeks, with lower confidence, independently of reasoning.
Re-estimate the affected slice if a future release needs partial reads, the old visitor contract requires a substantially different public interface, an independently verified rule needs a third atom family, or a native/JS contract cannot be reconciled within this scope.
An ordinary failing test against the agreed oracle calls for a fix and rerun.

**HISEW status and decision tree.**
The maintainer owns the compatibility baseline and release decision.
The elevated R2 route is proposed because this changes public structural identity and untrusted-input persistence with possible loss on save.
The independent verifier owns the evidence comparison.
The methods used were the requested planning skill, risk routing, requirements traceability, quality scenarios, engineering principles, software selection, architecture/performance, resource governance and release readiness from the neighboring workflow checkout at `da653e0f9cf2ffb1687e73e2131fa1ed909398e7` with local changes.
On 25 November the normal Windows launcher/store was absent from this account.
Read-only inspection from the supplied contributor checkout reported `engineReady:false` and a missing packaged `engine/bootstrap.ps1`.
This is a repository plan using HISEW methodology.
Native project applicability and execution admission are unverified.

The three corpus cases establish the supported forms, the named profile and the existing comparison route.
The published contract calls for backward-compatible dispatch on existing values.
The maintainer's 26 November decision settles the last product question in the plan.
When implementation is authorized, retain the exact requirements and the dated DEC-005 reference for the R2 baseline.
Recheck installed HISEW applicability before opening an execution.
Protect pre-existing worktree changes and use authenticated receipts from the actual candidate.
The current request authorizes drafting and review of this plan.
