# Migration status

Baseline revision: `5301d6c0b9e69c048f6ab079ea1103790bc70b85`

| Phase | Scope                                                              | State       | Gate                                                          |
| ----: | ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------- |
|     0 | Governance, capability, provenance, conformance, budgets, baseline | Complete    | PASS: artifacts validated; full tests/lint/format/build green |
|     1 | Structural core and construction seams                             | Not started | ready after the Phase 0 checkpoint commit                     |
|     2 | Functional Syntax                                                  | Not started | blocked by Phase 1                                            |
|     3 | Manchester Syntax                                                  | Not started | blocked by Phase 2 learning gate                              |
|     4 | OWL/XML                                                            | Not started | blocked by Phase 3 learning gate                              |
|     5 | DL Syntax                                                          | Not started | blocked by Phase 4 learning gate                              |
|     6 | KRSS family                                                        | Not started | blocked by Phase 5 learning gate                              |
|     7 | RDF/JS and N3.js RDF formats                                       | Not started | blocked by Phase 6 learning gate                              |
|     8 | RDF-to-OWL hardening                                               | Not started | blocked by Phase 7 learning gate                              |
|     9 | RDF/XML                                                            | Not started | blocked by Phase 8 learning gate                              |
|    10 | JSON-LD                                                            | Not started | blocked by Phase 9 learning gate                              |
|    11 | OWL-to-RDF                                                         | Not started | blocked by ingestion programme                                |
|    12 | VOWLBuilder cutover                                                | Not started | blocked by Phase 11                                           |
|    13 | Legacy interchange removal                                         | Not started | blocked by parity acceptance                                  |
|    14 | Package/release                                                    | Not started | blocked by all prior gates                                    |

Active ingestion migration: none. The WIP lock is clear. Phase 0 completed on
10 August 2026; Phase 1 begins only after the requested Git checkpoint.
