# Phase 5 learning record: canonical RDF ingestion and RDF-to-OWL

## Migration identity

- Migration: Phase 5 - canonical RDF ingestion and shared RDF-to-OWL
  reconstruction.
- Baseline revision:
  `ddd7af080efaf828653c83c9e18afe699f16510a`
  (the repository-owner Phase 4 checkpoint).
- Completion revision: the Phase 5 checkpoint commit containing this record;
  the repository owner requested an uncommitted review pause before assigning
  its commit ID.
- Implementation date: 13 August 2026.
- Next migration: Phase 6 - RDF/XML and first-real-adapter hardening.

## Implemented scope

Phase 5 adds the syntax-independent RDF ingestion core without registering or
activating a concrete RDF syntax parser. Its public async
`RdfToOwlTranslator.translate(dataset, options)` boundary accepts only an
RDF/JS `DatasetCore<Quad>` and returns a frozen structural ontology plus a
frozen translation context. The completed scope includes:

- the full finite reverse-mapping inventory for W3C OWL 2 Mapping to RDF
  Graphs Tables 4 through 18, including OWL 1 DL compatibility rules;
- ontology identity/version, imports, ontology annotations, direct and nested
  annotations, declarations, every required class/data/property expression,
  all structural axiom families, keys, positive/negative assertions, n-ary
  structures, and axiom annotation reification;
- an explicit graph-selection boundary for default, single named, selected,
  merged, ambiguous, and blank-node-named graphs, with graph-loss diagnostics;
- iterative RDF list reconstruction with exact arity, unique-node, cycle,
  shared-tail, length, and terminal checks;
- category exclusivity for class/data ranges and object/data/annotation
  properties, plus typed rejection of duplicate or conflicting shapes;
- value-space handling for non-negative integer cardinalities across supported
  XSD integer-derived, decimal, float, and double literals;
- strict rejection of unconsumed OWL-significant triples, an explicit
  compatible-warning path, and deterministic rejection of RDF 1.2 triple terms
  for which OWL 2 defines no structural mapping;
- document-scoped anonymous-individual identity, standardization apart between
  translations, immutable results, finite quad/blank-node/list/depth/axiom
  budgets, monotonic timeouts, abort delivery, cooperative yielding, and
  transactional rollback; and
- independently generated W3C constructed-dataset fixtures, a project-owned
  RDF/Functional structural pair, a pinned Java OWLAPI 5.5.1 snapshot, resource
  tests, repeated wall/heap measurements, and RDF/JS browser-cost evidence.

The offline W3C fixture generator uses the already pinned
`rdfxml-streaming-parser` only to materialize immutable RDF/JS fixture data from
embedded RDF/XML in the pinned upstream manifest. The conformance runner itself
constructs `DatasetCore` values from that data and never calls an RDF syntax
parser. No RDF/XML descriptor, manager registration, adapter, stream type, or
syntax-specific rule entered production in Phase 5. No dependency version,
lockfile, build/test/lint configuration, resource ceiling, expected-difference
rule, public manager contract, or phase order changed.

## Assumptions entering the phase

1. RDF/JS datasets could provide a stable syntax-independent boundary without
   leaking parser-library terms or WebVOWL's legacy triples.
2. Dataset graph policy could execute before OWL reconstruction and remain
   independent of concrete RDF syntax.
3. The W3C reverse mapping could be represented by a finite, machine-checkable
   Tables 4-18 inventory rather than a Java-handler transliteration.
4. Existing `OWLDataFactory`, immutable structural values and ontology
   transaction semantics were deep enough for every reverse-mapped construct.
5. Constructed datasets could test semantic reconstruction independently of
   RDF/XML, Turtle, N-Triples, N-Quads, TriG, and JSON-LD syntax behavior.
6. A strict RDF-list implementation could reject malformed structure while a
   narrowly declared compatibility rule handled any proven Java/W3C fixture
   defect.
7. Cardinality parsing could be validated from lexical digits alone.
8. The Java oracle and existing Functional parser could jointly distinguish
   reference compatibility from project structural truth.
9. The foundational RDF/JS dependency and translator costs could remain under
   the existing threshold without changing budgets.

Assumptions 1-6, 8 and 9 held. Assumption 7 failed: the normative `NN_INT`
notation matches any literal whose value is a non-negative integer, and the
pinned W3C suite exercises `xsd:int`, `xsd:integer`, `xsd:byte`,
`xsd:unsignedByte`, and integer-valued `xsd:decimal` literals in addition to
`xsd:nonNegativeInteger`. The final translator evaluates supported XSD numeric
value spaces, accepts noncanonical but valid integer values, rejects strings,
fractional values, negative values and out-of-range derived datatypes, and
retains the safe-integer resource boundary.

## Acceptance evidence

