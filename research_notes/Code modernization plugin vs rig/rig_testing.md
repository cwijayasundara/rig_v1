# rig testing, evaluation and automation (repo /Users/chamindawijayasundara/Documents/learning_101/rig_v1)

All sources are local files in the repo (paths relative to the repo root), read 2026-11-03, read-only. No `npm test`, `e2e` or `eval*` was run. "Verified" = read in a file or counted by a shell command; "inference" = my reading. Since the sources are local paths, citations are file paths, not URLs.

## 1. What test layers exist, how many, what each proves, deterministic vs LLM-live

### Takeaway
rig has a large, mostly deterministic test pyramid (88 spec files, 34 e2e/eval unit tests, a scripted journey replayed from recorded snapshots) plus a separate, paid, person-started LLM layer (live journey, paired evals, review/chart/wiki/learn/app evals). The deterministic layers prove that scripts, gates and skill TEXT behave as specified; only the live layers touch whether the model, following the skill prompts, produces good output.

### Cited Findings
- `npm test` = `scripts/*.spec.ts` + `test:e2e:unit` + `e2e:scripted` + `test:e2e:parallel`; `typecheck` is `tsc -p scripts/tsconfig.json` — `package.json` (scripts block).
- Layer 1, spec files: 88 files `scripts/*.spec.ts`, 14,104 lines; harness source `scripts/*.ts` non-spec 8,648 lines (shell counts). Run with `node --test`. Cover sensors, registry, hooks, gates, chart/PRD parsers (`chartcheck`, `prdformat`, `prdcoverage`), learn, wiki, pr body, upgrade, stack packs, vendoring, permissions, model state, etc. (file names listed by `ls scripts/*.spec.ts`).
- Size cap enforced as a test: `scripts/size.spec.ts`; `docs/GOAL.md` states 8,000-line harness cap ("Thinness" bullet).
- Sensors must be able to fail: `scripts/seeded.spec.ts` header "A sensor that cannot fail is not a check. Every built-in either rejects a seeded violation here or names the spec that does." Also `scripts/selftest.spec.ts`, `scripts/sensors.spec.ts`, `scripts/stackpacks.spec.ts`.
- Layer 2, e2e/eval unit tests: 34 `*.test.mjs` files, 2,771 lines, under `tests/e2e/{lib,driver,assert,journey}` and `eval/` (find count); run by `test:e2e:unit`. They test the e2e machinery itself (sandbox, merge, gates, inspector parsing, violations, snapshot packing, eval scoring/gating).
- Layer 3, scripted journey `npm run e2e:scripted` = `node tests/e2e/run.mjs --driver scripted --no-notify`: replays recorded snapshots and verdicts at $0, plus scripted-only "Node shop" extras (`tests/e2e/extras.mjs`, `tests/e2e/acceptance/shop*.mjs`, fixtures `tests/e2e/fixtures/shop`, `remove`) — `README.md` (~line 465-467); `.github/workflows/ci.yml` comment: "a fake model, $0: install, brief, two changes through approval, verify and PR (with the contract stage and an HTTP acceptance), the deploy gate and the policy stage".
- Layer 3b, `test:e2e:parallel` (`tests/e2e/parallel.mjs`): two instances in two worktrees at once with scripted model, checks no interference — ci.yml comment.
- Layer 3c, `test:e2e:stacks` (`tests/e2e/stacks.mjs`, fixtures `tests/e2e/fixtures/stacks/{node,go,java-maven,dotnet,rust}`): each stack pack onboards a tiny repo and `check --at commit` must block a broken edit on its core sensor; `--require all` fails if a toolchain is missing — ci.yml `e2e-stacks` job. Not part of `npm test`.
- Layer 4, live journey `npm run e2e` = `node tests/e2e/run.mjs --driver live --mode fast`: Library Desk sprint 1 (greenfield) and sprint 2 (brownfield); each stage "acts (Haiku, live), passes deterministic gates, then a Sonnet inspector judges the artefacts against a rubric"; every violation logged and alerted; "the run never fixes anything" — header of `tests/e2e/run.mjs`. Stages J0..J6 (init, chart, approve, build, ...) with rubrics `tests/e2e/journey/rubrics/J0..J6.md` (7 files; e.g. J3.md has [block]/[warn] items such as "loan limit defined in exactly one place", "no test is a tautology", "storage writes are atomic"). Modes in `tests/e2e/journey/legs.mjs`: fast (J3 from J2 snapshot, J6 from J5 snapshot; 20 min cap, 1 intent), chart (30 min), full (70 min, whole journey, how snapshots are recorded). `CLAUDE.md`: "20 minute hard deadline ... costs money, started by a person".
- Recorded data: `tests/e2e/journey/recorded/` = 63 files / 5,239 lines / 1.1 MB: `real/` (only `snapshots/J2.tar.gz`, `verdicts/J1.json`, `J2.json`, `decisions.json` — and git status shows `real/verdicts/J0.json` deleted/uncommitted), `synthetic/` (verdicts J0-J6, `gates.json`, `decisions.json`), `bad/` (5 seeded-bad cases: chart-missing-ac, limit-hardcoded-twice, report-writes-file, tautological-test, unchanged-test-edited). Snapshot = tarball of sandbox repo with history (`tests/e2e/journey/snapshot.mjs`).
- Approval reviewer stand-in (may reject): `tests/e2e/journey/reviewer.mjs`; inspector: `tests/e2e/journey/inspector.mjs`; violation log + triage: `tests/e2e/journey/violations.mjs`, `alert.mjs`.
- triage.json: `tests/e2e/journey/triage.json` is currently `{}` (1 line). Schema `{ "<id>": { decision: fix|accept|wontfix, reason? } }`; "Only the person edits the file"; accepted/wontfix violations are still listed but don't halt (`violations.mjs`; design in `docs/superpowers/specs/2026-10-31-journey-e2e-design.md` line ~70).
- Layer 5, paired eval `npm run eval` (`eval/run.mjs`): arms in `eval/arms.mjs` (haiku-rig, haiku-bare, sonnet-bare, opus-bare, haiku-rig-arch, haiku-rig-full, haiku-low-bare, haiku-low-rig, haiku-rig-final); variants `eval/variants/{links,rules,pricing,contract}`; shuffled arm order from a recorded seed; scored by `eval/score.mjs`: `npm test`, hidden acceptance (import + HTTP), and rig's built-in tamper sensors over the run's commits, in detached worktrees, model code only in time-limited child processes. Scored "by running, never by a model". Metrics: accepted rate, dollars per accepted task, minutes, denials.
- Other evals (all `package.json` scripts, each has `:dry` and a `*.test.mjs`): `eval:review` (seeded-defect review; match by file + pattern, "never a model's judgement"; cases `eval/review/cases.mjs`, `cart-cases.mjs`), `eval:chart` (chart vs answer key `eval/fixtures/chart/sprint-a|b.json`: recall, invented-intent rate; Opus vs Sonnet architect), `eval:app` (does /rig-app write a driver that runs green, is approvable, and fails on 2 seeded breaks; scored by running), `eval:learn` (recurrence of a seeded mistake with/without the lesson; regex score), `eval:wiki` (wiki vs native Read/Grep on 8 questions; exact-match scoring; verdict rule "wiki beats native" needs +2), `eval:ablate` (remove one component, history in `eval/ablation.json`, verdict keep/candidate/cut-eligible; `eval/ablation-tags.json`), `eval:journey` (the journey run N times per arm scored by inspector verdicts; `eval/journey-baseline.json`).
- Fixtures/sample repos: `tests/e2e/fixtures/{shop,remove,journeys,parallel,stacks,tooling}` (shop 10 files/235 lines; remove 6/152; stacks 15/53; journeys 7/64; parallel 2/12; tooling 1/110), `tests/fixtures` (3 files), `eval/fixtures` (84 files / 1,610 lines: chart, learn, review-cart, review-cart-cli, wiki), `eval/variants` (42 files / 2,234 lines), `tests/e2e/prd` (14/426), `tests/e2e/phases` (7/314), `tests/e2e/journey/prd` (4/348). Review-eval real-code cases use `shop_app` cart-cli at commit 26f1105 (Python) — `eval/review.mjs`.
- Other counts: `eval/results/` 25 files / 561 lines (2026-10-16 .. 2026-10-31 pilots, paired, links, review, chart-brief, learn, app); `tests/e2e/out/` 98 run dirs, 88 MB (local run output, tracked by git? not verified); 17 skills (`ls skills`: app approve arch autonomy build chart init learn plan pr rule start test testplan upgrade waive wiki), 2 agents (`agents/architect.md`, `evaluator.md`), 1,185 commits on `git log`.
- How skill (prompt) text is verified deterministically: "skill-text pickups" specs pin that rules stay in the skill — `scripts/skilltext.spec.ts` ("the rules live in the skills, so a spec pins that they stay there"; regex matches on `skills/plan/SKILL.md` etc.), `chartskill.spec.ts`, `initskill.spec.ts`, `prskill.spec.ts`, `upgradeskill.spec.ts`, `skilltools.spec.ts`, `reviewbrief.spec.ts`. These are grep-style assertions on text, not behavioural proof.
- How skill output is verified behaviourally: (a) scripted-model e2e flows and generated-artifact checkers (`scripts/chartcheck.ts`, `prdformat.ts`, `prdcoverage`, `sdlc.ts check`, `prd map`) that machine-check what a skill wrote (citations, ledger coverage, sources hash-checked); (b) the live journey with Sonnet inspector against rubrics (LLM-as-judge, with deterministic gates first); (c) `eval:chart`, `eval:app`, `eval:review`, `eval:learn`, `eval:wiki` for specific skills (chart, app, pr review, learn, wiki), scored mostly by script, not by a model; (d) CLAUDE.md rule "Sonnet output is always evaluated by Opus".
- Regression gating in CI: `eval/gate.mjs` compares live paired-eval rows to `eval/baseline.json` (`{variant:{arm:{minRuns,minAcceptedRate,maxUsdPerAccepted}}}`); an arm with no baseline is "listed as not enforced, never silently passed". `eval/baseline.json` content is `{}` and `eval/journey-baseline.json` content is `{}` (verified by cat; `docs/GOAL.md` Scope 4 says "still empty"). So the gate currently enforces nothing.

