// The "contract" variant: B13-B14, the orders over HTTP, on a built B1-B12 shop.
// Why it exists (eval 2026-10-31): bare Sonnet and bare Haiku pass the pricing task 8 of 8, so a ceiling hid any lift from rig. Here the
// wire rules are not in the prompt: they are in docs/api-conventions.md (committed in the base), and the contract tool in the repo
// (scripts/contract.mjs) has quirks a model finds only by running it. This is the article's failure shape (exact error types, status order,
// header details, a contract file kept in step), the thing a harness with a contract sensor is for.
// Every arm starts from the same built shop. Rig builds B13 and B14 as two changes (S13, S14); a bare arm gets one prompt.
// Hidden acceptance imports and runs the model's code in child processes, one per check: model code never runs inside the scorer, and
// no check sees another's orders.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { briefFor as pricingBrief } from './pricing.mjs'
import { stateOf, load } from './rules.mjs'
import { start, stop } from '../../tests/e2e/fixtures/tooling/scripts/contract.mjs'

const HERE = import.meta.dirname
const FX = path.join(HERE, 'contract/fixtures')
const STAGE = path.join(HERE, 'contract/stages/s13')
export const SEED = path.join(HERE, 'contract/seed')

const WIRE = ' **Orders over HTTP (B13, B14).** The HTTP API also serves the orders: `GET /orders`, `GET /orders/<id>` and `POST /orders/<id>/cancel`. Their wire format is fixed by `docs/api-conventions.md`, which is part of this brief: follow it exactly. The handler now receives the request headers and may return response headers, as that document says.'
const B13 = '- B13: GET /orders (paged) and GET /orders/<id> (with an etag), as docs/api-conventions.md says, declared in api/openapi.yaml with examples.'
const B14 = '- B14: POST /orders/<id>/cancel with if-match and an optional idempotency key, as docs/api-conventions.md says, declared in api/openapi.yaml with an example.'

export function briefFor(base) {
  return pricingBrief(base)
    .replace('cancelled ones included.', m => m + WIRE)
    .replace(/(- B12: [^\n]*\n)/, `$1${B13}\n${B14}\n`)
    .replace('B12: test/cancel.test.js.', 'B12: test/cancel.test.js. B13: test/orders-api.test.js. B14: test/cancel-api.test.js.')
}

const ALL = ['src/http/handler.js', 'src/orders/orders.js', 'src/server.js']
const filesOf = (dir, rel) => fs.readdirSync(path.join(dir, rel)).map(f => path.join(rel, f))
const phase = (id, slug, title, behaviour, prompt, problem, test, implFrom, contracts) => ({
  ...stateOf(id, slug, title, behaviour, prompt, { problem }, [{ src: path.join(FX, `test/${test}`), dest: `test/${test}` }], ALL, `feat(http): ${title.toLowerCase()}`),
  impl: ALL.map(f => ({ src: path.join(implFrom(f), f), dest: f })),
  contracts,
})
const TAIL = 'the exact wire rules are in docs/api-conventions.md; edit the existing files, do not rewrite them; keep api/openapi.yaml and contracts/examples/ in step so `node scripts/contract.mjs validate` and `run` pass.'
const contractFiles = (dir, names) => [{ src: path.join(dir, 'api/openapi.yaml'), dest: 'api/openapi.yaml' }, ...names.map(n => ({ src: path.join(dir, 'contracts/examples', n), dest: `contracts/examples/${n}` }))]

export const PHASE_S13 = phase('S13', 'orders-read-api', 'Read the orders over HTTP',
  { id: 'B13', text: 'GET /orders pages newest first with a cursor, GET /orders/<id> has a version and an etag, errors are problem documents, every response has a request id.', test: 'orders-api.test.js' },
  `/rig-start A feature: read the orders over HTTP (brief behaviour B13): GET /orders and GET /orders/<id>, with problem-document errors, 405 with allow, an etag and 304, and a request id; ${TAIL}`,
  'An order can be placed but not looked at over HTTP.', 'orders-api.test.js', f => (f.endsWith('handler.js') ? STAGE : FX),
  contractFiles(STAGE, ['08-list-orders.json', '09-get-order.json', '10-unknown-order.json', '11-orders-wrong-method.json']))
