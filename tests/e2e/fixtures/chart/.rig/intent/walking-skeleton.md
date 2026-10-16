---
status: draft
author: Pat (product owner) via rig:decompose
created: 2026-10-15
sprint: 0
cluster: shop
owner:
depends: []
prd: [FR-1, FR-2, FR-3, FR-4, NFR-1, NFR-2, NFR-3]
type: feature
---
# Intent: Walking skeleton: the whole shop, one slice

## Problem
There is no shop code at all.

## Proposed outcome
Catalog, cart, checkout and the HTTP-style handler work end to end per the sprint-0 PRD, with tests.

## Affected users and systems
Shoppers and sellers; the new catalog, cart, orders and http modules.

## Constraints
Integer cents (ADR 0001). Deleting a cart line is a non-goal this sprint.

## Open questions
none
