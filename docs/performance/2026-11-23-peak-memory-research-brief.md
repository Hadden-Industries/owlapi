# Research brief on peak memory in JavaScript OwlAPI

23 November 2026

## Question for the reviewer

What proven implementation techniques and reusable components would bring peak RAM for JavaScript OwlAPI to approximately the level of Java OWLAPI 5.5.1 on equivalent workloads?
We need improvements across the public operations we exercise, from loading and retaining a model through queries, mutation, copying, profile checks, and serialization.
We welcome a combination of compact in-memory state and bounded disk-backed storage, where the platform permits it.

Please prioritize maintained, tested components and established implementation patterns.
Identify which part of the system each component can replace, the adapter it would need, and any compatibility gaps.
For any proposed custom component, explain which requirement existing implementations cannot meet.
The current JavaScript GAZ load peak of roughly 16 GiB is unacceptable for production.
Use the corresponding Java operation and repeatability of its measurements to set the target for each workload.

## Start with the current branch

The public project is `Hadden-Industries/owlapi` and the npm package is `@hadden-industries/owlapi`.
**Inspect `zero-one-zero` for the latest changes.**
The research snapshot is commit `97b452d454e5a6a0204af9448cc2968a56235a1e` on that branch.
`main` is at an earlier implementation stage.
[Working branch][branch] · [Exact research snapshot][snapshot]

The Java reference is the released OWLAPI 5.5.1 Maven distribution.
The memory runs below used its 64 hash-verified JARs and Temurin `25.0.5.1+2-LTS`.
The release source at `f760b3a4c107c6d5f90f856e5680c39b18af646f` is useful for seeing how the loaded model and indexes work.
For example, `MapPointer.init()` builds selected indexes on demand from the by-type axioms.
Our JavaScript read model already builds several indexes lazily, so the useful comparison is which indexes and representations each runtime retains under the same access sequence.
[Java reference harness][harness] · [Java index implementation][java-map] · [JavaScript read model][read-model]

## Measured starting point

### Paired cold RDF/XML loads

The installed-package benchmark ran `loadOntologyFromOntologyDocument` in separate fresh Java and JavaScript processes on Windows x64 build 26300.
JavaScript used Node `26.13.1` with the `java-owlapi-5.5.1` behavior profile and compatible parsing.
The fixture catalogue specifies the input bytes and logical document IRIs.
All three loads passed independent structural verification.
These are local measurements, reported as medians of three fresh-process peak working sets per engine, in GiB, with the observed ranges in parentheses.
Warmed load timings were collected separately.

| Pinned fixture | Input bytes | Axioms per engine |       Java peak GiB | JavaScript peak GiB | JS / Java |
| -------------- | ----------: | ----------------: | ------------------: | ------------------: | --------: |
| `obo-cido`     |  46,951,577 |           411,208 | 0.826 (0.772–0.855) | 5.755 (5.701–5.759) |     6.96× |
| `obo-iceo`     |  37,320,151 |           366,115 | 0.819 (0.812–0.844) | 8.166 (8.157–8.174) |     9.97× |
| `obo-mro`      |  66,923,606 |           420,165 | 0.887 (0.823–0.891) | 8.658 (8.645–8.770) |     9.76× |

The installed tarball SHA-256 was `7eb4e25157bf01a61a088e77ec97b5bf65d4591866f45c6bf90eeaf890c187f8`.
These measurements predate streaming RDF/XML support.
Recheck them on the research snapshot and compare the supported string and streamed source paths explicitly.
The current harness automatically chooses streaming for RDF/XML above Node's single-string limit, so the ordinary direct-load selector for these three inputs still exercises the string path.
[Fixture catalogue][fixtures] · [JavaScript harness worker][js-worker]

### GAZ scale check and phase evidence

- Fixture `obo-gaz` is 1,308,877,129 bytes of RDF/XML with SHA-256 `3961bb86e7b2c364d76ed03cf8b36aac3080b99d8bf578d62bcdc27f702bcc6f`.
  Its logical document IRI is `http://purl.obolibrary.org/obo/gaz.owl`.
  The document declares ontology IRI `http://purl.obolibrary.org/obo/TEMP`.
  Both engines loaded **7,801,002 axioms and 91 ontology annotations**, with no imports or network requests, and the structural comparison matched.
