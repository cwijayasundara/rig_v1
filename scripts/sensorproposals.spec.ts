// rig:upgrade: propose new stack-pack sensors, never edit the team's.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { proposeSensors } from './upgrade.ts'
import { loadPacks, PACKS_DIR } from './stackpacks.ts'

const packs = loadPacks(PACKS_DIR).packs
const team = (sensors: unknown[], stack = 'node') => JSON.stringify({ stack, sensors })

test('proposeSensors: proposes a pack sensor the team lacks', () => {
  const ids = packs.find(p => p.stack === 'node')!.sensors.map(s => (s as { id: string }).id)
  assert.ok(ids.includes('types'))
  const got = proposeSensors(team(ids.filter(i => i !== 'types').map(id => ({ id, cmd: 'x' }))), packs)
  assert.equal(got?.stack, 'node')
  assert.deepEqual(got?.sensors.map(s => (s as { id: string }).id), ['types'])
})
test("proposeSensors: a team's changed lint command is not proposed or touched", () => {
  const ids = packs.find(p => p.stack === 'node')!.sensors.map(s => (s as { id: string }).id)
  const text = team(ids.map(id => ({ id, cmd: id === 'lint' ? 'my own lint' : 'x' })))
  assert.equal(proposeSensors(text, packs), null)
  const text2 = team(ids.filter(i => i !== 'types').map(id => ({ id, cmd: 'my own ' + id })))
  assert.ok(!proposeSensors(text2, packs)!.sensors.some(s => (s as { id: string }).id === 'lint'))
})
test('proposeSensors: old shape, unparseable, unknown stack and a covered registry are null', () => {
  assert.equal(proposeSensors('{"stack":"node","lint":"x"}', packs), null)
  assert.equal(proposeSensors('not json', packs), null)
  assert.equal(proposeSensors(team([], 'nope'), packs), null)
  const ids = packs.find(p => p.stack === 'node')!.sensors.map(s => (s as { id: string }).id)
  assert.equal(proposeSensors(team(ids.map(id => ({ id }))), packs), null)
})
test('proposeSensors: a sensor CI must install a tool for (Semgrep) is held back while the team workflow lacks it', () => {
  const ids = packs.find(p => p.stack === 'node')!.sensors.map(s => (s as { id: string }).id).filter(i => i !== 'sast')
  const reg = team(ids.map(id => ({ id })))
  const proposed = (wf: string | null) => proposeSensors(reg, packs, wf)
  assert.deepEqual(proposed('jobs: {}')?.held, ['sast'], 'an old workflow: held, and named')
  assert.ok(!proposed('jobs: {}')?.sensors.some(s => s.id === 'sast'), 'held sensors cannot be added')
  assert.deepEqual(proposed('run: pipx install semgrep==1.182.1')?.sensors.map(s => s.id), ['sast'])
  assert.deepEqual(proposed(null)?.sensors.map(s => s.id), ['sast'], 'no workflow: nothing in CI to break')
})
