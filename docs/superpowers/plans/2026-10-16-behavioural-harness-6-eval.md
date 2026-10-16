# Behavioural harness step 6: the eval runner and a first results pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `eval/run.mjs` measures whether rig lifts a model on the shop brief. It runs five arms (Haiku with rig continuous, Haiku bare, Sonnet bare, Opus bare, Haiku with rig final), scores every run with the hidden acceptance, and writes a committed results table. A first pass is run once the person approves the spend.

**Architecture:** One run is one throwaway sandbox (`tests/e2e/lib/sandbox.mjs`):
- **Bare arm:** the shop scaffold plus `BRIEF.md`, then one `claude -p` session.
- **Rig arm:** the scripted S0 install and S1 brief, then the live S2 and S3 changes, via `tests/e2e/lib/flow.mjs` and `tests/e2e/driver/live.mjs`, with the operator approving.

`eval/score.mjs` scores the final tree the same way for every arm: `npm test`, the hidden import acceptance, the hidden HTTP acceptance, and rig's built-in tamper sensors over the run's diff. Each run appends a row to a JSONL file. `eval/report.mjs` turns one or more JSONL files into the markdown table. A `--dry` mode replays fixtures instead of calling a model, so the whole pipeline is tested at $0.

**Tech Stack:** Node 22+ ESM, `node:test`, git, `claude -p` (live runs only).

**Spec:** `docs/superpowers/specs/2026-10-16-behavioural-harness-design.md` §9 (outer loop: evaluation), §3.3 (policy), §10.2 (live budgets).

## Global Constraints

- Spec §9, verbatim:
  - "Task: the shop brief, scored by the hidden acceptance suite."
  - "Arms, 10 runs each: Haiku with rig (continuous), Haiku bare, Sonnet bare, Opus bare, Haiku with rig (final)."
  - "Recorded per run: accepted (yes/no), checks passed, input and output tokens, USD, minutes, tamper findings."
  - "Output: `eval/results/<date>.md` table, committed."
  - "Run by hand; estimated $100 to $300 per pass. Not in CI."
  - "Rule: a sensor, guide or gate that shows no lift over Haiku bare, after two passes, is a candidate for removal."
- Model ids: Haiku `claude-haiku-5-5`, Sonnet `claude-sonnet-5-5`, Opus `claude-opus-5-5`.
- Live caps per run: the existing $6 and 20 minutes (spec §10.2). Every paid run counts against `--cap-total`.
- **Spending money is the person's decision.** No task runs a live (paid) eval without the person's explicit go-ahead in this session.
- `eval/` and `tests/` are outside the size caps; `scripts/` is untouched.
- Never register the plugin at user scope. Never run rig checks on this repo.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisions

1. **Same task, different tooling.** Every arm gets the same scaffold (as S0 writes it, including `scripts/contract.mjs`), the same brief text and the same hidden scoring.
   - A bare arm gets the brief as `BRIEF.md` and one session: "build B1–B6".
   - A rig arm gets the brief in `.rig/product/brief.md` and works through rig's lifecycle, as the live e2e does: S2 (B1–B4) then S3 (B5–B6), with the operator approving each plan.
   - The session count differs by design. It is recorded per run.
