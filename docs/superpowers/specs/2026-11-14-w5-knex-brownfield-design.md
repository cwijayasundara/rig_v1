# W5: the `knex` brownfield variant

2026-11-14. Wave W5 of `docs/proposals/2026-11-14-implementation-order.md`.

## Why

rig-on caught every trap on `hard` and `brownfield` (commander.js), so the eval set gives no signal for W6 (the code map) or W7
(new sensors). W5 needs a repo where reading is not enough:
- it is too big to read whole;
- a change has callers in other modules;
- a rule is held only by a suite that `npm test` does not run.

Exit: at least 2 traps escape rig-on in 3 runs. If none escape, rig-on is production ready on this evidence and the order skips
to W8.

## Goals, non-goals, anti-goals

- **Goals:** one new variant, `knex`, on the existing brownfield machinery. Each trap passes `npm test` and the tests a careful model
  writes, and fails a hidden check. rig-on arms only.
- **Non-goals:** bare or rig-start arms; a UI task (that is the other half of W5, done separately); any harness change in
  `scripts/`, `skills/` or `hooks/`.
- **Anti-goals:**
  - a trap that names its own cause in the issue text (`TRAP_WORDS`, as in `brownfield.mjs`);
  - a trap whose "right" answer is a judgement call. Each hidden check has one correct behaviour, and that behaviour does not
    contradict the issue.

## Approaches (picked: knex)

| Upstream | For | Against |
|---|---|---|
| **knex 3.1.0** (picked) | `lib/` is 141 files and 21.5k lines. Every dialect overrides parts of a shared query compiler. `test:db` (integration) is not in the unit run. Typings are checked only by `lint:types` | No lockfile; native sqlite3; on Node 26, two `mock-fs` specs crash and better-sqlite3 9 does not build |
| fastify 4.28.1 | Pure JS, many modules | Its `npm test` already runs lint, unit and types, so there is no skipped suite |
| yargs 17 | Familiar | Small, the same problem as commander |

## Upstream and base (measured 2026-11-14 on Node 26.13, darwin arm64)

- Pin: `https://github.com/knex/knex`, tag `3.1.0`, sha `4ca3dd5bc28e0665c5bed55026fac2ec45489d81`. MIT, never committed here.
- Install: `npm install --ignore-scripts` (1053 packages, 19 s), then `npm rebuild sqlite3` (prebuilt binary, works).
- **Base patch** (`eval/variants/knex/base.patch`, committed with the upstream tree as the base commit):
  - `package.json`: `"test"` becomes `cross-env DB=sqlite3 mocha --exit -t 10000 --config test/mocha-unit-config-test.js` (the
    db-less unit suite; 1532 passing, 49 pending, 9 s). `test:sqlite` stays as it is: 386 passing, 128 pending, 2.6 s. It is the
    suite `npm test` skips.
  - `test/db-less-test-suite.js`: the `migration-list-resolver` and `seed/seeder` requires are dropped, because `mock-fs` (every
    version) crashes on Node 26.
- **Lockfile:** knex has none. `eval/variants/knex/package-lock.json` is generated once from the pinned tree and copied in before
  install, so every run gets the same dependencies. `cloneUpstream` gains two options, `lockfile` and `rebuild: ['sqlite3']`,
  with a spec each.

## Tasks and traps

Each task is a GitHub-issue-style text in `eval/variants/knex/tasks/<task>.md`, with `patches/<task>/{ref,slip}.patch` as in
`brownfield/`.

### T1 `notLike`: add `whereNotLike`, `orWhereNotLike`, `whereNotILike`, `orWhereNotILike`

- **Trap `caller` (dialect overrides):** mysql (`mysql-querycompiler.js:203`) adds `COLLATE utf8_bin` to `whereLike`, and mssql
  (`mssql-querycompiler.js:507`) adds a case-sensitive or case-insensitive collation. The right build sets `not` on the existing
  `whereLike` and `whereILike` statements, which already go through `this._not(...)` in every dialect. The slip adds a new
  statement type with only a base-compiler method, so mysql and mssql lose their collation. The default-dialect unit test still
  passes.
  - Hidden check: `toSQL()` of `whereNotLike` and `whereNotILike` on `mysql` and `mssql` equals the negated form of upstream's own
    `whereLike` and `whereILike` SQL.