The final focused RDF run passed 7 suites / 363 tests, including 313 W3C
conformance-runner tests. The governance suite passed 15 tests, and the complete
repository run passed 77 suites / 970 tests. Repository formatting, ESLint,
Stylelint, HTML validation, production build, generated-fixture audit, W3C
strict audit, benchmark runners, and browser-cost measurement are part of the
Phase 5 handoff evidence.

### Standards conformance

- Governing specification: W3C OWL 2 Web Ontology Language Mapping to RDF
  Graphs, Second Edition, reverse direction.
- Pinned source: `docs/owlapi-js/conformance/upstream/w3c-owl2/all.rdf`.
- Source SHA-256:
  `986ce4f9df655b1f44aec86a5753530d295355a8e9a16700e0253ac30759c4e1`.
- Source tests: 338, each classified exactly once.
- Required reverse-mapping tests: 233.
- Constructed RDF/JS documents executed: 312.
- Not applicable: 89 OWL Full/RDF-based cases outside the OWL 2 DL reverse
  mapping and 16 cases with no RDF document property.
- Finite semantic inventory:
  `docs/owlapi-js/conformance/rdf-to-owl-mapping.json`.

All 312 documents reconstruct successfully. Strict mode handles 310. Two
premise documents in `New-Feature-Rational-002` and
`New-Feature-Rational-003` terminate `owl:oneOf` lists at the RDF namespace IRI
instead of `rdf:nil`. Strict mode rejects both. The declared compatible run
accepts only an unstructured named-IRI terminal, emits exactly one
`RDF_LIST_NON_NIL_TERMINATOR` warning per document, and reconstructs both list
literals. The classification manifest records the defect, strict result, Java
OWLAPI 5.5.1 behavior and runner policy.

The generated fixture pins its generator identity and source hash. The runner
asserts exact equality between the 233 required manifest entries, their 312 RDF
document properties, and the 312 generated dataset records, preventing omitted,
duplicated, stale, or silently reclassified inputs.

### Java and cross-syntax differential

The Phase 5 reference set under `util/owlapi-reference/fixtures/rdf/` contains
an RDF/XML oracle input, an independently constructed dataset serialization, a
Functional counterpart, and a pinned Java structural snapshot generated with
OWLAPI 5.5.1 at revision
`d7e997a53b470e32700de89cc610d9daf01ea769`.

The JavaScript test never parses the RDF/XML file. It reconstructs directly
from the constructed dataset, parses the Functional counterpart through the
already accepted structural parser, and compares the complete structural
snapshot. It separately compares ontology identity, imports, axiom counts and
every direct signature category with the Java snapshot. These comparisons are
green and required no new expected-difference rule.

The separate `phase5-malformed-list.rdf` black-box probe confirmed that Java
OWLAPI 5.5.1 reconstructs both literals from the two malformed Rational lists.
That observation supports the exact compatible warning but does not weaken
strict list validation or authorize general recovery.

### Resource and transaction evidence

Focused tests cover `maxQuads`, `maxBlankNodes`, `maxRdfListLength`,
`maxExpressionDepth`, `maxAnnotationDepth`, `maxAxioms`, list cycles, shared
tails, malformed/nonunique list links, conflicting expression/property
categories, duplicate structural predicates, unknown OWL-significant triples,
RDF 1.2 triple terms, timeout, pre-abort, cooperative mid-translation abort,
and failed-translation rollback. The source dataset is never mutated. Result,
context and diagnostic containers are frozen, and no partially constructed
ontology escapes a failure.

Graph-policy tests cover default-only input, one named graph, explicit named
graph selection, merge, ambiguous multiple graphs, blank-node graph names, and
the diagnostic distinction between selected and discarded graph content.
Blank-node labels remain stable within one translation scope and are
standardized apart across documents.

### Performance and browser-cost evidence

Environment: Windows `10.0.26200` x64, Node.js `v24.19.0`, Intel i9-12900K,
one warm-up plus five measured runs, median aggregation, garbage collection
before each run. Dataset construction is excluded from translation timing. The
measured lockfile SHA-256 is
`dbf218f2d46d6f9d9aac0a5727afe5a1efe2fb4a349bd6719fd55106c781fa5a`.

| Fixture                             | Median wall ms | Median peak heap delta bytes |
| ----------------------------------- | -------------: | ---------------------------: |
| 50,000 declaration quads/axioms     |       1,155.98 |                  264,927,896 |
| 25,000-item RDF list / 50,002 quads |       1,320.91 |                  273,877,992 |
| 256-level expression / 257 quads    |          21.54 |                   44,263,032 |

Remeasuring all accepted Functional, Manchester and OWL/XML signals produced
no positive wall-time change and a maximum positive peak-heap-delta change of
+10.05%, below the unchanged 20% threshold. Vite 8/Oxc browser production
measurements are 2,581 minified / 828 gzip bytes for `@rdfjs/data-model`, 4,296
minified / 1,611 gzip bytes for `@rdfjs/dataset`, and 6,885 minified / 2,208
gzip bytes combined. No resource budget or performance threshold changed.

