# Implementing the four 2026-11-14 proposals: one order

2026-11-14. Sources:
- `2026-11-14-path-to-production-and-adoption.md` (Phases 0–5)
- `2026-11-14-two-human-gates.md` (G0–G4)
- `2026-11-14-inner-loop-from-poteto-mode.md` (P0–P3, N1–N6, R1–R2, D1 model pairs)
- `2026-11-14-frontend-design-in-the-loops.md` (U0–U3)

## Rules for every wave

- **One wave is one branch, one plan and one PR to main** (superpowers: `writing-plans`, then `executing-plans`), followed by
  `npm test` once and one Opus review of `git diff main...HEAD`. Budget: at most 4 launches, 45 minutes and $8 (CLAUDE.md).
- **Every item gets a spec that fails without it.** The "spec" column of each proposal's order table is the acceptance test.
- **Size cap.** The harness is about 12,745 of 13,000 lines. W1 fits inside that. W2 and later need either a cap raise, which the
  maintainer grants by being asked, or offsetting deletions. The decision is due before W2.
- **Measure before arming.** The eval waves (W0, W3) decide whether the later waves ship on by default or as eval arms.

## Waves

| Wave | Items | Why here | Exit |
|---|---|---|---|
| W0 | Prod Phase 1 eval set, plus poteto P0 traps and frontend U0 UI task, bare arms only | Nothing has shown a lift yet (GOAL.md). The traps must escape bare Claude Code, or the later waves cannot be measured | At least 2 traps escape the bare arm |
| W1 | Poteto N5 (DONE / CONCERNS / BLOCKED), N6 (tokens and minutes per launch), D1 model pairs (`S models`), D2 launch budget; two-gates G0 (review trigger, waiver requests) | Cheap and deterministic. N6 is needed to measure anything after this | Specs green; one scripted journey records its cost per launch |
| W2 | G1 `plan-check` with its CI recompute; poteto N1 (each behaviour proved by a journey step or holdout), N3 (deterministic stand-ins) | The core of "scripts decide" once the per-change approval goes | A contract edit on a change PR blocks in CI |
| W3 | Rig arms on the W0 set: rig today against W1+W2, Haiku-light against Sonnet-light | The kill rule (prod D4) and the D1 check | Escaped defects per dollar, per arm |
| W4 | G2 chart as a PR (`chart seal`); G3 plan review as an `ai-review` veto, draft PR on a stop; poteto N2 (scale cases from a QA generator), N4 (interface table) | Gate 1 becomes a PR, and the chart gains its scale and interface artefacts | One approved chart PR is gate 1 |
| W5 | Poteto R1 (local review on every change), R2 (second family in CI); G4 (`SDLC_HUMAN` gone, rung 2 fixed) | The review cause, measured against W3 | The scripted journey has exactly 2 human acts per change |
| W6 | Frontend U1 to U3 (Experience, designer at chart, `kind: ui`, React + Vite pack, a11y / states / contract-client sensors) | The largest piece, and it builds on gate 1 being a PR | The UI eval task passes on the rig arm |
| W7 | Prod Phase 2 (`sdlc map`, `sdlc impact`, brownfield), then Phases 4–5 | Brownfield needs the map; adoption needs a measured lift | Per the production doc |

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
    - **The refund-policy escape (`rule`):** the rule lives only in an integration test that `npm test` skips. No rig sensor runs
      that test, and the spec and plan phases did not look for existing tests that constrain the code they change.
    - **Run 1 stopped at approve:** the approve gate refused because open questions were left in the spec.
    - **One brownfield run was invalid (`sleep`):** it was retried once and then passed.
