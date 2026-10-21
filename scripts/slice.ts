// `sdlc slice` (harness readiness 1.4): a golden slice per stack, as data under templates/slices/<stack>/: a small exemplar feature in the
// stack's own idiom, the layers it follows and the rules text that explains them. `gen` writes a path-scoped Claude Code rule (so the model sees
// the exemplar's conventions only when it works on matching files) and proposes the layers for a person to approve; `scaffold <name>` writes a new
// feature from the exemplar. Nothing is ever overwritten, and nothing is enforced that a person has not approved.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, SDLC, PLUGIN_ROOT, out, fail, read, exists, sanctionWrites, type Args } from './core.ts'
import { parseRegistry } from './registry.ts'
import { parseLayers, approvedLayers, layerState, layerStateText } from './arch.ts'

type Slice = { stack: string; paths: string[]; layers: string[]; test: string }
const RULES_FILE = '.claude/rules/rig-slice.md'
const MARK = '<!-- rig:slice'
const RESERVED = ['domain', 'app', 'infra', 'http', 'src', 'test', 'tests']

const stackOf = (): string => parseRegistry(read(path.join(SDLC, 'sensors.json'))).registry.stack ?? ''

function loadSlice(stack: string): { slice: Slice; rules: string; files: { rel: string; text: string }[] } | null {
  const dir = path.join(PLUGIN_ROOT, 'templates', 'slices', stack)
  if (!stack || !exists(path.join(dir, 'slice.json'))) return null
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))
  return {
    slice: JSON.parse(read(path.join(dir, 'slice.json'))) as Slice,
    rules: read(path.join(dir, 'RULES.md')),
    files: walk(path.join(dir, 'files')).map(f => ({ rel: path.relative(path.join(dir, 'files'), f).split(path.sep).join('/'), text: fs.readFileSync(f, 'utf8') })),
  }
}

const block = (s: Slice): string => `\`\`\`rig-layers\n${s.layers.join('\n')}\n\`\`\`\n`
const noSlice = (stack: string): string => `no golden slice for ${stack ? `the "${stack}" stack` : 'this repo (no stack in .rig/sensors.json)'}: slices exist under templates/slices/<stack>/`

export const nameProblem = (name: string): string | null => (!/^[a-z][a-z0-9-]{2,30}$/.test(name) || name.endsWith('-') || name.includes('--') || RESERVED.includes(name) ? `"${name}" is not a usable feature name: 3 to 31 lowercase letters, digits and single hyphens, starting with a letter, and not one of ${RESERVED.join(', ')}` : null)
export function names(name: string): { kebab: string; snake: string; pascal: string } {
  return { kebab: name, snake: name.replace(/-/g, '_'), pascal: name.split('-').map(w => w[0]?.toUpperCase() + w.slice(1)).join('') }
}
const fill = (t: string, n: ReturnType<typeof names>): string => t.replaceAll('{{name}}', n.kebab).replaceAll('{{snake}}', n.snake).replaceAll('{{Name}}', n.pascal)

function gen(): void {
  const stack = stackOf(), loaded = loadSlice(stack)
  if (!loaded) return out(noSlice(stack))
  const rulesPath = path.join(ROOT, RULES_FILE)
  if (exists(rulesPath) && !read(rulesPath).includes(MARK)) fail(`${RULES_FILE} exists and was not written by rig: not overwriting it; move or delete it, then rerun`)
  const frontmatter = `---\npaths:\n${loaded.slice.paths.map(p => `  - "${p}"`).join('\n')}\n---\n`
  fs.mkdirSync(path.dirname(rulesPath), { recursive: true })
  fs.writeFileSync(rulesPath, `${frontmatter}${MARK} stack=${stack}. Written by \`sdlc slice gen\`; rerun it to refresh. -->\n${loaded.rules}`)
  const written = [RULES_FILE]
  const lines = [`wrote ${RULES_FILE}: Claude Code loads it when the model works on ${loaded.slice.paths.join(', ')}.`]
  const archFile = path.join(ROOT, '.rig/product/architecture.md')
  if (parseLayers(read(archFile)).def) lines.push('architecture.md already declares layers: left as it is. The slice\'s layers are in templates/slices/' + stack + '/slice.json.')
  else {
    fs.mkdirSync(path.dirname(archFile), { recursive: true })
    fs.writeFileSync(archFile, `${read(archFile).trimEnd() || '# Architecture'}\n\n## Layers\n\n${block(loaded.slice)}`)
    written.push('.rig/product/architecture.md')
    lines.push('proposed the slice\'s layers under "## Layers" in .rig/product/architecture.md. Nothing is enforced until a person reviews them and runs `sdlc.ts arch approve`.')
  }
  sanctionWrites(written)
  out(lines.join('\n'))
}

function scaffold(args: Args): void {
  const stack = stackOf(), loaded = loadSlice(stack)
  if (!loaded) return fail(noSlice(stack))
  const bad = nameProblem(args.pos[1] ?? '')
  if (bad) fail(bad)
  const n = names(args.pos[1] ?? '')
  // A repo whose approved layers lack the slice's would be scaffolded into a layout that contradicts them.
  const approved = approvedLayers(read(path.join(ROOT, '.rig/layers.approved.json'))).map(l => l.from)
  const wanted = (parseLayers(block(loaded.slice)).def?.layers ?? []).map(l => l.glob)
  const missing = approved.length ? wanted.filter(g => !approved.includes(g)) : []
  if (missing.length) fail(`this repo's approved layers do not include the slice's (${missing.join(', ')}), so a scaffold would contradict them: run \`slice gen\` and \`arch approve\` for the slice's layers, or lay the feature out by hand`)
  const targets = loaded.files.map(f => ({ rel: fill(f.rel, n), text: fill(f.text, n) }))
  const there = targets.filter(t => exists(path.join(ROOT, t.rel)))
  if (there.length) fail(`not overwriting: ${there.map(t => t.rel).join(', ')} already exist${there.length === 1 ? 's' : ''}`)
  for (const t of targets) { fs.mkdirSync(path.dirname(path.join(ROOT, t.rel)), { recursive: true }); fs.writeFileSync(path.join(ROOT, t.rel), t.text) }
  out([`scaffolded ${n.kebab} (${stack} slice):`, ...targets.map(t => `  ${t.rel}`), `Run the tests: ${loaded.slice.test}`].join('\n'))
}

export function cmdSlice(args: Args): void {
  const sub = args.pos[0]
  if (sub === 'gen') return gen()
  if (sub === 'scaffold') return scaffold(args)
  if (sub === 'status') {
    const stack = stackOf()
    return out([`stack: ${stack || 'none'}`, loadSlice(stack) ? `slice: templates/slices/${stack}` : noSlice(stack), `rules file: ${exists(path.join(ROOT, RULES_FILE)) ? RULES_FILE : 'not written (run slice gen)'}`, `layers: ${layerStateText(layerState())}`].join('\n'))
  }
  fail('usage: slice (gen | scaffold <name> | status)')
}
