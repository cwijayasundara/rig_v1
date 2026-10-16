# Behavioural harness step 3: contracts, freeze and sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this repo runs plans natively, see CLAUDE.md "One review per change") to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In registry repos, contract files freeze per file at plan approval, contract commands validate before they run at turn, commit, ship and ci, and `rig sync` keeps each sensor's guide in a managed CLAUDE.md block that `sync --check` enforces.

**Architecture:** Two new modules. `scripts/contracts.ts` holds the freeze record, the frozen-file finding, the "does this diff touch a contract" test and the validate-before-run runner. `scripts/sync.ts` renders, writes and checks the guides block and the brief's traceability. `check.ts`, `hooks.ts`, `sdlc.ts`, `stackinit.ts` and `registry.ts` gain one-line call sites. Legacy (`behavioral`) repos keep today's behaviour: their approval digest still covers contract files and their contracts still run only at ship and ci. Step 4 deletes the legacy path.

**Tech Stack:** Node 22 native TypeScript (`node --test`, type stripping), git, no new dependencies. Specmatic 2.55.3 via `npx` only in stack-pack strings (Task 5).

**Spec:** `docs/superpowers/specs/2026-10-16-behavioural-harness-design.md`, sections 5 and 6 (and 3.1, 3.3, 7 where they touch contracts). Step table: `docs/superpowers/plans/2026-10-16-behavioural-harness-1-registry.md` row 3.

## Global Constraints

- Every script in `scripts/` (non-spec) is at most 500 lines (`scripts/size.spec.ts`). `core.ts` is at 500 now: changes there must not add lines.
- The harness is at most 11 000 lines, tests and docs excluded.
- Core must not import `brain/`, and `brain/` must not import core.
- `secrets` and `harness-tamper` cannot be disabled and always block (`ALWAYS_ON`).
- Under `final` policy only `secrets` and `harness-tamper` run at edit and turn; everything else waits for commit (spec 3.3).
- Default timeouts: 60 000 ms at edit and turn, 600 000 ms at commit and ci (spec 3.1).
- Approvals and waivers stay human-only (`SDLC_HUMAN=1`).
- Text outside the guides block in CLAUDE.md belongs to the team and is never touched (spec 5).
- Feedback shape: sensor id, what failed, the first 20 lines of output, the rerun command (spec 7).
- Never hand-edit generated files in a target repo; fix rig and regenerate (CLAUDE.md).

## Decisions this plan takes (flag in review if wrong)

1. **Per-file freeze replaces digest staleness for registry repos.** Spec 6 says a diff to a frozen file is a `harness-tamper` block unless a person waives it. If the plan approval also went stale on that diff, the waiver would be pointless (the change would still wait for re-approval). So for registry repos the approval row records `contracts: { <file>: <sha> }` and `approvalDigest` stops hashing contract files. Re-approving records fresh hashes. Legacy repos keep the digest behaviour.
2. **Contract waivers count in CI.** Today CI ignores every `harness-tamper` waiver. It will ignore only those on protected harness files (`PROTECTED` in `sensors.ts`). A contract file is not a harness file, and a waiver row added by the PR still needs the independent GitHub approval that `independentApproval()` already demands.
3. **"Source covered by a contract"** becomes an optional registry field `contracts.covers` (globs). A turn runs the contract commands when its diff touches `contracts.files` or `contracts.covers`. Empty `covers` means only contract-file edits trigger a turn run.
4. **Sensor ids stay as they are:** contract-run findings keep the id `behavioral` (existing specs assert it), frozen-file findings use `harness-tamper`, sync findings use `sync`.
5. **The test-tamper "lower assertion count in a frozen contract" rule (spec 3.2)** is subsumed: after approval any diff to a frozen file blocks. Before approval nothing is frozen. No separate rule is added.

## Review Focus

1. A turn that edits only a file under `.rig/contracts/**` (not a source path) must still run the contract commands. Today `hookStop` drops non-source files before anything runs. Test in Task 2.
2. A brief freshly copied from `templates/brief.md` must pass `sync --check`: no example B-number may sit under `## Behaviours`. Test in Task 4.
3. Re-approving after a contract edit must write a new row with fresh hashes, not answer "already approved" because the digest did not change. Test in Task 1.
4. Deleting a frozen contract file is a change to it and blocks. Test in Task 1.
5. `rig sync` on a CLAUDE.md with team text keeps that text byte for byte, and a second run is a no-op. Test in Task 3.

---

### Task 1: Freeze contract files per file at plan approval

**Files:**
- Create: `scripts/contracts.ts`
- Create: `scripts/contracts.spec.ts`
- Modify: `scripts/core.ts:35` (Approval type), `scripts/core.ts:190-193` (`behavioralFiles` gains `legacyOnly`), `scripts/core.ts:200` (`approvalDigest` passes `true`)
- Modify: `scripts/sdlc.ts:248-251` (`cmdApprove` records the freeze; duplicate check compares it)
- Modify: `scripts/check.ts:136` (CI waiver exception), `scripts/check.ts:320` (`runChecks` list), `scripts/check.ts:358` (`editFindings`)

**Interfaces:**
- Consumes: `behavioralFiles(slug)` (core.ts), `APPROVALS`, `readJsonl`, `read`, `sha`, `ROOT`, `SDLC` (core.ts), `isRegistryShape` (registry.ts), `isProtected` (sensors.ts).
- Produces:
  - `Approval` gains `contracts?: Record<string, string>`.
  - `freezeRecord(slug: string, stage: string): Record<string, string> | undefined`
  - `frozenFor(slug: string): Record<string, string>`
  - `frozenFindings(slugs: string[], after: (file: string) => string): Finding[]`

- [ ] **Step 1: Write the failing tests** in `scripts/contracts.spec.ts`

