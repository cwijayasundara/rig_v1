// rig sync (behavioural harness spec 2026-10-16 §5): every sensor's guide rendered into one managed CLAUDE.md block, and the
// checks that keep guides, sensors and the brief's behaviours in step. Text outside the block is the team's and never touched.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, SDLC, read, sha, git, out, fail, sanctionWrites, type Args } from './core.ts'
import { parseRegistry, isRegistryShape, type Registry } from './registry.ts'
import { behaviourIds, missingBehaviours } from './sensors.ts'
import { matchesAny, type Finding, type Severity } from './model.ts'

const CLAUDE_MD = 'CLAUDE.md'
export const BRIEF = '.rig/product/brief.md'
const START = /^<!-- rig:guides start hash=([0-9a-f]+) -->$/m
const END = '<!-- rig:guides end -->'

export const renderLines = (r: Registry): string[] => r.sensors.filter(s => s.enabled).map(s => `- ${s.guide} [sensor:${s.id}]`)
const renderBlock = (lines: string[]): string => [`<!-- rig:guides start hash=${sha(lines.join('\n'))} -->`, ...lines, END].join('\n')

export function findBlock(text: string): { hash: string; lines: string[]; start: number; end: number } | null {
  const m = START.exec(text)
  const endAt = m ? text.indexOf(END, m.index) : -1
  if (!m || endAt < 0) return null
  const lines = text.slice(m.index + m[0].length, endAt).split('\n').filter(l => l.trim())
  return { hash: m[1] ?? '', lines, start: m.index, end: endAt + END.length }
}

// Replace the block in place, or append it after the team's text.
export function withBlock(text: string, lines: string[]): string {
  const b = findBlock(text)
  if (b) return text.slice(0, b.start) + renderBlock(lines) + text.slice(b.end)
  return `${text.trimEnd() ? `${text.trimEnd()}\n\n` : ''}${renderBlock(lines)}\n`
}

export function syncProblems(i: { registry: Registry; errors: string[]; claude: string; brief: string; tests: string }): string[] {
  const p = i.errors.filter(e => /\.guide /.test(e))
  const b = findBlock(i.claude)
  if (!b) p.push(`${CLAUDE_MD} has no rig guides block: run rig sync`)
  else {
    const ids = new Set(i.registry.sensors.map(s => s.id))
    for (const l of b.lines) {
      const id = /\[sensor:([^\]]+)\]\s*$/.exec(l)?.[1]
      if (!id) p.push(`guides block line names no sensor: "${l}"`)
      else if (!ids.has(id)) p.push(`guides block names sensor ${id}, which is not in .rig/sensors.json`)
    }
    if (sha(b.lines.join('\n')) !== b.hash) p.push('guides block was edited by hand (its hash does not match): run rig sync')
    else if (b.lines.join('\n') !== renderLines(i.registry).join('\n')) p.push('guides block is out of date with .rig/sensors.json: run rig sync')
  }
  for (const id of missingBehaviours(behaviourIds(i.brief, 'Behaviours'), i.tests)) p.push(`${BRIEF}: ${id} has no test that names it`)
  return p
}

const testsText = (r: Registry): string => (git(['ls-files', '--cached', '--others', '--exclude-standard']) ?? '').split('\n')
  .filter(f => f && matchesAny(f, r.paths.tests)).map(f => read(path.join(ROOT, f))).join('\n')

export function syncFindings(registry: Registry, errors: string[], severity: Severity): Finding[] {
  const brief = read(path.join(ROOT, BRIEF))
  return syncProblems({ registry, errors, claude: read(path.join(ROOT, CLAUDE_MD)), brief, tests: brief ? testsText(registry) : '' }).map(message => {
    const ofBrief = message.startsWith(BRIEF)
    return { sensor: 'sync', severity, file: ofBrief ? BRIEF : CLAUDE_MD, message, fix: ofBrief ? 'add a test whose name or comment says the B-number and proves it' : 'run rig sync (sdlc.ts sync); never edit the block by hand' }
  })
}

export function writeSync(registry: Registry): string {
  const file = path.join(ROOT, CLAUDE_MD)
  const before = read(file)
  const after = withBlock(before, renderLines(registry))
  if (after === before) return 'CLAUDE.md guides block is up to date'
  sanctionWrites([CLAUDE_MD])
  fs.writeFileSync(file, after)
  return `CLAUDE.md guides block written: ${renderLines(registry).length} sensor guide(s)`
}

export function cmdSync(args: Args): void {
  const raw = read(path.join(SDLC, 'sensors.json'))
  if (!isRegistryShape(raw)) fail('rig sync needs a registry-shaped .rig/sensors.json (a "sensors" list); run init --stack on a new repo')
  const { registry, errors } = parseRegistry(raw)
  if (!args.opt.check) return out(writeSync(registry))
  const found = syncFindings(registry, errors, 'block')
  if (!found.length) return out('sync --check: guides match the registry')
  out(found.map(f => `[sync] ${f.message}\n  fix: ${f.fix}`).join('\n'))
  process.exitCode = 1
}
