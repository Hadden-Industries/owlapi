# Post-`0.1.0` Java API Parity Precondition Implementation Plan

> **For agentic workers:** Execute this plan inline, test-first, and one task at
> a time. Do not start from a pre-release or pre-`0.1.0` implementation branch.
> Do not change package configuration, create a release, publish, or commit
> without the approval normally required by this repository.

**Goal:** Establish the Java-parity guard and the exact public document-target
and storage-error foundations required by the import-closure lifecycle without
introducing the proposed JavaScript-only `StringDocumentTarget.getText()` member
or `UnrepresentableOntologyError` type, and make the corresponding WebVOWL
consumer migration an explicit, verified prerequisite.

**Architecture:** A closed compatibility decision ledger records every public
post-`0.1.0` deviation from pinned Java OWLAPI 5.5.1. `StringDocumentTarget`
retains text in private state, exposes Java's `toString()` member, and accepts
complete replacement only through a package-private storage seam. Java storage
exceptions map into the repository's established JavaScript error hierarchy;
lossless-serialization failure is a stable reason on
`OWLOntologyStorageError`, not a new public subclass. The existing WebVOWL
candidate harness audits application-owned consumer code and executes the
correct target/error surface from an installed candidate while preserving the
unrelated `StringDocumentSource.getText()` contract.

**Tech stack:** Native ESM JavaScript; Node.js 22/24; Jest; AJV Draft 2020-12;
the generated Public API Surface Registry; installed-package boundary tests;
pinned Java OWLAPI 5.5.1 source at revision
`d7e997a53b470e32700de89cc610d9daf01ea769`.

**Status:** Design-complete prerequisite. Execute only after the exact accepted
public `owlapi@0.1.0` release exists. Complete this plan as Phase 21 before
starting any Phase 21-dependent task or claiming completion in
[`docs/ontology-lifecycle-capability-implementation-plan.md`](../ontology-lifecycle-capability-implementation-plan.md),
which becomes Phase 22. Phase 21-independent lifecycle work may be pre-built
under the isolation and reconciliation rules in §8. This checkpoint does not
publish an intermediate npm release; its public additions first ship as part
of the separately qualified `owlapi@0.2.0` release.

**Revised:** 2026-09-01.

---

## 1. Authority, provenance, and activation boundary

The exact Java authority is OWLAPI 5.5.1 at revision
`d7e997a53b470e32700de89cc610d9daf01ea769`. The authoritative source members
for this plan are:

| Concern                | Pinned Java authority                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-memory text target  | `api/src/main/java/org/semanticweb/owlapi/io/StringDocumentTarget.java`: implicit no-argument `StringDocumentTarget()`, `String toString()`, and `Optional<Writer> getWriter()` |
| Base storage failure   | `api/src/main/java/org/semanticweb/owlapi/model/OWLOntologyStorageException.java`: `OWLOntologyStorageException(String)`, `(String, Throwable)`, and `(Throwable)`              |
| Missing storer failure | `api/src/main/java/org/semanticweb/owlapi/model/OWLStorerNotFoundException.java`: `OWLStorerNotFoundException(OWLDocumentFormat)` and `extends OWLOntologyStorageException`     |

The generated `docs/compatibility/java-api-surface.json` is the authoritative
JavaScript surface record. Its Markdown sibling and `API.md` are generated
views. `docs/compatibility/standalone-import-closure-prerequisites.md` is the
local consumer-capability summary. The Universal Ontology contracts remain the
authority for consumer behaviour; this plan owns only the package parity
precondition.

Non-normative design provenance: the original cross-repository lifecycle design
originated in Codex task
`codex://threads/01a02818-89e7-7252-b30e-7368fd9a36b7`, titled
`UO's merge_owl_imports.py`. The two parity defects addressed here were found
during the subsequent 2026-08-29 review of the lifecycle plan. Neither task
history replaces the pinned Java source, generated registry, or normative
consumer contracts.

At execution time, all of these conditions are mandatory:

1. The accepted production tag is exactly `v0.1.0`, resolves to one verified
   commit, and its published npm tarball has already passed the repository's
   release and immutable-registry gates.
2. The implementation HEAD contains both the accepted `v0.1.0` commit and the
   approved commit containing this plan. If the planning branch predates the
   release, transplant or integrate the plan-only commit onto a branch based on
   the accepted release; do not implement against stale pre-release ancestry.
3. Record the exact `v0.1.0` commit, package integrity, and
   `docs/compatibility/java-api-surface.json` byte SHA-256 before editing source.
4. Compare the accepted `v0.1.0` registry with the design-time
   `v0.1.0-alpha.0` registry. If the target or storage-error baseline differs
   from the assumptions below, stop and amend both plans rather than forcing
   this delta onto a changed surface.
