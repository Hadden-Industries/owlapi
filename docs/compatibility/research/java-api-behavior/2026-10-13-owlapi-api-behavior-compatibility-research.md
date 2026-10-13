# Java and JavaScript OWLAPI behavioral compatibility research

Repository edition of the preserved Drive report.
Local links point to the tracked portable evidence; [storage and normalization provenance](README.md) records the original hashes and the limits of this derived snapshot.

**Date:** 13 October 2026, Europe/Bucharest.\
**Mode:** Semantic Diff.\
**Scope:** Selected public APIs already matched by the Java API surface registry, their private execution paths, and their parser/runtime dependencies.\
**Verdict:** ❌ Semantically Divergent.

JavaScript OWLAPI currently changes which supported inputs succeed, how configuration takes effect, when callbacks execute, what a result means, and which state remains after an error.
Several differences occur on small inputs.
Documentation and a matching class name do not make these calls behaviorally compatible for a Java application migrating to JavaScript.

The most consequential pattern is that a JavaScript factory or manager can accept an object that another public operation subsequently rejects through a private, fixed budget.
A 65-level annotation chain can be added but cannot be removed through the JavaScript manager.
A 1,048,577-character string literal is accepted structurally, but causes an unverified profile report and failures when saving Turtle and RDF/XML.
Matched Java calls succeeded in the retained runtime used for this research, and their source paths contain no corresponding library-level limits.

The required compatibility direction is to use the matched Java public configuration method and its semantics wherever one exists, and not substitute a new JavaScript numerical default.
This requires distinguishing OWLAPI controls, Java runtime/dependency controls, application policy, and implementation accidents.
Java is not universally unlimited: the observed JDK 25 SAX parser imposes XML depth 100 and entity-size limits in addition to OWLAPI's configured expansion count.

This is research for a later implementation plan.
It contains evidence, compatibility requirements, dependencies and unresolved decisions; it does not authorize or perform implementation, configuration changes, workflow changes, commits or publication.

## Baselines and evidence interpretation

| Item                         | Inspected identity                                                       |
| ---------------------------- | ------------------------------------------------------------------------ |
| JavaScript repository        | `C:\Users\maksy\GitHub\owlapi`, branch `main`                            |
| JavaScript commit            | `20426357165a22248985ec43d7ac1266d49d6bec`                               |
| Package version              | `@hadden-industries/owlapi` `0.1.0-rc.2`                                 |
| JavaScript lock SHA256       | `067269937c0c72375cf968e44d4bb0ec4d2e258dc5704c402cad1ea1d5941340`       |
| Registry SHA256              | `5afc3d4e3d9cf7383d0e45f6983f956110020b6e0fef27377e745a8e34b7ddb5`       |
| Java repository              | `C:\Users\maksy\GitHub\owlcs\owlapi`, branch `version5`                  |
| Matched Java source commit   | `b61ebe2da83daceebb3e7ba7afbd2582c9240c33`                               |
| Java source tree             | `b8dad5241dae6ff3bd3b755b9a1c605623eeb2c2`                               |
| Java source version          | OWLAPI `5.5.1`; `owlapi-parent-5.5.1-9-gb61ebe2da` in the JavaScript pin |
| JavaScript runtime exercised | Node.js `v24.21.0`, Windows                                              |
| Java runtime exercised       | Temurin OpenJDK `25.0.4.1+1-LTS`, Windows                                |

The JavaScript checkout had an existing untracked `docs/plans/2026-10-12-dependency-cruiser-architecture-hardening-plan.md`.
It was preserved.
Java was clean.
Rechecks during research found the same commits and status.
Neither repository nor its inspected parent directories contained applicable `AGENTS.md`; the requested report directory had no applicable destination instructions.
No tracked source files were changed.

The registry maps 77 JavaScript bindings in 11 namespaces against 1,013 Java types: 46 public mapped types, 76 structural types, seven format identities, two internal types, 838 deferred types and 44 types unsupported by design.
These counts describe scope, not behavioral coverage.
Omitted visitors, reasoners, Java streams as named types, listener infrastructure and unrelated overloads were not audited as though implemented.
Where an omitted method controls an already implemented responsibility, such as `setEntityExpansionLimit`, its absence is directly relevant.
[Registry][JS-registry] [Pin][JS-pin]

Evidence labels in this report mean:

- **Observed:** the bounded probe ran in this research and its result is retained in the companion evidence JSON.
- **Source traced:** the cited implementations establish the path, without a fresh boundary execution for that specific case.
- **Environment dependent:** behavior depends on the selected parser, JVM, JavaScript engine, dependency, transport or process settings.
- **Unresolved:** a precisely identified decision or verification gap remains; no universal equivalence claim is made.

The six probes used source-file Java launching and small JavaScript programs outside both repositories.
The largest test literal was approximately 1 MiB.
No full test suite, Maven rebuild, remote CI or hosted deployment ran.
Java emitted deprecation warnings in two probes and SLF4J no-provider notices; these are exploratory observations, not a clean native qualification receipt.

The existing `distribution/target/owlapi-runtime-classpath.txt` resolves OWLAPI modules from the local Maven repository.
`OWLManager` and `OWLOntologyLoaderConfiguration` reported those JARs as their actual code sources.
The API, implementation and apibinding JAR hashes and the complete classpath inventory are in the evidence JSON.
**A matching checkout and version label do not prove those retained JARs were rebuilt from the pinned source commit.**
The paired observations corroborate the inspected source; future release evidence must bind the executed artifacts to their source recipe.
This research does not claim that binding was newly qualified.

## What compatibility must preserve

For a shared supported operation and input, compare the configuration method, effective default, value domain, units, counting rules, disabling semantics, algorithm stage, result or exception category, callback timing, and observable state changes.
Byte-for-byte rendering differences are outside this report except where a writer's implementation rejects an input or changes target state.

A JavaScript adaptation is required for Java primitive types, checked exceptions and Java object/stream protocols.
That does not inherently require changing error timing, laziness, mutation outcomes or configuration meanings.
JavaScript supports iterators, generators, synchronous computation and explicit typed result objects.
Promises for browser-friendly work and immutable configuration values are design choices that still need an explicit compatibility contract.

Existing adaptation decisions are historical evidence.
The registry explicitly records boolean mutation results, atomic batches, asynchronous profiles and preserving writer builders.
The writer document records earlier acceptance of differences from Java.
The current requirement for API-level behavioral parity means these decisions must be reconciled; their existence is not a reason to keep a divergent default unnoticed.
[Registry][JS-registry] [Earlier writer decisions][JS-writer-history]

**Controlling scope:** Under the owner's current instruction, the pinned, matched Java behavior is the target, including awkward observable implementation quirks.
Documentation alone, an earlier approval or a preferred JavaScript design does not authorize preserving a divergent default or contract.
A different Java target or an exception would require a separate, explicit owner change of scope.
Until then, every mandatory outcome below assumes parity.
Questions about which Java runtime/provider supplies an effective limit remain evidence and environment-mapping decisions, not permission to invent a replacement default.

## Public operations and actual execution paths

