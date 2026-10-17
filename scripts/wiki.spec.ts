// `sdlc.ts wiki`: init, build, status, verify, refresh (wiki design 2026-10-17), in a throwaway git repo with a scripted Runner.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, write, sdlc, gitIn } from './testkit.ts'
import { wikiCommand } from './wiki.ts'
import type { Runner } from './wikigen.ts'

const A = 'export function f(a: number): number {\n  return a\n}\nexport function g(a: number): number {\n  return a * 2\n}\n'
const B = 'export function h(): number {\n  return 1\n}\n'
const CONFIG = { notes: [], pages: [{ title: 'Alpha', purpose: 'The a module.', paths: ['src/a.ts'] }, { title: 'Beta', purpose: 'The b module.', paths: ['src/b.ts'] }] }

function repoWithSources(): string {
  const repo = makeRepo()
  write(repo, 'src/a.ts', A)
  write(repo, 'src/b.ts', B)
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'sources')
  return repo
}

// Answers plan, write and review from the prompt alone: a valid cited page per title, every claim supported.
function fake(): { run: Runner; calls: { role: string; prompt: string }[] } {
  const calls: { role: string; prompt: string }[] = []
  const run: Runner = ({ role, prompt }) => {
    calls.push({ role, prompt })
    if (role === 'plan') return { text: JSON.stringify(CONFIG), usd: 0.01 }
    if (role === 'review') return { text: JSON.stringify([...prompt.matchAll(/^(\d+): /gm)].map(m => ({ line: Number(m[1]), verdict: 'supported' }))), usd: 0.01 }
    const title = /Page title: (.+)/.exec(prompt)?.[1]
    const body = title === 'Alpha' ? '- Passes through. [src/a.ts#f]\n- Doubles. [src/a.ts#g]' : '- Returns one. [src/b.ts#h]'
    return { text: `# ${title}\n\n> purpose\n\n${body}\n`, usd: 0.01 }
  }
  return { run, calls }
}
const cmd = (repo: string, argv: string[], run: Runner) => {
  const pos = argv.filter(a => !a.startsWith('--'))
  const opt: Record<string, string | true> = {}
  argv.forEach((a, i) => { if (a.startsWith('--')) opt[a.slice(2)] = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[i + 1]! : true })
  return wikiCommand(repo, { pos: pos.filter(p => p !== opt['max-usd'] && p !== opt.page), opt }, run)
}
const built = (): { repo: string; run: Runner; calls: { role: string; prompt: string }[] } => {
  const repo = repoWithSources()
  const { run, calls } = fake()
  write(repo, '.rig/wiki.json', JSON.stringify(CONFIG))
  assert.equal(cmd(repo, ['build'], run).code, 0)
  calls.length = 0
  return { repo, run, calls }
}

test('init writes a parseable wiki.json from the planner and refuses to overwrite one', () => {
  const repo = repoWithSources()
  const { run } = fake()
  const first = cmd(repo, ['init'], run)
  assert.equal(first.code, 0, first.text)
  assert.match(first.text, /wiki build/)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo, '.rig/wiki.json'), 'utf8')).pages.length, 2)
  assert.notEqual(cmd(repo, ['init'], run).code, 0)
})

test('build needs a wiki.json and says so', () => {
  const r = cmd(repoWithSources(), ['build'], fake().run)
  assert.notEqual(r.code, 0)
  assert.match(r.text, /wiki\.json/)
})

test('build writes the pages, index and state; status then reports fresh', () => {
  const { repo, run } = built()
  for (const f of ['alpha.md', 'beta.md', 'index.md', 'state.json']) assert.ok(fs.existsSync(path.join(repo, '.rig/wiki', f)), f)
  assert.match(cmd(repo, ['status'], run).text, /wiki: fresh/)
})

