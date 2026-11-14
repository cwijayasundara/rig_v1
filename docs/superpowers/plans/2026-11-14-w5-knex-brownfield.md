# W5: the `knex` brownfield variant, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a `knex` eval variant (two tasks, four traps) on the brownfield machinery, so rig-on has something it can fail.

**Architecture:** `eval/variants/knex.mjs` mirrors `eval/variants/brownfield.mjs`. The hidden checks live in two small files, one per
task, so the two patch-and-check tasks touch disjoint files. `eval/lib/upstream.mjs` gains the options knex needs (a lockfile, a
rebuild step, a base patch). Nothing under `scripts/`, `skills/` or `hooks/` changes.

**Tech Stack:** Node 26, `node:test`, knex 3.1.0 (mocha, sqlite3 5.1.7 prebuilt), `git apply` patches.

**Spec:** `docs/superpowers/specs/2026-11-14-w5-knex-brownfield-design.md`

## Global Constraints

- One branch `w5-knex`, one PR to main. Only `eval/` and `docs/` change. Branch is cut from main by the coordinator.
- Upstream pin: `https://github.com/knex/knex`, tag `3.1.0`, sha `4ca3dd5bc28e0665c5bed55026fac2ec45489d81`. Never committed here.
- `npm install --ignore-scripts`, then `npm rebuild sqlite3`. The lockfile is `eval/variants/knex/package-lock.json`, generated once.
- Base `npm test` becomes `cross-env DB=sqlite3 mocha --exit -t 10000 --config test/mocha-unit-config-test.js` (1532 passing, 49 pending).
  `test:sqlite` (386 passing, 128 pending) stays and is the suite `npm test` skips.
- `test/db-less-test-suite.js` drops the `migration-list-resolver` and `seed/seeder` requires (`mock-fs` crashes on Node 26).
- No prompt or harness-written file contains a `TRAP_WORDS` entry. Hidden checks run in child processes with the verdict in a
  harness-named file, never on stdout.
- Each file at most 500 lines. Never run `npm test`, `e2e*` or `eval*`; run only the specs named per task, then `npm run test:changed`.
- Only `eval/` changes, so the coordinator's final step is `npm run test:changed`, plus a line to the person: "run
  `node eval/run.mjs --arms sonnet-rig-on,haiku-rig-on --runs 3 --variant knex` (about $3 to $5)".

## Review Focus

- Empty-table edge: `insert([]).onConflict('id').merge()` with an array that holds only empty objects (`[{}]`) must keep its old behaviour, not resolve to `[]`.
- `whereNotLike` with a column of another table (`whereNotLike('t.name', ...)`) and with `.orWhereNotLike` after a plain `where`: grouping and `or` preserved in SQL.
- The `emptyUpsert` check must not leave an open sqlite handle: a leaked connection hangs the child until the timeout.
- A slip that is also wrong in a second trap's area must fail exactly its own trap (the spec per task pins this).
- Node-version drift: when sqlite3's prebuilt binary is missing, the variant's specs skip with the reason instead of failing.

---

### Task 1: upstream options, base patch, variant skeleton

**Files:**
- Modify: `eval/lib/upstream.mjs:19` (`cloneUpstream`), `:50-57` (`seedUpstream`)
- Create: `eval/variants/knex/base.patch`, `eval/variants/knex/package-lock.json`, `eval/variants/knex.mjs`
- Modify: `eval/setup.mjs:71,98,121`, `eval/run.mjs:23,38,43,122`, `eval/score.mjs:84`
- Test: `eval/knex.test.mjs` (new; the base and wiring specs), `eval/brownfield.test.mjs` (the two upstream-option specs may live here, next to the existing cache specs)

**Interfaces:**
- Produces: `cloneUpstream({ ..., lockfile?: string, rebuild?: string[] })`. `lockfile` is a path copied over `package-lock.json`
  before install, which then runs `npm ci` as today; with no lockfile and `install: true` it runs `npm install`. `rebuild` runs
  `npm rebuild <name>` for each name after install.
- Produces: `seedUpstream(sb, dir, message, { patch?: string })`. A `patch` path is applied with `git apply` to the copied tree before the base commit.
- Produces from `knex.mjs`: `UPSTREAM`, `TASKS = ['notLike', 'emptyUpsert']`, `TRAP_TEST = { notLike: 'test/unit/query/where-not-like.js', emptyUpsert: 'test/unit/query/empty-upsert.js' }`,
  `TRAP_WORDS`, `BARE_PROMPT`, `PHASES` (ids `N1`, `N2`), `setupBare`, `setupRig`, `dryBare`, `applyPatch(dir, task, 'ref'|'slip')`,
  `checks(repo, opts) -> { traps, failures }`, `score(sb, { timeoutMs, runBounded, tamper })`. Same shapes as `brownfield.mjs`.
