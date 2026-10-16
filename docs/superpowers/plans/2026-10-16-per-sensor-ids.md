# Per-sensor ids on command findings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A failing registry command sensor is filed under its own id (`unit`, `lint`, `types`), not the shared name `commands`. A waiver then silences exactly one sensor, and status counts each sensor separately.

**Architecture:** `runSensors` (scripts/check.ts) sets `sensor: s.id` on every finding and marks running out of time with a structured flag, `outOfTime: true`. The commit and push softening reads that flag instead of the name `commands` and a message regex. `commands` leaves `SENSOR_NAMES`. The registry refuses a command sensor id that would shadow a harness finding name. `waive` accepts any command sensor id the registry declares, so an old `commands` waiver row no longer matches anything.

**Tech Stack:** TypeScript on Node 22 (`--experimental-strip-types`), `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-16-behavioural-harness-design.md`:
- §7: feedback shape, "sensor id, its guide sentence, the first 20 lines of output, the rerun command";
- §3.1: sensor `id`, unique and kebab-case.

## Global Constraints

- rig is not enabled on this repo: never run `sdlc.ts check` or change records against this tree (CLAUDE.md).
- `scripts/` stays at or under `SCRIPTS_CAP` 3 050 lines (`scripts/neutrality.spec.ts`), and the whole harness at or under 3 900 (`scripts/size.spec.ts`).
- Core stays language-neutral (`scripts/neutrality.spec.ts`).
- Fix the harness, not its output; never `--no-verify` past a rig hook.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisions

1. **The message keeps its leading id** (`lint failed (exit 1): …`), so the block reads `[lint]` then `✗ lint failed …`. It repeats the id, but someone reading one line of output still sees which sensor it was, and every message spec stays as it is.
2. **No migration for old `commands` waiver rows.** They stop matching, which is the point of the change: they silenced every command sensor at once. The block that reappears names the sensor, and `/rig:waive <id> …` accepts it.
3. **Reserved ids.** These are harness finding names that are not built-ins: `commands`, `config`, `contracts`, `unscanned`, `plan-gate`, `human-approval` and `sync`. A registry command sensor with one of these ids is a config error. Without that rule, a sensor named `plan-gate` would become unwaivable, one named `contracts` unwaivable at CI, and one named `human-approval` would be treated as the CI approval block. Built-in ids are already refused for command sensors (scripts/registry.ts:68).

## Review Focus

1. **A command sensor named like a harness finding** (`plan-gate`, `human-approval`, `contracts`, `config`, `sync`, `unscanned`, `commands`). Expect a config error naming the id. Its findings must never inherit that finding's gate rules. Pinned in Task 1: "a command sensor may not take a harness finding's name".
2. **A waiver row written before this change, with sensor `commands`.** Expect it to silence nothing. The `unit` block shows, and `waive unit * …` clears it. Pinned in Task 2: "an old commands waiver no longer silences a command sensor".
3. **A waiver on one command sensor.** Expect it to silence that sensor only, while another failing command sensor still blocks. This is the harm the change removes. Pinned in Task 2: "waiving lint leaves unit blocking".
4. **A command sensor that runs out of time at commit or push.** Expect it still softened to a warning under its own id. The flag drives the softening, not the name. Pinned in Task 1: "a timed-out command at commit warns under its own id".
5. **A waiver for a command id the registry does not declare** (a typo, or a sensor since removed). Expect a refusal that lists the built-in names and the declared command ids. Pinned in Task 2: "waive refuses an undeclared command id and lists the declared ones".

---

### Task 1: Findings carry the sensor's id

**Files:**
- Modify: `scripts/model.ts:7-13` (`SENSOR_NAMES` loses `commands`; `Finding` gains `outOfTime?: true`)
- Modify: `scripts/check.ts:80-105` (`runSensors`), `scripts/check.ts:323` (commit softening)
- Modify: `scripts/githooks.ts:131` (`soften`)
- Modify: `scripts/registry.ts:60-70` (`RESERVED_IDS`, the parse error)
- Test: `scripts/check.spec.ts`, `scripts/gate.spec.ts`, `scripts/registry.spec.ts`

