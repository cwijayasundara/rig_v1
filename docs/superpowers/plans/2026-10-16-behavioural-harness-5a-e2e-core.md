# Behavioural harness step 5a: the e2e suite on the slim lifecycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this repo runs plans natively, see CLAUDE.md "One review per change") to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the scripted e2e suite (`npm run test:e2e:fast`) pass again on the rebuilt harness, and put it back in `npm test` and CI. The suite covers install on the registry, a product brief, a greenfield change and a follow-on change through approval, verify and PR, and the local deploy gate.

**Architecture:**
- **Route runner.** A linear `lib/flow.mjs` replaces `lib/operator.mjs`, which looped `next --json`. The model writes the spec and plan, the person runs `approve <slug>`, then the model builds, verifies and opens the PR.
- **Drivers.** The scripted driver plays those steps from fixture files. The live driver sends the matching skills (`/rig-start`, `/rig-plan`, `/rig-build`).
- **Assertions.** `assert/change.mjs` is rewritten to check the new evidence: `approval.json`, `evidence/runs.jsonl`, `verify.json`, `pr.md`, a clean `sync --check`, and the CI human-review row.
- **Phases.** S0 (install) and S2–S4 are rewritten. S1 becomes a brief stage. S5 and everything watch-, chart-, brain- or tier-related is deleted.

