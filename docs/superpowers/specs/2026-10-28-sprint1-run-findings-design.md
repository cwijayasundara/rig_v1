# Sprint 1 run findings: nothing lost from PRD to merge, fewer stops

Date: 2026-10-28. Source: the shop_app sprint-1 run (sessions c01995c3, c601aa3f), a transcript analysis and a read-only
audit of every sprint-1 artefact against `docs/prd/sprint-1-cart-add-remove.md`.

## Intent and why

The person rolls rig out to their team next week. The run showed rig generates good code (100 tests, ruff and mypy strict
clean; the PRD audit found no requirement dropped, narrowed or contradicted). What it did badly was the harness itself:
gates that misfire and cost human round-trips, and decisions and review items that are written down once and then go
nowhere. The person's rule for this work: break the PRD into intents without losing anything, build every intent in
dependency order, and leave as little as possible in a backlog.

## Goals

1. Nothing found during a sprint is lost. A review item is fixed in the change that found it, or carried into the unbuilt
   intent it belongs to, or (last resort) written to a backlog the next chart reads.
2. The sprint record matches the code: behaviours and amendments a change adds are written back to the sprint.
3. No gate misfires on rig's own writes or on ordinary markdown; a plan problem is caught by the model, not at the
   person's approval.
4. Fewer stops for the person: the per-change brainstorm asks one batch, not one question at a time.
5. Cheaper runs by default: Sonnet main thread, a `/clear` nudge on a large context.
6. The tree is clean after every rig step.

## Non-goals

