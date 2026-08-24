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
- Gate large-input mismatch detection under implementation-plan §20.6. Wall
  time always retains the 20% relative limit. Peak heap must meet that relative
  limit or remain below the fixed 64 KiB ceiling across 1 MiB, 4 MiB, and
  16 MiB inputs. The absolute branch is never available to valid parsing,
  translation, publication, or rendering workloads.
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
  import graph reaches no parser or RDF module. The separate repository gate
  proves that no physically retired legacy converter module is present.
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

## Phase 11 KRSS-family evidence

- Inventory the public `KRSSOWLParser`/KRSS1 and `KRSS2OWLParser`/KRSS2
  identities separately. Share only dialect-neutral lexing and classification;
  never infer parser availability from a shared token vocabulary.
- When a dialect is intentionally deferred at a checkpoint, give that state
  executable negative evidence: classify its narrower vocabulary, reject
  extension-only keywords, and prove no descriptor is registered. If the
  dialect is later promoted, retain the dialect negatives and replace the
  non-registration assertion with descriptor-isolation and routing tests.
- Probe whole-document ordering as well as individual productions. KRSS2's
  public entry point accepts `TBox* ABox*`; an ABox statement changes which
  statements are legal afterward.
- Treat reserved keywords as lexical constraints on entity names. Use absolute
  IRI spellings in shared oracle fixtures when a desired local name is reserved
  or when a reference parser's bare-name base is defective.
- A top-level production can expand atomically into several axioms. Route the
  complete result through the transaction's multi-axiom seam and verify rollback
  after a later failure.
- Compare the expressible subset across every implemented OWL-native and RDF
  syntax, then layer pinned Java counts/signatures over the exact project-owned
  structural comparison.
- On Windows, do not assume the `java` and `javac` shims share `java.home`.
  Long-classpath oracle tooling must select compiler and runtime entry points
  independently.

## Phase 12 N-Triples evidence

- Keep the public media type (`application/n-triples`) distinct from the
  dependency's exact implementation selector (`N-Triples`). A private adapter
  must configure both its stream parser and any injected lexer; configuring
  only the parser can silently re-enable Turtle directives.
- Classify the pinned W3C RDF 1.1 and RDF 1.2 N-Triples corpora independently.
  Phase 12 embeds 99 entries: 48 accepted documents and 51 required syntax
  failures.
- Normalize every accepted statement to the RDF/JS default graph at the private
  boundary. Ignore prefix events for this prefix-free syntax and reject
  N-Quads graph labels, including labels after RDF 1.2 triple-term objects,
  during bounded detection.
- Prefer the narrower N-Triples descriptor before Turtle when content matches
  both grammars, while preserving decisive Turtle-directive negatives. Exact
  content types still select their declared syntax before heuristic detection.
- Share only the syntax-independent RDF-dataset publication seam. Parser
  identity, lexer policy, diagnostics, document format, prefix policy, and
  graph policy remain syntax-specific.

## Phase 13 N-Quads evidence

- Bind `application/n-quads` to an independent exact N3.js `N-Quads` policy
  with line-mode lexing. Preserve graph terms at the private adapter boundary;
  N-Triples' forced default graph is a syntax-specific invariant.
- Apply graph policy only after canonical RDF/JS dataset publication and before
  RDF-to-OWL reconstruction. Exercise `requireSingleGraph`,
  `defaultGraphOnly`, `selectGraph`, and `mergeGraphs` over real parsed input,
  including explicit loss diagnostics, deduplication, and dataset-scoped
  blank-node identity.
- Publish the selected-graph and merged-dataset decisions as immutable document
  context. They describe ingestion, not OWL axioms.
- Prefer the narrower N-Quads descriptor when a bounded scan finds a decisive
  fourth-position graph term, including after an RDF 1.2 triple-term object.
  Do not duplicate the grammar or weaken N-Triples and Turtle validation.
- Classify the pinned W3C RDF 1.1 and RDF 1.2 N-Quads corpora independently.
  Phase 13 embeds 114 entries: 60 accepted documents and 54 required syntax
  failures. Generate positive quad-count and graph-kind expectations before the
  adapter runs so graph normalization cannot validate itself.
- Keep RDF 1.2 triple terms at the existing explicit unsupported OWL boundary
  when reconstruction cannot represent them.
- Repeat resource, cancellation, differential, integration, browser,
  performance, provenance, and learning gates for the independent syntax.

## Phase 14 TriG evidence

- Bind `application/trig` to an independent exact N3.js `TriG` policy. Preserve
  Turtle-compatible prefixes and base resolution as well as every RDF/JS graph
  term; neither Turtle nor N-Quads is a permissive substitute for TriG.