## Failed approaches and best-supported causes

1. Restricting `NN_INT` to canonical digit-only
   `xsd:nonNegativeInteger` literals rejected 43 W3C documents. The mapping is
   value-based, so the final implementation validates XSD numeric value spaces
   and structural safe-integer bounds separately.
2. Treating every `owl:Ontology` node as a competing root rejected prior-version
   graphs. Root selection must honor ontology-property references before
   enforcing uniqueness.
3. Requiring all RDF lists to end at `rdf:nil` left two pinned W3C premise
   documents incompatible with Java. The final behavior keeps strict rejection
   and a single diagnostic recovery with a manifest-declared source defect.
4. Applying OWL 2 list arities directly to OWL 1 graphs rejected empty and
   singleton Boolean/enumeration compatibility forms. Tables 14, 15 and 18
   require explicit normalization to `owl:Thing`, `owl:Nothing`, the singleton
   operand, a complement data range, or an equivalent-classes axiom.
5. Assuming every declaration was explicit missed OWL 1 ontology properties
   and characteristic-only object properties. Tables 6 and 7 require category
   initialization before axiom matching.
6. Comparing only counts and signatures would not prove expression/axiom
   equality. The final project-owned cross-syntax comparison uses the complete
   structural snapshot; the Java comparison remains separately scoped to
   stable black-box fields.
7. Running a concrete RDF parser inside translator tests would merge syntax and
   semantic failures and make Phase 6 impossible to diagnose cleanly. Generated
   quads are stored as immutable fixture data and reconstructed as DatasetCore
   values at test time.
8. Java's normal Windows argument-file path was unreliable with the resolved
   runtime classpath. The test-only `RunWithClasspath` launcher reads the pinned
   classpath file and starts the same JDK without changing dependency or oracle
   identity.

## Material findings and dispositions

| ID       | Applicability                                    | Primary disposition      | Summary                                                                                     |
| -------- | ------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------- |
| `M5-001` | `RDF_MAPPING`, `TESTING`                         | `TEST_OR_FITNESS_UPDATE` | Tables 4-18 are a finite governed inventory with handler and test evidence.                 |
| `M5-002` | `RDF_ADAPTER`, `RDF_MAPPING`, `CROSS_CUTTING`    | `PLAYBOOK_UPDATE`        | Concrete RDF syntaxes stop at DatasetCore and share one semantic translator.                |
| `M5-003` | `RDF_ADAPTER`, `SECURITY`, `TESTING`             | `TEST_OR_FITNESS_UPDATE` | Graph selection precedes semantic reconstruction and is explicit for dataset inputs.        |
| `M5-004` | `RDF_MAPPING`, `SECURITY`, `PERFORMANCE`         | `TEST_OR_FITNESS_UPDATE` | Iterative RDF lists enforce identity, shape, terminal and resource invariants.              |
| `M5-005` | `RDF_MAPPING`, `TESTING`, `SYNTAX_LOCAL`         | `TEST_OR_FITNESS_UPDATE` | `NN_INT` is a numeric value-space rule, not one canonical datatype spelling.                |
| `M5-006` | `TESTING`, `PROVENANCE`, `RDF_MAPPING`           | `TEST_OR_FITNESS_UPDATE` | All 338 W3C cases and 312 applicable RDF documents are mechanically accounted for.          |
| `M5-007` | `TESTING`, `PROVENANCE`, `CROSS_CUTTING`         | `PLAYBOOK_UPDATE`        | Full cross-syntax equality and separately scoped Java fields serve different oracle roles.  |
| `M5-008` | `RDF_MAPPING`, `TESTING`                         | `TEST_OR_FITNESS_UPDATE` | Reified and nested annotations require indexing before declarations and axioms are emitted. |
| `M5-009` | `SECURITY`, `PERFORMANCE`, `CROSS_CUTTING`       | `TEST_OR_FITNESS_UPDATE` | Translation remains bounded, cooperative, immutable and transactional under failure.        |
| `M5-010` | `PERFORMANCE`, `RDF_ADAPTER`, `CROSS_CUTTING`    | `NO_CHANGE`              | First RDF and browser-cost baselines pass without changing budgets or thresholds.           |
| `M5-011` | `PROVENANCE`, `RDF_MAPPING`, `CROSS_CUTTING`     | `TEST_OR_FITNESS_UPDATE` | Standards-first implementation remains separate from legacy and Java control flow.          |
| `M5-012` | `RDF_ADAPTER`, `XML`, `TESTING`, `CROSS_CUTTING` | `PLAYBOOK_UPDATE`        | Phase 6 must diagnose RDF/XML syntax and shared mapping at separate executable seams.       |

