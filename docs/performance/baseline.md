# Phase 0 baseline

- WebVOWL revision: `5301d6c0b9e69c048f6ab079ea1103790bc70b85`
- Environment: Windows 11 x64, Node.js `v24.17.0`.
- Test command: `npm test -- --runInBand`
- Result on 9 August 2026: 48 suites passed, 398 tests passed.
- Differential runner: passed but emitted differences for 44 reference fixtures.
  Those diagnostics are characterization evidence, not approved expected-difference rules.
- Measured source corpus: `C:/Users/maksy/GitHub/universal-ontology/src/external`.
- Largest measured ontology: `schemaorg.owl`, 1,987,111 bytes.
- Existing documented failure class: eager tokenization of unrelated input around 2 MiB can exhaust V8 heap.
- Pinned benchmark inventory: `performance/benchmark-corpus.json`.
- Measurement protocol: one warm-up plus five measured runs, reporting the median.
- Release threshold: at most 20% regression in median wall time and peak heap
  relative to the last accepted phase baseline, unless the repository decision
  authority approves evidence and rationale for a new baseline.

A phase may establish a new accepted baseline only after its full Definition of
Done passes. A regression is not grounds to rewrite this baseline.

## Phase 2 Functional Syntax baseline

- Phase 1 checkpoint revision: `3b4644f`.
- Measurement date: 10 August 2026.
- Environment: Windows `10.0.26200` x64, Node.js `v24.17.0`, 12th Gen
  Intel Core i9-12900K (24 logical CPUs), 34,053,869,568 bytes system memory.
- Dependency identity: `package-lock.json` SHA-256
  `af79e01c2906a6df0ac2846afec87deb3baef3084606dff965b82bf6056c55e1`.
- Command: `node --expose-gc util/benchmark-owlapi-functional.mjs`.
- Protocol: generator `owlapi-benchmark-corpus-v1`; one warm-up and five
  measured runs per fixture; median aggregation; garbage collection requested
  before each run; heap sampled every 5 ms and at operation completion.

| Fixture                      | Median wall time (ms) | Median peak heap (bytes) | Median peak heap delta (bytes) |
| ---------------------------- | --------------------: | -----------------------: | -----------------------------: |
| `generated-functional-large` |                460.29 |              125,611,360 |                    118,988,376 |
| `generated-functional-depth` |                309.24 |               56,008,448 |                     49,566,376 |
| `generated-mismatch-large`   |                 24.42 |               23,255,720 |                         29,248 |

`generated-functional-large` contains 50,000 declaration axioms,
`generated-functional-depth` has 512 nested class-expression levels, and
`generated-mismatch-large` is 16 MiB of unrelated text. The mismatch result is
the bounded-detector regression signal: rejecting it allocated a median of only
29,248 additional heap bytes. This is the first accepted Functional Syntax
baseline, so there is no earlier Functional parser measurement against which to
calculate the existing 20% regression threshold. Later accepted phases and
Functional-parser changes compare against these medians; the threshold itself
is unchanged.

## Phase 3 Manchester Syntax baseline

- Phase 2 checkpoint revision: `8a85801`.
- Measurement date: 11 August 2026.
- Environment: Windows `10.0.26200` x64, Node.js `v24.17.0`, 12th Gen
  Intel Core i9-12900K (24 logical CPUs), 34,053,869,568 bytes system memory.
- Dependency identity: `package-lock.json` SHA-256
  `af79e01c2906a6df0ac2846afec87deb3baef3084606dff965b82bf6056c55e1`.
- Command: `node --expose-gc util/benchmark-owlapi-manchester.mjs`.
- Protocol: generator `owlapi-benchmark-corpus-v1`; one warm-up and five
  measured runs per fixture; median aggregation; garbage collection requested
  before each run; heap sampled every 5 ms and at operation completion.

| Fixture                      | Median wall time (ms) | Median peak heap (bytes) | Median peak heap delta (bytes) |
| ---------------------------- | --------------------: | -----------------------: | -----------------------------: |
| `generated-manchester-large` |                530.81 |              144,777,480 |                    137,913,208 |
| `generated-mismatch-large`   |                 27.52 |               22,686,456 |                         33,112 |

`generated-manchester-large` contains 50,000 class frames. This is the first
accepted Manchester Syntax baseline, so no earlier Manchester parser result
exists for threshold comparison. The mismatch result remains a bounded-detector
signal rather than a parser-throughput result.

The Phase 2 signals were remeasured with
`node --expose-gc util/benchmark-owlapi-functional.mjs` to protect the accepted
baseline after registering Manchester in the default parser registry.

| Existing signal              | Phase 3 wall / peak-heap delta | Wall change | Peak-heap-delta change |
| ---------------------------- | -----------------------------: | ----------: | ---------------------: |
| `generated-functional-large` |  457.26 ms / 118,823,688 bytes |      -0.66% |                 -0.14% |
| `generated-functional-depth` |   329.60 ms / 49,559,760 bytes |      +6.58% |                 -0.01% |
| `generated-mismatch-large`   |        26.54 ms / 29,752 bytes |      +8.67% |                 +1.72% |

Every remeasured wall-time and peak-heap-delta change is below the unchanged
20% release threshold. Phase 3 therefore introduces no measured regression to
an existing accepted signal.

## Phase 4 OWL/XML baseline

- Phase 3 checkpoint revision:
  `a35503f091a886b8fe96f16eb7ba806ef79dd502`.
- Measurement date: 11 August 2026.
- Environment: Windows `10.0.26200` x64, Node.js `v24.17.0`, 12th Gen
  Intel Core i9-12900K (24 logical CPUs), 34,053,869,568 bytes system memory.
- Dependency identity: `package-lock.json` SHA-256
  `dbf218f2d46d6f9d9aac0a5727afe5a1efe2fb4a349bd6719fd55106c781fa5a`.
- Command: `node --expose-gc util/benchmark-owlapi-owlxml.mjs`.
- Protocol: generator `owlapi-benchmark-corpus-v1`; one warm-up and five
  measured runs per fixture; median aggregation; garbage collection requested
  before each run; heap sampled every 5 ms and at operation completion.

