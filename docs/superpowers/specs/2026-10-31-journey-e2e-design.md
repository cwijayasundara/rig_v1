# One journey e2e: drive rig step by step, inspect behind the scenes

Status: implemented on feat/journey-e2e · 2026-10-31 (first live run and snapshot recording pending; legacy Node shop phases kept as scripted extras)

## Intent

Today the person checks that rig works by hand: make a repo, load the plugin, run `/rig:init --quick`, `/rig-chart 1 @docs/prd/sprint-1-cart-add-remove.md`, `/rig:approve`, `/rig-start <intent>`, approve the PR, repeat for sprint 2 on the same repo, then open the repo in Claude Code and have it inspect the generated artefacts. That takes hours, and the inspection is the part that finds the bugs.

Build **one command** that does the same thing: run a rig step with a real model, then run an independent inspector over the sandbox repo, then decide whether to continue. One run proves rig behaves as designed for greenfield (sprint 1) and brownfield (sprint 2, on the code sprint 1 produced).

## Goals

1. `npm run e2e` runs the whole journey and exits non-zero if any blocking item fails. Report at the end, sandbox kept.
2. Greenfield and brownfield are two legs of one journey on one repo, as in the manual run.
3. After every step, a read-only Claude inspector judges what code cannot (is the chart faithful to the PRD, does the wiki cite real code, did anything outside the intent change). Cheap deterministic checks run first and gate the inspector.
4. Replace the separate e2e entry points with this one (see Consolidation).
5. An eval (`npm run eval:journey`) runs the same journey N times per arm and scores the inspector's verdicts, so harness changes are measured, not eyeballed.

## Non-goals

- Not a replacement for `npm test` unit specs. Scripts keep their `*.spec.ts`.
- No new assertions about prose style. The inspector checks the rubric, nothing else.
- No PR to a real GitHub remote. The existing `gh` stub stays.
- Not a rig-vs-bare comparison. `eval/run.mjs` keeps that job.

Anti-goal: a journey that passes while the artefacts are wrong. A rubric item with no evidence cited counts as a failure.

## The journey

Inputs are two PRDs written for this suite (see "The PRDs"), frozen in `tests/e2e/journey/prd/` as `sprint-1-library-desk.md` and `sprint-2-library-desk-changes.md`, plus rig's `prd-template.md`. The earlier cart PRDs are not used and not restricted to. The target stack is Python and pytest (my call). Sandbox: a fresh temp dir with `git init`, the PRDs copied to `docs/prd/`, and the plugin loaded with `--plugin-dir` (as the manual run does).

| Stage | Act (real `claude -p`, Haiku) | Deterministic gate | Inspector rubric (Sonnet) |
|---|---|---|---|
| J0 init | `/rig:init --quick` | `onboarding` asserts (existing), settings valid, `.rig/` present, tree clean after commit | Scaffold matches the repo (stack detected, README block, sensors.json sane); nothing stray |
| J1 chart sprint 1 | `/rig-chart 1 @docs/prd/sprint-1-library-desk.md` | `sdlc chart check 1 --cases --json` has no `block` finding | Every FR/AC in the PRD appears in `requirements.md`; every intent behaviour cites one; cases cover every AC; five intents with the dependency graph the PRD implies (two independent roots, a join, a final CLI); every prose business rule quoted and cited by a behaviour; non-goals respected |
| J2 approve | A **reviewer agent** (Sonnet, read-only) reads the chart and returns approve or reject with reasons. On approve, the runner runs `/rig:approve chart-1` with `SDLC_HUMAN=1` on the reviewer's behalf; on reject, the stage fails and the reasons are logged as violations | `approval.json` exists, chart not stale | The reviewer's decision matches the chart's actual state (a seeded-bad chart must be rejected) |
| J3 build, per intent | `/rig-start .rig/product/sprints/sprint-1/intents/<intent>.md`, then the build, verify and PR steps rig asks for, then merge | `pytest` green in the sandbox, AC→test gate passed, change record closed, only the intent's files touched | Tests really assert the ACs (not tautologies); code matches the intent; no scope creep beyond non-goals |
| J4 chart sprint 2 (brownfield) | `/rig-chart 2 @docs/prd/sprint-2-library-desk-changes.md` | chart check clean | Chart marks each FR as unchanged, modified or new exactly as the PRD's delta table says; intents touch only what the delta needs; unchanged sprint 1 behaviour is listed as must-not-change; the one removed behaviour is handled as a removal, not left behind |
| J5 approve sprint 2 | as J2 | as J2 | as J2 |
| J6 build sprint 2 intents | as J3 | as J3, plus **tests for unchanged sprint 1 ACs are byte-identical** (`git diff` empty on them), tests for modified ACs changed only where the delta says, and all other sprint 1 tests still pass | Read-only reports never write the data file; the wiki and `## Access` reflect the existing code; the file format is still readable by sprint 1 data (migration, not breakage); the modified rule is changed in one place, not copied |

