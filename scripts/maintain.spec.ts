// Maintain (harness readiness 3.1): planted dead code and a planted duplicate each yield a proposed intent; nothing is edited, and nothing repeats.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { scan } from './maintain.ts'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'

const block = (n: number, tag: string): string => Array.from({ length: n }, (_, i) => `  const step${i} = compute(${i}, '${tag}-shared')`).join('\n')
const fn = (name: string, body: string): string => `export function ${name}(x) {\n${body}\n  return x\n}\n`
const never = (): boolean => false

test('scan: two source files sharing a long block are a duplicate, and a short overlap is not', () => {
  const found = scan({ 'src/a.js': fn('a', block(16, 'q')), 'src/b.js': fn('b', block(16, 'q')) + 'export const own = 1\n', 'src/c.js': fn('c', block(3, 'q')) }, never)
  const dup = found.filter(f => f.kind === 'duplicate')
  assert.equal(dup.length, 1)
  assert.deepEqual(dup[0]?.files, ['src/a.js', 'src/b.js'])
  assert.match(dup[0]?.evidence ?? '', /src\/a\.js:\d+ and src\/b\.js:\d+ share \d+ overlapping 6-line windows/)
})

test('scan: a source file nothing else mentions is dead; one that is imported, an entry point or a test is not', () => {
  const found = scan({
    'src/used.js': 'export const used = 1\n', 'src/orphan.js': 'export const lonely = 1\n', 'src/index.js': "import { used } from './used.js'\n",
    'src/main.py': 'print(1)\n', 'src/orphan.test.js': 'test()\n', 'package.json': '{ "main": "src/index.js" }\n',
  }, f => f.endsWith('.test.js'))
  assert.deepEqual(found.filter(f => f.kind === 'dead').map(f => f.files[0]), ['src/orphan.js'])
})

test('scan: a doc citing a path that is not tracked has drifted; a path that exists, one relative to the doc, and a URL do not', () => {
  const found = scan({ 'src/real.js': 'export const real = 1\n', 'docs/guide.md': 'See `src/real.js`, `src/gone/old.js`, `../src/real.js` and https://x.dev/a/b.md and `docs/x/y.png`.\n', 'docs/x/y.png.md': '' }, never)
  const drift = found.filter(f => f.kind === 'drift')
  assert.equal(drift.length, 1)
  assert.match(drift[0]?.evidence ?? '', /Cites `src\/gone\/old\.js`/)
  assert.doesNotMatch(drift[0]?.evidence ?? '', /src\/real\.js/)
})

function garden(): string {
  const repo = makeRepo()
  write(repo, 'src/a.js', fn('a', block(16, 'q')))
  write(repo, 'src/b.js', fn('b', block(16, 'q')))
  write(repo, 'src/orphan.js', 'export const lonely = 1\n')
  write(repo, 'src/index.js', "import { a } from './a.js'\nimport { b } from './b.js'\nexport { a, b }\n")
  write(repo, 'README.md', '# x\n\nThe handler lives in `src/http/handler.js`.\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'a garden')
  return repo
}

test('maintain: the planted duplicate, dead file and stale doc each become a proposed intent, and nothing is edited', () => {
  const repo = garden()
  const before = gitIn(repo, 'status', '--porcelain')
  const r = sdlc(repo, ['maintain'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /proposed 3 intent\(s\)/)
  const dir = path.join(repo, '.rig/maintain/proposals')
  const files = fs.readdirSync(dir).sort()
  assert.deepEqual(files.map(f => f.split('-')[0]), ['dead', 'drift', 'duplicate'])
  const dead = fs.readFileSync(path.join(dir, files.find(f => f.startsWith('dead'))!), 'utf8')
  assert.match(dead, /^---\nkind: maintain\ntype: chore\nstatus: proposed\nfound: \d{4}-\d{2}-\d{2}\nscope: \[src\/orphan\.js\]\n---\n# Remove src\/orphan\.js, which nothing mentions/)
  assert.match(dead, /## Non-goals\n\nDo not change behaviour/)
  assert.match(dead, /\/rig:start dead-orphan/)
  const dup = fs.readFileSync(path.join(dir, files.find(f => f.startsWith('duplicate'))!), 'utf8')
  assert.match(dup, /scope: \[src\/a\.js, src\/b\.js\]/)
  assert.equal(gitIn(repo, 'ls-files', '--modified'), '', 'no tracked file was changed')
  assert.ok(before === '' || !before.includes('src/'), 'source untouched')
})

test('maintain: a finding is proposed once, and the cap holds the rest back for the next run', () => {
  const repo = garden()
  const first = JSON.parse(sdlc(repo, ['maintain', '--cap', '1', '--json']).stdout)
  assert.equal(first.proposed.length, 1)
  assert.equal(first.heldBack, 2)
  const second = JSON.parse(sdlc(repo, ['maintain', '--cap', '5', '--json']).stdout)
  assert.equal(second.proposed.length, 2, 'the two held back, not the one already proposed')
  assert.deepEqual(new Set([...first.proposed, ...second.proposed].map((p: { kind: string }) => p.kind)), new Set(['duplicate', 'dead', 'drift']))
  assert.match(sdlc(repo, ['maintain']).stdout, /nothing new to propose/)
})