| Fixture                    | Median wall time (ms) | Median peak heap (bytes) | Median peak heap delta (bytes) |
| -------------------------- | --------------------: | -----------------------: | -----------------------------: |
| `generated-owlxml-large`   |                682.45 |              227,897,104 |                    214,156,824 |
| `generated-mismatch-large` |                 26.58 |               30,339,032 |                         33,984 |

`generated-owlxml-large` contains 50,000 declaration axioms and exercises DOM
construction plus direct structural-object creation. This is the first accepted
OWL/XML baseline, so it has no earlier OWL/XML result for threshold comparison.
The 16 MiB mismatch is rejected by bounded detection before XML parsing; against
the accepted Phase 2 registry-wide mismatch signal, wall time changed by +8.85%
and peak-heap delta by +16.19%, both within the unchanged 20% threshold.

The Phase 2 and Phase 3 accepted signals were remeasured after registering
OWL/XML and reclassifying the Node DOM adapter as a production dependency.

| Existing signal              | Phase 4 wall / peak-heap delta | Wall change | Peak-heap-delta change |
| ---------------------------- | -----------------------------: | ----------: | ---------------------: |
| `generated-functional-large` |  458.43 ms / 121,605,376 bytes |      -0.40% |                 +2.20% |
| `generated-functional-depth` |   323.29 ms / 49,570,120 bytes |      +4.54% |                 +0.01% |
| Functional mismatch          |        24.30 ms / 30,648 bytes |      -0.51% |                 +4.79% |
| `generated-manchester-large` |  567.70 ms / 139,431,112 bytes |      +6.95% |                 +1.10% |
| Manchester mismatch          |        24.40 ms / 37,232 bytes |     -11.33% |                +12.44% |

Every accepted wall-time and peak-heap-delta signal remains below the unchanged
20% release threshold. Phase 4 therefore establishes an OWL/XML baseline
without a measured regression to the Functional or Manchester baselines.

## Phase 5 RDF-to-OWL baseline

- Phase 4 checkpoint revision:
  `ddd7af080efaf828653c83c9e18afe699f16510a`.
- Measurement date: 13 August 2026.
- Environment: Windows `10.0.26200` x64, Node.js `v24.19.0`, 12th Gen
  Intel Core i9-12900K (24 logical CPUs), 34,053,869,568 bytes system memory.
- Dependency identity: `package-lock.json` SHA-256
  `dbf218f2d46d6f9d9aac0a5727afe5a1efe2fb4a349bd6719fd55106c781fa5a`.
- Command: `node --expose-gc util/benchmark-owlapi-rdf-to-owl.mjs`.
- Protocol: constructed canonical RDF/JS datasets; dataset construction is
  excluded; one warm-up and five measured translations per fixture; median
  aggregation; garbage collection requested before each run; heap sampled
  every 5 ms and at operation completion.

| Fixture                            | Input shape                       | Median wall time (ms) | Median peak heap delta (bytes) |
| ---------------------------------- | --------------------------------- | --------------------: | -----------------------------: |
| `generated-rdf-declarations-large` | 50,000 quads / declaration axioms |              1,155.98 |                    264,927,896 |
| `generated-rdf-list-long`          | 25,000 items / 50,002 quads       |              1,320.91 |                    273,877,992 |
| `generated-rdf-expression-depth`   | 256 levels / 257 quads            |                 21.54 |                     44,263,032 |

These are the first accepted syntax-independent RDF-to-OWL signals. The large
declaration case measures indexed DatasetCore traversal plus structural axiom
construction, the list case stresses iterative RDF collection validation, and
the depth case exercises recursive expression reconstruction below the governed
depth ceiling. Dataset creation is intentionally outside the operation so later
RDF syntax adapters can measure syntax-to-RDF costs independently.

The existing Functional, Manchester, and OWL/XML signals were remeasured after
adding the shared translator. Comparisons use the latest accepted Phase 4
measurements, not the original Phase 2 or Phase 3 values.

| Existing signal              | Phase 5 wall / peak-heap delta | Wall change | Peak-heap-delta change |
| ---------------------------- | -----------------------------: | ----------: | ---------------------: |
| `generated-functional-large` |  449.92 ms / 121,654,152 bytes |      -1.86% |                 +0.04% |
| `generated-functional-depth` |   144.01 ms / 49,581,816 bytes |     -55.46% |                 +0.02% |
| Functional mismatch          |         6.76 ms / 30,632 bytes |     -72.18% |                 -0.05% |
| `generated-manchester-large` |  501.03 ms / 128,725,752 bytes |     -11.74% |                 -7.68% |
| Manchester mismatch          |         7.27 ms / 40,720 bytes |     -70.20% |                 +9.37% |
| `generated-owlxml-large`     |  617.39 ms / 203,598,176 bytes |      -9.53% |                 -4.93% |
| OWL/XML mismatch             |         6.63 ms / 37,400 bytes |     -75.06% |                +10.05% |

Every existing accepted wall-time and peak-heap-delta signal remains below the
unchanged 20% release threshold.

The browser-cost measurement used
`node util/measure-owlapi-rdf-browser-cost.mjs` with Vite 8's Oxc production
minifier and in-memory entry points. It excludes application code and records
both standalone dependency costs and their combined tree-shaken cost.

| Browser dependency entry                  | Minified bytes | Gzip bytes |
| ----------------------------------------- | -------------: | ---------: |
| `@rdfjs/data-model`                       |          2,581 |        828 |
| `@rdfjs/dataset`                          |          4,296 |      1,611 |
| `@rdfjs/data-model` plus `@rdfjs/dataset` |          6,885 |      2,208 |

Phase 5 therefore establishes the first RDF reconstruction and foundational
RDF/JS browser-cost baselines without changing the governed resource ceilings.

## Phase 6 RDF/XML baseline

- Phase 5 checkpoint revision:
  `86f1602cb958b08fc13b30e430a116f262db9604`.