**Tech Stack:** Node 22 ESM (`.mjs`), `node --test` for the e2e unit tests, git, the sandbox and gh stub in `tests/e2e/lib`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-16-behavioural-harness-design.md` §10.2 (E2e) and §5 (sync). The person split step 5 on 2026-10-16:
- **5a (this plan):** the suite green on the slim lifecycle.
- **5b:** the contract stage, the policy stage, the HTTP acceptance variant and the stack fixtures.

## Global Constraints

- **Cost.** The scripted e2e stays free and fast: about 30 s, no model calls.
- **Live budget unchanged.** The live run keeps under 20 minutes and $6 (`run.mjs` `--minutes`/`--cap`, `driver/live.mjs` caps). This plan does not run the live suite.
- **The sandbox stays a real git repo.** It has a bare `origin` and the gh stub (`lib/sandbox.mjs`, `lib/gh-stub.sh`). The suite never talks to GitHub.
- **Human-only approval.** Approvals go through `sb.sdlc([...], { human: true })` (SDLC_HUMAN=1), exactly as a person's `/rig:approve` does.
- **Fix the harness, not the test (CLAUDE.md).** When the suite exposes a harness bug, fix it in `scripts/` with a spec that fails first. Never weaken an e2e assertion to get past it.
- **Green at every task end.** `npm test` (spec files and e2e unit tests) is green at the end of every task. From Task 3 on, `npm run test:e2e:fast` is too.

## Decisions this plan takes (flag in review if wrong)

1. **A brief behaviour with no test warns; it never blocks.** Spec §5 lists it as a `sync --check` failure that blocks at commit and in CI. Taken literally, a brief written at project start blocks every PR until every behaviour has a test, so delivery can't be incremental. The blocking gate stays the change's own traceability (`verify`/CI: each B-number in the change's `spec.md` is named by a test). The brief's B-numbers become a warning at commit, at SessionStart and in CI. The e2e suite exposed this, so it's fixed in the harness (Task 1).
2. **B-numbers are unique across the product.** The brief numbers B1–B6. S2's `spec.md` claims B1–B4 and S3's claims B5–B6, and the fixture tests name them. That way brief-level and change-level traceability agree.
3. **The registry S0 writes is minimal.** It is one `unit` sensor (`npm test`, turn cadence) plus the built-ins. It is not the node stack pack, because ESLint, tsc and depcruise aren't installed in the sandbox. Stack packs are tested in 5b's stack fixtures.
4. **The route runner is linear.** `begin → plan → approve (person) → build → pr`. The old `runRoute` loop and its 11 unit tests are deleted along with the commands they drove (`next`, `ratchet`, `pr-checks`). `lib/flow.test.mjs` covers the new runner.
5. **The stale-approval check moves into S3, before the build.** Approve, edit `spec.md`, and assert `status` says `approve` (stale). Restore it and assert `build`. After the PR the status is `review` whatever the approval, so the old after-ship check can't work.
6. **The acceptance scorer `acceptance/shop.mjs` is unchanged** (it imports source paths). 5b adds the HTTP variant.

## Review Focus

1. **The approval matches what was approved.** In S2 and S3, `approval.json` must hash exactly the `spec.md` and `plan.md` in the PR commit. An approval made before a later spec edit must not ship. Test in Task 3 (the S3 stale check and the `assertChange` hash check).
2. **Red before green.** The red run must be recorded before the green run in `evidence/runs.jsonl`, and verify's red-proof must agree. An implementation copied before its test would fail red-proof. Test in Task 3 (`assertChange`).
3. **The PR commit is complete.** After `pr`, the tree is clean, `.rig/state/` is not committed, and the PR commit holds the change folder and the source. Test in Task 3.
4. **CI sees the approval row.** Run from a worktree of the PR commit, `check --at ci` lists the `approval.json` as a human row. That is what makes CI demand an independent reviewer. Test in Task 3.
5. **No coverage lost silently.** A phase whose assertion calls were deleted fails the run. The FLOOR counts are set from the measured run in Task 4, not guessed. Test in Task 4.

---

### Task 1: Brief behaviours without tests warn (harness fix)

**Files:**
- Modify: `scripts/sync.ts` (`syncFindings`: brief findings are always `warn`; `cmdSync --check` exits non-zero only on blocks)
- Test: `scripts/sync.spec.ts`

- [ ] **Step 1: Write the failing tests** (append to `scripts/sync.spec.ts`)

```ts
test('a brief behaviour with no test warns at commit and in sync --check; it never blocks', () => {
  commit({})
  sdlc(repo, ['sync'])
  write(repo, '.rig/product/brief.md', '# Brief\n\n## Behaviours\n- B1: lists orders\n- B2: cancels an order\n')
  write(repo, 'test/a.test.js', "// B1 lists orders\n")
  gitIn(repo, 'add', '.')
  const r = sdlc(repo, ['check', '--at', 'commit'])
  assert.equal(r.code, 0, r.stdout)
  assert.match(r.stdout, /B2 has no test/)
  const check = sdlc(repo, ['sync', '--check'])
  assert.equal(check.code, 0, check.stdout)
  assert.match(check.stdout, /B2 has no test/)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test --test-name-pattern="brief behaviour with no test warns" scripts/sync.spec.ts`
Expected: FAIL. The commit check exits 1 with a `[sync]` block for B2.

- [ ] **Step 3: Implement** (`scripts/sync.ts`)

In `syncFindings`, the severity of a brief finding is always `'warn'`:
```ts
    return { sensor: 'sync', severity: ofBrief ? 'warn' : severity, file: ofBrief ? BRIEF : CLAUDE_MD, message, fix: ... }
```
(Keep the existing `fix` expression.) Add a comment above `syncFindings`: "A brief behaviour with no test yet is a warning: the brief is written before the code, and each change's own spec.md is what verify and CI hold to its tests."

In `cmdSync`, under `--check`, print every finding but exit non-zero only when one is a block:
```ts
  out(found.map(f => `[sync] ${f.severity === 'warn' ? '(warning) ' : ''}${f.message}\n  fix: ${f.fix}`).join('\n'))
  process.exitCode = found.some(f => f.severity === 'block') ? 1 : 0
```
Print `'sync --check: guides match the registry'` only when `found` is empty, as today.

- [ ] **Step 4: Run the tests**

Run: `node --test scripts/sync.spec.ts && npm run typecheck`
Expected: PASS. The existing "check 4" test still passes, since `syncProblems` is unchanged.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync.ts scripts/sync.spec.ts
git commit -m "fix(sync): a brief behaviour with no test warns; only a change's own spec blocks on traceability"
```

---

### Task 2: The linear route runner and the scripted driver

**Files:**
- Create: `tests/e2e/lib/flow.mjs`, `tests/e2e/lib/flow.test.mjs`
- Rewrite: `tests/e2e/driver/scripted.mjs`
- Modify: `tests/e2e/driver/live.mjs` (driver methods `begin`, `plan`, `build`)
- Delete: `tests/e2e/lib/operator.mjs`, `tests/e2e/lib/operator.test.mjs`, `tests/e2e/lib/oracle.mjs`

**Interfaces:**
- Produces:
  - Driver shape (both drivers): `{ begin(): Promise<string>, plan(slug): Promise<void>, build(slug): Promise<void>, sessions? }`.
  - `runChange(sb, phase, driver, { afterApprove? }): Promise<{ slug: string; notes: string[] }>` in `lib/flow.mjs`.
  - Phase shape consumed by the scripted driver: `{ id, slug, type, title, intent: { problem, outcome, nonGoals }, spec: string, plan: string, tests: {src,dest}[], impl: {src,dest}[], commit: string, acceptance }`.

- [ ] **Step 1: Write the failing tests** in `tests/e2e/lib/flow.test.mjs`

```js
// The linear route runner: the model plans, the person approves, the model builds. No next --json loop.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runChange } from './flow.mjs'

const fakeSb = (approve = { status: 0, stdout: 'approved demo', stderr: '' }) => {
  const calls = []
  return { calls, sdlc: (args, o = {}) => { calls.push(['sdlc', args.join(' '), Boolean(o.human)]); return approve }, commitAll: m => { calls.push(['commit', m]); return true } }
}
const fakeDriver = calls => ({
  begin: async () => { calls.push(['begin']); return 'demo' },
  plan: async slug => { calls.push(['plan', slug]) },
  build: async slug => { calls.push(['build', slug]) },
})

test('runs begin, plan, a human approve, then build, in that order', async () => {
  const sb = fakeSb()
  const r = await runChange(sb, { id: 'S9' }, fakeDriver(sb.calls))
  assert.equal(r.slug, 'demo')
  assert.deepEqual(sb.calls, [['begin'], ['plan', 'demo'], ['sdlc', 'approve demo', true], ['build', 'demo']])
})

test('a refused approval stops the run with the reason and never builds', async () => {
  const sb = fakeSb({ status: 1, stdout: '', stderr: 'resolve the open question(s) first' })
  await assert.rejects(runChange(sb, { id: 'S9' }, fakeDriver(sb.calls)), /approve refused: resolve the open question/)
  assert.ok(!sb.calls.some(c => c[0] === 'build'))
})

test('afterApprove runs between the approval and the build, and its notes come back', async () => {
  const sb = fakeSb()
  const r = await runChange(sb, { id: 'S9' }, fakeDriver(sb.calls), { afterApprove: async () => { sb.calls.push(['after']); return ['stale check ok'] } })
  assert.deepEqual(sb.calls.map(c => c[0]), ['begin', 'plan', 'sdlc', 'after', 'build'])
  assert.deepEqual(r.notes, ['stale check ok'])
})

test('a live driver leaves session evidence; the run commits it after the build', async () => {
  const sb = fakeSb()
  const driver = { ...fakeDriver(sb.calls), sessions: [] }
  await runChange(sb, { id: 'S9' }, driver)
  assert.deepEqual(sb.calls.at(-1), ['commit', 'chore: session leftovers'])
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/e2e/lib/flow.test.mjs`
Expected: FAIL with "Cannot find module './flow.mjs'".

- [ ] **Step 3: Write `tests/e2e/lib/flow.mjs`**

```js
// One change, start to PR, the way a person drives it (spec 2026-10-16 §8): the model writes intent, spec and plan; the person
// approves; the model builds test-first, verifies and opens the PR. afterApprove lets a phase probe the gate before the build.
export async function runChange(sb, phase, driver, { afterApprove } = {}) {
  const slug = await driver.begin()
  await driver.plan(slug)
  const a = sb.sdlc(['approve', slug], { human: true })
  if (a.status !== 0) throw new Error(`approve refused: ${(a.stderr || a.stdout).trim().split('\n')[0]}`)
  const notes = afterApprove ? await afterApprove(slug) : []
  await driver.build(slug)
  // A live session can end with its last evidence uncommitted; the person commits it.
  if (driver.sessions) sb.commitAll('chore: session leftovers')
  return { slug, notes }
}
```

Run: `node --test tests/e2e/lib/flow.test.mjs`. Expected: PASS.

- [ ] **Step 4: Rewrite `tests/e2e/driver/scripted.mjs`**

```js
// The fake model: plays start, plan and build the way the skills do, from the phase's text and fixture files.
import fs from 'node:fs'
import path from 'node:path'

const must = (r, what) => {
  if (r.status !== 0) throw new Error(`${what} failed (exit ${r.status}): ${(r.stderr || r.stdout).trim().split('\n').slice(0, 3).join(' | ')}`)
  return r.stdout
}
const copy = (sb, files) => files.forEach(f => { fs.mkdirSync(path.dirname(sb.file(f.dest)), { recursive: true }); fs.copyFileSync(f.src, sb.file(f.dest)) })

export function scriptedDriver(sb, phase) {
  const dir = `.rig/changes/${phase.slug}`
  return {
    // /rig:start: a branch, the change folder and its intent.
    async begin() {
      sb.git('checkout', '-q', '-b', `sdlc/${phase.slug}`)
      must(sb.sdlc(['new', phase.slug, '--type', phase.type, '--title', phase.title]), 'new')
      const head = /^---\n[\s\S]*?\n---\n/.exec(sb.read(`${dir}/intent.md`))[0]
      sb.write(`${dir}/intent.md`, `${head}# ${phase.title}\n\n## Intent\n${phase.intent.problem}\n\nDone when: ${phase.intent.outcome}\n\nNot in scope: ${phase.intent.nonGoals}\n\n## Open questions\nnone\n`)
      return phase.slug
    },
    // /rig:start (spec) and /rig:plan.
    async plan() {
      sb.write(`${dir}/spec.md`, phase.spec)
      sb.write(`${dir}/plan.md`, phase.plan)
    },
    // /rig:build, /rig:test and /rig:pr: red, green, verify, PR.
    async build() {
      copy(sb, phase.tests)
      must(sb.sdlc(['run', '--slug', phase.slug, '--expect-fail', '--', 'npm test']), 'red run')
      copy(sb, phase.impl)
      must(sb.sdlc(['run', '--slug', phase.slug, '--', 'npm test']), 'green run')
      must(sb.sdlc(['verify', phase.slug]), 'verify')
      must(sb.sdlc(['pr', phase.slug, '--message', phase.commit]), 'pr')
    },
  }
}
```

- [ ] **Step 5: The live driver's methods** (`tests/e2e/driver/live.mjs`)

Replace the driver object `liveDriver` returns with:
```js
  return {
    sessions: sessions.sessions,
    async begin() { /* unchanged: phase.prompt (/rig-start ...), up to 2 --continue retries until status --json .active is set; returns the slug */ },
    async plan(slug) { sessions.run(`${phase.id}-plan`, `/rig-plan ${slug}. Write plan.md, then stop for the person's approval.`, { continue: true }) },
    async build(slug) {
      sessions.run(`${phase.id}-build`, `/rig-build ${slug}. The person approved the plan: build test-first, then /rig-test and /rig-pr in this turn.`, { continue: true })
      const st = () => (JSON.parse(sb.sdlc(['status', '--json']).stdout || '{}').changes ?? []).find(c => c.slug === slug)?.status
      if (st() !== 'review') sessions.run(`${phase.id}-build-2`, `/rig-start ${slug}. Continue from where it stopped until the PR is open.`, { continue: true })
    },
  }
