// A public repo pinned by tag and sha, cloned once into a cache (with its dependencies installed) and copied into each sandbox.
// A sha that is not the pinned one is an error, never a run on different code. Nothing of the upstream is ever committed to this repo.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20, ...opts }).trim()
export const DEFAULT_CACHE = path.join(os.homedir(), '.cache', 'rig-eval')

// The marker names the sha the directory holds; a directory is reused only when it says the pinned one.
const MARKER = '.rig-eval-ready'
const readyOk = (dir, sha) => { try { return fs.readFileSync(path.join(dir, MARKER), 'utf8').trim() === sha } catch { return false } }
const taken = e => e?.code === 'ENOTEMPTY' || e?.code === 'EEXIST'

// -> the directory of the verified clone. install: false skips `npm ci` (a spec on a fixture repo has no lockfile).
// Two processes on a cold cache each build their own partial directory; the one that renames second finds the dir taken and uses it when it is ready.
// beforeRename is a seam for a spec that plays the other process.
export function cloneUpstream({ url, tag, sha, name, cacheDir = DEFAULT_CACHE, install = true, beforeRename }) {
  const dir = path.join(cacheDir, `${name}-${sha.slice(0, 7)}`)
  if (readyOk(dir, sha)) return dir
  fs.mkdirSync(cacheDir, { recursive: true })
  const tmp = `${dir}.partial-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  fs.rmSync(tmp, { recursive: true, force: true })
  try {
    run('git', ['clone', '-q', '--depth', '1', '--branch', tag, url, tmp])
    const head = run('git', ['-C', tmp, 'rev-parse', 'HEAD'])
    if (head !== sha) throw new Error(`upstream sha mismatch: ${url} at ${tag} is ${head}, pinned ${sha}`)
    if (install) run('npm', ['ci', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: tmp, timeout: 600_000 })
    fs.writeFileSync(path.join(tmp, MARKER), `${sha}\n`)
    beforeRename?.()
    try { fs.renameSync(tmp, dir) } catch (e) {
      if (!taken(e)) throw e
      if (readyOk(dir, sha)) return dir
      fs.rmSync(dir, { recursive: true, force: true }) // a stale or half-written directory, not the pinned one
      try { fs.renameSync(tmp, dir) } catch (e2) { if (taken(e2) && readyOk(dir, sha)) return dir; throw e2 }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  return dir
}

// Copy the clone (node_modules included, symlinks kept as they are) into the sandbox repo and commit it as its one base commit.
export function seedUpstream(sb, dir, message) {
  fs.cpSync(dir, sb.dir, {
    recursive: true, verbatimSymlinks: true, mode: fs.constants.COPYFILE_FICLONE,
    filter: src => { const b = path.basename(src); return b !== '.git' && b !== '.rig-eval-ready' },
  })
  sb.commitAll(message)
  return sb.git('rev-parse', 'HEAD')
}

// Whether the pinned clone can be had here: true when cached or when a clone and install succeed; the reason otherwise (a spec skips with it).
export function upstreamAvailable(opts) {
  try { cloneUpstream(opts); return true } catch (e) { return `upstream clone unavailable: ${String(e?.message ?? e).split('\n')[0]}` }
}
