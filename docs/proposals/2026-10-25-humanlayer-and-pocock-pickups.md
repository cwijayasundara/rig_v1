# What to pick up from HumanLayer's skills and Matt Pocock's software-factory PR

Sources: `humanlayer-opencode` (17 RPI skills; the mirroring plugin itself is out of scope) and
[mattpocock/skills#1316](https://github.com/mattpocock/skills/pull/1316) (`software-factory` glossary skill and its PR body).
Principle: thin layer, native first; each item is text or a small script change, and anything unproven gets an eval before it stays.

## A. Build now (small, testable)

| # | Pickup | Where in rig | Source |
|---|---|---|---|
| A1 | **Real PR body.** `scripts/pr.ts` writes `pr.md` as the title only. Generate: one-sentence *Why*, 1-3 *Special things to note*, a compact *Change outline* (diff-style file tree / contract / call tree, only views that apply), *Evidence* (the `verify.json` result), and **Door: one-way / two-way** plus **Blast radius** (from `spec.md`). Spec fails without the sections. | `scripts/pr.ts`, `skills/pr/SKILL.md` | HumanLayer `describe-pr`; Pocock PR body ("Merge Danger") |
| A2 | **Vertical-slice phases in plan.md.** When a plan has more than one group, each phase crosses layers and is verifiable alone; automated checks per phase, manual only if needed; phases are checkboxes so a resumed build starts at the first unchecked one. | `skills/plan/SKILL.md`, `skills/build/SKILL.md` | HumanLayer `create-structure-outline`, `implement-plan` |
| A3 | **Show-me conventions** (diff blocks for changes to an existing shape, shallow file tree with a responsibility per line, call tree, full shape when mostly new) as one template used by plan and A1. | `templates/` | HumanLayer `show-me` |
| A4 | **Small rules:** only a person resolves an open question (the agent recommends); latest document wins (design > intent > request); UI change prompts a design-system recon question. | `skills/start`, `skills/chart` | HumanLayer `create-design-discussion`, `create-research-questions` |

## B. Use as a design checklist for the production-harness goal (docs/GOAL.md)

The next goals (CI evals/PR loop, Maintain, learning loop) are automation that fires without a person. Pocock's factory
language fits them directly:

- **Question every task** (his five): what triggers it, what it reads and writes, what it triggers next, where a human
  re-enters, what stops two runs doing the same work. Make this the required section for any new automated trigger in
  `architecture.md` / a Maintain task spec. rig already has the dedupe answer for changes (`queue --check`, one writer per file); the
  other automations need one.
- **Start slow:** one automated trigger at a time, throttled (e.g. 1 in 10 merged PRs), human review on every PR, a cap
  on tries before a person. rig has the cap for verify (twice) and the autonomy rungs; add the throttle and the cap to rung 2 and to Maintain.
- **Source dedupe:** a ticket source (monitor, feedback) comments on the open item instead of refiling, and reopens if the
  problem persists. Needed if Maintain files intents.
- **Runs are stateless; the only memory is the tracker and the git host.** Already true of rig (files in the repo); state it in DESIGN.md as a rule so Maintain does not add a store.

His example tasks, mapped to rig:

| Task | rig today | Gap |
|---|---|---|
| Explore/triage untriaged tickets | `/rig:start` handles one request | No triage of `.rig/intent/` ideas into easy / needs-person / not-a-bug |
| Implementer, rework, automated review | `/rig:build`, `/rig:pr` fix wave | none |
| Decompose big specs | `/rig:chart` (intents ≤ 2 days) | none |
| **Ratchet** (daily: one file off an exception list, PR) | sensors + baseline | Candidate for Maintain: ratchet a baseline-waived sensor one file at a time |
| Nightly architecture drift ticket | wiki hash-check | Maintain: drift report from stale wiki pages and `design` review findings |
| Fix task for the factory's own failed runs | none | CI rig-check failures filed, always human-reviewed, never chained |
| Retro on repeated mistakes | `/rig:learn`, `/rig:rule` | none (already person-applied) |

## C. Needs an eval before it stays

- **Blind recon before brainstorm** (HumanLayer research questions: ask only how it works today, never how to build it).
  Run shop-app intents with and without it; keep only on lift in spec quality or fewer review findings. Likely only for large intents.

## D. Skipped, with reason

Pause after every phase (contradicts autonomy rungs); implementer agent per phase (CLAUDE.md: one review, ≤ 4 launches);
`NN-` numbered artifacts and `iterate-*` skills (feedback arrives as web comments; rig gates on approval files);
session-URL trailers and cloud permalinks; the four slot surveys (vendor research, goes stale; rig does not choose hosting);
a standalone glossary skill (rig already pins its terms in CLAUDE.md and DESIGN.md).

## Order

A1 (own change, spec-first) → A2+A3+A4 (one skill-text change) → B folded into the Maintain design when it starts → C as an eval.

## Status (2026-10-25)

A1 merged (dd866af). A2, A3, A4 merged (76fef40). B written into `docs/GOAL.md` as "Rules for anything that runs unattended"; the Maintain tasks there are candidates, not built. C recorded under GOAL.md "Open" with its eval plan; not built, because it needs a paid paired run a person starts.
