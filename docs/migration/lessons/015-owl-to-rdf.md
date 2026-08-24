# Phase 16 OWL-to-RDF lesson record

## Migration identity

- Migration: Phase 16 - shared OWL-to-RDF translator.
- Baseline revision: `0896f082`, the signed Phase 15 checkpoint commit.
- Completion revision: the Phase 16 checkpoint commit containing this record;
  the repository owner requested an uncommitted review pause before assigning
  its commit ID.
- Implementation date: 22 August 2026.
- Next migration: Phase 17 - original KRSS / KRSS1.

## Implemented scope

Phase 16 adds `OwlToRdfTranslator` through the then-public
`src/owlapi-js/rdf/index.js` **WebVOWL staging barrel**. “Public” at that
checkpoint described an in-repository migration seam, not an approved npm
subpath. Its single synchronous `translate(ontology, { graph })` operation maps
the canonical structural ontology to a fresh RDF/JS `DatasetCore`. A private
per-call session owns generated blank nodes, stable source
anonymous-individual terms, recursive main-node mapping, RDF lists, axiom
annotations, and placement of every quad in the selected dataset graph.

The mapping covers every canonical entity, object- and data-property
expression, individual, annotation value, data range, class expression, and all
38 current axiom kinds. Constructor-time taxonomy guards and mechanically
exhaustive tests make model growth fail until the new kind has an explicit RDF
disposition. The translator remains a semantic mapping layer: it does not
expose a concrete RDF storer, JSON-LD from-RDF mode, or serialization-specific
option.

The later package-surface decision classifies the translator as
`INTERNAL_ONLY`: Phase 19 relocates it to `internal/mapping/`, and the staging
barrel does not survive as `owlapi/rdf`. This changes publication placement,
not the accepted Phase 16 semantics or evidence.

## Acceptance evidence

| Gate | Result | Primary evidence |
| --- | --- | --- |
| Finite normative inventory | W3C Section 2 Table 1, Table 2, and all three annotated-axiom sections are complete with no exclusions | `conformance/owl-to-rdf-mapping.json`; `governance.test.js` |
| Exhaustive model dispatch | Every class-expression, data-range, and axiom kind is enumerated and translated; entity declarations have a separate completeness guard | `owlToRdfTranslator.expressions.test.js`; `owlToRdfTranslator.roundTrip.test.js` |
| RDF graph semantics | Fresh generated nodes, stable source anonymous individuals, one shared list helper, and caller-selected graph placement | `owlToRdfTranslator.test.js`; `owlToRdfTranslator.axioms.test.js` |
| Annotation mapping | Multiple annotations, all three value kinds, nested annotations, annotation-sensitive axiom identity, pairwise reification, and direct native-node annotations pass | `owlToRdfTranslator.annotations.test.js` |
| Round trip | The complete 38-axiom Phase 2 ontology survives OWL to RDF to OWL to RDF modulo blank-node isomorphism and non-logical inferred declarations | `owlToRdfTranslator.roundTrip.test.js` |
| Java differential | The focused graph matches pinned OWLAPI 5.5.1 after removing exactly three non-normative Java list-type triples | `owlToRdfTranslator.differential.test.js`; `phase16-graph.java.nt` |
| Resource shape | 10,000 declarations, 5,000 list members, and depth 256 have exact linear output sizes | `owlToRdfTranslator.resource.test.js` |
| Browser contract | Translation succeeds without `Buffer`, `process`, or other Node-only runtime reliance | `owlToRdfTranslator.browser.test.js` |
| Performance | 50,000 declarations, 25,000 list members, and depth 256 complete under the existing workload ceiling | `performance/baseline.md`; `benchmark-owlapi-owl-to-rdf.mjs` |
| Provenance | Production, inverse-reader follow-up, Java oracle, fixture revision, and exact differential are recorded | `provenance/provenance.json`; `governance.test.js` |

## Findings and dispositions

