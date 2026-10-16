# Behavioural harness step 4b: the slim lifecycle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this repo runs plans natively, see CLAUDE.md "One review per change") to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace rig's lifecycle with the spec's slim one. A change is a folder, its status is which files it has, a person's `approval.json` gates it, `verify.json` proves it, and the PR step needs both. Tiers, slices, ratchet, spend, routing, ad-hoc changes, the auto-continuation, 8 lifecycle skills and 5 agents are deleted.

**Architecture:** A new `scripts/lifecycle.ts` (about 120 lines) owns the change folder: the active change, the type, `approval.json`, `verify.json`, status and the next step. `sdlc.ts`, `hooks.ts`, `check.ts`, `contracts.ts` and `githooks.ts` switch to it in one task, because they share the change model. `verify.ts` and `pr.ts` are rewritten small. Then the modules nothing imports any more are deleted, and the five remaining workflow skills are rewritten around the new commands. Step 4c then removes the old-config adapter and lowers the cap to 3 000.

**Tech Stack:** Node 22 native TypeScript, `node --test`, git, `gh` (optional). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-16-behavioural-harness-design.md`, section 8 (slim lifecycle), 3.5 (one evaluator agent), 3.2 (removed sensors `tier`, `adhoc`, `contract-impact`), 6 (contracts frozen at plan approval), 7 (hooks). The person split step 4 into 4a (merged), 4b (this plan) and 4c on 2026-10-16.

## Global Constraints

- Every non-spec script is at most 500 lines. The total cap in `scripts/size.spec.ts` only goes down.
- `scripts/tsconfig.json` has `noUnusedLocals`: delete what a removal orphans. `npm run typecheck` must pass.
- `npm test` must be green at the end of every task.
- Approvals and waivers stay human-only (`SDLC_HUMAN=1`). Only a person writes `approval.json`.
- CI judges with the base branch's checker and registry (`check --at ci --config-from <base>`).
- Review findings advise and never block (spec 8).
- A spec test is deleted only when everything it asserts is removed behaviour. When it also covers kept behaviour, edit it.
- Kept for 4c, do not touch beyond the call sites named here: `model.ts` `SensorConfig`, `configparse.ts`, `scopes.ts`, `registryConfig`, the legacy `behavioral` key and the `behavioral` sensor id.

## Decisions this plan takes (flag in review if wrong)

1. **One gate, `approval.json`.** `approve <slug>` writes `.rig/changes/<slug>/approval.json` = `{ by, at, hashes: { "spec.md", "plan.md" }, contracts: { <file>: <hash> } }`. It goes stale when spec.md or plan.md changes, and its `contracts` is the step-3 per-file freeze. A second word (`approve demo design`) is ignored so existing typed commands still work. `approvals.jsonl` is no longer written or read.
2. **The plan gate is enforced where it can't be skipped.** `pr` refuses, and `verify`/CI report a non-waivable `plan-gate` block, when `gates.plan` is on and the approval is missing or stale. With `"gates": { "plan": false }` the gate is off.
3. **No ad-hoc changes.** Work with no change gets the sensors at every cadence and nothing else. The `adhoc` and `tier` sensors and `createAdhoc` go. CI with no change folder in the diff runs sensors only.
4. **The active change lives in `.rig/state/active`** (one slug, git-ignored) and replaces `STATE.md`. `pr` clears it.
5. **Types shrink to `feature | bugfix | refactor | chore`.** They decide red-proof only: feature and bugfix new tests must fail on the base, a refactor's changed tests must pass on it, a chore needs neither. Older types map: greenfield→feature, incident→bugfix, migration and spike→chore. Until 4c, `new` accepts and ignores `--tier`, so fixtures don't churn.
6. **Evidence moves to `evidence/runs.jsonl`.** `run` and red-proof record there.
7. **The merge-gate review is the evaluator, once, advisory.** The `pr` skill launches `rig:evaluator` on the branch diff after the PR opens and writes `review.md`. Nothing blocks on it.
8. **Waivers at CI no longer scope to plan `## Files`.** A waiver applies to its change's findings in any file. CI still ignores waivers of a change that already existed on the base, and any waiver row added by the PR still needs independent GitHub approval.
9. **Deleted commands:** `next`, `scope-drift`, `pr-checks`, `skill`, `verify-report`, `log-usage`, `evals`, `inbox`, `spend`, `quality`, `shards`, `preflight`, `ratchet`, `impact-status`, `check --at plan`. Deleted skills: `design`, `diagnose`, `incident`, `intent`, `next`, `pr-review`, `sensors`, `spec`. Deleted agents: `architect`, `implementer`, `researcher`, `reviewer`, `scout`.

## Review Focus

1. A change left by an older rig (approvals.jsonl, ratchet.json, design.md, `tier:` and `type: greenfield` in intent.md) must not crash `status`, `approve` or `verify`; its type maps and its status reads from the files. Test in Task 2.
2. Writing `verify.json`, `pr.md` or `review.md` must not make `verify.json` stale: `treeStamp` leaves `.rig/` out, and `status` must say `pr` right after a passing verify. Test in Task 2.
3. A change with no contract files records `contracts: {}`, and re-approving after every contract file is gone lifts the old freeze. That was step 3's behaviour on approvals.jsonl. Test in Task 2.
4. A typed `/rig:approve` with no slug approves the active change exactly once. With a change that isn't ready it refuses and says why. Test in Task 2.
5. At CI, a PR that adds or edits an `approval.json` produces a human-review row and needs independent approval, exactly as an approvals.jsonl row did. Test in Task 2.

---

### Task 1: `scripts/lifecycle.ts`

**Files:**
- Create: `scripts/lifecycle.ts`, `scripts/lifecycle.spec.ts`

**Interfaces:**
- Consumes (core.ts): `SDLC`, `CHANGES`, `ROOT`, `read`, `exists`, `sha`, `now`, `git`, `defaultBase`, `frontmatter`, `behavioralFiles(slug): string[]`. From model.ts: `openQuestions(text): string[]`.
- Produces:
  - `TYPES = ['feature', 'bugfix', 'refactor', 'chore'] as const`, `type ChangeType`
  - `type Status = 'spec' | 'plan' | 'approve' | 'build' | 'pr' | 'review' | 'shipped'`
  - `type Approval = { by: string; at: string; hashes: Record<string, string>; contracts: Record<string, string> }`
  - `type Verify = { at: string; tree: string | null; base: string | null; pass: boolean; blocks: string[] }`
  - `changeDir(slug)`, `digest(text)`, `activeSlug(): string | null`, `setActive(slug | null)`
  - `toType(raw: string | undefined): ChangeType`, `changeType(slug)`, `newChange(slug, type, title)`
  - `freezeRecord(slug): Record<string, string>`, `readApproval(slug)`, `approvalState(slug): 'missing' | 'stale' | 'approved'`, `approvalRefusal(slug): string | null`, `writeApproval(slug, by): Approval`
  - `readVerify(slug)`, `writeVerify(slug, v)`, `verifyFresh(slug, tree): boolean`
  - `isShipped(slug)`, `status(slug, gates: { plan: boolean }, tree): Status`, `nextStep(slug, s): string`

- [ ] **Step 1: Write the failing tests** in `scripts/lifecycle.spec.ts`

