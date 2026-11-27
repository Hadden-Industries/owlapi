# Java OWLAPI reference harness

## Current Java execution target

New Java work reads the single [`.java-version`](../../.java-version) selection through the [Java toolchain policy](../../docs/development/java-toolchain.md), which derives native and Windows package spellings.
That selection governs CI and records the shared executable policy.
Historical observations below retain their original JDK identities.

## Java/JS comparison

Use `npm run compare:java-js -- list --suite smoke` to inspect the published CGMES and SAREF inputs and the reduced witness.
`prepare` restores and verifies fixture and JAR bytes.
Publisher retrieval allows long transfers and stops after one minute without network progress.
Publisher gzip archives have a separate byte pin.
The cache stores the verified decoded fixture.
`run` uses the verified cache and records the source load, Functional Syntax transport, and native verdict for each case.
`verify` checks the original worker artifacts against the same requested case set.

The `prospects` suite covers direct loading and the applicable RDF/XML closure round trips.
Its typed stock IDMP behavior check verifies the Java and JS XML limits and their different import observations.
`--java-xml historical-idmp` selects a separate native configuration for the exact pinned IDMP input.
`--java-turtle owlapi` selects a separate case with Java's `TurtleDocumentFormat`.
Comparisons with exact mapped HTTP imports enable those imports in the normative profile through a local document loader.
The workers record unexpected network attempts.

The pinned normative-compatible ePO, IOF Core and ESCO closure cases verify a typed RDF/XML save refusal.
The merged models contain an ontology annotation whose predicate has no declaration.
The cases require equality for every original model and the merged model, an exact Java save and reload with missing-type generation disabled, and the specific JavaScript refusal with an empty target.
The root and import byte identities bind this check to the recorded inputs.

The corpus qualification roster selects the complete published import closure for IFC4 ADD2 in the `prospects` suite.
The catalogue pins the root and the CC BY 3.0 EXPRESS and LIST releases by SHA-256.
Use `--input building-smart-ifcowl --imports mapped` to select the same mapping explicitly.
The Java-compatible closure checks the declaration-preserving RDF/XML save and reload and records the default native writer result.
Normative compatible checks the exact singleton union reductions in the root, imported EXPRESS document and merged model.
The closure verifies native propagation and the exact JavaScript RDF/XML refusal for the undeclared license annotation.
Normative strict checks the typed refusal for that same annotation during loading and records the completed Java load.

Use `--suite ifcowl-recorded` for the incomplete-import regression.
It uses the historical EXPRESS stand-in and checks the exact 16 Java placeholder replacements in the direct source comparison, including the corresponding JavaScript restrictions.
Use `--input building-smart-ifcowl --imports recorded` to reproduce the raw historical comparison.
Publication qualification reconciles the versioned roster on both release routes and both platforms.

