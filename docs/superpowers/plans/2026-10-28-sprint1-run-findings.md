# Sprint 1 Run Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the eleven harness findings from the shop_app sprint-1 run so nothing found during a sprint is lost, no gate misfires, and the person stops less.

**Architecture:** Bug fixes land where the bug is (contracts.ts, model.ts, sdlc.ts, chart.ts, pr.ts). Review-item routing and change additions live in one new script, `scripts/carry.ts`, called by `S pr`. Behaviour rules the model follows go in skill text (start, plan, build, pr, chart) and `templates/review-brief.md`, each pinned by a skill-text spec.

**Tech Stack:** TypeScript on Node ≥ 22.18 (type stripping), `node:test`, the spec helpers in `scripts/testkit.ts` (`makeRepo`, `sdlc`, `hook`, `write`, `gitIn`, `approvedChange`, `verified`, `ARCH_OK`, `IMPL_OK`).

**Spec:** `docs/superpowers/specs/2026-10-28-sprint1-run-findings-design.md`

## Global Constraints

- Every fix has a spec that fails without it (CLAUDE.md "Fix the harness").
- `S` = `node --disable-warning=ExperimentalWarning <scripts>/sdlc.ts`; specs call it through `sdlc(repo, [...])`.
- Generated sections in an intent file, `## Carried in` and `## Added during the change`, are outside the chart approval hash, like `owner:`.
- Backlog file: `.rig/product/backlog.md`. Context nudge threshold: 100 000 tokens.
- `/rig-pr` never starts the next intent; it names it and stops.
- Scripts cap: `SCRIPTS_CAP` in `scripts/neutrality.spec.ts` is raised once, in Task 8, to the measured total, with a dated note in the same style as the existing ones.
- Skill text stays short: one or two sentences per rule.

## Review Focus

1. A review line with no file path (e.g. "a future CLI that prints names should strip ANSI escapes"): routed by its `→ carry: <slug>` tag, else to the backlog, never dropped. (Task 5 spec.)
2. `S pr` run twice (follow-up): routing and additions are idempotent, no duplicate C-/BL- lines. (Task 5 spec.)
3. A change not started from a charted intent (`/rig-start "<request>"`): routing sends everything to the backlog, additions are skipped, nothing throws. (Task 5 spec.)
4. A plan bullet that is prose containing a path ("- No existing test changes: tests/test_smoke.py only touches `cart.cli`") is not read as a path. (Task 3 spec.)
5. An approved chart stays approved after `S pr` writes `## Carried in` into a sibling intent. (Task 5 spec.)

---

### Task 1: Chart approval's contract registration is a sanctioned write (F1)

**Files:**
- Modify: `scripts/contracts.ts` (`registerContracts`)
- Test: `scripts/gate.spec.ts`

**Interfaces:**
- Consumes: `sanctionWrites(rels: string[]): void` from `scripts/core.ts`; `SENSORS_JSON` (`'.rig/sensors.json'`) from core.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test** in `scripts/gate.spec.ts`, beside "a harness file changed by Bash blocks at Stop":
  `test('contract files registered by sdlc in the turn are not harness-tamper', …)`: commit a registry with no contract files (`fromOld({})`), `hook(repo, 'prompt-submit', {})`, then run `registerContracts(['docs/contracts/cart.md'])` in the repo through a `spawnSync('node', ['--input-type=module', '-e', …])` import, as `designState` does in `contracts.spec.ts` (env `CLAUDE_PROJECT_DIR: repo`). Assert `.rig/sensors.json` now lists the file, and `stop().stdout` does not match `/harness-tamper/`.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test --test-name-pattern="registered by sdlc" scripts/gate.spec.ts`. Expected: FAIL (reason contains "outside Write/Edit").
- [ ] **Step 3: Implement**: in `registerContracts`, call `sanctionWrites([SENSORS_JSON])` right after `fs.writeFileSync(SENSORS_PATH, …)`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `fix(contracts): chart approval's sensors.json write is sanctioned, not harness-tamper`.

### Task 2: Chart approval: resolved Deferred items and linked ADR rows (F3, F11)

