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

## Next migration: Phase 5 canonical RDF ingestion and shared RDF-to-OWL reconstruction

- Treat Phase 5 as a major ingestion migration even though it introduces no
  concrete RDF syntax parser. Keep the WIP lock closed until its Definition of
  Done, learning gate, Git checkpoint, and explicit proceed instruction are
  complete.
- Build a finite handler/production inventory from the W3C OWL 2 Mapping to RDF
  Graphs in the RDF-to-structural direction. Cross-check externally observable
  Java OWLAPI behavior with constructed fixtures; do not translate
  `OWLRDFConsumer` source structure or algorithms into production code.
- Enter tests through canonical RDF/JS `DatasetCore<Quad>` values constructed
  with the project environment. Do not activate RDF/XML, Turtle, N-Triples,
  N-Quads, TriG, JSON-LD, a generalized RDF dispatcher, or any legacy parser to
  manufacture the Phase 5 test boundary.
- Complete and test dataset graph selection before reconstruction. Preserve
  blank-node identity at dataset scope and verify `requireSingleGraph`,
  `defaultGraphOnly`, `selectGraph`, and `merge`, including diagnostics for
  graph loss and deterministic ambiguity/errors.
- Implement one shared translator through `OWLDataFactory` and ontology
  transactions. Cover ontology IDs/imports/annotations, declarations, class and
  data expressions, object/data/annotation properties, assertions, negative
  assertions, property characteristics/chains, keys, disjointness, n-ary
  structures, RDF lists, axiom annotation reification, and the governed policy
  for unsupported or unconsumed OWL-significant triples.
- Preserve the existing cancellation, monotonic deadline, isolated transaction,
  diagnostics, source/document IRI, blank-node, maximum-quad, maximum-list,
  maximum-depth, and maximum-axiom contracts. Add focused cycle, malformed-list,
  duplicate/conflicting structural pattern, abort, timeout, and rollback tests.
- Keep every syntax-specific term, stream, error, prefix callback, XML concern,
  and parser configuration outside the translator. Phase 6 may expose shared
  reconstruction gaps, but it may not patch them privately in the RDF/XML
  adapter.
- Classify the independently owned W3C RDF-to-OWL mapping scope, pin Java
  structural snapshots, compare project-owned equivalent ontologies across the
  already implemented structural syntaxes, run resource/wall/heap measurements,
  record provenance, run full repository verification, and close the formal
  Phase 5 learning gate. Shared budgets, public contracts, capability
  classifications, and phase assumptions change only through the approved
  governance process.
