---
product: cart
sprint: 0
status: accepted
owner: Pat (product owner)
contributors: [Bea (BA), Ari (architect), Tess (test lead)]
---
# PRD: cart, sprint 0

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
### FR-1: View the cart
- Need: I see what I picked and the total
- Acceptance criteria: Given two items, when I open the cart, then I see both and their total
- Priority: must
- Depends on: none
- Delta: new

### FR-2: Add an item
- Need: I put an item in my cart
- Acceptance criteria: Given an empty cart, when I add a 3.50 item, then the cart holds it and totals 3.50
- Priority: must
- Depends on: FR-1
- Delta: new

## Non-functional requirements
| ID | Category | Requirement | Target | Verified by |
|---|---|---|---|---|
| NFR-1 | performance | adding an item | under 50 ms in-process | perf case |

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
none (sprint 0)

## Open questions
none
