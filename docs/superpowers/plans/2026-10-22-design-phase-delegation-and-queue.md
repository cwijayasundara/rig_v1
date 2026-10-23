# Design phase delegation and the queue — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rig's chart, start and plan skills delegate the design conversation to superpowers; the sprint design doc joins the chart's frozen files; a per-repo autonomy rung lets the queue open the next intent itself.

**Architecture:** Three deterministic additions in `scripts/` (design doc as a chart file with two trace rules; blast-radius check at approve; `autonomy.ts` + `queue next`), each surfaced through the existing context injection in `hooks.ts` and `journey.ts`. The model-facing changes are skill and brief text, asserted by text the way `autoloop.spec.ts` does. `sdlc verify` is untouched.

**Tech Stack:** Node 24 + TypeScript (`node --test` on `scripts/*.spec.ts`), zero runtime dependencies, skills as Markdown under `skills/`.

**Spec:** `docs/superpowers/specs/2026-10-22-design-phase-delegation-and-queue-design.md`

## Global Constraints

- Every behaviour B1–B11 of the spec §8 has a spec test; run `node --disable-warning=ExperimentalWarning --test scripts/<file>.spec.ts` per task and `npm test` + `npm run typecheck` once at the end.
- Zero dependencies in `scripts/`; `read`, `exists`, `frontmatter`, `section` helpers from `core.ts`/`model.ts`, never a YAML parser.
- Person-only commands check `process.env.SDLC_HUMAN === '1'` exactly as `cmdApprove` (`sdlc.ts:121`) and fail with the same style of message.
- A repo with no `.rig/autonomy.json` is rung 0. A `spec.md` with no `## Blast radius` is not checked. An `architecture.md` with no `design:` line has no design doc. Nothing changes for repos charted before this.
- Skill text must *name* `superpowers:brainstorming` / `superpowers:writing-plans`; it must not restate their steps.
- Commit after each task on branch `rig/design-delegation` from `main`, messages in the repo's `type: summary` style with the `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer.

## Review Focus

1. `architecture.md` has `design:` naming a file outside the repo or with `..` — `designDocOf` must resolve under ROOT only and report `design-missing` (Task 1 test `design: path outside the repo is design-missing`).
2. The design doc's `## Intents` has a slug the sprint's intent files lack *and* vice versa — both directions block, with both slugs named (Task 1).
3. `plan.md ## Files` lists `src/cart/` (a directory) while blast radius lists `src/cart/models.py` — a directory in the plan is outside a file-only radius and must be refused (Task 2).
4. `autonomy.json` is hand-edited to `"rung": 7` or a non-number — reader clamps to 0 and `sdlc autonomy` says the file is malformed (Task 3).
5. A change is active but its folder was deleted — `activeSlug()` already ignores it; `queue next` must then pick, not report "a change is active" (Task 4).

---

### Task 1: The sprint design doc is a chart file with two trace rules

**Files:**
- Modify: `scripts/chart.ts:38-45` (ownFiles, manifest), `:83-94` (chartFindings)
- Modify: `scripts/chartcheck.ts` (new exported helper, see Interfaces)
- Test: `scripts/chart.spec.ts`, `scripts/chartcheck.spec.ts`