- Detect only decisive graph-block opening braces outside comments, quoted
  strings, and IRI references. Keep Turtle directives and line-oriented
  N-Quads decisive for their narrower descriptors, and leave complete grammar
  validation to the exact adapter.
- Retain the dataset-first ordering and exercise all four graph policies over
  parsed graph blocks. Dataset-scoped blank-node identity and immutable graph
  decision context have the same meaning in TriG as in N-Quads.
- Archive and classify the complete pinned W3C RDF 1.1 and RDF 1.2 TriG
  inventory before executing the adapter. Phase 14 embedded all 418 entries;
  after the N3.js 2.3.0 dependency qualification, 413 are `REQUIRED` and pass
  while five RDF 1.2 reifier/annotation evaluation cases are individually
  `EXCLUDED_WITH_REASON`. The other 12 former N3.js 2.2.0 exclusions are now
  required regression cases.
  Dependency gaps must remain enumerable and governed, never disappear from
  the inventory.
- Prove that broad Notation3 implication syntax remains unsupported even
  though the private dependency can parse a wider language.
- Repeat resource, cancellation, differential, integration, browser,
  performance, provenance, and learning gates for the independent syntax.

## Phase 15 JSON-LD evidence

- Bind JSON-LD to Digital Bazaar jsonld.js through one direct RDF/JS adapter;
  never serialize its result to N-Quads merely to reparse it.
- Pass an adapter-specific document-loader facade to jsonld.js on every call.
  `remoteJsonLdContexts: false` must reject before consulting the injected
  loader. Enabled loads retain URL/scheme/credential/SSRF validation, final
  redirect revalidation, byte/time/redirect limits, `AbortSignal`, and the
  caller's immutable configuration.
- Use `application/ld+json` as an authoritative identity. Otherwise require a
  characteristic JSON-LD keyword; `.json` remains a weak hint and a JSON object
  must not be claimed as a TriG graph block.
- Expose standards-defined processor controls through immutable
  `OWLDocumentFormat` parameters, not consumer-specific parser arguments.
  Phase 15 supports JSON-LD 1.0 and 1.1 processing modes, inline and restricted
  external expansion contexts, and both RDF-direction representations.
- Normalize dependency terms at the RDF/JS boundary and filter statements that
  the to-RDF algorithm says are not well-formed RDF. Keep general expansion and
  context processing delegated to jsonld.js. If a pinned dependency removes a
  standards version or representation, confine the exact compatibility delta
  to a named, independently tested module rather than growing a second general
  JSON-LD processor in project code.
- Treat JCS-canonical `rdf:JSON` as an output invariant. The W3C `useJCS` flag
  selects the expected conformance profile; it does not justify exposing
  non-canonical JSON literals as a separate ingestion mode.
- Preserve immutable top-level `@context` values as document metadata, then use
  the same explicit named-graph policy and RDF-to-OWL translator as every other
  RDF syntax.
- Archive and classify both pinned W3C JSON-LD API manifests. Phase 15 records
  all 467 to-RDF cases and all 54 from-RDF cases: 462 to-RDF cases are
  `REQUIRED` and pass, two generalized-RDF cases and three enumerated jsonld.js
  9.0.0 gaps are `EXCLUDED_WITH_REASON`, and all 54 reverse-direction cases are
  `NOT_APPLICABLE` to ingestion. A particular consumer's UI does not justify
  excluding a standards-defined processor profile from the reusable parser.
- Verify direct and imported ontology loads, all graph policies, structural
  equivalence, malformed/resource behavior, browser execution, and an isolated
  lazy production chunk. A promise-returning dependency is not evidence of
  cooperative streaming; record observed event-loop delay honestly.

## Completed migration: Phase 16 shared OWL-to-RDF translator

- Keep one public `translate(ontology, { graph })` seam over a per-call mapping
  session. The session owns generated blank nodes, stable source anonymous
  individuals, RDF lists, recursive expressions, annotations, and graph
  placement; concrete serializers remain a separate capability.
- Couple the translator mechanically to the canonical model taxonomy. The
  finite W3C Section 2 inventory, exhaustive expression/axiom fixtures, and
  constructor guards must all fail when a new structural kind lacks a mapping.
- Distinguish the three normative annotation patterns: `owl:Axiom` around a
  single main triple, one reification for each pairwise main triple, and direct
  annotations on native blank-node axioms.
- Test standards correctness first, then use Java OWLAPI as a secondary graph
  oracle. Normalize only the exact counted Java `rdf:type rdf:List` additions;
  W3C Table 1 does not emit those triples.
- Round-trip through the existing inverse translator. If a valid forward graph
  exposes an inverse-recognition gap, fix it at the shared RDF interpreter seam
  without manufacturing structural declarations or syntax-specific rules.
