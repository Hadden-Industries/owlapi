# Java API behavior research and portable evidence

These reports and evidence snapshots are maintained inputs to the [Java-compatible behavior plan](../../../plans/2026-10-13-java-compatible-api-behavior-implementation-plan.md).
A clone contains the information needed to review the findings, inspect the cited source and develop the implementation without access to the author's Drive.

## Contents

- [Primary research](2026-10-13-owlapi-api-behavior-compatibility-research.md) and [portable primary evidence](2026-10-13-owlapi-api-behavior-evidence.json): 13 findings, 68 source references and six probe programs.
- [Gap-closure research](2026-10-13-owlapi-api-behavior-gap-closure-research.md) and [portable gap evidence](2026-10-13-owlapi-api-behavior-gap-closure-evidence.json): 29 source records and seven probe programs, including JSON-LD defaults/cache, writer failures, manager state and browser adapters.
- [Provenance manifest](manifest.json): hashes and sizes of the four preserved Drive originals and every repository artifact in this dossier.
  Original hashes identify the unmodified external records; repository hashes identify these derived editions.

## Preserved evidence and transformations

The four original Drive files remain unchanged.
The reports retain their findings and limitations, with relative links, a repository-edition note and updated hashes of the linked portable evidence.

The JSON snapshots preserve configuration inventories, pinned source references, source/dependency/class hashes, ordered classpath entries, authored probe templates, commands, recorded outcomes, corrected attempts and coverage limits.
They use the distinct `owlapi-portable-behavior-research/v1` format and record the original format and file hash.

Copied upstream source bodies, duplicate source excerpts, scratch inventories and workflow/operator bookkeeping are omitted.
Source retrieval URLs, exact revisions, artifact coordinates and hashes remain.
No Java or dependency source archive, compiled artifact or engine receipt is redistributed in this dossier.
Local source snapshots and raw records remain in the preserved external evidence.

Host-specific path roots in metadata, program templates and recorded output are replaced by named tokens.
This is a derived transcription; normalized output is not the byte-for-byte native output.
Primary program/output records retain original byte counts and hashes alongside normalized counts/hashes.
Each probe also records the hash of its original JSON record (UTF-8 `JSON.stringify` representation); the Drive original hash binds the complete raw file.
Source/dependency hashes describe the original source/artifact bytes and are never recalculated from normalized paths.

## Root bindings and replay

| Token                          | Binding when reconstructing a probe                                          |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `${OWLAPI_SOURCE}`             | Checkout of JavaScript revision `20426357165a22248985ec43d7ac1266d49d6bec`   |
| `${JAVA_SOURCE}`               | Checkout of Java revision `b61ebe2da83daceebb3e7ba7afbd2582c9240c33`         |
| `${MAVEN_REPOSITORY}`          | Maven artifact directory containing the recorded ordered dependency bytes    |
| `${PRIMARY_WORKSPACE}`         | Fresh directory for the six primary probe programs and outputs               |
| `${GAP_WORKSPACE}`             | Fresh directory for gap probes and the selected-class overlay                |
| `${PROGRAM_FILES}` / `${HOME}` | Historical host/tool locations; select equivalent installed tools for replay |

These are textual template tokens, not instructions to set environment variables or resolve files from the current working directory.
Bind them before materializing the recorded source/command strings, with the appropriate file-URL and platform path syntax.
Do not execute these templates while tokens remain.
Obtain omitted source through its immutable repository reference or versioned source artifact and verify its recorded hash.
The ordered classpath records preserve all 63 original artifact identities.

Use the existing [native reference build](../../../../util/owlapi-reference/reference-native-build.mjs) and plan-selected harness integration for future qualification.
Replaying the historical selected-class overlay does not establish a full source-bound Java build.
Browser adapter observations do not prove every public XML path, and the recorded Firefox launch failure remains a qualification gap.
No product tests were rerun or new runtime acceptance claimed by copying this dossier.

## Maintenance

Update repository links and the manifest hashes together after changing an artifact.
Preserve original provenance and the distinction between research observations, source-traced facts and implementation qualification.
The manifest does not hash itself; it hashes this README, the two reports, the two JSON snapshots and their plan.
