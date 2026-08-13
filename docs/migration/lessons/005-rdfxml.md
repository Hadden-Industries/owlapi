# Phase 6 RDF/XML lesson record

## Migration identity

- Migration: Phase 6 - RDF/XML and first-real-adapter hardening.
- Baseline revision: `86f1602cb958b08fc13b30e430a116f262db9604`
  (the repository-owner Phase 5 checkpoint).
- Completion revision: the Phase 6 checkpoint commit containing this record;
  the repository owner requested an uncommitted review pause before assigning
  its commit ID.
- Implementation date: 13 August 2026.
- Next migration: Phase 7 - early development-app integration.

## Implemented scope

Phase 6 registers RDF/XML as the first production RDF syntax. The descriptor
performs bounded tri-state detection; the private syntax adapter conditionally
loads pinned `rdfxml-streaming-parser` 3.2.0 and emits only project-normalized
RDF/JS quads; the parser composes that dataset with the single Phase 5
`RdfToOwlTranslator`; and the manager publishes the result transactionally.

The adapter owns only concrete-syntax responsibilities: XML security and
structure checks, node-element root normalization, source/document IRI
handling, Unicode-safe chunking and backpressure, dependency error mapping,
RDF/JS normalization, limits, cancellation, timeout, and the RDF/XML-defined
canonical lexical form of `rdf:XMLLiteral`. It contains no declaration,
class-expression, axiom, RDF-list, or OWL compatibility mapping rule.

The implementation adds:

- `src/owlapi-js/parser/rdfxml/descriptor.js`;
- `src/owlapi-js/parser/rdfxml/parser.js`;
- `src/owlapi-js/parser/rdfxml/rdfXmlSyntaxAdapter.js`;
- adapter, manager, browser, differential, conformance, security, resource,
  abort, timeout, and transaction tests;
- an independently classified and self-contained W3C RDF/XML fixture corpus;
- a graph-isomorphism utility for syntax-seam conformance;
- RDF/XML browser-cost and syntax/end-to-end benchmark utilities; and
- the Manchester and OWL/XML forms of the Phase 5 project-owned structural
  differential fixture.

## Acceptance evidence

| Gate                       | Result                                                                                                                                                        | Primary evidence                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| W3C RDF/XML inventory      | 173 upstream definitions accounted for: 166 active entries and 7 fully commented-out definitions                                                              | `docs/owlapi-js/conformance/classification-manifests.json`                                          |
| W3C RDF/XML execution      | 166/166 active entries passed: 126 graph-isomorphism evaluations and 40 negative-syntax rejections                                                            | `src/owlapi-js/parser/rdfxml/rdfXml.conformance.test.js`                                            |
| Repository verification    | 6/201 Phase 6 parser suites and 84/1,178 repository suites/tests passed                                                                                       | `src/owlapi-js/parser/rdfxml`; complete Jest run                                                    |
| Adapter contract           | Parser-specific streams, terms, errors and configuration remain private; project RDF/JS objects cross the seam                                                | `src/owlapi-js/parser/rdfxml/rdfXmlSyntaxAdapter.test.js`                                           |
| Security/resources         | External subsets/entities, malformed XML, complete term limits, abort, stalled/long-delay timeouts and Unicode/chunk boundaries are deterministic and bounded | `src/owlapi-js/parser/rdfxml/rdfXmlSyntaxAdapter.resource.test.js`                                  |
| Manager/import transaction | Default and explicit selection, anonymous/root-node documents, imports and rollback pass                                                                      | `src/owlapi-js/parser/rdfxml/rdfXml.test.js`                                                        |
| Structural differential    | One RDF/XML ontology equals its Functional, Manchester and OWL/XML forms and matches the pinned Java snapshot fields                                          | `src/owlapi-js/parser/rdfxml/rdfXml.differential.test.js`                                           |
| Browser contract           | Browser DOM behavior passes; Node XML fallback is absent from the browser bundle                                                                              | `src/owlapi-js/parser/rdfxml/rdfXml.browser.test.js`; `util/measure-owlapi-rdfxml-browser-cost.mjs` |
| Real-world corpus          | Exact-hash Wine, GeoNames and Schema.org RDF/XML documents load under their recorded strict/compatible policies                                               | `util/verify-owlapi-rdfxml-corpus.mjs`                                                              |
| Dependency review          | Direct dependency and all seven recorded transitive packages had no exact-package match in the GitHub Advisory Database on 13 August 2026                     | `docs/owlapi-js/dependency-governance.json`                                                         |
| Performance                | New RDF/XML baselines established; every paired pre-existing signal is within the unchanged 20% threshold                                                     | `docs/owlapi-js/performance/baseline.md`                                                            |