```
Keep `begin`'s existing body. Delete the old `step(node)` method and its `/rig-next` and `sdlc.ts skill` prompt. Use whatever option name `sessions.run` already uses for `--continue` in `begin`. `driver/live.test.mjs` must still pass unchanged, since it tests `createSessions` and `begin`.

- [ ] **Step 6: Delete the old runner and oracle**

```bash
git rm -q tests/e2e/lib/operator.mjs tests/e2e/lib/operator.test.mjs tests/e2e/lib/oracle.mjs
```

- [ ] **Step 7: Run the e2e unit tests and commit**

Run: `npm run test:e2e:unit`
Expected: PASS: `flow.test.mjs` (4) and `live.test.mjs` (5).
```bash
git add -A tests/e2e/lib tests/e2e/driver
git commit -m "test(e2e): a linear route runner (plan, person approves, build) replaces the next --json loop; scripted and live drivers on the slim lifecycle"
```
(`run.mjs` still imports deleted phases until Task 3, and `test:e2e:fast` is outside `npm test`, so `npm test` stays green.)

---

### Task 3: Phases, assertions and the runner on the slim lifecycle

**Files:**
- Rewrite: `tests/e2e/assert/change.mjs`, `tests/e2e/phases/s0-install.mjs`, `tests/e2e/phases/s2-greenfield.mjs`, `tests/e2e/phases/s3-delete.mjs`, `tests/e2e/phases/s4-deploy-maintain.mjs` (renamed `s4-deploy.mjs`), `tests/e2e/run.mjs`
- Create: `tests/e2e/phases/s1-brief.mjs`, `tests/e2e/prd/shop-brief.md`
- Modify: `tests/e2e/assert/onboarding.mjs`, the fixture test names in `tests/e2e/fixtures/shop/test/shop.test.js` and `tests/e2e/fixtures/remove/test/remove.test.js`
- Delete: `tests/e2e/phases/s1-chart.mjs`, `tests/e2e/phases/s5-wiki-evals.mjs`, `tests/e2e/assert/maintain.mjs`, `tests/e2e/fixtures/chart/`, `tests/e2e/prd/shop-app-sprint-0.md`, `tests/fixtures/shop-app/` (unused duplicate; first remove its mention from `scripts/sensors.spec.ts` if one exists)

**Interfaces:**
- Consumes: `runChange`, the driver shape and the phase shape from Task 2.
- Produces: `assertChange(c, sb, slug, phase)`, `runBrief(sb)`, `install(sb)`, `runDeploy(sb)`.

- [ ] **Step 1: The failing run**

Run: `npm run test:e2e:fast`
Expected: FAIL. `run.mjs` imports `s1-chart.mjs` and the old runner, which are deleted or stale. This is the RED for this task. The steps below build the suite until this command passes.

- [ ] **Step 2: Fixture test names carry the B-numbers** (Decision 2)

In `fixtures/shop/test/shop.test.js`, prefix the four test names: `'B1 catalog rejects bad SKUs and prices'`, `'B2 cart sums quantities and prices'`, `'B3 checkout applies a known discount and rejects unknown codes'`, `'B4 http handler wires catalog, cart and checkout'`. In `fixtures/remove/test/remove.test.js`: `'B5 remove deletes the whole line and throws for an absent SKU'`, `'B6 DELETE /cart/<sku> removes the line through the handler'`.

- [ ] **Step 3: `prd/shop-brief.md`** (the template's headings; replaces the sprint-0 PRD)

```markdown
# Product brief: shop-app

