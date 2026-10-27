# One door, right-sized: a flexible SDLC without a second command

Status: agreed 2026-10-27 (decisions at the end). Not built, except the README answer (P0).

Design constraint (owner, 2026-10-27): keep the harness as light and lean as possible, with fewer restrictions. Every
step below either removes ceremony or adds none by default; nothing adds a new block.

## The ask

A customer, in a client meeting:

> Is the software development lifecycle enforced by the harness a rigid one-size-fits-all model or a customizable
> meta-pattern?

The owner's follow-up: keep the playbook-shaped commands (`/rig:chart`, `/rig:start`, ...), but when someone wants to vibe code
a feature the guides and sensors should still apply, and a "grill me" interview could turn what they want into a spec first.

Sources read: Anthropic, *The AI-native SDLC playbook* (claude.com/resources/articles/the-ai-native-sdlc-playbook). Survey
pages on Kiro, GitHub Spec Kit and BMAD (vendor-adjacent blogs, not official docs; mode names unverified).

## What the playbook says

- It is a pattern, not a template: "Consider the above a starting point to tailor, rather than a recommendation to copy."
  "The AI-native SDLC has to fit around what exists." "The steps are modular."
- It has one route, compressed rather than forked: `intent.md` then `spec.md`, and "Requirements and design collapse into
  one session." "Nothing is implemented without an accepted plan."
- It sizes people's involvement by risk, not by command: auto mode for "a tight `spec.md`, a small blast radius, and code the
  tests already cover"; "anything the organization classes as higher risk goes to a tech lead or architect"; "Tier the
  autonomy by environment."
- It never mentions vibe coding or prototyping. Anything rig does there is our own addition.

Other tools split the same way: Kiro has vibe mode, spec mode and a Quick Spec without approval gates; BMAD has Full (PRD,
architecture, stories) and Quick (one combined spec, same elicitation). Both put the choice on the person, up front.

## Where rig stands

| Layer | rig today | Gap |
|---|---|---|
| Floor: guides, sensors, secrets, test-tamper, git hooks, `rig-check` | Runs on every edit with or without a change: `scripts/hooks.ts:127` ("Unplanned work gets exactly the same checks") and the end-of-turn gate at `hooks.ts:202`; covered by `gate.spec.ts`, `seeded.spec.ts`, `sdlc.spec.ts` | none; not stated anywhere a customer reads |
| Vibe work at CI | A PR with no change record is tier 1 (`scripts/risk.ts:41`) | no path to turn vibe work into a change |
| Ceremony | `/rig:start` → `/rig:plan` → approve → `/rig:build` → `/rig:pr`; `/rig:chart` for a sprint | one weight for every change: a one-line bugfix pays what a contract change pays |
| Change types | `feature`, `bugfix`, `refactor`, `chore` (`scripts/lifecycle.ts:9`) | the type changes the spec's wording, not the steps |
| Interview | `/rig:start` step 2 runs `superpowers:brainstorming` and skips its size step | collaborative, not adversarial; can end with soft answers |

So the honest answer to the customer today: the quality floor is fixed and applies to any work; the lifecycle is one path you
opt into, and it does not yet change weight with the change.

## Options considered

1. **A separate `/rig:quick "<idea>"`** (BMAD Quick, Kiro Quick Spec). Rejected: the person must pick quick or full before they
   know the change's size, and a second command is one more thing to learn. The playbook compresses one route; it does not
   fork it.
2. **Make vibe coding grill the person.** Rejected: deciding which prompts deserve an interview needs a model reading every
   prompt in a hook, which breaks GOAL rule 3 (no hook calls a model). A false positive interrupts someone mid-flow, and
   people explore precisely because they do not yet know what they want, so an early interview collects guesses.
3. **One door that sizes itself after the interview.** Chosen. Below.

## Proposal

Three ways in, two commands to learn:

| Way in | Command | What runs |
|---|---|---|
| Explore | none, just code | the floor; CI marks the PR tier 1 |
| Build something | `/rig:start "<idea>"` | grill-me interview, then a script sizes the rest |
| Plan a sprint | `/rig:chart` | unchanged |

### P1. Name the floor (docs and one test)

State in `README.md` and `docs/GOAL.md` that the floor applies to all work, planned or not, and list what it is. Add one
scripted e2e case: no active change, an edit that breaks a sensor, the Stop gate blocks. Most of the customer's question is
answered by this step.

### P2. The `/rig:start` conversation becomes a grill

