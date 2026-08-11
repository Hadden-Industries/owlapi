# Phase 4 learning record: OWL/XML

> **Subsequent decision:** This historical record captures the handoff as it
> stood when the Phase 4 gate closed. [Accepted ADR 0002](../../../adr/0002-prioritize-rdf-ingestion-and-early-webvowl-cutover.md)
> later changed Phase 5 to canonical RDF ingestion and shared RDF-to-OWL reconstruction. The current
> sequence and handoff live in `implementation-plan.md`,
> `migration-status.md`, and `parser-migration-playbook.md`; the original record
> below is intentionally preserved.

## Migration identity

- Migration: Phase 4 - OWL/XML.
- Baseline revision:
  `a35503f091a886b8fe96f16eb7ba806ef79dd502`
  (`feat(owlapi-js): Add Manchester Syntax parser`).
- Completion revision: the Phase 4 checkpoint commit containing this record;
  the repository owner requested an uncommitted review pause before assigning
  its commit ID.
- Implementation date: 11 August 2026.
- Next migration: Phase 5 - DL Syntax.

## Implemented scope

Phase 4 adds a directly registered OWL/XML parser that constructs the Phase 1
structural model without an RDF/XML bridge, serialization round-trip, QName
synthesis, or VOWL-specific parser state. Its covered scope includes:

- immutable OWL/XML descriptor/format identity and bounded, namespace-aware
  tri-state detection before the Functional and Manchester descriptors;
- a complete immutable W3C production inventory covering six entity kinds, two
  object-property-expression forms, six data ranges, 18 class expressions, the
  annotation subject/value grammar, and 37 XML axiom elements that construct
  all 38 structural `AXIOM_KINDS` through the property-chain alternative;
- direct parsing of ontology identity/version, prefixes, imports, ontology and
  nested annotations, declarations, class/property/datatype/assertion and
  annotation axioms, anonymous ontologies, named and anonymous individuals,
  inverse properties, qualified and unqualified cardinalities, literals, data
  ranges, keys, property chains, and axiom annotations;
- element-scoped XML Base resolution for schema `xsd:anyURI` values while
  keeping literal lexical forms opaque and preserving non-ASCII IRI characters;
- independent XML namespace and OWL abbreviated-IRI prefix contexts, with the
  full W3C XML 1.0 `Name`/`NCName` and OWL `PN_PREFIX`/`PN_LOCAL` ranges;
- one `XmlParserAdapter` using native browser `DOMParser` and a lazily loaded
  `@xmldom/xmldom` Node fallback with normalized typed errors;
- a default-deny XML policy that rejects external subsets/entities, parameter
  entities and unsupported DTD markup, while allowing only bounded internal
  general entities under declaration, replacement, expansion-depth and
  expanded-byte limits;
- XML nesting, input, expression, annotation, blank-node, axiom, timeout and
  abort limits, cooperative yields during DOM walking, transaction-safe
  failure, and `loadAnnotationAxioms` behavior;
- a project-owned OWL/XML/Functional structural pair, a pinned Java OWLAPI
  snapshot, one exact machine-readable expected-difference rule, and repeated
  wall/heap evidence.

`@xmldom/xmldom` 0.9.10 moved from a development-only range to an exact governed
production pin because Node production parsing requires it. The package has no
runtime transitive dependencies, performs no network access, and remains behind
the adapter boundary. No resource-budget value, performance threshold, public
manager/model contract, capability classification, architecture, phase order,
or conformance classification changed.

## Assumptions entering the phase

1. The Phase 1-3 manager, descriptor, transaction, typed-error, structural
   factory, resource, diagnostic and cooperative-cancellation seams could be
   reused without another public API.
2. OWL/XML could map directly from a DOM to structural objects without an
   intermediate RDF graph, RDF/XML text or retained syntax tree.
3. A narrow adapter could normalize browser and Node DOM implementations while
   keeping environment-specific objects out of the public API.
4. A project-owned entity preprocessor could impose identical finite-resource
   and no-network behavior before either DOM implementation executes.
