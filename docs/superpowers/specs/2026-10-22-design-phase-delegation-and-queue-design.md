# Design phase delegation and the queue — Design

Date: 2026-10-22. Status: draft, awaiting the person's approval.

## 1. Intent and why

rig's deterministic layer (sensors, verify, frozen contracts, human gates, the CI judge, evidence) is what the team is missing when they build with superpowers alone: in a repo built that way (`learning_102/google_harness_2_v1.0`), 16 of 44 commits are `fix:`. rig's design-phase skills are what the team does *not* need: `/rig:chart`, `/rig:start` and `/rig:plan` replace the open brainstorm with a scripted architect pass and template filling, so the conversation that produces a design the person believes in disappears and the loop feels mechanical.

This change makes rig the team's rails and superpowers the engine. Every `/rig:*` command stays the thing people type, so a senior and a two-year engineer run the same loop and land the same artefacts in the same shapes. Inside, the design and planning steps delegate to the superpowers brainstorm, and the deterministic layer freezes and checks what the brainstorm produced. A new autonomy rung lets the queue start the next intent itself, earned from evidence and reversible, in the sense of the trust ladder (postgrok.com/concepts/trust-ladder-agents) and the Michelin kitchen (postgrok.com/concepts/michelin-kitchen-metaphor): the chef builds the kitchen once, tastes at two places, and samples the rest.

## 2. Goals, non-goals, anti-goals

Goals

- G1. The sprint design doc that the brainstorm writes is the frozen contract for the sprint; `/rig:approve chart-N` hashes it with the rest of the chart.
- G2. `/rig:chart N` runs `superpowers:brainstorming` with the person (recon and deep research offered as moves inside it), then breaks the design into traced intents exactly as today.
- G3. `/rig:start <intent>` runs the brainstorm on that one intent (scope, blast radius) and `/rig:plan` runs `superpowers:writing-plans`; both write rig's existing `intent.md`, `spec.md` and `plan.md` shapes so every gate, sensor and spec that reads them is untouched.
- G4. Exactly two human gates: `/rig:approve chart-N` and `/rig:approve <slug>`. After the second, build → verify → review → PR runs unattended (already the case). Merge stays manual.
- G5. The queue starts the next ready intent itself, as far as the repo's autonomy rung allows. A fresh repo starts on rung 1.
- G6. When built code drifts from the frozen design doc, verify reports the gap as a conversation the engineer works through, not only a block (the one idea taken from pdd-kit).

Non-goals

- Auto-merge (rung 3). Named in the rung table so the shape is right; not built.
- Replacing `sdlc chart check`, the trace rules, the test plan or the chart reviewer. They stay.
- Changing the learning loop's promotion ladder (lesson → rule → test → ratchet → architecture). The autonomy rung is a separate axis.
- A `map` skill that drafts the product docs from an existing codebase. `/rig:init` already scouts; folding a model draft of brief and architecture into init is a later change.
- Multi-repo or multi-worktree queues. One repo, one active change at a time, as today.

Anti-goals (a build that does these has failed even if tests pass)

- A rig skill that re-implements the brainstorm in its own words. It must invoke the superpowers skill by name and let it run.
- A third human gate, a "confirm" prompt before the queue starts an intent at rung ≥ 1, or any AskUserQuestion after `/rig:approve <slug>` that is not an open question from the brainstorm.
- The rung moving up on anything a model said. Only `sdlc` reading committed evidence moves it.
- Any new mechanism that fires at Stop. The queue is driven from UserPromptSubmit and SessionStart, where context injection already happens.

## 3. Constraints

- CLAUDE.md of this repo: Sonnet implements, one review per change, briefs under 60 lines, `--scope project`, never Opus as coordinator. Every target-repo rule is enforced by the vendored harness, so every behaviour here needs a spec in `scripts/*.spec.ts` and the e2e stage that covers skills (`test:e2e:fast`) where a skill's text is the behaviour.
- superpowers is an external plugin. rig can only *invoke* its skills by name and read what they write; it cannot change their text or guarantee their version. The routing line in `scripts/hooks.ts:95` ("use superpowers skills only when an sdlc skill names one") stays; the sdlc skills now name them.
- superpowers writes its design to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and plans to `docs/superpowers/plans/`. rig does not move those files; it records where they are.
- Continuation between skills is skill text, not a hook (`scripts/autoloop.spec.ts`). The only hooks that inject "do this next" are UserPromptSubmit (after a typed `/rig:approve`, `hooks.ts:172-193`) and SessionStart.
- `templates/settings.json` lists the skills an unattended session may chain (build, test, pr). approve and waive are never in that list.
- Nothing after `/rig:approve <slug>` may need a person except a sensor block, a check that failed twice, or the pr skill's three stop cases (unplanned file, frozen contract, relaxed test). Unchanged.

