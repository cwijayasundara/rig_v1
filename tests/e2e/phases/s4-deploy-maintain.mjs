import { Checks } from '../lib/checks.mjs'
import { assertProductionGate, assertRollbackRehearsal, assertWorkflows } from '../assert/deploy.mjs'
import { assertWatch } from '../assert/maintain.mjs'

// Local-only deploy and maintain: the production gate, a rollback rehearsal, the shipped workflow templates,
// and the watch band raising a named breach on a spike. No real environment is provisioned.
export async function runDeployMaintain(sb) {
  const d = new Checks('S4 deploy (local)')
  await assertProductionGate(d, sb)
  await assertRollbackRehearsal(d, sb)
  await assertWorkflows(d)
  const w = new Checks('S4 maintain: watch')
  await assertWatch(w, sb)
  sb.commitAll('chore: watch band and history')
  return [d, w]
}
