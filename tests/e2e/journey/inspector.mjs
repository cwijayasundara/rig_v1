// The inspector: a fresh read-only Sonnet session that judges one stage's artefacts against a rubric and answers in JSON.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { claudeJson } from '../../../eval/lib/cli.mjs'

export const INSPECTOR_MODEL = 'claude-sonnet-5-5'
export const INSPECTOR_TOOLS = 'Read,Grep,Glob,Bash(git *),Bash(pytest *),Bash(cat *)'

// '- J1.3 [block] text' lines. The rubric, not the inspector, sets each item's severity.
export function parseRubric(text) {
  return text.split('\n').flatMap(l => {
    const m = /^- (J\d+\.[\w.-]+) \[(block|warn)\] (.+)$/.exec(l)
    return m ? [{ id: m[1], severity: m[2], text: m[3] }] : []
  })
}

export async function defaultLaunch({ dir, prompt, model = INSPECTOR_MODEL, tools = INSPECTOR_TOOLS }) {
  const r = claudeJson({ dir, prompt, model, tools, sources: 'project' })
  return { text: r.j?.result ?? '', costUsd: r.usd }
}

// The JSON object in a model answer, with or without a code fence. null when there is none.
export function extractJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}')
  if (a < 0 || b < a) return null
  try { return JSON.parse(text.slice(a, b + 1)) } catch { return null }
}

// HEAD, status and the content of every changed file: equal before and after means the session edited nothing.
export function fingerprint(sb) {
  const git = (...a) => sb.run('git', a).stdout ?? ''
  const files = git('status', '--porcelain', '-uall').split('\n').filter(Boolean).map(l => l.slice(3))
  const h = crypto.createHash('sha1').update(git('rev-parse', 'HEAD')).update(git('status', '--porcelain', '-uall'))
  for (const f of files) { try { h.update(fs.readFileSync(path.join(sb.dir, f))) } catch { /* deleted */ } }
  return h.digest('hex')
}

const prompt = (stage, sb, rubric, context) => `You are the inspector for stage ${stage} of a rig end-to-end test. The repository is at ${sb.dir}. You may only read it (Read, Grep, Glob, and Bash for git, pytest and cat). Never edit, write or delete anything.

${context ? `${context}\n\n` : ''}Judge each rubric item below from what is actually in the repository. Cite evidence for every pass and fail: a path:line or command output.

Rubric:
${rubric.map(r => `- ${r.id} [${r.severity}] ${r.text}`).join('\n')}

Answer with ONLY this JSON, one entry per rubric item, no prose:
{"stage":"${stage}","items":[{"id":"<id>","verdict":"pass|fail|warn","evidence":"<path:line or output>","note":"<one line>"}]}`

const malformed = (r, why) => ({ id: r.id, verdict: 'fail', severity: r.severity, evidence: '', note: `inspector-malformed: ${why}` })

export async function inspect({ sb, stage, rubric, context = '', launch = defaultLaunch, model = INSPECTOR_MODEL }) {
  const before = fingerprint(sb)
  const { text, costUsd = 0 } = await launch({ dir: sb.dir, prompt: prompt(stage, sb, rubric, context), model, tools: INSPECTOR_TOOLS })
  const after = fingerprint(sb)
  const problems = []
  const parsed = extractJson(text)
  const given = Array.isArray(parsed?.items) ? parsed.items : null
  if (!given) problems.push('answer was not the JSON schema')
  const known = new Set(rubric.map(r => r.id))
  for (const g of given ?? []) if (!known.has(g.id)) problems.push(`unknown item id ${g.id}`)
  const items = rubric.map(r => {
    const g = given?.find(x => x.id === r.id)
    if (!g) { const why = given ? 'item missing from answer' : 'answer was not the JSON schema'; if (given) problems.push(`${r.id}: ${why}`); return malformed(r, why) }
    if (!['pass', 'fail', 'warn'].includes(g.verdict)) { problems.push(`${r.id}: bad verdict`); return malformed(r, 'bad verdict') }
    if ((g.verdict === 'pass' || g.verdict === 'fail') && !String(g.evidence ?? '').trim()) { problems.push(`${r.id}: no evidence`); return malformed(r, 'no evidence') }
    return { id: r.id, verdict: g.verdict, severity: r.severity, evidence: String(g.evidence ?? ''), note: String(g.note ?? '') }
  })
  if (before !== after) items.push({ id: `${stage}.no-edit`, verdict: 'fail', severity: 'block', evidence: 'sandbox fingerprint changed during inspection', note: 'the inspector edited the repository' })
  return { items, problems, costUsd }
}
