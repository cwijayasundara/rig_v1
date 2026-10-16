# Fix the permission denials the eval pilot found — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 27 permission denials of the 2026-10-16 pilot (`eval/results/2026-10-16-pilot.md`) stop happening. Each is traced to its cause in rig, or in the eval setup, and fixed there, with a spec that fails without the fix.

**Architecture:** There are four causes, each fixed where it starts:
1. Headless sessions may not invoke the Skill tool, so `/rig:build` cannot chain into `/rig:test` and `/rig:pr`. The settings template gains `Skill(rig:<name>)` allow rules for the model-invocable skills, plus the `gh pr` commands the pr skill tells the model to run.
2. Nothing tells the model that compound shell commands, heredocs and shell-based file reads are denied unattended. SessionStart's rules line says so, as the init skill already does for itself.
3. The size sensor reports "N added line(s) over 160 characters" without naming the lines, so the model searches with `grep '.{161,}'` and `awk`, which are denied. The finding names the lines.
4. Eval only: the bare arms' prompt lacks the same advice, and sessions inherit the runner's `TMPDIR`, which points outside the repo, so their temp writes are denied. The bare prompt gains the advice, and each sandbox gets its own `TMPDIR` inside the repo.

**Tech Stack:** TypeScript on Node 22, `node:test`; JSON settings template; e2e and eval `.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-16-behavioural-harness-design.md`:
- §7 hooks (SessionStart context; the feedback shape: sensor id, guide, output, rerun command);
- §3.2 built-ins (`size`);
- §3.5 model roles (the pr skill launches the evaluator once per change);
- §9 evaluation.

Evidence: the pilot sessions under `eval/results/2026-10-16-pilot.*` and the denial list in this plan's Context.

## Context: the 27 denials

| Where | Denied call | Cause | Task |
|---|---|---|---|
| haiku-rig S2 and S3 build | `Skill rig-test`, `Skill rig:test` (4) | no Skill allow rule | 1 |
| haiku-rig S2 and S3 build | `gh pr comment …` (2) | Bash rule missing; the pr skill's `allowed-tools` never applied because the pr skill was not invoked | 1 |
| haiku-rig S2 build, S3 start | `grep '.{161,}'`, `awk 'length > 160'` (3) | the size finding names no lines | 3 |
| haiku-rig, haiku-rig-final start | `find … && wc`, `ls … ; grep`, `cat > … <<EOF` (5) | compound commands and heredocs; nothing said they are denied | 2 |
| all bare arms | `a; b`, `x && y`, subshells with `curl` and `timeout`, heredocs (10) | same, and the bare prompt says nothing | 4 |
| sonnet-bare, opus-bare | `Write /tmp/…`, `Write <runner scratchpad>/…` (3) | `TMPDIR` inherited from the runner, outside the repo | 4 |

## Global Constraints

- rig is not enabled on this repo: never run `sdlc.ts check` or change records against this tree.
- Fix the harness, not its output: every fix lands in `templates/`, `scripts/` or `skills/`, plus `eval/` and `tests/e2e/` for the eval-only cause, with a spec that fails first.
- `scripts/` is at 3 037 lines, against a cap of 3 050 (`scripts/neutrality.spec.ts`). This plan adds at most 5 lines there.
- `approve` and `waive` stay human-only: no allow rule may let the model invoke them (`disable-model-invocation: true`).
- Allow rules stay narrow: name exact skills and exact `gh pr` subcommands, never a bare `Skill` or `Bash(gh *)`.
- Spending money is the person's decision: the live check at the end runs only on their go-ahead.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisions

