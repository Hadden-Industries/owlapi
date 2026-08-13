# Migration status

Baseline revision: `5301d6c0b9e69c048f6ab079ea1103790bc70b85`

| Phase | Scope                                                              | State       | Gate                                                          |
| ----: | ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------- |
|     0 | Governance, capability, provenance, conformance, budgets, baseline | Complete    | PASS: artifacts validated; full tests/lint/format/build green |
|     1 | Structural core and construction seams                             | Complete    | PASS: 9/78 focused; 57/476 full; lint/format/build green      |
|     2 | Functional Syntax                                                  | Complete    | PASS: 4/65 focused; 61/541 full; lint/format/build green      |
|     3 | Manchester Syntax                                                  | Complete    | PASS: 4/22 focused; 65/564 full; lint/format/build green      |
|     4 | OWL/XML                                                            | Complete    | PASS: 5/45 focused; 70/609 full; lint/format/build green      |
|     5 | Canonical RDF ingestion and shared RDF-to-OWL reconstruction       | Complete    | PASS: 7/363 focused; 77/970 full; 312/312 W3C RDF documents   |
|     6 | RDF/XML and first-real-adapter hardening                           | Complete    | PASS: 6/201 focused; 84/1178 full; 166/166 W3C RDF/XML        |
|     7 | Early development-app integration                                  | Not started | blocked by Phase 6 learning gate                              |
|     8 | Production WebVOWL cutover                                         | Not started | blocked by Phase 7 acceptance gate                            |
|     9 | Private N3.js adapter foundation and strict Turtle                 | Not started | blocked by Phase 8 cutover gate                               |
|    10 | DL Syntax                                                          | Not started | blocked by Phase 9 learning gate                              |
|    11 | KRSS family                                                        | Not started | blocked by Phase 10 learning gate                             |
|    12 | N-Triples                                                          | Not started | blocked by Phase 11 learning gate                             |
|    13 | N-Quads                                                            | Not started | blocked by Phase 12 learning gate                             |
|    14 | TriG                                                               | Not started | blocked by Phase 13 learning gate                             |
|    15 | JSON-LD                                                            | Not started | blocked by Phase 14 learning gate                             |
|    16 | OWL-to-RDF                                                         | Not started | blocked by ingestion programme                                |
|    17 | Physical legacy deletion                                           | Not started | blocked by Phase 16 and retained-reference audit              |
|    18 | Package/release                                                    | Not started | blocked by all prior gates                                    |

Active ingestion migration: Phase 6 is complete at its requested checkpoint;
the WIP lock remains held. Phase 1 was committed as `3c1994a`; Phase 2 as
`6be7059`; Phase 3 as `4e118d5`; Phase 4 as `ddd7af0`; and Phase 5 as `86f1602`.
ADR 0002 and plan checkpoint `b71bbc2` record the approved future-phase
reorder. Phase 7 remains inactive until the repository owner commits the Phase
6 checkpoint and explicitly instructs the implementation to proceed.
