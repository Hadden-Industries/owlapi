# Standalone Import-Closure Consumer Prerequisites

## Purpose

`universal-ontology` needs to publish a root ontology as one standalone ontology after loading its complete imports closure.
This note records only the Java-OWLAPI-compatible public capabilities that `owlapi` must provide for that consumer.
It does not define the application materialization policy and it is not a second copy of the consumer contract.

The canonical consumer artifacts are:

- [normative output contract](https://github.com/Hadden-Industries/universal-ontology/blob/main/docs/specs/2026-08-22-self-contained-owl-import-closure-contract.md)
- [task-by-task implementation plan](https://github.com/Hadden-Industries/universal-ontology/blob/main/docs/plans/2026-08-22-self-contained-owl-import-closure.md)
- [machine-readable policy](https://github.com/Hadden-Industries/universal-ontology/blob/main/docs/import-closure/contract.v1.json)

## Delivery sequencing

The capability slice originated on `feature/ontology-import-closure-lifecycle` and is included in the selected first public `@hadden-industries/owlapi@0.1.0-rc.1` under `next`.
The owner approved first-release integration on 2026-09-28 and scoped publication with UO RC production eligibility in the [current amendment](../plans/scoped-npm-publication.md).
The target coordinate is not evidence of publication or acceptance.
UO may use this exact RC in production after artifact verification and complete consumer acceptance; it need not wait for `0.1.0`.
Lifecycle capabilities remain `DEFERRED` / `NOT_STARTED` until their formal qualification gates pass.

Build `StringDocumentTarget`, the storage-error hierarchy, and their decision ledger once under the canonical Phase 21 plan on this feature branch.
Then proceed with all dependency-ready lifecycle work, including provisional consumer experiments.
Use those same canonical bindings throughout; no temporary target, error class, alias, or fabricated accepted WebVOWL/release evidence is permitted.

The reviewed lifecycle task commits are merged into a branch containing the pinned `main` integration baseline, preserving their original commit identities.
Phase 21 must complete before Phase 22 release acceptance; neither requires an earlier public `0.1.0` release.
Record the baseline commit and API-registry digest.
All affected tests, generated API views, installed-package checks, and consumer checks are rerun against that accepted baseline.
Conflicts are resolved in the canonical implementation; no shim, forwarding module, compatibility alias, duplicate binding, or fallback export is permitted.
A bounded amount of alignment rework is expected.
A material public-contract difference instead requires a reviewed plan and compatibility-ledger amendment.

Only the reconciled branch may complete the lifecycle rows or qualify exact `@hadden-industries/owlapi@0.1.0-rc.1`.
Pre-integration evidence is development evidence and is never copied forward as release evidence.

## Package identity and qualification handoff

UO declares `"owlapi": "npm:@hadden-industries/owlapi@0.1.0-rc.1"` in `devDependencies` and retains its five `owlapi/*` namespace imports.
The installed package and registry evidence must identify the real scoped name, exact version and verified integrity; the package also has a sixth entry point, its root aggregate.
Native npm dependency aliasing is permitted and does not create an API shim or rewrite transitive/peer dependencies.
Preserve the source repository and Java package mappings.

Qualify the retained scoped artifact and complete the upstream lifecycle gates before publication, then verify the actual public registry artifact before UO's remote-fetch and full consumer acceptance run.
The existing source/local-tarball harness is not public-registry proof; add the isolated registry mode described in the scoped-publication plan.
Record source commit/tag, tarball digest, registry integrity, API evidence, UO revision/input hashes and actual results.
A later RC or stable version requires a new exact pin and requalification.
Do not implement migration to the bare package name in this work.

## Compatibility boundary

`owlapi` must not export `materializeImportClosure`, `collapseImports`, `collapseImportsClosure`, or an equivalent project-invented operation.
Materializing a distribution artifact is private `universal-ontology` process logic.

A public capability added for this workflow must correspond to a public Java OWLAPI capability, keep the same responsibility, and have focused Java-parity tests.
Java streams map to JavaScript iterables, and Java overloads map to the repository's approved JavaScript argument conventions.
A helper with no upstream public counterpart remains private to the consumer.

Except for the package-root aggregate (consumer alias `owlapi`), every public npm subpath must be the exact slash-form of an approved `org.semanticweb.owlapi` package and must have a Public API Surface Registry entry.
Public Java-compatible bindings have one canonical definition in that Java-shaped namespace; private loading, mapping and storage engines use cohesive non-mirrored `internal/` ownership.

No shim, forwarding module, deprecated alias, copied source tree, or nominal unimplemented class is permitted.

## Required Java-compatible capability slice

| `owlapi` capability                                     | Java OWLAPI authority                               | Library responsibility                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `OWLOntologyManager.importsClosure(ontology)`           | `OWLOntologyManager#importsClosure`                 | Return a cycle-safe iterable closure that includes the managed root.                                              |
| `OWLOntologyManager.getImportsClosure(ontology)`        | `OWLOntologyManager#getImportsClosure`              | Return a defensive `Set` copy of that closure.                                                                    |
| `OWLOntologyImportsClosureSetProvider`                  | Same Java utility class                             | Supply the chosen root's manager-owned closure.                                                                   |
| `OWLOntologyMerger`                                     | Same Java utility class                             | Copy direct axioms from a supplied ontology set; do not invent application metadata policy.                       |
| `OWLOntologyManager.addAxiom(s)` and change application | `HasAddAxioms`, `OWLOntologyManager#applyChange(s)` | Apply supported changes to managed ontologies while maintaining manager indexes.                                  |
| `SetOntologyID`                                         | Same Java change class                              | Replace the full ontology ID and reject identity collisions.                                                      |
| `AddOntologyAnnotation`                                 | Same Java change class                              | Add one structurally unique ontology annotation.                                                                  |
| `StringDocumentTarget`                                  | Same Java target class                              | Retain complete Unicode text, read through `toString()` after atomic replacement.                                 |
| `OWLOntologyManager.saveOntology`                       | Same Java manager method                            | Select an exact registered storer and surface typed storage errors.                                               |
| Functional Syntax storage behavior                      | `FunctionalSyntaxStorer`                            | Serialize the supported OWL structural model losslessly through exact format selection.                           |
| RDF/XML storage behavior                                | `RDFXMLStorer`                                      | Apply OWL-to-RDF mapping and serialize standards-conforming RDF/XML, failing when representation is not lossless. |

The corresponding capability-matrix rows are:

```text
manager.imports-closure-query
ontology.change-required-surface
util.imports-closure-set-provider
util.ontology-merger
manager.save-ontology
storer.functional
storer.rdfxml
rdf.strict-complete-reconstruction
```

The consumer contract requires both storage behaviors through `OWLOntologyManager.saveOntology`; it does not require direct construction of either concrete storer.
Directly exposing `FunctionalSyntaxStorer` or `RDFXMLStorer` is a separate registry decision.
If approved, their only permitted canonical specifiers are respectively `owlapi/functional/renderer` and `owlapi/rdf/rdfxml/renderer`, matching the exact Java packages.
Their private engines remain under `internal/storage/functional/` and `internal/storage/rdfxml/`; no mirrored internal Java-package tree is created.

## Consumer composition

The consumer may compose those standard capabilities as follows without adding a library-level convenience API:

```text
manager.getImportsClosure(root)
  → OWLOntologyImportsClosureSetProvider
  → OWLOntologyMerger(false)
  → SetOntologyID
  → AddOntologyAnnotation
  → manager.saveOntology(format, target)
```

What the consumer preserves, drops, resolves, verifies, or publishes is governed exclusively by the canonical `universal-ontology` contract.
In particular, this note does not define ontology-annotation attribution, network policy, output format policy, sidecar policy, or atomic publication behavior.
