// `sdlc.ts baseline`: /rig:init's measurement of the repo as it is, before any change exists. Each fast command, each distinct
// levels command and each quality command runs once. A failing fast command goes into knownRed (the gate never blocks on debt
// it did not create, and the ratchet tightens it once it passes); a failing level or an uncountable quality tool is reported
// for the person to fix or leave out. Base quality counts per change are measured later, against the base SHA, by the sensors node.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, read, out, fail, sanctionWrites } from './core.ts'
import { runCommand } from './runs.ts'
import { loadConfig } from './check.ts'
import { countIn } from './quality.ts'
import { resolveCommands } from './scopes.ts'

const SENSORS_JSON = '.rig/sensors.json'
const BUDGET_MS = 600_000

export function cmdBaseline(): void {
  const file = path.join(ROOT, SENSORS_JSON)
  if (!fs.existsSync(file)) fail('no .rig/sensors.json: write it first (/rig:init, Sensors step)')
  const { config, errors } = loadConfig()
  if (errors.length) fail(`fix .rig/sensors.json first:\n${errors.map(e => `- ${e}`).join('\n')}`)
  const rows: string[] = []
  const red: string[] = []
  for (const { key, cmd, dir, error } of resolveCommands('fast', config, 'all', BUDGET_MS).commands) {
    if (error) { rows.push(`${key}: not run (${error})`); continue }
    const r = runCommand(cmd, { cwd: dir, timeoutMs: BUDGET_MS })
    if (r.exit !== 0) red.push(key)
    rows.push(`${key}: ${r.exit === 0 ? 'pass' : `fail (exit ${r.exit}) → knownRed`} in ${r.ms} ms`)
  }
  // unit, integration, acceptance and api often share one command: run it once and name every level it serves.
  const byCmd = new Map<string, string[]>()
  for (const [level, cmd] of Object.entries(config.levels)) if (cmd) byCmd.set(cmd, [...(byCmd.get(cmd) ?? []), level])
  for (const [cmd, levels] of byCmd) {
    const r = runCommand(cmd, { timeoutMs: BUDGET_MS })
    rows.push(`levels ${levels.join(', ')}: ${r.exit === 0 ? 'pass' : `FAIL (exit ${r.exit}): verification blocks on ${levels.length > 1 ? 'these levels' : 'this level'} until it passes`}`)
  }
  for (const [category, q] of Object.entries(config.quality)) {
    if (!q) continue
    const c = countIn(ROOT, q.cmd, q.count)
    rows.push(`quality ${category}: ${c.n === null ? `cannot count (${c.note}): remove it from sensors.json or install what it needs` : `${c.n} finding(s) now`}`)
  }
  if (!rows.length) return out('nothing declared to measure in .rig/sensors.json')
  const known = new Set(config.knownRed)
  const added = red.filter(k => !known.has(k))
  if (added.length) {
    const raw = JSON.parse(read(file)) as Record<string, unknown>
    raw.knownRed = [...config.knownRed, ...added]
    fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n')
    sanctionWrites([SENSORS_JSON])
  }
  out([...rows, '', `known red: ${[...known, ...added].join(', ') || 'none'}${added.length ? ' (written to .rig/sensors.json)' : ''}`].join('\n'))
}
