# Java OWLAPI reference harness

This directory is development/test tooling only. It is never imported by
`src/owlapi-js`, bundled into WebVOWL, or shipped as an `owlapi-js` runtime
dependency.

`GenerateStructuralSnapshot.java` loads one ontology through the pinned Java
OWLAPI revision and emits a project-owned JSON snapshot containing ontology ID,
imports, ontology annotations, axiom counts/canonical strings, and direct
signature categories. Java output is behavioral evidence; production
JavaScript is implemented from normative/public specifications and must not be
translated from Java implementation control flow.

## Pinned oracle

The source revision and version evidence are recorded in
`pinned-version.json`. Build the local OWLAPI checkout at that exact revision
with a JDK, then compile this harness against the resulting distribution and
runtime dependency classpath. Do not substitute the OWL2VOWL shaded JAR: its
embedded OWLAPI is 5.1.1 and it is pinned separately only as the end-to-end VOWL
oracle.

One reproducible setup is:

1. Check out `d7e997a53b470e32700de89cc610d9daf01ea769` in the recorded OWLAPI
   source checkout.
2. Run the OWLAPI Maven build with tests skipped, preserving its resolved Maven
   dependency versions.
3. Build a runtime classpath for the OWLAPI distribution with Maven's
   dependency tooling.
4. Compile `GenerateStructuralSnapshot.java` with that classpath.
5. Run `GenerateStructuralSnapshot <input-ontology> [ignored-import-iri ...]`,
   capture standard output, and store the JSON beside the owning project
   fixture with the source revision recorded. Ignored import IRIs retain their
   declarations in the direct ontology snapshot but are not dereferenced.

The Phase 2 reference pair is
`fixtures/functional/phase2-structural.ofn` and
`fixtures/functional/phase2-structural.java.json`. Regenerate it only from the
pinned source revision and review any structural change through the governed
zero-tolerance expected-difference process.

The harness deliberately has no WebVOWL, npm, or browser dependency. Generated
snapshots are test evidence and require their own fixture provenance record.