- The Windows run used Node `26.13.1` and the installed package from commit `cf42ff91f753e19233e3fed0f5f81c3f24f5205c`, tarball SHA-256 `e721d9da7a8f06ce1a4d018949da61038051a947fb5c660c7d05d0a6388a6ec9`.
  The original text path hit Node's string size limit.
  An early streaming trial with the object-backed RDF dataset exhausted a 22 GiB V8 heap.
  The retained run used the packed graph and the subsequent parser metadata traversal fix.
  [Streaming change][streaming] · [Traversal change][traversal]

| Retained measurement point                                                          | Working-set observation                                                                 |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| JavaScript at end of input consumption                                              | 1.23 GiB process high-water mark                                                        |
| JavaScript at completion of the public load                                         | **15.85 GiB** process high-water mark, with 13.51 GiB of V8 heap used at the checkpoint |
| JavaScript during streamed Functional Syntax output                                 | 15.86 GiB sampled peak. The output was 1,145,241,054 bytes.                             |
| Java worker for original load, Functional Syntax reparse, and structural comparison | **11.02 GiB** sampled peak across the combined workload                                 |

The GAZ evidence locates most of the JavaScript growth between input consumption and load completion.
The Java peak covers a second parse and model comparison in the same process, with a 24 GiB maximum heap setting.
A Java load-only GAZ measurement is still needed for a direct ratio.
Treat the phase readings as observations from this run.
A process high-water mark is cumulative, and an externally sampled peak can miss a short-lived spike.

The catalogue records the Zenodo download and its byte pin.
The comparison client previously received HTTP 403 there.
Use a verified local seed if direct harness retrieval fails.
[Zenodo record][gaz] · [Fixture identity and acquisition policy][fixtures]

## Public operations and compatibility to preserve

The shared harness registers **70 workload IDs**, each under both `java-owlapi-5.5.1` and `normative-v1`, for 140 benchmark rows.
These workload groups cover the following surfaces.
[Benchmark definitions][workloads] · [Coverage and admission ledger][coverage]

| Workload groups                                                             | IDs | What to exercise after a memory change                                                                                                                                                                                       |
| --------------------------------------------------------------------------- | --: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manager, configuration, prefix handling, factory and structural model       |  13 | Construct managers, entities, literals, class expressions and axioms. Preserve value equality, ordered constructs, annotated variants and the documented configuration behavior.                                             |
| Parsing and loading                                                         |  14 | Load the supported OWL and RDF formats in the inventory and force the relevant import closure. Include both direct string loads and streamed RDF/XML on representative real inputs.                                          |
| Ontology lifecycle and mutations                                            |   7 | Create and look up ontologies, apply individual and batched edits and exercise imports. Also test copy, rename, merge and failed publication through the public behavior suite.                                              |
| General and signature queries, specific axiom indexes, and `EntitySearcher` |  17 | Consume direct and imports-included collections, signature and IRI queries, referencing axioms, property/class hierarchies and deferred search results. Force first-use index creation and repeat the query after mutations. |
| Storage and Manchester object rendering                                     |   5 | Save Functional Syntax, OWL/XML, RDF/XML and Turtle through the public manager and exercise object rendering. Check the actual written bytes and a verified reload where the existing contract requires it.                  |
| OWL 2 profiles, locality and utilities                                      |  14 | Check DL, EL, QL and RL, extract locality modules and exercise import-set, short-form and other utilities in the inventory.                                                                                                  |

The repository also has 29 `public-api-behavior` cases and 14 JS-only `format-performance` programs at the research snapshot.
The behavior cases cover details such as import visibility during a failed load and retry, copies observable through providers, retained bytes on writer failure, and deferred query consumption.
Much of the historical 70-workload evidence is based on checksums, timings and heap deltas.
Use those workloads as coverage, with independent semantic evidence to qualify any new cross-engine peak-RAM ratio.
The six historically checked declaration-only I/O groups have narrower inputs and conclusions.
[Behavior cases and invocation][harness] · [Existing performance findings][performance-history]

These compatibility constraints affect storage design.

