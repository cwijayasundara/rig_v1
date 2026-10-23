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

<!-- One row per case. Requirement: one or more FR/NFR ids. Intent and Behaviour: an intent slug and its B-number. Data: a path under .rig/product/sprints/sprint-<N>/testplan/, such as data/cart.json, or -. Access: `<action>: allowed <interface>` or `<action>: refused <interface>` for a case testing a row of architecture.md ## Access, else -. Each such row of this sprint's intents gets one allowed and one refused case per interface (refused only, for nobody). -->

| ID | Requirement | Intent | Behaviour | Level | Data | Expected | Access |
|---|---|---|---|---|---|---|---|
| TC-1 | FR-1 | <slug> | B1 | unit | - | <observable result> | - |
