// A package test script that no command sensor runs can hold a rule the change breaks with nothing to notice: the 2026-11-14
// eval's refund policy lived in a test only `test:all` ran, and every rig-start run shipped past it. The script names are the
// data; no runner is named here.
import fs from 'node:fs'
import path from 'node:path'
import type { Registry } from './registry.ts'
import type { Finding } from './model.ts'
import { SENSORS_JSON, skillRef } from './core.ts'

const TEST_SCRIPT = /^test(?:$|[:._-])/i
const NEVER_ENDS = /watch|dev|serve/i
const words = (cmd: string): string[] => cmd.split(/[\s;&|()<>]+/).filter(Boolean)

// A sensor runs a script it names or whose body it is; a script runs the scripts its body names, and one with the body of a
// run script runs the same tests. Returns the test scripts left uncovered, sorted; none when no command sensor is declared.
export function uncoveredTestScripts(r: Registry, root: string): string[] {
  let scripts: Record<string, string>
  try {
    const raw = (JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, unknown> }).scripts ?? {}
    scripts = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string'))
  } catch { return [] }
  const cmds = r.sensors.filter(s => s.enabled && s.cmd).map(s => s.cmd!.trim())
  // A registry with no command sensor runs no tests at all; the not-configured list already names that, so it is not judged here.
  if (!cmds.length) return []
  const covered = new Set<string>()
  const bodies = new Set(cmds)
  let grew = true
  while (grew) {
    grew = false
    for (const [name, body] of Object.entries(scripts)) {
      if (covered.has(name)) continue
      const named = cmds.some(c => words(c).includes(name)) || [...covered].some(n => words(scripts[n]!).includes(name))
      if (named || bodies.has(body.trim())) { covered.add(name); bodies.add(body.trim()); grew = true }
    }
  }
  return Object.keys(scripts).filter(n => TEST_SCRIPT.test(n) && !NEVER_ENDS.test(n) && !covered.has(n)).sort()
}

export function testScriptFindings(r: Registry, root: string): Finding[] {
  return uncoveredTestScripts(r, root).map(name => ({
    sensor: 'test-scripts', severity: 'block', file: 'package.json',
    message: `the test script "${name}" is run by no sensor, so its tests never judge this change`,
    fix: `add a command sensor that runs "${name}" to ${SENSORS_JSON} (cadence ci; run it first and fix what fails), or the person waives test-scripts with ${skillRef('waive')}`,
  }))
}