The real-world evidence used the exact bytes already pinned in
`benchmark-corpus.json`:

| Fixture             | Mode       |  Quads | Axioms | Classes | Warnings                                                                            |
| ------------------- | ---------- | -----: | -----: | ------: | ----------------------------------------------------------------------------------- |
| `wine.rdf`          | strict     |  1,839 |    747 |      77 | none                                                                                |
| `ontology_v3.3.rdf` | compatible |  6,844 |  5,536 |      15 | 1,234 explicitly reported unconsumed FOAF/SKOS metadata triples                     |
| `schemaorg.owl`     | compatible | 36,054 | 14,273 |     946 | 185 class-shaped data-range recoveries and 6 local property-category reuse warnings |

Strict mode intentionally rejects the OWL Full patterns in GeoNames and
Schema.org. Compatible mode does not silently claim OWL 2 DL conformance: each
recovery or unconsumed significant triple remains observable through a stable
diagnostic.

## Findings and dispositions

| ID       | Applicability                                 | Primary disposition      | Finding                                                                                                                                                                                                    |
| -------- | --------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `M6-001` | `RDF_ADAPTER`, `TESTING`, `CROSS_CUTTING`     | `TEST_OR_FITNESS_UPDATE` | Syntax correctness must be proved at the RDF/JS seam before OWL reconstruction can hide or transform a graph defect.                                                                                       |
| `M6-002` | `RDF_ADAPTER`, `PROVENANCE`, `CROSS_CUTTING`  | `TEST_OR_FITNESS_UPDATE` | A self-contained generated fixture artifact makes an exhaustive upstream suite reproducible without runtime network access or dependency-owned test behavior.                                              |
| `M6-003` | `RDF_ADAPTER`, `XML`, `TESTING`               | `TEST_OR_FITNESS_UPDATE` | RDF graph equivalence requires blank-node isomorphism; quad counts or serialized labels are not a conformance oracle.                                                                                      |
| `M6-004` | `XML`, `SECURITY`, `RDF_ADAPTER`              | `TEST_OR_FITNESS_UPDATE` | A streaming dependency does not replace source-level XML policy: external identifiers, entity declarations, nesting, byte limits and deterministic malformed-input errors still require an owned boundary. |
| `M6-005` | `XML`, `SYNTAX_LOCAL`, `TESTING`              | `TEST_OR_FITNESS_UPDATE` | `rdf:parseType="Literal"` is the one semantic-looking operation that correctly remains syntax-local because RDF/XML defines an XML-canonical lexical form before RDF/JS emission.                          |
| `M6-006` | `RDF_ADAPTER`, `CROSS_CUTTING`                | `PLAYBOOK_UPDATE`        | Optional `rdf:RDF` wrapping must validate the original single XML node-element root first; wrapper insertion cannot become malformed-document recovery.                                                    |
| `M6-007` | `RDF_MAPPING`, `TESTING`, `CROSS_CUTTING`     | `TEST_OR_FITNESS_UPDATE` | Schema.org's class-shaped data-property ranges exposed an OWL Full compatibility gap in the shared translator, not an RDF/XML defect.                                                                      |
| `M6-008` | `RDF_MAPPING`, `PROVENANCE`, `CROSS_CUTTING`  | `TEST_OR_FITNESS_UPDATE` | Compatible cross-category property use must be local to one axiom and diagnostic; mutating the global category registry corrupts later annotation and assertion dispatch.                                  |
| `M6-009` | `RDF_ADAPTER`, `TESTING`, `CROSS_CUTTING`     | `TEST_OR_FITNESS_UPDATE` | Parser replacement remains credible only when dependency-specific terms, streams, callbacks, configuration and errors are normalized before leaving the adapter.                                           |
| `M6-010` | `PERFORMANCE`, `RDF_ADAPTER`, `CROSS_CUTTING` | `NO_CHANGE`              | Conditional loading keeps the sizeable third-party RDF/XML implementation graph out of the initial browser graph; no budget or threshold relaxation is required.                                           |
| `M6-011` | `PERFORMANCE`, `TESTING`, `CROSS_CUTTING`     | `PLAYBOOK_UPDATE`        | Regression comparisons must use paired measurements on the same runtime; the Phase 5 Node 24.19 record was not directly comparable to the available Node 24.17 environment.                                |
| `M6-012` | `TESTING`, `CROSS_CUTTING`                    | `PLAYBOOK_UPDATE`        | Real-world acceptance needs both strict normative fixtures and compatible OWL Full workloads with exact hashes and explicit warning counts.                                                                |
| `M6-013` | `RDF_ADAPTER`, `SECURITY`, `TESTING`          | `TEST_OR_FITNESS_UPDATE` | Cooperative elapsed-time checks cannot bound a dependency stream that stops emitting; an independent wall-clock watchdog must destroy the stream with the canonical timeout error.                         |
| `M6-014` | `RDF_ADAPTER`, `XML`, `TESTING`               | `TEST_OR_FITNESS_UPDATE` | RDF root recognition must compare the XML-expanded namespace value; comparing the raw `xmlns` spelling rejects valid character references and can misclassify an optional node-element root.               |
| `M6-015` | `RDF_ADAPTER`, `SYNTAX_LOCAL`, `TESTING`      | `PLAYBOOK_UPDATE`        | RDF/XML `rdf:parseType` values other than `Resource`, `Collection`, and `Literal` have Literal behavior; normalization must be source-aware and must never rewrite markup inside an XML literal.           |
| `M6-016` | `RDF_ADAPTER`, `SECURITY`, `TESTING`          | `TEST_OR_FITNESS_UPDATE` | A literal's datatype IRI, language tag, and base direction are RDF term components and must be included in the adapter's token-length budget rather than checking only the literal lexical form.           |
| `M6-017` | `RDF_ADAPTER`, `SECURITY`, `TESTING`          | `PLAYBOOK_UPDATE`        | Loader timeouts can exceed the host timer's maximum single delay; the watchdog must cap and re-arm its timer instead of allowing platform coercion to turn a large timeout into an immediate expiration.   |