- Produces: `CHECKS` is `[...T1_CHECKS, ...T2_CHECKS]` where each entry is `{ task, trap, run(repo) -> true | string }`; `NAMES` for the
  result are the trap names `caller`, `types`, `rule`, `dialect`. `score` reports `npmTest` plus the four traps, and `of: 5`.
  A trap escaped only when its task's `TRAP_TEST` file exists and `npm test` passed.
- Contract for `checks.t1.mjs` and `checks.t2.mjs` (Tasks 2 and 3 fill them): each exports `default: Array<{ task: string, trap: string, run: (repo: string) => true | string }>`. Task 1 ships both files as `export default []`.
- The child runner is the brownfield one: `node knex.mjs <repo> <index> <verdictFile>`; copy `runChild` rather than import it only if
  importing would need a change to `brownfield.mjs`.

- [ ] **Step 1: Write the failing specs** in `eval/knex.test.mjs` (clone-needing specs through the same `netTest` skip pattern as `brownfield.test.mjs`):
  - `cloneUpstream installs from a supplied lockfile and runs rebuild` (fixture repo, `install: false` is not used here; a
    fixture package with no deps and a lockfile; assert the lockfile bytes landed and a `rebuild` list of `[]` is a no-op).
  - `seedUpstream applies a base patch before the base commit` (assert the patched content is in the one base commit).
  - `no prompt contains a TRAP_WORDS entry` (bare prompt and both `PHASES` prompts; the bare prompt contains each issue text).
  - `base passes npm test and test:sqlite, and every trap fails there` (clone-needing).
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test eval/knex.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the two `upstream.mjs` options and `eval/variants/knex.mjs` (`UPSTREAM` pin above; `BARE_PROMPT` says the repo is
  knex 3.1.0, names the two trap test files, says `npm test` must pass, and carries the same unattended-session sentence as
  `brownfield.mjs`; `TRAP_WORDS` has at least 6 entries, including `trap`, `hidden`, `collate`, `onConflict`, `types/index.d.ts`, `test:sqlite`).
  `setupRig` puts the unit sensor on `npm test` and sets a `CLAUDE.md` whose `## Map` lists `lib/` and `test/`, with no trap word.
  Generate `package-lock.json` once from the pinned tree (`npm install --package-lock-only --ignore-scripts`) and write `base.patch`
  from the two edits in Global Constraints. Wire `knex` into `setup.mjs`, `run.mjs` (`PHASES.knex`, `barePrompt`, the `--variant`
  list and its message) and `score.mjs` (a branch next to the brownfield one). Phases are built like `brownfield.mjs`'s `phase()`
  with `id: \`N${n}\`` and `acceptance: 'brownfield'`.
- [ ] **Step 4: Run** the spec file and `node --disable-warning=ExperimentalWarning --test eval/brownfield.test.mjs`. Expected: PASS (the `ref`/`slip` specs arrive with Tasks 2 and 3).
- [ ] **Step 5: Commit** `git commit -m "eval: knex variant skeleton, lockfile and rebuild options, base patch"`

---

### Task 2: T1 `notLike` (traps `caller`, `types`)

**Files:**
- Create: `eval/variants/knex/tasks/notLike.md`, `eval/variants/knex/patches/notLike/{ref,slip}.patch`, `eval/variants/knex/checks.t1.mjs` (replace the empty array)
- Test: `eval/knex.test.mjs` (add the T1 specs)

**Interfaces:**
- Consumes: Task 1's `applyPatch`, `checks`, `TRAP_TEST.notLike`, and the `{ task, trap, run }` entry shape.
- Produces: two entries in `checks.t1.mjs`, traps `caller` and `types`.

- [ ] **Step 1: Write the failing specs:** `notLike ref patch passes caller and types`, and `notLike slip patch passes npm test and fails only caller`
  (assert `r.traps.caller === false`, `r.traps.types === true`, `r.npmTest === true`, `r.escaped === 1`, with the `emptyUpsert` ref applied).
  Add a third, `a types-only slip (no d.ts entries) fails only types`.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test eval/knex.test.mjs`. Expected: FAIL on the missing patches.
- [ ] **Step 3: Write the issue** in `tasks/notLike.md` (a GitHub-issue text: add `whereNotLike`, `orWhereNotLike`, `whereNotILike`,
  `orWhereNotILike`; no word from `TRAP_WORDS`; one correct behaviour: the negation of `whereLike`/`whereILike` on every dialect).
  Write `ref.patch`: set `not` on the existing `whereLike`/`whereILike` statements through `this._not(...)` (code at
  `lib/query/querybuilder.js` near the `whereLike` definitions and `types/index.d.ts:662`), the four typings, and a unit test in
  `test/unit/query/where-not-like.js` registered in `test/db-less-test-suite.js`. `slip.patch`: a new statement type with a base-compiler
  method only (same unit test, default dialect), plus the typings.
- [ ] **Step 4: Write the two checks.** `caller`: for `mysql` and `mssql` clients, `toSQL().sql` of `whereNotLike` and `whereNotILike` equals the negated form
  of upstream's own `whereLike`/`whereILike` SQL on the same client (compute both inside the check, so no SQL literal is hard-coded).
  `types`: write a usage file to the check's temp dir that calls all four on a typed builder, run `node_modules/.bin/tsc --noEmit` on it, true on exit 0.
- [ ] **Step 5: Run** the spec file. Expected: PASS for the T1 specs.
- [ ] **Step 6: Commit** `git commit -m "eval: knex notLike task, patches and checks"`

---

### Task 3: T2 `emptyUpsert` (traps `rule`, `dialect`)

**Files:**
- Create: `eval/variants/knex/tasks/emptyUpsert.md`, `eval/variants/knex/patches/emptyUpsert/{ref,slip}.patch`, `eval/variants/knex/checks.t2.mjs` (replace the empty array)
- Test: `eval/knex.test.mjs` (add the T2 specs)

**Interfaces:**
- Consumes: as Task 2.
- Produces: two entries in `checks.t2.mjs`, traps `rule` and `dialect`.

- [ ] **Step 1: Write the failing specs:** `emptyUpsert ref patch passes rule and dialect`; `emptyUpsert slip patch passes npm test and fails rule` (the `slip` resolves every empty insert to `[]`;
  assert `r.traps.rule === false` and `r.npmTest === true`); `a sqlite-only fix fails only dialect` (a second patch `slip-sqlite-only.patch` with the right
  semantics in `lib/dialects/sqlite3/index.js` only). Add `the full test:sqlite suite is red under the rule slip and green under ref`.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test eval/knex.test.mjs`. Expected: FAIL on the missing patches.
