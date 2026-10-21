// Ablate one rig component (harness readiness 3.3): the same paired runs as the main eval, rig against rig with that one component removed, and a
// verdict from the committed history in eval/ablation.json: keep, candidate, or cut-eligible after two passes with no lift at 3 or more runs per arm.
// node eval/ablate.mjs --list | --check | --component <kind:name> [--runs 3] [--model claude-haiku-5-5] [--variant links] [--cap-run 4] [--cap-total 15] [--dry]
// Run it at each model release, one component at a time. A live run costs money and a person starts it; --dry replays fixtures at $0 and records nothing.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { components, loadTags, tagProblems, verdict } from './ablation.mjs'
import { runOne, nextRunAllowed } from './run.mjs'
import { orderArms } from './run.mjs'
import { ARMS, MODELS } from './arms.mjs'

const HISTORY = path.resolve(import.meta.dirname, 'ablation.json')
const readHistory = () => JSON.parse(fs.readFileSync(HISTORY, 'utf8'))

export function listText(tags, history) {
  return tags.map(t => { const v = verdict(history, t.id); return `${t.id.padEnd(26)} ${(t.ablatable ? v.state : 'not ablatable').padEnd(14)} ${t.weakness}` }).join('\n')
}

if (process.argv[1] === import.meta.filename) {
  const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
  const tags = loadTags()
  if (process.argv.includes('--list')) { console.log(listText(tags, readHistory())); process.exit(0) }
  if (process.argv.includes('--check')) {
    const problems = tagProblems(tags, components())
    console.log(problems.length ? problems.join('\n') : `ablation tags cover all ${tags.length} components`)
    process.exit(problems.length ? 1 : 0)
  }
  const component = arg('component')
  const tag = tags.find(t => t.id === component)
  if (!tag) { console.error(`unknown component: ${component ?? '(none)'}; see --list`); process.exit(2) }
  if (!tag.ablatable) { console.error(`${component} is not ablatable: ${tag.why}`); process.exit(2) }
  const dry = process.argv.includes('--dry')
  const runs = Number(arg('runs', 3)), capRun = Number(arg('cap-run', 4)), capTotal = Number(arg('cap-total', 15)), variant = arg('variant', null)
  const seed = Number(arg('seed', Date.now() % 1_000_000))
  const base = ARMS.find(a => a.id === 'haiku-rig')
  const withArm = { ...base, model: arg('model', base.model) }
  const withoutArm = { ...withArm, id: `${withArm.id}-minus-${component.replace(':', '-')}`, ablate: component }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-ablate-'))
  const rows = []
  let spent = 0
  for (let n = 1; n <= runs; n++) {
    const round = orderArms([withArm, withoutArm], seed, n)
    if (!dry && !nextRunAllowed(spent, capRun * round.length, capTotal)) { console.log(`stopped before round ${n}: $${spent.toFixed(2)} spent, a round can cost up to $${capRun * round.length}`); break }
    for (const arm of round) {
      const row = await runOne(arm, n, { dry, out, capRunUsd: capRun, seed, variant })
      spent += row.usd; rows.push(row)
      console.log(`${arm.id} #${n}: ${row.accepted ? 'accepted' : 'not accepted'} ${row.checks}/${row.of}, $${row.usd}${row.error ? ` (${row.error})` : ''}`)
    }
  }
  const mine = id => rows.filter(r => r.arm === id && !r.error)
  const entry = { component, model: withArm.model, date: new Date().toISOString().slice(0, 10), withRuns: mine(withArm.id).length, withAccepted: mine(withArm.id).filter(r => r.accepted).length, withoutRuns: mine(withoutArm.id).length, withoutAccepted: mine(withoutArm.id).filter(r => r.accepted).length }
  const history = [...readHistory(), entry]
  if (!dry) fs.writeFileSync(HISTORY, JSON.stringify(history, null, 2) + '\n')
  const v = verdict(history, component)
  console.log(`\n${component}: with ${entry.withAccepted}/${entry.withRuns} accepted, without ${entry.withoutAccepted}/${entry.withoutRuns}; verdict ${v.state}${v.why ? ` (${v.why})` : ''}${dry ? ' (dry: nothing recorded)' : ''}`)
}
