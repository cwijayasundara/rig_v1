// `sdlc.ts baseline`: /rig:init's measurement of the repo as it is, before any change exists. Each command sensor up to the commit
// cadence (what the pre-commit hook runs) runs once; a failing one goes into knownRed by its id (the gate never blocks on debt it did not create, and the ratchet
// tightens it once it passes).
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, SENSORS_JSON, BUDGET_MS, read, out, fail, sanctionWrites, skillRef } from './core.ts'
import { runCommand } from './runs.ts'
import { loadConfig } from './check.ts'
import { updateKnownRed, activeSensors, commandFor } from './registry.ts'
import { uncoveredTestScripts, scriptSensor, scriptCommand } from './testscripts.ts'


export function cmdBaseline(): void {
  const file = path.join(ROOT, SENSORS_JSON)
  if (!fs.existsSync(file)) fail(`no .rig/sensors.json: write it first (${skillRef('init')}, Sensors step)`)
  const { registry, errors } = loadConfig()
  if (errors.length) fail(`fix .rig/sensors.json first:\n${errors.map(e => `- ${e}`).join('\n')}`)
  const rows: string[] = []
  const red: string[] = []
  for (const s of activeSensors(registry, 'commit', 'continuous')) {
    const cmd = commandFor(s, null)
    if (!cmd) continue
    const r = runCommand(cmd, { timeoutMs: BUDGET_MS.commit })
    // A timed-out command blocks even when known red (check.ts), so listing it there would hide nothing: report it instead.
    if (r.timedOut) { rows.push(`${s.id}: timed out after ${r.ms} ms: make it faster; knownRed cannot cover a timeout`); continue }
    if (r.exit !== 0) red.push(s.id)
    rows.push(`${s.id}: ${r.exit === 0 ? 'pass' : `fail (exit ${r.exit}) → knownRed`} in ${r.ms} ms`)
  }
  // A test script no sensor runs is a rule nothing checks, and a rig-on session runs only edit and turn sensors: baseline registers
  // each one itself, at turn when its run finished fast, else at ci (ship runs it). A fast one that failed goes into knownRed.
  const scripts = uncoveredTestScripts(registry, ROOT).map(name => {
    const r = runCommand(scriptCommand(name), { timeoutMs: BUDGET_MS.stop })
    const sensor = scriptSensor(name, r)
    const failed = r.exit !== 0 && !r.timedOut
    const why = r.timedOut ? 'timed out' : failed ? `fail (exit ${r.exit})` : sensor.cadence === 'turn' ? `passed in ${r.ms} ms` : `${r.ms} ms`
    const knownRed = sensor.cadence === 'turn' && failed
    return { sensor, knownRed, row: `${sensor.id}: registered at cadence ${sensor.cadence}${knownRed ? ', known red' : ''} (${why})` }
  })
  if (!rows.length && !scripts.length) return out('nothing declared to measure in .rig/sensors.json')
  const known = new Set(registry.knownRed)
  const added = [...red, ...scripts.filter(x => x.knownRed).map(x => x.sensor.id)].filter(k => !known.has(k))
  if (added.length || scripts.length) {
    let text = read(file)
    if (added.length) text = updateKnownRed(text, added, [])
    if (scripts.length) {
      const raw = JSON.parse(text) as { sensors: unknown[] }
      raw.sensors = [...raw.sensors, ...scripts.map(x => x.sensor)]
      text = JSON.stringify(raw, null, 2) + '\n'
    }
    fs.writeFileSync(file, text)
    sanctionWrites([SENSORS_JSON])
  }
  out([...rows, ...scripts.map(x => x.row), '', `known red: ${[...known, ...added].join(', ') || 'none'}${added.length ? ' (written to .rig/sensors.json)' : ''}`].join('\n'))
}