5. Use a dedicated implementation branch, recommended as
   `feature/java-api-parity-precondition`. The eventual Phase 22 implementation
   branch must contain the accepted Phase 21 completion commit in its ancestry.
6. Resolve the exact WebVOWL production-cutover commit from the accepted
   `owlapi@0.1.0` release evidence, verify that commit is reachable from the
   intended WebVOWL branch, and audit that immutable tree rather than assuming
   the design-time WebVOWL checkout is still the consumer baseline. The
   2026-08-29 design inspection found clean WebVOWL `main` at
   `f7444ce3971621e6af6d38ebd4b5ce9b03f3e235`, with no use of either rejected
   extension; that observation is provenance, not authority for execution.

## 2. Overarching parity invariant

Java OWLAPI parity is the default for every public Java-shaped binding. A
matching Java name establishes a responsibility whose Java members, overloads,
inheritance, errors, and observable semantics must be checked before designing
the JavaScript surface. Convenience is not permission to invent an alias, a
subclass, or a second way to perform the same operation.

Use this decision order for every post-`0.1.0` public change:

1. Implement the exact Java name and responsibility when JavaScript can express
   it coherently.
2. If host-language mechanics prevent literal signature parity, preserve the
   Java name and responsibility and make the smallest JavaScript adaptation.
3. If a Java member depends on a Java-only protocol that would weaken a package
   invariant, omit it explicitly and test its absence; do not replace it with a
   convenience alias.
4. Add a JavaScript-only public binding only when no Java analogue can satisfy a
   required capability. That exceptional decision needs a separate plan
   amendment, an exact compatibility-ledger entry, focused tests, and explicit
   owner approval. Neither this plan nor the lifecycle plan grants such an
   exception.

Classification is evidence, not permission. Merely labelling a binding
`JS_ADAPTATION` or `JS_EXTENSION` does not justify it. A deviation must be the
minimum necessary difference, recorded against an exact Java authority, and
covered by a test that would fail if the public surface drifted further.

### 2.1 Approved adaptations in this precondition

This plan approves only the following bounded differences:

| Decision ID                     | Java surface                                                          | JavaScript disposition                                                                                                           | Why it is bounded                                                                                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PARITY-TARGET-WRITER-OMISSION` | `StringDocumentTarget.getWriter()` returns `Optional<java.io.Writer>` | Omit `getWriter()` and every public `write`, `append`, or writer accessor; retain exact `toString()`                             | JavaScript has no `java.io.Writer` contract, and exposing mutable target writes would defeat the all-or-nothing save boundary. No replacement public member is added.                                               |
| `PARITY-TARGET-ATOMIC-COMMIT`   | Java storers write incrementally to the target writer                 | A package-private helper replaces complete text after successful rendering                                                       | This strengthens failure atomicity without changing the public target member used to read text.                                                                                                                     |
| `PARITY-ERROR-SUFFIX`           | `OWLOntologyStorageException` and `OWLStorerNotFoundException`        | `OWLOntologyStorageError` and `OWLStorerNotFoundError`                                                                           | Native JavaScript throwable classes conventionally extend `Error`; the repository already uses this suffix adaptation for Java exception concepts.                                                                  |
| `PARITY-ERROR-HIERARCHY`        | `OWLOntologyStorageException extends OWLException`                    | `OWLOntologyStorageError extends OWLAPIError`; `OWLStorerNotFoundError` retains the corresponding storage-error subtype relation | The accepted JavaScript package has one established public OWL error root and no separate checked-exception hierarchy; adding a nominal `OWLException` solely for this type would create a second, unused taxonomy. |
| `PARITY-ERROR-NAMESPACE`        | The Java exceptions are in `org.semanticweb.owlapi.model`             | Keep their sole canonical JavaScript exports in the established `owlapi/io` error namespace and the bare aggregate               | This preserves the existing package error architecture and avoids a second binding identity or a new model-to-I/O dependency cycle. The registry must retain the exact Java authorities.                            |
| `PARITY-STORAGE-REASON`         | Java exposes only the storage-exception family for this failure       | Use `OWLOntologyStorageError` with code `ONTOLOGY_STORAGE_FAILED` and own safe field `reason: "ONTOLOGY_NOT_REPRESENTABLE"`      | The required lossless-or-fail diagnostic remains machine-testable without inventing a public subtype. It follows the package's existing stable-code/detail convention.                                              |

These adaptations do not authorize `StringDocumentTarget.getText()`, a public
writer-like API, `UnrepresentableOntologyError`, another representability
subclass, a duplicate `owlapi/model` error export, or a generic extension escape
hatch.

### 2.2 Scope boundary

This plan is deliberately narrow. It does not:

- implement `OWLOntologyManager.saveOntology` or any storer;
- introduce Functional Syntax or RDF/XML rendering;
- change ontology manager state, imports closure, change application, or merger
  behaviour;
- retroactively redesign public `0.1.0` bindings that are unrelated to the two
  identified defects;
- publish a package, assign a dist-tag, change Universal Ontology, or invent a
  WebVOWL save/export feature solely to exercise this surface; or
- pre-approve any Phase 22 adaptation not listed in that plan's pinned authority
  ledger.

If the baseline audit finds another parity defect, record it separately and
request scope approval. Do not conceal unrelated cleanup in this prerequisite.
WebVOWL production, test, or maintained-documentation files may change only when
the execution-time audit identifies an actual obsolete target/error use. A
zero-use result is retained as evidence and must not be converted into a dummy
application dependency.

## 3. Fixed public and private contract

After Phase 21, these imports are valid from both the canonical subpath and the
existing bare aggregate:

```js
import {
  OWLOntologyStorageError,
  OWLStorerNotFoundError,
  StringDocumentTarget,
} from "owlapi/io";

