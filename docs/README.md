# owlapi-js migration

This directory contains the executable governance and delivery records for the
`owlapi-js` extraction described by `docs/owlapi-js/implementation-plan.md`.
The implementation plan remains the highest-authority normative document.

Authoritative machine-readable records:

- `compatibility/capabilities.json`: v1 capability and release-status matrix.
- `performance/resource-budgets.json`: finite resource limits and benchmark policy.
- `performance/benchmark-corpus.json`: pinned real-world and generated benchmark inputs.
- `provenance/provenance.json`: legacy-source dispositions, new-module
  provenance records, and recorded compatibility research.
- `conformance/suites.json`: pinned external standards and behavioural references.
- `conformance/classification-manifests.json`: exhaustive upstream-test classification gate.
- `compatibility/expected-differences.json`: exact Java/JavaScript differential exceptions.
- `dependency-governance.json`: selected dependency authority, risk, licence, and replacement records.

Repository implementation conventions are frozen in `engineering-conventions.md`.
The isolated Java structural reference harness lives under
`util/owlapi-reference/`; it is development evidence, never a production
runtime dependency.

Delivery records live under `migration/`. Historical lesson records preserve
evidence; `migration/parser-migration-playbook.md` is the concise current method.

Phase 1 provides the independently authored structural model, factory,
ontology, manager/loading foundation, source/configuration/error contracts,
parser-selection infrastructure, and RDF/JS dataset boundary under
`src/owlapi-js/`. No concrete syntax parser is registered yet; Functional
Syntax begins in Phase 2 after the Phase 1 checkpoint commit.
