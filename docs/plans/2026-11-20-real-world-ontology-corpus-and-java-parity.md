# Qualify OwlAPI and reduce RDF/XML loading memory with one Java/JS comparison harness

**Reviewed 20 November 2026 · findings consolidated 21 November 2026 · proposed R2 change.**

**Where to resume.**
The tested CGMES parser patch brings the named Java profile into structural agreement with released Java on all 5,608 axioms in the published Equipment vocabulary.
It is ready for integration into OwlAPI.
Four neighbouring property-role cases still differ.
Start with the [pilot results and next implementation step](#cgmes-pilot-results-and-next-implementation-step).
The [replay appendix](#replay-the-tested-cgmes-patch) contains the exact patch, runnable comparison and test commands.

Build one development-only Java/JS comparison harness for structure, observable behavior and performance, including peak memory.
It owns the case definitions, verified inputs, runtime selection and result identities for all three measurements.
A fresh checkout must be able to run a case by ID and trace a difference to the statement, operation or stage that produced it.
The memory milestone compares JS with released Java OWLAPI on the same ontology-loading operation, attributes the measured gap and verifies the effect of a targeted optimization.
Activate full-corpus semantic qualification as soon as the structural and behavioral checks pass in shadow on the fresh and promoted-CI release paths.
Every subsequent release candidate must provide complete semantic evidence.
Performance migration continues on its own schedule.
CGMES is the first correctness case.
FOVT and ICEO are the first memory cases.

On 20 November 2026 the owner selected one development harness, early activation of the full semantic release gate, and Java-referenced memory diagnostics.
All 70 historical benchmark workloads carry forward.
A documented diagnostic-only row is a valid migration outcome.
Callers of retired development tools migrate independently.
The [decision tree](#decision-tree) and [runner migration map](#runner-migration-map) record how to deliver those decisions.
The [Java measurements](#direct-java-loads-on-the-original-obo-files) establish a first reference point.
The document remains an implementation plan.
The HISEW planning basis is `hadden-industries-plan-software-change` and its adjacent engineering, selection, performance and resource guidance at `software-engineering-workflow@cc5e1a41acaf`.
The inspected product baseline is `7145bb831bd659191b8522872f5839a15137c482`.
The runner inventory was checked on `zero-one-zero@5103b1f4c881695ecf753d3a9adc8a8b6b69ddf8`, the commit that added the original plan.
Public parsing contracts, repeatable release evidence and the ability to process legitimate inputs at scale warrant the elevated route.
The OwlAPI maintainer owns behavior decisions and acceptance.
The CI/release maintainer owns toolchain and fixture delivery.
The implementer owns measured fixes.
An independent reviewer checks the semantic or performance oracle used to accept each change.

**Run index**

| Question                                                              | Results in this plan                                                                                                                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which published ontologies gave different Java and JS models?         | [31 comparison records from 24 prospect collections](#published-document-comparison), including import handling, writer failures and the inconclusive FIBO comparison.                                        |
| Which downstream inputs needed repairs or appeared to change on save? | [Six transformed inputs and 179 Functional Syntax round trips](#downstream-repairs-and-serializer-observations), plus the [178-document wider loading sweep and 23 acquisition gaps](#wider-sweep-inventory). |
| Where did the loaders use memory?                                     | [JS heap and worker peaks](#rdfxml-memory-baseline) and [18 fresh native Java loads on six pinned inputs](#direct-java-loads-on-the-original-obo-files), with the limits of cross-engine comparison.          |
| What did the later CGMES work fix, and what can I run today?          | [The candidate, regression tests and four remaining differences](#cgmes-pilot-results-and-next-implementation-step) and [the runnable replay](#replay-the-tested-cgmes-patch).                                |

For implementation, use [the harness contract](#one-javajs-comparison-harness), [fixture acquisition](#fixture-acquisition-for-the-comparison-harness) and [the implementation slices](#implementation-slices).
The [prospect inventory](#prospect-inventory), [import maps](#import-maps), and [wider sweep inventory](#wider-sweep-inventory) contain the source identities and historical outcomes needed to reproduce the investigation.
A planning inventory supplies initial pins.
At implementation, the machine-readable fixture catalogue takes ownership of executable pins.
Keep this dated baseline as history.

## CGMES pilot results and next implementation step

The 20 November pilot used two copies of OwlAPI source at `d6d874a8af461f93efa502a6c158cc8c4cf88e7e`.
One copy ran the original parser.
The other ran the three-file patch reproduced in this document.
The product checkout at that revision still contains the original parser.

| Implementation decision                            | Evidence available on 21 November                                                                                                                             | Next action                                                                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integrate the named-profile CGMES change           | The original Equipment vocabulary matches released Java in full. The seven regression tests distinguish the original parser from the candidate.               | Take the tested patch into SLICE-004 and register the original input, reduced examples and SAREF control through the SLICE-001 public loaders. Recheck on the actual integration revision.    |
| Investigate the four remaining property-role cases | Java and JS give the same property two different kinds of domain axiom. The four differences predate the patch.                                               | Keep each as a failing native comparison. Trace how Java types the domain independently of the property’s logical use before broadening the rule. Qualify ASAM and CIDOC on their own inputs. |
| Measure large RDF/XML loads                        | The original FOVT, ICEO and CIDO loads have JS and native Java observations. The CGMES patch was qualified for correctness.                                   | Use FOVT and ICEO for allocation attribution and CIDO as the control in SLICE-010. Use equivalent completed loads to evaluate any SLICE-011 optimization.                                     |
| Activate the release gate                          | Local source qualification covers two published documents. The common coordinator, installed-candidate evidence and both hosted shadow paths are outstanding. | Follow SLICE-003 and SLICE-012 for the full semantic roster. Track migration of all 70 performance workloads separately.                                                                      |

### What changed in the real electricity model

Lines 1570–1577 of the Equipment vocabulary describe `cim:ACLineSegment.r`, the positive-sequence series resistance of an AC line segment, as a generic `rdf:Property`.
Its `rdfs:domain` names `cim:ACLineSegment`.
A publisher annotation, `cims:dataType`, names `cim:Resistance`.
Released Java preserves both statements.
In the starting JS model both were absent.
The candidate preserves their exact IRIs, subjects and values through the public JS loader, Functional Syntax output and an independent Java reparse.
The publisher file identifies the CoreEquipment-EU/3.0 version, gives version information 3.0.0 and an issue date of 27 January 2021.
Its source pin is in [original byte pins](#original-byte-pins).

Both JS profiles below used compatible parsing.
“Java only” and “JS only” count direct axioms after the native structural comparison.
The eight comparisons also checked ontology identity, imports, ontology annotations and anonymous-individual structure.
All reported zero network attempts.

| Published input and JS behavior profile     | Original JS axioms | Candidate JS axioms | Native Java axioms / ontology annotations | Java only / JS only, original → candidate          |
| ------------------------------------------- | -----------------: | ------------------: | ----------------------------------------: | -------------------------------------------------- |
| CGMES Equipment · `java-owlapi-5.5.1`       |              5,410 |               5,608 |                                5,608 / 20 | 418 / 220 → **0 / 0**                              |
| CGMES Equipment · `normative-v1`            |              5,410 |               5,410 |                                5,608 / 20 | 418 / 220 → 418 / 220, identical difference arrays |
| ETSI SAREF Core 4.1.1 · `java-owlapi-5.5.1` |                669 |                 669 |                                  669 / 23 | 0 / 0 → 0 / 0                                      |
| ETSI SAREF Core 4.1.1 · `normative-v1`      |                669 |                 669 |                                  669 / 23 | 0 / 0 → 0 / 0                                      |

The 418 missing CGMES axioms were **209 annotation-property domains and 209 publisher datatype assertions**.
The 220 excess axioms were explicit object-property declarations.
A recovered role lets a property participate in a domain, range or assertion.
An explicit OWL declaration adds a separate axiom.
The native result distinguished the two.

The patch adds one Java-profile policy in `internal/behavior/ontologyBehaviorContext.js`.
In `internal/mapping/rdfToOwlTranslator.js`, compatible reconstruction reuses the property evidence index.
A conclusive range supplies the logical role without adding a declaration.
In the absence of a conclusive range, eligible generic properties receive an annotation role.
Existing OWL types take precedence.
Object-only characteristics and named properties used in `owl:onProperty` restrictions guard the fallback.
The third file, `internal/mapping/cgmesPropertyRole.test.js`, exercises the rule through the public API.

### Controls and remaining differences

| Probe                                  | Observation                                                                                                                                                                                                                                                                                                                          | Meaning for the implementation                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Four reduced native comparisons        | The generic RDF property, explicit annotation type, reversed statement order and changed publisher value all matched Java on the patched named profile. Changing only the publisher value from `R` to `S` changed the matching assertion while preserving its count. Normative serialization kept its prior digest in every variant. | Assert the domain, annotation value and explicit declarations individually. Equal totals alone can miss a wrong value.                              |
| Seventeen adjacent named-profile cases | Native structural matches rose from 9 to 13. Four newly matched cases were a domain alone, an IRI-valued use on an individual, their combination, and the latter with publisher metadata.                                                                                                                                            | An early candidate broke an explicit inverse and an existential restriction. Both match Java with the tested guard.                                 |
| Four outstanding cases                 | A domain paired with an existential restriction or a subproperty relation, each with and without publisher metadata. Each has exactly one Java-only `AnnotationPropertyDomain(P C)` and one JS-only `ObjectPropertyDomain(P C)`, identical before and after.                                                                         | The fixture names are `domain-restriction`, `metadata-restriction`, `domain-subproperty` and `metadata-subproperty`. The replay generates all four. |
| Repository tests                       | Adding only the seven new tests to the baseline produced three failures and four passes. Applying the complete patch produced **845 passing tests in six affected Jest suites**, including all seven new cases.                                                                                                                      | This is local source evidence. The installed package, full corpus and release paths have their own acceptance criteria below.                       |

### Timing and run provenance

Five fresh Node processes per source version loaded the structurally matching SAREF control under the named profile, alternating which version ran first.
All ten produced the same Functional Syntax SHA-256, `d409cadff8873cc0c83eb7299fab338a3096cf0e23ed687fef1a69da1fba3d3f`.
The peak is the process high-water mark through return from the public load.
It includes process startup.

| SAREF public JS load           |           Original source |                 Candidate |
| ------------------------------ | ------------------------: | ------------------------: |
| Median wall time (min–max), ms |       139.9 (131.6–159.5) |       140.7 (121.4–155.9) |
| Median user / system CPU, ms   |                  172 / 78 |                  188 / 78 |
| Median peak RSS (min–max), KiB | 190,332 (190,224–190,688) | 190,772 (190,416–191,004) |

The timing ranges overlap.
This control supports equivalent work on SAREF.
A speed or memory claim for large RDF/XML still requires the [Java-referenced memory measurements](#direct-java-loads-on-the-original-obo-files) and the planned matched JS trials.
The CGMES versions returned different models, so their load times cannot establish a like-for-like improvement.

The pilot used Node 26.13.1, npm 12.2.2 and Windows x64 Temurin 25.0.5+8.
Native OWLAPI reported `5.5.1.2024-09-07T21:41:32Z`.
Java loaded the original with explicit syntax, strictness disabled, annotation axioms enabled and missing imports set to throw.
The pilot verified every byte length and SHA-256 in the 64-entry ordered Central classpath.
The initial local cache supplied 53 correct JARs.
Eight had different bytes and three were missing.
The isolated cache obtained the remaining eleven from Maven Central.
An early Jest invocation contacted the npm version notifier.
The final qualification disabled the notifier and ran npm offline.

Five synchronous API requests contributed to the patch and tests on 20 November UTC.
Three terminal usage records amounted to $0.453896.
Two interrupted streams lacked final usage receipts and retained a combined allowance of $0.7701775.
Maximum recorded exposure was $1.2240735 against the approved $20.
The tested bytes incorporate local corrections and a refinement driven by the inverse and restriction counterexamples.
Replaying the result needs no paid inference.

## Decision tree

| Branch                     | Settled direction and reason                                                                                                                                                                                                                                                                 | What determines the next step                                                                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Comparison harness         | **Owner decision.** One CLI and coordinator bind the same scenario, inputs and operation to both runtimes. Caller migration is separately owned.                                                                                                                                             | Prove each family's assertions under the new harness and retire its superseded developer entry points. There are no compatibility shims or overlap releases.                                                                                                 |
| Input identity and custody | One reviewed fixture catalogue supplies original byte digests and logical bases to the coordinator. Small redistributable witnesses live in Git. Bulk objects use verified storage.                                                                                                          | Keep the pinned July Git provider. A missing lawful, durable source blocks that individual cold-restoration claim.                                                                                                                                           |
| Behavior and comparisons   | Test normative strict, normative compatible and the named JS Java profile explicitly. The normative hierarchy and independently observed Central 5.5.1 behavior determine each expected result. Direct parsing, writing and reloading have independent outcomes.                             | Where an existing authority explains the result, add the assertion. A genuinely new public guarantee requires a separately versioned contract decision.                                                                                                      |
| Execution and evidence     | Qualify the latest GA Temurin LTS for both supported Java hosts. Stream detailed oracle results to a file. Cache hits and short process summaries cannot prove structural equivalence.                                                                                                       | Vendor platform availability, exact executable admission, and complete artifact validation decide readiness.                                                                                                                                                 |
| Resource use               | **Owner decision.** Measure Java and JS on equivalent public loads and attribute the gap. All 70 benchmark IDs remain accountable, including documented diagnostic-only workloads.                                                                                                           | Qualify a ratio only with independent evidence of equivalent completed work. Record the precise blocker for each diagnostic row. Existing performance gates retain their requirements.                                                                       |
| Qualification              | **Owner decision.** Activate the gate when the structural and behavioral corpus checks pass in shadow on both release paths. Performance migration can still be in progress. Every release candidate then needs an outcome for every admitted original and applicable closure/profile stage. | The verifier checks the full frozen roster and candidate identity. A missing or inconclusive required result holds promotion. Consolidation finishes later when all three measurements use the shared harness and their prior obligations are accounted for. |

The release obligation covers semantics.
The memory investigation runs on a suitable measurement host.
Rights, JDK supply and allocation ownership are factual implementation dependencies.
Escalate an actual public-contract or capacity conflict for the affected case.

## What the measurements establish

### Published-document comparison

On 18 November 2026 JS at `6fd4e6011b9452fc0d3a0c06b00fd05cd90e969c` generated Functional Syntax for each model it could produce.
The Java harness loaded the original root non-strictly with annotation axioms enabled and compared it with Java’s reparse of the JS output.
It ran on JDK 25 with the legacy XML settings below, local module mappings and empty external stand-ins.

The historical driver supplied `f760b3a4c107c6d5f90f856e5680c39b18af646f` as a revision label and `5.5.1` as the expected runtime string.
It used a classpath file from a sibling source checkout.
The receipts record the short runtime string.
They do not attest the ordered JAR digests of the official Central distribution.
Preserve these observations as historical leads.
A fresh locked comparison establishes release-profile behavior.
Check the in-memory JS model, its Functional serialization, the native reparse and the comparator separately when attributing a difference.

The 24 collections produced **31 historical comparison records**.
Use the final 20:56 UTC run from 18 November for this count.
The earlier two-case smoke and first full attempt preceded the correction that gave closure storage its own outcome.
In particular, ePO matched at direct parse time before its closure writer failed.
Nine matched structurally.
Fourteen root scenarios loaded in Java while JS rejected the input or an imported member.
Seven produced models with structural differences.
FIBO exhausted a comparison limit.
The denominator is 22 single documents, eight GLEIF root scenarios and one DDI-CDI top-level closure with 16 supporting modules.
In a failing closure the parser can first encounter the defect in an imported document.
Preserve that document and IRI in the failure result.
Some Java loads left unparsed triples.
GS1, Europeana, Brick and IDMP carried the raw diagnostic `SOURCE_UNPARSED_RDF`.
The seven model-difference records include the harvested Brick and IDMP differences.
That diagnostic limits their whole-file structural verdict.
FIBO stopped for a different reason, `COMPARISON_LIMIT`.
An `ONTOLOGY_ID` difference reported against an absent JS model requires a successful JS load before it can be interpreted as an identity defect.
A direct parse match can coexist with a closure storage failure.
The structural runner selected the default `normative-v1` profile with `parsingMode: "compatible"`.
Separate spot checks at `7145bb83` explicitly selected each JS profile on original files.
A focused final check used JS source at `7145bb83`, the 64-JAR release lock and the Windows JDK identified in the memory measurements.
On the original CGMES RDF/XML, both JS profiles produced 5,410 direct axioms against native Java’s 5,608.
Both comparisons reproduced the same 209 missing domains, 209 missing datatype assertions and 220 extra declarations.
SAREF served as the positive control, matching Java structurally in both profiles on 669 axioms and 23 ontology annotations.
All four comparisons reported zero network attempts.
These checks qualify the two baseline observations at `7145bb83`.
The [later candidate comparison](#what-changed-in-the-real-electricity-model) records the outcome after applying the CGMES correction to `d6d874a8`.
Release evidence still requires the installed candidate and full roster.

| Case             | Retained observations and individual regression witnesses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CGMES            | Java had 5,608 direct axioms and JS 5,410. On range-less `rdf:Property` subjects, Java kept 209 `AnnotationPropertyDomain` and 209 `cims:dataType` annotation assertions missing from JS. JS added 220 explicit declarations for recovered, ranged properties. For `cim:ACLineSegment.r` require the Java-profile domain `cim:ACLineSegment` and annotation value `cim:Resistance`. Labels and comments can survive even while these two statements disappear. Both JS profiles in the spot check emitted zero `cims:dataType` assertions. CGMES has no imports. The `cim:` prefix expands to `http://iec.ch/TC57/CIM100#` and `cims:` to `http://iec.ch/TC57/1999/rdf-schema-extensions-19990926#`. |
| CIDOC CRM        | Java had 3,783 direct axioms and JS 4,092. The 309 extra JS declarations comprised 290 object-property and 19 data-property declarations. An entity in the signature need not have an explicit declaration axiom. Assert both separately.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ASAM OpenLABEL   | The source uses the nonstandard term `rdfs:Property`. Java recovered domains and ranges from the available range evidence. JS missed 31 data-property domain/range pairs and two object-property pairs, a total of 66 axioms (Java 1,333, JS 1,267). Retain the publisher’s spelling in the fixture.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Brick            | Of 620 Java-only named annotation assertions, 356 used `qudt:applicableUnit`. Others included SHACL predicates and `qudt:hasDimensionVector`. One witness is `brick:Alternating_Current_Frequency qudt:applicableUnit unit:GigaHZ`. The subject is typed `brick:Quantity`. JS also emitted two object-property equivalences and one sub-data-property axiom absent in Java. The whole-file totals were 49,863 versus 23,450 axioms, with anonymous-component differences. The 620 explain only part of the discrepancy. Five imports were stood in.                                                                                                                                                  |
| Pistoia IDMP     | All 348 Java annotation assertions paired with JS object-property assertions have the same predicate, subject and value. Six use `compliesWith`, 160 use `isMemberOf` and 104 use `isDefinedIn`. JS also emitted six object-property equivalences absent in Java. The raw difference also included 96 Java-only and 94 JS-only `SubClassOf` entries. Investigate these separately. There were 22 external stand-ins. An isolated named-profile JS probe also encountered its XML entity budget. Classify that result before drawing semantic conclusions.                                                                                                                                            |
| GeoSPARQL        | The default compatible parser kept eight contributor links and nine anonymous node types, while losing 34 annotation assertions describing the contributors and publisher, including names and affiliations. Java had 676 axioms and 28 ontology annotations. Default JS had 642 and 21. Current named Java-profile JS had 676 and 21, including all nine anonymous-node names. Compare annotation identities, node sharing and values even when the axiom totals match. No imports are needed.                                                                                                                                                                                                      |
| ifcOWL           | The 34 differing subclass expressions include Java-generated `http://org.semanticweb.owlapi/error#Error13` and singleton `ObjectUnionOf` expressions. A source witness is `IfcArcIndex`. Classify each with the actual source restriction or union and the normative mapping.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Java diagnostics | Java left 1,053 triples unparsed in GS1, 14 in IDMP, 10 in Europeana EDM and two in Brick. Preserve the triples and their graph identity. A successful Java load or a known diagnostic does not adjudicate an unrelated axiom difference.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| RDF/XML writer   | ePO and CGMES reported “requires well-formed full IRIs”. IOF, IDMP, GeoSPARQL, Brick, ifcOWL and ESCO failed lossless storage verification. ePO, IOF and ESCO had matched at direct parse time. These are merged-closure writer observations. Java writing/reloading those closures requires a new measurement.                                                                                                                                                                                                                                                                                                                                                                                      |
| Comparator       | FIBO reported `comparisonOutcome=ERROR`, `mismatchCategory=COMPARISON_LIMIT` and no completed structural verdict, with 124,162 direct axioms on each side. Its scratch summary also says `reconciliation=PASS`. Reconciling the available difference fragments establishes nothing about the unfinished comparison. Brick’s 190.2 s native path included JVM startup, two parses and comparison. The 2.7 s JS path included output generation.                                                                                                                                                                                                                                                       |

**Six lenient-input families.**
In the historical Java environment each as-published root loaded.
Confirm the precise native recovery under the admitted Central lock before changing either JS profile.
In the original standalone named-profile probes, Europeana loaded.
GS1 and QUDT rejected datatype use, GLEIF Base rejected a string cardinality, and RealEstateCore rejected the range.
INSPIRE failed parser selection under the supplied media hint.
A separate probe on the merged DDI input rejected an empty key.
An earlier strict CGMES probe reported `UNSUPPORTED_CONSTRUCT` for an unconsumed RDF statement.
For each family preserve the original document and independently exercise the smallest input that exhibits Java’s actual recovery.
A repaired source or a synthetic merger answers a separate question.

| Published input | Historical default JS rejection                                    | Historical recovery to verify against locked Java                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GS1 and QUDT    | A datatype was used as a class expression.                         | In GS1, some ranges lead to both data and object property use, including 83 dual-category properties in the investigation. In QUDT, `LatexString` becomes both a class and a datatype and a subclass of `xsd:string`. Test retained and dropped statements. |
| INSPIRE Address | `owl:versionIRI` requires an IRI object.                           | Java discards the string-valued version IRI. Supply the captured Turtle syntax/document IRI even when served as plain text, and distinguish parser selection from mapping rejection.                                                                        |
| DDI-CDI         | The `owl:hasKey` RDF list requires at least one item.              | Java preserves a key with zero properties. Resolve the top-level file and every module including `Agents.onto.ttl`.                                                                                                                                         |
| GLEIF           | A string cardinality fails the non-negative integer literal check. | Java reads a string of digits such as `"1"` as the cardinality 1. The collection had 28 string cardinalities. Include valid integer-typed literals and a malformed non-numeric string as controls.                                                          |
| RealEstateCore  | An annotation property range requires an IRI.                      | Java can type `rec:substance` as both a data and an annotation property on the list-valued range.                                                                                                                                                           |
| Europeana EDM   | An annotation property domain requires an IRI.                     | Java loads the source with unparsed RDF, and the JS Java profile already loads it. Check the resulting domain, diagnostics and residual graph individually.                                                                                                 |

### Downstream repairs and serializer observations

Six transformed inputs loaded under JS compatible parsing in the downstream investigation.
The transformations identify reasons a consumer could progress, and supply diagnostic controls for SLICE-007.
Use the publisher originals to decide which recoveries a public parser should provide.
In particular, removing an empty DDI key discards a statement that the historical native Java reader kept.

| Input           | Transformation that allowed the downstream load                                                                                                                                                             | SHA-256 of transformed bytes                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| GS1             | Retyped one datatype union and 83 properties. Removed one annotation range.                                                                                                                                 | `7a382ff04f3b14ef9f0d2065d416ba3ca6dcbdd87a7bc2f906fe1db1d8871212` |
| QUDT            | Removed six datatype-subclass statements and twelve datatype-as-class type statements.                                                                                                                      | `8b11a306061e62d7a6c08d7e962f1576caacd4bb97fc3d159240ee744fcf680d` |
| INSPIRE Address | Converted one literal version to an IRI. Historical Java omitted that version IRI.                                                                                                                          | `c5aa1dd78d4bb8ca0c97996403fee96526dc8c115afae3605d7be6db5094feea` |
| DDI-CDI, merged | Removed two empty `owl:hasKey` lists. In the publisher modules both occur in `ddi-cdi/15` (`StructuredDataTypes.onto.ttl`) on `cdi:Selector` and `cdi:SpecializationRole`, reached via `00 → 05 → 07 → 15`. | `e92aeca2c3f846e61d90409d55c0f7e275075c3cd211a1333ae8d734bff911bb` |
| GLEIF, merged   | Retyped 28 digit strings as `xsd:nonNegativeInteger`.                                                                                                                                                       | `8dea8c8b11a43755fa1428c227828752835c3ef0220368f34c75000dd2ef6363` |
| RealEstateCore  | Removed one range on `rec:substance`. The historical native reader retained evidence for two property categories.                                                                                           | `5afe94d848eba3991cdd30ba110a7603649707bcac958923863ae19382e6dbf9` |

The four single-document inputs are identified in [original byte pins](#original-byte-pins).
The downstream input digests for the two mergers, before transformation, were `49642a29176b98fda83cb40d7b50b0a091e478f7ed4d022bd056e887124e7991` (DDI-CDI) and `0a412760fc58b3ce648287e55183a11512d709fdb8a1a4641d99aa78f4b3c4a9` (GLEIF).
The [import maps](#import-maps) identify their individual publisher modules.

An early 18 November JS sweep at 13:00 UTC analysed 44 wider inputs.
Sixteen loaded in strict mode, 25 in compatible mode, two were rejected and CLO exhausted the worker.
Nine of these produced different raw axiom keys after a Functional Syntax save and reload.
The wider investigation later acquired 178 OBO/W3C documents. Of these, 78 loaded strictly, 85 compatibly and 15 were rejected. The CLO retry and other heap incidents are recorded under [RDF/XML memory baseline](#rdfxml-memory-baseline).

Across **179 recorded Functional Syntax round trips** from the wider and prospect work, 122 had identical raw key sets and 57 had equally many missing and extra keys.
The latter comprise 47 OBO, four W3C and six prospect inputs.
The check saved a JS model, reloaded it in a fresh same-profile manager at `urn:ontology-findings:round-trip.ofn` in compatible mode with remote imports disabled, and compared per-axiom `structuralKey()` strings.
Every retained sample of a difference contained an `OWLAnonymousIndividual`.
An anonymous individual's document scope can change across reload.
Whether any axiom or shared anonymous structure was actually lost remains open.

<details>
<summary>All 57 raw-key witnesses, with missing keys per side</summary>

The count for each ID applies on both sides.
The OBO and W3C names use the corresponding prefixes in the [wider inventory](#wider-sweep-inventory).

| Cohort    | ID and count                                                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OBO, A–E  | agro 246, aism 280, bco 88, bspo 242, cdno 120, cheminf 81, dideo 20, ecao 242, ecocore 368, epio 12, exmo 254                                                       |
| OBO, F–L  | fbbi 192, fovt 418, gallont 218, genepio 16, geno 154, geo 1, gsso 6, iao 28, ico 390, labo 6                                                                        |
| OBO, N–P  | nbo 192, oae 1,053, obcs 28, occo 28, ohmi 70, ohpi 278, ons 17, ovae 49, pbpko 172, pco 59, pdro 193, phipo 192, plana 222, planp 190, prefer 28, proco 21, pso 402 |
| OBO, R–Z  | ro 219, sepio 219, stato 240, swo 198, t4fs 28, wbbt 219, wbls 192, wbphenotype 192, zeco 2                                                                          |
| W3C       | dcat 30, shacl 4, sosa 2, ssn 2                                                                                                                                      |
| Prospects | Brick 6,645, Europeana 4, FIBO 2, GeoSPARQL 9, QUDT 19,597, RealEstateCore 164. QUDT and RealEstateCore used the transformed bytes identified above.                 |

</details>

For SLICE-008/013, start with SOSA (two keys on each side), a named-only control and a deliberately changed shared blank node. Require a consistent bijection across the whole model that preserves annotation values and shared nodes. Compare the pre-save model with the reloaded model and use an independent reader to attribute any remaining difference. SLICE-009 separately tests the observed RDF/XML merged-closure writer failures.

### RDF/XML memory baseline

In the 18 November downstream sweep the JS library identified itself as `0.1.0-rc.3+3191b95a884fdc4567719d411a8387a9d2b87efd`.
It attempted strict normative parsing, then compatible normative parsing after a recoverable rejection, then the Java behavior profile where needed.
The initial sample covered RDF/XML inputs of at least 2 MiB that succeeded under the original 8 GiB setting, before the five retries. Across those 70 documents the measurement was **204 MiB median JS heap immediately after load per MiB of input**, with a maximum of 767. Median peak worker RSS was **294 MiB per MiB**, maximum 860. Earlier synthetic RDF/XML gave roughly 70 MiB of heap per input MiB.
Peak RSS includes all attempts and subsequent analysis in the same worker.
Post-load `heapUsed` is a sample and can include collectible objects.

Five files exhausted an 8 GiB old-space setting.
Increasing the worker setting from 8,192 to 16,384 MiB and reducing concurrency from two to one on a 31.7 GiB host rescued all five in under five minutes.
The downstream resource settings included 64 MiB input, 128 MiB expanded XML, 5 million axioms, 20 million quads, 5 million blank nodes, 50 million tokens and a 180-second loader timeout inside a 420-second worker timeout.
Those are workload settings.
The package’s production defaults have their own authority.

| OBO document             | Input MiB | Successful rung | Direct axioms | Heap after load MiB | Peak worker RSS MiB | Load across attempts, s |
| ------------------------ | --------: | --------------- | ------------: | ------------------: | ------------------: | ----------------------: |
| CLO                      |      36.2 | Compatible      |       306,208 |              10,357 |              11,642 |                    51.9 |
| FOVT                     |      41.8 | Compatible      |       181,716 |              12,946 |              14,541 |                    63.5 |
| ICEO                     |      35.6 | Strict          |       366,115 |              10,804 |              11,898 |                    28.5 |
| MRO                      |      63.8 | Strict          |       420,165 |               7,894 |              12,058 |                    44.8 |
| VBO                      |      62.0 | Compatible      |       267,961 |               9,157 |              13,763 |                    79.7 |
| CIDO, successful control |      44.8 | Compatible      |       411,208 |               5,039 |               7,278 |                    37.2 |

Measure FOVT both directly in compatible mode and through strict rejection followed by compatible loading.
ICEO exercises a large single successful strict parse.
CIDO is larger on disk than FOVT and used substantially less heap.
These three distinguish the impact of graph shape, an unsuccessful first attempt, and downstream retention.
The full wider sweep had 78 strict successes, 85 compatible successes and 15 rejections among 178 acquired sources.

### Direct Java loads on the original OBO files

On 20 November 2026 a planning probe performed **18 direct public loads**, three fresh Windows x64 JVMs for each of the five incident files and CIDO.
The parent read the kernel’s process-lifetime peak working set immediately after the public load returned, with the ontology reachable and before enumerating its axioms.
The VM sampled used heap at return without forcing GC.
The working set includes cold JVM startup, manager and input preparation, parsing and model publication.
Compiler work, structural comparison, serialization and downstream analysis ran outside this measurement.
First, reverse and rotated case orders kept each file from always occupying the same position.
[Windows process memory accounting](https://learn.microsoft.com/en-us/windows/win32/api/psapi/ns-psapi-process_memory_counters)

| Source | Java peak working set MiB, min / median / max | Java used heap at return MiB, median | Java direct axioms | Earlier JS direct axioms |
| ------ | --------------------------------------------: | -----------------------------------: | -----------------: | -----------------------: |
| CLO    |                               780 / 868 / 877 |                                  507 |            306,182 |                  306,208 |
| FOVT   |                               909 / 914 / 940 |                                  529 |            181,310 |                  181,716 |
| ICEO   |                               849 / 871 / 916 |                                  338 |            366,115 |                  366,115 |
| MRO    |                             954 / 980 / 1,129 |                                  489 |            420,165 |                  420,165 |
| VBO    |                         1,378 / 1,415 / 1,438 |                                  555 |            267,744 |                  267,961 |
| CIDO   |                               861 / 872 / 876 |                                  360 |            411,208 |                  411,208 |

All six inputs matched their catalogued size and SHA-256.
For reproduction use Windows 11 Pro x64 build 26300, i9-12900K with 24 logical CPUs and 32,476 MiB visible RAM, Temurin `25.0.5+8-LTS` and the 64 Maven Central JARs admitted in the lock’s exact execution order, size and hash.
The lock SHA-256 was `53caf8d60ad073dc9485df59d67abd250c61a56a35cab7851c9ab1c88ab26374`, `java.exe` was `f961fb8db73c7c546821bc6d30fdaa8ce2458da460a5e75e2c39189cd107e6ba` and the JDK `release` file was `0901bfa0f4a7675de11c8a2f518272a4698624073f074e32a0393c3f0fb3b3d1`.
The VM used its normal ergonomics and reported 8,120 MiB maximum heap.
The 63-entry classpath in a local source checkout did not match the release lock and was excluded.
Historic runs retain the oracle identity they actually recorded.

Load the catalogue’s UTF-8 document with `OWLManager.createOWLOntologyManager()`, `StringDocumentSource`, the recorded retrieval IRI and an explicit `RDFXMLDocumentFormat`.
Use released Java’s non-strict parse, load annotations, block external DTD/schema retrieval and network access, and fail on unexpected imports.
Each resulting model reported zero declared imports.
Capture the Windows peak working set in bytes at an acknowledged post-load checkpoint in the still-live JVM, convert to MiB and read counts after that checkpoint.
Repeat with a fresh process per sample and record actual tool identities on future hosts.

The measurements establish Java-side occupancy for the selected direct load.
Historical JS peaks came from a downstream worker that could retry a failed strict parse and perform analysis.
CLO, FOVT and VBO also produced different axiom counts between Java and historical JS.
Matching counts for ICEO, MRO and CIDO still need structural verification.
A like-for-like cross-engine ratio requires a fresh, isolated JS run and independent model comparison.
Only about 7.4 GiB physical memory was free at the planning check, well below several historical JS worker peaks, so paired large JS runs belong on the suitably provisioned measurement host.

The observer recorded the following unrounded samples in acquisition order.
The first RSS sample was taken after constructing the manager and document source.
In all 18 captured JVMs the kernel's pre-load high-water mark equaled this first RSS reading (208–523 MiB rounded).
Every post-load peak exceeded it.
These checkpoints show that the high-water mark increased during the load window.
They do not identify which allocation caused the peak.
The peak sample covers the lifetime of the JVM through return from the public load call.
The heap sample is used Java heap at that checkpoint.

```tsv
case	trial	beforeRssBytes	peakWorkingSetBytes	heapUsedAtReturnBytes
obo-fovt	1	397074432	953294848	554387928
obo-iceo	1	347308032	960262144	322764176
obo-cido	1	418988032	914526208	375265672
obo-clo	1	355799040	920010752	532029160
obo-mro	1	218390528	1000140800	505080264
obo-vbo	1	547655680	1508036608	979880752
obo-vbo	2	547848192	1444478976	581443552
obo-mro	2	218951680	1183838208	589596640
obo-clo	2	355258368	910434304	540947792
obo-cido	2	419483648	918319104	377696976
obo-iceo	2	346906624	912867328	353969136
obo-fovt	2	397242368	958046208	548657912
obo-clo	3	355962880	817692672	345181608
obo-mro	3	218746880	1028030464	513094888
obo-vbo	3	547897344	1483431936	544030464
obo-fovt	3	397078528	985280512	554921152
obo-iceo	3	345919488	889856000	362865336
obo-cido	3	418615296	902909952	379272824
```

## Requirements and acceptance

| Requirement                                             | Acceptance criterion and quality scenario                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-01 · Reproducible corpus                            | AC-01 / QA-01. A clean Linux or Windows checkout can prepare any cleared selection by ID. Offline replay preserves its exact bytes, logical bases and import graph after relocating the cache. Tampering, upstream drift, an unavailable required input or a rights hold produces an attributable incomplete result. Reconcile the full inventory to the appendices.                                                                                                                                       |
| REQ-02 · Released Java authority                        | AC-02 / QA-02. Both JS profiles consume the same original bytes as verified Central 5.5.1. Each result binds the actual profile, settings, executable and ordered artifact digests. A wrong JDK build or changed JAR is refused before accepting a comparison.                                                                                                                                                                                                                                             |
| REQ-03 · Explain semantic differences                   | AC-03 / QA-03. Each named witness has an expected axiom, annotation, import, diagnostic, or expected typed refusal under each applicable profile. A mutation of one predicate, graph edge or literal fails even when aggregate counts remain identical.                                                                                                                                                                                                                                                    |
| REQ-04 · Independent stage evidence                     | AC-04 / QA-04. A writer failure leaves usable parse evidence. A comparison limit leaves the case undecided. A large valid result is consumable. Interrupted output cannot appear complete or be reused as success.                                                                                                                                                                                                                                                                                         |
| REQ-05 · Scalable legitimate loads                      | AC-05 / QA-05. Collect repeatable per-input peaks, model observations and allocation owners at the public load boundary. Admit Java/JS comparisons only for equivalent work. Demonstrate a JS reduction beyond control variability, or show independently why the remaining occupancy is required or already comparable. An inadmissible Java comparison leaves that ratio unqualified and the within-JS diagnosis active. Preserve semantics, diagnostics and the existing governed performance controls. |
| REQ-06 · Complete candidate qualification               | AC-06 / QA-06. Qualify the complete semantic roster against the installed release tarball on both fresh and promoted-CI paths. Activate the gate immediately after successful shadow qualification on both paths, including when SLICE-014 is still running. Missing, stale, unexpected or inconclusive required evidence holds promotion. Existing performance gates also apply.                                                                                                                          |
| REQ-07 · One comparison harness with preserved coverage | AC-07 / QA-07. Register a scenario once and run all applicable measurements through one coordinator. Map every prior assertion, parameter variant and required execution to a witnessed successor or continuing independent gate. Account for all 70 benchmark IDs and both profiles. Document the reason for every diagnostic-only row and exclude it from qualified ratios. A weaker assertion or a newly skipped live check fails migration.                                                            |

## One Java/JS comparison harness

**DEC-07 · One case definition and execution path.**
The proposed repository command is `npm run compare:java-js`.
Its proposed native entry is `util/owlapi-reference/compare-java-js.mjs`, exposing the same `runComparison(request, environment)` operation to CLI and programmatic callers.
Local investigations, Jest comparison tests, candidate qualification and benchmark jobs must call the same programmatic coordinator.
It expands the selection, prepares an immutable case, selects the verified JS package and Java reference, dispatches workers, and attaches their results to the same case.
Keep this tooling outside the published package.
The Java and JS workers call their respective public APIs independently.
The native OWL comparator, W3C expectations and approved profile rules retain authority for their own verdicts.

A **fixture** identifies original bytes, logical bases and imports, or a deterministic generated input.
A **scenario** identifies the initial state and ordered public operations, arguments, effective settings, observation points and expected results for each profile.
A **case** binds the scenario to specific inputs and parameters.
For example, the same FOVT bytes support two cases, a direct compatible load and a strict-first retry sequence.
Register each operation sequence once.
A suite is a selection of cases.
Keep existing fixture/operation inventories as referenced inputs to the registry where they already own the facts.

| Measurement   | What the worker observes                                                                                                                                                                                                                             | What the verifier decides                                                                                                                                                                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `structure`   | Ontology identity, direct and closure membership, imports, annotations, typed axioms and blank-node sharing at the declared load/merge/save/reload boundary.                                                                                         | Apply native OWL equality or the declared RDF graph comparator, retain diagnostics, and adjudicate complete differences against the applicable profile rules.                                                                                                                                           |
| `behavior`    | For each public operation record acceptance or refusal, return value, error category and failure phase, ordered callbacks, resource attempts, diagnostics, and any observable manager/target state after success or failure.                         | Compare the observation to the contract for that profile. Test default settings as defaults and explicit limits as overrides. A verified normative refusal and a successful Java-compatible call can both satisfy the same scenario. Keep zero, boundary, over-limit and partial-effect cases distinct. |
| `performance` | Execute the same public operation in separate controlled Java and JS workers. Record warmed latency and fresh-process peak working set independently under DEC-06. Preserve the historical heap-delta sampler wherever that is the original measure. | Require an untimed structural or behavioral witness for equivalent completed work before admitting a cross-engine ratio. Preserve raw timings, memory and the reason a comparison is unqualified. Correct output, boundary behavior and resource consumption are three independent answers.             |

Give each case a stable scenario ID/version, concrete fixture digest or generator version/parameters, base/import-policy digest, operation boundary, initial state and configuration. File-free API cases can construct a model or supply an event sequence. A small generator recipe such as “repeat `x` 33,554,433 times” is sufficient. Keep hand-authored expectations and Java-derived observations independent of the implementation under test. Add the actual JS candidate/dependency graph, behavior profile, Java/JDK/classpath identity, harness digest and attempt to the execution record.
Each result adds its measurement, stage and protocol/units.
A single case can therefore link all three results without conflating a captured Java observation with a new Java process.

A worker receives the resolved case and returns typed observations or verified artifact references.
Shared code owns roster expansion, input resolution, oracle admission, process supervision and result publication.
Workers own language-specific API bindings, clocks and observation collection.
They must use the input and effective settings in the resolved case.
Reuse an untimed native observation across profiles only when its complete execution identity permits reuse.
A performance-only selection must resolve qualifying untimed evidence for the same workload or execute the prerequisite outside the measurement process.
If equivalence is unproved, mark the workload/profile `diagnostic-only`.
Retain its ID, protocol, raw observations, the exact reason a comparison is unqualified and the independent evidence that would permit qualification.
Keep these rows visible in the inventory and out of qualified ratios, rankings and performance gates.
Identify frozen historical timings explicitly.
Perform expensive semantic verification outside the measured interval.
Dispatch each public workload through its registered language implementation in every applicable measurement.
Enable recording or clocks at the specified boundary.
The superseded commands are checkout development tools.
A dry run of `npm pack --dry-run --ignore-scripts --offline --json` for `@hadden-industries/owlapi@0.1.0` contained neither the reference runners nor the benchmark scripts.
The package declares no `bin`.
Its `./util` export exposes the library utilities in `util/index.js`.
[Package exports and file list](../../package.json)

Remove each retired developer command, script path and duplicated controller after proving its replacement’s coverage.
Caller migration is independently owned and outside this plan.
Do not add shims, forwarding aliases, old-flag parsers, report-format adapters or an overlap release.
A pinned predecessor may execute during a bounded shadow comparison.
That run establishes coverage and carries no promise that the old interface will remain available.

**Cross-mode acceptance test.**
Register a new fixture and a generated boundary scenario in one test registry.
Exercise the canonical CLI and programmatic entry with combined and individual measurement selections.
Observations for the same work must have the same input and operation identity and distinct measurement receipts.
Changing only the base IRI, a generator parameter or an operation step invalidates the affected receipts in every mode.
A missing Java worker, a JS checksum in place of the expected structural witness, or retained timing data labeled as a new memory sample must fail the corresponding claim.
CI verifies the new harness invocation and its actual worker execution.
Comparison clients delegate case selection and verdict calculation to the single coordinator.
CI and release verifiers independently derive the required roster from trusted policy and check the evidence against it.

### Runner migration map

Paths below are relative to the OwlAPI checkout.
Each row identifies the current coverage owner, the destination inside or alongside the single harness, and the evidence required for cutover.
Counts are checkpoints at the inspected revision.
Freeze exact IDs and assertions again at implementation intake so subsequent additions are included.

| Existing runner and consumers                                                                                                                                                                                                                            | Consolidation action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Coverage that must survive                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:universal-ontology`, `util/owlapi-reference/qualify-universal-ontology.mjs`, `run-ontology-parsing-contract.mjs`, `run-import-closure-contract.mjs`                                                                                        | Register `universal-july` from the July manifest. Carry its distinct source, candidate and registry selection and input validation into the canonical suite. The legacy command and flag spellings can retire. Extract its pinned Git provider and JS evidence producer for reuse by the coordinator. Register `RunOntologyParsingContract.java` and `RunImportClosureContract.java` as native workers, sharing `OntologyReferenceContract.java`, `OntologyStructuralComparison.java` and `reconcile-structural-differences.mjs`. The July invocation selects the historical source authority. New release-profile cases select the locked Central authority.                                                                                                 | Four July roots, per-document comparisons inside their original import contexts, Functional and RDF/XML closures for each root, root-only header data, native merger propagation, diagnostics, one consistent blank-node mapping, and exact expected differences. Keep source, installed candidate and registry identities distinct. Preserve all **23 named live Jest assertions** in `scripts/ci-check-coverage.mjs` (4 direct, 19 closure), including the existing environment-gated execution proof. |
| `run-profile-contract.mjs` / `RunOWL2DLProfile.java` and `run-writer-configuration-contract.mjs` / `RunWriterConfigurationContract.java` in `util/owlapi-reference/`                                                                                     | Register `canonical-vowl-dl` and `rdfxml-writer` with their existing specialist validators. Retain their historical source pin and JS settings on the shadow run. A language profile such as OWL 2 DL is a scenario operation. The JS behavior profile is an independent selection. Reuse the direct structural worker to check each writer output after the presentation checks.                                                                                                                                                                                                                                                                                                                                                                             | All **20** canonical VOWL input cases with native expectations, JS preserve-mode formal/source assessment, closure size and distinct violation codes. Java-only mode produces Java observations only. Carry forward all **seven** RDF/XML presentation modes (defaults, no-banners, two-spaces, no-indent, labels, save-ids and force-string). Preserve the live writer test, exact approved presentation differences and structural verdicts.                                                           |
| `replay-behavior-research.mjs` and `replay-selected-parity.mjs`, their `Observe*.java` / `RunRC2*.java` programs, `run-java-observation.mjs`, `compare-behavior-observations.mjs` and `compare-selected-parity.mjs`                                      | Use the replay programs as **oracle capture and qualification**. Reuse `run-java-observation.mjs` for source probes and `RunWithClasspath.java` where the native contract needs the compiled classpath launcher. The common admission layer verifies the actual executables and JARs before invoking either. Register their probe ID, input, arguments and outputs as authority for the appropriate JS behavior cases. Keep Central-versus-rebuilt and same-release comparisons explicitly tagged Java-to-Java. `record-released-oracle-evidence.mjs` and `validate-released-oracle.mjs` continue to own original-byte evidence and provenance admission. Keep the historical `javascript-baseline-observations.json` and its recorded failures identifiable. | **28** behavior observations and **15** selected-API observations per recorded Java side, including parameterized runs, expected failures, stdout/stderr, output files, ordering and narrowly allowed normalizations. Preserve the classpath/JDK/source/argument checks for unchanged-probe reuse and the stricter comparison of same-release bytes. A capture alone cannot issue a JS parity verdict.                                                                                                   |
| `model/behavior*.test.js`, `profiles/behaviorProfiles.test.js`, `search/behaviorTiming.test.js`, XML/JSON-LD and Node transport behavior tests, and `internal/behavior/behaviorLedger.test.js`                                                           | Move duplicated cross-language input and operation declarations into `public-api-behavior` scenarios. Keep Jest as a fast assertion client of the JS worker with authenticated retained Java observations where already supported. Use fresh native execution for cases previously requiring live Java. Retain implementation-specific unit tests and the independent expectations in `docs/compatibility/java-api-parity-decisions.json`.                                                                                                                                                                                                                                                                                                                    | Cover all **23** decisions in `currentBehaviorContracts` and all their referenced witnesses, including loading/mutation failure state, writer reuse, callback/lazy timing, parser selection, XML limits and transport. Preserve mock/loopback fixtures for designated transport tests and deny unexpected network activity. Retain the four-format large-literal behavior and its separate Manchester rendering check.                                                                                   |
| `GenerateStructuralSnapshot.java`, `GenerateRdfGraph.java`, the DL/KRSS1/KRSS2 snapshot generators and other narrow native characterizations such as `RunRdfConsumerContract.java`, `RunWriterCopySemantics.java` and `FloatingPointRenderingProbe.java` | Register each **consumed** differential under `format-differentials` with its fixture, probe/argument set and corresponding differential assertion. Keep these small native programs as setup or observation workers. Leave archival-only sources and goldens readable at their original revisions. Record the disposition and reader for each program found during inventory.                                                                                                                                                                                                                                                                                                                                                                                | Preserve the .ofn/RDF and syntax-specific fixture families, exact structural or graph expectations, historically approved differences, writer-copy and numeric-rendering witnesses. Keep each source revision and rights record. Regenerating snapshots requires the existing explicit provenance/refresh procedure.                                                                                                                                                                                     |
| `util/benchmark-owlapi-java-parity.mjs`, `BenchmarkPublicApiSurface.java`, `util/generate-owlapi-benchmark-fixtures.cjs` and `util/verify-benchmark-io-semantics.mjs` / `VerifyBenchmarkIoSemantics.java`                                                | Register `api-benchmarks` from `BENCHMARK_DEFINITIONS` and its generator parameters. Register the existing declarations-only verifier as `io-admission`. Extract JS and Java operation dispatch, sampling and report rendering into workers/presenters. Bind a semantic I/O witness to the same workload before publishing timing ratios. Keep the verified ordered classpath admission.                                                                                                                                                                                                                                                                                                                                                                      | **70** stable API workload IDs in both JS profiles, all filters, first-use/warm samples, default 2 warm-ups / 5 measured calls, generator parameters, checksums, limitation and admission categories, raw JSON and Markdown reports. Retain **34** independently checked observations for six declaration-only I/O groups. Keep frozen Java timing, explicitly authorized refresh and missing-ID update modes. Frozen values never become fresh measurements on a later JVM.                             |
| `util/benchmark-owlapi-*.mjs` format/mapping benchmarks, `benchmarkSampling.mjs`, `benchmarkEnvironment.mjs`, `benchmarkParserRegistries.mjs` and `verify-owlapi-rdfxml-corpus.mjs`                                                                      | Register `format-performance` and `rdfxml-corpus` using the common fixture provider. Record applicable single-engine operations as explicitly JS-only diagnostics with their original workload parameters. Share a case identity only for identical operations and inputs. Retain specialist workers and their sampling contracts. Move cross-runtime comparison to the common controller. Replace absolute evidence paths through DEC-01.                                                                                                                                                                                                                                                                                                                    | Preserve the coverage of the **14** single-runtime format/mapping programs and their distinct heap/event-loop protocols, optional GC, parameters, fixtures and historical reports. Preserve the four real benchmark fixture identities and Wine/GeoNames/schema.org’s three RDF/XML verifier expectations. Add paired working-set measurements as a separately versioned protocol.                                                                                                                       |
| `npm run test:owl-contract`, W3C conformance, browser/installed-package checks and CI/release receipt verification                                                                                                                                       | Keep these independent gates with their present owners. They prove public installed behavior, standards conformance, platform support and evidence lineage. They may consume the shared fixture provider or call the comparison coordinator for a relevant witness. A Java/JS result alone cannot satisfy their other obligations.                                                                                                                                                                                                                                                                                                                                                                                                                            | Keep native test reporting, the exact **70** installed assertions currently exported by `test/consumers/owl-contract/public-model-cases.js`, all required W3C cases, platform/consumer coverage and existing authenticated release proofs. Keep package checks running from the actual candidate installation.                                                                                                                                                                                           |

### Proving coverage before retiring a runner

1. **Freeze the old obligations before moving code.**
   At `5103b1f4` and again at migration intake, enumerate the native inventories, case IDs, parameter variants, fixtures/generator versions, Jest assertion names, probe arguments, oracle families and coverage obligations enforced by CI.
   Identify original output schemas and revisions as evidence provenance.
   Include light, full, environment-gated, recorded, expected-error and intentionally limited cases.
   Capture the baseline before changing a selector or regenerating expectations.
2. **Map assertions to executable counterparts.**
   Add a machine-readable migration mapping from each legacy runner/case/assertion and its execution condition to its new scenario, input binding, profile, measurement/stage and verifier assertion.
   Name the assertion owner and native receipt for each continuing independent gate.
   Mark archival-only observations as historical and retain their immutable source and verification identity.
   Expand generated and parameterized cases to exact keys.
   Shared scenarios may replace duplicate setup, provided every original assertion retains its own observation and proof.
   Record genuinely new obligations separately.
3. **Run old and new in shadow per family.**
   Use the same candidate or source, original oracle identity, JDK, inputs, configuration and stage scope.
   Compare the expected key sets independently of the new results, then compare observed structures, return/error/phase, order and post-failure effects, diagnostics, applicable writer bytes and evidence completeness.
   Preserve authorized profile-specific differences.
   For timing, compare operation boundaries, fixtures, sample counts, units, statistics and achieved work.
   Use DEC-06 for variability.
   Historical bugs such as FIBO’s inconclusive comparison need an independently justified correction and a regression witness.
   A reference upgrade, product fix or sampling change gets its own evidence after the like-for-like comparison.
4. **Verify the replacement against the frozen obligations.**
   Require zero unmapped active assertions, missing required keys, duplicate substitutes, newly skipped live cases or unexplained outcome changes.
   Verify tested operation semantics, failure phases and evidence through the new interface.
   Old command spellings and caller-specific report formats are outside the acceptance criteria.
   For instance, the direct-parsing Jest assertion `compares direct root content while loading the original import context` still needs its own executed assertion in the live inventory.
   A successful closure merge cannot cover it.
   Exercise an omitted variant, two rows with the same count but different identities, a stale retained oracle, a worker that never ran, and a process killed after partial output.
   Each must prevent a complete success receipt.
5. **Retire superseded orchestration at proven cutover.**
   Remove the old entry point and its duplicate discovery, dispatch and aggregation once the new route has proved the family’s coverage.
   Caller migration proceeds separately.
   No caller census, deprecation window, compatibility alias or shim is a condition of removal.
   The old run remains evidence at its original revision.
   Preserve its recorded inputs, methods, assertions and provenance.
   During shadow validation a pinned predecessor can still produce comparison evidence; after activation the release verifier enforces the full semantic gate.
   After release cutover, hold promotion unless the complete installed-candidate gate remains enforceable.

## Fixture acquisition for the comparison harness

**DEC-01 · Put the test inputs under repository ownership.**
Use a dedicated development-only `test/fixtures/ontologies/` space for reviewed manifests, exact import maps, redistributable minimized witnesses, and their attribution.
Store bulk original bytes by SHA-256 in a verified store outside tracked Git, with an optional ignored per-checkout location under `.release/`.
Use an approved durable, immutable source or rights-compatible artifact mirror for cold restoration.
A disposable CI or developer cache accelerates reads.
A fresh checkout with an empty cache must have a documented acquisition route.
Do not place private acquisition receipts, credentials, user directories, signed redirect URLs, or ontology payloads in the npm or browser runtime.
Raw bytes intentionally vendored need byte-preserving Git attributes and a clean-checkout digest test.
Generated documents, repairs, merged closures, oracle outputs and benchmark summaries belong in run evidence.

**Existing owners to reuse.**
CI and release already sparse-check out `Hadden-Industries/universal-ontology@e2c667f3584b8fb705671cada0fe205b1000b617`.
The July manifest has four roots under `src/iso-iec/11179/-3/ed-4/20260714` and `src/universal/{reference-data,core,extended}/20260714`, plus `src/external/{skos.rdf,time-gregorian.ttl,time.rdf}`.
`materializePinnedOntologySources` reads allowlisted Git objects with `git show <revision>:<path>` and records hashes.
A dirty sibling checkout does not control those bytes.
By contrast, `docs/performance/benchmark-corpus.json` records developer-specific absolute paths for SOSA, Wine, GeoNames and schema.org.
`util/verify-owlapi-rdfxml-corpus.mjs` refuses a missing file and checks size and SHA-256.
Preserve those four identities and assertions during migration.
Preserve generated benchmark definitions, W3C upstream revisions/licenses, RDF and JSON-LD identity manifests in `docs/conformance/upstream` and `util/conformance/w3cSource.mjs` verification.
The installed-package `test:owl-contract` also fingerprints reviewed Universal Ontology and WebVOWL **consumer code**.
It has a different proof obligation from ontology acquisition.

**Ownership migration.**
New fixtures get one editable record per logical source/version and one physical object per byte digest.
The July suite, standards manifests, performance workers and installed-consumer gate own their respective assertions.
Preserve historical fixture IDs and the meaning of their observations.
The canonical development interface owns new invocations and reports.
Reference the shared identity from a current consumer or derive a validated projection wherever a native manifest owns extra fields.
Do not rewrite an immutable W3C manifest to fit a new schema.
Cross-check referenced hashes and reject conflicting declarations.
Once shadow runs agree on both platforms, retire duplicate path discovery and competing editable pins.
Replace hardcoded paths in active readers.
Historical receipts keep their original locators.
Keep the existing seven-blob sparse checkout as the first shared Git provider.
Evaluate replacing it only if another provider solves a measured acquisition problem and reproduces all seven original hashes, logical bases and unavailable-source refusals on clean Windows and Linux hosts.

**Catalogue contract.**
Each source record owns its collection and case ID, upstream locator and immutable revision where available, stable logical document IRI, syntax/media type, byte length and SHA-256, rights/notice and availability state, direct/module/closure roles, import aliases, mappings and test selections.
Store its acquisition locator, logical document IRI, ontology IRI and version IRI separately.
A resolver returns admitted bytes plus the logical document IRI and syntax to **both** parsers, for the root and every imported module.
A private file path is a storage address.
It must never become the semantic base merely because the cache was relocated.

An embedded Turtle base or XML base applies according to the syntax.
For publisher-retrieval semantics, absent an embedded or otherwise supplied base, use the final retrieval IRI after redirects.
A frozen canonical test base or a historical requested-IRI replay can be useful, but its origin and purpose must be explicit.
Where a transient/private redirect cannot provide a reproducible public base, choose and label a stable test base and withhold any unproved publisher-equivalence claim. Aliases used to resolve imports must preserve the admitted logical document identities. [RFC 3986, base URI from the retrieval URI](https://www.rfc-editor.org/rfc/rfc3986#section-5.1.3) A server returning HTML, a redirect to changed content, unknown format, unavailable source or missing license has its own disposition.

**Acquisition and recovery.**
A deliberate preparation step may read approved Git blobs, HTTPS endpoints or an approved local seed by digest.
Pin Git sources by full commit and path when available.
A mutable publisher URL is a lookup route only.
Compare each response with the recorded hash.
Review a change as a new version without silently advancing the lock.
Keep import aliases in their exact original spelling.
Record the request, approved redirect origins and the logical base selected under the catalogue contract.
Use the locked logical base when an authorized mirror or cache supplies the content.
Omit transient credentials and signed query strings from published evidence.
Use publisher terms, media negotiation and reviewed TLS destinations.
Never follow graph-provided imports or JSON-LD contexts onto the network in a test worker.
Hash and count the original document octets after any declared HTTP content coding and before charset decoding, newline conversion or RDF processing.
If an archive supplies a member, verify the archive and member identities separately.
Stream to a private same-filesystem temporary object, validate it, and publish it atomically without overwriting an existing digest.
Pass the same verified content and its catalogue base to the parser.
A concurrent writer verifies the winning object.
A killed download owns only its temporary file.
A corrupted object cannot satisfy a cache hit.
Old generations remain available to runs referencing them.
Garbage collection is limited to owned temporary or unreferenced objects after the evidence-retention policy permits it.

**Rights and cost.**
The licence labels in the appendices are acquisition leads, including publisher-specific terms.
Check the exact file/version, upstream authority, embedded imports, attribution, notices, modification and redistribution permissions for each source before committing, hosting or redistributing bytes.
Record allowed local use and caching separately.
Keep restricted sources metadata-only with an authorized, digest-verified local provision route.
A result lists each blocked ID and reason.
A licence for GLEIF data or a GitHub repository alone does not establish terms for an ontology file.
Preserve provenance on minimized derivatives or author independently licensed standalone witnesses.
Use existing durable, rights-cleared sources first.
For a mutable upstream with no verified immutable route, prove cold restoration from an authorized durable copy before admitting that row to a reproducible release selection.
Local-only or rights-held rows remain individually visible.
Record the original bytes and acquisition condition.
Select additional hosting only if an identified case requires one and existing custody cannot supply it.
The first implementation uses the existing Git provider, Node streams and SHA-256.
[W3C Data on the Web Best Practices](https://www.w3.org/TR/dwbp/) · [Git object access](https://git-scm.com/docs/git-cat-file) · [GitHub Actions cache retention](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)

**Test selection.**
Run minimized witnesses for each corrected rule and a cold-prepare/offline-replay smoke case on the existing qualifying PR path. Exercise all 47 prospect originals directly and the DDI/GLEIF closures with their recorded policies.
Run the 178 captured wider inputs in shards, including the 15 historical JS rejections.
Give the five memory failures and CIDO a dedicated serial measurement lane.
Record normative strict, normative compatible, the named Java JS profile with explicit loader settings, and native Java’s effective settings.

Use the manual extended-evidence route for initial and exploratory heavy runs.
`.github/workflows/extended-tests.yml` currently handles third-party evidence on `workflow_dispatch`.
The existing third-party sharding pattern can deliver verified shards.
Every new corpus shard invokes `compare:java-js` on an immutable subject and selection.
Workflow jobs own scheduling and transport, while case definition, worker dispatch and comparison stay in the coordinator.
Preserve that job’s own workload and invocation.
`scripts/workflow-governance.mjs` reserves scheduled work for maintenance and enforces manual dispatch for extended evidence.
CI applicability is observational for existing required gates.
This plan adds no recurring schedule.

Freeze the admitted roster and its required profile, import and stage matrix before the candidate run.
Exercise every admitted source, including each original prospect module, the DDI/GLEIF closure scenarios, and the admitted wider sweep.
A rejected source can satisfy its semantic assertion when the independently established profile, phase, diagnostic and observable effects match.
Record every dependent stage as inapplicable with its witnessed reason.

For every release candidate the verifier derives the required cells from the independently frozen catalogue and policy, then reconciles evidence by key.
Use DEC-07’s case and execution identities, including the source/closure role, effective import policy, JS profile, public operation, required structural or behavioral observation and applicable platform.
Freeze stage dependencies and measurement applicability before execution.
An inapplicable stage identifies its governing rule or verified failed prerequisite.
Every admitted original receives its applicable semantic checks.
Each existing release-required behavior case keeps its obligation.
Activate release enforcement after the entire structural and behavioral roster is proven on both release routes.
Performance migration, timing collection and OBO memory optimization proceed independently.
Keep any existing required performance checks enforced during that work.
A report cannot choose its own expected roster or count a missing worker as inapplicable.
A required unavailable, duplicate, stale, failed or inconclusive cell holds promotion.

Bind the proof to the authenticated candidate artifact and tarball SHA-256/npm integrity, installed runtime dependency graph, verified input and configuration digests, and harness/Java identity.
One native source load may feed several comparisons when its entire input and configuration identity agrees.
Each JS profile and required comparison still has its own disposition.
Execute uncovered cells on the same authenticated candidate.
A changed parser dependency or source-only result requires a new candidate-bound run.
A shard or smoke run can supply cells but cannot certify the full roster on its own.
Keep rights-held and unavailable inventory entries visible with their reasons and outside the frozen admitted denominator.
A previously admitted source becoming unavailable is a failed qualification dependency.
A roster change requires an explicit version and rationale independent of that candidate’s results.
In release mode the verifier must reject a caller-supplied roster or stage filter that does not match its independently derived obligations, even if every selected row passes.
[Extended evidence workflow](../../.github/workflows/extended-tests.yml) · [Full CI qualification policy](../adr/0011-full-ci-qualification-lineage.md)

### Running the proposed comparison harness

These are proposed calls to a single development command.
`list` enumerates concrete cases, eligible measurements and prerequisites from the registry.
`prepare` verifies and provisions original bytes and authorized dependencies.
`run` dispatches the selected operations and emits the versioned stage evidence.
`verify` runs from trusted repository tooling, outside the candidate installation.
The release consumer supplies its independently frozen roster and validates the underlying receipts.
The candidate cannot attest its own coverage.
Normal comparison workers run offline after preparation.
Only an explicitly registered transport scenario may use its controlled local endpoint.
The maintained pre-migration entry points are listed under [sequencing and verification](#sequencing-verification-and-release).

| Operator action                              | Proposed invocation                                                                                                                                                                                                                                                                           | Observable result                                                                                                                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inspect coverage before execution            | `npm run compare:java-js -- list --suite prospects`                                                                                                                                                                                                                                           | Expands the 24 collections into concrete direct and closure cases with their inputs, profiles, measurements and expected witnesses.                                                                                     |
| Prepare sources                              | `npm run compare:java-js -- prepare --suite prospects`                                                                                                                                                                                                                                        | Verifies the 47 original prospect files and reports any unavailable or rights-held source.                                                                                                                              |
| Compare structure and behavior               | `npm run compare:java-js -- run --scenario direct-load --input entsoe-cgmes-eq --profile java-owlapi-5.5.1 --imports recorded --measure structure,behavior`                                                                                                                                   | Both public loaders see the same CGMES bytes and base. The report joins the structural difference and the observable load outcome by case.                                                                              |
| Exercise an import closure                   | `npm run compare:java-js -- run --scenario closure-roundtrip --input ddi-cdi/00 --imports mapped --measure structure,behavior`                                                                                                                                                                | Executes the declared 17-document graph, checks each producer/reader stage, and preserves independently completed results after a failure.                                                                              |
| Compare a generated boundary case            | `npm run compare:java-js -- run --scenario large-literal-roundtrip --measure behavior`                                                                                                                                                                                                        | Both engines consume one generation recipe and the same four format variants. Return values, refusal phase and post-operation state have profile-specific expectations.                                                 |
| Measure one real case across all three modes | `npm run compare:java-js -- run --scenario direct-load --input obo-fovt --imports recorded --measure structure,behavior,performance`                                                                                                                                                          | Shares the verified case identity across modes. Untimed semantic work and isolated latency/peak-memory workers produce separate observations. The strict-first ladder has its own scenario ID.                          |
| Qualify and verify a release                 | `npm run compare:java-js -- run --candidate <verified-candidate-directory> --roster <frozen-roster> --output <fresh-evidence-directory>`, followed by `npm run compare:java-js -- verify --candidate <verified-candidate-directory> --roster <frozen-roster> --evidence <evidence-directory>` | The run installs the authenticated tarball and checks the complete semantic selection. The verifier derives the required cells independently, verifies producing identities and holds promotion on incomplete coverage. |

In development, `--scenario` selects the public operation or sequence and `--input` binds a named fixture.
An omitted profile expands the scenario’s declared profile set.
An explicit profile or measurement filter narrows a diagnostic run.
For release qualification the authenticated roster controls these dimensions.
Reject conflicting selectors, unknown IDs, duplicate bindings and an empty required selection.
Use the canonical CLI and programmatic entry for new comparisons.
The checkout-only predecessors retire at proved cutover under DEC-07.
Their callers migrate outside this plan.

To add an ontology, bind its verified source, terms, byte and logical identities, imports and roles once, then associate the applicable scenarios.
To add a generated case, declare its generator/version/parameters or construction recipe and ordered operations once.
Attach independent profile expectations and measurement eligibility.
A first observational run can inform those expectations.
Admit the case only after cold preparation and offline replay prove its declared contract.
All applicable measurements then select the new case by the same identity.

## Java executable and oracle identity

**DEC-02 · Target the latest supported Eclipse Temurin HotSpot JDK on the Java 25 LTS line.**
On 20 November 2026 the vendor’s GA release was **`jdk-25.0.5.1+2`**, published 18 November at 19:34 UTC.
The Linux x64 feed returned `25.0.5.1+2-LTS` with package `OpenJDK25U-jdk_x64_linux_hotspot_25.0.5.1_2.tar.gz`, SHA-256 `760f91b22c3efc9bd1b64ff950598231be82928cc807e30691a0e7a2995a62c0`.
The same tag contained no Windows asset at inspection.
The official Windows x64 JDK feed returned `jdk-25.0.5+8`, ZIP SHA-256 `636bdc13dc649ddc7d5921c5c7d23cca6e44fd19d662b45cc9c02135a6c96c42`.
Adoptium’s roadmap identifies 25 as the newest LTS line.
Use published GA assets for release availability.
Roadmap dates and another vendor’s build number cannot identify a Temurin binary.
[Adoptium LTS policy](https://adoptium.net/support/) · [November GA release](https://github.com/adoptium/temurin25-binaries/releases/tag/jdk-25.0.5.1%2B2) · [Linux x64 GA feed](https://api.adoptium.net/v3/assets/latest/25/hotspot?architecture=x64&image_type=jdk&vendor=eclipse&os=linux) · [Windows x64 GA feed](https://api.adoptium.net/v3/assets/latest/25/hotspot?architecture=x64&image_type=jdk&vendor=eclipse&os=windows)

The checked-in `.java-version` already selects `25.0.5+8.0.LTS`.
Explicit/local `java.exe` and `javac.exe` at `C:\Program Files\Eclipse Adoptium\jdk-25.0.5.8-hotspot\bin` reported Temurin `25.0.5+8-LTS` and `javac 25.0.5`.
CI and release read the version file through the pinned `actions/setup-java`.
`scripts/java-toolchain.mjs` currently parses exactly three version components and one build and derives the Windows version by concatenation.
Feeding the new vendor semver `25.0.5+100000002.0.LTS` to that code would manufacture the wrong native version.

Use the actual JEP 322 version fields (25, 0, 5, patch 1, build 2).
The pinned setup-java implementation also constructs an exact lookup key `25.0.5+1.2` from these fields.
Exercise that spelling through the actual action, then derive the native runtime expectation `25.0.5.1+2-LTS`.
Keep the historical three-component spelling readable for rollback.
Verify Windows installer/package-manager spelling from the actual package metadata when available. Test the existing Windows bootstrap and native validator using the observed spelling. Derive the selected runtime, compiler, Windows locator and cache fingerprint from one declaration. Recheck both official platform feeds and release signatures/checksums before adopting the newest generally available release.
Exercise the exact Linux GA asset in the qualification lane as soon as it is available there.
Recheck the official Windows feed before the cross-platform cutover.
Keep the current shared pin until Windows and Linux both verify and run the same new GA.
The 29 October record establishes local behavior and selected-API checks on the current pin.
Hosted acquisition or qualification requires its own receipt.
If another patch supersedes this one before adoption, bind a new candidate and perform the same proof.
[Pinned setup-java resolver](https://github.com/actions/setup-java/blob/77dd5b2ce225ea11469928ac317850245a74ae78/src/distributions/temurin/installer.ts) · [Java version scheme](https://openjdk.org/jeps/322)

**DEC-03 · Bind the semantic oracle independently from the executable.**
The named JS profile targets Maven Central `net.sourceforge.owlapi:owlapi-distribution:5.5.1` and its exact ordered dependencies.
The historical Java source comparator used `b61ebe2da83daceebb3e7ba7afbd2582c9240c33`, nine commits after the release tag.
The July source-reconstruction lane and the released-profile lane have different provenance.
Use the existing `compileOntologyReferenceOracles` and `executeOntologyParsingOracle` with an independently verified Central classpath.
Reuse the byte/order checks in `util/verify-benchmark-io-semantics.mjs` and the provenance validation in `util/owlapi-reference/validate-released-oracle.mjs`.
For this lock the first of 64 JARs is `owlapi-distribution-5.5.1.jar` with SHA-256 `747b1a5269fee2992487dcde946f16dfbc14aa458d50854994a0485cf263ce07`.
Validate the actual ordered lock, sizes and hashes before compiling or starting an oracle.

**Version admission was exercised.**
The admitted distribution JAR declares `Bundle-Version: 5.5.1` and `Implementation-Version: 5.5.1.2024-09-07T21:41:32Z`.
The current structural oracle compares its `--owlapi-version` argument with `VersionInfo.getVersionInfo().getVersion()`.
Passing the Maven version `5.5.1` against the locked JARs returned `OWLAPI_VERSION_MISMATCH` before any parse.
Passing the independently obtained implementation version produced the CGMES mismatches and SAREF matches above.
The repo’s `compileOntologyReferenceOracles` → `executeOntologyParsingOracle` → `RunWithClasspath` launch path repeated the short-version refusal, named-profile CGMES mismatch and named-profile SAREF match.
The refusal and the genuine semantic mismatch both exited with status 1.
The typed results distinguished them.
Retain separate coordinate, runtime implementation version and source-revision fields.
Obtain the expected implementation identity from the admitted artifact and its lock, never by echoing the child’s self-report or accepting a version prefix.
Bind the actual tool executables and compiled oracle classes to the evidence.
The JS launcher and `RunWithClasspath` compiler branch currently resolve `javac` by name.
Ensure both the outer and nested compiler use the verified JDK before accepting a run.
Keep the historical source-compiled lane and frozen timings identified independently, and keep Java outside the shipped JS library.

Bind each Java result to vendor, platform/architecture, exact `java`/`javac` and runtime version, executable and JDK release-file digests, ordered classpath/lock digest, oracle/harness revision and effective XML configuration.
On JDK 25, IDMP encountered `JAXP00010004` at the 100,000 total entity size default.
The historical controlled run used `jdk.xml.entityExpansionLimit=64000`, `jdk.xml.totalEntitySizeLimit=50000000`, `jdk.xml.maxGeneralEntitySizeLimit=0` and `jdk.xml.maxParameterEntitySizeLimit=1000000`.
Record stock and historical configurations as distinct inputs.
A fresh Linux and Windows stock-default run establishes current behavior.
Apply legacy settings only in the isolated, offline reproduction child for reviewed pinned bytes.
Keep ambient `JAVA_TOOL_OPTIONS` and related variables out of compilation/replay and verify effective settings in the actual JVM. JS XML budgets and Java JAXP settings are separate fields. A limit result is neither a rejected OWL structure nor missing evidence. [JDK 25 JAXP guide](https://docs.oracle.com/en/java/javase/25/security/java-api-xml-processing-jaxp-security-guide.html)

## Comparison and performance contracts

**DEC-04 · Give each stage an independent result.**
The coordinator’s versioned report carries the DEC-07 case, execution and measurement identities.
Link acquisition, Java/JS public operation and behavior observations, direct models and import closure, JS Functional write and native reparse, structural comparison, closure merge, each producer’s RDF/XML save, applicable reloads, diagnostics and performance samples to that case.
Preserve distinct per-engine/per-profile observations and the authority for each verdict.
A retained Java capture, a fresh native observation and a Java-to-Java provenance check have different evidence roles.
Persist source loading, unparsed RDF, model comparison, difference-rule reconciliation and evidence completeness independently.
A Java source can load with diagnostics and still differ structurally.
Apply each relevant contract separately.
If JS rejects, run Java on the original source, preserve its model or typed failure, and mark stages requiring the absent JS model as blocked by that witnessed outcome.
The historical driver substituted an empty Functional ontology in this situation.
Its resulting `ONTOLOGY_ID` or axiom mismatch is not a measurement of the absent JS model.

For an equality claim require a completed native structural verdict.
For an approved difference require a completed per-instance diff, matching rules in the applicable profile, and the independently admitted diagnostic results.
FIBO’s `COMPARISON_LIMIT` plus reconciliation `PASS` must yield an inconclusive required cell.
An admitted `SOURCE_UNPARSED_RDF` diagnostic for Brick must not hide its completed axiom mismatch.
Keep partial evidence for investigation.

Deliver the large-result transport through `OntologyReferenceContract.run`, `executeOntologyReferenceOracle` and its result reader.
Today the Java emitter serializes the result to stdout, and the JS process runner limits combined stdout/stderr to 1,048,576 bytes. In the proposed file mode, stream detail to an attempt-owned file, close it, then return a bounded completion header containing case/stage identity, schema, length and digest.
The parent verifies those independently before atomic publication.
A readable file or a matching digest computed only after a crash cannot establish completion.
Bound diagnostic stderr separately and preserve the child’s exit reason.
A valid nonzero exit for a semantic mismatch remains usable evidence.

Use the new versioned result contract for active verification.
Keep original receipts hash-bound to their recorded schemas and verifier revisions for historical inspection.
Persist document-to-artifact mappings as each Functional output succeeds.
If closure storage fails later, use those mappings to recover completed stages.
Never choose a document by file size or directory order.
The existing semantic I/O verifier already passes a result-file path to the Java child.
The old ~1 MiB process-output buffer could misreport a large valid diff as “Could not start”.
A positive test must read a complete multi-megabyte result through the reporting consumer.
A truncated file, wrong digest or killed writer leaves that stage incomplete and earlier receipts usable.
Distinguish spawn failure, exit failure, timeout, evidence-write failure and an oracle result that exceeds a declared operator limit.
Limit displayed examples while retaining access to the full evidence.
Never promise unbounded disk or memory.
Persist completed stage receipts atomically before doing the next stage.
An interrupted attempt is explicitly incomplete.
Reuse requires an identical candidate or an identity already admitted by the release verifier, source-byte and logical-base identities, complete mapping and import policy, profile/mode and effective limits, stage schema, oracle/toolchain and harness identity, and the digests of each consumed upstream result.
Reverify every referenced artifact.
Timing evidence also binds the benchmark protocol and host class.
A failed match triggers a fresh affected run.
A spool/truncation failure prevents success and leaves earlier results inspectable.

**DEC-05 · Keep the three authorities explicit.**
For `normative-v1`, apply the repository’s accepted order to the exact observable in the selected parsing mode.
An applicable frozen normative clause governs first, an explicit adopted project contract governs next, and released Java OWLAPI 5.5.1 supplies the fallback where both are silent.
Cite the clause or contract for each intentional difference and test the associated input, output and failure behavior.
An existing JS test is evidence of migration impact.
The named `java-owlapi-5.5.1` profile follows observed native behavior on its supported surface.
A documented Java quirk can justify an intentional normative difference with a cited authority.
Describing a quirk alone cannot waive a named-profile parity failure.
The original published graph provides an independent witness for lost terms, edge identity and annotations.
Keep strict conformance, permissive Java behavior, producer defects and intentional project choices separate in the results.
[Repository profile authority](../compatibility/behavior-profiles.md#selection-and-authority) The OWL structural comparator compares under one consistent anonymous-individual bijection.
An RDF graph equivalence check uses RDF dataset semantics.
RDFC-1.0 through the existing `jsonld` canonicalization path can help identify RDF components, but only OWL structural equality can accept a structural comparison.
Tests must distinguish different links, shared versus distinct individuals, OWL operands, ontology annotations and named graphs.
Compare supported syntax, semantic models and writer behavior at their own interfaces.
[OWL 2 structural specification](https://www.w3.org/TR/owl2-syntax/) · [OWL 2 RDF mapping](https://www.w3.org/TR/owl2-mapping-to-rdf/) · [OWL 2 conformance](https://www.w3.org/TR/owl2-conformance/) · [RDF dataset canonicalization](https://www.w3.org/TR/rdf-canon/)

Author recurring axiom shapes once.
Bind each approved application to the fixture and source digest, revision, profile, direction, capability, reviewed witness and expected cardinality before passing it to the existing exact-fixture reconciler.
A new ontology can be identified automatically as a candidate for a known pattern.
It enters the expected-difference ledger only after the actual occurrence has been checked.
The ledger keeps zero unmatched actual differences, zero ambiguous matches and zero missing required expectations.
An added unrelated superclass, changed contributor edge or newly seen oracle revision must fail even when an approved `Error13` or singleton-union witness is present.
Report each matched instance and leave unrelated residuals visible.
[Current reconciliation contract](../compatibility/expected-differences.json)

**DEC-06 · Measure the actual consumer operation.**
Record input size, quads, blank nodes, direct/closure axioms, imports, and required output size where available.
For the direct series, use each engine’s public `loadOntologyFromOntologyDocument` with explicit syntax, logical base and import policy.
Request equivalent diagnostics, model scope, annotation loading and initialization.
The JS graph-evidence generator, Java two-parse comparator and downstream retry ladder perform extra work.
Give those their own measurements.
Prepare the document source outside the load-only clock and keep the returned model reachable through the post-load checkpoint.
Leave parsing, mapping and the required ontology publication inside that clock.
Measure cold start and read/decode in their own series. Compare JS to Java only for semantically admitted equivalent operations. Within-engine before/after comparisons can still identify a regression on a profile-specific workload.
For independent direct-load timing, use fresh managers for repeated calls in initialized processes.
For a stateful mutation, query or lazy iterator, apply the scenario’s specified setup, reset and traversal on both sides.
Materialization or reuse that changes the work must change its identity and comparability status.
Retain the owning lane’s warm-up and repetitions.
For each cold peak sample use one fresh process and one load.
The parent observes the same OS process counter for both runtimes, once with the input and manager ready and again immediately after the public load returns.
Record current RSS and the process-lifetime high-water mark at both checkpoints, raw units, and runtime heap separately.
An endpoint RSS difference cannot identify transient parser allocations.
A high-water mark already reached during setup cannot locate a later stage’s peak.
Determine stage ownership in separate instrumented runs; perform structural verification, serialization and any forced GC after the measurement boundary.
Repeat controls on the same host and OS configuration.
Treat the strict-first JS ladder, including failed attempts, as a separate downstream workload.
Run allocation tracing separately from the uninstrumented occupancy comparison.
Record toolchain, host class, settings and raw samples alongside medians and spread.
[Node process resource accounting](https://nodejs.org/api/process.html#processresourceusage) · [OpenJDK benchmark guidance](https://openjdk.org/projects/code-tools/jmh/)

Move the benchmark case dispatch and measurement protocol into the common coordinator and its performance workers, reusing the operations from `util/benchmark-owlapi-java-parity.mjs` and the verified classpath logic from `util/verify-benchmark-io-semantics.mjs`.
Its native `VerifyBenchmarkIoSemantics.java` sink accepts only unannotated class-declaration axioms.
Retain that independent sink for its six I/O groups.
Use an independent full-model observation for ordinary OBO documents.
The performance worker calls the same registered public-load operation as the structural and behavior workers, in a fresh process with the DEC-06 measurement boundaries.
Keep validation outside the measured interval.
The existing generated parity screen’s before/after heap samples do not establish a peak.
Repository RDF/XML budgets were informed by an earlier largest measured input of 1,987,111 bytes. The benchmark policy currently uses a warm-up and five measured runs, medians and 20% wall-time/peak-heap regression ceilings for its governed workloads.
Retain the original protocol on those rows.
Pair unmodified JS, the proposed JS change and the released Java reference on the same host.
Use three independent fresh processes per version and case for peak process memory and increase sampling if the observed spread obscures the effect.
Record process memory immediately before loading, peak working set through the return of the public load call, and post-load heap with the model reachable.
Capture retained-heap analyses in separate diagnostic runs under a clearly recorded GC policy.
Record OS and runtime memory accounting, collector, heap settings, pressure and any imposed limits.
Select enough working headroom for each engine and record its ergonomics.
Rerun under a different capacity only to diagnose a measured pressure or GC effect.

Begin with FOVT, ICEO and CIDO, then cover CLO, MRO and VBO.
Report absolute MiB and spread for each engine first.
Compute a JS/Java gap or ratio only after independent structural comparison establishes equivalent required work and model content.
A matching axiom count is a necessary sanity check for exact equality.
A documented model difference that changes live state needs its own workload or a within-engine control.
Record OOM, timeout, missing evidence and unequal work explicitly.
Historical settings can reproduce the original incident.
No fixed heap cap or universal Java memory multiplier governs acceptance.

For an admitted gap, identify the peak phase, the retained object families and their scaling with input bytes, quads, distinct terms, axioms and imports.
Use repeated controls to establish the noise range.
Before changing code, record the phase, the allocation/lifetime change and the improvement the measurement could distinguish. Accept an improvement only when it survives repeat runs, preserves model/diagnostic evidence and fits the existing governed throughput and responsiveness criteria.
If occupancy is already comparable or required model state explains the difference, retain that result without an invented reduction target.
A remaining unexplained material gap stays open.

Keep warmed latency separate.
The existing parity protocol uses two warm-ups and five measured calls per process.
Existing 20% wall-time/peak-heap regression budgets and the repo’s 1.10 Java timing goal retain their stated workload and metric scopes. Historical frozen Java timing observations keep their identities. [Repository resource budgets](../performance/resource-budgets.json) · [Cross-process benchmark precedent](../performance/remaining-java-performance-implementation-results.md)

## Implementation slices

The slice IDs are stable references.
SLICE-013 supplies the migrated behavioral proof for SLICE-012.
SLICE-012 activates the semantic gate on both release paths as soon as its structural and behavioral prerequisites pass.
SLICE-014 and the real-document performance work can finish later.
Follow the dependencies under [sequencing and verification](#sequencing-verification-and-release).
File names indicate likely existing owners.
The acceptance criteria govern even if an internal seam moves.

### SLICE-001 · Reproduce CGMES through the real public loaders

**REQ-01–04, REQ-07 · AC-01–04, AC-07 · DEC-01, DEC-03–05, DEC-07.**
The [pilot replay](#replay-the-tested-cgmes-patch) already reproduces the original CGMES mismatch and SAREF control from pinned source and bytes.
Use those observations as acceptance inputs when implementing the common command and its stage receipts.
Begin the frozen legacy-assertion mapping in DEC-07 before extracting orchestration.
Deliver the canonical command and programmatic coordinator on two real cases.
Bind the hashed CGMES original and its reduced witness to `direct-load`, with SAREF as the independently matching control.
Route the public JS loaders and native structural oracle through that shared case plan.
Produce the structural verdict and behavior fields from the same case, including the observation point and effective configuration.
Deliver DEC-04’s file transport and independent stage verdicts on this path.
Pass `behaviorProfileId` to the source, merger and reload managers as applicable, along with their separate loader settings.
Verify the OwlAPI library’s existing default behavior profile on optionless public manager construction.
Use the currently pinned JDK for the development reproduction.
Record a source-local byte fingerprint or candidate package digest.

**Proof and exit.**
Once verified inputs, dependencies and oracle are prepared, disable network access and reproduce the 209 lost domains, 209 lost datatype assertions and 220 extra declarations, including both `cim:ACLineSegment.r` witnesses.
SAREF must still match with both profiles.
Exercise a wrong JAR/order, plain coordinate in place of the qualified implementation version, mislabeled profile, interrupted large-result write and a native comparison limit accompanied by a passing fragment reconciler.
Each must surface at its owning stage.
The qualified positive controls require a completed native result and zero network attempts.
Exercise the canonical CLI and programmatic coordinator on the same July selection.
Compare their case identities and worker evidence with the frozen predecessor’s pin, import/merge behavior and source/installed/registry observations.
A changed fixture digest must invalidate both structural and behavior evidence.
A missing native execution cannot satisfy a live CI assertion.
This slice proves the common route and reproduces the named semantic gap.
Complete the family’s semantic coverage proof in SLICE-003 and the release enforcement in SLICE-012.

### SLICE-002 · Qualify the current LTS executable on both platforms

**REQ-02, REQ-06–07 · AC-02, AC-06–07 · DEC-02–03, DEC-07.**
Exercise the pinned setup-java version, local native admissions, actual JDK properties and exact compiler/runtime paths. Generalize only the version identities the newer four-field release needs. Use its signed Linux asset for discovery, then the vendor’s Windows asset when available. Prove the old selected build still maps correctly. Update the single pin, toolchain docs/bootstrap projections, fingerprints and governance together after the exact cross-platform executables qualify.
Re-run released Central behavior and selected-API replay under the same-release comparison with the original artifact order, including IDMP’s stock/legacy XML distinction.

**Proof and exit.**
Both supported platforms accept the intended patch/build, refuse a different vendor, JRE-only install, swapped JAR, wrong patch or unexpected ambient XML setting, and bind results to the actual binaries.
Reuse rejects a JDK digest change.
Compare with the prior 28 behavior and 15 selected-API observations under their declared scope.
Retain both generations.
If Windows supply or exact setup-java selection fails, publish the platform status in the plan’s implementation evidence and continue independent slices using their recorded toolchains.
One platform cannot satisfy the cross-platform release gate.

### SLICE-003 · Make the complete corpus addressable by ID

**REQ-01, REQ-04, REQ-06–07 · AC-01, AC-04, AC-06–07 · DEC-01, DEC-04, DEC-07.**
Connect the July, direct/closure, native snapshot/differential and real-world corpus selections to the coordinator’s fixture provider.
Replace per-runner discovery only after identical-input shadow results pass.
Exercise a single-file source, a Git blob, an authorized local-only input and both module families.
Then backfill every entry in the appendices.
Acquire the 47 original prospect files and the 178 available wider-sweep sources by digest under the rights policy.
Schedule all 47 as direct inputs, plus the DDI root closure and each GLEIF root in its resolved import context.
Carry the 23 unavailable entries as named acquisition work.
For a newly obtainable file, establish source, actual bytes, rights and a new dated initial outcome.
Never borrow a digest from a similar file.

**Proof and exit.**
Reconcile 24 prospect collections, 31 historical verdicts, 47 available prospect originals and all 201 wider inventory rows.
Preserve the 57 distinct historical stand-in IRIs and all intra-project mappings.
Test a relative DDI import, Classes → Agents, GLEIF’s cross-module aliases, a repeated import and a same-basename conflict.
Unknown IRIs must fail the exact-map lane.
The current JS generator assigns `pathToFileURL(rootPath)` as document IRI.
The native contract also opens the root via its local file URI, and its exact mapper supplies local import paths.
The corpus adapter must present the recorded logical source IRI at both parser boundaries for roots and imports.
Exercise the actual public loaders with two same-named files in different directories.
Preloading, rewriting triples, or an implicit fallback to file paths cannot manufacture the intended semantics.

A focused native control loaded a Turtle document declaring an absolute ontology and `<#Part> a owl:Class` with no embedded base.
Two cache directories produced different `file:` class IRIs and each mismatched the expected logical class `https://example.org/reference/root.ttl#Part`.
An explicit Turtle base of `https://example.org/reference/root.ttl` produced an exact match.
Keep the original source bytes unchanged in the adapter test.
Moving the physical cache must preserve the expected logical class.
Changing only the logical base must change that class.
The explicit-base variant remains an independent control.

Cold-prepare from an empty cache via approved sources, then replay offline.
Independently provision verified bytes into a fresh directory on the other platform and repeat the logical-base checks.
Exercise corrupt bytes, a killed/concurrent download and an expired cache.
Compare the old and new July roots, closures, manifests and consumer evidence on the same inputs.
Account for the 23 named live assertions with the existing native CI coverage collector, the individual differential fixture assertions and all original expected-difference cardinalities.
Verify the new suite’s observed result, error phase and coverage receipt against each legacy obligation.
Keep original artifacts bound to their producing revision.

### SLICE-004 · Recover RDF Schema property roles and their statements

**REQ-03 · AC-03 · DEC-05.**
The [tested CGMES candidate](#cgmes-pilot-results-and-next-implementation-step) covers the named-profile original and reduced cases.
Integrate it against the target revision, then exercise the four residual domain cases, ASAM and CIDOC before claiming the entire slice.
Extend compatible reconstruction at the property classification, transaction and axiom emission seam in `internal/mapping/rdfToOwlTranslator.js`.
The named Java profile should recover CGMES range-less properties as annotation properties with their domains and uses, recover ASAM’s malformed typing as Java does when range evidence permits, and distinguish a recovered entity from an explicitly declared entity.
Apply DEC-05 separately to strict and compatible normative modes.
Where neither an applicable normative clause nor an adopted contract settles the compatible choice, use the released Java fallback.
Retain explicit refusals in strict or source-preservation modes wherever their existing contracts require them.
Carry a range-less control and a positive domain/range example through the owning public loader in each affected mode.

**Proof and exit.**
Check the original CGMES, ASAM and CIDOC results and isolated named witnesses, including absence of the 220/309 extra Java-profile declarations. Include explicit OWL declarations, class versus datatype ranges, mixed/contradictory ranges, reversed triple order and missing evidence.
Existing untyped-property, source-property-role and RDF Schema preservation cases remain valid for their selected profiles.
Hold unrelated structural residuals open.

### SLICE-005 · Preserve undeclared IRI-valued assertions and property relations

**REQ-03 · AC-03 · DEC-03–05.**
Run Brick and IDMP with the recorded stand-ins, and a separate small case with real mapped declarations.
Follow the class/property/individual typing and assertion-recovery paths.
Preserve the native distinction between an annotation and a logical object-property assertion, explicit equivalence and unparsed RDF.
Extend existing undeclared annotation tests to the actual subject and import combinations.
Isolate missing assertions from the much larger anonymous-component differences in Brick.

**Proof and exit.**
Verify the 356 Brick unit assertions within the 620 named differences, all 348 paired IDMP triples, and the six/two equivalences and Brick subproperty. Include named classes, typed individuals, punning, properties whose declaration becomes visible through an import, and explicit legitimate equivalence. Java diagnostics and any remaining subclasses/anonymous differences remain inspectable.
Fixing one counter cannot hide another mismatch.

### SLICE-006 · Preserve blank-node annotation graphs

**REQ-03–04 · AC-03–04 · DEC-04–05.**
Through the manager load, Functional output, Java reparse and merged round-trip, establish the first point at which GeoSPARQL loses a statement or changes header annotations.
Preserve names, affiliations, node types, multiplicity and identity across references.
Relabel blank nodes consistently in an independent witness and distinguish their scopes across imports.
Make a profile-specific parser or writer repair only at the failing boundary.

**Proof and exit.**
Verify all eight contributor edges, the publisher, nine anonymous nodes with names, and the 34 descriptive assertions under the intended profile.
Account for the remaining 28-versus-21 header count using native structural evidence before accepting equivalence or a scoped difference.
A graph with one removed affiliation or a shared contributor split into two nodes must fail.

### SLICE-007 · Qualify Java’s six permissive parsing families

**REQ-02–04 · AC-02–04 · DEC-03–05.**
Run the six families in the evidence table with explicit syntax/base, named JS Java profile, normative compatible, normative strict, and non-strict native Java. Exercise GS1, QUDT, INSPIRE, every DDI module and closure, all eight GLEIF originals, RealEstateCore and Europeana. Record syntax-selection, profile, parse, diagnostics, dropped triples and resulting OWL constructs. Implement narrow, oracle-backed Java-profile behavior at the owning RDF mapping/parser or document metadata seam.
Preserve a standards-oriented outcome wherever the normative contract requires it.

**Proof and exit.**
Independently assert the value/category recovered or discarded, including native punning, dropped literal version, zero-property key and numeric cardinality. Malformed alternatives keep their observed/refused outcomes.
A legitimately typed integer survives.
Europeana remains loadable in the named profile.
Changed defaults, a pre-parser rewrite that silently repairs all inputs, or merely making the load succeed fail this slice.

### SLICE-008 · Resolve comparator limits and govern known differences

**REQ-03–05, REQ-07 · AC-03–05, AC-07 · DEC-04–07.**
Separate finding differences, proving model isomorphism, and rendering examples in `OntologyStructuralComparison.java` and the JS reconciler.
Measure the FIBO stop reason and Brick time by phase.
The component builder scans previously built components, and diagnostic labelling can search permutations.
First instrument ground-statement comparison, connected-component construction, bijection search and diagnostic rendering separately.
Exercise a measured optimization only in the expensive phase.
For example, index component membership when formation dominates, or refine candidate partitions when search dominates.
RDF canonical fingerprints can prune candidates only after the proposed mapping preserves sharing, annotations and graph scope.
Native structural equality remains the acceptance test.
A bounded search that exhausts its budget yields an inconclusive result.
A rendering limit retains any completed equality verdict and marks the detail incomplete.
Add reusable shape rules only for independently justified, profile-specific differences, with the review and cardinality controls in DEC-05.

**Proof and exit.**
Known-isomorphic graphs with permuted labels pass.
Same counts/different edges, distinct graphs that share a fingerprint, and a modified ifcOWL restriction fail.
Java’s `Error13` and singleton-union cases are traceable to reviewed source expressions.
Retain unparsed RDF counts independently.
An admitted FIBO comparison stays open, and blocks candidate qualification, until its required structural verdict is decisive.
Use the historical contradictory result as a regression for the aggregator.
Record Brick’s comparator-only cost on equivalent work.
Preserve a completed equality verdict if only diagnostic presentation reaches its limit.
Where required mismatch adjudication needs missing detail, that evidence remains incomplete.

### SLICE-009 · Verify RDF/XML closure writing and reloading

**REQ-03–04 · AC-03–04 · DEC-04–05.**
Preserve per-document results across a later merge or RDF/XML failure. Capture the pre-save model for each producer using independent observations of the root ontology/version ID and annotations, union of applicable direct axioms across the closure, import removal and blank-node scope.
Reuse the existing July closure contract where this is the declared merge operation.
Compare Java and JS writers on a shared, structurally verified closure.
When the two source parses already differ, separately compare each writer and each applicable reloader against that writer’s own pre-save model.
A divergence introduced before save cannot by itself diagnose the writer.
An unrepresentable common model remains a separate case.
Locate the first changed IRI, annotation, import or axiom and preserve source and output diagnostics.

**Proof and exit.** ePO and CGMES each get an identified IRI witness.
IOF, IDMP, GeoSPARQL, Brick, ifcOWL and ESCO each get a precise lossless-verification disposition.
Exercise an early typed refusal and a failure after writing begins.
In the normative profile verify that the caller’s original target survives a failed replacement.
In the Java profile test the released writer’s append behavior and any observable failed prefix at the corresponding failure phase.
Record that partial output as failure evidence.
Only a completed save can enter the successful reload path.
A valid save preserves every representable statement and IRI.
Missing Java output leaves its applicable writer comparison outstanding.
[Profile-specific writer contract](../compatibility/behavior-profiles.md)

### SLICE-010 · Establish Java-referenced memory diagnostics

**REQ-01, REQ-05, REQ-07 · AC-01, AC-05, AC-07 · DEC-01, DEC-06–07.**
Run the registered full-model `direct-load` scenario under the single harness’s performance measurement using fresh native Java and JS workers.
Reuse the exact binding already available to its semantic measurements.
Use SLICE-014’s admitted performance protocol and independent untimed check.
The host memory sampler belongs to that mode.
Start from the native readings in this plan, then obtain fresh JS and native controls on the same measurement host and target JDK.
Separate syntax-only, direct reconstructed model, JS strict-first ladder, and downstream analysis.
Compare only the same boundary across engines.
Capture the peak phase and retained owners in separate instrumented runs.
Oversized worker settings from the incident are historical context.

**Proof and exit.**
Deliver all six per-case rows with input identity, semantics/admission verdict, raw working-set and heap observations, variability, and phase attribution. Resolve Java/JS count differences where needed and verify structural/annotation/import witnesses outside the measured interval.
Identify at least one falsifiable optimization hypothesis for each material unexplained gap and the smallest control that distinguishes it.
If direct equivalence cannot be demonstrated, mark the cross-engine comparison unqualified and use a semantically stable JS control to diagnose the implementation.
A limit change alone supplies no evidence of reduced occupancy.

### SLICE-011 · Reduce memory at the measured owning boundary

**REQ-03, REQ-05 · AC-03, AC-05 · DEC-05–06.**
Trace lifetimes from the public document source to the published ontology.
`StringDocumentSource.getText()` supplies the complete string.
`RdfXmlSyntaxAdapter.parse` prepares/validates the XML, conditionally parses a DOM when literal/`parseType` handling requires inspection, and passes chunks to `rdfxml-streaming-parser`.
It already respects `write()` / `drain` backpressure.
Its quad handler adds every emitted statement to `@rdfjs/dataset`.
This distinguishes a bounded parser queue from the retained graph and returned model.
[Current adapter](../../internal/parsing/rdfxml/rdfXmlSyntaxAdapter.js) · [Upstream streaming RDF/XML parser](https://github.com/rdfjs/rdfxml-streaming-parser.js) · [Node stream backpressure](https://nodejs.org/en/learn/modules/backpressuring-in-streams)

Use the measured retaining phase to select an experiment.

| Phase implicated by the profile                                      | Experiment and discriminating proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XML input or transient DOM dominates                                 | Use bounded events for namespace/base and XML literal context where the syntax permits. The current public string source is already decoded. Test UTF-16 surrogate boundaries on that path. Test split UTF-8 sequences and decoder behavior at a real byte/stream ingress such as `io/node/nodeDocumentLoader.js`. A smaller chunk supplied from an already retained string does not demonstrate end-to-end byte streaming. Measure both boundaries, with and without `rdf:parseType`, and check nested literal namespaces, entity limits, cancellation and backpressure. Preserve existing string and browser consumers. [RDF4J Rio statement handlers](https://rdf4j.org/documentation/programming/rio/)                                                  |
| Graph storage or secondary indexes dominate                          | The existing RDF/JS dataset already interns terms to numeric IDs and builds subject, predicate and object indexes. Measure retained quad objects, RDF read-view caches, structural keys and subject/predicate arrays. Reuse an existing immutable index or delay building an optional view until needed. Compare cold/warm queries, ordered diagnostics and document-scoped blank-node identity. Integer encoding and selective indexes have precedent in RDF stores. [Read-view owner](../../internal/mapping/rdfReadView.js) · [Apache Jena TDB architecture](https://jena.apache.org/documentation/tdb/architecture.html)                                                                                                                                |
| Reconstruction or publication overlaps multiple full representations | `RdfToOwlTranslator.prepare` retains a graph/read view for later reconstruction, and the manager supplies declarations after resolving imports. Profile the overlap with role maps, reconstruction transactions and the published axiom indexes. Release intermediates after their last consumer, or use a bounded two-pass/replayable input for forward references if that removes a measured overlapping lifetime. A replay/spool has explicit ownership, cancellation, cleanup and a portable browser path. Test reordered declarations, lists, reification, shared blank nodes, import cycles and late failure. [RDF-to-OWL owner](../../internal/mapping/rdfToOwlTranslator.js) · [W3C RDF-to-OWL parsing](https://www.w3.org/TR/owl2-mapping-to-rdf/) |
| Retries or model lifetime dominate                                   | Compare direct compatible load with strict rejection followed by compatible loading on FOVT, CLO and VBO. On ICEO and MRO use a single successful strict parse as a control. Reuse only immutable, document-local preparation that is valid under both settings. Check that failed attempts release state and old/replaced managers do not retain graphs. Use allocation sampling and an isolated heap snapshot or JVM Flight Recording to confirm the retaining path. Keep profiler-induced memory out of the peak series. [Node heap snapshot guidance](https://nodejs.org/en/learn/diagnostics/memory/using-heap-snapshot) · [JDK diagnostic tools](https://docs.oracle.com/en/java/javase/25/troubleshoot/diagnostic-tools.html)                        |

Choose the smallest change that addresses the observed owner.
Introducing a global interner, replacing the entire RDF library or adding disk-backed storage requires evidence that the existing provider and a shorter lifetime cannot meet the workload.
The public OWL model, source ordering where observable, structural equality and each profile’s publication guarantees remain acceptance constraints.

**Proof and exit.**
Compare old and new candidates under identical settings with real callers, an import failure and retry, cancellation, retained published objects and independent structural ground truth.
Prove any index is scoped or invalidated across mutations, imports and discarded attempts.
Replay all five incident files and the CIDO control.
Test each previously failing path through the final public model, and separately exercise realistic strict-first retries.
Report baseline versus changed JS on identical semantics, the measured phase reduction and end-to-end peak with spread.
Add Java measurements and a ratio only for admitted equivalent work.
Retain case-specific diagnostics/annotations, the original source coverage and the unaffected controls. If an optimization moves cost to I/O or changes GC behavior, quantify that trade-off.
A failure that requires changing a public contract or produces an unexplained semantic difference stays open.
A heap setting or narrower input policy cannot qualify an optimization.

### SLICE-012 · Activate the full-corpus semantic release gate

**REQ-01–04, REQ-06–07 · AC-01–04, AC-06–07 · DEC-01–05, DEC-07.**
As soon as the complete structural and behavioral roster passes in shadow on both fresh and promoted-CI candidates, make it mandatory for every release candidate.
Deliver the required semantic mappings from SLICE-013 and any required untimed witness that currently lives alongside benchmark code.
Preserve existing performance gates under their own policy.
Completion of SLICE-014, new peak-memory measurements and memory optimization are independent of this activation.
A promoted-CI qualification uses the authenticated original CI candidate and package proof.
An explicitly fresh qualification uses the exact same-run retained candidate.
Either path may reuse a complete corpus result that the release verifier can authenticate for that subject.
The installed consumer must resolve all tested public exports from its isolated installation.
Reuse the existing candidate-install/realpath checks in `qualify-universal-ontology.mjs` and the authenticated candidate/integrity/dependency-graph checks in `scripts/release-ci-package.mjs`.
A Git checkout’s source run, a registry install of the same version, a candidate artifact archive digest and the tarball member’s own digest each establish different facts.

Wire the corpus aggregate into `release.yml`’s `required` job and its registered job-success/coverage checks. Extend `scripts/release-qualification-manifest.mjs` and the staging reader in `scripts/staged-release.mjs` together. Today fresh/legacy and promoted-CI qualifications write different manifest schemas.
The new active contract must bind the candidate artifact origin and tarball integrity, authenticated result artifact ID/digest and producer run/attempt, admitted catalogue/matrix digest, and complete required-cell count.
Reverify the original payload and coverage at the consuming boundary.
An optional new JSON field, an Actions job name, or a passing `verify:release-gates` inventory check cannot enforce this release decision.
Preserve historical manifest interpretation for historical subjects.
A new candidate cannot be admitted through an older schema that omits the corpus obligation.
CI, manual investigations and both fresh/promoted release workflows invoke the same coordinator or consume its verified evidence. Keep fixture preparation and artifact transport reusable. Publish approved stage results and all coverage/hold counts within their rights.
Existing PR, installed-package, browser and governed performance obligations stay in force.
Verify through the package-boundary check that harness code, development metadata and datasets stay outside the npm package.

**Proof and exit.**
Verify that cold preparation and warm offline replay produce equivalent semantic results on Windows and Linux.
Exercise the July scenarios, cache miss/tamper and partial evidence through the new qualification path.
Deliver the complete mapping and witnessed shadow evidence for **semantic** obligations on the frozen catalogue.
Test activation with all required structural and behavioral cells proven on both release paths and SLICE-014 still in progress.
The semantic gate must become active.
Conversely, all 70 benchmark rows can be present and a single missing required semantic cell must still hold that candidate.
The existing release/performance checks retain their own vetoes.
Report every captured input, every expected rejection and all 23 acquisition holds.
Hold promotion on every missing or inconclusive required cell.
Verify expected rejections independently.
Run the installed consumer from outside the checkout and require the same tarball in fresh and promoted qualification.
Negative controls must reject a removed GLEIF cell, a duplicate substituting for a missing cell, source results relabeled as installed-candidate results, a different tarball with the same package version, a changed installed dependency or import map, a stale Java lock, and an old manifest lacking the new obligation.
Each holds even when all shard processes exit successfully.
Exercise both release routes through manifest creation and staging admission.
A fully covered candidate with a verified expected rejection and correctly authenticated reused evidence is eligible under the existing release policy.
Once active, the semantic gate stays enforced during the remaining performance migration.
The existing release process owns promotion.

### SLICE-013 · Migrate behavior and writer contracts into the shared runner

**REQ-02–04, REQ-07 · AC-02–04, AC-07 · DEC-03–05, DEC-07.**
Begin after SLICE-001 has established the common case, worker and result contracts.
Freeze the legacy probe/argument inventory and decision-ledger test references. Register file-backed, generated and stateful operations in the same registry. Migrate the 28 behavior and 15 selected-API capture rows as separately identified oracle evidence. Bind the corresponding JS assertions and any approved per-profile differences to the scenarios. Retain original Central/rebuild/same-release comparison, including its expected failure completion and allowed normalization.
Retain hash-verified historical captures and readers.

Start with `large-literal-roundtrip`.
Declare the source character, length of 33,554,433, ontology/subject IRIs, annotation property, and four writer formats once.
Each engine constructs the model using its own public API, saves it, and records the saved bytes or digest and the reload outcome.
Preserve which writer produced each document.
In particular, the legacy JS case uses the named Java profile to write, verifies that profile’s successful reload, then checks the default normative loader’s `ResourceLimitError` on the **same saved document**.
The native probe verifies the recovered literal length and digest.
Cross-reading a second producer’s output is an additional case binding.
Check the failure phase and post-state.
Preserve the separate Manchester object-rendering boundary.

Then migrate the remaining resource, loading, storage, mutation, query, format-selection, ontology-language-profile and transport families in the migration map.
Preserve the 20 canonical VOWL cases, seven XML writer presentation modes and their independently reviewed verdicts.
Retain native/Jest assertions that only concern one runtime at their existing boundaries.
Replace duplicate fixture setup and expectation lookup in cross-language assertions with the shared case binding.
A focused Jest run can consume an authorized recorded native observation.
A live-required case must witness the native invocation.

**Proof and exit.**
Compare old/new coverage per probe argument tuple, writer format, operation step, behavior profile, native assertion and expected outcome.
The four formats must produce four witnessed results.
Omitting a format, moving a failure from reload to construction, reordering a recorded callback, changing a failed writer prefix, or treating a normative refusal as a generic pass must fail.
Check that a Java-only observation cannot issue a comparison receipt and that cross-build normalization and same-release byte comparison retain their respective scope.
Hand the evidence for the required behavior assertions to SLICE-012.
Resolve unexplained semantic differences before activating the gate.

### SLICE-014 · Migrate the performance runner and its semantic checks

**REQ-03–05, REQ-07 · AC-03–05, AC-07 · DEC-04–07.**
After SLICE-001, import the old benchmark definitions with their stable IDs, parameters and generator into the case registry.
Keep the Java and JS implementations independent.
The registry must detect a missing implementation on either required side.
Move suite selection, fixture preparation, Java source selection, result binding and aggregation into the common coordinator.
Register the six declaration-only I/O groups and their 34 structural observations.
Deliver any witness already required by the semantic roster in time for SLICE-012, independent of the timing migration.
Move all 70 benchmark IDs and the applicable JS-only diagnostics through the common performance worker.
Supply the controlled worker interface to SLICE-010 for the real-ontology working-set series.

Maintain two distinct evidence roles.
Historical benchmark reproduction uses its frozen baseline, JS profiles, baseline identity and protocol.
At intake that file reports JDK `25.0.4.1` and OWLAPI implementation `5.5.1.2026-08-10T00:04:10Z`.
Live comparison runs the verified current oracle under the declared protocol.
A build of the same Maven version can have a different executable identity.
Carry workload selection, warm-ups, repetitions, baseline identity and the independently authorized refresh/missing-only operations into the canonical interface.
Store raw measurements and render the summary from them.
Preserve original reports as historical evidence.
Ordinary runs read frozen evidence without advancing it.

**Proof and exit.**
Match the exact 70-ID set, the fixture generator/version, workload sizes (syntax count and import-closure count), and measurement parameters (warm-ups and measured runs), both JS profiles, raw samples and per-profile comparability classifications. Confirm all six I/O groups using the full named declarations and metadata.
A wrong class IRI with the right count must fail semantic admission.
Retain the import-closure workload limitation where Java `Stream.count()` can elide traversal while JS materializes a defensive set.
A new equivalent-materialization workload gets its own case/version.
Consolidation can close with documented diagnostic-only workloads.
Account for all 70 IDs and both JS profiles.
For each diagnostic row, record the exact blocker (for example, unequal materialization or a checksum without an independent witness), the available observations and what would permit a qualified ratio.
A diagnostic row counts toward migration completeness; it cannot satisfy a qualified comparison, an existing performance requirement or a required semantic cell.
A missing workload or an unexplained downgrade from previously qualified coverage fails migration.

Verify that identical counts for different class IRIs or unequal operations cannot yield a qualified ratio.
Frozen Java timing cannot appear as a live peak-memory observation.
Retain the original reports with their provenance.
Judge new timings using repeatability and effect size on the agreed workload.

## Sequencing, verification and release

1. **Establish the common path.**
   SLICE-001 inventories the old obligations and proves CGMES/SAREF through the shared coordinator. SLICE-002 can qualify the JDK and oracle in parallel with SLICE-003. Hold reference identity constant for each old/new migration comparison.
   SLICE-003 then supplies the complete offline corpus and the July/direct/closure/differential suites.
2. **Move the legacy families.**
   SLICE-013 (behavior) and SLICE-014 (performance) can proceed in parallel after SLICE-001.
   Both feed the assertion mapping.
   Route any required semantic witness to the semantic gate even when its current implementation lives in a benchmark suite.
   Retire each family’s superseded tool after its coverage is proved.
3. **Apply the corrections through the one harness.**
   Integrate SLICE-004, SLICE-005 and SLICE-007 through the mapping owner where they share typing rules.
   SLICE-006 and SLICE-008 can investigate retained evidence independently.
   SLICE-009 can collect writer controls early and adjudicate deltas after parser/comparator changes.
   The behavior cases from SLICE-013 distinguish intentional profile changes from migration drift.
4. **Activate the semantic gate first.**
   SLICE-012 activates as soon as all admitted structural and behavioral obligations pass in shadow on both release paths, including the relevant SLICE-003–009 and SLICE-013 evidence.
   Deploy the trusted roster, producer, aggregate and manifest verifier together.
   Every candidate from cutover requires complete semantics.
   Outstanding performance migration or optimization does not delay this gate.
   Existing performance obligations still apply.
5. **Complete performance consolidation and the memory work.**
   SLICE-014 accounts for all 70 workloads on the common harness, with explicit reasons for diagnostic-only rows.
   SLICE-010 uses its measurement protocol on the admitted real inputs from SLICE-003.
   SLICE-011 follows that semantic and memory baseline.
   Serialize heavyweight measurements on the benchmark host.
   Close the harness migration once all three measurements use one coordinator and every prior obligation is accounted for.
   Track the real-document optimization separately through its own acceptance criteria.

**Baseline verification entry points.**
Install the repo’s locked dependencies using its selected Node/npm toolchain.
The paths below are relative to the checkout root.
Commands listed here are maintained interfaces at the inspected revision.
The checkout commands below identify how to capture predecessor observations at the inspected revision.
Their arguments, filenames and output layouts document the baseline.
They create no compatibility obligation.
Record the old and new assertion IDs, execution identity and proof for each family.
The proposed [canonical interface](#running-the-proposed-comparison-harness) owns new invocations.

| Maintained invocation                                                                                                                                                                                                                  | Evidence it provides and prerequisites                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test -- --runInBand --runTestsByPath internal/mapping/untypedProperty.test.js internal/mapping/undeclaredAnnotation.test.js`                                                                                                      | Focused RDF typing behavior. Add the reduced witnesses to their owning suites and exercise imported declarations, source roles and negative strict cases.                                                                                                                                                                                                                                                   |
| `npm test -- --runInBand --runTestsByPath scripts/java-toolchain.test.js util/owlapi-reference/qualify-universal-ontology.test.js util/owlapi-reference/reconcile-structural-differences.test.js`                                      | Focused pin, runner and reconciliation contracts. Use live released Java as the independent compatibility oracle.                                                                                                                                                                                                                                                                                           |
| `node util/owlapi-reference/replay-behavior-research.mjs <classpath-file> <output-directory>` and `node util/owlapi-reference/replay-selected-parity.mjs <classpath-file> <output-directory>`                                          | Capture the two native observation suites under an explicitly prepared Java identity. Preserve the optional behavior-replay `--reuse-unchanged` and the selected comparison’s `--same-release` rules. Use these captures as separately identified evidence for JS behavior cases.                                                                                                                           |
| `node util/owlapi-reference/run-profile-contract.mjs --java-root <pinned-checkout> --java <java> --javac <javac> --output <new-report.json>` and `node util/owlapi-reference/run-writer-configuration-contract.mjs <output-directory>` | Replay the bounded 20-case OWL 2 DL/source assessment and the seven presentation modes with their native reference prerequisites. Also exercise the environment-gated writer Jest test and the corresponding preserved JS expectations.                                                                                                                                                                     |
| `npm run test:universal-ontology -- --ontology-repository <pinned-checkout> --output <new-output-directory>`                                                                                                                           | Legacy July direct-parse and two closure-format paths. Set `OWLAPI_REFERENCE_CHECKOUT` to the prepared source-pin Java checkout for this lane. In source mode choose an ignored or external output directory. Existing candidate and registry modes retain their distinct provenance.                                                                                                                       |
| `node util/verify-owlapi-rdfxml-corpus.mjs`                                                                                                                                                                                            | Resolves the Wine, GeoNames and schema.org measured inputs and asserts exact lengths, digests and model/diagnostic expectations. At this revision it requires the recorded local inputs. Prove portability during migration.                                                                                                                                                                                |
| `node util/verify-benchmark-io-semantics.mjs --classpath-file <verified-list> --java-home <exact-jdk> --output <new-result.json>`                                                                                                      | Independent structural I/O observations from the released classpath and both JS profiles. Prepare all locked JARs and the exact toolchain first.                                                                                                                                                                                                                                                            |
| `node --expose-gc util/benchmark-owlapi-java-parity.mjs --filter <existing-benchmark-id> --output <new-report.json>`                                                                                                                   | Existing generated benchmark selection. Its frozen Java baseline and its explicit refresh/update flags have distinct authority. Write new corpus runs separately.                                                                                                                                                                                                                                           |
| `npm run test:boundary`, `npm run test:owl-contract -- --candidate <verified-candidate> --output <new-output-directory>`, `npm run verify:workflow-governance` and `npm run verify:release-gates`                                      | Validate package contents, the installed public consumer contract with its prepared candidate inputs, and the static release-gate catalogue/workflow policy. A static catalogue check supplies no candidate execution proof. Use the maintained candidate/consumer setup documented by the invoked CLI and workflows. Retain existing browser and W3C conformance suites for impacted format/profile paths. |

**Promotion and rollback.**
Validate structural and behavioral coverage against the frozen obligations, then shadow the complete semantic gate on both release routes.
At successful semantic cutover deploy the comparison producer, aggregate and manifest consumers coherently.
Enforce full semantic coverage from that point, preserving existing required live, installed-package and performance checks.
Remaining benchmark families can migrate independently.
A manually dispatched producer can supply authenticated evidence, and the release verifier independently checks every required cell.
A prior green summary, a smoke run or the passing subset of a failed shard cannot authorize promotion.
An unavailable required input remains in that candidate’s frozen roster.

If the verifier or evidence store fails after cutover, hold promotion.
Restore the last verifier capable of enforcing the full obligation or repair forward and requalify the same artifact.
Reverting parser changes creates a new candidate that qualifies under the active policy.
Preserve historical evidence and original deployments.
Candidate coverage cannot be restored by disabling the gate, selecting a smaller roster or using an old manifest.
Experimental memory observations require the separate governed performance decision before they can become release thresholds.
Preserve historical caches and evidence while investigating.
A published artifact, if any, follows the existing forward-release policy.
Clearing shared caches, deleting fixtures, promoting a package or changing machine-wide Java requires its ordinary authority.

**Assurance and replanning.**
Independent review samples source/lock→parser→evidence on an untouched checkout including failed loads, imports and a denied URL, validates expected-difference rules against a nearby counterexample, inspects external input/temporary-file boundaries using the project’s native security review, and checks rights and attribution before redistribution.
Use synthetic boundary fixtures for tests.
Reopen the affected decision if an oracle identity cannot be reproduced, the catalogue cannot restore exact bytes after cache loss, one profile’s recovery changes another profile’s required output, a comparator cannot certify an equivalence, or memory reduction would require relaxing a public/resource contract.
Report what independent slices can still ship.
Superseded checkout runners have no backward-compatibility obligation.
Remove old command surfaces at their proven cutover.
Caller migration is separately owned.
Preserve the npm library’s public API and the provenance of historical evidence.

## Prospect inventory

The following 24 collections comprise the published-document parity cohort.
The historical result compares the default-compatible JS configuration with the Java 5.5.1 environment described above and its recorded imports.
CGMES and SAREF also have [locked native comparisons before and after the local pilot patch](#what-changed-in-the-real-electricity-model).
The historical outcomes below describe the original parser.
Every collection enters the offline structural and writer selections and is addressable in the benchmark driver.
Use representative inputs in PR/measurement lanes as described above.
Counts describe direct models or a failed top-level closure as applicable.
Licence text in this inventory is a reported lead and requires checking the exact representation before redistribution.
The CGMES body carries ENTSO-E copyright.
GLEIF’s LEI data terms cover the data, and the project repository’s reported MIT licence still needs verification for the eight publisher module bodies.
The CIDOC finding concerns the captured 7.1.3 RDF representation.

| Collection ID           | Ontology                                                                                                                                               | Direct parsing comparison                                          | Historical JS closure storage | Licence lead                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ | ----------------------------- | ---------------------------------------- |
| `eu-epo-core`           | eProcurement Ontology Core                                                                                                                             | Match                                                              | Full-IRI refusal              | EUPL 1.2                                 |
| `idta-aas`              | Asset Administration Shell RDF Ontology                                                                                                                | Match                                                              | Completed                     | CC BY 4.0                                |
| `etsi-saref-core`       | SAREF Core Ontology                                                                                                                                    | Match                                                              | Completed                     | ETSI SAREF BSD-3-Clause-style licence    |
| `gs1-web-vocabulary`    | GS1 Web Vocabulary                                                                                                                                     | JS rejects datatype as class                                       | Prerequisite failed           | Apache 2.0                               |
| `fibo-all`              | Financial Industry Business Ontology (production quickstart)                                                                                           | Inconclusive at comparator limit                                   | Completed                     | MIT                                      |
| `iof-core`              | Industrial Ontology Foundry Core Ontology                                                                                                              | Match                                                              | Lossless check failed         | MIT                                      |
| `pistoia-idmp`          | IDMP Ontology 1.4.0 (merged release)                                                                                                                   | Different assertions and unparsed RDF                              | Lossless check failed         | MIT                                      |
| `pmd-core`              | Platform MaterialDigital Core Ontology                                                                                                                 | Match                                                              | Completed                     | CC BY 4.0                                |
| `hl7-fhir-rdf`          | FHIR RDF Ontology                                                                                                                                      | Match                                                              | Completed                     | Verify with publisher                    |
| `asam-openlabel`        | ASAM OpenLABEL V1.0.0 Scenario Tagging Ontology (copy in ASCS e.V.'s asam-openx-standards; openlabel.asam.net refused connections on 18 November 2026) | Different property domains and ranges                              | Completed                     | Verify with publisher                    |
| `qudt-all`              | QUDT Ontologies and Vocabularies                                                                                                                       | JS rejects datatype as class                                       | Prerequisite failed           | CC BY 4.0                                |
| `ogc-geosparql`         | GeoSPARQL 1.1 Ontology                                                                                                                                 | Different ontology annotations and blank-node details              | Lossless check failed         | Apache 2.0                               |
| `brick-only`            | Brick Ontology 1.5.0                                                                                                                                   | Different assertions and anonymous graphs                          | Lossless check failed         | Brick 1.5.0 repository licence to verify |
| `building-smart-ifcowl` | ifcOWL IFC4 ADD2                                                                                                                                       | Different Java placeholder and union expressions                   | Lossless check failed         | CC BY 3.0 in the pinned file             |
| `europeana-edm`         | Europeana Data Model                                                                                                                                   | JS rejects non-IRI annotation domain                               | Prerequisite failed           | Verify with publisher                    |
| `cidoc-crm`             | CIDOC Conceptual Reference Model 7.1.3                                                                                                                 | 309 extra JS declarations                                          | Completed                     | CC BY 4.0                                |
| `ddi-cdi`               | DDI Cross Domain Integration Ontology 1.0 (17 publisher modules)                                                                                       | JS rejects empty key in top-level closure                          | Prerequisite failed           | Verify with publisher                    |
| `posccaesar-lis14`      | ISO 15926-14 / LIS Core Ontology                                                                                                                       | Match                                                              | Completed                     | CC BY-SA 4.0 in the pinned file          |
| `inspire-address`       | INSPIRE Addresses RDF Vocabulary                                                                                                                       | JS rejects literal version IRI                                     | Prerequisite failed           | Verify with publisher                    |
| `nfdicore`              | NFDI Core Ontology                                                                                                                                     | Match                                                              | Completed                     | CC0 1.0 in the pinned file               |
| `entsoe-cgmes-eq`       | CGMES 3.0 Equipment profile vocabulary (RDFS2020), as pinned by the Application Profiles Library                                                       | Different property domains, annotation assertions and declarations | Full-IRI refusal              | Repository Apache 2.0 lead               |
| `gleif-lei`             | GLEIF LEI Ontologies 1.0 (eight publisher modules)                                                                                                     | JS rejects string cardinality on all eight roots                   | Prerequisite failed           | Module-specific terms to verify          |
| `esco-model`            | ESCO ontology (model 2.0.0)                                                                                                                            | Match                                                              | Lossless check failed         | EUPL 1.2                                 |
| `realestatecore`        | RealEstateCore 4.1.0                                                                                                                                   | JS rejects non-IRI annotation range                                | Prerequisite failed           | BSD 3-Clause                             |

### Original byte pins

Every row below was rehashed during planning and matched its acquisition receipt.
Each single file is a root.
Module row numbers are stable within their collection and link to the import mapping below.
Use unmodified document bodies, preserving line endings, XML declarations, base IRIs, fragments and RDF collections.
External URLs are sourcing instructions.
An exact input must also match its byte count and digest.
For the original fetch, the preferred representations in order were RDF/XML, Turtle, OWL/XML, Functional Syntax, any.
The module fetch preferred Turtle.
Preserve the recorded RDF syntax when an HTTP server sends plain text or a generic binary content type.
ASAM’s captured location is the ASCS-eV standards repository.
Verify the original publisher and file-specific terms before choosing a redistribution route.

| Source ID or module     | Syntax  |   Bytes | SHA-256 of original document                                       | Recorded acquisition route                                                                                                                                                                                                                                                                              |
| ----------------------- | ------- | ------: | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eu-epo-core`           | Turtle  |  258492 | `a9e1e8d6a482df087d3df863241b9d5ecee540069d6fbd5503da038f160cf69e` | [Source](https://raw.githubusercontent.com/OP-TED/ePO/master/implementation/ePO_core/owl_ontology/ePO_core.ttl)                                                                                                                                                                                         |
| `idta-aas`              | Turtle  |   95846 | `5bb96b29121d5449f9347a31da4f849e2de2c14d14f4c8dd1d45fcf2e314fbab` | [Source](https://raw.githubusercontent.com/admin-shell-io/aas-specs/master/schemas/rdf/rdf-ontology.ttl)                                                                                                                                                                                                |
| `etsi-saref-core`       | Turtle  |  100491 | `28189acd8cfb49bf6b7e5709275a1162d943576f643b2cffdccfe20cc00ad701` | [Source](https://saref.etsi.org/core/v4.1.1/saref.ttl)                                                                                                                                                                                                                                                  |
| `gs1-web-vocabulary`    | Turtle  | 1270763 | `b6039ed1b3229853a0aed1eb8568527f2d393925fd163d6fce5fddefe7ea1aa7` | [Source](https://ref.gs1.org/voc/data/gs1Voc.ttl)                                                                                                                                                                                                                                                       |
| `fibo-all`              | Turtle  | 8484452 | `8e51c4908e4ef67c107dc9bbde6921db0cb522530e5721098eb8c91eae7b888f` | [Source](https://spec.edmcouncil.org/fibo/ontology/master/latest/prod.fibo-quickstart.ttl)                                                                                                                                                                                                              |
| `iof-core`              | RDF/XML |  443779 | `bdd9271a6ed190e6c0ac8a01d2728ccd517ad33913c436b3882679dfcf94cfde` | [Source](https://raw.githubusercontent.com/iofoundry/ontology/Release_202603/core/Core.rdf)                                                                                                                                                                                                             |
| `pistoia-idmp`          | RDF/XML | 1472478 | `f1492bf151c1e3b8a7b6b468d09a42541e9f8d505c897328ebd49054caf22674` | [Source](https://raw.githubusercontent.com/Pistoia-Alliance-Inc/Pistoia-Alliance-Ontologies/main/IDMP-O/1.4.0/IdentificationOfMedicinalProductsOntology.rdf)                                                                                                                                            |
| `pmd-core`              | Turtle  | 1333981 | `baf2ed1f5e98270b7341afc866af8a2f285f558685bd4e584cd40df7755218e2` | [Source](https://raw.githubusercontent.com/materialdigital/core-ontology/main/pmdco-base.ttl)                                                                                                                                                                                                           |
| `hl7-fhir-rdf`          | Turtle  | 4073291 | `4200739e6a5e0bb2792fa76defc123c206f31e54dd4b1d7dbc76c54499b0e50e` | [Source](https://hl7.org/fhir/6.0.0-snapshot1/fhir.ttl)                                                                                                                                                                                                                                                 |
| `asam-openlabel`        | Turtle  |   64851 | `70df30e1176b3532717b321332c424a7ef1da83e0b44f05fb04d7720006c9419` | [Source](https://raw.githubusercontent.com/ASCS-eV/asam-openx-standards/main/standards/asam-openlabel/ontologies/openlabel_ontology_scenario_tags.ttl)                                                                                                                                                  |
| `qudt-all`              | Turtle  | 6885995 | `f464183da08670d2f77576e6aceebb977f46e1b7598dae80a19a8952d1ae0e9f` | [Source](https://qudt.org/3.5.3/qudt-all)                                                                                                                                                                                                                                                               |
| `ogc-geosparql`         | Turtle  |   40630 | `25e319e0c30c6cf026a5cb1a693ac74a17e7cebc3dcad520b731f77c49719867` | [Source](https://raw.githubusercontent.com/opengeospatial/ogc-geosparql/1.1.0-ghpages/geosparql11/geo.ttl)                                                                                                                                                                                              |
| `brick-only`            | Turtle  | 1646105 | `6bf1a0c8526eacd807173243bcb8b3e37c368083aaa98f9f831a5b2da4bebb42` | [Source](https://github.com/BrickSchema/Brick/releases/download/v1.5.0/Brick-only.ttl)                                                                                                                                                                                                                  |
| `building-smart-ifcowl` | Turtle  | 1907118 | `fd544165707090285f93a100ef61113a687d3ba79c64bbf0bba7c9591df5aaf6` | [Source](https://raw.githubusercontent.com/buildingsmart-community/ifcOWL/master/IFC4_ADD2.ttl)                                                                                                                                                                                                         |
| `europeana-edm`         | RDF/XML |   49633 | `33e7946b07d89b41af715ef3bf121c01573f746609f9c9963bdc8e310a93a25a` | [Source](https://github.com/europeana/metis-schema/raw/94c73a16320977fac121acfa366072e8e07e9158/src/main/resources/rdf_examples/edm.owl) · [Resolved source](https://raw.githubusercontent.com/europeana/metis-schema/94c73a16320977fac121acfa366072e8e07e9158/src/main/resources/rdf_examples/edm.owl) |
| `cidoc-crm`             | RDF/XML |  713673 | `05074c0e3010fcef5fae70ae8c80e0428d7cab251e30657737d2475db0bcf07d` | [Source](https://cidoc-crm.org/rdfs/7.1.3/CIDOC_CRM_v7.1.3.rdfs) · [Resolved source](https://cidoc-crm.org/rdfs/7.1.3/CIDOC_CRM_v7.1.3.rdf)                                                                                                                                                             |
| `ddi-cdi/00`            | Turtle  |   11703 | `2b5e9c6db25f4dc1477201c99a793b01f7e5a44555d6fdb9d9d2dbbdf4625c03` | [ddi-cdi.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/ddi-cdi.onto.ttl)                                                                                                                                                                                                   |
| `ddi-cdi/01`            | Turtle  |   20144 | `15a83380e2f795a76df795e93c9a33e03533c30f44d2bc6840541d188149fc01` | [Agents.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/Agents.onto.ttl)                                                                                                                                                                                                     |
| `ddi-cdi/02`            | Turtle  |    1284 | `fd8899d13dc8735d3e537f73d4046ec4807e52e68512dddddb6d9e3c6b93f954` | [Classes.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/Classes.onto.ttl)                                                                                                                                                                                                   |
| `ddi-cdi/03`            | Turtle  |   17123 | `43000e86ccdaee54ab486445e696d231fd22bfc524420c8a81be8f7ea492b7f3` | [Components.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/Components.onto.ttl)                                                                                                                                                                                             |
| `ddi-cdi/04`            | Turtle  |   69174 | `870e3054ac55a865454c077484282af3386a98d4b493ec262747d837b72b9e60` | [Conceptual.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/Conceptual.onto.ttl)                                                                                                                                                                                             |
| `ddi-cdi/05`            | Turtle  |    1111 | `8e7d6968ce205a01d65642ac1393b45971c2c283e73fd364c95beaea8ff0fd04` | [DDICDILibrary.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/DDICDILibrary.onto.ttl)                                                                                                                                                                                       |
| `ddi-cdi/06`            | Turtle  |   21673 | `9421fcc80021a8f77b9f58b5dd3223a88576559019ceecc2b590bb9eeaf5cf4f` | [DataDescription.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/DataDescription.onto.ttl)                                                                                                                                                                                   |
| `ddi-cdi/07`            | Turtle  |    3235 | `80c17e4505b1ec84498fbd3041674cfdc7f2ea3a1e9fe12f3567e76b3febf168` | [DataTypes.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/DataTypes.onto.ttl)                                                                                                                                                                                               |
| `ddi-cdi/08`            | Turtle  |   12973 | `c4f7b3191776d756ce04d99817284b21db3d7b73d70139870412494b134297ee` | [Dimensional.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/Dimensional.onto.ttl)                                                                                                                                                                                           |
| `ddi-cdi/09`            | Turtle  |   21808 | `3836f06cdf0cf8d1d57ee6186d3471a16f3d5806d406b37d2aabf3cba78922e1` | [Enumerations.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/Enumerations.onto.ttl)                                                                                                                                                                                         |
| `ddi-cdi/10`            | Turtle  |   94823 | `0275defc0be8dd5562f53b5c313cccd810ac3f8d47edc2db4230662bceeffeca` | [FormatDescription.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/FormatDescription.onto.ttl)                                                                                                                                                                               |
| `ddi-cdi/11`            | Turtle  |    7411 | `04125171b086d02486905655a1b4fe2fe13e7108bd2ce73876f796a2ace37e94` | [KeyValue.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/KeyValue.onto.ttl)                                                                                                                                                                                                 |
| `ddi-cdi/12`            | Turtle  |   10780 | `ca8db9348f568374c37d2a8b691f25f15beb61abf5d42891eeaa833c6960c65f` | [Long.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/Long.onto.ttl)                                                                                                                                                                                                         |
| `ddi-cdi/13`            | Turtle  |   34169 | `063899be2b746f6a666b0cd813c562c75e3c6f8c2ed2bc7dcd11b7ec37990973` | [Process.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/Process.onto.ttl)                                                                                                                                                                                                   |
| `ddi-cdi/14`            | Turtle  |  104334 | `2342eb3f792ea72beeb3fb46b62a3cedb33799713ed6e8a20a4c8755150c7dc5` | [Representations.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/Representations.onto.ttl)                                                                                                                                                                                   |
| `ddi-cdi/15`            | Turtle  |   92092 | `532c89f446c30f5f213f7de1d9fb34133d92bd066cecb543b9253f8115083c57` | [StructuredDataTypes.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/StructuredDataTypes.onto.ttl)                                                                                                                                                                           |
| `ddi-cdi/16`            | Turtle  |    3333 | `f3b53c1e19a1739b8e4cf77c538c9ad43fcd7b83ffd62fe45ad6228638ff25c1` | [Wide.onto.ttl](https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/Wide.onto.ttl)                                                                                                                                                                                                         |
| `posccaesar-lis14`      | RDF/XML |  266324 | `2d4d10b506732ef25dd544ef21341ca37f1271ced99ff5b80d1a76f5e0e61eeb` | [Source](http://rds.posccaesar.org/ontology/lis14/ont/core) · [Resolved source](https://posccaesar.org/ontology/lis14/ont/core)                                                                                                                                                                         |
| `inspire-address`       | Turtle  |   45848 | `8a308aeb477461e96d9d08b747364805f3e40b11808f5367b4d26a872e113503` | [Source](https://raw.githubusercontent.com/inspire-eu-rdf/inspire-rdf-vocabularies/master/ad/ad.ttl)                                                                                                                                                                                                    |
| `nfdicore`              | Turtle  |  160899 | `1f3f4eda4bca3bddcb7937aafe127941fe2fd6af877b64488415c6db9e931c2e` | [Source](https://raw.githubusercontent.com/ISE-FIZKarlsruhe/nfdicore/main/nfdicore-base.ttl)                                                                                                                                                                                                            |
| `entsoe-cgmes-eq`       | RDF/XML |  584337 | `e95c02b1eca667dabf7c8bf0e0a0e47f0b4813c8a3899eb55e50608fdb4ba27d` | [Source](https://raw.githubusercontent.com/entsoe/CGMES-AP/e96dd4e323b1e2236e141dd03bf9adea81672e00/CGMES/RDFS/61970-600-2_Equipment-AP-Voc-RDFS2020.rdf)                                                                                                                                               |
| `gleif-lei/00`          | Turtle  |   30868 | `52bb85b1854a15f4a8d6aab44b13eb4759eac5402977f14675aa344ddfc5d59e` | [Base](https://www.gleif.org/ontology/Base/) · [Resolved source](https://www.gleif.org/ontology/v1.0/Base/ontology.ttl)                                                                                                                                                                                 |
| `gleif-lei/01`          | Turtle  |   35900 | `c9dccf2c3a9b642fa2ac4abc6d1a5d1df5144f71088a2169f31dc1b28d0f0ada` | [L1](https://www.gleif.org/ontology/L1/) · [Resolved source](https://www.gleif.org/ontology/v1.0/L1/ontology.ttl)                                                                                                                                                                                       |
| `gleif-lei/02`          | Turtle  |   21391 | `4d21cdfbe280e79af1f19e6ae6dc05883e1d264388275be271ab3f750d08d4e2` | [L2](https://www.gleif.org/ontology/L2/) · [Resolved source](https://www.gleif.org/ontology/v1.0/L2/ontology.ttl)                                                                                                                                                                                       |
| `gleif-lei/03`          | Turtle  |    8088 | `c20d36445764e1537adecc981787761e8cf2f5ec3cdcf34ee4768695a21bfcbc` | [L2Parent](https://www.gleif.org/ontology/L2Parent/) · [Resolved source](https://www.gleif.org/ontology/v1.0/L2Parent/ontology.ttl)                                                                                                                                                                     |
| `gleif-lei/04`          | Turtle  |    3941 | `6fada5feae476b2dcb97cedaaa71ab719a0d5f07ce7ead12d750f388ef6bc4cb` | [EntityLegalForm](https://www.gleif.org/ontology/EntityLegalForm/) · [Resolved source](https://www.gleif.org/ontology/v1.0/EntityLegalForm/ontology.ttl)                                                                                                                                                |
| `gleif-lei/05`          | Turtle  |    4033 | `9a677464274d0aca952006a8df3efbd37e6cc2cec5485b8b31f1b5160dc5b4ce` | [RegistrationAuthority](https://www.gleif.org/ontology/RegistrationAuthority/) · [Resolved source](https://www.gleif.org/ontology/v1.0/RegistrationAuthority/ontology.ttl)                                                                                                                              |
| `gleif-lei/06`          | Turtle  |   12025 | `2adb1f28a828b85b5b987f2f6ce89a8f496fc655d78e907e26c1ad41fee0d49f` | [ReportingException](https://www.gleif.org/ontology/ReportingException/) · [Resolved source](https://www.gleif.org/ontology/v1.0/ReportingException/ontology.ttl)                                                                                                                                       |
| `gleif-lei/07`          | Turtle  |   10226 | `6d17d054e88b52df178f84b697727173d7a2b2fe964f0217f06f7f0d43554260` | [Geocoding](https://www.gleif.org/ontology/Geocoding/) · [Resolved source](https://www.gleif.org/ontology/v1.0/Geocoding/ontology.ttl)                                                                                                                                                                  |
| `esco-model`            | RDF/XML |  181218 | `65dc9b2cfd345f246a1e7bd3ee8688e2646f6f6042f1f587b552eb5d49b53360` | [Source](http://data.europa.eu/esco/model) · [Resolved source](https://ec.europa.eu/esco/lod/static/model.rdf)                                                                                                                                                                                          |
| `realestatecore`        | Turtle  |   81761 | `3cdda54a530522bf2d37711c054cae2a84c3c28b6d050768ac4b81c1a24ce74b` | [Source](https://raw.githubusercontent.com/RealEstateCore/rec/v4.1.0/Source/SHACL/RealEstateCore/rec.ttl)                                                                                                                                                                                               |

The downstream pipeline also produced two merged N-Triples derivatives.
DDI-CDI’s merged output had 1,629,091 bytes and SHA-256 `49642a29176b98fda83cb40d7b50b0a091e478f7ed4d022bd056e887124e7991`.
GLEIF’s had 334,373 bytes and SHA-256 `0a412760fc58b3ce648287e55183a11512d709fdb8a1a4641d99aa78f4b3c4a9`.
Treat these only as explicit downstream merge scenarios.
Loading the originals catches base-resolution, document-identity and per-module failures that flattening loses.
The full-source SHA-256 check also distinguishes UTF-8 byte length from the JavaScript string length historically logged for modules.

## Import maps

Use an RDF syntax parser over the admitted bytes to obtain ontology headers and imports.
The following module graph was extracted locally from original Turtle with the publisher document IRI as base.
The DDI names are relative to `https://docs.ddialliance.org/DDI-CDI/1.0/model/encoding/ontology/`.
GLEIF names are relative to `https://www.gleif.org/ontology/`.
Map only the explicitly declared ontology/document/version aliases to the source IDs.
Root 00 for DDI is fetched as `ddi-cdi.onto.ttl` but identifies itself as `DDICDIModels.onto.ttl`.
The historical driver used local temporary filenames and a last-segment fallback.
Reproduce that historical base policy only when investigating a result, then compare cleanly with stable logical bases and exact alias mapping.
A basename or trailing-slash heuristic must never select a different source.

| Source module  | Declared ontology              | Direct imports by source module                                                    |
| -------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| `ddi-cdi/00`   | `DDICDIModels.onto.ttl`        | `ddi-cdi/05`                                                                       |
| `ddi-cdi/01`   | `Agents.onto.ttl`              | None                                                                               |
| `ddi-cdi/02`   | `Classes.onto.ttl`             | `ddi-cdi/01`, `ddi-cdi/04`, `ddi-cdi/06`, `ddi-cdi/10`, `ddi-cdi/13`, `ddi-cdi/14` |
| `ddi-cdi/03`   | `Components.onto.ttl`          | None                                                                               |
| `ddi-cdi/04`   | `Conceptual.onto.ttl`          | None                                                                               |
| `ddi-cdi/05`   | `DDICDILibrary.onto.ttl`       | `ddi-cdi/02`, `ddi-cdi/07`                                                         |
| `ddi-cdi/06`   | `DataDescription.onto.ttl`     | `ddi-cdi/03`, `ddi-cdi/08`, `ddi-cdi/11`, `ddi-cdi/12`, `ddi-cdi/16`               |
| `ddi-cdi/07`   | `DataTypes.onto.ttl`           | `ddi-cdi/09`, `ddi-cdi/15`                                                         |
| `ddi-cdi/08`   | `Dimensional.onto.ttl`         | None                                                                               |
| `ddi-cdi/09`   | `Enumerations.onto.ttl`        | None                                                                               |
| `ddi-cdi/10`   | `FormatDescription.onto.ttl`   | None                                                                               |
| `ddi-cdi/11`   | `KeyValue.onto.ttl`            | None                                                                               |
| `ddi-cdi/12`   | `Long.onto.ttl`                | None                                                                               |
| `ddi-cdi/13`   | `Process.onto.ttl`             | None                                                                               |
| `ddi-cdi/14`   | `Representations.onto.ttl`     | None                                                                               |
| `ddi-cdi/15`   | `StructuredDataTypes.onto.ttl` | None                                                                               |
| `ddi-cdi/16`   | `Wide.onto.ttl`                | None                                                                               |
| `gleif-lei/00` | `Base/`                        | `https://www.omg.org/spec/LCC/Countries/CountryRepresentation/`                    |
| `gleif-lei/01` | `L1/`                          | `gleif-lei/00`, `gleif-lei/04`, `gleif-lei/05`                                     |
| `gleif-lei/02` | `L2/`                          | `gleif-lei/00`, `gleif-lei/01`                                                     |
| `gleif-lei/03` | `L2Parent/`                    | `gleif-lei/00`, `gleif-lei/01`                                                     |
| `gleif-lei/04` | `EntityLegalForm/`             | `gleif-lei/00`, `https://www.omg.org/spec/LCC/Countries/CountryRepresentation/`    |
| `gleif-lei/05` | `RegistrationAuthority/`       | `gleif-lei/00`, `https://www.omg.org/spec/LCC/Countries/CountryRepresentation/`    |
| `gleif-lei/06` | `ReportingException/`          | `gleif-lei/01`, `gleif-lei/02`                                                     |
| `gleif-lei/07` | `Geocoding/`                   | `gleif-lei/00`, `https://www.omg.org/spec/LCC/Countries/CountryRepresentation/`    |

### Historical external stand-ins

The original comparison used empty ontologies for the following **57 distinct external IRIs**.
For a stand-in, generate a distinct minimal ontology whose ontology IRI equals that exact import.
Supply identical bytes and IRI mappings to both engines and retain the stub digest and scope.
These inputs establish behavior when external declarations are unavailable.
A second, fully resolved closure requires a separately acquired, licensed and pinned source for every dependency.
A deliberately failed import uses a third explicit policy.
Report each run’s policy.
A different policy or stable base creates a different run identity.

| Imported IRI with original spelling                                                     | Collections whose historical mapping contained it |
| --------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `http://build.fhir.org/w5.ttl`                                                          | `hl7-fhir-rdf`                                    |
| `http://data.ashrae.org/bacnet`                                                         | `brick-only`                                      |
| `http://data.europa.eu/eli/ontology#`                                                   | `eu-epo-core`                                     |
| `http://data.europa.eu/m8g/`                                                            | `eu-epo-core`                                     |
| `http://datashapes.org/dash`                                                            | `realestatecore`                                  |
| `http://def.isotc211.org/iso19150/-2/2012/base`                                         | `inspire-address`                                 |
| `http://purl.obolibrary.org/obo/bfo/2020/bfo.owl`                                       | `iof-core`                                        |
| `http://purl.org/dc/terms/`                                                             | `eu-epo-core`                                     |
| `http://purl.org/iso25964/skos-thes`                                                    | `esco-model`                                      |
| `http://qudt.org/3.3.0/vocab/quantitykind`                                              | `brick-only`                                      |
| `http://qudt.org/3.3.0/vocab/unit`                                                      | `brick-only`                                      |
| `http://www.linkedmodel.org/schema/vaem`                                                | `qudt-all`                                        |
| `http://www.opengis.net/ont/geosparql`                                                  | `inspire-address`                                 |
| `http://www.opengis.net/ont/sf`                                                         | `inspire-address`                                 |
| `http://www.w3.org/2004/02/skos/core`                                                   | `qudt-all`, `inspire-address`, `esco-model`       |
| `http://www.w3.org/2004/02/skos/core#`                                                  | `eu-epo-core`                                     |
| `http://www.w3.org/2006/time`                                                           | `eu-epo-core`                                     |
| `http://www.w3.org/2008/05/skos-xl`                                                     | `esco-model`                                      |
| `http://www.w3.org/ns/adms`                                                             | `eu-epo-core`, `esco-model`                       |
| `http://www.w3.org/ns/locn`                                                             | `eu-epo-core`                                     |
| `http://www.w3.org/ns/org#`                                                             | `eu-epo-core`                                     |
| `http://www.w3.org/ns/person`                                                           | `eu-epo-core`                                     |
| `https://brickschema.org/schema/1.3/Brick`                                              | `realestatecore`                                  |
| `https://github.com/inspire-eu-rdf/inspire-rdf-vocabularies/blob/master/au/au.ttl`      | `inspire-address`                                 |
| `https://github.com/inspire-eu-rdf/inspire-rdf-vocabularies/blob/master/base/base.ttl`  | `inspire-address`                                 |
| `https://github.com/inspire-eu-rdf/inspire-rdf-vocabularies/blob/master/cp/cp.ttl`      | `inspire-address`                                 |
| `https://github.com/inspire-eu-rdf/inspire-rdf-vocabularies/blob/master/gn/gn.ttl`      | `inspire-address`                                 |
| `https://github.com/inspire-eu-rdf/inspire-rdf-vocabularies/blob/master/tn/tn.ttl`      | `inspire-address`                                 |
| `https://spec.industrialontologies.org/ontology/202603/core/meta/AnnotationVocabulary/` | `iof-core`                                        |
| `https://w3id.org/express`                                                              | `building-smart-ifcowl`                           |
| `https://w3id.org/rec`                                                                  | `brick-only`                                      |
| `https://w3id.org/rec/brickpatches`                                                     | `realestatecore`                                  |
| `https://w3id.org/rec/recimports`                                                       | `brick-only`                                      |
| `https://www.omg.org/spec/Commons/AnnotationVocabulary/`                                | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/BusinessAuthorizations/`                              | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/Classifiers/`                                         | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/CodesAndCodeSets/`                                    | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/Collections/`                                         | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/ContextualDesignators/`                               | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/ContextualIdentifiers/`                               | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/DatesAndTimes/`                                       | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/Designators/`                                         | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/Documents/`                                           | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/Identifiers/`                                         | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/Languages/`                                           | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/Locations/`                                           | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/Organizations/`                                       | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/PartiesAndSituations/`                                | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/QuantitiesAndUnits/`                                  | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/RegistrationAuthorities/`                             | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/RegulatoryAgencies/`                                  | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/RolesAndCompositions/`                                | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/SitesAndFacilities/`                                  | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/Commons/TextDatatype/`                                        | `pistoia-idmp`                                    |
| `https://www.omg.org/spec/LCC/Countries/CountryRepresentation/`                         | `gleif-lei`                                       |
| `https://www.omg.org/spec/LCC/Languages/ISO639-1-LanguageCodes/`                        | `pistoia-idmp`                                    |
| `https://www.w3.org/ns/locn.ttl`                                                        | `inspire-address`                                 |

An unlisted project has an empty historical stand-in list.
Every GLEIF root had the CountryRepresentation mapping available while qualifying its closure.
Eight roots are deliberately exercised even though some are also imported by other modules.

## Wider sweep inventory

The source catalogue contained 225 logical entries across 24 prospect collections, 192 OBO Foundry entries and nine curated W3C vocabularies.
Of the latter 201 entries, 169 OBO and all nine W3C documents had original bytes.
The wider results below belong to the downstream JS loading ladder.
The six Java direct-load memory controls above are a narrower observation.
Wider-corpus Java model parity, cross-readers, writer and full-import acceptance each require their own results.
The 178 wider sources and the 47 prospect originals together have **225 distinct SHA-256 digests and 1,231,969,791 bytes** before dependencies or evidence.
That expansion happens to equal the logical catalogue count.
Twenty-three logical entries lack a captured body.

The final 15 wider rejections divide into the following first observable failures.
The rung recorded as `java` in the downstream ladder executed the JS Java behavior profile.
These observations still need direct replay against released native Java.

| Original inputs                                               | Historical JS observation                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| OBO apollo-sv, ngbo, obi, obib, omrse, opl, po, rbo, slso, vo | Both normative modes reported `XML_PARSE_ERROR` (“not well formed”). The named-profile dispatcher ended in `UNPARSABLE_ONTOLOGY`.                 |
| OBO cto, htn                                                  | CTO rejected an invalid anonymous-individual node ID. HTN rejected invalid RDF/XML. The named dispatcher likewise ended in `UNPARSABLE_ONTOLOGY`. |
| OBO ms and W3C odrl                                           | All three JS rungs rejected a datatype used as a class expression.                                                                                |
| OBO opmi                                                      | All three JS rungs rejected an `owl:distinctMembers` list with one item where at least two were required.                                         |

On replay, supply both the pinned bytes and an explicit format, and record the first failing stage.
A media-type hint, a dispatcher refusal and a failure in RDF-to-OWL mapping carry different evidence.

Prepare any admitted ID through the same verified process as the prospect documents.
For direct-document testing of the wider inputs, inspect and record syntax, logical base and declared imports locally.
Reproduce the historical direct load with remote access disabled and missing imports recorded as diagnostics.
Build a reviewed map/stand-in selection for native differential testing and a fully mapped closure selection when dependencies are pinned.
Give rejected originals first-class coverage.
For content negotiation (especially W3C IRIs) try the recorded representation and always compare bytes.
A modern redirect, ontology version IRI or a well-known URL alone proves no historical identity.

### Verified immutable alternatives

For the following mutable raw GitHub routes the upstream repository’s file metadata at the listed commit matched the Git blob ID **and byte length computed from the original body**.
Use these immutable locators in preference to a moving branch.
Verify the SHA-256 from the inventory on every acquisition.
For other sources prefer a tagged publisher asset or version-specific distribution and keep a rights-cleared durable copy as required.
If the publisher no longer supplies the exact bytes and no lawful mirror can restore them, keep the entry blocked.
A newly acquired version gets a new identity and first-run evidence.

| Source ID               | Immutable upstream object                                                                                                                                                                              | Git blob ID                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `asam-openlabel`        | [f2da853d7009](https://raw.githubusercontent.com/ASCS-eV/asam-openx-standards/f2da853d7009939d8292812446749c84352dfffd/standards/asam-openlabel/ontologies/openlabel_ontology_scenario_tags.ttl)       | `cb20617c084063b3511450a6bf5aa356a65521ae` |
| `building-smart-ifcowl` | [befcf5b4f504](https://raw.githubusercontent.com/buildingsmart-community/ifcOWL/befcf5b4f504fbeff34389fe62e3840d4141388c/IFC4_ADD2.ttl)                                                                | `1e6973fc328d23bc53eafccb8c0fcca2905b1480` |
| `eu-epo-core`           | [2276eb5638ba](https://raw.githubusercontent.com/OP-TED/ePO/2276eb5638bac5f66c80ec133bc6a24d0fdd5b76/implementation/ePO_core/owl_ontology/ePO_core.ttl)                                                | `4f98db9bcef6b583a6f0d014db47949b9e54926d` |
| `idta-aas`              | [7792b9dfe66f](https://raw.githubusercontent.com/admin-shell-io/aas-specs/7792b9dfe66f430a7828e12691ebe7fe4701d8dd/schemas/rdf/rdf-ontology.ttl)                                                       | `fb73d1f0450c31029a6828f39f5c475baa0fac70` |
| `inspire-address`       | [f5c7c7da9c1c](https://raw.githubusercontent.com/inspire-eu-rdf/inspire-rdf-vocabularies/f5c7c7da9c1c40bd1bad2b2ea1f8c7b1b80a174f/ad/ad.ttl)                                                           | `d0d95aa11a0608cb9b9adeb3b8a254d5eb5edd16` |
| `nfdicore`              | [23620cd018de](https://raw.githubusercontent.com/ISE-FIZKarlsruhe/nfdicore/23620cd018de10e162567f4bbe4fccaf2b56d7e0/nfdicore-base.ttl)                                                                 | `20ae50a00987e77a5d5b7845991a65776c0da6f5` |
| `obo-cido`              | [d1ebe2ef89ff](https://raw.githubusercontent.com/CIDO-ontology/cido/d1ebe2ef89ffba408df45b1e83621c989f3d18e6/src/ontology/cido.owl)                                                                    | `6baa4bebc2a1cf5ef9e416f2707de83098ae1816` |
| `obo-clo`               | [41502bee395e](https://raw.githubusercontent.com/CLO-ontology/CLO/41502bee395edf5b3990b267f24382d68664749b/clo.owl)                                                                                    | `c3509bbe323c74750905b8b28a47c82cd52ff415` |
| `obo-fovt`              | [7614ad4dde3c](https://raw.githubusercontent.com/futres/fovt/7614ad4dde3c093d940b6bf33ed9e1affc1d3f46/fovt.owl)                                                                                        | `19a99ac03ed1e71a504ef074e263a0c5b21294d6` |
| `obo-iceo`              | [cfe7b2b062b9](https://raw.githubusercontent.com/ontoice/ICEO/cfe7b2b062b9e2fca0aab7c2dbac12f9115fefb9/src/iceo_merged.owl)                                                                            | `893eecb9ee38e1c7ccc1023a4b372ba0fa640f81` |
| `obo-vbo`               | [43282a5f4901](https://raw.githubusercontent.com/monarch-initiative/vertebrate-breed-ontology/43282a5f4901cbce7902a547995a2477a96ff578/vbo.owl)                                                        | `4f0f2aaa98ab974d3653090eafd739f3dfe9d9c6` |
| `pistoia-idmp`          | [791c9a2b1cea](https://raw.githubusercontent.com/Pistoia-Alliance-Inc/Pistoia-Alliance-Ontologies/791c9a2b1cea56c9b234befaa584be3fd41c99a0/IDMP-O/1.4.0/IdentificationOfMedicinalProductsOntology.rdf) | `f9619a9adb73500bbb9a98c352b169818ac5f945` |
| `pmd-core`              | [59ddd3c800d6](https://raw.githubusercontent.com/materialdigital/core-ontology/59ddd3c800d60143201dbd90f7b62832410e875f/pmdco-base.ttl)                                                                | `35929868526092044dcb9c21a11f584a6973556f` |

### Nine curated W3C vocabularies

These published ontologies exercise application data.
W3C conformance cases retain their separate manifests and expected outcomes.
Record licence and attribution for the exact representation before redistributing it.

| Document ID  | Requested source                                  | Syntax or declared media | Historical downstream load |  Bytes | SHA-256                                                            |
| ------------ | ------------------------------------------------- | ------------------------ | -------------------------- | -----: | ------------------------------------------------------------------ |
| `w3c-prov-o` | [Publisher](https://www.w3.org/ns/prov-o)         | Turtle                   | compatible                 |  68795 | `7d203989f67b38bca572253942acc5a1bf24ce3ccfece16f072dcb4be2b79a96` |
| `w3c-org`    | [Publisher](https://www.w3.org/ns/org)            | Turtle                   | compatible                 |  84162 | `3e01f89a17475a88f8b1606ca0fae04800d34dbbf93adc6db12dc30929848729` |
| `w3c-sosa`   | [Publisher](https://www.w3.org/ns/sosa/)          | Turtle                   | strict                     |  27326 | `c70b0d1c843c0047e4c98e0a89392e46a05752ff6365bda7f7f55303905a0392` |
| `w3c-ssn`    | [Publisher](https://www.w3.org/ns/ssn/)           | Turtle                   | strict                     |  22714 | `184d86189191146e314cc52b1bceb96fca11e70aacbc160d71588102a5153eb9` |
| `w3c-time`   | [Publisher](https://www.w3.org/2006/time)         | Turtle                   | compatible                 | 101486 | `251bd6970b0d7a5efa97ff681afe81a297df85deab3d860fa4f8eeba72d8f16c` |
| `w3c-dcat`   | [Publisher](https://www.w3.org/ns/dcat)           | RDF/XML                  | compatible                 | 248255 | `84d611652bddf264f8295766bf96170cdab7f181ef52b341e597750a068fbaed` |
| `w3c-skos`   | [Publisher](https://www.w3.org/2004/02/skos/core) | RDF/XML                  | compatible                 |  28966 | `e79633b8d0564816cee8a99f5c9acf9a0e6fc7257c7209acd684ecad53a89dd6` |
| `w3c-shacl`  | [Publisher](https://www.w3.org/ns/shacl)          | Turtle                   | compatible                 |  67794 | `5ff798587ba2cbf79dfb7100c4a1a4094a682fde690f321bba015c14a4c6b95d` |
| `w3c-odrl`   | [Publisher](https://www.w3.org/ns/odrl/2/)        | text/turtle              | rejected                   |  91012 | `7895765e80d86d1d0349d945a28b8a2479f03169572345080a5b3e561ef31457` |

### OBO documents with captured bytes

The acquisition IRI for each of the following entries is `http://purl.obolibrary.org/obo/{stem}.owl`.
Remove the `obo-` prefix from the ID for the stem.
The sole exception is `obo-apollo-sv`, whose stem is `apollo_sv`.
Prefer a verified immutable alternative when supplied.
In the TSV, `O/` expands to `http://purl.obolibrary.org/obo/`, `OS/` to `https://purl.obolibrary.org/obo/`, and `GH/` to `https://raw.githubusercontent.com/`.
The final column is a declared version IRI if present, otherwise a stable-form source locator from the original fetch, otherwise a dash.
It is an acquisition lead subject to the row’s digest.
A format beginning `HTTP=` is a transport hint for an input the worker rejected.
A licence label is the registry’s claim at intake.
Check individual terms, provenance and attribution before redistribution.

#### obo-ado through obo-emapa

```tsv
id	bytes	sha256	load	syntax	licence-lead	version-iri-or-source
obo-ado	5491455	30d2c292255ef4f59cae3940e24f9fd64e049c232492007197bf0a583861f20d	strict	rdfxml	CC BY 4.0	O/ado/releases/2023-09-20/ado.owl
obo-afpo	1369705	f6704f64a284bba05f9736172bcb0f058c4cc3759273a84d2ad53a8461f30765	strict	rdfxml	CC BY 4.0	O/afpo/releases/2024-03-21/afpo.owl
obo-agro	7501012	d861a6fbf09e01fffcf4312dee29f20a15a1a4a65b2a7012e50c02f65a495b55	compatible	rdfxml	CC BY 4.0	O/agro/releases/2022-11-02/agro.owl
obo-aism	24533720	0aee81bbc9b9d963765dc470488e97ccae05143f831eeec6c1b97dea0cc56dc5	compatible	rdfxml	CC BY 4.0	O/aism/releases/2026-02-14/aism.owl
obo-amphx	589457	f1f547e212df0c5fbf1d6076d9d44988abecfdefe299c47f06d777281ef8a1ff	compatible	rdfxml	CC BY 3.0	O/amphx/releases/2020-12-18/amphx.owl
obo-apo	716033	480bcc296b5358e9d391c8e6b29b6d159b21a5f766437bb30c24de423beb5954	compatible	rdfxml	CC BY 4.0	O/apo/releases/2026-10-30/apo.owl
obo-apollo-sv	2644704	e2b385066b9e2552131fccb974c6f45885ca96b8b4d30c8fbcfca33882b15070	rejected	HTTP=text/plain	CC BY 4.0	GH/ApolloDev/apollo-sv/main/apollo_sv.owl
obo-aro	12743305	0207b9156898d011cff6397a1cf5b0e178ce7806222c73de875b57a0d0e6b6fc	strict	rdfxml	CC BY 4.0	GH/arpcard/aro/master/aro.owl
obo-bco	899384	ccd231904600b69ca201ca0c49863976c2b44bb18daac3710e9109cf449eb805	compatible	rdfxml	CC0 1.0	O/bco/releases/2021-11-14/bco.owl
obo-bfo	157931	ca399c2b8b79f4d12b296d5c4ea4c00940e1f82cee7d1a50ddc292aa4f6c4666	strict	rdfxml	CC BY 4.0	O/bfo/2019-08-26/bfo.owl
obo-bmont	1218628	f4a906578d4d68485bb595cd45a2cdc282d1cf3b65a82dd333d709b9ebebccf5	strict	rdfxml	CC BY 4.0	O/bmont/releases/2025-06-20/bmont.owl
obo-bspo	589018	9f1a7f1d6ae88fa0831fa553abf179c6a4f252c46d1b11e2fcc8373cfe02850c	compatible	rdfxml	CC BY 3.0	O/bspo/releases/2023-05-27/bspo.owl
obo-bto	10645778	f89ff8a04b57ffee51cf07b05c70b39b3a6b2026940d5bda851e943a4b1a0f4b	compatible	rdfxml	CC BY 4.0	O/bto/releases/2021-10-26/bto.owl
obo-cdao	123591	7cefc60890f0164b9b377d511b16fc75137bc4da33cb26b7067593d0364982f8	compatible	rdfxml	CC0 1.0	O/cdao/2024-01-25/cdao.owl
obo-cdno	11030817	33ed0836cebfe32f658dfec4660c686a3572a91dc14187f5eae52a4576320ba1	compatible	rdfxml	CC BY 3.0	O/cdno/releases/2026-11-17/cdno.owl
obo-cheminf	263845	f83a0f0254db17cbc7abf3384cb98b3a40c84b3b304a6e4d3b3382878faab002	compatible	rdfxml	CC0 1.0	GH/semanticchemistry/semanticchemistry/master/ontology/cheminf.owl
obo-chiro	294510	0376b14fdbd170252c25fe258ae1545235212e7e52b8035df6e83dd9ce84e11f	strict	rdfxml	CC0 1.0	O/chiro/releases/2026-08-24/chiro.owl
obo-chmo	5719112	09125c379b53f6bbf5eb8e25a5d2a142fa5031b7aded5ddec758908f2c1fd2c0	strict	rdfxml	CC BY 4.0	O/chmo/releases/2026-05-27/chmo.owl
obo-cido	46951577	bb17610749edccc346921524ed1836475e91421fa1b391f90b9dc9c37691376a	compatible	rdfxml	CC BY 4.0	O/cido/releases/2024-02-16/cido.owl
obo-cio	124125	3cde6b351c6d2abe7ed117012925a62491b38e6e4a31337dfb9837ac5a0f9408	compatible	rdfxml	CC0 1.0	O/cio/releases/2015-03-10/cio.owl
obo-clao	1759188	63179e7160df5cc393cd35aaebcb8407acf826fa5c77b5d1d4c3aa6b31395415	strict	rdfxml	CC0 1.0	O/clao/releases/2026-06-16/clao.owl
obo-clo	37965858	64b8167d3bdf789d902906053fcec29c0644d34e22378032fa0d2e03915d8920	compatible	rdfxml	CC BY 4.0	O/clo/releases/2026-06-19/clo.owl
obo-clyh	301349	0cbaaeedc067394d9d54f589955a3027eeff0567b7fe9b96c30f47c85601a8ea	compatible	rdfxml	CC BY 3.0	O/clyh/releases/2020-05-29/clyh.owl
obo-cmeo	101111	d366892bd348b3afdc31f710b8cdc21b7148be2eff0dcc6b8c98b79b999fb49b	strict	rdfxml	CC BY 4.0	O/cmeo/releases/2026-11-04/cmeo.owl
obo-cmo	9556162	8d8cc110f1ccab100eb615eb66da375f0b9b22dc5d195fb483cf4b5666b299dc	compatible	rdfxml	CC0 1.0	O/cmo/releases/2026-11-14/cmo.owl
obo-cob	57691	bd4603fefcbfc9b700f37723a7caa5eb0e9b78be950e2680c9898732eb53651e	strict	rdfxml	CC0 1.0	O/cob/releases/2025-12-15/cob.owl
obo-colao	3238163	59da1642385e7761f7d5a59e2f3b54fd9202c5a75689c5063e9472ee0f792124	strict	rdfxml	CC BY 4.0	O/colao/releases/2024-06-21/colao.owl
obo-cro	111351	1b4b43424d951e2880163cb870737b1c48e50f8ad76f50b5dccfb6af9958fe4c	compatible	rdfxml	CC BY 2.0	O/cro/releases/2019-12-11/cro.owl
obo-cteno	289634	ba13033301422dd3e6cdb52855fc98d1ffaa010951507921416a7a4453d2a43e	compatible	rdfxml	CC BY 3.0	O/cteno/releases/2016-10-19/cteno.owl
obo-cto	1033156	9eb6c989f26ed9079eff28efb5d11c3b0b05eb8af47691d224740042b7501a5b	rejected	HTTP=text/plain	CC BY 4.0	GH/ClinicalTrialOntology/CTO/master/cto.owl
obo-cvdo	1339226	2dc1635cbe88923cea754931d5066873fff7f2f1e7850e151dc3b7d595deefbd	compatible	rdfxml	CC BY 4.0	O/cvdo/2024-05-17/cvdo.owl
obo-ddanat	304336	bbc97bda154ddabff4abacad2eb96c73dacfbd1da36860541cf1140c1a8441cf	strict	rdfxml	CC0 1.0	GH/dictyBase/migration-data/master/ontologies/dicty_anatomy.owl
obo-ddpheno	1482682	62325f457ba81ddd015c7164de3e89b119c8e2dbea8c9b3556a5e5b88491f79b	strict	rdfxml	CC0 1.0	O/ddpheno/releases/2023-08-26/ddpheno.owl
obo-dideo	991464	1f4da6b6183d897f972890fac672ef637234da6749ba4db233887439ce59ee1b	compatible	rdfxml	CC BY 4.0	O/dideo/release/2023-10-16/dideo.owl
obo-disdriv	110519	fd45c6fa849ca2667bd31bb65fc3d8c56e2b55a9f18a16cdc109de35548aabd3	strict	rdfxml	CC0 1.0	O/disdriv/releases/2026-03-31/disdriv.owl
obo-doid	29024840	f766045282299e53dc369ebf5600436b11a9b6ed1dcd3af5cc9b7b5d6b452600	compatible	rdfxml	CC0 1.0	O/doid/releases/2026-10-29/doid.owl
obo-dpo	4267303	14054b1026dd54b8bd72d679c595da72fa4c4a9d033fefe837cc73acd1ca3f52	compatible	rdfxml	CC BY 4.0	O/dpo/releases/2026-11-02/dpo.owl
obo-duo	108348	6a34ce09ae07b1e37c6756e049c12129fd1104e7d9e6e2f8cee84d2ab374c45b	compatible	rdfxml	CC BY 4.0	O/duo/releases/2021-02-23/duo.owl
obo-ecao	25560155	b9711555509d08cea3931107860db994929fc30e093d5301ef83151fbe72a272	compatible	rdfxml	CC BY 3.0	O/ecao/releases/2025-05-15/ecao.owl
obo-eco	6316746	3cd12afd4668455a8d441fcff70592be234e1547d0443ac0631fadf5c95ead2c	strict	rdfxml	CC0 1.0	O/eco/releases/2026-07-10/eco.owl
obo-ecocore	17806573	8512276964d7a6157f6d110617861ec5ca8b7404aca3f51c254292a63d7aa037	compatible	rdfxml	CC BY 3.0	O/ecocore/releases/2026-10-08/ecocore.owl
obo-ecto	28320857	c637876e3c15494ee260e05b73cea38f0b152eee5aff1c10ad6e2574d74bc5c3	strict	rdfxml	CC0 1.0	O/ecto/releases/2026-07-28/ecto.owl
obo-emapa	11337650	19a7095e549e54856d035ae52d266a1bb8c4036803995696ca2581afeecf950c	strict	rdfxml	CC BY 4.0	O/emapa/releases/2026-10-02/emapa.owl
```

#### obo-emro through obo-miapa

```tsv
id	bytes	sha256	load	syntax	licence-lead	version-iri-or-source
obo-emro	278322	ea2ca95ea50f5f24119f046913d645651c02fea9cf155acd74893e41d4ba5e4c	strict	rdfxml	CC BY 4.0	O/emro/releases/2026-11-09/emro.owl
obo-envo	9955495	cc070bc1ceca4bf7b6f745c1f0c09398536f46603ff0db53d22f7454fb182f88	compatible	rdfxml	CC0 1.0	O/envo/releases/2026-10-23/envo.owl
obo-epio	3259618	efafdd4605792f69b177702e84665fce845031ab8be3bbc9a030a05bd763dd05	strict	rdfxml	CC BY 4.0	https://bio.scai.fraunhofer.de/ontology/epilepsy/2021-05-28/EPIO.owl
obo-exmo	1693215	fb50ade98271ed4e2fdd2f1e9f00010354fbd5743846f5f939edade225e49142	compatible	rdfxml	CC BY 4.0	O/exmo/2025-06-05/exmo.owl
obo-exo	204644	c85ed9fd27c97b245b44eccd5174a7276237e8ce0335adf2d80a71fae18e28ef	strict	rdfxml	CC BY 4.0	O/exo/releases/2025-08-29/exo.owl
obo-fao	168301	844a03f52dd07d45f348d4d792ecea2db559ad23c88f79294a173b3ca6f18a2b	strict	rdfxml	CC0 1.0	O/fao/releases/2025-07-15/fao.owl
obo-fbbi	673967	3a392496fe0c24cf9a142a093a3fe2558bd362b3d881812549baf53d5cd1bf4a	compatible	rdfxml	CC BY 4.0	O/fbbi/releases/2026-06-25/fbbi.owl
obo-fbcv	4434121	fe2aaf2c2d228c98dde8ade5048eac0fac4103a1a0de0d65e8132c5bc1985300	compatible	rdfxml	CC BY 4.0	O/fbcv/releases/2026-11-02/fbcv.owl
obo-fbdv	524091	f6775f5df95c6f3e32fd9717696e99e409e3f371f99dc8086deb45524aea93e8	strict	rdfxml	CC BY 4.0	O/fbdv/releases/2026-11-02/fbdv.owl
obo-fideo	3229407	4b6c51b857b7e83cc950b1d009d8b7380e3b80366f3bac4d8617fd5b8508defc	strict	rdfxml	CC0 1.0	O/fideo/releases/2023-12-18/fideo.owl
obo-flopo	52650588	e580eb0b38afb46eca80d5a17e885bae08a600cd311105da43a4a8245dbe98cf	compatible	rdfxml	CC0 1.0	O/flopo/releases/2026-11-15/flopo.owl
obo-fobi	2473019	d9a4eef5228aee9794922c4f1da6bc5b791ba0b5e38ddbc00473c179a8fe3505	strict	rdfxml	CC BY 3.0	O/fobi/fobi.owl
obo-foodon	40779019	b897bf64c1b265c422db9ee01e1235c10c0b809e7f02326ef810a52068347edf	strict	rdfxml	CC BY 4.0	O/foodon/releases/2026-09-20/foodon.owl
obo-fovt	43834846	b533c22ddc907b2ee050dd543f474b3c13d2f38c66c1b375b878f7897808f038	compatible	rdfxml	CC0 1.0	O/fovt/releases/2026-03-19/fovt.owl
obo-gallont	1072074	593f8ff1c531726dcf8a924742bbcd9e4caee44a044bf42389751ab64e193c7c	compatible	rdfxml	CC0 1.0	O/gallont/releases/2024-04-19/gallont.owl
obo-gecko	160220	3187e9ceb9a98316dcbed900a7afc88ead1d4c3d5fdb7eec7b08644521c3fb65	compatible	rdfxml	CC BY 4.0	O/gecko/releases/2021-01-18/gecko.owl
obo-genepio	7909993	9ccfe40b0529bb05bdf81dea1644759933fe4a3f0e8293b85d7caa1b6a1db73c	strict	rdfxml	CC BY 3.0	O/genepio/releases/2026-04-13/genepio.owl
obo-geno	1367462	12e4ab6201d8125775e99af459702e7c8dda64ddc71689821d05b599943f1389	compatible	rdfxml	CC BY 4.0	O/geno/releases/2026-02-02/geno.owl
obo-geo	114557	2727d7d1f470353e44f81f90aa7a6ba4bbdff1e06431bdaa9ef317ce4c4ae822	compatible	rdfxml	CC BY 4.0	GH/mcwdsi/geographical-entity-ontology/master/geo.owl
obo-gsso	21160138	125a51e244fdc5a24332ccb26797f61ee14182e279f192f82265428bd87621ba	strict	rdfxml	Apache 2.0 License	O/gsso/releases/2.0.11/gsso.owl
obo-hancestro	2142942	6ea50659b2b25de343a1deb81753916a098e1d7e11aed485adbaddd27d010410	compatible	rdfxml	CC BY 4.0	O/hancestro/releases/2025-10-14/hancestro.owl
obo-hao	7007288	14539ee4e4b5848c20bdb4d71eacface0a139213bdc3ebf358671ead62cf2d29	strict	rdfxml	CC0 1.0	O/hao/2023-06-01/hao.owl
obo-hom	128032	809a1a78e9938509fc1a9fe18ec636836bd1a7e442a63d6e097f38342a83e644	strict	rdfxml	CC0 1.0	O/hom/releases/2015-01-07/hom.owl
obo-hsapdv	528600	bc310742b68d398f991fe5f6f3e8177f3ed30f648cc75411f175029d0ec5f5d8	strict	rdfxml	CC BY 3.0	O/life-stages/releases/2025-01-23/components/hsapdv.owl
obo-hso	1360745	759a191213d53226f35a9b0f76125d49bb2bdf5cfea534953215e5f476d8c7e6	compatible	rdfxml	CC BY 3.0	O/hso/2021-12-13/hso.owl
obo-htn	1322067	3a37d97cc30706842afbde47543e7280907a6dc15bb4292a22a7c295242ca59c	rejected	HTTP=text/plain	CC BY 4.0	GH/aellenhicks/htn_owl/master/htn.owl
obo-iao	609839	c27ff2964a2ad8165bc365698b628aae95108411384aa4450e6e1b1e82bf0f41	compatible	rdfxml	CC BY 4.0	O/iao/2026-03-30/iao.owl
obo-iceo	37320151	b647e59b45ce38ddd30c06213058d9a58164b20a73dbf297e7b327a93c8c7f51	strict	rdfxml	CC BY 4.0	GH/ontoice/ICEO/master/src/iceo_merged.owl
obo-ico	1819741	a13ad5b7e7ada7a715e7def072fc32e185d20ef6d86ce8ea3500d495a99b6e20	compatible	rdfxml	CC BY 4.0	O/ico/releases/2026-02-28/ico.owl
obo-ido	767134	de5d35114bb65b7475551388e8a7899d202c4d69672bd9e39466605119fafb50	compatible	rdfxml	CC BY 3.0	O/ido/2017-11-03/ido.owl
obo-ino	493136	6bb6e8d3ce748953ccfa3978c2e73c3d58db5276fda7ed78f1f2af7df3ba88d1	strict	rdfxml	CC BY 3.0	GH/INO-ontology/ino/master/src/ino_merged.owl
obo-kisao	1122492	6186252501536277e178aa8d027d691144574d6861a1dfd244ed9bdf16d60426	strict	rdfxml	Artistic License 2.0	GH/SED-ML/KiSAO/deploy/kisao.owl
obo-labo	380384	edebab71df1d8dcdf6b530e82f9ef30b15e0df1c2de3213c9be4984d82bfa21e	strict	rdfxml	CC BY 4.0	O/labo/2021-06-08/labo.owl
obo-lepao	2688178	d2fb4d42adbe2b3e2691f0bc2cd5887aabf3435e2b21ff66f0c5c7fd0fe2d5c6	strict	rdfxml	CC BY 4.0	O/lepao/releases/2023-02-18/lepao.owl
obo-ma	2134113	259bc71d2566dfa468112821e1376e55dacbd8bfa1548f533bb80b21afa31da6	strict	rdfxml	CC BY 4.0	O/ma/releases/2026-02-24/ma.owl
obo-maxo	16448041	22c57deb7c95e932f578e95f97d3382cd97d6180637ac892b3cd02778c56f8b5	strict	rdfxml	CC BY 4.0	O/maxo/releases/2026-01-15/maxo.owl
obo-mco	17308396	910807227de31317e2aa65587a5030988b1e4efc2fabe558f973609876cd739b	strict	rdfxml	CC BY 3.0	O/mco/releases/2019-05-15/mco.owl
obo-mcro	63121	27eae4075e1355e110a1a2a7a2718f952ca4d00223bc2259f9d8ee205dbc2ff6	compatible	rdfxml	CC BY 4.0	O/mcro/releases/2023-03-07/mcro.owl
obo-mf	430780	1c0166102ddfc57a5415b541b86a4894116e00a36f66d49fd2bafb647f67b587	strict	rdfxml	CC BY 3.0	O/MF/2025-07-08/MF.owl
obo-mfoem	640327	b3b5f3a74be326350df3fffd24992dee9b990af3da0690a9d302cc1de2940894	strict	rdfxml	CC BY 3.0	O/MFOEM/2025-07-31/MFOEM.owl
obo-mfomd	7116	378d88f742231ffe249ce2b0b42283f3126f427f70962de087d89b05a5582534	compatible	rdfxml	CC BY 3.0	O/MFOMD/2020-04-26/MFOMD.owl
obo-mi	3182447	98e69760968d41eabf1638d66d7dd19f05bd04fe0ad00a98da7b3d8543a64225	strict	rdfxml	CC BY 4.0	GH/HUPO-PSI/psi-mi-CV/master/psi-mi.owl
obo-miapa	37095	549c8b55d7d908e0973b5a6977c5b38977fe1ce72d0101c758b326656aeeea27	compatible	rdfxml	CC0 1.0	GH/evoinfo/miapa/master/ontology/miapa.owl
```

#### obo-mmo through obo-plana

```tsv
id	bytes	sha256	load	syntax	licence-lead	version-iri-or-source
obo-mmo	1925928	b5e26e3769989a64d9c536fb7306ee33e0f8df291b70ca28980fbc19c26f2d2e	compatible	rdfxml	CC0 1.0	O/mmo/releases/2026-10-10/mmo.owl
obo-mmusdv	367557	1b2db363f8fe66444e3fe521bebc5eceb3ed497b24174ef456a0cdac3b1d0338	strict	rdfxml	CC BY 3.0	O/life-stages/releases/2025-01-23/components/mmusdv.owl
obo-mod	7704225	99373e4fe8d80943e4e0b0a3260310af04748ea04e8e44db9c4123bda31651c5	strict	rdfxml	CC BY 4.0	O/mod/1.41.0/mod.owl
obo-mop	4842233	7ed57af2b7e7b19f3d2e4e3d74982ec392efe586fc3d5307b2c999d5810206d9	strict	rdfxml	CC BY 4.0	O/mop/releases/2022-05-11/mop.owl
obo-mpath	1434612	d20c3079f2fa02755bd62575645054445277e3156afebb2c3d456f7a084276fe	strict	rdfxml	CC BY 3.0	O/mpath/2020-05-19/mpath.owl
obo-mpio	111125	079d4b86356f769ef6a8cbafcdacbdf487fef46fdcd600f8cbac0106d6408236	compatible	rdfxml	CC BY 4.0	O/mpio/release/2023-10-17/mpio.owl
obo-mro	66923606	f01d1a64d0e742483f296acc183d0c919cb59fde9f8f3f2ed870be2717331a2f	strict	rdfxml	CC BY 3.0	O/mro/2026-10-20/mro.owl
obo-ms	7893401	8c2ad569fa5ffe3aff8c4c33789c1da1763fe771b459fa5f2d1a1a9873f34263	rejected	HTTP=application/octet-stream	CC BY 3.0	-
obo-nbo	5635046	dbae2820243e1bb16f81085fcd88e06d0f82948aa120fb653ae6154ee93916eb	compatible	rdfxml	CC BY 3.0	O/nbo/releases/2023-07-04/nbo.owl
obo-ncro	2555715	a5bf7ba6e35933356678ab10c039a9cfe5394869d1af2f76ddefa10559198af4	compatible	rdfxml	CC BY 4.0	O/ncro/2015-12-10/ncro-combined.owl
obo-ngbo	1413449	943495c35bfc7e95b2cbb7213815caf2b47c550258262c7affdc30eb57b6dfce	rejected	HTTP=text/plain	CC BY 4.0	GH/Dalalghamdi/NGBO/master/ngbo.owl
obo-nomen	178206	3e7a4853ea6e704ec2429e7bc71b4b2fc3d447e1c3c750cb903a7130bba7f463	strict	rdfxml	CC0 1.0	GH/SpeciesFileGroup/nomen/master/src/ontology/nomen.owl
obo-oae	11861895	3ff0f811db391c5c9425296a0978a122c7e6e97b7b81df1e1dfcb9ef6fee71b5	strict	rdfxml	CC BY 4.0	O/oae/releases/2026-04-15/oae.owl
obo-oarcs	704087	b7dfe0b7ced8ad30bf20b075b6bfc73b214f90cafb792cd2298e2c810240c181	strict	rdfxml	CC BY 3.0	O/hao/2019-04-18/hao.owl
obo-obcs	1880209	15c9fc46a03ed693f60c23cfcc73c1172967262c3b552c2c836c5b9273c1e008	compatible	rdfxml	CC BY 4.0	O/obcs/2023-12-08/obcs.owl
obo-obi	9980280	8874abcca971ee26b4e4442198387916d788d14af3519e1040474908ed12b946	rejected	HTTP=text/plain	CC BY 4.0	GH/obi-ontology/obi/v2026-07-27/obi.owl
obo-obib	2635524	596d0be49bf485b06919ec898381eea21715d7c584dd41fb26f6828927f21616	rejected	HTTP=text/plain	CC BY 4.0	GH/biobanking/biobanking/v2023-04-05/obib.owl
obo-occo	5465131	97462cabc824526898e486c6d780d62ab13b81ec98d30d4f05df41178b2d9f37	compatible	rdfxml	CC BY 4.0	O/occo/releases/2025-10-06/occo.owl
obo-ogms	298806	e602524ec895844ee715334586850ecb77b1d3ed2668cec4b9f1dbc00c25b4c2	strict	rdfxml	CC BY 4.0	O/ogms/2021-08-19/ogms.owl
obo-ohd	4066029	82f8cd8f95074f6531c3de27e161982777c0baf4305e5c9ccc825c2515714c39	strict	rdfxml	CC BY 4.0	O/ohd/releases/2026-11-04/ohd.owl
obo-ohmi	3113369	f7c809d9dba32784fd22b8449418b82e2ac5dff7e89bdc67aacfb10df66c3706	strict	rdfxml	CC BY 4.0	O/ohmi/releases/2026-05-14/ohmi.owl
obo-ohpi	29016104	1f13ff554349f4b8b013d395036d930f57654310a2988e6f7e28439e48d4dc51	compatible	rdfxml	CC BY 4.0	O/ohpi/releases/2019-09-30
obo-omit	34847272	aebcc5503200b9c2605255142fb14d35d801c399972ac4b6d816e8921214af3a	compatible	rdfxml	CC BY 3.0	O/omit/dev/omit.owl
obo-omo	111065	ab2c2791f189d44f9cc38a484ca3f449c7551f7eb53ff50376d2b81cb512b963	strict	rdfxml	CC0 1.0	O/omo/releases/2026-09-25/omo.owl
obo-omp	4511122	51712c406e266a1eb7115028aecc5389fbee50f6d5196af3d666ba9c600f3ca0	strict	rdfxml	CC BY 3.0	O/omp/releases/2024-03-25/omp.owl
obo-omrse	1199379	610ea82420deccf08247aaff1922f853e06a1eb8715860cc648dbbd30b33b094	rejected	HTTP=application/octet-stream	CC BY 4.0	-
obo-one	81100	fbdb10dd806152c204384517a14aa8c3bd0154d3aeec1c313c2842c0a85b73ef	strict	rdfxml	CC BY 4.0	GH/cyang0128/Nutritional-epidemiologic-ontologies/master/ONE.owl
obo-ons	2915689	b63755c7d098c69fdf5d3f97de269d92223a6eea2d8393b1f38ec80eba8a859d	strict	rdfxml	CC BY 4.0	GH/enpadasi/Ontology-for-Nutritional-Studies/releases/download/2026-02-06/ons.owl
obo-ontoavida	472853	3da46c81ccb8c5219fe9a5a1ca083dab351c29f4c83dd3bac9555594593629d6	strict	rdfxml	CC BY 4.0	O/ontoavida/releases/2022-03-15/ontoavida.owl
obo-ontoneo	2176503	03dae64d1982dd779e5a415e9d6c229374d2a736d5ba399fd578b27c47c11dcd	compatible	rdfxml	CC BY 4.0	O/ontoneo/releases/2025-03-14/ontoneo.owl
obo-oostt	712818	2befad2eb5dd60d90c52f401b39c066d5bbf0c6886003ebdbb5131e69fc015e4	strict	rdfxml	CC BY 4.0	O/oostt/release/2026-09-10/oostt.owl
obo-opl	941059	6291a89589f01196cb4848bf215450e7b83c2a6af4422102f239895fa41c9dee	rejected	HTTP=text/plain	CC BY 4.0	GH/OPL-ontology/OPL/v2023-08-28/opl.owl
obo-opmi	5195365	081b02ed22e0c9006ffe1bd4fe68b0f2e8076e3fb989af5595f2ddb1020f7570	rejected	HTTP=text/plain	CC BY 4.0	GH/OPMI/opmi/master/opmi.owl
obo-ornaseq	166036	b69d8eaf186dbfceea263931fd981174d42dbcdcdc5beeed469141bce16c6243	compatible	rdfxml	CC BY 4.0	O/ornaseq/2019-07-08/ornaseq.owl
obo-ovae	3945072	25d1bf39ba7eade77d08ab59558d54b8de58c519a725dae290f98d3d97e20cd4	compatible	rdfxml	CC BY 3.0	GH/OVAE-Ontology/ovae/master/src/ontology/ovae_merged.owl
obo-pain	1446306	33c296dda312f81cd3925b1c91dff37ed2b5184e676d3003cc001e44dac49f65	strict	rdfxml	CC BY 4.0	O/pain/releases/2026-11-04/pain.owl
obo-pato	20899088	27c1bb7d2bfeb3592274b27ad1632bc7834a71f38d216210730fc44060d3ef0c	strict	rdfxml	CC BY 3.0	O/pato/releases/2026-10-01/pato.owl
obo-pbpko	2132866	ae191423a64b9f48fd1957304f615f4fcf10b6e6b5ee5174cc33a5811052c854	compatible	rdfxml	CC BY 4.0	O/pbpko/releases/2026-07-15/pbpko.owl
obo-pco	595304	c2363da29b19c5af1876b1d5078c8b4958ec43e752eed2fb7eb75f0225d47507	compatible	rdfxml	CC0 1.0	O/pco/releases/2021-05-03/pco.owl
obo-pdro	787015	13c178e37fc60a8f3473c21c06c48fbb8842f5b55e77b2c329c00cac7745d1be	compatible	rdfxml	CC BY 4.0	O/pdro/2026-06-09/pdro.owl
obo-peco	1653874	5a75230cb6ec03a5ceb04b7ae5665d65530fdaa8691e6729c3d120261085dbfe	compatible	rdfxml	CC BY 4.0	O/peco/releases/2025-12-02/peco.owl
obo-phipo	31212734	683fcbdf96b656093594572adbf5c0cd8e03ca26fbd43e0f41bacee064252892	compatible	rdfxml	CC BY 3.0	O/phipo/releases/2026-08-06/phipo.owl
obo-plana	2529953	368c1f41e7dea1e8a9c5b27a442cf3046c8b348f64e6f668d763d0b674ebd2ab	compatible	rdfxml	CC BY 3.0	O/plana/releases/2023-03-13
```

#### obo-planp through obo-zfs

```tsv
id	bytes	sha256	load	syntax	licence-lead	version-iri-or-source
obo-planp	10529138	2b46795d2ac2e368e4024b28a6b3aee747a98ea097598e4267d56e7920509913	compatible	rdfxml	CC BY 3.0	O/planp/releases/2020-03-28/planp.owl
obo-po	5426306	a066a2091b96dc6c960683a67936ccda4926afd96e4edb22df9e30feec16e9e0	rejected	HTTP=text/plain	CC BY 4.0	GH/Planteome/plant-ontology/master/po.owl
obo-poro	908416	52f310ae8d1f693cc5c1186e7d8f050c818fc3ff52968ef5d7e1ff67f3a05c36	compatible	rdfxml	CC BY 3.0	O/poro/releases/2016-10-06/poro.owl
obo-ppo	1363692	d446d6a6dba36d7686535bf9d7b4be0a6a956dcd2f7b9d90a1872fdfc7124bc1	strict	rdfxml	CC BY 3.0	O/ppo/releases/2026-05-06/ppo.owl
obo-prefer	20726992	e038f5ee87604a5bd12621a3017f89e94756b73d38828acc74badff2e4013ae1	compatible	rdfxml	CC BY 4.0	O/prefer/releases/2026-08-24/prefer.owl
obo-proco	1418368	c11ac45665556bd352075fac67f585d1a62fff606097a72a0ee3ab672edd373d	compatible	rdfxml	CC BY 4.0	O/proco/releases/2022-04-11/proco.owl
obo-psdo	76992	9f8374781c812ea4830e99141003f09172bcda2c7ac88e0f8f91de3c69a7de57	compatible	rdfxml	CC BY 3.0	O/2022-02-23/psdo.owl
obo-pso	7539745	d51252e9e15466960e5d678d3dace1f49c2ad1a8e3bbd49954cd9062c278ce07	compatible	rdfxml	CC BY 4.0	O/pso/releases/2026-01-08/pso.owl
obo-pw	5404458	cc29cab1fbe52e09a177c8916e751bf8602f7ad06aec4e85ed8859b16aa11102	compatible	rdfxml	CC BY 4.0	O/pw/releases/2026-11-14/pw.owl
obo-rbo	29280872	5b5968bbd83d3103b9448fb17d85f09c7c0643f07314e4ae331e30f01ee1f593	rejected	HTTP=text/plain	CC BY 3.0	GH/Radiobiology-Informatics-Consortium/RBO/master/rbo.owl
obo-ro	1224640	9a3190d49564743aa00f0b0f2e2d9c5fc5673ac7bb3c369284bf490294d42f77	compatible	rdfxml	CC0 1.0	O/ro/releases/2026-09-04/ro.owl
obo-rs	5716189	8baca5f2ef7b2f96790f5e94706e581f3cbbdf77b4d2e9dd322b062bde342735	compatible	rdfxml	CC BY 4.0	O/rs/releases/2026-11-14/rs.owl
obo-rxno	1716545	ffe2884b6aed5f130bb04d35104d1e7c55fb4e39ad78d7f748cdfc4f5cd478a7	strict	rdfxml	CC BY 4.0	O/rxno/releases/2021-12-16/rxno.owl
obo-sbo	582599	b6a6671bbaa0936fb9f11f093b07b77cd89ab476c2b55b2e11184e0473634105	strict	rdfxml	Artistic License 2.0	GH/EBI-BioModels/SBO/master/SBO_OWL.owl
obo-scdo	3333372	9a7b3f806071037858b896894e25d356993f43ca2703302aac053fb40bf3ecfd	strict	rdfxml	GPL-3.0	O/scdo/releases/2021-04-15/scdo.owl
obo-sepio	574859	ae9161620d677fe16857e0704006b7d07086e2ac75688261be901b0f9c3db488	compatible	rdfxml	CC BY 3.0	O/sepio/releases/2023-06-13/sepio.owl
obo-slso	6078809	acfc4ed43d0a6779df9950d375bf37b2a8af3006ce30a4b690e0e32e931d6193	rejected	HTTP=text/plain	CC BY 3.0	GH/nasa/LSDAO/master/slso.owl
obo-so	3974970	28d19f7767d8848ceb9088658079ede9b467f4ee95205220520229a45582c6aa	strict	rdfxml	CC BY 4.0	O/so/2026-08-07/so.owl
obo-spd	1094063	b00e7238362e93b28d3f4b6e212a18afd85cc521da57aab9dca0ce792e200df8	strict	rdfxml	CC BY 3.0	GH/obophenotype/spider-ontology/master/spider_comparative_biology.owl
obo-stato	2213239	7e8f945ee30c6b24139f0064d57c2edbcfc988f3f74811cad6b5c84819ce1494	compatible	rdfxml	CC BY 3.0	O/stato/releases/2026-04-20/stato.owl
obo-swo	3132540	a2136461c6bf4a76c42caf6f96da3910a2d334d555a372639f16f6dbef1e4545	compatible	rdfxml	CC BY 4.0	http://www.ebi.ac.uk/swo/swo/releases/2023-03-05/swo.owl
obo-symp	832936	9054e6a87d4af4ac18876aef953a5cf151aa0a3d82d15f8850928bd0413e5b87	strict	rdfxml	CC0 1.0	O/symp/releases/2026-07-30/symp.owl
obo-t4fs	862626	11a3ada96ac23df1cbe9175c7f6946337c3c4b6d6d297f837548fe38a4d18278	compatible	rdfxml	CC BY 4.0	O/t4fs/releases/2025-02-09/t4fs.owl
obo-taxrank	54031	ac134041984f1157d617f10f67e1c384c18a6a9385d396aa60732df34c193b3e	strict	rdfxml	CC0 1.0	O/taxrank/releases/2025-09-24/taxrank.owl
obo-to	3219310	369d261d9262fe750c5b1593f92ee3028111e77104b2cfd5a03551cbcb2a16bd	compatible	rdfxml	CC BY 4.0	O/to/releases/2026-01-14/to.owl
obo-trans	51218	eb0eb52ad99b87656f816e41e2143cf6e70038bcd281a43f382ff8fea9bacdb0	strict	rdfxml	CC0 1.0	O/trans/releases/2026-03-13/trans.owl
obo-txpo	18381443	52dec38466ae599d8aa39c2fc8c8811fa864794f73b70a658ae1fb5b95895eaa	compatible	rdfxml	CC BY 3.0	O/txpo/releases/2022-12-07/txpo.owl
obo-uo	647954	6b29d48454d1e8b6ec07a1d3e7e22012c0e4933a5fb1ef7c0beaa106e7367e10	strict	rdfxml	CC BY 4.0	O/uo/releases/2026-10-12/uo.owl
obo-vbo	65043359	1375af3c0aac025f38c0a8767d0896a4ed189f290041eb58443d22f990b8b157	compatible	rdfxml	CC BY 4.0	O/vbo/releases/2026-11-17/vbo.owl
obo-vo	42343331	cddab14e7826c956f06cafab2625f21dcabf7050a7571d098978777e7012a8d0	rejected	HTTP=text/plain	CC BY 4.0	GH/vaccineontology/VO/master/vo.owl
obo-vt	5971592	4752e9bb4008d888dcd75b1ddbd266ab67fd11ed4a9e9e0a7b9d8e39c510f351	strict	rdfxml	CC BY 4.0	O/vt/releases/2026-11-06/vt.owl
obo-wbbt	9373027	c33ca24ec26abb05ff6b3abc6701752a183a20ba4c6e1d175c305dd0fc3f9e68	compatible	rdfxml	CC BY 4.0	O/wbbt/releases/2025-08-19/wbbt.owl
obo-wbls	1788096	ceacee311336cc447510559c0d55a446335807eb4f4b796c5d75066884641926	compatible	rdfxml	CC BY 4.0	O/wbls/releases/2026-04-16/wbls.owl
obo-wbphenotype	16482036	60b60e2cb2c55b2a046efbccf6a54b18e3f4ffc88db2aa58000d3ebc268e9f37	compatible	rdfxml	CC BY 4.0	O/wbphenotype/releases/2026-04-15/wbphenotype.owl
obo-xao	3907321	35db632535cc255ec039b61fd77ba0c5a171d35fe50ed0017ea01b74280816e3	strict	rdfxml	CC BY 3.0	O/xao/releases/2024-09-03/xao.owl
obo-xco	4515549	1a3ca003857a76bcb9b0c21264c7852b33c53884152f887fbb7f7a334a425bc1	compatible	rdfxml	CC0 1.0	O/xco/releases/2026-11-14/xco.owl
obo-xlmod	2392609	3a3024f23b30918d61576d67080d97321b2f5f7a5eeb655ef3aa2c10bc0593b0	strict	rdfxml	CC BY 3.0	O/xlmod/1.5.4/xlmod.owl
obo-zeco	90975	fd917d426350e250b307f6e6bcecdaecfcafcd61e2043a48c13964716d6f6ff1	strict	rdfxml	CC BY 3.0	O/zeco/releases/2022-02-14/zeco.owl
obo-zfa	7361558	9f3fcf68739d2eb31c8cde5848f508ee8f21e32174efd5353ac13454aa081385	strict	rdfxml	CC BY 3.0	O/zfa/releases/2026-07-16/zfa.owl
obo-zfs	7361558	240ae4ddde3b44a0d5492f5bbb45141c2eeadf056903a65331fc57b9082c94d0	strict	rdfxml	CC BY 3.0	O/zfs/releases/2026-07-16/zfs.owl
```

### Wider sources awaiting acquisition

The historical consumer’s acquisition ceiling was 67,108,864 bytes.
These 22 OBO responses exceeded it, and OGG returned HTTP 404.
Their input locators follow the same OBO stem rule.
Reported sizes are historical observations.
No historical body hash or parse verdict was established.
Include them in the catalogue immediately with an explicit availability state.
For each source, find a published version and confirm rights, download to a verified object on a suitable host, then assign the new digest and run the same stages.
Use a capacity-reviewed large-file selection, scope byte and scheduling budgets to the worker, and keep a network failure separate from a semantic rejection.
An entry becomes eligible only after actual bytes have been admitted.

| Source ID       | Historic acquisition outcome    | Reported bytes | Registry licence lead |
| --------------- | ------------------------------- | -------------: | --------------------- |
| `obo-chebi`     | Exceeded original fetch ceiling |      895864911 | CC BY 4.0             |
| `obo-cl`        | Exceeded original fetch ceiling |       74743295 | CC BY 4.0             |
| `obo-dron`      | Exceeded original fetch ceiling |      724133638 | CC BY 3.0             |
| `obo-fbbt`      | Exceeded original fetch ceiling |      120631875 | CC BY 4.0             |
| `obo-fypo`      | Exceeded original fetch ceiling |       69341403 | CC BY 4.0             |
| `obo-gaz`       | Exceeded original fetch ceiling |     1308877129 | CC0 1.0               |
| `obo-gno`       | Exceeded original fetch ceiling |      219496016 | CC BY 4.0             |
| `obo-go`        | Exceeded original fetch ceiling |      129926009 | CC BY 4.0             |
| `obo-hp`        | Exceeded original fetch ceiling |       76854086 | hpo                   |
| `obo-mondo`     | Exceeded original fetch ceiling |      255163272 | CC BY 4.0             |
| `obo-mp`        | Exceeded original fetch ceiling |      101403062 | CC BY 4.0             |
| `obo-ncbitaxon` | Exceeded original fetch ceiling |     2144127337 | CC0 1.0               |
| `obo-ncit`      | Exceeded original fetch ceiling |      811620064 | CC BY 4.0             |
| `obo-oba`       | Exceeded original fetch ceiling |      186767857 | CC0 1.0               |
| `obo-ogg`       | HTTP 404                        |        Unknown | CC BY 3.0             |
| `obo-pcl`       | Exceeded original fetch ceiling |      209667392 | CC BY 4.0             |
| `obo-pr`        | Exceeded original fetch ceiling |     1279414670 | CC BY 4.0             |
| `obo-tto`       | Exceeded original fetch ceiling |       67125248 | CC0 1.0               |
| `obo-uberon`    | Exceeded original fetch ceiling |       96362958 | CC BY 3.0             |
| `obo-upheno`    | Exceeded original fetch ceiling |      445001590 | CC0 1.0               |
| `obo-vto`       | Exceeded original fetch ceiling |      152582746 | CC0 1.0               |
| `obo-xpo`       | Exceeded original fetch ceiling |       97539811 | CC BY 3.0             |
| `obo-zp`        | Exceeded original fetch ceiling |      176700913 | CC BY 3.0             |

## Completion record for the implementer

As of 21 November, the [CGMES source candidate](#cgmes-pilot-results-and-next-implementation-step) is locally verified and awaits product integration.
CGMES and SAREF are the two published documents qualified on the patched source.
The shared CLI, installed artifact, release gate and large-file memory improvement are open.

Record the assertion mapping, shadow results and retired drivers alongside the case/candidate identities, exact stage outcomes and performance evidence.
Record the date and evidence of semantic gate activation on both release paths separately from performance migration completion.
One coordinator must eventually own all three measurements.
Documented diagnostic-only benchmark rows are valid at consolidation closeout when all 70 IDs, their existing obligations and the reason for every unqualified row are accounted for.
All 24 prospect collections, all 47 component documents, the 178 acquired wider inputs and the 23 unresolved acquisitions must remain individually accountable.
Mark implementation, local verification, hosted qualification and publication separately.
A row in this plan records an observed input or work to do.
For every release candidate, complete or authenticate the semantic evidence for every admitted input and applicable stage before promotion.
The measured Java-referenced memory milestone has its own evidence and disposition.

## Replay the tested CGMES patch

This appendix contains the tested three-file unified diff, a Node comparison runner and the Java adapter it compiles with the repository’s `OntologyStructuralComparison.java`.
The runner includes the four reduced fixtures and all 17 adjacent cases as generators.
The two published ontologies and the 64 released JARs are restored from public sources and verified by byte length and SHA-256.
Start from a clone containing the pinned commit and this document.
Both source variants are ordinary extracted archives.

### Recover the three files from this document

Run the following blocks in the same PowerShell 7.4+ session from the OwlAPI root.
The example uses a new directory under local application data.
Select Node 26.13.1, npm 12.2.2 and a Temurin 25.0.5+8 JDK first.
Set `JAVA_HOME` to that JDK.
On the original Windows host the SHA-256 values were `f961fb8db73c7c546821bc6d30fdaa8ce2458da460a5e75e2c39189cd107e6ba` for `java.exe` and `02160baa324a6a778e01962f14c748155c3172c37821df201bb201df110985c0` for `javac.exe`.

````powershell
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$repo = (git rev-parse --show-toplevel).Trim()
$plan = Join-Path $repo 'docs/plans/2026-11-20-real-world-ontology-corpus-and-java-parity.md'
$run = Join-Path $env:LOCALAPPDATA ('OwlAPI\replay-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $run
$utf8 = [Text.UTF8Encoding]::new($false)
$page = [IO.File]::ReadAllText($plan).Replace("`r`n", "`n")
$expected = @{
    'cgmes-tested.patch' = 'b5ddd1c1bfdf5f30eb8a5cf96f64367b4280e0f5b1a2eefb544431781e9b2754'
    'replay.mjs' = '1f2d0011606fa81014efa21b91b17225e40556560f9c74389a8abe3fdc92b00f'
    'FullComparison.java' = '813de475b07dc106a45081c6261e7377bb92bacde2062ee9f11c081ea674fad2'
}
$parts = [regex]::Matches($page, '(?ms)^<!-- replay-file: ([\w.-]+) -->\n+```[a-z]+\n(.*?)^```$')
if ($parts.Count -ne $expected.Count) { throw 'Incomplete replay sources' }
foreach ($part in $parts) {
    $name = $part.Groups[1].Value
    $body = $part.Groups[2].Value
    if (-not $expected.ContainsKey($name)) { throw "Unexpected replay file $name" }
    if ($name -eq 'cgmes-tested.patch') { $body = $body -creplace '(?m)^(?=\n)', ' ' }
    $file = Join-Path $run $name
    [IO.File]::WriteAllText($file, $body, $utf8)
    if ((Get-FileHash -LiteralPath $file).Hash -ne $expected[$name]) { throw "Digest mismatch for $name" }
    $expected.Remove($name)
}
if ($expected.Count) { throw 'Missing replay file' }
$patch = Join-Path $run 'cgmes-tested.patch'
````

All three files use UTF-8 and LF endings.
For the unified diff the extractor restores the single context-space on its two blank context lines.
Its reconstructed size is 10,627 bytes.
The earlier `cgmes-candidate.patch` preceded the inverse and restriction correction.
The final historical qualification archive containing the tested diff had SHA-256 `c11c82b0f85d3d8cdd9d18d6c14c76e88c1c9e1844535b2668b686bf46f6ed39`.

### Prepare two source copies and run the comparisons

```powershell
$base = 'd6d874a8af461f93efa502a6c158cc8c4cf88e7e'
$original = Join-Path $run 'original'
$candidate = Join-Path $run 'candidate'
$output = Join-Path $run 'results'
$maven = Join-Path $run 'maven'
$javaScript = Join-Path $run 'replay.mjs'
$env:TEMP = (New-Item -ItemType Directory -Path (Join-Path $run 'process-temp')).FullName
$env:TMP = $env:TEMP
$env:GIT_CEILING_DIRECTORIES = $run
$archive = Join-Path $run 'source.tar'
git -C $repo archive --format=tar --output=$archive $base
foreach ($root in @($original, $candidate)) {
    $null = New-Item -ItemType Directory -Path $root
    tar -xf $archive -C $root
}
git -C $original apply --check --include=internal/mapping/cgmesPropertyRole.test.js $patch
git -C $original apply --include=internal/mapping/cgmesPropertyRole.test.js $patch
git -C $candidate apply --check $patch
git -C $candidate apply $patch

$lock = Join-Path $original 'package-lock.json'
if ((Get-FileHash $lock).Hash -ne '98bc6d38d4201c16445d0e5fb66de1110e9a3702db57b2adbb9b55629cc50a0f') { throw 'Wrong npm lock' }
$env:npm_config_update_notifier = 'false'
$env:npm_config_audit = 'false'
$env:npm_config_fund = 'false'
npm --prefix $original ci
$null = New-Item -ItemType Junction -Path (Join-Path $candidate 'node_modules') -Target (Join-Path $original 'node_modules')
node $javaScript acquire $output $original $candidate $maven

$env:npm_config_offline = 'true'
node $javaScript compare $output $original $candidate $maven
```

The original pilot reused npm dependencies provisioned under the lock.
On 21 November the commands in this appendix were run from the document against two fresh source archives.
They installed the locked npm dependencies, restored both public ontologies and all 64 JARs into empty directories, then passed the offline comparisons and reproduced the red and green Jest results.

In `compare`, the runner rehashes the originals and JARs, uses the checked-in comparator (SHA-256 `d149852bddff79083f4cadccadbb910445f21c46219d40274ae0af0d5dac7269`) and admits the classpath in the order of the pinned lock (SHA-256 `53caf8d60ad073dc9485df59d67abd250c61a56a35cab7851c9ab1c88ab26374`).
Java compares its parse of the original to its reparse of JS Functional Syntax.
The public JS model is also queried directly for the missing domain and publisher value.

The output directory contains the Functional Syntax, full structural JSON by input/profile/side, generated RDF witnesses and ten fresh timing samples.
The original eight corpus structural JSON files have three distinct SHA-256 values.
A replay on the pilot toolchain reproduced all eight byte for byte.

| Structural JSON                                                       | SHA-256                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| CGMES original, both profiles, and CGMES candidate, normative profile | `249ae8b67de1233a1635642f90e19ac4cf4b28655771201390d0333eaeea2d6c` |
| CGMES candidate, named Java profile                                   | `9d6d785f9de57a9f0a9a8129622510ebe4692ff7f15725b6e233b70e11a1bb10` |
| SAREF, both profiles and both source versions                         | `384ae107ea12b25d8e77a22816e413ccafc5ccb9e020d36f27f85939745cae11` |

### Repeat the red and green repository tests

The first command must reach the seven tests and report the three known semantic failures on the unpatched parser.
The second must pass all six suites on the candidate.

```powershell
$regression = 'internal/mapping/cgmesPropertyRole.test.js'
$redReport = Join-Path $run 'jest-original.json'
$greenReport = Join-Path $run 'jest-candidate.json'
$PSNativeCommandUseErrorActionPreference = $false
try {
    npm --prefix $original test -- --runInBand --runTestsByPath $regression --cacheDirectory (Join-Path $run 'jest-red') --json --outputFile $redReport
    $redExit = $LASTEXITCODE
} finally {
    $PSNativeCommandUseErrorActionPreference = $true
}
$red = Get-Content -Raw $redReport | ConvertFrom-Json
if ($redExit -ne 1 -or $red.numFailedTests -ne 3 -or $red.numPassedTests -ne 4) { throw 'Unexpected baseline' }
$suites = @(
    $regression, 'internal/mapping/untypedProperty.test.js',
    'internal/mapping/undeclaredAnnotation.test.js', 'internal/mapping/propertyCategoryPunning.test.js',
    'internal/mapping/rdfToOwlTranslator.axioms.test.js', 'profiles/behaviorProfiles.test.js'
)
npm --prefix $candidate test -- --runInBand --runTestsByPath @suites --cacheDirectory (Join-Path $run 'jest-green') --json --outputFile $greenReport
$green = Get-Content -Raw $greenReport | ConvertFrom-Json
if ($green.numPassedTestSuites -ne 6 -or $green.numPassedTests -ne 845) { throw 'Unexpected candidate' }
```

### Embedded patch and replay sources

Expand any file to inspect or copy its contents.
The extractor above reads these same blocks from the Markdown.

<details>
<summary>cgmes-tested.patch — the three-file candidate tested against the original source</summary>

<!-- replay-file: cgmes-tested.patch -->

```diff
--- a/internal/behavior/ontologyBehaviorContext.js
+++ b/internal/behavior/ontologyBehaviorContext.js
@@ -46,6 +46,7 @@
       rdfReconstructionPolicy: Object.freeze({
         recoversNamedDatatypeRestrictions: true,
         recoversAnonymousUndeclaredAnnotations: false,
+        recoversRdfPropertyRolesWithoutDeclarations: false,
       }),
       individualEnumerationPolicy: Object.freeze({
         minimumIndividualCount: 1,
@@ -156,6 +157,7 @@
       rdfReconstructionPolicy: Object.freeze({
         recoversNamedDatatypeRestrictions: false,
         recoversAnonymousUndeclaredAnnotations: true,
+        recoversRdfPropertyRolesWithoutDeclarations: true,
       }),
       individualEnumerationPolicy: Object.freeze({
         minimumIndividualCount: 0,
--- a/internal/mapping/rdfToOwlTranslator.js
+++ b/internal/mapping/rdfToOwlTranslator.js
@@ -1846,13 +1846,16 @@
   // properties this way and no OWL property at all - so emitting nothing would
   // discard the entire vocabulary. Compatible mode recovers, taking the category
   // from the same evidence ADR 0005 uses for punning: a literal range means a
-  // data property, a class range an object property. A property with no range
-  // evidence is left alone, because guessing its category would invent a
-  // distinction the document does not make.
+  // data property, a class range an object property. The normative profile
+  // declares the recovered category and leaves properties without range
+  // evidence alone. The Java profile recovers roles without declarations,
+  // using the annotation role when there is no range evidence.
   #declareUntypedProperties() {
     if (this.#configuration.parsingMode !== "compatible") {
       return;
     }
+    const { recoversRdfPropertyRolesWithoutDeclarations } =
+      this.#rdfReconstructionPolicy;
     const index = this.#propertyEvidenceIndex();
     const alreadyTyped = (iri) =>
       this.#objectPropertyIris.has(iri) ||
@@ -1873,22 +1876,30 @@
       }
       const category = this.#categoryFromRanges(iri, index);
       if (!category) {
+        const evidence = index.get(iri);
+        if (
+          recoversRdfPropertyRolesWithoutDeclarations &&
+          !evidence?.objectOnlyCharacteristic &&
+          !evidence?.usedAsRestrictionProperty
+        ) {
+          this.#annotationPropertyIris.add(iri);
+        }
         continue;
       }

       if (category === "data") {
         this.#dataPropertyIris.add(iri);
-        this.#transaction.addAxiom(
-          this.#dataFactory.getOWLDeclarationAxiom(
-            this.#dataFactory.getOWLDataProperty(IRI.create(iri)),
-          ),
-        );
       } else {
         this.#objectPropertyIris.add(iri);
+      }
+      if (!recoversRdfPropertyRolesWithoutDeclarations) {
+        const propertyIri = IRI.create(iri);
+        const property =
+          category === "data"
+            ? this.#dataFactory.getOWLDataProperty(propertyIri)
+            : this.#dataFactory.getOWLObjectProperty(propertyIri);
         this.#transaction.addAxiom(
-          this.#dataFactory.getOWLDeclarationAxiom(
-            this.#dataFactory.getOWLObjectProperty(IRI.create(iri)),
-          ),
+          this.#dataFactory.getOWLDeclarationAxiom(property),
         );
       }

@@ -4797,6 +4808,15 @@
       const subject = quad.subject.value;
       const object = quad.object.value;
       switch (quad.predicate.value) {
+        case OWL_VOCABULARY.onProperty:
+          if (
+            this.#rdfReconstructionPolicy
+              .recoversRdfPropertyRolesWithoutDeclarations &&
+            quad.object.termType === "NamedNode"
+          ) {
+            entryFor(object).usedAsRestrictionProperty = true;
+          }
+          break;
         case RDFS_VOCABULARY.range:
           entryFor(subject).ranges.push(object);
           break;
--- /dev/null
+++ b/internal/mapping/cgmesPropertyRole.test.js
@@ -0,0 +1,192 @@
+import {
+  OWLManager,
+  OWLOntologyLoaderConfiguration,
+  StringDocumentSource,
+  IRI,
+} from "../../index.js";
+
+const NS = "urn:example:property-role#";
+const XSD = "http://www.w3.org/2001/XMLSchema#";
+const JAVA_PROFILE = "java-owlapi-5.5.1";
+const NORMATIVE_PROFILE = "normative-v1";
+
+function fixture({
+  reversed = false,
+  publisherValue = "R",
+  logicalUse = "",
+} = {}) {
+  const pTriples = [
+    '<rdf:type rdf:resource="http://www.w3.org/1999/02/22-rdf-syntax-ns#Property"/>',
+    `<rdfs:domain rdf:resource="${NS}C"/>`,
+    `<ex:dataType rdf:resource="${NS}${publisherValue}"/>`,
+  ];
+  if (reversed) pTriples.reverse();
+
+  const p = `<rdf:Description rdf:about="${NS}P">
+    ${pTriples.join("\n    ")}
+  </rdf:Description>`;
+
+  return `<?xml version="1.0"?>
+<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
+         xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
+         xmlns:owl="http://www.w3.org/2002/07/owl#"
+         xmlns:ex="${NS}">
+  <owl:Ontology rdf:about="urn:example:property-role:ontology"/>
+  ${reversed ? "" : p}
+  <owl:Class rdf:about="${NS}C"/>
+  <owl:Class rdf:about="${NS}R"/>
+  <owl:Class rdf:about="${NS}S"/>
+  <rdf:Property rdf:about="${NS}numeric">
+    <rdfs:range rdf:resource="${XSD}integer"/>
+  </rdf:Property>
+  <rdf:Property rdf:about="${NS}link">
+    <rdfs:range rdf:resource="${NS}R"/>
+  </rdf:Property>
+  <owl:ObjectProperty rdf:about="${NS}explicitLink">
+    <rdf:type rdf:resource="http://www.w3.org/1999/02/22-rdf-syntax-ns#Property"/>
+  </owl:ObjectProperty>
+  ${reversed ? p : ""}
+  ${logicalUse}
+</rdf:RDF>`;
+}
+
+async function loadAxioms(behaviorProfileId, options) {
+  const manager = OWLManager.createOWLOntologyManager({ behaviorProfileId });
+  const configuration = new OWLOntologyLoaderConfiguration({
+    behaviorProfileId,
+    parsingMode: "compatible",
+  });
+  const source = new StringDocumentSource(fixture(options), {
+    documentIRI: IRI.create("urn:example:property-role:document"),
+    contentType: "application/rdf+xml",
+  });
+  const { ontology } = await manager.loadOntologyGraphFromOntologyDocument(
+    source,
+    configuration,
+  );
+  return [...ontology.getAxioms()];
+}
+
+const iri = (value) => expect.objectContaining({ value });
+const named = (value) => expect.objectContaining({ iri: iri(value) });
+
+function declaration(localName, kind) {
+  return expect.objectContaining({
+    kind: "OWLDeclarationAxiom",
+    entity: expect.objectContaining({
+      iri: iri(`${NS}${localName}`),
+      ...(kind === undefined ? {} : { kind }),
+    }),
+  });
+}
+
+function propertyRange(kind, localName, rangeIRI) {
+  return expect.objectContaining({
+    kind,
+    property: named(`${NS}${localName}`),
+    range: named(rangeIRI),
+  });
+}
+
+const pDomain = expect.objectContaining({
+  kind: "OWLAnnotationPropertyDomainAxiom",
+  property: named(`${NS}P`),
+  domain: iri(`${NS}C`),
+});
+
+function publisherAssertion(localName) {
+  return expect.objectContaining({
+    kind: "OWLAnnotationAssertionAxiom",
+    property: named(`${NS}dataType`),
+    subject: iri(`${NS}P`),
+    value: iri(`${NS}${localName}`),
+  });
+}
+
+describe.each([JAVA_PROFILE, NORMATIVE_PROFILE])(
+  "CGMES property roles: %s",
+  (profile) => {
+    test.each([
+      ["P first, type before domain and metadata", false],
+      ["P last, metadata and domain before type", true],
+    ])("preserves exact property roles with %s", async (_order, reversed) => {
+      const axioms = await loadAxioms(profile, { reversed });
+
+      for (const className of ["C", "R", "S"]) {
+        expect(axioms).toContainEqual(declaration(className, "OWLClass"));
+      }
+      expect(axioms).toContainEqual(
+        declaration("explicitLink", "OWLObjectProperty"),
+      );
+      expect(axioms).toContainEqual(
+        propertyRange("OWLDataPropertyRangeAxiom", "numeric", `${XSD}integer`),
+      );
+      expect(axioms).toContainEqual(
+        propertyRange("OWLObjectPropertyRangeAxiom", "link", `${NS}R`),
+      );
+
+      if (profile === JAVA_PROFILE) {
+        expect(axioms).toContainEqual(pDomain);
+        expect(axioms).toContainEqual(publisherAssertion("R"));
+        for (const property of ["P", "numeric", "link"]) {
+          expect(axioms).not.toContainEqual(declaration(property));
+        }
+      } else {
+        expect(axioms).not.toContainEqual(pDomain);
+        expect(axioms).not.toContainEqual(publisherAssertion("R"));
+        expect(axioms).toContainEqual(
+          declaration("numeric", "OWLDataProperty"),
+        );
+        expect(axioms).toContainEqual(declaration("link", "OWLObjectProperty"));
+      }
+    });
+  },
+);
+
+test(`${JAVA_PROFILE}: changing only the publisher IRI changes the assertion identity`, async () => {
+  const original = await loadAxioms(JAVA_PROFILE);
+  const mutated = await loadAxioms(JAVA_PROFILE, { publisherValue: "S" });
+
+  expect(original).toContainEqual(publisherAssertion("R"));
+  expect(original).not.toContainEqual(publisherAssertion("S"));
+  expect(mutated).toContainEqual(publisherAssertion("S"));
+  expect(mutated).not.toContainEqual(publisherAssertion("R"));
+  expect(mutated).toContainEqual(pDomain);
+  expect(mutated).toHaveLength(original.length);
+});
+
+test("a generic property can still participate in an explicit inverse relation", async () => {
+  const logicalUse =
+    '<owl:ObjectProperty rdf:about="' +
+    NS +
+    'inverse"><owl:inverseOf rdf:resource="' +
+    NS +
+    'P"/></owl:ObjectProperty>';
+  const axioms = await loadAxioms(JAVA_PROFILE, { logicalUse });
+  const inverse = axioms.find(
+    (axiom) => axiom.kind === "OWLInverseObjectPropertiesAxiom",
+  );
+  expect(
+    inverse.properties.map((property) => property.iri.value).sort(),
+  ).toEqual([NS + "P", NS + "inverse"].sort());
+});
+
+test("an existential restriction still identifies the generic property as its object property", async () => {
+  const logicalUse =
+    '<owl:Class rdf:about="' +
+    NS +
+    'Restricted"><rdfs:subClassOf><owl:Restriction><owl:onProperty rdf:resource="' +
+    NS +
+    'P"/><owl:someValuesFrom rdf:resource="' +
+    NS +
+    'C"/></owl:Restriction></rdfs:subClassOf></owl:Class>';
+  const axioms = await loadAxioms(JAVA_PROFILE, { logicalUse });
+  const subclass = axioms.find(
+    (axiom) =>
+      axiom.kind === "OWLSubClassOfAxiom" &&
+      axiom.subClass?.iri?.value === NS + "Restricted",
+  );
+  expect(subclass.superClass.kind).toBe("OWLObjectSomeValuesFrom");
+  expect(subclass.superClass.property.iri.value).toBe(NS + "P");
+  expect(subclass.superClass.filler.iri.value).toBe(NS + "C");
+});
```

</details>

<details>
<summary>replay.mjs — public fixture acquisition, offline comparisons and generated controls</summary>

<!-- replay-file: replay.mjs -->

```javascript
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const script = fileURLToPath(import.meta.url);
const javaProfile = "java-owlapi-5.5.1";
const profiles = [javaProfile, "normative-v1"];
const cgmes = {
  name: "cgmes.rdf", url: "https://raw.githubusercontent.com/entsoe/CGMES-AP/e96dd4e323b1e2236e141dd03bf9adea81672e00/CGMES/RDFS/61970-600-2_Equipment-AP-Voc-RDFS2020.rdf",
  size: 584337, digest: "e95c02b1eca667dabf7c8bf0e0a0e47f0b4813c8a3899eb55e50608fdb4ba27d",
};
const saref = {
  name: "saref.ttl", url: "https://saref.etsi.org/core/v4.1.1/saref.ttl",
  size: 100491, digest: "28189acd8cfb49bf6b7e5709275a1162d943576f643b2cffdccfe20cc00ad701",
};
const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", timeout: 120_000 });

if (process.argv[2] === "load") {
  const [, , , root, input, iri, profile, format, output, probe] = process.argv;
  const { IRI, OWLDocumentFormats, OWLManager, OWLOntologyLoaderConfiguration,
    StringDocumentSource, StringDocumentTarget } = await import(pathToFileURL(join(root, "index.js")));
  let networkAttempts = 0;
  const offline = () => { networkAttempts++; throw Error("Unexpected network or import"); };
  globalThis.fetch = offline;
  const manager = OWLManager.createOWLOntologyManager({
    behaviorProfileId: profile, documentLoader: { load: offline },
  });
  const contentType = format === "turtle" ? "text/turtle" : "application/rdf+xml";
  const source = new StringDocumentSource(readFileSync(input, "utf8"), {
    documentIRI: IRI.create(iri), fileName: format === "turtle" ? "case.ttl" : "case.rdf", contentType,
  });
  const config = new OWLOntologyLoaderConfiguration({
    behaviorProfileId: profile, parsingMode: "compatible",
  });
  const cpu = process.cpuUsage(), start = performance.now();
  const { ontology } = await manager.loadOntologyGraphFromOntologyDocument(source, config);
  const wallMs = performance.now() - start, delta = process.cpuUsage(cpu);
  const peakRssKiB = process.resourceUsage().maxRSS;
  const axioms = [...ontology.getAxioms()];
  const value = (term) => term?.iri?.value ?? term?.value;
  const domains = axioms.filter((axiom) => axiom.kind === "OWLAnnotationPropertyDomainAxiom");
  const cim = "http://iec.ch/TC57/CIM100#";
  const cims = "http://iec.ch/TC57/1999/rdf-schema-extensions-19990926#";
  const publisherAssertions = axioms.filter((axiom) => axiom.kind === "OWLAnnotationAssertionAxiom" &&
    value(axiom.property) === cims + "dataType");
  const target = new StringDocumentTarget();
  await manager.saveOntology(ontology, OWLDocumentFormats.FUNCTIONAL, target);
  const functional = target.toString();
  if (output !== "-") writeFileSync(output, functional);
  assert.equal(networkAttempts, 0);
  const controlNs = "urn:example:owlapi-pilot#";
  const controlP = controlNs + "P";
  const declaration = (name) => axioms.some((axiom) =>
    axiom.kind === "OWLDeclarationAxiom" && value(axiom.entity) === controlNs + name);
  const publisherValue = (name) => axioms.some((axiom) => axiom.kind === "OWLAnnotationAssertionAxiom" &&
    value(axiom.property) === controlNs + "dataType" && value(axiom.subject) === controlP &&
    value(axiom.value) === controlNs + name);
  console.log(JSON.stringify({
    wallMs, userCpuMs: delta.user / 1000, systemCpuMs: delta.system / 1000, peakRssKiB,
    digest: sha(functional), axioms: axioms.length, ontologyAnnotations: [...ontology.getAnnotations()].length,
    imports: [...ontology.getImportsDeclarations()].length, networkAttempts,
    ...(probe === "cgmes" ? {
      domain: domains.some((axiom) => value(axiom.property) === cim + "ACLineSegment.r" &&
        value(axiom.domain) === cim + "ACLineSegment"),
      publisherValue: publisherAssertions.some((axiom) => value(axiom.subject) === cim + "ACLineSegment.r" &&
        value(axiom.value) === cim + "Resistance"),
      annotationDomains: domains.length, publisherAssertions: publisherAssertions.length,
    } : probe === "control" ? {
      domain: domains.some((axiom) => value(axiom.property) === controlP && value(axiom.domain) === controlNs + "C"),
      valueR: publisherValue("R"), valueS: publisherValue("S"),
      explicitObjectDeclaration: declaration("explicitObject"),
      numericDeclaration: declaration("numeric"), objectDeclaration: declaration("object"),
    } : {}),
  }));
  process.exit(0);
}

const [mode, outArg, baselineArg, candidateArg, mavenArg] = process.argv.slice(2);
assert.ok(["acquire", "compare"].includes(mode));
const [out, baseline, candidate, maven] = [outArg, baselineArg, candidateArg, mavenArg].map((arg) => resolve(arg));
const lockPath = "docs/compatibility/profiles/java-owlapi-5.5.1/java-dependencies.lock.json";
const lockBytes = readFileSync(join(baseline, lockPath));
assert.equal(sha(lockBytes), "53caf8d60ad073dc9485df59d67abd250c61a56a35cab7851c9ab1c88ab26374");
const lock = JSON.parse(lockBytes);
const artifacts = new Map(lock.artifacts.map((item) => [item.repositoryPath, item]));
assert.equal(lock.orderedExecutionClasspath.length, 64);
const central = "https://repo.maven.apache.org/maven2/";
async function verified(path, url, size, digest) {
  if (!existsSync(path)) {
    assert.equal(mode, "acquire", `Missing offline input: ${path}`);
    const response = await fetch(url, { redirect: "error" });
    assert.ok(response.ok, `Could not get ${url}: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, size, url);
    assert.equal(sha(bytes), digest, url);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes, { flag: "wx" });
  }
  const bytes = readFileSync(path);
  assert.equal(bytes.length, size, path);
  assert.equal(sha(bytes), digest, path);
  return path;
}
const jars = await Promise.all(lock.orderedExecutionClasspath.map((entry) => {
  const item = artifacts.get(entry);
  return verified(join(maven, entry), central + entry, item.byteLength, item.sha256);
}));
for (const item of [cgmes, saref]) {
  await verified(join(out, item.name), item.url, item.size, item.digest);
}
if (mode === "acquire") process.exit(0);

assert.equal(process.version, "v26.13.1");
const executable = (name) => join(process.env.JAVA_HOME, "bin", name + (process.platform === "win32" ? ".exe" : ""));
const classes = join(out, "classes");
const javaTemp = join(out, "java-temp");
mkdirSync(classes, { recursive: true });
mkdirSync(javaTemp, { recursive: true });
run(executable("javac"), [`-J-Djava.io.tmpdir=${javaTemp}`, "-cp", jars.join(delimiter), "-d", classes,
  join(baseline, "util/owlapi-reference/OntologyStructuralComparison.java"), join(dirname(script), "FullComparison.java")]);
const sides = { baseline, candidate };
function load(side, path, iri, profile, format, output, probe) {
  const args = [script, "load", sides[side], path, iri, profile, format, output];
  if (probe) args.push(probe);
  return JSON.parse(run(process.execPath, args));
}
function pairs(name, iri, profilesToRun, format, probe) {
  const input = join(out, name);
  const results = {};
  for (const profile of profilesToRun) {
    results[profile] = {};
    for (const side of Object.keys(sides)) {
      const stem = `${side}-${name}-${profile}`;
      const ofn = join(out, stem + ".ofn");
      const js = load(side, input, iri, profile, format, ofn, probe);
      const oracle = run(executable("java"), [`-Djava.io.tmpdir=${javaTemp}`, "-cp", [classes, ...jars].join(delimiter),
        "FullComparison", input, iri, format, ofn]);
      const structural = JSON.parse(oracle);
      assert.equal(structural.networkAttempts, 0);
      writeFileSync(join(out, stem + ".json"), oracle);
      results[profile][side] = { js, structural };
    }
  }
  return results;
}
const a = pairs(cgmes.name, cgmes.url, profiles, "rdfxml", "cgmes");
const b = pairs(saref.name, saref.url, profiles, "turtle");
const { baseline: red, candidate: green } = a[javaProfile];
assert.equal(red.structural.matches, false);
assert.equal(red.structural.differences.axioms.javaOnly.length, 418);
assert.equal(red.structural.differences.axioms.jsOnly.length, 220);
assert.equal(red.js.axioms, 5410);
assert.equal(green.structural.matches, true);
assert.equal(green.js.axioms, 5608);
assert.equal(green.js.ontologyAnnotations, 20);
assert.ok(green.js.domain && green.js.publisherValue);
assert.equal(green.js.annotationDomains, 209);
assert.equal(green.js.publisherAssertions, 209);
assert.deepEqual(a["normative-v1"].baseline.structural.differences, a["normative-v1"].candidate.structural.differences);
for (const profile of profiles) for (const side of Object.keys(sides)) {
  assert.ok(b[profile][side].structural.matches);
  assert.equal(b[profile][side].js.axioms, 669);
  assert.equal(b[profile][side].js.ontologyAnnotations, 23);
}
const timing = { baseline: [], candidate: [] };
for (let trial = 0; trial < 5; trial++) {
  for (const side of trial % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"]) {
    const sample = load(side, join(out, saref.name), saref.url, javaProfile, "turtle", "-");
    assert.equal(sample.axioms, 669);
    assert.equal(sample.ontologyAnnotations, 23);
    assert.equal(sample.digest, "d409cadff8873cc0c83eb7299fab338a3096cf0e23ed687fef1a69da1fba3d3f");
    timing[side].push(sample);
  }
}
writeFileSync(join(out, "timing.json"), JSON.stringify(timing, null, 2));
console.log("Verified eight structural comparisons and ten matched SAREF loads.");

const rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const rdfs = "http://www.w3.org/2000/01/rdf-schema#";
const owl = "http://www.w3.org/2002/07/owl#";
const xml = (prefix, ns, body) => `<rdf:RDF xmlns:rdf="${rdf}" xmlns:rdfs="${rdfs}" xmlns:owl="${owl}" xmlns:${prefix}="${ns}">${body}</rdf:RDF>`;
const element = (kind, iri, body) => body === undefined
  ? `<${kind} rdf:about="${iri}"/>`
  : `<${kind} rdf:about="${iri}">${body}</${kind}>`;
const resource = (kind, iri) => `<${kind} rdf:resource="${iri}"/>`;
const reduced = "urn:example:owlapi-pilot#";
const witnesses = {};
for (const variant of ["generic", "explicit", "mutated", "reversed"]) {
  const iri = reduced + variant;
  const domain = resource("rdfs:domain", reduced + "C");
  const rdfType = resource("rdf:type", rdf + "Property");
  const objectRange = resource("rdfs:range", reduced + "R");
  const statements = [rdfType, domain, resource("ex:dataType", reduced + (variant === "mutated" ? "S" : "R"))];
  if (variant === "explicit") statements.push(resource("rdf:type", owl + "AnnotationProperty"));
  if (variant === "reversed") statements.reverse();
  const body = element("owl:Ontology", iri) +
    ["C", "R", "S"].map((id) => element("owl:Class", reduced + id, "")).join("") +
    element("rdf:Description", reduced + "P", statements.join("")) +
    element("rdf:Property", reduced + "numeric", domain + resource("rdfs:range", "http://www.w3.org/2001/XMLSchema#integer")) +
    element("rdf:Property", reduced + "object", domain + objectRange) +
    element("owl:ObjectProperty", reduced + "explicitObject", rdfType + objectRange);
  const name = "reduced-" + variant + ".rdf";
  writeFileSync(join(out, name), xml("ex", reduced, body));
  const rows = pairs(name, iri, profiles, "rdfxml", "control");
  const { js, structural } = rows[javaProfile].candidate;
  assert.ok(structural.matches);
  assert.ok(js.domain && js.explicitObjectDeclaration);
  assert.ok(!js.numericDeclaration && !js.objectDeclaration);
  assert.equal(js.valueR, variant !== "mutated");
  assert.equal(js.valueS, variant === "mutated");
  assert.equal(rows["normative-v1"].baseline.js.digest, rows["normative-v1"].candidate.js.digest);
  witnesses[variant] = js.axioms;
}
assert.equal(witnesses.generic, witnesses.mutated);

const adjacent = "urn:pilot:adjacent#";
const [iri, p, q, c, a1, b1, x] = ["base", "P", "Q", "C", "a", "b", "X"].map((local) => adjacent + local);
const variants = {
  bare: "",
  domain: element("rdf:Description", p, resource("rdfs:domain", c)),
  literal: element("owl:NamedIndividual", a1, "<p:P>text</p:P>"),
  individual: element("owl:NamedIndividual", a1, resource("p:P", b1)),
  inverse: element("owl:ObjectProperty", q, resource("owl:inverseOf", p)),
  subproperty: element("rdf:Description", p, resource("rdfs:subPropertyOf", q)) + element("owl:ObjectProperty", q),
  restriction: element("owl:Class", x, "<rdfs:subClassOf><owl:Restriction>" +
    resource("owl:onProperty", p) + resource("owl:someValuesFrom", c) + "</owl:Restriction></rdfs:subClassOf>"),
};
for (const use of ["inverse", "restriction", "literal", "individual", "subproperty"]) {
  variants["domain-" + use] = variants.domain + variants[use];
  variants["metadata-" + use] = variants.domain + element("rdf:Description", p, resource("p:dataType", c)) + variants[use];
}
const matches = { baseline: 0, candidate: 0 };
for (const [variant, data] of Object.entries(variants)) {
  const name = "adjacent-" + variant + ".rdf";
  writeFileSync(join(out, name), xml("p", adjacent,
    element("owl:Ontology", iri) + element("owl:Class", c) + element("rdf:Property", p) + data));
  const { baseline: old, candidate: patched } = pairs(name, iri, [javaProfile], "rdfxml")[javaProfile];
  const stillDiffers = /^(domain|metadata)-(restriction|subproperty)$/.test(variant);
  assert.equal(patched.structural.matches, !stillDiffers, variant);
  if (stillDiffers) assert.deepEqual(patched.structural.differences, old.structural.differences, variant);
  matches.baseline += Number(old.structural.matches);
  matches.candidate += Number(patched.structural.matches);
}
assert.deepEqual(matches, { baseline: 9, candidate: 13 });
console.log("Verified four reduced controls and 17 adjacent cases.");
```

</details>

<details>
<summary>FullComparison.java — released Java loader and structural-comparison adapter</summary>

<!-- replay-file: FullComparison.java -->

```java
import java.io.*;
import java.net.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.semanticweb.owlapi.apibinding.OWLManager;
import org.semanticweb.owlapi.formats.*;
import org.semanticweb.owlapi.io.StringDocumentSource;
import org.semanticweb.owlapi.model.*;
import org.semanticweb.owlapi.util.VersionInfo;
public class FullComparison {
    public static void main(String[] args) throws Exception {
        AtomicInteger attempts=new AtomicInteger();
        URL.setURLStreamHandlerFactory(p -> ("http".equals(p)||"https".equals(p))?new URLStreamHandler(){protected URLConnection openConnection(URL u) throws IOException{attempts.incrementAndGet();throw new IOException("Network forbidden");}}:null);
        if(!VersionInfo.getVersionInfo().getVersion().equals("5.5.1.2024-09-07T21:41:32Z"))throw new IllegalStateException("Unqualified runtime");
        OWLOntologyLoaderConfiguration cfg=new OWLOntologyLoaderConfiguration().setStrict(false).setLoadAnnotationAxioms(true).setMissingImportHandlingStrategy(MissingImportHandlingStrategy.THROW_EXCEPTION);
        OWLOntology java=OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(new StringDocumentSource(Files.readString(Path.of(args[0])),IRI.create(args[1]),args[2].equals("turtle")?new TurtleDocumentFormat():new RDFXMLDocumentFormat(),null),cfg);
        OWLOntology js=OWLManager.createOWLOntologyManager().loadOntologyFromOntologyDocument(new StringDocumentSource(Files.readString(Path.of(args[3])),IRI.create("urn:pilot:functional"),new FunctionalSyntaxDocumentFormat(),null),cfg);
        OWLOntologyManager manager=OWLManager.createOWLOntologyManager();
        OntologyStructuralComparison.ComparisonOutcome outcome=OntologyStructuralComparison.compareOntologies(java,js,manager);
        Map<String,Object> ret=new LinkedHashMap<>();
        ret.put("matches",outcome.matches);ret.put("category",outcome.mismatchCategory);ret.put("networkAttempts",attempts.get());ret.put("java",OntologyStructuralComparison.ontologyCounts(java));ret.put("js",OntologyStructuralComparison.ontologyCounts(js));ret.put("differences",OntologyStructuralComparison.describeDifferences(java,js,manager));
        System.out.println(new ObjectMapper().writeValueAsString(ret));
    }
}
```

</details>
