// The start path router: a deterministic check that can only narrow a request toward the full /rig:start conversation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc } from './testkit.ts'
import { routeCheck } from './route.ts'

test('bugfix with a symptom is quick', () => {
  const r = routeCheck('bugfix', 'cart total throws on an empty cart')
  assert.equal(r.path, 'quick')
  assert.deepEqual(r.reasons, ['bugfix names a symptom'])
})

test('bugfix with no symptom is full', () => {
  const r = routeCheck('bugfix', 'make the cart nicer')
  assert.equal(r.path, 'full')
  assert.deepEqual(r.reasons, ['no symptom named'])
})

test('refactor with no new behaviour is quick', () => {
  assert.equal(routeCheck('refactor', 'extract price formatting into a helper').path, 'quick')
})

test('refactor mentioning new behaviour is full', () => {
  const r = routeCheck('refactor', 'extract a helper and add currency support')
  assert.equal(r.path, 'full')
  assert.deepEqual(r.reasons, ['mentions new behaviour: add'])
})

test('a refactor using support as a noun is full (false-full is accepted)', () => {
  assert.equal(routeCheck('refactor', 'extract the support-ticket helper').path, 'full')
})

test('feature and chore are always full, even with a symptom word', () => {
  assert.equal(routeCheck('feature', 'add a retry when the API throws').path, 'full')
  assert.equal(routeCheck('chore', 'bump the lockfile, it throws').path, 'full')
})

test('an unknown type is full', () => {
  const r = routeCheck('spike', 'x throws')
  assert.equal(r.path, 'full')
  assert.deepEqual(r.reasons, ['unknown type spike'])
})

test('noRoute forces full on an otherwise quick bugfix', () => {
  const r = routeCheck('bugfix', 'cart total throws on an empty cart', { noRoute: true })
  assert.equal(r.path, 'full')
  assert.deepEqual(r.reasons, ['routing skipped (--no-route)'])
})

test('a request over 600 characters is full', () => {
  const r = routeCheck('bugfix', `the cart throws ${'x'.repeat(600)}`)
  assert.equal(r.path, 'full')
  assert.deepEqual(r.reasons, ['request over 600 characters'])
})

test('an upper case symptom matches', () => {
  assert.equal(routeCheck('bugfix', 'CART THROWS ON EMPTY').path, 'quick')
})

test('route-check prints the route, and --json prints the Route', () => {
  const repo = makeRepo()
  const plain = sdlc(repo, ['route-check', 'bugfix', 'cart total throws on an empty cart'])
  assert.equal(plain.code, 0)
  assert.equal(plain.stdout, 'route: quick\n- bugfix names a symptom\n')
  const json = sdlc(repo, ['route-check', 'bugfix', 'cart total throws on an empty cart', '--json'])
  assert.deepEqual(JSON.parse(json.stdout), { path: 'quick', type: 'bugfix', reasons: ['bugfix names a symptom'] })
  const skipped = sdlc(repo, ['route-check', 'bugfix', 'cart total throws on an empty cart', '--no-route'])
  assert.match(skipped.stdout, /^route: full\n- routing skipped/)
})

test('hostile request text is data, never run', () => {
  const repo = makeRepo()
  const r = sdlc(repo, ['route-check', 'bugfix', 'it throws `touch pwned` $(touch pwned2)'])
  assert.equal(r.code, 0)
  assert.match(r.stdout, /^route: quick/)
  assert.equal(fs.existsSync(path.join(repo, 'pwned')), false)
  assert.equal(fs.existsSync(path.join(repo, 'pwned2')), false)
})

test('a missing or empty type or request fails with a usage line', () => {
  const repo = makeRepo()
  for (const args of [['route-check'], ['route-check', 'bugfix'], ['route-check', 'bugfix', '  ']]) {
    const r = sdlc(repo, args)
    assert.notEqual(r.code, 0, args.join(' '))
    assert.match(r.stderr, /usage: route-check/)
    assert.equal(r.stdout.includes('quick'), false)
  }
})

test('corpus: no labelled-full request routes quick, and at least 80% of labelled-quick requests do', () => {
  type Entry = { type: string; request: string; expect: 'quick' | 'full' }
  const corpus = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../eval/fixtures/route/requests.json'), 'utf8')) as Entry[]
  const routed = corpus.map(e => ({ ...e, got: routeCheck(e.type, e.request).path }))
  const falseQuick = routed.filter(e => e.expect === 'full' && e.got === 'quick')
  assert.deepEqual(falseQuick, [], 'a request labelled full took the quick path')
  const quick = routed.filter(e => e.expect === 'quick')
  const hit = quick.filter(e => e.got === 'quick')
  assert.ok(quick.length >= 6 && corpus.length >= 15, 'the corpus is too small to mean anything')
  assert.ok(hit.length / quick.length >= 0.8, `quick recall ${hit.length}/${quick.length}; missed: ${quick.filter(e => e.got !== 'quick').map(e => e.request).join(' | ')}`)
})

test('review fix: refactors with inflected or synonymous new behaviour, no structural verb, or non-English text are full', () => {
  for (const request of [
    'Restructure pricing so it handles tiered discounts',
    'Extract the helper, adding a currency option',
    'Rename qty to quantity and implement bulk pricing',
    'Extract a helper that enables caching',
    'Split the cart module and make it accept a currency parameter',
    'Move pricing into a module plus a CLI flag',
    'Extraire le calcul et ajouter une option de devise',
    'Clean up the cart',
  ]) assert.equal(routeCheck('refactor', request).path, 'full', request)
})

test('review fix: bugfix requests with no real symptom, or a negated one, are full', () => {
  for (const request of [
    'Make the error messages friendlier',
    'Improve how `cart.ts` handles discounts',
    'Make the "Checkout" button look nicer',
    'Redesign the 404 page',
    'Use a modal instead of a page for login',
    'Checkout never fails, but make it faster',
    'Make sure the cart does not throw',
  ]) assert.equal(routeCheck('bugfix', request).path, 'full', request)
  assert.deepEqual(routeCheck('bugfix', 'Checkout never fails').reasons, ['negated symptom'])
})

test('review fix: new-behaviour words match in upper case too', () => {
  assert.equal(routeCheck('refactor', 'EXTRACT A HELPER AND ADD CURRENCY').path, 'full')
})

test('review fix: an unquoted request (extra positionals) fails with usage, never quick', () => {
  const r = sdlc(makeRepo(), ['route-check', 'refactor', 'extract', 'helper', 'and', 'add', 'currency', 'support'])
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /usage: route-check/)
  assert.equal(r.stdout.includes('quick'), false)
})

test('review fix: the single-quoted form the skill prescribes runs nothing inside a shell', () => {
  const repo = makeRepo()
  const script = path.resolve(import.meta.dirname, 'sdlc.ts')
  const cmd = `node --disable-warning=ExperimentalWarning ${script} route-check bugfix '\`touch marker\` fails with a 500 $(touch marker2) it'\\''s bad'`
  const r = spawnSync('sh', ['-c', cmd], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /^route: quick/)
  assert.equal(fs.existsSync(path.join(repo, 'marker')), false)
  assert.equal(fs.existsSync(path.join(repo, 'marker2')), false)
})
