# `owlapi` Import-Closure Lifecycle Implementation Plan

> **For agentic workers:** Execute this plan one task at a time. Keep each red/green/refactor cycle reviewable, run the listed focused verification before continuing, and pause at every approval gate. Do not publish, change repository configuration, or create commits without the repository owner's explicit authorization.

**Goal:** Release the public, additive `owlapi@0.2.0` functionality that Universal Ontology needs to construct a self-contained import closure from source ontologies using only Java-OWLAPI-shaped public APIs.

**Architecture:** The ontology manager owns a transactional registry of loaded ontology identities and resolved import edges. Public model objects remain externally immutable; manager methods operate through package-private state and package-private serialization engines. The public merger is deliberately policy-neutral: Universal Ontology supplies the root identity and explicitly copies root annotations, while `owlapi` provides closure traversal, change application, structural set union, and manager-selected storers.

**Tech stack:** Native ESM JavaScript; Node.js 22/24; Jest; RDF/JS; `n3`; `rdfxml-streaming-parser`; pinned Java OWLAPI reference utilities; npm installed-package and browser boundary tests.

**Normative specification:** `../universal-ontology/docs/specs/2026-08-22-self-contained-owl-import-closure-contract.md`, its machine-readable companion `../universal-ontology/docs/import-closure/contract.v1.json`, and the consumer execution plan `../universal-ontology/docs/plans/2026-08-22-self-contained-owl-import-closure.md`.

**Status:** Design-complete implementation plan. Execution is deferred until the accepted production `0.1.x` baseline exists. The consumer contract requires exactly `owlapi@0.2.0`; if that coordinate is unavailable or its required surface differs, stop for a cross-repository contract amendment instead of silently selecting another version.

**Revised:** 2026-08-28.

---

## 1. Authority, copies, and starting state

The Universal Ontology specification, JSON contract, and execution plan are the authority for consumer behaviour. This repository owns the implementation design and API compatibility records. The files under `../webvowl/docs/owlapi-js/` are staging or historical copies, not a second authority:

| Subject                                 | Canonical source                                                                            | Copy finding                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Consumer behaviour and exact dependency | `../universal-ontology/docs/specs/2026-08-22-self-contained-owl-import-closure-contract.md` | No normative duplicate in this repository                                                               |
| Consumer build and acceptance sequence  | `../universal-ontology/docs/plans/2026-08-22-self-contained-owl-import-closure.md`          | No normative duplicate in this repository                                                               |
| Machine-readable consumer contract      | `../universal-ontology/docs/import-closure/contract.v1.json`                                | No normative duplicate in this repository                                                               |
| Package prerequisite summary            | `docs/compatibility/standalone-import-closure-prerequisites.md`                             | Byte-identical copy exists under `../webvowl/docs/owlapi-js/compatibility/`                             |
| Package lifecycle plan                  | This file                                                                                   | A historical copy under `../webvowl/docs/owlapi-js/` is intentionally not synchronized by this revision |
| Original package programme              | `docs/implementation-plan.md`                                                               | The WebVOWL copy predates canonical extraction changes                                                  |

Do not update the WebVOWL copies as part of this programme. If they are retained, a separate documentation cleanup should replace them with links to canonical files.

Execution starts only after the predecessor package programme has produced an accepted public production `0.1.x` release and WebVOWL consumes that registry package. Until then, all eight capabilities below remain `DEFERRED` and `NOT_STARTED`.

The predecessor predates Universal Ontology's exact-version contract and forecasts that an occupied `0.2.0` coordinate could automatically advance this programme. That forecast is not authority to diverge from the later consumer contract: Task 1 must correct the predecessor's forward references, and any actual coordinate change requires coordinated amendments in both repositories.

The current implementation already loads an ontology graph transactionally and returns a one-shot `importsClosure` array from `loadOntologyGraphFromOntologyDocument()`. It does not retain resolved direct-import edges after the call; it does not expose closure queries, ontology changes, a public `owlapi/util` namespace, document targets, or manager-selected storers. Strict RDF reconstruction also currently ignores some unconsumed, non-OWL-significant statements. Those are the concrete gaps this plan closes.

## 2. Global constraints

Every task must preserve these rules:

- The only release coordinate authorized by the consumer contract is exact `0.2.0`. A conflicting release history is a blocker requiring a coordinated contract change.
- Do not add a materialize, collapse, catalog, network, retry, or atomic-publication convenience API. Universal Ontology owns those policies and composes the standard APIs.
- Preserve the current public subpaths. The only new subpath is `owlapi/util`, because it maps to Java OWLAPI's `org.semanticweb.owlapi.util` package.
- Never export the existing development scripts in repository `util/`. The package allowlist must name only the three production binding files introduced by Task 6.
- Keep ontology instances externally immutable. Mutations must be manager-owned, validated, atomic, and reflected in subsequent direct queries, closure queries, and saves.
- Keep parser, graph-index, mutation, comparison, renderer, and storer engines package-private under `internal/`.
- Store resolved import relationships as ontology-object edges. Do not recompute them by treating an import IRI as an ontology ID after loading.
- Strict RDF mode must reject every unconsumed statement. Compatible mode may retain the current diagnostic/ignore policy.
- Functional Syntax and RDF/XML concrete storer constructors remain private. Selection occurs through `manager.saveOntology(ontology, format, target)`.
- A write to `StringDocumentTarget` is all-or-nothing. Failed representability, rendering, or validation leaves the prior target text unchanged.
- Anonymous-individual identity is document-scoped. Preserve sharing within one source ontology, standardize apart across different source documents, and compare outputs modulo one consistent blank-node bijection.
- Any package configuration, workflow, dependency, release, commit, or publication change requires its normal repository approval. The task checklists identify the earliest point at which each change is needed; they do not grant that approval.

## 3. Fixed capability and API contract

The programme consists of these exact capability IDs. Task 1 records them as deferred; Task 15 may mark them complete only after all acceptance gates pass.

| Capability ID                        | Public entry point                                                           | Required result                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `manager.imports-closure-query`      | `manager.importsClosure(ontology)` and `manager.getImportsClosure(ontology)` | Transitive reflexive closure of retained resolved edges, cycle-safe and duplicate-free |
| `ontology.change-required-surface`   | `addAxiom(s)`, `applyChange(s)`, `SetOntologyID`, `AddOntologyAnnotation`    | Atomic manager-owned changes with Java-shaped immutable change records                 |
| `util.imports-closure-set-provider`  | `OWLOntologyImportsClosureSetProvider`                                       | A reusable snapshot provider over a manager closure                                    |
| `util.ontology-merger`               | `OWLOntologyMerger`                                                          | Structural set union of every supplied ontology's direct axioms                        |
| `manager.save-ontology`              | `manager.saveOntology(ontology, format, target)`                             | Exact asynchronous storer selection and target commit                                  |
| `storer.functional`                  | manager-selected Functional Syntax storer                                    | Complete representation of every supported structural object kind                      |
| `storer.rdfxml`                      | manager-selected RDF/XML storer                                              | Lossless OWL-to-RDF-to-XML serialization or explicit failure                           |
| `rdf.strict-complete-reconstruction` | existing strict loader configuration                                         | Fatal result for every unconsumed RDF statement                                        |

The approved JavaScript call contract is:

