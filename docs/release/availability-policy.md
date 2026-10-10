# Release availability and approval evidence

Publication acceptance, registry availability and completed verification are separate states. npm scans newly submitted packages before making them installable; its documented delay can exceed 15 minutes and is not a service guarantee.
See [npm's publication guidance](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/).

The executable policy is [availability-policy.json](availability-policy.json).
It permits a first read immediately, then reads about once per minute, under one monotonic 30-minute deadline.
Each request and complete response body has at most the remaining budget, capped at one minute.
Transient transport/408/429/5xx reads may wait within that same budget; Retry-After is bounded. Generic registry readers still reject ordinary 404s. Only the submitted coordinate and its validated tarball/channel paths enter this wait.

Available metadata must identify the exact package/version and a supported registry distribution.
Available bytes must match the retained SHA-256 and published SHA-512 immediately, including while channels are still pending.
`next` and `latest` may temporarily be absent or identify the explicitly recorded predecessor; another version is a conflict.
Signatures, provenance, complete package identity and fresh consumers still require the existing strict verification.
Registry availability is never a successful verification result by itself.

The registry job reserves 30 minutes for availability within a 50-minute verification step and a 90-minute job budget, leaving time for setup and the existing strict consumer/cryptographic qualification. The report records pending stage, attempts and measured delay, then distinguishes registry available from verification passed. Its artifact uploads even after failure. On timeout it reports `AVAILABILITY_INCOMPLETE`, retains exact coordinate/source/run/attempt/digest and observations, and fails the workflow without repeating publication or channel writes.
Failed-job recovery reads the original publication; it does not submit another one.
Check npm's publication status and support if the version remains held.
Reassess the initial deadline after a timeout or materially changed upstream guidance.

Each protected gate captures an authenticated approval-history observation in its first attempt, before release effects.
Immutable artifacts bind the reviewer/environment, source, run, attempt and exact running gate job.
Later evidence generation authenticates the artifact's server identity, hashes its downloaded ZIP, validates the closed member inventory and checks the observation against the original job and successful latest gate execution.
It retains the original observation time, identifies the artifact digest in release input evidence and never calls a successful job an approval.

The current live approval history remains a consistency check: an empty response can be supplemented by authenticated retained observations, while contradictory reviewer/state information fails closed.
Missing, expired, altered or ambiguous retained artifacts block finalization.
Preserve the existing draft and reports and resolve the evidence gap through separately authorized recovery; do not replay possible writes or manufacture approvals.
The rc.2 operator recovery and earlier failed workflow attempts keep their original identities and outcomes.

Before using this workflow for a later release, explicitly update its coordinate, accepted predecessor, exact candidate approval and the normal release controls.
These improvements do not authorize another publication of rc.2 or any future artifact.