```ts
// Contracts (behavioural harness spec 2026-10-16 §6): per-file freeze at plan approval, validate before run, turn runs on contract diffs.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { makeRepo, sdlc, hook, write, gitIn } from './testkit.ts'

let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']) })

const HUMAN = { env: { SDLC_HUMAN: '1' } }
const registry = (v: object) => { write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [], ...v })); gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'cfg') }
const approvals = () => fs.readFileSync(path.join(repo, '.rig/approvals.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l))
// A feature change whose design the person approves, with api/openapi.yaml as its frozen contract.
const approved = () => {
  registry({ contracts: { files: ['api/**'] } })
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\n')
  sdlc(repo, ['new', 'demo', '--type', 'feature', '--tier', 'M'])
  write(repo, '.rig/changes/demo/design.md', '# Design\n\n## Open questions\nnone\n')
  const r = sdlc(repo, ['approve', 'demo', 'design'], HUMAN)
  assert.equal(r.code, 0, r.stderr)
}
const commitCheck = () => { gitIn(repo, 'add', '.'); return sdlc(repo, ['check', '--at', 'commit']) }
// The design approval's state, read through core.ts (status text also depends on the tier's other gates).
const designState = () => {
  const core = path.resolve(import.meta.dirname, 'core.ts')
  const r = spawnSync('node', ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', `import { approvalOf } from ${JSON.stringify(core)}; console.log(approvalOf('demo', 'design'))`], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } })
  return r.stdout.trim()
}

test('approving the design records a hash per contract file', () => {
  approved()
  const row = approvals().at(-1)
  assert.deepEqual(Object.keys(row.contracts), ['api/openapi.yaml'])
  assert.match(row.contracts['api/openapi.yaml'], /^[0-9a-f]{16}$/)
})

test('a frozen contract edited after approval blocks at commit and names the file', () => {
  approved()
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\npaths: {}\n')
  const r = commitCheck()
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[harness-tamper\][\s\S]*api\/openapi\.yaml[\s\S]*frozen/)
})

test('a frozen contract deleted after approval blocks', () => {
  approved()
  fs.rmSync(path.join(repo, 'api/openapi.yaml'))
  assert.match(commitCheck().stdout, /\[harness-tamper\][\s\S]*api\/openapi\.yaml/)
})

test('a frozen contract edit blocks at the edit itself (PostToolUse, exit 2)', () => {
  approved()
  hook(repo, 'prompt-submit', {})
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\npaths: {}\n')
  const r = hook(repo, 'post-edit', { session_id: 's1', tool_input: { file_path: path.join(repo, 'api/openapi.yaml') } })
  assert.equal(r.code, 2)
  assert.match(r.stderr, /frozen/)
})

test('a person\'s waiver for the file clears the block; the approval stays current', () => {
  approved()
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\npaths: {}\n')
  assert.equal(sdlc(repo, ['waive', 'harness-tamper', 'api/openapi.yaml', 'agreed with consumers'], HUMAN).code, 0)
  const r = commitCheck()
  assert.doesNotMatch(r.stdout, /\[harness-tamper\]/)
  assert.equal(designState(), 'approved')
})

test('re-approving after a contract edit records fresh hashes and clears the block', () => {
  approved()
  const first = approvals().at(-1).contracts['api/openapi.yaml']
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\npaths: {}\n')
  const r = sdlc(repo, ['approve', 'demo', 'design'], HUMAN)
  assert.doesNotMatch(r.stdout, /already approved/)
  assert.notEqual(approvals().at(-1).contracts['api/openapi.yaml'], first)
  assert.doesNotMatch(commitCheck().stdout, /\[harness-tamper\]/)
})

test('CI honours a contract waiver that is already on the base branch', () => {
  approved()
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\npaths: {}\n')
  sdlc(repo, ['waive', 'harness-tamper', 'api/openapi.yaml', 'agreed'], HUMAN)
  fs.writeFileSync(path.join(repo, 'api/openapi.yaml'), 'openapi: 3.1.0\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'change, approval and waiver on main')
  gitIn(repo, 'checkout', '-qb', 'feature')
  write(repo, 'api/openapi.yaml', 'openapi: 3.1.0\npaths: {}\n')
  write(repo, '.rig/changes/demo/evidence/note.md', 'x\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'edit')
  const r = sdlc(repo, ['check', '--at', 'ci', '--base', 'main'])
  assert.doesNotMatch(r.stdout, /\[harness-tamper\][^\n]*api\/openapi\.yaml/)
})

test('a legacy behavioral repo keeps digest staleness and records no per-file freeze', () => {
  write(repo, '.rig/sensors.json', JSON.stringify({ behavioral: { validate: 'node -e 0' } }))
  write(repo, '.rig/contracts/api.yaml', 'openapi: 3.1.0\n')
  gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'cfg')
  sdlc(repo, ['new', 'demo', '--type', 'feature', '--tier', 'M'])
  write(repo, '.rig/changes/demo/design.md', '# Design\n\n## Open questions\nnone\n')
  sdlc(repo, ['approve', 'demo', 'design'], HUMAN)
  assert.equal(approvals().at(-1).contracts, undefined)
  write(repo, '.rig/contracts/api.yaml', 'openapi: 3.1.0\npaths: {}\n')
  assert.equal(designState(), 'stale')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test scripts/contracts.spec.ts`
Expected: FAIL. `row.contracts` is undefined; no `[harness-tamper]` line names `api/openapi.yaml`. The legacy test passes already.

- [ ] **Step 3: Write `scripts/contracts.ts` (freeze part)**

```ts
// Contracts (behavioural harness spec 2026-10-16 §6): frozen per file at plan approval, validated before they run.
// Registry repos only: a legacy `behavioral` repo keeps the approval digest over its contract files (core.ts).
import path from 'node:path'
import { ROOT, SDLC, APPROVALS, behavioralFiles, read, readJsonl, sha, type Approval } from './core.ts'
import { isRegistryShape } from './registry.ts'
import type { Finding } from './model.ts'

const FREEZING = ['spec', 'plan', 'design']

// The per-file hashes an approval of the spec or plan records, so an edit made after it names the file it touched.
export function freezeRecord(slug: string, stage: string): Record<string, string> | undefined {
  if (!FREEZING.includes(stage) || !isRegistryShape(read(path.join(SDLC, 'sensors.json')))) return undefined
  const files = behavioralFiles(slug)
  return files.length ? Object.fromEntries(files.map(f => [f, sha(read(path.join(ROOT, f)))])) : undefined
}

// The freeze in force: the latest approval row of the change that recorded one.
export const frozenFor = (slug: string): Record<string, string> => readJsonl<Approval>(APPROVALS).filter(a => a.slug === slug && a.contracts).at(-1)?.contracts ?? {}

// A frozen file whose text differs from its approved hash (deleted counts) blocks, until a person waives it or re-approves.
export function frozenFindings(slugs: string[], after: (file: string) => string): Finding[] {
  const out: Finding[] = []
  for (const slug of slugs) for (const [file, hash] of Object.entries(frozenFor(slug))) {
    if (sha(after(file)) === hash || out.some(f => f.file === file)) continue
    out.push({ sensor: 'harness-tamper', severity: 'block', file, message: `${file} is a contract frozen by the approval of ${slug} and has changed since`, fix: `revert it (git checkout -- ${file}); if the contract must change, ask the person to run /rig:waive harness-tamper ${file} <reason> or to re-approve the plan` })
  }
  return out
}
```

Note: `read()` returns `''` for a missing file, so a deleted file hashes differently and blocks.

- [ ] **Step 4: Change `scripts/core.ts` without adding lines**