```js
import { OWLManager } from "owlapi/apibinding";
import { AddOntologyAnnotation, SetOntologyID } from "owlapi/model";
import { StringDocumentTarget } from "owlapi/io";
import { OWLDocumentFormats } from "owlapi/formats";
import {
  OWLOntologyImportsClosureSetProvider,
  OWLOntologyMerger,
} from "owlapi/util";

const inputManager = OWLManager.createOWLOntologyManager();
const outputManager = OWLManager.createOWLOntologyManager();
const closure = inputManager.importsClosure(root); // frozen, root-first snapshot
const closureSet = inputManager.getImportsClosure(root); // defensive Set

const provider = new OWLOntologyImportsClosureSetProvider(inputManager, root);
const merger = new OWLOntologyMerger(provider);
const merged = merger.createMergedOntology(
  outputManager,
  root.getOntologyID().ontologyIRI,
);

outputManager.applyChange(new SetOntologyID(merged, root.getOntologyID()));
outputManager.applyChanges(
  [...root.getAnnotations()].map(
    (annotation) => new AddOntologyAnnotation(merged, annotation),
  ),
);

const documentTarget = new StringDocumentTarget();
await outputManager.saveOntology(
  merged,
  OWLDocumentFormats.FUNCTIONAL,
  documentTarget,
);
const document = documentTarget.getText(); // toString() returns the same text
```

Detailed call semantics:

- `importsClosure(ontology)` returns a frozen array snapshot. It is deterministic, reflexive, transitively complete, and contains the supplied ontology first.
- `getImportsClosure(ontology)` returns a new `Set` containing the same snapshot. Mutating that `Set` never mutates manager state.
- Both closure methods reject an ontology not managed by that manager with the existing typed manager/ontology error family; they never return an empty closure for a foreign ontology.
- `addAxiom`, `addAxioms`, `applyChange`, and `applyChanges` return `true` iff their complete atomic operation changes state. Duplicate set members are successful no-ops and return `false` when nothing changes.
- `SetOntologyID(ontology, ontologyID)` and `AddOntologyAnnotation(ontology, annotation)` are immutable data records. A change targeting another manager or a conflicting ontology identity is rejected before mutation.
- `OWLOntologyImportsClosureSetProvider.ontologies()` returns a fresh defensive `Set` from the constructor-time closure snapshot.
- `OWLOntologyMerger.createMergedOntology(manager, ontologyIRI)` creates a new ontology and copies the structural set union of each provider ontology's direct axioms. It does not copy imports, ontology annotations, or an input ontology ID. Omitting `ontologyIRI` creates an anonymous ontology.
- `saveOntology` returns `Promise<void>`, selects exactly one compatible internal storer from the requested format object, validates before target commit, and throws rather than falling back to a different syntax.
- `StringDocumentTarget` begins with empty text and exposes `getText()` plus `toString()`. Only a successful storer operation replaces its text.

Add these public storage errors to `owlapi/io`:

| Error                          | Stable code                  | Trigger                                                                 |
| ------------------------------ | ---------------------------- | ----------------------------------------------------------------------- |
| `OWLOntologyStorageError`      | `ONTOLOGY_STORAGE_FAILED`    | Base/wrapper for a save failure                                         |
| `OWLStorerNotFoundError`       | `STORER_NOT_FOUND`           | No internal storer accepts the requested format                         |
| `UnrepresentableOntologyError` | `ONTOLOGY_NOT_REPRESENTABLE` | The requested syntax cannot encode the ontology without structural loss |

## 4. File responsibility map

| Concern                            | Public files                                                                                 | Private implementation and primary tests                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Retained identity/import graph     | `model/owlOntologyManager.js`                                                                | `internal/loading/managedOntologyIndex.js`, `internal/loading/managedOntologyIndex.test.js`, manager tests       |
| Mutable ontology state             | `model/owlOntology.js`, manager and model exports                                            | `internal/model/ontologyState.js`, `internal/model/axiomSemantics.js`, their tests                               |
| Change records                     | `model/setOntologyID.js`, `model/addOntologyAnnotation.js`, `model/index.js`                 | manager change tests                                                                                             |
| Closure provider and merger        | `util/owlOntologyImportsClosureSetProvider.js`, `util/owlOntologyMerger.js`, `util/index.js` | colocated tests plus installed-package boundary tests                                                            |
| Document target and storage errors | `io/stringDocumentTarget.js`, `io/errors.js`, `io/index.js`                                  | IO and manager storage tests                                                                                     |
| Storer selection                   | manager public method only                                                                   | `internal/storage/storerRegistry.js`, registry tests                                                             |
| Functional Syntax output           | format objects already public                                                                | `internal/storage/functional/functionalSyntaxRenderer.js`, `functionalSyntaxStorer.js`, tests and Java snapshots |
| Structural equivalence             | none                                                                                         | `internal/model/ontologyStructuralIsomorphism.js`, tests                                                         |
| Strict RDF reconstruction          | existing loader configuration                                                                | `internal/mapping/rdfToOwlTranslator.js` and strict-mode tests                                                   |
| RDF/XML output                     | format object already public                                                                 | `internal/storage/rdfxml/rdfXmlGraphWriter.js`, `rdfXmlStorer.js`, tests                                         |
| Java/UO oracle                     | none                                                                                         | `util/owlapi-reference/RunImportClosureContract.java`, launcher, fixtures, tests                                 |
| Capability/docs/release            | package metadata only at approval gate                                                       | compatibility JSON/generator/docs, package and release gates                                                     |

---

## 5. Task-by-task implementation plan

### Task 1: Lock lifecycle governance to the eight-capability contract

**Files**

- Modify: `docs/compatibility/capabilities.json`
- Modify: `docs/compatibility/standalone-import-closure-prerequisites.md`
- Modify only the superseded feature-line forward references: `docs/implementation-plan.md`
- Modify: `governance.test.js`

**Steps**

1. Add a failing governance test that loads the capability matrix and requires the exact eight IDs from §3, each with `status: "DEFERRED"`, `progress: "NOT_STARTED"`, and `phase: null`. Assert that the old umbrella `storer.concrete-serializers` row is absent, so it cannot obscure partial completion.
2. Extend the existing uniqueness/status checks to require one row per capability. For these eight IDs, reject `progress: "COMPLETE"` unless the phase is `21`—the first semantic phase after the predecessor's production Phase 20—and the matrix's global release is exact `0.2.0`.
3. Update the capability matrix and prerequisite note without claiming implementation. Record the exact `0.2.0` dependency and the stop-for-amendment rule. Correct only the predecessor plan's forward-looking sentences that currently authorize automatic version advance; do not reopen its accepted `0.1.x` decisions.
4. Run:

   ```powershell
   npm test -- --runInBand governance.test.js
   npm run lint:files -- governance.test.js
   npx --no-install prettier --check docs/compatibility/capabilities.json docs/compatibility/standalone-import-closure-prerequisites.md docs/implementation-plan.md governance.test.js
   ```

5. Request a review checkpoint before any commit. A commit, if separately authorized, should contain only the governance baseline for this programme.

### Task 2: Retain ontology identity aliases and resolved import edges transactionally

**Files**

- Create: `internal/loading/managedOntologyIndex.js`
- Create: `internal/loading/managedOntologyIndex.test.js`
- Modify: `model/owlOntologyManager.js`
- Modify: `model/owlOntologyManager.integration.test.js`

**Private contract**

`ManagedOntologyIndex` owns four lookup concerns: managed object membership; unique full ontology-ID keys; one-to-many ontology-IRI and version-IRI indexes; and unique document-IRI aliases. It also owns `Map<OWLOntology, Set<OWLOntology>>` direct-import edges. A load session stages ontologies, indexes, aliases, and edges and commits the complete graph together only after every required document parses and every import resolves. An IRI-only lookup must either identify one ontology or report ambiguity; it must not choose an arbitrary member of a multi-version set.

**Steps**

