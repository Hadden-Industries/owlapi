# OWLAPI API behavior: supplementary gap closure

Repository edition of the preserved Drive report.
Local links point to the tracked portable evidence; [storage and normalization provenance](README.md) records the original hashes and the limits of this derived snapshot.

Research date: 2026-10-13.
Status: research evidence for a draft plan, not implementation acceptance.

The original [behavior report](2026-10-13-owlapi-api-behavior-compatibility-research.md) and [evidence](2026-10-13-owlapi-api-behavior-evidence.json) remain unchanged.
This supplement closes their selected processor, writer, manager lifecycle, runtime and oracle-provenance gaps through source inspection and bounded probes.
Complete programs, commands, outputs, failed attempts, 29 source records, source hashes, the ordered dependency classpath and overlay class hashes are embedded in [supplementary evidence](2026-10-13-owlapi-api-behavior-gap-closure-evidence.json).

The supplementary evidence SHA-256 is `ce1efafce28b4fd4893a09efeb12b90987f02e2811b728c3925d220108c99430`.
Its seven final probe programs completed with exit code 0; Firefox itself did not launch.
No remote documents were fetched by the probes.
Dependency source retrieval is a separate research action.

## 1. Baseline and bounded source authority

| Item                                   | Observed identity                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| JavaScript                             | `20426357165a22248985ec43d7ac1266d49d6bec`; tree `18a3895c9b65f585de4f713e783b35c6ba3bff6f`; main; package 0.1.0-rc.2 |
| Java                                   | `b61ebe2da83daceebb3e7ba7afbd2582c9240c33`; tree `b8dad5241dae6ff3bd3b755b9a1c605623eeb2c2`; version5                 |
| Local runtime                          | Node 24.21.0 Windows x64; Temurin 25.0.4.1+1, Windows                                                                 |
| Canonical native qualification runtime | Existing CI/release authority: Temurin `25.0.4+101.0.LTS`, checksum-pinned Maven 3.10.0, Linux hosted execution       |
| Existing unrelated file                | `docs/plans/2026-10-12-dependency-cruiser-architecture-hardening-plan.md`; retained unchanged                         |
| Operator evidence                      | Preserved external operator records; see [storage provenance](README.md)                                              |

Seven unchanged pinned Java source files were compiled with `javac -proc:none` against the retained 63-JAR classpath into a new external overlay: manager implementation, ontology factory, abstract storer, loader configuration, writer configuration, configuration options and Rio parser.
Compilation succeeded.
The overlay precedes all retained JARs; probe `CodeSource` observations verify the selected manager and abstract-storer implementations.
All 63 retained JAR digests were rechecked and matched the original evidence.

