# Java OWLAPI reference harness

The executable source pin is defined by `pinned-version.json`; as reconciled on 9 October 2026 it is `b61ebe2da83daceebb3e7ba7afbd2582c9240c33` (`owlapi-parent-5.5.1-9-gb61ebe2da`).
Historical fixtures and observations retain their recorded Java revisions; changing the current pin does not relabel their evidence.
Native bundle transport and hosted qualification were delivered at the earlier pin, but shared reuse is currently disabled because its accepted publication catalogue covers `d7e997a53b470e32700de89cc610d9daf01ea769`.
Use fresh native preparation and live comparisons for the current pin; see [ADR 0012](../../docs/adr/0012-gated-native-java-reference-reuse.md) for the implementation and operating history.

`RunRdfConsumerContract.java` is an offline Java 5.5.1 characterization of the 2 October RDF consumer repairs.
Compile and run with the pinned runtime classpath, using the Windows long-classpath launcher below if needed.
It preloads the two imported ontologies in memory, refuses unexpected import acquisition, and prints the actual native axioms, annotations, imports and metadata for six project-authored cases.
Two optional positional arguments identify the matched OntoViBe root and module paths; verify their manifest hashes before running and retain the observation outside the repository.
The observations justify the tests for inverse properties and imports.
The [metadata contract](../../docs/compatibility/rdf-parser-metadata.md) records retained JavaScript policies and deliberate differences.
Raw observations belong in external qualification evidence rather than being regenerated as test expectations.

## Local runtime bundle experiment

`reference-bundle.mjs` implements the residual local relocation boundary from [the input-aware CI plan](../../docs/plans/2026-10-03-ci-input-aware-qualification.md).
Maven's native `mdep.localRepoProperty` replaces repository prefixes but leaves reactor target paths and consumer placeholders to be handled.
This module admits a bounded directory payload and produces the existing consumer's classpath format; it does not resolve Maven dependencies, parse archives or execute Java classes.

The closed schema requires a local experiment purpose, `NOT_CLEARED` redistribution, exact upstream commit/tree, an input-observation record digest, ordered ordinal JAR paths and notice files with byte counts and SHA-256 digests.
The caller separately supplies the expected manifest, inventory, source and input-record identities.
Those expectations must come from retained independent observations, never be derived from the downloaded manifest during admission.
The observation digest is not a deployable compatibility key: complete native plugin/build inputs and the hosted environment policy still require qualification.

`verifyReferenceBundle({ bundleDirectory, expected })` verifies without writing.
`materializeReferenceBundle({ bundleDirectory, destination, expected })` verifies all bytes first, then copies those same in-memory bytes to a newly created private directory.
Its return value names `owlapi-runtime-classpath.txt`; the experiment operator places that file at the pinned checkout's existing consumer location.
No original absolute classpath, Git checkout, Maven cache, harness classes or comparison verdict belongs in the payload.
Current harnesses still compile and the selected comparisons still run.

Manifest bytes are limited to 256 KiB, individual files to 64 MiB, total payload to 128 MiB, inventory to 512 files and runtime to 256 JARs.
Admission rejects missing/extra files, reordered or duplicate runtime paths, escaping or aliased paths, links including Windows junctions, hard-linked files and content mismatches.
The caller owns a private, quiescent namespace and an existing private destination parent; filesystem checks are not a sandbox against a concurrent local writer.
An existing destination is preserved and refused.
A write failure may leave a new partial destination; the caller retains diagnostics and disposes of that task-owned directory before starting a fresh attempt.

This local experiment provides no authenticated producer, rights clearance, cross-image equivalence, hosted receipt, seeding or shared reuse.
CI continues building the pinned Java reference normally.
Public upload and activation retain the plan's separate gates.
Synthetic integrity fixtures in the module's unit tests are not native graph or Java behavioral evidence.

This directory is development/test tooling only.
It is never imported by the package production graph, bundled into WebVOWL, or shipped as an `owlapi` runtime dependency.

`GenerateStructuralSnapshot.java` loads one ontology through the pinned Java OWLAPI revision and emits a project-owned JSON snapshot containing ontology ID, imports, ontology annotations, axiom counts/canonical strings, and direct signature categories. Java output is behavioral evidence; production JavaScript is implemented from normative/public specifications and must not be translated from Java implementation control flow.

