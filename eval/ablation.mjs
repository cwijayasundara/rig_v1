// Ablation (harness readiness 3.3): every sensor, skill, agent and hook event names the model weakness it compensates for, and any one of them can be
// removed from an eval arm. A component is cut only when removing it does not hurt, twice, at a sample big enough to mean something.
import fs from 'node:fs'
import path from 'node:path'
import { BUILTIN_IDS } from '../scripts/registry.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
export const MIN_RUNS = 3
const PASSES_TO_CUT = 2

// Every component the repo ships, as `kind:name`.
export function components(root = ROOT) {
  const skills = fs.readdirSync(path.join(root, 'skills')).map(n => `skill:${n}`)
  const agents = fs.readdirSync(path.join(root, 'agents')).filter(f => f.endsWith('.md')).map(f => `agent:${f.replace(/\.md$/, '')}`)
  const hooks = Object.keys(JSON.parse(fs.readFileSync(path.join(root, 'hooks/hooks.json'), 'utf8')).hooks).map(e => `hook:${e}`)
  const packs = new Set(fs.readdirSync(path.join(root, 'templates/stacks')).flatMap(f => JSON.parse(fs.readFileSync(path.join(root, 'templates/stacks', f), 'utf8')).sensors.map(s => s.id)))
  return [...new Set([...BUILTIN_IDS.map(i => `sensor:${i}`), ...[...packs].map(i => `sensor:${i}`), ...skills, ...agents, ...hooks])].sort()
}

export const loadTags = (root = ROOT) => JSON.parse(fs.readFileSync(path.join(root, 'eval/ablation-tags.json'), 'utf8'))

// Untagged components and tags for components that no longer exist: either way the registry has drifted from the harness.
export function tagProblems(tags = loadTags(), live = components()) {
  const ids = new Set(tags.map(t => t.id))
  return [...live.filter(c => !ids.has(c)).map(c => `${c} has no weakness tag in eval/ablation-tags.json`), ...tags.filter(t => !live.includes(t.id)).map(t => `${t.id} is tagged but no longer exists`),
    ...tags.filter(t => !t.weakness || t.weakness.length < 12).map(t => `${t.id} has no real weakness text`), ...tags.filter(t => t.ablatable === false && !t.why).map(t => `${t.id} is not ablatable but says no why`)]
}

// Removes one component from a sandbox that rig is installed in, and commits it. Returns what it did.
export function applyAblation(sb, id) {
  const [kind, name] = id.split(':')
  if (kind === 'sensor') {
    const file = '.rig/sensors.json'
    const reg = JSON.parse(sb.read(file))
    const hit = (reg.sensors ?? []).find(s => s.id === name)
    if (hit) hit.enabled = false
    else reg.sensors = [...(reg.sensors ?? []), { id: name, builtin: true, enabled: false }]
    sb.write(file, JSON.stringify(reg, null, 2) + '\n')
    sb.sdlc(['sync'])
  } else if (kind === 'skill') fs.rmSync(sb.file(`.claude/skills/rig-${name}`), { recursive: true, force: true })
  else if (kind === 'agent') fs.rmSync(sb.file(`.claude/agents/rig-${name}.md`), { force: true })
  else if (kind === 'hook') {
    const file = '.claude/settings.json'
    const settings = JSON.parse(sb.read(file))
    delete settings.hooks?.[name]
    sb.write(file, JSON.stringify(settings, null, 2) + '\n')
  } else throw new Error(`unknown component kind: ${id}`)
  sb.commitAll(`chore: ablate ${id}`)
  return `removed ${id}`
}

// history: [{ component, model, date, withRuns, withAccepted, withoutRuns, withoutAccepted }]. Lift is the accepted rate with the component minus without it.
export function verdict(history, component) {
  const passes = history.filter(h => h.component === component).sort((a, b) => a.date.localeCompare(b.date))
  if (!passes.length) return { state: 'untested', lift: null }
  const lift = h => h.withAccepted / h.withRuns - h.withoutAccepted / h.withoutRuns
  const real = passes.filter(h => h.withRuns >= MIN_RUNS && h.withoutRuns >= MIN_RUNS)
  const last = passes.at(-1)
  if (!real.length || real.at(-1) !== last) return { state: 'inconclusive', lift: lift(last), why: `fewer than ${MIN_RUNS} runs per arm` }
  const trailing = []
  for (const h of [...real].reverse()) { if (lift(h) <= 0) trailing.push(h); else break }
  if (trailing.length >= PASSES_TO_CUT) return { state: 'cut-eligible', lift: lift(last) }
  return { state: trailing.length ? 'candidate' : 'keep', lift: lift(last) }
}
