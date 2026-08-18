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
|     8 | Production WebVOWL cutover                                         | In progress | blocked: no production corpus differential; see `M8-006`      |
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

Active ingestion migration: Phase 8 is in progress and does not pass its gate.
The WIP lock remains held.

The structural cutover itself is in place. WebVOWL ingests ontologies only
through `owlapi-js`, the production graph reaches no retained legacy parser,
converter or exporter, and a legacy-only syntax such as Turtle fails with the
canonical unsupported-format diagnostics, including when discovered inside an
import closure. The legacy modules remain unmoved for characterization until
the Phase 17 deletion.

Real-corpus loading is now green. Finding `M8-006` records that the cutover
first shipped with only 8 of 29 real RDF/XML-family ontologies loading, and that
a full suite stayed green throughout because no gate measured real documents.
`src/owl2vowl/test/productionCorpus.test.js` is that gate, and all 44 advertised
documents now load through the production entry. Its acceptance set is the
pinned OWL2VOWL reference outputs under
`src/owl2vowl/test/fixtures/java-reference-outputs/`: every source the oracle
converted successfully must load through the production entry.

Phase 8 is nevertheless blocked, on a different gate. Section 18.8 defines the
corpus differential as Java reference output compared against WebVOWL output
"through new architecture", and section 17.15 requires production differential
acceptance before the Phase 8 checkpoint. The existing 44-fixture suite in
`src/owl2vowl/test/differential.test.js` runs the retained legacy pipeline
through `legacyPipeline.js`, so it measures the engine that was replaced. It
satisfied section 18.8 only while the legacy pipeline was the architecture.
Phase 8 closes when an equivalent differential runs the production path, with
every difference from the pinned oracle individually justified.

Loading acceptance and differential acceptance are distinct claims. The corpus
gate proves every advertised document is accepted; it does not prove the output
matches what users saw under WebVOWL v1.1.7.

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
`7590c17` and Phase 7 as `27dba50`. The two commit-bounded reuse boundaries in
`provenance/provenance.json` were re-anchored during Phase 7 to the rewritten
commits carrying byte-identical content, and `governance.test.js` now fails if
any recorded reuse-boundary revision stops being an ancestor of `HEAD`.
