// Throwaway fixture repos shared by the eval runners.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// A temp dir holding copies of the given fixture dirs, not yet a git repo.
export function stageFixture(prefix, froms) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  for (const from of froms) fs.cpSync(from, dir, { recursive: true })
  return dir
}

// Make dir a git repo on main with everything committed.
export function commitAll(dir, msg) {
  const git = (...args) => { const r = spawnSync('git', ['-c', 'user.email=e@e', '-c', 'user.name=eval', ...args], { cwd: dir, encoding: 'utf8' }); if (r.status !== 0) throw new Error(`git ${args[0]} failed in ${dir}: ${r.stderr}`) }
  git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-qm', msg)
}
