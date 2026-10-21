---
name: init
description: One-time setup of a repo for the sdlc harness. Brownfield writes a compact CLAUDE.md from a cheap parallel scout sweep; greenfield scaffolds a walking skeleton with test and lint commands. Never rerun per task.
argument-hint: '[--quick | --defaults] [greenfield "<stack and goal>"]'
model: sonnet
effort: medium
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git init*), Bash(git add *), Bash(git commit *), Bash(git status*), Bash(git remote*), Bash(git rev-parse*), Bash(npm test*), Bash(npm run *), Bash(node --test*), Bash(node --check *), Bash(node --version), Bash(make test*), Bash(make lint*), Read, Write, Edit, Glob, Grep, AskUserQuestion, Agent
---
# Initialise this repo
**Subagents:** run them in the foreground (never `run_in_background`) and wait; never end your turn while one is running. Every agent of one step goes in one message. Run each command as its own Bash call (no `cd`, pipes, redirects, `&&`, variables or heredocs); read files with Read; one-line commit messages — compound commands are denied in unattended runs and stall the install.

Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts init` first.
## `--defaults` mode
When the arguments contain `--defaults`, the person has pre-approved every recommended answer below, so ask no AskUserQuestion at all. Use these answers:
- Greenfield: stack, deployment target and test framework come from the quoted goal; anything it leaves out takes the recommended default (deployment: local only).
- **Sensors:** run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts init --stack`: it detects the stack from `templates/stacks/*.json` and writes `.rig/sensors.json` as a registry (each sensor: a command or a built-in, a cadence, `blocks`, one guide sentence). Do not add sensors yourself: the settings ask rule on `.rig/sensors.json` makes a person confirm any command a model adds, and an unattended run cannot answer. Then run `sdlc.ts sync` and `sdlc.ts baseline` as in Both steps 1 and 2. Say that adjusting the commands needs the person's yes (re-run `/rig:init` without `--defaults`).
- Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts init --full`: it vendors the standalone harness, wires the git hooks and merges `templates/settings.json` into `.claude/settings.json`.
- Skip: `--workflows` (`.github/workflows/rig-check.yml` and `REVIEW.md`): it needs a remote, so it stays an explicit yes.
- Existing `CLAUDE.md` still gets a proposed diff, never an overwrite: write the diff to `CLAUDE.md.proposed` and say so.
End with a table of every answer taken and every item skipped, and how to do each skipped one (re-run `/rig:init` without `--defaults`).
## `--quick` mode
The fast lane for a person at the keyboard, so the "skip in unattended or cloud runs" notes of Both step 3 do not apply: everything in `--defaults` (same answers, no AskUserQuestion at all) except its Skip bullet, which this mode replaces with one item, taken as a yes without asking: **Workflows:** add `--workflows` to `init --full` only when `git remote get-url origin` succeeds; with no remote, skip and say so. The permission prompts of the settings ask rule (not a question you ask) still have the person confirm the `.rig/sensors.json` and `.claude/settings.json` edits. A remote not named `origin` gets no workflows: say so in the table. Adjusting sensor commands stays a re-run without a flag, as under `--defaults`. End with the same table as `--defaults`.

## Brownfield (source code exists)
1. Launch three `Explore` agents with model `haiku` **in one message** so they run in parallel:
   - (a) stack, entry points and a module map;
   - (b) the exact build, test, lint and type-check commands, including a fast targeted test command and how to make output quiet;
   - (c) conventions, gotchas, environment setup and things that must never be done.
2. Verify the fast test command by running it once with quiet output.
3. Write `CLAUDE.md` in **at most 120 lines**. Sections:
   - a first line under the title, verbatim: `sdlc routes all work in this repo: start with /rig:start; use superpowers skills only when an sdlc skill names one.` Skills are `/rig:x` in every install mode (a standalone install names its vendored skills `rig:x` too), so never write `/rig-start`.
   - What this is (3 lines)
   - Map (directories, one line each)
   - Commands
   - Conventions
   - Gotchas
   - `## Review`: the rules the `/rig:pr` reviewer follows in this repo, verbatim: "Flag any API, schema or event change that the change's plan.md `## Contracts` does not announce." and "Flag anything the brief's non-goals exclude." (`/code-review` reads CLAUDE.md, not REVIEW.md.)
   - `# Compact instructions`: keep the active sdlc change, failing tests and file paths; drop exploration output.

   If a `CLAUDE.md` already exists, propose edits as a diff and do not overwrite it.