Line 35:
```ts
export type Approval = { slug: string; stage: string; by: string; at: string; digest: string; contracts?: Record<string, string> }
```
Line 190 comment and line 191 signature:
```ts
// Behavioural files frozen by an approval: contract globs plus `.rig/changes/<slug>/behavioral/**`. legacyOnly: none for a registry (contracts.ts freezes per file).
export function behavioralFiles(slug: string, legacyOnly = false): string[] {
```
Line 193: inside the existing `try { ... }`, insert as its first statement after the `const raw = ...;` declaration:
```ts
if (legacyOnly && Array.isArray(raw.sensors)) return [];
```
(keep it on line 193; the line is already a single long statement list).
Line 200: replace `behavioralFiles(slug)` with `behavioralFiles(slug, true)`.

Check: `wc -l scripts/core.ts` prints 500.

- [ ] **Step 5: Record the freeze in `cmdApprove`** (`scripts/sdlc.ts`, around line 248)

Add `import { freezeRecord, frozenFor } from './contracts.ts'` to the imports. Replace the row and duplicate-check lines with:
```ts
  const frozen = freezeRecord(slug, stage)
  const row: Approval = { slug, stage, by, at: now(), digest: approvalDigest(slug, stage as GatedStage), ...(frozen ? { contracts: frozen } : {}) }
  // The prompt hook and the /rig:approve skill can both run for one typed command: the second finds the row and adds nothing.
  // A registry's digest leaves contract files out, so a re-approval after a contract edit must still record the new hashes.
  const sameFreeze = JSON.stringify(frozenFor(slug)) === JSON.stringify(frozen ?? {})
  if (sameFreeze && exists(APPROVALS) && read(APPROVALS).split('\n').some(l => l.includes(`"slug":"${slug}","stage":"${stage}"`) && l.includes(`"digest":"${row.digest}"`))) return out(`${slug} ${stage} is already approved (digest ${row.digest}). Next: ${nextCommand(loadChange(slug))}`)
```

- [ ] **Step 6: Wire the finding into `scripts/check.ts`**

Import `frozenFindings` from `./contracts.ts` and add `isProtected` to the existing `./sensors.ts` import.

In `runChecks`, after the `...harnessTamper(...)` entry:
```ts
    ...frozenFindings(i.slugs, after),
```
In `editFindings`, add `...frozenFindings(slug ? [slug] : [], f => read(path.join(ROOT, f)))` to the list passed to `builtinsApplied`.

Line 136, the CI exception narrows to protected harness files:
```ts
  const waived = (f: Finding): boolean => waivers.some(w => w.sensor === f.sensor && (w.file === '*' || w.file === f.file) && !(ci && ((f.sensor === 'harness-tamper' && (!f.file || isProtected(f.file))) || f.sensor === 'behavioral')) && (scopes.get(w.slug) as (file: string | undefined) => boolean)(f.file))
```
Update the comment on line 132 to say "harness-tamper on harness files".

- [ ] **Step 7: Run the tests**

Run: `node --test scripts/contracts.spec.ts scripts/registryhooks.spec.ts scripts/gate.spec.ts scripts/check.spec.ts`
Expected: PASS. If a gate or check spec asserted that a registry repo's approval goes stale on a contract edit, change it to assert the `harness-tamper` block instead (decision 1).

- [ ] **Step 8: Commit**

```bash
git add scripts/contracts.ts scripts/contracts.spec.ts scripts/core.ts scripts/sdlc.ts scripts/check.ts
git commit -m "feat(contracts): freeze contract files per file at plan approval; a diff to one blocks until waived or re-approved"
```

---

### Task 2: Validate before run, at commit always and at turn on contract diffs

**Files:**
- Modify: `scripts/contracts.ts` (add `contractsTouched`, `runContracts`)
- Modify: `scripts/registry.ts:15` (`Contracts` gains `covers`), `:51` (default), `:128-135` (parse), `:340-341` (weakening)
- Modify: `scripts/stackpacks.ts:31` (default `covers`)
- Modify: `scripts/check.ts:19-33` (`CheckInput.contracts`), `:334-343` (replace the behavioral block), `cmdCheck` (pass `contracts` at commit)
- Modify: `scripts/hooks.ts:268` (diff filter keeps contract files), `:281` (pass `contracts` at turn)
- Test: `scripts/contracts.spec.ts`, `scripts/registry.spec.ts`

**Interfaces:**
- Consumes: `runCommand(cmd, { timeoutMs }): RunRow` (runs.ts; `RunRow.tail`, `.exit`, `.timedOut`), `matchesAny` (model.ts), `Registry`, `Contracts` (registry.ts).
- Produces:
  - `Contracts = { files: string[]; covers: string[]; validate: string; run: string }`
  - `contractsTouched(c: Contracts, files: string[]): boolean`
  - `runContracts(c: { validate?: string; run?: string }, timeoutMs: number): Finding[]`
  - `CheckInput.contracts?: boolean` (run the contract commands; when absent: at ship and ci only)

- [ ] **Step 1: Write the failing tests** (append to `scripts/contracts.spec.ts`)

```ts
import os from 'node:os'

// Each command appends its name to a marker outside the repo, so the turn diff never sees it.
const marker = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rig-c-')), 'ran.txt')
const mark = (file: string, name: string, exit = 0) => `node -e "require('fs').appendFileSync(${JSON.stringify(file).replace(/"/g, "'")}, '${name}\\n'); process.exit(${exit})"`
const ran = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n') : [])

test('at commit, validate runs first and a failing validate skips run', () => {
  const m = marker()
  registry({ contracts: { files: ['api/**'], validate: mark(m, 'validate', 1), run: mark(m, 'run') } })
  write(repo, 'src/a.js', 'export const a = 1\n')
  const r = commitCheck()
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[behavioral\][\s\S]*examples do not match the specs/)
  assert.deepEqual(ran(m), ['validate'])
})

test('at commit, a passing validate is followed by run', () => {
  const m = marker()
  registry({ contracts: { files: ['api/**'], validate: mark(m, 'validate'), run: mark(m, 'run', 4) } })
  write(repo, 'src/a.js', 'export const a = 1\n')
  assert.match(commitCheck().stdout, /the behavioural suite failed \(exited 4/)
  assert.deepEqual(ran(m), ['validate', 'run'])
})

const turnAt = (rel: string) => { hook(repo, 'prompt-submit', {}); write(repo, rel, `x ${Math.random()}\n`); return hook(repo, 'stop', { session_id: 's1' }) }

test('a turn that touches no contract runs no contract command', () => {
  const m = marker()
  registry({ contracts: { files: ['api/**'], run: mark(m, 'run') } })
  turnAt('src/a.js')
  assert.deepEqual(ran(m), [])
})

test('a turn that edits a contract file runs validate then run', () => {
  const m = marker()
  registry({ contracts: { files: ['api/**'], validate: mark(m, 'validate'), run: mark(m, 'run') } })
  turnAt('api/openapi.yaml')
  assert.deepEqual(ran(m), ['validate', 'run'])
})

test('a turn that edits only a .rig/contracts file still runs the contract commands', () => {
  const m = marker()
  registry({ contracts: { files: ['.rig/contracts/**'], run: mark(m, 'run') } })
  turnAt('.rig/contracts/api.yaml')
  assert.deepEqual(ran(m), ['run'])
})

test('a turn that edits source under contracts.covers runs the contract commands', () => {
  const m = marker()
  registry({ contracts: { files: ['api/**'], covers: ['src/http/**'], run: mark(m, 'run') } })
  turnAt('src/http/orders.js')
  assert.deepEqual(ran(m), ['run'])
})

test('under final policy a turn never runs the contract commands', () => {
  const m = marker()
  registry({ policy: { default: 'final', haiku: 'final', sonnet: 'final', opus: 'final' }, contracts: { files: ['api/**'], run: mark(m, 'run') } })
  turnAt('api/openapi.yaml')
  assert.deepEqual(ran(m), [])
})
```

In `scripts/registry.spec.ts` add:
```ts
test('contracts.covers parses as globs, defaults to empty, and losing one weakens the harness', () => {
  assert.deepEqual(reg({ sensors: [] }).registry.contracts.covers, [])
  assert.deepEqual(reg({ sensors: [], contracts: { covers: ['src/http/**'] } }).registry.contracts.covers, ['src/http/**'])
  assert.match(reg({ sensors: [], contracts: { covers: 'src' } }).errors.join(), /contracts\.covers must be a list of globs/)
  const before = JSON.stringify({ sensors: [], contracts: { covers: ['src/http/**'] } })
  assert.deepEqual(weakensRegistry(before, JSON.stringify({ sensors: [] })), ['contracts.covers lost src/http/**'])
})
```
(`reg` and `weakensRegistry` are already imported in that spec; add `weakensRegistry` to its import if it is missing.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --test scripts/contracts.spec.ts scripts/registry.spec.ts`
Expected: FAIL. Commit runs no contract commands; `covers` is an unknown key; the turn tests record nothing.

- [ ] **Step 3: Add `covers` to the registry** (`scripts/registry.ts`)

```ts
export type Contracts = { files: string[]; covers: string[]; validate: string; run: string }
```
`defaultRegistry`: `contracts: { files: [], covers: [], validate: '', run: '' },`
In the `contracts` parse branch, before the `validate`/`run` branch:
```ts
      else if (k === 'covers') { if (isStringList(v)) r.contracts.covers = v; else errors.push('contracts.covers must be a list of globs') }
```
Update the shape message to `contracts must be { files?: [globs], covers?: [globs], validate?: string, run?: string }`.
In `weakensRegistry`, after the `contracts.files lost` line:
```ts
  for (const g of b.contracts.covers) if (!a.contracts.covers.includes(g)) out.push(`contracts.covers lost ${g}`)
```
In `fromLegacy`, the `r.contracts = {...}` line gains `covers: []`.

`scripts/stackpacks.ts:31`:
```ts
    contracts: isObject(v.contracts) ? { covers: [], ...(v.contracts as Contracts) } : { files: [], covers: [], validate: '', run: '' },
```

- [ ] **Step 4: Add the runner to `scripts/contracts.ts`**

Add imports `import { runCommand, type RunRow } from './runs.ts'`, `import { matchesAny } from './model.ts'` and `import type { Contracts } from './registry.ts'` (merge with the existing registry import), then:

```ts
// A turn runs the contract commands only when its diff reaches a contract file or the source a contract covers.
export const contractsTouched = (c: Contracts, files: string[]): boolean => files.some(f => matchesAny(f, [...c.files, ...c.covers]))

const shown = (r: RunRow): string => r.tail.split('\n').slice(0, 20).join('\n')
const how = (r: RunRow): string => `exited ${r.exit}${r.timedOut ? ', timed out' : ''}`

// Validate gates run: when the examples do not match the specs, the suite's verdict would mean nothing.
export function runContracts(c: { validate?: string; run?: string }, timeoutMs: number): Finding[] {
  if (c.validate) {
    const v = runCommand(c.validate, { timeoutMs })
    if (v.exit !== 0) return [{ sensor: 'behavioral', severity: 'block', message: `examples do not match the specs (validate ${how(v)})\n${shown(v)}`, fix: `fix the examples or the specs; a specs change needs a person to re-approve the plan. Rerun: ${c.validate}` }]
  }
  if (!c.run) return []
  const r = runCommand(c.run, { timeoutMs })
  return r.exit === 0 ? [] : [{ sensor: 'behavioral', severity: 'block', message: `the behavioural suite failed (${how(r)})\n${shown(r)}`, fix: `fix the implementation or the execution setup, never the examples or specs. Rerun: ${c.run}` }]
}
```

- [ ] **Step 5: Call it from `runChecks`** (`scripts/check.ts`)

Add to `CheckInput`:
```ts
  contracts?: boolean // run the contract commands (validate, then run); absent: at ship and ci only
```
Replace the whole block that starts `// Behavioural commands re-run at ship/CI` (the `if ((i.point === 'ship' || i.point === 'ci') && config.behavioral) { ... }`, 9 lines) with:
```ts
  // Contracts (spec §6): ship and CI always, commit for a registry, a turn only when it reaches a contract. Validate gates run.
  if ((i.contracts ?? (i.point === 'ship' || i.point === 'ci')) && config.behavioral) findings.push(...runContracts(config.behavioral, i.point === 'stop' ? i.budgetMs : Math.max(i.budgetMs, 600_000)))
```
Import `runContracts` from `./contracts.ts`. If `runCommand` is now unused in check.ts, remove it from the import.

In `cmdCheck`, destructure `registry` from `loadConfig(...)` and add to the `runChecks({...})` argument:
```ts
contracts: at === 'commit' ? registry !== null && !replaying : undefined,
```

- [ ] **Step 6: Call it from `hookStop`** (`scripts/hooks.ts`)

Line 268, keep contract files in the turn diff:
```ts
  const diffs = turnDiff(snap).filter(d => isSource(d.file, config) || isProtected(d.file) || matchesAny(d.file, config.contracts))
```
In the `runChecks({...})` call add:
```ts
    contracts: mode === 'continuous' && registry !== null && contractsTouched(registry.contracts, diffs.map(d => d.file)),
```
Import `contractsTouched` from `./contracts.ts` and `matchesAny` from `./model.ts` if not already imported.

- [ ] **Step 7: Run the tests**

Run: `node --test scripts/contracts.spec.ts scripts/registry.spec.ts scripts/check.spec.ts scripts/verify.spec.ts scripts/registryhooks.spec.ts scripts/stackpacks.spec.ts`
Expected: PASS. The existing `check.spec.ts:534` and `:547` CI behavioral tests still pass (legacy shape, CI path unchanged).

- [ ] **Step 8: Commit**

```bash
git add scripts/contracts.ts scripts/contracts.spec.ts scripts/registry.ts scripts/registry.spec.ts scripts/stackpacks.ts scripts/check.ts scripts/hooks.ts
git commit -m "feat(contracts): validate before run at commit, and at turn when the diff reaches a contract or contracts.covers"
```

---

### Task 3: `rig sync` and `sync --check`

**Files:**
- Create: `scripts/sync.ts`
- Create: `scripts/sync.spec.ts`
- Modify: `scripts/sdlc.ts` (`COMMANDS` gains `sync`)
- Modify: `scripts/check.ts` (`cmdCheck` adds sync findings at commit and ci)
- Modify: `scripts/hooks.ts` (`hookSessionStart` warns)

**Interfaces:**
- Consumes: `parseRegistry`, `isRegistryShape`, `Registry` (registry.ts); `behaviourIds(text, heading)`, `missingBehaviours(ids, corpus)` (sensors.ts); `matchesAny`, `Finding`, `Severity` (model.ts); `sha`, `read`, `git`, `out`, `fail`, `sanctionWrites`, `ROOT`, `SDLC`, `Args` (core.ts).
- Produces:
  - `CLAUDE_MD = 'CLAUDE.md'`, `BRIEF = '.rig/product/brief.md'`
  - `renderLines(r: Registry): string[]`
  - `findBlock(text: string): { hash: string; lines: string[]; start: number; end: number } | null`
  - `withBlock(text: string, lines: string[]): string`
  - `syncProblems(i: { registry: Registry; errors: string[]; claude: string; brief: string; tests: string }): string[]`
  - `syncFindings(registry: Registry, errors: string[], severity: Severity): Finding[]`
  - `writeSync(registry: Registry): string`
  - `cmdSync(args: Args): void`

- [ ] **Step 1: Write the failing tests** in `scripts/sync.spec.ts`

```ts
// Guides and sensors in sync (behavioural harness spec 2026-10-16 §5): the managed CLAUDE.md block and its four checks.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc, hook, write, gitIn } from './testkit.ts'
import { renderLines, withBlock, findBlock, syncProblems } from './sync.ts'
import { parseRegistry } from './registry.ts'

const reg = (v: object) => parseRegistry(JSON.stringify({ sensors: [], ...v })).registry
const types = { id: 'types', cmd: 'tsc', cadence: 'turn', blocks: true, count: 'exit', guide: 'Code must compile before the turn ends.' }
const synced = (r = reg({ sensors: [types] }), team = '# Team notes\n') => withBlock(team, renderLines(r))
const problems = (claude: string, extra: Partial<{ brief: string; tests: string; errors: string[] }> = {}, r = reg({ sensors: [types] })) =>
  syncProblems({ registry: r, errors: [], claude, brief: '', tests: '', ...extra })

test('render: one line per enabled sensor, guide then [sensor:id]', () => {
  const lines = renderLines(reg({ sensors: [types, { id: 'size', builtin: true, enabled: false }] }))
  assert.equal(lines[0], '- Code must compile before the turn ends. [sensor:types]')
  assert.ok(!lines.some(l => l.endsWith('[sensor:size]')))
})

test('sync keeps team text byte for byte and a second sync changes nothing', () => {
  const team = '# Team notes\n\nKeep the API stable.\n'
  const once = synced(undefined, team)
  assert.ok(once.startsWith(team.trimEnd()))
  assert.equal(withBlock(once, renderLines(reg({ sensors: [types] }))), once)
  assert.deepEqual(problems(once), [])
})

test('check 1: a sensor with an empty guide is reported', () => {
  const p = parseRegistry(JSON.stringify({ sensors: [{ ...types, guide: '' }] }))
  assert.match(syncProblems({ registry: p.registry, errors: p.errors, claude: withBlock('', renderLines(p.registry)), brief: '', tests: '' }).join('\n'), /guide must be a non-empty sentence/)
})

test('check 2: a block line naming a sensor not in the registry is reported', () => {
  const r = reg({ sensors: [types, { ...types, id: 'lint', guide: 'Lint must pass.' }] })
  assert.match(problems(synced(r)).join('\n'), /sensor lint, which is not in \.rig\/sensors\.json/)
})

test('check 3: a hand edit inside the block breaks its hash', () => {
  const edited = synced().replace('Code must compile', 'Code should compile')
  assert.match(problems(edited).join('\n'), /edited by hand/)
})

test('a missing block and a stale block are both reported with "run rig sync"', () => {
  assert.match(problems('# Team notes\n').join('\n'), /no rig guides block: run rig sync/)
  const stale = withBlock('', renderLines(reg({ sensors: [{ ...types, guide: 'Old guide.' }] })))
  assert.match(problems(stale).join('\n'), /out of date[\s\S]*run rig sync/)
})

test('check 4: a brief behaviour with no test that names it is reported', () => {
  const brief = '# Brief\n\n## Behaviours\n- B1: list orders\n- B2: cancel an order\n'
  const p = problems(synced(), { brief, tests: "test('B1 lists orders', ...)" })
  assert.deepEqual(p, ['.rig/product/brief.md: B2 has no test that names it'])
})

test('findBlock reads the hash and the lines between the markers', () => {
  const b = findBlock(synced())
  assert.ok(b)
  assert.match(b.hash, /^[0-9a-f]{16}$/)
  assert.deepEqual(b.lines, ['- Code must compile before the turn ends. [sensor:types]'])
})

// Integration: the CLI, the commit gate and SessionStart.
let repo: string
beforeEach(() => { repo = makeRepo(); sdlc(repo, ['init']) })
const commit = (v: object) => { write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [types], ...v })); gitIn(repo, 'add', '.'); gitIn(repo, 'commit', '-qm', 'cfg') }

test('sdlc sync writes the block; sync --check passes after it and fails before it', () => {
  commit({})
  assert.equal(sdlc(repo, ['sync', '--check']).code, 1)
  assert.equal(sdlc(repo, ['sync']).code, 0)
  assert.match(fs.readFileSync(path.join(repo, 'CLAUDE.md'), 'utf8'), /\[sensor:types\]/)
  const r = sdlc(repo, ['sync', '--check'])
  assert.equal(r.code, 0, r.stdout)
})

test('the commit gate blocks on an out-of-sync block in a registry repo', () => {
  commit({})
  write(repo, 'src/a.js', 'export const a = 1\n')
  gitIn(repo, 'add', '.')
  const r = sdlc(repo, ['check', '--at', 'commit'])
  assert.match(r.stdout, /\[sync\][\s\S]*run rig sync/)
  assert.equal(r.code, 1)
})

test('SessionStart warns about an out-of-sync block without blocking', () => {
  commit({})
  const r = hook(repo, 'session-start', { session_id: 's1' })
  assert.equal(r.code, 0)
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /rig sync: .*no rig guides block/)
})

test('sync refuses a legacy config with a clear message', () => {
  write(repo, '.rig/sensors.json', JSON.stringify({ fast: { test: 'node -e 0' } }))
  const r = sdlc(repo, ['sync'])
  assert.notEqual(r.code, 0)
  assert.match(r.stderr + r.stdout, /registry-shaped/)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test scripts/sync.spec.ts`
Expected: FAIL with `Cannot find module './sync.ts'`.

- [ ] **Step 3: Write `scripts/sync.ts`**

```ts
// rig sync (behavioural harness spec 2026-10-16 §5): every sensor's guide rendered into one managed CLAUDE.md block, and the
// checks that keep guides, sensors and the brief's behaviours in step. Text outside the block is the team's and never touched.
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, SDLC, read, sha, git, out, fail, sanctionWrites, type Args } from './core.ts'
import { parseRegistry, isRegistryShape, type Registry } from './registry.ts'
import { behaviourIds, missingBehaviours } from './sensors.ts'
import { matchesAny, type Finding, type Severity } from './model.ts'

export const CLAUDE_MD = 'CLAUDE.md'
export const BRIEF = '.rig/product/brief.md'
const START = /^<!-- rig:guides start hash=([0-9a-f]+) -->$/m
const END = '<!-- rig:guides end -->'

export const renderLines = (r: Registry): string[] => r.sensors.filter(s => s.enabled).map(s => `- ${s.guide} [sensor:${s.id}]`)
const renderBlock = (lines: string[]): string => [`<!-- rig:guides start hash=${sha(lines.join('\n'))} -->`, ...lines, END].join('\n')

export function findBlock(text: string): { hash: string; lines: string[]; start: number; end: number } | null {
  const m = START.exec(text)
  const endAt = m ? text.indexOf(END, m.index) : -1
  if (!m || endAt < 0) return null
  const lines = text.slice(m.index + m[0].length, endAt).split('\n').filter(l => l.trim())
  return { hash: m[1] ?? '', lines, start: m.index, end: endAt + END.length }
}

// Replace the block in place, or append it after the team's text.
export function withBlock(text: string, lines: string[]): string {
  const b = findBlock(text)
  if (b) return text.slice(0, b.start) + renderBlock(lines) + text.slice(b.end)
  return `${text.trimEnd() ? `${text.trimEnd()}\n\n` : ''}${renderBlock(lines)}\n`
}

export function syncProblems(i: { registry: Registry; errors: string[]; claude: string; brief: string; tests: string }): string[] {
  const p = i.errors.filter(e => /\.guide /.test(e))
  const b = findBlock(i.claude)
  if (!b) p.push(`${CLAUDE_MD} has no rig guides block: run rig sync`)
  else {
    const ids = new Set(i.registry.sensors.map(s => s.id))
    for (const l of b.lines) {
      const id = /\[sensor:([^\]]+)\]\s*$/.exec(l)?.[1]
      if (!id) p.push(`guides block line names no sensor: "${l}"`)
      else if (!ids.has(id)) p.push(`guides block names sensor ${id}, which is not in .rig/sensors.json`)
    }
    if (sha(b.lines.join('\n')) !== b.hash) p.push('guides block was edited by hand (its hash does not match): run rig sync')
    else if (b.lines.join('\n') !== renderLines(i.registry).join('\n')) p.push('guides block is out of date with .rig/sensors.json: run rig sync')
  }
  for (const id of missingBehaviours(behaviourIds(i.brief, 'Behaviours'), i.tests)) p.push(`${BRIEF}: ${id} has no test that names it`)
  return p
}

const testsText = (r: Registry): string => (git(['ls-files', '--cached', '--others', '--exclude-standard']) ?? '').split('\n')
  .filter(f => f && matchesAny(f, r.paths.tests)).map(f => read(path.join(ROOT, f))).join('\n')

export function syncFindings(registry: Registry, errors: string[], severity: Severity): Finding[] {
  const brief = read(path.join(ROOT, BRIEF))
  return syncProblems({ registry, errors, claude: read(path.join(ROOT, CLAUDE_MD)), brief, tests: brief ? testsText(registry) : '' }).map(message => {
    const ofBrief = message.startsWith(BRIEF)
    return { sensor: 'sync', severity, file: ofBrief ? BRIEF : CLAUDE_MD, message, fix: ofBrief ? 'add a test whose name or comment says the B-number and proves it' : 'run rig sync (sdlc.ts sync); never edit the block by hand' }
  })
}

export function writeSync(registry: Registry): string {
  const file = path.join(ROOT, CLAUDE_MD)
  const before = read(file)
  const after = withBlock(before, renderLines(registry))
  if (after === before) return 'CLAUDE.md guides block is up to date'
  sanctionWrites([CLAUDE_MD])
  fs.writeFileSync(file, after)
  return `CLAUDE.md guides block written: ${renderLines(registry).length} sensor guide(s)`
}

export function cmdSync(args: Args): void {
  const raw = read(path.join(SDLC, 'sensors.json'))
  if (!isRegistryShape(raw)) fail('rig sync needs a registry-shaped .rig/sensors.json (a "sensors" list); run init --stack on a new repo')
  const { registry, errors } = parseRegistry(raw)
  if (!args.opt.check) return out(writeSync(registry))
  const found = syncFindings(registry, errors, 'block')
  if (!found.length) return out('sync --check: guides match the registry')
  out(found.map(f => `[sync] ${f.message}\n  fix: ${f.fix}`).join('\n'))
  process.exitCode = 1
}
```

Check that `read` normalises `\r\n` (core.ts:100 does), so a CRLF CLAUDE.md hashes the same as LF.

- [ ] **Step 4: Wire the CLI, the commit gate and SessionStart**

`scripts/sdlc.ts`: `import { cmdSync } from './sync.ts'` and add `sync: cmdSync,` to `COMMANDS`.

`scripts/check.ts` `cmdCheck`, after `configFindings`:
```ts
  const syncBlocks = registry && (at === 'commit' || at === 'ci') ? syncFindings(registry, [], 'block') : [] // config errors already block above
```
and add `...syncBlocks` to both `findings` and `blocks` in `all`. Import `syncFindings` from `./sync.ts`. At CI `registry` comes from `--config-from` (the base branch), as spec 5 requires.

`scripts/hooks.ts` `hookSessionStart`, in the `context` array after the policy line:
```ts
    registry ? syncFindings(registry, [], 'warn').slice(0, 5).map(f => `rig sync: ${f.message}`).join('\n') : '',
```
Import `syncFindings` from `./sync.ts`.

- [ ] **Step 5: Run the tests**

Run: `node --test scripts/sync.spec.ts scripts/registryhooks.spec.ts scripts/check.spec.ts scripts/githooks.spec.ts`
Expected: `sync.spec.ts` passes. If a registry-repo spec that runs `check --at commit` or `ci` now fails only on `[sync]`, add `sdlc(repo, ['sync'])` before the commit in that spec's setup. Do not weaken the gate.

- [ ] **Step 6: Commit**

```bash
git add scripts/sync.ts scripts/sync.spec.ts scripts/sdlc.ts scripts/check.ts scripts/hooks.ts scripts/*.spec.ts
git commit -m "feat(sync): rig sync renders sensor guides into a managed CLAUDE.md block; sync --check blocks at commit and CI, warns at SessionStart"
```

---

### Task 4: Brief template; `init --stack` writes the brief and the guides block

**Files:**
- Create: `templates/brief.md`
- Modify: `scripts/stackinit.ts` (`declareStack`, after writing the registry)
- Test: `scripts/sync.spec.ts` (append), `scripts/vendor.spec.ts` only if it lists template files by name

**Interfaces:**
- Consumes: `writeSync(registry)`, `syncProblems(...)`, `BRIEF` (sync.ts); `packRegistry(pack)` (stackpacks.ts); `PLUGIN_ROOT` (core.ts).
- Produces: `templates/brief.md`; `declareStack` writes `.rig/product/brief.md` (only when missing) and the CLAUDE.md block.

- [ ] **Step 1: Write the failing tests** (append to `scripts/sync.spec.ts`)

```ts
const TEMPLATE = fs.readFileSync(path.join(import.meta.dirname, '..', 'templates', 'brief.md'), 'utf8')

test('the brief template has the spec headings in order and passes sync --check as it stands', () => {
  const heads = [...TEMPLATE.matchAll(/^## (.+)$/gm)].map(m => m[1])
  assert.deepEqual(heads, ['Context and intent', 'Non-goals', 'Architecture', 'Constraints', 'Interfaces', 'Behaviours', 'Tests required'])
  assert.deepEqual(problems(synced(), { brief: TEMPLATE }), [])
})

test('init --stack writes the brief from the template and a guides block that passes sync --check', () => {
  write(repo, 'package.json', '{}\n')
  const r = sdlc(repo, ['init', '--stack'])
  assert.match(r.stdout, /wrote \.rig\/sensors\.json from the node pack/)
  assert.equal(fs.readFileSync(path.join(repo, '.rig/product/brief.md'), 'utf8'), TEMPLATE)
  const check = sdlc(repo, ['sync', '--check'])
  assert.equal(check.code, 0, check.stdout)
})

test('init --stack leaves an existing brief alone', () => {
  write(repo, 'package.json', '{}\n')
  write(repo, '.rig/product/brief.md', '# Ours\n')
  sdlc(repo, ['init', '--stack'])
  assert.equal(fs.readFileSync(path.join(repo, '.rig/product/brief.md'), 'utf8'), '# Ours\n')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test scripts/sync.spec.ts`
Expected: FAIL with ENOENT on `templates/brief.md`.

- [ ] **Step 3: Create `templates/brief.md`**

No B-number may appear under `## Behaviours` in the template (Review Focus 2), so the example uses `B<n>`.

```markdown
# Product brief

<!-- rig reads this file as .rig/product/brief.md. Number each behaviour under "Behaviours" (B-numbers); every one needs a test whose name or comment says its number. -->

## Context and intent

<!-- Who this is for, the problem, and what success looks like. -->

## Non-goals

<!-- Phrase each as a prohibition, for example: "Do not add operations not listed under Interfaces." -->

## Architecture

<!-- The parts, where they run, and which way dependencies point. -->

## Constraints

<!-- Language, runtime, data, security and performance limits. -->

## Interfaces

<!-- Each public surface and its contract file, for example api/openapi.yaml with examples. -->

## Behaviours

<!-- - B<n>: one observable behaviour, stated from outside the system -->

## Tests required

<!-- Per behaviour: the level (unit, contract, end-to-end) and the file that will hold it. -->
```

- [ ] **Step 4: Extend `declareStack`** (`scripts/stackinit.ts`)

Add imports `import { writeSync, BRIEF } from './sync.ts'` and `packRegistry` to the `./stackpacks.ts` import. Replace the final `sanctionWrites` and `return` of `declareStack` with:
```ts
  sanctionWrites(['.rig/sensors.json'])
  const brief = path.join(ROOT, BRIEF)
  if (!exists(brief)) { fs.mkdirSync(path.dirname(brief), { recursive: true }); fs.copyFileSync(path.join(PLUGIN_ROOT, 'templates', 'brief.md'), brief) }
  const synced = writeSync(packRegistry(pack))
  return `wrote .rig/sensors.json from the ${pack.stack} pack (${pack.sensors.length} sensors); edit the commands to fit this repo. ${BRIEF} is ready to fill in. ${synced}`
```

Check that `scripts/vendor.ts` copies `templates/` recursively (step 1 fixed this, commit ef72537) so a vendored repo has `templates/brief.md`. If `vendor.spec.ts` lists the expected template files, add `brief.md` there.

- [ ] **Step 5: Run the tests**

Run: `node --test scripts/sync.spec.ts scripts/stackpacks.spec.ts scripts/vendor.spec.ts scripts/initskill.spec.ts`
Expected: PASS. If an existing `init --stack` spec asserted the exact old return string, update it to match the new one (the old text is still its prefix).

- [ ] **Step 6: Commit**

```bash
git add templates/brief.md scripts/stackinit.ts scripts/sync.spec.ts scripts/*.spec.ts
git commit -m "feat(init): brief template; init --stack writes .rig/product/brief.md and the CLAUDE.md guides block"
```

---

### Task 5: Specmatic defaults in the stack packs (gated)

This task has two gates. Do not write Specmatic strings into any pack until both are met.

- **Gate A, Java.** `java -version` fails on this machine today ("Unable to locate a Java Runtime"). The person installs a JRE (for example `brew install openjdk@21`). Do not install it yourself.
- **Gate B, licence.** Checked on 2026-10-16: the npm wrapper `specmatic@2.55.3` is MIT. The bundled `specmatic.jar` (85 MB) has no top-level licence of its own. Its `META-INF/LICENSE` and `NOTICE` are Apache-2.0 texts from dependencies (Log4j), and it contains a class `io/specmatic/core/OSSLicensedProductProvider`. The person confirms the jar's licence from Specmatic's own repository and terms before it becomes a default.

If either gate is not met, skip Steps 2–5. Do only Step 1 (the Java check in init, which is harmless while packs stay empty), and record the open gate in the commit message and the step-4 memory.

**Files:**
- Modify: `scripts/stackinit.ts` (Java check)
- Modify: `templates/stacks/{node,angular,python,go,rust,java-maven,java-gradle,dotnet}.json` (`contracts`), only after both gates
- Create: `tests/fixtures/specmatic/api/openapi.yaml` and `tests/fixtures/specmatic/api/openapi_examples/list-orders.json` (probe fixture)
- Test: `scripts/stackpacks.spec.ts`

**Interfaces:**
- Consumes: `declareStack` (Task 4), `spawnSync` from `node:child_process`.
- Produces: `packContracts(c: Contracts, javaOk: boolean): { contracts: Contracts; note: string }` (stackinit.ts). Packs whose `contracts.validate` and `contracts.run` are the probe-confirmed Specmatic commands.

- [ ] **Step 1: Java check in `declareStack`** (do this whatever the gates say)

No environment variable or argument may feed a command into init (stackinit.ts takes commands only from the shipped pack), so the check is a pure function the spec calls directly.

Failing test, in `scripts/stackpacks.spec.ts` (add `packContracts` to its `./stackinit.ts` import, or import it):
```ts
test('Specmatic contract commands are blanked when java is missing, and init says why', () => {
  const c = { files: ['api/openapi.yaml'], covers: [], validate: 'npx -y specmatic@2.55.3 examples validate', run: 'npx -y specmatic@2.55.3 test' }
  assert.deepEqual(packContracts(c, true), { contracts: c, note: '' })
  const off = packContracts(c, false)
  assert.equal(off.contracts.validate, '')
  assert.equal(off.contracts.run, '')
  assert.deepEqual(off.contracts.files, ['api/openapi.yaml'], 'the files still freeze')
  assert.match(off.note, /java is not on PATH/)
  const own = { files: [], covers: [], validate: 'make contracts', run: '' }
  assert.deepEqual(packContracts(own, false), { contracts: own, note: '' }, 'a non-Specmatic command needs no java')
})
```
In `scripts/stackinit.ts`:
```ts
// Specmatic runs on Java (spec §4): without java on PATH its commands would fail every gate, so init leaves them empty and says why.
export function packContracts(c: Contracts, javaOk: boolean): { contracts: Contracts; note: string } {
  if (javaOk || !/\bspecmatic\b/.test(`${c.validate} ${c.run}`)) return { contracts: c, note: '' }
  return { contracts: { ...c, validate: '', run: '' }, note: ' Contract commands left empty: java is not on PATH, and Specmatic runs on Java. Install a JRE, then set contracts.validate and contracts.run.' }
}
const javaOk = (): boolean => spawnSync('java', ['-version'], { stdio: 'ignore' }).status === 0
```
In `declareStack`, write `{ ...packFile(pack), contracts: pc.contracts }` where `const pc = packContracts(pack.contracts, javaOk())`, and append `pc.note` to the return text. Imports: `spawnSync` from `node:child_process`, `type Contracts` from `./registry.ts`.

Run: `node --test scripts/stackpacks.spec.ts scripts/sync.spec.ts scripts/sdlc.spec.ts`. Expected: PASS. Commit:
```bash
git add scripts/stackinit.ts scripts/stackpacks.spec.ts
git commit -m "feat(init): leave Specmatic contract commands empty when java is missing, and say why"
```

- [ ] **Step 2: Probe fixture** (gates met)

`tests/fixtures/specmatic/api/openapi.yaml`:
```yaml
openapi: 3.0.3
info: { title: Orders, version: 1.0.0 }
paths:
  /orders:
    get:
      responses:
        '200':
          description: orders
          content:
            application/json:
              schema: { type: array, items: { type: object, required: [id], properties: { id: { type: integer } } } }
```
`tests/fixtures/specmatic/api/openapi_examples/list-orders.json`:
```json
{ "http-request": { "method": "GET", "path": "/orders" }, "http-response": { "status": 200, "body": [{ "id": 1 }] } }
```

- [ ] **Step 3: Run Specmatic and record the exact syntax that works**

From `tests/fixtures/specmatic`:
```bash
npx -y specmatic@2.55.3 --version
npx -y specmatic@2.55.3 examples validate --help
npx -y specmatic@2.55.3 examples validate --spec-file api/openapi.yaml
npx -y specmatic@2.55.3 test --help
```
Then break the example (change `"id": 1` to `"id": "x"`) and confirm `examples validate` exits non-zero. Restore it. Paste each command, its exit code and the first lines of output into the commit message. The flag names (`--spec-file`, `--testBaseURL`, positional spec) are what the probe confirms, not what this plan guesses. Use the confirmed spelling in Step 4.

- [ ] **Step 4: Write the confirmed commands into the packs**

For every pack, set `contracts`:
```json
"contracts": { "files": ["api/openapi.yaml", "api/openapi_examples/**"], "covers": [], "validate": "<confirmed validate command for api/openapi.yaml>", "run": "<confirmed test command for api/openapi.yaml against the service's base URL>" }
```
Pin the version (`specmatic@2.55.3`) in both strings. For `run`, the base URL depends on the service: use the port each stack's framework defaults to (node/angular 3000, python 8000, go 8080, rust 8080, java 8080, dotnet 5000). Add to `declareStack`'s return text, when the pack's `run` mentions specmatic: ` Point contracts.run at your service's base URL.` Leave `covers` empty.

Add to `scripts/stackpacks.spec.ts`:
```ts
test('every pack pins Specmatic 2.55.3 in validate and run, and freezes the spec and its examples', () => {
  for (const p of loadPacks(PACKS_DIR).packs) {
    assert.match(p.contracts.validate, /specmatic@2\.55\.3 examples validate/, p.stack)
    assert.match(p.contracts.run, /specmatic@2\.55\.3 test/, p.stack)
    assert.deepEqual(p.contracts.files, ['api/openapi.yaml', 'api/openapi_examples/**'], p.stack)
  }
})
```

- [ ] **Step 5: Run and commit**

Run: `node --test scripts/stackpacks.spec.ts scripts/sync.spec.ts`
Expected: PASS.
```bash
git add templates/stacks tests/fixtures/specmatic scripts/stackpacks.spec.ts
git commit -m "feat(packs): Specmatic 2.55.3 validate and test as the default contract commands (probe output below)"
```

---

### Task 6: Verify, review once, update memory

- [ ] **Step 1: Full suite and typecheck**

Run: `npm test` and `npm run typecheck`
Expected: both green. Quote the summary lines (tests, pass, fail) in the hand-off. Also check `wc -l scripts/core.ts scripts/check.ts scripts/hooks.ts scripts/sdlc.ts`: each is at most 500.

- [ ] **Step 2: One review of the branch**

One reviewer agent on `git diff main...HEAD`, model `opus` (the person's standing choice for this rebuild). Brief of at most 60 lines: the spec path (sections 5 and 6), this plan's "Decisions" and "Review Focus" sections, the five changed modules, and `npm test`. Fix findings in one wave, then rerun `npm test`.

- [ ] **Step 3: Update the memory**

Edit `~/.claude/projects/-Users-chamindawijayasundara-Documents-learning-101-rig-v1/memory/behavioural-harness-rebuild.md`: step 3 done (commit sha, this plan's path), the state of the Specmatic gates, and anything carried to step 4. Step 4 must also rename the `behavioral` sensor id to `contracts` with the legacy specs.

- [ ] **Step 4: Merge only when the person asks**

Use superpowers:finishing-a-development-branch.