This establishes source-bound observations for the selected implementations.
It does **not** establish that all other OWLAPI classes, parser/renderers or dependencies were built from the pinned tree. Those remain retained artifacts. The current [native build implementation](https://github.com/Hadden-Industries/owlapi/blob/20426357165a22248985ec43d7ac1266d49d6bec/util/owlapi-reference/reference-native-build.mjs) remains the future qualification authority; this overlay is not a substitute for a fresh exact-candidate native build.
A clean source checkout, Maven version label or classpath digest alone is not source-build provenance.
Current source-build reuse remains inactive.

## 2. GAP-01: selected JSON-LD processor and configuration route

The actual Rio service provider is `org.eclipse.rdf4j.rio.jsonld.JSONLDParser` from RDF4J 5.0.2.
Its active processor is `no.hasmac.jsonld` 0.9.0.
The co-present `jsonld-java` 0.13.6 dependency is not the selected processor for this route.

The primary [Rio parser source](https://raw.githubusercontent.com/eclipse-rdf4j/rdf4j/5.0.2/core/rio/jsonld/src/main/java/org/eclipse/rdf4j/rio/jsonld/JSONLDParser.java), [caching loader](https://raw.githubusercontent.com/eclipse-rdf4j/rdf4j/5.0.2/core/rio/jsonld/src/main/java/org/eclipse/rdf4j/rio/jsonld/CachingDocumentLoader.java), [settings](https://raw.githubusercontent.com/eclipse-rdf4j/rdf4j/5.0.2/core/rio/api/src/main/java/org/eclipse/rdf4j/rio/helpers/JSONLDSettings.java), and exact [hasmac source artifact](https://repo.maven.apache.org/maven2/no/hasmac/hasmac-json-ld/0.9.0/hasmac-json-ld-0.9.0-sources.jar) are recorded with byte digests in the evidence.

`GAP-P03` installs supported process-local `SchemeRouter` handlers that return tiny in-memory context documents, deny file access and stop above 300 calls.
It does not run an HTTP server.
JVM properties are isolated to the probe process and cleared.
The observations are:

| Scenario                                                                        | Outcome                                                                                        |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Default settings                                                                | secure mode true; document-loader cache true; whitelist contains 25 entries                    |
| Arbitrary unlisted remote context                                               | Rejected before loader call; outer `UnparsableOntologyException` with nested whitelist failure |
| Allowlisted `https://schema.org/`                                               | One stub invocation; ontology with one axiom                                                   |
| Format parameter `JSONLDSettings.SECURE_MODE=false`                             | Ignored by this OWLAPI route; unlisted URL still fails before any loader call                  |
| Default secure/cache true; 13 distinct default-whitelist URLs in a chain        | Success, 13 stub invocations; fresh JVM                                                        |
| Default secure/cache true; all 25 distinct default-whitelist URLs in a chain    | Success, 25 stub invocations; fresh JVM                                                        |
| JVM property `org.eclipse.rdf4j.rio.jsonld_secure_mode=false`; 13-context chain | Success, 13 loader calls                                                                       |
| Same property; 257-context chain                                                | Success, 257 loader calls                                                                      |
| Same property; 258-context chain                                                | Failure after 257 loader calls                                                                 |

The separate GAP-P06 default-chain program establishes a direct public-default regression for the JS cap of 10: no system override is needed to admit 13 or 25 different allowlisted URLs.
The 257/258 cases instead qualify the backend with effective secure mode disabled through the real JVM facility; they do not invent a public OWLAPI setter.

The ignored setting is a pinned observable quirk, not a recommendation.
`RioParserImpl` copies only the parser's reported supported settings.
This provider reports the JSON-LD expand-context and exception-on-warning settings, but does not report secure-mode, whitelist, loader or loader-cache settings.
Its own parser configuration can still obtain those through RDF4J system properties.

The hasmac `ActiveContextBuilder` has private `MAX_REMOTE_CONTEXTS=256` and tests `size()>256`.
The observed 257/258 boundary agrees with that ordering.
The default HTTP loader has a separate private redirect bound of 10, established by source inspection, not a live redirect-chain experiment.

The current JS dependency `jsonld@9.0.0` has a private `MAX_CONTEXT_URLS=10` and no supported public option to adjust it; its `contextResolver` escape is marked internal use.
Existing document-loader injection cannot remove that earlier limit.
A plan must therefore select a maintained dependency enhancement or replacement and prove it; simply writing “configure 256” is not an executable design.
Preflattening contexts, resetting the cycle counter, monkey-patching an internal resolver or editing `node_modules` would create a hidden semantic fork and are rejected.

GAP-P07 closes cache ownership and retry behavior with a 20-call bound: a success is reused by a fresh parser/manager with zero loader calls and the original context content; a loader failure is not cached and the next call retries; format DOCUMENT_LOADER_CACHE=false is ignored; the JVM cache=false route bypasses without clearing an older cached value; re-enabling cache returns that older value; and secure whitelist rejection occurs before cache lookup even when the URI was warmed with secure mode off. All are observed through actual ontology loads. The source fixes one static URI-keyed cache, maximumSize(1000), expireAfterWrite(1 hour), concurrencyLevel(8), and fresh default DocumentLoaderOptions in the caching branch. TTL/capacity are source-traced, not wall-clock/exhaustion tested. The exact [Guava 33.0.0 LoadingCache contract](https://raw.githubusercontent.com/google/guava/v33.0.0/guava/src/com/google/common/cache/LoadingCache.java), retained with SHA-256, specifies coalescing concurrent same-key loads; that is source authority, not a concurrent-probe claim.
Ordinary secure-mode defaults allow only 25 distinct whitelist strings, so the 1000-entry capacity is not reached through that selected default capability.

## 3. GAP-02: storer partial failure and target ownership

`GAP-P02` invokes the real Functional, RDF/XML, OWL/XML and Turtle storers through the source-bound abstract storer with small in-memory writers.
Each writer can fail after 20 characters or on flush/close.
Results:

| Supplied Writer stimulus                                  | All four selected storers                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Normal save                                               | Success; supplied writer close invoked twice                                                    |
| `IOException` while writing after 20 characters           | Save reports success; partial 20 characters remain                                              |
| `IllegalStateException` while writing after 20 characters | Runtime exception escapes; partial 20 characters remain; writer still closed twice              |
| `IOException` on flush                                    | Save reports success; full text retained                                                        |
| `IOException` on close                                    | `OWLOntologyStorageException` with `IOException` cause; full text retained; close invoked twice |

These results follow the target branch's nested raw Writer/`PrintWriter` ownership and Java `PrintWriter` exception suppression. Normal flush counts differ by format: Functional 3, RDF/XML 2, OWL/XML 3 and Turtle 4 for this specific fixture.
These are fixture observations, not universal output-chunk promises.

The supplied OutputStream branch behaved differently: the 20-byte `IOException` was suppressed, output remained partial, two flushes occurred and the supplied stream was not closed.
It must not inherit the writer branch's ownership rule.

Saving the same Functional document twice into `StringDocumentTarget` grew output from 339 to 678 characters.
It appends.
Replacing the old contents is incompatible on this existing matched route.

Custom Writer/OutputStream targets are currently omitted JS capabilities.
Their characterization prevents a false atomicity or language-impossibility justification; it does not silently add the entire target family to this plan.
The selected implementation track repairs all existing StringDocumentTarget routes, including accumulation, identity, effects before a storer error and reuse after error.
Full arbitrary-writer parity would need explicit selection of that missing public capability.

## 4. GAP-03: mutation outcomes, listener timing and rollback quirks

`GAP-P01` uses source-bound `OWLOntologyManagerImpl`.
Each example uses a small fresh manager unless lifecycle reuse is the point.

| Stimulus                                                                     | Java observation                                                                      |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Empty batch                                                                  | `NO_OPERATION`                                                                        |
| Add absent axiom, then remove it                                             | `SUCCESSFULLY` with final axiom count 0                                               |
| Add, remove, then rejected annotation add on an annotation-filtered ontology | `UNSUCCESSFULLY`, enacted-change list empty, but the first axiom is present afterward |
| Add axiom, then colliding ontology-ID change throws                          | `OWLOntologyRenameException`; first axiom remains                                     |
| Impending listener veto                                                      | `UNSUCCESSFULLY`, no axiom, vetoed event                                              |
| Post-change listener reenters with a nested add                              | Both adds visible; two callback observations                                          |

The unsuccessful inverse sequence is explained by `rollBack` applying inverse changes in forward order.
It is not full atomic rollback.
The target is this pinned observable result, even though reverse order would be more conventional.

The successful add/duplicate-add/remove batch observes impending(3), begin(3), a progress notification for each attempted change (including duplicate), end, and post-change notification containing only two enacted changes.
A thrown collision yields impending, begin and first-change progress, with no end or post-change callback.
A veto yields impending/vetoed only.
These traces constrain any future listener implementation and prove why an atomic transaction wrapper cannot replace the matched mutation state machine.

Change/progress listener registration APIs remain outside the currently selected JS surface.
This supplement does not claim an exhaustive listener conformance matrix or authorize implementing that entire family.

## 5. GAP-04: manager configuration and failed-load retention

The annotation filter is stored by ontology ID.
These are mandatory same-manager observations, not merely load-time filtering:

| Sequence                                                       | Java observation                                       |
| -------------------------------------------------------------- | ------------------------------------------------------ |
| Load with annotation loading false; later add annotation axiom | `UNSUCCESSFULLY`, no added annotation                  |
| Rename that ontology; add annotation under new ID              | Rename and add succeed; one annotation axiom           |
| Create another ontology using old ID                           | Old annotation filter applies; annotation add rejected |
| Remove and recreate ontology using old ID                      | Old filter still applies                               |

The implementation neither transfers this configuration on rename nor clears it on removal.
The plan must preserve those consequences on the selected pinned target, not silently “fix Java.”

For loading, the probe precreates an unrelated ontology and maps imports A/B to local files.
A is valid; B is malformed.
A root importing A then B fails with `UnloadableImportException`.
The root is removed; the preexisting ontology and newly loaded A remain.
A retains the loaded annotation policy.

After rewriting local B to valid content and retrying the root using the same manager, the root succeeds with two import declarations but closure size two: root and A. B remains absent.
The previous failed import's placeholder affects retry.
A separate malformed root that fails after successfully loading A also leaves A registered.

These are representative root/import failure paths. They close the primary “closure always rolled back” assumption, while additional parser/manager paths still need explicit matrix rows in implementation proof: already-loaded imports, shared imports, cycles, alias/document IRIs, silent missing-import strategy and failure before/after registration.
The observed cases must be preserved as non-negotiable fixtures.

## 6. GAP-05: XML provider and AbortSignal behavior

`GAP-P04` tested Node's current adapter and native browser XML.
`GAP-P05` then imported the **exact repository modules** into Chromium and WebKit, with no source rewriting.
Seven modules were fulfilled from disk at a synthetic origin; every other request was blocked.
Browser processes were closed.

| Case                                                  | Node adapter                        | Chromium exact adapter                                 | WebKit exact adapter                                   |
| ----------------------------------------------------- | ----------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| Valid XML                                             | Accepts                             | Accepts, root r                                        | Accepts, root r                                        |
| Duplicate attribute                                   | `XmlParseError` / `XML_PARSE_ERROR` | Returns normally; HTML wrapper with nested parsererror | Returns normally; HTML wrapper with nested parsererror |
| Empty namespace prefix                                | `XmlParseError` / `XML_PARSE_ERROR` | Returns normally; HTML wrapper with nested parsererror | Returns normally; r root with nested parsererror       |
| Native AbortSignal passed to profile/locality budgets | Not the browser probe               | Accepted                                               | Accepted                                               |
| Cross-realm iframe AbortSignal                        | Not the browser probe               | Accepted                                               | Accepted                                               |
| Duck object with only `aborted:false`                 | Not a valid signal contract         | `TypeError`                                            | `TypeError`                                            |

Observed versions: Chromium 156.0.8078.4 and WebKit Version 27.2.
Firefox failed to launch locally with `spawn UNKNOWN`; no installation or environment repair was performed.
Firefox is a future mandatory environment qualification gate.

The XML adapter currently inspects only the document element for `parsererror`.
These observations establish adapter-level failure recognition differences.
They do **not** prove that malformed ontology content is published by the public manager: downstream grammar/root checks can still reject.
Public load error category, parser fallback, callback and state-publication consequences must be measured through each actual load route during implementation.

The observations also show why real native/cross-realm signals belong in browser qualification instead of replacing them with convenient duck mocks.
The initial browser probe had a JavaScript constructor-precedence error, fixed before the exact-module probe.
Both initial attempts are retained in evidence.

## 7. Additional matched-route scope and boundaries

The existing provider `OWLOntologyImportsClosureSetProvider.ontologies()` needs live-manager versus constructor-snapshot qualification.
The public API inventory also requires ownership checks for removed/foreign ontologies and the complete selected EntitySearcher stream family.
These are source-discovered matched-route obligations, separate from the original thirteen findings.

The plan addresses non-structural acceptance, configuration, failure, evaluation/callback timing and state consequences where output semantics are otherwise matched. Existing deliberately normative parser/profile output corrections and the narrowly admitted structural expected-difference programme are not automatically reversed.
Each acceptance/failure case overlapping those ledgers needs an explicit scope decision, not a blanket exemption or expansion to all Java bugs.

Java's JVM System properties and classpath resources are host facilities, not existing ECMAScript facilities.
The proposed cross-host design uses canonical OWLAPI instance methods and identical built-in defaults, and explicitly records those absent host capabilities.
It does not silently reinterpret process environment variables, fetch an owlapi.properties file or add a fake Java public method.
This boundary must not excuse different defaults or setter/getter semantics on the matched configuration objects.

## 8. Remaining qualification gates

The source-bound selected-class overlay closes the scoped research provenance gap; a full fresh native build on the canonical runtime is still required before release.
The bounded probes do not claim full-network, all-parser or all-listener proof.
Large private byte/search-state limits remain source traced.
Browser public call-path cases and Firefox require future execution in the existing qualification lanes.

A maintained JSON-LD integration capable of the target context semantics is a design/admission dependency, not already available configuration.
An upstream enhancement is preferred; a separately maintained package fork with reviewed licence, provenance, test corpus, security ownership and exact lock is the proposed fallback.
No such dependency change was made during research.

The original supporting evidence remains external and distinguishable from HISEW engine-owned receipts.
This repository edition and its portable evidence accompany the requested plan; original source bodies and operator scratch inventories remain external.
No source implementation, dependency installation, project configuration, full product suite, commit, push, release or consumer update was performed.
