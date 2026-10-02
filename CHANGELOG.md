# Changelog

All notable changes to `owlapi` are documented in this file.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While the major version is zero, the public API remains in initial development: incompatible changes advance the minor version, compatible additions advance the minor version by policy, and compatible corrections advance the patch version.
Prerelease identifiers do not create a stability promise.

## Unreleased

- Expose immutable Java-style `RDFParserMetaData`, `RDFOntologyHeaderStatus`, format loader metadata and manager `getOntologyFormat`; retain exact unparsed terms independently of optional warnings.
- Load compatible RDF imports from secondary headers through the ordinary bounded manager closure; keep existing header selection and strict/preserve distinctions.
- Reconstruct supported inverse, functional, domain and range axioms for indirectly typed compatible properties before statement accounting.
- Return per-document RDF format copies carrying parser metadata; use `format.key` for syntax identity instead of reference equality with shared registry constants.

- Preserve DL numeric literal spelling and datatype in every parsing mode, including large integers and lexically distinct equal values; reload original sources to recover previously normalized spellings.
- Reject well-formed KRSS1 `:right-identity` with `UNSUPPORTED_CONSTRUCT` instead of silently discarding it; supported parent roles and KRSS2 identity chains are unchanged.

The selected first public candidate is `@hadden-industries/owlapi@0.1.0-rc.1` under `next`; the later stable target remains `0.1.0`.
It is not published, tagged or accepted merely by merging it.

- Select the scoped npm identity throughout package metadata, generated API references, candidate assets and fresh release evidence; qualify direct scoped installs and the exact native npm alias while preserving `owlapi/*` consumer imports.
- Add an explicit exact-version public-registry mode to the July ontology harness; source and local-tarball reports remain distinct from public-registry acceptance.
- Permit the exact RC in Universal Ontology and WebVOWL production after immutable artifact verification and each application's complete consumer acceptance, without waiting for `0.1.0`.
- Add manager-owned import-closure queries, atomic ontology changes, `OWLOntologyImportsClosureSetProvider`, and `OWLOntologyMerger` through the Java-shaped public surface.
- Add atomic `StringDocumentTarget` storage and lossless Functional Syntax and representability-checked RDF/XML serialization through `saveOntology`.
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
