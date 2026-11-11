<!-- rig:begin (written by rig init, core profile; edit outside these markers, a re-run replaces only this block) -->
## Development with rig (core)

This repo uses **rig-core**: each change (`/rig:start <idea>`) becomes a gated, tested, reviewed PR. Deterministic scripts check every step, locally and in CI, and every approval is a person's.

- **Lifecycle of one change:** intent and spec (behaviours B1, B2, …) → plan → a person approves (`approval.json`) → build test-first → test (`verify.json`) → PR → one review. The type (feature, bugfix, refactor, chore) decides only how new tests are proved against the base.
- **Human gate:** only a person can run `/rig:approve <slug>`, and approval freezes the contract files.
- **The floor:** the sensors in `.rig/sensors.json`, secret and test-tamper checks, the git hooks and `rig-check` plus `ai-review` in CI. Failures that already existed are `knownRed`, so rig never blocks on debt it did not create.
- **Local equals CI:** `rig-check` runs the same checks as the git hooks.

| Path | What it is | Who changes it |
|---|---|---|
| `.claude/skills/rig-*/` | The slash commands below | `vendor --standalone --profile core` |
| `.claude/agents/rig-evaluator.md` | The plan reviewer | `vendor --standalone --profile core` |
| `.claude/settings.json` | Hook wiring and permission rules | `init --full`, a person |
| `.rig/bin/`, `.rig/githooks/`, `.rig/templates/` | The vendored checker, git hooks and formats | `vendor --standalone --profile core` |
| `.rig/guides/`, `.rig/sensors.json` | Guides injected at edit time; the sensor registry | a person (asks first) |
| `.rig/changes/<slug>/` | One folder per change: spec, plan, approval, evidence, `verify.json`, `pr.md` | the build steps |

| You want to | Run |
|---|---|
| Start or continue a change | `/rig:start "<what you want>"` or `/rig:start <slug>` |
| Plan it | `/rig:plan` |
| Approve it (a person only) | `/rig:approve <slug>` |
| Build, test and open the PR | `/rig:build <slug>` (runs `/rig:test` and `/rig:pr`) |
| Waive a failing sensor with a reason (a person only) | `/rig:waive <sensor> <file> <reason>` |
| Turn a repeated mistake into a rule | `/rig:rule`; `/rig:learn` proposes them from history |
| See where a change stands | `node .rig/bin/sdlc.ts status` |

- Commit `.rig/`, `.claude/` and `CLAUDE.md`: they are the evidence CI reads.
- A teammate who never opens Claude Code runs `node .rig/bin/sdlc.ts hooks install` once.
- To upgrade, a maintainer runs the plugin's upgrade; the core profile is kept.
<!-- rig:end -->
