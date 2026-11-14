# W1: model pairs, agent reports, launch budget, waiver requests, CI re-run on approval

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** W1 of `docs/proposals/2026-11-14-implementation-order.md`. It covers the following, all deterministic:
- poteto N5 (status reports), N6 (cost per launch), D1 (model pairs by weight) and D2 (5 launches per change);
- two-gates G0 (waiver requests, and CI re-running on a PR approval).

**Architecture:**
- **Scripts decide, and models only report.** The model pair is computed by `risk.ts` from the planning weight and, after the diff,
  the pre-review tier.
- **Agent launches and their reports** are recorded by the existing Agent hooks into the change's `evidence/agents.jsonl`. The
  PreToolUse hook enforces the launch budget.
- **A waiver request** is a waiver row with `requested: true`, which the agent may write. CI already treats every added waiver row as
  needing an independent approval (`check.ts:461-467`).
- **A new `rig-approved.yml` workflow** re-runs the `rig-check` job when a review is submitted.

**Tech Stack:** Node 22 TypeScript run by `node` directly (no build), and `node:test` specs in `scripts/*.spec.ts` using `scripts/testkit.ts`.

**Spec:** `docs/proposals/2026-11-14-inner-loop-from-poteto-mode.md` §4 (N5, N6) and §8 (D1, D2); `docs/proposals/2026-11-14-two-human-gates.md` §4, §5 and G0.

## Global Constraints

- **Line limits:**
  - every script is at most 500 lines (`scripts/size.spec.ts`), and `sdlc.ts` and `check.ts` are already at 500, so changes there
    must replace lines, not add them;
  - every skill is at most 60 lines;
  - the harness total is at most 15000.
- **Defaults:** `models.light = { build: 'haiku', evaluate: 'sonnet' }`, `models.full = { build: 'sonnet', evaluate: 'opus' }`, and
  `LAUNCH_BUDGET = 5`.
- **Report line:** the last line of an agent's answer matches `/^status:\s*(DONE_WITH_CONCERNS|DONE|BLOCKED)\b[ :—-]*(.*)$/im`. The
  last match wins.
- **Hooks never throw on bad input.** A missing field is recorded as `null`.
- **Specs.** Each behaviour gets a spec that fails without it. Follow existing specs: `registryhooks.spec.ts` for hooks,
  `check.spec.ts` for CI, `pr.spec.ts` (or its nearest neighbour) for pr.
- **Verify** with `npm test` (all green) and `npm run typecheck`.

## Review Focus

- **No active change** (during chart or ad-hoc work): nothing is recorded and no budget applies. Test in Task 2.
- **A malformed `tool_response`** (no `content`, `content` as a string, missing usage numbers): record `null`s and never throw. Test in
  Task 2.
- **An agent that ends without a status line**: recorded as `status: null`, shown as "no report" in the PR body, and never treated as
  BLOCKED. Test in Task 3.
- **A requested waiver of a never-waivable finding** (`plan-gate`, CI `contracts` or `harness-tamper` on harness files) still blocks.
  Test in Task 4.
- **A light change whose diff reaches tier 2**: evaluate on `full.evaluate`. The security pass is always on `full.evaluate`. Test in
  Task 1.

---

### Task 1: model pairs (`S models`)

**Files:**
- Modify `scripts/registry.ts`:
  - the `Registry.models` type adds `light: { build: string; evaluate: string }` and `full: { build: string; evaluate: string }`;
  - add the defaults;
  - the parse at lines 187-192 accepts `light`/`full` objects with string `build`/`evaluate`, and otherwise reports an error naming
    `models.light` or `models.full`.
- Modify `scripts/risk.ts`:
  - factor the body of `cmdWeight` into `export function weightOf(slug: string): Weight`;
  - add `modelPair` and `cmdModels`.
- Modify `scripts/sdlc.ts`: add `models: cmdModels` to an existing `COMMANDS` line and `cmdModels` to the existing `./risk.ts`
  import. The net line count must not grow.
- Test: `scripts/models.spec.ts`.

**Interfaces (produces):**
- `export type Pair = { weight: 'light' | 'full'; build: string; evaluate: string; security: string; fallback: string | null; reasons: string[] }`
- `export function modelPair(weight: 'light' | 'full', tier: 0 | 1 | 2 | null, models: Registry['models']): Pair`
  - `full`: the `full` pair, with `fallback: null`.
  - `light`: the `light` pair, with `fallback: models.full.build`.
  - `light` with `tier >= 1`: `evaluate = models.full.evaluate`, and a reason ``tier <n> after the diff: the change outgrew its light plan``.
  - `security` is always `models.full.evaluate`.
