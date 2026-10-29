# Changelog

All notable changes to `owlapi` are documented in this file.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the major version is zero, the public API remains in initial development: incompatible changes advance the minor version, compatible additions advance the minor version by policy, and compatible corrections advance the patch version.
Prerelease identifiers do not create a stability promise.

## Unreleased

Current development source targets the [0.1.0 roadmap](docs/plans/2026-10-29-0.1.0-release-reconciliation.md).
No successor candidate has been frozen, qualified or published by this implementation.

- Add explicit immutable `normative-v1` and `java-owlapi-5.5.1` behavior profiles, including profile accessors, Java loader settings and `ChangeApplied` results; omitted selection remains normative.
- Add the explicitly authorized Node document loader under `io/node`, with per-operation access decisions and bounded transport behavior.
- Reconcile inherited public members and rename registry metadata to `firstPublicReleaseTarget`, which records intended first-release versions rather than publication facts.
  The [API delta](docs/compatibility/0.1.0-api-delta.md) and [contract scope](docs/compatibility/0.1.0-contract-scope.md) distinguish supported additions from unfinished source-assessment promises.
- Reduce repeated structural, parser, serializer, query and profile work; preserve profile differences and explicit performance limits.
  The [performance results](docs/performance/remaining-java-performance-implementation-results.md) retain raw observations and the remaining millisecond N-Quads outliers.
- Refresh dependency/tool graphs, address the vulnerable Jest transitive dependency, and use JSON Quality as an ordinary root registry devDependency with the repository's `>=` declaration policy.
- Centralize Java and Python selections in `.java-version` and `.python-version`; derive native checks and workflow projections from those declarations.
- Bound CI job registration and immutable-release observation, preserve original producing-attempt provenance across compatible runner image updates, and fail terminally when required workflow output cannot be written.

## 0.1.0-rc.2 — published 10 October 2026 (Europe/Bucharest)

