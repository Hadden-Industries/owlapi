# Profile performance and default-behavior repair: OwlAPI

**Status:** Owner-selected repair implemented on 9 October 2026; split plan retained from 5 October.
**Decision owner:** Maksym Shostak.
**Scope:** Part 2, owned and retained in the OwlAPI repository.
**Companion:** [Independent WebVOWL ontology-loading repair](https://github.com/Hadden-Industries/webvowl/blob/main/docs/plans/2026-10-05-ontology-loading-regression-repair-plan.md).
The companion is saved locally in `C:\Users\maksy\GitHub\webvowl\docs\plans`; its GitHub link is a publication destination, not evidence that either draft has been published.

The owner requested postponing library fixes while WebVOWL restores successful loading and native syntax selection through the installed RC.1 public API.
This plan preserves the deferred library work from the combined regression proposal and the subsequent default-behavior audit.
It is related to the [rc.2 Java-parity programme](0.1.0-rc.2-java-parity.md), but does not automatically add scope to that release or select a version for this repair.
Planning authority does not authorize implementation, public-contract/configuration changes, execution adoption, review delegation, commits or release.

Implementation was authorized on 9 October 2026 from synchronized local `main` at `4859f2ef8ff32f92c9c81e3632641d481a5e5e8f`.
The R2 execution covers scheduling, the [default-policy inventory and proposal](../compatibility/default-behavior-inventory.md), and producer qualification.
The owner approved the profile-only `timeoutMs: null` default: omission and explicit null disable its elapsed deadline, while explicit nonnegative safe integers, including zero, retain their meaning.
All other profile limits and loader defaults remain unchanged.
The scheduler-capable prototype failed timer-based cancellation in Chromium windows and workers, so the selected elapsed-work implementation uses a timer turn after approximately 50 ms of work.
This is a scheduling choice, not a change to explicit resource limits or ontology meaning.
Current UO bytes and the executable Java pin differ from the historical observations below; qualification records their actual identities separately.

## Purpose, route and responsibility

Make profile assessment efficient while preserving its verdicts and evidence, and make library defaults defensible against the pinned Java authority.
Callers should be able to distinguish a Java-compatible behavior from an explicit JavaScript/application policy without discovering that distinction through a failed ordinary load.
Library correctness, package/browser qualification and release remain producer-owned.
WebVOWL/UO acceptance, adoption, configuration or deployment must not block an OwlAPI release, following the existing release-independence amendment.
Part 1 needs no output from this plan; future WebVOWL dependency adoption is a separate consumer change.

Reuse the existing R2 parity/lifecycle route, subject to confirmation at implementation admission: default acceptance, public limits, semantic output and asynchronous scheduling can affect every Node/browser consumer.
HISEW inspection on 5 October confirmed active personal applicability for both repositories.
No retained execution is adopted, resumed or baselined by this documentation update.
Recheck applicability, exact source/Java pins, requirement decisions and remaining review allowance before implementation or engine mutation.
Use the configured external workflow evidence root `C:\Users\maksy\.hi\w\e`, resolved again before execution artifacts; preserve product-owned fixtures and release records in their established locations.

## Baseline and diagnosis

| Item                       | Recorded observation                                                                                                                                    | Evidence boundary                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current planning checkout  | `073beefb7805130bc0452472d1a9c801471fbaf1`                                                                                                              | Refreshed source identity; not the published package identity.                                                                                                                       |
| Installed consumer package | `@hadden-industries/owlapi@0.1.0-rc.1` through WebVOWL's native `owlapi` alias                                                                          | Earlier inspection found byte-identical loader defaults, profile budget and Manchester parser in source and installed RC.1. Recheck the exact candidate before changing these files. |
| Java authority             | `util/owlapi-reference/pinned-version.json`, revision `d7e997a53b470e32700de89cc610d9daf01ea769`                                                        | Deliberately pinned OWLAPI 5.5.1 comparison authority; release-tag default configuration was also inspected. Refresh neither implicitly.                                             |
| Triggering document        | UO `dist/universal/core/20260912-full`, SHA-256 `79f794425b79d59d6ff162404c818034ae8de88efd3b6fd800a48d0e7add9f9d`                                      | Exact local, read-only reproduction. Rights and portable fixture identity remain separate gates.                                                                                     |
| Earlier Node diagnosis     | Parsing approximately 2.5-3.15 seconds; assessment approximately 25.7 seconds; full consumer opening approximately 30 seconds.                          | Stage-level diagnosis, not current browser/release qualification.                                                                                                                    |
| Scheduling experiment      | Replacing only zero-delay timers with `setImmediate` in a disposable Node probe reduced the full operation to 5.19 seconds; 1,743 pauses were observed. | Supports scheduling-overhead causality. It is not a portable implementation or permission to replace globals.                                                                        |
| Existing native pattern    | Several owning parsers yield after approximately 50 ms of work, using `scheduler.yield()` where available and a timer fallback.                         | Reuse candidate for profile scheduling; verify each runtime and cancellation behavior.                                                                                               |

The profile budget's checkpoint currently queues a zero-delay timer every 256 work units.
Its default elapsed deadline is 30 seconds even when the caller supplies no options.
Java's ordinary profile checking has no corresponding elapsed-time or work-budget options.
Java does have network connection and XML entity-expansion controls; this plan does not characterize Java as universally unbounded.
WebVOWL's separate 10-second worker deadline is consumer policy and remains outside library ownership.

## Scope and invariants

The immediate technical slice is profile scheduling; the broader slice inventories, decides and qualifies default-behavior differences.
Keep current profile violations, source qualifications, retained evidence, work/depth counting and cancellation truthful.
An incomplete assessment must remain explicitly unverified rather than valid or falsely invalid solely because a deadline expired.
An optimization must preserve ontology structure, canonicalized comparison results and explicit bounded-call outcomes.

No application-specific file handling, VOWL ledger/admission model, visualization, worker watchdog, UI or consumer dependency update belongs here.
Do not create a new public format detector for this consumer repair: the existing public manager already detects the extensionless reproduction and reports the resulting format.
No blanket removal of security controls, automatic network enablement, normative reinterpretation or compatibility shim is approved.
No package, lockfile, lint/test/CI policy, compatibility JSON registry/schema or performance configuration change is authorized by this plan.
Identify the exact files/settings and impact before requesting approval for any required configuration edits.

## Requirements and acceptance

The following OA identifiers are local draft requirements for this corrective track; they supplement the existing producer parity plans and do not replace accepted registries or constitute an engine snapshot.

| Requirement                                    | Falsifiable acceptance                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OA-REQ-001: Efficient cooperative assessment   | OA-AC-001: On identical source/runtime and options with an adequate explicit deadline, compare five foreground cold runs before/after. The median assessment time for the pinned reproduction is at most 50% of the recorded pre-fix median; record pauses, CPU/elapsed time and memory. Select any stronger production target from the measured baseline. |
| OA-REQ-002: Verdict preservation               | OA-AC-002: Before/after violation codes, relevant details, source-assessment status/qualifications and ontology structure agree for the pinned reproduction and affected existing corpus. Intentional semantic differences require a separate approved decision and oracle.                                                                                |
| OA-REQ-003: Honest cancellation and exhaustion | OA-AC-003: Explicit work/depth/deadline exhaustion retains its documented typed or unverified result; cancellation rejects with the existing abort contract and is observed within 100 ms on the foreground reference runtime, with no partial manager publication.                                                                                        |
| OA-REQ-004: Complete default-policy inventory  | OA-AC-004: Every selected Java-shaped loading/profile/lifecycle operation has a recorded Java default, JS default, actual enforcement point, concrete behavioral consequence, evidence status and proposed disposition. Unsupported capabilities are separated from changed defaults.                                                                      |
| OA-REQ-005: Explicit parity decisions          | OA-AC-005: Each changed default has an owner-selected parity or adaptation decision, executable differential/negative evidence and migration consequences. No unknown or unmatched difference is declared conforming.                                                                                                                                      |
| OA-REQ-006: Producer-owned qualification       | OA-AC-006: The installed candidate passes affected semantic, package-boundary, Node/browser, resource/security and exact-artifact checks without relying on consumer adoption or approval.                                                                                                                                                                 |

OA-QA-001: A consumer assesses the pinned ordinary ontology using the public API; the verdict is preserved and the measured scheduling cost satisfies OA-AC-001.
OA-QA-002: A bounded caller supplies hostile/deep input or cancels; the library enforces the selected explicit contract within OA-AC-003 and exposes incomplete evidence truthfully.
OA-QA-003: A caller omits options for a Java-shaped operation; the default-behavior matrix and differential fixture predict the actual result, including documented deviations.

OA-DEC-001 selects elapsed-work cooperative yielding as the scheduling hypothesis, reusing the existing parser pattern where suitable.
Do not weaken work accounting or verdict checks to meet the performance target.
OA-DEC-002 proposes separating optional caller-supplied computation limits from Java-compatible default behavior; the exact limit API, disabled representation and migration remain an owner decision in slice 2.
No existing zero-valued option may silently acquire a different meaning, and no `Infinity`/`null` convention may be invented without a reviewed public contract.
OA-DEC-003 keeps ordinary library releases independent of consumer adoption.

## Initial default-behavior inventory

This is a source-backed starting inventory, not a completed conformance judgment or instruction to reverse every documented adaptation.

| Area                             | Current JS behavior                                                                                                                       | Java comparison and required decision                                                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loader/profile compute deadlines | Defaults to 30 seconds; numeric options require finite nonnegative safe integers and provide no unlimited form.                           | No equivalent profile elapsed deadline. Decide default parity and a truthful explicit bounded-call contract.                                                                                                                       |
| Loader structural/size bounds    | 32 MiB input, one million axioms, import count 256/depth 32, expression/XML depth 512, plus token/list/entity limits.                     | No corresponding public loader configuration set. Inventory actual enforcement, JVM/parser controls and feasible JS limits before deciding which are policies or unavoidable runtime constraints.                                  |
| Profile resource bounds          | Work one million, depth 256, numeric digits 4,096 and literal length 1,048,576; depth/numeric options also have hard ceilings.            | No equivalent Java public profile budget. Classify explicit safety policy versus semantic/input-domain restriction; qualify unchanged explicit limits.                                                                             |
| Parsing/recovery                 | `parsingMode: "strict"`; compatible/preserve are explicit alternatives.                                                                   | Java `PARSE_WITH_STRICT_CONFIGURATION` defaults to false. Compare actual recoveries; renaming a mode or flipping a flag does not establish parity.                                                                                 |
| Remote imports and transport     | HTTP imports default off and need an injected loader; remote JSON-LD contexts default off.                                                | Java provides retrieval and attempts imports. Characterize JSON-LD through the pinned backend separately; do not assume identical Java controls. Decide library/runtime/security responsibility before any network default change. |
| Retry/redirect policy            | Declares zero retries/redirects. Retry behavior belongs to the injected loader; the inspected redirect guard applies to JSON-LD contexts. | Java configuration defaults to five retrieval retries and permits cross-protocol redirects. Test actual enforcement and scope rather than treating similarly named fields as equivalent APIs.                                      |
| RDF dataset graphs               | `requireSingleGraph` rejects multiple nonempty graphs; merge is explicit.                                                                 | The pinned Rio consumer consumes statements without graph context. Decide whether merge is a Java-compatible default or an explicit adaptation requiring migration.                                                                |
| Lifecycle and mutation           | Import-closure provider snapshots membership; foreign manager queries fail; iterable mutations are atomic with boolean results.           | Java provider is live; other differences are recorded in `java-api-parity-decisions.json`. Distinguish necessary JS API shapes from changed observable behavior.                                                                   |
| Metadata and assessment          | Explicit observed header status, unique reconstructed triple counts and additional literal/facet/nested-annotation validation.            | Existing RDF metadata and profile contracts record differences. Keep truthful evidence and test the exact domain; neither a Java verdict nor a documented adaptation alone proves broader conformance.                             |
| Parser output exceptions         | Manchester `>=`/`<=` facets differ from Java; OWL/XML retains anonymous `ObjectOneOf` operands; DL/KRSS contain controlled corrections.   | Review `expected-differences.json` and parser provenance against current normative references/errata and minimized Java results. In particular, the Manchester mappings change meaning and need an explicit reviewed decision.     |

Annotation loading and missing-import failure defaults already agree at the inspected configuration level; include positive controls so the inventory does not imply every setting differs.
Explicit compatible-mode OWL-Time recovery is not a default-mode override and must be classified separately.
Use [Java configuration defaults](https://github.com/owlcs/owlapi/blob/owlapi-parent-5.5.1/api/src/main/java/org/semanticweb/owlapi/model/parameters/ConfigurationOptions.java), the pinned profile/manager/Rio sources and the repository's [compatibility surface](../compatibility/java-api-surface.md), [parity decisions](../compatibility/java-api-parity-decisions.json), [parser output exceptions](../compatibility/expected-differences.json) and [profile contract](../compatibility/canonical-vowl-prerequisites.md).
Record the Java revision and actual backend/runtime for each executable comparison.

## Vertical slices and traceability

Likely modules are predictions; use canonical owning implementations rather than wrappers that reproduce their semantics.

| Slice        | Observable outcome and likely seams                                                                                                                                                                                                          | Traceability and proof                                                                                                                                                                          | Dependency/release implication                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OA-SLICE-001 | Assessment becomes materially faster with unchanged explicit resource contracts and verdicts. Likely seam: `internal/profiles/budget.js`, profile callers and affected tests; reuse existing parser scheduling patterns.                     | OA-REQ/AC-001, 002, 003; OA-QA-001, 002; OA-DEC-001. Same-byte before/after corpus and five-run timings, scheduler-available/fallback environments, cancellation and bounded exhaustion.        | May form an independently reviewed corrective candidate. It need not wait for every default-policy decision; no release version is selected here.                                                    |
| OA-SLICE-002 | A reviewable default/semantic decision matrix identifies actual enforcement and minimized Java/JS outcomes. Likely seams: owning loader/profile/lifecycle implementations, `util/owlapi-reference` and existing compatibility documentation. | OA-REQ/AC-004, 005; OA-QA-003; OA-DEC-002. Explicit no-options versus configured cases, source/format/import identities, unmatched-difference reporting and security/native-runtime assessment. | Blocks only dependent default changes. Inventory work is semantically independent of scheduling, but no parallel agent/write work is authorized by this plan.                                        |
| OA-SLICE-003 | The first accepted computation-limit decision works end to end through the public loader/profile boundary, with old explicit calls qualified and migration documented.                                                                       | OA-REQ/AC-002, 003, 005; OA-QA-002, 003. No-options Java comparisons, explicit limit failures, value validation, absence/zero semantics and installed-package Node/browser tests.               | Depends on the exact public decision and required configuration approvals from slice 2. Remaining selected defaults are delivered as separately demonstrated vertical cases, not one blanket switch. |
| OA-SLICE-004 | A producer-owned immutable candidate demonstrates the selected repair scope and records all deferred/nonconforming domains accurately.                                                                                                       | OA-REQ/AC-006 and every implemented criterion. Run affected differential, package, browser and resource/security gates against the actual packed/installed artifact.                            | Follows current release controls and independent release authority. WebVOWL/UO integration or sign-off is non-blocking.                                                                              |

## Verification, reuse and security

The pinned Java implementation is the differential oracle for its supported common domain; published normative references and explicit selected interpretations govern any claimed correction.
Never turn a newly observed mismatch into an expected exception solely to make the gate pass.
Recheck modern runtime/API guidance and normative errata before selecting a scheduling or semantic amendment; existing parser code is a reuse candidate, not an unconditional browser guarantee.
Reuse the existing public profile/parser fixtures, Java harness and source-preservation cases.
Add minimized inputs that independently specify acceptance, retained meaning and expected failure; avoid an implementation-mirroring timing test.

Mock genuine external document retrieval and narrowly controlled scheduler capability boundaries.
Exercise real assessment in Node and browsers, including absent `scheduler.yield()`, workers, foreground cancellation and explicit resource exhaustion.
Treat browser background throttling as a separately measured runtime condition rather than evidence that changing the clock or global timers is permissible.
Record effective options, CPU/elapsed time, pause counts, memory, typed errors, source qualifications, runtime identity and candidate bytes without uploading source documents or enabling telemetry.

Use current `npm test -- --runInBand` focused path selection, `npm run test:boundary`, applicable existing Java differential commands, `npm run test:browser` and selected producer performance/package checks.
After consolidation run the current route-selected final verification profiles and exact installed-candidate checks.
Resolve actual scripts/profile commands at admission; successful tests against a checkout are not registry or browser acceptance.
Consumer repositories may supply useful diagnostic cases but their available checkout, production result or release schedule is not a producer gate.
For this planning edit, check scoped Markdown formatting and links only; no new runtime proof is claimed.
Carry forward existing assurance/review constraints without replenishing their allowance or authorizing delegation/security scans through this document.

Native parser/profile validation remains responsible for content and truthful incomplete results.
The owning runtime/loader supplies network and process isolation policies; any move of a guard between those boundaries needs an explicit threat/compatibility decision and adversarial evidence.
Do not enable network contexts/imports merely to match a Java flag without accounting for credentials, schemes, redirects, SSRF capability and caller control.
Reuse the existing security assessment boundary; no custom parallel security interpreter is selected.

## Migration, publication and recovery

Scheduling-only work selects no ontology schema, output-byte or artifact migration.
Default-policy changes may alter accepted documents, recovery semantics, network activity, completion behavior or verdicts; inventory affected public call patterns and document the exact before/after contract.
Preserve the meaning of old explicit options or select a clearly versioned migration.
Update compatibility registries, generated public views, option contracts and performance baselines only after their exact change is authorized and qualified.
The consumer baseline remains the published RC.1 until a consumer separately adopts a new artifact.

Retain pre-change semantic outputs and measurements outside workflow source state for reproducible comparison; do not reuse old success receipts after candidate identities change.
An unpublished candidate can be revised by reversing only its own changes while preserving unrelated work.
A published package version is immutable: recovery requires the existing separately authorized corrective-release/tag/deprecation route and preserved evidence, not overwriting RC.1 or its oracle record.
The producer release handoff must identify the person accepting the candidate evidence; this planning task selects no publisher or deployment observer.

## Unknowns, decisions and replanning

The cheapest first experiment is assessment-only same-byte measurement under an adequate explicit deadline with current scheduling versus the elapsed-work prototype, preserving verdicts and cancellation.
Open decisions include the precise optional-limit API, unavoidable JS runtime ceilings, strict/compatible defaults, safe network ownership, graph merging and normative parser/profile deviations.
Maksym Shostak selects any public default or semantic amendment from the minimized evidence and migration proposal; this draft supplies no implied approval.

Replan when a fix requires a public capability absent from Java's responsibility, exceeds the selected domain, changes ontology meaning without a reviewed oracle, removes bounded-call protection, changes a normative/oracle pin, expands required configuration, or consumes more than the remaining review budget.
Future implementation may select a subset of the matrix for one corrective release; name the omitted decisions and leave their parity claims unqualified.
Neither implementation completion nor producer release completion establishes that WebVOWL's independent repair or adoption has occurred.
