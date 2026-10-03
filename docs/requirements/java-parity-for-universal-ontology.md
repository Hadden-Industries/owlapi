# JavaScript OWLAPI requirements for Universal Ontology

**Status:** Proposed requirements for review; no capability is accepted or implemented by this document.

**Date:** 3 October 2026.

**Requirement sponsor and consumer decision owner:** Max, for Universal Ontology.

**Producer:** `Hadden-Industries/owlapi`, published as `@hadden-industries/owlapi` and consumed through the native npm alias `owlapi`.

**Audience:** JavaScript OWLAPI maintainers, Universal Ontology maintainers, implementers, and acceptance reviewers.

**Provenance:** Prepared in Universal Ontology on 3 October 2026 and relocated to this producer repository on 4 October 2026 as the canonical requirement source.
Original path: `Hadden-Industries/universal-ontology:docs/specs/2026-10-03-javascript-owlapi-java-parity-requirements.md`.
Original SHA-256: `be7a5f9dca79d24cdcd71d6f4872a3b556763e1e94adb606bd05acdc83fef608`.
The source was untracked in a checkout at `1489362d54b1c2a614a780e16e8190cca6416d88`; that revision identifies the inspected UO baseline, not a commit containing this document.
The relocation preserves the requirement text and identifiers; UO source links now target that fixed revision.

**Producer release context:** The [rc.2 plan](../plans/0.1.0-rc.2-java-parity.md) reconciles these proposed requirements with producer acceptance criteria.
Universal Ontology's integration, acceptance and adoption proceed at its own pace and do not gate any owlapi release.

## 1. Purpose and authority

Bring the JavaScript library closer to the functionality of Java OWLAPI where that functionality supports Universal Ontology's modelling, inspection, revision, qualification, and distribution work.
Every proposed public capability must have an existing public Java OWLAPI authority and preserve its responsibility and observable semantics, subject only to explicitly recorded JavaScript adaptations.
Consumer convenience alone is not sufficient grounds for a new library API.

The sponsor's governing instruction is: "it still needs to to conform to the functionality that exists in the current Java implementation".
The request authorizes preparing this requirements document and its acceptance criteria.
It does not approve implementation, API adaptations, configuration changes, dependency adoption, publication, or changes to ontology content.

