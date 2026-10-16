# Behavioural harness step 4a: deletions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this repo runs plans natively, see CLAUDE.md "One review per change") to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete what spec section 8 removes and the lifecycle does not depend on: the rig-brain plugin, the mod UI, the chart/watch/metrics/scorecard/points/timing scripts, the review workflow and four CI templates, and eight non-lifecycle skills. `npm test` stays green.

**Architecture:** Pure removal plus the smallest call-site surgery. A guard spec, `scripts/removed.spec.ts`, gets one test per task asserting the removal (the RED step for a deletion), so nothing deleted comes back. Specs that test only a deleted feature are deleted with it, and specs that test a kept feature next to a deleted one lose only the deleted assertions. The lifecycle (graph, ratchet, tiers, slices, spend, the 7 lifecycle skills, the 5 agents, `log-usage`) is left for step 4b.

**Tech Stack:** Node 22 native TypeScript, `node --test`, git. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-16-behavioural-harness-design.md`, sections 8 ("Deleted skills", "Deleted elsewhere", "Removed"), 7 ("Removed hooks"), 10.2 and 11 step 4. The person split step 4 into 4a (this plan) and 4b (lifecycle rewrite) on 2026-10-16. They also chose to take the scripted e2e suite out of `npm test` until step 5.

## Global Constraints

- Every non-spec script in `scripts/` is at most 500 lines. The harness total cap in `scripts/size.spec.ts` only goes down.
- `scripts/tsconfig.json` has `noUnusedLocals`: delete every import and helper a removal orphans. `npm run typecheck` must pass.
- `npm test` must be green at the end of every task.
- Never register a plugin at user scope.
- A spec test is deleted only when everything it asserts belongs to a deleted feature. When it also covers kept behaviour, delete only the deleted assertions.
- Kept until 4b, so do not delete them here: `graph.ts`, `ratchet.ts`, `slices.ts`, `slicecheck.ts`, `checkpoint.ts`, `stale.ts`, `stamp.ts`, `spend.ts`, `routing.ts`, `context.ts`, `evals.ts`, `levels.ts`, `flow.ts`, `inbox.ts` (trimmed in Task 3), `log-usage`, `runsOwnHook`, `agents/*`, and the skills `design diagnose incident intent next pr-review spec`.

## Decisions this plan takes (flag in review if wrong)

1. **Plugin `approve` and `waive` skills replace the mod's slash commands.** The mod registered `/rig:approve` and `/rig:waive`. Without it, a plugin install would lose the only human path to a gate. Two human-only skills (`disable-model-invocation: true`) take their place, with the same text `vendor.ts` `humanSkill` writes for standalone repos. That makes 9 skills after step 4b, against the spec's 7. These two are gate plumbing, not workflow.
2. **Inbox stays, minus charts.** The kept `start` skill passes `--source .rig/intent/<file>` to `new`, which calls `startRefusal`. `inbox.ts` keeps intents and loses sprint-chart gating. Sprint intents came only from the deleted `decompose` skill. `sprintOf` and `listField` move into `inbox.ts`.
3. **`log-usage` stays with nothing calling it** until step 4b removes spend. Its tests keep passing, and spend reads an empty ledger, so the ratchet's budget gate never fires.
4. **`openLanes` goes.** Its only writer, `laneEvent`, is deleted, so it would always return false. The Stop continuation behaves as it does today when no subagent lanes are open.
5. **`architecture-format.md`, `design-format.md` and `testplan-format.md` stay if a kept file still references them.** Each deletion step greps first. A reference from a kept file keeps the file until 4b and gets a ledger line.

## Review Focus

1. A plugin user types `/rig:approve <slug> plan` and the approval is recorded once, even though the prompt hook and the new skill both fire. Test in Task 2.
2. A standalone (vendored) repo still gets `rig-approve` and `rig-waive`, and they come from `humanSkill`, not from a copy of the plugin skill that points at `${CLAUDE_PLUGIN_ROOT}`. Test in Task 2.
3. `new --source .rig/intent/x.md` still refuses an intent that is not accepted, now that chart gating is gone. Test in Task 3.
4. A repo whose `.claude/settings.json` was vendored earlier, and still registers `SubagentStart`, `SubagentStop` or `PostToolUseFailure`, does not get "unknown hook" errors. Re-vendoring removes those registrations, and the hook dispatcher ignores those names. Test in Task 2.
5. `status` and `status --json` still work and no longer print points or story. Test in Task 3.

---

### Task 1: Remove the rig-brain plugin

**Files:**
- Create: `scripts/removed.spec.ts`
- Delete: `brain/` (whole directory, including `node_modules`), `scripts/brainsource.ts`, `scripts/brainsource.spec.ts`, `scripts/brainboundary.spec.ts`
- Modify: `.claude-plugin/marketplace.json` (drop the `rig-brain` entry and "and its optional rig-brain add-on" from `description`), `package.json` (drop `&& npm run test:brain` from `test`; delete the `test:brain` script), `.github/workflows/ci.yml` (delete the `brain:` job), `scripts/sdlc.ts` (import line 42 and the `brain-source` entry plus its comment at 418-419), `scripts/vendor.ts` (`'brainsource'` out of `VENDORED`), `skills/init/SKILL.md`, `templates/readme-rig.md`, `scripts/initskill.spec.ts`, `CLAUDE.md` ("Two plugins in this repo" section)

**Interfaces:** none produced. Consumed by nothing after the removal.

- [ ] **Step 1: Write the failing guard test** in `scripts/removed.spec.ts`

```ts
// Behavioural harness step 4a (spec 2026-10-16 §8): what the spec deletes stays deleted.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc } from './testkit.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const gone = (...rels: string[]): void => { for (const r of rels) assert.ok(!fs.existsSync(path.join(ROOT, r)), `${r} should be deleted`) }
// The usage line lists every command: a removed one is not in it.
const commands = (): string[] => /usage: sdlc\.ts <([^>]+)>/.exec(sdlc(makeRepo(), []).stderr)?.[1]?.split('|') ?? []

test('4a: the rig-brain plugin is gone', () => {
  gone('brain', 'scripts/brainsource.ts')
  assert.deepEqual((JSON.parse(read('.claude-plugin/marketplace.json')) as { plugins: { name: string }[] }).plugins.map(p => p.name), ['rig'])
  assert.doesNotMatch(read('package.json'), /test:brain/)
  assert.doesNotMatch(read('.github/workflows/ci.yml'), /--prefix brain/)
  assert.doesNotMatch(read('skills/init/SKILL.md') + read('templates/readme-rig.md'), /rig-brain|brain-source|\{\{BRAIN\}\}/)
  assert.ok(!commands().includes('brain-source'))
  assert.ok(commands().includes('check'), 'the usage line still parses')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/removed.spec.ts`
Expected: FAIL, "brain should be deleted".

- [ ] **Step 3: Delete and cut the call sites**

```bash
git rm -rq brain scripts/brainsource.ts scripts/brainsource.spec.ts scripts/brainboundary.spec.ts
rm -rf brain   # node_modules is untracked
```
- `scripts/sdlc.ts`: delete `import { cmdBrainSource } from './brainsource.ts'`, the `brain-source` COMMANDS entry and the comment line above it.
- `scripts/vendor.ts`: remove `'brainsource', ` from `VENDORED`.
- `.claude-plugin/marketplace.json`: `"description": "Marketplace for the rig harness"`, and `plugins` holds only the `rig` entry.
- `package.json` `test`: delete ` && npm run test:brain`; delete the `"test:brain"` line.
- `.github/workflows/ci.yml`: delete the whole `brain:` job (its comment line through `npm run test:unit --prefix brain`).
- `skills/init/SKILL.md`:
  - Line 17: the Skip bullet ends at "... `--workflows` (the `.github/workflows/` files and `REVIEW.md`). The first changes Claude Code's marketplace settings and the second needs a remote, so they stay an explicit yes."
  - Line 19: drop "; for rig-brain, answer yes to its step on that re-run".
  - Line 21: "three items" becomes "two items", and item (3) **rig-brain** is deleted through "...as Both step 4 does.". Drop "rig-brain with its wiki page count and memory entry count" from the Verify step.
  - Delete step 4 ("Optional add-on: rig-brain", lines 50-55) and renumber 5 and 6 to 4 and 5.
  - In README step: drop the `{{BRAIN}}` sentence.
  - In the final paragraph: drop "(including `.rig/wiki/` and `.rig/memory/` when rig-brain was enabled)" and the last sentence ("When rig-brain was enabled add: ...").
- `templates/readme-rig.md` line 50: `{{BRAIN}}<!-- rig:end -->` becomes `<!-- rig:end -->`.
- `scripts/initskill.spec.ts`: delete the assertions at lines 30, 38 and 89 that look for rig-brain text. Delete a whole test only if it asserts nothing else.
- `CLAUDE.md`: replace the "Two plugins in this repo" section (heading and paragraph) with:
  ```markdown
  ## Plugin scope

  Never register the plugin at user scope: always `--scope project`.
  ```

- [ ] **Step 4: Run the tests**

Run: `node --test scripts/removed.spec.ts scripts/initskill.spec.ts scripts/vendor.spec.ts scripts/sdlc.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A brain scripts .claude-plugin package.json .github/workflows/ci.yml skills/init templates/readme-rig.md CLAUDE.md
git commit -m "refactor: delete the rig-brain plugin (spec §8)"
```

---

### Task 2: Remove the mod UI and its hooks; add human-only approve and waive skills

**Files:**
- Delete: `hooks/band.tsx`, `hooks/mission.tsx`, `hooks/driver.ts`, `hooks/gates.ts`, `hooks/register.ts`, `hooks/shared.ts`, `tests/register.test.ts`, `types/` (the mod type declarations), root `tsconfig.json`, `.claude-plugin/types/`
- Create: `skills/approve/SKILL.md`, `skills/waive/SKILL.md`
- Modify: `hooks/hooks.json`, `.claude-plugin/plugin.json` (drop `"types"`), `package.json` (`test` loses `npm run typecheck:mod` and `claude plugin test .`; delete the `typecheck:mod` script), `scripts/hooks.ts` (delete `hookSkillFailed`, `laneEvent`, `openLanes` and its call in `continueChange`, the three HOOKS entries; unknown retired hook names exit 0), `scripts/vendor.ts` (skip `approve`/`waive` in the skill copy loop; vendored settings drop the three retired hooks), `scripts/gate.spec.ts`, `scripts/vendor.spec.ts`
- Test: `scripts/removed.spec.ts`

**Interfaces:**
- Produces: `RETIRED_HOOKS = ['subagent-start', 'subagent-stop', 'skill-failed']` in `scripts/hooks.ts`. `cmdHook` returns quietly for these.

- [ ] **Step 1: Write the failing tests** (append to `scripts/removed.spec.ts`)

```ts
import { write, gitIn, hook } from './testkit.ts'

test('4a: the mod UI and its type and test scaffolding are gone', () => {
  gone('hooks/band.tsx', 'hooks/mission.tsx', 'hooks/driver.ts', 'hooks/gates.ts', 'hooks/register.ts', 'hooks/shared.ts', 'tests/register.test.ts', 'types', 'tsconfig.json', '.claude-plugin/types')
  const hooks = JSON.parse(read('hooks/hooks.json')) as { modules?: unknown; hooks: Record<string, unknown> }
  assert.equal(hooks.modules, undefined)
  assert.deepEqual(Object.keys(hooks.hooks).sort(), ['PostModelSwitch', 'PostToolUse', 'PreToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit'])
  assert.doesNotMatch(read('package.json'), /typecheck:mod|claude plugin test/)
  assert.equal((JSON.parse(read('.claude-plugin/plugin.json')) as { types?: string }).types, undefined)
})

test('4a: a retired hook name from an old vendored settings file exits quietly', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  for (const name of ['subagent-start', 'subagent-stop', 'skill-failed']) {
    const r = hook(repo, name, { session_id: 's1' })
    assert.equal(r.code, 0, `${name}: ${r.stderr}`)
    assert.equal(r.stdout, '')
  }
})

test('4a: the plugin ships human-only approve and waive skills that run sdlc with SDLC_HUMAN=1', () => {
  for (const [cmd, hint] of [['approve', '<slug> <design|spec|plan|impact|budget|full-route|tier S|M|L [type]>'], ['waive', '<sensor> <file|*> <reason>']] as const) {
    const text = read(`skills/${cmd}/SKILL.md`)
    assert.match(text, /^disable-model-invocation: true$/m)
    assert.match(text, new RegExp(`^argument-hint: ${hint.replace(/[|*[\]]/g, '\\$&')}$`, 'm'))
    assert.match(text, new RegExp(`SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "\\$\\{CLAUDE_PLUGIN_ROOT\\}/scripts/sdlc\\.ts" ${cmd} '\\$ARGUMENTS'`))
  }
})

test('4a: a typed /rig:approve records one row even when the skill runs the same approve', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['new', 'demo', '--type', 'feature', '--tier', 'M'])
  write(repo, '.rig/changes/demo/design.md', '# Design\n\n## Open questions\nnone\n')
  hook(repo, 'prompt-submit', { prompt: '/rig:approve demo design' })
  sdlc(repo, ['approve', 'demo design'], { env: { SDLC_HUMAN: '1' } }) // what the skill's !`...` line runs: one quoted argument
  const rows = fs.readFileSync(path.join(repo, '.rig/approvals.jsonl'), 'utf8').trim().split('\n')
  assert.equal(rows.length, 1)
})
```

Add to `scripts/vendor.spec.ts`, inside or next to the standalone vendoring test:
```ts
test('standalone rig-approve and rig-waive come from humanSkill, never from the plugin skill', () => {
  const repo = makeRepo()
  sdlc(repo, ['vendor'])
  for (const cmd of ['approve', 'waive']) {
    const text = fs.readFileSync(path.join(repo, `.claude/skills/rig-${cmd}/SKILL.md`), 'utf8')
    assert.doesNotMatch(text, /CLAUDE_PLUGIN_ROOT/)
    assert.match(text, new RegExp(`\\.rig/bin/sdlc\\.ts.? ${cmd}`))
  }
  const settings = fs.readFileSync(path.join(repo, '.claude/settings.json'), 'utf8')
  assert.doesNotMatch(settings, /SubagentStart|SubagentStop|PostToolUseFailure/)
})
```
(Use the vendor invocation the neighbouring vendor tests use if `['vendor']` is not it, for example `['init', '--full']`.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --test scripts/removed.spec.ts scripts/vendor.spec.ts`
Expected: FAIL. The mod files exist, the retired hooks print "unknown hook", and the skills are missing.

- [ ] **Step 3: Delete the mod and its scaffolding**

```bash
git rm -rq hooks/band.tsx hooks/mission.tsx hooks/driver.ts hooks/gates.ts hooks/register.ts hooks/shared.ts tests/register.test.ts types tsconfig.json .claude-plugin/types
```
- `.claude-plugin/plugin.json`: delete the `"types"` line. Set `description` to `"Behavioural harness for Claude Code: one sensor registry, contracts frozen at plan approval, guides kept in sync, human gates."`
- `package.json`: `test` becomes `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts && npm run test:e2e:unit && npm run test:e2e:fast` for now (Task 5 drops the last part). Delete `"typecheck:mod"`.
- `hooks/hooks.json`: delete `"modules"`. Delete the `SubagentStart`, `SubagentStop` and `PostToolUseFailure` entries. Set `description` to `"rig: session context, turn baselines, the end-of-turn quality gate, the per-edit check, and model recording (session start, /model switches, agent launches). No hook runs on Bash."`

- [ ] **Step 4: Cut `scripts/hooks.ts`**

- Delete `hookSkillFailed`, `laneEvent` and `openLanes`, and the HOOKS entries `'skill-failed'`, `'subagent-start'`, `'subagent-stop'`.
- In `continueChange`, delete the line `if (openLanes(slug)) return null`.
- Add above `cmdHook`:
```ts
// Hooks rig no longer registers (spec §7): a settings file vendored before step 4a may still call them.
export const RETIRED_HOOKS = ['subagent-start', 'subagent-stop', 'skill-failed']
```
- In `cmdHook`, before the `unknown hook` check:
```ts
  if (RETIRED_HOOKS.includes(args.pos[0] ?? '')) return
```
- Remove the imports these deletions orphan (`npm run typecheck` names them).

- [ ] **Step 5: Add the two skills**

`skills/approve/SKILL.md`:
```markdown
---
name: approve
description: Human only. Approve a gated sdlc artifact. The model cannot run this.
argument-hint: <slug> <design|spec|plan|impact|budget|full-route|tier S|M|L [type]>
disable-model-invocation: true
allowed-tools: Bash(SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" approve *)
---
!`SDLC_HUMAN=1 node --disable-warning=ExperimentalWarning "${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts" approve '$ARGUMENTS' 2>&1 || true`

Tell the person the result above in one line. Do nothing else.
```
`skills/waive/SKILL.md`: the same with `waive`, description `Human only. Waive a sensor finding for the active change. The model cannot run this.` and argument-hint `<sensor> <file|*> <reason>`.

- [ ] **Step 6: Vendor**

`scripts/vendor.ts` `vendorStandalone`: the skill loop skips `approve` and `waive`, because `humanSkill` writes them with the `.rig/bin` path:
```ts
  for (const name of fs.readdirSync(path.join(PLUGIN_ROOT, 'skills')).filter(n => n !== 'approve' && n !== 'waive')) {
```
Where vendoring writes hook registrations into `.claude/settings.json`, drop `SubagentStart`, `SubagentStop` and `PostToolUseFailure`. When re-vendoring over an existing settings file, also delete those three keys if their commands point at `.rig/bin/sdlc.ts` (Review Focus 4).

- [ ] **Step 7: Prune the specs of deleted behaviour**

- `scripts/gate.spec.ts`: delete the tests at :15 ("a failed sdlc skill load injects the deterministic fallback..."), :184 ("a failed built-in code-review load falls back..."), :190 ("a failed superpowers SDD load...") and :330 ("Stop does not continue a node while one of its subagents is still running").
- `scripts/vendor.spec.ts`: in :60 drop the skill-failed assertions; in :226-246 change the expectations to "SubagentStart, SubagentStop and PostToolUseFailure are absent".

- [ ] **Step 8: Run the tests**

Run: `node --test scripts/removed.spec.ts scripts/vendor.spec.ts scripts/gate.spec.ts scripts/registryhooks.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A hooks tests types tsconfig.json .claude-plugin package.json scripts skills/approve skills/waive
git commit -m "refactor: delete the mod UI and its three hooks; human-only approve and waive skills replace its slash commands"
```

---

### Task 3: Remove chart, watch, metrics, scorecard, points and timing

**Files:**
- Delete: `scripts/{chart,chartcheck,watch,metrics,scorecard,points,timing}.ts` and every `scripts/{chart,watch,scorecard,points,timing}.spec.ts` that exists; `skills/chart/`, `skills/decompose/`, `skills/metrics/`; `templates/prd-format.md`, `templates/rig-watch.yml`, `templates/rig-triage.yml`, `templates/rig-rehearse.yml`
- Modify: `scripts/inbox.ts` (no chart imports), `scripts/sdlc.ts`, `scripts/pr.ts` (no scorecard), `scripts/vendor.ts` (`VENDORED`), `skills/rule/SKILL.md`, `skills/pr/SKILL.md`, specs listed in Step 5
- Test: `scripts/removed.spec.ts`, `scripts/inbox.spec.ts`

**Interfaces:**
- Produces: `inbox.ts` keeps `inboxEntries`, `pendingIntents`, `startRefusal`, `cmdInbox` with the same signatures. It also exports `listField(text: string, key: string): string[]` (moved from chart.ts, same body). `sprintOf` is deleted along with sprint handling.

- [ ] **Step 1: Write the failing tests**

Append to `scripts/removed.spec.ts`:
```ts
test('4a: chart, watch, metrics, scorecard, points and timing are gone', () => {
  gone(...['chart', 'chartcheck', 'watch', 'metrics', 'scorecard', 'points', 'timing'].map(m => `scripts/${m}.ts`), 'skills/chart', 'skills/decompose', 'skills/metrics', 'templates/prd-format.md', 'templates/rig-watch.yml', 'templates/rig-triage.yml', 'templates/rig-rehearse.yml')
  for (const c of ['chart', 'watch', 'metrics', 'scorecard', 'points']) assert.ok(!commands().includes(c), c)
  assert.ok(commands().includes('inbox'), 'the intent inbox stays')
})

test('4a: status and status --json no longer carry points or story', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['new', 'demo', '--type', 'feature', '--tier', 'M'])
  assert.doesNotMatch(sdlc(repo, ['status']).stdout, /\dpt\b/)
  const json = JSON.parse(sdlc(repo, ['status', '--json']).stdout) as { changes: Record<string, unknown>[] }
  assert.ok(json.changes.every(c => !('points' in c) && !('story' in c)))
})
```
(If `status --json` names its list something other than `changes`, use that key; read `cmdStatus` around sdlc.ts:170.)

Add to `scripts/inbox.spec.ts` (Review Focus 3), using the helpers already in that file:
```ts
test('new --source refuses an intent that is not accepted, without any chart', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, '.rig/intent/one.md', '---\nstatus: draft\n---\n# One\n')
  const r = sdlc(repo, ['new', 'one', '--type', 'feature', '--tier', 'M', '--source', '.rig/intent/one.md'])
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /accepted/)
})
```
(Match the refusal wording `startRefusal` uses today. Run it before Step 3 to confirm the wording, since this test may already pass. It is a regression pin, not a RED.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --test scripts/removed.spec.ts`
Expected: FAIL on "scripts/chart.ts should be deleted" and on `pt` in status.

- [ ] **Step 3: Delete the modules, skills and templates**

```bash
git rm -q scripts/chart.ts scripts/chartcheck.ts scripts/watch.ts scripts/metrics.ts scripts/scorecard.ts scripts/points.ts scripts/timing.ts
git rm -q --ignore-unmatch scripts/chart.spec.ts scripts/watch.spec.ts scripts/scorecard.spec.ts scripts/points.spec.ts scripts/timing.spec.ts
git rm -rq skills/chart skills/decompose skills/metrics templates/prd-format.md templates/rig-watch.yml templates/rig-triage.yml templates/rig-rehearse.yml
```

- [ ] **Step 4: Cut the call sites**

- `scripts/inbox.ts`:
  - Delete the import from `./chart.ts` and copy `listField` into this file (same body).
  - Delete every sprint branch (`sprintOf(d.sprint)`, `chartOf`, the chart-gate messages at 50, 57, 86, 90 and 92). A `sprint:` field in an intent is now ignored.
  - Keep `inboxEntries`, `pendingIntents`, `startRefusal` and `cmdInbox`.
- `scripts/sdlc.ts`:
  - Delete the imports of metrics, chartcheck, chart, watch, points and scorecard.
  - `new`: drop `|| CHART_RE.test(slug)` and ", not chart-N" from the usage. Drop `--points` (`explicit`/`defaults` lines 105-106). Pass the config default the way `graph.ts` does for ad-hoc changes, so `createChange` keeps its signature until 4b.
  - `status`: drop `watchWarnings()`, the `points` and `story` JSON fields and the `Npt` column.
  - `approve`: drop the `chart-N` branch (196-197).
  - Delete the COMMANDS entries `points`, `metrics`, `chart`, `watch` and `scorecard`.
- `scripts/pr.ts`: delete the `renderScorecard` import and the `## Scorecard` section of the pr.md body (line 139).
- `scripts/vendor.ts` `VENDORED`: remove `'metrics', 'chart', 'chartcheck', 'watch', 'scorecard', 'points', 'timing'`.
- `skills/rule/SKILL.md`:
  - Description: "Use when a review shows a recurring finding category, or the person says "this keeps happening"."
  - Delete line 22 (prune candidates from `/rig:metrics`).
- `skills/pr/SKILL.md` description: drop "pr.md scorecard, ". If the body mentions the scorecard, drop that sentence too.
- Any `vendor.ts` code that writes `rig-watch.yml`, `rig-triage.yml` or `rig-rehearse.yml` under `--workflows`: delete those writes.

- [ ] **Step 5: Prune the specs of deleted behaviour**

Delete these tests whole: they assert only metrics, scorecard, watch, triage, rehearse or chart.
- `sdlc.spec.ts`: "metrics merge plugin and standalone agent names..." (:203), "metrics report tokens by role and by role and model" (:215), "metrics report rule fires, prune candidates and recurring review categories" (:303), "prune candidates are rules introduced over 90 days ago that never fired" (:347), "metrics report autonomy and economics from events and usage" (:528), "economics: ratios need a sample..." (:541).
- `cicd.spec.ts`: "rig-rehearse: weekly and on demand..." (:117), "DORA from gh and incidents" (:148), "triage and rehearsal from workflow runs" (:164), "metrics never crash without a usable gh" (:170), "the triage metric needs rig-triage.yml installed..." (:205), and every other test that reads `rig-triage.yml`, `rig-rehearse.yml` or `rig-watch.yml`.
- `context.spec.ts` :75 "metrics report the heaviest first call...". `evals.spec.ts` :261 and :269. `lessons.spec.ts` :40 and :76. `managed.spec.ts` :151.
- `spend.spec.ts` :243 "the scorecard has a change budget row and metrics a budget block".
- `models.spec.ts` :35-40: the CHART list and CHART_MODELS. Delete the chart stage rows; if `routing.ts` has chart-only entries, delete them too.

Edit these tests to drop only the deleted assertions:
- `sdlc.spec.ts` :190 "log-usage tags rows with the active change; metrics report cost and unmeasured samples": keep the log-usage half.
- `sdlc.spec.ts` :333 "check --at ci logs no rule fires": keep it if it reads `usage.jsonl` directly. If it reads `metrics`, assert on `usage.jsonl` instead.
- `vendor.spec.ts` :31: drop `rig-chart` and `rig-decompose` from the expected skills.

Run `grep -rln "metrics\|scorecard\|chart\|watch\|points" scripts/*.spec.ts` and check every remaining hit against the two rules in Global Constraints.

- [ ] **Step 6: Run the tests**

Run: `node --test scripts/*.spec.ts > /tmp/4a-t3.txt 2>&1; grep -E "^ℹ (pass|fail)|^✖" /tmp/4a-t3.txt | head; npm run typecheck`
Expected: `fail 0` and a clean typecheck.

- [ ] **Step 7: Commit**

```bash
git add -A scripts skills templates
git commit -m "refactor: delete chart, watch, metrics, scorecard, points and timing; the intent inbox drops sprint charts (spec §8)"
```

---

### Task 4: Remove the review workflow, the spec CI template and five more skills

**Files:**
- Delete: `workflows/` (`review.js`), `templates/rig-review.yml`, `templates/rig-spec.yml`, `scripts/workflow.spec.ts`, `scripts/rigspec.spec.ts`; `skills/architecture/`, `skills/codebase-design/`, `skills/prototype/`, `skills/sensors/`, `skills/testplan/`; `templates/architecture-format.md` and `templates/testplan-format.md`, each only if no kept file references it (Decision 5)
- Modify: `scripts/vendor.ts` (no `workflows/` copy, no `rig-review.yml`/`rig-spec.yml` under `--workflows`, the `${CLAUDE_PLUGIN_ROOT}/workflows/` rewrite gone), `skills/init/SKILL.md` (`--workflows` writes only `rig-check.yml` and `REVIEW.md`), `skills/intent/SKILL.md` (drop the rig-spec workflow sentences), `skills/pr-review/SKILL.md` line 19 (drop the rig-review workflow pointer), `scripts/models.spec.ts`, `scripts/vendor.spec.ts`, `scripts/policy.spec.ts`
- Test: `scripts/removed.spec.ts`

**Interfaces:** none.

- [ ] **Step 1: Write the failing test** (append to `scripts/removed.spec.ts`)

```ts
test('4a: the review workflow, the rig-spec CI template and the five non-lifecycle skills are gone', () => {
  gone('workflows', 'templates/rig-review.yml', 'templates/rig-spec.yml', ...['architecture', 'codebase-design', 'prototype', 'sensors', 'testplan'].map(s => `skills/${s}`))
  const ci = fs.readdirSync(path.join(ROOT, 'templates')).filter(f => /^rig-.*\.yml$/.test(f))
  assert.deepEqual(ci, ['rig-check.yml'])
  const kept = fs.readdirSync(path.join(ROOT, 'skills')).sort()
  assert.deepEqual(kept, ['approve', 'build', 'design', 'diagnose', 'incident', 'init', 'intent', 'next', 'plan', 'pr', 'pr-review', 'rule', 'spec', 'start', 'test', 'waive'])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/removed.spec.ts`
Expected: FAIL, "workflows should be deleted".

- [ ] **Step 3: Grep, then delete**

```bash
grep -rn "architecture-format\|testplan-format" skills agents guides templates scripts --include=*.md --include=*.ts | grep -v "skills/architecture/\|skills/testplan/\|skills/codebase-design/"
```
For each format file with no hit outside the skills being deleted, delete it. For each one with a hit (for example `agents/architect.md`), keep it and add a ledger line: `Ruling: kept templates/<x>-format.md — referenced by <file> — deleted in 4b with it`.
```bash
git rm -rq workflows templates/rig-review.yml templates/rig-spec.yml scripts/workflow.spec.ts scripts/rigspec.spec.ts skills/architecture skills/codebase-design skills/prototype skills/sensors skills/testplan
```

- [ ] **Step 4: Cut the call sites**

- `scripts/vendor.ts`:
  - Delete the `workflows/` copy loop (lines 96-97) and the `.replaceAll('${CLAUDE_PLUGIN_ROOT}/workflows/', ...)` rewrite.
  - `installStandalone(workflows)` writes only `templates/rig-check.yml` and `REVIEW.md`.
  - If a function exists only to write the review model into `rig-review.yml` (models.spec :84, :117, :124 "CI review model ..."), delete it and its tests.
- `skills/init/SKILL.md`: where `--workflows` is described, it now writes `.github/workflows/rig-check.yml` and `REVIEW.md`.
- `skills/intent/SKILL.md`: delete the sentences that mention the `rig-spec` workflow (lines 30-34 per the inventory); keep everything about `.rig/intent/`.
- `skills/pr-review/SKILL.md`: delete the trailing rig-review workflow pointer on line 19.
- `scripts/models.spec.ts`: delete the tests that read `rig-review.yml` or `rig-triage.yml` (:84, :117, :124, :131, :135-139, :146).
- `scripts/vendor.spec.ts`:
  - :31: drop `rig-architecture` and `rig-testplan` from the expected skills.
  - :184 "standalone vendoring copies the review workflow": delete.
  - :165 "init --full vendors...": drop the `rig-review.yml` expectation.
- `scripts/policy.spec.ts` :12 "start reads an inbox file, passes --source...": keep. It tests a kept skill. Only touch it if it fails.

- [ ] **Step 5: Run the tests**

Run: `node --test scripts/*.spec.ts > /tmp/4a-t4.txt 2>&1; grep -E "^ℹ (pass|fail)|^✖" /tmp/4a-t4.txt | head; npm run typecheck`
Expected: `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add -A workflows templates scripts skills
git commit -m "refactor: delete the review workflow, the rig-spec CI template and five non-lifecycle skills (spec §8)"
```

---

### Task 5: E2e out of `npm test`, docs, size-cap ratchet, memory

**Files:**
- Modify: `package.json` (`test` drops `&& npm run test:e2e:fast`), `.github/workflows/ci.yml` (drop the `npm run test:e2e:fast` step), `scripts/size.spec.ts` (total cap lowered to the measured total, rounded up to the next 100), `README.md`, `DESIGN.md`
- Memory: `~/.claude/projects/-Users-chamindawijayasundara-Documents-learning-101-rig-v1/memory/` (`rig-brain-plugin.md` deleted, `behavioural-harness-rebuild.md` updated, `MEMORY.md` lines)
- Test: `scripts/removed.spec.ts`

- [ ] **Step 1: Write the failing test** (append to `scripts/removed.spec.ts`)

```ts
test('4a: the scripted e2e suite is out of npm test until step 5 rewrites it; the e2e unit tests stay', () => {
  const t = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts.test
  assert.doesNotMatch(t, /test:e2e:fast/)
  assert.match(t, /test:e2e:unit/)
  assert.doesNotMatch(read('.github/workflows/ci.yml'), /test:e2e:fast/)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/removed.spec.ts`
Expected: FAIL on `test:e2e:fast`.

- [ ] **Step 3: Make the change**

- `package.json` `test`: `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts && npm run test:e2e:unit`.
- `.github/workflows/ci.yml`: delete the `- run: npm run test:e2e:fast` line.
- `npm run test:e2e:unit`: if an e2e unit test imports a deleted module or phase (`tests/e2e/lib/operator.mjs` chart approval, `phases/s1-chart.mjs`, `phases/s5-wiki-evals.mjs`), delete only that unit test, and ledger it as "rewritten in step 5". Do not edit the phases themselves; step 5 rewrites them.

- [ ] **Step 4: Ratchet the size cap**

```bash
node -e "const fs=require('fs');const t=fs.readdirSync('scripts').filter(n=>n.endsWith('.ts')&&!n.endsWith('.spec.ts')&&n!=='testkit.ts').reduce((s,n)=>s+fs.readFileSync('scripts/'+n,'utf8').replace(/\n$/,'').split('\n').length,0);console.log(t, Math.ceil(t/100)*100)"
```
Check what `CAPPED` covers in `scripts/size.spec.ts` (scripts and possibly `hooks/`). Compute the total the same way as that spec. In `scripts/size.spec.ts`, replace `11000` in both the test name and the assertion with the rounded number.

- [ ] **Step 5: Docs**

- `README.md`: delete the sections and bullets about rig-brain, the band/mission UI and mod commands, `/rig:chart` and `/rig:decompose`, metrics, scorecard, story points, timing, watch, triage, rehearse, the review workflow, and the skills deleted in Tasks 3-4. Add one sentence near the top: "rig is being rebuilt as a behavioural harness (docs/superpowers/specs/2026-10-16-behavioural-harness-design.md); sections below describe what remains."
- `DESIGN.md`: delete the paragraphs at 42, 64, 66, 85, 87, 104, 119, 142, 160 and 163 that describe deleted parts. Keep the rest.
- Then run `grep -n "rig-brain\|band\|mission\|scorecard\|metrics\|/rig:chart\|decompose\|watch\|triage\|rehearse" README.md DESIGN.md` and remove each remaining line that describes a deleted feature.

- [ ] **Step 6: Memory**

- Delete `rig-brain-plugin.md` and its `MEMORY.md` line (spec §12: no wiki or memory layer).
- Update `behavioural-harness-rebuild.md`: step 4a done (commit, this plan's path); 4b next, covering the lifecycle rewrite, spend, the 5 agents, the 7 lifecycle skills, the old-config adapter, the `behavioral`→`contracts` rename, core neutrality, the 3 000 cap, the scripted e2e still out of `npm test`, and the deferred step-3 minors.

- [ ] **Step 7: Run and commit**

Run: `npm test > /tmp/4a-full.txt 2>&1; echo exit $?; grep -E "^ℹ (tests|pass|fail)" /tmp/4a-full.txt; npm run typecheck`
Expected: exit 0, `fail 0` in every block.
```bash
git add package.json .github/workflows/ci.yml scripts/size.spec.ts scripts/removed.spec.ts README.md DESIGN.md tests
git commit -m "chore: scripted e2e out of npm test until step 5; size cap ratcheted to the new total; docs trimmed"
```

---

### Task 6: Verify, review once

- [ ] **Step 1:** Run `npm test` and `npm run typecheck` once more on the final tree. Quote the summary lines.
- [ ] **Step 2:** Run one reviewer agent on `git diff main...HEAD`, model `opus`, with a brief of at most 60 lines: the spec sections, this plan's Decisions and Review Focus, and the ledger rulings. Ask it to check especially that nothing kept for 4b was deleted, that no kept skill or script points at a deleted file or command (`grep -rn` for each deleted name), and that the human-only gate still works in plugin and standalone installs.
- [ ] **Step 3:** Fix Critical and Important findings in one pass, each with a test that fails first, then rerun `npm test`.
- [ ] **Step 4:** Merge only when the person asks (superpowers:finishing-a-development-branch). After the merge, write the 4b plan.