- Measurement date: 13 August 2026.
- Environment: Windows `10.0.26200` x64, Node.js `v24.17.0`, 12th Gen
  Intel Core i9-12900K (24 logical CPUs), 34,053,869,568 bytes system memory.
- Dependency identity: `package-lock.json` SHA-256
  `dbf218f2d46d6f9d9aac0a5727afe5a1efe2fb4a349bd6719fd55106c781fa5a`.
- Command: `node --expose-gc util/benchmark-owlapi-rdfxml.mjs`.
- Protocol: generator `owlapi-benchmark-corpus-v1`; one warm-up and five
  measured runs for the large fixture; median aggregation; garbage collection
  requested before every run; heap sampled every 5 ms and at operation
  completion. First use separately measures manager selection → first
  conditional RDF/XML dependency load → shared RDF-to-OWL reconstruction.

| Signal                                 | Input                           | Accepted wall time (ms) | Accepted peak heap delta (bytes) |
| -------------------------------------- | ------------------------------- | ----------------------: | -------------------------------: |
| RDF/XML first use                      | 5,448 bytes / 100 declarations  |                   36.59 |                        8,331,688 |
| `generated-rdfxml-large.syntax-to-rdf` | 2,789,048 bytes / 50,000 quads  |                  306.15 |                       92,747,760 |
| `generated-rdfxml-large.end-to-end`    | 2,789,048 bytes / 50,000 axioms |                1,844.23 |                      341,045,176 |

The syntax-only signal ends at the canonical RDF/JS dataset boundary. The
end-to-end signal includes parser selection, the conditionally imported
`rdfxml-streaming-parser`, project term/quad normalization, graph selection,
shared RDF-to-OWL reconstruction, and structural ontology publication. These
are the first accepted RDF/XML measurements, so neither changes an existing
RDF/XML threshold baseline.

The Phase 5 checkpoint was remeasured from an exact `git archive` on the same
Node/runtime and machine before comparing existing signals. This paired
measurement avoids treating the accepted Phase 5 document's Node.js `v24.19.0`
results as directly comparable to the available `v24.17.0` runtime. The
temporary archive is not a repository artifact.

| Existing signal                    | Paired Phase 5 wall / heap delta | Phase 6 wall / heap delta | Wall change | Heap-delta change |
| ---------------------------------- | -------------------------------: | ------------------------: | ----------: | ----------------: |
| `generated-functional-large`       |    472.24 ms / 118,473,640 bytes |   468.93 ms / 117,510,288 |      -0.70% |            -0.81% |
| `generated-functional-depth`       |     146.85 ms / 49,645,616 bytes |    145.86 ms / 49,563,656 |      -0.67% |            -0.17% |
| Functional mismatch                |          14.09 ms / 30,648 bytes |         13.93 ms / 31,616 |      -1.09% |            +3.16% |
| `generated-manchester-large`       |    507.73 ms / 131,897,432 bytes |   500.88 ms / 133,520,080 |      -1.35% |            +1.23% |
| Manchester mismatch                |          13.96 ms / 39,784 bytes |         13.87 ms / 36,904 |      -0.65% |            -7.24% |
| `generated-owlxml-large`           |    623.53 ms / 206,880,056 bytes |   628.14 ms / 208,121,968 |      +0.74% |            +0.60% |
| OWL/XML mismatch                   |          13.93 ms / 37,416 bytes |         13.86 ms / 34,536 |      -0.52% |            -7.70% |
| `generated-rdf-declarations-large` |  1,183.38 ms / 265,943,704 bytes | 1,190.86 ms / 296,777,176 |      +0.63% |           +11.59% |
| `generated-rdf-list-long`          |  1,374.53 ms / 290,586,440 bytes | 1,356.80 ms / 282,604,344 |      -1.29% |            -2.75% |
| `generated-rdf-expression-depth`   |      24.08 ms / 44,262,512 bytes |     22.17 ms / 44,262,416 |      -7.93% |             0.00% |

Every paired wall-time and peak-heap-delta change remains below the unchanged
20% release threshold. No resource ceiling or regression threshold changed.

The browser-cost measurement used
`node util/measure-owlapi-rdfxml-browser-cost.mjs` with a Vite 8 programmatic
production build, Oxc minification, ES2022 target, and in-memory output.

| Browser graph      | Chunks | Minified bytes | Gzip bytes |
| ------------------ | -----: | -------------: | ---------: |
| Initial manager    |      1 |        196,267 |     49,466 |
| Lazy RDF/XML graph |      1 |        163,163 |     46,737 |

The RDF/XML implementation is absent from the initial graph, is loaded only in
the measured lazy graph, and does not pull the Node `@xmldom/xmldom` fallback
into the browser build. Phase 6 therefore accepts the first RDF/XML syntax,
end-to-end, first-use, and lazy-browser baselines without technical-debt
exceptions.

## Phase 7 development-integration baseline

- Phase 6 checkpoint revision: `7590c17`.
- Measurement date: 18 August 2026.
- Environment: Windows `10.0.26200` x64, Node.js `v24.17.0`, 12th Gen
  Intel Core i9-12900K (24 logical CPUs), 34,053,869,568 bytes system memory.
- Dependency identity: `package-lock.json` SHA-256
  `dbf218f2d46d6f9d9aac0a5727afe5a1efe2fb4a349bd6719fd55106c781fa5a`,
  unchanged from the accepted Phase 6 document.
- Command: `node --expose-gc util/benchmark-vowl-builder.mjs`.
- Protocol: generator `owlapi-benchmark-corpus-v1`; one warm-up and five
  measured runs for each large fixture; median aggregation; garbage collection
  requested before every run; heap sampled every 5 ms and at operation
  completion. First use separately measures the development adapter through
  manager selection, RDF/XML, shared RDF-to-OWL reconstruction, and the builder.

Every measurement below was taken on an otherwise idle machine, with no other
benchmark, test run, or file-scanning work in progress, as ADR 0003 and
section 20.6 now require. See finding `M7-008`.