5. JavaScript's `URL` implementation could provide XML Base resolution while
   retaining the lexical IRI form required by OWL/XML and XML Base.
6. The pinned Java OWLAPI 5.5.1 structural output would match the W3C mapping
   for the shared fixture except for any exact governed difference discovered
   through the oracle.
7. The W3C XML Schema supplied a finite, mechanically enumerable grammar that
   could prevent silent semantic fall-through.
8. DOM construction and structural parsing could remain inside the accepted
   performance/resource policy without weakening shared budgets.

Assumptions 1-4, 7 and 8 held. Assumption 5 failed for non-ASCII relative IRIs:
`URL` serializes them with percent escapes, while XML Base requires escaping as
late as possible and permits processors to expose the unescaped characters. A
project-owned RFC 3986-style relative-reference resolver now preserves those
characters while handling authorities, paths, queries, fragments and dot
segments. Assumption 6 produced one narrow reference divergence: OWLAPI 5.5.1
omits an anonymous individual from an OWL/XML `ObjectOneOf`; the W3C grammar and
the Functional counterpart retain it.

## Acceptance evidence

The final focused run passed five OWL/XML/XML-adapter suites / 45 tests. The
governance suite passed 12 tests, and the complete repository run passed 70
suites / 609 tests. Repository Prettier, HTML validation, Stylelint, ESLint and
the production Vite build pass. The native-browser adapter contract and Node
fallback contract are green, and the production browser build contains no
bundled `@xmldom/xmldom` implementation.

### Standards conformance

- Governing specification: W3C OWL 2 XML Serialization Second Edition,
  Recommendation 11 December 2012.
- OWL/XML fixture:
  `util/owlapi-reference/fixtures/owlxml/phase4-structural.owx`.
- OWL/XML SHA-256:
  `9b1e106ec9e6151cf3fe9a16b8b749914a2e0ff3b6606623c4c9319389909c25`.
- Functional counterpart:
  `util/owlapi-reference/fixtures/owlxml/phase4-structural.ofn`.
- Functional SHA-256:
  `c6b4282cf7e88d7328d9e85e43fc7a2f8671183c1c8ce91ff184d9941cdfa4b8`.
- Structural result: ontology ID, imports, ontology/nested annotations, every
  axiom structural key and every direct signature category are equal; all 38
  axiom kinds occur.

The conformance suite pins the complete finite W3C XML-schema inventory and the
fixture hashes. Focused positive and negative tests cover every inventory
category, required attributes, arity/order, namespaces, absolute/abbreviated
IRIs, exact Unicode name grammars, XML Base scoping, literals, annotations,
anonymous individuals, malformed constructs, unsupported XML shapes,
transaction behavior and finite resource boundaries. Unknown elements and
attributes fail with typed, actionable diagnostics; no supported production
has a silent `null`, empty or catch-and-continue semantic path.

### Java differential

The pinned snapshot
`util/owlapi-reference/fixtures/owlxml/phase4-structural.java.json` was generated
through OWLAPI 5.5.1 at revision
`d7e997a53b470e32700de89cc610d9daf01ea769`. It contains 43 axioms, six
declarations, every one of the 38 axiom families, ontology identity/version, an
ignored-but-retained import declaration, nested ontology annotations, literals,
anonymous individuals and every signature category.

Ontology identity, imports, annotations, axiom-type counts, total axiom count
and signatures match. The OWL/XML and Functional JavaScript parses are fully
structurally equal. One Java-only semantic omission remains:

| Location                                                   | Java OWLAPI 5.5.1 | W3C / JavaScript |
| ---------------------------------------------------------- | ----------------: | ---------------: |
| `DisjointUnion` / `ObjectOneOf` anonymous-individual count |                 0 |                1 |

The W3C XML Schema defines `ObjectOneOf` as one or more `Individual` operands,
and `Individual` includes `AnonymousIndividual`. Narrow source inspection after
the black-box result localized the reference behavior to `OneOfEH` accepting
the named-individual handler but not `AnonEH`. No Java implementation text or
control flow was copied.