## Greenfield
1. Ask up to three questions with AskUserQuestion: stack, deployment target, and test framework (recommend defaults).
2. Scaffold the smallest walking skeleton that builds, plus one passing smoke test, a lint config, and a `Makefile` or package scripts with `test`, `test-fast` and `lint` targets. For Node the `lint` script is `node --check src/index.js`; never write scaffold helper files under `.rig/` (that is the vendored harness, and writing there asks the person). For Node, the test script is `node --test` with no directory argument: Node 24 reads `test/` as a module path and fails with `MODULE_NOT_FOUND` before any test runs, which also stops the red-proof gate on the base commit.
3. Write `CLAUDE.md` as above, then `git init` if needed.

## Both
1. **Sensors.** Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts init --stack` (name the stack when several match). It writes `.rig/sensors.json` from the stack pack as a registry. Adjust each sensor's `cmd` to what scout (b) found (the real test command, an existing linter config), keeping its `id`, `cadence`, `blocks` and `guide`; a command sensor named `unit` is the one red-proof runs. Declare `contracts.files` when the repo has OpenAPI, AsyncAPI or other frozen executable specs. Leave `paths.tests` alone unless test files live outside the defaults; a narrower list is flagged as weakening the harness. Show the file and write it on a yes, then run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts sync` to write the guides block into `CLAUDE.md`. Run each command once before writing: one that cannot run (a missing tool) is left out and named in the summary with how to enable it.
2. **Baseline.** Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts baseline` once (no change is needed). It runs each turn-cadence sensor once, writes the ids of already-failing ones into `knownRed` (the gate never blocks on debt it did not create) and prints each result. Tell the person its output.
3. **Install (the default is standalone).** Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts init --full`, adding `--workflows` on the person's yes when the repo has a remote (it writes `.github/workflows/rig-check.yml` and `REVIEW.md`, never over an existing file). Skip `--full` only if the person said the team installs the plugin: then run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts vendor` (CI runs that copy) and add `--workflows` separately. `--full` copies scripts, skills, agents and hooks into `.rig/bin` and `.claude/`, wires the git hooks and merges `templates/settings.json`. Say: the commands are `/rig:start`, `/rig:plan`, `/rig:build`, `/rig:test` and `/rig:pr`; the human gates are `/rig:approve` and `/rig:waive`; to upgrade, re-run `vendor --standalone` from a newer plugin; a teammate who never opens Claude Code runs `node .rig/bin/sdlc.ts hooks install` once.
4. **Verify.** List `.github/workflows/`, run `git remote get-url origin` and copy its output into the report verbatim (never retype or shorten a URL or owner), and report the workflows as installed, skipped by the person, or failed (with why). A missing remote means local-only PRs: say so. Some starter tools use the network (npm audit, semgrep --config auto, govulncheck, pip-audit, OWASP dependency-check); say so.
   Tell them: make `rig-check` a required check, add CODEOWNERS entries for `.rig/**` and the workflows, add an `SDLC_CONSUMERS_TOKEN` secret if a consumer repo is private, and `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`) or `ANTHROPIC_API_KEY` for the review.
5. **README.** Document rig in the repo's own `README.md` from `${CLAUDE_PLUGIN_ROOT}/templates/readme-rig.md` (architecture and user guide). **Brownfield:** keep the existing `README.md` and change only the block between `<!-- rig:begin` and `<!-- rig:end -->`: replace it if present, else append it at the end; with no `README.md`, create one with a title, a three-line summary from scout (a) and the block. **Greenfield:** create `README.md` with the project title, the goal, how to build, test and lint (the scaffold's commands), then the block. Never touch text outside the markers; under `--defaults` do this too (it is not a settings edit).
6. **Wiki (brownfield only).** Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts wiki init`: it proposes `.rig/wiki.json` and stops. Do not wait or build: tell the person to edit it, then run `/rig:wiki build --max-usd <N>`.
End by telling the person to commit `README.md`, `.rig/`, `.claude/` and `CLAUDE.md` (make a first commit if the repo has none; ship and CI need a base), then the next step, the same in every install mode. **Greenfield, or any repo with a PRD:** the outer loop comes first. Tell the person to put the product brief in `.rig/product/brief.md` and the PRD in `.rig/product/prd/sprint-0.md` (any format; or skip the copy and pass a PRD already in the repo, such as `docs/prd/*.md`, to `/rig:chart` as a path: it copies the PRD there and asks for any missing technology or NFRs), then `Next: /rig:chart 0`, then `/rig:testplan 0` and `/rig:approve chart-0`. **One-off change with no PRD:** `Next: /rig:start "<first task>"`.