### Inferences
- Deterministic coverage of the harness code is dense (≈14k spec lines vs ≈8.6k source lines, ~1.6:1), but evidence that the skill prompts improve model output rests on a handful of paid runs, most with null or negative results (see Q3).
- Skill-text specs guard against prompt-text drift/regression of required clauses, not against the model misreading them.
- The live journey checks one product domain (Library Desk, Python) with one recorded real snapshot (only `J2.tar.gz` under `real/`), so replayed "scripted" runs mostly test the pipeline, not fresh model behaviour.

### Gaps
- Pass/fail counts of the specs were not measured (tests not run per instructions). Whether `tests/e2e/out/` (88 MB) is gitignored was not checked.
- Why `recorded/real/verdicts/J0.json` is deleted in working tree (git status `D`) is unknown.

## 2. What CI runs and does not run

### Takeaway
CI (`.github/workflows/ci.yml`) runs typecheck, all specs on a 3-OS x 2-Node matrix, scripted e2e, dry evals and stack-pack tests at $0; the live paired eval is a separate nightly/manual workflow (`eval.yml`) with a $15 cap whose regression gate has no baselines.

### Cited Findings
- `ci.yml` (on push and pull_request, read-only permissions): job `core` = matrix ubuntu/macos/windows x Node 22.18/24: `git config core.autocrlf false`, `npm ci`, `npm run typecheck`, `node --test scripts/*.spec.ts`. Job `e2e-fast` = ubuntu + macos, Node 22.18: `test:e2e:unit`, `e2e:scripted`, `test:e2e:parallel`, and on ubuntu only `eval:dry`, `eval:review:dry`, `eval:app:dry`, `eval:journey:dry` ("the eval pipeline replayed from fixtures at $0; live evals are run by a person"). Job `e2e-stacks` = ubuntu with Go 1.22, Java 17, .NET 8, Rust stable, Semgrep 1.182.1: `test:e2e:stacks -- --require all` ("no silent skips here").
- `eval.yml`: schedule cron `17 5 * * *` + `workflow_dispatch`; job `dry` (eval:dry, review:dry, app:dry); job `live` only on `refs/heads/main`, `needs: dry`, 90 min timeout, installs `@anthropic-ai/claude-code`, runs `node eval/run.mjs --variant links --arms haiku-bare,haiku-rig --runs 3 --cap-run 4 --cap-total 15`, then `node eval/gate.mjs ... --variant links`, uploads `paired.jsonl`. Never on pull requests (holds `ANTHROPIC_API_KEY`).
- `scripts/evalworkflow.spec.ts` and `scripts/workflows.spec.ts` exist, presumably pinning workflow content (names only seen; contents not read).
- Not in CI: `npm run e2e` (live journey), `eval:journey` live, `eval:chart`, `eval:wiki`, `eval:learn`, `eval:ablate`, live `eval:review`/`eval:app`, `npm run validate` (`claude plugin validate`). `eval:chart:dry`, `eval:wiki:dry`, `eval:learn:dry`, `eval:ablate:dry` are not invoked by ci.yml directly (ablate dry is covered via `eval/ablation.test.mjs` in test:e2e:unit per ci.yml comment; chart/wiki/learn have `*.test.mjs` run in test:e2e:unit — inference from `eval/*.test.mjs` glob). The nightly live eval covers only the `links` variant with haiku arms.
- Target-repo CI templates shipped by rig: `templates/rig-check.yml`, `templates/rig-maintain.yml` (nightly, off until `RIG_MAINTAIN` set, max one PR/day) — `docs/GOAL.md` Scope 5. `docs/GOAL.md`: "there is no `claude-code-action` workflow".
- Windows CI was a long-running red: fixed in 3 waves (MEMORY.md "Windows CI", merged efecbc9 2026-10-29) — memory index, secondary source.

