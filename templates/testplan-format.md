# Test plan (.rig/product/sprints/sprint-<N>/testplan/plan.md)

<!-- Written by the QA lead from the PRD and the sprint's intents. -->

## Strategy

<!-- Levels (unit, contract, integration, acceptance, perf, security, manual) and what each one proves. -->

## Environments and data

<!-- Where tests run. Test data is synthetic, never real personal data; files live under .rig/product/sprints/sprint-<N>/testplan/data/. -->

## Entry and exit criteria

## Regression scope

<!-- What must still pass when this sprint merges. -->

# Test cases (.rig/product/sprints/sprint-<N>/testplan/cases.md)

<!-- One row per case. Requirement: one or more FR/NFR ids and the requirements.md ids the case proves (FR-4, AC-4.1); every rule and answer row of requirements.md gets a case. Intent and Behaviour: an intent slug and its B-number. Data: a path under .rig/product/sprints/sprint-<N>/testplan/, such as data/cart.json, or -. Access: `<action>: allowed <interface>` or `<action>: refused <interface>` for a case testing a row of architecture.md ## Access, else -. Each such row of this sprint's intents gets one allowed and one refused case per interface (refused only, for nobody). Rows stay in ID order: a case added in a fix round takes the next free ID and goes at the end. A case that checks imports (an `ast` layer test) names what is forbidden (a layer's modules, I/O modules), never "imports only X": standard-library helpers such as `typing`, `dataclasses` or `from __future__` must stay allowed. -->

| ID | Requirement | Intent | Behaviour | Level | Data | Expected | Access |
|---|---|---|---|---|---|---|---|
<!-- Holdout cases: for each case the QA agent also writes one executable black-box test in .rig/product/sprints/sprint-<N>/holdout/, named by case id: `TC-3.holdout.test.js`, or `test_tc_3_holdout.py` (any name starting `TC-<n>` or `test_tc_<n>` works; the stack pack's `holdout` command runs it with {file}). It exercises the public interface only (CLI, HTTP, contract files), never an internal module, and runs with the repo root as its working directory. The builder never sees these files (a hook hides them during build); `sdlc verify` and rig-check run them, and the chart approval covers them. -->

| TC-1 | FR-1 | <slug> | B1 | unit | - | <observable result> | - |