- [EXPRESS publication](https://pi.pauwel.be/evoc/express_W3ID/20151211/index.html)
- [LIST publication](https://pi.pauwel.be/evoc/list_W3ID/20151211/index.html)

Use `--input pistoia-idmp --imports mapped --java-xml historical-idmp` for the same original IDMP document with the publisher's Commons and LCC imports.
The catalogue pins 22 direct dependencies and the transitive LCC LanguageRepresentation ontology to [Commons 1.3](https://www.omg.org/spec/Commons/1.3/) and [LCC 1.2](https://www.omg.org/spec/LCC/1.2/).
The mapped cases have separate IDs and leave the recorded stand-in cases in the qualification roster.

The pinned Brick case in the Java profile verifies a duplicate ontology ID during load in both engines.
The receipt requires the same recorded import mappings, the complete JavaScript collision candidate set and a native exception naming one of those IDs.
Structural and writer comparisons are inapplicable after that load failure.

The ten previously local-only prospect inputs use publisher retrieval under the 2026-11-23 project-owner clearance recorded in the catalogue.
The clearance covers automated fixture retrieval, temporary runner caching and retained test reports.
The recorded source bytes, document IRIs and import mappings identify those cases.

The 2026-11-23 OBO acquisition records 22 new byte pins from publisher releases or publisher archives.
Each row retains the historical acquisition reason and reported length alongside its new source.
The wider suite keeps the recorded request IRI as the logical document base.
GAZ's verified Zenodo archive declares `http://purl.obolibrary.org/obo/TEMP` in the OWL document.
The shared client identifies the project to publishers.
Zenodo serves GAZ from its fixed file endpoint, which accepts a generic file request.
Preparation verifies all 1,308,877,129 bytes against the original SHA-256 before admitting the download for offline replay.
[Zenodo client identification](https://developers.zenodo.org/#user-agent) · [GAZ release](https://zenodo.org/records/18247183)
The OGG publisher's merged OWL download still returns HTTP 404.

Use `--suite ogg-archive --profile java-owlapi-5.5.1 --imports mapped` to compare the archived OGG base, worm and fruit-fly source documents.
Each case pins the OGG file and its own NCBI Taxonomy import from [SourceForge revision 67](https://sourceforge.net/p/ogg/code/67/tree/trunk/src/ontology/).
The two subset cases verify both engines' stock XML entity-limit refusals.
The base case requires a structural comparison.
The archive cases have independent IDs, while the recorded merged OGG document has its own acquisition record.
Use `--suite ogg-archive-entity-free` for Java-compatible structural comparisons of the worm and fruit-fly derivatives.
Preparation expands internal XML entities from the pinned archive with `ExpandRdfXmlEntities.java` and verifies the resulting bytes before caching them.
The recipe blocks external XML resources, preserves the logical document and taxonomy IRIs, and bounds output by the pinned byte length.
The complete conversion measured 629,574 expansions and 20,589,401 aggregate entity code units for the worm file, and 483,923 expansions and 15,872,386 code units for the fruit-fly file.
Each native case worker loads the corresponding original with the finite recipe allowance and compares its structure with the derivative.
The shared harness also compares the Java and JavaScript models for every member of the derivative's import closure.

The OGG sources credit Yongqun He, Yue Liu and Bin Zhao under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
The imported taxonomic material comes from [NCBI Taxonomy](https://obofoundry.org/ontology/ncbitaxon.html).

Use `--input obo-ovae-entity-free` for Java-compatible direct-load measurements of OVAE.
The same bounded recipe expands 24,184 internal entity references totalling 772,390 code units in the pinned original.
The Java worker compares the resulting model with the original, and both engines benchmark the same expanded bytes.

This corpus uses the Human Phenotype Ontology Consortium's HPO release of 2026-09-01.
Credit [Köhler et al. (2014)](https://doi.org/10.1093/nar/gkt1026) and the [HPO licence](https://human-phenotype-ontology.github.io/license.html).

Set `--cache` and `--output` to absolute paths outside the checkout.
Select the complete JDK with `--java-home`.
Local qualification of Temurin `25.0.5.1+2-LTS` uses `--java-selection 25.0.5+1.2`.
The release workflows select their shared pin through `.java-version`.

By default on Windows, the comparison command admits one run at a time into a Job Object.
The default job cap is 3 GiB of committed memory with a 1.5 GiB Node old-space setting.
Admission checks both available RAM and commit headroom.
The launcher terminates the job if either drops below the reserve.
Use `--no-memory-guard` or set `memoryGuard: false` in the `runComparison` environment to disable this job cap.
Unguarded JS workers inherit the calling process's Node options.

For a larger diagnostic, select one input and provide a process-tree budget and a Node heap that fits inside it.
The combination `--memory-budget-mib 10240 --node-heap-mib 8192` gives the worker room to profile a representative load when Windows admits that envelope.
Use `--java-heap-mib` when the JVM needs its own heap limit.
The large-literal scenario accepts a single test format with `--format turtle` or the corresponding Functional Syntax, RDF/XML, or OWL/XML selection.

Use `--scenario large-literal-rendering` to check the public Manchester object renderer.
The installed Java-profile renderer and released Java must produce the same quoted 33,554,433-character literal.
The default JS renderer must return a typed output-byte refusal on that literal.

The `rdfxml-writer` suite uses the same Functional Syntax fixture for seven writer modes.
Supply `--reference-checkout` with the built historical source revision in `pinned-version.json`.
The suite checks the original layout and separately uses Java to verify the reloaded structure.

The `canonical-vowl-dl` suite uses the same reference checkout.
It runs the 20 Functional Syntax input sequences and verifies the native OWL 2 DL verdicts and the JS preserve-mode formal and source assessments against their original expectations.

The `universal-ontology` suite also selects that historical Java revision.
It uses the pinned Universal Ontology Git objects and their original catalog mappings.
Supply the same released classpath or historical reference checkout to `verify` that the selected cases used in `run`.

The `rdfxml-corpus` suite checks the source RDF/XML adapter and translator against the recorded Wine, GeoNames and Schema.org expectations.
Use `prepare` with `--seed ID=PATH` for the original bytes, then run against the verified cache.
These observations cover the JavaScript pipeline.

The `format-performance` suite runs the 14 JavaScript format and mapping programs with their original sampling protocols.
Use `--input` to select a program such as `rdfxml`.
The suite retains the original samples and reports each program's result independently.

The `public-api-behavior` suite includes loader and writer configuration defaults, no-op identity and chained copies.
It compares the supported settings with released Java and checks the default JavaScript writer's copy policy separately.
It also observes enacted mutations, same-profile foreign manager changes and the model state after a rejected operation.
The ontology copy case records whether the destination is visible to its provider and which declarations survive a provider failure.
The load publication case records import visibility and retained state after a syntax failure, followed by a successful retry on the same manager.
The storage cases check target reuse, datatype parameters and retained failure bytes in Functional Syntax, Turtle, RDF/XML and OWL/XML.
The literal construction case checks all 678 factory invocations against the released reference and the original observations.
The query cases check deferred search consumption and import closure membership before and after changes.
The parser cases check selected parser outcomes, RDF metadata, OWL/XML enumeration and named datatype restrictions.
The profile identity case checks the selected manager, factory and configuration bindings and their state after a mismatched binding is refused.
The locality case checks exact subclass edges included from a fixed seed, including the effect of filtering a link in the chain.
The XML provider case verifies the configured expansion limits with a finite internal entity and checks an ordinary literal under the default JavaScript profile.
The JSON-LD cases compare first-object and first-array parsing with released Java and exercise the provider's recorded context whitelist through the public manager.
They also verify default context refusal, the normative context count, and authorization and reuse within the same JavaScript host authority.
The transport cases run released Java and the selected Node package against owned loopback HTTP fixtures and an owned file.
They compare redirect and attempt behavior, document base, compression fixtures, and JSON-LD context media, links and encodings, with separate host authorization checks.

Use `--measure performance` for fresh-process working-set and warmed load samples.
For a phase-isolated observation, select an input with `--load-only` and use the same selection for `run` and `verify`.
The default samples both engines in alternating fresh processes and stops each load clock before reading the ontology summary.
The summary digest covers the ontology and version IRIs, axiom and annotation counts, and direct import declarations.
Use the separate structural comparison to establish model equivalence.
Select `--load-engine java` or `--load-engine js` to measure just one runtime.
Use `--source-transport string` or `--source-transport stream` to exercise an explicit JavaScript source.
`--materialize-axioms` observes the public axiom collection after the load checkpoint.
`--load-engine js --allocation-profile` records two V8 allocation profiles per diagnostic sample.
The `-load.heapprofile` sample captures the live ontology after the load checkpoint.
The other profile comes from process exit.
On Windows the load-only route requires the memory job and records the selected heap and commit budgets.
Run `node --test util/owlapi-reference/qualify-windows-memory-job.mjs` on Windows to exercise the actual process-tree cap with a bounded allocation.

On Windows, run `node --test util/owlapi-reference/qualify-oversized-streams.mjs` to verify streaming input above the current V8 single-string limit.
This opt-in transport test loads Functional Syntax, OWL/XML, RDF/XML and Turtle in sequential 512 MiB Jobs with a 160 MiB Node heap.
Each document has two class declarations separated by 64 KiB ASCII chunks.
The OWL/XML case also writes the same input to a temporary file, loads it through a manager using `NodeDocumentLoader`, and removes the file.
Allow a little more than 512 MiB of free temporary disk space on the qualified runtime.

A ratio requires equivalent untimed structural evidence on the same profile and input.
The verifier checks the requested sample counts and calculates the summary from the retained observations.
Imported loads qualify for ratios only after independent agreement on every model in the loaded closure.
Mixed or incomplete loads retain their diagnostic observations.
The November six-ontology run includes full string/stream model comparisons, individual trial peaks, allocation samples and heap readings after releasing each ontology.
[Six-ontology measurements](../../docs/performance/2026-11-25-six-ontology-memory.json)
The `api-benchmarks` suite carries the 70 generated workload IDs and their raw historical or live observations.
Use `--benchmark-mode live` to collect fresh Java timings with the selected JDK and run the independent API witness on the same fixture sizes and source.
Each workload/profile row records a ratio only when its observations pass the equal-work checks.
Historical rows retain their Java baseline digest and diagnostic status.

`--benchmark-mode refresh --java-baseline <absolute-file>` replaces a complete Java baseline.
`--benchmark-mode missing --java-baseline <absolute-file>` measures only missing workload IDs using the same generator, parameters, platform, Java version and OWLAPI distribution.
Run `verify` with the same mode, baseline path and fixture selectors.
The default mode reads the existing baseline.

Use `--scenario strict-first` to measure a separate downstream retry.
A successful strict load ends the sequence.
A typed syntax, unsupported-construct or resource refusal starts a compatible load in a fresh manager on the same document.
The Java-compatibility profile can aggregate parser errors.
The runner retains their types and retries when every member of a nonempty aggregate is eligible.
The report retains the observed attempts and labels the released Java direct load as a separate diagnostic baseline.

The `release-semantics` selection derives its shadow roster from the catalogue and the recorded hold reasons.
List the frozen shard IDs with `compare:java-js list --suite release-semantics`.
Use `prepare`, `run`, or `verify` with `--shard ID` on the listed platform.
A shard run uses the same installed candidate and Java classpath admission as its individual cases.
The shard verifier retains the installed subject, oracle identity, roster hash and original report digest.
Release tooling derives the same roster before npm dependencies are installed.
It binds the candidate dependency to the verified tarball so the same installed graph compares across producer paths.
Upload that verification JSON and the original `report.json` together under the exact producing job and attempt.
The authenticated reader uses `verify --suite release-semantics --corpus-artifacts PATH` to recheck the original archive, admitted candidate and case coverage with read-only GitHub access.
Record the candidate's original producing job and attempt, including when a later partial rerun retained that package.
Promoted qualification can select a retained descriptor using the `corpus_qualification_artifact` dispatch input with its ID and SHA-256 joined by a colon.
The archive contains only `corpus-qualification-input.json`.
Fresh qualification consumes the descriptor produced in its own run through `CORPUS_QUALIFICATION_INPUT`.
A complete authenticated roster produces qualification manifest schema 3, whose original artifacts and coverage are rechecked at staging.
Mandatory corpus coverage begins after the full hosted shadow checks pass on both release routes.
Its verifier consumes receipts after the producer artifacts and installed candidate have been authenticated.
Accepted public behavior decisions without a registered case hold shadow qualification.
The stock IDMP direct and closure cases each require the typed XML refusals from both runtimes and the recorded import behavior.
Their dependent structure stages are inapplicable once those refusals are verified.
For the Universal Ontology closure checks, Java merges the verified JavaScript models and compares that merge with the JavaScript closure.
Both RDF/XML writer and reload results still contribute independent verdicts.
Every active Universal Ontology closure case disables native missing-type generation for the structural check.
The separate native default result retains the added declarations and its own reload verdict.
The pinned Java-profile ePO, CGMES Equipment, IOF Core and ESCO closures use the same structural check and retain the native default result.
Run the `js-closure-after-native-refusal` input with the normative profile and the closure scenario to check both independent outcomes.
The stock Java load records `JAXP00010004`, the JavaScript writer round trip matches in the native comparator, and the cross-engine structure remains blocked.
JavaScript stage failures retain their typed causes and the RDF statement when the parser reports one.
Long diagnostic text retains a prefix and a digest.

The official released Java OWLAPI 5.5.1 oracle, historical source-build pins and frozen performance timings retain their distinct identities.
Use [the 0.1.0 roadmap](../../docs/plans/2026-10-29-0.1.0-release-reconciliation.md#4-java-toolchain-and-oracle-migration) to select the appropriate oracle and preserve old evidence.

The `reference-behavior` suite registers 28 native Java observations.
On Linux x64 it compares the 27 available observations with a capture from the previous Temurin patch on Linux.
The Turtle writer emits platform line endings, so the comparison preserves the bytes and character counts specific to that host.
The remaining resource-contract observation holds the suite open.
The `reference-selected-api` suite uses the 15 original selected-API observations.
[Linux reference capture](../../docs/development/java-toolchain/temurin-25.0.5-linux-x64-behavior.json) · [Native oracle issue](https://github.com/owlcs/owlapi/issues/1187)

The `java-owlapi-5.5.1` behavior work uses the released `f760b3a4` authority,
Central/source paired captures and the current
[provenance manifest](../../docs/compatibility/profiles/java-owlapi-5.5.1/provenance.json).
The [profile evidence README](../../docs/compatibility/profiles/java-owlapi-5.5.1/README.md)
owns replay instructions and qualification status.
Historical harness sections below keep their original pins; they do not qualify the new behavior profile.

## Earlier harness authority

The older executable source pin is defined by `pinned-version.json`; as reconciled on 9 October 2026 it is `b61ebe2da83daceebb3e7ba7afbd2582c9240c33` (`owlapi-parent-5.5.1-9-gb61ebe2da`).
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
Alternatively, after building or restoring the verified pinned OWLAPI `5.5.1` (`b61ebe2da`) runtime closure once with `historical-reference-distribution.mjs materialize --reactor-targets <targets-dir> --maven-repository <m2-dir> --output <dist-dir>`, pass `--reference-distribution <dist-dir>` (or set `OWLAPI_REFERENCE_DISTRIBUTION`) so subsequent import-closure, Universal Ontology, and writer-configuration checks verify the SHA-256-sealed JARs directly without touching another active Java branch/checkout.
Set `OWLAPI_JAVA_BUILD_CACHE` or pass `--java-build-cache <dir>` (and `compare-java-js.mjs --java-build-cache <dir>`) to share one SHA-256-verified compiled helper class directory across processes while keeping per-run outputs, logs, and fresh JVMs isolated.
The launcher verifies the configured checkout or distribution before compiling or reusing the helper oracle.
An explicitly configured missing build, tampered JAR, ambiguous environment configuration, or mismatched revision fails; it is never treated as a skipped Java test.

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

### Universal Ontology qualification

CI and release qualification use the ISO/IEC 11179-3 edition 4, Reference Data, Core and Extended roots.
The [qualification manifest](universal-ontology.json) pins their common version, Git revision and source fingerprints, including the external imports.
The comparator and the shared GitHub checkout action derive the versioned paths from that manifest.
To switch versions, update the version, revision and fingerprints there, along with any changed import membership.

Use `npm run compare:java-js -- prepare --suite universal-ontology --profile normative-v1 --parsing-mode compatible --ontology-repository <checkout> --reference-checkout <built-java-checkout> --cache <absolute-cache> --output <absolute-preparation-directory>`.
Then use `run` and `verify` with the same suite, profile, parsing mode, reference checkout and cache, and a separate absolute result directory.
The suite checks seven source documents and four merged closures with the pinned source Java oracle.
It verifies each closure in Functional Syntax and RDF/XML, with offline import resolution and strict JavaScript reloads.

The suite requires exact structural equality.
The normative closure cases also require the expected import membership and clean source diagnostics.
The lossless Java RDF/XML control disables `addMissingTypes` so the round trip preserves the admitted axiom set.
The default Java writer's declaration additions are recorded separately.

Use `node scripts/verify-comparison-migration.mjs --jest <full-jest-report.json>` to check the required independent Jest assertions and probe inventory.
[Migration inventory](../../docs/compatibility/comparison-runner-migration.json)

Source mode records actual source bytes, including dirty changes.
Optional `--candidate <directory>` installs the retained tarball with scripts disabled and verifies its digest before testing the public package.
The runner uses the retained consumer lock when present.
Use `--offline` on a prepared installation to require that lock and restrict npm to its local cache.
This existing source/local-candidate mode does not fetch or qualify a public npm release.

After publication, pass `--registry-version <exact-package-version>` to both `run` and `verify` to exercise the public-registry package.
Place its `--output` directory outside the owlapi checkout; registry mode rejects an output under the repository, including ignored folders.
The registry option cannot be combined with `--candidate` and rejects tags or version ranges.
It creates an isolated consumer and empty cache, installs the version declared in the repository package manifest, verifies its public registry integrity and resolves its installed public exports.

The package has seven entry points; UO uses the five Java-shaped subpaths.
After artifact publication and verification, UO tests authorized remote import retrieval and its complete contract, then verifies the generated standalone ontology offline with zero loader calls.

A fully accepted RC may serve UO production without stable `0.1.0`; the source/local-tarball modes alone cannot.
Generated documents and source blobs are rechecked for changes at the end.
Reports, individual oracle JSON, parser diagnostics and native logs remain in the new output directory.

The qualification unit suite delegates public-package composition to a fixed test driver running in the current Node executable.
Node resolves and executes the real public modules; Jest asserts the returned evidence and generated files.

This preserves concurrent imports and the exact production qualification path without depending on Jest's experimental VM module linker, which can reject shared concurrent imports on Node 22.
Both supported Node lines run these same assertions; native failures and missing import mappings remain test failures.

CI and release verification prepare the pinned Universal Ontology sources, run their shared comparison and verify the results against the pinned source oracle.
Both workflows retain the diagnostics when a comparison fails.
The installed release candidate also needs its own qualification on the protected release path.

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