test('editing one cited symbol makes only its page stale, and status writes nothing', () => {
  const { repo, run } = built()
  write(repo, 'src/a.ts', A.replace('a * 2', 'a * 3'))
  const before = gitIn(repo, 'status', '--porcelain')
  const r = cmd(repo, ['status'], run)
  assert.equal(r.code, 0, 'stale is a warning, never a failure')
  assert.match(r.text, /alpha: src\/a\.ts#g \(changed\)/)
  assert.doesNotMatch(r.text, /beta/)
  assert.match(r.text, /wiki: 1 stale page\(s\)/)
  assert.equal(gitIn(repo, 'status', '--porcelain'), before)
})

test('build --max-usd below the estimate stops before any model call', () => {
  const repo = repoWithSources()
  const { run, calls } = fake()
  write(repo, '.rig/wiki.json', JSON.stringify(CONFIG))
  const r = cmd(repo, ['build', '--max-usd', '0.000001'], run)
  assert.notEqual(r.code, 0)
  assert.match(r.text, /estimate/)
  assert.equal(calls.length, 0)
})

test('refresh rebuilds only the stale page, with the changed files in its hint, and leaves the wiki fresh', () => {
  const { repo, run, calls } = built()
  write(repo, 'src/a.ts', A.replace('a * 2', 'a * 3'))
  const r = cmd(repo, ['refresh'], run)
  assert.equal(r.code, 0, r.text)
  assert.deepEqual(calls.filter(c => c.role === 'write').map(c => /Page title: (.+)/.exec(c.prompt)?.[1]), ['Alpha'])
  assert.match(calls.find(c => c.role === 'write')!.prompt, /src\/a\.ts/)
  assert.match(cmd(repo, ['status'], run).text, /wiki: fresh/)
})

test('verify flags an uncited line without calling the model', () => {
  const { repo, run, calls } = built()
  assert.equal(cmd(repo, ['verify', '--no-review'], run).code, 0)
  fs.appendFileSync(path.join(repo, '.rig/wiki/alpha.md'), '- A claim with no citation.\n')
  const r = cmd(repo, ['verify', '--no-review'], run)
  assert.notEqual(r.code, 0)
  assert.match(r.text, /alpha:\d+ uncited/)
  assert.equal(calls.length, 0)
})

test('the sdlc entry point runs wiki status from the command line', () => {
  const { repo } = built()
  const r = sdlc(repo, ['wiki', 'status'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /wiki: fresh/)
  assert.notEqual(sdlc(repo, ['wiki', 'nonsense']).code, 0)
})

test('a runner that throws on one page keeps the pages already built, their state and the index', () => {
  const repo = repoWithSources()
  write(repo, '.rig/wiki.json', JSON.stringify(CONFIG))
  const { run } = fake()
  const flaky: Runner = req => { if (req.role === 'write' && /Page title: Beta/.test(req.prompt)) throw new Error('claude exited 1'); return run(req) }
  const r = cmd(repo, ['build'], flaky)
  assert.notEqual(r.code, 0)
  assert.match(r.text, /Beta: failed \(claude exited 1\)/)
  assert.ok(fs.existsSync(path.join(repo, '.rig/wiki/alpha.md')) && fs.existsSync(path.join(repo, '.rig/wiki/index.md')))
  assert.ok(JSON.parse(fs.readFileSync(path.join(repo, '.rig/wiki/state.json'), 'utf8')).pages.alpha)
  assert.match(cmd(repo, ['status'], run).text, /wiki: fresh/)
})

test('a state.json that is not a state does not crash status', () => {
  const { repo, run } = built()
  fs.writeFileSync(path.join(repo, '.rig/wiki/state.json'), '{}')
  const r = cmd(repo, ['status'], run)
  assert.equal(r.code, 0, r.text)
  assert.match(r.text, /stale page/)
})

test('a builtAt that looks like a git option is never passed to git', () => {
  const { repo, run } = built()
  const victim = path.join(repo, 'pwned.txt')
  const file = path.join(repo, '.rig/wiki/state.json')
  const state = JSON.parse(fs.readFileSync(file, 'utf8'))
  state.pages.alpha.builtAt = `--output=${victim}`
  fs.writeFileSync(file, JSON.stringify(state))
  write(repo, 'src/a.ts', A.replace('a * 2', 'a * 3'))
  cmd(repo, ['refresh'], run)
  assert.equal(fs.existsSync(victim), false)
})

test('a page removed from wiki.json is an orphan warning in status, not a stale page', () => {
  const { repo, run } = built()
  write(repo, '.rig/wiki.json', JSON.stringify({ pages: [CONFIG.pages[0]] }))
  write(repo, 'src/b.ts', B.replace('1', '2'))
  const r = cmd(repo, ['status'], run)
  assert.match(r.text, /warning: .*beta\.md is not in/)
  assert.doesNotMatch(r.text, /beta:/)
  assert.match(r.text, /wiki: fresh/)
})
