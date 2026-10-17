# Eval results 2026-10-17: the intent brief's Design and Failure behaviour sections

Question: does asking the architect for `## Design` and `### Failure behaviour` (Jain's responsibilities table and resiliency rules) make it specify more failure cases, without hurting the chart? `npm run eval:chart`, arm `architect-opus`, 3 runs per side, same PRD (`eval/fixtures/chart/sprint-a.json`). `main` is the arm run from a worktree of main (old templates and architect text); `brief` is branch `feat/intent-brief-design`. Source: eval/results/2026-10-17-chart-brief.jsonl. Both sides were rescored from their saved intent files with the branch parser.

| side | recall | invented | size ok | design rows | failure heading | behaviours (mean) | failure cases (mean) | unknown SKU answered | intent lines (mean) | USD (mean) |
|---|---|---|---|---|---|---|---|---|---|---|
| main | 1 | 0 | 1 | 0/3 | 0/3 | 14.0 | 9.3 (7, 12, 9) | 2/3 | 160 | $1.09 |
| brief | 1 | 0 | 1 | 3/3 | 3/3 | 22.7 | 16.0 (14, 20, 14) | 3/3 | 204 | $1.29 |

"Failure cases" counts behaviours whose text names a 4xx/5xx status, unknown, invalid, throws, refuses, rejects, error, timeout, not found or missing, whatever heading they sit under, so the `main` side is not zero by construction. "Unknown SKU answered" asks whether a boundary intent states the response for an unknown SKU.

Reading:
- Failure cases specified: +72% (9.3 → 16.0), with no loss in recall, invented intents, size or dependencies. Every added behaviour cites a PRD requirement.
- Cost: chart +18% ($1.09 → $1.29) and intents +28% longer. Downstream, more behaviours means more tests per change; this eval does not measure the build.
- Padding: the prompt asks for timeouts, and a synchronous handler with nothing to time out got a "no timeout of its own" line (not an observable behaviour) plus an "a body on GET is ignored" line.
- n = 3 per side and a keyword count, so this shows direction, not size. The study this copies (Jain) measured the whole harness, not the brief; whether the extra failure cases raise acceptance needs the build eval (`npm run eval`) on a boundary intent.
