# Expose configurable formatting

Status: Accepted writer configuration delivered on 8 October 2026 through [PR 55](https://github.com/Hadden-Industries/owlapi/pull/55), with refinements integrated on 9 October at `8e6f2b46b548a847a59fdc888af4a82687f450b9`.
The owner requested a Java OWLAPI-compatible formatting API that builds on the separately planned improvement to default RDF/XML output.
The owner selected producer-first delivery: improve OwlAPI defaults, then let Universal Ontology adopt them.
The original proposal below is retained with the delivery amendment that follows; current behavior and accepted adaptations are specified in the [writer contract](../compatibility/rdfxml-writer-configuration.md).
Source delivery does not assert package publication or consumer acceptance.

Decision owner: maksy.
Integration owner: the OwlAPI implementation owner admitted to this worktree after its unrelated Markdown execution is resolved through its own lifecycle.
The companion plan is `docs/plans/2026-10-08-improve-default-rdfxml-output.md` in `Hadden-Industries/universal-ontology`.
IDs here are local to this plan; identify the plan when referring to an ID across repositories.

## Delivery amendment, 9 October 2026

The delivered subset has five settings: indentation, indent size, banners, label banners and anonymous-individual ID persistence.
`RDFXMLDocumentFormat` now exposes bounded Java prefix operations; loaded root prefixes are available through the manager's independently mutable format copy, and saves capture those preferences before suspension.
The exact Java format parameter `force xsd:string on literals` accepts booleans; other arbitrary output parameters remain unsupported.
These additions supersede the original four-setting boundary and the deferral of anonymous-ID controls and public prefix mutation below.
Namespace entities, anonymous-individual remapping, named graphs and the remaining omitted Java members remain outside the supported subset.

The selected executable Java authority is `b61ebe2da83daceebb3e7ba7afbd2582c9240c33`.
Earlier observations at `d7e997a…` retain their own identity; the contract records the actual public-call observations, accepted differences, graph/resource proof and bounded formatting comparator.
Shared Java bundle reuse remains disabled because its approved catalogue covers the earlier pin.
Both added bindings retain `firstPublicRelease: null`; the [rc.2 reconciliation](0.1.0-rc.2-java-parity.md#11-delivered-changes-from-rc1-through-9-october) includes this work as delivered supporting scope with exact-version qualification still outstanding.

## 1. Purpose, scope and relationship to existing plans

Consumers should be able to select indentation and banner behavior using names and responsibilities derived from Java OWLAPI 5, while keeping the readable output from the companion plan as the default.
One RDF/XML writer serves both uses.
Universal Ontology can first benefit from the defaults without application code changes, then explicitly configure its output manager if it later needs a different presentation.

The original initial surface was `OWLOntologyWriterConfiguration` with four settings and `OWLOntologyManager` configuration accessors; the delivery amendment above records the subsequent fifth setting and format API.
It is a documented subset of Java's API, not a claim that every Java configuration field, renderer, storer or prefix interface is implemented.
There is no new `pretty` parameter, profile enum, root-level export alias, process-global preference singleton or alternate rendering engine.

Included: immutable configuration values, Java-backed method names/defaults, manager ownership, per-save snapshotting, real RDF/XML effects, package/browser exports, compatibility inventory, tests and a consumer migration contract.
Originally deferred: namespace entities, anonymous-individual ID policy, named-graph output, public prefix mutation and other serializer configuration families; current deferrals are narrowed by the delivery amendment.
Section 4 records each deferred Java surface so omission cannot be mistaken for a silently ignored option.

The [rc.2 Java parity plan](0.1.0-rc.2-java-parity.md) already covers a wider feature programme.
Coordinate member inventory and ownership with that programme; this draft neither assigns a release version nor duplicates its completed work.
The [main implementation plan](../implementation-plan.md) retains the canonical public namespace policy and clean implementation provenance.
Producer release correctness and consumer adoption remain separate: neither Universal Ontology nor WebVOWL acceptance may block an OwlAPI release.

Planning observations:

| Input                           | Observed fact                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source baseline                 | RDF/XML and model surfaces inspected at `ee99b3b3931617c5a76b7eb9dfeb53fab704e2d3`. Concurrent Markdown work advanced the checkout to `170c827e0e9b75b36c48609f36adeaea4a9c55f2`; refresh source/ownership at admission.                                |
| Current public format selection | `OWLDocumentFormats.RDF_XML`; `RDFXMLDocumentFormat` has format identity support, not a named constructor export.                                                                                                                                       |
| Current public configuration    | `OWLDocumentFormat.withParameter` exists, but RDF/XML storage rejects output parameters. `OWLOntologyWriterConfiguration` and `PrefixDocumentFormat` are deferred.                                                                                      |
| Current save                    | Manager snapshots ontology state, the registry selects the exact format, the storer returns complete validated text, then the target is replaced. No writer configuration participates yet.                                                             |
| Java API authority              | [Pinned version record](../../util/owlapi-reference/pinned-version.json): revision `d7e997a53b470e32700de89cc610d9daf01ea769`, describe `owlapi-parent-5.5.1-7-gd7e997a53`.                                                                             |
| Latest release check            | [Maven metadata](https://repo.maven.apache.org/maven2/net/sourceforge/owlapi/owlapi-distribution/maven-metadata.xml) reported 5.5.1 on 8 October 2026. The pinned oracle is a distinct post-tag revision and must not be relabeled as that release tag. |

## 2. HISEW route

### Risk class:

R2 for the proposed public API and storage changes; current work is draft planning only.

### Decision owner:

maksy accepts scope, exact API adaptations, configuration edits and release decisions.
The producer implementer owns API evidence; consumer owners accept their own application changes.

### Reasoning:

Public configuration changes long-lived API commitments and can affect concurrent saves, mutable state isolation, output resource use and failure atomicity.
A setting with no observable effect or an undocumented difference from Java would misrepresent compatibility.

### Potential blast radius:

All callers of the model namespace and every managed save, particularly concurrent Node/browser use and consumers that compare generated bytes.

### Reversibility:

An unaccepted proposal is freely revisable; published public API cannot be erased from an immutable version.
Before publication, repair the candidate and repeat affected qualification; afterward use a qualified corrective release with accurate compatibility notes.

### Principal unknowns:

Pinned Java behavior when configuration options are chained, exact banner/label observations and the accepted numeric-validation/resource policy.
These have explicit decision gates in SLICE-001.

### Required artifacts:

Accepted dossier, member/applicability matrix, adaptation ledger, pinned Java black-box observations, test coverage tied to criteria, generated registry/API views and exact-candidate review/release evidence.
Resolve HISEW external evidence storage at execution admission; observed personal evidence root is `C:\Users\maksy\.hi\w\e`.
Do not create competing engine records or put workflow scratch in product source directories.

### Required specialist lenses:

Java API compatibility, asynchronous state isolation, RDF/XML/literal preservation, exported package boundaries and bounded output generation.
Use independent verification on the frozen implementation candidate and the applicable native security workflow when authorized; no provider run is implied by this document.

### Required verification:

Criterion-specific public contract tests, pinned Java differentials, Node/browser installed-package checks, focused and affected regressions, then the full relevant producer profile and existing release gates.
Consumer observations supplement producer evidence; they do not become a release veto.

### Required human approvals:

This exact baseline, JavaScript adaptations including builder-copy behavior if different from the pinned oracle, exact configuration/contract-source changes in section 10, and separate commit/publication effects.
No adoption or closure of the unrelated active execution is implied.

### Maximum sensible autonomy:

Now: inspect and save this draft.
After implementation admission: execute the accepted slices within the selected API subset, preserving unrelated work and stopping for new public contracts, unapproved configuration or unresolved evidence.

### Next lifecycle step:

Review the companion default-renderer plan and this public member matrix together, accept their decision gates, then establish an exact implementation baseline in an available worktree.

## 3. Java authority, current reuse and provenance

The Java configuration contract is [OWLOntologyWriterConfiguration at the pinned revision](https://github.com/owlcs/owlapi/blob/d7e997a53b470e32700de89cc610d9daf01ea769/api/src/main/java/org/semanticweb/owlapi/model/OWLOntologyWriterConfiguration.java).
The manager inherits [HasOntologyWriterConfiguration](https://github.com/owlcs/owlapi/blob/d7e997a53b470e32700de89cc610d9daf01ea769/api/src/main/java/org/semanticweb/owlapi/model/HasOntologyWriterConfiguration.java).
That interface supplies the getter and a `void` setter; the setter is not a fluent builder.
Java 5's [RDFXMLRenderer](https://github.com/owlcs/owlapi/blob/d7e997a53b470e32700de89cc610d9daf01ea769/parsers/src/main/java/org/semanticweb/owlapi/rdf/rdfxml/renderer/RDFXMLRenderer.java) obtains the manager's configuration.

Protégé 5.6.9 uses the older Java 4.5.29 renderer, including its XML writer preferences, to achieve readable ordinary saves.
Its appearance demonstrates that good defaults do not require the newer public configuration API.
The API proposed here follows Java 5, which is this repository's selected compatibility authority; it does not expose the older global `XMLWriterPreferences` class.

Research question: what is the smallest native extension that provides these Java-backed controls without duplicating rendering or configuration authority?
Inspection on 8 October found the existing immutable `OWLDocumentFormat`, branded public model objects, loader configuration, manager-owned storage registry and private RDF/XML writer to be the relevant native patterns.
Reuse their established validation/package conventions and the companion plan's rendering-policy seam.
Do not merge writer settings into loader configuration merely because the latter already exists.

The companion plan records the primary-source evaluation of xmldom 0.9.12, `rdfxml-streaming-parser` 3.3.0, Graphy XML scribe 4.3.7, rdflib.js 2.4.1 and Python RDFLib.
The first two already provide integrated XML/parsing primitives; external serializer replacement does not provide manager-owned Java configuration, public export classification or the existing atomic save contract.
The residual custom work here is the selected JavaScript model API and its connection to the existing renderer.
No new runtime dependency is proposed; recheck the companion research for material drift before implementation.

Production code must be independently implemented from specifications, documented contracts and black-box observations.
Do not translate Java or third-party serializer implementation control flow into JavaScript.
Java reference execution stays in the existing development harness; its runtime, licensing and distribution restrictions remain unchanged.
No new license clearance, Java bundle redistribution or hosted oracle qualification is claimed by this draft.

## 4. Exact proposed public surface

### Selected configuration and manager members

The canonical import path is `@hadden-industries/owlapi/model`.
For a consumer using the existing npm alias, the equivalent path is `owlapi/model`.
Export from `model/index.js`; the existing `./model` package subpath already covers it, so no new package export key is expected.
Do not add a root convenience alias or a public renderer constructor.

| Java authority/member                                                                            | Proposed JavaScript call/result                                                             | Default and real effect                                                                                                |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `org.semanticweb.owlapi.model.OWLOntologyWriterConfiguration()`                                  | `new OWLOntologyWriterConfiguration()`; no-argument public constructor                      | Frozen genuine configuration with the defaults below.                                                                  |
| `isIndenting()`                                                                                  | Same name; returns boolean                                                                  | `true`; RDF/XML structural indentation is enabled. Disabling does not normalize or strip literal content.              |
| `withIndenting(boolean)`                                                                         | Same name; returns an immutable configuration                                               | Changes only indentation enablement.                                                                                   |
| `getIndentSize()`                                                                                | Same name; returns number                                                                   | `4`; spaces per XML indentation level when enabled.                                                                    |
| `withIndentSize(int)`                                                                            | Same name; returns an immutable configuration                                               | Changes only size; numeric admission and resource rules in DEC-005 apply.                                              |
| `shouldUseBanners()`                                                                             | Same name; returns boolean                                                                  | `true`; emit the defined section/entity banner comments.                                                               |
| `withBannersEnabled(boolean)`                                                                    | Same name; returns an immutable configuration                                               | Changes only banner enablement.                                                                                        |
| `isLabelsAsBanner()`                                                                             | Same name; returns boolean                                                                  | `false`; default entity banner identity uses the entity IRI.                                                           |
| `withLabelsAsBanner(boolean)`                                                                    | Same name; returns an immutable configuration                                               | When banners are enabled, use the accepted label-selection rule with an IRI fallback. Does not modify RDF annotations. |
| `HasOntologyWriterConfiguration.getOntologyWriterConfiguration()` inherited by the manager       | `manager.getOntologyWriterConfiguration()`; returns the genuine immutable configuration     | No implicit mutation; retrieved values may be safely retained by callers.                                              |
| `HasOntologyWriterConfiguration.setOntologyWriterConfiguration(config)` inherited by the manager | `manager.setOntologyWriterConfiguration(config)`; returns `undefined`, matching Java `void` | Validate and replace only this manager's configuration for subsequent saves.                                           |
| Existing `OWLOntologyManager.saveOntology(ontology, format, target)`                             | Existing argument shape and `Promise<void>` retained                                        | Capture the manager's configuration with the ontology snapshot before the first asynchronous suspension.               |

`HasOntologyWriterConfiguration` is an interface authority for the two manager members, not a proposed new JavaScript runtime constructor.
The registry must explain this structural adaptation instead of inventing an instantiable interface or falsely claiming a named export.
No new `saveOntology` overload or per-save fourth public options argument is part of this plan.

### Explicitly deferred Java members and related APIs

| Java surface                                                                                   | Disposition and reason                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shouldSaveIdsForAllAnonymousIndividuals()` / `withSaveIdsForAllAnonymousIndividuals(boolean)` | Deferred. Anonymous-individual ID policy affects identity/presentation beyond indentation and requires its own interoperability evidence. Preserve the current renderer's proven identity behavior.      |
| `shouldRemapAllAnonymousIndividualsIds()` / `withRemapAllAnonymousIndividualsIds(boolean)`     | Deferred with the preceding pair. Do not expose a setter that accepts requests the renderer ignores.                                                                                                     |
| `isUseNamespaceEntities()` / `withUseNamespaceEntities(boolean)`                               | Deferred. DTD/entity output needs separate entity-expansion, parser and trust-boundary qualification. Default output continues using namespace declarations without added DTD entities.                  |
| `shouldOutputNamedGraphIRI()` / `withNamedGraphIRIEnabled(boolean)`                            | Deferred. RDF/XML's selected single-graph storage contract is not a named-graph serialization feature.                                                                                                   |
| `PrefixDocumentFormat`, mutable prefix methods and a named `RDFXMLDocumentFormat` constructor  | Deferred. Java separates namespace mappings from writer configuration; useful default prefixes already come from the first plan. Exact authored-prefix control needs an explicit format-metadata design. |
| Java 4 global `XMLWriterPreferences`                                                           | Not selected. Manager-local Java 5 configuration is the authority.                                                                                                                                       |
| Concrete `RDFXMLRenderer`, `RDFXMLStorer`, storer factories and registration hooks             | Remain private/deferred. Public formatting does not require exposing serialization internals.                                                                                                            |
| Arbitrary `OWLDocumentFormat.withParameter("pretty", ...)` or alternate options spelling       | Not introduced. Preserve current unsupported-parameter failures and use the selected Java-backed configuration object.                                                                                   |

Mark the configuration type as a supported **partial JavaScript adaptation**, with implemented members and deferred members separately recorded using the registry's existing classification vocabulary.
Do not invent a new registry status string or mark the whole Java type fully supported merely because its constructor exists.

### Format applicability

| Save format        | Selected setting behavior                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RDF/XML            | All four selected settings have the defined effect; graph and OWL preservation remain mandatory for every combination.                                                                                               |
| Functional Syntax  | Proposed retained behavior: the four RDF/XML presentation settings do not change its output. Inspect and black-box probe the pinned Java functional writer to confirm this applicability boundary before acceptance. |
| Unsupported format | Retain exact-format selection failure. A writer configuration never selects a different serializer.                                                                                                                  |

If the Java probe establishes that a selected option materially affects Functional Syntax, decide before implementation whether to implement that effect or explicitly narrow the documented adaptation.
Do not silently ignore a Java-relevant option while advertising cross-format parity.
Deferred flags are absent APIs, not accepted no-op configuration.

## 5. Requirements, decisions and invariants

| Requirement                                 | Acceptance criterion                                                                                                                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-001 Truthful Java API compatibility     | AC-001: Every new public member has its Java authority, exact JavaScript signature, default, behavior, applicability and adaptation recorded in generated/public documentation and executable contract tests.        |
| REQ-002 Useful configuration                | AC-002: Each selected setting causes its specified RDF/XML presentation change; interactions such as disabled banners with labels enabled are documented and tested.                                                 |
| REQ-003 Preserve default behavior           | AC-003: Omitting configuration and explicitly supplying a fresh default configuration yield the companion plan's default output for the same ontology snapshot and artifact identity.                                |
| REQ-004 Immutable, isolated state           | AC-004: A `with...` call leaves its receiver unchanged and preserves every unrelated field; changes to one manager or later configuration do not alter another manager or a save already started.                    |
| REQ-005 Preserve semantics and atomicity    | AC-005: All selected combinations yield RDF-isomorphic and structurally equivalent output, or a truthful failure with an unchanged target.                                                                           |
| REQ-006 Safe argument and resource handling | AC-006: Invalid booleans, numbers, nulls, lookalikes and proxies are rejected through the accepted native argument contract; excessive output/depth fails within finite resource bounds without partial publication. |
| REQ-007 Public package completeness         | AC-007: The packed package exports the selected type from `./model` in Node and browsers, with no accidental private/root exports or Java runtime dependencies.                                                      |
| REQ-008 Direct consumer migration           | AC-008: UO can retain its unchanged default save path or set configuration on the actual output manager; no postprocessor, legacy switch or dual rendering path is required.                                         |

DEC-001: The public configuration is immutable and genuinely branded, following established model conventions.
Freeze instances and validate native private state rather than trusting duck typing, a caller-overridden getter or `Object.freeze` alone.
`with...` returns a valid immutable value and may return the receiver for a no-op if consistent with the accepted native contract; no promise of fresh identity is needed.
Never mutate the receiver or share writable option state between managers.

DEC-002: Store configuration on `OWLOntologyManager`.
At `saveOntology` entry, capture the ontology state and configuration before the first `await`, then pass an immutable private render context through the registry and storer.
The storer must not reread a live manager or a process-global singleton.
Changing configuration after save A starts affects save B, even if A finishes later.
This is an explicit JavaScript asynchronous adaptation, not a new public Java overload.

DEC-003: Use the companion plan's canonical renderer and private policy seam.
Replace its fixed-default policy source with values read from the captured configuration; keep one default authority and one RDF/XML emitter.
Retain the all-settings-default reference fixture and test it before and after this refactoring.
Do not require arbitrary old package versions to have identical provenance comments; define any legitimate artifact-version text separately from RDF presentation comparisons.
The preferred default emitter has no time-dependent metadata.

DEC-004: Builder-copy behavior needs a deliberate compatibility decision.
Static inspection of the pinned Java source shows `copy()` does not copy `indentSize` or `bannersEnabled`, although the corresponding builders exist.
That may reset previously selected settings when another setting changes; it is not yet a black-box observation from this planning task.
Probe chained calls, changed-value and no-op calls, and both ordering directions at the pinned revision and the released 5.5.1 artifact where available.
The proposed JavaScript behavior preserves all unrelated fields, matching an immutable value object's responsibility.
If Java observations differ, record the exact divergence and obtain acceptance of that adaptation before implementation; do not silently reproduce a suspected defect or claim bug-for-bug equivalence.
Changing the pinned oracle itself is a separate decision, not a workaround.

DEC-005: Proposed numeric adaptation: `withIndentSize` accepts finite, nonnegative integers in Java's positive `int` range, including zero, with maximum `2147483647`.
Reject strings, booleans, fractions, NaN, infinity, negative values and overflow through the repository's native argument-error convention.
This validation is more explicit than Java's type system and may be stricter than Java's negative-value behavior; characterize and accept that difference in SLICE-001.
Do not introduce an arbitrary small indentation cap under the claim of exact Java compatibility.
Separately, rendering must check predicted allocation/output growth before constructing enormous padding and fail under a documented finite internal budget aligned with existing storage/reparse limits.
Finalize the exact budget and error classification from current code and measurements before implementation; no unbounded allocation or new public resource option is implied.

DEC-006: Presentation never changes the RDF graph.
Indentation affects structural whitespace only; typed-node selection, preservation of additional types, blank-node sharing and list safety remain the companion plan's invariants.
`withIndenting(false)` is not a promise of one-line XML or removal of whitespace inside literals.
`withBannersEnabled(false)` controls the defined banners, not unrelated required provenance comments.
When labels are requested, characterize Java's label choice and fallback, then record any deterministic JavaScript adaptation for multiple languages or duplicate labels.
Sanitize XML comment content without changing stored RDF label values.

DEC-007: Keep format parameters and writer configuration separate.
The current `withParameter("pretty", true)` rejection remains tested.
Formats represent syntax selection and their accepted metadata; the manager's configuration controls writer behavior.
Neither mutable prefix management nor the older global preferences are prerequisites for these four settings.

DEC-008: Release the producer on producer evidence.
UO migration is an illustrative consumer contract and a separately owned adoption task.
Do not make absence of UO changes a producer release failure.

## 6. Architecture and predicted file changes

The intended internal path is manager snapshot plus captured writer configuration, then registry, RDF/XML storer, canonical graph writer, complete verified text, and atomic target replacement.
The public save signature does not change.

| Likely path                                                                                                               | Change hypothesis and boundary                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model/owlOntologyWriterConfiguration.js` and adjacent tests                                                              | New canonical immutable type and private native reader/validation mechanism. Do not create an additional untyped public options bag.                                  |
| `model/index.js`                                                                                                          | Export the type from the existing model namespace only.                                                                                                               |
| `model/owlOntologyManager.js`, `model/owlOntologyManager.storage.test.js`                                                 | Manager getter/setter, default initialization and capture at save entry, including concurrent-save tests.                                                             |
| `internal/storage/storerRegistry.js` and tests                                                                            | Carry immutable writer context without exposing the target or live manager to renderers; retain complete-text commit behavior.                                        |
| `internal/storage/rdfxml/rdfXmlStorer.js`, `rdfXmlGraphWriter.js` and tests                                               | Consume the captured four settings through the existing policy seam and preserve structural validation.                                                               |
| `internal/storage/functional/functionalSyntaxStorer.js` and tests                                                         | Accept internal context plumbing as needed; prove documented format applicability without broad unrelated reformatting.                                               |
| `util/generate-java-api-surface.mjs`                                                                                      | Update the authoritative generation/mapping logic so inherited manager methods and the selected partial configuration surface are classified correctly.               |
| `docs/compatibility/java-api-surface.json`, its generated Markdown view, `API.md`, `docs/compatibility/capabilities.json` | Update through owning generators/sources. Preserve deferred-member truth and absence of accidental root exports. Verify which sources are configuration before edits. |
| `test/package-boundary.test.mjs`, `scripts/qualify-owl-contract.mjs`, relevant browser tests                              | Exercise actual packed exports and public configuration/save behavior. Add producer-owned assertions; do not turn UO adoption into a gate.                            |
| Existing Java reference harness and project-authored fixtures                                                             | Add the smallest black-box configuration observations needed for the contract; no production Java coupling.                                                           |
| User-facing API documentation and release notes                                                                           | Explain supported members, defaults, omissions, adaptations and migration using real APIs.                                                                            |

No new package `exports` key is anticipated because `./model` and the `model/` package file inclusion already exist.
If implementation shows otherwise, treat the exact package configuration diff as a new approval item.
Do not hand-edit generated API views to conceal missing implementation or change a deferred status without executable support.

## 7. Quality scenarios and proof boundaries

| Scenario                          | Trigger and required response                                                                                                                | Independent evidence                                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-001 Public call contract       | Construct defaults, exercise every getter/builder and attach the result to a manager.                                                        | Public package tests plus pinned Java observations; each documented difference has an accepted adaptation ID.                                        |
| QA-002 Chaining and isolation     | Chain size, banners, labels and indentation in different orders; retain older values; configure two managers differently.                    | Untouched values remain unchanged; all unrelated fields survive; cross-manager output does not leak. Include the suspected Java copy-reset cases.    |
| QA-003 Save interleaving          | Start save A with configuration A, change the manager to B, then start save B and complete them out of order.                                | Each emitted document uses its captured state. Use controlled internal asynchronous boundaries, not timing sleeps.                                   |
| QA-004 Formatting semantics       | Cross selected booleans with sizes zero, two and four; include Unicode, CR/CRLF, XML literals, multiply typed and shared/list nodes.         | Actual output parsed independently and graph-compared, plus existing OWL structural oracle. Presentation assertions establish each setting's effect. |
| QA-005 Invalid and hostile input  | Pass lookalike/proxy configs, bad scalar values, very large legal indentation, deep structures and labels containing XML comment delimiters. | Native validation or bounded storage failure; previous config/target intact; no external retrieval or entity declaration added.                      |
| QA-006 Defaults and other formats | Compare omitted configuration, explicit defaults and the first plan's accepted fixtures; save Functional Syntax with changed XML controls.   | Byte/presentation equivalence within the declared artifact scope and explicit format applicability evidence.                                         |
| QA-007 Package and browser        | Import only published namespace paths in isolated Node/browser consumers.                                                                    | Packed-package export checks, browser save/reload tests and absence of private/Node-only/Java runtime imports.                                       |
| QA-008 Resource behavior          | Compare default and nondefault configuration against the released default renderer on representative large ontologies.                       | Recorded time/memory/output growth and finite rejection behavior; no unmeasured performance promise.                                                 |

Use the existing RDF dataset-isomorphism and OWL structural-comparison utilities; do not write another canonicalizer.
The renderer's own round trip is a runtime guard, not the only test oracle.
Java black-box observations establish selected behavior; W3C graph identity establishes losslessness when Java differs in cosmetic bytes.
Use project-authored minimal fixtures to avoid importing third-party source or licensing assumptions.
Mock only genuine acquisition boundaries and controlled private suspension/failure seams; a stubbed writer cannot prove configuration works.

## 8. Vertical implementation slices

| Slice     | Observable increment and dependencies                                                                                                                                                                                    | Traceability                                                                             | Proof                                                                                                                                                        | Release and cleanup implication                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| SLICE-001 | Freeze the four-setting/member/applicability matrix and characterize the pinned Java configuration, including copy-reset, labels, numeric values and Functional Syntax. Consume the companion default-renderer baseline. | REQ-001/003/004/006; AC-001/003/004/006; QA-001/002/005/006; DEC-004/005/006/007         | Exact runtime/revision observations, accepted adaptation ledger and finite budget decision. Static source observations remain labeled until executed.        | Blocks dependent semantics while unresolved; does not authorize a Java oracle upgrade or release.                           |
| SLICE-002 | One complete public path: immutable configuration, manager get/set, indentation enable/size, actual RDF/XML effect, and unchanged target semantics. Depends on accepted SLICE-001 and the companion renderer seam.       | REQ-001/002/003/004/005; AC-001/002/003/004/005; QA-001/002/004/006; DEC-001/002/003/005 | Public import/save tests, two/four/zero-space behavior, literals preserved, default fixture unchanged, invalid values rejected.                              | Independently demonstrable; do not export unfinished banner methods or claim the complete selected subset before SLICE-003. |
| SLICE-003 | Complete the selected banner and label controls through that same public path. Depends on SLICE-002.                                                                                                                     | REQ-001/002/004/005/006; AC-001/002/004/005/006; QA-001/002/004/005; DEC-004/006         | Every builder combination preserves other fields; banners disable correctly; label selection/fallback and safe XML comments match the accepted decision.     | One coherent selected API subset; remove exploratory duplicate paths and retain observations.                               |
| SLICE-004 | Prove concurrent state isolation, bounded failures and format applicability through public saves. Depends on SLICE-002/003.                                                                                              | REQ-003/004/005/006; AC-003/004/005/006; QA-002/003/005/006/008; DEC-001/002/005/007     | Controlled interleavings, target preservation, prototype/proxy rejection, oversized-output and depth failures, Functional Syntax regression evidence.        | No API release until state and failure contracts are qualified.                                                             |
| SLICE-005 | Publishable package candidate with generated truthful API inventory, browser exports and complete producer verification. Depends on SLICE-001 through SLICE-004.                                                         | REQ-001/007; AC-001/007; QA-001/007/008; DEC-007/008                                     | Installed package contract, boundary and browser checks, full relevant HISEW profile, generated-view consistency and independent frozen-candidate assurance. | Separate release authorization and exact immutable identity; UO need not change.                                            |
| SLICE-006 | Document and demonstrate direct migration from readable defaults to explicit settings on an output manager. Depends on the qualified candidate; actual UO adoption belongs to its owner.                                 | REQ-003/008; AC-003/008; QA-006/007; DEC-003/008                                         | Producer-owned example proves omitted/default equivalence and nondefault effect using public APIs; UO may separately qualify its current pipeline.           | No legacy formatter to retire. Remove only task-owned scratch after review/evidence consumers finish.                       |

Keep manager, registry and writer integration under one owner because they share snapshot semantics.
Independent fixture/research work may be separate if later authorized; the table does not authorize parallel agents or overlapping writes.
Do not begin this implementation inside the unrelated active Markdown execution.

## 9. Migration, verification and release

Migration is incremental and has no new data schema or backfill.
First release the readable default renderer from the companion plan.
Then expose the selected public configuration while preserving those defaults.
Existing users, including UO, can take the second release without calling any new method.
If UO wants an explicit policy, it creates the configuration through `owlapi/model`, attaches it to the **output manager** used for the merged ontology, and continues its existing `saveOntology(ontology, OWLDocumentFormats.RDF_XML, target)` call.
Configuring only the source-loading manager would not configure a distinct output manager.

UO's default path should stay unchanged if it needs no nondefault settings.
An explicit four-space/default setup is optional documentation of intent, not a required shim or version-detection branch.
Any UO dependency change needs exact manifest/lock approval and its own current closure/build qualification.
Producer acceptance uses its own representative ontology fixtures and installed-package assertions; actual UO adoption remains separate.

Verification entry points include targeted configuration/manager/storage Jest tests, `npm run test:boundary`, `npm run test:owl-contract` and `npm run test:browser`.
Use the repository-selected toolchain, updated to npm 12.2.0 by the owner's execution instruction, and refresh it at admission rather than importing UO's toolchain policy.
The owner also selected upstream default-branch tip `b61ebe2da83daceebb3e7ba7afbd2582c9240c33` as the execution Java pin; the earlier links above identify the plan's original source observations.
Run the selected full relevant HISEW profile and existing release gates against a frozen integrated candidate; record which criteria each check actually covers.
Regenerate API views using their owning generator and compare the actual packed package exports with the registry.
Do not hand-edit generated Markdown/JSON or invent passing Java/browser results when a tool is unavailable.

Observe default/nondefault output hashes, graph/axiom counts, configuration values captured for each controlled save, target-preservation failures, render durations and memory.
These are verification observations, not a request to add runtime telemetry or a new service.
The release owner accepts one immutable package candidate with its exact source/tarball identity and unresolved limitations made explicit.
Publication, source delivery and remote checks remain separate authorized effects.

Abort if a setting is ignored contrary to the matrix, old configuration mutates, saves see live option changes, RDF/OWL changes, a target is partly replaced, a resource bound fails, or registry claims exceed the packed implementation.
Repair before publication and repeat affected proof, then full final qualification as required for the new candidate.
If a defect is found after publication, retain the published identity and issue a corrective release; consumers decide whether to stay on their last qualified version or adopt it.
Do not silently remove methods, overwrite a version or introduce a legacy-renderer switch.

On interruption, keep the exact accepted baseline, configuration decision ledger, source identity and failed observations.
Resume through the owning execution, refreshing drifted inputs and the companion renderer's released behavior.
Cleanup removes only task-owned scratch; required failure/review evidence and published artifacts remain retained.

## 10. Future configuration and contract-source changes

No configuration is changed in this planning task.
Before implementation, present the smallest exact diff for any file that falls under repository configuration or policy protection.

| File/setting                                                                        | Proposed effect and pipeline impact                                                                                                                                        |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` export map                                                           | No change expected: reuse the existing `./model` export. A discovered need for a new key is a replan/approval item.                                                        |
| `package.json` version and corresponding lock metadata                              | Only the separately selected release identity changes through the existing release procedure; this plan does not choose a version.                                         |
| `docs/compatibility/capabilities.json` and any authoritative public-contract inputs | Record the actual selected writer configuration capability/member scope. This affects compatibility qualification and must be exactly approved where protected.            |
| Generated `docs/compatibility/java-api-surface.json`, `.md` and `API.md`            | Produced from the accepted mapping/source by the owning generator. Review derived changes; do not hand-edit or assert unsupported coverage.                                |
| CI, test-runner, Markdown, release-governance and HISEW configuration               | No change currently proposed. Reuse existing entry points; if new test placement is not covered, expose the precise coverage gap and propose the smallest approved change. |

No dependency addition, automatic tool installation or hosted Java bundle reuse is part of the selected design.
If new dependencies are proposed, repeat exact-version native reuse/license/security research and obtain the relevant approval before adoption.

## 11. Decision gates and replanning

| Decision                                  | Proposed direction                                                                                | Evidence needed before dependent implementation                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| DEC-004 Java builder-copy discrepancy     | Preserve unrelated JavaScript fields and document an explicit adaptation if needed.               | Pinned Java and release-artifact chained-call observations; owner acceptance of the difference.                               |
| DEC-005 indentation validation and budget | Nonnegative Java-int range, native argument errors and finite allocation checks before rendering. | Negative/overflow Java behavior, current storer/reparse limits, measured resource baseline and accepted numeric/error policy. |
| DEC-006 label/banner behavior             | Deterministic selection, IRI fallback, safe comments and unchanged RDF labels.                    | Multiple-label/language/missing-label Java observations and exact rule review.                                                |
| Functional Syntax applicability           | Retain its current output for these XML settings.                                                 | Pinned Java public-save probe; explicit adaptation or scoped implementation if the assumption fails.                          |
| Release coordination                      | Extend the canonical renderer and selected model namespace once.                                  | Refreshed rc.2 programme and companion implementation identities; no conflicting worktree owner.                              |

Replan if the selected four-setting subset is insufficient, a deferred flag is required, Java compatibility would require undisclosed behavior differences, custom prefix mutation becomes necessary, the default renderer is replaced, or new public resource controls are needed.
Also replan for hidden global state, accidental cross-format promises, API-registry limitations that cannot represent a partial type, unapproved configuration, or a dependency on consumer adoption for producer release.
The higher outcome is useful, predictable ontology output with a truthful public API; do not increase public surface merely to resemble Java's class count.