| Signal                                      | Input                            | Accepted wall time (ms) | Accepted peak heap delta (bytes) |
| ------------------------------------------- | -------------------------------- | ----------------------: | -------------------------------: |
| VOWL development-route first use            | 5,448 bytes / 100 declarations   |                   40.10 |                        8,902,104 |
| `generated-vowl-classes-large.builder-only` | 1,388,974 bytes / 50,000 classes |                  138.95 |                       68,991,864 |
| `generated-rdfxml-large.owlapi-to-vowl`     | 2,789,048 bytes / 50,000 classes |                1,947.63 |                      341,643,480 |

The builder-only signal starts from an already-loaded `OWLOntology` and ends at
the VOWL-JSON-compatible result. The `owlapi-to-vowl` signal is the complete
development route: parser selection, RDF/XML, project quad normalization,
shared RDF-to-OWL reconstruction, structural publication, and VOWL
construction. These are the first accepted VOWL-builder measurements, so
neither changes an existing threshold baseline.

Both pre-existing RDF/XML signals were remeasured on this runtime and machine
before any comparison, as finding `M6-011` requires.

| Existing signal                        | Accepted Phase 6 wall / heap delta | Paired Phase 7 wall / heap delta | Wall change | Heap-delta change |
| -------------------------------------- | ---------------------------------: | -------------------------------: | ----------: | ----------------: |
| `generated-rdfxml-large.syntax-to-rdf` |       306.15 ms / 92,747,760 bytes |     334.48 ms / 92,750,176 bytes |      +9.25% |            +0.00% |
| `generated-rdfxml-large.end-to-end`    |    1,844.23 ms / 341,045,176 bytes |  1,809.97 ms / 341,473,632 bytes |      -1.86% |            +0.13% |

Both paired changes remain within the unchanged 20% release threshold. No
resource ceiling or regression threshold changed, and no baseline was
re-anchored.

The three accepted signals are mutually consistent, which is the arithmetic
check that the numbers are sound: `owlapi-to-vowl` minus the paired
`end-to-end` signal is approximately 138 ms, matching the independently
measured `builder-only` signal of 138.95 ms. VOWL construction over 50,000
classes is therefore time-cheap relative to ingestion and adds no measurable
peak heap, because the structural ontology already dominates.

## Phase 8 production-cutover baseline

- Phase 7 checkpoint revision: `27dba50`, corrected by `9733cc9`.
- Measurement date: 18 August 2026.
- Environment: Windows `10.0.26200` x64, Node.js `v24.17.0`, 12th Gen
  Intel Core i9-12900K (24 logical CPUs), 34,053,869,568 bytes system memory.
- Dependency identity: `package-lock.json` SHA-256
  `dbf218f2d46d6f9d9aac0a5727afe5a1efe2fb4a349bd6719fd55106c781fa5a`,
  unchanged from the accepted Phase 6 and Phase 7 documents.
- Commands: `node --expose-gc util/benchmark-vowl-builder.mjs` and
  `node --expose-gc util/benchmark-owlapi-rdfxml.mjs`, each run in the
  foreground on an otherwise idle machine as ADR 0003 requires.

The measured path is now the production path. `util/benchmark-vowl-builder.mjs`
invokes `src/owl2vowl/js/index.js`, the same entry the application uses, rather
than the removed Phase 7 development adapter.

| Signal                                      | Accepted Phase 7 wall / heap delta |       Phase 8 wall / heap delta | Wall change | Heap-delta change |
| ------------------------------------------- | ---------------------------------: | ------------------------------: | ----------: | ----------------: |
| VOWL production first use                   |         40.10 ms / 8,902,104 bytes |      41.47 ms / 8,908,288 bytes |      +3.42% |            +0.07% |
| `generated-vowl-classes-large.builder-only` |       138.95 ms / 68,991,864 bytes |    143.05 ms / 69,181,792 bytes |      +2.95% |            +0.28% |
| `generated-rdfxml-large.owlapi-to-vowl`     |    1,947.63 ms / 341,643,480 bytes | 1,928.00 ms / 340,313,624 bytes |      -1.01% |            -0.39% |

| Existing signal                        | Accepted Phase 6 wall / heap delta |       Phase 8 wall / heap delta | Wall change | Heap-delta change |
| -------------------------------------- | ---------------------------------: | ------------------------------: | ----------: | ----------------: |
| `generated-rdfxml-large.syntax-to-rdf` |       306.15 ms / 92,747,760 bytes |    320.66 ms / 92,767,720 bytes |      +4.74% |            +0.02% |
| `generated-rdfxml-large.end-to-end`    |    1,844.23 ms / 341,045,176 bytes | 1,880.48 ms / 341,859,680 bytes |      +1.97% |            +0.24% |

Every signal is within the unchanged 20% release threshold. No resource
ceiling, regression threshold or accepted baseline changed. Replacing the
legacy pipeline with the structural path therefore costs nothing measurable at
the production entry.

### A corrected reading of the cross-signal check

The Phase 7 record stated that `owlapi-to-vowl` minus the paired `end-to-end`
signal matches the independently measured `builder-only` signal. In Phase 7
those figures were 1,947.63, 1,809.97 and 138.95 ms, and the arithmetic
appeared exact. That agreement was a coincidence: `builder-only` builds the
ontology produced from the **Functional Syntax** fixture, while
`owlapi-to-vowl` builds the one produced from the **RDF/XML** fixture. The two
inputs are different ontologies with different axiom mixes, so their build costs
are related but not equal. The Phase 8 figures make that visible: 1,928.00 minus
1,880.48 is 47.52 ms against an independently measured 143.05 ms.

The check remains useful as an order-of-magnitude corroboration that the three
signals describe the same system, and it is what exposed finding `M8-004`. It
is not an identity, and it must not be reported as one.

### A contaminated measurement the pre-flight guard did not catch

The first Phase 8 run of `util/benchmark-vowl-builder.mjs` reported
`owlapi-to-vowl` at 3,684.71 ms, 89% above the accepted Phase 7 figure, with a
run-to-run spread of 3,062 ms to 3,836 ms. The ADR 0003 pre-flight guard
sampled processor time at process start, found the machine idle, and allowed
the run.