| Public operation                                                                                | JavaScript path and hidden gate                                                                                                                                                 | Matched Java authority                                                                  | Observable consequence                                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadOntologyFromOntologyDocument`                                                              | Manager input-byte check → parser selection over an 8,192-byte prefix → selected adapter/parser → parse transaction → import staging → RDF closure reconstruction → publication | `OWLOntologyManagerImpl.loadOntology`, `OWLOntologyFactoryImpl.loadOWLOntology`         | Admission, parser fallback and publication differ. [JS][JS-manager-load] [Java][J-factory]                                                                    |
| Functional, Manchester, DL and KRSS loading                                                     | Per-parser lexer token counts/lengths and computation deadline; parser expression/annotation/blank-node checks; shared axiom transaction                                        | Native Java parser implementations under `parsers/`                                     | No same named OWLAPI-wide token/input/computation budget exists on Java loader configuration. [JS lexer][JS-functional-lexer] [Java configuration][J-loader]  |
| OWL/XML loading                                                                                 | Entity preprocessing → environment DOM parser → tree/OWL validation → transaction                                                                                               | `OWLXMLParser` → `SAXParsers.initParserWithOWLAPIStandards`                             | JS entity policy and post-DOM depth guards differ from SAX expansion and runtime limits. [JS][JS-owlxml-parser] [Java][J-owlxml-parser]                       |
| Turtle, TriG, N-Triples and N-Quads loading                                                     | N3 syntax adapter → RDF dataset validation/graph policy → translator                                                                                                            | Java native/Rio parser selected by format and registry                                  | Token and emitted-quad counts, graph policy and strictness affect acceptance. [JS adapter][JS-n3] [Java Rio][J-rio]                                           |
| RDF/XML loading                                                                                 | XML entity preparation and nesting scan → streaming parser → RDF translator                                                                                                     | Native `RDFParser` or Rio RDF/XML                                                       | Native and Rio Java routes do not have identical configuration plumbing. [JS][JS-rdfxml] [Java SAX route][J-rdf-parser]                                       |
| JSON-LD loading                                                                                 | `JSON.parse` → jsonld.js expansion/toRDF → materialized RDF dataset → translator                                                                                                | Rio JSON-LD and its processor dependencies                                              | Context policy, dependency cap and timing are distinct from the common loader settings. [JS][JS-jsonld] [Java][J-rio]                                         |
| `OWL2DL/EL/QL/RLProfile.checkOntology`                                                          | Shared budget → captured closure model traversal → profile rules → optional source assessment → report                                                                          | `OWLProfile.checkOntologyClosureInProfiles` → profile walker and visitor                | JS resource exhaustion yields an unverified report; `isInProfile()` becomes false with zero violations. [JS][JS-profile-check] [Java][J-profile]              |
| `AddAxiom`, `RemoveAxiom`, `AddImport`, `RemoveImport`, `RemoveOntologyAnnotation` constructors | `ontologyChangeRecord` → structural graph validator, depth 512 and annotation depth 64                                                                                          | Corresponding Java change constructors                                                  | Private admission limits; direct JS `addAxiom` has a different path. [JS][JS-change-record] [Java AddAxiom][J-addaxiom]                                       |
| `OWLObjectDuplicator`, `OWLEntityRenamer` and transform helpers                                 | `objectTransform` → same full graph validator before reconstruction/callbacks                                                                                                   | Java utility visitors and change construction                                           | Caller cannot raise or disable these private defaults. [JS][JS-transform] [Java][J-duplicator]                                                                |
| `applyChange(s)`, add/remove batch                                                              | Materialize → all-participant validation/drafts → commit final states                                                                                                           | `applyChangesAndGetDetails` → sequential enactment, failure flag/rollback and listeners | Result meaning and partial-state behavior differ. [JS][JS-mutations] [Java][J-mutations]                                                                      |
| Manchester object renderer                                                                      | Full transform-kind validation → recursive renderer → 32 MiB rendered-string guard                                                                                              | `ManchesterOWLSyntaxOWLObjectRendererImpl`                                              | An ignored or small rendered subpart can still be rejected by full-object validation. [JS][JS-manchester-render] [Java][J-manchester-render]                  |
| `saveOntology` Functional                                                                       | Capture snapshot → recursive Functional renderer → complete target replacement                                                                                                  | Functional storer/renderer through `AbstractOWLStorer`                                  | No matching explicit JS 32 MiB budget was found here; runtime recursion/string limits still apply. [JS][JS-functional-render] [Java storage base][J-storage]  |
| `saveOntology` Turtle                                                                           | Default loader configuration → structural validation → bounded RDF mapping → N3 writer → reparse → OWL reconstruction → isomorphism → replacement                               | `TurtleStorer` and renderer                                                             | Save inherits otherwise hidden loader defaults, including token length and time. [JS][JS-turtle-store] [Java][J-turtle-store]                                 |
| `saveOntology` RDF/XML                                                                          | RDF map → bounded graph writer → default configuration reparse → OWL reconstruction → isomorphism → replacement                                                                 | `RDFXMLStorer` and renderer                                                             | Graph/output/QName-work bounds plus loader and isomorphism gates; initial mapper is not given Turtle's quad cap. [JS][JS-rdfxml-store] [Java][J-rdfxml-store] |
| `saveOntology` OWL/XML                                                                          | Structural/XML validation → DOM construction/output bytes → node and annotation depth → replacement                                                                             | `OWLXMLStorer` and renderer                                                             | Fixed private bounds, no public save override. [JS][JS-owlxml-store] [Java][J-owlxml-store]                                                                   |
| Locality constructor, `extract`, `axiomBase`                                                    | Eager input capture without numerical default caps; async extraction with optional budget; eager filter on full base                                                            | `LocalityModuleExtractor`                                                               | Default absence of caps agrees; callback evaluation and result protocol do not. [JS][JS-locality] [Java][J-locality]                                          |
| `EntitySearcher` selected queries                                                               | Eager ontology iterable capture and eager arrays                                                                                                                                | Stream-returning static Java queries                                                    | User iterator effects and errors happen earlier in JS. [JS][JS-search] [Java][J-search]                                                                       |

## Loader budgets and counting semantics

All numerical constructor fields below require a nonnegative safe JavaScript integer, at most `9,007,199,254,740,991`.
`null`, `Infinity`, negative numbers and fractions are rejected.
There is no unbounded sentinel.
Zero is an actual zero limit where consumed, not Java's connection-timeout sentinel.
Values can be replaced with `configuration.with({...})`; Java getter/setter methods are absent.
The scope of enforcement is narrower than the presence of a field suggests.
[Defaults and validation][JS-loader]

| Setting                      | JS default | Unit and actual scope                                                                                                                            | Java comparison                                                                                             |
| ---------------------------- | ---------: | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `maxInputBytes`              | 33,554,432 | UTF-8 encoding of the source string; every manager-loaded document, with additional checks in N3/RDFXML adapters                                 | No equivalent public Java loader byte-limit option found                                                    |
| `maxAxioms`                  |  1,000,000 | Distinct axioms in an individual parse/reconstruction transaction; duplicates already present are skipped; not an aggregate closure cap          | No matched public Java axiom-limit setting                                                                  |
| `maxTokenCount`              |  5,000,000 | Lexer tokens in Functional/Manchester/DL/KRSS and N3 paths; not a universal XML/JSON token budget                                                | No matched public Java token-count setting                                                                  |
| `maxTokenLength`             |  1,048,576 | UTF-8 lexer token/lexical fragment and, in RDF adapters, RDF term/component checks; exact lexeme accounting varies by syntax                     | No matched public Java token-byte setting                                                                   |
| `maxQuads`                   |  5,000,000 | N3/RDFXML emitted-quad counts before dataset deduplication; translator also checks materialized dataset size; Turtle mapping can bound emissions | No matched public Java global quad setting                                                                  |
| `maxBlankNodes`              |  1,000,000 | Distinct blank-node/anonymous identities per parser or RDF dataset stage, not one closure-wide identity pool                                     | No matched public Java blank-node count setting                                                             |
| `maxRdfListLength`           |  1,000,000 | RDF collection traversal items; tested before adding the next item                                                                               | No matched public Java list-length setting                                                                  |
| `maxExpressionDepth`         |        512 | Parser/translator expression levels; the same field is reused by Turtle's graph validator with different counting                                | No matched public Java universal semantic-depth setting                                                     |
| `maxAnnotationDepth`         |         64 | Nested annotations in relevant parsers/reconstruction                                                                                            | No matched public Java annotation-depth setting                                                             |
| `maxXmlNestingDepth`         |        512 | RDFXML scan depth and OWLXML DOM tree validation; OWLXML has already constructed the DOM                                                         | JAXP `maxElementDepth` is runtime-owned and independently configurable; not this OWLAPI field               |
| `maxImportCount`             |        256 | New unresolved import attempts in a load session after reuse by ontology/document IRI; root excluded; failed diagnostic attempts can consume it  | No equivalent Java count option; ignored imports/reuse have their own rules                                 |
| `maxImportDepth`             |         32 | Root is depth 0; new child checked as parent depth plus one; reuse can bypass the new-load check                                                 | No equivalent Java import-depth option                                                                      |
| `timeoutMs`                  |     30,000 | Computation and selected context-load clocks described below                                                                                     | Not equivalent to Java `setConnectionTimeout(int)`                                                          |
| `maxSniffBytes`              |      8,192 | UTF-8 prefix used for detection, not a limit on full parsing                                                                                     | No matched Java byte-limited detector contract; may cause a syntax/fallback error, not `ResourceLimitError` |
| `maxEntityDeclarations`      |        256 | Count of internal general entity declarations, even before document use                                                                          | Not Java expansion count                                                                                    |
| `maxEntityReplacementLength` |     65,536 | UTF-8 bytes of raw and resolved replacement text                                                                                                 | Not Java expansion count; not identical to JAXP general-entity-size units/semantics                         |
| `maxEntityExpansionDepth`    |         16 | JS declaration dependency expansion depth                                                                                                        | Not Java expansion count                                                                                    |
| `maxExpandedXmlBytes`        | 33,554,432 | Bytes admitted while constructing the expanded XML text                                                                                          | Not Java expansion count or JAXP aggregate entity size                                                      |
| `maxRemoteDocumentBytes`     | 33,554,432 | Package checks returned JSON-LD context text; manager imports receive configuration but package does not check this field separately             | No equivalent generic Java byte-limit API found                                                             |
| `maxRedirects`               |          0 | JSON-LD compares final URL with requested URL and counts either 0 or 1; it cannot count a hidden chain inside an injected loader                 | Java `setFollowRedirects(boolean)` controls a different transport behavior                                  |
| `maxRetries`                 |          0 | Defined and validated, but no package-side retry consumer found; passed to an injected loader in configuration                                   | Java `setRetriesToAttempt(int)` actually controls a helper loop                                             |

Enforcement sources: [manager][JS-manager-load], [N3 adapter][JS-n3], [RDF/XML adapter][JS-rdfxml], [translator dataset/structural limits][JS-translator-limits], [XML entity policy][JS-entity], [JSON-LD loader][JS-jsonld].
The independent `resource-budgets.json` is incomplete: it omits profile and private storage/transform budgets, lists a sniff-limit failure mode that is not the actual behavior, and cannot establish transport enforcement for `maxRetries`.
[Budget document][JS-budget-doc]

The 1 MiB token field is not enforced uniformly.
OWL/XML parsing and JSON-LD expansion have no `maxTokenLength`/`maxTokenCount` checks in the inspected implementations; they can still hit other admission, syntax, dependency or runtime constraints.
N3 and RDF/XML term checks apply at different stages.
Removing one common field without tracing those consumers would leave format-dependent behavior.

### Time and cancellation scope

- Functional uses one lexer deadline for that parse.
  Manchester and DL create a parse execution budget shared with their lexers; KRSS creates a corresponding per-parse budget.
  Imports receive new parser instances.
  Candidate fallback can create a new parser/deadline.
- N3 and RDFXML syntax adapters have their own execution controllers and timers.
  RDF-to-OWL translation starts a separate controller, so a syntax phase and a reconstruction phase are not one 30-second overall operation.
- A prepared RDF document retains its spent translation time across repeated role discovery and reconstruction.
  It pauses while other documents are being acquired/parsed, then resumes.
  It is incorrect both to call this an overall import-closure timeout and to say every reconstruction pass gets a fresh budget.
  [Translator controller][JS-translator-clock]
- JSON-LD gives each remote context load its own `timeoutMs` timer.
  `JSON.parse`, local expansion and `toRDF` are not wrapped in that timer.
  RDF dataset/reconstruction checks occur afterwards.
  Rejecting a wrapper promise does not cancel injected work that ignores the supplied signal.
- Manager import retrieval simply awaits `documentLoader.load` with the configuration and signal.
  It does not impose its own retry loop, redirect accounting or connection deadline.
  A loader that never settles and ignores cancellation can keep that operation pending.
- Checks are cooperative.
  Synchronous XML parsing, entity preparation or dependency computation cannot be interrupted merely because a timer became due.
  N3/RDFXML clamp long timer intervals and reschedule; JSON-LD's context timer forwards the configured number directly to `setTimeout`.
- Loading accepts an AbortSignal-like object structurally; profile and locality options require the native AbortSignal brand.
  Load paths can rethrow the caller's abort reason; profile/locality generate `DOMException` with `AbortError`.
  These are JS-specific contracts, not evidence of Java cancellation parity.

## Bounds outside loader configuration

| Area                         | Default or fixed bound                                                         | Units, ability to disable and result                                                                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile work                 | `maxWork = 1,000,000`                                                          | Internal checkpoint/edge/node/rule work, not axiom count. Safe integer only; no `null`/Infinity disable. Shared across closure and optional source pass                                                                                                                                           |
| Profile depth                | `maxDepth = 256`, accepted maximum 512                                         | Structural traversal includes arrays and object fields; also used by XSD-pattern validation. Cannot configure a higher value                                                                                                                                                                      |
| Profile literal              | `maxLiteralLength = 1,048,576`                                                 | JavaScript UTF-16 string length of a visited literal; not UTF-8 bytes; no disable sentinel                                                                                                                                                                                                        |
| Profile arithmetic           | `maxNumericDigits = 4,096`, accepted maximum 65,536                            | Facet numeric arithmetic checks raw lexical string length, including punctuation/signs; not a cap on every integer literal                                                                                                                                                                        |
| Profile elapsed time         | `timeoutMs = null`                                                             | Null disables only elapsed deadline. Explicit nonnegative safe integer permits a deadline; zero remains a deadline                                                                                                                                                                                |
| Shared structural validation | depth 512; annotation depth 64                                                 | Arrays and structural field edges count towards depth. Private defaults; no public override on changes/duplicator/renamer/Manchester renderer. Annotation overflow is mislabeled `expressionDepth`, limit 512                                                                                     |
| Manchester rendering         | 33,554,432 bytes                                                               | Checks each rendered string's UTF-8 size, with a string-length precheck. No caller override                                                                                                                                                                                                       |
| Turtle saving                | 33,554,432 bytes plus default loader budgets                                   | Structural validation before mapping; 1,000,000 direct axioms; mapping 5,000,000 quads; parser/reconstruction budgets later. No save-level override                                                                                                                                               |
| RDF/XML graph writer         | 33,554,432 bytes/work units; nesting 128                                       | Term/output/construction byte gates; QName work counts UTF-16 candidate characters, not output bytes. Conservative construction and indentation checks can reject a smaller final text. It can flatten owned chains/lists at the nesting boundary, so graph depth over 128 does not imply failure |
| OWL/XML saving               | 33,554,432 bytes; node depth 512; annotation depth 64                          | DOM-construction values and final output are checked separately; no public override                                                                                                                                                                                                               |
| RDF lossless-save comparator | 1,000,000 search states                                                        | Both Turtle and RDFXML call `compareOntologies` with its private default. Requires positive safe integer internally; default/null handling is not unlimited. Throws `OntologyStructuralComparisonLimitError` with code `ONTOLOGY_STRUCTURAL_COMPARISON_LIMIT_EXCEEDED`, then a storage error      |
| Locality optional limits     | `maxWork`, `maxAxioms`, `maxDepth`, `maxAnnotationDepth`, `timeoutMs` all null | All disabled by default. Optional values are nonnegative safe integers; one extraction budget spans preparation and every STAR pass. Constructor work precedes these options and is synchronous                                                                                                   |
| jsonld.js dependency         | `MAX_CONTEXT_URLS = 10`                                                        | Private context-resolution chain/cycle-set gate, not a global cap on arbitrary independent contexts. Its `>` check admits 11 loader calls on the tested chain before the next resolution fails. Not a loader-configuration field                                                                  |
| Runtime implementation       | engine stack, maximum strings/arrays, available memory                         | Not a supported library numerical API. Functional's recursive renderer and parts of mapping/dependency work remain subject to these constraints                                                                                                                                                   |

Sources: [profile budget][JS-profile-budget], [profile traversal][JS-profile-check], [facets][JS-facets], [pattern parser][JS-pattern], [structural validator][JS-structure], [Manchester][JS-manchester-render], [Turtle][JS-turtle-store], [RDFXML graph writer][JS-rdfxml-writer], [OWLXML][JS-owlxml-store], [isomorphism][JS-isomorphism], [locality budget][JS-locality-budget].
The dependency source and digest are retained in the evidence JSON.

Not every numeric constant is an admission limit.
The 65,536-character stream chunk size, 50 ms cooperative yield thresholds, timer representability, Java's 2,048-entry cache default, and datatype value-space boundaries have other responsibilities.
Cardinality deserves separate treatment: Java factory methods accept nonnegative `int`; JS additionally accepts larger safe integers and arbitrarily long unsigned decimal strings.
That is an input-domain extension with possible downstream interaction, not evidence that Java accepts unbounded cardinalities.
[JS cardinality][JS-cardinality] [Java factory][J-datafactory]

## Java configuration and runtime authority

### Existing Java public configuration methods

| Java method pair                                                                    | Default and semantics in the pinned source                                                                                                                                                                               | JS implication                                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getConnectionTimeout` / `setConnectionTimeout(int)`                                | 20,000 milliseconds; copy on change, return same object if unchanged; setter stores negative ints too, but `URLConnection.setConnectTimeout` rejects negatives at use. Zero means no connection timeout in URLConnection | Do not rename `timeoutMs` to this: it currently bounds computation. Reuse this API and its units/stage/domain where transport is implemented                                |
| `getRetriesToAttempt` / `setRetriesToAttempt(int)`                                  | 5; setter stores arbitrary ints; helper's loop bound counts attempts. Zero/negative means no input-stream attempt; repeated timeouts stop at the hardcoded fifth failure                                                 | `maxRetries = 0` is neither the default nor the effective Java semantics, and JS does not consume it itself                                                                 |
| `isFollowRedirects` / `setFollowRedirects(boolean)`                                 | true; controls OWLAPI's explicit cross-protocol redirect handling with cycle detection. The code does not call `setInstanceFollowRedirects(false)` when false                                                            | Do not infer that false forbids every same-protocol redirect handled by HttpURLConnection. Preserve actual backend behavior or define an explicitly chosen adapted contract |
| `getEntityExpansionLimit` / `setEntityExpansionLimit(String)`                       | `"100000000"`; passed to native SAX property setup. Setter stores strings; parsing/invalid-value behavior belongs to the selected SAX provider. Zero was accepted by the observed parser and disables this count limit   | The four JS entity fields count different things. They cannot be aliases for this Java API                                                                                  |
| `isStrict` / `setStrict(boolean)`                                                   | false by default                                                                                                                                                                                                         | JS defaults to `parsingMode: "strict"`; `compatible` is not proven to be an exact inverse implementation of Java strictness                                                 |
| `isLoadAnnotationAxioms` / `setLoadAnnotationAxioms(boolean)`                       | true; stored loader configuration also affects later manager annotation-axiom changes                                                                                                                                    | Setting only parse-time behavior in JS loses a Java post-load effect                                                                                                        |
| `getMissingImportHandlingStrategy` / setter                                         | `THROW_EXCEPTION`; silent mode catches ontology-creation failures from imports and notifies listeners                                                                                                                    | JS `"diagnostic"` only absorbs its defined missing-import cases; parse failures and generic loader failures can still abort                                                 |
| `addIgnoredImport`, `removeIgnoredImport`, `clearIgnoredImports`, `isIgnoredImport` | Copy-based configured set plus built-in default ignored namespaces                                                                                                                                                       | Reusing locally managed documents is not a substitute for this policy                                                                                                       |
| Loader configuration property defaults                                              | Per-instance override → process system property → classpath `owlapi.properties` → enum default                                                                                                                           | Default resolution is dynamic for system properties. JS snapshots a fixed object without this authority hierarchy                                                           |
| `OWLDocumentFormat.setParameter` / `getParameter`                                   | Java format parameter bag; Rio copies supported `RioSetting` values into its parser configuration                                                                                                                        | An existing Java seam for dependency controls. JS exposes immutable JSON-compatible parameters, primarily string-keyed selected settings                                    |