## Context and intent

A small shop library: a catalog of products, a cart priced from it, a checkout with discount codes, and a transport-agnostic request handler. Prices are integer cents. No runtime dependencies.

## Non-goals

- Do not add payment, persistence or a real HTTP server.
- Do not add operations not listed under Interfaces.

## Architecture

`src/catalog`, `src/cart`, `src/orders` and `src/http`, each a plain ES module; `http` depends on the other three, nothing depends on `http`.

## Constraints

Node 22 ESM, `node --test`, no dependencies, integer cents throughout.

## Interfaces

- `Catalog` (`add`, `get`, `list`), `Cart` (`add`, `remove`, `lines`, `subtotalCents`), `checkout(cart, { code })`, `createHandler(catalog)`.

## Behaviours

- B1: the catalog rejects an invalid SKU and a non-positive price.
- B2: the cart sums quantities and prices from the catalog.
- B3: checkout applies SAVE10 and SAVE20 and rejects an unknown code or an empty cart.
- B4: the handler serves GET /products, POST /cart and POST /checkout; 400 on error, 404 on an unknown path.
- B5: the cart removes a whole line and throws for an absent SKU.
- B6: DELETE /cart/<sku> removes the line; 400 when the SKU is not in the cart.

## Tests required

- B1–B4: unit tests in test/shop.test.js. B5–B6: unit tests in test/remove.test.js.
```

- [ ] **Step 4: S0 install and the onboarding assertions**

Replace the body of `install(sb)` in `phases/s0-install.mjs` (keep `ROUTING`, `SCAFFOLD_PROMPT` and `must`):
```js
// The registry S0 declares: the unit suite, plus the built-ins every registry gets (spec §3).
export const REGISTRY = { sensors: [{ id: 'unit', cmd: 'npm test', cadence: 'turn', blocks: true, count: 'exit', guide: 'Run the unit suite before claiming done; fix the code, never the tests.' }] }