- No auto-start of the next intent. `/rig-pr` stops; the person starts the next one (person's decision).
- No change to the chart's PRD → intent split or its ledger: the audit found it lossless.
- No hand-edits in shop_app. After the fixes the person runs `/rig-upgrade` there and rig regenerates.

## Anti-goals

- Scope creep through "fix it now": a review item that would add behaviour the PRD or the brief's non-goals do not ask for
  is never built silently. It is routed or backlogged, so a person decides it.
- A backlog that becomes the default home for review items.

## The work

Numbers are the findings as reported to the person.

### F1. harness-tamper fires on chart approval (bug)

`registerContracts` (`scripts/contracts.ts`) writes `.rig/sensors.json` without `sanctionWrites`, so the Stop gate blocks
twice with "revert it (git checkout …)", which would undo the approval. Fix: sanction the write. Every sdlc command that
writes a protected file goes through one helper so the gap cannot recur (builder's call how). Spec: chart approval that
registers contracts leaves no tamper finding at Stop.

### F2. plan `## Files` parser and plan-time check (bug)

`bulletPaths` (`scripts/model.ts:58`) reads `- a.py, b.py` as `a.py,` and takes a backticked word in a prose line as a
path. Fix: read bullet lines only, take every path on a bullet (comma- or space-separated, backticked or not), strip
trailing punctuation. Then `/rig-plan` runs the same refusal check as approval (`approvalRefusal`, exposed as an `S`
command, e.g. `S approve <slug> --check`, builder's call on the name) and fixes the plan before it hands over. Specs: both
shapes from the run parse correctly; the plan skill's check catches an outside-radius file.

### F3. false "undecided deferred" warning at chart approval (bug)

`scripts/sdlc.ts:225` counts `## Deferred` items marked `→ fixed (confirmed)` (or waived) as undecided. Fix: skip items
that carry a resolution marker. Spec: the run's chart-review.md gives no warning.

### F4. dirty tree after a change (bug)

After `/rig-pr`, `sprint-<N>/plan.md` (regenerated status) and `pr-outline.md` stay uncommitted and are carried to the
trunk on merge. Fix: `S pr` commits `pr-outline.md` with the change, and every regeneration of `plan.md` that rig does
lands in a commit (the change commit, or on merge, builder's call where). Spec: after `S pr` in a fixture, `git status`
is clean.

### F5. review items: fix here, carry forward, backlog last (feature)

At `/rig-pr` triage, each reviewer `## Deferred` and `## Unverifiable` item goes one of three ways:

1. **Fix in this wave** when it cites a file inside this change's blast radius and does not add behaviour beyond the spec
   (a correctness or quality fix: e.g. the run's directory-fsync item, renaming `FIELDS`). A fix that changes spec'd
   behaviour gets an amendment as today.
2. **Carry into an unbuilt intent** when the item is about a file in the scope of an intent of the same sprint that is not
   yet done, or adds behaviour (e.g. "strip ANSI escapes when the CLI prints names" → cart-cli). rig appends it to that
   intent file under a generated `## Carried in` section with its source (change, review line). The intent's `/rig-start`
   brainstorm must settle every carried item (into spec.md, or out of scope with the person's reason).
3. **Backlog** (`.rig/product/backlog.md`) only when no unbuilt intent fits. Entries: id, source, file, text, status
   (open / taken by <intent> / dropped: reason). The next `/rig-chart` gap pass lists open backlog items as questions.

Routing is a script (`S route <slug>` or inside `S pr`, builder's call), matching the cited file against intents'
`scope:`; the model only classifies "fix here or not" during triage. The deferred items of a change are never left only in
review.md. The chart's carried items need no re-approval of the chart: `## Carried in` is outside the approved hashes,
or the approval accepts that section changing (builder's call; the person must not have to re-approve a chart for it).

### F6. change additions flow back to the sprint (feature, gap A)

A change's spec behaviours that its intent did not have, and its amendments, are written back at `S pr` to the intent file
under a generated `## Added during the change` section, and into the sprint's requirements ledger so `chart report`
shows them. Same hash rule as `## Carried in`. Spec: a fixture change with an extra B-number and an amendment shows both
in the intent and the ledger.

### F7. per-change brainstorm asks one batch (behaviour)

`skills/start/SKILL.md` step 2 says "a grill: ask one question at a time". Change to the chart's rule: the brainstorm
collects every question it can foresee (edge cases, failure behaviour, out of scope, carried items) and asks them in one
`AskUserQuestion` batch of at most 4, then writes spec.md; a second batch only for a question an answer created. Keep
"only a person closes an open question".

### F8. default model and context nudge (cost)

`init` writes the project default main-thread model as Sonnet (`models.build`), in `.claude/settings.json`'s `model`,
unless the person picked another (builder's call on the mechanism). `start-brief` prints a `WARNING` line, "context is
~N k tokens: run /clear, then this command again", when the session transcript's last turn passed 100k tokens.

### F9. local-only end of `/rig-pr` (bug)

Step 9 already runs `S queue next`, which says "no intents are ready" before the merge. When there is no remote and HEAD
is the change branch, `/rig-pr` ends with `Next: merge sdlc/<slug> into <trunk>, then /rig-start <next ready intent>`,
the next intent computed as if this change were merged. It stops there.

### F10. "error raised means nothing changed" (gap B)

The run's `save` raises "cannot be written" when the directory fsync fails after `os.replace` already put the new file in
place, against PRD AC-4.3/AC-4.8, and the review missed it. Fix the harness: the build skill and the code-review brief
gain one rule: for any operation that can raise, check each step after the commit point (rename, replace, commit, send)
and either make it unable to fail the operation or document why; the reviewer reports a raise after the commit point as a
`correctness` finding. Spec: the review brief text contains the rule (a spec on skill text, as for other skill rules).

### F11. ADR index status not flipped (bug)

`acceptAdrs` (`scripts/chart.ts:83`) matches `| 0001 |` but the architect writes `| [0001](adr/…) |`, so
architecture.md keeps "proposed". Fix the regex to accept a linked id. Spec: the run's row shape flips to accepted.

## Constraints

- Repo rules (CLAUDE.md): each fix has a spec that fails without it; one review of `git diff main...HEAD` at the end; `npm
  test` and `npm run typecheck` run and quoted.
- Thin layer: skill text changes stay short; scripts carry the routing and parsing.
- Harness and scripts line caps (`docs/GOAL.md`) still hold; if F5/F6 push past them, say so rather than squeeze.

## After the build

Person runs `/rig-upgrade` in shop_app, then `/rig-start` cart-cli. Expected: no tamper or plan-approval misfire, one
question batch, the ANSI item carried into cart-cli, cart-storage's directory-fsync item fixed through rig (not by hand).

## Calls I made (for the person to check)

- What "fits an unbuilt intent" means: the cited file is in the intent's `scope:`, or the item names behaviour that intent
  owns.
- In-scope items that add behaviour are carried, not fixed in the wave (the anti-goal).
- 100k tokens as the `/clear` threshold.
- Backlog at `.rig/product/backlog.md`, read by the next chart's gap pass.
