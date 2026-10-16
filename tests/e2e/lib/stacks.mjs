// Stack fixtures (spec §10.2): a tiny repo per pack. Each one onboards with `init --stack` and `baseline`, then `check --at commit`
// passes a good staged edit and blocks a broken one on the pack's core sensor. A stack whose toolchain cannot run is skipped.
import fs from 'node:fs'
import path from 'node:path'
import { Checks } from './checks.mjs'

export const FIXTURES = path.join(import.meta.dirname, '../fixtures/stacks')
// Every fixture language takes a // line comment.
const good = t => `${t.trimEnd()}\n// reviewed\n`
const typeError = t => t.replace('a + b', 'a + "b"')

export const STACKS = [
  { stack: 'node', probe: ['node', '--version'], core: 'unit', file: 'src/add.js', good, broken: t => t.replace('a + b', 'a - b') },
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

const json = t => { try { return JSON.parse(t) } catch { return null } }

export async function runStack(sb, s) {
  const c = new Checks(`stack ${s.stack}`)
  fs.cpSync(path.join(FIXTURES, s.stack), sb.dir, { recursive: true })
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
  return c
}
