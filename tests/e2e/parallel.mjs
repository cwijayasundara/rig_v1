// Two instances at once (the "many instances" question, harness readiness notes 2026-10-21): after the first change is merged, two
// independent changes run in two git worktrees of the same repo, each in its own process, at the same time, with the scripted
// model ($0). It finds out whether rig's state, hooks, branches and origin interfere. Run: node tests/e2e/parallel.mjs [--out DIR]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { createSandbox, PLUGIN } from './lib/sandbox.mjs'
import { Checks } from './lib/checks.mjs'
import { runChange } from './lib/flow.mjs'
import { mergeToMain } from './lib/merge.mjs'
import { scriptedDriver } from './driver/scripted.mjs'
import { PHASE as S2 } from './phases/s2-greenfield.mjs'
import { PHASE as S3 } from './phases/s3-delete.mjs'
import { ARMS } from '../../eval/arms.mjs'
import { setupRig } from '../../eval/setup.mjs'

const fx = rel => path.join(import.meta.dirname, 'fixtures/parallel', rel)
// An independent change: new files only, so it cannot conflict with the cart change.
export const SLUGIFY = {
  id: 'P1', slug: 'slugify', type: 'feature', title: 'A slugify helper',
  intent: { problem: 'Product names cannot be turned into URL parts.', outcome: 'B8 holds and the earlier behaviour is unchanged.', nonGoals: 'Unicode transliteration.' },
  spec: '# Spec: slugify\n\n## Behaviours\n- B8: slugify lowercases and hyphenates a product name.\n\n## Out of scope\n- Transliteration.\n\n## Open questions\nnone\n',
  plan: '# Plan: slugify\n\n## Files\n- src/util/slug.js\n- test/slug.test.js\n\n## Tests\n- B8: test/slug.test.js (unit)\n\n## Contracts\nnone\n\n## Verification\n- npm test\n\n## Open questions\nnone\n',
  contracts: [],
  tests: [{ src: fx('test/slug.test.js'), dest: 'test/slug.test.js' }],
  impl: [{ src: fx('src/util/slug.js'), dest: 'src/util/slug.js' }],
  commit: 'feat(util): slugify a product name',
}
const PHASES = { remove: S3, slugify: SLUGIFY }

