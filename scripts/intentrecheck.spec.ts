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

test('a recorded scenario command that now fails proposes one intent, once, and the change record is untouched', () => {
  write(repo, 'check.mjs', 'process.exit(1)\n')
  const before = snapshot()
  const first = recheck()
  assert.equal(first.code, 0)
  assert.equal(first.proposed.length, 1)
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
