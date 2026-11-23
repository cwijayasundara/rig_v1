// Copies the harness into a project. Plain `vendor` copies the checker CI runs (.rig/bin). `vendor --standalone`
// also writes the skills, agents and hooks into .claude/, so the repo needs no plugin, cloud sessions included.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, SDLC, PLUGIN_ROOT, IS_VENDORED, read, out, fail, sanctionWrites, sha, isHarnessPath, type Args } from './core.ts'
import { findBlock, withBlock } from './sync.ts'
import { HOOK_SCRIPTS, installHooks } from './githooks.ts'
import { parseProfile, skillIn, agentIn, type Profile } from './profile.ts'
import { BUILTIN_IDS } from './registry.ts'

// Every script of the plugin except the specs and testkit, which stay behind. CI runs this copy, so it never needs the plugin; a new script ships without a list to update
// (vendor.spec.ts checks that every module a script imports is in it).
// A vendored copy has no plugin scripts directory beside it (and never vendors: `vendor` refuses there), so its list is empty.
export const VENDORED = (fs.existsSync(path.join(PLUGIN_ROOT, 'scripts')) ? fs.readdirSync(path.join(PLUGIN_ROOT, 'scripts')) : []).filter(n => n.endsWith('.ts') && !n.endsWith('.spec.ts') && n !== 'testkit.ts').map(n => n.slice(0, -3)).sort()
const SDLC_HOOK = '.rig/bin/sdlc.ts'
type HookGroup = { matcher?: string; hooks: { type: string; command: string; timeout?: number; async?: boolean }[] }

// Plugin references rewritten for a project copy: script paths, rig:x agents and the agent's name. A command keeps /rig:x: the repo's copy is
// .claude/commands/rig/<name>.md, which Claude Code registers as /rig:<name>, and its name comes from the path, so the name: line goes.
const AGENTS = ['architect', 'evaluator'] // agents/*.md; removed.spec.ts pins the set

// An agent takes a hyphen (`rig-architect`).
function forProject(text: string, kind: 'skill' | 'agent' = 'skill'): string {
  return text
    .replaceAll('"${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts"', SDLC_HOOK) // the human skills quote the plugin path; the project path needs no quotes
    .replaceAll('${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts', SDLC_HOOK)
    .replaceAll('<plugin>/scripts/sdlc.ts', SDLC_HOOK)
    .replaceAll('${CLAUDE_PLUGIN_ROOT}/templates/', '.rig/templates/')
    .replace(new RegExp(`(?<![/\\w])rig:(${AGENTS.join('|')})\\b`, 'g'), 'rig-$1')
    .replace(/^name: (?!rig[-:])(\S+)\r?\n/m, (_m, n: string) => (kind === 'skill' ? '' : `name: rig-${n}\n`))
}

function writeFile(rel: string, text: string, written: string[]): void {
  fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true })
  fs.writeFileSync(path.join(ROOT, rel), text)
  written.push(rel)
}

