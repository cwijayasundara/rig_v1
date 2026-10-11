# Test plan format (.rig/product/testplan/)

Written by the test lead (`/rig:testplan`). Every FR and NFR id of the PRD has at least one case; each case names the one
intent whose change makes it pass. Data is synthetic: never real personal data.

`plan.md`:

```
---
sprint: <N>
---
# Test plan: <product>, sprint <N>

## Scope
## Levels
Which level covers what: unit, integration, acceptance, api, perf, security, manual; and the command each runs with
(must match `levels` in .rig/sensors.json).
## Environments
## Test data
What is under data/, how it is loaded, how it is reset.
## Entry and exit criteria
## Open questions
none
```

`cases.md`: one table, one row per case. `Requirement` lists PRD ids; `Intent` is an inbox name without `.md`; `Data`
is a path relative to `.rig/product/testplan/` or `-`; `manual` cases say why in `Expected`.

```
| ID | Requirement | Intent | Level | Data | Expected |
|---|---|---|---|---|---|
| TC-1 | FR-1 | <intent-name> | acceptance | data/<file>.json | <observable result> |
```

`data/`: small fixtures and seed scripts, one file per data set, named after what it holds.
