import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadPacks, parsePack, detectStacks, packRegistry, PACKS_DIR } from './stackpacks.ts'

const STACKS = ['node', 'angular', 'python', 'go', 'rust', 'java-maven', 'java-gradle', 'dotnet']

test('every shipped pack parses and is a valid registry', () => {
  const { packs, errors } = loadPacks(PACKS_DIR)
  assert.deepEqual(errors, [])
  assert.deepEqual(packs.map(p => p.stack).sort(), [...STACKS].sort())
  for (const p of packs) assert.equal(packRegistry(p).stack, p.stack)
})

test('every pack covers types, lint and unit, has a nightly mutation sensor, and adds test globs', () => {
  for (const p of loadPacks(PACKS_DIR).packs) {
    const ids = packRegistry(p).sensors.filter(s => !s.builtin).map(s => s.id)
    for (const need of ['types', 'lint', 'unit', 'mutation']) assert.ok(ids.includes(need), `${p.stack} lacks ${need}`)
    assert.equal(packRegistry(p).sensors.find(s => s.id === 'mutation')?.cadence, 'nightly', p.stack)
    assert.ok((p.paths.tests ?? []).length > 0, `${p.stack} has no test globs`)
  }
})

test('a pack may not declare built-ins, must name its file and must have markers', () => {
  const ok = { stack: 'x', markers: ['x.toml'], paths: {}, contracts: { files: [], validate: '', run: '' }, sensors: [] }
  assert.deepEqual(parsePack(JSON.stringify(ok), 'x.json').errors, [])
  assert.match(parsePack(JSON.stringify({ ...ok, stack: 'y' }), 'x.json').errors.join(), /stack "y" does not match file x.json/)
  assert.match(parsePack(JSON.stringify({ ...ok, markers: [] }), 'x.json').errors.join(), /markers must be a non-empty list/)
  assert.match(parsePack(JSON.stringify({ ...ok, sensors: [{ id: 'secrets', builtin: true }] }), 'x.json').errors.join(), /packs declare no built-in sensors/)
  assert.match(parsePack(JSON.stringify({ ...ok, sensors: [{ id: 'lint' }] }), 'x.json').errors.join(), /x.json: sensors\[0\]/)
})

test('detects stacks from marker files and globs, and returns all matches', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-stacks-'))
  const { packs } = loadPacks(PACKS_DIR)
  assert.deepEqual(detectStacks(root, packs), [])
  fs.writeFileSync(path.join(root, 'Shop.sln'), '')
  assert.deepEqual(detectStacks(root, packs), ['dotnet'])
  fs.writeFileSync(path.join(root, 'package.json'), '{}')
  fs.writeFileSync(path.join(root, 'angular.json'), '{}')
  assert.deepEqual(detectStacks(root, packs).sort(), ['angular', 'dotnet', 'node'])
})

test('a layers command that targets one test class passes when the class does not exist yet', () => {
  for (const p of loadPacks(PACKS_DIR).packs) {
    const cmd = packRegistry(p).sensors.find(s => s.id === 'layers')?.cmd ?? ''
    if (!/ArchitectureTest/.test(cmd)) continue
    assert.ok(/failIfNoSpecifiedTests=false|grep -rqs ArchitectureTest/.test(cmd), `${p.stack} layers fails in a repo without ArchitectureTest: ${cmd}`)
  }
})

test('the dotnet audit counts only vulnerable package rows, not its header', () => {
  const audit = packRegistry(loadPacks(PACKS_DIR).packs.find(p => p.stack === 'dotnet')!).sensors.find(s => s.id === 'audit')
  assert.equal(audit?.count, 'lines')
  assert.match(audit?.cmd ?? '', /\| grep '\^ \*>' \|\| true$/)
})