**Files:**
- Modify: `scripts/sdlc.ts:225` (the `deferred` expression in the chart approve path)
- Modify: `scripts/chart.ts:83` (`acceptAdrs` regex)
- Test: `scripts/chart.spec.ts`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing tests** in `scripts/chart.spec.ts`, reusing the fixture of the test at line ~97 that approves `chart-1 --by Pat`:
  - `test('approve chart-N does not list Deferred items already resolved', …)`: chart-review.md `## Deferred` has `- a.md:1: x. → fixed (confirmed)`, `- b.md:2: y → waived: z` and `- c.md:3: open item`. Assert stdout matches `/1 deferred review item\(s\)/` and contains `c.md:3`, and does not contain `a.md:1` or `b.md:2`.
  - `test('approve chart-N flips a linked ADR row in architecture.md', …)`: architecture.md `## Decisions` table row `| [0001](adr/0001-x.md) | decision | proposed | 1 |`, ADR file front matter `status: proposed`, `sprint: 1`. After approve, assert the row reads `| accepted | 1 |` and a bare-id row `| 0002 | … | proposed | 1 |` still flips too.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test --test-name-pattern="already resolved|linked ADR" scripts/chart.spec.ts`. Expected: both FAIL.
- [ ] **Step 3: Implement**:
  - sdlc.ts: add `.filter(c => !/→\s*(?:fixed|waived|dropped|carried|taken)\b/i.test(c))` to the `deferred` chain.
  - chart.ts: the id group in the row regex becomes `(?:\[(?:ids)\]\([^)]*\)|(?:ids))`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `fix(chart): approval skips resolved Deferred items and flips linked ADR rows`.

### Task 3: Plan file lists parse like people write them; the plan checks itself (F2)

**Files:**
- Modify: `scripts/model.ts:58` (`bulletPaths`)
- Modify: `scripts/sdlc.ts` (approve command: `--check`)
- Modify: `skills/plan/SKILL.md` step 3
- Test: `scripts/model.spec.ts`, `scripts/lifecycle.spec.ts`, `scripts/skilltext.spec.ts`

**Interfaces:**
- Produces: `S approve <slug> --check`: runs `approvalRefusal(slug)` only. Prints `ok: <slug> can be approved` and exits 0, or prints the refusal and exits 1. Needs no `SDLC_HUMAN`, writes nothing, works on `chart-N` too (exits 1 with "use approve chart-N without --check" is acceptable; builder's call).

- [ ] **Step 1: Write the failing tests**
  - model.spec.ts `test('planFiles reads comma lists and skips prose bullets', …)`: `## Files` body
    ```
    - src/cart/errors.py, src/cart/models.py (`Item` only), src/cart/storage.py
    - Modify: `src/app.js`
    - No existing test changes: tests/test_smoke.py only touches `cart.cli`, which this change leaves alone.
    `models.py` gets the `Item` class only.
    src/plain.py
    ```
    `assert.deepEqual(planFiles(plan), ['src/cart/errors.py', 'src/cart/models.py', 'src/cart/storage.py', 'src/app.js', 'src/plain.py'])`.
  - lifecycle.spec.ts `test('approve --check reports the refusal without approving', …)`: a change whose plan lists `src/b.ts` outside a radius of `src/a.ts` (copy the setup of the test at line ~231). `sdlc(repo, ['approve', 'demo', '--check'])` with no `SDLC_HUMAN`: code 1, stderr matches `/outside the blast radius: src\/b\.ts/`, no `approval.json`. After fixing the plan: code 0, stdout matches `/^ok: demo can be approved/`, still no `approval.json`.
  - skilltext.spec.ts: `skills/plan/SKILL.md` matches `/approve <slug> --check/`.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/model.spec.ts scripts/lifecycle.spec.ts scripts/skilltext.spec.ts`. Expected: the three new tests FAIL.
- [ ] **Step 3: Implement**
  - `bulletPaths(body: string): string[]`. A bullet line (`^\s*[-*]\s+`): drop the bullet and an optional `Word:` label, split on `,`, take each segment's first token (a backticked span or a bare word), strip trailing `.,;:)` and a leading `(`, keep it if it is path-like (`/` or `\.\w+$`) and the segment did not start with a non-path word. A non-bullet line counts only when the whole trimmed line, backticks removed, is one path-like token with no spaces.
  - sdlc.ts approve: when `args.opt.check`, skip the human gate, `const r = approvalRefusal(slug); r ? fail(r) : out(\`ok: ${slug} can be approved\`)`.
  - plan skill step 3: add "Then run `S approve <slug> --check` and fix plan.md until it prints `ok`; never hand a plan to the person that this check refuses."
- [ ] **Step 4: Run** the step 2 command, then `node --disable-warning=ExperimentalWarning --test scripts/check.spec.ts scripts/pr.spec.ts scripts/queue.spec.ts` (other planFiles readers). Expected: all PASS.
- [ ] **Step 5: Commit** `fix(plan): plan file lists parse comma lists and skip prose; /rig-plan runs approve --check`.

### Task 4: `S pr` leaves a clean tree and names the next step (F4, F9)

**Files:**
- Modify: `scripts/core.ts` (`GITIGNORED`)
- Modify: `scripts/chart.ts` (`planRows`, `sprintPlan`, `writePlan`)
- Modify: `scripts/pr.ts` (`cmdPr`)
- Modify: `skills/pr/SKILL.md` step 9
- Test: `scripts/pr.spec.ts`, `scripts/skilltext.spec.ts`

**Interfaces:**
- Produces: `planRows(n: number, assumeShipped?: string): PlanRow[]`, `sprintPlan(n, assumeShipped?)`, `writePlan(n, assumeShipped?)`: the named slug counts as shipped. `readyAfter(slug: string): string[]` (chart.ts): start commands of the sprint's intents that are ready once `slug` ships, `[]` for an uncharted change.

- [ ] **Step 1: Write the failing tests** in `scripts/pr.spec.ts`, with a sprint-1 fixture of two intents `a` and `b` (`b` depends on `a`), chart approved (see chart.spec.ts fixtures, `ARCH_OK`, `IMPL_OK`), change `a` started from its intent, approved, verified, with a `pr-outline.md`, no remote:
  - `test('pr leaves no uncommitted file and ships the sprint plan as it will read after the merge', …)`: after `sdlc(repo, ['pr', 'a', '--message', 'feat: a'])`, `gitIn(repo, 'status', '--porcelain')` is `''`; the committed `sprint-1/plan.md` shows `a` done and `b` ready; checking out main, merging, then `sdlc(repo, ['chart', 'plan', '1'])` leaves `git status --porcelain` empty.
  - `test('a local-only pr names the merge and the next ready intent, and starts nothing', …)`: stdout matches `/Next: merge sdlc\/a into main, then \/rig[:-]start \.rig\/product\/sprints\/sprint-1\/intents\/b\.md/`; no `.rig/changes/b/`.
  - skilltext.spec.ts: `skills/pr/SKILL.md` matches `/local-only.*Next: merge/s`.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test --test-name-pattern="no uncommitted|local-only pr names" scripts/pr.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**
  - core.ts: add `'changes/*/pr-outline.md'` to `GITIGNORED` (pr.ts already calls `ensureGitignore`, and pr-body.md embeds the outline).
  - chart.ts: thread `assumeShipped` through; `isShipped(x) || x === assumeShipped`.
  - pr.ts: before `changeFiles(slug)`, when `intentOf(slug)?.sprint` is a number, `writePlan(n, slug)` (plan.md already ships through `SHARED_RE`). The local-only `out` becomes `pr ${slug}: committed on ${branch}; no origin remote, local only. Next: merge ${branch} into ${trunkName()}${next[0] ? \`, then ${next[0]}\` : ''}`, with `next = readyAfter(slug)`.
  - pr skill step 9: "When `S pr` printed local-only, end with its `Next:` line and skip `S queue next`; a person starts the next intent."
- [ ] **Step 4: Run** the step 2 command and the whole `scripts/pr.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(pr): clean tree after a PR; local-only PR names the merge and the next intent`.

### Task 5: Review items carried forward, change additions recorded (F5, F6)

**Files:**
- Create: `scripts/carry.ts`
- Modify: `scripts/chart.ts` (`hashed`; `chart report` line)
- Modify: `scripts/lifecycle.ts` (`approvalRefusal`)
- Modify: `scripts/pr.ts` (`cmdPr`, `ships`)
- Test: `scripts/carry.spec.ts` (new)

**Interfaces:**
- Consumes: `intentOf(slug)`, `intentsOf(n)`, `intentRel(n, slug)` (chart.ts / product.ts); `isShipped(slug)` (lifecycle.ts); `matchesAny(file, globs)` (model.ts); `section(text, heading)` (model.ts).
- Produces (carry.ts):
  - `type ReviewItem = { section: 'Deferred' | 'Unverifiable'; text: string; file: string | null; carry: string | null }`
  - `reviewItems(review: string): ReviewItem[]`: the bullets of both sections, minus "none"-style lines and lines with a resolution marker (`→ fixed|waived|dropped|carried|taken`). `file` = the first `path` or `path:line` token; `carry` = the slug in a `→ carry: <slug>` tag.
  - `routeReview(slug: string): { carried: Record<string, string[]>; backlog: string[] }`: target = the `carry` tag when it names an unbuilt intent of the same sprint; else the first unbuilt intent whose `scope:` matches `file` (equal, under a directory entry, or `matchesAny`); else the backlog. Unbuilt = same sprint, not `slug`, not `isShipped`. Writes each item, once (matched by its text), to the target intent's `## Carried in` as `- C<n> (from <slug> review): <text>`, or to `.rig/product/backlog.md` as `- [open] BL-<n> (<slug>, sprint <N>): <text>` under a `# Backlog` heading and a one-line generated note. An uncharted change sends everything to the backlog with `sprint -`.
  - `recordAdditions(slug: string): string[]`: in the change's own intent, writes `## Added during the change` with each spec.md behaviour line whose B-number the intent never mentions, and each `amendments.md` line (`A<n> …`), once each; returns the lines added. No-op for an uncharted change.
  - `carriedIds(intentText: string): string[]`: the `C<n>` ids under `## Carried in`.
- Both generated sections are appended at the end of the intent file, each starting with `<!-- generated by sdlc pr; outside the chart approval -->`.

- [ ] **Step 1: Write the failing tests** in `scripts/carry.spec.ts` (sprint-1 fixture: intents `store` (scope `src/store.py`), `ops` (scope `src/ops.py`), `cli` (scope `src/cli.py`), chart approved; change `store` shipped through `S pr`):
  - `review items go to the unbuilt intent that owns the file, a tagged one to its tag, the rest to the backlog`: review.md `## Deferred` has `- src/ops.py:3: x`, `- names should strip ANSI escapes → carry: cli`, `- docs/other.md: y`, `- src/store.py:9: z → fixed`. After `S pr store`: `ops.md` has `- C1 (from store review): src/ops.py:3: x`; `cli.md` has `C1 … ANSI`; `backlog.md` has `[open] BL-1 (store, sprint 1): docs/other.md: y`; nothing mentions `src/store.py:9`.
  - `routing is idempotent across a follow-up pr`: run the routing twice (`S pr` then a follow-up); each file has one C-line per item.
  - `an uncharted change sends its items to the backlog`: `/rig-start "<request>"`-style change (`new x --type feature`), items land in backlog with `sprint -`.
  - `additions are recorded in the change's own intent`: spec.md has `B1` (in the intent) and `B9` (not), amendments.md has `- A1 (B1): load also catches ValueError`; `store.md` gains `## Added during the change` with the `B9` line and the `A1` line, not `B1`.
  - `the chart stays approved after carry and additions`: `sdlc(repo, ['chart', 'check', '1'])` or `chartState` reports `approved` after the pr.
  - `approval refuses a spec that leaves a carried item unsettled`: change `ops` started from its intent whose `## Carried in` has `C1`; spec.md without `C1` → `approve ops --check` exits 1 with `/C1/`; spec.md naming `C1` under `## Out of scope` → `ok`.
  - `chart report counts carried, added and backlog items`: stdout of `S chart report 1` matches `/carried in 2, added during changes 2, backlog open 1/`.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/carry.spec.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** carry.ts per Interfaces, then:
  - chart.ts `hashed`: for intent files also remove each generated section (from its `## ` heading to the next `## ` heading or the end).
  - chart.ts report: add the line `carried in <c>, added during changes <a>, backlog open <b>`.
  - lifecycle.ts `approvalRefusal`: when `intent.md` front matter has `source:` and that intent file has carried ids, each id must appear in spec.md: `` `carried item(s) not settled in spec.md: C1, C2 (put each in a behaviour or under ## Out of scope with the person's reason)` ``.
  - pr.ts: call `routeReview(slug)` and `recordAdditions(slug)` before `changeFiles(slug)`; `ships` also accepts `^\.rig\/product\/sprints\/sprint-\d+\/intents\/[^/]+\.md$` and `.rig/product/backlog.md`.
  - sdlc.ts: `S carry <slug>` runs both for a change already shipped (the changes merged before this fix) and prints where each item went; the person commits the result. Spec in carry.spec.ts: `carry` on a shipped change routes its review items the same way.
- [ ] **Step 4: Run** `node --disable-warning=ExperimentalWarning --test scripts/carry.spec.ts scripts/chart.spec.ts scripts/pr.spec.ts scripts/lifecycle.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(pr): carry review items into the unbuilt intent that owns them, backlog last; record change additions`.

### Task 6: Skill text: one question batch, carried items, routing, after-commit raises, backlog at chart (F5, F7, F10)

**Files:**
- Modify: `skills/start/SKILL.md` step 2
- Modify: `skills/pr/SKILL.md` step 3
- Modify: `skills/build/SKILL.md`
- Modify: `templates/review-brief.md` (the "Review for" line)
- Modify: `skills/chart/SKILL.md` (gap pass)
- Test: `scripts/skilltext.spec.ts`

**Interfaces:** consumes the `→ carry: <slug>` tag and `## Carried in` C-ids from Task 5.

- [ ] **Step 1: Write the failing tests** in `scripts/skilltext.spec.ts`:
  - start: does not match `/ask one question at a time/`; matches `/one \`AskUserQuestion\` batch/` and `/## Carried in/`.
  - pr: matches `/→ carry: <slug>/` and `/inside the blast radius/`.
  - build and review-brief: both match `/after the commit point/`.
  - chart: matches `/\.rig\/product\/backlog\.md/`.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/skilltext.spec.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Write the text** (one or two sentences each):
  - start step 2: replace "The conversation is a grill: ask one question at a time; challenge each answer (…)" with: collect every question you can foresee (edge cases, failure behaviour, what is out of scope, who is hurt if it is wrong, each `C<n>` under the intent's `## Carried in`) and ask them in one `AskUserQuestion` batch of at most 4, then write spec.md; ask a second batch only for a question an answer created. Each carried `C<n>` ends in spec.md, as a behaviour or under `## Out of scope` with the person's reason (approval checks this). Keep "only a person closes an open question".
  - pr step 3, after the Deferred sentence: each Deferred or Unverifiable item that cites a file inside the blast radius and adds no behaviour beyond spec.md is fixed in the wave (move it under Findings); one that adds behaviour or belongs to another intent gets `→ carry: <slug>` naming the unbuilt intent of this sprint that owns it (`S chart plan <N> --print` lists them) or stays untagged; `S pr` routes every remaining item to that intent or to the backlog, so never drop one.
  - build: one rule: for an operation that can raise, check each step after the commit point (rename, replace, commit, send): it must not make the operation report failure once the change is in place, or the code says why.
  - review-brief "Review for" list: add "a raise after the commit point (the change is already in place, yet the operation reports failure), as `correctness`".
  - chart gap pass: also read `.rig/product/backlog.md`; ask each `[open]` item as a gap question, and on the answer mark it `[taken by sprint-<N>]` or `[dropped: <reason>]`.
- [ ] **Step 4: Run** the step 2 command plus `scripts/chartskill.spec.ts scripts/prskill.spec.ts scripts/reviewbrief.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(skills): one question batch, carried items settled, after-commit raises reviewed, backlog read at chart`.

### Task 7: `/rig-start` nudges on a large context or the wrong model (F8)

**Files:**
- Modify: `scripts/modelstate.ts` (new `transcriptContext`)
- Modify: `scripts/hooks.ts` (`hookPromptSubmit`)
- Test: `scripts/modelstate.spec.ts`, `scripts/gate.spec.ts`

**Interfaces:**
- Produces: `transcriptContext(transcriptPath: string | undefined): number | null`: input + cache-read + cache-creation tokens of the last assistant message's `usage`, read from the file tail like `transcriptModel`.
- Note: `templates/settings.json` already sets `"model": "claude-sonnet-5-5"` and shop_app has it; the run's Opus main thread was the person's own choice, so F8's default needs no change. The nudge makes the existing `model-role` mismatch visible at the moment it matters.

- [ ] **Step 1: Write the failing tests**
  - modelstate.spec.ts `transcriptContext sums the last assistant usage`: a JSONL file with two assistant rows; the last has `usage: { input_tokens: 10, cache_read_input_tokens: 120000, cache_creation_input_tokens: 500 }` → `120510`; a missing file → `null`.
  - gate.spec.ts `/rig-start on a large context or another model shows a nudge`: `hook(repo, 'prompt-submit', { prompt: '/rig-start x', transcript_path: <that file> })` → JSON `systemMessage` matches `/~121k tokens.*\/clear/`; with `model: 'claude-opus-5-5'` in the last row it also matches `/\/model sonnet/`; a prompt that is not `/rig-start` or `/rig:start`, or a 50k context on Sonnet, prints nothing.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test --test-name-pattern="transcriptContext|nudge" scripts/modelstate.spec.ts scripts/gate.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**: in `hookPromptSubmit`, when the prompt matches `/^\s*\/rig[:-]start\b/`: lines = context > 100 000 ? `context is ~${Math.round(n/1000)}k tokens: run /clear, then this command again` : nothing; plus, when `modelFamily(transcriptModel(path))` differs from `modelFamily(registry.models.build)`, `the main thread runs on <model>; this repo builds on <build>: /model <build>`. Print `{ systemMessage: 'rig: ' + lines.join('; ') }` alongside any existing `hookSpecificOutput` (one JSON object).
- [ ] **Step 4: Run** the step 2 command and `scripts/gate.spec.ts` whole. Expected: PASS.
- [ ] **Step 5: Commit** `feat(hooks): /rig-start nudges on a context over 100k or a main thread off the build model`.

### Task 8: Caps, changelog, full verification

**Files:**
- Modify: `scripts/neutrality.spec.ts` (`SCRIPTS_CAP`), `CHANGELOG.md`

- [ ] **Step 1: Run** `npm test 2>&1 | tail -30` and read the neutrality failure for the measured total.
- [ ] **Step 2: Set** `SCRIPTS_CAP` to that total, prefixing the note: `<total> plus the sprint-1 run fixes (carry.ts, approve --check, the plan file parser, the clean-tree pr, the start nudge; <total> measured, 2026-10-28); before that: 7 823 …`.
- [ ] **Step 3: Add** a CHANGELOG entry listing F1–F11 in one line each.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: both exit 0; quote the summary lines.
- [ ] **Step 5: Commit** `chore: scripts cap and changelog for the sprint-1 run fixes`.
- [ ] **Step 6:** One review of `git diff main...HEAD` by a single **Opus** reviewer (the person's rule: Sonnet output is always evaluated by Opus), fix findings in one wave, rerun `npm test`.

### Task 9: Every Sonnet output in rig is evaluated by Opus (person's rule, 2026-10-28)

**Files:**
- Modify: `skills/pr/SKILL.md` (code review, security review, confirm pass), `skills/testplan/SKILL.md`, `skills/plan/SKILL.md`
- Modify: `scripts/prskill.spec.ts:22` (pins `model: sonnet` today), `scripts/skilltext.spec.ts`

**Interfaces:** the evaluation model is `models.evaluate` (`opus` by default, `scripts/registry.ts:58`); skill text names the alias `opus`.

- [ ] **Step 1: Write the failing tests**
  - prskill.spec.ts: the code-review line matches `/launch one \`Agent\` \(\`general-purpose\`, \`model: opus\`, foreground\)/`; the confirm pass names `model: opus`; the security review is an agent with `model: opus` on every run (no main-thread `/security-review`, which runs on the session's Sonnet).
  - skilltext.spec.ts `no skill evaluates with sonnet`: for every `skills/*/SKILL.md` and `templates/*brief*.md`, no sentence that contains `review`, `confirm` or `evaluat` also contains `model: sonnet` or "model `sonnet`".
  - skilltext.spec.ts: testplan matches `/rig:evaluator|rig-evaluator/` after its QA step; plan matches `/rig:evaluator|rig-evaluator/` and `/spec\.md and plan\.md/`.
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/prskill.spec.ts scripts/skilltext.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Write the text**
  - pr step 2: code review agent `model: opus`; security review: always one `general-purpose` agent with `model: opus` and the existing fallback brief (drop the main-thread `/security-review` path and its no-origin fallback branch). Step 4 confirm agent: `model: opus`.
  - testplan, after QA: launch `rig:evaluator` (Opus by its front matter; never pass a model override) on the test plan against the PRD and intents; fix its findings once.
  - plan, before step 5: launch `rig:evaluator` once on spec.md and plan.md against the intent and requirements.md (missed requirement, behaviour without a test, plan outside the spec); fix its findings once, then `S approve <slug> --check`.
- [ ] **Step 4: Run** the step 2 command plus `scripts/reviewbrief.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(skills): Opus evaluates every Sonnet output: code review, security, confirm, test plan, spec and plan`.

## After the build (person)

In shop_app: `/rig-upgrade`, then `S carry cart-storage` and `S carry cart-operations` (routes the reviews merged before this fix; commit the result), then `/rig-start .rig/product/sprints/sprint-1/intents/cart-cli.md`. Expected: one question batch that includes the carried items (the ANSI item lands in cart-cli only if the routing pass tags it; otherwise it is in the backlog); no tamper or approval misfire.