## 4. The design

### 4.1 The sprint design doc is part of the chart

`/rig:chart N` step 2 changes from "launch `rig:architect`" to:

1. Invoke `superpowers:brainstorming` with the PRD as the opening material. The skill runs its own conversation; rig adds one instruction line: *the written design goes to `docs/superpowers/specs/<date>-sprint-N-design.md` and must end with a `## Intents` section, one line per intent in the form `- <slug>: <one-line scope> (<PRD ids>)`, and a `## Design` section a builder can draw `architecture.md` from.* The `## Intents` list fixes only the set of slugs; `intents/<slug>.md` stays the source of truth for everything else (sprint, PRD ids, behaviours, estimate, scope). Recon (Explore agents) and deep research (`anthropic-skills:deep-research`) are offered where the brainstorm offers recon; rig does not add its own research step.
2. Launch `rig:architect` as today, but its brief is the design doc, not the PRD alone: it writes `architecture.md`, the ADRs and `intents/<slug>.md` from the design doc's `## Intents`, in the existing formats. It may not add an intent the design doc does not list, and it must list every one the doc lists (a trace rule in `chartcheck.ts`, `design-intent`, block).
3. Steps 3–7 (chart check, QA, chart reviewer, commit, `Next: /rig:approve chart-N`) are unchanged. The chart reviewer's brief adds the design doc as a source.

`chart.ts`: the design doc is tied to its sprint by `architecture.md` frontmatter `design: <repo-relative path>`, which the architect writes. `architecture.md` is already a chart file, so the path itself is under the approval hash; `ownFiles(n)` adds the file it names when it exists. Everything that needs "the sprint's design doc" (`chart check`, the start skill, `queue next`, the pr reviewer brief) reads it from that one line; a missing line means the sprint has no design doc, and a line naming a missing file is a `chart check` block (`design-missing`). Once approved, editing the design doc makes chart-N stale exactly as editing an intent does. That is G1.

A sprint charted before this change has no `design:` line and is unaffected. When `design-intent` blocks, the person edits whichever side is wrong; either edit makes the chart stale until re-approved, so no side "wins" mechanically.

### 4.2 Start and plan delegate

`/rig:start .rig/product/intents/<slug>.md`:

