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
9. Run every verification command whole, and read its whole output. A shell
   pipeline reports its **last** command's exit status, so `npm run lint | tail`
   exits zero on a failing lint run and truncates away the diagnostic that would
   have said so. `AGENTS.md` forbids pipelines, chaining and command
   substitution for the host environment's sake; finding `M8-009` is why the
   same rule is load-bearing for correctness. Anything that discards an exit
   code or truncates output can turn a red gate green without anyone making a
   false statement.
10. Treat a reference output as a function of two pinned things, an input and an
    oracle version. When a difference is implausibly small - one character, one
    field - check that both sides converted the same bytes before reasoning
    about behaviour. Two reference outputs that disagree with each other about
    one statement are proof the inputs differed, not the engines; finding
    `M8-010` is the worked case.
11. Record every material finding with evidence and one primary disposition.
12. Turn reusable findings into tests/contracts where deterministic.
13. Update this playbook and all impacted future phase assumptions.
14. Close the mechanically reviewable learning gate before activating the next ingestion phase.

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
- Never infer production laziness from a source-level dynamic import or an
  isolated adapter build. Build with the real application configuration, follow
  the complete static import closure from its production entry, prove the
  dependency implementation is absent there, then follow the format's dynamic
  import and prove the implementation is present in that lazy closure. Vendor
  grouping must remain entry-aware so it cannot hoist lazy dependencies.
- For a multi-format dependency, make the shared implementation private and
  require each public adapter to pass its exact media type. Register, classify,
  detect, advertise, and benchmark one format at a time; overlap in accepted
  bytes never advertises a later format or the dependency's permissive default.
- Prefer a self-contained browser distribution when a package's Node entry
  reaches Node stream globals. Keep that choice behind the lazy adapter loader,
  prove `process` and `Buffer` are unnecessary in a browser contract, and run
  the complete conformance suite through the same distribution used in the
  application build.
- Reconstruct every third-party RDF/JS term with the project factory rather than
  trusting nominal RDF/JS compatibility. Normalize language tags and base
  directions to lowercase at that boundary, recurse through RDF 1.2 triple
  terms, and reject any unknown term kind before it reaches OWL reconstruction.
- Preserve concrete-syntax prefixes as immutable document context rather than
  turning them into ontology semantics. A failed parse transaction publishes no
  prefix context.
- Benchmark Unicode-safe chunk sizes instead of selecting one by convention.
  Keep the largest chunk whose measured scheduling interval remains below the
  cooperative-yield budget; prove `scheduler.yield()` is preferred and retain
  the zero-delay fallback.

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
- Serialize benchmark runs against all other work. Never launch one in the
  background while tests, builds, or large file scans continue; contention
  inflates wall time by a factor that looks exactly like a real regression.
  `util/benchmarkEnvironment.mjs` enforces this and aborts a benchmark started
  on a busy machine; see ADR 0003.
- Treat a tight run-to-run spread as evidence of sustained conditions, not of
  clean conditions. Before recording any threshold breach as a finding,
  cross-check it independently: repeat one isolated run, confirm the cost
  scales as expected across input sizes, and verify that related signals remain
  arithmetically consistent with each other.

## Institutionalized cutover method

- Before rewriting an entry point in place, enumerate every consumer, not only
  the production ones. Tests that import it are silently retargeted by the
  rewrite, and a comparison against a retained oracle becomes a tautology that
  passes forever.
- Give the oracle its own entry first. Extract the old composition verbatim,
  repoint its consumers, and prove the extraction faithful by watching the
  characterization suite stay green across the move.
- Migrate a seam's acceptance tests onto its replacement before deleting the
  seam, so no gate lapses between the two states.
- Build reachability gates that follow every module system the application
  actually uses. A gate that follows only `import` in a codebase with CommonJS
  callers traverses almost nothing and passes vacuously.
- Exclude whole-line comments from a reachability scan, and only whole-line
  comments: namespace IRIs inside string literals contain `//` and are corrupted
  by a naive strip.
- Verify a gate by breaking production on purpose. A gate that has never been
  observed failing is an assumption.
