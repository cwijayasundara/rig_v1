# /rig:chart (sprint outer workflow) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the sprint outer workflow: a PRD per sprint, `/rig:chart` that writes the architecture, intents with dependencies and the test plan automatically, one human gate `/rig:approve chart-<N>`, and dependency-aware starting of intents.

**Architecture:** `scripts/chart.ts` owns the chart's files, digest, approval state and the PRD and cases parsers (no import of `inbox.ts`). `scripts/inbox.ts` adds sprint acceptance and dependencies on top of it. `scripts/chartcheck.ts` builds the trace report from both. `sdlc.ts` wires `approve chart-<N>`, `chart check <N>` and the refusal in `new --source`. Four skills and three templates carry the model work; the `rig:architect` agent is reused.

**Tech Stack:** Node ≥ 22.18 TypeScript run directly (type stripping), `node:test`, zero dependencies.

**Spec:** `docs/superpowers/specs/2026-10-11-chart-outer-workflow-design.md`

## Global Constraints

- Zero-dependency Node; no build step; imports end in `.ts`.
- Core must not import `brain/` (`scripts/brainboundary.spec.ts`).
- Approvals are human-only: `sdlc.ts approve` exits 3 unless `SDLC_HUMAN=1` (existing check at the top of `cmdApprove`).
- Traceability never blocks: `chart check` exits 0 whenever the PRD exists.
- Intents without `sprint:` behave exactly as today (all existing `scripts/inbox.spec.ts` tests stay green unchanged).
- Skill briefs to subagents ≤ 40 lines; intents ≤ 40 lines; `architecture.md` ≤ 200 lines.
- `npm test` is the verification command; quote its result.

**Deviations from the spec, decided while planning** (the spec is otherwise followed as written):
1. Template headings are **unnumbered** (`## Open questions`, `## Changes since last sprint`): `openQuestions()` only reads a heading spelled exactly `## Open questions`. Skills refer to sections by name, not `§N`.
2. `new --source` refuses for two reasons only: unshipped/missing/cyclic dependencies, and a sprint intent whose chart is not approved (missing or stale) or is `closed`. It does **not** start requiring `status: accepted` for intents without `sprint:`; today it does not, and rig-watch drafts are started by engineers.
3. `agents/architect.md` gets one sentence so the agent may write under `.rig/product/` and `.rig/intent/` when a chart brief says so (its prompt today restricts writes to a change folder).
4. `metrics.ts` `inbox_survival` counts a sprint intent accepted by its chart as decided (else every charted intent reads as undecided `draft`).
5. Open questions block approval in the PRD, `architecture.md` and ADRs; unresolved `## Concerns` block in every chart `.md` file.

## Review Focus

1. A PRD heading written `## 11. Open questions` (numbered): approval must still see the questions. → The template uses unnumbered headings, and Task 1 pins that the PRD fixture with `## Open questions` blocks; reviewers check the template headings match `openQuestions()`'s regex.
2. A `depends:` written as a YAML block list (`depends:\n  - a`) instead of `[a]`: `frontmatter()` reads only the first line, so the list is empty and never invents a dependency named `- a`. → The decompose skill and template require flow style; Task 2's test pins that a block list yields no dependency.
3. An intent whose `sprint:` is not a whole number (`sprint: 1a`, `sprint: one`): it must be treated as having no sprint, not crash. → Task 2 test.
4. Binary or CRLF test-data files: the digest must be stable across checkouts. `read()` normalises CRLF; Task 1 test writes a CRLF file and checks a re-approve says "already approved".
5. The dependency of an intent is shipped on a branch but not yet on the engineer's HEAD: it stays blocked (shipped = `ship.json` committed on HEAD). → Task 2's test commits the ship on HEAD and asserts blocked before, ready after.

---

### Task 1: chart core and `approve chart-<N>`

**Files:**
- Create: `scripts/chart.ts`
- Modify: `scripts/sdlc.ts` (imports at lines 9-40; `cmdApprove` at line 214)
- Test: `scripts/chart.spec.ts` (new)

**Interfaces:**
- Produces (from `scripts/chart.ts`):
  - `PRODUCT: string` (abs path `.rig/product`), `CHART_RE: RegExp` (`/^chart-(\d{1,4})$/`)
  - `type ChartFile = { path: string; sha: string }`, `type ChartApproval = Approval & { files?: ChartFile[] }`, `type ChartState = 'approved' | 'stale' | 'missing'`
  - `listField(v: string | undefined): string[]`, `sprintOf(v: string | undefined): number | null`, `prdPath(n: number): string`
  - `chartFiles(n): string[]` (repo-relative POSIX, sorted), `chartManifest(n): ChartFile[]`, `chartDigest(n): string`
  - `chartRows(n): ChartApproval[]`, `chartApproval(n): ChartState`, `changedSinceApproval(n): string[]`
  - `prdIds(text: string): string[]`, `type TestCase = { id: string; reqs: string[]; intent: string; level: string; data: string }`, `testCases(text: string): TestCase[]`

- [ ] **Step 1: Write the failing tests** — create `scripts/chart.spec.ts`:

```ts
// The sprint chart (.rig/product/): its digest, its one human approval, and the parsers the trace report uses.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write } from './testkit.ts'
import { listField, prdIds, testCases } from './chart.ts'

let repo: string
beforeEach(() => { repo = makeRepo() })
const PRD = '---\nsprint: 1\n---\n# PRD\n\n## Functional requirements\n### FR-1: Add to cart\n### FR-2: Checkout\n\n## Non-functional requirements\n| ID | Category |\n|---|---|\n| NFR-1 | performance |\n\n## Open questions\nnone\n'
const approve = (n: number, human = true) => sdlc(repo, ['approve', `chart-${n}`], { env: { SDLC_HUMAN: human ? '1' : '' } })
const rows = (): Record<string, unknown>[] => fs.readFileSync(path.join(repo, '.rig/approvals.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l) as Record<string, unknown>)

test('listField reads flow lists and tolerates empties and quotes', () => {
  assert.deepEqual(listField('[a, "b" , ,c]'), ['a', 'b', 'c'])
  assert.deepEqual(listField(''), [])
  assert.deepEqual(listField(undefined), [])
  assert.deepEqual(listField('single'), ['single'])
})

test('prdIds reads FR headings and NFR table rows, not ids mentioned in prose', () => {
  assert.deepEqual(prdIds(PRD + '\nFR-9 is mentioned here only.\n'), ['FR-1', 'FR-2', 'NFR-1'])
})

test('testCases reads TC rows and ignores the header and separator', () => {
  const t = '| ID | Requirement | Intent | Level | Data | Expected |\n|---|---|---|---|---|---|\n| TC-1 | FR-1, NFR-1 | add-to-cart.md | acceptance | data/cart.json | item in cart |\n'
  assert.deepEqual(testCases(t), [{ id: 'TC-1', reqs: ['FR-1', 'NFR-1'], intent: 'add-to-cart', level: 'acceptance', data: 'data/cart.json' }])
})

test('approve chart-N is human-only, writes one row with the files it covers, and is idempotent', () => {
  write(repo, '.rig/product/prd/sprint-1.md', PRD)
  const r = approve(1, false)
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /human-only/)
  assert.equal(approve(1).code, 0)
  assert.match(approve(1).stdout, /chart-1 is already approved/)
  const all = rows()
  assert.equal(all.length, 1)
  assert.deepEqual([all[0]?.slug, all[0]?.stage], ['chart-1', 'chart'])
  assert.deepEqual((all[0]?.files as { path: string }[]).map(f => f.path), ['.rig/product/prd/sprint-1.md'])
})

test('approve chart-N refuses a missing PRD, an open question and an unresolved concern', () => {
  write(repo, '.rig/intent/x.md', '---\nstatus: draft\n---\n# x\n')
  assert.match(approve(2).stderr, /sprint-2\.md does not exist/)
  write(repo, '.rig/product/prd/sprint-1.md', PRD.replace('## Open questions\nnone', '## Open questions\n- Which payment provider?'))
  assert.match(approve(1).stderr, /open question.*\n.*payment provider/)
  write(repo, '.rig/product/prd/sprint-1.md', PRD)
  write(repo, '.rig/product/architecture.md', '---\nsprint: 1\n---\n# Architecture\n\n## Concerns\n- [drift] the cart module calls the DB directly → owner: architect\n\n## Open questions\nnone\n')
  assert.match(approve(1).stderr, /concern/)
  assert.equal(fs.existsSync(path.join(repo, '.rig/approvals.jsonl')), false)
})

test('the digest covers the PRD, architecture, ADRs, test plan and sprint-N intents only; CRLF does not change it', () => {
  write(repo, '.rig/product/prd/sprint-1.md', PRD)
  write(repo, '.rig/intent/a.md', '---\nstatus: draft\nsprint: 1\n---\n# Intent: a\n')
  write(repo, '.rig/intent/other.md', '---\nstatus: draft\nsprint: 2\n---\n# Intent: other\n')
  assert.equal(approve(1).code, 0)
  write(repo, '.rig/intent/other.md', '---\nstatus: draft\nsprint: 2\n---\n# Intent: other, edited\n')
  write(repo, '.rig/intent/a.md', '---\r\nstatus: draft\r\nsprint: 1\r\n---\r\n# Intent: a\r\n')
  assert.match(approve(1).stdout, /already approved/, 'another sprint and a CRLF checkout keep the approval')
  const edits: [string, string][] = [
    ['.rig/intent/a.md', '---\nstatus: draft\nsprint: 1\n---\n# Intent: a, edited\n'],
    ['.rig/intent/b.md', '---\nsprint: 1\n---\n# new\n'],
    ['.rig/product/adr/0001-db.md', '# ADR 1\n'],
    ['.rig/product/testplan/data/cart.json', '{}'],
  ]
  for (const [file, text] of edits) {
    write(repo, file, text)
    assert.match(approve(1).stdout, /approved chart-1 by/, file)
  }
  fs.rmSync(path.join(repo, '.rig/intent/b.md'))
  assert.match(approve(1).stdout, /approved chart-1 by/, 'a removed sprint intent changes the digest')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test scripts/chart.spec.ts`