1. **Rule syntax:** `Skill(rig:<name>)` and `Skill(rig:<name> *)`, both forms. Per the Claude Code docs (skills and permissions pages), `Skill(name)` matches exactly and `Skill(name *)` matches with arguments, and the matcher checks the skill's own `name:` (here `rig:test`). `Skill(rig *)` is not documented for a colon namespace, so it is not used.
2. **The model-invocable skills:** `start`, `plan`, `build`, `test`, `pr` and `rule`. `init` runs once, by a person, before the harness exists. `approve` and `waive` are human-only.
3. **`gh pr comment` and `gh pr view` become template allow rules** rather than a new `sdlc.ts` command. That costs no script lines, and the pr skill already tells the model to use them. Both act only on the change's own PR.
4. **The rules line is the one place** that tells every session about tools. It reuses the init skill's wording, so the two never diverge.
5. **The size finding names at most five line numbers per file** (`lines 12, 40, 41, …`): enough to act on, without flooding the output (spec §7 feedback shape).

## Review Focus

1. **A rule that lets the model approve or waive.** Expect no `Skill(rig:approve…)` or `Skill(rig:waive…)` in the template, ever. Pinned in Task 1: "the template never lets the model invoke approve or waive".
2. **A skill text that tells the model to run a skill or `gh` command the template does not allow.** This is the same class of denial coming back. Expect a spec that reads every model-invocable SKILL.md and checks each `/rig:<x>` and `gh pr <sub>` it names. Pinned in Task 1: "every skill or gh command a skill tells the model to run is allowed".
3. **A target repo onboarded before this change.** Its `.claude/settings.json` lacks the new rules. Expect `init --full` to merge them in on a re-run without dropping the team's own rules. Pinned in Task 1: "init --full adds the new allow rules to an existing settings.json and keeps the team's".
4. **A file with hundreds of long lines.** Expect the size finding to stay one line, with five numbers and "…". Pinned in Task 3: "the size finding names at most five long lines".
5. **A sandbox `TMPDIR` inside the repo showing up as untracked files** in `git status`, the turn diff, or the clean-tree checks. Expect it excluded and invisible. Pinned in Task 4: "the sandbox TMPDIR is inside the repo and never shows in git status".

---

### Task 1: Skill chaining and the pr skill's gh commands

**Files:**
- Modify: `templates/settings.json` (`permissions.allow`)
- Create: `scripts/permissions.spec.ts`
- Read, and modify only if needed: `scripts/vendor.ts`, which writes the template into a target's `.claude/settings.json` (find the merge with `grep -n "settings.json" scripts/vendor.ts`)

**Interfaces:**
- Produces: template allow rules `Skill(rig:<s>)` and `Skill(rig:<s> *)` for s in start, plan, build, test, pr and rule; `Bash(gh pr comment *)` and `Bash(gh pr view *)`.

- [ ] **Step 1: Write the failing tests** in `scripts/permissions.spec.ts`:

```ts
// The settings template must allow every skill and gh command a skill tells the model to run: the eval pilot's denials (2026-10-16).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { makeRepo, sdlc } from './testkit.ts'

const ROOT = path.resolve(import.meta.dirname, '..')
const allow = (): string[] => JSON.parse(fs.readFileSync(path.join(ROOT, 'templates/settings.json'), 'utf8')).permissions.allow
const MODEL_SKILLS = fs.readdirSync(path.join(ROOT, 'skills')).filter(s => !/^disable-model-invocation: true$/m.test(fs.readFileSync(path.join(ROOT, 'skills', s, 'SKILL.md'), 'utf8')))

test('every skill or gh command a skill tells the model to run is allowed', () => {
  const rules = allow()
  for (const s of MODEL_SKILLS) {
    const text = fs.readFileSync(path.join(ROOT, 'skills', s, 'SKILL.md'), 'utf8').replace(/^---[\s\S]*?---\n/, '')
    for (const [, name] of text.matchAll(/\/rig:([a-z]+)/g)) {
      if (name === 'approve' || name === 'waive') continue // the skill asks the person to run these
      assert.ok(rules.includes(`Skill(rig:${name})`) && rules.includes(`Skill(rig:${name} *)`), `${s} runs /rig:${name}`)
    }
    for (const [, sub] of text.matchAll(/`gh pr ([a-z]+)/g)) assert.ok(rules.includes(`Bash(gh pr ${sub} *)`), `${s} runs gh pr ${sub}`)
  }
})