Source anchors: [Java configuration][J-loader], [ConfigurationOptions][J-options], [transport][J-transport], [SAX][J-sax], [Rio parameters][J-rio], [format][J-format].
URLConnection's [official timeout contract](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/net/URLConnection.html#setConnectTimeout(int)>) confirms the connection-only stage, zero sentinel and negative rejection at that API boundary.

The exact system/config-file prefix is `org.semanticweb.owlapi.model.parameters.ConfigurationOptions.` followed by the enum name. For example, `CONNECTION_TIMEOUT` is resolved through that name. A probe changed the process property after a configuration object existed: the getter changed to 123; an explicit instance setting returned 456. The probe removed its temporary process property before continuing. It made no user/global configuration change.

The retry helper has additional subtleties.
`DocumentSources.getInputStream` performs HTTP connection/response handling before `connectWithFiveRetries`; the helper only catches `SocketTimeoutException` arising inside its own input-stream attempt.
Each caught timeout increments the counter and increases the connection timeout.
Other IO errors escape.
A configuration of six still stopped on the fifth synthetic timeout.
These implementation details matter to a strict pinned-behavior contract; exposing a method with the right name and a conventional retry implementation would still differ.

### Native SAX and observed JDK 25 properties

OWLAPI's native SAX factory disables validation, external DTD loading, external general entities and external parameter entities, logging unsupported-feature cases.
It attempts the Oracle entity-expansion property and then a legacy fallback.
OWL/XML and native RDF/XML use this route.
Rio RDF/XML builds its own RDF4J parser, sets selected XML behavior, and honors supported format parameters; `getEntityExpansionLimit()` is not wired through the same native helper on that path. [SAX][J-sax] [OWL/XML][J-owlxml-parser] [RDF/XML][J-rdf-parser] [Rio][J-rio]