Expected: FAIL — `Cannot find module './chart.ts'`.

- [ ] **Step 3: Create `scripts/chart.ts`**

```ts
// The sprint chart (.rig/product/): one PRD per sprint, the living architecture, ADRs and the test plan, approved once per
// sprint by a person with /rig:approve chart-<N>. The digest covers every file of the sprint, so any edit makes it stale.
// Imports nothing from inbox.ts (inbox.ts imports this).
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, SDLC, APPROVALS, exists, read, sha, frontmatter, readJsonl, toPosix, type Approval } from './core.ts'

export const PRODUCT = path.join(SDLC, 'product')
const INTENTS = path.join(SDLC, 'intent')
export const CHART_RE = /^chart-(\d{1,4})$/
export type ChartFile = { path: string; sha: string }
export type ChartApproval = Approval & { files?: ChartFile[] }
export type ChartState = 'approved' | 'stale' | 'missing'

// Frontmatter lists are flow style on one line (`depends: [a, b]`); frontmatter() returns that as a string.
export const listField = (v: string | undefined): string[] =>
  (v ?? '').replace(/^\[|\]$/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(s => /^[A-Za-z0-9][\w.-]*$/.test(s))
export const sprintOf = (v: string | undefined): number | null => (/^\d{1,4}$/.test(v ?? '') ? Number(v) : null)
export const prdPath = (n: number): string => path.join(PRODUCT, 'prd', `sprint-${n}.md`)

function walk(dir: string): string[] {
  if (!exists(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
}

export function chartFiles(n: number): string[] {
  const intents = exists(INTENTS) ? fs.readdirSync(INTENTS).filter(f => f.endsWith('.md')).map(f => path.join(INTENTS, f)) : []
  const abs = [
    prdPath(n),
    path.join(PRODUCT, 'architecture.md'),
    ...walk(path.join(PRODUCT, 'adr')).filter(f => f.endsWith('.md')),
    ...walk(path.join(PRODUCT, 'testplan')),
    ...intents.filter(f => sprintOf(frontmatter(read(f)).data.sprint) === n),
  ].filter(f => exists(f))
  return [...new Set(abs.map(f => toPosix(path.relative(ROOT, f))))].sort()
}
export const chartManifest = (n: number): ChartFile[] => chartFiles(n).map(p => ({ path: p, sha: sha(read(path.join(ROOT, p))) }))
export const chartDigest = (n: number): string => sha(chartManifest(n).map(f => `${f.path}\n${f.sha}\n`).join(''))

export const chartRows = (n: number): ChartApproval[] => readJsonl<ChartApproval>(APPROVALS).filter(a => a.slug === `chart-${n}` && a.stage === 'chart')
export function chartApproval(n: number): ChartState {
  const latest = chartRows(n).at(-1)
  if (!latest) return 'missing'
  return latest.digest === chartDigest(n) ? 'approved' : 'stale'
}
// Paths added, edited or removed since the last approval (every file when there is none), so a re-review reads only those.
export function changedSinceApproval(n: number): string[] {
  const before = new Map((chartRows(n).at(-1)?.files ?? []).map(f => [f.path, f.sha]))
  const current = chartManifest(n)
  const changed = current.filter(f => before.get(f.path) !== f.sha).map(f => f.path)
  const removed = [...before.keys()].filter(p => !current.some(f => f.path === p))
  return [...changed, ...removed].sort()
}

// Requirement ids the PRD defines: a heading `### FR-3: ...` or a table row `| NFR-2 | ...`. Ids mentioned in prose are references.
export function prdIds(text: string): string[] {
  const ids = new Set<string>()
  for (const l of text.split('\n')) {
    const m = /^#{2,4}\s+(N?FR-\d+)\b/.exec(l) ?? /^\|\s*(N?FR-\d+)\s*\|/.exec(l)
    if (m?.[1]) ids.add(m[1])
  }
  return [...ids].sort()
}

export type TestCase = { id: string; reqs: string[]; intent: string; level: string; data: string }
// cases.md rows: | ID | Requirement | Intent | Level | Data | Expected |
export function testCases(text: string): TestCase[] {
  return text.split('\n').map(l => l.split('|').map(c => c.trim())).filter(c => /^TC-\d+$/.test(c[1] ?? '')).map(c => ({
    id: c[1] ?? '', reqs: (c[2] ?? '').match(/\bN?FR-\d+\b/g) ?? [], intent: (c[3] ?? '').replace(/\.md$/, ''), level: c[4] ?? '', data: c[5] || '-',
  }))
}
```

- [ ] **Step 4: Wire `approve chart-<N>` in `scripts/sdlc.ts`**

Add the import after the `./inbox.ts` import (line 22):

```ts
import { CHART_RE, prdPath, chartManifest, chartDigest, chartRows, type ChartApproval } from './chart.ts'
```

In `cmdApprove`, directly after `const [slug, stage] = words(args)` and **before** `if (!slug || !stage)`:

```ts
  const chart = CHART_RE.exec(slug ?? '')
  if (chart) return approveChart(Number(chart[1]), stage, args)
