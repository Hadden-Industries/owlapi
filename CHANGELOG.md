# Changelog

All notable changes to `owlapi` are documented in this file.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the major version is zero, the public API remains in initial development: incompatible changes advance the minor version, compatible additions advance the minor version by policy, and compatible corrections advance the patch version. Prerelease identifiers do not create a stability promise.

## Unreleased

No changes have been accepted beyond the first alpha candidate.

## 0.1.0-alpha.0 — pending publication

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