The differential test decomposes this result into the exact selector
`$['disjointUnion']['objectOneOf']['anonymousIndividualCount']`. It calculates
one `VALUE_CHANGED` difference and requires exactly one fixture-, parser-,
capability-, side-, value-, selector- and cardinality-scoped rule. Unmatched
actual differences, ambiguous matches and unsatisfied required rules are zero.

### Environment, security and resource evidence

The Node adapter test loads `@xmldom/xmldom` only when native `DOMParser` is
absent. The native-path contract verifies `application/xml` parsing without
touching the Node branch and normalizes browser `parsererror` documents to
`XmlParseError`. The production Vite build is green after the dependency move
and contains no xmldom package payload.

Security/resource tests cover bounded internal entities, entity replacement and
recursive expansion, external subsets/entities, parameter entities, malformed
or unsupported DTD markup, input bytes, expanded XML bytes, XML nesting,
expression depth, annotation depth, blank nodes, axioms, timeout,
abort-before-completion and failed-transaction rollback. Entity preprocessing
performs no retrieval. The DOM walk checks execution budgets and yields after
approximately 50 ms without changing parse order.

### Performance evidence

Environment: Windows `10.0.26200` x64, Node.js `v24.17.0`, Intel i9-12900K,
one warm-up plus five measured runs, median aggregation, garbage collection
requested before each run. The measured lockfile SHA-256 is
`dbf218f2d46d6f9d9aac0a5727afe5a1efe2fb4a349bd6719fd55106c781fa5a`.

| Fixture                     | Median wall ms | Median peak heap bytes | Median peak heap delta bytes |
| --------------------------- | -------------: | ---------------------: | ---------------------------: |
| 50,000 OWL/XML declarations |         682.45 |            227,897,104 |                  214,156,824 |
| 16 MiB mismatched input     |          26.58 |             30,339,032 |                       33,984 |

The reproducible runner is `util/benchmark-owlapi-owlxml.mjs`. Repeating every
accepted Functional and Manchester signal produced a maximum positive wall-time
change of +6.95% and a maximum peak-heap-delta change of +12.44%. The OWL/XML
mismatch result is +8.85% wall and +16.19% peak-heap delta against the accepted
registry-wide mismatch baseline. Every result remains below the unchanged 20%
threshold; complete measurements are in `performance/baseline.md`.

## Failed approaches and best-supported causes

1. `new URL(relative, base).href` percent-encoded non-ASCII IRI characters.
   That behavior is correct URL serialization but not the lexical result XML
   Base requires the parser to expose. The final resolver preserves Unicode and
   performs only reference resolution and dot-segment removal.
2. Delegating DOCTYPE/entity handling to each DOM implementation would produce
   environment-dependent behavior and could expose external-resource or entity
   expansion risks. The final policy validates, bounds, expands and removes the
   allowed internal subset before DOM construction.
3. Detecting only the raw root namespace missed a conforming document whose OWL
   namespace value came from a bounded internal general entity. Detection now
   invokes the same bounded preparation only for an Ontology root with an
   entity-bearing namespace candidate.
4. ASCII or JavaScript-identifier regexes rejected valid XML/OWL Unicode names
   and accepted invalid leading/trailing characters. The parser now implements
   the exact XML 1.0 `Name`/`NCName` and OWL schema `PN_PREFIX`/`PN_LOCAL`
   character ranges.
5. Treating `xmlns:*` bindings as OWL abbreviated-IRI declarations made
   semantics depend on serializer QNames and accepted nonconforming input. XML
   namespace context and OWL `<Prefix>` declarations are now independent.
6. A summary-only Java comparison hid the `ObjectOneOf` operand loss because
   axiom counts and signatures still matched. The final comparison extracts the
   affected structural cardinality and subjects it to the exact-difference
   gate.
7. A normal static Node DOM import would make a Node-only implementation visible
   to browser bundling. The adapter loads it only on the no-native-DOM branch;
   the native contract and production build protect the separation.
8. Repeated whole-suffix slicing while locating a DOCTYPE close bracket risked
   superlinear work on hostile XML. The final scanner advances once through the
   declaration while tracking quotes and subset depth.