### `M6-001`, `M6-002` and `M6-003` - own the conformance boundary

The upstream manifest has 166 active `mf:entries`: 126 evaluation cases and 40
negative-syntax cases. Seven additional test definitions are completely
commented out upstream. The generator records all 173 definitions, classifies
the active entries `REQUIRED`, classifies the seven inactive definitions
`EXCLUDED_WITH_REASON` / `COMMENTED_OUT_UPSTREAM`, verifies every referenced
file, and embeds the source and expected N-Triples graph in the generated JSON.

Evaluation cases compare RDF graphs by an owned blank-node-isomorphism helper.
Negative cases must reject at the adapter; none is allowed to reach the
translator. This separation found the only two initial failures in XML literal
canonicalization without misdiagnosing them as OWL mapping defects.

### `M6-004`, `M6-005` and `M6-006` - the adapter owns finite XML syntax

The Phase 4 entity policy remains authoritative. The RDF/XML adapter adds a
small streaming structure scanner so malformed/multiple roots, input size,
nesting, entity declarations and cancellation fail deterministically before
the third-party stream is trusted. A valid standalone RDF node element is
normalized under a synthetic `rdf:RDF` document only after that original
structure passes.

The deadline also remains live while awaiting backpressure and stream
completion. An independent wall-clock watchdog destroys a dependency stream
that stops emitting; relying only on checks in chunk and data callbacks would
leave a stalled parser unbounded. Each scheduled delay is capped at the host
timer maximum and re-armed while time remains, so every valid safe-integer
loader timeout retains its configured meaning.

The dependency supplied a valid XMLLiteral value for most inputs but retained
all in-scope namespaces where the W3C cases require exclusive XML
canonicalization. The project therefore classifies `rdf:parseType="Literal"`
nodes from the source and replaces only those emitted literal lexical forms.
Explicit `rdf:datatype` XMLLiteral values are preserved byte-for-byte because
RDF/XML does not grant the same parseType canonicalization authority there.
Non-reserved `rdf:parseType` values are normalized to Literal behavior before
the dependency sees them, as RDF/XML requires. The source/DOM pairing rewrites
only genuine RDF syntax attributes and cannot alter `parseType`-looking markup
inside an XML literal. Optional `rdf:RDF` recognition likewise compares the
XML-expanded namespace value, including valid character references rather than
the raw attribute spelling.

Resource accounting covers the complete normalized RDF term. For literals,
that includes the lexical form and the nested datatype IRI, language tag, and
base direction, preventing a short lexical form from carrying an unbounded
secondary token.

### `M6-007` and `M6-008` - real RDF exposes shared semantic gaps

Schema.org declares data properties whose ranges are blank-node `owl:Class`
unions and declares `schema:name` as an object subproperty of the annotation
property `rdfs:label`. These are OWL Full patterns. Strict translation rejects
them. Compatible translation follows the observable lax RDF-consumer behavior
at the smallest structural boundary: it emits the locally implied axiom and a
warning without rewriting the property's global category. Annotation
assertions retain precedence, so a local subproperty interpretation cannot turn
every later `rdfs:label` literal into an object-property assertion.

