# U0 `ui` eval variant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the eval variant `ui` (B20 endpoint, B21 screen, traps `error` and `field`) on the built `hard` shop, scored by a real browser.

**Architecture:** A self-contained module `eval/variants/ui.mjs` shaped like `eval/variants/knex.mjs` (`TASKS`, `TRAP_TEST`, `TRAP_WORDS`, `BARE_PROMPT`, `PHASES`, `setupBare`, `setupRig`, `dryBare`, `checks`, `score`). Its base is the `hard` shop with B1 to B19 built (`hardBase` plus `hardOverlay` in `eval/setup.mjs`). Hidden checks run in child processes, one per trap, and write their verdict to a harness-named file, as `eval/variants/hard.mjs:174-196` does. Playwright lives outside the repo.

**Tech Stack:** Node ESM (`.mjs`), `node:test`, Playwright with Chromium in `~/.cache/rig-eval/playwright`.

**Spec:** `docs/superpowers/specs/2026-11-14-u0-ui-task-design.md`

## Global Constraints

- Only `eval/` changes. Nothing in `scripts/`, `skills/`, `hooks/`, `package.json`.
- Each file at most 500 lines.
- Playwright is never added to `package.json` or to a sandbox.
- No issue or prompt text contains a word of `TRAP_WORDS`; a spec checks it.
- Never run `npm test`, the e2e tests or any eval script. Run `node --disable-warning=ExperimentalWarning --test eval/ui.test.mjs eval/browser.test.mjs`, `npm run typecheck` and `npm run test:changed`.
- Verdicts come from files the harness names; nothing model-reachable prints one.

## Review Focus

- A customer name with a space or `%20` in the URL (`/ui/customers/Ada%20Lovelace`): the ref page and endpoint decode it once.
- A customer name containing `<` or `&`: the ref page escapes it, in the table and in the alert.
- An order with two lines: both product names and quantities show, in order.
- Playwright missing: the browser specs skip with the reason, and `checks()` reports each trap as `check crashed: browser unavailable`, not as escaped.
- A slip that fixes one trap must not fix the other (the two slips differ in exactly one behaviour).

---

### Task 1: Browser helper and one-time setup

**Files:**
- Create: `eval/lib/browser.mjs`, `eval/setup-browser.mjs`
- Test: `eval/browser.test.mjs`

**Interfaces:**
- Produces: `export const CACHE: string` (`~/.cache/rig-eval/playwright`), `export function browserAvailable(): true | string` (true, or the reason), `export async function withPage(fn: (page) => Promise<T>): Promise<T>` (launches headless Chromium from the cache, one page, always closes).

- [ ] **Step 1: Write the failing spec** in `eval/browser.test.mjs`: `browserAvailable returns the reason when the cache is missing` (point `CACHE` at an empty temp dir through an env override `RIG_EVAL_BROWSER_CACHE`; assert the string mentions `setup-browser`); `withPage opens a data: page and reads its title` (skipped with the reason when `browserAvailable() !== true`).
- [ ] **Step 2: Run it:** `node --disable-warning=ExperimentalWarning --test eval/browser.test.mjs`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `eval/lib/browser.mjs`. `browserAvailable` checks that `<CACHE>/node_modules/playwright` and a Chromium build exist. `withPage` imports Playwright by absolute path from `CACHE` with `createRequire`.
- [ ] **Step 4: Implement** `eval/setup-browser.mjs`: `npm init -y` and `npm install playwright@1.49.1` in `CACHE`, then `npx playwright install chromium` there. Idempotent. A person runs it; the implementer runs it once to be able to check Task 2.
- [ ] **Step 5: Run the spec.** Expected: PASS (the second test passes or skips with a reason).
- [ ] **Step 6: Commit** `eval: ui browser helper and one-time Playwright setup`.

### Task 2: Reference, slips, issue text and hidden checks

**Files:**
- Create: `eval/variants/ui/tasks/ui.md`, `eval/variants/ui/patches/ref.patch`, `eval/variants/ui/patches/error.slip.patch`, `eval/variants/ui/patches/field.slip.patch`, `eval/variants/ui/checks.mjs`
- Test: `eval/ui.test.mjs` (created here, extended in Task 3)

**Interfaces:**
- Consumes: `withPage` and `browserAvailable` (Task 1); `start`, `stop` from `tests/e2e/fixtures/tooling/scripts/contract.mjs`, as `hard.mjs:14` does; the built hard shop (`eval/variants/hard/fixtures`, `eval/variants/hard/seed`).
- Produces: `export const CHECKS: { trap: 'error' | 'field', run(repo: string): Promise<{ basic: true | string, trap: true | string }> }[]`.

Reference behaviour, pinned by the spec:
- **B20** `GET /customers/<name>/orders`: 200 `{ customer, orders }`, newest first by `placedAt`, each order `{ id, status, placedAt, payableCents, lines: [{ sku, qty }] }`. A customer with no orders is 404 `{ error }`.
- **B21** `/ui/customers/<name>`: an HTML table, one row per order: the id, the status, the placed date, the total in dollars with B16 half-up rounding, and for each line the product **name** from `GET /products` and the quantity. The reference may render on the server or in the browser.