export async function install(sb) {
  sb.isolate([])
  const scripts = { test: 'node --test', 'test-fast': 'node --test', lint: 'node --check src/index.js' }
  sb.write('package.json', JSON.stringify({ name: 'shop-app', version: '0.1.0', type: 'module', scripts }, null, 2) + '\n')
  sb.write('src/index.js', 'export {}\n')
  sb.write('test/smoke.test.js', "import { test } from 'node:test'\nimport '../src/index.js'\ntest('loads', () => {})\n")
  sb.commitAll('chore: scaffold')
  must(sb.sdlc(['init']), 'init')
  sb.write('.rig/sensors.json', JSON.stringify(REGISTRY, null, 2) + '\n')
  must(sb.sdlc(['init', '--full']), 'init --full')
  sb.write('CLAUDE.md', `# shop-app\n\n${ROUTING}\n\n## Map\n- src/\n`)
  must(sb.sdlc(['sync']), 'sync')
  sb.commitAll('chore: onboard rig')
  const c = new Checks('S0 install')
  await assertOnboarding(c, sb, { lane: 'greenfield' })
  return c
}
```

In `assert/onboarding.mjs`:
- Delete the `configOf` import and the four checks that read `cfg` (fast/full, gates, levels, and "sensors.json parses").
- Add in their place:
```js
  const reg = (() => { try { return JSON.parse(sb.read('.rig/sensors.json')) } catch { return {} } })()
  await c.check('sensors.json is a registry with a unit sensor', () => (Array.isArray(reg.sensors) && reg.sensors.some(s => s.id === 'unit' && /test/.test(s.cmd ?? ''))) || JSON.stringify(reg))
  await c.check('sync --check is clean: CLAUDE.md carries the guides block', () => { const r = sb.sdlc(['sync', '--check']); return r.status === 0 || r.stdout.trim().split('\n').slice(0, 3).join(' | ') })
  await c.check('status reads the registry with no config error', () => { const r = sb.sdlc(['status', '--json']); return (r.status === 0 && !/config/.test(r.stderr)) || r.stderr.trim() })
