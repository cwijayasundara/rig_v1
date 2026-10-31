// The live act driver: real `claude -p` sessions run each rig step; state (never prose) says where rig stopped.
import fs from 'node:fs'
import path from 'node:path'
import { liveDriver } from '../driver/live.mjs'
import { totals } from '../assert/process.mjs'
import { mergeToMain } from '../lib/merge.mjs'

const HERE = import.meta.dirname
export const INIT_PROMPT = '/rig:init --quick'
export const SKELETON = path.join(HERE, 'skeleton')
export const ANSWERS = path.join(HERE, 'answers')
const MAX_CONTINUATIONS = 3
const json = t => { try { return JSON.parse(t) } catch { return null } }
const first = r => (r.stderr || r.stdout || '').trim().split('\n')[0]
const files = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => !f.startsWith('.')).sort() : [])

// The repo as a person finds it before init: a Python skeleton and the PRDs, committed on main.
export function setupSandbox(sb) {
  sb.isolate()
  fs.cpSync(SKELETON, sb.dir, { recursive: true })
  for (const f of files(path.join(HERE, 'prd')).filter(f => f.endsWith('.md'))) {
    fs.mkdirSync(path.join(sb.dir, 'docs/prd'), { recursive: true })
    fs.copyFileSync(path.join(HERE, 'prd', f), path.join(sb.dir, 'docs/prd', f))
  }
  sb.commitAll('chore: scaffold')
}

// A chart or a change finishes on its own branch; the person merges it. Same here.
const landOnMain = sb => {
  sb.commitAll('chore: session leftovers')
  const branch = sb.git('rev-parse', '--abbrev-ref', 'HEAD')
  if (branch === 'main') return
  sb.git('checkout', '-q', 'main')
  sb.git('merge', '-q', '--no-ff', '-m', `Merge ${branch}`, branch)
}

export function journeyDriver({ sb, sessions, answersDir = ANSWERS, reviewer = null, liveDriverFor = phase => liveDriver(sb, phase, { sessions }) }) {
  let live = null
  const answers = () => files(answersDir).map(f => fs.readFileSync(path.join(answersDir, f), 'utf8').trim()).join('\n')
  const sprintDir = n => `.rig/product/sprints/sprint-${n}`

  // Where the chart stands, from state: a converted PRD awaiting approval, open questions, or no intents written yet.
  const pending = n => {
    if (/^(missing|stale)/.test(sb.sdlc(['prd', 'status', String(n)]).stdout)) return { kind: 'prd' }
    const found = json(sb.sdlc(['chart', 'check', String(n), '--cases', '--json']).stdout) ?? []
    const open = found.filter(f => /question/.test(f.rule ?? ''))
    if (open.length) return { kind: 'questions', detail: open.map(f => `${f.rule}@${f.where}`).join(', ') }
    if (files(path.join(sb.dir, sprintDir(n), 'intents')).length === 0) return { kind: 'incomplete' }
    return { kind: 'none' }
  }
  const requireApproval = async (stage, artefacts, what) => {
    if (!reviewer) return
    const d = await reviewer.review({ sb, stage, artefacts })
    if (d.decision !== 'approve') throw new Error(`reviewer rejected the ${what}: ${d.reasons.join('; ')}`)
  }

  return {
    sessions,
    spentUsd: () => totals(sessions.sessions).costUsd,

    async init() {
      sessions.run('J0-init', INIT_PROMPT, { withPlugin: true })
      sb.commitAll('chore: onboarding leftovers')
    },

    async chart(sprint, prd) {
      sessions.run(`J-chart-${sprint}`, `/rig-chart ${sprint} @${prd}`)
      for (let i = 0; ; i++) {
        const p = pending(sprint)
        if (p.kind === 'none') break
        if (i === MAX_CONTINUATIONS) throw new Error(`stuck-on-input: chart ${sprint} still ${p.kind}${p.detail ? ` (${p.detail})` : ''} after ${MAX_CONTINUATIONS} continuations`)
        if (p.kind === 'prd') {
          await requireApproval(`chart-${sprint}-conversion`, [`${sprintDir(sprint)}/prd.md`, `${sprintDir(sprint)}/conversion.md`], 'PRD conversion')
          sb.sdlc(['approve', `prd-${sprint}`, '--by', 'journey'], { human: true })
          sessions.run(`J-chart-${sprint}-after-prd`, `/rig-chart ${sprint}`, { cont: true })
        } else {
          const a = p.kind === 'questions' ? answers() : ''
          if (p.kind === 'questions' && !a) throw new Error(`stuck-on-input: chart ${sprint} asks (${p.detail}) and journey/answers has no answer`)
          sessions.run(`J-chart-${sprint}-cont${i + 1}`, `/rig-chart ${sprint}${a ? `\nThe person answers your open questions:\n${a}` : '\nContinue where you stopped and finish the chart.'}`, { cont: true })
        }
      }
      landOnMain(sb)
    },

    // The reviewer's decision has already been made by the orchestrator; this only runs the person's command.
    async approveChart(sprint) {
      const a = sb.sdlc(['approve', `chart-${sprint}`], { human: true })
      if (a.status !== 0) throw new Error(`approve refused: ${first(a)}`)
      sb.commitAll(`chore: approve chart-${sprint}`)
      landOnMain(sb)
    },

    async startIntent(intentPath) {
      const slug = path.basename(intentPath, '.md')
      live = liveDriverFor({ id: `J-${slug}`, prompt: `/rig-start ${intentPath}` })
      return live.begin()
    },

    async buildIntent(slug) {
      await live.plan(slug)
      await requireApproval(`plan-${slug}`, [`.rig/changes/${slug}/spec.md`, `.rig/changes/${slug}/plan.md`], 'plan')
      let a = sb.sdlc(['approve', slug], { human: true })
      if (a.status !== 0 && live.answer && /open question/.test(a.stderr + a.stdout)) {
        await live.answer(slug, (a.stderr || a.stdout).trim())
        a = sb.sdlc(['approve', slug], { human: true })
      }
      if (a.status !== 0) throw new Error(`approve refused: ${first(a)}`)
      await live.build(slug)
      sb.commitAll('chore: session leftovers')
      await requireApproval(`pr-${slug}`, [`git diff main...HEAD`, `.rig/changes/${slug}/`], 'PR')
      mergeToMain(sb, slug)
    },
  }
}