- Treat a full suite that stays green across a total implementation replacement
  as a coverage report, not as reassurance. Find out which tests should have
  failed and did not.
- State what a differential's dimensions can and cannot see, and re-read that
  statement whenever the specification allows one entity to be drawn more than
  once. A comparator keyed on IRI silently compares one arbitrary pair when
  VOWL 2's splitting rules turn one IRI into many nodes. Collect every match,
  compare pairwise against unused candidates, and treat per-IRI scalars as sets.
- Accept that a green differential means its dimensions agree, not that the
  outputs agree, and do not let the register's authority outrun that. A defect
  orthogonal to every dimension - nine discarded domain axioms and four class
  nodes no edge touched - produces no signal at all and is found only by reading
  the document.
- Justify differences **per dimension**, never per document, and fail the gate
  when a justification outlives the difference it justified. One entry covering
  a whole document lets an unanalysed difference pass as governed because a
  different difference in the same document was explained; a stale entry leaves
  a false record in the acceptance ledger.
- Before interpreting a production differential, prove both sides used the
  same import closure. A missing exact catalog mapping or a historically fetched
  version makes every downstream entity difference incomparable; exclude that
  fixture with evidence until the reference fixture is regenerated against the
  pinned local closure.
- Do not reuse a domain/range fallback to represent a generalized class axiom.
  If a subclass expression has no VOWL node, it has no drawable source endpoint;
  substituting `owl:Thing` fabricates an axiom the ontology never stated.

### Lessons added by Phase 10

- For a non-standardized compatibility syntax, distinguish the grammar
  inventory from the productions reachable through the reference parser's
  whole-document dispatcher. Use the reachable subset for a Java snapshot and
  focused project tests for every inventoried production; do not copy a
  reference dispatch defect merely to make a differential green.
- Escalate from public documents and black-box probes to implementation-source
  inspection only when they cannot answer a concrete grammar question. Record
  the exact file, revision, unresolved question, limited scope, finding, and
  no-copy disposition before the result becomes implementation evidence.
- Apply longest-token matching before keyword/operator aliases. TeX and Unicode
  operator spellings can also be valid identifier prefixes, and fragmenting
  them changes entity identity rather than merely producing a syntax error.
- Give a headerless syntax one isolated, deterministic document namespace.
  Use the supplied document IRI when present; otherwise allocate a per-load
  namespace so unrelated anonymous documents cannot collapse their entities.
- Normalize ordinary transport whitespace at the project boundary when the
  pinned parser's rejection is an implementation accident. Keep that correction
  explicit in the oracle harness and test both strict and compatible modes.
- Cross-format RDF fixtures may need explicit property declarations solely to
  disambiguate RDF-to-OWL reconstruction. Compare every non-declaration axiom
  and the complete signature, then assert the exact declaration-only remainder
  instead of weakening the structural comparison globally.
- Renderer-shaped rules may map a general class axiom to a concise property
  axiom only when the complete shape matches. Preserve an unmatched subclass
  axiom; never copy a reference path that silently returns no axiom.

## Next migration: Phase 11 KRSS family

- Inventory the public `KRSSOWLParser`/KRSS1 and `KRSS2OWLParser`/KRSS2
  identities separately before designing shared machinery. KRSS2 is
  `REQUIRED_V1`; KRSS1 remains an explicit `DEFERRED` identity with grammar-gap,
  fixture, and negative-dialect evidence rather than an accidental alias.
- Establish the published KRSS-family grammar first, map every required KRSS2
  production directly to immutable structural OWL objects, and use the pinned
  Java implementations only as black-box compatibility oracles unless a narrow
  unresolved question passes the governed source-inspection escalation.
- Reuse the mature textual-parser contracts and the Phase 10 controls for
  headerless namespaces, longest-token matching, reachable-oracle subsets,
  strict/compatible boundaries, resources, diagnostics, scheduling, and
  transactional rollback.
- Add project-owned KRSS1 and KRSS2 classifications, dialect negatives,
  cross-format structural fixtures, pinned Java snapshots, imports, complete
  WebVOWL conversion, unsupported-format/reachability gates, performance,
  provenance, and the learning record before pausing for the Phase 11 Git
  checkpoint.