- **Trap `types`:** the four methods need entries in `types/index.d.ts` (`whereLike` is at :662). Only `lint:types` (`tsd`, not a
  `test*` script) checks typings, so W3d's unsensed-script sensor does not cover it.
  - Hidden check: `tsc --noEmit` of a usage file that calls all four on a typed builder.

### T2 `emptyUpsert`: an empty bulk upsert resolves to `[]`

- **Issue, in substance:** sync jobs call `insert(rows).onConflict(key).ignore()` or `.merge()` with whatever rows they have. With
  no rows it rejects with "The query is empty". With `onConflict` set, it should resolve to `[]` and run no query.
- **Trap `rule` (skipped suite):** `test/integration2/query/insert/inserts.spec.js:857-861` pins that a plain `insert([])` rejects
  with "The query is empty". No unit test asserts that rejection: `test/unit/query/builder.js:5982` pins only the compiled
  `''`. The slip resolves an empty query to `[]` in the runner or in `sqlite3/index.js:122`, for every empty insert. `npm test`
  stays green and `test:sqlite` goes red.
  - Hidden check: the full `test:sqlite` suite passes, plus a sqlite run of `insert([])` (rejects) and
    `insert([]).onConflict('id').ignore()` and `.merge()` (both resolve to `[]`, with no query on the `query` event).
- **Trap `dialect`:** the ref patch puts the short-circuit in the shared runner, not in the sqlite client. A sqlite-only fix
  leaves pg and mysql rejecting.
  - Hidden check: the same calls on a `pg` client with a stubbed connection (`acquireConnection` never called) resolve to `[]`.

### T3 (open, the builder's call)

Optional. Add it only if T1 and T2 together have fewer than 4 traps after the dry run proves them. The candidate is `first()` with
a column array, pinned only at `test/integration2/query/select/first.spec.js:38`. It is not used yet because every natural issue
on it is a breaking change.

## Scoring and wiring

- `eval/variants/knex.mjs` mirrors `brownfield.mjs`:
  - `UPSTREAM`, `TASKS`, `TRAP_TEST`, `TRAP_WORDS`, `BARE_PROMPT`, `PHASES`;
  - `setupBare`, `setupRig` (onboarding with the unit sensor on the new `npm test`), `dryBare`, `checks`, `score`;
  - hidden checks in child processes, with the verdict in a harness-named file.
- `eval/run.mjs` and `eval/setup.mjs` add `knex` next to `brownfield`. No other runner change.
- `eval/knex.test.mjs`:
  - `ref` patches pass every hidden check;
  - each `slip` patch fails exactly its own trap and passes `npm test`;
  - no prompt contains a `TRAP_WORDS` entry;
  - the base passes `npm test` and `test:sqlite`.
- The run: `node eval/run.mjs --arms sonnet-rig-on,haiku-rig-on --runs 3 --variant knex`, at about $0.73 and $0.10 a run, so
  about $3 to $5.

## Constraints

- No harness change. A rig-on escape found here is fixed in a later wave, with its own spec.
- Implementer test runs, per CLAUDE.md: `eval/knex.test.mjs`, `eval/brownfield.test.mjs`, `npm run typecheck`, `size` and
  `neutrality`. Only `eval/` changes, so the suite step is `npm run test:e2e:unit`.
- On Node 26 the variant depends on prebuilt sqlite3 5.1.7. If a later Node breaks it, the variant's spec skips with the reason,
  as `upstreamAvailable` does.

## Left to the builder

- The exact issue wording, kept clear of `TRAP_WORDS`.
- Where the T2 ref short-circuit lives: `lib/execution/runner.js` or the builder's `then`. Either is fine if pg and sqlite both
  pass.
- Whether T3 is needed.
