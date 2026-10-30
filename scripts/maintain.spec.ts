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

// ---------- review findings ----------
test('scan: migrations and numbered files, history and decision records, rig\'s own files and generated paths are not proposed or cited', () => {
  const found = scan({
    'db/migrations/0001_initial.py': 'x = 1\n', 'app/versions/abc.py': 'y = 1\n', 'src/12-seed.js': 'z\n', 'src/orphan.js': 'export const lonely = 1\n',
    'CHANGELOG.md': 'Removed `src/old/gone.js`.\n', 'docs/adr/0003.md': 'We dropped `src/legacy/thing.js`.\n', '.rig/maintain/proposals/dead-1-x.md': 'Cites `src/orphan.js` and `src/missing/a.js`.\n',
    'README.md': 'The bundle is `dist/app.js` and the state `.rig/state/x.json`.\n',
  }, never)
  assert.deepEqual(found.map(f => `${f.kind}:${f.files[0]}`), ['dead:src/orphan.js'], 'only the genuine orphan')
})

test('scan: a block shared by many files is boilerplate, not a duplicate', () => {
  const header = Array.from({ length: 10 }, (_, i) => `// header line number ${i} of the licence`).join('\n').replace(/\/\/ /g, 'const h = ')
  const files = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`src/f${i}.js`, `${header}\nexport const own${i} = ${i}\n`]))
  assert.deepEqual(scan(files, never).filter(f => f.kind === 'duplicate'), [])
})

test('maintain: its own proposals are not scanned, a lost seen.json never overwrites a proposal, and a broken one is an error', () => {
  const repo = garden()
  sdlc(repo, ['maintain'])
  const dir = path.join(repo, '.rig/maintain/proposals')
  const before = fs.readdirSync(dir).sort()
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'the proposals', '--no-verify')
  fs.rmSync(path.join(repo, '.rig/maintain/seen.json'))
  const again = JSON.parse(sdlc(repo, ['maintain', '--json']).stdout)
  assert.equal(again.proposed.length, 3, 'the same three findings, and nothing new from the proposals themselves')
  const after = fs.readdirSync(dir).sort()
  assert.equal(after.length, 6, 'numbered past the existing files')
  assert.deepEqual(after.filter(f => before.includes(f)), before, 'the first three are untouched')
  fs.writeFileSync(path.join(repo, '.rig/maintain/seen.json'), '{ nope')
  const broken = sdlc(repo, ['maintain'])
  assert.equal(broken.code, 1)
  assert.match(broken.stderr, /seen\.json is not valid JSON/)
})

test('maintain: a path with non-ASCII characters is scanned, not silently skipped', () => {
  const repo = makeRepo()
  write(repo, 'src/café.js', 'export const lonely = 1\n')
  write(repo, 'src/alpha.js', 'export const alpha = 1\n')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', 'accents')
  const r = JSON.parse(sdlc(repo, ['maintain', '--json']).stdout)
  assert.deepEqual(r.proposed.filter((p: { kind: string }) => p.kind === 'dead').map((p: { files: string[] }) => p.files[0]).sort(), ['src/alpha.js', 'src/café.js'])
})

test('the nightly workflow is off by default, stops while its pull request is open, and commits seen.json although git ignores it', () => {
  const yml = fs.readFileSync(path.join(import.meta.dirname, '..', 'templates', 'rig-maintain.yml'), 'utf8')
  assert.match(yml, /if: vars\.RIG_MAINTAIN == 'on'/, 'off until a person sets the variable')
  assert.match(yml, /startswith\("rig\/maintain-"\)/, 'one open maintain pull request at a time')
  assert.match(yml, /sdlc\.ts maintain --cap 5/, 'throttled')
  assert.match(yml, /git add -f \.rig\/maintain\/seen\.json/, 'a finding is proposed once: the dedupe memory is gitignored in a working tree')
  assert.match(yml, /shell: bash/, 'a failed scan is not hidden by tee (pipefail)')
  assert.match(yml, /--limit 1000/, 'the open-PR guard sees every open PR, not gh\'s default 30')
  assert.match(yml, /\$\{\{ github\.run_id \}\}/, 'a branch name never collides with an earlier day\'s leftover')
  assert.match(yml, /\|\| \{ git push origin --delete/, 'a pull request that cannot be created leaves no orphan branch')
  assert.doesNotMatch(yml, /--no-verify|pull_request:|auto-merge|gh pr merge/, 'a person merges; the run triggers nothing further')
})
