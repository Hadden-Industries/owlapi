# owlapi

Load, query, and save OWL 2 ontologies in Node.js and modern browsers.
OwlAPI uses native JavaScript ES modules and provides a structural object model, Java OWLAPI-style APIs, and RDF/JS integration.

<!-- release-documentation:repository-links -->

[Install the library](#install) · [Load an ontology](#load-an-ontology) · [Browse the API](./API.md) · [Upgrade or migrate](https://github.com/Hadden-Industries/owlapi/blob/main/docs/migration/0.1.0-java-api-parity.md)

## Install

See [Node and browser support](#node-and-browser-support) for runtime requirements.

<!-- release-documentation:install:start -->

Use the `owlapi` alias to follow the examples in this guide.

```shell
npm install --save-exact "owlapi@npm:@hadden-industries/owlapi@0.1.0"
```

For imports that start with `@hadden-industries/owlapi`, install the scoped package directly.

```shell
npm install --save-exact @hadden-industries/owlapi@0.1.0
```

<!-- release-documentation:install:end -->

Both commands save the exact version.
Commit the dependency and lockfile, then use `npm ci` to reproduce the install.
The alias changes the import name in your project.
On npm the package is named `@hadden-industries/owlapi`.

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

## Release status

<!-- release-documentation:identity:start -->

This guide covers `@hadden-industries/owlapi@0.1.0`.

<!-- release-documentation:identity:end -->

[Read the changelog](./CHANGELOG.md) for changes and upgrade notes.
[Browse GitHub releases](https://github.com/Hadden-Industries/owlapi/releases) for release assets and verification records.
[Check the npm package](https://www.npmjs.com/package/@hadden-industries/owlapi?activeTab=versions) for available versions and tags.

## Inspect parse metadata

RDF loads expose Java-style `RDFParserMetaData` through `manager.getOntologyFormat(ontology).getOntologyLoaderMetaData()`.
See the [RDF parser metadata contract](./docs/compatibility/rdf-parser-metadata.md) for exact return types, lifetime and Java differences.
It retains unparsed triples and inferred entity roles, including when warnings are disabled; statement counts and header status follow the selected behavior profile.
It describes the original parse rather than proving lossless source accounting after edits.
Loaded RDF formats are per-document copies, so identify their syntax through `format.key`.
See the exact return types and qualifications in [the API reference](./API.md).

## Node and browser support

<!-- runtime-policy:start -->

Use Node.js 22 or newer.
The package declares the engine admission range `>=22.0.0`.

Official support starts at Node.js 22.0.0, 24.0.0 and 26.0.0 in the maintained release lines.
Other release lines receive best-effort support.

<!-- runtime-policy:end -->

See the [runtime support policy](https://github.com/Hadden-Industries/owlapi/blob/main/docs/release/runtime-policy.json) for the supported lines and platforms.

Use a [bundler](#bundler-owned-browser-application), an [import map](#native-document-modules-with-an-import-map), or a [bundled dedicated worker](#bundled-dedicated-module-worker) in the browser.
The `owlapi/io/node` transport requires Node.js.

## Public imports and behavior profiles

<!-- release-documentation:exports:start -->

Public imports with the `owlapi` alias:

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

Omitting `behaviorProfileId` selects `normative-v1`.
Select `java-owlapi-5.5.1` for the documented Java behavior.
File and network access require separate authorization in either profile.

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

Read the [behavior profile comparison](./docs/compatibility/behavior-profiles.md) before choosing a profile.

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

Use the [public imports above](#public-imports-and-behavior-profiles).
The [API reference](./API.md) lists supported members, call shapes, and errors for each binding.

On Node.js, pass a factory that opens a UTF-8 RDF/XML stream.

```js
import { createReadStream } from "node:fs";
import { RDFXMLStreamDocumentSource } from "owlapi/io";

const source = new RDFXMLStreamDocumentSource(
  (signal) => createReadStream("ontology.owl", { signal }),
  { documentIRI: "https://example.com/ontology.owl" },
);
const ontology = await manager.loadOntologyFromOntologyDocument(source);
```

The factory opens a fresh stream on each load.
RDF/XML parsing consumes chunks while the manager builds the RDF graph and OWL model in memory.

`owlapi/profiles` exposes the asynchronous `OWL2DLProfile` checker and immutable `OWLProfileReport`.
Use `checkOntology(ontology, {sourceAssessment: true})` after loading with `parsingMode: "preserve"` to assess retained source structures as well as the formal OWL model across the managed import closure.
The checker reports `valid`, `invalid`, or `unverified`.
Resource exhaustion throws, and stale source evidence cannot certify validity.
Omit `timeoutMs` or pass `null` to leave the profile check without an elapsed deadline.
Pass `{ timeoutMs: 30000 }` to set a 30-second deadline.
Other limits and cancellation still apply.

Profile checks and document loading have separate defaults.
See the [default settings by profile](docs/compatibility/default-behavior-inventory.md).
See the [Canonical VOWL requirements](docs/compatibility/canonical-vowl-prerequisites.md) for source preservation, formats, imports, and limits.

## Environments and consumption modes

| Support                    | Where to use OwlAPI                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Supported                  | Native ES modules installed with npm on the tested Ubuntu x64, Windows x64, and macOS arm64 platforms                                            |
| Supported                  | Browser documents through a package-aware bundler or an application-owned, integrity-verified import map                                         |
| Supported                  | Dedicated module workers built by an application bundler                                                                                         |
| Compatibility unverified   | Other upstream-supported Node.js platforms, Yarn, and pnpm                                                                                       |
| Outside the support policy | Bun, Deno, Cloudflare Workers, React Native, Electron-specific integration, and browser worker modes other than bundled dedicated module workers |
| Outside the support policy | CommonJS `require()`, standalone global scripts, and serving raw `node_modules` to browsers                                                      |

Browser verification covers Chromium, Firefox, and WebKit.
Find results for the exact package among the [release assets](#release-status).

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

Host the pinned package files and dependencies used by your application.
Verify their integrity and manage content security policy, caching, and availability in the application.
Cover static imports and literal dynamic imports in the map.
Use the Node transport only on Node.js.

<!-- release-documentation:import-map:start -->

Deploy the verified `@hadden-industries/owlapi@0.1.0` package under `/vendor/owlapi/0.1.0/`.
This example maps OwlAPI's browser entry points.
Add mappings for the dependencies your application uses.

```html
<script type="importmap">
{
  "imports": {
    "owlapi": "/vendor/owlapi/0.1.0/index.js",
    "owlapi/apibinding": "/vendor/owlapi/0.1.0/apibinding/index.js",
    "owlapi/model": "/vendor/owlapi/0.1.0/model/index.js",
    "owlapi/io": "/vendor/owlapi/0.1.0/io/index.js",
    "owlapi/formats": "/vendor/owlapi/0.1.0/formats/index.js",
    "owlapi/profiles": "/vendor/owlapi/0.1.0/profiles/index.js",
    "owlapi/util": "/vendor/owlapi/0.1.0/util/index.js",
    "owlapi/model/parameters": "/vendor/owlapi/0.1.0/model/parameters/index.js",
    "owlapi/search": "/vendor/owlapi/0.1.0/search/index.js",
    "owlapi/manchestersyntax/renderer": "/vendor/owlapi/0.1.0/manchestersyntax/renderer/index.js",
    "owlapi/modularity/locality": "/vendor/owlapi/0.1.0/modularity/locality/index.js"
  }
}
</script>
```

<!-- release-documentation:import-map:end -->

The [reference import map](https://github.com/Hadden-Industries/owlapi/blob/main/test/consumers/browser/import-map/reference-import-map.json) shows the dependencies used by the browser tests.

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

Return a summary that supports structured cloning.

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

## Supported features and limits

- **Build and query ontologies.**
  Create immutable OWL values, compare them structurally, query axioms and entities, and work with import closures.
- **Read OWL and RDF.**
  Load Functional Syntax, Manchester Syntax, OWL/XML, DL Syntax, KRSS1, KRSS2, RDF/XML, Turtle, TriG, N-Triples, N-Quads, and JSON-LD.
- **Change and save ontologies.**
  Use the manager to apply changes and save Functional Syntax, RDF/XML, Turtle, or OWL/XML.
  Configure [RDF/XML output](docs/compatibility/rdfxml-writer-configuration.md) with writer settings and prefixes.
- **Check profiles and extract modules.**
  Run OWL 2 DL, EL, QL, and RL checks, or extract a module with syntactic locality.
- **Transform and render.**
  Merge ontologies, duplicate OWL objects, rename or remove entities, and render Manchester Syntax with short names.

Reasoning, SWRL, OBO parsing, the broader N3 language, Java listener APIs, directly constructible storer classes, a public RDF/JS subpath, and official TypeScript declarations are outside this release's scope.
The [capability matrix](./docs/compatibility/capabilities.json) and [Java compatibility reference](./docs/compatibility/java-api-surface.md) define the supported features and known gaps.
Standards test results cover the listed suites, revisions, and deviations.
See the [W3C reporting plan](https://github.com/Hadden-Industries/owlapi/blob/main/docs/plans/w3c-test-conformance-reporting.md) for the separate conformance-reporting work.

## Why `owlapi` exists

OwlAPI is an independent JavaScript implementation.
It has no affiliation with, sponsorship from, or endorsement by the Java OWLAPI project.

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

### The work behind OwlAPI

The base-case estimate for reproducing the development work behind OwlAPI 0.1.0 is **27,550 team hours** for a US-based team.
The estimated **US$3.64 million** covers implementation, conformance testing, Java compatibility work, and releases, including allowances for outside counsel and direct expenses.

[See what the rebuild estimate covers](https://github.com/Hadden-Industries/owlapi/blob/main/docs/development-investment.md).

## Runtime behaviour and privacy

The library itself does not collect personal data.
Project communication channels can process information that a reporter chooses to send; see the repository [privacy notice](https://github.com/Hadden-Industries/owlapi/blob/main/PRIVACY.md), [security policy](https://github.com/Hadden-Industries/owlapi/blob/main/SECURITY.md), and [Code of Conduct](https://github.com/Hadden-Industries/owlapi/blob/main/CODE_OF_CONDUCT.md) before using those channels.

## Contributing and security

Read [how to contribute](https://github.com/Hadden-Industries/owlapi/blob/main/CONTRIBUTING.md) for development setup and the `AGPL-3.0-only` inbound=outbound contribution terms.
Follow the [private vulnerability reporting process](https://github.com/Hadden-Industries/owlapi/blob/main/SECURITY.md#privately-report-a-vulnerability) to report a suspected security issue.

## Authorship, stewardship, and licence

Originally authored by [Maksym Shostak](https://github.com/MaksymShostak).

Copyright © 2026 Maksym Shostak.

Project stewardship: [HADDEN INDUSTRIES LTD](https://data.companieshouse.gov.uk/doc/company/07862561), registered in England and Wales under company number 07862561.

OwlAPI is available at no charge under the [GNU Affero General Public License, version 3 only](https://www.gnu.org/licenses/agpl-3.0.html) (`AGPL-3.0-only`).
The complete, unmodified licence text is included in [`LICENSE`](./LICENSE).

Dependencies and deliberately retained third-party materials remain under their own licences; the package licence does not relicense them.
