# Semantic JSON identity

Object member order has no semantic meaning.
Maintained semantic fingerprints and comparisons recursively ignore that order; arrays retain their order, and changed values change identity.
`scripts/canonical-json.mjs` owns the shared encodings.
These repository encodings are not an RFC 8785 claim.
Exact-file hashes still bind original bytes, including whitespace and order.

Current review records use `sha256-sorted-json-v1` and explicit schema versions: rights inventory 2, third-party material 3, dependency governance 2 and scoped-name review 2.
`scripts/review-facts.mjs` defines their fact projections.
Run `node util/refresh-review-facts.mjs` to check them; use `--write` to refresh changed facts.
A changed digest or algorithm clears the prior human attestation and requires a fresh review.
The third-party inventory generator follows the same rule.
Formatting or recursively reordering members alone preserves a current review.

The October 2026 migration resets the four mutable review records to `PENDING_HUMAN_REVIEW`; it does not grant a new legal, dependency or package-name approval.
Existing release gates still require the applicable human reviews.
Prior approvals and their original digest encoding remain in Git history.

Consumer-source pin digest metadata and the current producer catalogue migrate together with their verifiers.
Pinned source commits, trees and blobs are unchanged.
Retained historical attestations, archived package-equivalence roots and raw artifacts are unchanged.
Old receipts whose insertion-order digests differ from the current semantic encoding fail admission and require fresh evidence; verifiers do not try both encodings.
The existing sorted qualification-summary encoding remains unchanged.