```ts
// The slim lifecycle (behavioural harness spec 2026-10-16 §8): a change is a folder and its status is which files it has.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, write, gitIn } from './testkit.ts'

let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']) })

const LIB = path.resolve(import.meta.dirname, 'lifecycle.ts')
// Runs `code` with `L` bound to lifecycle.ts inside the test repo and returns its JSON result.
const call = (code: string): unknown => {
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `import * as L from ${JSON.stringify(LIB)}; const v = await (async () => { ${code} })(); console.log(JSON.stringify(v ?? null))`], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout.trim().split('\n').at(-1) ?? 'null')
}
const SPEC = '# Spec\n\n## Behaviours\n- B1: lists orders\n\n## Open questions\nnone\n'
const PLAN = '# Plan\n\n## Files\n- src/a.js\n\n## Open questions\nnone\n'
const GATED = '{ plan: true }'

test('newChange writes intent.md with the type and makes the change active', () => {
  assert.equal(call(`L.newChange('demo', 'bugfix', 'Fix it'); return L.activeSlug()`), 'demo')
  assert.match(fs.readFileSync(path.join(repo, '.rig/changes/demo/intent.md'), 'utf8'), /^type: bugfix$/m)
  assert.equal(call(`return L.changeType('demo')`), 'bugfix')
})

test('older types map to the four the proof rules need; anything else is a feature', () => {
  assert.deepEqual(call(`return ['greenfield', 'incident', 'migration', 'spike', 'refactor', 'nonsense', undefined].map(t => L.toType(t))`),
    ['feature', 'bugfix', 'chore', 'chore', 'refactor', 'feature', 'feature'])
})

test('status walks spec, plan, approve, build, pr, review as the files appear', () => {
  call(`L.newChange('demo', 'feature', 'Demo')`)
  const st = (): unknown => call(`return L.status('demo', ${GATED}, 'tree-1')`)
  assert.equal(st(), 'spec')
  write(repo, '.rig/changes/demo/spec.md', SPEC)
  assert.equal(st(), 'plan')
  write(repo, '.rig/changes/demo/plan.md', PLAN)
  assert.equal(st(), 'approve')
  call(`L.writeApproval('demo', 'Ana')`)
  assert.equal(st(), 'build')
  call(`L.writeVerify('demo', { at: 'x', tree: 'tree-1', base: null, pass: true, blocks: [] })`)
  assert.equal(st(), 'pr')
  write(repo, '.rig/changes/demo/pr.md', '---\nstate: local-only\n---\nfeat: demo\n')
  assert.equal(st(), 'review')
})

test('with the plan gate off, a planned change goes straight to build', () => {
  call(`L.newChange('demo', 'chore', 'Demo')`)
  write(repo, '.rig/changes/demo/spec.md', SPEC)
  write(repo, '.rig/changes/demo/plan.md', PLAN)
  assert.equal(call(`return L.status('demo', { plan: false }, null)`), 'build')
})

test('an approval goes stale when spec.md or plan.md changes, trailing whitespace aside', () => {
  call(`L.newChange('demo', 'feature', 'Demo')`)
  write(repo, '.rig/changes/demo/spec.md', SPEC)
  write(repo, '.rig/changes/demo/plan.md', PLAN)
  call(`L.writeApproval('demo', 'Ana')`)
  assert.equal(call(`return L.approvalState('demo')`), 'approved')
  write(repo, '.rig/changes/demo/plan.md', PLAN + '\n\n')
  assert.equal(call(`return L.approvalState('demo')`), 'approved')
  write(repo, '.rig/changes/demo/plan.md', PLAN.replace('src/a.js', 'src/b.js'))
  assert.equal(call(`return L.approvalState('demo')`), 'stale')
})

test('approvalRefusal names missing files and open questions', () => {
  call(`L.newChange('demo', 'feature', 'Demo')`)
  assert.match(String(call(`return L.approvalRefusal('demo')`)), /no spec\.md or plan\.md/)
  write(repo, '.rig/changes/demo/spec.md', SPEC.replace('## Open questions\nnone', '## Open questions\n- Which currency?'))
  write(repo, '.rig/changes/demo/plan.md', PLAN)
  assert.match(String(call(`return L.approvalRefusal('demo')`)), /spec\.md: Which currency\?/)
})

test('the approval freezes contract files per file, and records {} when there are none', () => {
  call(`L.newChange('demo', 'feature', 'Demo')`)
  write(repo, '.rig/changes/demo/spec.md', SPEC)
  write(repo, '.rig/changes/demo/plan.md', PLAN)
  assert.deepEqual((call(`return L.writeApproval('demo', 'Ana')`) as { contracts: object }).contracts, {})
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], contracts: { files: ['api/**'] } }))
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\n')
  assert.deepEqual(Object.keys((call(`return L.writeApproval('demo', 'Ana')`) as { contracts: object }).contracts), ['api/openapi.yaml'])
})

test('verifyFresh needs a pass on the same tree', () => {
  call(`L.newChange('demo', 'feature', 'Demo')`)
  call(`L.writeVerify('demo', { at: 'x', tree: 't1', base: null, pass: true, blocks: [] })`)
  assert.deepEqual(call(`return [L.verifyFresh('demo', 't1'), L.verifyFresh('demo', 't2'), L.verifyFresh('demo', null)]`), [true, false, false])
  call(`L.writeVerify('demo', { at: 'x', tree: 't1', base: null, pass: false, blocks: ['unit: failed'] })`)
  assert.equal(call(`return L.verifyFresh('demo', 't1')`), false)
})

test('a change is shipped once its pr.md is on the trunk', () => {
  call(`L.newChange('demo', 'feature', 'Demo')`)
  write(repo, '.rig/changes/demo/pr.md', 'x\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'ship')
  assert.equal(call(`return L.status('demo', ${GATED}, null)`), 'shipped')
})

test('activeSlug ignores a slug whose folder is gone; setActive(null) clears it', () => {
  call(`L.newChange('demo', 'feature', 'Demo')`)
  fs.rmSync(path.join(repo, '.rig/changes/demo'), { recursive: true })
  assert.equal(call(`return L.activeSlug()`), null)
  call(`L.newChange('two', 'feature', 'Two'); L.setActive(null)`)
  assert.equal(call(`return L.activeSlug()`), null)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test scripts/lifecycle.spec.ts`
Expected: FAIL. The module is missing, so every `call` exits non-zero.

- [ ] **Step 3: Write `scripts/lifecycle.ts`**

```ts
// The slim lifecycle (behavioural harness spec 2026-10-16 §8): a change is a folder under .rig/changes/<slug>/ and its
// status is which files it has. Only a person writes approval.json; verify writes verify.json for the tree it judged.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, SDLC, CHANGES, read, exists, sha, now, git, defaultBase, frontmatter, behavioralFiles } from './core.ts'
import { openQuestions } from './model.ts'

export const TYPES = ['feature', 'bugfix', 'refactor', 'chore'] as const
export type ChangeType = typeof TYPES[number]
export type Status = 'spec' | 'plan' | 'approve' | 'build' | 'pr' | 'review' | 'shipped'
export type Approval = { by: string; at: string; hashes: Record<string, string>; contracts: Record<string, string> }
export type Verify = { at: string; tree: string | null; base: string | null; pass: boolean; blocks: string[] }

const ACTIVE = path.join(SDLC, 'state', 'active')
const APPROVED = ['spec.md', 'plan.md']
// Types earlier rig versions wrote, folded into the four the proof rules need.
const LEGACY: Record<string, ChangeType> = { greenfield: 'feature', incident: 'bugfix', migration: 'chore', spike: 'chore' }

export const changeDir = (slug: string): string => path.join(CHANGES, slug)
const file = (slug: string, name: string): string => path.join(CHANGES, slug, name)
// Trailing whitespace is left out: git's readers (the staged text at commit) return trimmed output.
export const digest = (text: string): string => sha(text.replace(/\s+$/, ''))
const json = <T>(p: string): T | null => { try { return JSON.parse(read(p)) as T } catch { return null } }

export function activeSlug(): string | null {
  const s = read(ACTIVE).trim()
  return s && exists(changeDir(s)) ? s : null
}
export function setActive(slug: string | null): void {
  fs.mkdirSync(path.dirname(ACTIVE), { recursive: true })
  if (slug) fs.writeFileSync(ACTIVE, `${slug}\n`)
  else fs.rmSync(ACTIVE, { force: true })
}

export const toType = (raw: string | undefined): ChangeType => ((TYPES as readonly string[]).includes(raw ?? '') ? (raw as ChangeType) : LEGACY[raw ?? ''] ?? 'feature')
export const changeType = (slug: string): ChangeType => toType(frontmatter(read(file(slug, 'intent.md'))).data.type)

export function newChange(slug: string, type: ChangeType, title: string): void {
  fs.mkdirSync(changeDir(slug), { recursive: true })
  fs.writeFileSync(file(slug, 'intent.md'), `---\nslug: ${slug}\ntype: ${type}\n---\n# ${title}\n\n## Intent\n\n## Open questions\nnone\n`)
  setActive(slug)
}

// Contract files frozen by an approval, hashed one by one so a later edit names the file (spec §6).
export const freezeRecord = (slug: string): Record<string, string> => Object.fromEntries(behavioralFiles(slug).map(f => [f, digest(read(path.join(ROOT, f)))]))
const hashes = (slug: string): Record<string, string> => Object.fromEntries(APPROVED.filter(n => exists(file(slug, n))).map(n => [n, digest(read(file(slug, n)))]))
export const readApproval = (slug: string): Approval | null => json<Approval>(file(slug, 'approval.json'))
export function approvalState(slug: string): 'missing' | 'stale' | 'approved' {
  const a = readApproval(slug)
  if (!a?.hashes) return 'missing'
  return JSON.stringify(a.hashes) === JSON.stringify(hashes(slug)) ? 'approved' : 'stale'
}
// Why a person cannot approve yet, or null.
export function approvalRefusal(slug: string): string | null {
  const missing = APPROVED.filter(n => !exists(file(slug, n)))
  if (missing.length) return `nothing to approve yet: ${slug} has no ${missing.join(' or ')}`
  const open = APPROVED.flatMap(n => openQuestions(read(file(slug, n))).map(q => `${n}: ${q}`))
  return open.length ? `resolve the open question(s) first: answer each, or record the default under ## Decisions, and leave "## Open questions" as none:\n${open.map(q => `  - ${q}`).join('\n')}` : null
}
export function writeApproval(slug: string, by: string): Approval {
  const a: Approval = { by, at: now(), hashes: hashes(slug), contracts: freezeRecord(slug) }
  fs.writeFileSync(file(slug, 'approval.json'), JSON.stringify(a, null, 2) + '\n')
  return a
}

export const readVerify = (slug: string): Verify | null => json<Verify>(file(slug, 'verify.json'))
export const writeVerify = (slug: string, v: Verify): void => fs.writeFileSync(file(slug, 'verify.json'), JSON.stringify(v, null, 2) + '\n')
export const verifyFresh = (slug: string, tree: string | null): boolean => { const v = readVerify(slug); return Boolean(v?.pass && tree && v.tree === tree) }

// Shipped: its pr.md is on the trunk.
export function isShipped(slug: string): boolean {
  const base = defaultBase()
  return base !== null && git(['cat-file', '-e', `${base}:.rig/changes/${slug}/pr.md`]) !== null
}

export function status(slug: string, gates: { plan: boolean }, tree: string | null): Status {
  if (isShipped(slug)) return 'shipped'
  if (exists(file(slug, 'pr.md'))) return 'review'
  if (!exists(file(slug, 'spec.md'))) return 'spec'
  if (!exists(file(slug, 'plan.md'))) return 'plan'
  if (gates.plan && approvalState(slug) !== 'approved') return 'approve'
  return verifyFresh(slug, tree) ? 'pr' : 'build'
}