- `S models [<slug>] [--after-diff] [--json]` prints `weight: <w>`, `build: <m>`, `evaluate: <m>`, `security: <m>`, then
  `fallback: <m>` when one exists, then `- <reason>` lines.
  - `--after-diff` computes the tier with `riskOf(branchDiff(defaultBase() ?? 'HEAD').filter(d => ships(slug)(d.file)), [slug], registry, parseAccess(read(archPath)), false, true)`.

- [ ] Step 1: Write the failing specs in `models.spec.ts`:
  - `modelPair('light', null, defaults)` returns `{ weight:'light', build:'haiku', evaluate:'sonnet', security:'opus', fallback:'sonnet', reasons:[] }`.
  - `modelPair('full', null, defaults)` returns build `sonnet`, evaluate `opus` and fallback `null`.
  - `modelPair('light', 2, defaults).evaluate === 'opus'`, and its reasons include `tier 2 after the diff`; the same holds for tier 1.
  - A registry with `models.light: { build: 'sonnet' }` keeps `evaluate: 'sonnet'` (the default) and parses with no errors.
    `models.light: 'x'` gives an error naming `models.light`.
  - `S models <slug>` on a light change in a temp repo (testkit) prints `build: haiku`. `--json` parses to the `Pair` shape.
- [ ] Step 2: Run `node --test scripts/models.spec.ts` and expect it to FAIL.
- [ ] Step 3: Implement as above.
- [ ] Step 4: Run `node --test scripts/models.spec.ts scripts/registry*.spec.ts scripts/risk.spec.ts scripts/size.spec.ts` and expect
  PASS.
- [ ] Step 5: Commit with `feat(models): model pair per planning weight, escalated by the pre-review tier`.

### Task 2: agent records, cost and launch budget (N5, N6, D2)

**Files:**
- Create `scripts/agents.ts`.
- Modify `scripts/core.ts:21`. `HookInput.tool_response` gains `content?: unknown`, `totalTokens?: unknown`,
  `totalToolUseCount?: unknown` and `totalDurationMs?: unknown`.
- Modify `scripts/hooks.ts`, in `hookAgentLaunch` and `hookAgentDone`.
- Test: `scripts/agents.spec.ts`.

**Interfaces (produces):**
- `export const LAUNCH_BUDGET = 5`
- `export type AgentRow = { id: string; agent: string; model: string | null; at: string; status: 'DONE' | 'DONE_WITH_CONCERNS' | 'BLOCKED' | null; note: string; tokens: number | null; toolUses: number | null; ms: number | null }`
- `export function parseReport(text: string): { status: AgentRow['status']; note: string }`
  - It uses the Global Constraints regex.
  - When there is no match, it returns `{ status: null, note: '' }`.
- `export function responseText(resp: unknown): string`
  - `content` can be a string, or an array of `{ type: 'text', text }` joined by `\n`.
  - Anything else gives `''`.
- `export function recordLaunch(slug: string, l: { id: string; agent: string; model: string | null; at: string }): void`
  - It appends `{ kind: 'launch', ... }` to `.rig/changes/<slug>/evidence/agents.jsonl`, creating the folder if needed.
- `export function recordDone(slug: string, id: string, resp: unknown): void`
  - It appends `{ kind: 'done', id, status, note, tokens, toolUses, ms }`.
  - It reads `totalTokens`, `totalToolUseCount` and `totalDurationMs`. Each is a finite number, otherwise `null`.
- `export function agentRows(slug: string): AgentRow[]` merges the launch and done rows by id, in launch order.
- `export function budgetRefusal(slug: string): string | null`
  - It returns `null` while fewer than `LAUNCH_BUDGET` launch rows exist.
  - Otherwise it returns ``launch budget: <slug> has had 5 agent launches (the limit per change). Do not retry: open a draft PR with `S pr <slug> --draft --message "<type(scope): summary>"` and say in it what is left``.
- **Hooks**, both only when `activeSlug()` is non-null:
  - `hookAgentLaunch` first checks `budgetRefusal`. On a refusal it prints the PreToolUse deny JSON, in the same shape as
    `hookHoldoutGuard` (`hooks.ts:72-75`), and records nothing. Otherwise it calls `recordLaunch`. Keep the existing
    `modelstate` call.
  - `hookAgentDone` calls `recordDone` as well as the existing `recordResolved`.

- [ ] Step 1: Write the failing specs:
  - `parseReport` handles `'…\nstatus: DONE'`, `'status: DONE_WITH_CONCERNS — no test for empty input'` (note
    `no test for empty input`), `'status: BLOCKED: no API key'`, and lowercase `done` (status `DONE`). Two status lines give the last
    one. No status line gives `null`.
  - `responseText` handles a string, an array of text blocks, `undefined` and a number.
  - Through `hook(repo, 'agent-launch' …)` and `'agent-done'` with an active change: one launch, then done with
    `{ content:[{type:'text',text:'status: DONE'}], totalTokens: 1200, totalToolUseCount: 7, totalDurationMs: 90000 }`, gives
    `agentRows` = one row with `DONE`, 1200, 7 and 90000.
  - Done with `tool_response: {}` gives a row with `status:null`, `tokens:null` and no throw.
  - Five launches pass. The sixth prints a deny whose reason contains `launch budget` and `--draft`, and `agentRows` stays at 5.
  - With no active change, no `agents.jsonl` is written and the sixth launch is not denied.
