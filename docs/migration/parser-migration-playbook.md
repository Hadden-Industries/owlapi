# Parser migration playbook

This file is the current method for the next migration. Rewrite obsolete advice;
do not append chronology here.

## Pre-flight

1. Confirm the prior ingestion learning gate is closed and only one ingestion migration is active.
2. Consult `provenance/provenance.json` before reading or changing legacy code.
3. Enumerate the public grammar and the OWLAPI parser/factory/format identity.
4. Map every required production to a structural `OWLDataFactory` constructor.
5. Write focused tests at the new abstraction boundary before correcting behavior.

## Implementation

- Parse OWL-native syntax directly into immutable structural OWL objects.
- Keep lazy pull tokenization and bounded lookahead; do not materialize a token
  array. Enforce UTF-8 token length while scanning, and check cancellation and
  the monotonic deadline after bounded units of lexical work.
- When a frame syntax requires global entity typing and declarations may follow
  uses, perform a bounded lazy pre-index pass instead of buffering an AST or
  guessing property categories. Both passes share cancellation, deadline, and
  token-length controls; count the governed document token budget only once.
- Keep detection within `maxSniffBytes`. Compatibility recovery is available
  only after a positive detector match; syntax hints do not authorize broad
  fallback.
- Put every XML syntax behind one `XmlParserAdapter`: browsers use native
  `DOMParser`, Node loads the governed DOM implementation lazily, and neither
  environment-specific nodes nor parser errors cross the adapter boundary.
- Apply the default-deny XML entity policy before DOM construction. Reject
  external subsets, external entities, parameter entities, and unsupported DTD
  markup; bound internal general-entity declarations, replacement length,
  expansion depth, and expanded bytes before parsing.
- For XML syntaxes, resolve each schema `xsd:anyURI` value against the
  element-scoped effective XML Base while preserving unescaped non-ASCII IRI
  characters. Literal lexical forms remain opaque and are never base-resolved.
- Keep XML namespace bindings and syntax-level abbreviated-IRI prefix
  declarations in separate contexts. Validate each name against its governing
  XML or syntax grammar rather than accepting a convenient JavaScript-identifier
  subset.
- Turn every finite normative XML-schema group into an immutable production
  inventory and a conformance assertion. Unknown elements, attributes, arities,
  or operand orders fail explicitly; no valid construct may fall through to a
  silent skip.
- Yield between top-level constructs after approximately 50 ms of work. Prefer
  `scheduler.yield()` where available and use a zero-delay timer fallback so
  browsers and Node can deliver aborts without changing parse order.
- Preserve operand category, arity, optionality, and ordered-vs-unordered semantics.
- Preserve IRIs, literals, language/datatype, annotations, and anonymous individuals end to end.
- Preserve anonymous-individual labels within one document scope and
  standardize them apart across source documents.
- Treat literal suffix adjacency and prefixed-name token boundaries as grammar,
  not whitespace-tolerant conveniences. Route plain and language-tagged
  literals through the shared data factory so every syntax inherits the same
  RDF 1.1 datatype model.
- Resolve lexically ambiguous literal/abbreviated-IRI tokens using their grammar
  context. In positions that admit both, recognize valid numeric literal forms
  before falling back to IRI expansion.
- If an archived fixture redundantly declares a predefined prefix, any
  compatibility recovery must require an exact standard binding. Strict mode
  still rejects the declaration; never accept a conflicting reserved binding.
- Use only canonical `kind` dispatch. Unknown supported-category kinds fail deterministically.
- Throw typed errors for unsupported constructs. Never use silent `null`, fallback values, or broad catch-and-continue.
- Parse into isolated transaction state; commit only after accepted success.

## Verification and handoff

1. Pin the exact upstream conformance artifact by immutable digest, classify
   every source test exactly once, and keep the runner's semantic scope explicit.
2. Run focused model/parser tests, structural snapshots, Java differential
   fixtures, resource/adversarial tests, the repeated wall/heap benchmark, and
   the complete WebVOWL suite.
3. Canonicalize Java differential output only for semantically irrelevant
   representation details such as unordered iteration, blank-node labels, or
   documented display-label spelling. Any semantic difference goes through the
   machine-readable expected-difference gate.
4. Compare equivalent project-owned documents across every implemented syntax
   that can express the fixture. Keep Java-reference differences as separately
   calculated atomic fields so whole-ontology parity cannot hide a narrow
   semantic omission.
5. When a Java renderer collapses a semantic object into one string, decompose
   that object into named structural fields before calculating atomic
   differences. Never normalize a known semantic difference out of the compared
   values merely to make whole-axiom strings equal.
6. Verify that signatures include entities occurring in ontology annotations,
   nested annotations, and axioms; do not infer signature completeness from
   axiom counts alone.
7. Use the Java oracle with its fully resolved runtime dependency classpath.
   Declare intentionally ignored fixture imports explicitly so their import
   declarations remain in the direct-ontology snapshot without network access.
8. For XML phases, run the adapter contract in Node and a browser-compatible
   environment, verify that the Node fallback dependency stays outside browser
   bundles, and exercise entity, nesting, timeout, abort, and malformed-input
   behavior independently.
9. Record every material finding with evidence and one primary disposition.
10. Turn reusable findings into tests/contracts where deterministic.
11. Update this playbook and all impacted future phase assumptions.
12. Close the mechanically reviewable learning gate before activating the next ingestion phase.

## Institutionalized RDF syntax-adapter method