The probe read these values from the actual SAX parser after OWLAPI setup:

| Property suffix               | Observed value |
| ----------------------------- | -------------: |
| `entityExpansionLimit`        |    100,000,000 |
| `maxElementDepth`             |            100 |
| `totalEntitySizeLimit`        |        100,000 |
| `maxGeneralEntitySizeLimit`   |        100,000 |
| `maxParameterEntitySizeLimit` |         15,000 |
| `entityReplacementLimit`      |        100,000 |
| `maxXMLNameLimit`             |          1,000 |
| `elementAttributeLimit`       |            200 |

These observations belong to `com.sun.org.apache.xerces.internal.jaxp.SAXParserImpl` on the recorded JDK, not to every OWLAPI deployment.
JAXP supports processor/factory properties, system properties and configuration files; processing-limit values at or below zero disable that particular limit. Provider and JDK version matter. OWLAPI's explicit expansion property can override a lower runtime default while other runtime properties remain effective. The [JDK 25 JAXP guide](https://docs.oracle.com/en/java/javase/25/security/java-api-xml-processing-jaxp-security-guide.html) documents these independent controls and their precedence.

A 110-level OWL/XML complement chain succeeded in JS and failed in Java's OWL/XML load.
This is an environment-dependent admission difference, not grounds to invent a universal JS depth of 100.
The implementation-plan input must select the Java environment(s) whose behavior is required and preserve the relevant existing configuration seams.

## Findings

The L-codes classify the mechanism in the selected Semantic Diff workflow.
Most differences are **L6 callee-contract mismatches** against the stated migration contract.
An intentionally enforced capacity is not mislabeled as an off-by-one bug.
Historical intentional policy, implementation errors and unresolved dependency behavior are identified separately.

### F01 L6 Private resource ceilings break closure of the public object API

