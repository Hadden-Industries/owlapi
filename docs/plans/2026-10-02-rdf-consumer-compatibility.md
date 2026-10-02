# RDF consumer compatibility within the Java OWLAPI boundary

Status: Implementation authorized by the owner's 2 October 2026 instruction, subject to the Java OWLAPI compatibility boundary.
This does not authorize npm publication or change consumer repository configuration.

## Baseline and decision

Preserve the scoped RC preparation on `feat/scoped-npm-rc`, HEAD `3097c6af1e7f47f97f5d90dd23915d83a5bb1489`, staged tree `e5cf3335cf8ad3440db660928d9bfd47da065687` (80 paths).
Its retained tarball and verification describe the previous implementation, not the changes below.
The consumer is the Canonical VOWL integration in WebVOWL.
The owner explicitly requires assessing requests against owlapi's responsibility rather than implementing a consumer wish list.

The selected authority remains Java OWLAPI 5.5.1 at `d7e997a53b470e32700de89cc610d9daf01ea769`, with the existing structural factory, RDF reconstruction, manager transactions, RDF/JS dependencies and profile checker.
No new dependency is needed.
Native parser metadata already supplies the relevant seam; a second parser or a VOWL-specific source ledger would duplicate or exceed it.
The pinned Java API and implementation were inspected locally and against the official source: `RDFParserMetaData`, `OWLOntologyLoaderMetaData`, `RDFOntologyHeaderStatus`, `OWLDocumentFormat`, `OWLRDFConsumer` and `TripleHandlers`.
The reference source offers Apache-2.0 as an alternative licence; existing attribution remains applicable.
New JavaScript implementation and minimized fixtures are project-authored.
No third-party ontology is copied into the package.

## Risk route

- Risk class: R2, because public parser contracts and recursive import discovery change.
- Decision owner: repository owner, through the current bounded implementation instruction.
- Reasoning: repair owning parser behavior and expose established Java metadata without redefining OWL semantics for visualization.
- Potential blast radius: RDF syntaxes, managed closures, metadata consumers and package API inventory.
- Reversibility: local uncommitted code; the existing prepared candidate remains retained separately.
- Principal unknowns: Java versus JavaScript interpretation of minimized inverse/role cases and metadata behavior across imported documents.
- Required artifacts: this plan, focused behavioral tests, public contract and generated API inventory, qualification and review evidence.
- Required specialist lenses: Java semantic compatibility, parser input limits/transactionality and independent review.
- Required verification: test-first public loading regressions, affected RDF/manager/profile suites, pinned Java characterization, package boundary and the governed full profile on the final candidate.
- Required human approvals: no additional approval for this authorized implementation; publication and any consumer configuration changes remain separate.
- Maximum sensible autonomy: implement, test, document and coordinate the bounded library contract; do not publish or broaden into consumer semantics.
- Next lifecycle step: implement the slices below and consolidate before independent review.

## Accepted outcomes and slices

1. **AC-1: Java parser metadata.**
   Expose `RDFParserMetaData` and `RDFOntologyHeaderStatus` through root and `/io`, with Java-named getters for triple count, header state, unparsed triples and guessed declarations.
   Reach metadata through `OWLDocumentFormat.getOntologyLoaderMetaData()` and `OWLOntologyManager.getOntologyFormat(ontology)`.
   Follow the existing immutable format-copy convention rather than mutate shared registry constants.
   Document JavaScript adaptations explicitly: immutable RDF term records and entity-kind records replace Java RDF nodes, streams and Class-valued multimaps.
   Metadata describes the completed parse, not a proof that subsequent ontology edits preserve original source.
   It must survive disabled warnings and remain isolated per document.
2. **AC-2: Complete supported imports.**
   In compatible mode, discover imports from every explicit ontology header, including headers not selected as ontology identity, before reconstruction.
   Preserve ordinary manager traversal, deduplication, cancellation, budgets and atomic failure.
   Preserve selected-header ontology annotations and secondary-header annotation assertions; do not invent a multiple-ontology structural object.
   Strict and preserve modes retain their existing rejection of ambiguous headers.
3. **AC-3: Typed reconstruction.**
   Reproduce the consumer's inverse/characteristic omissions and repair only cases justified by the Java/W3C OWL structural contract.
   Keep ambiguous generic statements visible as unparsed metadata rather than invent a new neutral axiom kind.
   Preserve current strict/preserve boundaries and exact literal lexical strings. Characterize existing datatype/profile distinctions rather than weakening OWL 2 DL validation to satisfy view admission.
4. **AC-4: Honest consumer handoff.**
   Publish the exact supported API and limitations in repository documentation and the authorized consumer thread.
   VOWL owns source bytes, source-to-view ledgers, projection, edit policy, live admission and canonical artifacts.
   OWL 2 DL invalidity alone is not a universal parser failure.
   Loader metadata does not establish lossless source accounting.
   A new `compatible-view` policy and the proposed `SourceAccounting` schema are not added to owlapi.

Each executable slice follows test-first verification with public package loading and independently specified expected axioms/imports/metadata.
Minimal fixtures must prove their role declarations, header identities and import-only content.
Existing preserved behavior uses characterization tests without manufacturing a failure.
QA-1: metadata cannot be changed by mutating input arrays, terms or returned collections, and one load cannot overwrite another load's metadata.
QA-2: a secondary-header import failure or abort publishes no partial ontology graph; bounded closure traversal still rejects resource exhaustion.
QA-3: metadata never certifies caller-injected data or a later edited ontology as a lossless interpretation of source.

## Delivery and exclusions

Update API documentation and inventory through the maintained generator, and record any deliberate difference from the pinned Java implementation (including truthful header counts where Java hard-codes one).
Do not change dependency versions, lockfiles, VOWL contracts, publication controls or the RC version as a side effect.
Run final verification after formatting and staging.
Retain raw evidence outside the shipped package.
Previous UO/WebVOWL qualification is not evidence for the changed candidate or the repaired Canonical VOWL application; the consumer owns its fresh application acceptance.
The scoped RC remains unpublished until the separate release gates and exact-artifact authorization are satisfied.