The measurement was contaminated. An isolated repeat on the same revision and
machine produced 1,928.00 ms with a 6% spread, and a standalone probe of the
production entry produced 1,793 ms to 2,072 ms. The figure was never recorded
as a regression because the corroboration required by section 20.6 rejected it
first: the cross-signal arithmetic was impossible, since 3,684.71 ms minus a
143.05 ms build cannot be reconciled with an RDF/XML end-to-end signal measured
at 1,880.48 ms minutes later on the same machine.

This is recorded as finding `M8-004`. The guard is a start-of-run check and
cannot observe interference that begins after the process starts, so it reduces
the frequency of contaminated measurements without eliminating them. The
corroboration requirement, not the guard, is the control that holds.

## Phase 9 strict Turtle baseline

- Pre-Phase-9 control revision: `29909bb`.
- Measurement date: 20 August 2026.
- Environment: Windows `10.0.26200` x64, Node.js `v24.19.0`, 12th Gen
  Intel Core i9-12900K (24 logical CPUs), 34,053,869,568 bytes system memory.
- Dependency identity: `package-lock.json` SHA-256
  `dbf218f2d46d6f9d9aac0a5727afe5a1efe2fb4a349bd6719fd55106c781fa5a`,
  unchanged from Phases 4 through 8.
- Commands: `node --expose-gc util/benchmark-owlapi-turtle.mjs`,
  `node util/measure-owlapi-turtle-browser-cost.mjs`, and the applicable
  pre-existing benchmark and browser-cost utilities.
- Protocol: generator `owlapi-benchmark-corpus-v1`; one warm-up and five
  measured runs; median aggregation; garbage collection requested before each
  run; heap and event-loop responsiveness sampled every 5 ms. All runs passed
  the repository idle-machine guard.

The new Turtle fixture contains 50,000 declaration triples in 1,088,977 bytes.
Syntax-only measurements end at the canonical RDF/JS dataset boundary; the
end-to-end measurement continues through parser selection, graph policy,
shared RDF-to-OWL reconstruction, and structural ontology publication.

| Signal                                              | Chunk bytes | Median wall (ms) | Median peak-heap delta (bytes) | Median max event-loop delay (ms) |
| --------------------------------------------------- | ----------: | ---------------: | -----------------------------: | -------------------------------: |
| Turtle first use, 100 declarations                  |      65,536 |            35.84 |                      7,957,352 |                            10.56 |
| `generated-turtle-large.syntax-to-rdf.chunk-16384`  |      16,384 |           963.49 |                    109,138,120 |                            17.20 |
| `generated-turtle-large.syntax-to-rdf.chunk-65536`  |      65,536 |           398.49 |                    128,631,288 |                            33.02 |
| `generated-turtle-large.syntax-to-rdf.chunk-262144` |     262,144 |           350.59 |                    139,936,712 |                            73.08 |
| `generated-turtle-large.end-to-end`                 |      65,536 |         1,771.10 |                    266,324,104 |                         1,133.96 |

The default remains 65,536 bytes. It is 58.6% faster than the 16 KiB path
while keeping the measured syntax-adapter scheduling interval below the 50 ms
cooperative-yield budget. The 256 KiB path gains only another 12.0% throughput
but produces a 73.08 ms interval and retains substantially more heap, so it is
not the browser-responsiveness choice. This is a measured default rather than
an arbitrary buffer size.

The end-to-end delay is not attributed to N3.js or the Turtle adapter: the
syntax-only path stays at 33.02 ms, while the shared RDF-to-OWL/structural path
already required approximately 1.16 seconds for this 50,000-axiom shape in the
accepted Phase 5 benchmark. The end-to-end result records that existing shared
cost honestly; it does not relax a threshold or weaken the adapter's bounded
streaming and cooperative-yield contract.

The browser measurement used a Vite 8 programmatic production build with Oxc
minification, ES2022 target, in-memory output, and no project configuration
file. The published self-contained N3.js browser entry is conditionally loaded
only after exact Turtle selection.

| Browser graph      | Chunks | Minified bytes | Gzip bytes |
| ------------------ | -----: | -------------: | ---------: |
| Initial manager    |      1 |        214,411 |     53,742 |
| Lazy Turtle graph  |      1 |        185,923 |     51,873 |
| Lazy RDF/XML graph |      1 |        163,163 |     46,737 |

N3.js and the retained legacy `src/owl2vowl/js/turtleParser.js` are both absent
from the initial graph. Relative to the accepted Phase 6 initial-manager graph,
the registered Turtle descriptor and private adapter add 18,144 minified bytes
(+9.24%) and 4,276 gzip bytes (+8.64%), both within the unchanged 20% release
threshold. The RDF/XML lazy graph is byte-for-byte unchanged.

This isolated browser measurement intentionally does not load the project's
Vite configuration. The first actual application build exposed that its
blanket `manualChunks` vendor group hoisted N3.js into the statically imported
initial closure. The approved correction replaces that deprecated rule with an
entry-aware `codeSplitting` vendor group. The production build is independently
inspected by `node util/verify-webvowl-lazy-parser-chunks.mjs`:

| Production application graph | Chunks | Minified bytes | Gzip bytes |
| ---------------------------- | -----: | -------------: | ---------: |
| Initial static closure       |      3 |        639,028 |    160,232 |
| Lazy Turtle closure          |      3 |        187,063 |     52,570 |

The verifier follows static imports from `deploy/js/index.js`, proves the N3
lexer/parser marker is absent from that entire closure, follows the literal
dynamic Turtle import, and proves the marker is present in its lazy closure.
The lazy total includes the 1,081-byte shared Rolldown runtime in both graph
closures; the dedicated N3 implementation chunk is 185,923 minified bytes.
Stale files are harmless because the verifier follows only reachable imports
rather than scanning the non-empty `deploy` directory as if every file shipped
in the initial graph.

### Same-runtime regression controls

