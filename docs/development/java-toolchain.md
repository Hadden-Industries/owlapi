# Java toolchain for continued OwlAPI implementation

**Selected on:** 29 October 2026.
**Scope:** New Java compilation, oracle execution and qualification for the continued 0.1.0 implementation.

The repository owner selected the latest applicable Eclipse Temurin 25 LTS patch already installed on the development machine.
At that selection, the target was **Eclipse Temurin 25.0.5+8**, HotSpot JDK, with runtime build **25.0.5+8-LTS**.
The official [Temurin 25 release catalogue](https://github.com/adoptium/temurin25-binaries/releases) identifies `jdk-25.0.5+8` as its latest release at this selection; [Adoptium's support policy](https://adoptium.net/support/) identifies Java 25 as an LTS line.
Recheck the authoritative release and platform assets at future adoption; a rolling web-page example is not a frozen tool identity.

## Selection and local observation on 29 October

| Field                            | Selected or observed value                               |
| -------------------------------- | -------------------------------------------------------- |
| Vendor/distribution              | Eclipse Adoptium / Eclipse Temurin, HotSpot              |
| Java feature line                | 25 LTS                                                   |
| Upstream release tag             | `jdk-25.0.5+8`                                           |
| Runtime version                  | `25.0.5+8-LTS`                                           |
| `java.version` / `javac` version | `25.0.5`                                                 |
| Windows package identifier       | `EclipseAdoptium.Temurin.25.JDK`                         |
| Windows package version spelling | `25.0.5.8`                                               |
| Observed installation            | `C:\Program Files\Eclipse Adoptium\jdk-25.0.5.8-hotspot` |

On 29 October, explicit invocation of that installation's `bin/java.exe -version` reported:

```text
openjdk version "25.0.5" 2026-10-20 LTS
OpenJDK Runtime Environment Temurin-25.0.5+8 (build 25.0.5+8-LTS)
OpenJDK 64-Bit Server VM Temurin-25.0.5+8 (build 25.0.5+8-LTS, mixed mode, sharing)
```

Its `bin/javac.exe -version` reported `javac 25.0.5`.
These observations verify local tool identity, not source-build reproducibility, cross-host qualification or an installer checksum.
No installation or machine-wide environment change is required by this planning work.
For continued local Java work, select this installation explicitly instead of trusting an unrelated PATH/JAVA_HOME entry.

## Current executable policy

The root [`.java-version`](../../.java-version) is the single editable Java patch/build declaration, using setup-java's exact Temurin LTS spelling.
`scripts/java-toolchain.mjs` derives the runtime, Windows package and native version spellings from that file.
Workflow governance requires both setup-java consumers to use `java-version-file: .java-version` and rejects a competing inline version.
The native build collector and input-record validator share strict admission derived from the same file.
The recipe fingerprint includes both the policy module and version file, so changing either invalidates affected build reuse.

- `.github/workflows/ci.yml` and `release.yml` read the same version file directly through setup-java.
- Released-oracle semantic replay observes exact native properties and records the Java executable and JDK release-file digests; unchanged-probe reuse rejects missing or changed JDK identity.
- New evidence recording rejects old runtime observations.
  Retained qualified observations and frozen timings keep their original identities.

SLICE-003 of the [release roadmap](../plans/2026-10-29-0.1.0-release-reconciliation.md) separates local semantic checks from hosted platform admission.
The local executable and native properties have been observed on the selected JDK; hosted setup-java acquisition and exact platform assets still require their hosted execution evidence.
Do not relax a strict environment validator to accept any Java 25 merely to make the new version run.
Changed JDK inputs invalidate incompatible build-product or qualification reuse.

Python follows the same ownership principle: [`.python-version`](../../.python-version) is its single editable selection.
`scripts/development-tool-policy.mjs` derives the interpreter version, minor line and Ruff target; both native bootstraps consume that reader.
After changing the Python pin, run `node scripts/sync-python-target.mjs --write` to project `requires-python` into both native projects and `target-version` into Ruff, then regenerate the two locks with uv.
`npm run check:python-tools` and the projection tests reject drift; generated TOML constraints and historical scanner observations are not independent version declarations.
The file-based pattern follows the local Universal Ontology Java setup and JSON Quality/Markdown Quality Python readers; no runtime controller is imported from those repositories.

## Historical evidence and semantic authority

Java OWLAPI **5.5.1** remains the behavior-profile target; a JDK patch upgrade does not select a newer OWLAPI release or change a normative-profile rule.
The official released artifact, older source-build comparison revision and frozen performance baseline have distinct identities and consumers.
See the [roadmap's oracle migration](../plans/2026-10-29-0.1.0-release-reconciliation.md#4-java-toolchain-and-oracle-migration).

Preserve old environment captures, signatures, fixture observations, manifests, publication catalogues, notices and timings with their actual original identities.
Create new observations and build records for new work; do not rewrite history by substituting this version into old evidence.
Previously recorded Java timings stay frozen unless the owner separately authorizes a precisely identified new or corrected timing baseline.
New semantic probes on this JDK are expected; unexplained differences require investigation before expected behavior is changed.
The source build and released binary must retain their own rights, dependency and provenance evidence.

This declaration does not enable shared Java reference reuse, qualify a package, or authorize publication.

## Local semantic migration checks

The 29 October development replay acquired all 64 ordered runtime artifacts from Maven Central and verified their exact sizes and SHA-256 values against the retained released-oracle lock.
On the selected JDK, [28 behavior observations](java-toolchain/temurin-25.0.5-behavior.json) matched the historical released-oracle observations without unresolved differences.
The [15 selected API observations](java-toolchain/temurin-25.0.5-selected.json) also matched under the comparator's explicit `--same-release` mode.
These are semantic observations against unchanged released Java bytes; no Java performance baseline was replaced.

The initial selected-API comparison used the existing Central-versus-source-build mode and reported four storage differences.
That mode deliberately normalizes different recorded build comments on its two sides, so applying it to two Central executions was incorrect.
Four focused regressions failed before adding the same-release mode; its five-test suite then passed, and the new mode reported zero differences across the 15 observations.
The new mode requires the same nonempty ordered artifact classpath and preserves build comments as ordinary output bytes; it does not expand the historical cross-build normalization allowances.

The observations retain actual executable/release-file digests and runtime properties.
They do not establish hosted Linux acquisition, a new source-build reconstruction, frozen-candidate acceptance or publication readiness.
