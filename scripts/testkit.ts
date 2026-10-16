// Test helpers shared by the spec files. Never vendored into projects.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'

export const SCRIPT = path.resolve(import.meta.dirname, 'sdlc.ts')

export function gitIn(repo: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

export function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-test-'))
  gitIn(repo, 'init', '-q', '-b', 'main')
  gitIn(repo, 'config', 'user.email', 't@example.com')
  gitIn(repo, 'config', 'user.name', 'Tester')
  write(repo, 'README.md', 'hi\n')
  gitIn(repo, 'add', '.')
  gitIn(repo, 'commit', '-qm', 'init')
  return repo
}

export function write(repo: string, rel: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true })
  fs.writeFileSync(path.join(repo, rel), text)
}

// The runner marks its children as nested test runs; a consumer repo's own `node --test` must really run.
// The runner's own GitHub Actions context must not leak into the tests (a real GITHUB_EVENT_PATH changes what `check --at ci` does).
const { NODE_TEST_CONTEXT: _nested, GITHUB_EVENT_PATH: _event, GITHUB_STEP_SUMMARY: _summary, ...CLEAN_ENV } = process.env

export function sdlc(repo: string, args: string[], { input, env = {} }: { input?: string; env?: Record<string, string> } = {}) {
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', SCRIPT, ...args], {
    cwd: repo, input, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...CLEAN_ENV, CLAUDE_PROJECT_DIR: repo, SDLC_HUMAN: '', ...env },
  })
  return { code: r.status, stdout: r.stdout, stderr: r.stderr }
}

export const hook = (repo: string, name: string, payload: unknown) => sdlc(repo, ['hook', name], { input: JSON.stringify(payload) })

// A change with intent, a spec (B1), a plan and a person's approval: the state /rig:build starts from.
export function approvedChange(repo: string, slug: string, type = 'feature'): void {
  sdlc(repo, ['new', slug, '--type', type])
  write(repo, `.rig/changes/${slug}/spec.md`, '# Spec\n\n## Behaviours\n- B1: the change works\n\n## Open questions\nnone\n')
  write(repo, `.rig/changes/${slug}/plan.md`, '# Plan\n\n## Files\n- src/\n\n## Open questions\nnone\n')
  sdlc(repo, ['approve', slug], { env: { SDLC_HUMAN: '1' } })
}

export function verified(repo: string, slug: string): void {
  sdlc(repo, ['verify', slug])
}

// A registry-shaped sensors.json for fixtures: command maps per cadence, plus the few built-in options specs set.
export function registry(v: { turn?: Record<string, string>; commit?: Record<string, string>; ci?: Record<string, string>; advisory?: string[]; knownRed?: string[]; contracts?: object; size?: object; layers?: unknown[]; paths?: object; extra?: { sensors?: object[] } & Record<string, unknown> } = {}): string {
  const cmds = (cadence: string, m: Record<string, string> = {}) => Object.entries(m).map(([id, cmd]) => ({ id, cmd, cadence, blocks: !(v.advisory ?? []).includes(id), count: 'exit', guide: `${id} passes.` }))
  const builtins = [...(v.size ? [{ id: 'size', builtin: true, blocks: true, options: v.size }] : []), ...(v.layers ? [{ id: 'layering', builtin: true, options: { layers: v.layers } }] : [])]
  const { sensors: more = [], ...rest } = v.extra ?? {}
  return JSON.stringify({ sensors: [...cmds('turn', v.turn), ...cmds('commit', v.commit), ...cmds('ci', v.ci), ...builtins, ...more], knownRed: v.knownRed ?? [], ...(v.contracts ? { contracts: v.contracts } : {}), ...(v.paths ? { paths: v.paths } : {}), ...rest })
}

// Specs written before step 4c describe sensors as fast/full command maps; this writes the registry they mean
// (fast → turn, full → commit, limits → size options, behavioral → contracts, globs → paths). Test support only.
export function fromOld(v: Record<string, unknown>): string {
  const o = v as { fast?: Record<string, string>; full?: Record<string, string>; knownRed?: string[]; limits?: object; layers?: unknown[]; behavioral?: object; tests?: string[]; ignore?: string[]; fixtures?: string[]; testSupport?: string[]; policy?: object; stack?: string }
  const commit = Object.fromEntries(Object.entries(o.full ?? {}).filter(([id, cmd]) => o.fast?.[id] !== cmd).map(([id, cmd]) => [o.fast?.[id] ? `${id}-full` : id, cmd]))
  const paths = Object.fromEntries((['tests', 'ignore', 'fixtures', 'testSupport'] as const).filter(k => o[k]).map(k => [k, o[k]]))
  return registry({ turn: o.fast, commit, knownRed: (o.knownRed ?? []).map(k => k.replace(/^(?:fast|full)\./, '')), size: o.limits, layers: o.layers, contracts: o.behavioral, paths: Object.keys(paths).length ? paths : undefined, extra: { ...(o.policy ? { policy: o.policy } : {}), ...(o.stack ? { stack: o.stack } : {}) } })
}
