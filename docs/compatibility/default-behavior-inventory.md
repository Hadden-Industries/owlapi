# Loading, profile and lifecycle default policies

The current default authority is the [behavior profile contract](behavior-profiles.md) and the typed `currentBehaviorContracts` section of the [owning parity ledger](java-api-parity-decisions.json).
Configuration names alone do not prove their consumer behavior.
Profile admission remains in progress.

The current Java authority is the formal release commit `f760b3a4c107c6d5f90f856e5680c39b18af646f`, Central artifact and recorded runtime in the [provenance manifest](profiles/java-owlapi-5.5.1/provenance.json).
The original `d7e997a5` and `b61ebe2d` research pins and historical receipts remain unchanged.
Current generators and behavior tests use the released authority explicitly.

## Current policy owners and consumers

| Area                            | Current authority and actual consumer                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Default selection               | Omission selects `normative-v1`; explicit `java-owlapi-5.5.1` selects native behavior. The manager owns a private immutable context.                                                             |
| Native loader settings          | Java setters/getters preserve defaults, copy semantics and failure timing; the Node adapter and XML policy consume the actual settings.                                                          |
| Computation/input/output limits | Java has no JS-only finite default; native provider limits remain. Normative ceilings and units are listed once in the profile contract and enforced by their parsing/storage/profile consumers. |
| Access permission               | Caller authorization is independent of a profile. The explicit Node loader authorizes requests, DNS/IP destinations and files; custom loaders own their actual host controls.                    |
| Context resolution              | RDF4J/Hasmac has its own whitelist, one-hour cache, ten-request HTTP chain and JSON encoding/Link behavior. Ontology transport configuration does not override those native defaults.            |
| Mutation and loading            | Java preserves sequential/per-document publication and retained partial state. Normative batches and graph loads preserve their atomic failure boundary.                                         |
| Copy                            | The explicit destination owns the new ontology and its publication policy. Java creates the target before provider iteration; normative copy preflights the snapshot.                            |
| Storage                         | Java appends to reused targets and retains observed failure prefixes; normative storage replaces complete output only. Native writer copy/reset quirks are preserved.                            |
| Queries                         | Both profiles use single-use deferred EntitySearcher results and closure providers that query on each call. Returned closure sets remain defensive snapshots.                                    |
| RDF metadata                    | Java counts source statement occurrences and reports the native constant one-header state. Normative metadata counts distinct explicit headers and selected unique triples.                      |
| OWL language profiles           | Java and normative rules have separate explicit authorities. Resource exhaustion is unverified, never a verified invalidity result.                                                              |
| Browser scope                   | Supplied-document parsing is in scope; external transport parity is explicitly unqualified under the approved host boundary.                                                                     |

The [released observations](profiles/java-owlapi-5.5.1/central-observations.json) and paired tests in the decision ledger demonstrate development feedback, not final installed-package or HISEW admission.
Existing structural differences stay with their specific ledger/registry entries and must not be disguised as resource policies or broad claims of complete Java parity.

## Historical October 9 repair evidence

The following paragraphs retain the scope, measurements and limitations of the earlier profile-only repair.
They are historical evidence, not current overrides of either behavior profile or the current Java release authority.

### Approved profile deadline migration

The owner approved this change on 9 October 2026, limited to `OWL2DLProfile.checkOntology` options.
Omitting `timeoutMs`, or supplying `null`, disables only its elapsed-time deadline.
Explicit nonnegative safe integers retain their meaning; `0` remains a zero elapsed-time allowance, not an unlimited sentinel.
Other values, unknown keys and accessor options remain rejected.
Work, recursion, numeric and literal bounds, cancellation, source qualifications and unverified outcomes remain enforced.
The loader's `timeoutMs` continues to require a nonnegative safe integer.

This trades a predictable default wall-clock cutoff for completion governed by the existing work/input bounds and cancellation.
Callers needing the old profile policy can pass `{ timeoutMs: 30000 }`.
It does not provide an unbounded loader or establish Java parity for the remaining policy rows.
`profiles/profileDeadline.test.js` covers omission, null, numeric zero, the previous cutoff, invalid values, work exhaustion and cancellation; installed Node and browser consumers exercise the public null option.

### Scheduling and qualification

The scheduling repair reuses elapsed-work cooperative yielding from the existing parsers.
It uses a zero-delay timer after approximately 50 ms of work, with budget and abort checks after resumption.
The [scheduling specification](https://wicg.github.io/scheduling-apis/) describes timer-clamping overhead and boosted scheduler continuation priority.
The initial scheduler-capable prototype failed the real Chromium timer-cancellation scenario in both windows and workers: successive continuations outran the pending abort timer.
The selected timer turn admits timer-based caller cancellation in scheduler-capable and scheduler-absent runtimes alike.
Scheduling changes do not change work/depth accounting or the ontology's semantic result.

Acceptance requires same-byte measurements and report preservation, explicit exhaustion/cancellation checks, affected Java observations, and producer-owned installed-package Node/browser qualification.
The UO path named in the plan has changed: implementation admission observed SHA-256 `85214ddc93194fccf5c0fc4bbbc8f34ab54e54f4abb352f0543411fd56b1c3f6`, rather than historical `79f794425b79d59d6ff162404c818034ae8de88efd3b6fd800a48d0e7add9f9d`.
Measurements of those inputs must stay separate.
Neither checkout checks nor consumer success constitute publication of a new immutable package.

#### Implementation measurements

Five serial cold Node 24.21.0 runs on the current 2,298,206-byte UO input reduced median profile assessment from 49,920.07 ms to 935.55 ms (1.87% of baseline).
Each assessment used the same explicit `timeoutMs: 180000`, `maxWork: 10000000` and source-assessment options; full reports matched and each load contained 14,989 axioms.
Timer pauses fell from 3,505 per run to 15–17.
Five real timer-cancellation trials on 100,000 declaration axioms rejected in 50.84–61.61 ms.
CPU and memory observations and full reports are retained under the execution's external evidence directory, `operator/owlapi-profile-repair-01a11ff5`, in `before-current-*.json`, `after-approved-*.json` and `approved-comparison.json`.
These are foreground measurements with other machine activity present, and do not reproduce the historical input hash.

The retained installed candidate passed Node smoke, package-boundary, purity, no-network and import-closure qualification.
Chromium and WebKit passed bundler, import-map and DedicatedWorker consumers, including real queued cancellation and explicit null deadlines.
Local Firefox could not launch because Windows reported a missing `mozglue` side-by-side assembly, including after a supported browser reinstall; Linux PR qualification remains necessary for that engine.

Direct execution of the existing 20-case Java probe against the clean historical `d7e997a5` checkout matched the unchanged Java observations; the public JS API matched all 20 independently authored expectations.
The existing `run-profile-contract.mjs` authority guard rejects the newer global Java pin before execution; this repair does not rewrite the immutable expectation manifest or claim that runner passed.
The direct comparison, JAR hashes, class-load log and fixture identity are retained in `historical-profile-approved-comparison.json` and `java-d7-approved-*` in the same evidence directory.