export const nextStep = (slug: string, s: Status): string => ({
  spec: `/rig:start ${slug}`, plan: `/rig:plan ${slug}`, approve: `a person reviews spec.md and plan.md, then runs /rig:approve ${slug}`,
  build: `/rig:build ${slug}`, pr: `/rig:pr ${slug}`, review: 'a person reviews and merges the PR', shipped: 'done',
})[s]
```

Check that `defaultBase()` returns `null` in a repo with no remote and no `main` ahead of HEAD. If it returns the HEAD commit on the trunk instead, the "shipped" test still holds, since the commit carries pr.md. If `git()` returns `''` rather than `null` for a failing `cat-file -e`, use `git(['cat-file', '-t', ...]) === 'blob'`.

- [ ] **Step 4: Run the tests**

Run: `node --test scripts/lifecycle.spec.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lifecycle.ts scripts/lifecycle.spec.ts
git commit -m "feat(lifecycle): the slim change model: status from files, approval.json, verify.json, active change"
```

---

### Task 2: Switch the CLI, hooks, checks, verify, pr and pre-push to the slim lifecycle

This is one task because these files share the change model. Work through steps 2a-2g in order and run the named specs after each. Only the final run must be fully green.

**Files:**
- Modify: `scripts/sdlc.ts`, `scripts/hooks.ts`, `scripts/check.ts`, `scripts/contracts.ts`, `scripts/githooks.ts`, `scripts/runs.ts`, `scripts/testkit.ts`, `scripts/vendor.ts` (`VENDORED` gains `lifecycle`; `humanSkill` hint becomes `<slug>`), `skills/approve/SKILL.md` (argument-hint `<slug>`)
- Rewrite: `scripts/verify.ts`, `scripts/pr.ts`, `scripts/verify.spec.ts`, `scripts/pr.spec.ts`
- Delete specs that test only removed commands: `graph.spec.ts`, `ratchet.spec.ts`, `slicecheck.spec.ts`, `checkpoint.spec.ts`, `stale.spec.ts`, `spend.spec.ts`, `routing.spec.ts`, `flow.spec.ts`, `levels.spec.ts`, `quality.spec.ts`, `shards.spec.ts`, `evals.spec.ts`, `context.spec.ts`, `inbox.spec.ts`, `initbaseline.spec.ts` (only if it tests quality counting; otherwise edit), `preflight.spec.ts`, `tier.spec.ts`, `vibe.spec.ts`, `models.spec.ts`, `review.spec.ts`, `extractedskills.spec.ts`, `concerns.spec.ts`, `policy.spec.ts`
- Edit (drop removed behaviour, keep the rest): `check.spec.ts`, `sdlc.spec.ts`, `githooks.spec.ts`, `gate.spec.ts`, `vendor.spec.ts`, `sensors.spec.ts`, `contracts.spec.ts`, `registryhooks.spec.ts`, `managed.spec.ts`, `seeded.spec.ts`, `reliability.spec.ts`, `lessons.spec.ts`, `overhead.spec.ts`, `removed.spec.ts`, `scopes.spec.ts`, `sync.spec.ts`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces:
  - CLI: `new <slug> [--type feature|bugfix|refactor|chore] [--title "..."]` (`--tier` accepted and ignored until 4c), `activate <slug>`, `status [--json]` (JSON `{ initialised, active, changes: [{ slug, type, status, next }], sensors }`), `approve [<slug>]`, `verify [<slug>]`, `pr [<slug>] --message "..."`, `run [--slug s] [--expect-fail] -- "<cmd>"`.
  - `CheckInput.gates?: { plan: boolean }` (default `{ plan: true }`).
  - `shipVerdicts(slug, config, diffs, base, budgetMs, planGate: boolean): Finding[]`.
  - testkit: `approvedChange(repo, slug, type = 'feature'): void` (new + spec.md with B1 + plan.md + approve), `verified(repo, slug)` = `sdlc(repo, ['verify', slug])`.

- [ ] **Step 1: Write the failing tests** (append to `scripts/lifecycle.spec.ts`; these drive the CLI)

```ts
// The CLI on the slim lifecycle.
const HUMAN = { env: { SDLC_HUMAN: '1' } }
const planned = (slug = 'demo') => {
  sdlc(repo, ['new', slug, '--type', 'feature'])
  write(repo, `.rig/changes/${slug}/spec.md`, SPEC)
  write(repo, `.rig/changes/${slug}/plan.md`, PLAN)
}
const statusOf = (slug = 'demo') => (JSON.parse(sdlc(repo, ['status', '--json']).stdout) as { changes: { slug: string; status: string }[] }).changes.find(c => c.slug === slug)?.status

test('cli: new, approve, verify and status walk one change; verify.json written under .rig stays fresh', () => {
  planned()
  assert.equal(statusOf(), 'approve')
  assert.notEqual(sdlc(repo, ['approve', 'demo']).code, 0, 'approve is human-only')
  assert.equal(sdlc(repo, ['approve', 'demo'], HUMAN).code, 0)
  assert.ok(fs.existsSync(path.join(repo, '.rig/changes/demo/approval.json')))
  assert.equal(statusOf(), 'build')
  write(repo, 'test/a.test.js', "// B1 lists orders\n")
  const v = sdlc(repo, ['verify', 'demo'])
  assert.equal(v.code, 0, v.stdout + v.stderr)
  assert.equal(JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo/verify.json'), 'utf8')).pass, true)
  assert.equal(statusOf(), 'pr', 'writing verify.json under .rig does not make it stale')
})

test('cli: verify blocks a planned change that is not approved, with a plan-gate finding', () => {
  planned()
  const v = sdlc(repo, ['verify', 'demo'])
  assert.equal(v.code, 1)
  assert.match(v.stdout, /\[plan-gate\]/)
})

test('cli: a typed /rig:approve with no slug approves the active change once; a change that is not ready is refused with the reason', () => {
  sdlc(repo, ['new', 'early', '--type', 'feature'])
  const early = JSON.parse(hook(repo, 'prompt-submit', { prompt: '/rig:approve' }).stdout).hookSpecificOutput.additionalContext as string
  assert.match(early, /no spec\.md or plan\.md/)
  planned()
  hook(repo, 'prompt-submit', { prompt: '/rig:approve' })
  hook(repo, 'prompt-submit', { prompt: '/rig:approve demo' })
  const a = JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo/approval.json'), 'utf8'))
  assert.ok(a.by)
  assert.match(sdlc(repo, ['approve', 'demo'], HUMAN).stdout, /already approved/)
})

test('cli: a change left by an older rig reads from its files without crashing', () => {
  write(repo, '.rig/changes/old/intent.md', '---\nslug: old\ntype: greenfield\ntier: L\n---\n# Old\n')
  write(repo, '.rig/changes/old/ratchet.json', '{"tier":"L","nodes":{}}')
  write(repo, '.rig/changes/old/design.md', '# Design\n')
  write(repo, '.rig/approvals.jsonl', '{"slug":"old","stage":"design","by":"x","at":"t","digest":"d"}\n')
  const s = JSON.parse(sdlc(repo, ['status', '--json']).stdout) as { changes: { slug: string; type: string; status: string }[] }
  assert.deepEqual(s.changes.find(c => c.slug === 'old'), { slug: 'old', type: 'feature', status: 'spec', next: '/rig:start old' })
  assert.match(sdlc(repo, ['approve', 'old'], HUMAN).stderr, /no spec\.md or plan\.md/)
})

test('cli: re-approving after every contract file is gone lifts the old freeze', () => {
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], contracts: { files: ['api/**'] } }))
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'cfg')
  planned()
  sdlc(repo, ['approve', 'demo'], HUMAN)
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo/approval.json'), 'utf8')).contracts), ['api/openapi.yaml'])
  fs.rmSync(path.join(repo, 'api/openapi.yaml'))
  write(repo, '.rig/changes/demo/plan.md', PLAN + '\n## Decisions\n- dropped the API\n')
  sdlc(repo, ['approve', 'demo'], HUMAN)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo/approval.json'), 'utf8')).contracts, {})
  gitIn(repo, 'add', '-A')
  assert.doesNotMatch(sdlc(repo, ['check', '--at', 'commit']).stdout, /\[harness-tamper\][^\n]*openapi/)
})

test('cli: CI treats an approval.json the PR adds as a human row that needs independent approval', () => {
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'base')
  gitIn(repo, 'checkout', '-qb', 'feature')
  planned()
  sdlc(repo, ['approve', 'demo'], HUMAN)
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'change')
  const r = sdlc(repo, ['check', '--at', 'ci', '--base', 'main'])
  assert.match(r.stdout, /approval demo by /)
  assert.match(r.stdout, /\[human-approval\]/)
})

test('cli: work with no change gets sensors only: Stop opens no ad-hoc change', () => {
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/a.js', 'export const a = 1\n')
  hook(repo, 'stop', { session_id: 's1' })
  assert.deepEqual(fs.existsSync(path.join(repo, '.rig/changes')) ? fs.readdirSync(path.join(repo, '.rig/changes')) : [], [])
})