**Interfaces:**
- Produces:
  - `Finding.outOfTime?: true`, set when a command sensor timed out or was not run for lack of budget;
  - `RESERVED_IDS: readonly string[]`, exported from `scripts/registry.ts`;
  - command findings with `sensor === <registry id>`.

- [ ] **Step 1: Write the failing tests**

In `scripts/check.spec.ts`, change the expectations of the two existing tests and add one:

```ts
// in 'a failing fast command blocks with its output tail; a passing one is silent':
  assert.match(r.stdout, /\[lint\]/)
  assert.doesNotMatch(r.stdout, /\[commands\]/)
  assert.match(r.stdout, /lint failed \(exit 1\)/)

// in 'known-red commands warn instead of block, and the ratchet removes them once green':
  assert.match(red.stdout, /warn: \d+ \(.*\blint 1/)

test('a timed-out command at commit warns under its own id', () => {
  sensors({ fast: { test: `node -e "setTimeout(() => {}, 20000)"` } })
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/app.js', 'export const a = 8\n')
  gitIn(repo, 'add', 'src/app.js')
  const r = check('--at', 'commit', '--budget-ms', '1500', '--json')
  const out = JSON.parse(r.stdout)
  assert.equal(r.code, 0, r.stdout)
  assert.ok(out.warns.some((f: { sensor: string; outOfTime?: boolean }) => f.sensor === 'test' && f.outOfTime === true), JSON.stringify(out.warns))
})
```

Check that `check --json` emits `warns`: read `cmdCheck`'s JSON output in `scripts/check.ts`. If it emits only `findings`, filter on `severity === 'warn'` instead, and record that as a ruling.

In `scripts/gate.spec.ts` (line 142): `assert.match(out.reason, /\[lint\][\s\S]*lint failed/)`.

In `scripts/registry.spec.ts`:

```ts
test('a command sensor may not take a harness finding\'s name', () => {
  for (const id of ['commands', 'config', 'contracts', 'unscanned', 'plan-gate', 'human-approval', 'sync']) {
    const { errors } = parseRegistry(JSON.stringify({ sensors: [{ id, cmd: 'true', cadence: 'turn', blocks: true, count: 'exit', guide: 'g' }] }))
    assert.ok(errors.some(e => e.includes(`"${id}" is reserved for a harness finding`)), `${id}: ${errors.join('; ')}`)
  }
})
```

(`parseRegistry` is already imported by `registry.spec.ts`; add it to the import if not.)

- [ ] **Step 2: Run them to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test scripts/check.spec.ts scripts/gate.spec.ts scripts/registry.spec.ts`
Expected: FAIL in four tests:
- the `[lint]` test: the output has `[commands]`;
- the known-red test: the output has `commands 1`;
- the timed-out test: no warning has `sensor === 'test'`;
- the reserved-name test: no "reserved" error.

The gate test at line 142 fails as well.

- [ ] **Step 3: Implement**

`scripts/model.ts`:

```ts
// Every built-in and harness finding name; /rig:waive accepts these plus the registry's command sensor ids (a test keeps this in step with the sources).
export const SENSOR_NAMES = [
  'test-tamper', 'suppression', 'layering', 'size', 'secrets', 'rules', 'harness-tamper',
  'traceability', 'red-proof', 'unscanned', 'config', 'contracts', 'model-role',
]

export type Finding = { sensor: string; severity: Severity; file?: string; line?: number; message: string; fix: string; labels?: string[]; outOfTime?: true }
```

`scripts/check.ts` `runSensors`: the budget-ran-out push becomes

```ts
      findings.push({ sensor: s.id, severity: s.blocks ? 'block' : 'warn', message: `${s.id} not run: the ${Math.round(budgetMs / 1000)} s budget ran out`, fix: `make ${s.id} faster or move it to a later cadence in .rig/sensors.json`, outOfTime: true })
