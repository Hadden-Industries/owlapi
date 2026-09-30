# Scoped npm publication and consumer RC production acceptance

- Status: Accepted design; implementation and publication pending.
- Recorded: 2026-09-30.
- Authority: The repository owner's scoped-package proposal, explicit acceptance of RC use in UO production, subsequent extension to WebVOWL production, and request to update the affected documentation.

## Context

npm Support confirmed on 2026-09-09 that its name-similarity protection blocks the unscoped `owlapi` name and that support cannot override that block.
The former unrelated unscoped package and its consumed versions are historical facts about that name, not about a new organization-scoped coordinate.
Authenticated npm organization settings inspected in the originating discussion showed `maksymshostak` as an owner of `hadden-industries`, with account and organization 2FA enabled and no packages listed.
This establishes control of the scope; it does not establish a successful publication or approve an exact release.

## Decision

Publish the real package as `@hadden-industries/owlapi`, beginning with the fully qualified `0.1.0-rc.1` under `next`.
Include the approved Phase 21/22 lifecycle surface; no new public alpha or earlier stable release is required.
Recommend the exact native npm dependency alias `"owlapi": "npm:@hadden-industries/owlapi@0.1.0-rc.1"` so direct consumers retain their public imports.
The project, repository, Java namespace mappings and relative export keys retain their existing identities.

UO may use this exact RC in production, publish normal ontology outputs and complete its Python hard cutover after the immutable artifact and full consumer contract pass.
WebVOWL may also use this exact public RC in production after immutable artifact verification and its complete application, security-support and rollback gates in the main plan's §2.69 pass.
Stable `0.1.0` and Phase 20 completion are not production prerequisites for either application, and no additional waiver is required merely because the accepted version is an RC.
Each application owns its acceptance; package publication or the other application's acceptance cannot substitute for it.
Normal configuration, commit, push and deployment authorization still applies.
The later stable library release and WebVOWL's later stable-version adoption retain their own qualification gates.
Later RC or stable adoption requires a new exact pin and requalification.

## Consequences

Implement the [scoped publication plan](../plans/scoped-npm-publication.md) before any registry write.
Preserve historical alpha artifacts, digests, approvals and tags; they cannot qualify new scoped bytes.
Keep release controls disabled during preparation and preserve the existing approval, late-tag, retained-artifact, provenance and fresh-registry gates.
Qualify local candidates before publication, then qualify each application against the public artifact; do not make post-publication proof a prerequisite for publishing that same RC.

Native npm aliases are local dependency-name mappings, not API compatibility shims and not transitive or peer-dependency rewrites.
No forwarding package, dual publication, runtime wrapper, source resolver alias or migration to the unscoped name is included.
Future pursuit of `owlapi` does not block this scoped release and is a separate implementation decision.