test('cli: the removed lifecycle commands are gone', () => {
  const usage = /usage: sdlc\.ts <([^>]+)>/.exec(sdlc(repo, []).stderr)?.[1]?.split('|') ?? []
  for (const c of ['next', 'scope-drift', 'pr-checks', 'skill', 'verify-report', 'log-usage', 'evals', 'inbox', 'spend', 'quality', 'shards', 'preflight', 'ratchet', 'impact-status']) assert.ok(!usage.includes(c), c)
  for (const c of ['new', 'activate', 'status', 'approve', 'verify', 'pr', 'run', 'waive', 'check', 'sync']) assert.ok(usage.includes(c), c)
})
```
Add `hook` to the testkit import at the top of the file.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test scripts/lifecycle.spec.ts`
Expected: the new `cli:` tests FAIL. `approve demo` wants a stage, `verify` writes no verify.json, Stop opens an `adhoc-` change, and the old commands are listed. The Task 1 tests still pass.

- [ ] **Step 2a: `sdlc.ts` change commands**

Replace `cmdNew`, `cmdActivate`, `cmdStatus` and `cmdApprove` with the code below. Delete `flowOf`/`flowLine` uses, `awaitingMerge`, `tierDrift`, the `budget`/`full-route`/`tier`/`impact` approve branches and the stale/slice warnings.
```ts
function cmdNew(args: Args): void {
  const slug = checkSlug(args.pos[0] ?? '')
  const raw = optString(args, 'type') ?? 'feature' // --tier is accepted and ignored until step 4c
  // The four types, plus the older names toType folds in (greenfield, incident, migration, spike).
  if (![...TYPES, 'greenfield', 'incident', 'migration', 'spike'].includes(raw)) fail(`usage: new <slug> [--type ${TYPES.join('|')}] [--title "..."]`)
  if (exists(changeDir(slug))) fail(`${slug} already exists: /rig:start ${slug} continues it`)
  if (!exists(SDLC)) cmdInit({ pos: [], opt: {} })
  newChange(slug, toType(raw), optString(args, 'title') ?? slug)
  out(`created .rig/changes/${slug}/intent.md (type ${toType(raw)}); ${slug} is the active change`)
}

function cmdActivate(args: Args): void {
  const slug = checkSlug(args.pos[0] ?? '')
  if (!exists(changeDir(slug))) fail(`no such change: ${slug}`)
  setActive(slug)
  out(`active change: ${slug}`)
}

function cmdStatus(args: Args): void {
  const json = Boolean(args.opt.json)
  if (!exists(SDLC)) return out(json ? JSON.stringify({ initialised: false }) : `rig not initialised here: run ${skillRef('init')}`)
  const gates = loadConfig().registry?.gates ?? { plan: true, merge: true }
  const tree = treeStamp()
  const active = activeSlug()
  const changes = listChanges().map(slug => { const s = status(slug, gates, tree); return { slug, type: changeType(slug), status: s, next: nextStep(slug, s) } })
    .filter(c => c.status !== 'shipped' || c.slug === active)
  if (json) return out(JSON.stringify({ initialised: true, active, changes, sensors: sensorStatus() }))
  if (!changes.length) return out(`no changes yet: start one with ${skillRef('start')} "<request>"`)
  out(changes.map(c => `${c.slug === active ? '▶' : ' '} ${c.slug.padEnd(28)} ${c.type.padEnd(8)} ${c.status.padEnd(8)} next: ${c.next}`).join('\n'))
}

function cmdApprove(args: Args): void {
  if (process.env.SDLC_HUMAN !== '1') fail(`approvals are human-only: the person runs /rig:approve <slug>. If that command is not listed, restart Claude Code, or the person types: ${humanFallback('approve', '<slug>')}`, 3)
  const given = words(args)[0] // a second word (the old stage name) is ignored
  const slug = given ? checkSlug(given) : activeSlug()
  if (!slug || !exists(changeDir(slug))) fail('usage: approve <slug>')
  const refusal = approvalRefusal(slug)
  if (refusal) fail(refusal)
  if (approvalState(slug) === 'approved' && JSON.stringify(readApproval(slug)?.contracts ?? {}) === JSON.stringify(freezeRecord(slug))) return out(`${slug} is already approved. Next: /rig:build ${slug}`)
  const by = optString(args, 'by') || whoami() || 'unknown'
  const a = writeApproval(slug, by)
  const n = Object.keys(a.contracts).length
  out(`approved ${slug} by ${by}: spec.md and plan.md${n ? `, ${n} contract file(s) frozen` : ''}. Next: /rig:build ${slug}`)
}
```
Imports from `./lifecycle.ts`: `TYPES, toType, changeDir, newChange, setActive, activeSlug, status, nextStep, changeType, approvalRefusal, approvalState, readApproval, freezeRecord, writeApproval`. `listChanges` and `skillRef` still come from core.ts, and `treeStamp` from stamp.ts. Switch every other `activeSlug` import in sdlc.ts (`waive`, `sensorStatus`, `run`) to lifecycle.ts.
- Delete these COMMANDS entries and their handlers: `next`, `scope-drift`, `pr-checks`, `skill`, `verify-report`, `log-usage`, `evals`, `inbox`, `spend`, `quality`, `shards`, `preflight`, `ratchet`, `impact-status`.
- `check`: becomes `check: cmdCheck`. That drops `publishQuietly` and routes `--at push` through `cmdCheck`'s dispatch to `cmdCheckPush`; keep the existing `push` branch, minus `publishQuietly`.
- `init`: drop `--onboarding` and `startOnboarding()`.
- Remove the imports these deletions orphan.

`scripts/runs.ts`: `runsFile = (slug) => path.join(CHANGES, slug, 'evidence', 'runs.jsonl')`, and `recordRun` runs `fs.mkdirSync(path.dirname(runsFile(slug)), { recursive: true })` before appending. Update `cmdRun`'s message to `recorded in ${slug}/evidence/runs.jsonl`.

Run: `node --test scripts/lifecycle.spec.ts` (the CLI tests for new, status and approve now pass).

- [ ] **Step 2b: `contracts.ts` and the CI human rows**

`scripts/contracts.ts`: delete `freezeRecord`, `FREEZING`, the local `digest` and the approvals.jsonl reader. Then:
```ts
import { readApproval, digest } from './lifecycle.ts'
// The freeze in force: the contracts the change's approval recorded.
export const frozenFor = (slug: string): Record<string, string> => readApproval(slug)?.contracts ?? {}
```
`frozenFindings` keeps its body and uses the imported `digest`.

`scripts/check.ts` `humanRowsAdded`: `HUMAN_FILES` keeps only `['.rig/waivers.jsonl', 'waiver']`. Before `return rows`, add:
```ts
  // approval.json: every one the PR adds or edits is a person's decision CI cannot verify from the file alone.
  for (const f of (git(['diff', '--name-only', base, 'HEAD', '--', '.rig/changes']) ?? '').split('\n').filter(f => /^\.rig\/changes\/[^/]+\/approval\.json$/.test(f))) {
    let by = '?'
    try { by = String((JSON.parse(read(path.join(ROOT, f))) as { by?: unknown }).by ?? '?') } catch { /* deleted or unreadable: still a row */ }
    rows.push(`approval ${f.split('/')[2]} by ${clean(by)}`)
  }
```
(`clean` is the existing sanitiser used for rows in that function. If it is named differently, use that name.) Update the `human-approval` message wording from "approval/waiver row(s)" to "approval or waiver change(s)" only if a spec asserts the new wording; otherwise leave it.

`scripts/contracts.spec.ts`: change the `approved()` helper to write `spec.md` and `plan.md` (with `## Open questions\nnone`) instead of `design.md`, and to run `approve demo` (one word). `approvals()` reads `.rig/changes/demo/approval.json`. Change the "approving the design records a hash" test to read `approval.json`'s `contracts`. Change the legacy-behavioral test so it asserts the per-file freeze (`contracts` present) instead of digest staleness, since the digest is gone. The other contract tests keep their assertions.

Run: `node --test scripts/contracts.spec.ts scripts/lifecycle.spec.ts`.

- [ ] **Step 2c: `check.ts` verdicts**

- `CheckInput` gains `gates?: { plan: boolean } // the plan gate; absent: on`.
- Replace `shipVerdicts`:
```ts
export function shipVerdicts(slug: string, config: SensorConfig, diffs: FileDiff[], base: string | null, budgetMs: number, planGate: boolean): Finding[] {
  const dir = path.join(CHANGES, slug)
  if (!exists(dir)) return [{ sensor: 'traceability', severity: 'block', message: `unknown change ${slug}`, fix: 'pass a slug that exists under .rig/changes/' }]
  const findings: Finding[] = []
  const state = approvalState(slug)
  if (planGate && state !== 'approved') findings.push({ sensor: 'plan-gate', severity: 'block', message: `${slug}: the plan is ${state === 'missing' ? 'not approved' : 'changed since it was approved'}`, fix: `a person reviews spec.md and plan.md and runs /rig:approve ${slug}` })
  const spec = read(path.join(dir, 'spec.md'))
  const ids = behaviourIds(spec, 'Behaviours')
  for (const id of missingBehaviours(ids, ids.length ? testCorpus(config, diffs) : '')) {
    const what = behaviourText(spec, 'Behaviours', id)
    findings.push({ sensor: 'traceability', severity: 'block', message: `${id}${what ? ` (${what})` : ''} has no test that names it`, fix: `add a test whose name or comment says ${id} and proves it` })
  }
  // Red for new behaviour, green-on-base for a refactor, nothing extra for a chore (its full suite already ran).
  const type = changeType(slug)
  const mode = type === 'feature' || type === 'bugfix' ? 'red' : type === 'refactor' ? 'green' : null
  if (mode && !base) findings.push({ sensor: 'red-proof', severity: 'warn', message: 'no base branch found; proof against the base skipped', fix: 'pass --base <branch>' })
  else if (mode && base) findings.push(...proofOnBase(slug, config, diffs, base, mode, budgetMs))
  return findings
}
```
- In `runChecks`:
  - Delete `...contractFindings({ ...i, point })`, the `tierFindings` line and the `unrecorded` line.
  - The size-warn condition becomes `i.slugs.length && i.slugs.every(s => approvalState(s) === 'approved')`.
  - The shipVerdicts call becomes `shipVerdicts(slug, config, diffs, i.base, i.budgetMs, i.gates?.plan ?? true)`.
