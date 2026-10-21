# Node consumer qualification

The consumer support policy admits Node.js 22 or newer.
Official support follows the maintained families in [runtime-policy.json](runtime-policy.json); other release lines receive best-effort support.
The package engine range is generated from the lowest family minimum, while the same policy separately drives the maintained-family qualification matrix and producer runtime selections.

[CI run 39578970882](https://github.com/Hadden-Industries/owlapi/actions/runs/39578970882) passed on 21 October 2026 for source commit `795e2a5925ba217cdcc180f3fe6371cb8b1417d0` in [PR #82](https://github.com/Hadden-Industries/owlapi/pull/82).
All 40 CI jobs and all 43 PR checks passed.
The frozen consumer matrix qualified the retained package through scoped and npm-alias installations on Linux x64, Windows x64 and macOS arm64 at these observed runtime versions:

| Node family | Minimum | Latest released patch |
| ----------- | ------- | --------------------- |
| 22          | 22.0.0  | 22.23.3               |
| 24          | 24.0.0  | 24.22.0               |
| 26          | 26.0.0  | 26.12.0               |

These 18 passing lanes, including product source behavior on Linux, justify broadening the consumer engine declaration.
Odd-numbered and future releases remain best-effort; this run does not claim they were tested.
These versions are historical observations; the editable current versions remain in the runtime policy, and CI and release workflows freeze a fresh matrix for each candidate.

This run precedes the metadata change to the open-ended engine range.
It does not qualify later candidate bytes, publish a package, establish human rights review, or admit HISEW verification receipts.
Release qualification and human acceptance remain required for any release candidate.