- Preserve immutable public OWL values, structural equality and public structural keys, ordered lists and property chains, axiom annotations, blank-node scope, literals and datatype/language identity.
  Preserve the distinction between document and ontology IRIs and check the full mapped import closure member by member.
  [OWL 2 structural specification][owl-structure] · [RDF mapping specification][owl-rdf]
- Preserve synchronous query signatures and documented defensive collections, ordering and lazy consumption where observable.
  For example, `getAxioms()` returns a fresh native `Set`.
  Measure its materialization cost separately from model retention.
  If an additive iterator or cursor would help large consumers, explain which use cases benefit while the existing calls remain available.
  [Public API][api] · [Ontology collection implementation][ontology] · [Consumer compatibility requirements][uo-contract]
- Preserve both behavior profiles, the supported parsing modes, exact resource and XML security checks, explicit network and import policies, diagnostics, and change/publication semantics after failure.
  A backing-store proposal must cover ownership, mutation invalidation, cancellation and cleanup where the existing API supports them.
  [Behavior profiles][behavior] · [WebVOWL requirements][vowl-contract]
- Preserve Node.js support starting at `22.0.0` and the browser distribution paths for native modules with import maps, application bundlers and bundled dedicated workers.
  Show the deployable option for each supported environment.
  An OS-specific backend can be evaluated for Node, with its browser counterpart or fallback evaluated separately.
  Tell us if an option needs a raised runtime floor, browser storage permission or a change to a synchronous contract.
  [Runtime and package support][runtime]

## Where to investigate first

The current code gives four useful measurement boundaries.
The specific allocation owners and their sizes still need profiling.

| Boundary                                        | Current implementation and candidate questions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingress and RDF graph                           | `RDFXMLStreamDocumentSource` feeds the existing streaming parser. The streamed path stores dictionary-coded rows in `CompactDefaultGraph` with typed arrays. Translation uses the RDF read view and row marks for consumed statements. Compare the current packed store with mature RDF stores, including graph index construction, reification, blank-node lookup, and whether queries allocate temporary RDF objects or result collections. [Syntax adapter][rdf-adapter] · [Packed graph][packed] · [RDF read view][rdf-view]                               |
| RDF-to-OWL reconstruction and model publication | The translator emits OWL values into a `ParseTransaction`. The manager then publishes managed state, with behavior that depends on the profile and load path. Check the simultaneous lifetimes of the RDF graph, inference/translation indexes, deduplication maps, provisional ontologies, mutation drafts, and committed state. Can the published model take ownership of one canonical backing representation? [Translator][translator] · [Manager and parse transaction][manager] · [Committed state and drafts][state]                                    |
| OWL value representation and query indexes      | `OWLStructuralObject` retains structural tuples and caches string keys on demand. `StructuralSet` uses those keys for membership. The axiom store has its own grouping semantics and reads already build several indexes lazily. Attribute memory to wrappers, structural keys, annotations, repeated operands, posting lists, snapshots and output collections before choosing what to compress or share. Measure first use and explicit full-collection queries. [Structural values][structural] · [Axiom store][axioms] · [Snapshot read model][read-model] |
| Saves, merges, copies and disposal              | The harness streams the large Functional Syntax transport. The public writers and graph operations have their own sorting, validation and snapshot costs. Check whether savings at load move the peak to result materialization, merge/copy, deterministic sort, writer validation or reload. Include repeated loads, removal or disposal of state, and failed operations. [Functional Syntax storer][functional] · [Storage and publication cases][harness]                                                                                                   |

Useful hypotheses to test include assigning compact IDs to immutable OWL terms and axioms, using collision-checked structural interning, avoiding simultaneous equivalent maps during publication, and materializing JS objects only at public boundaries.
Size both the fully live state and the largest overlapping temporaries before selecting a redesign.

## Established components worth screening

These are starting points for the review.
Please add better-fitting alternatives and identify which components can be adopted with minimal new storage or indexing code.

