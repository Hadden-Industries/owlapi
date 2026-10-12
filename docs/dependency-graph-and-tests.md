# Dependency graphs and architecture

Run `npm run verify:architecture` to check every JavaScript module admitted by the native npm package inventory.
The same check runs in the existing Jest architecture suite.
It rejects unresolved imports, imports escaping the repository, imports into unshipped first-party files, and packages available only as development dependencies.
A separate lexical check preserves the library's domain isolation, including comments and strings.
Cycles are warnings; an existing warning is not an exemption from other rules.

## Generate an observation bundle

```powershell
npm run graph:dependencies -- --output C:\external\new-graph-directory
```

The parent directory must already exist.
The output directory must be new and outside the checkout, including through aliases.
Existing output is never overwritten.
A bundle is complete only when `manifest.json` declares completion and its member digests match.
`incomplete.json` records the initial reservation; an interrupted attempt without a completion manifest remains incomplete.

The bundle contains native `dependencies.json`, `runtime-dependencies.json`, module and folder Mermaid views, and `inventory.json`.
The full JSON is the graph authority; collapsed views summarize it.
The inventory includes disconnected authored modules, native Jest discovery, npm pack membership, effective runtime rules, and explicit excluded archive/generated domains.
Source hashes, Git identity and status, tool versions, resolver conditions and member digests bind the observation.
Input changes during extraction fail the attempt.
No persistent graph cache or tracked graph snapshot is used.

The graph uses dependency-cruiser 18.6 or later at the exact root lockfile resolution.
It resolves Node source imports and package exports.
Builtins and external packages remain endpoints without scanning their implementations.
Computed imports, runtime resource reads, generated programs, workers and subprocess inputs are outside proven static completeness.
This is a Node source graph; browser and installed candidate behavior need their dedicated checks.

## Test selection and assurance

Use Jest's native inventory and advisory related-test discovery:

```powershell
npm test -- --runInBand --listTests --json
npm test -- --runInBand --findRelatedTests model/owlOntologyWriterConfiguration.js --listTests --json
```

A related-test list is a hypothesis about static dependencies.
It does not establish that resource readers, removed edges, structural changes, browser consumers or installed-package behavior are covered.
Run the established full commands for authoritative source qualification:

```powershell
npm test -- --runInBand --silent
npm run test:boundary
npm run test:markdown
```

Existing lint, formatting, release gates, workflow governance, browser, installed-consumer, hosted CI and release qualification retain their own scope and prerequisites.
Graph output and related-test lists have their stated advisory scope.
The existing HISEW profiles and required CI jobs remain unchanged.
Selective execution is conditional on the accepted implementation plan's correctness, measurement and process-cleanup gates; this delivery does not activate it.

## Adoption decision on 12 October 2026

The [implementation plan](plans/2026-10-12-dependency-cruiser-implementation-plan.md) was accepted for implementation through HISEW.
The first signed checkpoint includes the plan and graph/architecture delivery.
The runtime baseline contains 143 shipped JavaScript modules, with no error-level violations and one existing cycle warning between `internal/model/sourceEvidence.js` and `model/owlOntology.js`.
The authored baseline contains 546 JavaScript roots and 238 native Jest suites.
Its 58 unresolved edges include consumer preparation templates whose relative imports and installed package alias exist only after preparation; these remain visible in the observation graph and do not relax runtime enforcement.

The native selection experiment exercised clean, dirty, staged, partially staged, committed, renamed, deleted and diverged Git cases in an isolated synthetic repository, using explicit comparison identities.
Literal imports selected their consuming test.
A changed resource read through `readFileSync(new URL(...))` selected no tests with Jest's related or SCM modes, and its reader was absent from native graph impact output.
An independently executed full synthetic suite failed that seeded reader.
Deleted-source related discovery also returned an empty list while its current consumer remained in the full inventory.
Empty lists therefore cannot establish successful verification.

Five repeated native list-only probes on Windows, Node 24.21.0 and Jest 30.5.2 produced the following results.
Times include native startup and discovery; they measure advisory listing, not test execution or savings against a full run.

| Changed input                             | Selected suites | Median list time | Observed range |
| ----------------------------------------- | --------------: | ---------------: | -------------: |
| `model/owlOntologyWriterConfiguration.js` |             147 |           279 ms |     273–320 ms |
| `internal/parsing/rdfxml/parser.js`       |             148 |           271 ms |     262–306 ms |
| `apibinding/owlManager.js`                |             114 |           270 ms |     262–293 ms |
| `io/io.test.js`                           |               1 |           263 ms |     262–269 ms |
| `package.json`                            |               0 |           264 ms |     262–329 ms |

The accepted outcome is **architecture delivered, selective execution declined**.
The correctness reproduction and the absence of a qualified descendant-cleanup owner prevent managed selective execution.
No local coordinator, impact-policy file, historical graph union or HISEW affected-profile migration is introduced.
Paired selected/full execution timing, outcome shadow admission and Linux/macOS process qualification were not pursued after these prerequisite gates failed; no speedup or cross-platform selective-execution claim is made.
Revisit the conditional slices only with an accepted policy for exceptional relations, supported process ownership and the plan's unchanged correctness and cost thresholds.
