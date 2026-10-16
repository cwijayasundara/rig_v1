# Behavioural harness step 5b: contract, policy, HTTP and stack stages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The e2e suite covers the four stages spec §10.2 still lacks: an HTTP acceptance variant that imports no source, a contract stage (validate before run, a weakened frozen example blocked), a policy stage (the same change under `continuous` and `final`), and stack fixtures for node, go, java-maven, dotnet and rust.

**Architecture:** The shop grows a real HTTP entry point (`npm start`) and an HTTP contract (`api/openapi.yaml` plus `contracts/examples/`). A zero-dependency contract tool, copied into the sandbox at S0 as the shop's own tooling, validates examples against the spec and replays them against `npm start`. S2 and S3 write contract files at plan time, so approval freezes them. A new S5 phase drives the hooks directly with two recorded models. Stack fixtures run from their own runner (`npm run test:e2e:stacks`) and their own CI job, because they need toolchains and network downloads that `npm test` must not depend on.

**Tech Stack:** Node 22 ESM, `node:test`, `node:http`, `fetch`, git; go, cargo, mvn, dotnet only for the stack runner.

**Spec:** `docs/superpowers/specs/2026-10-16-behavioural-harness-design.md` (§10.2 E2e, §6 Contracts, §3.3 Policy, §4 Stack packs, §7 hooks).

## Global Constraints

- rig is not enabled on this repo: never run `sdlc.ts check` or change records against this tree (CLAUDE.md).
- Fix the harness, not its output: a wrong result in the sandbox is fixed in `scripts/`, `skills/` or `templates/` with a spec that fails first, never by hand-editing generated files.
- Never pass `--no-verify` to get past a rig hook. The existing `sb.commitAll` setup commits are the only exception, and they predate this step.
- The shop has no runtime dependencies (brief constraint); the contract tool and the server use only Node built-ins.
- Budgets (spec §10.2): scripted e2e free and part of `npm test`; live e2e under 20 minutes and $6.
- `tests/` is excluded from the size caps (`scripts/size.spec.ts`, `scripts/neutrality.spec.ts`); `scripts/` stays at or under `SCRIPTS_CAP` 3 050.
- Never register the plugin at user scope.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisions

1. **The contract tool is the shop's own script, not Specmatic.** Specmatic needs Java and its jar licence is unconfirmed (spec §14). Spec §6 lets a project declare its own `validate` and `run`. `api/openapi.yaml` is written in JSON syntax, which is valid YAML, so no parser is needed.
2. **The brief gains a real HTTP server.** The non-goal "Do not add … a real HTTP server" goes, and B4 now says the handler is served over HTTP by `npm start`. The HTTP acceptance and the contract run both need it. B-numbers stay B1–B6.
3. **Stack fixtures live outside `npm test`.** They run as `npm run test:e2e:stacks` and as an `e2e-stacks` CI job on `ubuntu-latest`, which has go, java with mvn, dotnet and cargo. A stack whose toolchain is missing or unusable is skipped and says so. Each pack's non-core tools (golangci-lint, clippy, checkstyle and so on) are expected to be missing. `baseline` puts them in `knownRed`, which is exactly what a team meets at onboarding.
4. **The policy stage drives the hooks directly** (`sdlc hook session-start|prompt-submit|stop`), with the model recorded by `session-start`. It runs in the scripted lane only; the live lane has no way to pin two models in one run.
5. **The contract checks ride S3's `afterApprove`**, beside `staleCheck`, scripted only. S3 is the change that edits a contract already frozen once.
6. **Live lane gap, accepted for 5b:** live S0 runs `/rig:init`, whose registry declares no contracts (the repo has none yet), so the contract checks in `assertChange` run only when `.rig/sensors.json` declares `contracts.files`. Declaring contracts after onboarding is a reviewed harness edit; making the live lane do it is left to the first live run.

## Review Focus

1. **A server child left running after a failed check** (a port held, the run hanging at exit). Expect `stop` to kill the whole process group in a `finally`. Pinned in Task 1: "run() stops the server even when an example fails".
2. **`npm start` never prints its port** (a crash, a wrong log line). Expect `run` and the HTTP acceptance to fail within the timeout with a message saying why, not hang. Pinned in Task 1: "start() gives up after its timeout with a reason".
3. **A toolchain binary that exists but cannot run** (macOS `/usr/bin/java` without a JDK, a broken dotnet). Expect a skip, not a failure. Pinned in Task 5: "probe() skips a stack whose version command exits non-zero".
4. **The policy stage leaving state behind** (`.rig/unresolved.json`, the gate's block counter, a dirty tree) that later checks or phases trip over. Expect the tree clean and HEAD unchanged after S5. Pinned in Task 4: "S5: the tree is clean and main is where it was".
5. **Examples whose outcome depends on server state** (the DELETE examples need a line added first). Expect `run` to replay in file-name order against one fresh server per run. Pinned in Task 1: "run() replays examples in file-name order against one server".

---

### Task 1: The contract tool

**Files:**
- Create: `tests/e2e/fixtures/tooling/scripts/contract.mjs`
- Create: `tests/e2e/lib/contract-tool.test.mjs`
- Modify: `package.json` (the `test:e2e:unit` glob gains `tests/e2e/lib/*.test.mjs`, which it already matches; no change if so)

**Interfaces:**
- Produces:
  - `load(root): { spec, examples: {name, request, response}[] } | null`
  - `validate(spec, examples): string[]` (a list of problems)
  - `subset(expected, actual): boolean`
  - `start(root, timeoutMs = 10_000): Promise<{ child, port }>`
  - `stop(child): void`
  - `run(root, examples, timeoutMs = 10_000): Promise<string[]>` (a list of failures)
  - CLI: `node scripts/contract.mjs validate|run`. It exits 0 when clean or when `api/openapi.yaml` is absent, and 1 with problems on stderr. When `CONTRACT_LOG` is set, it appends the mode to that file before doing anything else.

- [ ] **Step 1: Write the failing tests** in `tests/e2e/lib/contract-tool.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { validate, subset, start, stop, run } from '../fixtures/tooling/scripts/contract.mjs'

const SPEC = { paths: { '/cart': { post: { responses: { 201: {}, 400: {} } } }, '/cart/{sku}': { delete: { responses: { 200: {} } } } } }
const ex = (name, method, p, status, body) => ({ name, request: { method, path: p }, response: { status, ...(body === undefined ? {} : { body }) } })

test('validate() accepts a templated path and refuses an undeclared route or status', () => {
  assert.deepEqual(validate(SPEC, [ex('a', 'DELETE', '/cart/TEA-001', 200), ex('b', 'POST', '/cart', 201)]), [])
  assert.match(validate(SPEC, [ex('c', 'PUT', '/cart', 200)])[0], /c: PUT \/cart is not in api\/openapi\.yaml/)
  assert.match(validate(SPEC, [ex('d', 'DELETE', '/cart/X', 404)])[0], /d: DELETE \/cart\/X does not declare status 404/)
})

test('subset() matches named keys and array elements, and nothing more', () => {
  assert.equal(subset([{ sku: 'A' }], [{ sku: 'B', qty: 1 }, { sku: 'A', qty: 2 }]), true)
  assert.equal(subset({ totalCents: 810 }, { totalCents: 810, lines: [] }), true)
  assert.equal(subset({ totalCents: 810 }, { totalCents: 900 }), false)
  assert.equal(subset([{ sku: 'C' }], [{ sku: 'A' }]), false)
})

// A tiny repo whose `npm start` is a counting server: GET /n returns how many requests it has served.
const repo = server => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-contract-'))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module', scripts: { start: 'node server.js' } }))
  fs.writeFileSync(path.join(dir, 'server.js'), server)
  return dir
}
const COUNTER = "import http from 'node:http'\nlet n = 0\nconst s = http.createServer((q, r) => { n++; r.writeHead(q.url === '/n' ? 200 : 404, { 'content-type': 'application/json' }); r.end(JSON.stringify({ n })) })\ns.listen(Number(process.env.PORT), () => console.log(`listening on ${s.address().port}`))\n"

test('run() replays examples in file-name order against one server', async () => {
  const dir = repo(COUNTER)
  assert.deepEqual(await run(dir, [ex('01', 'GET', '/n', 200, { n: 1 }), ex('02', 'GET', '/n', 200, { n: 2 })]), [])
})

test('run() stops the server even when an example fails', async () => {
  const dir = repo(COUNTER)
  const fails = await run(dir, [ex('01', 'GET', '/n', 200, { n: 99 })])
  assert.match(fails[0], /01: GET \/n body \{"n":1\} does not contain \{"n":99\}/)
  const { child, port } = await start(dir)
  stop(child)
  await new Promise(r => child.once('exit', r))
  await assert.rejects(fetch(`http://127.0.0.1:${port}/n`))
})

