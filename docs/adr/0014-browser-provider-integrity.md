# Verify JSPM modules against reviewed browser integrity pins

Accepted for implementation on 25 November 2026 under Maksym Shostak's confirmed DEC-001 through DEC-005 in the [browser import-map integrity plan](../plans/2026-11-23-owlapi-browser-import-map-integrity.md).

## Decision

Verify the retained OwlAPI tarball against the candidate manifest's SHA-256 before installing it.
The qualifying revision supplies the first-party fixture files.
The native import-map, bundler and worker tests establish the behavior of the staged package and fixture.

Keep the application-owned reference map's public imports and scope resolutions.
Include SHA-384 pins for the complete static and dynamic JSPM module closure.
Admit the trace, map URLs and staged paths before projecting the map.
During preparation, compare the projected map with the reviewed map and use the reviewed pins to verify exact, unredirected HTTPS responses from `ga.jspm.io` before writing each mirror file.
Carry those pins onto the corresponding mirror URLs in the inline map.

The retained tarball already binds the first-party package bytes, and the qualifying Git revision binds the fixture sources.
JSPM responses may change independently of either identity, so the reviewed map supplies their expected digests.

## Changes at an existing provider URL

Same-URL drift fails closed until the maintainer authenticates the exact replacement bytes independently and approves a record binding the starting reviewed-map SHA-256, URL, old and new SHA-384 values, evidence reference and decision reference.
Suitable evidence includes a separately authenticated provider attestation or exact reproduction from authenticated inputs and the provider transformation.
Fetching the same URL again checks consistency.
Retain the approval and evidence with the candidate and qualify the approved candidate afresh in Chromium, Firefox and WebKit.

Hydrate and retain the generated map, mirror inventory and injected fixture before atomically replacing the reviewed map under single-writer checkout custody.
Publish the preparation manifest after replacement.
If preparation ends during the swap, compare the tracked map against the retained generated map and resume through the ordinary reviewed-revision route.
The [operator instructions](../development/npm-scripts.md) describe the refresh inputs and recovery steps.

## Evidence

The browser-consumer manifest identifies the tarball, the generated-map SHA-256 and `referenceImportMap.integrityScope` as `provider-only`.
Retain the map originals, the verified mirror archive, inventory and browser receipts against the exact producing revision, tarball and runner.
Interpret historical manifests using their producing revision and original map.
Apply the evidence retention and release criteria in [§2.46](../implementation-plan.md#246-decision-use-jspm-only-as-the-exact-pinned-reference-import-map-tool-and-provider).