```

Add above `cmdApprove`:

```ts
// One approval per sprint covers its PRD, architecture, ADRs, test plan and intents (chart.ts). Recorded with the file
// hashes, so a re-review after an edit can read only what changed. No change folder exists, so it never reaches checkSlug.
function approveChart(n: number, stage: string | undefined, args: Args): void {
  if (stage !== undefined && stage !== 'chart') fail(`usage: approve chart-${n}`)
  if (!exists(prdPath(n))) fail(`nothing to approve: .rig/product/prd/sprint-${n}.md does not exist`)
  const files = chartManifest(n)
  const text = (p: string): string => read(path.join(ROOT, p))
  const md = files.map(f => f.path).filter(p => p.endsWith('.md'))
  const asked = md.filter(p => p.startsWith('.rig/product/prd/') || p === '.rig/product/architecture.md' || p.startsWith('.rig/product/adr/'))
  const open = asked.flatMap(p => openQuestions(text(p)).map(q => `${p}: ${q}`))
  if (open.length) fail(`resolve the open question(s) before approving chart-${n}: answer each, or record the default under ## Decisions, and leave "## Open questions" as none:\n${open.map(q => `  - ${q}`).join('\n')}`)
  const concerns = md.flatMap(p => unresolvedConcerns(text(p)).map(c => `${p}: ${c}`))
  if (concerns.length) fail(`resolve the concern(s) with their owners before approving chart-${n}: add " → resolved: <decision> (<owner>)" to each:\n${concerns.map(c => `  - ${c}`).join('\n')}`)
  const digest = chartDigest(n)
  if (chartRows(n).at(-1)?.digest === digest) return out(`chart-${n} is already approved (digest ${digest})`)
  const by = optString(args, 'by') || whoami() || 'unknown'
  const row: ChartApproval = { slug: `chart-${n}`, stage: 'chart', by, at: now(), digest, files }
  fs.appendFileSync(APPROVALS, JSON.stringify(row) + '\n')
  out(`approved chart-${n} by ${by} (digest ${digest}, ${files.length} files). Next: engineers pick from sdlc.ts inbox --ready --sprint ${n}`)
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `node --disable-warning=ExperimentalWarning --test scripts/chart.spec.ts && npm run typecheck`
Expected: PASS, 6 tests; tsc no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/chart.ts scripts/chart.spec.ts scripts/sdlc.ts
git commit -m "feat: chart core, one human approval per sprint (approve chart-N)"
```

---

### Task 2: sprint acceptance and dependencies in the inbox

**Files:**
- Modify: `scripts/inbox.ts` (whole file, 41 lines)
- Modify: `scripts/metrics.ts:101`
- Test: `scripts/inbox.spec.ts` (append)

**Interfaces:**
- Consumes: `chartApproval`, `changedSinceApproval`, `listField`, `sprintOf` from `scripts/chart.ts`.
- Produces: `InboxEntry` gains `sprint: number | null; depends: string[]; prd: string[]; owner: string | null; accepted: boolean; blockedBy: string[]; ready: boolean`. `startRefusal(file: string): string | null` (used by Task 3). `pendingIntents()` now = ready + kebab name + no remote spec branch.

- [ ] **Step 1: Append failing tests** to `scripts/inbox.spec.ts`:

```ts
const PRD1 = '---\nsprint: 1\n---\n# PRD\n\n### FR-1: Add to cart\n\n## Open questions\nnone\n'
const approveChart = (n: number) => sdlc(repo, ['approve', `chart-${n}`], { env: { SDLC_HUMAN: '1' } })
type Row = Entry & { sprint: number | null; depends: string[]; owner: string | null; blockedBy: string[]; accepted: boolean; ready: boolean }
const rows = (...args: string[]): Row[] => JSON.parse(sdlc(repo, ['inbox', '--json', ...args]).stdout) as Row[]
const ship = (file: string, slug: string): void => {
  const r = sdlc(repo, ['new', slug, '--type', 'chore', '--tier', 'S', '--source', `.rig/intent/${file}`])
  assert.equal(r.code, 0, r.stderr)
  write(repo, `.rig/changes/${slug}/ship.json`, '{}')
  gitIn(repo, 'add', '-A')
  gitIn(repo, 'commit', '-qm', `ship ${slug}`)
}

test('a sprint intent is accepted only while its chart approval is fresh; closed drops it; a bad sprint is no sprint', () => {
  write(repo, '.rig/product/prd/sprint-1.md', PRD1)
  intent('a.md', 'status: draft\nsprint: 1')
  intent('b.md', 'status: closed\nsprint: 1')
  intent('c.md', 'status: accepted\nsprint: 1a')
  assert.deepEqual(rows().map(e => [e.file, e.sprint, e.accepted]), [['a.md', 1, false], ['b.md', 1, false], ['c.md', null, true]])
  assert.equal(approveChart(1).code, 0)
  assert.deepEqual(rows().map(e => [e.file, e.accepted, e.ready]), [['a.md', true, true], ['b.md', false, false], ['c.md', true, true]])
  write(repo, '.rig/product/prd/sprint-1.md', PRD1.replace('Add to cart', 'Add items to cart'))
  assert.deepEqual(rows().map(e => e.accepted), [false, false, true])
})

test('depends blocks until the dependency ships on HEAD; a missing target and a cycle block too', () => {
  intent('base.md', 'status: accepted')
  intent('next.md', 'status: accepted\ndepends: [base]')
  intent('lost.md', 'status: accepted\ndepends: [nowhere]')
  intent('x.md', 'status: accepted\ndepends: [y]')
  intent('y.md', 'status: accepted\ndepends: [x]')
  intent('block.md', 'status: accepted\ndepends:\n  - base')
  const by = (): Record<string, string[]> => Object.fromEntries(rows().map(e => [e.file, e.blockedBy]))
  let b = by()
  assert.deepEqual(b['next.md'], ['base'])
  assert.deepEqual(b['lost.md'], ['missing:nowhere'])
  assert.deepEqual(b['x.md'], ['y', 'cycle:x→y→x'])
  assert.deepEqual(b['y.md'], ['x', 'cycle:x→y→x'])
  assert.deepEqual(b['block.md'], [], 'a block-list line is not parsed into an invented dependency')
  ship('base.md', 'base-change')
  b = by()
  assert.deepEqual(b['next.md'], [])
  assert.equal(rows().find(e => e.file === 'next.md')?.ready, true)
})

test('--ready, --sprint and --owner filter; plain output names blockers and each sprint chart state', () => {
  write(repo, '.rig/product/prd/sprint-1.md', PRD1)
  intent('a.md', 'status: draft\nsprint: 1\nowner: ana')
  intent('b.md', 'status: draft\nsprint: 1\nowner: bo\ndepends: [a]')
  intent('c.md', 'status: accepted')
  assert.equal(approveChart(1).code, 0)
  assert.deepEqual(rows('--ready').map(e => e.file), ['a.md', 'c.md'])
  assert.deepEqual(rows('--sprint', '1').map(e => e.file), ['a.md', 'b.md'])
  assert.deepEqual(rows('--owner', 'bo').map(e => e.file), ['b.md'])
  const text = sdlc(repo, ['inbox']).stdout
  assert.match(text, /^chart-1: approved$/m)
  assert.match(text, /b\.md\s+blocked by a$/m)
})

test('--pending and the status warning skip blocked and unapproved intents', () => {
  write(repo, '.rig/product/prd/sprint-1.md', PRD1)
  intent('s.md', 'status: draft\nsprint: 1')
  intent('d.md', 'status: accepted\ndepends: [s]')
  intent('ok.md', 'status: accepted')
  assert.deepEqual(rows('--pending').map(e => e.file), ['ok.md'])
  sdlc(repo, ['new', 'other', '--type', 'chore', '--tier', 'S'])
  const status = sdlc(repo, ['status']).stdout
  assert.match(status, /intent ok\.md is accepted/)
  assert.doesNotMatch(status, /intent (s|d)\.md is accepted/)
})

test('metrics: a sprint intent accepted by its chart counts as decided', () => {
  write(repo, '.rig/product/prd/sprint-1.md', PRD1)
  for (const f of ['a.md', 'b.md', 'c.md', 'd.md']) intent(f, 'status: draft\nsprint: 1')
  intent('e.md', 'status: closed')
  assert.equal(approveChart(1).code, 0)
  const m = JSON.parse(sdlc(repo, ['metrics', '--json']).stdout).metrics
  assert.deepEqual({ value: m.inbox_survival.value, n: m.inbox_survival.n }, { value: 0.8, n: 5 })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test scripts/inbox.spec.ts`
Expected: the 5 new tests FAIL (`accepted`/`blockedBy` undefined); the existing ones PASS.

- [ ] **Step 3: Replace `scripts/inbox.ts`** with:

```ts
// The intent inbox (.rig/intent/*.md): ideas a product owner commits before any change exists. People write `status:`
// (draft | accepted | closed); `shipped` is derived from the change whose intent.md names the file as its `source:`.
// A sprint intent (`sprint: N`, written by /rig:decompose) is accepted by its sprint's chart approval instead of its own
// status; `depends:` names other intents that must ship first (chart.ts holds the chart, this file the dependencies).
import fs from 'node:fs'
import path from 'node:path'
import { SDLC, CHANGES, exists, read, out, frontmatter, listChanges, isShipped, git, optString, type Args, type ChangeType, type Tier } from './core.ts'
import { modelFor, isChangeType, isTier, type ModelAlias } from './graph.ts'
import { chartApproval, changedSinceApproval, listField, sprintOf, type ChartState } from './chart.ts'

export const INBOX = path.join(SDLC, 'intent')
export type InboxEntry = {
  file: string; status: 'draft' | 'accepted' | 'closed' | 'shipped' | 'unknown'; change: string | null; type: ChangeType | null; tier: Tier | null; model: ModelAlias
  sprint: number | null; depends: string[]; prd: string[]; owner: string | null; accepted: boolean; blockedBy: string[]; ready: boolean
}
const DECLARED = ['draft', 'accepted', 'closed'] as const
const KEBAB_MD = /^[a-z0-9][a-z0-9-]{0,60}\.md$/
const nameOf = (file: string): string => file.replace(/\.md$/, '')

// Every intent on a dependency cycle, mapped to the cycle as `a→b→a`.
function cycles(graph: Map<string, string[]>): Map<string, string> {
  const found = new Map<string, string>()
  const state = new Map<string, 'open' | 'done'>()
  const stack: string[] = []
  const visit = (n: string): void => {
    state.set(n, 'open')
    stack.push(n)
    for (const d of graph.get(n) ?? []) {
      if (!graph.has(d)) continue
      if (state.get(d) === 'open') {
        const loop = [...stack.slice(stack.indexOf(d)), d]
        for (const m of loop) if (!found.has(m)) found.set(m, loop.join('→'))
      } else if (!state.has(d)) visit(d)
    }
    stack.pop()
    state.set(n, 'done')
  }
  for (const n of [...graph.keys()].sort()) if (!state.has(n)) visit(n)
  return found
}

export function inboxEntries(): InboxEntry[] {
  if (!exists(INBOX)) return []
  const bySource = new Map<string, string>()
  for (const slug of listChanges()) {
    const source = frontmatter(read(path.join(CHANGES, slug, 'intent.md'))).data.source
    if (source) bySource.set(path.basename(source), slug)
  }
  const charts = new Map<number, ChartState>()
  const chartOf = (n: number): ChartState => charts.get(n) ?? (charts.set(n, chartApproval(n)), charts.get(n) as ChartState)
  const base = fs.readdirSync(INBOX).filter(f => f.endsWith('.md')).sort().map(file => {
    const d = frontmatter(read(path.join(INBOX, file))).data
    const change = bySource.get(file) ?? null
    const declared = (DECLARED as readonly string[]).includes(d.status ?? '') ? (d.status as InboxEntry['status']) : 'unknown'
    const type = isChangeType(d.type) ? d.type : null
    const tier = isTier(d.tier) ? d.tier : null
    const sprint = sprintOf(d.sprint)
    const accepted = sprint !== null ? declared !== 'closed' && chartOf(sprint) === 'approved' : declared === 'accepted'
    // No valid tier is a doubt, and a doubt is Opus (M0's rule).
    return {
      file, status: change && isShipped(change) ? 'shipped' : declared, change, type, tier, model: tier ? modelFor(type ?? 'feature', tier) : 'opus',
      sprint, depends: listField(d.depends), prd: listField(d.prd), owner: d.owner || null, accepted,
    } satisfies Omit<InboxEntry, 'blockedBy' | 'ready'>
  })
  const byName = new Map(base.map(e => [nameOf(e.file), e]))
  const loops = cycles(new Map(base.map(e => [nameOf(e.file), e.depends])))
  return base.map(e => {
    const blockedBy = [
      ...e.depends.filter(d => !byName.has(d)).map(d => `missing:${d}`),
      ...e.depends.filter(d => byName.has(d) && byName.get(d)?.status !== 'shipped'),
      ...(loops.has(nameOf(e.file)) ? [`cycle:${loops.get(nameOf(e.file))}`] : []),
    ]
    return { ...e, blockedBy, ready: e.accepted && !e.change && !blockedBy.length }
  })
}

// Why `new --source` must not start this intent yet, or null. Intents without `sprint:` keep today's rule (no status check).
export function startRefusal(file: string): string | null {
  const e = inboxEntries().find(x => x.file === file)
  if (!e) return null
  if (e.blockedBy.length) return `blocked by: ${e.blockedBy.join(', ')} (each must ship first: its change's ship.json committed here)`
  if (e.sprint === null) return null
  if (e.status === 'closed') return `${file} is closed`
  const state = chartApproval(e.sprint)
  if (state === 'missing') return `chart-${e.sprint} is not approved: a person reviews the sprint and runs /rig:approve chart-${e.sprint}`
  if (state === 'stale') return `chart-${e.sprint} is stale: a person reviews what changed (${changedSinceApproval(e.sprint).join(', ')}) and runs /rig:approve chart-${e.sprint}`
  return null
}

export const specBranch = (file: string): string => `sdlc/intent-${file.replace(/\.md$/, '')}`

// What the rig-spec workflow drafts: ready (accepted, unblocked, no change yet), a plain name, and no draft branch already on the remote.
export const pendingIntents = (): InboxEntry[] => inboxEntries().filter(e =>
  e.ready && KEBAB_MD.test(e.file) && git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${specBranch(e.file)}`]) === null)

export function cmdInbox(args: Args): void {
  let rows = args.opt.pending ? pendingIntents() : inboxEntries()
  if (args.opt.ready) rows = rows.filter(e => e.ready)
  if (args.opt.sprint !== undefined) rows = rows.filter(e => e.sprint !== null && e.sprint === sprintOf(optString(args, 'sprint')))
  const owner = optString(args, 'owner')
  if (owner) rows = rows.filter(e => e.owner === owner)
  if (args.opt.json) return out(JSON.stringify(rows))
  if (!rows.length) return out('intent inbox is empty (.rig/intent/)')
  const sprints = [...new Set(rows.flatMap(e => (e.sprint === null ? [] : [e.sprint])))].sort((a, b) => a - b)
  out([
    ...sprints.map(n => `chart-${n}: ${chartApproval(n)}`),
    ...rows.map(e => `${e.status.padEnd(9)}${e.file}${e.change ? ` → ${e.change}` : ''}${e.blockedBy.length ? `  blocked by ${e.blockedBy.join(', ')}` : ''}`),
  ].join('\n'))
}
```

Note: the filtered-empty message stays `intent inbox is empty` (existing test relies on it for the unfiltered case).

- [ ] **Step 4: Update `scripts/metrics.ts:101`**

Replace:
```ts
  const decidedInbox = inboxEntries().filter(e => e.status !== 'draft' && e.status !== 'unknown')
  m.inbox_survival = share(decidedInbox.filter(e => e.status !== 'closed').length, decidedInbox.length)
```
with:
```ts
  // A sprint intent stays `draft` in its file; its chart approval is the decision.
  const decidedInbox = inboxEntries().filter(e => e.accepted || (e.status !== 'draft' && e.status !== 'unknown'))
  m.inbox_survival = share(decidedInbox.filter(e => e.status !== 'closed').length, decidedInbox.length)
```
and update the comment above it (lines 99-100) to end with `; a sprint intent counts as decided once its chart is approved.`

- [ ] **Step 5: Run the tests and the typecheck**

Run: `node --disable-warning=ExperimentalWarning --test scripts/inbox.spec.ts scripts/chart.spec.ts scripts/watch.spec.ts && npm run typecheck`
Expected: PASS (all existing inbox and watch tests included); tsc no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/inbox.ts scripts/inbox.spec.ts scripts/metrics.ts
git commit -m "feat: sprint intents accepted by their chart; depends blocks until shipped; inbox --ready/--sprint/--owner"
```

---

### Task 3: `chart check` and the refusal in `new --source`

**Files:**
- Create: `scripts/chartcheck.ts`
- Modify: `scripts/sdlc.ts` (`cmdNew` around line 115-118; `COMMANDS` around line 455)
- Test: `scripts/chart.spec.ts` (append)

**Interfaces:**
- Consumes: `inboxEntries`, `startRefusal` (Task 2); `PRODUCT`, `prdPath`, `prdIds`, `testCases`, `sprintOf`, `chartApproval`, `changedSinceApproval`, `ChartState` (Task 1).
- Produces: `type ChartReport = { sprint: number; approval: ChartState; uncovered: string[]; untested: string[]; unreferenced: string[]; unknownIds: string[]; orphanCases: string[]; missingData: string[]; deps: string[]; changedSinceApproval: string[] }`, `chartCheck(n: number): ChartReport`, `cmdChart(args: Args): void`. The skills (Task 5) read `sdlc.ts chart check <N> --json` with exactly these keys.

- [ ] **Step 1: Append failing tests** to `scripts/chart.spec.ts`:

```ts
test('new --source refuses a blocked or unapproved intent and names why; a ready one starts; a later stale chart leaves it alone', () => {
  write(repo, '.rig/product/prd/sprint-1.md', PRD)
  write(repo, '.rig/intent/a.md', '---\nstatus: draft\nsprint: 1\n---\n# Intent: a\n')
  write(repo, '.rig/intent/b.md', '---\nstatus: accepted\ndepends: [a]\n---\n# Intent: b\n')
  const start = (f: string, slug: string) => sdlc(repo, ['new', slug, '--type', 'feature', '--tier', 'M', '--source', `.rig/intent/${f}`])
  let r = start('a.md', 'a-change')
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /chart-1 is not approved/)
  r = start('b.md', 'b-change')
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /blocked by: a/)
  assert.equal(fs.existsSync(path.join(repo, '.rig/changes/b-change')), false)
  assert.equal(approve(1).code, 0)
  write(repo, '.rig/product/prd/sprint-1.md', PRD.replace('Checkout', 'Pay'))
  assert.match(start('a.md', 'a-change').stderr, /chart-1 is stale: .*\.rig\/product\/prd\/sprint-1\.md/)
  assert.equal(approve(1).code, 0)
  r = start('a.md', 'a-change')
  assert.equal(r.code, 0, r.stderr)
  write(repo, '.rig/product/prd/sprint-1.md', PRD)
  const next = JSON.parse(sdlc(repo, ['next', 'a-change', '--json']).stdout) as { verdict: string; reason: string }
  assert.doesNotMatch(next.reason ?? '', /chart/)
})

test('chart check reports every gap kind, and what changed since the approval; it never fails on gaps', () => {
  write(repo, '.rig/product/prd/sprint-1.md', PRD)
  write(repo, '.rig/intent/cart.md', '---\nstatus: draft\nsprint: 1\nprd: [FR-1, FR-7]\ndepends: [ghost]\n---\n# Intent: cart\n')
  write(repo, '.rig/intent/bare.md', '---\nstatus: draft\nsprint: 1\n---\n# Intent: bare\n')
  write(repo, '.rig/product/testplan/cases.md', '| ID | Requirement | Intent | Level | Data | Expected |\n|---|---|---|---|---|---|\n| TC-1 | FR-1 | cart | acceptance | data/cart.json | added |\n| TC-2 | NFR-1 | gone | perf | - | p95 under 300 ms |\n')
  assert.equal(approve(1).code, 0)
  write(repo, '.rig/intent/bare.md', '---\nstatus: draft\nsprint: 1\n---\n# Intent: bare, edited\n')
  const r = sdlc(repo, ['chart', 'check', '1', '--json'])
  assert.equal(r.code, 0, r.stderr)
  assert.deepEqual(JSON.parse(r.stdout), {
    sprint: 1, approval: 'stale', uncovered: ['FR-2', 'NFR-1'], untested: ['FR-2'], unreferenced: ['bare.md'], unknownIds: ['FR-7'],
    orphanCases: ['TC-2 → gone'], missingData: ['TC-1 → data/cart.json'], deps: ['cart.md: missing:ghost'], changedSinceApproval: ['.rig/intent/bare.md'],
  })
  assert.match(sdlc(repo, ['chart', 'check', '1']).stdout, /^chart-1: stale$/m)
  const none = sdlc(repo, ['chart', 'check', '9'])
  assert.notEqual(none.code, 0)
  assert.match(none.stderr, /no PRD for sprint 9/)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test scripts/chart.spec.ts`
Expected: the 2 new tests FAIL (`new` succeeds without refusal; `unknown command chart`).

- [ ] **Step 3: Create `scripts/chartcheck.ts`**

```ts
// The sprint trace report (sdlc.ts chart check <N>): PRD requirements without an intent or a test case, intents without a
// requirement, ids nobody defined, cases without an intent or data, dependency problems, and what changed since the
// approval. It informs the reviewers of the chart PR and the /rig:chart fix round; it never blocks.
import path from 'node:path'
import { exists, read, out, fail, type Args } from './core.ts'
import { PRODUCT, prdPath, prdIds, testCases, sprintOf, chartApproval, changedSinceApproval, type ChartState } from './chart.ts'
import { inboxEntries } from './inbox.ts'

export type ChartReport = {
  sprint: number; approval: ChartState; uncovered: string[]; untested: string[]; unreferenced: string[]; unknownIds: string[]
  orphanCases: string[]; missingData: string[]; deps: string[]; changedSinceApproval: string[]
}

export function chartCheck(n: number): ChartReport {
  const ids = prdIds(read(prdPath(n)))
  const known = new Set(ids)
  const entries = inboxEntries()
  const sprint = entries.filter(e => e.sprint === n)
  const cited = new Set(sprint.flatMap(e => e.prd))
  const testplan = path.join(PRODUCT, 'testplan')
  const cases = testCases(read(path.join(testplan, 'cases.md')))
  const tested = new Set(cases.flatMap(c => c.reqs))
  const names = new Set(entries.map(e => e.file.replace(/\.md$/, '')))
  return {
    sprint: n,
    approval: chartApproval(n),
    uncovered: ids.filter(i => !cited.has(i)),
    untested: ids.filter(i => !tested.has(i)),
    unreferenced: sprint.filter(e => !e.prd.length).map(e => e.file),
    unknownIds: [...new Set([...cited, ...tested])].filter(i => !known.has(i)).sort(),
    orphanCases: cases.filter(c => !names.has(c.intent)).map(c => `${c.id} → ${c.intent || '(none)'}`),
    missingData: cases.filter(c => c.data !== '-' && !exists(path.join(testplan, c.data))).map(c => `${c.id} → ${c.data}`),
    deps: sprint.flatMap(e => e.blockedBy.filter(b => /^(missing|cycle):/.test(b)).map(b => `${e.file}: ${b}`)),
    changedSinceApproval: changedSinceApproval(n),
  }
}

export function cmdChart(args: Args): void {
  const [sub, num] = args.pos
  const n = sprintOf(num)
  if (sub !== 'check' || n === null) fail('usage: chart check <N> [--json]')
  if (!exists(prdPath(n))) fail(`no PRD for sprint ${n}: write .rig/product/prd/sprint-${n}.md from the prd-format template`)
  const r = chartCheck(n)
  if (args.opt.json) return out(JSON.stringify(r))
  const { sprint: _s, approval, ...gaps } = r
  out([`chart-${n}: ${approval}`, ...Object.entries(gaps).map(([k, v]) => `${k}: ${v.length ? v.join(', ') : 'none'}`)].join('\n'))
}
```

- [ ] **Step 4: Wire it in `scripts/sdlc.ts`**

Change the inbox import (line 22) to:
```ts
import { cmdInbox, pendingIntents, startRefusal } from './inbox.ts'
import { cmdChart } from './chartcheck.ts'
```

In `cmdNew`, directly after the `--source must name an existing ...` check:
```ts
  // A sprint intent waits for its chart approval, and any intent for the intents it depends on (inbox.ts).
  const refusal = source === undefined ? null : startRefusal(path.basename(source))
  if (refusal) fail(`not starting ${source}: ${refusal}`)
```

In `COMMANDS`, after `inbox: cmdInbox,`:
```ts
  chart: cmdChart,
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `node --disable-warning=ExperimentalWarning --test scripts/chart.spec.ts scripts/inbox.spec.ts && npm run typecheck`
Expected: PASS, 8 chart tests and all inbox tests; tsc no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/chartcheck.ts scripts/chart.spec.ts scripts/sdlc.ts
git commit -m "feat: sdlc.ts chart check (trace report) and new --source refuses blocked or unapproved intents"
```

---

### Task 4: templates (PRD, architecture, test plan)

**Files:**
- Create: `templates/prd-format.md`, `templates/architecture-format.md`, `templates/testplan-format.md`
- Test: `scripts/chart.spec.ts` (append one test)

**Interfaces:**
- Produces: the formats the Task 5 skills name by path (`${CLAUDE_PLUGIN_ROOT}/templates/<name>`). The PRD template's ids must parse with `prdIds()`; the cases table with `testCases()`; its `## Open questions` with `openQuestions()`.

- [ ] **Step 1: Write the failing test** (append to `scripts/chart.spec.ts`):

```ts
test('the templates parse: PRD ids, the cases table, and an open question under the PRD heading', () => {
  const tpl = (f: string): string => fs.readFileSync(path.join(import.meta.dirname, '..', 'templates', f), 'utf8')
  const prd = tpl('prd-format.md')
  assert.deepEqual(prdIds(prd), ['FR-1', 'NFR-1'])
  assert.match(prd, /^## Open questions$/m)
  assert.match(prd, /^## Changes since last sprint$/m)
  assert.deepEqual(testCases(tpl('testplan-format.md')).map(c => c.id), ['TC-1'])
  assert.match(tpl('architecture-format.md'), /^## Concerns$/m)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --disable-warning=ExperimentalWarning --test scripts/chart.spec.ts`
Expected: FAIL — `ENOENT ... templates/prd-format.md`.

- [ ] **Step 3: Create `templates/prd-format.md`**

````markdown
# PRD format (one file per sprint: .rig/product/prd/sprint-<N>.md)

Written by the product owner and the BA. Ids are stable across sprints: FR-3 means the same requirement in sprint 1 and
sprint 4; a removed requirement keeps its id retired and listed under ## Changes since last sprint. Every acceptance
criterion must be testable; every NFR must have a number. Headings are spelled exactly as below (rig reads them).

```
---
product: <name>
sprint: <0 | N>
status: draft | accepted
owner: <product owner>
contributors: [<BA>, <architect>, <test lead>]
---
# PRD: <product>, sprint <N>

## Context and problem
Who hurts today, how, and the evidence (data, quotes).

## Goals and success metrics
| ID | Goal | Metric | Baseline | Target | How measured |
|---|---|---|---|---|---|

## Non-goals
Out of scope for this sprint.

## Users and personas
Persona, job to be done, frequency, access level.

## Functional requirements
### FR-1: <name>
- Need: one sentence, in the user's words
- Acceptance criteria: Given / When / Then, each one testable
- Priority: must | should | could
- Depends on: FR-x, NFR-y, an external system
- Delta: new | changed since sprint <N-1>

## Non-functional requirements
| ID | Category | Requirement | Target | Verified by |
|---|---|---|---|---|
| NFR-1 | performance | <what> | <number and unit> | <test level or sensor> |

Categories: performance, availability, scalability, security, privacy and compliance, accessibility, observability,
cost, operability (deploy, rollback).

## Data
Entities, sources, retention, personal-data classification, migration of existing data.

## Integrations and constraints
External systems and APIs, mandated stack, hosting, regulation, budget, deadlines.

## Release and rollout
Environments, feature flags, rollout plan, rollback trigger, who owns the production gate.

## Risks and assumptions
| ID | Risk or assumption | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|

## Changes since last sprint
Requirements added, changed or retired since sprint <N-1>, each with its id and why. Sprint 0: none.

## Open questions
none
```
````

- [ ] **Step 4: Create `templates/architecture-format.md`**

````markdown
# Architecture format (.rig/product/architecture.md and .rig/product/adr/)

`architecture.md` is the intended architecture, refreshed each sprint by `/rig:architecture`; the wiki's
`.rig/wiki/architecture.md` is the as-built one. At most 200 lines, **no implementation code** (sketches of 10 lines or
fewer, signatures only). Every NFR id appears under `## Quality attributes`.

```
---
sprint: <N>
updated: <YYYY-MM-DD>
---
# Architecture: <product>

## Context
The system, its users and the external systems it talks to (a Mermaid C4-context or flowchart, 15 lines or fewer).

## Building blocks
Containers and modules, one line of responsibility each, and the direction of dependencies (domain ← application ← adapters).

## Data
Entities, ownership (which module writes each), storage, retention.

## Integrations
Each external system: protocol, contract owner, failure behaviour.

## Quality attributes
| NFR | Tactic | Where | Verified by |
|---|---|---|---|

## Deployment
Environments, how a change reaches production, rollback.

## Decisions
| ADR | Title | Status |
|---|---|---|

## Concerns
- [drift] <intended vs as built> → owner: <name>
(or `none`; a concern blocks the chart approval until it carries ` → resolved: <decision> (<owner>)`)

## Open questions
none
```

ADR, `.rig/product/adr/NNNN-<kebab>.md` (next free number, four digits). An accepted ADR is never edited except its
`status:` line, which becomes `superseded-by NNNN` when a later ADR reverses it.

```
---
status: proposed | accepted | superseded-by NNNN
sprint: <N>
---
# ADR NNNN: <decision>

## Context
## Decision
## Consequences
## Open questions
none
```
````

- [ ] **Step 5: Create `templates/testplan-format.md`**

````markdown
# Test plan format (.rig/product/testplan/)

Written by the test lead (`/rig:testplan`). Every FR and NFR id of the PRD has at least one case; each case names the one
intent whose change makes it pass. Data is synthetic: never real personal data.

`plan.md`:

```
---
sprint: <N>
---
# Test plan: <product>, sprint <N>

## Scope
## Levels
Which level covers what: unit, integration, acceptance, api, perf, security, manual; and the command each runs with
(must match `levels` in .rig/sensors.json).
## Environments
## Test data
What is under data/, how it is loaded, how it is reset.
## Entry and exit criteria
## Open questions
none
```

`cases.md`: one table, one row per case. `Requirement` lists PRD ids; `Intent` is an inbox name without `.md`; `Data`
is a path relative to `.rig/product/testplan/` or `-`; `manual` cases say why in `Expected`.

```
| ID | Requirement | Intent | Level | Data | Expected |
|---|---|---|---|---|---|
| TC-1 | FR-1 | <intent-name> | acceptance | data/<file>.json | <observable result> |
```

`data/`: small fixtures and seed scripts, one file per data set, named after what it holds.
````

- [ ] **Step 6: Run the test**

Run: `node --disable-warning=ExperimentalWarning --test scripts/chart.spec.ts`
Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add templates/prd-format.md templates/architecture-format.md templates/testplan-format.md scripts/chart.spec.ts
git commit -m "feat: PRD, architecture and test plan templates for the sprint chart"
```

---

### Task 5: the four skills, the architect agent and the design skill

**Files:**
- Create: `skills/chart/SKILL.md`, `skills/architecture/SKILL.md`, `skills/decompose/SKILL.md`, `skills/testplan/SKILL.md`
- Modify: `agents/architect.md` (line 11, the first body line)
- Modify: `skills/design/SKILL.md` (step 2)
- Test: `scripts/vendor.spec.ts:30` (one assertion)

**Interfaces:**
- Consumes: `sdlc.ts chart check <N> --json` (Task 3 keys), `sdlc.ts skill <name> <args>` (prints a skill body), the templates (Task 4).
- Produces: `/rig:chart <prd>`, `/rig:architecture <prd>`, `/rig:decompose <prd>`, `/rig:testplan <prd>`. Each role skill has a `## Brief` section; `/rig:chart` pastes those sections into its subagent briefs.

- [ ] **Step 1: Write the failing assertion** — in `scripts/vendor.spec.ts`, after the line asserting `rig-next/SKILL.md` (line 30), add:

```ts
  for (const s of ['chart', 'architecture', 'decompose', 'testplan']) assert.ok(skills.some(f => f.endsWith(`rig-${s}/SKILL.md`)), `rig-${s} is vendored`)
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --disable-warning=ExperimentalWarning --test scripts/vendor.spec.ts`
Expected: FAIL — `rig-chart is vendored`.

- [ ] **Step 3: Create `skills/architecture/SKILL.md`**

```markdown
---
name: architecture
description: Refresh the product's living architecture (.rig/product/architecture.md and ADRs) from a sprint's PRD. For the architect at the start of a sprint; /rig:chart runs it for you.
argument-hint: <.rig/product/prd/sprint-N.md>
effort: medium
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git *), Read, Glob, Agent
---
# Architecture for $0

Run each sdlc.ts command as its own Bash call (no `cd`, pipes, redirects, `&&` or variables); read files with Read; one-line commit messages.

1. Read `$0`; its frontmatter `sprint:` is N. Without a whole-number `sprint:`, stop and say so.
2. Launch one `rig:architect` agent in the foreground, model `opus`, effort `high`, with the `## Brief` below ($0 filled in).
3. Relay its open questions with its recommended answers; record the person's answers in `architecture.md` under `## Decisions` (or the ADR) and leave `## Open questions` as `none`.
4. Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts chart check N` and show it.
5. Commit `.rig/product/` on branch `rig/chart-N` (create it from the trunk if needed): `chart: architecture for sprint N`.

End with: `Next: /rig:decompose $0` (or `/rig:approve chart-N` once intents and the test plan are in and reviewed).

## Brief
Chart work, not a change: write only under `.rig/product/` (this overrides the change-folder rule). Never edit source code.
Inputs: the PRD `$0`; the previous `.rig/product/architecture.md` and `.rig/product/adr/*.md` when they exist;
`.rig/wiki/architecture.md` (as built) when it exists; `CLAUDE.md`. Format: `${CLAUDE_PLUGIN_ROOT}/templates/architecture-format.md`.
- Write `.rig/product/architecture.md` (≤ 200 lines, frontmatter `sprint: N`, `updated:` today).
- Sprint 0: design from the PRD's `## Integrations and constraints` and `## Non-functional requirements`; keep it to what this sprint needs.
- Later sprints: keep what exists; change only what `## Changes since last sprint` requires.
- Each new or reversed decision is a new ADR `.rig/product/adr/NNNN-<kebab>.md` (next number, `status: accepted`); a reversed ADR gets only `status: superseded-by NNNN`.
- Every NFR id appears under `## Quality attributes` with a tactic and how it is verified.
- Each gap between the intended and the as-built architecture is a `## Concerns` bullet `- [drift] <gap> → owner: <architect named in the PRD>`.
- Leave `## Open questions` as `none`: put questions in your reply, each with your recommended answer.
Reply in 15 lines or fewer: files written, key decisions, ADR numbers, open questions.
```

- [ ] **Step 4: Create `skills/decompose/SKILL.md`**

```markdown
---
name: decompose
description: Break a sprint's PRD into intents in .rig/intent/ with sprint, cluster, owner, depends and prd fields, so engineers can pick a cluster and /rig:start each intent. For the BA and architect; /rig:chart runs it for you. Not for a single idea (that is /rig:intent).
argument-hint: <.rig/product/prd/sprint-N.md>
effort: medium
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git *), Read, Glob, Agent
---
# Decompose $0 into intents

Run each sdlc.ts command as its own Bash call (no `cd`, pipes, redirects, `&&` or variables); read files with Read; one-line commit messages.

1. Read `$0`; its frontmatter `sprint:` is N. Without a whole-number `sprint:`, stop and say so. Without `.rig/product/architecture.md`, say once that `/rig:architecture $0` should run first, then continue.
2. Launch one `rig:architect` agent in the foreground, model `opus`, effort `high`, with the `## Brief` below ($0 filled in).
3. Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts chart check N`. If `uncovered`, `unreferenced`, `unknownIds` or `deps` is not empty, launch the agent once more with the Brief plus that list; then check again and show the result.
4. Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts inbox --sprint N` and show it.
5. Commit `.rig/intent/` on branch `rig/chart-N`: `chart: intents for sprint N`.

End with: `Next: /rig:testplan $0`.

## Brief
Chart work, not a change: write only `.rig/intent/<kebab>.md` files (this overrides the change-folder rule). Never edit source code.
Inputs: the PRD `$0`, `.rig/product/architecture.md`, and the names in `.rig/intent/` (never reuse one; never edit an intent of another sprint or one with a change).
Each intent is one change one engineer ships in a few days (tier S or M); split anything bigger. Write ≤ 40 lines each:
    ---
    status: draft
    author: <PRD owner> via rig:decompose
    created: <today>
    sprint: N
    cluster: <architecture module it lives in, kebab>
    owner: <only if the PRD names one; else leave empty>
    depends: [<intent names without .md>]
    prd: [<FR and NFR ids>]
    type: feature
    ---
    # Intent: <title>
    ## Problem
    ## Proposed outcome
    ## Affected users and systems
    ## Constraints
    ## Open questions
    none
- Lists are flow style on one line (`[a, b]`), never a `- a` block list.
- Every FR id of this PRD is cited by at least one intent; an NFR is cited by the intents whose code it constrains.
- `depends` only for a real build order (it needs code or a contract another intent creates); no cycles.
- Clusters follow the architecture's building blocks so one engineer can own a cluster.
- Sprint 0: one `walking-skeleton` intent (one thin request through every building block, deployed to the first environment); every other sprint-0 intent depends on it directly or through another intent.
Reply in 15 lines or fewer: a table name | cluster | depends | prd.
```

- [ ] **Step 5: Create `skills/testplan/SKILL.md`**

```markdown
---
name: testplan
description: Write the sprint's test plan, test cases and test data (.rig/product/testplan/) from its PRD and intents, each case traced to a requirement and an intent. For the test lead; /rig:chart runs it for you.
argument-hint: <.rig/product/prd/sprint-N.md>
effort: medium
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git *), Read, Glob, Agent
---
# Test plan for $0

Run each sdlc.ts command as its own Bash call (no `cd`, pipes, redirects, `&&` or variables); read files with Read; one-line commit messages.

1. Read `$0`; its frontmatter `sprint:` is N. Without a whole-number `sprint:`, stop and say so.
2. Launch one `rig:architect` agent in the foreground, model `sonnet`, effort `medium`, with the `## Brief` below ($0 filled in).
3. Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts chart check N`. If `untested`, `orphanCases` or `missingData` is not empty, launch the agent once more with the Brief plus that list; then check again and show the result.
4. Commit `.rig/product/testplan/` on branch `rig/chart-N`: `chart: test plan for sprint N`.

End with: `Next: review the chart, then /rig:approve chart-N`.

## Brief
Chart work, not a change: write only under `.rig/product/testplan/` (this overrides the change-folder rule). Never edit source code.
Inputs: the PRD `$0`, `.rig/product/architecture.md`, the intents in `.rig/intent/` with `sprint: N`, the existing test plan, and `levels` in `.rig/sensors.json`. Format: `${CLAUDE_PLUGIN_ROOT}/templates/testplan-format.md`.
- Update `plan.md` and `cases.md`; keep earlier sprints' cases; delete only cases of requirements the PRD retired.
- Every FR and NFR id of the PRD has at least one case; each case names exactly one intent of this or an earlier sprint.
- NFR cases are `perf` or `security`, or `manual` with the reason in `Expected`.
- Data files go under `data/`, synthetic only (no real personal data), small; `Data` paths are relative to `.rig/product/testplan/`.
Reply in 15 lines or fewer: case count per level, data files, requirements you could not test and why.
```

- [ ] **Step 6: Create `skills/chart/SKILL.md`**

```markdown
---
name: chart
description: Chart a sprint from its PRD in one turn - the architecture and ADRs, the sprint's intents with dependencies, and the test plan, cases and data - then stop at the one human gate (/rig:approve chart-<N>). For whoever starts a sprint; not for a single change (that is /rig:start).
argument-hint: <.rig/product/prd/sprint-N.md>
effort: medium
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git *), Bash(gh pr create *), Read, Glob, Agent
---
# Chart the sprint in $0

Run each sdlc.ts command as its own Bash call (no `cd`, pipes, redirects, `&&` or variables); read files with Read; one-line commit messages. Run subagents in the foreground; never end the turn while one runs. Never approve the chart yourself.

1. **Ready.** Read `$0`; its frontmatter `sprint:` is N (a whole number), else stop and say so. If its `## Open questions` lists anything, show the list and stop: the product owner answers them in the PRD first. If `.rig/sensors.json` is missing: sprint 0 → stop with `Next: /rig:init greenfield "<stack from ## Integrations and constraints>, <goal from ## Context and problem>"`, then `/rig:chart $0`; later sprints → `Next: /rig:init`.
2. **Branch.** `git switch rig/chart-N`, or `git switch -c rig/chart-N` when it does not exist.
3. **Architecture and intents, one Opus launch.** Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts skill architecture $0` and `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts skill decompose $0`. Launch one `rig:architect`, model `opus`, effort `high`; the brief is the two `## Brief` sections in that order, plus: "Write the architecture first; the intents follow its building blocks."
4. **Test plan, one Sonnet launch.** Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts skill testplan $0`. Launch one `rig:architect`, model `sonnet`, effort `medium`; the brief is its `## Brief` section.
5. **Trace.** Run `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts chart check N --json`. One fix round at most: `uncovered`, `unreferenced`, `unknownIds` or `deps` not empty → relaunch the Opus agent with the decompose Brief plus those lists; `untested`, `orphanCases` or `missingData` not empty → relaunch the Sonnet agent with the testplan Brief plus those lists. Then run the check once more (plain output).
6. **Questions.** Relay the agents' open questions with their recommended answers in one AskUserQuestion when a person is present; otherwise record the recommended answers under `## Decisions`. Leave every `## Open questions` as `none`.
7. **Commit and PR.** Commit `.rig/product/` and `.rig/intent/`: `chart: sprint N`. With a remote and `gh`, push and run `gh pr create --title "chart: sprint N" --body "<the check output>\n\nReviewers: product owner, architect, test lead. After review, one of them runs /rig:approve chart-N on this branch, commits .rig/approvals.jsonl and pushes; CI asks a code owner to approve that row."`. Without a remote, say the review is local.

End with a table of the intents (name, cluster, depends), the remaining gaps from the check, and: `Next: review the chart, then /rig:approve chart-N`.
```

- [ ] **Step 7: Let the architect write chart files** — in `agents/architect.md`, replace the first body line (line 11, beginning `You design a change. The brief names the change folder`) with:

```
You design a change. The brief names the change folder (`.rig/changes/<slug>/`), the document to write (`spec.md`, `plan.md` or `design.md`), the format file to follow, and any scout findings. Read the format file, `intent.md`, `spec.md` when it exists, the guides in `.rig/guides/`, and only the code lines the findings point to. A chart brief (from `/rig:chart`, `/rig:architecture`, `/rig:decompose` or `/rig:testplan`) instead names the files to write under `.rig/product/` or `.rig/intent/`; follow it.
```

and in the next paragraph replace `Write only the requested file inside the change folder.` with `Write only the requested files: inside the change folder, or where a chart brief says.`

- [ ] **Step 8: Design reads the chart** — in `skills/design/SKILL.md`, append to the end of step 2:

```
When `.rig/product/architecture.md` exists, also give the architect its path and the rows of `.rig/product/testplan/cases.md` whose `Intent` is this change's `source:` intent: design.md follows the architecture, cites the ADRs it relies on, and names those TC ids in the slices that make them pass (not checked by rig; reviewers read it).
```

- [ ] **Step 9: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test scripts/vendor.spec.ts scripts/initskill.spec.ts && claude plugin test .`
Expected: PASS; `claude plugin test` reports no skill frontmatter errors.

- [ ] **Step 10: Commit**

```bash
git add skills/chart skills/architecture skills/decompose skills/testplan agents/architect.md skills/design/SKILL.md scripts/vendor.spec.ts
git commit -m "feat: /rig:chart, /rig:architecture, /rig:decompose, /rig:testplan skills"
```

---

### Task 6: documentation and the full suite

**Files:**
- Modify: `README.md` (command table near line 162; new section before `### Path B` at line 332 → after Path B ends, as `### Path C`)
- Modify: `templates/readme-rig.md` (user guide table, line 26-32)
- Modify: `DESIGN.md` (after the type table near line 66)
- Modify: `CHANGELOG.md` (first bullet under `## Unreleased`)

- [ ] **Step 1: README command table** — after the `/rig:intent` row add:

```markdown
| `/rig:chart <prd>` | Start of a sprint: from `.rig/product/prd/sprint-N.md`, writes the architecture and ADRs, the sprint's intents with `depends:`, and the test plan, cases and data in one turn, then one gate: `/rig:approve chart-N`. `/rig:architecture`, `/rig:decompose` and `/rig:testplan` run one part each. | Opus once, Sonnet once |
```

- [ ] **Step 2: README Path C** — add after the end of the `### Path B` section:

````markdown
### Path C: a team, sprint by sprint

```
 PRD for sprint N ──► /rig:chart .rig/product/prd/sprint-N.md ──► {{ /rig:approve chart-N }} ──► inbox --ready
 (product owner, BA)   architecture + intents + test plan          (PO, architect, test lead)     engineers: /rig:start .rig/intent/<x>.md
```

1. **Sprint 0 is greenfield.** `/rig:init greenfield "<stack and goal>"`, then write `.rig/product/prd/sprint-0.md` from `templates/prd-format.md`.
2. **Chart it.** `/rig:chart .rig/product/prd/sprint-0.md` writes `.rig/product/architecture.md` and ADRs, intents in `.rig/intent/` (`sprint`, `cluster`, `owner`, `depends`, `prd`), and `.rig/product/testplan/`, then opens a `chart: sprint 0` PR with the trace report (`sdlc.ts chart check 0`).
3. **One gate.** The product owner, architect and test lead review the PR; one of them runs `/rig:approve chart-0`. Editing any chart file afterwards makes the approval stale: new starts wait until it is re-approved, changes already running continue.
4. **Assign and build.** Set `owner:` per cluster; each engineer runs `sdlc.ts inbox --ready --owner <me>` and `/rig:start .rig/intent/<x>.md`. An intent whose `depends:` have not shipped is refused. Each change still meets its own design gate.
5. **Sprint 1 onwards is brownfield.** Write `sprint-1.md` with `## Changes since last sprint`; `/rig:chart` refreshes the architecture against the as-built wiki and adds only the new intents and cases.
````

- [ ] **Step 3: `templates/readme-rig.md`** — add to the user guide table after `Start a change`:

```markdown
| Chart a sprint from its PRD | `/rig:chart .rig/product/prd/sprint-N.md`, then a person runs `/rig:approve chart-N` |
| See what can be started | `node .rig/bin/sdlc.ts inbox --ready` (`--sprint N`, `--owner <name>`) |
```

- [ ] **Step 4: `DESIGN.md`** — after the type/path table add:

```markdown
**The sprint chart (outer workflow).** A team's sprint starts from a PRD (`.rig/product/prd/sprint-N.md`). `/rig:chart` writes the intended architecture and ADRs, the sprint's intents and the test plan with no stop, then one human gate covers all of them: `/rig:approve chart-N` hashes every chart file (`scripts/chart.ts`), so any later edit makes it stale and blocks new starts until re-approved. Scripts enforce only what they can compute: dependencies (`depends:` must have shipped, no cycles) and the gate. Traceability (`sdlc.ts chart check N`) is reported, never blocking, because a gap may be a deliberate scope call the reviewers make. One gate per sprint instead of one per artifact: the three documents are derived from the same PRD and reviewed together; each change keeps its own design gate, which decides *how*.
```

- [ ] **Step 5: `CHANGELOG.md`** — insert as the first bullet under `## Unreleased`:

```markdown
- **`/rig:chart`: the sprint outer workflow.** From `.rig/product/prd/sprint-N.md` (new `templates/prd-format.md`), one turn writes the architecture and ADRs (`/rig:architecture`, Opus), the sprint's intents with `sprint`, `cluster`, `owner`, `depends` and `prd` (`/rig:decompose`, same Opus launch) and the test plan, cases and data (`/rig:testplan`, Sonnet), runs the trace report (`sdlc.ts chart check N`) with one fix round, and opens a PR. One human gate per sprint, `/rig:approve chart-N`, hashes every chart file. Sprint intents are accepted by that approval; `depends:` blocks `new --source`, `inbox --pending` (rig-spec) and the status warning until the dependency ships; `inbox --ready`, `--sprint`, `--owner`. Files: `scripts/chart.ts`, `scripts/chartcheck.ts`, `scripts/inbox.ts`, `skills/{chart,architecture,decompose,testplan}`, `templates/{prd,architecture,testplan}-format.md`.
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: every spec passes, `typecheck:mod` clean, e2e unit and fast pass, `claude plugin test .` clean, `test:brain` passes. Quote the summary lines.

- [ ] **Step 7: Commit**

```bash
git add README.md templates/readme-rig.md DESIGN.md CHANGELOG.md
git commit -m "docs: the sprint chart (Path C) in README, readme-rig, DESIGN and CHANGELOG"
```

---

## After the tasks

One review of `git diff main...HEAD` (tier L-sized change: one `opus` reviewer, or `/code-review`), fix findings in one wave, `npm test` again. Follow-up, not in this plan: an e2e phase P5 that charts sprint 0 and sprint 1 of `tests/e2e/prd/cart.md` in a throwaway repo.