test('start() gives up after its timeout with a reason', async () => {
  const dir = repo("setInterval(() => {}, 1000)\n")
  await assert.rejects(start(dir, 500), /no "listening on <port>" within 500 ms/)
})

test('the CLI logs its mode first, and passes when there is no api/openapi.yaml yet', () => {
  const dir = repo(COUNTER)
  const log = path.join(dir, 'log')
  const tool = path.resolve(import.meta.dirname, '../fixtures/tooling/scripts/contract.mjs')
  const r = process.getBuiltinModule('node:child_process').spawnSync('node', [tool, 'validate'], { cwd: dir, encoding: 'utf8', env: { ...process.env, CONTRACT_LOG: log } })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /no api\/openapi\.yaml yet/)
  assert.equal(fs.readFileSync(log, 'utf8'), 'validate\n')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/e2e/lib/contract-tool.test.mjs`
Expected: FAIL. The import of `../fixtures/tooling/scripts/contract.mjs` cannot be resolved.

- [ ] **Step 3: Write the tool** at `tests/e2e/fixtures/tooling/scripts/contract.mjs`:

```js
// The shop's own contract tool, zero dependencies: `validate` checks every example against api/openapi.yaml, `run` replays
// the examples, in file-name order, against one `npm start` on a free port. CONTRACT_LOG, when set, records each mode first.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const SPEC = 'api/openapi.yaml'
const EXAMPLES = 'contracts/examples'

// api/openapi.yaml is written in JSON syntax, which is valid YAML, so no parser dependency is needed.
export function load(root) {
  const file = path.join(root, SPEC)
  if (!fs.existsSync(file)) return null
  const dir = path.join(root, EXAMPLES)
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort() : []
  return { spec: JSON.parse(fs.readFileSync(file, 'utf8')), examples: names.map(name => ({ name, ...JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) })) }
}

const route = template => new RegExp(`^${template.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`)

export function validate(spec, examples) {
  const problems = []
  for (const ex of examples) {
    const { method = '', path: p = '' } = ex.request ?? {}
    const status = String(ex.response?.status ?? '')
    const op = Object.entries(spec.paths ?? {}).find(([t]) => route(t).test(p))?.[1]?.[method.toLowerCase()]
    if (!op) problems.push(`${ex.name}: ${method} ${p} is not in ${SPEC}`)
    else if (!op.responses?.[status]) problems.push(`${ex.name}: ${method} ${p} does not declare status ${status}`)
  }
  return problems
}

// Every key the example names must be in the actual value; each expected array element must match some actual element.
export function subset(expected, actual) {
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.every(e => actual.some(a => subset(e, a)))
  if (expected && typeof expected === 'object') return !!actual && typeof actual === 'object' && Object.entries(expected).every(([k, v]) => subset(v, actual[k]))
  return expected === actual
}

// Its own process group, so stop() takes npm and the server it started down together.
export function start(root, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['start', '--silent'], { cwd: root, env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    let out = ''
    let settled = false
    const done = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v) } }
    const timer = setTimeout(() => { stop(child); done(reject, new Error(`npm start printed no "listening on <port>" within ${timeoutMs} ms`)) }, timeoutMs)
    child.stdout.on('data', d => { out += d; const m = /listening on (\d+)/.exec(out); if (m) done(resolve, { child, port: Number(m[1]) }) })
    child.on('exit', code => done(reject, new Error(`npm start exited ${code} before listening`)))
  })
}

export const stop = child => { try { process.kill(-child.pid, 'SIGTERM') } catch {} }

