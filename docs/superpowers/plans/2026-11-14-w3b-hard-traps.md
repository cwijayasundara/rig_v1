# W3b: harder traps (option 1) and a brownfield eval repo (option 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** the W0 exit gate failed on 2026-11-14: bare Sonnet and bare Haiku caught all five `traps` in 6 of 6 runs
(`docs/proposals/2026-11-14-implementation-order.md`, Results). Build two harder sets, each one able to let traps through a bare
arm:
- **`hard`:** five traps on the shop that reading cannot find. Only running finds them.
- **`brownfield`:** four tasks on a real public repo, at a pinned version.

**Architecture:** both are eval variants in the shape of `eval/variants/traps.mjs`: seed, fixtures, phases, `dryOverlay`, and hidden
checks run in child processes, with the verdict passed through a harness temp file.
- **What a trap is:** a trap escapes when `npm test` passes and its hidden check fails. A trap whose behaviour test is absent goes in
  `missing`, as with `traps`.
- **One shared change:** `eval/score.mjs` and `eval/run.mjs` gain both variants. Each variant exports
  `checks(repo, opts) -> { traps, failures }` and `TRAP_TEST`, so the scorer branch stays generic.

**Tech Stack:** Node 22 ESM, `node:test`, no new dependencies in this repo. The brownfield repo brings its own dependencies, installed
in the sandbox.

**Spec:** `docs/proposals/2026-11-14-path-to-production-and-adoption.md` Phase 1 (trap classes: a rule weakened on the way to the
spec, a caller outside the obvious files, a concurrency rule, an option-parsing edge, an NFR with a number);
`docs/proposals/2026-11-14-inner-loop-from-poteto-mode.md` §6.

## Global Constraints

- **No doc pointers.** The brief and the prompts state the behaviour the way a product owner would. The rule a trap tests is either
  stated once in the brief, in plain words and not emphasised, or it lives in existing code or tests. It is never in a conventions
  doc that the prompt points to.
- **Trap words stay out of prompts.** A spec checks that no prompt contains a variant's trap words; each variant exports its own
  list.
- **Every trap is calibrated.** The reference passes, and a plausible slip fails only its own check. Every scale or NFR bound has the
  naive version at least 5 times over it, measured and asserted in a spec.
- **Same information for every arm.** Bare and rig get the same brief text and the same base repo.
- **Free versus paid.** This branch is built and proved with `--dry` and specs only. The re-gate (about $1.50 per variant: bare Sonnet
  and bare Haiku, 3 runs each) needs the person's go.
- **Size and verification.** Every file is at most 500 lines. Run only the touched specs, `scripts/size.spec.ts`,
  `scripts/neutrality.spec.ts` and `npm run eval:dry -- --variant <v> --arms haiku-rig,sonnet-bare`.

## Review Focus

- **Concurrency checks must be deterministic.** The race is forced through the seed store's async yield points, not through timing
  luck. A spec repeats the check 20 times on the reference (always passes) and on the naive version (always fails).
- **Brownfield clone without network.** Specs that need the clone skip with a stated reason when `git clone` or `npm ci` fails. No
  other spec breaks.
- **The pinned upstream version must not drift.** Clone by tag plus a sha check. A sha mismatch is an error, never a silent run on
  different code.
- **The upstream test suite must stay green in the base.** A seeded change that breaks upstream tests would make `npmTest` false for
  every arm.
- **The `hard` rule lives in a test that `npm test` does not run.** The bare arm must be able to find it by running
  `npm run test:all` (named in `package.json`). That keeps the trap findable, not hidden.

---

### Task A: the `hard` variant (option 1), the shop at B1–B14

**Files:**
- Create: `eval/variants/hard.mjs` and `eval/variants/hard/{seed,fixtures,stages}`.
- Modify: `eval/setup.mjs` (`BARE_PROMPT_HARD`, seed, dry), `eval/score.mjs` and `eval/run.mjs` (the variant list and `PHASES`).
- Test: `eval/hard.test.mjs`. This is a new file, so it does not grow `run.test.mjs`.

**Behaviours and traps:**

| B | Behaviour (brief) | Trap and hidden check | Class |
|---|---|---|---|
| B15 | `POST /orders/<id>/refund` | The refund rule lives only in `test/integration/refund-policy.test.js`, which `npm run test:all` runs and `npm test` does not: a refund more than 30 days after placement needs `x-manager: yes`, or it is 403. The check is over HTTP | a rule outside the spec |
| B16 | Prices round half-up to the cent everywhere they are shown | The seed has a second, copied rounding in `src/reports/csv.js`. The check runs the CSV export on a half-cent total | a caller outside the obvious files |
| B17 | Placing an order reserves stock; with no stock left it gives 409 | The seed store is async, with an `await` between read and write. The check sends 20 concurrent placements for 1 unit and expects exactly one 201 | concurrency |
| B18 | `GET /orders?page=` stays under 200 ms with 200 000 orders (the number is stated once in the brief) | The check seeds 200 000 orders and times 5 pages. The naive version sorts all orders on every request | an NFR with a number |
| B19 | `export --status <s>` may be given more than once (stated once in the brief) | The check passes `--status paid --status=refunded` and expects both | an option-parsing edge |

