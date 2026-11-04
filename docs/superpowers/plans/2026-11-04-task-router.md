# Task Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended here, see Execution) or superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** `/rig:start` takes a quick path (no brainstorm, no question batch) for a clear bugfix or refactor request, decided by a deterministic script check that can only narrow toward the full path.

**Architecture:** A pure function `routeCheck(type, request, opts)` in `scripts/route.ts`, exposed as `S route-check`. `skills/start/SKILL.md` calls it after picking the change type and obeys its `route:` line. Plan weight stays with `S weight`; approval, build, test and PR are untouched.

**Tech Stack:** Node 22 TypeScript (type-stripping, `node --test`), existing `scripts/testkit.ts` helpers.

**Spec:** `docs/superpowers/specs/2026-11-04-task-router-design.md` (read "Revisions at plan time" first: it supersedes the draft's type list and the separate skill).

Work on branch `feat/task-router` (not `main`). Run `npm test` and `npm run typecheck` once at the end and quote the output; one review of `git diff main...HEAD`.

## Global Constraints

- Types are exactly `TYPES` from `scripts/lifecycle.ts`: `feature`, `bugfix`, `refactor`, `chore`.
- The model proposes, the script decides: the router never returns `quick` when any rule fails, and never skips approval, the red/green proof or the final gate.
- Unclear means full: any doubt returns `route: full`.
- No hook or script calls a model. No new subagent launches.
- `skills/start/SKILL.md` stays under its current plus 12 lines.
- Request text is data: never interpolated into a shell command by the script.

## Review Focus

- A feature request containing a symptom word ("add a retry when the API throws") must stay `full` (type gate beats the symptom regex).
- A request holding backticks, `$(...)` and quotes passed through the CLI must print a route and execute nothing.
- Upper case symptom text ("THROWS ON EMPTY CART") must match the same as lower case.
- Missing or empty `<type>` or `<request>` must exit non-zero with a usage line, not crash or print `quick`.
- A refactor that mentions "support" as a noun ("extract the support-ticket helper") routes `full`; conservative false-full is accepted, false-quick is not.

---

### Task 1: `routeCheck` and `S route-check`

**Files:**
- Create: `scripts/route.ts`, `scripts/route.spec.ts`
- Modify: `scripts/sdlc.ts` (import `cmdRouteCheck`; add `'route-check': cmdRouteCheck,` to `COMMANDS` after `weight: cmdWeight,` at line 482)

**Interfaces:**
- Produces:
  - `export type Route = { path: 'quick' | 'full'; type: string; reasons: string[] }`
  - `export function routeCheck(type: string, request: string, opts?: { noRoute?: boolean }): Route`
  - `export function cmdRouteCheck(args: Args): void` (same `Args` type `cmdWeight` in `scripts/risk.ts` uses)
- CLI: `S route-check <type> "<request>" [--no-route] [--json]`. Plain output: `route: quick|full` then one `- <reason>` line per reason. `--json` prints the `Route`. Missing `<type>` or `<request>` (empty after trim): `fail('usage: route-check <type> "<request>" [--no-route] [--json]')`.

Rules, applied in order, first match returns `full` with that one reason; all passing returns `quick`:
1. `opts.noRoute` → reason `routing skipped (--no-route)`.
2. `type` not in `TYPES` → `unknown type <type>`.
3. `type` is `feature` or `chore` → `<type> takes the full conversation`.
4. `request.length > 600` → `request over 600 characters`.
5. `bugfix` and no symptom match → `no symptom named`. Symptom is `/\b(errors?|exceptions?|throws?|thrown|fails?|failing|failed|crash\w*|wrong|incorrect|instead|undefined|null|NaN|regress\w*)\b|`[^`]+`|"[^"]+"|\b[45]\d\d\b/i`.
6. `refactor` and request matches `/\b(add|adds|new|support|supports|allow|allows|enable|introduce|also)\b/i` → `mentions new behaviour: <the matched word, lowercased>`.
Quick reasons: `bugfix names a symptom` or `refactor names no new behaviour`.

- [ ] **Step 1: Write the failing tests** in `scripts/route.spec.ts` (mirror the imports of `scripts/weight.spec.ts`: `node:test`, `assert/strict`, `makeRepo`, `sdlc` from `./testkit.ts`). Test names and assertions:
  - `bugfix with a symptom is quick`: `routeCheck('bugfix', 'cart total throws on an empty cart').path === 'quick'`.
  - `bugfix with no symptom is full`: `routeCheck('bugfix', 'make the cart nicer')` is `full`, reasons `['no symptom named']`.
  - `refactor with no new behaviour is quick`; `routeCheck('refactor', 'extract price formatting into a helper').path === 'quick'`.
  - `refactor mentioning new behaviour is full`: `'extract a helper and add currency support'` → `full`, reasons `['mentions new behaviour: add']`.
  - `feature and chore are always full`, including `routeCheck('feature', 'add a retry when the API throws')`.
  - `unknown type is full`: `routeCheck('spike', 'x throws')`; and `noRoute` forces full on an otherwise quick bugfix.
  - `long request is full`: a 601 character bugfix request containing `throws`.
  - `upper case symptom matches`: `'CART THROWS ON EMPTY'` bugfix → quick.
  - `hostile text is data`: CLI run `sdlc(repo, ['route-check', 'bugfix', 'it throws `touch pwned` $(touch pwned2)'])` exits 0, stdout matches `/^route: quick/`, and neither `pwned` nor `pwned2` exists in the repo.
  - `usage failure`: `sdlc(repo, ['route-check', 'bugfix'])` and `sdlc(repo, ['route-check', 'bugfix', '  '])` have non-zero `code` and stderr matching `/usage: route-check/`.
  - `--json prints the Route`: `JSON.parse(stdout).path === 'quick'` for the throws case.
- [ ] **Step 2: Run to verify it fails.** Run: `node --disable-warning=ExperimentalWarning --test scripts/route.spec.ts`. Expected: FAIL (module `./route.ts` not found).
- [ ] **Step 3: Implement `routeCheck` and `cmdRouteCheck`** in `scripts/route.ts` with the rules above, importing `TYPES` from `./lifecycle.ts`. Keep the two regexes as named constants at the top; use `out`/`fail` the way `scripts/risk.ts` does. Register in `scripts/sdlc.ts`.
- [ ] **Step 4: Run to verify it passes.** Run: `node --disable-warning=ExperimentalWarning --test scripts/route.spec.ts`. Expected: all pass.
- [ ] **Step 5: Typecheck.** Run: `npm run typecheck`. Expected: exit 0.
- [ ] **Step 6: Commit.** `git add scripts/route.ts scripts/route.spec.ts scripts/sdlc.ts` then `git commit -m "feat(route): route-check narrows a request to the quick or full start path"`.

### Task 2: Wire the quick path into `/rig:start`

**Files:**
- Modify: `skills/start/SKILL.md` (frontmatter `argument-hint`, step 1, step 2)
- Test: `scripts/routeskill.spec.ts`

**Interfaces:**
- Consumes: `S route-check <type> "<request>" [--no-route]` from Task 1; its first output line is `route: quick` or `route: full`.

Edits to the skill (small, total at most 12 added lines):
- `argument-hint`: add `[--no-route]` after `[--full]`.
- Step 1: `--no-route` is stripped from the request like `--full`. After the type is picked, and only when the request is free text (not an existing slug, not a charted intent, not `--from-diff`, not `--full`), run `S route-check <type> "<request>"` (add `--no-route` when given) as its own Bash call, then tell the person in one line: `Routed as <type>, path <quick|full> (<first reason>). Say "full" to take the full conversation.` If they say full, rerun with `--no-route`.
- Step 2: add a branch before the `settled:` handling: `route: quick` skips the `superpowers:brainstorming` call and the `AskUserQuestion` batch and goes to step 3. `spec.md` is seeded from the request: for `bugfix`, `B1` says the named symptom no longer occurs (one behaviour per further symptom the request names); for `refactor`, each behaviour is written `unchanged: <what>` and `## Blast radius` names the existing tests that guard it. Ask a question only if `## Open questions` would otherwise be non-empty. `route: full` or no route line changes nothing.

- [ ] **Step 1: Write the failing test** `scripts/routeskill.spec.ts`: read `skills/start/SKILL.md` and assert `argument-hint` contains `--no-route`; the text contains `route-check`; it contains a sentence that `route: quick` skips `superpowers:brainstorming`; the file is at most its current line count plus 12 (hard-code the current count read at implementation time). Mirror how `scripts/chartskill.spec.ts` reads and asserts skill text.
- [ ] **Step 2: Run to verify it fails.** Run: `node --disable-warning=ExperimentalWarning --test scripts/routeskill.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Edit `skills/start/SKILL.md`** as described, keeping the existing wording elsewhere unchanged.
- [ ] **Step 4: Run to verify it passes.** Same command. Expected: PASS.
- [ ] **Step 5: Validate the plugin.** Run: `npm run validate`. Expected: exit 0.
- [ ] **Step 6: Commit.** `git add skills/start/SKILL.md scripts/routeskill.spec.ts` then `git commit -m "feat(start): quick path for a clear bugfix or refactor request"`.

### Task 3: Labelled-request corpus

**Files:**
- Create: `eval/fixtures/route/requests.json`
- Modify: `scripts/route.spec.ts` (add the corpus test)

**Interfaces:**
- `requests.json` is an array of `{ "type": "feature"|"bugfix"|"refactor"|"chore", "request": string, "expect": "quick"|"full" }`, 15 entries at least: 5 bugfix (3 expect `quick`, 2 vague expect `full`), 5 refactor (3 `quick`, 2 that sneak in new behaviour, `full`), 5 feature or chore (all `full`). Requests are realistic one or two sentence asks about a small cart or shop module.

- [ ] **Step 1: Write the failing test** `corpus: no labelled-full request routes quick, and at least 80% of labelled-quick requests do` in `scripts/route.spec.ts`: load the JSON, route each, assert zero false-quick (hard) and the quick recall at least 0.8; on failure print the offending entries.
- [ ] **Step 2: Run to verify it fails.** Run: `node --disable-warning=ExperimentalWarning --test scripts/route.spec.ts`. Expected: FAIL (file missing).
- [ ] **Step 3: Write `requests.json`**, then adjust the Task 1 regexes only if a quick-labelled entry fails for a reason that is a real gap, never by editing an `expect` to fit.
- [ ] **Step 4: Run the full suite once.** Run: `npm test`. Expected: exit 0; quote the tail. Then `npm run typecheck`, expected exit 0.
- [ ] **Step 5: Commit.** `git add eval/fixtures/route/requests.json scripts/route.spec.ts` then `git commit -m "test(route): labelled request corpus guards false-quick"`.

---

## Self-Review

- **Spec coverage:** classification and narrowing (Task 1), announcement and override and `--no-route` (Task 2), paths per type (Task 2; weight untouched so `S weight` decides for bugs), default to full on doubt (Task 1 rules), measurement (Task 3, with the live dollars arm deferred per the spec's revisions). Open questions all decided.
- **Type consistency:** `routeCheck`, `Route`, `cmdRouteCheck`, `route-check` and `--no-route` are spelled the same in every task.
- **Proportion:** three tasks, about 90 lines of code expected against a 140 line spec.

## Execution

Recommend **Native** (`superpowers:executing-plans`, inline): three small dependent tasks, the interface is one function, and `CLAUDE.md` caps a change at 4 subagent launches. Then one Opus review of `git diff main...HEAD`.