export async function run(root, examples, timeoutMs = 10_000) {
  const { child, port } = await start(root, timeoutMs)
  const failures = []
  try {
    for (const ex of examples) {
      const { method, path: p, body } = ex.request
      const init = body === undefined ? { method } : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      const res = await fetch(`http://127.0.0.1:${port}${p}`, init)
      const got = await res.json().catch(() => null)
      if (res.status !== ex.response.status) failures.push(`${ex.name}: ${method} ${p} gave ${res.status}, want ${ex.response.status}`)
      else if (ex.response.body !== undefined && !subset(ex.response.body, got)) failures.push(`${ex.name}: ${method} ${p} body ${JSON.stringify(got)} does not contain ${JSON.stringify(ex.response.body)}`)
    }
  } finally {
    stop(child)
  }
  return failures
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const mode = process.argv[2]
  if (process.env.CONTRACT_LOG) fs.appendFileSync(process.env.CONTRACT_LOG, `${mode}\n`)
  const c = load(process.cwd())
  if (!c) { console.log(`no ${SPEC} yet: nothing to check`); process.exit(0) }
  const problems = mode === 'validate' ? validate(c.spec, c.examples)
    : mode === 'run' ? await run(process.cwd(), c.examples).catch(e => [e.message])
    : ['usage: node scripts/contract.mjs validate|run']
  for (const p of problems) console.error(p)
  process.exit(problems.length ? 1 : 0)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/e2e/lib/contract-tool.test.mjs`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/fixtures/tooling tests/e2e/lib/contract-tool.test.mjs
git commit -m "test(e2e): a zero-dependency contract tool for the shop: validate examples against the spec, replay them against npm start"
```

---

### Task 2: The HTTP acceptance variant

**Files:**
- Create: `tests/e2e/acceptance/shop-http.mjs`
- Create: `tests/e2e/fixtures/shop/src/server.js`
- Modify: `tests/e2e/prd/shop-brief.md` (context, non-goals, architecture, interfaces, B4)
- Modify: `tests/e2e/phases/s0-install.mjs` (the scaffold's `start` script)
- Modify: `tests/e2e/phases/s2-greenfield.mjs` (PHASE intent, spec B4, plan files, `impl` adds the server, assertShopHttp)
- Modify: `tests/e2e/run.mjs` (FLOOR S2 20, S3 22)

**Interfaces:**
- Consumes: `start(root, timeoutMs)` and `stop(child)` from Task 1.
- Produces: `assertShopHttp(c, repo, phase: 'shop' | 'remove'): Promise<void>`, which adds one check named `hidden acceptance over HTTP: <phase>`.

- [ ] **Step 1: Write the failing acceptance** at `tests/e2e/acceptance/shop-http.mjs`:

```js
// Hidden acceptance over HTTP: starts the repo's `npm start` on a free port and checks the brief's promises with requests only,
// so it holds for any language or layout. Nothing under src/ is imported. `remove` re-checks `shop` first, on a fresh server.
import fs from 'node:fs'
import path from 'node:path'
import { start, stop } from '../fixtures/tooling/scripts/contract.mjs'

const call = port => async (method, p, body) => {
  const init = body === undefined ? { method } : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
  const res = await fetch(`http://127.0.0.1:${port}${p}`, init)
  return { status: res.status, body: await res.json().catch(() => null) }
}

const PROMISES = {
  async shop(req, repo) {
    if ((await req('POST', '/checkout', {})).status !== 400) return 'checkout of an empty cart was not 400'
    const products = await req('GET', '/products')
    if (products.status !== 200 || !['TEA-001', 'MUG-002'].every(s => products.body?.some?.(p => p.sku === s))) return `GET /products: ${products.status} ${JSON.stringify(products.body)}`
    if ((await req('POST', '/cart', { sku: 'TEA-001', qty: 2 })).status !== 201) return 'POST /cart TEA-001 x2 not 201'
    if ((await req('POST', '/cart', { sku: 'MUG-002', qty: 1 })).status !== 201) return 'POST /cart MUG-002 not 201'
    if ((await req('POST', '/cart', { sku: 'NOPE-999' })).status !== 400) return 'unknown SKU not 400'
    if ((await req('POST', '/checkout', { code: 'FREE' })).status !== 400) return 'unknown discount code not 400'
    const paid = await req('POST', '/checkout', { code: 'SAVE10' })
    if (paid.status !== 201 || paid.body?.totalCents !== 1890) return `SAVE10 on 2100: ${paid.status} ${JSON.stringify(paid.body)}, want total 1890`
    if ((await req('GET', '/nope')).status !== 404) return 'unknown path not 404'
    const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'))
    return !Object.keys(pkg.dependencies ?? {}).length || 'runtime dependencies declared'
  },
  async remove(req) {
    await req('POST', '/cart', { sku: 'TEA-001', qty: 2 })
    await req('POST', '/cart', { sku: 'MUG-002', qty: 1 })
    const del = await req('DELETE', '/cart/TEA-001')
    if (del.status !== 200 || del.body?.length !== 1) return `DELETE /cart/TEA-001: ${del.status} ${JSON.stringify(del.body)}`
    if ((await req('DELETE', '/cart/TEA-001')).status !== 400) return 'DELETE of an absent SKU not 400'
    const paid = await req('POST', '/checkout', {})
    return paid.body?.totalCents === 1200 || `checkout after delete: ${JSON.stringify(paid.body)}, want total 1200`
  },
}

export async function assertShopHttp(c, repo, phase) {
  if (!PROMISES[phase]) throw new Error(`unknown shop phase: ${phase}`)
  await c.check(`hidden acceptance over HTTP: ${phase}`, async () => {
    for (const p of phase === 'remove' ? ['shop', 'remove'] : ['shop']) {
      const { child, port } = await start(repo)
      try {
        const r = await PROMISES[p](call(port), repo)
        if (r !== true) return `${p}: ${r}`
      } finally {
        stop(child)
      }
    }
    return true
  })
}
```

In `s2-greenfield.mjs`, import it and call it straight after `assertShop`:

```js
import { assertShopHttp } from '../acceptance/shop-http.mjs'
// in runShopChange, after `await assertShop(c, sb.dir, phase.acceptance)`:
  await assertShopHttp(c, sb.dir, phase.acceptance)
```

Raise FLOOR in `run.mjs` to `'S2 ': 20, 'S3 ': 22`.

- [ ] **Step 2: Run the suite to verify it fails**

Run: `node tests/e2e/run.mjs`
Expected: exit 1. S2 reports `FAIL  hidden acceptance over HTTP: shop  (npm start exited … before listening)`, because there is neither a `start` script nor a server. S3 fails the same way.

- [ ] **Step 3: Add the server, the `start` script and the brief wording**

`tests/e2e/fixtures/shop/src/server.js`:

```js
// The HTTP entry point (B4): serves createHandler over node:http on $PORT (0 picks a free port) with the seeded catalog.
import http from 'node:http'
import { Catalog } from './catalog/products.js'
import { createHandler } from './http/handler.js'

const catalog = new Catalog()
catalog.add({ sku: 'TEA-001', name: 'Green tea', priceCents: 450 })
catalog.add({ sku: 'MUG-002', name: 'Mug', priceCents: 1200 })
const handle = createHandler(catalog)

const server = http.createServer((req, res) => {
  let data = ''
  req.on('data', chunk => { data += chunk })
  req.on('end', () => {
    let body
    try { body = data ? JSON.parse(data) : {} } catch { body = null }
    const r = body === null ? { status: 400, body: { error: 'invalid JSON' } } : handle({ method: req.method, path: req.url, body })
    res.writeHead(r.status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(r.body))
  })
})
server.listen(Number(process.env.PORT ?? 3000), () => console.log(`listening on ${server.address().port}`))
```

In `s2-greenfield.mjs` PHASE:
- add `{ src: fx('src/server.js'), dest: 'src/server.js' }` to `impl`;
- add `- src/server.js` under `## Files` in `plan`;
- spec B4 becomes `- B4: the handler serves GET /products, POST /cart and POST /checkout, over HTTP through \`npm start\`; 400 on error, 404 on an unknown path.`;
- intent `nonGoals` becomes `'Deleting cart lines, payment, persistence.'`;
- `prompt` says `…a request handler served over HTTP by npm start (src/server.js), in src/catalog, src/cart, src/orders and src/http…`.

In `s0-install.mjs`, the scaffold's scripts gain `start: 'node src/server.js'`.

In `tests/e2e/prd/shop-brief.md`, keep every heading. Change:
- Context: `…a checkout with discount codes, and a request handler served over HTTP by \`npm start\`. Prices are integer cents. No runtime dependencies.`
- Non-goals: `- Do not add payment or persistence.` (replaces the payment/persistence/server line)
- Architecture, append: `` `src/server.js` serves the handler over `node:http`; nothing imports it.``
- Interfaces, add: ``- `npm start` serves the handler on `$PORT` (0 picks a free port), prints `listening on <port>`, and seeds the catalog with TEA-001 (Green tea, 450) and MUG-002 (Mug, 1200). The HTTP contract is `api/openapi.yaml` with examples in `contracts/examples/`.``
- B4: same wording as the S2 spec.

- [ ] **Step 4: Run the suite to verify it passes**

Run: `node tests/e2e/run.mjs`
Expected: exit 0. S2 reports 20/20 and S3 22/22, both including `PASS  hidden acceptance over HTTP: …`. S1 still reports 3/3: the brief's headings are unchanged, and B1 and B6 are still untested at S1.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/acceptance/shop-http.mjs tests/e2e/fixtures/shop/src/server.js tests/e2e/prd/shop-brief.md tests/e2e/phases/s0-install.mjs tests/e2e/phases/s2-greenfield.mjs tests/e2e/run.mjs
git commit -m "test(e2e): a hidden HTTP acceptance that imports no source; the shop is served by npm start"
```

---

### Task 3: The contract stage

**Files:**
- Create: `tests/e2e/fixtures/shop/api/openapi.yaml`, `tests/e2e/fixtures/shop/contracts/examples/01-products.json`, `02-add-tea.json`, `03-checkout.json`
- Create: `tests/e2e/fixtures/remove/api/openapi.yaml`, `tests/e2e/fixtures/remove/contracts/examples/04-delete-tea.json`, `05-delete-absent.json`
- Modify: `tests/e2e/lib/sandbox.mjs` (env `CONTRACT_LOG`)
- Modify: `tests/e2e/phases/s0-install.mjs` (copies the tool; REGISTRY declares contracts)
- Modify: `tests/e2e/driver/scripted.mjs` (`plan()` copies `phase.contracts`)
- Modify: `tests/e2e/phases/s2-greenfield.mjs`, `tests/e2e/phases/s3-delete.mjs` (`contracts` lists, plan `## Contracts`, `contractChecks`)
- Modify: `tests/e2e/assert/change.mjs` (freeze and validate-first checks)
- Modify: `tests/e2e/run.mjs` (S3 `afterApprove`; FLOOR S2 22, S3 27)

**Interfaces:**
- Consumes: the CLI from Task 1; `server.js` from Task 2.
- Produces:
  - `PHASE.contracts: {src, dest}[]`, copied by the scripted `plan()`;
  - `contractChecks(sb, slug): Promise<{title, ok, why}[]>`, exported from `s3-delete.mjs`;
  - `sb.env.CONTRACT_LOG`, an absolute path inside `sb.logs`.

- [ ] **Step 1: Write the failing checks**

In `assert/change.mjs`, after the approval-hash check, add the two checks below. They run only when `phase.contracts` is set; both S2 and S3 set it.

```js
  const declared = (json(sb.read('.rig/sensors.json'))?.contracts?.files ?? []).length > 0
  if (phase.contracts?.length && declared) {
    await c.check(`${id}: the approval froze every contract file that shipped`, () => {
      const bad = phase.contracts.map(f => f.dest).filter(f => a?.contracts?.[f] !== digest(sb.read(f)))
      return !bad.length || `not frozen as shipped: ${bad.join(', ')} (${JSON.stringify(a?.contracts)})`
    })
    await c.check(`${id}: verify ran the contract validate before the contract run`, () => {
      const log = sb.read(path.relative(sb.dir, sb.env.CONTRACT_LOG)).trim().split('\n')
      return (log.at(-2) === 'validate' && log.at(-1) === 'run') || `contract log ends: ${log.slice(-3).join(', ')}`
    })
  }
```

`sb.read` is relative to the repo. Read the log with `fs.readFileSync(sb.env.CONTRACT_LOG, 'utf8')` instead if `path.relative` climbs out awkwardly. Either is fine; record the choice as a ruling only if it changes behaviour.

In `s3-delete.mjs`, add:

```js
// Contract stage (spec §6, §10.2): a weakened frozen example is refused at commit, and examples that do not match the spec
// stop the contract run before it starts.
export async function contractChecks(sb, slug) {
  const head = () => sb.git('rev-parse', 'HEAD')
  const before = head()
  const frozen = 'contracts/examples/03-checkout.json'
  const original = sb.read(frozen)
  const weakened = JSON.parse(original)
  delete weakened.response.body
  sb.write(frozen, JSON.stringify(weakened, null, 2) + '\n')
  sb.git('add', frozen)
  const w = sb.run('git', ['commit', '-q', '-m', 'operator: weaken a frozen example'])
  const wSaid = w.stdout + w.stderr
  if (head() !== before) sb.git('reset', '-q', '--soft', before)
  sb.git('reset', '-q', 'HEAD', '--', frozen)
  sb.write(frozen, original)

  const bad = 'contracts/examples/99-undeclared.json'
  fs.writeFileSync(sb.env.CONTRACT_LOG, '')
  sb.write(bad, JSON.stringify({ request: { method: 'PUT', path: '/products' }, response: { status: 200 } }, null, 2) + '\n')
  sb.git('add', bad)
  const v = sb.run('git', ['commit', '-q', '-m', 'operator: an example the spec does not declare'])
  const vSaid = v.stdout + v.stderr
  if (head() !== before) sb.git('reset', '-q', '--soft', before)
  sb.run('git', ['rm', '-q', '--cached', '--force', bad])
  sb.run('rm', ['-f', sb.file(bad)])
  const log = fs.readFileSync(sb.env.CONTRACT_LOG, 'utf8').trim().split('\n')

  return [
    { title: 'S3: a commit that weakens a frozen contract example is refused as harness-tamper', ok: w.status !== 0 && /harness-tamper/.test(wSaid) && wSaid.includes(frozen), why: `exit ${w.status}: ${wSaid.trim().split('\n').slice(0, 2).join(' | ')}` },
    { title: 'S3: an example the spec does not declare is refused by the contract validate', ok: v.status !== 0 && /examples do not match the specs/.test(vSaid), why: `exit ${v.status}: ${vSaid.trim().split('\n').slice(0, 2).join(' | ')}` },
    { title: 'S3: when validate fails, the contract run does not start', ok: log.includes('validate') && !log.includes('run'), why: `contract log: ${log.join(', ')}` },
  ]
}
```

(`import fs from 'node:fs'` at the top of `s3-delete.mjs`.) In `run.mjs`, the S3 `afterApprove` becomes:

```js
afterApprove: live ? undefined : async slug => [...await staleCheck(sb, slug), ...await contractChecks(sb, slug)]
```

and the FLOOR becomes `'S2 ': 22, 'S3 ': 27`.

- [ ] **Step 2: Run the suite to verify it fails**

Run: `node tests/e2e/run.mjs`
Expected: exit 1. Nothing declares contracts yet, so `phase.contracts` is undefined and the two `assertChange` checks do not run. The run fails on the coverage floor (`coverage floor: S2 : fewer than 22 checks ran`) and on the S3 contract notes: the weakened example commits, so the refusal check fails.

- [ ] **Step 3: Declare the contract, write the fixtures, wire the driver**

`sandbox.mjs`, inside `env`: add `CONTRACT_LOG: path.join(logs, 'contract.log')`.

`s0-install.mjs`:
- copy the tool during scaffolding: `fs.mkdirSync(sb.file('scripts'), { recursive: true }); fs.copyFileSync(path.join(import.meta.dirname, '../fixtures/tooling/scripts/contract.mjs'), sb.file('scripts/contract.mjs'))`;
- REGISTRY gains:

```js
  contracts: {
    files: ['api/openapi.yaml', 'contracts/examples/**'],
    covers: ['src/http/**', 'src/server.js'],
    validate: 'node scripts/contract.mjs validate',
    run: 'node scripts/contract.mjs run',
  },
```

`scripted.mjs` `plan()`: after writing `spec.md` and `plan.md`, add `copy(sb, phase.contracts ?? [])`. The plan skill makes contract edits before approval (skills/plan/SKILL.md step 3).

`tests/e2e/fixtures/shop/api/openapi.yaml`:

```json
{
  "openapi": "3.0.3",
  "info": { "title": "shop-app", "version": "0.1.0" },
  "paths": {
    "/products": { "get": { "responses": { "200": { "description": "the catalog" } } } },
    "/cart": { "post": { "responses": { "201": { "description": "the cart lines" }, "400": { "description": "unknown SKU or bad quantity" } } } },
    "/checkout": { "post": { "responses": { "201": { "description": "the order" }, "400": { "description": "empty cart or unknown code" } } } }
  }
}
```

The examples in `tests/e2e/fixtures/shop/contracts/examples/`:
- `01-products.json`: `{ "request": { "method": "GET", "path": "/products" }, "response": { "status": 200, "body": [{ "sku": "TEA-001", "priceCents": 450 }, { "sku": "MUG-002", "priceCents": 1200 }] } }`
- `02-add-tea.json`: `{ "request": { "method": "POST", "path": "/cart", "body": { "sku": "TEA-001", "qty": 2 } }, "response": { "status": 201, "body": [{ "sku": "TEA-001", "qty": 2 }] } }`
- `03-checkout.json`: `{ "request": { "method": "POST", "path": "/checkout", "body": { "code": "SAVE10" } }, "response": { "status": 201, "body": { "subtotalCents": 900, "discountCents": 90, "totalCents": 810 } } }`

`tests/e2e/fixtures/remove/api/openapi.yaml` is the same document plus this path:

```json
    "/cart/{sku}": { "delete": { "responses": { "200": { "description": "the remaining cart lines" }, "400": { "description": "the SKU is not in the cart" } } } }
```

The examples in `tests/e2e/fixtures/remove/contracts/examples/`:
- `04-delete-tea.json`: `{ "request": { "method": "DELETE", "path": "/cart/TEA-001" }, "response": { "status": 200, "body": [] } }`
- `05-delete-absent.json`: `{ "request": { "method": "DELETE", "path": "/cart/TEA-001" }, "response": { "status": 400 } }`

S2 PHASE:
- `contracts: ['api/openapi.yaml', 'contracts/examples/01-products.json', 'contracts/examples/02-add-tea.json', 'contracts/examples/03-checkout.json'].map(f => ({ src: fx(f), dest: f }))`;
- the plan's `## Contracts` becomes `- api/openapi.yaml (adds /products, /cart, /checkout)\n- contracts/examples/01-products.json, 02-add-tea.json, 03-checkout.json`.

S3 PHASE:
- `contracts: ['api/openapi.yaml', 'contracts/examples/04-delete-tea.json', 'contracts/examples/05-delete-absent.json'].map(f => ({ src: fx(f), dest: f }))`;
- the plan's `## Contracts` becomes `- api/openapi.yaml (adds DELETE /cart/{sku})\n- contracts/examples/04-delete-tea.json, 05-delete-absent.json`;
- the prompt adds `; add DELETE /cart/{sku} and its examples to the HTTP contract in api/openapi.yaml and contracts/examples/ before approval`.

- [ ] **Step 4: Run the suite to verify it passes**

Run: `node tests/e2e/run.mjs`
Expected: exit 0, with S0 14/14, S1 3/3, S2 22/22, S3 27/27 and S4 9/9. The S3 lines include the three contract notes.

If a check fails because the harness behaves differently from spec §6, fix the harness in `scripts/` with a spec that fails first, and ledger it. Two examples: approval does not freeze a contract file present at approval time, or `check --at commit` does not run validate before run. Never relax the e2e check to match the harness.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e
git commit -m "test(e2e): contract stage: S2/S3 write the HTTP contract at plan time, approval freezes it, validate runs first and a weakened frozen example is refused"
```

---

### Task 4: The policy stage

**Files:**
- Create: `tests/e2e/phases/s5-policy.mjs`
- Modify: `tests/e2e/lib/sandbox.mjs` (`sdlc(args, { human, input })`)
- Modify: `tests/e2e/run.mjs` (S5 wiring, `NEEDS.S5`, FLOOR `'S5 policy': 6`, header comment)

**Interfaces:**
- Consumes: the shop on main after S2 (`src/orders/orders.js` contains `SAVE10: 0.1`); the registry's `unit` sensor.
- Produces: `runPolicy(sb): Promise<Checks>` with the title `S5 policy`.

- [ ] **Step 1: Write the failing phase** at `tests/e2e/phases/s5-policy.mjs`:

```js
// Policy stage (spec §3.3, §10.2): the same change, one turn under a continuous model and one under a final model.
// continuous: every turn sensor runs at Stop. final: only secrets and harness-tamper run at Stop; the rest waits for commit.
import crypto from 'node:crypto'
import { Checks } from '../lib/checks.mjs'

const PROBE = 'policy-probe'
const fired = sb => {
  const u = sb.read('.rig/unresolved.json')
  return u ? [...new Set(JSON.parse(u).findings.map(f => f.sensor))].sort() : []
}

// One turn: the session's model recorded at SessionStart, a prompt, the change, Stop. Returns the SessionStart context and the sensors that blocked.
function turn(sb, session, model) {
  const hook = (name, payload) => sb.sdlc(['hook', name], { input: JSON.stringify({ session_id: session, ...payload }) })
  const ctx = hook('session-start', { model, source: 'startup' }).stdout
  hook('prompt-submit', { prompt: 'policy probe' })
  sb.write('src/orders/orders.js', sb.read('src/orders/orders.js').replace('SAVE10: 0.1', 'SAVE10: 0.5'))
  sb.write('src/policy-leak.js', `${['export const apiKey', '=', JSON.stringify(crypto.randomBytes(16).toString('hex'))].join(' ')}\n`)
  hook('stop', {})
  const sensors = fired(sb)
  sb.run('git', ['checkout', '--', 'src/orders/orders.js'])
  sb.run('rm', ['-f', sb.file('src/policy-leak.js'), sb.file('.rig/unresolved.json')])
  // A clean turn resets the gate, so the next session starts from nothing.
  hook('prompt-submit', { prompt: 'settle' })
  hook('stop', {})
  return { ctx, sensors }
}

export async function runPolicy(sb) {
  const c = new Checks('S5 policy')
  const start = sb.git('rev-parse', 'HEAD')
  sb.git('checkout', '-q', '-b', PROBE)
  try {
    const cont = turn(sb, 'pol-sonnet', 'claude-sonnet-5-5')
    const fin = turn(sb, 'pol-opus', 'claude-opus-5-5')
    await c.check('S5: SessionStart names the continuous policy for Sonnet', () => /rig policy: continuous checks for claude-sonnet-5-5/.test(cont.ctx) || cont.ctx.split('\n')[0])
    await c.check('S5: SessionStart names the final policy for Opus', () => /rig policy: final checks for claude-opus-5-5/.test(fin.ctx) || fin.ctx.split('\n')[0])
    await c.check('S5: under continuous, Stop blocks on the unit suite and the secret', () => (cont.sensors.includes('unit') && cont.sensors.includes('secrets')) || `fired: ${cont.sensors.join(', ') || 'none'}`)
    await c.check('S5: under final, Stop blocks on the secret only (the unit suite waits for commit)', () => (fin.sensors.includes('secrets') && !fin.sensors.includes('unit')) || `fired: ${fin.sensors.join(', ') || 'none'}`)
    sb.write('src/orders/orders.js', sb.read('src/orders/orders.js').replace('SAVE10: 0.1', 'SAVE10: 0.5'))
    sb.git('add', 'src/orders/orders.js')
    const r = sb.run('git', ['commit', '-q', '-m', 'operator: the final-policy change at commit'])
    const said = r.stdout + r.stderr
    if (sb.git('rev-parse', 'HEAD') !== start) sb.git('reset', '-q', '--hard', start)
    sb.run('git', ['reset', '-q', '--hard', 'HEAD'])
    await c.check('S5: the commit hook catches what final skipped (unit)', () => (r.status !== 0 && /\bunit\b/.test(said)) || `exit ${r.status}: ${said.trim().split('\n').slice(0, 2).join(' | ')}`)
  } finally {
    sb.git('checkout', '-q', 'main')
    sb.run('git', ['branch', '-q', '-D', PROBE])
  }
  await c.check('S5: the tree is clean and main is where it was', () => (sb.git('status', '--porcelain') === '' && sb.git('rev-parse', 'HEAD') === start) || `status: ${sb.git('status', '--porcelain').split('\n').join('; ')}`)
  return c
}
```

Wire it into `run.mjs`:
- `import { runPolicy } from './phases/s5-policy.mjs'`;
- `NEEDS.S5 = ['S1', 'S2', 'S3', 'S4']`;
- after S4: `if (want('S5') && !live) { ensureMain(s3slug ?? S3.slug); results.push(await timed('S5', () => runPolicy(sb))) }`;
- FLOOR gains `'S5 policy': 6`.

`want` needs `S5` in the `--phase` comment at the top of the file as well.

- [ ] **Step 2: Run the suite to verify it fails**

Run: `node tests/e2e/run.mjs --phase S5`
Expected: S5 fails. `sb.sdlc` ignores `input`, so every hook gets empty stdin. No model is recorded and Stop has no session, so both turns run continuous: the final check fails with `fired: secrets, unit`, and the SessionStart policy check for Opus fails.

- [ ] **Step 3: Pass stdin through the sandbox**

In `sandbox.mjs`, `sdlc`:

```js
    sdlc(args, { human = false, input } = {}) {
      const vendored = path.join(dir, '.rig/bin/sdlc.ts')
      const script = fs.existsSync(vendored) ? vendored : path.join(PLUGIN, 'scripts/sdlc.ts')
      const who = human ? { SDLC_HUMAN: '1' } : {}
      return run('node', ['--disable-warning=ExperimentalWarning', script, ...args], { env: { CLAUDE_PROJECT_DIR: dir, ...who }, ...(input === undefined ? {} : { input }) })
    },
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `node tests/e2e/run.mjs`
Expected: exit 0. Every earlier group is unchanged, and `S5 policy: 6/6 checks passed`.

If the harness disagrees with spec §3.3, fix the harness with a failing spec and ledger it. Examples: final still runs `unit` at Stop, or the commit hook does not run `unit`.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/phases/s5-policy.mjs tests/e2e/lib/sandbox.mjs tests/e2e/run.mjs
git commit -m "test(e2e): policy stage: one change under continuous and final; final defers the unit suite to the commit hook"
```

---

### Task 5: Stack fixtures

**Files:**
- Create: `tests/e2e/fixtures/stacks/node/{package.json,src/add.js,test/add.test.js}`
- Create: `tests/e2e/fixtures/stacks/go/{go.mod,add.go,add_test.go}`
- Create: `tests/e2e/fixtures/stacks/rust/{Cargo.toml,src/lib.rs,.gitignore}`
- Create: `tests/e2e/fixtures/stacks/java-maven/{pom.xml,src/main/java/add/Add.java,.gitignore}`
- Create: `tests/e2e/fixtures/stacks/dotnet/{add.csproj,Add.cs,.gitignore}`
- Create: `tests/e2e/lib/stacks.mjs`, `tests/e2e/lib/stacks.test.mjs`, `tests/e2e/stacks.mjs`
- Modify: `package.json` (`test:e2e:stacks`), `.github/workflows/ci.yml` (`e2e-stacks` job)

**Interfaces:**
- Produces:
  - `STACKS: { stack, probe: [cmd, ...args], core: 'types' | 'unit', file, good: (text) => text, broken: (text) => text }[]`
  - `probe(run, cmd, args): { ok: boolean, why: string }`
  - `runStack(sb, s): Promise<Checks>`, with the title `stack <name>` and 4 checks
  - the CLI `node tests/e2e/stacks.mjs [--stack <name>] [--out DIR]`

- [ ] **Step 1: Write the failing unit test** in `tests/e2e/lib/stacks.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { probe, STACKS } from './stacks.mjs'

const fakeRun = result => () => result

test('probe() skips a stack whose version command exits non-zero', () => {
  const p = probe(fakeRun({ status: 1, stdout: '', stderr: 'Unable to locate a Java Runtime.' }), 'mvn', ['-v'])
  assert.equal(p.ok, false)
  assert.match(p.why, /mvn -v exited 1: Unable to locate a Java Runtime\./)
})

test('probe() skips a stack whose binary is missing', () => {
  const p = probe(fakeRun({ status: null, error: Object.assign(new Error('spawn go ENOENT'), { code: 'ENOENT' }) }), 'go', ['version'])
  assert.deepEqual(p, { ok: false, why: 'go not found' })
})

test('every pack the spec names has a fixture whose broken edit differs from its good edit', () => {
  assert.deepEqual(STACKS.map(s => s.stack).sort(), ['dotnet', 'go', 'java-maven', 'node', 'rust'])
  for (const s of STACKS) assert.notEqual(s.broken('x'), s.good('x'), s.stack)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/e2e/lib/stacks.test.mjs`
Expected: FAIL, because `./stacks.mjs` cannot be resolved.

- [ ] **Step 3: Write the fixtures, the library and the runner**

Fixtures. Each has one source file whose `add` returns `a + b`, and one test where the language has one built in.
- `node/package.json`: `{ "name": "add", "version": "0.1.0", "type": "module", "scripts": { "test": "node --test" } }`
- `node/src/add.js`: `export const add = (a, b) => a + b\n`
- `node/test/add.test.js`: `import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { add } from '../src/add.js'\ntest('adds', () => assert.equal(add(2, 3), 5))\n`
- `go/go.mod`: `module example.com/add\n\ngo 1.22\n`
- `go/add.go`: `package add\n\nfunc Add(a, b int) int { return a + b }\n`
- `go/add_test.go`: `package add\n\nimport "testing"\n\nfunc TestAdd(t *testing.T) { if Add(2, 3) != 5 { t.Fatal("2+3") } }\n`
- `rust/Cargo.toml`: `[package]\nname = "add"\nversion = "0.1.0"\nedition = "2021"\n`
- `rust/src/lib.rs`: `pub fn add(a: i64, b: i64) -> i64 { a + b }\n\n#[cfg(test)]\nmod tests { #[test] fn adds() { assert_eq!(super::add(2, 3), 5); } }\n`
- `rust/.gitignore`: `target/\n`
- `java-maven/pom.xml`: a project with `groupId` example, `artifactId` add, `version` 0.1.0, `packaging` jar, the property `maven.compiler.release` 17, `project.build.sourceEncoding` UTF-8, and no dependencies.
- `java-maven/src/main/java/add/Add.java`: `package add;\n\npublic final class Add {\n  public static int add(int a, int b) { return a + b; }\n}\n`
- `java-maven/.gitignore`: `target/\n`
- `dotnet/add.csproj`: `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework><Nullable>enable</Nullable></PropertyGroup></Project>\n`
- `dotnet/Add.cs`: `namespace AddLib;\n\npublic static class Calc\n{\n    public static int Add(int a, int b) { return a + b; }\n}\n`
- `dotnet/.gitignore`: `bin/\nobj/\n`

`tests/e2e/lib/stacks.mjs`:

```js
// Stack fixtures (spec §10.2): a tiny repo per pack. Each one onboards with `init --stack` and `baseline`, then `check --at commit`
// passes a good staged edit and blocks a broken one on the pack's core sensor. A stack whose toolchain cannot run is skipped.
import fs from 'node:fs'
import path from 'node:path'
import { Checks } from './checks.mjs'

export const FIXTURES = path.join(import.meta.dirname, '../fixtures/stacks')
const good = t => `${t.trimEnd()}\n${t.includes('#') && !t.includes('//') ? '#' : '//'} reviewed\n`
const typeError = t => t.replace('a + b', 'a + "b"')

export const STACKS = [
  { stack: 'node', probe: ['node', '--version'], core: 'unit', file: 'src/add.js', good, broken: t => t.replace('a + b', 'a - b') },
  { stack: 'go', probe: ['go', 'version'], core: 'types', file: 'add.go', good, broken: typeError },
  { stack: 'rust', probe: ['cargo', '--version'], core: 'types', file: 'src/lib.rs', good, broken: typeError },
  { stack: 'java-maven', probe: ['mvn', '-v'], core: 'types', file: 'src/main/java/add/Add.java', good, broken: typeError },
  { stack: 'dotnet', probe: ['dotnet', '--version'], core: 'types', file: 'Add.cs', good, broken: typeError },
]

export function probe(run, cmd, args) {
  const r = run(cmd, args)
  if (r.error?.code === 'ENOENT') return { ok: false, why: `${cmd} not found` }
  if (r.status !== 0) return { ok: false, why: `${cmd} ${args.join(' ')} exited ${r.status}: ${((r.stderr || r.stdout || '').trim().split('\n')[0])}` }
  return { ok: true, why: '' }
}

const json = t => { try { return JSON.parse(t) } catch { return null } }

export async function runStack(sb, s) {
  const c = new Checks(`stack ${s.stack}`)
  fs.cpSync(path.join(FIXTURES, s.stack), sb.dir, { recursive: true })
  sb.commitAll('chore: fixture')
  const init = sb.sdlc(['init', '--stack'])
  await c.check(`${s.stack}: init --stack detects the ${s.stack} pack`, () => new RegExp(`from the ${s.stack} pack`).test(init.stdout) || (init.stdout + init.stderr).trim().split('\n').slice(-2).join(' | '))
  const base = sb.sdlc(['baseline'])
  await c.check(`${s.stack}: the core sensor (${s.core}) passes at baseline`, () => new RegExp(`^${s.core}: pass`, 'm').test(base.stdout) || base.stdout.trim().split('\n').filter(l => l.startsWith(s.core)).join(' | ') || base.stderr.trim())
  sb.commitAll('chore: onboard rig')
  const original = sb.read(s.file)
  const check = () => json(sb.sdlc(['check', '--at', 'commit', '--json']).stdout) ?? { blocks: [{ sensor: 'unparsed' }] }
  sb.write(s.file, s.good(original))
  sb.git('add', s.file)
  const ok = check()
  await c.check(`${s.stack}: check --at commit passes a good staged edit`, () => !ok.blocks?.length || ok.blocks.map(b => `${b.sensor}: ${b.message?.split('\n')[0]}`).join(' | '))
  sb.write(s.file, s.broken(original))
  sb.git('add', s.file)
  const bad = check()
  await c.check(`${s.stack}: check --at commit blocks a broken staged edit on ${s.core}`, () => (bad.blocks ?? []).some(b => b.sensor === s.core) || `blocks: ${(bad.blocks ?? []).map(b => b.sensor).join(', ') || 'none'}`)
  return c
}
```

`tests/e2e/stacks.mjs`:

```js
// Stack fixtures, outside npm test (toolchains, network downloads): node tests/e2e/stacks.mjs [--stack <name>] [--out DIR]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createSandbox } from './lib/sandbox.mjs'
import { STACKS, probe, runStack } from './lib/stacks.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const only = arg('stack')
const out = path.resolve(arg('out', fs.mkdtempSync(path.join(os.tmpdir(), 'rig-stacks-'))))
const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' })
let ran = 0
for (const s of STACKS.filter(s => !only || s.stack === only)) {
  const p = probe(run, s.probe[0], s.probe.slice(1))
  if (!p.ok) { console.log(`SKIP  stack ${s.stack}: ${p.why}`); continue }
  const c = await runStack(createSandbox({ name: `stack-${s.stack}`, out }), s)
  c.print()
  ran++
  if (c.failed.length) process.exitCode = 1
}
console.log(`\n${ran} stack(s) ran; sandboxes: ${out}`)
```

`package.json` scripts: add `"test:e2e:stacks": "node tests/e2e/stacks.mjs"`.

`.github/workflows/ci.yml`: add the job below. Copy the checkout and setup-node steps from the existing `e2e-fast` job verbatim, including the action versions it pins.

```yaml
  e2e-stacks:
    # Stack fixtures: each pack onboards a tiny repo and check --at commit blocks a broken edit on its core sensor.
    # ubuntu-latest carries go, java with mvn, dotnet and cargo; a missing toolchain is skipped, not failed.
    runs-on: ubuntu-latest
    steps:
      # (checkout and setup-node, as in e2e-fast)
      - run: npm ci
      - run: npm run test:e2e:stacks
```

- [ ] **Step 4: Run the unit test and the stack runner**

Run: `node --test tests/e2e/lib/stacks.test.mjs && npm run test:e2e:stacks`
Expected: 3/3 unit tests pass. On this machine:
- node and rust run, 4/4 each;
- go and dotnet print `SKIP` (not installed);
- java-maven runs 4/4 if `mvn -v` exits 0 and Maven Central is reachable, and prints `SKIP` otherwise.

The run exits 0.

If a stack fails, it is a harness finding: detection, the pack's core command, or baseline's knownRed. Fix it in `templates/stacks/<stack>.json` or `scripts/` with a spec that fails first, ledger it, and record anything you could not verify locally (go, dotnet) as a ruling.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/fixtures/stacks tests/e2e/lib/stacks.mjs tests/e2e/lib/stacks.test.mjs tests/e2e/stacks.mjs package.json .github/workflows/ci.yml
git commit -m "test(e2e): stack fixtures for node, go, rust, java-maven and dotnet: onboard, then check --at commit blocks a broken edit on the core sensor"
```

---

### Task 6: Docs, live prompts and the measured floors

**Files:**
- Modify: `tests/e2e/run.mjs` (header comment: S5 and the HTTP/contract checks)
- Modify: `tests/e2e/phases/s0-install.mjs` (`SCAFFOLD_PROMPT`: drop "charted"; mention `npm start` and `scripts/contract.mjs`)
- Modify: `tests/e2e/acceptance/shop.mjs` (comments: "sprint-0 PRD" becomes "the brief", "oracle child" becomes "acceptance child")
- Modify: `README.md` (the e2e paragraph: the stages, `test:e2e:stacks`)
- Modify: `.github/workflows/ci.yml` (the `e2e-fast` comment names the contract and policy stages)
- Modify: `docs/superpowers/specs/2026-10-16-behavioural-harness-design.md` §10.2 (a note under the bullets on Decisions 1 and 3)
- Modify: `scripts/removed.spec.ts` (the 5b guard)

**Interfaces:** none new.

- [ ] **Step 1: Write the failing guard** in `scripts/removed.spec.ts`:

```ts
test('5b: the e2e stages and the stack runner are wired, and no shipped e2e text still says charted, PRD or oracle', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  assert.match(pkg.scripts['test:e2e:stacks'], /tests\/e2e\/stacks\.mjs/)
  assert.match(fs.readFileSync('.github/workflows/ci.yml', 'utf8'), /npm run test:e2e:stacks/)
  for (const f of ['tests/e2e/phases/s0-install.mjs', 'tests/e2e/acceptance/shop.mjs', 'tests/e2e/run.mjs']) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /\bcharted\b|\bPRD\b|\boracle\b/i, f)
  }
  assert.match(fs.readFileSync('tests/e2e/run.mjs', 'utf8'), /'S5 policy': \d+/)
})
```

Use the imports `removed.spec.ts` already has; add `fs` only if it is missing.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --disable-warning=ExperimentalWarning --test scripts/removed.spec.ts`
Expected: FAIL on `tests/e2e/phases/s0-install.mjs`, which still says "charted".