Rewrite step 2 of `skills/start/SKILL.md`, keeping `superpowers:brainstorming` as the engine (native first), with these added
rules: one question at a time; challenge each answer (edge cases, failure behaviour, what is out of scope, who is hurt if it
is wrong); stop only when `## Open questions` is `none` or each remaining one has a default a person accepted. This is the
playbook's "requirements and design collapse into one session". No new skill.

### P3. A script sizes the change after the interview

Once `spec.md` has its blast radius, `sdlc.ts` predicts the risk tier from what is known before code exists: blast-radius
paths against `risk.alwaysHuman`, protected and contract globs, and any `## Access` action on the intent. The same signals as
`assessRisk` (`scripts/risk.ts`), minus diff size and review findings, which do not exist yet. The prediction picks the weight:

| Predicted tier | Weight | What is written and approved |
|---|---|---|
| 0 or 1 | light (the default) | `intent.md`, `spec.md`, `plan.md` written in one turn, each short; one approval; build; PR |
| 2 | full | today's flow, contracts frozen at approval |

Light is the default because most changes are small; full is kept only where the article's "higher risk goes to a tech lead
or architect" applies: always-human paths and `## Access` actions.

Light keeps the same three files so `approve`, `verify`, red-proof, the AC→test gate and `/rig:pr` work unchanged; it changes
the templates' required sections, not the gates. Which sections light may drop is settled in the design, against what
`S approve` checks today. The person can always ask for full; only tier 2 forces it, and the CI tier
from the real diff still applies at the PR (a light change that grows past `risk.maxLines` is tier 1 there).

### P4. Vibe work can be captured: `/rig:start --from-diff`

Exploring stays free and silent: no nudge, no prompt, no new block. The floor and the tier-1 label at CI are the only
signals. The person runs `/rig:start --from-diff` when they want the work tracked.

`--from-diff` runs the same grill against what was built, writes `intent.md` and `spec.md` with behaviours drawn from the
diff, and the build step adds a test per behaviour. Tests written after the code prove nothing unless they fail without it,
so red-proof stashes the source changes, runs the new tests and requires them to fail, then restores the stash. A behaviour
whose test passes with the code stashed is reported, not accepted.

Every change ships on a feature branch through a PR to the base branch, vibe work included (decision 2). `--from-diff` takes
both the uncommitted diff and the branch's commits not yet in a change (`defaultBase()...HEAD`); on the trunk it moves them to
`sdlc/<slug>` first, as `/rig:build` already does (`skills/build/SKILL.md` step 2). Vibe work that is never captured still
reaches the base only by a PR, where `rig-check` marks it tier 1. rig adds no block for this: "no direct push to the base"
is GitHub branch protection, which `/rig:init` already offers (`init --protect`).

### Dropped: team configuration

An earlier draft added `risk.minWeight` per tier and a vibe-nudge setting. Dropped for leanness: the defaults above need no
config, and a team that wants more ceremony writes its own Claude Code skill. Add a setting only when a team asks for one.

## Not copied

- A separate quick command (BMAD, Kiro): the person would choose the size before knowing it.
- Quick Spec without approval (Kiro): rig's rule is that a person approves every plan; light shortens the plan, not the gate.
- A configurable step graph or per-tier config: a workflow engine is code native skills already cover.
- A vibe-mode nudge: any prompt during exploration is friction the owner asked to avoid.

## Order and evidence gates

1. P1 (docs and one e2e case). No eval needed.
2. P2 and P3 together, with a new eval arm: light versus full on small tier-0 tasks, measured in dollars per accepted task.
   The working guess is that light matches full on accepted tasks at a fraction of the cost; keep light only if the eval
   shows it, and cut it after two passes with no lift (GOAL rule 4).
3. P4, with a spec that a retro-test passing with the code stashed is refused.

## Decisions (2026-10-27)

1. Light keeps today's required sections in `spec.md` and `plan.md`. Light means written in one turn and kept short, not
   fewer sections, so `S approve` and every downstream check stay unchanged.
2. Every change, vibe-coded work included, goes on a feature branch and ships by a PR to the base branch. `--from-diff`
   covers the uncommitted diff and the branch's commits not yet in a change. Enforcement is native branch protection, not a
   new rig block.
3. The customer-facing answer goes in `README.md` now, worded as today plus roadmap (P0, done with this proposal).

## Answer for the customer (today plus roadmap)

> The harness has two layers. The quality layer (coding guides, sensors, secret and test-tamper checks, the CI gate) is
> fixed and applies to all work, including exploratory "vibe" coding. The lifecycle layer follows Anthropic's AI-native SDLC
> playbook and is a pattern, not a template. Today it is one path you opt into; on the roadmap, it is light by default and only
> high-risk changes take the full path. Exploratory work can be turned into a tracked change later, with tests that
> must prove they fail without the code.