- Delete `consumerHits`, `producerContractText`, `contractFindings`, `setTierL`, `cmdCheckPlan`, `unrecorded`, `tierFindings`, `consumerFor` and `cmdImpactStatus`. In `cmdCheck`, drop the `--at plan` branch, remove `plan` from the usage line, and pass `gates: registry?.gates` into `runChecks`.
- `ciScope` becomes:
```ts
// At CI a waiver counts only for a change this PR introduces: an older change's waivers cannot excuse new work.
function ciScope(slug: string, base: string | null | undefined): ((file: string | undefined) => boolean) | null {
  if (!base || showAt(base, `.rig/changes/${slug}/intent.md`) !== null) return null
  return () => true
}
```
- Switch `activeSlug`/`loadChange` imports to lifecycle.ts (`activeSlug`, `approvalState`, `changeType`), and drop core's `planPath`, `planFiles`, `isPlanned`, `approvalOf`, `planApproved`, `readImpact`, `needsImpact`.
- `scripts/model.spec.ts`, where it excludes `human-approval` and `sync` from the waivable list: also add `emitted.delete('plan-gate') // deliberately not waivable: only a person's approval clears it`. Remove `tier`, `adhoc` and `contract-impact` from `SENSOR_NAMES` in model.ts if the spec says they are no longer emitted.
- `scripts/sensors.ts`: delete `tierFromDiff` and its tests in `sensors.spec.ts`.

Run: `node --test scripts/check.spec.ts scripts/lifecycle.spec.ts scripts/model.spec.ts`. In check.spec.ts:
- Delete the tests about `adhoc`, `tier`, `contract-impact`, `impact`, `check --at plan` and plan `## Files` waiver scoping.
- Change fixtures that call `new x --type T --tier S` only if they assert tier behaviour.
- Fixtures that approve with `design.md` write `spec.md` and `plan.md` and run `approve <slug>`.

- [ ] **Step 2d: `hooks.ts`**

- `hookSessionStart`:
  - The change line becomes:
  ```ts
  const active = activeSlug()
  const st = active ? status(active, registry?.gates ?? { plan: true, merge: true }, null) : null
  ```
  - In `context`, it is `active ? \`Active change: ${active} (${changeType(active)}, ${st}). Next: ${nextStep(active, st as Status)}\` : \`No active change. Start one with ${skillRef('start')} "<request>".\``.
  - Delete the `STATE.md` block.
  - The Rules line becomes: `'Rules: plans hold interfaces and acceptance tests, never code; only the person writes .rig/changes/<slug>/approval.json; run subagents in the foreground and never end a turn while one is running; never sleep-poll; at ~150k context run /compact.'`
- `hookStop`: delete `onboarding()`, the `shipped` line and `createAdhoc`, so `slug` is `activeSlug()`. The `stop` HOOKS entry becomes `stop: i => { const r = hookStop(i); if (!r.halt && r.warn) out(JSON.stringify({ systemMessage: r.warn })) }`. Delete `AUTO_NODES`, `stepKeyNow`, `continueChange`, and the `turnStep`/`cont` fields of `Gate` and their writes in `hookPromptSubmit`.
- `approveTyped` becomes:
```ts
function approveTyped(typedArgs: string): void {
  const slug = typedArgs.trim().split(/\s+/).filter(Boolean)[0] ?? activeSlug()
  const say = (text: string): void => out(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } }))
  if (!slug) return say('rig: the person typed /rig:approve but there is no active change. Tell them so in one line and stop.')
  const r = runSdlc(['approve', slug], true)
  say(`rig: the person typed /rig:approve and rig ${r.code === 0 ? 'recorded it' : 'refused it'}:\n${r.text}\nTell them the result in one line${r.code === 0 ? `, then continue with /rig:build ${slug}` : ' and stop'}.`)
}
```
- `hookPostEdit`: delete the `planProblems` check on plan and design files.
- Imports: `activeSlug, status, nextStep, changeType, type Status` from lifecycle.ts. Drop graph.ts, `onboarding`, `agentRef`, `STATE`, `tierFromDiff` and `planProblems`.

Run: `node --test scripts/gate.spec.ts scripts/registryhooks.spec.ts scripts/lifecycle.spec.ts`. In gate.spec.ts, delete the tests about auto-continuation ("Stop continues from ...", "Stop does not continue ...", design-gate offers), ad-hoc creation and STATE.md. Change the typed-approve test to the one-word form and its "recorded it" and "already approved" expectations.

- [ ] **Step 2e: rewrite `scripts/verify.ts`**

```ts
// `verify` (behavioural harness spec 2026-10-16 §8): every commit and ci sensor, the contracts (validate first) and the
// change's own verdicts on the branch diff. verify.json records the tree it judged, so pr can tell a stale verification.
import path from 'node:path'
import { CHANGES, exists, out, fail, now, defaultBase, checkSlug, optString, type Args } from './core.ts'
import { loadConfig, runChecks } from './check.ts'
import { branchDiff, showAt } from './diffs.ts'
import { treeStamp } from './stamp.ts'
import { formatFindings } from './model.ts'
import { activeSlug, writeVerify } from './lifecycle.ts'

export function cmdVerify(args: Args): void {
  const given = args.pos[0]
  const slug = given ? checkSlug(given) : activeSlug()
  if (!slug || !exists(path.join(CHANGES, slug))) fail('usage: verify [<slug>] (no active change)')
  const { config, rules, errors, registry } = loadConfig()
  const base = defaultBase()
  const budgetMs = Number(optString(args, 'budget-ms') ?? 1_800_000)
  const r = runChecks({ point: 'ship', diffs: branchDiff(base ?? 'HEAD'), config, rules, slugs: [slug], commands: 'full', budgetMs, before: f => showAt(base ?? 'HEAD', f) ?? '', base, ratchet: false, gates: registry?.gates })
  const blocks = [...errors.map(e => `config: ${e}`), ...r.blocks.map(f => `${f.sensor}${f.file ? ` ${f.file}` : ''}: ${(f.message.split('\n')[0] ?? '').slice(0, 200)}`)]
  writeVerify(slug, { at: now(), tree: treeStamp(), base, pass: !blocks.length, blocks })
  out([formatFindings(r.findings) || 'verify: every commit and ci sensor passed', `verify.json: ${blocks.length ? `fail (${blocks.length} block(s))` : 'pass'}`].join('\n'))
  process.exitCode = blocks.length ? 1 : 0
}
```
Wire `verify: cmdVerify` in COMMANDS, replacing the old handler. Rewrite `scripts/verify.spec.ts`:
```ts
// verify (spec 2026-10-16 §8): writes verify.json for the tree it judged; contracts validate before they run.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write, approvedChange } from './testkit.ts'

let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']) })
const verifyJson = () => JSON.parse(fs.readFileSync(path.join(repo, '.rig/changes/demo/verify.json'), 'utf8'))

test('a failing commit sensor fails verify and is recorded in verify.json', () => {
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [{ id: 'unit', cmd: 'node -e "process.exit(2)"', cadence: 'commit', blocks: true, count: 'exit', guide: 'Unit tests pass.' }] }))
  approvedChange(repo, 'demo')
  assert.equal(sdlc(repo, ['verify', 'demo']).code, 1)
  assert.equal(verifyJson().pass, false)
  assert.match(verifyJson().blocks.join('\n'), /unit/)
})

test('a ci-cadence sensor runs at verify; a nightly one does not', () => {
  const mark = path.join(repo, '..', `ran-${path.basename(repo)}.txt`)
  const cmd = (name: string) => `node -e "require('fs').appendFileSync('${mark}', '${name}\\n')"`
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [
    { id: 'audit', cmd: cmd('ci'), cadence: 'ci', blocks: false, count: 'exit', guide: 'No vulnerable deps.' },
    { id: 'mutation', cmd: cmd('nightly'), cadence: 'nightly', blocks: false, count: 'exit', guide: 'Tests catch mutants.' },
  ] }))
  approvedChange(repo, 'demo')
  sdlc(repo, ['verify', 'demo'])
  assert.deepEqual(fs.readFileSync(mark, 'utf8').trim().split('\n'), ['ci'])
})

test('contracts validate before they run at verify; a failing validate skips run', () => {
  const mark = path.join(repo, '..', `c-${path.basename(repo)}.txt`)
  const cmd = (name: string, exit: number) => `node -e "require('fs').appendFileSync('${mark}', '${name}\\n'); process.exit(${exit})"`
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], contracts: { files: ['api/**'], validate: cmd('validate', 1), run: cmd('run', 0) } }))
  approvedChange(repo, 'demo')
  assert.equal(sdlc(repo, ['verify', 'demo']).code, 1)
  assert.deepEqual(fs.readFileSync(mark, 'utf8').trim().split('\n'), ['validate'])
})

test('a behaviour with no test that names it fails traceability', () => {
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [] }))
  approvedChange(repo, 'demo')
  const r = sdlc(repo, ['verify', 'demo'])
  assert.match(r.stdout, /\[traceability\][\s\S]*B1/)
})
```

