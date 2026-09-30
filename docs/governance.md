# owlapi-js governance

## Decision authority

Normative changes require explicit approval from the repository owner or a maintainer the owner designates in repository policy.
A request to implement a phase does not authorize changing architecture, public API, capability status, phase order, security policy, resource budgets, dependency selection, provenance disposition, or conformance policy.

Configuration files remain subject to `AGENTS.md`: an exact file-and-setting approval is required before a package, lock, build, lint, format, test, CI, container, deployment, environment, or repository-policy configuration changes.

The owner-approved [scoped publication and consumer RC decision](adr/0009-scoped-npm-publication-and-uo-rc-acceptance.md) selects `@hadden-industries/owlapi` in the controlled `hadden-industries` npm organization.
Scope ownership, effective package publishing permission, release approval and personal copyright are separate facts.
Retain the historical unscoped name review and alpha evidence; do not transfer their approvals to newly named package bytes.
Publication controls remain disabled until the scoped implementation and exact candidate qualification are complete and publication is authorized.

## Normative-change procedure

1. Record the decision and rationale in an ADR.
2. Obtain explicit approval from the decision authority.
3. Update every affected normative artifact in the same accepted change.
4. Add or update tests for observable behavior.
5. Update later phase contracts before implementation relies on the decision.

Implementation proceeds under the existing rule until all five steps are complete.

## Implementation independence

Production semantics are derived from W3C/public specifications and project-owned fixtures.
The pinned Java OWLAPI is a black-box behavioral oracle.
Its implementation source is not a production-code template.
Legacy WebVOWL semantic parsers are characterization evidence and follow the dispositions in `provenance/provenance.json`.
