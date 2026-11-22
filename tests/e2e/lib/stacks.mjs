// Stack fixtures (spec §10.2): a tiny repo per pack. Each one onboards with `init --stack` and `baseline`, then `check --at commit`
// passes a good staged edit and blocks a broken one on the pack's core sensor. A stack whose toolchain cannot run is skipped.
import fs from 'node:fs'
import path from 'node:path'
import { Checks, json } from './checks.mjs'
import { PLUGIN } from './sandbox.mjs'

export const FIXTURES = path.join(import.meta.dirname, '../fixtures/stacks')
// Every fixture language takes a // line comment.
const good = t => `${t.trimEnd()}\n// reviewed\n`
const typeError = t => t.replace('a + b', 'a + "b"')

// The python pack with its real tools (2026-11-22 rig_v1_test: a wrong mutmut flag and a holdout helper file each stopped a live run at
// verify; the scripted journey fakes both). The sensors run through uv, mutation-diff reaches a score, and a holdout case imports its helper.
async function pythonRealTools(sb, c) {
  const reg = json(sb.read('.rig/sensors.json')) ?? { sensors: [] }
  const cmd = id => reg.sensors.find(s => s.id === id)?.cmd ?? ''
  await c.check('python: a uv project gets every tool through uv run', () => ['lint', 'types', 'unit', 'mutation'].every(id => cmd(id).startsWith('uv run ')) || ['lint', 'types', 'unit', 'mutation'].map(id => `${id}: ${cmd(id).slice(0, 30)}`).join(' | '))
  const mut = cmd('mutation-diff').replaceAll('{changed:py}', 'src/calc/add.py').replaceAll('{changed-lines:py}', 'src/calc/add.py:1-2')
  const m = sb.run('sh', ['-c', mut], { env: { RIG_SDLC: path.join(PLUGIN, 'scripts/sdlc.ts'), CLAUDE_PROJECT_DIR: sb.dir }, timeout: 600_000 })
  await c.check('python: mutation-diff runs mutmut and reaches a score on the changed lines', () => (m.status === 0 && /mutation: \d+\/\d+ killed/.test(m.stdout)) || `exit ${m.status}: ${(m.stdout + m.stderr).trim().split('\n').slice(-2).join(' | ')}`)
  const H = '.rig/product/sprints/sprint-0/holdout'
  sb.write(`${H}/holdout_support.py`, 'from calc.add import add\n\n\ndef total(a: int, b: int) -> int:\n    return add(a, b)\n')
  sb.write(`${H}/test_tc_1_holdout.py`, 'from holdout_support import total\n\n\ndef test_tc_1_adds():\n    assert total(2, 3) == 5\n')
  sb.sdlc(['new', 'demo', '--type', 'feature'])
  sb.write('.rig/changes/demo/intent.md', '---\nslug: demo\ntype: feature\nsprint: 0\n---\n# demo\n\n## Intent\n\n## Open questions\nnone\n')
  const h = sb.sdlc(['holdout', 'demo'])
  await c.check('python: a holdout case runs from its temp dir with its helper file and the project pytest config', () => h.stdout.trim() === 'holdout: 1/1 passed' || (h.stdout + h.stderr).trim().split('\n').slice(-3).join(' | '))
}

export const STACKS = [
  { stack: 'node', probe: ['node', '--version'], core: 'unit', file: 'src/add.js', good, broken: t => t.replace('a + b', 'a - b') },
  { stack: 'python', probe: ['uv', '--version'], core: 'types', file: 'src/calc/add.py', good: t => `${t.trimEnd()}\n# reviewed\n`, broken: typeError, setup: sb => sb.run('uv', ['sync', '-q']), extra: pythonRealTools },
  { stack: 'go', probe: ['go', 'version'], core: 'types', file: 'add.go', good, broken: typeError },
  { stack: 'rust', probe: ['cargo', '--version'], core: 'types', file: 'src/lib.rs', good, broken: typeError },
  { stack: 'java-maven', probe: ['mvn', '-v'], core: 'types', file: 'src/main/java/add/Add.java', good, broken: typeError },
  { stack: 'dotnet', probe: ['dotnet', '--version'], core: 'types', file: 'Add.cs', good, broken: typeError },
]

// CI passes --require so a toolchain missing from the runner fails the job instead of skipping silently.
export function requiredStacks(arg) {
  if (!arg) return []
  const names = arg === 'all' ? STACKS.map(s => s.stack) : arg.split(',').map(n => n.trim()).filter(Boolean)
  for (const n of names) if (!STACKS.some(s => s.stack === n)) throw new Error(`unknown stack: ${n}`)
  return names
}

export function probe(run, cmd, args) {
  const r = run(cmd, args)
  if (r.error?.code === 'ENOENT') return { ok: false, why: `${cmd} not found` }
  if (r.status !== 0) return { ok: false, why: `${cmd} ${args.join(' ')} exited ${r.status}: ${((r.stderr || r.stdout || '').trim().split('\n')[0])}` }
  return { ok: true, why: '' }
}

export async function runStack(sb, s) {
  const c = new Checks(`stack ${s.stack}`)
  fs.cpSync(path.join(FIXTURES, s.stack), sb.dir, { recursive: true })
  if (s.setup) { const r = s.setup(sb); await c.check(`${s.stack}: the project environment installs`, () => r.status === 0 || (r.stderr || r.stdout || String(r.error)).trim().split('\n').slice(-2).join(' | ')) }
  sb.commitAll('chore: fixture')
  const init = sb.sdlc(['init', '--stack'])
  await c.check(`${s.stack}: init --stack detects the ${s.stack} pack`, () => new RegExp(`from the ${s.stack} pack`).test(init.stdout) || (init.stdout + init.stderr).trim().split('\n').slice(-2).join(' | '))
  const base = sb.sdlc(['baseline'])
  await c.check(`${s.stack}: the core sensor (${s.core}) passes at baseline`, () => new RegExp(`^${s.core}: pass`, 'm').test(base.stdout) || base.stdout.trim().split('\n').filter(l => l.startsWith(s.core)).join(' | ') || base.stderr.trim())
  sb.commitAll('chore: onboard rig')
  const original = sb.read(s.file)
  const check = () => json(sb.sdlc(['check', '--at', 'commit', '--json']).stdout) ?? { blocks: [{ sensor: 'unparsed' }] }
  sb.write(s.file, s.good(original))
  sb.git('add', s.file)
  const ok = check()
  await c.check(`${s.stack}: check --at commit passes a good staged edit`, () => !ok.blocks?.length || ok.blocks.map(b => `${b.sensor}: ${b.message?.split('\n')[0]}`).join(' | '))
  sb.write(s.file, s.broken(original))
  sb.git('add', s.file)
  const bad = check()
  await c.check(`${s.stack}: check --at commit blocks a broken staged edit on ${s.core}`, () => (bad.blocks ?? []).some(b => b.sensor === s.core) || `blocks: ${(bad.blocks ?? []).map(b => b.sensor).join(', ') || 'none'}`)
  if (s.extra) { sb.write(s.file, original); sb.git('add', s.file); await s.extra(sb, c) }
  return c
}
