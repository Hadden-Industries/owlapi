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
npm test -- --runInBand --findRelatedTests model/iri.js --listTests --json
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
