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
