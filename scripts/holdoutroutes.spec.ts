import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseIntent, parseCases } from './chartcheck.ts'
import { calledOps, contractOps, holdoutRouteProblems } from './holdoutroutes.ts'

const ADD = 'openapi: 3.0.3\npaths:\n  /items:\n    post:\n      operationId: addItem\ncomponents:\n  schemas:\n    Item:\n      type: object\n'
const LIST = 'openapi: 3.0.3\npaths:\n  /items:\n    get:\n      operationId: listItems\n  /items/{id}:\n    get:\n      x: 1\n    delete:\n      x: 1\n'
const intent = (slug: string, depends: string, contract: string): ReturnType<typeof parseIntent> =>
  parseIntent(slug, `---\nsprint: 0\ndepends: ${depends}\n---\n# ${slug}\n\n## Interfaces\nContract: docs/contracts/${contract}.yaml\n\n## Behaviours\n- B1 (FR-1): x\n`)
const intents = [intent('add-item', '[]', 'add-item'), intent('list-items', '[add-item]', 'list-items')]
const contracts = { 'docs/contracts/add-item.yaml': ADD, 'docs/contracts/list-items.yaml': LIST }
const row = (id: string, slug: string): string => `| ${id} | FR-1 | ${slug} | B1 | holdout | - | ok |`
const run = (slug: string, text: string, id = 'TC-1') => holdoutRouteProblems({ intents, cases: parseCases(row(id, slug)), files: [{ name: 'f', id, text }], contracts })

test('contractOps reads paths and methods, not schemas', () => {
  assert.deepEqual(contractOps(LIST).map(o => `${o.method} ${o.path}`), ['GET /items', 'GET /items/{id}', 'DELETE /items/{id}'])
})

test('calledOps reads method calls, METHOD /path strings and a trailing-slash prefix', () => {
  const got = calledOps('client.get("/items?x=1")\nc.POST(\'/a\')\ncurl -X DELETE http://h:80/items/1\nclient.get("/items/" + id)\nclient.get(f"/items/{i}")')
  assert.deepEqual(got.map(o => `${o.method} ${o.path}${o.prefix ? '*' : ''}`), ['GET /items', 'POST /a', 'GET /items/*', 'GET /items/{i}', 'DELETE /items/1'])
})

test('holdout-route: an add-item case calling GET /items, owned by list-items, blocks', () => {
  const f = run('add-item', 'r = client.get("/items")')
  assert.equal(f.length, 1)
  assert.equal(f[0]!.rule, 'holdout-route')
  assert.equal(f[0]!.severity, 'block')
  assert.match(f[0]!.message, /TC-1 \(add-item\) calls GET \/items, which list-items owns and add-item does not depend on/)
})

test('holdout-route: the same test under list-items (depends add-item) passes', () => {
  assert.deepEqual(run('list-items', 'r = client.get("/items")'), [])
})

test('holdout-route: POST /items in an add-item test passes', () => {
  assert.deepEqual(run('add-item', 'client.post("/items", json={})'), [])
})

test('holdout-route: a prefix or template route owned by a dependency passes, one owned by a later intent blocks', () => {
  assert.deepEqual(run('list-items', 'client.get("/items/" + id)'), [])
  assert.equal(run('add-item', 'client.delete("/items/" + id)').length, 1)
})

test('holdout-route: unknown paths, support files and uncontracted intents give no finding', () => {
  assert.deepEqual(run('add-item', 'client.get("/health")'), [])
  assert.deepEqual(run('add-item', 'client.get("/items")', 'helper'), [])
  assert.deepEqual(holdoutRouteProblems({ intents, cases: parseCases(row('TC-1', 'add-item')), files: [{ name: 'f', id: 'TC-1', text: 'client.get("/items")' }], contracts: {} }), [])
})
