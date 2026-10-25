// A throwaway repo for one lane: git on main, a local bare repo as origin, a stub gh on PATH, and settings that keep the
// person's own plugins out, so the run sees what a teammate's clone sees.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { cleanClaudeEnv } from '../../../scripts/model.ts'

export const PLUGIN = path.resolve(import.meta.dirname, '../../..')

// The runner's own test or CI context must not leak into the sandbox's commands.
const { NODE_TEST_CONTEXT: _n, GITHUB_EVENT_PATH: _e, GITHUB_STEP_SUMMARY: _s, CLAUDE_PROJECT_DIR: _p, SDLC_HUMAN: _h, ...RUNNER_ENV } = process.env
// Nor the runner's own Claude Code session (its id, scratchpad, entrypoint): an inner claude must start as a teammate's would.
const CLEAN_ENV = cleanClaudeEnv(RUNNER_ENV)

// Every plugin installed for this person, so the sandbox can switch each off. Empty when the CLI is absent.
export function installedPlugins() {
  try {
    const list = JSON.parse(execFileSync('claude', ['plugin', 'list', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
    return [...new Set(list.map(p => p.id).filter(Boolean))]
  } catch {
    return []
  }
}

// The methods of a sandbox, all bound to `dir` and `env` (env is read live, so a caller may still add to it).
export function bindSandbox({ name, root, dir, origin, bin, logs, env }) {
  const run = (cmd, args, opts = {}) =>
    spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts, env: { ...env, ...opts.env } })
  const git = (...args) => {
    const r = run('git', args)
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim()}`)
    return r.stdout.trim()
  }
  const sb = {
    name, root, dir, origin, bin, logs, env, run, git,
    file: rel => path.join(dir, rel),
    read: rel => (fs.existsSync(path.join(dir, rel)) ? fs.readFileSync(path.join(dir, rel), 'utf8') : ''),
    exists: rel => fs.existsSync(path.join(dir, rel)),
    write(rel, text) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
      fs.writeFileSync(path.join(dir, rel), text)
    },
    // The repo's vendored checker once onboarded, the plugin's before: a teammate only ever has the vendored one.
    sdlc(args, { human = false, input } = {}) {
      const vendored = path.join(dir, '.rig/bin/sdlc.ts')
      const script = fs.existsSync(vendored) ? vendored : path.join(PLUGIN, 'scripts/sdlc.ts')
      const who = human ? { SDLC_HUMAN: '1' } : {}
      return run('node', ['--disable-warning=ExperimentalWarning', script, ...args], { env: { CLAUDE_PROJECT_DIR: dir, ...who }, ...(input === undefined ? {} : { input }) })
    },
    commitAll(message) {
      git('add', '-A')
      if (run('git', ['diff', '--cached', '--quiet']).status === 0) return false
      git('commit', '-q', '--no-verify', '-m', message)
      return true
    },
    // Project-local settings that switch off every installed plugin. Excluded through .git/info/exclude, so the repo
    // under test never sees the file and scope checks stay exact.
    isolate(plugins = installedPlugins()) {
      sb.write('.claude/settings.local.json', JSON.stringify({ enabledPlugins: Object.fromEntries(plugins.map(id => [id, false])) }, null, 2) + '\n')
      fs.appendFileSync(path.join(dir, '.git/info/exclude'), '.claude/settings.local.json\n')
    },
    // fn gets a detached worktree of HEAD with its own vendored checker: what CI sees, and nothing it writes lands here.
    inWorktree(fn) {
      const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-ci-'))
      git('worktree', 'add', '-q', '--detach', wt, 'HEAD')
      try {
        const script = path.join(wt, '.rig/bin/sdlc.ts')
        const sdlc = args => run('node', ['--disable-warning=ExperimentalWarning', script, ...args], { cwd: wt, env: { CLAUDE_PROJECT_DIR: wt } })
        return fn({ dir: wt, sdlc })
      } finally {
        git('worktree', 'remove', '--force', wt)
      }
    },
  }
  return sb
}

export function createSandbox({ name, out }) {
  const root = path.join(out, name)
  fs.rmSync(root, { recursive: true, force: true })
  const dir = path.join(root, 'repo')
  const origin = path.join(root, 'origin.git')
  const bin = path.join(root, 'bin')
  const logs = path.join(root, 'logs')
  for (const d of [dir, bin, logs]) fs.mkdirSync(d, { recursive: true })
  fs.copyFileSync(path.join(import.meta.dirname, 'gh-stub.sh'), path.join(bin, 'gh'))
  fs.chmodSync(path.join(bin, 'gh'), 0o755)

  // RIG_GH points at the stub by absolute path: a headless agent session rebuilds PATH, so a PATH-only stub
  // would silently resolve to the machine's real gh (which then refuses the local bare origin).
  const env = { ...CLEAN_ENV, PATH: `${bin}${path.delimiter}${process.env.PATH}`, RIG_GH: path.join(bin, 'gh'), RIG_GH_LOG: path.join(logs, 'gh.log'), CONTRACT_LOG: path.join(logs, 'contract.log') }
  const sb = bindSandbox({ name, root, dir, origin, bin, logs, env })
  const { git } = sb

  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'operator@rig.test')
  git('config', 'user.name', 'rig operator')
  execFileSync('git', ['init', '-q', '--bare', origin])
  git('remote', 'add', 'origin', origin)
  // A temp dir inside the repo, hidden from git: sessions inherit TMPDIR, and writes outside the repo are denied unattended.
  fs.mkdirSync(path.join(dir, '.tmp'))
  fs.appendFileSync(path.join(dir, '.git/info/exclude'), '.tmp/\n')
  env.TMPDIR = path.join(dir, '.tmp')
  return sb
}