## Pinned oracle

The source revision and version evidence are recorded in `pinned-version.json`.
Build the local OWLAPI checkout at that exact revision with a JDK, then compile this harness against the resulting distribution and runtime dependency classpath.
Do not substitute the OWL2VOWL shaded JAR: its embedded OWLAPI is 5.1.1 and it is pinned separately only as the end-to-end VOWL oracle.

One reproducible setup is:

1. Check out the exact `sourceRevision` in `pinned-version.json` in the recorded OWLAPI source checkout (`b61ebe2da83daceebb3e7ba7afbd2582c9240c33` at the 9 October reconciliation).
2. Run the OWLAPI Maven build with tests skipped, preserving its resolved Maven dependency versions.
3. Build a runtime classpath for the OWLAPI distribution with Maven's dependency tooling.
4. Compile `GenerateStructuralSnapshot.java` with that classpath.
5. Run `GenerateStructuralSnapshot <input-ontology> [ignored-import-iri ...]`, capture standard output, and store the JSON beside the owning project fixture with the source revision recorded.
   Ignored import IRIs retain their declarations in the direct ontology snapshot but are not dereferenced.

On Windows, a fully resolved Maven runtime classpath can exceed reliable shell or Java argument-file handling.
`RunWithClasspath.java` is a test-tooling-only launcher for that case.
Compile it once, then invoke `RunWithClasspath <classpath-file> <harness-class-directory> <main-class> [args...]`; it starts the same JDK with the harness directory prepended to the classpath read from the file.
It neither resolves dependencies nor changes the pinned oracle identity.

The Phase 2 reference pair is `fixtures/functional/phase2-structural.ofn` and `fixtures/functional/phase2-structural.java.json`.
Regenerate it only from the pinned source revision and review any structural change through the governed zero-tolerance expected-difference process.

The lifecycle storage pair is `fixtures/storage/functional-all-kinds.ofn` and `fixtures/storage/functional-all-kinds.java.json`.
It covers every current structural kind except import declarations, which have separate counting-loader tests.
Its Java snapshot is produced by the same pinned harness; set Java's `-Dstdout.encoding=UTF-8` and `-Dstderr.encoding=UTF-8` explicitly when capturing Unicode output on Windows.
For the independent full-structure storage check, run `run-import-closure-contract.mjs` with this root, an empty OASIS catalog, and the Functional text emitted by `manager.saveOntology`.
No import is dereferenced, and the existing native oracle compares all structure modulo one anonymous-node bijection rather than comparing prefixes or serialized bytes.

The Phase 3 Java reference pair is `fixtures/manchester/phase3-structural.omn` and `fixtures/manchester/phase3-structural.java.json`.
The sibling `phase3-structural.ofn` is the project-owned Functional counterpart used for cross-syntax structural conformance.
The Java snapshot deliberately preserves OWLAPI 5.5.1's comparison-facet result; the two standards-correct JavaScript differences are matched only by the exact fixture-scoped rules in `docs/compatibility/expected-differences.json`.

The Phase 4 OWL/XML reference pair is `fixtures/owlxml/phase4-structural.owx` and `fixtures/owlxml/phase4-structural.java.json`. The sibling `phase4-structural.ofn` is the project-owned Functional counterpart used for cross-syntax structural conformance. The Java snapshot omits the anonymous individual inside one `ObjectOneOf`; JavaScript retains it as required by the W3C OWL/XML schema.
That single semantic divergence is calculated as an atomic field and accepted only by its exact fixture-scoped expected-difference rule.

The Phase 5 RDF reference set is under `fixtures/rdf/`:

- `phase5-structural.rdf` is the RDF/XML document loaded only by the Java oracle;
- `phase5-structural.dataset.json` is the independently constructed canonical RDF/JS quad fixture consumed directly by the JavaScript translator test;
- `phase5-structural.ofn` is the project-owned Functional counterpart used for full cross-syntax structural comparison; and
- `phase5-structural.java.json` is the pinned OWLAPI 5.5.1 structural snapshot.

