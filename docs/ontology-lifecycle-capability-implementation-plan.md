# `owlapi` Ontology-Lifecycle Capability Implementation Plan

> **Status:** Deferred zero-major feature programme; implementation begins only
> after the extraction-and-publication plan has completed with a verified
> public `owlapi@0.1.0` production release, or the exact corrective/contingency
> patch recorded by that plan.<br>
> **Predecessor:** `docs/owlapi-js/implementation-plan.md`.<br>
> **Starting checkpoint:** The canonical `Hadden-Industries/owlapi` repository
> is the sole maintained package source, npm `latest` resolves to the accepted
> `owlapi@0.1.0` artefact—or only its recorded same-surface patch—and WebVOWL
> consumes that exact registry package.<br>
> **Expected release target:** the next available zero-major feature line,
> normally `owlapi@0.2.0`; an intervening incompatible correction may consume
> that coordinate and mechanically advances this programme to the next
> available `0.minor.0` rather than causing unrelated work to be combined.<br>
> **Goal:** Add the coherent Java-OWLAPI-compatible imports-closure, mutation,
> merger, and ontology-storage capability slice without retroactively delaying
> or broadening the production-ready `0.1.x` release.

---

## 1. Responsibility and ownership

This document owns the first deferred semantic feature programme after
`owlapi@0.1.x`. Its deliverable is exclusively the coherent lifecycle slice in
§§3–8. Section 9 records a non-authorizing exploration possibility concerning
TypeScript consumer ergonomics; it is not part of this programme, is not an
implementation backlog item, reserves no package version, and cannot be added
opportunistically. The predecessor plan owns extraction, packaging,
publication, WebVOWL's managed npm dependency, and the first production
release; it is complete before this plan starts.

The maintained copy of this plan moves with the package-owned documentation to
the canonical `Hadden-Industries/owlapi` repository during extraction. The
WebVOWL repository does not retain a second normative copy after handoff.

This plan begins with the complete, tested source present at the accepted
`0.1.x` production tag. It does not reopen parser migration, legacy WebVOWL wiring,
package-name selection, licensing, provenance dispositions, or the five-entry
`0.1.x` export map. It inherits the predecessor plan's Public API Surface
Registry, Java-backed npm-subpath rule and two-zone source architecture:
public Java-compatible bindings have one canonical definition in their exact
Java-shaped namespace, while private engines remain in cohesive, non-mirrored
`internal/` ownership.

## 2. Normative inputs

Implementation must reconcile all of the following at the starting checkpoint:

- the accepted `owlapi@0.1.x` public API and capability inventory;
- `docs/compatibility/java-api-surface.json` and its generated or mechanically
  checked Java compatibility/gap view;
- `docs/compatibility/standalone-import-closure-prerequisites.md` after its
  canonical-repository handoff;
- the package capability matrix and Java-compatibility evidence;
- the W3C OWL 2 structural and OWL↔RDF mapping specifications;
- the pinned Java OWLAPI behavioural oracle and public API documentation; and
- the external `universal-ontology` materialization contract, which remains
  authoritative only for application policy and is not copied into `owlapi`.

The canonical consumer artefacts currently referenced by the prerequisite note
are:

- `https://github.com/Hadden-Industries/universal-ontology/blob/main/docs/specs/2026-08-22-self-contained-owl-import-closure-contract.md`;
- `https://github.com/Hadden-Industries/universal-ontology/blob/main/docs/plans/2026-08-22-self-contained-owl-import-closure.md`; and
- `https://github.com/Hadden-Industries/universal-ontology/blob/main/docs/import-closure/contract.v1.json`.

## 3. Capability boundary

The programme promotes this complete slice together:

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

The first reviewed change must classify those exact IDs in the canonical
capability matrix and Public API Surface Registry, with their Java OWLAPI
authorities, supported behaviour, exclusions, progress, exposure, compatibility,
canonical source module, public entry point where applicable, and focused
verification. The former umbrella concrete-storer entry must be refined so it
does not contradict the two specifically selected storers.

The library supplies general OWLAPI-compatible building blocks. It does not
export any of the following application operations:

```text
materializeImportClosure
collapseImports
collapseImportsClosure
application attribution or ontology-annotation policy
catalog, network, output-format, sidecar, or publication policy
atomic distribution-artifact publication
```

Those responsibilities remain in `universal-ontology` or another consumer.

TypeScript source, compiler-driven development, and official declaration files
are outside this semantic slice. Section 9 merely records what a future
research question would need to examine if the repository owner ever asks for
that exploration; it does not authorize implementation or publication.

