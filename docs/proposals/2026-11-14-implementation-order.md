# Implementing the four 2026-11-14 proposals: one order

2026-11-14. Sources:
- `2026-11-14-path-to-production-and-adoption.md` (Phases 0–5)
- `2026-11-14-two-human-gates.md` (G0–G4)
- `2026-11-14-inner-loop-from-poteto-mode.md` (P0–P3, N1–N6, R1–R2, D1 model pairs)
- `2026-11-14-frontend-design-in-the-loops.md` (U0–U3)

## Rules for every wave

- **One wave is one branch, one plan and one PR to main** (superpowers: `writing-plans`, then `executing-plans`), followed by
  `npm test` once. No review unless the maintainer asks for one, and then of the changed lines only. Budget per CLAUDE.md: at most
  3 launches and 30 minutes.
- **Every item gets a spec that fails without it.**
- **Size cap.** The harness is about 13,500 of 15,000 lines. W6 (the map) cannot fit without offsetting deletions; the frozen
  workflow parts (below) are where they come from.
- **An eval escape decides what is built.** An item is built only when an eval run shows rig-on letting through a defect that the
  item would catch. Without one, it stays on the deferred list.

## Done (W0 to W3d)

| Wave | What landed | Result |
|---|---|---|
| W0 | `traps` eval variant, bare arms | Exit gate failed: bare caught 5 of 5 traps in 6 runs |
| W1 | N5 status lines, N6 cost per launch, D1 model pairs, D2 launch budget, G0 waiver requests | Merged `2bb6c96` |
| W2 | G1 `plan-check` and its CI recompute, N1 proof per behaviour, N3 deterministic stand-ins | Merged `08e8a95` |
| W3, W3b, W3c | Eval arms; `hard` and `brownfield` variants; `rig-on` and `rig-start` arms | rig-on 0 escapes at 1/7 to 1/10 of rig-start's cost (Results) |
| W3d | `check --at ship` blocks on an unsensed `test*` script; `/rig:start` keeps an existing test's rule; stand-in answers 2 rounds | Merged `40b4873` |

Not done from the old W3: the Haiku-light against Sonnet-light comparison (the D1 check). Not done from W0: the U0 UI task.

## Why the order changed

The old W4 to W7 were written before the rig-on result. W4 (chart PR, plan-review veto) and W5 (a review on every change, G4) add
gates and reviews to `rig-start`, the arm that cost 7 to 10 times more, took 7 to 12 times longer and was the only arm with an
escape. `docs/GOAL.md` says production ready means few escaped defects per dollar **with rig on**, and rig-on already caught every
trap on `hard` and `brownfield`. So the eval set, not the workflow, is now the bottleneck: until rig-on escapes something, there
is nothing to fix and no way to tell which new item earns its cost.

## Waves from here

| Wave | Items | Why here | Exit |
|---|---|---|---|
| W4 | Settle the arm. One `rig-start` run on `hard` to confirm W3d closes the `rule` escape (about $5). The D1 check: rig-on with Haiku and with Sonnet, 3 runs each on `hard` (about $3). Record in `docs/GOAL.md`: rig-on is the product default; `rig-start` is opt-in and **frozen** (no new gates) until an eval shows rig-on missing what it catches. Tag the release. | Cheap, and it ends the W3 loop | The `rule` trap is caught on rig-start; a Haiku-or-Sonnet default is recorded |
| W5 | A harder eval rig-on can fail: one larger brownfield variant (a repo too big to read whole, a contract with callers in other modules, a rule only a skipped suite holds), plus the U0 UI task (one endpoint and one screen, a hidden Playwright check, two traps). rig-on only, 3 runs each (about $10). | Without an escape there is no signal for W6 to W8 | At least 2 traps escape rig-on. If none do after one more variant, rig-on is production ready on the evidence: skip to W8 |
| W6 | Prod Phase 2: `sdlc map` (`.rig/map/graph.json`), the `impact` sensor at plan and ship, affected tests at turn cadence. Offset its size by deleting frozen `rig-start` code the ablation shows unused. Only if W5's escapes are blast-radius misses. | The one new capability most likely to catch what rig-on misses in a large repo | The computed blast radius covers at least 95% of the files the hidden checks show must change; kill below 80% |
| W7 | Prod section 6 sensors, one per W5 escape type: `complexity`, `dead-code`, `api-diff`, `adr-conformance`. Each needs a catch on the eval set or it is not added. Can run beside W6. | Zero tokens, and each one serves rig-on directly | Each added sensor catches a W5 escape |
| W8 | Adoption (prod Phase 5, trimmed): the floor (sensors, git hooks, `rig-check`) packaged on its own, a one-page quickstart, the public reference repo with one recorded brownfield change, marketplace submission at `--scope project`. | Adoption follows a measured result, not more features | One external repo installs it from the quickstart with no help |

