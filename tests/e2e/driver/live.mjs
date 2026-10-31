// The live driver: real `claude -p` sessions running the vendored skills with the real model. Costs money; capped.
import fs from 'node:fs'
import path from 'node:path'
import { readSession, sinceSession, totals } from '../assert/process.mjs'
import { PLUGIN } from '../lib/sandbox.mjs'
import { keepAwake } from '../lib/awake.mjs'

// `claude -p` never trusts the workspace, and an untrusted workspace's permissions.allow in .claude/settings.json is ignored
// ("Ignoring N permissions.allow entries ... has not been trusted"). The template's allow rules and env (foreground subagents,
// model pins) go in on --settings, which has no trust step.
// An eval adds its own allow rules and env on top (the same for every arm).
const templateSettings = ({ allow = [], env = {} } = {}) => {
  const t = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'templates/settings.json'), 'utf8'))
  return JSON.stringify({ permissions: { allow: [...t.permissions.allow, ...allow] }, env: { ...t.env, ...env } })
}

// One shared session log per run, so the spend cap covers every phase.
export function createSessions({ sb, out, capUsd = 6, model = 'claude-haiku-5-5', allow = [], env = {} }) {
  if (!(capUsd > 0)) throw new Error(`spend cap must be a positive number of dollars, got ${capUsd}`)
  keepAwake()
  const sessions = []
  const run = (label, prompt, { withPlugin = false, cont = false } = {}) => {
    const spent = totals(sessions).costUsd
    if (spent >= capUsd) throw new Error(`spend cap $${capUsd} reached ($${spent.toFixed(2)})`)
    const file = path.join(out, 'sessions', `${String(sessions.length).padStart(2, '0')}-${label}.jsonl`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const budget = Math.min(6, capUsd - spent)
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits',
      '--model', model, '--settings', templateSettings({ allow, env }), '--max-budget-usd', budget.toFixed(2), '--setting-sources', 'project,local',
      ...(withPlugin ? ['--plugin-dir', PLUGIN] : []), ...(cont ? ['--continue'] : [])]
    const r = sb.run('claude', args, { timeout: 18 * 60_000 })
    fs.writeFileSync(file, r.stdout ?? '')
    if (r.status !== 0 && !r.stdout) throw new Error(`claude exited ${r.status}: ${(r.stderr ?? '').split('\n')[0]}`)
    // The conversation this call resumes, back to its first session: the last of its sessions that printed a result (a crashed one printed none).
    let prev = null
    for (let i = sessions.length - 1; cont && i >= 0; i--) {
      if (sessions[i].running) { prev = sessions[i]; break }
      if (!sessions[i].cont) break
    }
    const s = sinceSession(readSession(file), prev)
    s.cont = cont
    // A killed or crashed session prints no result event: readSession priced the tokens it streamed (an estimate), never above its budget.
    // One that streamed nothing is unknown: count its whole budget as spent.
    if (!s.ended) s.costUsd = s.estimated ? Math.min(s.costUsd, budget) : budget
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
    async plan(slug) {
      // /rig-start carries on into the plan in the same turn when it can; a person does not type /rig:plan over a plan that is written and reviewed.
      const has = f => (sb.read?.(`.rig/changes/${slug}/${f}`) ?? '') !== ''
      // A light plan with no contracts is never evaluated (skills/plan step 5), so plan-review.md is only expected of a full or contract plan.
      const contracts = /^## Contracts\n(?:\s*\n)*- /m.test(sb.read?.(`.rig/changes/${slug}/plan.md`) ?? '')
      const light = JSON.parse(sb.sdlc?.(['weight', slug, '--json']).stdout || '{}').weight === 'light'
      if (has('plan.md') && (has('plan-review.md') || (light && !contracts))) return
      sessions.run(`${phase.id}-plan`, `/rig-plan ${slug}. Write plan.md, then stop for the person's approval.`, { cont: true })
    },
    // The person's reply to open questions, the same words for every arm: take your recommended default and carry on.
    async answer(slug, why) {
      sessions.run(`${phase.id}-answer`, `/rig-plan ${slug}. The person answers your open questions: for each one take the option you recommend, record it under ## Decisions in spec.md and plan.md, and set ## Open questions to none in both, then stop for approval. Open now:\n${why}`, { cont: true })
    },
    reapproved: 0,
    reapprovalNotes: [], // the plan's Decisions at each re-approval, so a reader of the results sees what the stand-in approved
    async build(slug) {
      sessions.run(`${phase.id}-build`, `/rig-build ${slug}. The person approved the plan: build test-first, then /rig-test and /rig-pr in this turn.`, { cont: true })
      const st = () => (JSON.parse(sb.sdlc(['status', '--json']).stdout || '{}').changes ?? []).find(c => c.slug === slug)?.status
      // A build that must touch a file outside the approved plan records it and stops for the person. The person reads the note and
      // re-approves (the same stand-in as answer()); the build then carries on in the next session.
      if (st() === 'approve') {
        const decisions = /^## Decisions\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(sb.read?.(`.rig/changes/${slug}/plan.md`) ?? '')?.[1]?.trim() ?? ''
        const a = sb.sdlc(['approve', slug], { human: true })
        if (a.status !== 0) throw new Error(`re-approval refused: ${(a.stderr || a.stdout).trim().split('\n')[0]}`)
        this.reapproved++
        this.reapprovalNotes.push(decisions.slice(0, 300))
      }
      if (st() !== 'review') sessions.run(`${phase.id}-build-2`, `/rig-build ${slug}. Continue from where it stopped: finish the tests, then /rig-test and /rig-pr until the PR is open.`, { cont: true })
    },
  }
}