The Phase 5 differential deliberately does not parse the `.rdf` file in JavaScript: syntax parsing belongs to Phase 6.
It compares the constructed dataset translation with the Functional ontology in full, then compares ontology identity, imports, counts and signature categories with the Java snapshot.
`phase5-malformed-list.rdf` is a separate black-box probe recording that OWLAPI 5.5.1 accepts the two pinned W3C Rational fixtures' malformed non-`rdf:nil` collection terminal.
It is not a general compatibility fixture and does not authorize silent list repair.

The Phase 10 DL reference set is under `fixtures/dl/`.
The `.dl`, `.ofn`, `.rdf`, and `.ttl` documents are project-owned encodings of the same structural ontology; `phase10-structural.java.json` is the pinned Java result for the DL document.
`GenerateDLSyntaxSnapshot.java` calls the pinned DL parser directly, because generic manager selection can choose an unrelated parser for this headerless syntax, and supplies the explicit default namespace required by a format with no ontology header.
It reuses only the structural JSON serializer from `GenerateStructuralSnapshot.java`.

Compile both harnesses together, then run the specialized entry point:

```text
javac -cp "<owlapi-runtime-classpath>" -d util/owlapi-reference/target util/owlapi-reference/GenerateStructuralSnapshot.java util/owlapi-reference/GenerateDLSyntaxSnapshot.java
java -cp "util/owlapi-reference/target;<owlapi-runtime-classpath>" GenerateDLSyntaxSnapshot util/owlapi-reference/fixtures/dl/phase10-structural.dl urn:test:phase10
```

The specialized harness removes only terminal CR/LF characters before the oracle call.
OWLAPI 5.5.1 otherwise rejects an ordinary final line ending; the normalization is recorded in the snapshot provenance and does not remove an axiom.
The shared differential fixture is deliberately restricted to the subset accepted through the pinned parser's whole-document entry point.
Focused JavaScript tests separately cover assertion, inverse-property, numeric data-one-of, attached-colon, trailing-whitespace, and unmatched-subclass cases where that entry point is internally inconsistent.
Those are controlled compatibility corrections, not undocumented expected differences.

The Phase 11 KRSS2 reference set is under `fixtures/krss2/`.
Its `.krss2`, `.omn`, and `.owx` files plus the Phase 10 `.dl`, `.ofn`, `.rdf`, and `.ttl` siblings encode one 12-axiom subset across every implemented syntax that can express it; `phase11-structural.java.json` is the pinned KRSS2 result.
The specialized `GenerateKRSS2SyntaxSnapshot` harness invokes `KRSS2OWLParser` directly so generic manager detection cannot select another headerless syntax.
Its fixture uses absolute names because OWLAPI 5.5.1 constructs malformed `Optional[...]` bases for bare names in this oracle setup; JavaScript's document-relative name policy is governed separately by focused tests.

On Windows systems where `java` resolves to a JRE but `javac` resolves to a separate JDK, compile and run through the classpath launcher:

```text
javac -d util/owlapi-reference/target util/owlapi-reference/RunWithClasspath.java
java -cp util/owlapi-reference/target RunWithClasspath <classpath-file> util/owlapi-reference/target com.sun.tools.javac.Main -d util/owlapi-reference/target util/owlapi-reference/GenerateStructuralSnapshot.java util/owlapi-reference/GenerateKRSS2SyntaxSnapshot.java
java -cp util/owlapi-reference/target RunWithClasspath <classpath-file> util/owlapi-reference/target GenerateKRSS2SyntaxSnapshot util/owlapi-reference/fixtures/krss2/phase11-structural.krss2 urn:test:phase10
```

The Phase 17 original-KRSS reference set is under `fixtures/krss1/`.
`GenerateKRSS1SyntaxSnapshot` invokes `KRSSOWLParser` directly against a named ontology so its bare-name behavior is deterministic and observable.
The main fixture pins the Java-reachable TBox subset; its accepted ABox statements are absent from the Java snapshot because OWLAPI 5.5.1 discards their returned axioms.
Separate project-owned probes preserve evidence for cardinality token shadowing, singleton Boolean objects, and the unreachable full-IRI token.
Every preserved behavior and controlled correction is enumerated in `docs/compatibility/krss1-behavioral-oracle.json`.

Compile and run it through the same long-classpath launcher:

