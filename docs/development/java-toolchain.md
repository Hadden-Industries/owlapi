# Java toolchain for continued OwlAPI implementation

**Selected on:** 29 October 2026.
**Scope:** New Java compilation, oracle execution and qualification for the continued 0.1.0 implementation.

The repository owner selected the latest applicable Eclipse Temurin 25 LTS patch already installed on the development machine.
The declared target is **Eclipse Temurin 25.0.5+8**, HotSpot JDK, with runtime build **25.0.5+8-LTS**.
The official [Temurin 25 release catalogue](https://github.com/adoptium/temurin25-binaries/releases) identifies `jdk-25.0.5+8` as its latest release at this selection; [Adoptium's support policy](https://adoptium.net/support/) identifies Java 25 as an LTS line.
Recheck the authoritative release and platform assets at future adoption; a rolling web-page example is not a frozen tool identity.

## Exact declaration and local observation

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

## Coordinated executable migration still required

This document declares the selected target; this planning change does not claim the following consumers have migrated:

- `.github/workflows/ci.yml` and `release.yml` currently request `25.0.4+101.0.LTS` through setup-java.
- `scripts/workflow-governance.mjs` enforces that older setup-java selection.
- `util/owlapi-reference/reference-native-build.mjs` and `reference-inputs.mjs` admit older `25.0.4.1` runtime identities.
- Released-oracle recording, build/publication metadata and native bundle fingerprints contain older JDK assumptions or retained observations.

SLICE-003 of the [release roadmap](../plans/2026-10-29-0.1.0-release-reconciliation.md) must migrate these current selectors and validators together, using the native setup-java version grammar for the selected build and verifying actual installed runtime identity.
Keep one current declaration with derived or validated platform spellings; avoid another set of independently maintained literals.
Verify exact platform assets/checksums, cold native preparation and the required semantic comparisons before admitting the new environment.
Do not relax a strict environment validator to accept any Java 25 merely to make the new version run.
Changed JDK inputs invalidate incompatible build-product or qualification reuse.

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
