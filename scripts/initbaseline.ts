// `sdlc.ts baseline`: /rig:init's measurement of the repo as it is, before any change exists. Each fast command and each
// distinct levels command runs once. A failing fast command goes into knownRed (the gate never blocks on debt it did not
// create, and the ratchet tightens it once it passes); a failing level is reported for the person to fix.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, read, out, fail, sanctionWrites } from './core.ts'
import { runCommand } from './runs.ts'
import { loadConfig } from './check.ts'
import { resolveCommands } from './scopes.ts'
import { updateKnownRed } from './registry.ts'

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
    // A timed-out command blocks even when known red (check.ts), so listing it there would hide nothing: report it instead.
    if (r.timedOut) { rows.push(`${key}: timed out after ${r.ms} ms: make it faster; knownRed cannot cover a timeout`); continue }
    if (r.exit !== 0) red.push(key)
    rows.push(`${key}: ${r.exit === 0 ? 'pass' : `fail (exit ${r.exit}) → knownRed`} in ${r.ms} ms`)
  }
  // unit, integration, acceptance and api often share one command: run it once and name every level it serves.
  const byCmd = new Map<string, string[]>()
  for (const [level, cmd] of Object.entries(config.levels)) if (cmd) byCmd.set(cmd, [...(byCmd.get(cmd) ?? []), level])
  for (const [cmd, levels] of byCmd) {
    const r = runCommand(cmd, { timeoutMs: BUDGET_MS })
    const which = levels.length > 1 ? 'these levels' : 'this level'
    rows.push(`levels ${levels.join(', ')}: ${r.exit === 0 ? 'pass' : `FAIL (exit ${r.exit}): verification blocks on ${which} until it passes`}`)
  }
  if (!rows.length) return out('nothing declared to measure in .rig/sensors.json')
  const known = new Set(config.knownRed)
  const added = red.filter(k => !known.has(k))
  if (added.length) {
    fs.writeFileSync(file, updateKnownRed(read(file), added, []))
    sanctionWrites([SENSORS_JSON])
  }
  out([...rows, '', `known red: ${[...known, ...added].join(', ') || 'none'}${added.length ? ' (written to .rig/sensors.json)' : ''}`].join('\n'))
}
