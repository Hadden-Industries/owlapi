# Java OWLAPI parity requirements for WebVOWL

Status: Draft requirements for review, prepared on 3 October 2026.
This document defines proposed additions to the JavaScript `@hadden-industries/owlapi` library that implement existing Java OWLAPI functionality and benefit WebVOWL.
It does not authorize implementation, configuration changes, publication, or consumer cutover, and it does not amend the accepted migration phases or compatibility decisions.

The intended readers are the owlapi maintainer, implementers and reviewers, and the WebVOWL application owner.
The recommended first increment is structural queries, followed by ontology change functionality, expression rendering, and additional storage formats.
Profile checking and module extraction are separately selectable later increments.
Every selected increment must demonstrate both its bounded Java compatibility and its concrete consumer benefit.

## Purpose and authority

The originator's governing constraint is: "it still needs to conform to the functionality that exists in the current Java implementation".
The request is to bring the JavaScript library closer to Java OWLAPI in richness of functionality in ways that benefit WebVOWL.
Java functionality therefore determines the candidate set; a consumer preference alone cannot authorize a new library responsibility.

The selected Java authority is OWLAPI 5.5.1 at revision `d7e997a53b470e32700de89cc610d9daf01ea769`, as recorded in [the reference pin](../../util/owlapi-reference/pinned-version.json) and [the public surface registry](../compatibility/java-api-surface.json).
All Java source references below resolve at that revision, regardless of the branch or HEAD of a local Java checkout.
Changing the Java authority requires a separate reconciliation decision.
The OWL2VOWL shaded JAR embeds a different Java OWLAPI version and is not the library parity oracle.

The following existing records constrain this draft:

- [Implementation plan](../implementation-plan.md): highest-authority migration document.
- [Engineering conventions](../engineering-conventions.md): native ESM, Java-shaped public namespaces, immutable structural values, and existing quality tools.
- [Java parity precondition](../plans/java-api-parity-precondition.md): names, responsibilities, minimum host-language adaptations, and explicit deviation decisions.
- [Compatibility decision ledger](../compatibility/java-api-parity-decisions.json) and [expected differences](../compatibility/expected-differences.json): approved differences, rather than a general exemption from parity.
- [Ontology lifecycle plan](../ontology-lifecycle-capability-implementation-plan.md): implemented manager, closure, mutation, merger, and storage foundations.
- [Canonical VOWL prerequisites](../compatibility/canonical-vowl-prerequisites.md) and [RDF parser metadata contract](../compatibility/rdf-parser-metadata.md): existing source assessment and metadata guarantees.
- [Resource budgets](../performance/resource-budgets.json) and [benchmark corpus](../performance/benchmark-corpus.json): existing limits and regression policy.
- [Reference harness guidance](../../util/owlapi-reference/README.md): independent Java observations and structural comparisons.

The word "shall" identifies a proposed acceptance requirement within a selected increment.
It does not make this draft an accepted repository policy.
All requirements begin unimplemented and unverified for this programme until exact candidate evidence is attached.
An existing primitive may satisfy part of a requirement without establishing completion of the new capability family.

## Observed baseline and motivation

The authoring baseline is owlapi commit `76350128fea814825fbe5f697bf45146b0b3cca2`, with unrelated working-tree CI changes present.
WebVOWL's inspected branch baseline is commit `d77183ffa4c4dc52048df39b6c40f8b1562c0257`, with ongoing Canonical VOWL changes in its working tree.
These identify inspected source, not frozen release candidates or application acceptance.
Implementation must refresh the actual source and consumer baselines.

Observed library functionality includes direct ontology queries, manager-owned state, import-closure loading, source-preserving parsing, parser metadata, exact cardinalities, OWL 2 DL assessment, and Functional Syntax/RDF/XML storage.
The current `applyChanges` input surface accepts `SetOntologyID` and `AddOntologyAnnotation`; `addAxiom` and `addAxioms` are separate existing manager operations.
The registry records the additional Java types selected below as `DEFERRED_NOT_EXPOSED` and `NOT_STARTED`.
That classification identifies a gap; it is not implementation authority.

Current `model/owlOntology.js` traverses structural values for signature and referencing-axiom queries and filters direct axioms for type queries.
WebVOWL's `src/owl2vowl/js/vowlBuilder.js` and `packages/vowl/src/owl/modelBuilder.js` consume ontology structure and perform application-specific projection.
The hypothesis is that richer Java-backed query functionality can reduce repeated ontology traversal and duplicated query semantics at those ingestion seams.
The actual performance benefit remains to be measured.

