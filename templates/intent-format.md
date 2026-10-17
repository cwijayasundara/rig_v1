---
sprint: <N>
prd: [FR-1]
depends: []
estimate_days: 1
kind: internal
owner:
status: draft
---
# <Intent title>

<!-- One intent is a small piece of work an engineer finishes in 1 to 2 days: code, tests, regression, PR. Bigger? Split it. Every behaviour cites the PRD requirement it serves; an intent no requirement asks for is not written. -->

## Intent

<!-- Why, who has the problem, what done looks like. At most 15 lines. -->

## Non-goals

<!-- Phrase each as a prohibition, for example: "Do not add operations not listed under Interfaces." -->

## Interfaces

<!-- kind: boundary (adds or changes an HTTP, message or downstream interface): one line each, `Contract: <file>` and `Example: <file>`, with exact statuses, headers and numbers in the contract. kind: internal: write none. -->

## Behaviours

<!-- - B1 (FR-3): one observable behaviour, stated from outside the system -->

## Tests required

<!-- Per behaviour: the level (unit, contract, end-to-end) and the file that will hold it. -->

## Open questions

none
