// Harness readiness 4.3: every approval and waiver names its owner and shows its age, and the files that decide what a change is judged by
// have code owners (the person-level gate that replaces a "junior mode", which the tiers Non-Goal forbids).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { globToRegex } from './model.ts'
import { PROTECTED } from './sensors.ts'
import { buildReport, reportText } from './report.ts'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'

// A machine with no git identity and no OS user name.
const NOBODY = { SDLC_HUMAN: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', USER: '', USERNAME: '' }
const anonymous = (): string => { const repo = makeRepo(); gitIn(repo, 'config', '--unset', 'user.name'); return repo }

test('a waiver with no identifiable owner is refused, and --by names one', () => {
  const repo = anonymous()
  sdlc(repo, ['init'])
  sdlc(repo, ['new', 'wv', '--type', 'feature'])
  const refused = sdlc(repo, ['waive', 'size', '*', 'generated', '--slug', 'wv'], { env: NOBODY })
  assert.equal(refused.code, 1)
  assert.match(refused.stderr, /waivers need an owner: set git user\.name/)
  assert.equal(fs.existsSync(path.join(repo, '.rig/waivers.jsonl')), false, 'nothing was recorded')
  const ok = sdlc(repo, ['waive', 'size', '*', 'generated', '--slug', 'wv', '--by', 'Pat Lee'], { env: NOBODY })
  assert.equal(ok.code, 0, ok.stderr)
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, '.rig/waivers.jsonl'), 'utf8').trim()).by, 'Pat Lee')
})

test('an approval with no identifiable owner is refused too', () => {
  const repo = anonymous()
  sdlc(repo, ['init'])
  sdlc(repo, ['new', 'ap', '--type', 'feature'])
  write(repo, '.rig/changes/ap/spec.md', '# Spec\n\n## Behaviours\n- B1: it works\n\n## Open questions\nnone\n')
  write(repo, '.rig/changes/ap/plan.md', '# Plan\n\n## Files\n- src/\n\n## Open questions\nnone\n')
  const refused = sdlc(repo, ['approve', 'ap'], { env: NOBODY })
  assert.equal(refused.code, 1)
  assert.match(refused.stderr, /approvals need an owner/)
  assert.equal(fs.existsSync(path.join(repo, '.rig/changes/ap/approval.json')), false)
})

test('the sensors view shows who waived and how long ago, and calls an old waiver stale', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['new', 'wv', '--type', 'feature'])
  sdlc(repo, ['activate', 'wv'])
  const days = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString()
  write(repo, '.rig/waivers.jsonl', [
    { slug: 'wv', sensor: 'size', file: '*', reason: 'fresh one', by: 'Ann', at: days(2) },
    { slug: 'wv', sensor: 'secrets', file: 'a.js', reason: 'old one', by: 'Bo', at: days(45) },
  ].map(r => JSON.stringify(r)).join('\n') + '\n')
  const text = sdlc(repo, ['sensors']).stdout
  assert.match(text, /size \* fresh one \(by Ann, 2d\)/)
  assert.match(text, /secrets a\.js old one \(by Bo, 45d, stale: review it\)/)
})

test('rig report counts waivers with no owner and shows the oldest', () => {
  const repo = makeRepo()
  write(repo, '.rig/waivers.jsonl', [
    { slug: 'x', sensor: 'size', file: '*', reason: 'r', by: 'unknown', at: new Date(Date.now() - 12 * 86_400_000).toISOString() },
    { slug: 'x', sensor: 'size', file: '*', reason: 'r', by: 'Ann', at: new Date().toISOString() },
  ].map(r => JSON.stringify(r)).join('\n') + '\n')
  const r = buildReport(repo)
  assert.deepEqual(r.waiverRows, { unowned: 1, oldestDays: 12 })
  assert.match(reportText(r), /1 with no owner; oldest 12 day\(s\)/)
})

test('the CODEOWNERS template covers every protected path and nothing wider: ordinary change records need no owner review', () => {
  const lines = fs.readFileSync(path.resolve(import.meta.dirname, '../templates/CODEOWNERS'), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'))
  assert.ok(lines.every(l => /\s@\S+$/.test(l)), 'every line names an owner')
  // GitHub: a leading / anchors at the root, a trailing / is the whole directory, * stays inside one directory.
  const owned = lines.map(l => l.trim().split(/\s+/)[0] as string).map(p => globToRegex(p.replace(/^\//, '').replace(/\/$/, '/**')))
  const isOwned = (p: string): boolean => owned.some(re => re.test(p))
  for (const glob of PROTECTED) {
    const sample = glob.replace(/\*\*/g, 'x/y').replace(/\*/g, 'x')
    assert.ok(isOwned(sample), `no CODEOWNERS line covers ${glob} (e.g. ${sample})`)
  }
  for (const p of ['.rig/changes/add-login/spec.md', '.rig/changes/add-login/evidence/runs.jsonl', '.rig/product/brief.md', '.rig/wiki.json', 'src/app.js']) assert.ok(!isOwned(p), `${p} would need an owner review`)
})

test('an unreadable or missing waiver date counts as stale, and a stored "unknown" owner reads as no owner', () => {
  const repo = makeRepo()
  sdlc(repo, ['init'])
  sdlc(repo, ['new', 'wv', '--type', 'feature'])
  sdlc(repo, ['activate', 'wv'])
  write(repo, '.rig/waivers.jsonl', [{ slug: 'wv', sensor: 'size', file: '*', reason: 'no date', by: 'unknown' }].map(r => JSON.stringify(r)).join('\n') + '\n')
  const text = sdlc(repo, ['sensors']).stdout
  assert.match(text, /size \* no date \(by no owner, age unknown, stale: review it\)/)
  assert.match(reportText(buildReport(repo)), /1 with no owner; oldest age unknown/)
})

test('a generic OS account is not an owner, and --by is trimmed', () => {
  const repo = anonymous()
  sdlc(repo, ['init'])
  sdlc(repo, ['new', 'wv', '--type', 'feature'])
  for (const user of ['root', 'runner', 'Administrator']) {
    const r = sdlc(repo, ['waive', 'size', '*', 'x', '--slug', 'wv'], { env: { ...NOBODY, USER: user } })
    assert.equal(r.code, 1, user)
  }
  assert.equal(sdlc(repo, ['waive', 'size', '*', 'x', '--slug', 'wv', '--by', '  '], { env: NOBODY }).code, 1, 'a blank --by is nobody')
  assert.equal(sdlc(repo, ['waive', 'size', '*', 'x', '--slug', 'wv'], { env: { ...NOBODY, USER: 'pat' } }).code, 0, 'a real OS user is fine')
  const arch = sdlc(repo, ['arch', 'approve'], { env: { ...NOBODY, USER: 'root' } })
  assert.equal(arch.code, 1)
})