**Premises:** Factory-created immutable OWL objects and the matched Java operations are in scope.
Java direct addition constructs `AddAxiom`; JS direct addition and JS change-record construction use different admission paths.

**Trace:** JS factory builds 65 nested annotations → direct manager `addAxiom` stages the axiom without the shared depth validator → addition succeeds.
`new AddAxiom`, `removeAxiom`, duplicator and Manchester rendering invoke `validateStructuralGraph` → annotation depth exceeds 64 → `ResourceLimitError`.
Java performs the corresponding operations successfully.
[JS validator][JS-structure] [JS direct add/change paths][JS-mutations] [Java mutations][J-mutations]

**Divergence:** L6: an accepted ontology cannot be manipulated through other supported APIs on the same input.
The reported resource is also misleading: `expressionDepth`, limit 512, although the failing condition is annotation depth 64.
This is observed, not a theoretical huge-document case.

**Trigger:** Start with an annotation with no annotations; wrap it in another annotation 64 times; attach the resulting annotation to a declaration axiom; add it directly, then remove it.
Probe IDs begin `annotation65-`.

**Remedy:** The compatibility outcome must permit the matched operations for the same supported structural value without an extra JS default ceiling.
Fixing only loader configuration cannot meet it: shared private validation and every direct/record path must be reconciled together.
If any optional limit remains, report the actual violated resource and make its application explicitly selectable.

### F02 L6 Profile resource exhaustion changes the meaning of isInProfile

**Premises:** The shared operation is profile checking of the completed ontology closure.
Java's `isInProfile()` is `violations.isEmpty()`; JS returns `status === "valid"` and introduces unverified outcomes.

**Trace:** A declared annotation property and class plus an annotation assertion with 1,048,577 `x` characters enter JS model traversal → UTF-16 length guard throws → checker catches it as `RESOURCE_LIMIT_EXCEEDED` → report has no violations but `status: "unverified"`, `isInProfile(): false`.
Java returned true with zero violations.
[JS check/report][JS-profile-check] [JS report][JS-profile-report] [Java report][J-profile-report]

**Divergence:** L6: identical simple valid content changes a widely used boolean predicate because of a JS budget rather than a profile violation.
Default time is already unlimited, but default work/depth/literal/arithmetic limits remain.
An existing known violation wins `invalid` over `unverified`; aborts propagate instead of becoming a report.

**Trigger:** `literal1048577-profile`.
The independent `profile-empty-work-zero` probe shows explicit exhaustion produces the same unverified mechanism even with an empty ontology.

**Remedy:** Default profile admission and the public verdict must match the selected Java profile contract.
Optional incomplete/source assessment can remain separately identifiable, but must not silently redefine the matched call.
Numerical limits cannot be replaced with larger guessed numbers.
Preserve cooperative execution separately from an admission ceiling.

Incomplete closure adds `IMPORT_CLOSURE_INCOMPLETE`; a mutation during assessment adds `ONTOLOGY_CHANGED_DURING_CHECK`.
Source evidence stale/unverified flags normally belong to the opt-in source assessment; they do not all invalidate the formal report.
The formal and optional source pass share one budget, and stale mutation detected in the source pass can invalidate the formal result.
These distinctions need explicit regression cases.
[JS checker][JS-profile-check]

### F03 L6 Save calls inherit private parse and search limits

**Premises:** Save uses an already constructed ontology, an explicit supported format and a StringDocumentTarget.
The Java API has no corresponding public 1 MiB token limit on that save call.

**Trace:** JS saves a 1,048,577-character annotation literal → Functional and OWLXML succeed → Turtle/RDFXML generate an intermediate document, create a fresh default loader configuration and reparse → `maxTokenLength` rejects the generated text/term → public storage error, target unchanged.
Java saved all four formats.
The same reparse/reconstruction path also imports default XML, quad, list, expression, annotation and time gates; the final comparator adds a separate million-search-state gate.
[Storage configuration and verification][JS-rdf-storage] [Turtle][JS-turtle-store] [RDFXML][JS-rdfxml-store] [Comparator][JS-isomorphism]

**Divergence:** L6: storage of an admitted object fails for private validation capacity.
Raising the configuration used to load the ontology cannot affect save's independently created defaults.
Such exhaustion is not proof that the ontology is unrepresentable.

**Trigger:** `literal1048577-save-turtle` and `literal1048577-save-rdfxml`; both retained targets remained empty.
The larger hardcoded byte/search-state boundaries are source traced, not executed at exhaustion.

**Remedy:** The later design must resolve whether lossless reparse verification belongs in the matched production save contract and how any retained verification avoids introducing a JS-only admission ceiling.
Turtle's early bounds, RDFXML writer bounds, default reconstruction and private isomorphism must be considered as one path.
Preserve correct causal errors; do not relabel resource exhaustion as `ONTOLOGY_NOT_REPRESENTABLE`.

### F04 L6 Loader configuration exposes different APIs and responsibilities

**Premises:** A Java caller already knows `setConnectionTimeout`, `setRetriesToAttempt`, `setFollowRedirects` and `setEntityExpansionLimit`.
Current JS class exports a differently shaped object with `with(...)`.

**Trace:** Construct JS configuration → Java method lookups are undefined → fields default to `timeoutMs=30000`, `maxRetries=0`, `maxRedirects=0` and separate entity limits.
Manager sends some of these to an injected loader; only the JSON-LD context path implements its own byte/final-URL checks. Java getters resolve the documented override hierarchy and feed concrete URLConnection/SAX behavior.
[JS][JS-loader] [Java][J-loader] [Transport][J-transport]

**Divergence:** L6: methods, defaults, disable values, scope and enforcement are all different.
A field's declaration is not a transport guarantee.
A Java connection timeout cannot be represented by a global parse time limit, and expansion count cannot be represented by replacement bytes.

**Trigger:** `loader-java-methods`, `loader-defaults`, timeout null/Infinity probes, system-property probes and the synthetic retry matrix.

**Remedy:** Use the existing Java public API for corresponding responsibilities, retaining its actual semantics and selected backend effects.
Choose and record a JS equivalent for process-level default resolution where needed.
Keep optional application computation policy distinct.
Resolve Java implementation quirks explicitly rather than silently substituting conventional semantics with the same method name.

### F05 L6 Default input policies reject documents accepted by Java

**Premises:** Inputs use implemented Turtle, TriG and OWL/XML formats. These are policy/admission differences, not missing parsers.

**Trace:** (1) An undeclared RDF predicate with a literal object is accepted as an annotation by Java's default loader; JS strict reconstruction rejects an unconsumed statement, while JS `compatible` succeeds.
(2) Two named TriG graphs with one class declaration each produce a Java ontology with two axioms; JS default graph policy throws.
(3) An unused external general entity declaration is ignored by the Java SAX route with external entity resolution disabled; JS entity preprocessing rejects the declaration itself.
[JS graph policy][JS-graphs] [JS entity policy][JS-entity] [Java Rio consumer][J-rio-consumer] [Java SAX][J-sax]

**Divergence:** L6: default acceptance differs on small inputs.
The XML case does not require permitting network retrieval: ignoring an unused declaration and retrieving its resource are different behaviors.
Rio's handler forwards subject/predicate/object to OWL reconstruction without graph context, explaining the observed merge behavior.

**Trigger:** `turtle-undeclared-annotation-default`, `trig-two-named-graphs`, `xml-unused-external-entity` in the evidence report.

**Remedy:** Reconcile strictness using Java `setStrict` semantics; reconcile dataset handling with the matched Java entry point; and distinguish XML non-resolution from whole-document rejection.
A blanket switch to `compatible` or `merge` requires additional differential evidence and is not established as an exact fix by these three probes.

### F06 L6 Bounded detection and terminal errors prevent Java style fallback

**Premises:** An unhinted Functional Syntax document may start with legal whitespace.
Java tries its selected parser set and records ordinary parse failures before trying another candidate.