### Inferences
- Because `eval/baseline.json` is `{}`, the nightly job's "Regression gate" step passes with every arm "not enforced"; nothing blocks on quality regression, only on infrastructure failures. (Gate logic read in `eval/gate.mjs`; baseline value verified.)
- The e2e live legs and skill-quality evals are manual by design (cost control), so skill regressions can merge undetected by CI.

### Gaps
- Whether nightly `eval.yml` has actually been run in GitHub (secret configured, results) is not visible locally.

## 3. Evidence on whether skills/rig actually work: results, cost, runtime, flaky points

### Takeaway
The recorded evals show no quality lift from rig over plain Claude on the tested tasks, at roughly 3x cost and 3x time vs Haiku; the review eval is saturated (cannot discriminate); the project itself states the gate to "production ready" is unmet.

### Cited Findings
- `docs/GOAL.md` line 8: "Status 2026-10-31: no eval has shown a lift over plain Claude Code yet. On the tasks tried the bare models pass, and rig costs about 3x plain Haiku and takes about 3x as long." Gate section: "Today there is no evidence: pilot 2 (n = 1 per arm) scored 1/3 on every arm, and Haiku with rig cost $0.50 against $0.02 bare."
- `README.md` "Is it worth using?" (measured 2026-10-31, `eval/results/2026-10-31-*.jsonl`): rig+Haiku $0.087/task, 8.2 min, 3/3 hidden acceptance; plain Haiku $0.032, 2.4 min, 3/3; plain Sonnet $0.212, 0.9 min, 3/3. "rig gives no better code and no speed ... What the extra cost buys is a trail and a set of gates." Across three hard tasks plain Haiku, low-effort Haiku and plain Sonnet failed 1 of 27.
- `eval/results/2026-10-21-paired.md`: haiku-rig 1/2 vs haiku-bare 2/2; $0.28 vs $0.02 per run; 8.2 vs 1.9 min; 4-7 permission denials per rig run; failure was a harness fault ("approve refused: resolve the open question(s) first"); n<3 "direction only".
- `docs/HISTORY.md` ~line 182 (harder-eval design 2026-10-21): "Every paired eval ended in a tie ... rig costing about 25x more as first reported (about 14x after the 81aa700 cost fix) and taking about 7x longer"; the `rules` variant (B8/B9, n=5, ~$15, decision rule: rig lifts if beats bare by >=2 of 5) "live run has not happened" at that doc's time. Cost double-count bug fixed (`sinceSession` in `tests/e2e/assert/process.mjs`, 0f6f94b) — HISTORY.md ~line 88.
- Review eval `eval/results/2026-10-29-review.md`: 72 calls, $5.61 (Sonnet $1.82, Opus $3.79); both models 100% recall on all 12 cases incl. hard, 0 findings on clean controls; "Gate not met ... the eval still cannot rank reviewers." HISTORY.md line ~77: later real-code run — Opus raised the unseeded storage fsync bug 17/24 vs Sonnet 6/24; cost per call Sonnet $0.056 (cv 78%), Opus $0.127 (cv 73%) (HISTORY.md ~line 85).
- Learn eval: first live pass 2026-10-17, Haiku, 3 runs, $0.33, seeded mistake recurred 3/3 baseline vs 0/3 with loop, but the cost rule was changed afterwards so "counts as one of the two" passes (`docs/GOAL.md` ~lines 80-83). Wiki: native Read/Grep tied 6/6 on a small repo (GOAL.md Scope 3).
- Whole-repo build cost: "one week of building this repo cost $1k and 3 hours per change" — `CLAUDE.md`, cause analysis in `docs/proposals/2026-10-08-why-slow-and-the-fix.md` (now deleted; compressed in `docs/HISTORY.md` line ~25-29, recover with `git show 81aa700:docs/proposals/2026-10-08-why-slow-and-the-fix.md`). Causes by cost: security-guidance plugin Opus review on every Stop/commit/push; superpowers subagent-driven loop (implement+review per task). Not rig's own hooks.
- Targets: "under 45 minutes and under $8 for a Spec-2-sized change; first-call context under 20k tokens" — `docs/GOAL.md`. Live journey: 20-min hard deadline (fast mode), 70 min full mode, `e2e:record` "hour-plus" (CLAUDE.md, legs.mjs). Default journey caps: `--cap-run 25`, `--cap-total 60`, `--minutes 20` in `eval/journey.mjs`; paired CI caps `--cap-run 4 --cap-total 15`.
- Only one proposal remains in `docs/proposals/`: `2026-11-03-prd-sufficiency-and-provenance.md` (the others compressed into `docs/HISTORY.md`, 355 lines). It proposes deterministic checks (`prd coverage`, provenance markers, "unattributed" block finding) and says "Eval before keeping (project rule): a synthetic agent-PRD fixture with known topics deleted" with metrics recall, false-absent rate, questions per chart, cost delta. Its own gap table says fidelity is "Strong" but sufficiency/provenance weak. Steps 1-2 since merged (MEMORY.md; git log fdff8b9, 6b6e890).
- Flaky/fragile points named in code/docs: LLM judge variance — journey spec plans "inspector agreement (run the inspector twice on the same snapshot ... so a flaky judge is visible)" (`docs/superpowers/specs/2026-10-31-journey-e2e-design.md` line ~157; `--agreement` flag in `eval/journey.mjs`); eval cost variance cv 73-78% => "smallest detectable cost change ~40%" (HISTORY.md ~line 85); n=3 "could not separate anything" (harder-eval design); unattended runs depend on whether the model leaves an open question (paired.md); Windows runner autocrlf and line-ending issues (ci.yml comments); `eval/score.mjs` uses process-group kill timeouts to guard hanging suites; snapshots must be re-recorded "only when rig's chart format changes" (README ~line 466) so recorded verdicts can go stale.
- Seeded-bad inspector check: `eval:journey -- --dry-check` replays 5 seeded-bad cases; header notes "a live check of the inspector itself needs seeded-bad snapshots, recorded after the first good live run" — i.e. the inspector's real discrimination is not yet live-verified (`eval/journey.mjs` header).

