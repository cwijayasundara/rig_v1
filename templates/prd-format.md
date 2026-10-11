# PRD format (one file per sprint: .rig/product/prd/sprint-<N>.md)

Written by the product owner and the BA. Ids are stable across sprints: FR-3 means the same requirement in sprint 1 and
sprint 4; a removed requirement keeps its id retired and listed under ## Changes since last sprint. Every acceptance
criterion must be testable; every NFR must have a number. Headings are spelled exactly as below (rig reads them).

```
---
product: <name>
sprint: <0 | N>
status: draft | accepted
owner: <product owner>
contributors: [<BA>, <architect>, <test lead>]
---
# PRD: <product>, sprint <N>

## Context and problem
Who hurts today, how, and the evidence (data, quotes).

## Goals and success metrics
| ID | Goal | Metric | Baseline | Target | How measured |
|---|---|---|---|---|---|

## Non-goals
Out of scope for this sprint.

## Users and personas
Persona, job to be done, frequency, access level.

## Functional requirements
### FR-1: <name>
- Need: one sentence, in the user's words
- Acceptance criteria: Given / When / Then, each one testable
- Priority: must | should | could
- Depends on: FR-x, NFR-y, an external system
- Delta: new | changed since sprint <N-1>

## Non-functional requirements
| ID | Category | Requirement | Target | Verified by |
|---|---|---|---|---|
| NFR-1 | performance | <what> | <number and unit> | <test level or sensor> |

Categories: performance, availability, scalability, security, privacy and compliance, accessibility, observability,
cost, operability (deploy, rollback).

## Data
Entities, sources, retention, personal-data classification, migration of existing data.

## Integrations and constraints
External systems and APIs, mandated stack, hosting, regulation, budget, deadlines.

## Release and rollout
Environments, feature flags, rollout plan, rollback trigger, who owns the production gate.

## Risks and assumptions
| ID | Risk or assumption | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|

## Changes since last sprint
Requirements added, changed or retired since sprint <N-1>, each with its id and why. Sprint 0: none.

## Open questions
none
```