## 4. Public API placement

The accepted `0.1.x` public entry points remain valid. New exports are additive
and follow the same registry-governed Java boundary. Except for the inherited
bare `owlapi` aggregate, a new npm subpath is permitted only when it is the exact
slash-form of an existing package beneath `org.semanticweb.owlapi`; existence of
the Java package remains necessary but does not itself approve exposure.

| Capability                                                     | Public location                                                               | Java OWLAPI relationship                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Manager closure queries, change application, and saving        | `owlapi/model` and the root convenience facade where approved by the registry | Methods and model/change types corresponding to `org.semanticweb.owlapi.model`                                    |
| `StringDocumentTarget` and storage diagnostics                 | `owlapi/io`                                                                   | Corresponds to `org.semanticweb.owlapi.io`                                                                        |
| Functional Syntax and RDF/XML format identities                | `owlapi/formats`                                                              | Corresponds to `org.semanticweb.owlapi.formats`                                                                   |
| `OWLOntologyImportsClosureSetProvider` and `OWLOntologyMerger` | new explicit `owlapi/util` entry point                                        | Corresponds to `org.semanticweb.owlapi.util`; adding this subpath is part of the expected `0.2.0` feature release |

RDF reconstruction and OWL→RDF mapping remain internal semantic engines. The
RDF/XML storer composes the internal `OwlToRdfTranslator` with a
standards-conforming private RDF/XML storage engine. Neither that composition nor
the presence of Java implementation classes automatically creates an
`owlapi/rdf` entry point. A direct RDF/JS dataset API requires its own future use
case and cannot create a core subpath without a corresponding Java package.

Direct constructor exposure for `FunctionalSyntaxStorer` or `RDFXMLStorer` is a
separate public-API decision from supporting `manager.saveOntology`. The
`universal-ontology` composition in §5.7 requires the manager operation, format
identity and document target; it does not by itself require either concrete
constructor. Until the registry expressly promotes one, its implementation is
`INTERNAL_ONLY`. If direct exposure is separately approved, the only permitted
canonical subpaths are the exact Java package mappings:

```text
org.semanticweb.owlapi.functional.renderer
  → owlapi/functional/renderer

org.semanticweb.owlapi.rdf.rdfxml.renderer
  → owlapi/rdf/rdfxml/renderer
```

That deep RDF/XML specifier does not make `owlapi/rdf` or
`owlapi/rdf/rdfxml` importable. Its public compatibility class would live in
`rdf/rdfxml/renderer/` and delegate to the existing private engine under
`internal/storage/rdfxml/`; no mirrored
`internal/rdf/rdfxml/renderer/` tree or engine relocation is required. The same
rule places a promoted Functional Syntax compatibility class in
`functional/renderer/` while retaining its private engine under
`internal/storage/functional/`.

Every proposed public binding must be added to the Public API Surface Registry
with its capability status, progress, exposure, Java relationship,
compatibility, canonical source module and verification. A `JS_EXTENSION` may
live only in an already registered Java-backed namespace and cannot authorize a
new npm subpath. Internal translators, parser adapters, registries, RDF/JS
factory wiring, graph-selection helpers and storage engines remain
`INTERNAL_ONLY`.

## 5. Delivery sequence

The entire slice is one feature-release programme because closure
materialization is not useful or safely testable through nominal, disconnected
classes. Each task has its own review checkpoint, but no partially implemented
surface is published as a production release.

### 5.1 Imports-closure queries

**Production files:** the canonical public `model/owlOntologyManager.js` (or the
registry-recorded cohesive model module that owns the binding), related public
model types, and focused private helpers under `internal/loading/`. Do not
recreate the staging `manager/` bucket.

**Tests:** focused manager unit/integration tests and Java behavioural fixtures.

Implement:

```javascript
manager.importsClosure(ontology); // cycle-safe iterable including the root
manager.getImportsClosure(ontology); // defensive Set copy
```

Both operations reject an ontology not owned by that manager. They preserve
the distinction between direct ontology axioms and imported axioms and do not
cache mutable caller-owned collections.

Completion requires tests for an unimported root, a transitive closure, a
cycle, a diamond import graph, duplicate imports, missing-import diagnostics,
and a foreign-manager ontology.

### 5.2 Closure provider and merger

**Production files:** create the canonical public `util/` modules and explicit
`util/index.js` facade corresponding to `org.semanticweb.owlapi.util`; do not
duplicate them beneath `internal/util/` or place application materialization
policy in the manager.