const target = new StringDocumentTarget();
target.toString(); // ""
```

The exact public contract is:

| Binding                   | Supported public shape                                                                                                                                    | Explicitly absent                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `StringDocumentTarget`    | `new StringDocumentTarget()` and `prototype.toString()`                                                                                                   | `getText`, `getWriter`, `write`, `append`, constructor text, and mutable public fields    |
| `OWLOntologyStorageError` | `new OWLOntologyStorageError(message?, details?)`; extends `OWLAPIError`; stable code `ONTOLOGY_STORAGE_FAILED`; preserves safe `cause` and detail fields | Java serialization constructors and any representability-specific subclass                |
| `OWLStorerNotFoundError`  | `new OWLStorerNotFoundError(format)`; extends `OWLOntologyStorageError`; stable code `STORER_NOT_FOUND`                                                   | A `getFormat()` member, alternative constructor family, or an independent error hierarchy |

Phase 22 uses this representability contract:

```js
try {
  await manager.saveOntology(ontology, format, target);
} catch (error) {
  if (
    error instanceof OWLOntologyStorageError &&
    error.reason === "ONTOLOGY_NOT_REPRESENTABLE"
  ) {
    // The selected syntax could not preserve the ontology structurally.
  }
}
```

`reason` is an own safe diagnostic field copied through the existing error
detail mechanism. It never changes the canonical `name`, `code`, prototype, or
base-class identity. Structural mismatch category and path may accompany it as
safe detail fields, but no renderer may use those details to expose private
state or unbounded input content.

`StringDocumentTarget` stores text in module-private state. Its source module may
export a package-private replacement helper for use by `internal/storage/`, but
`io/index.js`, the bare aggregate, `package.json` exports, and generated public
surface documents must not expose that helper. The helper accepts only a genuine
target and a complete string, replaces rather than appends, and performs no
partial mutation before validation succeeds.

### 3.1 Downstream consumer migration contract

WebVOWL is the only current first-party downstream consumer. Its accepted
production-cutover tree must use these replacements whenever it reads a
`StringDocumentTarget` or classifies a representability failure:

```js
// Rejected target-side extension
const text = target.getText();

// Required Java-shaped member
const text = target.toString();
```

```js
// Rejected dedicated subtype
error instanceof UnrepresentableOntologyError;

// Required base storage error plus stable reason
error instanceof OWLOntologyStorageError &&
  error.reason === "ONTOLOGY_NOT_REPRESENTABLE";
