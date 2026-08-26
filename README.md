# owlapi

`owlapi` is a native-ESM JavaScript library for loading OWL 2 ontologies into a structural object model in Node.js and modern browsers. Its public concepts deliberately resemble the Java OWLAPI where that makes the API familiar, while its I/O, asynchronous loading, module packaging, and RDF/JS integration follow JavaScript conventions.

> **Initial-development release:** `0.1.0-alpha.0` is useful but deliberately bounded. It does not provide the complete Java OWLAPI surface, and its public API may still change before production `0.1.0`. The exact implemented surface and every known Java API gap are recorded in [the compatibility registry](./docs/compatibility/java-api-surface.md).

This project is an independently maintained JavaScript implementation. It is not affiliated with, sponsored by, or endorsed by the Java OWLAPI project.

The package name was formerly used for an unrelated, now-unpublished Overwatch package. This implementation has no code, API, ownership, or provenance relationship with that package, and it does not reuse any of its historical versions. The dated [package-name and non-affiliation review](https://github.com/Hadden-Industries/owlapi/blob/main/docs/provenance/package-name-review.json) records the evidence and mitigations behind that decision.

## Install

While only the prerelease channel exists, install it explicitly:

```shell
npm install owlapi@next
```

You can pin the immutable version instead:

```shell
npm install owlapi@0.1.0-alpha.0
```

Until a production version is published under `latest`, an unqualified `npm install owlapi` is intentionally not a supported installation path.

The package requires Node.js `>=22.23.2 <23 || >=24.19.0 <25`. Browser applications can consume the same native ESM through a package-aware bundler or an application-owned import map. No official TypeScript declarations are included in the initial release.

## Load an ontology

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

const manager = OWLManager.createOWLOntologyManager();
const ontology = await manager.loadOntologyFromOntologyDocument(source);

console.log(ontology.getOntologyID());
console.log(ontology.getAxioms().size);
```

## Java OWLAPI and JavaScript call shapes

The public names are intentionally familiar, but JavaScript calls remain
JavaScript-native: package imports replace Java packages, loading is asynchronous,
and each documented operation has one unambiguous call shape rather than Java's
overload matrix.

Create a manager:

```java
OWLOntologyManager manager = OWLManager.createOWLOntologyManager();
```

```js
import { OWLManager } from "owlapi/apibinding";

const manager = OWLManager.createOWLOntologyManager();
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

Only the JavaScript members listed in [`API.md`](./API.md) are promised. A shared
name does not imply that every Java overload, listener, mutable operation, or
return type exists.

Import public bindings only through these package specifiers:

- `owlapi`
- `owlapi/apibinding`
- `owlapi/model`
- `owlapi/io`
- `owlapi/formats`

Anything below `internal/` is a private implementation detail and is blocked by the package export map. See [the generated API reference](./API.md) for every public binding, its call shape, supported members, limitations, errors, and Java authority.

## Environments and consumption modes

`SUPPORTED` means the named environment is part of the declared contract and is
subject to blocking release verification. `PLAUSIBLE_UNVERIFIED` means its
standards and package metadata make compatibility plausible, but the project does
not run a complete blocking matrix. `OUT_OF_SCOPE` means the initial line makes no
environment-specific compatibility promise.

| Environment or workflow                                                                                                 | Initial status         |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Node.js 22 and Node.js 24 native ESM through npm on the tested Ubuntu x64, Windows x64, and macOS arm64 representatives | `SUPPORTED`            |
| Other upstream-supported Node.js OS and architecture combinations                                                       | `PLAUSIBLE_UNVERIFIED` |
| Browser `Window`/document through a package-aware bundler                                                               | `SUPPORTED`            |
| Browser document through an application-owned, integrity-verified import map                                            | `SUPPORTED`            |
| Bundled dedicated module worker through the tested path                                                                 | `SUPPORTED`            |
| Yarn and pnpm installation of the published ESM package                                                                 | `PLAUSIBLE_UNVERIFIED` |
| Node.js 26 while it remains Current rather than LTS                                                                     | `PLAUSIBLE_UNVERIFIED` |
| Bun, Deno, Cloudflare Workers, React Native, and Electron-specific integration                                          | `OUT_OF_SCOPE`         |
| CommonJS `require()`, AMD/UMD globals, and classic-script/IIFE loading                                                  | `OUT_OF_SCOPE`         |
| Raw HTTP serving of `node_modules` without an ESM-capable resolution/conversion step                                    | `OUT_OF_SCOPE`         |

The three `SUPPORTED` browser modes become a release claim only after the exact
retained tarball passes the required Chromium, Firefox, and WebKit suite. A
failure before publication remains a release blocker rather than something this
table conceals. Shared workers, service workers, worklets, worker import maps, and
turnkey global builds are not part of the initial contract.

### Bundler-owned browser application

A package-aware browser bundler can resolve the ordinary public specifiers:

```js
import { OWLManager } from "owlapi/apibinding";
import { StringDocumentSource } from "owlapi/io";

const manager = OWLManager.createOWLOntologyManager();
const ontology = await manager.loadOntologyFromOntologyDocument(
  new StringDocumentSource(documentText, {
    contentType: "text/turtle",
    documentIRI: "https://example.com/ontology.ttl",
  }),
);
```

### Native document modules with an import map

The application—not `owlapi`—owns import-map URLs, content security policy,
integrity verification, caching, and availability. A complete map must cover all
five public roots and their external static and literal-dynamic dependency
closure. This abbreviated shape illustrates application-local URLs; it is not a
complete hand-maintained dependency map:

```html
<script type="importmap">
  {
    "imports": {
      "owlapi": "/vendor/owlapi/0.1.0-alpha.0/index.js",
      "owlapi/apibinding": "/vendor/owlapi/0.1.0-alpha.0/apibinding/index.js",
      "owlapi/model": "/vendor/owlapi/0.1.0-alpha.0/model/index.js",
      "owlapi/io": "/vendor/owlapi/0.1.0-alpha.0/io/index.js",
      "owlapi/formats": "/vendor/owlapi/0.1.0-alpha.0/formats/index.js"
    }
  }
</script>
<script type="module">
  import { OWLManager } from "owlapi/apibinding";
  // Application code uses the same public API as the bundler example.
</script>
```

The release suite generates the complete reference map with the pinned JSPM
tooling, verifies provider integrity, hydrates a content-addressed local mirror,
and tests that mirror in the required engines. `jspm.io` is a replaceable
reference provider, not a runtime dependency or availability guarantee. The
package does not require `es-module-shims` and does not support exposing raw
`node_modules` as a browser module tree.

### Bundled dedicated module worker

The tested worker mode is an ordinary module worker built by the application's
bundler:

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
  const manager = OWLManager.createOWLOntologyManager();
  const ontology = await manager.loadOntologyFromOntologyDocument(
    new StringDocumentSource(documentText, { contentType }),
  );
  self.postMessage({
    axiomCount: ontology.getAxioms().size,
    ontologyIRI: ontology.getOntologyID().ontologyIRI?.value ?? null,
  });
};
```

Return structured-clone-safe summaries rather than ontology instances. The
initial support statement does not cover native worker import maps or non-dedicated
worker types.

## Security, networking, and resource limits

Importing the package performs no telemetry, network access, filesystem access,
or global registration. Local parsing consumes caller-provided input. Remote
imports and remote JSON-LD contexts are denied by default; an application must
both enable the relevant option and supply an authorized resolver. The package
does not silently install a permissive network loader.

The immutable loader configuration applies finite defaults, including:

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

Applications may create a stricter `OWLOntologyLoaderConfiguration`, pass an
`AbortSignal`, or lower any numeric ceiling. Raising a ceiling accepts the
corresponding memory, CPU, and denial-of-service risk; it does not turn the limit
into a promise that every input below it is cheap.

## Current capability boundary

The initial package provides:

- immutable OWL structural values, structural equality, exhaustive kind dispatch, a data factory, ontology queries, and a deliberately narrow ontology manager;
- local document loading, bounded syntax detection, structured diagnostics, abort support, recursive import-closure loading, and remote loading denied unless the caller explicitly supplies and authorizes a resolver;
- Functional Syntax, Manchester Syntax, OWL/XML, DL Syntax, KRSS1, and KRSS2 parsing;
- RDF/XML, Turtle, TriG, N-Triples, N-Quads, and JSON-LD ingestion through qualified third-party syntax adapters and one shared RDF-to-OWL reconstruction layer; and
- one shared OWL-to-RDF mapping implementation used internally by supported workflows.

The initial package does **not** provide a reasoner, SWRL support, OBO parsing, Java listener APIs, ontology mutation, public storers/serializers, a public RDF/JS subpath, or full Java OWLAPI member parity. N3.js supports the four listed RDF syntaxes; support for the broader N3 language is not claimed. The [capability matrix](./docs/compatibility/capabilities.json), [Java API gap view](./docs/compatibility/java-api-surface.md), and [recorded expected differences](https://github.com/Hadden-Industries/owlapi/blob/main/docs/compatibility/expected-differences.json) are the authorities for the exact boundary.

Import-closure query APIs, ontology mutation and merger operations, and public saving/storer APIs are deliberately assigned to the separate [ontology-lifecycle capability plan](https://github.com/Hadden-Industries/owlapi/blob/main/docs/ontology-lifecycle-capability-implementation-plan.md); they are not silently folded into this release-engineering phase.

Test results name the standards suites, upstream revisions, exclusions, and controlled deviations they actually cover. They are evidence for the registered capabilities, not a claim of W3C certification or exhaustive package-wide conformance. Preparing an implementation-report submission is a separate, post-release programme documented in [the W3C reporting plan](https://github.com/Hadden-Industries/owlapi/blob/main/docs/plans/w3c-test-conformance-reporting.md).

## Why `owlapi` exists

Java OWLAPI remains the primary compatibility reference for creating, loading, inspecting, and serializing OWL ontologies. Keeping a JVM in the application, however, does not provide the browser-native and ordinary npm package boundary needed by WebVOWL and other JavaScript consumers.

Adjacent projects solve valuable but different parts of the problem. [`owljs`](https://github.com/cmungall/owljs) scripts Java OWLAPI through a JVM-backed JavaScript environment. [`owlish`](https://github.com/field33/owlish) exposes a Rust OWL model through WebAssembly. [OntoLogos](https://github.com/eddiethedean/ontologos) supplies a Rust ontology and reasoning stack with language bindings, while [HyLAR](https://github.com/ucbl/HyLAR-Reasoner) focuses on rule-based reasoning. None was treated as defective for having a different boundary; none was a slot-in native-JavaScript structural API for the complete WebVOWL ingestion requirements this project had to satisfy.

The hard part was not merely turning RDF/XML or Turtle into triples. An OWL loader has to preserve structural distinctions across native OWL syntaxes, reconstruct OWL objects from RDF graphs under the normative mapping, handle imports and diagnostics predictably, and expose stable ontology values rather than leaking syntax-specific parse trees. WebVOWL supplied the first demanding production consumer and a valuable differential oracle, but this package contains no VOWL model or rendering concepts.

The implementation was authored specifications-first. Public standards, observable Java OWLAPI behaviour, generated reference fixtures, and recorded legacy observations supplied requirements and test evidence; Java or legacy implementation source was not transliterated into the package. The provenance policy and reconstructed-history evidence are available under [`docs/provenance`](https://github.com/Hadden-Industries/owlapi/tree/main/docs/provenance).

## Runtime behaviour and privacy

Importing `owlapi` performs no telemetry, network access, filesystem access, or global registration. Parsing in-memory text is local. Network retrieval occurs only when an application explicitly supplies an authorized document/import resolver; remote loading is denied by default.

The library itself does not collect personal data. Project communication channels can process information that a reporter chooses to send; see the repository [privacy notice](https://github.com/Hadden-Industries/owlapi/blob/main/PRIVACY.md), [security policy](https://github.com/Hadden-Industries/owlapi/blob/main/SECURITY.md), and [Code of Conduct](https://github.com/Hadden-Industries/owlapi/blob/main/CODE_OF_CONDUCT.md) before using those channels.

## Contributing and security

See [CONTRIBUTING.md](https://github.com/Hadden-Industries/owlapi/blob/main/CONTRIBUTING.md) for development guidance and the `AGPL-3.0-only` inbound=outbound contribution terms. Do not report suspected vulnerabilities in public issues or pull requests; follow [SECURITY.md](https://github.com/Hadden-Industries/owlapi/blob/main/SECURITY.md) instead.

## Authorship, stewardship, and licence

Originally authored by [Maksym Shostak](https://github.com/MaksymShostak).

Copyright © 2026 Maksym Shostak.

Project stewardship: [HADDEN INDUSTRIES LTD](https://data.companieshouse.gov.uk/doc/company/07862561), registered in England and Wales under company number 07862561.

Licensed under the [GNU Affero General Public License, version 3 only](https://www.gnu.org/licenses/agpl-3.0.html) (`AGPL-3.0-only`). The complete, unmodified licence text is included in [`LICENSE`](./LICENSE).

Dependencies and deliberately retained third-party materials remain under their own licences; the package licence does not relicense them.
