# Human-Load Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `sdlc report` says, for each shipped change, how much of a person it took: their turns, the questions rig asked them, the approvals and waivers, and the minutes of attention, plus how many changes went over a question ceiling.

**Architecture:**
- **Recording.** Three hooks append one counts-only row each (no prompt text) to `.rig/changes/<slug>/evidence/human.jsonl` while a change is active:
  - `prompt-submit` (a person's turn), as `prompt`;
  - `stop` (the end of the agent's turn), as `stop`;
  - a new `PostToolUse` hook on `AskUserQuestion`, as `question`, with the number of questions asked.
  
  The file is committed with the change, like `runs.jsonl`, so a team pilot can aggregate across engineers.
- **Report.** A pure `summarise()` turns the rows into counts. Attention is estimated as the sum, per session, of the gaps from each `stop` to the next `prompt`, each capped at 10 minutes so a lunch break does not count.
- **Where it shows.** `report` adds a "Human load" section and a `humanLoad` JSON field over the shipped changes it already lists.
- **Limit.** The estimate is the thinking time between turns. Reading the PR on GitHub is in `report --github` (time to first review), not here.

**Tech Stack:** TypeScript on Node ≥ 22.18, `node:test`, `testkit.ts` (`makeRepo`, `sdlc`, `hook`, `approvedChange`, `write`, `gitIn`).

**Spec:** `docs/superpowers/2026-11-11-rig-readiness-and-adoption.md` §2 Step 2. The pilot measures human load as questions and approvals per change, plus minutes of human attention per merged PR. It sets a ceiling, for example ≤ 3 questions per change. The doc notes "Human load needs new instrumentation; `report.ts` does not record it."

## Global Constraints

- **Row shape:** `{ "at": "<ISO timestamp>", "session": "<session_id or ''>", "kind": "prompt" | "stop" | "question", "n"?: <questions asked, question rows only> }`. Rows hold no prompt or answer text.
- **Defaults.** The idle cap is 10 minutes per gap. The question ceiling is 3 per change, and `--max-questions <n>` overrides it.
- **No change active** (no `activeSlug()`), `.rig/` absent, or rig off: record nothing. The `rigOff` early return in `cmdHook` already covers off.
- **Path rules.** The path is `.rig/changes/<slug>/evidence/human.jsonl`, and every write goes through `sanctionWrites`. Add deny rules: `Edit(/.rig/changes/*/evidence/human.jsonl)` in `templates/settings.json` (beside the `runs.jsonl` rule) and `Edit(./.rig/changes/*/evidence/human.jsonl)` in `templates/managed-settings.json`. `permissions.spec.ts` and `managed.spec.ts` keep them in step.
- **Size limits.** `scripts/sdlc.ts` stays at 500 lines (no edit is needed: `report` is already routed). `scripts/hooks.ts` stays ≤ 500 (322 today). The harness cap is 12,000. Add at most 120 capped lines.
- `npm test` and `npm run typecheck` pass. Quote the output.

## Review Focus

1. **A prompt with no earlier stop in its session** (the first turn, or a resumed session). It adds no attention. A stop with no following prompt (the session ended) adds none either.
2. **Two sessions interleaved on one change** (two terminals). Gaps pair only within a session, never across sessions.
3. **A malformed row or a missing file.** The row is skipped. A change without `human.jsonl` (shipped before this change) is "not measured", is left out of the medians, and is counted in a `measured` figure.
4. **The hook payload has no `tool_input.questions`** (an older Claude Code). That counts as `n: 1`, never 0, and never throws.
5. **The new file must not trip the turn's own checks.** The Stop gate's harness-tamper and blast-radius checks must not flag `human.jsonl`. Pin it with a test: a turn whose only change is the appended row raises no finding.

---

### Task 1: Record the rows

**Files:**
- Create: `scripts/humanload.ts`
- Modify:
  - `scripts/hooks.ts`: `hookPromptSubmit` and the `stop` entry each record a row; a new `HOOKS['asked']` records the question row.
  - `scripts/core.ts`: `HookInput` gains `tool_input?: { questions?: unknown[] }`.
  - `hooks/hooks.json`: a new `PostToolUse` entry, matcher `AskUserQuestion`, command `… hook asked`, timeout 10.
  - `scripts/vendor.ts`: `'humanload'` in `VENDORED`.
  - `templates/settings.json` and `templates/managed-settings.json`: the deny rules.
- Test: `scripts/humanload.spec.ts`

**Interfaces:**
- Produces, in `scripts/humanload.ts`:
  - `export type HumanRow = { at: string; session: string; kind: 'prompt' | 'stop' | 'question'; n?: number }`
  - `export function recordHuman(kind: HumanRow['kind'], input: HookInput, n?: number): void`. It does nothing without `.rig/` or an active slug. Otherwise it appends one JSON line and sanctions the write.
  - `export const questionsAsked = (input: HookInput): number`: `Array.isArray(input.tool_input?.questions) && input.tool_input.questions.length > 0 ? input.tool_input.questions.length : 1`
- Consumers: `hookPromptSubmit` calls `recordHuman('prompt', input)` first. The `stop` entry calls `recordHuman('stop', i)` before `hookStop`. `asked` calls `recordHuman('question', i, questionsAsked(i))`.

- [ ] **Step 1: Write the failing tests** in `scripts/humanload.spec.ts`. Each starts from `makeRepo()`, `sdlc(repo, ['init'])` and `sdlc(repo, ['new', 'loans', '--type', 'feature'])`.
  - `a prompt, a question batch and a stop each append one row to the active change`. Run `hook(repo, 'prompt-submit', { session_id: 's1', prompt: 'hi' })`, then `hook(repo, 'asked', { session_id: 's1', tool_input: { questions: [{}, {}] } })`, then `hook(repo, 'stop', { session_id: 's1' })`. The file `.rig/changes/loans/evidence/human.jsonl` then has kinds `['prompt', 'question', 'stop']`, the question row has `n === 2`, and no row has a `prompt` or `text` key.
  - `no active change records nothing`. In a repo after `init` only, run the prompt-submit hook. No `human.jsonl` exists anywhere under `.rig/changes`.
  - `a question payload without questions counts one` (Review Focus 4).
  - `appending the row raises no Stop finding` (Review Focus 5). After `approvedChange(repo, 'loans')`, run `prompt-submit` then `stop`. The stop output does not match `/human\.jsonl/`.
  - `the hook is registered`. `hooks/hooks.json` has a `PostToolUse` entry with `matcher: 'AskUserQuestion'` whose command ends `hook asked`.

- [ ] **Step 2: Run them and confirm they fail.** Run `node --disable-warning=ExperimentalWarning --test scripts/humanload.spec.ts`. Expected: FAIL (the module is missing).

- [ ] **Step 3: Implement** `humanload.ts`, the three hook calls, the `HookInput` field, the `hooks.json` entry, `VENDORED` and both deny rules.

- [ ] **Step 4: Run the tests and confirm they pass.** Run `node --disable-warning=ExperimentalWarning --test scripts/humanload.spec.ts scripts/hooks.spec.ts scripts/permissions.spec.ts scripts/managed.spec.ts scripts/vendor.spec.ts`. Expected: all pass.

- [ ] **Step 5: Commit** with `feat(humanload): record a counts-only row per person turn, agent stop and question batch`.

### Task 2: Summarise them in `sdlc report`

**Files:**
- Modify:
  - `scripts/humanload.ts`: add `summarise` and `humanLoad`.
  - `scripts/report.ts`: `Report` gains `humanLoad`, `buildReport` fills it, `reportText` prints it, and `cmdReport` reads `--max-questions`.
  - `README.md`: one sentence where `report` is described.
  - `CHANGELOG.md`: one Unreleased line.
- Test: `scripts/humanload.spec.ts`

**Interfaces:**
- Produces:
  - `export type ChangeLoad = { slug: string; prompts: number; questions: number; approvals: number; attentionMin: number }`
  - `export function summarise(rows: HumanRow[], idleCapMin = 10): { prompts: number; questions: number; attentionMin: number }` (pure). `questions` is the sum of `n` over question rows. Attention: for each session, sort its rows by `at`. Each `prompt` that follows a `stop` adds `min((prompt.at - stop.at) / 60000, idleCapMin)`. Round to 1 decimal.
  - `export function humanLoad(root: string, slugs: string[], maxQuestions = 3): { measured: number; of: number; prompts: Stat; questions: Stat; approvals: Stat; attentionMin: Stat; overCeiling: number; maxQuestions: number } | null`, where `type Stat = { median: number; p95: number }`. It returns null when no slug has a `human.jsonl`.
    - `approvals` per change is 1 when `approval.json` exists, plus the `.rig/waivers.jsonl` rows with that `slug`.
    - `overCeiling` counts the measured changes with `questions > maxQuestions`.
    - p95 is nearest-rank, as `report.ts` does for its other p95s. Reuse that helper if it exists; otherwise define it once in `humanload.ts`.
- `reportText` adds these lines when `humanLoad` is non-null:

```
human load (<measured> of <of> shipped changes measured; attention = gaps between turns, each capped at 10 min):
  person turns: median <m>, p95 <p>
  questions asked: median <m>, p95 <p>; over the <maxQuestions>-question ceiling: <overCeiling>
  approvals and waivers: median <m>, p95 <p>
  attention minutes: median <m>, p95 <p>
```

  When it is null, `unavailable` gains `human load (no shipped change has evidence/human.jsonl yet)`.

- [ ] **Step 1: Write the failing tests:**
  - `summarise: gaps pair within a session, are capped, and ignore an unpaired prompt or stop` (Review Focus 1 and 2). Rows in two interleaved sessions:
    - s1: stop 10:00, prompt 10:03, stop 10:05, prompt 10:45 (capped at 10)
    - s2: prompt 10:01 (unpaired), stop 10:02, prompt 10:04
    - a question row `n: 2`
    
    Expect `{ prompts: 4, questions: 2, attentionMin: 15 }`.
  - `summarise skips malformed rows`: rows with no `at`, or an unknown `kind`, are ignored.
  - `report: human load over shipped changes, with the ceiling`. Build two shipped changes the way `scripts/report.spec.ts` builds shipped changes (follow its setup helper). Give one a `human.jsonl` with 5 question rows and one approval plus one waiver. Leave the other without the file. `report --json` then has `humanLoad.measured === 1`, `of === 2`, `overCeiling === 1`, and `approvals.median === 2`. Text output matches `/over the 3-question ceiling: 1/`. `report --max-questions 5 --json` has `overCeiling === 0`.
  - `report without any human.jsonl lists it as unavailable` (Review Focus 3).

- [ ] **Step 2: Run them and confirm they fail.**

- [ ] **Step 3: Implement**, then add the README sentence: "`report` also shows human load per shipped change (turns, questions, approvals and waivers, attention minutes) from `evidence/human.jsonl`, which the hooks write with counts only." Add the CHANGELOG line too.

- [ ] **Step 4: Verify.** Run `npm test && npm run typecheck`. Expected: all pass, including `report.spec.ts`, `removed.spec.ts` and `size.spec.ts`.

- [ ] **Step 5: Commit** with `feat(report): human load per shipped change — turns, questions, approvals, attention — with a question ceiling`.

### After the tasks

Do one Opus review of `git diff main...HEAD`, fix its findings in one wave, and run `npm test` again.