The pre-Phase-9 revision was measured from an exact `git archive` on the same
Node 24.19.0 runtime and machine. This is required because the absolute VOWL
heap profile on Node 24.19.0 differs materially from the accepted Phase 8 Node
24.17.0 record even when running unchanged code. The paired control proves that
runtime shift is not a Phase 9 regression.

| Existing signal                             |   Pre-Phase-9 wall / heap delta |       Phase 9 wall / heap delta | Wall change | Heap-delta change |
| ------------------------------------------- | ------------------------------: | ------------------------------: | ----------: | ----------------: |
| `generated-functional-large`                |   455.58 ms / 121,203,296 bytes |   458.18 ms / 117,898,880 bytes |      +0.57% |            -2.73% |
| `generated-functional-depth`                |    146.88 ms / 49,578,248 bytes |    145.43 ms / 49,594,504 bytes |      -0.99% |            +0.03% |
| Functional mismatch                         |          6.49 ms / 32,056 bytes |          6.61 ms / 37,288 bytes |      +1.84% |           +16.32% |
| `generated-manchester-large`                |   498.08 ms / 128,169,952 bytes |   485.74 ms / 135,745,640 bytes |      -2.48% |            +5.91% |
| Manchester mismatch                         |          6.66 ms / 34,512 bytes |          6.71 ms / 38,888 bytes |      +0.73% |           +12.68% |
| RDF/XML first use                           |      33.96 ms / 8,642,448 bytes |      33.09 ms / 8,381,576 bytes |      -2.54% |            -3.02% |
| `generated-rdfxml-large.syntax-to-rdf`      |    303.41 ms / 92,765,488 bytes |    306.08 ms / 92,788,712 bytes |      +0.88% |            +0.03% |
| `generated-rdfxml-large.end-to-end`         | 1,758.88 ms / 342,136,928 bytes | 1,759.89 ms / 340,838,104 bytes |      +0.06% |            -0.38% |
| VOWL production first use                   |     34.36 ms / 10,578,360 bytes |     34.54 ms / 10,577,672 bytes |      +0.51% |            -0.01% |
| `generated-vowl-classes-large.builder-only` |    140.83 ms / 74,207,760 bytes |    145.29 ms / 74,207,296 bytes |      +3.17% |             0.00% |
| `generated-rdfxml-large.owlapi-to-vowl`     | 2,405.42 ms / 575,594,400 bytes | 2,408.08 ms / 574,673,288 bytes |      +0.11% |            -0.16% |

Every relevant same-runtime wall-time and peak-heap-delta change is within the
unchanged 20% threshold. No resource ceiling, release threshold, or accepted
earlier baseline was re-anchored.

## Phase 10 DL Syntax baseline

- Pre-Phase-10 revision:
  `0a0a57bb6d76cc3e48a89b716c91511164f7c674`.
- Measurement date: 21 August 2026.
- Environment: Windows `10.0.26200` x64, Node.js `v24.19.0`, 12th Gen
  Intel Core i9-12900K (24 logical CPUs), 34,053,869,568 bytes system memory.
- Dependency identity: `package-lock.json` SHA-256
  `bbd8a2a632a5b3aa4a9d0c182d7b3176e1c540d5d6bdd47e170c52d7737f93a5`.
- Command: `node --expose-gc util/benchmark-owlapi-dl.mjs`.
- Protocol: generator `owlapi-benchmark-corpus-v1`; one warm-up and five
  measured runs; median aggregation; garbage collection requested before each
  run; heap sampled every 5 ms. The accepted run passed the idle-machine guard.

The large fixture contains 50,000 DL subclass axioms. The depth fixture
contains 256 nested quantified restrictions and reaches 512 governed expression
levels when both the restriction and its filler are counted.

| New Phase 10 signal  | Median wall time (ms) | Median peak heap delta (bytes) |
| -------------------- | --------------------: | -----------------------------: |
| `generated-dl-large` |              1,934.59 |                    207,904,776 |
| `generated-dl-depth` |                 76.03 |                     26,372,760 |

These are the first accepted DL Syntax throughput and depth signals, so no
earlier DL baseline exists for threshold comparison. The parser cooperatively
yields during the 50,000-axiom run, which produces wider individual wall-time
samples than the non-yielding depth case. Three independent idle-guarded runs
produced large-fixture medians of 1,824.99, 1,790.49, and 1,934.59 ms; the
largest difference between accepted medians is 8.05%, below the unchanged 20%
threshold. The latest complete paired run above is the accepted baseline.

### Same-revision registry controls

The current lockfile identity differs from the accepted Phase 9 document, so
historical absolute mismatch medians are not treated as a Phase 10 comparison.
Instead, the Phase 10 benchmark constructs two registries in the same process:
the Phase 9 descriptor list and the same list with DL registered in production
order. Both sides use the current source revision, runtime, dependency tree,
fixtures, sampling protocol, and process. The only controlled difference is the
DL descriptor.

| Existing signal              | Phase 9 registry wall / heap delta | Phase 10 registry wall / heap delta | Wall change | Heap-delta change |
| ---------------------------- | ---------------------------------: | ----------------------------------: | ----------: | ----------------: |
| `generated-functional-large` |    1,084.86 ms / 125,975,024 bytes |     1,094.62 ms / 126,539,728 bytes |      +0.90% |            +0.45% |
| `generated-functional-depth` |       337.46 ms / 49,561,384 bytes |        335.03 ms / 49,578,736 bytes |      -0.72% |            +0.04% |
| `generated-mismatch-large`   |             9.87 ms / 33,656 bytes |             11.16 ms / 34,824 bytes |     +13.10% |            +3.47% |

Every paired wall-time and peak-heap-delta change is within the unchanged 20%
release threshold. The mismatch input is 16 MiB of unrelated text and therefore
also proves that registering DL preserves bounded detection. Phase 10 changes no
resource ceiling, accepted earlier baseline, or regression threshold.

## Phase 11 KRSS2 baseline

- Pre-Phase-11 revision:
  `5ec5ccf6` (`refactor(build): Modernize ZIP utility as native ESM`).
