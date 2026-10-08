# OwlAPI Markdown centralization

OwlAPI adopts the producer's current public contracts from source commit `47febbe1b6f3282814e77db7ea13eac72b4928ed` and its exact transported core and native archives.
The manifest version remains 1.0.3; the published registry package does not contain these contracts.
Release status is not the adoption gate.
The isolated lock records the retained archive integrities and installs with lifecycle scripts disabled.
Application dependencies and the OwlAPI tarball do not include this development graph.

## Consumer commands and policy

`npm run install:markdown` acquires the reviewed isolated graph.
`lint:md`, `format:md:check`, `format:md` and `inspect:md` invoke its installed public bins from the repository root.
They do not acquire missing packages or use a global fallback.
Full requests reconcile the Git-tracked Markdown inventory; explicit requests retain their declared scope.
`npm run qualify:md -- profile --root .` reads the producer-owned execution profile.
Candidate qualification uses that same bin's `candidate` operation with explicit trusted inputs and an external fresh output directory.
See the installed [producer contracts](https://github.com/Hadden-Industries/markdown-quality/blob/47febbe1b6f3282814e77db7ea13eac72b4928ed/docs/centralized-contracts.md) for its supported arguments.

Schema 2 `.markdown-quality.json` is the sole Markdown policy authority.
The translation preserves the independently captured 68 selected and 11 excluded tracked documents at the cutover baseline.
The consumer test reconciles native Git paths against actual package selection and a reviewed literal exclusion list, rather than trusting counts.
Ignore files retain their Git and non-Markdown formatter roles; changing them cannot suppress Markdown findings.

Exclusions cover dependency/virtual-environment/cache/report directories, generated conformance output, pinned upstream conformance documents, provenance reconstruction, generated API documents and Java reference fixtures.
The two dated Phase 19/20 review filenames use picomatch literal bracket classes `[[]` and `[]]`.
Backslash escapes are not accepted by the new relative-pattern contract.
Their exact exclusions are independently exercised through tracked inventory and supplied-document processing.

The new defaults emit informational long-prose-line and heading-punctuation advisories.
These remain in complete JSON; successful advisory results are accepted only after the public semantic validator passes.
The implementation plan emits more than the default 1,000 findings per document.
Both policy and trusted profile therefore allow a finite 10,000 per-document diagnostics while retaining the producer's 10,000 aggregate findings and 4 MiB diagnostic-byte defaults.
No unlimited corpus-harness override is carried into the consumer.
Four selected documents required formatting under the new defaults; their changes use the canonical formatter.
The unrelated performance-plan working edit remains outside this change.

## One trusted profile and shared workflow

`.markdown-quality-execution.json` owns six samples, 30,000 ms checker latency, a 180,000 ms window and 512 MiB observed memory.
It also bounds Node old space, framing, staging and analyzer limits.
`.node-version` declares 24.21.0; the existing `.python-version` declares 3.14.7.
The isolated core/native archives and lock are explicit trusted inputs.
Changing a runtime, policy, profile, lock or archive invalidates its qualification identity.

The owner-dispatched workflow calls the producer workflow at the same full source SHA.
It takes separate exact trusted bootstrap and candidate commits, grants only contents-read, and forwards no secrets.
OwlAPI governance accepts only that closed caller and rejects floating/wrong revisions, candidate trust, write permissions, inherited secrets, executable steps, skipped qualification and extra inputs.
Producer-owned Windows/Linux jobs perform acquisition, staging, process observation and receipt retention.
The five former copied checker/observer/probe/runner files are retired together, without aliases or fallbacks.

Windows reports cumulative Job peak committed bytes including the Python driver and requires descendant completion.
Linux samples process-group RSS every 50 ms plus scan overhead, excludes Python and counts shared pages per process.
The metrics differ and Linux can miss short peaks; six samples do not establish a population tail or an enforced OS memory limit.
Hidden staged inputs are not promised by artifact upload defaults; retain immutable Git identities and trusted overlay inputs for reconstruction.

## Independent acceptance and delivery

Consumer tests use the installed exported API/result validator and metadata-resolved bins.
They preserve independent Git/scope, non-Markdown local-link, excluded-byte and no-write oracles.
KaTeX dependency-security probes, application tests, release/provenance checks and existing CI floors remain independent.
OwlAPI has no generated-policy helper to migrate; Java API freshness remains its existing generator's obligation.

The UO preparation established useful public-bin/schema and logical-path techniques.
Its later adoption demonstrates the shared contracts, but its trusted inputs, 1,024 MiB budget, governance exceptions and receipts do not accept OwlAPI.
OwlAPI retains its own 512 MiB target and required completion checks.

Cutover acceptance requires review of this exact policy/bootstrap, owner acceptance of the immutable trusted inputs, local full HISEW qualification, both hosted OS positive windows, and a real missing-link negative whose candidate policy/profile/scripts cannot suppress the finding or execute code.
Bootstrap/operational failure is not that negative proof.
Review, local qualification, source publication, hosted qualification and protected-main delivery are separate evidence identities.
No passing or delivered state is implied by this implementation document.
