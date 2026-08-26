# Java OWLAPI reference harness

This directory is development/test tooling only. It is never imported by the
package production graph, bundled into WebVOWL, or shipped as an `owlapi`
runtime dependency.

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
`docs/compatibility/expected-differences.json`.

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

The Phase 10 DL reference set is under `fixtures/dl/`. The `.dl`, `.ofn`,
`.rdf`, and `.ttl` documents are project-owned encodings of the same structural
ontology; `phase10-structural.java.json` is the pinned Java result for the DL
document. `GenerateDLSyntaxSnapshot.java` calls the pinned DL parser directly,
because generic manager selection can choose an unrelated parser for this
headerless syntax, and supplies the explicit default namespace required by a
format with no ontology header. It reuses only the structural JSON serializer
from `GenerateStructuralSnapshot.java`.

Compile both harnesses together, then run the specialized entry point:

```text
javac -cp "<owlapi-runtime-classpath>" -d util/owlapi-reference/target util/owlapi-reference/GenerateStructuralSnapshot.java util/owlapi-reference/GenerateDLSyntaxSnapshot.java
java -cp "util/owlapi-reference/target;<owlapi-runtime-classpath>" GenerateDLSyntaxSnapshot util/owlapi-reference/fixtures/dl/phase10-structural.dl urn:test:phase10
```

The specialized harness removes only terminal CR/LF characters before the
oracle call. OWLAPI 5.5.1 otherwise rejects an ordinary final line ending; the
normalization is recorded in the snapshot provenance and does not remove an
axiom. The shared differential fixture is deliberately restricted to the
subset accepted through the pinned parser's whole-document entry point. Focused
JavaScript tests separately cover assertion, inverse-property, numeric
data-one-of, attached-colon, trailing-whitespace, and unmatched-subclass cases
where that entry point is internally inconsistent. Those are controlled
compatibility corrections, not undocumented expected differences.

The Phase 11 KRSS2 reference set is under `fixtures/krss2/`. Its `.krss2`,
`.omn`, and `.owx` files plus the Phase 10 `.dl`, `.ofn`, `.rdf`, and `.ttl`
siblings encode one 12-axiom subset across every implemented syntax that can
express it; `phase11-structural.java.json` is the pinned KRSS2 result. The specialized
`GenerateKRSS2SyntaxSnapshot` harness invokes `KRSS2OWLParser` directly so
generic manager detection cannot select another headerless syntax. Its fixture
uses absolute names because OWLAPI 5.5.1 constructs malformed `Optional[...]`
bases for bare names in this oracle setup; JavaScript's document-relative name
policy is governed separately by focused tests.

On Windows systems where `java` resolves to a JRE but `javac` resolves to a
separate JDK, compile and run through the classpath launcher:

```text
javac -d util/owlapi-reference/target util/owlapi-reference/RunWithClasspath.java
java -cp util/owlapi-reference/target RunWithClasspath <classpath-file> util/owlapi-reference/target com.sun.tools.javac.Main -d util/owlapi-reference/target util/owlapi-reference/GenerateStructuralSnapshot.java util/owlapi-reference/GenerateKRSS2SyntaxSnapshot.java
java -cp util/owlapi-reference/target RunWithClasspath <classpath-file> util/owlapi-reference/target GenerateKRSS2SyntaxSnapshot util/owlapi-reference/fixtures/krss2/phase11-structural.krss2 urn:test:phase10
```

The Phase 17 original-KRSS reference set is under `fixtures/krss1/`.
`GenerateKRSS1SyntaxSnapshot` invokes `KRSSOWLParser` directly against a named
ontology so its bare-name behavior is deterministic and observable. The main
fixture pins the Java-reachable TBox subset; its accepted ABox statements are
absent from the Java snapshot because OWLAPI 5.5.1 discards their returned
axioms. Separate project-owned probes preserve evidence for cardinality token
shadowing, singleton Boolean objects, and the unreachable full-IRI token. Every
preserved behavior and controlled correction is enumerated in
`docs/compatibility/krss1-behavioral-oracle.json`.

Compile and run it through the same long-classpath launcher:

```text
java -cp util/owlapi-reference/target RunWithClasspath <classpath-file> util/owlapi-reference/target com.sun.tools.javac.Main -d util/owlapi-reference/target util/owlapi-reference/GenerateStructuralSnapshot.java util/owlapi-reference/GenerateKRSS1SyntaxSnapshot.java
java -cp util/owlapi-reference/target RunWithClasspath <classpath-file> util/owlapi-reference/target GenerateKRSS1SyntaxSnapshot util/owlapi-reference/fixtures/krss1/phase17-structural.krss urn:test:phase17
```

## Phase 16 OWL-to-RDF graph oracle

`GenerateRdfGraph.java` loads a structural ontology with the pinned public
OWLAPI API and saves it through `NTriplesDocumentFormat`. It sets
`addMissingTypes` to false so OWLAPI does not manufacture declaration triples
for every entity in the signature. The resulting N-Triples text is reparsed in
JavaScript and compared as an RDF graph; neither statement order nor blank-node
labels are evidence.

The focused reference pair is `fixtures/rdf/phase16-graph.ofn` and
`fixtures/rdf/phase16-graph.java.nt`. Java OWLAPI adds `rdf:type rdf:List` to
each list cell although W3C Mapping Table 1 defines only `rdf:first` and
`rdf:rest`. The differential test removes exactly the three such Java quads in
this fixture, asserts that exact count, and then requires graph isomorphism. No
other graph difference is normalized.

Compile and run the harness with the same pinned runtime classpath used by the
structural snapshot tools:

```text
java -cp util/owlapi-reference/target RunWithClasspath <classpath-file> util/owlapi-reference/target com.sun.tools.javac.Main -d util/owlapi-reference/target util/owlapi-reference/GenerateRdfGraph.java
java -cp util/owlapi-reference/target RunWithClasspath <classpath-file> util/owlapi-reference/target GenerateRdfGraph util/owlapi-reference/fixtures/rdf/phase16-graph.ofn
```

The harness deliberately has no WebVOWL, npm, or browser dependency. Generated
snapshots are test evidence and require their own fixture provenance record.
