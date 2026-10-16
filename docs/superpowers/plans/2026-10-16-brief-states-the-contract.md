# The brief states everything the hidden acceptance checks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every arm's score depends on the brief, not on guessing. The shop brief (`tests/e2e/prd/shop-brief.md`) states every fact the hidden acceptance (`tests/e2e/acceptance/shop.mjs`, `shop-http.mjs`) checks, and a spec keeps the two in step.

**Architecture:** One spec, `eval/brief.test.mjs`:
1. It extracts every failure message the two acceptance files can return.
2. It maps each one to the brief statement that makes it fair (a table of regexes).
3. It fails when a message has no entry, or when the brief does not match the entry.

The brief's Interfaces section is then rewritten to state the shapes, formats, defaults, rounding, error messages and status codes that the acceptance already checks. Brief behaviours and headings stay as they are, so S1, the scripted e2e and the dry eval are unaffected. The fixture shop already behaves this way.

**Tech Stack:** Node 22 ESM, `node:test`; markdown.

**Spec:** `docs/superpowers/specs/2026-10-16-behavioural-harness-design.md` §9 ("Task: the shop brief, scored by the hidden acceptance suite"), §6 (the brief's headings; non-goals as prohibitions), §10.2.

**Evidence:**
- `eval/results/2026-10-16-pilot.md` and `-pilot2.md`: every arm, Opus included, passed its own `npm test` and failed the hidden acceptance on unstated details;
- 4 of 5 arms answered `GET /products` with `{"products": [...]}`;
- 2 arms accepted `tea` as a SKU.

## Global Constraints

- The hidden acceptance stays hidden: the brief states *what* must hold, never the acceptance's test values (no "2550 → 2295").
- The brief keeps its seven headings (`templates/brief.md`; S1 checks them) and its six behaviours B1–B6 with the same numbers.
- The fixture shop (`tests/e2e/fixtures/shop`, `remove`) must satisfy every new sentence. If one does not, the sentence is wrong, not the fixture.
- No change to `scripts/`. Never run rig checks on this repo.
- Spending money is the person's decision: the pilot re-run at the end needs their go-ahead.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisions

1. **The acceptance checks nothing the brief does not state.** It is not loosened to fit the models: the pilot shows the models answer the question the brief asks, so the brief asks the whole question.
2. **Error messages are part of the contract.** The import acceptance matches `invalid sku`, `unknown sku`, `unknown discount` and `empty`, so the brief names those messages.
3. **The traceability spec reads the acceptance files.** A new acceptance check without a brief entry fails the spec, so the gap cannot open again. Wrapper messages are skipped: `${p}: ${r}`, `regression before remove: …` and `acceptance child exited …` only carry another message.
4. **Template messages are keyed by their literal text.** Each `${…}` is replaced by `…`; for example `GET /products: … …`.

## Review Focus

1. **A brief sentence the fixture does not meet** (a wrong message, shape or status). Expect the scripted e2e (whose hidden acceptance runs on the fixture) and the dry eval to fail. Pinned in Task 1, Step 4: `npm test` and `npm run eval:dry` must pass.
2. **A brief that leaks test values.** Expect no acceptance number (2550, 2295, 2100, 1890, 900, 1200) and no test SKU-quantity pair in the brief, beyond the seeded catalog already there. Pinned in Task 1: "the brief states rules, not the acceptance's numbers".
3. **An acceptance message added later without a brief entry.** Expect the spec to fail and name it. Pinned in Task 1: "every failure the hidden acceptance can report is stated in the brief".
4. **Live S2/S3 specs drifting from the richer brief.** The scripted `PHASE.spec` text stays as is (behaviours unchanged). No test is needed: S2 and S3 trace only to B-numbers.
5. **The bare prompt and the rig brief diverging.** Both read the same file (`setupBare` copies it to `BRIEF.md`; S1 writes it to `.rig/product/brief.md`). Pinned by the existing setup; nothing new.

---

### Task 1: The traceability spec and the brief's Interfaces

**Files:**
- Create: `eval/brief.test.mjs`
- Modify: `tests/e2e/prd/shop-brief.md` (the `## Interfaces` section only)

- [ ] **Step 1: Write the failing tests** in `eval/brief.test.mjs`:

```js
// The hidden acceptance may check only what the brief states (spec §9): every failure it can report maps to a brief statement.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const E2E = path.resolve(import.meta.dirname, '../tests/e2e')
const brief = fs.readFileSync(path.join(E2E, 'prd/shop-brief.md'), 'utf8')
const read = f => fs.readFileSync(path.join(E2E, 'acceptance', f), 'utf8')

// Each acceptance failure message (template parts as …) → the brief statement that makes the check fair.
const FACTS = {
  // shop.mjs (import)
  'catalog accepted a bad SKU': /three capital letters, a hyphen and three digits[^\n]*`invalid sku: <sku>`/,
  'catalog accepted a non-positive price': /`priceCents` must be a positive integer/,
  'subtotal …, want 2550 (FR-2)': /`subtotalCents\(\)` is the sum of `qty × unitCents`/,
  'cart accepted an unknown SKU': /`unknown sku: <sku>`/,
  'cart accepted qty 0': /`qty` defaults to 1 and must be a positive integer/,
  'SAVE10 on 2550 did not total 2295 (FR-3)': /`SAVE10` takes 10% off and `SAVE20` 20%; `discountCents` is rounded to the nearest cent/,
  'unknown discount code accepted': /`unknown discount code: <code>`/,
  'empty checkout accepted': /`cart is empty`/,
  'GET /products not 200 (FR-4)': /`GET \/products` → 200/,
  'POST /cart not 201': /`POST \/cart` with `\{ sku, qty \}` → 201/,
  'handler checkout total wrong': /`POST \/checkout` with `\{ code \}` \(optional\) → 201 with the order/,
  'unknown SKU not 400': /any error → 400 with `\{ error: <message> \}`/,
  'unknown path not 404': /unknown path → 404/,
  'runtime dependencies declared (NFR-2)': /No runtime dependencies/,
  'Cart.remove is not implemented': /`remove\(sku\)` deletes the whole line/,
  'after remove: …, subtotal …': /`remove\(sku\)` deletes the whole line/,
  'removing an absent SKU did not throw': /throws when the SKU is not in the cart/,
  'DELETE /cart/MUG-002 gave …, want 200': /`DELETE \/cart\/<sku>` → 200 with the remaining lines/,
  'DELETE of an absent SKU did not give 400': /`DELETE \/cart\/<sku>`[^\n]*400 when the SKU is not in the cart/,
  // shop-http.mjs (HTTP)
  'checkout of an empty cart was not 400': /any error → 400/,
  'GET /products: … …': /`GET \/products` → 200 with the products as a bare JSON array/,
  'POST /cart TEA-001 x2 not 201': /`POST \/cart` with `\{ sku, qty \}` → 201 with the cart lines/,
  'POST /cart MUG-002 not 201': /`POST \/cart` with `\{ sku, qty \}` → 201/,
  'unknown discount code not 400': /any error → 400/,
  'SAVE10 on 2100: … …, want total 1890': /the order `\{ lines, subtotalCents, discountCents, totalCents \}`/,
  'runtime dependencies declared': /No runtime dependencies/,
  'DELETE /cart/TEA-001: … …': /`DELETE \/cart\/<sku>` → 200 with the remaining lines as a JSON array/,
  'checkout after delete: …, want total 1200': /one cart per running server/,
}
const WRAPPERS = /^(?:…: …|regression before remove: …|acceptance child exited …)/

const messages = () => ['shop.mjs', 'shop-http.mjs'].flatMap(f => [...read(f).matchAll(/(?:return|\|\|) (['`])((?:(?!\1).)+)\1/g)].map(m => m[2].replace(/\$\{[^}]*\}/g, '…')))
  .filter(m => !WRAPPERS.test(m))