**Trace:** JS bounds the detector input to 8,192 bytes → 9,000 leading spaces hide the syntax signature → JSON-LD is eligible on the whitespace-only prefix → JSON parse throws `OWLSyntaxError` → manager only falls back for `ParserMismatchError`, so the operation ends.
Supplying Functional format succeeds.
Java accepted the unhinted input.
[JS registry][JS-parser-registry] [JSON-LD detector][JS-jsonld-descriptor] [JS fallback][JS-manager-parse] [Java fallback][J-factory]

**Divergence:** L6: a scanning optimization becomes an input-acceptance rule and exposes a JSON error for valid Functional Syntax.
The budget document's advertised `ResourceLimitError` does not describe this path.

**Trigger:** `' '.repeat(9000) + 'Ontology(<urn:research:sniff>)'`, no format or media hint.
Both explicit-format controls succeeded.

**Remedy:** Preserve selection/fallback semantics on inconclusive bounded detection.
A finite detector prefix must not exclude a valid parser or convert a candidate syntax failure into an unrelated terminal error.
Match the Java distinction between ordinary parser failure, unreadable source, import failure and unexpected runtime exception.

### F07 L4 and L6 Mutation outcome and failure state are incompatible

**Premises:** `applyChanges` is already mapped.
Java exposes `ChangeApplied`/`ChangeDetails`; JS returns whether final state differs and commits an entire batch atomically.

**Trace:** Add an absent axiom then remove it in the same call → both end empty → Java returns `SUCCESSFULLY` because changes were enacted; JS returns false because the net state is unchanged.
Add an axiom then rename to another ontology's conflicting ID → Java throws at the rename after the first axiom was applied; JS fails preflight and publishes no changes.
[JS mutations][JS-mutations] [Java mutation/rename][J-mutations]

**Divergence:** L6 for result meaning; L4 for state remaining after an exception.
Java does perform rollback when a change returns `UNSUCCESSFULLY`, and handles veto separately.
It does not promise the JS all-validation-before-publication behavior for every thrown exception.

**Trigger:** `batch-netzero` and `batch-collision`; post-collision axiom counts were JS 0, Java 1.

**Remedy:** The matched result protocol and failure-state contract must be selected explicitly.
Returning a boolean and documenting atomicity cannot claim Java parity.
If retaining an atomic extension is desirable, separate its contract from the matched method or change the declared target with owner agreement.
Also qualify listener/reentrancy behavior before later exposing Java change listeners.

Java load similarly registers ontologies during parsing and may retain already loaded imports after a later root failure, whereas JS stages new closure publication.
That closure failure-state distinction is source traced; no multi-document failure probe was run here.
[Java factory][J-factory] [Java load/import lifecycle][J-load-imports] [JS load][JS-manager-load]

### F08 L6 Annotation loading configuration has a post-load effect in Java

**Premises:** The ontology was loaded with annotations disabled and remains managed.
A subsequent annotation-assertion addition uses the ordinary public manager API.

**Trace:** Java stores the loader configuration by ontology ID → `isChangeApplicable` rejects an annotation-axiom addition when `isLoadAnnotationAxioms()` is false → result `UNSUCCESSFULLY`, count 0.
JS direct manager addition does not retain/use that loader policy → true, count 1.
[Java applicability][J-mutations] [Java configuration retention][J-load-imports] [JS addition][JS-mutations]

**Divergence:** L6: the same apparent setting changes only parsing in one implementation and later mutation in the other.
This remains observable even after numerical budgets are removed.

**Trigger:** Load `Ontology(<urn:research:filtered>)` with annotations disabled, then add one annotation assertion.
Probe `annotation-disabled-later-add`.

**Remedy:** Preserve the selected Java configuration lifetime and its effect on subsequent changes under the current parity requirement.
Include ontology-ID changes and batch rollback in follow-up evidence because Java indexes retained configuration by ID.
Any proposed exception requires the separate owner change of scope described above.

### F09 L4 Writer builders preserve different state and admit different values

**Premises:** The common writer methods are already exposed.
Both configurations are copy-oriented, but Java's `copy()` omits `indentSize` and `bannersEnabled`; JS copies all fields.

**Trace:** `withIndentSize(2).withBannersEnabled(false).withIndenting(false)` → Java ends with indent 4 and banners true; JS ends with indent 2 and banners false.
Java no-op `withIndentSize(4)` returns the same instance; JS returns a new one.
Java accepts -1 in configuration; JS throws `RangeError`.
[Java writer][J-writer] [JS writer][JS-writer]

**Divergence:** L4: builder call order changes observable settings differently.
Negative acceptance and identity also differ.
These were previously deliberate JS adaptations, not newly discovered implementation accidents; the present parity requirement supersedes assuming their acceptability.

**Trigger:** `writer-chain`, `writer-noop-identity`, `writer-negative-indent`.

**Remedy:** Match the pinned builder state, identity and value-acceptance behavior under the current requirement.
A repaired upstream target or retained divergence would require a separate explicit owner change of scope; neither is authorized by the earlier preserving-builder decision.
Do not introduce a new numeric cap to accommodate the Java negative-int behavior; distinguish configuration acceptance from later rendering failure.

### F10 L4 StringDocumentTarget has different reuse and failure semantics

**Premises:** Both APIs expose StringDocumentTarget and explicit-format saving.
Java owns a persistent StringWriter; JS replaces private text after the whole render succeeds.

**Trace:** Save the same empty ontology twice to one target → Java's length doubles (330 to 660 in the probe), JS remains the same complete string (34 characters).
On JS resource failure, replacement never occurs.
Java's AbstractOWLStorer writes through the target's writer and has no equivalent complete-text transaction.
[JS registry][JS-storer-registry] [Java target][J-target] [Java storage][J-storage]

**Divergence:** L4: overwrite versus append is target state behavior, independently of serializer formatting.
Java partial-write behavior on a later renderer failure is source inferred, not directly exercised by the successful-reuse probe.

**Trigger:** `save-reused-target`; resource-failure target checks accompany the large literal probes.

**Remedy:** Match target reuse and failure visibility for the selected API.
If complete replacement and atomic saves are retained as an extension, expose the distinction deliberately instead of relying on the shared target class name.
Future target adapters also need close/flush/ownership semantics, not only output strings.

### F11 L6 Callback and iterator timing differs even when result content agrees

**Premises:** Java locality uses a `Predicate` while traversing candidate axioms reachable from working seeds.
JS filters the complete base before extraction.
Java EntitySearcher accepts a stream of ontologies; JS accepts an iterable.

**Trace:** Locality on an empty seed and one base axiom → both return an empty module → JS calls the filter once; Java never calls it.
EntitySearcher over an ontology stream/side-effecting generator → Java traversal count is zero when the method returns and one after terminal consumption; JS generator count is already one on return.
[JS locality][JS-locality] [Java locality][J-locality] [JS queries][JS-search] [Java queries][J-search]

**Divergence:** L6: callbacks may throw, perform visible work or depend on invocation order.
Eager capture changes when those effects and failures occur.
Java locality extraction itself computes the module eagerly and then returns `set.stream()`; it would be incorrect to call its entire algorithm lazy.

**Trigger:** `locality-empty-seed`, `search-before-consume`, `search-after-consume`, and the JS control result.

**Remedy:** Preserve callback reachability and traversal timing for matched operations under the current parity requirement.
A different contract would require a separate explicit owner change of scope.
The current null default locality limits should stay free of invented ceilings.
Its additional third `options` argument is a JS extension with no Java numerical-control counterpart; it is not by itself proof of compatibility or grounds to add defaults.

### F12 L2 JSON-LD URL classification rejects ordinary hostnames

**Premises:** Remote JSON-LD contexts are enabled and a caller supplies a document loader.
The intended private-address classification operates on URL hostnames.

**Trace:** `requireSafeRemoteUrl` sets `privateIpv6` using `hostname.startsWith("fc")` and `startsWith("fd")` without first requiring an IPv6 literal → `https://fcorp.example/context` is classified as private IPv6 → policy exception occurs before the injected loader runs.
The control `https://context.example/context` calls the same loader and succeeds.
[JS URL classification][JS-jsonld]

