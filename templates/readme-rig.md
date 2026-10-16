<!-- rig:begin (written by /rig:init; edit outside these markers, a re-run replaces only this block) -->
## Development with rig

This repo uses **rig**, a thin SDLC harness for Claude Code. Ideas wait in an intent inbox (`.rig/intent/`); each one becomes a gated, tested, reviewed PR, and an incident comes back as a new intent. Every step is checked by deterministic scripts, locally and in CI, and every approval is a person's.

### Architecture

```
 YOU        /rig:start  /rig:approve                               intent, approval
 SKILLS     start · plan · build · test · pr                       the steps
 AGENTS     evaluator·opus (one advisory review per change)        model by role
 HOOKS      session-start · prompt-submit · post-edit · stop     guardrails, zero tokens
            git: pre-commit · pre-push                           any editor or agent
 SCRIPTS    .rig/bin/sdlc.ts → check · sensors · graph · …     the deterministic brain
 EVIDENCE   .rig/intent/  .rig/changes/<slug>/                  committed; read by CI
```

- **Lifecycle of one change:** intent and spec (behaviours B1, B2, …) → plan → a person approves (`approval.json`) → build test-first → test (`verify.json`: every commit and ci sensor, the contracts, a test per behaviour) → PR → review. The type (feature, bugfix, refactor, chore) decides only how new tests are proved against the base.
- **Human gate:** a person approves each change's spec and plan with `/rig:approve <slug>`; approval freezes the contract files. A model can never approve.
- **Order:** an intent starts only once the intents in its `depends:` have shipped.
- **Deterministic checks decide:** the commands in `.rig/sensors.json` (fast tests, full tests, lint, test levels, quality counts) must pass; failures that already existed are recorded as `knownRed` so rig never blocks on debt it did not create.
- **State lives in files:** `.rig/sensors.json` (config), `.rig/product/brief.md` (the product brief), `.rig/intent/` (the inbox), `.rig/changes/<slug>/` (intent, spec, plan, `approval.json`, `evidence/`, `verify.json`, `pr.md`), `.rig/bin/` (vendored harness), `.claude/` (hooks and settings), `CLAUDE.md` (project context for Claude).
- **Local equals CI:** `rig-check` in CI runs the same checks as the git hooks.

### User guide

| You want to | Run |
|---|---|
| Start a change | `/rig:start "<what you want>"` |
| Continue a change | `/rig:start <slug>` (it picks up at the first missing step) |
| Approve a change | `/rig:approve <slug>`; only a person can |
| Waive a failing sensor with a reason | `/rig:waive <sensor> <file> <reason>` (a file or `*`, for the active change; only a person can) |
| See where a change stands | `node .rig/bin/sdlc.ts status` |

Typical flow for one change (or start from an idea file: `/rig:start .rig/intent/<name>.md`):

1. `/rig:start "add user signup"`, then `/rig:plan`. Read `spec.md` and `plan.md` in `.rig/changes/<slug>/`.
2. Approve with `/rig:approve <slug>`.
3. `/rig:build <slug>` builds, tests and opens the PR. Review it, then merge as usual.
4. Commit `.rig/`, `.claude/` and `CLAUDE.md`; they are the evidence CI reads.

Good to know:

- A bug starts with a failing test; a refactor starts with characterization tests; a one-liner is a chore with almost no ceremony.
- Run the project's checks by hand with the commands in `CLAUDE.md`; `.rig/bin/sdlc.ts check` runs the gate.
- A teammate who never opens Claude Code runs `node .rig/bin/sdlc.ts hooks install` once so the git hooks apply to them.
- To upgrade rig, re-run `vendor --standalone` from a newer plugin checkout. Re-running `/rig:init` only replaces this section.
<!-- rig:end -->