- [ ] Step 2: Run `node --test scripts/agents.spec.ts` and expect FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run `node --test scripts/agents.spec.ts scripts/registryhooks.spec.ts scripts/size.spec.ts` and expect PASS.
- [ ] Step 5: Commit with `feat(agents): record each agent's report, tokens and minutes; cap launches per change at 5`.

### Task 3: reports in the PR, draft PRs, and cost in `sdlc report`

**Files:**
- Modify `scripts/prbody.ts`.
- Modify `scripts/pr.ts`.
- Modify `scripts/report.ts`.
- Test: the existing PR body spec file, plus a pr spec.

**Interfaces:**
- **Consumes** `agentRows(slug)` and `AgentRow` (Task 2).
- **`prBody` input gains `agents?: AgentRow[]`.**
  - Under `## What the checks would miss`, add one line per `DONE_WITH_CONCERNS` row: `- <agent> (<model>): <note>`.
  - Add a section `## Agents` with:
    - one line per row: `- <agent> on <model>: <status ?? 'no report'>, <tokens ?? '?'> tokens, <toolUses ?? '?'> tool uses, <minutes, 1 decimal ?? '?'> min`;
    - then a total line, `Total: <n> launches, <sum tokens> tokens, <sum min> min` (unknown values count as 0, with `(some unknown)` appended).

    When `agents` is empty or absent, the section is omitted.
  - **A body with a BLOCKED row or `draft: true`** starts with `> Draft: blocked. <notes of BLOCKED rows joined by '; ', or the --draft reason>`.
- **`S pr --draft`**, or any BLOCKED row in `agentRows(slug)`:
  - It skips the `verifyFresh` refusal and the `untestedAcs` refusal only. Every other refusal stays.
  - It runs `gh pr create --draft`.
  - Its output ends with `(draft)`.
  - The `--draft` value may carry a reason (`--draft "<why>"`). A bare `--draft` uses `no reason given`.
- **`buildReport` (`report.ts`)** gains `agents: { launches: number; tokens: number; minutes: number; changes: number }` summed over
  the shipped changes' `agents.jsonl`. `reportText` adds the line
  `  agent cost                 <launches> launches, <tokens> tokens, <minutes> min over <changes> change(s)`.

- [ ] Step 1: Write the failing specs:
  - The PR body with one `DONE_WITH_CONCERNS` row lists its note under What the checks would miss, and `## Agents` shows its tokens.
  - A BLOCKED row makes the body start with `> Draft: blocked.`.
  - No agents means no `## Agents` section.
  - `S pr --draft` with a stale `verify.json` and a stubbed `gh` (as the existing pr specs stub it) calls `pr create` with `--draft`.
  - Without `--draft` it still refuses with `verify.json is missing, failing or from another tree`.
  - `S report` prints `agent cost` with the summed tokens.
- [ ] Step 2: Run the spec files and expect FAIL.
- [ ] Step 3: Implement. In `pr.ts`, pass `agents: agentRows(slug)` into `prBody` and `--draft` into `openPr`.
- [ ] Step 4: Run the spec files plus `scripts/size.spec.ts` and expect PASS.
- [ ] Step 5: Commit with `feat(pr): agent reports and cost in the PR body; draft PR on BLOCKED or --draft`.

### Task 4: waiver requests and CI re-run on approval (G0)

**Files:**
- Modify `scripts/core.ts:266`. `Waiver` gains `requested?: boolean`.
- Modify `scripts/sdlc.ts` `cmdWaive` (370-386), editing lines only, with no net growth:
  - `--request` lifts the `SDLC_HUMAN` check;
  - `by` becomes `'agent (request)'`;
  - the row gets `requested: true`;
  - the output becomes `requested a waiver of <sensor> for <file> in <slug>: <reason>; the PR's approval grants it`;
  - a chart target with `--request` fails with `chart waivers are a person's: /rig:waive chart-<n> ...`.
