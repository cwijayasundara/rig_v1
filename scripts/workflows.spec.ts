// Least privilege for the CI workflows rig ships and runs (harness readiness 0.4). A workflow that reads text an outsider can write
// (PR titles, issue bodies, comments, branch names) must not hold a write token or a secret that text could reach.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

const ROOT = path.join(import.meta.dirname, '..')
const UNTRUSTED_TRIGGERS = ['pull_request_target', 'issue_comment', 'issues', 'discussion', 'discussion_comment', 'pull_request_review', 'pull_request_review_comment', 'workflow_run']
const UNTRUSTED_TEXT = /\$\{\{[^}]*\b(github\.event\.|github\.head_ref)[^}]*\}\}/
const SECRET = /\$\{\{[^}]*\bsecrets\./

type Step = { name?: string; uses?: string; run?: string; env?: Record<string, unknown>; with?: Record<string, unknown> }
type Job = { permissions?: unknown; env?: Record<string, unknown>; steps?: Step[] }
type Workflow = { on?: unknown; permissions?: unknown; env?: Record<string, unknown>; jobs?: Record<string, Job> }

const hasWrite = (p: unknown): boolean => p === 'write-all' || (typeof p === 'object' && p !== null && Object.values(p).some(v => v === 'write'))
const hasSecret = (env?: Record<string, unknown>): boolean => Object.values(env ?? {}).some(v => SECRET.test(String(v)))

// `strict` is for templates a team copies: their checkouts must also drop the token, since the checker's own steps run PR code.
export function workflowFindings(text: string, strict = false): string[] {
  const w = parse(text) as Workflow
  const found: string[] = []
  const on = w.on ?? (w as Record<string, unknown>)['true'] // YAML 1.1 reads a bare `on` as true
  const triggers = typeof on === 'string' ? [on] : Array.isArray(on) ? on.map(String) : Object.keys((on as object) ?? {})
  for (const t of triggers.filter(t => UNTRUSTED_TRIGGERS.includes(t))) found.push(`trigger ${t} runs with outsider-written text and a privileged token`)
  if (w.permissions === undefined) found.push('no top-level permissions: the token defaults to the repository setting')
  if (hasWrite(w.permissions)) found.push('top-level permissions grant write')
  if (hasSecret(w.env)) found.push('a secret is set in workflow env, reachable by every step')
  for (const [id, job] of Object.entries(w.jobs ?? {})) {
    if (hasWrite(job.permissions)) found.push(`job ${id} grants write`)
    if (hasSecret(job.env)) found.push(`job ${id} sets a secret in job env, reachable by every step`)
    for (const s of job.steps ?? []) {
      const at = `job ${id}, step ${s.name ?? s.uses ?? s.run?.slice(0, 30)}`
      if (s.run && UNTRUSTED_TEXT.test(s.run)) found.push(`${at}: outsider-written text interpolated into a shell script; pass it through env`)
      if (s.run && SECRET.test(s.run)) found.push(`${at}: a secret is interpolated into a shell script; pass it through the step env`)
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
    ['PR title in run', wf('', '      - run: echo "${{ github.event.pull_request.title }}"'), /interpolated into a shell script/],
    ['head_ref in run', wf('', '      - run: git checkout ${{ github.head_ref }}'), /interpolated into a shell script/],
    ['secret in run', wf('', '      - run: curl -H "${{ secrets.TOKEN }}" x'), /secret is interpolated/],
    ['workflow env secret', wf('env:\n  T: ${{ secrets.TOKEN }}'), /workflow env/],
    ['job env secret', wf('').replace('    runs-on', '    env:\n      T: ${{ secrets.TOKEN }}\n    runs-on'), /job env/],
  ]
  for (const [name, text, re] of cases) assert.match(workflowFindings(text).join('\n'), re, name)
  assert.match(workflowFindings(wf('', '      - uses: actions/checkout@v4'), true).join('\n'), /keeps the token/)
  assert.deepEqual(workflowFindings(wf('', '      - uses: actions/checkout@v4\n        with:\n          persist-credentials: false'), true), [])
})

test('/rig:pr may read a PR and comment on it, and no more: no merge, api or push through gh', () => {
  const tools = /^allowed-tools: (.*)$/m.exec(read('skills/pr/SKILL.md'))?.[1] ?? ''
  const gh = tools.match(/Bash\(gh [^)]*\)/g) ?? []
  assert.deepEqual(gh, ['Bash(gh pr view*)', 'Bash(gh pr comment*)'])
  assert.doesNotMatch(tools, /git push|git commit|Bash\(\*\)/)
})
