// Wave 3, item 2: shipped intent maps are rechecked; drift becomes one proposed intent, once, and no change record is touched.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'

const FIX = path.resolve(import.meta.dirname, '../eval/fixtures/intent-map')
const MAP = fs.readFileSync(path.join(FIX, 'login/intent-plan.md'), 'utf8').replace('## Not promised', '## Formal command\nnode formal.mjs\n\n## Not promised')
const CLAUSES = ['C2', 'C3', 'C7', 'C8', 'C9']
let repo: string
const change = (slug: string): string => `.rig/changes/${slug}`
const verdict = (extra: object[] = []): void => write(repo, 'verdict.json', JSON.stringify({ clauses: Object.fromEntries(CLAUSES.map(c => [c, true])), mutants: [...CLAUSES.map(c => ({ id: `m-${c}`, clause: c, holds: false })), ...extra] }))
const recheck = (): { code: number | null; proposed: { slug: string }[] } => { const r = sdlc(repo, ['intent-recheck', '--json']); return { code: r.code, proposed: r.code === 0 ? JSON.parse(r.stdout.trim()).proposed : [] } }
const snapshot = (): string => fs.readdirSync(path.join(repo, '.rig/changes'), { recursive: true }).sort().map(f => { const p = path.join(repo, '.rig/changes', String(f)); return fs.statSync(p).isFile() ? `${f}:${fs.readFileSync(p, 'utf8')}` : String(f) }).join('\n')

// A change that shipped: its map, its recorded results and its pr.md are on the trunk, and the world it was checked in still holds.
beforeEach(() => {
  repo = makeRepo()
  sdlc(repo, ['init'])
  write(repo, change('login') + '/intent-map.md', MAP)
  write(repo, change('login') + '/intent-results.json', JSON.stringify(Object.fromEntries(['E1', 'E2'].map(e => [e, { status: 'pass', command: 'node check.mjs', commit: 'abc1234', run: 'r1' }]))))
  write(repo, change('login') + '/pr.md', '# PR\n')
  write(repo, 'check.mjs', 'process.exit(0)\n')
  write(repo, 'formal.mjs', "import fs from 'node:fs'\nconsole.log(fs.readFileSync('verdict.json', 'utf8').trim())\n")
  verdict()
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'ship login')
})

test('a shipped change whose world still holds proposes nothing', () => {
  assert.deepEqual(recheck().proposed, [])
})

test('a recorded scenario command that now fails proposes an intent per scenario that runs it, once, and the change record is untouched', () => {
  write(repo, 'check.mjs', 'process.exit(1)\n')
  const before = snapshot()
  const first = recheck()
  assert.equal(first.code, 0)
  assert.equal(first.proposed.length, 2)
  assert.match(first.proposed[0]!.slug, /^recheck-1-login/)
  const file = path.join(repo, '.rig/maintain/proposals', `${first.proposed[0]!.slug}.md`)
  assert.match(fs.readFileSync(file, 'utf8'), /E1.*node check\.mjs.*now fails/s)
  assert.deepEqual(recheck().proposed, [])
  assert.equal(snapshot(), before)
})

test('a formal verdict that drifted (a planted bug now survives) proposes an intent', () => {
  verdict([{ id: 'm-late', clause: 'C2', holds: true }])
  assert.equal(recheck().proposed.length, 1)
})

test('a change that has not shipped is never rechecked, even when its checks fail', () => {
  fs.rmSync(path.join(repo, change('login'), 'pr.md'))
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'unship')
  write(repo, 'check.mjs', 'process.exit(1)\n')
  assert.deepEqual(recheck().proposed, [])
})

// Review fixes (wave 3): the proposal must not forbid the work, and the unattended step must be contained.
test('a recheck proposal does not scope the work to the frozen map or forbid touching what moved', () => {
  write(repo, 'check.mjs', 'process.exit(1)\n')
  const slug = recheck().proposed[0]!.slug
  const text = fs.readFileSync(path.join(repo, '.rig/maintain/proposals', `${slug}.md`), 'utf8')
  assert.match(text, /^scope: \[\]$/m)
  assert.doesNotMatch(text, /Do not touch files outside/)
  assert.match(text, /Do not edit the frozen intent map/)
})

test('the workflow step that runs recorded commands has no git credentials, its own timeout, and cannot sink the maintain proposals', () => {
  const yml = fs.readFileSync(path.resolve(import.meta.dirname, '../templates/rig-maintain.yml'), 'utf8')
  const step = yml.slice(yml.indexOf('- name: Recheck shipped intent maps'), yml.indexOf('- name: Open one pull request'))
  assert.match(step, /extraheader/)
  assert.match(step, /timeout-minutes: 10/)
  assert.match(step, /continue-on-error: true/)
  assert.match(step, /trap/)
})

// Follow-ups (wave 3 minors): one proposal per drifting scenario, a notice for a missing results file, slugs keep dots, and an empty property section is not drift.
test('each drifting scenario is its own proposal: E1 proposed earlier does not come back when E2 drifts too', () => {
  write(repo, change('login') + '/intent-results.json', JSON.stringify({ E1: { status: 'pass', command: 'node check.mjs', commit: 'abc1234', run: 'r1' }, E2: { status: 'pass', command: 'node check2.mjs', commit: 'abc1234', run: 'r2' } }))
  write(repo, 'check2.mjs', 'process.exit(0)\n')
  write(repo, 'check.mjs', 'process.exit(1)\n')
  assert.equal(recheck().proposed.length, 1)
  write(repo, 'check2.mjs', 'process.exit(1)\n')
  const next = recheck().proposed
  assert.equal(next.length, 1)
  const text = fs.readFileSync(path.join(repo, '.rig/maintain/proposals', `${next[0]!.slug}.md`), 'utf8')
  assert.match(text, /E2:/)
  assert.doesNotMatch(text, /E1:/)
})

test('a shipped map with scenarios but no results file says so on stderr, and the json on stdout stays clean', () => {
  fs.rmSync(path.join(repo, change('login'), 'intent-results.json'))
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'lose results')
  const r = sdlc(repo, ['intent-recheck', '--json'])
  assert.match(r.stderr, /login.*no intent-results\.json/)
  assert.deepEqual(JSON.parse(r.stdout.trim()).proposed, [])
})

test('a change slug with a dot keeps it in the proposal name, and an empty ## Property command section is not drift', () => {
  gitIn(repo, 'mv', change('login'), change('v2.1-api'))
  write(repo, change('v2.1-api') + '/intent-map.md', MAP.replace('## Not promised', '## Property command\n\n## Not promised'))
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'rename')
  assert.deepEqual(recheck().proposed, [])
  write(repo, 'check.mjs', 'process.exit(1)\n')
  assert.match(recheck().proposed[0]!.slug, /^recheck-1-v2-1-api/)
})
