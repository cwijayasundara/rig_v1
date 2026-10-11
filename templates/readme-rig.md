<!-- rig:begin (written by /rig:init; edit outside these markers, a re-run replaces only this block) -->
## Development with rig

This repo uses **rig**, a thin SDLC harness for Claude Code. Work moves through three loops that share one intent inbox (`.rig/intent/`): **plan** (a sprint's PRD becomes the architecture, intents with dependencies and a test plan, approved once per sprint), **build** (each intent becomes a gated, tested, reviewed PR) and **run** (deploys are gated and watched; a breach or incident comes back as a new intent). Every step is checked by deterministic scripts, locally and in CI, and every approval is a person's.

### Architecture

```
 YOU        /rig:chart  /rig:start  /rig:next  /rig:approve        plan, intent, approval
 SKILLS     chart · start design plan diagnose build test pr …   the stages
 AGENTS     scout·haiku  implementer·sonnet  reviewer·opus       model by role and tier
 HOOKS      session-start · prompt-submit · post-edit · stop     guardrails, zero tokens
            git: pre-commit · pre-push                           any editor or agent
 SCRIPTS    .rig/bin/sdlc.ts → check · sensors · graph · …     the deterministic brain
 EVIDENCE   .rig/product/  .rig/intent/  .rig/changes/<slug>/    committed; read by CI
```

- **Lifecycle of one change:** intent → (spec → plan →) design → build → test → sensors → PR → review. How many stages run depends on the change type (greenfield, feature, bugfix, refactor, migration, chore, spike, incident) and its tier (S, M, L).
- **Human gates:** a person approves each sprint's chart (`/rig:approve chart-N`), and each change's design or plan (tier M and L, and greenfield; spec too where that stage runs). A model can never approve.
- **Sprints:** the PRD lives in `.rig/product/prd/sprint-N.md` (format: rig's `templates/prd-format.md`); the living architecture, ADRs and test plan in `.rig/product/`. An intent starts only once its sprint's chart is approved and its `depends:` have shipped. Sprint 0 is greenfield; every later sprint builds on the code already here.
- **Deterministic checks decide:** the commands in `.rig/sensors.json` (fast tests, full tests, lint, test levels, quality counts) must pass; failures that already existed are recorded as `knownRed` so rig never blocks on debt it did not create.
- **State lives in files:** `.rig/sensors.json` (config), `.rig/product/` (PRD, architecture, test plan), `.rig/intent/` (the inbox), `.rig/changes/<slug>/` (intent, design, plan, verification, approvals, `pr.md`), `.rig/bin/` (vendored harness), `.claude/` (hooks and settings), `CLAUDE.md` (project context for Claude).
- **Local equals CI:** `rig-check` in CI runs the same checks as the git hooks.

### User guide

| You want to | Run |
|---|---|
| Start a change | `/rig:start "<what you want>"` (the type and tier are chosen for you) |
| Chart a sprint from its PRD | `/rig:chart .rig/product/prd/sprint-N.md`, then a person runs `/rig:approve chart-N` |
| See what can be started | `node .rig/bin/sdlc.ts inbox --ready` (`--sprint N`, `--owner <name>`) |
| Move to the next stage | `/rig:next` (chains build, test, sensors and PR; fix rounds are capped) |
| Approve a gate | `/rig:approve <slug> design` (also `spec`, `plan`); only a person can |
| Waive a failing sensor with a reason | `/rig:waive <slug> <sensor> "<reason>"` |
| See where a change stands | `/rig:status` |

Typical flow for one change (in a sprint, start from a ready intent: `/rig:start .rig/intent/<name>.md`):

1. `/rig:start "add user signup"`. Read the design or plan it writes in `.rig/changes/<slug>/`.
2. Approve the gate with `/rig:approve <slug> design`.
3. `/rig:next` until the PR node writes `pr.md`. Review it, then merge as usual.
4. Commit `.rig/`, `.claude/`, `.claude-plugin/` and `CLAUDE.md`; they are the evidence CI reads.

Good to know:

- A bug starts with a failing test; a refactor starts with characterization tests; a one-liner is a chore with almost no ceremony.
- Run the project's checks by hand with the commands in `CLAUDE.md`; `.rig/bin/sdlc.ts check` runs the gate.
- A teammate who never opens Claude Code runs `node .rig/bin/sdlc.ts hooks install` once so the git hooks apply to them.
- To upgrade rig, re-run `vendor --standalone` from a newer plugin checkout. Re-running `/rig:init` only replaces this section.
{{BRAIN}}<!-- rig:end -->
