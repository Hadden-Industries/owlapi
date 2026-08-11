# Extract `owlapi-js` Core Module from WebVOWL

> **Status:** Final architecture and implementation blueprint  
> **Research baseline:** 8 August 2026  
> **Purpose:** Define the standards-grounded, migration-safe extraction of reusable OWL parsing and ontology-model functionality from WebVOWL into a standalone JavaScript `owlapi-js` core, while preserving WebVOWL behaviour and establishing a credible foundation for broader OWLAPI-compatible JavaScript tooling.

---

## Executive Summary

WebVOWL has accumulated substantial ontology parsing functionality that no longer belongs inside visualization-specific code. The current system accepts multiple ontology syntaxes, translates most of them through an RDF/XML intermediate representation, reparses that RDF/XML, and then mixes generic ontology interpretation with VOWL-specific extraction. This architecture has delivered working format support, but the intermediate representation and responsibility boundaries are now the principal source of accidental complexity.

The extraction should **not** simply move the existing parsers into a new directory and replace RDF/XML strings with arrays of triples. That would preserve the deepest architectural mistake while changing only its representation.

The correct architecture has **two distinct canonical intermediate representations**, because OWL and RDF are different abstraction layers:

1. **Canonical OWL representation:** a W3C-faithful **OWL 2 structural object model** (`OWLOntology`, axioms, class expressions, property expressions, annotations, entities, literals, etc.). This is the semantic/domain model exposed to WebVOWL and other OWL consumers.
2. **Canonical RDF representation:** an **RDF/JS `DatasetCore` of `Quad` objects**. This is the serialization-independent RDF boundary used for RDF syntaxes and for OWL↔RDF mapping.

The relationship is:

```text
OWL-native syntaxes
(OWL/XML, Functional, Manchester, DL, KRSS2)
        │
        │ parse directly
        ▼
┌─────────────────────────────┐
│ OWL 2 structural model      │  ← canonical OWL representation
│ OWLOntology + OWL objects   │
└──────────────┬──────────────┘
               │
               │ W3C OWL → RDF mapping
               ▼
┌─────────────────────────────┐
│ RDF/JS DatasetCore<Quad>    │  ← canonical RDF representation
└──────────────▲──────────────┘
               │
               │ RDF → OWL reconstruction
               │
RDF syntaxes ──┴── format-specific RDF parser adapters
                    │
                    ├── N3.js — Turtle/TriG/N-Triples/N-Quads (N3 language DEFERRED)
                    ├── rdfxml-streaming-parser — RDF/XML
                    └── Digital Bazaar jsonld.js — JSON-LD
                    │
                    ▼
              RDF/JS DatasetCore<Quad>
```

This is not an invented abstraction. The W3C OWL 2 Structural Specification explicitly defines a syntax-independent structural representation and states that it provides the foundation for OWL APIs and reasoners. The W3C Mapping to RDF Graphs defines the deterministic bridge between this structural representation and RDF. Java OWLAPI itself follows the same conceptual architecture: `OWLParser` implementations populate `OWLOntology` with axioms; `OWLRDFConsumer` reconstructs OWL objects from RDF triple patterns; and `AbstractTranslator` / `RDFTranslator` translate an `OWLOntology` back to an RDF graph.

The most important consequences for this refactor are:

- **Do not make triples the storage model of `OWLOntology`.** `OWLOntology` owns structural axioms and ontology metadata. RDF is a projection/boundary representation.
- **Do not make every parser emit RDF.** OWL-native syntaxes should construct the structural model directly. RDF syntaxes should produce RDF/JS quads and then pass through one shared RDF→OWL interpreter.
- **Do not make a universal RDF dispatcher such as `rdf-parse` a foundational abstraction.** `OWLOntologyManager` already owns parser selection. Each RDF syntax adapter should call the strongest narrowly scoped implementation directly and normalize immediately to RDF/JS, keeping third-party parser choice replaceable behind the `owlapi-js` boundary.
- **Do not use triples as the canonical RDF type.** RDF/JS defines triples as quads whose graph is `DefaultGraph`; quads preserve named-graph membership when source formats such as TriG or N-Quads contain it.
- **Do not put RDF named-graph state onto OWL axioms.** Graph membership is RDF dataset/source context, not a property of the OWL 2 structural model.
- **Delete RDF/XML as an internal interchange format.** RDF/XML serialization becomes an optional future output boundary, not a pipeline step.
- **Make structural equality a first-class implementation concern.** JavaScript `Set` and `Map` compare objects by identity, while OWL structural equivalence treats most associations as unordered duplicate-free sets. `owlapi-js` therefore needs canonical structural keys, interning, or equivalent explicit equality semantics.
- **Use the Java implementation as a behavioural oracle, not as a Java-to-JavaScript transliteration target.** Match OWL semantics and observable behaviour; adopt JavaScript-native async I/O, iterables, ESM packaging, immutable objects/configuration, and RDF/JS interoperability.
- **Migrate the ontology-ingestion programme sequentially.** Complete one WIP-locked ingestion migration, its acceptance gate and its learning/institutionalization handoff before the next begins; keep the Java differential corpus green subject only to precise approved expected differences.

The proposed end state is therefore a small, reusable OWL core with clean adapters, not a WebVOWL-specific parser bundle wearing an `owlapi-js` name.

---

## 1. Background & Motivation

### 1.1 What is WebVOWL?

