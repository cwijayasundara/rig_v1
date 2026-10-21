// Least privilege for the CI workflows rig ships and runs (harness readiness 0.4). A workflow that reads text an outsider can write
// (PR titles, issue bodies, comments, branch names) must not hold a write token or a secret that text could reach.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const ROOT = path.join(import.meta.dirname, '..')
const UNTRUSTED_TRIGGERS = ['pull_request_target', 'issue_comment', 'issues', 'discussion', 'discussion_comment', 'pull_request_review', 'pull_request_review_comment', 'workflow_run', 'workflow_dispatch', 'repository_dispatch', 'check_run', 'check_suite', 'gollum', 'label', 'fork', 'watch']
// Expressions that carry text an outsider writes: event payloads (any access form), branch names and tag names. Numbers and SHAs are safe.
const SAFE_EVENT = /^github\.event\.(pull_request|issue)\.number$|^github\.event\.pull_request\.(head|base)\.sha$|^github\.sha$/
const EXPR = /\$\{\{([^}]*)\}\}/g
const UNTRUSTED_EXPR = /\bgithub\s*(\.|\[\s*['"])(event\b|head_ref|ref_name|ref\b)|toJSON\(\s*github\s*\)/
const SECRET_EXPR = /\bsecrets\b/
const untrusted = (text: string): boolean => [...text.matchAll(EXPR)].some(m => UNTRUSTED_EXPR.test(m[1] ?? "") && !SAFE_EVENT.test((m[1] ?? "").trim()))
const secretIn = (text: string): boolean => [...text.matchAll(EXPR)].some(m => SECRET_EXPR.test(m[1] ?? ""))

type Step = { name?: string; uses?: string; run?: string; env?: Record<string, unknown>; with?: Record<string, unknown> }
type Job = { permissions?: unknown; env?: Record<string, unknown>; steps?: Step[]; uses?: string; secrets?: unknown }
type Workflow = { on?: unknown; permissions?: unknown; env?: Record<string, unknown>; jobs?: Record<string, Job> }

const hasWrite = (p: unknown): boolean => p === 'write-all' || (typeof p === 'object' && p !== null && Object.values(p).some(v => v === 'write'))
const hasSecret = (env?: Record<string, unknown>): boolean => Object.values(env ?? {}).some(v => secretIn(String(v)))

// `strict` is for templates a team copies: their checkouts must also drop the token, since the checker's own steps run PR code.
export function workflowFindings(text: string, strict = false): string[] {
  const w = parse(text) as Workflow | null
  if (!w || typeof w !== 'object' || !w.jobs) return ['not a workflow: no jobs']
  const found: string[] = []
  const on = w.on ?? (w as Record<string, unknown>)['true'] // YAML 1.1 reads a bare `on` as true
  const triggers = typeof on === 'string' ? [on] : Array.isArray(on) ? on.map(String) : Object.keys((on as object) ?? {})
  for (const t of triggers.filter(t => UNTRUSTED_TRIGGERS.includes(t))) found.push(`trigger ${t} runs with outsider-written text and a privileged token`)
  if (w.permissions === undefined && !Object.values(w.jobs).every(j => j.permissions !== undefined)) found.push('no top-level permissions: the token defaults to the repository setting')
  if (hasWrite(w.permissions)) found.push('top-level permissions grant write')
  if (hasSecret(w.env)) found.push('a secret is set in workflow env, reachable by every step')
  for (const [id, job] of Object.entries(w.jobs ?? {})) {
    if (hasWrite(job.permissions)) found.push(`job ${id} grants write`)
    if (hasSecret(job.env)) found.push(`job ${id} sets a secret in job env, reachable by every step`)
    if (job.secrets !== undefined) found.push(`job ${id} passes secrets to a called workflow`)
    for (const s of job.steps ?? []) {
      const at = `job ${id}, step ${s.name ?? s.uses ?? s.run?.slice(0, 30)}`
      const inline = [s.run ?? '', ...Object.values(s.with ?? {}).map(String)].join('\n')
      if (untrusted(inline)) found.push(`${at}: outsider-written text interpolated into a script or action input; pass it through env`)
      if (secretIn(s.run ?? '') || (s.uses?.startsWith('actions/github-script') && secretIn(inline))) found.push(`${at}: a secret is interpolated into a script; pass it through the step env`)
      if (strict && s.uses?.startsWith('actions/checkout') && s.with?.['persist-credentials'] !== false) found.push(`${at}: checkout keeps the token in .git/config`)
    }
  }
  return found
}

const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('the CI template and this repo\'s own workflows hold no write token and no reachable secret', () => {
  assert.deepEqual(workflowFindings(read('templates/rig-check.yml'), true), [])
  for (const f of fs.readdirSync(path.join(ROOT, '.github/workflows'))) assert.deepEqual(workflowFindings(read(`.github/workflows/${f}`)), [], f)
})

test('the only secret in the CI template is read by the consumer checkout step, from the base config', () => {
  const w = parse(read('templates/rig-check.yml')) as Workflow
  const users = (w.jobs?.['rig-check']?.steps ?? []).filter(s => hasSecret(s.env))
  assert.deepEqual(users.map(s => s.name), ['Check out consumer repos'])
  assert.match(users[0]?.run ?? '', /\$RUNNER_TEMP\/sensors\.json/)
})

test('workflowFindings rejects each way a workflow can hand outsiders a privileged token', () => {
  const wf = (over: string, step = '      - run: echo ok'): string => `name: x\non: pull_request\npermissions:\n  contents: read\n${over}\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n${step}\n`
  const cases: [string, string, RegExp][] = [
    ['pull_request_target', 'name: x\non: pull_request_target\npermissions:\n  contents: read\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n', /pull_request_target/],
    ['issue_comment', 'name: x\non:\n  issue_comment:\n    types: [created]\npermissions:\n  contents: read\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n', /issue_comment/],
    ['no permissions', 'name: x\non: pull_request\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n', /no top-level permissions/],
    ['write token', 'name: x\non: pull_request\npermissions:\n  contents: write\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n', /grant write/],
    ['job write', wf('').replace('    runs-on', '    permissions:\n      pull-requests: write\n    runs-on'), /job j grants write/],
    ['PR title in run', wf('', '      - run: echo "${{ github.event.pull_request.title }}"'), /interpolated/],
    ['head_ref in run', wf('', '      - run: git checkout ${{ github.head_ref }}'), /interpolated/],
    ['github-script injection', wf('', '      - uses: actions/github-script@v7\n        with:\n          script: console.log("${{ github.event.pull_request.title }}")'), /interpolated/],
    ['ref_name in run', wf('', '      - run: git checkout ${{ github.ref_name }}'), /interpolated/],
    ['bracket form', wf('', "      - run: echo ${{ github['event']['issue']['title'] }}"), /interpolated/],
    ['toJSON(github)', wf('', '      - run: echo ${{ toJSON(github) }}'), /interpolated/],
    ['secrets: inherit', 'name: x\non: pull_request\npermissions:\n  contents: read\njobs:\n  j:\n    uses: ./.github/workflows/d.yml\n    secrets: inherit\n', /passes secrets/],
    ['workflow_dispatch', 'name: x\non: workflow_dispatch\npermissions:\n  contents: read\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n', /workflow_dispatch/],
    ['secret in run', wf('', '      - run: curl -H "${{ secrets.TOKEN }}" x'), /secret is interpolated/],
    ['workflow env secret', wf('env:\n  T: ${{ secrets.TOKEN }}'), /workflow env/],
    ['job env secret', wf('').replace('    runs-on', '    env:\n      T: ${{ secrets.TOKEN }}\n    runs-on'), /job env/],
  ]
  for (const [name, text, re] of cases) assert.match(workflowFindings(text).join('\n'), re, name)
  assert.deepEqual(workflowFindings(wf('', '      - run: echo ${{ github.event.pull_request.number }} ${{ github.event.pull_request.head.sha }}')), [], 'numbers and SHAs are safe')
  assert.match(workflowFindings('').join(), /not a workflow/)
  assert.match(workflowFindings(wf('', '      - uses: actions/checkout@v4'), true).join('\n'), /keeps the token/)
  assert.deepEqual(workflowFindings(wf('', '      - uses: actions/checkout@v4\n        with:\n          persist-credentials: false'), true), [])
})

test('/rig:pr may read a PR and comment on it, and no more: no merge, api or push through gh', () => {
  const tools = /^allowed-tools: (.*)$/m.exec(read('skills/pr/SKILL.md'))?.[1] ?? ''
  const bash = tools.match(/Bash\([^)]*\)/g) ?? []
  const net = bash.filter(b => /\b(gh|curl|wget|ssh|git (push|commit|reset|checkout))\b|Bash\(\*/.test(b))
  assert.deepEqual(net, ['Bash(gh pr view*)', 'Bash(gh pr comment*)'])
})
