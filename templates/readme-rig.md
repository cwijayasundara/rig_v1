<!-- rig:begin (written by /rig:init; edit outside these markers, a re-run replaces only this block) -->
## Development with rig

This repo uses **rig**, a thin SDLC harness for Claude Code. Each idea (`/rig:start <idea>`) or charted intent becomes a gated, tested, reviewed PR, and an incident comes back as a new idea. Every step is checked by deterministic scripts, locally and in CI, and every approval is a person's.

### Architecture

```
 YOU        /rig:start  /rig:approve                               intent, approval
 SKILLS     start · plan · build · test · pr · chart · and more    the steps
 AGENTS     architect·sonnet  evaluator·opus (reviews the chart)  model by role
 HOOKS      session-start · prompt-submit · post-edit · stop     guardrails, zero tokens
            git: pre-commit · commit-msg · pre-push              any editor or agent
 SCRIPTS    .rig/bin/sdlc.ts → check · sensors · verify · …    the deterministic brain
 EVIDENCE   .rig/product/  .rig/changes/<slug>/                 committed; read by CI
```

- **Lifecycle of one change:** intent and spec (behaviours B1, B2, …) → plan (checked by `plan-check`) → build test-first → test (`verify.json`: every commit and ci sensor, the contracts, a test per behaviour) → PR → review. The type (feature, bugfix, refactor, chore) decides only how new tests are proved against the base.
- **Human gate:** the PR. Nothing between a charted intent and its PR waits for a person; a sprint's chart is approved once with `/rig:approve chart-<N>`. `"gates": {"plan": true}` in `.rig/sensors.json` adds a per-change approval of spec and plan (`/rig:approve <slug>`). A model can never approve.
- **Order:** an intent starts only once the intents in its `depends:` have shipped.
- **Deterministic checks decide:** the sensors in `.rig/sensors.json` (each with a command or a built-in, a cadence and one guide sentence) must pass; failures that already existed are recorded as `knownRed` so rig never blocks on debt it did not create.
- **State lives in files:** `.rig/sensors.json` (config), `.rig/product/brief.md` (the product brief), `.rig/product/sprints/sprint-<N>/intents/` (charted intents), `.rig/maintain/proposals/` (intents proposed by Maintain), `.rig/changes/<slug>/` (intent, spec, plan, `approval.json`, `evidence/`, `verify.json`, `pr.md`), `.rig/bin/` (vendored harness), `.rig/guides/` (the guides), `.claude/` (settings; skills, agents and hook wiring after `init --full`), `CLAUDE.md` (project context for Claude).
- **Local equals CI:** `rig-check` in CI runs the same checks as the git hooks.

### Layout: what rig put in this repo

Claude Code only discovers skills, agents and hooks under `.claude/`; everything else is rig's own state under `.rig/`.

| Path | What it is | Who changes it |
|---|---|---|
| `.claude/commands/rig/` | The slash commands (`/rig:start`, `/rig:plan`, …): present only after `init --full` (a standalone copy); with `init --plugin` they come from the plugin and none are here | `vendor --standalone` (upgrade) |
| `.claude/agents/rig-*.md` | The architect and evaluator subagents: same, only after `init --full` | `vendor --standalone` |
| `.claude/settings.json` | Permission rules (ask/deny protect evidence); hook wiring only after `init --full` | `init`, a person |
| `.rig/bin/` | The vendored checker (`sdlc.ts` and its modules, `VERSION`) | `vendor --standalone` |
| `.rig/mod/` | The journey dashboard: a band above the prompt with the sprint rail, the change rail, the next command and spend (a local plugin named `rig`); only with `init --full --dashboard` | `vendor --standalone --dashboard` |
| `.rig/githooks/` | `pre-commit`, `commit-msg` and `pre-push`, run by git via `core.hooksPath` | `hooks install` |
| `.rig/guides/` | Engineering, testing and contract guides injected at edit time | a person (asks first) |
| `.rig/templates/` | Formats for intents, specs, test plans and the README block; only after `init --full` | `vendor --standalone` |
| `.rig/sensors.json` | The sensor registry: each command sensor's command, cadence and guide, and `knownRed`. The built-in sensors (secrets, test-tamper, size and the rest) are code in `.rig/bin/sensors.ts`; `node .rig/bin/sdlc.ts sensors` shows the state of all of them, and `CLAUDE.md` carries one guide line per sensor | a person (asks first) |
| `.rig/product/` | The product brief, architecture and ADRs, and one folder per sprint (`sprints/sprint-N/`: PRD, intents, test plan, review, approval) | a person, `/rig:chart` |
| `.rig/changes/<slug>/` | One folder per change: spec, plan, approval, evidence, `verify.json`, `pr.md` | the build steps |
| `.rig/.gate` | Local gate state, never committed | rig |
| `.rig/.gitignore` | What under `.rig/` stays local; committed | rig |