**Interfaces:**
- Exports from `hard.mjs`: `briefFor`, `PHASE_S15` to `PHASE_S19`, `dryOverlay`, `SEED`, `TRAP_TEST`, `TRAP_WORDS`, and `checks`.
- Row: `traps: { rule, caller, race, nfr, flag }`, plus `escaped` and `missing`.

- [ ] **Step 1: Write failing specs** in `eval/hard.test.mjs`:
  - `hard: seed has the integration test outside npm test and no B15–B19 code`;
  - `dry hard run: full marks, escaped 0, for a rig arm and a bare arm`;
  - `each slip fails only its own trap` (one broken reference per trap);
  - `race check: reference passes 20 of 20, naive fails 20 of 20`;
  - `nfr: naive is at least 5x over the bound`;
  - `no prompt contains a TRAP_WORDS entry`.
- [ ] **Step 2:** Confirm the specs FAIL. **Step 3:** Implement. **Step 4:** Confirm they PASS, then run the dry eval.
- [ ] **Step 5:** Commit as `feat(eval): hard variant, five traps reading cannot find (W3b option 1)`.

### Task B: the `brownfield` variant (option 2), commander.js at a pinned tag

**Files:**
- Create:
  - `eval/variants/brownfield.mjs`;
  - `eval/variants/brownfield/{tasks,patches}`: per task, a reference patch and slip patches applied with `git apply`;
  - `eval/lib/upstream.mjs`.
- Modify: `eval/setup.mjs`, `eval/score.mjs` and `eval/run.mjs`, the same three files as Task A, with one guarded line each.
- Test: `eval/brownfield.test.mjs`.

**Upstream:**
- `upstream.mjs` exports `cloneUpstream({ url, tag, sha, cacheDir }) -> dir`.
  - It runs `git clone --depth 1 --branch <tag>`, checks `rev-parse HEAD === sha`, and keeps the clone in `~/.cache/rig-eval/<name>-<sha7>`.
  - It then runs `npm ci` there.
  - Into each sandbox it copies the clone, `node_modules` included, and gives it a fresh git history whose single base commit is
    the upstream tree.
- The repo is `https://github.com/tj/commander.js` at tag `v12.1.0`. Record its sha in the module, read once with
  `git ls-remote`.
- The project is MIT-licensed and the clone is never committed into this repo.

**Tasks:** you design 4. Each is a small new feature with hidden acceptance tests (a jest or node file that the harness copies in
at scoring and the model never sees) and one seeded trap from these classes:
- a rule the upstream tests already pin, which a natural implementation breaks;
- a caller outside the obvious file (for example `lib/help.js` against `lib/command.js`);
- an option-parsing edge;
- an NFR with a number.

Each task is stated as a GitHub issue would state it: a title, a paragraph and one example, with no hint of the trap.

**Interfaces:**
- **Rig arm:** rig installs onto the cloned repo, as brownfield (onboarding with `knownRed` empty because upstream is green). Each
  task is one `/rig-start` change.
- **Bare arm:** one prompt per task, with all four tasks in one session, in the same shape as `BARE_PROMPT_TRAPS`.
- **Exports:** `TRAP_TEST`, `TRAP_WORDS` and `checks`. The row's `traps` keys are named after the tasks.

- [ ] **Step 1: Write failing specs:**
  - `upstream clone is pinned (sha mismatch throws)`
  - `base passes upstream npm test`
  - `dry brownfield run: full marks, escaped 0`
  - `each slip patch fails only its own trap`
  - `no prompt contains a TRAP_WORDS entry`
  - `offline: specs skip with a reason`
- [ ] **Step 2:** Confirm the specs FAIL. **Step 3:** Implement. **Step 4:** Confirm they PASS, then run the dry eval. If network is
  available, also run one live clone.
- [ ] **Step 5:** Commit as `feat(eval): brownfield variant on commander.js v12.1.0, four seeded-trap tasks (W3b option 2)`.

### After the branch: the person starts the re-gate

Run `--variant hard` and `--variant brownfield`, each with `--arms sonnet-bare,haiku-bare --runs 3 --cap-run 3 --cap-total 10`. A
variant passes the gate when at least 2 traps escape across its 6 runs. Only a variant that passes goes on to the W3 rig arms.