Run: `node --test scripts/verify.spec.ts scripts/lifecycle.spec.ts`.

- [ ] **Step 2f: rewrite `scripts/pr.ts` and the pre-push path**

```ts
// `pr` (behavioural harness spec 2026-10-16 §8): a change whose plan a person approved and whose verify.json is fresh for
// this tree is committed on sdlc/<slug>, pushed, and gets a PR, or stays local-only without a remote.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { ROOT, CHANGES, exists, out, fail, git, checkSlug, optString, ensureGitignore, type Args } from './core.ts'
import { loadConfig } from './check.ts'
import { treeStamp } from './stamp.ts'
import { activeSlug, setActive, approvalState, verifyFresh } from './lifecycle.ts'

const ghLast = (text: string): string => text.trim().split('\n').at(-1) ?? ''
const URL_RE = /^https?:\/\//

function openPr(slug: string, branch: string, title: string): string | null {
  const body = path.join(CHANGES, slug, 'pr.md')
  const gh = (argv: string[]): string => execFileSync(ghBin(), argv, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })
  try { return URL_RE.test(ghLast(gh(['pr', 'create', '--title', title, '--body-file', body]))) ? ghLast(gh(['pr', 'view', branch, '--json', 'url', '-q', '.url'])) : null } catch (e) {
    const x = e as { stdout?: unknown; stderr?: unknown }
    // The PR already exists (a rerun, or opened by hand): report its url.
    if (!/already exists/i.test(`${String(x.stdout ?? '')}${String(x.stderr ?? '')}`)) return null
    try { const url = ghLast(gh(['pr', 'view', branch, '--json', 'url', '-q', '.url'])); return URL_RE.test(url) ? url : null } catch { return null }
  }
}

export function cmdPr(args: Args): void {
  const given = args.pos[0]
  const slug = given ? checkSlug(given) : activeSlug()
  const message = optString(args, 'message')
  if (!slug || !message) fail('usage: pr [<slug>] --message "<type(scope): summary>"')
  if (!exists(path.join(CHANGES, slug))) fail(`no such change: ${slug}`)
  if (exists(path.join(CHANGES, slug, 'pr.md'))) return out(`${slug} already has a PR (.rig/changes/${slug}/pr.md)`)
  const gates = loadConfig().registry?.gates ?? { plan: true, merge: true }
  if (gates.plan && approvalState(slug) !== 'approved') fail(`not shipping: ${slug}'s plan is not approved (a person runs /rig:approve ${slug})`)
  if (!verifyFresh(slug, treeStamp())) fail(`not shipping: verify.json is missing, failing or from another tree; run /rig:test ${slug}`)
  if (!git(['status', '--porcelain'])) fail('not shipping: nothing to commit')
  const branch = `sdlc/${slug}`
  if (git(['rev-parse', '--abbrev-ref', 'HEAD']) !== branch) {
    if (git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]) !== null) fail(`not shipping: branch ${branch} already exists; check it out first`)
    if (git(['checkout', '-b', branch]) === null) fail(`could not create branch ${branch}`)
  }
  const remote = git(['remote', 'get-url', 'origin']) !== null
  const title = (message.split('\n')[0] ?? slug).slice(0, 200)
  fs.writeFileSync(path.join(CHANGES, slug, 'pr.md'), `---\nstate: ${remote ? 'open' : 'local-only'}\nbranch: ${branch}\n---\n${title}\n`)
  ensureGitignore()
  if (git(['add', '-A']) === null) fail('git add failed')
  // verify judged this tree with waivers applied: the git hooks would only run the same checks again.
  if (git(['commit', '-q', '--no-verify', '-m', message]) === null) fail('git commit failed')
  setActive(null)
  if (!remote) return out(`pr ${slug}: committed on ${branch}; no origin remote, local only`)
  const retry = `gh pr create --title ${JSON.stringify(title)} --body-file .rig/changes/${slug}/pr.md`
  if (git(['push', '--no-verify', '-u', 'origin', branch]) === null) fail(`committed on ${branch} but git push failed: push it, then run ${retry}`)
  const url = openPr(slug, branch, title)
  if (!url) fail(`pushed ${branch} but gh pr create printed no PR url: run ${retry}`)
  out(`pr ${slug}: ${url}`)
}
```
Import `ghBin` from wherever pr.ts imports it today. Check that `ensureGitignore` (core.ts) lists `.rig/state/`; add it to that list if it does not, keeping core.ts at 500 lines or fewer.

Rewrite `scripts/pr.spec.ts`:
```ts
// pr (spec 2026-10-16 §8): refuses without an approved plan and a fresh verify.json; commits on sdlc/<slug>.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, write, gitIn, approvedChange, verified } from './testkit.ts'

let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']); write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [] })) })
const pr = () => sdlc(repo, ['pr', 'demo', '--message', 'feat: demo'])

test('pr refuses a change whose plan is not approved', () => {
  sdlc(repo, ['new', 'demo'])
  assert.match(pr().stderr, /plan is not approved/)
})

test('pr refuses without a fresh passing verify.json, and after the tree changes', () => {
  approvedChange(repo, 'demo')
  write(repo, 'test/a.test.js', '// B1\n')
  assert.match(pr().stderr, /verify\.json is missing/)
  verified(repo, 'demo')
  write(repo, 'src/late.js', 'export const late = 1\n')
  assert.match(pr().stderr, /from another tree/)
})