1. Add failing unit tests for registering an ontology under its full structural ID plus ontology IRI, version IRI, and document IRI; looking it up through each valid index; retaining two distinct full IDs that share an ontology IRI; reporting an ambiguous IRI-only lookup; rejecting two different ontologies with the same full ID or document IRI; and discarding a failed staged transaction.
2. Add failing integration fixtures for:

   - a diamond graph with one shared leaf;
   - a cycle where the back edge addresses an already-loading ontology through its version IRI;
   - two authored imports that resolve to the same document IRI;
   - an imported document whose declared ontology IRI differs from the authored import IRI; and
   - a late missing import that must leave the manager unchanged.

3. Extract the existing `#ontologies` and document-context indexing into `ManagedOntologyIndex`. Preserve current `getOntology(ontologyID)` behaviour while making alias resolution explicit.
4. During `#loadImport`, bind the import declaration to the actual resolved ontology object returned by that load session. Never synthesize an `OWLOntologyID` from the import IRI to reconstruct the edge.
5. Stage back edges to an in-flight entry without recursively reloading it. Commit only when the root graph succeeds; on any parse, ambiguity, missing-import, or resource-limit error, discard all new entries and edges.
6. Preserve the current one-shot `loadOntologyGraphFromOntologyDocument()` result for backward compatibility, but derive its closure from the retained staged graph so it cannot disagree with Task 3.
7. Run:

   ```powershell
   npm test -- --runInBand internal/loading/managedOntologyIndex.test.js model/owlOntologyManager.integration.test.js
   npm run lint:files -- internal/loading/managedOntologyIndex.js internal/loading/managedOntologyIndex.test.js model/owlOntologyManager.js model/owlOntologyManager.integration.test.js
   ```

8. Request a checkpoint. Do not commit if the transaction tests show any manager state surviving a failed graph load.

### Task 3: Expose deterministic, cycle-safe manager closure queries

**Files**

- Modify: `model/owlOntologyManager.js`
- Modify: `model/owlOntologyManager.test.js`
- Modify: `model/owlOntologyManager.integration.test.js`

**Algorithm**

Use an explicit stack rather than recursion. Mark the root visited before traversal. For each ontology, sort its retained resolved direct imports by a semantic key: named ontology IRI then version IRI for named IDs, and resolved document IRI for anonymous IDs. Never order by the package-private generated token of an anonymous ontology ID. Use document IRI as the final tie-breaker for named IDs, then push in reverse order. The resulting frozen snapshot is root-first and deterministic while set membership remains the normative property.

**Steps**

1. Add failing tests that require:

   ```js
   expect(manager.importsClosure(root)).toEqual([root, left, leaf, right]);
   expect(manager.getImportsClosure(root)).toEqual(
     new Set([root, left, leaf, right]),
   );
   ```

   Cover the diamond, self-import, multi-node cycle, duplicate import declaration, isolated root, and a chain long enough to detect recursive traversal.

2. Assert snapshot semantics: a previously returned array and `Set` retain the same membership and order after later manager activity; array membership/order cannot be mutated through the result; clearing the returned `Set` has no effect. The managed ontology façades inside those snapshots must still expose subsequently committed direct state, as Task 4 verifies.
3. Assert manager ownership: a structurally equal ontology owned by another manager and an unmanaged ontology object both throw `OWLOntologyStateError` with stable operation details.
4. Implement `importsClosure` and `getImportsClosure` over `ManagedOntologyIndex`. Do not initiate document loading and do not consult document loaders or IRI mappers.
5. Make the load-graph convenience result call this same traversal after commit. Remove the duplicate local closure algorithm.
6. Run:

   ```powershell
   npm test -- --runInBand model/owlOntologyManager.test.js model/owlOntologyManager.integration.test.js
   npm run lint:files -- model/owlOntologyManager.js model/owlOntologyManager.test.js model/owlOntologyManager.integration.test.js
   ```

7. Request a checkpoint. The focused tests must prove zero loader calls during both closure query methods.

### Task 4: Introduce package-private mutable ontology state and atomic axiom addition

**Files**

- Create: `internal/model/axiomSemantics.js`
- Create: `internal/model/axiomSemantics.test.js`
- Create: `internal/model/ontologyState.js`
- Create: `internal/model/ontologyState.test.js`
- Modify: `model/owlOntology.js`
- Modify: `model/owlOntologyManager.js`
- Modify: `model/owlOntologyManager.test.js`
- Modify: `model/model.test.js`

**Private contract**

`OntologyState` stores the current full ontology ID, structural-keyed direct axioms, direct ontology annotations, authored import declarations, document metadata, and a monotonically increasing revision. `OWLOntology` is a read-only façade over that state. Only its owning manager receives the mutation authority needed to stage and replace state.

**Steps**

1. Add failing `axiomSemantics` tests showing that two separately allocated but structurally equal axioms are one set member, while differing nested annotations, literals, language tags, datatypes, or anonymous-individual scopes remain distinct.
2. Add failing state tests for snapshot, clone, preflight, commit, and rollback. A failed staged operation must preserve the previous revision and every direct query result. Define and exhaustively test `isLogicalAxiom` against every current `AXIOM_KINDS` member using the pinned Java `AxiomType.isLogical` classification, so Task 6's optional logical-only mode has no heuristic branch.
3. Refactor ontology construction so parsed and programmatically created ontologies use `OntologyState`. Preserve current `OWLOntology` methods and externally frozen model objects.
4. Implement manager ownership checks and:

   ```js
   manager.addAxiom(ontology, axiom);
   manager.addAxioms(ontology, iterable);
   ```

   Validate the complete iterable and its `AXIOM_KINDS` membership before mutation. Materialize one-shot iterables exactly once. Reject foreign ontologies and invalid elements with typed errors that identify the operation and offending index.

5. Commit a cloned structural set once. Return `false` for a duplicate-only call and `true` when at least one new structural member is added. Recompute all derived signature and referencing queries from the committed state; do not maintain a second mutable cache.
6. Add regression tests for empty iterables, generators, duplicates within one call, a late invalid element, cross-manager calls, signatures, referencing axioms, and closure snapshots whose ontology objects expose the newly added direct axiom.
7. Run:

   ```powershell
   npm test -- --runInBand internal/model/axiomSemantics.test.js internal/model/ontologyState.test.js model/owlOntologyManager.test.js model/model.test.js
   npm run lint:files -- internal/model model/owlOntology.js model/owlOntologyManager.js
   ```

8. Request a checkpoint after confirming that no mutable collection or state-authority token is reachable from a public object.

### Task 5: Add immutable changes and atomic `applyChange(s)`

**Files**

- Create: `model/setOntologyID.js`
- Create: `model/addOntologyAnnotation.js`
- Create: `model/ontologyChanges.test.js`
- Modify: `model/index.js`
- Modify: `index.js`
- Modify: `model/owlOntologyManager.js`
- Modify: `model/owlOntologyManager.test.js`
- Modify: `internal/loading/managedOntologyIndex.js`
- Modify: `internal/loading/managedOntologyIndex.test.js`
- Modify: `util/generate-java-api-surface.mjs`
- Regenerate: `docs/compatibility/java-api-surface.json`, `docs/compatibility/java-api-surface.md`, `API.md`

**Steps**