```text
java -cp util/owlapi-reference/target RunWithClasspath <classpath-file> util/owlapi-reference/target com.sun.tools.javac.Main -d util/owlapi-reference/target util/owlapi-reference/GenerateStructuralSnapshot.java util/owlapi-reference/GenerateKRSS1SyntaxSnapshot.java
java -cp util/owlapi-reference/target RunWithClasspath <classpath-file> util/owlapi-reference/target GenerateKRSS1SyntaxSnapshot util/owlapi-reference/fixtures/krss1/phase17-structural.krss urn:test:phase17
```

## Phase 16 OWL-to-RDF graph oracle

`GenerateRdfGraph.java` loads a structural ontology with the pinned public OWLAPI API and saves it through `NTriplesDocumentFormat`.
It sets `addMissingTypes` to false so OWLAPI does not manufacture declaration triples for every entity in the signature.
The resulting N-Triples text is reparsed in JavaScript and compared as an RDF graph; neither statement order nor blank-node labels are evidence.

The focused reference pair is `fixtures/rdf/phase16-graph.ofn` and `fixtures/rdf/phase16-graph.java.nt`.
Java OWLAPI adds `rdf:type rdf:List` to each list cell although W3C Mapping Table 1 defines only `rdf:first` and `rdf:rest`.
The differential test removes exactly the three such Java quads in this fixture, asserts that exact count, and then requires graph isomorphism.
No other graph difference is normalized.

Compile and run the harness with the same pinned runtime classpath used by the structural snapshot tools:

```text
java -cp util/owlapi-reference/target RunWithClasspath <classpath-file> util/owlapi-reference/target com.sun.tools.javac.Main -d util/owlapi-reference/target util/owlapi-reference/GenerateRdfGraph.java
java -cp util/owlapi-reference/target RunWithClasspath <classpath-file> util/owlapi-reference/target GenerateRdfGraph util/owlapi-reference/fixtures/rdf/phase16-graph.ofn
```

The harness deliberately has no WebVOWL, npm, or browser dependency.
Generated snapshots are test evidence and require their own fixture provenance record.

## Import-closure acceptance oracle

`run-import-closure-contract.mjs` and `RunImportClosureContract.java` form a development-only, offline acceptance oracle for a consumer-produced collapsed import closure.
They are not package exports and are excluded from the npm runtime surface.

The launcher delegates each format to its owning implementation:

- `@xmldom/xmldom` establishes XML well-formedness, and the WHATWG URL/file APIs resolve catalog-relative URI references;
- native JSON serialization and Jackson exchange the catalog mapping manifest and the single machine-readable result;
- Git verifies that the local OWLAPI checkout is exactly the revision recorded in `pinned-version.json`, while `javac`, the JVM, and the existing `RunWithClasspath` launcher compile and execute against its resolved runtime classpath; and
- Java OWLAPI loads the root and imports, computes the complete closure, merges direct axioms through `OWLOntologyMerger` with `mergeOnlyLogicalAxioms = false`, and supplies structural OWL-object equality.

Repository code enforces only the acceptance invariants those authorities do not know: the supported catalog subset is exactly OASIS XML Catalog `catalog`/`group` containers with exact `uri` entries; mappings are unique and local; unsupported rewrite, delegate, chained-catalog, and extension constructs fail closed; the root full ontology ID and only its direct ontology annotations are restored; output imports are empty; and all axioms plus ontology annotations must agree under one injective anonymous-individual mapping and its reverse.
HTTP, HTTPS, and FTP URL handlers are denied in the oracle JVM, and a missing authored-import mapping fails before fallback resolution.
JSON-LD HTTP clients can bypass those handlers, so the oracle also enables RDF4J's secure mode with an empty context-resource allowlist and jsonld-java's remote-context prohibition before constructing parsers.
These are the libraries' supported controls ([RDF4J settings](https://rdf4j.org/javadoc/latest/org/eclipse/rdf4j/rio/jsonld/JSONLDSettings.html), [jsonld-java network policy](https://github.com/jsonld-java/jsonld-java#controlling-network-traffic)).
Inline contexts remain supported; external contexts fail closed.
Regression tests route an otherwise default-allowed context URL through a loopback HTTP proxy and require that the proxy receives no request.

