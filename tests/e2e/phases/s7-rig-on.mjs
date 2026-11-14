// S7: rig on, greenfield. Once rig is installed it is always on (docs/GOAL.md): freeform work with no change open gets the same
// sensors, the Stop gate and the carried warnings; the W1 agent records and the W2 plan-check, proof and stand-in rules hold. Every
// edit goes through the hook entry points the way the scripted driver drives them. Runs on the extras shop, after S2 and S3.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Checks, json } from '../lib/checks.mjs'
import { writeFixture } from './s6-chart.mjs'
import { archStandinChecks } from './arch-standin.mjs'

const SESSION = 's7-rig-on'
const hook = (sb, name, payload = {}) => sb.sdlc(['hook', name], { input: JSON.stringify({ session_id: SESSION, ...payload }) })
const parsed = r => json(r.stdout.trim().split('\n').filter(Boolean).pop() ?? '') ?? {}
const secret = () => `${['export const apiKey', '=', JSON.stringify(crypto.randomBytes(16).toString('hex'))].join(' ')}\n`
const unresolved = sb => { const u = sb.read('.rig/unresolved.json'); return u ? [...new Set(json(u).findings.map(f => f.sensor))].sort() : [] }
const edited = (sb, file) => hook(sb, 'post-edit', { tool_input: { file_path: sb.file(file) } })
const changes = sb => (json(sb.sdlc(['status', '--json']).stdout)?.changes ?? []).map(c => c.slug)

// One freeform turn: a prompt, the edits, a post-edit per file, Stop. Returns Stop's result and what it printed.
function turn(sb, prompt, edits) {
  hook(sb, 'prompt-submit', { prompt })
  for (const [file, text] of Object.entries(edits)) { sb.write(file, text); edited(sb, file) }
  const r = hook(sb, 'stop')
  return { r, out: parsed(r), blocked: unresolved(sb) }
}
// Undo a turn and let one clean turn reset the gate, so the next turn starts from nothing.
function settle(sb, files) {
  for (const f of files) { if (sb.run('git', ['ls-files', '--error-unmatch', f]).status === 0) sb.run('git', ['checkout', '--', f]); else sb.run('rm', ['-f', sb.file(f)]) }
  sb.run('rm', ['-f', sb.file('.rig/unresolved.json')])
  hook(sb, 'prompt-submit', { prompt: 'settle' })
  hook(sb, 'stop')
}

