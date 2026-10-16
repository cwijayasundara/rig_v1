// The live driver: real `claude -p` sessions running the vendored skills with the real model. Costs money; capped.
import fs from 'node:fs'
import path from 'node:path'
import { readSession, totals } from '../assert/process.mjs'
import { PLUGIN } from '../lib/sandbox.mjs'

// `claude -p` never trusts the workspace, and an untrusted workspace's permissions.allow in .claude/settings.json is ignored
// ("Ignoring N permissions.allow entries ... has not been trusted"). The template's allow rules and env (foreground subagents,
// model pins) go in on --settings, which has no trust step.
const templateSettings = () => {
  const t = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'templates/settings.json'), 'utf8'))
  return JSON.stringify({ permissions: { allow: t.permissions.allow }, env: t.env })
}

// One shared session log per run, so the spend cap covers every phase.
export function createSessions({ sb, out, capUsd = 6, model = 'claude-haiku-5-5' }) {
  if (!(capUsd > 0)) throw new Error(`spend cap must be a positive number of dollars, got ${capUsd}`)
  const sessions = []
  const run = (label, prompt, { withPlugin = false, cont = false } = {}) => {
    const spent = totals(sessions).costUsd
    if (spent >= capUsd) throw new Error(`spend cap $${capUsd} reached ($${spent.toFixed(2)})`)
    const file = path.join(out, 'sessions', `${String(sessions.length).padStart(2, '0')}-${label}.jsonl`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const budget = Math.min(6, capUsd - spent)
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
      '--model', model, '--settings', templateSettings(), '--max-budget-usd', budget.toFixed(2), '--setting-sources', 'project,local',
      ...(withPlugin ? ['--plugin-dir', PLUGIN] : []), ...(cont ? ['--continue'] : [])]
    const r = sb.run('claude', args, { timeout: 18 * 60_000 })
    fs.writeFileSync(file, r.stdout ?? '')
    if (r.status !== 0 && !r.stdout) throw new Error(`claude exited ${r.status}: ${(r.stderr ?? '').split('\n')[0]}`)
    const s = readSession(file)
    // A killed or crashed session prints no result event, so its cost is unknown: count its whole budget as spent.
    if (!s.ended) s.costUsd = Math.max(s.costUsd, budget)
    sessions.push(s)
    console.log(`  live ${label}: $${s.costUsd.toFixed(2)}, ${s.turns} turns, ${s.denials.length} denial(s), total $${totals(sessions).costUsd.toFixed(2)} of $${capUsd}`)
    return s
  }
  return { sessions, run }
}

export function liveDriver(sb, phase, { sessions }) {
  return {
    sessions: sessions.sessions,
    async begin() {
      sessions.run(`${phase.id}-start`, phase.prompt)
      const active = () => JSON.parse(sb.sdlc(['status', '--json']).stdout).active
      // /rig-start can end its turn while a scout is still running. Continue the same conversation, but with the skill invocation itself:
      // the skill's allowed-tools are what let the model run sdlc.ts, and a plain-text "continue" is denied (`sdlc.ts new` needs approval).
      for (let i = 0; i < 2 && !active(); i++) sessions.run(`${phase.id}-start-cont${i + 1}`, phase.prompt, { cont: true })
      if (!active()) throw new Error(`${phase.id}: /rig-start created no change after 2 continuations`)
      return active()
    },
    async step(node) {
      sessions.run(`${phase.id}-${node}`, '/rig-next — continue through the next node; follow the text of `sdlc.ts skill <node>` exactly, never invoke the Skill tool, one command per Bash call with no pipes or compound commands; the sdlc.ts scripts make every commit, so never run git commit yourself')
    },
  }
}
