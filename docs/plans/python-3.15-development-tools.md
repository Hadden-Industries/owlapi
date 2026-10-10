# Python 3.15 development tooling migration

The owner requested on 10 October 2026: "Update the repo and every dev dependency to Python >= 3.15.0".
The starting main commit is `2ec835357c34e9763de8569ce83efe3dde6e3779`.
This accepts the runtime outcome, not a claim that any particular upstream tool is already compatible.

The owner subsequently requested an actual ScanCode compatibility check rather than treating upstream support metadata as conclusive.
No Python 3.14 scanner exception has been accepted.

## Outcome and constraints

- REQ-001: Development Python has a minimum of 3.15.0; reproducible qualification uses exact stable 3.15.0 initially.
  Do not impose a new upper bound without a demonstrated compatibility reason.
- REQ-002: Select compatible current stable Python development tools, regenerate their locks with the selected native resolver, and preserve interpreter, environment and archive integrity checks.
- REQ-003: Qualify the actual ScanCode options and normalized evidence used by this repository under Python 3.15.
  A version label or successful import alone is insufficient.
  Preserve old reports and distinguish unmodified upstream execution from patched or rebuilt distributions.
- REQ-004: Align applicable workflows, governance, documentation and tool provenance.
  Preserve production npm dependencies, shipped package content, original release evidence and historical approvals.
- REQ-005: Retain fresh exact-candidate verification, consolidated reviews with narrow follow-ups, and real hosted qualification before integration.
  Do not dispatch release workflows or publish packages.

## Evidence and open questions

Python.org released stable 3.15.0 on 9 October; this host has that exact interpreter.
Astral's current uv 0.13.0 and Ruff 0.17.0 support Python 3.15.
The repository currently selects Python 3.14.7, uv 0.12.20 and Ruff 0.16.9.

At initial inspection, actions/python-versions has only prerelease 3.15 manifest entries. ScanCode 32.5.0 has official archives and interpreter-specific wheels through Python 3.14. Its upstream issue5113 tracks Python 3.15 compatibility; this is a hypothesis to test for the actual OwlAPI workload, not proof that our scans fail. Native extension distributions and generated scanner indexes require actual installation/execution evidence.

## Slices and proof

| Slice                                     | Requirements     | Demonstration and integration condition                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SLICE-001: scanner feasibility            | REQ-003          | Isolated unmodified ScanCode 32.5.0 installation under 3.15; real release scan flags on representative npm/package/licence/copyright/generated/unknown-licence inputs; compare normalized outputs with a 3.14 baseline. Record installation and execution failures. Any required source patch changes the design and is reviewed explicitly. |
| SLICE-002: repository quality tools       | REQ-001, REQ-002 | Native lock regeneration, synchronized isolated environment, Python 3.15 interpreter assertion, Ruff check/format and existing quality-tool regression probes.                                                                                                                                                                               |
| SLICE-003: workflows and scanner adoption | REQ-003, REQ-004 | Exact stable interpreter availability, coherent governance and scanner bootstrap, Windows/Linux actual scanner execution and normalized parity; no invented archive hashes or renamed incompatible wheels.                                                                                                                                   |
| SLICE-004: assurance and delivery         | REQ-005          | Frozen final source, full relevant HISEW proof, consolidated ordinary/independent review and scoped specialist coverage where applicable, actual protected PR/main CI, clean synchronized main.                                                                                                                                              |

The lifecycle owner is the coordinating agent; the decision owner is Maksym Shostak.
This is R2 because changes can affect cross-system qualification and release evidence.
The initial compatibility experiment does not authorize weakening any production scanner gate.

Use upstream/native installers and validators.
Required source patches, unsupported native builds, different semantic scan options, unavailable stable CI runtimes or divergent normalized results trigger replanning before adoption.
Fixture parity is bounded evidence; complete acquisition qualification and independent review remain distinct obligations.

Rollback preserves the original locked tool declarations and scanner archives.
Temporary environments are isolated, explicitly owned and released after their consumers finish; retain reports, exact input identities and failure logs independently.
No global interpreter installation is planned.
