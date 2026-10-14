# Local-file transport host boundary

Status: approved by the repository owner on 2026-10-14: "Approve the trusted, stable-directory condition".

The [approved Node transport adapter](transport-decision.md) authorizes a resolved local pathname before opening it.
Node's portable filesystem API cannot bind that pathname authorization to the final opened handle when another principal can replace a parent directory between those operations.
The retained security review reproduced this with an owned Windows directory-junction fixture.
`O_NOFOLLOW` protects only the final component on platforms that implement it; repeating pathname checks does not eliminate a concurrent ancestor replacement.

## Approved supported condition

Keep `NodeDocumentLoader({ authorize })` and its existing `read-file` authorization operation.
Support this operation only when the embedding host controls the resolved path and guarantees that every ancestor remains trusted and stable throughout acquisition.
The authorization context explicitly includes `requiresStablePathAncestors: true`.
Returning `true` for `read-file` accepts that condition as well as permission to read the named resource.
Hosts that cannot establish this condition must deny the operation and supply an existing caller-owned `documentLoader` that acquires an authorized file handle using their platform or sandbox facilities.

This condition does not change Java parsing, resource limits or configuration defaults.
It qualifies which filesystem access conditions the portable adapter can support.
It does not claim containment for attacker-writable directory trees, and neither a second `realpath` call nor a post-open pathname check will be presented as proof of containment.
HTTP and HTTPS destination authorization are unchanged.

## Verification and decision

Installed-consumer tests exercise owned, stable files and record that the authorization callback receives and accepts the stated condition.
A denied `read-file` operation must return no file content.
The support matrix and API documentation must state the condition before qualification.
The existing conditional race remains outside the supported host contract; its original evidence remains retained and must not be rewritten as a failed reproduction.

The owner accepted this condition after reviewing the concurrent directory replacement scenario, its local-write prerequisites and the additional native platform work required for stronger containment.
Caller-owned loaders remain available for other filesystem trust models.