// A sandbox-shaped handle for one worktree: the same commands, bound to its directory, with its own contract log.
function sandboxAt(base, dir, name) {
  const logs = path.join(base.root, `logs-${name}`)
  fs.mkdirSync(logs, { recursive: true })
  const env = { ...base.env, CONTRACT_LOG: path.join(logs, 'contract.log'), TMPDIR: path.join(dir, '.tmp') }
  fs.mkdirSync(env.TMPDIR, { recursive: true })
  const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts, env: { ...env, ...opts.env } })
  const git = (...args) => { const r = run('git', args); if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim()}`); return r.stdout.trim() }
  return {
    ...base, dir, env, run, git,
    file: rel => path.join(dir, rel),
    read: rel => (fs.existsSync(path.join(dir, rel)) ? fs.readFileSync(path.join(dir, rel), 'utf8') : ''),
    write(rel, text) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text) },
    sdlc(args, { human = false } = {}) { return run('node', ['--disable-warning=ExperimentalWarning', path.join(dir, '.rig/bin/sdlc.ts'), ...args], { env: { CLAUDE_PROJECT_DIR: dir, ...(human ? { SDLC_HUMAN: '1' } : {}) } }) },
  }
}

// ---------- worker: one instance, in its own process ----------
if (process.argv[2] === '--worker') {
  const [, , , dir, phaseName, root] = process.argv
  const base = { root, env: JSON.parse(process.env.RIG_PARALLEL_ENV) }
  const sb = sandboxAt(base, dir, phaseName)
  const phase = PHASES[phaseName]
  try {
    const { slug } = await runChange(sb, phase, scriptedDriver(sb, phase))
    console.log(JSON.stringify({ ok: true, slug }))
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: String(e.message).split('\n')[0] }))
    process.exitCode = 1
  }
  process.exit()
}

// ---------- the experiment ----------
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const out = path.resolve(arg('out', fs.mkdtempSync(path.join(os.tmpdir(), 'rig-parallel-'))))
const c = new Checks('parallel instances')
const sb = createSandbox({ name: 'parallel', out })
await setupRig(sb, ARMS.find(a => a.id === 'haiku-rig'), { dry: true })
for (const phase of [S2]) { const { slug } = await runChange(sb, phase, scriptedDriver(sb, phase)); mergeToMain(sb, slug) }
sb.git('checkout', '-q', 'main')

const worktrees = {}
for (const name of Object.keys(PHASES)) {
  const dir = path.join(sb.root, `wt-${name}`)
  sb.git('worktree', 'add', '-q', '-b', `wip-${name}`, dir, 'main')
  worktrees[name] = dir
}
const runWorker = name => new Promise(resolve => {
  const child = spawn('node', ['--disable-warning=ExperimentalWarning', import.meta.filename, '--worker', worktrees[name], name, sb.root], { env: { ...process.env, RIG_PARALLEL_ENV: JSON.stringify(sb.env) }, stdio: ['ignore', 'pipe', 'pipe'] })
  let text = ''
  child.stdout.on('data', d => { text += d })
  child.stderr.on('data', d => { text += d })
  child.on('close', code => resolve({ name, code, text: text.trim() }))
})
const t0 = Date.now()
const results = await Promise.all(Object.keys(PHASES).map(runWorker))
const verdict = r => { try { return JSON.parse(r.text.split('\n').at(-1)) } catch { return { ok: false, error: r.text.slice(-300) } } }

for (const r of results) {
  const v = verdict(r)
  await c.check(`${r.name}: its instance ran start to PR in its own worktree`, () => (r.code === 0 && v.ok) || `exit ${r.code}: ${v.error}`)
  const wt = sandboxAt(sb, worktrees[r.name], r.name)
  await c.check(`${r.name}: its verify.json passes`, () => { try { return JSON.parse(wt.read(`.rig/changes/${PHASES[r.name].slug}/verify.json`)).pass === true || 'verify failed' } catch { return 'no verify.json' } })
}
for (const [a, b] of [['remove', 'slugify'], ['slugify', 'remove']]) {
  await c.check(`${a}'s worktree holds no trace of ${b}'s change`, () => !fs.existsSync(path.join(worktrees[a], '.rig/changes', PHASES[b].slug)) || `${b}'s change folder leaked into ${a}'s worktree`)
}
// Both branches reached the shared origin, and merge into main without conflict.
const branches = sb.git('ls-remote', '--heads', 'origin').split('\n').map(l => l.split('\t')[1])
for (const name of Object.keys(PHASES)) await c.check(`origin has sdlc/${PHASES[name].slug}`, () => branches.includes(`refs/heads/sdlc/${PHASES[name].slug}`) || `origin heads: ${branches.join(', ')}`)
for (const name of Object.keys(PHASES)) {
  await c.check(`sdlc/${PHASES[name].slug} merges into main`, () => { const r = sb.run('git', ['merge', '--no-ff', '-q', '-m', `merge ${name}`, `sdlc/${PHASES[name].slug}`]); return r.status === 0 || `${(r.stderr || r.stdout).trim().split('\n')[0]}` })
}
await c.check('main passes npm test with both changes merged', () => { const r = sb.run('npm', ['test', '--silent']); return r.status === 0 || (r.stdout + r.stderr).trim().split('\n').slice(-3).join(' | ') })
await c.check('main has both change records', () => ['remove', 'slugify'].every(n => sb.exists(`.rig/changes/${PHASES[n].slug}/pr.md`)) || 'a change record is missing')
console.log(`two instances, ${((Date.now() - t0) / 1000).toFixed(1)} s, sandbox ${sb.root}`)
c.print()
if (c.failed.length) process.exitCode = 1