// The plugin's settings hooks, pointed at the project copy and merged into .claude/settings.json. A re-run removes
// every previous sdlc entry, in any event (so hooks a newer version retired go too); the project's own hooks are kept.
function mergeHooks(written: string[], dashboard: boolean): void {
  const plugin = JSON.parse(read(path.join(PLUGIN_ROOT, 'hooks', 'hooks.json'))) as { hooks: Record<string, HookGroup[]> }
  const file = path.join(ROOT, '.claude', 'settings.json')
  const settings = (read(file) ? JSON.parse(read(file)) : {}) as Record<string, unknown> & { hooks?: Record<string, HookGroup[]>; extraKnownMarketplaces?: object; enabledPlugins?: Record<string, boolean> }
  const hooks = settings.hooks ?? {}
  const ours = (g: HookGroup): boolean => g.hooks.some(h => h.command.includes(SDLC_HOOK))
  for (const [event, groups] of Object.entries(hooks)) {
    const kept = groups.filter(g => !ours(g))
    if (kept.length) hooks[event] = kept
    else delete hooks[event]
  }
  for (const [event, groups] of Object.entries(plugin.hooks)) {
    const copied = groups.map(g => ({
      ...g,
      hooks: g.hooks.map(h => ({ ...h, command: h.command.replace('${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts', `$CLAUDE_PROJECT_DIR/${SDLC_HOOK}`) })),
    }))
    hooks[event] = [...(hooks[event] ?? []), ...copied]
  }
  // The template's permissions too (deny and ask rules guard the evidence), merged under the project's own.
  mergeMissing(settings, { permissions: (JSON.parse(read(path.join(PLUGIN_ROOT, 'templates', 'settings.json'))) as { permissions: object }).permissions })
  // The dashboard mod is a local plugin: register its marketplace and enable it (an older 'rig-mod' entry is dropped).
  // Without the dashboard (the default, and always in core) both entries are dropped instead.
  const { 'rig-mod@rig-local': _oldMod, ...enabled } = settings.enabledPlugins ?? {}
  const { 'rig@rig-local': _mod, ...coreEnabled } = enabled
  const { 'rig-local': _market, ...coreMarkets } = (settings.extraKnownMarketplaces ?? {}) as Record<string, unknown>
  const merged: Record<string, unknown> = !dashboard
    ? { ...settings, hooks, extraKnownMarketplaces: coreMarkets, enabledPlugins: coreEnabled }
    : { ...settings, hooks, extraKnownMarketplaces: { ...settings.extraKnownMarketplaces, 'rig-local': { source: { source: 'directory', path: '.' } } }, enabledPlugins: { ...enabled, 'rig@rig-local': true } }
  writeFile('.claude/settings.json', JSON.stringify(merged, null, 2) + '\n', written)
}