The [published prerelease](https://github.com/Hadden-Industries/owlapi/releases/tag/v0.1.0-rc.2) and [finalization record](docs/release/rc2-finalization-recovery.json) identify the immutable artifact.
Its [Java-parity programme](docs/plans/0.1.0-rc.2-java-parity.md) delivered the selected APIs below; later development source must use a new version and separate qualification.

- Add direct ontology axiom indexes, explicit imports/annotation query enums and asserted `EntitySearcher` queries with fresh structural sets or multiplicity-preserving eager arrays.
- Add five immutable change records and atomic manager batches spanning axioms, imports and ontology annotations; reconcile only loaded import state.
- Add Java-shaped duplicator, renamer, remover, short-form providers and plain-text Manchester rendering.
- Add lossless Turtle and OWL/XML storage with atomic target publication and bounded failures; retain the two accepted native parser limitations as precise comparison differences.
- Add EL, QL and RL profile checking over captured import closures, retaining common DL checks and separate source assessment; apply the four accepted W3C profile differences.
- Add asynchronous BOTTOM, TOP and STAR syntactic-locality extraction over a captured axiom base.
  Numerical limits default to unlimited, matching Java; callers may set work, axiom, depth, annotation-depth or elapsed-time limits, with cancellation and no partial modules.
- Expose the four approved new package paths and qualify both `next` and `latest` against the same exact rc.2 version.
  Preserve its original qualification, approval and publication evidence.

- Yield profile assessment after elapsed work rather than every 256 checkpoints, reducing timer overhead while admitting queued cancellation.
- Default profile `timeoutMs` to `null`; omission and explicit null disable only its elapsed deadline.
  Pass `30000` to retain the previous cutoff.
  Explicit numeric deadlines, other profile bounds and loader defaults remain enforced.

- Add immutable `OWLOntologyWriterConfiguration` from `owlapi/model` and manager get/set accessors; each save captures its own settings.
- Render readable RDF/XML defaults with typed nodes, useful prefixes, four-space indentation, banners, safe nesting and pure resource collections; preserve graph identity and atomic storage failures.
- Add `RDFXMLDocumentFormat` and bounded prefix operations; retain loaded RDF/XML root prefixes and snapshot mutable output preferences per save.
- Add anonymous-individual ID persistence and the boolean Java format parameter `force xsd:string on literals`; refine deterministic RDF/XML layout with bounded Java comparison and unchanged graph semantics.
- Pin qualification to npm 12.2.0 and Java OWLAPI upstream revision `b61ebe2da83daceebb3e7ba7afbd2582c9240c33`; disable shared Java bundles tied to the earlier source-notice catalogue.
- Replace application-dependent CI/release qualification with the shared installed OWL contract and versioned producer gates; current consumer source informs reviewed interface coverage without requiring application execution or acceptance.
- Add input observation, explicit FULL qualification/direct landed-main lineage, and bounded native Java reference transport infrastructure; selective execution remains inactive and shared Java reuse is currently disabled.
- Qualify Node 26.11.1 alongside the existing Node 22/24 floors; retain Node 24.21.0 as canonical and expand source/retained-package blocking coverage.
- Refresh development tools and security-sensitive transitive dependencies, use stable `>=` development floors with a locked graph, and allow local npm `>=12.2.0` while governed qualification selects exact `12.2.0`.
- Adopt shared Markdown quality through isolated retained archives and public formatting, lint, link and qualification contracts.

## 0.1.0-rc.1 — published 3 October 2026

The first public candidate is `@hadden-industries/owlapi@0.1.0-rc.1`, recorded under `next` and `latest`.
Its [publication record](docs/provenance/releases/0.1.0-rc.1/publication-status.md) separates npm publication/verification, the original failed hosted check and the later immutable GitHub prerelease.
The changes below were already included in that artifact; application production acceptance remains independently owned.

- Expose immutable Java-style `RDFParserMetaData`, `RDFOntologyHeaderStatus`, format loader metadata and manager `getOntologyFormat`; retain exact unparsed terms independently of optional warnings.
- Load compatible RDF imports from secondary headers through the ordinary bounded manager closure; keep existing header selection and strict/preserve distinctions.
- Reconstruct supported inverse, functional, domain and range axioms for indirectly typed compatible properties before statement accounting.
- Return per-document RDF format copies carrying parser metadata; use `format.key` for syntax identity instead of reference equality with shared registry constants.

- Preserve DL numeric literal spelling and datatype in every parsing mode, including large integers and lexically distinct equal values; reload original sources to recover previously normalized spellings.
- Reject well-formed KRSS1 `:right-identity` with `UNSUPPORTED_CONSTRUCT` instead of silently discarding it; supported parent roles and KRSS2 identity chains are unchanged.

- Select the scoped npm identity throughout package metadata, generated API references, candidate assets and fresh release evidence; qualify direct scoped installs and the exact native npm alias while preserving `owlapi/*` consumer imports.
- Add an explicit exact-version public-registry mode to the July ontology harness; source and local-tarball reports remain distinct from public-registry acceptance.
- Permit the exact RC in Universal Ontology and WebVOWL production after immutable artifact verification and each application's complete consumer acceptance, without waiting for `0.1.0`.
- Add manager-owned import-closure queries, atomic ontology changes, `OWLOntologyImportsClosureSetProvider`, and `OWLOntologyMerger` through the Java-shaped public surface.
- Add atomic `StringDocumentTarget` storage and lossless Functional Syntax and representability-checked RDF/XML serialization through `saveOntology`.
- Read saved text only through `StringDocumentTarget.toString()` and classify representation failure with `OWLOntologyStorageError.reason === "ONTOLOGY_NOT_REPRESENTABLE"`; source documents retain `getText()`.
- Add `OWL2DLProfile` and `OWLProfileReport` through `owlapi/profiles`, including complete managed-closure checks, bounded datatype validation and a distinct source assessment.
- Add opt-in source-preserving loading, retained RDFS structures and original constructor arity, exact per-document formats, immutable import-parent context and lossless large cardinalities.
- Reject storage that would discard retained RDFS statements or unattached expressions before modifying its target.
- Reconcile parsing and fresh import closures for all four pinned July Universal Ontology variants, with explicit W3C-grounded Java differences.
- Validate workflow syntax, YAML and JSONPath with their native tools, retaining repository code only for repository-owned invariants.
- Include the lifecycle slice in the public RC and later `0.1.0` line against a pinned source-integration baseline; retain all release-acceptance gates and preserve historical alpha evidence under its original identity.

## 0.1.0-alpha.0 — historical unpublished candidate

### Added

- Native-ESM package entry points for `owlapi`, `owlapi/apibinding`, `owlapi/model`, `owlapi/io`, and `owlapi/formats`.
- Immutable structural OWL values, structural equality, exhaustive kind dispatch, the initial `OWLDataFactory`, direct ontology queries, and a narrow `OWLOntologyManager` workflow.
- Structured loading and parser diagnostics, abort support, bounded detection, import-closure loading, and remote loading denied by default.
- Functional Syntax, Manchester Syntax, OWL/XML, DL Syntax, KRSS1, KRSS2, RDF/XML, Turtle, TriG, N-Triples, N-Quads, and JSON-LD ingestion.
- Shared RDF-to-OWL and OWL-to-RDF mapping layers behind the public Java-recognizable APIs.
- A machine-readable Java OWLAPI 5.5.1 compatibility and gap registry, generated API reference, capability matrix, conformance evidence, dependency-seam registry, and provenance records.

### Known limitations

- This alpha is a documented subset, not complete Java OWLAPI parity.
- Reasoning, SWRL, OBO, public storers/serializers, ontology mutation, Java listener APIs, and the broader N3 language are not supported.
- The package exposes no public RDF/JS subpath and no TypeScript declarations.
- Public APIs may change before production `0.1.0` under the documented zero-major compatibility policy.