```
- The standalone-skills check becomes `const want = names('skills').map(n => \`rig-${n}\`)`, with no hard-coded extras; approve and waive are plugin skills now.
- Delete the `preflight report written` check.

- [ ] **Step 5: S1, the brief stage** (`phases/s1-brief.mjs`)

```js
// S1: the product brief (spec §6) replaces the chart. Its behaviours are B-numbered; until tests name them, sync warns.
import fs from 'node:fs'
import path from 'node:path'
import { Checks } from '../lib/checks.mjs'
import { PLUGIN } from '../lib/sandbox.mjs'

export async function runBrief(sb) {
  const c = new Checks('S1 brief')
  const tpl = fs.readFileSync(path.join(PLUGIN, 'templates/brief.md'), 'utf8')
  const brief = fs.readFileSync(path.join(import.meta.dirname, '../prd/shop-brief.md'), 'utf8')
  const heads = t => [...t.matchAll(/^## (.+)$/gm)].map(m => m[1])
  await c.check('the brief has the template headings, in order', () => JSON.stringify(heads(brief)) === JSON.stringify(heads(tpl)) || heads(brief).join(', '))
  sb.write('.rig/product/brief.md', brief)
  sb.commitAll('docs: product brief')
  const r = sb.sdlc(['sync', '--check'])
  await c.check('sync --check warns about the untested brief behaviours and does not fail', () => (r.status === 0 && /B1 has no test/.test(r.stdout) && /B6 has no test/.test(r.stdout)) || `exit ${r.status}: ${r.stdout.trim().split('\n')[0]}`)
  const refused = sb.sdlc(['approve', 'nothing-yet'])
  await c.check('approve is human-only: without SDLC_HUMAN it exits 3', () => refused.status === 3 || `exit ${refused.status}`)
  return c
}
```

- [ ] **Step 6: S2 and S3 phases**

In `phases/s2-greenfield.mjs`, replace `PHASE` (keep `fx`, `tests`, `impl`, `commit`, `acceptance`) with these fields:
```js
  id: 'S2', slug: 'walking-skeleton', type: 'feature', title: 'Walking skeleton: the whole shop',
  prompt: '/rig-start A feature: build the shop described in .rig/product/brief.md (behaviours B1–B4): a Catalog, a Cart, a checkout with SAVE10/SAVE20 and a request handler, in src/catalog, src/cart, src/orders and src/http, tested in test/shop.test.js with test names that start with their B-number.',
  intent: { problem: 'There is no shop code at all.', outcome: 'B1–B4 of the brief hold and node --test passes.', nonGoals: 'Deleting cart lines, payment, persistence, a real HTTP server.' },
  spec: '# Spec: walking skeleton\n\n## Behaviours\n- B1: the catalog rejects an invalid SKU and a non-positive price.\n- B2: the cart sums quantities and prices from the catalog.\n- B3: checkout applies SAVE10 and SAVE20 and rejects an unknown code or an empty cart.\n- B4: the handler serves GET /products, POST /cart and POST /checkout; 400 on error, 404 on an unknown path.\n\n## Out of scope\n- Deleting cart lines.\n\n## Open questions\nnone\n',
  plan: '# Plan: walking skeleton\n\n## Files\n- src/catalog/products.js\n- src/cart/cart.js\n- src/orders/orders.js\n- src/http/handler.js\n- test/shop.test.js\n\n## Tests\n- B1–B4: test/shop.test.js (unit)\n\n## Contracts\nnone\n\n## Verification\n- npm test\n\n## Open questions\nnone\n',
```
Replace `runChange` in that file with a thin wrapper:
```js
export async function runShopChange(sb, phase, driver, { first = false, afterApprove } = {}) {
  const { slug, notes } = await runChange(sb, phase, driver, { afterApprove })
  const c = new Checks(`${phase.id} ${phase.title}`)
  for (const n of notes) await c.check(n.title, () => n.ok || n.why)
  await assertChange(c, sb, slug, phase)
  if (first) {
    await assertPrePushPasses(c, sb, slug)
    await assertPreCommitRefusesSecret(c, sb)
  }
  await assertShop(c, sb.dir, phase.acceptance)
  return { slug, checks: c }
}
```
The imports are `runChange` from `../lib/flow.mjs`, not `runRoute`.

In `phases/s3-delete.mjs`:
- `PHASE` gets the same shape: slug `cart-remove`, type `feature`.
- `spec`: Behaviours B5 and B6 (copied from the brief), `## Out of scope` (removing part of a quantity), `## Open questions` none.
- `plan`: Files `src/cart/cart.js`, `src/http/handler.js`, `test/remove.test.js`; Tests B5–B6; Contracts none; Verification `npm test`; Open questions none.
- `prompt`: `/rig-start A feature: let a shopper delete a whole line from the cart (brief behaviours B5–B6), as Cart.remove and DELETE /cart/<sku>; edit the existing files, do not rewrite them.`
- Delete `archUpdate`, `tier`, `design`.
- `assertDelete` keeps its "edited, not rewritten" numstat check and `assertShop('remove')`, and drops the architecture.md check.
- Replace `staleTwin` with:
```js
// Decision 5: a spec edited after the person approved it reopens the gate; restoring it closes the gate again.
export async function staleCheck(sb, slug) {
  const file = `.rig/changes/${slug}/spec.md`
  const statusOf = () => (JSON.parse(sb.sdlc(['status', '--json']).stdout || '{}').changes ?? []).find(c => c.slug === slug)?.status
  const original = sb.read(file)
  sb.write(file, original + '\n- B7: an unapproved extra behaviour\n')
  const stale = statusOf()
  sb.write(file, original)
  const back = statusOf()
  return [
    { title: 'S3: editing spec.md after approval makes the approval stale (status approve)', ok: stale === 'approve', why: `status ${stale}` },
    { title: 'S3: restoring spec.md makes the approval current again (status build)', ok: back === 'build', why: `status ${back}` },
  ]
}
```

- [ ] **Step 7: `assert/change.mjs`** (rewrite)

```js
// Per-change evidence on the slim lifecycle (spec §8): intent, spec with B-numbers, a person's approval that still matches,
// red before green, a passing verify on the PR tree, the PR, and what CI will see.
import { createHash } from 'node:crypto'

const json = t => { try { return JSON.parse(t) } catch { return null } }
const digest = t => createHash('sha256').update(t.replace(/\s+$/, '')).digest('hex').slice(0, 16)

export async function assertChange(c, sb, slug, phase) {
  const dir = `.rig/changes/${slug}`
  const id = phase.id
  await c.check(`${id}: intent.md records the type ${phase.type}`, () => new RegExp(`^type: ${phase.type}$`, 'm').test(sb.read(`${dir}/intent.md`)) || 'type missing')
  await c.check(`${id}: spec.md numbers its behaviours`, () => /## Behaviours[\s\S]*\bB\d+\b/.test(sb.read(`${dir}/spec.md`)) || 'no B-numbers')
  const a = json(sb.read(`${dir}/approval.json`))
  await c.check(`${id}: approval.json is the person's (by the operator)`, () => a?.by === 'rig operator' || `by ${a?.by}`)
  await c.check(`${id}: the approval hashes the spec.md and plan.md that shipped`, () =>
    (a?.hashes?.['spec.md'] === digest(sb.read(`${dir}/spec.md`)) && a?.hashes?.['plan.md'] === digest(sb.read(`${dir}/plan.md`))) || JSON.stringify(a?.hashes))
  const runs = sb.read(`${dir}/evidence/runs.jsonl`).trim().split('\n').filter(Boolean).map(json)
  const red = runs.findIndex(r => r?.expectFail && r.exit !== 0)
  const green = runs.findIndex((r, i) => i > red && !r?.expectFail && r?.exit === 0)
  await c.check(`${id}: a failing test run is recorded before a passing one`, () => (red >= 0 && green > red) || `${runs.length} run(s), red at ${red}, green at ${green}`)
  const v = json(sb.read(`${dir}/verify.json`))
  await c.check(`${id}: verify.json passed`, () => v?.pass === true || (v?.blocks ?? ['no verify.json']).join('; '))
  const pr = sb.read(`${dir}/pr.md`)
  await c.check(`${id}: pr.md records an open PR on sdlc/${slug}`, () => (/state: open/.test(pr) && new RegExp(`branch: sdlc/${slug}`).test(pr)) || pr.split('\n').slice(0, 3).join(' | '))
  await c.check(`${id}: gh pr create ran once`, () => (sb.read('.gh.log').match(/pr create/g) ?? []).length >= 1 || 'no gh pr create')
  const st = json(sb.sdlc(['status', '--json']).stdout) ?? {}
  await c.check(`${id}: status reads review and no change is active`, () => (st.changes?.find(x => x.slug === slug)?.status === 'review' && !st.active) || JSON.stringify(st.changes?.find(x => x.slug === slug)))
  await c.check(`${id}: the tree is clean after pr`, () => sb.git('status', '--porcelain') === '' || sb.git('status', '--porcelain').split('\n').join('; '))
  await c.check(`${id}: .rig/state is never committed`, () => !sb.git('ls-files').split('\n').some(f => f.startsWith('.rig/state/')) || 'committed')
  await c.check(`${id}: sync --check has no blocks`, () => { const r = sb.sdlc(['sync', '--check']); return r.status === 0 || r.stdout.trim().split('\n')[0] })
  await sb.inWorktree(async ({ sdlc }) => {
    const ci = json(sdlc(['check', '--at', 'ci', '--base', 'main', '--json']).stdout) ?? {}
    await c.check(`${id}: CI lists the approval as a human row`, () => (ci.humanRows ?? []).some(r => r.startsWith(`approval ${slug}`)) || JSON.stringify(ci.humanRows))
  })
  await c.check(`${id}: npm test passes on the PR commit`, () => { const r = sb.run('npm', ['test', '--silent']); return r.status === 0 || (r.stdout + r.stderr).trim().split('\n').slice(-3).join(' ') })
}
```
Check how `sb` exposes the gh stub log path (`lib/sandbox.mjs`; the old `assert/change.mjs` read it) and use that path in place of `.gh.log`. If `check --at ci --json` names the field other than `humanRows`, use its real name. Read the field list in `check.ts` `report()`.

- [ ] **Step 8: S4 trimmed, the runner rewired**

- `phases/s4-deploy-maintain.mjs` → `phases/s4-deploy.mjs`:
```js
import { Checks } from '../lib/checks.mjs'
import { assertProductionGate, assertRollbackRehearsal, assertWorkflows } from '../assert/deploy.mjs'