export const pluginVersion = (): string => (JSON.parse(read(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'))) as { version?: string }).version ?? 'unknown'

// The journey dashboard (GOAL Scope 7) as a local plugin named 'rig': its state atoms are owned by plugin 'rig', so the copy must
// carry that name or the host refuses its writes.
function dashboardFiles(files: Map<string, string>): void {
  const version = pluginVersion()
  const json = (v: object): string => JSON.stringify(v, null, 2) + '\n'
  files.set('.rig/mod/hooks/dashboard.tsx', read(path.join(PLUGIN_ROOT, 'hooks', 'dashboard.tsx')))
  files.set('.rig/mod/hooks/hooks.json', json({ modules: ['./dashboard.tsx'] }))
  files.set('.rig/mod/.claude-plugin/plugin.json', json({ name: 'rig', version, types: './types/index.d.ts' }))
  files.set('.rig/mod/types/index.d.ts', read(path.join(PLUGIN_ROOT, 'types', 'index.d.ts')))
}

// The mod's marketplace file is rewritten only when it is rig's own.
function writeMarketplace(written: string[]): void {
  const market = path.join(ROOT, '.claude-plugin', 'marketplace.json')
  const mine = ((): boolean => { try { return !read(market) || (JSON.parse(read(market)) as { name?: string }).name === 'rig-local' } catch { return false } })()
  if (mine) writeFile('.claude-plugin/marketplace.json', JSON.stringify({ name: 'rig-local', owner: { name: 'rig' }, plugins: [{ name: 'rig', source: './.rig/mod' }] }, null, 2) + '\n', written)
}

// Every file the harness owns outright, as repo-relative posix path to final text. The manifest hashes exactly these.
export const MANIFEST = '.rig/bin/MANIFEST.json'
export type Manifest = { version: string; profile?: Profile; files: Record<string, string> }
// The dashboard is opt-in (--dashboard) and an upgrade keeps it: it is installed when the manifest hashed its module.
export const manifestDashboard = (m: Manifest | null): boolean => '.rig/mod/hooks/dashboard.tsx' in (m?.files ?? {})
export const manifestProfile = (m: Manifest | null): Profile => m?.profile ?? 'full'
export function readManifest(): Manifest | null {
  try { return JSON.parse(read(path.join(ROOT, MANIFEST))) as Manifest } catch { return null }
}

export function harnessFiles(standalone: boolean, profile: Profile = 'full', dashboard = false): Map<string, string> {
  const files = new Map<string, string>()
  for (const name of VENDORED) files.set(`.rig/bin/${name}.ts`, read(path.join(PLUGIN_ROOT, 'scripts', `${name}.ts`)))
  for (const [rel, text] of HOOK_SCRIPTS()) files.set(rel, text)
  files.set('.rig/bin/VERSION', `${pluginVersion()}\n`)
  files.set('.rig/bin/package.json', '{ "type": "module" }\n') // the checker is ES-module TypeScript, also in a commonjs repo
  if (!standalone) return files
  // The human-only skills (approve, waive, autonomy) come through here too: disable-model-invocation keeps them the person's, and
  // CI refuses approval rows a PR adds unless an independent reviewer approves.
  for (const name of fs.readdirSync(path.join(PLUGIN_ROOT, 'skills'))) {
    if (name === 'upgrade' || !skillIn(profile, name)) continue // upgrade runs only from the plugin (upgradeGates refuses a vendored copy)
    const src = path.join(PLUGIN_ROOT, 'skills', name, 'SKILL.md')
    if (fs.existsSync(src)) files.set(`.claude/commands/rig/${name}.md`, forProject(read(src)))
  }
  for (const file of fs.readdirSync(path.join(PLUGIN_ROOT, 'agents')).filter(f => f.endsWith('.md') && agentIn(profile, f))) {
    files.set(`.claude/agents/rig-${file}`, forProject(read(path.join(PLUGIN_ROOT, 'agents', file)), 'agent'))
  }
  const templates = path.join(PLUGIN_ROOT, 'templates')
  for (const file of (fs.readdirSync(templates, { recursive: true }) as string[]).filter(f => fs.statSync(path.join(templates, f)).isFile()).sort()) {
    if (file === README_CORE) continue // core's README block is written under the usual name below
    const text = read(path.join(templates, file === README_TEMPLATE && profile === 'core' ? README_CORE : file))
    files.set(`.rig/templates/${file}`, text)
  }
  if (dashboard) dashboardFiles(files)
  return files
}

// The files a project owns a share of, merged in place and never hashed: settings, CLAUDE.md, the README, the PRD docs, the marketplace.
export function mergeProjectFiles(written: string[], profile: Profile = 'full', dashboard = false): void {
  mergeHooks(written, dashboard)
  routeClaudeMd(written)
  routeReadme(written, profile)
  routePrdDocs(written)
  if (dashboard) writeMarketplace(written)
}

const README_TEMPLATE = 'readme-rig.md'
const README_CORE = 'readme-rig-core.md'
const README_BLOCK = /<!-- rig:begin[\s\S]*?<!-- rig:end -->/
// A repo vendored before the commands moved to .claude/commands/rig/ carries /rig-<skill> in CLAUDE.md, the README block and the PRD docs; a re-vendor
// repairs them to /rig:<skill>. Only real skill names match, so /rig-check, /rig-approved.yml, rig-evaluator and temp paths stay as they are.
const SKILL_NAMES = (fs.existsSync(path.join(PLUGIN_ROOT, 'skills')) ? fs.readdirSync(path.join(PLUGIN_ROOT, 'skills')) : []).sort((x, y) => y.length - x.length)
const OLD_SPELLING = new RegExp(`(?<![\\w./-])/rig-(${SKILL_NAMES.join('|')})(?![\\w-])`, 'g')
const repairedCommands = (text: string): string => text.replace(OLD_SPELLING, '/rig:$1')

// CLAUDE.md's routing line and guides block name /rig:start. The pre-0.12 routing line and the old /rig-start spelling migrate to the rig-on line.
// The guides block is re-hashed so the vendored `sync` finds it current, unless it was edited by hand (then `sync` reports it).
const OLD_ROUTING = /sdlc routes all work in this repo: start with \/rig[:-]start; use superpowers skills only when an sdlc skill names one\./
const NEW_ROUTING = 'rig is on in this repo: work from the request as usual, and its checks and guides run on every turn; /rig:start is the full workflow (spec, plan, approval), used only when the person asks for it. Use superpowers skills only when an sdlc skill names one.'
const OLD_ROUTING_SPELLING = NEW_ROUTING.replace('/rig:start', '/rig-start')
function routeClaudeMd(written: string[]): void {
  const file = 'CLAUDE.md'
  const text = read(path.join(ROOT, file))
  let routed = text.replace(OLD_ROUTING, NEW_ROUTING).replace(OLD_ROUTING_SPELLING, NEW_ROUTING)
  const block = findBlock(routed)
  if (block && sha(block.lines.join('\n')) === block.hash) routed = withBlock(routed, block.lines.map(repairedCommands))
  if (routed !== text) writeFile(file, routed, written)
}

// The README's rig block (from templates/readme-rig.md) names /rig:x; a repo vendored earlier says /rig-x there. Core replaces the whole block
// (a full one names /rig:chart, /rig:wiki and the rest); text outside the markers is never touched.
function routeReadme(written: string[], profile: Profile): void {
  const file = 'README.md'
  const text = read(path.join(ROOT, file))
  const core = read(path.join(PLUGIN_ROOT, 'templates', README_CORE)).trimEnd()
  const routed = text.replace(README_BLOCK, block => profile === 'core' ? core : repairedCommands(block))
  if (routed !== text) writeFile(file, routed, written)
}

// init --stack writes these two; an older one may still name /rig-chart. A person's PRDs are never touched.
function routePrdDocs(written: string[]): void {
  for (const file of ['docs/prd/README.md', 'docs/prd/prd-template.md']) {
    const text = read(path.join(ROOT, file))
    const routed = repairedCommands(text)
    if (routed !== text) writeFile(file, routed, written)
  }
}

export const older = (a: string, b: string): boolean => {
  const [x, y] = [a, b].map(v => v.split('.').map(n => Number.parseInt(n, 10) || 0))
  for (let i = 0; i < 3; i++) if ((x?.[i] ?? 0) !== (y?.[i] ?? 0)) return (x?.[i] ?? 0) < (y?.[i] ?? 0)
  return false
}

// The refusals vendor and upgrade share: a newer install than this plugin, and settings.json that is not plain JSON.
export function versionGuards(verb: string, args: Args): void {
  const have = read(path.join(SDLC, 'bin', 'VERSION')).trim()
  const next = pluginVersion()
  if (have && older(next, have) && !args.opt.force) fail(`.rig/bin is ${have}, newer than this plugin (${next}); upgrade the plugin first, or pass --force to downgrade`)
  try { if (read(path.join(ROOT, '.claude', 'settings.json'))) JSON.parse(read(path.join(ROOT, '.claude', 'settings.json'))) } catch { fail(`.claude/settings.json is not plain JSON (comments or trailing commas?); fix it first so ${verb} does not leave a half-written tree`) }
}

export function cmdVendor(args: Args): void {
  if (IS_VENDORED) fail('run vendor from the sdlc plugin, not from a project copy')
  if (older(process.versions.node, '22.18.0')) fail(`rig needs Node >= 22.18 (this is ${process.versions.node}); on an older Node its hooks fail silently and every gate is off`)
  versionGuards('vendoring', args)
  const next = pluginVersion()
  const written: string[] = []
  const standalone = Boolean(args.opt.standalone)
  // No --profile keeps what is installed, so the documented upgrade (re-run vendor --standalone) never turns core into full.
  const profile = args.opt.profile === undefined ? manifestProfile(readManifest()) : parseProfile(args.opt.profile)
  if (args.opt.profile !== undefined && !standalone) fail('--profile needs --standalone: a plain vendor copies no skills')
  if (args.opt.dashboard && !standalone) fail('--dashboard needs --standalone: the dashboard is a local plugin of the project copy')
  if (args.opt.dashboard && profile === 'core') fail('--dashboard needs the full profile: core ships no dashboard')
  const dashboard = profile === 'full' && (Boolean(args.opt.dashboard) || manifestDashboard(readManifest()))
  const files = harnessFiles(standalone, profile, dashboard)
  if (standalone) fs.rmSync(path.join(ROOT, '.rig', 'mod'), { recursive: true, force: true })
  const kept = standalone ? dropStale(files) : readManifest()?.files ?? {}
  for (const [rel, text] of files) {
    writeFile(rel, text, written)
    if (rel.startsWith('.rig/githooks/')) fs.chmodSync(path.join(ROOT, rel), 0o755)
  }
  if (standalone) mergeProjectFiles(written, profile, dashboard)
  if (standalone && args.opt.dashboard) enableCodeMode()
  // A plain vendor owns only the .rig/bin files: it keeps the standalone entries an earlier `vendor --standalone` recorded.
  const hashes = Object.fromEntries([...Object.entries(kept), ...[...files].map(([rel, text]): [string, string] => [rel, sha(text)])].sort(([a], [b]) => a.localeCompare(b, 'en')))
  writeFile(MANIFEST, JSON.stringify({ version: next, ...(profile === 'core' ? { profile } : {}), files: hashes }, null, 2) + '\n', written)
  sanctionWrites(written)
  out(standalone
    ? `vendored sdlc ${next} standalone: .rig/bin, .claude/commands/rig/*.md (typed /rig:<name>), .claude/agents/rig-*, hooks in .claude/settings.json. Commit .rig/ and .claude/; re-run from the plugin to upgrade.${args.opt.dashboard ? ` The dashboard needs Claude Code's experimental Code Mode: CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1 is set in .claude/settings.local.json (yours, not the team's); restart Claude Code.` : ''}`
    : `vendored sdlc ${next} into ${path.relative(ROOT, path.join(SDLC, 'bin'))} (${VENDORED.length} files). Commit it; CI runs the base branch's copy.`)
}

// Code Mode is experimental and per person, so the flag goes in settings.local.json, which Claude Code keeps out of git; other keys stay.
function enableCodeMode(): void {
  const rel = '.claude/settings.local.json'
  let local: { env?: Record<string, string> } = {}
  try { local = JSON.parse(read(path.join(ROOT, rel)) || '{}') } catch { fail(`${rel} is not plain JSON; fix it first so --dashboard can set CLAUDE_CODE_EXPERIMENTAL_CODE_MODE`) }
  writeFile(rel, JSON.stringify({ ...local, env: { ...local.env, CLAUDE_CODE_EXPERIMENTAL_CODE_MODE: '1' } }, null, 2) + '\n', [])
}

// Removes a folder an install emptied, and its parents under .claude/ that this left empty (skills/rig-x, skills, commands/rig, commands).
const PRUNABLE = ['.claude/skills', '.claude/commands/rig', '.claude/commands']
function pruneEmpty(dir: string): void {
  const rel = (d: string): string => path.relative(ROOT, d).split(path.sep).join('/')
  const prunable = (r: string): boolean => PRUNABLE.includes(r) || /^\.claude\/skills\/rig-[^/]+$/.test(r)
  for (let d = dir; prunable(rel(d)) && fs.existsSync(d) && !fs.readdirSync(d).length; d = path.dirname(d)) fs.rmdirSync(d)
}

// Harness files an earlier vendor wrote that this one does not (full -> core): untouched ones go, edited ones stay and keep
// their recorded hash, so upgrade still sees them as the person's.
function dropStale(files: Map<string, string>): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const [rel, hash] of Object.entries(readManifest()?.files ?? {})) {
    const abs = path.join(ROOT, rel)
    if (files.has(rel) || !isHarnessPath(rel) || !fs.existsSync(abs)) continue
    if (sha(read(abs)) !== hash) { kept[rel] = hash; out(`kept ${rel} (edited)`); continue }
    fs.rmSync(abs)
    const dir = path.dirname(abs)
    pruneEmpty(dir)
  }
  return kept
}