| Component or precedent                                                                | What we would want the reviewer to check                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N3.js indexes and entity dictionary**, or another maintained pure-JS implementation | N3.js already supplies syntax parsing in the project. Its store demonstrates numeric entity IDs and indexed quad access. Compare its allocation cost and iterator behavior to the current packed graph under the translator's actual access patterns. Identify any reusable dictionary or index design for the OWL layer. [N3.js store source][n3]                                                                                                                        |
| **Oxigraph** as an RDF backing option                                                 | Assess the maintained Rust implementation and JS/Wasm binding for graph queries, term conversion, index build peaks, memory and deployment. The documented JS `Store.match()` returns an array. Include the cost of that boundary or identify a maintained streaming interface. Verify disk capabilities on the exact target binding and price the separate OWL semantics and published model. [JS binding][oxigraph-js] · [Storage architecture][oxigraph-arch]          |
| **SQLite** for disk-backed records, indexes, staging or sort                          | Consider native SQLite on Node and the upstream SQLite Wasm OPFS options in a browser worker. Node's built-in SQLite starts at 22.5.0, above the package's 22.0.0 floor. Specify the binding and browser VFS, working-set cache, transactions, quota and disk-full behavior, and the impact on synchronous reads. Test native-module packaging and browser import-map or worker implications. [Node SQLite history][node-sqlite] · [SQLite Wasm persistence][sqlite-opfs] |
| **Compressed integer postings**, where profiling identifies them                      | Evaluate a maintained implementation such as CRoaring or an appropriate binding against sorted typed-array postings. Use actual index cardinality, posting sizes and update rates. Sparse and dense indexes may justify different layouts. Check ordinary browser packaging and full process memory including Wasm. [CRoaring project][croaring]                                                                                                                          |

For each recommended library, include its maintained release, licence, supported runtime and packaging, and the tests or production precedent that make it a credible choice.
Classify which layer it replaces and what would remain product-specific.
If you know a mature compact **OWL** model implementation with equivalent behavior, evaluate it alongside the RDF-only options.
The Java release remains a useful source for storage and indexing patterns.

## Reproduction and evidence requested

From a checkout on `zero-one-zero`, use the repository's existing harness and the contributor setup instructions.
The following read-only selectors resolve the workloads and fixture identities.
[Contributor setup][contributing] · [Harness CLI and configuration][harness]

```sh
npm run compare:java-js -- list --input obo-cido --input obo-iceo --input obo-mro --profile java-owlapi-5.5.1 --parsing-mode compatible --measure structure,behavior,performance
npm run compare:java-js -- list --input obo-gaz --profile java-owlapi-5.5.1 --parsing-mode compatible
npm run compare:java-js -- list --suite api-benchmarks
npm run compare:java-js -- list --suite public-api-behavior
npm run compare:java-js -- list --suite format-performance
```

Use `prepare`, `run`, and `verify` with the same case selection, an absolute cache/output location, and the same recorded toolchain and candidate across the attempt.
For GAZ, use `--seed obo-gaz=/absolute/path/to/gaz.owl` during preparation if needed.
For an exact historical replay select the above JDK with `--java-home` and `--java-selection 25.0.5+1.2`.
For new installed-package evidence provide the packed candidate with `--candidate`.
Use live measurements for new API comparisons, with `--benchmark-mode live` where applicable.
Historical Java timings are a separate evidence source.

Please propose a small experiment for the shared harness, followed by qualification at scale.

1. **Pair equivalent boundaries.**
   Compare fresh processes on the same machine and pinned bytes in the same configuration, with completed results independently verified.
   Start with CIDO, ICEO and MRO.
   Add a separate Java GAZ load-only measurement and corresponding JS load-only sample before assigning a GAZ ratio.
   Keep load, output, reparse and comparison phases identifiable.
2. **Attribute the peak.**
   Record process high-water RSS or Windows working set, retained memory after the load returns, JS heap and external/ArrayBuffer usage, and phase-specific allocations.
   If a backend adds a process or worker, capture whole-operation peaks including that backend and its charged memory.
   Capture simultaneous process-tree use with a method suited to the platform.
   Use heap allocation sampling or smaller representative heap snapshots in separate diagnostics.
   Node documents that a full snapshot can temporarily require roughly twice the heap.
   [Node memory metrics][node-process] · [Node heap snapshot costs][node-v8]
