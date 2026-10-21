// Readiness (harness readiness 4.1): a deterministic score from file and config checks; fixture repos land at the levels they should.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { score, type Criterion } from './readiness.ts'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'

const crit = (level: 1 | 2 | 3 | 4, oks: boolean[]): Criterion[] => oks.map((ok, i) => ({ level, id: `c${level}${i}`, what: 'w', fix: 'f', ok }))
const T = (n: number): boolean[] => Array(n).fill(true)

test('score: a level needs 80% of its own criteria and of every level below; a failed lower level caps the rest', () => {
  assert.equal(score([...crit(1, T(5)), ...crit(2, T(5)), ...crit(3, T(6)), ...crit(4, T(4))]).level, 4)
  assert.equal(score([...crit(1, T(5)), ...crit(2, T(5)), ...crit(3, [...T(5), false]), ...crit(4, T(4))]).level, 4, '5 of 6 is 83%: enough')
  assert.equal(score([...crit(1, T(5)), ...crit(2, [...T(3), false, false]), ...crit(3, T(6)), ...crit(4, T(4))]).level, 1, '3 of 5 is 60%: level 2 fails, and level 3 and 4 do not count above it')
  assert.equal(score([...crit(1, [...T(3), false, false]), ...crit(2, T(5))]).level, 0)
  assert.deepEqual(score(crit(1, T(5))).levels[0], { level: 1, passed: 5, total: 5, ratio: 1 })
})

const level = (repo: string): number => JSON.parse(sdlc(repo, ['readiness', '--json']).stdout).level
const failing = (repo: string): string[] => JSON.parse(sdlc(repo, ['readiness', '--json']).stdout).criteria.filter((c: Criterion) => !c.ok).map((c: Criterion) => c.id)

test('readiness: fixture repos land at the levels they should as they are made ready, step by step', () => {
  const repo = makeRepo()
  assert.equal(level(repo), 0, 'a bare repo with a README: rig is not initialised')
  assert.ok(failing(repo).includes('rig'))
  sdlc(repo, ['init', '--stack', 'node'])
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'rig')
  assert.equal(level(repo), 1, 'initialised, with the pack\'s unit, lint and types sensors')
  assert.deepEqual(failing(repo).filter(id => ['lint', 'types', 'unit'].includes(id)), [])
  // level 2: architecture, approved layers, review rules
  write(repo, '.rig/product/architecture.md', '# Architecture\n\n## Layers\n\n```rig-layers\nlayer domain src/domain/**\nlayer infra src/infra/**\nallow infra -> domain\n```\n')
  assert.equal(sdlc(repo, ['arch', 'approve'], { env: { SDLC_HUMAN: '1' } }).code, 0)
  fs.appendFileSync(path.join(repo, 'CLAUDE.md'), '\n## Review\n- Flag any API change the plan does not announce.\n')
  assert.equal(level(repo), 2)
  assert.ok(failing(repo).includes('ci') && failing(repo).includes('journeys'))
  // level 3: 5 of its 6 criteria is enough (no journeys)
  write(repo, '.github/workflows/rig-check.yml', 'name: rig-check\n')
  write(repo, 'CODEOWNERS', '/.rig/ @team\n')
  write(repo, '.rig/ratchets.json', '{ "duplication": 4 }\n')
  const reg = JSON.parse(fs.readFileSync(path.join(repo, '.rig/sensors.json'), 'utf8'))
  reg.contracts = { files: ['api/openapi.yaml'], covers: [], validate: '', run: '' }
  write(repo, '.rig/sensors.json', JSON.stringify(reg))
  assert.equal(sdlc(repo, ['vendor']).code, 0, 'the hooks run the vendored checker')
  assert.equal(sdlc(repo, ['hooks', 'install']).code, 0)
  assert.equal(level(repo), 3, 'ci, hooks, contracts, ratchets and codeowners: 5 of 6')
  assert.ok(failing(repo).includes('journeys'))
  // level 4
  write(repo, '.rig/lessons.md', '')
  write(repo, '.rig/wiki.json', '{}\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'ready', '--no-verify')
  sdlc(repo, ['maintain'])
  assert.equal(level(repo), 4)
})

test('readiness: an unowned waiver fails the waivers criterion; the answer is the same every run; --min-level sets the exit code', () => {
  const repo = makeRepo()
  sdlc(repo, ['init', '--stack', 'node'])
  assert.equal(failing(repo).includes('waivers'), false, 'no waivers: nothing wrong')
  write(repo, '.rig/waivers.jsonl', JSON.stringify({ slug: 'x', sensor: 'size', file: '*', reason: 'r', by: 'unknown', at: new Date().toISOString() }) + '\n')
  assert.ok(failing(repo).includes('waivers'))
  const a = sdlc(repo, ['readiness', '--json']).stdout, b = sdlc(repo, ['readiness', '--json']).stdout
  assert.equal(a, b, 'reproducible')
  assert.equal(sdlc(repo, ['readiness', '--min-level', '1']).code, 0)
  assert.equal(sdlc(repo, ['readiness', '--min-level', '3']).code, 1)
  const text = sdlc(repo, ['readiness']).stdout
  assert.match(text, /readiness level \d of 4/)
  assert.match(text, /L2 layers: the dependency layers are declared and a person approved them: `\/rig:arch`/)
})