WebVOWL also has its own VOWL live model, editing operations, revision tracking, inspection, scene reconciliation, and artifact handling.
Adding ontology change functionality does not authorize replacing those contracts or introducing two independently authoritative editing models.
The library benefit and the application integration route must be established separately.

| Outcome | Beneficiary and proposed result                                                                  | Baseline and acceptance measure                                                                                                                                                         | Requirements                |
| ------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| OUT-01  | Maintainers and ontology consumers obtain reusable Java-backed structural queries                | Replace selected hand-written OWL query logic at an identified ingestion call site; compare exact results and measure repeated-query time and peak heap on pinned inputs                | REQ-001 to REQ-005, REQ-016 |
| OUT-02  | Ontology editor/export consumers can propose and apply established Java changes                  | Current additions and two change types are insufficient for removal/refactoring; verify exact proposed changes, final ontology state, preservation of annotations, and failure behavior | REQ-006 to REQ-008          |
| OUT-03  | Inspectors and agent clients can read complex OWL expressions                                    | Demonstrate readable text for named and anonymous expressions through a selected Java renderer and short-form policy                                                                    | REQ-009, REQ-010            |
| OUT-04  | Ontology export consumers can save current semantic content in additional Java-supported formats | Qualify Turtle and separately OWL/XML through public storage, independent reload, and explicit unrepresentability rejection                                                             | REQ-011, REQ-012            |
| OUT-05  | Ontologists receive accurate additional profile information                                      | Existing DL assessment is the baseline; qualify EL, QL, and RL independently over the complete closure without claiming consistency                                                     | REQ-013                     |
| OUT-06  | Large-ontology users can extract a bounded semantic module                                       | No selected module-extraction surface exists; compare extracted axiom sets with Java and measure size, work, and memory for selected signatures                                         | REQ-014, REQ-015            |

The owlapi maintainer is accountable for library compatibility and candidate qualification.
The WebVOWL application owner is accountable for consumer semantics, observable benefit, and adoption.
The repository owner selects increments and approves any new adaptation or configuration change.
These are responsibility assignments for review, not evidence that those decisions have already been made.
The do-nothing option retains the existing package and application behavior, with continued consumer query work and deferred functionality but no new public compatibility surface.

## Scope and exclusions

The six capability families below are the complete candidate scope of this document.
The first delivery need not implement all six, but a selected family or explicitly enumerated subset must have its own acceptance record.
Partial implementation must identify omitted Java members and supported inputs; exporting a class name does not establish complete class parity.

The following are outside this proposal:

- Exhaustive source-statement-to-model provenance, a VOWL-specific source ledger, and new public RDF snapshot or export-preflight interfaces without a demonstrated Java counterpart.
- VOWL projection, canonical identifier issuance, RDFC/JCS document admission, drawing occurrences, layout, camera, selection, visibility, human confirmations, and visualization artifacts.
- A new reasoning implementation or reasoner facade: `OWLReasoner` remains `UNSUPPORTED_BY_DESIGN` under the current package scope.
- Generic SPARQL, fuzzy search, language-ranking policy for WebVOWL, and renderer-specific performance changes.
- New TypeScript declarations, dependencies, CI structure, release versions, npm export paths, or automatic consumer dependency updates.
- Full Java overload, inheritance, visitor, stream, exception, or concurrency parity by implication.
- Change/progress listener registration, storer registration, additional serializer families, and unrelated `EntitySearcher` methods beyond the selected inventory.

Existing Java-backed parser metadata is a foundation to preserve, not a new deliverable.
The source-preserving parser and DL checker likewise must not be reimplemented in WebVOWL to make these additions work.

## Common compatibility requirements

### REQ-001 Java authority and member inventory

Each selected public responsibility shall be mapped to an exact Java type, source path, member or overload, and behavior at the pinned revision before implementation.
The mapping shall distinguish functional support from public exposure of a concrete Java class or interface.

Acceptance criteria:

1. A reviewed member matrix identifies Java inputs, result semantics, errors, ontology scope, side effects, and omissions for every selected member.
2. Each member is classified as exact functionality, a minimum JavaScript adaptation, or an explicit omission under the existing parity decision order.
3. No new alias, result-report interface, callback protocol, public stage, or subclass is introduced merely for consumer convenience.
4. Any new deviation has an exact decision record and approval; existing decisions are reused only within their recorded scope.
5. No family is marked complete while selected members or their acceptance cases remain unverified.

### REQ-002 Public ownership and host-language adaptation

Additions shall follow the existing package ownership and native ESM conventions.
JavaScript call shapes shall preserve Java responsibilities while explicitly accounting for overload selection and Java-only protocols.

Acceptance criteria:

1. Every public binding has one canonical definition in its approved Java-shaped namespace; the root aggregate re-exports that same identity.
2. A Java interface can be functionally supported through ontology methods without manufacturing a constructible JavaScript interface class.
3. Stream-to-iterable or collection adaptation documents ordering, duplicate multiplicity, eager/lazy evaluation, and snapshot lifetime where observable.
4. Arrays, sets, and iterables are not substituted interchangeably when that changes Java results.
5. New namespaces or shipped files are not assumed to exist because their Java counterpart exists; exact manifest/export changes require separate approval.
6. Consumer acceptance uses installed public package imports, including the native `owlapi` alias where selected, without private imports or forwarding shims.

## Structural queries

Priority: first increment.
Java authorities: [OWLAxiomIndex](https://github.com/owlcs/owlapi/blob/d7e997a53b470e32700de89cc610d9daf01ea769/api/src/main/java/org/semanticweb/owlapi/model/OWLAxiomIndex.java), [EntitySearcher](https://github.com/owlcs/owlapi/blob/d7e997a53b470e32700de89cc610d9daf01ea769/api/src/main/java/org/semanticweb/owlapi/search/EntitySearcher.java), and the corresponding `OWLOntology` query contracts.
Dependencies: REQ-001 and REQ-002.

### REQ-003 Focused axiom accessors

The ontology interface shall support the following bounded `OWLAxiomIndex` functionality.
One reviewed JavaScript call shape per selected responsibility is sufficient; unselected Java overloads remain explicitly omitted.

| Responsibility                           | Java member inventory                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Declarations and subject annotations     | `getDeclarationAxioms`, `getAnnotationAssertionAxioms`                                                                                                                                                                                                                  |
| Class relationships                      | `getSubClassAxiomsForSubClass`, `getSubClassAxiomsForSuperClass`, `getEquivalentClassesAxioms`, `getDisjointClassesAxioms`                                                                                                                                              |
| Object property hierarchy and endpoints  | `getObjectSubPropertyAxiomsForSubProperty`, `getObjectSubPropertyAxiomsForSuperProperty`, `getObjectPropertyDomainAxioms`, `getObjectPropertyRangeAxioms`, `getInverseObjectPropertyAxioms`                                                                             |
| Data property hierarchy and endpoints    | `getDataSubPropertyAxiomsForSubProperty`, `getDataSubPropertyAxiomsForSuperProperty`, `getDataPropertyDomainAxioms`, `getDataPropertyRangeAxioms`                                                                                                                       |
| Asserted object property characteristics | `getFunctionalObjectPropertyAxioms`, `getInverseFunctionalObjectPropertyAxioms`, `getSymmetricObjectPropertyAxioms`, `getAsymmetricObjectPropertyAxioms`, `getReflexiveObjectPropertyAxioms`, `getIrreflexiveObjectPropertyAxioms`, `getTransitiveObjectPropertyAxioms` |
| Asserted data property characteristics   | `getFunctionalDataPropertyAxioms`                                                                                                                                                                                                                                       |

Acceptance criteria:

1. Every selected accessor returns the same structural axiom set as Java for common-domain fixtures, including exact annotations.
2. Sub-position and super-position queries remain distinct, and property expressions are handled according to the selected Java member rather than collapsed to IRI strings.
3. Object, data, and annotation property roles sharing an IRI do not become interchangeable; named and anonymous values retain their structural identity.
4. Empty results, declarations without uses, absent declarations, multiple endpoints, n-ary axioms, nested expressions, and repeated annotated facts are covered.
5. No result adds inferred hierarchy, inherited domains, fabricated declarations, or renderer-generated facts.
6. Existing direct query methods retain their documented behavior and collection ownership.

### REQ-004 EntitySearcher convenience functionality

A bounded `EntitySearcher` subset shall provide the Java-established extraction of annotations, class relationships, property relationships, endpoints, inverses, and asserted characteristics.
The selected inventory is `getAnnotations`, `getAnnotationAssertionAxioms`, `getSuperClasses`, `getSubClasses`, `getEquivalentClasses`, `getDisjointClasses`, `getSubProperties`, `getSuperProperties`, `getDomains`, `getRanges`, `getInverses`, `isFunctional`, `isInverseFunctional`, `isSymmetric`, `isAsymmetric`, `isReflexive`, `isIrreflexive`, and `isTransitive` for the entity categories actually supported by the corresponding Java overloads.

Acceptance criteria:

1. The member matrix enumerates each selected entity-category and single/multiple-ontology overload; it does not generalize one Java overload to every entity category.
2. Differential cases cover every selected extraction and predicate, including annotation values that are IRIs, literals, or anonymous individuals.
3. Anonymous superclass restrictions remain expressions; they are not flattened into named hierarchy edges.
4. Single-ontology and caller-supplied multiple-ontology operations match Java's scope and duplicate behavior.
5. Convenience results can be traced to the underlying asserted axioms using the existing model; no new provenance guarantee is asserted.
6. WebVOWL retains ranking, paging, hidden-match reporting, and application language policy.

### REQ-005 Scope and query freshness

Queries shall distinguish direct ontology content from imported content using the semantics of the selected Java member.
Any private index shall remain correct after supported manager changes and shall not become an independently authoritative ontology model.

Acceptance criteria:

1. A root, two imports, a shared transitive import, a cycle, and an unresolved import discriminate direct versus closure results.
2. Imported content is included only when the selected Java member or explicitly supplied ontology collection requires it; no hidden closure expansion occurs.
3. Closure traversal is root-inclusive and respects the existing managed-ontology authority and document-scoped anonymous identities.
4. Addition, removal, annotation change, import change, and ontology-identity change exercise query freshness once those changes are supported.
5. Caller mutation of returned collections cannot mutate ontology state or later query results.
6. Invalid or unmanaged inputs follow the selected member's documented JavaScript validation; incomplete closure handling cannot silently become a complete-result claim.

## Ontology changes and entity refactoring

Priority: second increment, selected according to the ontology editing/export consumer route.
Java authorities: `org.semanticweb.owlapi.model` change types and manager methods, [OWLEntityRenamer](https://github.com/owlcs/owlapi/blob/d7e997a53b470e32700de89cc610d9daf01ea769/api/src/main/java/org/semanticweb/owlapi/util/OWLEntityRenamer.java), and [OWLEntityRemover](https://github.com/owlcs/owlapi/blob/d7e997a53b470e32700de89cc610d9daf01ea769/api/src/main/java/org/semanticweb/owlapi/util/OWLEntityRemover.java).
Dependencies: REQ-001, REQ-002, query/reference semantics, and existing manager-owned mutation.

### REQ-006 Complete selected change operations

The manager shall support Java-backed `AddAxiom`, `RemoveAxiom`, `RemoveOntologyAnnotation`, `AddImport`, and `RemoveImport` changes alongside the existing supported changes.
Axiom replacement shall compose selected remove/add functionality rather than require an invented public replacement type.

Acceptance criteria:

1. For each selected change, Java and JavaScript have matching common-domain final axioms, annotations, ontology identity, and authored import declarations.
2. Duplicate additions, absent removals, annotated versus unannotated axioms, and ordered remove/add batches have characterized results.
3. A change binds the intended ontology; it does not redirect to another document because the ontology IRI or entity IRI matches.
4. Existing manager ownership and the documented transaction behavior are preserved, including rejection without partial publication where the current JavaScript transaction contract requires it.
5. Java and JavaScript batch/failure differences are characterized and recorded rather than declaring identical transaction behavior by assumption.
6. Import declaration mutation, managed closure membership, and import acquisition are independently characterized; adding a declaration must not invent a new automatic network policy.
7. Queries, signature membership, and storage observe the resulting committed state.
8. Historical parser metadata stays historical; source assessment becomes stale or unverified according to the existing contract after semantic changes.

### REQ-007 Entity and IRI renaming

`OWLEntityRenamer` functionality shall generate the Java-established ontology changes for selected entity-to-IRI, IRI-to-IRI, and entity-map responsibilities.
The exact Java overload is the semantic authority for which references and annotations change.

Acceptance criteria:

1. Generating changes leaves every source ontology unchanged until the caller applies them.
2. Differential fixtures distinguish renaming one typed entity from replacing an IRI, including legal punning and an unrelated entity role using the same IRI.
3. Declaration, nested-expression, axiom-annotation, annotation-assertion, and ontology-annotation effects match the selected Java overload.
4. Literal lexical text is not rewritten by text replacement; datatype and IRI-valued references follow Java structural duplication behavior.
5. Batch maps, self-renames, rename chains, target collisions, shared imports, and unselected ontologies have explicit Java observations.
6. Change-list multiplicity and ordering are characterized where observable, separately from the final ontology set.
7. Original objects remain immutable, anonymous individuals are not accidentally standardized together, and failure does not alter the original state.

### REQ-008 Entity removal proposals

`OWLEntityRemover` functionality shall accumulate the Java-established `RemoveAxiom` proposals for selected typed entities and ontology sets, expose a defensive `getChanges` result, and implement `reset`.
Any necessary visitor adaptation must be recorded under REQ-001 rather than replaced with an unreviewed convenience member.

Acceptance criteria:

1. Proposals match Java for referencing axioms and annotation assertions about the entity IRI across class, datatype, individual, object/data property, and annotation property cases.
2. A declaration-only entity, a nested use, a punned IRI, repeated visits, and an unselected ontology discriminate the removal scope.
3. Proposal generation is side-effect-free for ontology state; `reset` clears accumulated proposals without changing ontologies.
4. The caller can inspect complete axiom and annotation losses before applying changes.
5. Applying the proposal produces the characterized result, without extra recursive entity deletion or a library-owned human confirmation policy.
6. Removal does not claim that the result is logically consistent or that every visual dependency can be safely removed.

## Expression rendering and short forms

Priority: third increment.
Java authorities: `OWLObjectRenderer`, [ManchesterOWLSyntaxOWLObjectRendererImpl](https://github.com/owlcs/owlapi/blob/d7e997a53b470e32700de89cc610d9daf01ea769/parsers/src/main/java/org/semanticweb/owlapi/manchestersyntax/renderer/ManchesterOWLSyntaxOWLObjectRendererImpl.java), `ShortFormProvider`, `SimpleShortFormProvider`, and `AnnotationValueShortFormProvider` under their actual Java packages.
Dependencies: REQ-001, REQ-002, immutable structural values, and selected annotation queries.

### REQ-009 Manchester object rendering

The selected renderer shall implement `render` and `setShortFormProvider` functionality for an explicitly enumerated inventory of supported OWL objects.
The initial inventory shall cover the class/data-range expressions and axioms used in WebVOWL inspection; full renderer parity must not be claimed for that subset.

Acceptance criteria:

1. The inventory covers named classes, intersection, union, complement, enumerations, existential/universal restrictions, value/self restrictions, inverse properties, cardinalities, and datatype restrictions where supported by the existing model.
2. Nested precedence, escaping, Unicode, language tags, literal lexical text, annotation text, and exact cardinalities are tested.
3. Output is compared with Java under the same short-form policy; text differences are classified rather than hidden by broad whitespace normalization.
4. Rendering leaves model state unchanged and returns text, without HTML, DOM, visualization coordinates, or invented natural-language assertions.
5. Unsupported object kinds fail according to the selected contract instead of emitting a misleading partial rendering.
6. Consumer rendering through an installed package works in Node and an actual browser/worker environment as applicable.

### REQ-010 Java short-form policies

Selected short-form providers shall implement Java's fallback and ordered annotation-property/language preference behavior.
WebVOWL supplies its desired preferences and retains authority over its own VOWL label selector.

Acceptance criteria:

1. Java differential cases cover property priority, language priority, missing values, untagged values, multiple candidates, IRI-valued annotations, and fallback short forms.
2. Equal display text does not merge distinct entities, typed roles, or full IRIs.
3. The selected ontology set is explicit, and annotation changes are reflected according to the provider's characterized lifecycle.
4. A provider usable by the renderer does not create a second WebVOWL display-policy implementation.
5. Any ambiguous Java tie or encounter-order behavior is documented without inventing a universal canonical label guarantee.

## Additional ontology storage formats

Priority: fourth increment, with Turtle first and OWL/XML separately accepted.
Java authorities: `OWLOntologyManager.saveOntology`, `StringDocumentTarget`, [TurtleStorer](https://github.com/owlcs/owlapi/blob/d7e997a53b470e32700de89cc610d9daf01ea769/parsers/src/main/java/org/semanticweb/owlapi/rdf/turtle/renderer/TurtleStorer.java), and [OWLXMLStorer](https://github.com/owlcs/owlapi/blob/d7e997a53b470e32700de89cc610d9daf01ea769/parsers/src/main/java/org/semanticweb/owlapi/owlxml/renderer/OWLXMLStorer.java).
Dependencies: existing public storage, shared OWL-to-RDF mapping for Turtle, and REQ-001/REQ-002.
Functional storage support does not require exposing concrete storer constructors or registration protocols.

### REQ-011 Turtle storage

The existing public `saveOntology` responsibility shall save a managed ontology in the exact Turtle format through the existing target contract.
The current semantic ontology revision, rather than a drawing or stale source snapshot, is the storage input.

Acceptance criteria:

1. Selected-format dispatch succeeds for Turtle and never silently substitutes RDF/XML or another syntax.
2. Both Java and JavaScript independently reload output and compare complete supported ontology structure modulo valid anonymous-identity correspondence.
3. Coverage includes every supported RDF-representable axiom/expression kind, nested annotations, ontology annotations, imports, Unicode, lexical literal variants, exact cardinalities, inverse expressions, and repeated property-chain members.
4. Prefix spelling, statement order, and blank-node labels are not mistaken for semantic parity; any requested byte-level guarantee needs its own explicit authority.
5. Non-injective mappings, retained source structures, or unsupported constructs that cannot be preserved reject using the established storage error contract.
6. A failed save leaves the target unchanged under the existing JavaScript atomic target adaptation; `StringDocumentTarget.toString()` remains the public reader.
7. Serialization performs no import acquisition and does not silently flatten a closure; callers compose selected Java-backed closure primitives when required.
8. Existing Functional Syntax and RDF/XML storage behavior remains qualified.

### REQ-012 OWL XML storage

The public storage responsibility shall separately support the exact OWL/XML format for supported structural content.

Acceptance criteria:

1. Java and JavaScript independent reloads preserve complete representable structure, annotations, authored imports, identity, exact numeric values, and anonymous-individual relationships.
2. XML escaping, namespaces, IRIs, literals, datatype facets, and nested annotations have discriminating fixtures.
3. Unsupported retained RDF/RDFS content is rejected instead of silently omitted or converted into fabricated OWL axioms.
4. Failure, target ownership, explicit format dispatch, and no-network behavior satisfy the existing storage contract.
5. OWL/XML capability status and consumer evidence are independent of Turtle acceptance.

## Additional OWL profile checks

Priority: separately selected later increment.
Java authorities: `OWL2ELProfile`, `OWL2QLProfile`, `OWL2RLProfile`, `OWLProfileReport`, and their exact violation/checking responsibilities at the pinned revision.
Dependencies: the existing DL checker, datatype validation, managed closure authority, and finite assessment budgets.

### REQ-013 EL QL and RL profile assessment

Each selected checker shall implement the corresponding Java profile membership and violation functionality over the root-inclusive managed import closure.
Each profile requires its own complete rule/member inventory and acceptance record; a small syntax blacklist cannot stand in for a profile checker.

Acceptance criteria:

1. Positive and negative fixtures discriminate every selected profile rule and its DL prerequisites, including violations found only in imported ontologies.
2. Common-domain membership and contextual violations agree with Java, subject only to exact approved differences and the normative standards decisions already recorded by the project.
3. Java exception/visitor types and violation names are mapped explicitly to the established JavaScript report contract; importing a new checker does not invent new public reporting stages.
4. Missing closure, unsupported datatype semantics, cancellation, and resource exhaustion cannot produce a valid result for unfinished assessment.
5. The existing `valid`/`invalid`/`unverified` interpretation is reused only with its applicability explicitly qualified for each new checker.
6. Reporting preserves input ontology/profile identity and immutable results, and distinguishes profile membership from consistency, satisfiability, entailment, or VOWL admission.
7. EL, QL, and RL are not treated as nested subsets or interchangeable validation modes.
8. Consumers can state the selected profile, assessment revision, and scope; historical reports do not certify edited content.

## Syntactic locality module extraction

Priority: separately selected later increment.
The selected Java family is `org.semanticweb.owlapi.modularity.locality.SyntacticLocalityModuleExtractor`, with `ModuleExtractor`, `LocalityModuleExtractor`, `LocalityClass`, and the syntactic locality evaluators.
It is not the different `uk.ac.manchester.cs.owlapi.modularity` compatibility family.
Dependencies: complete supported axiom signatures, the selected locality semantics, finite work limits, and exact package exposure decisions.

### REQ-014 Java syntactic locality extraction

The selected extractor shall accept a caller-supplied axiom base and entity signature and implement the selected Java `extract` responsibilities for `BOTTOM`, `TOP`, and `STAR` locality.
If delivery selects fewer locality classes or omits Java's axiom-filter responsibility, the omission must be explicit before implementation and in capability reporting.

Acceptance criteria:

1. For each selected locality class, Java and JavaScript return matching structural axiom sets from the same axiom base, signature, and optional selected filter.
2. Fixtures cover empty and absent signatures, disconnected axioms, recursive dependencies, cycles, nested restrictions, datatypes, annotations, and signatures spanning imported content supplied by the caller.
3. STAR cases reach the same fixed point as Java; repeated extraction does not retain a prior signature or mutate the axiom base.
4. An unsupported axiom kind is rejected or excluded only under an explicitly selected Java-compatible filter; it is never silently treated as local.
5. Extracted output is a subset of the supplied axiom base; no missing facts, ontology headers, imports, or declarations are manufactured.
6. The selected constructor, `axiomBase`, `containsAxiom`, and `extract` responsibilities are inventoried along with any omitted interface defaults.
7. A radius-limited drawing neighborhood is not presented as a locality module.

### REQ-015 Module scope and consumer integrity

Consumers shall be able to distinguish an extracted module from the complete source ontology and preserve the selected signature and locality description in application-owned context.
The library does not acquire imports or define a VOWL layout while extracting.

Acceptance criteria:

1. The consumer deliberately supplies direct axioms or a resolved closure union and records that scope.
2. The full source remains available and unchanged after extraction or failure.
3. A focused WebVOWL view is labelled as a module with its seed and locality choice; hidden source facts are not reported as nonexistent.
4. Optional standalone ontology creation/export uses established manager and storage functionality with explicit identity and annotation/import policy.
5. Presentation size, extraction time, and peak heap are measured; a smaller module is not assumed to render faster without an application measurement.

## Quality and consumer acceptance

### REQ-016 Resources and measured benefit

Selected capabilities shall preserve existing resource limits and regression policy and define bounded work for any new processing not covered by current limits.
New budget fields or thresholds require review before implementation and any exact configuration approval required by the repository.

Acceptance criteria:

1. Every measurement identifies source/candidate revisions, installed artifact digest, corpus hashes, runtime, machine, operation, and workload.
2. Existing benchmark policy uses one warmup, five measured runs, medians, and at most 20 percent wall-time and peak-heap regression where the existing comparison applies.
3. Query measurements include index construction and memory, repeated hits/misses, closure size, and mutation maintenance; setup cost is not omitted from the benefit claim.
4. New workloads without a baseline obtain a reviewed baseline and target before their performance acceptance; no invented speedup is asserted here.
5. Cancellation/deadlines are exercised where the selected existing contract supports them; adding them to a Java-shaped synchronous member requires a recorded adaptation.
6. Resource exhaustion cannot return partial successful query/module/storage/assessment results under a complete-result contract.
7. Actual browser/worker tests cover the selected environment, including absence of Java/JVM dependencies in production.

### REQ-017 Demonstrated WebVOWL consumption

Each selected family shall have a concrete application scenario through the installed public package, with the owning WebVOWL acceptance recorded separately from library acceptance.

Acceptance criteria:

1. Query consumption at an identified OWL ingestion or ontology-backed inspection seam produces matching semantic results for annotated, punned, restricted, and imported examples.
2. Canonical VOWL inspection continues to use its retained semantic model; access to an OWL ontology is not fabricated for canonical-only input.
3. Mutation/refactoring scenarios identify the authoritative model and the explicit OWL-to-VOWL or VOWL-to-OWL mapping used; no silent parallel editing model is introduced.
4. Rendering scenarios demonstrate readable restrictions while preserving distinct full identities and the existing application display policy.
5. Storage scenarios export current complete ontology structure and independently reload it, including semantic content not represented by drawing glyphs.
6. Profile and extraction scenarios communicate their exact scope and limitations without claiming source authenticity or complete reasoning.
7. Existing loading, supported editing, inspection, save/reload, and export scenarios are checked for regressions appropriate to the selected integration.
8. Dependency/configuration adoption, browser acceptance, deployment, and publication remain separately authorized and evidenced actions.

### REQ-018 Evidence and completion claims

Acceptance shall bind requirements to exact tested candidate bytes and preserve the distinction between implemented functionality, Java parity evidence, package acceptance, and application acceptance.

Acceptance criteria:

1. All selected requirement criteria have pass/fail/not-run results with evidence locations and an accountable reviewer.
2. Java fixtures are independently authored and characterized against the pinned native implementation; Java source control flow is not mechanically translated into production JavaScript.
3. The matrix covers positive, negative, boundary, import, annotation, identity, mutation, and resource cases relevant to each member.
4. Structural comparisons preserve annotations and use one valid anonymous-identity correspondence across the compared structure; they do not erase distinctions to make results match.
5. Package boundary, affected unit/conformance suites, current governed repository checks, installed-candidate Node/browser checks, and selected WebVOWL scenarios cover the final candidate.
6. Expected differences are narrow, sourced, approved, and tested; missing Java oracle coverage is reported as unverified rather than parity.
7. Generated API/compatibility records distinguish supported members, omissions, internal implementation, public type exposure, and deferred families.
8. Package checks alone do not establish WebVOWL acceptance, and a source push alone does not establish registry or deployment acceptance.

## Acceptance case catalogue

The following identifiers define minimum discriminating evidence, not tests already written or passed.
Every member inventory must expand them where a distinct Java overload or semantic branch needs its own case.

| Case   | Required discriminator                                                                                           | Requirements              |
| ------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------- |
| AC-Q01 | Direct root fact versus import-only fact, shared transitive import, cycle, and unresolved import                 | REQ-003 to REQ-005        |
| AC-Q02 | Same IRI in distinct typed roles, anonymous restriction, multiple endpoints, and annotated n-ary axiom           | REQ-003, REQ-004          |
| AC-Q03 | Query before/after supported mutation and caller mutation of returned collections                                | REQ-005, REQ-006          |
| AC-Q04 | Java set versus stream multiplicity across caller-supplied ontologies                                            | REQ-002, REQ-004          |
| AC-C01 | Duplicate add, absent remove, annotated axiom distinction, mixed change batch, and late invalid change           | REQ-006                   |
| AC-C02 | Add/remove import declaration with counting acquisition and closure observations                                 | REQ-006                   |
| AC-C03 | Entity versus IRI rename, punning, literal text, nested/ontology annotations, collision, and batch map           | REQ-007                   |
| AC-C04 | Removal proposal, defensive result, repeated visit, reset, and unchanged source before application               | REQ-008                   |
| AC-R01 | Nested restriction precedence, Unicode escaping, literal spelling, and cardinality beyond the safe integer range | REQ-009                   |
| AC-R02 | Ordered annotation/language preferences, absent label, IRI annotation, tie, and fallback                         | REQ-010                   |
| AC-S01 | All supported representable structures and independent Java/JS reload of Turtle                                  | REQ-011                   |
| AC-S02 | Equivalent OWL/XML coverage with XML namespace/escaping cases                                                    | REQ-012                   |
| AC-S03 | Unrepresentable annotation/source structure, failed target preservation, and zero import acquisition             | REQ-011, REQ-012          |
| AC-P01 | Every selected profile rule with root/imported violations and separate EL/QL/RL outcomes                         | REQ-013                   |
| AC-P02 | Unresolved closure, unknown datatype, resource exhaustion, cancellation, and edited report staleness             | REQ-013                   |
| AC-M01 | BOTTOM/TOP/STAR, empty seed, disconnected/cyclic axioms, filter, and repeated extraction                         | REQ-014                   |
| AC-M02 | Explicit direct/closure base, unchanged full source, labelled partial view, and independent module export        | REQ-015                   |
| AC-N01 | Pinned performance corpus with construction, repeated operation, mutation maintenance, and heap                  | REQ-016                   |
| AC-W01 | Retained installed package in real Node and browser/worker consumers without private access                      | REQ-002, REQ-017, REQ-018 |

## Delivery selection and dependencies

This is a requirements grouping, not an implementation architecture or a replacement phase plan.
The recommended selection order is:

1. D1 structural queries: REQ-001 to REQ-005, with REQ-016 to REQ-018.
2. D2 changes and refactoring: REQ-006 to REQ-008 after their reference-query prerequisites, with the common requirements and a chosen consumer route.
3. D3 expression rendering: REQ-009 and REQ-010 after selected annotation-query support, with the common requirements.
4. D4 Turtle storage: REQ-011 using existing storage and shared mapping, followed by separately qualified REQ-012 OWL/XML storage.
5. D5 additional profiles: REQ-013, separately selecting EL, QL, or RL and completing its rule inventory.
6. D6 locality extraction: REQ-014 and REQ-015, after signature/locality evaluation coverage and exact namespace decisions.

D3 and D4 do not require a completed D2 merely to render or save an unchanged ontology.
An editing/export scenario does require whatever change and model-mapping support that scenario uses.
Internal indexes, duplicators, evaluators, and serializers may be needed as implementation mechanisms, but this document does not prescribe their module layout.

## Decisions required before implementation

| Decision                | Accountable owner                      | Required resolution                                                                                                                                   |
| ----------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial selection       | Repository owner                       | Select D1 and any later family/member subset; leave all others deferred                                                                               |
| Public call shapes      | owlapi maintainer and repository owner | Resolve overloads, iterable/stream semantics, visitor adaptation, supported inputs, and explicit omissions against exact Java members                 |
| Namespace and packaging | Repository owner                       | Approve exact manifest/export/file-list changes for new namespaces or shipped modules before changing configuration                                   |
| Consumer authority      | WebVOWL application owner              | Identify the ingestion or ontology editing/export seam and authoritative model for each selected scenario                                             |
| Additional adaptations  | Repository owner                       | Approve exact decision-ledger amendments; batch atomicity, report behavior, callbacks, and cancellation are not freely transferable between contracts |
| New performance targets | Maintainer and application owner       | Freeze corpus/workload baselines and any new bounded thresholds before acceptance                                                                     |
| Partial family claims   | Maintainer and reviewer                | Name selected members/locality classes/profile rules and test/document the unavailable remainder                                                      |
| Adoption and release    | Respective repository owners           | Keep library qualification, package publication, consumer configuration, browser acceptance, and deployment decisions distinct                        |

No configuration, runtime implementation, compatibility inventory, or workflow state is changed by authoring this draft.
The next step is requirements review and selection of a bounded delivery, then an implementation plan tied to the exact Java member matrix and consumer evidence.
