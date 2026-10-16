// Guides and sensors in sync (behavioural harness spec 2026-10-16 §5): the managed CLAUDE.md block and its four checks.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, hook, write, gitIn } from './testkit.ts'
import { renderLines, withBlock, findBlock, syncProblems } from './sync.ts'
import { parseRegistry } from './registry.ts'

const reg = (v: object) => parseRegistry(JSON.stringify({ sensors: [], ...v })).registry
const types = { id: 'types', cmd: 'tsc', cadence: 'turn', blocks: true, count: 'exit', guide: 'Code must compile before the turn ends.' }
const synced = (r = reg({ sensors: [types] }), team = '# Team notes\n') => withBlock(team, renderLines(r))
const problems = (claude: string, extra: Partial<{ brief: string; tests: string; errors: string[] }> = {}, r = reg({ sensors: [types] })) =>
  syncProblems({ registry: r, errors: [], claude, brief: '', tests: '', ...extra })

test('render: one line per enabled sensor, guide then [sensor:id]', () => {
  const lines = renderLines(reg({ sensors: [types, { id: 'size', builtin: true, enabled: false }] }))
  assert.equal(lines[0], '- Code must compile before the turn ends. [sensor:types]')
  assert.ok(!lines.some(l => l.endsWith('[sensor:size]')))
})

test('sync keeps team text byte for byte and a second sync changes nothing', () => {
  const team = '# Team notes\n\nKeep the API stable.\n'
  const once = synced(undefined, team)
  assert.ok(once.startsWith(team.trimEnd()))
  assert.equal(withBlock(once, renderLines(reg({ sensors: [types] }))), once)
  assert.deepEqual(problems(once), [])
})

test('check 1: a sensor with an empty guide is reported', () => {
  const p = parseRegistry(JSON.stringify({ sensors: [{ ...types, guide: '' }] }))
  assert.match(syncProblems({ registry: p.registry, errors: p.errors, claude: withBlock('', renderLines(p.registry)), brief: '', tests: '' }).join('\n'), /guide must be a non-empty sentence/)
})

test('check 2: a block line naming a sensor not in the registry is reported', () => {
  const r = reg({ sensors: [types, { ...types, id: 'lint', guide: 'Lint must pass.' }] })
  assert.match(problems(synced(r)).join('\n'), /sensor lint, which is not in \.rig\/sensors\.json/)
})

test('check 3: a hand edit inside the block breaks its hash', () => {
  const edited = synced().replace('Code must compile', 'Code should compile')
  assert.match(problems(edited).join('\n'), /edited by hand/)
})

test('a missing block and a stale block are both reported with "run rig sync"', () => {
  assert.match(problems('# Team notes\n').join('\n'), /no rig guides block: run rig sync/)
  const stale = withBlock('', renderLines(reg({ sensors: [{ ...types, guide: 'Old guide.' }] })))
  assert.match(problems(stale).join('\n'), /out of date[\s\S]*run rig sync/)
})

test('check 4: a brief behaviour with no test that names it is reported', () => {
  const brief = '# Brief\n\n## Behaviours\n- B1: list orders\n- B2: cancel an order\n'
  const p = problems(synced(), { brief, tests: "test('B1 lists orders', ...)" })
  assert.deepEqual(p, ['.rig/product/brief.md: B2 has no test that names it'])
})

test('findBlock reads the hash and the lines between the markers', () => {
  const b = findBlock(synced())
  assert.ok(b)
  assert.match(b.hash, /^[0-9a-f]{16}$/)
  assert.deepEqual(b.lines, renderLines(reg({ sensors: [types] })))
  assert.equal(b.lines[0], '- Code must compile before the turn ends. [sensor:types]')
})

// Integration: the CLI, the commit gate and SessionStart.
let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']) })
const commit = (v: object) => { write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [types], ...v })); gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'cfg') }