3. **Force downstream work.**
   Measure cold and warmed public queries, closure traversal, one mutation plus reread, bounded and full collections, batch/copy/merge cases, and writer completion.
   Capture both total and incremental peaks over the loaded model, including deferred index builds and fully consumed results.
   Add a mapped import closure with an existing writer comparison, such as `building-smart-ifcowl` with `--imports mapped`.
   Verify complete results, state and output under the existing contracts.
4. **Report scaling and costs.**
   Run repeat controls to establish normal variation.
   Report per-workload JS/Java peaks and scaling with axioms, terms and import size. Include elapsed time, GC, temporary disk/cache usage and write amplification where relevant.
   Test spill cleanup, quota exhaustion and the intended runtimes if a proposal relies on disk.
   Verify the installed package on Windows and Linux and check the affected browser distribution paths.
   Flag cases where Java and JS completed different work and keep those readings diagnostic.

Please return a ranked shortlist, the evidence behind the ranking, and the smallest useful prototype and test for the first recommendation.
For each option, estimate which measured peaks it can reduce, state the public operations it covers, and explain what would disprove the estimate.
Call out any operation whose output shape imposes a measurable memory floor and how close the compatible implementation can realistically get to the Java baseline.

[branch]: https://github.com/Hadden-Industries/owlapi/tree/zero-one-zero
[snapshot]: https://github.com/Hadden-Industries/owlapi/tree/97b452d454e5a6a0204af9448cc2968a56235a1e
[harness]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/util/owlapi-reference/README.md
[java-map]: https://github.com/owlcs/owlapi/blob/f760b3a4c107c6d5f90f856e5680c39b18af646f/impl/src/main/java/uk/ac/manchester/cs/owl/owlapi/MapPointer.java
[fixtures]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/util/owlapi-reference/comparison-fixtures.json
[js-worker]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/util/owlapi-reference/run-comparison-js.mjs
[streaming]: https://github.com/Hadden-Industries/owlapi/commit/5135af93
[traversal]: https://github.com/Hadden-Industries/owlapi/commit/cf42ff91f753e19233e3fed0f5f81c3f24f5205c
[gaz]: https://zenodo.org/records/18247183
[workloads]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/util/benchmark-owlapi-java-parity.mjs
[coverage]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/docs/performance/java-api-benchmark-coverage.json
[performance-history]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/docs/performance/remaining-java-performance-implementation-results.md
[owl-structure]: https://www.w3.org/TR/owl2-syntax/
[owl-rdf]: https://www.w3.org/TR/owl2-mapping-to-rdf/
[api]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/API.md
[ontology]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/model/owlOntology.js
[uo-contract]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/docs/requirements/java-parity-for-universal-ontology.md
[vowl-contract]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/docs/requirements/java-parity-for-webvowl.md
[behavior]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/docs/compatibility/behavior-profiles.md
[runtime]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/README.md#node-and-browser-support
[rdf-adapter]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/internal/parsing/rdfxml/rdfXmlSyntaxAdapter.js
[packed]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/internal/rdfjs/compactDefaultGraph.js
[rdf-view]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/internal/mapping/rdfReadView.js
[translator]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/internal/mapping/rdfToOwlTranslator.js
[manager]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/model/owlOntologyManager.js
[state]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/internal/model/ontologyState.js
[structural]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/model/structural.js
[axioms]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/internal/model/axiomSemantics.js
[read-model]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/internal/model/ontologyReadModel.js
[functional]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/internal/storage/functional/functionalSyntaxStorer.js
[n3]: https://github.com/rdfjs/N3.js/blob/main/src/N3Store.js
[oxigraph-js]: https://github.com/oxigraph/oxigraph/tree/main/js
[oxigraph-arch]: https://github.com/oxigraph/oxigraph/wiki/Architecture
[node-sqlite]: https://nodejs.org/api/sqlite.html
[sqlite-opfs]: https://sqlite.org/wasm/doc/trunk/persistence.md
[croaring]: https://github.com/RoaringBitmap/CRoaring
[contributing]: https://github.com/Hadden-Industries/owlapi/blob/zero-one-zero/CONTRIBUTING.md
[node-process]: https://nodejs.org/api/process.html#processmemoryusage
[node-v8]: https://nodejs.org/api/v8.html#v8getheapsnapshotoptions