```

and the failure push becomes

```ts
    findings.push({
      sensor: s.id,
      severity: !s.blocks || (known && !row.timedOut) ? 'warn' : 'block',
      message: `${s.id} failed (exit ${row.exit}${row.timedOut ? ', timed out' : ''}): ${s.guide}\n${tail}`,
      fix: known && !row.timedOut ? 'known red before this change: fix it when you can' : `fix what it reports, then rerun: ${cmd}`,
      ...(row.timedOut ? { outOfTime: true as const } : {}),
    })
```

`scripts/check.ts:323`: `if (at === 'commit') for (const f of result.findings) if (f.outOfTime) f.severity = 'warn'`

`scripts/githooks.ts:131`: `const soften = (f: Finding): Finding => (f.outOfTime ? { ...f, severity: 'warn' } : f)`

`scripts/registry.ts`, beside `BUILTIN_IDS`:

```ts
// Harness finding names that are not built-ins: a command sensor with one of these ids would inherit that finding's gate rules.
export const RESERVED_IDS = ['commands', 'config', 'contracts', 'unscanned', 'plan-gate', 'human-approval', 'sync'] as const
```

and in `parseSensor`, after the built-in-id line:

```ts
  if (!builtin && (RESERVED_IDS as readonly string[]).includes(id)) errors.push(`${at}: "${id}" is reserved for a harness finding; rename the sensor`)
