---
product: cart
sprint: 1
status: accepted
owner: Pat (product owner)
contributors: [Bea (BA), Ari (architect), Tess (test lead)]
---
# PRD: cart, sprint 1

## Context and problem
Shoppers cannot keep items while they browse.

## Goals and success metrics
| ID | Goal | Metric | Baseline | Target | How measured |
|---|---|---|---|---|---|
| G-1 | Shoppers build a cart | carts with 1+ item per session | 0 | 30% | analytics |

## Non-goals
Payment, accounts.

## Users and personas
Shopper, several times a week, anonymous.

## Functional requirements
### FR-3: Remove an item
- Need: I take an item back out
- Acceptance criteria: Given a cart with tea and cake, when I remove tea, then only cake remains and the total is 3.50
- Priority: must
- Depends on: FR-2
- Delta: new

## Non-functional requirements
| ID | Category | Requirement | Target | Verified by |
|---|---|---|---|---|
| NFR-2 | correctness | totals never drift after removals | exact cents | acceptance case |

## Data
Cart lines in memory; no personal data.

## Integrations and constraints
Node, no external services.

## Release and rollout
Local only.

## Risks and assumptions
| ID | Risk or assumption | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R-1 | prices as floats round badly | medium | medium | integer cents | Ari |

## Changes since last sprint
FR-3 and NFR-2 added: shoppers asked to undo an add. FR-1, FR-2 and NFR-1 unchanged (sprint 0).

## Open questions
none