1. `S new <slug> --source <file>` as today (refuses when not ready).
2. Replace steps 2–3 (fill intent.md, write spec.md) with: invoke `superpowers:brainstorming` with the intent file, the sprint design doc and `brief.md` as the opening material, with one added line: *this is one intent of an approved sprint; the design doc is frozen, so a disagreement with it is an open question for the person, not something to redesign here. End by writing `.rig/changes/<slug>/intent.md` (the `## Intent` section, at most 15 lines) and `spec.md` (`## Behaviours` keeping the intent's B-numbers, `## Blast radius`: the files and modules this touches and what else depends on them, `## Out of scope`, `## Open questions`).* The brainstorm's "what size is this" step is skipped: the size was fixed at chart time.
3. Continue into `/rig:plan` in the same turn, as today.

`/rig:plan <slug>`:

1. Replace step 2 (write plan.md) with: invoke `superpowers:writing-plans` on `spec.md`, with one added line: *write the plan to `.rig/changes/<slug>/plan.md` in rig's shape (`## Files`, `## Interfaces`, `## Acceptance tests`, `## Contracts`, tasks under `## Tasks`); plans hold interfaces and acceptance tests, never code.* Every path in `## Files` must equal, or sit under a directory listed in, `spec.md ## Blast radius` (a new approve refusal in `lifecycle.ts`: `plan touches a file outside the blast radius: <path>`). A `spec.md` with no `## Blast radius` heading (every change started before this) is not checked.
2. Steps 3–5 (queue check, contract edits, `Next: a person runs /rig:approve <slug>`) unchanged.

The brainstorm is the conversation the engineer has; rig only fixes where it starts, what it reads and what it must leave behind. A senior can say "skip the questions" (the skill allows it); the gate still wants the files.

### 4.3 Review against the design

`sdlc verify` stays deterministic (it runs in CI and in the evals; no model call goes in it). Design drift is judged where a model already reads the delta: the pr skill's clean-context reviewer. When the sprint has a design doc, `templates/review-brief.md` hands the reviewer the design doc as a source and asks for findings of a new category `design`: *the change's code no longer matches a responsibility the design doc gives its files*. The pr skill's triage treats `design` like `contract`: the builder may not dismiss it. It is fixed in the wave when the code is wrong; when the design doc is wrong, the finding stays under `## Findings` (never `## Deferred`) with the doc sentence to change as its `→ fix` (a chart edit, which re-opens the chart approval); the verdict stays `changes-needed` and the PR carries it for the person. That is the conversation: a named gap with a named next step, never a bare fail. The learning loop's ladder maps `design` to `architecture`.

### 4.4 The autonomy rung and the queue

State: `.rig/autonomy.json`, committed: `{ "rung": 1, "since": "<iso>", "history": [{ "at", "from", "to", "why" }] }`. `sdlc init` writes it at rung 1; a repo with no file reads as rung 0, so a target repo that upgrades its vendored harness changes nothing until a person sets the rung. `sdlc autonomy` prints it; `sdlc autonomy set <0|1|2> --why "<text>"` is person-only (`SDLC_HUMAN=1`, same guard as approve and waive, and a `/rig:autonomy` skill that runs it the way `/rig:approve` does). CI treats a PR that edits `autonomy.json` as a human row needing independent approval, in the same place `check.ts` treats `approval.json`, and `templates/managed-settings.json` denies `Edit`/`Write` on it as it does for `approval.json`.

Rung 1 is not unattended. The queue carries the order to the kitchen: the session opens the brainstorm for the next intent without the person typing `/rig:start`, and the person is in that conversation as they would be if they had typed it. "Not this one" is said inside the brainstorm (its first message already offers to skip), or persistently with `sdlc queue defer <slug>` (person-only; the slug drops to the end of the pick order until `undefer`). Rung 2 is unattended only after `/rig:approve <slug>`, exactly as the chain is today.

Rungs:

| Rung | The queue may | A person does |
|---|---|---|
| 0 | nothing: it lists what is ready | types every `/rig:start` (today) |
| 1 (default) | start the next ready intent: `/rig:start` → `/rig:plan`, stopping at approve | `/rig:approve <slug>`, merge |
| 2 | rung 1, and after approve the existing chain runs build → test → pr | `/rig:approve <slug>`, merge |
| 3 | not built; reserved for auto-merge | sample commit history |

The queue is not a daemon. It is `sdlc queue next`, which returns the next ready intent (`readyIntents()` already excludes started and blocked intents; tie-break by sprint, then by the order in the design doc's `## Intents`, deferred slugs last) when the rung allows and no change is active, or nothing with the reason. "Active" is `.rig/state/active` naming a change whose status is not `shipped`: a change waiting at approve is active, so the queue never starts a second one beside it. It is injected at the two places context already is:

- SessionStart: when there is no active change, the rung is ≥ 1 and an intent is ready, the context line says `Queue: start <slug> now with /rig:start .rig/product/intents/<slug>.md (rung 1)` instead of `No active change`. The session's model acts on it like any skill text.
- UserPromptSubmit after a typed `/rig:approve <slug>`: at rung 2, the injected context already says `continue with /rig:build <slug>`; unchanged. After the pr skill ends (`Next: a person reviews and merges the PR`), the pr skill's last line adds, at rung ≥ 1: `Queue: <next slug> is ready; /rig:start it` so the same session carries on.
- `sdlc journey` and `sdlc status` show the rung and the queue's next pick.

Moving the rung is evidence-driven and reversible, and only a person applies it (the learning loop's rule: propose, never apply):

- Up: `sdlc autonomy` prints `ready to move to rung N+1` when the last 3 shipped changes (pr.md on trunk) each have a passing `verify.json`, a `review.md` whose `## Findings` holds no `security`, `contract` or `design` line, and no row in `.rig/waivers.jsonl` for that slug. All three are committed files already; nothing new is recorded. The person runs `set`.
- Down: when the learning loop (`sdlc learn`) mines a repeated finding (its existing `MIN_CHANGES` threshold) or a change needed a waiver on a `block`, `sdlc autonomy` prints `move down to rung N-1: <why>` and `/rig:learn`'s proposal carries it. A person applies it. The count of 3 and the down triggers are the builder's defaults to tune; they live as constants in one place.

Rung 2 does not change the pr skill's stop cases or the merge: it is exactly today's unattended chain, gated by the rung instead of by whoever types `/rig:build`.

### 4.5 What the team sees

`/rig:chart 0` is a conversation that ends in a design doc, intents, architecture, a test plan and one approval. `/rig:start add-item` is a conversation about that intent that ends in a spec with a blast radius and a plan, and one approval. Then the line runs. The dashboard (journey) shows the rung and what the queue will pick next. Every artefact is the same file in the same place for everyone.

## 5. Decisions already made (the person's)

- The sprint design doc from the brainstorm is the frozen contract; approve hashes it.
- `/rig:chart`, `/rig:start`, `/rig:plan` delegate to superpowers by name; rig does not author designs.
- PRD → list of intents stays; so does the trace check.
- Per-intent brainstorm (scope, blast radius, plan) is required before build, for everyone.
- Two human gates; unattended after the second; merge manual; no auto-merge now.
- A queue starts the next intent; governed by a rung; rung 1 is the default for a fresh repo.

## 6. Calls I made (the assistant's; the person can change them)

- Rung names and the 0–3 table; "autonomy rung" as the name, to keep clear of the learning loop's promotion ladder.
- Up on 3 consecutive clean ships; down on a repeated finding or a waived block. Person applies both.
- Design drift is a review finding (category `design`, from the pr reviewer, undismissable), not a model call inside `sdlc verify`, which stays deterministic for CI.
- `## Blast radius` lives in `spec.md`; plan `## Files` must be inside it (path or directory prefix); specs without the heading are not checked.
- The queue is injected context at SessionStart and the end of pr, not a hook at Stop and not a daemon. Rung 1 opens the brainstorm with the person present; `queue defer <slug>` is the persistent "not now".
- The design doc's path lives in `architecture.md` frontmatter `design:`; a missing file is a chart block.
- A repo with no `autonomy.json` reads as rung 0; `sdlc init` writes rung 1.
- `## Intents` in the design doc fixes only the slug set; intent files hold the rest.
- Skill-text behaviours are asserted by text, the way `autoloop.spec.ts` already does; the routing line is unchanged.

## 7. Left to the builder

- The `design-intent` rule parses `- <slug>:` lines under `## Intents`; slug sets must be equal.
- The wording of the `design` finding in `templates/review-brief.md` (stay under its 60-line cap).
- Spec coverage: at least one spec per numbered behaviour in §8, in the existing spec files where they fit (`chart.spec.ts`, `chartskill.spec.ts`, `lifecycle.spec.ts`, `queue.spec.ts`, `autoloop.spec.ts`, `hooks` specs), plus a new `autonomy.spec.ts`.
- Vendoring: `.rig/bin/` in a target repo is copied from `scripts/`; `sdlc vendor` and `VERSION` bump as usual.

## 8. Behaviours (for the plan)

- B1. `sdlc chart record N --design <path>` (or the frontmatter route) makes `<path>` part of chart-N's own files; editing it after approval makes `chartState(N)` stale.
- B2. `sdlc chart check N` blocks with `design-intent` when the design doc's `## Intents` and `intents/*.md` for that sprint disagree in either direction.
- B3. The chart skill invokes `superpowers:brainstorming` by name before the architect, and the architect's brief names the design doc.
- B4. The start skill invokes `superpowers:brainstorming` by name and ends with `spec.md` holding `## Blast radius`; the plan skill invokes `superpowers:writing-plans` by name.
- B5. `sdlc approve <slug>` refuses when plan `## Files` lists a path outside spec `## Blast radius`.
- B6. When `architecture.md` names a design doc, the review brief hands it to the reviewer and the pr skill treats a `design` finding like `contract` (never dismissed; fixed, or, when the doc is wrong, left under `## Findings` with the doc sentence to change as its `→ fix`, verdict `changes-needed`). `sdlc verify` makes no model call.
- B7. `sdlc init` writes `.rig/autonomy.json` at rung 1; a missing file reads as rung 0; `sdlc autonomy set` refuses without `SDLC_HUMAN=1`; CI treats an edit to it as a human row and managed settings deny the model editing it.
- B8. `sdlc queue next` returns the first ready, undeferred intent when rung ≥ 1 and no change is active (a change at approve counts as active); otherwise nothing, with the reason. `queue defer`/`undefer` are person-only.
- B9. SessionStart context names the queue's pick at rung ≥ 1; the pr skill's last line names it after a ship.
- B10. `sdlc autonomy` proposes up after 3 clean ships and down on a repeated finding or waived block; it never writes the rung itself.
- B11. Nothing after `/rig:approve <slug>` asks the person a question except the existing stop cases (asserted the way `autoloop.spec.ts` asserts the chain).