2. **Checks passed = 3:** `npm test` passes; hidden acceptance `remove` (import variant, which re-checks `shop` first); hidden acceptance `remove` over HTTP. **Accepted** means all 3.
3. **Tamper findings = `test-tamper` + `suppression`.** These are rig's built-in sensors, run over the run's whole diff against the scaffold commit, in a detached worktree with a builtins-only registry. They are the same for every arm. `harness-tamper` is left out because bare arms have no harness to tamper with.
4. **The runner and the report are separate.** A person can run arms in several processes (`--arms`, `--out`) and merge the JSONL files in one report, since a full pass is 50 sequential runs of up to 20 minutes each.
5. **`--dry`** replays the S2/S3 fixtures. Rig arms use the scripted driver; bare arms copy the finished shop. It costs $0, refuses to write under `eval/results/`, and runs in CI's e2e-fast job on Linux, so the paid path cannot rot unnoticed.
6. **What the first pass answers.** Arms measure the harness as a whole and its two policies; they do not measure single sensors or guides. The report therefore states lift per arm, and says that component-level removal (the spec's rule) needs ablation arms in a later step.

## Review Focus

1. **A run that crashes midway** (spend cap, a claude exit, a refused approve, a thrown driver error). Expect a row with `accepted: false`, the error and the cost spent so far, and the next run still starts. Pinned in Task 3: "a run that throws is recorded with its error and its spend".
2. **The total cap reached between runs.** Expect the runner to stop before a run that could cross `--cap-total`, write what it has, and exit 0 with "stopped at cap". Pinned in Task 3: "nextRunAllowed refuses a run that could cross the total cap".
3. **Results from several processes, or the same arm twice.** Expect the report to merge the rows and count each run once per (arm, run, file). Pinned in Task 4: "summarize merges rows from several files".
4. **An arm with zero completed runs, or every run errored.** Expect a table row of zeros and dashes, not NaN. Pinned in Task 4: "an arm with no rows reads 0/0 and dashes".
5. **A dry run pointed at `eval/results/`.** Expect a refusal, so fixture replays never pose as model results. Pinned in Task 3: "--dry refuses to write under eval/results".

---

### Task 1: Token accounting per session

**Files:**
- Modify: `tests/e2e/assert/process.mjs` (`readSession`, `totals`)
- Test: `tests/e2e/driver/live.test.mjs`

**Interfaces:**
- Produces: `readSession(file)` gains `inputTokens: number` and `outputTokens: number`, from the result event's `usage`. Input counts `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`. `totals(sessions)` gains the same two sums.

- [ ] **Step 1: Write the failing test** (append to `tests/e2e/driver/live.test.mjs`):

```js
import { readSession, totals } from '../assert/process.mjs'

test('a session records its input and output tokens from the result event, cache included', () => {
  const dir = out()
  const f = path.join(dir, 's.jsonl')
  fs.writeFileSync(f, JSON.stringify({ type: 'result', is_error: false, total_cost_usd: 0.5, num_turns: 3, duration_ms: 10, permission_denials: [], usage: { input_tokens: 100, cache_creation_input_tokens: 20, cache_read_input_tokens: 300, output_tokens: 50 } }) + '\n')
  const s = readSession(f)
  assert.equal(s.inputTokens, 420)
  assert.equal(s.outputTokens, 50)
  assert.deepEqual([totals([s, s]).inputTokens, totals([s, s]).outputTokens], [840, 100])
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/e2e/driver/live.test.mjs`
Expected: FAIL. `s.inputTokens` is `undefined`.

- [ ] **Step 3: Implement** in `tests/e2e/assert/process.mjs`.
  - In `readSession`, add `inputTokens: 0, outputTokens: 0` to the initial `s`, and inside the `ev.type === 'result'` branch:

```js
      const u = ev.usage ?? {}
      s.inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
      s.outputTokens = u.output_tokens ?? 0
```

  - In `totals`, add:

```js
  inputTokens: sessions.reduce((n, s) => n + (s.inputTokens ?? 0), 0),
  outputTokens: sessions.reduce((n, s) => n + (s.outputTokens ?? 0), 0),
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:e2e:unit`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/assert/process.mjs tests/e2e/driver/live.test.mjs
git commit -m "test(e2e): sessions record input and output tokens"
```

---

### Task 2: Arms and the scorer

**Files:**
- Create: `eval/arms.mjs`, `eval/score.mjs`, `eval/score.test.mjs`
- Modify: `package.json` (`test:e2e:unit` also runs `eval/*.test.mjs`)

**Interfaces:**
- Produces:
  - `ARMS: { id, model, rig: boolean, policy?: 'continuous' | 'final' }[]`, exactly five, in spec order:
    - `haiku-rig` (haiku, rig, continuous)
    - `haiku-bare`
    - `sonnet-bare`
    - `opus-bare`
    - `haiku-rig-final` (haiku, rig, final)
  - `armsFrom(arg: string | undefined): Arm[]` (`all` or a comma list; refuses an unknown id)
  - `scoreRun(sb, baseSha): Promise<{ checks: number, of: 3, accepted: boolean, npmTest: boolean, acceptance: string | true, http: string | true, tamper: { testTamper: number, suppression: number } }>`

- [ ] **Step 1: Write the failing tests** in `eval/score.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSandbox } from '../tests/e2e/lib/sandbox.mjs'
import { ARMS, armsFrom } from './arms.mjs'
import { scoreRun } from './score.mjs'

const FX = path.resolve(import.meta.dirname, '../tests/e2e/fixtures')
// A scaffolded repo with the finished shop on top of the scaffold commit: what a perfect run leaves behind.
function shopRepo(name) {
  const sb = createSandbox({ name, out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-')) })
  sb.write('package.json', JSON.stringify({ name: 'shop-app', version: '0.1.0', type: 'module', scripts: { start: 'node src/server.js', test: 'node --test' } }, null, 2) + '\n')
  sb.write('test/smoke.test.js', "import { test } from 'node:test'\ntest('loads', () => {})\n")
  sb.commitAll('chore: scaffold')
  const base = sb.git('rev-parse', 'HEAD')
  fs.cpSync(path.join(FX, 'shop'), sb.dir, { recursive: true })
  fs.cpSync(path.join(FX, 'remove'), sb.dir, { recursive: true })
  sb.commitAll('feat: the shop')
  return { sb, base }
}

test('the five arms of spec §9, in order, and --arms picks them', () => {
  assert.deepEqual(ARMS.map(a => a.id), ['haiku-rig', 'haiku-bare', 'sonnet-bare', 'opus-bare', 'haiku-rig-final'])
  assert.deepEqual(ARMS.filter(a => a.rig).map(a => a.policy), ['continuous', 'final'])
  assert.deepEqual(armsFrom('all').length, 5)
  assert.deepEqual(armsFrom('opus-bare,haiku-rig').map(a => a.id), ['opus-bare', 'haiku-rig'])
  assert.throws(() => armsFrom('gpt-bare'), /unknown arm: gpt-bare/)
})

test('a finished shop scores 3/3, accepted, with no tamper', async () => {
  const { sb, base } = shopRepo('perfect')
  const s = await scoreRun(sb, base)
  assert.deepEqual([s.checks, s.of, s.accepted, s.tamper.testTamper, s.tamper.suppression], [3, 3, true, 0, 0], JSON.stringify(s))
})

test('a shop without remove fails both acceptances, and a gutted test counts as tamper', async () => {
  const { sb, base } = shopRepo('broken')
  sb.git('checkout', '-q', 'HEAD~1', '--', '.')
  fs.cpSync(path.join(FX, 'shop'), sb.dir, { recursive: true })
  sb.write('test/shop.test.js', sb.read('test/shop.test.js').replace(/assert\.[a-zA-Z]+\([^\n]*\n/g, '\n'))
  sb.commitAll('feat: half a shop')
  const s = await scoreRun(sb, base)
  assert.equal(s.accepted, false)
  assert.notEqual(s.acceptance, true)
  assert.notEqual(s.http, true)
  assert.ok(s.tamper.testTamper >= 1, JSON.stringify(s.tamper))
})
```

The second scenario starts from the scaffold commit's tree, so `test/shop.test.js` is a new file. If rig's `test-tamper` does not fire on assertions removed from a file that is new against the base, change the scenario: commit the full shop first and use that commit as `base`, so the gutted test is a modification. Then write the ruling. The point of the test is that tamper is counted at all.

In `package.json`, change `test:e2e:unit` to:

`node --test tests/e2e/lib/*.test.mjs tests/e2e/driver/*.test.mjs eval/*.test.mjs`

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test eval/score.test.mjs`
Expected: FAIL, because `./arms.mjs` cannot be resolved.

- [ ] **Step 3: Implement**

`eval/arms.mjs`:

```js
// The arms of spec §9: the same shop brief, with and without rig, across model grades and rig's two policies.
export const MODELS = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' }

export const ARMS = [
  { id: 'haiku-rig', model: MODELS.haiku, rig: true, policy: 'continuous' },
  { id: 'haiku-bare', model: MODELS.haiku, rig: false },
  { id: 'sonnet-bare', model: MODELS.sonnet, rig: false },
  { id: 'opus-bare', model: MODELS.opus, rig: false },
  { id: 'haiku-rig-final', model: MODELS.haiku, rig: true, policy: 'final' },
]

export function armsFrom(arg) {
  if (!arg || arg === 'all') return ARMS
  return arg.split(',').map(id => ARMS.find(a => a.id === id.trim()) ?? (() => { throw new Error(`unknown arm: ${id.trim()} (known: ${ARMS.map(a => a.id).join(', ')})`) })())
}
```

`eval/score.mjs`:

```js
// One scorer for every arm (spec §9): npm test, the hidden acceptance (import and HTTP), and rig's built-in tamper sensors over the
// whole run's diff, judged in a detached worktree with a builtins-only registry so bare and rig arms are measured alike.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Checks } from '../tests/e2e/lib/checks.mjs'
import { PLUGIN } from '../tests/e2e/lib/sandbox.mjs'
import { assertShop } from '../tests/e2e/acceptance/shop.mjs'
import { assertShopHttp } from '../tests/e2e/acceptance/shop-http.mjs'

const SDLC = path.join(PLUGIN, 'scripts/sdlc.ts')

function tamperOf(sb, base) {
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-wt-'))
  sb.git('worktree', 'add', '-q', '--detach', wt, 'HEAD')
  try {
    const node = args => sb.run('node', ['--disable-warning=ExperimentalWarning', SDLC, ...args], { cwd: wt, env: { CLAUDE_PROJECT_DIR: wt } })
    if (!fs.existsSync(path.join(wt, '.rig'))) node(['init'])
    fs.writeFileSync(path.join(wt, '.rig/sensors.json'), '{ "sensors": [] }\n')
    const r = node(['check', '--at', 'ci', '--base', base, '--json'])
    const findings = (() => { try { return JSON.parse(r.stdout).findings ?? [] } catch { return [] } })()
    const count = id => findings.filter(f => f.sensor === id).length
    return { testTamper: count('test-tamper'), suppression: count('suppression') }
  } finally {
    sb.git('worktree', 'remove', '--force', wt)
  }
}

export async function scoreRun(sb, base) {
  const c = new Checks('score')
  const t = sb.run('npm', ['test', '--silent'])
  const npmTest = t.status === 0
  await assertShop(c, sb.dir, 'remove')
  await assertShopHttp(c, sb.dir, 'remove')
  const [imp, http] = c.results
  const acceptance = imp.status === 'PASS' ? true : imp.why
  const httpOk = http.status === 'PASS' ? true : http.why
  const checks = [npmTest, acceptance === true, httpOk === true].filter(Boolean).length
  return { checks, of: 3, accepted: checks === 3, npmTest, acceptance, http: httpOk, tamper: tamperOf(sb, base) }
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `node --test eval/score.test.mjs`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add eval/arms.mjs eval/score.mjs eval/score.test.mjs package.json
git commit -m "feat(eval): the five arms and one scorer for all of them: npm test, hidden acceptance (import and HTTP), tamper"
```

---

### Task 3: The runner

**Files:**
- Create: `eval/run.mjs`, `eval/setup.mjs`, `eval/run.test.mjs`
- Modify: `tests/e2e/phases/s0-install.mjs` (`install(sb, { registry, plugins } = {})`)
- Modify: `package.json` (scripts `eval`, `eval:dry`)

**Interfaces:**
- Consumes: `ARMS`, `armsFrom`, `scoreRun` (Task 2); `createSessions`, `liveDriver` (live.mjs); `scriptedDriver`; `runChange` (flow.mjs); `install`, `REGISTRY`, `copyContractTool` (s0); `runBrief` (s1); `PHASE` from s2 and s3; `mergeToMain`; `totals` (Task 1).
- Produces:
  - `nextRunAllowed(spentUsd, capRunUsd, capTotalUsd): boolean`
  - `resultsAllowed(outPath, dry): string | null` (null when allowed, else the refusal message)
  - `runOne(arm, n, { dry, out, capRunUsd }): Promise<Row>`, where Row is `{ arm, run, model, rig, policy, accepted, checks, of, npmTest, acceptance, http, inputTokens, outputTokens, usd, minutes, sessions, tamper, error?, at }`
  - CLI: `node eval/run.mjs [--arms all|a,b] [--runs N=10] [--cap-run USD=6] [--cap-total USD=300] [--out DIR] [--results FILE] [--dry]`. It appends one JSON line per run to `--results`, which defaults to `eval/results/<YYYY-MM-DD>.jsonl` (live) or `<out>/results.jsonl` (dry).

- [ ] **Step 1: Write the failing tests** in `eval/run.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { nextRunAllowed, resultsAllowed, runOne } from './run.mjs'
import { ARMS } from './arms.mjs'

test('nextRunAllowed refuses a run that could cross the total cap', () => {
  assert.equal(nextRunAllowed(0, 6, 300), true)
  assert.equal(nextRunAllowed(294, 6, 300), true)
  assert.equal(nextRunAllowed(294.01, 6, 300), false)
})

test('--dry refuses to write under eval/results', () => {
  assert.match(resultsAllowed(path.resolve(import.meta.dirname, 'results/2026-10-16.jsonl'), true) ?? '', /dry runs never write under eval\/results/)
  assert.equal(resultsAllowed(path.join(os.tmpdir(), 'x.jsonl'), true), null)
  assert.equal(resultsAllowed(path.resolve(import.meta.dirname, 'results/2026-10-16.jsonl'), false), null)
})

test('a dry bare run and a dry rig run are accepted 3/3 at $0', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  for (const id of ['haiku-bare', 'haiku-rig-final']) {
    const row = await runOne(ARMS.find(a => a.id === id), 1, { dry: true, out, capRunUsd: 6 })
    assert.deepEqual([row.arm, row.accepted, row.checks, row.usd, row.error], [id, true, 3, 0, undefined], JSON.stringify(row))
  }
})

test('a run that throws is recorded with its error and its spend', async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-run-'))
  const row = await runOne({ id: 'broken', model: 'x', rig: true, policy: 'continuous' }, 1, { dry: true, out, capRunUsd: 6, failAt: 'build' })
  assert.equal(row.accepted, false)
  assert.match(row.error, /build/)
  assert.equal(typeof row.usd, 'number')
})
```

`failAt` is a test-only option of `runOne`: the dry driver throws `new Error('injected failure at build')` from its `build` step. This test makes the error path real without spending money.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test eval/run.test.mjs`
Expected: FAIL, because `./run.mjs` cannot be resolved.

- [ ] **Step 3: Implement**

In `tests/e2e/phases/s0-install.mjs`, change `install(sb)` to `install(sb, { registry = REGISTRY, plugins = [] } = {})`. It writes `registry` instead of `REGISTRY`, and calls `sb.isolate(plugins)` instead of `sb.isolate([])`. A live rig arm must switch the person's own plugins off, as the live e2e does; `isolate([])` would rewrite `settings.local.json` with none switched off.

`eval/setup.mjs`:

```js
// How one eval run's sandbox starts: the same scaffold and brief for every arm; rig arms are onboarded the way S0 and S1 do it.
import fs from 'node:fs'
import path from 'node:path'
import { install, REGISTRY, copyContractTool } from '../tests/e2e/phases/s0-install.mjs'
import { installedPlugins } from '../tests/e2e/lib/sandbox.mjs'
import { runBrief } from '../tests/e2e/phases/s1-brief.mjs'

const BRIEF = path.resolve(import.meta.dirname, '../tests/e2e/prd/shop-brief.md')
const FX = path.resolve(import.meta.dirname, '../tests/e2e/fixtures')

export const BARE_PROMPT = 'Build the shop described in BRIEF.md: behaviours B1–B6, in src/, with node --test tests in test/ whose names start with their B-number, `npm test` passing, and `npm start` serving the HTTP API as the brief says. Keep the HTTP contract in api/openapi.yaml and contracts/examples/ (node scripts/contract.mjs validate|run checks it). Work until it is done.'

export function setupBare(sb, { dry = false } = {}) {
  sb.isolate(dry ? [] : installedPlugins())
  sb.write('package.json', JSON.stringify({ name: 'shop-app', version: '0.1.0', type: 'module', scripts: { start: 'node src/server.js', test: 'node --test' } }, null, 2) + '\n')
  sb.write('src/index.js', 'export {}\n')
  sb.write('test/smoke.test.js', "import { test } from 'node:test'\nimport '../src/index.js'\ntest('loads', () => {})\n")
  copyContractTool(sb)
  sb.write('BRIEF.md', fs.readFileSync(BRIEF, 'utf8'))
  sb.write('CLAUDE.md', '# shop-app\n\nThe product brief is BRIEF.md.\n')
  sb.commitAll('chore: scaffold')
  return sb.git('rev-parse', 'HEAD')
}

// The scaffold commit is the base for tamper scoring; install and brief land on top of it.
export async function setupRig(sb, arm, { dry = false } = {}) {
  const registry = { ...REGISTRY, policy: { haiku: arm.policy, sonnet: 'continuous', opus: 'final', default: 'continuous' } }
  const c = await install(sb, { registry, plugins: dry ? [] : installedPlugins() })
  if (c.failed.length) throw new Error(`install failed: ${c.failed.map(f => f.name).join('; ')}`)
  const base = sb.git('rev-list', '--max-parents=0', 'HEAD')
  const b = await runBrief(sb)
  if (b.failed.length) throw new Error(`brief failed: ${b.failed.map(f => f.name).join('; ')}`)
  return base
}

// Dry bare: what a perfect bare session leaves behind.
export function dryBare(sb) {
  fs.cpSync(path.join(FX, 'shop'), sb.dir, { recursive: true })
  fs.cpSync(path.join(FX, 'remove'), sb.dir, { recursive: true })
}
```

`eval/run.mjs`:

```js
// The eval runner (spec §9): node eval/run.mjs [--arms all|a,b] [--runs 10] [--cap-run 6] [--cap-total 300] [--out DIR] [--results FILE] [--dry]
// Live runs cost money and are started by a person; --dry replays fixtures at $0 and never writes under eval/results.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSandbox } from '../tests/e2e/lib/sandbox.mjs'
import { runChange } from '../tests/e2e/lib/flow.mjs'
import { mergeToMain } from '../tests/e2e/lib/merge.mjs'
import { scriptedDriver } from '../tests/e2e/driver/scripted.mjs'
import { createSessions, liveDriver } from '../tests/e2e/driver/live.mjs'
import { totals } from '../tests/e2e/assert/process.mjs'
import { PHASE as S2 } from '../tests/e2e/phases/s2-greenfield.mjs'
import { PHASE as S3 } from '../tests/e2e/phases/s3-delete.mjs'
import { armsFrom } from './arms.mjs'
import { scoreRun } from './score.mjs'
import { setupBare, setupRig, dryBare, BARE_PROMPT } from './setup.mjs'

const RESULTS = path.resolve(import.meta.dirname, 'results')

export const nextRunAllowed = (spent, capRun, capTotal) => spent + capRun <= capTotal + 1e-9
export const resultsAllowed = (file, dry) => (dry && path.resolve(file).startsWith(RESULTS + path.sep) ? 'dry runs never write under eval/results: they replay fixtures, not a model' : null)

const failing = (driver, failAt) => (failAt ? { ...driver, [failAt]: async () => { throw new Error(`injected failure at ${failAt}`) } } : driver)

export async function runOne(arm, n, { dry, out, capRunUsd, failAt }) {
  const t0 = Date.now()
  const sb = createSandbox({ name: `${arm.id}-${n}`, out })
  const sessions = dry ? null : createSessions({ sb, out: sb.root, capUsd: capRunUsd, model: arm.model })
  const row = { arm: arm.id, run: n, model: arm.model, rig: arm.rig, policy: arm.policy ?? null, at: new Date().toISOString() }
  let base = null
  try {
    if (arm.rig) {
      base = await setupRig(sb, arm, { dry })
      for (const phase of [S2, S3]) {
        const driver = failing(dry ? scriptedDriver(sb, phase) : liveDriver(sb, phase, { sessions }), failAt)
        const { slug } = await runChange(sb, phase, driver)
        mergeToMain(sb, slug)
      }
    } else {
      base = setupBare(sb, { dry })
      if (failAt) throw new Error(`injected failure at ${failAt}`)
      if (dry) dryBare(sb)
      else sessions.run('bare', BARE_PROMPT)
      sb.commitAll('chore: session result')
    }
  } catch (err) {
    row.error = String(err?.message ?? err).split('\n')[0]
  }
  const score = base ? await scoreRun(sb, base).catch(e => ({ checks: 0, of: 3, accepted: false, error: e.message })) : { checks: 0, of: 3, accepted: false }
  const t = sessions ? totals(sessions.sessions) : { costUsd: 0, inputTokens: 0, outputTokens: 0 }
  return {
    ...row, ...score, accepted: !row.error && score.accepted, error: row.error ?? score.error,
    inputTokens: t.inputTokens, outputTokens: t.outputTokens, usd: Number(t.costUsd.toFixed(4)),
    minutes: Number(((Date.now() - t0) / 60_000).toFixed(2)), sessions: sessions?.sessions.length ?? 0,
  }
}

if (process.argv[1] === import.meta.filename) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
  const dry = process.argv.includes('--dry')
  const out = path.resolve(arg('out', fs.mkdtempSync(path.join(os.tmpdir(), 'rig-eval-'))))
  const results = path.resolve(arg('results', dry ? path.join(out, 'results.jsonl') : path.join(RESULTS, `${new Date().toISOString().slice(0, 10)}.jsonl`)))
  const refusal = resultsAllowed(results, dry)
  if (refusal) { console.error(refusal); process.exit(2) }
  const runs = Number(arg('runs', 10))
  const capRunUsd = Number(arg('cap-run', 6))
  const capTotal = Number(arg('cap-total', 300))
  fs.mkdirSync(path.dirname(results), { recursive: true })
  let spent = 0
  let stopped = false
  for (let n = 1; n <= runs && !stopped; n++) {
    for (const arm of armsFrom(arg('arms'))) {
      if (!dry && !nextRunAllowed(spent, capRunUsd, capTotal)) { console.log(`stopped at cap: $${spent.toFixed(2)} spent of $${capTotal}`); stopped = true; break }
      const row = await runOne(arm, n, { dry, out, capRunUsd })
      spent += row.usd
      fs.appendFileSync(results, JSON.stringify(row) + '\n')
      console.log(`${arm.id} #${n}: ${row.accepted ? 'accepted' : 'not accepted'} ${row.checks}/${row.of}, $${row.usd}, ${row.minutes} min${row.error ? ` (${row.error})` : ''}`)
    }
  }
  console.log(`\n${results}\nsandboxes: ${out}`)
}
```

The runner interleaves arms within each run number, so a pass stopped at the cap still covers every arm evenly.

`package.json` scripts:
- `"eval": "node eval/run.mjs"`
- `"eval:dry": "node eval/run.mjs --dry --runs 1"`

- [ ] **Step 4: Run them to verify they pass, then the dry runner over all arms**

Run: `node --test eval/run.test.mjs`
Expected: PASS, 4/4.

Run: `npm run eval:dry`
Expected: five lines `<arm> #1: accepted 3/3, $0, … min`, then the results path under the temp out dir. Exit 0.

- [ ] **Step 5: Commit**

```bash
git add eval tests/e2e/phases/s0-install.mjs package.json
git commit -m "feat(eval): the runner: bare and rig arms per run, live or dry, capped per run and in total, one JSONL row per run"
```

---

### Task 4: The report

**Files:**
- Create: `eval/report.mjs`, `eval/report.test.mjs`

**Interfaces:**
- Consumes: Row (Task 3), `ARMS` (Task 2).
- Produces:
  - `summarize(rows): { arm, runs, accepted, checksMean, inMedian, outMedian, usdMean, minutesMedian, tamper, errors }[]`, in `ARMS` order
  - `renderMarkdown(summary, { date, files }): string`
  - CLI: `node eval/report.mjs <results.jsonl...> [--out FILE]`, which writes markdown to `--out` or prints it

- [ ] **Step 1: Write the failing tests** in `eval/report.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { summarize, renderMarkdown } from './report.mjs'

const row = (arm, run, ok, usd = 1, extra = {}) => ({ arm, run, accepted: ok, checks: ok ? 3 : 1, of: 3, inputTokens: 1000 * run, outputTokens: 100 * run, usd, minutes: run, tamper: { testTamper: ok ? 0 : 1, suppression: 0 }, ...extra })

test('summarize merges rows from several files and keeps ARMS order', () => {
  const s = summarize([row('opus-bare', 1, true), row('haiku-bare', 1, false), row('haiku-bare', 2, true), row('opus-bare', 2, true)])
  assert.deepEqual(s.map(a => a.arm), ['haiku-rig', 'haiku-bare', 'sonnet-bare', 'opus-bare', 'haiku-rig-final'])
  const hb = s.find(a => a.arm === 'haiku-bare')
  assert.deepEqual([hb.runs, hb.accepted, hb.checksMean, hb.inMedian, hb.usdMean, hb.tamper], [2, 1, 2, 1500, 1, 1])
})

test('an arm with no rows reads 0/0 and dashes', () => {
  const md = renderMarkdown(summarize([row('haiku-bare', 1, true)]), { date: '2026-10-16', files: ['a.jsonl'] })
  assert.match(md, /\| haiku-rig \| 0\/0 \| – \|/)
  assert.doesNotMatch(md, /NaN|undefined/)
})

test('the table shows lift in acceptance over Haiku bare, and errored runs', () => {
  const s = summarize([row('haiku-bare', 1, false), row('haiku-bare', 2, false), row('haiku-rig', 1, true), row('haiku-rig', 2, false, 1, { error: 'spend cap $6 reached' })])
  const md = renderMarkdown(s, { date: '2026-10-16', files: ['a.jsonl'] })
  assert.match(md, /\| haiku-rig \| 1\/2 \| \+50 pts \|/)
  assert.match(md, /\| haiku-bare \| 0\/2 \| baseline \|/)
  assert.match(md, /errors: haiku-rig 1 \(spend cap \$6 reached\)/)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test eval/report.test.mjs`
Expected: FAIL, because `./report.mjs` cannot be resolved.

- [ ] **Step 3: Implement** `eval/report.mjs`:

```js
// The results table of spec §9 from one or more runner JSONL files: node eval/report.mjs <results.jsonl...> [--out FILE]
import fs from 'node:fs'
import { ARMS } from './arms.mjs'

const median = xs => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const mean = xs => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : null)

export function summarize(rows) {
  return ARMS.map(({ id }) => {
    const rs = rows.filter(r => r.arm === id)
    return {
      arm: id, runs: rs.length, accepted: rs.filter(r => r.accepted).length,
      checksMean: mean(rs.map(r => r.checks ?? 0)), inMedian: median(rs.map(r => r.inputTokens ?? 0)), outMedian: median(rs.map(r => r.outputTokens ?? 0)),
      usdMean: mean(rs.map(r => r.usd ?? 0)), minutesMedian: median(rs.map(r => r.minutes ?? 0)),
      tamper: rs.reduce((n, r) => n + (r.tamper?.testTamper ?? 0) + (r.tamper?.suppression ?? 0), 0),
      errors: rs.filter(r => r.error).map(r => r.error),
    }
  })
}

const dash = (v, f = x => String(x)) => (v === null || v === undefined ? '–' : f(v))
const rate = a => (a.runs ? a.accepted / a.runs : null)

export function renderMarkdown(summary, { date, files }) {
  const base = rate(summary.find(a => a.arm === 'haiku-bare') ?? { runs: 0 })
  const lift = a => (a.arm === 'haiku-bare' ? 'baseline' : rate(a) === null || base === null ? '–' : `${rate(a) >= base ? '+' : ''}${Math.round((rate(a) - base) * 100)} pts`)
  const rows = summary.map(a => `| ${a.arm} | ${a.accepted}/${a.runs} | ${lift(a)} | ${dash(a.checksMean, x => x.toFixed(1))}/3 | ${dash(a.inMedian, Math.round)} | ${dash(a.outMedian, Math.round)} | ${dash(a.usdMean, x => '$' + x.toFixed(2))} | ${dash(a.minutesMedian, x => x.toFixed(1))} | ${a.runs ? a.tamper : '–'} |`)
  const errs = summary.filter(a => a.errors.length).map(a => `${a.arm} ${a.errors.length} (${[...new Set(a.errors)].slice(0, 2).join('; ')})`)
  return [
    `# Eval results ${date}`, '',
    `Task: the shop brief (B1–B6), scored by the hidden acceptance (npm test, import, HTTP). Spec §9. Source: ${files.join(', ')}.`, '',
    '| arm | accepted | lift vs haiku-bare | checks (mean) | input tokens (median) | output tokens (median) | USD (mean) | minutes (median) | tamper findings |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows, '',
    errs.length ? `errors: ${errs.join(', ')}` : 'errors: none', '',
    'Rule (spec §9): a sensor, guide or gate with no lift over haiku-bare after two passes is a candidate for removal. These arms measure rig as a whole and its two policies; per-component lift needs ablation arms.',
    '',
  ].join('\n')
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2)
  const i = args.indexOf('--out')
  const outFile = i >= 0 ? args[i + 1] : null
  const files = args.filter((a, k) => i < 0 || (k !== i && k !== i + 1))
  const rows = files.flatMap(f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)))
  const date = (files[0]?.match(/\d{4}-\d{2}-\d{2}/) ?? [new Date().toISOString().slice(0, 10)])[0]
  const md = renderMarkdown(summarize(rows), { date, files })
  if (outFile) fs.writeFileSync(outFile, md)
  else process.stdout.write(md)
}
```

- [ ] **Step 4: Run them to verify they pass, then a dry report end to end**

Run: `node --test eval/report.test.mjs`
Expected: PASS, 3/3.

Run: `npm run eval:dry -- --out <scratchpad>/evaldry && node eval/report.mjs <scratchpad>/evaldry/results.jsonl`
Expected: a table in which every arm reads `1/1`, `checks 3.0/3` and `$0.00`, and `errors: none`.

- [ ] **Step 5: Commit**

```bash
git add eval/report.mjs eval/report.test.mjs
git commit -m "feat(eval): the results table: acceptance and lift over haiku-bare per arm, tokens, cost, minutes, tamper"
```

---

### Task 5: Wiring and docs

**Files:**
- Modify: `.github/workflows/ci.yml` (the e2e-fast job runs `npm run eval:dry` on ubuntu only)
- Create: `eval/results/.gitkeep`
- Modify: `README.md` (an "Evaluation" paragraph and the commands)
- Modify: the spec §9 (a note on Decisions 2, 3 and 6)
- Test: `scripts/removed.spec.ts`

- [ ] **Step 1: Write the failing guard** in `scripts/removed.spec.ts`:

```ts
test('6: the eval runner is wired: dry in CI, live by hand, results committed under eval/results', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  assert.match(pkg.scripts.eval, /eval\/run\.mjs/)
  assert.match(pkg.scripts['eval:dry'], /--dry/)
  assert.match(pkg.scripts['test:e2e:unit'], /eval\/\*\.test\.mjs/)
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8')
  assert.match(ci, /npm run eval:dry/)
  assert.doesNotMatch(ci, /npm run eval(?!:dry)\b/, 'live evals never run in CI (spec §9)')
  assert.ok(fs.existsSync('eval/results/.gitkeep'))
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --disable-warning=ExperimentalWarning --test scripts/removed.spec.ts`
Expected: FAIL on `npm run eval:dry` missing from ci.yml.

- [ ] **Step 3: Make the edits**
  - **ci.yml**, e2e-fast job, after `npm run test:e2e:fast`: `- run: npm run eval:dry`, with `if: matrix.os == 'ubuntu-latest'`. Add a comment: `# the eval pipeline replayed from fixtures at $0; live evals are run by a person (spec §9)`.
  - **`eval/results/.gitkeep`**: an empty file.
  - **README**: add a short "Evaluation" paragraph after the e2e paragraph. It covers the five arms; what is recorded; `npm run eval:dry`; `npm run eval -- --arms all --runs 10 --cap-total 300` ($100–300, by hand); `node eval/report.mjs eval/results/<date>.jsonl --out eval/results/<date>.md`; and the rule.
  - **Spec §9**, under the bullets: `Step 6 notes: a rig arm runs the brief as two rig changes (S2, S3) with the operator approving; a bare arm gets BRIEF.md and one session. Checks passed = npm test + hidden acceptance (import) + hidden acceptance (HTTP); tamper findings = test-tamper + suppression over the run's diff. Arms measure rig as a whole; per-component lift needs ablation arms.`

- [ ] **Step 4: Run the whole suite**

Run: `npm test > <scratchpad>/s6.txt 2>&1; echo exit $?; grep -E "^ℹ (pass|fail)|checks passed|floor" <scratchpad>/s6.txt`
Expected: exit 0. Every spec passes; every e2e unit test passes, including the eval tests; the scripted e2e is unchanged at 14/3/22/27/9/6. Also run `npm run typecheck` and expect 0 errors.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml eval/results/.gitkeep README.md docs/superpowers/specs/2026-10-16-behavioural-harness-design.md scripts/removed.spec.ts
git commit -m "docs(eval): wired: dry in CI on Linux, live by hand; README and spec notes"
```

---

### Task 6: Review, then the first results pass (paid; the person decides)

- [ ] Run `npm test`, `npm run typecheck` and `npm run eval:dry`, and quote the results.
- [ ] Launch one Opus reviewer on `git diff main...HEAD` using `requesting-code-review/code-reviewer.md`, with this plan, spec §9, the Review Focus verbatim and the ledger's rulings. Fix every Critical and Important finding in one pass, each with a test that fails first.
- [ ] **Stop and ask the person** before any paid run. Offer two options:
  - **Pilot:** `npm run eval -- --arms all --runs 1 --cap-total 30`. That is 5 runs, an estimated $10–30, about 1–1.5 hours. It shows the live path works for every arm.
  - **Full pass:** `--runs 10 --cap-total 300`. That is 50 runs, $100–300 per spec §9, many hours sequentially. It can be split across processes with `--arms` and `--results`.
- [ ] After a paid run the person approved, run `node eval/report.mjs eval/results/<date>.jsonl --out eval/results/<date>.md`, commit both files, and report the table. Any arm without lift over haiku-bare is reported as such; nothing is removed in this step.
- [ ] Merge only when the person asks.
