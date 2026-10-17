---
sprint: 1
updated: 2026-10-17
---
# Architecture

## Containers and modules

`src/catalog` gains a stock count; `src/cart` reads it; `src/http` exposes it. Dependencies point toward the catalog.

## Quality tactics

NFR-1: every error message is built with the SKU in it.

## Decisions

none yet.

## Concerns

none

## Open questions

none
