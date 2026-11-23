# Test plan (.rig/product/sprints/sprint-<N>/testplan/plan.md)

<!-- Written by the QA lead from the PRD and the sprint's intents. -->
<!-- How to write these files: with Write and Edit, read with Read, one plain command per Bash call. No cd, pipe, &&, loop, heredoc or script: an unattended run denies a compound command, and each denial costs a turn. -->

## Strategy

<!-- Levels (unit, contract, integration, acceptance, perf, security, manual) and what each one proves. -->

## Environments and data

<!-- Where tests run. Test data is synthetic, never real personal data; files live under .rig/product/sprints/sprint-<N>/testplan/data/. A case that depends on how a value is written, not only on its value (`8.0` against `8`, `8.500`, `1e1`, `NaN`, a duplicate key, a body that is not valid JSON), keeps each request body as a raw string in its data file (`{"raw": ["{\"quantity\":8.0}"]}`): parsed JSON cannot hold the spelling, so `8.0` would be stored as `8` and the case would test nothing. Data exercises the boundary its case names: a case about inner spaces has an inner space, and "no upper limit" has a value past 2**64. -->

## Entry and exit criteria

## Regression scope

<!-- What must still pass when this sprint merges. -->

# Test cases (.rig/product/sprints/sprint-<N>/testplan/cases.md)

<!-- One row per case. Requirement: one or more FR/NFR ids and the requirements.md ids the case proves (FR-4, AC-4.1); every rule and answer row of requirements.md gets a case, or its id in the Requirement column of the case that already asserts it; every row names an FR or NFR id beside any DR or AC id. Intent and Behaviour: an intent slug and its B-number. Data: a path under .rig/product/sprints/sprint-<N>/testplan/, such as data/cart.json, or -. Access: `<action>: allowed <interface>` or `<action>: refused <interface>` for a case testing a row of architecture.md ## Access, else -. Each such row of this sprint's intents gets one allowed and one refused case per interface (refused only, for nobody). Rows stay in ID order: a case added in a fix round takes the next free ID and goes at the end. A case that checks imports (an `ast` layer test) names what is forbidden (a layer's modules, I/O modules), never "imports only X": standard-library helpers such as `typing`, `dataclasses` or `from __future__` must stay allowed. -->

| ID | Requirement | Intent | Behaviour | Level | Data | Expected | Access |
|---|---|---|---|---|---|---|---|
<!-- In the two-gate pilot, use Level holdout for critical behaviours that require independent CI evidence. Name the observable result in Expected and supply the matching non-empty case file. CI uses the base branch's case list and executes the case files against the candidate revision. -->
<!-- Holdout cases: for each case the QA agent also writes one executable black-box test in .rig/product/sprints/sprint-<N>/holdout/, named by case id and stack: node and angular `TC-3.holdout.test.js` (run with `node --test {file}`); python `test_tc_3_holdout.py` (pytest); compiled stacks (go, rust, dotnet, java-maven, java-gradle) `TC-3.holdout.sh`, run with `bash {file}`, exercising the built binary, CLI or HTTP endpoint (any name starting `TC-<n>` or `test_tc_<n>` gives case id TC-<n>). It exercises the public interface only (CLI, HTTP, contract files), never an internal module, and calls only the interfaces of its case's intent and that intent's depends (a case that needs a later intent's route belongs to that later intent), and runs with the repo root as its working directory, from a read-only temp copy of the file. The builder never sees these files: while the sprint's chart is approved a hook denies reading them (a guardrail; CI is the check); `sdlc verify` runs them and rig-check runs every case file of the base branch. Any PR touching holdout/ is tier 2. Limit: code under test runs as the same user as its caller and can read the caller's files and process; full isolation needs a separate user or container. Windows needs a POSIX shell (Git for Windows bash). -->

| TC-1 | FR-1 | <slug> | B1 | unit | - | <observable result> | - |
