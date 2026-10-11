# Architecture format (.rig/product/architecture.md and .rig/product/adr/)

`architecture.md` is the intended architecture, refreshed each sprint by `/rig:architecture`; the wiki's
`.rig/wiki/architecture.md` is the as-built one. At most 200 lines, **no implementation code** (sketches of 10 lines or
fewer, signatures only). Every NFR id appears under `## Quality attributes`.

```
---
sprint: <N>
updated: <YYYY-MM-DD>
---
# Architecture: <product>

## Context
The system, its users and the external systems it talks to (a Mermaid C4-context or flowchart, 15 lines or fewer).

## Building blocks
Containers and modules, one line of responsibility each, and the direction of dependencies (domain ← application ← adapters).

## Data
Entities, ownership (which module writes each), storage, retention.

## Integrations
Each external system: protocol, contract owner, failure behaviour.

## Quality attributes
| NFR | Tactic | Where | Verified by |
|---|---|---|---|

## Deployment
Environments, how a change reaches production, rollback.

## Decisions
| ADR | Title | Status |
|---|---|---|

## Concerns
- [drift] <intended vs as built> → owner: <name>
(or `none`; a concern blocks the chart approval until it carries ` → resolved: <decision> (<owner>)`)

## Open questions
none
```

ADR, `.rig/product/adr/NNNN-<kebab>.md` (next free number, four digits). An accepted ADR is never edited except its
`status:` line, which becomes `superseded-by NNNN` when a later ADR reverses it.

```
---
status: proposed | accepted | superseded-by NNNN
sprint: <N>
---
# ADR NNNN: <decision>

## Context
## Decision
## Consequences
## Open questions
none
```