**Divergence:** L2: a DNS hostname is treated as an IPv6 address.
This is an implementation classification error within a policy, separate from the intentional remote-context opt-in and separate from a proven security vulnerability.
No exploit or vulnerability severity is claimed.

**Trigger:** JSON-LD class declaration with `@context: "https://fcorp.example/context"`, `remoteJsonLdContexts: true`, and a stub loader returning `{"@context":{"x":"urn:x"}}`.
Loader calls were zero; the control made one call.

**Remedy:** Any retained address policy must identify the address type before applying IPv6 prefix rules, and keep ordinary DNS names admissible according to the chosen policy.
Whether the extra package policy itself belongs in Java-compatible default behavior is a separate decision.
No real DNS request was needed for this reproduction.

### F13 L6 Dependency limits and incomplete controls are not represented by the public budget object

**Premises:** The configured JS JSON-LD adapter delegates to jsonld.js 9.0.0 and injects only selected processor options and its context loader.

**Trace:** A stubbed remote-context chain advances through distinct public-looking URLs → jsonld.js ContextResolver checks its internal cycle-set size against 10 → the test makes 11 document-loader calls, then raises `jsonld.ContextUrlError` → package wraps it as `OWLSyntaxError`.
Separately, context URL comparison only detects whether final URL changed, and no package retry loop consumes `maxRetries`.
[JS adapter][JS-jsonld] [Dependency evidence in JSON](2026-10-13-owlapi-api-behavior-evidence.json)

**Divergence:** L6: the public configuration inventory neither explains nor can disable every effective gate.
The exact Java JSON-LD chain limit and remote-loader behavior remain unqualified: the retained Rio parser is RDF4J's `JSONLDParser`, and the classpath includes multiple JSON-LD processors.
No zero-network Java context-chain probe was added.

**Trigger:** `jsonld-context-chain13`; source inspection establishes the unused retry setting and 0/1 redirect calculation.

**Remedy:** Trace the actually selected Java processor, supported Rio settings and their values before choosing compatibility behavior.
If Java exposes the needed control through an existing format parameter, reuse that semantic seam.
Distinguish package enforcement from caller transport obligations; do not advertise a retry/redirect guarantee from a field name.

## Priorities and decisions required before an implementation plan

These are compatibility outcomes and evidence dependencies, not an implementation sequence or approved patch design.

| Priority  | Required outcome or decision                                                                                                              | Dependency                                                                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mandatory | Same admitted supported objects remain usable across addition/removal, changes, transforms, rendering and profile calls                   | Shared validator, direct paths and storer verification must be reconciled together; larger default numbers do not satisfy parity                                                          |
| Mandatory | Existing Java configuration method names, value domains, defaults and operational meanings are honored for corresponding responsibilities | Java default-resolution hierarchy; actual URLConnection/SAX/Rio consumption; explicit environment target                                                                                  |
| Mandatory | Default successful/failed loading agrees on implemented formats, including late syntax signatures and default strictness                  | Parser registry/fallback and RDF graph/reconstruction policy, not only configuration defaults                                                                                             |
| Mandatory | Save admission is not silently restricted by private default reparsing/search ceilings                                                    | Complete mapping → output → reparse → reconstruction → comparison path                                                                                                                    |
| Mandatory | Results and state after error are reviewed as API behavior                                                                                | `ChangeApplied` adaptation, atomic batch policy, target reuse, retained loader policy and closure publication                                                                             |
| Mandatory | Ordinary hostnames are not misclassified by an address parser                                                                             | A narrow URL classification correction can be specified independently of the larger policy decision                                                                                       |
| Mandatory | Preserve observable pinned quirks while that target remains in scope                                                                      | Writer copy-reset/identity, retry-helper anomalies and negative configuration acceptance; changing the target or allowing an exception requires a separate explicit owner change of scope |
| Decision  | Java environment baseline and supported variants                                                                                          | Native versus Rio parser, JDK 25 versus other JDK defaults, system/JAXP properties and relevant dependency versions                                                                       |
| Decision  | Promise/iterator/exception mapping permitted by the migration contract                                                                    | Browser responsiveness and cancellation are useful, but do not require eager query traversal or changed callback reachability                                                             |
| Evidence  | Effective Java JSON-LD chain/dependency/transport controls                                                                                | Identify the selected processor and verify supported format parameters with bounded local loader/transport probes                                                                         |
| Evidence  | Java failure-state and listener boundaries beyond the demonstrated batch                                                                  | Root/import failure, ID-collision variants, unsuccessful rollback, target partial write and consumer reentrancy                                                                           |

The old locality ceiling proposal is explicitly superseded by the owner's 9 October decision to follow Java's absence of numerical default caps.
The current locality implementation reflects that.
The broader requirement now applies the same authority discipline to all matched APIs, but does not establish that every current optional locality control or callback schedule is already equivalent.
[Locality decision][JS-locality-history]

A plan must not describe this work as merely making every limit configurable.
A configurable finite default still rejects a migrating caller who does not know to change it.
A public option that cannot disable a private downstream limit also does not solve the problem.
Conversely, removing explicit guards without addressing recursive paths or dependency limits is not evidence of completed behavioral compatibility.

## Required compatibility and regression evidence

| Evidence family             | Concrete checks to retain or add                                                                                                                                 | What constitutes useful proof                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Configuration API           | Existing Java names; unchanged-value identity; null/negative/zero/max domains; setter chaining; process/config-file precedence                                   | Matched call results and stage of rejection, not a table of similar field names                                               |
| Budget removal or alignment | Deep annotation probe; around 1 MiB literal; above former depth/work/axiom thresholds with controlled fixtures; explicit custom limits separately                | Default Java-compatible call succeeds or fails for the same reason; exact counters/units tested without repeating huge suites |
| Profiles                    | Valid report, known violation, explicit resource exhaustion, abort, incomplete closure, mutation during suspension, opt-in source evidence                       | Distinguish violation from incomplete computation; preserve source/formal separation and closure scope                        |
| Parsers                     | Leading whitespace/comments across sniff window; ordinary parse failure followed by another parser; explicit format/media hint; small strict/compatible examples | Correct candidate selection, exception category and observable publication                                                    |
| XML environment             | Native OWLXML/RDFXML versus Rio; expansion-count setting including zero; unused external declaration; depth and entity-size overrides                            | Selected provider/JDK and configuration recorded; no claim of universal Java defaults                                         |
| Imports/transport           | Reused documents, repeated missing imports, silent/throw strategy, ignored imports, timeout/retry/redirect controls, cancellation                                | Bounded local/fake transport counters; no external network dependency required                                                |
| Changes                     | Net-zero batch, no-op, unsuccessful change, thrown collision after a successful change, annotations disabled after loading                                       | Return protocol and exact post-call ontology/ID/closure state                                                                 |
| Storage                     | All four formats on the same admitted ontology; loaded custom configuration followed by save; reuse target; controlled late failure; comparator exhaustion       | Target state and error cause; output equivalence is a separate concern                                                        |
| Queries/locality            | Empty seed, unreachable axioms, throwing/counting filters, throwing ontology iterator, consuming versus not consuming results                                    | Callback count/reachability and error timing, not only final module/query values                                              |
| Runtime portability         | Node/browser XML parser and AbortSignal behavior; selected supported JVM/dependency combinations                                                                 | Explicit environment matrix with bounded evidence; intrinsic resource exhaustion is not an API numeric promise                |
| Artifact provenance         | Exact source/tree, ordered dependency/classpath identity, harness source and runtime, outputs and diagnostics                                                    | Retained-runtime observation is clearly separate from a fresh verified Java build or release gate                             |

Useful existing tests and harnesses can be extended rather than replaced: `RunWriterConfigurationContract.java`, `RunRC2Changes.java`, `RunRC2Profiles.java`, `RunRC2Locality.java`, `RunRC2LocalityFixedPoints.java`, parser/metadata contracts and the shared storage tests already target several selected Java responsibilities.
Current registry prose should also be reconciled against source: some mutation adaptation prose still names only earlier change kinds even though the implementation handles more.
The source remains the authority for this research's actual behavior claims.

