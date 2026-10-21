import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { lastNumber, loadRatchets, judge } from './counts.ts'
import { weakensRegistry } from './registry.ts'
import { makeRepo, sdlc, write, gitIn, registry } from './testkit.ts'

test('lastNumber reads the last line, and nothing else counts', () => {
  assert.equal(lastNumber('warming up\n4.25\n'), 4.25)
  assert.equal(lastNumber('12'), 12)
  assert.equal(lastNumber('done: 3 issues'), null)
  assert.equal(lastNumber(''), null)
})

test('judge: worse only beyond noise, in the sensor\'s direction', () => {
  assert.deepEqual([judge('down', 5, 4), judge('down', 3, 4), judge('down', 4 + 1e-12, 4)], ['worse', 'better', 'same'])
  assert.deepEqual([judge('up', 70, 80), judge('up', 90, 80)], ['worse', 'better'])
})

test('loadRatchets keeps numbers and ignores a broken file', () => {
  assert.deepEqual(loadRatchets('{ "dup": 4, "x": "no" }'), { dup: 4 })
  assert.deepEqual(loadRatchets('{ nope'), {})
})

test('weakensRegistry: dropping or flipping a ratchet is a weakening', () => {
  const reg = (extra: object): string => registry({ extra: { sensors: [{ id: 'dup', cmd: 'cat m', cadence: 'commit', blocks: true, guide: 'g', ...extra }] } })
  assert.match(weakensRegistry(reg({ ratchet: 'down' }), reg({})).join(), /dup no longer ratchets/)
  assert.match(weakensRegistry(reg({ ratchet: 'down' }), reg({ ratchet: 'up' })).join(), /ratchet turned from down to up/)
  assert.deepEqual(weakensRegistry(reg({ ratchet: 'down' }), reg({ ratchet: 'down' })), [])
})

let repo: string
const metric = (n: number | string): void => write(repo, 'metric.txt', `${n}\n`)
const baselines = (): Record<string, number> => JSON.parse(fs.readFileSync(path.join(repo, '.rig/ratchets.json'), 'utf8'))
const ship = () => sdlc(repo, ['check', '--at', 'ship', '--base', 'main'])
const setup = (sensor: object = {}): void => {
  repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, '.rig/sensors.json', registry({ extra: { sensors: [{ id: 'dup', cmd: 'cat metric.txt', cadence: 'commit', blocks: true, ratchet: 'down', guide: 'Do not copy code.', ...sensor }] } }))
  sdlc(repo, ['sync'])
  metric(10)
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'base')
  gitIn(repo, 'checkout', '-qb', 'pr')
}
beforeEach(() => setup())

test('ratchet: the first value becomes the baseline and passes', () => {
  const r = ship()
  assert.equal(r.code, 0, r.stdout)
  assert.deepEqual(baselines(), { dup: 10 })
})

test('ratchet: a rise past the baseline blocks, with the numbers and the way out', () => {
  ship()
  metric(12)
  const r = ship()
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[dup\][\s\S]*dup regressed: 12, baseline 10 \(lower is better\)[\s\S]*only a person raises a baseline/)
  assert.deepEqual(baselines(), { dup: 10 }, 'a regression never moves the baseline')
})

test('ratchet: an improvement tightens the baseline, and the old value then blocks', () => {
  ship()
  metric(8)
  assert.equal(ship().code, 0)
  assert.deepEqual(baselines(), { dup: 8 })
  metric(9)
  assert.equal(ship().code, 1, '9 is better than where it started and worse than where it now is')
})

test('ratchet: at commit the tightened baseline is staged with the commit', () => {
  gitIn(repo, 'commit', '--allow-empty', '-qm', 'x')
  write(repo, 'a.txt', 'a\n')
  gitIn(repo, 'add', 'a.txt')
  const r = sdlc(repo, ['check', '--at', 'commit'])
  assert.equal(r.code, 0, r.stdout)
  assert.match(gitIn(repo, 'diff', '--cached', '--name-only'), /\.rig\/ratchets\.json/)
})

test('ratchet: CI judges against the base branch\'s baseline, so a PR cannot raise its own', () => {
  gitIn(repo, 'checkout', '-q', 'main')
  write(repo, '.rig/ratchets.json', '{ "dup": 10 }\n')
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'baseline')
  gitIn(repo, 'checkout', '-q', 'pr')
  gitIn(repo, 'rebase', '-q', 'main')
  metric(50)
  write(repo, '.rig/ratchets.json', '{ "dup": 99 }\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'pr raises its own baseline')
  const ci = sdlc(repo, ['check', '--at', 'ci', '--base', 'main', '--config-from', 'main'])
  assert.equal(ci.code, 1, ci.stdout)
  assert.match(ci.stdout, /dup regressed: 50, baseline 10/)
  assert.deepEqual(baselines(), { dup: 99 }, 'CI wrote nothing')
})

test('ratchet: a command that prints no number is a finding, not a pass', () => {
  metric('many')
  const r = ship()
  assert.equal(r.code, 1)
  assert.match(r.stdout, /dup is a ratchet but printed no number/)
})

test('ratchet: "up" blocks a fall, and an advisory ratchet only warns', () => {
  setup({ ratchet: 'up' })
  ship()
  metric(7)
  assert.equal(ship().code, 1)
  setup({ ratchet: 'up', blocks: false })
  ship()
  metric(7)
  const r = sdlc(repo, ['check', '--at', 'ship', '--base', 'main', '--json'])
  assert.equal(r.code, 0)
  const f = JSON.parse(r.stdout).findings.find((x: { sensor: string }) => x.sensor === 'dup')
  assert.deepEqual([f.severity, /dup regressed: 7, baseline 10 \(higher is better\)/.test(f.message)], ['warn', true])
})

test('ratchet: the sensors view lists the baselines', () => {
  ship()
  assert.match(sdlc(repo, ['sensors']).stdout, /ratchets: dup 10/)
})
