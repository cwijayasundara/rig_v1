// The scripted-only regression group that ran as the old `test:e2e:fast`: the Node shop through install, brief, two changes,
// the deploy gate, the policy stage and the sprint-chart CLI checks (stale approval, untraced behaviour, blocked dependency,
// human-only approve). A fake model plays the skills from fixtures: $0, no judgement. The journey does not replace these
// until they are ported to the Library Desk sandbox.
import { createSandbox } from './lib/sandbox.mjs'
import { mergeToMain } from './lib/merge.mjs'
import { install } from './phases/s0-install.mjs'
import { runBrief } from './phases/s1-brief.mjs'
import { PHASE as S2, runShopChange } from './phases/s2-greenfield.mjs'
import { PHASE as S3, assertDelete, staleCheck, contractChecks } from './phases/s3-delete.mjs'
import { runDeploy } from './phases/s4-deploy.mjs'
import { runPolicy } from './phases/s5-policy.mjs'
import { runChart } from './phases/s6-chart.mjs'
import { runRigOn } from './phases/s7-rig-on.mjs'
import { runBrownfield } from './phases/s8-brownfield.mjs'
import { scriptedDriver } from './driver/scripted.mjs'

// A group that ran fewer checks than this lost coverage silently (an assertion call deleted or skipped).
const FLOOR = { 'S0 install': 14, 'S1 brief': 3, 'S2 ': 22, 'S3 ': 27, 'S4 deploy': 9, 'S5 policy': 7, 'S6 chart': 12, 'S7 ': 21, 'S8 brownfield cjs': 38, 'S8 brownfield py': 21 }

export async function runExtras({ out }) {
  const sb = createSandbox({ name: 'extras', out })
  const results = [await install(sb), await runBrief(sb)]
  const s2 = await runShopChange(sb, S2, scriptedDriver(sb, S2), { first: true })
  results.push(s2.checks)
  if (sb.git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') mergeToMain(sb, s2.slug)
  const s3 = await runShopChange(sb, S3, scriptedDriver(sb, S3), { afterApprove: async slug => [...await staleCheck(sb, slug), ...await contractChecks(sb, slug)] })
  await assertDelete(s3.checks, sb, s3.slug)
  results.push(s3.checks)
  mergeToMain(sb, s3.slug)
  results.push(...await runDeploy(sb), await runPolicy(sb), await runChart(sb), await runRigOn(sb), ...await runBrownfield(out))
  const lost = Object.entries(FLOOR).filter(([k, n]) => (results.find(c => c.title.startsWith(k))?.results.length ?? 0) < n).map(([k, n]) => `${k}: fewer than ${n} checks ran`)
  return { results, lost }
}