### User guide

| You want to | Run |
|---|---|
| Plan a whole sprint from a PRD (greenfield or brownfield) | write `docs/prd/sprint-0/prd.md` (one folder per sprint), then `/rig:chart 0 @docs/prd/sprint-0/prd.md` (it asks nothing unless you add `--ask`: intents, architecture, test plan, review). To let it run until every output exists, paste the `/goal` line that `node .rig/bin/sdlc.ts chart goal 0 --print --prd docs/prd/sprint-0/prd.md` prints |
| Start a change | `/rig:start "<what you want>"` |
| Continue a change | `/rig:start <slug>` (it picks up at the first missing step) |
| Approve a change | `/rig:approve <slug>`; only a person can |
| Waive a failing sensor with a reason | `/rig:waive <sensor> <file> <reason>` (a file or `*`, for the active change; only a person can). An agent may request one (`S waive --request <sensor> <file> <reason>`), and a person grants it by approving the PR; copy `templates/rig-approved.yml` beside `rig-check.yml` so the approval re-runs the check |
| See where a change stands | `node .rig/bin/sdlc.ts status` |

**New repo with a PRD?** Start the outer loop, not `/rig:start`. Put the PRD in `docs/prd/sprint-0/prd.md`, one folder per sprint (`docs/prd/prd-template.md` is the format; after `init --full` the others are in `.rig/templates/`; give every requirement an id like `FR-1`). Then `/rig:chart 0 @docs/prd/sprint-0/prd.md` (gap questions, intents, architecture, the product brief, ADRs, test plan and cases, an Opus review), review the branch, `/rig:approve chart-0` (a person; with no remote it merges the chart branch into main itself, otherwise merge the chart PR), and build each intent with `/rig:start .rig/product/sprints/sprint-<N>/intents/<slug>.md`. `node .rig/bin/sdlc.ts ready` lists what can start.

Typical flow for one change (or start from a charted intent: `/rig:start .rig/product/sprints/sprint-<N>/intents/<slug>.md`; a team charts a sprint first with `/rig:chart <N>`, and a person approves it with `/rig:approve chart-<N>`):

1. `/rig:start "add user signup"`, then `/rig:plan`. Read `spec.md` and `plan.md` in `.rig/changes/<slug>/`.
2. It carries on by itself: build, tests and the PR (with `gates.plan: true` it stops first for `/rig:approve <slug>`).
3. Review the PR, then merge as usual.
4. Commit `.rig/`, `.claude/` and `CLAUDE.md`; they are the evidence CI reads.

Good to know:

- A bug starts with a failing test; a refactor starts with characterization tests; a one-liner is a chore with almost no ceremony.
- Run the project's checks by hand with the commands in `CLAUDE.md`; `.rig/bin/sdlc.ts check` runs the gate.
- A teammate who never opens Claude Code runs `node .rig/bin/sdlc.ts hooks install` once so the git hooks apply to them.
- To upgrade rig, load a newer rig checkout as a plugin (`claude --plugin-dir <rig checkout>`) and run its `rig:upgrade` skill: it shows the plan, asks about files you changed and applies on a branch. Re-running `/rig:init` only replaces this section.
- **Model versions:** agents name a model by alias (`sonnet`, `opus`), never a version. `ANTHROPIC_DEFAULT_SONNET_MODEL` and `ANTHROPIC_DEFAULT_OPUS_MODEL` in `.claude/settings.json` `env` map each alias to a release; change those two lines when a new model ships (unset, the aliases follow the newest). `models.*` in `.rig/sensors.json` name a role's family, so a bump never trips `model-role`.
<!-- rig:end -->