### `M5-001`, `M5-005` and `M5-006` - mapping completeness is executable

Evidence: the inventory enumerates every table and rule family; governance
requires exactly Tables 4-18, unique rule IDs, complete statuses, nonempty
construct lists and existing evidence paths. The classification and generated
fixture assertions prove exact source/test/document accounting. Focused numeric
value-space regressions and the 312-document run protect the `NN_INT` finding.

### `M5-002`, `M5-003` and `M5-012` - the RDF seam stays deep

Evidence: all Phase 5 semantic tests enter through constructed datasets;
production imports no concrete RDF parser; graph-policy behavior is tested
independently; and the rewritten playbook requires Phase 6 to compare quads
before invoking shared reconstruction. Syntax adapters remain replaceable and
cannot accumulate private OWL semantics.

### `M5-004` and `M5-009` - hostile graphs are finite transactions

Evidence: malformed graph/list/expression cases, every relevant resource
ceiling, abort/timeout and rollback are covered by focused tests. The iterative
list walker and periodic execution checks avoid recursive list-stack growth and
allow the event loop to deliver cancellation.

### `M5-007` and `M5-011` - oracle roles remain explicit

Evidence: the Functional counterpart is the complete project structural oracle;
Java provides pinned behavioral fields and the malformed-list observation; the
W3C specification defines normative mapping behavior. Provenance records the
independently authored modules, public sources, exact reference revision and
focused evidence. No Java or legacy implementation flow was transplanted.

### `M5-008` - annotations are graph structure, not post-processing

Evidence: direct, reified, nested, ontology, declaration, ordinary axiom and
blank-node-owned axiom annotations are covered. Reification indexes are built
before declaration/axiom creation, and annotation depth shares the governed
resource model.

### `M5-010` - no threshold or budget change is supported

Primary disposition is `NO_CHANGE`: Phase 5 establishes new translator and
RDF/JS browser-cost baselines; every earlier accepted signal remains within the
existing threshold, and resource tests pass at the existing limits.

## Compatibility findings

- Java OWLAPI 5.5.1 and JavaScript agree on the stable Phase 5 ontology header,
  import, count and signature fields. The constructed RDF and Functional
  JavaScript results are fully structurally equal.
- W3C Tables 14, 15 and 18 require OWL 1 empty/singleton normalization and
  additional declarations; these are compatibility requirements, not optional
  permissive parsing.
- Java accepts the two malformed Rational list terminals. JavaScript records
  this only as a narrow warning in compatible mode; strict behavior remains the
  standards/resource boundary.
- Headerless RDF documents produce anonymous ontologies to match the public
  OWLAPI loading model. Present headers still obey identity/version/import and
  uniqueness constraints.
- RDF 1.2 triple terms and unconsumed OWL-significant triples have no silent
  semantic fallback.

## Unresolved questions and dependency impact

There are no unresolved Phase 5 semantic, resource, conformance, differential,
provenance, or performance blockers and no unfinished
`LOCAL_PHASE_FOLLOW_UP`. Phase 6 owns RDF/XML syntax conformance, streaming and
chunk behavior, XML/Base/security normalization, adapter error mapping,
syntax-to-RDF performance, import closure and concrete browser/Node integration.
It may expose a shared mapping defect, but such a defect must be corrected in
the translator rather than hidden in the adapter.

`@rdfjs/data-model` 2.1.2 and `@rdfjs/dataset` 2.0.3 remain their existing exact
production pins. Their concrete conformance and browser-cost evidence is now
recorded; neither gains network authority. `rdfxml-streaming-parser` remains
inactive production code until Phase 6 despite its offline use by the fixture
generator.

## Mechanically reviewable completion summary

- Migration: Phase 5 canonical RDF ingestion and shared RDF-to-OWL.
- Lesson record: `docs/owlapi-js/migration/lessons/004-rdf-to-owl.md`.
- Finding IDs: `M5-001` through `M5-012`; every finding has exactly one primary
  disposition.
- Playbook changed: yes; it now defines the Phase 6 RDF/XML adapter boundary,
  separate syntax/mapping conformance, inherited XML security, exact malformed
  source exception, cross-syntax/Java oracle roles and performance handoff.
- Executable protections added: finite W3C mapping inventory, exact upstream
  classification and generated-fixture accounting, 312-document runner,
  focused semantic/resource/transaction tests, graph-policy tests, complete
  RDF/Functional structural comparison, pinned Java fields, malformed-list
  probe, governance checks, benchmarks and browser-cost measurement.
- Normative-change proposals: none.
- Unresolved blockers: none.
- Next migration: Phase 6 RDF/XML, blocked until the repository owner creates
  the requested Phase 5 checkpoint commit and explicitly says to proceed.