**Tests:** utility unit tests, public-export tests, and real composition tests.

Implement Java-compatible equivalents of:

```javascript
new OWLOntologyImportsClosureSetProvider(manager, rootOntology);
new OWLOntologyMerger(ontologySetProvider, mergeOnlyLogicalAxioms?);
```

The provider supplies the manager-owned closure. The merger copies direct
axioms from the supplied ontology set into a destination managed by the caller;
it does not choose a destination IRI, rewrite imports, invent attribution, or
apply publication policy.

Completion requires deterministic structural results for cycles, overlapping
axioms, annotations, declarations, logical-only selection, and empty/singleton
sets.

### 5.3 Manager-owned changes

**Production files:** public model/change definitions under `model/`, the
canonical `OWLOntologyManager` owner, any focused private transactional/index
helpers under `internal/`, and explicit `model/index.js` exports.

**Tests:** failing-first tests for each change and for transaction failure.

Implement the minimum Java-compatible change surface required by the consumer:

```text
OWLOntologyManager.applyChange / applyChanges
OWLOntologyManager.addAxiom / addAxioms
SetOntologyID
AddOntologyAnnotation
```

Change application maintains structural uniqueness, ontology indexes, manager
ownership, and ontology-ID lookup atomically. An ontology-ID collision or an
invalid change leaves every affected ontology and manager index unchanged.

Completion requires duplicate-axiom, batch ordering, foreign-ontology,
ontology-ID collision, annotation uniqueness, index integrity, and failed-batch
rollback coverage.

### 5.4 Storage contracts and `StringDocumentTarget`

**Production files:** public model-level storer contracts and manager selection
under `model/`, public target/errors under `io/`, public format identities under
`formats/`, private storer registration/selection under `internal/storage/`, and
explicit namespace facades. Do not create a generic public or private `storer/`
bucket that obscures those owners.

**Tests:** exact storer-selection, target, and typed-failure tests.

Implement:

```text
StringDocumentTarget
registered storer identity/factory contract
OWLOntologyManager.saveOntology
typed unsupported-format and storage failures
```

Saving has no ambient file-system or network authority. The selected format is
explicit, and the manager fails rather than silently choosing a different
storer. `StringDocumentTarget` captures the complete produced text and exposes
it through its documented JavaScript-native accessor.

### 5.5 Functional Syntax storer

Implement a deterministic Functional Syntax engine under
`internal/storage/functional/` over the complete supported structural model.
Serialization order is a documented deterministic projection for
reproducibility, not part of OWL structural equality. If the separately reviewed
registry decision exposes `FunctionalSyntaxStorer` directly, add its sole
canonical public compatibility definition and facade under
`functional/renderer/`; the private engine remains in place.

Completion requires focused coverage for every supported structural kind,
annotations, ontology identity/imports, escaping, prefixes where supported,
anonymous individuals, unsupported constructs, deterministic repetition, and
parse→store→parse structural equivalence.

### 5.6 Strict RDF reconstruction and RDF/XML storer

First close any strict RDF reconstruction gaps that prevent lossless round
trips for the supported model. Unsupported or lossy cases produce typed errors;
the implementation does not silently omit axioms or annotations.

Then implement RDF/XML storage as:

```text
OWLOntology
  → internal OwlToRdfTranslator
  → RDF/JS DatasetCore<Quad>
  → standards-conforming RDF/XML serializer
  → selected document target
```

The translator remains syntax-independent and internal. RDF/XML serialization
does not become an internal interchange format for other parsers or storers.
The private serializer belongs under `internal/storage/rdfxml/`. If the
separately reviewed registry decision exposes `RDFXMLStorer` directly, add its
sole canonical public compatibility definition and facade under
`rdf/rdfxml/renderer/`; do not move or duplicate the private engine.

Completion requires W3C mapping evidence, dataset isomorphism, deterministic
serialization under the selected policy, XML security/escaping, blank-node
scope, annotation reification, parse→store→parse structural equivalence, and
explicit rejection of every known unsupported/lossy case.

### 5.7 Real-consumer composition

Verify that `universal-ontology` can compose only the standard public APIs:

```text
manager.getImportsClosure(root)
  → OWLOntologyImportsClosureSetProvider
  → OWLOntologyMerger
  → SetOntologyID
  → AddOntologyAnnotation
  → manager.saveOntology(format, target)
```

The integration test proves API sufficiency. It does not copy the consumer's
attribution, catalog, network, sidecar, output-format, or atomic-publication
policy into the library.

## 6. Cross-cutting verification

