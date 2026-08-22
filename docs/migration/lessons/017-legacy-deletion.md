# Phase 18 physical legacy deletion lesson record

## Migration identity

- Migration: Phase 18 - physical legacy deletion.
- Baseline revision: `f91ca99deeba3ebad422259ef5514f031477771d`, the
  signed Phase 17 checkpoint.
- Completion revision: the requested Phase 18 checkpoint commit containing
  this record; its ID is intentionally unknown at the review pause.
- Implementation date: 22 August 2026.
- Next phase: Phase 19 - standalone package/release.

## Implemented scope

Phase 18 physically removes the pre-cutover ingestion and VOWL conversion
stack. Sixteen implementation modules and their paired characterization tests
were deleted: the Functional, Manchester, OWL/XML, DL, KRSS2, Turtle and
JSON-LD parsers; the RDF/XML parser and serializer; import loader; IRI, XML and
DOM helpers; parser context; ontology converter; and JSON exporter. The
test-only `legacyPipeline.js` composition and its legacy JavaScript-to-Java
corpus differential were also deleted, for 34 files in total.

The production `index.js`, `VOWLBuilder`, `WebVowlImportResolver`, constants,
their current tests, the production corpus/differential utilities, and all
pinned Java OWL2VOWL fixtures remain. The two surviving focused differential
cases whose only oracle was the deleted JavaScript pipeline were removed; their
structural behavior remains covered directly by builder tests and the pinned
Java oracle.

The shared corpus helper now mirrors the production resolver's exact catalog
mapping rather than importing the retired loader and inheriting its basename
guess. `package.json` no longer carries a `test:legacy` command or a Jest ignore
for a nonexistent suite. The runner-scope fitness test now proves that every
active differential is discovered and dependency tests remain excluded.

## Acceptance evidence

| Gate | Result | Primary evidence |
| --- | --- | --- |
| Pre-deletion production baseline | 5 suites and 130 tests passed before any file was removed | production graph, builder architecture/differential, production corpus and production differential suites |
| Physical retirement RED/GREEN | The new gate failed for exactly 34 present paths, then passed 3/3 assertions after deletion | `src/productionGraph.architecture.test.js` |
| Post-deletion production acceptance | 5 suites and 129 tests passed with the current production entry and pinned oracle | production graph, builder architecture/differential, production corpus and production differential suites |
| Provenance lifecycle | 22/22 governance tests pass; deleted records remain auditable and current inventory contains only live modules | `docs/owlapi-js/provenance/provenance.json`; `src/owlapi-js/governance.test.js` |
| Runner scope | All active differential suites remain discoverable; `node_modules` remains excluded | `src/testRunnerScope.architecture.test.js` |
| Complete regression | 161/161 suites and 3,146/3,146 tests pass | `npm test -- --runInBand` |
| Static quality | Prettier, HTML validation, Stylelint and ESLint pass | `npm run format:check`; `npm run lint` |
| Production build | Vite production build passes and verifies copied D3; only the existing large-chunk advisory remains | `npm run build` |
| Lazy dependency closure | N3.js and jsonld.js remain outside the three-chunk initial closure and inside only their respective lazy closures | `node util/verify-webvowl-lazy-parser-chunks.mjs` |

## Findings and dispositions

