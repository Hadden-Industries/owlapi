# Scoped npm publication and consumer RC production acceptance

- Status: Accepted design; scoped RC published and registry verification passed; GitHub release finalization remains pending.
  Distribution-tag policy amended on 2026-10-03.
  Successor scope and release independence amended on 2026-10-04.
  On the same date, the owner clarified that `latest` follows every most recent public release, including prereleases.
- Recorded: 2026-09-30.
- Authority: The repository owner's scoped-package proposal, explicit acceptance of RC use in UO production, subsequent extension to WebVOWL production, and request to update the affected documentation.

## Context

npm Support confirmed on 2026-09-09 that its name-similarity protection blocks the unscoped `owlapi` name and that support cannot override that block.
The former unrelated unscoped package and its consumed versions are historical facts about that name, not about a new organization-scoped coordinate.
Authenticated npm organization settings inspected in the originating discussion showed `maksymshostak` as an owner of `hadden-industries`, with account and organization 2FA enabled and no packages listed.
This establishes control of the scope; it does not establish a successful publication or approve an exact release.

## Decision

Publish the real package as `@hadden-industries/owlapi`, beginning with the fully qualified `0.1.0-rc.1` under `next`.
For this initial publication, the 3 October decision allowed `latest` to identify that exact RC.
`latest` is npm's default installation target; it is not a promise of a stable version or consumer production acceptance.
The owner accepted this documentation-only policy amendment on 2026-10-03 after npm assigned both tags to the unchanged published candidate.
That initial decision accepted `next = 0.1.0-rc.1`, with `latest` absent or equal to it; the general 4 October policy below now governs later releases and their channel updates.
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

### Release independence and the next candidate

The owner's 4 October 2026 instruction selects `@hadden-industries/owlapi@0.1.0-rc.2` before stable `0.1.0`, with the scope and assurance in the [integrated Java-parity plan](../plans/0.1.0-rc.2-java-parity.md).
WebVOWL and Universal Ontology may incorporate added functionality at their own pace.
Neither application's acceptance, adoption, migration, deployment or sign-off blocks any owlapi release, corrective release or release finalization.
This supersedes both prepublication and postpublication consumer prerequisites in earlier plans.

Owlapi retains responsibility for its own public-contract, Java/spec, installed-package, browser/worker, security, rights, resource, provenance and immutable-artifact gates.
Pinned consumer-origin corpus tests can remain independently reproducible producer checks; they are not application acceptance.
Consumer reports are advisory unless they establish a reproducible breach of a supported producer requirement, which is handled as a producer defect.
Each application's own production contract and deployment authority remain with that application.

The new plan identifies current executable consumer dependencies and their required migration before successor qualification.
This documentation decision is not evidence that those controls have changed or passed.
Rc.1 remains immutable and its outstanding GitHub finalization remains explicitly recorded.
The owner's clarified policy is that `latest` identifies the most recently publicly released owlapi version, including prereleases.
Accordingly, the authorized rc.2 release advances both `next` and `latest` to `0.1.0-rc.2`; each later public release advances `latest` as part of that release's existing authorization, without another version-specific permission gate.
`next` continues to identify the selected prerelease channel and does not reserve `latest` for stable versions.
The later stable release advances `latest` in the same way, with stale `next` cleanup governed by the existing channel policy.
This is owlapi's chosen policy: npm's [distribution-tag contract](https://docs.npmjs.com/cli/v12/commands/npm-dist-tag/) makes `latest` the default installation pointer and permits the publisher to select its target.
Release tooling must explicitly establish and verify the required tag state; publishing under `next` alone does not guarantee that `latest` changes.
Historical observations remain unchanged, and exact consumer pins do not move when a tag moves.

## Consequences

Implement the [scoped publication plan](../plans/scoped-npm-publication.md) before any registry write.
Preserve historical alpha artifacts, digests, approvals and tags; they cannot qualify new scoped bytes.
Keep release controls disabled during preparation and preserve the existing approval, late-tag, retained-artifact, provenance and fresh-registry gates.
Qualify local candidates before publication, then qualify each application against the public artifact; do not make post-publication proof a prerequisite for publishing that same RC.

The additional tag does not invalidate the existing qualification of identical package bytes.
Do not rebuild, republish, move the signed tag, repeat code tests, or introduce a replacement release workflow solely for this metadata state.
Retain the original workflow's failed check as evidence of the superseded `latest` prohibition; do not describe that workflow as passing.
Finish only the outstanding public-registry and release-evidence checks, recording actual tag values and the original publication identity.
The [publication record](../provenance/releases/0.1.0-rc.1/publication-status.md) distinguishes completed publication from remaining verification.

Native npm aliases are local dependency-name mappings, not API compatibility shims and not transitive or peer-dependency rewrites.
No forwarding package, dual publication, runtime wrapper, source resolver alias or migration to the unscoped name is included.
Future pursuit of `owlapi` does not block this scoped release and is a separate implementation decision.