**Interfaces:**
- Produces in `chartcheck.ts`: `export const designIntents = (designDoc: string): string[]` — slugs from lines `- <slug>: ...` under `## Intents` (use `section(text, 'Intents')`; slug regex same as `SLUG_RE` in sdlc.ts: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`).
- Produces in `chart.ts`: `export function designDocOf(n: number): string | null` — repo-relative posix path from `architecture.md` frontmatter `design:` (via `frontmatter(read(ARCH)).data.design`), or null when absent; a path that does not resolve under ROOT returns the raw string (so the missing-file rule names it). Later tasks (5, 6) call this.
- `ownFiles(n)` appends `designDocOf(n)` when it names an existing file.

- [ ] **Step 1: Write the failing tests** in `scripts/chartcheck.spec.ts`:

```ts
test('designIntents reads "- slug: scope (ids)" lines under ## Intents and nothing else', () => {
  const doc = '# D\n\n## Intents\n- walking-skeleton: thinnest slice (FR-1)\n- add-item: merge by sku (FR-2)\n* not-a-dash: x\n\n## Design\n- not-an-intent: y\n'
  assert.deepEqual(designIntents(doc), ['walking-skeleton', 'add-item'])
  assert.deepEqual(designIntents('# D\n## Design\nnone\n'), [])
})
```

and in `scripts/chart.spec.ts` (use `makeRepo`, `write`, `sdlc` from testkit; a minimal charted sprint 0 the way the existing chart specs build one):

```ts
test('design: in architecture.md frontmatter puts the design doc under the chart approval; editing it makes chart-0 stale', ...)
  // write architecture.md with `---\nsprint: 0\nupdated: 2026-10-22\ndesign: docs/superpowers/specs/s0-design.md\n---`, the doc with ## Intents listing every sprint-0 intent slug; approve chart-0 with SDLC_HUMAN=1;
  // assert approvals/chart-0.json files[] contains the doc path; edit the doc; assert `sdlc chart check 0 --json` / status shows chart-0 stale naming that path
test('design-intent blocks in both directions and names the slugs', ...)
  // doc lists add-item only, intents dir has walking-skeleton too → findings include rule 'design-intent' mentioning 'walking-skeleton'; then the reverse
test('design-missing blocks when design: names a file that is not there, and a path outside the repo', ...)
  // design: docs/nope.md → rule 'design-missing'; design: ../x.md → rule 'design-missing'
test('a sprint whose architecture.md has no design: line has no design findings and no extra chart file', ...)
```

- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test scripts/chartcheck.spec.ts scripts/chart.spec.ts` — expect the new tests FAIL (`designIntents is not a function`, missing rule).

- [ ] **Step 3: Implement** `designIntents` in chartcheck.ts; `designDocOf` in chart.ts; extend `ownFiles`; in `chartFindings` push `{ rule: 'design-missing', severity: 'block', where: 'architecture', message: \`architecture.md names a design doc that does not exist: ${p}\` }` and, when the doc exists, for each slug in `designIntents` not in `intentsOf(n)` a `design-intent` block `"<slug> is in the design doc's ## Intents but has no .rig/product/intents/<slug>.md"`, and for each intent of the sprint not in the list, `"<slug> is an intent of sprint N but the design doc's ## Intents does not list it"`.

- [ ] **Step 4: Run** the two spec files — expect PASS, and the pre-existing chart tests still PASS.

- [ ] **Step 5: Commit** `feat(chart): the sprint design doc is a chart file; design-intent and design-missing trace rules`

### Task 2: Blast radius gates the plan at approve

**Files:**
- Modify: `scripts/model.ts` (move `planFiles` here from `scripts/queue.ts:26-29`; queue.ts imports it)
- Modify: `scripts/lifecycle.ts:61-66` (approvalRefusal)
- Test: `scripts/lifecycle.spec.ts`, `scripts/queue.spec.ts` (import path only)

**Interfaces:**
- Produces in `model.ts`: `export function planFiles(plan: string): string[]` (unchanged behaviour), `export function blastRadius(spec: string): string[] | null` — bullet paths under `## Blast radius`, same bullet/backtick parsing as `planFiles`; `null` when the heading is absent.
- Produces in `lifecycle.ts`: `export function outsideRadius(planPaths: string[], radius: string[]): string[]` — plan paths that neither equal a radius entry nor sit under a radius entry that ends with `/`. A plan path ending in `/` is inside only if a radius entry equals it or is a parent directory.

- [ ] **Step 1: Write the failing tests** in `scripts/lifecycle.spec.ts`:

```ts
test('outsideRadius: equal path and child-of-directory are inside; a sibling and a plan directory wider than the radius are outside', () => {
  assert.deepEqual(outsideRadius(['src/cart/models.py', 'tests/test_add.py'], ['src/cart/models.py', 'tests/']), [])
  assert.deepEqual(outsideRadius(['src/cart/cli.py'], ['src/cart/models.py']), ['src/cart/cli.py'])
  assert.deepEqual(outsideRadius(['src/cart/'], ['src/cart/models.py']), ['src/cart/'])
})
test('approve refuses a plan that touches a file outside spec.md ## Blast radius, and names it', ...)
  // approvedChange-style setup but spec.md has `## Blast radius\n- src/a.ts\n` and plan.md `## Files\n- src/b.ts\n`; sdlc approve with SDLC_HUMAN=1 → exit 1, stderr matches /plan touches a file outside the blast radius: src\/b\.ts/
test('a spec.md with no ## Blast radius heading is not checked', ...)
```

- [ ] **Step 2: Run** `--test scripts/lifecycle.spec.ts` — expect FAIL.

- [ ] **Step 3: Implement.** Move `planFiles` to model.ts (keep export from queue.ts as a re-export to avoid churn). Add `blastRadius`, `outsideRadius`. In `approvalRefusal`, after the open-questions check: `const r = blastRadius(read(file(slug,'spec.md'))); if (r) { const out = outsideRadius(planFiles(read(file(slug,'plan.md'))), r); if (out.length) return \`plan touches a file outside the blast radius: ${out.join(', ')} (add it to spec.md ## Blast radius or drop it from plan.md ## Files)\` }`.

- [ ] **Step 4: Run** `--test scripts/lifecycle.spec.ts scripts/queue.spec.ts` — expect PASS.

- [ ] **Step 5: Commit** `feat(approve): a plan may only touch files inside spec.md ## Blast radius`

### Task 3: The autonomy rung

**Files:**
- Create: `scripts/autonomy.ts`
- Modify: `scripts/sdlc.ts:49-64` (cmdInit writes the file), `:274-306` (dispatch `autonomy`)
- Modify: `scripts/check.ts:284-291` (human row), `templates/managed-settings.json:25` (deny)
- Create: `skills/autonomy/SKILL.md` (copy `skills/approve/SKILL.md`'s shape; `disable-model-invocation: true`; runs `SDLC_HUMAN=1 … sdlc.ts autonomy $ARGUMENTS`)
- Test: create `scripts/autonomy.spec.ts`; modify `scripts/check.spec.ts`, `scripts/managed.spec.ts`, `scripts/removed.spec.ts` (the skill count test `4b: seven workflow skills…` must count the new human gate)

**Interfaces:**
- `export type Autonomy = { rung: 0 | 1 | 2; since: string; deferred: string[]; history: { at: string; by: string; from: number; to: number; why: string }[] }`
- `export const AUTONOMY = path.join(SDLC, 'autonomy.json')`
- `export function readAutonomy(): Autonomy` — missing file → `{ rung: 0, since: '', deferred: [], history: [] }`; malformed or out-of-range rung → rung 0 with `malformed: true` surfaced by `autonomyText`.
- `export function writeAutonomy(a: Autonomy): void`
- `export function initAutonomy(): void` — writes rung 1 only when the file is absent (called by cmdInit).
- `export function setRung(to: 0|1|2, why: string, by: string): Autonomy` — appends history, sets `since`.
- `export function proposeRung(): { to: number; why: string } | null` — see Step 3.
- `export function autonomyText(a: Autonomy, p: ReturnType<typeof proposeRung>): string`
- `export function cmdAutonomy(args: Args): void` — `autonomy` prints text (`--json` JSON); `autonomy set <0|1|2> --why "<text>"` requires `SDLC_HUMAN === '1'` and `ownerOrFail` like approve.

- [ ] **Step 1: Write the failing tests** in `scripts/autonomy.spec.ts`:

```ts
test('no file reads as rung 0; init writes rung 1 once and never overwrites', ...)
  // makeRepo → readAutonomy().rung === 0; sdlc init → file has rung 1; set to 2; sdlc init again → still 2
test('set refuses without SDLC_HUMAN=1 and records a history row with it', ...)
  // sdlc autonomy set 2 --why x → exit 1, stderr /SDLC_HUMAN/; with env SDLC_HUMAN=1 → rung 2, history[0] = {from:1,to:2,why:'x'}
test('a malformed rung clamps to 0 and autonomy says so', ...)
  // write {"rung":7} → readAutonomy().rung 0; sdlc autonomy stdout /malformed/
test('proposeRung: up after 3 shipped changes with passing verify, no security/contract/design finding and no waiver; not after 2; down on a waived block or a repeated finding', ...)
  // build 3 shipped changes with testkit (pr.md committed on main, verify.json pass, review.md with only a `tests` finding) → {to: 2, why: /3 clean ships/}; with 2 → null; add a waivers.jsonl row for one slug → {to: 0, why: /waiver/}
```

In `scripts/check.spec.ts`: `test('CI treats an autonomy.json a PR edits as a human row', ...)` modelled on the existing chart-approval human-row test, expecting a row `autonomy by <name>` (by = `history.at(-1)?.by` — add `by` to history rows). In `scripts/managed.spec.ts`: assert the deny list includes `"Edit(./.rig/autonomy.json)"`.

- [ ] **Step 2: Run** `--test scripts/autonomy.spec.ts scripts/check.spec.ts scripts/managed.spec.ts` — expect FAIL.

- [ ] **Step 3: Implement** `autonomy.ts`. `proposeRung` reads `shippedChanges(ROOT)` from `learnmine.ts` (newest 3); a ship is clean when `verify.json.pass === true`, no line under `## Findings` of `review.md` carries `[category: security|contract|design]`, and `waiversOf(ROOT)` has no row with that slug. Up when 3 newest are clean and rung < 2 → `{ to: rung+1, why: '3 clean ships: <slugs>' }`. Down when rung > 0 and either the newest ship has a waiver row (`why: 'waived block in <slug>'`) or `mineCandidates(ROOT)` is non-empty (`why: 'repeated finding: <key>'`). Up wins only when no down trigger fires. Wire dispatch, cmdInit, the check.ts regex (`/^\.rig\/autonomy\.json$/` → `autonomy`), the managed deny, the skill file.

- [ ] **Step 4: Run** the three spec files plus `scripts/removed.spec.ts` — expect PASS (adjust the skill-count assertion to include `autonomy`).

- [ ] **Step 5: Commit** `feat(autonomy): a person-set rung with evidence-driven proposals; CI and managed settings guard the file`

### Task 4: `queue next`, `defer`, `undefer`

**Files:**
- Modify: `scripts/queue.ts:87-100` (cmdQueue), new exports
- Test: `scripts/queue.spec.ts`

**Interfaces:**
- `export function queueNext(): { slug: string; sprint: number; path: string } | { none: string }` — `none` reasons, exactly: `'rung 0: a person starts each intent'`, `'a change is active: <slug> (<status>)'`, `'no intents are ready'`. Order: `readyIntents()` sorted by sprint, then by position in `designIntents(read(designDocOf(sprint)))` when a design doc exists (unknown slugs after the listed ones, then alphabetical), deferred slugs last. `path` is `.rig/product/intents/<slug>.md`.
- `cmdQueue`: `queue next [--json]` prints `start <slug>: /rig:start <path> (rung N)` or `queue: <none>`; `queue defer <slug>` / `queue undefer <slug>` need `SDLC_HUMAN === '1'` and edit `autonomy.json.deferred`.

- [ ] **Step 1: Write the failing tests** in `scripts/queue.spec.ts`:

```ts
test('queue next: rung 0 names the person; rung 1 picks the first ready intent in design-doc order; a deferred slug goes last', ...)
test('queue next: a change waiting at approve counts as active; a deleted active folder does not', ...)
test('queue defer/undefer are person-only and round-trip through autonomy.json', ...)
```

- [ ] **Step 2: Run** `--test scripts/queue.spec.ts` — expect FAIL.
- [ ] **Step 3: Implement** per Interfaces (reuse `activeSlug`, `status`, `readyIntents`, `designDocOf`, `designIntents`, `readAutonomy`/`writeAutonomy`).
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(queue): next, defer and undefer, governed by the autonomy rung`

### Task 5: Surface the queue at SessionStart, in journey and after a ship

**Files:**
- Modify: `scripts/hooks.ts:114` (SessionStart context line), `scripts/journey.ts:17-22, 57, 79, 82` (Journey gains `rung: number; queue: string | null`; journeyText prints `rung N · queue: <slug>|none`)
- Modify: `skills/pr/SKILL.md:19` (step 7 end line)
- Test: `scripts/sdlc.spec.ts` (SessionStart tests live there), `scripts/journey.spec.ts`, `scripts/prskill.spec.ts`

- [ ] **Step 1: Write the failing tests**:

```ts
// sdlc.spec.ts
test('SessionStart names the queue pick at rung 1 with no active change, and says No active change at rung 0', ...)
  // assert additionalContext matches /Queue: start add-item now with \/rig:start \.rig\/product\/intents\/add-item\.md \(rung 1\)/ and, at rung 0, /No active change/
// journey.spec.ts
test('journey carries the rung and the queue pick', ...)   // j.rung === 1, j.queue === 'add-item'; journeyText contains 'rung 1'
// prskill.spec.ts
test('after a ship the pr skill names the next queued intent at rung 1 or above', () => {
  assert.match(pr(), /`S queue next`[^\n]*rung/)
  assert.match(pr(), /Queue: <next slug> is ready/)
})
```

- [ ] **Step 2: Run** the three spec files — expect FAIL.
- [ ] **Step 3: Implement.** hooks.ts: compute `const q = active ? null : queueNext()`; when `'slug' in q` the line is `Queue: start ${q.slug} now with ${skillRef('start')} ${q.path} (rung ${rung})`. journey.ts: add the two fields. pr skill step 7: append *"Then run `S queue next`; when it names an intent (rung ≥ 1), add `Queue: <next slug> is ready; /rig:start <path>` so this session carries on."*
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(queue): the session start, the journey and the end of pr name the next intent`

### Task 6: Chart delegates to the brainstorm; the architect reads the design doc

**Files:**
- Modify: `skills/chart/SKILL.md:15-20` (step 2), `agents/rig-architect.md` (brief: read the design doc; write `design:` into architecture.md frontmatter; one intent per `## Intents` line, no more)
- Modify: `templates/architecture-format.md` (frontmatter gains `design: <path or none>`)
- Test: `scripts/chartskill.spec.ts`

- [ ] **Step 1: Write the failing tests**:

```ts
test('chart step 2 invokes superpowers:brainstorming by name before the architect and fixes the design doc path and ## Intents shape', () => {
  const t = chart(); const body = t.slice(t.indexOf('\n---\n', 4))
  assert.match(body, /superpowers:brainstorming/)
  assert.ok(body.indexOf('superpowers:brainstorming') < body.indexOf('rig:architect'))
  assert.match(body, /docs\/superpowers\/specs\/<date>-sprint-<N>-design\.md/)
  assert.match(body, /- <slug>: <one-line scope> \(<PRD ids>\)/)
  assert.doesNotMatch(body, /What's the moment you find yourself wishing/, 'the skill names the brainstorm, it does not restate it')
})
test('the architect brief names the design doc and the design: frontmatter line', () => {
  assert.match(repoText('agents/rig-architect.md'), /design: <repo-relative path>/)
  assert.match(repoText('agents/rig-architect.md'), /one intent per line of the design doc's `## Intents`/)
})
```

- [ ] **Step 2: Run** `--test scripts/chartskill.spec.ts` — expect FAIL.
- [ ] **Step 3: Write the text.** New step 2a before the architect: *"**Design.** Invoke `superpowers:brainstorming` with the PRD (and `brief.md`, `architecture.md` when they exist) as the opening material and one added line: the written design goes to `docs/superpowers/specs/<date>-sprint-<N>-design.md` and must end with `## Intents`, one line per intent as `- <slug>: <one-line scope> (<PRD ids>)`, and a `## Design` section a builder can draw architecture.md from. Let the skill run its conversation; offer recon and `anthropic-skills:deep-research` where it offers recon. Do not continue until the design doc exists."* Step 2 (architect) adds the design doc path to the brief and the two rules above. The chart reviewer's brief (step 5) adds the design doc as a source.
- [ ] **Step 4: Run** — expect PASS. Also run `--test scripts/removed.spec.ts` (the "every skill named exists" test).
- [ ] **Step 5: Commit** `feat(chart): the design conversation is superpowers:brainstorming; the architect builds from the design doc`

### Task 7: Start and plan delegate

**Files:**
- Modify: `skills/start/SKILL.md:12-16` (steps 2–3), `skills/plan/SKILL.md:12-19` (step 2)
- Test: `scripts/autoloop.spec.ts`

- [ ] **Step 1: Write the failing tests**:

```ts
test('start invokes superpowers:brainstorming on the intent and ends with spec.md holding ## Blast radius; plan invokes superpowers:writing-plans into plan.md', () => {
  const s = skill('start'), p = skill('plan')
  assert.match(s, /superpowers:brainstorming/); assert.match(s, /## Blast radius/); assert.match(s, /the design doc is frozen/)
  assert.doesNotMatch(s, /Delegate code searches to one `Explore` agent/, 'the brainstorm does its own recon')
  assert.match(p, /superpowers:writing-plans/); assert.match(p, /plans hold interfaces and acceptance tests, never code/)
  assert.match(p, /## Files[^\n]*inside[^\n]*## Blast radius/)
})
test('nothing after approve asks the person a question except the existing stop cases', () => {
  for (const name of ['build', 'test', 'pr']) assert.doesNotMatch(skill(name), /AskUserQuestion/)
})
```

- [ ] **Step 2: Run** `--test scripts/autoloop.spec.ts` — expect FAIL.
- [ ] **Step 3: Write the text** per spec §4.2 (start: the brainstorm opens with the intent file, the sprint design doc from `architecture.md`'s `design:` line when present, and `brief.md`; the added line about the frozen design doc; the skill's size step is skipped; end by writing intent.md and spec.md with `## Behaviours` (intent B-numbers kept), `## Blast radius`, `## Out of scope`, `## Open questions`. plan: `superpowers:writing-plans` on spec.md, writing plan.md in rig's existing shape, `## Files` inside `## Blast radius`). Keep the existing plan rules (tests list, contracts, 60-line cap).
- [ ] **Step 4: Run** `--test scripts/autoloop.spec.ts scripts/removed.spec.ts` — expect PASS.
- [ ] **Step 5: Commit** `feat(start,plan): the per-intent conversation is superpowers; spec.md carries the blast radius`

### Task 8: Review against the design

**Files:**
- Modify: `templates/review-brief.md:5, 8, 18`, `skills/pr/SKILL.md:15` (step 3), `scripts/learnmine.ts:18` (LADDER gains `design: ARCH`)
- Test: `scripts/reviewbrief.spec.ts`, `scripts/prskill.spec.ts`, `scripts/learnmine.spec.ts`

- [ ] **Step 1: Write the failing tests**:

```ts
// reviewbrief.spec.ts
test('the brief hands the reviewer the sprint design doc when architecture.md names one and defines the design category', () => {
  const b = brief(); assert.match(b, /architecture\.md[^\n]*design:/); assert.match(b, /category: [^\]]*design/)
  assert.match(b, /no longer matches a responsibility the design doc gives/)
  assert.ok(b.split('\n').length <= 60)
})
// prskill.spec.ts
test('a design finding is never dismissed by the builder: fixed, or deferred with the sentence the doc should change', () => {
  assert.match(pr(), /Never dismiss a `security`, `contract` or `design` finding yourself/)
  assert.match(pr(), /`design`[^\n]*## Deferred[^\n]*sentence/)
})
// learnmine.spec.ts
test('a design finding climbs to the architecture rung', () => { assert.equal(ladderFor('finding', 'design').rung, 'architecture') })
```

- [ ] **Step 2: Run** the three — expect FAIL.
- [ ] **Step 3: Write the text and the one-line LADDER change.** Brief line 5 adds: *"When `.rig/product/architecture.md` frontmatter has `design: <path>`, that design doc: the sprint's frozen design."* Line 8 adds, after contract: *"code that no longer matches a responsibility the design doc gives its files (`design`)."* Line 18's category list gains `design`. pr step 3: the dismissal sentence names `design`; the category list gains `design`; one sentence: *"A `design` finding is fixed in the wave when the code is wrong; when the design doc is wrong it goes to `## Deferred` with the sentence of the doc that should change (a chart edit, which re-opens the chart approval)."*
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(pr): the reviewer reads the frozen design doc; design findings are undismissable`

### Task 9: Docs, vendoring and the full gate

**Files:**
- Modify: `README.md` (Where everything lives: `.rig/autonomy.json`; Who does what: `/rig:autonomy`; one paragraph "The design conversation" under The big picture), `CHANGELOG.md` (Unreleased), `scripts/vendor.ts`/`VERSION` as the repo does for a new script (`autonomy.ts`) and skill
- Test: `scripts/removed.spec.ts` ("every /rig:<skill> named exists"), `scripts/vendor.spec.ts` if it lists scripts

- [ ] **Step 1:** Add the docs and the vendoring entries. `grep -n "queue.ts" scripts/vendor.ts scripts/*.spec.ts` shows where a script is listed; add `autonomy.ts` beside it.
- [ ] **Step 2: Run** `npm test` and `npm run typecheck` — expect all green (760+ specs, e2e unit, S0–S6, parallel). Paste the summary lines in the commit body.
- [ ] **Step 3: Commit** `docs: the design conversation, the autonomy rung and the queue; vendor autonomy.ts`
- [ ] **Step 4:** Re-vendor `shop_app` (`sdlc vendor` there, per CLAUDE.md "fix the harness, regenerate the target") and run `sdlc autonomy` and `sdlc queue next` in it: expect `rung 0` and `queue: rung 0: a person starts each intent` — proof that an existing target repo is unchanged by the upgrade.