## Deferred (each needs an eval escape it would catch before it is planned)

- Two gates: G2 chart as a PR (`chart seal`), G3 plan review as an `ai-review` veto, G4 (`SDLC_HUMAN` gone, rung 2).
- Poteto: N2 scale cases from a QA generator, N4 interface table, R1 local review on every change, R2 second model family in CI.
- Frontend: U1 to U3 (Experience, designer at chart, `kind: ui`, React + Vite pack, UI sensors). U0 moved into W5 so a UI escape
  can make the case for them.
- Prod Phase 4: parallel intents, the HTML gate pages, the verifier pass, the breaker on every tier. These speed up `rig-start`,
  which is frozen.

## Decisions still open (recommended defaults are used unless you say otherwise)

- **Production doc:**
  - D1: your brief as the client default;
  - D2: Opus and Fable both as arms;
  - D3: a public reference repo;
  - D4: kill if there is no lift.
- **Frontend doc:**
  - D1: install the plugin, do not vendor it;
  - D2: static HTML mockups;
  - D3: React + Vite;
  - D4: a code owner for `design/`.
- **Two-gates doc:**
  - D1: keep `gates.plan: true` as an opt-in;
  - D2: any independent approver grants a waiver;
  - D3: fix the queue at rung 2.

## Results

- **2026-11-14, W0 exit gate:** failed, so the kill rule applies (`eval/results/2026-11-14-traps-bare.jsonl`, seed 172907).
  - Bare Sonnet and bare Haiku each ran 3 times on `traps`. All 6 runs scored 47/47 with 0 of 5 traps escaped, for $1.43 in total
    (Sonnet $0.42 a run, Haiku $0.05 a run).
  - The traps were caught because their rules sit in short repo docs that the brief points to, inside a repo small enough to read
    whole.
  - W3's rig arms are not run until a harder set lets at least 2 traps through.
- **2026-11-14, the re-gate on `hard` and `brownfield` was stopped after 4 bare runs on `hard`** ($1.25, `eval/results/2026-11-14-hard-bare.jsonl`).
  The refund-policy trap escaped 2 of the 4 runs; every other trap was caught.
  - The maintainer decided that rig mode is on once rig is installed, so bare Claude Code is no longer a gate (`docs/GOAL.md`).
  - W3 now measures with rig on: the arms `rig-on` (plain prompts) and `rig-start` (the workflow), on `hard` and `brownfield`. An
    escape is a harness bug.
- **2026-11-14, rig-on vs rig-start, Sonnet, 3 runs each** (plugin `5134bd7`; `eval/results/2026-11-14-{hard,brownfield}-rig.jsonl`,
  seeds 788294 and 296724; $28.80 in total, the invalid run included).

  | Variant | Arm | Accepted | Traps escaped | $ a run | Minutes a run |
  |---|---|---|---|---|---|
  | hard | rig-on | 3 of 3 | 0 of 15 | 0.73 | 3.7 |
  | hard | rig-start | 0 of 3 | 2 of 10 (rule, twice); 1 run stopped at approve | 4.89 | 26.9 |
  | brownfield | rig-on | 3 of 3 | 0 of 12 | 0.30 | 2.1 |
  | brownfield | rig-start | 3 of 3, after 1 invalid run retried | 0 of 12 | 2.87 | 24.4 |

  - rig-on is the better arm: it caught every trap, at 1/7 to 1/10 of the cost and 1/7 to 1/12 of the time of rig-start.
  - Each rig-start gap is a harness bug:
    - **The refund-policy escape (`rule`):** the rule lives only in an integration test that `npm test` skips, and no rig sensor
      runs that test. All three rig-start specs found the test, then recommended dropping its rule as outside the brief's B15
      ("it will fail until a person waives"), and the eval's stand-in person took that recommendation.
      - Fix (W3d): `check --at ship` blocks on a package `test*` script that no sensor runs (`scripts/testscripts.ts`).
      - Fix (W3d): `/rig:start` makes an existing test's rule a behaviour. A request that contradicts the rule is an open
        question whose recommended answer keeps it.
    - **Run 1 stopped at approve:** the plan review raised a sixth question after the five answered ones. Fix (W3d): the eval's
      stand-in answers up to 2 rounds (`tests/e2e/lib/flow.mjs`).
    - **One brownfield run was invalid (`sleep`):** it was retried once and then passed.