## Material findings and dispositions

| ID       | Applicability                            | Primary disposition      | Summary                                                                                     |
| -------- | ---------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| `M4-001` | `XML`, `CROSS_CUTTING`                   | `PLAYBOOK_UPDATE`        | One adapter owns browser/Node DOM selection and error normalization.                        |
| `M4-002` | `XML`, `SECURITY`, `PERFORMANCE`         | `TEST_OR_FITNESS_UPDATE` | Entity policy executes before DOM construction with explicit finite limits.                 |
| `M4-003` | `XML`, `OWL_NATIVE`, `TESTING`           | `PLAYBOOK_UPDATE`        | XML Base resolution preserves non-ASCII IRI characters and opaque literals.                 |
| `M4-004` | `XML`, `OWL_NATIVE`, `SYNTAX_LOCAL`      | `TEST_OR_FITNESS_UPDATE` | XML namespaces and OWL abbreviated-IRI prefixes are distinct semantic contexts.             |
| `M4-005` | `XML`, `OWL_NATIVE`, `TESTING`           | `TEST_OR_FITNESS_UPDATE` | A finite immutable schema inventory makes grammar coverage and fall-through reviewable.     |
| `M4-006` | `PROVENANCE`, `TESTING`, `SYNTAX_LOCAL`  | `TEST_OR_FITNESS_UPDATE` | Java's anonymous `ObjectOneOf` omission requires one exact W3C-authoritative rule.          |
| `M4-007` | `TESTING`, `PROVENANCE`, `CROSS_CUTTING` | `PLAYBOOK_UPDATE`        | Cross-syntax equality and separately atomic Java fields expose narrow semantic differences. |
| `M4-008` | `OWL_NATIVE`, `CROSS_CUTTING`, `TESTING` | `TEST_OR_FITNESS_UPDATE` | OWL/XML terminates at all 38 structural axiom kinds without an RDF bridge.                  |
| `M4-009` | `XML`, `SECURITY`, `PERFORMANCE`         | `TEST_OR_FITNESS_UPDATE` | DOM traversal still needs nesting, deadline, abort and cooperative-yield checks.            |
| `M4-010` | `XML`, `PROVENANCE`, `CROSS_CUTTING`     | `TEST_OR_FITNESS_UPDATE` | The Node DOM package is a governed production dependency behind a browser-excluded seam.    |
| `M4-011` | `PERFORMANCE`, `CROSS_CUTTING`           | `NO_CHANGE`              | OWL/XML establishes a baseline without regressing accepted parser signals.                  |
| `M4-012` | `XML`, `TESTING`, `SYNTAX_LOCAL`         | `TEST_OR_FITNESS_UPDATE` | Exact Unicode XML and OWL name grammars prevent over- and under-acceptance.                 |

### `M4-001` - one environment boundary

Evidence: Node-fallback, native-DOM and native-parsererror adapter contracts.
Institutionalization: `XmlParserAdapter`, dependency boundary, provenance record
and current playbook. DOM implementation details do not enter the structural
model, manager or public error shape.

### `M4-002` - entity security precedes DOM parsing

Evidence: positive bounded-entity cases and negative external, parameter,
recursive, oversized and malformed-DTD cases. Institutionalization: one entity
policy module, unchanged governed limits and resource regressions. No network
resolver exists in either adapter path.

### `M4-003` - URL serialization is not XML Base lexical preservation

Evidence: a focused nested-base regression expects
`https://example.com/rosé/élément`, not percent-escaped path text.
Institutionalization: project-owned reference resolver, opaque-literal
regression and cross-cutting playbook rule for future XML phases.

### `M4-004`, `M4-005` and `M4-012` - schema grammar is executable evidence

Evidence: separate namespace/prefix tests, Unicode positive names, invalid
leading digit/underscore/trailing dot/local-name cases, immutable duplicate-free
production arrays and exact 37-element/38-kind assertions.
Institutionalization: parser validation, conformance suite, grammar inventory and
typed failure for every unknown shape.

### `M4-006` and `M4-007` - reference differences remain narrow