Default scope for J3 and J6 is every intent of the sprint in dependency order. `--intents N` limits it to the first N (the person's manual run is `--intents 1`). `--from J4` resumes from a kept sandbox.

A step that fails a **blocking** item stops the journey and the report says which stage and which item. Later stages are marked `not run`, so a broken chart never wastes the build budget.

## Fully automated: no person in the loop

The run never waits for a person. Every point where the manual flow has a human is played by an agent:

- **Approvals** (chart approve for each sprint, the PR approve at the end of each intent): the reviewer agent decides. The runner then supplies `SDLC_HUMAN=1` for that one command, in the sandbox only, and records "approved by reviewer agent" with its reasons in the report. The human-only gate itself stays tested: the scripted negative checks still assert `approve` exits 3 without `SDLC_HUMAN`. The reviewer can and must reject a bad artefact; seeded-bad snapshots prove it does.
- **Questions rig asks** (the "edge cases asked once at chart" step, a stop for `/rig:build`): the driver answers from a fixed answer file in `journey/answers/`, or, if absent, the reviewer agent answers. An unanswerable question is itself a violation.
- No step prompts for input. A step that blocks on input hits its timeout and is logged as a violation (`stuck-on-input`).

## Violations: log, alert, and the person decides

The suite finds and reports. It never fixes anything, in the sandbox or in this repo.

A **violation** is any failed or warned rubric item, any failed deterministic check, a reviewer rejection, a stuck step, a spend-cap or time-budget breach, or a harness rule broken during the run (a hook bypass, a `--no-verify`, a change outside the intent, a sprint-1 test edited). Each is one line in `out/<timestamp>/violations.jsonl`:

```
{ "id": "J6.4-reads-write-file", "stage": "J6", "item": "J6.4", "severity": "block|warn",
  "evidence": "src/library/reports.py:42 writes the data file in overdue_report()", "sandbox": "<path>",
  "session": "sessions/09-J6.jsonl", "area": "skill:rig-build | script | template | hook | unknown", "run": "<timestamp>" }
```

`area` is the inspector's guess at where the harness cause lives, to speed triage (never trusted as fact).

**Alerting** (my call; change if you want another channel): at the end of every run, even a green one, the terminal prints a one-screen summary (stages, violation count by severity, the top five with evidence) and the path to `violations.md`. If there is any violation the exit code is non-zero, the terminal bell rings, and on macOS a notification fires (`osascript`). `out/latest` always points at the newest run. When `npm run e2e` is started from a Claude Code session, the session tells you in its reply.

**Triage:** `tests/e2e/journey/triage.json` holds your decisions, keyed by violation id: `fix` (becomes a task), `accept` (known and fine, with a reason), `wontfix`. A later run still lists accepted violations but marks them `accepted` and does not alert or fail on them; a new id alerts. A `fix` decision is handled outside the suite, the CLAUDE.md way: fix the harness here, add a spec that fails without the fix, re-run the journey. Nothing in the suite edits `triage.json`; only you do.

## The PRDs

Both are written in rig's PRD template (numbered FRs with Given/When/Then ACs, NFRs, non-goals, a delta table in sprint 2). They are designed to exercise more of rig than the cart pair did: a dependency graph with a join, rules stated in prose, an ambiguity, a modified rule, a removal and a regression trap. I write them as the first implementation task and you review them before they are frozen. Domain: **Library Desk**, a command-line tool for a small library desk (my call; it has rules, state and time, and no UI).

**Sprint 1 (greenfield), five intents:**

| Intent | Requirements | Depends on |
|---|---|---|
| `storage` | FR-1 one JSON data file, atomic writes, `--file`/`LIBRARY_FILE`; NFR: a crash mid-write never corrupts the file | none |
| `catalogue` | FR-2 add a book (isbn, title, copies), FR-3 find by isbn, FR-4 reject a duplicate isbn and a non-positive copies count | storage |
| `members` | FR-5 register a member (id, name), FR-6 reject duplicate ids | storage |
| `loans` | FR-7 check out (a copy must be free; **a member may hold at most 3 loans**; due date is **14 days** after checkout), FR-8 return (frees the copy; returning a book not on loan is an error with a specific message), FR-9 a book's available count never goes below 0 or above its copies | catalogue, members |
| `cli` | FR-10 `library` command with the above as subcommands, exit codes 0/1/2, `--help` | loans |

The dependency graph has two parallel roots' worth of work (catalogue and members both only need storage) and a join (loans). The loan limit and the loan period are stated once in prose in a "Business rules" section, not as ACs, so the chart must quote them and trace them. One sentence is deliberately ambiguous ("a member with an overdue loan cannot borrow") with no definition of overdue yet: the chart should ask about it once, and `journey/answers/` answers "overdue means past the due date, checked at checkout time". An open question is listed. Non-goals: fines, reservations, multiple branches, accounts or passwords, any UI.

**Sprint 2 (brownfield), a change set on the sprint 1 code:**

| Change | Kind | Detail |
|---|---|---|
| Loan period | modified | 14 days becomes 21 days (FR-7 AC changes; the rule must change in one place) |
| Loan limit | modified | 3 becomes 5 for members flagged `staff` (new optional field on members, old data files without it must still load) |
| Return of a book not on loan | modified | message text changes; its sprint 1 test is expected to change, nothing else may |
| Overdue report | new | `library overdue --on DATE` lists loans past due, oldest first; read-only |
| Renew a loan | new | extends the due date by the loan period once; second renew is refused |
| `catalogue` removal of a book | new | remove a book only when no copies are on loan |
| Legacy `--json` flag on `find` | removed | the flag from sprint 1 FR-3 is deleted; the chart must schedule its removal and its tests |
| Regression guard | unchanged | all of FR-1, FR-2, FR-4 to FR-6, FR-9, FR-10 and the file format stay as they are |

This makes the brownfield leg test: modification in one place, schema migration, a deliberate test change limited to one AC, a removal, new read-only and write behaviour, and must-not-change enforcement.

## The inspector

A fresh `claude -p` session per stage, read-only (Read, Grep, Glob, and Bash limited to `git`, `pytest`, `cat`), model Sonnet 5.5 (the person chose Sonnet to keep cost down; this overrides the CLAUDE.md "Opus evaluates" rule for this suite, and the seeded-bad checks are what show whether Sonnet is strong enough). It is given the sandbox path, the stage id and a rubric file `tests/e2e/journey/rubrics/<stage>.md`. It must return JSON matching a schema:

```
{ "stage": "J1", "items": [ { "id": "J1.3", "verdict": "pass|fail|warn", "severity": "block|warn",
  "evidence": "path:line or command output", "note": "one line" } ] }
```

Rules the runner enforces: every item in the rubric must appear; `pass` and `fail` need evidence; an item missing or malformed is a `fail`; the inspector cannot edit (a diff of the sandbox before and after must be empty, else the stage fails). Rubrics are at most 60 lines each, a checklist of observable facts, written as the person would check them. They are the one place the person's manual inspection knowledge lives.

One inspector launch per stage, not per file: at most 7 per journey.

## Cost, time, drivers

- Act sessions: Haiku, using the existing `createSessions` spend cap. Default cap for the journey: $25 (my call, to be tuned after the first run). Wall clock budget default 20 min as a hard deadline (the person's requirement): every session timeout is capped to the time left and no session starts after it, the default scope is one intent per sprint, and `--full` (all intents) gets 60 min. An overrun is the violation `over-time-budget`.
- Inspector: Sonnet, counted in the same cap.
- `--driver scripted` ($0, runs inside `npm test`): applies recorded stage snapshots (a tarball of the sandbox after each stage, taken from a good live run) and replays recorded inspector verdicts, so the runner, rubric parsing, gating, resume and reporting are tested without a model. The existing deterministic assertions run for real on the snapshots.
- `--driver live` is the default of `npm run e2e`. Recording: `npm run e2e -- --record` saves snapshots and verdicts as the new scripted fixtures (a person reviews the diff).

## Output (all under `tests/e2e/`)

```
tests/e2e/journey/prd/            frozen PRDs
tests/e2e/journey/rubrics/        J0.md ... J6.md
tests/e2e/journey/stages.mjs      the stage table above as data
tests/e2e/journey/inspector.mjs   launch, schema check, read-only guard
tests/e2e/journey/recorded/       scripted-driver snapshots and verdicts
tests/e2e/out/<timestamp>/        sandbox, sessions/*.jsonl, verdicts.json, report.md   (gitignored)
```

`report.md` lists each stage as pass, fail, warn or not-run, every rubric item with its evidence, spend and minutes per stage, and the sandbox path so the person can open it in Claude Code afterwards, as they do now.

## Modes (added after the first live runs)

Measured: init 1.5 min; `/rig-chart` 17 min on the first PRD ($2.66) and 11.5 min on the slim one with the evaluator on Sonnet ($1.45). Two charts cannot fit in 20 minutes, so the live runs are split by stage kind: `npm run e2e` (fast, 20 min) = leg J3 from the recorded J2 snapshot (approved sprint 1 chart) then leg J6 from the recorded J5 snapshot (built sprint 1 plus approved sprint 2 chart), one intent each; `npm run e2e:record` (an hour or more, one-time, not a test) = all stages from nothing; it saves the J2, J3 and J5 snapshots plus all verdicts under `journey/recorded/real/`. A mode that needs a missing snapshot refuses before spending anything.

## Consolidation

One entry point for the journey, `tests/e2e/run.mjs`, one script `npm run e2e` (live) and `npm run e2e:scripted` (inside `npm test` and the `e2e-fast` CI job). Removed scripts: `test:e2e` and `test:e2e:fast` (replaced by the two above). `.github/workflows/ci.yml` calls `test:e2e:parallel` and `test:e2e:stacks` today, so those two are **not** removed in this change; see Open for the person.

Mapping of what exists (my calls, for the builder to confirm against the code):

- S0 install → J0. S1 brief and S2/S3 shop-node greenfield and delete → superseded by J1–J3 and J6. The node shop fixtures are deleted only once nothing uses them (S4, S5 and `parallel` may; the builder greps before deleting).
- S6 chart (fixture-based CLI checks including stale-approval, untraced-behaviour and blocked-dependency cases) → kept as the deterministic gate library for J1/J2/J4/J5, plus a short scripted-only "negative checks" stage that edits an intent and expects the stale and block behaviour. These checks are cheap and have no live equivalent.
- S4 deploy gate and S5 policy → kept as scripted-only stages after J6 in the same command (no model needed).
- `parallel.mjs` (concurrent changes) and `stacks.mjs` (five language stacks) → unchanged, still run by CI. They test different things from the journey (concurrency and stack detection), so they stay separate scripted jobs unless the person says otherwise.
- `tests/e2e/lib/*` (sandbox, checks, report, flow, merge, awake, gh-stub) and `assert/*` are reused unchanged.

## Eval: `npm run eval:journey`

Same principles as the other evals (`eval/run.mjs`, `eval/chart.mjs`): arms, `--runs N`, `--dry` at $0 replaying the recorded journey, results saved under `eval/results` only on a person-started live run.

- Arms: `haiku-rig` (the default journey) and `sonnet-rig`, so a change can be tested for lift on a stronger or weaker actor. Inspector fixed at Sonnet for all arms.
- Scores per run: share of rubric items passed per stage; blocking failures; stage reached; cost; minutes; plus inspector agreement (run the inspector twice on the same snapshot on a sample and report disagreement, so a flaky judge is visible).
- Gate: `eval/gate.mjs` compares against `eval/baseline.json`; a drop in per-stage pass share beyond noise fails.
- Inspector validation (the important one): a small set of seeded-bad snapshots in `tests/e2e/journey/recorded/bad/` (a chart missing an AC, an unchanged sprint 1 test edited, a report that writes the data file, a tautological test, a loan limit hard-coded in two places). The inspector must flag each; a miss fails `eval:journey --dry-check` and means the rubric needs work. Without this a green journey proves nothing.

## Constraints

- Follow CLAUDE.md: coordinator never Opus; Sonnet is the inspector and reviewer, one launch per stage; briefs to subagents under 60 lines; `npm test` run and quoted before any claim.
- Rig stays disabled on this repo: no `.rig/` here, no change records. The sandbox is the only place rig runs.
- Fix the harness, not the output: a failure in the sandbox is fixed in skill text, script or template here, with a spec that fails without the fix, then the journey is re-run. The journey never patches the sandbox.
- Plugin is loaded with `--plugin-dir`; never registered at user scope.
- Live runs cost money: started by a person, never by CI.

## Left to the builder

- Exact rubric wording and item ids (draft from the person's own inspection habits; the person reviews).
- How `/rig:approve` and the PR approve are driven non-interactively (the existing `SDLC_HUMAN` mechanism and live driver already do this for S2/S3; reuse, with the reviewer agent's decision as the trigger).
- Snapshot format for the scripted driver (tar vs git bundle).
- Whether the inspector runs with `--permission-mode` plan or an allowlist; either is fine if the no-edit diff guard holds.

## My calls to check

0. Approvals are a reviewer agent plus `SDLC_HUMAN=1` set by the runner in the sandbox; alert channel is terminal summary, non-zero exit, bell and macOS notification; triage decisions live in `triage.json` that only you edit.

1. Python and pytest sandbox; two new PRDs written for the suite (Library Desk), replacing both the node shop and the cart PRDs.
2. Default scope is one intent per sprint (a 20 minute smoke journey), with `--full` for all intents and `--intents N` for any other number.
3. Actor Haiku 5.5, inspector and reviewer Sonnet 5.5 (the person chose this to keep cost down), one launch per stage; if the seeded-bad checks show Sonnet misses violations, escalate the inspector to Opus for those stages.
4. The $25 cap is a guess; the 20 minute budget (60 with `--full`) is the person's requirement and a hard deadline.
5. S4, S5 and the S6 negative checks stay as scripted-only stages inside the same command.
6. `parallel` and `stacks` stay as they are (CI calls them).
7. Sprint 2 runs on the same sandbox after sprint 1 merges, not on a fresh copy.

Calls made after the builder check (all mine, all changeable):

8. **Stops are detected from state, not prose.** The existing driver already works this way: `sdlc approve` refusing with "open question" triggers `driver.answer`, `sdlc status --json` shows where a change stands, and a stage continues with `claude --continue` at most 3 times before it is a `stuck-on-input` violation. The journey reuses `tests/e2e/driver/live.mjs` and `lib/flow.mjs` (they carry no Node-specific logic; only the S2/S3 phase data does) and adds chart-stage equivalents. Chart open questions are answered from `journey/answers/`, else by the reviewer agent.
9. **Severity rule.** A failed deterministic gate and any structural rubric item (coverage, traceability, no-edit guard, unchanged tests byte-identical, harness rule broken) is `block`. Judgement items (test quality, wording, scope feel) are `warn`. Each rubric item states its own severity.
10. **Scripted bootstrap.** Before the first live recording exists, `e2e:scripted` runs the runner, rubric parsing, gating, reporting and resume against small hand-made snapshots in `recorded/synthetic/`. After the first good live run, `--record` adds the real snapshots (compressed, excluding `.venv`, `__pycache__` and `node_modules`; committed). A replayed seeded-bad snapshot passes the scripted test when its recorded verdict is `fail` on the expected item.
11. **Task 0 is a spike**, before the PRDs are frozen: run `/rig:init --quick` in an empty Python repo and see what skeleton it needs. The PRDs name behaviours and modules, not file paths, so the answer cannot invalidate them.
12. **`eval:journey` has its own baseline** (`eval/journey-baseline.json`), empty at first and listed as "not enforced" until a person records one, as `eval/gate.mjs` already does for arms with no baseline. Noise: the gate needs at least 3 runs per arm and fails only on a drop of more than one blocking item or 10 points of pass share.
13. **`sonnet-rig` arm** sets both the session model and the subagent model env, so the whole actor side changes. The $25 cap is per run; `--cap-total` caps an eval.
14. **S4 and S5 run on the journey sandbox if they are stack-agnostic**, otherwise on a small fixture kept for them. The builder checks which.

## Open for the person

- `parallel` and `stacks` are two CI jobs outside the journey (call 6). You said to consolidate all e2e tests into one; I recommend keeping these two separate because they test concurrent changes and language stacks, not the greenfield-to-brownfield journey. Say so if you want them folded in or dropped.
