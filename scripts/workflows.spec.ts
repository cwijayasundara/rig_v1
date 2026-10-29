// Least privilege for the CI workflows rig ships and runs (harness readiness 0.4). A workflow that reads text an outsider can write
// (PR titles, issue bodies, comments, branch names) must not hold a write token or a secret that text could reach.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { workflowFindings, hasSecret, type Workflow } from './testkit.ts'

const ROOT = path.join(import.meta.dirname, '..')
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
    ['workflow_dispatch with inputs', 'name: x\non:\n  workflow_dispatch:\n    inputs:\n      msg:\n        type: string\npermissions:\n  contents: read\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n', /workflow_dispatch declares inputs/],
    ['secret in run', wf('', '      - run: curl -H "${{ secrets.TOKEN }}" x'), /secret is interpolated/],
    ['workflow env secret', wf('env:\n  T: ${{ secrets.TOKEN }}'), /workflow env/],
    ['job env secret', wf('').replace('    runs-on', '    env:\n      T: ${{ secrets.TOKEN }}\n    runs-on'), /job env/],
  ]
  for (const [name, text, re] of cases) assert.match(workflowFindings(text).join('\n'), re, name)
  assert.deepEqual(workflowFindings(wf('', '      - run: echo ${{ github.event.pull_request.number }} ${{ github.event.pull_request.head.sha }}')), [], 'numbers and SHAs are safe')
  assert.match(workflowFindings('').join(), /not a workflow/)
  assert.deepEqual(workflowFindings('name: x\non: workflow_dispatch\npermissions:\n  contents: read\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n'), [], 'a bare manual trigger carries no text')
  assert.match(workflowFindings(wf('', '      - uses: actions/checkout@v4'), true).join('\n'), /keeps the token/)
  assert.deepEqual(workflowFindings(wf('', '      - uses: actions/checkout@v4\n        with:\n          persist-credentials: false'), true), [])
})

test('/rig:pr may read a PR and comment on it, and no more: no merge, api or push through gh', () => {
  const tools = /^allowed-tools: (.*)$/m.exec(read('skills/pr/SKILL.md'))?.[1] ?? ''
  const bash = tools.match(/Bash\([^)]*\)/g) ?? []
  const net = bash.filter(b => /\b(gh|curl|wget|ssh|git (push|commit|reset|checkout))\b|Bash\(\*/.test(b))
  assert.deepEqual(net, ['Bash(gh pr view*)', 'Bash(gh pr comment*)'])
})

test('ai-review runs on every same-repo PR, and only the lead override needs the label', () => {
  const w = parse(read('templates/rig-check.yml')) as Workflow
  const jobs = w.jobs as Record<string, { if?: string; needs?: unknown }>
  const ai = jobs['ai-review']!, lo = jobs['lead-override']!
  assert.doesNotMatch(ai.if ?? '', /rig-lead-override/)
  assert.match(ai.if ?? '', /head\.repo\.full_name == github\.repository/, 'fork PRs have no secrets: skip, never fail')
  assert.match(lo.if ?? '', /rig-lead-override/)
  assert.equal(lo.needs, 'ai-review')
})

test('ai-review runs a security pass from the base branch and gates on ## Findings only', () => {
  const t = read('templates/rig-check.yml')
  assert.match(t, /git show "origin\/\$BASE:\.rig\/security-brief\.md"/)
  assert.match(t, /awk '\/\^## \/\{f=\(\$0 ~ \/\^## Findings\/\)\} f'/, 'the Findings section ends at the next heading, whatever it starts with')
  assert.doesNotMatch(t, /grep -qE '\\\[severity: \(critical\|high\)\\\]' "\$RUNNER_TEMP\/review\.md"/, 'the whole-file grep would fail on Pre-existing items')
})

test('both CI reviewers are told what Pre-existing is and that it never changes the verdict, and the gate fails closed', () => {
  const t = read('templates/rig-check.yml')
  assert.equal((t.match(/a line the diff did not add or change goes under ## Pre-existing/g) ?? []).length, 2)
  assert.equal((t.match(/Pre-existing items never change the verdict/g) ?? []).length, 2)
  assert.doesNotMatch(t, /\.rig\/review-brief\.md/, 'nothing installs that path; vendored templates live under .rig/templates/')
  assert.match(t, /set -o pipefail/)
  assert.match(t, /no verdict line/, 'an empty or failed review run blocks with a clear reason')
  assert.doesNotMatch(t, /"verdict: pass" \]/, 'the verdict word alone never fails the gate: only a critical or high finding does')
})

test('rig-check runs in the merge queue: merge_group triggers it, ai-review stays a PR job, and the base comes from the queue', () => {
  const w = parse(read('templates/rig-check.yml')) as Workflow
  assert.ok(Object.keys(w.on as object).includes('merge_group'))
  assert.match((w.jobs as Record<string, { if?: string }>)['ai-review']!.if ?? '', /github\.event_name == 'pull_request'/)
  const t = read('templates/rig-check.yml')
  assert.equal((t.match(/BASE: \$\{\{ github\.base_ref \|\| github\.event\.merge_group\.base_ref \}\}/g) ?? []).length, 2)
  assert.equal((t.match(/origin\/\$\{BASE#refs\/heads\/\}/g) ?? []).length, 3)
})

test('CI reviews the delta only, with a turn cap, no lockfiles or vendored harness, and a newer push cancels the older run', () => {
  const t = read('templates/rig-check.yml')
  const w = parse(t) as Workflow & { concurrency?: { group?: string; 'cancel-in-progress'?: boolean } }
  assert.match(w.concurrency?.group ?? '', /pull_request\.number/)
  assert.equal(w.concurrency?.['cancel-in-progress'], true)
  assert.equal((t.match(/claude -p --model opus --max-turns 25 /g) ?? []).length, 2)
  assert.equal((t.match(/Review only what this diff adds or changes; read another file only to understand a changed line, and never review code the diff does not change\./g) ?? []).length, 2)
  assert.match(t, /git diff "origin\/\$BASE\.\.\.HEAD" -- \. ':\(exclude\)\*package-lock\.json'[^\n]*':\(exclude\)\.rig\/bin'/)
})
