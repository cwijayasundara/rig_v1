// proof per behaviour (W2 N1): every behaviour is named by a holdout case or an approved journey, as well as by a test.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { makeRepo, sdlc, write, gitIn, registry } from './testkit.ts'
import { parseRegistry } from './registry.ts'
import { prBody } from './prbody.ts'

let repo: string
const SPEC = '# Spec\n\n## Behaviours\n- B1: the thing works (FR-1)\n- B2: the other thing works (FR-2)\n\n## Open questions\nnone\n'
const INTENT = '---\nslug: demo\ntype: feature\nsprint: 1\n---\n# demo\n\n## Intent\n\n## Open questions\nnone\n'
const HEAD = '| ID | Requirement | Intent | Behaviour | Level | Data | Expected | Access |\n|---|---|---|---|---|---|---|---|\n'
const cases = (...rows: string[]) => write(repo, '.rig/product/sprints/sprint-1/testplan/cases.md', `# Cases\n\n${HEAD}${rows.join('\n')}\n`)
const row = (id: string, slug: string, b: string, level: string) => `| ${id} | FR-1 | ${slug} | ${b} | ${level} | - | it works | - |`
const setup = (proof?: string) => {
  write(repo, '.rig/sensors.json', registry({ extra: { gates: { plan: false }, ...(proof ? { proof } : {}) } }))
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'cfg')
  sdlc(repo, ['new', 'demo'])
  write(repo, '.rig/changes/demo/intent.md', INTENT)
  write(repo, '.rig/changes/demo/spec.md', SPEC)
}
const driver = (note: string) => `// ${note}\nimport fs from 'node:fs'; import path from 'node:path'\nfs.writeFileSync(path.join(process.env.RIG_VERIFY_STATE, 'evidence.json'), JSON.stringify({ ok: true, steps: ['s'] }))\n`
const journey = (note: string) => {
  write(repo, '.rig/verify/shop/app.json', JSON.stringify({ run: 'node .rig/verify/shop/driver.mjs', files: ['driver.mjs'] }))
  write(repo, '.rig/verify/shop/driver.mjs', driver(note))
  write(repo, '.rig/verify/lib.mjs', 'export {}\n')
  const r = sdlc(repo, ['app', 'approve', 'shop'], { env: { SDLC_HUMAN: '1' } })
  assert.equal(r.code, 0, r.stdout + r.stderr)
}
const verify = () => sdlc(repo, ['verify', 'demo'])
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']); gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'rig') })

test('a behaviour with only a unit test gives a proof warn', () => {
  setup(); cases(row('TC-1', 'demo', 'B1', 'unit'), row('TC-2', 'demo', 'B2', 'unit'))
  journey('names no behaviour')
  const r = verify()
  assert.match(r.stdout, /warn: .*proof 2/)
  assert.doesNotMatch(r.stdout, /✗ B\d is proved/)
})

test('a holdout row naming B1 proves B1', () => {
  setup(); cases(row('TC-1', 'demo', 'B1', 'holdout'), row('TC-2', 'demo', 'B2', 'unit'))
  const r = verify()
  assert.match(r.stdout, /warn: .*proof 1\b/)
})

test('a current journey naming B2 proves B2; a stale one does not', () => {
  setup(); cases(row('TC-1', 'demo', 'B1', 'holdout'))
  journey('covers B2')
  assert.doesNotMatch(verify().stdout, /[ (]proof \d/)
  write(repo, '.rig/verify/shop/driver.mjs', driver('covers B2, edited after approval'))
  assert.match(verify().stdout, /proof 1\b/)
})

test('no app.json and no holdout: exempt, no finding', () => {
  setup(); cases(row('TC-1', 'demo', 'B1', 'unit'))
  const r = verify()
  assert.doesNotMatch(r.stdout, /is proved only/)
})

test('proof: block makes it a block at ship', () => {
  setup('block'); cases(row('TC-1', 'demo', 'B1', 'holdout'))
  const r = verify()
  assert.equal(r.code, 1)
  assert.match(r.stdout, /✗ B2 is proved only by unit tests/)
})

test('registry rejects proof: "x"', () => {
  assert.ok(parseRegistry(JSON.stringify({ sensors: [], proof: 'x' })).errors.some(e => /proof/.test(e)))
  const ok = parseRegistry(JSON.stringify({ sensors: [], proof: 'block' }))
  assert.equal(ok.registry.proof, 'block'); assert.equal(parseRegistry('{}').registry.proof, 'warn')
})

test('PR body lists unproved ids', () => {
  const base = { intent: INTENT, spec: SPEC, plan: '# Plan\n', verify: null, outline: '', review: 'reviewer: a\n', risk: { tier: 0 as const, reasons: [] } }
  const b = prBody({ ...base, proof: { ids: ['B2'], exempt: null } })
  assert.match(b, /## What the checks would miss[\s\S]*B2 is proved only by unit tests/)
  assert.match(prBody({ ...base, proof: { ids: [], exempt: 'no app.json and no holdout cases for this change' } }), /## What the checks would miss[\s\S]*proof: exempt, no app\.json and no holdout cases for this change/)
})
