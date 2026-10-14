# API behavior profiles

This is the current contract for the profile-aware source candidate.
Full profile qualification is still in progress; neither profile admission nor a new npm publication is claimed here.
The [current decision ledger](java-api-parity-decisions.json) records paired expectations, native probes, tests and accepted-plan traceability.
Its `currentBehaviorContracts` section is separate from the retained phase 21/22 receipts and their historical Java revision.

## Selection and authority

```js
import { OWLManager } from "@hadden-industries/owlapi/apibinding";

const manager = OWLManager.createOWLOntologyManager({
  behaviorProfileId: "java-owlapi-5.5.1",
});
console.log(manager.getBehaviorProfileId()); // java-owlapi-5.5.1
```

Use `normative-v1` explicitly for the normative contract.
Omission retains that same normative default for existing optionless construction; it does not select Java compatibility.
Unknown identifiers fail at construction.
A manager cannot change its profile, and there is no mutable `latest` alias or registry extension.

`java-owlapi-5.5.1` targets the official released behavior on the [selected public surface](java-api-surface.md), including observable implementation quirks.
The [provenance manifest](profiles/java-owlapi-5.5.1/provenance.json) binds release commit `f760b3a4c107c6d5f90f856e5680c39b18af646f`, Central bytes, dependencies and runtime.
The historical `d7e997a5` and `b61ebe2d` research pins remain historical evidence; neither is relabelled as the released oracle.