1. Add failing constructor tests requiring frozen `SetOntologyID` and `AddOntologyAnnotation` records with Java-shaped accessors for their target ontology and value. Reject a missing ontology, non-`OWLOntologyID`, or non-annotation object during construction.
2. Add failing manager tests for one change, a mixed change list, duplicate annotation no-op, replacement of both ontology and version IRI, conflicting target identity, unsupported change class, foreign target, and a valid first change followed by an invalid later change.
3. Export both change classes from `owlapi/model` and the existing bare convenience aggregate. Do not create a new parameters namespace or expose Java's `ChangeApplied` enum; the boolean contract in §3 is sufficient for this release.
4. Implement `applyChange(change)` as the single-item form of `applyChanges(iterable)`. Materialize and validate all changes, group them by managed ontology, clone all affected states and index aliases, apply in order to the clones, then commit all affected state and aliases together.
5. `SetOntologyID` must update the unique full-ID key and the one-to-many ontology-IRI/version-IRI indexes atomically while preserving the document alias and resolved import edges. Reject a duplicate full ID before replacing any state; sharing only an ontology IRI remains legal and produces an explicitly ambiguous IRI-only lookup.
6. `AddOntologyAnnotation` changes only the target ontology's direct annotation set. It must not manufacture an annotation assertion axiom and must use structural set semantics.
7. Add both change records to the Java API registry generator under `org.semanticweb.owlapi.model`, then regenerate the JSON and Markdown surfaces.
8. Return `false` only when the complete change set is a no-op. A thrown error leaves every ontology, alias, and revision unchanged.
9. Run:

   ```powershell
   npm test -- --runInBand model/ontologyChanges.test.js model/owlOntologyManager.test.js internal/loading/managedOntologyIndex.test.js
   npm run lint:files -- model/setOntologyID.js model/addOntologyAnnotation.js model/owlOntologyManager.js internal/loading/managedOntologyIndex.js
   node util/generate-java-api-surface.mjs
   ```

10. Request a checkpoint. Include explicit before/after snapshots in the rollback tests so atomicity is evidence-backed.

### Task 6: Add the exact public closure provider and merger surface

**Files**

- Create: `util/owlOntologyImportsClosureSetProvider.js`
- Create: `util/owlOntologyImportsClosureSetProvider.test.js`
- Create: `util/owlOntologyMerger.js`
- Create: `util/owlOntologyMerger.test.js`
- Create: `util/index.js`
- Modify: `index.js`
- Modify with explicit configuration approval: `package.json`
- Modify: `test/package-boundary.test.mjs`
- Modify: `test/installed-package-smoke.mjs`
- Modify: `test/installed-package-import-purity.mjs`
- Modify: `test/consumers/browser/_shared/exercise-package.js`
- Modify: `util/generate-java-api-surface.mjs`
- Regenerate: `docs/compatibility/java-api-surface.json`, `docs/compatibility/java-api-surface.md`, `API.md`

**Public constructors**

```js
const provider = new OWLOntologyImportsClosureSetProvider(
  manager,
  rootOntology,
);
const merger = new OWLOntologyMerger(provider); // mergeOnlyLogicalAxioms=false
const logicalMerger = new OWLOntologyMerger(provider, true);
```

The provider captures the closure at construction. The merger calls `provider.ontologies()` when creating a target, validates the complete result, constructs the axiom union before creating the ontology, and then uses only public manager mutation methods. Its logical-only branch delegates to the exhaustive `isLogicalAxiom` classification from Task 4.

**Steps**

1. Add failing provider tests for root inclusion, cycles, constructor-time snapshot semantics, a defensive `Set` per `ontologies()` call, and propagation of the manager's foreign-ontology error.
2. Add failing merger tests for structural duplicate elimination, non-logical axiom retention by default, the explicit logical-only constructor option, direct-axiom-only copying, and exact omission of source IDs, imports declarations, and ontology annotations.
3. Add the anonymous-individual fixture used by Universal Ontology: two source documents both use the label `_:same`, each label is shared within its own source, and the merged ontology must retain two individuals while preserving both within-source sharing relationships.
4. Build the union before `manager.createOntology()` so an invalid provider element or iterable failure cannot leave an empty target registered. Create an anonymous target when the IRI argument is absent; when present, accept only an `IRI` and let manager identity-collision rules fail before mutation.
5. Export exactly the provider and merger from `util/index.js`, and re-export them from the existing bare convenience aggregate.
6. Before editing package metadata, request configuration approval. Once approved, add `"./util": "./util/index.js"` to `exports` and add these exact packed files to `files`:

   ```text
   util/index.js
   util/owlOntologyImportsClosureSetProvider.js
   util/owlOntologyMerger.js
   ```

   Never add `"util/"`; that directory contains development, release-evidence, benchmark, and Java-reference programs that are not package API.

7. Extend boundary tests to prove the approved bare and `owlapi/util` specifiers work from a packed-and-installed tarball, `owlapi/util` works in the browser consumers, and `owlapi/util/owlOntologyMerger.js` plus existing development utilities are blocked as deep imports.
8. Add both util classes to the Java API registry generator under `org.semanticweb.owlapi.util`; then regenerate the registry and API views.
9. Run:

   ```powershell
   npm test -- --runInBand util/owlOntologyImportsClosureSetProvider.test.js util/owlOntologyMerger.test.js
   npm run test:boundary
   npm run lint:files -- util/index.js util/owlOntologyImportsClosureSetProvider.js util/owlOntologyMerger.js test
   node util/generate-java-api-surface.mjs
   ```

10. Request a checkpoint. Inspect `npm pack --dry-run --json` evidence and fail the task if any non-approved `util/` file is packed.

### Task 7: Add an atomic string target and exact manager storer selection

**Files**

- Create: `io/stringDocumentTarget.js`
- Modify: `io/errors.js`
- Modify: `io/index.js`
- Modify: `io/io.test.js`
- Create: `internal/storage/storerRegistry.js`
- Create: `internal/storage/storerRegistry.test.js`
- Modify: `model/owlOntologyManager.js`
- Create: `model/owlOntologyManager.storage.test.js`
- Modify: `index.js`
- Modify: `util/generate-java-api-surface.mjs`
- Regenerate: `docs/compatibility/java-api-surface.json`, `docs/compatibility/java-api-surface.md`, `API.md`

**Private storer protocol**

```js
{
  formatKey: "functional",
  async render(ontology, format) { return completeText; }
}
```

`StorerRegistry.select(format)` matches the requested `OWLDocumentFormat.key` exactly. It does not select by extension, media type, `isRdf`, or a fallback list. The manager obtains complete text first and invokes the package-private target replacement function only after rendering succeeds.

**Steps**

1. Add failing `StringDocumentTarget` tests for initial empty text, identical `getText()`/`toString()` results, preservation of Unicode text, and the absence of public append/write methods.
2. Add the three typed errors from §3 to `io/errors.js`, export them through `owlapi/io` and the bare aggregate, and test stable names, codes, causes, and safe detail fields.
3. Implement target storage with module-private state, for example a `WeakMap`, and a non-public-index helper that atomically replaces a target's text. Reject any object other than a genuine `StringDocumentTarget`.
4. Add registry unit tests with fake storers for exact format-key selection, duplicate registration at manager construction, unsupported format, asynchronous render success, synchronous throw, and rejected promise.
5. Have each manager construct the package-private default storer registry; do not accept a storer registry, storer list, or registration hook as a public constructor option. Implement:

   ```js
   await manager.saveOntology(ontology, format, target);
   ```

   Validate the managed ontology, `OWLDocumentFormat`, and target before selecting. Wrap unexpected renderer failures in `OWLOntologyStorageError` with `cause`; preserve already typed storage errors.

6. Assert at manager level that an unsupported format throws `OWLStorerNotFoundError` and prior target text is unchanged. Exercise renderer rejection and successful replace-not-append behaviour at the private registry/target protocol boundary until Tasks 9 and 12 register real manager-selected storers.
7. Register no real storers yet. Production Functional and RDF/XML registrations arrive in Tasks 9 and 12; manager-level success and renderer-failure atomicity become required regression cases in those tasks.
8. Add target/error classifications to the Java surface generator and regenerate after exports exist.
9. Run:

   ```powershell
   npm test -- --runInBand io/io.test.js internal/storage/storerRegistry.test.js model/owlOntologyManager.storage.test.js
   npm run lint:files -- io internal/storage model/owlOntologyManager.js
   node util/generate-java-api-surface.mjs
   ```

