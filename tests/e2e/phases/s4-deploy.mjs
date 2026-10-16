import { Checks } from '../lib/checks.mjs'
import { assertProductionGate, assertRollbackRehearsal, assertWorkflows } from '../assert/deploy.mjs'

// Local-only deploy: the production gate, a rollback rehearsal and the shipped CI workflow. No environment is provisioned.
export async function runDeploy(sb) {
  const d = new Checks('S4 deploy (local)')
  await assertProductionGate(d, sb)
  await assertRollbackRehearsal(d, sb)
  await assertWorkflows(d)
  return [d]
}
