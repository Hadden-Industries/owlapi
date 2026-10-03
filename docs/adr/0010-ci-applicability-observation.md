# Observe integration inputs while preserving full qualification

- Status: Accepted implementation scope on 2026-10-03; selective execution and Java artifact consumption remain inactive.
- Authority: Maksym Shostak's request to implement the [input aware CI plan](../plans/2026-10-03-ci-input-aware-qualification.md) using HISEW, in the existing checkout, with Claude Code independent reviews.

## Decision

Deliver the independently useful dependency-review installation removal and a bounded observation preamble in the existing Node 24 job.
The remaining dependency-review commands use Node built-ins; the pinned Action runs its own bundled implementation.
The isolated test exercises the actual npm entry points without repository dependencies, retains npm in the runner record, and rejects a deliberately introduced missing package import.
Metadata still installs its dependencies because its entry point imports `semver`.

The observer compares the event's captured base with the exact tested merge commit after checking repository, ref, parent and checkout identity.
Native Git supplies complete NUL-delimited paths with rename detection, external diff and text conversion disabled.
Each Git read has a ten-second limit, the complete observation has a thirty-second command budget, and each output is limited to four MiB.
Missing objects, invalid context, unfamiliar input, malformed records and exhausted bounds retain required execution.
Java and WebVOWL currently use the same conservative tracked-input inventory, with separately identified fingerprints and reported results.
Both projections include every tracked input except the two exact retained Phase 19/20 review narratives listed in `APPLICABILITY_POLICY`.
The native npm package excludes these narratives; the source-quality suite refers to their names for ignore-policy checks, while the Java and WebVOWL readers do not consume their content as an oracle or accepted policy.
Shipped documentation, requirements, fixtures, executable documentation and governing records remain inputs.
Symlink or executable replacements of excluded narratives remain inputs.

Preliminary `UNCHANGED_INPUTS` describes only the tracked projection.
Final applicability is always `REQUIRED`, with proof `UNAVAILABLE` and execution `PENDING` at this preamble.
The record has observation schema version 1; it is not a qualification receipt or a passed test.
No workflow output consumes its decision, and it never authorizes omission.
The initial milestone retained the schema-v1 FULL receipt and authenticated ordinary-main reuse contract.
[ADR 0011](0011-full-ci-qualification-lineage.md) subsequently coordinates the schema-v2 FULL-only transition without enabling selective execution.
This candidate-sourced diagnostic does not claim independently enforced base-control execution.
Non-file environment, package and consumer-graph equivalence, base qualification and original-execution proofs remain prerequisites for any later selection.

No full-PR clause is superseded in this milestone.
The full-PR clauses in the 2026-09-29 reuse plan, the Python/Markdown quality plan, CONTRIBUTING and implementation-plan sections 2.56/2.58 remain binding.
The dependency-review job's redundant installation is the only changed installation recipe.
Release, maintenance, extended tests, CodeQL, required job identities and security thresholds retain their existing contracts.

## Experiments and activation limits

Readback of ruleset 21687258 on 2026-10-03 still requires `CI / required` from GitHub Actions application 15368, zero ordinary approving reviews and review-thread resolution, with the owner's PR bypass.
Candidate YAML plus candidate tests cannot independently enforce their own execution.
GitHub's native alternatives are protected independent review or a separately governed ruleset workflow; either requires a separately approved authority arrangement, including bypass handling.
The present plan does not authorize repository settings changes.
[GitHub ruleset controls](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets).

A bounded sample of the 19 merged PRs returned by a twenty-PR query on 2026-10-03 found a known relevant input in every PR.
Five returned file inventories reached 100 entries; these partial inventories cannot prove eligibility, but their observed relevant files already prevent omission.
This sample establishes zero observed opportunities under this narrow exclusion inventory, not a universal hit-rate prediction or latency improvement.
Broader exclusions need their own reader and package proofs; the inventory must not expand merely to manufacture hits.

A local, isolated build of the pinned Java source succeeded with Maven 3.9.15, Temurin 25.0.4.1 and dependency plugin 3.11.0.
Maven's native `mdep.localRepoProperty` generated 63 ordered runtime entries: 55 local-repository entries with the literal selected prefix and eight absolute reactor JAR paths.
It does not relocate the reactor or resolve the literal prefix for the JVM.
The local relocation probe copied exactly those JARs, preserving order and validating their SHA-256 digests; their total size was 21,109,948 bytes.
The relocated reference, with an empty Maven home, produced the same Phase 2 structural snapshot as both the original native classpath and the independently retained fixture.
The fixture's declared import was ignored exactly as recorded in its existing provenance.
This is one Windows fixture experiment, not complete closure, hostile-bundle, cross-image, hosted transport, license or production-oracle qualification.
No shared Java artifact was uploaded or consumed.
[Maven native prefix contract](https://maven.apache.org/plugins/maven-dependency-plugin/build-classpath-mojo.html#localRepoProperty).

Selective activation remains deferred until enforceable authority, useful workload opportunities and complete input-equivalence evidence exist.
The coordinated FULL-only schema-v2 writer/reader/main-record foundation is described in ADR 0011; it does not clear those activation gates.
Java bundle production and cross-run reuse remain deferred until the complete build/environment/rights inventory, hostile-bundle validation, cold-seeding and hosted comparative gates pass.
The existing WebVOWL harness installs and tests its baseline before injecting and reinstalling the candidate; graph preparation has not been independently established as a cheap equivalent boundary, so its qualification remains unconditional.
These are the plan's named deferral consequences, not waived acceptance criteria or completed slices.

## Recovery and ownership

Remove the observation preamble to stop collecting diagnostics; full integration coverage remains intact.
Restore dependency-review installation only if its entry points acquire a repository dependency, retaining the no-installation negative fixture as the detection boundary.
The owner remains the operator and activation decision-maker; Claude Code is the selected independent reviewer and verifier for the delivered implementation.
Native review and HISEW verification evidence stays in its evidence stores.
The task-owned ignored Java experiment directory is retained for review and the rights/build-policy decision; reassess it when that decision or this branch's disposition is settled.