| ID | Applicability | Primary disposition | Finding |
| --- | --- | --- | --- |
| `M18-001` | `CROSS_CUTTING`, `TESTING` | `TEST_OR_FITNESS_UPDATE` | A no-reachability gate cannot prove physical retirement. An explicit 34-path absence test was added and observed failing before deletion. |
| `M18-002` | `CROSS_CUTTING`, `TESTING` | `PLAYBOOK_UPDATE` | Delete legacy-only executable comparisons only after production-entry, direct structural and pinned foreign-oracle evidence independently covers the supported architecture. |
| `M18-003` | `PROVENANCE`, `CROSS_CUTTING` | `PLAYBOOK_UPDATE` | Deleting a governed file must not erase its origin or revision-bounded dispositions. Provenance needs a lifecycle dimension separate from reuse disposition. |
| `M18-004` | `API_COMPATIBILITY`, `TESTING` | `TEST_OR_FITNESS_UPDATE` | A test helper can retain an obsolete implementation dependency even when the production graph is clean; the corpus helper still imported the retired loader solely for catalog resolution. |
| `M18-005` | `CROSS_CUTTING`, `TESTING` | `TEST_OR_FITNESS_UPDATE` | A deleted exceptional suite requires simultaneous removal of its dedicated command, ignore rule and assertions that it remains discoverable; active-suite discovery must remain protected. |
| `M18-006` | `PERFORMANCE`, `CROSS_CUTTING` | `NO_CHANGE` | Files already absent from the production graph cannot change parser throughput or initial bundle composition merely by being deleted; full build and closure verification is the proportionate gate. |
| `M18-007` | `CROSS_CUTTING`, `PROVENANCE` | `TEST_OR_FITNESS_UPDATE` | Phase insertion must update both machine-readable capability metadata and its independent expected-order assertion; package release still carried the pre-KRSS1 Phase 18 number. |

## Provenance lifecycle decision

Schema v4 adds `artifactLifecyclePolicy` with `PRESENT` and `DELETED` states.
Absence of an explicit state means `PRESENT`, preserving compatibility for the
current inventory. Every retired record names Phase 18 and
`PHASE18-2026-08-22`; exact deleted paths must not exist at the working
revision. The approved `AT_REVISION` `REUSE_ALLOWED` and `AFTER_REVISION`
`REIMPLEMENT` rules for the RDF parser, Turtle parser and ontology converter
modules/tests remain unchanged and executable.

This lifecycle state does not change a file's provenance category or reuse
disposition. It records repository presence separately, so deletion cannot be
misrepresented as permission to reuse descendant implementation text and
historical audit evidence does not masquerade as the current source inventory.

## Performance and dependency impact

Phase 18 adds no dependency and changes no package lock, public runtime API,
resource ceiling, timeout, benchmark corpus or regression threshold. The
deleted modules were already outside the production import graph at the Phase 8
cutover. A parser-throughput benchmark would therefore measure unrelated host
variation rather than the deletion. The accepted production build and static
closure traversal instead prove that the live graph remains structurally
unchanged and that N3.js/jsonld.js remain lazy.

## Phase 19 handoff

Phase 19 may finalize package exports and release surfaces only after the
requested Phase 18 Git checkpoint. Packaging must expose the current
`owlapi-js` API directly and must not recreate a compatibility shim around any
deleted WebVOWL parser, RDF/XML bridge, converter or exporter. Browser/Node CI,
notices and licences, package dependency records, bundle analysis,
compatibility documentation and release acceptance remain Phase 19 work.

## Unresolved questions

There are no unresolved deletion-boundary, production-reachability, corpus,
provenance, runner-scope, dependency, resource, build, or lazy-closure blockers
and no unfinished `LOCAL_PHASE_FOLLOW_UP`.

## Mechanically reviewable completion summary

- Migration: Phase 18 physical legacy deletion.
- Lesson record: `docs/owlapi-js/migration/lessons/017-legacy-deletion.md`.
- Finding IDs: `M18-001` through `M18-007`; each has one primary disposition.
- Playbook changed: yes; the completed deletion method is institutionalized and
  Phase 19 becomes the next repository gate.
- Executable protections added or retained: exact physical absence, production
  reachability, live-vs-deleted provenance inventory, approved commit-bounded
  dispositions, active differential discovery, complete regression, lint,
  production build and lazy dependency closure.
- Normative-change proposals: none.
- Dependency, resource-budget or regression-threshold changes: none.
- Unresolved blockers: none.
- Next phase: Phase 19, blocked until the repository owner creates the requested
  Phase 18 checkpoint and explicitly instructs implementation to proceed.
