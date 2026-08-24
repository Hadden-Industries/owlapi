# Standalone Import-Closure Consumer Prerequisites

## Purpose

`universal-ontology` needs to publish a root ontology as one standalone ontology after loading its complete imports closure. This note records only the Java-OWLAPI-compatible public capabilities that `owlapi` must provide for that consumer. It does not define the application materialization policy and it is not a second copy of the consumer contract.

The canonical consumer artifacts are:

- [normative output contract](https://github.com/Hadden-Industries/universal-ontology/blob/main/docs/specs/2026-08-22-self-contained-owl-import-closure-contract.md)
- [task-by-task implementation plan](https://github.com/Hadden-Industries/universal-ontology/blob/main/docs/plans/2026-08-22-self-contained-owl-import-closure.md)
- [machine-readable policy](https://github.com/Hadden-Industries/universal-ontology/blob/main/docs/import-closure/contract.v1.json)

## Compatibility boundary

`owlapi` must not export `materializeImportClosure`, `collapseImports`, `collapseImportsClosure`, or an equivalent project-invented operation. Materializing a distribution artifact is private `universal-ontology` process logic.

A public capability added for this workflow must correspond to a public Java OWLAPI capability, keep the same responsibility, and have focused Java-parity tests. Java streams map to JavaScript iterables, and Java overloads map to the repository's approved JavaScript argument conventions. A helper with no upstream public counterpart remains private to the consumer.

Except for the bare `owlapi` aggregate, every public npm subpath must be the
exact slash-form of an approved `org.semanticweb.owlapi` package and must have a
Public API Surface Registry entry. Public Java-compatible bindings have one
canonical definition in that Java-shaped namespace; private loading, mapping
and storage engines use cohesive non-mirrored `internal/` ownership.

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
| `StringDocumentTarget`                                  | Same Java target class                              | Capture stored UTF-8 text.                                                                                        |
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

The consumer contract requires both storage behaviors through
`OWLOntologyManager.saveOntology`; it does not require direct construction of
either concrete storer. Directly exposing `FunctionalSyntaxStorer` or
`RDFXMLStorer` is a separate registry decision. If approved, their only
permitted canonical specifiers are respectively
`owlapi/functional/renderer` and `owlapi/rdf/rdfxml/renderer`, matching the
exact Java packages. Their private engines remain under
`internal/storage/functional/` and `internal/storage/rdfxml/`; no mirrored
internal Java-package tree is created.

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

What the consumer preserves, drops, resolves, verifies, or publishes is governed exclusively by the canonical `universal-ontology` contract. In particular, this note does not define ontology-annotation attribution, network policy, output format policy, sidecar policy, or atomic publication behavior.