export const PHASE_S14 = phase('S14', 'orders-cancel-api', 'Cancel an order over HTTP',
  { id: 'B14', text: 'POST /orders/<id>/cancel needs if-match, answers 404, 428, 412 and 409 in that order, and honours an idempotency key.', test: 'cancel-api.test.js' },
  `/rig-start A feature: cancel an order over HTTP (brief behaviour B14): POST /orders/<id>/cancel with if-match and an optional idempotency-key; ${TAIL}`,
  'An order can be cancelled in code but not over HTTP, and a retry could cancel twice.', 'cancel-api.test.js', () => FX,
  contractFiles(FX, ['12-cancel-needs-if-match.json']))
for (const ph of [PHASE_S13, PHASE_S14]) ph.acceptance = 'contract'

// What a perfect bare session leaves behind for B13 and B14 (the dry run): the reference files, without the stage copies.
export function dryOverlay(sb) {
  fs.cpSync(FX, sb.dir, { recursive: true })
}

// --- hidden checks -------------------------------------------------------------------------------------------------------
const p = (sku, priceCents, extra = {}) => ({ sku, name: sku, priceCents, ...extra })
async function world(repo, { stock } = {}) {
  const { Catalog } = await load(repo, 'src/catalog/products.js')
  const { createHandler } = await load(repo, 'src/http/handler.js')
  const catalog = new Catalog()
  catalog.add(p('TEA-001', 450, stock === undefined ? {} : { stock }))
  const handle = createHandler(catalog)
  const get = (path, headers = {}) => handle({ method: 'GET', path, headers })
  const post = (path, headers = {}, body = {}) => handle({ method: 'POST', path, body, headers })
  const order = (qty = 1) => { handle({ method: 'POST', path: '/cart', body: { sku: 'TEA-001', qty } }); return handle({ method: 'POST', path: '/checkout', body: {} }).body.id }
  const cancel = (id, headers = {}) => post(`/orders/${id}/cancel`, headers)
  const etag = id => get(`/orders/${id}`).headers?.etag
  return { catalog, handle, get, post, order, cancel, etag }
}
const isProblem = (r, status, slug) => r.status === status && r.headers?.['content-type'] === 'application/problem+json' && r.body?.type === `https://shop.example/errors/${slug}`
  && r.body?.status === status && typeof r.body?.detail === 'string' && Object.keys(r.body).sort().join() === 'detail,status,title,type'
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const CHECKS = [
  // B13
  async repo => {
    const w = await world(repo)
    const r = w.get('/orders/ORD-9999', { 'x-request-id': 'abc' })
    if (!isProblem(r, 404, 'not-found')) return `an unknown order was ${r.status} ${r.headers?.['content-type']} ${JSON.stringify(r.body)}, want a 404 application/problem+json with exactly type, title, status, detail`
    if (r.body.title !== 'Not Found') return `the 404 title was ${JSON.stringify(r.body.title)}, want "Not Found" (the reason phrase)`
    if (r.headers['x-request-id'] !== 'abc') return 'x-request-id was not echoed on a problem response'
    return /^req-/.test(w.get('/orders/ORD-9999').headers?.['x-request-id'] ?? '') || 'a request without x-request-id did not get one starting with req-'
  },
  async repo => {
    const w = await world(repo)
    const ids = [1, 2, 3, 4, 5].map(() => w.order())
    const want = [...ids].reverse()
    const a = w.get('/orders?limit=2')
    if (!same(a.body?.items?.map(o => o.id), want.slice(0, 2))) return `page 1 held ${JSON.stringify(a.body?.items?.map(o => o.id))}, want the newest two ${JSON.stringify(want.slice(0, 2))}`
    if (typeof a.body.nextCursor !== 'string' || Buffer.from(a.body.nextCursor, 'base64url').toString() !== want[1]) return 'nextCursor was not the base64url of the last id on the page'
    const b = w.get(`/orders?limit=2&cursor=${a.body.nextCursor}`)
    if (!same(b.body?.items?.map(o => o.id), want.slice(2, 4))) return `page 2 held ${JSON.stringify(b.body?.items?.map(o => o.id))}, want ${JSON.stringify(want.slice(2, 4))}`
    const c = w.get(`/orders?limit=2&cursor=${b.body.nextCursor}`)
    return (same(c.body?.items?.map(o => o.id), want.slice(4)) && c.body.nextCursor === null) || `the last page held ${JSON.stringify(c.body?.items?.map(o => o.id))} with nextCursor ${JSON.stringify(c.body?.nextCursor)}, want [${want[4]}] and null`
  },
  async repo => {
    const w = await world(repo)
    w.order()
    for (const q of ['0', '51', 'abc', '1.5', '']) if (!isProblem(w.get(`/orders?limit=${q}`), 400, 'invalid-limit')) return `limit=${JSON.stringify(q)} was not a 400 invalid-limit problem`
    for (const q of ['1', '50']) if (w.get(`/orders?limit=${q}`).status !== 200) return `limit=${q} was refused`
    if (!isProblem(w.get('/orders?cursor=nonsense'), 400, 'invalid-cursor')) return 'a nonsense cursor was not a 400 invalid-cursor problem'
    return isProblem(w.get(`/orders?cursor=${Buffer.from('ORD-9999').toString('base64url')}`), 400, 'invalid-cursor') || 'a cursor naming no order was not a 400 invalid-cursor problem'
  },
  async repo => {
    const w = await world(repo)
    for (let i = 0; i < 21; i++) w.order()
    const r = w.get('/orders')
    if (r.body?.items?.length !== 20 || typeof r.body.nextCursor !== 'string') return `the default page held ${r.body?.items?.length} orders with nextCursor ${JSON.stringify(r.body?.nextCursor)}, want 20 and a cursor`
    return r.headers?.['cache-control'] === 'no-store' || `cache-control was ${JSON.stringify(r.headers?.['cache-control'])}, want no-store`
  },
  async repo => {
    const w = await world(repo)
    const id = w.order()
    const r = w.get(`/orders/${id}`)
    if (r.status !== 200 || r.headers?.etag !== `"${id}-v1"`) return `GET /orders/<id> gave ${r.status} and etag ${JSON.stringify(r.headers?.etag)}, want 200 and "${id}-v1" with its quotes`
    const missing = ['id', 'status', 'customer', 'lines', 'subtotalCents', 'discountCents', 'totalCents', 'shippingCents', 'taxCents', 'payableCents', 'version'].filter(k => !(k in (r.body ?? {})))
    return (!missing.length && r.body.version === 1) || `the order lacked ${missing.join(', ') || 'version 1'}`
  },
  async repo => {
    const w = await world(repo)
    const id = w.order()
    const r = w.get(`/orders/${id}`, { 'if-none-match': `"${id}-v1"`, 'x-request-id': 'q1' })
    if (r.status !== 304 || r.body !== undefined || r.headers?.etag !== `"${id}-v1"`) return `a matching if-none-match gave ${r.status}, body ${JSON.stringify(r.body)}, etag ${JSON.stringify(r.headers?.etag)}, want 304, no body and the etag`
    if (r.headers['x-request-id'] !== 'q1') return 'a 304 lacked the echoed x-request-id'
    return w.get(`/orders/${id}`, { 'if-none-match': '"other"' }).status === 200 || 'a different if-none-match did not get the order'
  },
  async repo => {
    const w = await world(repo)
    const id = w.order()
    const bad = [['POST', '/orders', 'GET'], ['PUT', `/orders/${id}`, 'GET'], ['GET', `/orders/${id}/cancel`, 'POST'], ['DELETE', '/orders/ORD-9999', 'GET']]
    for (const [method, path, allow] of bad) {
      const r = w.handle({ method, path, headers: {} })
      if (!isProblem(r, 405, 'method-not-allowed') || r.headers.allow !== allow) return `${method} ${path} gave ${r.status} allow ${JSON.stringify(r.headers?.allow)}, want a 405 method-not-allowed problem with allow ${allow}`
    }
    return true
  },
  async repo => {
    const { child, port } = await start(repo)
    try {
      const url = p2 => `http://127.0.0.1:${port}${p2}`
      const send = (m, p2, headers = {}, body) => fetch(url(p2), { method: m, headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
      await send('POST', '/cart', {}, { sku: 'TEA-001', qty: 1 })
      const paid = await (await send('POST', '/checkout', {}, {})).json()
      const list = await send('GET', '/orders', { 'x-request-id': 'zz9' })
      if (list.headers.get('x-request-id') !== 'zz9' || list.headers.get('cache-control') !== 'no-store') return 'over a real server the list lacked the echoed x-request-id or cache-control: no-store (the server must write the handler\'s headers)'
      const miss = await send('GET', '/orders/ORD-9999')
      if (miss.headers.get('content-type') !== 'application/problem+json') return `over a real server a 404 had content-type ${miss.headers.get('content-type')}, want application/problem+json`
      const tag = (await send('GET', `/orders/${paid.id}`)).headers.get('etag')
      const nm = await send('GET', `/orders/${paid.id}`, { 'if-none-match': tag })
      return (nm.status === 304 && (await nm.text()) === '') || `over a real server a matching if-none-match gave ${nm.status}, want 304 with no body`
    } finally {
      await stop(child)
    }
  },
  // B14
  async repo => {
    const w = await world(repo)
    const id = w.order()
    if (!isProblem(w.cancel('ORD-9999'), 404, 'not-found') || !isProblem(w.cancel('ORD-9999', { 'if-match': '"x"' }), 404, 'not-found')) return 'cancelling an unknown order was not a 404 not-found problem before the if-match check'
    return w.etag(id) === `"${id}-v1"` || 'the order changed on a failed cancel'
  },
  async repo => {
    const w = await world(repo)
    const id = w.order()
    const a = w.cancel(id)
    if (!isProblem(a, 428, 'precondition-required') || a.body.title !== 'Precondition Required') return `cancel without if-match gave ${a.status} ${JSON.stringify(a.body)}, want a 428 precondition-required problem titled Precondition Required`
    const b = w.cancel(id, { 'if-match': '"stale"' })
    return (isProblem(b, 412, 'precondition-failed') && b.body.title === 'Precondition Failed') || `cancel with a stale if-match gave ${b.status} ${JSON.stringify(b.body)}, want a 412 precondition-failed problem`
  },
  async repo => {
    const w = await world(repo, { stock: 5 })
    const id = w.order(2)
    const r = w.cancel(id, { 'if-match': w.etag(id) })
    if (r.status !== 200 || r.body?.status !== 'cancelled' || r.body.version !== 2 || r.headers?.etag !== `"${id}-v2"`) return `a good cancel gave ${r.status}, status ${r.body?.status}, version ${r.body?.version}, etag ${JSON.stringify(r.headers?.etag)}, want 200, cancelled, 2 and "${id}-v2"`
    return w.catalog.get('TEA-001').stock === 5 || `cancelling over HTTP left the stock at ${w.catalog.get('TEA-001').stock}, want 5 (it must cancel as cancelOrder does)`
  },
  async repo => {
    const w = await world(repo)
    const id = w.order()
    w.cancel(id, { 'if-match': w.etag(id) })
    const again = w.cancel(id, { 'if-match': w.etag(id) })
    if (!isProblem(again, 409, 'already-cancelled')) return `cancelling twice with the current etag gave ${again.status}, want a 409 already-cancelled problem`
    return w.cancel(id, { 'if-match': `"${id}-v1"` }).status === 412 || 'a stale if-match on a cancelled order did not get 412 (the precondition is checked before already-cancelled)'
  },
  async repo => {
    const w = await world(repo)
    const id = w.order()
    const first = w.cancel(id, { 'if-match': w.etag(id), 'idempotency-key': 'k1' })
    const replay = w.cancel(id, { 'idempotency-key': 'k1', 'x-request-id': 'again' })
    if (first.headers?.['idempotent-replay'] !== undefined) return 'the first response carried idempotent-replay'
    if (replay.status !== 200 || replay.headers?.['idempotent-replay'] !== 'true' || replay.headers.etag !== first.headers.etag || !same(replay.body, first.body)) return `the replay gave ${replay.status}, idempotent-replay ${JSON.stringify(replay.headers?.['idempotent-replay'])}, etag ${JSON.stringify(replay.headers?.etag)}, want the first response again with idempotent-replay: true`
    return (replay.headers['x-request-id'] === 'again' && w.get(`/orders/${id}`).body.version === 2) || 'the replay did not carry the new request id, or changed the order again'
  },
  async repo => {
    const w = await world(repo)
    const a = w.order(), b = w.order()
    w.cancel(a, { 'if-match': w.etag(a), 'idempotency-key': 'kk' })
    return isProblem(w.cancel(b, { 'if-match': w.etag(b), 'idempotency-key': 'kk' }), 422, 'idempotency-conflict') || 'the same idempotency key on another order was not a 422 idempotency-conflict problem'
  },
  async repo => {
    const w = await world(repo)
    const id = w.order()
    if (w.cancel(id, { 'idempotency-key': 'kf' }).status !== 428) return 'cancel without if-match was not 428'
    const ok = w.cancel(id, { 'if-match': w.etag(id), 'idempotency-key': 'kf' })
    return (ok.status === 200 && ok.headers?.['idempotent-replay'] === undefined) || `a key whose first request failed was remembered: the retry gave ${ok.status} idempotent-replay ${JSON.stringify(ok.headers?.['idempotent-replay'])}`
  },
  // the contract files
  async repo => {
    const spec = JSON.parse(fs.readFileSync(path.join(repo, 'api/openapi.yaml'), 'utf8'))
    const find = re => Object.entries(spec.paths ?? {}).find(([t]) => re.test(t.replace(/\{[^}]+\}/g, '{}')))?.[1]
    const need = [[/^\/orders$/, 'get', ['200', '400']], [/^\/orders\/\{\}$/, 'get', ['200', '304', '404']], [/^\/orders\/\{\}\/cancel$/, 'post', ['200', '404', '409', '412', '422', '428']]]
    for (const [re, method, statuses] of need) {
      const op = find(re)?.[method]
      if (!op) return `api/openapi.yaml does not declare ${method.toUpperCase()} ${re.source.replace(/\\/g, '').replace('{}', '{id}')}`
      const lack = statuses.filter(s => !op.responses?.[s])
      if (lack.length) return `api/openapi.yaml declares ${method.toUpperCase()} ${re.source.replace(/\\/g, '').replace('{}', '{id}')} without status ${lack.join(', ')}`
    }
    return true
  },
  async repo => {
    const run = mode => spawnSync(process.execPath, ['scripts/contract.mjs', mode], { cwd: repo, encoding: 'utf8', timeout: 90_000 })
    for (const mode of ['validate', 'run']) {
      const r = run(mode)
      if (r.status !== 0) return `node scripts/contract.mjs ${mode} failed: ${String(r.stderr).trim().split('\n').slice(0, 2).join(' | ')}`
    }
    const dir = path.join(repo, 'contracts/examples')
    const paths = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).request?.path ?? '')
    const hit = re => paths.some(x => re.test(x))
    return (hit(/^\/orders$/) && hit(/^\/orders\/[^/]+$/) && hit(/^\/orders\/[^/]+\/cancel$/)) || 'contracts/examples/ has no example for each of /orders, /orders/<id> and /orders/<id>/cancel'
  },
]
const GROUPS = { b13: [0, 8], b14: [8, 15], files: [15, 17] }

export function contractChecks(repo) {
  const results = CHECKS.map((_, i) => {
    const r = spawnSync(process.execPath, [import.meta.filename, repo, String(i)], { cwd: repo, encoding: 'utf8', timeout: 120_000 })
    try { return JSON.parse(r.stdout.trim().split('\n').at(-1)).r } catch { return r.error?.code === 'ETIMEDOUT' ? 'check timed out' : `check crashed: ${String(r.stderr).trim().split('\n')[0] || `exit ${r.status}`}` }
  })
  const out = { failures: [] }
  for (const [g, [a, b]] of Object.entries(GROUPS)) {
    out[g] = results.slice(a, b).filter(r => r === true).length
    results.slice(a, b).forEach(r => { if (r !== true) out.failures.push(`${g}: ${r}`) })
  }
  return out
}

if (process.argv[1] === import.meta.filename && process.argv[3] !== undefined) {
  let r
  try { r = await CHECKS[Number(process.argv[3])](process.argv[2]) } catch (e) { r = `check crashed: ${String(e?.message ?? e).split('\n')[0]}` }
  console.log(JSON.stringify({ r }))
  process.exit(0)
}