- Keep `RdfToOwlTranslator` and the graph policy as the only RDF semantic
  reconstruction path. Every RDF syntax adapter terminates at canonical RDF/JS
  `DatasetCore<Quad>` values and contains no declaration, class-expression,
  axiom, annotation, list, or OWL compatibility rule.
- Wrap each selected standards parser behind one private adapter. Normalize
  terms, quads, configuration, streams/callbacks and errors before they cross
  the boundary; never stringify and reparse an intermediate graph.
- Prove syntax correctness before semantic reconstruction. Classify every
  independently owned upstream definition, archive or generate self-contained
  fixtures, compare evaluation results by RDF graph isomorphism, and require
  negative syntax to fail at the adapter seam.
- Keep concrete-syntax normalization syntax-local. For RDF/XML this includes
  XML Base, optional RDF node-element roots, the canonical lexical form of
  `rdf:parseType="Literal"`, and the specified Literal behavior of other
  non-reserved `rdf:parseType` values; it does not include OWL mapping or
  general graph repair. Compare namespace identity using XML-expanded values,
  and make source rewrites structurally aware so syntax-looking content inside
  an XML literal is never changed.
- Treat streaming as a delivery property, not a security policy. Retain owned
  input, token, quad, blank-node, nesting, entity, timeout and cancellation
  checks, deterministic malformed-input errors, Unicode-safe chunks,
  backpressure, cooperative yielding, and transaction rollback. Keep an
  independent wall-clock watchdog active while awaiting backpressure or stream
  completion; callback-only elapsed-time checks cannot bound a stalled
  dependency. Cap and re-arm delays that exceed the host timer's maximum, and
  apply token limits to nested RDF term components such as literal datatypes,
  languages, and directions as well as primary term values.
- Diagnose real-world failures at the deepest stable seam. Incorrect emitted
  quads, base handling or syntax errors belong to the adapter. Structural OWL
  failures belong to the shared translator. Compatible OWL Full recovery must
  be local, explicit and diagnostic rather than a global category mutation.
- Preserve strict and compatible corpus roles separately. Pin bytes and hashes;
  report warning counts for compatible inputs so “loads successfully” cannot
  conceal lossy or widened interpretation.
- Keep the two pinned W3C Rational malformed-list documents as an explicit
  source-defect exception only. Their compatible non-`rdf:nil` terminal warning
  does not authorize general list repair.
- Measure syntax-to-RDF and end-to-end costs separately. Also measure lazy
  browser chunks, first use, Node/browser parity and Node-only fallback leakage.
  Compare regressions with paired measurements on the same runtime and machine.

## Institutionalized application-integration method

- Keep the application builder free of concrete-syntax knowledge. It consumes
  structural OWL objects only, and a fitness test must prove its transitive
  import graph reaches no parser, RDF, or retained legacy converter module.
- Dispose of every construct explicitly. Map each canonical axiom kind in the
  dispatch table, and give kinds the application does not visualize a named
  ignore with a stated reason so silence never stands in for omission.
- Start the builder from a deliberately failing stub so the first failure comes
  from the missing feature rather than from a typo, then add one mapping rule
  per red step.
- Prefer a rich pinned oracle fixture over a minimal one. A minimal fixture
  matches on the first attempt and hides defects that a rich one turns into
  failing tests instead of expected-difference entries.
- Never share one canonicalizer between a foreign-oracle comparison and a
  comparison of two implementations of the same format. Normalization that is
  correct against a foreign dialect silently weakens the same-format gate.
- Declare oracle dialect differences; do not delete them inside a comparison
  helper. Name the normalization, apply it only to that oracle's comparison,
  and pin its exact contents by test so it cannot be widened quietly.
- Confirm a differential gate can accept its own governed exceptions. Assert the
  expected difference count derived from the manifest's scoped rules, never a
  hard-coded empty result.
- Prove a hole is closed by breaking the production behaviour on purpose and
  watching the intended test fail; a gate that stays green under that mutation
  was not protecting anything.
- Treat a development-only seam as unproven until both builds are produced and
  the production bundle is inspected for its markers.
- Verify recorded Git revisions resolve on the current branch. A format-only
  check on a revision string cannot detect an identifier orphaned by a rebase,
  and equivalence after a rewrite is proved by blob hash, not commit subject.
- Remeasure pre-existing signals on the current runtime before claiming any
  regression comparison, and record a failing threshold as an open regression
  rather than re-baselining it.

## Next migration: Phase 8 production WebVOWL cutover

- Rewrite the existing WebVOWL production entry path in place to use
  `owlapi-js` to `OWLOntology` to `VOWLBuilder`. Do not move, rename or delete
  any legacy file.
- Remove the temporary development-only routing so two production
  implementations cannot coexist. There is no runtime legacy fallback.
- Prove by static architecture test and production bundle/import-graph
  inspection that the entry graph cannot reach the legacy parsers, the RDF/XML
  serializer/bridge, `ontologyConverter.js` or `jsonExporter.js`.
- Advertise only Functional Syntax, Manchester Syntax, OWL/XML and RDF/XML from
  the new path. Any other legacy-only syntax, including one discovered in an
  import closure, must fail with the canonical unsupported-format diagnostics.
- Resolve finding `M7-008` before accepting cutover performance evidence. The
  production path becomes exactly the signal that is currently 85.75% above its
  accepted baseline, so that regression must be diagnosed rather than inherited.
- Close production smoke, differential, import, unsupported-format and
  reachability acceptance; then pause for the Phase 8 Git checkpoint before
  Turtle begins.
