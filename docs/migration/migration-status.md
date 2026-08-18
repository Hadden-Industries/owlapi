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
|     7 | Early development-app integration                                  | Complete    | PASS: 10/37 focused; 94/1218 full; lint/format/build green    |
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

Active ingestion migration: Phase 7 is complete at its requested checkpoint;
the WIP lock remains held. Phase 8 remains inactive until the repository owner
commits the Phase 7 checkpoint and explicitly instructs the implementation to
proceed.

Phase 7 closes with no deferred items. Finding `M7-008` initially recorded
`generated-rdfxml-large.end-to-end` as 85.75% above its accepted Phase 6
baseline; that measurement was taken while other work ran concurrently.
Remeasured on an idle machine, the same signal is 1.86% below the accepted
baseline, so no regression exists and no baseline was re-anchored. The finding
was rewritten as a benchmark-isolation lesson and its disposition changed from
`LOCAL_PHASE_FOLLOW_UP` to `PLAYBOOK_UPDATE`.

Recorded commit identifiers predating Phase 7 are not resolvable on the current
branch, which was rewritten after they were recorded; the Phase 1 through
Phase 5 identifiers in earlier records are historical. Phase 6 is committed as
`7590c17`. The two commit-bounded reuse boundaries in
`provenance/provenance.json` were re-anchored during Phase 7 to the rewritten
commits carrying byte-identical content, and `governance.test.js` now fails if
any recorded reuse-boundary revision stops being an ancestor of `HEAD`.