async function freeform(c, sb) {
  const before = changes(sb)
  const ctx = parsed(hook(sb, 'session-start', { model: 'claude-sonnet-5-5', source: 'startup' })).hookSpecificOutput?.additionalContext ?? ''
  await c.check('S7: SessionStart prints "No active change" and names /rig-start with rig on', () => (/No active change/.test(ctx) && /\/rig-start/.test(ctx)) || ctx.split('\n').slice(0, 4).join(' | '))

  const leak = turn(sb, 'add a key', { 'src/s7-leak.js': secret() })
  await c.check('S7: a freeform edit that writes a secret is blocked by the Stop gate with no change active', () => (leak.out.decision === 'block' && leak.blocked.includes('secrets')) || `decision ${leak.out.decision}; fired ${leak.blocked.join(', ') || 'none'}`)
  settle(sb, ['src/s7-leak.js'])

  const orders = sb.read('src/orders/orders.js')
  const broke = turn(sb, 'tweak a discount', { 'src/orders/orders.js': orders.replace('SAVE10: 0.1', 'SAVE10: 0.5') })
  await c.check('S7: a freeform edit that breaks the unit sensor is blocked, and the edit named the sensor', () => (broke.out.decision === 'block' && broke.blocked.includes('unit') && /unit/.test(broke.out.reason ?? '')) || `decision ${broke.out.decision}; fired ${broke.blocked.join(', ') || 'none'}`)
  settle(sb, ['src/orders/orders.js'])

  const products = sb.read('src/catalog/products.js')
  const clean = turn(sb, 'add a comment', { 'src/catalog/products.js': `${products}// a harmless note\n` })
  await c.check('S7: a clean freeform edit passes the Stop gate', () => (clean.out.decision !== 'block' && clean.blocked.length === 0) || `decision ${clean.out.decision}; fired ${clean.blocked.join(', ')}`)
  settle(sb, ['src/catalog/products.js'])

  const wide = turn(sb, 'add a long comment', { 'src/catalog/products.js': `${products}// ${'a very long explanatory note '.repeat(12)}\n` })
  await c.check('S7: a warning does not block the turn but is reported', () => (wide.out.decision !== 'block' && /warning\(s\), not blocking/.test(wide.out.systemMessage ?? '')) || JSON.stringify(wide.out).slice(0, 160))
  const next = parsed(hook(sb, 'prompt-submit', { prompt: 'continue' }))
  await c.check("S7: the last turn's unfixed warnings are carried into the next prompt", () => /the last turn left \d+ warning/.test(next.hookSpecificOutput?.additionalContext ?? '') || JSON.stringify(next).slice(0, 160))
  const again = parsed(hook(sb, 'prompt-submit', { prompt: 'continue again' }))
  await c.check('S7: carried warnings are shown once, not every prompt', () => !/the last turn left/.test(again.hookSpecificOutput?.additionalContext ?? '') || 'shown twice')
  settle(sb, ['src/catalog/products.js'])

  // The start nudge: /rig-start from a main thread on another model than the repo builds on names the switch.
  const transcript = path.join(sb.logs, 's7-transcript.jsonl')
  fs.writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', message: { model: 'claude-opus-5-5', usage: { input_tokens: 1000 } } })}\n`)
  const nudge = parsed(hook(sb, 'prompt-submit', { prompt: '/rig-start add a thing', transcript_path: transcript }))
  await c.check('S7: UserPromptSubmit prints the start nudge for /rig-start on the wrong model', () => /^rig: .*\/model /.test(nudge.systemMessage ?? '') || JSON.stringify(nudge).slice(0, 160))
  settle(sb, [])
  await c.check('S7: the freeform turns opened no change record and left the tree clean', () => (JSON.stringify(changes(sb)) === JSON.stringify(before) && sb.git('status', '--porcelain') === '') || `changes ${changes(sb)}; status ${sb.git('status', '--porcelain')}`)
}

// W1: the Agent hooks write the launch and done rows, and the sixth counted launch is refused.
async function agents(c, sb) {
  const slug = 's7-agents'
  const launch = id => hook(sb, 'agent-launch', { tool_use_id: id, tool_input: { subagent_type: 'rig:builder', model: 'sonnet', description: `task ${id}` } })
  sb.sdlc(['new', slug, '--type', 'feature'])
  const first = launch('a1')
  hook(sb, 'agent-done', { tool_use_id: 'a1', tool_response: { content: [{ type: 'text', text: 'built\nstatus: DONE' }], totalTokens: 900, totalToolUseCount: 4, totalDurationMs: 5000 } })
  for (const id of ['a2', 'a3', 'a4', 'a5']) launch(id)
  const sixth = launch('a6')
  const rows = sb.read(`.rig/changes/${slug}/evidence/agents.jsonl`).trim().split('\n').filter(Boolean).map(json)
  await c.check('S7: an Agent launch with a change active writes a launch row to evidence/agents.jsonl', () => (rows[0]?.kind === 'launch' && rows[0].agent === 'rig:builder' && rows[0].model === 'sonnet') || JSON.stringify(rows[0]))
  await c.check('S7: the agent-done hook writes a done row with the status and cost', () => { const d = rows.find(r => r.kind === 'done'); return (d?.id === 'a1' && d.status === 'DONE' && d.tokens === 900) || JSON.stringify(d) })
  await c.check('S7: five launches pass', () => !/deny/.test(first.stdout) || first.stdout)
  const d = parsed(sixth).hookSpecificOutput
  await c.check('S7: the sixth counted launch is refused with the draft-PR way out', () => (d?.permissionDecision === 'deny' && /launch budget/.test(d.permissionDecisionReason) && /--draft/.test(d.permissionDecisionReason)) || sixth.stdout)
  await c.check('S7: the refused launch is recorded nowhere', () => rows.filter(r => r.kind === 'launch').length === 5 || `${rows.filter(r => r.kind === 'launch').length} launch rows`)
}