10. Request a checkpoint. The tests must demonstrate target atomicity using pre-populated text, not only an initially empty target.

### Task 8: Implement structural ontology comparison modulo anonymous-individual bijection

**Files**

- Create: `internal/model/ontologyStructuralIsomorphism.js`
- Create: `internal/model/ontologyStructuralIsomorphism.test.js`
- Reuse: `internal/rdfjs/datasetIsomorphism.test.js` as graph-isomorphism precedent, not as an OWL comparator

**Private contract**

```js
compareOntologies(left, right, {
  compareOntologyID: true,
  compareImports: true,
  compareAnnotations: true,
  compareAxioms: true,
}); // { equal, mismatch }
```

All named structural values compare exactly. Two ontology IDs compare equal when their ontology/version IRIs match exactly, or when both are anonymous; package-private generated tokens for anonymous ontology IDs are not semantic. Anonymous individuals compare through one injective mapping and its reverse. The same left individual must always map to the same right individual, distinct left individuals must never collapse, and document-scope/node-label spelling is otherwise irrelevant.

**Steps**

1. Add failing tests for equal ontologies with renamed anonymous labels; preserved repeated use through nested expressions and axiom annotations; a many-to-one false positive; a one-to-many false positive; two source scopes that reuse one label; different literals, datatypes, language tags, imports, IDs, and ontology annotations; and axiom sets inserted in different orders.
2. Build label-independent skeleton fingerprints for each axiom and annotation. Bucket candidates by kind, arity, named terms, literal values, and anonymous occurrence pattern before backtracking.
3. Backtrack only within matching buckets, choosing the smallest candidate bucket first. Carry forward and reverse anonymous maps in each branch. Memoize failed states by bucket position plus current bijection.
4. Return the first stable mismatch category and structural path when no bijection succeeds. Do not expose the comparator publicly and do not use blank-node labels as a deterministic tie-breaker for semantic equality.
5. Add adversarial symmetric fixtures and enforce a test-time search-state ceiling so an accidental factorial regression fails predictably. If the ceiling is exceeded, throw a package-private structural-comparison limit error; storage callers translate it to `UnrepresentableOntologyError` with comparison-limit details rather than accepting an unverified save.
6. Run:

   ```powershell
   npm test -- --runInBand internal/model/ontologyStructuralIsomorphism.test.js internal/rdfjs/datasetIsomorphism.test.js
   npm run lint:files -- internal/model/ontologyStructuralIsomorphism.js internal/model/ontologyStructuralIsomorphism.test.js
   ```

7. Request a checkpoint with the adversarial fixture timings recorded in the review notes.

### Task 9: Implement complete Functional Syntax rendering and storage

**Files**

- Create: `internal/storage/functional/functionalSyntaxRenderer.js`
- Create: `internal/storage/functional/functionalSyntaxRenderer.test.js`
- Create: `internal/storage/functional/functionalSyntaxStorer.js`
- Create: `internal/storage/functional/functionalSyntaxStorer.test.js`
- Modify: `internal/storage/storerRegistry.js`
- Modify: `model/owlOntologyManager.storage.test.js`
- Create: `util/owlapi-reference/fixtures/storage/functional-all-kinds.ofn`
- Create: `util/owlapi-reference/fixtures/storage/functional-all-kinds.java.json`

**Rendering rules**

Emit complete IRIs for this release; correctness and reproducibility never depend on prefix compaction or source prefix retention. Sort imports, ontology annotations, and axioms by structural keys for reproducible output. Allocate document-local anonymous-individual labels from encounter order after sorting. Escape IRIs, strings, language tags, and datatypes according to Functional Syntax grammar, not JavaScript or JSON escaping.

**Steps**

1. Add a failing exhaustiveness test generated from `OWL_OBJECT_KINDS`. It must require an explicit renderer branch for every currently constructible entity, expression, data range, annotation, axiom, literal, IRI, and anonymous individual. Adding a future kind without a renderer branch must fail this test.
2. Add focused grammar tests for full and version ontology IDs, anonymous ontologies, imports, ontology annotations, annotated axioms, nested expressions, negative assertions, datatype restrictions, language-tagged literals, quote/backslash/control escaping, Unicode, and repeated anonymous individuals.
3. Implement a pure renderer whose only input is a committed ontology snapshot plus format parameters. Do not call a document loader, infer declarations, rewrite metadata, or serialize transitive imports.
4. Implement the internal Functional storer and register it only for `OWLDocumentFormats.FUNCTIONAL.key`.
5. For every supported object kind, use an exhaustive fixture with no import declarations and perform this manager-level round trip:

   ```text
   ontology -> saveOntology(FUNCTIONAL) -> StringDocumentSource
   -> fresh strict manager with a throwing/counting loader -> ontology
   -> structural comparison modulo anonymous bijection
   ```

   Require one loaded ontology, zero loader calls, empty direct imports, and exact full ID/direct annotations/direct axioms. Separately round-trip a root containing import declarations with a deterministic counting in-memory loader that supplies the referenced stub ontologies; compare the root's direct imports exactly and assert the expected loader calls rather than falsely claiming an imported document is standalone.

6. Generate the pinned Java OWLAPI structural snapshot for the exhaustive fixture. Compare structural results, not bytes or prefix choices. Record any permitted syntax difference in `docs/compatibility/expected-differences.json`; do not normalize away semantic differences.
7. Add negative tests proving that a deliberately unhandled object, invalid lexical value, or unsupported format parameter produces a typed storage failure and leaves target text unchanged.
8. Run:

   ```powershell
   npm test -- --runInBand internal/storage/functional model/owlOntologyManager.storage.test.js
   npm test -- --runInBand internal/parsing/functional/functionalSyntax.conformance.test.js internal/parsing/functional/functionalSyntax.differential.test.js
   npm run lint:files -- internal/storage/functional internal/storage/storerRegistry.js
   ```

9. Request a checkpoint only after the all-kinds fixture passes the fresh-manager, zero-loader round trip.

### Task 10: Make strict RDF reconstruction account for every input statement

**Files**

- Modify: `internal/mapping/rdfToOwlTranslator.js`
- Modify: `internal/mapping/rdfToOwlTranslator.test.js`
- Modify: `internal/mapping/rdfToOwlTranslator.conformance.test.js`
- Create: `internal/mapping/rdfToOwlTranslator.strictComplete.test.js`
- Modify: `docs/compatibility/expected-differences.json` only if a previously documented compatible-mode diagnostic needs clarification

**Steps**

1. Add failing tests in strict mode for an otherwise valid selected graph followed by each of these unconsumed statements: an arbitrary predicate, an ignored RDF typing statement, an extra list edge, an RDF reification fragment, an unrelated named subject, and a surplus annotation-shaped statement. Every case must fail; none may be downgraded because it is not considered OWL-significant.
2. Add paired compatible-mode tests to preserve the deliberately non-fatal diagnostic policy where the current compatibility contract allows it. The result must identify every ignored quad by graph, subject, predicate, object, and source location when available.
3. Move the strict unconsumed-quad check ahead of the current `#isOwlSignificant` filtering. Treat parser-consumed syntax scaffolding as consumed at the point that reconstruction uses it; do not create a vocabulary allowlist that silently discards statements.
4. Keep selected-graph policy separate: graph selection decides which graph enters reconstruction, while strict completeness decides whether every statement in that selected input was consumed. Dataset ambiguity remains its existing typed error.
5. Run the entire RDF mapping suite because consumption accounting crosses many constructors:

   ```powershell
   npm test -- --runInBand internal/mapping/rdfToOwlTranslator.strictComplete.test.js internal/mapping/rdfToOwlTranslator.test.js internal/mapping/rdfToOwlTranslator.conformance.test.js internal/mapping/rdfToOwlTranslator.axioms.test.js internal/mapping/rdfToOwlTranslator.expressions.test.js
   npm run lint:files -- internal/mapping/rdfToOwlTranslator.js internal/mapping/rdfToOwlTranslator.strictComplete.test.js
   ```

