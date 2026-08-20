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
|     8 | Production WebVOWL cutover                                         | Gate met    | PASS: 116/1439 full; 33/33 differential; lint/format/build green |
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

Active ingestion migration: Phase 8 passes its gate and awaits the repository
owner's checkpoint commit. The WIP lock remains held until then.

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

The differential gate that blocked Phase 8 is now met.
`src/owl2vowl/test/productionDifferential.test.js` runs the production path -
`loadWithImports`, the entry `src/app/js/loadingModule.js` calls - over the 33
non-Turtle corpus documents and compares each against the pinned OWL2VOWL 0.3.7
reference output on ten dimensions. The existing 44-fixture suite in
`src/owl2vowl/test/differential.test.js` is retained unchanged as the historical
baseline; it runs the retained legacy pipeline through `legacyPipeline.js`, so
it measures the engine that was replaced and satisfied section 18.8 only while
the legacy pipeline was the architecture.

Every remaining difference is justified per dimension in
`docs/owlapi-js/compatibility/production-corpus-differences.json`, and a
justification for a dimension that no longer differs fails the suite rather than
lingering as a false record. The largest recorded class is the oracle
substituting `owl:Thing` for a domain or range the document states, which VOWL 2
permits only where no such axiom exists or where the author named `owl:Thing`
themselves.

Loading acceptance and differential acceptance are distinct claims. The corpus
gate proves every advertised document is accepted; only the differential proves
the output resembles what users saw under WebVOWL v1.1.7.

## Deferred to after Phase 8

**Regenerating the reference fixtures against this corpus.** The 46 pinned
OWL2VOWL outputs were produced by running the jar against local files with
whatever network access that run had, so each document's import closure then and
now can differ in either direction. Where they do, every difference in that
document is uninterpretable: the two sides converted different ontologies.
`prov.owl` shows how far this goes — its fixture contains entity IRIs beginning
`file:/C:/Users/...`, the generating machine's own path.

Seven documents are excluded from the corpus differential for this reason,
listed in `src/owl2vowl/test/productionDifferential.test.js`. Exclusion is the
honest treatment, because a governed difference records a difference in
_conversion_ and this is a difference in _input_ — but it costs real coverage.

The fix is to regenerate the fixtures with the same pinned 0.3.7 jar over the
same local documents this harness serves, so both sides see identical inputs by
construction. The oracle version does not change; only its inputs align. That
requires pointing OWLAPI at local copies through a catalog file or OWL2VOWL's
`necessaryExternals` parameter, and it moves the baseline underneath the legacy
differential's 44-entry register, which would need re-validating. It was
deferred because doing it while the corpus register is being built would make it
impossible to attribute a change to a fix rather than to the regeneration.

The detection criterion currently in use — comparing the namespace sets each
side emitted entities from — catches a namespace missing altogether but not
partial coverage of one, so some closure divergence probably survives it.
Regeneration removes the whole class and would let all seven documents back in.

That suspicion was borne out. `imarinetlo.owl` emits 27 entities in the
`MarineTLO` namespace against the oracle's 18 — partial coverage of a namespace
both sides have, which is exactly what the criterion cannot see. It was
diagnosed by reading the document rather than by the criterion, and its
differences proved attributable to conversion after all, so it is registered
rather than excluded.

**One fixture was regenerated, and it is not an exception to this deferral.**
`skos.rdf.java.json` was regenerated against the same pinned 0.3.7 jar after the
repository owner replaced the corpus's `skos.rdf` with the canonical document it
advertises. The deferral above concerns aligning *import closures* across all 46
fixtures, which changes what the oracle converted; this concerns one document
whose own bytes changed, where leaving the fixture alone would have described a
file the corpus no longer contains. `skos.rdf` declares no imports, so its
conversion is a pure function of a local file and a pinned jar and needed no
catalog. `ontology_v3.3.rdf` was deliberately left alone for the opposite
reason, and a scratch regeneration confirmed it differs from its committed
fixture in nothing. Finding `M8-010` records the episode.

**Decomposing the VOWL conversion.** The repository owner raised whether
`VOWLBuilder` should become a structured `owl2vowl-js`, mirroring the treatment
given to `owlapi-js`. Two separable questions came out of it, and the decision
was to revisit both once this phase closes.

The **decomposition** is well motivated. OWL2VOWL splits the conversion across
named components, and nearly every difference resolved during this phase maps
onto one of them: `ImportedChecker` for the external marker, `BaseIriCollector`
for base-IRI ordering, `AnnotationParser` for annotation identifiers,
`TypeSetter` for node types, `DomainRangeFiller` for domain and range
defaulting. That structure exists in our single module whether or not it is
named, and leaving it unnamed cost real diagnosis time.

**API compatibility with OWL2VOWL** is the weaker half, and does not carry over
from the `owlapi-js` case. OWLAPI is a library with an ecosystem that programs
against its API; OWL2VOWL is a tool whose entire consumable surface is a source
in and VOWL-JSON out, reached over HTTP by WebVOWL. The project already matches
that surface, so mirroring the Java class layout would mostly reproduce another
project's internal structure — which is also the part that would move
`VOWLBuilder` away from `A_PROJECT_ORIGINAL` under section 22.2.1.

The **timing** decided it. The corpus differential is the only instrument
measuring VOWL correctness, and restructuring the component it measures while
that gate is red would make it impossible to attribute a change to a fix rather
than to the refactor. Refactor against a green gate, not a red one.

Until then, each difference closed should record which component it would belong
to, so the eventual decomposition follows evidence rather than a guess.

**Displaying nested annotations in the sidebar.** ADR 0007 nests an axiom's
annotations on the annotation they describe, so `dcterms:source` on a definition
now sits inside that definition's item rather than on the entity. Across the
three corpus documents that use `owl:Axiom` reification, 358 annotations carry
nested ones.

`src/app/js/sidebar.js` renders the entity's `annotations` map and knows nothing
of the nested key, so this information is carried in the VOWL-JSON but not yet
shown. That is deliberate and is not a regression: before the change these
annotations did not survive parsing at all, so nothing that was previously
visible has been lost.

The rendering belongs to the UI and UX workstream rather than to this migration,
which is why it is recorded here rather than done. What it needs is a way to
show an annotation's own annotations without crowding the entity's list -
plausibly a disclosure beneath the annotation value, since a definition with a
source is the common case and a reader wants the source only when asking where
the wording came from.

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