- Modify `scripts/check.ts:296`. A requested row's text reads `waiver request <slug>: ...` instead of `waiver <slug>: ...` (same line).
- Create `templates/rig-approved.yml`.
- Modify `scripts/vendor.ts:263`. Add `['rig-approved.yml', '.github/workflows/rig-approved.yml']` to the copy list.
- Tests: `scripts/check.spec.ts` (requested rows), `scripts/waive*.spec.ts` (or the file holding today's waive specs), and a new
  `scripts/approvedwf.spec.ts`.

**`templates/rig-approved.yml`** (a header comment states why: GitHub counts a skipped required job as passing, so the review event
must not re-run the whole `rig-check` workflow, only its `rig-check` job):

```yaml
name: rig-approved
on:
  pull_request_review:
    types: [submitted, dismissed]
permissions:
  actions: write
  contents: read
jobs:
  rerun-rig-check:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - name: Re-run the rig-check job of this head commit's run
        env:
          GH_TOKEN: ${{ github.token }}
          REPO: ${{ github.repository }}
          SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          run=$(gh api "repos/$REPO/actions/workflows/rig-check.yml/runs?head_sha=$SHA&event=pull_request&per_page=1" -q '.workflow_runs[0] | select(.status == "completed") | .id')
          if [ -z "$run" ]; then echo "::notice::no completed rig-check run for $SHA; it reads the approval when it finishes"; exit 0; fi
          job=$(gh api "repos/$REPO/actions/runs/$run/jobs?per_page=100" -q '.jobs[] | select(.name == "rig-check") | .id')
          gh run rerun "$run" --job "$job" -R "$REPO"
```

- [ ] Step 1: Write the failing specs:
  - Without `SDLC_HUMAN`, `waive --request size src/a.ts too big for now` appends a row with `requested: true` and
    `by: 'agent (request)'`, and exits 0.
  - Without `--request` and without `SDLC_HUMAN` it still fails (exit 3).
  - `waive chart-1 2 x --request` fails.
  - `check --at ship` with a requested `size` waiver passes (local pending).
  - A requested `plan-gate` waiver does not clear `plan-gate`.
  - At CI, an added requested row appears in the human rows as `waiver request <slug>: ...`, and the run needs an independent approval
    (follow the existing CI waiver-row spec in `check.spec.ts`).
  - The template parses as YAML (or a regex check if no YAML parser is a dependency):
    - its trigger is `pull_request_review` with `submitted` and `dismissed`;
    - it has `actions: write`;
    - it reruns `--job` of `rig-check`;
    - it holds the same-repo `if`.
  - `vendor --workflows` (or whichever path runs `vendor.ts:263`) writes `.github/workflows/rig-approved.yml`.
- [ ] Step 2: Run them and expect FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run them plus `scripts/size.spec.ts` and expect PASS.
- [ ] Step 5: Commit with `feat(waive): agent waiver requests granted by the PR approval; re-run rig-check on review`.

### Task 5: skill and brief text

**Files:** `skills/build/SKILL.md`, `skills/pr/SKILL.md`, `skills/test/SKILL.md`, `templates/review-brief.md`,
`templates/confirm-brief.md`, `templates/readme-rig.md:53`, `templates/readme-rig-core.md:26`. Every skill stays at most 60 lines.
Every text spec that pins the old wording is updated to the new wording, never deleted.

- **`build` step 3:**
  - Before (a), run `S models <slug>`.
  - The test writer launches on its `build` model, not `sonnet`.
  - For `weight: light`, the implementer (c) is one `general-purpose` agent on the `build` model, in the foreground, with a brief of
    at most 60 lines (the behaviours, the plan's files and interfaces, the test command). The main thread does not write the code.
  - If `S verify` fails twice on that build, launch one implementer on the `fallback` model with the failure output.
  - Step 6 uses the `build` model in place of `sonnet`.
- **`pr` steps 14-17:**
  - Run `S models <slug> --after-diff`.
  - The code review and the confirm launch on its `evaluate`.
  - The security review launches on its `security`.
  - Replace `model: opus` in those three launches accordingly.
- **Every brief** (the test writer and implementer briefs in `build`, plus `review-brief.md` and `confirm-brief.md`) ends with:
  `End your answer with one line: status: DONE, status: DONE_WITH_CONCERNS <the concern>, or status: BLOCKED <why>.`
- **`build` and `pr`:** an agent ending `status: BLOCKED`, or a launch denied for the budget, gives
  `S pr <slug> --draft "<why>" --message "<type(scope): summary>"`, with no retry.
- **`test` step 2** ends: `If the same finding fails twice, request a waiver with S waive --request <sensor> <file> <reason>, naming
  that sentence, and continue to /rig:pr: the PR's approval grants it.`
- **The readmes:**
  - the waive row says an agent may request a waiver (`S waive --request`) and a person grants it by approving the PR;
  - add a line saying to copy `templates/rig-approved.yml` beside `rig-check.yml`.

- [ ] Step 1: Edit.
- [ ] Step 2: Run `npm test` (all) and `npm run typecheck`, and quote the totals.
- [ ] Step 3: Commit with `docs(skills): model pairs, status lines, draft PRs and waiver requests in the skill text`.