6. Request a checkpoint. Include a regression assertion that the Universal Ontology “ignored RDF statement” fixture now fails in strict mode.

### Task 11: Implement a standards-conforming RDF/XML graph writer

**Files**

- Create: `internal/storage/rdfxml/rdfXmlGraphWriter.js`
- Create: `internal/storage/rdfxml/rdfXmlGraphWriter.test.js`
- Modify: `internal/parsing/rdfxml/rdfXmlSyntaxAdapter.test.js` only for shared round-trip fixtures
- Reuse: `internal/rdfjs/environment.js`, `internal/rdfjs/graphPolicy.js`

**Writer boundary**

The writer serializes one ordinary RDF/JS default graph. It is not an OWL storer and does not decide whether OWL structural information survived mapping. Task 12 composes it with `owlToRdfTranslator` and validates structural injectivity.

Use the conservative RDF/XML form: one `rdf:Description` per subject; full `rdf:about`, deterministic synthetic `rdf:nodeID`, or literal content; and property elements for predicates. Avoid typed-node and property-attribute abbreviations so equivalent inputs have one auditable path.

**Steps**

1. Add failing graph tests for named and blank subjects, named and blank objects, plain/datatype/language literals, repeated predicates, RDF collections as ordinary triples, Unicode IRIs/literals, XML metacharacters, and different insertion orders.
2. Add negative tests for named-graph quads, relative or invalid IRIs, a predicate IRI with no legal XML QName split, a blank-node predicate, invalid language/datatype terms, and characters forbidden by the selected XML 1.0 encoding.
3. Implement deterministic subject/triple sorting with RDF-term structural keys. Assign `rdf:nodeID` values from sorted encounter order; never expose input blank-node labels.
4. Derive namespaces by choosing a deterministic IRI split whose local part is an XML `NCName`; prefer the longest namespace among legal splits, deduplicate namespaces, and allocate `ns0`, `ns1`, and so on in lexical namespace order. Throw `UnrepresentableOntologyError` when no legal split exists.
5. Escape XML text and attribute values separately. Preserve the exact literal lexical form, datatype IRI, and normalized language tag supplied by the structural model. Use character references where XML end-of-line or attribute normalization would otherwise change an allowed character such as carriage return; reject rather than replace, delete, or escape characters forbidden by XML 1.0.
6. Parse every successful result with the existing RDF/XML adapter into a fresh RDF/JS dataset and require dataset isomorphism with the input. Compare datasets modulo blank-node bijection, not serialized text or generated prefixes.
7. Run:

   ```powershell
   npm test -- --runInBand internal/storage/rdfxml/rdfXmlGraphWriter.test.js internal/parsing/rdfxml/rdfXmlSyntaxAdapter.test.js internal/rdfjs/datasetIsomorphism.test.js
   npm run lint:files -- internal/storage/rdfxml/rdfXmlGraphWriter.js internal/storage/rdfxml/rdfXmlGraphWriter.test.js
   ```

8. Request a checkpoint. Attach the negative QName and forbidden-character evidence because these failures become public representability errors in Task 12.

### Task 12: Add lossless RDF/XML ontology storage with pre-commit verification

**Files**

- Create: `internal/storage/rdfxml/rdfXmlStorer.js`
- Create: `internal/storage/rdfxml/rdfXmlStorer.test.js`
- Modify: `internal/storage/storerRegistry.js`
- Modify: `internal/mapping/owlToRdfTranslator.js` only if a proven mapping defect blocks a required structural kind
- Modify: `internal/mapping/owlToRdfTranslator.roundTrip.test.js`
- Modify: `model/owlOntologyManager.storage.test.js`
- Create: `util/owlapi-reference/fixtures/storage/rdfxml-all-kinds.rdf`
- Create: `util/owlapi-reference/fixtures/storage/rdfxml-all-kinds.java.json`

**Losslessness gate**

Before target commit, the internal storer must complete this entire pipeline in memory:

```text
committed OWLOntology snapshot
  -> OwlToRdfTranslator
  -> one default RDF graph
  -> rdfXmlGraphWriter
  -> existing RDF/XML parser
  -> strict RdfToOwlTranslator
  -> compareOntologies modulo anonymous-individual bijection
  -> complete text returned to saveOntology
  -> atomic target replacement
```

**Steps**

1. Add failing all-kinds and focused round-trip tests covering the complete current `OWL_OBJECT_KINDS` surface, ontology/version IDs, root annotations, annotation assertion axioms, annotated axioms, imports, literals, and shared anonymous individuals.
2. Add the required non-injective case where an ontology annotation and an annotation assertion about the ontology IRI map to RDF that cannot reconstruct their distinct structural roles. Require `UnrepresentableOntologyError`, a mismatch category/path, and an unchanged pre-populated target.
3. Add negative tests for every graph-writer limitation from Task 11, multiple/default-graph leakage, a deliberately unconsumed output quad, and a deliberately lossy OWL-to-RDF mapping branch.
4. Implement the storer without reaching through manager public APIs during validation. Use a fresh strict reconstruction context with no IRI mapper or ambient document loader. Require exactly one reconstructed ontology, zero external loads, empty diagnostics, and structural equality across ID, direct imports, direct annotations, and direct axioms.
5. Register the storer only for `OWLDocumentFormats.RDF_XML.key`. Never fall back to Functional Syntax; the caller may select Functional explicitly after handling the typed failure.
6. Generate the pinned Java OWLAPI structural snapshot for the representable exhaustive fixture and compare semantics, not byte layout. Keep known Java-vs-JavaScript serialization spellings in the expected-differences registry only when both strict round trips prove equivalence.
7. Run:

   ```powershell
   npm test -- --runInBand internal/storage/rdfxml model/owlOntologyManager.storage.test.js internal/mapping/owlToRdfTranslator.roundTrip.test.js
   npm test -- --runInBand internal/mapping/owlToRdfTranslator.differential.test.js internal/mapping/rdfToOwlTranslator.differential.test.js
   npm run lint:files -- internal/storage/rdfxml internal/storage/storerRegistry.js
   ```

8. Request a checkpoint only after both the exhaustive success fixture and the mandated non-injective failure fixture pass through `manager.saveOntology` with target atomicity.

### Task 13: Exercise the exact Universal Ontology composition through public boundaries

**Files**

- Create: `test/import-closure/public-contract.test.js`
- Create: `test/import-closure/fixtures/closure/root.ofn`
- Create: supporting imported ontology fixtures under `test/import-closure/fixtures/closure/`
- Create: `test/installed-package-import-closure.mjs`
- Modify: `scripts/qualify-installed-candidate.mjs`
- Modify: `test/consumers/browser/_shared/exercise-package.js`
- Modify: `test/consumers/browser/worker/ontology-worker.js`
- Modify: `test/installed-package-no-network.mjs`

**Required composition**

The test must use only `owlapi/apibinding`, `owlapi/model`, `owlapi/io`, `owlapi/formats`, and `owlapi/util`:

```js
const provider = new OWLOntologyImportsClosureSetProvider(inputManager, root);
const merger = new OWLOntologyMerger(provider, false);
const rootID = root.getOntologyID();
const collapsed = merger.createMergedOntology(
  outputManager,
  rootID.ontologyIRI,
);

outputManager.applyChange(new SetOntologyID(collapsed, rootID));
outputManager.applyChanges(
  [...root.getAnnotations()].map(
    (annotation) => new AddOntologyAnnotation(collapsed, annotation),
  ),
);
```

**Steps**

