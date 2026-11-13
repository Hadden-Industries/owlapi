# owlapi

Load an OWL 2 ontology in Node.js or a modern browser, then query its axioms through a JavaScript object model.
The library uses native ES modules and provides Java OWLAPI-style concepts alongside JavaScript I/O and RDF/JS integration.

[Install the library](#install) · [Load an ontology](#load-an-ontology) · [Browse the API](./API.md) · [Check Java compatibility](./docs/compatibility/java-api-surface.md)

## Release status

As of 9 November 2026, **0.1.0-rc.3** is the newest published release. npm's `next` and `latest` tags both select this prerelease.
[View the immutable GitHub release](https://github.com/Hadden-Industries/owlapi/releases/tag/v0.1.0-rc.3) or [see the changes since rc.3](./CHANGELOG.md#unreleased).

<!-- release-documentation:identity:start -->

This package: `@hadden-industries/owlapi@0.1.0-rc.3`.
These instructions describe this exact version; they do not assert registry availability.
Consumer engine admission: Node.js `>=22.0.0`.

<!-- release-documentation:identity:end -->

A version in `main` is not a published or accepted package.
For production use, verify the published artifact and qualify it for your application.
UO and WebVOWL may each use this exact RC in production after artifact verification and their own full consumer acceptance.

This project is an independently maintained JavaScript implementation.
It is not affiliated with, sponsored by, or endorsed by the Java OWLAPI project.
The [compatibility registry](./docs/compatibility/java-api-surface.md) lists the implemented Java APIs and known gaps.

## Install

Choose one command.
Use the first to follow the `owlapi` imports in the examples, or the second to import from `@hadden-industries/owlapi` and its subpaths.

<!-- release-documentation:install:start -->

Install this exact version after it is published:

```shell
npm install --save-exact "owlapi@npm:@hadden-industries/owlapi@0.1.0-rc.3"
npm install --save-exact @hadden-industries/owlapi@0.1.0-rc.3
```

<!-- release-documentation:install:end -->

Commit the exact dependency and lockfile, then run `npm ci` for reproducible installations.

### Install from the current npm tag

New staged releases default to `pilot`. The release owner can explicitly select `latest`, including for a release candidate. Before the first stable release, `next` identifies the supported RC. After stable promotion, `next` is reserved for a separately designated preview line.

Choose the corresponding command to resolve npm's `latest` tag at installation time.
The tag can select a prerelease.

```shell
npm install --save-exact "owlapi@npm:@hadden-industries/owlapi@latest"
npm install --save-exact @hadden-industries/owlapi@latest
```

Both commands save the version resolved at install time.
Run one again when you are ready to qualify a dependency update.
The alias applies only to your project's imports. npm still uses the scoped name for the package's registry identity.
Use the scoped name or its explicit alias in the commands above.

## Load an ontology

Run this example as an ES module.
It loads an RDF/XML ontology declaration from a string and prints its identifier and axiom count.

<!-- release-documentation:example-load-ontology:start -->

```js
import { OWLManager } from "owlapi/apibinding";
import { StringDocumentSource } from "owlapi/io";

const source = new StringDocumentSource(
  `<?xml version="1.0"?>
   <rdf:RDF
     xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
     xmlns:owl="http://www.w3.org/2002/07/owl#">
     <owl:Ontology rdf:about="https://example.com/my-ontology" />
   </rdf:RDF>`,
  {
    contentType: "application/rdf+xml",
    documentIRI: "https://example.com/my-ontology.owl",
  },
);

const manager = OWLManager.createOWLOntologyManager({
  behaviorProfileId: "normative-v1",
});
const ontology = await manager.loadOntologyFromOntologyDocument(source);

console.log(ontology.getOntologyID());
console.log(ontology.getAxioms().size);
```

<!-- release-documentation:example-load-ontology:end -->

The ontology ID contains `https://example.com/my-ontology`.
The axiom count is `0` because the document declares the ontology but adds no axioms.

## Release and source compatibility

This package includes ontology queries, changes, transforms, short-form providers, Manchester rendering, Turtle and OWL/XML storage, EL/QL/RL profiles, and syntactic locality extraction.
The current source candidate's version is declared in [package.json](package.json); its publication authority is recorded separately in [publication control](docs/release/publication-control.json).
This package implements explicit `normative-v1` and `java-owlapi-5.5.1` selection under the [behavior profile contract](docs/compatibility/behavior-profiles.md), the authorized Node document loader and the other additions in the [changelog](CHANGELOG.md).
Java migrations must select `java-owlapi-5.5.1`; omitted selection remains normative.
The [API delta from the rc.2 baseline](docs/compatibility/0.1.0-api-delta.md) lists the new exports, enlarged member surfaces and exact performance-coverage limits.
The [contract reconciliation](docs/compatibility/0.1.0-contract-scope.md) explains the bounded source assessment and the registry's `firstPublicReleaseTarget` planning field.
That target does not establish availability, and successful publication does not require rewriting every target or generated document.

The installation and API examples apply to this package version.
For development testing of a retained local candidate, substitute its actual absolute tarball path and version:

```shell
npm install --save-exact "owlapi@file:/absolute/path/hadden-industries-owlapi-<version>.tgz"
```

### Inspect parse metadata

RDF loads expose Java-style `RDFParserMetaData` through `manager.getOntologyFormat(ontology).getOntologyLoaderMetaData()`.
See the [RDF parser metadata contract](./docs/compatibility/rdf-parser-metadata.md) for exact return types, lifetime and Java differences.
It retains unparsed triples and inferred entity roles, including when warnings are disabled; statement counts and header status follow the selected behavior profile.
It describes the original parse rather than proving lossless source accounting after edits.
Loaded RDF formats are per-document copies, so identify their syntax through `format.key`.
See the exact return types and qualifications in [the API reference](./API.md).

### Package identity

The desired unscoped name `owlapi` was formerly used for an unrelated, now-unpublished Overwatch package and is blocked by npm's name-similarity protection.
The selected scoped package is a separate registry identity with no code, API, ownership, or provenance relationship to that package.

The manifest and release tooling select this scoped identity.
The retained [package-name review](https://github.com/Hadden-Industries/owlapi/blob/main/docs/provenance/package-name-review.json) describes the historical unscoped proposal; the separate [scoped-identity review](./docs/provenance/scoped-package-name-review.json) records the accepted scoped identity.
Its original tag restriction is superseded by the documented amendment in [ADR 0009](./docs/adr/0009-scoped-npm-publication-and-uo-rc-acceptance.md).

## Release history

- [0.1.0-rc.3](https://github.com/Hadden-Industries/owlapi/releases/tag/v0.1.0-rc.3), published 30 October: immutable Java-compatible and normative behavior profiles, an explicitly authorized Node document loader, `ChangeApplied` results, broader Node support and performance improvements.
  Upgrading from rc.2 requires reviewing profile-specific mutation, query, storage and resource defaults in the [migration guide](https://github.com/Hadden-Industries/owlapi/blob/main/docs/migration/0.1.0-java-api-parity.md).
- [0.1.0-rc.2](https://github.com/Hadden-Industries/owlapi/releases/tag/v0.1.0-rc.2), published 10 October (Europe/Bucharest): ontology indexes and changes, transforms, short-form providers, Manchester rendering, Turtle and OWL/XML storage, EL/QL/RL checks and syntactic locality extraction.
- [0.1.0-rc.1](https://github.com/Hadden-Industries/owlapi/releases/tag/v0.1.0-rc.1), published 3 October: the first public scoped package, with ontology loading, RDF parser metadata, import closures, ontology merging, Functional Syntax/RDF/XML storage and DL checking.

See the [complete changelog](https://github.com/Hadden-Industries/owlapi/blob/main/CHANGELOG.md) for fixes, migration details and release limitations.
These are prereleases; stable `0.1.0` remains unpublished.

## Node and browser support

<!-- runtime-policy:start -->

**Consumer support policy:**

> Requires Node.js 22 or newer.
> Official support covers the maintained Node.js release lines listed in our [support matrix](docs/release/runtime-policy.json).
> Other releases receive best-effort support.

The package declares the engine admission range `>=22.0.0`.
The maintained-family minimums of Node 22.0.0, 24.0.0 and 26.0.0 passed hosted installed-package and native-platform qualification; see the [qualification record](docs/release/node-consumer-qualification.md).
Every release candidate still requires qualification of its own bytes and human release acceptance.
Hosted qualification selects each family's exact minimum and latest released version, plus distinct reference versions, using one frozen matrix and one retained package archive.
Node 26.13.0 is the selected canonical package producer.

<!-- runtime-policy:end -->

Node 26.11.1 passed blocking source and retained-package qualification on Ubuntu x64, Windows x64, and macOS arm64 in [CI run 37875950984](https://github.com/Hadden-Industries/owlapi/actions/runs/37875950984).
Its admission does not imply upstream LTS status.
The release evidence records qualification for each published artifact; source changes require their own qualification.
CI reference runtimes and development-tool requirements are separate from the consumer minimums.
Browser applications can consume the same native ESM through a package-aware bundler or an application-owned import map.
No official TypeScript declarations are included in the initial release.

## Public imports and behavior profiles

<!-- release-documentation:exports:start -->

Public import paths (native alias):

- `owlapi`
- `owlapi/apibinding`
- `owlapi/model`
- `owlapi/io`
- `owlapi/io/node`
- `owlapi/formats`
- `owlapi/profiles`
- `owlapi/util`
- `owlapi/model/parameters`
- `owlapi/search`
- `owlapi/manchestersyntax/renderer`
- `owlapi/modularity/locality`

For a scoped installation, replace `owlapi` with `@hadden-industries/owlapi`.

<!-- release-documentation:exports:end -->

<!-- release-documentation:profiles:start -->

Both `normative-v1` and `java-owlapi-5.5.1` are implemented in this package.
Omitting `behaviorProfileId` selects `normative-v1`.
Select `java-owlapi-5.5.1` explicitly for the documented Java behavior; neither profile grants host I/O authority.

<!-- release-documentation:profiles:end -->

<!-- release-documentation:example-behavior-profiles:start -->

```js
import { OWLManager } from "owlapi/apibinding";

const defaultManager = OWLManager.createOWLOntologyManager();
const javaManager = OWLManager.createOWLOntologyManager({
  behaviorProfileId: "java-owlapi-5.5.1",
});
console.log(defaultManager.getBehaviorProfileId()); // normative-v1
console.log(javaManager.getBehaviorProfileId()); // java-owlapi-5.5.1
```

<!-- release-documentation:example-behavior-profiles:end -->

## Java OWLAPI and JavaScript call shapes

The public names are intentionally familiar, but JavaScript calls remain JavaScript-native: package imports replace Java packages, loading is asynchronous, and each documented operation has one unambiguous call shape rather than Java's overload matrix.

Create a manager:

```java
OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
```

```js
import { OWLManager } from "owlapi/apibinding";

const manager = OWLManager.createOWLOntologyManager({
  behaviorProfileId: "normative-v1",
});
```

Create an IRI and a structural class through the manager's data factory:

```java
OWLDataFactory dataFactory = manager.getOWLDataFactory();
IRI personIRI = IRI.create("https://example.com/Person");
OWLClass person = dataFactory.getOWLClass(personIRI);
```

```js
import { IRI } from "owlapi/model";

const dataFactory = manager.getOWLDataFactory();
const personIRI = IRI.create("https://example.com/Person");
const person = dataFactory.getOWLClass(personIRI);
```

Load caller-provided text and query the resulting ontology:

```java
OWLOntology ontology = manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(documentText)
);
Set<OWLClass> classes = ontology.getClassesInSignature();
```

```js
import { StringDocumentSource } from "owlapi/io";

const ontology = await manager.loadOntologyFromOntologyDocument(
  new StringDocumentSource(documentText, {
    documentIRI: "https://example.com/ontology.owl",
  }),
);
const classes = ontology.getClassesInSignature();
```

Only the JavaScript members listed in [`API.md`](./API.md) are promised.
A shared name does not imply that every Java overload, listener, mutable operation, or return type exists.

With the documented npm alias, import public bindings through these declared package specifiers:

- `owlapi`
- `owlapi/apibinding`
- `owlapi/model`
- `owlapi/model/parameters`
- `owlapi/io`
- `owlapi/io/node` (explicit Node document transport; excluded from browser imports)
- `owlapi/formats`
- `owlapi/profiles`
- `owlapi/util`
- `owlapi/search`
- `owlapi/manchestersyntax/renderer`
- `owlapi/modularity/locality`

Anything below `internal/` is a private implementation detail and is blocked by the package export map.
See [the generated API reference](./API.md) for every public binding, its call shape, supported members, limitations, errors, and Java authority.

`owlapi/profiles` exposes the asynchronous `OWL2DLProfile` checker and immutable `OWLProfileReport`.
Use `checkOntology(ontology, {sourceAssessment: true})` after loading with `parsingMode: "preserve"` to assess retained source structures as well as the formal OWL model across the managed import closure.
The checker reports `valid`, `invalid` or `unverified`; resource exhaustion and stale source evidence cannot certify validity.
In the latest release, omitted or null profile `timeoutMs` disables only its elapsed deadline; pass `{ timeoutMs: 30000 }` to retain the historical rc.1 default cutoff.
Explicit deadlines and cancellation remain available.

The behavior profile now owns default resource bounds: Java adds no JS-only finite ceiling; normative loading retains its separate default.
See the [profile default-policy inventory](docs/compatibility/default-behavior-inventory.md) for the source change and its migration boundary.
The [Canonical VOWL prerequisite contract](docs/compatibility/canonical-vowl-prerequisites.md) specifies source preservation, exact per-document formats, import-parent context, lossless cardinalities, budgets and bounded compatibility differences.

## Environments and consumption modes

`SUPPORTED` means the named environment is part of the declared contract and is subject to blocking release verification.
`PLAUSIBLE_UNVERIFIED` means its standards and package metadata make compatibility plausible, but the project does not run a complete blocking matrix.
`OUT_OF_SCOPE` means the initial line makes no environment-specific compatibility promise.

| Environment or workflow                                                                                             | Initial status         |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Node.js 22, 24 and 26 native ESM through npm on the tested Ubuntu x64, Windows x64, and macOS arm64 representatives | `SUPPORTED`            |
| Other upstream-supported Node.js OS and architecture combinations                                                   | `PLAUSIBLE_UNVERIFIED` |
| Browser `Window`/document through a package-aware bundler                                                           | `SUPPORTED`            |
| Browser document through an application-owned, integrity-verified import map                                        | `SUPPORTED`            |
| Bundled dedicated module worker through the tested path                                                             | `SUPPORTED`            |
| Yarn and pnpm installation of the published ESM package                                                             | `PLAUSIBLE_UNVERIFIED` |
| Bun, Deno, Cloudflare Workers, React Native, and Electron-specific integration                                      | `OUT_OF_SCOPE`         |
| CommonJS `require()`, AMD/UMD globals, and classic-script/IIFE loading                                              | `OUT_OF_SCOPE`         |
| Raw HTTP serving of `node_modules` without an ESM-capable resolution/conversion step                                | `OUT_OF_SCOPE`         |

The three `SUPPORTED` browser modes become a release claim only after the exact retained tarball passes the required Chromium, Firefox, and WebKit suite.
A failure before publication remains a release blocker rather than something this table conceals.
Shared workers, service workers, worklets, worker import maps, and turnkey global builds are not part of the initial contract.

### Bundler-owned browser application

A package-aware browser bundler can resolve the ordinary public specifiers:

```js
import { OWLManager } from "owlapi/apibinding";
import { StringDocumentSource } from "owlapi/io";

const manager = OWLManager.createOWLOntologyManager({
  behaviorProfileId: "normative-v1",
});
const ontology = await manager.loadOntologyFromOntologyDocument(
  new StringDocumentSource(documentText, {
    contentType: "text/turtle",
    documentIRI: "https://example.com/ontology.ttl",
  }),
);
```

### Native document modules with an import map

The application—not `owlapi`—owns import-map URLs, content security policy, integrity verification, caching, and availability.
A complete map must cover the browser-compatible public roots used by the application and their external static and literal-dynamic dependency closure; `io/node` is Node-only.
The alias keys below must resolve to files from the exact verified distribution installed above.
The application-local URL spelling does not claim an unscoped npm publication.
<!-- release-documentation:import-map:start -->

Deploy the verified `@hadden-industries/owlapi@0.1.0-rc.3` distribution under `/vendor/owlapi/0.1.0-rc.3/`.
This abbreviated map shows application-owned URLs, not a complete dependency map:

```html
<script type="importmap">
{
  "imports": {
    "owlapi": "/vendor/owlapi/0.1.0-rc.3/index.js",
    "owlapi/apibinding": "/vendor/owlapi/0.1.0-rc.3/apibinding/index.js",
    "owlapi/model": "/vendor/owlapi/0.1.0-rc.3/model/index.js",
    "owlapi/io": "/vendor/owlapi/0.1.0-rc.3/io/index.js",
    "owlapi/formats": "/vendor/owlapi/0.1.0-rc.3/formats/index.js",
    "owlapi/profiles": "/vendor/owlapi/0.1.0-rc.3/profiles/index.js",
    "owlapi/util": "/vendor/owlapi/0.1.0-rc.3/util/index.js",
    "owlapi/model/parameters": "/vendor/owlapi/0.1.0-rc.3/model/parameters/index.js",
    "owlapi/search": "/vendor/owlapi/0.1.0-rc.3/search/index.js",
    "owlapi/manchestersyntax/renderer": "/vendor/owlapi/0.1.0-rc.3/manchestersyntax/renderer/index.js",
    "owlapi/modularity/locality": "/vendor/owlapi/0.1.0-rc.3/modularity/locality/index.js"
  }
}
</script>
```

<!-- release-documentation:import-map:end -->

The release suite generates the complete reference map with the pinned JSPM tooling, verifies provider integrity, hydrates a content-addressed local mirror, and tests that mirror in the required engines.
`jspm.io` is a replaceable reference provider, not a runtime dependency or availability guarantee.
The package does not require `es-module-shims` and does not support exposing raw `node_modules` as a browser module tree.

### Bundled dedicated module worker

The tested worker mode is an ordinary module worker built by the application's bundler:

```js
const worker = new Worker(new URL("./ontology-worker.js", import.meta.url), {
  type: "module",
});
```

```js
// ontology-worker.js
import { OWLManager } from "owlapi/apibinding";
import { StringDocumentSource } from "owlapi/io";

self.onmessage = async ({ data: { documentText, contentType } }) => {
  const manager = OWLManager.createOWLOntologyManager({
    behaviorProfileId: "normative-v1",
  });
  const ontology = await manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(documentText, { contentType }),
  );
  self.postMessage({
    axiomCount: ontology.getAxioms().size,
    ontologyIRI: ontology.getOntologyID().ontologyIRI?.value ?? null,
  });
};
```

Return structured-clone-safe summaries rather than ontology instances.
The initial support statement does not cover native worker import maps or non-dedicated worker types.

## Security, networking, and resource limits

Importing the package performs no telemetry, network access, filesystem access, or global registration.
Local parsing consumes caller-provided input.
Remote imports and remote JSON-LD contexts are denied by default; an application must both enable the relevant option and supply an authorized resolver.
The package does not silently install a permissive network loader.

The default `normative-v1` loader configuration applies finite defaults, including:

| Limit                                    |           Default |
| ---------------------------------------- | ----------------: |
| Input or remotely supplied document size |            32 MiB |
| Expanded XML size                        |            32 MiB |
| Import count / depth                     |          256 / 32 |
| XML entity-expansion depth               |                16 |
| XML nesting depth                        |               512 |
| Token count / token length               | 5,000,000 / 1 MiB |
| RDF quad count                           |         5,000,000 |
| RDF list length                          |         1,000,000 |
| Structural axiom count                   |         1,000,000 |
| Default timeout                          |        30 seconds |
| Redirects / retries                      |             0 / 0 |

The explicit `java-owlapi-5.5.1` profile follows native Java defaults and adds no JavaScript-only finite ceilings; native provider limits still apply.
See the [profile default comparison](https://github.com/Hadden-Industries/owlapi/blob/main/docs/compatibility/behavior-profiles.md#configuration-and-resource-defaults) before selecting that profile.
Authorization remains independent of profile selection.
Applications may create a stricter `OWLOntologyLoaderConfiguration`, pass an `AbortSignal`, or lower any numeric ceiling.
Raising a ceiling accepts the corresponding memory, CPU, and denial-of-service risk; it does not turn the limit into a promise that every input below it is cheap.

## Current capability boundary

The initial package provides:

- immutable OWL structural values, structural equality, exhaustive kind dispatch, a data factory, ontology queries, and a deliberately narrow ontology manager;
- local document loading, bounded syntax detection, structured diagnostics, abort support, recursive import-closure loading, and remote loading denied unless the caller explicitly supplies and authorizes a resolver;
- Functional Syntax, Manchester Syntax, OWL/XML, DL Syntax, KRSS1, and KRSS2 parsing;
- RDF/XML, Turtle, TriG, N-Triples, N-Quads, and JSON-LD ingestion through qualified third-party syntax adapters and one shared RDF-to-OWL reconstruction layer; and
- one shared OWL-to-RDF mapping implementation used internally by supported workflows.

The initial package does **not** provide a reasoner, SWRL support, OBO parsing, Java listener APIs, directly constructible public storer classes, a public RDF/JS subpath, or full Java OWLAPI member parity.
N3.js supports the four listed RDF syntaxes; support for the broader N3 language is not claimed.
The [capability matrix](./docs/compatibility/capabilities.json), [Java API gap view](./docs/compatibility/java-api-surface.md), and [recorded expected differences](https://github.com/Hadden-Industries/owlapi/blob/main/docs/compatibility/expected-differences.json) are the authorities for the exact boundary.

This package includes the [ontology-lifecycle capabilities](https://github.com/Hadden-Industries/owlapi/blob/main/docs/ontology-lifecycle-capability-implementation-plan.md): closure queries, profile-specific changes, the merger, and manager-selected Functional Syntax and RDF/XML storage through `saveOntology` and `StringDocumentTarget.toString()`.

The latest release also provides [immutable RDF/XML writer configuration](docs/compatibility/rdfxml-writer-configuration.md) through `owlapi/model`, with manager-local indentation, banner and anonymous-ID settings, plus `RDFXMLDocumentFormat` prefix operations through `owlapi/formats`.
The behavior profile selects atomic normative updates or Java-compatible sequential and partial effects; see the profile contract before migrating Java callers.
The [parity migration guide](https://github.com/Hadden-Industries/owlapi/blob/main/docs/migration/0.1.0-java-api-parity.md) gives the exact imports, target/error changes and consumer-owned closure composition.
New candidates remain subject to producer parity, losslessness and installed-package gates; application acceptance and adoption are independently owned.

UO owns catalog/network resolution, retries, redirects and materialization policy; downloading the npm dependency does not itself enable remote ontology loading.
UO qualifies connected generation separately from the mandatory offline reload of its completed standalone outputs.

Test results name the standards suites, upstream revisions, exclusions, and controlled deviations they actually cover.
They are evidence for the registered capabilities, not a claim of W3C certification or exhaustive package-wide conformance.
Preparing an implementation-report submission is a separate, post-release programme documented in [the W3C reporting plan](https://github.com/Hadden-Industries/owlapi/blob/main/docs/plans/w3c-test-conformance-reporting.md).

## Why `owlapi` exists

Java OWLAPI remains the primary compatibility reference for creating, loading, inspecting, and serializing OWL ontologies.
Keeping a JVM in the application, however, does not provide the browser-native and ordinary npm package boundary needed by WebVOWL and other JavaScript consumers.

Adjacent projects solve valuable but different parts of the problem.
[`owljs`](https://github.com/cmungall/owljs) scripts Java OWLAPI through a JVM-backed JavaScript environment.
[`owlish`](https://github.com/field33/owlish) exposes a Rust OWL model through WebAssembly.
[OntoLogos](https://github.com/eddiethedean/ontologos) supplies a Rust ontology and reasoning stack with language bindings, while [HyLAR](https://github.com/ucbl/HyLAR-Reasoner) focuses on rule-based reasoning.

None was treated as defective for having a different boundary; none was a slot-in native-JavaScript structural API for the complete WebVOWL ingestion requirements this project had to satisfy.

The hard part was not merely turning RDF/XML or Turtle into triples.
An OWL loader has to preserve structural distinctions across native OWL syntaxes, reconstruct OWL objects from RDF graphs under the normative mapping, handle imports and diagnostics predictably, and expose stable ontology values rather than leaking syntax-specific parse trees.

WebVOWL supplied the first demanding production consumer and a valuable differential oracle, but this package contains no VOWL model or rendering concepts.

The implementation was authored specifications-first.
Public standards, observable Java OWLAPI behaviour, generated reference fixtures, and recorded legacy observations supplied requirements and test evidence; Java or legacy implementation source was not transliterated into the package.
The provenance policy and reconstructed-history evidence are available under [`docs/provenance`](https://github.com/Hadden-Industries/owlapi/tree/main/docs/provenance).

## Runtime behaviour and privacy

Importing `owlapi` performs no telemetry, network access, filesystem access, or global registration.
Parsing in-memory text is local.
Network retrieval occurs only when an application explicitly supplies an authorized document/import resolver; remote loading is denied by default.

The library itself does not collect personal data.
Project communication channels can process information that a reporter chooses to send; see the repository [privacy notice](https://github.com/Hadden-Industries/owlapi/blob/main/PRIVACY.md), [security policy](https://github.com/Hadden-Industries/owlapi/blob/main/SECURITY.md), and [Code of Conduct](https://github.com/Hadden-Industries/owlapi/blob/main/CODE_OF_CONDUCT.md) before using those channels.

## Contributing and security

Read [how to contribute](https://github.com/Hadden-Industries/owlapi/blob/main/CONTRIBUTING.md) for development setup and the `AGPL-3.0-only` inbound=outbound contribution terms.
Follow the [private vulnerability reporting process](https://github.com/Hadden-Industries/owlapi/blob/main/SECURITY.md#privately-report-a-vulnerability) to report a suspected security issue.

## Authorship, stewardship, and licence

Originally authored by [Maksym Shostak](https://github.com/MaksymShostak).

Copyright © 2026 Maksym Shostak.

Project stewardship: [HADDEN INDUSTRIES LTD](https://data.companieshouse.gov.uk/doc/company/07862561), registered in England and Wales under company number 07862561.

Licensed under the [GNU Affero General Public License, version 3 only](https://www.gnu.org/licenses/agpl-3.0.html) (`AGPL-3.0-only`).
The complete, unmodified licence text is included in [`LICENSE`](./LICENSE).

Dependencies and deliberately retained third-party materials remain under their own licences; the package licence does not relicense them.