The focused constructed-dataset regressions live in
`rdfToOwlTranslator.axioms.test.js`; the syntax adapter remains unchanged by
these OWL-level findings. This is the first concrete proof that the Phase 5
semantic seam is deep enough to serve more than one RDF syntax.

### `M6-009` and `M6-010` - replacement and lazy loading are measurable

The adapter accepts an injected implementation loader in tests, immediately
normalizes all returned quads to project RDF/JS terms, and maps dependency
failures to canonical errors. The manager registry constructs the parser only
after RDF/XML selection, and the adapter then conditionally loads the
third-party implementation. The browser build confirms that this dependency
is absent from the initial graph and isolated in one 163,163-byte minified lazy
graph; the Node-only DOM fallback is absent.

### `M6-011` and `M6-012` - compare like with like

The Phase 5 accepted RDF measurements were recorded on Node 24.19, while the
current workspace runtime is Node 24.17. Phase 6 therefore created a temporary
exact archive of the Phase 5 checkpoint and measured both revisions under the
same runtime and hardware. Every paired signal remained within 11.59%, well
inside the unchanged 20% threshold.

Wine proves strict RDF/XML/OWL reconstruction on a conventional ontology.
GeoNames proves explicit compatible-mode handling of undeclared annotation
vocabularies. Schema.org proves bounded processing of the largest pinned
ontology and makes OWL Full recoveries visible. Exact byte lengths and SHA-256
values prevent a changed remote document from masquerading as the accepted
fixture.

## Dependency and security impact

`rdfxml-streaming-parser` 3.2.0 remains the exact package-lock pin. Its seven
recorded direct runtime dependencies were reviewed with exact npm package-name
queries in the GitHub Advisory Database on 13 August 2026; none returned a
matching reviewed advisory. Host npm 12.0.2 also completed
`npm audit --omit=dev --json` outside the workspace sandbox: the production
scope contained 73 dependencies and reported zero vulnerabilities at every
severity. The earlier sandboxed `MODULE_NOT_FOUND` was restricted access to the
selected user-level npm prefix, not a broken npm installation. The executable
security gate independently covers external entities/subsets, expansion
limits, malformed XML, URI validation, input/quads/blank-node/token limits,
abort, timeout, backpressure and browser behavior.

The dependency gains no network authority. It receives caller-supplied text
only; the project adapter rejects external XML authority before streaming. Its
types, errors and streams remain private, preserving replacement freedom.

## Impact on Phase 7

Phase 7 may now invoke the default manager for Functional, Manchester,
OWL/XML, and RDF/XML documents and receive one structural `OWLOntology` model.
It must preserve parser diagnostics when exposing development-app results,
especially compatible RDF warnings. `VOWLBuilder` must consume only structural
objects and must not import the RDF/XML adapter, inspect quads, or recreate
legacy RDF/parser/converter shapes.

The development integration fixtures should include:

1. the project-owned cross-format structural fixture;
2. valid and malformed RDF/XML;
3. an empty anonymous ontology;
4. an import closure;
5. a resource failure with rollback; and
6. at least one compatible OWL Full input whose diagnostics remain observable.

Phase 7 must not change the production default and must pause at its own Git
checkpoint before the Phase 8 cutover.

## Unresolved questions

There are no unresolved Phase 6 conformance, differential, security, resource,
dependency, browser, provenance, or performance blockers and no unfinished
`LOCAL_PHASE_FOLLOW_UP`. The known compatible-mode warnings are explicit input
classification, not hidden correctness debt. Broader OWL Full reconstruction
is not added to the `REQUIRED_V1` structural contract by this phase.

## Mechanically reviewable completion summary

- Migration: Phase 6 RDF/XML and first-real-adapter hardening.
- Lesson record: `docs/owlapi-js/migration/lessons/005-rdfxml.md`.
- Finding IDs: `M6-001` through `M6-017`; every finding has exactly one primary
  disposition.
- Playbook changed: yes; the completed RDF/XML method is institutionalized and
  the next-migration section advances to Phase 7 development integration.
- Executable protections added: exact W3C classification/generation, graph
  isomorphism, adapter replacement, XML security/resource/abort/timeout tests,
  including stalled-stream and oversized-delay watchdog regressions; browser
  contract,
  manager/import rollback, cross-format/Java differential, compatible OWL Full
  translator regressions, lazy-bundle measurement and syntax/end-to-end
  performance measurement, and an exact-hash real-world corpus verifier.
- Normative-change proposals: none.
- Resource-budget or regression-threshold changes: none.
- Unresolved blockers: none.
- Next migration: Phase 7, blocked until the repository owner creates the
  requested Phase 6 checkpoint commit and explicitly says to proceed.