[WebVOWL](file:///C:/Users/maksy/GitHub/webvowl) is a JavaScript application that visualizes OWL ontologies using the VOWL (Visual Notation for OWL Ontologies) specification. Its high-level pipeline is:

1. **Accept** an ontology document in a supported syntax.
2. **Parse and interpret** it as an ontology.
3. **Convert** the ontology into VOWL-specific data.
4. **Export** VOWL-JSON.
5. **Render** the VOWL-JSON as an interactive graph in the browser.

The architectural objective of this refactor is to make steps 1–2 reusable and syntax-independent, while keeping steps 3–5 WebVOWL-specific.

### 1.2 What is Java OWLAPI?

The [Java OWLAPI](file:///C:/Users/maksy/GitHub/owlcs/owlapi) (`org.semanticweb.owlapi`) is the canonical mature Java API for manipulating OWL ontologies. Its relevant architecture is broader than “a collection of parsers”:

- a syntax-independent OWL object model (`OWLOntology`, `OWLAxiom`, `OWLClassExpression`, `OWLEntity`, `OWLLiteral`, annotations, etc.);
- an `OWLDataFactory` for constructing structural OWL objects;
- ontology managers and loading configuration;
- parser and parser-factory abstractions;
- RDF→OWL interpretation (`OWLRDFConsumer`);
- OWL→RDF translation (`AbstractTranslator` / `RDFTranslator`);
- format metadata, imports, IRI mapping, changes, renderers/storers, profiles, utility APIs, and reasoner interfaces.

For this project, **OWLAPI is both a behavioural oracle and a proven reference architecture**, but the initial `owlapi-js` scope is intentionally smaller than complete OWLAPI parity.

### 1.3 What WebVOWL has already built

The project has ported or implemented substantial parsing logic for:

- Manchester OWL Syntax;
- OWL Functional Syntax;
- OWL/XML;
- DL Syntax;
- KRSS2;
- Turtle;
- JSON-LD;
- RDF/XML processing/fallback logic.

A parser-surface audit against OWLAPI 5 also reveals one important **compatibility gap that WebVOWL has not yet implemented**: original **KRSS / KRSS1**. OWLAPI exposes `KRSSOWLParser` (`org.semanticweb.owlapi.krss1.parser`) and `KRSS2OWLParser` (`org.semanticweb.owlapi.krss2.parser`) as distinct `OWLParser` implementations, with distinct KRSS and KRSS2 document-format factories. `owlapi-js` **MUST** represent KRSS1 explicitly in the authoritative capability matrix; its parser implementation is `DEFERRED` for v1 while the distinct compatibility identity, grammar-gap analysis, fixtures and future-ready architecture are `REQUIRED_V1`. This gap is a useful warning: the authoritative parser inventory must come from OWLAPI itself, not only from the formats WebVOWL already happens to contain.

That work contains valuable, hard-won implementation knowledge. In particular, the existing differential corpus exposed silent language-tag loss, permissive-parser false positives, XML parser semantic differences, invalid blank-node serialization, unresolved XML entities, and catastrophic eager-tokenization memory behaviour.

The extraction must preserve those lessons rather than starting from an idealized parser rewrite.

### 1.4 Why extraction is now justified

The current parser code is reusable domain infrastructure trapped inside a visualization module. Extraction provides four immediate benefits:

1. **Separation of concerns:** OWL syntax/semantics no longer depend on VOWL data structures.
2. **Elimination of format round-trips:** non-RDF/XML inputs no longer serialize to RDF/XML only to be parsed again.
3. **Single semantic model:** all syntax front ends converge on the same structural ontology representation.
4. **Independent validation and reuse:** parser correctness can be tested and released independently of WebVOWL rendering.

It also creates the nucleus of something currently missing from the JavaScript ecosystem: a modern, browser-capable, standards-oriented structural OWL API above RDF/JS.

### 1.5 Why a mature JavaScript OWLAPI equivalent does not already dominate the ecosystem

The absence of such a library is not evidence that the architecture is flawed. The historical incentives explain the gap:

- Java OWLAPI became mature early and anchored tooling such as Protégé and Java reasoners.
- JavaScript Semantic Web tooling standardized strongly at the **RDF** layer (RDF/JS, JSON-LD, SPARQL, SHACL, Comunica, etc.) rather than the OWL structural/direct-semantics layer.
- Full OWL 2 support is broad: constructing the classes is easy; faithfully implementing equality, RDF reconstruction, annotations, imports, corner cases, and all syntax forms is substantial work.
- A revealing historical project, `owljs`, offered JavaScript OWL manipulation but used RingoJS/Rhino to call **Java OWLAPI on the JVM** instead of recreating it natively.
- Modern JavaScript now has much stronger foundations—ES modules, mature browser/Node parity, RDF/JS, streaming parsers, workers, WebAssembly, and robust package tooling—than when earlier attempts were made.

The opportunity is therefore credible, but scope discipline is essential.

---

## 2. Architectural Principles and Non-Negotiable Decisions

### 2.0 Normative language, precedence and authoritative capability surface

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **NOT RECOMMENDED**, **MAY**, and **OPTIONAL** in this document are to be interpreted as described in **BCP 14**, comprising RFC 2119 and RFC 8174, when, and only when, they appear in all capitals.

Lowercase variants are ordinary English and are not normative keywords.

When two parts of the migration material appear to conflict, authority is resolved in this order:

1. normative architectural requirements and non-negotiable decisions in this blueprint;
2. the authoritative initial-release capability/compatibility matrix;
3. the current phase execution contract;
4. the canonical parser-migration playbook;
5. historical per-migration lesson records;
6. illustrative examples, diagrams, pseudocode and explanatory prose.

An Architecture Decision Record (ADR) records **why** a normative decision changed; it is not a hidden competing specification layer. If an ADR changes a normative requirement, every affected normative artefact **MUST** be updated in the same accepted change before implementation relies on the new rule.

Examples, diagrams, sample code and pseudocode are non-normative unless explicitly identified as normative.

An implementer **MUST NOT** locally resolve an unresolved question that changes public API, semantic behaviour, security policy, provenance policy, cross-phase contracts, capability scope or acceptance criteria.

#### Authoritative capability/compatibility matrix

The project **MUST** maintain one authoritative, machine-readable capability/compatibility matrix. Conceptually it belongs at a path such as:

```text
docs/owlapi-js/compatibility/capabilities.yaml
```

The exact serialization and filename **MAY** follow repository convention, but there **MUST** be exactly one normative machine-readable source.

Every relevant capability **MUST** have exactly one release-status classification:

```text
REQUIRED_V1
DEFERRED
UNSUPPORTED_BY_DESIGN
DELEGATED
```

A separate non-normative progress state such as `NOT_STARTED`, `IN_PROGRESS` or `COMPLETE` **MAY** be recorded, but implementation progress **MUST NOT** redefine release scope.

The matrix **MUST** cover at least:

- parsers and document formats;
- syntax/grammar constructs;
- structural object and axiom families;
- `OWLDataFactory` construction surface;
- RDF→OWL mapping;
- OWL→RDF mapping;
- public ontology and manager APIs;
- import/loading behaviour;
- graph/document policies;
- diagnostics and public errors;
- selected Java OWLAPI compatibility behaviour;
- known deviations.

No phase or implementation team **MAY** redefine the meaning of “supported” locally. A `REQUIRED_V1` capability remains required even when the current WebVOWL corpus does not exercise it. `DEFERRED` and `UNSUPPORTED_BY_DESIGN` capabilities **MUST NOT** become accidental public support merely because an implementation dependency happens to accept them.

Human-readable compatibility documentation **SHOULD** be generated from, or mechanically checked against, the authoritative matrix.

### 2.1 Decision: the OWL 2 structural model is the canonical OWL IR

The W3C structural specification is expressly independent of concrete syntaxes and defines the conceptual structure and structural equivalence of OWL 2 objects. The core library should model that abstraction directly.

Examples of first-class OWL objects include:

```text
OWLOntology
├── OWLOntologyID
├── import declarations
├── ontology annotations
└── axioms
    ├── Declaration
    ├── SubClassOf
    ├── EquivalentClasses
    ├── DisjointClasses
    ├── ObjectPropertyDomain
    ├── DataPropertyRange
    ├── ClassAssertion
    ├── AnnotationAssertion
    └── ...

ClassExpression
├── OWLClass
├── ObjectIntersectionOf
├── ObjectUnionOf
├── ObjectComplementOf
├── ObjectSomeValuesFrom
├── ObjectAllValuesFrom
├── ObjectHasValue
├── ObjectHasSelf
├── ObjectMinCardinality
├── ObjectMaxCardinality
├── ObjectExactCardinality
└── ...
```

A parser for an OWL-native syntax should create these objects—preferably through one `OWLDataFactory`—and add axioms/metadata to an ontology under construction.

### 2.2 Decision: RDF/JS `DatasetCore<Quad>` is the canonical RDF IR

At the RDF layer, use standard RDF/JS abstractions rather than project-specific `{subject,predicate,object}` records.

RDF/JS represents a triple as a quad with `DefaultGraph`:

```javascript
factory.quad(subject, predicate, object, factory.defaultGraph());
```

This makes the RDF representation a lossless common supertype for both:

- graph-only formats such as Turtle, N-Triples and RDF/XML; and
- dataset formats such as TriG and N-Quads where named graph membership carries additional information.

The selected v1 implementation dependencies are:

- `@rdfjs/data-model` — canonical RDF/JS term and quad factory;
- `@rdfjs/dataset` — canonical `DatasetCore` implementation;
- `n3` / N3.js — v1 parsing implementation for **Turtle, TriG, N-Triples and N-Quads**;
- `rdfxml-streaming-parser` — v1 RDF/XML parser emitting RDF/JS quads;
- `jsonld` / Digital Bazaar `jsonld.js` — v1 JSON-LD processor, adapted directly to RDF/JS without an intermediate N-Quads serialization.

The broader **Notation3 (N3) language is `DEFERRED` for v1**. The presence of N3.js as a dependency **MUST NOT** be interpreted as a claim of N3-language support.

Do **not** introduce a second universal parser-dispatch framework underneath `OWLOntologyManager`. Parser selection, format hints, bounded detection, priority and fallback semantics are already core responsibilities of `owlapi-js`; duplicating them through `rdf-parse`, Comunica or another nested dispatcher adds indirection without semantic value.

All third-party parsers are replaceable implementation details behind `owlapi-js` adapters. No parser-specific term classes, streams, exceptions, parser instances or configuration objects **MAY** leak into the public OWL or canonical RDF boundary APIs.

### 2.3 Decision: OWL and RDF are two models connected by translators

Do not collapse these two layers into one “universal” internal model.

```text
OWL structural model  ←→  RDF/JS dataset
       semantic              interchange/
       ontology              graph layer
```

The library should have explicit components such as:

```text
OwlToRdfTranslator
RdfToOwlTranslator   (or OWLRDFConsumer-equivalent)
```

These are reusable semantic bridges, not syntax-specific serializers.

### 2.4 Decision: `OWLOntology` does not store raw triples as its source of truth

The earlier plan proposed storing/indexing raw triples inside `OWLOntology` and exposing semantic accessors over them. That should be rejected.

Instead:

```text
OWLOntology
    owns
      ↓
Set/Index of OWLAxiom structural objects
      ↓
derived signature/indexes/caches
```

An RDF view may be generated lazily or cached when required:

```text
OWLOntology
    ↓ OwlToRdfTranslator
DatasetCore<Quad>
```

This makes OWL-native syntax parsing direct, prevents RDF encoding details from leaking into domain APIs, and mirrors OWLAPI's observable architecture.

### 2.5 Decision: behavioural compatibility, not mechanical Java transliteration

Names that are already idiomatic and useful should align with Java OWLAPI (`OWLManager`, `OWLOntology`, `OWLDataFactory`, `OWLParser`, `IRI`, etc.). However:

- Java overloads should become optional parameters or explicit JavaScript methods;
- network/document loading should be asynchronous;
- Java `Stream` APIs should map to JavaScript iterables/sets/arrays where appropriate;
- immutable configuration should use copy/`with...` patterns;
- ESM packaging should expose stable entry points instead of Java package mirroring;
- Java interface hierarchies should not be reproduced merely for nominal type ceremony.

The compatibility goal is **semantic and behavioural parity for the `REQUIRED_V1` capability surface**, not line-for-line class hierarchy parity.

### 2.6 Decision: no RDF/XML internal round-trip

The following pattern becomes an explicit anti-pattern:

```text
syntax
  ↓
triples/AST
  ↓
RDF/XML string
  ↓
DOM
  ↓
triples/ontology data
```

The new pipeline must never require RDF/XML merely because an old downstream module accepts XML.

### 2.7 Decision: named graph context is not an OWL axiom property

An OWL axiom belongs to an **ontology**. RDF named-graph membership belongs to an **RDF dataset**.

Do not add fields such as:

```javascript
axiom.graph = ...; // wrong abstraction
```

If named graph/source context matters, preserve it alongside the ontology or dataset in document/load context.

### 2.8 Decision: parser output must not silently discard unsupported constructs

Historical code sometimes recognized a construct during dispatch but returned `null` when rendering it. That is unacceptable in the extracted core.

The public parsing modes are exactly:

```text
strict
compatible
```

`strict` is the default core behaviour.

`compatible` exists only for parsers whose authoritative capability contract explicitly defines recovery behaviour. For each compatible parser, the accepted recovery cases, recovery action, emitted diagnostic and fatal cases **MUST** be specified before the behaviour is implemented.

Generic “catch and continue” recovery is forbidden. A syntactically recognized but unsupported construct **MUST** raise `UnsupportedConstructError` unless that exact construct/recovery case is explicitly permitted by the parser's compatible-mode contract.

Resource/security failures, cancellation, fatal I/O failures and internal invariant failures are always fatal under both modes.

A successful compatible recovery that changes, omits or approximates semantics **MUST** emit a structured diagnostic. The generic presence of `parsingMode: "compatible"` **MUST NOT** imply that every parser supports permissive recovery.

Never silently omit semantic content.

### 2.9 Decision: execute the finite ontology-ingestion programme sequentially

The major ontology-ingestion migrations **MUST** be executed one at a time for the complete finite v1 parser/adapter programme. There is no later “parallel parser migration” mode in this plan.

The mandatory cycle is:

```text
IMPLEMENT
  ↓
VERIFY
  ↓
INTEGRATE
  ↓
LEARN
  ↓
INSTITUTIONALIZE
  ↓
HAND OFF
  ↓
NEXT IMPLEMENTATION
```

Every completed migration **MUST** transfer its reusable lessons into the canonical migration playbook and, wherever practical to express deterministically, into executable tests/contracts/fitness checks before the next migration begins.

The architectural distinction remains absolute:

```text
OWL-native syntax → OWL structural model
RDF syntax        → RDF/JS DatasetCore<Quad> → RdfToOwlTranslator
```

But OWL-native and RDF syntaxes form **one cumulative ingestion-learning programme**. Syntax-local lessons **MUST** be tagged as such; cross-cutting lessons **MUST** be propagated to later phases.

The WIP lock applies to the explicitly enumerated ingestion sequence in §17, including the shared RDF→OWL hardening phase. Non-ingestion work such as CI, fixture acquisition, documentation, provenance work, benchmark tooling and unrelated WebVOWL work **MAY** proceed concurrently, provided it does not pre-implement the production semantics of a later ingestion phase.

Rolling-wave planning **MAY** refine the details or propose reordering of not-yet-started migrations, but it does not change the one-at-a-time WIP rule. Any reordering requires the project decision process defined in §17.

---

## 3. Current Architecture (What Exists Today)

### 3.1 Current pipeline

```text
Input String
    │
    ▼
[importLoader.js] convertToRdfXmlFallback()
    │  parser fallback in OWLAPI-like priority order
    │
    │  non-RDF/XML formats generally become RDF/XML strings
    ▼
RDF/XML String
    │
    ▼
[rdfParser.js] parseRdfXml()
    │
    ├── generic RDF/XML DOM interpretation
    └── WebVOWL-specific extraction/state mutation
    │
    ▼
[ontologyConverter.js]
    │
    ▼
[jsonExporter.js]
    │
    ▼
VOWL-JSON
```

### 3.2 Problems in the current design

#### 3.2.1 `rdfParser.js` combines unrelated abstractions

The file mixes:

- RDF/XML syntax parsing;
- RDF/OWL graph interpretation;
- IRI/base handling;
- RDF collections/blank nodes;
- WebVOWL-specific subjects/maps/restrictions/cardinalities.

This prevents independent correctness testing and forces every format through the same XML-shaped seam.

#### 3.2.2 `rdfXmlSerializer.js` is a bridge shim, not domain functionality

For formats already parsed to RDF statements, serializing to RDF/XML only to reparse it adds:

- CPU and allocation overhead;
- QName/namespace synthesis complexity;
- XML escaping complexity;
- blank-node identifier constraints unrelated to RDF semantics;
- additional failure modes and tests.

All of this disappears from the core once RDF/JS is used directly.

#### 3.2.3 The parser fallback is hardcoded and mixes detection with execution

A hardcoded loop makes parser addition/modification invasive and historically allowed permissive parsers to absorb unrelated formats. Selection should be descriptor/factory-driven and separately testable.

#### 3.2.4 Existing parser outputs are inconsistent

Some parsers construct AST-like structures, some produce triples, and some synthesize RDF/XML. This prevents a clean shared semantic layer.

#### 3.2.5 Current OWL/XML conversion is incomplete and sometimes semantically wrong

The existing `convertOwlXmlToRdfXml()` implementation must be treated as **migration evidence, not as a semantic reference implementation**. It contains useful XML handling learned through real failures, but its OWL coverage is a hand-written subset and several paths either change semantics or silently omit valid OWL 2 constructs.

This conclusion was not reached merely by finding a few missing `else if` branches. The important discovery was that the current implementation is doing three jobs at once:

1. parsing the OWL/XML concrete syntax;
2. interpreting OWL structural constructs;
3. manually rendering the corresponding RDF/XML.

That makes it very easy for a construct to be _recognized syntactically_ but then be represented incorrectly, incompletely, or not at all during RDF/XML emission. The refactor must therefore **not port this control flow unchanged**. It must re-derive the supported semantics from the normative OWL 2 structural model and use the existing implementation only to recover practical parser behaviour that has already been proven useful.

The relevant standards are the W3C **OWL 2 XML Serialization** and **OWL 2 Mapping to RDF Graphs** specifications (see Core References 2 and 4). OWL/XML explicitly mirrors the structural specification, so the natural refactor is:

```text
OWL/XML DOM
    │
    ├── parse IRI / literal / individual / property-expression primitives
    ├── parseClassExpression()       ─┐
    ├── parseDataRange()              │ recursive structural parsing
    ├── parseAnnotation()             │
    └── parseAxiom()                 ─┘
                │
                ▼
         OWLDataFactory
                │
                ▼
        OWL structural objects
```

The parser must **not know how those objects are serialized as RDF/XML**. That becomes the responsibility of the single shared `OwlToRdfTranslator` described later in this document.

##### 3.2.5.1 Concrete defects and required refactor behaviour

The following gaps have already been identified directly in the current `owlXmlParser.js`. They should become explicit migration requirements and regression tests.

| Gap                                                                                                    | Current behaviour / failure mode                                                                                                                                                                                                                                | Why it is wrong or lossy                                                                                                                                                                                                                                                                                                                               | Required refactor solution                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`ObjectHasValue` uses the wrong filler type**                                                        | `renderClassExpressionRdf()` groups `ObjectHasValue` with `ObjectSomeValuesFrom` / `ObjectAllValuesFrom` and searches for a child `Class`.                                                                                                                      | OWL/XML defines `ObjectHasValue` as an object-property expression followed by an **Individual** (`NamedIndividual` or `AnonymousIndividual`), not a class. The current branch therefore cannot correctly represent a valid `ObjectHasValue` expression.                                                                                                | Parse it as `OWLObjectHasValue(objectPropertyExpression, individual)`. Add separate `parseIndividual()` support for named and anonymous individuals. Never reuse the some/all-values class-filler path.                                                                                              |
| **Nested class expressions are only partially recognized**                                             | `SubClassOf`'s caller lists `ObjectUnionOf`, `ObjectIntersectionOf`, and `ObjectComplementOf`, but `renderClassExpressionRdf()` has no implementation for them and ultimately returns `null`.                                                                   | A valid construct can pass initial dispatch yet disappear later. This is a particularly dangerous form of apparent support because it fails silently.                                                                                                                                                                                                  | Replace `renderClassExpressionRdf()` with a recursive `parseClassExpression(element)` that covers every supported class-expression kind and returns an OWL structural object. Unsupported kinds must throw/diagnose explicitly rather than return `null`.                                            |
| **The subclass side of `SubClassOf` is effectively restricted to a named class**                       | The first operand is reduced through `getIriFromEl()` into `subIri`; a complex class expression has no single entity IRI and is therefore dropped.                                                                                                              | OWL 2 permits **any class expression** on both sides of `SubClassOf`. General class inclusion axioms are therefore not faithfully handled.                                                                                                                                                                                                             | Parse both operands through `parseClassExpression()` and construct `OWLSubClassOfAxiom(subClassExpression, superClassExpression)`. Do not special-case the first operand as an IRI.                                                                                                                  |
| **`ObjectSomeValuesFrom` / `ObjectAllValuesFrom` accept only a named property and named class filler** | The renderer searches for immediate `ObjectProperty` and `Class` children.                                                                                                                                                                                      | Both use an **ObjectPropertyExpression** and a **ClassExpression**. Valid inverse-property expressions and nested fillers such as intersections, unions, complements, enumerations or restrictions are lost.                                                                                                                                           | Implement `parseObjectPropertyExpression()` (`OWLObjectProperty` / `OWLObjectInverseOf`) and recursively parse the filler with `parseClassExpression()`.                                                                                                                                             |
| **`ObjectInverseOf` is absent as a reusable property-expression primitive**                            | Property axioms and restrictions generally search only for `ObjectProperty`.                                                                                                                                                                                    | Many OWL 2 object-property constructs accept an `ObjectPropertyExpression`, not only a named property. Treating the named-property case as the whole grammar silently narrows valid OWL 2.                                                                                                                                                             | Make object-property expressions a first-class structural parser primitive and use it everywhere the structural specification says `OPE`, including restrictions, domains/ranges and relevant property axioms.                                                                                       |
| **Qualified cardinalities are currently changed into unqualified cardinalities**                       | `ObjectMinCardinality`, `ObjectMaxCardinality`, and `ObjectExactCardinality` emit only `owl:minCardinality`, `owl:maxCardinality`, or `owl:cardinality`; any optional class-expression filler is ignored.                                                       | `ObjectMinCardinality(1 :p :C)` is **not** equivalent to unqualified `ObjectMinCardinality(1 :p)`. The normative RDF mapping uses `owl:minQualifiedCardinality` plus `owl:onClass` (and corresponding max/exact forms) when a filler is present. This is a direct semantic change, not merely incomplete serialization.                                | Structural cardinality objects must retain `{cardinality, propertyExpression, optionalFiller}`. The shared OWL→RDF translator then chooses qualified vs. unqualified RDF vocabulary. Add regression fixtures for all six qualified/unqualified object-cardinality forms.                             |
| **Missing cardinality is silently invented as `1`**                                                    | `exprEl.getAttribute("cardinality")                                                                                                                                                                                                                             |                                                                                                                                                                                                                                                                                                                                                        | "1"`.                                                                                                                                                                                                                                                                                                | OWL/XML declares `cardinality` as required. Inventing a value converts malformed input into a different valid ontology and hides the source error. | Validate the required attribute and throw a typed syntax/parse error if absent or not a non-negative integer. Recovery, if ever supported, must be explicit and diagnostic—not semantic invention. |
| **Data restrictions and data ranges are largely absent**                                               | No structural support exists for `DataSomeValuesFrom`, `DataAllValuesFrom`, `DataHasValue`, data cardinalities, `DataIntersectionOf`, `DataUnionOf`, `DataComplementOf`, `DataOneOf`, or `DatatypeRestriction`.                                                 | These are first-class OWL 2 constructs. Treating data-property semantics as only named datatypes and ranges leaves a substantial portion of OWL 2 unrepresentable.                                                                                                                                                                                     | Implement recursive `parseDataRange()` and the data restriction class-expression constructors. Remember that `DataSomeValuesFrom` / `DataAllValuesFrom` may contain one or more data-property expressions before the data range.                                                                     |
| **Object/data property domains and ranges collapse expressions to IRIs**                               | `ObjectPropertyDomain` / `Range` mention unions/intersections in lookup code but call `getIriFromEl()` on them; `DataPropertyDomain` accepts only `Class`; `DataPropertyRange` accepts only `Datatype`.                                                         | Domains/ranges are structural expressions: object/data property domains and object property ranges use a `ClassExpression`; a data property range uses a `DataRange`. Complex valid expressions are silently omitted.                                                                                                                                  | Construct the corresponding structural axiom using `parseObjectPropertyExpression()` / `parseDataPropertyExpression()` plus `parseClassExpression()` or `parseDataRange()`.                                                                                                                          |
| **`EquivalentClasses` and `DisjointClasses` handle named classes only**                                | Both branches collect only immediate `Class` elements.                                                                                                                                                                                                          | Their operands are arbitrary `ClassExpression`s. Restrictions, unions, intersections, complements, one-of expressions, etc. are therefore excluded.                                                                                                                                                                                                    | Parse all class-expression operands recursively and create one n-ary structural axiom.                                                                                                                                                                                                               |
| **N-ary axiom identity is destroyed by pairwise RDF emission**                                         | `EquivalentClasses` and `DisjointClasses` are expanded into all pair combinations.                                                                                                                                                                              | Even where pairwise triples can be logically equivalent, they are **not structurally equivalent to the original OWL axiom**. For `DisjointClasses` with more than two operands the normative OWL→RDF mapping uses `owl:AllDisjointClasses` plus an RDF list. N-ary axiom annotations also cannot be preserved correctly by ad-hoc pairwise expansion.  | Preserve the original n-ary `OWLEquivalentClassesAxiom` / `OWLDisjointClassesAxiom` in the structural model. Let the shared translator implement the W3C RDF mapping, including list/blank-node and annotation rules.                                                                                |
| **Property chains and several property-axiom families are absent**                                     | `SubObjectPropertyOf` handles only two named object properties. There is no `ObjectPropertyChain`, `EquivalentObjectProperties`, `DisjointObjectProperties`, `EquivalentDataProperties`, `DisjointDataProperties`, etc.                                         | OWL/XML's axiom grammar is materially broader than the implemented branch set. Property chains are especially important because they are structurally ordered and map to RDF lists.                                                                                                                                                                    | Build a coverage matrix from the W3C `Axiom` group. Add dedicated structural constructors for each supported axiom. `SubObjectPropertyOf(ObjectPropertyChain(...), superProperty)` must retain chain order exactly.                                                                                  |
| **Large assertion/ontology axiom families are missing entirely**                                       | There are no branches for `DisjointUnion`, `DatatypeDefinition`, `HasKey`, `SameIndividual`, `DifferentIndividuals`, `ClassAssertion`, object/data property assertions, negative property assertions, or the annotation-property hierarchy/domain/range axioms. | This is not merely a serializer gap: a valid OWL/XML ontology can contain these constructs and currently receive no corresponding semantic representation.                                                                                                                                                                                             | Classify every normative axiom kind as **implemented**, **explicitly unsupported**, or **out of initial scope**. Never leave valid constructs in an implicit fall-through state. Implement in priority order based on WebVOWL usage, but keep the model/API taxonomy compatible with full OWL 2.     |
| **Axiom annotations are ignored**                                                                      | Top-level axiom branches read their main children but do not preserve leading `Annotation` elements belonging to the axiom.                                                                                                                                     | Axiom annotations are part of OWL structural equivalence. Dropping them loses ontology content even if the unannotated logical axiom survives.                                                                                                                                                                                                         | `parseAxiom()` must parse the axiom's annotation set first and attach it to the constructed `OWLAxiom`. The later OWL→RDF translator handles `owl:Axiom`, `owl:annotatedSource`, `owl:annotatedProperty`, and `owl:annotatedTarget` according to the normative mapping.                              |
| **Annotation values are incorrectly narrowed to literals**                                             | Ontology annotations and `AnnotationAssertion` call `getLiteralFromEl()`. If no `Literal` child exists, that helper falls back to `element.textContent`.                                                                                                        | An OWL annotation value may be an **IRI, anonymous individual, or literal**. The text-content fallback can therefore turn an IRI-valued annotation into a plain literal rather than merely dropping it. This is an active semantic corruption path.                                                                                                    | Implement `parseAnnotationValue()` with explicit branches for IRI, anonymous individual and literal. Remove generic `textContent` fallback from semantic parsing. Malformed shapes must fail explicitly.                                                                                             |
| **Literal datatype information is parsed and then discarded**                                          | `getLiteralFromEl()` extracts `datatype`, but annotation emission only uses the value and optional language tag.                                                                                                                                                | Typed literal identity is part of RDF/OWL semantics; `"1"^^xsd:integer` is not interchangeable with an untyped/plain string.                                                                                                                                                                                                                           | Construct `OWLLiteral` with lexical form plus exactly one of language/datatype as required. Never convert through XML text serialization. Add tests for language-tagged, typed and plain literals, including lexical forms that share a value but not a lexical representation.                      |
| **Nested annotations are not represented**                                                             | The current annotation handling is single-level.                                                                                                                                                                                                                | OWL 2 permits annotations on annotations; the normative RDF mapping recursively reifies them.                                                                                                                                                                                                                                                          | Model `OWLAnnotation` recursively, including its own annotation set. Keep this in the structural layer so both OWL/XML parsing and OWL→RDF mapping share one representation.                                                                                                                         |
| **Anonymous individuals are not supported where OWL allows them**                                      | Current code generally assumes IRIs for individual-like values and annotation subjects/values.                                                                                                                                                                  | OWL/XML has both `NamedIndividual` and `AnonymousIndividual`; anonymous individuals can participate in class/assertion/value constructs and annotation subjects/values where permitted.                                                                                                                                                                | Add `OWLAnonymousIndividual` / `parseIndividual()` and preserve `nodeID` semantics as document-scoped structural identity. Do not confuse generated RDF blank nodes with source anonymous individuals.                                                                                               |
| **Anonymous ontologies are assigned a fabricated ontology IRI**                                        | If neither `ontologyIRI` nor a base is available, the converter invents `http://haddenindustries.com/ontology/owlxml`.                                                                                                                                          | OWL 2 explicitly permits an ontology with no ontology IRI. The RDF mapping represents such an ontology header with a fresh blank node. Inventing a global IRI changes ontology identity.                                                                                                                                                               | Represent ontology identity as `OWLOntologyID` with optional ontology/version IRIs. Never synthesize a semantic ontology IRI. Document/source IRI belongs in `OntologyDocumentContext`, not in ontology identity unless the syntax explicitly says so.                                               |
| **IRI resolution is rooted too high and is partly heuristic**                                          | A single root `baseAttr` is used; `ontologyIRI` itself is not normalized through the same resolver; relative `<Prefix IRI>` values are stored directly; only selected URI schemes are specially recognized.                                                     | OWL/XML requires every schema value of type `xsd:anyURI` to be resolved against its **respective XML Base**, which is inherited/scoped by element. Relative IRIs can therefore have different effective bases within one document. OWL literals of datatype `xsd:anyURI`, conversely, must remain opaque lexical values and must not be base-resolved. | Add `effectiveBaseIri(element, documentIri)` and a strict `resolveAnyUriAttribute(element, value)`. Apply it to ontology/version/import/prefix/entity/facet IRIs according to the OWL/XML schema. Keep literal lexical values out of this resolver. Test nested `xml:base`.                          |
| **XML namespace prefixes and OWL abbreviated-IRI prefixes are conflated**                              | The same `prefixMap` is populated from `xmlns:*` attributes and OWL `<Prefix>` elements.                                                                                                                                                                        | OWL/XML specifies that prefixes used by `abbreviatedIRI` are declared by OWL `<Prefix>` elements and are file-scoped. XML namespace bindings serve XML QName parsing and are a different mechanism. Conflation can accidentally accept non-conforming abbreviated IRIs and makes parser behaviour depend on serializer concerns.                       | Maintain separate XML namespace context and OWL abbreviated-IRI prefix context. In strict mode, resolve `abbreviatedIRI` only from the OWL prefix declarations required by the specification; any OWLAPI compatibility extensions should be deliberate and separately tested.                        |
| **Unknown annotation predicates can disappear because RDF/XML needs a QName**                          | `getPredXmlTag()` returns `null` if an annotation-property IRI cannot be converted into a convenient XML element name, and the caller simply emits nothing.                                                                                                     | This is a serializer artifact masquerading as an ontology limitation. RDF/OWL imposes no requirement that an annotation property already have a convenient source prefix.                                                                                                                                                                              | This entire failure mode disappears when the parser creates `OWLAnnotationProperty` / `OWLAnnotation` objects. If RDF output is later requested, the shared RDF layer/serializer handles namespace allocation independently.                                                                         |
| **Unsupported constructs are silently swallowed**                                                      | The top-level `else if` chain has no mandatory unsupported-construct path; helper functions return `null`; many callers use `if (x) { emit... }` and otherwise continue.                                                                                        | Silent omission is worse than an explicit unsupported error because the result can look valid while containing a different ontology. Earlier parser work already demonstrated how dangerous silent data loss is.                                                                                                                                       | In strict mode, every syntactically recognized but unsupported OWL construct must raise a typed `UnsupportedConstructError` (or equivalent) carrying syntax, construct name and source location. Compatibility mode may recover only under an explicit documented policy and must emit a diagnostic. |

This table is intentionally broader than the subset currently needed by WebVOWL. It does **not** mean every missing OWL 2 construct must be implemented in the first extraction phase. It means the refactor must know which semantic surface exists and must never confuse “not yet implemented” with “successfully parsed.”

A simple coverage state should therefore be maintained for every normative construct:

```text
SUPPORTED_AND_TESTED
EXPLICITLY_UNSUPPORTED       // parser throws/diagnoses
OUT_OF_INITIAL_SCOPE         // documented product decision; parser still throws/diagnoses
```

There must be no fourth state equivalent to **recognized and silently dropped**.

##### 3.2.5.2 How these gaps were found

The first defects were discovered by following individual code paths, but that quickly exposed a more reliable method that must be reused during the rest of the refactor.

**1. Start from the normative grammar, not from the existing switch/`if` statements.**

The W3C OWL/XML schema provides a finite manifest of structural categories such as:

```text
ClassExpression
DataRange
ObjectPropertyExpression
Individual
AnnotationValue
Axiom
```

For each category, enumerate every allowed child production. This immediately reveals missing constructs that source-led review cannot reveal because there may be no branch to search for.

**2. Build an implementation coverage matrix mechanically.**

Inventory every current dispatch case (`name === ...`, token keyword, AST node kind, handler registration) and compare it with the normative manifest. For `owlXmlParser.js`, this showed that the top-level branch set covers only part of the W3C `Axiom` group and that `renderClassExpressionRdf()` covers an even smaller subset of `ClassExpression`.

The coverage matrix should record at least:

| Construct                | Normative operand shape | Current parser recognizes? | Current output retains all operands? | Structural target           | Test fixture |
| ------------------------ | ----------------------- | -------------------------: | -----------------------------------: | --------------------------- | ------------ |
| `ObjectHasValue`         | `OPE, Individual`       |                        yes |                               **no** | `OWLObjectHasValue`         | required     |
| `ObjectUnionOf`          | `ClassExpression{2..n}` |                     partly |                               **no** | `OWLObjectUnionOf`          | required     |
| `ObjectExactCardinality` | `n, OPE, [CE]`          |                        yes |                **no** when qualified | `OWLObjectExactCardinality` | required     |
| ...                      | ...                     |                        ... |                                  ... | ...                         | ...          |

This matrix becomes a migration artefact, not a one-off review note.

**3. Verify operand _types and cardinalities_, not just construct names.**

This is how the `ObjectHasValue` defect was found. The implementation grouped it with some/all-values restrictions because their RDF shape looks similar, but the OWL/XML schema says its second operand is an `Individual`, whereas some/all-values use a `ClassExpression`.

The same check exposed:

- optional class/data-range fillers on qualified cardinalities;
- arbitrary class expressions in domains/ranges;
- multiple data-property expressions in data some/all-values restrictions;
- n-ary sets versus ordered property chains.

A branch with the right name can still be semantically wrong if it expects the wrong child category.

**4. Trace every parsed datum through to the semantic result.**

The literal datatype bug was found by ordinary data-flow inspection: `getLiteralFromEl()` successfully creates a `datatype` value, but the emitter never uses it. Perform the same “parsed → stored → emitted/constructed” trace for:

- datatype and language;
- ontology/version/document IRIs;
- annotations and nested annotations;
- prefix/base context;
- anonymous-individual identifiers;
- cardinality fillers;
- source locations/diagnostics where retained.

Any value that is parsed and then disappears is a candidate semantic-loss defect.

**5. Audit every silent-exit path.**

Search specifically for patterns such as:

```text
return null
return ""
continue
if (value) { ... }        // with no else/error
catch { ... }             // swallowed failure
fallback default values
unknown-token recovery
```

Then ask: _Can valid source syntax reach this path?_ The union/intersection/complement gap was found because caller code deliberately admitted those node names, while the renderer had no corresponding case and ended in `return null`.

This audit is particularly important because the existing differential testing history has already shown that the most damaging parser bugs often produce **valid-looking but smaller output**, not exceptions.

**6. Use the W3C OWL→RDF mapping only as a semantic oracle for output, not as the parser's internal model.**

Where the old parser emits RDF/XML, compare the intended structural construct with the normative Mapping to RDF Graphs. This exposed, for example:

- `ObjectHasValue` mapping to the individual via `owl:hasValue`;
- qualified cardinality mapping via `owl:*QualifiedCardinality` plus `owl:onClass` / `owl:onDataRange`;
- `DisjointClasses` with more than two operands mapping through `owl:AllDisjointClasses` and an RDF list;
- axiom annotation reification rules.

The solution, however, is **not** to copy those RDF rules into each parser. The parser should construct the structural object; one shared `OwlToRdfTranslator` should implement the mapping once.

**7. Cross-check Java OWLAPI at the behavioural boundary without deriving the new implementation from OWLAPI source.**

For each fixture, execute the pinned Java OWLAPI reference version and compare the resulting structural ontology with the JavaScript result, not a textual RDF/XML serialization. Prefer generated structural snapshots, public Javadocs/API contracts, documented format identities and externally observable accept/reject/error behaviour as the compatibility evidence.

Use OWLAPI to answer behavioural questions such as:

- whether a particular input is accepted or rejected;
- the structural axiom/class-expression result produced for that input;
- compatibility/permissive behaviour not obvious from the normative syntax;
- externally observable error/recovery behaviour;
- IRI/prefix handling as observed at the API boundary;
- parser ordering/detection behaviour;
- edge cases around annotations and imports.

**Do not translate Java OWLAPI implementation algorithms, branch structure, parser handlers or source comments into new `owlapi-js` production code.** The implementation source may need to be inspected during the one-time provenance audit of legacy WebVOWL code, but it is not the design source for the replacement implementation. Where compatibility facts are not stated by a public specification, obtain them by black-box differential fixtures wherever practical and record the resulting behaviour in project-owned compatibility notes/tests.

Normative/public syntax specifications remain authoritative for language semantics. Java OWLAPI is a behavioural compatibility oracle, not a production-code template. This separation is an architectural requirement independent of which licence `owlapi-js` eventually adopts; it keeps the new implementation's provenance and licence choice from becoming unnecessarily coupled to OWLAPI's implementation terms.

**8. Convert every discovered gap into the smallest possible fixture before refactoring it.**

Do not rely only on the 44-ontology end-to-end corpus. Add focused source fixtures such as:

```text
owlxml/object-has-value-named-individual.owl
owlxml/object-has-value-anonymous-individual.owl
owlxml/subclass-complex-left-hand-side.owl
owlxml/nested-intersection-filler.owl
owlxml/qualified-object-cardinality.owl
owlxml/qualified-data-cardinality.owl
owlxml/typed-annotation-literal.owl
owlxml/iri-valued-annotation.owl
owlxml/nary-disjoint-classes.owl
owlxml/nested-xml-base.owl
owlxml/anonymous-ontology.owl
owlxml/axiom-annotation.owl
```

Each fixture should have a Java OWLAPI structural reference snapshot and, where applicable, an RDF graph-equivalence expectation produced through the shared OWL→RDF translator.

##### 3.2.5.3 Apply the same gap-identification method to every parser refactor

The OWL/XML findings are a warning against assuming that an existing parser is complete merely because it passes the current WebVOWL corpus. The same audit must precede the migration of **Functional Syntax, Manchester Syntax, DL Syntax, KRSS/KRSS1 and KRSS2**.

There is also a higher-level audit that must happen **before** reviewing any individual parser: inventory the complete parser surface of the OWLAPI version being used as the behavioural reference. This is how the previously overlooked KRSS1 gap was found. OWLAPI 5's `OWLParser` implementation list contains both `KRSSOWLParser` and `KRSS2OWLParser`; inspecting only the WebVOWL source tree made KRSS2 look like “the KRSS parser” and hid the original KRSS dialect entirely. The extraction **MUST** therefore account for every OWLAPI parser family in the authoritative capability matrix using the exact release-status vocabulary `REQUIRED_V1`, `DEFERRED`, `UNSUPPORTED_BY_DESIGN`, or `DELEGATED`. No parser family may be absent accidentally.

For every OWL-native parser:

1. **Inventory the relevant OWLAPI parser/factory/format identities before touching code.** Record the Java class, factory, document-format factory, package/dialect and intended `owlapi-js` status. This catches missing parser families before implementation begins.
2. **Identify the authoritative grammar/reference source without using OWLAPI implementation source as the implementation specification.**
   - Functional Syntax: W3C OWL 2 Structural Specification / Functional-Style Syntax first; use OWLAPI only as a black-box compatibility oracle.
   - Manchester: use the published/documented Manchester syntax and other public syntax material first; use OWLAPI public API documentation and differential fixtures to establish OWLAPI-specific compatibility behaviour.
   - DL Syntax: use the published syntax/dialect definition where available, then characterize OWLAPI's externally observable dialect behaviour with fixtures rather than translating its parser implementation.
   - KRSS/KRSS1 and KRSS2: use the published KRSS family specifications/documentation where available and audit the two OWLAPI parser/format identities separately through public API metadata and black-box fixtures. KRSS2 explicitly supports an extended KRSS vocabulary; do **not** assume that one parser can stand in for the other merely because of substantial syntactic overlap.

   For a non-W3C syntax where OWLAPI behaviour is effectively part of the compatibility target and the public syntax specification leaves an ambiguity, encode that ambiguity as a focused differential test. The resulting test expectation is project-owned behavioural evidence; the Java implementation algorithm is not copied into the JavaScript implementation.

3. **Enumerate productions/constructs before reading the JS branch coverage.**
4. **Map each production to one structural `OWLDataFactory` constructor.** A syntax parser should not invent a syntax-specific semantic AST if an OWL structural object already exists.
5. **Compare operand category, arity, ordering and optionality.** In particular distinguish unordered OWL sets from ordered structures such as property chains.
6. **Trace literals, IRIs, annotations and anonymous individuals end-to-end.** These are cross-format semantic values and should converge on the same core constructors.
7. **Audit silent recovery/defaulting paths.** Any permissive behaviour inherited from the existing parser must have a sniff guard and explicit diagnostics, as already learned from the Manchester parser.
8. **Create a per-parser coverage matrix and focused differential fixtures before changing emission.**
9. **Retarget emission to structural objects only after the matrix is understood.** Do not simultaneously redesign the grammar and semantic model without reference tests.

For **RDF syntaxes**, the analogous audit occurs one layer later. Syntax parsing should normally be delegated to the selected **format-specific standards parser** (N3.js, `rdfxml-streaming-parser`, or Digital Bazaar `jsonld.js`); the gap analysis should target the shared **`RdfToOwlTranslator`** instead, comparing its handler/recognition coverage against the W3C RDF→OWL mapping and Java OWLAPI's `OWLRDFConsumer`. A Turtle, RDF/XML or JSON-LD adapter must not independently reimplement OWL reconstruction rules.

The parser adapter itself still requires a standards-conformance audit: pin the exact upstream suite revision, classify every upstream test under §18.13, execute every `REQUIRED` test in `owlapi-js` CI, normalize errors and RDF/JS terms at the adapter boundary, and record deliberately deferred or unsupported-by-design syntax features in the capability matrix. This lets syntax correctness and OWL reconstruction correctness fail independently and visibly.

A reusable review worksheet should therefore exist for each module:

```text
Parser/module:
Authoritative grammar/spec:
OWLAPI reference parser class/version:
OWLAPI parser factory / document-format identity:
Capability status: REQUIRED_V1 | DEFERRED | UNSUPPORTED_BY_DESIGN | DELEGATED

[ ] Complete OWLAPI parser-surface inventory entry exists
[ ] Complete construct/production inventory
[ ] Operand types checked
[ ] Operand arities/cardinalities checked
[ ] Ordered vs unordered collections checked
[ ] IRI/base/prefix semantics checked
[ ] Literal datatype/language semantics checked
[ ] Annotation + nested annotation semantics checked
[ ] Anonymous individuals checked
[ ] Unsupported constructs fail explicitly
[ ] Deferred/unsupported OWLAPI capabilities are annotated at the nearest implementation point using the source-code parity-comment standard in §14.10
[ ] Silent null/continue/catch/default paths audited
[ ] Focused Java differential fixtures added
[ ] Structural snapshot parity reached
[ ] OWL→RDF graph-equivalence test passes where applicable
[ ] Large-file / malformed-input / fail-fast regression passes
```

##### 3.2.5.4 Acceptance gate for the OWL/XML migration

The OWL/XML refactor is not complete merely when existing WebVOWL output remains green. Before the old converter can be deleted, all of the following must be true:

- `owlXmlParser` produces only structural OWL objects; it contains no RDF/XML string generation or QName synthesis.
- Every W3C OWL/XML structural construct is recorded in the coverage matrix as supported, explicitly unsupported, or deliberately deferred.
- No valid supported construct can reach a silent `null`/empty/continue path that drops semantics.
- `ObjectHasValue`, nested class expressions, inverse properties, qualified cardinalities, data restrictions/ranges, annotation values, axiom annotations and anonymous ontologies have focused regression fixtures.
- IRI resolution obeys element-scoped XML Base semantics and keeps OWL literal lexical values opaque.
- OWL `<Prefix>` declarations are semantically separate from XML namespace declarations.
- Structural output for the `REQUIRED_V1` compatibility surface is equivalent to Java OWLAPI output for focused fixtures and the real-world differential corpus, except for exact approved expected-difference rules.
- `OwlToRdfTranslator` independently maps those structural objects to a graph equivalent to the normative W3C mapping.
- Unsupported constructs fail explicitly with actionable diagnostics rather than yielding a smaller ontology.

The broader lesson is critical to the whole extraction: **do not measure parser parity by whether it produces parseable RDF/XML or by whether WebVOWL happens to render something plausible. Measure it at the OWL structural boundary, then test RDF mapping and VOWL conversion as separate downstream responsibilities.**

### 3.3 Current file inventory and revised destination

| Current file                | Current role                      | Revised destination / treatment                                                                                                                                                                                                                      |
| --------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manchesterSyntaxParser.js` | Manchester → RDF/XML              | Retarget to structural OWL parser; move to `owlapi-js/parsers/manchester/`                                                                                                                                                                           |
| `functionalSyntaxParser.js` | Functional → RDF/XML              | Retarget to structural OWL parser; **recommended first migration**                                                                                                                                                                                   |
| `owlXmlParser.js`           | OWL/XML → RDF/XML                 | Rewrite emission to structural model; keep XML-specific helpers                                                                                                                                                                                      |
| `dlSyntaxParser.js`         | DL → RDF/XML                      | Retarget to structural model                                                                                                                                                                                                                         |
| `krss2SyntaxParser.js`      | KRSS2 → RDF/XML                   | Retarget to shared KRSS structural parser core + strict KRSS2 dialect adapter                                                                                                                                                                        |
| _(not currently present)_   | original KRSS / KRSS1             | Keep parser implementation `DEFERRED`; add/retain distinct format + compatibility identity, grammar-gap analysis, fixtures and future-ready insertion point; share machinery with KRSS2 only when a later approved implementation proves equivalence |
| `turtleParser.js`           | Turtle → triples via N3           | Replace with separate N3.js-backed RDF/JS format identities/adapters for Turtle, TriG, N-Triples and N-Quads; keep broader N3 language ingestion `DEFERRED`                                                                                          |
| `jsonLdParser.js`           | JSON-LD → triples                 | Replace/thin into Digital Bazaar `jsonld.js` adapter; translate its RDF dataset directly to RDF/JS; inject/restrict remote document loading                                                                                                          |
| `rdfParser.js`              | RDF/XML + OWL/RDF + VOWL monolith | Decompose; do not move monolith intact                                                                                                                                                                                                               |
| `rdfXmlSerializer.js`       | triples → RDF/XML                 | Delete from internal pipeline                                                                                                                                                                                                                        |
| `importLoader.js`           | fallback + imports                | Split manager orchestration from WebVOWL-specific document resolver/catalog policy                                                                                                                                                                   |
| `iriResolver.js`            | IRI resolution                    | Split generic IRI/base rules into core; keep WebVOWL URL/catalog concerns outside                                                                                                                                                                    |
| `constants.js`              | namespaces/sniff size             | Move reusable vocabulary/security constants into core                                                                                                                                                                                                |
| `domUtils.js`               | XML helpers                       | Move only generic helpers required by OWL/XML/XML parsing                                                                                                                                                                                            |
| `xmlUtils.js`               | XML entity resolution             | Move with hard resource limits/security review                                                                                                                                                                                                       |
| `parserContext.js`          | VOWL state                        | Stay in WebVOWL or disappear into `VOWLBuilder`                                                                                                                                                                                                      |
| `ontologyConverter.js`      | legacy VOWL conversion            | Retain at its current path for characterization/reference through Phase 16; make it production-unreachable at Phase 8 and delete it in Phase 17                                                                                                      |
| `jsonExporter.js`           | legacy VOWL-JSON output           | Retain at its current path for characterization/reference through Phase 16; make it production-unreachable at Phase 8 and delete it in Phase 17                                                                                                      |
| `index.js`                  | WebVOWL entry                     | Stay; consume public `owlapi-js` API                                                                                                                                                                                                                 |

---

## 4. Target Architecture

### 4.1 Final WebVOWL pipeline

```text
Input / ontology document
        │
        ▼
┌────────────────────────────────────────────────────────────┐
│ owlapi-js: OWLOntologyManager                              │
│                                                            │
│  format hint/sniff → parser factory → parser               │
│        │                                                   │
│        ├── OWL-native syntax ───────────────┐              │
│        │                                    ▼              │
│        │                           OWL structural objects   │
│        │                                    │              │
│        └── RDF syntax → RDF/JS Dataset ──→ RdfToOwl       │
│                                             │              │
│                                             ▼              │
│                                         OWLOntology        │
└───────────────────────────────┬────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────┐
│ WebVOWL: VOWLBuilder                                       │
│ consumes OWLOntology only                                  │
│ no XML, no syntax detection, no parser fallback            │
└───────────────────────────────┬────────────────────────────┘
                                │
                                ▼
VOWLBuilder result → VOWL-JSON consumed by WebVOWL
```

After the Phase 8 production cutover, the production graph **MUST NOT** import
the legacy `ontologyConverter.js`, `jsonExporter.js`, parser, RDF/XML bridge or
serializer path. Those files remain at their existing paths for finite
characterization/reference work until Phase 17; retaining a file is not a
runtime fallback or an authorization to keep it production-reachable.

### 4.2 Internal `owlapi-js` architecture

```text
                                ┌─────────────────────┐
                                │ OWLOntologyManager  │
                                └──────────┬──────────┘
                                           │
                     ┌─────────────────────┴─────────────────────┐
                     │                                           │
          OWL-native syntax front ends                    RDF front end
          │       │       │       │                      │
          │       │       │       │                      ▼
       Func.   Manch.  OWL/XML   DL/KRSS       direct RDF adapters
          │       │       │       │                      │
          └───────┴───────┴───────┘                      ▼
                     │                           DatasetCore<Quad>
                     │                                   │
                     ▼                                   ▼
              OWLDataFactory                       RdfToOwlTranslator
                     │                                   │
                     └──────────────────┬────────────────┘
                                        ▼
                                  OWLOntology
                                        │
                                        ├── semantic queries/indexes
                                        │
                                        └── OwlToRdfTranslator
                                                  │
                                                  ▼
                                          DatasetCore<Quad>
```

### 4.3 Two canonical representations, deliberately

| Concern                  | Canonical representation              | Why                                                                                 |
| ------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------- |
| OWL semantics/API        | W3C OWL structural model              | Syntax-independent OWL constructs; aligns with OWLAPI and Direct Semantics tooling  |
| RDF data/datasets        | RDF/JS `DatasetCore<Quad>`            | Standard JS interoperability; preserves graph membership; serialization-independent |
| Source/document concerns | `OntologyDocumentContext`             | Document IRI, format, prefix/context metadata, selected RDF graph, diagnostics      |
| VOWL                     | WebVOWL-specific builder/output model | Visualization concern, deliberately downstream                                      |

The representations are connected, but none should impersonate another.

---

## 5. The OWL Structural Model

### 5.1 Why this model is the correct centre

The W3C Structural Specification does more than list syntax productions. It defines:

- the syntax-independent classes/associations of OWL 2;
- which collections are sets versus ordered lists;
- structural equivalence;
- ontology identity/import declarations;
- entities, anonymous individuals, literals;
- class expressions and data ranges;
- property expressions;
- axioms and axiom annotations;
- ontology annotations.

This gives `owlapi-js` a standards-defined domain model instead of a project-specific AST.

### 5.2 Minimal first-class object families

The initial implementation should include the object families required by existing parser coverage and VOWL, while naming/structuring them so complete OWL 2 can be added without redesign.

#### Core values

```text
IRI
OWLLiteral
OWLAnonymousIndividual
OWLAnnotation
OWLImportsDeclaration
OWLOntologyID
```

#### Entities

```text
OWLClass
OWLDatatype
OWLObjectProperty
OWLDataProperty
OWLAnnotationProperty
OWLNamedIndividual
```

#### Object property expressions

```text
OWLObjectProperty
OWLObjectInverseOf
```

#### Class expressions

At minimum the constructs already encountered by WebVOWL, then expand systematically:

```text
OWLClass
OWLObjectIntersectionOf
OWLObjectUnionOf
OWLObjectComplementOf
OWLObjectOneOf
OWLObjectSomeValuesFrom
OWLObjectAllValuesFrom
OWLObjectHasValue
OWLObjectHasSelf
OWLObjectMinCardinality
OWLObjectMaxCardinality
OWLObjectExactCardinality
OWLDataSomeValuesFrom
OWLDataAllValuesFrom
OWLDataHasValue
OWLDataMinCardinality
OWLDataMaxCardinality
OWLDataExactCardinality
```

#### Data ranges

```text
OWLDatatype
OWLDataIntersectionOf
OWLDataUnionOf
OWLDataComplementOf
OWLDataOneOf
OWLDatatypeRestriction
OWLFacetRestriction
```

#### Axioms

Implement from actual WebVOWL coverage first, but preserve the OWL 2 taxonomy:

```text
OWLDeclarationAxiom
OWLSubClassOfAxiom
OWLEquivalentClassesAxiom
OWLDisjointClassesAxiom
OWLDisjointUnionAxiom
OWLSubObjectPropertyOfAxiom
OWLSubPropertyChainOfAxiom
OWLEquivalentObjectPropertiesAxiom
OWLDisjointObjectPropertiesAxiom
OWLObjectPropertyDomainAxiom
OWLObjectPropertyRangeAxiom
OWLInverseObjectPropertiesAxiom
OWLFunctionalObjectPropertyAxiom
OWLInverseFunctionalObjectPropertyAxiom
OWLReflexiveObjectPropertyAxiom
OWLIrreflexiveObjectPropertyAxiom
OWLSymmetricObjectPropertyAxiom
OWLAsymmetricObjectPropertyAxiom
OWLTransitiveObjectPropertyAxiom
OWLSubDataPropertyOfAxiom
OWLEquivalentDataPropertiesAxiom
OWLDisjointDataPropertiesAxiom
OWLDataPropertyDomainAxiom
OWLDataPropertyRangeAxiom
OWLFunctionalDataPropertyAxiom
OWLDatatypeDefinitionAxiom
OWLHasKeyAxiom
OWLSameIndividualAxiom
OWLDifferentIndividualsAxiom
OWLClassAssertionAxiom
OWLObjectPropertyAssertionAxiom
OWLNegativeObjectPropertyAssertionAxiom
OWLDataPropertyAssertionAxiom
OWLNegativeDataPropertyAssertionAxiom
OWLAnnotationAssertionAxiom
OWLSubAnnotationPropertyOfAxiom
OWLAnnotationPropertyDomainAxiom
OWLAnnotationPropertyRangeAxiom
```

SWRL is a later scope decision unless current Java parity tests demonstrate it is required.

### 5.3 `OWLDataFactory` is essential, not decorative

Use one `OWLDataFactory` as the construction seam for structural objects:

```javascript
const cls = dataFactory.getOWLClass(IRI.create("https://example.org/Person"));
const prop = dataFactory.getOWLObjectProperty(
  IRI.create("https://example.org/hasParent"),
);
const some = dataFactory.getOWLObjectSomeValuesFrom(prop, cls);
const axiom = dataFactory.getOWLSubClassOfAxiom(child, some, annotations);
```

Benefits:

- one validation/normalization point;
- canonical ordering for set-valued operands;
- optional object interning;
- structural-key generation;
- consistent immutable instances;
- easy differential construction tests;
- parser implementations stop creating ad-hoc object shapes.

### 5.4 Immutability

OWL structural objects should be effectively immutable after construction.

Recommended implementation:

- private fields where useful;
- no mutating setters;
- copy-returning APIs for annotations/collections;
- `Object.freeze()` selectively on public records/arrays where cost is acceptable;
- ontology mutation (if supported) occurs through manager/ontology change APIs, not by mutating an axiom object.

This aligns with RDF/JS's own immutability expectations and avoids invalidating structural indexes.

### 5.5 The JavaScript structural-equality problem

This is one of the most important implementation details in the entire extraction.

JavaScript's `Set` and `Map` use object identity:

```javascript
new Set([{ x: 1 }, { x: 1 }]).size === 2;
```

OWL structural equivalence does **not** work that way. The W3C specification states that, by default, associations are unordered sets with repetitions disallowed; some explicitly ordered associations have list semantics. It also requires structural rather than object-identity comparison and recommends eliminating duplicates when parsing exchange syntaxes.

Therefore this is wrong:

```javascript
this.axioms = new Set(); // insufficient by itself for independently created equal axioms
```

Use a canonical structural identity layer, for example:

```javascript
class StructuralSet {
  #items = new Map();

  add(value) {
    this.#items.set(value.structuralKey(), value);
    return this;
  }

  has(value) {
    return this.#items.has(value.structuralKey());
  }

  values() {
    return this.#items.values();
  }
}
```

The exact implementation can be optimized later, but the semantics are mandatory.

### 5.6 Structural-key rules

A structural key should be deterministic and collision-safe at the logical equality layer. Prefer an unambiguous encoded tuple/tree representation over concatenated strings with delimiters.

Principles:

1. Include the concrete OWL object type.
2. Canonicalize **unordered set-valued** operands by child structural key.
3. Preserve order for associations that the W3C defines as ordered lists.
4. Deduplicate unordered operands where the structural specification requires set semantics.
5. Include axiom annotations in the ordinary axiom structural key.
6. Provide a separate `structuralKeyWithoutAnnotations()` / `equalsIgnoreAnnotations()` behaviour where OWLAPI exposes such semantics.
7. Keep anonymous-individual identity scoped correctly to the ontology/document/import context; do not globally intern blank-node labels across unrelated documents.

Example conceptual key:

```text
ObjectIntersectionOf[
  Class<https://example.org/A>,
  Class<https://example.org/B>
]
```

must equal the key for operands parsed as `B, A`, because operand order is not significant there.

### 5.7 Do not overuse inheritance

Java OWLAPI contains a large nominal interface hierarchy that is useful in Java. JavaScript does not need to reproduce every interface as a runtime base class.

The v1 implementation **MUST** remain native ESM JavaScript and **MUST NOT** recreate Java nominal-interface ceremony merely for type signalling.

Use:

- concrete immutable classes/objects for public OWL concepts where behaviour and identity matter;
- the canonical `kind` vocabulary for structural runtime identity;
- small shared behavioural helpers only where they represent genuine common behaviour;
- no abstract base classes that exist only to throw “not implemented”.

JSDoc **MAY** be used where it improves documentation, but it **MUST NOT** become a shadow TypeScript type system.

### 5.8 Canonical `kind` + centralized exhaustive dispatch

Every concrete `REQUIRED_V1` OWL structural object **MUST** expose a stable immutable `kind` drawn from one authoritative `OWLObjectKind` constant set.

`kind` is the sole normative runtime dispatch identity. Semantic dispatch **MUST NOT** depend on `instanceof`, constructor names, module names, minified names or Java-style visitor inheritance.

The core **MUST** provide centralized exhaustive dispatch helpers for the relevant structural categories, conceptually including:

```text
dispatchOwlObject
dispatchAxiom
dispatchClassExpression
dispatchDataRange
dispatchObjectPropertyExpression
dispatchDataPropertyExpression
dispatchAnnotationValue
dispatchIndividual
```

Each dispatcher **MUST**:

- dispatch by canonical `kind` only;
- require explicit handling for every `REQUIRED_V1` kind in its category;
- have no silent/default “ignore” branch;
- fail deterministically for an unknown/unhandled kind.

The authoritative kind taxonomy and category membership **MUST** be mechanically validated by automated tests. Adding or removing a structural kind **MUST** cause applicable exhaustive-dispatch tests to fail until each exhaustive consumer—such as `OwlToRdfTranslator` or `VOWLBuilder`—has explicitly handled the new taxonomy.

A future visitor API, if ever required, **MUST** be a façade over the same canonical `kind` taxonomy rather than a second dispatch identity.

Structural equality remains separate from `kind`; two objects with the same `kind` are not necessarily structurally equal.

---

## 6. RDF/JS Boundary and Quad Semantics

### 6.1 Why quads, not project-specific triples

A quad is `(subject, predicate, object, graph)`. A triple is represented by RDF/JS as a quad whose graph is `DefaultGraph`.

This means:

```text
Triple graph syntax
    → Quad(s,p,o,DefaultGraph)

Dataset syntax
    → Quad(s,p,o,namedGraph)
```

Nothing is lost when a normal triple becomes a default-graph quad. The reverse operation can be lossy when the named graph varies.

### 6.2 “More information” and graph entropy

The fourth component only adds source information when it varies. If every statement is in `DefaultGraph`, the graph component carries no additional information. If a source dataset contains named graphs, projecting quads down to triples destroys graph membership.

This is why RDF/JS quads are the correct **canonical RDF** representation even though ordinary OWL→RDF mapping produces an RDF graph.

### 6.3 Named graphs are not automatically provenance

A graph name indicates dataset membership; RDF does not require the graph-name IRI to denote the graph or prescribe provenance semantics. Applications may assign provenance meaning, but `owlapi-js` must not silently assume it.

### 6.4 Dataset formats require an explicit OWL-loading policy

OWL 2's structural↔RDF mapping is defined over an RDF **graph**, while TriG and N-Quads can represent an RDF **dataset** containing multiple graphs. `loadOntologyFromOntologyDocument()` returns one ontology, so graph policy **MUST** select exactly one logical RDF graph before RDF→OWL translation, except for the explicitly graph-losing `merge` compatibility policy.

The v1 `rdfDatasetGraphPolicy` enum is exactly:

```text
requireSingleGraph   // default
defaultGraphOnly
selectGraph
merge
```

`perGraph` is **not** part of this API. A future multi-result API may support graph-by-graph loading if required.

#### `requireSingleGraph` — default

- only the default graph contains quads → use the default graph;
- the default graph is empty and exactly one named graph contains quads → use that named graph;
- more than one non-empty graph, or a non-empty default graph plus any non-empty named graph → throw `AmbiguousRdfDatasetError`;
- empty graph names do not count toward ambiguity;
- a completely empty dataset represents an empty default graph.

#### `defaultGraphOnly`

Use only the default graph. Named-graph content is ignored for OWL interpretation, but the loss **MUST** emit a structured diagnostic.

#### `selectGraph`

An explicit RDF graph term is required through `selectedGraph`. Selecting a graph that does not exist **MUST** raise `GraphSelectionError`. The selected graph **MUST** be recorded in document context.

#### `merge`

Union all graph triples after removing the graph component and deduplicate identical triples. This is an explicit graph-context-losing compatibility policy, never the core default. Document context **MUST** record that merging occurred and a diagnostic **MUST** be emitted. WebVOWL **MAY** select it explicitly if legacy parity requires it.

RDF syntax adapters **MUST** preserve the complete `DatasetCore<Quad>` first. Graph policy is applied **after** RDF normalization and **before** `RdfToOwlTranslator`.

Blank-node identity **MUST** be preserved at dataset scope. Implementations **MUST NOT** rename blank nodes independently per graph before `merge`.

### 6.5 Source/document context

Keep non-OWL loading metadata separately:

```javascript
class OntologyDocumentContext {
  documentIRI;
  format;
  prefixes;
  jsonLdContexts;
  selectedGraph;
  diagnostics;
}
```

Important distinctions:

| Concept                             | Belongs where?                              |
| ----------------------------------- | ------------------------------------------- |
| ontology IRI                        | `OWLOntologyID` / structural OWL model      |
| version IRI                         | `OWLOntologyID`                             |
| imports declarations                | structural OWL model                        |
| ontology annotations                | structural OWL model                        |
| document IRI / retrieval URL        | document context / manager mapping          |
| Turtle prefixes                     | format/document metadata, not OWL semantics |
| JSON-LD `@context` text             | format/document metadata                    |
| RDF named graph                     | RDF dataset/document context                |
| parser diagnostics/source locations | document context / diagnostics              |

### 6.6 RDF 1.2 boundary policy

As of the 2026 RDF/JS data-model work, RDF terms can represent newer RDF 1.2 features. OWL 2's normative RDF mapping predates and does not assign OWL structural meaning to arbitrary RDF 1.2 extensions such as triple terms or directional language constructs beyond what OWL 2 defines.

Therefore the RDF→OWL interpreter should:

- accept RDF constructs that participate in the OWL 2 mapping;
- surface unsupported newer RDF constructs explicitly in strict mode;
- never invent OWL semantics for RDF 1.2 features absent from OWL 2;
- optionally preserve raw RDF diagnostics/context for applications that need it.

This avoids conflating “RDF/JS can represent it” with “OWL 2 defines what it means structurally.”

### 6.7 Direct RDF parser adapters, not a universal RDF dispatcher

`owlapi-js` already owns parser selection, explicit format identity, bounded detection, priority and fallback semantics. A second general RDF dispatcher underneath it would duplicate responsibility and obscure error/fallback semantics.

The v1 RDF adapter architecture **MUST** therefore be direct:

```text
                         RdfSyntaxAdapter
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
       N3.js         rdfxml-streaming-parser   jsonld.js
          │                    │                    │
          └────────────────────┼────────────────────┘
                               ▼
                    RDF/JS DatasetCore<Quad>
                               │
                               ▼
                       RdfToOwlTranslator
```

The selected v1 assignments are:

| RDF syntax  | Selected v1 implementation |
| ----------- | -------------------------- |
| Turtle      | N3.js                      |
| TriG        | N3.js                      |
| N-Triples   | N3.js                      |
| N-Quads     | N3.js                      |
| RDF/XML     | `rdfxml-streaming-parser`  |
| JSON-LD     | Digital Bazaar `jsonld.js` |
| N3 language | `DEFERRED`                 |

Each supported syntax retains its own `OWLDocumentFormat`, `ParserDescriptor`, detection contract, conformance manifest and capability-matrix entry even where implementation machinery is shared.

N3-specific constructs such as quoted formulae, logical implication/rules, N3-specific built-ins or other N3 semantics beyond the v1 RDF dataset contract **MUST NOT** be accepted merely because N3.js can parse them. N3-specific input **MUST NOT** be silently approximated as Turtle or ordinary RDF.

N3.js's default parser mode is a permissive superset. Every `owlapi-js`
N3.js-backed adapter **MUST** pass its exact format explicitly; a shared private
implementation **MUST NOT** weaken the separate public format identities. Phase
9 registers only Turtle. The N-Triples, N-Quads and TriG descriptors remain
unregistered and unsupported until Phases 12, 13 and 14 respectively. Syntax
overlap does not itself advertise a format: content explicitly identified as
`application/n-triples`, for example, remains unsupported before Phase 12 even
though some N-Triples documents are also valid Turtle documents.

N3.js **SHOULD** be conditionally imported inside the selected adapter's
asynchronous parse path so its dependency surface is absent from initial
application execution. Top-level `await` is not required. For inputs whose
measured parse cost can create browser long tasks, the adapter **MUST** use the
dependency's streaming surface with bounded Unicode-safe chunks, observe
backpressure, check abort/timeout/quad limits between chunks, and cooperatively
yield. Prefer `scheduler.yield()` where available and provide a `setTimeout(0)`
fallback. Thresholds and chunk sizes **MUST** be selected from recorded browser
and Node measurements rather than guessed. Production code **MUST NOT** import
an undeclared transitive dependency merely because N3.js currently carries it.

A future promotion of N3 from `DEFERRED` requires a separate capability decision specifying the exact N3 language/version, supported constructs, internal semantic representation, RDF→OWL interaction, detection rules, conformance evidence, unsupported behaviour and public API implications.

Additional constraints:

1. OWL/XML is not RDF/XML and **MUST** retain its structural parser.
2. `.owl` is only a weak filename hint and **MUST NOT** determine RDF/XML vs OWL/XML.
3. JSON-LD remote context processing **MUST** obey the core loader/security policy.
4. JSON-LD **MUST NOT** be serialized to an N-Quads string and reparsed merely to reach RDF/JS.
5. Prefix/context information is document-format metadata rather than OWL semantics.
6. Parser-specific terms, exceptions and configuration **MUST** be normalized at the adapter boundary.

`rdf-parse`, Comunica or another generalized dispatcher **MUST NOT** become a required core runtime dependency merely to duplicate syntax dispatch already owned by `OWLOntologyManager`.

### 6.8 Selected v1 dependency authority and replaceability

The v1 baseline implementations are normative selections:

| Dependency                            | Normative v1 role                           |
| ------------------------------------- | ------------------------------------------- |
| `@rdfjs/data-model`                   | canonical RDF/JS term and quad factory      |
| `@rdfjs/dataset`                      | canonical `DatasetCore` implementation      |
| `n3` / N3.js                          | Turtle, TriG, N-Triples and N-Quads parsing |
| `rdfxml-streaming-parser`             | RDF/XML parsing                             |
| `jsonld` / Digital Bazaar `jsonld.js` | JSON-LD processing                          |

These dependencies **MUST** be used for their stated v1 roles unless an approved dependency-replacement decision changes the normative plan. They are implementation dependencies rather than public semantic dependencies.

The phase introducing each dependency **MUST** pin its exact resolved version through the package manifest and lockfile. A foundational dependency upgrade **MUST** be reviewable and **MUST** rerun applicable conformance suites, adapter contract tests, differential tests, security/resource tests, browser/Node compatibility tests and relevant performance benchmarks.

Before a foundational dependency enters the release path, the repository **MUST** record:

- standards/specification versions implemented;
- pinned version;
- applicable official conformance results;
- project ownership/governance and release authority;
- maintenance/release status;
- transitive dependency surface;
- browser/runtime implications;
- security/network behaviour;
- licence/notice requirements;
- the exact replaceable `owlapi-js` adapter boundary.

Replacing a selected dependency requires an approved project decision demonstrating equivalent or stronger standards conformance, adapter-contract compatibility, security/resource behaviour, runtime support, licence/provenance acceptability, supply-chain profile and performance acceptance.

The replacement **MUST** terminate at the same canonical boundary unless a separate approved architecture decision changes that boundary.

The project **MUST NOT** reimplement a selected mature standards parser locally merely to reduce dependency count.

---

## 7. OWL Structural Model → RDF/JS Mapping

### 7.1 This should be one shared backend

Do not teach every syntax parser how to emit RDF. Once a structural ontology exists, there should be exactly one OWL→RDF implementation based on the normative W3C Mapping to RDF Graphs.

```text
Functional ──┐
Manchester ──┤
OWL/XML ─────┼──► OWL structural model ──► OwlToRdfTranslator ──► RDF/JS Dataset
DL/KRSS2 ────┘
```

The Java OWLAPI provides a useful secondary implementation reference: `AbstractTranslator` is documented as an abstract translator that produces an RDF graph from an `OWLOntology`, and `RDFTranslator` implements this visitor-based translation.

### 7.2 Recommended translator contract

```javascript
export class OwlToRdfTranslator {
  constructor({ dataFactory, datasetFactory }) {
    this.dataFactory = dataFactory;
    this.datasetFactory = datasetFactory;
  }

  translate(ontology, { graph = this.dataFactory.defaultGraph() } = {}) {
    const dataset = this.datasetFactory.dataset();
    // visit ontology metadata and axioms
    return dataset;
  }
}
```

The `graph` argument is a dataset-placement option, not an OWL semantic property. The normative OWL→RDF result is an RDF graph; using a non-default graph merely places that graph into an RDF dataset supplied by the application.

### 7.3 Recursive “main node” pattern

For complex expressions, each mapper should:

1. recursively map child OWL objects;
2. create any required blank node(s);
3. emit supporting RDF quads;
4. return the RDF term representing the expression's main node.

Example:

```javascript
mapObjectSomeValuesFrom(expression, graph) {
  const node = this.rdf.blankNode();
  const property = this.mapObjectPropertyExpression(expression.property, graph);
  const filler = this.mapClassExpression(expression.filler, graph);

  this.add(node, RDF.type, OWL.Restriction, graph);
  this.add(node, OWL.onProperty, property, graph);
  this.add(node, OWL.someValuesFrom, filler, graph);

  return node;
}
```

This mirrors the recursive structure of the W3C mapping and is dramatically cleaner than synthesizing nested RDF/XML.

### 7.4 Reusable RDF-list helper

Many OWL constructs map to RDF collections. Implement and heavily test one list builder:

```javascript
createRdfList(items, graph) {
  if (items.length === 0) {
    return RDF.nil;
  }

  const head = this.rdf.blankNode();
  let current = head;

  for (let i = 0; i < items.length; i += 1) {
    this.add(current, RDF.first, items[i], graph);

    const next = i === items.length - 1
      ? RDF.nil
      : this.rdf.blankNode();

    this.add(current, RDF.rest, next, graph);
    current = next;
  }

  return head;
}
```

Reuse this for intersections, unions, enumerations, property chains, keys and other list-based mappings.

### 7.5 Annotated axioms require deliberate handling

Axiom annotations are structurally significant even though they do not affect OWL's logical consequences. The RDF mapping adds annotation/reification structures around the main axiom statement. This is one of the more bookkeeping-heavy parts of the translator and should have dedicated tests for:

- one annotation;
- multiple annotations;
- nested annotations;
- IRI, literal and anonymous-individual annotation values;
- equal logical axioms with different annotations remaining structurally distinct.

### 7.6 Blank-node identifiers are not semantic output

Do not test exact generated blank-node labels. Blank node IDs are serialization/implementation artifacts. Compare RDF datasets by graph isomorphism/canonicalization, not textual labels.

A deterministic blank-node allocator may still be useful in debug snapshots, but deterministic labels must never become part of the public semantic contract.

### 7.7 Why this mapping is relatively tractable

The conceptual difficulty is modest because the mapping is deterministic and recursive. The engineering cost comes from breadth and edge cases, not architectural uncertainty.

| Area                              |           Relative difficulty |
| --------------------------------- | ----------------------------: |
| declarations                      |                      very low |
| simple hierarchy/domain/range     |                      very low |
| property characteristics          |                      very low |
| simple restrictions               |                           low |
| Boolean class expressions         |                  low–moderate |
| RDF lists                         |       low after shared helper |
| cardinalities                     |                  low–moderate |
| datatype restrictions             |                      moderate |
| n-ary axioms                      |                      moderate |
| property chains                   |                      moderate |
| negative assertions               |                      moderate |
| annotated/nested annotated axioms |                 moderate–high |
| exact OWLAPI rendering quirks     | intentionally not a core goal |

---

## 8. RDF/JS → OWL Structural Model

### 8.1 This is the harder direction

A parsed RDF dataset does not directly contain `OWLSubClassOfAxiom` or `OWLObjectSomeValuesFrom` objects. The interpreter must recognize distributed RDF graph patterns and reconstruct the corresponding OWL structural objects.

For example:

```text
_:x rdf:type owl:Restriction .
_:x owl:onProperty :hasParent .
_:x owl:someValuesFrom :Person .
```

must become:

```text
ObjectSomeValuesFrom(:hasParent :Person)
```

and a separate triple such as:

```text
:Child rdfs:subClassOf _:x .
```

then yields:

```text
SubClassOf(:Child ObjectSomeValuesFrom(:hasParent :Person))
```

This requires graph-wide type information, recursive expression decoding, RDF list reconstruction, and careful triple consumption.

### 8.2 OWLAPI's `OWLRDFConsumer` is the most valuable reference design

OWLAPI describes `OWLRDFConsumer` as an interpreter for an RDF graph representing an OWL ontology. It uses triple handlers to recognize patterns, consumes some triples while streaming, and defers patterns requiring complete graph context until the graph is available.

That architecture is highly applicable to JavaScript:

```text
RDF parser-adapter quad stream
    │
    ├── cheap/direct handlers where safe
    │
    ▼
Dataset/index of remaining quads
    │
    ▼
second-pass graph interpretation
    │
    ▼
OWL structural objects
```

However, copying the Java implementation literally is not necessary. RDF/JS datasets provide powerful indexed matching that can simplify handler mechanics.

### 8.3 Recommended staged interpreter

#### Stage A — choose one RDF graph

Apply `RdfDatasetGraphPolicy` before OWL interpretation. The translator operates on one RDF graph at a time.

#### Stage B — build/query indexes

With `DatasetCore.match()` or an indexed dataset, establish efficient access patterns by:

- subject;
- predicate;
- object where useful;
- RDF type/declaration;
- blank-node adjacency;
- RDF-list heads.

Do not manually build duplicate indexes until profiling shows the dataset implementation is insufficient.

#### Stage C — establish typing/declarations

OWL RDF reconstruction often needs to distinguish classes, datatypes, object/data/annotation properties and individuals. Build typing knowledge from declarations, reserved vocabulary and OWL 2 mapping rules before resolving ambiguous expressions.

#### Stage D — decode RDF lists

One robust list decoder should:

- detect `rdf:nil`;
- require appropriate `rdf:first` / `rdf:rest` shape in strict mode;
- detect cycles;
- enforce a maximum list length;
- memoize decoded list nodes;
- preserve order where list semantics matter;
- report malformed shared/cyclic lists rather than looping.

#### Stage E — recursively reconstruct expressions

Use memoization keyed by RDF node so the same anonymous expression node is not repeatedly decoded.

```javascript
parseClassExpression(term) {
  if (this.classExpressionCache.has(termKey(term))) {
    return this.classExpressionCache.get(termKey(term));
  }

  // named class or recognized blank-node pattern
}
```

Include recursion/cycle guards.

#### Stage F — reconstruct axioms

Once expression/property nodes can be decoded, translate top-level relationship triples/patterns into axioms and add them through `OWLDataFactory`/`OWLOntology`.

#### Stage G — attach axiom annotations

Interpret `owl:annotatedSource`, `owl:annotatedProperty`, `owl:annotatedTarget` patterns and nested annotations after the corresponding base axiom is known.

#### Stage H — account for unconsumed RDF

Do not silently ignore everything left over. Provide a documented policy:

```text
strict: unsupported/unconsumed OWL-significant triples cause error
warn:   ontology returned plus structured diagnostics
ignore: explicitly requested compatibility behaviour
```

### 8.4 Complete the shared RDF→OWL contract before the first RDF cutover

Phases 1 through 4 completed the structural model and the first three
OWL-native parsers without making RDF reconstruction their prerequisite. The
remaining migration-safe route is now:

1. implement the syntax-independent RDF/JS ingestion contract, graph policy and
   baseline-complete shared RDF→OWL mapping from constructed datasets;
2. add RDF/XML as the first real RDF adapter and fix every reconstruction gap
   in the shared translator rather than in the adapter;
3. prove structural and VOWL differential acceptance through the development
   integration;
4. cut production over to the structural path with explicit unsupported-format
   errors and zero production reachability to the legacy path;
5. retain legacy files at their existing paths only for characterization and
   reference while the remaining planned migrations proceed;
6. add Turtle as the second real RDF adapter, thereby validating that the
   shared RDF seam is format-neutral; and
7. physically delete the legacy implementation only in Phase 17.

Phase 5 **MUST NOT** limit the translator to whichever happy-path constructs
happen to occur in a small WebVOWL corpus. Its W3C mapping inventory, Java
behavioural differential fixtures, unconsumed-triple policy, RDF-list and
blank-node safety, ontology-header/import handling, axiom annotations and
resource contracts are production prerequisites. Phase 6 supplies the first
real-adapter hardening evidence, not a place for RDF/XML-local OWL rules.

---

## 9. Parser Taxonomy and Per-Format Strategy

### 9.1 OWL-native syntaxes

These should parse directly to the structural model:

| Syntax            | Strategy                                                      | Rationale                                                                                                              |
| ----------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Functional Syntax | custom lexer/parser → structural objects                      | closest concrete syntax to W3C structural specification; best first migration                                          |
| Manchester Syntax | existing lazy lexer/parser → structural objects               | semantic AST already natural; preserve permissive-mode lessons                                                         |
| OWL/XML           | DOM/XML parser → structural objects                           | direct XML representation of structural OWL; do not detour through RDF                                                 |
| DL Syntax         | custom parser → structural subset                             | non-RDF syntax                                                                                                         |
| KRSS / KRSS1      | parser implementation `DEFERRED` for v1                       | retain distinct OWLAPI format/compatibility identity, grammar-gap analysis and fixtures without claiming parse support |
| KRSS2             | KRSS-family parser → strict KRSS2 dialect → structural subset | distinct OWLAPI parser/format identity; extended KRSS vocabulary                                                       |

#### 9.1.1 KRSS1 and KRSS2: distinct compatibility surfaces, shared machinery where justified

KRSS1 and KRSS2 **MUST** remain distinct compatibility identities because Java OWLAPI exposes distinct parser and document-format surfaces and KRSS2 extends the KRSS vocabulary.

For v1, the capability matrix **MUST** classify:

```text
KRSS1 parser implementation            DEFERRED
KRSS1 compatibility identity           REQUIRED_V1
KRSS1/KRSS2 grammar-gap analysis       REQUIRED_V1
KRSS1 fixtures / negative dialect tests REQUIRED_V1
KRSS1-ready architecture               REQUIRED_V1
```

The v1 release **MUST NOT** claim KRSS1 parsing support.

The KRSS-family phase **MUST**:

- preserve distinct KRSS1 and KRSS2 `OWLDocumentFormat` identities;
- diff the dialects from public specifications/API evidence;
- share lexer/parser machinery only where behaviour is genuinely common;
- record bounded-detection requirements for a future KRSS1 parser where distinguishable;
- include negative KRSS1-dialect fixtures that classify KRSS2-only vocabulary as invalid KRSS1 and verify v1 does not route/claim that input as supported KRSS1;
- leave a documented architectural insertion point for a future KRSS1 parser without requiring redesign.

A future KRSS1 implementation requires an explicit capability promotion from `DEFERRED`; it is not an opportunistic v1 implementation task.

### 9.2 RDF syntaxes

Prefer mature RDF parsers rather than porting low-level syntax lexers:

| Syntax           | Strategy                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| RDF/XML          | `rdfxml-streaming-parser` → RDF/JS quads → RDF→OWL                                                                               |
| Turtle           | N3.js → RDF/JS quads → RDF→OWL                                                                                                   |
| N-Triples        | N3.js → RDF/JS quads → RDF→OWL                                                                                                   |
| TriG             | N3.js → RDF/JS quads → dataset graph policy → RDF→OWL                                                                            |
| N-Quads          | N3.js → RDF/JS quads → dataset graph policy → RDF→OWL                                                                            |
| JSON-LD          | Digital Bazaar `jsonld.js` → direct RDF dataset adapter → RDF/JS quads → RDF→OWL                                                 |
| N3               | `DEFERRED` for v1; N3.js availability does not constitute language support                                                       |
| RDFa / Microdata | optional future adapters only when a concrete requirement and suitably governed/conformant implementation justify the dependency |

This strategic delegation is a major simplification: standardized RDF syntax handling is not where `owlapi-js` should differentiate itself. The **adapter boundary** is where `owlapi-js` adds value: parser selection, security policy, error normalization, RDF/JS normalization, provenance/diagnostics and independent conformance verification.

### 9.3 OWL/XML is explicitly not an RDF syntax

Format detection must distinguish:

```text
OWL/XML  → structural OWL parser
RDF/XML  → RDF parser
```

Both are XML and `.owl` filenames are used for both in practice. Detection based only on “valid XML” or extension is therefore insufficient.

### 9.4 Parser selection and fallback semantics

The governing rule is:

> **“Not my syntax” permits fallback. “My syntax but invalid/unsupported” does not.**

If the caller explicitly selects an `OWLDocumentFormat`, that selection is authoritative: only that format **MUST** be attempted and no cross-format fallback occurs.

For automatic detection, candidate ordering **MUST** use evidence in this order:

1. bounded actual content evidence;
2. HTTP/document `Content-Type`;
3. parser priority;
4. filename extension only as a weak ordering hint.

An extension or `Content-Type` **MUST NOT** override a detector's `NO_MATCH` result.

Detection results are exactly:

```text
MATCH
NO_MATCH
INDETERMINATE
```

Parse outcomes are exactly:

```text
SUCCESS
PARSER_MISMATCH
RECOGNIZED_FORMAT_FAILURE
FATAL_FAILURE
```

Only `ParserMismatchError` permits fallback. A recognized syntax error or `UnsupportedConstructError` terminates fallback. Resource-limit, security-policy, cancellation, fatal I/O and internal invariant failures terminate the entire operation.

Once a parser has recognized/committed to its syntax, a later failure **MUST NOT** be reclassified as parser mismatch.

Every candidate attempt **MUST** be transactional: a failed candidate leaves ontology state, manager registrations, imports and document context observationally unchanged. State commits only after the candidate is accepted as `SUCCESS`.

`UnparsableOntologyException` is produced only after all eligible candidates are exhausted by genuine parser mismatches. Broad catch-and-continue fallback is forbidden.

### 9.5 Immutable `ParserDescriptor` and bounded detection contract

Each supported format **MUST** have an immutable descriptor conceptually equivalent to:

```javascript
/**
 * @typedef {"MATCH"|"NO_MATCH"|"INDETERMINATE"} DetectionResult
 *
 * @typedef {object} ParserDetection
 * @property {DetectionResult} result
 * @property {string} reasonCode
 * @property {string} reason
 *
 * @typedef {object} ParserDescriptor
 * @property {string} id
 * @property {number} priority
 * @property {OWLDocumentFormat} format
 * @property {(source, config) => ParserDetection} detect
 * @property {() => OWLParser} createParser
 */
```

A bare boolean sniffer is insufficient.

Descriptor requirements:

- `id` **MUST** be stable and unique and **MUST NOT** derive from constructor/module/minified names;
- lower numeric `priority` means higher priority;
- equal priorities **MUST** break ties lexically by parser ID, never registration order;
- there is one descriptor per format identity even when the same library implements several formats;
- KRSS1 and KRSS2 remain distinct compatibility/format identities; v1 registers no active KRSS1 parser descriptor while its parser implementation is `DEFERRED`; any future KRSS1 descriptor **MUST** be distinct from KRSS2;
- Turtle, TriG, N-Triples and N-Quads remain distinct descriptors;
- detection **MUST** be deterministic, side-effect free, bounded, non-networked and non-mutating;
- detection **MUST NOT** perform a full parse;
- each result **MUST** include stable `reasonCode` plus human-readable `reason`;
- metadata-assisted ordering belongs in the registry rather than parser-specific ad hoc logic;
- a compatible/recovery parser **MUST NOT** be auto-attempted solely from `INDETERMINATE`;
- the registry **MUST** reject invalid or duplicate descriptors.

Candidate tracing **SHOULD** record parser ID, format, detection result/reason, eligibility and ordering reason for diagnostics/tests.

`MAX_SNIFF_BYTES = 8192` is the normative default sniff ceiling unless an approved benchmark/security-backed change updates the plan.

### 9.6 Stateless descriptors and fresh parser/session per attempt

Registered `ParserDescriptor` objects **MUST** be immutable/stateless.

Every candidate attempt **MUST** receive a fresh parser/session instance. Mutable lexer position, prefixes, diagnostics, temporary indexes and transaction state belong to that attempt and **MUST NOT** leak across loads.

```text
registered ParserDescriptor (immutable)
        ↓ createParser()
fresh parse session
        ↓
isolated parse transaction/builder
```

This is required for deterministic retry/fallback behaviour and safe concurrent parsing.

### 9.7 Preserve lazy lexing

The existing Manchester/Functional work established a critical JS-specific rule: do not eagerly tokenize large input into millions of string/token objects.

Use:

- generators or pull-based scanners;
- bounded lookahead buffers;
- fail-fast syntax detection;
- no full token arrays unless a grammar genuinely requires them and resource limits are enforced.

The previous eager Manchester implementation exhausted V8 heap when an unrelated ~2 MB file was attempted by the parser. That failure mode must remain documented and regression-tested.

### 9.8 Preserve exact lexical contracts

Known example: Manchester language tags.

Java tokenization accumulates `@en` as one token, so parser logic must use:

```javascript
if (peekToken().startsWith("@")) {
  const lang = consumeToken().slice(1);
}
```

not `peekToken() === "@"`.

Port semantic behaviour, including token boundaries, not superficial character rules.

### 9.9 Compatible recovery requires positive recognition

A parser that can recover from malformed or legacy input can otherwise “succeed” on an unrelated format. Compatible recovery therefore requires either:

- explicit caller selection of that parser's format; or
- a positive bounded `MATCH` from the parser's detector.

`INDETERMINATE` alone **MUST NOT** make a recovery-capable parser eligible for automatic execution.

This is an architectural invariant, not a Manchester-specific workaround.

---

## 10. OWLOntology, Manager and Loading Architecture

### 10.1 `OWLOntology` responsibilities

`OWLOntology` should own:

- ontology ID (ontology IRI + optional version IRI);
- direct import declarations;
- ontology annotations;
- structurally unique axioms;
- indexes derived from axioms;
- manager association if required by the public API.

It should **not** own as semantic truth:

- raw input text;
- XML DOM;
- RDF/XML serialization;
- parser-specific AST;
- RDF named graph membership;
- WebVOWL state.

### 10.2 Internal ontology indexes

Do not promise literal $O(1)$ for every semantic query in documentation. Instead construct indexes that make high-value queries efficient and profile them.

Useful initial indexes:

```text
axiom type → axioms
entity IRI/type → entity
entity → referencing axioms
class → class axioms
object property → property axioms
annotation subject → annotation assertions
signature category → entities
```

Build incrementally and avoid duplicate derived state unless measurements justify it.

### 10.3 Normative public v1 API surface

The public API **MUST** remain narrow, explicit and capability-matrix-driven. An API is public only when the authoritative matrix classifies it as part of the v1 public surface.

Conceptual package entry points are:

```text
owlapi-js
owlapi-js/model
owlapi-js/rdf
```

`OWLManager` exposes:

```javascript
createOWLOntologyManager(options?)
```

`OWLOntologyManager` v1 exposes:

```javascript
getOWLDataFactory();
createOntology(ontologyID?);
await loadOntologyFromOntologyDocument(source, configuration?);
getOntology(ontologyID); // OWLOntology | undefined
```

Broad lifecycle/listener parity with Java OWLAPI is **NOT REQUIRED** unless the capability matrix promotes it.

`OWLDataFactory` is the canonical construction API for every `REQUIRED_V1` structural object. Java overloads **MUST NOT** be replicated mechanically; JavaScript-native signatures are preferred. Parsers, translators and tests **SHOULD** construct canonical structural objects through the factory unless an explicitly equivalent internal path is justified.

`OWLOntology` v1 exposes direct-ontology queries:

```javascript
ontology.getOntologyID();
ontology.getAxioms();
ontology.getAxiomsByType(type);
ontology.getClassesInSignature();
ontology.getObjectPropertiesInSignature();
ontology.getDataPropertiesInSignature();
ontology.getAnnotationPropertiesInSignature();
ontology.getIndividualsInSignature();
ontology.getDatatypesInSignature();
ontology.getImportsDeclarations();
ontology.getAnnotations();
ontology.getReferencingAxioms(entity);
```

These methods operate on the **direct ontology only** in v1; they **MUST NOT** silently include the imports closure.

Set-valued APIs **MUST** expose read-only set semantics and **MUST NOT** expose mutable internal collections. They provide no ordering contract. Presentation/snapshot code sorts explicitly where deterministic order is required.

Structural objects are immutable. Structural equality is **not** JavaScript `===` identity.

`StringDocumentSource(text, { documentIRI?, contentType?, fileName? })` is public with getters for those values. Metadata remains a hint and does not override an explicitly selected format or positive/negative content detection.

Concrete parser implementations **SHOULD NOT** be root-package API. They may become an advanced public surface only when the capability matrix explicitly requires it.

`RdfToOwlTranslator` and `OwlToRdfTranslator` **MAY** be exposed through the `owlapi-js/rdf` public entry point once their corresponding `REQUIRED_V1` capability contracts are complete; they **MUST** consume/produce only the canonical OWL structural and RDF/JS boundaries.

The public API **MUST NOT** be enlarged merely for implementation convenience.

### 10.4 `OWLOntologyManager` responsibilities

The manager **MUST** coordinate the responsibilities required by the normative v1 API:

- ontology creation and registration;
- ontology ↔ document context/IRI mapping;
- parser registry/factory selection;
- immutable loader configuration;
- `OWLDataFactory` access;
- import declarations and import loading;
- IRI mappers/document resolvers;
- duplicate ontology-ID/state validation;
- typed load diagnostics/errors.

Additional Java OWLAPI lifecycle/listener APIs are outside v1 unless explicitly classified in the capability matrix.

### 10.5 Generic import resolution belongs in `owlapi-js`; WebVOWL policy does not

The earlier plan put import resolution entirely outside the core. That is too coarse. OWL ontology loading inherently includes `owl:imports`; OWLAPI parsers are expected to request import loading through the manager.

The correct split is:

```text
owlapi-js
  defines generic import/document loading protocol
  handles import closure and cycles
  accepts IRI mappers/resolvers

WebVOWL
  supplies application-specific catalog/path resolver
  supplies permitted network policy
  supplies bundled ontology mappings
```

Example interfaces:

```javascript
class OntologyDocumentLoader {
  async load(documentIRI, { signal, config }) {
    // injected implementation
  }
}

class OWLOntologyIRIMapper {
  getDocumentIRI(ontologyIRI) {
    // return mapped IRI or null
  }
}
```

### 10.6 Imports closure and cycles

Track ontology/document load state explicitly:

```text
UNSEEN → LOADING → LOADED
             │
             └── cycle encountered: reuse in-progress identity / do not recurse forever
```

Tests must include:

- direct imports;
- transitive imports;
- duplicate imports;
- cyclic imports;
- missing imports under `throw` and `diagnostic` strategies;
- two ontology IRIs mapping to the same document;
- ontology/document IRI mismatch.

### 10.7 Loader configuration is immutable

Loader configuration **MUST** be immutable/copying. A configuration used by an asynchronous ontology/import load **MUST NOT** change meaning midway through the operation.

The normative defaults are:

```javascript
{
  parsingMode: "strict",
  loadAnnotationAxioms: true,
  remoteImports: false,
  remoteJsonLdContexts: false,
  missingImportHandling: "throw",
  rdfDatasetGraphPolicy: "requireSingleGraph",
  maxRedirects: 0,
  maxRetries: 0,
  collectWarnings: true,
  sourceLocations: true,
}
```

Phase 0 **MUST** establish finite numeric resource defaults from the resource-budget process in §§19–20. Individual parser teams **MUST NOT** select independent safety ceilings.

A JavaScript-style copying API is appropriate, for example:

```javascript
const config = OWLOntologyLoaderConfiguration.defaults()
  .withParsingMode("strict")
  .withMissingImportHandling("throw")
  .withRemoteImports(false);
```

### 10.8 Normative configuration names and loader/security semantics

The canonical configuration properties are:

```javascript
{
  parsingMode: "strict" | "compatible",
  format,
  loadAnnotationAxioms,
  remoteImports,
  remoteJsonLdContexts,
  missingImportHandling: "throw" | "diagnostic",
  rdfDatasetGraphPolicy:
    "requireSingleGraph" |
    "defaultGraphOnly" |
    "selectGraph" |
    "merge",
  selectedGraph,
  collectWarnings,
  sourceLocations,
  // finite resource/network limits
}
```

`rdfDatasetGraphPolicy`, `relaxed`, `silent` and `ignore` are not alternate public spellings.

`missingImportHandling: "diagnostic"` means continue while emitting a mandatory structured diagnostic; it does not mean silent omission.

Core loading has **no ambient network access by default**. `remoteImports` and `remoteJsonLdContexts` default to `false`. Local/injected IRI mapping may resolve resources, but unresolved imports default to `MissingImportError` through `missingImportHandling: "throw"`.

Remote loading, when explicitly enabled, **MUST** use an injected/controlled loader with:

- explicit scheme policy and standards URL parsing;
- credential restrictions;
- redirect revalidation;
- finite byte/time/redirect limits;
- `AbortSignal` support;
- no retries unless explicitly enabled;
- SSRF protection including loopback, private, link-local and metadata-service address classes.

The core **MUST NOT** automatically dereference arbitrary `file:`, `ftp:`, `gopher:`, `data:`, `javascript:`, `smb:` or equivalent schemes. XML external entities **MUST NOT** be fetched.

The security defaults are the same in browser and Node.js. The implementation **MUST NOT** infer network permission merely because `fetch`, CORS or another runtime capability exists.

### 10.9 `AbortSignal`

Long parsing/import work should accept `AbortSignal` where asynchronous work or large streaming inputs make cancellation meaningful. This is the standard JS cancellation primitive and is preferable to a custom cancellation API.

---

## 11. Document Sources, Formats and Errors

### 11.1 Document source abstraction

The source object should carry the concrete document plus trusted/optional hints:

```javascript
new StringDocumentSource(text, {
  documentIRI,
  contentType,
  fileName,
});
```

Unlike Java's `Reader`-centric API, JavaScript does not benefit from pretending a string is a Java `Reader`. Expose JavaScript-native access while retaining familiar class naming.

Potential minimal contract:

```javascript
source.getText();
source.getDocumentIRI();
source.getContentType();
source.getFileName();
```

Streaming sources can be added later without breaking callers if parsing internals consume a normalized source protocol.

### 11.2 `OWLDocumentFormat`

Format metadata should describe syntax-level details such as:

- key/name;
- media type(s);
- common extensions;
- prefix capability;
- whether it is RDF-based;
- whether it can contain an RDF dataset rather than only a graph.

Prefix maps belong to format/document metadata rather than `OWLOntology` semantics.

### 11.3 Canonical public error taxonomy

The v1 public hierarchy is:

```text
Error
└── OWLAPIError
    ├── OWLParserError
    │   ├── ParserMismatchError
    │   ├── OWLSyntaxError
    │   └── UnsupportedConstructError
    ├── ResourceLimitError
    ├── SecurityPolicyError
    ├── DocumentLoadError
    │   ├── MissingImportError
    │   └── UnloadableImportError
    ├── OWLOntologyCreationError
    │   ├── AmbiguousRdfDatasetError
    │   └── GraphSelectionError
    └── OWLOntologyStateError

AggregateError
└── UnparsableOntologyException
```

`UnparsableOntologyException` extends `AggregateError`, not `OWLAPIError`.

Stable public codes are:

```text
PARSER_MISMATCH
OWL_SYNTAX_ERROR
UNSUPPORTED_CONSTRUCT
RESOURCE_LIMIT_EXCEEDED
SECURITY_POLICY_VIOLATION
DOCUMENT_LOAD_FAILED
MISSING_IMPORT
UNLOADABLE_IMPORT
ONTOLOGY_CREATION_FAILED
AMBIGUOUS_RDF_DATASET
RDF_GRAPH_SELECTION_FAILED
ONTOLOGY_STATE_INVALID
UNPARSABLE_ONTOLOGY
```

Public callers **MUST NOT** need to parse error-message text. Errors **SHOULD** expose `name`, `code`, `message`, `cause`, and parser/document/source-location fields when actually known. Unknown line/column/offset values **MUST NOT** be represented by invented sentinel locations such as `-1` or `0`.

Third-party operational errors **MUST** be normalized at the adapter boundary and retained as `cause` where appropriate. Programming defects/internal invariant failures **MUST NOT** be disguised as parser mismatch or document-format errors.

Only `ParserMismatchError` permits cross-format fallback.

### 11.4 `UnparsableOntologyException` aggregation semantics

`UnparsableOntologyException` is produced only when automatic selection exhausts all eligible candidates through genuine `ParserMismatchError` outcomes.

A recognized syntax error, unsupported construct, resource-limit failure, security rejection, cancellation, fatal document-load error or internal invariant failure **MUST** terminate the operation rather than being swallowed into parser fallback.

This deliberately prevents broad fallback `try/catch` from hiding real implementation or security failures.

### 11.5 Structured diagnostics

Diagnostics are distinct from thrown errors and **MUST** be structured data rather than console logging.

A diagnostic should carry the fields that are actually known, conceptually:

```javascript
{
  severity: "warning",
  parserId: "manchester",
  code: "UNSUPPORTED_CONSTRUCT",
  message: "...",
  line: 42,
  column: 17,
  offset: 912,
  construct: "...",
  documentIRI: "...",
}
```

Unknown source-location fields **MUST** be omitted rather than represented by invented sentinel values.

Any successful `compatible` recovery that changes, omits or approximates semantics **MUST** emit its required diagnostic. `missingImportHandling: "diagnostic"`, `defaultGraphOnly`, and graph-losing `merge` likewise emit mandatory diagnostics as defined by their contracts.

Diagnostics **MUST NOT** substitute for an exception where the error taxonomy requires the operation to fail.

---

## 12. Parser Registry and Detection

### 12.1 Preserve OWLAPI priority as compatibility metadata, not blind truth

Existing parser priority ordering is useful for parity and fallback behaviour, but positive detection should prevent unrelated permissive parsers from being invoked unnecessarily.

Current relevant ordering derived from OWLAPI work includes approximately:

| Priority | Parser / format         | `owlapi-js` strategy                                                                                              |
| -------: | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
|        0 | RDF/XML                 | RDF/JS parser adapter                                                                                             |
|        1 | OWL/XML                 | structural parser                                                                                                 |
|        2 | Functional              | structural parser                                                                                                 |
|        3 | Rio Turtle              | covered through the N3.js RDF adapter rather than a duplicate parser                                              |
|        4 | Manchester              | structural parser with strict sniff gate                                                                          |
|     7–12 | various Rio RDF formats | map each supported syntax to the direct format-specific RDF adapter; do not introduce a generic nested dispatcher |
|       12 | TurtleOntologyParser    | no need to duplicate if the N3.js adapter provides equivalent semantics                                           |
|       15 | DL Syntax               | structural parser                                                                                                 |
|       16 | KRSS2                   | structural parser                                                                                                 |

Do not clone every Java parser factory when multiple Java factories exist primarily because of Java RDF library integrations that JavaScript can replace with one interoperable RDF/JS adapter.

### 12.2 Detection API

`registry.resolveCandidates(source, config)` **MUST** operate over immutable `ParserDescriptor` records and return deterministic candidate metadata. Each parser detection result is one of:

```text
MATCH
NO_MATCH
INDETERMINATE
```

with a stable `reasonCode` and human-readable `reason`.

`MATCH` means bounded evidence positively identifies the syntax strongly enough to make the parser eligible.

`NO_MATCH` means bounded evidence rules the syntax out; weaker metadata such as extension **MUST NOT** override it.

`INDETERMINATE` means bounded inspection cannot decide. It is not a positive match and does not make a compatible/recovery parser automatically eligible.

The registry—not individual parser detectors—combines content evidence with Content-Type, parser priority and weak filename hints.

### 12.3 Sniff budget

`MAX_SNIFF_BYTES = 8192` is the normative default ceiling unless an approved benchmark/security-backed change updates it.

Detection **MUST**:

- inspect only the bounded source prefix;
- remain deterministic and side-effect free;
- perform no network I/O;
- perform no ontology/manager mutation;
- avoid full-document parsing/tokenization;
- avoid catastrophic regular expressions;
- decode only the required byte prefix.

An explicitly selected format bypasses cross-format detection and fallback; it does not weaken syntax validation inside the selected parser.

### 12.4 XML detection

The XML branch must distinguish:

1. malformed/non-XML;
2. well-formed OWL/XML;
3. well-formed RDF/XML;
4. generic XML that is neither supported syntax.

Do not treat “well formed” as “RDF/XML.”

### 12.5 DOM parser semantic differences

Browser `DOMParser` and `@xmldom/xmldom` have historically differed in how they surface parse failures. Wrap XML parsing behind one adapter that normalizes:

```javascript
parseXml(text) → Document | throws XmlParseError
```

so parser code never depends on whether an environment returns `<parsererror>` or throws.

---

## 13. Logical Architecture, Physical Structure and JavaScript Engineering Quality

The architecture defines normative **logical boundaries and dependency rules** while generally allowing implementation teams to choose the most appropriate physical JavaScript module/directory structure.

This freedom is conditional: every implementation choice **MUST** follow current modern JavaScript engineering best practices, repository engineering standards and all normative constraints in this blueprint. Passing tests does not waive engineering quality.

The implementation **MUST** preserve clear logical boundaries between at least:

```text
OWL structural model
OWLDataFactory / structural construction
parser framework and registry
OWL-native syntax parsers
RDF syntax adapters
canonical RDF/JS representation
RDF→OWL translation
OWL→RDF translation
ontology manager and document loading
document/source context
diagnostics and public errors
WebVOWL/VOWLBuilder integration
```

Third-party parser APIs **MUST NOT** leak through canonical model, translator, manager or public-package boundaries. WebVOWL-specific behaviour **MUST NOT** leak into generic `owlapi-js` core.

Exact filenames, class-to-file ratios and directory nesting are non-normative unless explicitly part of a public export contract. The team **MUST** choose structures that maximize cohesion, minimize unnecessary coupling, make navigation/testing clear and avoid gratuitously mirroring Java OWLAPI or legacy WebVOWL package layouts.

Production code **MUST** use modern standards-based ECMAScript and native ESM appropriate to the supported browser/Node baseline. New CommonJS/AMD/UMD-style internals, namespace-as-module substitutes, unnecessary transpilation or compilation machinery **MUST NOT** be introduced.

Modules **MUST** have clear responsibilities and small intentional interfaces. Circular dependencies **SHOULD** be designed out. Public barrels **MAY** define supported entry points; internal code **SHOULD** prefer direct imports when that avoids cycles/hidden dependencies. Importing a module **MUST NOT** perform implicit parser registration or unrelated global mutation.

The package **MUST** explicitly define supported public entry points through modern package `exports`. Internal file paths **MUST NOT** become accidental public API merely because files are published.

Dependencies and state **SHOULD** be explicit. Hidden singleton state, mutable global registries and action-at-a-distance behaviour **MUST NOT** be introduced where explicit ownership is simpler. Parse-session state **MUST** be isolated per operation.

Canonical OWL structural objects **MUST** remain immutable; APIs **MUST NOT** expose mutable internal collections that can violate ontology/manager invariants.

Implementations **SHOULD** favour straightforward control flow, cohesive functions and clear domain vocabulary. Clever metaprogramming, speculative abstractions, unnecessary inheritance hierarchies and generalized frameworks **SHOULD NOT** replace simpler JavaScript designs.

Asynchronous public APIs **MUST** use Promises/`async`/`await` where appropriate. New callback-style public async APIs **MUST NOT** be introduced. Cancellation-capable operations **MUST** honour the `AbortSignal` contract where specified. Floating/unobserved promises and ignored async failures **MUST NOT** be normal control flow.

Errors **MUST** use the canonical typed error taxonomy. Production code **MUST NOT** throw strings, parse error messages as program logic, silently swallow unexpected exceptions or convert programming defects into parser mismatch.

A dependency/local utility **SHOULD NOT** be introduced when the supported JavaScript/Web/Node platform already provides a clear standards-based capability. Conversely, selected mature standards libraries **MUST NOT** be reimplemented locally merely to avoid dependencies.

Portable core code **MUST NOT** directly require Node-only or browser-only globals unless isolated behind an environment adapter. Capability detection **SHOULD** test the required capability rather than guessing by user agent/runtime name.

Comments **SHOULD** explain semantics, invariants, specification rationale and non-obvious compatibility decisions rather than restating code. JSDoc **MAY** be used for documentation but **MUST NOT** create a TypeScript tooling requirement.

Authoritative semantic vocabularies, mappings, structural-kind memberships, parser metadata and capability definitions **MUST** have one source of truth wherever practical. Derived documentation/tables **SHOULD** be mechanically generated or checked to prevent drift.

Production design **MUST** permit deterministic unit/integration/security/failure-path testing without hidden global manipulation or real network access.

Before Phase 1, Phase 0 **MUST** identify the repository's applicable JavaScript formatting, linting, naming, module, testing and package conventions. New production code **MUST** comply unless this blueprint establishes a stronger requirement. A phase **MUST NOT** introduce a competing formatter, linter, module convention, test convention, build system or style regime without an approved project decision.

Engineering quality is part of Definition of Done. Review **MUST** consider architectural boundaries, cohesion/coupling, duplication, encapsulation, dependency discipline, state ownership, error/async behaviour, runtime portability, testability, clarity and current JavaScript practice. A materially inferior implementation **MUST NOT** be accepted merely because the blueprint left a physical implementation choice open.

### 13.1 Illustrative directory/package structure

The original proposed directory is too shallow because it lacks the structural model and the two RDF mapping layers. A stronger structure is:

```text
src/owlapi-js/
├── index.js
│
├── apibinding/
│   └── owlManager.js
│
├── model/
│   ├── iri.js
│   ├── owlDataFactory.js
│   ├── structuralKey.js
│   ├── structuralSet.js
│   ├── ontology/
│   │   ├── owlOntology.js
│   │   ├── owlOntologyID.js
│   │   └── owlImportsDeclaration.js
│   ├── values/
│   │   ├── owlLiteral.js
│   │   ├── owlAnonymousIndividual.js
│   │   └── owlAnnotation.js
│   ├── entities/
│   │   ├── owlClass.js
│   │   ├── owlDatatype.js
│   │   ├── owlObjectProperty.js
│   │   ├── owlDataProperty.js
│   │   ├── owlAnnotationProperty.js
│   │   └── owlNamedIndividual.js
│   ├── expressions/
│   │   ├── objectSomeValuesFrom.js
│   │   ├── objectAllValuesFrom.js
│   │   ├── objectIntersectionOf.js
│   │   ├── objectUnionOf.js
│   │   ├── ...
│   └── axioms/
│       ├── declarationAxiom.js
│       ├── subClassOfAxiom.js
│       ├── equivalentClassesAxiom.js
│       ├── ...
│
├── manager/
│   ├── owlOntologyManager.js
│   ├── owlOntologyLoaderConfiguration.js
│   ├── owlParserRegistry.js
│   ├── ontologyDocumentLoader.js
│   └── ontologyIriMapper.js
│
├── io/
│   ├── owlOntologyDocumentSource.js
│   ├── stringDocumentSource.js
│   ├── ontologyDocumentContext.js
│   ├── owlDocumentFormat.js
│   ├── formats.js
│   ├── owlParser.js
│   ├── owlParserFactory.js
│   └── errors/
│       ├── unparsableOntologyException.js
│       ├── owlParserError.js
│       ├── unsupportedConstructError.js
│       ├── resourceLimitError.js
│       └── ...
│
├── parsers/
│   ├── functional/
│   │   ├── functionalLexer.js
│   │   ├── functionalParser.js
│   │   └── functionalParserFactory.js
│   ├── manchester/
│   │   ├── manchesterLexer.js
│   │   ├── manchesterParser.js
│   │   └── manchesterParserFactory.js
│   ├── owlxml/
│   │   ├── owlXmlParser.js
│   │   └── owlXmlParserFactory.js
│   ├── dlsyntax/
│   ├── krss/
│   │   ├── krssLexer.js
│   │   ├── krssParser.js
│   │   ├── krssDialects.js
│   │   ├── krssOWLParser.js
│   │   ├── krssOWLParserFactory.js
│   │   ├── krss2OWLParser.js
│   │   └── krss2OWLParserFactory.js
│   └── rdf/
│       └── rdfOntologyParser.js
│
├── rdf/
│   ├── rdfEnvironment.js
│   ├── rdfDatasetParser.js
│   ├── rdfDatasetGraphPolicy.js
│   ├── rdfList.js
│   ├── owlToRdfTranslator.js
│   ├── rdfToOwlTranslator.js
│   └── vocabulary.js
│
├── xml/
│   ├── xmlParserAdapter.js
│   ├── xmlEntities.js
│   └── xmlBase.js
│
└── util/
    ├── constants.js
    ├── diagnostics.js
    └── resourceLimits.js
```

### 13.2 Repository-resident migration knowledge is a first-class project artefact

The source tree alone cannot preserve all of the reusable engineering knowledge discovered while migrating successive ontology syntaxes. Maintain a compact, curated knowledge structure in the repository so a new implementation team can inherit the project's current best method without reading historical conversations or every prior implementation diff:

```text
docs/owlapi-js/migration/
├── parser-migration-playbook.md      # current best method; continuously rewritten
├── migration-status.md               # current phase, gates, deferred items
├── lessons/
│   ├── 001-functional-syntax.md      # factual retrospective / evidence
│   ├── 002-manchester-syntax.md
│   ├── 003-owl-xml.md
│   ├── 004-dl-syntax.md
│   ├── 005-krss-family.md
│   ├── 006-n3-rdf.md
│   ├── 007-rdf-xml.md
│   └── 008-json-ld.md
├── decisions/
│   └── ADR-*.md                      # durable architectural decisions only
└── coverage/
    ├── parser-surface-matrix.md
    └── ...
```

The **lesson records** preserve history and evidence. The **playbook** is not an append-only diary: it is the current, distilled implementation guidance for the next migration and should be rewritten whenever a newer lesson supersedes an older rule. The strongest lessons should cease to depend on prose at all by becoming regression tests, architectural fitness checks, contract tests, lint/import rules or CI gates.

Every lesson record should capture at least:

- the capability and context in which the issue appeared;
- the initial assumption/hypothesis;
- what failed or proved unexpectedly effective;
- the observable symptom and root cause;
- the implemented correction;
- the **generalizable lesson**;
- an applicability tag such as `cross-cutting`, `owl-native`, `textual-lexer`, `xml`, `rdf-adapter`, `rdf-mapping`, `json-ld`, `security`, `performance`, `testing` or `syntax-local`;
- the regression/contract/conformance test that now protects the lesson;
- any shared contract or ADR changed because of it;
- implications for the next planned migration.

This structure is intentionally general software-engineering process documentation, not an AI-agent-specific memory mechanism.

### 13.3 Avoid a class-per-file explosion where it adds no value

The tree above describes logical ownership, not a mandate that every trivial OWL type must live in an isolated file. If multiple simple immutable axiom classes are clearer in one cohesive module, group them. Optimize for maintainability and tree-shakable public boundaries, not ceremonial mirroring of Java packages.

### 13.4 Tests colocated with implementation

Keep `*.test.js` alongside source modules where that matches current repository practice. Put large fixtures/corpora in dedicated test directories rather than duplicating them per parser.

---

## 14. Java OWLAPI Mapping: What to Mirror and What to Adapt

### 14.1 `OWLManager`

| Java OWLAPI                             | Recommended JS                                  |
| --------------------------------------- | ----------------------------------------------- |
| `OWLManager.createOWLOntologyManager()` | `OWLManager.createOWLOntologyManager(options?)` |

`OWLManager` is a convenience binding/factory. Keep it intentionally thin.

### 14.2 `OWLOntologyManager`

The normative v1 public manager surface is intentionally narrow:

```javascript
manager.getOWLDataFactory();
manager.createOntology(ontologyID?);
await manager.loadOntologyFromOntologyDocument(source, configuration?);
manager.getOntology(ontologyID); // OWLOntology | undefined
```

IRI mapping, parser registration, document context and other machinery remain internal/configuration seams unless the capability matrix explicitly promotes them to public API. Do not port Java's complete lifecycle/listener/configurator ecosystem merely because it exists upstream.

### 14.3 `OWLParser`

Java OWLAPI's important behavioural contract is that a parser recognizes a concrete syntax and contributes structural OWL content. In `owlapi-js`, the parser **MUST NOT** mutate a manager-owned ontology directly during a candidate attempt.

The internal JavaScript contract should instead operate on an isolated parse transaction/builder, conceptually:

```javascript
class OWLParser {
  parse(source, transaction, configuration) {
    // Parse into transaction-owned structural state.
    // Return/throw according to the canonical parse-outcome/error contract.
  }
}
```

This is an internal JavaScript protocol/documentation contract, not a reason to create a runtime abstract-class hierarchy or introduce TypeScript tooling.

### 14.4 Parser factory/descriptor mapping

Java parser-factory concerns map to the canonical immutable `ParserDescriptor` rather than a second public factory hierarchy.

Conceptually:

```javascript
{
  id,
  priority,
  format,
  detect(source, configuration),
  createParser,
}
```

Detection uses `MATCH | NO_MATCH | INDETERMINATE` plus `reasonCode`/`reason`; it is not a boolean `sniff()` contract. Lower numeric priority wins, with lexical parser-ID tie-breaking. Registration order **MUST NOT** affect semantics.

Concrete parser/factory objects **SHOULD NOT** become root-package public API unless the capability matrix explicitly requires an advanced parser API.

### 14.5 `IRI`

A dedicated `IRI` value object remains useful because:

- OWL structural APIs distinguish IRIs from arbitrary strings;
- validation/normalization policy has one home;
- structural keys are clearer;
- Java-facing API familiarity improves.

Do **not** use it as a URL abstraction. An IRI is not necessarily an HTTP URL.

### 14.6 `OWLOntologyID`

Represent:

```text
ontologyIRI: optional IRI
versionIRI:  optional IRI
```

Document/retrieval IRI must remain outside this identity object.

### 14.7 `OWLDataFactory`

This should become one of the first implemented model classes because every parser and translator benefits from a common construction path.

### 14.8 Java Streams and overloads

Do not emulate Java method overload ambiguity in dynamic JS. For example, instead of numerous overloaded `getAxioms(...)` signatures, prefer clearly documented methods/options until there is a proven compatibility need.

Similarly, expose iterable collections rather than creating a custom Java-Stream facsimile.

### 14.9 Method parity matrix

Maintain a machine-readable or Markdown parity matrix throughout development:

| Java type/method                      | JS status            | Behavioural parity     | Required by WebVOWL | Tests |
| ------------------------------------- | -------------------- | ---------------------- | ------------------- | ----- |
| `OWLManager.createOWLOntologyManager` | planned              | targeted               | yes                 | —     |
| `OWLOntology.getAxioms`               | planned              | targeted subset        | yes                 | —     |
| `OWLOntology.getClassesInSignature`   | planned              | targeted               | yes                 | —     |
| `OWLRDFConsumer` behaviour            | phased               | construct subset first | yes for RDF inputs  | —     |
| storers/renderers                     | deferred             | no                     | no                  | —     |
| reasoner interfaces                   | out of initial scope | no                     | no                  | —     |

This prevents the project from casually claiming “OWLAPI compatible” where only names match.

### 14.10 Mandatory source-code annotations for deferred or unimplemented OWLAPI behaviour

The parity matrix is necessary but **not sufficient**. During this refactor, the implementer must also leave **detailed source-code annotations at the exact point where an OWLAPI capability is intentionally not implemented, only partially implemented, or behaviourally divergent**. The next engineer reading a parser, translator, manager or model class should be able to discover the limitation from the code without first reading the project plan or reverse-engineering Java OWLAPI.

This requirement applies to all OWLAPI-derived or OWLAPI-compatible surfaces, including:

- parser grammar productions and syntax constructs;
- structural object/axiom families;
- `OWLDataFactory` constructors;
- RDF→OWL handlers and OWL→RDF mappings;
- ontology-manager/loading/import behaviour;
- document formats, parser factories and compatibility dialects;
- query/index methods on `OWLOntology`;
- any Java OWLAPI overload, option, recovery rule or edge case deliberately omitted from the initial JavaScript surface.

#### Required annotation convention

Use one of two explicit markers:

```javascript
// TODO(OWLAPI parity): ...
```

for behaviour intended to be implemented later, or:

```javascript
// UNSUPPORTED(OWLAPI parity): ...
```

for behaviour deliberately outside the supported contract unless that decision is revisited.

Do **not** use vague comments such as `// TODO: support more OWL`, `// not implemented`, or `// OWLAPI does more here`. Every parity annotation must contain enough information to be actionable.

At minimum, record:

1. **The missing capability in OWL terms.** Name the exact axiom, class expression, grammar production, parser mode, manager behaviour or API operation.
2. **The Java OWLAPI compatibility reference.** Give the relevant public class/interface/method, parser/factory/format identity, behavioural fixture or Javadoc reference, plus the pinned OWLAPI version used by the project's differential harness where practical. Do not require a Java implementation handler/source location merely to make a parity comment actionable; if a source location is recorded for historical provenance, it must not be treated as an instruction to translate that implementation.
3. **The normative reference when one exists.** For OWL language semantics, cite the relevant W3C OWL 2 structural syntax, concrete-syntax or OWL↔RDF mapping section/production rather than relying solely on Java implementation behaviour.
4. **The current JavaScript behaviour.** State whether the code throws a typed unsupported-feature error, records a diagnostic, deliberately does not register a parser, exposes a reduced API, or follows some documented compatibility fallback. A limitation must never be disguised by silent omission.
5. **Why it is deferred or unsupported.** For example: not required by the current WebVOWL path, blocked on another structural type, requires RDF list support, requires import-closure work, or deliberately excluded from the initial package scope.
6. **What is required to implement it correctly.** Name prerequisite model types, translator handlers, parser productions, resource-safety work or architectural decisions so a future implementation does not patch the symptom at the wrong layer.
7. **The verification hook.** Point to the relevant parity-matrix row and, where available, a focused fixture/test or issue identifier that should change when the gap is closed.

A good annotation therefore looks like:

```javascript
// TODO(OWLAPI parity): Support ObjectHasSelf in OWL/XML.
// Java compatibility reference: pinned OWLAPI OWL/XML parser via the
// `owlxml/object-has-self.owl` structural differential fixture; public
// OWL/XML parser/format API identity recorded in the parity matrix.
// Normative semantics: OWL 2 Structural Specification ObjectHasSelf and
// Mapping to RDF Graphs for ObjectHasSelf.
// Current behaviour: strict parsing throws UnsupportedConstructError;
// compatible mode records an unsupported-construct diagnostic only for an explicitly approved recovery case.
// Deferred because OwlObjectHasSelf and its OwlToRdfTranslator mapping are
// not yet present in the structural core. Implement those first; do not
// synthesize RDF/XML directly in this parser.
// Verification: parity matrix `ObjectHasSelf`; fixture
// `owlxml/object-has-self.owl`; Java structural differential test.
```

For an intentional scope boundary:

```javascript
// UNSUPPORTED(OWLAPI parity): Java OWLAPI exposes <specific API/behaviour>,
// but owlapi-js initial scope deliberately excludes it because <reason>.
// Keep this explicit so future OWLAPI-surface audits do not mistake the
// absence for an accidental omission. See parity matrix: <row/key>.
```

#### Placement rules

The comment must be placed **at the nearest stable implementation point where a future maintainer would expect the feature to exist**:

- beside the parser dispatch/production for a missing syntax construct;
- beside the translator dispatch table for a missing OWL↔RDF mapping;
- beside the manager/configuration code for deferred loader/import semantics;
- beside the public model/query surface for an intentionally omitted OWLAPI method;
- beside a dialect capability table when a production is legal in KRSS2 but intentionally rejected in KRSS1.

Do not collect all such comments in one central “missing features” source file. The parity matrix remains the project-level inventory; **source comments provide local discoverability**. Both must agree.

#### How this integrates with the parser gap-analysis process

Every gap discovered using the methodology in §3.2.5.3 must end in exactly one of three states before that parser refactor is considered reviewed:

1. **implemented and covered by a focused test**;
2. **deferred**, with a `TODO(OWLAPI parity)` annotation, parity-matrix entry and explicit runtime behaviour;
3. **unsupported by design**, with an `UNSUPPORTED(OWLAPI parity)` annotation and parity-matrix entry documenting the scope decision.

A discovered OWLAPI capability must never remain only in research notes or a review conversation. This rule applies equally when auditing Functional Syntax, Manchester Syntax, OWL/XML, DL Syntax, KRSS/KRSS1, KRSS2 and the shared RDF→OWL translator.

#### Comments are not substitutes for behaviour or tests

Parity annotations are documentation of a known boundary, not permission to silently discard input. If a parser encounters a known unimplemented construct, §2.8 still applies: strict mode must throw a typed error and any supported `compatible` recovery must match an explicitly documented recovery rule and emit its required diagnostic.

Likewise, remove or rewrite the parity annotation when the feature is implemented, and update the parity matrix and focused tests in the **same change**. Stale `TODO(OWLAPI parity)` comments are themselves compatibility defects.

Finally, describe behaviour in the project's own words. Do not paste or translate Java OWLAPI implementation code, implementation comments or control-flow descriptions into production comments. Compatibility annotations should point to public API identities, normative specifications and project-owned behavioural fixtures. Keep the implementation-independence and source-provenance requirements from §22 intact.

---

## 15. `VOWLBuilder`: the New WebVOWL Seam

### 15.1 Responsibility

`VOWLBuilder` should know OWL concepts and VOWL concepts, but **nothing about concrete ontology syntax**.

```text
OWLOntology
    ↓
VOWLBuilder
    ↓
VOWL-JSON-compatible WebVOWL structures
```

It should never:

- parse XML;
- resolve prefixes;
- inspect Turtle syntax;
- detect formats;
- reconstruct RDF lists;
- contain parser fallback logic.

### 15.2 Prefer structural traversal over RDF pattern matching

Old code may infer a restriction by spotting RDF triples. New code should consume the already-reconstructed expression:

```javascript
if (expression instanceof OWLObjectSomeValuesFrom) {
  const property = expression.getProperty();
  const filler = expression.getFiller();
  // VOWL-specific handling
}
```

This makes VOWL conversion much easier to reason about and test.

### 15.3 VOWL should not force the structural model to be shallow

Do not design `OWLOntology` merely around the handful of flattened fields that VOWL currently consumes. The structural model should faithfully represent the OWL constructs; VOWL decides which constructs it visualizes and how.

### 15.4 Development integration and cutover rule

Phase 7 may add one explicitly development-only invocation seam so the new
`OWLOntology` → `VOWLBuilder` path can be exercised in the app and end-to-end
tests before it becomes the production default. That seam must return the new
VOWL result directly; it **MUST NOT** adapt structural OWL back into the legacy
RDF/parser/converter representation.

Phase 8 rewires the existing production entry point in place and removes any
temporary development-only routing that would preserve two production paths.
After that cutover there is no runtime legacy fallback. An architecture test
and production-bundle/import-graph inspection **MUST** prove that the entry
graph cannot reach the old parser, RDF/XML interchange, `ontologyConverter.js`
or `jsonExporter.js`. The legacy files remain unmoved for characterization and
reference only.

---

## 16. Revised File Operations

### 16.1 Files to delete eventually

| File                                       | Final treatment                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `src/owl2vowl/js/rdfXmlSerializer.js`      | **Delete** after no internal caller requires RDF/XML                                                            |
| `src/owl2vowl/js/rdfXmlSerializer.test.js` | Delete/replace with OWL→RDF semantic tests if relevant                                                          |
| `src/owl2vowl/js/importLoader.js`          | Delete only after responsibilities have moved to manager + WebVOWL resolver                                     |
| `src/owl2vowl/js/rdfParser.js`             | Delete only after RDF→OWL + VOWLBuilder parity is complete                                                      |
| `src/owl2vowl/js/ontologyConverter.js`     | Make production-unreachable in Phase 8; retain in place through remaining reference work and delete in Phase 17 |
| `src/owl2vowl/js/jsonExporter.js`          | Make production-unreachable in Phase 8; retain in place through remaining reference work and delete in Phase 17 |

Do not move, rename or delete legacy files at cutover. They remain valuable as
characterization/reference material during the remaining migrations, but they
must be absent from the production reachability graph after Phase 8.

### 16.2 Files to create in WebVOWL

| File                                | Role                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/owl2vowl/js/vowlBuilder.js`    | Pure OWL structural model → VOWL-JSON-compatible WebVOWL structures; no legacy converter/exporter dependency                          |
| `src/owl2vowl/js/importResolver.js` | WebVOWL-specific catalog/path/IRI mapping provider implementing core loader interfaces                                                |
| `src/owl2vowl/js/owlapiAdapter.js`  | **Optional Phase 7 development-only invocation seam**; remove or make unreachable when the existing entry point is rewired in Phase 8 |

### 16.3 Generic `iriResolver.js` split

Do not keep all IRI resolution in WebVOWL. Split:

- **core:** IRI, relative IRI, XML Base, abbreviated IRI/prefix rules required by syntax specs;
- **WebVOWL:** application/catalog URL rewriting and local deployment paths.

### 16.4 Generic XML utilities

Move only utilities required to parse OWL/XML/XML sources. Do not carry VOWL-specific DOM traversal into `owlapi-js`.

---

## 17. Migration Strategy — Fixed Sequential Delivery, Rolling-Wave Elaboration, Mandatory Gates

The finite v1 ontology-ingestion and cutover programme **MUST** be executed
sequentially. At most one major ontology-ingestion migration may be active at a
time, and an integration/cutover gate in the normative sequence **MUST** finish
before the following ingestion migration begins.

### 17.1 Normative WIP-locked ingestion sequence

The complete v1 WIP-locked delivery sequence is:

```text
Functional Syntax
        ↓
Manchester Syntax
        ↓
OWL/XML
        ↓
RDF/JS ingestion + shared RDF→OWL reconstruction
        ↓
RDF/XML + first-real-adapter hardening
        ↓
early development-app integration
        ↓
production WebVOWL cutover
(legacy files retained in place, production-disconnected)
        ↓
N3.js adapter foundation + strict Turtle
        ↓
DL Syntax
        ↓
KRSS2 / KRSS-family migration
        ↓
N-Triples
        ↓
N-Quads
        ↓
TriG
        ↓
JSON-LD
        ↓
shared OWL→RDF
        ↓
physical legacy deletion
        ↓
standalone package / release
```

Each numbered phase **MUST** complete its Definition of Done and applicable
learning or acceptance gate, then pause for the requested Git checkpoint. The
next phase **MUST NOT** begin until that checkpoint is committed and the
repository owner explicitly instructs the implementation to proceed.

For v1, the following are normatively classified as major ontology-ingestion migrations:

1. Functional Syntax structural-parser migration;
2. Manchester Syntax structural-parser migration;
3. OWL/XML structural-parser migration;
4. syntax-independent RDF/JS ingestion and shared `RdfToOwlTranslator`
   implementation;
5. RDF/XML adapter migration and first-real-adapter hardening;
6. N3.js-backed Turtle adapter migration;
7. DL Syntax structural-parser migration;
8. KRSS2/KRSS-family structural-parser migration;
9. N3.js-backed N-Triples adapter migration;
10. N3.js-backed N-Quads adapter migration;
11. N3.js-backed TriG adapter migration; and
12. JSON-LD adapter migration.

An implementation team **MUST NOT** relabel one of these items as “infrastructure”, “translator work” or “refactoring” to execute it concurrently with another active ingestion migration.

Phases 7 and 8 are mandatory development-integration and production-cutover
gates inside this sequence. They are not permission to start the Turtle
migration concurrently. Phase 9 remains blocked until the Phase 8 production
reachability, supported-format and unsupported-format gates pass and the Phase
8 Git checkpoint is committed.

KRSS1 remains `DEFERRED`; the KRSS-family phase nevertheless performs its required compatibility-identity, grammar-gap and fixture work.

### 17.2 Preparatory and concurrent non-ingestion work

Work **MAY** proceed concurrently when it does not independently implement or materially redefine another source-to-OWL ingestion path. Examples include fixture acquisition, corpus curation, test/CI infrastructure, provenance auditing, documentation, benchmark/security tooling, packaging/release automation and unrelated WebVOWL development.

Preparatory future-phase work **MAY** identify specifications, collect fixtures, prepare Java behavioural-reference fixtures, classify conformance tests, perform dependency/provenance research and draft future execution contracts.

Preparatory work **MUST NOT** implement the future parser/adapter, syntax-specific semantic mapping, production routing or shared-contract hardening specifically against that future syntax.

### 17.3 Mandatory learning loop

Every major ingestion migration follows:

```text
IMPLEMENT
  ↓
VERIFY
  ↓
INTEGRATE
  ↓
LEARN
  ↓
INSTITUTIONALIZE
  ↓
HAND OFF
  ↓
NEXT IMPLEMENTATION
```

Maintain both:

- a canonical current `parser-migration-playbook.md` containing the best current reusable method; and
- immutable/historical per-migration lesson records preserving evidence and rationale.

Important reusable lessons **SHOULD** become executable tests/contracts/fitness/security/performance checks whenever they can be expressed deterministically.

### 17.4 Mandatory learning-gate record and dispositions

Every major ingestion migration **MUST** complete a formal learning gate after implementation acceptance and before the next migration begins.

Each migration **MUST** produce one evidence-oriented lesson record containing at least:

- phase/migration ID and name;
- baseline commit/revision;
- completion commit/revision;
- implemented scope;
- planned assumptions entering the phase;
- discoveries;
- failed approaches and why they failed;
- root causes or best-supported explanations;
- relevant measurements;
- compatibility findings;
- every material lesson/finding with applicability classification;
- institutionalization action(s);
- links to tests, fixtures, ADRs, contracts, capability-matrix entries, benchmarks, conformance cases and issues as applicable;
- unresolved questions and their dependency impact.

Each material finding **MUST** have a stable ID and enough evidence to be understood without relying on chat history or individual memory.

Applicability classifications **MUST** support at least:

```text
CROSS_CUTTING
OWL_NATIVE
TEXTUAL_PARSER
XML
RDF_ADAPTER
RDF_MAPPING
SECURITY
PERFORMANCE
TESTING
PROVENANCE
SYNTAX_LOCAL
```

A finding **MAY** have multiple applicability classifications. `SYNTAX_LOCAL` **MUST NOT** be used merely to avoid applying an inconvenient lesson elsewhere.

Every material finding **MUST** have exactly one primary disposition:

```text
NO_CHANGE
PLAYBOOK_UPDATE
TEST_OR_FITNESS_UPDATE
LOCAL_PHASE_FOLLOW_UP
PROPOSED_NORMATIVE_CHANGE
```

`NO_CHANGE` **MUST** include rationale explaining why no durable action is required.

`PLAYBOOK_UPDATE` requires the canonical playbook update before gate closure.

`TEST_OR_FITNESS_UPDATE` requires the applicable regression/contract/conformance/architecture/security/resource/performance protection before gate closure.

`LOCAL_PHASE_FOLLOW_UP` **MUST** be completed before gate closure.

`PROPOSED_NORMATIVE_CHANGE` follows §17.6 governance. A non-blocking normative proposal may remain tracked only when the next phase does not depend on it and the existing normative rule remains authoritative.

Every unresolved question on which the **next migration depends** **MUST** be resolved before handoff. Non-blocking questions may remain explicitly tracked only when their unresolved state cannot alter the next phase's required behaviour.

The gate passes only when:

```text
unclassified material findings = 0
unfinished LOCAL_PHASE_FOLLOW_UP items = 0
unapplied required PLAYBOOK_UPDATE items = 0
unapplied required TEST_OR_FITNESS_UPDATE items = 0
blocking normative proposals = 0
unresolved next-phase dependency questions = 0
phase Definition of Done = PASS
```

The gate **MUST** produce a mechanically reviewable completion summary containing at least the migration identifier, lesson-record path, finding IDs/dispositions, whether the playbook changed, executable protections added/changed, normative-change proposals, unresolved blockers and the next migration.

### 17.5 Institutionalization and handoff

The canonical playbook represents the **current best method**, not a chronological diary. Each gate **MUST** remove/supersede obsolete guidance, narrow over-broad guidance and prevent syntax-local lessons from becoming universal accidentally.

Before gate closure, the team **MUST** review every not-yet-started ingestion migration for material impact from newly discovered cross-cutting lessons.

The next team receives the repository-resident current playbook, institutionalized tests/contracts, completed lesson record, current normative architecture, capability matrix and phase execution contract. It **MUST NOT** need to reconstruct required behaviour from chat history, oral history, commit archaeology or every historical lesson file.

### 17.6 Learning-gate decision authority and plan changes

The active implementation team **MAY** refactor private implementation details, add tests, improve performance within budgets, improve non-contractual diagnostics, update syntax-local historical lessons and refine the playbook where no normative contract changes.

The team **MUST NOT** unilaterally change:

- normative architecture;
- public API;
- shared parser/model/RDF/loader/diagnostics/translator contracts;
- capability classifications;
- v1 scope;
- ingestion order or phase boundaries/prerequisites;
- phase Definition of Done;
- security policy;
- resource/performance budgets;
- dependency selections;
- provenance policy;
- compatibility/expected-difference policy;
- conformance classifications;
- another phase's required assumptions.

Such a change requires:

1. an ADR or equivalent approved project decision;
2. approval by the repository-defined project decision authority;
3. update of every affected normative artefact in the same accepted change;
4. updated tests/contracts where observable behaviour changes;
5. updated downstream phase contracts where assumptions change.

Implementation **MUST NOT** proceed on the proposed new rule until those updates are approved and committed.

An ADR does not silently override stale normative text: the ADR preserves reasoning; the current normative artefact preserves the current rule.

Before Phase 0 completes, the repository **MUST** identify the role/governance mechanism authorized to approve normative changes.

An active team may **propose** reordering future not-yet-started migrations, but it **MUST NOT** enact the reorder itself. Any approved reorder updates the normative sequence/prerequisites/status artefacts and still preserves the one-ingestion-migration WIP lock.

The current post-Phase-4 reorder, early integration/cutover rules, retained
legacy-file policy and Turtle-first N3.js sequencing were approved in
`docs/adr/0002-prioritize-rdf-ingestion-and-early-webvowl-cutover.md` and are
incorporated normatively throughout this plan.

### 17.7 Phase 0 — freeze behaviour, provenance, governance, conformance and budgets

Before production migration begins:

- pin the Java OWLAPI behavioural oracle and reference harness;
- establish the authoritative capability matrix;
- establish provenance dispositions required by §22;
- establish the repository decision authority;
- establish the canonical migration playbook and lesson-record schema;
- inventory the complete OWLAPI parser/format surface, including KRSS1/KRSS2 identities;
- pin applicable standards-conformance suites/manifests;
- measure the corpus and establish normative resource/performance budgets;
- capture current WebVOWL/legacy characterization fixtures and benchmark baselines;
- identify repository JavaScript engineering conventions.

Phase 0 **MUST** resolve any `REVIEW_EXCEPTION` provenance item that blocks Phase 1.

### 17.8 Phase 1 — structural core primitives and construction seams

Introduce the structural model, `OWLObjectKind`, exhaustive dispatch infrastructure, immutable structural objects, structural equality/keying, `OWLDataFactory`, `OWLOntology`, manager/source/config/error foundations and canonical RDF/JS contracts needed by subsequent phases.

Phase 1 **MUST NOT** add TypeScript tooling.

### 17.9 Phase 2 — Functional Syntax

Implement Functional Syntax directly to the structural model using the Phase 1 construction seams. Complete its conformance/differential/resource/performance acceptance and mandatory learning gate.

### 17.10 Phase 3 — Manchester Syntax

Implement Manchester Syntax directly to the structural model, inheriting all applicable Functional/parser-framework lessons. Complete acceptance and learning gate.

### 17.11 Phase 4 — OWL/XML

Implement OWL/XML directly to the structural model, inheriting textual-parser lessons where applicable and adding XML/environment/security lessons. Complete acceptance and learning gate.

### 17.12 Phase 5 — canonical RDF ingestion and shared RDF→OWL reconstruction

Complete the syntax-independent RDF ingestion path before activating any new
RDF syntax adapter. Implement the shared `RdfToOwlTranslator`, complete and
verify the dataset graph policy, and translate selected RDF graphs to the
canonical structural model through `OWLDataFactory` and ontology transactions.

Phase 5 tests **MUST** enter through constructed canonical RDF/JS datasets, not
through an RDF syntax parser. They must establish a finite W3C OWL-to-RDF
mapping inventory in the reverse direction, Java OWLAPI behavioural
differentials, ontology header/import/annotation reconstruction, class and data
expressions, property expressions and characteristics, assertions, keys,
negative assertions, disjointness, axiom annotations, blank-node scope, RDF
list cycle/length protection, unconsumed OWL-significant triple policy,
diagnostics, abort/timeout/resource handling and transactional rollback.

No RDF/XML-, Turtle- or other syntax-specific reconstruction rule may enter the
translator. Complete the Phase 5 learning gate before RDF/XML begins.

### 17.13 Phase 6 — RDF/XML and first-real-adapter hardening

Implement the selected `rdfxml-streaming-parser` adapter, inheriting the Phase
4 XML/environment/security lessons and terminating at canonical RDF/JS quads.
Run the independently owned W3C RDF/XML syntax classifications at the
syntax/RDF seam, then run shared RDF→OWL, Java structural differential,
import-closure, WebVOWL, resource, abort, browser/Node, heap and performance
acceptance.

Any semantic gap exposed by RDF/XML **MUST** be corrected and tested in the
shared translator unless the defect is demonstrably RDF/XML syntax
normalization. Complete the Phase 6 learning gate before development-app
integration begins.

### 17.14 Phase 7 — early development-app integration

Implement `VOWLBuilder` as a direct `OWLOntology` → VOWL-JSON-compatible WebVOWL
module and make the new ingestion/conversion path explicitly invocable in the
development app and end-to-end tests. It must not adapt structural OWL back to
the legacy RDF/parser/converter representation.

The production default remains unchanged for this checkpoint. The Phase 7
acceptance gate includes exact differential evidence, supported and malformed
RDF/XML fixtures, import closure, empty/anonymous ontologies, resource
failures, and confirmation that the new builder has no concrete-syntax
knowledge. Pause for the Phase 7 Git checkpoint before cutover.

### 17.15 Phase 8 — production WebVOWL cutover

Rewrite the existing WebVOWL production entry path in place to use
`owlapi-js` → `OWLOntology` → `VOWLBuilder`. Do not move, rename or delete any
legacy file. Remove temporary development routing that would create two
production implementations.

After cutover, the production import/bundle graph **MUST NOT** reach the legacy
parsers, RDF/XML serializer/bridge, `ontologyConverter.js` or
`jsonExporter.js`. Enforce this with a static architecture test plus production
bundle/import-graph inspection. There is no runtime legacy fallback.

At this checkpoint WebVOWL advertises only Functional Syntax, Manchester
Syntax, OWL/XML and RDF/XML from the new path. Any other legacy-only syntax,
including one discovered in an import closure, must fail explicitly with the
canonical unsupported-format diagnostics. The legacy sources remain at their
existing paths for characterization/reference tests only. Complete production
smoke, differential, import, unsupported-format and reachability acceptance,
then pause for the Phase 8 Git checkpoint before Turtle begins.

### 17.16 Phase 9 — private N3.js adapter foundation and strict Turtle

Introduce one private format-locked N3.js implementation behind the existing
RDF syntax seam and register only the Turtle descriptor. Always select explicit
Turtle mode; the dependency's permissive default mode is forbidden. Normalize
terms/quads/errors immediately, preserve prefix/document context, and pass the
canonical dataset through the already shared graph-policy and RDF→OWL modules.

N3.js should be conditionally imported after parser selection. Establish a
measured bounded streaming/chunking path for large inputs with Unicode-safe
chunks, backpressure, abort/timeout/quad-limit checks and cooperative browser
yielding. No third-party type, stream, error or undeclared transitive dependency
may leak past the private implementation.

Complete the independently owned RDF 1.1 and RDF 1.2 Turtle classifications,
strict Notation3-negative tests, bounded detection and strong-negative tests,
Node/browser adapter contracts, bundle/first-use/main-thread measurements,
resource and long-list cases, Java structural differentials, paired
RDF/XML/Turtle structural equivalence, import closure and complete WebVOWL
conversion. N-Triples, N-Quads, TriG and the broader N3 language remain
unregistered. Complete the Phase 9 learning gate before DL Syntax begins.

### 17.17 Phase 10 — DL Syntax

Implement DL Syntax directly to the structural model using the matured textual-parser contracts and all applicable resource, detection, diagnostics and differential lessons. Complete acceptance and learning gate.

### 17.18 Phase 11 — KRSS family

Implement the `REQUIRED_V1` KRSS2/KRSS-family parser scope, retain explicit KRSS1 compatibility identity, perform the required KRSS1/KRSS2 grammar-gap/fixture/negative-dialect work, and leave KRSS1 implementation `DEFERRED`. Complete acceptance and learning gate.

### 17.19 Phase 12 — N-Triples

Add the distinct strict N-Triples format/descriptor through the private N3.js
implementation established in Phase 9. Complete its independent W3C RDF 1.1
and RDF 1.2 classifications, bounded detection, default-graph normalization,
adapter replacement, differential, resource/performance and learning gates.

### 17.20 Phase 13 — N-Quads

Add the distinct strict N-Quads format/descriptor through the same private
implementation. Preserve every graph term and use this simplest line-oriented
dataset syntax to validate every dataset graph policy with real parsed input.
Complete independent conformance, differential, resource/performance and
learning gates.

### 17.21 Phase 14 — TriG

Add the distinct strict TriG format/descriptor after both Turtle syntax and
N-Quads named-graph behavior are established. Validate the combination of
Turtle-style syntax, graph blocks, dataset graph selection/loss diagnostics,
cross-format equivalence, conformance, resource/performance and learning gates.

### 17.22 Phase 15 — JSON-LD

Implement the Digital Bazaar `jsonld.js` adapter with restricted/injected document loading and no N-Quads string round-trip. Complete acceptance and the final ingestion-program learning gate.

The ingestion programme is complete after this gate unless the normative capability matrix/plan changes through §17.6 governance.

### 17.23 Phase 16 — shared OWL→RDF translator

Implement the W3C OWL→RDF mapping from canonical structural OWL to RDF/JS quads using exhaustive `kind` dispatch and graph-equivalence tests.

### 17.24 Phase 17 — remove the retained legacy pipeline

Delete the legacy parsers, RDF/XML bridge/serializer,
`ontologyConverter.js`, `jsonExporter.js` and other syntax-coupled VOWL paths
only after all planned replacement/reference work has passed acceptance and the
Phase 8 production no-reachability gate remains green. Phase 17 is physical
deletion, not the production cutover.

### 17.25 Phase 18 — extract/publish standalone package

Finalize package exports, browser/Node CI, notices/licensing/provenance, dependency records, bundle analysis, compatibility documentation and release acceptance.

## 18. Testing and Verification Strategy

### 18.1 Testing principle: compare semantics, not serialization text

OWL 2 conformance includes syntax-translation tests whose successful outputs need only describe structurally equivalent ontologies; they do not require one particular serialization. Therefore tests should not compare RDF/XML strings except where testing a serializer itself.

#### 18.1.1 Test-first methodology depends on the kind of change, not the phase number

Development is test-first from the beginning of the migration, but do **not** force artificial RED states for behaviour-preserving mechanical refactors. Use three explicit modes:

| Change type                                                                                                                      | Required methodology              | Expected starting state                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| understand/protect existing legacy behaviour                                                                                     | characterization testing          | existing implementation defines observed behaviour, while known defects are labelled as defects |
| pure structural/refactoring change with no observable semantic change                                                            | **GREEN → GREEN**                 | relevant suites pass before and after each small change                                         |
| new capability, semantic correction, bug fix, OWLAPI parity addition, W3C mapping behaviour or other observable behaviour change | strict **RED → GREEN → REFACTOR** | first add a focused test that fails for the intended reason                                     |

For every known semantic defect, **no production fix occurs before a failing regression test demonstrates the defect**. For every newly implemented W3C/OWLAPI capability, create the focused specification/parity test before production behaviour is added.

Characterization tests document legacy behaviour; they do **not** establish correctness. Where characterized behaviour conflicts with normative W3C behaviour or an explicitly selected OWLAPI compatibility requirement:

1. preserve/document the legacy observation;
2. add a failing specification/parity test for the required behaviour;
3. implement the correction;
4. deliberately update/remove the obsolete characterization expectation.

The evidence precedence is therefore:

```text
normative/public specification
        ↓
explicit selected OWLAPI behavioural compatibility requirement
        ↓
legacy WebVOWL characterization
```

Tests must target the **new abstraction boundary**. OWL-native parsers are tested against structural OWL objects; RDF adapters against RDF/JS datasets; translators against structural/graph equivalence. Do not preserve obsolete RDF/XML string intermediates merely because they are convenient golden-test outputs.

### 18.2 Layer 1 — model unit tests

Test every structural object for:

- immutability;
- structural equality;
- structural key stability;
- unordered operand normalization;
- ordered operand preservation;
- duplicate elimination;
- annotation-sensitive equality;
- signature extraction.

Critical JavaScript regressions:

```text
A∩B == B∩A structurally where OWL defines an unordered set
new EqualAxiom() deduplicates against independently-created equivalent axiom
same logical axiom + different axiom annotation != structurally equal
```

### 18.3 Layer 2 — lexer/parser tests

Preserve exact lexical cases:

- delimiters;
- language tags (`@en` compound token);
- typed literals;
- escaped literals;
- multiline strings where syntax permits;
- comments;
- prefixes;
- Unicode/IRI handling;
- source positions;
- malformed inputs;
- strict/compatible recovery;
- KRSS2 parser dialect boundaries plus required KRSS1 fixture classification proving KRSS2-only vocabulary is invalid for the deferred KRSS1 dialect; v1 does not execute a KRSS1 parser.

### 18.4 Layer 3 — syntax translation tests

For the same ontology encoded as Functional, OWL/XML, Manchester and RDF forms—and, for the subset expressible in those implemented dialects, **KRSS2 and DL Syntax**:

```text
parse(format A) → Oa
parse(format B) → Ob
assert structuralEquivalent(Oa, Ob)
```

Use W3C OWL 2 syntax-translation test cases through the pinned/classified conformance process: every case covering a `REQUIRED_V1` capability must be explicitly accounted for under §18.13.

### 18.5 Layer 4 — Java OWLAPI structural differential tests

The strongest parser oracle is Java OWLAPI itself.

Generate a canonical structural snapshot from Java rather than comparing concrete serialization. Example snapshot dimensions:

```text
ontology ID
imports declarations
ontology annotations
axiom type counts
canonical axiom representations
signatures by entity type
axiom annotations
anonymous-individual relationships
```

The JS side should generate the same normalized snapshot.

#### 18.5.1 Machine-readable expected-difference contract

Differential comparison **MUST** canonicalize only semantically irrelevant representation differences such as blank-node identifiers/isomorphism and order of unordered sets. Canonicalization **MUST NOT** be used to hide semantic differences.

After semantic canonicalization, every atomic Java-vs-JavaScript difference **MUST** be either absent or matched by exactly one approved machine-readable expected-difference rule.

Atomic difference types are at least:

```text
EXTRA
MISSING
VALUE_CHANGED
TYPE_CHANGED
```

JSON selectors **MUST** use RFC 9535 JSONPath.

Each expected-difference rule **MUST** support:

- stable ID;
- artifact type;
- fixture/bounded scope;
- parser/syntax/capability scope where required;
- difference category;
- side (`Java` or `JS`);
- exact JSONPath selector;
- exact/value constraints where required;
- match cardinality;
- rationale;
- governing specification/ADR/approved bug-fix authority.

Cardinality **MUST** be able to express exact N, min/max, zero-or-one, zero-or-more and one-or-more. Numeric semantic tolerances are forbidden.

The schema **MUST** permit narrowing an exception to one fixture, one entity, one exact JSON node, one difference kind, exact values and exactly one occurrence. Wildcards are allowed only when they still describe one precisely named semantic difference; broad catch-all subtree/field exclusions are forbidden.

Rules apply **after** atomic diffs are calculated and **MUST NOT** mutate/preprocess output to hide differences.

A differential gate is green only when:

```text
unmatched actual differences = 0
ambiguous rule matches = 0
unsatisfied required expected differences = 0
```

Stale expected-difference rules fail when their required minimum cardinality is no longer reached, unless explicitly optional with `min = 0` and documented rationale.

A W3C/normative conformance failure **MUST NOT** be waived through this mechanism. If Java OWLAPI is wrong and the JavaScript implementation is standards-correct, the conformance test passes and the exact Java-vs-JS behavioural difference is recorded here.

### 18.6 Layer 5 — OWL→RDF graph-equivalence tests

Compare:

```text
JS OWL structural model → JS OwlToRdfTranslator
Java OWLOntology        → Java RDFTranslator
```

using graph/dataset canonicalization/isomorphism, not blank-node IDs or RDF/XML text.

### 18.7 Layer 6 — RDF→OWL round-trip tests

For OWL graphs in the supported mapping domain:

```text
O
↓ OWL→RDF
G
↓ RDF→OWL
O'

assert structuralEquivalent(O, O')
```

Apply W3C mapping restrictions; do not assume every arbitrary RDF graph has a valid OWL 2 DL structural inverse.

### 18.8 Layer 7 — existing WebVOWL differential suite

The existing end-to-end corpus remains the migration gate:

1. Java OWL2VOWL reference output;
2. JS WebVOWL output through new architecture;
3. compare class/property/annotation/instance/disjoint/restriction/cardinality and other relevant fields.

This catches integration failures that parser unit tests cannot detect.

### 18.9 Layer 8 — graph/dataset tests

Include:

- default graph only;
- one named graph;
- multiple named graphs;
- identical triple in two named graphs;
- blank nodes shared across graphs (RDF dataset feature);
- ambiguous multi-graph ontology load;
- explicit merge compatibility policy;
- exact graph-policy cases: `requireSingleGraph`, `defaultGraphOnly`, `selectGraph`, and explicit graph-losing `merge`.

### 18.10 Layer 9 — imports tests

Include:

- direct/transitive/cyclic imports;
- missing import `throw` behaviour;
- missing import `diagnostic` continuation with mandatory structured diagnostic;
- local IRI mappings;
- remote import disabled;
- repeated imported document deduplication;
- anonymous-individual standardization concerns across import closure.

### 18.11 Layer 10 — performance/memory regressions

Automate benchmarks for:

- large valid Manchester/Functional ontologies;
- large unrelated input attempted by an early-reject parser;
- large RDF/XML/Turtle streams;
- deeply nested expressions;
- large RDF lists;
- import closure loading;
- `VOWLBuilder` on representative large ontologies.

Measure peak heap as well as wall time. A parser that is marginally faster but creates a catastrophic heap spike is not an improvement.

### 18.12 Layer 11 — fuzz/property tests

Use bounded fuzz/property tests for:

- malformed tokens;
- XML nesting/entities;
- cyclic/malformed RDF lists;
- parser sniffers;
- structural key stability;
- round-trip invariants.

Fuzzers must themselves obey resource limits in CI.

### 18.13 Standards conformance suite governance

Every `REQUIRED_V1` capability for which an authoritative standards test/conformance suite exists **MUST** use an explicitly pinned suite version/revision.

For each suite the repository **MUST** record:

- suite name and governing specification/version;
- authoritative upstream location;
- immutable revision/commit/release identifier;
- retrieval date;
- reproducibly stored/retrieved upstream manifest;
- project runner/adapter.

Moving branches such as `main`, `master` or `latest` **MUST NOT** be the normative CI reference.

Every test in the pinned upstream suite **MUST** have exactly one machine-readable classification:

```text
REQUIRED
NOT_APPLICABLE
EXCLUDED_WITH_REASON
```

No upstream test may remain unclassified.

`REQUIRED` tests exercise the declared standards surface and **MUST** pass. A failing `REQUIRED` test fails CI/phase acceptance and **MUST NOT** be reclassified merely because implementation is difficult or the WebVOWL corpus does not expose the issue.

`NOT_APPLICABLE` requires a reason category/rationale such as `DIFFERENT_SYNTAX`, `DIFFERENT_SPECIFICATION_VERSION`, `DEFERRED_CAPABILITY`, `UNSUPPORTED_BY_DESIGN` or `RUNNER_NOT_RELEVANT`. “Currently failing”, “difficult” or “probably unimportant” are not valid reasons.

`EXCLUDED_WITH_REASON` is exceptional and reserved for a documented upstream-test defect, specification/test-suite inconsistency, unsupported environment assumption or equivalent approved condition. Each exclusion **MUST** identify the exact test, evidence, approval reference and reconsideration condition.

CI **MUST** verify complete coverage:

```text
pinned upstream tests
=
REQUIRED + NOT_APPLICABLE + EXCLUDED_WITH_REASON
```

with no duplicates or unclassified/stale entries.

Positive and negative syntax/evaluation tests **MUST** both be preserved where applicable. “Did not crash” is not a conformance outcome.

Syntax-adapter conformance **MUST** be tested at the syntax/RDF boundary before RDF→OWL interpretation. A correct Turtle/RDF/XML/etc. parse followed by an RDF→OWL failure **MUST NOT** be misreported as syntax-parser nonconformance.

Passing an upstream suite is necessary where applicable but not sufficient for complete project correctness. Project-owned parser-selection, adapter-contract, security/resource, regression, differential, cross-format and WebVOWL tests remain required.

A standards-backed phase **MUST NOT** complete until its suite is pinned, every upstream test is classified, every `REQUIRED` test passes, every exclusion has approved evidence, and the runner is reproducible in CI.

### 18.14 Reusable lessons become durable current protection

A reusable lesson **MUST NOT** be considered captured merely because it appears in a historical lesson file. Where applicable it **MUST** be institutionalized in the current playbook, normative contract, regression/contract/conformance test, architecture fitness rule, security/resource test, performance benchmark, capability matrix, expected-difference manifest or approved normative decision.

Executable institutionalization is **RECOMMENDED** whenever the lesson can be expressed reliably as an automated invariant.

---

## 19. Security and Resource-Safety Requirements

Security belongs in the architecture, especially because ontology documents can be attacker-controlled and imports/JSON-LD can trigger network activity.

### 19.1 Bounded format detection

`MAX_SNIFF_BYTES = 8192` is the normative default detection ceiling. Every parser detector **MUST** remain within it unless an approved benchmark/security-backed change updates the limit.

### 19.2 XML entities

XML external entities **MUST NOT** be fetched.

If compatibility requires supported internal entity declarations, processing **MUST** be bounded by the finite XML/entity limits in the authoritative resource budget, including declaration count, replacement length, expansion depth and total expanded bytes. Limit violations **MUST** raise `ResourceLimitError`; processing **MUST NOT** continue with truncated or silently omitted semantic content.

“Resolve entities like Java” **MUST NOT** mean enabling unconstrained DTD/entity expansion.

### 19.3 JSON-LD remote contexts

`remoteJsonLdContexts` defaults to `false`. The core **MUST NOT** dereference a remote `@context` merely because `jsonld.js` or the runtime can perform network I/O.

When explicitly enabled, remote context loading **MUST** use the injected/controlled document-loader policy defined in §10.8, including explicit schemes, credential restrictions, SSRF controls, redirect revalidation, finite byte/time/redirect limits and `AbortSignal` support. Retries remain disabled unless explicitly configured.

### 19.4 Remote OWL imports and SSRF

`remoteImports` defaults to `false`; the core has no ambient network-import permission.

Local/injected IRI mappers/resolvers **MAY** resolve imports without network access. If an import remains unresolved, the default `missingImportHandling: "throw"` raises `MissingImportError`.

When remote loading is explicitly enabled, the injected loader **MUST** enforce the §10.8 policy and **MUST** reject unsafe targets such as loopback, private/link-local networks and metadata-service endpoints unless a separately approved application policy explicitly permits a safe case. Redirect targets **MUST** be revalidated.

The core **MUST NOT** automatically dereference arbitrary `file:`, `ftp:`, `gopher:`, `data:`, `javascript:`, `smb:` or equivalent schemes. Browser CORS and the mere presence of global `fetch` **MUST NOT** be treated as security authorization.

### 19.5 Normative resource-safety limits

The project **MUST** maintain one authoritative machine-readable resource/performance budget (conceptually `docs/owlapi-js/performance/resource-budgets.yaml`, with exact path/serialization following repository convention). Phase 0 **MUST** establish it before later parser phases rely on safety/performance acceptance.

Resource safety limits are deterministic hard ceilings; performance budgets are regression gates tied to a defined benchmark environment. They **MUST NOT** be conflated.

Every relevant dimension capable of unbounded memory, CPU, recursion, expansion or network work **MUST** have a finite default. The Phase 0 budget **MUST** define at least:

```text
maxInputBytes
maxTokenLength
maxTokenCount
maxAxioms
maxQuads
maxBlankNodes
maxRdfListLength
maxExpressionDepth
maxAnnotationDepth
maxImportDepth
maxImportCount
maxXmlNestingDepth
maxEntityDeclarations
maxEntityReplacementLength
maxEntityExpansionDepth
maxExpandedXmlBytes
maxRemoteDocumentBytes
timeoutMs
maxRedirects
maxRetries
```

Parser-specific limits **MAY** be added only for genuinely syntax-specific resources. Equivalent limits **MUST** share the same configuration name/unit across parsers.

Phase 0 **MUST** derive numeric values from the complete pinned real-world corpus, known large valid fixtures, standards-conformance fixtures, adversarial/pathological fixtures and practical browser/Node constraints. Each budget entry **MUST** record exact value/unit, evidence, observed valid maxima where relevant, headroom rationale and failure behaviour.

Exceeding a safety limit **MUST** raise `ResourceLimitError` with code `RESOURCE_LIMIT_EXCEEDED` and at least `resource` and `limit`; `observed` is included only when obtainable safely. The failure is fatal in both parsing modes, permits no parser fallback and leaves no partially committed ontology.

Implementations **MUST** enforce limits as early as practical rather than first consuming the unbounded resource.

### 19.6 ReDoS prevention

Detectors and token regular expressions **MUST NOT** contain known pathological backtracking patterns. Complex expressions applied to attacker-controlled or potentially large input **MUST** have adversarial regression tests and remain bounded by the applicable input/detection limits.

### 19.7 No `eval` / dynamic code generation

Ontology syntax parsing **MUST NOT** use `eval`, the `Function` constructor, source-driven dynamic module execution, or execute scripts embedded in ontology documents.

### 19.8 Diagnostics and source excerpts

Avoid echoing arbitrarily large source chunks into errors/logs. Truncate diagnostic excerpts and avoid exposing sensitive import credentials/authorization headers.

---

## 20. Performance and Browser Architecture

### 20.1 Stream where the syntax/library supports it

RDF adapters **SHOULD** preserve streaming as far as the selected library and semantic boundary permit. Parser-level streaming **MUST NOT** compromise complete RDF graph/dataset context where RDF→OWL requires it.

OWL-native textual parsers **MUST** preserve lazy/pull-based tokenization unless the grammar demonstrably requires bounded buffering, and **MUST** regression-test the previously observed eager-tokenization/V8-heap failure class.

### 20.2 Avoid premature duplicate indexing

Build indexes required by measured high-value queries. Do not duplicate derived state speculatively.

### 20.3 Web Worker compatibility

Portable parsing/model/translation code **SHOULD** avoid DOM/UI/global assumptions so it can execute in worker contexts where supported. Worker transfer representations **MUST** preserve canonical structural `kind` identities and semantics.

### 20.4 Dynamic parser loading

Optional/later syntax adapters **MAY** be dynamically loaded only when doing so preserves deterministic registry semantics, public capability declarations and package/export contracts. `REQUIRED_V1` capability availability **MUST NOT** become accidental runtime nondeterminism.

### 20.5 Cache derived RDF, not mutable truth

If OWL→RDF results are cached for performance, they remain derived data. The canonical ontology truth is the immutable structural model.

### 20.6 Normative performance budgets and benchmark environment

Phase 0 **MUST** define and pin a representative benchmark corpus covering at least small/medium/large valid ontologies, the largest relevant real-world ontology, large Functional/Manchester/OWL/XML/RDF/XML/RDF inputs, deeply nested valid expressions, long RDF lists, representative import closures, large mismatched input exercising early rejection and representative complete WebVOWL conversion. Later syntax phases add representative fixtures before completion.

Performance measurement **MUST** include at least wall-clock duration and peak heap usage. Throughput/allocation metrics **SHOULD** be captured where useful. A runtime improvement **MUST NOT** excuse catastrophic heap regression, nor vice versa.

Performance thresholds **MUST** be evaluated in a defined benchmark environment recording relevant OS/runtime versions, architecture, memory settings where material, dependency lockfile, fixture revisions, warm-up method, measured-run count and aggregation statistic.

Phase 0 **MUST** establish available legacy baselines. Each completed migration establishes a new accepted baseline after its Definition of Done passes. A baseline **MUST NOT** be updated merely because a regression made the old threshold fail.

Every release-gated benchmark **MUST** have an explicit threshold, expressed as an absolute bound in the pinned environment, a maximum permitted regression relative to approved baseline, or both. Exact thresholds are derived from Phase 0 evidence rather than invented by later teams.

Performance gates **MUST** use repeated measurements and a predefined aggregation/noise policy. Re-running a failing benchmark until one favourable sample passes is forbidden.

Parser-selection performance is part of the contract: a large input that does not belong to a candidate syntax **MUST** be rejected through bounded detection/fail-fast behaviour rather than eagerly tokenizing/parsing the full document merely to discover mismatch.

A capability supporting browser and Node.js **MUST** undergo relevant resource-safety testing in both. Performance budgets **MAY** differ by pinned environment; semantic resource-limit behaviour **MUST** remain consistent unless an explicit public configuration rule says otherwise.

Changing a normative safety limit requires valid-use-case evidence, security/resource analysis, updated adversarial tests, updated machine-readable budget and project approval. A limit **MUST NOT** simply be increased until a failing fixture passes.

Changing a performance threshold requires benchmark evidence, confirmation that the change is not hiding an avoidable regression, project approval and a committed rationale/baseline update.

A subject phase **MUST NOT** complete unless applicable hard-limit tests pass, adversarial cases fail with the expected `ResourceLimitError`, benchmarks remain within release thresholds and any budget change followed the approved process.

## 21. JavaScript and Packaging Best Practices

### 21.1 ESM-first

Use:

```json
{
  "type": "module"
}
```

The project already follows modern module conventions, and Node documents `"type": "module"` as the mechanism for treating `.js` files as ESM.

### 21.2 Explicit package `exports`

When extracted as a package, define a stable `exports` map. Current Node documentation recommends `exports` for new packages because it defines and encapsulates supported entry points.

Example:

```json
{
  "type": "module",
  "exports": {
    ".": "./src/index.js",
    "./model": "./src/model/index.js",
    "./rdf": "./src/rdf/index.js"
  },
  "sideEffects": false
}
```

Do not expose every internal parser/utility file as an accidental public API.

### 21.3 Named exports

Prefer named exports for domain classes/functions. A single public barrel can re-export stable APIs while internal modules use direct relative imports to avoid barrel cycles.

### 21.4 Native JavaScript only; TypeScript is outside the v1 migration

`owlapi-js` v1 **MUST** be authored as native ESM JavaScript.

The core migration **MUST NOT** introduce:

- TypeScript source files;
- the TypeScript compiler as a build/development dependency;
- `tsc`;
- `checkJs`;
- TypeScript-driven declaration generation;
- TypeScript-based exhaustive-dispatch enforcement.

JSDoc **MAY** be used where it improves documentation or maintainability, but the project **MUST NOT** depend on TypeScript tooling to interpret it.

Structural exhaustiveness **MUST** be enforced through the canonical `kind` vocabulary, centralized exhaustive dispatchers, runtime validation and automated completeness tests.

The v1 build/test workflow **MUST** execute directly from JavaScript without a TypeScript compilation stage.

TypeScript declaration files are **NOT REQUIRED** for v1. Introducing TypeScript source/tooling or generated `.d.ts` declarations is a separate future project decision and **MUST NOT** occur opportunistically during this migration.

### 21.5 No import side effects

Parser registration should happen through an explicit registry/factory bootstrap, not modules that mutate global registries merely by being imported. This improves tests, bundle analysis and tree shaking.

### 21.6 Selected v1 dependencies

The selected foundational dependencies are:

```text
@rdfjs/data-model
@rdfjs/dataset
n3
rdfxml-streaming-parser
jsonld
```

They **MUST** be used for the roles defined in §6 unless an approved replacement decision changes the normative plan. Exact versions are pinned when introduced.

`rdf-parse`, Comunica, rdflib, `rdf-ext` or another generalized RDF framework **MUST NOT** become an undeclared core runtime dependency merely to duplicate dispatcher functionality. They **MAY** be used in tests, experiments or future optional integration packages.

### 21.7 Dependency-governance policy

For each foundational dependency, record standards grounding, conformance evidence, governance/release authority, maintenance status, transitive supply-chain surface, runtime/browser cost, security/network behaviour, licence/notice obligations and replaceable adapter boundary.

A dependency replacement or material upgrade **MUST** rerun the applicable conformance, adapter-contract, differential, security/resource, browser/Node and performance gates. A phase **MUST NOT** silently upgrade a foundational dependency while doing unrelated semantic migration work.

### 21.8 Browser/Node XML adapter

Rather than scattering environment checks through OWL/XML parser code, normalize XML parsing behind one `XmlParserAdapter` using native browser `DOMParser` where appropriate and the chosen Node implementation in Node/tests.

---

## 22. Licensing Independence and Source-Provenance Gate

This section is a **core implementation constraint**, not merely a publication checklist. Its purpose is to preserve the project's freedom to choose an appropriate licence later—whether permissive or copyleft—without unnecessarily inheriting implementation-level obligations from Java OWLAPI source.

The architectural goal is therefore stronger than “pick a compatible licence”: **the new `owlapi-js` production code should be independently authored from public specifications and project-owned compatibility evidence.** Java OWLAPI remains an extremely valuable behavioural oracle, but its implementation source is not the design source for the replacement implementation.

### 22.1 Why licence-choice independence matters

The existing WebVOWL parser code is described as having been ported in significant part from Java OWLAPI source. Moving such code into a new directory or repository does not erase that provenance, and merely choosing a new repository-level licence does not by itself determine the obligations that may attach to historically derived material.

The cleanest long-term engineering position is therefore to decouple:

```text
OWL language semantics / syntax
        ↓
public normative specifications
        ↓
independently authored owlapi-js
        ↓
behavioural verification
        ↓
pinned Java OWLAPI reference harness
```

from the legacy path:

```text
Java OWLAPI implementation source
        ↓
historical Java → JavaScript port
        ↓
legacy WebVOWL parser
```

The second path can remain useful temporarily for characterization and regression comparison, but it should not be the default provenance path of the standalone core.

This strategy remains correct **regardless of the final licence direction**. A future decision between MIT, Apache-2.0, MPL-2.0, LGPL/GPL/AGPL or another compatible licence should be a project-governance choice, not something forced by avoidable source-code derivation.

### 22.2 Non-negotiable independent-implementation policy

For new `owlapi-js` production code:

1. **Implement language semantics from normative/public specifications.** For OWL 2 constructs and mappings, use the W3C structural specification, concrete-syntax specifications and OWL↔RDF mapping as primary sources.
2. **Use public syntax specifications/documentation for non-W3C dialects where available.** For Manchester, DL and KRSS-family compatibility, prefer published/public grammar and syntax documentation.
3. **Use Java OWLAPI as a black-box behavioural compatibility oracle.** Execute the pinned reference implementation on focused fixtures and compare structural results, accepted/rejected inputs, public API behaviour, parser/format identity and observable diagnostics.
4. **Do not mechanically port or translate OWLAPI implementation source.** New production modules must not be written by translating Java algorithms, branch structure, parser handlers or implementation comments into JavaScript.
5. **Do not make Java OWLAPI a runtime dependency.** Any Java reference tooling belongs in development/test infrastructure only and must be clearly separated from the published browser/Node runtime dependency graph.
6. **Keep compatibility facts project-owned.** Encode discovered behaviour in fixtures, canonical snapshots, parity matrices and concise compatibility notes written in the project's own words.
7. **Treat API compatibility and implementation provenance as separate concerns.** `owlapi-js` may intentionally expose familiar OWLAPI-compatible concepts/method names while implementing their behaviour independently.
8. **Keep third-party standards parsers behind adapters.** Their licences remain their own; the dependency-governance policy in §21.7 determines whether they are acceptable for the production dependency graph.

If an implementer believes that consulting Java OWLAPI implementation source is necessary to resolve a compatibility question, first attempt to answer it with the normative/public specification, Javadocs/API documentation and a black-box differential fixture. If source inspection is still required, record it as a **compatibility/provenance research activity** and do not copy or translate the implementation into production code.

### 22.3 Authoritative legacy-code provenance dispositions

Before migration implementation begins, Phase 0 **MUST** classify every legacy source module, substantial fragment and other implementation artefact reasonably likely to be reused by `owlapi-js`.

Each item **MUST** have exactly one normative disposition:

```text
REUSE_ALLOWED
REFERENCE_ONLY
REIMPLEMENT
EXCLUDE
REVIEW_EXCEPTION
```

`REUSE_ALLOWED` material may be moved/copied/refactored/adapted subject to applicable licence/notices and the new architecture.

`REFERENCE_ONLY` material may be consulted as historical/behavioural/provenance evidence but **MUST NOT** be copied or mechanically reproduced into new production implementation, including implementation-specific control flow, helper decomposition or private algorithms.

`REIMPLEMENT` means the capability is intentionally retained but the legacy production implementation **MUST** be replaced by independently authored production code derived from approved normative/public evidence and project-owned black-box tests.

`EXCLUDE` means the material does not belong in target `owlapi-js` core and **MUST NOT** be migrated.

`REVIEW_EXCEPTION` is a **blocking** disposition, not provisional reuse permission. Such material **MUST NOT** enter new production code until review changes it to a definitive disposition.

Disposition **MUST** be assigned at the smallest practical unit whose provenance is materially uniform. Mixed-provenance files **MUST NOT** receive blanket `REUSE_ALLOWED` merely because some regions are reusable.

The authoritative provenance inventory **MUST** be machine-readable and record at least stable ID, source path/location, classified scope, provenance category, disposition, known origin, relevant licence/copyright information, evidence, required replacement phase where relevant and review/decision reference where relevant.

Before modifying/migrating legacy material, the active team **MUST** consult and obey its disposition. Teams **MUST NOT** reinterpret provenance locally or change a disposition through a source-code edit alone.

Behavioural compatibility and implementation reuse are separate questions. Required Java OWLAPI/WebVOWL behaviour **MUST** be captured through project-owned fixtures/snapshots/tests rather than implementation copying.

Phase 0 **MUST NOT** complete until every reasonably likely migration artefact has a disposition. A `REVIEW_EXCEPTION` blocking a `REQUIRED_V1` Phase 1 capability **MUST** be resolved before Phase 0 completes; later-phase exceptions **MUST** be resolved before their dependent phase begins.

### 22.4 Independent reimplementation procedure

For each semantic parser/translator component being replaced:

1. **Identify authoritative public behaviour.** Enumerate the relevant syntax productions, structural OWL constructs and normative mapping rules before looking at the replacement code.
2. **Create focused tests first.** Where possible, create minimal fixtures for each production/edge case and record the expected structural result from the specification and/or pinned Java OWLAPI harness.
3. **Record legacy behaviour separately.** If WebVOWL behaves differently, mark the case as a characterized compatibility difference rather than silently treating the legacy output as normative.
4. **Implement against the new structural API.** Write the JavaScript code from the specification, project architecture and tests, not from Java implementation control flow.
5. **Run structural differential verification.** Compare JavaScript output with the Java OWLAPI reference snapshot and investigate divergences explicitly.
6. **Run WebVOWL end-to-end verification.** Confirm that intentional compatibility remains intact and that deliberate semantic corrections are documented/tested.
7. **Record provenance.** The module's provenance record should state its normative/public sources, third-party adapters, reference-oracle version and whether any legacy OWLAPI-derived implementation was replaced.
8. **Remove superseded derived code from the standalone core.** Do not leave an unused but distributed copy of the old port in the package.

For non-W3C syntaxes whose complete compatibility surface is not fully specified publicly, use black-box fixture generation to close the gap. The required behaviour can be learned empirically without reproducing the implementation algorithm that produced it.

### 22.5 Reference harness separation

The Java OWLAPI reference harness should be architecturally isolated, for example under development/test tooling rather than `src/`:

```text
tools/
└── owlapi-reference/
    ├── README.md
    ├── generateStructuralSnapshot.*
    ├── pinned-version metadata
    └── reference-output/
```

Requirements:

- it is not imported by browser/Node production modules;
- it is not bundled into published runtime artifacts;
- its Java dependencies are reported separately from production npm dependencies;
- generated reference snapshots are treated as test evidence, with their provenance documented;
- any upstream licence/notice obligations applicable to the development tooling or redistributed reference artifacts are handled separately and explicitly.

This distinction lets Java OWLAPI remain a powerful compatibility oracle without making it part of the runtime architecture.

### 22.6 Provenance record required for every migrated semantic module

Record at minimum:

- new `owlapi-js` module path;
- legacy WebVOWL source path, if any;
- provenance classification (`A`–`E` above);
- normative/public specifications used;
- public compatibility/API references used;
- pinned Java OWLAPI version used by differential tests;
- focused fixtures/snapshots establishing compatibility;
- third-party parser/library dependencies, if any;
- disposition of any historically OWLAPI-derived implementation (`replaced`, `excluded`, or explicitly retained following legal/licensing review`);
- reviewer/date or commit associated with the provenance decision.

This can live in a machine-readable manifest plus human-readable documentation so that release review does not depend on institutional memory.

### 22.7 Exception policy

The project may later decide that retaining a particular upstream-derived implementation is worthwhile under a compatible licence. That must be an **explicit exception**, not the default migration mechanism.

Any such exception requires:

- identifying the exact upstream material and version;
- reviewing the actual upstream licence/NOTICE obligations;
- recording why independent reimplementation is not being used;
- recording the effect on the project's possible licence choices;
- preserving all required notices/attribution;
- approval through the project's licensing review before publication.

No implementer should infer from an OWLAPI-compatible class/method name, an existing WebVOWL port or a parity TODO that source translation is authorized.

### 22.8 Licence decision comes after provenance control

The implementation blueprint should **not hard-code a final project licence merely to solve historical provenance**. First make the production core independently authored and keep the runtime dependency graph compatible with the project's licensing policy. Then choose the eventual project licence according to the desired governance/social contract.

This order preserves optionality:

```text
independent implementation + controlled dependencies
                    ↓
          broad licence-choice freedom
                    ↓
       project governance selects licence
```

The chosen licence can then be stronger or weaker in reciprocity without being dictated by avoidable dependence on Java OWLAPI implementation terms.

This document is engineering guidance, not legal advice. Before first public release, perform an appropriate licensing review; if a formal legal clean-room conclusion is important, obtain specialist counsel rather than treating this engineering process as a substitute.

## 23. Public API Example

The final WebVOWL call site should become simple:

```javascript
import { OWLManager, StringDocumentSource } from "owlapi-js";

import { VOWLBuilder } from "./vowlBuilder.js";

export default async function owl2vowl(inputString, options = {}) {
  const manager = OWLManager.createOWLOntologyManager({
    documentLoader: options.documentLoader,
    iriMappers: options.iriMappers,
  });

  const source = new StringDocumentSource(inputString, {
    documentIRI: options.documentIRI,
    contentType: options.contentType,
    fileName: options.fileName,
  });

  const ontology = await manager.loadOntologyFromOntologyDocument(
    source,
    options.loaderConfiguration,
  );

  const vowlData = new VOWLBuilder(ontology).build();

  // Existing converter/exporter stages can remain while they are still useful.
  return vowlData;
}
```

The crucial property is what is **absent** from this code:

- no format fallback loop;
- no RDF/XML conversion;
- no DOM handling;
- no raw triples;
- no parser-specific branch;
- no named-graph flattening decision hidden in VOWL code.

---

## 24. Concrete Parser Skeleton

A structural parser should be transaction-first rather than mutating a shared ontology:

```javascript
export class OWLFunctionalSyntaxOWLParser {
  parse(source, transaction, configuration) {
    const lexer = new FunctionalLexer(source.getText(), configuration);
    const parser = new FunctionalParser({
      lexer,
      dataFactory: transaction.getOWLDataFactory(),
      configuration,
      documentIRI: source.getDocumentIRI(),
    });

    const parsed = parser.parseOntology();

    transaction.setOntologyID(parsed.ontologyID);
    transaction.addImportsDeclarations(parsed.imports);
    transaction.addAnnotations(parsed.annotations);
    transaction.addAxioms(parsed.axioms);
    transaction.setDocumentFormat(parsed.format);

    return parsed.format;
  }
}
```

The exact transaction API is illustrative; the invariant is normative: candidate parsing occurs against isolated state and commits only after successful candidate acceptance.

### 24.1 Parse transaction/builder

Every parser candidate **MUST** write into an isolated parse transaction/builder. Ontology axioms, manager registration, imports and document context are committed only after the candidate returns `SUCCESS` and is accepted.

On `ParserMismatchError`, recognized-format failure or any fatal failure, the transaction **MUST** be discarded and shared state **MUST** remain observationally unchanged.

A parser **MUST NOT** mutate a manager-owned ontology incrementally and then rely on rollback cleanup after failure; isolation-before-commit is the normative model.

---

## 25. RDF Parser Skeleton

```javascript
export class RdfOntologyParser {
  constructor({ rdfDatasetParser, rdfToOwlTranslator }) {
    this.rdfDatasetParser = rdfDatasetParser;
    this.rdfToOwlTranslator = rdfToOwlTranslator;
  }

  async parse(source, transaction, configuration) {
    const { dataset, formatMetadata } = await this.rdfDatasetParser.parse(
      source,
      configuration,
    );

    // Adapter preserves the complete dataset first; policy is applied only
    // after RDF normalization and before RDF→OWL reconstruction.
    const graph = selectOntologyGraph(dataset, {
      policy: configuration.rdfDatasetGraphPolicy,
      selectedGraph: configuration.selectedGraph,
      documentContext: transaction.getDocumentContext(),
    });

    this.rdfToOwlTranslator.translateInto(graph, transaction, {
      configuration,
      documentIRI: source.getDocumentIRI(),
    });

    transaction.setDocumentFormat(formatMetadata);
    return formatMetadata;
  }
}
```

The syntax adapter and OWL interpreter are deliberately separate components. RDF syntax conformance is tested at the RDF/JS dataset boundary; OWL reconstruction is tested independently. The transaction is committed only after successful candidate acceptance.

---

## 26. Anti-Pattern Catalogue for the Refactor

| Anti-pattern                                                                                     | Why it is wrong                                                                                                                  | Replacement                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Every parser emits RDF/XML                                                                       | duplicates semantic mapping and serialization logic                                                                              | OWL-native parser → structural model                                                                                          |
| “Triples are the lingua franca”                                                                  | loses named graph data and wrongly makes RDF the OWL storage model                                                               | structural OWL + RDF/JS quads as separate IRs                                                                                 |
| `OWLOntology` wraps raw triples                                                                  | leaks RDF representation into OWL API and burdens native syntaxes                                                                | axiom/object model as source of truth                                                                                         |
| Flatten RDF datasets automatically                                                               | destroys graph membership and can combine unrelated graph fragments                                                              | explicit graph policy                                                                                                         |
| Add `.graph` to axioms                                                                           | named graph is RDF dataset context, not OWL structural semantics                                                                 | document/dataset context                                                                                                      |
| Compare OWL objects with `===`                                                                   | violates structural equivalence                                                                                                  | structural keys/equality/interning                                                                                            |
| Store unordered operands in parse order and hash directly                                        | structurally equal objects become unequal                                                                                        | canonicalize set-valued operands                                                                                              |
| Exact RDF/XML/text golden tests                                                                  | serialization differences are not semantic differences                                                                           | structural/RDF graph equivalence tests                                                                                        |
| Eager tokenization                                                                               | catastrophic V8 memory overhead on large/mismatched inputs                                                                       | generators/pull scanners                                                                                                      |
| compatible parser without sniff gate                                                             | false-positive “successful” parses                                                                                               | positive bounded sniff                                                                                                        |
| `.owl` extension determines syntax                                                               | `.owl` commonly covers RDF/XML and OWL/XML; `rdf-parse` maps it to RDF/XML                                                       | content hint + sniff                                                                                                          |
| valid XML means RDF/XML                                                                          | OWL/XML is valid XML too                                                                                                         | inspect root/namespace/syntax                                                                                                 |
| broad `catch` means “try next parser”                                                            | hides implementation/security/resource errors                                                                                    | typed recoverable-vs-fatal errors                                                                                             |
| unresolved/unbounded XML entities                                                                | data loss or entity-expansion DoS                                                                                                | bounded internal entity resolver                                                                                              |
| JSON-LD may fetch arbitrary contexts                                                             | uncontrolled network/SSRF-like behaviour in some environments                                                                    | injected restricted document loader                                                                                           |
| VOWL builder traverses XML/RDF directly                                                          | couples visualization to syntax                                                                                                  | consume OWL structural objects                                                                                                |
| claim “100% OWLAPI parity” from a few fixtures                                                   | creates misleading compatibility contract                                                                                        | explicit parity matrix + conformance/differential tests                                                                       |
| leave unimplemented OWLAPI behaviour only in planning docs or generic `TODO`s                    | local code hides known compatibility gaps and future refactors rediscover them by accident                                       | mandatory `TODO(OWLAPI parity)` / `UNSUPPORTED(OWLAPI parity)` annotations linked to parity matrix and focused tests (§14.10) |
| derive the supported-format list only from WebVOWL's current files                               | hides OWLAPI compatibility surfaces such as original KRSS/KRSS1                                                                  | inventory OWLAPI parser + factory + document-format identities first, then classify each explicitly                           |
| treat KRSS2 as a generic KRSS parser                                                             | loses dialect identity and can accept extended KRSS2 constructs when validating KRSS1                                            | separate KRSS/KRSS1 and KRSS2 adapters over a shared core only where grammar audit justifies reuse                            |
| put `rdf-parse`/Comunica beneath `OWLOntologyManager` as another universal dispatcher            | duplicates format selection/fallback and expands dependency authority                                                            | direct format-specific adapters terminating at RDF/JS                                                                         |
| choose parser dependencies only by stars or convenience                                          | ignores conformance, release authority, bus factor, supply chain and browser cost                                                | explicit dependency-governance rubric + local standards-suite CI                                                              |
| avoid third-party parser risk by writing RDF syntaxes ourselves                                  | transfers mature standards risk into local unproven code                                                                         | conformance-tested replaceable adapters over external standards implementations                                               |
| publish moved OWLAPI-derived code as if provenance-free                                          | licensing/compliance risk and avoidable constraint on future licence choice                                                      | provenance audit; independently reimplement by default; explicit exception only after licensing review                        |
| mechanically translate OWLAPI Java implementation/source comments into the new JavaScript core   | couples production-code provenance to OWLAPI implementation terms and preserves Java-specific design quirks                      | specifications-first independent implementation + black-box OWLAPI structural differential oracle                             |
| treat an OWLAPI source-code location in a parity comment as an implementation recipe             | future contributors may unknowingly recreate upstream implementation structure                                                   | comments cite public API identity + normative spec + project-owned fixture; source locations only for provenance audit        |
| parallelize major parser/adapter migrations                                                      | duplicates discovery, diverges shared contracts and bypasses the deliberate cumulative-learning handoff                          | fixed §17 WIP lock: exactly one major ontology-ingestion migration at a time for the complete v1 sequence                     |
| maintain an append-only "lessons learned" diary as the handoff mechanism                         | future teams face growing cognitive load and cannot tell current best practice from superseded history                           | preserve per-phase historical records **and** continuously rewrite a concise canonical migration playbook                     |
| record a useful parser lesson only in retrospective prose                                        | the same defect can recur when the next implementer does not retrieve/apply the note                                             | convert important lessons into regression/contract/conformance/fitness tests and shared policies                              |
| isolate OWL-native and RDF parser teams' learning because their semantic pipelines differ        | loses cross-cutting lessons about selection, diagnostics, IRI handling, security, performance, environment behaviour and testing | one cumulative ontology-ingestion playbook with explicit lesson applicability scopes                                          |
| fully prescribe distant parser implementations before earlier migrations have generated evidence | creates brittle plans based on assumptions and discourages incorporation of newly learned better approaches                      | rolling-wave elaboration: detailed next phase, high-level later phases, mandatory re-planning after each learning gate        |

---

## 27. Risks and Mitigations

### 27.1 Risk: scope expands into full OWLAPI recreation

**Mitigation:** define initial feature parity by actual WebVOWL requirements and a construct matrix. Keep reasoners, profiles, storers and large utility APIs out of the initial milestone.

### 27.2 Risk: structural object count increases memory

A rich object model can allocate more objects than a flat triple store.

**Mitigation:**

- immutability + interning for common entities/IRIs;
- structural deduplication;
- compact class representations;
- lazy derived indexes;
- benchmark against real ontologies;
- do not precompute every possible OWLAPI index.

### 27.3 Risk: RDF→OWL becomes the critical path

**Mitigation:** migrate native syntaxes first and retain legacy RDF path until parity. Implement only construct coverage needed by the current RDF corpus, then expand.

### 27.4 Risk: parser parity and standards correctness diverge

Java OWLAPI sometimes contains implementation-specific recovery behaviour beyond the W3C grammar.

**Mitigation:** distinguish:

```text
Normative requirement → W3C specification wins
Compatibility behaviour → Java OWLAPI is primary oracle
WebVOWL legacy quirk → preserve only if required/intentional
```

Document deliberate deviations.

### 27.5 Risk: parser dependency governance, supply-chain surface and bundle size

A universal parser aggregator can create unnecessary transitive dependencies and concentrate core behaviour in a small-maintainer project. Conversely, selecting a larger institutionally backed framework purely for governance can import substantial unused runtime machinery.

**Mitigation:** depend directly on narrowly scoped format implementations; isolate each behind `RdfSyntaxAdapter`; pin and audit versions; run standards suites in local CI; measure Vite output; dynamically import genuinely optional formats where justified; record bus-factor/governance assessments; and preserve at least one credible replacement path for every parser adapter. Do not write home-grown RDF syntax parsers merely to avoid third-party risk.

### 27.6 Risk: circular module dependencies in object model

OWL expressions/axioms reference many object categories.

**Mitigation:** central factory and canonical `kind` taxonomy, careful dependency direction, documentation-only JSDoc where useful, and direct internal imports that avoid barrel-induced cycles.

### 27.7 Risk: source-order expectations

OWL structural sets do not semantically preserve order, but legacy visualization/tests may accidentally depend on parse order.

**Mitigation:** identify these dependencies explicitly. If deterministic presentation ordering is needed, sort at the VOWL/output layer; do not corrupt OWL structural equality to preserve incidental source order.

---

### 27.8 Risk: behavioural parity work accidentally becomes source-code derivation

A compatibility project naturally encourages developers to inspect the reference implementation. Without an explicit boundary, “make JS behave like OWLAPI” can drift into Java-to-JavaScript translation, reducing licence-choice independence and reintroducing Java-specific implementation structure.

**Mitigation:** enforce §22 as a migration invariant: specifications/public documentation define the implementation; the pinned Java OWLAPI harness supplies black-box behavioural evidence; historically OWLAPI-derived WebVOWL code is characterized then replaced; any exception is explicit and reviewed.

### 27.9 Risk: violating the fixed sequential ingestion WIP lock

**Risk:** teams begin a later parser/adapter while the current ingestion migration is still producing/institutionalizing lessons, causing duplicated discovery, divergent contracts and avoidable rework.

**Mitigation:** §17 explicitly enumerates the complete v1 WIP-locked ingestion sequence. Only one major ontology-ingestion migration is active at a time. Preparatory evidence/fixture work may proceed, but production semantics of later ingestion phases **MUST** wait. There is no automatic transition to parallel parser migrations.

### 27.10 Risk: the lessons repository becomes a second oversized specification

An append-only archive can eventually recreate the same cognitive-load problem it was intended to solve. Teams may read stale or contradictory advice, or stop consulting the repository altogether.

**Mitigation:** separate immutable-ish historical lesson records from the continuously curated current playbook; tag lesson applicability; retire superseded playbook guidance; promote important lessons into tests/contracts/ADRs; keep the playbook small enough to be a practical pre-flight document for the next migration.

## 28. Scope: Initial Release vs Future Work

### 28.1 Initial `owlapi-js` core target

**In scope:**

- W3C-faithful structural objects needed by WebVOWL;
- `OWLDataFactory`;
- `OWLOntology` and manager/loading essentials;
- existing OWL-native parser families, including the existing KRSS2 behaviour;
- an explicit KRSS/KRSS1 compatibility identity, required KRSS1/KRSS2 grammar-gap/fixture work and shared KRSS-family architecture, with KRSS1 parser implementation explicitly `DEFERRED`;
- RDF/JS parser boundary;
- RDF→OWL coverage required for current corpus;
- OWL→RDF mapping for supported structural objects;
- imports/document resolver abstractions;
- diagnostics/resource policies;
- browser + Node support;
- high-quality public API and semantic documentation.

### 28.2 Explicitly not required for initial extraction

- **Notation3 (N3) language ingestion** — `DEFERRED`; N3.js is used only for Turtle, TriG, N-Triples and N-Quads in v1.

- description-logic reasoner implementation;
- complete reasoner API parity;
- every OWLAPI utility/search helper;
- ontology change listeners/events unless WebVOWL needs them;
- profiles/checkers unless needed for correctness diagnostics;
- concrete ontology storers/serializers;
- OBO parser unless current scope requires it;
- **KRSS1 parser implementation** — explicitly `DEFERRED` for v1 while its compatibility identity, grammar-gap analysis, fixtures and future-ready architecture remain required;
- SWRL completeness unless test corpus requires it;
- byte-for-byte serializer parity with Java OWLAPI.

### 28.3 Why OWL→RDF belongs in core even though storers do not

`OwlToRdfTranslator` is a semantic mapping layer, not a concrete storer. It should be included because it:

- completes the model boundary;
- enables round-trip tests;
- supports future RDF serializers without coupling to any format;
- mirrors normative OWL architecture.

Concrete `RDFXMLStorer`, Turtle writer, etc. can be added later on top of RDF/JS serializers.

---

## 29. Definition of Architectural Success

The extraction is successful when all of the following are true:

### Separation

- WebVOWL has no ontology syntax parsing logic.
- `owlapi-js` has no VOWL concepts.
- RDF/XML is absent as an internal interchange format.

### Semantics

- all supported OWL-native syntaxes produce the same structural object model;
- all supported RDF syntaxes pass through a common RDF/JS boundary and shared RDF→OWL interpreter;
- structural equality follows W3C set/list semantics;
- annotations/imports/ontology identity are not lost;
- named graph membership is not silently flattened.

### Compatibility

- current Java differential corpus is green;
- WebVOWL output is unchanged except for explicitly approved bug fixes;
- malformed/unsupported input fails explicitly rather than silently losing semantic content.

### Engineering quality

- large input does not cause eager-token OOM;
- parsing/imports have resource and network limits;
- package is ESM-first with defined exports and types;
- parser factories are explicit and tree-shaking-friendly;
- tests compare structural/RDF semantics rather than serializer accidents.

### Reuse

A non-WebVOWL consumer can do:

```javascript
const manager = OWLManager.createOWLOntologyManager();
const ontology = await manager.loadOntologyFromOntologyDocument(source);

for (const cls of ontology.getClassesInSignature()) {
  // generic OWL application code
}
```

without importing any VOWL code.

---

## 30. Implementation Checklist

### Sequential migration / organizational learning

- [ ] Execute exactly one major ontology-ingestion migration at a time for the complete §17 sequence.
- [ ] Complete Definition of Done + mandatory learning gate before beginning the next ingestion migration.
- [ ] Maintain the canonical `parser-migration-playbook.md` plus historical per-migration lesson records.
- [ ] Classify every material finding by applicability and primary disposition.
- [ ] Leave zero unclassified findings, zero unfinished local follow-ups and zero blocking normative proposals at gate closure.
- [ ] Institutionalize reusable lessons into current playbook/tests/contracts/fitness/security/performance checks where applicable.
- [ ] Permit preparatory fixture/research work for later phases, but no future production parser/adapter semantics.
- [ ] Require approved project decision + same-change normative-document updates for sequence, scope, API, shared-contract, dependency, security, provenance, budget or conformance changes.
- [ ] Never introduce a later parallel parser-migration mode.

### Architecture

- [ ] Introduce two canonical IRs: OWL structural model and RDF/JS dataset.
- [ ] Ensure `OWLOntology` stores axioms/metadata, not raw triples.
- [ ] Add `OWLDataFactory`.
- [ ] Add structural equality/key semantics.
- [ ] Add explicit document/dataset context.
- [ ] Build a complete OWLAPI parser/factory/format inventory and classify every entry using exactly `REQUIRED_V1`, `DEFERRED`, `UNSUPPORTED_BY_DESIGN`, or `DELEGATED`.
- [ ] Enforce the §14.10 source-code parity-comment convention for every deferred, partially implemented or unsupported OWLAPI capability.
- [ ] Ensure every `TODO(OWLAPI parity)` / `UNSUPPORTED(OWLAPI parity)` annotation has a matching parity-matrix entry and explicit runtime behaviour; no known gap exists only in planning documentation.
- [ ] Enforce §22 implementation independence: normative/public specifications + project-owned tests define production code; OWLAPI supplies behavioural compatibility evidence only.
- [ ] Keep historically OWLAPI-derived legacy code on the characterization side of the migration seam until it is independently replaced or explicitly reviewed as an exception.

### Native parsers

Execute these as sequential learning batches at their §17 positions. The RDF
foundation, RDF/XML, integration/cutover and Turtle phases now occur between
the completed OWL/XML batch and the later DL/KRSS batches:

- [ ] Functional → structural model; complete learning gate.
- [ ] Manchester → structural model; complete learning gate.
- [ ] OWL/XML → structural model; complete learning gate.
- [ ] DL → structural model; complete learning gate.
- [ ] KRSS2/KRSS-family → structural model; complete learning gate.
- [ ] Inventory KRSS/KRSS1 as a distinct OWLAPI parser/factory/format compatibility surface.
- [ ] Diff OWLAPI KRSS1 vs KRSS2 grammars and extract shared parser machinery only where behaviour is genuinely common.
- [ ] Keep KRSS1 parser implementation `DEFERRED`; complete required distinct compatibility identity, grammar-gap analysis, fixtures/negative dialect tests and future-ready architecture.
- [ ] Preserve lazy tokenization.
- [ ] Preserve exact language-tag/token rules.
- [ ] Strict unsupported constructs throw typed errors.

### RDF

Continue the same cumulative ingestion-learning sequence rather than treating RDF adapters as an unrelated programme:

- [ ] Complete the canonical RDF/JS dataset/graph-policy contracts and shared, syntax-independent RDF→OWL translator in Phase 5 using constructed datasets.
- [ ] Implement the direct `rdfxml-streaming-parser` adapter in Phase 6, inheriting XML and RDF lessons and hardening only the shared translator for semantic gaps.
- [ ] Introduce the private strict-mode N3.js implementation plus Turtle only in Phase 9; conditionally load it and establish measured streaming/yield behavior.
- [ ] Keep N3 language ingestion `DEFERRED` and enforce focused Notation3-negative tests.
- [ ] Add the remaining N3.js-backed formats independently as N-Triples, N-Quads and TriG in Phases 12, 13 and 14.
- [ ] Implement Digital Bazaar `jsonld.js` in Phase 15 with a restricted/injected document loader and no N-Quads string round-trip.
- [ ] Keep all parser-specific types/errors/configuration behind `RdfSyntaxAdapter`.
- [ ] Record dependency governance metadata and execute the exact pinned conformance manifests in CI.
- [ ] Preserve graph field.
- [ ] Implement exact `rdfDatasetGraphPolicy` values: `requireSingleGraph`, `defaultGraphOnly`, `selectGraph`, `merge`.
- [ ] Implement RDF-list decoder.
- [ ] Keep RDF→OWL semantic reconstruction in one shared translator; never patch a syntax adapter with private OWL mapping rules.
- [ ] Implement the shared OWL→RDF translator in Phase 16.
- [ ] Remove the RDF/XML internal serializer with the retained legacy pipeline in Phase 17.

### Manager / I/O

- [ ] Explicit parser registry descriptors.
- [ ] Immutable loader configuration.
- [ ] String document source.
- [ ] Generic document loader protocol.
- [ ] IRI mapper protocol.
- [ ] Import closure/cycle handling.
- [ ] Exact missing-import strategies: `throw` and `diagnostic`.
- [ ] `AbortSignal` support where applicable.

### WebVOWL

- [ ] Create `VOWLBuilder` consuming `OWLOntology` and producing VOWL-JSON-compatible structures without legacy converter/exporter imports.
- [ ] Move WebVOWL catalog/path resolver to injected core interfaces.
- [ ] Remove XML/RDF syntax awareness from VOWL conversion.
- [ ] Exercise the new path in the development app in Phase 7, then rewire the existing production entry in Phase 8.
- [ ] After Phase 8, enforce zero production import/bundle reachability to the legacy parser/converter/exporter path and no runtime fallback.
- [ ] Leave legacy files unmoved for characterization/reference until physical deletion in Phase 17.

### Security

- [ ] Bound sniffing.
- [ ] Harden XML entity expansion.
- [ ] Restrict remote JSON-LD contexts.
- [ ] Restrict remote imports.
- [ ] Establish Phase 0 machine-readable finite resource-safety limits and enforce them through `ResourceLimitError`.
- [ ] Add timeout/redirect/byte limits.
- [ ] Avoid broad parser fallback catches.

### Tests

- [ ] W3C structural-equivalence model tests.
- [ ] parser lexer/unit tests.
- [ ] W3C syntax-translation tests.
- [ ] Java structural differential snapshots.
- [ ] Machine-readable expected-difference manifest using RFC 9535 JSONPath and exact atomic-difference/cardinality rules; zero unmatched/ambiguous/stale required differences.
- [ ] OWL→RDF graph equivalence.
- [ ] RDF→OWL round trips.
- [ ] named graph preservation.
- [ ] imports/cycles/missing imports.
- [ ] existing 44-ontology / WebVOWL differential corpus.
- [ ] performance/heap regressions against the pinned benchmark environment and approved thresholds.
- [ ] malformed/adversarial inputs.
- [ ] Independently owned pinned exhaustive conformance scopes for RDF/XML, Turtle, N-Triples, N-Quads and TriG with every upstream test classified `REQUIRED`, `NOT_APPLICABLE` or `EXCLUDED_WITH_REASON` before its phase completes.
- [ ] Pinned exhaustive JSON-LD conformance manifest with every upstream test classified and every `REQUIRED` test passing.
- [ ] adapter replacement contract tests proving parser-specific types do not leak past RDF/JS normalization.
- [ ] strict N3.js format-mode and Notation3-negative tests; never exercise the dependency's permissive default as a supported format.
- [ ] production no-legacy-reachability and explicit unsupported-format/import tests after cutover.

### Packaging / compliance

- [ ] ESM `type: module`.
- [ ] `exports` map.
- [ ] `sideEffects: false` only after verifying modules truly have no side effects.
- [ ] Native ESM JavaScript build/test/release path with no TypeScript/`tsc`/`checkJs` dependency.
- [ ] JSDoc only where useful for documentation; no TypeScript-driven `.d.ts` requirement.
- [ ] browser and Node CI.
- [ ] complete §22 source-provenance audit and machine-readable provenance manifest.
- [ ] every relevant legacy module/fragment has exactly one provenance disposition: `REUSE_ALLOWED`, `REFERENCE_ONLY`, `REIMPLEMENT`, `EXCLUDE`, or `REVIEW_EXCEPTION`.
- [ ] no new production module was mechanically translated from Java OWLAPI implementation source/comments/control flow.
- [ ] Java OWLAPI compatibility tooling is isolated to development/test infrastructure and absent from runtime/package bundles.
- [ ] public/normative implementation sources and project-owned differential fixtures are recorded for each semantic module.
- [ ] final project licence is selected **after** provenance/dependency review, so the choice is not dictated by avoidable OWLAPI implementation derivation.
- [ ] required third-party notices/licenses.
- [ ] compatibility/parity matrix.
- [ ] dependency-governance/conformance manifest for foundational syntax parsers.
- [ ] Vite bundle-size report for mandatory and optional syntax adapters.

---

## 31. Research Findings Behind the Final Decisions

### 31.1 W3C structural model is intentionally API-suitable

The OWL 2 Structural Specification describes the conceptual structure independently of concrete exchange syntax and explicitly allows tool APIs/internal models to follow that structural specification so long as observable behaviour conforms. This is direct standards support for using it as `owlapi-js`'s semantic IR.

### 31.2 Structural equivalence is stricter than “same meaning” and different from JS identity

OWL structural equivalence is syntactic structural equality, not logical equivalence. Most associations are unordered duplicate-free sets; explicitly ordered associations are list-like. Axiom annotations affect structural equivalence. This is why a structural key/equality layer is required rather than ordinary JavaScript object identity.

### 31.3 OWLAPI parsers produce ontology objects, not quads

The OWLAPI `OWLParser` contract says parsers add axioms to the supplied `OWLOntology`. That supports direct structural parsing for OWL/XML, Functional and Manchester rather than routing them through RDF.

### 31.4 OWLAPI has explicit mappings in both directions

- `AbstractTranslator` / `RDFTranslator`: ontology → RDF graph.
- `OWLRDFConsumer`: RDF graph → OWL entities, expressions and axioms using triple handlers.

This independently validates the proposed separation between structural ontology and RDF representation.

### 31.5 RDF/JS deliberately uses quads as the universal RDF statement shape

The current RDF/JS Data Model requires RDF terms/quads to be treated as immutable and specifies that triples are represented as quads with `DefaultGraph`. This makes RDF/JS the natural interoperability boundary for a modern JavaScript implementation.

### 31.6 RDF datasets contain more structure than RDF graphs

Current RDF Concepts defines a dataset as one default graph plus zero or more named graphs. Graph names are dataset structure, not automatically provenance. This supports preserving the quad graph term and prohibiting silent dataset flattening.

### 31.7 Direct format-specific RDF parsers are a stronger core dependency strategy than `rdf-parse`

`rdf-parse` is technically capable and usefully demonstrates that multiple RDF syntaxes can converge on RDF/JS quads. However, it is itself a dispatch/orchestration layer, while `owlapi-js` already needs OWLAPI-compatible parser selection. Making it foundational would duplicate responsibilities and increase transitive dependency authority.

The stronger core design is direct format adapters:

- RDFJS-hosted **N3.js** for Turtle/TriG/N-Triples/N-Quads, with broader N3-language ingestion `DEFERRED`;
- RDFJS-hosted **`rdfxml-streaming-parser`** for RDF/XML, backed by a published W3C RDF/XML report showing 162/162 tests passing;
- Digital Bazaar **`jsonld.js`** for JSON-LD, with its official JSON-LD test-suite integration and configurable document loader.

All converge immediately on RDF/JS. Parser choice is therefore replaceable without altering RDF→OWL or consumer code.

### 31.8 Dependency governance is part of semantic architecture

A standards library can be technically correct yet still be a poor foundational dependency if its release authority, succession path, transitive supply chain or browser cost are unsuitable. Conversely, a small project can be a defensible parser dependency when it has strong conformance evidence and is isolated behind a standard replaceable boundary.

The project therefore **MUST** maintain explicit dependency-governance records and pinned exhaustive conformance manifests under §18.13. The architectural objective is **verified replaceability**, not permanent trust in any one package.

Comunica, rdflib and Oxigraph remain credible alternatives for different deployment profiles, but are intentionally not core defaults: Comunica duplicates orchestration through its bus/actor architecture, rdflib is a much broader Linked Data toolkit, and Oxigraph's Rust/WASM approach has attractive supply-chain/conformance properties but a materially heavier browser footprint.

### 31.9 W3C conformance tests explicitly favour structural equivalence over one serialization

OWL 2 syntax-translation tests accept differing serializations when they describe structurally equivalent ontologies. This supports moving golden tests away from RDF/XML strings toward structural snapshots and graph equivalence.

### 31.10 Java OWLAPI remains a strong behavioural oracle, not a production implementation template

OWLAPI's long history and continuing parser/round-trip fixes demonstrate that edge cases are real. Its public API surface, accepted/rejected inputs and resulting structural ontologies are valuable compatibility evidence; its architectural separation also informs this blueprint at a conceptual level. The replacement JavaScript implementation should nevertheless be independently authored from public specifications and project-owned behavioural tests rather than mechanically translating Java implementation code. This preserves both JavaScript-native architecture and future licence-choice independence.

### 31.11 The JavaScript ecosystem gap is historically explainable

The 2014 `owljs` project explicitly used JVM calls to OWLAPI from JavaScript rather than reimplementing the stack. Combined with the later success of RDF/JS, this explains why JavaScript gained excellent RDF infrastructure without a comparably mature structural OWLAPI.

### 31.12 Licence choice should be decoupled from implementation provenance

The project may ultimately prefer a permissive licence or a reciprocal/copyleft licence; that governance decision is separate from how the implementation is authored. A specifications-first independent implementation with permissively compatible production dependencies preserves the broadest choice. Historical OWLAPI-derived code therefore belongs in the migration/provenance audit and characterization harness, not automatically in the new production core.

### 31.13 Sequential ingestion migration is the selected delivery contract

The project contains a finite, known parser/adapter programme and deliberately prioritizes cumulative learning transfer over parser-team concurrency. The selected delivery contract is therefore one WIP-locked ontology-ingestion migration at a time across the complete v1 sequence, including RDF→OWL hardening. Rolling-wave learning may refine/reorder future phases through governance, but there is no evidence threshold that automatically enables parallel parser migrations.

### 31.14 Software-engineering experience must be packaged for reuse, not merely archived

The Experience Factory tradition in software engineering and modern lessons-learned practice both support a deliberate cycle in which project experience is collected, generalized, packaged and applied to subsequent work. NASA's current lessons-learned model similarly emphasizes **Collect → Record → Disseminate → Apply**.

For this migration, the practical consequence is a two-layer knowledge design: detailed per-implementation lesson records preserve evidence, while a continuously curated parser-migration playbook captures the current best method. Important lessons should additionally become executable tests/contracts/fitness checks so future teams inherit them automatically.

### 31.15 Rolling-wave elaboration refines future implementation details without changing the WIP lock

The architecture, semantic invariants, release scope and acceptance criteria should be stable enough to coordinate the programme. Detailed implementation steps for later parser migrations should remain progressively elaborated because earlier migrations are expected to change the best known method. After each learning gate, update the next phase in detail and permit evidence-based reordering of later phases without reopening non-negotiable architectural decisions.

### 31.16 OWL-native and RDF syntaxes are separate semantic architectures but one cumulative sequential implementation-learning programme

The code must maintain the strict semantic boundary—OWL-native parsers construct structural OWL; RDF parsers construct RDF/JS datasets and rely on `RdfToOwlTranslator`. The delivery process should nevertheless carry cross-cutting lessons across that boundary. N3-family, RDF/XML and JSON-LD adapter work should inherit prior knowledge about parser selection, diagnostics, source/document IRIs, resource safety, environment differences, differential testing and provenance while adding RDF-specific lessons of their own.

---

## 32. Core References

The following sources should be treated as the architectural/behavioural hierarchy during implementation.

### Normative / standards-first

- **BCP 14 / RFC 2119 + RFC 8174** — normative requirement-keyword interpretation used by this blueprint.
- **RFC 9535 — JSONPath: Query Expressions for JSON** — selector language for machine-readable expected-difference rules.

1. **W3C — OWL 2 Web Ontology Language: Structural Specification and Functional-Style Syntax (Second Edition)**  
   https://www.w3.org/TR/owl2-syntax/

2. **W3C — OWL 2 Web Ontology Language: Mapping to RDF Graphs (Second Edition)**  
   https://www.w3.org/TR/owl2-mapping-to-rdf/

3. **W3C — OWL 2 Web Ontology Language: Conformance (Second Edition)**  
   https://www.w3.org/TR/owl2-conformance/

4. **W3C — OWL 2 XML Serialization**  
   https://www.w3.org/TR/owl2-xml-serialization/

5. **W3C — RDF 1.2 Concepts and Abstract Data Model**  
   https://www.w3.org/TR/rdf12-concepts/

### JavaScript RDF interoperability

6. **RDF/JS — Data Model Specification**  
   https://rdf.js.org/data-model-spec/

7. **RDF/JS — Dataset Specification**  
   https://rdf.js.org/dataset-spec/

8. **N3.js — RDFJS Turtle/TriG/N-Triples/N-Quads parser library (broader N3 language support deferred)**  
   https://github.com/rdfjs/N3.js

9. **`rdfxml-streaming-parser` — RDFJS RDF/XML parser**  
   https://github.com/rdfjs/rdfxml-streaming-parser.js

10. **W3C RDF/XML implementation reports**  
    https://w3c.github.io/rdf-tests/rdf/rdf11/rdf-xml/reports/

11. **Digital Bazaar `jsonld.js`**  
    https://github.com/digitalbazaar/jsonld.js

12. **`@rdfjs/data-model` / RDFJS packages**  
    https://github.com/rdfjs-base/data-model

13. **`@rdfjs/dataset`**  
    https://github.com/rdfjs-base/dataset

14. **W3C RDF test suites**  
    https://w3c.github.io/rdf-tests/

15. **W3C JSON-LD API test suite**  
    https://github.com/w3c/json-ld-api

16. **Comunica Association — governance reference / alternative parsing framework**  
    https://comunica.dev/association/

17. **Oxigraph — Rust/WASM RDF implementation and alternative deployment option**  
    https://github.com/oxigraph/oxigraph

18. **rdflib.js — long-lived Linked Data toolkit / alternative RDF/XML implementation**  
    https://github.com/linkeddata/rdflib.js

19. **`rdf-parse` — optional/reference universal RDF parser dispatcher, not a required core dependency**  
    https://github.com/rubensworks/rdf-parse.js

### Behavioural compatibility oracle and provenance references

20. **OWLAPI repository / source** — use for upstream version/licence/provenance audit and conceptual architecture research; **not as a source-to-source implementation template for new production modules**. Behavioural parity should preferentially be captured through the pinned Java reference harness, public Javadocs and project-owned differential fixtures.  
    https://github.com/owlcs/owlapi

21. **OWLAPI `OWLParser` Javadocs**  
    https://owlcs.github.io/owlapi/apidocs_5/org/semanticweb/owlapi/io/OWLParser.html

21a. **OWLAPI `KRSS2OWLParser` Javadocs** — documents the extended KRSS2 vocabulary and explicitly distinguishes it from `KRSSOWLParser`  
https://owlcs.github.io/owlapi/apidocs_5/org/semanticweb/owlapi/krss2/parser/KRSS2OWLParser.html

21b. **OWLAPI class hierarchy / parser and document-format factories** — includes separate KRSS1/KRSS2 parsers and format factories  
https://owlcs.github.io/owlapi/apidocs_5/overview-tree.html

22. **OWLAPI `OWLRDFConsumer` Javadocs**  
    https://owlcs.github.io/owlapi/apidocs_5/org/semanticweb/owlapi/rdf/rdfxml/parser/OWLRDFConsumer.html

23. **OWLAPI `OWLOntologyManager` Javadocs**  
    https://owlcs.github.io/owlapi/apidocs_5/org/semanticweb/owlapi/model/OWLOntologyManager.html

24. **OWLAPI `OWLOntologyLoaderConfiguration` Javadocs**  
    https://owlcs.github.io/owlapi/apidocs_5/org/semanticweb/owlapi/model/OWLOntologyLoaderConfiguration.html

25. **OWLAPI `AbstractTranslator` / `RDFTranslator`** — use the public API/Javadocs and black-box graph output as architectural/behavioural reference. Any inspection of matching OWLAPI implementation source belongs to provenance/compatibility research and must not become Java-to-JavaScript source translation.

### Delivery, organizational learning and evolutionary planning

26. **DORA — Working in small batches** — small batches shorten feedback loops and increase the ability to learn and change direction.  
    https://dora.dev/capabilities/working-in-small-batches/

27. **DORA — Continuous Integration** — integrate small changes frequently and keep the shared build healthy rather than creating late integration events.  
    https://dora.dev/capabilities/continuous-integration/

28. **Team Topologies — Purposeful team collaboration / interaction modes** — use high-bandwidth collaboration for discovery, then reduce coupling as knowledge and boundaries stabilize.  
    https://teamtopologies.com/news-blogs-newsletters/the-power-of-purposeful-team-collaboration

29. **Atlassian — Kanban WIP limits** — limiting work in progress encourages finishing, exposes bottlenecks and reduces context switching.  
    https://www.atlassian.com/agile/kanban/wip-limits

30. **NASA APPEL — Lessons Learned** — formal lessons lifecycle emphasizing collection, recording, dissemination and application.  
    https://www.nasa.gov/learning-resources/for-professionals/appel-lessons-learned/

31. **Google Cloud — Architecture Decision Records** — keep durable architectural decisions and rationale close to the system for later teams.  
    https://docs.cloud.google.com/architecture/architecture-decision-records

32. **Google SRE — Lessons Learned / postmortem culture** — convert incidents and failures into shared corrective actions and organizational learning.  
    https://sre.google/sre-book/lessons-learned/

33. **Basili et al. — Experience Factory / systematic software-engineering experience reuse** — historical foundation for packaging project experience so subsequent work can reuse it.  
    https://onlinelibrary.wiley.com/doi/abs/10.1002/0471028959.sof110

### Packaging / historical context

34. **Node.js package documentation (`type`, `exports`)**  
    https://nodejs.org/api/packages.html

35. **Chris Mungall — `owljs`, a JavaScript library for OWL hacking**  
    https://douroucouli.wordpress.com/2014/03/30/owljs-a-javascript-library-for-owl-hacking/

---

## 33. Final Recommendation

Proceed with the extraction, but **replace the original “all parsers emit triples and `OWLOntology` indexes them” design before implementation begins**.

The final architectural rules are:

> **OWL syntax front ends construct OWL. RDF syntax front ends construct RDF. A single standards-based mapping layer connects the two. WebVOWL consumes OWL and knows nothing about syntax.**

> **The new production core is independently implemented from normative/public specifications and project-owned compatibility evidence. Java OWLAPI is a pinned behavioural oracle and development-time reference, not a source-to-source implementation template or runtime dependency.**

> **The complete finite v1 ontology-ingestion programme is WIP-locked to one major migration at a time. Every completed parser/adapter/ingestion-hardening phase verifies, integrates, learns, institutionalizes and hands off before the next begins. There is no later parallel parser-migration mode.**

> **Implementation discretion is constrained by modern JavaScript engineering best practice, the repository's engineering standards and the normative logical/module boundaries in this plan. `owlapi-js` v1 remains native ESM JavaScript with no TypeScript/`tsc`/`checkJs` requirement.**

The normative delivery sequence is:

```text
Functional
   ↓ learn / institutionalize
Manchester
   ↓ learn / institutionalize
OWL/XML
   ↓ learn / institutionalize
RDF/JS + shared RDF→OWL
   ↓ learn / institutionalize
RDF/XML
   ↓ learn / institutionalize
development integration
   ↓ acceptance / checkpoint
production cutover; legacy retained in place but disconnected
   ↓ acceptance / checkpoint
strict Turtle via private N3.js implementation
   ↓ learn / institutionalize
DL
   ↓ learn / institutionalize
KRSS2 / KRSS-family
   ↓ learn / institutionalize
N-Triples
   ↓ learn / institutionalize
N-Quads
   ↓ learn / institutionalize
TriG
   ↓ learn / institutionalize
JSON-LD
   ↓ final ingestion learning gate
shared OWL→RDF → physical legacy deletion → release
```

KRSS1 remains a distinct required compatibility identity with grammar-gap/fixture/future-architecture work, while its parser implementation is `DEFERRED` for v1. N3.js is the selected parser library for the four standard RDF syntaxes above; each has an independent strict descriptor and phase, while broader N3-language ingestion is independently `DEFERRED`.

The plan may reorder future not-yet-started phases only through the approved project-decision process and corresponding normative-document updates; reordering never removes the one-at-a-time ingestion WIP lock.

Concretely:

```text
                     ┌──────────────────────────┐
                     │        owlapi-js         │
                     │                          │
OWL/XML ─────────────►│                          │
Functional ──────────►│  OWL structural model   │◄─────────┐
Manchester ──────────►│  (canonical OWL IR)     │          │
DL / KRSS2 ──────────►│                          │          │
                     │          │               │          │
                     │          ▼               │          │
                     │   OwlToRdfTranslator     │   RdfToOwlTranslator
                     │          │               │          ▲
                     │          ▼               │          │
                     │  RDF/JS Dataset<Quad>    │◄─────────┤
                     │  (canonical RDF IR)      │          │
                     └──────────▲────────────────┘          │
                                │                           │
              RDF/XML / Turtle / TriG / N-Triples / N-Quads / JSON-LD
                                │
                 format-specific parser adapters
                 ├── rdfxml-streaming-parser
                 ├── N3.js
                 └── jsonld.js

                                      │
                                      ▼
                               OWLOntology
                                      │
                                      ▼
                                 VOWLBuilder
                                      │
                                      ▼
                                  VOWL-JSON
```

This architecture and delivery contract provides:

- W3C structural and RDF grounding;
- a canonical OWL structural model and lossless RDF/JS dataset boundary;
- explicit graph-policy semantics;
- deterministic parser detection/fallback and transactional parsing;
- standards-first conformance governance;
- precise machine-readable differential exceptions rather than tolerances;
- finite resource/security limits and measurable performance budgets;
- selected but replaceable standards-parser dependencies;
- Java OWLAPI behavioural compatibility without source transliteration;
- explicit provenance dispositions;
- modern native-JavaScript engineering without TypeScript tooling;
- cumulative sequential migration learning with deterministic handoff.

Most importantly, it makes `owlapi-js` a genuine **OWL abstraction**, not merely a relocated collection of format converters.