test('every failure the hidden acceptance can report is stated in the brief', () => {
  const ms = messages()
  assert.ok(ms.length >= 28, `${ms.length} messages`)
  for (const m of ms) {
    assert.ok(FACTS[m], `acceptance message with no brief entry: "${m}"`)
    assert.match(brief, FACTS[m], `the brief does not state what "${m}" checks`)
  }
})

test('the brief states rules, not the acceptance\'s numbers', () => {
  // The seeded catalog prices are part of the product; the acceptance's totals and subtotals are not.
  const rest = brief.replace('MUG-002 (Mug, 1200)', '')
  for (const n of ['2550', '2295', '2100', '1890', '900', '1200', '810']) assert.doesNotMatch(rest, new RegExp(`\\b${n}\\b`), n)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test eval/brief.test.mjs`
Expected: the first test FAILS on its first message, `the brief does not state what "catalog accepted a bad SKU" checks`. The second passes, which pins the guard.

- [ ] **Step 3: Rewrite the brief's `## Interfaces` section** to this. Everything else in the brief is unchanged.

```markdown
## Interfaces

Modules (every arm builds these paths):
- `src/catalog/products.js` exports `Catalog`. `add({ sku, name, priceCents })`: a SKU is three capital letters, a hyphen and three digits (`TEA-001`); anything else throws `invalid sku: <sku>`. `priceCents` must be a positive integer, or `add` throws. `get(sku)` returns the product or `null`; `list()` returns every product as `{ sku, name, priceCents }`.
- `src/cart/cart.js` exports `Cart`, constructed with a catalog. `add(sku, qty)`: `qty` defaults to 1 and must be a positive integer; a SKU not in the catalog throws `unknown sku: <sku>`; adding a SKU again adds to its quantity. `lines()` returns one `{ sku, qty, unitCents }` per SKU, priced from the catalog. `subtotalCents()` is the sum of `qty × unitCents`. `remove(sku)` deletes the whole line and throws when the SKU is not in the cart.
- `src/orders/orders.js` exports `checkout(cart, { code })`. It returns the order `{ lines, subtotalCents, discountCents, totalCents }` and does not change the cart. No code means no discount; `SAVE10` takes 10% off and `SAVE20` 20%; `discountCents` is rounded to the nearest cent and `totalCents = subtotalCents − discountCents`. Any other code throws `unknown discount code: <code>`; an empty cart throws `cart is empty`.
- `src/http/handler.js` exports `createHandler(catalog)`, which returns a synchronous `handle({ method, path, body })` returning `{ status, body }`, with one cart per handler:
  - `GET /products` → 200 with the products as a bare JSON array (`[{ sku, name, priceCents }]`, not wrapped in an object);
  - `POST /cart` with `{ sku, qty }` → 201 with the cart lines as a JSON array;
  - `DELETE /cart/<sku>` → 200 with the remaining lines as a JSON array; 400 when the SKU is not in the cart;
  - `POST /checkout` with `{ code }` (optional) → 201 with the order;
  - any error → 400 with `{ error: <message> }`; an unknown path → 404.
- `src/server.js`: `npm start` serves the handler over `node:http` on `$PORT` (0 picks a free port), prints `listening on <port>`, keeps one cart per running server, and seeds the catalog with TEA-001 (Green tea, 450) and MUG-002 (Mug, 1200). Request and response bodies are JSON.
- The HTTP contract is `api/openapi.yaml` with examples in `contracts/examples/`.
```

Keep `No runtime dependencies` in Context, where it already is. Check that `## Architecture` still names `src/server.js`, and leave it as is.

- [ ] **Step 4: Run the tests, the whole suite and the dry eval**

Run: `node --test eval/brief.test.mjs`
Expected: PASS, 2/2. If an entry does not match, fix the brief wording, never the FACTS regex, unless the regex misreads a sentence that does state the fact. Record any regex change as a ruling.

Run: `npm test` and `npm run eval:dry`
Expected: exit 0. S1 3/3, because the headings are unchanged and B1 and B6 are still untested at S1. S0–S5 are unchanged; the hidden acceptance runs on the fixture, which meets every sentence. All five dry arms are accepted 3/3.

- [ ] **Step 5: Commit**

```bash
git add eval/brief.test.mjs tests/e2e/prd/shop-brief.md
git commit -m "fix(eval): the brief states everything the hidden acceptance checks, and a spec keeps them in step"
```

---

### Task 2: Verify, review, and pilot 3 (paid; the person decides)

- [ ] Run `npm test`, `npm run typecheck` and `npm run eval:dry`, and quote the results.
- [ ] Launch one reviewer (Opus, as for the earlier steps) on `git diff main...HEAD`, with this plan and the Review Focus verbatim. Fix every Critical and Important finding in one pass, each with a test that fails first.
- [ ] **Ask the person** before pilot 3: `npm run eval -- --arms all --runs 1 --cap-total 10 --out <scratchpad>/pilot3 --results <scratchpad>/pilot3.jsonl`, about $2. Expect the scores to move off 1/3. A remaining acceptance failure should now be a real miss against a stated rule, and the report says which rule.
- [ ] After a pilot the person approved, commit its results as `eval/results/<date>-pilot3.{jsonl,md}` with a short note comparing it to pilot 2. Then the full pass (`--runs 10`, about $25 at pilot prices) is the person's call. Merge only when the person asks.
