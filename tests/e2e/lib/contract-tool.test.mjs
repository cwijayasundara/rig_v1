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