- Measurement date: 21 August 2026.
- Environment: Windows `10.0.26200` x64, Node.js `v24.19.0`, 12th Gen
  Intel Core i9-12900K (24 logical CPUs), 34,053,869,568 bytes system memory.
- Dependency identity: `package-lock.json` SHA-256
  `bbd8a2a632a5b3aa4a9d0c182d7b3176e1c540d5d6bdd47e170c52d7737f93a5`.
- Command: `node --expose-gc util/benchmark-owlapi-krss2.mjs`.
- Protocol: generator `owlapi-benchmark-corpus-v1`; one warm-up and five
  measured runs; median aggregation; garbage collection requested before each
  run; heap sampled every 5 ms. The accepted run passed the idle-machine guard.

The large fixture contains 50,000 KRSS2 implication axioms. The depth fixture
contains 256 nested existential restrictions.

| New Phase 11 signal     | Median wall time (ms) | Median peak heap delta (bytes) |
| ----------------------- | --------------------: | -----------------------------: |
| `generated-krss2-large` |                820.87 |                    212,404,960 |
| `generated-krss2-depth` |                 75.19 |                     21,017,296 |

These are the first accepted KRSS2 throughput and depth signals, so no earlier
KRSS2 baseline exists for threshold comparison. The large run also exercises
cooperative scheduling over sustained input; the separate resource suite proves
that cancellation interrupts that work before all 50,000 axioms are built.

### Same-revision registry controls

The Phase 11 benchmark constructs the Phase 10 descriptor list and the same
list with KRSS2 inserted at production priority 16. Both sides use the current
source revision, runtime, dependency tree, generated fixtures, sampling
protocol, and process; the KRSS2 descriptor is the only controlled difference.

| Existing signal              | Phase 10 registry wall / heap delta | Phase 11 registry wall / heap delta | Wall change | Heap-delta change |
| ---------------------------- | ----------------------------------: | ----------------------------------: | ----------: | ----------------: |
| `generated-functional-large` |     1,107.03 ms / 137,390,056 bytes |       496.48 ms / 128,497,136 bytes |     -55.15% |            -6.47% |
| `generated-functional-depth` |        152.54 ms / 49,565,824 bytes |        152.96 ms / 49,579,072 bytes |      +0.28% |            +0.03% |
| `generated-mismatch-large`   |              7.31 ms / 34,408 bytes |              7.38 ms / 35,456 bytes |      +0.85% |            +3.05% |

Every paired regression is within the unchanged 20% release threshold. The
16 MiB unrelated-text control also confirms that adding KRSS2 retains bounded
detection. Phase 11 changes no resource ceiling, historical baseline, or
regression threshold.

## Phase 12 strict N-Triples baseline

- Pre-Phase-12 revision: `f94bd057`, the signed Phase 11 checkpoint.
- Measurement date: 22 August 2026.
- Environment: Windows `10.0.26200` x64, Node.js `v24.19.0`, 12th Gen
  Intel Core i9-12900K (24 logical CPUs), 34,053,869,568 bytes system memory.
- Dependency identity: `package-lock.json` SHA-256
  `bbd8a2a632a5b3aa4a9d0c182d7b3176e1c540d5d6bdd47e170c52d7737f93a5`.
- Command: `node --expose-gc util/benchmark-owlapi-ntriples.mjs`.
- Protocol: generator `owlapi-benchmark-corpus-v1`; one warm-up and five
  measured runs; median aggregation; garbage collection requested before each
  run; heap and event-loop responsiveness sampled every 5 ms. The accepted run
  passed the idle-machine guard.

The new fixture contains 50,000 N-Triples statements in 6,588,889 bytes.
Syntax-only measurements end at the canonical RDF/JS dataset boundary; the
end-to-end measurement continues through parser selection, forced default-graph
normalization, shared RDF-to-OWL reconstruction, and ontology publication.

| Signal                                                | Chunk bytes | Median wall (ms) | Median peak-heap delta (bytes) | Median max event-loop delay (ms) |
| ----------------------------------------------------- | ----------: | ---------------: | -----------------------------: | -------------------------------: |
| N-Triples first use, 100 declarations                 |      65,536 |            33.09 |                      4,414,880 |                            11.10 |
| `generated-ntriples-large.syntax-to-rdf.chunk-16384`  |      16,384 |         6,590.69 |                    129,383,936 |                            20.71 |
| `generated-ntriples-large.syntax-to-rdf.chunk-65536`  |      65,536 |         1,134.20 |                    158,772,064 |                            20.15 |
| `generated-ntriples-large.syntax-to-rdf.chunk-262144` |     262,144 |           803.45 |                    180,237,856 |                            35.00 |
| `generated-ntriples-large.end-to-end`                 |      65,536 |         2,296.51 |                    315,912,328 |                         1,127.70 |

The retained 65,536-byte default keeps the measured syntax-adapter scheduling
interval at 20.15 ms and avoids the 21.5 MiB additional peak-heap delta of the
256 KiB path. The 16 KiB path has substantially lower throughput for this
line-oriented implementation. No chunk size or resource limit changes.

As in the Phase 9 Turtle baseline, the end-to-end event-loop delay is not an
adapter scheduling result. The syntax-only path stays at 20.15 ms, while the
shared RDF-to-OWL publication step produces a 1,127.70 ms interval, consistent
with Turtle's accepted 1,133.96 ms interval for the same 50,000-axiom shape.
Phase 12 therefore records the existing shared cost without weakening the
adapter's bounded input and cooperative-yield contract.

### Same-revision registry controls

The benchmark constructs the Phase 11 descriptor list and the same list with
N-Triples inserted at production priority 24. Both sides use the current source
revision, runtime, dependency tree, generated fixtures, sampling protocol, and
process; the N-Triples descriptor is the only controlled difference.