// Settings the template wants, merged under what the project already has: arrays are unioned and a key the project
// already sets keeps its value, so onboarding never overrides a team's own choice.
function mergeMissing(into: Record<string, unknown>, from: Record<string, unknown>): Record<string, unknown> {
  for (const [k, v] of Object.entries(from)) {
    const have = into[k]
    if (Array.isArray(v)) into[k] = [...new Set([...(Array.isArray(have) ? have : []), ...v])]
    else if (v && typeof v === 'object') into[k] = mergeMissing(have && typeof have === 'object' && !Array.isArray(have) ? have as Record<string, unknown> : {}, v as Record<string, unknown>)
    else if (have === undefined) into[k] = v
  }
  return into
}

// `init --plugin [--workflows]`: for a person who loads rig as a plugin (claude --plugin-dir). The plugin supplies skills, agents and hooks, so
// only the checker (.rig/bin, which CI and the git hooks run), the git hooks and the settings permissions are installed, and a standalone
// copy an earlier `init --full` left is removed: one copy of rig per repo, never both loaded.
const STANDALONE_PREFIXES = ['.claude/commands/rig/', '.claude/skills/rig-', '.claude/agents/rig-', '.rig/mod/']
function removeStandaloneCopy(): string[] {
  const lines: string[] = []
  const m = readManifest()
  if (m) {
    const files: Record<string, string> = {}
    for (const [rel, hash] of Object.entries(m.files)) {
      const abs = path.join(ROOT, rel)
      if (!STANDALONE_PREFIXES.some(p => rel.startsWith(p)) || !fs.existsSync(abs)) { if (!STANDALONE_PREFIXES.some(p => rel.startsWith(p))) files[rel] = hash; continue }
      if (sha(read(abs)) !== hash) { files[rel] = hash; lines.push(`kept ${rel} (edited): delete it by hand to leave one copy`); continue }
      fs.rmSync(abs)
      pruneEmpty(path.dirname(abs))
    }
    writeFile(MANIFEST, JSON.stringify({ ...m, files }, null, 2) + '\n', [])
  }
  for (const d of ['.claude/skills', '.claude/commands/rig', '.claude/commands', '.claude/agents']) { const abs = path.join(ROOT, d); if (fs.existsSync(abs) && fs.readdirSync(abs).length === 0) fs.rmdirSync(abs) }
  return lines
}