- [ ] **Step 3: Make the edits**

- `SCAFFOLD_PROMPT`: `'Node.js 22 ESM project named shop-app, no dependencies, tests with node --test, an npm start script that runs src/server.js. Scaffold ONLY the empty skeleton and one passing smoke test. Do not implement any shop behaviour: that arrives later as its own change. Copy nothing into scripts/; the contract tool is provided.'` The live lane copies the tool the same way the scripted lane does: `install` writes it before `init`. In the live branch of `run.mjs`, copy it right after `sb.isolate()` with the same two lines from Task 3.
- The `shop.mjs` comments, as listed in Files.
- The `run.mjs` header: `S5 runs one change under the continuous and the final policy (scripted only). S2 and S3 also write and freeze the HTTP contract and pass the hidden HTTP acceptance.`
- README: describe the e2e stages S0–S5 in one paragraph and add `npm run test:e2e:stacks  # stack fixtures; skips a missing toolchain` to the command list.
- Spec §10.2, under the bullets: `Step 5b notes: the shop's contract commands are its own zero-dependency script (Specmatic waits on Java and its licence, §14); stack fixtures run as npm run test:e2e:stacks and their own CI job, not in npm test.`

- [ ] **Step 4: Run the whole suite**

Run: `npm test > /tmp/5b-npm-test.txt 2>&1; echo exit $?; grep -E "^ℹ (pass|fail)|checks passed|floor" /tmp/5b-npm-test.txt` (use the scratchpad directory instead of /tmp)
Expected: exit 0, with:
- every spec passing;
- the e2e unit tests (including contract-tool and stacks) passing;
- S0 14/14, S1 3/3, S2 22/22, S3 27/27, S4 9/9 and S5 6/6.

If the measured counts differ because a check was added or merged during a ruling, set FLOOR to the measured counts and ledger it.

Then run: `npm run typecheck` and expect 0 errors.

- [ ] **Step 5: Commit**

```bash
git add -A tests/e2e README.md .github/workflows/ci.yml docs/superpowers/specs/2026-10-16-behavioural-harness-design.md scripts/removed.spec.ts
git commit -m "docs(e2e): stages S0-S5, the stack runner, and the leftover PRD/oracle wording gone"
```

---

### Task 7: Verify and review

- [ ] Run `npm test` and `npm run typecheck` and quote both results.
- [ ] Run `npm run test:e2e:stacks` and quote which stacks ran and which were skipped, with the reason.
- [ ] Launch one Opus reviewer on `git diff main...HEAD`, using `requesting-code-review/code-reviewer.md`. Give it this plan, the spec §10.2, §6 and §3.3, the Review Focus above verbatim, and the ledger's `Ruling:` lines.
- [ ] Fix every Critical and Important finding in one pass, each with a test that fails first, then run `npm test` again.
- [ ] Report to the person: the results, the rulings, the deferred minors, and which stacks were verified locally versus only in CI. Merge only when the person asks.
