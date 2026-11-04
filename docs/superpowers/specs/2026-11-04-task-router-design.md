# Task router: first-draft design

Status: DRAFT, written without a Q&A round. Every item marked **(guess)** is my call, not the person's.

## Revisions at plan time (2026-11-04)

Reading the code changed two points of the approved draft. Both shrink the change.

1. **Types.** `scripts/lifecycle.ts` already defines `TYPES = feature | bugfix | refactor | chore`, and `/rig:start` already picks
   one and passes it to `S new --type`; `check.ts` already uses it (bugfix and feature prove red, refactor proves green). The
   router uses that vocabulary. `bug` is `bugfix`; `other` is `chore` or `feature`. No new type list.
2. **No new skill.** The only thing the router adds is a quick path through `/rig:start` step 2 (skip the brainstorm and the
   question batch for a clear bugfix or refactor). That is one script check plus a paragraph in `skills/start/SKILL.md`, not a
   separate `/rig:route` skill.
3. **Measurement.** The dollars-per-accepted-task arm needs a fixture repo with hidden acceptance for bugs and refactors, which
   does not exist (`eval/fixtures` holds chart, learn, review and wiki only). This plan ships a deterministic labelled-request
   corpus (free, runs in `npm test`) and defers the live paired arm to its own spec.

## Intent and why

A request to rig today always enters through `/rig:start`, which writes `intent.md` and `spec.md` with numbered behaviours.
That suits a feature. A one-line bug fix or a pure rename pays the same entry cost, and the first steps differ by task type:
a bug needs a reproducing test before anything else, a refactor needs a behaviour-preservation check, a feature needs
behaviours. poteto-mode (Cursor's pstack) routes by task type to a playbook; the useful part is the routing, not its
model-judged enforcement. This design borrows only the routing and keeps rig's rule that scripts decide.

The goal is fewer dollars per accepted task on small work, with no change to what a large change goes through.

## Goals

1. Classify a request into one of four types: `feature`, `bug`, `refactor`, `other` **(guess: these four)**.
2. Pick the entry path for that type, reusing existing gates (`S weight`, `S risk`, `/rig:approve`), never replacing them.
3. Show the person the type and path in one line before acting, so a wrong classification costs one reply.
4. Be measurable: one arm in `eval/` comparing routed against unrouted entry on dollars per accepted task.

## Non-goals

- No second sizing or risk system. `weight` and `risk` stay the only authorities on light/full and review tier.
- No subagent fan-out, multi-model interrogation, arenas or swarms from poteto-mode.
- No persona or prose-style rules (unslop, "no long dashes").
- No change to approval: a person still approves every plan; the router never approves.

## Anti-goals (failures even if it technically works)

- The router becomes a model-judged gate. A classification may only choose a path; it can never skip approval, the red-proof
  test or the final gate.
- A misclassified request silently takes a weaker path. When the type is unclear, default to the full `/rig:start` path.
- It costs more than it saves: the classifier must not add a subagent launch. `CLAUDE.md` budget is at most 4 launches and
  $8 per change.

## Constraints

- Native first (GOAL rule 1). The router is a skill plus one script check, not a hook, and it does not call a model from a hook.
- Briefs and any skill text stay short; the router skill is at most 40 lines **(guess)**.
- Per `CLAUDE.md`: fixes to rig's behaviour go in this repo with a spec that fails without the fix.
- poteto-mode and pstack are not dependencies. Nothing is imported from them.

## Design

### Shape

A new skill `skills/route/SKILL.md` (`/rig:route "<request>"`), and `/rig:start` calls it first when `$ARGUMENTS` is a new
free-text request **(guess: auto-call, with `--no-route` to skip)**. A charted intent file or an existing slug skips routing.

### Classification

The skill reads the request and `git status`, picks a type, and runs `S route-check <type> "<request>"`. The script holds the
deterministic part: it rejects `refactor` when the request mentions new behaviour words from a small list, and rejects
`bug` when no failing symptom, error text or reproduction is named, falling back to `feature`. The model proposes; the script
can only narrow toward the full path.

### Paths

| Type | Entry | First artefact | Plan weight |
|---|---|---|---|
| `feature` | `/rig:start` unchanged | `intent.md`, `spec.md` with B1..Bn | from `S weight` |
| `bug` | `/rig:start` with a one-behaviour spec seeded from the symptom | a failing reproducing test, red-proofed | from `S weight` (decided: no forcing) |
| `refactor` | `/rig:start --refactor` | behaviours stated as "unchanged: ...", existing tests named as the guard | from `S weight` |
| `other` | `/rig:start` unchanged | as feature | from `S weight` |

`--refactor` and the bug seeding are the only new entry code **(guess)**. Approval, build, test, pr are untouched.

### One-line announcement

Before acting the skill prints: `Routed as <type> (<reason>). Path: <path>. Say "feature" to override.` An override rewrites
the type and reruns `route-check`.

## What is left to the builder

- Exact word lists in `route-check` and where they live (registry or script constant).
- Whether `--no-route` is a flag or an env var.
- Wording of the skill text, within the 40 line cap.

## Measurement

Add an arm `routed` to `eval/arms.mjs`. Use the existing paired runner and hidden acceptance. Task mix: at least 5 bug
fixes, 5 refactors, 5 features **(guess)**. Metric is dollars per accepted task, per GOAL rule 4. Keep the router only if
routed is no worse on accepted rate and cheaper on bug and refactor; cut it after two passes with no lift. GOAL.md already
records that no eval shows a rig lift over plain Claude Code, so this arm also reports routed against bare Claude Code.

## Decisions (person, 2026-11-04)

1. Approved. Four types stand (`perf` and `docs` not split out; they route as `other`).
2. Auto-route: `/rig:start` calls the router for new free-text requests, `--no-route` skips.
3. `S weight` decides plan weight for bugs. No forced `light`.

## Next step

On approval: `superpowers:writing-plans`, then one test per behaviour (route-check rejections, override, default-to-full
on unclear), `npm test` once, one `git diff main...HEAD` review.
