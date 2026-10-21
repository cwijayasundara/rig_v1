# From one agent to many: what the talk says and what rig has

Status: notes, 2026-10-21, written at the person's request ("I micro-manage a single agent; I want to depend on Claude Code and the harness and run many instances").
Sources, read this session (secondary: a vault's summaries of the talk, not a transcript; timestamps are the vault's, from auto captions):
the talk (Poteto/Lauren Tan with Matt Pocock, 2026-10-02: https://www.youtube.com/watch?v=MN9dGgmLyso), its summary
https://postgrok.com/sources/2026-10-05-youtube-poteto-software-factory, and the concept pages michelin-kitchen-metaphor, trust-ladder-agents,
inner-outer-loop-agents, verifiability-and-one-way-doors, agent-verification-skill (all under https://postgrok.com/concepts/).

## What the talk claims (her numbers are self-reported)

- She began by micromanaging one agent. The first thing that let her step back was a **verification skill**: the agent runs the app, drives it like a user,
  captures traces, and checks its own work (16:24 "the single most important skill ... is verification"). Verification is what makes a loop a loop.
- Then she **narrowed the codebase**: guardrails, lint rules, feature-based directories, so bad code is hard to write; every repeated mistake becomes a
  lint rule or a skill update (25:26 to 31:46, 50:33). If several agents repeat a shortcut, fix the environment, not the agent.
- **Determinism gradient**: mechanical steps go in a CLI; the agent keeps only judgment; the skill is a thin wrapper (21:08 to 23:42).
- **Review by sampling**, not by tasting every dish (49:34). At the top, agents merge their own PRs overnight and she reads the history in the morning,
  reverting or adding a lint (52:02). This is a "dimmer switch", some paths dark and some lit, not vibe coding (54:49).
- **Reversibility decides what may run dark**: two-way doors (merge, then revert) can; one-way doors (data loss) need verification strong enough to
  turn them into two-way doors, and where that is not possible they stay reviewed (56:04 to 57:56).
- **Inner and outer loop**: agents build toward a snapshot of intent; a separate loop brings in bug reports and requests; a coordinator groups related
  work instead of spawning one agent per task, and recurring issues go to a buffer reviewed every few days (35:32 to 47:45).
- Full autopilot spawns verifier agents per PR, tunable from ten down to one, and is token-heavy (52:50).

## Where rig stands against that

| Her rung | rig today | Gap |
|---|---|---|
| Verification skill | contract replay for HTTP; unit tests; Phase 0.1 shows an unconfigured check | **no general journey check (2.1, designed)** |
| Narrow codebase | `arch` layers, count ratchets, protected harness files, `/rig:rule` | layers need a person to approve once per repo |
| Repeated mistake becomes a rule | `/rig:learn`, `/rig:rule`, replay gate | a person applies each one; promotion ladder (1.2) not built |
| Clean-context review | built (2.2); triage with recorded dismissals | not yet measured against a same-context review |
| Sampling instead of reviewing every change | none: two human stops per change (approve, merge) | by design; the dimmer switch is a decision for the person |
| Reversibility | production gate for deploys | no per-path "dark" policy; 3.5 would document it |
| Coordinator / many instances | native worktrees only; never exercised | **untested whether two instances interfere** |
| Evidence it works | 3 small evals; rig lost to bare on a small task | the missing proof that one instance is trustworthy |

## What this says about the order

Her order was verification, then constraints, then sampling and unattended merging, then the coordinator. rig's evals say the same thing from the other
side: one instance is not yet reliable on a multi-change task, and running many multiplies failures (Cognition and the proposal's principle 1 agree).
So the route to "run many instances" is: make one instance's output checkable (2.1), prove two instances do not interfere (a scripted, $0 worktree
test), then decide how many human stops each change really needs (the dimmer switch), and only then add a coordinator.

## Decision that is the person's

The two human stops (approve a plan, merge a PR) are a Non-Goal to change in the repo's own rules and are also what stops "run many instances" from
scaling: the human becomes the queue. The talk's answer is sampling and path-based dark and lit areas. That is a policy change, not a feature.

## Decided and measured (2026-10-21)

- **The person's call: keep both human stops and make them cheap.** Many instances run in parallel worktrees; the person approves and merges from one queue, with journeys (2.1) and the clean review (2.2) doing the checking. Dark paths and plan auto-approval are not in scope; revisit once an eval shows a good accepted rate.
- **Measured, $0, scripted:** two independent changes ran start to PR at the same time in two worktrees of one repo, each in its own process (`npm run test:e2e:parallel`, in `npm test` and CI). No interference: no state leaked between worktrees, both branches reached the shared origin, both merged into main, and main's suite passed. This is only the independent case; it says nothing about two changes that touch the same file, or about live model quality.
- **Built:** `sdlc.ts queue` lists, across every worktree, what waits on a person (with the command to run in that worktree), what is still with the model, and which in-flight plans name the same file, found from the plans before the work is done.
- **Still unbuilt, in order:** 2.1 journeys (designed), then claiming files per instance (3.4, gated on an accepted rate), then a coordinator. A live many-instance eval is not run and would cost real money.