export function installPluginOnly(workflows: boolean): string {
  const lines = removeStandaloneCopy()
  cmdVendor({ pos: [], opt: {} })
  lines.push(...finishInstall(workflows, 'full', false))
  return lines.join('\n')
}

// `init --full [--workflows]`: the deterministic half of onboarding, so the model need not hand-copy files. Vendors the
// standalone harness, wires the git hooks and merges templates/settings.json. The CI workflows and REVIEW.md need a
// remote, so they are written only with --workflows, and never over a file that is already there.
export function installStandalone(workflows: boolean, profile: Profile = 'full', dashboard = false): string {
  cmdVendor({ pos: [], opt: { standalone: true, ...(profile === 'core' ? { profile } : {}), ...(dashboard ? { dashboard: true } : {}) } })
  return finishInstall(workflows, profile, true).join('\n')
}

// What an install left in the repo, counted from disk, each part with its path: a person looks for the skills, agents, hooks, sensors and
// guides after init (2026-11-23 rig_v1_test: a plugin-only init copied none and its report named no path).
export function inventory(): string {
  const ls = (rel: string, keep: (n: string) => boolean): string[] => { try { return fs.readdirSync(path.join(ROOT, rel)).filter(keep).sort() } catch { return [] } }
  const json = <T>(file: string, d: T): T => { try { return JSON.parse(read(file)) as T } catch { return d } }
  const skills = ls('.claude/commands/rig', n => n.endsWith('.md')).map(n => n.slice(0, -3))
  const agents = ls('.claude/agents', n => n.startsWith('rig-'))
  const events = Object.entries(json<{ hooks?: Record<string, HookGroup[]> }>(path.join(ROOT, '.claude', 'settings.json'), {}).hooks ?? {}).filter(([, g]) => g.some(x => x.hooks.some(h => h.command.includes(SDLC_HOOK)))).map(([e]) => e)
  const registry = json<{ sensors?: { id: string; builtin?: boolean }[] } | null>(path.join(SDLC, 'sensors.json'), null)
  const cmds = (registry?.sensors ?? []).filter(s => !s.builtin).map(s => s.id)
  const guides = ls('.rig/guides', n => n.endsWith('.md'))
  const row = (name: string, n: number, text: string): string => `  ${name.padEnd(8)}${String(n).padStart(3)}  ${text}`
  const fromPlugin = 'none in this repo: the plugin supplies them (claude --plugin-dir <rig checkout>); `init --full` copies them here'
  return [
    'rig in this repo:',
    row('skills', skills.length, skills.length ? `.claude/commands/rig/<name>.md (typed /rig:<name>): ${skills.join(', ')}` : fromPlugin),
    row('agents', agents.length, agents.length ? `.claude/agents/: ${agents.join(', ')}` : fromPlugin),
    row('hooks', events.length, `${events.length ? `.claude/settings.json: ${events.join(', ')}` : 'none in .claude/settings.json: the plugin runs them'}; git hooks in .rig/githooks/: ${ls('.rig/githooks', () => true).join(', ') || 'none'}`),
    row('sensors', cmds.length + BUILTIN_IDS.length, `${registry ? `.rig/sensors.json, ${cmds.length} command sensor(s): ${cmds.join(', ') || 'none'}` : 'no .rig/sensors.json yet (run init --stack)'}; ${BUILTIN_IDS.length} built in (.rig/bin/sensors.ts): ${BUILTIN_IDS.join(', ')}`),
    row('guides', guides.length, `.rig/guides/: ${guides.join(', ')}; CLAUDE.md carries one guide line per sensor (sync writes it)`),
    row('checker', ls('.rig/bin', n => n.endsWith('.ts')).length, `.rig/bin/*.ts (entry: .rig/bin/sdlc.ts); formats in .rig/templates/: ${ls('.rig/templates', () => true).length}`),
  ].join('\n')
}

