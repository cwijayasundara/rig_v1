// `init --stack` fits a pack to the repo it lands in, by the pack's own `fit` rules (data in templates/stacks; core names no tool). Only evidence
// on disk decides (a file, or text in a file), never a guess about what is installed globally: a sensor whose tool the repo does not use would
// fail every gate, so the rule leaves it out or swaps its command, and its note tells the person how to bring it back.
import fs from 'node:fs'
import path from 'node:path'
import { read } from './core.ts'
import { globToRegex } from './model.ts'
import type { StackPack, Probe } from './stackpacks.ts'

type Sensor = { id: string; cmd?: string }

// A string probe hits when a file (or, with a glob, a top-level entry) exists; {in, match} hits when the regex matches the text of one of the files.
function hit(root: string, probe: Probe): boolean {
  if (typeof probe === 'string') {
    if (!probe.includes('*')) return fs.existsSync(path.join(root, probe))
    return (fs.existsSync(root) ? fs.readdirSync(root) : []).some(e => globToRegex(probe).test(e))
  }
  const re = new RegExp(probe.match, 'i')
  return probe.in.some(f => re.test(read(path.join(root, f))))
}

// The pack adapted to `root`, and the lines to tell the person. A rule fires when none of its `unless` probes hit and (if it has `when`) one of
// them does; it then drops its sensor or swaps its command, and adds its note. Rules run in order and skip a sensor an earlier rule dropped.
export function adaptPack(pack: StackPack, root: string): { pack: StackPack; notes: string[] } {
  let sensors = pack.sensors as Sensor[]
  const notes: string[] = []
  for (const rule of pack.fit) {
    if (rule.sensor && !sensors.some(s => s.id === rule.sensor)) continue
    if (rule.unless?.some(p => hit(root, p))) continue
    if (rule.when && !rule.when.some(p => hit(root, p))) continue
    if (rule.drop) sensors = sensors.filter(s => s.id !== rule.sensor)
    if (rule.cmd) sensors = sensors.map(s => (s.id === rule.sensor ? { ...s, cmd: rule.cmd as string } : s))
    notes.push(rule.note)
  }
  return { pack: { ...pack, sensors }, notes }
}
