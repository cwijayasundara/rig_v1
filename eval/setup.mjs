// How one eval run's sandbox starts: the same scaffold and brief for every arm; rig arms are onboarded the way S0 and S1 do it.
import fs from 'node:fs'
import path from 'node:path'
import { install, REGISTRY, copyContractTool } from '../tests/e2e/phases/s0-install.mjs'
import { installedPlugins } from '../tests/e2e/lib/sandbox.mjs'
import { runBrief } from '../tests/e2e/phases/s1-brief.mjs'
import { briefFor, dryOverlay } from './variants/links.mjs'
import { briefFor as rulesBrief, dryOverlay as rulesOverlay } from './variants/rules.mjs'
import { briefFor as pricingBrief, dryOverlay as pricingOverlay } from './variants/pricing.mjs'
import { applyAblation } from './ablation.mjs'

const BRIEF = path.resolve(import.meta.dirname, '../tests/e2e/prd/shop-brief.md')
const FX = path.resolve(import.meta.dirname, '../tests/e2e/fixtures')

export const BARE_PROMPT = 'Build the shop described in BRIEF.md: behaviours B1–B6, in src/, with node --test tests in test/ whose names start with their B-number, `npm test` passing, and `npm start` serving the HTTP API as the brief says. Keep the HTTP contract in api/openapi.yaml and contracts/examples/ (node scripts/contract.mjs validate|run checks it). Work until it is done. In this unattended session, read files with Read, Grep and Glob and change them with Edit or Write; run each command as its own Bash call (no cd, pipes, redirects, &&, ; or heredocs): compound commands are denied.'

export const BARE_PROMPT_LINKS = BARE_PROMPT.replace('behaviours B1–B6', 'behaviours B1–B7')
export const BARE_PROMPT_RULES = BARE_PROMPT.replace('behaviours B1–B6', 'behaviours B1–B9')
// The delta variant: the shop already has B1–B7 built and passing; the session adds B8 and B9 (B9 reverses an earlier rule, so its old test changes).
export const BARE_PROMPT_DELTA = BARE_PROMPT.replace('Build the shop described in BRIEF.md: behaviours B1–B6, in src/,', 'The shop described in BRIEF.md already has behaviours B1–B7 built and passing. Add B8 and B9 to it, editing the existing files in src/,').replace('whose names start with their B-number', 'whose names start with their B-number (update an earlier test only where B9 changes its rule)')
// The pricing variant: B1–B9 are built and passing; the session adds B10–B12, whose rules are many and exact.
export const BARE_PROMPT_PRICING = BARE_PROMPT.replace('Build the shop described in BRIEF.md: behaviours B1–B6, in src/,', 'The shop described in BRIEF.md already has behaviours B1–B9 built and passing. Add B10, B11 and B12 to it, editing the existing files in src/,').replace('whose names start with their B-number', 'whose names start with their B-number (B10 in test/pricing.test.js, B11 in test/coupons.test.js, B12 in test/cancel.test.js)')
const BRIEFS = { links: briefFor, rules: rulesBrief, delta: rulesBrief, pricing: pricingBrief }
const briefText = variant => (BRIEFS[variant] ?? (b => b))(fs.readFileSync(BRIEF, 'utf8'))

// The layers the shop brief's own Architecture section states: http on top, nothing depends on http.
const LAYERS = '# Architecture\n\n## Layers\n\n```rig-layers\nlayer catalog src/catalog/**\nlayer cart src/cart/**\nlayer orders src/orders/**\nlayer http src/http/**\nallow cart -> catalog\nallow orders -> cart, catalog\nallow http -> catalog, cart, orders\nexample catalog src/catalog/products.js\n```\n'

// B1–B7 as a perfect session leaves them (the links dry overlay): the starting point every arm of the delta variant shares.
function seedBase(sb, variant) {
  fs.cpSync(path.join(FX, 'shop'), sb.dir, { recursive: true })
  fs.cpSync(path.join(FX, 'remove'), sb.dir, { recursive: true })
  dryOverlay(sb)
  if (variant === 'pricing') rulesOverlay(sb)
}

export function setupBare(sb, { dry = false, variant = null } = {}) {
  sb.isolate(dry ? [] : installedPlugins())
  sb.write('package.json', JSON.stringify({ name: 'shop-app', version: '0.1.0', type: 'module', scripts: { start: 'node src/server.js', test: 'node --test' } }, null, 2) + '\n')
  sb.write('src/index.js', 'export {}\n')
  sb.write('test/smoke.test.js', "import { test } from 'node:test'\nimport '../src/index.js'\ntest('loads', () => {})\n")
  copyContractTool(sb)
  sb.write('BRIEF.md', briefText(variant))
  sb.write('CLAUDE.md', '# shop-app\n\nThe product brief is BRIEF.md.\n')
  if (variant === 'delta' || variant === 'pricing') seedBase(sb, variant)
  sb.commitAll('chore: scaffold')
  return sb.git('rev-parse', 'HEAD')
}

// The scaffold commit is the base for tamper scoring; install and brief land on top of it.
export async function setupRig(sb, arm, { dry = false, variant = null } = {}) {
  const registry = { ...REGISTRY, policy: { haiku: arm.policy, sonnet: 'continuous', opus: 'final', default: 'continuous' } }
  const c = await install(sb, { registry, plugins: dry ? [] : installedPlugins() })
  if (c.failed.length) throw new Error(`install failed: ${c.failed.map(f => f.name).join('; ')}`)
  const base = sb.git('rev-list', '--max-parents=0', 'HEAD')
  const b = await runBrief(sb, { brief: briefText(variant) })
  if (b.failed.length) throw new Error(`brief failed: ${b.failed.map(f => f.name).join('; ')}`)
  // Rig is onboarded on the empty scaffold; the built shop lands after, in a commit of its own that tamper does not judge (run.mjs settles after setup).
  if (variant === 'delta' || variant === 'pricing') { seedBase(sb, variant); sb.commitAll(`chore: ${variant === 'pricing' ? 'B1–B9' : 'B1–B7'} baseline`) }
  if (arm.arch) {
    // The person declares the layers and approves them once, before the sessions start: this arm differs only in that.
    sb.write('.rig/product/architecture.md', LAYERS)
    const a = sb.sdlc(['arch', 'approve'], { human: true })
    if (a.status !== 0) throw new Error(`arch approve failed: ${(a.stderr || a.stdout).trim().split('\n')[0]}`)
    sb.commitAll('chore: approved layers')
  }
  // An ablation arm is rig with one component removed (eval/ablation.mjs).
  if (arm.ablate) applyAblation(sb, arm.ablate)
  return base
}

// Dry bare: what a perfect bare session leaves behind.
export function dryBare(sb, { variant = null } = {}) {
  fs.cpSync(path.join(FX, 'shop'), sb.dir, { recursive: true })
  fs.cpSync(path.join(FX, 'remove'), sb.dir, { recursive: true })
  if (['links', 'rules', 'delta', 'pricing'].includes(variant)) dryOverlay(sb)
  if (['rules', 'delta', 'pricing'].includes(variant)) rulesOverlay(sb)
  if (variant === 'pricing') pricingOverlay(sb)
}