Every observable behaviour follows RED → GREEN → REFACTOR. The release gate
includes:

- focused Java public-API and behavioural fixtures for every new analogue;
- capability-matrix and provenance agreement;
- exhaustive structural dispatch after any model-kind change;
- cyclic/transitive closure and defensive-collection tests;
- transactional mutation and manager-index integrity tests;
- exact storer registration and typed failure tests;
- W3C OWL↔RDF mapping and RDF dataset-isomorphism tests;
- Functional Syntax and RDF/XML structural round trips;
- browser and supported-Node execution;
- finite resource, cancellation, XML security, and network-authority tests;
- installed-package tests through only the declared public entry points;
- negative tests for internal translator/parser/RDF-factory deep imports; and
- Public API Surface Registry tests proving every new subpath has an exact Java
  package mapping, every new binding has one canonical definition, registry and
  capability statuses agree, and no mirrored internal public tree was created;
- real-consumer composition without private imports or package aliases.

No differential expectation is accepted merely because Java serialization text
differs. Compare structural OWL objects or RDF dataset isomorphism unless the
test specifically verifies serializer syntax.

## 7. Documentation and compatibility obligations

The feature release must update, in the same reviewed programme:

- the Public API Surface Registry, capability matrix and generated Java
  compatibility/gap view;
- Java-to-JavaScript API mapping and paired examples;
- the README's supported and unsupported capability lists;
- public API reference material;
- change log and release notes;
- provenance and third-party notices for any new serializer dependency;
- security/resource documentation; and
- the migration playbook and lesson record for genuinely reusable findings.

The documentation continues to describe `owlapi` as a JavaScript-native,
behaviourally compatible subset for declared Java OWLAPI capabilities—not as a
complete source-compatible or binary-compatible port.

## 8. Release and completion gate

The complete accepted slice is released at the next available zero-major
feature coordinate, expected to be `owlapi@0.2.0`. Under the project's
disciplined initial-development policy, `0.1.x` patches restore the documented
`0.1` contract, while this substantial additive lifecycle surface advances the
minor component and requires deliberate consumer adoption. If an intervening
incompatible correction has already consumed `0.2.0`, the release-preparation
decision records the next available `0.minor.0`; the programme does not combine
unrelated work merely to preserve a planned number. Pre-release coordinates may
be used under the repository's approved release policy, but no partial surface
receives `latest`.

This plan completes only when:

- all eight capability rows and every new public symbol are accepted;
- every affected Java package/type row has a complete registry disposition,
  canonical source-module mapping and verification hook, with zero unclassified
  rows in the release inventory;
- all implementation and cross-cutting verification gates are green;
- the installed selected feature artefact—normally `0.2.0`, or the recorded
  next available zero-minor—exposes the approved additive entry points and
  rejects internal deep imports;
- every added public subpath exactly maps an approved Java package, every public
  binding has one definition in that Java-shaped namespace, and private storage,
  mapping and loading engines remain in cohesive non-mirrored `internal/`
  ownership;
- `universal-ontology` composes the standard APIs without a private helper;
- npm metadata, provenance, source tag, tarball digest, and registry integrity
  are recorded; and
- existing WebVOWL ingestion remains green against the released compatible
  package.

Pause at each task checkpoint and again before any external publication so the
changes can be reviewed and committed under the repository's normal controls.

## 9. Optional future exploration: TypeScript consumer ergonomics

This implementation plan has **no TypeScript deliverable**. The package remains
native ESM JavaScript and this programme does not add TypeScript source,
`tsc`/`checkJs`, type-bearing JSDoc as a shadow type system, `.d.ts` files,
`types`/`typings` metadata, an `@types/owlapi` package, TypeDoc, declaration-test
tooling, or TypeScript configuration. No package coordinate is assigned or
reserved for any of those things.

If demonstrated external demand later makes TypeScript consumer ergonomics
worth investigating, the repository owner may authorize a separate,
non-implementing research exercise. That exploration could compare handwritten
declarations, declarations derived from the existing JavaScript documentation,
and community-maintained external typings; examine how any candidate would stay
reconciled with the Public API Surface Registry and every public package
specifier; and identify compiler, package-metadata, maintenance, compatibility,
and semver risks. Its output would be options and a recommendation—not source,
configuration, declarations, a release promise, or permission to implement.

Any later decision to ship official declarations would require a new explicit
architecture decision, configuration approval, implementation plan, and version
decision based on the then-current public lineage. Nothing in this section
places that work in the roadmap or permits it to share this lifecycle release.
