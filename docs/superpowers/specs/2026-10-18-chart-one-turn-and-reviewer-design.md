# Chart in one turn, with a gap pass, a test plan and an independent reviewer

Date: 2026-10-18. Status: draft for the person's approval. Builds on `2026-10-17-sprint-outer-loop-design.md` (§4 flow, §6 brief) and
`2026-10-18-journey-dashboard-design.md`. Goal context: `docs/GOAL.md` rules 3 (models advise, scripts decide) and 7 (fix the harness).

## 1. Why

The first real run (`shop_app`, sprint 1, `/rig-chart 1 docs/prd/shopping-cart-app-prd.md`) showed five faults in the harness:

1. **Gaps found late.** Four PRD ambiguities (rounding of extra decimals, TOTAL alignment, column width, how NFR-1 is measured) surfaced only after a
   5m43s architect run, then the architect was resumed. The skill's up-front question covers only missing technology and NFRs.
2. **Answers not in the PRD.** The four answers live in `architecture.md` and the intents. The sprint PRD says "Open questions: none".
3. **The human gate comes after two commands.** `/rig:chart` ends at "Next: /rig:testplan"; the person must run a second command before review.
4. **No independent review of the producers.** `chart check` is a script over structure. It passed while the architect moved five owner decisions from
   `## Concerns` (which blocks) to `## Risks and notes` (which does not), left `brief.md` an empty template, left behaviours duplicated across
   intents (corrupt-file exit 2 appears in three) and traced no acceptance criteria. The `evaluator` agent reviews only a code diff at PR time.
5. **The model in use is invisible.** `.rig/state/model.json` records each launch's resolved model; the dashboard shows only context and dollars.

## 2. Goals, non-goals, anti-goals

**Goals**
- G1. One `/rig:chart N` runs gap pass, architect, check, QA, check, review and commit, then stops at the single human gate (`/rig:approve chart-N`).
- G2. Every answer given during the chart is recorded in the sprint PRD (`(answered at chart)`), so the PRD alone is the complete requirement set.
- G3. A reviewer on a different, stronger model reads the whole chart bundle against the PRD and reports what the script cannot. Its verdict is
  committed with the chart so the approver sees it.
- G4. Generators run on Sonnet, the reviewer on Opus, and the model **version** is configurable in one place: a new release is a one-line change, not an edit of every agent.
- G5. The dashboard shows the model each agent ran on, from the existing record.
- G6. The dashboard's tokens, context and cost update live while a turn runs, not only when it starts or ends (§7).

**Non-goals**
- No separate BRD document. The sprint PRD plus its recorded answers is the business requirements document; a second file would duplicate it and drift.
- No new agent. The existing `evaluator` gains a chart mode.
- No model call in a hook. The reviewer runs inside the skill, never from a hook; scripts still decide pass or fail of `chart check`.
- No change to the single-change lifecycle (`start` to `pr`), the approval hashing, or the per-intent brief format.

**Anti-goals** (failure even if it works): a review that rewrites the PRD or the intents itself; a reviewer that blocks approval (it advises, the
person approves); a chart turn that costs more than the first run did (target: at most 4 subagent launches: architect, QA, reviewer, one fix relaunch).

## 3. The flow

```
/rig:chart N [path]     one turn
  1. Source       as today: copy the person's PRD to .rig/product/prd/sprint-N.md, ids added, text kept.
  2. Gap pass     the coordinator (no subagent) reads the PRD and lists, in ONE AskUserQuestion batch (max 4 questions, grouped):
                  missing technology, missing NFRs (as today), plus ambiguities that change what a test asserts: rounding, formats,
                  limits, ordering, units, error text, how a number is measured. Not what the PRD already states.
                  Each answer is written into sprint-N.md as "(answered at chart)": technology under Integrations and constraints,
                  an NFR as an NFR-n row, anything else as a "Decisions" bullet under the requirement it refines.
                  "You decide" leaves it for the architect to recommend in an ADR and lists it under Open questions.
  3. Architect    Sonnet. intents + architecture.md + ADRs + brief.md (see §4). Replies with open questions; the coordinator batches them
                  into one AskUserQuestion and writes the answers into the PRD (step 2 rule), then relaunches the architect only if an
                  answer changes an intent. No question is answered only inside architecture.md.
  4. Check        S chart check N --json; at most one fix round.
  5. QA           Sonnet. plan.md, cases.md, data/ (as /rig:testplan today). S chart check N --cases --json; at most one fix round.
  6. Review       Opus, evaluator in chart mode (§5). Writes .rig/product/chart-review.md. If it reports findings, ONE fix round: the owning
                  generator is relaunched with only those findings, then check again. The review is not repeated.
  7. Commit       branch rig/chart-N, git add .rig/product, "docs: chart sprint N".
  8. End          intents table, review verdict and open findings, "Next: review the branch, then a person runs /rig:approve chart-N".
/rig:testplan N     stays as a standalone re-run of step 5 (a test plan edited after a PRD change).
```

