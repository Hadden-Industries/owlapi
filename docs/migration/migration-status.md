# Migration status

Baseline revision: `5301d6c0b9e69c048f6ab079ea1103790bc70b85`

| Phase | Scope                                                              | State       | Gate                                                             |
| ----: | ------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------- |
|     0 | Governance, capability, provenance, conformance, budgets, baseline | Complete    | PASS: artifacts validated; full tests/lint/format/build green    |
|     1 | Structural core and construction seams                             | Complete    | PASS: 9/78 focused; 57/476 full; lint/format/build green         |
|     2 | Functional Syntax                                                  | Complete    | PASS: 4/65 focused; 61/541 full; lint/format/build green         |
|     3 | Manchester Syntax                                                  | Complete    | PASS: 4/22 focused; 65/564 full; lint/format/build green         |
|     4 | OWL/XML                                                            | Complete    | PASS: 5/45 focused; 70/609 full; lint/format/build green         |
|     5 | Canonical RDF ingestion and shared RDF-to-OWL reconstruction       | Complete    | PASS: 7/363 focused; 77/970 full; 312/312 W3C RDF documents      |
|     6 | RDF/XML and first-real-adapter hardening                           | Complete    | PASS: 6/201 focused; 84/1178 full; 166/166 W3C RDF/XML           |
|     7 | Early development-app integration                                  | Complete    | PASS: 10/37 focused; 94/1218 full; lint/format/build green       |
|     8 | Production WebVOWL cutover                                         | Complete    | PASS: 116/1439 full; 33/33 differential; lint/format/build green |
|     9 | Private N3.js adapter foundation and strict Turtle                 | Complete    | PASS: 11/608 focused; 123/1893 full; 387/387 W3C Turtle          |
|    10 | DL Syntax                                                          | Complete    | PASS: 7/52 focused; 133/1964 full; Java snapshot 15/15 axioms    |
|    11 | KRSS family                                                        | Complete    | PASS: 8/55 focused; 142/2024 full; Java snapshot 12/12 axioms    |
|    12 | N-Triples                                                          | Complete    | PASS: 10/180 focused; 147/2147 full; 99/99 W3C N-Triples         |
|    13 | N-Quads                                                            | Complete    | PASS: 8/181 focused; 152/2286 full; 114/114 W3C N-Quads          |
|    14 | TriG                                                               | Not started | blocked by Phase 13 Git checkpoint                               |
|    15 | JSON-LD                                                            | Not started | blocked by Phase 14 learning gate                                |
|    16 | OWL-to-RDF                                                         | Not started | blocked by ingestion programme                                   |
|    17 | Physical legacy deletion                                           | Not started | blocked by Phase 16 and retained-reference audit                 |
|    18 | Package/release                                                    | Not started | blocked by all prior gates                                       |

Active ingestion migration: none. Phase 13 has passed its implementation,
learning, conformance, graph-policy, differential, resource, performance,
integration, and repository gates in the working tree and is paused for the
requested Git checkpoint. Phase 14 remains blocked until that checkpoint is
committed and the repository owner explicitly says to proceed.

The structural cutover itself is in place. WebVOWL ingests ontologies only
through `owlapi-js`, the production graph reaches no retained legacy parser,
converter or exporter, and Turtle, N-Triples, and N-Quads now succeed both
directly and when discovered inside an import closure. Functional Syntax,
Manchester Syntax, OWL/XML, RDF/XML, Turtle, DL Syntax, KRSS2, N-Triples, and
N-Quads are the advertised production formats; every other legacy-only syntax
still fails with canonical unsupported-format diagnostics. In particular,
KRSS1 retains a distinct format identity but no executable descriptor while
its parser capability is `DEFERRED`. The legacy modules remain unmoved for
characterization until the Phase 17 deletion.

N-Quads uses a third exact-format policy over the private N3.js boundary and
preserves graph terms in the canonical RDF/JS dataset. All four graph policies
operate on actual parsed input before RDF-to-OWL reconstruction; the selected
graph and merge decision are retained as immutable document context rather
than OWL semantics. Dataset-scoped blank-node identity is preserved until that
policy boundary. Its independent pinned W3C RDF 1.1/RDF 1.2 register is green
for all 114 entries: 60 positive and 54 negative. Bounded detection recognizes
only a decisive fourth-position graph term and does not weaken N-Triples or
Turtle. The same-revision Phase 12/Phase 13 registry benchmark remains within
the unchanged 20% threshold. Phase 13 adds no dependency, package, lockfile,
build-configuration, resource-ceiling, or legacy-production-reachability
change; it extends only the governed conformance and provenance registers.

N-Triples uses a distinct exact-format policy over the private N3.js boundary
introduced for Turtle. Its independent pinned W3C RDF 1.1/RDF 1.2 register is
green for all 99 entries, every accepted statement is normalized to the RDF/JS
default graph, and bounded detection rejects Turtle directives, XML markup, and
N-Quads graph labels. The shared RDF dataset publication seam removes duplicate
translation logic without sharing syntax identity or graph policy. The
same-revision Phase 11/Phase 12 registry benchmark remains within the unchanged
20% threshold. Phase 12 adds no dependency, package, lockfile, configuration,
resource-ceiling, or legacy-production-reachability change.

KRSS2 constructs structural objects directly through a dialect-neutral bounded
pull lexer and a strict KRSS2 parser. KRSS1 and KRSS2 remain separate
compatibility identities; shared/extension vocabulary tests and explicit
non-registration prevent KRSS2 from becoming a KRSS1 alias. The project-owned
12-axiom subset agrees exactly across KRSS2, DL, Functional, Manchester,
OWL/XML, RDF/XML, and Turtle, and its pinned OWLAPI 5.5.1 oracle agrees on every
axiom count and signature category. The same-revision Phase 10/Phase 11 registry
benchmark remains within the unchanged 20% threshold. Phase 11 adds no
dependency, package, lockfile, configuration, resource-ceiling, or
legacy-production-reachability change.

DL Syntax constructs structural objects directly through a bounded pull lexer
and parser. The shared project fixture agrees across DL, Functional, RDF/XML,
and Turtle on every non-declaration axiom and the complete signature; its pinned
OWLAPI 5.5.1 oracle snapshot contains the same 15 reachable axioms. Java parser
defects outside that shared subset are recorded as controlled corrections, not
expected-difference rules. The same-revision Phase 9/Phase 10 registry benchmark
keeps all existing Functional and mismatch signals within the unchanged 20%
threshold, and Phase 10 adds no dependency, package, configuration, resource
ceiling, or legacy-production reachability.

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
`loadWithImports`, the entry `src/app/js/loadingModule.js` calls - over 33
comparable corpus documents, now including Turtle, and compares each against
the pinned OWL2VOWL 0.3.7 reference output on ten dimensions. The existing
44-fixture suite in
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

Twelve documents are excluded from the corpus differential for this reason,
listed in `src/owl2vowl/test/productionDifferential.test.js`. Seven were
identified during Phase 8; Phase 9 added five Turtle/import-closure cases
covering missing version mappings, absent modular imports, and a historical
reference run that fetched a different version of the same namespace.
Exclusion is the
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
advertises. The deferral above concerns aligning _import closures_ across all 46
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