- [ ] **Step 3: Write the issue** in `tasks/emptyUpsert.md` as in the spec (sync jobs, `insert(rows).onConflict(key).ignore()` or `.merge()` with no rows rejects with "The query is empty"; it should resolve to `[]` and run no query when `onConflict` is set), with no `TRAP_WORDS` entry and without mentioning plain `insert([])`.
  Write `ref.patch` with the short-circuit in the shared runner (`lib/execution/runner.js`) or the builder's `then`, conditioned on `onConflict` being set and the rows being empty, plus
  a unit test in `test/unit/query/empty-upsert.js` registered in `test/db-less-test-suite.js`.
- [ ] **Step 4: Write the two checks.** `rule`: run `npm run test:sqlite` in the repo (child, bounded), then on a sqlite client assert `insert([])` rejects with "The query is empty" and
  `insert([]).onConflict('id').ignore()` and `.merge()` resolve to `[]` with nothing on the `query` event; destroy the client. `dialect`: a `pg` client with `acquireConnection` stubbed to throw; the same two upsert calls resolve to `[]`.
- [ ] **Step 5: Run** the spec file. Expected: PASS for the T2 specs.
- [ ] **Step 6: Commit** `git commit -m "eval: knex emptyUpsert task, patches and checks"`

---

### Task 4: whole-variant specs and the T3 decision

**Files:**
- Modify: `eval/knex.test.mjs`, `eval/run.test.mjs:410-412`
- Maybe create: `eval/variants/knex/tasks/firstColumns.md`, patches, `checks.t3.mjs`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the failing specs:** `dry knex run: full marks for rig and bare` (`runOne` with `variant: 'knex'`: `accepted`, `checks: 5`, `of: 5`, `escaped: 0`, `phasesDone: 2` for the rig arm);
  `each slip fails exactly its own trap and passes npm test` loop over both tasks; `a trap whose test file was never written is missing, not escaped`;
  add `'knex'` to the variant list in `eval/run.test.mjs:412` (the rig-on dry-run spec).
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test eval/knex.test.mjs eval/run.test.mjs`. Expected: FAIL until the wiring is complete.
- [ ] **Step 3: Fix any wiring gap the specs expose.** If fewer than 4 traps pass their own `slip`-fails/`ref`-passes specs, add T3 (`first()` with a column array) as Task 2 does; otherwise do not.
- [ ] **Step 4: Run** `npm run typecheck` and `npm run test:changed`. Expected: both exit 0. Quote the output.
- [ ] **Step 5: Commit** `git commit -m "eval: knex variant dry run and slip specs"`
- [ ] **Step 6: Tell the person, in one line,** to run the 3-run live eval (the command in Global Constraints). Do not start it.

---

## Self-review

- **Spec coverage:** pin and install (Task 1); base patch and lockfile (Task 1); `cloneUpstream` options with a spec each (Task 1); T1 and its two traps (Task 2); T2 and its two traps (Task 3); `knex.mjs`, `run`/`setup` wiring and `knex.test.mjs` assertions: refs pass, slips fail only their own trap, no `TRAP_WORDS`, base passes both suites (Tasks 1 and 4); T3 conditional (Task 4); the run command is the person's (Task 4).
- **Added beyond the spec:** `seedUpstream`'s `patch` option, because the base patch must land inside the one base commit; the two per-task check files, so Tasks 2 and 3 can run in parallel without editing the same file.
- **Launches:** Task 1 first (one Sonnet), then Tasks 2 and 3 in parallel (one Sonnet each), Task 4 inline by the coordinator. That is 3 launches.