```

This rule is receiver-specific. `StringDocumentSource.getText()` is an accepted
`0.1.0` source-reading member and remains valid. No search-and-replace operation
may change a source reader merely because its member name is also `getText`.

The Phase 21 WebVOWL audit covers tracked application-owned source, tests,
scripts, configuration, HTML, and maintained documentation. It excludes the
removed package staging tree, historical `docs/owlapi-js/` copies, generated
bundles, dependency directories, coverage, and retained provenance evidence.
Every remaining `getText()` expression in the audited application tree must have
an explicit allowlist record proving that its receiver is a
`StringDocumentSource`; every target receiver must use `toString()`. The exact
identifier `UnrepresentableOntologyError` is forbidden outside negative
migration documentation and tests, and no alias, wrapper, or compatibility shim
may preserve it.

If the immutable execution baseline contains an obsolete use, prepare its
migration on a dedicated WebVOWL branch based on that exact commit, recommended
as `feature/owlapi-0.2-java-parity-migration`. The reviewed patch and installed
candidate tests are Phase 21 evidence; any WebVOWL commit, dependency or
lockfile change still requires separate authorization. If the audit finds no
obsolete use, record `NO_OBSOLETE_USAGE`, retain the complete allowlist and scan
digest, and do not create a no-op consumer commit.

Phase 21 can prove the installed target and error identities, but it does not
yet implement `saveOntology` or an RDF/XML representability failure. The Phase
22 plan therefore owns the first end-to-end WebVOWL save/failure exercise and
must consume this audit rather than weakening or repeating it.

## 4. Machine-readable parity decision record

Phase 21 creates:

- `docs/compatibility/java-api-parity-decisions.schema.json`; and
- `docs/compatibility/java-api-parity-decisions.json`.

The record is a closed Draft 2020-12 document. It contains:

- the exact accepted `v0.1.0` tag, commit, package integrity, and baseline Java
  API registry SHA-256;
- the pinned Java version, revision, and source paths;
- one row for each approved decision ID in §2.1;
- for each row, the Java authority, affected JavaScript binding/member,
  difference category, rationale, absence or replacement rule, approval source,
  and focused verification paths;
- an exact allowlist of Phase 21 new bindings and changed namespaces;
- explicit forbidden member `io.StringDocumentTarget.prototype.getText` and
  forbidden binding `io.UnrepresentableOntologyError`; the accepted
  `StringDocumentSource.prototype.getText` contract is unrelated and remains
  unchanged;
- one `consumerMigrations.webvowl` record containing the exact repository and
  accepted production-cutover commit, audited path classes and exclusions,
  complete allowed source-reader inventory, obsolete-use count, scan digest,
  disposition `NO_OBSOLETE_USAGE` or `MIGRATED`, changed paths when applicable,
  installed-candidate result/digest, and an authorized migration commit OID only
  when such a commit exists;
- a `phase21` checkpoint containing the current generated registry SHA-256 and
  `status: "COMPLETE"` only after all Phase 21 package and consumer gates pass.

The ledger governs post-baseline deltas; it does not silently grandfather a new
change merely because an older public binding was already adapted. Phase 22 must
extend this same record for each of its approved deviations and must fail if its
generated surface contains an unrecorded difference.

## 5. File responsibility map

| Concern                         | Files created                                                                                                   | Files modified or regenerated                                                                                                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Activation and capability state | `docs/compatibility/java-api-parity-decisions.schema.json`, `docs/compatibility/java-api-parity-decisions.json` | `docs/compatibility/capabilities.json`, `governance.test.js`                                                                                                                                                 |
| String target                   | `io/stringDocumentTarget.js`, `io/stringDocumentTarget.test.js`                                                 | `io/index.js`, `index.js`, `test/package-boundary.test.mjs`                                                                                                                                                  |
| Storage errors                  | None                                                                                                            | `io/errors.js`, `io/io.test.js`, `io/index.js`, `index.js`, `test/package-boundary.test.mjs`                                                                                                                 |
| Public Java surface             | None                                                                                                            | `util/generate-java-api-surface.mjs`, `docs/compatibility/java-api-surface.schema.json`, `docs/compatibility/java-api-surface.json`, `docs/compatibility/java-api-surface.md`, `API.md`                      |
| Import-closure handoff          | None                                                                                                            | `docs/compatibility/standalone-import-closure-prerequisites.md`                                                                                                                                              |
| Downstream migration            | `docs/migration/0.2.0-java-api-parity.md`                                                                       | `test/consumers/webvowl/cutover.mjs`, `test/consumers/webvowl/cutover.test.js`, `scripts/qualify-webvowl-consumer.mjs`, parity-decision schema/record, and only audit-identified WebVOWL paths when required |

No `package.json` export is required because `owlapi/io` and the bare aggregate
already exist. A package-script, workflow, dependency, version, lockfile, or
release change is outside this plan unless separately approved.

## 6. Task-by-task implementation plan

### Task 1: Activate Phase 21 from the accepted `v0.1.0` baseline

**Files**

- Create: `docs/compatibility/java-api-parity-decisions.schema.json`
- Create: `docs/compatibility/java-api-parity-decisions.json`
- Modify: `docs/compatibility/capabilities.json`
- Modify: `governance.test.js`

**Steps**

1. Perform every activation check in §1 and retain the exact command outputs in
   the normal checkpoint evidence. Confirm the implementation branch contains
   the accepted release and this plan before editing source.
2. Add failing schema/governance tests for a closed decision record, exact Java
   revision, exact baseline identifiers, unique decision IDs, valid repository
   evidence paths, and an allowlist containing only the Phase 21 surface.
3. Add these capability rows with `status: "REQUIRED_V1"`,
   `progress: "IN_PROGRESS"`, and `phase: 21`:

   - `compatibility.java-parity-precondition`;
   - `io.string-document-target`; and
   - `io.storage-error-contract`.

4. Populate the decision record from the accepted release facts and the six
   decisions in §2.1. Keep `phase21.status` as `IN_PROGRESS`. Do not copy the
   entire baseline registry; record its immutable tag, commit, and byte digest.
5. Add a regression assertion that a Phase 21 decision cannot use
   `PUBLIC_JS_EXTENSION` as its category. Future plans may add that vocabulary
   only through an explicit schema and governance amendment.
6. Run:

   ```powershell
   npm test -- --runInBand governance.test.js
   npm run lint:files -- governance.test.js
   ```

7. Request a checkpoint containing the active branch, HEAD, `v0.1.0` commit,
   baseline registry digest, and decision-record digest. Stop if any identifier
   was inferred from a similarly named branch rather than the accepted tag.

### Task 2: Make the Phase 21 surface fail closed before implementation

**Files**

- Create: `io/stringDocumentTarget.test.js`
- Modify: `io/io.test.js`
- Modify: `test/package-boundary.test.mjs`
- Modify: `governance.test.js`

**Steps**

1. Add RED tests requiring `StringDocumentTarget` from `owlapi/io` and the bare
   aggregate, with initial empty `toString()` output and exact binding identity
   between both imports.
2. Assert the target prototype exposes only `constructor` and `toString`.
   Explicitly test that `getText`, `getWriter`, `write`, and `append` are absent
   and that assigning arbitrary public fields cannot replace private text.
3. Add RED hierarchy and identity tests for `OWLOntologyStorageError` and
   `OWLStorerNotFoundError`, including canonical names/codes that hostile detail
   input cannot override, safe causes, protected fields, and the
   storer-not-found superclass relation.
4. Add negative package tests proving `UnrepresentableOntologyError` is absent
   from `owlapi/io`, the bare aggregate, generated registry bindings, and
   installed-package documentation.
5. Add governance assertions tying every new binding and omission to the exact
   decision-ledger row. Require the generated registry delta to contain no
   `JS_EXTENSION` relationship added by Phase 21.
6. Run the focused tests and observe failures caused by missing production
   bindings, not by syntax, fixture, or package-install errors:

   ```powershell
   npm test -- --runInBand io/stringDocumentTarget.test.js io/io.test.js governance.test.js
   npm run test:boundary
   ```

### Task 3: Implement the Java-shaped `StringDocumentTarget`

**Files**

- Create: `io/stringDocumentTarget.js`
- Modify: `io/stringDocumentTarget.test.js`
- Modify: `io/index.js`
- Modify: `index.js`

**Steps**

1. Store each target's text in a module-private `WeakMap`; construct only empty
   targets and reject invocation without `new` through normal class semantics.
2. Implement only `toString()` on the public prototype. It returns the complete
   current text and preserves Unicode code points without normalization.
3. Export a narrowly named replacement helper from the source module for private
   storage use. Validate target identity and complete string input before one
   replacement assignment. Do not export the helper from any public index.
4. Test empty, ASCII, astral Unicode, line-ending, replacement-not-append, invalid
   target, and invalid text cases. Force a validation failure after a target is
   populated and prove its prior text remains byte-for-byte unchanged.
5. Re-run the RED tests from Task 2 and confirm the target tests are green while
   the not-yet-implemented storage errors remain the only intended failures.
6. Run:

   ```powershell
   npm test -- --runInBand io/stringDocumentTarget.test.js
   npm run lint:files -- io/stringDocumentTarget.js io/stringDocumentTarget.test.js io/index.js index.js
   ```

### Task 4: Implement the Java-grounded storage-error hierarchy

**Files**

- Modify: `io/errors.js`
- Modify: `io/io.test.js`
- Modify: `io/index.js`
- Modify: `index.js`

**Steps**

1. Add `OWLOntologyStorageError extends OWLAPIError` with stable code
   `ONTOLOGY_STORAGE_FAILED`, the repository's ordinary optional message/details
   convention, protected canonical identity, and standard `cause` support.
2. Add `OWLStorerNotFoundError extends OWLOntologyStorageError`. Accept the
   requested `OWLDocumentFormat` as the Java-grounded constructor input, produce
   stable code `STORER_NOT_FOUND`, and do not add a `getFormat()` member that
   Java's class does not expose.
3. Test a base storage error carrying
   `reason: "ONTOLOGY_NOT_REPRESENTABLE"`, mismatch category, and structural path.
   Require the reason to remain a safe own detail while `name`, `code`, message,
   cause, and prototype retain canonical values.
4. Export the two errors through `owlapi/io` and the bare aggregate with one
   binding identity. Do not add `UnrepresentableOntologyError`, another
   representability subclass, or a duplicate `owlapi/model` export.
5. Run:

   ```powershell
   npm test -- --runInBand io/io.test.js io/stringDocumentTarget.test.js
   npm run lint:files -- io/errors.js io/io.test.js io/index.js index.js
   ```

### Task 5: Record the exact public surface and installed boundary

**Files**

- Modify: `util/generate-java-api-surface.mjs`
- Modify: `docs/compatibility/java-api-surface.schema.json`
- Regenerate: `docs/compatibility/java-api-surface.json`
- Regenerate: `docs/compatibility/java-api-surface.md`
- Regenerate: `API.md`
- Modify: `test/package-boundary.test.mjs`
- Modify: `docs/compatibility/standalone-import-closure-prerequisites.md`
- Modify: `governance.test.js`

**Steps**

1. Add explicit generator metadata for all three bindings; do not rely on the
   current export-name prefix heuristic to infer their relationship.
2. Record `StringDocumentTarget` as `JS_ADAPTATION` / `ADAPTED` of the exact Java
   type. Its supported member is only `prototype.toString`; its omitted member is
   Java `getWriter()`, with the decision ID and atomicity qualification from §2.1.
3. Record each storage error as `JS_ADAPTATION` / `ADAPTED` of its exact Java
   exception class, including the superclass relation, suffix and namespace
   decisions, supported constructor shape, omitted Java constructors, and safe
   diagnostic convention.
4. Generalize release metadata only as required by the accepted post-`0.1.0`
   schema so the new bindings declare `firstPublicRelease: "0.2.0"`. Preserve
   every accepted `0.1.0` binding's release identity and contract.
5. Regenerate the authoritative JSON and both views. Compare them with the
   accepted `v0.1.0` registry and require exactly three new public bindings, no
   new namespace, no unrelated existing-binding mutation, and zero Phase 21
   `JS_EXTENSION` bindings.
6. Update the standalone import-closure prerequisite note to require
   `StringDocumentTarget.toString()` and the base storage-error representability
   reason. Remove any implication that a convenience text getter or dedicated
   representability class is required.
7. Pack and install the candidate in the existing boundary fixture. Prove the
   canonical and bare imports work, deep source/helper imports fail, the target
   has no forbidden members, and the forbidden error class is absent.
8. Run:

   ```powershell
   node util/generate-java-api-surface.mjs
   npm test -- --runInBand governance.test.js io/io.test.js io/stringDocumentTarget.test.js
   npm run test:boundary
   npm run lint:files -- util/generate-java-api-surface.mjs governance.test.js io test/package-boundary.test.mjs
   npm run format:check
   ```

### Task 6: Migrate and prove the WebVOWL consumer contract

**Files**

- Create: `docs/migration/0.2.0-java-api-parity.md`
- Modify: `test/consumers/webvowl/cutover.mjs`
- Modify: `test/consumers/webvowl/cutover.test.js`
- Modify: `scripts/qualify-webvowl-consumer.mjs`
- Modify: `docs/compatibility/java-api-parity-decisions.schema.json`
- Modify: `docs/compatibility/java-api-parity-decisions.json`
- Inspect without modification: the exact accepted WebVOWL consumer tree under
  `../webvowl`, including `package.json`, `package-lock.json`, application-owned
  `src/`, tests, scripts, configuration, HTML, and maintained documentation
- Conditionally modify, with separate authorization: only WebVOWL paths reported
  by the accepted-baseline audit as actual obsolete target/error consumers

**Steps**

1. Add RED tests for a new exported
   `auditWebVowlJavaParityConsumers(files, options)` helper. Require it to reject
   a fixture that imports or references `UnrepresentableOntologyError`, reject a
   `StringDocumentTarget` receiver calling `getText()`, accept the same receiver
   calling `toString()`, and accept `StringDocumentSource.getText()` only when
   that expression has a complete allowlist record. Also require it to reject
   unreviewed additions to the allowlist and audited paths hidden by exclusions.
2. Add RED assertions for the generated installed-candidate architecture test.
   It must import `StringDocumentTarget`, `StringDocumentSource`,
   `OWLOntologyStorageError`, and `OWLStorerNotFoundError` from `owlapi/io` and
   prove all of the following inside the disposable WebVOWL checkout:

   - a new target returns `""` through `toString()` and has no `getText` member;
   - a source still returns its supplied text through `getText()`;
   - `OWLStorerNotFoundError` is an `OWLOntologyStorageError`;
   - a base storage error retains
     `reason === "ONTOLOGY_NOT_REPRESENTABLE"`; and
   - the installed `owlapi/io` namespace has no
     `UnrepresentableOntologyError` binding.

3. Run the focused tests and confirm they fail because the audit and generated
   candidate assertions are absent:

   ```powershell
   npm test -- --runInBand test/consumers/webvowl/cutover.test.js
   ```

4. Implement the audit in `cutover.mjs` over the same tracked-file inventory the
   candidate qualifier already owns. Return a stable record containing the
   baseline commit, audited/excluded path classes, every allowed source-reader
   occurrence, every obsolete occurrence, changed paths, disposition, and a
   digest over the normalized inventory. Keep the source-reader allowlist
   fail-closed: a moved, removed, duplicated, or newly added `getText()` use
   requires review rather than silently inheriting a path-wide exception.
5. Make the qualifier consume the accepted post-`0.1.0` WebVOWL cutover tree,
   not replay Phase 19's original embedded-source migration. Require canonical
   `owlapi` package specifiers, the accepted exact production dependency, and
   absence of the former maintained `src/owlapi-js/` tree before candidate
   injection. In the disposable checkout only, replace that registry coordinate
   with the retained Phase 21 tarball and regenerate the temporary lock; leave
   the source WebVOWL manifest and lockfile unchanged. Extend
   `createCandidateArchitectureTest` and the qualifier's retained output with
   the exact assertions from Step 2. Do not introduce a workspace, resolver
   alias, copied owlapi tree, deep import, or production WebVOWL local-file
   dependency.
6. Resolve the accepted WebVOWL production-cutover commit from release evidence,
   verify a clean immutable checkout, and run the audit. If it reports obsolete
   occurrences, replace target reads with `toString()` and dedicated-subtype
   catches with the base-error/reason predicate on the dedicated branch, add a
   focused regression for every changed call site, retain the reviewed patch and
   test evidence, and only then record disposition `MIGRATED`. If it reports zero
   obsolete occurrences, record `NO_OBSOLETE_USAGE`, retain the zero-use record,
   and make no WebVOWL working-tree change. An unresolved occurrence or any other
   disposition blocks Phase 21. Bind the candidate gate to the exact accepted
   baseline plus reviewed patch digest, or to the separately authorized commit
   containing the byte-identical patch; it must never qualify an unrelated dirty
   WebVOWL checkout.
7. Write `docs/migration/0.2.0-java-api-parity.md` with both before/after examples,
   canonical imports, the valid `StringDocumentSource.getText()` exception, the
   no-shim rule, and the fact that these names were rejected before their first
   production exposure rather than removed from accepted `0.1.0`.
8. Validate and populate `consumerMigrations.webvowl` from the retained audit
   and candidate outputs. Do not hand-author a passing result, omit an obsolete
   match, or record a migration commit that has not been separately authorized
   and verified.
9. Pack and exercise the complete Phase 21 candidate through the installed
   WebVOWL boundary:

   ```powershell
   npm test -- --runInBand test/consumers/webvowl/cutover.test.js
   npm run lint:files -- test/consumers/webvowl/cutover.mjs test/consumers/webvowl/cutover.test.js scripts/qualify-webvowl-consumer.mjs
   npm run release:pack -- --output .release/phase21-parity-candidate
   npm run test:webvowl-consumer -- --candidate-dir .release/phase21-parity-candidate --webvowl-repository ../webvowl --output .release/phase21-parity-webvowl
   npm run format:check
   ```

10. Request a checkpoint containing the owlapi candidate digest, accepted
    WebVOWL commit, audit digest/disposition, allowed source-reader inventory,
    changed paths, installed-candidate result, and any separately authorized
    WebVOWL migration commit. A zero-use result is evidence, not permission to
    skip the installed-candidate test.

### Task 7: Complete the Phase 21 checkpoint and hand off to Phase 22

**Files**

- Modify: `docs/compatibility/java-api-parity-decisions.json`
- Modify: `docs/compatibility/capabilities.json`
- Verify only: every file listed in §5

**Steps**

1. Run the complete source test suite, lint, formatting, generated-surface,
   package-boundary, browser, WebVOWL consumer, and package-lint gates applicable
   to the accepted post-`0.1.0` repository. Do not suppress a pre-existing
   failure without its ordinary disposition process.
2. Recompute the current registry SHA-256, set `phase21.status` to `COMPLETE`,
   retain that checkpoint's exact registry digest, and change the three Phase 21
   capability rows to `progress: "COMPLETE"`. Keep the package version and global
   release coordinate unchanged; this is not an npm release.
3. Re-run governance and generated-document tests after the status transition.
   Require every evidence path in the decision record to exist and every
   decision to have at least one focused and one installed-boundary assertion.
   Require `consumerMigrations.webvowl` to validate, name the accepted consumer
   commit, contain a complete source-reader allowlist, and carry a passing
   installed-candidate result.
4. Inspect the complete `v0.1.0`-to-checkpoint registry diff. Require exactly the
   authorized Phase 21 surface, with no `StringDocumentTarget.prototype.getText`,
   no `UnrepresentableOntologyError`, and no unrecorded adaptation or extension.
5. Re-run the WebVOWL audit against the same immutable baseline used by the
   candidate gate and compare its digest with the retained decision-record
   value. Fail on a new obsolete use, an unreviewed source-reader occurrence, a
   changed baseline, or a missing authorized migration commit.
6. Request authorization for the exact Phase 21 commit. After an approved signed
   commit exists, record its OID in the execution handoff; do not try to write a
   self-referential commit OID into a file contained by that commit.
7. Do not tag or publish. Phase 22 may begin only from a branch on which both the
   accepted `v0.1.0` commit and this Phase 21 completion commit are ancestors.

Recommended final verification commands, adjusted only for commands that the
accepted post-`0.1.0` repository actually provides:

```powershell
npm test -- --runInBand
npm run lint
npm run format:check
node util/generate-java-api-surface.mjs
npm run test:boundary
npm run release:lint-package
npm run release:pack -- --output .release/phase21-final-candidate
npm run test:webvowl-consumer -- --candidate-dir .release/phase21-final-candidate --webvowl-repository ../webvowl --output .release/phase21-final-webvowl
npm pack --dry-run --json
```

## 7. Definition of done

Phase 21 is complete only when all of the following are true:

- execution was based on the accepted `v0.1.0` release and the exact baseline
  identifiers are recorded;
- the three Phase 21 capability rows are complete;
- the closed parity decision ledger validates and contains exactly the approved
  §2.1 decisions;
- `StringDocumentTarget` is public through `owlapi/io` and the bare aggregate,
  and its only public instance method is Java's `toString()`;
- Java `getWriter()` is explicitly omitted without a replacement convenience
  member, while package-private complete-text replacement is atomic;
- `OWLOntologyStorageError` and `OWLStorerNotFoundError` have the documented Java
  authorities, hierarchy, stable codes, and single binding identities;
- representability is expressed by
  `OWLOntologyStorageError.reason === "ONTOLOGY_NOT_REPRESENTABLE"`;
- neither `StringDocumentTarget.prototype.getText` nor
  `UnrepresentableOntologyError` appears as a supported source export, generated
  public binding/member, installed-package import, or advertised API; negative
  parity-policy references remain permitted, and the accepted
  `StringDocumentSource.prototype.getText` surface is unchanged;
- `docs/migration/0.2.0-java-api-parity.md` gives downstream consumers the exact
  target-reader and representability substitutions without presenting either
  rejected name as a supported or deprecated API;
- the immutable accepted WebVOWL consumer tree has a validated, digest-bound
  `NO_OBSOLETE_USAGE` or `MIGRATED` result, every allowed `getText()` expression
  is proven to read a `StringDocumentSource`, and every audit-identified
  WebVOWL change has focused installed-candidate evidence;
- the WebVOWL installed-candidate boundary positively exercises `toString()`,
  the retained source getter, the storage-error hierarchy/reason, and absence of
  both rejected extensions;
- the Phase 21 public delta contains no `JS_EXTENSION` relationship;
- all focused, governance, generated-document, installed-package, and applicable
  browser/package gates pass; and
- the approved signed Phase 21 commit is an ancestor of the branch from which
  Phase 22 begins.

## 8. Phase 22 handoff

The import-closure lifecycle plan consumes, rather than recreates, the Phase 21
target and storage-error boundary. Phase 21-independent lifecycle work may be
pre-built on its dedicated feature branch before this prerequisite is complete,
provided that work remains outside every `0.1.0` candidate and release claim.
Pre-integration work must keep lifecycle capability rows deferred, label its
evidence provisional, and must not create, copy, simulate, or partially
backfill this plan's target, errors, decision record, WebVOWL evidence, or
installed-candidate result.

Before any Phase 21-dependent lifecycle task or Phase 22 completion claim, the
integration branch must contain the accepted `v0.1.0` and approved Phase 21
completion commits in its ancestry. The lifecycle plan must then validate the
decision record, capability rows, generated registry, forbidden-export
assertions, WebVOWL audit/candidate evidence, and Git ancestry, reconcile every
pre-built commit against that accepted baseline, and rerun affected tests and
generated-surface checks. Its storage task may add
`OWLOntologyManager.saveOntology` and internal storers, but it must preserve
`StringDocumentTarget.toString()`, the package-private atomic replacement seam,
the two-class storage error hierarchy, and the base-error representability
reason. Its installed WebVOWL gate must add the first real save and
non-representability exercise; surface-only Phase 21 evidence is not a substitute
for that semantic consumer test.

Any Phase 22 worker who reaches a Phase 21-dependent task while the accepted
surface is missing or not in branch ancestry must stop that task. If the
accepted surface differs materially from the lifecycle contract, stop for a
reviewed plan and parity-ledger amendment. Re-running or partially duplicating
Phase 21 inside the lifecycle task, or retaining the pre-integration shape with
a shim, is not an acceptable substitute for satisfying and reconciling this
dependency.
