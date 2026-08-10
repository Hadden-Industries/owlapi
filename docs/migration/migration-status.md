# Migration status

Baseline revision: `5301d6c0b9e69c048f6ab079ea1103790bc70b85`

| Phase | Scope                                                              | State       | Gate                                                          |
| ----: | ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------- |
|     0 | Governance, capability, provenance, conformance, budgets, baseline | Complete    | PASS: artifacts validated; full tests/lint/format/build green |
|     1 | Structural core and construction seams                             | Complete    | PASS: 9/78 focused; 57/476 full; lint/format/build green      |
|     2 | Functional Syntax                                                  | Complete    | PASS: 4/65 focused; 61/541 full; lint/format/build green      |
|     3 | Manchester Syntax                                                  | Not started | ready after the requested Phase 2 checkpoint commit           |
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

Active ingestion migration: none. The WIP lock is clear. Phase 1 was committed
as `3b4644f`. Phase 2 completed its Definition of Done and learning gate on
10 August 2026 and is awaiting the repository owner's requested Git checkpoint;
Phase 3 remains inactive until that checkpoint and an explicit instruction to
proceed.