1. Build a fixture closure with a diamond, a cycle, repeated import declarations, version IRIs, root and imported ontology annotations, annotation assertion axioms about ontology IRIs, duplicate axioms, and cross-document anonymous-label reuse with within-document sharing.
2. Load it through a deterministic in-memory document loader and assert the input closure once. Then run exactly the public composition above into a separate output manager.
3. Assert the in-memory result:

   - full output ID equals the root full ID;
   - output ontology annotations equal only the root direct annotations;
   - output imports declarations are empty;
   - output direct axioms equal the structural set union of every closure ontology's direct axioms; and
   - anonymous individuals preserve within-source identity and remain distinct across sources.

4. Save the result once as Functional Syntax and once as RDF/XML through `manager.saveOntology`. Reload each text in a fresh strict manager whose document loader increments a counter and throws. Require closure cardinality one, zero loader calls, no diagnostics, and structural equivalence modulo one anonymous-individual bijection.
5. Mutate each saved artefact independently by removing or adding an axiom, root annotation, version IRI, imports declaration, anonymous sharing edge, literal datatype, or language tag. Require the verifier to reject every mutation. Exercise the strict ignored-RDF and RDF/XML non-injective failures too.
6. Run the same successful composition from a packed-and-installed candidate with deep imports disabled and network denied. Add it to `qualify-installed-candidate.mjs`, not only the source-tree Jest suite.
7. Run the composition in the import-map, bundler, dedicated-worker, and WebVOWL browser-consumer boundaries. Do not polyfill filesystem or Node-only modules into the production package.
8. Run:

   Use fresh, previously absent output paths for the retained development candidate and its evidence:

   ```powershell
   npm test -- --runInBand test/import-closure/public-contract.test.js
   npm run test:boundary
   npm run release:pack -- --output .release/import-closure-candidate
   npm run candidate:portable -- --candidate .release/import-closure-candidate --output .release/import-closure-portability.json
   npm run browser:prepare -- --candidate .release/import-closure-candidate --output .release/import-closure-browser
   npm run test:browser -- --fixture-root .release/import-closure-browser
   npm run test:webvowl-consumer -- --candidate-dir .release/import-closure-candidate --webvowl-repository ../webvowl --output .release/import-closure-webvowl
   ```

9. Request a checkpoint with both source-tree and installed-candidate results. Passing only one boundary is insufficient.

### Task 14: Add the pinned Java import-closure acceptance oracle

**Files**

- Create: `util/owlapi-reference/RunImportClosureContract.java`
- Create: `util/owlapi-reference/run-import-closure-contract.mjs`
- Create: `util/owlapi-reference/run-import-closure-contract.test.js`
- Modify: `util/owlapi-reference/README.md`
- Reuse: `util/owlapi-reference/RunWithClasspath.java`
- Reuse: `util/owlapi-reference/pinned-version.json`

**Oracle contract**

The Java runner uses the pinned local Java OWLAPI revision. It resolves only exact OASIS XML Catalog `<uri name="…" uri="…"/>` entries needed by the real repositories, loads the root and closure offline, merges every direct axiom with `mergeOnlyLogicalAxioms = false`, restores the full root ID, copies only root ontology annotations, and compares a supplied output structurally modulo anonymous-individual bijection.

The utility is development evidence, not an npm package export. Its CLI is:

```text
node util/owlapi-reference/run-import-closure-contract.mjs \
  --root <root-document> \
  --catalog <catalog-v001.xml> \
  --verify-output <collapsed-document>
```

**Steps**

1. Add launcher tests for required arguments, missing paths, malformed/duplicate catalog entries, unsupported catalog constructs, authored imports absent from the catalog, Java compile failure, Java non-zero exit, output mismatch, and a passing cyclic closure.
2. Parse the catalog as XML with external entities disabled. Resolve catalog-relative URI values against the catalog directory, reject network schemes and path ambiguity, and reject rather than ignore `rewriteURI`, delegates, `nextCatalog`, or other constructs not implemented by this acceptance utility.
3. Compile/run through the existing pinned-classpath mechanism. Deny network access and verify the resolved Java revision before executing the oracle.
4. In Java, compare full ontology ID, direct root annotations, empty direct imports, and the direct-axiom structural union. Canonicalize named values exactly and search for one consistent anonymous-individual bijection; never compare Java-generated blank-node labels directly.
5. Emit one machine-readable JSON result on stdout with pinned revision, closure member IDs, expected/actual counts, comparison outcome, mismatch category/path, and zero-network evidence. Send compiler/log diagnostics to stderr so callers can parse stdout deterministically.
6. Test the four real Universal Ontology families with the commands already specified by its canonical plan:

   ```powershell
   node util/owlapi-reference/run-import-closure-contract.mjs --root ..\universal-ontology\dist\iso-iec\11179\-3\ed-4\20260714 --catalog ..\universal-ontology\iso-iec11179-3\catalog-v001.xml --verify-output ..\universal-ontology\dist\iso-iec\11179\-3\ed-4\20260714-full
   node util/owlapi-reference/run-import-closure-contract.mjs --root ..\universal-ontology\dist\universal\reference-data\20260714 --catalog ..\universal-ontology\reference-data\catalog-v001.xml --verify-output ..\universal-ontology\dist\universal\reference-data\20260714-full
   node util/owlapi-reference/run-import-closure-contract.mjs --root ..\universal-ontology\dist\universal\core\20260714 --catalog ..\universal-ontology\core\catalog-v001.xml --verify-output ..\universal-ontology\dist\universal\core\20260714-full
   node util/owlapi-reference/run-import-closure-contract.mjs --root ..\universal-ontology\dist\universal\extended\20260714 --catalog ..\universal-ontology\extended\catalog-v001.xml --verify-output ..\universal-ontology\dist\universal\extended\20260714-full
   ```

   If a named build artefact does not yet exist, record the prerequisite as unmet; do not substitute a different file and call the oracle complete.

7. Run:

   ```powershell
   npm test -- --runInBand util/owlapi-reference/run-import-closure-contract.test.js
   npm run lint:files -- util/owlapi-reference/run-import-closure-contract.mjs util/owlapi-reference/run-import-closure-contract.test.js
   ```

8. Request a checkpoint with the Java revision and four real-family results. The synthetic fixture alone is not the final acceptance oracle.

### Task 15: Qualify and document the exact `owlapi@0.2.0` release

**Files**