// Git hooks, the settings template and (with --workflows) the CI files; shared by both install modes. Plugin-only mode registers no hooks in settings.json.
function finishInstall(workflows: boolean, profile: Profile, standalone: boolean): string[] {
  const hooks = installHooks()
  const lines = [hooks.ok ? hooks.message : `git hooks not installed: ${hooks.message}`]
  const file = path.join(ROOT, '.claude', 'settings.json')
  const { $comment: _comment, ...template } = JSON.parse(read(path.join(PLUGIN_ROOT, 'templates', 'settings.json'))) as Record<string, unknown>
  const merged = mergeMissing(JSON.parse(read(file) || '{}') as Record<string, unknown>, template)
  // An earlier template wrote this false, and mergeMissing keeps the project's value; rig's skills invoke superpowers, so it must be on.
  const plugins = (merged.enabledPlugins ?? {}) as Record<string, boolean>
  merged.enabledPlugins = { ...plugins, 'superpowers@claude-plugins-official': true }
  const written: string[] = []
  if (!standalone) { // the plugin's hooks.json runs the hooks; ours in settings.json would fire them twice
    const hooksBy = (merged.hooks ?? {}) as Record<string, HookGroup[]>
    for (const [event, groups] of Object.entries(hooksBy)) { const kept = groups.filter(g => !g.hooks.some(h => h.command.includes(SDLC_HOOK))); if (kept.length) hooksBy[event] = kept; else delete hooksBy[event] }
    if (Object.keys(hooksBy).length) merged.hooks = hooksBy; else delete merged.hooks
  }
  writeFile('.claude/settings.json', JSON.stringify(merged, null, 2) + '\n', written)
  lines.push('merged templates/settings.json into .claude/settings.json (existing values kept)')
  if (workflows) {
    for (const [from, to] of [['rig-check.yml', '.github/workflows/rig-check.yml'], ['rig-maintain.yml', '.github/workflows/rig-maintain.yml'], ['rig-approved.yml', '.github/workflows/rig-approved.yml'], ['REVIEW.md', 'REVIEW.md']] as const) {
      if (profile === 'core' && from === 'rig-maintain.yml') continue // Maintain is off in core
      if (fs.existsSync(path.join(ROOT, to))) lines.push(`${to} already exists; left as it is`)
      else { writeFile(to, read(path.join(PLUGIN_ROOT, 'templates', from)), written); lines.push(`wrote ${to}`) }
    }
  }
  sanctionWrites(written)
  return lines
}
