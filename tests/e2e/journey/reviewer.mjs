// The approval reviewer: stands in for the person who approves a chart or a PR. It may reject.
import { defaultLaunch, extractJson, INSPECTOR_MODEL, INSPECTOR_TOOLS } from './inspector.mjs'

export async function review({ sb, stage, artefacts = [], launch = defaultLaunch, model = INSPECTOR_MODEL }) {
  const prompt = `You are the reviewer for stage ${stage} of a rig end-to-end test, standing in for the person who approves. The repository is at ${sb.dir}. Read-only: never edit anything.
Read these artefacts and the PRD they trace to, and decide whether you would approve them: ${artefacts.join(', ') || '(see the stage)'}.
Reject if a requirement is untraced, an intent is out of scope, or anything is wrong that a careful person would not sign.
Answer with ONLY this JSON: {"decision":"approve|reject","reasons":["<short reason>"]}`
  const { text, costUsd = 0 } = await launch({ dir: sb.dir, prompt, model, tools: INSPECTOR_TOOLS })
  const j = extractJson(text)
  if (!j || !['approve', 'reject'].includes(j.decision)) return { decision: 'reject', reasons: ['reviewer-malformed'], costUsd }
  return { decision: j.decision, reasons: Array.isArray(j.reasons) ? j.reasons.map(String) : [], costUsd }
}