The journey rail (`lifecycle.ts`) already has `chart`, `testplan` and `approve chart-N` states from files. `chart` is done once intents and a test plan
exist; the testplan step is only "current" when the plan is missing after a chart (a partial run). The builder decides the exact state change.

## 4. The application brief

Fowler's example brief is one document: context and intent, architecture with a responsibilities table, technology and delivery constraints,
interfaces, resiliency, tests. rig already has the per-intent slice (`## Design`, `## Interfaces`, `### Failure behaviour`, §6 of the outer-loop spec).
What is missing is the shared whole. `.rig/product/brief.md` already exists as a template that `start`, `plan` and the evaluator read, so the architect fills it
(no new file, no assembler):

- Fill `Context and intent`, `Non-goals`, `Architecture` (the module diagram and responsibilities table, copied by reference to `architecture.md`, not retyped),
  `Constraints` (technology and the NFR targets), and `Interfaces` (each public surface and its contract file, or "none").
- Leave `Behaviours`, `Failure behaviour` and `Tests required` as one line each: "see the intents". B-numbers are per intent, so copying them would collide.
- Keep it at most 60 lines. On a later sprint it is edited, not rewritten.

## 5. The reviewer (evaluator in chart mode)

`agents/evaluator.md` gains a short chart section; the brief names the mode ("review the chart bundle for sprint N"). It stays read-only, Opus, effort high.
It reads the PRD (including recorded answers), `brief.md`, `architecture.md`, the ADRs, all intents, the test plan and cases, and the `chart check` output, then
reports only findings it is at least 80% sure of, in this fixed list:

| Category | Looks for |
|---|---|
| scope | an intent, behaviour or ADR no PRD requirement or recorded answer asks for |
| coverage | an acceptance criterion or scenario (AC-n, S-n) no behaviour or case asserts; an NFR with no case that can actually fail |
| duplication | the same behaviour stated in two intents, or two intents that contradict each other |
| concerns | a gap, risk or owner decision parked in a section the check does not block on (e.g. "Risks and notes") that needs a person's answer |
| answers | an answer given at chart that is not in the PRD, or a PRD open question left as "none" while an intent has one |
| sequence | a dependency order that cannot be built (an intent needs code a later intent adds), or a walking skeleton that is not minimal |
| cases | a test case with a vague expected result, or data that does not exercise the boundary it names |

Output (30 lines or fewer), written to `.rig/product/chart-review.md` by the coordinator: `verdict: pass | changes-needed`, findings with
`file:line` and a fix, `## Deferred`, and "If I could change only one thing: …". The reviewer never edits. It advises; `/rig:approve` stays a person's.

`chart check` gains one deterministic rule so the reviewer's "concerns" finding has a floor: a heading named `Risks`, `Risks and notes` or `Notes` in
`architecture.md` or an intent, whose bullets contain "owner:" or "decision", is a `report` finding. (Builder: keep it a regex over the headings; it must
not block, because a risk with an owner is legitimate.)

## 6. Models: generator Sonnet 5.5, evaluator Opus 5.5, versions configurable

`.rig/sensors.json` already has `models: { build, evaluate, design }` (defaults `sonnet`, `opus`, `opus`) and a `model-role` sensor that compares a launch's
resolved model to its role by **family**, so a version bump never trips it. Changes:

- Default `design` becomes `sonnet` (the architect is a generator). `evaluate` stays `opus`. The person can set `design: opus` per repo.
- `agents/architect.md` and `agents/evaluator.md` use the aliases `sonnet` and `opus` in frontmatter, not `claude-opus-5-5`. An alias resolves to the
  newest release of that family, so a new release needs no edit here.
- **Pinning a version** (the person wants exactly 5.5): set Claude Code's own alias variables in the target's `.claude/settings.json` `env`:
  `ANTHROPIC_DEFAULT_SONNET_MODEL` and `ANTHROPIC_DEFAULT_OPUS_MODEL`. `templates/settings.json` (written by `init`) carries them commented in
  `README`/`readme-rig.md`, not set, so the default tracks the latest. **The builder must verify these variable names and the alias behaviour for
  subagent frontmatter against current Claude Code docs (use `claude-code-guide`) before relying on them.** If they do not apply to subagents,
  fall back to: `sdlc.ts vendor` stamps the `models` values from `sensors.json` into the vendored copies of the two agents' `model:` line.
