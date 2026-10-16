// `init --stack`: onboarding-only sensor declarations, from a stack pack (new registry) or templates/stacks.json (legacy levels).
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, SDLC, PLUGIN_ROOT, exists, read, git, listChanges, sanctionWrites } from './core.ts'
import { loadPacks, detectStacks, packFile, packRegistry, PACKS_DIR } from './stackpacks.ts'
import { writeSync, BRIEF } from './sync.ts'

const STACK_MARKERS: [string, string][] = [['package.json', 'node'], ['go.mod', 'go'], ['pom.xml', 'java-maven'], ['pyproject.toml', 'python'], ['requirements.txt', 'python']]

// `init --stack [name]`: declares sensors.json `levels` from the plugin's own templates/stacks.json, the one path that may do it
// without a person's yes, because it takes commands only from that shipped template and never from arguments. The write guard
// asks a person before a model adds a level (declared commands run unprompted). Onboarding only: it declares only while `levels`
// is empty, no change exists yet and sensors.json is not committed, so it cannot launder an edit to a reviewed config.
// acceptance and api are not in the template: both default to the unit command, so a change never blocks on an undeclared level.
function declareStackLevels(opt: string | true): string {
  const stacks = JSON.parse(read(path.join(PLUGIN_ROOT, 'templates', 'stacks.json'))) as Record<string, { levels: Record<string, string> }>
  const name = typeof opt === 'string' ? opt : STACK_MARKERS.find(([f]) => exists(path.join(ROOT, f)))?.[1]
  const stack = name ? stacks[name] : undefined
  if (!name || !stack) return `no stack template for ${name ?? 'this directory'} (known: ${Object.keys(stacks).join(', ')}); declare levels in .rig/sensors.json yourself`
  const file = path.join(SDLC, 'sensors.json')
  if ((git(['ls-tree', '-r', '--name-only', 'HEAD']) ?? '').split('\n').includes('.rig/sensors.json')) return '.rig/sensors.json is committed; changing it is a reviewed harness edit, not onboarding'
  if (listChanges().length) return 'a change already exists; --stack is for onboarding only'
  let cfg: Record<string, unknown> = {}
  if (exists(file)) {
    try { cfg = JSON.parse(read(file)) as Record<string, unknown> } catch { return '.rig/sensors.json does not parse; not touching it' }
  }
  if (cfg.levels && Object.keys(cfg.levels as object).length) return 'levels already declared; left as they are'
  const unit = stack.levels.unit ?? ''
  cfg.levels = { ...stack.levels, acceptance: unit, api: unit }
  if (!cfg.fast && !cfg.full && unit) { cfg.fast = { test: unit }; cfg.full = { test: unit } }
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n')
  sanctionWrites(['.rig/sensors.json'])
  return `declared levels for ${name}: ${Object.entries(cfg.levels as Record<string, string>).map(([k, v]) => `${k}=${v}`).join(', ')} (acceptance and api default to the unit command; point them at a real e2e or HTTP test when you have one)`
}

// `init --stack [name]` (behavioural harness step 2): with no sensors.json yet, write the detected stack pack as a registry.
// A hand-written sensors.json keeps the levels path above until step 4. Same onboarding-only guards as declareStackLevels.
export function declareStack(opt: string | true): string {
  const file = path.join(SDLC, 'sensors.json')
  const text = exists(file) ? read(file).trim() : ''
  if (text && text !== '{}') return declareStackLevels(opt)
  if ((git(['ls-tree', '-r', '--name-only', 'HEAD']) ?? '').split('\n').includes('.rig/sensors.json')) return '.rig/sensors.json is committed; changing it is a reviewed harness edit, not onboarding'
  if (listChanges().length) return 'a change already exists; --stack is for onboarding only'
  const { packs } = loadPacks(PACKS_DIR)
  const found = typeof opt === 'string' ? [opt] : detectStacks(ROOT, packs)
  if (found.length > 1) return `several stacks match (${found.sort().join(', ')}); run init --stack <name> with one of them`
  const pack = packs.find(p => p.stack === found[0])
  if (!pack) return `no stack pack for ${found[0] ?? 'this directory'} (known: ${packs.map(p => p.stack).join(', ')}); write .rig/sensors.json yourself`
  fs.mkdirSync(SDLC, { recursive: true })
  fs.writeFileSync(file, JSON.stringify(packFile(pack), null, 2) + '\n')
  sanctionWrites(['.rig/sensors.json'])
  const brief = path.join(ROOT, BRIEF)
  if (!exists(brief)) { fs.mkdirSync(path.dirname(brief), { recursive: true }); fs.copyFileSync(path.join(PLUGIN_ROOT, 'templates', 'brief.md'), brief) }
  const synced = writeSync(packRegistry(pack))
  return `wrote .rig/sensors.json from the ${pack.stack} pack (${pack.sensors.length} sensors); edit the commands to fit this repo. ${BRIEF} is ready to fill in. ${synced}`
}