## Evidence package and limits of coverage

The companion [evidence JSON](2026-10-13-owlapi-api-behavior-evidence.json) contains baseline metadata, loader/profile/locality inventory, source anchors, dependency hashes, the Java classpath and OWLAPI JAR hashes, all six probe programs and their captured results.
The probes can be reconstructed outside the repositories from their retained source strings.
Only the report and evidence JSON were saved to the requested destination.

This research did not compare every overload, every supported structural kind, all malformed-input branches, every optional parser setting, or every Java dependency's source.
Browser probes, a fresh Maven build, full-suite testing, million-state isomorphism exhaustion and large closure stress were not required to establish the demonstrated divergences.
Java JSON-LD dependency limits, arbitrary partial writer failure, Java listener behavior and full closure failure cleanup remain named follow-up evidence questions.

The retained results are sufficient to rule out current API-level behavioral equivalence and to define the important constraints for a later implementation plan.
They do not establish release readiness or complete conformance after any future change.

## Source index

All JS permalinks below identify commit `20426357165a22248985ec43d7ac1266d49d6bec`; all Java permalinks identify `b61ebe2da83daceebb3e7ba7afbd2582c9240c33`.
The companion evidence JSON stores repository-relative paths, one-based line anchors, local absolute paths and file hashes.
Runtime dependency files are recorded separately because they are not proven by a source checkout identity.

[JS-registry]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/docs/compatibility/java-api-surface.json#L1
[JS-pin]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/util/owlapi-reference/pinned-version.json#L1
[JS-loader]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/model/owlOntologyLoaderConfiguration.js#L13-L193
[JS-manager-load]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/model/owlOntologyManager.js#L606-L1089
[JS-manager-parse]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/model/owlOntologyManager.js#L1256-L1347
[JS-mutations]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/model/owlOntologyManager.js#L1090-L1243
[JS-parser-registry]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/parsing/parserRegistry.js#L145-L223
[JS-functional-lexer]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/parsing/functional/lexer.js#L20
[JS-owlxml-parser]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/parsing/owlxml/parser.js#L198
[JS-n3]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/parsing/rdf/n3SyntaxAdapter.js#L90
[JS-rdfxml]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/parsing/rdfxml/rdfXmlSyntaxAdapter.js#L834
[JS-jsonld]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/parsing/jsonld/jsonLdSyntaxAdapter.js#L215-L501
[JS-jsonld-descriptor]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/parsing/jsonld/descriptor.js#L14
[JS-translator-clock]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/mapping/rdfToOwlTranslator.js#L376-L436
[JS-translator-limits]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/mapping/rdfToOwlTranslator.js#L4290-L4900
[JS-entity]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/parsing/xml/xmlEntityPolicy.js#L175-L446
[JS-budget-doc]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/docs/performance/resource-budgets.json#L1
[JS-profile-budget]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/profiles/budget.js#L5-L100
[JS-profile-check]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/profiles/owl2dl.js#L96-L490
[JS-profile-report]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/profiles/owlProfileReport.js#L1
[JS-facets]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/profiles/facets.js#L27-L141
[JS-pattern]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/profiles/xsdPattern.js#L25
[JS-structure]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/model/structuralValidation.js#L117-L188
[JS-change-record]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/model/ontologyChangeRecord.js#L1-L36
[JS-transform]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/model/objectTransform.js#L1-L90
[JS-manchester-render]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/manchestersyntax/renderer/manchesterOWLSyntaxOWLObjectRendererImpl.js#L248-L295
[JS-functional-render]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/storage/functional/functionalSyntaxRenderer.js#L347-L375
[JS-turtle-store]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/storage/turtle/turtleStorer.js#L19-L96
[JS-rdfxml-store]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/storage/rdfxml/rdfXmlStorer.js#L26-L90
[JS-rdfxml-writer]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/storage/rdfxml/rdfXmlGraphWriter.js#L28
[JS-owlxml-store]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/storage/owlxml/owlXmlStorer.js#L29-L247
[JS-rdf-storage]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/storage/rdfStorage.js#L35-L73
[JS-isomorphism]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/model/ontologyStructuralIsomorphism.js#L171-L191
[JS-storer-registry]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/storage/storerRegistry.js#L71-L129
[JS-locality]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/modularity/locality/syntacticLocalityModuleExtractor.js#L24-L190
[JS-locality-budget]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/modularity/localityBudget.js#L1-L76
[JS-locality-history]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/docs/plans/0.1.0-rc.2-locality-work-bound.md#L1
[JS-search]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/search/entitySearcher.js#L18-L166
[JS-graphs]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/rdfjs/graphPolicy.js#L103-L145
[JS-writer]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/model/owlOntologyWriterConfiguration.js#L1-L74
[JS-writer-history]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/docs/compatibility/rdfxml-writer-configuration.md#L64
[JS-cardinality]: https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/internal/model/cardinality.js#L1
[J-loader]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/model/OWLOntologyLoaderConfiguration.java#L58-L550
[J-options]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/model/parameters/ConfigurationOptions.java#L18-L204
[J-transport]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/io/DocumentSources.java#L184-L284
[J-sax]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/util/SAXParsers.java#L34-L115
[J-owlxml-parser]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/parsers/src/main/java/org/semanticweb/owlapi/owlxml/parser/OWLXMLParser.java#L40-L70
[J-rdf-parser]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/parsers/src/main/java/org/semanticweb/owlapi/rdf/rdfxml/parser/RDFParser.java#L147-L166
[J-rio]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/rio/src/main/java/org/semanticweb/owlapi/rio/RioParserImpl.java#L169-L224
[J-rio-consumer]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/rio/src/main/java/org/semanticweb/owlapi/rio/RioOWLRDFConsumerAdapter.java#L100-L140
[J-factory]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/impl/src/main/java/uk/ac/manchester/cs/owl/owlapi/OWLOntologyFactoryImpl.java#L151-L235
[J-mutations]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/impl/src/main/java/uk/ac/manchester/cs/owl/owlapi/OWLOntologyManagerImpl.java#L569-L748
[J-load-imports]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/impl/src/main/java/uk/ac/manchester/cs/owl/owlapi/OWLOntologyManagerImpl.java#L1039-L1110
[J-profile]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/profiles/OWLProfile.java#L43-L59
[J-profile-report]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/profiles/OWLProfileReport.java#L36-L64
[J-addaxiom]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/model/AddAxiom.java#L25
[J-duplicator]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/util/OWLObjectDuplicator.java#L1
[J-manchester-render]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/parsers/src/main/java/org/semanticweb/owlapi/manchestersyntax/renderer/ManchesterOWLSyntaxOWLObjectRendererImpl.java#L1
[J-storage]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/util/AbstractOWLStorer.java#L86-L148
[J-turtle-store]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/parsers/src/main/java/org/semanticweb/owlapi/rdf/turtle/renderer/TurtleStorer.java#L1
[J-rdfxml-store]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/parsers/src/main/java/org/semanticweb/owlapi/rdf/rdfxml/renderer/RDFXMLStorer.java#L1
[J-owlxml-store]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/parsers/src/main/java/org/semanticweb/owlapi/owlxml/renderer/OWLXMLStorer.java#L1
[J-locality]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/tools/src/main/java/org/semanticweb/owlapi/modularity/locality/LocalityModuleExtractor.java#L72-L146
[J-search]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/search/EntitySearcher.java#L398-L425
[J-writer]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/model/OWLOntologyWriterConfiguration.java#L23-L203
[J-target]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/io/StringDocumentTarget.java#L25-L38
[J-format]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/api/src/main/java/org/semanticweb/owlapi/model/OWLDocumentFormat.java#L1
[J-datafactory]: https://github.com/owlcs/owlapi/blob/b61ebe2da83daceebb3e7ba7afbd2582c9240c33/impl/src/main/java/uk/ac/manchester/cs/owl/owlapi/OWLDataFactoryImpl.java#L588-L615