- Keep JSON-LD serialization and every other concrete RDF storer out of Phase 16. Phase 15's from-RDF register remains explicitly non-applicable.

## Completed Phase 17 method: original KRSS / KRSS1

- Treat shared syntax as dialect ambiguity, not positive identification. Give
  exact media types authority, `.krss2` an exact KRSS2 hint, and a generic
  `.krss` hint an explicit narrower-first KRSS1 preference. Store that
  preference as bounded detection evidence so it cannot depend on descriptor
  insertion order.
- Preserve completed sibling behavior before extracting a shared core. The
  KRSS2 grammar, diagnostics, registry, resource, integration, differential,
  and benchmark controls stayed green before and after the extraction.
- Separate declared grammar from black-box structural behavior. The pinned
  KRSS1 parser exposed unreachable integer cardinalities, discarded accepted
  ABox axioms, malformed bare-name bases, singleton Boolean objects outside the
  OWL 2 structural invariant, and a consumed/no-effect `:right-identity` clause.
  Record each observation and decision individually; never turn a Java defect
  into an undocumented JavaScript quirk.
- When a legacy production has no justified OWL structural mapping, consuming
  it without inventing semantics can be the correct compatibility choice.
  Conversely, when a production explicitly returns an OWL axiom and the
  whole-document loop merely drops it, retain the intended axiom and govern the
  correction.
- Keep project grammar probes, adjacent dialects, extended-dialect negatives,
  converted real ontologies, and first-party historical corpora as separate
  evidence classes. A verified zero qualifying corpus is a machine-readable
  result, not a reason to weaken grammar, oracle, integration, resource, or
  performance gates.
- Cross-format structural evidence can use the smallest subset every format
  expresses cleanly. Filter incidental declarations, then require exact axiom
  keys across KRSS1, KRSS2, Functional, Manchester, OWL/XML, RDF/XML, Turtle,
  and DL.
- Keep recognized-format failures fatal. Once the narrower KRSS1 candidate
  claims generic `.krss`, malformed content must not be retried under KRSS2.

## Completed repository gate: Phase 18 physical legacy deletion

- Establish the retirement inventory as an executable filesystem-absence test
  before deleting anything, and observe it fail for every intended path. Keep a
  separate production-reachability assertion so physical absence and runtime
  wiring cannot mask one another.
- Delete the retired cluster in place; do not move or temporarily rewire it.
  Remove legacy-only tests and commands, but retain replacement tests, pinned
  foreign-oracle fixtures, and semantic comparison utilities that remain valid
  independently of the deleted implementation.
- Treat a test helper import as a real retained-reference dependency even when
  production is clean. Replace obsolete helper behavior with the current public
  seam—in this case exact catalog mapping—before claiming the reference audit
  is closed.
- Preserve deleted-artifact provenance rather than deleting its history. Give
  the manifest an explicit lifecycle state, keep revision-bounded dispositions
  unchanged, prove exact deleted paths are absent, and exclude only explicit
  deleted records from the current-source inventory.
- Remove the dedicated test command and ignore rule together with the suite
  they served. Keep a runner-scope test that proves every active differential
  remains discoverable and dependency tests remain excluded.
- A deletion of already production-unreachable modules does not need a new
  parser-throughput baseline. It still requires the complete test/lint/build
  gates and the real production static/lazy-closure verifier.
- Keep deletion changes separate from Phase 19 extraction/publication work so
  a repository review can distinguish removal from release-surface expansion.

## Next repository gates: Phase 19 alpha, then Phase 20 stable

- Phase 18 is fixed by accepted checkpoint
  `b5902e98da94a1ed99da174acea906aa42f9a46b`. Build the package from those
  current `owlapi-js` modules; no retired WebVOWL parser, converter, exporter,
  or bridge path may be recreated as a packaging shim.
- Phase 19 performs the history-preserving move to
  `Hadden-Industries/owlapi`, creates the Public API Surface Registry, applies
  the two-zone source layout, verifies one retained tarball, and publishes the
  useful `0.1.0-alpha.0` under `next`. It adds no ontology semantics.
- Except for the bare aggregate, every public npm subpath must be an explicitly
  approved exact mapping of an existing `org.semanticweb.owlapi` package.
  Public bindings have one canonical definition in that Java-shaped namespace;
  private parsing, mapping, RDF/JS, loading, storage, and platform engines use
  cohesive non-mirrored `internal/` ownership.
- Phase 20 stabilizes that same capability family, publishes `1.0.1`, and proves
  WebVOWL consumes the exact public registry package. Post-1.0 feature work does
  not enter either release phase.