test('sdlc sync writes the block; sync --check passes after it and fails before it', () => {
  commit({})
  assert.equal(sdlc(repo, ['sync', '--check']).code, 1)
  assert.equal(sdlc(repo, ['sync']).code, 0)
  assert.match(fs.readFileSync(path.join(repo, 'CLAUDE.md'), 'utf8'), /\[sensor:types\]/)
  const r = sdlc(repo, ['sync', '--check'])
  assert.equal(r.code, 0, r.stdout)
})

test('the commit gate blocks on an out-of-sync block in a registry repo', () => {
  commit({})
  write(repo, 'src/a.js', 'export const a = 1\n')
  gitIn(repo, 'add', '.')
  const r = sdlc(repo, ['check', '--at', 'commit'])
  assert.match(r.stdout, /\[sync\][\s\S]*run rig sync/)
  assert.equal(r.code, 1)
})

test('SessionStart warns about an out-of-sync block without blocking', () => {
  commit({})
  const r = hook(repo, 'session-start', { session_id: 's1' })
  assert.equal(r.code, 0)
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /rig sync: .*no rig guides block/)
})

test('sync refuses a legacy config with a clear message', () => {
  write(repo, '.rig/sensors.json', JSON.stringify({ fast: { test: 'node -e 0' } }))
  const r = sdlc(repo, ['sync'])
  assert.notEqual(r.code, 0)
  assert.match(r.stderr + r.stdout, /registry-shaped/)
})

const TEMPLATE = fs.readFileSync(path.join(import.meta.dirname, '..', 'templates', 'brief.md'), 'utf8')

test('the brief template has the spec headings in order and passes sync --check as it stands', () => {
  const heads = [...TEMPLATE.matchAll(/^## (.+)$/gm)].map(m => m[1])
  assert.deepEqual(heads, ['Context and intent', 'Non-goals', 'Architecture', 'Constraints', 'Interfaces', 'Behaviours', 'Tests required'])
  assert.deepEqual(problems(synced(), { brief: TEMPLATE }), [])
})

test('init --stack writes the brief from the template and a guides block that passes sync --check', () => {
  write(repo, 'package.json', '{}\n')
  const r = sdlc(repo, ['init', '--stack'])
  assert.match(r.stdout, /wrote \.rig\/sensors\.json from the node pack/)
  assert.equal(fs.readFileSync(path.join(repo, '.rig/product/brief.md'), 'utf8'), TEMPLATE)
  const check = sdlc(repo, ['sync', '--check'])
  assert.equal(check.code, 0, check.stdout)
})

test('init --stack leaves an existing brief alone', () => {
  write(repo, 'package.json', '{}\n')
  write(repo, '.rig/product/brief.md', '# Ours\n')
  sdlc(repo, ['init', '--stack'])
  assert.equal(fs.readFileSync(path.join(repo, '.rig/product/brief.md'), 'utf8'), '# Ours\n')
})

test('a brief behaviour with no test warns at commit and in sync --check; it never blocks', () => {
  commit({ sensors: [] })
  sdlc(repo, ['sync'])
  write(repo, '.rig/product/brief.md', '# Brief\n\n## Behaviours\n- B1: lists orders\n- B2: cancels an order\n')
  write(repo, 'test/a.test.js', "// B1 lists orders\n")
  gitIn(repo, 'add', '.')
  const r = sdlc(repo, ['check', '--at', 'commit'])
  assert.equal(r.code, 0, r.stdout)
  assert.match(r.stdout, /B2 has no test/)
  const check = sdlc(repo, ['sync', '--check'])
  assert.equal(check.code, 0, check.stdout)
  assert.match(check.stdout, /B2 has no test/)
})

test('final review: the traceability guide names what blocks (the change spec), not the brief, which only warns', () => {
  const g = parseRegistry('').registry.sensors.find(s => s.id === 'traceability')?.guide ?? ''
  assert.match(g, /spec\.md/)
  assert.doesNotMatch(g, /^Every behaviour in the brief/)
})
