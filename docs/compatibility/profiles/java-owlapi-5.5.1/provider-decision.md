# JSON-LD context limit control

The repository owner approved a narrowly scoped maintained build of jsonld 9.0.0 in the implementation chat on 2026-10-14.
The explicit question described the two-file source change, preservation of the normative limit, Java's observed limit, licensing, reproducible hashes, upgrade reassessment and removal when upstream supports the control.
The answer was: "Approve the narrowly scoped provider build".

The affected consumer is the common JSON-LD syntax adapter under both behavior profiles.
Stock jsonld's context resolver rejects chains beyond eleven URLs; the selected Java provider permits a longer chain.
The inspected streaming alternative does not expose the necessary depth and URL-rewrite controls at its parser boundary.
Neither available supported interface implements the observed contract.
Rewriting context documents or altering dependency objects at runtime would obscure that difference.

The source change adds one processor option, `maxContextUrls`, and forwards it to context resolvers.
It preserves upstream cycle detection and the existing effective default.
No external access permission follows from this option.
The build is private to this package; it creates no second public parser API.

This is the scoped NSH-01 decision for this dependency integration.
The repository maintainers own the source change and its generated artifact.
Reassess at each jsonld upgrade and before candidate admission.
Remove it when an upstream supported option passes the same boundary tests.
Broader source changes require a new decision.

Containment and evidence include pinned upstream identity, original/modified source digests, complete replacements, generated output digest, upstream licensing, chain and cycle boundaries, existing JSON-LD regressions, and packed Node/browser consumers.
A source or replacement-count drift fails the build.
The processor's output and access callbacks are the observable boundaries; successful bundling alone does not qualify behavior.