Evidence: OWL/XML and Functional structural keys are equal; Java differs at one
extracted anonymous-individual count. Institutionalization: one exact required
rule, source-audit provenance, zero-tolerance matching and playbook guidance to
separate cross-syntax truth from reference-implementation behavior.

### `M4-008` - OWL/XML is an OWL-native syntax

Evidence: the fixture and focused grammar cases construct every
`AXIOM_KINDS` member, preserve annotations/anonymous individuals and contain no
RDF or RDF/XML production path. Institutionalization: exhaustive tests and the
five-module provenance inventory. The later Phase 11 OWL-to-RDF translator stays
an independent downstream responsibility.

### `M4-009` - DOM allocation does not remove execution obligations

Evidence: deep nesting, timeout, abort and large-document tests plus the 50,000
declaration benchmark. Institutionalization: iterative tree validation,
approximately 50 ms cooperative yields and shared execution-budget checks.

### `M4-010` - Node production support needs an exact dependency boundary

Evidence: a production-only Node install needs the fallback, while the browser
path has native DOM support. Institutionalization: exact package/lock pin, sixth
dependency-governance record, adapter-only provenance, native-path contract and
browser production build. No transitive package or network capability was
introduced.

### `M4-011` - no accepted performance signal regressed

Primary disposition is `NO_CHANGE`: this is the first OWL/XML baseline, every
repeated Functional/Manchester wall and heap signal remains below the existing
threshold, and the measured mismatch remains bounded. No budget, threshold or
implementation follow-up is supported by the evidence.

## Compatibility findings

- The W3C OWL/XML schema is authoritative for syntax and operand categories;
  OWLAPI is a compatibility oracle and does not override its `Individual`
  production.
- Java OWLAPI 5.5.1 matches ontology identity, imports, annotations, counts and
  signatures but loses one anonymous `ObjectOneOf` operand. The exact rule
  documents Java behavior without weakening standards conformance.
- OWL/XML and Functional project fixtures are fully structurally equal,
  including anonymous-individual identity and all 38 axiom kinds.
- The project XML policy is intentionally stricter than a DOM implementation's
  possible DTD/network behavior and is shared across browser and Node paths.
- `@xmldom/xmldom` is an environment adapter only; it supplies no OWL semantic
  implementation.

## Unresolved questions and dependency impact

There are no unresolved questions that can alter Phase 5 behavior, no unfinished
`LOCAL_PHASE_FOLLOW_UP`, no blocking normative proposal, and no unapplied
playbook or executable-protection disposition. Phase 11 still owns independent
OWL-to-RDF graph-equivalence evidence; Phase 4 does not delete the legacy
converter or claim completion of that downstream translator, so this does not
block DL Syntax. The XML adapter/entity/base lessons materially constrain the
later RDF/XML phase but do not change the WIP-locked order.

Any future XML DOM dependency upgrade must rerun the adapter, security,
browser-exclusion and performance gates. That is an upgrade condition already
recorded in dependency governance, not an unresolved Phase 5 dependency.

## Mechanically reviewable completion summary

- Migration: Phase 4 OWL/XML.
- Lesson record: `docs/owlapi-js/migration/lessons/003-owlxml.md`.
- Finding IDs: `M4-001` through `M4-012`; every finding has exactly one primary
  disposition.
- Playbook changed: yes; XML adapter isolation, pre-DOM entity policy,
  element-scoped Unicode-preserving XML Base, namespace/prefix separation,
  immutable grammar inventories, cross-syntax/atomic differential comparison
  and the Phase 5 handoff are current guidance.
- Executable protections added: descriptor/parser regressions, complete grammar
  inventory, Node/native adapter contracts, entity/security/resource/abort
  tests, immutable cross-syntax fixtures, Java structural differential with one
  exact rule, governance checks and repeated wall/heap benchmarks.
- Normative-change proposals: none.
- Unresolved blockers: none.
- Next migration: Phase 5 DL Syntax, blocked until the repository owner creates
  the requested Phase 4 checkpoint commit and explicitly says to proceed.