// W2: with gates.plan false the plan is committed by plan-check, a contract edit on the branch blocks, and unit-only proof warns.
async function planGate(c, sb) {
  const slug = 's7-plan'
  const reg = json(sb.read('.rig/sensors.json'))
  sb.write('.rig/sensors.json', `${JSON.stringify({ ...reg, gates: { plan: false } }, null, 2)}\n`)
  sb.commitAll('chore: gates.plan off')
  sb.sdlc(['new', slug, '--type', 'feature'])
  sb.write(`.rig/changes/${slug}/spec.md`, '# Spec\n\n## Behaviours\n- B1: the shop lists products\n- B2: the shop lists them in order\n\n## Open questions\nnone\n')
  sb.write(`.rig/changes/${slug}/plan.md`, '# Plan\n\n## Files\n- src/catalog/products.js\n\n## Open questions\nnone\n')
  const committed = sb.sdlc(['plan-check', slug, '--commit'])
  const plan = sb.run('git', ['log', '--format=%H', '-1', '--', `.rig/changes/${slug}/plan.md`]).stdout.trim()
  await c.check('S7: with gates.plan false, plan-check --commit commits the plan', () => (committed.status === 0 && plan !== '' && sb.git('status', '--porcelain', '--', `.rig/changes/${slug}/plan.md`) === '') || `exit ${committed.status}: ${(committed.stdout + committed.stderr).trim().split('\n')[0]}`)
  const clean = sb.sdlc(['plan-check', slug])
  await c.check('S7: plan-check passes on the untouched contract', () => clean.status === 0 || clean.stdout.trim().split('\n').slice(0, 2).join(' | '))
  sb.write('api/openapi.yaml', `${sb.read('api/openapi.yaml')}# an edit on the change branch\n`)
  sb.commitAll('feat: touch the contract')
  const blocked = sb.sdlc(['plan-check', slug])
  await c.check('S7: a contract edit on the change branch blocks plan-check', () => (blocked.status === 1 && /contract api\/openapi\.yaml changed on a change branch/.test(blocked.stdout)) || `exit ${blocked.status}: ${blocked.stdout.trim().split('\n')[0]}`)
  // Proof: B1 is named by a holdout case, B2 only by unit tests.
  sb.write(`.rig/changes/${slug}/intent.md`, `---\nslug: ${slug}\ntype: feature\nsprint: 1\n---\n# ${slug}\n\n## Intent\n\n## Open questions\nnone\n`)
  const head = '| ID | Requirement | Intent | Behaviour | Level | Data | Expected | Access |\n|---|---|---|---|---|---|---|---|\n'
  const row = (id, b, level) => `| ${id} | FR-1 | ${slug} | ${b} | ${level} | - | it works | - |`
  sb.write('.rig/product/sprints/sprint-1/testplan/cases.md', `# Cases\n\n${head}${row('TC-1', 'B1', 'holdout')}\n${row('TC-2', 'B2', 'unit')}\n`)
  const v = sb.sdlc(['verify', slug])
  await c.check('S7: a behaviour proved only by a unit test gives a proof warning naming the count', () => /proof 1\b/.test(v.stdout + v.stderr) || (v.stdout + v.stderr).trim().split('\n').slice(0, 3).join(' | '))
}

async function standin(c, sb) {
  writeFixture(sb)
  await archStandinChecks(c, sb, 'S7', sb.read('.rig/product/architecture.md'))
}

export async function runRigOn(sb) {
  const c = new Checks('S7 rig on (greenfield)')
  const start = sb.git('rev-parse', 'HEAD')
  const probe = (name, fn) => async () => {
    sb.git('checkout', '-q', '-b', name)
    try { await fn(c, sb) } finally {
      sb.git('checkout', '-q', '-f', 'main')
      sb.run('git', ['clean', '-fdq'])
      sb.run('git', ['branch', '-q', '-D', name])
      sb.run('rm', ['-rf', sb.file('.rig/changes'), sb.file('.rig/state/active')])
      sb.run('git', ['checkout', '-q', '--', '.'])
    }
  }
  for (const run of [probe('s7-freeform', freeform), probe('s7-agents', agents), probe('s7-plan', planGate), probe('s7-standin', standin)]) await run()
  await c.check('S7: the tree is clean and main is where it was', () => (sb.git('status', '--porcelain') === '' && sb.git('rev-parse', 'HEAD') === start) || `status: ${sb.git('status', '--porcelain').split('\n').join('; ')}`)
  return c
}