| Existing signal              | Phase 11 registry wall / heap delta | Phase 12 registry wall / heap delta | Wall change | Heap-delta change |
| ---------------------------- | ----------------------------------: | ----------------------------------: | ----------: | ----------------: |
| `generated-functional-large` |       468.93 ms / 130,666,360 bytes |       467.56 ms / 134,002,760 bytes |      -0.29% |            +2.55% |
| `generated-mismatch-large`   |             13.17 ms / 35,760 bytes |             13.99 ms / 39,608 bytes |      +6.22% |           +10.76% |

Every paired regression is within the unchanged 20% release threshold. The
16 MiB unrelated-text control also confirms that adding N-Triples retains
bounded detection. Phase 12 changes no dependency, resource ceiling,
historical baseline, or regression threshold.

### Production application graph

The Phase 12 production build and static-import-closure verifier measure the
shared lazy implementation after both exact RDF syntax descriptors are
registered:

| Production application graph | Chunks | Minified bytes | Gzip bytes |
| ---------------------------- | -----: | -------------: | ---------: |
| Initial static closure       |      3 |        669,223 |    168,905 |
| Lazy RDF-syntax closure      |      3 |        187,021 |     52,560 |

Relative to the accepted Phase 9 production graph, the initial closure is
30,195 minified bytes (+4.72%) and 8,673 gzip bytes (+5.41%) larger, both within
the unchanged 20% threshold. The lazy N3.js closure is effectively unchanged.
The verifier proves the implementation marker remains absent from every
statically reachable initial chunk and present only behind the shared dynamic
RDF-syntax boundary.

## Phase 13 strict N-Quads and dataset-policy baseline

- Pre-Phase-13 revision: `f83a02f7`, the signed Phase 12 checkpoint.
- Measurement date: 22 August 2026.
- Environment: Windows `10.0.26200` x64, Node.js `v24.19.0`, 12th Gen
  Intel Core i9-12900K (24 logical CPUs), 34,053,869,568 bytes system memory.
- Dependency identity: `package-lock.json` SHA-256
  `bbd8a2a632a5b3aa4a9d0c182d7b3176e1c540d5d6bdd47e170c52d7737f93a5`.
- Command: `node --expose-gc util/benchmark-owlapi-nquads.mjs`.
- Protocol: generator `owlapi-benchmark-corpus-v1`; one warm-up and five
  measured runs; median aggregation; garbage collection requested before each
  run; heap and event-loop responsiveness sampled every 5 ms. The accepted run
  passed the idle-machine guard.

The fixture contains 50,000 N-Quads statements in 8,438,889 bytes, all in one
named graph. Syntax-only measurements stop before graph selection. The
end-to-end measurement continues through `requireSingleGraph`, projection to an
RDF graph, shared RDF-to-OWL reconstruction, and ontology publication.

| Signal                                              | Chunk bytes | Median wall (ms) | Median peak-heap delta (bytes) | Median max event-loop delay (ms) |
| --------------------------------------------------- | ----------: | ---------------: | -----------------------------: | -------------------------------: |
| N-Quads first use, 100 declarations                 |      65,536 |            34.49 |                      9,964,456 |                            10.97 |
| `generated-nquads-large.syntax-to-rdf.chunk-16384`  |      16,384 |         8,518.53 |                    137,002,728 |                            22.24 |
| `generated-nquads-large.syntax-to-rdf.chunk-65536`  |      65,536 |         1,532.72 |                    172,021,088 |                            18.42 |
| `generated-nquads-large.syntax-to-rdf.chunk-262144` |     262,144 |           771.80 |                    174,522,360 |                            30.93 |
| `generated-nquads-large.end-to-end`                 |      65,536 |         2,595.56 |                    341,051,512 |                         1,114.51 |

The retained 65,536-byte default keeps syntax-adapter scheduling at 18.42 ms
and avoids the 2,501,272-byte additional peak-heap delta of the 256 KiB path.
The 16 KiB path again has substantially lower throughput for line-oriented
N3.js parsing. Phase 13 therefore changes no chunk size or resource ceiling.

The end-to-end scheduling interval belongs to the existing synchronous
RDF-to-OWL publication seam rather than the adapter: syntax-to-RDF stays at
18.42 ms, while graph selection plus OWL reconstruction add approximately
1,062.84 ms and the sampled interval is 1,114.51 ms. This is consistent with
the accepted Turtle and N-Triples publication cost and does not weaken the
adapter's cooperative-yield contract.

### Same-revision registry controls

The benchmark compares the Phase 12 descriptor list with the same list plus
N-Quads at production priority 23. Both sides use the current source revision,
runtime, dependency tree, fixtures, sampling protocol, and process; descriptor
registration is the only controlled difference.

| Existing signal              | Phase 12 registry wall / heap delta | Phase 13 registry wall / heap delta | Wall change | Heap-delta change |
| ---------------------------- | ----------------------------------: | ----------------------------------: | ----------: | ----------------: |
| `generated-functional-large` |       455.30 ms / 122,493,440 bytes |       457.11 ms / 121,593,592 bytes |      +0.40% |            -0.73% |
| `generated-mismatch-large`   |             14.27 ms / 35,792 bytes |             13.96 ms / 41,328 bytes |      -2.16% |           +15.47% |

Every paired regression is within the unchanged 20% release threshold. The
16 MiB unrelated-text control also confirms that adding N-Quads retains
bounded detection. Phase 13 introduces no dependency, resource-ceiling,
historical-baseline, or regression-threshold change.

### Production application graph

The Phase 13 production build and static-import-closure verifier measure the
shared lazy implementation after all three completed exact N3.js-backed RDF
syntax descriptors are registered:

| Production application graph | Chunks | Minified bytes | Gzip bytes |
| ---------------------------- | -----: | -------------: | ---------: |
| Initial static closure       |      3 |        671,383 |    169,339 |
| Lazy RDF-syntax closure      |      3 |        187,021 |     52,560 |

Relative to Phase 12, the initial closure grows by 2,160 minified bytes
(0.32%) and 434 gzip bytes (0.26%), while the lazy N3.js closure is
byte-identical. Both changes remain below the unchanged 20% threshold. The
verifier proves the implementation marker remains absent from the initial
static closure and present only behind the shared dynamic RDF-syntax boundary.
