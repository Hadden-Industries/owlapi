# Java-compatible API behavior implementation plan

**Status:** Draft for owner review.
Research and proposed design are complete to the bounded extent recorded here; this revision is not accepted, baselined, implemented or release-qualified.

**Date:** 2026-10-13.
**Plan namespace:** JBC.
Unqualified `REQ-###`, `AC-###`, `QA-###`, `DEC-###`, `SLICE-###`, `PROOF-###` and `CLEAN-###` identifiers belong to this document.
All new requirements, scenarios and decisions below are **proposals**, not invented historical acceptance.

**Intended outcome:** On the selected Java/JavaScript public API routes, a migrating Java OWLAPI user obtains the same accepted inputs, configuration methods and defaults, result classification, failure category and phase, callback/evaluation behavior, and manager/ontology/target consequences.
A documented hidden behavioral difference does not satisfy this outcome.
A pinned Java quirk remains the target for these concerns unless the owner changes this scope explicitly.

## 1. Baseline, authority and scope

### 1.1 Exact baseline and evidence

| Authority                       | Revision or evidence                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JavaScript source               | `20426357165a22248985ec43d7ac1266d49d6bec`, tree `18a3895c9b65f585de4f713e783b35c6ba3bff6f`, `main`, package `0.1.0-rc.2`                                                                                                                                                                                                                                                                                |
| Java OWLAPI source              | [`b61ebe2da83daceebb3e7ba7afbd2582c9240c33`](https://github.com/owlcs/owlapi/tree/b61ebe2da83daceebb3e7ba7afbd2582c9240c33), tree `b8dad5241dae6ff3bd3b755b9a1c605623eeb2c2`, `version5`                                                                                                                                                                                                                 |
| Primary research                | [Behavior report](../compatibility/research/java-api-behavior/2026-10-13-owlapi-api-behavior-compatibility-research.md), SHA-256 `a07b268095e037e4e8d5b188a0bd78ba5300224f8ec4db3b9be7670259b60039`; [structured evidence](../compatibility/research/java-api-behavior/2026-10-13-owlapi-api-behavior-evidence.json), SHA-256 `8190c531b5a2a7920bf774c11fe49ae04919bf76e9230a42d0dbe1da4c087166`         |
| Gap-closure research            | [Supplement](../compatibility/research/java-api-behavior/2026-10-13-owlapi-api-behavior-gap-closure-research.md), SHA-256 `055858f4bf1d6a9b8aa012b6bda646989e33c7e991db1739ab65055efcf87795`; [supplementary evidence](../compatibility/research/java-api-behavior/2026-10-13-owlapi-api-behavior-gap-closure-evidence.json), SHA-256 `ce1efafce28b4fd4893a09efeb12b90987f02e2811b728c3925d220108c99430` |
| Canonical reference environment | Existing [CI](../../.github/workflows/ci.yml) and [release](../../.github/workflows/release.yml): Temurin `25.0.4+101.0.LTS`, checksum-pinned Maven 3.10.0, Linux native build under [reference-native-build.mjs](../../util/owlapi-reference/reference-native-build.mjs)                                                                                                                                |
| Current local observations      | Node 24.21.0, Windows, Temurin 25.0.4.1+1; Chromium 156.0.8078.4 and WebKit 27.2; Firefox local launch unavailable                                                                                                                                                                                                                                                                                       |
| Preserved unrelated work        | `docs/plans/2026-10-12-dependency-cruiser-architecture-hardening-plan.md` was already untracked and remains outside this plan                                                                                                                                                                                                                                                                            |

The original research contains 13 findings, 68 source references, eight structured tables and six probe programs.
The supplement adds seven bounded probe programs, 29 source records and a freshly compiled overlay of seven unchanged pinned Java source files.
All 63 retained Java classpath digests match the original evidence.
The overlay makes the selected manager, factory, configuration, storer and Rio implementation paths source-bound; all remaining Java classes and dependencies are still retained artifacts.
Repository editions and portable snapshots are retained with the plan; the [research dossier](../compatibility/research/java-api-behavior/README.md) and [manifest](../compatibility/research/java-api-behavior/manifest.json) distinguish their hashes from the unchanged Drive originals and document host-path normalization and omitted source bodies.
Neither these digests nor a clean checkout establish a complete fresh native source build.
The existing hosted native gate remains required and source-build reuse remains inactive for the current pin.

No source implementation, dependency installation, project configuration, commit, push, remote CI, release or consumer cutover is authorized by this planning artifact.

### 1.2 Selected surface and non-goals

The behavioral audit covers every currently matched route in the public registry, not just the 13 discovered examples: configuration, loading/imports, changes, transforms, selected queries/search, providers, profiles, locality and the existing four StringDocumentTarget save paths.
New canonical configuration members needed to fulfill an already selected responsibility are included.
The scope is not an implementation of every absent Java class or overload.

Existing intentionally normative ontology/parser/profile **output-semantic** corrections remain in their separately admitted programme.
This track does not automatically reverse their exact expected-difference rules or port every Java semantic bug.
It does cover an acceptance/failure/timing consequence when an otherwise matched route rejects, admits or mutates differently.
Every overlap with a normative correction must receive a case-specific classification; “standards compliant,” “safer,” “asynchronous JavaScript” or a broad adaptation label cannot waive a behavioral row.

Pre-existing omitted capabilities stay separately visible: custom Writer/OutputStream/IRI storage targets and change/progress listener registration are not added here.
JVM System properties and classpath resource lookup are absent host facilities in ordinary ECMAScript.
They are not silently imitated by environment variables or network file discovery.
These exclusions constrain parity claims; they do not excuse differing behavior on implemented instance methods or existing StringDocumentTarget routes.

No new general workflow engine, Java implementation copy, compatibility shim, migration alias, default guard wrapper, public resource-limit family, release number, dist-tag, whole-Java-API claim or consumer policy is selected.

### 1.3 HISEW applicability and authority

The HISEW `hadden-industries-plan-software-change` planning skill (`0.1.0-dev.21`), current engine invocation guidance and engineering principles informed this draft.
Personal workflow applicability is active.
Read-only status found the project ready, no active lifecycle work, and no active engine risk-route selection.
Current project ID is `f6ded748-f3c0-41f4-8e89-def537c290f4`; worktree ID is `6f8858af-3ef0-44bd-a5c8-a57b2f25d410`.

Reuse the accepted R2 programme context recorded in the [rc.2 plan](0.1.0-rc.2-java-parity.md) and [baseline](0.1.0-rc.2-java-parity-baseline.md); do not reset completed slices or manufacture a new accepted route.
At implementation intake, the maintainer must bind this exact accepted revision to the current route and re-evaluate only material scope/risk changes. This plan proposes R2 continuation with security and native-dependency specialist review. A requirement to add ambient JVM emulation, custom target/listener families, a new transport service or a materially broader dependency fork triggers replanning.

The external evidence destination was rediscovered from current HISEW configuration as the configured external evidence root.
Supplemental operator artifacts live only under the isolated session path ending `java-behavior-plan-research-20261013`.
Engine-owned state/receipts were not edited.
Legacy `.sdlc/runtime` and `.sdlc/tmp` are not new destinations.
Unrelated feedback notices are outside this task.

Current verification profiles were read, not executed as implementation proof.
Capability inspection exposed procedure availability but did not establish a ready code/security reviewer executor.
Resolve actual capabilities through the current supported procedure before any later review; do not treat discovery as a successful review or create a manual receipt.

### 1.4 Existing authority and proposed supersession

The latest user goal controls this proposed behavioral repair.
Historical plans, approvals, publications and evidence retain their original meaning.
Reconciliation must add dated, scoped amendments and regenerate current views from their owners; it must not rewrite old publication facts.

| Existing authority                                                                                                                    | Retain                                                                                                                          | Proposed change for this track                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [rc.2 plan](0.1.0-rc.2-java-parity.md), section 1.2 and completed slices                                                              | Completed implementation history; canonical owners; producer independence; selected output semantics                            | Correct current claims of complete behavioral equivalence. RC2 REQ/AC-004, -007, -008, -010; DEC-005; QA-002/-004 and related claims no longer authorize atomic mutation/save or arbitrary finite defaults                                          |
| [rc.2 baseline](0.1.0-rc.2-java-parity-baseline.md)                                                                                   | Java member/namespace and type mapping that is actually structural                                                              | Revisit RC2-ADAPT-001 eager collections, -003 boolean/atomic changes and -006 async timing on affected matched routes; keep narrowly necessary overload/type mappings                                                                               |
| [Default behavior inventory](../compatibility/default-behavior-inventory.md)                                                          | Inventory as a required public proof view                                                                                       | Replace retained strictness, default caps, blanket network opt-in, dataset rejection, atomic target and snapshot lifecycle rows with this plan's canonical observations; list omissions explicitly                                                  |
| [5 October profile/default plan](2026-10-05-profile-performance-and-default-behavior-repair-plan.md)                                  | OA-REQ-001 efficiency, -004 inventory, -006 producer qualification; accepted null profile deadline; measured performance method | Amend OA-REQ-002/-003/-005, OA-QA-002/-003 and default-policy decisions only where “documented differences” or resource rejection conflicts with Java behavior                                                                                      |
| [Phase 21 foundation](java-api-parity-precondition.md), [decision ledger](../compatibility/java-api-parity-decisions.json) and schema | Immutable rc.1 history; canonical toString; appropriate JS error hierarchy mapping                                              | Supersede current `PARITY-TARGET-ATOMIC-COMMIT`. Keep Writer omission as an unavailable capability, withdraw claims that it is language-required or proves atomicity. Review `PARITY-STORAGE-REASON` causes; version the closed schema deliberately |
| [WebVOWL](../requirements/java-parity-for-webvowl.md) and [UO requirements](../requirements/java-parity-for-universal-ontology.md)    | Public Java responsibility, no shims, consumer ownership and pinned admission                                                   | Consumers migrate their policy at their own adoption boundary; old consumer requirements do not override this target. No consumer sign-off is added to producer release gates                                                                       |
| [Installed OWL contract](../compatibility/installed-owl-contract.md), native contract fixtures                                        | Exact installed-candidate provenance, native assertion accounting and producer/consumer separation                              | Replace old unchanged-target, atomic closure, safe-default and immutable-all-configuration assertions through reviewed versioned native cases; preserve 69-assertion coverage until explicitly migrated, never delete proof to obtain green results |
| [Migration guide](../migration/0.1.0-java-api-parity.md), writer/resource-budget/performance docs, API views                          | Published history and valid independent performance/structure claims                                                            | Add current breaking-behavior migration instructions and remove stale current claims from owning sources; no aliases                                                                                                                                |
| [KRSS1 oracle](../compatibility/krss1-behavioral-oracle.json), RDF metadata, expected differences                                     | Narrowly admitted normative output corrections and zero-tolerance unknown differences                                           | Separate structural output corrections from acceptance/error/timing rows. Do not use the ledger as a blanket behavioral exemption or silently expand this track to all grammar output defects                                                       |
| [Java API surface](../compatibility/java-api-surface.json), capabilities and generated API.md                                         | Generator ownership and exact selected-member traceability                                                                      | Correct stale manager omittedMembers that list implemented change types; classify live provider, lazy search and capabilities accurately; regenerate all views together                                                                             |

## 2. Requirements and falsifiable acceptance

Every acceptance item is evaluated against the pinned source plus the named provider/runtime route.
“Java has no limits” is not an acceptance statement.
Java-visible provider limits, retries, failure phases and quirks are part of the target; private JS-only restrictions are not.

| ID               | Requirement and acceptance criterion                                                                                                                                                                                                                                                                                                                        | Main proof      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| REQ-001 / AC-001 | A complete selected-route inventory maps every public binding/overload to Java authority, host mapping, configuration owner, observable vector and executable proof or explicit omitted capability. Zero unclassified matched routes and zero unknown behavioral deviations at release                                                                      | PROOF-001, -010 |
| REQ-002 / AC-002 | Canonical loader/writer/manager configuration names, defaults, value domains, no-op identity, copy/reset behavior, override timing and effects match Java within the selected host capability. No invented JS defaults, aliases or constructor guard substitutes                                                                                            | PROOF-002       |
| REQ-003 / AC-003 | Load selection, parser fallback, compatible default acceptance, graph selection, transport attempts and failure categories/phases match the selected native/Rio routes. The 9,000-space Functional document succeeds without a hint; positive controls retain annotation loading and THROW_EXCEPTION defaults                                               | PROOF-003, -004 |
| REQ-004 / AC-004 | XML entity/configuration interpretation and failure recognition are qualified per Node and browser provider. Malformed input yields the measured public failure category/state at the proper phase; a nested parsererror cannot be mistaken for successful parsing                                                                                          | PROOF-005       |
| REQ-005 / AC-005 | JSON-LD uses the selected Rio-equivalent default secure whitelist/cache behavior and supported-setting filtering. Public defaults admit the observed 13/25 allowlisted-context chains. Backend qualification separately admits 257 and rejects 258 under the same effective configuration as the Java system-property probe; no hidden JS cap of 10 remains | PROOF-006       |
| REQ-006 / AC-006 | Matched changes expose canonical success/no-operation/unsuccessful outcomes and sequential effects, including inverse success, thrown partial effects and forward-rollback quirks. Result lists and indexes reflect actual state rather than assumed atomicity                                                                                              | PROOF-007       |
| REQ-007 / AC-007 | Loading, retrying, renaming and removal reproduce retained imports, import-request markers, ontology/document identity indexes and ID-keyed configuration lifetime. No manager-wide cleanup removes Java-retained state                                                                                                                                     | PROOF-007, -003 |
| REQ-008 / AC-008 | Valid structures accepted by Java pass every matched construction/change/transform/parse route without private inconsistent depth or annotation caps. Unsupported representation and actual runtime exhaustion remain distinguishable failures                                                                                                              | PROOF-008       |
| REQ-009 / AC-009 | Profile result/verdict and evaluation phase match Java on the selected ontology/model. Private work/depth/numeric/literal defaults do not turn a valid assessment into unverified/false; null default deadline and existing normative rule outcomes are preserved                                                                                           | PROOF-008, -009 |
| REQ-010 / AC-010 | Search consumption, locality callbacks and closure providers follow Java's eager/lazy/live behavior on each matched method. Empty-seed locality makes zero irrelevant filter calls; deferred search observes the correct state/failure on consumption; provider calls observe current closure                                                               | PROOF-009       |
| REQ-011 / AC-011 | Each existing StringDocumentTarget save route has Java-compatible accumulation, reuse and failure effects. Private byte/tree/reparse/isomorphism admission gates cannot reject Java-accepted output. Writer configuration preserves observed copy/no-op/negative-int quirks                                                                                 | PROOF-002, -011 |
| REQ-012 / AC-012 | One exact installed candidate satisfies migrated native assertions, full configured verification, canonical fresh Java reference execution, required Node/browser lanes and producer release evidence. Stale assertions, skipped engines, source-overlay results or mock-only comparisons cannot satisfy this criterion                                     | PROOF-010, -012 |

### 2.1 Quality scenarios

| ID     | Stimulus and environment                                                                                                                            | Falsifiable response                                                                                                                                                                                                                         |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-001 | Same small behavioral fixture through Java and an installed JS candidate, with identical modeled configuration and source/target state              | Equality of the ordered observable vector defined below; unexplained differences fail, even if final ontology structure matches                                                                                                              |
| QA-002 | Inputs immediately below/at/above each discovered private default boundary, using bounded fixtures; source tracing for prohibitively large counters | Java-accepted cases have no additional JS admission failure; error kind and stage match at real Java limits. Resource exhaustion is never mislabeled as a profile violation or unrepresentability                                            |
| QA-003 | Delayed connection, delayed response body, redirects, transient timeout and import failure using owned deterministic transports                     | Connection-only timeout and attempt/event ordering match the selected route; no hidden whole-parse deadline, retry, credential forwarding or publication behavior                                                                            |
| QA-004 | Failed batch, failed root/import, rename/remove/recreate, reuse after error                                                                         | Exact returned outcome, enacted changes, manager indexes, import/config markers, ontology contents and target contents match the oracle at every observed phase                                                                              |
| QA-005 | Native and cross-realm signals, malformed XML and repeated parsing in Node plus Chromium/Firefox/WebKit                                             | Runtime-specific public categories and state match the admitted host contract; no missing required browser result is treated as a pass                                                                                                       |
| QA-006 | Empty/nonempty seed, throwing/recording filter, one-shot/deferred search, mutation between creation and consumption                                 | Same callback count/order, evaluation phase, visible state, exception timing and multiplicity; eager locality is not confused with lazy EntitySearcher                                                                                       |
| QA-007 | Existing ontology/profile/locality workload after admission caps and extra validation are removed                                                   | Preserve semantic verdicts and the earlier measured profile efficiency objective on its approved benchmark; record time/peak memory and avoid a new input-dependent superlinear path. No arbitrary timing threshold becomes a public timeout |
| QA-008 | Dependency enhancement and an untrusted remote context/entity fixture in isolated qualification                                                     | Zero unintended external requests; explicit allowlist/redirect/size capability events agree with Java; dependency provenance/licence and security assessment are complete before admission                                                   |
| QA-009 | Exact package tarball installed in a clean fixture, with old and new native assertion versions accounted for                                        | All current required assertion IDs execute with no duplicate/missing IDs; current contract version rejects the old incompatible default/atomic behavior rather than passing through a weakened matcher                                       |
| QA-010 | Interrupted implementation, partial candidate qualification or post-release regression                                                              | Maintainer can identify the last exact candidate, preserve evidence and restore the previous package without replaying successful partial ontology mutations. No unavailable rollback promise or silently reused stale evidence              |

The common observable vector records input identity; relevant instance/configuration values; API invocation/consumption phase; return category; stable error class/code and causal category; filter/loader/storer callbacks and order; target bytes/characters when relevant; manager members/IDs/document IRIs/import markers; ontology contents/revision/index freshness; and owned resource flush/close events where the capability exists.
Normalize only structurally unavoidable host representations, such as an exception class mapped to the established JS Error subclass.
Do not normalize missing events, earlier errors, lazy-to-eager shifts or partial state.

## 3. Selected design decisions

These decisions select a concrete implementation direction for review.
They are not approvals to change the package.
Alternatives become relevant only at the explicit failure/replan conditions.

| ID      | Proposed decision                                                                                                                                             | Consequence and rejected alternative                                                                                                                                                                                                                                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEC-001 | Use pinned Java behavior as authority for matched non-structural behavior; admit only explicit host type/capability mappings                                  | A safer or more atomic JS result is still a failure. Preserve separately accepted normative output corrections by exact case; no global Java-bug exemption                                                                                                                                                                                                                                     |
| DEC-002 | Implement canonical loader/writer/manager configuration objects and public methods, with one internal option authority and Java value/copy/identity semantics | Remove divergent generic bags/with aliases from the matched API during the breaking migration. Do not make current caps null through a new JS-only configuration facade                                                                                                                                                                                                                        |
| DEC-003 | JVM System and classpath sources have no implicit ECMAScript substitute                                                                                       | Ordinary Node/browser builds have no JVM system/classpath source. Canonical instance overrides and Java built-in defaults apply. No process.env, globalThis, CWD, package-file scan or remote owlapi.properties lookup is introduced. Ambient JVM facilities are explicit omitted host capabilities, not changed defaults                                                                      |
| DEC-004 | Route parsers and transports by the selected Java source/provider authority, applying supported options at the stage Java applies them                        | Preserve factory fallback and native/Rio distinctions. Choose a Node transport with actual connection-phase control for the native route; do not fake a connection timeout with a whole-operation AbortController deadline. Browser transport feasibility is an explicit capability gate                                                                                                       |
| DEC-005 | Keep the current jsonld processor family through a maintained dependency enhancement with a supported context-bound/loader integration seam                   | Prefer a reviewed upstream release; if unavailable, use a separately maintained, versioned package fork of jsonld@9.0.0 with BSD-3-Clause notices and an explicit maintainer. Bind the dependency's internal context bound to the selected Java provider behavior; do not expose a fabricated OWLAPI max-context setter. Replan if maintainability, licence, browser or corpus admission fails |
| DEC-006 | Express manager mutation/loading as the Java phase/state machine using existing ontology/index owners                                                         | Preserve partial progress, forward rollback and stale import/configuration markers where observed. Remove global preflight/full rollback assumptions; do not “fix” Java's pinned quirks                                                                                                                                                                                                        |
| DEC-007 | Separate structure validity and operational implementation from default admission policy                                                                      | Iterative traversal/worklists and allocation discipline replace private depth/work checks on matched routes. Move structural-isomorphism and default-reparse proof out of production save admission and into qualification                                                                                                                                                                     |
| DEC-008 | Match evaluation and consumption phase per API                                                                                                                | Pure in-memory profile/locality/model and StringDocumentTarget work is synchronous where Java is synchronous; EntitySearcher stream-shaped results become lazy single-use iterables, while locality performs its eager computation before exposing results. Existing promises/cooperative yields are not automatically structural adaptations                                                  |
| DEC-009 | Repair existing StringDocumentTarget behavior without selecting missing custom-writer APIs                                                                    | Append to the same target, preserve prior and partial text exactly at the corresponding storer phase, and allow reuse. Keep getWriter/custom Writer/OutputStream/IRI targets explicitly omitted. Withdraw the old atomicity justification; no claim of full storage-API parity                                                                                                                 |
| DEC-010 | Keep one owner for each semantic fact and generate compatibility views                                                                                        | Public membership stays owned by the existing registry generator. A new behavior-contract inventory owns route/scenario/proof classification; independent Java observations own expected outcomes. Human default inventory/API/capability views consume those owners                                                                                                                           |
| DEC-011 | Security policy cannot silently change a matched default                                                                                                      | Match canonical Java controls and selected provider defaults. Application isolation/cancellation/network permissions belong to the explicit embedding host. If security review cannot accept that behavior, stop that slice and seek an explicit scope/design change rather than ship a private safeguard                                                                                      |
| DEC-012 | Qualify one complete installed candidate and migrate existing assertions deliberately                                                                         | Preserve producer release independence and exact consumer pin admission. No staged release with incompatible mixtures of default, state and contract authority; no unreviewed assertion deletion or native-oracle reuse                                                                                                                                                                        |

### 3.1 Canonical configuration contract

The source authorities are [OWLOntologyLoaderConfiguration](https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/model/OWLOntologyLoaderConfiguration.java), [ConfigurationOptions](https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/model/parameters/ConfigurationOptions.java), [OWLOntologyWriterConfiguration](https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/model/OWLOntologyWriterConfiguration.java), and the manager's HasOntologyLoaderConfiguration/HasOntologyWriterConfiguration interfaces.

| Loader query / canonical modifier                                           | Pinned built-in default                                      | Required semantics and consumers                                                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| getConnectionTimeout / setConnectionTimeout                                 | 20000                                                        | Milliseconds for establishing connections, 0 unlimited; negative Java int accepted by configuration and may fail later at transport. No whole-parse deadline |
| getRetriesToAttempt / setRetriesToAttempt                                   | 5                                                            | Same attempt count and zero/negative behavior; native helper's fifth SocketTimeoutException rule must remain visible                                         |
| isFollowRedirects / setFollowRedirects                                      | true                                                         | Cross-protocol policy plus underlying provider behavior; false is not an automatic ban on native same-protocol redirects                                     |
| isLoadAnnotationAxioms / setLoadAnnotationAxioms                            | true                                                         | Initial load and later manager annotation-change applicability, with ID-keyed lifetime                                                                       |
| getMissingImportHandlingStrategy / setMissingImportHandlingStrategy         | THROW_EXCEPTION                                              | Canonical strategy values and failure/event phase; SILENT behavior proven separately                                                                         |
| getMissingOntologyHeaderStrategy / setMissingOntologyHeaderStrategy         | INCLUDE_GRAPH                                                | Native/Rio graph/header treatment through actual parser routes                                                                                               |
| isReportStackTrace / setReportStackTraces                                   | true                                                         | Report content/cause treatment, not a new parse policy                                                                                                       |
| isStrict / setStrict                                                        | false                                                        | Canonical parser compatibility behavior, not a relabeling of current strict mode                                                                             |
| isTreatDublinCoreAsBuiltIn / setTreatDublinCoreAsBuiltIn                    | true                                                         | Native parser semantic responsibility                                                                                                                        |
| getPriorityCollectionSorting / setPriorityCollectionSorting                 | ON_SET_INJECTION_ONLY                                        | Factory/provider selection order at the corresponding mutation/lookup phase                                                                                  |
| getAuthorizationValue / setAuthorizationValue                               | empty string                                                 | Exact transport use; never include secret values in reports                                                                                                  |
| isAcceptingHTTPCompression / setAcceptingHTTPCompression                    | true                                                         | Negotiation and decoding in the selected transport                                                                                                           |
| shouldTrimToSize / setTrimToSize                                            | true                                                         | Post-load trim phase; no invented admission cap                                                                                                              |
| shouldRepairIllegalPunnings / setRepairIllegalPunnings                      | true                                                         | Existing selected semantic authority and parser application                                                                                                  |
| getBannedParsers / setBannedParsers                                         | org.semanticweb.owlapi.rio.RioTrixParserFactory              | String matching and factory exclusion behavior; no JS-only parser ban                                                                                        |
| getEntityExpansionLimit / setEntityExpansionLimit                           | string "100000000"                                           | Preserve string API, validation timing and native/Rio/JDK application; not a replacement-count/depth/bytes tuple                                             |
| shouldSkipModuleAnnotations / withSkipModuleAnnotations                     | false                                                        | Selected locality/module annotation behavior                                                                                                                 |
| shouldAllowDuplicatesInConstructSets / withAllowDuplicatesInConstructSets   | false                                                        | Selected construct semantics; do not expand the unrelated normative correction programme                                                                     |
| addIgnoredImport, removeIgnoredImport, clearIgnoredImports, isIgnoredImport | Empty configured set plus Java's built-in ignored namespaces | Copy/no-op behavior and namespace membership, not only exact caller-added values                                                                             |

Java integer parameters map to Number values in the signed 32-bit integer domain; booleans, strings, enum objects and nullability follow the declared Java type with an explicit JS type-error mapping.
Java-inexpressible Number values do not create an “unlimited Infinity” API.
Conversely, a negative Java int or string that Java accepts at the setter cannot be rejected early merely for safety.
Establish each modifier's identity/copy rule from source/probe, including unusual ignored-import modifiers; do not assume every “set” mutates or every modifier returns a new instance.

Loader getters resolve instance overrides dynamically.
In Java, the remaining precedence is JVM System property, classpath owlapi.properties loaded at class initialization, then enum default.
Ordinary ECMAScript has neither middle source: its admitted configuration-source vector is instance override then the same enum default.
This is an explicit absent host capability, not a renamed default.
A later embedded JVM bridge would require a separately selected host integration that supplies the real facilities and retains their exact timing/coercion; no bridge is implemented here.
The Java probes still test all four sources to prevent accidental claims of full JVM configuration-source coverage.

Writer configuration has eight public option pairs: shouldSaveIdsForAllAnonymousIndividuals/withSaveIdsForAllAnonymousIndividuals=false; shouldRemapAllAnonymousIndividualsIds/withRemapAllAnonymousIndividualsIds=true; isUseNamespaceEntities/withUseNamespaceEntities=false; isIndenting/withIndenting=true; isLabelsAsBanner/withLabelsAsBanner=false; shouldUseBanners/withBannersEnabled=true; getIndentSize/withIndentSize=4; shouldOutputNamedGraphIRI/withNamedGraphIRIEnabled=false.
These are writer-instance defaults, not an excuse to route every writer getter through ConfigurationOptions.
The private copy operation omits indent size and banners; a changed modifier can reset those fields.
Same-value modifiers return the same object.
Negative indent ints are accepted.
Test chained modifications and emitted output, not only getters.

Expose the canonical manager getOntologyLoaderConfiguration/setOntologyLoaderConfiguration and getOntologyWriterConfiguration/setOntologyWriterConfiguration with Java ownership and replacement behavior.
Loading an ontology can retain a configuration association independent of subsequent manager replacement.
OWLDocumentFormat parameter mutability/key semantics remain their own authority; the Rio adapter applies only settings the actual provider reports.
Do not freeze or JSON-snapshot every parameter just because the current generic JS bag is immutable.

### 3.2 Default restrictions and complete finding disposition

The inventory below is the minimum finding coverage, not the full matched-route inventory required by AC-001.

| Finding / extension           | Current divergence and selected repair                                                                                                                                                                                                                  | Slice / proof                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| F01                           | Structural depth 512 and annotation depth 64 differ across add/change/transform/Manchester/Turtle, with wrong expressionDepth diagnostics. One validity/traversal authority without non-Java default admission; retain input-path consistency           | SLICE-008; PROOF-008                     |
| F02                           | Profile work 1000000, depth 256/hard 512, numeric length 4096/hard 65536 and literal length 1048576 UTF-16 can produce unverified/false for valid Java input. Remove their default verdict influence; preserve null timeout and normative profile rules | SLICE-009; PROOF-008/-009                |
| F03                           | Save caps at 32 MiB plus term/tree/construction bounds, loader reparse gates and private isomorphism work 1000000 reject Java-accepted data. Rendering owns correctness; independent qualification owns round-trip/isomorphism proof                    | SLICE-011; PROOF-011                     |
| F04                           | Loader custom fields/defaults/value validation disagree with canonical methods, Java connection/retry/redirect/entity semantics and option lifetime. Replace the policy bag on matched routes with canonical authority                                  | SLICE-002/-003/-004; PROOF-002/-003/-004 |
| F05                           | Default strict Turtle, multi-graph rejection and unused external-entity rejection differ from selected Java acceptance. Match route-specific default acceptance and failure phase; do not infer universal parser behavior                               | SLICE-003/-004; PROOF-003/-005           |
| F06                           | 8192-byte sniff and fallback only after ParserMismatch reject 9000-space Functional input without a hint. Match factory order, retry/fallback and retained parser diagnostics                                                                           | SLICE-003; PROOF-003                     |
| F07 / GAP-03                  | Boolean net change, whole-batch rollback, thrown collision cleanup and result details differ. Preserve Java ChangeApplied outcomes, sequential state and forward-rollback quirk                                                                         | SLICE-006; PROOF-007                     |
| F08 / GAP-04                  | Annotation false applies to later adds; rename/remove leave configuration keyed to old ID. Preserve those associations and same-manager lifetime                                                                                                        | SLICE-006/-007; PROOF-002/-007           |
| F09                           | Writer modifier identity, omitted copy fields and negative ints differ. Port the observed value/identity consequences through canonical methods                                                                                                         | SLICE-002/-011; PROOF-002/-011           |
| F10 / GAP-02                  | Existing StringDocumentTarget replaces instead of appending; failed-save consequences cannot be assumed atomic. Characterized custom Writer remains omitted, not proof of a JS limitation                                                               | SLICE-011; PROOF-011                     |
| F11                           | Empty-seed locality invokes a filter unnecessarily; EntitySearcher eagerly consumes Java-deferred work. Match each algorithm's actual eager/lazy boundary and exception phase                                                                           | SLICE-010; PROOF-009                     |
| F12                           | Hostnames beginning fc/fd are mistaken for private IPv6 and denied. Parse address literals correctly and apply only the selected Java/provider policy; no blanket private-network rule without authority                                                | SLICE-003/-005; PROOF-004/-006           |
| F13 / GAP-01                  | jsonld.js private context cap 10 differs from selected hasmac 256 check/257 admissions. Rio secure/cache defaults true, whitelist 25; several format settings ignored. Admit the dependency enhancement and exact provider settings                     | SLICE-005; PROOF-006                     |
| GAP-04 additional             | Root failure retains successful new imports; retry can observe failed-import markers. Preserve existing and new member/index/config state at every load phase                                                                                           | SLICE-007; PROOF-007                     |
| GAP-05 additional             | Browser adapter returns normally for nested parsererror documents while Node rejects. Observed adapter behavior only; qualify public parse error/fallback/publication before fixing the relevant seam                                                   | SLICE-004; PROOF-005                     |
| Matched provider audit        | ImportsClosureSetProvider currently snapshots construction-time closure; Java observes live manager state. Include removed/foreign ontology ownership and lifecycle cases                                                                               | SLICE-010; PROOF-009                     |
| Matched language/parser audit | KRSS/DL/RDF and profile ledgers mix acceptance and normative output corrections. Classify each selected route, including full-IRI positive controls and integer input-domain boundaries, without reversing unrelated output corrections                 | SLICE-001/-003; PROOF-001/-003           |

F04's current numeric restrictions are all inventoried, not just maxInputBytes: maxAnnotationDepth 64; maxAxioms/maxBlankNodes/maxRdfListLength 1000000; maxExpressionDepth/maxXmlNestingDepth 512; maxImportCount 256; maxImportDepth 32; maxInputBytes/maxRemoteDocumentBytes 33554432; maxQuads/maxTokenCount 5000000; maxTokenLength 1048576; maxRedirects/maxRetries 0; maxSniffBytes 8192; timeoutMs 30000; XML entity declarations 256, replacement length 65536, nesting 16 and expanded bytes 33554432.
The default remote-import/context false flags and strict/single-graph modes also need canonical-route disposition.
Do not merely raise these numbers or leave a private hard maximum behind a nullable public field.
Optional safety limits survive only where an actual selected Java configuration authority permits the same semantics; other host policy is external and explicit.

### 3.3 Single authorities, seams and failure ownership (DRY-01)

| Semantic fact / proposed owner                                                                                                                                                                  | Consumers and dependency direction                                                     | Deployment and failure contract                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Java public membership: existing `util/generate-java-api-surface.mjs` and its source metadata                                                                                                   | Generated java-api-surface.json/.md, API.md, capability assertions and package exports | Regenerate as one change. Stale/unknown route or omitted-member mismatch fails registry qualification                                                                  |
| Behavioral route classification: proposed `docs/compatibility/java-api-behavior-contract.json` plus schema                                                                                      | Default-behavior inventory, scenario selection, proof reports and migration coverage   | One owner for route IDs, source authority and proof links. It does not generate Java expected results or duplicate public member authority                             |
| Runtime configuration semantics: `model/owlOntologyLoaderConfiguration.js`, `model/owlOntologyWriterConfiguration.js` and a proposed internal canonical-option module under `internal/loading/` | Manager, parsers, transports and storers use getters at the measured phase             | No per-parser default tables. Changed option, invalid value and missing capability use their owning error category, not a generic resource error                       |
| Manager state: `model/owlOntologyManager.js` with `internal/loading/managedOntologyIndex.js` and `internal/model/ontologyState.js`                                                              | Loading, mutation, search/query indexes and closure providers                          | One authoritative member/ID/document/config/import-marker state machine; derived caches invalidate on actual enacted changes, including unsuccessful/throwing batches  |
| Structural validity: `internal/model/structuralValidation.js` and existing structural fields/transform owners                                                                                   | Change records, direct model entry, transforms, Manchester and RDF paths               | No duplicate depth admission. Validity errors describe actual invalid structure; allocation/stack failure is not “unsupported ontology”                                |
| Transport/provider behavior: existing I/O loading path and syntax adapters                                                                                                                      | Parser registry delegates acquisition; JSON-LD uses its admitted loader seam           | Native/Rio/provider distinctions remain explicit. Connection/body/error phase recorded in tests; no fallback to a hidden transport with different policy               |
| XML interpretation: existing `internal/parsing/xml/` authority                                                                                                                                  | OWL/XML, RDF/XML, profile XML literals and browser/Node adapters                       | One entity/configuration policy; provider-specific error recognition normalized at the correct boundary, with public call-path proof                                   |
| JSON-LD processing: maintained dependency API plus `internal/parsing/jsonld/jsonLdSyntaxAdapter.js`                                                                                             | JSON-LD parser and shared remote loader                                                | No second context expander or preflattening pipeline. Dependency admission failure blocks this slice and release                                                       |
| Storage text/state: existing storer registry, format renderers and package-private target append seam                                                                                           | Four existing storers and StringDocumentTarget                                         | Format owns rendering/failure phase; target owns accumulated text. Qualification uses structural comparison; production does not reparse as a default acceptance guard |
| Native expectations: independent Java harness observations                                                                                                                                      | Behavior differential runner and installed-contract assertion cases                    | Source/runtime/classpath/candidate identity required; no JS-generated expected result or mock simulating “what Java should do”                                         |
| Release contract: existing installed OWL contract assertion inventory and qualification scripts                                                                                                 | Native reporter, candidate/release gates and downstream pin admission                  | Versioned migration with complete executed assertion accounting; no duplicated hand-maintained consumer oracle                                                         |

If an implementation introduces a second authority for one of these facts, the owning slice must explain the distinct semantic responsibility or redesign before integration.
Separate oracle expectations are intentionally independent proof, not runtime defaults duplicated for convenience.

## 4. Vertical implementation slices and integration order

The integration owner is the assigned owlapi implementer; the owlapi maintainer owns acceptance and security-policy decisions.
Each specialist contributor owns the semantic boundary stated below, its proof and its migration notes.
Concurrent execution is not authorized by this document alone.
If separately authorized, parallelism follows semantic ownership, not file count.

Every slice delivers a public behavior plus its independent oracle/installed assertion and current documentation classification.
“Code complete, tests later” does not finish a slice.
Predicted file locations identify owners and seams; they are not microscopic edit instructions or promises about future line numbers.

### SLICE-001 — Admit the behavior contract and independent oracle

**Outcome:** A reviewer can identify every matched route, its exact behavior target and the proof that will fail on the current divergence.
Reconcile existing selected membership and stale omissions without resetting completed rc.2 work.

**Scope and files:** Existing `util/generate-java-api-surface.mjs`, registry metadata, `docs/compatibility/java-api-surface.json/.md`, `API.md`, capabilities, current decision ledger/schema, `docs/compatibility/default-behavior-inventory.md`, and proposed behavior-contract JSON/schema.
Extend the existing `util/owlapi-reference/` harness family and installed behavioral fixtures; add a focused `test/java-behavior/` suite rather than a second qualification framework.
Behavioral rows reference public-member IDs and independent Java fixture IDs; generator output does not become the oracle.

**Proof and completion:** PROOF-001 inventories all current bindings and each selected overload with one disposition: matched and proven; host representation mapping with a precise proof; or unavailable capability outside this track.
It fails unknown routes, stale source pins, missing configuration consumers and broad unbounded adaptation statements.
PROOF-002 through -011 start as reproducible failing behavioral cases on the baseline.
Source-bound exploratory overlays remain labeled research; the future fresh reference build generates the admitted native expectations.
An overlap review identifies which KRSS/DL/RDF/profile rows concern acceptance versus separately accepted output semantics.

**Dependencies and handoff:** First slice; supplies a frozen contract revision to all subsequent slices.
REQ/AC-001 and -012; QA-001/-009; DEC-001/-010/-012.
The owner accepts new decisions and scoped supersessions before product implementation; drafting this plan does not perform that acceptance.
CLEAN-001 removes superseded current authority only after its replacement is validated, preserving historical records.

### SLICE-002 — Canonical configuration through observable effects

**Outcome:** A caller constructs the Java-named configuration, uses the canonical methods, observes the correct object identity/copy behavior, and sees the values applied at the same phase.

**Scope and files:** `model/owlOntologyLoaderConfiguration.js`, `model/owlOntologyWriterConfiguration.js`, `model/owlOntologyManager.js`, model exports and the internal option authority.
Coordinate format parameter behavior with `formats/` and parser adapters.
Remove the current divergent configuration-bag API from the matched surface without aliases.
Reconcile exact accepted types, optional/null behavior and enum namespace mapping in the public registry.

**Proof and completion:** PROOF-002 covers every table row, every option consumer and writer chain: default, changed value, repeated same value, copy isolation, chained indent/banner reset, negative int, 0 timeout, zero/negative retries, malformed string and failure timing.
Include manager replacement before/after load, loadAnnotationAxioms true as a positive control, built-in ignored imports and mutation-time annotation filtering. Test format parameter mutability and unsupported Rio settings. Real JVM property/classpath precedence is separately recorded on Java; Node/browser tests confirm no fabricated ambient source or read at import time.
Public defaults remain identical when those JVM host sources are absent.

**Dependencies and handoff:** After SLICE-001.
Configuration owner alone changes canonical values; parser/storage owners consume them. REQ/AC-002/-003/-007/-011; QA-001/-003/-004; DEC-002/-003.
Complete shared option contract before parser or state slices integrate.
CLEAN-002 retires unused bag fields/with aliases/default tables and their exports/tests/docs at the coordinated breaking boundary.

### SLICE-003 — Loader selection, acceptance and native transport

**Outcome:** Existing public loading routes accept Java-compatible documents and report errors at the right stage, with Java-compatible factory ordering, parser retries and import transport behavior.

**Scope and files:** `io/` acquisition/loading owners, `model/owlOntologyManager.js` load entry, `internal/parsing/parserRegistry.js`, format selection/descriptors, lexical cursors and RDF/N3 preparation.
Consumer responsibilities remain parser-specific; a new facade that merely catches all errors is not selected.
The loader uses actual canonical getters at the observed phase and passes only supported values into each selected provider.

**Proof and completion:** PROOF-003 covers no hint, explicit format, known extension/media type and misleading hint, leading whitespace beyond 8192, parser mismatch versus syntax failure, unsupported format and retained diagnostic ordering. Include strict false/true behavior, multiple graphs where the selected Java route accepts them, annotation true/false and THROW_EXCEPTION/SILENT controls.
Existing formats outside the original examples receive matrix rows; normative output differences remain exactly scoped.

PROOF-004 uses owned transport fakes at the transport interface for deterministic connection/read timing, and bounded loopback integration only when separately permitted by the verification environment. Verify timeout 0 and 20000 connect-only behavior, delayed bodies, zero/negative/default retries, the hard fifth socket-timeout branch, native same-protocol versus cross-protocol redirects, compression, authorization and cleanup after error. Prove ordinary fcorp.example/fd-prefixed DNS names are not IPv6 literals.
Tests deny real external egress.

The proposed Node implementation uses an existing maintained transport capability that exposes connection establishment separately from body consumption; prefer existing Node HTTP(S)/current dependency facilities over a new generic client. A browser fetch implementation must be characterized for redirects, opaque responses, CORS and connection-phase visibility. Where the browser cannot express an operation, classify that exact host capability as unavailable; do not apply a different hidden timeout/retry policy or advertise complete transport equivalence.

**Dependencies and handoff:** After SLICE-001/-002; interfaces agreed with SLICE-004/-005 and manager integration owned jointly with SLICE-007.
REQ/AC-003/-007; QA-001/-003/-008; DEC-001/-004/-011.
CLEAN-003 removes obsolete sniff ceilings, fallback guards and transport-policy duplicates once all entry points are routed.

### SLICE-004 — XML semantics across real providers

**Outcome:** Selected OWL/XML, RDF/XML and XML-literal routes apply the canonical entity configuration and detect failure consistently with the qualified Java/provider path.

**Scope and files:** `internal/parsing/xml/xmlParserAdapter.js`, `xmlEntityPolicy.js`, `xmlEntityDefaults.js`, `xmlNames.js`, OWL/XML and RDF/XML syntax adapters, `internal/profiles/xmlLiteral.js` and their consumer tests.
Reuse XML parser native capability; do not turn a lexical prescan into a second XML parser or automatically reject declarations Java never expands.

**Proof and completion:** PROOF-005 starts from the observed duplicate-attribute and empty-prefix cases, but executes through each public load/profile route before setting its expected error/state.
The adapter's nested-parsererror acceptance is observed; malformed ontology publication has not been claimed.
Add internal entity expansion, unused external declaration, used external entity, XML 1.0/1.1, control character, namespaces and nesting cases under the canonical Java/JDK and Node/browser providers. Test entity-expansion string values and their application/validation stage rather than treating all current byte/depth restrictions as Java defaults.

Cover native and cross-realm AbortSignals only where an explicitly retained host operation uses them.
A duck mock does not prove platform support.
Chromium, Firefox and WebKit results are mandatory in the supported browser lanes; the local Firefox spawn failure is an environmental gate, not permission to waive Firefox.

**Dependencies and handoff:** After SLICE-001/-002, shared load/error ordering from SLICE-003.
REQ/AC-004/-008/-009; QA-001/-002/-005; DEC-004/-007/-011.
CLEAN-004 removes duplicate private entity defaults and updates provider capability claims after all consumers pass.

### SLICE-005 — JSON-LD dependency and Rio-equivalent defaults

**Outcome:** A default public JSON-LD load succeeds through 13 and 25 allowlisted contexts, rejects an unlisted context before loading, and preserves selected Rio setting/filter/cache behavior without the JS private cap.

**Scope and files:** `internal/parsing/jsonld/parser.js`, `jsonLdSyntaxAdapter.js`, existing JSON-LD compatibility adapter, the shared context loader, `package.json`/lock only for an admitted dependency artifact, browser import maps/bundling, dependency evidence/licence inventory. Keep the OWL/RDF mapping owner unchanged.
The dependency enhancement owns only the missing supported context-processing control; it is not a second JSON-LD algorithm in owlapi.

**Concrete dependency route:** The current jsonld@9.0.0 documentLoader capability is reused.
A maintained enhancement must add a supported context-count control with documented counting/error phase, preserve cycle handling and allow the adapter to select the Java-provider bound without a new OWLAPI public setter. Prefer an upstream version that passes admission; otherwise maintain a separately versioned fork of that same dependency, retaining its BSD-3-Clause attribution and a small reviewed patch. The owlapi maintainer must accept ongoing maintenance/security ownership before adopting the artifact.
If the fork needs broad algorithm replacement, loses supported browser execution, cannot meet callback/error phase, or cannot be licensed/maintained, stop and replan a processor replacement.
No preflattening, dummy cycle counters, internal contextResolver API, import-path override or node_modules patch is an alternative.

**Proof and completion:** PROOF-006 distinguishes public and backend scenarios.
Public defaults use the actual 25-entry Rio whitelist with secure/cache true; a 13- and 25-URL chain succeeds, unlisted URLs make zero loader calls, and setting SECURE_MODE=false through OWLDocumentFormat remains ineffective because that setting is not reported supported. The 257-success/258-failure boundary is a backend qualification case supplied with effective secure mode false, corresponding to the real Java system-property probe.
It does not add a new JS setter or claim that ordinary JS supports JVM properties.

The cache contract is now closed: one static URI-keyed cache is shared across parsers/managers; successful loads are reused with their original document, failures are not cached, bypass does not clear prior entries, and secure whitelist checks precede cache access. Format DOCUMENT_LOADER_CACHE=false is ignored. The provider source configures maximumSize(1000), expireAfterWrite(1 hour), concurrencyLevel(8) and fresh default loader options in the cached branch; exact Guava source specifies same-key concurrent-load coalescing. TTL/capacity/single-flight are source-traced, while reuse/error/bypass/whitelist ordering were bounded-probed.
Select an existing cache primitive only if those observables can be configured exactly, with a controlled-clock proof instead of a one-hour sleep.
Ordinary default secure mode admits only 25 distinct whitelist URLs, so the 1000-entry bound is not reached on that public capability; broader backend configuration remains separately qualified.
Avoid network-dependent tests or approximate TTL defaults.
The dependency artifact must pass its supported JSON-LD corpus, existing ontology fixtures, cycle/error/multiplicity/callback cases, package/browser lanes, SBOM/provenance and vulnerability/licence review.
The separate hasmac HTTP redirect limit is qualified on the relevant route, not confused with context depth.

**Dependencies and handoff:** After SLICE-001/-002 and the transport contract from SLICE-003; can develop in parallel with XML after those boundaries stabilize. REQ/AC-003/-005/-012; QA-001/-003/-008/-009; DEC-003/-004/-005/-011/-012. CLEAN-005 removes the old dependency/default-cap path and updates exact lock/evidence/import-map sources together.

### SLICE-006 — Java mutation outcomes and partial state

**Outcome:** Existing change application exposes canonical ChangeApplied categories and the actual Java state transition sequence, including awkward failure cases.

**Scope and files:** `model/owlOntologyManager.js`, change classes and result/enum exports, `internal/model/ontologyChangeRecord.js`, `ontologyState.js`, structural validators and query/index invalidation.
Use the existing change semantic owners; do not put the old atomic pipeline behind a Java-named wrapper.

**Proof and completion:** PROOF-007 covers empty and no-op batches; add/remove inverse returning SUCCESSFULLY despite no net difference; duplicate changes; unsuccessful annotation addition; add/remove followed by unsuccessful change leaving one axiom through forward rollback; thrown SetOntologyID collision leaving earlier changes; enacted-change details and subsequent query freshness.
Synchronous precondition versus mid-batch failure is part of the assertion.
Result details and state revisions follow actual enacted effects, including rollback effects, rather than final structural equality.

Listener/veto/reentrancy observations from the supplement constrain the design and are native characterization fixtures.
This slice does not expose currently omitted listener registration APIs.
If a matched existing callback invokes mutation, qualify that reentrancy through its public route.
Adding the complete listener family requires a separate scope decision, not accidental convenience during state refactoring.

**Dependencies and handoff:** After SLICE-001/-002 and shared structure contract with SLICE-008; one manager-state integration owner coordinates SLICE-007. REQ/AC-006/-007/-008; QA-001/-004; DEC-006/-007/-008. CLEAN-006 retires boolean/net-delta assumptions and whole-batch rollback assertions after migration of all installed consumers of those results.

### SLICE-007 — Manager load lifetime, identity and retry

**Outcome:** A caller who inspects or reuses the manager after a failed load sees the Java-retained ontologies, markers and configuration associations.

**Scope and files:** Manager loading and ID maps, `internal/loading/managedOntologyIndex.js`, existing import-closure loaders/resolvers and IRI mappers.
Reuse one state machine with the change owner; do not maintain a second transactional shadow manager for loading.

**Proof and completion:** PROOF-007 records state before each load phase, immediately after error and after a second operation.
Mandatory fixtures: valid A then malformed B leaves new A and preexisting ontologies but removes root; malformed root after A leaves A; repaired B/retry with the same manager preserves the observed failed-import marker consequence; retained A still rejects annotation addition under its original configuration. Also cover reused imports, shared/cyclic closure, already-managed roots, aliases/document IRIs, silent strategy, failure before registration and after ontology ID replacement.

Configuration rows require load false → later annotation rejection; rename → accepted annotation under new ID; old-ID reuse and remove/recreate → retained rejection. These are fixed pinned-target acceptance cases. Derived ontology/document/ID/import indexes, getOntology/contains checks and closure providers must agree with the actual retained state.
Any unprobed permutation is a named oracle case, not an assumption of full rollback.

**Dependencies and handoff:** After SLICE-002/-003 and coordinated SLICE-006. REQ/AC-003/-006/-007/-010; QA-001/-003/-004; DEC-006. CLEAN-007 removes closure-wide compensating cleanup and documentation promises only after all error/retry branches are qualified.

### SLICE-008 — Structural admission and transformations

**Outcome:** A valid deeply nested expression or annotation structure has consistent acceptance through direct model operations, changes, transforms and selected parsers.

**Scope and files:** `internal/model/structuralValidation.js`, `structuralFields.js`, `objectTransform.js`, change-record creation, selected utilities and Manchester/Turtle consumers. Preserve semantic equality/canonicalization and existing output corrections.
Prefer iterative traversal/worklists and existing field metadata; do not duplicate walkers or hide the old cap in a common helper.

**Proof and completion:** PROOF-008 exercises boundaries around 64 annotations and 512 expression depth through every applicable route, confirms no false expression-depth diagnosis and checks duplicates/cycles/invalid fields separately.
Java oracle cases are bounded to valid input the canonical runtime can evaluate.
Source inspection accounts for large internal counters; no stress run to exhaustion is required.
A real Java/provider stack or memory failure is characterized separately and does not authorize a smaller arbitrary JS default.

Transform/rename/duplicate callbacks, exception phase and mutation consequences must be tested as well as structure.
Performance evidence verifies that replacing recursive admission does not add repeated full traversal or destabilize existing identity rules.

**Dependencies and handoff:** After SLICE-001/-002; agreed contract before SLICE-006 integration and SLICE-009/-011 completion.
REQ/AC-008/-009/-011; QA-001/-002/-007; DEC-007/-008/-010.
CLEAN-008 removes unused default depth validators and callers, preserving true structural checks.

### SLICE-009 — Profile execution and verdicts

**Outcome:** Profile assessment has Java-compatible accepted input, verdict and evaluation/failure phase while retaining the separately selected normative rule semantics.

**Scope and files:** `profiles/` report and four profile classes, `internal/profiles/budget.js`, datatype/facet/numeric/XML-literal logic and source evidence.
Separate Java profile verdict from any application-owned scheduling or forensic source metadata.
Java-incompatible budget failure cannot be represented as “not in profile, no violations.”

**Proof and completion:** PROOF-008/-009 exercise work/depth/literal/numeric boundaries with bounded Java-accepted examples, profile violations as positive controls, empty/small ontology, source-backed and programmatic objects, stale source evidence and actual error categories. The accepted null default deadline remains a positive control. Remove private hard ceilings as well as public defaults where no Java authority exists. No new maxWork/maxDepth fallback is introduced by a helper.

DEC-008 proposes a breaking return/scheduling change for synchronous pure-model profile assessment: results and thrown failures occur in the corresponding Java phase. The old cooperative-yield approval and OA-DEC-001 do not settle this new behavior target. Measure event order before changing it; if retained source acquisition actually requires asynchronous host I/O, split that acquisition from pure-model assessment and classify the exact host capability in SLICE-001 rather than claiming all profile work must be asynchronous.
Existing callers relying on Promise methods, cancellation options or UI yielding need the migration specified in section 7.
Revalidate the approved profile performance benchmark; speed does not excuse a verdict change.

**Dependencies and handoff:** After SLICE-001/-002/-004/-008. REQ/AC-008/-009/-012; QA-001/-002/-005/-007; DEC-007/-008/-011. CLEAN-009 removes matched-path budget/verdict adapters and stale “unverified means false” claims after native and installed proofs.

### SLICE-010 — Search, locality and live providers

**Outcome:** Same caller/filter activity at the same stage observes the same graph state and failure as Java.

**Scope and files:** `search/entitySearcher.js`, ontology query/index APIs, `modularity/locality/syntacticLocalityModuleExtractor.js`, `internal/modularity/`, `util/owlOntologyImportsClosureSetProvider.js` and public iterator/enum representations.
Reuse existing structural/query owners.
A reusable array is not a substitute for Java's one-shot deferred stream.

**Proof and completion:** PROOF-009 inventories all selected EntitySearcher methods and overloads for single versus collection/stream sources, encounter order, multiplicity, null/input failure and evaluation phase.
Construct a result, mutate the ontology, then consume it; record callbacks/exceptions and second consumption.
Return a lazy single-use iterable for the Java stream contract, preserving the existing output elements and Java's single-use consequence with the selected Error mapping.

Locality is different: Java computes the module eagerly before returning its stream.
Test empty seed with a throwing/recording filter (zero irrelevant calls), nonempty closure, relevant/rejected candidates, exceptions and fixed points.
Pure-model locality computation is synchronous under DEC-008; no forced cooperative yield or hidden budget.
ImportsClosureSetProvider.ontologies() recomputes from current manager state; test add/remove imports and removed/foreign ontology ownership against Java, not merely snapshot equality at construction.

**Dependencies and handoff:** After SLICE-001 and manager/structure contracts; final integration after SLICE-006/-007/-008. REQ/AC-006/-007/-010; QA-001/-004/-006/-007; DEC-006/-008/-010.
CLEAN-010 removes eager snapshots, copied callback pipelines and stale provider lifetime documentation.

### SLICE-011 — Existing storage target, configuration and failures

**Outcome:** The four selected save formats preserve Java-compatible target accumulation and error consequences, and no hidden production validation limit rejects representable output.

**Scope and files:** `io/stringDocumentTarget.js`, manager storage entry, `internal/storage/storerRegistry.js`, Functional/OWLXML/Turtle/RDFXML renderers, `rdfStorage.js`, writer configuration consumers and storage error classification. Replace the private complete-text replacement seam with a format-consumable append sink. It is internal target ownership, not a new public write/append/getText shim.

**Proof and completion:** PROOF-011 covers fresh target, prepopulated target from a prior save, saving twice, configuration changes between saves, empty ontology, invalid ontology/format, no storer, renderer runtime error, failure after earlier text and subsequent reuse.
For existing StringDocumentTarget, use supported public input sequences and controlled storer fixtures at the registry seam; do not add a custom public writer merely for tests.
Each injected internal failure is paired with a real pinned Java storer scenario or explicitly remains a seam test, never a claimed public equivalence observation.

A 1048577-character valid literal and structural boundaries exercise the former reparse/default-cap path. Source accounting covers 32 MiB and 1000000 isomorphism limits proportionately. Structural round-trip/isomorphism checks stay in independent tests/native oracle, with ambiguity reported honestly; they no longer veto a successful production save through a second differently configured loader.

For synchronous in-memory StringDocumentTarget saving, DEC-008 proposes immediate completion/failure and append effects. Preserve writer copy/no-op/negative-int behavior. Custom Writer observations of swallowed IOExceptions, double close and partial runtime failures remain explicit evidence about an omitted capability; this slice neither maps every JS Error to IOException nor claims that StringDocumentTarget itself can inject arbitrary I/O failures.

**Dependencies and handoff:** After SLICE-001/-002/-008 and shared error/format contract; require SLICE-004/-005 as consumers for round-trip proof, without restoring production reparse.
REQ/AC-002/-008/-011; QA-001/-002/-004/-009; DEC-007/-008/-009.
CLEAN-011 retires replacement/atomic-commit helpers, unused production reparse/isomorphism paths and old target assertions after migrated proof passes.

### SLICE-012 — Installed contract, documentation and candidate qualification

**Outcome:** One exact installed package and its release evidence describe the repaired behavior consistently, and no obsolete assertion or hidden route remains.

**Scope and files:** `docs/compatibility/installed-owl-contract.md`; `test/consumers/owl-contract/` public-model, acquisition and writer cases/native reporter; `scripts/qualify-owl-contract.mjs` and `owl-contract-evidence.mjs`; `docs/release/owl-contract-sources.json`; public registry/default inventory/decision schema; migration/resource/writer/performance documents; consumer qualification fixtures and existing release gates.
Update source owners and regenerate derived views together.

**Proof and completion:** PROOF-010/-012 requires a reviewed old-to-new assertion inventory. The baseline 69 native assertions remain accounted for until the versioned replacement intentionally supersedes them; every removed atomic/safe-default assertion points to a stronger precise Java-compatible behavior assertion and migration reason.
Native reporting still fails missing/duplicate IDs or failed execution.
Add config-retention, forward-rollback, retry-marker, target-append, default-whitelist and scheduling cases to the producer contract.
Do not use a changed matcher to hide mismatches.

Run configured full checks once on the complete candidate and the additional exact installed/native/browser gates.
Preserve fixed consumer source pins and their admission rules; revise the current producer contract version through its owner rather than forge old consumer success.
Consumer adoption and production deployment remain independently authorized.
Update claims only to the coverage actually proven, including unavailable JVM/custom-writer/listener capabilities and browser transport limits.

**Dependencies and handoff:** Completes after all other slices.
REQ/AC-001 through -012; QA-001 through -010; DEC-010/-012.
The integration owner delivers exact candidate identity, source/reference/runtime records, proof/cleanup manifest, residual capability boundaries and migration/recovery instructions to the maintainer.
CLEAN-012 completes all current-document/fixture/dependency cleanup and verifies no temporary shim or private divergent default remains.

### 4.1 Dependency and parallelism contract

The critical order is SLICE-001 → SLICE-002 → shared loader/manager/structure contracts → behavioral slices → SLICE-012.
Specifically, SLICE-003 feeds -004/-005/-007; SLICE-006 and -007 share one serialized manager-state integration; SLICE-008 feeds -006/-009/-011; SLICE-010 consumes the resulting state/query contract. Storage and profile work can proceed independently after configuration/structure contracts stabilize, but their integration waits for the relevant XML/JSON-LD proof.

The integration owner resolves shared manager and error contracts before merging slice work.
Configuration defaults have one editor/owner; no parallel slice may invent a local override to make its tests pass. Contract/oracle fixture updates stay synchronized with behavior revisions.
The new dependency artifact can be prepared independently after its admission contract is accepted; it cannot enter the candidate until its complete proof passes.

A changed Java pin, dependency provider, host scheduling mapping, API selection or security-policy decision invalidates dependent contracts and triggers replan.
It does not justify quietly rebasing golden outputs.

## 5. Proof ownership and executable verification

### 5.1 Oracle contract and test doubles

The Java harness owns expected outcomes.
It executes pinned source in the canonical native build environment, records provider selection and emits the observable vector independently of JS.
The JS runner consumes the same fixture stimulus and compares its observed vector.
Fixtures encode intent; golden output is never generated by running the implementation under test and declaring its result correct.

Mocks belong only at externally controlled seams: clock/connection/body events, remote document content, input stream, storer failure trigger and callback recorder.
They do not replace the manager, configuration, profile verdict, XML provider, JSON-LD processor or native reference.
Every mock-driven state case has a native observation or a clearly labeled seam-only invariant.
In-memory remote content makes context/import tests deterministic and zero-egress; mock calls, unexpected requests and cleanup are asserted.

Extend the existing reference harness framework with a proposed `RunAPIBehaviorContract.java` and a companion behavior comparison entry point under `util/owlapi-reference/`.
Its CLI contract is selected here for implementation: exact reference directory, exact candidate directory, output directory and closed fixture selector; no hidden environment-dependent source discovery or mutable network oracle.
The implementation must integrate with existing native build/candidate identity verification instead of creating another build/release workflow.

Each result binds JS commit/tree and package digest; Java commit/tree; ordered classpath and dependency bytes; harness source digest; canonical JDK/Maven identity; runtime/browser version; parser/provider; explicit effective settings with secrets redacted; exact fixture; command/exit status; observed events/state; and assertion IDs.
Unknown source provenance or a missing required lane yields “not qualified,” not an inferred pass.

### 5.2 Proof matrix and focused commands

Commands below are future implementation verification, not a record that they ran for this plan.
Proposed test files are created by the named slice using the existing Jest/native framework. Output directories are fresh task-owned external evidence paths. Resolve current tooling/profile prerequisites before execution; do not install, configure or publish as an incidental response to a failed proof.

| Proof     | Owner and falsifiable evidence                                                                                                                                                       | Focused entry point                                                                                                                                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PROOF-001 | SLICE-001: route/member inventory, schema, source pin and adaptation completeness; every matched configuration consumer classified                                                   | `node util/generate-java-api-surface.mjs --java-root "<pinned-java-checkout>"` (check mode); `npm test -- --runInBand --runTestsByPath governance.test.js test/java-behavior/coverage.test.js`                                                                                  |
| PROOF-002 | SLICE-002: all canonical config methods/defaults/domains/identities/effects; writer copy quirks; instance versus absent JVM host-source boundary                                     | `npm test -- --runInBand --runTestsByPath model/owlOntologyWriterConfiguration.test.js test/java-behavior/configuration.test.js` plus exact native configuration fixtures                                                                                                       |
| PROOF-003 | SLICE-003/-007: parser selection, 9000-space input, default acceptance, graph/header/annotation/import strategies, exception/fallback phase                                          | `npm test -- --runInBand --runTestsByPath io/io.test.js test/java-behavior/loading.test.js` plus parsing/import native harnesses                                                                                                                                                |
| PROOF-004 | SLICE-003: connection-only timeout, retries, redirects, DNS/IP classification, auth/compression and cleanup; Java native/Rio routes separate                                         | `npm test -- --runInBand --runTestsByPath test/java-behavior/transport.test.js` plus bounded native transport observations                                                                                                                                                      |
| PROOF-005 | SLICE-004: real XML provider error recognition and public error/state path, entities and valid/cross-realm signals where selected                                                    | `npm test -- --runInBand --runTestsByPath internal/parsing/xml/xmlParserAdapter.test.js test/java-behavior/xml-runtime.test.js`; required browser fixture lanes below                                                                                                           |
| PROOF-006 | SLICE-005: real processor/default whitelist13/25, unlisted rejection, ignored unsupported format setting, cache ownership, backend257/258, cycles, failures and dependency admission | `npm test -- --runInBand --runTestsByPath test/java-behavior/jsonld.test.js` plus admitted processor corpus and native Java JSON-LD fixture family                                                                                                                              |
| PROOF-007 | SLICE-006/-007: sequential outcomes, inverse/forward rollback, thrown partial effects, load cleanup/retry and ID/config lifetime                                                     | `npm test -- --runInBand --runTestsByPath model/rc2Changes.test.js model/ontologyChanges.test.js test/import-closure/public-contract.test.js test/java-behavior/manager-state.test.js` plus native event/state snapshots                                                        |
| PROOF-008 | SLICE-008/-009: structure/annotation, profile literal/numeric/work boundaries and real invalid structure; absence of hidden hard ceilings is source-accounted                        | `npm test -- --runInBand --runTestsByPath util/rc2Transforms.test.js profiles/rc2Profiles.test.js test/java-behavior/admission.test.js`                                                                                                                                         |
| PROOF-009 | SLICE-009/-010: synchronous verdict phase, lazy search consumption, eager locality callbacks, live providers, query freshness and performance                                        | `npm test -- --runInBand --runTestsByPath search/entitySearcher.test.js modularity/locality/locality.test.js util/owlOntologyImportsClosureSetProvider.test.js profiles/profileDeadline.test.js test/java-behavior/evaluation.test.js` plus approved profile benchmark protocol |
| PROOF-010 | SLICE-012: native assertion migration, exact candidate, package boundaries, current docs/ledger/registry consistency                                                                 | `npm run test:boundary`; `npm run test:owl-contract -- --candidate "<candidate-directory>" --output "<fresh-contract-evidence-directory>"`                                                                                                                                      |
| PROOF-011 | SLICE-011: four formats, target append/reuse/error phase, configuration output and no private reparse admission; independent structural oracle                                       | `npm test -- --runInBand --runTestsByPath io/stringDocumentTarget.test.js model/owlOntologyManager.storage.test.js internal/storage/rc2Storers.test.js test/java-behavior/storage.test.js` plus native four-format storage fixtures                                             |
| PROOF-012 | Integration owner: all configured full checks, fresh canonical native reference, exact installed candidate, required Node/browser jobs and accepted release gate inventory           | Current profiles below; existing candidate/native jobs; `npm run test:browser -- --fixture-root "<prepared-installed-fixture>" --project chromium`, then firefox and webkit; governed release qualification with real candidate/native evidence                                 |

The registry command above is verified check-only without `--write`.
Regeneration uses its existing `--write` mode during implementation.
Existing `npm run qualify:release -- --candidate "<candidate-directory>" --output "<qualification-file>" --owl-contract "<native-contract-directory>"` is a later hosted release-evidence operation: it requires authentic CI/candidate metadata and executes a credential-free publication dry run plus registry-state checks.
It is not a replacement for full tests and must not be run with fabricated CI environment values to obtain a local PASS.

Compilation/invocation of the proposed native behavior harness uses the existing validated source build and classpath launcher. Supply the exact emitted distribution/runtime classpath, compile harnesses into the task-owned output directory, and run the closed scenario selector through that launcher.
Do not use the exploratory selected-class overlay or a Maven-labelled JAR as the final oracle.
Native class/provider identity and runtime-dependent results accompany every comparison.

### 5.3 Current HISEW profiles and final selection

Read-only profile inspection on 2026-10-13 returned these commands and declared timeouts.
They are current workflow configuration, not acceptance evidence:

| Profile  | Current commands                                                                                                                                                                               | Declared timeout per command             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| focused  | `npm run test:boundary`; `npm test -- --runInBand --runTestsByPath governance.test.js io/io.test.js`                                                                                           | 120 s; 180 s                             |
| affected | `npm run lint`; `npm run test:boundary`; `npm test -- --runInBand governance.test.js io/ model/ internal/model/ internal/storage/ test/import-closure/ test/consumers/webvowl/cutover.test.js` | 180 s; 120 s; 300 s                      |
| full     | `npm run lint`; `npm run format:check`; `npm run verify:release-gates`; `npm run verify:workflow-governance`; `npm run test:boundary`; `npm test -- --runInBand --silent`                      | 180 s; 180 s; 120 s; 120 s; 120 s; 600 s |

Use focused slice proofs during implementation, affected checks at integration seams, and the configured **full** profile for the final coherent candidate.
Add PROOF-001 check-mode regeneration, `npm run verify:architecture` when dependency/module boundaries change, all behavior-native comparisons, the installed OWL contract and required Node/browser lanes.
The configured full profile alone does not execute every native/browser/installed qualification and cannot stand in for them.

Run the full suite once after required slice checks pass on the final candidate.
Repeat only checks invalidated by later changes or concrete failures; record dependency-based invalidation.
Research-only documentation validation is scoped Markdown formatting/checking, JSON parsing, source hashes, local link/ID checks and worktree preservation.
It does not require the product suite and confers no product acceptance.

### 5.4 Research-to-proof distinction

The primary six programs and supplementary seven programs are reproducible research evidence.
The supplementary 13/25 default-context tests are two fresh JVM executions of one program. Their success does not count as PROOF-012. The two exploratory probe coding errors were corrected and both attempts retained; final Java/browser program exits were zero.
Firefox did not launch.
Source tracing of large byte/isomorphism boundaries is explicitly distinct from boundary exhaustion. Public XML error/state qualification and complete permutation matrices are future proof obligations.

## 6. Security, privacy, reuse and observability

### 6.1 Assessment ownership and admission

The owlapi maintainer is accountable for accepting the compatibility/security tradeoff.
The assigned security reviewer assesses the selected transport, XML, JSON-LD dependency and removal of arbitrary defaults before candidate admission; the integration owner supplies the exact diff, threat-relevant routes and bounded evidence.
Reviewer capability must be resolved through the current HISEW procedure.
An unavailable reviewer is a named review gate; it does not authorize a fabricated pass or a private alternative default.

Security review covers increased accepted workload, entity expansion, remote import/context access, redirects, credential forwarding, local-file/native-host capabilities, cache reuse and denial of service.
Java's provider-specific secure JSON-LD default is preserved.
It is incorrect either to retain blanket JS network false everywhere or to declare Java universally allows every URL.
Private-network filtering must use correct address parsing and real selected policy; it must not misclassify DNS names or become an unrequested default guard.

The accepted public configuration must retain its semantic responsibility.
Applications can run untrusted work in a worker/process, constrain their transport capability and cancel their own operation through supported host facilities; this plan does not add policy wrappers to owlapi or claim that host restrictions are Java behavior.
If exact default behavior is unacceptable for a supported product environment, stop and obtain an explicit scope change.
Documenting a hidden divergent default does not resolve the conflict.

### 6.2 Native capability, naming and licence review

Prefer current parser, stream/iterator, transport, cache and native XML facilities when they implement the required semantics.
Capability comparison precedes introducing a replacement.
Java names identify semantic authority; they do not justify mechanically copying Java implementation code or exporting helper internals.
Keep existing package namespaces and canonical method spellings.
New internal names describe their owned responsibility, not “compat,” “legacy,” “safe” or “Java mode” wrappers.

The current jsonld package declares BSD-3-Clause.
A dependency enhancement/fork must retain the licence/notices, record source revision, reviewed patch, reproducible package digest, maintainer, vulnerability response and browser distribution.
Verify actual licence files and transitive licences at the selected candidate; a package.json label is not complete licence admission.
Java reference sources and dependencies are research/test artifacts with their own notices; no copied Java control flow or source file is introduced into the runtime package under this plan.
If reuse changes that boundary, perform a fresh licence review before adoption.

Consumer validation uses the existing installed candidate fixtures and pinned source-admission rules.
No copied consumer algorithm or second producer oracle is selected.
UO/WebVOWL continue to own application semantics, policy and deployment.

### 6.3 Observable evidence without product leakage

Compatibility reports must make hidden differences visible: provider/runtime, scenario/configuration ID, outcome category, failure phase, callback counts/order, retained-state summary, target length/digest, request attempts, and assertion execution counts.
Reports must never log authorization values, raw user ontology contents, tokens or secret URLs.
Use synthetic fixtures and redact credentials before writing diagnostics.

Do not add a public trace callback or telemetry stream merely to collect proof.
Instrument test-owned adapters and existing report seams; prove instrumentation does not change lazy/eager behavior.
Runtime acceptance uses existing public operations and package provenance, with any environmental restriction recorded as a capability outcome.
There is no new production telemetry service in scope.

The release observer is the owlapi maintainer or their designated release operator.
They inspect native assertion completeness, required browser/Node jobs, first candidate/public-package qualification and reported consumer regressions.
This plan does not schedule monitoring, send external messages or authorize new deployment.

## 7. Compatibility, migration and interruption

### 7.1 Breaking migration contract

This repair changes behavior previously advertised in rc.1/rc.2 plans. The maintainer selects the next version/channel through the existing release process after reviewing the exact candidate.
Do not silently republish or mutate an existing immutable package.

| Existing caller assumption                                                            | Required migration and validation                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generic loader bag, withParsingMode/withRemoteImports/max* fields                     | Use canonical Java configuration methods and strategies. Remove old aliases in one coordinated package change; inventory every supported consumer call site and test default/explicit behavior                                                                                |
| Zero/Infinity/negative limit conventions                                              | Follow the canonical method's Java value domain and phase. Connection timeout 0 is unlimited; a rejected JS-only Number value is not reinterpreted. Entity expansion remains a string option                                                                                  |
| Boolean result or atomic batch rollback                                               | Consume ChangeApplied's canonical categories and inspect actual manager state after unsuccessful/thrown operations. Do not retry a whole batch under an assumption that nothing happened                                                                                      |
| Failed import load leaves no new ontologies                                           | Account for retained successful imports, ID/configuration associations and request markers. A clean retry may require a new manager if the caller needs a fresh session                                                                                                       |
| Reusing StringDocumentTarget replaces text                                            | Construct a fresh target for a fresh document; reuse only when accumulation is intended. Save after failure cannot assume the target is empty or unchanged                                                                                                                    |
| Promise-returning pure in-memory profile/locality/save calls and cooperative yielding | Update return-type declarations and Promise-method call sites; awaiting an immediate result alone does not preserve previous callback/error timing. Catch synchronous failures around invocation. Move application scheduling to its own worker/event-loop boundary if needed |
| Profile/locality AbortSignal or implicit time/work limits                             | Remove unsupported matched-signature options. Preserve only a separately admitted canonical host capability. Application cancellation must explicitly own interruption and the resulting partial state; no library default deadline remains                                   |
| Eager reusable EntitySearcher arrays                                                  | Consume the lazy single-use iterable at the intended time; materialize explicitly in application code when a snapshot/reusable collection is desired. Test mutation between creation and consumption and second use                                                           |
| Closure provider snapshots construction time                                          | Obtain a deliberate application snapshot if required; repeated provider calls now reflect current manager closure                                                                                                                                                             |
| All writer modifiers preserve all other fields                                        | Test Java's actual chained reset/no-op identity consequences, especially indent size and banners                                                                                                                                                                              |
| No network by default or a universal redirect policy                                  | Configure the actual supported canonical/provider behavior and embedding permissions. Verify the declared runtime capability; do not depend on a removed accidental guard                                                                                                     |
| Full JVM/configuration/custom-writer/listener parity                                  | Treat those omitted capabilities as unavailable; canonical instance methods and existing targets retain their exact selected contract                                                                                                                                         |

DEC-008 is a proposed consequential API/scheduling change, not an already accepted adaptation. Before implementation, SLICE-001 records the Java invocation/return/consumption phases and current JS public phases for each route. Pure-model work has no inherent reason to yield. An unavoidable browser network Promise is a host representation mapping only after the exact operation's capability/ordering has been demonstrated; it does not waive synchronous input errors, parser fallback, callback ordering or state publication.
If a supported parser/dependency cannot realize the selected in-memory phase without a broader replacement, stop that affected slice and replan the dependency/capability boundary.
Do not preserve the existing async implementation by relabeling it structural.

Published migration history remains intact.
Add the new current migration amendment and reconcile the registry/default inventory.
Downstream adoption is a separate decision; the producer may release when its own gates pass, and consumers retain their previously qualified pin until their own migration is authorized.

### 7.2 Interruption, resume and artifact ownership

Before each implementation session, record exact checkout/tree, accepted plan revision, source/dependency pin, contract schema version, active slice, completed proof IDs and known unrelated changes.
Reuse the same accepted dossier and valid results.
On resume, compare relevant inputs and invalidate only dependent evidence.
Never adopt another worktree/execution, reset completed rc.2 history, or infer authority from an old branch name.

If interrupted while compiling or qualifying, close task-owned Java/browser processes, deny further fixture transport, and leave complete/partial outputs distinctly labeled.
A half-written result cannot be promoted into proof.
Retain source programs and logs before cleaning external scratch.
Do not delete other sessions' evidence or manually alter HISEW state.

Runtime interruption is part of the behavior proof: record already-applied changes, retained imports, partial target content and resource ownership at the exact stage.
Recovery must not replay a whole operation blindly.
Java-compatible partial progress is not a rollback failure to conceal; it is caller-visible state the migration must explain.

## 8. Release, abort, rollback and cleanup

### 8.1 Admission and rollout

The maintainer accepts the exact plan/decision revision before implementation, assigns the integration and security-review roles, and binds the R2 route through the supported workflow. Slice integration produces one coherent source candidate. A reviewed candidate then completes configured full checks, fresh canonical Java/native execution, exact installed contract, required browser/Node lanes and current producer release gates.

Publication, signing, push/merge and consumer deployment require their existing separate authority. This plan selects no release number, publication date or automated CI dispatch. Reuse naturally triggered/retained authenticated evidence only under current exact identity rules; do not activate source-build reuse for the new pin merely because research used retained JARs.

The rollout unit is the immutable owlapi package plus its registry, migration and qualified dependency artifacts.
The observer verifies candidate/public-package digests and the required proof inventory before advertising the new behavior.
Consumers validate their chosen pin with the existing admission contract; production cutover belongs to each consumer.

### 8.2 Stop and recovery conditions

| Condition                                                                                                              | Required response and owner                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unknown behavioral difference, missing matched route, wrong native source/runtime, missing assertion or browser result | Integration owner stops candidate qualification, retains evidence and fixes the owning slice. No expectation rewrite without the Java/source classification                                                                                  |
| Dependency patch cannot meet supported API, semantic corpus, licence, browser or maintenance admission                 | Maintainer rejects dependency admission; replan a processor replacement or explicit scope change. Do not patch installed files                                                                                                               |
| Security review rejects Java-compatible default exposure in the intended host                                          | Maintainer resolves product scope/capability explicitly. Do not ship an undocumented restrictive mode or alter Java's public default                                                                                                         |
| Existing installed consumer fixture fails because it assumes old behavior                                              | Version/review its canonical assertion/migration through the existing source owner. Do not bypass source pin checks or mark a failed fixture optional                                                                                        |
| Qualification interrupted or later source/config/runtime input changes                                                 | Preserve candidate identity and partial logs; rerun only invalidated proofs before release                                                                                                                                                   |
| Regression found before publication                                                                                    | Back out the coherent repair/dependency unit to the last verified source candidate, or forward-fix and requalify affected/full gates as required                                                                                             |
| Regression found after immutable publication                                                                           | Retain the published artifact/evidence. Stop promotion, pin consumers to the prior qualified package when safe, and publish a separately qualified forward fix under new version authority                                                   |
| A caller has already accumulated target text or partially mutated/loaded a manager                                     | Package rollback alone cannot undo state. Discard the affected target/manager and reconstruct from caller-owned known-good source/snapshot when a fresh session is required; never promise automatic restoration from an unsuccessful status |

There is no persisted on-disk database migration in the selected library change.
In-memory state and the dependency/public API contract still require coordinated restoration. Reverting only a helper while retaining new config/contract consumers is unsafe; rollback is the coherent dependency unit identified by the integration owner.
A fresh manager is the reliable restoration boundary for retained ID/import/config markers; removing ontologies is not guaranteed to clear those markers on the pinned Java target.

### 8.3 Cleanup and traceability ledger

| Slice     | Requirement / acceptance  | QA / decision                                      | Proof                  | Release cleanup obligation                                                                             |
| --------- | ------------------------- | -------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------ |
| SLICE-001 | REQ/AC-001, -012          | QA-001/-009; DEC-001/-010/-012                     | PROOF-001/-010         | CLEAN-001: amend current authority, preserve historical records and exact source pins                  |
| SLICE-002 | REQ/AC-002/-003/-007/-011 | QA-001/-003/-004; DEC-002/-003                     | PROOF-002              | CLEAN-002: remove divergent bag/alias/default producers and regenerate API views                       |
| SLICE-003 | REQ/AC-003/-007           | QA-001/-003/-008; DEC-001/-004/-011                | PROOF-003/-004         | CLEAN-003: retire sniff/fallback/transport guard duplicates                                            |
| SLICE-004 | REQ/AC-004/-008/-009      | QA-001/-002/-005; DEC-004/-007/-011                | PROOF-005              | CLEAN-004: consolidate XML default/policy owners and qualify all provider claims                       |
| SLICE-005 | REQ/AC-003/-005/-012      | QA-001/-003/-008/-009; DEC-003/-004/-005/-011/-012 | PROOF-006              | CLEAN-005: exact dependency, notice, import-map, cache/default and old-path cleanup                    |
| SLICE-006 | REQ/AC-006/-007/-008      | QA-001/-004; DEC-006/-007/-008                     | PROOF-007              | CLEAN-006: retire boolean/atomic assumptions and update native caller assertions                       |
| SLICE-007 | REQ/AC-003/-006/-007/-010 | QA-001/-003/-004; DEC-006                          | PROOF-003/-007         | CLEAN-007: remove closure-wide cleanup promises and stale retry/config assumptions                     |
| SLICE-008 | REQ/AC-008/-009/-011      | QA-001/-002/-007; DEC-007/-008/-010                | PROOF-008              | CLEAN-008: remove private admission caps and duplicate walkers                                         |
| SLICE-009 | REQ/AC-008/-009/-012      | QA-001/-002/-005/-007; DEC-007/-008/-011           | PROOF-008/-009         | CLEAN-009: remove resource-to-verdict and obsolete scheduling adapters/docs                            |
| SLICE-010 | REQ/AC-006/-007/-010      | QA-001/-004/-006/-007; DEC-006/-008/-010           | PROOF-009              | CLEAN-010: remove eager snapshots and document actual consumption/lifetime                             |
| SLICE-011 | REQ/AC-002/-008/-011      | QA-001/-002/-004/-009; DEC-007/-008/-009           | PROOF-002/-011         | CLEAN-011: retire target replacement and production reparse/isomorphism admission                      |
| SLICE-012 | REQ/AC-001 through -012   | QA-001 through -010; DEC-010/-012                  | PROOF-001 through -012 | CLEAN-012: version all current assertions, preserve native coverage and qualify the exact release unit |

Cleanup is part of slice completion, not deferred technical debt.
Delete obsolete code only when its consumers and proof have moved.
Keep historical ledger/publication evidence and external research; label superseded current claims instead of silently erasing their authority.
Audit for unused dependencies, stale exports, duplicate defaults, hidden hard maxima, compatibility aliases, generated views and test helpers before candidate freeze.

## 9. Unknowns, cheapest experiments and replan triggers

The known research gaps have bounded answers; the following items remain explicit implementation/qualification gates.
They are not reasons to ask the owner to repeat the semantic goal, and they must not be reported as already proven.

| Gate                                     | Known fact and cheapest next evidence                                                                                                                                         | Pass / replan boundary                                                                                                                                                                                                   |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Complete native source build             | Seven source-bound classes plus retained dependencies were enough for scoped research. Use the existing closed-environment native recipe on the exact candidate/reference pin | Pass only with full required provenance and canonical runtime. Unsupported reuse or changed provider/runtime requires fresh evidence                                                                                     |
| XML public failure consequences          | Exact adapter accepts nested parsererror wrappers in Chromium/WebKit; downstream public ontology behavior not measured                                                        | Run the small malformed fixtures through installed load/profile routes, record error/fallback/state. Replan seam ownership if several routes bypass the adapter                                                          |
| Firefox execution                        | Local spawn UNKNOWN; other two engines completed                                                                                                                              | Execute the existing mandatory Firefox lane in a working supported environment. No waiver based on local unavailability                                                                                                  |
| Browser transport capabilities           | Fetch may hide redirect chains and connection phase; source policy cannot prove those are controllable                                                                        | A bounded controlled transport case measures visibility/control before implementation. If impossible, classify exact capability as unavailable or seek an explicit host/transport design change                          |
| JSON-LD maintained enhancement           | Current private cap has no supported public override; 13/25 default-whitelist acceptance proves a real divergence                                                             | Minimal dependency enhancement plus official corpus and exact callback/error tests. Broad rewrite or unowned fork triggers processor-replacement replan                                                                  |
| JSON-LD backend versus public settings   | Java format SECURE_MODE is ignored, JVM property works; JS has no JVM source                                                                                                  | Keep public ignored-setting and default cases separate from effective-backend257/258 proof. Any request for ambient property support is a new host-capability design                                                     |
| Evaluation/Promise mapping               | Current JS eagerly/async executes several pure-model routes; this is not inherently structural                                                                                | Record invocation/return/consume/error order for each selected method, implement synchronous/lazy target where feasible. Dependency requiring a broader replacement or genuine host-only I/O triggers exact-route replan |
| Full manager permutations                | Representative partial-state, retry and config-retention quirks are proven                                                                                                    | Small native matrix covers branch-specific reuse/alias/cycle/silent cases; unexpected state extends the same state-machine proof rather than imposing atomic cleanup                                                     |
| String target partial failure            | Append and arbitrary Java Writer behavior are proven; custom Writer remains omitted                                                                                           | Use real storer/input failures and controlled registry seams to establish existing String target effects. Need for public custom target support requires explicit scope expansion                                        |
| Huge limits and performance              | 32 MiB/isomorphism/private hard maxima are source traced; no exhaustive allocation run                                                                                        | Prefer counter/algorithm source proof plus representative bounded cross-route fixtures and existing workloads. Unexpected stack/memory growth or superlinear work requires algorithm replan, not a lower hidden default  |
| Normative output correction overlap      | Existing ledgers preserve deliberately different ontology output semantics                                                                                                    | Classify acceptance/timing separately with exact source and fixture. If inseparable, obtain a scoped decision on that fixture; do not blanket-reverse or blanket-exempt the programme                                    |
| Reviewer capability / security admission | Read-only HISEW discovery did not establish a ready reviewer executor                                                                                                         | Resolve current supported review capability at the review phase. Preserve draft/unreviewed status if unavailable; no manual receipt or invented security acceptance                                                      |

Replan also when the Java reference revision, supported runtime matrix, public API selection, dependency licence, canonical configuration responsibility or release gate ownership changes.
A routine file move or a same-input passing focused check does not require repeating discovery or owner permission.

## 10. Review checklist and current deliverable state

The owner reviews the concrete decisions, especially canonical configuration replacement, synchronous/iterator return-shape migration, retained partial-state quirks, String target accumulation, absent JVM/custom-writer capabilities, maintained JSON-LD dependency ownership and security exposure.
Acceptance of this plan must identify its exact revision/digest and any amended DEC IDs.
Until then, implementation remains unauthorized.

This task delivers this plan and the two supplementary research artifacts.
It preserves the two original research artifacts and unrelated checkout work.
Validation for the plan is limited to its Markdown/tooling, reference/identifier consistency, structured evidence parsing/hashes and final worktree inspection.
No implementation or release acceptance is implied by those checks.
