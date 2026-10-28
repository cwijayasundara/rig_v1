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

test('a mutation-diff sensor runs before every PR on the change\'s own lines and blocks', () => {
  const packs = loadPacks(PACKS_DIR).packs.filter(p => packRegistry(p).sensors.some(s => s.id === 'mutation-diff'))
  assert.deepEqual(packs.map(p => p.stack).sort(), ['angular', 'node'])
  for (const p of packs) {
    const s = packRegistry(p).sensors.find(x => x.id === 'mutation-diff')
    assert.equal(s?.cadence, 'ci', p.stack)
    assert.equal(s?.blocks, true, p.stack)
    assert.match(s?.cmd ?? '', /\{changed-lines:[a-z,]+\}/, `${p.stack} mutates only the changed lines of source it can parse`)
    assert.match(s?.cmd ?? '', /is not installed[\s\S]*exit 1/, `${p.stack} fails loudly without the tool`)
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
  assert.match(audit?.cmd ?? '', /\| grep '\^ \*>' \|\| true$/)
})

import { packContracts } from './stackinit.ts'

test('Specmatic contract commands are blanked when java is missing, and init says why', () => {
  const c = { files: ['api/openapi.yaml'], covers: [], validate: 'npx -y specmatic@2.55.3 examples validate', run: 'npx -y specmatic@2.55.3 test' }
  assert.deepEqual(packContracts(c, true), { contracts: c, note: '' })
  const off = packContracts(c, false)
  assert.equal(off.contracts.validate, '')
  assert.equal(off.contracts.run, '')
  assert.deepEqual(off.contracts.files, ['api/openapi.yaml'], 'the files still freeze')
  assert.match(off.note, /java is not on PATH/)
  const own = { files: [], covers: [], validate: 'make contracts', run: '' }
  assert.deepEqual(packContracts(own, false), { contracts: own, note: '' }, 'a non-Specmatic command needs no java')
})

// shop_app 2026-10-27: the layers sensor exited 0 in silence with no .rig/gen config, and its committed evidence read as a pass.
test('a layers command guarded by a generated config says so when it enforces nothing', () => {
  for (const p of loadPacks(PACKS_DIR).packs) {
    const cmd = packRegistry(p).sensors.find(s => s.id === 'layers')?.cmd ?? ''
    if (!/^if \[ -f \.rig\/gen\//.test(cmd)) continue
    assert.match(cmd, /; else echo 'layers: not enforced here[^']*'; fi$/, `${p.stack} layers passes silently without its config: ${cmd}`)
  }
})

// pip-audit with no argument audits the machine's site-packages, not the project (shop_app 2026-10-27: unrelated local packages in the evidence).
test('the python audit names the project, never the whole environment', () => {
  const cmd = packRegistry(loadPacks(PACKS_DIR).packs.find(p => p.stack === 'python')!).sensors.find(s => s.id === 'audit')?.cmd ?? ''
  assert.match(cmd, /pip-audit -r requirements\.txt/)
  assert.match(cmd, /pip-audit \.;/)
  assert.doesNotMatch(cmd, /pip-audit(?! [-.])/, 'a bare pip-audit audits the environment')
  assert.match(cmd, /nothing to audit/)
})
