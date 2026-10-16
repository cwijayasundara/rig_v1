import fs from 'node:fs'
import path from 'node:path'
import { Checks } from '../lib/checks.mjs'
import { PLUGIN } from '../lib/sandbox.mjs'

const WIKI = path.join(PLUGIN, 'brain/code_wiki/wiki.ts')
const wiki = (sb, cmd, extra = []) => sb.run('node', ['--disable-warning=ExperimentalWarning', WIKI, cmd, '--root', sb.dir, ...extra])

// The code wiki (rig-brain's indexer, run directly as /rig:init does for a greenfield repo) and the eval loop:
// evals are seeded from the shipped changes, parsed, and — live only, with --live-evals — actually executed.
export async function runWikiEvals(sb, { live = false, liveEvals = false } = {}) {
  const c = new Checks('S5 wiki and evals')
  const idx = wiki(sb, 'index')
  await c.check('wiki: the indexer finds the shop modules', () =>
    (idx.status === 0 && /\d+ modules/.test(idx.stdout)) || `exit ${idx.status}: ${(idx.stderr || idx.stdout).trim().split('\n')[0]}`)
  const applied = wiki(sb, 'apply')
  await c.check('wiki: apply writes the wiki without problems', () =>
    (applied.status === 0 && !/^problem /m.test(applied.stdout)) || (applied.stdout || applied.stderr).trim().split('\n').slice(0, 2).join(' | '))
  await c.check('wiki: INDEX.md and architecture.md exist under .rig/wiki', () =>
    (sb.exists('.rig/wiki/INDEX.md') && sb.exists('.rig/wiki/architecture.md')) || 'wiki pages missing')
  const found = wiki(sb, 'find', ['remove'])
  await c.check('wiki: find locates the remove behaviour added by the S3 change', () =>
    /remove/i.test(found.stdout) || `find printed: ${found.stdout.trim().split('\n')[0]}`)
  const st = wiki(sb, 'status')
  await c.check('wiki: status reports the rig version it found', () => /rig:/.test(st.stdout) || st.stdout.trim().split('\n')[0])

  const seed = sb.sdlc(['evals', '--seed'])
  await c.check('evals: seeding from the shipped changes succeeds', () =>
    seed.status === 0 || `exit ${seed.status}: ${(seed.stderr || seed.stdout).trim().split('\n')[0]}`)
  await c.check('evals: at least one eval was drafted from a shipped change', () => {
    const dir = sb.file('.rig/evals')
    return (fs.existsSync(dir) && fs.readdirSync(dir).some(f => f.endsWith('.json'))) || 'no .rig/evals/*.json'
  })
  await c.check('evals: every drafted eval parses and names a command check', () => {
    const dir = sb.file('.rig/evals')
    if (!fs.existsSync(dir)) return 'no evals dir'
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json'))) {
      const e = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
      if (!e.prompt || !e.checks?.some(x => x.kind === 'command')) return `${f}: no prompt or command check`
    }
    return true
  })
  if (live && liveEvals) {
    const run = sb.sdlc(['evals'])
    await c.check('evals (live): executing the evals passes', () =>
      (run.status === 0 && !/verdict: fail/.test(run.stdout)) || `exit ${run.status}: ${(run.stdout || run.stderr).trim().split('\n').slice(-2).join(' | ')}`)
  }
  return c
}
