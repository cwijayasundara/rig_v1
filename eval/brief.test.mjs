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
  'subtotal …, want … (FR-2)': /`subtotalCents\(\)` is the sum of `qty × unitCents`/,
  'cart accepted an unknown SKU': /`unknown sku: <sku>`/,
  'cart accepted qty 0': /`qty` defaults to 1 and must be a positive integer/,
  'SAVE10 on … did not total … (FR-3)': /`SAVE10` takes 10% off and `SAVE20` 20%; `discountCents` is rounded to the nearest cent/,
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
  'DELETE of an absent SKU not 400': /`DELETE \/cart\/<sku>`[^\n]*400 when the SKU is not in the cart/,
}
const WRAPPERS = /^(?:…: …|regression before remove: …|acceptance child exited …: …)$/

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

test('final review: every FACTS entry is still used by some acceptance message', () => {
  const ms = new Set(messages())
  assert.deepEqual(Object.keys(FACTS).filter(k => !ms.has(k)), [])
})

// Checks that fail by throwing (a crash), not by returning a message, depend on these call shapes being stated.
const CALL_SHAPES = {
  'checkout(new Cart(catalog)) with no options': /`checkout\(cart, \{ code \} = \{\}\)`/,
  'h = createHandler(catalog); h({ ... })': /returns the function `handle\(\{ method, path, body \}\)` itself/,
  'createHandler(catalog) with a catalog the caller filled': /uses the catalog it is given and adds no products of its own/,
  'GET and DELETE requests carry no body': /a request with no body counts as `\{\}`/,
}

test('final review: the call shapes the acceptance relies on, which fail by crashing, are stated', () => {
  for (const [use, re] of Object.entries(CALL_SHAPES)) assert.match(brief, re, use)
})

test('final review: the brief reads as a product brief, not as a trial', () => {
  assert.doesNotMatch(brief, /\barm\b|\beval\b|hidden|acceptance/i)
})

import { briefFor } from './variants/links.mjs'

test('the links variant adds B7 to the interfaces, the behaviours and the tests, and leaves B1–B6 alone', () => {
  const base = fs.readFileSync(path.resolve(import.meta.dirname, '../tests/e2e/prd/shop-brief.md'), 'utf8')
  const v = briefFor(base)
  assert.match(v, /GET \/products\/<sku>[\s\S]*built by the same function the handler's/)
  assert.match(v, /- B6: [^\n]*\n- B7: GET \/products\/<sku>/)
  assert.match(v, /B7: unit tests in test\/links\.test\.js/)
  for (const b of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']) assert.ok(v.includes(`- ${b}:`), b)
})

import { briefFor as rulesBriefFor } from './variants/rules.mjs'

const rulesBase = fs.readFileSync(path.join(E2E, 'prd/shop-brief.md'), 'utf8')
const rulesBrief = rulesBriefFor(rulesBase)

// The rules variant's hidden acceptance (eval/variants/rules.mjs): every message it can report → the brief statement behind it.
const RULES_FACTS = {
  'get did not return the stock the product was added with': /`get` and `list` return it as `stock` when it is set/,
  'an order for more than the stock did not fail with insufficient stock: <sku>': /the whole order fails with `insufficient stock: <sku>`/,
  'a failed order changed the stock or the cart': /nothing is reserved, and the stock and the cart are unchanged/,
  'a line of exactly 10 was rejected': /\(exactly 10 is allowed\)/,
  'a line of 11 did not fail with quantity over limit: <sku>': /a line with `qty` over 10 fails with `quantity over limit: <sku>`/,
  'a line over both the stock and the limit did not fail with the stock check first': /applies these rules in this order\. \(1\) Stock:[\s\S]*\(2\) Line limit:/,
  'an order of exactly 5000 cents did not get a 500 cent discount': /5000 or more \(exactly 5000 qualifies\), `discountCents` is 10%/,
  'an order under 5000 cents got a discount': /when no code is given and `subtotalCents` is 5000 or more/,
  'a 5005 cent order got discountCents …, not rounded half up': /rounded half up to whole cents/,
  'two lines totalling 6000 cents, each under 5000, did not get a 600 cent discount on the order': /10% of the order's subtotal \(not per line\)/,
  'a successful checkout did not reduce the stock': /A successful checkout reduces each line's product stock by its `qty`/,
  'adding a SKU already in the cart did not replace its quantity': /From B9 on, adding a SKU already in the cart replaces its quantity with the new `qty` \(still one line per SKU\)/,
}

test('every failure the rules acceptance can report is stated in the rules brief', () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, 'variants/rules.mjs'), 'utf8')
  const ms = [...src.matchAll(/(?:return|\|\|) (['`])((?:(?!\1).)+)\1/g)].map(m => m[2].replace(/\$\{[^}]*\}/g, '…')).filter(m => m !== 'check crashed: …' && !/^rules acceptance/.test(m))
  assert.ok(ms.length >= 12, `${ms.length} messages`)
  for (const m of ms) {
    assert.ok(RULES_FACTS[m], `rules acceptance message with no brief entry: "${m}"`)
    assert.match(rulesBrief, RULES_FACTS[m], `the brief does not state what "${m}" checks`)
  }
  assert.deepEqual(Object.keys(RULES_FACTS).filter(k => !ms.includes(k)), [])
})

test('the rules variant starts from the links brief, adds B8 and B9, keeps the old re-add sentence, and reads as a product brief', () => {
  assert.ok(rulesBrief.startsWith(briefFor(rulesBase).slice(0, 200)))
  assert.match(rulesBrief, /adding a SKU again adds to its quantity\. From B9 on/)
  assert.match(rulesBrief, /- B7: [^\n]*\n- B8: [^\n]*\n- B9: [^\n]*\n/)
  assert.match(rulesBrief, /B8–B9: unit tests in test\/rules\.test\.js/)
  assert.match(rulesBrief, /optional `stock` \(a non-negative integer; omitted means unlimited\)/)
  for (const b of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7']) assert.ok(rulesBrief.includes(`- ${b}:`), b)
  assert.doesNotMatch(rulesBrief, /\barm\b|\beval\b|hidden|acceptance/i)
})