| ID | Applicability | Primary disposition | Finding |
| --- | --- | --- | --- |
| `M16-001` | `RDF_MAPPING`, `ARCHITECTURE` | `PLAYBOOK_UPDATE` | A per-call mapping session is the deep module seam: blank-node identity, lists, recursive nodes, annotations, and graph placement share one lifetime while the public API stays small. |
| `M16-002` | `RDF_MAPPING`, `TESTING` | `TEST_OR_FITNESS_UPDATE` | A broad self-round-trip can hide paired forward/reverse mistakes. Focused W3C triples plus a separately generated Java graph are both required. |
| `M16-003` | `RDF_MAPPING`, `COMPATIBILITY` | `CONTROLLED_CORRECTION` | OWLAPI 5.5.1 emits `rdf:type rdf:List` for every list cell, but W3C Table 1 `SEQ` emits only `rdf:first` and `rdf:rest`; the Java-only difference is normalized at exactly three fixture quads. |
| `M16-004` | `RDF_MAPPING`, `TESTING` | `TEST_OR_FITNESS_UPDATE` | Anonymous-individual and generated blank-node labels cannot be compared textually. Dataset isomorphism is the semantic assertion; stable source identity is tested within one call. |
| `M16-005` | `RDF_MAPPING`, `INVERSE_MAPPING` | `TEST_OR_FITNESS_UPDATE` | The forward graph exposed an ordering gap in the inverse reader: an undeclared data property related to a declared one was used in a restriction before property axioms were read. Bounded pre-expression category propagation fixes recognition without inventing a declaration. |
| `M16-006` | `MODEL`, `RDF_MAPPING` | `TEST_OR_FITNESS_UPDATE` | Exhaustive axiom dispatch alone is insufficient: a new entity kind could still miss its declaration type. The translator therefore guards both the global taxonomy and the entity-type mapping. |
| `M16-007` | `API_COMPATIBILITY`, `PACKAGING` | `NO_CHANGE` | A semantic RDF/JS dataset is not a serialized document. Concrete storers and JSON-LD from-RDF remain separately deferred rather than being implied by this phase. |
| `M16-008` | `PERFORMANCE`, `RESOURCE` | `NO_CHANGE` | The mapper is synchronous but linear on the governed wide/list/depth shapes; measurements require no resource-ceiling or dependency change. |

## Java differential disposition

The oracle is OWLAPI 5.5.1 at
`d7e997a53b470e32700de89cc610d9daf01ea769`. `GenerateRdfGraph` invokes the
public N-Triples storer with `addMissingTypes` disabled, so the comparison does
not include serializer-convenience declarations for every signature entity.
The retained Java graph contains three `rdf:type rdf:List` quads, one for each
list cell. W3C Table 1 does not generate them. The differential removes only
that exact predicate/object shape, asserts that the count is exactly three,
and then requires full dataset isomorphism. A fourth occurrence, any other
Java-only quad, or any missing Java quad fails.

## Performance and dependency impact

The accepted idle-machine run used Node.js `v24.19.0`, one warm-up, five
measured runs, median aggregation, and explicit garbage collection. Ontology
construction was outside the timed region. A benchmark-only dataset wrapper
sampled synchronous heap use every 256 emitted quads without changing the
production translator's execution model. Median results were 85.38 ms and
98,392,856 bytes peak-heap delta for 50,000 declaration axioms; 101.34 ms and
114,785,832 bytes for a 25,000-member RDF list; and 1.35 ms and 5,249,384 bytes
for expression depth 256.

Phase 16 adds no package, lockfile, build configuration, concrete serializer,
production resource ceiling, or third-party dependency. It uses the existing
project RDF/JS factories. The Java harness and generated N-Triples graph are
development-only oracle evidence and never enter a runtime bundle.

## Impact on subsequent phases

Phase 16 was the last RDF-mapping reason to retain the old RDF/XML bridge and
syntax-coupled converter/exporter as implementation references. ADR 0008 later
inserted original KRSS/KRSS1 as Phase 17 and renumbered physical deletion and
package release to Phases 18 and 19. Phase 18 may therefore perform the
retained-reference audit and physically delete the already
production-unreachable legacy pipeline. It should not move or rewire those
files first, and it must keep deletion separate from Phase 19 package-surface
work.

## Unresolved questions

There are no unresolved Phase 16 blockers. Concrete RDF serializers remain
deferred by design and require their own syntax contracts, provenance,
round-trip tests, and release decision. They are not Phase 17 deletion work.

## Mechanically reviewable completion summary

- Migration: Phase 16 shared OWL-to-RDF translator.
- Lesson record: `docs/owlapi-js/migration/lessons/015-owl-to-rdf.md`.
- Finding IDs: `M16-001` through `M16-008`; every finding has exactly one
  primary disposition.
- Playbook changed: yes; Phase 16 evidence is institutionalized and the next
  migration section advances to Phase 17.
- Executable protections added: exhaustive taxonomy and expression/axiom
  inventories, exact W3C rule assertions, annotation-pattern assertions,
  graph placement, blank-node identity, round trip, pinned Java graph
  differential, browser contract, linear resource shapes, and performance
  evidence.
- Resource-budget or regression-threshold changes: none.
- Unresolved blockers: none.
- Next migration: Phase 17 original KRSS / KRSS1, blocked until the repository owner creates the
  requested Phase 16 checkpoint commit and explicitly says to proceed.
