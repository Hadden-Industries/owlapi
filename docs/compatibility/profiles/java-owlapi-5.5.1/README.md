# Released Java 5.5.1 oracle

This directory records new observations against the Maven Central distribution, separately from the historical development-revision research.
The package implementation and the complete compatibility profile are still in progress.
`provenance.json` remains unqualified until the frozen harness identity and admission checks are complete.

The Central distribution SHA-256 is `747b1a5269fee2992487dcde946f16dfbc14aa458d50854994a0485cf263ce07`.
Its annotated release tag resolves to commit `f760b3a4c107c6d5f90f856e5680c39b18af646f` and tree `6b87391a36b7341f7253f57046b5b8621d3d0ac8`.

## Provenance admission

The upstream Git tag and commit are unsigned.
Central POM/JAR detached signatures verify with fingerprint `C55B55B3B376584205FC74019B12DCAC50DE39AB`; the public key was obtained from the Ubuntu OpenPGP key server by that full fingerprint.
The UID says Ignazio Palmisano, matching the release tagger.
GnuPG reports undefined owner trust.
No personal identity or web-of-trust certification is claimed.

For this compatibility oracle, admission relies on the independently bound official Git release, HTTPS Maven Central artifact bytes, preserved detached signatures and the source-build/probe comparison.
The signature proves integrity under the recorded key, separately from this channel-based admission decision.
This is development evidence, with no Java runtime or copied Java implementation in the shipped JavaScript library.

## Source build comparison

The unmodified tagged source built successfully with Maven 3.9.15 and Eclipse Temurin 25.0.4.1+1-LTS.
A fresh checkout also built offline from the isolated repository.
The preserved effective Maven model and plugin-resolution graph identify build inputs, including parent POMs, build plugins and their dependencies.
The dependency lock is a conservative inventory of all POM/JAR/signature artifacts acquired in that isolated repository; its ordered runtime classpath is a separate field.
Acquisition-only artifacts may therefore appear in the source reconstruction inventory.

The rebuilt distribution is not byte-identical to Central.
Central records JDK 21; reconstruction uses JDK 25.
Both emit Java 11 class files.
Build timestamps and implementation-version metadata differ, 885 entries differ in bytes, and Central additionally packages 89 grammar/package-info resources.
The entry-by-entry comparison is retained in `evidence/jar-comparison.json`.
Source was not changed to manufacture identical bytes.
Central remains the executable oracle.

All 17 Java executions (15 retained research cases and two additional contract probes) agree on their behavioral rows.
The comparison preserves callback order, exception outcomes, configuration values and partial effects.
Only the iteration order of the unordered `getSupportedSettings()` inventory is canonicalized; artifact/runtime locations remain separate provenance.
Agreement is limited to the recorded probes, not a proof that every bytecode path is equivalent.

The exact installed Maven tree matches the downloaded 3.9.15 binary archive.
The original JDK installation archive was unavailable, so the existing native tool-identity collector hashes the installed distribution tree instead.
The evidence includes its file count, total bytes and SHA-256.

## Reproduction

1. Check out the exact tagged source into an independent workspace; do not edit it or use a source overlay.
2. Resolve `net.sourceforge.owlapi:owlapi-distribution:5.5.1` using Maven Central only, with the repository's [Central-only settings](../../../../util/owlapi-reference/reference-reuse-settings.xml).
   Use an isolated Maven repository.
3. Use the recorded Maven/JDK identities.
   Resolve the runtime classpath with Dependency Plugin 3.11.0, and preserve its order.
   Verify every acquired artifact against `java-dependencies.lock.json`.
4. Build the unmodified source with the structured invocation in `provenance.json`.
   Seed dependencies before the offline build; unexpected or missing artifacts must fail admission.
5. Run [replay-behavior-research.mjs](../../../../util/owlapi-reference/replay-behavior-research.mjs) with the Central classpath file and an independent output directory.
   Repeat with every OWLAPI module JAR replaced by its corresponding unmodified source-build output, preserving all external dependencies and classpath order.
   The replay includes [ObserveBehaviorContracts.java](../../../../util/owlapi-reference/ObserveBehaviorContracts.java) and [ObserveMutationContracts.java](../../../../util/owlapi-reference/ObserveMutationContracts.java) for the additional native configuration, facet and ownership observations.
6. Compare outputs with [compare-behavior-observations.mjs](../../../../util/owlapi-reference/compare-behavior-observations.mjs).
   Preserve new measurements rather than rewriting the historical research evidence.
7. Preserve portable records using [record-released-oracle-evidence.mjs](../../../../util/owlapi-reference/record-released-oracle-evidence.mjs).
   JSON records use repository formatting; original-byte hashes remain in the evidence manifest.
   Run [validate-released-oracle.mjs](../../../../util/owlapi-reference/validate-released-oracle.mjs) with `--maven-repository=PATH` to check retained records and acquired artifacts.
   `--allow-unqualified` permits draft integrity checks without admitting the oracle as qualified.

`${QUALIFICATION_WORKSPACE}`, `${PROBE_WORKSPACE}`, `${OWLAPI_SOURCE}` and `${USER_PROFILE}` are portability placeholders in retained observations.
Paths in manifests resolve relative to their containing manifest.
Native command logs are operator observations, not HISEW verification receipts.
The JavaScript baseline retains a Firefox launch failure inside its browser probe output; the outer process's zero exit status does not qualify that browser lane.
Installed browser acceptance remains a SLICE-009 obligation.

## Newly resolved implementation decisions

- Java permits a manager to add an axiom to another manager's ontology, without transferring ownership or registering the ontology in the initiating manager.
  The plan's unconditional foreign-manager rejection conflicts with this observation.
  The Java profile must preserve the observed same-profile operation; normative rejection and mixed-profile boundaries remain distinct contracts.
  A foreign rename changes the ontology's ID while the owner retains its previous index entry.
  An occupied destination ID is permitted when the two ontologies have equal axiom sets.
  The initiating manager's ID-keyed load configuration determines annotation-change filtering.
- Both profiles use the normal facet meanings: `<`/`<=` are upper bounds and `>`/`>=` are lower bounds.
  The previous Manchester table-based inversion must be removed.
- Java writer copy/no-op behavior is observed in `evidence/behavior-contracts.txt`; loader settings preserve their earlier overrides, whereas changed writer setters reset selected presentation fields.
- The installed JSON-LD dependency still has an internal context limit of 10.
  Its internal context-resolver hook is not an accepted implementation seam.
  Dependency selection remains open until a supported configuration route meets the actual Java and normative boundaries.
