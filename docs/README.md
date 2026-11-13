# OwlAPI documentation

- [Install OwlAPI](../README.md#install), [load an ontology](../README.md#load-an-ontology), or [browse the API](../API.md).
- [Migrate from rc.2 or Java OWLAPI](migration/0.1.0-java-api-parity.md) and [choose a behavior profile](compatibility/behavior-profiles.md).
- [Set up a development checkout](../CONTRIBUTING.md#set-up-the-development-tools) and [run Markdown and JSON checks](development/npm-scripts.md#check-and-format-files).
- [Check what's published](../README.md#release-status) and [see what's changed since the last release](../CHANGELOG.md#unreleased).

## Engineering records

This directory contains the executable governance and delivery records for the `owlapi-js` migration described by `docs/implementation-plan.md`.
`owlapi-js` remains the historical WebVOWL staging/path name; the selected public npm package is `@hadden-industries/owlapi`, maintained only in `https://github.com/Hadden-Industries/owlapi` after extraction.
The implementation plan remains the highest-authority normative document.

The [rc.1 publication record](provenance/releases/0.1.0-rc.1/publication-status.md) retains the first scoped release's historical evidence.
The [scoped npm publication plan](plans/scoped-npm-publication.md) retains the exact native alias, original release sequence and independently owned UO/WebVOWL adoption handoffs.
The [identity decision](adr/0009-scoped-npm-publication-and-uo-rc-acceptance.md) records the approved rationale.
The active [0.1.0 roadmap](plans/2026-10-29-0.1.0-release-reconciliation.md) records rc.3 publication and its accepted limits while separating remaining stable-release work.
The [rc.2 Java-parity programme](plans/0.1.0-rc.2-java-parity.md) remains the earlier delivery record.

## Contracts and delivery records

- [Behavior profiles](compatibility/behavior-profiles.md): current Java/normative selection, native defaults, resource/access boundaries and qualification status.
  The typed current section of the existing parity ledger preserves separate historical receipts.
- [Installed OWL contract](compatibility/installed-owl-contract.md): shared producer CI/release qualification and reviewed consumer-source coverage, without application acceptance as a producer prerequisite.
- [RDF/XML writer configuration](compatibility/rdfxml-writer-configuration.md): five settings, prefix operations, supported parameters, Java adaptations and resource limits.
- [Profile default-policy inventory](compatibility/default-behavior-inventory.md) and [repair plan](plans/2026-10-05-profile-performance-and-default-behavior-repair-plan.md): scheduling and profile-only deadline migration.
- [Development dependency and Node 26 plan](plans/development-dependency-upgrade.md): delivered tool floors, exact qualification graph and expanded runtime coverage.
- [CI qualification plan](plans/2026-10-03-ci-input-aware-qualification.md): delivered FULL lineage/native Java infrastructure and current disabled shared-reuse state.
- [GitHub Actions migration plan](plans/2026-11-13-github-actions-migration.md) covers deliberate PR qualification, staged npm releases and recovery across npm and GitHub.
- [DRY analysis and remediation plan](plans/dry-principle-remediation.md): source-backed duplication findings and a draft, behavior-preserving HISEW implementation programme.

## Machine-readable records

- `compatibility/capabilities.json`: `REQUIRED_V1` migration-capability and release-status matrix; the historical label is not an npm major-version promise.
- `performance/resource-budgets.json`: normative finite resource limits and benchmark policy; the Java behavior contract retains native provider limits and removes JS-only defaults.
- `performance/benchmark-corpus.json`: pinned real-world and generated benchmark inputs.
- `provenance/provenance.json`: legacy-source dispositions, new-module provenance records, and recorded compatibility research.
- `conformance/suites.json`: pinned external standards and behavioural references.
- `conformance/classification-manifests.json`: exhaustive upstream-test classification gate.
- `conformance/rdf-to-owl-mapping.json`: finite, evidenced W3C reverse-mapping inventory for Tables 4 through 18.
- `conformance/owl-to-rdf-mapping.json`: exhaustive canonical structural-model to RDF/JS mapping inventory completed in Phase 16.
- `conformance/krss-corpus-register.json`: strict separation of KRSS fixture classes and the verified zero qualifying historical-corpus result.
- `compatibility/krss1-behavioral-oracle.json`: finite pinned Java observations and controlled KRSS1 compatibility decisions.
- `compatibility/expected-differences.json`: exact Java/JavaScript differential exceptions.
- `dependency-governance.json`: selected dependency authority, risk, licence, and replacement records.
- `release/producer-release-policy.json` and generated `release/producer-gates.json`: active producer obligations; historical gate records retain their original identities.
- `ontology-lifecycle-capability-implementation-plan.md`: imports-closure, mutation, merger, and storage foundations first shipped in rc.1 and retained in the latest release.
  The current behavior profiles govern their return values, ownership and atomic/partial effects; historical qualification stays bound to its original package.
  UO and WebVOWL retain their own production acceptance, without a prerequisite stable `0.1.0` release.
- `plans/w3c-test-conformance-reporting.md`: the independent post-release programme for complete versioned W3C result ledgers, EARL generation, and appropriately disclosed upstream implementation-report submissions; it is not a gate for the public scoped RC, later `@hadden-industries/owlapi@0.1.0`, its recorded cutover patch, or WebVOWL's package cutover.
- `compatibility/standalone-import-closure-prerequisites.md`: the bounded Java-compatible library surface required by the external consumer contract.

## Release operations

- [Transport Actions artifacts and recover from a failed transfer](release/artifact-transport.md).
- [Verify registry availability and reconcile approval evidence](release/availability-policy.md).

## Development conventions

Repository implementation conventions are frozen in `engineering-conventions.md`.
The isolated Java structural reference harness lives under `util/owlapi-reference/`; it is development evidence, never a production runtime dependency.

The original [Python and Markdown quality tooling plan](plans/2026-09-29-python-markdown-quality-tooling.md) retains its baseline and preservation requirements.
Follow the [contributor guide](../CONTRIBUTING.md) and [npm command guide](development/npm-scripts.md) for the current root-installed Markdown and JSON tools.
The [delivered centralization plan](plans/markdown-quality-centralization.md) retains the historical archive-isolation and shared-qualification design.

Delivery records live under `migration/`.
Historical lesson records preserve evidence; `migration/parser-migration-playbook.md` is the concise current method.

## WebVOWL implementation history

These phases record work in the original WebVOWL staging tree.
Use the [installation guide](../README.md#install) for the standalone package.

Phases 1 through 5 provide the independently authored structural model, factory, ontology, manager/loading foundation, source/configuration/error contracts, parser-selection infrastructure, RDF/JS dataset boundary, and the complete Functional Syntax, Manchester Syntax, OWL/XML, dataset graph-policy, and shared RDF-to-OWL migrations with their conformance, differential, resource/performance, provenance, and learning-gate evidence.

Phase 6 adds the RDF/XML adapter and the first-real-adapter hardening.
Phase 7 adds `VOWLBuilder`, the WebVOWL import resolver, and an explicitly development-only invocation seam, with exact Java and legacy differential evidence.

Phase 8 switched production WebVOWL ontology loading to the `owlapi-js` staging tree and closed at `136a62a`.
The cutover removed the development seam and runtime legacy fallback.
The legacy parsers, `ontologyConverter.js` and `jsonExporter.js` remained unmoved through Phase 17 for finite characterization work and were proven unreachable from production by `src/productionGraph.architecture.test.js` and bundle inspection.

All 44 advertised corpus documents load through the production entry, and the corpus differential required by sections 17.15 and 18.8 now runs that entry rather than the pre-cutover pipeline, with every remaining difference justified per dimension in `compatibility/production-corpus-differences.json`.

Phase 9 adds strict Turtle through one private, exact-format N3.js adapter.
The dependency is loaded only after exact RDF syntax selection and emits only project-owned canonical RDF/JS values and errors across the seam. All 387 independently classified W3C RDF 1.1 and RDF 1.2 Turtle entries pass, N3-only constructs stay rejected, RDF 1.2 triple terms reach the explicit OWL reconstruction boundary, prefixes remain immutable document metadata, and direct/imported Turtle flows through the production WebVOWL entry.

Phases 10 and 11 add independently authored structural DL Syntax and KRSS2 parsers.
Phases 12 and 13 extend the same private N3.js boundary with distinct strict N-Triples and N-Quads identities.

All 99 independently classified N-Triples entries and all 114 independently classified N-Quads entries from the W3C RDF 1.1 and RDF 1.2 suites are independently classified and all REQUIRED entries pass.
N-Triples normalizes every statement to the default graph; N-Quads and TriG preserve complete dataset graph terms and apply the configured graph policy only before shared RDF-to-OWL reconstruction.

TriG additionally preserves Turtle-style prefixes and base resolution.
Selected graphs and explicit graph loss remain document context rather than OWL axiom state.
Turtle, N-Triples, N-Quads, and TriG share only private syntax machinery and the project-owned RDF/JS-to-OWL publication seam.

The broader N3 language remains unregistered.
Phase 18 physically deletes the already production-unreachable legacy files without changing this ingestion graph.
Entry-aware production chunking and a post-build static-import-closure verifier prove that N3.js remains outside the application's initial graph.

Phase 14 completes strict TriG, Phase 15 completes JSON-LD ingestion through Digital Bazaar `jsonld.js`, Phase 16 completes the exhaustive shared OWL-to-RDF translator, and Phase 17 completes the distinct original KRSS/KRSS1 parser.
KRSS1 and KRSS2 now use separate adapters over bounded shared machinery; generic `.krss` ambiguity is KRSS1-first while exact `.krss2` and KRSS2-only vocabulary remain KRSS2.

The strict provenance review found zero qualifying public first-party historical KRSS1/KRSS2 ontology artifacts, so project grammar fixtures, adjacent dialects, extended-KRSS negatives, converted real ontologies, and any future qualifying historical corpus remain separate evidence classes.

Phase 18 removes the pre-cutover parser/converter/exporter stack and its legacy-only executable differentials.
The production corpus gate, pinned Java OWL2VOWL fixtures, and all current `owlapi-js` parser evidence remain.
Provenance schema v4 retains deleted-artifact history and approved revision-bounded reuse decisions while distinguishing them from the live source inventory.

Phase 19 extracted the accepted Phase 18 source into the sole canonical `Hadden-Industries/owlapi` repository; its original unscoped alpha remains historical evidence.
The amended publication work first shipped the scoped rc.1 package with Phase 21/22 lifecycle capabilities; the release-status link above identifies the current successor.
Phase 20 retains the later stable `0.1.0` library release and WebVOWL's later adoption of that stable version.

UO and WebVOWL may each use the public RC in production after their own full acceptance without waiting for Phase 20; normal deployment authorization still applies.
The Public API Surface Registry created during extraction is the package/type gap map against pinned Java OWLAPI.

Except for the curated package-root aggregate (consumer alias `owlapi`), every public npm subpath must map exactly to a separately approved `org.semanticweb.owlapi` package.
Each public binding has one canonical definition in that Java-shaped source namespace, while private engines use cohesive, non-mirrored `internal/` directories.
The staging RDF barrel is not a published `owlapi/rdf` API.

ADR 0002 prioritizes the shared RDF-to-OWL foundation, RDF/XML, early development-app integration, production cutover, and strict Turtle before the remaining parser programme.
The historical ingestion phase table and current publication-plan pointer are recorded in `migration/migration-status.md`.
No next phase begins until the preceding phase passes its gate, receives its requested Git checkpoint, and the repository owner explicitly instructs the implementation to proceed.
