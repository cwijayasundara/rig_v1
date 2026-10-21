// The eval workflow (harness readiness 3.2): live evals cost money and use a secret, so they run only where a pull request cannot reach them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { workflowFindings } from './testkit.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const text = fs.readFileSync(path.join(ROOT, '.github/workflows/eval.yml'), 'utf8')
const w = parse(text) as { on: Record<string, unknown>; jobs: Record<string, { if?: string; needs?: string; steps: { name?: string; run?: string; env?: Record<string, string>; uses?: string }[] }> }
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> }

test('the eval workflow passes the least-privilege audit and never triggers on a pull request', () => {
  assert.deepEqual(workflowFindings(text, true), [])
  assert.deepEqual(Object.keys(w.on).sort(), ['push', 'schedule', 'workflow_dispatch'])
})

test('the dry job runs scripts that exist, and the live job runs only on a schedule or on demand, after the dry job', () => {
  for (const s of w.jobs.dry!.steps.flatMap(s => /npm run (\S+)/.exec(s.run ?? '')?.[1] ?? [])) if (s.startsWith('eval')) assert.ok(pkg.scripts[s], `npm script ${s} exists`)
  assert.ok(w.jobs.dry!.steps.some(s => s.run === 'npm run eval:dry'))
  assert.equal(w.jobs.live!.if, "github.event_name != 'push' && github.ref == 'refs/heads/main'", 'only from main: the job holds a secret')
  assert.equal(w.jobs.live!.needs, 'dry')
})

test('the secret reaches exactly one step, the capped paired eval, and the gate runs on its results', () => {
  const withSecret = Object.entries(w.jobs).flatMap(([job, j]) => j.steps.filter(s => JSON.stringify(s.env ?? {}).includes('secrets.')).map(s => `${job}: ${s.name}`))
  assert.deepEqual(withSecret, ['live: Paired eval (costs money; capped at 15 dollars)'])
  const live = w.jobs.live!.steps
  const run = live.find(s => /eval\/run\.mjs/.test(s.run ?? ''))?.run ?? ''
  assert.match(run, /--cap-total 15/)
  assert.match(run, /--results "\$RUNNER_TEMP\/paired\.jsonl"/)
  assert.ok(live.findIndex(s => /eval\/gate\.mjs/.test(s.run ?? '')) > live.findIndex(s => /eval\/run\.mjs/.test(s.run ?? '')), 'the gate follows the eval')
  const gateStep = live.find(s => /eval\/gate\.mjs/.test(s.run ?? '')) as { run?: string; shell?: string }
  assert.match(gateStep.run ?? '', /paired\.jsonl" --variant links/)
  assert.equal(gateStep.shell, 'bash', 'a pipe to tee needs pipefail, or the gate can never fail the job')
  const paths = (w.on as { push: { paths: string[] } }).push.paths
  for (const p of ['guides/**', 'hooks/**', '.claude-plugin/**', 'package.json', '.github/workflows/eval.yml']) assert.ok(paths.includes(p), p)
})
