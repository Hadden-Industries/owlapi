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

On Windows, a fully resolved Maven runtime classpath can exceed reliable shell
or Java argument-file handling. `RunWithClasspath.java` is a test-tooling-only
launcher for that case. Compile it once, then invoke
`RunWithClasspath <classpath-file> <harness-class-directory> <main-class>
[args...]`; it starts the same JDK with the harness directory prepended to the
classpath read from the file. It neither resolves dependencies nor changes the
pinned oracle identity.

The Phase 2 reference pair is
`fixtures/functional/phase2-structural.ofn` and
`fixtures/functional/phase2-structural.java.json`. Regenerate it only from the
pinned source revision and review any structural change through the governed
zero-tolerance expected-difference process.

The Phase 3 Java reference pair is
`fixtures/manchester/phase3-structural.omn` and
`fixtures/manchester/phase3-structural.java.json`. The sibling
`phase3-structural.ofn` is the project-owned Functional counterpart used for
cross-syntax structural conformance. The Java snapshot deliberately preserves
OWLAPI 5.5.1's comparison-facet result; the two standards-correct JavaScript
differences are matched only by the exact fixture-scoped rules in
`docs/owlapi-js/compatibility/expected-differences.json`.

The Phase 4 OWL/XML reference pair is
`fixtures/owlxml/phase4-structural.owx` and
`fixtures/owlxml/phase4-structural.java.json`. The sibling
`phase4-structural.ofn` is the project-owned Functional counterpart used for
cross-syntax structural conformance. The Java snapshot omits the anonymous
individual inside one `ObjectOneOf`; JavaScript retains it as required by the
W3C OWL/XML schema. That single semantic divergence is calculated as an atomic
field and accepted only by its exact fixture-scoped expected-difference rule.

The Phase 5 RDF reference set is under `fixtures/rdf/`:

- `phase5-structural.rdf` is the RDF/XML document loaded only by the Java
  oracle;
- `phase5-structural.dataset.json` is the independently constructed canonical
  RDF/JS quad fixture consumed directly by the JavaScript translator test;
- `phase5-structural.ofn` is the project-owned Functional counterpart used for
  full cross-syntax structural comparison; and
- `phase5-structural.java.json` is the pinned OWLAPI 5.5.1 structural snapshot.

The Phase 5 differential deliberately does not parse the `.rdf` file in
JavaScript: syntax parsing belongs to Phase 6. It compares the constructed
dataset translation with the Functional ontology in full, then compares
ontology identity, imports, counts and signature categories with the Java
snapshot. `phase5-malformed-list.rdf` is a separate black-box probe recording
that OWLAPI 5.5.1 accepts the two pinned W3C Rational fixtures' malformed
non-`rdf:nil` collection terminal. It is not a general compatibility fixture
and does not authorize silent list repair.

The harness deliberately has no WebVOWL, npm, or browser dependency. Generated
snapshots are test evidence and require their own fixture provenance record.