- `scripts/hooks.ts` session-start text and `docs/GOAL.md` rule 6 say "Sonnet generates, Opus evaluates"; the skills never hard-code a version string.
- A repo's `CLAUDE.md` role table (this repo's) gets one row: "Chart reviewer: `opus`".

The Agent tool's `model` parameter accepts only aliases, so the skills pass `model: sonnet` for QA and leave the architect and evaluator to their
frontmatter, as today. The version is therefore never in a skill.

## 7. Dashboard: models in use

`hooks/dashboard.tsx` reads `.rig/state/model.json` (launches with `resolved`) through `sdlc.ts status --journey --json` (new field
`agents: [{ agent, model, at }]`, the latest launch per agent, from `modelstate.ts`; no lifecycle logic in the mod). The band's second line appends
`architect sonnet-5-5 · reviewer opus-5-5` for the running or latest agents (drop the `claude-` prefix). Hidden when empty.

### Live spend (G6, added at the person's request: "reflect token usage and cost in real time")

Today `dashboard.tsx` reads `$.session.usage()` only on `session.start`, `prompt.submit` and `turn.complete`, so the context, tokens and dollars freeze for
the whole of a long turn (the first chart ran 8 minutes with the band stuck at its prompt-time numbers).

- `session.start` starts `$.clock.every(2000, tickSpend)` (the API's documented way to keep work going outside a dispatch). `tickSpend` calls
  `$.session.usage()` and updates the `spend` atom only when a number changed, so an idle session redraws nothing. The `journey` atom keeps its event-driven
  refresh (it needs a process call); it also refreshes on `tool.call` and on the `agent-done` event so a finished step shows without waiting for the turn.
- The timer is cancelled on `session.end` and when the module reloads; one timer at a time (a second `session.start` cancels the first).
- Spend shows context tokens (with the meter), session dollars and, new, the cost of the current turn (dollars at `prompt.submit` subtracted from now), so a
  single expensive chart is visible while it runs. Subagent cost is included only if `$.session.usage()` includes it; the builder checks this on a real run and, if it
  does not, labels the figure "main thread" rather than guess. Hard limit: no model call, no file written, no process spawn per tick.
- If `$.session.usage()` is too slow to call every 2 s (the builder measures it), the period is raised, not removed.
- Test: `dashboard.test.ts` drives the module with a fake clock and a fake `usage()` that changes; asserts the atom updates between two ticks with no turn event,
  and that an unchanged value causes no update.

## 8. Tests (all spec files, no live model)

- `chart.spec.ts` / skill-text spec: the chart skill names the gap pass, the batched question, "answered at chart" in the PRD, the QA and review steps and the
  single commit; it still passes the 60-line cap (the builder moves long wording into the skill's references file if needed).
- `chartcheck.spec.ts`: the new `report` rule fires on a parked-owner "Risks and notes" section and not on a plain risks list.
- `registry.spec.ts`: default `models.design` is `sonnet`; `agents/*.md` frontmatter holds aliases only (a test greps for `claude-` ids).
- `modelstate.spec.ts` + `lifecycle.spec.ts`: `status --journey` returns `agents` from a fixture `model.json`; journey state when intents and a test plan both exist.
- `dashboard.test.ts`: the model line renders and is absent when `agents` is empty.
- Acceptance: re-run `/rig-chart 1 docs/prd/shopping-cart-app-prd.md` in `shop_app` on a fresh branch. Expected: the four D1–D4 questions asked in one batch
  before the architect, recorded in `sprint-1.md`, `brief.md` filled, a test plan present, `chart-review.md` committed, and no hand edits to the target.
  Cost and time are recorded against the first run ($1.74 for chart alone, about 8 minutes) for the next eval pass.

## 9. Open points left to the builder (my calls, flagged)

- Whether the QA fold-in keeps `/rig:testplan` as its own skill or becomes a reference file both skills read (my call: keep the skill, share the brief).
- The exact wording of the gap-pass prompt; it must stay inside the 60-line skill cap.
- The reviewer's mode flag: a sentence in the launch brief, not a new frontmatter field (my call).
- Sonnet as architect is a quality risk (the first run used Opus); the reviewer is the compensating control. If chart reviews on Sonnet show repeated
  design findings, switch the repo's `models.design` to `opus`; that is a config change, not a code change.