`normative-v1` follows the frozen normative specification set and accepted project contracts in the [implementation plan](../plans/2026-10-13-java-compatible-api-behavior-implementation-plan.md#authority-and-profile-contracts).
An applicable normative clause outranks Java behavior for this profile.
Where no such authority prescribes a difference, the released Java behavior is the fallback.
The executable decision ledger identifies each shared or split rule.
Engineering rationale alone does not create a new normative requirement.

Profile identity, ontology language profile (DL/EL/QL/RL), package version and qualification status are separate concepts.
A new Java release requires a new behavior identifier.
A change to the normative contract requires a new normative version; a repair that satisfies the existing contract does not.

## Ownership and lifetime

A manager binds its factory, configurations and managed ontologies privately to one context.
Each load/save captures that context and configuration before its asynchronous work.
A later manager configuration change cannot change a suspended operation.
Standalone factories, Manchester renderers and OWL language-profile checkers select behavior through their constructor options.

Structural axioms and values can be shared.
Passing a mutable ontology between managers does not transfer its owner.
Normative foreign mutation and mixed-profile mutation reject before effects.
Same-profile Java foreign mutation preserves the native effects, including the observed owner-index quirks on rename.

`OWLOntologyMerger.createMergedOntology(destination, iri)` explicitly copies direct axioms into a new destination-owned ontology, including across profiles.
Java creates that target before reading the provider and retains copied axioms if a later provider read fails.
Normative copy validates the complete source snapshot before publishing a target.
Destination identity collision preserves the existing ontology; source state and ownership remain intact in both profiles.

## Configuration and resource defaults

Obtain the manager's configuration, use native Java setters where they exist, and install the returned immutable configuration:

```js
const configuration = manager.getOntologyLoaderConfiguration()
  .setConnectionTimeout(20000)
  .setRetriesToAttempt(5)
  .setFollowRedirects(true)
  .setEntityExpansionLimit("100000000");
manager.setOntologyLoaderConfiguration(configuration);
```

These are the released defaults, not replacement JS safety defaults.
In particular, attempts are not retries, a connection timeout is not a parsing or response-body deadline, and an entity expansion count is not a byte/depth limit.
The selected native consumer determines whether and when each setting is used.
Negative/zero Java integer values retain the observed setter and consumer timing.

| Boundary                               | `java-owlapi-5.5.1` default  | `normative-v1` default                                   |
| -------------------------------------- | ---------------------------- | -------------------------------------------------------- |
| Parsing mode / dataset graph policy    | Compatible / merge           | Strict / require one graph                               |
| Loading deadline                       | No JS elapsed deadline       | 30,000 ms                                                |
| Input and remote document bytes        | No JS finite ceiling         | 33,554,432 bytes each                                    |
| Import count / depth                   | No JS finite ceiling         | 256 / 32                                                 |
| Token length / count                   | No JS finite ceiling         | 1,048,576 UTF-8 bytes / 5,000,000                        |
| Expressions / annotations              | No JS finite depth ceiling   | 512 / 64                                                 |
| Axioms / blank nodes / RDF list length | No JS finite ceiling         | 1,000,000 each                                           |
| RDF statement events                   | No JS finite ceiling         | 5,000,000                                                |
| XML element depth                      | Native provider limit 100    | 512                                                      |
| JSON-LD context counter                | Native observed boundary 257 | Existing provider boundary 11                            |
| Serialized output                      | No JS finite ceiling         | 33,554,432 bytes                                         |
| OWL profile work / depth               | No JS finite ceiling         | 1,000,000 / 256                                          |
| OWL profile numeric / literal lengths  | No JS finite ceiling         | 4,096 digits / 1,048,576 code units                      |
| OWL profile elapsed deadline           | None                         | None; explicit nonnegative `timeoutMs` remains available |

Java's actual XML provider retains other limits: 100,000 code units per general entity and in total, 15,000 per parameter entity, 1,000 per XML name and 200 attributes per element.
The normative internal-entity controls remain 256 declarations, expansion depth 16, replacement length 65,536 code units and 33,554,432 expanded UTF-8 bytes.
Native limits and explicit host extensions are separate controls, not interchangeable aliases.

Caller-selected JS budgets and cancellation remain available as explicit host restrictions.
An exhausted assessment is unverified; `isInProfile()` cannot turn that into a verified negative verdict.
Physical memory, runtime stack limits and unsupported host capabilities are not promises of unlimited execution.

Writer setters also preserve native behavior.
Changed Java copies reset indent size, banners and labels-as-banner to 4, true and false; native no-op setters retain object identity.
The normative copy preserves unrelated settings.
Each storer reads only the settings its contract consumes.

## External access and Node transport

The Java profile enables native resolution behavior but grants no external access by itself.
A host supplies the document loader and authorizes its resources.
The approved concrete Node adapter is an explicit subpath:

```js
import { NodeDocumentLoader } from "@hadden-industries/owlapi/io/node";
import { OWLManager } from "@hadden-industries/owlapi/apibinding";

const documentLoader = new NodeDocumentLoader({
  authorize: (resourceIRI, context) => applicationAccessPolicy.permits(resourceIRI, context),
});
const manager = OWLManager.createOWLOntologyManager({
  behaviorProfileId: "java-owlapi-5.5.1",
  documentLoader,
});
```

`applicationAccessPolicy` is supplied by the consuming application.
The callback must return `true` for each concrete operation; omission/false rejects it. Its context exposes the purpose, configuration, credential headers, redirect origin, requested file path or resolved address/path as appropriate.
Operations include `use-document`, `request-document`, `resolve-hostname`, `connect-http`, `resolve-file` and `read-file`.
For `read-file`, `requiresStablePathAncestors: true` requires the host to guarantee trusted, stable ancestor directories throughout acquisition.
The portable adapter cannot contain concurrent replacement of parent directories by an untrusted actor; hosts with that trust model must use a caller-owned loader with platform-specific file-handle authorization.
See the [approved local-file boundary](profiles/java-owlapi-5.5.1/file-transport-boundary.md).
Resolved addresses are pinned for the authorized connection.
Cache reuse requires current authority; distinct loader authorities never share context contents.

The adapter implements HTTP, HTTPS and local files.
It uses Node's native gzip, raw DEFLATE and CRC32, the selected XZ binding, and a first-entry ZIP envelope reader.
Consumers enforcing npm's strict install-script policy must explicitly deny `lzma-native@8.0.6` in their own `allowScripts` map.
The tested Windows hosts use the package's prebuilt native binding, with no install script or compiler invocation.
It retains Java's original ontology document IRI after redirects.
Cancellation terminates active response/decoder work. The [transport approval](profiles/java-owlapi-5.5.1/transport-decision.md) and [provider selection](profiles/java-owlapi-5.5.1/compression-provider-selection.md) define the exact host boundary and remaining qualification requirements.

RDF4J's Hasmac JSON-LD context client is a separate consumer: it ignores ontology loader timeout/attempt/auth/compression settings, allows ten total requests, accepts status 200, follows the native redirect/alternate-Link rules, and uses the final URL as context base.
It autodetects JSON Unicode encoding and does not decompress HTTP/filename envelopes.
It consumes the first complete JSON structure; trailing content is not a new Java rejection.
Multiple context Link headers fail, but a context Link on a remote context does not trigger an extra context fetch.

The matched OWLAPI path retains RDF4J's fixed 25-entry whitelist; unsupported OWLAPI format parameters do not override it.
Successful contexts live for one hour within the host authority, pending loads coalesce and failed loads are evicted.
RDF4J's 1,000-entry cache capacity cannot be reached through these 25 admitted keys.
No new JS whitelist/configuration default widens that surface.

Browser parsing of supplied documents remains supported.
Browser external transport parity remains unqualified: Fetch does not expose the required native connection and redirect controls.
The Node subpath is not a browser module.
Existing custom document loaders own their actual host transport; receiving a configuration object alone does not establish compatibility.

Java compatibility preserves weaker native validation and resource boundaries.
Use it for trusted/matched migrations with a deliberate access policy; select the normative contract and explicit budgets where untrusted-input handling requires those guarantees.
Changing a security default must not silently change the meaning of an already qualified Java identifier.

## Failure, metadata and query contracts

Java mutation is sequential and returns `ChangeApplied`; normative mutation is atomic and returns boolean.
Java loading publishes per document and can retain successful imports after root failure; normative loading publishes a complete graph.
Java target reuse appends and can retain a failed writer prefix; normative storage replaces only complete output.
An error is not a promise that no state changed, and in-memory rollback cannot undo authorized external requests.

Java RDF metadata reports the observed constant `PARSED_ONE_HEADER` and counts source statement occurrences, including duplicates.
Normative metadata reports actual distinct header count and selected unique triples.
Both describe the original parse, not later edits or complete source preservation.

Java OWL/XML preserves the released parser's omission of anonymous individuals inside `ObjectOneOf`, including its empty result, and the Java factory accepts an empty enumeration. Normative OWL/XML includes anonymous operands and requires at least one individual, as specified by the [OWL 2 XML serialization schema](https://www.w3.org/TR/owl2-xml-serialization/#sec-xml-schema).
These contracts have paired tests; the older expected-difference receipt retains its original Java revision and is not used as a Java-profile exemption.

Compatible RDF parsing also distinguishes named datatype restrictions.
Java retains their orphan literal facets as anonymous annotations without adding a datatype definition.
Normative compatible mode preserves the named restriction as a definition under the adopted recovery based on [OWL 2 RDF-Based Semantics tables 5.7 and 5.9](https://www.w3.org/TR/owl2-rdf-based-semantics/#Semantic_Conditions_for_Datatypes).
Strict mapping has no such recovery.
The Java annotation-loading setting still controls whether recovered annotations are retained.

EntitySearcher results are deferred and single-use in both profiles; materialize once when repeat traversal is needed.
Closure providers query current membership on each call and return that call's defensive snapshot.
The ledger and public API registry distinguish these timing contracts from Java/JS collection shapes.

## Qualification and recovery

Admission requires paired independent tests, exact installed candidate checks, the declared Node/browser/worker matrix, provider/rights evidence, consolidated reviews and the HISEW final verification.
Current native observations compare Central with an unmodified source reconstruction; that agreement alone does not qualify the shipped JS implementation.

Pin exact package bytes and select the profile explicitly during migration.
Keep the previously accepted package for rollback.
Abort promotion on an unclassified behavioral mismatch, missing authorization enforcement, stale oracle identity or a failed required lane.
Recovery restores the prior package and application state under its own policy; it does not erase remote requests already authorized by a failed operation.
Historical release and research records keep their original identities and hashes.