Set `OWLAPI_REFERENCE_CHECKOUT` to an isolated checkout of the exact revision recorded in `pinned-version.json`.
Its `sourcePathForPhase0Evidence` remains historical provenance and is not runtime configuration.
The launcher verifies the configured checkout with Git before compiling the oracle.
An explicitly configured missing build or mismatched revision fails; it is never treated as a skipped Java test.

Build the reference and its runtime classpath with Maven from that checkout:

```text
mvn -B -ntp -pl distribution -am -Dmaven.test.skip=true -Dno-javadoc=true -DincludeScope=runtime -Dmdep.outputFile=target/owlapi-runtime-classpath.txt package dependency:build-classpath
```

Running both goals in the same reactor uses the freshly built OWLAPI module jars.
No installation into the shared Maven repository is required.
From this repository, configure the reference location and run the contract:

```powershell
$env:OWLAPI_REFERENCE_CHECKOUT = "<pinned-owlapi-checkout>"
```

```text
node util/owlapi-reference/run-import-closure-contract.mjs --root <root-document> --catalog <catalog.xml> --verify-output <collapsed-document>
```

The focused Jest suite uses that same environment variable to enable its Java integration tests.
Without it, the portable launcher tests still run and Java integration tests are explicitly skipped; such a run is not oracle evidence.

Standard output contains exactly one JSON object.
It identifies the pinned revision and loaded OWLAPI version; lists closure member ontology/version IDs; reports expected and actual direct counts; records the anonymous-individual bijection size; classifies the comparison outcome and mismatch path; and includes catalog-resolution and zero-network evidence.
Compiler, JVM, parser, and diagnostic text is confined to standard error.
Compilation is accepted only when `javac` returns zero and emits no diagnostic on either stream, so an internal compiler failure cannot be mistaken for usable evidence solely because a partial class file was written.

Ontology identity comparison uses the ontology and version IRI optionals; Java's per-load anonymous ontology identifier is not serialized identity.
Anonymous-individual matching uses a bounded explicit work stack, so the JVM call-stack depth does not grow with the number of axioms.
Structural equality and anonymous-individual substitution remain delegated to Java OWLAPI.

The synthetic fixture under `fixtures/import-closure/` deliberately combines a cycle, root version IRI, a duplicate declaration, an imported annotation that must not be copied, within-document anonymous sharing, and the same authored anonymous label in two different source documents.
Synthetic and real-family runs are permitted as provisional Task 14 development evidence before baseline reconciliation.
Neither constitutes final release acceptance: fresh evidence from the reconciled candidate remains required after the pinned source-integration baseline and accepted Phase 21 commits are ancestors.

### July source-driven parsing and import-closure reconciliation

Run `npm run test:universal-ontology -- --ontology-repository <checkout> --output <new-result-directory>`.
This fail-closed command covers all four original July variants at Universal Ontology revision `e2c667f3584b8fb705671cada0fe205b1000b617`: ISO11179-3 edition 4, reference-data, core and extended.
It consumes only original source blobs; historical `-full` documents and VOWL projections are not reference outputs.

The report separates four parsing results (18 direct-document comparisons in their original import contexts) from eight fresh closure results (Functional Syntax and RDF/XML).
Parsing includes each document's own annotations and imports.
Closures retain only root ontology identity and ontology annotations, plus the structural union of direct axioms.
All resolution remains offline.

Native Java OWLAPI owns structural equality and the independent merge of the compared JavaScript document models.
Exact specification-grounded differences use the one expected-difference ledger; unknown, ambiguous or stale rules fail.
Raw Java outcomes remain visible alongside reconciliation outcomes.
The [named OWL-Time restriction decision](../../docs/compatibility/july-ontology-reconciliation.md) explains why a reconciled pass for core/extended is not raw Java equality.
July ledger rules apply to direct document differences, not to the closure root.
Closure reconciliation instead requires `propagationEvidence` to match with no allowed differences after Java merges those reconciled document models.
The standalone Java oracle exits with code 1 for unparsed source RDF and retains `SOURCE_UNPARSED_RDF`; only the qualification command adjudicates that evidence against the exact ledger.
Do not treat a raw oracle exit as the reconciled result.