test('with no remote, pr commits on sdlc/<slug>, writes pr.md as local-only and clears the active change', () => {
  approvedChange(repo, 'demo')
  write(repo, 'test/a.test.js', '// B1\n')
  verified(repo, 'demo')
  const r = pr()
  assert.equal(r.code, 0, r.stderr)
  assert.equal(gitIn(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'sdlc/demo')
  assert.match(fs.readFileSync(path.join(repo, '.rig/changes/demo/pr.md'), 'utf8'), /state: local-only/)
  assert.equal(gitIn(repo, 'status', '--porcelain').trim(), '')
  assert.match(sdlc(repo, ['status']).stdout, /demo\s+feature\s+review/)
})

test('a second pr is a no-op that names the existing pr.md', () => {
  approvedChange(repo, 'demo')
  write(repo, 'test/a.test.js', '// B1\n')
  verified(repo, 'demo')
  pr()
  assert.match(pr().stdout, /already has a PR/)
})
```
(If `gitIn` returns stdout untrimmed or as something else, adapt the two `gitIn(...)` calls to how other specs read git output.)

`scripts/githooks.ts` `cmdCheckPush`: replace everything from `const owned = ...` through the quality block inside the loop with:
```ts
    const owned = slugsIn(diffs).filter(s => exists(path.join(SDLC, 'changes', s)))
    const slug = activeSlug() ?? owned.find(s => r.remoteRef === `refs/heads/sdlc/${s}`) ?? owned[0] ?? null
    // A change verified on exactly this tree, pushed from a clean checkout of it, needs its full commands no second time.
    const covered = Boolean(slug) && r.localSha === head && !git(['status', '--porcelain', '--untracked-files=all', '--', '.', ':(exclude).rig']) && verifyFresh(slug as string, treeStamp())
    const result = runChecks({
      point: 'ship', diffs, config, rules, slugs: [], commands: covered ? 'none' : 'full', budgetMs: config.githooks.budgetMs,
      before: f => showAt(base, f) ?? '', after: f => showAt(r.localSha, f) ?? '', base, ratchet: false,
    })
    findings.push(...result.findings.map(soften))
```
Also delete the `quality ratchet skipped` note line after the loop, and fix the imports (`activeSlug`, `verifyFresh` from lifecycle.ts, `treeStamp` from stamp.ts; drop graph, quality, `verificationFresh`, `sensorsFresh`, `tierFromDiff`). In githooks.spec.ts, delete the tests about ad-hoc creation at push, the quality ratchet at push and `verificationFresh`. Keep the tests of push ranges, deletes, tags and budget.

Run: `node --test scripts/pr.spec.ts scripts/githooks.spec.ts scripts/lifecycle.spec.ts`.

- [ ] **Step 2g: testkit, deleted specs, the remaining edits**

`scripts/testkit.ts`: delete `recorded`, `ratcheted` and `buildDone`. Replace `verified`, and add `approvedChange`:
```ts
// A change with intent, a spec (B1), a plan and a person's approval: the state /rig:build starts from.
export function approvedChange(repo: string, slug: string, type = 'feature'): void {
  sdlc(repo, ['new', slug, '--type', type])
  write(repo, `.rig/changes/${slug}/spec.md`, '# Spec\n\n## Behaviours\n- B1: the change works\n\n## Open questions\nnone\n')
  write(repo, `.rig/changes/${slug}/plan.md`, '# Plan\n\n## Files\n- src/\n\n## Open questions\nnone\n')
  sdlc(repo, ['approve', slug], { env: { SDLC_HUMAN: '1' } })
}

export function verified(repo: string, slug: string): void {
  sdlc(repo, ['verify', slug])
}
```
- Delete the spec files listed under **Files** above (`git rm`).
- Run `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts`, and handle each failure by the Global Constraints rule.
- For the edit-list specs, the usual fixes are: `ratcheted(...)`/`buildDone(...)` → `approvedChange(...)`; `approve x design` with `design.md` → `approvedChange`; drop assertions on `STATE.md`, `next:`, tiers, points, flow and auto-continuation; status text now reads `slug type status next: ...`.
- Update `removed.spec.ts` 4a tests that used `new ... --tier` or `status --json` points (keep their intent: no points or story).

- [ ] **Step 3: Run everything**

Run: `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts > /tmp/4b-t2.txt 2>&1; grep -E "^ℹ (pass|fail)" /tmp/4b-t2.txt; npm run typecheck; npm run test:e2e:unit`
Expected: `fail 0`, a clean typecheck, and the e2e unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A scripts skills/approve
git commit -m "feat(lifecycle): CLI, hooks, checks, verify, pr and pre-push on the slim lifecycle; lifecycle commands and their specs removed"
```

---

### Task 3: Delete the modules nothing imports any more

**Files:**
- Delete: `scripts/{graph,ratchet,slices,slicecheck,checkpoint,stale,spend,routing,flow,levels,quality,shards,evals,context,inbox,toolchain,preflight}.ts`
- Modify:
  - `scripts/stamp.ts`: keep `treeStamp` only.
  - `scripts/core.ts`: delete the lifecycle exports listed in Step 3.
  - `scripts/configparse.ts` and `scripts/model.ts`: no routing module.
  - `scripts/initbaseline.ts`: no quality counting.
  - `scripts/check.ts`: delete `logRuleFires`.
  - `scripts/sensors.ts`: the `harness-tamper` fix text no longer mentions `sdlc.ts evals`.
  - `scripts/vendor.ts`: `VENDORED`.
  - `templates/settings.json` and `templates/managed-settings.json`: drop the `approvals.jsonl`, `usage.jsonl` and `PREFLIGHT.md` rules; add a deny rule for `Edit(./.rig/changes/*/approval.json)` and `Write(./.rig/changes/*/approval.json)` in place of the approvals.jsonl one.
  - `scripts/managed.spec.ts`: drop the preflight tests.
- Test: `scripts/removed.spec.ts`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing test** (append to `scripts/removed.spec.ts`)

```ts
test('4b: the old lifecycle modules are gone and the harness templates guard approval.json', () => {
  gone(...['graph', 'ratchet', 'slices', 'slicecheck', 'checkpoint', 'stale', 'spend', 'routing', 'flow', 'levels', 'quality', 'shards', 'evals', 'context', 'inbox', 'toolchain', 'preflight'].map(m => `scripts/${m}.ts`))
  const core = read('scripts/core.ts')
  for (const name of ['approvalDigest', 'planApproved', 'createChange', 'APPROVAL_ARTIFACTS', 'intentTemplate', 'scopeDrift', 'planProblems']) assert.doesNotMatch(core, new RegExp(`export (?:function|const|type) ${name}\\b`), name)
  const settings = read('templates/settings.json')
  assert.match(settings, /approval\.json/)
  assert.doesNotMatch(settings, /approvals\.jsonl|usage\.jsonl|PREFLIGHT/)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/removed.spec.ts`
Expected: FAIL, "scripts/graph.ts should be deleted".

- [ ] **Step 3: Delete and cut**

```bash
git rm -q scripts/graph.ts scripts/ratchet.ts scripts/slices.ts scripts/slicecheck.ts scripts/checkpoint.ts scripts/stale.ts scripts/spend.ts scripts/routing.ts scripts/flow.ts scripts/levels.ts scripts/quality.ts scripts/shards.ts scripts/evals.ts scripts/context.ts scripts/inbox.ts scripts/toolchain.ts scripts/preflight.ts
```
- `stamp.ts`: delete `verificationFresh`, `sensorsFresh` and their imports. Keep `treeStamp`. Delete or trim `stamp.spec.ts` to the treeStamp tests.
- `core.ts`: delete `Change`, `Stage`, `GatedStage`, `Next`, `ApprovalState`, `ChangeType`, `Tier`, `APPROVAL_ARTIFACTS`, `APPROVALS`, `Approval`, `approvalDigest`, `approvalFile`, `approvalOf`, `planApproved`, `planPath`, `planName`, `Impact`, `ImpactHit`, `needsImpact`, `readImpact`, `isShipped`, `STATE`, `setActive`, `clearState`, `createChange`, `intentTemplate`, `planFiles`, `isPlanned`, `scopeDrift`, `planVerification`, `planVerificationBullets`, `planProblems`, `LIMITS`, `UsageRow`, `USAGE`, `EVIDENCE_NAME_RE`, `onboarding`, `startOnboarding` and `agentRef`.
  - `behavioralFiles` loses its `legacyOnly` parameter and that branch.
  - `init` in sdlc.ts stops writing `STATE.md` and `incidents/`.
  - `ensureGitignore` keeps `.rig/state/` and drops `usage.jsonl`.
  - Remove whatever `npm run typecheck` then reports unused.
- `model.ts`: replace `import type { RoutingOverride } from './routing.ts'` with `export type RoutingOverride = Record<string, unknown> // step 4b removed routing; 4c removes the key`.
- `configparse.ts`: the `routing` branch becomes `if ('routing' in value) config.routing = {} // ignored since step 4b; 4c removes the key`.
- `initbaseline.ts`: delete the quality-count part (the `countIn` import and its loop). Keep writing failing commands into `knownRed`.
- `check.ts`: delete `logRuleFires` and its call.
- `sensors.ts`: in `harnessTamper`'s warn fix text, replace "ask the person to run `sdlc.ts evals` and attach the result" with "ask the person to review it".
- `vendor.ts` `VENDORED`: remove the deleted modules and add `lifecycle`.
- `templates/settings.json` and `templates/managed-settings.json`: in the deny list, replace the `approvals.jsonl` Edit/Write rules with the same rules for `./.rig/changes/*/approval.json`. Drop the `usage.jsonl` and `PREFLIGHT.md` rules.
- `managed.spec.ts`: delete the tests that import `preflight.ts` (`managedCheck`, `controlsInForce`). Keep the `managedSettings` and `managedFiles` reader tests.

- [ ] **Step 4: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts > /tmp/4b-t3.txt 2>&1; grep -E "^ℹ (pass|fail)" /tmp/4b-t3.txt; npm run typecheck`
Expected: `fail 0`, clean.

- [ ] **Step 5: Commit**

```bash
git add -A scripts templates
git commit -m "refactor: delete the old lifecycle modules (graph, ratchet, slices, spend, routing, quality, preflight and more) and core's lifecycle exports"
```

---

### Task 4: Skills and agents for the slim lifecycle

**Files:**
- Delete: `skills/{design,diagnose,incident,intent,next,pr-review,sensors,spec}/`, `agents/{architect,implementer,researcher,reviewer,scout}.md`, `templates/design-format.md`
- Rewrite: `skills/start/SKILL.md`, `skills/plan/SKILL.md`, `skills/build/SKILL.md`, `skills/test/SKILL.md`, `skills/pr/SKILL.md`
- Modify: `skills/init/SKILL.md`, `templates/readme-rig.md` (the flow), `scripts/removed.spec.ts` (the 4a kept-skills list), `scripts/initskill.spec.ts`, `scripts/vendor.spec.ts`
- Test: `scripts/removed.spec.ts`

- [ ] **Step 1: Write the failing test** (append to `scripts/removed.spec.ts`; also change the 4a "four non-lifecycle skills" test's `kept` list to the one below)

```ts
test('4b: seven workflow skills plus the two human gates, and one agent', () => {
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'skills')).sort(), ['approve', 'build', 'init', 'plan', 'pr', 'rule', 'start', 'test', 'waive'])
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'agents')), ['evaluator.md'])
  gone('templates/design-format.md')
  for (const s of ['start', 'plan', 'build', 'test', 'pr']) assert.doesNotMatch(read(`skills/${s}/SKILL.md`), /tier|ratchet|slice|next --json|rig:(scout|implementer|reviewer|architect)/i, s)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/removed.spec.ts`
Expected: FAIL on the skills list.

- [ ] **Step 3: Delete**

```bash
git rm -rq skills/design skills/diagnose skills/incident skills/intent skills/next skills/pr-review skills/sensors skills/spec agents/architect.md agents/implementer.md agents/researcher.md agents/reviewer.md agents/scout.md templates/design-format.md
```

- [ ] **Step 4: Write the five skills**

`skills/start/SKILL.md`:
```markdown
---
name: start
description: Start or continue a change - write intent.md and spec.md with numbered behaviours. Use for any new request, an idea file under .rig/intent/, or /rig:start <slug> to continue one.
argument-hint: '"<request>" | <slug> | .rig/intent/<file>.md'
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Read, Grep, Glob, Write, Edit, Agent
---
# Start a change

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`. Run each command as its own Bash call (no `cd`, pipes, redirects, `&&` or variables).

1. **Which change.** If `$ARGUMENTS` names an existing `.rig/changes/<slug>/`, run `S activate <slug>` and continue at the first missing file below. Otherwise pick a kebab-case slug of at most five words and a type: `feature` (new behaviour), `bugfix` (wrong behaviour), `refactor` (same behaviour, new structure) or `chore` (no behaviour change). Run `S new <slug> --type <type> --title "<one line>"`. A `.rig/intent/<file>.md` argument is the request: read it and carry its text into intent.md.
2. **intent.md.** Fill `## Intent` in at most 15 lines: the problem, who has it, what done looks like. Read `.rig/product/brief.md` when it exists and stay inside its non-goals. Delegate code searches to one `Explore` agent with model `haiku` and a brief of at most 20 lines.
3. **spec.md.** Write `.rig/changes/<slug>/spec.md`:
   - `## Behaviours`: one line per observable behaviour, numbered `B1`, `B2`, … A refactor lists the behaviours it must keep; a chore may write `none`. Every behaviour gets a test that names its number.
   - `## Out of scope`.
   - `## Open questions`: `none` once each is answered, or its default recorded under `## Decisions`.
