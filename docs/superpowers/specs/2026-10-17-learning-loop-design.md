# Learning loop: design

Status: built and merged (`/rig:learn`). Goal item 6 in `docs/GOAL.md`. The person asked for the design without a
question round, so the calls below are mine and are marked **[my call]**.

## Intent

Claude Code makes the same mistake across changes and a person has to notice. `/rig:rule` already turns a recurring mistake into a
regex rule or a `CLAUDE.md` line, but only when a person remembers to run it. The loop makes the harness notice, record and
consolidate what it learns, and propose promotions, while a person still approves every change to the judge.

Devin's memory (`MEMORY.md` index, one-line entries with source and date, a roughly daily "dreaming" pass that merges and prunes)
is the model for **record and consolidate**. Fowler's steering loop (a recurring issue becomes a better guide or sensor) is the model
for **promote**. Neither is shown to lift anything (`docs/research/2026-10-17-findings.md`), so this ships behind an eval.

## Goals

- Lessons are recorded from evidence the harness already has, at zero model tokens, and each cites the changes that earned it.
- A consolidation pass keeps the lesson file small: merge duplicates, retire stale lessons, never rewrite the whole file.
- A lesson that keeps recurring is proposed as a mechanical rule, and a proposed rule is checked against stored diffs before a
  person sees it.
- A person approves every promotion; the learner cannot edit the sensors that judge it.
- Measured: later changes repeat a finding category less often with the loop than without, and not at a higher cost per accepted task.

## Non-goals and anti-goals

- Not personal memory. Claude Code's native auto memory stays local and uncommitted; this is the team's committed record.
- No lesson without evidence. A model's opinion of what went wrong is not a lesson.
- No auto-promotion, no auto-edit of `sensors.json`, `rules.json`, skills or `CLAUDE.md`. Failure mode to avoid: a loop that
  weakens its own judge, or lets one bad lesson spread to every session.
- No whole-file rewrites of the lessons file (context collapse). No daily cadence by default. No new daemon or service.

## Design

### The lessons file

`.rig/lessons.md`, committed, one line per lesson, capped at 30 active lines **[my call]**:

```
- L7 | Handlers return the contract's error shape, never a bare string | seen: cart-add, cart-remove | first 2026-10-17 | last-fired 2026-10-24 | active
```

Fields: id, the lesson (at most 25 words, as `/rig:rule` already requires), the change slugs that earned it (at least 2),
first-seen date, last-fired date, status `active` or `retired`. Retired lines stay for provenance and stop being loaded.
Loading: `CLAUDE.md` imports the active lines (`@.rig/lessons.md`), the native mechanism, instead of any new injection code.

### Step 1, mine (deterministic, zero tokens)

`sdlc.ts learn mine` reads evidence that already exists per change: findings in `review.md`, sensor blocks and warnings in
`evidence/runs.jsonl`, entries in `unresolved.json`, and waivers. It groups by sensor id or finding category and writes
`.rig/learn/candidates.json` (gitignored): `{key, changes[], count, sample}`. A key seen in at least 2 distinct changes is
**eligible**. One occurrence is never a lesson.

### Step 2, dream (model, on demand)

`/rig:learn` (a skill; Sonnet, **[my call]** with a cost ceiling) reads `lessons.md` and the eligible candidates and proposes
**delta edits only**: add a lesson, merge two, retire one, or promote one. It writes the proposal to `.rig/learn/proposal.md`
as a diff for a person to apply through a normal PR. It also proposes retirement when `last-fired` is older than 10 shipped
changes. Triggers: when a person runs it, or a native routine (`/schedule`) weekly. Daily is Devin's default; with few changes a
day, weekly is cheaper and I have no evidence for more **[my call]**.

### Step 3, promote (replay-gated, human-approved)

If a lesson is a pattern over added lines, the dream pass drafts a `rules.json` entry exactly as `/rig:rule` does. Then
`sdlc.ts learn replay <rule-id>` runs the regex over the stored added-lines of every shipped change (the `sdlc/<slug>` commits)
and reports: fires on each source change, and fires on which others. A rule is presentable only if it fires on every change that
earned it and on no shipped change without that finding. It is then handed to the person, who adds it; `rules.json` already needs
an `ask` confirmation and a PR. This extends `/rig:rule` rather than replacing it.
A lesson that is not a pattern stays a `lessons.md` line.

### Step 4, close the loop (zero tokens)

`learn mine` also updates `last-fired`: a lesson fires when its sensor or finding category recurs after the lesson exists. A
promoted rule that is waived repeatedly, or never fires in 10 changes, is flagged for retirement in the next proposal. This is the
demotion Devin's memory lacks.

### Protection

The learner scripts only read evidence and write under `.rig/learn/`. `lessons.md` is edited only through a PR by a person;
`rules.json` and `sensors.json` stay behind the existing `ask` rules and CI's base-branch check, so a PR from the learner cannot
change the judge that reviews it. The CI base-branch checker enforces the 30-line cap and that every active lesson cites 2 changes
that exist **[my call]**.

## What is left native

Auto memory for personal corrections; `/schedule` for the weekly run; `@` imports for loading; `/code-review` as the source of
review findings; `gh` PRs as the approval path.

## Measurement (the gate to keep it)

A new arm in `eval/`: run a seeded sequence of changes on the shop fixture where one mistake recurs (for example a bare-string
error instead of the contract shape). Compare, over later changes: **loop on**, **loop off**, and **native auto memory only**.
Metrics: recurrence rate of the seeded finding after it first earned a lesson; lesson-file size; tokens and dollars per accepted
change. Cut `/rig:learn` and keep only `/rig:rule` if it shows no lift after two passes, or is not cheaper at a tie. A seeded eval
is needed because a real project will not reach 30 shipped changes soon; the seeded run proves the mechanism, not the value on a
real codebase, and the design says so.

## Size

`learn mine` and `learn replay` about 200 lines, one skill, one eval arm, one spec. The harness cap is 6,000 lines; measure current
use before the plan and revisit the cap only if it does not fit **[my call]**.

## Left to the builder

File formats for `candidates.json` and `proposal.md`; how finding categories are extracted from `review.md` (use the evaluator's
existing output format, change it only if needed); the exact definition of "fires" per sensor kind.

## Open questions for the person

1. Weekly on demand and a routine, or only on demand? (My call: on demand first, add the routine once the eval shows lift.)
2. Should lessons also cover design habits no sensor can see (the `CLAUDE.md` line path), or only things a sensor or review
   finding can evidence? (My call: only evidenced ones.)
3. Is a seeded eval enough to ship, or do you want to wait for real usage?