test('the template never lets the model invoke approve or waive, or the Skill tool unscoped', () => {
  const rules = allow()
  assert.deepEqual(rules.filter(r => /^Skill\(rig:(approve|waive)\b/.test(r) || r === 'Skill' || /^Skill\(rig ?\*?\)$/.test(r) || r === 'Bash(gh *)'), [])
})

test('init --full adds the new allow rules to an existing settings.json and keeps the team\'s', () => {
  const repo = makeRepo()
  fs.mkdirSync(path.join(repo, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(repo, '.claude/settings.json'), JSON.stringify({ permissions: { allow: ['Bash(make test)'] } }, null, 2))
  sdlc(repo, ['init', '--full'])
  const got: string[] = JSON.parse(fs.readFileSync(path.join(repo, '.claude/settings.json'), 'utf8')).permissions.allow
  assert.ok(got.includes('Bash(make test)'), 'the team rule stays')
  assert.ok(got.includes('Skill(rig:test *)') && got.includes('Bash(gh pr comment *)'), JSON.stringify(got))
})
```

If `makeRepo` needs arguments, or `init --full` needs a registry first, follow the pattern in `scripts/vendor.spec.ts` and record that as a ruling.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test scripts/permissions.spec.ts`
Expected:
- the first test FAILS on `build runs /rig:test`;
- the second passes (it pins the guard);
- the third fails on the missing `Skill(rig:test *)`, unless `vendor.ts` does not merge allow rules at all, in which case it fails on the team rule, and Step 3 fixes the merge too.

- [ ] **Step 3: Implement.** In `templates/settings.json`, `permissions.allow` becomes:

```json
    "allow": [
      "Edit(.rig/**)",
      "Bash(node --disable-warning=ExperimentalWarning .rig/bin/sdlc.ts *)",
      "Skill(rig:start)", "Skill(rig:start *)",
      "Skill(rig:plan)", "Skill(rig:plan *)",
      "Skill(rig:build)", "Skill(rig:build *)",
      "Skill(rig:test)", "Skill(rig:test *)",
      "Skill(rig:pr)", "Skill(rig:pr *)",
      "Skill(rig:rule)", "Skill(rig:rule *)",
      "Bash(gh pr comment *)",
      "Bash(gh pr view *)"
    ],
```

Add one sentence to the template's `$comment`: `The Skill rules let one rig skill continue into the next (build → test → pr) in an unattended session; approve and waive are never listed.`

If the third test showed that `vendor.ts` overwrites a team's allow list or skips existing files, fix the merge: union the allow lists, team rules first, template rules appended without duplicates. Keep it within the scripts cap.

- [ ] **Step 4: Run them to verify they pass, then the spec suite**

Run: `node --disable-warning=ExperimentalWarning --test scripts/permissions.spec.ts`
Expected: PASS, 3/3.

Run: `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts`
Expected: every spec passes. A spec that pinned the old allow list exactly is updated, and each such update is named in the commit message.

- [ ] **Step 5: Commit**

```bash
git add templates/settings.json scripts/permissions.spec.ts scripts/vendor.ts
git commit -m "fix(settings): a rig skill may continue into the next unattended, and the pr skill's gh commands are allowed; approve and waive stay human-only"
```

---

### Task 2: SessionStart says which tools to use

**Files:**
- Modify: `scripts/hooks.ts:115` (the `Rules:` line)
- Test: `scripts/registryhooks.spec.ts`, or whichever spec already reads the SessionStart context (`grep -ln "additionalContext" scripts/*.spec.ts`)

- [ ] **Step 1: Write the failing test** in the spec that reads SessionStart context:

```ts
test('SessionStart tells the model to read and write with tools and run one command per Bash call', () => {
  const ctx = JSON.parse(hook(repo, 'session-start', { session_id: 's1' }).stdout).hookSpecificOutput.additionalContext
  assert.match(ctx, /read files with Read, Grep and Glob and change them with Edit or Write/)
  assert.match(ctx, /run each command as its own Bash call \(no `cd`, pipes, redirects, `&&`, `;` or heredocs\)/)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --disable-warning=ExperimentalWarning --test --test-name-pattern="tells the model to read and write" scripts/<that spec>.ts`
Expected: FAIL, no match.

- [ ] **Step 3: Implement.** In `scripts/hooks.ts`, the `Rules:` string gains this, after "never sleep-poll;":

` read files with Read, Grep and Glob and change them with Edit or Write; run each command as its own Bash call (no \`cd\`, pipes, redirects, \`&&\`, \`;\` or heredocs): unattended runs deny compound commands;`

Keep the rest of the line unchanged. This is a string edit, so it adds no lines.

- [ ] **Step 4: Run it to verify it passes, then the spec suite**

Run: `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts`
Expected: every spec passes.

- [ ] **Step 5: Commit**

```bash
git add scripts/hooks.ts scripts/*.spec.ts
git commit -m "fix(hooks): SessionStart says to use Read, Grep, Edit and one command per Bash call; unattended runs deny compound commands"
```

---

### Task 3: The size finding names its long lines

**Files:**
- Modify: `scripts/sensors.ts:144-150` (the long-line finding), `scripts/registry.ts:27` (the `size` guide)
- Test: `scripts/sensors.spec.ts`

- [ ] **Step 1: Write the failing tests** in `scripts/sensors.spec.ts`. Use that file's existing helper for building a `FileDiff` and calling `size`; copy the shape from the nearest existing size test (`grep -n "size(" scripts/sensors.spec.ts`).

```ts
test('the size finding names the long lines', () => {
  // a diff adding lines 3 and 7 over 160 characters
  const f = longLineFinding([3, 7])
  assert.match(f.message, /2 added line\(s\) over 160 characters \(lines 3, 7\)/)
})

test('the size finding names at most five long lines', () => {
  const f = longLineFinding(Array.from({ length: 300 }, (_, i) => i + 1))
  assert.match(f.message, /\(lines 1, 2, 3, 4, 5, …\)/)
  assert.equal(f.message.split('\n').length, 1)
})

test('the size guide says the finding names the lines, so there is nothing to search for', () => {
  const g = parseRegistry('').registry.sensors.find(s => s.id === 'size')?.guide ?? ''
  assert.match(g, /names each file and line over the limit/)
})
```

Write `longLineFinding(lines: number[])` in the spec. It builds one `FileDiff` with `added: lines.map(n => ({ n, text: 'x'.repeat(200) }))`, calls `size(...)` the way the existing size tests do, and returns the long-line finding.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test scripts/sensors.spec.ts`
Expected: the three new tests FAIL, because there are no line numbers and the guide text is the old one.

- [ ] **Step 3: Implement.** In `scripts/sensors.ts`, the long-line message becomes:

```ts
        message: `${long.length} added line(s) over ${limits.lineChars} characters (lines ${long.slice(0, 5).map(l => l.n).join(', ')}${long.length > 5 ? ', …' : ''})`,
```

In `scripts/registry.ts`, the `size` guide becomes `'Keep files, diffs and lines under the size limits; the size finding names each file and line over the limit, so fix those rather than searching for them.'`

The guide is rendered into a target's CLAUDE.md block, so check whether a spec pins the old text or the block's hash (`grep -rn "Keep files and diffs" scripts/*.spec.ts tests/`) and update what pins it.

- [ ] **Step 4: Run them to verify they pass, then the spec suite and the scripted e2e**

Run: `npm test`
Expected: exit 0. The scripted e2e still passes S0 14/14 and S1 3/3; its `sync --check` reads the guide from the registry, so a rendered-block mismatch would show there.

- [ ] **Step 5: Commit**

```bash
git add scripts/sensors.ts scripts/registry.ts scripts/sensors.spec.ts
git commit -m "fix(size): the long-line finding names the lines, and the guide says so: no search needed"
```

---

### Task 4: The eval's bare arms and the sandbox's TMPDIR

**Files:**
- Modify: `eval/setup.mjs` (`BARE_PROMPT`)
- Modify: `tests/e2e/lib/sandbox.mjs` (`env.TMPDIR`, `.git/info/exclude`)
- Test: `eval/run.test.mjs`, `tests/e2e/lib/flow.test.mjs`, or a new `tests/e2e/lib/sandbox.test.mjs`

- [ ] **Step 1: Write the failing tests**

`tests/e2e/lib/sandbox.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createSandbox } from './sandbox.mjs'

test('the sandbox TMPDIR is inside the repo and never shows in git status', () => {
  const sb = createSandbox({ name: 't', out: fs.mkdtempSync(path.join(os.tmpdir(), 'rig-sb-')) })
  assert.ok(sb.env.TMPDIR.startsWith(sb.dir + path.sep), sb.env.TMPDIR)
  fs.writeFileSync(path.join(sb.env.TMPDIR, 'scratch.txt'), 'x')
  assert.equal(sb.git('status', '--porcelain'), '')
})
```

In `eval/run.test.mjs`:

```js
import { BARE_PROMPT } from './setup.mjs'

test('final review (denials): the bare prompt gives the same tool advice rig sessions get', () => {
  assert.match(BARE_PROMPT, /read files with Read, Grep and Glob and change them with Edit or Write/)
  assert.match(BARE_PROMPT, /run each command as its own Bash call/)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/e2e/lib/sandbox.test.mjs eval/run.test.mjs`
Expected: FAIL. `TMPDIR` is the runner's, and the prompt has no advice.

- [ ] **Step 3: Implement**

In `sandbox.mjs`, after `git init`:
- create `path.join(dir, '.tmp')`;
- append `.tmp/\n` to `.git/info/exclude`;
- add `TMPDIR: path.join(dir, '.tmp')` to `env`.

The `env` object is built before `git init`, so move the `TMPDIR` assignment after it, or set `env.TMPDIR` after creating the directory.

In `eval/setup.mjs`, append this to `BARE_PROMPT`:

` Read files with Read, Grep and Glob and change them with Edit or Write; run each command as its own Bash call (no cd, pipes, redirects, &&, ; or heredocs): this unattended session denies compound commands.`

Use the exact wording the test matches: "read files with Read, Grep and Glob and change them with Edit or Write" and "run each command as its own Bash call". Either make the test case-insensitive or start the sentence in lower case after a semicolon.

- [ ] **Step 4: Run them to verify they pass, then the suite and the dry eval**

Run: `npm test && npm run eval:dry`
Expected: exit 0. The scripted e2e is still 14/3/22/27/9/6, which shows `.tmp/` never shows in the clean-tree checks, and all five dry arms are accepted 3/3.

- [ ] **Step 5: Commit**

```bash
git add eval/setup.mjs eval/run.test.mjs tests/e2e/lib/sandbox.mjs tests/e2e/lib/sandbox.test.mjs
git commit -m "fix(eval): bare arms get the same tool advice, and every sandbox has its own TMPDIR inside the repo"
```

---

### Task 5: Verify, review, and the live check (paid; the person decides)

- [ ] Run `npm test`, `npm run typecheck` and `npm run eval:dry`, and quote the results. Check the scripts total stays at or under 3 050.
- [ ] Launch one Opus reviewer on `git diff main...HEAD` using `requesting-code-review/code-reviewer.md`, with this plan, the denial table, the Review Focus verbatim and the ledger's rulings. Fix every Critical and Important finding in one pass, each with a test that fails first.
- [ ] **Ask the person** before re-running the pilot: `npm run eval -- --arms all --runs 1 --cap-total 10 --results <scratchpad>/pilot2.jsonl`, about $2 at pilot prices. Compare denials per arm against the first pilot's 27. A denial that remains is either fixed in the same wave with a test or reported as a ruling.
- [ ] Report the results, the rulings and the deferred minors. Merge only when the person asks.

## Not in this plan (found by the pilot; a separate small plan)

- The brief does not state the response shapes (`GET /products` returns a bare array) or the SKU format. Four of five arms failed the HTTP acceptance on this, and two failed the import acceptance.
- The runner cannot answer open questions the model leaves in a spec, so the final-policy arm stopped at approval. As the person, the runner could tell the model to record its recommended defaults under `## Decisions`, then approve.
