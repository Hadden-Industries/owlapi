# OwlAPI Markdown centralization

This document describes the supported OwlAPI portion of the shared Markdown centralization plan on 7 October 2026.
The complete migration requires a qualified producer release with public selection reconciliation, candidate qualification, resource observation and a reusable hosted workflow.
Installed `@hadden-industries/markdown-quality@1.0.3` supplies the existing public bin and result schema used here.

## Implemented preparation

The root `lint:md`, `format:md` and `format:md:check` commands invoke the installed `markdown-quality` bin through the isolated tooling project's npm scripts.
Npm supplies that project's installed bins on `PATH`; the scripts return to the repository root before invoking the bin, preserving relative `--root` arguments as well as default selection.
Existing command names, repository-root policy resolution and argument forwarding remain supported.
Checking does not acquire missing packages.
The existing formatter remains the only formatter.

The trusted candidate checker resolves `@hadden-industries/markdown-quality/result-schema` through the installed package's export rather than assuming the schema's internal filename.
Its independent schema, process-exit, package identity, policy digest and staged-byte checks remain in place.

The observer declares its existing targets once: six consecutive samples, 30,000 ms checker latency and 512 MiB observed memory.
Iteration, acceptance comparisons and receipt values use those declarations.
Windows Job completion and cumulative committed-memory observation, Linux process-group RSS sampling and failure cleanup retain their existing semantics.
The receipt's descriptive wording uses `6` in place of `six`; machine fields and numerical targets retain their meaning.
These targets are observation criteria, not enforced OS memory limits or a statistical latency guarantee.

The dependency-security probes and application qualification remain independent obligations.
No package, native-tool, runtime, policy or workflow version change accompanies this preparation.

## Current policy inventory

Before this document was added, package-native full inspection selected 67 documents and reported 11 existing documents as ignored.
All 78 tracked Markdown paths were accounted for in that inspection.
The new document adds one selected path.
This is a characterization of this checkout, not a package-owned Git inventory reconciliation guarantee.

`.markdown-quality.json` includes `**/*.md` and explicitly excludes `.development-tools/**`, `.release/**`, `coverage/**`, `playwright-report/**` and `test-results/**`.
It also delegates selection to `.gitignore` and `.prettierignore`, so Markdown policy still has multiple inputs until the producer-dependent migration.

| Existing policy source | Markdown decisions to adjudicate at cutover                                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.gitignore`           | Dependency, virtual-environment, development-tool, cache, coverage, browser-report and test-result directories. Its archive and environment-file patterns must also be assessed against future inventories rather than translated blindly.         |
| `.prettierignore`      | Generated conformance output; pinned conformance upstream documents; provenance history reconstruction; generated `API.md` and `docs/compatibility/java-api-surface.md`; Java reference fixtures; the two dated Phase 19/20 deep-review documents. |

The 11 current ignored tracked documents are:

- `API.md` and `docs/compatibility/java-api-surface.md`.
- The two `docs/Deep Review of Phase 19 and Phase 20 of the owlapi Implementation Plan` documents dated `2026-08-24T1130` and `2026-08-25T0020`.
- `docs/conformance/upstream/w3c-json-ld-api/tests/LICENSE.md`.
- `docs/conformance/upstream/w3c-owl2/README.md`.
- `docs/conformance/upstream/w3c-rdf-tests/LICENSE.md` and its `rdf/rdf11/rdf-xml/README.md`.
- `docs/provenance/history-reconstruction/README.md` and its `review/partition-proposal-g3-summary.md`.
- `util/owlapi-reference/fixtures/profiles/README.md`.

The two dated review filenames use literal brackets escaped in `.prettierignore`.
Do not guess their replacement glob syntax.
Use independent expected path sets and the package's actual full, explicit and inventory decisions when accepting the root-policy translation.
Package 1.0.3 also skips operational directories during full traversal; a current complete tracked inventory does not prove future hidden Markdown cannot disappear.
Do not implement another local matcher or interpret an omitted document as clean.

## Lessons from Universal Ontology

The referenced UO implementation completed bounded existing-contract corrections while keeping the missing producer work explicit.
It resolved bins from package metadata in existing callers, consumed the exported result schema and deduplicated its existing observer targets.
Its generated-policy correction preserved the document's canonical logical path during staging, with a positive control showing that the same content changes at an included path.
Generator freshness remained a separate domain obligation.
OwlAPI has no corresponding generated-policy helper requiring that repair.

UO retained its inventory guards and documented that full Markdown checking still rejected 35 approved exclusions.
It separately obtained exact approval for its distribution fingerprints.
Those receipts, configuration approvals and 1024 MiB targets do not qualify OwlAPI or change this repository's 512 MiB target.
UO qualified metadata-resolved bin callers on Windows; it did not qualify OwlAPI's npm entry points or those callers on Linux.
OwlAPI therefore requires its own command, process and hosted evidence.

## Deferred cutover

Keep the current candidate checker, staging probes, observer, observer probes and window runner until the producer ships and qualifies complete replacements.
Their private CLI/native-asset paths, and the workflow's `MARKDOWN_TEST_CLI` paths, remain known dependencies.
The result-schema export alone does not replace staging or process observation.

The remaining coordinated work is:

1. Qualify and accept one producer release and immutable reusable-workflow revision, including public exports, bundled qualification assets and rights evidence.
2. Adjudicate every selected-path difference and move the approved Markdown decisions into `.markdown-quality.json`.
   Remove external-ignore influence using the accepted new contract.
3. Adopt the producer-owned execution profile only after its schema and enforcement exist.
4. Replace copied candidate, digest, process, observer and generic probe mechanics through the supported package/workflow contracts.
   Delete their obsolete callers together; add no forwarding shim or version-detection fallback.
5. Retain independent dependency-security, product, generated-document and integration assertions.
   Qualify the exact proposed controls before promoting them to the trusted baseline.
6. Obtain attributable Windows and Linux hosted positive/negative qualification for the frozen final candidate and preserve the existing required completion gates.

This preparation does not satisfy the complete R2 migration, establish `.markdown-quality.json` as the sole policy source or qualify the future shared workflow.
Local checks, review, source publication, protected-main integration and hosted acceptance must be reported against their own actual identities.