This is the UO consumer's requirement source for a proposed producer capability programme.
It complements the existing [standalone import-closure contract](https://github.com/Hadden-Industries/universal-ontology/blob/1489362d54b1c2a614a780e16e8190cca6416d88/docs/specs/2026-08-22-self-contained-owl-import-closure-contract.md); it does not replace or amend that accepted contract.
The producer compatibility registry remains the authority for capabilities that actually exist in the JavaScript library.
Future implementation must reconcile approved requirements with that registry rather than treating this proposal as an implemented API declaration.

Capitalized MUST and MUST NOT express proposed acceptance obligations that become binding only for an explicitly accepted capability tranche.
SHOULD expresses a recommendation requiring a documented reason if omitted.
MAY expresses an option within the stated scope.

### 1.1 Reference baseline

| Evidence             | Observation used for this proposal                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Java authority       | Java OWLAPI 5.5.1 version line, source revision `d7e997a53b470e32700de89cc610d9daf01ea769`                                                           |
| Java source identity | Producer oracle records `owlapi-parent-5.5.1-7-gd7e997a53`; this identifies the exact source and is not a claim that the revision is the release tag |
| JavaScript source    | `Hadden-Industries/owlapi` HEAD `76350128fea814825fbe5f697bf45146b0b3cca2`, package version `0.1.0-rc.1`, inspected on 3 October 2026                |
| JavaScript registry  | `docs/compatibility/java-api-surface.json`, SHA-256 `cf367d97cea09eb9fe99b6f0e68f8ddb8ded8555259a4cc956b16bb19218ba6a`                               |
| UO source            | HEAD `1489362d54b1c2a614a780e16e8190cca6416d88`, inspected on 3 October 2026                                                                         |
| UO dependency        | Exact alias `owlapi: npm:@hadden-industries/owlapi@0.1.0-rc.1`                                                                                       |

Java source was inspected with `git show` at the pinned revision, not by assuming that the Java checkout's current HEAD matches the oracle.
These observations establish the starting gap analysis; they are not acceptance evidence for future changes.
The JavaScript checkout contained unrelated CI work that was excluded from this task.
Refresh the relevant source and registry observations before implementation.
The recorded Java revision is the existing comparison authority, not a claim about the newest upstream release.
A newer Java authority requires a deliberate baseline decision and repeatable comparisons before adoption.

### 1.2 Source register

All Java paths below are relative to the [pinned Java source tree](https://github.com/owlcs/owlapi/tree/d7e997a53b470e32700de89cc610d9daf01ea769).
Public interface declarations, inherited contracts, concrete implementation behaviour, and Java tests must be read together when settling a method's semantics.

| ID            | Authority                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J-QUERY       | `api/src/main/java/org/semanticweb/owlapi/model/OWLAxiomIndex.java`; `OWLAxiomCollection.java`; `OWLSignature.java`; relevant inherited `Has*` interfaces                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| J-SEARCH      | `api/src/main/java/org/semanticweb/owlapi/search/EntitySearcher.java`; `Searcher.java`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| J-AXIOM       | `api/src/main/java/org/semanticweb/owlapi/model/OWLAxiom.java`; `HasAnnotations.java`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| J-CHANGE      | `api/src/main/java/org/semanticweb/owlapi/model/OWLOntologyManager.java`; `HasApplyChanges.java`; `HasApplyChange.java`; `HasRemoveAxiom.java`; `HasRemoveAxioms.java`; `OWLOntologyChange.java`; the selected concrete change classes                                                                                                                                                                                                                                                                                                                                                                     |
| J-DUPLICATE   | `api/src/main/java/org/semanticweb/owlapi/util/OWLObjectDuplicator.java`; `RemappingIndividualProvider.java`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| J-RENAME      | `api/src/main/java/org/semanticweb/owlapi/util/OWLEntityRenamer.java`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| J-PROFILE     | `api/src/main/java/org/semanticweb/owlapi/profiles/OWL2ELProfile.java`; `OWL2QLProfile.java`; `OWL2RLProfile.java`; their shared checker and violation implementations                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| J-MODULE      | `tools/src/main/java/org/semanticweb/owlapi/modularity/locality/SyntacticLocalityModuleExtractor.java`; `LocalityModuleExtractor.java`; `LocalityClass.java`; `SyntacticLocalityEvaluator.java`; `tools/src/main/java/org/semanticweb/owlapi/modularity/ModuleExtractor.java`                                                                                                                                                                                                                                                                                                                              |
| JS-REGISTRY   | [Producer compatibility registry](https://github.com/Hadden-Industries/owlapi/blob/76350128fea814825fbe5f697bf45146b0b3cca2/docs/compatibility/java-api-surface.json) and its generated API views                                                                                                                                                                                                                                                                                                                                                                                                          |
| JS-BOUNDARY   | [Standalone consumer prerequisites](https://github.com/Hadden-Industries/owlapi/blob/76350128fea814825fbe5f697bf45146b0b3cca2/docs/compatibility/standalone-import-closure-prerequisites.md), including public Java package ownership and no-shim rules                                                                                                                                                                                                                                                                                                                                                    |
| JS-ADAPTATION | [Existing Java API parity precondition](https://github.com/Hadden-Industries/owlapi/blob/76350128fea814825fbe5f697bf45146b0b3cca2/docs/plans/java-api-parity-precondition.md) and the registry's per-binding qualifications                                                                                                                                                                                                                                                                                                                                                                                |
| UO-QUERY      | [Release query index builder](https://github.com/Hadden-Industries/universal-ontology/blob/1489362d54b1c2a614a780e16e8190cca6416d88/packages/universal-ontology-query/src/createOntologyReleaseQueryIndex.js), [projection policy](https://github.com/Hadden-Industries/universal-ontology/blob/1489362d54b1c2a614a780e16e8190cca6416d88/packages/universal-ontology-projection-policy/src/ontologyProjectionProperties.js), and [WebMCP contract](https://github.com/Hadden-Industries/universal-ontology/blob/1489362d54b1c2a614a780e16e8190cca6416d88/docs/webmcp-ontology-entity-definition-lookup.md) |
| UO-CHANGE     | [Rooted RDF change comparison](https://github.com/Hadden-Industries/universal-ontology/blob/1489362d54b1c2a614a780e16e8190cca6416d88/scripts/ontology_policy/changes.py)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| UO-POLICY     | [Policy ownership](https://github.com/Hadden-Industries/universal-ontology/blob/1489362d54b1c2a614a780e16e8190cca6416d88/docs/policy/README.md) and [validator implementation](https://github.com/Hadden-Industries/universal-ontology/blob/1489362d54b1c2a614a780e16e8190cca6416d88/scripts/ontology_policy/validation.py)                                                                                                                                                                                                                                                                                |
| UO-ARTIFACT   | [Import-closure materialization guide](https://github.com/Hadden-Industries/universal-ontology/blob/1489362d54b1c2a614a780e16e8190cca6416d88/docs/import-closure-materialization.md), [structural fingerprint](https://github.com/Hadden-Industries/universal-ontology/blob/1489362d54b1c2a614a780e16e8190cca6416d88/scripts/ontology/ontologyStructuralFingerprint.js), and [RDF/XML to JSON-LD conversion](https://github.com/Hadden-Industries/universal-ontology/blob/1489362d54b1c2a614a780e16e8190cca6416d88/scripts/rdfXmlToJsonLd.js)                                                              |

## 2. Motivation and measurable outcomes

### 2.1 Stakeholders and concerns

- UO authors and reviewers need accurate structural inspection and controlled ontology revisions.
- UO consumers need authored definitions, formal descriptions, and release identities to remain distinct and truthful.
- JavaScript OWLAPI maintainers need bounded compatibility, maintainable ownership, and evidence that a familiar Java name denotes the corresponding behaviour.
- Other library consumers, including WebVOWL, need existing parsing, storage, and profile contracts preserved when the public surface grows.

**MOT-001 — Compatibility constraint.**
Public functionality must derive from Java OWLAPI rather than a UO-specific wishlist.
Source: the sponsor's instruction and JS-BOUNDARY.
Confidence is high because the boundary is explicit.
The risk of ignoring it is an incompatible public API that becomes difficult for multiple consumers to unwind.

**MOT-002 — Inspection gap.**
The JS ontology facade currently provides direct axiom queries, signatures by kind, and direct referencing-axiom queries, while the richer Java query/search surfaces remain deferred.
Source: JS-REGISTRY and the inspected producer implementation.
This is an observed baseline fact, not a claim that all UO parsing should immediately migrate to that facade.

**MOT-003 — Revision gap.**
The manager currently adds axioms and applies `SetOntologyID` and `AddOntologyAnnotation`; removal records, import changes, duplication, and renaming are not exposed.
Source: JS-REGISTRY.
The proposed benefit to UO migrations is a hypothesis until a real consumer exercise demonstrates it.

**MOT-004 — Existing evidence must remain useful.**
UO already compares rooted RDF graphs, checks RDF conversion equivalence, and qualifies standalone OWL artifacts.
Source: UO-CHANGE and UO-ARTIFACT.
New OWL primitives must complement these controls, not silently substitute a different equality or preservation claim.

The proposed outcome owner is the UO maintainer, with Max accountable for consumer acceptance; the producer maintainer owns Java-parity evidence.
Review outcomes at each selected tranche's acceptance and before UO adoption.

| Outcome                             | Baseline and proposed target                                                                                                                                                              | Measurement and acceptance window                                                            | Causal hypothesis and limitation                                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| OUT-001: accurate structural lookup | Baseline: richer Java queries are unavailable in JS. Target: every selected query matches Java on the agreed fixtures and UO cases.                                                       | Compare query result membership, scope, annotations, and entity kinds during QRY acceptance. | Shared Java-compatible primitives reduce custom structural search. They do not establish better label selection or prove a latency improvement.      |
| OUT-002: reproducible revisions     | Baseline: selected removal, duplication, and rename operations are unavailable. Target: selected change sequences produce the same structural state as Java, modulo accepted adaptations. | Compare pre/post states, change lists, and fresh reloads during CHG/TRN acceptance.          | Structural changes reduce hand reconstruction. UO ownership, migration policy, and human conceptual review remain necessary.                         |
| OUT-003: profile qualification      | Baseline: JS exposes OWL 2 DL checking. Target: each selected EL/QL/RL checker matches the pinned Java verdict and violation meaning.                                                     | Compare positive, negative, closure, and UO cases during PRF acceptance.                     | Profile checks identify consumer suitability; they do not prove logical consistency. Actual UO profile membership is unknown until measured.         |
| OUT-004: reusable extraction        | Baseline: JS locality extraction is deferred. Target: selected extraction modes return Java-equivalent axiom membership.                                                                  | Compare modes, seeds, filters, and fixed-point cases during MOD acceptance.                  | Locality modules can support focused reuse and tests. No guaranteed size reduction, minimality, or completeness of lexical documentation is assumed. |

Targets are proposed technical acceptance targets, not approved business benefits or measured performance baselines.
The do-nothing option preserves the current working library and UO tooling but leaves these parity gaps and consumer-side composition costs in place.
The trade-off is a larger maintained public surface, more package namespaces, and increased regression and qualification work.

## 3. Scope and ownership

### 3.1 Capability tranches

| Tranche                                | Requirement groups | Proposed priority and prerequisites                                                                              |
| -------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| T1: structural queries and comparisons | QRY and AX         | First adoption candidate; reuses the current structural model and import lifecycle.                              |
| T2: ontology change operations         | CHG                | Completes the missing operations needed by Java refactoring utilities; depends on reliable post-change queries.  |
| T3: duplication and entity renaming    | TRN                | Depends on T1/T2, axiom annotation operations, and exact anonymous-individual behaviour.                         |
| T4: additional profile checking        | PRF                | Reuses the existing DL checking/report architecture; a concrete consumer profile need should determine ordering. |
| T5: syntactic locality extraction      | MOD                | Depends on complete supported-object traversal, signature handling, and Java extraction evidence.                |

These are acceptance boundaries and dependencies, not an implementation architecture or delivery schedule.
Selecting one tranche does not authorize the others.
An accepted subset must enumerate its methods and omitted operations; it must not be described as complete Java parity.
In this document, every listed family is in the proposed programme, while implementation approval remains separate.

### 3.2 Library responsibilities

The library owns structural objects, Java-compatible queries, change operations, the selected Java utilities, profile checks, and module extraction.
Performance indexes and other private mechanisms are implementation choices; an index is not itself a new public Java-parity capability.
The existing JavaScript adaptation rules govern collection types, asynchronous operations, error conventions, and manager ownership.

UO owns preferred-label/definition selection, historical vocabulary interpretation, entity ownership, SHACL editing rules, authority snapshots, migration permission, release-change narratives, MCP schemas, catalog/network policy, and publication decisions.
For example, UO may associate a query result with its source ontology by querying each closure member; this does not authorize a new provenance-enriched return type in `owlapi`.

### 3.3 Exclusions

This programme does not propose:

- A public `materializeImportClosure`, `collapseImports`, UO release-diff service, or entity-description DTO.
- A new source-accounting or general RDF/JS API without a separately demonstrated public Java authority.
- SHACL execution or a replacement for UO's existing Python/Jena policy validation.
- A general reasoner, logical-equivalence engine, justification service, or reasoning adapter.
- Semantic locality extraction, automatic minimal-module claims, or arbitrary graph neighbourhood extraction.
- SWRL, unsupported structural kinds, full Java visitor/class hierarchy parity, or all Java overloads by implication.
- Textual IRI replacement, inferred axioms, automatic repair, fabricated declarations, or provenance annotations.
- Changes to source ontologies, maintained dependency pins, package exports, CI settings, repository policy, or published artifacts during document authoring.

## 4. Common parity requirements

### PAR-001 — Exact Java authority

Every selected operation MUST identify its public Java type, method or constructor, declaring/inherited source, concrete implementation, and the pinned source revision before implementation acceptance.

Acceptance criteria:

1. The authority ledger lists every selected public member; broad class-name resemblance is insufficient.
2. The Java oracle executes the corresponding operation at the recorded revision.
3. Inputs and expected outputs are reproducible; Java exceptions and side effects are retained where relevant.
4. Conflicting Javadoc and implementation behaviour are recorded and resolved explicitly rather than silently choosing the preferred interpretation.

### PAR-002 — Bounded API ownership

Public bindings MUST have one canonical owner in the producer's approved Java-shaped namespace, with supported and omitted members recorded.
Java interfaces MAY be realised through the existing JS facade rather than nominal classes with no runtime responsibility.

Acceptance criteria:

1. The public surface registry records each selected capability and its Java mapping.
2. Package-boundary checks demonstrate canonical identity and reject access to private implementation modules.
3. No forwarding shim, duplicate binding, invented compatibility alias, or UO-specific public helper is introduced.
4. Proposed `search` and `modularity/locality` namespaces are recorded as future export-map decisions; no configuration change is inferred from this proposal.

### PAR-003 — Explicit JavaScript adaptations

Only adaptations needed by the established JS runtime and package contracts MAY differ from Java behaviour.
Each new difference MUST receive a precise compatibility-ledger decision before dependent acceptance.

Acceptance criteria:

1. Java streams/collections and overloads have documented JS call shapes, scope defaults, result semantics, and omissions.
2. Existing collection order, defensive-copy guarantees, synchronous/asynchronous shapes, error families, and boolean change results are not changed accidentally.
3. Return-type normalization in differential tests does not erase order, multiplicity, scope, or exceptions when those are part of the selected contract.
4. A surprising Java result fails comparison until reconciled; it is not repaired automatically or labelled an adaptation after the fact.

## 5. Structural query requirements

Authority: J-QUERY and J-SEARCH.
Outcome: OUT-001.
Owner: producer maintainer for functionality; UO maintainer for consumer use.

### QRY-001 — Entity annotations and declarations

Provide selected Java equivalents of `getAnnotationAssertionAxioms` and `getDeclarationAxioms`, including the import-scoped annotation-assertion form.
Annotation subjects and ontology-header annotations MUST remain distinct.

Acceptance criteria:

1. Queries return the same structural axiom membership as Java for named entity IRIs, supported annotation subjects, absent subjects, and punned IRIs.
2. Literal lexical forms, language tags, datatype IRIs, IRI-valued annotations, axiom annotations, and nested annotations survive unchanged.
3. Direct and imports-inclusive calls return the Java-selected membership, including a chain, diamond, and cycle of imports.
4. No declarations, labels, or definitions are inferred; modifying a defensive result cannot modify an ontology.

### QRY-002 — Class axiom queries

Provide `getSubClassAxiomsForSubClass`, `getSubClassAxiomsForSuperClass`, `getEquivalentClassesAxioms`, and `getDisjointClassesAxioms` equivalents.
Support the Java generic import-scoped query or explicit consumer composition where a named Java convenience method is direct-only; do not invent closure overloads indiscriminately.

Acceptance criteria:

1. Left/right-position matching agrees with Java; occurrence nested within an expression is not mistaken for equality at the selected position.
2. Anonymous superclass expressions, existential/universal restrictions, intersections, unions, and cardinalities return intact.
3. Equivalent/disjoint n-ary axioms, repeated structural input, built-in classes, and no-match cases agree with Java.
4. No transitive subclass traversal, inferred equivalence, or restriction flattening is performed.

### QRY-003 — Property axiom queries

Provide Java equivalents for object/data subproperty queries in both positions, object/data property domain and range queries, inverse-object-property queries, and annotation-property hierarchy/domain/range queries.
Select operations by the Java property-expression type rather than by IRI text alone.

Acceptance criteria:

1. Object, data, and annotation property categories remain separate even when their IRIs overlap in supported inputs.
2. Inverse object-property expressions, anonymous domains, and datatype restrictions match Java results.
3. Property-chain axioms are not treated as simple subproperty axioms unless the selected Java method does so.
4. Direct/imports semantics and empty results match the corresponding Java member; authored domains are not treated as SHACL constraints.

### QRY-004 — References across imports

Extend the selected referencing-axiom query to Java's supported primitive types and imports scope, preserving the existing entity call.

Acceptance criteria:

1. References in nested expressions, declarations, annotation subjects/values, and axiom annotations match Java for each supported primitive type.
2. Equal IRI text in a literal is not an IRI reference.
3. Entity-kind references and IRI-wide references are distinguished exactly as Java distinguishes them.
4. Closure traversal handles shared imports and cycles without multiplying set-valued results; source-ontology attribution remains consumer composition.

### QRY-005 — Signature inspection

Provide selected `OWLSignature` equivalents for aggregate and imports-inclusive signatures, entity containment, `getPunnedIRIs`, and referenced anonymous individuals.

Acceptance criteria:

1. Each supported named kind is discoverable, including entities used without explicit declarations where Java includes them.
2. Kind-aware and IRI-aware containment agree with Java and do not conflate declarations with use.
3. Punning returns the Java-defined IRI set; illegal profile combinations are not silently removed from inspection.
4. Anonymous individuals retain sharing within a source and separation across documents; tests compare identity relationships rather than incidental blank-node labels.

### QRY-006 — Selected EntitySearcher operations

Provide Java `EntitySearcher` equivalents for annotation objects, asserted super/subclasses, equivalent/disjoint classes, property super/subproperties, and domains/ranges for supported categories.
Single-ontology and selected multi-ontology forms MUST retain their respective Java semantics.

Acceptance criteria:

1. The same inputs produce Java-equivalent values and any contractually significant multiplicity.
2. `getAnnotations` and `getAnnotationObjects` are not collapsed into one operation: their handling of annotations on annotation assertions follows the selected Java implementation.
3. `getSuperClasses` returns asserted expressions, not the inferred transitive hierarchy; equivalent/disjoint results follow Java's handling of the queried entity itself.
4. UO can build an authored formal-description fixture using public APIs while retaining its existing lexical-selection policy and immutable release identity.

## 6. Axiom collection and annotation requirements

Authority: J-QUERY and J-AXIOM.
Outcomes: OUT-001 and OUT-002.

### AX-001 — Collection membership and annotation-insensitive matching

Provide selected equivalents of `containsAxiom`, `containsAxiomIgnoreAnnotations`, `getAxiomsIgnoreAnnotations`, logical-axiom retrieval, and relevant type/count queries with Java's supported scope and annotation choices.
Reuse existing structural equality and `equalsIgnoreAnnotations` behaviour.

Acceptance criteria:

1. Two axioms differing only in their own annotations compare differently when annotations are considered and equally when ignored, matching Java.
2. Ignoring axiom annotations does not erase literal metadata or turn different annotation-assertion content into equal axioms.
3. Matching returns the actual stored annotated variants rather than invented replacements; counts and set/stream behaviour match the selected Java operation.
4. UO can distinguish an axiom annotation change from a logical-axiom membership change without changing its rooted RDF editing-policy comparison.

### AX-002 — Annotated axiom copies

Provide `getAxiomWithoutAnnotations` and `getAnnotatedAxiom` equivalents for every currently supported axiom kind.

Acceptance criteria:

1. Removing annotations preserves the axiom's structural body and kind, including annotation-assertion property/subject/value content.
2. `getAnnotatedAxiom` merges supplied annotations with existing annotations, as Java specifies; it does not replace the existing annotation set.
3. Structural duplicate annotations are handled as Java handles them; nested annotations on retained annotation objects survive.
4. The original object and every ontology containing it remain unchanged; replacing stored axioms requires explicit change operations.

## 7. Ontology change requirements

Authority: J-CHANGE.
Outcome: OUT-002.
Dependencies: T1 query correctness and existing manager ownership/identity rules.

### CHG-001 — Concrete change records

Provide canonical `AddAxiom`, `RemoveAxiom`, `AddImport`, `RemoveImport`, and `RemoveOntologyAnnotation` equivalents alongside existing changes.
The selected records MUST work through the existing `applyChange` and `applyChanges` entry points.

Acceptance criteria:

1. Each record identifies its target ontology and exact structural payload according to the selected Java constructor and inspection contract.
2. Ordered mixed sequences produce the Java-equivalent final state after applying approved JS result/error adaptations.
3. Unsupported records and malformed payloads reject explicitly; no partial object is accepted as a nominal Java change type.
4. Adding an existing item and removing an absent item produce the documented no-op result; tests include inverse and repeated operations.

### CHG-002 — Axiom removal

Provide the selected Java-equivalent manager removal operations for one axiom and an iterable of axioms.

Acceptance criteria:

1. Removal matches complete structural equality, including axiom annotations, unless the selected Java operation explicitly says otherwise.
2. Removing one annotated variant preserves other stored variants.
3. Updated signatures, reference queries, type counts, and profiles observe the committed state; previous defensive snapshots remain unchanged.
4. Removal never edits an imported ontology merely because its axiom appears in the root's closure.

### CHG-003 — Import and ontology-annotation changes

Apply Java-compatible import-declaration and ontology-annotation changes while keeping managed identity and closure behaviour coherent.
Adding a declaration, loading an ontology, and admitting a previously unresolved import are distinct effects to specify against Java.

Acceptance criteria:

1. Already-managed imports, removed imports, cycles, diamonds, version IRIs, and anonymous ontologies produce Java-equivalent declaration and closure membership.
2. Unresolved imports have an explicit, tested policy; asynchronous loading and failure differences require a preaccepted adaptation rather than an undocumented network side effect.
3. Removing a header annotation does not remove an annotation-assertion axiom using the same IRI/value.
4. Loading, storage, catalog resolution, and UO publication policy are not silently changed by these records.

### CHG-004 — Preserve manager safety

Extend change support without weakening the established JS ownership checks, batch atomicity, or source-evidence invalidation rules.
These are existing JS contract constraints, not claims that Java batches are transactional.

Acceptance criteria:

1. A foreign/unmanaged target, invalid payload, or failing input iterator leaves the entire selected batch's managed state unchanged.
2. A successful batch across multiple owned ontologies exposes a coherent committed state and the documented change result.
3. Actual structural mutation makes original source-qualified evidence stale as required by the existing producer contract; newly queried/profile-checked state cannot reuse stale certification.
4. Identity conflicts, invalid scope, and no-op handling preserve existing error and invalidation decisions; any new return/error difference is recorded under PAR-003.

## 8. Duplication and renaming requirements

Authority: J-DUPLICATE and J-RENAME.
Outcome: OUT-002.
Dependencies: T1/T2 and AX-002.

### TRN-001 — OWLObjectDuplicator

Provide the Java utility's selected no-replacement, entity-to-IRI, IRI-to-IRI, and literal-replacement forms for the library's supported structural objects.
Each form's anonymous-individual policy MUST be tied to its Java constructor/provider behaviour.

Acceptance criteria:

1. Every supported axiom, expression, annotation, literal, and entity kind is covered by a recorded traversal matrix; unsupported kinds reject rather than disappear.
2. With no replacement, copies preserve Java-equivalent structure modulo the selected anonymous-individual remapping; sharing is preserved within the duplication operation.
3. Entity-specific and IRI-wide maps behave differently where Java distinguishes them, including punning and IRI-valued annotations.
4. Literal replacement uses structural literal identity; untouched lexical forms, language tags, datatype IRIs, exact cardinalities, and nested annotations are preserved.
5. The input object and ontology remain unchanged; repeated use of a duplicator follows Java's state/provider semantics rather than assuming a fresh remapping on every call.

### TRN-002 — OWLEntityRenamer

Provide Java's IRI-wide, entity-specific, and entity-map `changeIRI` capabilities over an explicitly selected collection of ontologies.
Return ordinary change records for inspection; generating a rename MUST NOT apply it.

Acceptance criteria:

1. Before application, all source ontologies are unchanged and the proposed changes can be inspected through the selected change-record contract.
2. Changes cover the same referencing/declaration/annotation axioms and ontology annotations that Java changes for each form.
3. Punned entities, mappings with overlapping targets, mappings to existing IRIs, nested expressions, and unchanged mappings match Java; lexical text containing an IRI is not string-replaced.
4. Change-record order and multiplicity are compared where observable; duplicate records emitted by Java are not silently deduplicated to make the result look cleaner.
5. Applying the generated list through T2 yields Java-equivalent final state; only the selected ontologies change, and imports declarations/ontology IDs change only if Java's selected operation changes them.
6. UO's ownership and migration decisions are checked by the consumer before application; the library does not manufacture deprecation, replacement, UUID, or compatibility metadata.

## 9. Profile requirements

Authority: J-PROFILE.
Outcome: OUT-003.

### PRF-001 — OWL 2 EL, QL, and RL checkers

Provide `OWL2ELProfile`, `OWL2QLProfile`, and `OWL2RLProfile` equivalents through the existing profile namespace and report conventions.
The selected checkers MUST assess the managed closure using the restrictions actually applied by the pinned Java implementation.

Acceptance criteria:

1. Valid, invalid, direct, imported, and combined-closure cases agree with Java for each profile.
2. Tests cover profile-specific construct restrictions, property restrictions, datatypes, declaration requirements, and global restrictions; being in DL does not imply membership in another profile.
3. Violations retain equivalent offending objects and constraint meaning, with a documented mapping to existing JS report/error conventions.
4. No checker changes the ontology, drops offending axioms, inserts declarations, or calls its result a consistency proof.
5. Real UO profile failures are retained as truthful results; acceptance does not require UO content to be rewritten to pass every profile.

### PRF-002 — Incomplete checks and source assessment

Preserve the existing distinction between formal-model validity, optional source assessment, and incomplete checking.
Any extension of source assessment to a new profile requires its own bounded evidence and adaptation decision.

Acceptance criteria:

1. Cancellation, exhausted budgets, stale source evidence, and unsupported assessment paths never produce a valid certification.
2. Report identity, immutable diagnostics, closure revisions, and formal `valid`/`invalid`/`unverified` conventions remain compatible with existing DL reports.
3. Synthetic negative cases exercise each incomplete path without concealing it as an empty violation list.
4. A formal profile pass makes no claim about original RDF preservation, SHACL conformance, inferred consistency, or UO publication acceptance.

## 10. Module extraction requirements

Authority: J-MODULE.
Outcome: OUT-004.

### MOD-001 — Syntactic locality extraction

Provide the selected `SyntacticLocalityModuleExtractor` capability with Java `LocalityClass.BOTTOM`, `TOP`, and `STAR`, seed signatures, and the selected optional axiom-filter contract.
Use the `org.semanticweb.owlapi.modularity.locality` family recorded in the producer registry; do not substitute the separate legacy `uk.ac.manchester.cs.owlapi.modularity` implementation.

Acceptance criteria:

1. Each mode returns the same structural axiom membership as the pinned Java extractor on positive, negative, empty-seed, empty-base, and interconnected fixtures.
2. STAR tests demonstrate the Java alternating-locality fixed point, not a single BOTTOM or TOP pass.
3. Filters, global axioms, datatype/class/property expressions, and supported axiom kinds follow Java; unsupported structures fail explicitly.
4. Repeated extraction, reordered set-valued inputs, and shared anonymous structures retain the selected Java semantics.
5. Extraction never changes the input ontology or claims that a locality module is a globally minimal ontology or an arbitrary neighbourhood.

### MOD-002 — Output and consumer composition

The extraction result MUST remain the Java-equivalent axiom result.
UO owns any root identity, header annotations, lexical supplements, imports policy, artifact name, and publication decision for a generated distribution.

Acceptance criteria:

1. A UO exercise records seed entities, source closure, extraction mode, filters, and exact extracted membership before adding consumer-owned metadata.
2. Any Java `extractAsOntology` convenience form selected later has its own authority and acceptance row; it is not assumed from accepting axiom extraction.
3. If UO serializes a module, representable output reloads in a fresh offline manager with equivalent selected structure; a typed representability failure is retained when a syntax cannot express it.
4. Supporting documentation does not promise that all labels, definitions, or provenance are included by locality extraction itself.

## 11. Qualification and evidence requirements

### QUAL-001 — Differential evidence

Every selected functional requirement MUST have Java differential coverage and explicit negative cases.
The evidence must identify requirement/criterion, Java revision and runtime, JS revision/package identity, fixture bytes/digests, operation arguments, normalized results, and actual pass/fail/incomplete status.
Identify each numbered criterion as `<requirement-ID>/AC-<number>`, for example `QRY-001/AC-1`, and retain that key in the acceptance ledger.

Acceptance criteria:

1. Every criterion has an evidence row or an explicit gap; a deferred criterion is not a pass.
2. Structural comparison preserves annotations, literal metadata, entity kinds, and document-scoped anonymous identity; only documented normalization is used.
3. Expected results come from the pinned Java operation, not exclusively from JS self-comparison or a second consumer implementing the same algorithm.
4. Failing and inconclusive evidence remains available; no excluded fixture or changed oracle expectation can manufacture completion.

### QUAL-002 — Regression protection

Acceptance MUST preserve existing supported public behaviour and consumer obligations.

Acceptance criteria:

1. Producer checks relevant to parsing, storage, imports, structural equality, DL/source assessment, and package boundaries pass for the actual selected candidate.
2. Relevant UO tests preserve root identity, root annotations, closure union, anonymous separation, literal metadata, offline verification, and atomic destination failure behaviour.
3. Existing query projection and SHACL facts remain unchanged unless a separately accepted UO change explicitly changes them.
4. Other affected consumers are qualified through their actual adapters; a producer unit test does not stand in for WebVOWL or UO acceptance.

### QUAL-003 — Resource and performance evidence

Query, mutation, profile, and extraction work MUST retain existing resource-safety guarantees and provide measured evidence for any performance claim.
No numerical throughput improvement is asserted by this proposal.

Acceptance criteria:

1. The benchmark protocol records hardware/runtime, exact ontology bytes, direct/closure sizes, operation mix, cold/warm state, mutation invalidation, repetitions, latency distribution, and memory observations.
2. Existing and candidate behaviour are compared on the same protocol; a representative upper-size fixture exercises bounded failure behaviour.
3. Required latency/memory budgets and any permitted regression must be agreed before performance acceptance; an unset budget cannot certify acceptable performance.
4. Partial work, cancellation, and stale indexes do not return apparently complete results; any new public cancellation or budget option requires PAR-003 authority/adaptation review.

### QUAL-004 — Real UO consumer exercises

Producer parity acceptance and UO adoption MUST remain separate evidence decisions.
The minimum consumer corpus uses the existing four import-closure families: ISO/IEC 11179-3, reference data, Core, and Extended, plus targeted fixtures for behaviours absent from those families.

Acceptance criteria:

1. T1 exercises entity annotations, formal class descriptions, property queries, signatures, and direct/closure differences on exact retained source bytes.
2. T2/T3 exercise a reversible in-memory revision/rename on disposable copies, compare Java final state, and reload representable Functional Syntax and RDF/XML outputs; authored sources remain untouched.
3. T4 retains each family's actual profile verdict; T5 records at least one seed-based module case and its Java-equivalent axiom set.
4. Cases bind immutable ontology/version identity and input hashes, not merely mutable `latest` aliases or unrelated historical receipts.

### QUAL-005 — Public documentation and installed-package evidence

Selected capabilities MUST be truthful in the compatibility registry, generated API views, package exports, and installed-package behaviour before being advertised.

Acceptance criteria:

1. Supported members, omitted members, Java authorities, adaptations, errors, and verification references agree across the registry and generated views.
2. Qualified installed-package tests exercise canonical imports from the retained artifact in the producer's declared Node/browser environments, including supported worker usage where affected.
3. There is no accidental private export, runtime Java dependency, duplicate API identity, or claim that a class name supplies unimplemented members.
4. Configuration/manifest/export-map/lockfile edits are independently authorized for their exact files and settings before execution; this requirement is not that authorization.

### QUAL-006 — Staged release and adoption evidence

Acceptance MUST distinguish source correctness, retained-candidate qualification, public-registry verification, and UO production adoption.

Acceptance criteria:

1. Source parity completion identifies the exact selected member set and every unresolved criterion.
2. Candidate qualification binds the complete selected scope to exact artifact bytes and package inventory.
3. Registry acceptance independently verifies the published artifact's identity, integrity, provenance, and equality with the qualified candidate where required by the maintained release contract.
4. UO adoption uses an explicitly approved exact dependency pin and reruns affected consumer acceptance; publication or a passing producer build alone does not authorize the cutover.

## 12. Acceptance matrix and fixture catalogue

### 12.1 Required fixture categories

| Fixture category | Required cases                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-QUERY          | Named/absent entities; all supported named kinds; punning; explicit declarations and undeclared uses; n-ary class axioms; anonymous expressions; inverse properties; property chains; direct and imported facts |
| F-ANNOTATION     | Header annotations versus annotation assertions; IRI and literal values; nested annotations; two annotated variants of one logical axiom; annotation content differing independently of axiom annotations       |
| F-CLOSURE        | Chain, diamond, cycle, shared import, unresolved import, version identity, anonymous root, and two documents reusing a blank-node label                                                                         |
| F-CHANGE         | Duplicate add, absent remove, ordered inverses, mixed ontology batches, iterator failure, foreign manager, invalid payload, identity conflict, and stale source assessment                                      |
| F-TRANSFORM      | Entity-specific and IRI-wide maps; punned IRI; literal map; overlapping destinations; existing target IRI; untouched IRI text in literals; anonymous sharing/remapping; repeated duplicator use                 |
| F-PROFILE        | Valid and invalid EL/QL/RL cases; global/imported restrictions; invalid lexical/value spaces; unsupported/incomplete paths; cancellation and budgets                                                            |
| F-MODULE         | BOTTOM/TOP/STAR differences; globals; empty inputs; interconnected axiom base; filter boundaries; supported constructor families; repeated extraction                                                           |
| F-UO             | Retained four-family sources and targeted additions, preserving existing UO contract and projection invariants                                                                                                  |
| F-PACKAGE        | Exact installed artifact, canonical namespace identity, denied private imports, declared runtime/browser matrix, and applicable consumer qualification                                                          |

Fixtures must distinguish structural equality from graph isomorphism and logical equivalence.
Anonymous identifiers may be renamed bijectively for cross-process comparison, but within-source sharing and cross-source separation must not be erased.
Finite differential fixtures provide evidence for the declared scope; they are not a proof of equivalence on every possible ontology.

### 12.2 Traceability

| Requirements                 | Outcome/constraint                 | Java or maintained authority                 | Primary evidence                                                   |
| ---------------------------- | ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| PAR-001, PAR-002, PAR-003    | MOT-001                            | J-*; JS-REGISTRY; JS-BOUNDARY; JS-ADAPTATION | Authority/member ledger, adaptation decisions, F-PACKAGE           |
| QRY-001, QRY-002, QRY-003    | OUT-001                            | J-QUERY                                      | F-QUERY, F-ANNOTATION, F-CLOSURE, F-UO                             |
| QRY-004, QRY-005             | OUT-001                            | J-QUERY and inherited interfaces             | F-QUERY, F-CLOSURE, F-TRANSFORM                                    |
| QRY-006                      | OUT-001                            | J-SEARCH                                     | F-QUERY, F-ANNOTATION, F-UO                                        |
| AX-001, AX-002               | OUT-001, OUT-002                   | J-QUERY; J-AXIOM                             | F-ANNOTATION, F-CLOSURE, F-UO                                      |
| CHG-001, CHG-002, CHG-003    | OUT-002                            | J-CHANGE                                     | F-CHANGE, F-CLOSURE, before/after Java state                       |
| CHG-004                      | OUT-002; existing JS safety        | JS-REGISTRY; JS-ADAPTATION                   | F-CHANGE, F-PROFILE, failure snapshots                             |
| TRN-001, TRN-002             | OUT-002                            | J-DUPLICATE; J-RENAME                        | F-TRANSFORM, ordered change lists, F-UO                            |
| PRF-001                      | OUT-003                            | J-PROFILE                                    | F-PROFILE, F-CLOSURE, F-UO                                         |
| PRF-002                      | OUT-003; existing JS report safety | JS-REGISTRY; J-PROFILE                       | Incomplete-path evidence, report contract checks                   |
| MOD-001, MOD-002             | OUT-004                            | J-MODULE; UO-ARTIFACT                        | F-MODULE, F-UO, membership and offline reload                      |
| QUAL-001                     | All selected outcomes              | All selected Java authorities                | Criterion-by-criterion differential ledger                         |
| QUAL-002, QUAL-003           | Existing safety and bounded claims | Maintained producer/consumer contracts       | Regression receipts, failure evidence, benchmark protocol          |
| QUAL-004, QUAL-005, QUAL-006 | Consumer and delivery separation   | UO-ARTIFACT; maintained release contracts    | Consumer, installed-package, candidate, registry, adoption records |

No requirement is complete merely because its Java type exists, its implementation compiles, or another requirement's tests pass.
Acceptance records identify a criterion as satisfied, failed, incomplete, or outside the explicitly selected tranche.
Whole-programme completion requires all approved tranches; a T1 result must be named T1 acceptance.

## 13. Decisions and unresolved evidence

| Decision                             | Owner                                              | Required resolution                                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-001: programme and initial tranche | Max and producer maintainer                        | Accept or revise this proposal; select exact members and priorities. No implementation approval is inferred from document authoring.                                |
| D-002: JS call shapes and namespaces | Producer maintainer, with Max for contract changes | Settle stream/collection/overload adaptations and exact export-map changes before implementation. Preserve Java responsibility and existing consumer compatibility. |
| D-003: performance budgets           | Producer and UO maintainers                        | Capture baseline measurements and agree candidate budgets; currently no latency/memory target has been established.                                                 |
| D-004: unresolved-import mutation    | Producer maintainer                                | Compare actual Java loading/closure side effects and choose the smallest compatible asynchronous adaptation if needed.                                              |
| D-005: anonymous duplication policy  | Producer maintainer                                | Map selected Java constructors/providers and repeated-use behaviour; do not reuse merger separation rules as a substitute for duplication semantics.                |
| D-006: profile source assessment     | Producer maintainer                                | Decide which source-qualified paths, if any, are in scope for each new profile; keep formal and source results separate.                                            |
| D-007: Java authority refresh        | Producer maintainer                                | Check upstream changes before implementation and record whether the current pinned authority remains applicable; a baseline update must not happen implicitly.      |
| D-008: UO adoption                   | Max and UO maintainer                              | Identify the actual adapter changes and exact package pin after producer/candidate acceptance; no switch from RDF policy comparison to OWL comparison is assumed.   |

Known conflicts are a richer API versus maintenance cost, Java behaviour versus existing JS safety adaptations, and OWL structural inspection versus UO's RDF-based policy facts.
Resolve each at its own acceptance boundary; passing one representation's checks does not waive another representation's contract.
Public API and cross-consumer implementation warrant an elevated risk assessment before implementation; writing this proposal does not select or approve that implementation route.

The next useful review is the T1 member/authority ledger and its fixture matrix.
Its first bounded slice is entity annotation assertions, subclass axioms in both positions, equivalent/disjoint class axioms, and the corresponding Java-supported import-scope mechanisms.
Review that exact slice before expanding to the remaining query families, changes, transformations, profiles, or modules.
