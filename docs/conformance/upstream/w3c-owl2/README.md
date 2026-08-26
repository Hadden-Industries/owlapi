# Pinned W3C OWL 2 test manifest

`all.rdf` is an exact, unmodified copy of
`contract/src/test/resources/all.rdf` from OWLAPI 5.5.1 revision
`d7e997a53b470e32700de89cc610d9daf01ea769`, retrieved on 10 August 2026.

- SHA-256:
  `986ce4f9df655b1f44aec86a5753530d295355a8e9a16700e0253ac30759c4e1`.
- Stored cases: 338 approved test cases with unique `test:identifier` values.
- Functional subset: 46 cases containing 62 Functional premise, conclusion, or
  non-conclusion documents.
- Governing specifications: W3C OWL 2 Structural Specification and
  Functional-Style Syntax Second Edition, and W3C OWL 2 Conformance Second
  Edition.
- Upstream status authority:
  <https://www.w3.org/2007/OWL/wiki/Test_Suite_Status>.

## Licensing

W3C test suites use the dual-licensing approach documented in
[Licenses for W3C Test Suites](https://www.w3.org/Consortium/Legal/2008/04-testsuite-copyright.html).
This repository therefore records the retained test artifact as
`W3C-20150513 OR BSD-3-Clause`; it does not globally elect one alternative
because W3C directs users to choose according to the intended use. The artifact
is repository-only test evidence and is excluded from the npm package.

The archived W3C status page reports 355 approved cases, while the historical
batch-export service is no longer used here as a reproducible artifact endpoint.
This repository claims conformance only for the exact 338-case byte sequence it
stores and exhaustively classifies. Replacing or augmenting it requires a new
immutable digest, complete reclassification, and the repository-owner approval
process.

The machine-readable classification is
`docs/conformance/classification-manifests.json`; the Phase 2 runner is
`internal/parsing/functional/functionalSyntax.conformance.test.js`.