### Inferences
- The evaluation machinery is sophisticated (paired arms, hidden acceptance, tamper sensors, cost caps, ablation with verdict rules) but the benchmark tasks are inside what Haiku does unaided (ceiling effect), so measured lift is ~0. Review eval also saturated. The honest status: strong process, no demonstrated quality improvement.
- Cost/runtime of rig runs is dominated by multi-stage skill choreography and model mix (62% Haiku / 38% Sonnet by cost in paired.md).

### Gaps
- No journey-eval results file exists in `eval/results/` (no `*journey*` listing), so live journey eval pass rates, cost per run and inspector agreement are unknown/not recorded. Cost/duration of a full `npm run e2e` run is only stated as a cap (20 min), not a measured figure; look in `tests/e2e/out/*/` (98 dirs) for reports if needed.
- `docs/research/` (cited by GOAL.md) was not present in `ls docs` output (docs has only GOAL, HISTORY, feedback, prds, proposals, superpowers) — referenced research files are absent locally.
- Outcome of the nightly `eval.yml` runs and whether `eval/results/2026-10-31-*` ever got a committed baseline is unknown (baseline `{}`).

## 4. Counts summary (shell-verified)

| Category | Files | Lines |
|---|---|---|
| `scripts/*.spec.ts` | 88 | 14,104 |
| `scripts/*.ts` non-spec | (151 total entries in scripts incl. specs) | 8,648 |
| e2e + eval `*.test.mjs` | 34 | 2,771 |
| `tests/e2e/fixtures/*` | shop 10, remove 6, stacks 15, journeys 7, parallel 2, tooling 1 | 235 / 152 / 53 / 64 / 12 / 110 |
| `tests/fixtures` | 3 | 54 |
| `eval/fixtures` | 84 | 1,610 |
| `eval/variants` | 42 | 2,234 |
| `eval/results` | 25 | 561 |
| `eval/lib` + review cases | 2 + 2 | 42 + 201 |
| `tests/e2e/journey/recorded` | 63 | 5,239 (1.1 MB) |
| `tests/e2e/journey/rubrics` | 7 | 69 |
| `tests/e2e/prd`, `phases`, `journey/prd` | 14, 7, 4 | 426, 314, 348 |
| `tests/e2e/out` (run output) | 98 dirs | 88 MB |
| skills / agents / hook files | 17 / 2 / 3 | not counted |
| CI workflows | 2 (`ci.yml`, `eval.yml`) | — |

## Top gaps for the report writer (inference, grounded above)
1. Regression gate is inert: `eval/baseline.json` and `eval/journey-baseline.json` are `{}`; triage.json is `{}`.
2. No measured quality lift; evals saturate at the tested difficulty; harder `rules` variant live result not found in `eval/results`.
3. Live journey and skill-level evals (chart, wiki, learn, app, journey) are not run in CI; only dry replays.
4. Skill prompts are verified by regex-on-text specs plus a few paid evals; no per-skill pass-rate baseline tracked over time.
5. Only one real recorded snapshot (J2) so most "scripted" e2e verifies plumbing.