- Modify: `docs/compatibility/capabilities.json`
- Modify/regenerate: `docs/compatibility/java-api-surface.json`
- Modify/regenerate: `docs/compatibility/java-api-surface.md`
- Modify/regenerate: `API.md`
- Modify: `docs/compatibility/standalone-import-closure-prerequisites.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `index.js`
- Modify with explicit version/configuration approval: `package.json`, `package-lock.json`
- Review and, only with workflow/configuration approval, modify: `scripts/release-gate-catalogue.mjs`, `scripts/generate-release-gate-registry.mjs`, `scripts/verify-release-gates.mjs`, `scripts/verify-release-gates.test.js`, `docs/release/gates.json`, `scripts/workflow-governance.mjs`, `scripts/workflow-governance.test.js`, `.github/workflows/release.yml`

**Steps**

1. Check the public registry and accepted repository release history before changing versions. If exact `0.2.0` is occupied, yanked, or incompatible with this contract, stop and coordinate an amendment to the Universal Ontology Markdown and JSON contracts. Do not choose `0.3.0`, a prerelease, a range, Git dependency, tarball, or workspace link silently.
2. Once all prior tasks are green, change the eight capability rows to `status: "REQUIRED_V1"`, `progress: "COMPLETE"`, and `phase: 21`, and set the matrix's global release to exact `0.2.0`. Do not mark a capability complete based solely on source-tree tests.
3. Regenerate Java API surface data and confirm every new binding has one canonical public module, an exact Java authority, documented supported members, and explicit omitted overloads. Confirm the concrete storer classes remain non-public.
4. Extend the release-gate catalogue/generator/verifier so Phase 21 requirements are derived from this canonical plan in addition to the predecessor plan. Add explicit gate IDs for the eight-capability matrix, installed import-closure composition, both storage round trips, strict RDF completeness, the mandated RDF/XML failure, and the pinned Java/real-consumer evidence. Regenerate `docs/release/gates.json`; do not hand-edit generated rows. If `.github/workflows/release.yml` needs a new job or step to produce one of those results, request exact workflow approval and update the workflow-governance assertions in the same change.
5. Update user documentation with the exact public imports, the composition recipe from Task 13, typed failures, deterministic offline-verification expectations, and the RDF/XML representability limitation. Replace the obsolete umbrella-storer comments in `index.js` with the precise implemented/deferred boundary.
6. Request explicit approval, then set package and lockfile versions to exact `0.2.0` and the production `latest` channel selected by the post-`0.1.x` workflow metadata. Preserve the export allowlist and inspect the tarball so no tests, fixtures, Java utilities, benchmarks, or release-evidence utilities ship.
7. Run source, generated-document, packaging, installed-candidate, browser, and real-consumer gates:

   Use fresh, previously absent `0.2.0` qualification paths:

   ```powershell
   npm test -- --runInBand
   npm run lint
   npm run format:check
   node util/generate-java-api-surface.mjs
   npm run test:boundary
   npm run release:lint-package
   npm run release:pack -- --output .release/0.2.0-qualification-candidate
   npm run candidate:portable -- --candidate .release/0.2.0-qualification-candidate --output .release/0.2.0-portability.json
   npm run browser:prepare -- --candidate .release/0.2.0-qualification-candidate --output .release/0.2.0-browser
   npm run test:browser -- --fixture-root .release/0.2.0-browser
   npm run test:webvowl-consumer -- --candidate-dir .release/0.2.0-qualification-candidate --webvowl-repository ../webvowl --output .release/0.2.0-webvowl
   npm run verify:release-gates
   npm run qualify:release -- --candidate .release/0.2.0-qualification-candidate --output .release/0.2.0-publication-preflight.json
   ```

8. Inspect the downloaded candidate in a clean temporary directory. Require exact version `0.2.0`, only approved exports, zero source-tree resolution, zero network during closure/reload tests, both storage formats, and the mandated RDF/XML failure.
9. Run the four Java commands in Task 14 against artefacts produced by the exact candidate and run Universal Ontology's own contract suite against that installed candidate from an isolated qualification directory. Do not edit Universal Ontology's package manifest, lockfile, or checked-in build artefacts during package qualification.
10. Record provenance, source tag, tarball digest, registry integrity, runtime versions, and all gate results through the existing release-evidence workflow.
11. Stop and request authorization for the exact release-candidate commit. If approved, load the repository's commit workflow, stage only the reviewed programme files, create the authorized signed commit, and rerun tag preflight against that immutable commit.
12. Request separate authorization before a tag, push, GitHub release, npm publication, or dist-tag mutation. If authorized, dispatch the existing `.github/workflows/release.yml` at the accepted protected-`main` commit and follow its retained-candidate and human-handoff process. Do not invoke its internal release scripts ad hoc. Require the workflow's `required`, `publication_preflight`, `tag_accepted`, `draft_release`, and `npm_release` jobs in their governed order.
13. Require that same workflow's `registry_verification`, `release_evidence`, `finalize_release`, and `immutable_verification` jobs. From their fresh registry cache, require `npm view owlapi@0.2.0` and an exact clean install to resolve the recorded integrity. A successful local tarball is not a substitute for this public-registry gate.
14. Stop before changing Universal Ontology's manifest or lockfile. That dependency cutover belongs to its canonical consumer plan and requires its own configuration approval.

---

## 6. Requirement-to-task traceability

| Universal Ontology requirement                       | Primary tasks  | Acceptance evidence                                                        |
| ---------------------------------------------------- | -------------- | -------------------------------------------------------------------------- |
| Resolve and retain a cyclic/duplicate import graph   | 2–3            | Transaction rollback, alias, diamond, cycle, and zero-loader closure tests |
| Closure structural set union                         | 4, 6, 13       | Provider/merger tests and exact public composition fixture                 |
| Root full ID and root-only annotations               | 5, 13          | Atomic change tests plus collapsed postconditions                          |
| Empty output imports                                 | 6, 13          | Merger omission and offline closure-cardinality-one assertions             |
| Anonymous sharing and standardization apart          | 6, 8, 13–14    | Source-scope fixture and bijective JS/Java comparison                      |
| Fatal missing/ambiguous/unsupported/unconsumed input | 2, 10, 13      | Typed loader failures and strict complete-consumption suite                |
| Functional Syntax lossless storage                   | 7–9, 13        | Exhaustive fresh-manager strict round trip through `saveOntology`          |
| RDF/XML lossless-or-fail storage                     | 7–8, 11–13     | Dataset isomorphism, structural validation, required non-injective failure |
| Fresh offline reload with zero loader calls          | 9, 12–13       | Throwing/counting-loader tests for both formats                            |
| Public Java-shaped entry points only                 | 1, 5–7, 13, 15 | API registry, installed-package boundary, and browser consumers            |
| No library-owned materialization policy              | 3, 6, 13       | Public surface inventory and consumer-owned composition code               |
| Pinned Java acceptance oracle                        | 8, 14–15       | Synthetic plus four real Universal Ontology family comparisons             |
| Exact public `owlapi@0.2.0`                          | 1, 15          | Registry/history check and clean installed-candidate evidence              |

## 7. Completion gate

This programme is complete only when all of the following are simultaneously true:

- the eight capability rows are complete and backed by generated compatibility evidence;
- manager closure queries use retained resolved edges and make no loader calls;
- every manager mutation is validated and atomic, including identity aliases;
- `owlapi/util` contains exactly the approved Java-shaped bindings and the tarball contains no development utilities;
- both storers are selected exclusively through `saveOntology` and leave targets unchanged on failure;
- Functional Syntax passes the exhaustive structural round trip;
- RDF/XML passes the exhaustive representable round trip and rejects the mandated non-injective case;
- strict RDF reconstruction fails on every unconsumed selected-graph statement;
- source-tree, packed-installed, import-map, bundler, dedicated-worker, and WebVOWL tests pass;
- the Universal Ontology public composition produces root identity, root-only annotations, no imports, and the exact closure axiom union;
- anonymous individuals compare under one bijection without losing within-source sharing or cross-source separation;
- the pinned Java oracle agrees for all four real Universal Ontology families;
- the clean installed candidate and the fresh-cache public-registry install are exact `owlapi@0.2.0` with matching integrity;
- all authorized release evidence and immutable-registry verification are recorded; and
- no commit, tag, GitHub release, npm publication, dist-tag mutation, or consumer lockfile change occurs without its distinct explicit authorization.

## 8. Execution handoff

Execute in order. Tasks 2–5 establish state semantics; Task 6 depends on them. Task 7 establishes the storage protocol; Tasks 8–12 establish lossless serializers. Task 13 is the public acceptance slice, Task 14 supplies independent Java evidence, and Task 15 alone qualifies the exact release.

At every task, follow red → green → refactor: add the focused failing test, run it and confirm the intended failure, implement the minimum coherent behaviour, rerun the focused test, then run the listed regression boundary. Do not combine tasks to bypass a failing intermediate contract.

The first execution decision is whether the production `0.1.x` starting checkpoint has been accepted. If it has not, leave all capability work deferred. If it has, begin Task 1 and request the documented checkpoint before moving to manager-state changes.