```

Then search for any other reader of the old name and change it the same way:

```bash
grep -rn "'commands'" scripts/*.ts skills templates guides
```

Leave alone the `commands: 'none' | 'fast' | 'full'` option of `runChecks`; that is a different thing.

- [ ] **Step 4: Run them to verify they pass, then the spec suite**

Run: `node --disable-warning=ExperimentalWarning --test scripts/check.spec.ts scripts/gate.spec.ts scripts/registry.spec.ts scripts/model.spec.ts`
Expected: PASS. `model.spec.ts` "every sensor name emitted by the scripts is waivable" still passes, because no `sensor: 'commands'` literal remains.

Run: `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts`
Expected: every spec passes. Any other spec that matched `[commands]` or `commands 1` is updated to the sensor's id, and each such update is listed in the commit message.

- [ ] **Step 5: Commit**

```bash
git add scripts
git commit -m "fix(sensors): a command sensor's finding carries its registry id; running out of time is a flag, not a name; harness finding names are reserved"
```

---

### Task 2: Waivers name one command sensor

**Files:**
- Modify: `scripts/sdlc.ts:146-158` (`cmdWaive`)
- Test: `scripts/sdlc.spec.ts`, `scripts/check.spec.ts`

**Interfaces:**
- Consumes: findings with `sensor === <registry id>` from Task 1; `loadConfig()` from `scripts/check.ts`.
- Produces: `waive <id> <file|*> <reason>` accepts `SENSOR_NAMES` plus every registry sensor with a `cmd`.

- [ ] **Step 1: Write the failing tests**

In `scripts/sdlc.spec.ts`:

```ts
test('waive accepts a declared command sensor id', () => {
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [{ id: 'unit', cmd: 'true', cadence: 'turn', blocks: true, count: 'exit', guide: 'g' }] }) + '\n')
  run(['new', 'xx', '--type', 'chore'])
  const r = run(['waive', 'unit', '*', 'flaky on CI'], { env: { SDLC_HUMAN: '1' } })
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /waived unit for \* in xx/)
})

test('waive refuses an undeclared command id and lists the declared ones', () => {
  write(repo, '.rig/sensors.json', JSON.stringify({ sensors: [{ id: 'unit', cmd: 'true', cadence: 'turn', blocks: true, count: 'exit', guide: 'g' }] }) + '\n')
  run(['new', 'xx', '--type', 'chore'])
  const r = run(['waive', 'unti', '*', 'typo'], { env: { SDLC_HUMAN: '1' } })
  assert.notEqual(r.code, 0)
  assert.match(r.stderr, /unknown sensor "unti"/)
  assert.match(r.stderr, /\bunit\b/)
  assert.match(r.stderr, /test-tamper/)
})

test('waive refuses commands: it is no longer a sensor', () => {
  run(['new', 'xx', '--type', 'chore'])
  assert.notEqual(run(['waive', 'commands', '*', 'all of them'], { env: { SDLC_HUMAN: '1' } }).code, 0)
})
```

In `scripts/check.spec.ts`, using that file's `sensors`, `hook`, `write`, `check` and `sdlc` helpers:

```ts
test('waiving lint leaves unit blocking', () => {
  sensors({ fast: { lint: 'node -e "process.exit(1)"', unit: 'node -e "process.exit(1)"' } })
  sdlc(repo, ['new', 'xx', '--type', 'chore'])
  sdlc(repo, ['waive', 'lint', '*', 'style debt'], { env: { SDLC_HUMAN: '1' } })
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/app.js', 'export const a = 9\n')
  const r = check('--at', 'stop')
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[unit\]/)
  assert.doesNotMatch(r.stdout, /\[lint\]/)
})

test('an old commands waiver no longer silences a command sensor', () => {
  sensors({ fast: { unit: 'node -e "process.exit(1)"' } })
  sdlc(repo, ['new', 'xx', '--type', 'chore'])
  fs.appendFileSync(path.join(repo, '.rig/waivers.jsonl'), JSON.stringify({ slug: 'xx', sensor: 'commands', file: '*', reason: 'before per-sensor ids', by: 'someone', at: '2026-10-01T00:00:00Z' }) + '\n')
  hook(repo, 'prompt-submit', {})
  write(repo, 'src/app.js', 'export const a = 10\n')
  const r = check('--at', 'stop')
  assert.equal(r.code, 1)
  assert.match(r.stdout, /\[unit\]/)
})
```

If `check.spec.ts`'s `sdlc` helper takes its environment differently, use whatever form that file already uses for `SDLC_HUMAN`.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --disable-warning=ExperimentalWarning --test scripts/sdlc.spec.ts scripts/check.spec.ts`
Expected:
- "waive accepts a declared command sensor id" fails: `unknown sensor "unit"`;
- "waiving lint leaves unit blocking" fails: the lint waiver is refused, so `[lint]` still shows;
- "waive refuses an undeclared command id" fails on `/\bunit\b/`: the error lists only `SENSOR_NAMES`;
- "waive refuses commands" and "an old commands waiver …" already pass after Task 1. They pin the behaviour; they are not driving new code.

- [ ] **Step 3: Implement** in `scripts/sdlc.ts` `cmdWaive`, replacing the `SENSOR_NAMES` line:

```ts
  const commandIds = loadConfig().registry.sensors.filter(s => s.cmd).map(s => s.id)
  if (!SENSOR_NAMES.includes(sensor) && !commandIds.includes(sensor)) fail(`unknown sensor "${sensor}"; known: ${[...SENSOR_NAMES, ...commandIds].join(', ')}`)
```

(`loadConfig` is already imported in `sdlc.ts` from `./check.ts`.)

- [ ] **Step 4: Run them to verify they pass, then the spec suite**

Run: `node --disable-warning=ExperimentalWarning --test scripts/sdlc.spec.ts scripts/check.spec.ts`
Expected: PASS.

Run: `node --disable-warning=ExperimentalWarning --test scripts/*.spec.ts`
Expected: every spec passes.

- [ ] **Step 5: Commit**

```bash
git add scripts
git commit -m "fix(waive): a waiver names one command sensor by its registry id; commands is no longer waivable"
```

---

### Task 3: e2e, docs and the spec note

**Files:**
- Delete: `tests/e2e/lib/findings.mjs`
- Modify: `tests/e2e/lib/stacks.mjs`, `tests/e2e/lib/stacks.test.mjs`, `tests/e2e/phases/s5-policy.mjs` (use `f.sensor`)
- Modify: `README.md:315` (sensor list), `skills/waive/SKILL.md` (`argument-hint`)
- Modify: `docs/superpowers/specs/2026-10-16-behavioural-harness-design.md` §7 (a note under the feedback shape)
- Test: `scripts/removed.spec.ts`

**Interfaces:**
- Consumes: Task 1's findings.
- Produces: nothing new.

- [ ] **Step 1: Write the failing guard** in `scripts/removed.spec.ts`:

```ts
test('per-sensor ids: no shipped text or e2e helper still speaks of a commands sensor', () => {
  assert.ok(!fs.existsSync('tests/e2e/lib/findings.mjs'), 'sensorOf is gone: findings carry their id')
  for (const f of ['README.md', 'skills/waive/SKILL.md', 'tests/e2e/phases/s5-policy.mjs', 'tests/e2e/lib/stacks.mjs']) {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /sensorOf|plus commands and config findings/, f)
  }
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --disable-warning=ExperimentalWarning --test scripts/removed.spec.ts`
Expected: FAIL. `tests/e2e/lib/findings.mjs` still exists.

- [ ] **Step 3: Make the edits**

- Delete `tests/e2e/lib/findings.mjs`, and the `sensorOf` test and its import in `tests/e2e/lib/stacks.test.mjs`.
- In `tests/e2e/lib/stacks.mjs`, drop the import and use `b.sensor` in both places that call `sensorOf(b)` or `map(sensorOf)`.
- In `tests/e2e/phases/s5-policy.mjs`:
  - drop the import; `fired` maps `f => f.sensor`;
  - the commit check matches `/\[unit\]/` instead of `/\bunit\b/`. This also settles the 5b minor about matching free text.
- README line 315: `- **Sensors:** test-tamper, suppression, layering, size, secrets, rules, harness-tamper, traceability and red-proof, plus each registry command sensor under its own id (\`unit\`, \`lint\`, …) and config findings. \`/rig:waive <id>\` waives one of them.`
- `skills/waive/SKILL.md`: `argument-hint: <sensor-or-command-id> <file|*> <reason>`.
- Spec §7, under "Feedback shape": `A command sensor's finding carries its registry id as its sensor name, so a waiver names one sensor. The ids commands, config, contracts, unscanned, plan-gate, human-approval and sync are reserved for harness findings.`

- [ ] **Step 4: Run the whole suite and the stack runner**

Run: `npm test > <scratchpad>/ids.txt 2>&1; echo exit $?; grep -E "^ℹ (pass|fail)|checks passed|floor" <scratchpad>/ids.txt`
Expected: exit 0. Every spec and every e2e unit test passes, and the scripted e2e is still S0 14/14, S1 3/3, S2 22/22, S3 27/27, S4 9/9 and S5 6/6.

Run: `npm run typecheck` and expect 0 errors. Run `npm run test:e2e:stacks` and expect node, rust and java-maven at 4/4 each, with go and dotnet skipped locally.

- [ ] **Step 5: Commit**

```bash
git add -A tests/e2e README.md skills/waive/SKILL.md docs/superpowers/specs/2026-10-16-behavioural-harness-design.md scripts/removed.spec.ts
git commit -m "docs(sensors): command findings carry their id; the e2e reads it directly"
```

---

### Task 4: Verify and review

- [ ] Run `npm test` and `npm run typecheck`, and quote both results.
- [ ] Launch one reviewer on `git diff main...HEAD` using `requesting-code-review/code-reviewer.md`, with this plan, spec §7 and §3.1, the Review Focus verbatim and the ledger's rulings. The reviewer is `opus`, as for steps 3 to 5.
- [ ] Fix every Critical and Important finding in one pass, each with a test that fails first, then run `npm test` again.
- [ ] Report to the person: the results, the rulings and the deferred minors. Merge only when the person asks.