// Local-only deploy: the production gate, a rollback rehearsal and the shipped CI workflow. No environment is provisioned.
export async function runDeploy(sb) {
  const d = new Checks('S4 deploy (local)')
  await assertProductionGate(d, sb)
  await assertRollbackRehearsal(d, sb)
  await assertWorkflows(d)
  return [d]
}
```
- `run.mjs`:
  - Imports: `runBrief` from `./phases/s1-brief.mjs`; `PHASE as S2, runShopChange` from s2; `PHASE as S3, assertDelete, staleCheck` from s3; `runDeploy` from `./phases/s4-deploy.mjs`. Drop `runChart`, `runWikiEvals`, `runChange`.
  - Phases: S1 runs `runBrief`. S2 runs `runShopChange(sb, S2, driverFor(S2), { first: true })`. S3 runs `ensureMain`, then `runShopChange(sb, S3, driverFor(S3), { afterApprove: live ? undefined : slug => staleCheck(sb, slug) })`, then `assertDelete`. S4 runs `runDeploy`. Delete the S5 block, `--live-evals` and the `staleTwin` block.
  - `NEEDS = { S2: ['S1'], S3: ['S1', 'S2'], S4: ['S1', 'S2', 'S3'] }`.
  - `FLOOR`: set it in Task 4 from a measured run. For now use `{ 'S0 install': 1, 'S1 brief': 1, 'S2 ': 1, 'S3 ': 1, 'S4 deploy': 1 }`.
  - Update the header comment (S0–S4, no chart or wiki).
- Delete: `git rm -rq tests/e2e/phases/s1-chart.mjs tests/e2e/phases/s5-wiki-evals.mjs tests/e2e/phases/s4-deploy-maintain.mjs tests/e2e/assert/maintain.mjs tests/e2e/fixtures/chart tests/e2e/prd/shop-app-sprint-0.md tests/fixtures/shop-app`. If `scripts/sensors.spec.ts` mentions `tests/fixtures/shop-app`, change that mention first.

- [ ] **Step 9: Run until green**

Run: `npm run test:e2e:fast`
Expected: PASS: every group passes and the coverage floors (1) hold.

When a check fails, decide which side is wrong:
- If the harness is wrong (a real bug the suite found), fix it in `scripts/` with a spec that fails first, as in Task 1, and add a ledger ruling.
- If the e2e expectation is wrong (a message, a path, a field name), fix the e2e and ledger it.

Never weaken an assertion to pass.

- [ ] **Step 10: Commit**

```bash
git add -A tests scripts
git commit -m "test(e2e): S0 install on the registry, S1 product brief, S2/S3 through approval, verify and PR, S4 deploy gate; chart, wiki, watch and tier phases removed"
```

---

### Task 4: Floors, `npm test`, CI, docs, memory

**Files:**
- Modify: `tests/e2e/run.mjs` (`FLOOR` from the measured run), `package.json` (`test` adds `&& npm run test:e2e:fast`), `.github/workflows/ci.yml` (the e2e job runs `test:e2e:fast`; fix its stale comment), `scripts/removed.spec.ts` (drop the 4a assertion that `test:e2e:fast` is outside `npm test`), `README.md` (the e2e section), the memory files.

- [ ] **Step 1: Write the failing test** (`scripts/removed.spec.ts`)

Replace the 4a test "the scripted e2e suite is out of npm test until step 5 rewrites it; the e2e unit tests stay" with:
```ts
test('5a: the scripted e2e suite runs in npm test and in CI again', () => {
  const t = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts.test ?? ''
  assert.match(t, /test:e2e:unit/)
  assert.match(t, /test:e2e:fast/)
  assert.match(read('.github/workflows/ci.yml'), /npm run test:e2e:fast/)
})
```
Run: `node --test scripts/removed.spec.ts`. Expected: FAIL on `test:e2e:fast`.

- [ ] **Step 2: Put it back**

- `package.json` `test`: `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts && npm run test:e2e:unit && npm run test:e2e:fast`.
- `.github/workflows/ci.yml`: in the e2e job, after `npm run test:e2e:unit`, add `- run: npm run test:e2e:fast`. Its comment becomes "the e2e unit tests and the scripted acceptance flow (a fake model, $0)".

Run: `node --test scripts/removed.spec.ts`. Expected: PASS.

- [ ] **Step 3: Measure and set the floors**

Run `npm run test:e2e:fast` and read each group's check count from its printed report (or the `report.json` in the printed output directory). Set `FLOOR` in `run.mjs` to exactly those counts (for example `{ 'S0 install': 13, 'S1 brief': 3, 'S2 ': 18, 'S3 ': 17, 'S4 deploy': 19 }`, but use the real numbers). Run again. Expected: PASS.

Then prove the floor bites: temporarily delete one `await c.check(...)` line from `assert/change.mjs` and run `npm run test:e2e:fast`. Expected: it fails with `coverage floor:`. Restore the line.

- [ ] **Step 4: Docs and memory**

- `README.md`, where it describes the e2e phases: replace the list with "S0 install (registry, vendored harness, git hooks, guides block), S1 product brief, S2 greenfield change, S3 follow-on change (with a stale-approval check), S4 local deploy gate". Add: "`npm run test:e2e:fast` runs in `npm test` and CI; the live run (`npm run test:e2e`) stays under 20 minutes and $6."
- Memory `behavioural-harness-rebuild.md`:
  - 5a done (commit, this plan's path) and the brief-traceability decision.
  - 5b next: the contract stage, the policy stage, the HTTP acceptance variant, and stack fixtures (node, go, java-maven, dotnet, rust).
  - The live e2e has not been run since the rebuild.

- [ ] **Step 5: Run everything and commit**

Run: `npm test > /tmp/5a-full.txt 2>&1; echo exit $?; grep -E "^ℹ (tests|pass|fail)" /tmp/5a-full.txt; tail -5 /tmp/5a-full.txt; npm run typecheck`
Expected: exit 0. The spec files and e2e unit tests pass, and the scripted run's report has no failed check.
```bash
git add tests/e2e/run.mjs package.json .github/workflows/ci.yml scripts/removed.spec.ts README.md
git commit -m "test(e2e): the scripted suite back in npm test and CI, with floors from a measured run"
```

---

### Task 5: Verify, review once

- [ ] **Step 1:** Run `npm test` and `npm run typecheck`, and quote the summary lines and the scripted report's group totals.
- [ ] **Step 2:** One reviewer agent on `git diff main...HEAD`, model `opus`, with a brief of at most 60 lines: spec §10.2 and §5, this plan's Decisions and Review Focus, and the ledger rulings. Ask it to check especially:
  - that the e2e assertions are not weaker than the harness's real guarantees;
  - that the brief-traceability change is the right reading of spec §5;
  - that the live driver's prompts name real skills;
  - that the floors are the measured counts.
- [ ] **Step 3:** Fix Critical and Important findings in one pass, each with a test that fails first, then rerun `npm test`. Merge only when the person asks. After the merge, write the 5b plan.
