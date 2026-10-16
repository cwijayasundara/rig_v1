// The one integration test: node tests/e2e/run.mjs [--driver scripted|live] [--phase S0|S1|S2|S3|S4|S5]
// [--cap USD] [--model MODEL] [--minutes N] [--out DIR]
// S0 installs the harness into a throwaway shop-app repo, S1 writes the product brief, S2 builds the shop greenfield
// through approval, verify and PR, S3 lands the delete-item change on top (with a stale-approval check), S4 exercises
// the local deploy gate. Scripted is $0 and gates CI; live drives real `claude -p` sessions (default model
// claude-haiku-5-5) and fails when the whole run takes longer than --minutes (default 20) of wall clock.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSandbox } from './lib/sandbox.mjs'
import { writeReport } from './lib/report.mjs'
import { mergeToMain } from './lib/merge.mjs'
import { Checks } from './lib/checks.mjs'
import { install, SCAFFOLD_PROMPT } from './phases/s0-install.mjs'
import { runBrief } from './phases/s1-brief.mjs'
import { PHASE as S2, runShopChange } from './phases/s2-greenfield.mjs'
import { PHASE as S3, assertDelete, staleCheck, contractChecks } from './phases/s3-delete.mjs'
import { runDeploy } from './phases/s4-deploy.mjs'
import { runPolicy } from './phases/s5-policy.mjs'
import { scriptedDriver } from './driver/scripted.mjs'
import { createSessions, liveDriver } from './driver/live.mjs'
import { assertOnboarding } from './assert/onboarding.mjs'
import { assertProcess } from './assert/process.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const driverName = arg('driver', 'scripted')
const only = arg('phase')
const out = path.resolve(arg('out', fs.mkdtempSync(path.join(os.tmpdir(), 'rig-e2e-'))))
const live = driverName === 'live'

const sb = createSandbox({ name: 'project', out })
const sessions = live ? createSessions({ sb, out, capUsd: Number(arg('cap', 6)), model: arg('model', 'claude-haiku-5-5') }) : null
const driverFor = phase => (live ? liveDriver(sb, phase, { sessions }) : scriptedDriver(sb, phase))
const results = []
// Wall clock per phase, printed as it ends and checked against the greenfield + brownfield budget at the end of a live run.
const took = {}
const timed = async (id, fn) => {
  const t0 = Date.now()
  try { return await fn() } finally {
    took[id] = (Date.now() - t0) / 60_000
    console.log(`  ${id}: ${took[id].toFixed(1)} min`)
  }
}
const fmt = m => `${m.toFixed(1)} min`
// A phase runs when it is the requested one or a prerequisite of it.
const NEEDS = { S2: ['S1'], S3: ['S1', 'S2'], S4: ['S1', 'S2', 'S3'], S5: ['S1', 'S2', 'S3', 'S4'] }
const want = id => !only || only === id || (NEEDS[only] ?? []).includes(id)
const ensureMain = slug => {
  const b = sb.git('rev-parse', '--abbrev-ref', 'HEAD')
  if (b !== 'main') mergeToMain(sb, slug)
}
// A group that ran fewer checks than this lost coverage silently (an assertion call deleted or skipped): fail the scripted run.
const FLOOR = { 'S0 install': 14, 'S1 brief': 3, 'S2 ': 22, 'S3 ': 27, 'S4 deploy': 9, 'S5 policy': 6 }
const lostCoverage = () => (live || only ? [] : Object.entries(FLOOR).filter(([k, n]) => {
  const g = results.find(c => c.title.startsWith(k))
  return !g || g.results.length < n
}).map(([k, n]) => `${k}: fewer than ${n} checks ran`))
const finish = () => {
  for (const m of lostCoverage()) { console.error(`coverage floor: ${m}`); process.exitCode = 1 }
  writeReport(out, results)
  for (const c of results) c.print()
  console.log(`\nreport and sandbox: ${out}`)
  process.exitCode = results.some(c => c.failed.length) ? 1 : (process.exitCode ?? 0)
}

try {
  const t0 = Date.now()
  if (live) {
    sb.git('commit', '-q', '--allow-empty', '-m', 'chore: empty start')
    sb.isolate()
    sessions.run('S0-init', `/rig:init --defaults greenfield "${SCAFFOLD_PROMPT}"`, { withPlugin: true })
    sb.commitAll('chore: onboarding leftovers')
    const p0 = new Checks('S0 install (live)')
    await assertOnboarding(p0, sb, { lane: 'greenfield' })
    results.push(p0)
  } else {
    results.push(await install(sb))
  }
  took.S0 = (Date.now() - t0) / 60_000
  if (want('S1')) results.push(await timed('S1', () => runBrief(sb)))

  let s2slug = S2.slug
  if (want('S2')) {
    const r = await timed('S2', () => runShopChange(sb, S2, driverFor(S2), { first: true }))
    s2slug = r.slug
    results.push(r.checks)
  }
  if (want('S3')) {
    const { slug, checks } = await timed('S3', () => {
      ensureMain(s2slug)
      return runShopChange(sb, S3, driverFor(S3), { afterApprove: live ? undefined : async slug => [...await staleCheck(sb, slug), ...await contractChecks(sb, slug)] })
    })
    await assertDelete(checks, sb, slug)
    results.push(checks)
    var s3slug = slug
  }
  if (want('S4')) {
    ensureMain(s3slug ?? S3.slug)
    results.push(...await timed('S4', () => runDeploy(sb)))
  }
  if (want('S5') && !live) {
    ensureMain(s3slug ?? S3.slug)
    results.push(await timed('S5', () => runPolicy(sb)))
  }
  if (live) {
    const pc = new Checks('process (all live sessions)')
    await assertProcess(pc, sessions.sessions, { label: 'live run' })
    results.push(pc)
  }
} catch (err) {
  console.error(`e2e aborted: ${err.message}\nsandbox kept at ${out}`)
  const ab = new Checks('aborted')
  await ab.check('the run reached its end', () => err.message)
  results.push(ab)
  process.exitCode = 1
}
if (live) {
  const budget = Number(arg('minutes', 20))
  const total = Object.values(took).reduce((n, m) => n + m, 0)
  const tc = new Checks('timing (live)')
  await tc.check(`the whole run finished within ${budget} min`, () => total <= budget || `took ${fmt(total)} (${Object.entries(took).map(([k, m]) => `${k} ${fmt(m)}`).join(', ')})`)
  results.push(tc)
}
console.log(`timing: ${Object.entries(took).map(([k, m]) => `${k} ${fmt(m)}`).join(', ')}`)
finish()
