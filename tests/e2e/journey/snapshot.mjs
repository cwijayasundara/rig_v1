// A stage snapshot is a tarball of the sandbox repo (history included) taken after a good live run; a leg of the journey can start from one.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const EXCLUDE = ['.venv', '__pycache__', 'node_modules', '.tmp', '.mypy_cache', '.pytest_cache', '.ruff_cache']
const must = (r, what) => { if (r.status !== 0) throw new Error(`${what}: ${(r.stderr || '').toString().trim().split('\n')[0]}`) }
export const snapshotFile = (recordedDir, stage) => path.join(recordedDir, 'snapshots', `${stage}.tar.gz`)

export function packSnapshot({ dir, recordedDir, stage }) {
  fs.mkdirSync(path.join(recordedDir, 'snapshots'), { recursive: true })
  must(spawnSync('tar', ['czf', snapshotFile(recordedDir, stage), ...EXCLUDE.map(e => `--exclude=${e}`), '-C', dir, '.']), 'tar')
}

// Replaces everything in `dir` with the snapshot. False when none was recorded for the stage.
export function unpackSnapshot({ dir, recordedDir, stage }) {
  const snap = snapshotFile(recordedDir, stage)
  if (!fs.existsSync(snap)) return false
  for (const e of fs.readdirSync(dir)) fs.rmSync(path.join(dir, e), { recursive: true, force: true })
  must(spawnSync('tar', ['xzf', snap, '-C', dir]), 'untar')
  return true
}

// A restored repo still names the origin of the machine and run that recorded it: give it a fresh bare one the merge step can push to.
export function seedSandbox({ sb, recordedDir, stage }) {
  if (!unpackSnapshot({ dir: sb.dir, recordedDir, stage })) return false
  fs.mkdirSync(path.join(sb.dir, '.tmp'), { recursive: true })
  fs.rmSync(sb.origin, { recursive: true, force: true })
  must(spawnSync('git', ['init', '-q', '--bare', sb.origin]), 'git init --bare')
  if (spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: sb.dir }).status === 0) sb.git('remote', 'set-url', 'origin', sb.origin)
  else sb.git('remote', 'add', 'origin', sb.origin)
  sb.git('push', '-q', 'origin', 'HEAD:refs/heads/main')
  return true
}
