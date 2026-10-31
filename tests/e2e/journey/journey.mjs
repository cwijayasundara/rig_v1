// The orchestrator: act, gate, inspect, log. Knows nothing about Claude; the driver, inspector and reviewer are passed in.
import fs from 'node:fs'
import path from 'node:path'
import { Checks } from '../lib/checks.mjs'
import { parseRubric } from './inspector.mjs'

const json = t => { try { return JSON.parse(t) } catch { return null } }
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
const first = line => String(line).split('\n')[0]

export async function runJourney({ sb, driver, inspector, reviewer, log, rubricDir, stages, capUsd = 25, minutes = 60, intents = Infinity, from = stages[0].id, stopAfter = null, now = Date.now }) {
  const t0 = now()
  const stateFile = path.join(sb.root, 'journey-state.json')
  const state = json(fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf8') : '') ?? { passed: [], memo: {} }
  const save = () => fs.writeFileSync(stateFile, JSON.stringify(state, null, 2))
  const ids = stages.map(s => s.id)
  const missing = ids.slice(0, ids.indexOf(from)).find(id => !state.passed.includes(id))
  if (missing) throw new Error(`cannot resume at ${from}: ${missing} did not pass`)

  const ctx = { sb, driver, memo: state.memo }
  let extra = 0
  let halted = null
  const results = []
  const viol = (stage, item, severity, evidence, note, area = 'unknown') => log.add({ stage, item, severity, evidence, note: first(note), session: '', area })
  const spent = () => (driver.spentUsd?.() ?? 0) + extra

  for (const stage of stages.slice(ids.indexOf(from))) {
    const r = { stage: stage.id, status: 'not-run', checks: new Checks(`${stage.id} ${stage.title}`), verdicts: [], costUsd: 0, minutes: 0 }
    results.push(r)
    if (!halted && (spent() >= capUsd || (now() - t0) / 60_000 > minutes)) {
      viol(stage.id, 'cap-reached', 'block', `spent $${spent().toFixed(2)} of $${capUsd}, ${((now() - t0) / 60_000).toFixed(1)} of ${minutes} min`, 'spend cap or time budget reached')
      halted = 'cap'
    }
    if (halted) continue
    const s0 = spent(), m0 = now()
    const rubricFile = path.join(rubricDir, `${stage.rubric}.md`)
    const rubric = parseRubric(fs.readFileSync(rubricFile, 'utf8'))

    if (stage.approve) {
      const d = await reviewer.review({ sb, stage: stage.id, artefacts: stage.artefacts?.(ctx) ?? [] })
      extra += d.costUsd ?? 0
      if (d.decision !== 'approve') {
        for (const reason of d.reasons.length ? d.reasons : ['rejected']) viol(stage.id, `${stage.id}.reviewer-reject`, 'block', 'reviewer decision', reason)
        r.status = 'fail'; halted = stage.id
        continue
      }
    }

    try {
      if (stage.perIntent) {
        for (let n = 0; n < intents; n++) {
          const ready = json(sb.sdlc(['ready', '--json']).stdout) ?? []
          if (ready.length === 0) break
          await stage.act(ctx, ready[0])
          await stage.gate(r.checks, ctx, ready[0])
          if (r.checks.failed.length) break
        }
      } else {
        await stage.act(ctx)
        await stage.gate(r.checks, ctx)
      }
    } catch (err) {
      await r.checks.check(`${stage.id} act`, () => String(err?.message ?? err))
    }
    if (r.checks.failed.length) {
      for (const f of r.checks.failed) viol(stage.id, `${stage.id}.gate.${slug(f.name)}`, 'block', f.why, `${f.name}: ${f.why}`)
      r.status = 'fail'; halted = stage.id
    } else {
      const v = await inspector.inspect({ sb, stage: stage.id, rubric, context: stage.context?.(ctx) ?? '' })
      extra += v.costUsd ?? 0
      r.verdicts = v.items
      for (const it of v.items.filter(i => i.verdict !== 'pass')) viol(stage.id, it.id, it.severity, it.evidence, it.note)
      const block = v.items.some(i => i.verdict === 'fail' && i.severity === 'block')
      r.status = block ? 'fail' : v.items.some(i => i.verdict !== 'pass') ? 'warn' : 'pass'
      if (block) halted = stage.id
    }
    r.costUsd = spent() - s0
    r.minutes = (now() - m0) / 60_000
    if (r.status !== 'fail') { state.passed.push(stage.id); save() }
    if (stopAfter === stage.id) break
  }
  save()
  return results
}