- [ ] **Step 1: Write the failing specs** in `eval/ui.test.mjs`, each skipped with the reason when `browserAvailable() !== true`. Build a repo from the hard base (the way `hard.test.mjs:21-30` does) with `ref.patch` applied:
  - `ui ref passes both traps and both basics`: `checks` returns `{ basic: true, trap: true }` for `error` and `field`.
  - `ui error slip passes npm test and fails only the error trap`.
  - `ui field slip passes npm test and fails only the field trap`.
  - Hidden-check expectations: *error* (basic: the page for `ada` has at least one `tbody tr`) (trap: for `nobody` the page has an element with `role="alert"` containing the endpoint's error text and zero `tbody tr`); *field* (basic: the page for `ada` shows the order id) (trap: the line cell for a `TEA-001` line contains `Green tea` and does not contain `TEA-001`).
- [ ] **Step 2: Run:** `node --disable-warning=ExperimentalWarning --test eval/ui.test.mjs`. Expected: FAIL, patches and checks missing.
- [ ] **Step 3: Write `ref.patch`** (a `git diff` against the built hard shop: route, page, a test `test/customer-orders.test.js` for B20 and `test/customer-page.test.js` for B21, openapi path for B20 in `api/openapi.yaml` if the hard seed has one). Write the two slips as patches of the reference: `error.slip.patch` renders the 404 body as a list (blank table, no alert); `field.slip.patch` shows the sku instead of the name. Each slip keeps its own unit tests passing.
- [ ] **Step 4: Write `eval/variants/ui/checks.mjs`** exporting `CHECKS`. Each check seeds `$ORDERS_FILE` (as `hard.mjs:90-95`), starts the repo's server with `start`, drives one page with `withPage`, always `stop`s in `finally`.
- [ ] **Step 5: Write `tasks/ui.md`:** a title line, then the issue wording for B20 and B21 as in the spec. It says the screen "shows what the endpoint answers" and does not name a trap word. Run the specs. Expected: PASS.
- [ ] **Step 6: Commit** `eval: ui reference, slips, issue text and hidden browser checks`.

### Task 3: The variant module and its wiring

**Files:**
- Create: `eval/variants/ui.mjs`
- Modify: `eval/setup.mjs` (imports near `:13-18`, `setupBare` near `:73-74`, `setupRig` near `:101-102`, `dryBare` near `:125-126`), `eval/run.mjs` (`:25-41` phases, `:45` bare prompt map, `:124` variant list and its error text), `eval/score.mjs` (`:84-85`, one line like knex's)
- Test: `eval/ui.test.mjs`

**Interfaces:**
- Consumes: `CHECKS` (Task 2); the hard-shop builder from `setup.mjs`, passed in as `base: (sb) => void`, so `ui.mjs` does not import `setup.mjs` (no import cycle).
- Produces from `ui.mjs`: `TASKS = ['ui']`; `TRAP_TEST = { error: 'test/customer-page.test.js', field: 'test/customer-page.test.js' }`; `TRAPS = ['error', 'field']`; `TRAP_WORDS: string[]`; `BARE_PROMPT: string`; `PHASES: [U20, U21]` shaped like `PHASE_S15` in `hard.mjs:51-54` (U20 builds B20 with `test/customer-orders.test.js`, U21 builds B21 and depends on U20); `setupBare(sb, { dry, base })`, `setupRig(sb, { dry, registry, base })`, `dryBare(sb, { base })` (base, then `ref.patch`), `checks(repo, { timeoutMs, tmp }) -> { traps, basic, failures }`, `score(sb, { timeoutMs, runBounded, tamper }) -> { checks, of, accepted, npmTest, traps, trapFailures, escaped, missing, layerViolations: null, tamper }`.

- [ ] **Step 1: Write the failing specs** in `eval/ui.test.mjs`, all runnable without a browser:
  - `ui phases are U20 then U21`: `phasesFor('ui').map(p => p.id)` equals `['U20', 'U21']`.
  - `no ui prompt or issue contains a trap word`: over `BARE_PROMPT`, both phase prompts and `tasks/ui.md`, case-insensitive.
  - `ui bare dry run lands the hard base plus the reference` (files `src/http/handler.js` and `test/customer-page.test.js` exist; `test/refund.test.js` exists too).
  - `ui score marks a trap missing, not escaped, when its basic behaviour failed` (stub `checks` through a module-level seam, or use the browser-free branch: a repo with no `test/customer-page.test.js`).
  - `the variant flag accepts ui`: `run.mjs`'s guard no longer rejects `--variant ui`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement `ui.mjs`** as specified above, following `knex.mjs` for `runChild`, `checks` and `score`. A trap is missing when its test file is absent or its basic result is not true; `escaped` is null when `npm test` fails. When `browserAvailable() !== true`, every check returns `check crashed: browser unavailable (run eval/setup-browser.mjs)`.
- [ ] **Step 4: Wire it.** In `setup.mjs` pass `base = sb => { hardBase(sb); hardOverlay(sb) }` for `variant === 'ui'` in the three functions; export `BARE_PROMPT as BARE_PROMPT_UI`. In `run.mjs` add `PHASES.ui`, the `ui` entry of `barePrompt`, and `ui` to the variant list and message. In `score.mjs` add the `ui` branch above the `hard` line.
- [ ] **Step 5: Run:** `node --disable-warning=ExperimentalWarning --test eval/ui.test.mjs eval/browser.test.mjs`, then `npm run typecheck`, then `npm run test:changed`. Expected: all pass; the browser specs pass or skip with the reason.
- [ ] **Step 6: Commit** `eval: ui variant (B20 endpoint, B21 screen, traps error and field), rig-on arms`.
- [ ] **Step 7: Note for the person** (not run here): `node eval/setup-browser.mjs` once, then `node eval/run.mjs --arms sonnet-rig-on,haiku-rig-on --runs 3 --variant ui` (about $2 to $4).