Source mode records actual source bytes, including dirty changes.
Optional `--candidate <directory>` installs the retained tarball with scripts disabled and verifies its digest before testing the public package.
This existing source/local-candidate mode does not fetch or qualify a public npm release.
After publication, run the same command with `--registry-version 0.1.0-rc.1` to exercise the public-registry package.
Place its `--output` directory outside the owlapi checkout; registry mode rejects an output under the repository, including ignored folders.
The registry option cannot be combined with `--candidate` and rejects tags or version ranges.
It creates an isolated consumer and empty cache, installs the exact native alias `npm:@hadden-industries/owlapi@0.1.0-rc.1`, verifies actual scoped identity/integrity and resolves only its installed public roots.
The package has seven entry points; UO uses the five Java-shaped subpaths.
After artifact publication and verification, UO tests authorized remote import retrieval and its complete contract, then verifies the generated standalone ontology offline with zero loader calls.
A fully accepted RC may serve UO production without stable `0.1.0`; the source/local-tarball modes alone cannot.
Generated documents and source blobs are rechecked for changes at the end.
Reports, individual oracle JSON, parser diagnostics and native logs remain in the new output directory.

The qualification unit suite delegates public-package composition to a fixed test driver running in the current Node executable.
Node resolves and executes the real public modules; Jest asserts the returned evidence and generated files.
This preserves concurrent imports and the exact production qualification path without depending on Jest's experimental VM module linker, which can reject shared concurrent imports on Node 22.
Both supported Node lines run these same assertions; native failures and missing import mappings remain test failures.

The required Node 24 CI job builds the exact Java revision with Maven, runs native oracle regressions, executes both July checks and retains their artifacts, including failures.
This adds development evidence only; it does not change the release workflow or replace final qualification of the integrated scoped RC against the pinned baseline and Phase 21.

### Local native build-input observations

`nativeReferenceRecipe` and `captureNativeReferenceObservation` in `reference-build-observation.mjs` support the next local reference experiment.
The recipe returns argument arrays for Maven's exact Help 3.5.2 and Dependency 3.11.0 goals; it does not execute a command or construct a shell command string.
Supply a task-owned Maven repository, empty user home and fresh report directory.
Both user and global settings scopes use the included credential-free offline `reference-build-settings.xml`.
Clear inherited Maven/JVM option injections and disable Maven startup scripts in the native orchestration.
A missing offline input is a failed experiment, with no automatic download or version fallback.

Retain native Maven and Java version output as `maven-version.txt` and `java-version.txt`; redirect active-profile output to `active-profiles.txt`.
The exact goals produce `effective-pom.xml` and `runtime-tree.json`; copy the native distribution classpath to `runtime-classpath.txt`.
The tree report may contain appended native reactor JSON objects; this module does not parse or normalize them.
`plugins.txt` is the native project/report-plugin superset, including unexecuted goals.
An already retained report may be used with its original provenance stated explicitly; do not claim it ran under a new recipe.
The seal does not establish any report's correspondence to the declared recipe; carry retained-report provenance alongside it and inspect both records together.
Keep command exit statuses and raw logs outside the seven-file report directory.
Never use `help:system` or unreviewed effective settings/environment dumps here.

The sealer observes clean native Git commit/tree identity, hashes the seven raw reports, recipe and settings, retains the expanded recipe as a **caller declaration**, and creates an exclusive output file outside the report directory.
It defaults to the established upstream pin; an explicit expected revision may be used for a separately identified local fixture.
Each report must be nonempty, regular, unlinked and at most 8 MiB; the total is bounded at 32 MiB.
Input aliases and unexpected files are rejected.
The caller owns a private, quiescent namespace; these checks do not sandbox a malicious concurrent local writer.
Git-ignored files and retained `target/` outputs are outside that source identity.
A warm local package run therefore does not prove a fresh compilation cost.

The record expressly marks report origins and recipe execution as unauthenticated caller evidence.
Sealing does not validate report semantics, successful native execution, dependency/plugin byte closure, exact JDK build identity or environment equivalence.
Its digest identifies this **local observation**, with a null semantic compatibility key, uncleared redistribution and disabled shared reuse.
It cannot authorize a public bundle or replace fresh CI qualification.
The local Maven version is recorded as observed; this experiment neither upgrades the environment nor represents that version as the current stable production selection.
The recipe does not control Maven toolchains files or JVM startup home; those remain explicit environment-policy gaps despite the declared Maven user home.