4. End with `Next: /rig:plan <slug>`.
```

`skills/plan/SKILL.md`:
```markdown
---
name: plan
description: Plan an active change - write plan.md (files, interfaces, tests per behaviour, contracts, verification) and hand it to a person for approval.
argument-hint: '[<slug>]'
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Read, Grep, Glob, Write, Edit, Agent
---
# Plan a change

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`.

1. Run `S status --json` and take `$0` or the active change. It must have `spec.md`; otherwise run `/rig:start` first.
2. Write `.rig/changes/<slug>/plan.md` in at most 60 lines:
   - `## Files`: the files you expect to touch.
   - `## Interfaces`: signatures and data shapes, never code bodies.
   - `## Tests`: one line per behaviour, giving the B-number, the test file and the level (unit, contract or end-to-end).
   - `## Contracts`: contract files this change adds or edits, or `none`.
   - `## Verification`: the commands that prove it.
   - `## Decisions`.
   - `## Open questions`: `none`.
3. A change that adds or edits a contract file (`contracts.files` in `.rig/sensors.json`) makes that edit now, before approval, because approval freezes those files.
4. Ask the person to review `spec.md` and `plan.md` and to run `/rig:approve <slug>`. Never approve yourself. End with `Next: /rig:approve <slug> (a person)`. If `.rig/sensors.json` sets `"gates": { "plan": false }`, skip the request and end with `Next: /rig:build <slug>`.
```

`skills/build/SKILL.md`:
```markdown
---
name: build
description: Build an approved change test-first - one failing test per behaviour, then the code - on its own branch.
argument-hint: '[<slug>]'
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git checkout*), Bash(git status*), Bash(git diff*), Read, Grep, Glob, Write, Edit, Agent
---
# Build a change

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`.

1. Run `S status --json`. The change (`$0` or the active one) must be at `build`. At `approve`, stop: a person approves first.
2. If HEAD is the trunk, run `git checkout -b sdlc/<slug>`.
3. For each behaviour in spec.md, in order:
   - Write the test that names its B-number.
   - Run it with `S run --expect-fail -- "<test command>"` and see it fail.
   - Write the code.
   - Run `S run -- "<test command>"` and see it pass.
   Touch only the files plan.md lists. If another file must change, add it under `## Decisions` in plan.md and tell the person, who re-approves.
4. The hooks run the sensors after each edit and at the end of each turn. Fix what they report. Never weaken a test, a sensor or a contract file.
5. For a large plan, run at most one `general-purpose` agent with model `sonnet` per independent group of files, in the foreground, each with a brief of at most 60 lines: the behaviours, the files and the test command.
6. When every behaviour has a passing test, continue with `/rig:test <slug>` in this turn.
```

`skills/test/SKILL.md`:
```markdown
---
name: test
description: Verify a built change - every commit and ci sensor, the contracts and the change's own checks - and record verify.json.
argument-hint: '[<slug>]'
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Read, Grep, Glob, Write, Edit
---
# Verify a change

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`.

1. Run `S verify <slug>`. It runs:
   - every commit and ci sensor;
   - the contract commands (validate first);
   - traceability: each B-number in spec.md is named by a test;
   - red-proof: a feature's or bugfix's new tests fail on the base, and a refactor's pass on it.
   It then writes `verify.json` for this tree.
2. On failure, fix the code, never a test, a sensor or a contract, and run verify again. If the same finding fails twice, stop and show it to the person, who may waive it with `/rig:waive`.
3. On pass, continue with `/rig:pr <slug>` in this turn.
```

`skills/pr/SKILL.md`:
```markdown
---
name: pr
description: Open the PR for a verified change, then run one advisory review by the evaluator agent.
argument-hint: '[<slug>]'
allowed-tools: Bash(node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts *), Bash(git diff*), Bash(git log*), Bash(gh pr view*), Bash(gh pr comment*), Read, Grep, Write, Agent
---
# Open the PR

`S` means `node --disable-warning=ExperimentalWarning ${CLAUDE_PLUGIN_ROOT}/scripts/sdlc.ts`.

1. Run `S pr <slug> --message "<type(scope): summary>"`. It refuses without an approved plan and a fresh, passing `verify.json`. On a refusal, run `/rig:test <slug>` again or ask the person to approve. It commits on `sdlc/<slug>`, pushes and opens the PR, or stays local-only without a remote.
2. Review once: launch `rig:evaluator` with no model override (its frontmatter pins the evaluation model). Pass the change folder and the base it was verified against (`base` in `verify.json`). Write its findings to `.rig/changes/<slug>/review.md` and, when a PR exists, post them with `gh pr comment`. Findings are advice and never block. Fix a critical one only when the person agrees, then rerun `/rig:test` and push.
3. End with the PR URL (or `local-only`) and `Next: a person reviews and merges the PR`.
```

- [ ] **Step 5: init, the README template, the specs**

- `skills/init/SKILL.md`:
  - Replace each `rig:scout` agent with "an `Explore` agent with model `haiku`".
  - Delete the Preflight step and renumber the steps after it.
  - Delete the AskUserQuestion items for per-tier gates, the value rate and consumer repos, and the `preflight --answers` shape.
  - Keep the Sensors, Baseline, Install, Verify and README steps.
- `templates/readme-rig.md`: the lifecycle bullet becomes "intent → spec → plan → a person approves → build → test (verify.json) → PR → review". Drop tiers from it and the stage list. The `/rig:next` row becomes "Continue a change | `/rig:start <slug>`". The `/rig:approve` row becomes "`/rig:approve <slug>`; only a person can".
- `scripts/initskill.spec.ts`, `scripts/vendor.spec.ts`: update the expected skills and agents (vendored: `rig-evaluator` only). Drop assertions on `rig-scout`, `rig-next` and preflight.

- [ ] **Step 6: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts > /tmp/4b-t4.txt 2>&1; grep -E "^ℹ (pass|fail)" /tmp/4b-t4.txt; npm run typecheck`
Expected: `fail 0`. The 4a guard that every named `/rig:<skill>` and `sdlc.ts <command>` exists also passes, so no deleted skill or command is still named.

- [ ] **Step 7: Commit**

```bash
git add -A skills agents templates scripts
git commit -m "feat(skills): start, plan, build, test and pr on the slim lifecycle; 8 lifecycle skills, 5 agents and design-format deleted"
```

---

### Task 5: Size cap, docs, memory

**Files:**
- Modify: `scripts/size.spec.ts` (the total cap is lowered to the measured total, rounded up to the next 100), `README.md`, `DESIGN.md`, `CLAUDE.md` (line 36: "`npm test` runs the spec files and the e2e unit tests"), the memory files.

- [ ] **Step 1:** Measure: temporarily set the total assertion to `<= 1`, read `harness is N lines` from `node --test scripts/size.spec.ts`, then set the cap and the test name to N rounded up to the next 100. Run `node --test scripts/size.spec.ts`. Expected: PASS.
- [ ] **Step 2:** Docs, using one `general-purpose` agent with model `sonnet` and a brief of at most 60 lines (deleted features, kept features, the one-line README note rule, the grep to resolve). Remove from README.md and DESIGN.md everything about tiers, slices, ratchet, spend, routing, points, the auto-continuation, ad-hoc changes, the deleted skills and agents, preflight, evals, inbox and approvals.jsonl. Describe nothing new beyond the lifecycle line "intent → spec → plan → approval.json → build → verify.json → PR".
- [ ] **Step 3:** Fix CLAUDE.md line 36 as above.
- [ ] **Step 4:** Memory: update `behavioural-harness-rebuild.md` with 4b done (commit, plan path) and 4c next: delete the old-config adapter (`model.ts` `SensorConfig`, `configparse`, `scopes`, `registryConfig`), rename `behavioral` to `contracts`, drop `--tier`, add the core-neutrality spec, cap 3 000, count-based sensors still on exit code, the deferred step-3 minors and the scripted e2e still out of `npm test`. Mark `spec2-spend-governance.md` superseded or delete it (spend is gone), and update `MEMORY.md`.
- [ ] **Step 5:** Run `npm test > /tmp/4b-full.txt 2>&1; echo exit $?; grep -E "^ℹ (tests|pass|fail)" /tmp/4b-full.txt; npm run typecheck`. Expected: exit 0, `fail 0`.
- [ ] **Step 6:** Commit:
```bash
git add scripts/size.spec.ts README.md DESIGN.md SECURITY.md CLAUDE.md
git commit -m "chore: size cap ratcheted after the lifecycle rewrite; docs describe the slim lifecycle"
```

---

### Task 6: Verify, review once

- [ ] **Step 1:** Run `npm test` and `npm run typecheck` on the final tree. Quote the summary lines.
- [ ] **Step 2:** Run one reviewer agent on `git diff main...HEAD`, model `opus`, with a brief of at most 60 lines: spec section 8, this plan's Decisions and Review Focus, and the ledger rulings. Ask it to check especially:
  - the human-only gate: nothing but `approve` with `SDLC_HUMAN=1` writes `approval.json`, and the settings templates deny Edit/Write to it;
  - the plan gate can't be bypassed through `pr`, `verify` or CI;
  - `verify.json` freshness;
  - work with no change;
  - CI human rows for `approval.json`;
  - no kept text naming a deleted command, skill or agent.
- [ ] **Step 3:** Fix Critical and Important findings in one pass, each with a test that fails first, then rerun `npm test`.
- [ ] **Step 4:** Merge only when the person asks (superpowers:finishing-a-development-branch). After the merge, write the 4c plan.
